// ========================================
// ANÁLISIS MULTIVARIADO — StatSim Pro
// (1) Matriz de correlaciones para 2+ variables (Pearson/Spearman por par
//     según normalidad, con p y corrección de Holm).
// (2) Regresión lineal múltiple OLS: B, SE, β, t, p, IC 95%, R², R² ajustado,
//     F del modelo, VIF por predictor y normalidad de los residuos.
// (3) "De la correlación al control estadístico": efecto crudo vs ajustado del
//     predictor focal, con lectura causal honesta (datos transversales).
// Reutiliza las distribuciones verificadas de ComparacionGrupos (_pT, _pF).
// ========================================

const RegresionMultiple = {

    _ultimaRegresion: null,
    _ultimaMatriz: null,

    // ---------- Utilidades numéricas ----------
    _media(v) { return v.reduce((s, x) => s + x, 0) / v.length; },
    _de(v) { const m = this._media(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); },
    _pT(t, df) { return (typeof ComparacionGrupos !== 'undefined') ? ComparacionGrupos._pT(Math.abs(t), df) : NaN; },
    _pF(F, d1, d2) { return (typeof ComparacionGrupos !== 'undefined') ? ComparacionGrupos._pF(F, d1, d2) : NaN; },
    // Cuantil t (para IC 95%): búsqueda binaria sobre la CDF bilateral.
    _tCrit(df, alfa = 0.05) {
        let lo = 0, hi = 100;
        for (let i = 0; i < 80; i++) {
            const mid = (lo + hi) / 2;
            if (this._pT(mid, df) > alfa) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
    },

    // Inversa de matriz simétrica definida positiva por Gauss-Jordan con
    // pivoteo parcial. Devuelve null si la matriz es singular (colinealidad).
    _inversa(M) {
        const n = M.length;
        const A = M.map((f, i) => [...f, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
        for (let c = 0; c < n; c++) {
            let piv = c;
            for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
            if (Math.abs(A[piv][c]) < 1e-12) return null;
            [A[c], A[piv]] = [A[piv], A[c]];
            const d = A[c][c];
            for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
            for (let r = 0; r < n; r++) {
                if (r === c) continue;
                const f = A[r][c];
                for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j];
            }
        }
        return A.map(f => f.slice(n));
    },

    // ---------- Correlación por par (criterio coherente con la app) ----------
    _pearson(x, y) {
        const n = x.length, mx = this._media(x), my = this._media(y);
        let sxy = 0, sxx = 0, syy = 0;
        for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
        return sxy / Math.sqrt(sxx * syy);
    },
    _rangos(v) {
        const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
        const r = new Array(v.length);
        let i = 0;
        while (i < idx.length) {
            let j = i;
            while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
            const prom = (i + j) / 2 + 1;
            for (let k = i; k <= j; k++) r[idx[k][1]] = prom;
            i = j + 1;
        }
        return r;
    },
    _spearman(x, y) { return this._pearson(this._rangos(x), this._rangos(y)); },
    _esNormal(v) {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        if (!A) return true;
        const r = v.length < 50 ? A.shapiroWilk(v) : A.kolmogorovSmirnov(v);
        return r.pValor > 0.05;
    },

    // ---------- (1) Matriz de correlaciones multi-variable ----------
    matrizCorrelaciones(cols, etiquetas) {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        if (datos.length < 4 || cols.length < 2) return { error: 'Se necesitan al menos 2 variables y 4 casos.' };
        // Casos completos en TODAS las columnas (listwise), como SPSS.
        const filas = datos.map(d => cols.map(c => +d[c])).filter(f => f.every(Number.isFinite));
        const n = filas.length;
        if (n < 4) return { error: 'Muy pocos casos completos en las variables elegidas.' };
        const series = cols.map((_, j) => filas.map(f => f[j]));
        const normal = series.map(s => this._esNormal(s));
        const pares = [];
        for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
            const usarP = normal[i] && normal[j];
            const r = usarP ? this._pearson(series[i], series[j]) : this._spearman(series[i], series[j]);
            const t = r * Math.sqrt((n - 2) / Math.max(1e-12, 1 - r * r));
            pares.push({ i, j, metodo: usarP ? 'Pearson' : 'Spearman', r, pValor: this._pT(t, n - 2) });
        }
        const holm = (A && A.ajustarPValoresHolm) ? A.ajustarPValoresHolm(pares.map(p => p.pValor)) : pares.map(p => p.pValor);
        pares.forEach((p, k) => { p.pHolm = holm[k]; p.sig = p.pHolm < 0.05; });
        const R = { n, cols, etiquetas: etiquetas || cols, normal, pares };
        this._ultimaMatriz = R;
        return R;
    },

    // ---------- (2) Regresión lineal múltiple (OLS) ----------
    regresion(colY, colsX, etY, etsX) {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        if (!datos.length) return { error: 'No hay datos cargados.' };
        if (!colY || !colsX || !colsX.length) return { error: 'Elige la variable dependiente y al menos un predictor.' };
        if (colsX.includes(colY)) return { error: 'La variable dependiente no puede ser también predictor.' };
        // Casos completos (listwise).
        const filas = datos.map(d => [ +d[colY], ...colsX.map(c => +d[c]) ]).filter(f => f.every(Number.isFinite));
        const n = filas.length, k = colsX.length;
        if (n < k + 3) return { error: `Casos insuficientes: se requieren al menos ${k + 3} completos (hay ${n}).` };

        const y = filas.map(f => f[0]);
        const X = filas.map(f => [1, ...f.slice(1)]); // columna de 1s (intercepto)
        const p = k + 1;

        // X'X y X'y
        const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
        const Xty = new Array(p).fill(0);
        for (let i = 0; i < n; i++) for (let a = 0; a < p; a++) {
            Xty[a] += X[i][a] * y[i];
            for (let b = a; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
        }
        for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];

        const inv = this._inversa(XtX);
        if (!inv) return { error: 'Predictores perfectamente colineales: el modelo no puede estimarse. Retira alguno.' };
        const B = inv.map(f => f.reduce((s, v, j) => s + v * Xty[j], 0));

        // Ajuste, residuos y sumas de cuadrados.
        const yHat = X.map(f => f.reduce((s, v, j) => s + v * B[j], 0));
        const resid = y.map((v, i) => v - yHat[i]);
        const my = this._media(y);
        const SSE = resid.reduce((s, e) => s + e * e, 0);
        const SST = y.reduce((s, v) => s + (v - my) ** 2, 0);
        const SSR = SST - SSE;
        const glR = k, glE = n - p;
        const R2 = SST > 0 ? SSR / SST : 0;
        const R2aj = 1 - (1 - R2) * (n - 1) / glE;
        const F = (SSR / glR) / (SSE / glE);
        const pF = this._pF(F, glR, glE);
        const sigma2 = SSE / glE;

        // Coeficientes: SE, t, p, IC 95%, β estandarizados.
        const tCrit = this._tCrit(glE);
        const deY = this._de(y);
        const coefs = B.map((b, j) => {
            const se = Math.sqrt(sigma2 * inv[j][j]);
            const t = b / se;
            const nombre = j === 0 ? '(Constante)' : ((etsX && etsX[j - 1]) || colsX[j - 1]);
            const deX = j === 0 ? null : this._de(filas.map(f => f[j]));
            return {
                nombre, b, se, t, pValor: this._pT(t, glE),
                beta: j === 0 ? null : b * deX / deY,
                ic: [b - tCrit * se, b + tCrit * se]
            };
        });

        // VIF por predictor: 1/(1−R²_j) regresando X_j sobre el resto.
        let vifs = colsX.map(() => 1);
        if (k >= 2) {
            vifs = colsX.map((_, j) => {
                const sub = this.regresionInterna(
                    filas.map(f => f[j + 1]),
                    filas.map(f => colsX.map((__, m) => f[m + 1]).filter((__, m) => m !== j))
                );
                return sub ? 1 / Math.max(1e-9, 1 - sub.R2) : Infinity;
            });
        }

        // Normalidad de los residuos (supuesto clave del modelo).
        let normResid = { prueba: '—', pValor: NaN, normal: true };
        if (A) {
            const r = resid.length < 50 ? A.shapiroWilk(resid) : A.kolmogorovSmirnov(resid);
            normResid = { prueba: resid.length < 50 ? 'Shapiro-Wilk' : 'K-S (Lilliefors)', pValor: r.pValor, normal: r.pValor > 0.05 };
        }

        const R = {
            n, k, etY: etY || colY, colY, colsX, etsX: etsX || colsX,
            coefs, R2, R2aj, F, glR, glE, pF, errorTipico: Math.sqrt(sigma2),
            vifs, normResid, significativo: pF < 0.05
        };
        this._ultimaRegresion = R;
        return R;
    },

    // OLS mínimo interno (para VIF): devuelve solo R².
    regresionInterna(y, Xsolo) {
        const n = y.length, k = Xsolo[0].length, p = k + 1;
        const X = Xsolo.map(f => [1, ...f]);
        const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
        const Xty = new Array(p).fill(0);
        for (let i = 0; i < n; i++) for (let a = 0; a < p; a++) {
            Xty[a] += X[i][a] * y[i];
            for (let b = a; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
        }
        for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];
        const inv = this._inversa(XtX);
        if (!inv) return null;
        const B = inv.map(f => f.reduce((s, v, j) => s + v * Xty[j], 0));
        const my = this._media(y);
        let SSE = 0, SST = 0;
        for (let i = 0; i < n; i++) {
            const yh = X[i].reduce((s, v, j) => s + v * B[j], 0);
            SSE += (y[i] - yh) ** 2; SST += (y[i] - my) ** 2;
        }
        return { R2: SST > 0 ? 1 - SSE / SST : 0 };
    },

    // ---------- (3) Efecto crudo vs ajustado (lectura causal honesta) ----------
    crudoVsAjustado(R) {
        if (!R || R.error || !R.colsX.length) return null;
        const focal = R.colsX[0], etFocal = R.etsX[0];
        const crudo = this.regresionInterna
            ? this.regresion(R.colY, [focal], R.etY, [etFocal]) : null;
        // regresion() sobreescribe _ultimaRegresion: restaurar el modelo completo.
        this._ultimaRegresion = R;
        if (!crudo || crudo.error) return null;
        const bC = crudo.coefs[1], bA = R.coefs[1];
        return {
            focal: etFocal, etY: R.etY, covariables: R.etsX.slice(1),
            crudo: { b: bC.b, p: bC.pValor, ic: bC.ic },
            ajustado: { b: bA.b, p: bA.pValor, ic: bA.ic },
            sobrevive: bA.pValor < 0.05,
            cambioPct: Math.abs(bC.b) > 1e-12 ? 100 * (bA.b - bC.b) / Math.abs(bC.b) : NaN
        };
    },

    // ---------- Selección automática del mejor modelo (2 variables) ----------
    // Y CONTINUA: compite formas funcionales (lineal, cuadrática, cúbica,
    // logarítmica, exponencial) por AIC con regla de parsimonia (ΔAIC < 2 →
    // gana la más simple). Y BINARIA: regresión logística (Newton-Raphson).
    _aicGauss(SSE, n, k) { return n * Math.log(Math.max(SSE, 1e-300) / n) + 2 * (k + 1); },

    _olsXY(y, Xcols) { // OLS mínimo: devuelve {B, yHat, SSE, R2}
        const n = y.length, p = Xcols.length + 1;
        const X = y.map((_, i) => [1, ...Xcols.map(c => c[i])]);
        const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
        const Xty = new Array(p).fill(0);
        for (let i = 0; i < n; i++) for (let a = 0; a < p; a++) {
            Xty[a] += X[i][a] * y[i];
            for (let b = a; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
        }
        for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];
        const inv = this._inversa(XtX);
        if (!inv) return null;
        const B = inv.map(f => f.reduce((s, v, j) => s + v * Xty[j], 0));
        const yHat = X.map(f => f.reduce((s, v, j) => s + v * B[j], 0));
        const my = this._media(y);
        let SSE = 0, SST = 0;
        y.forEach((v, i) => { SSE += (v - yHat[i]) ** 2; SST += (v - my) ** 2; });
        return { B, yHat, SSE, R2: SST > 0 ? 1 - SSE / SST : 0 };
    },

    mejorModelo(colX, colY, etX, etY) {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        const filas = datos.map(d => [+d[colX], +d[colY]]).filter(f => f.every(Number.isFinite));
        const n = filas.length;
        if (n < 10) return { error: 'Se requieren al menos 10 casos completos.' };
        const x = filas.map(f => f[0]), y = filas.map(f => f[1]);

        // ¿Y binaria? → logística.
        const unicos = [...new Set(y)];
        if (unicos.length === 2) {
            const lo = Math.min(...unicos);
            const y01 = y.map(v => v === lo ? 0 : 1);
            const log = this._logistica(x, y01);
            if (log.error) return log;
            return { tipoY: 'binaria', etX: etX || colX, etY: etY || colY, n,
                     ganador: { nombre: 'Regresión logística', ...log }, candidatos: null };
        }

        // Y continua: concurso de formas funcionales.
        const cands = [];
        const addOLS = (nombre, ec, Xcols, k) => {
            const r = this._olsXY(y, Xcols);
            if (r) cands.push({ nombre, ec: ec(r.B), R2: r.R2, k, AIC: this._aicGauss(r.SSE, n, k), B: r.B });
        };
        const f3 = v => this._fx(v, 3);
        addOLS('Lineal', B => `ŷ = ${f3(B[0])} + ${f3(B[1])}·x`, [x], 1);
        addOLS('Cuadrática', B => `ŷ = ${f3(B[0])} + ${f3(B[1])}·x + ${f3(B[2])}·x²`, [x, x.map(v => v * v)], 2);
        addOLS('Cúbica', B => `ŷ = ${f3(B[0])} + ${f3(B[1])}·x + ${f3(B[2])}·x² + ${f3(B[3])}·x³`,
            [x, x.map(v => v * v), x.map(v => v * v * v)], 3);
        if (Math.min(...x) > 0) {
            addOLS('Logarítmica', B => `ŷ = ${f3(B[0])} + ${f3(B[1])}·ln(x)`, [x.map(Math.log)], 1);
        }
        if (Math.min(...y) > 0) {
            // Exponencial: ln(y) = a + b·x; R² y AIC evaluados EN LA ESCALA ORIGINAL
            // para que la comparación con los demás modelos sea justa.
            const rl = this._olsXY(y.map(Math.log), [x]);
            if (rl) {
                const yHat = x.map(v => Math.exp(rl.B[0] + rl.B[1] * v));
                const my = this._media(y);
                let SSE = 0, SST = 0;
                y.forEach((v, i) => { SSE += (v - yHat[i]) ** 2; SST += (v - my) ** 2; });
                cands.push({ nombre: 'Exponencial', ec: `ŷ = ${f3(Math.exp(rl.B[0]))}·e^(${f3(rl.B[1])}·x)`,
                    R2: SST > 0 ? 1 - SSE / SST : 0, k: 1, AIC: this._aicGauss(SSE, n, 1), B: rl.B });
            }
        }
        if (!cands.length) return { error: 'No fue posible ajustar ningún modelo.' };
        cands.sort((a, b) => a.AIC - b.AIC);
        const mejorAIC = cands[0].AIC;
        cands.forEach(c => { c.dAIC = c.AIC - mejorAIC; });
        // Parsimonia: entre los prácticamente empatados (ΔAIC < 2), el más simple.
        const empatados = cands.filter(c => c.dAIC < 2);
        empatados.sort((a, b) => a.k - b.k || a.AIC - b.AIC);
        const ganador = empatados[0];
        const R = { tipoY: 'continua', etX: etX || colX, etY: etY || colY, n, candidatos: cands, ganador,
                    parsimonia: ganador !== cands[0] };
        this._ultimoMejorModelo = R;
        return R;
    },

    // Regresión logística simple por Newton-Raphson (IRLS).
    _logistica(x, y01) {
        let b0 = 0, b1 = 0;
        const n = x.length;
        for (let it = 0; it < 60; it++) {
            let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
            for (let i = 0; i < n; i++) {
                const eta = b0 + b1 * x[i];
                const p = 1 / (1 + Math.exp(-eta));
                const w = p * (1 - p);
                g0 += y01[i] - p; g1 += (y01[i] - p) * x[i];
                h00 += w; h01 += w * x[i]; h11 += w * x[i] * x[i];
            }
            const det = h00 * h11 - h01 * h01;
            if (Math.abs(det) < 1e-12) return { error: 'La logística no converge (¿separación perfecta?).' };
            const d0 = (h11 * g0 - h01 * g1) / det;
            const d1 = (h00 * g1 - h01 * g0) / det;
            b0 += d0; b1 += d1;
            if (Math.abs(d0) < 1e-10 && Math.abs(d1) < 1e-10) break;
        }
        // SE de b1 desde la inversa de la información; devianza y McFadden.
        let h00 = 0, h01 = 0, h11 = 0, ll = 0, ll0 = 0;
        const pBase = y01.reduce((s, v) => s + v, 0) / n;
        for (let i = 0; i < n; i++) {
            const p = 1 / (1 + Math.exp(-(b0 + b1 * x[i])));
            const w = p * (1 - p);
            h00 += w; h01 += w * x[i]; h11 += w * x[i] * x[i];
            ll += y01[i] ? Math.log(Math.max(p, 1e-300)) : Math.log(Math.max(1 - p, 1e-300));
            ll0 += y01[i] ? Math.log(pBase) : Math.log(1 - pBase);
        }
        const det = h00 * h11 - h01 * h01;
        const seB1 = Math.sqrt(h00 / det);
        const z = b1 / seB1;
        const p2 = 2 * (1 - ((typeof ComparacionGrupos !== 'undefined') ? ComparacionGrupos._phi(Math.abs(z)) : 0.5));
        return { b0, b1, se: seB1, z, pValor: p2, OR: Math.exp(b1),
                 mcFadden: 1 - ll / ll0, AIC: -2 * ll + 4,
                 ec: `logit(p) = ${this._fx(b0, 3)} + ${this._fx(b1, 3)}·x` };
    },

    // ---------- Formato ----------
    _fp(p) { return !Number.isFinite(p) ? '—' : p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0\./, '.'); },
    _fx(x, d = 3) { return Number.isFinite(x) ? x.toFixed(d) : '—'; },

    // ---------- UI ----------
    // La tarjeta propia se retiró: la matriz y la regresión viven ahora en el
    // flujo principal de «Análisis Estadístico» (fusión multivariada).
    montar() { /* intencionalmente vacío */ },

    actualizarSelects() {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        const nums = (typeof obtenerColumnasNumericas === 'function' && datos.length) ? obtenerColumnasNumericas(datos) : [];
        const dep = document.getElementById('rmDep');
        if (dep) dep.innerHTML = nums.map(c => `<option value="${c}">${c}</option>`).join('');
        const caja = c => `<label style="display:block;margin:0.15rem 0;cursor:pointer;"><input type="checkbox" value="${c}" style="margin-right:0.4rem;">${c}</label>`;
        ['rmMatVars', 'rmPred'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = nums.length ? nums.map(caja).join('') : '<span class="help-text">Sin variables numéricas.</span>';
        });
        const estado = document.getElementById('rmEstado');
        if (estado) estado.textContent = nums.length ? '' : 'Genera o carga una base de datos para habilitar el análisis.';
    },

    _sel(id) {
        const el = document.getElementById(id);
        if (!el) return [];
        return [...el.querySelectorAll('input[type=checkbox]:checked')].map(c => c.value);
    },
    _tab(rows) { return `<table style="border-collapse:collapse;margin:0.4rem 0 0.8rem;font-size:0.92em;">${rows}</table>`; },
    _tr(cells, th) { return `<tr>${cells.map(c => th ? `<th style="border:1px solid #ddd;padding:0.35rem 0.5rem;background:#f5f5f5;">${c}</th>` : `<td style="border:1px solid #ddd;padding:0.35rem 0.5rem;">${c}</td>`).join('')}</tr>`; },

    _onMatriz() {
        const cols = this._sel('rmMatVars');
        const out = document.getElementById('rmMatOut');
        if (cols.length < 2) { if (out) out.innerHTML = '<p class="help-text">⚠️ Selecciona al menos 2 variables (Ctrl/Cmd + clic).</p>'; return; }
        const M = this.matrizCorrelaciones(cols);
        if (M.error) { if (out) out.innerHTML = `<p class="help-text">⚠️ ${M.error}</p>`; return; }
        const idx = (i, j) => M.pares.find(p => (p.i === i && p.j === j) || (p.i === j && p.j === i));
        let html = this._tab(
            this._tr(['Variable', ...M.cols.map((_, i) => String(i + 1))], true)
            + M.cols.map((c, i) => this._tr([`${i + 1}. ${c}`, ...M.cols.map((_, j) => {
                if (j > i) return '';
                if (j === i) return '1';
                const p = idx(i, j);
                return `${this._fx(p.r, 2)}${p.sig ? ' *' : ''}`;
            })])).join(''));
        html += `<p class="help-text" style="font-size:0.85em;">n = ${M.n} (casos completos). * p Holm &lt; .05. Método por par: Pearson si ambas variables son normales; Spearman en caso contrario. Diagonal = 1; se muestra el triángulo inferior (la matriz es simétrica).</p>`;
        const sig = M.pares.filter(p => p.sig);
        html += `<p style="margin:0.3rem 0 0;">${sig.length
            ? `Correlaciones significativas tras Holm: ${sig.map(p => `${M.cols[p.i]}–${M.cols[p.j]} (${p.metodo[0] === 'P' ? 'r' : 'ρ'} = ${this._fx(p.r, 2)}, p ${this._fp(p.pHolm)})`).join('; ')}.`
            : 'Ningún par mantiene la significancia tras la corrección de Holm.'}</p>`;
        if (out) out.innerHTML = html;
    },

    _onRegresion() {
        const dep = (document.getElementById('rmDep') || {}).value;
        const preds = this._sel('rmPred');
        const out = document.getElementById('rmRegOut');
        const estado = document.getElementById('rmEstado');
        const R = this.regresion(dep, preds);
        if (R.error) { if (estado) estado.textContent = '⚠️ ' + R.error; if (out) out.innerHTML = ''; return; }
        if (estado) estado.textContent = '';

        let html = `<h4 style="margin:0.4rem 0 0.2rem;">Resumen del modelo</h4>`
            + this._tab(this._tr(['R²', 'R² ajustado', 'Error típico', `F(${R.glR}, ${R.glE})`, 'p', 'Decisión'], true)
                + this._tr([this._fx(R.R2), this._fx(R.R2aj), this._fx(R.errorTipico, 2), this._fx(R.F, 2), this._fp(R.pF),
                    R.significativo ? '<b>Modelo significativo</b>' : 'Modelo no significativo']));

        html += `<h4 style="margin:0.6rem 0 0.2rem;">Coeficientes</h4>`
            + this._tab(this._tr(['Predictor', 'B', 'EE', 'β', 't', 'p', 'IC 95%', 'VIF'], true)
                + R.coefs.map((c, j) => this._tr([c.nombre, this._fx(c.b), this._fx(c.se), c.beta === null ? '—' : this._fx(c.beta),
                    this._fx(c.t, 2), this._fp(c.pValor), `[${this._fx(c.ic[0], 2)}, ${this._fx(c.ic[1], 2)}]`,
                    j === 0 ? '—' : this._fx(R.vifs[j - 1], 2)])).join(''));

        html += `<p class="help-text" style="font-size:0.85em;">Normalidad de los residuos (${R.normResid.prueba}): p ${this._fp(R.normResid.pValor)} → ${R.normResid.normal ? 'supuesto satisfecho' : 'supuesto en duda: interpreta con cautela'}. VIF &gt; 5 sugiere colinealidad problemática entre predictores.</p>`;

        const cva = this.crudoVsAjustado(R);
        if (cva && R.k >= 2) {
            html += `<h4 style="margin:0.6rem 0 0.2rem;">De la correlación al control estadístico</h4>`
                + this._tab(this._tr(['Efecto de ' + cva.focal, 'B', 'p', 'IC 95%'], true)
                    + this._tr(['Crudo (sin controles)', this._fx(cva.crudo.b), this._fp(cva.crudo.p), `[${this._fx(cva.crudo.ic[0], 2)}, ${this._fx(cva.crudo.ic[1], 2)}]`])
                    + this._tr([`Ajustado (controlando ${cva.covariables.join(', ')})`, this._fx(cva.ajustado.b), this._fp(cva.ajustado.p), `[${this._fx(cva.ajustado.ic[0], 2)}, ${this._fx(cva.ajustado.ic[1], 2)}]`]));
        }
        html += `<p style="margin:0.4rem 0 0;">${this.interpretar(R)}</p>`;
        if (out) out.innerHTML = html;
    },

    // Evalúa el modelo ganador en un valor x (para dibujar la curva).
    _evalModelo(c, xv) {
        const B = c.B;
        switch (c.nombre) {
            case 'Lineal': return B[0] + B[1] * xv;
            case 'Cuadrática': return B[0] + B[1] * xv + B[2] * xv * xv;
            case 'Cúbica': return B[0] + B[1] * xv + B[2] * xv * xv + B[3] * xv * xv * xv;
            case 'Logarítmica': return xv > 0 ? B[0] + B[1] * Math.log(xv) : NaN;
            case 'Exponencial': return Math.exp(B[0] + B[1] * xv);
            default: return NaN;
        }
    },

    // Dibuja dispersión + curva del modelo elegido en un canvas y devuelve
    // {url (PNG dataURL), w, h}. Guarda el resultado en _ultimoGrafico.
    graficoModelo(x, y, MM, etX, etY) {
        const W = 640, H = 400, mL = 60, mR = 20, mT = 40, mB = 50;
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const g = cv.getContext('2d');
        if (!g) return null;
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
        const xmin = Math.min(...x), xmax = Math.max(...x);
        const esLog = MM.tipoY === 'binaria';
        const yv = esLog ? [0, 1] : y;
        let ymin = Math.min(...yv), ymax = Math.max(...yv);
        if (ymax === ymin) { ymax += 1; ymin -= 1; }
        const padY = (ymax - ymin) * 0.06; ymin -= padY; ymax += padY;
        const sx = v => mL + (v - xmin) / (xmax - xmin || 1) * (W - mL - mR);
        const sy = v => H - mB - (v - ymin) / (ymax - ymin) * (H - mT - mB);
        // Ejes y ticks
        g.strokeStyle = '#444'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(mL, mT); g.lineTo(mL, H - mB); g.lineTo(W - mR, H - mB); g.stroke();
        g.fillStyle = '#333'; g.font = '11px sans-serif'; g.textAlign = 'center';
        for (let i = 0; i <= 5; i++) {
            const vx = xmin + (xmax - xmin) * i / 5, px = sx(vx);
            g.beginPath(); g.moveTo(px, H - mB); g.lineTo(px, H - mB + 4); g.stroke();
            g.fillText(vx.toFixed(1), px, H - mB + 16);
            const vy = ymin + (ymax - ymin) * i / 5, py = sy(vy);
            g.beginPath(); g.moveTo(mL - 4, py); g.lineTo(mL, py); g.stroke();
            g.textAlign = 'right'; g.fillText(vy.toFixed(1), mL - 7, py + 3); g.textAlign = 'center';
        }
        g.fillText(etX || 'X', (mL + W - mR) / 2, H - 12);
        g.save(); g.translate(14, (mT + H - mB) / 2); g.rotate(-Math.PI / 2);
        g.fillText(etY || 'Y', 0, 0); g.restore();
        // Puntos
        g.fillStyle = 'rgba(46,91,186,0.55)';
        for (let i = 0; i < x.length; i++) {
            g.beginPath(); g.arc(sx(x[i]), sy(esLog ? y[i] : y[i]), 3, 0, 2 * Math.PI); g.fill();
        }
        // Curva del modelo (malla de 120 puntos)
        g.strokeStyle = '#c0392b'; g.lineWidth = 2.2; g.beginPath();
        let primero = true;
        for (let i = 0; i <= 120; i++) {
            const vx = xmin + (xmax - xmin) * i / 120;
            const vy = esLog
                ? 1 / (1 + Math.exp(-(MM.ganador.b0 + MM.ganador.b1 * vx)))
                : this._evalModelo(MM.ganador, vx);
            if (!Number.isFinite(vy)) { primero = true; continue; }
            const py = Math.max(mT, Math.min(H - mB, sy(vy)));
            if (primero) { g.moveTo(sx(vx), py); primero = false; } else g.lineTo(sx(vx), py);
        }
        g.stroke();
        // Título/leyenda
        g.fillStyle = '#222'; g.font = 'bold 13px sans-serif';
        g.fillText(`Modelo ajustado: ${MM.ganador.nombre}`, W / 2, 22);
        const out = { url: cv.toDataURL('image/png'), w: W, h: H };
        this._ultimoGrafico = out;
        return out;
    },

    // Sección completa de REGRESIÓN BIVARIADA (Y ~ X): modelo OLS + concurso
    // de formas + gráfico del ganador. Guarda el estado para el Word.
    renderRegresionBivariada(colY, colX, etY, etX) {
        const R = this.regresion(colY, [colX], etY, [etX]);
        if (R.error) return { error: R.error };
        const MM = this.mejorModelo(colX, colY, etX, etY);
        // Datos para el gráfico (mismos casos completos del concurso).
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const filas = (A ? A.obtenerDatos() : []).map(d => [+d[colX], +d[colY]]).filter(f => f.every(Number.isFinite));
        const x = filas.map(f => f[0]), y = filas.map(f => f[1]);
        let img = null;
        if (!MM.error) { try { img = this.graficoModelo(x, y, MM, etX || colX, etY || colY); } catch (e) { img = null; } }
        this._ultimaBivariada = { R, MM: MM.error ? null : MM, etX: etX || colX, etY: etY || colY };

        const c1 = R.coefs[1];
        let html = `<div class="card" style="padding:1.25rem;">
          <h3 style="margin:0 0 0.3rem;">📈 Regresión bivariada: ${R.etY} según ${etX || colX}</h3>
          <p class="help-text" style="margin:0 0 0.6rem;">A diferencia de la correlación (simétrica), la regresión es <b>direccional</b>: estima cuánto cambia la variable dependiente por cada unidad de la independiente y permite predecir.</p>`;
        html += `<h4 style="margin:0.4rem 0 0.2rem;">Modelo lineal (mínimos cuadrados)</h4>`
            + this._tab(this._tr(['B (pendiente)', 'EE', 't', 'p', 'IC 95%', 'R²', `F(${R.glR}, ${R.glE})`, 'p modelo'], true)
                + this._tr([this._fx(c1.b), this._fx(c1.se), this._fx(c1.t, 2), this._fp(c1.pValor),
                    `[${this._fx(c1.ic[0], 2)}, ${this._fx(c1.ic[1], 2)}]`, this._fx(R.R2), this._fx(R.F, 2), this._fp(R.pF)]))
            + `<p class="help-text" style="font-size:0.85em;">Ecuación: ŷ = ${this._fx(R.coefs[0].b)} + ${this._fx(c1.b)}·x.</p>`
            + this._pedagogiaBivariada(R, etX || colX);
        if (!MM.error) html += this._htmlMejorModelo(MM);
        if (img) html += `<p style="text-align:center;margin:0.6rem 0 0;"><img src="${img.url}" style="max-width:100%;border:1px solid #eee;border-radius:0.4rem;" alt="Modelo ajustado"></p>`;
        html += `</div>`;
        return { html };
    },

    // ================= MOTOR MULTIVARIADO AVANZADO =================
    // OLS completo sobre matrices ya construidas (permite términos derivados:
    // interacción centrada, cuadrático). Devuelve coeficientes con SE/t/p/IC.
    _olsFull(y, Xcols, nombres) {
        const n = y.length, k = Xcols.length, p = k + 1;
        const X = y.map((_, i) => [1, ...Xcols.map(c => c[i])]);
        const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
        const Xty = new Array(p).fill(0);
        for (let i = 0; i < n; i++) for (let a = 0; a < p; a++) {
            Xty[a] += X[i][a] * y[i];
            for (let b = a; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
        }
        for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];
        const inv = this._inversa(XtX);
        if (!inv) return { error: 'Predictores perfectamente colineales.' };
        const B = inv.map(f => f.reduce((s, v, j) => s + v * Xty[j], 0));
        const yHat = X.map(f => f.reduce((s, v, j) => s + v * B[j], 0));
        const resid = y.map((v, i) => v - yHat[i]);
        const my = this._media(y);
        const SSE = resid.reduce((s, e) => s + e * e, 0);
        const SST = y.reduce((s, v) => s + (v - my) ** 2, 0);
        const glE = n - p, R2 = SST > 0 ? 1 - SSE / SST : 0;
        const F = k > 0 ? ((SST - SSE) / k) / (SSE / glE) : NaN;
        const sigma2 = SSE / glE, tC = this._tCrit(glE), deY = this._de(y);
        const coefs = B.map((b, j) => {
            const se = Math.sqrt(sigma2 * inv[j][j]);
            const deX = j === 0 ? null : this._de(Xcols[j - 1]);
            return { nombre: j === 0 ? '(Constante)' : nombres[j - 1], b, se, t: b / se,
                     pValor: this._pT(b / se, glE), beta: j === 0 ? null : b * deX / deY,
                     ic: [b - tC * se, b + tC * se] };
        });
        return { familia: 'ols', n, k, coefs, R2, R2aj: 1 - (1 - R2) * (n - 1) / glE,
                 F, glR: k, glE, pF: this._pF(F, k, glE), SSE, resid, yHat,
                 errorTipico: Math.sqrt(sigma2) };
    },

    // Logística multivariada (Newton-Raphson con la inversa de la información).
    _logisticaK(y01, Xcols, nombres) {
        const n = y01.length, k = Xcols.length, p = k + 1;
        const X = y01.map((_, i) => [1, ...Xcols.map(c => c[i])]);
        let B = new Array(p).fill(0);
        for (let it = 0; it < 80; it++) {
            const grad = new Array(p).fill(0);
            const info = Array.from({ length: p }, () => new Array(p).fill(0));
            for (let i = 0; i < n; i++) {
                const eta = X[i].reduce((s, v, j) => s + v * B[j], 0);
                const mu = 1 / (1 + Math.exp(-eta)), w = mu * (1 - mu);
                for (let a = 0; a < p; a++) {
                    grad[a] += (y01[i] - mu) * X[i][a];
                    for (let b = a; b < p; b++) info[a][b] += w * X[i][a] * X[i][b];
                }
            }
            for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) info[a][b] = info[b][a];
            const inv = this._inversa(info);
            if (!inv) return { error: 'La logística no converge (¿separación perfecta?).' };
            let maxd = 0;
            for (let a = 0; a < p; a++) {
                const d = inv[a].reduce((s, v, j) => s + v * grad[j], 0);
                B[a] += d; maxd = Math.max(maxd, Math.abs(d));
            }
            if (maxd < 1e-10) {
                // Convergió: SE desde la inversa final, devianza y McFadden.
                let ll = 0, ll0 = 0;
                const pb = y01.reduce((s, v) => s + v, 0) / n;
                for (let i = 0; i < n; i++) {
                    const mu = 1 / (1 + Math.exp(-X[i].reduce((s, v, j) => s + v * B[j], 0)));
                    ll += y01[i] ? Math.log(Math.max(mu, 1e-300)) : Math.log(Math.max(1 - mu, 1e-300));
                    ll0 += y01[i] ? Math.log(pb) : Math.log(1 - pb);
                }
                const zc = 1.959964;
                const coefs = B.map((b, j) => {
                    const se = Math.sqrt(inv[j][j]);
                    const z = b / se;
                    const p2 = 2 * (1 - ComparacionGrupos._phi(Math.abs(z)));
                    return { nombre: j === 0 ? '(Constante)' : nombres[j - 1], b, se, z, pValor: p2,
                             OR: Math.exp(b), ic: [Math.exp(b - zc * se), Math.exp(b + zc * se)] };
                });
                return { familia: 'logistica', n, k, coefs, mcFadden: 1 - ll / ll0,
                         AIC: -2 * ll + 2 * p, converge: true };
            }
        }
        return { error: 'La logística no convergió en 80 iteraciones.' };
    },

    // Poisson multivariada (IRLS, link log) + test de sobredispersión.
    _poissonK(y, Xcols, nombres) {
        const n = y.length, k = Xcols.length, p = k + 1;
        if (!y.every(v => Number.isInteger(v) && v >= 0))
            return { error: 'Poisson requiere una variable dependiente de conteo (enteros ≥ 0).' };
        const X = y.map((_, i) => [1, ...Xcols.map(c => c[i])]);
        let B = new Array(p).fill(0);
        B[0] = Math.log(Math.max(this._media(y), 0.1));
        for (let it = 0; it < 100; it++) {
            const grad = new Array(p).fill(0);
            const info = Array.from({ length: p }, () => new Array(p).fill(0));
            for (let i = 0; i < n; i++) {
                const mu = Math.exp(Math.min(30, X[i].reduce((s, v, j) => s + v * B[j], 0)));
                for (let a = 0; a < p; a++) {
                    grad[a] += (y[i] - mu) * X[i][a];
                    for (let b = a; b < p; b++) info[a][b] += mu * X[i][a] * X[i][b];
                }
            }
            for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) info[a][b] = info[b][a];
            const inv = this._inversa(info);
            if (!inv) return { error: 'Poisson no converge (información singular).' };
            let maxd = 0;
            for (let a = 0; a < p; a++) {
                const d = inv[a].reduce((s, v, j) => s + v * grad[j], 0);
                B[a] += d; maxd = Math.max(maxd, Math.abs(d));
            }
            if (maxd < 1e-9) {
                let chi2 = 0;
                const mus = X.map(f => Math.exp(f.reduce((s, v, j) => s + v * B[j], 0)));
                mus.forEach((mu, i) => { chi2 += (y[i] - mu) ** 2 / Math.max(mu, 1e-9); });
                const dispersion = chi2 / (n - p);
                const zc = 1.959964;
                const coefs = B.map((b, j) => {
                    const se = Math.sqrt(inv[j][j]);
                    const z = b / se;
                    return { nombre: j === 0 ? '(Constante)' : nombres[j - 1], b, se, z,
                             pValor: 2 * (1 - ComparacionGrupos._phi(Math.abs(z))),
                             IRR: Math.exp(b), ic: [Math.exp(b - zc * se), Math.exp(b + zc * se)] };
                });
                return { familia: 'poisson', n, k, coefs, dispersion,
                         sobredispersion: dispersion > 1.5, converge: true };
            }
        }
        return { error: 'Poisson no convergió.' };
    },

    // Análisis multivariado COMPLETO con opciones psicológicas:
    // opciones = { interaccion:bool, cuadratico:bool, poisson:bool }
    // El PRIMER predictor es el focal (constructo de interés); el resto, controles.
    regresionAvanzada(colY, colsX, etY, etsX, opciones = {}) {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        if (!colY || !colsX || !colsX.length) return { error: 'Elige la dependiente y al menos un predictor.' };
        if (colsX.includes(colY)) return { error: 'La dependiente no puede ser también predictor.' };
        const filas = datos.map(d => [+d[colY], ...colsX.map(c => +d[c])]).filter(f => f.every(Number.isFinite));
        const n = filas.length, k0 = colsX.length;
        if (n < k0 + 5) return { error: `Casos insuficientes (${n}) para ${k0} predictores.` };
        const y = filas.map(f => f[0]);
        const ets = colsX.map((c, i) => (etsX && etsX[i]) || c);
        const avisos = [];

        // --- Familia por naturaleza de Y ---
        const unicos = [...new Set(y)];
        if (unicos.length === 2) {
            const lo = Math.min(...unicos);
            const R = this._logisticaK(y.map(v => v === lo ? 0 : 1), colsX.map((_, j) => filas.map(f => f[j + 1])), ets);
            if (R.error) return R;
            R.etY = etY || colY; R.etsX = ets; R.avisos = avisos;
            R.notaFamilia = 'La variable dependiente es binaria: se ajustó una regresión logística múltiple (los coeficientes se interpretan como razones de probabilidades, OR).';
            this._ultimaMultiple = R;
            return R;
        }
        if (unicos.length >= 3 && unicos.length <= 6 && y.every(v => Number.isInteger(v)) && !opciones.poisson) {
            avisos.push(`La dependiente tiene ${unicos.length} categorías enteras: si representan grupos (no un puntaje), el modelo apropiado es la regresión logística multinomial (categorías sin orden) u ordinal (con orden), disponibles en software especializado (R: nnet/MASS; SPSS: NOMREG/PLUM). Aquí se ajustó el modelo para Y continua a título exploratorio.`);
        }
        if (opciones.poisson) {
            const R = this._poissonK(y, colsX.map((_, j) => filas.map(f => f[j + 1])), ets);
            if (R.error) return R;
            R.etY = etY || colY; R.etsX = ets; R.avisos = avisos;
            R.notaFamilia = 'Modelo de Poisson (declarado por el investigador como conteo de eventos): los coeficientes exponenciados (IRR) indican por cuánto se multiplica la tasa esperada por cada unidad del predictor.';
            if (R.sobredispersion) R.avisos.push(`Sobredispersión detectada (χ²/gl = ${this._fx(R.dispersion, 2)} > 1.5): la varianza excede a la media, patrón típico de conductas agrupadas. El modelo recomendado es la regresión binomial negativa (R: MASS::glm.nb; SPSS: GENLIN), pues Poisson subestima los errores estándar en este escenario.`);
            this._ultimaMultiple = R;
            return R;
        }

        // --- OLS con términos psicológicos: centrado, interacción, cuadrático ---
        const Xbase = colsX.map((_, j) => filas.map(f => f[j + 1]));
        const centrar = v => { const m = this._media(v); return v.map(x => x - m); };
        const Xc = Xbase.map(centrar); // centrado para interacción/cuadrático (reduce colinealidad)
        const cols = [...Xbase], nombres = [...ets];
        let idxInter = -1, idxCuad = -1;
        if (opciones.interaccion && k0 >= 2) {
            cols.push(Xc[0].map((v, i) => v * Xc[1][i]));
            nombres.push(`${ets[0]} × ${ets[1]} (interacción, centrada)`);
            idxInter = cols.length - 1;
        }
        if (opciones.cuadratico) {
            cols.push(Xc[0].map(v => v * v));
            nombres.push(`${ets[0]}² (efecto curvilíneo, centrado)`);
            idxCuad = cols.length - 1;
        }
        const R = this._olsFull(y, cols, nombres);
        if (R.error) return R;
        R.etY = etY || colY; R.etsX = ets; R.idxInter = idxInter; R.idxCuad = idxCuad;
        R.notaFamilia = null;

        // VIF por término
        R.vifs = cols.length >= 2 ? cols.map((_, j) => {
            const sub = this._olsFull(cols[j], cols.filter((__, m) => m !== j), []);
            return sub.error ? Infinity : 1 / Math.max(1e-9, 1 - sub.R2);
        }) : cols.map(() => 1);

        // --- Regresión JERÁRQUICA por bloques (k0 ≥ 2): Bloque 1 = controles
        // (predictores 2..k), Bloque 2 = + focal (y sus términos derivados). ---
        if (k0 >= 2) {
            const idxControles = colsX.map((_, j) => j).slice(1);
            const colsB1 = idxControles.map(j => Xbase[j]);
            const R1 = this._olsFull(y, colsB1, idxControles.map(j => ets[j]));
            if (!R1.error) {
                const q = R.k - R1.k; // términos añadidos en el bloque 2
                const dR2 = R.R2 - R1.R2;
                const Fcambio = (dR2 / q) / ((1 - R.R2) / R.glE);
                R.jerarquica = {
                    focal: ets[0], controles: idxControles.map(j => ets[j]),
                    R2b1: R1.R2, R2b2: R.R2, dR2, q,
                    Fcambio, gl: [q, R.glE], pCambio: this._pF(Fcambio, q, R.glE)
                };
            }
        }

        // Aviso de atípicos severos → regresión robusta
        const sdE = Math.sqrt(R.SSE / R.glE);
        const extremos = R.resid.filter(e => Math.abs(e / sdE) > 3).length;
        if (extremos / n > 0.02) {
            avisos.push(`Se detectaron ${extremos} residuos estandarizados con |z| > 3 (${(100 * extremos / n).toFixed(1)} % de los casos): con atípicos severos, la regresión robusta (estimadores M; R: MASS::rlm) protege las estimaciones mejor que los mínimos cuadrados clásicos.`);
        }
        // Normalidad de residuos
        if (A) {
            const rn = R.resid.length < 50 ? A.shapiroWilk(R.resid) : A.kolmogorovSmirnov(R.resid);
            R.normResid = { prueba: R.resid.length < 50 ? 'Shapiro-Wilk' : 'K-S (Lilliefors)', pValor: rn.pValor, normal: rn.pValor > 0.05 };
        }
        R.avisos = avisos;
        this._ultimaMultiple = R;
        return R;
    },

    // Explicación exhaustiva del modelo lineal bivariado, con los valores reales.
    _pedagogiaBivariada(R, etX) {
        const c1 = R.coefs[1], c0 = R.coefs[0];
        const sig = c1.pValor < 0.05;
        return `<p style="margin:0.5rem 0 0;">Cómo leer este modelo, pieza por pieza. La <b>pendiente</b> (B = ${this._fx(c1.b)}) es el corazón de la regresión: indica que, por cada punto adicional en ${etX}, ${R.etY} ${c1.b >= 0 ? 'aumenta' : 'disminuye'} en promedio ${this._fx(Math.abs(c1.b), 2)} puntos. Su <b>error estándar</b> (${this._fx(c1.se)}) mide la incertidumbre de esa estimación, y el <b>intervalo de confianza al 95 %</b> [${this._fx(c1.ic[0], 2)}, ${this._fx(c1.ic[1], 2)}] delimita el rango plausible de la pendiente en la población: ${c1.ic[0] > 0 || c1.ic[1] < 0 ? 'como no incluye el cero, el efecto es estadísticamente distinguible de la ausencia de relación' : 'como incluye el cero, no puede descartarse la ausencia de efecto'}. La <b>constante</b> (${this._fx(c0.b)}) es el valor esperado de ${R.etY} cuando ${etX} vale cero (a veces un punto solo teórico).</p>
        <p style="margin:0.4rem 0 0;">El <b>R² = ${this._fx(R.R2)}</b> cuantifica la capacidad explicativa: el ${(100 * R.R2).toFixed(1)} % de las diferencias entre participantes en ${R.etY} queda explicado por ${etX}; el ${(100 * (1 - R.R2)).toFixed(1)} % restante obedece a otros factores no incluidos (otras variables, medición, azar). El <b>error típico</b> (${this._fx(R.errorTipico, 2)}) expresa cuánto se desvían, en promedio, las predicciones de los valores reales — la precisión práctica del modelo. Finalmente, la prueba <b>F(${R.glR}, ${R.glE}) = ${this._fx(R.F, 2)}</b> (p ${this._fp(R.pF)}) evalúa el modelo en conjunto: ${sig ? 'el modelo predice significativamente mejor que usar la simple media de ' + R.etY : 'el modelo no mejora significativamente a la simple media de ' + R.etY}.</p>`;
    },

    // Lectura pedagógica del modelo múltiple (B vs β, R² ajustado, VIF, síntesis).
    _pedagogiaMultiple(R) {
        const preds = R.coefs.slice(1);
        const sig = preds.filter(c => c.pValor < 0.05 && c.beta !== null).sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta));
        let h = `<p style="margin:0.5rem 0 0;">Cómo leer los coeficientes. Cada <b>B</b> indica el cambio esperado en ${R.etY} por cada unidad del predictor <i>manteniendo constantes los demás</i> — esa cláusula es la esencia de la regresión múltiple: aísla el aporte propio de cada variable descontando lo que comparte con las otras. Como los B dependen de las unidades de medida de cada predictor, no sirven para compararlos entre sí; para eso están los <b>β estandarizados</b>, que expresan todos los efectos en la misma moneda (desviaciones estándar) y permiten ordenar la importancia relativa.</p>`;
        h += `<p style="margin:0.4rem 0 0;">El <b>R² = ${this._fx(R.R2)}</b> indica que el conjunto de predictores explica el ${(100 * R.R2).toFixed(1)} % de la variabilidad de ${R.etY}; el <b>R² ajustado = ${this._fx(R.R2aj)}</b> corrige ese valor penalizando cada predictor añadido, porque el R² bruto sube mecánicamente con cualquier variable extra aunque no aporte — por eso el ajustado es el honesto para comparar modelos de distinto tamaño. El <b>VIF</b> vigila la colinealidad: cuando dos predictores comparten mucha información, sus errores estándar se inflan y los aportes individuales se vuelven borrosos (valores &gt; 5 encienden la alerta${Number.isFinite(Math.max(...(R.vifs || [1]))) && Math.max(...R.vifs) > 5 ? ' — como ocurre aquí' : '; aquí están en zona segura'}).</p>`;
        h += `<p style="margin:0.4rem 0 0;"><b>Síntesis:</b> ${sig.length
            ? `contribuyen de forma independiente ${sig.map(c => `${c.nombre} (β = ${this._fx(c.beta, 2)}, p ${this._fp(c.pValor)})`).join('; ')}${sig.length > 1 ? ` — siendo ${sig[0].nombre} el de mayor peso relativo` : ''}. Los predictores no significativos no aportan poder explicativo propio una vez considerados los demás (lo que no niega que se relacionen con ${R.etY} de forma cruda).`
            : `ningún predictor alcanza significancia individual una vez controlados los demás: el modelo${R.significativo === false || R.pF >= 0.05 ? ' tampoco es significativo en conjunto' : ' puede ser significativo en conjunto por efectos repartidos, pero sin un responsable claro'}.`}</p>`;
        return h;
    },

    _htmlMejorModelo(MM) {
        let h = `<h4 style="margin:0.6rem 0 0.2rem;">🔍 ¿Qué modelo explica mejor esta relación?</h4>`;
        if (MM.tipoY === 'binaria') {
            const g = MM.ganador;
            h += `<p class="help-text" style="font-size:0.88em;">La variable dependiente es <b>binaria</b> (dos valores), por lo que el modelo apropiado no es la recta sino la <b>regresión logística</b> (probit es su gemela; en psicología se reporta logística).</p>`
                + this._tab(this._tr(['Modelo', 'Ecuación', 'OR (e^b)', 'z', 'p', 'Pseudo-R² (McFadden)'], true)
                + this._tr([g.nombre, g.ec, this._fx(g.OR, 3), this._fx(g.z, 2), this._fp(g.pValor), this._fx(g.mcFadden, 3)]))
                + `<p style="margin:0.2rem 0 0;">Lectura: por cada unidad adicional de ${MM.etX}, la <i>razón de probabilidades</i> de ${MM.etY} se multiplica por ${this._fx(g.OR, 2)} (${g.OR > 1 ? 'aumenta' : 'disminuye'} la probabilidad del evento)${g.pValor < 0.05 ? ', efecto estadísticamente significativo' : ', sin alcanzar significancia'}.</p>`;
            return h;
        }
        h += this._tab(this._tr(['Modelo', 'Ecuación ajustada', 'R²', 'AIC', 'ΔAIC'], true)
            + MM.candidatos.map(c => this._tr([c === MM.ganador ? `<b>${c.nombre} ✔</b>` : c.nombre, c.ec,
                this._fx(c.R2, 3), this._fx(c.AIC, 1), this._fx(c.dAIC, 1)])).join(''));
        h += this._justificacionAIC(MM);
        return h;
    },

    // Matriz de correlaciones para el flujo principal (3+ variables elegidas).
    renderMatrizFlujo(cols, ets) {
        const M = this.matrizCorrelaciones(cols, ets);
        if (M.error) return { error: M.error };
        this._ultimaMatrizFlujo = M;
        const idx = (i, j) => M.pares.find(p => (p.i === i && p.j === j) || (p.i === j && p.j === i));
        let html = `<div class="card" style="padding:1.25rem;">
          <h3 style="margin:0 0 0.3rem;">🔗 Matriz de correlaciones (${M.cols.length} variables)</h3>
          <p class="help-text" style="margin:0 0 0.6rem;">Con más de dos variables, el análisis presenta todas las asociaciones por pares. Para cada par se usa Pearson o Spearman según su normalidad, con p corregido por Holm.</p>`
          + this._tab(this._tr(['Variable', ...M.cols.map((_, i) => String(i + 1))], true)
            + M.cols.map((c, i) => this._tr([`${i + 1}. ${(M.etiquetas && M.etiquetas[i]) || c}`,
                ...M.cols.map((_, j) => j > i ? '' : (j === i ? '1' : `${this._fx(idx(i, j).r, 2)}${idx(i, j).sig ? ' *' : ''}`))])).join(''))
          + `<p class="help-text" style="font-size:0.85em;">n = ${M.n} casos completos. * p Holm &lt; .05. Triángulo inferior (matriz simétrica).</p>`;
        const sig = M.pares.filter(p => p.sig);
        html += `<p style="margin:0.3rem 0 0;">${sig.length
            ? `Pares significativos tras Holm: ${sig.map(p => `${(M.etiquetas || M.cols)[p.i]}–${(M.etiquetas || M.cols)[p.j]} (${p.metodo[0] === 'P' ? 'r' : 'ρ'} = ${this._fx(p.r, 2)}, p ${this._fp(p.pHolm)})`).join('; ')}.`
            : 'Ningún par mantiene la significancia tras la corrección de Holm.'}</p></div>`;
        return { html };
    },

    // Render del modelo múltiple avanzado (OLS/logística/Poisson) para la web.
    renderMultiple(R) {
        if (R.error) return { error: R.error };
        let h = `<div class="card" style="padding:1.25rem;margin-top:1rem;">
          <h3 style="margin:0 0 0.3rem;">📐 Regresión múltiple: ${R.etY} según ${R.etsX.join(', ')}</h3>`;
        if (R.notaFamilia) h += `<p class="help-text" style="margin:0 0 0.5rem;">${R.notaFamilia}</p>`;
        if (R.familia === 'ols') {
            h += `<h4 style="margin:0.4rem 0 0.2rem;">Resumen del modelo</h4>`
                + this._tab(this._tr(['R²', 'R² ajustado', `F(${R.glR}, ${R.glE})`, 'p'], true)
                    + this._tr([this._fx(R.R2), this._fx(R.R2aj), this._fx(R.F, 2), this._fp(R.pF)]))
                + `<h4 style="margin:0.5rem 0 0.2rem;">Coeficientes</h4>`
                + this._tab(this._tr(['Término', 'B', 'EE', 'β', 't', 'p', 'IC 95%', 'VIF'], true)
                    + R.coefs.map((c, j) => this._tr([c.nombre, this._fx(c.b), this._fx(c.se),
                        c.beta === null ? '—' : this._fx(c.beta), this._fx(c.t, 2), this._fp(c.pValor),
                        `[${this._fx(c.ic[0], 2)}, ${this._fx(c.ic[1], 2)}]`,
                        j === 0 ? '—' : this._fx(R.vifs[j - 1], 2)])).join(''));
            h += this._pedagogiaMultiple(R);
            if (R.jerarquica) {
                const J = R.jerarquica;
                h += `<h4 style="margin:0.6rem 0 0.2rem;">Análisis jerárquico por bloques</h4>
                  <p class="help-text" style="margin:0 0 0.3rem;font-size:0.88em;">Bloque 1: controles (${J.controles.join(', ')}). Bloque 2: se añade ${J.focal}${R.idxInter >= 0 || R.idxCuad >= 0 ? ' y sus términos derivados' : ''}. El ΔR² responde: ¿aporta el constructo de interés varianza explicativa <i>por encima</i> de los controles?</p>`
                  + this._tab(this._tr(['Bloque', 'R²', 'ΔR²', 'F del cambio', 'gl', 'p del cambio'], true)
                    + this._tr(['1 (controles)', this._fx(J.R2b1), '—', '—', '—', '—'])
                    + this._tr([`2 (+ ${J.focal})`, this._fx(J.R2b2), this._fx(J.dR2), this._fx(J.Fcambio, 2), `(${J.gl[0]}, ${J.gl[1]})`, this._fp(J.pCambio)]))
                  + `<p style="margin:0.2rem 0 0;">${J.pCambio < 0.05
                        ? `${J.focal} añade un ${(100 * J.dR2).toFixed(1)} % de varianza explicada por encima de los controles (cambio significativo): su aporte no se reduce a lo que ya explicaban ${J.controles.join(' y ')}.`
                        : `Una vez considerados los controles, ${J.focal} no añade varianza explicativa significativa (ΔR² = ${this._fx(J.dR2)}, p ${this._fp(J.pCambio)}).`}</p>`;
            }
            if (R.idxInter >= 0) {
                const c = R.coefs[R.idxInter + 1];
                h += `<p style="margin:0.4rem 0 0;"><b>Moderación:</b> el término de interacción ${c.nombre} resultó ${c.pValor < 0.05
                    ? `significativo (B = ${this._fx(c.b)}, p ${this._fp(c.pValor)}): el efecto de ${R.etsX[0]} sobre ${R.etY} <i>cambia según el nivel</i> de ${R.etsX[1]}.`
                    : `no significativo (p ${this._fp(c.pValor)}): no hay evidencia de que ${R.etsX[1]} modere el efecto de ${R.etsX[0]}.`}</p>`;
            }
            if (R.idxCuad >= 0) {
                const c = R.coefs[R.idxCuad + 1];
                h += `<p style="margin:0.3rem 0 0;"><b>Efecto curvilíneo:</b> ${c.pValor < 0.05
                    ? `el término cuadrático es significativo (B = ${this._fx(c.b)}, p ${this._fp(c.pValor)}): la relación tiene forma de curva (${c.b < 0 ? 'U invertida — típico patrón de nivel óptimo' : 'U'}), no de recta.`
                    : `el término cuadrático no alcanza significancia: no hay evidencia de curvatura.`}</p>`;
            }
            if (R.normResid) h += `<p class="help-text" style="font-size:0.85em;margin-top:0.4rem;">Normalidad de los residuos (${R.normResid.prueba}): p ${this._fp(R.normResid.pValor)} → ${R.normResid.normal ? 'supuesto satisfecho' : 'en duda: interpreta con cautela'}.</p>`;
        } else if (R.familia === 'logistica') {
            h += `<h4 style="margin:0.4rem 0 0.2rem;">Coeficientes (regresión logística múltiple)</h4>`
                + this._tab(this._tr(['Término', 'B', 'EE', 'z', 'p', 'OR', 'IC 95% (OR)'], true)
                    + R.coefs.map(c => this._tr([c.nombre, this._fx(c.b), this._fx(c.se), this._fx(c.z, 2),
                        this._fp(c.pValor), this._fx(c.OR, 3), `[${this._fx(c.ic[0], 2)}, ${this._fx(c.ic[1], 2)}]`])).join(''))
                + `<p class="help-text" style="font-size:0.85em;">Pseudo-R² de McFadden = ${this._fx(R.mcFadden, 3)}; AIC = ${this._fx(R.AIC, 1)}. Cada OR indica por cuánto se multiplican las probabilidades relativas del evento por unidad del predictor, con los demás constantes.</p>`;
        } else if (R.familia === 'poisson') {
            h += `<h4 style="margin:0.4rem 0 0.2rem;">Coeficientes (regresión de Poisson múltiple)</h4>`
                + this._tab(this._tr(['Término', 'B', 'EE', 'z', 'p', 'IRR', 'IC 95% (IRR)'], true)
                    + R.coefs.map(c => this._tr([c.nombre, this._fx(c.b), this._fx(c.se), this._fx(c.z, 2),
                        this._fp(c.pValor), this._fx(c.IRR, 3), `[${this._fx(c.ic[0], 2)}, ${this._fx(c.ic[1], 2)}]`])).join(''))
                + `<p class="help-text" style="font-size:0.85em;">Dispersión (χ²/gl) = ${this._fx(R.dispersion, 2)}${R.sobredispersion ? ' — <b>sobredispersión</b>' : ' (adecuada)'}. Cada IRR indica por cuánto se multiplica la tasa esperada de eventos por unidad del predictor.</p>`;
        }
        (R.avisos || []).forEach(a => {
            h += `<p style="margin:0.5rem 0 0;padding:0.5rem 0.7rem;background:#fff8e1;border-left:3px solid #f0ad4e;border-radius:0.3rem;font-size:0.88em;">⚠️ ${a}</p>`;
        });
        h += `</div>`;
        return { html: h };
    },

    // Justificación detallada de la selección de modelo (Burnham & Anderson).
    _justificacionAIC(MM) {
        const g = MM.ganador;
        const orden = [...MM.candidatos].sort((a, b) => a.AIC - b.AIC);
        const rival = orden.find(c => c !== g) || orden[1];
        const zona = d => d < 2 ? 'apoyo prácticamente equivalente' : d <= 7 ? 'considerablemente menos apoyo empírico' : 'apoyo esencialmente nulo';
        let h = `<p style="margin:0.4rem 0 0;">Por qué se eligió este modelo. El <b>criterio de información de Akaike (AIC)</b> resuelve el dilema central de la selección de modelos: un modelo con más parámetros siempre ajusta mejor <i>a esta muestra</i>, pero corre el riesgo de memorizar su ruido (sobreajuste) y fallar con datos nuevos. El AIC equilibra ambas fuerzas — premia la verosimilitud del ajuste y descuenta 2 puntos por cada parámetro — de modo que <b>menor AIC = mejor compromiso</b> entre fidelidad y simplicidad. Las diferencias (ΔAIC) se interpretan con las convenciones de Burnham y Anderson: Δ &lt; 2, modelos prácticamente equivalentes; Δ entre 4 y 7, el rival pierde apoyo de forma considerable; Δ &gt; 10, el rival queda sin apoyo empírico.</p>`;
        if (rival) {
            const d = rival.AIC - g.AIC;
            h += `<p style="margin:0.4rem 0 0;">En estos datos, <b>${g.nombre}</b> ${MM.parsimonia
                ? `empata en la práctica con alternativas más complejas (Δ &lt; 2) y se impone por <b>parsimonia</b>: cuando la evidencia no distingue entre un modelo simple y uno complejo, la ciencia elige el simple, porque cada parámetro extra que no gana apoyo real solo añade riesgo de sobreajuste`
                : `presenta el menor AIC; su rival más cercano (${rival.nombre}) queda a ΔAIC = ${this._fx(d, 1)}, es decir, con ${zona(d)}`}. En términos de ajuste, el ganador explica el ${(100 * g.R2).toFixed(1)} % de la variabilidad de ${MM.etY} (R² = ${this._fx(g.R2, 3)})${Math.abs(g.R2 - rival.R2) < 0.01 ? `, prácticamente lo mismo que ${rival.nombre} (R² = ${this._fx(rival.R2, 3)}) — otra señal de que la complejidad extra no compra ajuste real` : ` frente al ${(100 * rival.R2).toFixed(1)} % de ${rival.nombre}`}.</p>`;
        }
        h += `<p style="margin:0.4rem 0 0;"><b>Implicación práctica:</b> ${g.nombre === 'Lineal'
            ? `la relación entre ${MM.etX} y ${MM.etY} se describe adecuadamente con una recta, lo que valida el uso del coeficiente de correlación lineal como resumen fiel de la asociación.`
            : `la relación entre ${MM.etX} y ${MM.etY} presenta curvatura (forma ${g.nombre.toLowerCase()}): el coeficiente de correlación lineal subestima la intensidad real del vínculo, y las conclusiones deben apoyarse en esta forma funcional.`}</p>`;
        return h;
    },

    // Interpretación en lenguaje llano (compartida con el Word).
    interpretar(R) {
        const preds = R.coefs.slice(1);
        const sig = preds.filter(c => c.pValor < 0.05);
        let s = `El modelo de regresión múltiple explica el ${(100 * R.R2).toFixed(1)}\u2009% de la variabilidad de ${R.etY} `
            + `(R² = ${this._fx(R.R2)}, R² ajustado = ${this._fx(R.R2aj)}) y resulta ${R.significativo ? '' : 'no '}significativo en conjunto, `
            + `F(${R.glR}, ${R.glE}) = ${this._fx(R.F, 2)}, p ${this._fp(R.pF)}. `;
        s += sig.length
            ? `Contribuyen de forma independiente: ${sig.map(c => `${c.nombre} (β = ${this._fx(c.beta, 2)}, p ${this._fp(c.pValor)})`).join('; ')} — cada β expresa cuántas desviaciones estándar cambia ${R.etY} por cada desviación estándar del predictor, manteniendo constantes los demás. `
            : `Ningún predictor alcanza significancia individual una vez controlados los demás. `;
        const maxVif = Math.max(...R.vifs);
        if (Number.isFinite(maxVif) && maxVif > 5) s += `Atención: hay colinealidad apreciable (VIF máximo = ${this._fx(maxVif, 1)}), lo que infla los errores estándar y dificulta separar los aportes individuales. `;
        const cva = R.k >= 2 ? this.crudoVsAjustado(R) : null;
        if (cva) {
            s += cva.sobrevive
                ? `El efecto de ${cva.focal} sobre ${R.etY} se mantiene significativo tras controlar ${cva.covariables.join(', ')} (B pasa de ${this._fx(cva.crudo.b, 2)} a ${this._fx(cva.ajustado.b, 2)}): la asociación no se explica por esas covariables, condición necesaria —aunque no suficiente— para una interpretación causal. `
                : `El efecto de ${cva.focal} deja de ser significativo al controlar ${cva.covariables.join(', ')}: la asociación cruda podría ser atribuible, al menos en parte, a esas covariables. `;
        }
        s += `Debe recordarse que, con un diseño transversal, la regresión estima asociación con control estadístico, no causalidad: establecer causa requeriría además precedencia temporal (diseños longitudinales) o manipulación experimental.`;
        return s;
    }
};

if (typeof window !== 'undefined') {
    window.RegresionMultiple = RegresionMultiple;
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => RegresionMultiple.montar());
    } else {
        RegresionMultiple.montar();
    }
}
