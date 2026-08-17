// ========================================
// ASISTENTE DE IA (vía Cloudflare Workers) — módulo central.
// Centraliza TODA la comunicación con los modelos de IA.
//
// DOS PROVEEDORES, SEPARADOS POR TAREA:
//   · Worker Groq   → criterios, variantes y filtrado de relevancia.
//   · Worker Gemini → redacción del marco teórico e identificación de variables
//     (tareas de redacción científica larga: contexto y salida más generosos).
//
// Cada Worker guarda sus claves en secretos de Cloudflare y rota entre ellas.
// Aquí solo enviamos los mensajes (con keyHint para dirigir el canal) y
// recibimos texto. La interfaz {messages → {texto}} es idéntica en ambos.
// ========================================
const IAAsistente = {
    // URL del Worker de Groq (criterios / variantes / relevancia).
    WORKER_URL: 'https://myworker.joelpasapera101.workers.dev',
    // URL del Worker de Gemini (redacción del marco teórico). AJUSTA esta línea
    // con la URL real de tu Worker nuevo (p. ej. https://redactor-gemini.<tu-cuenta>.workers.dev).
    WORKER_REDACTOR_URL: 'https://redactor-gemini.joelpasapera101.workers.dev',
    TIMEOUT_MS: 90000, // la redacción larga con Gemini puede tardar más que Groq
    // Máximo de fuentes POR LLAMADA de redacción. No es un límite del corpus:
    // el plan del redactor crea tantas partes como haga falta (ceil(total/MAX))
    // para cubrir TODAS las fuentes equitativamente. Este techo protege la
    // CALIDAD de la síntesis (2-5 ejes de 6-12 fuentes) y la cuota por request.
    MAX_FUENTES_SECCION: 32,
    // Modelo potente de Groq para tareas de razonamiento (relevancia).
    MODELO_POTENTE: 'openai/gpt-oss-120b',
    disponible() {
        return typeof this.WORKER_URL === 'string' && this.WORKER_URL.startsWith('http');
    },
    _numClavesCache: null,
    _numClavesRedactorCache: null,
    // ¿Cuántas claves tiene el Worker de Groq? (canales del filtrado paralelo).
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
        this._numClavesCache = 7;
        return 7;
    },
    // ¿Cuántas claves tiene el Worker de Gemini? (canales del redactor). Misma
    // filosofía auto-escalable: añade GEMINI_KEY_N en Cloudflare y listo.
    async numClavesRedactor() {
        if (this._numClavesRedactorCache) return this._numClavesRedactorCache;
        try {
            const r = await fetch(this.WORKER_REDACTOR_URL, { method: 'GET' });
            const d = await r.json();
            if (d && Number.isInteger(d.claves) && d.claves > 0) {
                this._numClavesRedactorCache = d.claves;
                return d.claves;
            }
        } catch (e) { /* Worker aún no desplegado: fallback */ }
        this._numClavesRedactorCache = 3;
        return 3;
    },
    // ---- Llamada base al modelo ----
    // messages: [{role:'system'|'user'|'assistant', content:'...'}]
    // opciones: { temperature, max_tokens, response_format, model, keyHint,
    //             worker: URL del Worker a usar (por defecto, el de Groq) }
    async chat(messages, opciones = {}) {
        if (!this.disponible()) throw new Error('El asistente de IA no está configurado.');
        if (!Array.isArray(messages) || !messages.length) throw new Error('No hay mensajes que enviar.');
        const url = opciones.worker || this.WORKER_URL;
        const cuerpo = { messages };
        if (typeof opciones.temperature === 'number') cuerpo.temperature = opciones.temperature;
        if (typeof opciones.max_tokens === 'number') cuerpo.max_tokens = opciones.max_tokens;
        if (opciones.response_format) cuerpo.response_format = opciones.response_format;
        if (opciones.model) cuerpo.model = opciones.model;
        if (Number.isInteger(opciones.keyHint)) cuerpo.keyHint = opciones.keyHint;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), this.TIMEOUT_MS);
        let r;
        try {
            r = await fetch(url, {
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
        let data;
        try { data = await r.json(); } catch (e) { throw new Error('El asistente devolvió una respuesta no válida.'); }
        if (!r.ok || data.error) {
            const msg = data.error || `Error ${r.status}`;
            if (/cuota|429|rate/i.test(msg)) throw new Error('Se agotó temporalmente la cuota de IA. Inténtalo en unos minutos.');
            if (/origen|403/i.test(msg)) throw new Error('Esta página no está autorizada para usar el asistente de IA.');
            throw new Error(`El asistente de IA falló: ${msg}`);
        }
        return (data.texto || '').trim();
    },
    async chatConReintento(messages, opciones = {}, intentos = 3) {
        let ultimo = '';
        for (let i = 0; i < intentos; i++) {
            ultimo = await this.chat(messages, opciones);
            if (ultimo && ultimo.trim()) return ultimo;
            await new Promise(r => setTimeout(r, 400));
        }
        throw new Error('La IA devolvió una respuesta vacía tras varios intentos. Inténtalo de nuevo en un momento.');
    },
    // ============================================================
    // FUNCIÓN 1: generar criterios de inclusión/exclusión (Groq)
    // ============================================================
    async generarCriterios(problema) {
        const p = String(problema || '').trim();
        if (p.length < 15) throw new Error('Describe primero el problema de investigación (al menos una frase completa).');
        const anioActual = new Date().getFullYear();
        const anioDesde = anioActual - 5;
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
            { temperature: 0.4, max_tokens: 4000 }
        );
    },
    // ============================================================
    // FUNCIÓN 2: generar variantes de la consulta (Groq)
    // ============================================================
    async generarVariantes(consulta, cantidad = 5) {
        const q = String(consulta || '').trim();
        if (q.length < 3) throw new Error('Escribe primero los términos de búsqueda.');
        const n = Math.max(2, Math.min(12, parseInt(cantidad, 10) || 5));
        const system = 'Eres un experto en recuperación de información académica y revisiones '
            + 'sistemáticas. Generas frases de búsqueda alternativas para bases de datos científicas, '
            + 'maximizando la cobertura sin perder el foco temático. Conoces la sinonimia y las dimensiones '
            + 'teóricas de los constructos en psicología y ciencias sociales.';
        const user = `Genera EXACTAMENTE ${n} ecuaciones de búsqueda alternativas a la consulta dada, para `
            + `bases académicas de salud y psicología. Cada una debe seguir una ESTRATEGIA metodológica `
            + `DISTINTA, como haría un metodólogo de revisiones sistemáticas:\n`
            + `1) Terminología técnica de tesauro: los términos tipo DeCS/MeSH de los constructos.\n`
            + `2) Sinónimos del constructo Y de la población (p. ej. adolescentes → jóvenes, estudiantes de secundaria).\n`
            + `3) Operadores: truncamiento con * y alternativas con OR entre paréntesis, p. ej. (ansiedad OR estrés) AND adolesc*.\n`
            + `4) Constructos o marcos teóricos estrechamente relacionados (sin cambiar de tema).\n`
            + `5) Instrumentos de medición típicos de esas variables (p. ej. TMMS-24, STAI, PHQ-9), si existen.\n`
            + `Si se piden más de 5, combina estrategias SIN repetir la misma jugada con otras palabras.\n`
            + `Reglas de salida:\n`
            + `- Cada línea es una consulta de palabras clave, NO una pregunta ni una oración larga.\n`
            + `- Prohibido el parafraseo trivial (cambiar una palabra por su sinónimo obvio y nada más).\n`
            + `- Mantén SIEMPRE el foco del tema original.\n`
            + `- Responde SOLO con las ${n} líneas, sin numeración, sin viñetas, sin comillas, sin texto adicional.\n`
            + `CONSULTA ORIGINAL:\n${q}`;
        const texto = await this.chatConReintento(
            [{ role: 'system', content: system }, { role: 'user', content: user }],
            { temperature: 0.6, max_tokens: 4000 }
        );
        const variantes = texto.split(/\r?\n/)
            .map(l => l.replace(/^\s*(?:\d+[.)\-]\s*|[-*•]\s*)/, '').replace(/^["'«»]|["'«»]$/g, '').trim())
            .filter(l => l.length > 2)
            .filter(l => l.toLowerCase() !== q.toLowerCase());
        const vistas = new Set();
        const unicas = variantes.filter(v => { const k = v.toLowerCase(); if (vistas.has(k)) return false; vistas.add(k); return true; });
        if (!unicas.length) throw new Error('La IA no devolvió variantes válidas. Inténtalo de nuevo.');
        return unicas.slice(0, n);
    },
    // ============================================================
    // FUNCIÓN 4 (Redactor): extraer las VARIABLES del problema (Gemini)
    // ============================================================
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
            { temperature: 0.3, max_tokens: 1500, response_format: { type: 'json_object' },
              worker: this.WORKER_REDACTOR_URL }, 3);
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
    // FUNCIÓN 5 (Redactor): redactar UNA sección del marco teórico (Gemini)
    // ============================================================
    // ANTI-ALUCINACIÓN: solo cita las fuentes listadas, con la cita corta EXACTA
    // ya construida; textuales solo desde los resúmenes.
    // SÍNTESIS CIENTÍFICA: el texto se organiza por IDEAS, no por autores — la
    // diferencia entre una matriz de revisión y un marco teórico de verdad.
    async redactarSeccion(spec) {
        // El techo por llamada es configurable (MAX_FUENTES_SECCION): el plan
        // del redactor reparte el corpus completo en tantas partes como haga
        // falta, así que ninguna fuente queda fuera por este recorte.
        const fuentes = (spec.fuentes || []).slice(0, this.MAX_FUENTES_SECCION);
        if (!fuentes.length) throw new Error('No hay fuentes disponibles para redactar esta sección.');
        const listado = fuentes.map((f, i) =>
            `[F${i + 1}] CITA EXACTA A USAR: ${f.cita}\n`
            + `      Título: ${f.titulo || '(sin título)'} (${f.anio || 's. f.'})\n`
            + `      RESUMEN: ${(f.resumen || '(sin resumen)').slice(0, 700)}`
        ).join('\n\n');
        const system = 'Eres un investigador senior que redacta marcos teóricos con nivel de publicación '
            + 'científica (español formal, normas APA 7).\n\n'
            + '== REGLAS ANTI-ALUCINACIÓN (INVIOLABLES) ==\n'
            + '(1) SOLO puedes citar las fuentes de la lista proporcionada, usando EXACTAMENTE la "CITA '
            + 'EXACTA A USAR" de cada una (en forma narrativa o parentética); está PROHIBIDO mencionar '
            + 'autores, años o estudios que no estén en la lista. (2) Las citas textuales (entre comillas) '
            + 'solo pueden ser frases copiadas LITERALMENTE de los RESÚMENES dados; si no hay frase literal '
            + 'útil, parafrasea. (3) REGLA DE ORO: toda idea lleva cita; cada párrafo contiene al menos una '
            + 'cita; si un párrafo no puede sustentarse en las fuentes, NO lo escribas. (4) Si las fuentes '
            + 'no cubren un punto, dilo brevemente ("la evidencia disponible no aborda…") en lugar de '
            + 'inventar. (5) NO escribas la lista de referencias al final. (6) Sin viñetas: prosa académica.\n\n'
            + '== REGLAS DE SÍNTESIS CIENTÍFICA (LA DIFERENCIA ENTRE UNA MATRIZ Y UN MARCO TEÓRICO) ==\n'
            + '(A) ORGANIZA POR EJES TEMÁTICOS, JAMÁS POR AUTORES. El protagonista de cada párrafo es una '
            + 'IDEA (un hallazgo del conjunto de la evidencia, una convergencia, una controversia), nunca un '
            + 'estudio individual. Estructura de cada párrafo: idea central → explicación → evidencia '
            + 'integrada de VARIOS estudios → matices o divergencias → microconclusión.\n'
            + '(B) PROHIBIDO EL PATRÓN FICHA: nunca escribas secuencias tipo "X et al. (año) realizaron un '
            + 'estudio con el objetivo de… en una muestra de… encontrando que…" repetidas autor tras autor. '
            + 'Los datos de muestra, instrumento o diseño solo se mencionan cuando SON el argumento (por '
            + 'ejemplo, para explicar por qué dos estudios divergen).\n'
            + '(C) CITAS AGRUPADAS: cuando varios estudios sostienen la misma idea, preséntala UNA vez y '
            + 'agrupa sus citas al final del enunciado: "(Autor1, año; Autor2, año; Autor3, año)". Regla de '
            + 'compresión: varios estudios por párrafo; NUNCA un-estudio-un-párrafo.\n'
            + '(D) DIÁLOGO OBLIGATORIO ENTRE ESTUDIOS: en cada sección incluye al menos una comparación '
            + 'explícita del tipo "los hallazgos de X coinciden con los de Y en…; sin embargo, mientras X '
            + 'enfatiza…, Y se centra en…, lo que sugiere que…". Señala convergencias, divergencias y vacíos '
            + 'del conjunto.\n'
            + '(E) EJEMPLO DEL ESTILO EXIGIDO — Forma INCORRECTA (matriz): "Pérez (2021) encontró que correr '
            + 'mejora la salud cardiovascular. Gómez (2022) encontró que caminar mejora la presión arterial. '
            + 'Ruiz (2023) encontró que la bicicleta reduce el colesterol." Forma CORRECTA (síntesis): "La '
            + 'evidencia reciente coincide en señalar que la práctica regular de ejercicio físico produce '
            + 'beneficios cardiovasculares consistentes, incluyendo mejoras en la presión arterial, el perfil '
            + 'lipídico y la capacidad cardiorrespiratoria (Pérez, 2021; Gómez, 2022; Ruiz, 2023)." Escribe '
            + 'SIEMPRE en la forma correcta.\n'
            + '(F) CIERRE CON SENTIDO: cada eje temático termina conectando lo que el conjunto de la '
            + 'evidencia permite concluir — y, cuando corresponda, el vacío o inconsistencia que justifica '
            + 'nuevas investigaciones.';
        const user = `PROBLEMA DE INVESTIGACIÓN:\n${spec.problema}\n\n`
            + `VARIABLES DE ESTUDIO:\n${spec.variablesTexto}\n\n`
            + `FUENTES DISPONIBLES (las ÚNICAS que puedes citar):\n${listado}\n\n`
            + `TAREA: redacta la sección «${spec.titulo}» del marco teórico.\n${spec.instrucciones}\n\n`
            + `ANTES DE ESCRIBIR: agrupa mentalmente las fuentes en 2-5 ejes temáticos según lo que sus `
            + `resúmenes evidencian (convergencias, divergencias, poblaciones o niveles de análisis); luego `
            + `redacta un desarrollo por eje siguiendo las reglas de síntesis. Cubre TODAS las fuentes de la `
            + `lista, pero repartidas dentro de los ejes (agrupadas por idea), nunca en fila india.\n\n`
            + `Extensión: desarrolla con amplitud y profundidad lo que las fuentes permitan sustentar. `
            + `Empieza directamente con el texto (sin repetir el título).`;
        return await this.chatConReintento(
            [{ role: 'system', content: system }, { role: 'user', content: user }],
            { temperature: 0.45, max_tokens: 8000, keyHint: spec.keyHint,
              worker: this.WORKER_REDACTOR_URL }, 3);
    },
    // ============================================================
    // FUNCIÓN 3: evaluar la RELEVANCIA de un lote de artículos (Groq)
    // ============================================================
    async evaluarLoteRelevancia(criterios, articulos, keyHint) {
        if (!Array.isArray(articulos) || !articulos.length) return [];
        const crit = String(criterios || '').trim();
        const system = 'Eres un revisor sistemático experto en psicología y ciencias sociales. Evalúas la '
            + 'relevancia de artículos para un problema de investigación, según unos criterios dados. Eres '
            + 'riguroso pero NO excesivamente restrictivo: un estudio específico que aborda una sola variable '
            + 'o una dimensión del tema SIGUE siendo relevante (puntúa 3), porque cuando la evidencia es escasa '
            + 'esos estudios aportan. Solo lo que pertenece a un campo claramente ajeno es no relevante (1). '
            + 'Respondes ÚNICAMENTE en JSON válido, sin texto adicional.';
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
            { temperature: 0.2, max_tokens: 3000, model: this.MODELO_POTENTE, response_format: { type: 'json_object' }, keyHint },
            3
        );
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
        return articulos.map((a, i) => {
            const ev = evals.find(e => e.i === i) || {};
            let puntua = parseInt(ev.puntua, 10);
            if (!(puntua >= 1 && puntua <= 5)) puntua = 0;
            return { idx: a.idx, puntua, motivo: (ev.motivo || '').toString().slice(0, 120) };
        });
    }
};
if (typeof window !== 'undefined') window.IAAsistente = IAAsistente;
