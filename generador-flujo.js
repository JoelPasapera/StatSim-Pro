// ============================================================================
// generador-flujo.js — generarBaseDatos (los pases) y las columnas derivadas: desenlaces, cortes, jueces
// Métodos de GeneradorDatos añadidos al prototipo (misma semántica que en la clase).
// ============================================================================
Object.assign(GeneradorDatos.prototype, {
    // ========================================
    // GENERACIÓN DE DATOS ALEATORIOS
    // ========================================
    /**
     * Genera la base completa y la devuelve como BaseColumnar (base-columnar.js):
     * una columna = un arreglo tipado. `alProgresar(fraccion, etapa)` es
     * opcional: lo usa el Web Worker para informar a la interfaz.
     */
    generarBaseDatos(alProgresar = null) {
        if (typeof BaseColumnar === 'undefined') {
            throw new Error('Falta base-columnar.js: añade <script src="base-columnar.js"> antes de generador-datos.js en index.html');
        }
        const avisar = (fraccion, etapa) => { if (typeof alProgresar === 'function') alProgresar(fraccion, etapa); };

        // Inicializar la fuente de aleatoriedad (sembrada si hay semilla)
        this.inicializarAleatorio(this.configuracion.semilla);

        // (C5) dicotómicas: Media (si hay dificultades) y DE derivadas ANTES de clonar ondas
        this._ajustarDicotomicas(this.configuracion);
        // (B7) Medidas repetidas: cada onda T2… es un clon de su escala base con
        // media desplazada, estabilidad como correlación y las mismas diferencias
        // por grupo (más el cambio diferencial). La configuración queda
        // EXPANDIDA para todo lo que sigue (columnas, informe, etiquetas).
        this.configuracion = this._expandirConfiguracion(this.configuracion);

        // Estado de la generación anterior: nada debe sobrevivir (el panel de
        // diagnóstico lee estos campos y no debe mostrar avisos de otra base).
        this.diagnosticoCorrelaciones = null;
        this.correlVariables = [];
        this.correlR = null;
        this.correlRIntermedia = null;
        this.correlL = [];
        this.driversOrtogonalizados = false;
        this.driversEnValor = new Set();
        this.datosGenerados = null;
        avisar(0.02, 'Preparando la configuración');

        // (A1) Diferencias por grupo: traduce la tabla a diferencias efectivas
        // por variable y calcula la DE intra-grupo de cada una. Va ANTES de las
        // correlaciones, que se compensan por la varianza entre grupos.
        this.prepararDiferenciasGrupo();

        // Preparar la estructura de correlación si la hay: tabla III no vacía,
        // relleno intra-test (tests con ≥ 2 dimensiones) o diferencias por
        // grupo en modo exacto. Antes solo se preparaba con la tabla III no
        // vacía, y con ella vacía las dimensiones de un mismo test salían
        // independientes pese al r del cuadro «Pruebas del estudio» (A4).
        const hayCorrelaciones = this._hayEstructuraDeCorrelacion();
        if (hayCorrelaciones) {
            this.prepararCorrelaciones();
            // (B6) el criterio de una moderación lleva forma normal en ambos modos
            (this.modelosModeracion || []).forEach(md => { const v = this.correlVariables[md.iY]; if (v) this.driversEnValor.add(v.tipo + ':' + v.clave); });
        }
        avisar(0.06, 'Estructura de correlación lista');

        // (B5) Perfil de ítems de cada escala (medias, pesos, cargas cruzadas),
        // derivado de la semilla UNA vez: lo usan la calibración de la
        // fiabilidad y la generación, que así reparten igual.
        this.perfilesItems = this._perfilesDeItems();

        const n = this.configuracion.tamanoMuestra;
        const pruebas = this.configuracion.pruebas;
        const socios = this.configuracion.sociodemograficos;
        const grupos = (this.configuracion.gruposPruebas || []).filter(g => g.escalas.length >= 2);
        const discretos = socios.filter(s => this._esSocioDiscreto(s));
        const continuos = socios.filter(s => !this._esSocioDiscreto(s));

        // ---- Columnas, en el orden del CSV: ID, sociodemográficos (orden de la
        // tabla), TODOS los ítems, totales de las dimensiones, generales, y al
        // final el puntaje GENERAL derivado de cada test. Las imperfecciones y
        // los percentiles añaden las suyas después.
        this._comprobarNombresDeColumna();
        const base = new BaseColumnar(n);
        const colID = base.agregar('ID', true);
        for (let i = 0; i < n; i++) colID.datos[i] = i + 1;
        const colSocio = new Map();
        socios.forEach(s => {
            colSocio.set(s.categoria, base.agregar(s.categoria, this._esSocioDiscreto(s)));
            // (B9) la fecha de nacimiento va justo después de su edad
            if (s.fechaNacimiento && !this._esSocioDiscreto(s)) { base.agregar(`FechaNac_${s.categoriaCorta}`, true); base.formatear(`FechaNac_${s.categoriaCorta}`, 'fecha'); }
        });
        const colItems = new Map();   // prueba → [columnas de sus ítems]
        pruebas.forEach(p => {
            if (p.tipo === 'general') { colItems.set(p, []); return; }
            const likert = p.minimo !== null && p.maximo !== null;
            colItems.set(p, this._itemsDe(p).map(nombre => base.agregar(nombre, likert)));
        });
        const colTotal = new Map();
        pruebas.forEach(p => { if (p.tipo !== 'general') colTotal.set(p, base.agregar(this.columnaDeEscala(p), false)); });
        pruebas.forEach(p => { if (p.tipo === 'general') colTotal.set(p, base.agregar(this.columnaDeEscala(p), false)); });
        const colGeneral = new Map();
        grupos.forEach(g => {
            const dims = g.escalas.map(sigla => base.columna(`Dimension_${sigla}`)).filter(Boolean);
            if (dims.length === g.escalas.length) colGeneral.set(g, { columna: base.agregar(`General_${g.sigla}`, true), dims });
        });

        // PASE 1 — variables DISCRETAS (binaria, categórica, conteo) de todos los
        // participantes: son las que agrupan y no reciben desplazamiento.
        this._generarDiscretos(base, discretos, this.configuracion.correlacionesExactas !== false);
        avisar(0.10, 'Sociodemográficos de agrupación');

        // Matriz de drivers con correlación muestral EXACTA (si procede). En
        // modo exacto los drivers se hacen además ORTOGONALES a los códigos de
        // grupo, así las medias de grupo del driver son exactamente 0 y la d
        // obtenida no fluctúa por el muestreo (igual que la r).
        const exactas = hayCorrelaciones && this.configuracion.correlacionesExactas !== false;
        if (exactas) avisar(0.12, 'Calibrando correlaciones exactas');
        const funcionesValor = exactas ? this._funcionesDeValor(base) : null;
        const matrizDrivers = exactas ? this.generarMatrizDrivers(n, this._matrizCodigosGrupo(base), funcionesValor) : null;
        avisar(0.32, 'Calibrando la fiabilidad');
        // Fiabilidad autocalibrada: una vez por escala (no por participante).
        const indiceFiab = this.configuracion.indiceFiabilidad || 'alfa';
        const objetivoInterno = new Map();
        pruebas.forEach(p => {
            const perfil = this.perfilesItems.get(p);
            if (perfil && perfil.estructura) { this._calibrarCargas(p); objetivoInterno.set(p, p.alfa); return; }   // (C1) las cargas mandan
            objetivoInterno.set(p, this.calibrarFiabilidad(p, indiceFiab));
            // (C5) dicotómica: el recorte a 0/1 acerca a 0.5 las medias de los ítems
            // extremos; se corrigen las medias de ítem del perfil hasta que las
            // dificultades realizadas sean las pedidas (y con ellas el KR-20)
            if (this._esDicotomica(p) && perfil && Array.isArray(p.dificultadesEfectivas)) this._calibrarDificultades(p, perfil, objetivoInterno.get(p), indiceFiab);
        });
        avisar(0.36, 'Generando participantes');

        // Desplazamientos por grupo de cada variable continua (A1), por
        // participante, leídos de las columnas de agrupación ya generadas.
        // En modo exacto se reutilizan los desplazamientos que dejó calibrados
        // el punto fijo (mismos arreglos que usaron las funciones de valor).
        const despCalibrado = new Map();
        if (funcionesValor) funcionesValor.forEach(f => { if (f.desp && f.nombre) despCalibrado.set(f.nombre, f.desp); });
        const despSocio = new Map();
        continuos.forEach(s => despSocio.set(s, despCalibrado.get(s.categoria) || this._desplazamientosDe(base, s.categoria, this._deEfectiva(s))));
        const despPrueba = new Map();
        pruebas.forEach(p => despPrueba.set(p, despCalibrado.get(p.nombre) || this._desplazamientosDe(base, p.nombre, p.desviacion)));
        const factorDEPrueba = new Map();
        pruebas.forEach(p => factorDEPrueba.set(p, this._factorDE(p.nombre)));

        // PASE 2 — sociodemográficos CONTINUOS y pruebas de cada participante
        const pasoAviso = Math.max(1, Math.floor(n / 25));
        for (let i = 0; i < n; i++) {
            if (i % pasoAviso === 0) avisar(0.36 + 0.50 * (i / n), 'Generando participantes');

            // Valores normales correlacionados (driver) por variable, si aplica
            const drivers = matrizDrivers ? this._driversDeFila(matrizDrivers[i])
                : (hayCorrelaciones ? this.generarVectorCorrelacionado() : {});

            // Continuos: DE intra-grupo y desplazamiento por grupo aplicados al
            // valor continuo, ANTES de recortar y redondear (A1).
            continuos.forEach(socio => {
                const clave = 'socio:' + socio.categoriaCorta;
                const driver = drivers[clave];
                colSocio.get(socio.categoria).datos[i] = this.generarValorSociodemografico(
                    socio, driver !== undefined ? driver : null,
                    despSocio.get(socio)[i],
                    this._factorDE(socio.categoria),
                    !!(this.driversEnValor && this.driversEnValor.has(clave))
                );
            });

            // Pruebas. Primero el TOTAL continuo de todas (las cargas cruzadas
            // de una dimensión necesitan el z de las otras del mismo test) y
            // después el reparto de cada total en ítems.
            const basesPrueba = new Array(pruebas.length), totalesPrueba = new Array(pruebas.length);
            const zDim = {};
            pruebas.forEach((prueba, idx) => {
                const claveEscala = 'escala:' + this._claveEscala(prueba);
                const driverEscala = drivers[claveEscala];
                const formaYaAplicada = !!(this.driversEnValor && this.driversEnValor.has(claveEscala));
                const baseZ = driverEscala !== undefined ? driverEscala : this.generarNormalEstandar();
                const total = this._totalObjetivo(prueba.media, prueba.desviacion * factorDEPrueba.get(prueba), baseZ,
                    prueba.formaTotal ? prueba.formaTotal : (formaYaAplicada ? 'normal' : prueba.distribucion), despPrueba.get(prueba)[i]);
                basesPrueba[idx] = baseZ;
                totalesPrueba[idx] = total;
                zDim[this._claveEscala(prueba)] = prueba.desviacion > 0 ? (total - prueba.media) / prueba.desviacion : 0;
            });
            pruebas.forEach((prueba, idx) => {
                const perfil = this.perfilesItems.get(prueba) || null;
                // (B7) las cargas cruzadas de una onda T2… miran a la misma onda de la
                // otra dimensión si existe; si no, a su onda 1
                let zOtras = zDim;
                const conMetodo = !!(perfil && perfil.estructura && perfil.estructura.metodo);
                if ((prueba.sufijo && perfil && perfil.cruzadas.length) || conMetodo) {
                    zOtras = {};
                    if (perfil && perfil.cruzadas.length) perfil.cruzadas.forEach(c => { zOtras[c.sigla] = zDim[this._siglaOnda(prueba, c.sigla)]; });
                    if (conMetodo) {
                        // (C1) un factor de método por persona, test y onda (independiente del resto)
                        const clave = 'metodo:' + prueba.prueba + (prueba.sufijo || '');
                        if (!(clave in zDim)) zDim[clave] = this.generarNormalEstandar();
                        zOtras['metodo:' + prueba.prueba] = zDim[clave];
                    }
                }
                const puntajes = this._repartirEnItems(
                    prueba.numItems,
                    totalesPrueba[idx],
                    prueba.media,
                    prueba.desviacion * factorDEPrueba.get(prueba),
                    prueba.minimo,
                    prueba.maximo,
                    objetivoInterno.has(prueba) ? objetivoInterno.get(prueba) : prueba.alfa,
                    perfil,
                    zOtras,
                    basesPrueba[idx]
                );
                // Ítems (la Escala general es una sola columna de datos: no
                // tiene ítems, solo su Total_)
                const cols = colItems.get(prueba);
                for (let idx = 0; idx < cols.length; idx++) {
                    const puntaje = puntajes.items[idx];
                    // Ítem invertido → se guarda reflejado (respuesta bruta, sin recodificar)
                    cols[idx].datos[i] = this._esInvertido(prueba, idx + 1) ? this._reflejar(prueba, puntaje) : puntaje;
                }
                colTotal.get(prueba).datos[i] = puntajes.total;
            });

            // Las diferencias por grupo ya van dentro de cada total (A1): no hay
            // nada que desplazar después de generar.

            // Puntaje GENERAL del test: promedio de sus dimensiones, redondeado
            // a entero (decisión del dueño). Con una sola dimensión no se emite:
            // sería una copia exacta de esa columna.
            colGeneral.forEach(({ columna, dims }) => {
                let suma = 0;
                for (let k = 0; k < dims.length; k++) suma += dims[k].datos[i];
                columna.datos[i] = Math.round(suma / dims.length);
            });
        }

        // (B9) fechas de nacimiento derivadas de las edades ya generadas
        this._rellenarFechasNacimiento(base);
        // (C2) desenlaces no continuos a partir de las puntuaciones VERDADERAS (antes de imperfecciones)
        this._generarDesenlaces(base);
        // Imperfecciones realistas (si se pidieron), antes de los percentiles.
        avisar(0.88, 'Aplicando imperfecciones realistas');
        this.resumenImperfecciones = this.aplicarImperfecciones(base);

        // PERCENTILES (post-proceso, OPCIONAL): posición relativa (0-100) de cada
        // persona dentro de la muestra generada, para el puntaje directo de cada
        // escala. Rango medio: PC = (inferiores + 0.5·empates) / N · 100.
        if (this.configuracion.generarPercentiles) {
            avisar(0.94, 'Calculando percentiles');
            const columnasPercentil = [];
            // mismo orden que los totales: primero dimensiones, luego generales
            pruebas.forEach(e => { if (e.tipo !== 'general') columnasPercentil.push({ sigla: this._claveEscala(e), col: this.columnaDeEscala(e) }); });
            pruebas.forEach(e => { if (e.tipo === 'general') columnasPercentil.push({ sigla: this._claveEscala(e), col: this.columnaDeEscala(e) }); });
            grupos.forEach(g => { if (base.tiene(`General_${g.sigla}`)) columnasPercentil.push({ sigla: g.sigla, col: `General_${g.sigla}` }); });
            columnasPercentil.forEach(({ sigla, col }) => {
                if (!base.tiene(col)) return;
                const origen = base.columna(col).datos;
                const valores = base.finitos(col).sort();          // orden numérico (arreglo tipado)
                const m = valores.length;
                const destino = base.agregar(`PC_${sigla}`, false).datos;
                for (let i = 0; i < n; i++) {
                    const v = origen[i];
                    if (!(v === v) || m === 0) { destino[i] = NaN; continue; }
                    // búsqueda binaria de límites inferior y superior
                    let lo = 0, hi = m;
                    while (lo < hi) { const mid = (lo + hi) >> 1; if (valores[mid] < v) lo = mid + 1; else hi = mid; }
                    const inferiores = lo;
                    lo = 0; hi = m;
                    while (lo < hi) { const mid = (lo + hi) >> 1; if (valores[mid] <= v) lo = mid + 1; else hi = mid; }
                    const empates = lo - inferiores;
                    destino[i] = Math.round(((inferiores + 0.5 * empates) / m) * 1000) / 10;
                }
            });
        }

        // (C3) niveles por puntos de corte sobre los totales FINALES (tras imperfecciones)
        this._generarCortes(base);
        // (C7) jueces: categóricos (κ) sobre una categórica ya generada, continuos (CCI) sobre una escala
        this._generarJueces(base);

        avisar(0.96, 'Base generada');
        this.datosGenerados = base;
        return base;
    },

    _generarDesenlaces(base) {
        const lista = this.configuracion.desenlaces || [];
        if (!lista.length) return;
        const n = base.n;
        const logistico = () => { const u = Math.max(1e-12, Math.min(1 - 1e-12, this.aleatorio())); return Math.log(u / (1 - u)); };
        lista.forEach(d => {
            // η con predictores estandarizados en la muestra
            const eta = new Float64Array(n);
            d.predictores.forEach(pr => {
                const datos = this._columnaPredictor(base, pr.variable);
                if (!datos) return;
                let m = 0, c = 0; for (let i = 0; i < n; i++) if (datos[i] === datos[i]) { m += datos[i]; c++; }
                m /= Math.max(1, c);
                let v = 0; for (let i = 0; i < n; i++) if (datos[i] === datos[i]) v += (datos[i] - m) ** 2;
                const sd = Math.sqrt(v / Math.max(1, c - 1)) || 1;
                const b = Math.log(pr.efecto);
                for (let i = 0; i < n; i++) eta[i] += b * ((datos[i] === datos[i] ? datos[i] : m) - m) / sd;
            });
            const col = base.agregar(d.nombre, true).datos;
            if (d.tipo === 'binario') {
                const u = new Float64Array(n);
                for (let i = 0; i < n; i++) u[i] = eta[i] + logistico();
                const orden = Array.from({ length: n }, (_, i) => i).sort((a, b) => u[a] - u[b]);
                const unos = Math.round(n * d.prevalencia);
                for (let r = 0; r < n; r++) col[orden[r]] = r >= n - unos ? 1 : 0;
                if (d.etiquetas) base.etiquetar(d.nombre, { 0: d.etiquetas[0], 1: d.etiquetas[1] });
            } else if (d.tipo === 'conteo') {
                let lo = -10, hi = 10;
                for (let it = 0; it < 50; it++) { const b0 = (lo + hi) / 2; let s = 0; for (let i = 0; i < n; i++) s += Math.exp(b0 + eta[i]); if (s / n < d.media) lo = b0; else hi = b0; }
                const b0 = (lo + hi) / 2;
                for (let i = 0; i < n; i++) col[i] = this.generarPoisson(Math.exp(b0 + eta[i]));
            } else {
                const u = new Float64Array(n);
                for (let i = 0; i < n; i++) u[i] = eta[i] + logistico();
                const orden = Array.from({ length: n }, (_, i) => i).sort((a, b) => u[a] - u[b]);
                const recuentos = this._recuentosExactos(d.niveles, n);
                let pos = 0;
                d.niveles.forEach((nv, k) => { for (let j = 0; j < recuentos[k]; j++) col[orden[pos++]] = nv.codigo; });
                const etiquetas = {}; d.niveles.forEach(x => { etiquetas[x.codigo] = x.etiqueta; });
                base.etiquetar(d.nombre, etiquetas);
            }
        });
    },

    // ============ PUNTOS DE CORTE (C3) ============
    _generarCortes(base) {
        this.cortesGenerados = [];   // siempre: el informe no debe arrastrar cortes de otra base
        const lista = this.configuracion.cortes || [];
        if (!lista.length) return;
        const n = base.n;
        lista.forEach(c => {
            const colOrigen = this._columnaDeVariable(c.variable);
            if (!colOrigen || !base.tiene(colOrigen)) return;
            const datos = base.columna(colOrigen).datos;
            let cortes = c.cortes.slice(), empateMax = 0;
            if (c.porPercentil) {
                // corte = primer valor cuyo rango supera el percentil; con totales enteros
                // los empates en ese valor no se pueden repartir (una misma puntuación no
                // puede quedar en dos niveles), así que las proporciones son aproximadas
                const finitos = base.finitos(colOrigen).sort();
                const m = finitos.length;
                cortes = c.cortes.map(pct => { if (!m) return NaN; const pos = Math.min(m - 1, Math.max(0, Math.ceil(pct / 100 * m))); return finitos[pos]; });
                let racha = 1; for (let i = 1; i < m; i++) { if (finitos[i] === finitos[i - 1]) racha++; else { empateMax = Math.max(empateMax, racha); racha = 1; } } empateMax = Math.max(empateMax, racha);
            }
            const nombre = `Nivel_${this._siglaDeVariable(c.variable)}`;
            const col = base.agregar(nombre, true).datos;
            for (let i = 0; i < n; i++) {
                const v = datos[i];
                if (!(v === v)) { col[i] = NaN; continue; }
                let k = 0; while (k < cortes.length && v >= cortes[k]) k++;
                col[i] = k + 1;
            }
            const etiquetas = {}; c.etiquetas.forEach((e, k) => { etiquetas[k + 1] = e; });
            base.etiquetar(nombre, etiquetas);
            this.cortesGenerados.push({ variable: c.variable, columna: nombre, etiquetas: c.etiquetas, cortes, porPercentil: c.porPercentil, percentiles: c.porPercentil ? c.cortes : null, empateMax });
        });
    },

    // ============ CONCORDANCIA ENTRE JUECES (C7) ============
    // Jueces categóricos: cada juez repite la categoría VERDADERA con probabilidad
    // √κ y, si no, sortea una de la distribución marginal. Con esa regla el κ de
    // Cohen entre dos jueces (y el de Fleiss entre varios) vale exactamente κ en
    // población, sea cual sea la distribución de las categorías.
    // Jueces continuos: puntuación = verdadera + error N(0, σ·√((1 − CCI)/CCI)),
    // así CCI(1) = Var(verdadera)/(Var(verdadera) + Var(error)) es la pedida.
    _generarJueces(base) {
        const lista = (this.configuracion.concordancias || []).filter(c => c.tipo === 'jueces' || c.tipo === 'juecesContinuo');
        this.juecesGenerados = [];
        if (!lista.length) return;
        const n = base.n;
        lista.forEach(c => {
            const sigla = this._siglaDeVariable(c.variable);
            if (c.tipo === 'jueces') {
                const colV = this._columnaCategoricaDe(c.variable);
                if (!colV || !base.tiene(colV)) return;
                const verdad = base.columna(colV);
                const conteos = new Map(); let total = 0;
                for (let i = 0; i < n; i++) { const v = verdad.datos[i]; if (v === v) { conteos.set(v, (conteos.get(v) || 0) + 1); total++; } }
                if (!total) return;
                const categorias = Array.from(conteos.keys()).sort((a, b) => a - b), pi = categorias.map(k => conteos.get(k) / total);
                const q = Math.sqrt(Math.max(0, Math.min(0.99, c.kappa)));
                const columnas = [];
                for (let j = 1; j <= c.jueces; j++) {
                    const col = base.agregar(`Juez${j}_${sigla}`, true).datos;
                    for (let i = 0; i < n; i++) {
                        const v = verdad.datos[i];
                        if (!(v === v)) { col[i] = NaN; continue; }
                        if (this.aleatorio() < q) { col[i] = v; continue; }
                        let u = this.aleatorio(), k = 0; while (k < pi.length - 1 && u >= pi[k]) { u -= pi[k]; k++; }
                        col[i] = categorias[k];
                    }
                    if (verdad.etiquetas) base.etiquetar(`Juez${j}_${sigla}`, verdad.etiquetas);
                    columnas.push(`Juez${j}_${sigla}`);
                }
                this.juecesGenerados.push({ tipo: 'jueces', variable: c.variable, columnaVerdad: colV, columnas, kappa: c.kappa, sigla });
            } else {
                const colV = this._columnaDeVariable(c.variable);
                if (!colV || !base.tiene(colV)) return;
                const verdad = base.columna(colV).datos;
                let m = 0, k = 0; for (let i = 0; i < n; i++) if (verdad[i] === verdad[i]) { m += verdad[i]; k++; }
                m /= Math.max(1, k); let v = 0; for (let i = 0; i < n; i++) if (verdad[i] === verdad[i]) v += (verdad[i] - m) ** 2;
                const sd = Math.sqrt(v / Math.max(1, k - 1)) || 1;
                const icc = Math.max(0.05, Math.min(0.98, c.icc));
                const sdError = sd * Math.sqrt((1 - icc) / icc);
                const columnas = [];
                for (let j = 1; j <= c.jueces; j++) {
                    const col = base.agregar(`Juez${j}_${sigla}`, false).datos;
                    for (let i = 0; i < n; i++) col[i] = verdad[i] === verdad[i] ? Math.round((verdad[i] + sdError * this.generarNormalEstandar()) * 100) / 100 : NaN;
                    columnas.push(`Juez${j}_${sigla}`);
                }
                this.juecesGenerados.push({ tipo: 'juecesContinuo', variable: c.variable, columnaVerdad: colV, columnas, icc: c.icc, sigla });
            }
        });
    },

});
