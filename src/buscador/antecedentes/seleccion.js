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
        // (2026.12.26) Las obras con el nombre de revista provisional (Web of Science) que YA traen resumen no pasan por
        // _recuperarDatos: para ellas basta preguntar a OpenAlex por la revista.
        const soloRevista = obras.filter(o => o._revistaProvisional && !o._intentadoRevista && !pendientes.includes(o) && /doi\.org\//.test(o.doi || ''));
        if (!pendientes.length && !hayMetricas && !soloRevista.length) return;
        pendientes.forEach(o => { o._intentadoEnriquecer = true; o._intentadoRevista = true; });
        soloRevista.forEach(o => { o._intentadoRevista = true; });
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
                    // (2026.12.27) el ISSN que falta (ScienceDirect, Crossref sin él…): con él, la revista tiene cuartil. No
                    // cuenta como cambio: no se ve hasta que llegan las métricas de la revista.
                    this._aplicarIssn(o, datos);
                    // Reparar enlace: si el actual falta o no es OA, usar el mejor hallado. (2026.12.27) Solo cuenta si cambia:
                    // el resolvedor DOI de respaldo es el mismo enlace que ya tenía una obra con DOI.
                    if (datos.link && (!o.link || o.link === o.doi) && datos.link !== o.link) { o.link = datos.link; cambios++; }
                    if (this._aplicarRevista(o, datos)) cambios++;
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, pendientes.length) }, () => trabajador()));
        let iRev = 0;
        const trabajadorRevista = async () => {
            while (iRev < soloRevista.length) {
                const o = soloRevista[iRev++];
                if (this._aplicarRevista(o, { revista: await this._revistaPorDoi(o.doi) })) cambios++;
            }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, soloRevista.length) }, () => trabajadorRevista()));
        // (2026.12.27) Primero se pinta lo que ya llegó (resúmenes, enlaces, revistas); las métricas de las revistas, que van
        // por los proxies y pueden tardar (más ahora que el enriquecimiento pone el ISSN que faltaba), se pintan después.
        if (cambios) {
            const dbg = (typeof window !== 'undefined' && window.__enrichDebug) ? window.__enrichDebug : {};
            const resumen = Object.entries(dbg).map(([k, v]) => `${k}×${v}`).join(', ');
            this._repintarEnriquecido(` · Autocompletado: ${cambios} campos.` + (resumen ? ` [${resumen}]` : ''));
        }
        const conMetricas = await this._enriquecerMetricas(obras);
        if (conMetricas) this._repintarEnriquecido(` · Métricas de revista (cuartil) para ${conMetricas} obra(s).`);
    },


    // Añade una nota al estado del Buscador y vuelve a pintar los resultados (y la selección, si la hay).
    _repintarEnriquecido(nota) {
        const estado = document.getElementById('antEstado');
        if (estado) estado.textContent = (estado.textContent || '') + nota;
        this._renderResultados(this._obras);
        if (this._seleccion.size) this._renderSeleccion();
    },


    // (2026.12.27) Pone a una obra sin ISSN el que dio OpenAlex por su DOI, solo si es la misma revista (o la obra no
    // nombra ninguna): si el registro de OpenAlex fuera de otra revista, el cuartil sería de otra. Se comparan los nombres
    // sin mayúsculas, tildes, signos ni las palabras de unión («Computers & Graphics» = «Computers and Graphics»).
    // Devuelve si lo puso.
    _aplicarIssn(o, datos) {
        if (!o || o.issn || !datos || !datos.issn) return false;
        const nombre = s => this._norm(s).replace(/\b(?:the|and|of|y|e|de|la|el)\b/g, ' ').replace(/\s+/g, ' ').trim();
        if (o.fuente && datos.revista && nombre(o.fuente) !== nombre(datos.revista)) return false;
        if (o.fuente && !datos.revista) return false;
        o.issn = datos.issn;
        return true;
    },


    // (2026.12.26) El nombre de revista provisional (Web of Science lo da en mayúsculas y sin tildes, y fuentes/wos.js
    // lo pasa a mayúsculas iniciales) se cambia por el de OpenAlex solo si es la MISMA revista escrita de otra forma
    // (iguales sin mayúsculas, tildes ni signos): «Revista Latinoamericana de Psicologia» → «… de Psicología». Nunca
    // cambia una revista por otra. Devuelve si la cambió.
    _aplicarRevista(o, datos) {
        if (!o || !o._revistaProvisional || !datos || !datos.revista) return false;
        if (this._norm(datos.revista) !== this._norm(o.fuente)) return false;
        o.fuente = datos.revista;
        o._revistaProvisional = false;
        return true;
    },


    // (2026.12.26) El nombre de la revista según OpenAlex (solo si su fuente es una revista), o ''.
    async _revistaPorDoi(doi) {
        const limpio = String(doi || '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '').trim();
        if (!limpio) return '';
        try {
            const r = await fetch(`https://api.openalex.org/works/doi:${limpio}`);
            if (!r.ok) return '';
            const d = await r.json();
            const fuenteOA = d && d.primary_location && d.primary_location.source;
            return fuenteOA && fuenteOA.type === 'journal' && typeof fuenteOA.display_name === 'string' ? fuenteOA.display_name.trim() : '';
        } catch (e) { return ''; }
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
        let abstract = '', link = '', autores = [], anio = '', revista = '', issn = '';

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
                // (2026.12.26) el nombre de la revista tal como lo escribe OpenAlex (con sus tildes y mayúsculas)
                const fuenteOA = d.primary_location && d.primary_location.source;
                if (fuenteOA && fuenteOA.type === 'journal' && typeof fuenteOA.display_name === 'string') revista = fuenteOA.display_name.trim();
                // (2026.12.27) y su ISSN (el ISSN-L o, si no es legible, el primero de la lista que lo sea), para el cuartil de
                // las obras que llegan sin él
                if (fuenteOA && fuenteOA.type === 'journal') {
                    const valido = [fuenteOA.issn_l, ...(Array.isArray(fuenteOA.issn) ? fuenteOA.issn : [])]
                        .find(x => typeof x === 'string' && /^\d{4}-?\d{3}[\dXx]$/.test(x.trim()));
                    if (valido) issn = valido.trim();
                }
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
        return { abstract, link, autores, anio, revista, issn };
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
            this._aplicarIssn(o, datos);
            this._aplicarRevista(o, datos);
            await new Promise(r => setTimeout(r, 200));
        }
        // Mensaje honesto y detallado de qué se logró y qué no.
        let msg = `✓ ${logrados} de ${pendientes.length} artículos enriquecidos con su resumen.`;
        if (sinAbstract) msg += ` ${sinAbstract} no tienen resumen disponible en las bases abiertas.`;
        if (sinDOI) msg += ` ${sinDOI} no tienen DOI (no se pueden enriquecer).`;
        if (estado) estado.textContent = msg;
        this._renderSeleccion(); // re-pintar con los nuevos datos
        // (2026.12.27) y el cuartil de las revistas cuyo ISSN acaba de llegar (van por los proxies: se pinta después)
        if (await this._enriquecerMetricas(sel)) this._renderSeleccion();
    },
};
