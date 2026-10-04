// buscador/antecedentes/fuentesAbiertas.js — Antecedentes: fuentes abiertas (OpenAlex, Semantic Scholar, Crossref, IRIS, UNDL, ReliefWeb, Scholar) y utilidades de fetch con rescate.
// Origen: buscador/antecedentes.js (Fase 6: partición por responsabilidad, sin cambios de comportamiento).

import { ProxiesCORS } from '../../shared/proxies.js';

export const metodosAntecedentesFuentesAbiertas = {

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
};
