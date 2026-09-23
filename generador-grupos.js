// ============================================================================
// generador-grupos.js — diferencias por grupo, interacción, anidamiento (CCI), variables discretas y sus efectos
// Métodos de GeneradorDatos añadidos al prototipo (misma semántica que en la clase).
// ============================================================================
Object.assign(GeneradorDatos.prototype, {
    // ============ DIFERENCIAS POR GRUPO (d de Cohen) ============
    // Cada fila de la tabla pide que dos grupos adyacentes de la variable de
    // agrupación difieran d·σ_intra en la variable cuantitativa. Contrato:
    //  · la Media y la DE pedidas son las de TODA la base; cada d es la MARGINAL
    //    de su agrupación (la de la prueba t/ANOVA), con amplitud
    //    Δ_k = d_k·σ/√(1 + d_k²·Var(c_k)) y ruido intra σ·√(1 − Σ_k amp_k²·Var(c_k));
    //    el desplazamiento de cada persona es Σ_k Δ_k·(código − media del código), de media 0;
    //  · el desplazamiento se aplica al valor CONTINUO (total objetivo de la
    //    escala o valor del sociodemográfico), ANTES de recortar y redondear.
    //    Antes se sumaba después y se redondeaba a entero POR PERSONA: como el
    //    entero era el mismo para todo el grupo, no se promediaba, era sesgo
    //    (con DE = 6: d = 0.8 salía 0.65 y d = 1.2 salía 1.31);
    //  · una d sobre el puntaje GENERAL derivado se traduce a la d por
    //    dimensión que hace que la d medida sobre el General sea la pedida;
    //  · las correlaciones pedidas siguen siendo las de toda la base:
    //    _matrizIntermedia descuenta la varianza y la covarianza entre grupos.
    prepararDiferenciasGrupo() {
        const cfg = this.configuracion;
        const efectivas = new Map();   // nombre de variable → [{ agrup, d, origen }]
        const anadir = (nombre, agrup, d, origen, extraAmp) => {
            if (!efectivas.has(nombre)) efectivas.set(nombre, []);
            const entrada = { agrup, d, origen };
            if (extraAmp !== undefined) entrada.extraAmp = extraAmp;
            efectivas.get(nombre).push(entrada);
        };
        const grupos = cfg.gruposPruebas || [];
        const porSigla = {};
        (cfg.pruebas || []).forEach(p => { if (!p.sufijo) porSigla[p.nombreCorto] = p; });   // (B7) las ondas T2… no son dimensiones del General
        const vistas = new Set();          // (variable, agrupación) repetida: manda la primera fila, como en las correlaciones
        const sobreGeneral = [];
        // (C4) efectos de conglomerado: nuevos en cada generación (misma semilla ⇒
        // misma base) y compartidos entre las ondas de una misma escala
        this._efectosCluster = new Map();
        (cfg.diferenciasGrupo || []).forEach(dif => {
            const agrup = (cfg.sociodemograficos || []).find(s => s.categoria === dif.agrupacion);
            const varC = this._varianzaCodigo(agrup);
            if (varC === null || !(typeof dif.d === 'number' && isFinite(dif.d)) || dif.d === 0) return;
            const esEscala = (cfg.pruebas || []).some(p => p.nombre === dif.cuantitativa);
            const esSocio = (cfg.sociodemograficos || []).some(s => s.categoria === dif.cuantitativa && !this._esSocioDiscreto(s));
            // (C4) interacción A×B (diferencia de diferencias) y anidamiento (ICC)
            if (dif.tipo === 'interaccion') {
                const agrup2 = (cfg.sociodemograficos || []).find(s => s.categoria === dif.agrupacion2);
                if (!agrup2 || agrup.distribucion !== 'binaria' || agrup2.distribucion !== 'binaria' || !(esEscala || esSocio)) return;
                const claveI = `${dif.cuantitativa}|${dif.agrupacion}×${dif.agrupacion2}`;
                if (vistas.has(claveI)) return; vistas.add(claveI);
                if (!efectivas.has(dif.cuantitativa)) efectivas.set(dif.cuantitativa, []);
                efectivas.get(dif.cuantitativa).push({ agrup, agrup2, d: dif.d, origen: 'explicita', tipo: 'interaccion' });
                return;
            }
            if (dif.tipo === 'icc') {
                if (agrup.distribucion !== 'categorica' || !(esEscala || esSocio) || !(dif.d > 0 && dif.d < 0.95)) return;
                const claveFila = `${dif.cuantitativa}|icc|${dif.agrupacion}`;
                if (vistas.has(claveFila)) return; vistas.add(claveFila);
                // efectos aleatorios de cada conglomerado, sembrados, uno por (escala base, agrupación):
                // las ondas T2… comparten el efecto de aula de su escala
                const pr = (cfg.pruebas || []).find(p => p.nombre === dif.cuantitativa);
                const claveC = `${pr && pr.base ? pr.base.nombre : dif.cuantitativa}|icc|${dif.agrupacion}`;
                if (!this._efectosCluster.has(claveC)) { const u = {}; this._nivelesDe(agrup).forEach(nv => { u[nv.codigo] = this.generarNormalEstandar(); }); this._efectosCluster.set(claveC, u); }
                if (!efectivas.has(dif.cuantitativa)) efectivas.set(dif.cuantitativa, []);
                efectivas.get(dif.cuantitativa).push({ agrup, d: dif.d, origen: 'explicita', tipo: 'icc', efectos: this._efectosCluster.get(claveC) });
                return;
            }
            const clave = `${dif.cuantitativa}|${dif.agrupacion}`;
            if (vistas.has(clave)) return;
            vistas.add(clave);
            if (esEscala || esSocio) { anadir(dif.cuantitativa, agrup, dif.d, 'explicita', dif.extraAmp); return; }
            const g = grupos.find(x => x.escalas.length >= 2 && this.nombreGeneral(x) === dif.cuantitativa);
            if (!g) return;
            const dims = g.escalas.map(s => porSigla[s]).filter(Boolean);
            if (dims.length >= 2) sobreGeneral.push({ g, dims, agrup, varC, d: dif.d, nombre: dif.cuantitativa });
        });
        // Puntaje GENERAL derivado (promedio de K dimensiones): la d pedida se
        // traslada a las dimensiones LIBRES (sin d explícita en esa agrupación),
        // con la misma d para todas ellas, de modo que la d medida sobre el
        // General sea la pedida. Es una raíz escalar (Δ_G/σ_G,intra = d) que se
        // resuelve por bisección; con varias agrupaciones sobre el mismo General
        // se repite el reparto hasta estabilizarse.
        // CONTRATO (d MARGINAL): cada d es la que medirá la prueba t/ANOVA de ESA
        // agrupación, es decir, con la DE agrupada dentro de sus grupos, que
        // incluye la varianza que aportan las OTRAS agrupaciones. Con la DE total
        // fija, la amplitud del desplazamiento de la agrupación k resulta
        // independiente de las demás: Δ_k = d_k·σ/√(1 + d_k²·Var(c_k)) (en unidades
        // de σ, amp_k = d_k/√(1 + d_k²·V_k)), y la DE del ruido intra queda
        // σ·√(1 − Σ_k amp_k²·V_k). Con una sola agrupación coincide con la fórmula
        // anterior; con varias, la anterior subestimaba cada d (1.17 salía 1.03).
        const varianzaCodigo = agrup => this._varianzaCodigo(agrup) || 0;
        // (C4) varianza del término de cada entrada: código centrado (d), producto de
        // códigos centrados (interacción: V_A·V_B) o efecto de conglomerado estandarizado (1)
        const varianzaTermino = e => (e.tipo === 'interaccion' ? varianzaCodigo(e.agrup) * varianzaCodigo(e.agrup2) : (e.tipo === 'icc' ? 1 : varianzaCodigo(e.agrup)));
        const amplitud = e => (e.tipo === 'icc' ? Math.sqrt(e.d) : e.d / Math.sqrt(1 + e.d * e.d * varianzaTermino(e)));
        const factorIntra = nombre => {
            let entre = 0;
            (efectivas.get(nombre) || []).forEach(e => { const a = amplitud(e); entre += a * a * varianzaTermino(e); });
            // Si las diferencias pedidas se llevan toda la varianza no hay ruido
            // intra posible: se deja un mínimo (el informe delatará las d).
            return Math.sqrt(Math.max(0.04, 1 - entre));
        };
        const dGeneral = (req) => {
            // d marginal observada sobre el General con las diferencias efectivas
            // actuales: Δ_G,k = (1/K)·Σ_i amp_ik·σ_i ; DE agrupada de esa
            // agrupación = √(σ_G² − Δ_G,k²·Var(c_k))
            const K = req.dims.length;
            const sigmaG = this._factorGeneral(req.g, req.dims) * req.dims.reduce((s, p) => s + p.desviacion, 0) / K;
            let deltaG = 0;
            req.dims.forEach(p => {
                (efectivas.get(p.nombre) || []).forEach(e => { if (e.agrup === req.agrup && (!e.tipo || e.tipo === 'd')) deltaG += amplitud(e) * p.desviacion / K; });
            });
            const intra = Math.sqrt(Math.max(1e-12, sigmaG * sigmaG - deltaG * deltaG * varianzaCodigo(req.agrup)));
            return deltaG / intra;
        };
        this.diferenciasLimitadas = [];
        for (let ronda = 0; ronda < (sobreGeneral.length > 1 ? 4 : 1); ronda++) {
            sobreGeneral.forEach(req => {
                const libres = req.dims.filter(p => !(efectivas.get(p.nombre) || []).some(e => e.agrup === req.agrup && e.origen === 'explicita' && (!e.tipo || e.tipo === 'd')));
                // quitar lo repartido en rondas anteriores para este General y agrupación
                req.dims.forEach(p => { if (efectivas.has(p.nombre)) efectivas.set(p.nombre, efectivas.get(p.nombre).filter(e => !(e.origen === req.nombre && e.agrup === req.agrup))); });
                if (!libres.length) {
                    if (ronda === 0) this.diferenciasLimitadas.push({ variable: req.nombre, agrupacion: req.agrup.categoria, pedido: req.d, alcanzable: dGeneral(req) });
                    return;
                }
                const probar = dLibre => { libres.forEach(p => anadir(p.nombre, req.agrup, dLibre, req.nombre)); const v = dGeneral(req); libres.forEach(p => efectivas.set(p.nombre, efectivas.get(p.nombre).filter(e => !(e.origen === req.nombre && e.agrup === req.agrup)))); return v; };
                // Rango de búsqueda ±3 (una d mayor no es plausible en psicología).
                // Si ni así se alcanza (las d explícitas de otras dimensiones tiran
                // en contra, y el desplazamiento absoluto d·σ·s está acotado porque
                // la DE total se mantiene), NO se fuerza nada: el General queda como
                // lo dejan sus dimensiones y se informa.
                let lo = -3, hi = 3;
                if (probar(lo) > req.d || probar(hi) < req.d) {
                    if (ronda === 0) this.diferenciasLimitadas.push({ variable: req.nombre, agrupacion: req.agrup.categoria, pedido: req.d, alcanzable: dGeneral(req) });
                    return;
                }
                for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (probar(mid) < req.d) lo = mid; else hi = mid; }
                libres.forEach(p => anadir(p.nombre, req.agrup, (lo + hi) / 2, req.nombre));
            });
        }
        // (B7) Las ondas T2… heredan las d que el General derivado trasladó a su
        // dimensión base (el General se forma solo con la onda 1, pero la
        // diferencia de grupo del rasgo debe persistir en las ondas siguientes).
        // Si la onda ya lleva un cambio diferencial por esa agrupación, se
        // recompone en amplitud: amp = amp(d heredada) + extraAmp.
        (cfg.pruebas || []).forEach(p => {
            if (!p.base) return;
            (efectivas.get(p.base.nombre) || []).filter(e => e.origen !== 'explicita').forEach(e => {
                const propia = (efectivas.get(p.nombre) || []).find(x => x.agrup === e.agrup);
                if (!propia) { anadir(p.nombre, e.agrup, e.d, e.origen); return; }
                if (propia.extraAmp !== undefined) {
                    const V = this._varianzaCodigo(e.agrup) || 0;
                    const amp = e.d / Math.sqrt(1 + e.d * e.d * V) + propia.extraAmp;
                    propia.d = amp / Math.sqrt(Math.max(0.05, 1 - amp * amp * V));
                }
            });
        });
        const factores = new Map();
        efectivas.forEach((lista, nombre) => {
            lista.forEach(e => { e.amplitud = amplitud(e); });   // en unidades de σ de la variable
            factores.set(nombre, factorIntra(nombre));
        });
        this.diferenciasEfectivas = efectivas;
        this.factoresDEIntra = factores;
    },

    // Desplazamientos por grupo de una variable para TODOS los participantes
    // (Float64Array), leyendo los códigos de las columnas de agrupación.
    _desplazamientosDe(base, nombre, sigmaTotal) {
        return this._partesDesplazamiento(base, nombre, sigmaTotal).desp;
    },

    // Desplazamientos por grupo de una variable con sus PARTES (una por
    // agrupación): { desp, partes: [{ agrup, d, amplitud, c, codigos }], recalcular }.
    // `amplitud` está en unidades de σ y es ajustable: la calibración exacta la
    // corrige hasta que la d MARGINAL observada sea la pedida (con varias
    // agrupaciones, la correlación muestral entre los códigos confunde las d
    // marginales: con n = 400 y tres agrupaciones, 0.53 salía 0.29 o 0.75).
    _partesDesplazamiento(base, nombre, sigmaTotal) {
        const n = base.n;
        const desp = new Float64Array(n);
        const partes = [];
        const lista = this.diferenciasEfectivas ? this.diferenciasEfectivas.get(nombre) : undefined;
        if (lista && lista.length && sigmaTotal > 0) {
            lista.forEach(e => {
                const codigos = base.columna(e.agrup.categoria).datos;
                const c = new Float64Array(n);
                if (e.tipo === 'interaccion') {
                    // (C4) producto de los códigos centrados: su pendiente es la diferencia de diferencias
                    const codigos2 = base.columna(e.agrup2.categoria).datos;
                    for (let i = 0; i < n; i++) c[i] = this._codigoCentrado(e.agrup, codigos[i]) * this._codigoCentrado(e.agrup2, codigos2[i]);
                    partes.push({ agrup: e.agrup, agrup2: e.agrup2, tipo: 'interaccion', d: e.d, amplitud: e.amplitud, c, codigos, codigos2 });
                    return;
                }
                if (e.tipo === 'icc') {
                    // (C4) efecto de conglomerado estandarizado ENTRE PERSONAS (media 0, DE 1):
                    // amplitud √CCI ⇒ varianza entre = CCI·σ² exacta, sin calibrar
                    let m = 0; for (let i = 0; i < n; i++) { c[i] = e.efectos[codigos[i]] || 0; m += c[i]; }
                    m /= n; let v = 0; for (let i = 0; i < n; i++) { c[i] -= m; v += c[i] * c[i]; }
                    const sd = Math.sqrt(v / Math.max(1, n - 1)) || 1;
                    for (let i = 0; i < n; i++) c[i] /= sd;
                    partes.push({ agrup: e.agrup, tipo: 'icc', d: e.d, amplitud: e.amplitud, c, codigos, fija: true });
                    return;
                }
                for (let i = 0; i < n; i++) c[i] = this._codigoCentrado(e.agrup, codigos[i]);
                partes.push({ agrup: e.agrup, d: e.d, amplitud: e.amplitud, c, codigos });
            });
        }
        const recalcular = () => {
            desp.fill(0);
            partes.forEach(p => { const a = p.amplitud * sigmaTotal; for (let i = 0; i < n; i++) desp[i] += a * p.c[i]; });
        };
        recalcular();
        return { desp, partes, recalcular };
    },

    // σ_G/(Σσ_i/K) del General de un test con las correlaciones OBJETIVO entre
    // sus dimensiones (parejas explícitas de la tabla III o, si no, el r intra).
    _factorGeneral(g, dims) {
        const K = dims.length;
        if (K < 2) return 1;
        const rIntra = g.rIntra === undefined ? 0.40 : g.rIntra;
        // Mismas correlaciones que quedarán en la matriz: las implicadas por los
        // modelos (mediación y moderación) mandan sobre la tabla III (B6)
        const explicitas = this._correlacionesImplicadasPorModelos().concat(this.configuracion.correlaciones || []);
        let v = 0, suma = 0;
        for (let a = 0; a < K; a++) {
            suma += dims[a].desviacion;
            for (let b = 0; b < K; b++) {
                let r = 1;
                if (a !== b) {
                    const e = explicitas.find(c => (c.a === dims[a].nombre && c.b === dims[b].nombre) || (c.a === dims[b].nombre && c.b === dims[a].nombre));
                    r = e ? Math.max(-0.99, Math.min(0.99, e.r)) : rIntra;
                }
                v += dims[a].desviacion * dims[b].desviacion * r;
            }
        }
        return suma > 0 ? Math.sqrt(Math.max(v, 1e-12)) / suma : 1;
    },

    // Factor DE intra-grupo / DE total de una variable (1 si no tiene diferencias).
    _factorDE(nombre) {
        const f = this.factoresDEIntra ? this.factoresDEIntra.get(nombre) : undefined;
        return f === undefined ? 1 : f;
    },

    // DE de un sociodemográfico como variable cuantitativa: la pedida o, para la
    // uniforme continua (que no la tiene), (máx − mín)/√12.
    _deEfectiva(socio) {
        if (typeof socio.desviacion === 'number' && isFinite(socio.desviacion) && socio.desviacion > 0) return socio.desviacion;
        if (socio.distribucion === 'uniforme' && isFinite(socio.minimo) && isFinite(socio.maximo)) return (socio.maximo - socio.minimo) / Math.sqrt(12);
        return 0;
    },

    // Igual, pero sorteando los códigos de grupo: para calibrar la fiabilidad
    // con la misma estructura entre grupos que tendrá la base.
    _desplazamientoAleatorio(nombre, sigmaTotal) {
        const lista = this.diferenciasEfectivas ? this.diferenciasEfectivas.get(nombre) : undefined;
        if (!lista || !lista.length || !(sigmaTotal > 0)) return 0;
        let total = 0;
        // (Revisión transversal, F-1) cada tipo de entrada se simula como se genera:
        //  · d: código sorteado con las PROPORCIONES reales de la agrupación (no uniforme);
        //  · interacción: producto de dos códigos centrados;
        //  · CCI: efecto de conglomerado estandarizado ≈ N(0,1) con amplitud √CCI.
        // Antes la CCI se trataba como un código lineal (amplitud·(aula − media)): con
        // 20 aulas la varianza simulada era 30 veces la real y el α calibrado salía 0.47.
        const sortear = agrup => { const niv = this._nivelesDe(agrup); return niv ? this._sortearNivel(niv) : this.generarCategoria(agrup.minimo, agrup.maximo); };
        lista.forEach(e => {
            if (e.tipo === 'icc') { total += e.amplitud * sigmaTotal * this.generarNormalEstandar(); return; }
            const c1 = this._codigoCentrado(e.agrup, sortear(e.agrup));
            if (e.tipo === 'interaccion' && e.agrup2) { total += e.amplitud * sigmaTotal * c1 * this._codigoCentrado(e.agrup2, sortear(e.agrup2)); return; }
            total += e.amplitud * sigmaTotal * c1;
        });
        return total;
    },

    // PASE 1: variables discretas. Orden de dependencias; las independientes con
    // proporciones EXACTAS en modo exacto (mayores restos + permutación) e i.i.d.
    // si no; las dependientes por un latente z = f·A_est + √(1 − f²)·e, asignando
    // los niveles por rango (proporciones exactas en la muestra siempre).
    _generarDiscretos(base, discretos, exactas) {
        const n = base.n;
        const porNombre = new Map(discretos.map(s => [s.categoria, s]));
        const hechos = new Set(), orden = [];
        const visitar = (s, pila) => {
            if (hechos.has(s.categoria)) return;
            const ref = s.dependeDe ? porNombre.get(s.dependeDe) : null;
            if (ref && !pila.has(ref.categoria)) { pila.add(s.categoria); visitar(ref, pila); }
            hechos.add(s.categoria); orden.push(s);
        };
        discretos.forEach(s => visitar(s, new Set()));
        orden.forEach(s => {
            const col = base.columna(s.categoria);
            const niveles = this._nivelesDe(s);
            const ref = s.dependeDe ? porNombre.get(s.dependeDe) : null;
            const refValida = ref && niveles && (ref.distribucion === 'binaria' || ref.distribucion === 'categorica') && s.distribucion !== 'conteo';
            if (refValida && s.fuerza > 0) {
                const refCol = base.columna(ref.categoria).datos;
                const media = this._mediaCodigo(ref), de = Math.sqrt(this._varianzaCodigo(ref) || 1) || 1;
                const f = Math.min(0.95, s.fuerza), c = Math.sqrt(1 - f * f);
                const latente = new Float64Array(n);
                for (let i = 0; i < n; i++) latente[i] = f * (refCol[i] - media) / de + c * this.generarNormalEstandar();
                const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => latente[a] - latente[b]);
                const recuentos = this._recuentosExactos(niveles, n);
                let pos = 0;
                niveles.forEach((nv, k) => { for (let j = 0; j < recuentos[k]; j++) col.datos[idx[pos++]] = nv.codigo; });
            } else if (niveles && exactas) {
                const recuentos = this._recuentosExactos(niveles, n);
                const perm = this._muestraSinReemplazo(n, n);
                let pos = 0;
                niveles.forEach((nv, k) => { for (let j = 0; j < recuentos[k]; j++) col.datos[perm[pos++]] = nv.codigo; });
            } else if (niveles) {
                for (let i = 0; i < n; i++) col.datos[i] = this._sortearNivel(niveles);
            } else {
                for (let i = 0; i < n; i++) col.datos[i] = this.generarValorSociodemografico(s, null);
            }
            if (s.niveles && s.niveles.some(x => x.etiqueta)) {
                const etiquetas = {}; s.niveles.forEach(x => { etiquetas[x.codigo] = x.etiqueta; });
                base.etiquetar(s.categoria, etiquetas);
            }
        });
    },

    // V esperada por el mecanismo latente (simulación poblacional, 6000 casos)
    _vEsperada(socio, ref) {
        const nS = 6000;
        const nivR = this._nivelesDe(ref), nivS = this._nivelesDe(socio);
        if (!nivR || !nivS) return null;
        const a = new Float64Array(nS), lat = new Float64Array(nS);
        const media = this._mediaCodigo(ref), de = Math.sqrt(this._varianzaCodigo(ref) || 1) || 1;
        const f = Math.min(0.95, socio.fuerza), c = Math.sqrt(1 - f * f);
        const recR = this._recuentosExactos(nivR, nS); let pos = 0;
        nivR.forEach((nv, k) => { for (let j = 0; j < recR[k]; j++) a[pos++] = nv.codigo; });
        // PRNG propio y fijo (mulberry32): el valor esperado no depende del estado
        // del generador principal ni lo consume, así el informe es reproducible
        let semilla = 0x9E3779B9 ^ Math.round(f * 1000) ^ (nivR.length * 131 + nivS.length * 17);
        const u = () => { semilla = (semilla + 0x6D2B79F5) | 0; let x = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
        const normal = () => { const u1 = Math.max(1e-12, u()), u2 = u(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
        for (let i = 0; i < nS; i++) lat[i] = f * (a[i] - media) / de + c * normal();
        const idx = Array.from({ length: nS }, (_, i) => i).sort((x, y) => lat[x] - lat[y]);
        const b = new Float64Array(nS); const recS = this._recuentosExactos(nivS, nS); pos = 0;
        nivS.forEach((nv, k) => { for (let j = 0; j < recS[k]; j++) b[idx[pos++]] = nv.codigo; });
        return this._cramerV(a, b);
    },

    // Fecha de nacimiento coherente con la edad (años cumplidos) a la fecha de referencia
    _rellenarFechasNacimiento(base) {
        (this.configuracion.sociodemograficos || []).forEach(s => {
            if (!s.fechaNacimiento || this._esSocioDiscreto(s)) return;
            const col = base.columna(`FechaNac_${s.categoriaCorta}`), edad = base.columna(s.categoria);
            if (!col || !edad) return;
            const refDias = s.fechaNacimiento === 'hoy' ? Math.floor(Date.now() / 86400000) : BaseColumnar.isoADias(s.fechaNacimiento);
            const refFecha = new Date(refDias * 86400000);
            const Y = refFecha.getUTCFullYear(), M = refFecha.getUTCMonth(), D = refFecha.getUTCDate();
            const mismoDiaHace = anios => Math.round(Date.UTC(Y - anios, M, D) / 86400000);
            for (let i = 0; i < base.n; i++) {
                const e = edad.datos[i];
                if (!(e === e)) { col.datos[i] = NaN; continue; }
                // Con calendario real: nació en (ref − (e+1) años, ref − e años]; así la
                // edad en años cumplidos a la referencia es exactamente `e` (sin
                // desfases por 365.25 en años sin bisiesto).
                const edadEntera = Math.max(0, Math.floor(e));
                const tope = mismoDiaHace(edadEntera), inicioExcl = mismoDiaHace(edadEntera + 1);
                const span = tope - inicioExcl;   // 365 o 366 días
                col.datos[i] = inicioExcl + 1 + Math.floor(this.aleatorio() * span);
            }
        });
    },

});
