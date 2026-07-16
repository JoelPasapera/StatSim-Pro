// ============================================================================
// SEM — MOTOR DE ECUACIONES ESTRUCTURALES · StatSim Pro
// ----------------------------------------------------------------------------
// Fase 1: núcleo matemático. Implementa CFA, análisis de rutas (path analysis),
// mediación y SEM completo bajo una única formulación unificada: el modelo RAM
// (Reticular Action Model; McArdle & McDonald, 1984), en el que TODA la
// estructura se expresa con tres matrices:
//
//     Σ(θ) = F · (I − A)⁻¹ · S · (I − A)⁻ᵀ · Fᵀ
//
//   · A  (asimétrica): efectos direccionales — cargas factoriales (=~) y
//         regresiones (~). A[i][j] = coeficiente de la flecha j → i.
//   · S  (simétrica) : varianzas y covarianzas — residuales, de exógenas y
//         las covarianzas libres declaradas con ~~.
//   · F  (filtro)    : selecciona las variables observadas (las latentes
//         existen en el modelo pero no en los datos).
//
// Estimación: máxima verosimilitud bajo normalidad multivariante, minimizando
//     F_ML(θ) = log|Σ(θ)| + tr(S·Σ(θ)⁻¹) − log|S| − p        (Bollen, 1989, ec. 4.60)
// con el simplex de Nelder-Mead (Nelder & Mead, 1965). Errores estándar por
// información observada: Cov(θ̂) ≈ H⁻¹, con H el hessiano numérico de
// (n−1)/2 · F_ML (Bollen, 1989, cap. 4).
//
// Índices de ajuste (con su fuente):
//   · χ² = (n−1)·F_ML                        (Bollen, 1989)
//   · CFI                                    (Bentler, 1990)
//   · TLI / NNFI                             (Tucker & Lewis, 1973)
//   · RMSEA + IC 90 % vía χ² no central      (Steiger, 1990; Browne & Cudeck, 1993)
//   · SRMR                                   (convención de Hu & Bentler, 1999)
// Identificación de escala de latentes: método del marcador (primera carga
// fijada a 1), el mismo criterio por defecto de lavaan (Rosseel, 2012).
//
// Sintaxis de modelo (subconjunto lavaan):
//   IE =~ ie1 + ie2 + ie3        // medición: latente =~ indicadores
//   rendimiento ~ IE + edad      // estructural: y ~ predictores
//   ie1 ~~ ie2                   // covarianza libre entre errores
// ============================================================================

const SEM = {

    _ultimos: [],          // historial de modelos ajustados (para comparación)

    // ═════════════════ ÁLGEBRA MATRICIAL BÁSICA ═════════════════
    _zeros(r, c) { return Array.from({ length: r }, () => new Array(c).fill(0)); },
    _eye(nn) { return Array.from({ length: nn }, (_, i) => Array.from({ length: nn }, (_, j) => i === j ? 1 : 0)); },
    _mult(X, Y) {
        const r = X.length, k = Y.length, c = Y[0].length;
        const Z = this._zeros(r, c);
        for (let i = 0; i < r; i++) for (let m = 0; m < k; m++) {
            const x = X[i][m];
            if (x === 0) continue;
            for (let j = 0; j < c; j++) Z[i][j] += x * Y[m][j];
        }
        return Z;
    },
    _traspuesta(X) { return X[0].map((_, j) => X.map(f => f[j])); },

    // Inversa y log-determinante SIMULTÁNEOS por eliminación de Gauss-Jordan con
    // pivoteo parcial. Devuelve null si la matriz no es definida (|piv| ≈ 0) —
    // señal que la optimización usa como penalización de región inadmisible.
    _invLogDet(M) {
        const nn = M.length;
        const A = M.map((f, i) => [...f, ...this._eye(nn)[i]]);
        let logDet = 0, sign = 1;
        for (let c = 0; c < nn; c++) {
            let piv = c;
            for (let r = c + 1; r < nn; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
            if (Math.abs(A[piv][c]) < 1e-12) return null;
            if (piv !== c) { [A[c], A[piv]] = [A[piv], A[c]]; sign = -sign; }
            logDet += Math.log(Math.abs(A[c][c]));
            if (A[c][c] < 0) sign = -sign;
            const d = A[c][c];
            for (let j = 0; j < 2 * nn; j++) A[c][j] /= d;
            for (let r = 0; r < nn; r++) {
                if (r === c) continue;
                const f = A[r][c];
                if (f === 0) continue;
                for (let j = 0; j < 2 * nn; j++) A[r][j] -= f * A[c][j];
            }
        }
        if (sign < 0) return null; // determinante negativo → no definida positiva
        return { inv: A.map(f => f.slice(nn)), logDet };
    },

    // ═════════════════ PARSER DE SINTAXIS (subconjunto lavaan) ═════════════════
    // Devuelve { latentes:{F1:[ind…]}, regresiones:[{y, xs:[…]}], covars:[[a,b]…] }
    parsear(sintaxis) {
        const modelo = { latentes: {}, regresiones: [], covars: [] };
        const lineas = String(sintaxis || '').split(/\n|;/).map(l => l.replace(/#.*$/, '').trim()).filter(Boolean);
        for (const l of lineas) {
            let m;
            if ((m = l.match(/^(\S+)\s*=~\s*(.+)$/))) {
                modelo.latentes[m[1]] = m[2].split('+').map(s => s.trim()).filter(Boolean);
            } else if ((m = l.match(/^(\S+)\s*~~\s*(\S+)$/))) {
                modelo.covars.push([m[1], m[2]]);
            } else if ((m = l.match(/^(\S+)\s*~\s*(.+)$/))) {
                modelo.regresiones.push({ y: m[1], xs: m[2].split('+').map(s => s.trim()).filter(Boolean) });
            } else {
                return { error: `Línea no reconocida en la sintaxis del modelo: «${l}»` };
            }
        }
        return modelo;
    },

    // ═════════════════ CONSTRUCCIÓN DEL MODELO RAM ═════════════════
    // Traduce el modelo parseado a: lista de variables (observadas + latentes),
    // plantillas de A y S con celdas fijas/libres, y el vector inicial θ₀.
    _construir(modelo, S_obs, nombresObs) {
        const latentes = Object.keys(modelo.latentes);
        const vars = [...nombresObs, ...latentes];
        const idx = Object.fromEntries(vars.map((v, i) => [v, i]));
        const nv = vars.length;
        const A = this._zeros(nv, nv);       // valores actuales
        const S = this._zeros(nv, nv);
        const libres = [];                    // [{mat:'A'|'S', i, j, nombre, ini}]
        const varMedia = nombresObs.map((_, j) => S_obs[j][j]);

        // Endógenas: las que reciben alguna flecha (indicadores o 'y' de ~).
        const endogenas = new Set();

        // 1) Medición: latente → indicadores. Primera carga fijada a 1 (marcador).
        for (const [F, inds] of Object.entries(modelo.latentes)) {
            inds.forEach((ind, k) => {
                if (!(ind in idx)) throw new Error(`El indicador «${ind}» no existe en los datos.`);
                endogenas.add(ind);
                if (k === 0) A[idx[ind]][idx[F]] = 1; // marcador (Rosseel, 2012)
                else libres.push({ mat: 'A', i: idx[ind], j: idx[F], nombre: `${F} =~ ${ind}`, ini: 0.7 });
            });
        }
        // 2) Estructural: y ~ x1 + x2…
        for (const r of modelo.regresiones) {
            if (!(r.y in idx)) throw new Error(`La variable «${r.y}» no existe.`);
            endogenas.add(r.y);
            for (const x of r.xs) {
                if (!(x in idx)) throw new Error(`El predictor «${x}» no existe.`);
                libres.push({ mat: 'A', i: idx[r.y], j: idx[x], nombre: `${r.y} ~ ${x}`, ini: 0 });
            }
        }
        // 3) S: varianzas — residual si endógena, total si exógena. Latentes
        //    exógenas: varianza libre; latentes endógenas: residual libre.
        vars.forEach((v, i) => {
            const esLat = i >= nombresObs.length;
            const base = esLat ? 0.5 : varMedia[i];
            const ini = endogenas.has(v) ? base * 0.5 : base;
            libres.push({ mat: 'S', i, j: i, nombre: endogenas.has(v) ? `var residual (${v})` : `var (${v})`, ini: Math.max(ini, 0.05) });
        });
        // 4) Covarianzas libres declaradas (~~) + covarianzas entre exógenas
        //    observadas del bloque estructural (convención lavaan: exógenas
        //    correlacionan libremente).
        const exogObs = new Set();
        modelo.regresiones.forEach(r => r.xs.forEach(x => { if (idx[x] < nombresObs.length && !endogenas.has(x)) exogObs.add(x); }));
        const exo = [...exogObs];
        for (let a = 0; a < exo.length; a++) for (let b = a + 1; b < exo.length; b++) {
            libres.push({ mat: 'S', i: idx[exo[a]], j: idx[exo[b]], nombre: `${exo[a]} ~~ ${exo[b]}`, ini: S_obs[idx[exo[a]]][idx[exo[b]]] });
        }
        // Latentes exógenas múltiples: correlación libre entre factores (CFA estándar).
        const latExo = latentes.filter(F => !endogenas.has(F));
        for (let a = 0; a < latExo.length; a++) for (let b = a + 1; b < latExo.length; b++) {
            libres.push({ mat: 'S', i: idx[latExo[a]], j: idx[latExo[b]], nombre: `${latExo[a]} ~~ ${latExo[b]}`, ini: 0.2 });
        }
        for (const [a, b] of modelo.covars) {
            if (!(a in idx) || !(b in idx)) throw new Error(`Covarianza ~~ con variable inexistente (${a}, ${b}).`);
            libres.push({ mat: 'S', i: idx[a], j: idx[b], nombre: `${a} ~~ ${b}`, ini: 0.1 });
        }
        return { vars, idx, nObs: nombresObs.length, A, S, libres, latentes };
    },

    // Σ(θ) del modelo RAM: aplica θ a las plantillas y computa la implicada.
    _sigma(est, theta) {
        const nv = est.vars.length;
        const A = est.A.map(f => [...f]);
        const S = est.S.map(f => [...f]);
        est.libres.forEach((p, k) => {
            if (p.mat === 'A') A[p.i][p.j] = theta[k];
            else { S[p.i][p.j] = theta[k]; S[p.j][p.i] = theta[k]; }
        });
        const ImA = this._eye(nv).map((f, i) => f.map((v, j) => v - A[i][j]));
        const inv = this._invLogDet(ImA);
        if (!inv) return null;
        const B = inv.inv;                                    // (I−A)⁻¹
        const T = this._mult(this._mult(B, S), this._traspuesta(B));
        // Filtro F: primeras nObs filas/columnas (observadas primero por construcción).
        const p = est.nObs;
        const Sig = this._zeros(p, p);
        for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) Sig[i][j] = T[i][j];
        return Sig;
    },

    // F_ML(θ) — discrepancia de máxima verosimilitud (Bollen, 1989, ec. 4.60).
    _fml(est, theta, S_obs, logDetS) {
        const Sig = this._sigma(est, theta);
        if (!Sig) return 1e10;
        const il = this._invLogDet(Sig);
        if (!il) return 1e10;
        let tr = 0;
        const p = est.nObs;
        for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) tr += S_obs[i][j] * il.inv[j][i];
        const f = il.logDet + tr - logDetS - p;
        return Number.isFinite(f) ? Math.max(f, 0) : 1e10;
    },

    // ═════════════════ OPTIMIZADOR: NELDER-MEAD ═════════════════
    // (Nelder & Mead, 1965) con reinicio del simplex. Sin gradientes: robusto
    // ante las penalizaciones de región no admisible de F_ML.
    _nelderMead(f, x0, opciones = {}) {
        const maxIter = opciones.maxIter || 4000, tol = opciones.tol || 1e-10;
        const n = x0.length;
        let simplex = [x0.slice()];
        for (let i = 0; i < n; i++) {
            const x = x0.slice();
            x[i] += (Math.abs(x[i]) > 0.1 ? 0.1 * Math.abs(x[i]) : 0.1);
            simplex.push(x);
        }
        let fx = simplex.map(f);
        const orden = () => {
            const ix = fx.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
            simplex = ix.map(i => simplex[i]); fx = ix.map(i => fx[i]);
        };
        for (let it = 0; it < maxIter; it++) {
            orden();
            if (Math.abs(fx[n] - fx[0]) < tol * (Math.abs(fx[0]) + tol)) {
                if (opciones._reiniciado) break;
                // Reinicio: nuevo simplex alrededor del mejor punto (escapa mesetas).
                const mejor = simplex[0].slice();
                simplex = [mejor];
                for (let i = 0; i < n; i++) { const x = mejor.slice(); x[i] += 0.02 * (Math.abs(x[i]) + 0.1); simplex.push(x); }
                fx = simplex.map(f);
                opciones._reiniciado = true;
                continue;
            }
            const centro = new Array(n).fill(0);
            for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) centro[k] += simplex[i][k] / n;
            const refl = centro.map((c, k) => c + (c - simplex[n][k]));
            const fr = f(refl);
            if (fr < fx[0]) {
                const exp = centro.map((c, k) => c + 2 * (c - simplex[n][k]));
                const fe = f(exp);
                if (fe < fr) { simplex[n] = exp; fx[n] = fe; } else { simplex[n] = refl; fx[n] = fr; }
            } else if (fr < fx[n - 1]) {
                simplex[n] = refl; fx[n] = fr;
            } else {
                const con = centro.map((c, k) => c + 0.5 * (simplex[n][k] - c));
                const fc = f(con);
                if (fc < fx[n]) { simplex[n] = con; fx[n] = fc; }
                else for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((v, k) => simplex[0][k] + 0.5 * (v - simplex[0][k])); fx[i] = f(simplex[i]); }
            }
        }
        orden();
        return { x: simplex[0], f: fx[0] };
    },

    // ═════════════════ INFERENCIA: SE, χ², ÍNDICES ═════════════════
    // Hessiano numérico (diferencias centrales) de L(θ) = (n−1)/2 · F_ML.
    _errores(est, theta, S_obs, logDetS, n) {
        const k = theta.length;
        const L = t => ((n - 1) / 2) * this._fml(est, t, S_obs, logDetS);
        const h = theta.map(t => Math.max(1e-4, 1e-3 * Math.abs(t)));
        const H = this._zeros(k, k);
        const L0 = L(theta);
        for (let i = 0; i < k; i++) for (let j = i; j < k; j++) {
            const tpp = theta.slice(), tpm = theta.slice(), tmp = theta.slice(), tmm = theta.slice();
            tpp[i] += h[i]; tpp[j] += h[j];
            tpm[i] += h[i]; tpm[j] -= h[j];
            tmp[i] -= h[i]; tmp[j] += h[j];
            tmm[i] -= h[i]; tmm[j] -= h[j];
            H[i][j] = H[j][i] = (L(tpp) - L(tpm) - L(tmp) + L(tmm)) / (4 * h[i] * h[j]);
        }
        const il = this._invLogDet(H);
        if (!il) return theta.map(() => NaN);
        return theta.map((_, i) => il.inv[i][i] > 0 ? Math.sqrt(il.inv[i][i]) : NaN);
    },

    // CDF de χ² no central por mezcla de Poisson (Johnson, Kotz & Balakrishnan,
    // 1995) — para el IC 90 % del RMSEA (Browne & Cudeck, 1993).
    _pChi2NC(x, df, ncp) {
        if (ncp <= 0) return (typeof ComparacionGrupos !== 'undefined') ? 1 - ComparacionGrupos._pChi2(x, df) : NaN;
        let suma = 0, w = Math.exp(-ncp / 2);
        for (let j = 0; j < 400; j++) {
            if (j > 0) w *= (ncp / 2) / j;
            suma += w * (1 - ComparacionGrupos._pChi2(x, df + 2 * j));
            if (w < 1e-14 && j > ncp) break;
        }
        return suma;
    },
    // Búsqueda del ncp tal que P(χ²_nc(df,ncp) ≤ chi2) = objetivo.
    _ncpPara(chi2, df, objetivo) {
        let lo = 0, hi = Math.max(chi2 * 3, 50);
        while (this._pChi2NC(chi2, df, hi) > objetivo && hi < 1e6) hi *= 2;
        for (let i = 0; i < 100; i++) {
            const mid = (lo + hi) / 2;
            if (this._pChi2NC(chi2, df, mid) > objetivo) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
    },

    // ═════════════════ API PRINCIPAL ═════════════════
    /**
     * Ajusta un modelo SEM/CFA/path por máxima verosimilitud.
     * @param {string} sintaxis  Modelo en sintaxis estilo lavaan.
     * @param {string[]} columnas  Variables observadas a usar (o null → inferir).
     * @param {string} etiquetaModelo  Nombre para el historial de comparación.
     */
    ajustar(sintaxis, columnas = null, etiquetaModelo = 'Modelo') {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        const modelo = this.parsear(sintaxis);
        if (modelo.error) return modelo;

        // Variables observadas del modelo (todas las mencionadas que no sean latentes).
        const latentes = new Set(Object.keys(modelo.latentes));
        const mencionadas = new Set();
        Object.values(modelo.latentes).forEach(inds => inds.forEach(i => mencionadas.add(i)));
        modelo.regresiones.forEach(r => { if (!latentes.has(r.y)) mencionadas.add(r.y); r.xs.forEach(x => { if (!latentes.has(x)) mencionadas.add(x); }); });
        modelo.covars.forEach(([a, b]) => { if (!latentes.has(a)) mencionadas.add(a); if (!latentes.has(b)) mencionadas.add(b); });
        const nombresObs = columnas || [...mencionadas];
        if (!nombresObs.length) return { error: 'El modelo no menciona ninguna variable observada.' };

        // Casos completos y matriz de covarianzas muestral (divisor n−1; Bollen, 1989).
        const filas = datos.map(d => nombresObs.map(c => +d[c])).filter(f => f.every(Number.isFinite));
        const n = filas.length, p = nombresObs.length;
        if (n < p + 5) return { error: `Casos insuficientes (${n}) para ${p} variables observadas.` };
        const medias = nombresObs.map((_, j) => filas.reduce((s, f) => s + f[j], 0) / n);
        const S_obs = this._zeros(p, p);
        filas.forEach(f => { for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) S_obs[i][j] += (f[i] - medias[i]) * (f[j] - medias[j]); });
        for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) S_obs[i][j] /= (n - 1);
        const ilS = this._invLogDet(S_obs);
        if (!ilS) return { error: 'La matriz de covarianzas muestral es singular: hay variables redundantes.' };

        // Construcción RAM, identificación mínima y optimización.
        let est;
        try { est = this._construir(modelo, S_obs, nombresObs); }
        catch (e) { return { error: e.message }; }
        const q = est.libres.length;
        const gl = p * (p + 1) / 2 - q;
        if (gl < 0) return { error: `Modelo no identificado: ${q} parámetros libres frente a ${p * (p + 1) / 2} momentos muestrales (gl = ${gl}). Simplifica el modelo o añade indicadores.` };

        const f = t => this._fml(est, t, S_obs, ilS.logDet);
        const theta0 = est.libres.map(pl => pl.ini);
        const opt = this._nelderMead(f, theta0, { maxIter: 6000 });
        const theta = opt.x, Fmin = opt.f;

        // χ², p, índices — con el modelo de independencia como línea base.
        const chi2 = (n - 1) * Fmin;
        const pChi2 = gl > 0 ? ((typeof ComparacionGrupos !== 'undefined') ? ComparacionGrupos._pChi2(chi2, gl) : NaN) : NaN;
        // Línea base: solo varianzas (F_b tiene forma cerrada: log|diag(S)|−log|S|).
        let logDiag = 0;
        for (let i = 0; i < p; i++) logDiag += Math.log(S_obs[i][i]);
        const Fb = logDiag - ilS.logDet;
        const chi2b = (n - 1) * Fb, glb = p * (p - 1) / 2;
        const CFI = 1 - Math.max(chi2 - gl, 0) / Math.max(chi2b - glb, chi2 - gl, 1e-12);
        const TLI = glb > 0 && gl > 0 ? ((chi2b / glb) - (chi2 / gl)) / ((chi2b / glb) - 1) : NaN;
        const RMSEA = gl > 0 ? Math.sqrt(Math.max(chi2 - gl, 0) / (gl * (n - 1))) : 0;
        // IC 90 % del RMSEA (Browne & Cudeck, 1993): ncp tal que la CDF no
        // central deje 0.95 / 0.05 a la izquierda del χ² observado.
        let rmseaIC = [NaN, NaN];
        if (gl > 0 && typeof ComparacionGrupos !== 'undefined') {
            const ncpHi = this._ncpPara(chi2, gl, 0.05);
            const ncpLo = this._pChi2NC(chi2, gl, 0) < 0.95 ? 0 : this._ncpPara(chi2, gl, 0.95);
            rmseaIC = [Math.sqrt(ncpLo / (gl * (n - 1))), Math.sqrt(ncpHi / (gl * (n - 1)))];
        }
        // SRMR: raíz del promedio de residuos de correlación al cuadrado (Hu & Bentler, 1999).
        const SigF = this._sigma(est, theta);
        let srmrSum = 0, srmrK = 0;
        for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) {
            const rObs = S_obs[i][j] / Math.sqrt(S_obs[i][i] * S_obs[j][j]);
            const rMod = SigF[i][j] / Math.sqrt(SigF[i][i] * SigF[j][j]);
            srmrSum += (rObs - rMod) ** 2; srmrK++;
        }
        const SRMR = Math.sqrt(srmrSum / srmrK);

        // Errores estándar, z y p por parámetro.
        const se = this._errores(est, theta, S_obs, ilS.logDet, n);
        const parametros = est.libres.map((pl, k) => {
            const z = theta[k] / se[k];
            return { nombre: pl.nombre, tipo: pl.mat === 'A' ? 'coeficiente' : 'var/cov',
                     estimado: theta[k], se: se[k], z,
                     pValor: Number.isFinite(z) && typeof ComparacionGrupos !== 'undefined'
                         ? 2 * (1 - ComparacionGrupos._phi(Math.abs(z))) : NaN };
        });

        const R = { sintaxis, etiquetaModelo, n, p, q, gl, Fmin, chi2, pChi2,
                    chi2b, glb, CFI, TLI, RMSEA, rmseaIC, SRMR,
                    parametros, vars: est.vars, latentes: est.latentes,
                    convergio: Fmin < 1e9, S_obs, nombresObs };
        this._ultimos.push(R);
        if (this._ultimos.length > 5) this._ultimos.shift();
        return R;
    }
};

if (typeof window !== 'undefined') window.SEM = SEM;
