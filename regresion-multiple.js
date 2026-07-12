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

    // ---------- Formato ----------
    _fp(p) { return !Number.isFinite(p) ? '—' : p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0\./, '.'); },
    _fx(x, d = 3) { return Number.isFinite(x) ? x.toFixed(d) : '—'; },

    // ---------- UI ----------
    montar() {
        const slot = document.getElementById('cgSlot') || document.getElementById('analizador');
        if (!slot || document.getElementById('rmCard')) return;
        const card = document.createElement('div');
        card.id = 'rmCard';
        card.className = 'card';
        card.style.cssText = 'margin-top:1.5rem;padding:1.25rem;border:1px solid var(--color-border,#e5e5e5);border-radius:0.6rem;';
        card.innerHTML = `
          <h3 style="margin:0 0 0.3rem;">📐 Análisis multivariado</h3>
          <p class="help-text" style="margin:0 0 0.8rem;">Explora relaciones entre <b>más de dos variables a la vez</b>: una matriz de correlaciones para el panorama completo, y una regresión lineal múltiple para estimar cuánto aporta cada predictor a la variable dependiente controlando por los demás.</p>

          <h4 style="margin:0.6rem 0 0.2rem;">Matriz de correlaciones (2 o más variables)</h4>
          <p class="help-text" style="margin:0 0 0.4rem; font-size:0.88em;">Selecciona 2 o más variables numéricas manteniendo pulsada la tecla <b>Ctrl</b> (o <b>Cmd</b> en Mac) mientras haces clic. Para cada par se usa Pearson o Spearman según su normalidad, con p corregido por Holm.</p>
          <div style="display:flex;gap:0.8rem;flex-wrap:wrap;align-items:flex-end;">
            <select id="rmMatVars" class="input" multiple size="5" style="min-width:16rem;"></select>
            <button id="rmMatBtn" class="btn btn-primary" style="padding:0.5rem 1.1rem;">Calcular matriz</button>
          </div>
          <div id="rmMatOut" style="margin-top:0.6rem;"></div>

          <h4 style="margin:1.1rem 0 0.2rem;">Regresión lineal múltiple</h4>
          <p class="help-text" style="margin:0 0 0.4rem; font-size:0.88em;"><b>Variable dependiente</b>: lo que quieres explicar o predecir (p. ej., el puntaje general de una escala). <b>Predictores</b>: las variables que podrían explicarla (elige 1 o más con Ctrl/Cmd + clic); coloca <b>primero</b> tu predictor principal, pues sobre él se calculará el efecto crudo vs ajustado. El modelo reporta B, β, t, p, IC 95%, R², F y VIF (colinealidad).</p>
          <div style="display:flex;gap:0.8rem;flex-wrap:wrap;align-items:flex-end;">
            <div><label class="label" for="rmDep">Dependiente</label><br>
              <select id="rmDep" class="input" style="min-width:12rem;"></select></div>
            <div><label class="label" for="rmPred">Predictores (1+)</label><br>
              <select id="rmPred" class="input" multiple size="5" style="min-width:14rem;"></select></div>
            <button id="rmRegBtn" class="btn btn-primary" style="padding:0.5rem 1.1rem;">Ajustar modelo</button>
          </div>
          <div id="rmEstado" class="help-text" style="margin-top:0.5rem;"></div>
          <div id="rmRegOut" style="margin-top:0.6rem;"></div>`;
        slot.appendChild(card);
        const b1 = document.getElementById('rmMatBtn');
        if (b1) b1.addEventListener('click', () => this._onMatriz());
        const b2 = document.getElementById('rmRegBtn');
        if (b2) b2.addEventListener('click', () => this._onRegresion());
        this.actualizarSelects();
    },

    actualizarSelects() {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        const nums = (typeof obtenerColumnasNumericas === 'function' && datos.length) ? obtenerColumnasNumericas(datos) : [];
        const op = c => `<option value="${c}">${c}</option>`;
        ['rmMatVars', 'rmDep', 'rmPred'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = nums.map(op).join('');
        });
        const estado = document.getElementById('rmEstado');
        if (estado) estado.textContent = nums.length ? '' : 'Genera o carga una base de datos para habilitar el análisis.';
    },

    _sel(id) { return [...(document.getElementById(id) || { selectedOptions: [] }).selectedOptions].map(o => o.value); },
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
