// ============================================================
// STATVIZ — Motor de visualización propio de StatSim Pro
// ------------------------------------------------------------
// Reemplazo directo y a medida de d3.v7.min.js: implementa
// exactamente el contrato que StatSim consume (censo empírico
// de graficas.js, explorar.js y panorama-mundial.js), en código
// legible y sin dependencias. Expone el mismo global «d3».
//   · Estadísticos: min, max, extent, sum, mean, median,
//     quantile, deviation, range
//   · Escalas: scaleLinear (nice/ticks/tickFormat), scaleBand,
//     scaleSequential + interpolateRdBu
//   · Ejes: axisBottom, axisLeft (compatibles con .call)
//   · Selecciones: select/selectAll/append/attr/style/text/
//     data/enter/exit/join/datum/remove/node/call
//   · Formas: line, area, curveBasis, curveLinearClosed
//   · histogram (bins con x0/x1, domain y thresholds)
//   · format ('d', '.Nf', ',', '.N%')
//   · hierarchy + pack (empaquetado de círculos front-chain)
//   · geoNaturalEarth1 (con fitExtent) + geoPath
// ============================================================
(function (global) {
    'use strict';
    const d3 = {};

    // ---------------- estadísticos ----------------
    const nums = a => Array.from(a, Number).filter(Number.isFinite);
    d3.min = (a, f) => { const v = f ? Array.from(a, f) : a; let m; for (const x of v) if (x != null && x >= x && (m === undefined || x < m)) m = x; return m; };
    d3.max = (a, f) => { const v = f ? Array.from(a, f) : a; let m; for (const x of v) if (x != null && x >= x && (m === undefined || x > m)) m = x; return m; };
    d3.extent = (a, f) => [d3.min(a, f), d3.max(a, f)];
    d3.sum = (a, f) => { let s = 0; let i = -1; for (const x of a) { const v = f ? +f(x, ++i, a) : +x; if (Number.isFinite(v)) s += v; } return s; };
    d3.mean = (a, f) => { const v = nums(f ? Array.from(a, f) : a); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : undefined; };
    d3.median = (a, f) => d3.quantile(f ? Array.from(a, f) : a, 0.5);
    d3.quantile = (a, p, f) => {
        const v = nums(f ? Array.from(a, f) : a).sort((x, y) => x - y);
        if (!v.length) return undefined;
        if (p <= 0 || v.length < 2) return v[0];
        if (p >= 1) return v[v.length - 1];
        const i = (v.length - 1) * p, lo = Math.floor(i);
        return v[lo] + (v[lo + 1] - v[lo]) * (i - lo);
    };
    d3.deviation = (a, f) => {
        const v = nums(f ? Array.from(a, f) : a);
        if (v.length < 2) return undefined;
        const m = v.reduce((s, x) => s + x, 0) / v.length;
        return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
    };
    d3.range = (a, b, paso) => {
        if (b === undefined) { b = a; a = 0; }
        paso = paso === undefined ? 1 : paso;
        const n = Math.max(0, Math.ceil((b - a) / paso)), out = new Array(n);
        for (let i = 0; i < n; i++) out[i] = a + i * paso;
        return out;
    };

    // ---------------- ticks "bonitos" ----------------
    function pasoTick(a, b, n) {
        const bruto = (b - a) / Math.max(1, n);
        const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
        const err = bruto / pot;
        return pot * (err >= Math.sqrt(50) ? 10 : err >= Math.sqrt(10) ? 5 : err >= Math.SQRT2 ? 2 : 1);
    }
    function generarTicks(a, b, n) {
        if (a === b) return [a];
        const inv = b < a; if (inv) [a, b] = [b, a];
        const paso = pasoTick(a, b, n);
        const i0 = Math.ceil(a / paso), i1 = Math.floor(b / paso), out = [];
        for (let i = i0; i <= i1; i++) out.push(+(i * paso).toPrecision(12));
        return inv ? out.reverse() : out;
    }

    // ---------------- format ----------------
    d3.format = (espec) => {
        const m = /^(,)?(\.(\d+))?([df%])?$/.exec(espec || '');
        const coma = m && m[1], dec = m && m[3] !== undefined ? +m[3] : null, tipo = (m && m[4]) || '';
        return function (x) {
            x = +x;
            if (!Number.isFinite(x)) return String(x);
            let s;
            if (tipo === 'd') s = String(Math.round(x));
            else if (tipo === '%') s = (100 * x).toFixed(dec == null ? 0 : dec) + '%';
            else s = dec == null ? String(x) : x.toFixed(dec);
            if (coma) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            return s;
        };
    };

    // ---------------- escalas ----------------
    d3.scaleLinear = function () {
        let dominio = [0, 1], rango = [0, 1], sujetar = false;
        function escala(x) {
            const [d0, d1] = dominio, [r0, r1] = rango;
            let t = d1 === d0 ? 0.5 : (x - d0) / (d1 - d0);
            if (sujetar) t = Math.max(0, Math.min(1, t));
            return r0 + t * (r1 - r0);
        }
        escala.domain = d => d === undefined ? dominio.slice() : (dominio = Array.from(d, Number), escala);
        escala.range = r => r === undefined ? rango.slice() : (rango = Array.from(r), escala);
        escala.clamp = c => c === undefined ? sujetar : (sujetar = !!c, escala);
        escala.nice = n => {
            const [a, b] = dominio, paso = pasoTick(Math.min(a, b), Math.max(a, b), n || 10);
            dominio = a <= b
                ? [Math.floor(a / paso) * paso, Math.ceil(b / paso) * paso]
                : [Math.ceil(a / paso) * paso, Math.floor(b / paso) * paso];
            return escala;
        };
        escala.ticks = n => generarTicks(dominio[0], dominio[1], n || 10);
        escala.tickFormat = (n, e) => d3.format(e || (Number.isInteger(pasoTick(Math.min(...dominio), Math.max(...dominio), n || 10)) ? 'd' : '.1f'));
        escala.invert = y => {
            const [d0, d1] = dominio, [r0, r1] = rango;
            const t = r1 === r0 ? 0.5 : (y - r0) / (r1 - r0);
            return d0 + t * (d1 - d0);
        };
        escala.copy = () => d3.scaleLinear().domain(dominio).range(rango).clamp(sujetar);
        return escala;
    };

    d3.scaleBand = function () {
        let dominio = [], rango = [0, 1], pi = 0, po = 0, ancho = 0, paso = 0;
        function recalcular() {
            const n = dominio.length, [r0, r1] = rango, ext = r1 - r0;
            paso = n ? ext / Math.max(1, n - pi + 2 * po) : 0;
            ancho = paso * (1 - pi);
        }
        function escala(v) {
            const i = dominio.indexOf(v);
            if (i < 0) return undefined;
            return rango[0] + paso * po + i * paso;
        }
        escala.domain = d => d === undefined ? dominio.slice() : (dominio = Array.from(d), recalcular(), escala);
        escala.range = r => r === undefined ? rango.slice() : (rango = Array.from(r, Number), recalcular(), escala);
        escala.padding = p => p === undefined ? pi : (pi = po = Math.min(1, +p), recalcular(), escala);
        escala.paddingInner = p => p === undefined ? pi : (pi = Math.min(1, +p), recalcular(), escala);
        escala.paddingOuter = p => p === undefined ? po : (po = +p, recalcular(), escala);
        escala.bandwidth = () => ancho;
        escala.step = () => paso;
        escala.ticks = () => dominio.slice();
        return escala;
    };

    // RdBu (ColorBrewer, 11 paradas) con interpolación lineal RGB
    const PARADAS_RDBU = ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7',
        '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061']
        .map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
    d3.interpolateRdBu = function (t) {
        t = Math.max(0, Math.min(1, t));
        const x = t * (PARADAS_RDBU.length - 1), i = Math.min(PARADAS_RDBU.length - 2, Math.floor(x)), u = x - i;
        const c = PARADAS_RDBU[i].map((a, k) => Math.round(a + (PARADAS_RDBU[i + 1][k] - a) * u));
        return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    };
    d3.scaleSequential = function (interp) {
        let dominio = [0, 1], f = interp || (t => t);
        function escala(x) {
            const [a, b] = dominio;
            return f(b === a ? 0.5 : (x - a) / (b - a));
        }
        escala.domain = d => d === undefined ? dominio.slice() : (dominio = Array.from(d, Number), escala);
        escala.interpolator = g => g === undefined ? f : (f = g, escala);
        return escala;
    };

    // ---------------- histogram ----------------
    d3.histogram = d3.bin = function () {
        let valor = x => x, dominio = null, umbrales = null;
        function bins(datos) {
            const vals = Array.from(datos, valor).map(Number);
            const finitos = vals.filter(Number.isFinite);
            let [a, b] = dominio ? dominio : d3.extent(finitos);
            if (a === undefined) return [];
            let cortes;
            if (Array.isArray(umbrales)) cortes = umbrales.slice();
            else {
                const n = umbrales != null ? +umbrales
                    : Math.max(1, Math.ceil(Math.log2(finitos.length) + 1)); // Sturges
                cortes = generarTicks(a, b, n).filter(c => c > a && c < b);
            }
            const bordes = [a, ...cortes, b];
            const out = [];
            for (let i = 0; i < bordes.length - 1; i++) {
                const bin = [];
                bin.x0 = bordes[i]; bin.x1 = bordes[i + 1];
                out.push(bin);
            }
            let idx = -1;
            for (const dOriginal of datos) {
                const v = +valor(dOriginal, ++idx, datos);
                if (!Number.isFinite(v) || v < a || v > b) continue;
                let i = out.length - 1;
                while (i > 0 && v < out[i].x0) i--;
                out[i].push(dOriginal);
            }
            return out;
        }
        bins.value = f => f === undefined ? valor : (valor = typeof f === 'function' ? f : () => f, bins);
        bins.domain = d => d === undefined ? dominio : (dominio = Array.from(d, Number), bins);
        bins.thresholds = u => u === undefined ? umbrales : (umbrales = u, bins);
        return bins;
    };

    // ---------------- selecciones ----------------
    const NS = { svg: 'http://www.w3.org/2000/svg' };
    function crearNodo(nombre, padre) {
        const doc = (padre && padre.ownerDocument) || global.document;
        const esSVG = nombre !== 'div' && nombre !== 'span' && nombre !== 'canvas' &&
            (padre && (padre.namespaceURI === NS.svg || nombre === 'svg') || nombre === 'svg' ||
                ['g', 'rect', 'circle', 'line', 'path', 'text', 'polygon', 'polyline', 'ellipse', 'defs', 'clipPath', 'tspan', 'title'].includes(nombre));
        return esSVG ? doc.createElementNS(NS.svg, nombre) : doc.createElement(nombre);
    }
    class Seleccion {
        constructor(nodos, padres) { this._n = nodos; this._p = padres || nodos.map(n => n && n.parentNode); }
        _cada(fn) { this._n.forEach((n, i) => { if (n) fn(n, n.__data__, i); }); return this; }
        select(sel) {
            if (typeof sel === 'function') return new Seleccion(this._n.map((n, i) => n ? sel.call(n, n.__data__, i) : null));
            return new Seleccion(this._n.map(n => n ? n.querySelector(sel) : null));
        }
        selectAll(sel) {
            const nodos = [], padres = [];
            this._n.forEach(n => {
                if (!n) return;
                const hijos = typeof sel === 'function' ? sel.call(n, n.__data__) : n.querySelectorAll(sel);
                for (const h of hijos) { nodos.push(h); padres.push(n); }
                if (!hijos.length) padres.push(n); // conserva el padre para data() sobre vacío
            });
            const s = new Seleccion(nodos, padres.length ? padres : this._n.slice());
            s._selector = typeof sel === 'string' ? sel : null;
            s._padresData = this._n.slice();
            return s;
        }
        append(nombre) {
            const nuevos = this._n.map(n => {
                if (!n) return null;
                const hijo = typeof nombre === 'function' ? nombre.call(n, n.__data__) : crearNodo(nombre, n);
                if (n.__data__ !== undefined && hijo.__data__ === undefined) hijo.__data__ = n.__data__;
                n.appendChild(hijo);
                return hijo;
            });
            return new Seleccion(nuevos, this._n);
        }
        attr(nombre, valor) {
            if (valor === undefined) { const n = this.node(); return n ? n.getAttribute(nombre) : null; }
            return this._cada((n, d, i) => {
                const v = typeof valor === 'function' ? valor.call(n, d, i) : valor;
                if (v == null) n.removeAttribute(nombre); else n.setAttribute(nombre, v);
            });
        }
        style(nombre, valor) {
            return this._cada((n, d, i) => {
                const v = typeof valor === 'function' ? valor.call(n, d, i) : valor;
                n.style && n.style.setProperty(nombre, v);
            });
        }
        classed(nombre, activo) {
            return this._cada(n => {
                nombre.trim().split(/\s+/).forEach(c => {
                    if (activo) n.classList.add(c); else n.classList.remove(c);
                });
            });
        }
        text(valor) {
            if (valor === undefined) { const n = this.node(); return n ? n.textContent : null; }
            return this._cada((n, d, i) => { n.textContent = typeof valor === 'function' ? valor.call(n, d, i) : valor; });
        }
        html(valor) {
            if (valor === undefined) { const n = this.node(); return n ? n.innerHTML : null; }
            return this._cada((n, d, i) => { n.innerHTML = typeof valor === 'function' ? valor.call(n, d, i) : valor; });
        }
        datum(d) { return this._cada(n => { n.__data__ = d; }); }
        data(datos, clave) {
            const arr = typeof datos === 'function' ? datos : Array.from(datos);
            const padres = this._padresData || this._p || [null];
            // Modelo simple (suficiente para StatSim): un grupo de datos por selección.
            const existentes = this._n.filter(Boolean);
            const actualizados = [], entrantes = [], salientes = [];
            const N = arr.length;
            for (let i = 0; i < N; i++) {
                if (i < existentes.length) { existentes[i].__data__ = arr[i]; actualizados.push(existentes[i]); }
                else entrantes.push({ __datoPendiente: arr[i], __padre: padres[0] || (existentes[0] && existentes[0].parentNode) });
            }
            for (let i = N; i < existentes.length; i++) salientes.push(existentes[i]);
            const s = new Seleccion(actualizados, this._p);
            s._enter = entrantes; s._exit = salientes; s._selector = this._selector; s._padreEnter = padres[0];
            return s;
        }
        enter() {
            const marcadores = (this._enter || []).map(e => e);
            const s = new Seleccion([], []);
            s._marcadores = marcadores;
            s.append = (nombre) => {
                const nuevos = marcadores.map(m => {
                    const padre = m.__padre;
                    if (!padre) return null;
                    const hijo = typeof nombre === 'function' ? nombre.call(padre, m.__datoPendiente) : crearNodo(nombre, padre);
                    hijo.__data__ = m.__datoPendiente;
                    padre.appendChild(hijo);
                    return hijo;
                });
                return new Seleccion(nuevos);
            };
            return s;
        }
        exit() { return new Seleccion(this._exit || []); }
        join(nombre) {
            (this._exit || []).forEach(n => n.parentNode && n.parentNode.removeChild(n));
            const entrados = this.enter().append(nombre);
            return new Seleccion(this._n.filter(Boolean).concat(entrados._n.filter(Boolean)));
        }
        merge(otra) { return new Seleccion(this._n.filter(Boolean).concat(otra._n.filter(Boolean))); }
        remove() { return this._cada(n => { if (n.parentNode) n.parentNode.removeChild(n); }); }
        call(fn, ...args) { fn(this, ...args); return this; }
        each(fn) { return this._cada((n, d, i) => fn.call(n, d, i)); }
        on(tipo, fn) { return this._cada(n => n.addEventListener && n.addEventListener(tipo, function (ev) { fn.call(n, ev, n.__data__); })); }
        node() { return this._n.find(Boolean) || null; }
        nodes() { return this._n.filter(Boolean); }
        empty() { return !this.node(); }
        size() { return this._n.filter(Boolean).length; }
    }
    d3.select = (sel) => new Seleccion([typeof sel === 'string' ? global.document.querySelector(sel) : sel]);
    d3.selectAll = (sel) => new Seleccion(typeof sel === 'string' ? Array.from(global.document.querySelectorAll(sel)) : Array.from(sel));

    // ---------------- ejes ----------------
    function crearEje(orientacion) {
        return function (escala) {
            let tamTick = 6, sep = 3, nTicks = null, formato = null, valoresTicks = null;
            function eje(seleccion) {
                seleccion._cada(g => {
                    while (g.firstChild) g.removeChild(g.firstChild);
                    const ticks = valoresTicks || (escala.ticks ? escala.ticks(nTicks || 10) : escala.domain());
                    const fmt = formato || (escala.tickFormat ? escala.tickFormat(nTicks || 10) : (x => x));
                    const rango = escala.range();
                    const r0 = rango[0], r1 = rango[rango.length - 1];
                    const desplaz = escala.bandwidth ? escala.bandwidth() / 2 : 0;
                    const doc = g.ownerDocument;
                    const linea = doc.createElementNS(NS.svg, 'path');
                    linea.setAttribute('class', 'domain');
                    linea.setAttribute('stroke', '#64748b');
                    linea.setAttribute('fill', 'none');
                    linea.setAttribute('d', orientacion === 'bottom'
                        ? `M${r0},${tamTick}V0H${r1}V${tamTick}`
                        : `M${-tamTick},${r0}H0V${r1}H${-tamTick}`);
                    g.appendChild(linea);
                    ticks.forEach(t => {
                        const pos = escala(t);
                        if (pos === undefined || !Number.isFinite(pos)) return;
                        const gt = doc.createElementNS(NS.svg, 'g');
                        gt.setAttribute('class', 'tick');
                        gt.setAttribute('transform', orientacion === 'bottom'
                            ? `translate(${pos + desplaz},0)` : `translate(0,${pos + desplaz})`);
                        const l = doc.createElementNS(NS.svg, 'line');
                        l.setAttribute('stroke', '#64748b');
                        if (orientacion === 'bottom') l.setAttribute('y2', tamTick); else l.setAttribute('x2', -tamTick);
                        const tx = doc.createElementNS(NS.svg, 'text');
                        tx.setAttribute('fill', '#cbd5e1');
                        tx.setAttribute('font-size', '11');
                        if (orientacion === 'bottom') {
                            tx.setAttribute('y', tamTick + sep); tx.setAttribute('dy', '0.71em');
                            tx.setAttribute('text-anchor', 'middle');
                        } else {
                            tx.setAttribute('x', -(tamTick + sep)); tx.setAttribute('dy', '0.32em');
                            tx.setAttribute('text-anchor', 'end');
                        }
                        tx.textContent = fmt(t);
                        gt.appendChild(l); gt.appendChild(tx); g.appendChild(gt);
                    });
                });
            }
            eje.ticks = n => (nTicks = n, eje);
            eje.tickValues = v => (valoresTicks = v, eje);
            eje.tickFormat = f => (formato = f, eje);
            eje.tickSize = t => (tamTick = +t, eje);
            eje.tickPadding = p => (sep = +p, eje);
            eje.scale = s => s === undefined ? escala : (escala = s, eje);
            return eje;
        };
    }
    d3.axisBottom = crearEje('bottom');
    d3.axisLeft = crearEje('left');

    // ---------------- formas (line / area / curvas) ----------------
    d3.curveLinear = { tipo: 'linear' };
    d3.curveLinearClosed = { tipo: 'linear', cerrada: true };
    d3.curveBasis = { tipo: 'basis' };
    function trazar(puntos, curva) {
        if (!puntos.length) return '';
        const f = v => +v.toFixed(2);
        if (!curva || curva.tipo === 'linear') {
            let d = `M${f(puntos[0][0])},${f(puntos[0][1])}`;
            for (let i = 1; i < puntos.length; i++) d += `L${f(puntos[i][0])},${f(puntos[i][1])}`;
            if (curva && curva.cerrada) d += 'Z';
            return d;
        }
        // B-spline uniforme (curveBasis): tramos Bézier con la matriz basis
        const p = puntos;
        if (p.length < 3) return trazar(p, null);
        let d = `M${f((p[0][0] + (p.length > 1 ? p[1][0] : p[0][0]) * 4 + (p[2] ? p[2][0] : p[1][0])) / 6)},${f((p[0][1] + p[1][1] * 4 + (p[2] ? p[2][1] : p[1][1])) / 6)}`;
        d = `M${f(p[0][0])},${f(p[0][1])}L${f((5 * p[0][0] + p[1][0]) / 6)},${f((5 * p[0][1] + p[1][1]) / 6)}`;
        for (let i = 1; i < p.length - 1; i++) {
            const p0 = p[i - 1], p1 = p[i], p2 = p[i + 1];
            d += `C${f((2 * p0[0] + p1[0]) / 3)},${f((2 * p0[1] + p1[1]) / 3)},${f((p0[0] + 2 * p1[0]) / 3)},${f((p0[1] + 2 * p1[1]) / 3)},${f((p0[0] + 4 * p1[0] + p2[0]) / 6)},${f((p0[1] + 4 * p1[1] + p2[1]) / 6)}`;
        }
        const a = p[p.length - 2], b = p[p.length - 1];
        d += `C${f((2 * a[0] + b[0]) / 3)},${f((2 * a[1] + b[1]) / 3)},${f((a[0] + 5 * b[0]) / 6)},${f((a[1] + 5 * b[1]) / 6)},${f(b[0])},${f(b[1])}`;
        return d;
    }
    d3.line = function () {
        let X = d => d[0], Y = d => d[1], curva = null, definido = () => true;
        function linea(datos) {
            const pts = [];
            let i = -1;
            for (const dd of datos) { ++i; if (definido(dd, i, datos)) pts.push([+X(dd, i, datos), +Y(dd, i, datos)]); }
            return trazar(pts, curva);
        }
        linea.x = f => (X = typeof f === 'function' ? f : () => +f, linea);
        linea.y = f => (Y = typeof f === 'function' ? f : () => +f, linea);
        linea.curve = c => (curva = c, linea);
        linea.defined = f => (definido = f, linea);
        return linea;
    };
    d3.area = function () {
        // Semántica d3: .x(f) fija x0 y anula x1; .y(f) fija y0 y anula y1.
        // Borde principal = (x1 ?? x0, y1 ?? y0); base = (x0, y0).
        let X0 = d => d[0], X1 = null, Y0 = () => 0, Y1 = null, curva = null, definido = () => true;
        function area(datos) {
            const arriba = [], abajo = [];
            let i = -1;
            for (const dd of datos) {
                ++i;
                if (!definido(dd, i, datos)) continue;
                const x0 = +X0(dd, i, datos), y0 = +Y0(dd, i, datos);
                const x1 = X1 ? +X1(dd, i, datos) : x0;
                const y1 = Y1 ? +Y1(dd, i, datos) : y0;
                arriba.push([x1, y1]);
                abajo.push([x0, y0]);
            }
            if (!arriba.length) return '';
            const dSup = trazar(arriba, curva);
            const dInf = trazar(abajo.reverse(), curva).replace(/^M/, 'L');
            return dSup + dInf + 'Z';
        }
        area.x = f => (X0 = typeof f === 'function' ? f : () => +f, X1 = null, area);
        area.x0 = f => (X0 = typeof f === 'function' ? f : () => +f, area);
        area.x1 = f => (X1 = f == null ? null : (typeof f === 'function' ? f : () => +f), area);
        area.y = f => (Y0 = typeof f === 'function' ? f : () => +f, Y1 = null, area);
        area.y0 = f => (Y0 = typeof f === 'function' ? f : () => +f, area);
        area.y1 = f => (Y1 = f == null ? null : (typeof f === 'function' ? f : () => +f), area);
        area.curve = c => (curva = c, area);
        area.defined = f => (definido = f, area);
        return area;
    };

    // ---------------- hierarchy + pack (círculos) ----------------
    class Nodo {
        constructor(dato) { this.data = dato; this.children = null; this.value = 0; this.depth = 0; }
        sum(f) {
            const visitar = n => {
                let s = +f(n.data) || 0;
                if (n.children) for (const c of n.children) s += visitar(c);
                n.value = s;
                return s;
            };
            visitar(this);
            return this;
        }
        sort(cmp) {
            const visitar = n => { if (n.children) { n.children.sort((a, b) => cmp(a, b)); n.children.forEach(visitar); } };
            visitar(this);
            return this;
        }
        descendants() {
            const out = [];
            const visitar = n => { out.push(n); if (n.children) n.children.forEach(visitar); };
            visitar(this);
            return out;
        }
        leaves() { return this.descendants().filter(n => !n.children); }
        each(f) { this.descendants().forEach(f); return this; }
    }
    d3.hierarchy = function (dato, hijos) {
        hijos = hijos || (d => d.children);
        function construir(d, prof) {
            const n = new Nodo(d);
            n.depth = prof;
            const h = hijos(d);
            if (h && h.length) n.children = Array.from(h, c => { const cn = construir(c, prof + 1); cn.parent = n; return cn; });
            return n;
        }
        return construir(dato, 0);
    };
    // Empaquetado greedy de círculos hermanos: cada círculo (de mayor a menor)
    // se coloca en el punto más cercano al centro que no colisione, explorando
    // una espiral de candidatos. Terminación garantizada y sin solapamientos
    // por construcción.
    function empaquetarHermanos(circulos) {
        if (!circulos.length) return;
        const colocados = [];
        const libre = (x, y, r) => colocados.every(c => {
            const dx = c.x - x, dy = c.y - y;
            return dx * dx + dy * dy >= (c.r + r) * (c.r + r) - 1e-9;
        });
        for (const c of circulos) {
            if (!colocados.length) { c.x = 0; c.y = 0; colocados.push(c); continue; }
            let mejor = null, mejorDist = Infinity;
            // candidatos: tangentes alrededor de cada círculo ya colocado
            for (const base of colocados) {
                const R = base.r + c.r;
                for (let a = 0; a < 24; a++) {
                    const ang = (a / 24) * 2 * Math.PI;
                    const x = base.x + R * Math.cos(ang), y = base.y + R * Math.sin(ang);
                    if (!libre(x, y, c.r)) continue;
                    const d = Math.hypot(x, y);
                    if (d < mejorDist) { mejorDist = d; mejor = [x, y]; }
                }
            }
            if (!mejor) {
                // respaldo: espiral desde el centro hasta hallar hueco (siempre termina)
                let radio = c.r, ang = 0;
                for (let paso = 0; paso < 5000; paso++) {
                    const x = radio * Math.cos(ang), y = radio * Math.sin(ang);
                    if (libre(x, y, c.r)) { mejor = [x, y]; break; }
                    ang += 0.5; radio += c.r * 0.05;
                }
                if (!mejor) mejor = [radio, 0];
            }
            c.x = mejor[0]; c.y = mejor[1];
            colocados.push(c);
        }
    }
    function circuloEnvolvente(circulos) {
        // aproximación iterativa robusta del círculo mínimo envolvente
        let cx = 0, cy = 0, peso = 0;
        for (const c of circulos) { cx += c.x * c.r; cy += c.y * c.r; peso += c.r; }
        cx /= peso || 1; cy /= peso || 1;
        let R = 0;
        for (let it = 0; it < 120; it++) {
            let lejano = null, dmax = -Infinity;
            for (const c of circulos) {
                const d = Math.hypot(c.x - cx, c.y - cy) + c.r;
                if (d > dmax) { dmax = d; lejano = c; }
            }
            R = dmax;
            const dl = Math.hypot(lejano.x - cx, lejano.y - cy) || 1;
            cx += (lejano.x - cx) / dl * dmax * 0.01;
            cy += (lejano.y - cy) / dl * dmax * 0.01;
        }
        return { x: cx, y: cy, r: R };
    }
    d3.pack = function () {
        let tam = [1, 1], relleno = 0;
        function pack(raiz) {
            const hojas = raiz.children ? raiz.children : [raiz];
            const circulos = hojas.map(n => ({ nodo: n, r: Math.sqrt(Math.max(n.value, 0)) + 0, x: 0, y: 0 }));
            circulos.forEach(c => { c.r += relleno / 2; });
            circulos.sort((a, b) => b.r - a.r);
            empaquetarHermanos(circulos);
            circulos.forEach(c => { c.r -= relleno / 2; });
            const env = circuloEnvolvente(circulos.map(c => ({ x: c.x, y: c.y, r: c.r + relleno / 2 })));
            const escalaR = Math.min(tam[0], tam[1]) / (2 * env.r || 1);
            raiz.x = tam[0] / 2; raiz.y = tam[1] / 2; raiz.r = Math.min(tam[0], tam[1]) / 2;
            circulos.forEach(c => {
                c.nodo.x = tam[0] / 2 + (c.x - env.x) * escalaR;
                c.nodo.y = tam[1] / 2 + (c.y - env.y) * escalaR;
                c.nodo.r = Math.max(0.5, c.r * escalaR);
            });
            return raiz;
        }
        pack.size = s => s === undefined ? tam.slice() : (tam = [+s[0], +s[1]], pack);
        pack.padding = p => p === undefined ? relleno : (relleno = +p, pack);
        return pack;
    };

    // ---------------- geografía: Natural Earth + geoPath ----------------
    function proyectarNE1(lambda, phi) {
        // Šavrič, Jenny & Patterson (2011) — coeficientes polinómicos públicos
        const p2 = phi * phi, p4 = p2 * p2;
        return [
            lambda * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
            phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))
        ];
    }
    d3.geoNaturalEarth1 = function () {
        let k = 1, tx = 0, ty = 0;
        function proy(coords) {
            const l = coords[0] * Math.PI / 180, p = coords[1] * Math.PI / 180;
            const [x, y] = proyectarNE1(l, p);
            return [x * k + tx, -y * k + ty];
        }
        function bboxEsfera() {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (let lon = -180; lon <= 180; lon += 2) {
                for (const lat of [-90, 90]) {
                    const [x, y] = proyectarNE1(lon * Math.PI / 180, lat * Math.PI / 180);
                    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
                    y0 = Math.min(y0, -y); y1 = Math.max(y1, -y);
                }
            }
            for (let lat = -90; lat <= 90; lat += 2) {
                for (const lon of [-180, 180]) {
                    const [x, y] = proyectarNE1(lon * Math.PI / 180, lat * Math.PI / 180);
                    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
                    y0 = Math.min(y0, -y); y1 = Math.max(y1, -y);
                }
            }
            return [x0, y0, x1, y1];
        }
        proy.fitExtent = function (extent, objeto) {
            const [[ex0, ey0], [ex1, ey1]] = extent;
            const [bx0, by0, bx1, by1] = bboxEsfera();
            const kx = (ex1 - ex0) / (bx1 - bx0), ky = (ey1 - ey0) / (by1 - by0);
            k = Math.min(kx, ky);
            tx = ex0 + ((ex1 - ex0) - (bx1 - bx0) * k) / 2 - bx0 * k;
            ty = ey0 + ((ey1 - ey0) - (by1 - by0) * k) / 2 - by0 * k;
            return proy;
        };
        proy.scale = s => s === undefined ? k : (k = +s, proy);
        proy.translate = t => t === undefined ? [tx, ty] : (tx = +t[0], ty = +t[1], proy);
        return proy;
    };
    d3.geoPath = function (proyeccion) {
        let proy = proyeccion || (c => c);
        function anillo(coords) {
            let d = '';
            coords.forEach((c, i) => {
                const [x, y] = proy(c);
                d += (i ? 'L' : 'M') + x.toFixed(2) + ',' + y.toFixed(2);
            });
            return d + 'Z';
        }
        function path(objeto) {
            if (!objeto) return '';
            const g = objeto.type === 'Feature' ? objeto.geometry : objeto;
            if (!g) return '';
            if (g.type === 'Polygon') return g.coordinates.map(anillo).join('');
            if (g.type === 'MultiPolygon') return g.coordinates.map(p => p.map(anillo).join('')).join('');
            if (g.type === 'LineString') return anillo(g.coordinates).replace(/Z$/, '');
            if (g.type === 'MultiLineString') return g.coordinates.map(c => anillo(c).replace(/Z$/, '')).join('');
            if (g.type === 'Sphere') {
                const contorno = [];
                for (let lon = -180; lon <= 180; lon += 3) contorno.push([lon, 90]);
                for (let lat = 90; lat >= -90; lat -= 3) contorno.push([180, lat]);
                for (let lon = 180; lon >= -180; lon -= 3) contorno.push([lon, -90]);
                for (let lat = -90; lat <= 90; lat += 3) contorno.push([-180, lat]);
                return anillo(contorno);
            }
            return '';
        }
        path.projection = p => p === undefined ? proy : (proy = p, path);
        return path;
    };

    d3.version = 'statviz-1.0 (motor propio de StatSim)';
    global.d3 = d3;
})(typeof window !== 'undefined' ? window : globalThis);
