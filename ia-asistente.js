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

    // Modelo potente para tareas de razonamiento (evaluación de relevancia).
    // El Worker lo tiene en su lista blanca de modelos permitidos.
    MODELO_POTENTE: 'openai/gpt-oss-120b',

    // ¿Está configurado el asistente? (por si se quiere ocultar la UI sin Worker).
    disponible() {
        return typeof this.WORKER_URL === 'string' && this.WORKER_URL.startsWith('http');
    },

    _numClavesCache: null,

    // Pregunta al Worker cuántas claves hay configuradas (GET). Así los canales
    // del filtrado paralelo se dimensionan SOLOS: si mañana añades GROQ_KEY_11..20
    // en Cloudflare, la app usará más canales sin tocar código. Con caché por
    // sesión y fallback conservador si el GET falla (p. ej. Worker sin actualizar).
    async numClaves() {
        if (this._numClavesCache) return this._numClavesCache;
        try {
            const r = await fetch(this.WORKER_URL, { method: 'GET' });
            const d = await r.json();
            if (d && Number.isInteger(d.claves) && d.claves > 0) {
                this._numClavesCache = d.claves;
                return d.claves;
            }
        } catch (e) { /* Worker viejo o red caída: usar fallback */ }
        this._numClavesCache = 7; // fallback conservador
        return 7;
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
        if (opciones.model) cuerpo.model = opciones.model; // modelo específico (p. ej. 120b para relevancia)
        if (Number.isInteger(opciones.keyHint)) cuerpo.keyHint = opciones.keyHint; // canal: dirige qué clave usa el Worker

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
    },

    // ============================================================
    // FUNCIÓN 4 (Redactor A): extraer las VARIABLES del problema
    // ============================================================
    // Lee el problema de investigación y propone las variables de estudio con
    // una definición conceptual breve. Devuelve [{nombre, definicion}].
    async extraerVariables(problema) {
        const p = String(problema || '').trim();
        if (p.length < 15) throw new Error('Describe primero el problema de investigación.');

        const system = 'Eres un metodólogo experto en psicología. Identificas las variables de estudio '
            + 'de un problema de investigación y las defines conceptualmente con precisión académica. '
            + 'Respondes ÚNICAMENTE en JSON válido.';
        const user = `Identifica las VARIABLES DE ESTUDIO del siguiente problema de investigación `
            + `(normalmente 2, a veces 1 o 3). Para cada una da su nombre técnico y una definición `
            + `conceptual breve (1-2 frases, sin citas).\n\n`
            + `Responde SOLO con: {"variables": [{"nombre": "...", "definicion": "..."}]}\n\n`
            + `PROBLEMA:\n${p}`;

        const texto = await this.chatConReintento(
            [{ role: 'system', content: system }, { role: 'user', content: user }],
            { temperature: 0.3, max_tokens: 1500, response_format: { type: 'json_object' } }, 3);

        let data;
        try { data = JSON.parse(texto.replace(/```json|```/g, '').trim()); }
        catch (e) {
            const m = texto.match(/\{[\s\S]*\}/);
            if (m) { try { data = JSON.parse(m[0]); } catch (e2) { throw new Error('La IA no devolvió variables válidas.'); } }
            else throw new Error('La IA no devolvió variables válidas.');
        }
        const vars = (data && Array.isArray(data.variables)) ? data.variables : [];
        const limpias = vars.filter(v => v && v.nombre).map(v => ({
            nombre: String(v.nombre).trim(),
            definicion: String(v.definicion || '').trim()
        }));
        if (!limpias.length) throw new Error('No se identificaron variables. Revisa el problema de investigación.');
        return limpias;
    },

    // ============================================================
    // FUNCIÓN 5 (Redactor A): redactar UNA sección del marco teórico
    // ============================================================
    // spec = { titulo, instrucciones, problema, variablesTexto,
    //          fuentes: [{cita, ref, titulo, anio, resumen}], keyHint }
    // ANTI-ALUCINACIÓN: el modelo solo puede citar las fuentes listadas, con la
    // cita corta EXACTA que le damos ya construida. Textuales solo desde los
    // resúmenes. Si las fuentes no cubren algo, debe declararlo, no inventarlo.
    async redactarSeccion(spec) {
        const fuentes = (spec.fuentes || []).slice(0, 20); // tope por límite de tokens/minuto
        if (!fuentes.length) throw new Error('No hay fuentes disponibles para redactar esta sección.');

        const listado = fuentes.map((f, i) =>
            `[F${i + 1}] CITA EXACTA A USAR: ${f.cita}\n`
            + `      Título: ${f.titulo || '(sin título)'} (${f.anio || 's. f.'})\n`
            + `      RESUMEN: ${(f.resumen || '(sin resumen)').slice(0, 450)}`
        ).join('\n\n');

        const system = 'Eres un redactor académico experto en tesis de psicología (español formal, normas '
            + 'APA 7). REGLAS ESTRICTAS E INVIOLABLES: (1) SOLO puedes citar las fuentes de la lista '
            + 'proporcionada, usando EXACTAMENTE la "CITA EXACTA A USAR" de cada una (formato narrativo o '
            + 'parentético); está PROHIBIDO mencionar autores, años o estudios que no estén en la lista. '
            + '(2) Las citas textuales (entre comillas) solo pueden ser frases copiadas LITERALMENTE de los '
            + 'RESÚMENES dados; si no hay frase literal útil, parafrasea. (3) REGLA DE ORO (inviolable): TODA idea lleva cita. Cada afirmación conceptual o empírica debe '
            + 'llevar su cita, y CADA PÁRRAFO debe contener al menos una cita (parentética o narrativa); si un párrafo no puede sustentarse en las fuentes proporcionadas, NO lo escribas. (4) Si las fuentes no cubren un punto, dilo brevemente ("la evidencia '
            + 'disponible no aborda...") en lugar de inventar. (5) NO escribas la lista de referencias al '
            + 'final (se ensambla aparte). (6) Redacta con densidad académica, sin relleno ni repeticiones. '
            + '(7) No uses viñetas: prosa académica en párrafos.';

        const user = `PROBLEMA DE INVESTIGACIÓN:\n${spec.problema}\n\n`
            + `VARIABLES DE ESTUDIO:\n${spec.variablesTexto}\n\n`
            + `FUENTES DISPONIBLES (las ÚNICAS que puedes citar):\n${listado}\n\n`
            + `TAREA: redacta la sección «${spec.titulo}» del marco teórico.\n${spec.instrucciones}\n\n`
            + `Extensión: desarrolla con amplitud y profundidad lo que las fuentes permitan sustentar. `
            + `Empieza directamente con el texto (sin repetir el título).`;

        return await this.chatConReintento(
            [{ role: 'system', content: system }, { role: 'user', content: user }],
            // Entrada ~20 fuentes ≈ 4200 tokens + 3200 declarados ≈ 7400 < 8000 TPM/org.
            { temperature: 0.4, max_tokens: 3200, model: this.MODELO_POTENTE, keyHint: spec.keyHint }, 3);
    },

    // ============================================================
    // FUNCIÓN 3 (Sesión 3): evaluar la RELEVANCIA de un lote de artículos
    // ============================================================
    // Recibe los criterios (texto), un array de artículos {idx, titulo, resumen}
    // (MÁXIMO ~10 por lote: 1 lote = 1 clave = 1 organización), y el keyHint
    // (nº de canal: dirige qué clave del Worker atiende este lote, para que los
    // lotes paralelos usen claves DISTINTAS). Devuelve [{idx, puntua 1-5, motivo}].
    // Usa el modelo POTENTE (120b) y JSON mode para respuestas estructuradas.
    //
    // Escala: 5 muy relevante · 4 relevante · 3 moderada (una variable/dimensión)
    //         · 2 poco relevante (tangencial) · 1 no relevante (fuera del tema).
    async evaluarLoteRelevancia(criterios, articulos, keyHint) {
        if (!Array.isArray(articulos) || !articulos.length) return [];
        const crit = String(criterios || '').trim();

        const system = 'Eres un revisor sistemático experto en psicología y ciencias sociales. Evalúas la '
            + 'relevancia de artículos para un problema de investigación, según unos criterios dados. Eres '
            + 'riguroso pero NO excesivamente restrictivo: un estudio específico que aborda una sola variable '
            + 'o una dimensión del tema SIGUE siendo relevante (puntúa 3), porque cuando la evidencia es escasa '
            + 'esos estudios aportan. Solo lo que pertenece a un campo claramente ajeno es no relevante (1). '
            + 'Respondes ÚNICAMENTE en JSON válido, sin texto adicional.';

        // Lista de artículos numerados para el prompt (resumen recortado: controla tokens).
        const listado = articulos.map((a, i) => {
            const resumen = (a.resumen || '').slice(0, 600);
            return `[${i}] TÍTULO: ${a.titulo || '(sin título)'}\n    RESUMEN: ${resumen || '(sin resumen disponible)'}`;
        }).join('\n\n');

        const user = `CRITERIOS DE SELECCIÓN (inclusión/exclusión):\n${crit || '(no se proporcionaron; evalúa por afinidad temática general)'}\n\n`
            + `Evalúa la relevancia de CADA uno de los siguientes ${articulos.length} artículos para el tema, `
            + `según los criterios. Asigna a cada uno:\n`
            + `- "puntua": entero del 1 al 5 (5=muy relevante, aborda directamente el tema; 4=relevante; `
            + `3=moderada, aborda una variable o dimensión del tema; 2=poco relevante, tangencial; `
            + `1=no relevante, de un campo ajeno).\n`
            + `- "motivo": justificación BREVE (máximo 15 palabras) de por qué esa puntuación.\n\n`
            + `Recuerda: un estudio específico DENTRO del tema (una variable, una dimensión) es al menos 3. `
            + `Solo lo claramente ajeno al tema es 1.\n\n`
            + `ARTÍCULOS:\n${listado}\n\n`
            + `Responde SOLO con un objeto JSON con esta forma exacta:\n`
            + `{"evaluaciones": [{"i": 0, "puntua": 4, "motivo": "..."}, {"i": 1, "puntua": 2, "motivo": "..."}, ...]}\n`
            + `Incluye los ${articulos.length} artículos (índices 0 a ${articulos.length - 1}).`;

        const texto = await this.chatConReintento(
            [{ role: 'system', content: system }, { role: 'user', content: user }],
            // max_tokens 3000: entrada de 10 refs (~3000-3500) + 3000 declarados ≈ 6500,
            // con margen bajo el límite de 8000 tokens/minuto de cada organización.
            { temperature: 0.2, max_tokens: 3000, model: this.MODELO_POTENTE, response_format: { type: 'json_object' }, keyHint },
            3
        );

        // Parsear el JSON (tolerante a ```json o texto alrededor).
        let data;
        try {
            const limpio = texto.replace(/```json|```/g, '').trim();
            data = JSON.parse(limpio);
        } catch (e) {
            const m = texto.match(/\{[\s\S]*\}/);
            if (m) { try { data = JSON.parse(m[0]); } catch (e2) { throw new Error('La IA no devolvió una evaluación válida.'); } }
            else throw new Error('La IA no devolvió una evaluación válida.');
        }

        const evals = (data && Array.isArray(data.evaluaciones)) ? data.evaluaciones : [];
        // Mapear de vuelta a los artículos originales por su idx real.
        return articulos.map((a, i) => {
            const ev = evals.find(e => e.i === i) || {};
            let puntua = parseInt(ev.puntua, 10);
            if (!(puntua >= 1 && puntua <= 5)) puntua = 0; // 0 = no evaluado
            return { idx: a.idx, puntua, motivo: (ev.motivo || '').toString().slice(0, 120) };
        });
    }
};

if (typeof window !== 'undefined') window.IAAsistente = IAAsistente;
