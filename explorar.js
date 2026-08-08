// ========================================
// EXPLORAR — Descubrimiento de problemáticas latentes (Fase 1).
// GAP ANALYSIS: cruza el interés MEDIÁTICO reciente (GDELT: noticias globales,
// últimos 3 meses, CORS abierto y sin clave) con la producción ACADÉMICA
// reciente (OpenAlex: conteo de los últimos 5 años) por subtema.
//   Índice de brecha = noticias / (académicos + 1)
// Mucho ruido mediático + poca academia reciente = 🔥 problemática latente.
// El índice es un RANKING RELATIVO entre los temas explorados (orientativo,
// no una verdad absoluta): la decisión final es del investigador y su asesor.
// ========================================
const Explorar = {
    ANIOS_ACADEMICOS: 5,
    // Medios internacionales de prestigio + organismos (ONU, UNICEF, OMS/OPS):
    // GDELT permite filtrar la medición a estos dominios con domainis:.
    DOMINIOS_REF: ['bbc.com','reuters.com','apnews.com','nytimes.com','theguardian.com','elpais.com','dw.com','france24.com','aljazeera.com','cnn.com','news.un.org','un.org','unicef.org','who.int','paho.org','reliefweb.int'],
    MIN_NOTICIAS_LATENTE: 20, // sin un mínimo de ruido real no hay "latencia"
    _resultados: [],
    montar() {
        if (document.getElementById('expBuscar')) return; // ya montado
        // La pestaña y la sección viven ESTÁTICAS en el index.html (aparición
        // instantánea y navegación por app.js, igual que las demás secciones).
        // Este módulo SOLO rellena el contenido dentro de #seccionExplorar;
        // NUNCA inyecta pestañas ni secciones (así es imposible duplicarlas).
        const slot = document.getElementById('seccionExplorar');
        if (!slot) {
            console.warn('Explorador: falta <div id="seccionExplorar"> en el index (dentro de <section id="explorador">).');
            return;
        }
        slot.innerHTML = `
            <div class="card">
              <div class="form-group">
                <label class="label" for="expTema">Área o tema semilla</label>
                <input type="text" id="expTema" class="input" placeholder="Ej: salud mental en adolescentes, tecnoestrés laboral, apuestas en línea…">
                <div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-top:0.5rem;" id="expChips"></div>
              </div>
              <div style="display:flex; gap:0.8rem; flex-wrap:wrap; align-items:center;">
                <button id="expBuscar" class="btn btn-primary" style="padding:0.45rem 1.1rem;">🔭 Explorar brechas</button>
                <label style="font-size:0.9em; display:flex; align-items:center; gap:0.35rem;" title="Cuántos subtemas se miden (~4-5 s cada uno, y cada fila aparece al completarse). Con 1, se mide TU tema tal cual, sin expansión de la IA. Con 3 o más, el semáforo compara entre sí (terciles).">
                  N° de subtemas <input type="number" id="expNum" class="input input-sm" min="1" max="50" value="8" style="width:64px;">
                </label>
                <label style="font-size:0.9em; display:flex; align-items:center; gap:0.35rem;">
                  <input type="checkbox" id="expEspanol" checked style="width:auto; margin:0;"> Solo noticias en español
                </label>
                <label style="font-size:0.9em; display:flex; align-items:center; gap:0.35rem;" title="Mide también cuántas noticias del subtema aparecen en prensa internacional de referencia y organismos (BBC, Reuters, El País, DW… y ONU, UNICEF, OMS/OPS, ReliefWeb). Esta medición es global (sin filtro de idioma).">
                  <input type="checkbox" id="expRef" checked style="width:auto; margin:0;"> 🏛️ Medir en medios de referencia (ONU·OMS·prensa)
                </label>
              </div>
              <div id="expEstado" class="help-text" style="margin-top:0.6rem;"></div>
              <div id="expTablaCont" class="table-container" style="display:none; margin-top:0.8rem;">
                <table class="table"><thead><tr>
                  <th></th><th>Subtema</th><th>📰 Noticias (3 m)</th><th>🎓 Académicos (${this.ANIOS_ACADEMICOS} a)</th>
                  <th>Índice de brecha</th><th>Titulares de muestra</th><th></th>
                </tr></thead><tbody id="expBody"></tbody></table>
                <p class="help-text" style="margin-top:0.5rem;">🔥 latente (mucho ruido, poca academia) · 📊 equilibrado · 📚 saturado. El índice compara <em>entre sí</em> los subtemas explorados; verifica cada hallazgo antes de decidir tu tema.</p>
              </div>
            </div>`;
        // Chips de áreas de arranque
        const chips = ['salud mental adolescente', 'redes sociales y bienestar', 'estrés laboral', 'violencia de pareja', 'migración y salud mental', 'adicciones comportamentales'];
        const cont = document.getElementById('expChips');
        chips.forEach(c => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'btn btn-outline'; b.style.cssText = 'padding:0.2rem 0.7rem; font-size:0.85em;';
            b.textContent = c;
            b.addEventListener('click', () => { document.getElementById('expTema').value = c; });
            cont.appendChild(b);
        });
        document.getElementById('expBuscar').addEventListener('click', () => this._onExplorar());
    },
    // ---- Subtemas candidatos con IA (Groq), con fallback sin IA ----
    async _subtemas(tema, n = 8) {
        try {
            if (typeof IAAsistente === 'undefined' || !IAAsistente.disponible()) throw new Error('sin IA');
            const texto = await IAAsistente.chatConReintento([
                { role: 'system', content: 'Eres un investigador en psicología que detecta subtemas emergentes. Respondes SOLO JSON válido.' },
                { role: 'user', content: `A partir del área «${tema}», propone EXACTAMENTE ${n} subtemas de investigación en psicología, concretos y actuales (2-6 palabras cada uno, en español, aptos como consulta de búsqueda). Responde SOLO: {"subtemas":["...","..."]}` }
            ], { temperature: 0.7, max_tokens: Math.max(1200, n * 90), response_format: { type: 'json_object' } });
            const d = JSON.parse(texto.replace(/```json|```/g, '').trim());
            const lista = (d.subtemas || []).map(s => String(s).trim()).filter(s => s.length > 2).slice(0, n);
            if (lista.length >= 3) return lista;
            throw new Error('pocos');
        } catch (e) {
            return [tema]; // sin IA: se explora el tema tal cual (sigue siendo útil)
        }
    },
    // ---- Fuentes de datos ----
    // Consulta de noticias: frase exacta solo si el subtema es corto; si es
    // largo, palabras clave sin stopwords (la frase exacta de 4+ palabras casi
    // nunca aparece literal en prensa y daba 0 falsos).
    _queryNoticias(tema) {
        const stop = new Set(['de','del','la','el','los','las','en','y','o','u','a','al','con','por','para','un','una','sobre','entre','su','sus','e']);
        const palabras = String(tema).toLowerCase().split(/\s+/).filter(Boolean);
        if (palabras.length <= 3) return `"${tema}"`;
        const claves = palabras.filter(p => !stop.has(p)).slice(0, 3);
        return claves.length > 1 ? claves.join(' ') : `"${claves[0] || tema}"`;
    },
    async _noticiasGDELT(tema, soloEsp, conRef) {
        const q = this._queryNoticias(tema) + (soloEsp ? ' sourcelang:spanish' : '');
        const base = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' + encodeURIComponent(q);
        // URL "humana" de GDELT con TODAS las fuentes del conteo (transparencia:
        // el número de la tabla enlaza aquí para que verifiques la cobertura).
        const urlFuentes = `${base}&mode=artlist&maxrecords=75&timespan=3m&format=html&sort=datedesc`;
        // Petición robusta con DIAGNÓSTICO: si la respuesta no es JSON, se lee
        // el texto para clasificar la causa (límite de ritmo, bloqueo, red) y,
        // si el arsenal de proxies de la app está disponible, se intenta el
        // RESCATE por proxy (igual que las rutas OMS/ONU del Buscador).
        const pedir = async (url) => {
            let err = 'sin respuesta';
            for (let intento = 0; intento < 2; intento++) {
                try {
                    const r = await fetch(url);
                    const texto = await r.text();
                    try { return { data: JSON.parse(texto), err: null }; }
                    catch (e) {
                        err = /rate|wait|limit|quota/i.test(texto) ? 'GDELT limitó el ritmo'
                            : 'GDELT: ' + texto.replace(/<[^>]+>/g, ' ').trim().slice(0, 90);
                    }
                } catch (e) { err = 'red/CORS bloqueó la conexión con GDELT'; }
                if (intento === 0) await new Promise(x => setTimeout(x, err.includes('ritmo') ? 5000 : 2500));
            }
            // Rescate por proxy — FIRMA REAL del arsenal: carrera(objetivo,
            // validar, opciones), donde validar(texto) devuelve array | null y
            // el retorno es { obras, proxy } (mismo patrón que alicia-directo).
            if (typeof ProxiesCORS !== 'undefined' && ProxiesCORS.carrera) {
                try {
                    const { obras } = await ProxiesCORS.carrera(url,
                        txt => { try { const d = JSON.parse(txt); return (d && (d.timeline || d.articles)) ? [d] : null; } catch (e) { return null; } },
                        { anchura: 3, timeout: 15000, oleadas: 2 });
                    return { data: obras[0], err: null };
                } catch (e) { err += ' · proxies: ' + String(e.message || 'sin respuesta').slice(0, 60); }
            }
            return { data: null, err };
        };
        // PLAN C — Google News RSS por proxy: si GDELT no responde por ningún
        // camino, se estima con una muestra de Google Noticias (máx ~100 items).
        const planC = async () => {
            if (typeof ProxiesCORS === 'undefined' || !ProxiesCORS.carrera) return null;
            const claves = this._queryNoticias(tema).replace(/"/g, '');
            const rss = 'https://news.google.com/rss/search?q=' + encodeURIComponent(claves) + '&hl=es-419&gl=PE&ceid=PE:es';
            try {
                const { obras } = await ProxiesCORS.carrera(rss,
                    txt => {
                        const items = [...String(txt).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
                        if (!items.length) return null;
                        return [items.map(it => ({
                            t: ((it.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || '').trim(),
                            u: ((it.match(/<link\s*\/?>([\s\S]*?)<|<link>([\s\S]*?)<\/link>/) || []).slice(1).find(Boolean) || '').trim(),
                            d: ((it.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || 'Google News').trim()
                        }))];
                    },
                    { anchura: 3, timeout: 15000, oleadas: 2 });
                const items = obras[0];
                return { n: items.length, titulares: items.slice(0, 3), aprox: true,
                    urlFuentes: 'https://news.google.com/search?q=' + encodeURIComponent(claves) + '&hl=es-419' };
            } catch (e) { return null; }
        };
        let n = -1, titulares = [], motivo = '', nRef = -1, urlRef = '';
        const r1 = await pedir(`${base}&mode=timelinevolraw&timespan=3m&format=json`);
        if (r1.data && r1.data.timeline) {
            const serie = r1.data.timeline[0] && r1.data.timeline[0].data || [];
            n = serie.reduce((s, p) => s + (parseInt(p.value, 10) || 0), 0);
        } else motivo = r1.err || 'respuesta sin datos';
        let aprox = false, urlF = urlFuentes;
        if (n < 0) {
            const c = await planC();
            if (c) { n = c.n; titulares = c.titulares; aprox = true; urlF = c.urlFuentes; motivo = ''; }
        } else {
            // Medición en MEDIOS DE REFERENCIA (global, sin filtro de idioma):
            // ¿cuánto suena este subtema en la prensa y organismos que un
            // jurado respeta? (BBC, Reuters, ONU, UNICEF, OMS…)
            if (conRef) {
                await new Promise(x => setTimeout(x, 900));
                const qRef = this._queryNoticias(tema) + ' (' + this.DOMINIOS_REF.map(d => 'domainis:' + d).join(' OR ') + ')';
                const baseRef = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' + encodeURIComponent(qRef);
                urlRef = `${baseRef}&mode=artlist&maxrecords=75&timespan=3m&format=html&sort=datedesc`;
                const rr = await pedir(`${baseRef}&mode=timelinevolraw&timespan=3m&format=json`);
                if (rr.data && rr.data.timeline) {
                    const sr = rr.data.timeline[0] && rr.data.timeline[0].data || [];
                    nRef = sr.reduce((s, p) => s + (parseInt(p.value, 10) || 0), 0);
                }
            }
            await new Promise(x => setTimeout(x, 900)); // ritmo de cortesía
            // Titulares de muestra: si hay cobertura de referencia, se
            // muestran ESOS titulares (más confiables); si no, los generales.
            const fuenteTit = (nRef > 0)
                ? 'https://api.gdeltproject.org/api/v2/doc/doc?query=' + encodeURIComponent(this._queryNoticias(tema) + ' (' + this.DOMINIOS_REF.map(d => 'domainis:' + d).join(' OR ') + ')')
                : base;
            const r2 = await pedir(`${fuenteTit}&mode=artlist&maxrecords=3&timespan=3m&format=json&sort=datedesc`);
            if (r2.data && r2.data.articles) titulares = r2.data.articles.slice(0, 3).map(a => ({ t: a.title || '', u: a.url || '', d: a.domain || '' }));
        }
        return { n, titulares, motivo, urlFuentes: urlF, aprox, nRef, urlRef };
    },
    async _academicosOpenAlex(tema) {
        const desde = new Date().getFullYear() - this.ANIOS_ACADEMICOS;
        const url = 'https://api.openalex.org/works?filter=' +
            encodeURIComponent(`title_and_abstract.search:${tema},from_publication_date:${desde}-01-01`) + '&per_page=1';
        try {
            const r = await fetch(url);
            const d = await r.json();
            return (d.meta && typeof d.meta.count === 'number') ? d.meta.count : -1;
        } catch (e) { return -1; }
    },
    // ---- Orquestación ----
    async _onExplorar() {
        const tema = (document.getElementById('expTema') || {}).value.trim();
        const estado = document.getElementById('expEstado');
        const btn = document.getElementById('expBuscar');
        if (tema.length < 4) { if (estado) estado.textContent = '⚠️ Escribe un área o tema semilla (o toca un chip).'; return; }
        const soloEsp = !!(document.getElementById('expEspanol') || {}).checked;
        const conRef = !!(document.getElementById('expRef') || {}).checked;
        const t0 = btn.textContent; btn.disabled = true; btn.textContent = '⏳ Explorando…';
        const nSub = Math.max(1, Math.min(50, parseInt((document.getElementById('expNum') || {}).value, 10) || 8));
        let subtemas;
        if (nSub === 1) {
            subtemas = [tema]; // medir el tema del usuario tal cual, sin expansión
        } else {
            if (estado) estado.textContent = `🧠 Proponiendo ${nSub} subtemas del área…`;
            subtemas = await this._subtemas(tema, nSub);
        }
        // RENDER PROGRESIVO: la tabla nace completa en estado "midiendo" y
        // cada fila se llena en cuanto su medición termina (los botones de
        // esa fila se activan al instante, sin esperar al resto del lote).
        this._resultados = subtemas.map(s => ({ tema: s, pendiente: true, icono: '⏳',
            noticias: -1, academicos: -1, indice: -1, titulares: [], motivo: '', urlFuentes: '', aprox: false, nRef: -1, urlRef: '' }));
        this._pintar();
        const filas = this._resultados;
        for (let i = 0; i < subtemas.length; i++) {
            const s = subtemas[i];
            if (estado) estado.textContent = `🔎 ${i + 1}/${subtemas.length}: midiendo «${s}»… (cada fila aparece al completarse; el orden y el semáforo definitivos llegan al final)`;
            const not = await this._noticiasGDELT(s, soloEsp, conRef);
            const acad = await this._academicosOpenAlex(s);
            Object.assign(filas[i], { pendiente: false, icono: '·',
                noticias: not.n, titulares: not.titulares, academicos: acad, nRef: not.nRef, urlRef: not.urlRef,
                motivo: not.motivo || (acad < 0 ? 'OpenAlex no respondió' : ''), urlFuentes: not.urlFuentes, aprox: !!not.aprox,
                indice: (not.n >= 0 && acad >= 0) ? not.n / (acad + 1) : -1 });
            this._actualizarFila(i);
            await new Promise(r => setTimeout(r, 1500)); // GDELT exige ritmo pausado entre temas
        }
        // Semáforo por terciles del índice (solo filas con datos completos)
        const validas = filas.filter(f => f.indice >= 0).sort((a, b) => b.indice - a.indice);
        if (validas.length >= 3) {
            validas.forEach((f, i) => {
                const tercio = i / validas.length;
                f.icono = (tercio < 1 / 3 && f.noticias >= this.MIN_NOTICIAS_LATENTE) ? '🔥'
                    : (tercio >= 2 / 3 ? '📚' : '📊');
            });
        } else {
            // Pocos subtemas: sin terciles posibles → reglas absolutas honestas.
            validas.forEach(f => {
                f.icono = (f.indice >= 1 && f.noticias >= this.MIN_NOTICIAS_LATENTE) ? '🔥'
                    : (f.indice < 0.05 ? '📚' : '📊');
            });
        }
        filas.filter(f => f.indice < 0).forEach(f => { f.icono = '❓'; });
        this._resultados = [...validas, ...filas.filter(f => f.indice < 0)];
        this._pintar(); // repintado final: orden por brecha + semáforo definitivo
        const nOK = validas.length;
        const motivos = filas.filter(f => f.motivo).map(f => f.motivo);
        const causa = motivos.length ? motivos.sort((a, b) =>
            motivos.filter(m => m === b).length - motivos.filter(m => m === a).length)[0] : '';
        if (estado) estado.textContent = nOK
            ? `✓ ${nOK} subtema(s) medidos. Ordenados por índice de brecha (🔥 = candidatos a problemática latente${nOK < 3 ? '; con menos de 3, el semáforo usa reglas absolutas, no comparación entre subtemas' : ''}).`
              + (motivos.length ? ` ${motivos.length} con ⚠️ (causa principal: ${causa}); pasa el ratón por el ⚠️ para ver cada motivo.` : '')
            : `❌ Las noticias no pudieron medirse — causa principal: ${causa || 'fuente sin respuesta'}. Reintenta en ~1 minuto (GDELT libera el límite solo).`;
        btn.disabled = false; btn.textContent = t0;
        this._pintarNube();
    },
    // ---- F3: nube de brechas (circle packing con el d3 ya vendorizado) ----
    // Área de cada burbuja ∝ índice de brecha; color = semáforo. Un vistazo
    // y sabes dónde está el fuego.
    _pintarNube() {
        let cont = document.getElementById('expNube');
        if (!cont) {
            cont = document.createElement('div');
            cont.id = 'expNube';
            cont.style.cssText = 'display:none; margin-top:0.8rem; text-align:center;';
            const tabla = document.getElementById('expTablaCont');
            if (tabla) tabla.after(cont); else return;
        }
        const datos = this._resultados.filter(f => f.indice >= 0);
        if (typeof d3 === 'undefined' || datos.length < 2) { cont.style.display = 'none'; return; }
        const W = 640, H = 420;
        const raiz = d3.pack().size([W, H - 30]).padding(6)(
            d3.hierarchy({ children: datos.map(f => ({ ...f, valor: Math.max(f.indice, 0.05) })) })
              .sum(d => d.valor));
        const color = { '🔥': '#e05d44', '📊': '#2E5BBA', '📚': '#8a8f98' };
        const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const burbujas = raiz.leaves().map(h => {
            const f = h.data;
            const palabras = f.tema.split(/\s+/);
            const lineas = [];
            for (let i = 0; i < palabras.length; i += 2) lineas.push(palabras.slice(i, i + 2).join(' '));
            const fs = Math.max(9, Math.min(15, h.r / 3.2));
            const txt = h.r > 26 ? lineas.slice(0, 3).map((l, i) =>
                `<text x="${h.x}" y="${h.y + (i - (Math.min(lineas.length, 3) - 1) / 2) * (fs + 2)}" text-anchor="middle" font-size="${fs}" fill="#fff">${esc(l)}</text>`).join('') : '';
            return `<g><title>${esc(f.tema)} — índice ${f.indice.toFixed(2)} (📰 ${f.noticias} · 🎓 ${f.academicos})</title>`
                + `<circle cx="${h.x}" cy="${h.y}" r="${h.r}" fill="${color[f.icono] || '#2E5BBA'}" fill-opacity="0.88"/>${txt}</g>`;
        }).join('');
        cont.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, sans-serif" style="max-width:100%; height:auto;">
            <text x="${W / 2}" y="20" text-anchor="middle" font-size="13" font-weight="bold" fill="#1a1a1a">Nube de brechas — área ∝ índice · 🔥 latente · 📊 equilibrado · 📚 saturado</text>
            <g transform="translate(0,26)">${burbujas}</g></svg>`;
        cont.style.display = '';
    },
    // ---- F2: formular un subtema como problema de investigación (IA) ----
    // Entrega: problema formulado, pregunta sugerida, enfoques y viabilidad.
    // PROPUESTA ORIENTATIVA: el investigador la valida con su asesor.
    async _onFormular(i, btn) {
        const f = this._resultados[i];
        if (!f) return;
        const tr = btn.closest('tr');
        // Alternar: si ya existe el detalle, quitarlo.
        if (tr.nextElementSibling && tr.nextElementSibling.classList.contains('exp-detalle')) {
            tr.nextElementSibling.remove(); return;
        }
        const t0 = btn.textContent; btn.disabled = true; btn.textContent = '⏳…';
        const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        let html;
        try {
            if (typeof IAAsistente === 'undefined' || !IAAsistente.disponible()) throw new Error('El asistente de IA no está disponible.');
            const contexto = `Subtema: ${f.tema}. Interés mediático (3 meses): ${f.noticias} noticias. `
                + `Producción académica (${this.ANIOS_ACADEMICOS} años): ${f.academicos} trabajos. `
                + `Titulares recientes: ${f.titulares.map(t => t.t).join(' | ') || 'ninguno'}.`;
            const texto = await IAAsistente.chatConReintento([
                { role: 'system', content: 'Eres un metodólogo experto en psicología que convierte temas emergentes en problemas de investigación viables para tesis de licenciatura. Respondes SOLO JSON válido, en español.' },
                { role: 'user', content: `${contexto}\n\nFormula este subtema como investigación. Responde SOLO: `
                    + `{"problema":"(2-3 frases: el fenómeno y por qué importa)","pregunta":"(una pregunta de investigación concreta, preferentemente correlacional o descriptiva)","enfoques":["(enfoque 1: diseño+variables)","(enfoque 2)","(enfoque 3)"],"viabilidad":"(2-3 frases: población accesible, instrumentos existentes, dificultad realista)"}` }
            ], { temperature: 0.6, max_tokens: 1800, response_format: { type: 'json_object' } });
            const d = JSON.parse(texto.replace(/```json|```/g, '').trim());
            const enf = (d.enfoques || []).map(e => `<li style="margin:0.15rem 0;">${esc(e)}</li>`).join('');
            html = `<div style="padding:0.8rem 1rem;">
                <p style="margin:0 0 0.4rem;"><strong>Problema:</strong> ${esc(d.problema || '')}</p>
                <p style="margin:0 0 0.4rem;"><strong>Pregunta sugerida:</strong> <em>${esc(d.pregunta || '')}</em></p>
                <p style="margin:0 0 0.2rem;"><strong>Enfoques posibles:</strong></p>
                <ul style="margin:0 0 0.4rem 1.2rem;">${enf}</ul>
                <p style="margin:0 0 0.5rem;"><strong>Viabilidad:</strong> ${esc(d.viabilidad || '')}</p>
                <p class="help-text" style="margin:0;">⚠️ Propuesta orientativa generada por IA a partir de señales mediáticas y académicas: valídala con tu asesor y con la literatura antes de adoptarla.</p>
            </div>`;
        } catch (e) {
            html = `<div style="padding:0.8rem 1rem;" class="help-text">❌ ${esc(e.message || 'No se pudo formular.')} Reintenta en unos segundos.</div>`;
        }
        const det = document.createElement('tr');
        det.className = 'exp-detalle';
        det.innerHTML = `<td colspan="7" style="background:#f7f9fd; border-left:3px solid #2E5BBA;">${html}</td>`;
        tr.after(det);
        btn.disabled = false; btn.textContent = t0;
    },
    _filaHTML(f, i) {
        const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (f.pendiente) {
            return `<tr data-idx="${i}" class="exp-midiendo">
              <td style="font-size:1.2em;">⏳</td>
              <td><strong>${esc(f.tema)}</strong></td>
              <td><span style="opacity:0.55;">midiendo…</span></td>
              <td><span style="opacity:0.55;">…</span></td>
              <td>—</td>
              <td style="max-width:320px;"><span style="color:#888; font-size:0.85em;">—</span></td>
              <td style="white-space:nowrap;"><button type="button" class="btn btn-secondary" disabled style="padding:0.25rem 0.7rem; font-size:0.85em; opacity:0.4;">🧠 Formular</button>
              <button type="button" class="btn btn-outline" disabled style="padding:0.25rem 0.7rem; font-size:0.85em; opacity:0.4;">→ Al Buscador</button></td>
            </tr>`;
        }
        const tits = f.titulares.map(t =>
            `<div style="font-size:0.82em; margin:0.15rem 0;"><a href="${esc(t.u)}" target="_blank" rel="noopener">${esc(t.t).slice(0, 90)}</a> <span style="color:#888;">(${esc(t.d)})</span></div>`).join('')
            || '<span style="color:#888; font-size:0.85em;">—</span>';
        return `<tr data-idx="${i}">
          <td style="font-size:1.2em;">${f.icono}</td>
          <td><strong>${esc(f.tema)}</strong></td>
          <td>${f.noticias >= 0
            ? `<a href="${esc(f.urlFuentes || '#')}" target="_blank" rel="noopener" title="${f.aprox ? 'Estimado con Google Noticias (muestra de hasta ~100): GDELT no respondió. Clic: ver la cobertura.' : 'Ver la cobertura completa en GDELT (todas las fuentes de este conteo)'}">${f.aprox ? '≈' : ''}${f.noticias.toLocaleString('es')} 📰</a>${f.nRef > 0 ? ` · <a href="${esc(f.urlRef)}" target="_blank" rel="noopener" title="${f.nRef} noticia(s) en medios de referencia y organismos (BBC, Reuters, El País, DW… ONU, UNICEF, OMS/OPS). Clic: ver esa cobertura." style="text-decoration:none;">🏛️${f.nRef.toLocaleString('es')}</a>` : ''}`
            : `<span title="${esc(f.motivo || 'fuente sin respuesta')}" style="cursor:help;">⚠️ —</span>`}</td>
          <td>${f.academicos >= 0 ? f.academicos.toLocaleString('es') : '—'}</td>
          <td>${f.indice >= 0 ? f.indice.toFixed(2).replace('.', ',') : '—'}</td>
          <td style="max-width:320px;">${tits}</td>
          <td style="white-space:nowrap;"><button type="button" class="btn btn-secondary exp-formular" data-i="${i}" style="padding:0.25rem 0.7rem; font-size:0.85em;" title="La IA formula este subtema como problema de investigación (propuesta orientativa)">🧠 Formular</button>
          <button type="button" class="btn btn-outline exp-enviar" data-i="${i}" style="padding:0.25rem 0.7rem; font-size:0.85em;" title="Llevar este subtema al Buscador de antecedentes">→ Al Buscador</button></td>
        </tr>`;
    },
    _wireFila(tr) {
        const b1 = tr.querySelector('.exp-formular');
        if (b1) b1.addEventListener('click', () => this._onFormular(parseInt(b1.dataset.i, 10), b1));
        const b2 = tr.querySelector('.exp-enviar');
        if (b2) b2.addEventListener('click', () => {
            const f = this._resultados[parseInt(b2.dataset.i, 10)];
            const caja = document.getElementById('antQuery');
            if (caja) { caja.value = f.tema; }
            const link = document.querySelector('.nav-link[href="#buscador"]');
            if (link) link.click();
            if (caja) caja.focus();
        });
    },
    // Reemplaza SOLO la fila i (render progresivo sin tocar el resto).
    _actualizarFila(i) {
        const vieja = document.querySelector(`#expBody tr[data-idx="${i}"]`);
        if (!vieja) return;
        const t = document.createElement('tbody');
        t.innerHTML = this._filaHTML(this._resultados[i], i);
        const nueva = t.firstElementChild;
        vieja.replaceWith(nueva);
        this._wireFila(nueva);
    },
    _pintar() {
        const cont = document.getElementById('expTablaCont');
        const body = document.getElementById('expBody');
        if (!cont || !body) return;
        body.innerHTML = this._resultados.map((f, i) => this._filaHTML(f, i)).join('');
        body.querySelectorAll('tr').forEach(tr => this._wireFila(tr));
        cont.style.display = '';
    }
};
if (typeof window !== 'undefined') {
    window.Explorar = Explorar;
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => Explorar.montar());
    } else {
        Explorar.montar();
    }
}
