// ========================================
// ASISTENTE DE IA (vía Cloudflare Worker + Groq) — módulo central.
// Centraliza TODA la comunicación con el modelo de IA. Las funciones de búsqueda
// intensiva (generar criterios, variar consultas, filtrar por relevancia) lo
// reutilizan, para no duplicar la lógica de red ni los prompts.
//
// El Worker (myworker.joelpasapera101.workers.dev) guarda las claves de Groq en
// secreto y rota entre ellas. Aquí solo enviamos los mensajes y recibimos texto.
// ========================================

const IAAsistente = {

    // URL del Worker propio (proxy seguro a Groq). Si cambias de dominio o Worker,
    // actualiza solo esta línea.
    WORKER_URL: 'https://myworker.joelpasapera101.workers.dev',

    // Tiempo máximo de espera por respuesta (la IA puede tardar unos segundos).
    TIMEOUT_MS: 45000,

    // ¿Está configurado el asistente? (por si se quiere ocultar la UI sin Worker).
    disponible() {
        return typeof this.WORKER_URL === 'string' && this.WORKER_URL.startsWith('http');
    },

    // ---- Llamada base al modelo ----
    // messages: [{role:'system'|'user'|'assistant', content:'...'}]
    // opciones: { temperature, max_tokens, response_format }
    // Devuelve el TEXTO de la respuesta, o lanza Error con mensaje claro.
    async chat(messages, opciones = {}) {
        if (!this.disponible()) throw new Error('El asistente de IA no está configurado.');
        if (!Array.isArray(messages) || !messages.length) throw new Error('No hay mensajes que enviar.');

        const cuerpo = { messages };
        if (typeof opciones.temperature === 'number') cuerpo.temperature = opciones.temperature;
        if (typeof opciones.max_tokens === 'number') cuerpo.max_tokens = opciones.max_tokens;
        if (opciones.response_format) cuerpo.response_format = opciones.response_format;

        // Timeout con AbortController (si el Worker o Groq tardan demasiado).
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), this.TIMEOUT_MS);
        let r;
        try {
            r = await fetch(this.WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cuerpo),
                signal: ctrl.signal
            });
        } catch (e) {
            clearTimeout(t);
            if (e.name === 'AbortError') throw new Error('La IA tardó demasiado en responder. Inténtalo de nuevo.');
            throw new Error('No se pudo conectar con el asistente de IA. Revisa tu conexión.');
        }
        clearTimeout(t);

        // Parsear la respuesta del Worker.
        let data;
        try { data = await r.json(); } catch (e) { throw new Error('El asistente devolvió una respuesta no válida.'); }

        if (!r.ok || data.error) {
            // El Worker informa errores con {error:'...'}. Traducir los comunes.
            const msg = data.error || `Error ${r.status}`;
            if (/cuota|429|rate/i.test(msg)) throw new Error('Se agotó temporalmente la cuota de IA. Inténtalo en unos minutos.');
            if (/origen|403/i.test(msg)) throw new Error('Esta página no está autorizada para usar el asistente de IA.');
            throw new Error(`El asistente de IA falló: ${msg}`);
        }

        const texto = (data.texto || '').trim();
        return texto; // puede venir vacío; quien llama decide si reintenta
    },

    // Llama a chat() reintentando si la respuesta viene vacía (el modelo gpt-oss
    // a veces gasta los tokens razonando y devuelve vacío; reintentar lo resuelve).
    async chatConReintento(messages, opciones = {}, intentos = 3) {
        let ultimo = '';
        for (let i = 0; i < intentos; i++) {
            ultimo = await this.chat(messages, opciones);
            if (ultimo && ultimo.trim()) return ultimo;
            // Espera breve antes de reintentar (da margen y rota de clave por tiempo).
            await new Promise(r => setTimeout(r, 400));
        }
        throw new Error('La IA devolvió una respuesta vacía tras varios intentos. Inténtalo de nuevo en un momento.');
    },

    // ============================================================
    // FUNCIÓN 1 (Sesión 1): generar criterios de inclusión/exclusión
    // ============================================================
    // A partir del problema de investigación, redacta criterios de selección de
    // artículos. Devuelve el texto formateado (editable por el usuario).
    async generarCriterios(problema) {
        const p = String(problema || '').trim();
        if (p.length < 15) throw new Error('Describe primero el problema de investigación (al menos una frase completa).');

        // El año actual se CALCULA aquí (el modelo no lo sabe con certeza). Se le
        // pasa explícitamente para que la ventana temporal sea correcta.
        const anioActual = new Date().getFullYear();
        const anioDesde = anioActual - 5; // recomendación habitual: últimos 5 años

        const system = 'Eres un metodólogo experto en revisiones sistemáticas de literatura científica, '
            + 'especializado en psicología y ciencias sociales. Redactas criterios de selección de estudios '
            + 'claros, aplicables y NO excesivamente restrictivos: el objetivo es reunir la mejor evidencia '
            + 'disponible, no descartar estudios valiosos. Respondes en español, conciso y estructurado.';

        const user = `A partir del siguiente problema de investigación, redacta los criterios de INCLUSIÓN y `
            + `EXCLUSIÓN para seleccionar artículos científicos en una revisión de antecedentes.\n\n`
            + `DATO IMPORTANTE: el año actual es ${anioActual}. La ventana temporal recomendada es de los `
            + `últimos 5 años, es decir, desde ${anioDesde} hasta ${anioActual} (AMBOS INCLUIDOS). No uses `
            + `ningún otro año como límite; usa exactamente ${anioDesde}–${anioActual}.\n\n`
            + `PRINCIPIOS para los criterios (síguelos con cuidado):\n`
            + `- INCLUSIÓN: define la población/variables/diseño de forma que capture la evidencia relevante. `
            + `Si el problema menciona una población concreta, céntrate en ella, pero permite estudios que `
            + `aporten al tema aunque sean en poblaciones cercanas si son pertinentes.\n`
            + `- EXCLUSIÓN: sé MÍNIMO y prudente. NO excluyas por defecto otras poblaciones, otros idiomas, `
            + `diseños cualitativos, revisiones, meta-análisis ni tesis: todos pueden aportar. Excluye solo lo `
            + `que de verdad no sirve: trabajos sin datos o metodología verificable, duplicados, o claramente `
            + `fuera de la ventana temporal (${anioDesde}–${anioActual}).\n`
            + `- INCLUYE SIEMPRE un criterio de exclusión por DISTANCIA TEMÁTICA, pero formulado como un FILTRO `
            + `GRUESO: descartar únicamente los estudios que NO traten ninguna de las variables o constructos `
            + `centrales del problema, es decir, los que pertenecen a un campo claramente ajeno. Por ejemplo, si `
            + `el tema trata sobre inteligencia emocional e inteligencia cognitiva, se descartarían estudios `
            + `centrados solo en temas sin conexión (p. ej. inteligencia artificial, diabetes u otras áreas no `
            + `relacionadas). PERO este criterio NO debe descartar estudios muy específicos que SÍ pertenecen al `
            + `tema, como los que abordan una sola de las variables o una de sus dimensiones o subdimensiones: `
            + `esos se conservan, porque cuando la evidencia es escasa (temas novedosos o poco estudiados) los `
            + `estudios parciales o tangenciales dentro del tema son valiosos. Redacta este criterio dejando `
            + `clara esa diferencia: fuera del tema = descartar; dentro del tema aunque sea específico = conservar.\n`
            + `- Para el idioma: si procede, prioriza español e inglés en INCLUSIÓN, pero NO conviertas eso en `
            + `una exclusión tajante de otros idiomas (la evidencia internacional cuenta).\n\n`
            + `Devuelve EXACTAMENTE dos secciones con estos encabezados literales:\n`
            + `CRITERIOS DE INCLUSIÓN:\n`
            + `(viñetas con "- ")\n\n`
            + `CRITERIOS DE EXCLUSIÓN:\n`
            + `(viñetas con "- ")\n\n`
            + `Sé específico y conciso (4 a 6 viñetas por sección). No añadas introducción ni cierre.\n\n`
            + `PROBLEMA DE INVESTIGACIÓN:\n${p}`;

        return await this.chatConReintento(
            [{ role: 'system', content: system }, { role: 'user', content: user }],
            { temperature: 0.4, max_tokens: 4000 } // 4000 deja margen bajo el límite de 8000 tokens/min del plan gratuito de Groq
        );
    },

    // ============================================================
    // FUNCIÓN 2 (Sesión 2): generar variantes de la consulta
    // ============================================================
    // A partir de la consulta original, genera N frases de búsqueda alternativas
    // que exploran las dimensiones/sinónimos del tema sin perder el foco. Devuelve
    // un ARRAY de strings (las variantes), ya limpias. La consulta original NO se
    // incluye (el llamador la añade aparte si quiere buscarla también).
    async generarVariantes(consulta, cantidad = 5) {
        const q = String(consulta || '').trim();
        if (q.length < 3) throw new Error('Escribe primero los términos de búsqueda.');
        const n = Math.max(2, Math.min(12, parseInt(cantidad, 10) || 5)); // entre 2 y 12

        const system = 'Eres un experto en recuperación de información académica y revisiones '
            + 'sistemáticas. Generas frases de búsqueda alternativas para bases de datos científicas, '
            + 'maximizando la cobertura sin perder el foco temático. Conoces la sinonimia y las dimensiones '
            + 'teóricas de los constructos en psicología y ciencias sociales.';

        const user = `Genera EXACTAMENTE ${n} frases de búsqueda alternativas a la siguiente consulta, para `
            + `encontrar más artículos relevantes en bases académicas.

`
            + `Reglas:
`
            + `- Identifica las variables/constructos principales y reformúlalos con sinónimos y términos `
            + `técnicos equivalentes.
`
            + `- Considera dimensiones o subcategorías de esas variables (sin desviarte del tema central).
`
            + `- Cada frase debe ser una consulta de búsqueda (palabras clave), NO una pregunta ni una oración larga.
`
            + `- Varía el enfoque entre frases, pero todas deben mantener el foco del tema original.
`
            + `- Responde SOLO con las ${n} frases, una por línea, sin numeración, sin viñetas, sin comillas, `
            + `sin texto adicional.

`
            + `CONSULTA ORIGINAL:
${q}`;

        const texto = await this.chatConReintento(
            [{ role: 'system', content: system }, { role: 'user', content: user }],
            { temperature: 0.8, max_tokens: 4000 } // 4000 deja margen bajo el límite de 8000 tokens/min del plan gratuito de Groq
        );

        // Parsear: una variante por línea. Limpiar numeración/viñetas/comillas residuales.
        const variantes = texto.split(/\r?\n/)
            .map(l => l.replace(/^\s*(?:\d+[.)\-]\s*|[-*•]\s*)/, '').replace(/^["'«»]|["'«»]$/g, '').trim())
            .filter(l => l.length > 2)
            // Descartar una variante idéntica a la consulta original (sin distinguir may/min).
            .filter(l => l.toLowerCase() !== q.toLowerCase());

        // Deduplicar variantes entre sí.
        const vistas = new Set();
        const unicas = variantes.filter(v => { const k = v.toLowerCase(); if (vistas.has(k)) return false; vistas.add(k); return true; });

        if (!unicas.length) throw new Error('La IA no devolvió variantes válidas. Inténtalo de nuevo.');
        return unicas.slice(0, n);
    }
};

if (typeof window !== 'undefined') window.IAAsistente = IAAsistente;
