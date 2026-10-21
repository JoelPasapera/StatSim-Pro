// buscador/antecedentes/consultas.js — Antecedentes: traducción, sinónimos, presupuesto de consultas, puntuación y fusión de resultados.
// Origen: buscador/antecedentes.js (Fase 6: partición por responsabilidad, sin cambios de comportamiento).

export const metodosAntecedentesConsultas = {
    _topeConsultas() {
        const el = document.getElementById('antTopeConsultas');
        const n = el ? parseInt(el.value, 10) : NaN;
        return isFinite(n) ? Math.min(200, Math.max(10, n)) : this._PRESUPUESTO_CONSULTAS;
    },

    _idiomasSeleccionados() {
        const cont = document.getElementById('antIdiomas');
        if (!cont) return [['es', 'español']];
        const marcados = new Set([...cont.querySelectorAll('input:checked')].map(i => i.value));
        const sel = this._IDIOMAS.filter(([cod]) => marcados.has(cod));
        return sel.length ? sel : [['es', 'español']];
    },

    // Con variantes × idiomas manda el tope de 30 consultas: se recortan
    // variantes, nunca idiomas (esos los eligió el usuario a mano).
    _planPresupuesto(nVariantes, nIdiomas) {
        const tope = this._topeConsultas();
        const total = nVariantes * nIdiomas;
        if (total <= tope) return { variantes: nVariantes, total, recortado: false, tope };
        const v = Math.max(1, Math.floor(tope / nIdiomas));
        return { variantes: v, total: v * nIdiomas, recortado: true, tope };
    },

    async _traducirA(texto, cod) {
        if (cod === 'es') return texto;
        const clave = cod + '|' + texto.toLowerCase();
        if (this._cacheTraducciones[clave]) return this._cacheTraducciones[clave];
        const t = await this.traducirTexto(texto, 'es', cod);
        this._cacheTraducciones[clave] = (t && t.trim()) || texto;
        return this._cacheTraducciones[clave];
    },


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


    // (2026.12.30) El DOI como clave: sin el resolvedor («https://doi.org/», «http://dx.doi.org/», «doi:»), en minúsculas y
    // sin la puntuación final. Hasta la 2026.12.29 «https://doi.org/10.1/x» (Scopus) y «10.1/x» (OMS) eran dos obras.
    _doiNorm(doi) {
        return String(doi || '').trim().toLowerCase()
            .replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '').replace(/[.,;]+$/, '').trim();
    },

    // (2026.12.26) Suma las obras de una consulta a las ya reunidas sin repetir ninguna y devuelve cuántas eran nuevas. Si la
    // repetida coincide por DOI (la misma obra, sin duda), ya no se descarta sin más: la que se queda suma sus bases (la
    // «Base» y la «Indexación» nombran Scopus y Web of Science cuando las dos la encontraron; antes, solo la primera en el
    // orden de las fuentes) y toma el ISSN, las citas o el resumen que le faltaban (el resumen, salvo el de Google
    // Académico, que es un fragmento: con él la obra ya no se enriquecería). Si solo coinciden por el título, la repetida
    // se descarta como antes, sin sumar nada: dos obras distintas pueden llamarse igual («Editorial», «Depression»). La
    // primera vez que una obra suma algo se copia, para no tocar el objeto de la fuente (los proxies comparten sus
    // respuestas diez minutos).
    // (2026.12.30) Índice doble, por DOI normalizado y por título, como en fusionar: la obra con DOI (Scopus) y la misma sin
    // él (Google Académico) ya no son dos filas. El título solo une obras cuando a una de las dos le falta el DOI (con dos
    // DOI distintos son obras distintas), el título es largo (al menos tres palabras y veinte letras; «Editorial» no) y los
    // años, si los dos lo tienen, no se separan más de uno. Si la que llega trae el DOI que le faltaba a la reunida, esta
    // lo toma (y suma la base); si la que llega no lo trae, se descarta como cualquier coincidencia por título.
    //   indice: Map clave → posición en acumuladas · acumuladas: la lista en orden de llegada (se amplía aquí)
    _incorporarObras(indice, acumuladas, obras) {
        let nuevas = 0;
        const anioDe = o => { const a = parseInt(o && o.anio, 10); return Number.isFinite(a) ? a : null; };
        for (const o of obras) {
            const doi = this._doiNorm(o.doi), titulo = this._norm(o.titulo);
            const kd = doi ? 'd:' + doi : '', kt = titulo ? 't:' + titulo : '';
            let pos = kd ? indice.get(kd) : undefined, porTitulo = false;
            if (pos === undefined && kt && indice.has(kt)) {
                const candidata = acumuladas[indice.get(kt)];
                const doiCandidata = this._doiNorm(candidata.doi);
                const ambosSinDoi = !doi && !doiCandidata, unoSinDoi = !doi !== !doiCandidata;
                const tituloLargo = titulo.split(' ').length >= 3 && titulo.length >= 20;
                const a1 = anioDe(o), a2 = anioDe(candidata), aniosCompatibles = a1 === null || a2 === null || Math.abs(a1 - a2) <= 1;
                if (ambosSinDoi || (unoSinDoi && tituloLargo && aniosCompatibles)) { pos = indice.get(kt); porTitulo = true; }
            }
            if (pos === undefined) {
                const nueva = acumuladas.length;
                if (kd) indice.set(kd, nueva);
                if (kt && !indice.has(kt)) indice.set(kt, nueva);
                acumuladas.push(o); nuevas++; continue;
            }
            let previa = acumuladas[pos];
            if (previa === o || !doi) continue;
            // por título, con el DOI que le faltaba a la reunida: la misma obra, que ahora se reconoce también por el DOI
            const doiNuevo = porTitulo && !this._doiNorm(previa.doi) ? o.doi : '';
            const bases = [...new Set([...(previa.fuentesAPI || []), ...(o.fuentesAPI || [])])];
            const issn = !previa.issn && o.issn ? o.issn : '';
            const citas = !(previa.citas > 0) && o.citas > 0 ? o.citas : 0;
            const fragmento = (o.fuentesAPI || []).includes('Scholar');
            const resumen = (!previa.resumen || previa.resumen.length < 40) && !fragmento && o.resumen && o.resumen.length >= 40 ? o.resumen : '';
            if (doiNuevo) indice.set(kd, pos);
            if (!doiNuevo && bases.length === (previa.fuentesAPI || []).length && !issn && !citas && !resumen) continue;
            if (!previa._fusionada) { previa = acumuladas[pos] = { ...previa, _fusionada: true }; }
            if (doiNuevo) previa.doi = doiNuevo;
            previa.fuentesAPI = bases;
            if (issn) previa.issn = issn;
            if (citas) previa.citas = citas;
            if (resumen) previa.resumen = resumen;
        }
        return nuevas;
    },


    fusionar(listas, query, idiomaPref) {
        // Índice DOBLE (por DOI y por título normalizado): así se reconoce la
        // misma obra aunque una fuente traiga DOI y otra no.
        const vistos = new Map();
        const kDoi = o => this._doiNorm(o.doi);   // (2026.12.30) el mismo DOI normalizado de _incorporarObras
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
};
