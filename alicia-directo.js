// ========================================
// BÚSQUEDA EN ALICIA (CONCYTEC) — módulo dedicado.
// ALICIA es el Repositorio Nacional Digital de Acceso Libre del Perú: agrega las
// TESIS y la producción científica de las universidades peruanas. Es la fuente
// MÁS valiosa para una tesis peruana: encuentras tesis previas locales sobre tu
// tema (metodología, referencias y formato esperado en tu país).
//
// API: VuFind REST API (alicia.concytec.gob.pe/vufind/api/v1/search). Confirmada
//   funcionando DIRECTO desde el navegador (status 200, JSON, SIN CORS) — la única
//   fuente que conecta sin proxies. Búsqueda por texto libre nativa.
//
// Sin API key (acceso abierto, repositorio público gubernamental).
// ========================================

const AliciaDirecto = {

    BASE: 'https://alicia.concytec.gob.pe/vufind/api/v1/search',
    RECORD: 'https://alicia.concytec.gob.pe/vufind/Record/',

    _viaProxies: false,

    _VACIAS: new Set(['entre','e','y','o','u','de','del','la','el','los','las','en','con','para','por',
        'un','una','su','sus','al','a','the','of','and','or','in','on','for','to','with','between','an',
        'que','se','es','por','como']),

    _terminosClave(query) {
        const toks = String(query).toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/)
            .filter(t => t.length > 2 && !this._VACIAS.has(t));
        return [...new Set(toks)];
    },

    // ---- Fetch con fallback directo → proxies (ALICIA funciona directo) ----
    async _fetch(url, validar) {
        try {
            const r = await fetch(url);
            if (r.ok) {
                const txt = await r.text();
                const d = validar(txt);
                if (d !== null) { this._viaProxies = false; return d; }
            }
        } catch (e) { /* probar proxies */ }
        if (typeof ProxiesCORS !== 'undefined') {
            try {
                const { obras } = await ProxiesCORS.carrera(url,
                    txt => { const d = validar(txt); return d === null ? null : [d]; },
                    { anchura: 3, timeout: 15000, oleadas: 2 });
                this._viaProxies = true;
                return obras[0];
            } catch (e) { /* ningún proxy respondió */ }
        }
        return null;
    },

    // Normaliza un registro de VuFind al formato común de la app.
    _normalizar(rec) {
        if (!rec) return null;
        // Autores: VuFind los da en authors.primary {nombre:{role}} + secondary.
        let autores = [];
        if (rec.authors) {
            if (rec.authors.primary) autores = autores.concat(Object.keys(rec.authors.primary));
            if (Array.isArray(rec.authors.secondary)) autores = autores.concat(rec.authors.secondary);
            else if (rec.authors.secondary) autores = autores.concat(Object.keys(rec.authors.secondary));
        }
        autores = autores.filter(Boolean);
        // Título.
        const titulo = (rec.title || '(sin título)').replace(/<[^>]+>/g, '').trim();
        // Año: publicationDates es un array de strings.
        let anio = 's. f.';
        if (Array.isArray(rec.publicationDates) && rec.publicationDates[0]) {
            const m = String(rec.publicationDates[0]).match(/\d{4}/);
            if (m) anio = m[0];
        }
        // DOI (si existe).
        const doi = rec.cleanDoi || rec.doi || '';
        const doiURL = doi ? `https://doi.org/${doi}` : '';
        // Enlace: primero URL directa del recurso, si no la ficha en ALICIA.
        let link = '';
        if (Array.isArray(rec.urls) && rec.urls.length) link = rec.urls[0].url || rec.urls[0];
        if (!link && doiURL) link = doiURL;
        if (!link && rec.id) link = `${this.RECORD}${encodeURIComponent(rec.id)}`;
        // Revista/institución (publishers o institutions).
        let fuente = '';
        if (Array.isArray(rec.publishers) && rec.publishers[0]) fuente = rec.publishers[0];
        else if (Array.isArray(rec.institutions) && rec.institutions[0]) fuente = rec.institutions[0];
        // Abstract (summary es array de strings).
        let resumen = '';
        if (Array.isArray(rec.summary) && rec.summary.length) resumen = rec.summary.join(' ');
        else if (typeof rec.summary === 'string') resumen = rec.summary;
        // Idioma.
        let idioma = '';
        if (Array.isArray(rec.languages) && rec.languages[0]) idioma = rec.languages[0];
        // Tipo (tesis, artículo…) de formats.
        let tipo = '';
        if (Array.isArray(rec.formats) && rec.formats[0]) tipo = rec.formats[0];
        return {
            titulo,
            autores,
            anio,
            doi: doiURL,
            link,
            fuente: fuente || 'ALICIA (CONCYTEC)',
            volumen: '', numero: '', paginas: '',
            citas: 0,
            idioma,
            resumen: String(resumen).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
            issn: '',
            tipo, // tesis / article (valor de ALICIA)
            pais: 'Perú', // ALICIA es 100% producción peruana
            fuentesAPI: ['ALICIA']
        };
    },

    // ---- Búsqueda con PAGINACIÓN (VuFind: page + limit, máx 100 por página) ----
    async buscar(query, filtros = {}) {
        const objetivo = filtros.maxResultados || 50;
        const POR_PAGINA = Math.min(objetivo, 100);
        const campos = ['title', 'authors', 'publicationDates', 'summary', 'urls',
            'formats', 'languages', 'cleanDoi', 'doi', 'institutions', 'publishers', 'id'];
        const camposQS = campos.map(c => `field[]=${c}`).join('&');
        const q = this._terminosClave(query).join(' ');
        const todas = [];
        let total = 0;
        const paginas = Math.ceil(objetivo / POR_PAGINA);
        for (let p = 1; p <= paginas; p++) {
            let url = `${this.BASE}?lookfor=${encodeURIComponent(q)}&limit=${POR_PAGINA}&page=${p}&${camposQS}`;
            // Filtro por año (rango): VuFind usa filtros tipo publishDate.
            if (filtros.desde) url += `&filter[]=${encodeURIComponent(`publishDate:[${parseInt(filtros.desde, 10)} TO *]`)}`;
            const validar = (txt) => {
                let d; try { d = JSON.parse(txt); } catch (e) { return null; }
                if (typeof d.resultCount === 'undefined' || !Array.isArray(d.records)) return null;
                return d;
            };
            const d = await this._fetch(url, validar);
            if (!d) { if (p === 1) { const e = new Error('ALICIA no respondió'); e.alicia = true; throw e; } break; }
            total = d.resultCount || total;
            const obras = d.records.map(r => this._normalizar(r)).filter(Boolean);
            todas.push(...obras);
            if (d.records.length < POR_PAGINA) break; // no hay más
        }
        if (!todas.length) { const e = new Error('ALICIA sin coincidencias para esos términos'); e.alicia = true; e.vacio = true; throw e; }
        return { obras: todas.slice(0, objetivo), total, via: this._viaProxies ? 'proxies' : 'directo' };
    },

    // URL pública del buscador de ALICIA (para el botón "Abrir en ALICIA").
    urlPublica(query) {
        const q = this._terminosClave(query).join(' ');
        return `https://alicia.concytec.gob.pe/vufind/Search/Results?lookfor=${encodeURIComponent(q)}&type=AllFields`;
    }
};

if (typeof window !== 'undefined') window.AliciaDirecto = AliciaDirecto;
