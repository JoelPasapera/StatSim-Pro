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
        const candidatas = [
            ['Semantic Scholar', () => this._fetchJSON(this.urlSemantic(query, f)).then(d => (d.data || []).map(x => this.normSemantic(x)))],
            ['OpenAlex', () => this._fetchJSON(this.urlOpenAlex(query, f)).then(d => (d.results || []).map(x => this.normOpenAlex(x)))],
            ['Crossref', () => this._fetchJSON(this.urlCrossref(query, f)).then(d => ((d.message && d.message.items) || []).map(x => this.normCrossref(x)))]
        ];
        const nombresFuentes = candidatas.map(c => c[0]);
        const tareas = candidatas.map(c => c[1]());
        const res = await Promise.allSettled(tareas);
        const listas = res.filter(r => r.status === 'fulfilled').map(r => r.value);
        const caidas = res.filter(r => r.status === 'rejected').length;
        // Desglose por fuente: hace visible qué respondió y qué falló (p. ej. CORS).
        const detalle = res.map((r, i) => r.status === 'fulfilled'
            ? `${nombresFuentes[i]}: ${r.value.length}`
            : `${nombresFuentes[i]}: ⚠️`).join(' · ');
        res.forEach((r, i) => { if (r.status === 'rejected') console.warn(`[Buscador] ${nombresFuentes[i]} falló:`, r.reason); });
        if (!listas.length) throw new Error('ninguna fuente respondió');
        return { obras: this.fusionar(listas, query, f.idioma), fuentesOK: listas.length, caidas, detalle };
    },

    // ---- OMS · IRIS (repositorio institucional, DSpace 7 REST) ----
    // Guías, informes técnicos y publicaciones oficiales de la OMS — citables
    // como (Organización Mundial de la Salud, año). Endpoint estándar DSpace 7:
    // /server/api/discover/search/objects?query=&page=&size=  (JSON HAL).
    // Lee la cantidad de una cajita numérica (0 permitido = fuente desactivada).
    _nInput(id, porDefecto) {
        const el = document.getElementById(id);
        const n = el ? parseInt(el.value, 10) : NaN;
        return Number.isFinite(n) && n >= 0 ? n : porDefecto;
    },

    // ------------------------------------------------------------------
    // DIRECTO PRIMERO, PROXY DE RESCATE: los endpoints de la OMS (IRIS) y la
    // ONU (Biblioteca Digital) son oficiales y públicos, pero eso no implica
    // que sus servidores envíen cabeceras CORS: sin ellas, el NAVEGADOR bloquea
    // la lectura aunque el endpoint responda bien. Estrategia óptima:
    //   1) intentar la petición directa (si hay CORS: rápida y sin límites);
    //   2) si el navegador la bloquea, rescatar vía ProxiesCORS.carrera
    //      (paralela, con salud y cuarentena — el módulo del proyecto);
    //   3) cachear por URL en la sesión: la búsqueda intensiva repite
    //      consultas entre variantes y así no gastamos peticiones de más.
    // ------------------------------------------------------------------
    _cacheJSON: new Map(),
    async _fetchJSONConRescate(url, op = {}) {
        if (this._cacheJSON.has(url)) return this._cacheJSON.get(url);
        let dato;
        try {
            dato = await this._fetchJSON(url); // 1) directo
        } catch (e) {
            if (typeof ProxiesCORS === 'undefined') throw e;
            // 2) rescate: la carrera valida que el cuerpo sea JSON parseable.
            const r = await ProxiesCORS.carrera(url, txt => {
                try { const j = JSON.parse(txt); return j ? [j] : null; }
                catch (_) { return null; }
            }, { anchura: 3, timeout: op.timeout || 12000 });
            dato = r.obras[0];
        }
        this._cacheJSON.set(url, dato); // 3) caché de sesión
        return dato;
    },

    // Igual que el anterior, pero para respuestas de TEXTO (p. ej. MARCXML).
    async _fetchTextoConRescate(url, validar, op = {}) {
        if (this._cacheJSON.has(url)) return this._cacheJSON.get(url);
        let txt;
        try {
            const r = await fetch(url);
            if (!r.ok) throw new Error('HTTP' + r.status);
            txt = await r.text();
            if (!validar(txt)) throw new Error('respuesta no válida');
        } catch (e) {
            if (typeof ProxiesCORS === 'undefined') throw e;
            const r = await ProxiesCORS.carrera(url, t => validar(t) ? [t] : null,
                { anchura: 3, timeout: op.timeout || 20000 });
            txt = r.obras[0];
        }
        this._cacheJSON.set(url, txt);
        return txt;
    },

    urlIRIS(query, f = {}) {
        const p = new URLSearchParams({ query: String(query).trim(), page: '0',
            size: String(this._nInput('antNumOMS', this.CONFIG.POR_FUENTE)), dsoType: 'item', sort: 'score,DESC' });
        return `https://iris.who.int/server/api/discover/search/objects?${p.toString()}`;
    },
    normIRIS(o) {
        // o = indexableObject de DSpace: { uuid, name, metadata: { 'dc.x': [{value}] } }
        const md = (o && o.metadata) || {};
        const uno = c => (md[c] && md[c][0] && md[c][0].value) || '';
        const todos = c => (md[c] || []).map(x => x.value).filter(Boolean);
        const anioTxt = uno('dc.date.issued');
        const anio = (anioTxt.match(/\d{4}/) || [])[0] || 's. f.';
        const autores = todos('dc.contributor.author');
        const uri = uno('dc.identifier.uri');
        return {
            titulo: uno('dc.title') || o.name || '(sin título)',
            autores: autores.length ? autores : ['Organización Mundial de la Salud'],
            anio, doi: (uno('dc.identifier.doi') || '').replace(/^https?:\/\/doi\.org\//, ''),
            fuente: 'OMS · IRIS', volumen: '', numero: '', paginas: '',
            citas: 0, idioma: uno('dc.language.iso') || '',
            resumen: uno('dc.description.abstract'),
            link: uri || (o.uuid ? `https://iris.who.int/items/${o.uuid}` : ''),
            fuentesAPI: ['OMS/IRIS']
        };
    },
    // Extrae los items del sobre HAL de DSpace con tolerancia a variantes.
    _extraerIRIS(d) {
        const objs = (d && d._embedded && d._embedded.searchResult
            && d._embedded.searchResult._embedded
            && d._embedded.searchResult._embedded.objects) || [];
        return objs.map(x => (x && x._embedded && x._embedded.indexableObject) || null)
            .filter(o => o && (!o.type || /item/i.test(o.type)));
    },

    // ---- ONU · Biblioteca Digital (digitallibrary.un.org, Invenio) ----
    // Documentos oficiales, informes y publicaciones insignia de Naciones Unidas.
    // API JSON documentada: /search?p=&of=recjson&ot=campos&rg=N
    urlUNDL(query, f = {}) {
        const p = new URLSearchParams({ p: String(query).trim(), of: 'recjson',
            rg: String(this._nInput('antNumONU', this.CONFIG.POR_FUENTE)) });
        return `https://digitallibrary.un.org/search?${p.toString()}`;
    },
    normUNDL(o) {
        // recjson de Invenio: los campos pueden ser string u objeto según el registro.
        const texto = x => {
            if (!x) return '';
            if (typeof x === 'string') return x;
            if (Array.isArray(x)) return texto(x[0]);
            return x.title || x.summary || x.a || x.value || '';
        };
        const titulo = texto(o.title) || '(sin título)';
        const resumen = texto(o.abstract);
        const autores = (Array.isArray(o.authors) ? o.authors : [])
            .map(a => (a && (a.full_name || a.last_name)) || (typeof a === 'string' ? a : ''))
            .filter(Boolean);
        const crudoFecha = [texto(o.imprint && o.imprint.date), o.creation_date, texto(o.publication_info)].join(' ');
        const anio = (String(crudoFecha).match(/(19|20)\d{2}/) || [])[0] || 's. f.';
        return {
            titulo, autores: autores.length ? autores : ['Naciones Unidas'],
            anio, doi: '', fuente: 'ONU · Biblioteca Digital', volumen: '', numero: '', paginas: '',
            citas: 0, idioma: '', resumen,
            link: o.recid ? `https://digitallibrary.un.org/record/${o.recid}` : '',
            fuentesAPI: ['ONU/UNDL']
        };
    },
    _extraerUNDL(d) { return Array.isArray(d) ? d.filter(x => x && (x.recid || x.title)) : []; },

    // Plan B de la ONU: MARCXML (of=xm), el formato bibliotecario cacheado de
    // Invenio — más lento de pedir pero mucho más estable que recjson.
    // Campos MARC: 245 título · 100 autor persona · 110/710 autor CORPORATIVO ·
    // 520 resumen · 260/264 $c año · controlfield 001 número de registro.
    // ReliefWeb (OCHA/ONU): la vía OFICIAL para acceso programático a informes
    // de la ONU y sus agencias — API JSON pública con CORS abierto, pensada para
    // llamarse directo desde el navegador (sin proxies). Límite amable: 1000/día.
    // Desde nov-2025 piden appname pre-aprobado; se intenta el propio y, si lo
    // rechazan, el de los ejemplos oficiales de su documentación.
    urlReliefWeb(query, f = {}, appname = 'statsim-pro') {
        const p = new URLSearchParams({ appname, 'query[value]': String(query).trim(),
            limit: String(this._nInput('antNumONU', this.CONFIG.POR_FUENTE)) });
        ['title', 'date', 'source', 'url', 'body'].forEach(c => p.append('fields[include][]', c));
        if (f.desde) {
            p.append('filter[field]', 'date.created');
            p.append('filter[value][from]', `${f.desde}-01-01T00:00:00+00:00`);
        }
        return `https://api.reliefweb.int/v1/reports?${p.toString()}`;
    },
    normReliefWeb(o) {
        const c = (o && o.fields) || {};
        const fuentes = (c.source || []).map(s => s && (s.name || s.shortname)).filter(Boolean);
        const anio = ((c.date && (c.date.original || c.date.created) || '').match(/(19|20)\d{2}/) || [])[0] || 's. f.';
        const resumen = String(c.body || '').replace(/\s+/g, ' ').trim().slice(0, 400);
        return {
            titulo: c.title || '(sin título)',
            autores: fuentes.length ? fuentes : ['Naciones Unidas'],
            anio, doi: '', fuente: 'ONU · ReliefWeb', volumen: '', numero: '', paginas: '',
            citas: 0, idioma: '', resumen,
            link: c.url || (o && o.href) || '',
            fuentesAPI: ['ONU/ReliefWeb']
        };
    },

    urlUNDLxm(query, f = {}) {
        const p = new URLSearchParams({ p: String(query).trim(), of: 'xm',
            rg: String(this._nInput('antNumONU', this.CONFIG.POR_FUENTE)) });
        return `https://digitallibrary.un.org/search?${p.toString()}`;
    },
    _parseMARCXML(xmlTexto) {
        try {
            const doc = new DOMParser().parseFromString(xmlTexto, 'text/xml');
            const registros = [...doc.getElementsByTagName('record')];
            const sub = (rec, tag, code) => [...rec.getElementsByTagName('datafield')]
                .filter(d => d.getAttribute('tag') === tag)
                .flatMap(d => [...d.getElementsByTagName('subfield')]
                    .filter(s => !code || s.getAttribute('code') === code)
                    .map(s => s.textContent.trim()))
                .filter(Boolean);
            return registros.map(rec => {
                const recid = ([...rec.getElementsByTagName('controlfield')]
                    .find(c => c.getAttribute('tag') === '001') || {}).textContent || '';
                const titulo = [sub(rec, '245', 'a')[0], sub(rec, '245', 'b')[0]]
                    .filter(Boolean).join(' ').replace(/\s*[\/:]\s*$/, '').trim();
                const autores = [...sub(rec, '100', 'a'), ...sub(rec, '110', 'a'), ...sub(rec, '710', 'a')]
                    .map(a => a.replace(/[.,]\s*$/, '').trim()).filter(Boolean);
                const anio = ((sub(rec, '260', 'c')[0] || sub(rec, '264', 'c')[0] || '')
                    .match(/(19|20)\d{2}/) || [])[0] || 's. f.';
                return {
                    titulo: titulo || '(sin título)',
                    autores: autores.length ? autores : ['Naciones Unidas'],
                    anio, doi: '', fuente: 'ONU · Biblioteca Digital', volumen: '', numero: '',
                    paginas: '', citas: 0, idioma: '',
                    resumen: sub(rec, '520', 'a')[0] || '',
                    link: recid ? `https://digitallibrary.un.org/record/${recid.trim()}` : '',
                    fuentesAPI: ['ONU/UNDL']
                };
            }).filter(o => o.titulo !== '(sin título)' || o.link);
        } catch (e) { return []; }
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

    // Insignia de cuartil con color para mostrar en la tabla (HTML).
    _insigniaCuartil(o) {
        if (!o._metricas || !o._metricas.cuartil) return '';
        const m = o._metricas;
        const colores = { Q1: ['#E1F5EE', '#085041'], Q2: ['#EAF3DE', '#27500A'], Q3: ['#FAEEDA', '#633806'], Q4: ['#FCEBEB', '#791F1F'] };
        const [bg, fg] = colores[m.cuartil] || ['#F1EFE8', '#444441'];
        const cs = m.citeScore ? `<div style="font-size:0.75rem; color:#666; margin-top:3px;">CiteScore ${m.citeScore}</div>` : '';
        return `<span style="display:inline-block; background:${bg}; color:${fg}; font-size:0.78rem; font-weight:600; padding:2px 8px; border-radius:6px;">${m.cuartil}</span>${cs}`;
    },

    // Texto plano del cuartil (para CSV): "Q1, CiteScore 4.8".
    _cuartilTexto(o) {
        if (!o._metricas || !o._metricas.cuartil) return '';
        const m = o._metricas;
        return m.cuartil + (m.citeScore ? `, CiteScore ${m.citeScore}` : '');
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
    // Convierte un nombre de autor (en cualquiera de los formatos que devuelven
    // las APIs) a APA: "Apellido, I. I.". Detecta las INICIALES (tokens de una
    // letra, con o sin punto, p. ej. "E.", "EB", "J.A.") para no confundirlas
    // con el apellido:  "Batbayar E." → Batbayar, E. · "E. Batbayar" → Batbayar, E.
    // · "Juan García" → García, J. · "García, J." → García, J. (idempotente).
    _esInicial(tok) {
        return /^([A-ZÁÉÍÓÚÑ]\.?){1,3}$/.test(tok.replace(/\./g, '.'));
    },
    // ¿Autor corporativo? (organismos, ministerios, universidades…). En APA 7ª
    // se escriben con su nombre completo, SIN invertir ni reducir a iniciales.
    _esCorporativo(n) {
        return /\(|organi[sz]ation|organizaci[oó]n|nations|naciones|unicef|unesco|world health|pan american|panamericana|ministerio|ministry|fondo|\bfund\b|programme|programa|instituto|institute|universidad|university|agencia|agency|centro|centre|center|comit[eé]|committee|asociaci[oó]n|association|banco|\bbank\b|secretar[ií]a|department|departamento|oficina|office/i.test(n);
    },
    _autorAPA(nombre) {
        const n = String(nombre || '').trim();
        if (!n) return '';
        if (this._esCorporativo(n)) return n.replace(/\s+/g, ' ');
        if (n.includes(',')) {
            // Ya viene "Apellido, Iniciales": normalizar puntos de las iniciales.
            const [ape, resto] = [n.split(',')[0].trim(), n.split(',').slice(1).join(',').trim()];
            const ini = resto.split(/\s+/).filter(Boolean)
                .map(p => this._esInicial(p)
                    ? p.replace(/\./g, '').split('').map(c => c.toUpperCase() + '.').join(' ')
                    : p[0].toUpperCase() + '.')
                .join(' ');
            return ini ? `${ape}, ${ini}` : ape;
        }
        const partes = n.split(/\s+/);
        if (partes.length === 1) return partes[0];
        const inicialesFin = [], inicialesIni = [];
        let i = partes.length - 1;
        while (i > 0 && this._esInicial(partes[i])) { inicialesFin.unshift(partes[i]); i--; }
        let j = 0;
        while (j < partes.length - 1 && this._esInicial(partes[j])) { inicialesIni.push(partes[j]); j++; }
        let apellidoTokens, inicialesTokens;
        if (inicialesFin.length) {          // "Batbayar E." / "De la Cruz J. A."
            apellidoTokens = partes.slice(0, partes.length - inicialesFin.length);
            inicialesTokens = inicialesFin;
        } else if (inicialesIni.length) {   // "E. Batbayar" / "J. A. de la Cruz"
            apellidoTokens = partes.slice(inicialesIni.length);
            inicialesTokens = inicialesIni;
        } else {                            // "Juan García" (nombres completos)
            apellidoTokens = [partes[partes.length - 1]];
            inicialesTokens = partes.slice(0, -1);
        }
        const apellido = apellidoTokens.join(' ');
        const ini = inicialesTokens.map(p => this._esInicial(p)
            ? p.replace(/\./g, '').split('').map(c => c.toUpperCase() + '.').join(' ')
            : p[0].toUpperCase() + '.').join(' ');
        return ini ? `${apellido}, ${ini}` : apellido;
    },
    _autoresAPA(autores) {
        const a = autores.map(n => this._autorAPA(n));
        if (!a.length) return '';
        if (a.length === 1) return a[0];
        if (a.length === 2) return `${a[0]} y ${a[1]}`;
        if (a.length <= 20) return `${a.slice(0, -1).join(', ')} y ${a[a.length - 1]}`;
        return `${a.slice(0, 19).join(', ')}, ... ${a[a.length - 1]}`;
    },
    citaAPA(o) {
        // APA 7ª: el bloque de autores cierra con punto. Las personas ya lo
        // traen en la inicial (García, J.), pero los corporativos no — se añade
        // solo cuando falta, sin duplicarlo jamás.
        let aut = this._autoresAPA(o.autores);
        if (aut && !aut.endsWith('.')) aut += '.';
        let c = `${aut} (${o.anio}). ${o.titulo}.`;
        if (o.fuente) {
            // Informes de organismos (OMS/ONU): en APA 7ª la editorial es el
            // propio organismo, no una "revista" — y va en redonda.
            const esInstitucional = /^(OMS · IRIS|ONU · Biblioteca Digital)$/.test(o.fuente);
            if (esInstitucional) {
                const editorial = (o.autores && o.autores[0] && this._esCorporativo(o.autores[0]))
                    ? o.autores[0]
                    : (o.fuente.startsWith('OMS') ? 'Organización Mundial de la Salud' : 'Naciones Unidas');
                c += ` ${editorial}.`;
            } else {
                c += ` <i>${o.fuente}</i>`;
                if (o.volumen) c += `, <i>${o.volumen}</i>${o.numero ? `(${o.numero})` : ''}`;
                if (o.paginas) c += `, ${o.paginas}`;
                c += '.';
            }
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
                  <label class="label">Problema de investigación / términos de búsqueda</label>
                  <textarea id="antQuery" class="input" rows="2" style="resize:vertical;"
                    placeholder="Ej.: ¿Existe relación entre la inteligencia emocional y el rendimiento académico en universitarios de Lima? — o simplemente: inteligencia emocional rendimiento académico">${sugerida}</textarea>
                  <p class="help-text" style="margin:0.3rem 0 0; font-size:0.85em;">Un solo campo para ambas búsquedas: la <b>individual</b> lo usa tal cual; la <b>intensiva</b> lo toma como semilla para generar variantes con IA.</p>
                  <div id="antSinonimos" class="help-text" style="margin-top:0.35rem;"></div>
                </div>
                <div class="form-group"><label class="label">Desde el año</label>
                  <input type="number" id="antDesde" class="input" value="${new Date().getFullYear() - 5}"></div>
                <div class="form-group"><label class="label">Priorizar idioma</label>
                  <select id="antIdioma" class="input"><option value="">Indistinto</option>
                  <option value="es" selected>Español</option><option value="en">Inglés</option></select></div>
                <div class="form-group"><label class="label">Resultados (OMS)</label>
                  <input type="number" id="antNumOMS" class="input" value="15" min="0" max="50" step="1"
                    title="Informes y guías del repositorio IRIS de la OMS. 0 = no consultar."></div>
                <div class="form-group"><label class="label">Resultados (Scholar)</label>
                  <select id="antCantidad" class="input"><option value="1">10 (rápido)</option>
                  <option value="2" selected>20</option><option value="3">30 (más lento)</option></select></div>
                <div class="form-group"><label class="label">Resultados (ONU)</label>
                  <input type="number" id="antNumONU" class="input" value="10" min="0" max="25" step="1"
                    title="Biblioteca Digital de la ONU (su API responde lento: cifras moderadas). 0 = no consultar."></div>
                <div class="form-group"><label class="label">Resultados (Scopus)</label>
                  <select id="antCantidadScopus" class="input"><option value="25">25</option>
                  <option value="50">50</option><option value="100" selected>100</option>
                  <option value="200">200 (más lento)</option><option value="300">300 (más lento)</option>
                  <option value="500">500 (revisión exhaustiva)</option></select></div>
                <div class="form-group"><label class="label">Resultados (PubMed)</label>
                  <select id="antCantidadPubmed" class="input"><option value="50">50</option>
                  <option value="100" selected>100</option><option value="200">200</option>
                  <option value="300">300 (más lento)</option><option value="500">500 (revisión exhaustiva)</option></select></div>
                <div class="form-group"><label class="label">Resultados (SciELO)</label>
                  <select id="antCantidadScielo" class="input"><option value="50">50</option>
                  <option value="100" selected>100</option><option value="200">200</option>
                  <option value="300">300 (más lento)</option><option value="500">500 (revisión exhaustiva)</option></select></div>
                <div class="form-group"><label class="label">Resultados (ALICIA)</label>
                  <select id="antCantidadAlicia" class="input"><option value="50">50</option>
                  <option value="100" selected>100</option><option value="200">200</option>
                  <option value="300">300 (más lento)</option><option value="500">500 (revisión exhaustiva)</option></select></div>
              </div>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.4rem;">
                <input type="checkbox" id="antUsarScholar" checked> Intentar Google Académico directo (experimental, vía proxy)
              </label><br>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.4rem;">
                <input type="checkbox" id="antUsarScopus" checked> Buscar en Scopus (Elsevier, vía proxy)
              </label><br>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.6rem;">
                <input type="checkbox" id="antUsarPubmed" checked> Buscar en PubMed (NCBI — psicología clínica, salud, neurociencia)
              </label><br>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.6rem;">
                <input type="checkbox" id="antUsarScielo" checked> Buscar en SciELO (investigación latinoamericana en español)
              </label><br>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.6rem;">
                <input type="checkbox" id="antUsarAlicia" checked> Buscar en ALICIA (tesis y producción científica peruana — CONCYTEC)
              </label><br>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.6rem;">
                <input type="checkbox" id="antUsarOMS" checked> Buscar en OMS (IRIS — guías e informes oficiales de salud; API oficial con proxy de rescate)
              </label><br>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.6rem;">
                <input type="checkbox" id="antUsarONU" checked> Buscar en ONU (Biblioteca Digital — documentos oficiales de Naciones Unidas)
              </label><br>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.6rem;">
                <input type="checkbox" id="antUsarAbiertas"> Buscar en fuentes complementarias (OpenAlex, Crossref, Semantic Scholar)
              </label><br>
              <div id="antAvisoScopusEs" style="display:none; margin:0 0 0.6rem; padding:0.5rem 0.75rem; background:#fff8e1; border-left:3px solid #f5b301; border-radius:4px; font-size:0.85em;">
                ⚠️ Scopus indexa casi exclusivamente artículos en <strong>inglés</strong>. Con el idioma en «Español», es probable que devuelva pocos o ningún resultado. Para aprovechar Scopus, cambia «Priorizar idioma» a <strong>Inglés</strong>: la consulta se traducirá automáticamente.
              </div>
              <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap; margin:0.2rem 0 0.6rem;">
                <button id="antBuscar" class="btn btn-primary">🔎 Búsqueda individual</button>
                <button id="antIntensivaBtn" class="btn btn-primary">🚀 Búsqueda intensiva con variantes</button>
                <label for="antNumVariantes" style="font-size:0.85em; color:var(--color-text-soft, #666);">Nº variantes:</label>
                <input type="number" id="antNumVariantes" class="input" value="5" min="2" max="12" step="1"
                  style="width:4.5rem; padding:0.3rem 0.5rem;" title="Cuántas variantes generar (2 a 12)">
              </div>
              <div id="antVariantesZona" style="display:none; margin:0 0 0.6rem;">
                <textarea id="antVariantes" class="input" rows="5" style="resize:vertical;"
                  placeholder="Aquí aparecerán las variantes generadas, una por línea. Puedes editarlas, borrar las que no quieras o añadir las tuyas."></textarea>
                <div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center; margin-top:0.5rem;">
                  <button id="antGenerarVariantes" class="btn btn-outline" style="padding:0.3rem 0.8rem;">🔀 Regenerar variantes</button>
                  <label style="display:inline-flex; align-items:center; gap:0.35rem; font-size:0.85em; color:var(--color-text-soft, #666);">
                    <input type="checkbox" id="antIncluirOriginal" checked> Incluir también la consulta original
                  </label>
                  <span class="help-text" style="font-size:0.82em;">Edita libremente y vuelve a pulsar 🚀: buscará exactamente con las que dejes aquí.</span>
                </div>
              </div>
              <div id="antVariantesEstado" class="help-text" style="margin:0 0 0.4rem;"></div>
              <button id="antScholar" class="btn btn-outline">↗ Abrir en Google Académico</button>
              <button id="antScopusWeb" class="btn btn-outline">↗ Abrir en Scopus</button>
              <button id="antPubmedWeb" class="btn btn-outline">↗ Abrir en PubMed</button>
              <button id="antScieloWeb" class="btn btn-outline">↗ Abrir en SciELO</button>
              <button id="antAliciaWeb" class="btn btn-outline">↗ Abrir en ALICIA</button>
              <div id="antEstado" class="help-text" style="margin-top:0.5rem;"></div>
              <div id="antResultados"></div>
              <div id="antSeleccion"></div>

              <div id="antIntensiva" style="margin-top:2rem; border-top:2px solid var(--color-border, #e5e5e5); padding-top:1.5rem;">
                <h3 style="margin:0 0 0.3rem; font-size:1.15rem;">✨ Criba con IA — criterios y relevancia</h3>
                <p class="help-text" style="margin:0 0 1rem;">Genera criterios de inclusión/exclusión a partir de tu problema y evalúa la relevancia de cada artículo de la matriz con ayuda de un modelo de IA.</p>

                                <div id="antVariablesSlot"></div>

                <div class="form-group">
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.4rem;">
                    <label class="label" for="antCriterios" style="margin:0;">Criterios de inclusión y exclusión</label>
                    <button id="antGenerarCriterios" class="btn btn-outline" style="padding:0.3rem 0.8rem;">🪄 Generar criterios</button>
                  </div>
                  <textarea id="antCriterios" class="input" rows="8" style="resize:vertical;"
                    placeholder="Se generarán automáticamente al pulsar «Generar criterios» a partir del problema de investigación. Podrás editarlos libremente antes de filtrar."></textarea>
                  <p class="help-text" style="margin:0.4rem 0 0;">La IA propone un borrador; tú decides los criterios finales. Son totalmente editables.</p>
                  <div id="antCriteriosEstado" class="help-text" style="margin-top:0.4rem;"></div>
                </div>

                                <div class="form-group" style="margin-top:1.5rem; padding-top:1.2rem; border-top:1px dashed var(--color-border, #e5e5e5);">
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.4rem;">
                    <label class="label" style="margin:0;">Relevancia de las investigaciones</label>
                    <button id="antAnalizarRelevancia" class="btn btn-primary" style="padding:0.4rem 1rem;">🔎 Analizar relevancia</button>
                  </div>
                  <p class="help-text" style="margin:0;">La IA evalúa cada artículo de la matriz (título y resumen) según tus criterios de inclusión/exclusión y le asigna una relevancia del 1 al 5 con su justificación. La matriz se reordena por relevancia, pero <strong>no se elimina nada</strong>: tú decides la inclusión final leyendo. Usa el modelo más potente.</p>

                  <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap; margin-top:0.9rem;">
                    <label class="label" for="antUmbralRelevancia" style="margin:0;">🎯 Filtrar por relevancia:</label>
                    <select id="antUmbralRelevancia" class="input" style="width:auto; padding:0.3rem 0.6rem;" disabled title="Se activa tras analizar la relevancia">
                      <option value="0">Mostrar todas</option>
                      <option value="2">Relevancia ≥ 2</option>
                      <option value="3">Relevancia ≥ 3</option>
                      <option value="4">Relevancia ≥ 4</option>
                      <option value="5">Solo relevancia 5</option>
                    </select>
                  </div>
                  <p class="help-text" style="margin:0.4rem 0 0;">Oculta de la matriz (y de sus exportaciones a Excel/CSV) los artículos por debajo del umbral, para no borrar filas a mano. No elimina nada: es solo la vista, y puedes volver a «Mostrar todas» cuando quieras.</p>
                  <div id="antRelevanciaEstado" class="help-text" style="margin-top:0.5rem;"></div>
                </div>

                <div id="antRedactor"></div>
              </div>
            </div>
        </div>`;
        document.getElementById('antBuscar').addEventListener('click', () => this._onBuscar());
        const btnCrit = document.getElementById('antGenerarCriterios');
        if (btnCrit) btnCrit.addEventListener('click', () => this._onGenerarCriterios());
        const btnVar = document.getElementById('antGenerarVariantes');
        if (btnVar) btnVar.addEventListener('click', () => this._onGenerarVariantes());
        const btnInt = document.getElementById('antIntensivaBtn');
        if (btnInt) btnInt.addEventListener('click', () => this._onIntensiva());
        const btnRel = document.getElementById('antAnalizarRelevancia');
        if (btnRel) btnRel.addEventListener('click', () => this._onAnalizarRelevancia());
        const selUmbral = document.getElementById('antUmbralRelevancia');
        if (selUmbral) selUmbral.addEventListener('change', () => {
            this._umbralRelevancia = parseInt(selUmbral.value, 10) || 0;
            this._selMat = 0; // volver a la primera página de la matriz
            this._renderSeleccion();
            if (typeof RedactorTeorico !== 'undefined') RedactorTeorico.actualizarInfoFuentes();
        });
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
        const btnScieloWeb = document.getElementById('antScieloWeb');
        if (btnScieloWeb) btnScieloWeb.addEventListener('click', () => {
            const q = document.getElementById('antQuery').value.trim();
            if (q && typeof ScieloDirecto !== 'undefined') window.open(ScieloDirecto.urlPublica(q), '_blank');
        });
        const btnAliciaWeb = document.getElementById('antAliciaWeb');
        if (btnAliciaWeb) btnAliciaWeb.addEventListener('click', () => {
            const q = document.getElementById('antQuery').value.trim();
            if (q && typeof AliciaDirecto !== 'undefined') window.open(AliciaDirecto.urlPublica(q), '_blank');
        });
        const btnPubmedWeb = document.getElementById('antPubmedWeb');
        if (btnPubmedWeb) btnPubmedWeb.addEventListener('click', async () => {
            let q = document.getElementById('antQuery').value.trim();
            if (!q || typeof PubMedDirecto === 'undefined') return;
            // PubMed es mayormente inglés: traducir si se prioriza inglés.
            if (document.getElementById('antIdioma').value === 'en') {
                q = await this.traducirTexto(q, 'es', 'en');
            }
            window.open(PubMedDirecto.urlPublica(q, { desde: document.getElementById('antDesde').value }), '_blank');
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

    // ---- Búsqueda intensiva · Generar VARIANTES de la consulta con IA ----
    async _onGenerarVariantes() {
        const consulta = (document.getElementById('antQuery') || {}).value || '';
        const zona = document.getElementById('antVariantesZona');
        const caja = document.getElementById('antVariantes');
        const estado = document.getElementById('antVariantesEstado');
        const btn = document.getElementById('antGenerarVariantes');
        const num = parseInt((document.getElementById('antNumVariantes') || {}).value || '5', 10);

        if (consulta.trim().length < 3) {
            if (estado) estado.textContent = '⚠️ Escribe primero los términos de búsqueda arriba.';
            const q = document.getElementById('antQuery'); if (q) q.focus();
            return;
        }
        // Confirmar si ya hay variantes escritas.
        if (caja && caja.value.trim().length > 5) {
            if (!confirm('Ya tienes variantes generadas. ¿Reemplazarlas por otras nuevas?')) return;
        }

        const textoBtn = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Generando…'; }
        if (estado) estado.textContent = 'La IA está generando variantes de tu consulta…';

        try {
            if (typeof IAAsistente === 'undefined') throw new Error('El asistente de IA no está cargado.');
            const variantes = await IAAsistente.generarVariantes(consulta, num);
            if (caja) caja.value = variantes.join('\n');
            if (zona) zona.style.display = '';
            if (estado) estado.textContent = `✓ ${variantes.length} variantes generadas. Revísalas, edítalas y pulsa «Buscar con todas las variantes».`;
        } catch (e) {
            if (estado) estado.textContent = '❌ ' + (e.message || 'No se pudieron generar las variantes.');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
        }
    },

    // ---- Búsqueda intensiva · ejecutar la búsqueda con TODAS las variantes ----
    // Por cada variante (+ opcionalmente la original) ejecuta una búsqueda completa
    // con la configuración actual, combina todo y deduplica. Muestra progreso.
    // ---- Búsqueda intensiva · FILTRAR por relevancia con IA ----
    // Evalúa todos los resultados actuales (this._obras) contra los criterios,
    // en LOTES repartidos entre las claves del Worker. Añade puntuación 1-5 +
    // motivo a cada obra, y reordena la matriz por relevancia. No oculta nada.
    // Restablece el análisis/filtro de relevancia (las obras nuevas no tienen
    // puntuación: la columna se oculta y el selector vuelve a "Mostrar todas").
    _resetRelevancia() {
        this._relevanciaAplicada = false;
        this._umbralRelevancia = 0;
        const s = document.getElementById('antUmbralRelevancia');
        if (s) { s.value = '0'; s.disabled = true; }
    },

    async _onAnalizarRelevancia() {
        const estado = document.getElementById('antRelevanciaEstado');
        const btn = document.getElementById('antAnalizarRelevancia');
        const criterios = (document.getElementById('antCriterios') || {}).value || '';

        if (!this._obras || !this._obras.length) {
            if (estado) estado.textContent = '⚠️ Primero haz una búsqueda: no hay artículos que evaluar.';
            return;
        }
        if (criterios.trim().length < 20) {
            if (estado) estado.textContent = '⚠️ Genera o escribe primero los criterios de inclusión/exclusión (arriba).';
            const c = document.getElementById('antCriterios'); if (c) c.focus();
            return;
        }
        if (typeof IAAsistente === 'undefined' || !IAAsistente.disponible()) {
            if (estado) estado.textContent = '❌ El asistente de IA no está disponible.';
            return;
        }

        const textoBtn = btn ? btn.textContent : '';
        if (btn) btn.disabled = true;
        const _t0 = performance.now();

        // Preparar los artículos con su índice real en this._obras.
        const articulos = this._obras.map((o, idx) => ({
            idx,
            titulo: o.titulo || '',
            resumen: o.resumen || o.abstract || ''
        }));

        // Dividir en lotes de 10 (decisión: ~10 artículos por llamada).
        const TAM_LOTE = 10;
        const lotes = [];
        for (let i = 0; i < articulos.length; i += TAM_LOTE) lotes.push(articulos.slice(i, i + TAM_LOTE));

        // CANALES: uno por clave del Worker (1 lote = 1 clave = 1 organización).
        // El número se consulta al Worker y AUTO-ESCALA: con 10 claves → 10 lotes
        // en paralelo = 100 referencias por tanda; si añades GROQ_KEY_11..20 en
        // Cloudflare, habrá más canales automáticamente, sin tocar código.
        const canales = Math.min(await IAAsistente.numClaves(), lotes.length);
        let completados = 0;
        let conError = 0;
        const total = lotes.length;

        // Enfriamiento por canal: cada organización admite ~8.000 tokens/minuto y
        // un lote de 10 referencias consume casi el minuto entero de su clave. Cada
        // canal espera ~62 s desde el INICIO de su lote anterior antes de lanzar el
        // siguiente: así nunca caen 2 lotes de la misma clave en el mismo minuto.
        const ENFRIAMIENTO_MS = this._ENFRIAMIENTO_RELEVANCIA_MS != null ? this._ENFRIAMIENTO_RELEVANCIA_MS : 62000;

        const actualizarProgreso = () => {
            const refsHechas = Math.min(completados * TAM_LOTE, articulos.length);
            const tandasRestantes = Math.ceil((total - completados) / canales);
            const estMin = tandasRestantes <= 0 ? '' : ` · quedan ~${tandasRestantes} min`;
            if (estado) estado.textContent = `🔎 Evaluando relevancia… ${refsHechas}/${articulos.length} referencias `
                + `(${canales} claves en paralelo, ritmo ~${canales * TAM_LOTE}/min)${estMin}`;
            if (btn) btn.textContent = `⏳ ${completados}/${total} lotes…`;
        };
        actualizarProgreso();

        // Cola de lotes atendida por N canales; el canal c usa SIEMPRE la clave c
        // (keyHint), garantizando el reparto 1 a 1 sin colisiones entre paralelos.
        let siguiente = 0;
        const trabajador = async (canal) => {
            let ultimoInicio = 0;
            while (siguiente < lotes.length) {
                const miIdx = siguiente++;
                const lote = lotes[miIdx];
                // Respetar el ritmo de la clave de este canal (TPM por minuto).
                if (ultimoInicio) {
                    const espera = ENFRIAMIENTO_MS - (performance.now() - ultimoInicio);
                    if (espera > 0) await new Promise(r => setTimeout(r, espera));
                }
                ultimoInicio = performance.now();
                try {
                    const evals = await IAAsistente.evaluarLoteRelevancia(criterios, lote, canal);
                    // Volcar cada evaluación a su obra por idx.
                    for (const ev of evals) {
                        if (this._obras[ev.idx]) {
                            this._obras[ev.idx]._relevancia = ev.puntua;       // 0-5 (0 = no evaluado)
                            this._obras[ev.idx]._relevanciaMotivo = ev.motivo;  // justificación
                        }
                    }
                } catch (e) {
                    conError++;
                    // Marcar el lote como no evaluado (puntua 0) para no perderlos.
                    for (const a of lote) {
                        if (this._obras[a.idx] && this._obras[a.idx]._relevancia == null) {
                            this._obras[a.idx]._relevancia = 0;
                            this._obras[a.idx]._relevanciaMotivo = 'No evaluado (error en el lote)';
                        }
                    }
                }
                completados++;
                actualizarProgreso();
            }
        };
        await Promise.all(Array.from({ length: canales }, (_, c) => trabajador(c)));

        // Reordenar this._obras por relevancia DESC (los no evaluados, al final).
        this._obras.sort((a, b) => (b._relevancia || 0) - (a._relevancia || 0));
        this._relevanciaAplicada = true; // para que la matriz muestre la columna

        const _dur = this._formatoTiempo(performance.now() - _t0);
        const evaluados = this._obras.filter(o => o._relevancia > 0).length;
        if (estado) estado.textContent = `✓ ${evaluados} artículos evaluados en ${_dur}`
            + (conError ? ` (${conError} lote(s) con error)` : '')
            + `. Matriz reordenada por relevancia. Usa «Filtrar por relevancia» para ocultar las de puntuación baja.`;
        const selU = document.getElementById('antUmbralRelevancia');
        if (selU) selU.disabled = false; // el filtro se activa cuando hay puntuaciones
        if (typeof RedactorTeorico !== 'undefined') RedactorTeorico.actualizarInfoFuentes();
        if (btn) { btn.disabled = false; btn.textContent = textoBtn; }

        // Re-renderizar resultados y matriz con la nueva columna.
        this._pagina = 0; this._selMat = 0;
        this._renderResultados(this._obras);
    },

    // Búsqueda intensiva en 1 clic: si aún no hay variantes, las genera con IA
    // (usando el Nº configurado) y a continuación busca con todas ellas. Si la
    // caja ya tiene variantes (generadas o editadas a mano), busca directamente.
    async _onIntensiva() {
        const caja = document.getElementById('antVariantes');
        if (!caja) return;
        if (!caja.value.trim()) await this._onGenerarVariantes();
        if (caja.value.trim()) await this._onBuscarIntensivo();
    },

    async _onBuscarIntensivo() {
        const caja = document.getElementById('antVariantes');
        const estado = document.getElementById('antVariantesEstado');
        const btn = document.getElementById('antIntensivaBtn');
        const estadoBuscador = document.getElementById('antEstado');

        // Recoger las variantes (una por línea, ya editadas por el usuario).
        const variantes = (caja ? caja.value : '').split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 2);
        if (!variantes.length) {
            if (estado) estado.textContent = '⚠️ No hay variantes para buscar. Genera o escribe alguna.';
            return;
        }

        // ¿Incluir la consulta original como una búsqueda más?
        const incluirOrig = (document.getElementById('antIncluirOriginal') || {}).checked;
        const consultaOrig = (document.getElementById('antQuery') || {}).value.trim();
        const f = { desde: (document.getElementById('antDesde') || {}).value, idioma: (document.getElementById('antIdioma') || {}).value };

        // Lista final de consultas a ejecutar (original primero si se incluye).
        let consultas = variantes.slice();
        if (incluirOrig && consultaOrig && !consultas.some(c => c.toLowerCase() === consultaOrig.toLowerCase())) {
            consultas = [consultaOrig, ...consultas];
        }

        const textoBtn = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; }
        const _t0 = performance.now(); // cronómetro de la búsqueda intensiva

        // Acumulador con deduplicación incremental por DOI/título.
        const vistos = new Set();
        const acumuladas = [];
        const infosTodas = [];
        let conError = 0;

        try {
            for (let i = 0; i < consultas.length; i++) {
                const q = consultas[i];
                const etiqueta = `Buscando variante ${i + 1} de ${consultas.length}: «${q}»…`;
                if (estado) estado.textContent = `🚀 ${etiqueta}`;
                if (estadoBuscador) estadoBuscador.textContent = etiqueta;
                if (btn) btn.textContent = `⏳ ${i + 1}/${consultas.length}…`;

                try {
                    // Si se prioriza inglés, traducir esta variante (como en la búsqueda normal).
                    let qEjec = q;
                    if (f.idioma === 'en') {
                        const tr = await this.traducirTexto(q, 'es', 'en');
                        if (tr && tr.toLowerCase() !== q.toLowerCase()) qEjec = tr;
                    }
                    const { obras, infos } = await this._buscarUnaConsulta(qEjec, f);
                    infosTodas.push(`«${q}»: ${infos}`);
                    // Deduplicar contra lo ya acumulado.
                    for (const o of obras) {
                        const k = (o.doi && o.doi.toLowerCase()) || this._norm(o.titulo);
                        if (vistos.has(k)) continue;
                        vistos.add(k);
                        acumuladas.push(o);
                    }
                } catch (e) {
                    conError++;
                    infosTodas.push(`«${q}»: falló (${e.message})`);
                }
            }

            // Volcar resultados combinados a la matriz principal.
            this._obras = acumuladas;
            this._pagina = 0;
            this._resetRelevancia();
            const _dur = this._formatoTiempo(performance.now() - _t0);
            const resumen = `${acumuladas.length} resultados únicos de ${consultas.length} búsquedas en ${_dur}`
                + (conError ? ` (${conError} con error)` : '');
            if (estado) estado.textContent = `✓ ${resumen}. Revisa la matriz abajo.`;
            if (estadoBuscador) estadoBuscador.textContent = `${resumen}. Marca los pertinentes:`;
            this._renderResultados(this._obras);
            this._enriquecerAutomatico(this._obras);
        } catch (e) {
            if (estado) estado.textContent = `❌ No se pudo completar la búsqueda intensiva (${e.message}).`;
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
        }
    },

    // ---- Búsqueda intensiva · Generar criterios de inclusión/exclusión con IA ----
    async _onGenerarCriterios() {
        const problema = (document.getElementById('antQuery') || {}).value || '';
        const cajaCriterios = document.getElementById('antCriterios');
        const estado = document.getElementById('antCriteriosEstado');
        const btn = document.getElementById('antGenerarCriterios');

        // Validación amable antes de llamar a la IA.
        if (problema.trim().length < 15) {
            if (estado) estado.textContent = '⚠️ Primero describe el problema de investigación (al menos una frase completa).';
            const p = document.getElementById('antQuery');
            if (p) p.focus();
            return;
        }

        // Si ya hay criterios escritos, confirmar que se van a reemplazar.
        if (cajaCriterios && cajaCriterios.value.trim().length > 20) {
            if (!confirm('Ya tienes criterios escritos. ¿Reemplazarlos por una nueva propuesta de la IA?')) return;
        }

        // Estado de carga (deshabilitar botón para evitar dobles clics).
        const textoBtn = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Generando…'; }
        if (estado) estado.textContent = 'La IA está redactando los criterios a partir de tu problema de investigación…';

        try {
            if (typeof IAAsistente === 'undefined') throw new Error('El asistente de IA no está cargado.');
            const criterios = await IAAsistente.generarCriterios(problema);
            if (cajaCriterios) cajaCriterios.value = criterios;
            if (estado) estado.textContent = '✓ Criterios generados. Revísalos y edítalos según tu criterio antes de filtrar.';
        } catch (e) {
            if (estado) estado.textContent = '❌ ' + (e.message || 'No se pudieron generar los criterios. Inténtalo de nuevo.');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
        }
    },

    // Año actual real (la IA no lo sabe; se lo pasamos calculado).
    _anioActual() { return new Date().getFullYear(); },

    // Formatea una duración en milisegundos como "m:ss" o "s.s s".
    _formatoTiempo(ms) {
        const seg = ms / 1000;
        if (seg < 60) return `${seg.toFixed(1)} s`;
        const m = Math.floor(seg / 60);
        const s = Math.round(seg % 60);
        return `${m}:${String(s).padStart(2, '0')} min`;
    },

    async _onBuscar(opciones = {}) {
        const _t0 = performance.now(); // cronómetro de la búsqueda
        const estado = document.getElementById('antEstado');
        const qOriginal = document.getElementById('antQuery').value.trim();
        if (!qOriginal) { estado.textContent = 'Escribe términos de búsqueda.'; return; }
        const f = { desde: document.getElementById('antDesde').value, idioma: document.getElementById('antIdioma').value };
        const usarScopus = document.getElementById('antUsarScopus') && document.getElementById('antUsarScopus').checked && typeof ScopusDirecto !== 'undefined';
        const usarScholar = document.getElementById('antUsarScholar') && document.getElementById('antUsarScholar').checked && typeof ScholarDirecto !== 'undefined';
        const usarAbiertas = document.getElementById('antUsarAbiertas') && document.getElementById('antUsarAbiertas').checked;
        const usarPubmed = document.getElementById('antUsarPubmed') && document.getElementById('antUsarPubmed').checked && typeof PubMedDirecto !== 'undefined';
        const usarScielo = document.getElementById('antUsarScielo') && document.getElementById('antUsarScielo').checked && typeof ScieloDirecto !== 'undefined';
        const usarAlicia = document.getElementById('antUsarAlicia') && document.getElementById('antUsarAlicia').checked && typeof AliciaDirecto !== 'undefined';

        if (!usarScopus && !usarScholar && !usarAbiertas && !usarPubmed && !usarScielo && !usarAlicia) {
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
        if (usarPubmed) fuentes.push('PubMed');
        if (usarScielo) fuentes.push('SciELO');
        if (usarAlicia) fuentes.push('ALICIA');
        if (usarScholar) fuentes.push('Google Académico');
        if (usarAbiertas) fuentes.push('fuentes complementarias');
        estado.textContent = `${avisoTraduccion}Consultando ${fuentes.join(' + ')}…`;

        estado.textContent = `${avisoTraduccion}Consultando ${fuentes.join(' + ')}…`;
        try {
            const { obras, infos } = await this._buscarUnaConsulta(q, f, opciones);
            // Deduplicar por DOI/título.
            const vistos = new Set();
            this._obras = obras.filter(o => {
                const k = (o.doi && o.doi.toLowerCase()) || this._norm(o.titulo);
                if (vistos.has(k)) return false;
                vistos.add(k); return true;
            });
            this._pagina = 0;
            this._resetRelevancia();
            const _dur = this._formatoTiempo(performance.now() - _t0);
            estado.textContent = this._obras.length
                ? `${avisoTraduccion}${this._obras.length} resultados combinados en ${_dur} (${infos}). Marca los pertinentes:`
                : `${avisoTraduccion}Sin resultados (${_dur}). ${infos}`;
            this._renderResultados(this._obras);
            this._enriquecerAutomatico(this._obras);
        } catch (e) {
            estado.textContent = `No se pudo completar la búsqueda (${e.message}).`;
        }
    },

    // ---- Ejecuta UNA consulta sobre todas las fuentes marcadas y devuelve
    // {obras, infos} SIN tocar el DOM ni this._obras. Reutilizable por la
    // búsqueda normal y por cada variante de la búsqueda intensiva.
    // 'opciones.fuentes' permite forzar qué fuentes usar; si no, lee las casillas.
    async _buscarUnaConsulta(q, f, opciones = {}) {
        const leer = (id, check) => {
            const el = document.getElementById(id);
            return el && el.checked;
        };
        const usarScopus = (opciones.usarScopus ?? leer('antUsarScopus')) && typeof ScopusDirecto !== 'undefined';
        const usarScholar = (opciones.usarScholar ?? leer('antUsarScholar')) && typeof ScholarDirecto !== 'undefined';
        const usarAbiertas = (opciones.usarAbiertas ?? leer('antUsarAbiertas'));
        const usarPubmed = (opciones.usarPubmed ?? leer('antUsarPubmed')) && typeof PubMedDirecto !== 'undefined';
        const usarScielo = (opciones.usarScielo ?? leer('antUsarScielo')) && typeof ScieloDirecto !== 'undefined';
        const usarAlicia = (opciones.usarAlicia ?? leer('antUsarAlicia')) && typeof AliciaDirecto !== 'undefined';
        const usarOMS = (opciones.usarOMS ?? leer('antUsarOMS'));
        const usarONU = (opciones.usarONU ?? leer('antUsarONU'));

        const tareas = [];
        if (usarScopus) {
            const maxScopus = parseInt((document.getElementById('antCantidadScopus') || {}).value || '25', 10);
            tareas.push(
                ScopusDirecto.buscar(q, { ...f, maxResultados: maxScopus }).then(r => {
                    const vista = r.view === 'COMPLETE' ? ', con resúmenes ✓' : '';
                    return { obras: r.obras, info: `Scopus (clave ${r.key}, ${r.obras.length} result.${vista})` };
                }).catch(e => ({ obras: [], info: `Scopus falló (${e.message})` })));
        }
        if (usarPubmed) {
            const maxPubmed = parseInt((document.getElementById('antCantidadPubmed') || {}).value || '100', 10);
            tareas.push(
                PubMedDirecto.buscar(q, { ...f, maxResultados: maxPubmed }).then(r => ({
                    obras: r.obras,
                    info: `PubMed (${r.obras.length} result., con resúmenes ✓)`
                })).catch(e => ({ obras: [], info: `PubMed falló (${e.message})` })));
        }
        if (usarScielo) {
            const maxScielo = parseInt((document.getElementById('antCantidadScielo') || {}).value || '100', 10);
            tareas.push(
                ScieloDirecto.buscar(q, { ...f, maxResultados: maxScielo }).then(r => ({
                    obras: r.obras,
                    info: `SciELO (${r.obras.length} result.)`
                })).catch(e => ({ obras: [], info: `SciELO falló (${e.message})` })));
        }
        if (usarAlicia) {
            const maxAlicia = parseInt((document.getElementById('antCantidadAlicia') || {}).value || '100', 10);
            tareas.push(
                AliciaDirecto.buscar(q, { ...f, maxResultados: maxAlicia }).then(r => ({
                    obras: r.obras,
                    info: `ALICIA (${r.obras.length} result., con resúmenes ✓)`
                })).catch(e => ({ obras: [], info: `ALICIA falló (${e.message})` })));
        }
        if (usarScholar) {
            const maxPag = parseInt((document.getElementById('antCantidad') || {}).value || '2', 10);
            tareas.push(
                ScholarDirecto.buscarPaginado(q, f.desde, maxPag).then(r => ({
                    obras: r.obras.map(o => ({ ...o, link: o.link || '', autores: o.autoresRaw ? o.autoresRaw.split(/,\s*/) : [] })),
                    info: `Scholar (${r.paginas} pág.${r.captchaEn ? `, bloqueó en ${r.captchaEn}` : ''})`
                })).catch(e => ({ obras: [], info: `Scholar falló (${e.message})` })));
        }
        if (usarOMS && this._nInput('antNumOMS', 15) > 0) {
            tareas.push(
                this._fetchJSONConRescate(this.urlIRIS(q, f)).then(d => {
                    const obras = this._extraerIRIS(d).map(x => this.normIRIS(x))
                        .filter(o => !f.desde || o.anio === 's. f.' || parseInt(o.anio, 10) >= f.desde);
                    return { obras, info: `OMS · IRIS (${obras.length} result.)` };
                }).catch(e => ({ obras: [], info: `OMS · IRIS falló (${e.message})` })));
        }
        if (usarONU && this._nInput('antNumONU', 10) > 0) {
            const filtroAnio = o => !f.desde || o.anio === 's. f.' || parseInt(o.anio, 10) >= f.desde;
            tareas.push((async () => {
                // 1º: ReliefWeb — directo desde el navegador (CORS por diseño).
                for (const appname of ['statsim-pro', 'vocabulary']) {
                    try {
                        const d = await this._fetchJSONConRescate(this.urlReliefWeb(q, f, appname), { timeout: 15000 });
                        const obras = ((d && d.data) || []).map(x => this.normReliefWeb(x))
                            .filter(filtroAnio);
                        if (obras.length) return { obras, info: `ONU · ReliefWeb (${obras.length} result.)` };
                        if (d && d.data) break; // respondió bien pero sin resultados: no reintentar appname
                    } catch (e) { /* probar el siguiente appname */ }
                }
                // 2º: Biblioteca Digital (recjson) — puede estar tras muro anti-bot.
                try {
                    const d = await this._fetchJSONConRescate(this.urlUNDL(q, f), { timeout: 15000 });
                    const obras = this._extraerUNDL(d).map(x => this.normUNDL(x)).filter(filtroAnio);
                    if (obras.length) return { obras, info: `ONU · Biblioteca Digital (${obras.length} result.)` };
                } catch (e) { /* siguiente formato */ }
                // 3º: Biblioteca Digital (MARCXML).
                try {
                    const xml = await this._fetchTextoConRescate(this.urlUNDLxm(q, f),
                        t => typeof t === 'string' && t.includes('<record'), { timeout: 20000 });
                    const obras = this._parseMARCXML(xml).filter(filtroAnio);
                    return { obras, info: `ONU · Biblioteca Digital (${obras.length} result.${obras.length ? ', vía MARCXML' : ''})` };
                } catch (e2) {
                    return { obras: [], info: `ONU falló en las 3 vías (${e2.message})` };
                }
            })());
        }
        if (usarAbiertas) tareas.push(
            this.buscarMulti(q, f).then(r => ({ obras: r.obras, info: `${r.fuentesOK} fuentes complementarias — ${r.detalle || ''}` }))
                .catch(e => ({ obras: [], info: `fuentes complementarias fallaron` })));

        const res = await Promise.all(tareas);
        const combinadas = [];
        res.forEach(r => combinadas.push(...r.obras));
        const infos = res.map(r => r.info).join(' · ');
        return { obras: combinadas, infos };
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
              <td>${(o.autores || []).slice(0, 3).join('; ')}${(o.autores || []).length > 3 ? ' et al.' : ''} (${o.anio || 's. f.'})</td>
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

    // Obras que alimentan la matriz Y la redacción del marco teórico: las
    // marcadas, respetando el filtro de relevancia activo (misma regla en ambas).
    obtenerFuentesRedaccion(sel) {
        const base = sel || [...this._seleccion.values()];
        const u = (this._relevanciaAplicada && this._umbralRelevancia > 0) ? this._umbralRelevancia : 0;
        return u > 0 ? base.filter(o => (o._relevancia || 0) >= u) : base;
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
        // Filtro de vista por relevancia: la matriz (y sus exportaciones) solo
        // incluye artículos con puntuación >= umbral. No borra nada del listado.
        const umbralRel = (this._relevanciaAplicada && this._umbralRelevancia > 0) ? this._umbralRelevancia : 0;
        const selMatriz = this.obtenerFuentesRedaccion(sel);
        const filasMatriz = selMatriz.map(o => this._filaMatriz(o));
        const infoUmbral = umbralRel > 0
            ? ` <span style="font-weight:normal; font-size:0.75em; color:#666;">(mostrando ${selMatriz.length} de ${sel.length} · relevancia ≥ ${umbralRel})</span>`
            : '';
        const npMat = Math.max(1, Math.ceil(filasMatriz.length / PP));
        if (this._selMat >= npMat) this._selMat = npMat - 1;
        const iniM = this._selMat * PP;
        const matVis = filasMatriz.slice(iniM, iniM + PP);

        const COLS = [
            ...(this._relevanciaAplicada ? ['Relevancia'] : []),
            'Título', 'Autor', 'Año', 'Contexto (País)', 'Objetivos', 'Muestra', 'Instrumentos',
            'Resultados', 'Conclusiones', 'Revista', 'Cuartil', 'Indexación', 'Referencia (APA)', 'Link/DOI'];

        cont.innerHTML = `
            <h4 style="margin-top:1.25rem; display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
                <span>Referencias seleccionadas (APA 7, orden alfabético)</span>
                <button id="antCopiarRefs" class="btn btn-primary" style="padding:0.3rem 0.8rem;">📋 Copiar con formato</button>
            </h4>
            <div class="result-box" id="antRefsBox">${refsVis.map(r => `<p style="margin:0 0 0.5rem;padding-left:2rem;text-indent:-2rem;">${r}</p>`).join('')}</div>
            ${this._barraPaginas('Ref', this._selRef, npRef, iniR, refs.length, PP)}

            <h4 style="margin-top:1.5rem; display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
                <span>Matriz de revisión bibliográfica${infoUmbral}</span>
                <span style="display:inline-flex; gap:0.4rem; flex-wrap:wrap;">
                    <button id="antXlsx" class="btn btn-primary" style="padding:0.3rem 0.8rem;" title="Excel real con formato: Times New Roman 12, texto ajustado y anchos de columna">⬇ Excel (.xlsx)</button>
                    <button id="antCsvEs" class="btn btn-outline" style="padding:0.3rem 0.8rem;" title="Separador ; — abre en columnas en Excel en español">⬇ CSV (Excel español)</button>
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
        const btnX = document.getElementById('antXlsx');
        if (btnX) btnX.addEventListener('click', () => this._exportarXLSX(COLS, filasMatriz));
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

    // Pasada de métricas de revista: para cada obra con ISSN (las de Scopus),
    // consulta cuartil/CiteScore vía Serial Title. En paralelo, con caché por ISSN
    // en ScopusDirecto (revistas repetidas se consultan una sola vez). Devuelve
    // cuántas obras recibieron métricas.
    async _enriquecerMetricas(obras) {
        if (typeof ScopusDirecto === 'undefined') return 0;
        const conIssn = obras.filter(o => o.issn && !o._metricas);
        if (!conIssn.length) return 0;
        const CONCURRENCIA = 4;
        let idx = 0, n = 0;
        const trabajador = async () => {
            while (idx < conIssn.length) {
                const o = conIssn[idx++];
                const m = await ScopusDirecto.metricasRevista(o.issn);
                if (m) { o._metricas = m; n++; }
            }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, conIssn.length) }, () => trabajador()));
        return n;
    },

    // Enriquecimiento AUTOMÁTICO tras cada búsqueda: recupera abstracts de las
    // obras que no lo traen, EN PARALELO con límite de concurrencia, y re-pinta
    // la vista cuando termina (sin que el usuario lo pida). No bloquea la UI.
    async _enriquecerAutomatico(obras) {
        // Procesar las que les falta resumen O tienen enlace dudoso, no intentadas.
        const pendientes = obras.filter(o => (!o.resumen || o.resumen.length < 40) && !o._intentadoEnriquecer);
        const hayMetricas = obras.some(o => o.issn && !o._metricas);
        if (!pendientes.length && !hayMetricas) return;
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
        cambios += await this._enriquecerMetricas(obras);
        const estado = document.getElementById('antEstado');
        if (estado && cambios) {
            const dbg = (typeof window !== 'undefined' && window.__enrichDebug) ? window.__enrichDebug : {};
            const resumen = Object.entries(dbg).map(([k, v]) => `${k}×${v}`).join(', ');
            estado.textContent = (estado.textContent || '') + ` · Autocompletado: ${cambios} campos.` + (resumen ? ` [${resumen}]` : '');
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
        let abstract = '', link = '', autores = [], anio = '';

        // 1) OpenAlex: abstract + ubicación OA. Se usa el filtro doi: (el slash
        // del DOI debe ir LITERAL; encodeURIComponent en el path lo rompía con %2F).
        try {
            const r = await fetch(`https://api.openalex.org/works/doi:${limpio}`);
            this._enrichDbg('OpenAlex', r.ok ? 'ok' : ('HTTP ' + r.status));
            if (r.ok) {
                const d = await r.json();
                if (d.abstract_inverted_index) { const t = this.reconstruirAbstract(d.abstract_inverted_index); if (t && t.length > 40) abstract = t; }
                if (Array.isArray(d.authorships)) autores = d.authorships.map(a => a.author && a.author.display_name).filter(Boolean);
                if (d.publication_year) anio = String(d.publication_year);
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
                    if (a) { const t = limpiar(a); if (t.length > 40) abstract = t; }
                    if (!autores.length && d.message && Array.isArray(d.message.author)) {
                        autores = d.message.author.map(x => [x.given, x.family].filter(Boolean).join(' ')).filter(Boolean);
                    } }
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

        // 5) Scopus Abstract Retrieval (con las claves del usuario): la red de
        // seguridad para editoriales que NO depositan el resumen en las APIs
        // abiertas (típicamente Elsevier, DOIs 10.1016/...). Último recurso para
        // el abstract; no gasta cuota si ya se recuperó antes.
        if (!abstract && typeof ScopusDirecto !== 'undefined' && ScopusDirecto.abstractPorDoi) {
            try {
                const t = await ScopusDirecto.abstractPorDoi(limpio);
                this._enrichDbg('ScopusAbs', t ? 'ok' : 'vacío');
                if (t) abstract = t;
            } catch (e) { this._enrichDbg('ScopusAbs', 'error: ' + e.message); }
        }

        // 6) Unpaywall: API especializada en localizar copias de ACCESO ABIERTO
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
        return { abstract, link, autores, anio };
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

    // Construye las 13 celdas (HTML para mostrar) y los 13 valores planos (CSV).
    // Insignia de relevancia (1-5) con color. Tooltip con el motivo.
    _insigniaRelevancia(o) {
        const p = o._relevancia;
        if (p == null) return '';
        if (p === 0) return '<span title="No evaluado" style="color:#999;">—</span>';
        // Colores: 5 verde fuerte, 4 verde, 3 ámbar, 2 naranja, 1 rojo.
        const estilos = {
            5: 'background:#1D9E75;color:#fff;',
            4: 'background:#97C459;color:#173404;',
            3: 'background:#EF9F27;color:#412402;',
            2: 'background:#F0997B;color:#4A1B0C;',
            1: 'background:#E24B4A;color:#fff;'
        };
        const motivo = (o._relevanciaMotivo || '').replace(/"/g, '&quot;');
        return `<span title="${motivo}" style="${estilos[p] || ''}display:inline-block;min-width:1.4rem;`
            + `text-align:center;padding:0.1rem 0.4rem;border-radius:0.3rem;font-weight:600;cursor:help;">${p}</span>`;
    },

    _filaMatriz(o) {
        const ref = this.citaAPA(o).replace(/<\/?i>/g, '');
        const link = o.link || o.doi || '';
        const pais = this._detectarPais(o);
        const muestra = this._detectarMuestra(o);
        const objetivo = this._detectarObjetivo(o);
        const indexacion = this._detectarIndexacion(o);
        const ph = '<span style="color:#aaa;">[completar]</span>';
        const incluirRel = !!this._relevanciaAplicada;
        // Autor: compacto en pantalla (primer autor + «et al.»), COMPLETO en las
        // exportaciones (todos en formato APA, separados por «; » — reimportable).
        const autoresAPA = (o.autores || []).map(a => this._autorAPA(a)).filter(Boolean);
        const autorCorto = autoresAPA.length
            ? (autoresAPA.length === 1 ? autoresAPA[0] : autoresAPA[0] + ' et al.')
            : '';
        const celdas = [
            ...(incluirRel ? [this._insigniaRelevancia(o) || ph] : []),
            o.titulo || ph,
            autorCorto || ph,
            o.anio || '',
            pais || ph,
            objetivo || ph,
            muestra || ph,
            ph, // instrumentos: no disponible en metadatos
            o.resumen ? (o.resumen.slice(0, 200) + (o.resumen.length > 200 ? '…' : '')) : ph, // resultados ≈ resumen
            ph, // conclusiones: requiere texto completo
            o.fuente || ph,
            this._insigniaCuartil(o) || ph,
            indexacion || ph,
            ref,
            link ? `<a href="${link}" target="_blank">${link}</a>` : ph
        ];
        const planas = [
            ...(incluirRel ? [o._relevancia ? `${o._relevancia} (${o._relevanciaMotivo || ''})` : ''] : []),
            o.titulo || '', autoresAPA.join('; '), o.anio || '', pais, objetivo, muestra, '',
            o.resumen || '', '', o.fuente || '', this._cuartilTexto(o), indexacion, ref, link
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

    // ---- Excel (.xlsx) con formato: Times New Roman 12, ajuste de texto,
    // alineación (vertical centro, horizontal izquierda) y anchos fijos por
    // columna (px medidos por el usuario, convertidos a unidades de Excel).
    // Construcción separada de la descarga para poder verificarla en tests.
    _ANCHOS_PX_MATRIZ: {
        'Relevancia': 124, 'Título': 165, 'Autor': 95, 'Año': 50, 'Contexto (País)': 100,
        'Objetivos': 334, 'Muestra': 96, 'Instrumentos': 130, 'Resultados': 920,
        'Conclusiones': 140, 'Revista': 110, 'Cuartil': 80, 'Indexación': 112,
        'Referencia (APA)': 450, 'Link/DOI': 120
    },

    _construirLibroXLSX(cols, filas) {
        if (typeof ExcelJS === 'undefined') throw new Error('La librería de Excel no está cargada.');
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Matriz de revisión');

        // Anchos: Excel mide en "caracteres" del tipo por defecto; la conversión
        // estándar desde píxeles es (px - 5) / 7.
        ws.columns = cols.map(c => ({
            width: Math.round(((this._ANCHOS_PX_MATRIZ[c] || 100) - 5) / 7 * 100) / 100
        }));

        const fuente = { name: 'Times New Roman', size: 12 };
        const alineado = { vertical: 'middle', horizontal: 'left', wrapText: true };
        // "Todos los bordes": línea fina en los cuatro lados de cada celda.
        const lado = { style: 'thin', color: { argb: 'FF000000' } };
        const bordes = { top: lado, left: lado, bottom: lado, right: lado };

        // Encabezado (fila 1): negrita, fondo gris claro y bordes.
        const filaEnc = ws.addRow(cols);
        filaEnc.eachCell(cell => {
            cell.font = { ...fuente, bold: true };
            cell.alignment = alineado;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
            cell.border = bordes;
        });

        // Cuerpo: valores planos (sin HTML), con el formato pedido y bordes.
        for (const f of filas) {
            const fila = ws.addRow(f.planas);
            fila.eachCell({ includeEmpty: true }, cell => {
                cell.font = fuente;
                cell.alignment = alineado;
                cell.border = bordes;
            });
        }
        return wb;
    },

    async _exportarXLSX(cols, filas) {
        try {
            const wb = this._construirLibroXLSX(cols, filas);
            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'matriz_revision_bibliografica.xlsx';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        } catch (e) {
            alert('No se pudo generar el Excel: ' + e.message);
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
