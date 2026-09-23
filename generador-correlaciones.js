// ============================================================================
// generador-correlaciones.js — matriz objetivo, modelos (mediación, moderación, curvilínea), drivers exactos, calibración de correlaciones
// Métodos de GeneradorDatos añadidos al prototipo (misma semántica que en la clase).
// ============================================================================
Object.assign(GeneradorDatos.prototype, {
    prepararCorrelaciones() {
        const variables = [];

        this.configuracion.pruebas.forEach(prueba => {
            variables.push({ tipo: 'escala', clave: this._claveEscala(prueba), nombre: prueba.nombre });
        });

        this.configuracion.sociodemograficos.forEach(socio => {
            if (socio.distribucion === 'normal' || socio.distribucion === 'asimetrica') {
                variables.push({ tipo: 'socio', clave: socio.categoriaCorta, nombre: socio.categoria });
            }
        });

        const indicePorNombre = {};
        variables.forEach((v, i) => { indicePorNombre[v.nombre] = i; });

        const m = variables.length;
        const R = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? 1 : 0)));

        const grupos = this.configuracion.gruposPruebas || [];
        const porSigla = {};
        this.configuracion.pruebas.forEach(p => { if (!p.sufijo) porSigla[p.nombreCorto] = p; });
        const explicitas = new Set();
        const fijar = (i, j, r, explicita) => {
            if (i === undefined || j === undefined || i === j) return;
            const k = i < j ? `${i}|${j}` : `${j}|${i}`;
            if (explicitas.has(k)) return;
            if (explicita) explicitas.add(k);
            const rF = Math.max(-0.99, Math.min(0.99, r));
            R[i][j] = rF; R[j][i] = rF;
        };
        const infoGeneral = {};
        grupos.forEach(g => {
            if (g.escalas.length < 2) return;
            const idx = g.escalas.map(s => indicePorNombre[(porSigla[s] || {}).nombre]).filter(i => i !== undefined);
            if (idx.length < 2) return;
            const de = idx.map(i => (porSigla[variables[i].clave] || {}).desviacion || 1);
            infoGeneral[this.nombreGeneral(g)] = { idx, de, rIntra: (g.rIntra === undefined ? 0.40 : g.rIntra) };
        });
        // (B6) Las correlaciones que IMPLICAN los modelos de mediación van
        // delante de la tabla III: mandan sobre cualquier pareja repetida.
        const correlacionesEfectivas = this._correlacionesImplicadasPorMediacion().concat(this.configuracion.correlaciones || []);
        this.correlacionesEfectivas = correlacionesEfectivas;
        correlacionesEfectivas.forEach(({ a, b, r }) => {
            const i = indicePorNombre[a], j = indicePorNombre[b];
            if (i !== undefined && j !== undefined) fijar(i, j, r, true);
        });
        Object.values(infoGeneral).forEach(info => {
            for (let a = 0; a < info.idx.length; a++) for (let b = a + 1; b < info.idx.length; b++)
                fijar(info.idx[a], info.idx[b], info.rIntra, false);
        });
        const varianzaG = info => {
            let v = 0;
            for (let a = 0; a < info.idx.length; a++) for (let b = 0; b < info.idx.length; b++)
                v += info.de[a] * info.de[b] * (a === b ? 1 : R[info.idx[a]][info.idx[b]]);
            return v;
        };
        const sumaDE = info => info.de.reduce((s, x) => s + x, 0);
        // Reparto exacto: corr(G,Y) = Σ DE_i·r_iY / √Var(G). Las parejas ya
        // fijadas explícitamente se DESCUENTAN y el resto se reparte entre las
        // dimensiones libres, de modo que el objetivo sobre el General se cumpla.
        const esExplicita = (i, j) => explicitas.has(i < j ? `${i}|${j}` : `${j}|${i}`);
        const repartir = (pares, objetivoCov) => {
            // pares: [{i, j, peso}] ; objetivoCov = Σ peso·r_ij deseado
            let fijado = 0, pesoLibre = 0;
            pares.forEach(p => {
                if (p.i === p.j) fijado += p.peso;                                   // General ↔ su propia dimensión: r(D, D) = 1
                else if (esExplicita(p.i, p.j)) fijado += p.peso * R[p.i][p.j];
                else pesoLibre += p.peso;
            });
            if (pesoLibre <= 0) return;
            const rho = (objetivoCov - fijado) / pesoLibre;
            pares.forEach(p => { if (!esExplicita(p.i, p.j)) fijar(p.i, p.j, rho, false); });
        };
        correlacionesEfectivas.forEach(({ a, b, r }) => {
            const gA = infoGeneral[a], gB = infoGeneral[b];
            const iA = indicePorNombre[a], iB = indicePorNombre[b];
            const rF = Math.max(-0.99, Math.min(0.99, r));
            if (gA && gB && a !== b) {
                const pares = [];
                gA.idx.forEach((i, ai) => gB.idx.forEach((j, bj) => pares.push({ i, j, peso: gA.de[ai] * gB.de[bj] })));
                repartir(pares, rF * Math.sqrt(varianzaG(gA) * varianzaG(gB)));
            } else if (gA && iB !== undefined) {
                repartir(gA.idx.map((i, ai) => ({ i, j: iB, peso: gA.de[ai] })), rF * Math.sqrt(varianzaG(gA)));
            } else if (gB && iA !== undefined) {
                repartir(gB.idx.map((j, bj) => ({ i: iA, j, peso: gB.de[bj] })), rF * Math.sqrt(varianzaG(gB)));
            }
        });
        // (B6) Moderación: Y = β₁X + β₂W + β₃·X·W + e. Sus correlaciones con X y W
        // las FIJAN los coeficientes: r(X,Y) = β₁ + β₂·ρ, r(W,Y) = β₂ + β₁·ρ, con
        // ρ = r(X,W) tal como quedó en la matriz (tabla III, relleno intra-test o 0).
        this.modelosModeracion = [];
        (this.configuracion.modelos || []).filter(md => md.tipo === 'moderacion' || md.tipo === 'curvilinea').forEach(mdCfg => {
            // (C6) la curvilínea es la moderación con W = X: z_Y = β₁·x̃ + β₂·(x̃² − 1) + c·e
            // (b2 = 0, b3 = β₂, ρ = 1); solo fija r(X,Y) = β₁
            const md = mdCfg.tipo === 'curvilinea' ? { tipo: 'curvilinea', x: mdCfg.x, m: mdCfg.x, y: mdCfg.y, c1: mdCfg.c1, c2: 0, c3: mdCfg.c2 } : mdCfg;
            const iX = indicePorNombre[md.x], iW = indicePorNombre[md.m], iY = indicePorNombre[md.y];
            const distintos = md.tipo === 'curvilinea' ? (iX !== undefined && iY !== undefined && iX !== iY) : (iX !== undefined && iW !== undefined && iY !== undefined && new Set([iX, iW, iY]).size === 3);
            if (!distintos) return;
            const rho = md.tipo === 'curvilinea' ? 1 : R[iX][iW];
            const r2 = md.c1 * md.c1 + md.c2 * md.c2 + 2 * md.c1 * md.c2 * rho + md.c3 * md.c3 * (1 + rho * rho);
            if (!(r2 < 0.98)) return;   // la validación ya lo habrá rechazado
            const rXY = Math.max(-0.99, Math.min(0.99, md.c1 + md.c2 * rho)), rWY = Math.max(-0.99, Math.min(0.99, md.c2 + md.c1 * rho));
            R[iX][iY] = R[iY][iX] = rXY;
            if (md.tipo !== 'curvilinea') { R[iW][iY] = R[iY][iW] = rWY; }
            // Modo NO exacto: la composición por fila usa los drivers ya con su
            // FORMA (lo que verá el analista, salvo recorte y redondeo); la
            // varianza del producto x̃·w̃ se estima por simulación porque con
            // formas no normales no vale 1 + ρ².
            const forma = (indice) => {
                const v = variables[indice];
                if (v.tipo === 'escala') { const p = this.configuracion.pruebas.find(x => this._claveEscala(x) === v.clave); const dist = p ? p.distribucion : 'normal'; return z => this.transformarFormaZ(z, dist); }
                const s = this.configuracion.sociodemograficos.find(x => x.categoriaCorta === v.clave);
                return z => this._formaSocioEstandar(s, z, this._factorDE(s.categoria));
            };
            const tx = forma(iX), tw = forma(iW);
            let sumaP = 0, sumaP2 = 0;
            const nSim = 3000;
            for (let k = 0; k < nSim; k++) {
                const z1 = this.generarNormalEstandar(), z2 = rho * z1 + Math.sqrt(1 - rho * rho) * this.generarNormalEstandar();
                const pr = tx(z1) * tw(z2); sumaP += pr; sumaP2 += pr * pr;
            }
            const mediaP = sumaP / nSim, varProducto = Math.max(0.05, sumaP2 / nSim - mediaP * mediaP);
            const r2Forma = md.c1 * md.c1 + md.c2 * md.c2 + 2 * md.c1 * md.c2 * mediaP + md.c3 * md.c3 * varProducto;
            this.modelosModeracion.push({ tipo: md.tipo, iX, iW, iY, b1: md.c1, b2: md.c2, b3: md.c3, rho, r2, x: md.x, w: md.m, y: md.y, tx, tw, mediaProducto: mediaP, r2Forma: Math.min(0.98, r2Forma) });
        });
        // (C6, revisión) los criterios encadenados se componen en orden de dependencia:
        // si la X (o W) de un modelo es el criterio de otro, ese otro va primero
        if (this.modelosModeracion.length > 1) {
            const lista = this.modelosModeracion.slice(), ordenada = [], hechos = new Set();
            let guard = 0;
            while (lista.length && guard++ < 50) {
                const listo = lista.findIndex(md => !lista.some(o => o !== md && (o.iY === md.iX || o.iY === md.iW)));
                const k = listo >= 0 ? listo : 0;   // ciclo: se respeta el orden dado
                ordenada.push(lista[k]); lista.splice(k, 1);
            }
            this.modelosModeracion = ordenada.concat(lista);
        }
        this.matrizForzada = false;
        this.correlVariables = variables;
        this.diagnosticoCorrelaciones = m > 0 ? this.diagnosticarMatriz(R, variables.map(v => v.nombre)) : { imposible: false, triadas: [], ajustes: [], R };
        this.correlR = this.diagnosticoCorrelaciones.R;
        // Las correlaciones pedidas sobre un General derivado no se factorizan:
        // se reparten entre sus dimensiones. Si el reparto no puede alcanzarlas
        // (p. ej. General ↔ una de sus propias dimensiones, cuya correlación
        // parte–todo viene casi fijada por la estructura), se informa la
        // implicada por la matriz final.
        const limitadasGeneral = [];
        const Rf = this.correlR;
        const covG = (info, j) => { let s = 0; info.idx.forEach((i, ai) => { s += info.de[ai] * (i === j ? 1 : Rf[i][j]); }); return s; };
        const varG = info => { let v = 0; info.idx.forEach((i, ai) => info.idx.forEach((j, bj) => { v += info.de[ai] * info.de[bj] * (i === j ? 1 : Rf[i][j]); })); return v; };
        correlacionesEfectivas.forEach(({ a, b, r }) => {
            const gA = infoGeneral[a], gB = infoGeneral[b];
            if (!gA && !gB) return;
            let implicada = null;
            if (gA && gB && a !== b) { let c = 0; gA.idx.forEach((i, ai) => gB.idx.forEach((j, bj) => { c += gA.de[ai] * gB.de[bj] * (i === j ? 1 : Rf[i][j]); })); implicada = c / Math.sqrt(varG(gA) * varG(gB)); }
            else if (gA && indicePorNombre[b] !== undefined) implicada = covG(gA, indicePorNombre[b]) / Math.sqrt(varG(gA));
            else if (gB && indicePorNombre[a] !== undefined) implicada = covG(gB, indicePorNombre[a]) / Math.sqrt(varG(gB));
            if (implicada !== null && isFinite(implicada) && Math.abs(implicada - r) > 0.01) limitadasGeneral.push({ a, b, pedido: r, alcanzable: implicada });
        });
        // Lo que se factoriza NO es la matriz pedida sino la INTERMEDIA: la que,
        // tras la DE intra-grupo, la covarianza entre grupos (A1) y las formas
        // no normales (A2), produce en la base exactamente la r pedida.
        const inter = this._matrizIntermedia(this.correlR, variables);
        this.correlRIntermedia = inter.R;
        this.diagnosticoCorrelaciones.limitadas = limitadasGeneral.concat(inter.limitadas);
        this.diagnosticoCorrelaciones.intermediaAjustada = inter.ajustada;
        this.correlL = m > 0 ? this.descomposicionCholesky(this.correlRIntermedia) : [];
        if (inter.ajustada) console.warn('[Generador] La matriz intermedia no era definida positiva: se usó la válida más cercana.');
        if (this.diagnosticoCorrelaciones.imposible) console.warn('[Generador] Correlaciones incompatibles: se usó la matriz válida más cercana.', this.diagnosticoCorrelaciones);
    },

    // ============ MODELOS ESTRUCTURALES (B6) ============
    // MEDIACIÓN X → M → Y con coeficientes estandarizados a (X→M), b (M→Y|X) y
    // c′ (X→Y|M). Es un modelo lineal: equivale exactamente a una matriz de
    // correlaciones, así que se traduce a correlaciones y el resto del motor
    // (exactitud, formas, grupos) la trata como a las de la tabla III:
    //   r(X,M) = a · r(X,Y) = c′ + a·b · r(M,Y) = b + a·c′
    // Con varios mediadores sobre el mismo par (X,Y) — mediación paralela — se
    // suponen residuos incorrelados: r(Mi,Mj) = ai·aj (salvo pareja explícita),
    // r(Mi,Y) = bi + ai·c′ + Σ_{j≠i} bj·r(Mi,Mj), r(X,Y) = c′ + Σ ai·bi.
    _correlacionesImplicadasPorMediacion() {
        const cfg = this.configuracion, salida = [];
        const par = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
        const explicitas = new Map((cfg.correlaciones || []).map(c => [par(c.a, c.b), c.r]));
        const grupos = new Map();   // par(X,Y) → { x, y, cprima, mediadores: [{m, a, b}] }
        (cfg.modelos || []).filter(md => md.tipo === 'mediacion').forEach(md => {
            if (new Set([md.x, md.m, md.y]).size < 3) return;
            const clave = par(md.x, md.y);
            if (!grupos.has(clave)) grupos.set(clave, { x: md.x, y: md.y, cprima: md.c3, mediadores: [] });
            const g = grupos.get(clave);
            if (g.mediadores.some(q => q.m === md.m)) return;   // mediador repetido: manda el primero
            g.mediadores.push({ m: md.m, a: md.c1, b: md.c2 });
        });
        grupos.forEach(g => {
            const rMM = (i, j) => { const k = par(g.mediadores[i].m, g.mediadores[j].m); return explicitas.has(k) ? explicitas.get(k) : g.mediadores[i].a * g.mediadores[j].a; };
            g.mediadores.forEach((q, i) => {
                salida.push({ a: g.x, b: q.m, r: q.a, origen: 'mediación' });
                let rMY = q.b + q.a * g.cprima;
                g.mediadores.forEach((p, j) => { if (j !== i) rMY += p.b * rMM(i, j); });
                salida.push({ a: q.m, b: g.y, r: rMY, origen: 'mediación' });
                for (let j = i + 1; j < g.mediadores.length; j++) {
                    const k = par(q.m, g.mediadores[j].m);
                    if (!explicitas.has(k)) salida.push({ a: q.m, b: g.mediadores[j].m, r: rMM(i, j), origen: 'mediación' });
                }
            });
            salida.push({ a: g.x, b: g.y, r: g.cprima + g.mediadores.reduce((s, q) => s + q.a * q.b, 0), origen: 'mediación' });
        });
        return salida;
    },

    // Correlaciones implicadas por TODOS los modelos: las de mediación más las
    // que fija una moderación (r(X,Y) = β₁ + β₂ρ, r(W,Y) = β₂ + β₁ρ, con ρ el
    // r(X,W) de la tabla III, el intra-test si comparten test, o 0). Es lo que
    // usan la DE del General (_factorGeneral) y la expansión de ondas.
    _correlacionesImplicadasPorModelos() {
        const cfg = this.configuracion;
        const salida = this._correlacionesImplicadasPorMediacion();
        const par = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
        const explicitas = new Map((cfg.correlaciones || []).map(c => [par(c.a, c.b), c.r]));
        const rEntre = (a, b) => {
            const k = par(a, b);
            if (explicitas.has(k)) return explicitas.get(k);
            const imp = salida.find(c => par(c.a, c.b) === k);
            if (imp) return imp.r;
            const pa = (cfg.pruebas || []).find(p => p.nombre === a && !p.sufijo), pb = (cfg.pruebas || []).find(p => p.nombre === b && !p.sufijo);
            if (pa && pb && pa.prueba && pa.prueba === pb.prueba) { const g = (cfg.gruposPruebas || []).find(x => x.nombre === pa.prueba); return g && g.rIntra !== undefined ? g.rIntra : 0.40; }
            return 0;
        };
        (cfg.modelos || []).filter(md => md.tipo === 'moderacion').forEach(md => {
            if (new Set([md.x, md.m, md.y]).size < 3) return;
            const rho = rEntre(md.x, md.m);
            salida.push({ a: md.x, b: md.y, r: Math.max(-0.99, Math.min(0.99, md.c1 + md.c2 * rho)), origen: 'moderación' });
            salida.push({ a: md.m, b: md.y, r: Math.max(-0.99, Math.min(0.99, md.c2 + md.c1 * rho)), origen: 'moderación' });
        });
        // (C6) curvilínea: con X simétrica, X² es incorrelada con X ⇒ r(X,Y) = β₁
        (cfg.modelos || []).filter(md => md.tipo === 'curvilinea' && md.x !== md.y).forEach(md => salida.push({ a: md.x, b: md.y, r: Math.max(-0.99, Math.min(0.99, md.c1)), origen: 'curvilínea' }));
        return salida;
    },

    // Pares fijados por algún modelo (la tabla III no manda sobre ellos).
    _paresFijadosPorModelos() {
        const par = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
        const pares = new Set();
        this._correlacionesImplicadasPorMediacion().forEach(c => pares.add(par(c.a, c.b)));
        (this.configuracion.modelos || []).filter(md => md.tipo === 'moderacion').forEach(md => { pares.add(par(md.x, md.y)); pares.add(par(md.m, md.y)); });
        (this.configuracion.modelos || []).filter(md => md.tipo === 'curvilinea').forEach(md => pares.add(par(md.x, md.y)));
        return pares;
    },

    // MODERACIÓN: el driver de Y se compone en el espacio normal de los drivers,
    //   z_Y = β₁·z_X + β₂·z_W + β₃·(z_X·z_W − ρ) + √(1 − R²)·e_Y,
    // con R² = β₁² + β₂² + 2β₁β₂ρ + β₃²(1 + ρ²), de modo que Var(z_Y) = 1 y el
    // término de interacción queda incorrelado con X y W (normales centradas).
    // e_Y es el driver «propio» de Y que sale del Cholesky: en la matriz
    // intermedia la fila de Y es la de ESE residuo (ver _aResidualModeracion).
    _aplicarModeracion(fila) {
        const modelos = this.modelosModeracion;
        if (!modelos || !modelos.length) return fila;
        for (let k = 0; k < modelos.length; k++) {
            const md = modelos[k];
            const zx = md.tx ? md.tx(fila[md.iX]) : fila[md.iX], zw = md.tw ? md.tw(fila[md.iW]) : fila[md.iW];
            const s = this._factorDE(md.y) || 1;   // criterio con grupos: β sobre la parte intra (ver _componerCriterio)
            const b1 = md.b1 / s, b2 = md.b2 / s, b3 = md.b3 / s;
            const r2 = Math.min(0.98, (md.r2Forma !== undefined ? md.r2Forma : md.r2) / (s * s)), mediaP = md.mediaProducto !== undefined ? md.mediaProducto : md.rho;
            fila[md.iY] = b1 * zx + b2 * zw + b3 * (zx * zw - mediaP) + Math.sqrt(Math.max(0, 1 - r2)) * fila[md.iY];
        }
        return fila;
    },

    // Pasa la fila/columna de cada criterio de moderación de la matriz OBJETIVO
    // (Pearson entre variables finales) al espacio de su residuo e_Y:
    //   r(e_Y, V) = (r(Y,V) − β₁·r(X,V) − β₂·r(W,V)) / √(1 − R²),  r(e_Y, X) = r(e_Y, W) = 0.
    _aResidualModeracion(R) {
        const modelos = this.modelosModeracion;
        if (!modelos || !modelos.length) return R;
        const S = R.map(f => f.slice());
        const m = S.length;
        modelos.forEach(md => {
            const escala = 1 / Math.sqrt(Math.max(1e-6, 1 - md.r2));
            for (let v = 0; v < m; v++) {
                if (v === md.iY) continue;
                const r = (v === md.iX || v === md.iW) ? 0 : Math.max(-0.99, Math.min(0.99, (S[md.iY][v] - md.b1 * S[md.iX][v] - md.b2 * S[md.iW][v]) * escala));
                S[md.iY][v] = S[v][md.iY] = r;
            }
        });
        return S;
    },

    // ============ CORRELACIÓN INTERMEDIA (Vale–Maurelli + grupos) ============
    // La r pedida es de Pearson sobre las variables FINALES de toda la base. El
    // driver es normal y solo gobierna la parte intra-grupo, y las formas
    // «asimétrica» (log-normal) y «uniforme» lo transforman de manera monótona
    // pero no lineal, lo que atenúa la r de Pearson (0.60 salía 0.56 entre dos
    // asimétricas). Para cada pareja: (1) se descuenta la varianza y la
    // covarianza entre grupos, r_ij = s_i·s_j·ρ_ij + b_ij; (2) se invierte la
    // forma, ρ* = T⁻¹(ρ_ij). Es la matriz de ρ* la que se factoriza.
    _formaMarginal(variable) {
        if (variable.tipo === 'escala') {
            const p = (this.configuracion.pruebas || []).find(x => this._claveEscala(x) === variable.clave);
            const dist = p ? p.distribucion : 'normal';
            if (dist === 'asimetrica') return { forma: 'lognormal', orden: 2, sigma: SIGMA_FORMA_ASIMETRICA };
            if (dist === 'uniforme') return { forma: 'uniforme', orden: 1, sigma: 0 };
            return { forma: 'normal', orden: 0, sigma: 0 };
        }
        const s = (this.configuracion.sociodemograficos || []).find(x => x.categoriaCorta === variable.clave);
        if (s && s.distribucion === 'asimetrica') {
            // misma σ que generarAsimetrico con la DE intra-grupo: σ² = ln(1 + DE²/M²)
            const m = Math.max(1e-6, s.promedio), de = s.desviacion * this._factorDE(s.categoria);
            return { forma: 'lognormal', orden: 2, sigma: Math.sqrt(Math.log(1 + (de * de) / (m * m))) };
        }
        return { forma: 'normal', orden: 0, sigma: 0 };
    },

    // Pearson entre T_a(Z₁) y T_b(Z₂) cuando corr(Z₁, Z₂) = ρ, para las formas del
    // generador (normal: z; uniforme: Φ(z); log-normal: e^{σz}). Todas cerradas
    // (lema de Stein e inclinación exponencial):
    //   N–N: ρ · U–U: (6/π)·asen(ρ/2) · N–U: ρ·√(3/π) · N–LN: ρ·σ/√(e^{σ²}−1)
    //   U–LN: (Φ(ρσ/√2) − ½)·√12/√(e^{σ²}−1) · LN–LN: (e^{σₐσᵦρ} − 1)/√((e^{σₐ²}−1)(e^{σᵦ²}−1))
    _rTransformada(fa, fb, rho) {
        const [x, y] = fa.orden <= fb.orden ? [fa, fb] : [fb, fa];
        switch (x.forma + '-' + y.forma) {
            case 'normal-normal': return rho;
            case 'normal-uniforme': return rho * Math.sqrt(3 / Math.PI);
            case 'uniforme-uniforme': return (6 / Math.PI) * Math.asin(rho / 2);
            case 'normal-lognormal': return rho * y.sigma / Math.sqrt(Math.expm1(y.sigma * y.sigma));
            case 'uniforme-lognormal': return (this.normalCDF(rho * y.sigma / Math.SQRT2) - 0.5) * Math.sqrt(12) / Math.sqrt(Math.expm1(y.sigma * y.sigma));
            case 'lognormal-lognormal': return Math.expm1(x.sigma * y.sigma * rho) / Math.sqrt(Math.expm1(x.sigma * x.sigma) * Math.expm1(y.sigma * y.sigma));
        }
        return rho;
    },

    // Inversa de la anterior: ρ del espacio normal que produce la Pearson r. Si
    // r no es alcanzable con esas formas, se acota a ±0.99 y se marca.
    _rhoIntermedia(fa, fb, r) {
        const [x, y] = fa.orden <= fb.orden ? [fa, fb] : [fb, fa];
        const tope = 0.99;
        let rho;
        switch (x.forma + '-' + y.forma) {
            case 'normal-normal': rho = r; break;
            case 'normal-uniforme': rho = r * Math.sqrt(Math.PI / 3); break;
            case 'uniforme-uniforme': rho = 2 * Math.sin(Math.PI * Math.max(-1, Math.min(1, r)) / 6); break;
            case 'normal-lognormal': rho = r * Math.sqrt(Math.expm1(y.sigma * y.sigma)) / y.sigma; break;
            case 'uniforme-lognormal': {
                const p = 0.5 + r * Math.sqrt(Math.expm1(y.sigma * y.sigma) / 12);
                rho = (p > 0 && p < 1) ? Math.SQRT2 * this.normalInversa(p) / y.sigma : (r > 0 ? Infinity : -Infinity);
                break;
            }
            case 'lognormal-lognormal': {
                const arg = 1 + r * Math.sqrt(Math.expm1(x.sigma * x.sigma) * Math.expm1(y.sigma * y.sigma));
                rho = arg > 0 ? Math.log(arg) / (x.sigma * y.sigma) : -Infinity;
                break;
            }
            default: rho = r;
        }
        if (!isFinite(rho)) rho = rho > 0 ? Infinity : -Infinity;
        const limitada = !(Math.abs(rho) <= tope);
        return { rho: Math.max(-tope, Math.min(tope, rho)), limitada };
    },

    _matrizIntermedia(Robjetivo, variables) {
        // (B6) criterios de moderación: su fila pasa al espacio del residuo e_Y
        const R = this._aResidualModeracion(Robjetivo);
        const m = R.length, limitadas = [];
        const formas = variables.map(v => this._formaMarginal(v));
        const nombres = variables.map(v => v.nombre);
        const s = nombres.map(nm => this._factorDE(nm));
        const lista = nm => (this.diferenciasEfectivas && this.diferenciasEfectivas.get(nm)) || [];
        const Rint = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? 1 : 0)));
        for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) {
            const r = R[i][j];
            // covarianza entre grupos compartida (misma agrupación en ambas
            // variables): Σ_k amp_ik·amp_jk·Var(c_k), en unidades de σ_i·σ_j
            let b = 0;
            lista(nombres[i]).forEach(ei => lista(nombres[j]).forEach(ej => {
                if (ei.agrup === ej.agrup) b += ei.amplitud * ej.amplitud * this._varianzaCodigo(ei.agrup);
            }));
            const rhoIntra = (r - b) / (s[i] * s[j]);
            const inv = this._rhoIntermedia(formas[i], formas[j], rhoIntra);
            if (inv.limitada) {
                const alcanzable = s[i] * s[j] * this._rTransformada(formas[i], formas[j], inv.rho) + b;
                limitadas.push({ a: nombres[i], b: nombres[j], pedido: r, alcanzable });
            }
            Rint[i][j] = Rint[j][i] = inv.rho;
        }
        // La intermedia puede dejar de ser definida positiva aunque la pedida lo
        // fuera: se sustituye por la válida más cercana y se deja constancia.
        const ajustada = m > 0 && !this._esDefinidaPositiva(Rint);
        return { R: ajustada ? this._matrizValidaMasCercana(Rint) : Rint, limitadas, ajustada };
    },

    generarMatrizDrivers(n, codigosGrupo = [], funcionesValor = null) {
        const m = this.correlVariables.length;
        if (!m || n < 3) return null;
        let Z = Array.from({ length: n }, () => Array.from({ length: m }, () => this.generarNormalEstandar()));
        // Modo exacto + diferencias por grupo: drivers ortogonales a los códigos
        // (medias de grupo del driver = 0 exacto → la d obtenida es la pedida).
        this._ortogonalizarContraCodigos(Z, codigosGrupo);
        this._estandarizarColumnas(Z);
        const S = this.descomposicionCholesky(this._correlacionMuestral(Z));
        const Sinv = this._inversaTriangularInferior(S);
        // W = Z·(S⁻¹)ᵀ: columnas de media 0, DE 1 y correlación muestral identidad
        const W = new Array(n);
        for (let i = 0; i < n; i++) {
            const w = new Array(m).fill(0);
            for (let a = 0; a < m; a++) { let s = 0; for (let k = 0; k <= a; k++) s += Z[i][k] * Sinv[a][k]; w[a] = s; }
            W[i] = w;
        }
        // L: factor de la matriz intermedia. Con funciones de valor se calibra
        // sobre las variables FINALES (formas, recortes, grupos) para que la
        // Pearson de la base sea exactamente la pedida.
        const L = funcionesValor ? this._calibrarCorrelacionesExactas(W, funcionesValor, codigosGrupo) : this.correlL;
        // Z* = W·Lᵀ, por columnas…
        const Zcols = Array.from({ length: m }, () => new Float64Array(n));
        for (let i = 0; i < n; i++) {
            const w = W[i];
            for (let a = 0; a < m; a++) { let s = 0; for (let k = 0; k <= a; k++) s += L[a][k] * w[k]; Zcols[a][i] = s; }
        }
        // …espacio de valor para las variables con grupos y driver compuesto de
        // los criterios de moderación (mismo pipeline que usa la calibración)
        this.driversEnValor = new Set();
        if (funcionesValor) {
            this._prepararColumnasDeDrivers(Zcols, funcionesValor, codigosGrupo);
            funcionesValor.forEach((f, a) => { if (f.enValor || f.esCriterio || f.formaAplicada) this.driversEnValor.add(this.correlVariables[a].tipo + ':' + this.correlVariables[a].clave); });
        }
        const salida = new Array(n);
        for (let i = 0; i < n; i++) { const y = new Array(m); for (let a = 0; a < m; a++) y[a] = Zcols[a][i]; salida[i] = y; }
        return salida;
    },

    // Pipeline por columnas sobre los drivers mezclados (modo exacto):
    //  1) variables con diferencias por grupo → ESPACIO DE VALOR (forma aplicada,
    //     medias de grupo igualadas, DE intra 1); igualar medias en z no basta con
    //     formas no normales (las medias de grupo de e^{σz} no son iguales aunque
    //     las de z lo sean) y la d dejaba de ser exacta;
    //  2) (B6) criterios de moderación: driver compuesto a partir de los VALORES
    //     FINALES estandarizados de X y W, en orden de modelo;
    //  3) criterios que además tienen diferencias por grupo → igualar medias.
    _prepararColumnasDeDrivers(Zcols, funciones, codigos) {
        const n = Zcols[0].length;
        const criterios = new Set((this.modelosModeracion || []).map(md => md.iY));
        funciones.forEach((f, a) => {
            if (criterios.has(a)) return;
            if (f.enValor) { Zcols[a] = this._igualarPorGrupos(Float64Array.from(Zcols[a], z => f.transformar(z)), codigos); return; }
            // (modo exacto) formas no normales sin grupos: la forma se aplica aquí y
            // se re-estandariza EN LA MUESTRA (media 0, DE 1 con n − 1), así la
            // Media y la DE de la variable salen exactas también con formas
            // asimétricas o uniformes (antes fluctuaban ±3 % de σ con n = 150 y,
            // con ellas, el cambio de una medida repetida).
            if (f.conForma) {
                const u = Float64Array.from(Zcols[a], z => f.transformar(z));
                let m = 0; for (let i = 0; i < n; i++) m += u[i]; m /= n;
                let v = 0; for (let i = 0; i < n; i++) v += (u[i] - m) * (u[i] - m);
                const sd = Math.sqrt(v / Math.max(1, n - 1)) || 1;
                for (let i = 0; i < n; i++) u[i] = (u[i] - m) / sd;
                Zcols[a] = u; f.formaAplicada = true;
            }
        });
        (this.modelosModeracion || []).forEach(md => {
            const xFinal = new Float64Array(n), wFinal = new Float64Array(n);
            for (let i = 0; i < n; i++) { xFinal[i] = funciones[md.iX].valor(i, Zcols[md.iX][i]); wFinal[i] = funciones[md.iW].valor(i, Zcols[md.iW][i]); }
            // Sin igualar medias por grupo aquí: residualizar z_Y contra los grupos
            // recortaba la parte de X·W correlacionada con ellos y sesgaba β₃; la
            // d marginal de Y la clava igualmente la calibración de amplitudes.
            Zcols[md.iY] = this._componerCriterio(md, xFinal, wFinal, Zcols[md.iY]);
        });
        return Zcols;
    },

    // Driver del criterio de una moderación, EXACTO para quien analice la base:
    //   z_Y = β₁·x̃ + β₂·w̃ + β₃·(x̃·w̃ − media) + c·ẽ
    // con x̃, w̃ los valores finales de X y W estandarizados en la muestra (lo
    // mismo que hará el analista), ẽ el residuo propio de Y hecho ortogonal a
    // x̃, w̃ y al producto, y c tal que Var(z_Y) = 1. Así la regresión de Y
    // estandarizada sobre x̃, w̃ y x̃·w̃ devuelve exactamente β₁, β₂ y β₃; con
    // el producto de los drivers normales, β₁ fluctuaba ±0.15 con n = 100
    // porque el tercer momento muestral Σx̃²w̃ no es cero.
    _componerCriterio(md, xFinal, wFinal, e) {
        const n = e.length;
        // Si el criterio tiene diferencias por grupo, el analista estandariza Y
        // por su DE TOTAL, pero la parte compuesta vive en la DE intra (σ·s): los
        // coeficientes que verá quedan multiplicados por s. Se compensa aquí.
        const s = this._factorDE(md.y) || 1;
        md = Object.assign({}, md, { b1: md.b1 / s, b2: md.b2 / s, b3: md.b3 / s });
        const est = col => { let mu = 0; for (let i = 0; i < n; i++) mu += col[i]; mu /= n; let v = 0; for (let i = 0; i < n; i++) v += (col[i] - mu) ** 2; const sd = Math.sqrt(v / n); return sd > 1e-9 ? Float64Array.from(col, x => (x - mu) / sd) : null; };
        const zx = est(xFinal), zw = est(wFinal);
        if (!zx || !zw || n < 8) return e;   // X o W sin varianza (caso degenerado): Y queda con su driver propio
        const p = new Float64Array(n);
        let mp = 0; for (let i = 0; i < n; i++) { p[i] = zx[i] * zw[i]; mp += p[i]; }
        mp /= n; for (let i = 0; i < n; i++) p[i] -= mp;
        // (C6) curvilínea: W es X, así que el diseño es [x̃, x̃² centrado] (sin columna repetida)
        const er = this._residualizarColumna(e, md.tipo === 'curvilinea' ? [zx, p] : [zx, zw, p]);
        const estructural = new Float64Array(n);
        let ms = 0; for (let i = 0; i < n; i++) { estructural[i] = md.b1 * zx[i] + md.b2 * zw[i] + md.b3 * p[i]; ms += estructural[i]; }
        ms /= n;
        let vs = 0, ve = 0; for (let i = 0; i < n; i++) { vs += (estructural[i] - ms) ** 2; ve += er[i] * er[i]; }
        vs /= n; ve /= n;
        // varianza estructural muestral > 1: se rebaja el residuo a 0 (caso límite; la validación acota R² < 0.98)
        const c = (ve > 0 && vs < 1) ? Math.sqrt((1 - vs) / ve) : 0;
        const escala = vs >= 1 ? 1 / Math.sqrt(vs) : 1;
        const out = new Float64Array(n);
        for (let i = 0; i < n; i++) out[i] = (estructural[i] - ms) * escala + c * er[i];
        return out;
    },

    // Funciones de valor de cada variable correlacionable, en el orden de
    // Funciones de valor de cada variable correlacionable, en el orden de
    // correlVariables: (i, z) → valor final del participante i con driver z.
    // Incluyen su desplazamiento por grupo (calculado con los códigos ya
    // generados en el pase 1) y su DE intra-grupo.
    _funcionesDeValor(base) {
        const cfg = this.configuracion;
        const conDif = nombre => !!(this.diferenciasEfectivas && (this.diferenciasEfectivas.get(nombre) || []).length);
        const criterios = new Set((this.modelosModeracion || []).map(md => md.iY));
        return this.correlVariables.map((v, a) => {
            // (B6) el criterio de una moderación llega con su driver compuesto y
            // forma normal: el modelo Y = β₁X + β₂W + β₃XW + e define su distribución
            const esCriterio = criterios.has(a);
            if (v.tipo === 'escala') {
                const p = cfg.pruebas.find(x => this._claveEscala(x) === v.clave);
                const f = this._factorDE(p.nombre);
                const partes = this._partesDesplazamiento(base, p.nombre, p.desviacion);
                const desp = partes.desp;
                // Con diferencias por grupo el driver llega ya EN ESPACIO DE VALOR
                // (forma aplicada, medias de grupo igualadas, DE 1): la forma no
                // se vuelve a aplicar.
                const enValor = conDif(p.nombre);
                const fn = { enValor, esCriterio, desp, partes: partes.partes, recalcularDesp: partes.recalcular, nombre: p.nombre,
                    conForma: !esCriterio && !p.formaTotal && (p.distribucion && p.distribucion !== 'normal'), formaAplicada: false,
                    transformar: z => (esCriterio || p.formaTotal ? z : this.transformarFormaZ(z, p.distribucion)),
                    valor: (i, base) => this._totalDesdeDriver(p, base, desp[i], f, enValor || esCriterio || fn.formaAplicada) };
                return fn;
            }
            const s = cfg.sociodemograficos.find(x => x.categoriaCorta === v.clave);
            const f = this._factorDE(s.categoria);
            const partes = this._partesDesplazamiento(base, s.categoria, this._deEfectiva(s));
            const desp = partes.desp;
            const enValor = conDif(s.categoria);
            const fn = { enValor, esCriterio, desp, partes: partes.partes, recalcularDesp: partes.recalcular, nombre: s.categoria,
                conForma: !esCriterio && s.distribucion && s.distribucion !== 'normal', formaAplicada: false,
                transformar: z => (esCriterio ? z : this._formaSocioEstandar(s, z, f)),
                valor: (i, base) => this._valorContinuoSocio(s, base, desp[i], f, enValor || esCriterio || fn.formaAplicada) };
            return fn;
        });
    },

    // Forma estandarizada (media 0, DE 1) de un sociodemográfico continuo a
    // partir de su driver: para el asimétrico, la log-normal de generarAsimetrico
    // llevada a media 0 y DE 1; para el normal, el propio z.
    _formaSocioEstandar(socio, z, factorDE) {
        if (socio.distribucion === 'asimetrica') {
            const de = socio.desviacion * factorDE;
            return de > 0 ? (this.generarAsimetrico(socio.promedio, de, z) - socio.promedio) / de : z;
        }
        return z;
    },

    // Residualiza una columna contra [1 | X] (medias de grupo exactamente 0 en
    // cada nivel) y la lleva a DE intra-grupo AGRUPADA 1 (grados de libertad
    // n − q, como la DE agrupada de la d de Cohen; con n = 30 y 3 grupos, usar
    // n en vez de n − 3 sesgaba la d obtenida un 5 %). Devuelve la columna.
    _igualarPorGrupos(col, X) {
        const n = col.length, q = X.length + 1;
        const Z = Array.from(col, v => [v]);
        const aplicado = this._ortogonalizarContraCodigos(Z, X) && this.driversOrtogonalizados;
        let s = 0; for (let i = 0; i < n; i++) s += Z[i][0];
        const media = s / n;
        let v = 0; for (let i = 0; i < n; i++) v += (Z[i][0] - media) ** 2;
        const de = Math.sqrt(v / Math.max(1, aplicado ? n - q : n - 1)) || 1e-9;
        const out = new Float64Array(n);
        for (let i = 0; i < n; i++) out[i] = (Z[i][0] - media) / de;
        return out;
    },

    // ============ CALIBRACIÓN DE CORRELACIONES EXACTAS ============
    // El blanqueo hace exacta la correlación de los DRIVERS, pero la r pedida es
    // la de Pearson entre las variables FINALES, y entre driver y valor hay
    // transformaciones no lineales (forma asimétrica o uniforme, recorte Likert,
    // redondeo) y la varianza entre grupos. Punto fijo sobre la matriz
    // intermedia: se parte de la de forma cerrada, se generan los valores con
    // la candidata, se mide su Pearson y se corrige la candidata con el error,
    // hasta que la Pearson medida coincide con la pedida (o 12 iteraciones).
    _calibrarCorrelacionesExactas(W, funciones, codigos) {
        const n = W.length, m = funciones.length, R = this.correlR;
        let Rt = this.correlRIntermedia.map(f => f.slice());
        let L = this.descomposicionCholesky(Rt);
        const X = Array.from({ length: m }, () => new Float64Array(n));
        const medias = new Float64Array(m), des = new Float64Array(m);
        // Se conserva la mejor candidata: con valores redondeados (Likert,
        // decimales) la Pearson muestral cambia a saltos y el punto fijo puede
        // oscilar alrededor del objetivo en vez de clavarlo.
        const mejor = { error: Infinity, errorR: Infinity, L, Rt, C: null };
        let sinMejora = 0, proyectada = false, iteraciones = 0;
        const Zmix = Array.from({ length: m }, () => new Float64Array(n));
        // (B6) parejas criterio–X y criterio–W de una moderación: r(e_Y, X) = r(e_Y, W) = 0
        // se mantienen; su Pearson final la determinan β₁, β₂, β₃ (y el tercer
        // momento muestral), no la calibración.
        const fijosPorBeta = new Set();
        (this.modelosModeracion || []).forEach(md => { [[md.iY, md.iX], [md.iY, md.iW]].forEach(([a, b]) => fijosPorBeta.add(a < b ? `${a}|${b}` : `${b}|${a}`)); });
        for (let it = 0; it < 16; it++) {
            iteraciones = it + 1;
            // drivers mezclados de todas las variables (Z* = W·Lᵀ)…
            for (let a = 0; a < m; a++) for (let i = 0; i < n; i++) { const w = W[i]; let s = 0; for (let k = 0; k <= a; k++) s += L[a][k] * w[k]; Zmix[a][i] = s; }
            // …espacio de valor y criterios de moderación (mismo pipeline que la generación)…
            const cols = this._prepararColumnasDeDrivers(Zmix.map(c => c), funciones, codigos);
            // …y los valores finales de cada variable
            for (let a = 0; a < m; a++) for (let i = 0; i < n; i++) X[a][i] = funciones[a].valor(i, cols[a][i]);
            for (let a = 0; a < m; a++) {
                let s = 0; for (let i = 0; i < n; i++) s += X[a][i];
                medias[a] = s / n;
                let v = 0; for (let i = 0; i < n; i++) v += (X[a][i] - medias[a]) ** 2;
                des[a] = Math.sqrt(v / n) || 1e-9;
            }
            const C = Array.from({ length: m }, () => new Float64Array(m));
            let maxError = 0, maxErrorR = 0;
            for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) {
                let s = 0; for (let i = 0; i < n; i++) s += (X[a][i] - medias[a]) * (X[b][i] - medias[b]);
                C[a][b] = C[b][a] = s / n / (des[a] * des[b]);
                if (fijosPorBeta.has(`${a}|${b}`)) continue;   // (B6) los fijan los coeficientes
                maxErrorR = Math.max(maxErrorR, Math.abs(R[a][b] - C[a][b]));
            }
            maxError = maxErrorR;
            // (A1, exacto) d MARGINALES: error de cada (variable, agrupación) con las
            // amplitudes actuales; cuenta en el mismo criterio de convergencia.
            const erroresD = [];
            funciones.forEach((f, a) => (f.partes || []).forEach(p => {
                if (p.fija) return;   // (C4) CCI: exacta por construcción
                const obs = p.tipo === 'interaccion' ? this._dInteraccion(X[a], p.codigos, p.codigos2) : this._dMarginal(X[a], p.codigos);
                if (obs === null) return;
                erroresD.push({ f, p, obs });
                maxError = Math.max(maxError, Math.abs(p.d - obs));
            }));
            if (maxError < mejor.error) {
                mejor.error = maxError; mejor.errorR = maxErrorR; mejor.L = L; mejor.Rt = Rt; mejor.C = C; sinMejora = 0;
                mejor.amplitudes = funciones.map(f => (f.partes || []).map(p => p.amplitud));
            } else if (++sinMejora >= 4) break;
            if (maxError < 5e-4) break;
            // Paso completo al principio; amortiguado después, porque con valores
            // redondeados (edad entera, Likert) la Pearson muestral responde a
            // saltos y el paso completo oscila alrededor del objetivo.
            const paso = it < 2 ? 1 : 0.6;
            // amplitudes: corrección proporcional d/d_obs (acotada), amortiguada
            const tocadas = new Set();
            erroresD.forEach(({ f, p, obs }) => {
                if (p.d === 0) return;
                const factor = (obs * p.d > 0 && Math.abs(obs) > 0.02) ? Math.max(0.5, Math.min(2, p.d / obs)) : 1.25;
                p.amplitud += paso * (p.amplitud * factor - p.amplitud);
                tocadas.add(f);
            });
            tocadas.forEach(f => f.recalcularDesp());
            const Rn = Rt.map(f => f.slice());
            for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) {
                if (fijosPorBeta.has(`${a}|${b}`)) continue;
                Rn[a][b] = Rn[b][a] = Math.max(-0.995, Math.min(0.995, Rt[a][b] + paso * (R[a][b] - C[a][b])));
            }
            // Si la candidata deja de ser definida positiva, la combinación
            // pedida no es alcanzable con estas formas: se proyecta a la válida
            // más cercana y el punto fijo se queda en la mejor aproximación.
            if (this._esDefinidaPositiva(Rn)) Rt = Rn; else { Rt = this._matrizValidaMasCercana(Rn); proyectada = true; }
            L = this.descomposicionCholesky(Rt);
        }
        this.correlRIntermedia = mejor.Rt;
        // restaurar las amplitudes de la mejor candidata
        if (mejor.amplitudes) funciones.forEach((f, a) => { (f.partes || []).forEach((p, k) => { p.amplitud = mejor.amplitudes[a][k]; }); if (f.recalcularDesp) f.recalcularDesp(); });
        // Constancia para el panel de diagnóstico: si no convergió, alguna r
        // pedida no es alcanzable con las formas/recortes/grupos configurados.
        // Las parejas ya marcadas como limitadas reciben el valor MEDIDO como
        // «alcanzable» (más fiel que la cota de forma cerrada: el recorte
        // Likert también cuenta).
        // «Convergió» a efectos del aviso: error máximo < 0.01 (por debajo de la
        // tolerancia del informe, 0.03, y del efecto del redondeo a enteros).
        // El aviso del panel se refiere a las CORRELACIONES (las d tienen su
        // propia fila en el informe, con tolerancia muestral si el grupo es pequeño).
        this.diagnosticoCorrelaciones.calibracion = { convergio: mejor.errorR < 0.01, error: mejor.errorR, errorTotal: mejor.error, iteraciones, proyectada };
        if (mejor.C) {
            const indice = {};
            this.correlVariables.forEach((v, i) => { indice[v.nombre] = i; });
            (this.diagnosticoCorrelaciones.limitadas || []).forEach(l => {
                const a = indice[l.a], b = indice[l.b];
                if (a !== undefined && b !== undefined) l.alcanzable = mejor.C[a][b];
            });
        }
        return mejor.L;
    },

    _driversDeFila(fila) {
        const drivers = {};
        this.correlVariables.forEach((v, i) => { drivers[v.tipo + ':' + v.clave] = fila[i]; });
        return drivers;
    },

    generarVectorCorrelacionado() {
        const m = this.correlVariables.length;
        const z = [];
        for (let i = 0; i < m; i++) z.push(this.generarNormalEstandar());

        const fila = new Array(m).fill(0);
        for (let i = 0; i < m; i++) {
            let y = 0;
            for (let k = 0; k <= i; k++) y += this.correlL[i][k] * z[k];
            fila[i] = y;
        }
        this._aplicarModeracion(fila);   // (B6)
        const drivers = {};
        for (let i = 0; i < m; i++) drivers[this.correlVariables[i].tipo + ':' + this.correlVariables[i].clave] = fila[i];
        return drivers;
    },

    // Hay estructura de correlación que preparar si: tabla III no vacía, algún
    // test con ≥ 2 dimensiones y r intra ≠ 0, o diferencias por grupo en modo
    // exacto (para que los drivers existan y se ortogonalicen a los grupos).
    _hayEstructuraDeCorrelacion() {
        const cfg = this.configuracion;
        if ((cfg.correlaciones || []).length > 0) return true;
        if ((cfg.modelos || []).length > 0) return true;
        if ((cfg.gruposPruebas || []).some(g => g.escalas.length >= 2 && (g.rIntra === undefined ? 0.40 : g.rIntra) !== 0)) return true;
        return cfg.correlacionesExactas !== false && !!this.diferenciasEfectivas && this.diferenciasEfectivas.size > 0;
    },

    // Residualiza cada columna de Z (n × m) contra [1 | X] por mínimos cuadrados:
    // Z ← Z − X·(XᵀX)⁻¹·XᵀZ. Deja las medias de grupo de cada driver en 0 exacto.
    _ortogonalizarContraCodigos(Z, X) {
        const n = Z.length, m = Z[0].length, q = X.length + 1;
        if (X.length === 0 || n <= q + m + 2) return Z;
        this.driversOrtogonalizados = true;
        const col = j => (j === 0 ? null : X[j - 1]);
        const G = Array.from({ length: q }, () => new Array(q).fill(0));
        for (let a = 0; a < q; a++) for (let b = a; b < q; b++) {
            let s = 0;
            const ca = col(a), cb = col(b);
            for (let i = 0; i < n; i++) s += (ca ? ca[i] : 1) * (cb ? cb[i] : 1);
            G[a][b] = G[b][a] = s;
        }
        const L = this.descomposicionCholesky(G), Linv = this._inversaTriangularInferior(L);
        const Ginv = Array.from({ length: q }, (_, a) => Array.from({ length: q }, (_, b) => {
            let s = 0; for (let k = 0; k < q; k++) s += Linv[k][a] * Linv[k][b]; return s;
        }));
        for (let j = 0; j < m; j++) {
            const xtz = new Array(q).fill(0);
            for (let a = 0; a < q; a++) { const ca = col(a); let s = 0; for (let i = 0; i < n; i++) s += (ca ? ca[i] : 1) * Z[i][j]; xtz[a] = s; }
            const beta = new Array(q).fill(0);
            for (let a = 0; a < q; a++) { let s = 0; for (let k = 0; k < q; k++) s += Ginv[a][k] * xtz[k]; beta[a] = s; }
            for (let i = 0; i < n; i++) { let s = beta[0]; for (let a = 1; a < q; a++) s += X[a - 1][i] * beta[a]; Z[i][j] -= s; }
        }
        return Z;
    },

    // Columnas de diseño de los grupos con diferencias (binaria: una columna;
    // categórica: una columna indicadora por nivel salvo el primero), para
    // hacer los drivers ortogonales a ellas en modo exacto.
    _matrizCodigosGrupo(base) {
        const usados = new Map();
        const productos = new Map();
        if (this.diferenciasEfectivas) this.diferenciasEfectivas.forEach(lista => lista.forEach(e => {
            usados.set(e.agrup.categoria, e.agrup);
            if (e.tipo === 'interaccion' && e.agrup2) { usados.set(e.agrup2.categoria, e.agrup2); productos.set(`${e.agrup.categoria}×${e.agrup2.categoria}`, [e.agrup, e.agrup2]); }
        }));
        const columnas = [];
        // (C4) el término de interacción también se ortogonaliza (si no, su correlación
        // muestral con el driver confundiría la diferencia de diferencias)
        productos.forEach(([a, b]) => { const va = base.columna(a.categoria).datos, vb = base.columna(b.categoria).datos; const col = new Array(base.n); for (let i = 0; i < base.n; i++) col[i] = (va[i] === 1 ? 1 : 0) * (vb[i] === 1 ? 1 : 0); columnas.push(col); });
        usados.forEach(agrup => {
            const valores = Array.from(base.columna(agrup.categoria).datos);
            if (agrup.distribucion === 'binaria') columnas.push(valores.map(v => (v === 1 ? 1 : 0)));
            else if (agrup.distribucion === 'categorica') {
                for (let nivel = agrup.minimo + 1; nivel <= agrup.maximo; nivel++) columnas.push(valores.map(v => (v === nivel ? 1 : 0)));
            }
        });
        // Solo columnas con varianza (un nivel ausente en la muestra sería una
        // columna nula y haría singular XᵀX).
        return columnas.filter(c => { const s = c.reduce((a, b) => a + b, 0); return s > 0 && s < c.length; });
    },

    // Correlación OBJETIVO entre dos escalas del estudio (por sigla): la de la
    // matriz preparada si existe; si no, el r intra-test del cuadro (mismo
    // test) o 0 (tests distintos). Entre una escala y sí misma, 1.
    _rObjetivoEntre(siglaA, siglaB) {
        if (siglaA === siglaB) return 1;
        if (this.correlR && this.correlVariables && this.correlVariables.length) {
            const ia = this.correlVariables.findIndex(v => v.tipo === 'escala' && v.clave === siglaA);
            const ib = this.correlVariables.findIndex(v => v.tipo === 'escala' && v.clave === siglaB);
            if (ia >= 0 && ib >= 0) return this.correlR[ia][ib];
        }
        const g = (this.configuracion.gruposPruebas || []).find(x => x.escalas.includes(siglaA) && x.escalas.includes(siglaB));
        return g ? (g.rIntra === undefined ? 0.40 : g.rIntra) : 0;
    },

});
