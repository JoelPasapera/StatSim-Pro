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
