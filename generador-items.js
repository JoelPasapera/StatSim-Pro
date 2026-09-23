// ============================================================================
// generador-items.js — perfiles de ítems, estructura factorial, reparto del total en ítems, calibraciones de fiabilidad, cargas y dificultades, funciones de valor
// Métodos de GeneradorDatos añadidos al prototipo (misma semántica que en la clase).
// ============================================================================
Object.assign(GeneradorDatos.prototype, {
    // ============ PERFILES DE ÍTEMS (B5) ============
    // Un perfil por escala, derivado de la semilla: {delta, peso, cruzadas}.
    //  · delta[i] (Σ = 0): medias de ítem en escalera dentro del espacio libre
    //    (Likert) o de una DE de ítem (continua), barajadas;
    //  · peso[i] (Σ = 1): 1 ± cargas en escalera, barajados y normalizados;
    //  · cruzadas: [{item, sigla, c}] para una proporción de los ítems, cada uno
    //    con OTRA dimensión del mismo test elegida al azar.
    _perfilesDeItems() {
        const cfg = this.configuracion;
        const nivel = PERFILES_HETEROGENEIDAD[cfg.heterogeneidadItems] || PERFILES_HETEROGENEIDAD.ninguna;
        const indice = cfg.indiceFiabilidad || 'alfa';
        const grupos = cfg.gruposPruebas || [];
        const perfiles = new Map();
        (cfg.pruebas || []).forEach(p => {
            // (B7) una onda T2… usa el MISMO instrumento: mismo perfil que su base
            if (p.base && perfiles.has(p.base)) {
                const base = perfiles.get(p.base);
                // (Revisión transversal, F-6) un clon dicotómico (onda o informante) tiene su
                // propia media y sus propias dificultades: necesita sus δ (medias de ítem)
                // para calibrarse aparte; el resto del perfil se comparte
                if (this._esDicotomica(p) && Array.isArray(p.dificultadesEfectivas)) {
                    const k = p.numItems, mediaItem = p.media / k;
                    const delta = new Float64Array(k);
                    for (let i = 0; i < k; i++) delta[i] = p.dificultadesEfectivas[i] + p.minimo - mediaItem;
                    perfiles.set(p, Object.assign({}, base, { delta }));
                } else perfiles.set(p, base);
                return;
            }
            const k = p.numItems;
            const perfil = { delta: new Float64Array(k), peso: new Float64Array(k).fill(k > 0 ? 1 / k : 0), cruzadas: [] };
            if (k >= 2) {
                const escalera = i => 2 * i / (k - 1) - 1;                 // −1 … +1, Σ = 0
                // Medias: espacio libre hasta el tope más cercano (Likert) o una DE de ítem (continua)
                const likert = p.minimo !== null && p.maximo !== null;
                const mediaItem = p.media / k;
                const espacio = likert ? Math.max(0, Math.min(mediaItem - p.minimo, p.maximo - mediaItem)) : p.desviacion / Math.sqrt(k);
                if (nivel.medias > 0 && espacio > 0) {
                    const orden = this._muestraSinReemplazo(k, k);
                    for (let i = 0; i < k; i++) perfil.delta[i] = nivel.medias * espacio * escalera(orden[i]);
                }
                // Cargas: en modo ω sin heterogeneidad se conserva el modelo congenérico de siempre (0.45)
                const dispersion = Math.min(0.9, nivel.cargas > 0 ? nivel.cargas : ((indice === 'omega' && k >= 3) ? 0.45 : 0));
                if (dispersion > 0) {
                    const orden = this._muestraSinReemplazo(k, k);
                    let suma = 0;
                    for (let i = 0; i < k; i++) { perfil.peso[i] = 1 + dispersion * escalera(orden[i]); suma += perfil.peso[i]; }
                    for (let i = 0; i < k; i++) perfil.peso[i] /= suma;
                }
                // Cargas cruzadas: solo si el test tiene otra dimensión
                const g = grupos.find(x => x.escalas.includes(p.nombreCorto));
                const otras = g ? g.escalas.filter(s => s !== p.nombreCorto) : [];
                if (nivel.cruzadas > 0 && otras.length) {
                    const m = Math.max(1, Math.round(nivel.proporcionCruzadas * k));
                    const elegidos = this._muestraSinReemplazo(k, Math.min(m, k));
                    elegidos.forEach(item => perfil.cruzadas.push({ item, sigla: otras[Math.floor(this.aleatorio() * otras.length)], c: nivel.cruzadas }));
                }
                // (C5) dicotómica: las medias de ítem son las dificultades (Σ δ = 0 respecto a M/k)
                if (this._esDicotomica(p) && Array.isArray(p.dificultadesEfectivas) && p.dificultadesEfectivas.length === k) {
                    const mediaItem = p.media / k;
                    for (let i = 0; i < k; i++) perfil.delta[i] = p.dificultadesEfectivas[i] + p.minimo - mediaItem;
                    perfil.cruzadas = [];
                }
                // (C1) con matriz de cargas para este test, pesos y cruzadas salen de ella
                const est = this._estructuraDe(p);
                if (est && !this._esDicotomica(p)) this._perfilEstructurado(p, est, perfil, grupos);
            }
            perfiles.set(p, perfil);
        });
        return perfiles;
    },

    // Perfil estructurado de una dimensión a partir de la matriz de su test
    _perfilEstructurado(p, est, perfil, grupos) {
        const k = p.numItems;
        const dims = (this.configuracion.pruebas || []).filter(x => x.prueba === p.prueba && !x.sufijo && x.tipo !== 'general' && x.numItems >= 2);
        const factores = est.factores || dims.map(d => d.nombre);
        const filas = est.cargas[p.nombre];
        const ip = factores.indexOf(p.nombre);
        if (!Array.isArray(filas) || filas.length !== k || ip < 0) return null;
        const lambda = Float64Array.from(this._lambdasEfectivas(p, filas, ip));
        let suma = 0; for (let i = 0; i < k; i++) suma += lambda[i];
        for (let i = 0; i < k; i++) perfil.peso[i] = lambda[i] / suma;
        // cargas cruzadas explícitas (en unidades de DE de ítem, como las del perfil automático)
        perfil.cruzadas = [];
        filas.forEach((fila, i) => fila.forEach((c, j) => {
            if (j === ip) return;
            const cr = +c || 0;
            if (Math.abs(cr) < 0.005) return;
            const dim = dims.find(d => d.nombre === factores[j]);
            if (dim) perfil.cruzadas.push({ item: i, sigla: dim.nombreCorto, c: cr });
        }));
        // factor de método sobre los ítems invertidos. Como los ítems deben sumar
        // el total, el componente se centra dentro de la dimensión: queda como
        // CONTRASTE (positivo en los invertidos, negativo en los directos), el
        // patrón de un factor de redacción; la carga aplicada se infla por
        // 1/(1 − m/k) para que, tras centrar, los invertidos conserven la pedida.
        let metodo = null;
        if (est.metodo && est.metodo.carga > 0 && (p.invertidos || 0) > 0) {
            const items = [];
            for (let i = 0; i < k; i++) if (i >= k - p.invertidos) items.push(i);
            const m = items.length;
            if (m && m < k) metodo = { carga: Math.min(0.6, est.metodo.carga), aplicada: Math.min(0.95, Math.min(0.6, est.metodo.carga) / (1 - m / k)), items };
        }
        // desajuste: pares disjuntos de ítems con un residuo común
        const nivel = NIVELES_DESAJUSTE[est.desajuste || 'ninguno'] || NIVELES_DESAJUSTE.ninguno;
        const pares = [];
        if (nivel.proporcion > 0 && k >= 4) {
            const nPares = Math.max(1, Math.round(nivel.proporcion * k / 2));
            const orden = this._muestraSinReemplazo(k, k);
            for (let q = 0; q < nPares && 2 * q + 1 < k; q++) pares.push({ i: orden[2 * q], j: orden[2 * q + 1], rho: nivel.rho });
        }
        const media = suma / k;
        const mu0 = Math.sqrt(k * media * media / (1 + (k - 1) * media * media));   // solución exacta del caso paralelo
        perfil.estructura = { lambda, sumaLambda: suma, mu: mu0, metodo, pares, modo: est.modo || 'cargas', prueba: p.prueba, calibrada: false };
        return perfil.estructura;
    },

    // ============ ESTRUCTURA FACTORIAL CONTROLADA (C1) ============
    // Contrato: los factores son las dimensiones del test; el factor común de
    // cada dimensión es su total (autoritativo); las cargas se definen sobre el
    // ítem recodificado y son las que recupera un análisis de ejes principales
    // sobre los ítems (la restricción «los ítems suman el total» se compensa en
    // la calibración, como ya hacía el reparto paralelo con el α).
    //   ítem_i = M/k + δ_i + w_i·(T − M) + e_i,   w_i = λ_i / Σλ
    //   e_i = μ·σ₀·√(1 − λ_i²)·g_i + Σ_m c_im·σ₀·z_m + λ_met·σ₀·z_met + pares,   σ₀ = σ_T / Σλ
    // con los e_i centrados (pesos ∝ su DE) para que Σ ítem_i = T exactamente, y μ
    // calibrado por bisección hasta que la carga media recuperada sea la pedida.
    _estructuraDe(prueba) {
        const lista = (this.configuracion && this.configuracion.estructuras) || [];
        const base = prueba.base || prueba;
        return lista.find(e => e.prueba === base.prueba && e.cargas && Array.isArray(e.cargas[base.nombre])) || null;
    },

    // α y ω implícitos por unas cargas propias (ítems con la misma DE, modelo
    // congenérico; las cruzadas y el método no entran en la fiabilidad propia)
    _fiabilidadImplicita(lambdas) {
        const k = lambdas.length;
        if (k < 2) return { alfa: 0, omega: 0 };
        let suma = 0, sumaCuad = 0, unic = 0;
        lambdas.forEach(l => { suma += l; sumaCuad += l * l; unic += 1 - l * l; });
        const sumaPares = suma * suma - sumaCuad;          // Σ_{i≠j} λ_i λ_j
        const alfa = (k / (k - 1)) * sumaPares / (k + sumaPares);
        const omega = (suma * suma) / (suma * suma + unic);
        return { alfa, omega };
    },

    // Cargas propias efectivas de una dimensión: las de la matriz o, en modo
    // «alfa», reescaladas por un multiplicador hasta que la fiabilidad implícita
    // sea la de la tabla I (con tope 0.95 por carga).
    _lambdasEfectivas(prueba, filas, idxPropio) {
        const k = prueba.numItems;
        const crudas = filas.map(f => Math.max(0.05, Math.min(0.95, +f[idxPropio] || 0)));
        const est = this._estructuraDe(prueba);
        if (!est || est.modo !== 'alfa' || !(prueba.alfa > 0 && prueba.alfa < 1)) return crudas;
        const indice = this.configuracion.indiceFiabilidad === 'omega' ? 'omega' : 'alfa';
        let lo = 0.05, hi = 3;
        for (let it = 0; it < 40; it++) {
            const mid = (lo + hi) / 2;
            const l = crudas.map(x => Math.min(0.95, x * mid));
            const fi = this._fiabilidadImplicita(l)[indice];
            if (fi < prueba.alfa) lo = mid; else hi = mid;
        }
        const m = (lo + hi) / 2;
        return crudas.map(x => Math.min(0.95, x * m));
    },

    // Calibración de μ (escala del ruido propio) para que la carga media
    // recuperada por ejes principales sea la pedida, con el mismo reparto (y el
    // mismo redondeo/recorte) que tendrá la base.
    _calibrarCargas(prueba, nSim = 1500) {
        const perfil = this.perfilesItems ? this.perfilesItems.get(prueba) : null;
        const est = perfil && perfil.estructura;
        if (!est || est.calibrada) return;
        const objetivo = Array.from(est.lambda).reduce((s, l) => s + l, 0) / est.lambda.length;
        const k = prueba.numItems;
        const deIntra = prueba.desviacion * this._factorDE(prueba.nombre);
        // modelo puro: las cruzadas, el método y los pares se descuentan del ruido
        // propio al generar, así que no cambian la carga propia y no entran aquí
        const estPuro = Object.assign({}, est, { metodo: null, pares: [] });
        const perfilPuro = { delta: perfil.delta, peso: perfil.peso, cruzadas: [], estructura: estPuro };
        const evaluar = () => {
            const cols = Array.from({ length: k }, () => new Array(nSim));
            for (let s = 0; s < nSim; s++) {
                const r = this.generarPuntajesPrueba(k, prueba.media, deIntra, prueba.minimo, prueba.maximo, prueba.alfa, null, prueba.formaTotal || prueba.distribucion, 'alfa', this._desplazamientoAleatorio(prueba.nombre, prueba.desviacion), perfilPuro, null);
                for (let j = 0; j < k; j++) cols[j][s] = r.items[j];   // el reparto ya devuelve los ítems en orientación recodificada
            }
            const cargas = this._pafUnFactor(this._matrizCorrelacion(cols));
            if (!cargas) return null;
            return { media: cargas.reduce((s, l) => s + l, 0) / k, cols };
        };
        let lo = 0.15, hi = 2.5, ultimo = null;
        for (let it = 0; it < 14; it++) {
            est.mu = estPuro.mu = (lo + hi) / 2;
            const r = evaluar();
            if (!r) break;
            ultimo = r;
            if (r.media > objetivo) lo = est.mu; else hi = est.mu;   // más ruido → menos carga
        }
        est.mu = (lo + hi) / 2;
        if (ultimo) {
            est.alfaImplicito = this._indiceObservado(ultimo.cols, 'alfa');
            est.omegaImplicito = this._indiceObservado(ultimo.cols, 'omega');
        }
        est.calibrada = true;
    },

    // Matriz de correlaciones entre ítems IMPLICADA por la estructura pedida de un
    // test, obtenida por SIMULACIÓN conjunta del test (totales con sus
    // correlaciones objetivo, mismo reparto, redondeo y recorte, cruzadas y
    // método) sin los pares de desajuste; y el SRMR que esos pares producen
    // (simulación con pares frente a sin pares). PRNG propio: el informe no
    // depende del estado del generador principal ni lo consume.
    _matrizImplicadaTest(dims, nSim = 2500) {
        const simular = (conPares) => {
            const K = dims.length;
            // correlaciones objetivo entre los totales del test → Cholesky (con cresta si hace falta)
            const Phi = dims.map(a => dims.map(b => this._rObjetivoEntre(this._claveEscala(a), this._claveEscala(b))));
            let L = null;
            for (let cresta = 0; cresta < 6 && !L; cresta++) { try { L = this.descomposicionCholesky(Phi.map((f, i) => f.map((v, j) => i === j ? 1 + cresta * 0.02 : v * (1 - cresta * 0.02)))); } catch (e) { L = null; } }
            if (!L) return null;
            const cols = [];
            const porDim = dims.map(p => { const perfil = this.perfilesItems.get(p); const est = perfil.estructura; return { p, perfil: { delta: perfil.delta, peso: perfil.peso, cruzadas: perfil.cruzadas, estructura: conPares ? est : Object.assign({}, est, { pares: [] }) }, deIntra: p.desviacion * this._factorDE(p.nombre), cols: Array.from({ length: p.numItems }, () => new Array(nSim)) }; });
            for (let s = 0; s < nSim; s++) {
                const z = new Array(K).fill(0), w = Array.from({ length: K }, () => this.generarNormalEstandar());
                for (let a = 0; a < K; a++) for (let k = 0; k <= a; k++) z[a] += L[a][k] * w[k];
                const zOtras = {};
                dims.forEach((p, a) => { zOtras[p.nombreCorto] = z[a]; });
                zOtras['metodo:' + dims[0].prueba] = this.generarNormalEstandar();
                porDim.forEach((d, a) => {
                    const r = this.generarPuntajesPrueba(d.p.numItems, d.p.media, d.deIntra, d.p.minimo, d.p.maximo, d.p.alfa, z[a], d.p.formaTotal || d.p.distribucion, 'alfa', this._desplazamientoAleatorio(d.p.nombre, d.p.desviacion), d.perfil, zOtras);
                    for (let j = 0; j < d.p.numItems; j++) d.cols[j][s] = r.items[j];
                });
            }
            porDim.forEach(d => d.cols.forEach(c => cols.push(c)));
            return this._matrizCorrelacion(cols);
        };
        // PRNG separado y reproducible
        const estadoPrevio = this._guardarAleatorio();
        this.inicializarAleatorio(4242);
        const R = simular(false);
        const hayPares = dims.some(p => this.perfilesItems.get(p).estructura.pares.length);
        const Rp = hayPares ? simular(true) : null;
        this._restaurarAleatorio(estadoPrevio);
        if (!R) return null;
        let srmrPares = 0;
        if (Rp) { const K = R.length; let suma = 0; for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) suma += (Rp[a][b] - R[a][b]) ** 2; srmrPares = Math.sqrt(suma / (K * (K - 1) / 2)); }
        return { R, srmrPares };
    },

    generarPuntajesPrueba(numItems, mediaTotal, desviacionTotal, minItem = null, maxItem = null, alfaObjetivo = 0, factor = null, distribucion = 'normal', indiceFiabilidad = 'alfa', desplazamiento = 0, perfil = null, zOtras = null) {
        // ENFOQUE "TOTAL AUTORITATIVO":
        // El puntaje TOTAL es la cantidad que importa para los análisis (es lo
        // que se correlaciona y se somete a la prueba de normalidad), así que se
        // genera DIRECTAMENTE con la forma elegida y con la Media (M) y la DE
        // exactas. Los ítems se derivan luego del total. Así:
        //   · "normal" produce un total realmente normal en cualquier configuración;
        //   · el selector de forma (uniforme/asimétrica) controla DE VERDAD la
        //     forma del total (sin que el teorema del límite central lo borre);
        //   · la correlación objetivo entre escalas funciona aunque α = 0
        //     (el total se gobierna por el "driver" correlacionado).
        // (1) TOTAL autoritativo con la forma pedida. Si llega un driver de
        // correlación se usa como base estandarizada; si no, una normal nueva.
        const base = factor !== null ? factor : this.generarNormalEstandar();
        // El desplazamiento por grupo (A1) entra aquí, en el total CONTINUO:
        // el reparto entero en ítems ya lo incorpora y el redondeo por persona
        // se promedia en vez de acumularse como sesgo.
        const totalObjetivo = this._totalObjetivo(mediaTotal, desviacionTotal, base, distribucion, desplazamiento);
        // (2) Reparto del total en ítems (indiceFiabilidad se conserva por
        // compatibilidad de la firma: el modelo congenérico del modo ω vive ahora
        // en el perfil de ítems, ver _perfilesDeItems).
        return this._repartirEnItems(numItems, totalObjetivo, mediaTotal, desviacionTotal, minItem, maxItem, alfaObjetivo, perfil, zOtras, base);
    },

    /**
     * Reparte un total ya generado en k ítems. Modelo (B5):
     *     ítem_i = M/k + δ_i + w_i·(T − M) + ruido_i + cruz_i
     *  · δ_i: desplazamiento de la media del ítem (Σδ = 0)  → ítems «fáciles/difíciles»;
     *  · w_i: peso del ítem en el total (Σw = 1)            → cargas desiguales;
     *  · ruido_i: desviaciones centradas (Σ = 0) cuya escala gobierna la
     *    fiabilidad (λ se calibra para que α/ω observado sea el pedido);
     *  · cruz_i: carga cruzada desde otra dimensión del mismo test, centrada
     *    (Σ = 0) para que el total no cambie.
     * Con perfil nulo (o de nivel «ninguna») los ítems son paralelos: δ = 0 y
     * w = 1/k, como antes. La suma de los ítems es SIEMPRE el total.
     */
    _repartirEnItems(numItems, totalObjetivo, mediaTotal, desviacionTotal, minItem, maxItem, alfaObjetivo, perfil, zOtras, base) {
        const k = numItems;
        const modoLikert = (minItem !== null && maxItem !== null);

        // Estructura inter-ítem para que el α de Cronbach observado se acerque al
        // objetivo: λ es la carga factorial (Spearman-Brown invertida); su único
        // efecto es fijar la escala del ruido de ítem (a mayor λ, menos ruido).
        let lambda = 0;
        if (alfaObjetivo > 0 && alfaObjetivo < 1 && k >= 2) {
            const rMedia = alfaObjetivo / (k - alfaObjetivo * (k - 1));
            lambda = Math.sqrt(Math.max(0, Math.min(0.999, rMedia)));
        }
        const desviacionPorItem = desviacionTotal / Math.sqrt(k * (1 + (k - 1) * lambda * lambda));
        const unicidad = Math.sqrt(1 - lambda * lambda);

        // Desviaciones de ítem centradas a suma 0: ruido idiosincrático. (Un
        // factor común sumado por igual a todos los ítems se cancela al centrar,
        // así que no se genera.) No afectan al nivel del total.
        const g = new Array(k);
        let gSuma = 0;
        for (let i = 0; i < k; i++) { g[i] = unicidad * this.generarNormalEstandar(); gSuma += g[i]; }
        const gMedia = gSuma / k;

        // Perfil de ítems (B5)
        const delta = perfil ? perfil.delta : null;
        const peso = perfil ? perfil.peso : null;
        let cruz = null;
        if (perfil && !perfil.estructura && perfil.cruzadas.length && zOtras) {
            const z = typeof zOtras === 'function' ? zOtras(base) : zOtras;
            // DE del ítem sin el término cruzado: la carga cruzada c se expresa en
            // unidades estandarizadas del ítem (≈ carga secundaria c en el AFE).
            const sigmaItem = Math.sqrt((desviacionTotal * desviacionTotal) / (k * k) + desviacionPorItem * desviacionPorItem * unicidad * unicidad * (1 - 1 / k));
            cruz = new Float64Array(k);
            let suma = 0;
            perfil.cruzadas.forEach(({ item, sigla, c }) => {
                const zb = z[sigla];
                if (typeof zb === 'number' && isFinite(zb)) { cruz[item] += c * sigmaItem * zb; suma += c * sigmaItem * zb; }
            });
            const media = suma / k;
            for (let i = 0; i < k; i++) cruz[i] -= media;    // suma 0: el total no cambia
        }
        const mediaItem = mediaTotal / k, desvioTotal = totalObjetivo - mediaTotal;
        const cuota = i => mediaItem + (delta ? delta[i] : 0) + (peso ? peso[i] : 1 / k) * desvioTotal;
        // (C1) reparto ESTRUCTURADO: ruido propio por ítem según su carga, cruzadas
        // explícitas, factor de método y pares de desajuste; todo centrado (pesos
        // ∝ DE del ruido propio) para que la suma sea exactamente el total.
        if (perfil && perfil.estructura) {
            const est = perfil.estructura;
            const sigma0 = desviacionTotal / est.sumaLambda;
            // varianza extra por ítem (cruzadas y método) que se descuenta del ruido
            // propio: así la carga propia no se atenúa por añadir esos componentes
            const extra = new Float64Array(k), cruzE = new Float64Array(k), metE = new Float64Array(k);
            if (perfil.cruzadas.length && zOtras) {
                const z = typeof zOtras === 'function' ? zOtras(base) : zOtras;
                // el centrado resta 1/k del término a cada ítem: se aplica c·k/(k − 1) para que
                // el ítem conserve exactamente la cruzada pedida (los demás reciben −c/(k − 1))
                const inflar = k / (k - 1);
                let sumaC = 0;
                perfil.cruzadas.forEach(({ item, sigla, c }) => { const zb = z[sigla]; if (typeof zb === 'number' && isFinite(zb)) { const v = c * inflar * sigma0 * zb; cruzE[item] += v; sumaC += v; extra[item] += c * c * sigma0 * sigma0; } });
                for (let i = 0; i < k; i++) cruzE[i] -= sumaC / k;   // Σ = 0: el total no cambia
            }
            if (est.metodo && zOtras) {
                const z = typeof zOtras === 'function' ? zOtras(base) : zOtras;
                const zm = z['metodo:' + est.prueba];
                if (typeof zm === 'number' && isFinite(zm)) {
                    // contraste pre-centrado: +aplicada·(1 − m/k) en los invertidos, −aplicada·(m/k) en los directos
                    const m = est.metodo.items.length, enSet = new Uint8Array(k);
                    est.metodo.items.forEach(i => { enSet[i] = 1; });
                    for (let i = 0; i < k; i++) { const coef = enSet[i] ? est.metodo.aplicada * (1 - m / k) : -est.metodo.aplicada * (m / k); metE[i] = coef * sigma0 * zm; extra[i] += coef * coef * sigma0 * sigma0; }
                }
            }
            const s = new Float64Array(k), e = new Float64Array(k);
            for (let i = 0; i < k; i++) {
                const total = est.mu * sigma0 * Math.sqrt(Math.max(0.02, 1 - est.lambda[i] * est.lambda[i]));
                s[i] = Math.sqrt(Math.max(0.2 * total * total, total * total - extra[i]));
                e[i] = s[i] * this.generarNormalEstandar();
            }
            est.pares.forEach(par => { const u = this.generarNormalEstandar(); const r = par.rho; e[par.i] = Math.sqrt(1 - r) * e[par.i] + Math.sqrt(r) * s[par.i] * u; e[par.j] = Math.sqrt(1 - r) * e[par.j] + Math.sqrt(r) * s[par.j] * u; });
            let sumaE = 0, sumaS = 0;
            for (let i = 0; i < k; i++) { sumaE += e[i]; sumaS += s[i]; }
            for (let i = 0; i < k; i++) e[i] = e[i] - (s[i] / sumaS) * sumaE + cruzE[i] + metE[i];   // centrado (pesos ∝ DE) + extras de suma 0
            if (!modoLikert) {
                const items = new Array(k);
                for (let i = 0; i < k; i++) items[i] = Math.round((cuota(i) + e[i]) * 100) / 100;
                const total = Math.round(items.reduce((a, b) => a + b, 0) * 100) / 100;
                return { items, total, factorUtilizado: base };
            }
            const totalEntero = this._totalEnteroLikert(k, minItem, maxItem, totalObjetivo);
            const items = new Array(k);
            for (let i = 0; i < k; i++) items[i] = Math.max(minItem, Math.min(maxItem, Math.round(cuota(i) + e[i])));
            let diff = totalEntero - items.reduce((a, b) => a + b, 0);
            let guard = 0;
            const limite = k * (maxItem - minItem) + k * 4 + 50;
            while (diff !== 0 && guard < limite) {
                const idx = Math.floor(this.aleatorio() * k);
                const paso = diff > 0 ? 1 : -1;
                const nuevo = items[idx] + paso;
                if (nuevo >= minItem && nuevo <= maxItem) { items[idx] = nuevo; diff -= paso; }
                guard++;
            }
            return { items, total: items.reduce((a, b) => a + b, 0), factorUtilizado: base };
        }

        if (!modoLikert) {
            // MEDIDA CONTINUA: ítem = cuota + desviación centrada → la suma es
            // EXACTAMENTE el total objetivo (forma y M/DE intactas). 2 decimales.
            const items = new Array(k);
            for (let i = 0; i < k; i++) {
                items[i] = Math.round((cuota(i) + desviacionPorItem * (g[i] - gMedia) + (cruz ? cruz[i] : 0)) * 100) / 100;
            }
            const total = Math.round(items.reduce((a, b) => a + b, 0) * 100) / 100;
            return { items: items, total: total, factorUtilizado: base };
        }

        // ESCALA LIKERT (rango fijado): el total se acota al rango ALCANZABLE
        // [k·mín, k·máx] (solo afecta a la cola extrema, poco frecuente) y se
        // reparte en ítems ENTEROS dentro de [mín, máx]. El grueso del total
        // conserva la forma normal.
        const totalEntero = this._totalEnteroLikert(k, minItem, maxItem, totalObjetivo);

        // Dispersión por ítem: nunca por debajo de ~media unidad Likert, para que
        // los ítems SIEMPRE varíen (evita que un total entero exacto colapse en
        // ítems idénticos). No afecta al total: la suma se reajusta luego al total
        // autoritativo, así que esta dispersión solo reparte los ítems alrededor
        // de su media (su efecto es sobre el α de Cronbach observado, no sobre M/DE).
        const dispersionItem = Math.max(desviacionPorItem, 0.6);
        const items = new Array(k);
        for (let i = 0; i < k; i++) {
            let v = Math.round(cuota(i) + dispersionItem * (g[i] - gMedia) + (cruz ? cruz[i] : 0));
            v = Math.max(minItem, Math.min(maxItem, v));
            items[i] = v;
        }
        // ...y se ajusta la suma exactamente al total autoritativo moviendo ±1 en
        // ítems que sigan dentro del rango (preserva el total normal observado).
        let diff = totalEntero - items.reduce((a, b) => a + b, 0);
        let guard = 0;
        const limite = k * (maxItem - minItem) + k * 4 + 50;
        while (diff !== 0 && guard < limite) {
            const idx = Math.floor(this.aleatorio() * k);
            const paso = diff > 0 ? 1 : -1;
            const nuevo = items[idx] + paso;
            if (nuevo >= minItem && nuevo <= maxItem) { items[idx] = nuevo; diff -= paso; }
            guard++;
        }
        const total = items.reduce((a, b) => a + b, 0);
        return { items: items, total: total, factorUtilizado: base };
    },

    calibrarFiabilidad(prueba, indice) {
        const objetivo = prueba.alfa;
        if (!(objetivo > 0 && objetivo < 1) || prueba.numItems < 2) return objetivo;
        const perfil = this.perfilesItems ? (this.perfilesItems.get(prueba) || null) : null;
        const continua = (prueba.minimo === null || prueba.maximo === null);
        if (continua && indice !== 'omega') {
            // Sin redondeo, el α del modelo de reparto tiene FÓRMULA CERRADA (ver
            // _alfaTeorica): se resuelve por bisección sobre la fórmula, sin
            // simular. Así la calibración no añade ruido de muestreo, que con
            // totales asimétricos (colas largas) llegaba a ±0.1 en el α observado.
            let lo = 0.01, hi = 0.985;
            for (let it = 0; it < 40; it++) {
                const mid = (lo + hi) / 2;
                if (this._alfaTeorica(prueba, mid, perfil) < objetivo) lo = mid; else hi = mid;
            }
            return (lo + hi) / 2;
        }
        // Likert (redondeo) u ω: se simula. Con forma asimétrica se simulan más
        // casos, porque la varianza muestral de un total con cola larga es ruidosa.
        const nSim = prueba.distribucion === 'asimetrica' ? 1000 : 400;
        let lo = 0.01, hi = 0.985;
        for (let it = 0; it < 12; it++) {
            const mid = (lo + hi) / 2;
            const obs = this._simularIndice(prueba, mid, indice, nSim);
            if (obs === null || !isFinite(obs)) break;
            if (obs < objetivo) lo = mid; else hi = mid;
        }
        return Math.max(0.01, Math.min(0.985, (lo + hi) / 2));
    },

    _simularIndice(prueba, objetivoInterno, indice, nSim = 400) {
        const k = prueba.numItems;
        const cols = Array.from({ length: k }, () => new Array(nSim));
        // Se simula con la misma DE intra-grupo y el mismo desplazamiento por
        // grupo (códigos sorteados) que tendrá la base: la varianza entre grupos
        // se reparte por igual entre los ítems y sube la fiabilidad observada.
        const deIntra = prueba.desviacion * this._factorDE(prueba.nombre);
        // (B5) Mismo perfil de ítems que tendrá la base; las otras dimensiones
        // (cargas cruzadas) se simulan con su correlación objetivo con esta.
        const perfil = this.perfilesItems ? (this.perfilesItems.get(prueba) || null) : null;
        const zOtras = (perfil && (perfil.cruzadas.length || (perfil.estructura && perfil.estructura.metodo))) ? this._zOtrasSimuladas(prueba, perfil) : null;
        for (let i = 0; i < nSim; i++) {
            const p = this.generarPuntajesPrueba(k, prueba.media, deIntra, prueba.minimo,
                prueba.maximo, objetivoInterno, null, prueba.formaTotal || prueba.distribucion, indice,
                this._desplazamientoAleatorio(prueba.nombre, prueba.desviacion), perfil, zOtras);
            for (let j = 0; j < k; j++) cols[j][i] = p.items[j];
        }
        return this._indiceObservado(cols, indice);
    },

    // Función (base → {sigla: z}) que simula el z de las otras dimensiones de un
    // test a partir del de esta, con la correlación OBJETIVO entre ambas (la de
    // la matriz preparada si existe; si no, el r intra-test del cuadro).
    _zOtrasSimuladas(prueba, perfil) {
        const siglas = [...new Set(perfil.cruzadas.map(c => c.sigla))];
        const rCon = {};
        siglas.forEach(sigla => {
            let r = null;
            if (this.correlR && this.correlVariables && this.correlVariables.length) {
                const ia = this.correlVariables.findIndex(v => v.tipo === 'escala' && v.clave === this._claveEscala(prueba));
                const ib = this.correlVariables.findIndex(v => v.tipo === 'escala' && v.clave === this._siglaOnda(prueba, sigla));
                if (ia >= 0 && ib >= 0) r = this.correlR[ia][ib];
            }
            if (r === null) {
                const g = (this.configuracion.gruposPruebas || []).find(x => x.escalas.includes(prueba.nombreCorto));
                r = g && g.rIntra !== undefined ? g.rIntra : 0.40;
            }
            rCon[sigla] = Math.max(-0.99, Math.min(0.99, r));
        });
        const conMetodo = !!(perfil.estructura && perfil.estructura.metodo);
        return (base) => {
            const z = {};
            siglas.forEach(sigla => { const r = rCon[sigla]; z[sigla] = r * base + Math.sqrt(1 - r * r) * this.generarNormalEstandar(); });
            if (conMetodo) z['metodo:' + perfil.estructura.prueba] = this.generarNormalEstandar();
            return z;
        };
    },

    // α de Cronbach TEÓRICO del modelo de reparto (_repartirEnItems) sin redondeo:
    //   ítem_i = μ_i + w_i·D + s·u_i + cruz_i,  D = T − M con Var(D) = σ² (toda la base),
    //   Var(u_i) = (1 − λ²)(1 − 1/k),  cruz_i = σ_ítem·Σ_e a_ie·z_e con a_ie = c_e·(1[ítem_e = i] − 1/k).
    //   α = k/(k−1)·(1 − Σ_i Var(ítem_i)/σ²), con Var(T) = σ² porque Σ ítems = T.
    _alfaTeorica(prueba, objetivoInterno, perfil) {
        const k = prueba.numItems, sigma = prueba.desviacion, sw = sigma * this._factorDE(prueba.nombre);
        let lambda = 0;
        if (objetivoInterno > 0 && objetivoInterno < 1 && k >= 2) {
            const rMedia = objetivoInterno / (k - objetivoInterno * (k - 1));
            lambda = Math.sqrt(Math.max(0, Math.min(0.999, rMedia)));
        }
        const s = sw / Math.sqrt(k * (1 + (k - 1) * lambda * lambda)), u2 = 1 - lambda * lambda;
        const varRuido = s * s * u2 * (1 - 1 / k);
        const sigmaItem = Math.sqrt((sw * sw) / (k * k) + varRuido);
        const cruz = perfil ? perfil.cruzadas : [];
        // correlaciones objetivo entre las dimensiones que aportan cargas cruzadas, y con esta
        const rAB = cruz.map(e => this._rObjetivoEntre(this._claveEscala(prueba), this._siglaOnda(prueba, e.sigla)));
        const rBB = cruz.map(e => cruz.map(f => this._rObjetivoEntre(e.sigla, f.sigla)));
        let sumaVar = 0;
        for (let i = 0; i < k; i++) {
            const w = perfil ? perfil.peso[i] : 1 / k;
            let varCruz = 0, covCruzD = 0;
            if (cruz.length) {
                const a = cruz.map(e => e.c * ((e.item === i ? 1 : 0) - 1 / k));
                for (let e = 0; e < cruz.length; e++) {
                    covCruzD += a[e] * rAB[e];
                    for (let f = 0; f < cruz.length; f++) varCruz += a[e] * a[f] * rBB[e][f];
                }
            }
            sumaVar += w * w * sigma * sigma + varRuido + sigmaItem * sigmaItem * varCruz + 2 * w * sigma * sigmaItem * covCruzD;
        }
        return (k / (k - 1)) * (1 - sumaVar / (sigma * sigma));
    },

    // ============ AUTOCALIBRACIÓN DE LA FIABILIDAD ============
    // El redondeo de los ítems Likert desplaza la fiabilidad OBSERVADA respecto
    // de la pedida (p. ej. 0.70 salía 0.76). Aquí se busca por bisección el
    // valor interno que hace que el índice observado ≈ el objetivo del usuario.
    _indiceObservado(cols, indice) {
        const k = cols.length, n = cols[0].length;
        if (k < 2 || n < 3) return null;
        const media = c => c.reduce((a, b) => a + b, 0) / n;
        const varianza = c => { const m = media(c); return c.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1); };
        const total = new Array(n).fill(0);
        for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) total[i] += cols[j][i];
        const vT = varianza(total);
        if (!(vT > 0)) return null;
        const vars = cols.map(varianza);
        if (indice === 'omega' && k >= 3) {
            // Ejes principales iterados (1 factor) sobre R y métrica de covarianzas:
            // réplica compacta del estimador de fiabilidad.js, para calibrar
            // contra el MISMO número que verá el usuario en el Analizador.
            const des = vars.map(v => Math.sqrt(v) || 1e-9);
            const R = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => {
                const ma = media(cols[a]), mb = media(cols[b]);
                let s = 0;
                for (let i = 0; i < n; i++) s += (cols[a][i] - ma) * (cols[b][i] - mb);
                return (s / (n - 1)) / (des[a] * des[b]);
            }));
            let h2 = R.map((fila, i) => Math.max(...fila.map((r, j) => i === j ? 0 : Math.abs(r))));
            let cargas = null;
            for (let iter = 0; iter < 25; iter++) {
                const Rr = R.map((fila, i) => fila.map((r, j) => i === j ? h2[i] : r));
                let v = new Array(k).fill(1 / Math.sqrt(k)), lam = 0;
                for (let p = 0; p < 40; p++) {
                    const w = Rr.map(fila => fila.reduce((s, r, j) => s + r * v[j], 0));
                    const norma = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
                    if (!(norma > 0)) return null;
                    v = w.map(x => x / norma); lam = norma;
                }
                if (!(lam > 0)) return null;
                const signo = v.reduce((s, x) => s + x, 0) >= 0 ? 1 : -1;
                const nuevas = v.map(x => Math.sqrt(lam) * x * signo);
                const cambio = Math.max(...nuevas.map((c, i) => Math.abs(c * c - h2[i])));
                h2 = nuevas.map(c => Math.min(c * c, 0.999));
                cargas = nuevas;
                if (cambio < 1e-6) break;
            }
            if (!cargas) return null;
            const lCov = cargas.map((l, i) => Math.max(l, 0) * des[i]);
            const thCov = cargas.map((l, i) => (1 - Math.min(l * l, 0.999)) * vars[i]);
            const sl = lCov.reduce((s, x) => s + x, 0);
            const st = thCov.reduce((s, x) => s + x, 0);
            return (sl * sl) / ((sl * sl) + st);
        }
        const sumaVar = vars.reduce((a, b) => a + b, 0);
        return (k / (k - 1)) * (1 - sumaVar / vT);
    },

    // Ajuste iterativo de las medias de ítem (perfil.delta) de una dicotómica:
    // simula el reparto y corrige δ_i por la diferencia entre la dificultad
    // pedida y la realizada (4 pasadas; Σδ se mantiene en 0).
    _calibrarDificultades(prueba, perfil, alfaInterno, indiceFiab, nSim = 1200) {
        const k = prueba.numItems, objetivo = prueba.dificultadesEfectivas;
        if (!objetivo || objetivo.length !== k || !perfil.delta) return;
        const deIntra = prueba.desviacion * this._factorDE(prueba.nombre);
        const zOtras = (perfil.cruzadas && perfil.cruzadas.length) ? this._zOtrasSimuladas(prueba, perfil) : null;
        for (let pasada = 0; pasada < 4; pasada++) {
            const suma = new Float64Array(k);
            for (let s = 0; s < nSim; s++) {
                const r = this.generarPuntajesPrueba(k, prueba.media, deIntra, prueba.minimo, prueba.maximo, alfaInterno, null, prueba.formaTotal || prueba.distribucion, indiceFiab, this._desplazamientoAleatorio(prueba.nombre, prueba.desviacion), perfil, zOtras);
                for (let j = 0; j < k; j++) suma[j] += r.items[j] - prueba.minimo;
            }
            let maxDif = 0, media = 0;
            const ajuste = new Float64Array(k);
            for (let j = 0; j < k; j++) { const pSim = suma[j] / nSim; ajuste[j] = objetivo[j] - pSim; maxDif = Math.max(maxDif, Math.abs(ajuste[j])); media += ajuste[j] / k; }
            if (maxDif < 0.01) break;
            for (let j = 0; j < k; j++) perfil.delta[j] += 1.15 * (ajuste[j] - media);   // ligeramente sobrecorregido: el recorte lo amortigua
        }
    },

    // Estadísticos de ítem de una dicotómica: dificultades observadas y discriminación (r ítem-resto)
    _estadisticosDicotomica(cols) {
        const k = cols.length, n = cols[0].length;
        const p = cols.map(c => { let s = 0, m = 0; for (let i = 0; i < n; i++) if (c[i] === c[i]) { s += c[i]; m++; } return m ? s / m : NaN; });
        const disc = cols.map((c, j) => {
            const resto = new Array(n).fill(0), x = new Array(n).fill(0); const validos = [];
            for (let i = 0; i < n; i++) { let ok = true, s = 0; for (let q = 0; q < k; q++) { if (!(cols[q][i] === cols[q][i])) { ok = false; break; } if (q !== j) s += cols[q][i]; } if (ok) { validos.push(i); resto[i] = s; x[i] = c[i]; } }
            if (validos.length < 10) return NaN;
            return this._corr(validos.map(i => x[i]), validos.map(i => resto[i]));
        });
        return { p, disc };
    },

    // Transforma un z ~ N(0,1) en otra forma de distribución, devolviendo SIEMPRE
    // un valor estandarizado (media 0, varianza 1). Así el puntaje total conserva
    // la Media (M) y la DE objetivo, cambiando solo la FORMA de la distribución.
    // Es monótona, de modo que la estructura de correlación (factor latente F y
    // correlaciones objetivo) se preserva por orden de rango.
    transformarFormaZ(z, distribucion) {
        if (typeof distribucion === 'function') return distribucion(z);   // (C5) forma propia de una escala (beta-binomial)
        switch (distribucion) {
            case 'uniforme': {
                // z normal -> uniforme(0,1) por la CDF -> uniforme estandarizada.
                // U(0,1) tiene media 0.5 y varianza 1/12.
                const u = this.normalCDF(z);
                return (u - 0.5) * Math.sqrt(12);
            }
            case 'asimetrica': {
                // Log-normal estandarizada (sesgo positivo). sigma controla el sesgo.
                const sigma = SIGMA_FORMA_ASIMETRICA;
                const x = Math.exp(sigma * z);
                const mediaX = Math.exp((sigma * sigma) / 2);
                const varX = (Math.exp(sigma * sigma) - 1) * Math.exp(sigma * sigma);
                return (x - mediaX) / Math.sqrt(varX);
            }
            case 'normal':
            default:
                return z; // Identidad: comportamiento original intacto.
        }
    },

    // Genera un valor para una variable sociodemográfica según su distribución.
    // `normalEstandar` permite inyectar un valor normal "driver" (correlaciones)
    // en las distribuciones normal y asimétrica.
    generarValorSociodemografico(socio, normalEstandar = null, desplazamiento = 0, factorDE = 1, formaAplicada = false) {
        const dist = socio.distribucion || 'normal';

        // Tipos discretos → enteros (sin redondeo decimal)
        if (dist === 'categorica') {
            return this.generarCategoria(socio.minimo, socio.maximo);
        }
        if (dist === 'binaria') {
            return this.generarBinaria(socio.promedio);
        }
        if (dist === 'conteo') {
            return this.generarPoisson(socio.promedio);
        }

        // Tipos continuos → clamp al rango + redondeo según decimales
        return this._valorContinuoSocio(socio, normalEstandar, desplazamiento, factorDE, formaAplicada);
    },

    // ============ FUNCIONES DE VALOR (fuente única) ============
    // Cómo se convierte un driver normal z en el valor FINAL de una variable.
    // Las usan la generación y la calibración de correlaciones exactas, que
    // mide las correlaciones sobre estos mismos valores: si cambia una, cambia
    // en los dos sitios a la vez.
    // Total CONTINUO objetivo de una escala: Media + DE·forma(z) + desplazamiento.
    _totalObjetivo(mediaTotal, desviacionTotal, base, distribucion, desplazamiento) {
        // (Revisión transversal, F-5) forma propia (beta-binomial de una dicotómica): el
        // cuantil se aplica al LATENTE completo (driver intra + desplazamiento por grupos,
        // en unidades de la DE total), así el total es un entero de la forma pedida.
        // Antes se escalaba el cuantil discreto por la DE intra y se sumaba el
        // desplazamiento: al redondear, los valores se agolpaban y la varianza caía un 8 %.
        if (typeof distribucion === 'function' && distribucion.sigma > 0) {
            // cada grupo (cada valor del desplazamiento) tiene SU beta-binomial: media
            // desplazada y DE intra; las formas se cachean por (desplazamiento, DE)
            let desp = desplazamiento || 0;
            if (!desp && Math.abs(desviacionTotal - distribucion.sigma) < 1e-9) return mediaTotal + distribucion.sigma * distribucion(base);
            // el desplazamiento se cuantiza a σ/50 (error ≤ 0.01·σ): con efectos continuos
            // (CCI) la caché queda acotada a unas decenas de formas en vez de una por persona
            const paso = distribucion.sigma / 50;
            desp = Math.round(desp / paso) * paso;
            const clave = Math.round(desp / paso) + '|' + Math.round(desviacionTotal * 1000);
            const cache = distribucion.cache || (distribucion.cache = new Map());
            let forma = cache.get(clave);
            if (!forma) { forma = this._formaBetaBinomial(distribucion.k, mediaTotal + desp - distribucion.k * distribucion.minimo, desviacionTotal); cache.set(clave, forma); }
            return mediaTotal + desp + desviacionTotal * forma(base);
        }
        return mediaTotal + desviacionTotal * this.transformarFormaZ(base, distribucion) + desplazamiento;
    },

    // Total ENTERO de una escala Likert: recorte al rango alcanzable [k·mín, k·máx]
    // (solo afecta a la cola extrema) y redondeo.
    _totalEnteroLikert(k, minItem, maxItem, totalObjetivo) {
        return Math.round(Math.max(k * minItem, Math.min(k * maxItem, totalObjetivo)));
    },

    // Total FINAL de una escala a partir de su driver (Likert → entero acotado).
    _totalDesdeDriver(prueba, z, desplazamiento, factorDE, formaAplicada = false) {
        // la forma propia (beta-binomial) se aplica SIEMPRE al final, aunque el driver ya venga igualado por grupos
        const t = this._totalObjetivo(prueba.media, prueba.desviacion * factorDE, z, prueba.formaTotal ? prueba.formaTotal : (formaAplicada ? 'normal' : prueba.distribucion), desplazamiento);
        return (prueba.minimo !== null && prueba.maximo !== null) ? this._totalEnteroLikert(prueba.numItems, prueba.minimo, prueba.maximo, t) : t;
    },

    // Valor FINAL de un sociodemográfico continuo (normal, asimétrico, uniforme):
    // driver → valor + desplazamiento por grupo (A1, antes de recortar y
    // redondear: redondear después sesgaba la d) → recorte → decimales.
    _valorContinuoSocio(socio, normalEstandar, desplazamiento = 0, factorDE = 1, formaAplicada = false) {
        const dist = formaAplicada ? 'normal' : (socio.distribucion || 'normal');
        let valor;
        if (dist === 'uniforme') {
            valor = this.generarUniforme(socio.minimo, socio.maximo);
        } else if (dist === 'asimetrica') {
            valor = this.generarAsimetrico(socio.promedio, socio.desviacion * factorDE, normalEstandar);
        } else {
            valor = this.generarValorNormal(socio.promedio, socio.desviacion * factorDE, normalEstandar);
        }
        valor += desplazamiento;
        if (socio.minimo !== null && socio.maximo !== null) {
            valor = Math.max(socio.minimo, Math.min(socio.maximo, valor));
        }
        const factor = Math.pow(10, socio.decimales);
        return Math.round(valor * factor) / factor;
    },

});
