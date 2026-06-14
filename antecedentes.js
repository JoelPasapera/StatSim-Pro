// ========================================
// BUSCADOR DE ANTECEDENTES v2 — módulo especializado multi-fuente.
// Consulta EN PARALELO tres APIs académicas abiertas (sin claves, CORS ok):
//   · Semantic Scholar — ranking semántico (lo más cercano a Google Académico)
//   · OpenAlex         — cobertura masiva, filtros de idioma/fecha
//   · Crossref         — metadatos editoriales de revistas
// Luego FUSIONA (deduplicación por DOI/título), RE-RANKEA localmente
// (coincidencias en título ≫ resumen, bonus de frase, idioma y citas) y
// sugiere SINÓNIMOS para términos atípicos. Sin Google Scholar embebido:
// CORS lo impide a nivel de navegador; se ofrece como pestaña externa.
// ========================================

const Antecedentes = {

    CONFIG: {
        POR_FUENTE: 25,
        RECORTE_RESUMEN: 350,
        UNPAYWALL_EMAIL: 'statsim.research@gmail.com', // Unpaywall rechaza dominios inexistentes/de prueba (422)
        MAILTO: '',
        SINONIMOS: {
            'inteligencia cognitiva': ['cognitive ability', 'intelligence', 'capacidad cognitiva', 'habilidades cognitivas'],
            'inteligencia emocional': ['emotional intelligence', 'competencias emocionales'],
            'autoestima': ['self-esteem'], 'ansiedad': ['anxiety'], 'depresion': ['depression'],
            'estres academico': ['academic stress'], 'rendimiento academico': ['academic performance', 'academic achievement'],
            'memoria de trabajo': ['working memory'], 'funciones ejecutivas': ['executive functions'],
            'bienestar psicologico': ['psychological well-being'], 'motivacion': ['motivation'],
            'agresividad': ['aggression'], 'habilidades sociales': ['social skills'],
            'adiccion a redes sociales': ['social media addiction', 'problematic internet use']
        }
    },

    _seleccion: new Map(),
    _obras: [],

    // ---------- traducción (MyMemory: gratis, con CORS, sin API key) ----------

    // Traduce 'texto' de 'desde' a 'hacia'. Devuelve el texto traducido, o el
    // original si la API falla (degradación elegante: nunca rompe la búsqueda).
    async traducirTexto(texto, desde, hacia) {
        try {
            const url = 'https://api.mymemory.translated.net/get?q='
                + encodeURIComponent(texto) + '&langpair=' + desde + '|' + hacia;
            const r = await fetch(url);
            const d = await r.json();
            if (d.responseStatus === 200 && d.responseData && d.responseData.translatedText) {
                const t = d.responseData.translatedText.trim();
                if (t) return t;
            }
        } catch (e) { /* sin conexión o límite diario: usar el original */ }
        return texto;
    },

    // ---------- utilidades ----------
    _norm(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    },

    sinonimosDe(query) {
        return this.CONFIG.SINONIMOS[this._norm(query)] || [];
    },

    // Puntaje local de relevancia: título ≫ resumen; frase completa en título
    // vale doble; idioma preferido y citas (log) desempatan.
    puntuar(obra, query, idiomaPref) {
        const q = this._norm(query), toks = q.split(' ').filter(t => t.length > 2);
        const t = this._norm(obra.titulo), r = this._norm(obra.resumen);
        let s = 0;
        toks.forEach(tok => { if (t.includes(tok)) s += 3; else if (r.includes(tok)) s += 1; });
        if (toks.length > 1 && t.includes(q)) s += 8;
        else if (toks.length > 1 && r.includes(q)) s += 3;
        // Citas e idioma solo DESEMPATAN entre obras ya pertinentes: sin
        // coincidencia léxica alguna, la obra queda fuera (score 0).
        if (s > 0) {
            if (idiomaPref && obra.idioma === idiomaPref) s += 2;
            s += Math.log10(1 + (obra.citas || 0));
        }
        return s;
    },

    fusionar(listas, query, idiomaPref) {
        // Índice DOBLE (por DOI y por título normalizado): así se reconoce la
        // misma obra aunque una fuente traiga DOI y otra no.
        const vistos = new Map();
        const kDoi = o => o.doi ? o.doi.replace(/^https?:\/\/doi\.org\//, '').toLowerCase() : '';
        listas.flat().forEach(o => {
            const kd = kDoi(o), kt = this._norm(o.titulo);
            const previo = (kd && vistos.get('d:' + kd)) || vistos.get('t:' + kt);
            if (!previo) {
                if (kd) vistos.set('d:' + kd, o);
                vistos.set('t:' + kt, o);
            } else {
                if (!previo.resumen && o.resumen) previo.resumen = o.resumen;
                if (!previo.doi && o.doi) { previo.doi = o.doi; vistos.set('d:' + kDoi(previo), previo); }
                previo.citas = Math.max(previo.citas || 0, o.citas || 0);
                previo.fuentesAPI = [...new Set([...(previo.fuentesAPI || []), ...(o.fuentesAPI || [])])];
            }
        });
        return [...new Set(vistos.values())]
            .map(o => (o._score = this.puntuar(o, query, idiomaPref), o))
            .filter(o => o._score > 0)
            .sort((a, b) => b._score - a._score);
    },

    // ---------- fuentes ----------
    reconstruirAbstract(inv) {
        if (!inv) return '';
        const pares = [];
        Object.entries(inv).forEach(([w, pos]) => pos.forEach(p => pares.push([p, w])));
        return pares.sort((a, b) => a[0] - b[0]).map(p => p[1]).join(' ');
    },

    urlOpenAlex(query, f = {}) {
        let q = String(query).replace(/,/g, ' ').trim();
        const filtros = [`title_and_abstract.search:${q}`, 'type:article'];
        if (f.desde) filtros.push(`from_publication_date:${f.desde}-01-01`);
        if (f.idioma) filtros.push(`language:${f.idioma}`);
        const p = new URLSearchParams({ filter: filtros.join(','), sort: 'relevance_score:desc', 'per-page': String(this.CONFIG.POR_FUENTE) });
        if (this.CONFIG.MAILTO) p.set('mailto', this.CONFIG.MAILTO);
        return `https://api.openalex.org/works?${p.toString()}`;
    },
    normOpenAlex(o) {
        const b = o.biblio || {};
        return {
            titulo: o.title || o.display_name || '(sin título)',
            autores: (o.authorships || []).map(a => a.author && a.author.display_name).filter(Boolean),
            anio: o.publication_year || 's. f.', doi: o.doi || '',
            fuente: (o.primary_location && o.primary_location.source && o.primary_location.source.display_name) || '',
            volumen: b.volume || '', numero: b.issue || '',
            paginas: (b.first_page && b.last_page) ? `${b.first_page}-${b.last_page}` : (b.first_page || ''),
            citas: o.cited_by_count || 0, idioma: o.language || '',
            resumen: this.reconstruirAbstract(o.abstract_inverted_index), fuentesAPI: ['OpenAlex']
        };
    },

    urlSemantic(query, f = {}) {
        const p = new URLSearchParams({
            query, limit: String(this.CONFIG.POR_FUENTE),
            fields: 'title,abstract,year,authors,externalIds,citationCount,venue,publicationVenue'
        });
        if (f.desde) p.set('year', `${f.desde}-`);
        return `https://api.semanticscholar.org/graph/v1/paper/search?${p.toString()}`;
    },
    normSemantic(o) {
        const doi = o.externalIds && o.externalIds.DOI ? `https://doi.org/${o.externalIds.DOI}` : '';
        return {
            titulo: o.title || '(sin título)',
            autores: (o.authors || []).map(a => a.name).filter(Boolean),
            anio: o.year || 's. f.', doi,
            fuente: o.venue || (o.publicationVenue && o.publicationVenue.name) || '',
            volumen: '', numero: '', paginas: '',
            citas: o.citationCount || 0, idioma: '',
            resumen: o.abstract || '', fuentesAPI: ['SemanticScholar']
        };
    },

    urlCrossref(query, f = {}) {
        const filtros = ['type:journal-article'];
        if (f.desde) filtros.push(`from-pub-date:${f.desde}-01-01`);
        const p = new URLSearchParams({
            'query.bibliographic': query, rows: String(this.CONFIG.POR_FUENTE),
            filter: filtros.join(','),
            select: 'DOI,title,author,issued,container-title,volume,issue,page,is-referenced-by-count,abstract'
        });
        if (this.CONFIG.MAILTO) p.set('mailto', this.CONFIG.MAILTO);
        return `https://api.crossref.org/works?${p.toString()}`;
    },
    normCrossref(o) {
        const anio = o.issued && o.issued['date-parts'] && o.issued['date-parts'][0] ? o.issued['date-parts'][0][0] : 's. f.';
        return {
            titulo: (o.title && o.title[0]) || '(sin título)',
            autores: (o.author || []).map(a => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean),
            anio, doi: o.DOI ? `https://doi.org/${o.DOI}` : '',
            fuente: (o['container-title'] && o['container-title'][0]) || '',
            volumen: o.volume || '', numero: o.issue || '', paginas: o.page || '',
            citas: o['is-referenced-by-count'] || 0, idioma: '',
            resumen: String(o.abstract || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
            fuentesAPI: ['Crossref']
        };
    },

    async _fetchJSON(url) {
        const r = await fetch(url);
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
    },

    async buscarMulti(query, f = {}) {
        const tareas = [
            this._fetchJSON(this.urlSemantic(query, f)).then(d => (d.data || []).map(x => this.normSemantic(x))),
            this._fetchJSON(this.urlOpenAlex(query, f)).then(d => (d.results || []).map(x => this.normOpenAlex(x))),
            this._fetchJSON(this.urlCrossref(query, f)).then(d => ((d.message && d.message.items) || []).map(x => this.normCrossref(x)))
        ];
        const res = await Promise.allSettled(tareas);
        const listas = res.filter(r => r.status === 'fulfilled').map(r => r.value);
        const caidas = res.filter(r => r.status === 'rejected').length;
        if (!listas.length) throw new Error('ninguna fuente respondió');
        return { obras: this.fusionar(listas, query, f.idioma), fuentesOK: listas.length, caidas };
    },

    urlScholar(query, f = {}) {
        const p = new URLSearchParams({ q: query, hl: 'es' });
        if (f.desde) p.set('as_ylo', String(f.desde));
        return `https://scholar.google.com/scholar?${p.toString()}`;
    },

    // ---------- Extracción heurística de campos (de abstract/metadatos) ----------

    // País: busca gentilicios/países frecuentes en título+resumen.
    _detectarPais(o) {
        const t = (o.titulo + ' ' + (o.resumen || '')).toLowerCase();
        const mapa = {
            'Perú': /per[uú]|peruvian|peruan/, 'México': /m[eé]xico|mexican/, 'Chile': /chile/,
            'Colombia': /colombia/, 'Argentina': /argentin/, 'España': /spain|spanish|españ/,
            'Ecuador': /ecuador/, 'Brasil': /brazil|brasil/, 'Bolivia': /bolivia/,
            'Venezuela': /venezuel/, 'Estados Unidos': /united states|american students|\bu\.?s\.?a?\b/,
            'China': /\bchina\b|chinese/, 'Marruecos': /morocc/, 'Turquía': /turkey|turkish/
        };
        for (const [pais, rx] of Object.entries(mapa)) if (rx.test(t)) return pais;
        return '';
    },

    // Indexación: inferida de la fuente/base (heurística; el usuario verifica).
    _detectarIndexacion(o) {
        const ix = [];
        if ((o.fuentesAPI || []).includes('Scopus')) ix.push('Scopus');
        const f = (o.fuente || '').toLowerCase();
        if (/scielo/.test((o.link || '') + f)) ix.push('SciELO');
        if (/redalyc/.test((o.link || '') + f)) ix.push('Redalyc');
        if (o.doi) ix.push('Crossref');
        return [...new Set(ix)].join(', ');
    },

    // Muestra: frases tipo "N participantes/students/estudiantes/sample".
    _detectarMuestra(o) {
        const r = o.resumen || '';
        const m = r.match(/(\b\d[\d.,]{1,6})\s*(participants?|participantes|students?|estudiantes|subjects?|sujetos|adolescen\w*|ni[ñn]os|adults?|adultos|individuals?|patients?|pacientes)/i);
        return m ? `${m[1].replace(/[.,]$/, '')} ${m[2]}` : '';
    },

    // Objetivo: oración del abstract que enuncia propósito (aim/objetivo/purpose).
    _detectarObjetivo(o) {
        const r = o.resumen || '';
        const m = r.match(/[^.]*\b(aim(?:ed)?|objective|purpose|this study (?:aims|examines|investigates|analyzes)|objetivo|prop[oó]sito|se busc[oó]|tuvo por objeto)\b[^.]*\./i);
        return m ? m[0].trim() : '';
    },

    // ---------- APA 7 ----------
    _autorAPA(nombre) {
        const partes = nombre.trim().split(/\s+/);
        if (partes.length === 1) return partes[0];
        const apellido = partes[partes.length - 1];
        const ini = partes.slice(0, -1).map(p => p[0].toUpperCase() + '.').join(' ');
        return `${apellido}, ${ini}`;
    },
    _autoresAPA(autores) {
        const a = autores.map(n => this._autorAPA(n));
        if (!a.length) return '';
        if (a.length === 1) return a[0];
        if (a.length === 2) return `${a[0]} & ${a[1]}`;
        if (a.length <= 20) return `${a.slice(0, -1).join(', ')}, & ${a[a.length - 1]}`;
        return `${a.slice(0, 19).join(', ')}, ... ${a[a.length - 1]}`;
    },
    citaAPA(o) {
        let c = `${this._autoresAPA(o.autores)} (${o.anio}). ${o.titulo}.`;
        if (o.fuente) {
            c += ` <i>${o.fuente}</i>`;
            if (o.volumen) c += `, <i>${o.volumen}</i>${o.numero ? `(${o.numero})` : ''}`;
            if (o.paginas) c += `, ${o.paginas}`;
            c += '.';
        }
        // APA 7: cerrar con el DOI; si no hay DOI, con la URL de acceso disponible.
        if (o.doi) c += ` ${o.doi}`;
        else if (o.link) c += ` ${o.link}`;
        return c;
    },

    // ---------- interfaz ----------
    montar() {
        let cont = document.getElementById('seccionAntecedentes');
        if (!cont) {
            // Respaldo: si la sección no existe en el HTML, crear al pie (compat).
            cont = document.createElement('div');
            cont.id = 'seccionAntecedentes';
            const ancla = document.querySelector('footer');
            (ancla ? ancla.parentNode : document.body).insertBefore(cont, ancla || null);
        }
        const sugerida = window.ultimoAnalisis ? `${window.ultimoAnalisis.et1} ${window.ultimoAnalisis.et2}` : '';
        cont.innerHTML = `
        <div class="card">
            <div>
              <div class="form-row">
                <div class="form-group" style="flex:2;">
                  <label class="label">Términos de búsqueda</label>
                  <input type="text" id="antQuery" class="input" value="${sugerida}"
                    placeholder="Ej: inteligencia emocional rendimiento académico">
                  <div id="antSinonimos" class="help-text" style="margin-top:0.35rem;"></div>
                </div>
                <div class="form-group"><label class="label">Desde el año</label>
                  <input type="number" id="antDesde" class="input" value="${new Date().getFullYear() - 5}"></div>
                <div class="form-group"><label class="label">Priorizar idioma</label>
                  <select id="antIdioma" class="input"><option value="">Indistinto</option>
                  <option value="es" selected>Español</option><option value="en">Inglés</option></select></div>
                <div class="form-group"><label class="label">Resultados (Scholar)</label>
                  <select id="antCantidad" class="input"><option value="1">10 (rápido)</option>
                  <option value="2" selected>20</option><option value="3">30 (más lento)</option></select></div>
                <div class="form-group"><label class="label">Resultados (Scopus)</label>
                  <select id="antCantidadScopus" class="input"><option value="25" selected>25</option>
                  <option value="50">50</option><option value="100">100</option></select></div>
              </div>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.4rem;">
                <input type="checkbox" id="antUsarScholar" checked> Intentar Google Académico directo (experimental, vía proxy)
              </label><br>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.4rem;">
                <input type="checkbox" id="antUsarScopus" checked> Buscar en Scopus (Elsevier, vía proxy)
              </label><br>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.6rem;">
                <input type="checkbox" id="antUsarAbiertas"> Buscar en fuentes complementarias (OpenAlex, Crossref, Semantic Scholar)
              </label><br>
              <div id="antAvisoScopusEs" style="display:none; margin:0 0 0.6rem; padding:0.5rem 0.75rem; background:#fff8e1; border-left:3px solid #f5b301; border-radius:4px; font-size:0.85em;">
                ⚠️ Scopus indexa casi exclusivamente artículos en <strong>inglés</strong>. Con el idioma en «Español», es probable que devuelva pocos o ningún resultado. Para aprovechar Scopus, cambia «Priorizar idioma» a <strong>Inglés</strong>: la consulta se traducirá automáticamente.
              </div>
              <button id="antBuscar" class="btn btn-primary">🔎 Buscar</button>
              <button id="antScholar" class="btn btn-outline">↗ Abrir en Google Académico</button>
              <button id="antScopusWeb" class="btn btn-outline">↗ Abrir en Scopus</button>
              <div id="antEstado" class="help-text" style="margin-top:0.5rem;"></div>
              <div id="antResultados"></div>
              <div id="antSeleccion"></div>
            </div>
        </div>`;
        document.getElementById('antBuscar').addEventListener('click', () => this._onBuscar());
        document.getElementById('antScholar').addEventListener('click', () => {
            const q = document.getElementById('antQuery').value.trim();
            if (q) window.open(this.urlScholar(q, { desde: document.getElementById('antDesde').value }), '_blank');
        });
        const btnScopusWeb = document.getElementById('antScopusWeb');
        if (btnScopusWeb) btnScopusWeb.addEventListener('click', async () => {
            let q = document.getElementById('antQuery').value.trim();
            if (!q || typeof ScopusDirecto === 'undefined') return;
            // Si se prioriza inglés, traducir también para la búsqueda web.
            if (document.getElementById('antIdioma').value === 'en') {
                q = await this.traducirTexto(q, 'es', 'en');
            }
            window.open(ScopusDirecto.urlPublica(q, { desde: document.getElementById('antDesde').value }), '_blank');
        });
        document.getElementById('antQuery').addEventListener('input', () => this._renderSinonimos());
        this._renderSinonimos();
        // Aviso Scopus+Español: actualizar al cambiar idioma o la casilla de Scopus.
        const actualizarAvisoScopus = () => {
            const aviso = document.getElementById('antAvisoScopusEs');
            if (!aviso) return;
            const scopusOn = document.getElementById('antUsarScopus') && document.getElementById('antUsarScopus').checked;
            const idioma = document.getElementById('antIdioma') && document.getElementById('antIdioma').value;
            aviso.style.display = (scopusOn && idioma !== 'en') ? 'block' : 'none';
        };
        ['antIdioma', 'antUsarScopus'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', actualizarAvisoScopus);
        });
        actualizarAvisoScopus();
    },

    _renderSinonimos() {
        const q = document.getElementById('antQuery').value;
        const sin = this.sinonimosDe(q);
        const cont = document.getElementById('antSinonimos');
        cont.innerHTML = sin.length
            ? 'Prueba también: ' + sin.map(s =>
                `<a href="#" data-s="${s}" style="margin-right:0.6rem;">${s}</a>`).join('')
            : '';
        cont.querySelectorAll('a').forEach(a => a.addEventListener('click', e => {
            e.preventDefault();
            document.getElementById('antQuery').value = e.target.dataset.s;
            this._onBuscar();
        }));
    },

    async _onBuscar() {
        const estado = document.getElementById('antEstado');
        const qOriginal = document.getElementById('antQuery').value.trim();
        if (!qOriginal) { estado.textContent = 'Escribe términos de búsqueda.'; return; }
        const f = { desde: document.getElementById('antDesde').value, idioma: document.getElementById('antIdioma').value };
        const usarScopus = document.getElementById('antUsarScopus') && document.getElementById('antUsarScopus').checked && typeof ScopusDirecto !== 'undefined';
        const usarScholar = document.getElementById('antUsarScholar') && document.getElementById('antUsarScholar').checked && typeof ScholarDirecto !== 'undefined';
        const usarAbiertas = document.getElementById('antUsarAbiertas') && document.getElementById('antUsarAbiertas').checked;

        if (!usarScopus && !usarScholar && !usarAbiertas) {
            estado.textContent = 'Marca al menos una fuente de búsqueda.';
            return;
        }

        // Si se prioriza Inglés, traducir la consulta UNA vez y usarla para
        // TODAS las fuentes (Scopus, Scholar y abiertas son mayormente inglés).
        let q = qOriginal, avisoTraduccion = '';
        if (f.idioma === 'en') {
            estado.textContent = 'Traduciendo la consulta al inglés…';
            const traducida = await this.traducirTexto(qOriginal, 'es', 'en');
            if (traducida && traducida.toLowerCase() !== qOriginal.toLowerCase()) {
                q = traducida;
                avisoTraduccion = `🔁 Consulta traducida al inglés para mejores resultados: «${q}». `;
            }
        }

        const fuentes = [];
        if (usarScopus) fuentes.push('Scopus');
        if (usarScholar) fuentes.push('Google Académico');
        if (usarAbiertas) fuentes.push('fuentes complementarias');
        estado.textContent = `${avisoTraduccion}Consultando ${fuentes.join(' + ')}…`;

        // Cada fuente devuelve {obras, etiqueta, info}; se lanzan en paralelo y
        // se combinan. Una que falle no tumba a las demás (allSettled).
        const tareas = [];
        if (usarScopus) {
            const maxScopus = parseInt((document.getElementById('antCantidadScopus') || {}).value || '25', 10);
            tareas.push(
                ScopusDirecto.buscar(q, { ...f, maxResultados: maxScopus }).then(r => {
                    const vista = r.view === 'COMPLETE' ? ', con resúmenes ✓' : '';
                    return { obras: r.obras, info: `Scopus (clave ${r.key}, ${r.obras.length} result.${vista})` };
                }).catch(e => ({ obras: [], info: `Scopus falló (${e.message})` })));
        }
        if (usarScholar) {
            const maxPag = parseInt((document.getElementById('antCantidad') || {}).value || '2', 10);
            tareas.push(
                ScholarDirecto.buscarPaginado(q, f.desde, maxPag).then(r => ({
                    obras: r.obras.map(o => ({ ...o, link: o.link || '', autores: o.autoresRaw ? o.autoresRaw.split(/,\s*/) : [] })),
                    info: `Scholar (${r.paginas} pág.${r.captchaEn ? `, bloqueó en ${r.captchaEn}` : ''})`
                })).catch(e => ({ obras: [], info: `Scholar falló (${e.message})` })));
        }
        if (usarAbiertas) tareas.push(
            this.buscarMulti(q, f).then(r => ({ obras: r.obras, info: `${r.fuentesOK} fuentes complementarias` }))
                .catch(e => ({ obras: [], info: `fuentes complementarias fallaron` })));

        try {
            const res = await Promise.all(tareas);
            // Combinar respetando el ORDEN: Scopus primero, luego Scholar, luego abiertas.
            const combinadas = [];
            res.forEach(r => combinadas.push(...r.obras));
            // Deduplicar por DOI/título conservando el primero (Scopus gana).
            const vistos = new Set();
            this._obras = combinadas.filter(o => {
                const k = (o.doi && o.doi.toLowerCase()) || this._norm(o.titulo);
                if (vistos.has(k)) return false;
                vistos.add(k); return true;
            });
            this._pagina = 0; // reiniciar paginación
            const infos = res.map(r => r.info).join(' · ');
            estado.textContent = this._obras.length
                ? `${avisoTraduccion}${this._obras.length} resultados combinados (${infos}). Marca los pertinentes:`
                : `${avisoTraduccion}Sin resultados. ${infos}`;
            this._renderResultados(this._obras);
            // Enriquecimiento AUTOMÁTICO en segundo plano: recupera abstracts
            // faltantes en paralelo (sin bloquear) y re-pinta al terminar.
            this._enriquecerAutomatico(this._obras);
        } catch (e) {
            estado.textContent = `No se pudo completar la búsqueda (${e.message}).`;
        }
    },

    _renderResultados(obras) {
        const POR_PAGINA = 15;
        if (this._pagina == null) this._pagina = 0;
        const total = obras.length;
        const numPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
        if (this._pagina >= numPaginas) this._pagina = numPaginas - 1;
        const ini = this._pagina * POR_PAGINA;
        const visibles = obras.slice(ini, ini + POR_PAGINA);

        const filas = visibles.map((o, j) => {
            const i = ini + j; // índice real en this._obras
            return `
            <tr>
              <td><input type="checkbox" data-i="${i}" ${this._seleccion.has(this._norm(o.titulo)) ? 'checked' : ''}></td>
              <td>${o.autores.slice(0, 3).join('; ')}${o.autores.length > 3 ? ' et al.' : ''} (${o.anio})</td>
              <td>${(o.link || o.doi) ? `<a href="${o.link || o.doi}" target="_blank">${o.titulo}</a>` : o.titulo}</td>
              <td>${o.fuente}</td><td>${o.citas}</td>
              <td>${(o.link || o.doi) ? `<a href="${o.link || o.doi}" target="_blank" title="Abrir artículo">🔗</a>` : '—'}</td>
              <td style="font-size:0.8em;color:#888;">${(o.fuentesAPI || []).join('+')}</td>
            </tr>`;
        }).join('');

        const todosVisiblesMarcados = visibles.length > 0 && visibles.every(o => this._seleccion.has(this._norm(o.titulo)));
        const controles = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-top:0.75rem; flex-wrap:wrap;">
                <label style="display:inline-flex; align-items:center; gap:0.4rem;">
                    <input type="checkbox" id="antMarcarTodos" ${todosVisiblesMarcados ? 'checked' : ''}>
                    Marcar todos (${total} resultados)
                </label>
                <span style="display:inline-flex; align-items:center; gap:0.75rem;">
                    <button id="antPrev" class="btn btn-outline" ${this._pagina === 0 ? 'disabled' : ''} style="padding:0.25rem 0.7rem;">◀</button>
                    <span class="help-text">Página ${this._pagina + 1} de ${numPaginas} — mostrando ${ini + 1}–${Math.min(ini + POR_PAGINA, total)} de ${total}</span>
                    <button id="antNext" class="btn btn-outline" ${this._pagina >= numPaginas - 1 ? 'disabled' : ''} style="padding:0.25rem 0.7rem;">▶</button>
                </span>
            </div>`;

        document.getElementById('antResultados').innerHTML = controles + `
            <div class="table-container" style="margin-top:0.5rem;"><table class="table">
              <thead><tr><th></th><th>Autores (año)</th><th>Título</th><th>Fuente</th><th>Citas</th><th>Enlace</th><th>Base</th></tr></thead>
              <tbody>${filas}</tbody></table></div>`;

        // Checkboxes individuales
        document.getElementById('antResultados').querySelectorAll('tbody input[type=checkbox]').forEach(ch =>
            ch.addEventListener('change', e => {
                const o = this._obras[+e.target.dataset.i];
                const k = this._norm(o.titulo);
                if (e.target.checked) this._seleccion.set(k, o); else this._seleccion.delete(k);
                this._renderResultados(this._obras); // refresca el "marcar todos"
                this._renderSeleccion();
            }));
        // Marcar/desmarcar TODOS (toda la búsqueda, no solo la página)
        const mt = document.getElementById('antMarcarTodos');
        if (mt) mt.addEventListener('change', e => {
            this._obras.forEach(o => {
                const k = this._norm(o.titulo);
                if (e.target.checked) this._seleccion.set(k, o); else this._seleccion.delete(k);
            });
            this._renderResultados(this._obras);
            this._renderSeleccion();
        });
        // Paginación
        const prev = document.getElementById('antPrev'), next = document.getElementById('antNext');
        if (prev) prev.addEventListener('click', () => { if (this._pagina > 0) { this._pagina--; this._renderResultados(this._obras); } });
        if (next) next.addEventListener('click', () => { if (this._pagina < numPaginas - 1) { this._pagina++; this._renderResultados(this._obras); } });
    },

    _renderSeleccion() {
        const sel = [...this._seleccion.values()];
        const cont = document.getElementById('antSeleccion');
        if (!sel.length) { cont.innerHTML = ''; this._selRef = 0; this._selMat = 0; return; }
        if (this._selRef == null) this._selRef = 0;
        if (this._selMat == null) this._selMat = 0;
        const PP = 15;

        // ----- Referencias (orden alfabético) con paginación -----
        const refs = sel.map(o => this.citaAPA(o)).sort((a, b) => a.localeCompare(b, 'es'));
        const npRef = Math.max(1, Math.ceil(refs.length / PP));
        if (this._selRef >= npRef) this._selRef = npRef - 1;
        const iniR = this._selRef * PP;
        const refsVis = refs.slice(iniR, iniR + PP);

        // ----- Matriz de revisión bibliográfica (12 columnas) con paginación -----
        const filasMatriz = sel.map(o => this._filaMatriz(o));
        const npMat = Math.max(1, Math.ceil(filasMatriz.length / PP));
        if (this._selMat >= npMat) this._selMat = npMat - 1;
        const iniM = this._selMat * PP;
        const matVis = filasMatriz.slice(iniM, iniM + PP);

        const COLS = ['Título', 'Año', 'Contexto (País)', 'Objetivos', 'Muestra', 'Instrumentos',
            'Resultados', 'Conclusiones', 'Revista', 'Indexación', 'Referencia (APA)', 'Link/DOI'];

        cont.innerHTML = `
            <h4 style="margin-top:1.25rem; display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
                <span>Referencias seleccionadas (APA 7, orden alfabético)</span>
                <button id="antCopiarRefs" class="btn btn-primary" style="padding:0.3rem 0.8rem;">📋 Copiar con formato</button>
            </h4>
            <div class="result-box" id="antRefsBox">${refsVis.map(r => `<p style="margin:0 0 0.5rem;padding-left:2rem;text-indent:-2rem;">${r}</p>`).join('')}</div>
            ${this._barraPaginas('Ref', this._selRef, npRef, iniR, refs.length, PP)}

            <h4 style="margin-top:1.5rem; display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
                <span>Matriz de revisión bibliográfica</span>
                <span style="display:inline-flex; gap:0.4rem; flex-wrap:wrap;">
                    <button id="antCsvEs" class="btn btn-primary" style="padding:0.3rem 0.8rem;" title="Separador ; — abre en columnas en Excel en español">⬇ CSV (Excel español)</button>
                    <button id="antCsvEn" class="btn btn-outline" style="padding:0.3rem 0.8rem;" title="Separador , — estándar internacional, Google Sheets y Excel en inglés">⬇ CSV (internacional)</button>
                    <button id="antEnriquecer" class="btn btn-outline" style="padding:0.3rem 0.8rem;" title="Reintenta recuperar resúmenes faltantes (ya se hace automáticamente tras buscar)">✨ Reintentar completar</button>
                </span>
            </h4>
            <div class="table-container"><table class="table" style="font-size:0.85em;">
                <thead><tr>${COLS.map(c => `<th>${c}</th>`).join('')}</tr></thead>
                <tbody>${matVis.map(f => `<tr>${f.celdas.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
            </table></div>
            ${this._barraPaginas('Mat', this._selMat, npMat, iniM, filasMatriz.length, PP)}
            <p class="help-text">Esta matriz no se completa al 100&#37; automáticamente: los objetivos, instrumentos y conclusiones a menudo solo aparecen en el cuerpo del artículo, y no todos los estudios son de acceso abierto. Los campos marcados con «[completar]» requieren tu lectura de la fuente. Verifica también país e indexación antes de citar.</p>`;

        // Copiar referencias CON FORMATO (HTML enriquecido al portapapeles)
        const btnCopiar = document.getElementById('antCopiarRefs');
        if (btnCopiar) btnCopiar.addEventListener('click', () => this._copiarReferencias(refs));
        // Exportar matriz a CSV (TODAS las filas, no solo la página)
        const btnEs = document.getElementById('antCsvEs');
        if (btnEs) btnEs.addEventListener('click', () => this._exportarCSV(COLS, filasMatriz, ';'));
        const btnEn = document.getElementById('antCsvEn');
        if (btnEn) btnEn.addEventListener('click', () => this._exportarCSV(COLS, filasMatriz, ','));
        const btnEnr = document.getElementById('antEnriquecer');
        if (btnEnr) btnEnr.addEventListener('click', () => this.enriquecerSeleccion());
        // Paginación de ambas secciones
        this._cablearPaginas('Ref', () => this._selRef, v => { this._selRef = v; this._renderSeleccion(); }, npRef);
        this._cablearPaginas('Mat', () => this._selMat, v => { this._selMat = v; this._renderSeleccion(); }, npMat);
    },

    // Enriquecimiento AUTOMÁTICO tras cada búsqueda: recupera abstracts de las
    // obras que no lo traen, EN PARALELO con límite de concurrencia, y re-pinta
    // la vista cuando termina (sin que el usuario lo pida). No bloquea la UI.
    async _enriquecerAutomatico(obras) {
        // Procesar las que les falta resumen O tienen enlace dudoso, no intentadas.
        const pendientes = obras.filter(o => (!o.resumen || o.resumen.length < 40) && !o._intentadoEnriquecer);
        if (!pendientes.length) return;
        pendientes.forEach(o => o._intentadoEnriquecer = true);
        const CONCURRENCIA = 5;
        let idx = 0, cambios = 0;
        const trabajador = async () => {
            while (idx < pendientes.length) {
                const o = pendientes[idx++];
                const doi = o.doi || (o.link && /doi\.org/.test(o.link) ? o.link : '');
                let datos = null;
                if (doi) {
                    datos = await this._recuperarDatos(doi);
                } else {
                    // Sin DOI: buscar el artículo por su título (versión legítima del scraping).
                    const porTit = await this._resolverPorTitulo(o.titulo);
                    if (porTit) { datos = { abstract: porTit.abstract, link: porTit.link }; if (porTit.doi && !o.doi) o.doi = porTit.doi; }
                }
                if (datos) {
                    if (datos.abstract) { o.resumen = datos.abstract; o._enriquecido = true; cambios++; }
                    // Reparar enlace: si el actual falta o no es OA, usar el mejor hallado.
                    if (datos.link && (!o.link || o.link === o.doi)) { o.link = datos.link; cambios++; }
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, pendientes.length) }, () => trabajador()));
        const estado = document.getElementById('antEstado');
        if (estado && pendientes.length) {
            const dbg = (typeof window !== 'undefined' && window.__enrichDebug) ? window.__enrichDebug : {};
            const resumen = Object.entries(dbg).map(([k, v]) => `${k}×${v}`).join(', ');
            estado.textContent = (estado.textContent || '') + ` · Autocompletado: ${cambios} campos en ${pendientes.length} artículos.` + (resumen ? ` [${resumen}]` : '');
        }
        if (cambios) {
            this._renderResultados(this._obras);
            if (this._seleccion.size) this._renderSeleccion();
        }
    },

    // Recupera el abstract de un DOI probando Crossref y OpenAlex (gratis, CORS).
    // OpenAlex suele tener más abstracts que Crossref para psicología.
    // Diagnóstico de enriquecimiento: registra el resultado de cada fuente en
    // window.__enrichDebug para inspeccionarlo desde consola si algo falla.
    _enrichDbg(fuente, resultado) {
        if (typeof window === 'undefined') return;
        window.__enrichDebug = window.__enrichDebug || {};
        const k = `${fuente}: ${resultado.split(':')[0]}`;
        window.__enrichDebug[k] = (window.__enrichDebug[k] || 0) + 1;
    },

    // Recupera abstract Y el mejor enlace de acceso abierto desde 4 APIs que
    // agregan contenido legalmente. El enlace OA reemplaza enlaces rotos (404),
    // priorizando PDF/landing abiertos y, como último recurso, el resolvedor DOI.
    async _recuperarDatos(doi) {
        if (!doi) return { abstract: '', link: '' };
        const limpio = doi.replace(/^https?:\/\/doi\.org\//, '').trim();
        const limpiar = s => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        let abstract = '', link = '';

        // 1) OpenAlex: abstract + ubicación OA. Se usa el filtro doi: (el slash
        // del DOI debe ir LITERAL; encodeURIComponent en el path lo rompía con %2F).
        try {
            const r = await fetch(`https://api.openalex.org/works/doi:${limpio}`);
            this._enrichDbg('OpenAlex', r.ok ? 'ok' : ('HTTP ' + r.status));
            if (r.ok) {
                const d = await r.json();
                if (d.abstract_inverted_index) { const t = this.reconstruirAbstract(d.abstract_inverted_index); if (t && t.length > 40) abstract = t; }
                const oa = d.best_oa_location || d.primary_location;
                if (oa) link = oa.pdf_url || oa.landing_page_url || link;
                if (!link && d.open_access && d.open_access.oa_url) link = d.open_access.oa_url;
            }
        } catch (e) { this._enrichDbg('OpenAlex', 'CORS/red: ' + e.message); }

        // 2) Crossref (si falta abstract).
        if (!abstract) {
            try {
                const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(limpio)}`);
                this._enrichDbg('Crossref', r.ok ? 'ok' : ('HTTP ' + r.status));
                if (r.ok) { const d = await r.json(); const a = d.message && d.message.abstract;
                    if (a) { const t = limpiar(a); if (t.length > 40) abstract = t; } }
            } catch (e) { this._enrichDbg('Crossref', 'CORS/red: ' + e.message); }
        }

        // 3) Semantic Scholar (abstract + PDF de acceso abierto como enlace).
        if (!abstract || !link) {
            try {
                const r = await fetch(`https://api.semanticscholar.org/graph/v1/paper/DOI:${limpio}?fields=abstract,openAccessPdf`);
                this._enrichDbg('SemanticScholar', r.ok ? 'ok' : ('HTTP ' + r.status));
                if (r.ok) { const d = await r.json();
                    if (!abstract && d.abstract) { const t = limpiar(d.abstract); if (t.length > 40) abstract = t; }
                    if (!link && d.openAccessPdf && d.openAccessPdf.url) link = d.openAccessPdf.url; }
            } catch (e) { this._enrichDbg('SemanticScholar', 'CORS/red: ' + e.message); }
        }

        // 4) Europe PMC (abstract + texto completo abierto cuando existe).
        if (!abstract || !link) {
            try {
                const r = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:${encodeURIComponent(limpio)}&resultType=core&format=json`);
                this._enrichDbg('EuropePMC', r.ok ? 'ok' : ('HTTP ' + r.status));
                if (r.ok) { const d = await r.json();
                    const res = d.resultList && d.resultList.result && d.resultList.result[0];
                    if (res) {
                        if (!abstract && res.abstractText) { const t = limpiar(res.abstractText); if (t.length > 40) abstract = t; }
                        if (!link && res.fullTextUrlList && res.fullTextUrlList.fullTextUrl) {
                            const ftl = res.fullTextUrlList.fullTextUrl;
                            const abierto = ftl.find(x => x.availabilityCode === 'OA' || x.availability === 'Open access') || ftl[0];
                            if (abierto && abierto.url) link = abierto.url;
                        }
                    } }
            } catch (e) {}
        }

        // 5) Unpaywall: API especializada en localizar copias de ACCESO ABIERTO
        // LEGALES (preprint del autor, repositorio institucional, etc.). Requiere
        // un email como identificador (sin API key). Su enlace OA es el mas fiable.
        try {
            const r = await fetch(`https://api.unpaywall.org/v2/${limpio}?email=${this.CONFIG.UNPAYWALL_EMAIL}`);
            this._enrichDbg('Unpaywall', r.ok ? 'ok' : ('HTTP ' + r.status));
            if (r.ok) {
                const d = await r.json();
                const oa = d.best_oa_location;
                if (oa && (oa.url_for_pdf || oa.url)) link = oa.url_for_pdf || oa.url;
            }
        } catch (e) { this._enrichDbg('Unpaywall', 'CORS/red: ' + e.message); }

        // Enlace por defecto: el resolvedor DOI (redirige al editor; no es 404 si el DOI es válido).
        if (!link && limpio) link = `https://doi.org/${limpio}`;
        return { abstract, link };
    },

    // FALLBACK para artículos SIN DOI: busca el título en OpenAlex/Crossref para
    // hallar el registro real, su DOI, abstract y enlace. Es la versión legítima
    // y fiable de "buscar el título en Google para encontrar el artículo".
    async _resolverPorTitulo(titulo) {
        if (!titulo || titulo.length < 10) return null;
        try {
            const r = await fetch(`https://api.openalex.org/works?filter=title.search:${encodeURIComponent(titulo)}&per-page=1`);
            if (r.ok) {
                const d = await r.json();
                const w = d.results && d.results[0];
                if (w && this._norm(w.title || '').includes(this._norm(titulo).slice(0, 30))) {
                    const datos = { abstract: '', link: '', doi: w.doi || '' };
                    if (w.abstract_inverted_index) { const t = this.reconstruirAbstract(w.abstract_inverted_index); if (t && t.length > 40) datos.abstract = t; }
                    const oa = w.best_oa_location || w.primary_location;
                    if (oa) datos.link = oa.pdf_url || oa.landing_page_url || '';
                    if (!datos.link && w.doi) datos.link = w.doi;
                    return datos;
                }
            }
        } catch (e) {}
        return null;
    },

    // Enriquece las obras SELECCIONADAS: para las que tienen DOI pero les falta
    // resumen, baja el abstract de Crossref y re-extrae objetivos/muestra/etc.
    // Procesa en serie con pausa breve (cortesía con la API gratuita).
    async enriquecerSeleccion() {
        const estado = document.getElementById('antEstado');
        const sel = [...this._seleccion.values()];
        if (!sel.length) {
            if (estado) estado.textContent = 'Primero marca (✓) los artículos que quieres completar en la tabla de resultados de arriba.';
            return;
        }
        const pendientes = sel.filter(o => (o.doi || o.link) && (!o.resumen || o.resumen.length < 40));
        if (!pendientes.length) {
            if (estado) estado.textContent = 'Los artículos seleccionados ya tienen resumen o no tienen DOI; nada que completar.';
            return;
        }
        const sinDOI = sel.filter(o => !(o.doi || o.link) && (!o.resumen || o.resumen.length < 40)).length;
        let logrados = 0, sinAbstract = 0;
        for (let i = 0; i < pendientes.length; i++) {
            const o = pendientes[i];
            if (estado) estado.textContent = `Buscando resumen ${i + 1}/${pendientes.length} (Crossref + OpenAlex)…`;
            const doi = o.doi || (o.link && /doi\.org/.test(o.link) ? o.link : '');
            const datos = doi ? await this._recuperarDatos(doi) : (await this._resolverPorTitulo(o.titulo)) || { abstract: '', link: '' };
            if (datos.abstract) { o.resumen = datos.abstract; o._enriquecido = true; logrados++; } else { sinAbstract++; }
            if (datos.link && (!o.link || o.link === o.doi)) o.link = datos.link;
            await new Promise(r => setTimeout(r, 200));
        }
        // Mensaje honesto y detallado de qué se logró y qué no.
        let msg = `✓ ${logrados} de ${pendientes.length} artículos enriquecidos con su resumen.`;
        if (sinAbstract) msg += ` ${sinAbstract} no tienen resumen disponible en las bases abiertas.`;
        if (sinDOI) msg += ` ${sinDOI} no tienen DOI (no se pueden enriquecer).`;
        if (estado) estado.textContent = msg;
        this._renderSeleccion(); // re-pintar con los nuevos datos
    },

    // Construye las 12 celdas (HTML para mostrar) y los 12 valores planos (CSV).
    _filaMatriz(o) {
        const ref = this.citaAPA(o).replace(/<\/?i>/g, '');
        const link = o.link || o.doi || '';
        const pais = this._detectarPais(o);
        const muestra = this._detectarMuestra(o);
        const objetivo = this._detectarObjetivo(o);
        const indexacion = this._detectarIndexacion(o);
        const ph = '<span style="color:#aaa;">[completar]</span>';
        const celdas = [
            o.titulo || ph,
            o.anio || '',
            pais || ph,
            objetivo || ph,
            muestra || ph,
            ph, // instrumentos: no disponible en metadatos
            o.resumen ? (o.resumen.slice(0, 200) + (o.resumen.length > 200 ? '…' : '')) : ph, // resultados ≈ resumen
            ph, // conclusiones: requiere texto completo
            o.fuente || ph,
            indexacion || ph,
            ref,
            link ? `<a href="${link}" target="_blank">${link}</a>` : ph
        ];
        const planas = [
            o.titulo || '', o.anio || '', pais, objetivo, muestra, '',
            o.resumen || '', '', o.fuente || '', indexacion, ref, link
        ];
        return { celdas, planas };
    },

    _barraPaginas(tag, pagina, num, ini, total, pp) {
        if (num <= 1) return '';
        return `<div style="display:flex; align-items:center; justify-content:flex-end; gap:0.75rem; margin-top:0.5rem;">
            <button id="ant${tag}Prev" class="btn btn-outline" ${pagina === 0 ? 'disabled' : ''} style="padding:0.2rem 0.6rem;">◀</button>
            <span class="help-text">Página ${pagina + 1} de ${num} — ${ini + 1}–${Math.min(ini + pp, total)} de ${total}</span>
            <button id="ant${tag}Next" class="btn btn-outline" ${pagina >= num - 1 ? 'disabled' : ''} style="padding:0.2rem 0.6rem;">▶</button>
        </div>`;
    },
    _cablearPaginas(tag, get, set, num) {
        const prev = document.getElementById(`ant${tag}Prev`), next = document.getElementById(`ant${tag}Next`);
        if (prev) prev.addEventListener('click', () => { if (get() > 0) set(get() - 1); });
        if (next) next.addEventListener('click', () => { if (get() < num - 1) set(get() + 1); });
    },

    // Copia las referencias al portapapeles CON FORMATO (cursivas reales).
    async _copiarReferencias(refs) {
        const estado = document.getElementById('antEstado');
        const html = refs.map(r => `<p style="margin:0 0 10pt 36pt; text-indent:-36pt;">${r}</p>`).join('');
        const plano = refs.map(r => r.replace(/<\/?i>/g, '')).join('\n\n');
        try {
            if (navigator.clipboard && window.ClipboardItem) {
                await navigator.clipboard.write([new ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' }),
                    'text/plain': new Blob([plano], { type: 'text/plain' })
                })]);
            } else {
                await navigator.clipboard.writeText(plano);
            }
            if (estado) estado.textContent = `${refs.length} referencias copiadas con formato. Pégalas en Word.`;
        } catch (e) {
            if (estado) estado.textContent = 'No se pudo copiar automáticamente; selecciona y copia manualmente.';
        }
    },

    // Exporta la matriz COMPLETA a CSV (UTF-8 con BOM para Excel).
    // sep=';' → Excel en español (abre en columnas con doble clic).
    // sep=',' → estándar internacional (Google Sheets, Excel en inglés).
    _exportarCSV(cols, filas, SEP = ';') {
        const esc = v => {
            const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
            // Se entrecomilla si el campo contiene el separador, comillas o saltos.
            return new RegExp('["\\n' + (SEP === ';' ? ';' : ',') + ']').test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        // Solo el formato español lleva la pista "sep=;" (Excel-ES la respeta);
        // el internacional se mantiene como CSV puro, que Sheets/Excel-EN ya leen.
        const lineas = SEP === ';' ? ['sep=;'] : [];
        lineas.push(cols.map(esc).join(SEP));
        filas.forEach(f => lineas.push(f.planas.map(esc).join(SEP)));
        const blob = new Blob(['\ufeff' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = SEP === ';' ? 'matriz_revision_es.csv' : 'matriz_revision_intl.csv';
        a.click();
        URL.revokeObjectURL(a.href);
        const estado = document.getElementById('antEstado');
        if (estado) estado.textContent = `Matriz exportada (${filas.length} artículos) en CSV.`;
    }
};

if (typeof window !== 'undefined') {
    window.Antecedentes = Antecedentes;
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => Antecedentes.montar());
    } else {
        Antecedentes.montar();
    }
}
