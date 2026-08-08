// ========================================
// PANORAMA MUNDIAL DE SALUD MENTAL — F1 (módulo del Explorador).
// Mapa choropleth 2D (d3 + TopoJSON vendorizados, cero librerías nuevas
// de peso) con carga PEREZOSA: nada se descarga hasta pulsar "Mostrar".
// Indicador F1: mortalidad por suicidio (OMS/GHO, por 100 mil, edad
// estandarizada) vía API oficial, con rescate por ProxiesCORS.
// Drill de 3 capas: País → Problema → Población → 🔭 semilla al
// medidor de brechas del Explorador (cierra el círculo del pipeline).
// F2 (prevalencia/incidencia/DALYs por trastorno) requiere el dataset
// GBD del IHME: las opciones aparecen deshabilitadas hasta vendorizarlo.
// ========================================
const PanoramaMundial = {
    PROBLEMAS: ['depresión', 'ansiedad', 'consumo de sustancias', 'suicidio y autolesión', 'trastorno bipolar', 'psicosis', 'trastornos alimentarios', 'TDAH', 'estrés postraumático', 'insomnio'],
    POBLACIONES: ['niños', 'adolescentes', 'universitarios', 'adultos', 'adultos mayores', 'mujeres', 'varones', 'gestantes'],
    _datos: null, _iso: null, _num2info: null, _sel: {}, _gbd: null, _indicador: 'suicidio',
    montar() {
        const slot = document.getElementById('seccionExplorar');
        if (!slot || document.getElementById('panoramaMundial')) return;
        const card = document.createElement('div');
        card.className = 'card';
        card.id = 'panoramaMundial';
        card.innerHTML = `
          <h3 class="card-title">🌍 Panorama mundial de salud mental</h3>
          <p class="help-text" style="margin:0 0 0.7rem;">Explora qué problemas presentan mayor carga en cada país y conviértelos en líneas de investigación: país → problema → población → medición de brechas.</p>
          <div id="panPortada" style="text-align:center; padding:1rem 0;">
            <button id="panAbrir" class="btn btn-secondary" style="padding:0.5rem 1.2rem;">🗺️ Mostrar panorama mundial</button>
            <p class="help-text" style="margin-top:0.5rem;">Carga el mapa y los datos de la OMS solo cuando lo pidas (≈45 KB).</p>
          </div>
          <div id="panCuerpo" style="display:none;">
            <div style="display:flex; gap:0.7rem; flex-wrap:wrap; align-items:center; margin-bottom:0.6rem;">
              <label style="font-size:0.9em; display:flex; align-items:center; gap:0.4rem;">Indicador
                <select id="panIndicador" class="input input-sm" style="width:auto; max-width:100%;">
                  <option value="suicidio">Mortalidad por suicidio (OMS · por 100 mil · edad estandarizada)</option>
                  <option value="depresion" id="panOpDepresion">Prevalencia de depresión (OMS · % de la población)</option>
                  <option disabled id="panSepGBD">— F2 · requieren dataset GBD (IHME) —</option>
                  <option value="prevalencia" disabled data-gbd>Prevalencia de trastornos mentales</option>
                  <option value="incidencia" disabled data-gbd>Incidencia de trastornos mentales</option>
                  <option value="dalys" disabled data-gbd>Carga de enfermedad (DALYs)</option>
                  <option value="ylds" disabled data-gbd>Discapacidad (YLDs)</option>
                </select>
              </label>
              <span id="panEstado" class="help-text" style="margin:0;"></span>
            </div>
            <div id="panMapa" style="overflow:auto;"></div>
            <div id="panLeyenda" class="help-text" style="margin-top:0.4rem;"></div>
            <div id="panPanel" style="display:none; margin-top:0.8rem; border:1px solid var(--color-border,#2a3b52); border-radius:0.7rem; padding:0.9rem 1rem;"></div>
            <p class="help-text" style="margin-top:0.6rem;">Fuentes: OMS, Observatorio Mundial de la Salud (GHO) — mortalidad por suicidio (edad estandarizada, ambos sexos) y prevalencia de depresión (Global Health Estimates). Por país se toma el último año disponible; cuando la OMS publica varias estimaciones para ese año, se muestra su mediana. Los países en gris no reportan dato.</p>
          </div>`;
        slot.appendChild(card);
        document.getElementById('panAbrir').addEventListener('click', () => this._abrir());
        // UNA delegación para todo el panorama (mapa + capas del panel).
        card.addEventListener('click', (e) => {
            const pais = e.target.closest('path[data-num]');
            if (pais) { this._elegirPais(pais.dataset.num); return; }
            const b = e.target.closest('button[data-cap]');
            if (!b) return;
            if (b.dataset.cap === 'problema') { this._sel.problema = b.dataset.v; this._panel(); }
            else if (b.dataset.cap === 'poblacion') { this._sel.poblacion = b.dataset.v; this._panel(); }
            else if (b.dataset.cap === 'ir') this._explorar();
        });
    },
    _cargarTopojson() {
        return new Promise((res, rej) => {
            if (window.topojson) return res();
            const s = document.createElement('script');
            s.src = 'topo-lite.js';
            s.onload = () => res();
            s.onerror = () => rej(new Error('No se pudo cargar topo-lite.js (¿está en la raíz del sitio?)'));
            document.head.appendChild(s);
        });
    },
    async _abrir() {
        const est = document.getElementById('panEstado');
        document.getElementById('panPortada').style.display = 'none';
        document.getElementById('panCuerpo').style.display = '';
        if (est) est.textContent = '⏳ Cargando mapa y datos de la OMS…';
        try {
            const [mundo, iso] = await Promise.all([
                fetch('countries-110m.json').then(r => r.json()),
                fetch('iso-codigos.json').then(r => r.json()),
                this._cargarTopojson()
            ]);
            this._iso = iso;
            this._num2info = {};
            for (const [iso3, v] of Object.entries(iso)) this._num2info[v.n] = { iso3, es: v.es };
            this._paises = window.topojson.feature(mundo, mundo.objects.countries).features;
            // Los indicadores OMS pueden fallar (red, proxies): el mapa se
            // pinta SIEMPRE — con datos si llegan, en gris con aviso si no.
            this._datos = {};
            let errOMS = null;
            try { await this._cargarSuicidio(); } catch (e) { errOMS = e; }
            try { await this._cargarDepresion(); } catch (e) { /* la opción se apaga sola */ }
            await this._cargarGBD(); // F2: se desbloquea solo si el dataset existe
            this._render();
            const sel = document.getElementById('panIndicador');
            if (sel) sel.addEventListener('change', () => { this._indicador = sel.value; this._render(); });
            if (est) est.textContent = errOMS
                ? '⚠️ La OMS no respondió ahora (directo y proxies): mapa sin colorear. El drill por país sigue disponible; reintenta en unos minutos recargando.'
                : `✓ ${Object.keys(this._datos).length} países con dato. Toca un país para explorarlo.`;
        } catch (e) {
            if (est) est.textContent = '❌ ' + (e.message || 'No se pudo cargar el panorama.');
        }
    },
    // ---- F2 · dataset GBD (IHME) vendorizado: si gbd-datos.json está en la
    // raíz, las opciones de prevalencia/incidencia/DALYs/YLDs se desbloquean
    // solas. Esquema: { meta:{fuente,anio}, indicadores:{ prevalencia:{nombre,
    // unidad,datos:{ISO3:valor}}, ... } }. Sin archivo → siguen deshabilitadas
    // (nunca se pintan datos inventados). ----
    // Los datos GBD NO se vendorizan (la licencia del IHME prohíbe
    // redistribuirlos): se cargan EN VIVO desde Our World in Data, que los
    // publica con acceso abierto. Cada usuario los recibe de la fuente.

    _parseCSV(texto) {
        const lineas = texto.trim().split(/\r?\n/);
        if (lineas.length < 2) return null;
        const cab = lineas[0].split(',').map(s => s.trim().toLowerCase());
        const iCode = cab.findIndex(c => c === 'code');
        const iYear = cab.findIndex(c => c === 'year');
        if (iCode < 0 || iYear < 0) return null;
        const iVal = cab.length - 1; // la métrica es la última columna
        const mejor = {}; let anioMax = 0;
        for (let i = 1; i < lineas.length; i++) {
            const c = lineas[i].split(',');
            const iso3 = (c[iCode] || '').trim(), anio = +c[iYear], val = +c[iVal];
            if (!/^[A-Z]{3}$/.test(iso3) || !isFinite(val)) continue; // solo países (fuera regiones OWID)
            if (!mejor[iso3] || anio > mejor[iso3].anio) mejor[iso3] = { anio, val };
            if (anio > anioMax) anioMax = anio;
        }
        return Object.keys(mejor).length > 30 ? { datos: mejor, anio: anioMax } : null;
    },
    async _cargarGBD() {
        // 1º: dataset local (si algún día existe, manda).
        try {
            const r = await fetch('gbd-datos.json');
            if (r.ok) {
                const g = await r.json();
                if (g && g.indicadores) { this._gbd = g; this._activarGBD(); return; }
            }
        } catch (e) { /* seguimos a OWID */ }
        // Sin dataset local no hay más vías: el IHME (GBD 2023) publica bajo
        // una licencia que prohíbe la redistribución, y Our World in Data
        // desactivó la descarga abierta de estos datos. Antes de inventar
        // cifras, las opciones quedan dormidas — con el motivo a la vista.
        const sep = document.getElementById('panSepGBD');
        if (sep) sep.textContent = '— F2 · licencia IHME: requiere tu dataset GBD (gbd-datos.json) —';
    },

    _activarGBD() {
        const g = this._gbd;
        const sep = document.getElementById('panSepGBD');
        if (sep) sep.textContent = `— ${(g.meta && g.meta.fuente) || 'IHME GBD'} —`;
        document.querySelectorAll('#panIndicador option[data-gbd]').forEach(o => {
            if (g.indicadores[o.value]) o.disabled = false;
        });
    },
    // Datos del indicador activo, siempre como { numISO: {val, anio} }.
    _datosActivos() {
        if (this._indicador === 'depresion' && this._datosDep)
            return { datos: this._datosDep, unidad: '% de la población', fuente: 'OMS · Global Health Estimates' };
        if (this._indicador === 'suicidio' || !this._gbd) return { datos: this._datos, unidad: 'por 100 mil', fuente: 'OMS' };
        const ind = this._gbd.indicadores[this._indicador];
        if (!ind) return { datos: this._datos, unidad: 'por 100 mil', fuente: 'OMS' };
        const porNum = {};
        const anio = (this._gbd.meta && this._gbd.meta.anio) || '';
        for (const [iso3, val] of Object.entries(ind.datos || {})) {
            if (!this._iso[iso3] || !isFinite(+val)) continue;
            const a = (ind._anios && ind._anios[iso3]) ? ind._anios[iso3].anio : anio;
            porNum[this._iso[iso3].n] = { val: +val, anio: a, iso3 };
        }
        return { datos: porNum, unidad: ind.unidad || '', fuente: (this._gbd.meta && this._gbd.meta.fuente) || 'IHME GBD' };
    },
    // ---- Cargador GHO genérico: pide un endpoint OData de la OMS (fetch
    // directo → rescate por ProxiesCORS) y devuelve el JSON. Reutilizado por
    // suicidio, depresión y cualquier indicador OMS futuro. ----
    async _pedirGHO(url) {
        try { const r = await fetch(url); return await r.json(); }
        catch (e) {
            if (typeof ProxiesCORS !== 'undefined' && ProxiesCORS.carrera) {
                const { obras } = await ProxiesCORS.carrera(url,
                    t => { try { const d = JSON.parse(t); return d && d.value ? [d] : null; } catch (x) { return null; } },
                    { anchura: 3, timeout: 15000, oleadas: 2 });
                return obras[0];
            }
            throw e;
        }
    },
    // Reduce las filas OData de la OMS al AÑO MÁS RECIENTE por país.
    // La OMS publica varias EDICIONES de estimación para un mismo país-año
    // (verificado en la API: Perú 2021 aparece con 6 valores distintos):
    // se toma la MEDIANA de esas estimaciones — determinista y defendible,
    // en lugar de un valor al azar según el orden de las filas.
    _reducirGHO(filas) {
        const porPais = {};
        for (const f of (filas || [])) {
            const iso3 = f.SpatialDim, anio = +f.TimeDim, val = +f.NumericValue;
            if (!this._iso[iso3] || !isFinite(val)) continue;
            const p = porPais[iso3];
            if (!p || anio > p.anio) porPais[iso3] = { anio, vals: [val] };
            else if (anio === p.anio) p.vals.push(val);
        }
        const mediana = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
            return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
        const porNum = {};
        for (const [iso3, p] of Object.entries(porPais))
            porNum[this._iso[iso3].n] = { anio: p.anio, val: mediana(p.vals), n: p.vals.length, iso3 };
        return porNum;
    },
    // ---- Indicador OMS 2: prevalencia de depresión (% de la población).
    // El CÓDIGO del indicador se AUTO-DESCUBRE consultando el catálogo
    // oficial con su nombre exacto (verificado en who.int): así jamás se
    // hardcodea un código sin confirmar, y sobrevive a renombres de la OMS.
    DEPRESION_NOMBRE: 'Depression, population-based prevalence, estimate (%)',
    _datosDep: null,
    async _cargarDepresion() {
        const op = document.getElementById('panOpDepresion');
        try {
            const cat = await this._pedirGHO('https://ghoapi.azureedge.net/api/Indicator?$filter=' +
                encodeURIComponent(`contains(IndicatorName,'population-based prevalence')`) + '&$select=IndicatorCode,IndicatorName');
            const fila = (cat.value || []).find(x => x.IndicatorName === this.DEPRESION_NOMBRE)
                || (cat.value || []).find(x => /depress/i.test(x.IndicatorName || ''));
            if (!fila || !fila.IndicatorCode) throw new Error('indicador no hallado en el catálogo GHO');
            this._codigoDep = fila.IndicatorCode;
            const d = await this._pedirGHO(`https://ghoapi.azureedge.net/api/${fila.IndicatorCode}?$select=SpatialDim,TimeDim,NumericValue,Dim1`);
            // Sexo total si el indicador viene desagregado; si no trae Dim1, todo vale.
            const filas = (d.value || []).filter(f => !f.Dim1 || /BTSX/.test(String(f.Dim1)));
            const porNum = this._reducirGHO(filas.length ? filas : d.value);
            if (Object.keys(porNum).length < 20) throw new Error('datos insuficientes');
            this._datosDep = porNum;
        } catch (e) {
            // Degradación honesta: la opción se apaga con el motivo visible.
            if (op) { op.disabled = true; op.title = 'No disponible ahora: ' + (e.message || 'sin respuesta de la OMS'); }
        }
    },
    // ---- Indicador OMS: suicidio por 100 mil (edad estandarizada, BTSX) ----
    async _cargarSuicidio() {
        const url = 'https://ghoapi.azureedge.net/api/SDGSUICIDE?$filter=Dim1%20eq%20%27SEX_BTSX%27&$select=SpatialDim,TimeDim,NumericValue';
        const pedir = async () => {
            try { const r = await fetch(url); return await r.json(); }
            catch (e) {
                if (typeof ProxiesCORS !== 'undefined' && ProxiesCORS.carrera) {
                    const { obras } = await ProxiesCORS.carrera(url,
                        t => { try { const d = JSON.parse(t); return d && d.value ? [d] : null; } catch (x) { return null; } },
                        { anchura: 3, timeout: 15000, oleadas: 2 });
                    return obras[0];
                }
                throw e;
            }
        };
        const d = await pedir();
        this._datos = this._reducirGHO(d.value);
    },
    _render() {
        const cont = document.getElementById('panMapa');
        if (!cont || typeof d3 === 'undefined') return;
        const W = 940, H = 470;
        const proy = d3.geoNaturalEarth1().fitExtent([[4, 4], [W - 4, H - 4]], { type: 'Sphere' });
        const path = d3.geoPath(proy);
        const act = this._datosActivos();
        const datos = act.datos;
        const vals = Object.values(datos).map(x => x.val);
        const max = Math.max(...vals, 1);
        const color = d3.scaleLinear().domain([0, max * 0.45, max]).range(['#1e3a5f', '#e6b93f', '#e05d44']).clamp(true);
        const trazos = this._paises.map(f => {
            const num = String(f.id).padStart(3, '0');
            const info = this._num2info[num];
            const dato = datos[num];
            const nombre = info ? info.es : (f.properties.name || '');
            const fill = dato ? color(dato.val) : '#26314a';
            const titulo = dato ? `${nombre} — ${dato.val.toFixed(1)} ${act.unidad}${dato.anio ? ` (${dato.anio}` + ', ' + act.fuente + ')' : ''}` : `${nombre} — sin dato`;
            return `<path d="${path(f)}" data-num="${num}" fill="${fill}" stroke="#0b0f19" stroke-width="0.5" style="cursor:pointer;"><title>${titulo}</title></path>`;
        }).join('');
        cont.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px; display:block; margin:0 auto;" class="pan-svg" font-family="inherit">${trazos}</svg>`;
        document.getElementById('panLeyenda').innerHTML =
            `Escala: <span style="color:#6f8fc9;">0</span> → <span style="color:#e6b93f;">${(max * 0.45).toFixed(0)}</span> → <span style="color:#e05d44;">${max.toFixed(0)}</span> ${act.unidad} · fuente: ${act.fuente} · gris = sin dato · pasa el ratón para ver cada país`;
        if (!document.getElementById('panEstilos')) {
            const st = document.createElement('style');
            st.id = 'panEstilos';
            st.textContent = `.pan-svg path{transition:fill-opacity .12s;}.pan-svg path:hover{fill-opacity:.75;stroke:#e6b93f;stroke-width:1.2;}
            #panPanel .pan-chip{display:inline-block;margin:0.15rem;padding:0.3rem 0.75rem;border-radius:999px;border:1px solid var(--color-border,#2a3b52);background:transparent;color:inherit;cursor:pointer;font-size:0.85em;transition:background-color .12s,color .12s,border-color .12s;}
            #panPanel .pan-chip:hover{border-color:#e6b93f;color:#f3d787;}
            #panPanel .pan-chip.act{background:rgba(230,185,63,.14);border-color:#e6b93f;color:#f3d787;font-weight:600;}`;
            document.head.appendChild(st);
        }
    },
    _elegirPais(num) {
        const info = this._num2info[num];
        if (!info) return;
        this._sel = { num, pais: info.es, problema: null, poblacion: null };
        this._panel();
        const p = document.getElementById('panPanel');
        if (p && p.scrollIntoView) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    _panel() {
        const p = document.getElementById('panPanel');
        if (!p) return;
        const s = this._sel;
        const dato = this._datos[s.num];
        const esc = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
        const chips = (lista, cap, act) => lista.map(v =>
            `<button type="button" class="pan-chip${v === act ? ' act' : ''}" data-cap="${cap}" data-v="${esc(v)}">${esc(v)}</button>`).join('');
        const dep = this._datosDep && this._datosDep[s.num];
        let html = `<p style="margin:0 0 0.5rem;"><strong style="font-size:1.05em;">📍 ${esc(s.pais)}</strong>`
            + (dato ? ` <span class="help-text" style="display:inline;">· suicidio: ${dato.val.toFixed(1)} por 100 mil (${dato.anio}, OMS)</span>` : ' <span class="help-text" style="display:inline;">· sin dato del indicador</span>')
            + (dep ? ` <span class="help-text" style="display:inline;">· depresión: ${dep.val.toFixed(1)} % (${dep.anio}, OMS)</span>` : '') + '</p>'
            + `<p style="margin:0 0 0.25rem; font-size:0.88em;"><strong>🧠 Problema</strong></p><div>${chips(this.PROBLEMAS, 'problema', s.problema)}</div>`;
        if (s.problema) html += `<p style="margin:0.6rem 0 0.25rem; font-size:0.88em;"><strong>👥 Población</strong></p><div>${chips(this.POBLACIONES, 'poblacion', s.poblacion)}</div>`;
        if (s.problema && s.poblacion) html += `<div style="margin-top:0.8rem;"><button type="button" class="btn btn-primary" data-cap="ir" style="padding:0.45rem 1.1rem;">🔭 Explorar «${esc(s.problema)} en ${esc(s.poblacion)} · ${esc(s.pais)}»</button>
            <span class="help-text" style="display:inline; margin-left:0.5rem;">mide brechas noticias/academia de esta línea</span></div>`;
        p.innerHTML = html;
        p.style.display = '';
    },
    _explorar() {
        const s = this._sel;
        const caja = document.getElementById('expTema');
        if (!caja) return;
        caja.value = `${s.problema} ${s.poblacion} ${s.pais}`;
        if (caja.scrollIntoView) caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (document.getElementById('expBuscar') && typeof Explorar !== 'undefined') Explorar._onExplorar();
    }
};
if (typeof window !== 'undefined') {
    window.PanoramaMundial = PanoramaMundial;
    const ini = () => setTimeout(() => PanoramaMundial.montar(), 0);
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', ini);
    else ini();
}
