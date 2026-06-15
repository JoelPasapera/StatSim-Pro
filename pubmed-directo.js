// ========================================
// BÚSQUEDA EN PUBMED (NCBI E-utilities) — módulo dedicado.
// PubMed es ideal para psicología clínica, de la salud y neurociencia.
//
// ARQUITECTURA (distinta a Scopus, más eficiente):
//   PubMed trabaja en DOS pasos en vez de uno:
//     1) ESearch  → devuelve solo PMIDs (identificadores), hasta 100.000 de golpe.
//     2) ESummary → con una lista de PMIDs (hasta ~200 por petición) devuelve
//                   todos los metadatos en JSON. EFetch añade el abstract.
//   Esto hace una búsqueda de 200 artículos = ~2 peticiones (no 8 como Scopus).
//
// CORS: NCBI E-utilities normalmente envía cabeceras CORS (Access-Control-Allow-
//   Origin: *), así que se intenta el fetch DIRECTO primero; si el navegador lo
//   bloquea, se cae al arsenal de proxies (ProxiesCORS), igual que Scopus.
//
// CLAVES: PubMed permite 10 peticiones/segundo POR CLAVE (3/s sin clave). Con
//   varias claves propias rotamos para repartir carga. Las claves se restauran
//   solas; se rota ante error de límite. Claves del propietario (son suyas).
// ========================================

const PubMedDirecto = {

    BASE: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/',
    // Identificación recomendada por NCBI (tool + email) para no ser bloqueado.
    TOOL: 'StatSimPro',
    EMAIL: 'statsim.research@gmail.com',

    // API keys propias (rotación para repartir el límite de 10 req/s por clave).
    API_KEYS: [
        '382288160cf549c4909375ca078abd13f608',
        'f5c29ea8616b4c30143fc02750830732f407',
        'c23c619559ee1bd25a67c2f5b4e3e23f0508',
        '9e2f503d73e128e28e980c01bde98d4d6908',
        '30f9d2b848e78553de6aea96de1a606be109'
    ],
    _idxKey: 0,

    _siguienteKey() {
        const k = this.API_KEYS[this._idxKey % this.API_KEYS.length];
        this._idxKey++;
        return k;
    },

    // Parámetros comunes (clave + identificación) para toda petición.
    _comun() {
        return `api_key=${this._siguienteKey()}&tool=${this.TOOL}&email=${encodeURIComponent(this.EMAIL)}`;
    },

    // Palabras vacías (ES+EN) que estorban el match.
    _VACIAS: new Set(['entre','e','y','o','u','de','del','la','el','los','las','en','con','para','por',
        'un','una','su','sus','al','a','the','of','and','or','in','on','for','to','with','between','an']),

    // Términos clave de la consulta, unidos por AND (mejor recall en PubMed).
    _terminosClave(query) {
        const toks = String(query).toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/)
            .filter(t => t.length > 2 && !this._VACIAS.has(t));
        return [...new Set(toks)];
    },

    // ---- Fetch con fallback: directo primero, proxies si CORS bloquea ----
    async _fetchJSON(url, validar) {
        // 1) Intento directo (NCBI suele permitir CORS).
        try {
            const r = await fetch(url);
            if (r.ok) {
                const txt = await r.text();
                const d = validar(txt);
                if (d !== null) { this._viaProxies = false; return d; }
            }
        } catch (e) { /* CORS o red: probar proxies */ }
        // 2) Fallback al arsenal de proxies.
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

    // ---- Paso 1: ESearch → lista de PMIDs ----
    // Devuelve { pmids: [...], total: N } o null si falla.
    async _buscarPMIDs(query, filtros, retstart, retmax) {
        const terminos = this._terminosClave(query);
        let term = terminos.join('+AND+');
        // Filtro de año (rango desde 'desde' hasta el presente).
        if (filtros.desde) term += `+AND+(${parseInt(filtros.desde,10)}:3000[pdat])`;
        const url = `${this.BASE}esearch.fcgi?db=pubmed&term=${encodeURIComponent(term).replace(/%2B/g,'+')}`
            + `&retstart=${retstart}&retmax=${retmax}&retmode=json&sort=relevance&${this._comun()}`;
        const validar = (txt) => {
            let d; try { d = JSON.parse(txt); } catch (e) { return null; }
            const res = d.esearchresult;
            if (!res) return null;
            if (res.ERROR) return null;
            return { pmids: res.idlist || [], total: parseInt(res.count || '0', 10) };
        };
        return await this._fetchJSON(url, validar);
    },

    // ---- Paso 2: ESummary → metadatos de un lote de PMIDs (JSON) ----
    async _resumenLote(pmids) {
        if (!pmids.length) return [];
        const url = `${this.BASE}esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json&${this._comun()}`;
        const validar = (txt) => {
            let d; try { d = JSON.parse(txt); } catch (e) { return null; }
            const res = d.result;
            if (!res) return null;
            return res; // objeto { uids:[...], <pmid>:{...} }
        };
        const res = await this._fetchJSON(url, validar);
        if (!res) return [];
        const uids = res.uids || pmids;
        return uids.map(id => this._normalizar(res[id])).filter(Boolean);
    },

    // ---- Paso 3 (opcional): EFetch → abstracts de un lote (texto) ----
    // Devuelve un mapa { pmid: abstract }.
    async _abstractsLote(pmids) {
        if (!pmids.length) return {};
        const url = `${this.BASE}efetch.fcgi?db=pubmed&id=${pmids.join(',')}&rettype=abstract&retmode=xml&${this._comun()}`;
        const validar = (txt) => (txt && txt.includes('<') ? txt : null); // XML crudo
        const xml = await this._fetchJSON(url, validar);
        if (!xml) return {};
        return this._parsearAbstracts(xml);
    },

    // Extrae abstracts del XML de EFetch (sin DOMParser: regex tolerante por PMID).
    _parsearAbstracts(xml) {
        const mapa = {};
        // Cada artículo va en <PubmedArticle>...</PubmedArticle>.
        const articulos = xml.split('<PubmedArticle>').slice(1);
        for (const art of articulos) {
            const pmidM = art.match(/<PMID[^>]*>(\d+)<\/PMID>/);
            if (!pmidM) continue;
            const pmid = pmidM[1];
            // Puede haber varias secciones <AbstractText ...>...</AbstractText>.
            const partes = [...art.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)]
                .map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim())
                .filter(Boolean);
            if (partes.length) mapa[pmid] = partes.join(' ');
        }
        return mapa;
    },

    // Normaliza un registro de ESummary al formato común de la app.
    _normalizar(e) {
        if (!e || e.error) return null;
        const autores = (e.authors || []).map(a => a.name).filter(Boolean);
        // DOI: viene en articleids con idtype 'doi'.
        let doi = '';
        (e.articleids || []).forEach(a => { if (a.idtype === 'doi') doi = a.value; });
        const doiURL = doi ? `https://doi.org/${doi}` : '';
        const pmid = e.uid || '';
        // Enlace: DOI si hay, si no la ficha de PubMed (siempre funciona).
        const link = doiURL || (pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : '');
        return {
            titulo: (e.title || '(sin título)').replace(/<[^>]+>/g, '').replace(/\.$/, ''),
            autores,
            anio: (e.pubdate || '').slice(0, 4) || 's. f.',
            doi: doiURL,
            link,
            pmid,
            fuente: e.fulljournalname || e.source || '',
            volumen: e.volume || '', numero: e.issue || '',
            paginas: e.pages || '',
            citas: 0, // PubMed no da recuento de citas
            idioma: (e.lang && e.lang[0]) || '',
            resumen: '', // se rellena con EFetch (abstract)
            issn: e.issn || e.essn || '',
            fuentesAPI: ['PubMed']
        };
    },

    // ---- Búsqueda completa con PAGINACIÓN y enriquecimiento de abstracts ----
    // Trae 'maxResultados' artículos: 1 ESearch + lotes de ESummary/EFetch (200).
    async buscar(query, filtros = {}) {
        const objetivo = filtros.maxResultados || 50;
        // 1) Una sola ESearch trae todos los PMIDs necesarios (hasta 100.000).
        const r = await this._buscarPMIDs(query, filtros, 0, objetivo);
        if (!r) { const e = new Error('PubMed no respondió (ESearch)'); e.pubmed = true; throw e; }
        if (!r.pmids.length) { const e = new Error('PubMed sin coincidencias para esos términos'); e.pubmed = true; e.vacio = true; throw e; }

        // 2) Metadatos en lotes de 200 PMIDs (límite cómodo de URL).
        const LOTE = 200;
        const todas = [];
        for (let i = 0; i < r.pmids.length; i += LOTE) {
            const lote = r.pmids.slice(i, i + LOTE);
            const obras = await this._resumenLote(lote);
            // 3) Abstracts del mismo lote (EFetch) y los fusiona.
            const abs = await this._abstractsLote(lote);
            obras.forEach(o => { if (o.pmid && abs[o.pmid]) o.resumen = abs[o.pmid]; });
            todas.push(...obras);
        }
        return { obras: todas.slice(0, objetivo), total: r.total, via: this._viaProxies ? 'proxies' : 'directo' };
    },

    // URL pública de PubMed para el botón "Abrir en PubMed".
    urlPublica(query, filtros = {}) {
        const terminos = this._terminosClave(query);
        let term = terminos.join(' AND ');
        if (filtros.desde) term += ` AND (${parseInt(filtros.desde,10)}:3000[pdat])`;
        return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(term)}`;
    }
};

if (typeof window !== 'undefined') window.PubMedDirecto = PubMedDirecto;
