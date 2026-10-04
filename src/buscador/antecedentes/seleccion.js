// buscador/antecedentes/seleccion.js — Antecedentes: selección de fuentes, enriquecimiento de metadatos y fuentes para el Redactor.
// Origen: buscador/antecedentes.js (Fase 6: partición por responsabilidad, sin cambios de comportamiento).

import { ScopusDirecto } from '../fuentes/scopus.js';

export const metodosAntecedentesSeleccion = {

    // Obras que alimentan la matriz Y la redacción del marco teórico: las
    // marcadas, respetando el filtro de relevancia activo (misma regla en ambas).
    obtenerFuentesRedaccion(sel) {
        const base = sel || [...this._seleccion.values()];
        const u = (this._relevanciaAplicada && this._umbralRelevancia > 0) ? this._umbralRelevancia : 0;
        return u > 0 ? base.filter(o => (o._relevancia || 0) >= u) : base;
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
};
