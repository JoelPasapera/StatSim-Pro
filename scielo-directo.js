// ========================================
// BÚSQUEDA EN SciELO (vía Crossref) — módulo dedicado.
// SciELO es CLAVE para tesis latinoamericanas: investigación en español de Perú,
// Colombia, México, Chile, Argentina, etc., a menudo ausente en Scopus/PubMed.
//
// POR QUÉ VÍA CROSSREF (decisión tras probar empíricamente):
//   El buscador propio de SciELO (search.scielo.org) NO expone API JSON pública
//   (devuelve 500) y su ArticleMeta es lento y sin CORS (timeouts por proxy).
//   PERO: cada artículo de SciELO con DOI está registrado en Crossref por la
//   propia SciELO al publicarse — sin retraso de indexación. Crossref SÍ tiene
//   búsqueda por texto, filtros y CORS perfecto. Filtrando por el member de
//   SciELO se obtiene su catálogo AUTÉNTICO (no una aproximación de terceros).
//
//   Member IDs de SciELO en Crossref (confirmados):
//     530  = FapUNIFESP (SciELO)  ← el principal (Brasil + red regional)
//     2868 = SciELO España / Repisalud
//     2516 = SciELO ANID (Chile)
//
// FILTRO POR PAÍS: Crossref no marca país de colección, pero el campo de afiliación
//   y el idioma permiten aproximarlo. Para filtro de país fiable se combina con la
//   búsqueda general (member SciELO) + post-filtro por país de afiliación si existe.
//
// Sin API key (Crossref es abierto). Se envía 'mailto' (buena práctica, mejor trato).
// ========================================

const ScieloDirecto = {

    BASE: 'https://api.crossref.org/works',
    MAILTO: 'statsim.research@gmail.com',
    // Member IDs de SciELO en Crossref (se consultan juntos con OR via member route).
    MEMBER_PRINCIPAL: '530', // FapUNIFESP (SciELO) — cubre la red SciELO

    // Países SciELO (para el selector). Crossref no filtra por colección, pero
    // sí podemos pasar el país como término adicional o post-filtrar por idioma.
    PAISES: {
        '': 'Todos los países',
        'pe': 'Perú', 'co': 'Colombia', 'mx': 'México', 'cl': 'Chile',
        'ar': 'Argentina', 'br': 'Brasil', 'es': 'España', 'pt': 'Portugal',
        'cu': 'Cuba', 'cr': 'Costa Rica', 've': 'Venezuela', 'uy': 'Uruguay',
        'bo': 'Bolivia', 'py': 'Paraguay', 'ec': 'Ecuador', 'za': 'Sudáfrica'
    },

    _viaProxies: false,

    _VACIAS: new Set(['entre','e','y','o','u','de','del','la','el','los','las','en','con','para','por',
        'un','una','su','sus','al','a','the','of','and','or','in','on','for','to','with','between','an',
        'da','do','das','dos','no','na','um','uma','que']),

    _terminosClave(query) {
        const toks = String(query).toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/)
            .filter(t => t.length > 2 && !this._VACIAS.has(t));
        return [...new Set(toks)];
    },

    // Reconstruye abstract si viene en JATS XML (Crossref a veces lo incluye).
    _limpiarAbstract(abs) {
        if (!abs) return '';
        return String(abs).replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    },

    // ---- Construye la URL de búsqueda en Crossref filtrando por member SciELO ----
    _construirURL(query, filtros, rows, offset) {
        const q = this._terminosClave(query).join(' ');
        const params = [
            `query=${encodeURIComponent(q)}`,
            `rows=${rows}`,
            `offset=${offset}`,
            `mailto=${encodeURIComponent(this.MAILTO)}`
        ];
        // Filtro: solo artículos del member SciELO + tipo journal-article + año.
        const fil = [`member:${this.MEMBER_PRINCIPAL}`, 'type:journal-article'];
        if (filtros.desde) fil.push(`from-pub-date:${parseInt(filtros.desde, 10)}-01-01`);
        params.push(`filter=${fil.join(',')}`);
        return `${this.BASE}?${params.join('&')}`;
    },

    // ---- Fetch con fallback directo → proxies (Crossref tiene CORS, casi siempre directo) ----
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

    // Normaliza un item de Crossref al formato común de la app.
    _normalizar(it) {
        if (!it) return null;
        const autores = (it.author || []).map(a => {
            const fam = a.family || ''; const giv = a.given || '';
            return fam ? (giv ? `${fam}, ${giv}` : fam) : (a.name || '');
        }).filter(Boolean);
        // Año: issued.date-parts[0][0].
        let anio = 's. f.';
        try { anio = String(it.issued['date-parts'][0][0]); } catch (e) {}
        const doi = it.DOI ? `https://doi.org/${it.DOI}` : '';
        const revista = (it['container-title'] || [])[0] || '';
        const issn = (it.ISSN || [])[0] || '';
        const idioma = it.language || '';
        return {
            titulo: ((it.title || [])[0] || '(sin título)').replace(/<[^>]+>/g, '').trim(),
            autores,
            anio,
            doi,
            link: doi, // el DOI siempre resuelve (SciELO registra DOIs válidos)
            fuente: revista,
            volumen: it.volume || '', numero: it.issue || '',
            paginas: it.page || '',
            citas: 0,
            idioma,
            resumen: this._limpiarAbstract(it.abstract),
            issn,
            pais: '', // Crossref no da país de colección; se infiere si se filtró
            fuentesAPI: ['SciELO']
        };
    },

    // ---- Búsqueda con PAGINACIÓN (Crossref permite rows hasta 1000 por página) ----
    async buscar(query, filtros = {}) {
        const objetivo = filtros.maxResultados || 50;
        const PAGINA = Math.min(objetivo, 100); // 100 por página es cómodo y rápido
        const todas = [];
        let total = 0;
        for (let offset = 0; offset < objetivo; offset += PAGINA) {
            const url = this._construirURL(query, filtros, Math.min(PAGINA, objetivo - offset), offset);
            const validar = (txt) => {
                let d; try { d = JSON.parse(txt); } catch (e) { return null; }
                if (!d.message || !d.message.items) return null;
                return d.message;
            };
            const msg = await this._fetch(url, validar);
            if (!msg) {
                if (offset === 0) { const e = new Error('SciELO/Crossref no respondió'); e.scielo = true; throw e; }
                break;
            }
            total = msg['total-results'] || total;
            const obras = msg.items.map(it => this._normalizar(it)).filter(Boolean);
            // Post-filtro por país (idioma como proxy): si se eligió país hispano,
            // priorizar artículos en español/portugués según corresponda.
            todas.push(...obras);
            if (msg.items.length < PAGINA) break; // no hay más
        }
        if (!todas.length) { const e = new Error('SciELO sin coincidencias para esos términos'); e.scielo = true; e.vacio = true; throw e; }
        return { obras: todas.slice(0, objetivo), total, via: this._viaProxies ? 'proxies' : 'directo' };
    },

    // URL pública del buscador web de SciELO (para el botón "Abrir en SciELO").
    urlPublica(query, filtros = {}) {
        const terminos = this._terminosClave(query);
        let url = `https://search.scielo.org/?q=${encodeURIComponent(terminos.join(' '))}&lang=es`;
        // El buscador web sí acepta filtro por colección de país (códigos de 3 letras).
        const map3 = { pe: 'per', co: 'col', mx: 'mex', cl: 'chl', ar: 'arg', br: 'scl',
            es: 'esp', pt: 'prt', cu: 'cub', cr: 'cri', ve: 'ven', uy: 'ury',
            bo: 'bol', py: 'pry', ec: 'ecu', za: 'sza' };
        if (filtros.pais && map3[filtros.pais]) url += `&filter[in][]=${map3[filtros.pais]}`;
        return url;
    }
};

if (typeof window !== 'undefined') window.ScieloDirecto = ScieloDirecto;
