// ========================================
// CRIBA VECTORIZADA DE CORRELACIONES
// Evalúa MUCHOS pares candidatos a bajo costo para seleccionar los objetivos
// específicos EN FUNCIÓN DE LOS DATOS, y deja el reporte fino de los elegidos
// al motor estadístico validado (cero duplicación de matemática reportada).
//
// Eficiencia (n = casos, c = columnas distintas, m = pares):
//   · Extracción de columnas a Float64Array (memoria contigua): O(n·c), UNA vez
//   · Normalidad: UNA por columna (caché), no por par → 2m pruebas pasan a ser c
//   · Rangos de Spearman: UNA por columna (caché), O(n log n)
//   · Coeficiente por par: UNA pasada fusionada de 5 acumuladores, O(n), sin
//     arreglos intermedios
//   · Selección top-k: una pasada con inserción acotada (k constante), O(m)
// Total: O(c·n log n + m·n), frente al ingenuo O(m·(n log n + normalidades)).
// ========================================

const CribaCorrelaciones = {

    // CONFIGURACIÓN (hardcodeada y conmutable al instante):
    // Umbral mínimo de |r| para que un par sea candidato a objetivo específico.
    // Cohen (1988): |r| ≥ .10 efecto pequeño (mínimo reportable), .30 mediano, .50 grande.
    UMBRAL_ABS: 0.10,
    // Máximo de objetivos específicos correlacionales a seleccionar.
    MAX_OBJETIVOS: 2,

    // datos: arreglo de filas {col: valor}; pares: [{columnaX, columnaY, ...meta}];
    // analizador: instancia con evaluarNormalidad(valores).
    // Devuelve { evaluados (orden |r| desc), seleccionados (≤ MAX), umbral, maximo }.
    cribar(datos, pares, analizador) {
        const n = (datos || []).length;
        const cacheCol = new Map();    // col -> Float64Array | null (no-finitos)
        const cacheNorm = new Map();   // col -> boolean
        const cacheRangos = new Map(); // col -> Float64Array (rango medio en empates)

        // Columna como memoria contigua; null si tiene valores no numéricos.
        const columna = (col) => {
            if (cacheCol.has(col)) return cacheCol.get(col);
            const v = new Float64Array(n);
            let ok = n >= 3;
            for (let i = 0; i < n && ok; i++) {
                const x = +datos[i][col];
                if (Number.isFinite(x)) v[i] = x; else ok = false;
            }
            const res = ok ? v : null;
            cacheCol.set(col, res);
            return res;
        };

        // Normalidad evaluada UNA sola vez por columna.
        const esNormal = (col) => {
            if (cacheNorm.has(col)) return cacheNorm.get(col);
            const v = columna(col);
            let r = false;
            if (v) {
                try { r = !!analizador.evaluarNormalidad(Array.from(v)).normal; }
                catch (e) { r = false; }
            }
            cacheNorm.set(col, r);
            return r;
        };

        // Rangos (para Spearman = Pearson sobre rangos, con rango medio en empates).
        const rangos = (col) => {
            if (cacheRangos.has(col)) return cacheRangos.get(col);
            const v = columna(col);
            const idx = new Uint32Array(n);
            for (let i = 0; i < n; i++) idx[i] = i;
            // Orden de índices por valor (TypedArray: sin objetos intermedios)
            Array.prototype.sort.call(idx, (a, b) => v[a] - v[b]);
            const rg = new Float64Array(n);
            let i = 0;
            while (i < n) {
                let j = i;
                while (j + 1 < n && v[idx[j + 1]] === v[idx[i]]) j++;
                const rangoMedio = (i + j) / 2 + 1;
                for (let k = i; k <= j; k++) rg[idx[k]] = rangoMedio;
                i = j + 1;
            }
            cacheRangos.set(col, rg);
            return rg;
        };

        // Pearson en UNA pasada fusionada (5 acumuladores, cero arreglos extra).
        const pearson = (x, y) => {
            let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
            for (let i = 0; i < n; i++) {
                const a = x[i], b = y[i];
                sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b;
            }
            const num = n * sxy - sx * sy;
            const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
            return den === 0 ? 0 : num / den;
        };

        // Evaluar todos los pares candidatos
        const evaluados = (pares || []).map(par => {
            const x = columna(par.columnaX), y = columna(par.columnaY);
            if (!x || !y) {
                return Object.assign({}, par, { valido: false, coeficiente: NaN, metodo: null, superaUmbral: false });
            }
            const usarPearson = esNormal(par.columnaX) && esNormal(par.columnaY);
            const coef = usarPearson
                ? pearson(x, y)
                : pearson(rangos(par.columnaX), rangos(par.columnaY));
            return Object.assign({}, par, {
                valido: true,
                metodo: usarPearson ? 'Pearson' : 'Spearman',
                coeficiente: coef,
                superaUmbral: Math.abs(coef) >= this.UMBRAL_ABS
            });
        });

        // Top-k por |r| en UNA pasada (inserción en lista acotada de tamaño k)
        const k = this.MAX_OBJETIVOS;
        const seleccionados = [];
        for (const e of evaluados) {
            if (!e.valido || !e.superaUmbral) continue;
            let pos = seleccionados.length;
            while (pos > 0 && Math.abs(seleccionados[pos - 1].coeficiente) < Math.abs(e.coeficiente)) pos--;
            if (pos < k) {
                seleccionados.splice(pos, 0, e);
                if (seleccionados.length > k) seleccionados.pop();
            }
        }
        seleccionados.forEach(s => { s.seleccionado = true; });

        // Orden descendente por |r| solo para PRESENTAR la criba (m es pequeño)
        evaluados.sort((a, b) => (Math.abs(b.coeficiente) || 0) - (Math.abs(a.coeficiente) || 0));

        return { evaluados, seleccionados, umbral: this.UMBRAL_ABS, maximo: k, n };
    }
};

if (typeof window !== 'undefined') {
    window.CribaCorrelaciones = CribaCorrelaciones;
}
