// ========================================
// GENERADOR DE BASE DE DATOS SIMULADA
// ========================================

// Tope superior del tamaño muestral para evitar congelar el navegador.
const TAMANO_MUESTRAL_MAXIMO = 100000;

// σ de la forma «asimétrica» de las ESCALAS: log-normal estandarizada que
// transformarFormaZ aplica al driver normal. FUENTE ÚNICA: la corrección de
// correlación intermedia (_rhoIntermedia) debe usar exactamente este valor.
const SIGMA_FORMA_ASIMETRICA = 0.6;

// ========================================
// REGLAS DE COHERENCIA (fuente única)
// Las usan la guía en vivo de la interfaz (guia-coherencia.js) y el respaldo
// de validación del generador. Si una regla cambia, se cambia SOLO aquí.
// ========================================
const ReglasCoherencia = {
    // Rango permitido de la Media de un puntaje que es suma de k ítems en [min, max]
    rangoMedia(k, min, max) {
        return { minimo: Math.ceil(k * min), maximo: Math.floor(k * max) };
    },

    // DE máxima sin recorte: la distribución (±3·DE) debe caber hasta el tope más cercano
    deMaxima(media, totalMin, totalMax) {
        return Math.min(media - totalMin, totalMax - media) / 3;
    },

    // DE mínima recomendada para que un total ENTERO no salga "escalonado" y pueda
    // pasar la prueba de normalidad. Calibrada empíricamente: ≈ 1.1·√N.
    deMinimaNormal(n) {
        return (Number.isFinite(n) && n >= 2) ? Math.ceil(1.1 * Math.sqrt(n)) : 0;
    }
};
if (typeof window !== 'undefined') {
    window.ReglasCoherencia = ReglasCoherencia;
}

class GeneradorDatos {
    constructor() {
        this.datosGenerados = null;
        this.configuracion = {
            tamanoMuestra: 100,
            semilla: null,
            pruebas: [],
            sociodemograficos: []
        };
        // Fuente de números aleatorios (reemplazable por un PRNG sembrado)
        this.aleatorio = Math.random;
    }

    // ========================================
    // ALEATORIEDAD (REPRODUCIBLE CON SEMILLA)
    // ========================================

    // Inicializa la fuente de aleatoriedad. Con una semilla numérica usa un
    // PRNG determinista (Mulberry32): la misma semilla produce el mismo
    // conjunto de datos. Sin semilla, usa Math.random.
    inicializarAleatorio(semilla) {
        if (semilla === null || semilla === undefined || isNaN(semilla)) {
            this.aleatorio = Math.random;
            return;
        }

        let estado = Math.trunc(semilla) >>> 0;
        this.aleatorio = function () {
            estado = (estado + 0x6D2B79F5) >>> 0;
            let t = estado;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ========================================
    // RECOLECCIÓN DE CONFIGURACIÓN
    // ========================================
    
    recolectarConfiguracion() {
        // Tamaño muestral
        const tamano = parseInt(document.getElementById('tamanoMuestra').value);
        if (isNaN(tamano) || tamano < 2) {
            throw new Error('El tamaño muestral debe ser al menos 2');
        }
        // Tope superior para evitar congelar el navegador ante un valor enorme
        // (p. ej. un error tipográfico como 1000000).
        if (tamano > TAMANO_MUESTRAL_MAXIMO) {
            throw new Error(`El tamaño muestral máximo permitido es ${TAMANO_MUESTRAL_MAXIMO}`);
        }
        this.configuracion.tamanoMuestra = tamano;

        // Semilla opcional para reproducibilidad
        const semillaTexto = document.getElementById('semilla').value.trim();
        this.configuracion.semilla = semillaTexto === '' ? null : parseInt(semillaTexto, 10);

        // Percentiles opcionales (columnas PC_)
        const chkPC = document.getElementById('generarPercentiles');
        this.configuracion.generarPercentiles = !!(chkPC && chkPC.checked);
        const chkCE = document.getElementById('correlacionesExactas');
        // Por defecto ACTIVADO: si el usuario pide r = 0.40, la muestra entrega 0.40.
        this.configuracion.correlacionesExactas = chkCE ? !!chkCE.checked : true;
        const selIF = document.getElementById('indiceFiabilidad');
        this.configuracion.indiceFiabilidad = selIF ? selIF.value : 'alfa';
        // Imperfecciones realistas (opcionales; 0 = base perfecta, como hasta ahora)
        const leerPct = (id, tope) => { const el = document.getElementById(id); const v = el ? parseFloat(el.value) : 0; return isFinite(v) ? Math.max(0, Math.min(tope, v)) : 0; };
        this.configuracion.realismo = {
            pctPerdidos: leerPct('pctPerdidos', 30),
            mecanismoPerdidos: ((document.getElementById('mecanismoPerdidos') || {}).value) || 'MCAR',
            pctDescuidados: leerPct('pctDescuidados', 20),
            tipoDescuidado: ((document.getElementById('tipoDescuidado') || {}).value) || 'mixto',
            marcarDescuidados: !!((document.getElementById('marcarDescuidados') || {}).checked),
            pctDigitacion: leerPct('pctDigitacion', 10)
        };

        // Pruebas aplicadas (cada fila es una ESCALA; se agrupan por prueba)
        this.configuracion.variablesPorTest = this.recolectarTests();
        this.configuracion.pruebas = this.recolectarPruebas();
        if (this.configuracion.pruebas.length === 0) {
            throw new Error('Debe agregar al menos una escala');
        }
        this.configuracion.gruposPruebas = this.agruparPruebas(this.configuracion.pruebas);

        // Datos sociodemográficos
        this.configuracion.sociodemograficos = this.recolectarSociodemograficos();
        if (this.configuracion.sociodemograficos.length === 0) {
            throw new Error('Debe agregar al menos un dato sociodemográfico');
        }

        // Correlaciones objetivo (opcionales)
        this.configuracion.correlaciones = this.recolectarCorrelaciones();

        // Diferencias por grupo (opcionales)
        this.configuracion.diferenciasGrupo = this.recolectarDiferenciasGrupo();

        return this.configuracion;
    }

    // Lee las diferencias por grupo de la tabla (variable cuantitativa,
    // variable de agrupación y d de Cohen).
    recolectarDiferenciasGrupo() {
        const diferencias = [];
        const filas = document.querySelectorAll('#bodyDiferencias .fila-diferencia');

        filas.forEach(fila => {
            const selects = fila.querySelectorAll('select');
            const inputD = fila.querySelector('input');
            if (selects.length < 2 || !inputD) return;

            const cuantitativa = selects[0].value;
            const agrupacion = selects[1].value;
            const d = parseFloat(inputD.value);

            if (cuantitativa && agrupacion && cuantitativa !== agrupacion && !isNaN(d)) {
                diferencias.push({ cuantitativa: cuantitativa, agrupacion: agrupacion, d: d });
            }
        });

        return diferencias;
    }

    // Lee las correlaciones objetivo de la tabla (pares de variables + r).
    recolectarCorrelaciones() {
        const correlaciones = [];
        const filas = document.querySelectorAll('#bodyCorrelaciones .fila-correlacion');

        filas.forEach(fila => {
            const selects = fila.querySelectorAll('select');
            const inputR = fila.querySelector('input');
            if (selects.length < 2 || !inputR) return;

            const a = selects[0].value;
            const b = selects[1].value;
            const r = parseFloat(inputR.value);

            if (a && b && a !== b && !isNaN(r)) {
                if (r <= -1 || r >= 1) {
                    throw new Error(`Correlación entre "${a}" y "${b}": r debe estar entre -1 y 1`);
                }
                correlaciones.push({ a: a, b: b, r: r });
            }
        });

        return correlaciones;
    }

    // Cuadro superior: qué tests existen y qué variable psicológica mide cada uno.
    recolectarTests() {
        const mapa = {};
        document.querySelectorAll('#bodyTests .fila-test').forEach(fila => {
            const nombre = (fila.querySelector('[aria-label="Nombre del test"]') || {}).value || '';
            const variable = (fila.querySelector('[aria-label="Variable psicológica"]') || {}).value || '';
            const rIn = parseFloat((fila.querySelector('[aria-label="Correlación entre dimensiones"]') || {}).value);
            if (nombre.trim()) mapa[nombre.trim()] = { variable: variable.trim(), rIntra: isFinite(rIn) ? Math.max(-0.99, Math.min(0.99, rIn)) : 0.40 };
        });
        return mapa;
    }

    recolectarPruebas() {
        const pruebas = [];
        const nombresCortosUsados = new Set();
        const filas = document.querySelectorAll('#bodyPruebas .fila-prueba');

        filas.forEach((fila, index) => {
            const inputs = fila.querySelectorAll('input');
            const selPrueba = fila.querySelector('[aria-label="Nombre de la prueba"]');
            const selectDist = fila.querySelector('[aria-label="Distribución"]');
            // Cada fila es SIEMPRE una dimensión: el puntaje general del test se
            // calcula solo (promedio de sus dimensiones), no se configura a mano.
            const tipo = 'dimension';
            const esGeneral = false;
            const distribucion = selectDist ? selectDist.value : 'normal';
            const prueba = selPrueba ? selPrueba.value.trim() : '';   // test elegido en el cuadro superior
            const nombre = inputs[0].value.trim();      // nombre de la ESCALA (cada fila = una escala)
            const numItems = parseInt(inputs[1].value);
            const media = parseFloat(inputs[2].value);
            const desviacion = parseFloat(inputs[3].value);
            const minimo = parseFloat(inputs[4].value);
            const maximo = parseFloat(inputs[5].value);
            const alfa = inputs[6] ? parseFloat(inputs[6].value) : NaN;
            const invertidosRaw = inputs[7] ? parseInt(inputs[7].value, 10) : 0;
            const invertidos = Number.isFinite(invertidosRaw) ? Math.max(0, invertidosRaw) : 0;

            if (nombre && !isNaN(numItems) && !isNaN(media) && !isNaN(desviacion)) {
                if (numItems < 1) {
                    throw new Error(`Escala "${nombre}": El número de ítems debe ser al menos 1`);
                }
                if (desviacion <= 0) {
                    throw new Error(`Escala "${nombre}": La desviación estándar debe ser mayor a 0`);
                }
                if (esGeneral && (isNaN(minimo) || isNaN(maximo))) {
                    throw new Error(`Escala general "${nombre}": debes indicar el Mínimo y el Máximo de la escala`);
                }

                // Validar rango si se especifica
                if (!isNaN(minimo) && !isNaN(maximo)) {
                    if (minimo >= maximo) {
                        throw new Error(`Escala "${nombre}": El mínimo debe ser menor que el máximo`);
                    }
                }

                // Validar alfa objetivo si se especifica
                if (!isNaN(alfa) && (alfa < 0 || alfa >= 1)) {
                    throw new Error(`Escala "${nombre}": El α objetivo debe estar entre 0 y 1`);
                }

                pruebas.push({
                    invertidos: Math.min(invertidos, Math.max(0, numItems - 1)),   // últimos ítems de la escala, puntuados al revés
                    prueba: prueba || null,             // agrupa escalas bajo el mismo test
                    tipo: tipo,                         // 'dimension' | 'general'
                    nombre: nombre,
                    nombreCorto: this.generarNombreCortoUnico(nombre, nombresCortosUsados),
                    numItems: numItems,
                    distribucion: distribucion,
                    media: media,
                    desviacion: desviacion,
                    minimo: !isNaN(minimo) ? minimo : null,
                    maximo: !isNaN(maximo) ? maximo : null,
                    alfa: !isNaN(alfa) ? alfa : 0
                });
            }
        });

        return pruebas;
    }

    // Nombre de columna de una escala según su tipo (FUENTE ÚNICA):
    // dimensión → Dimension_<sigla>; general → General_<sigla>.
    // El prefijo codifica el tipo para que una base exportada conserve su
    // estructura y el analizador pueda reconstruirla desde el CSV.
    columnaDeEscala(escala) {
        return `${escala.tipo === 'general' ? 'General' : 'Dimension'}_${escala.nombreCorto}`;
    }

    // Diccionario de etiquetas humanas para las columnas generadas (estilo
    // "variable labels" de SPSS): Total_IC → "Inteligencia Cognitiva".
    obtenerEtiquetas() {
        const mapa = {};
        const escalas = (this.configuracion && this.configuracion.pruebas) || [];
        escalas.forEach(e => {
            if ((e.invertidos || 0) > 0) for (let j = e.numItems - e.invertidos + 1; j <= e.numItems; j++) mapa[`${e.nombreCorto}${j}`] = `${e.nombre} — ítem ${j} (INVERTIDO: recodificar)`;
            mapa[this.columnaDeEscala(e)] = e.nombre;
            mapa[`PC_${e.nombreCorto}`] = `Percentil — ${e.nombre}`;
        });
        (this.configuracion && this.configuracion.gruposPruebas || []).forEach(g => {
            if (g.escalas.length >= 2) {
                const etiqueta = g.variable ? `${g.variable} — ${g.nombre}` : `Puntaje general — ${g.nombre}`;
                mapa[`General_${g.sigla}`] = etiqueta;
                mapa[`PC_${g.sigla}`] = `Percentil — ${etiqueta}`;
            }
        });
        return mapa;
    }

    // Estructura de pruebas para el análisis por dimensiones:
    // [{ prueba, columnaGeneral, etiquetaGeneral, dimensiones: [{columna, etiqueta}] }]
    obtenerEstructuraEscalas() {
        const escalas = (this.configuracion && this.configuracion.pruebas) || [];
        const porPrueba = new Map();
        escalas.forEach(e => {
            if (!e.prueba) return;
            if (!porPrueba.has(e.prueba)) porPrueba.set(e.prueba, { general: null, dimensiones: [] });
            const grupo = porPrueba.get(e.prueba);
            if (e.tipo === 'general') grupo.general = e;
            else grupo.dimensiones.push(e);
        });
        const estructura = [];
        porPrueba.forEach((grupo, nombrePrueba) => {
            if (!grupo.general || grupo.dimensiones.length === 0) return;
            estructura.push({
                prueba: nombrePrueba,
                columnaGeneral: this.columnaDeEscala(grupo.general),
                etiquetaGeneral: grupo.general.nombre,
                dimensiones: grupo.dimensiones.map(d => ({
                    columna: this.columnaDeEscala(d),
                    etiqueta: d.nombre
                }))
            });
        });
        return estructura;
    }

    // Agrupa las escalas por el nombre de su prueba. Cada grupo recibe una sigla
    // única (sin chocar con las siglas de las escalas) que se usa para el puntaje
    // general del test cuando NO hay Escala general configurada:
    // Total_{sigla} = suma de los totales de sus dimensiones.
    // Si la prueba tiene una Escala general (tipo 'general'), esa columna ES el
    // puntaje general y la suma automática no se emite.
    agruparPruebas(escalas) {
        const usados = new Set(escalas.map(e => e.nombreCorto));
        const porNombre = new Map();
        escalas.forEach(e => {
            if (!e.prueba) return;
            if (!porNombre.has(e.prueba)) porNombre.set(e.prueba, []);
            porNombre.get(e.prueba).push(e.nombreCorto);
        });
        const grupos = [];
        porNombre.forEach((siglasEscalas, nombrePrueba) => {
            grupos.push({
                nombre: nombrePrueba,
                sigla: this.generarNombreCortoUnico(nombrePrueba, usados),
                escalas: siglasEscalas,
                variable: (((this.configuracion && this.configuracion.variablesPorTest) || {})[nombrePrueba] || {}).variable || '',
                rIntra: (((this.configuracion && this.configuracion.variablesPorTest) || {})[nombrePrueba] || {}).rIntra
            });
        });
        return grupos;
    }

    recolectarSociodemograficos() {
        const socio = [];
        const nombresCortosUsados = new Set();
        const filas = document.querySelectorAll('#bodySocio .fila-socio');

        filas.forEach((fila, index) => {
            const inputs = fila.querySelectorAll('input');
            const selectDist = fila.querySelector('select');
            const distribucion = selectDist ? selectDist.value : 'normal';
            const categoria = inputs[0].value.trim();
            const promedio = parseFloat(inputs[1].value);
            const desviacion = parseFloat(inputs[2].value);
            const minimo = parseFloat(inputs[3].value);
            const maximo = parseFloat(inputs[4].value);
            const decimales = parseInt(inputs[5].value);

            // Distribuciones que no requieren DE (uniforme, conteo, binaria,
            // categórica): basta con la categoría y el promedio/rango.
            const requiereDE = distribucion === 'normal' || distribucion === 'asimetrica';

            if (categoria && !isNaN(promedio) && (!requiereDE || !isNaN(desviacion))) {
                if (requiereDE && desviacion <= 0) {
                    throw new Error(`Categoría "${categoria}": La desviación estándar debe ser mayor a 0`);
                }
                if ((distribucion === 'uniforme' || distribucion === 'categorica') && (isNaN(minimo) || isNaN(maximo))) {
                    throw new Error(`Categoría "${categoria}": las distribuciones uniforme y categórica requieren mínimo y máximo`);
                }
                if (distribucion === 'binaria' && (promedio < 0 || promedio > 1)) {
                    throw new Error(`Categoría "${categoria}": en una variable binaria el promedio es la proporción de unos (entre 0 y 1)`);
                }
                
                // Validar rango si se especifica
                if (!isNaN(minimo) && !isNaN(maximo)) {
                    if (minimo >= maximo) {
                        throw new Error(`Categoría "${categoria}": El mínimo debe ser menor que el máximo`);
                    }
                }
                
                // Validar número de decimales
                let numDecimales = 2; // Por defecto
                if (!isNaN(decimales)) {
                    if (decimales < 0 || decimales > 4) {
                        throw new Error(`Categoría "${categoria}": Los decimales deben estar entre 0 y 4`);
                    }
                    numDecimales = decimales;
                }

                socio.push({
                    categoria: categoria,
                    categoriaCorta: this.generarNombreCortoUnico(categoria, nombresCortosUsados),
                    distribucion: distribucion,
                    promedio: promedio,
                    desviacion: !isNaN(desviacion) ? desviacion : 1,
                    minimo: !isNaN(minimo) ? minimo : null,
                    maximo: !isNaN(maximo) ? maximo : null,
                    decimales: numDecimales
                });
            }
        });

        return socio;
    }

    generarNombreCorto(nombre) {
        // Genera un nombre corto a partir del nombre completo
        // Toma las iniciales y números
        let corto = nombre
            .replace(/[^a-zA-Z0-9\s]/g, '') // Eliminar caracteres especiales
            .split(/\s+/) // Separar por espacios
            .map(palabra => palabra.charAt(0).toUpperCase()) // Primera letra
            .join('');

        return corto.substring(0, 10); // Máximo 10 caracteres
    }

    // Devuelve un nombre corto único respecto a `usados`, agregando un sufijo
    // numérico si hay colisión. Evita que dos pruebas/variables con iniciales
    // iguales generen el mismo prefijo de columna y se sobrescriban entre sí.
    generarNombreCortoUnico(nombre, usados) {
        let base = this.generarNombreCorto(nombre);
        if (!base) base = 'V'; // Respaldo si el nombre no tiene caracteres alfanuméricos

        let corto = base;
        let sufijo = 2;
        while (usados.has(corto)) {
            corto = `${base}_${sufijo}`;
            sufijo++;
        }

        usados.add(corto);
        return corto;
    }

    // ========================================
    // GENERACIÓN DE DATOS ALEATORIOS
    // ========================================

    generarBaseDatos() {
        // Inicializar la fuente de aleatoriedad (sembrada si hay semilla)
        this.inicializarAleatorio(this.configuracion.semilla);

        // Estado de la generación anterior: nada debe sobrevivir (el panel de
        // diagnóstico lee estos campos y no debe mostrar avisos de otra base).
        this.diagnosticoCorrelaciones = null;
        this.correlVariables = [];
        this.correlR = null;
        this.correlRIntermedia = null;
        this.correlL = [];
        this.driversOrtogonalizados = false;
        this.driversEnValor = new Set();

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
        }

        const n = this.configuracion.tamanoMuestra;
        const socios = this.configuracion.sociodemograficos;
        const discretos = socios.filter(s => this._esSocioDiscreto(s));
        const continuos = socios.filter(s => !this._esSocioDiscreto(s));

        // PASE 1 — variables DISCRETAS (binaria, categórica, conteo) de todos los
        // participantes: son las que agrupan y no reciben desplazamiento. Las
        // claves de TODOS los sociodemográficos se declaran ya, en el orden de la
        // tabla, para que el orden de columnas del CSV no cambie.
        const datos = new Array(n);
        for (let i = 0; i < n; i++) {
            const participante = { ID: i + 1 };
            socios.forEach(s => { participante[s.categoria] = undefined; });
            discretos.forEach(s => { participante[s.categoria] = this.generarValorSociodemografico(s, null); });
            datos[i] = participante;
        }

        // Matriz de drivers con correlación muestral EXACTA (si procede). En
        // modo exacto los drivers se hacen además ORTOGONALES a los códigos de
        // grupo, así las medias de grupo del driver son exactamente 0 y la d
        // obtenida no fluctúa por el muestreo (igual que la r).
        const exactas = hayCorrelaciones && this.configuracion.correlacionesExactas !== false;
        const matrizDrivers = exactas ? this.generarMatrizDrivers(n, this._matrizCodigosGrupo(datos), this._funcionesDeValor(datos)) : null;
        // Fiabilidad autocalibrada: una vez por escala (no por participante).
        const indiceFiab = this.configuracion.indiceFiabilidad || 'alfa';
        const objetivoInterno = new Map();
        this.configuracion.pruebas.forEach(p => objetivoInterno.set(p, this.calibrarFiabilidad(p, indiceFiab)));

        // PASE 2 — sociodemográficos CONTINUOS y pruebas de cada participante
        for (let i = 0; i < n; i++) {
            const participante = datos[i];

            // Valores normales correlacionados (driver) por variable, si aplica
            const drivers = matrizDrivers ? this._driversDeFila(matrizDrivers[i])
                : (hayCorrelaciones ? this.generarVectorCorrelacionado() : {});

            // Continuos: DE intra-grupo y desplazamiento por grupo aplicados al
            // valor continuo, ANTES de recortar y redondear (A1).
            continuos.forEach(socio => {
                const clave = 'socio:' + socio.categoriaCorta;
                const driver = drivers[clave];
                participante[socio.categoria] = this.generarValorSociodemografico(
                    socio, driver !== undefined ? driver : null,
                    this._desplazamientoDe(participante, socio.categoria, this._deEfectiva(socio)),
                    this._factorDE(socio.categoria),
                    !!(this.driversEnValor && this.driversEnValor.has(clave))
                );
            });

            // Generar datos de cada prueba.
            // ORDEN DE COLUMNAS: primero TODOS los ítems, luego los totales de
            // las DIMENSIONES, y al final los puntajes de las ESCALAS GENERALES
            // (y las sumas automáticas de pruebas sin general).
            const totalesPendientes = [];
            this.configuracion.pruebas.forEach(prueba => {
                const claveEscala = 'escala:' + prueba.nombreCorto;
                const driverEscala = drivers[claveEscala];
                const formaYaAplicada = !!(this.driversEnValor && this.driversEnValor.has(claveEscala));
                const puntajes = this.generarPuntajesPrueba(
                    prueba.numItems,
                    prueba.media,
                    prueba.desviacion * this._factorDE(prueba.nombre),
                    prueba.minimo,
                    prueba.maximo,
                    objetivoInterno.has(prueba) ? objetivoInterno.get(prueba) : prueba.alfa,
                    driverEscala !== undefined ? driverEscala : null,
                    formaYaAplicada ? 'normal' : prueba.distribucion,
                    indiceFiab,
                    this._desplazamientoDe(participante, prueba.nombre, prueba.desviacion)
                );

                // Ítems (la Escala general es una sola columna de datos: no
                // tiene ítems, solo su Total_)
                if (prueba.tipo !== 'general') {
                    puntajes.items.forEach((puntaje, idx) => {
                        const nombreColumna = `${prueba.nombreCorto}${idx + 1}`;
                        // Ítem invertido → se guarda reflejado (respuesta bruta, sin recodificar)
                        participante[nombreColumna] = this._esInvertido(prueba, idx + 1) ? this._reflejar(prueba, puntaje) : puntaje;
                    });
                }

                totalesPendientes.push({ prueba, total: puntajes.total });
            });

            // Totales de las DIMENSIONES (en el orden de la tabla)
            totalesPendientes.forEach(t => {
                if (t.prueba.tipo !== 'general') {
                    participante[this.columnaDeEscala(t.prueba)] = t.total;
                }
            });

            // Totales de las ESCALAS GENERALES, al final
            totalesPendientes.forEach(t => {
                if (t.prueba.tipo === 'general') {
                    participante[this.columnaDeEscala(t.prueba)] = t.total;
                }
            });

            // Las diferencias por grupo ya van dentro de cada total (A1): no hay
            // nada que desplazar después de generar.

            // Suma automática (pruebas SIN Escala general y con 2+ dimensiones):
            // también va al final, junto a los puntajes generales.
            // Puntaje GENERAL del test: promedio de sus dimensiones, redondeado
            // a entero (decisión del dueño). Con una sola dimensión no se emite:
            // sería una copia exacta de esa columna.
            (this.configuracion.gruposPruebas || []).forEach(grupo => {
                if (grupo.escalas.length < 2) return;
                let suma = 0;
                grupo.escalas.forEach(sigla => { suma += participante[`Dimension_${sigla}`]; });
                participante[`General_${grupo.sigla}`] = Math.round(suma / grupo.escalas.length);
            });
        }

        // PERCENTILES (post-proceso, OPCIONAL): posición relativa (0-100) de cada
        // persona dentro de la muestra generada, para el puntaje directo de cada
        // escala. Rango medio: PC = (inferiores + 0.5·empates) / N · 100.
        // Imperfecciones realistas (si se pidieron), antes de los percentiles.
        this.resumenImperfecciones = this.aplicarImperfecciones(datos);

        if (this.configuracion.generarPercentiles) {
            const columnasPercentil = [];
        // mismo orden que los totales: primero dimensiones, luego generales
        this.configuracion.pruebas.forEach(e => { if (e.tipo !== 'general') columnasPercentil.push({ sigla: e.nombreCorto, col: this.columnaDeEscala(e) }); });
        this.configuracion.pruebas.forEach(e => { if (e.tipo === 'general') columnasPercentil.push({ sigla: e.nombreCorto, col: this.columnaDeEscala(e) }); });
        (this.configuracion.gruposPruebas || []).forEach(g => {
            if (g.escalas.length >= 2) columnasPercentil.push({ sigla: g.sigla, col: `General_${g.sigla}` });
        });
        columnasPercentil.forEach(({ sigla, col }) => {
            const valores = datos.map(d => d[col]).filter(v => typeof v === 'number' && isFinite(v)).sort((a, b) => a - b);
            const n = valores.length;
            datos.forEach(d => {
                const v = d[col];
                if (!(typeof v === 'number' && isFinite(v)) || n === 0) { d[`PC_${sigla}`] = NaN; return; }
                // búsqueda binaria de límites inferior y superior
                let lo = 0, hi = n;
                while (lo < hi) { const m = (lo + hi) >> 1; if (valores[m] < v) lo = m + 1; else hi = m; }
                const inferiores = lo;
                lo = 0; hi = n;
                while (lo < hi) { const m = (lo + hi) >> 1; if (valores[m] <= v) lo = m + 1; else hi = m; }
                const empates = lo - inferiores;
                d[`PC_${sigla}`] = Math.round(((inferiores + 0.5 * empates) / n) * 1000) / 10;
            });
        });
        }

        this.datosGenerados = datos;
        return datos;
    }

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
    }
    _simularIndice(prueba, objetivoInterno, indice, nSim = 400) {
        const k = prueba.numItems;
        const cols = Array.from({ length: k }, () => new Array(nSim));
        // Se simula con la misma DE intra-grupo y el mismo desplazamiento por
        // grupo (códigos sorteados) que tendrá la base: la varianza entre grupos
        // se reparte por igual entre los ítems y sube la fiabilidad observada.
        const deIntra = prueba.desviacion * this._factorDE(prueba.nombre);
        for (let i = 0; i < nSim; i++) {
            const p = this.generarPuntajesPrueba(k, prueba.media, deIntra, prueba.minimo,
                prueba.maximo, objetivoInterno, null, prueba.distribucion, indice,
                this._desplazamientoAleatorio(prueba.nombre, prueba.desviacion));
            for (let j = 0; j < k; j++) cols[j][i] = p.items[j];
        }
        return this._indiceObservado(cols, indice);
    }
    calibrarFiabilidad(prueba, indice) {
        const objetivo = prueba.alfa;
        if (!(objetivo > 0 && objetivo < 1) || prueba.numItems < 2) return objetivo;
        // Sin redondeo (escala continua) la relación ya es exacta: no se calibra.
        if (prueba.minimo === null || prueba.maximo === null) {
            if (indice !== 'omega') return objetivo;
        }
        let lo = 0.01, hi = 0.985, mejor = objetivo;
        for (let it = 0; it < 12; it++) {
            const mid = (lo + hi) / 2;
            const obs = this._simularIndice(prueba, mid, indice);
            if (obs === null || !isFinite(obs)) break;
            mejor = mid;
            if (obs < objetivo) lo = mid; else hi = mid;
        }
        return Math.max(0.01, Math.min(0.985, (lo + hi) / 2));
    }

    generarPuntajesPrueba(numItems, mediaTotal, desviacionTotal, minItem = null, maxItem = null, alfaObjetivo = 0, factor = null, distribucion = 'normal', indiceFiabilidad = 'alfa', desplazamiento = 0) {
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
        const k = numItems;
        const modoLikert = (minItem !== null && maxItem !== null);

        // (1) TOTAL autoritativo con la forma pedida. Si llega un driver de
        // correlación se usa como base estandarizada; si no, una normal nueva.
        const base = factor !== null ? factor : this.generarNormalEstandar();
        // El desplazamiento por grupo (A1) entra aquí, en el total CONTINUO:
        // el reparto entero en ítems ya lo incorpora y el redondeo por persona
        // se promedia en vez de acumularse como sesgo.
        const totalObjetivo = this._totalObjetivo(mediaTotal, desviacionTotal, base, distribucion, desplazamiento);

        // (2) Estructura inter-ítem para que el α de Cronbach observado se acerque
        // al α objetivo: λ es la carga factorial (Spearman-Brown invertida).
        let lambda = 0;
        // MODELO CONGENÉRICO (ω): el total se reparte con PESOS DESIGUALES, de
        // modo que cada ítem carga distinto en el factor común — que es
        // justamente el supuesto que ω respeta y α no (tau-equivalencia).
        // Con pesos iguales (modo α) ω y α coinciden, como manda la teoría.
        const congenerico = (indiceFiabilidad === 'omega' && k >= 3);
        let pesos = null;
        if (congenerico) {
            const brutos = [];
            for (let i = 0; i < k; i++) brutos.push(1 + 0.9 * (i / (k - 1) - 0.5));   // 0.55 … 1.45
            const suma = brutos.reduce((s, x) => s + x, 0);
            pesos = brutos.map(x => x / suma);                                        // Σ pesos = 1
        }
        if (alfaObjetivo > 0 && alfaObjetivo < 1 && k >= 2) {
            const rMedia = alfaObjetivo / (k - alfaObjetivo * (k - 1));
            lambda = Math.sqrt(Math.max(0, Math.min(0.999, rMedia)));
        }
        const desviacionPorItem = desviacionTotal / Math.sqrt(k * (1 + (k - 1) * lambda * lambda));
        const unicidad = Math.sqrt(1 - lambda * lambda);
        const Fitem = this.generarNormalEstandar(); // factor común propio de la escala

        // Desviaciones de ítem (centradas a suma 0): comparten Fitem (correlación
        // interna) más ruido idiosincrático. No afectan al nivel del total.
        const g = new Array(k);
        let gSuma = 0;
        for (let i = 0; i < k; i++) { g[i] = lambda * Fitem + unicidad * this.generarNormalEstandar(); gSuma += g[i]; }
        const gMedia = gSuma / k;

        if (!modoLikert) {
            // MEDIDA CONTINUA: ítem = total/k + desviación centrada → la suma es
            // EXACTAMENTE el total objetivo (forma y M/DE intactas). 2 decimales.
            const items = new Array(k);
            for (let i = 0; i < k; i++) {
                const cuota = pesos ? pesos[i] * totalObjetivo : totalObjetivo / k;
                items[i] = Math.round((cuota + desviacionPorItem * (g[i] - gMedia)) * 100) / 100;
            }
            const total = Math.round(items.reduce((a, b) => a + b, 0) * 100) / 100;
            return { items: items, total: total, factorUtilizado: base };
        }

        // ESCALA LIKERT (rango fijado): el total se acota al rango ALCANZABLE
        // [k·mín, k·máx] (solo afecta a la cola extrema, poco frecuente) y se
        // reparte en ítems ENTEROS dentro de [mín, máx]. El grueso del total
        // conserva la forma normal.
        const totalEntero = this._totalEnteroLikert(k, minItem, maxItem, totalObjetivo);

        // Ítems base con estructura inter-ítem (truncados como Likert real)...
        const mediaPorItem = totalObjetivo / k;
        // Dispersión por ítem: nunca por debajo de ~media unidad Likert, para que
        // los ítems SIEMPRE varíen (evita que un total entero exacto colapse en
        // ítems idénticos). No afecta al total: la suma se reajusta luego al total
        // autoritativo, así que esta dispersión solo reparte los ítems alrededor
        // de su media (su efecto es sobre el α de Cronbach observado, no sobre M/DE).
        const dispersionItem = Math.max(desviacionPorItem, 0.6);
        const items = new Array(k);
        for (let i = 0; i < k; i++) {
            const cuota = pesos ? pesos[i] * totalObjetivo : mediaPorItem;
            let v = Math.round(cuota + dispersionItem * (g[i] - gMedia));
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
    }

    // Valor normal estándar N(0,1) por el método de Box-Muller.
    generarNormalEstandar() {
        let u1 = this.aleatorio();
        let u2 = this.aleatorio();
        while (u1 === 0) u1 = this.aleatorio(); // Evitar log(0)
        return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    }

    // Función de error (Abramowitz & Stegun 7.1.26), error < 1.5e-7.
    erf(x) {
        const signo = x < 0 ? -1 : 1;
        x = Math.abs(x);
        const t = 1 / (1 + 0.3275911 * x);
        const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
        return signo * y;
    }

    // CDF de la normal estándar Φ(z).
    normalCDF(z) {
        return 0.5 * (1 + this.erf(z / Math.SQRT2));
    }

    // Transforma un z ~ N(0,1) en otra forma de distribución, devolviendo SIEMPRE
    // un valor estandarizado (media 0, varianza 1). Así el puntaje total conserva
    // la Media (M) y la DE objetivo, cambiando solo la FORMA de la distribución.
    // Es monótona, de modo que la estructura de correlación (factor latente F y
    // correlaciones objetivo) se preserva por orden de rango.
    transformarFormaZ(z, distribucion) {
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
    }

    generarValorNormal(media, desviacion, z = null) {
        // z permite inyectar un valor normal estándar "driver" (correlaciones).
        const normal = z !== null ? z : this.generarNormalEstandar();
        return media + desviacion * normal;
    }

    // Valor uniforme continuo en [min, max].
    generarUniforme(min, max) {
        return min + this.aleatorio() * (max - min);
    }

    // Valor log-normal (asimetría positiva) calibrado para que su media y su
    // desviación estándar sean aproximadamente las pedidas. Requiere media > 0.
    generarAsimetrico(media, desviacion, z = null) {
        const m = Math.max(1e-6, media);
        const sigma2 = Math.log(1 + (desviacion * desviacion) / (m * m));
        const sigma = Math.sqrt(sigma2);
        const mu = Math.log(m) - sigma2 / 2;
        const normal = z !== null ? z : this.generarNormalEstandar();
        return Math.exp(mu + sigma * normal);
    }

    // Valor de una distribución de Poisson con media lambda (algoritmo de Knuth).
    generarPoisson(lambda) {
        if (lambda <= 0) return 0;
        const limite = Math.exp(-lambda);
        let k = 0;
        let producto = 1;
        do {
            k++;
            producto *= this.aleatorio();
        } while (producto > limite);
        return k - 1;
    }

    // Valor binario (Bernoulli): 1 con probabilidad `proporcion`, 0 si no.
    generarBinaria(proporcion) {
        return this.aleatorio() < proporcion ? 1 : 0;
    }

    // Categoría entera equiprobable en [min, max].
    generarCategoria(min, max) {
        const k = Math.floor(max - min + 1);
        return min + Math.floor(this.aleatorio() * k);
    }

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
    }

    // ============ FUNCIONES DE VALOR (fuente única) ============
    // Cómo se convierte un driver normal z en el valor FINAL de una variable.
    // Las usan la generación y la calibración de correlaciones exactas, que
    // mide las correlaciones sobre estos mismos valores: si cambia una, cambia
    // en los dos sitios a la vez.

    // Total CONTINUO objetivo de una escala: Media + DE·forma(z) + desplazamiento.
    _totalObjetivo(mediaTotal, desviacionTotal, base, distribucion, desplazamiento) {
        return mediaTotal + desviacionTotal * this.transformarFormaZ(base, distribucion) + desplazamiento;
    }
    // Total ENTERO de una escala Likert: recorte al rango alcanzable [k·mín, k·máx]
    // (solo afecta a la cola extrema) y redondeo.
    _totalEnteroLikert(k, minItem, maxItem, totalObjetivo) {
        return Math.round(Math.max(k * minItem, Math.min(k * maxItem, totalObjetivo)));
    }
    // Total FINAL de una escala a partir de su driver (Likert → entero acotado).
    _totalDesdeDriver(prueba, z, desplazamiento, factorDE, formaAplicada = false) {
        const t = this._totalObjetivo(prueba.media, prueba.desviacion * factorDE, z, formaAplicada ? 'normal' : prueba.distribucion, desplazamiento);
        return (prueba.minimo !== null && prueba.maximo !== null) ? this._totalEnteroLikert(prueba.numItems, prueba.minimo, prueba.maximo, t) : t;
    }
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
    }

    // ========================================
    // CORRELACIONES OBJETIVO (CHOLESKY)
    // ========================================

    // Descomposición de Cholesky (L·Lᵀ = A) de una matriz simétrica. Si la
    // matriz no es definida positiva (correlaciones inconsistentes), los
    // elementos diagonales se acotan a un mínimo para no producir NaN.
    descomposicionCholesky(A) {
        const n = A.length;
        const L = Array.from({ length: n }, () => new Array(n).fill(0));
        let noDefinidaPositiva = false;

        for (let i = 0; i < n; i++) {
            for (let j = 0; j <= i; j++) {
                let suma = 0;
                for (let k = 0; k < j; k++) suma += L[i][k] * L[j][k];

                if (i === j) {
                    const d = A[i][i] - suma;
                    if (d <= 0) noDefinidaPositiva = true;
                    if (d < 1e-9) this.matrizForzada = true;   // pedido imposible: se fuerza
                    L[i][j] = Math.sqrt(Math.max(d, 1e-9));
                } else {
                    L[i][j] = (A[i][j] - suma) / (L[j][j] || 1e-9);
                }
            }
        }

        this.matrizNoDefinidaPositiva = noDefinidaPositiva;
        return L;
    }

    /**
     * Prepara la estructura de correlaciones: la lista de variables
     * correlacionables (totales de escala y sociodemográficas continuas), la
     * matriz de correlaciones objetivo y su factor de Cholesky. Para las
     * escalas se desatenúa la correlación objetivo por la fiabilidad del total
     * (corr(F,Total)), de modo que la correlación OBSERVADA entre totales se
     * acerque a la pedida.
     */
    nombreGeneral(grupo) {
        return grupo.variable ? `${grupo.variable} — ${grupo.nombre}` : `Puntaje general — ${grupo.nombre}`;
    }

    // ============ AUTOTEST INTERNO ============
    // Verificación en segundos, sin tocar la interfaz. Desde la consola:
    //     GeneradorDatos.autotest()
    // Cada línea comprueba una propiedad que se rompió alguna vez y ya no debe
    // romperse: correlaciones exactas, fiabilidad autocalibrada, General derivado,
    // relleno intra-test, reparto sobre el General, matrices imposibles,
    // ítems invertidos, valores perdidos y exportación limpia.
    static autotest(opciones = {}) {
        const n = opciones.n || 300, res = [];
        const ok = (nombre, cond, detalle = '') => { res.push({ nombre, ok: !!cond, detalle }); };
        const esNum = v => typeof v === 'number' && isFinite(v);
        const corr = (x, y) => { const pares = x.map((v, i) => [v, y[i]]).filter(q => esNum(q[0]) && esNum(q[1])); const a = pares.map(q => q[0]), b = pares.map(q => q[1]);
            const m = a.length, ma = a.reduce((s, v) => s + v, 0) / m, mb = b.reduce((s, v) => s + v, 0) / m; let sab = 0, saa = 0, sbb = 0;
            for (let i = 0; i < m; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; } return sab / Math.sqrt(saa * sbb); };
        const escala = (nombre, corto, prueba, k, media, de, alfa, extra = {}) => ({ nombre, nombreCorto: corto, prueba, tipo: 'dimension', numItems: k, media, desviacion: de, minimo: 1, maximo: 5, alfa, distribucion: 'normal', invertidos: 0, ...extra });
        const cfgBase = (extra = {}) => ({ tamanoMuestra: n, semilla: 2026, generarPercentiles: true, correlacionesExactas: true, indiceFiabilidad: 'alfa',
            variablesPorTest: { 'EQ-i': { variable: 'Inteligencia emocional', rIntra: 0.40 } },
            pruebas: [escala('Percepción', 'PE', 'EQ-i', 8, 24, 4, 0.80), escala('Comprensión', 'CE', 'EQ-i', 8, 24, 4, 0.85), escala('Regulación', 'RE', 'EQ-i', 8, 24, 4, 0.75),
                      escala('Estrés', 'ST', 'PSS', 10, 20, 6, 0.80, { minimo: 0, maximo: 4 })],
            sociodemograficos: [{ categoria: 'Edad', categoriaCorta: 'Edad', distribucion: 'normal', promedio: 16, desviacion: 1.5, minimo: 12, maximo: 20, decimales: 0 }],
            correlaciones: [], diferenciasGrupo: [], gruposPruebas: [], realismo: { pctPerdidos: 0, pctDescuidados: 0, pctDigitacion: 0 }, ...extra });
        const generar = cfg => { const g = new GeneradorDatos(); g.configuracion = JSON.parse(JSON.stringify(cfg)); g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas); return { g, d: g.generarBaseDatos() }; };
        const col = (d, k) => d.map(x => x[k]);
        try {
            // 1-2) correlación exacta + fiabilidad calibrada
            const { g: g1, d: d1 } = generar(cfgBase({ correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.40 }, { a: 'Inteligencia emocional — EQ-i', b: 'Estrés', r: -0.30 }] }));
            const rPE = corr(col(d1, 'Dimension_PE'), col(d1, 'Dimension_ST'));
            ok('correlación exacta pedida −0.40', Math.abs(rPE + 0.40) < 0.012, rPE.toFixed(3));
            const gCol = Object.keys(d1[0]).find(k => k.startsWith('General_'));
            const rG = corr(col(d1, gCol), col(d1, 'Dimension_ST'));
            ok('correlación sobre el General derivado −0.30', Math.abs(rG + 0.30) < 0.02, rG.toFixed(3));
            const rIn = corr(col(d1, 'Dimension_CE'), col(d1, 'Dimension_RE'));
            ok('relleno intra-test 0.40', Math.abs(rIn - 0.40) < 0.02, rIn.toFixed(3));
            const inf = g1.informePedidoObtenido(d1);
            const fiab = inf.filter(f => f.tipo === 'α');
            ok('fiabilidad autocalibrada (α) dentro de ±0.04 (≈2 EE)', fiab.length >= 3 && fiab.every(f => f.ok), fiab.map(f => `${f.pedido}→${f.obtenido}`).join(' '));
            ok('General = promedio ENTERO de las dimensiones', d1.every(x => !esNum(x[gCol]) || x[gCol] === Math.round((x.Dimension_PE + x.Dimension_CE + x.Dimension_RE) / 3)));
            // 3) matriz imposible detectada y corregida
            const { g: g2 } = generar(cfgBase({ correlaciones: [{ a: 'Percepción', b: 'Comprensión', r: 0.95 }, { a: 'Comprensión', b: 'Regulación', r: 0.95 }, { a: 'Percepción', b: 'Regulación', r: -0.90 }] }));
            ok('matriz imposible detectada, con tríada y matriz válida', g2.diagnosticoCorrelaciones.imposible && g2.diagnosticoCorrelaciones.triadas.length === 1 && g2._esDefinidaPositiva(g2.diagnosticoCorrelaciones.R));
            // 4) ítems invertidos: reflejados en bruto, total correcto tras recodificar
            const cfgInv = cfgBase(); cfgInv.pruebas[0].invertidos = 3; cfgInv.pruebas[0].media = 30;   // media de ítem 3.75: la reflexión desplaza la suma
            const { g: g3, d: d3 } = generar(cfgInv);
            const p0 = g3.configuracion.pruebas[0];
            const sumaRecod = x => { let s = 0; for (let j = 1; j <= 8; j++) s += g3._recodificar(p0, j, x[`PE${j}`]); return s; };
            ok('ítems invertidos: total = suma de ítems RECODIFICADOS', d3.every(x => Math.abs(sumaRecod(x) - x.Dimension_PE) < 0.01));
            const sumaBruta = x => { let s = 0; for (let j = 1; j <= 8; j++) s += x[`PE${j}`]; return s; };
            ok('ítems invertidos: la suma BRUTA no coincide (hay que recodificar)', d3.filter(x => Math.abs(sumaBruta(x) - x.Dimension_PE) > 0.5).length > d3.length * 0.8);
            const rInv = corr(col(d3, 'PE1'), col(d3, 'PE8'));
            ok('ítem invertido correlaciona NEGATIVO en bruto con uno directo', rInv < -0.05, rInv.toFixed(3));
            // 5) valores perdidos: regla del 80 % y exportación limpia
            const { g: g4, d: d4 } = generar(cfgBase({ realismo: { pctPerdidos: 8, mecanismoPerdidos: 'MCAR', pctDescuidados: 0, pctDigitacion: 0 } }));
            const faltan = x => { let f = 0; for (let j = 1; j <= 8; j++) if (!esNum(x[`PE${j}`])) f++; return f; };
            ok('regla del 80 %: total vacío solo si faltan >20 % de los ítems', d4.every(x => (faltan(x) >= 2) === !esNum(x.Dimension_PE)));
            ok('exportación: perdidos como celda vacía, nunca NaN', !/NaN/.test(g4.exportarCSV(',')));
            ok('exportación en formato español (;): perdidos vacíos, decimales con coma', !/NaN/.test(g4.exportarCSV(';')) && /;\d+,\d/.test(g4.exportarCSV(';')));
            ok('percentil vacío cuando el total falta', d4.filter(x => !esNum(x.Dimension_PE)).every(x => !esNum(x.PC_PE)));
            // 6) (A1) d por grupo sin sesgo de redondeo, con Media y DE totales intactas
            const cfgDif = cfgBase({ sociodemograficos: [{ categoria: 'Sexo', categoriaCorta: 'Sexo', distribucion: 'binaria', promedio: 0.5, desviacion: 0, minimo: null, maximo: null, decimales: 0 }],
                diferenciasGrupo: [{ cuantitativa: 'Estrés', agrupacion: 'Sexo', d: 0.8 }] });
            const { g: g5, d: d5 } = generar(cfgDif);
            const inf5 = g5.informePedidoObtenido(d5);
            const fd = inf5.find(f => f.tipo === 'd'), fDE = inf5.find(f => f.tipo === 'DE' && f.variable === 'Estrés');
            ok('(A1) d por grupo pedida 0.8 → obtenida', !!fd && Math.abs(parseFloat(fd.obtenido) - 0.8) <= 0.06, fd && fd.obtenido);
            ok('(A1) DE total de la escala con diferencias sigue siendo la pedida', !!fDE && Math.abs(parseFloat(fDE.obtenido) - 6) <= 0.3, fDE && fDE.obtenido);
            // 7) (A2) correlación exacta con forma asimétrica
            const cfgAs = cfgBase({ correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.40 }] });
            cfgAs.pruebas[0].distribucion = 'asimetrica'; cfgAs.pruebas[3].distribucion = 'asimetrica';
            const { d: d6 } = generar(cfgAs);
            const rAs = corr(col(d6, 'Dimension_PE'), col(d6, 'Dimension_ST'));
            ok('(A2) r −0.40 exacta entre dos escalas asimétricas', Math.abs(rAs + 0.40) < 0.02, rAs.toFixed(3));
            // 8) (A4) relleno intra-test con la tabla III vacía
            const { d: d7 } = generar(cfgBase({ correlaciones: [] }));
            const rIntraVacia = corr(col(d7, 'Dimension_CE'), col(d7, 'Dimension_RE'));
            ok('(A4) relleno intra-test 0.40 sin tabla III', Math.abs(rIntraVacia - 0.40) < 0.02, rIntraVacia.toFixed(3));
            // 10) sociodemográfico cuyo nombre corto NO coincide con su nombre: la columna
            //     se llama como la categoría; el informe (r, d) y el MAR deben encontrarla
            const cfgSoc = cfgBase({ sociodemograficos: [{ categoria: 'Edad del participante', categoriaCorta: 'EDP', distribucion: 'normal', promedio: 16, desviacion: 1.5, minimo: 12, maximo: 20, decimales: 0 },
                { categoria: 'Sexo del participante', categoriaCorta: 'SDP', distribucion: 'binaria', promedio: 0.5, desviacion: 0, minimo: null, maximo: null, decimales: 0 }],
                correlaciones: [{ a: 'Edad del participante', b: 'Estrés', r: 0.30 }], diferenciasGrupo: [{ cuantitativa: 'Edad del participante', agrupacion: 'Sexo del participante', d: 0.5 }],
                realismo: { pctPerdidos: 10, mecanismoPerdidos: 'MAR', pctDescuidados: 0, pctDigitacion: 0 } });
            const { g9, d9 } = (() => { const r = generar(cfgSoc); return { g9: r.g, d9: r.d }; })();
            const inf9 = g9.informePedidoObtenido(d9);
            ok('informe: r con sociodemográfico de nombre largo aparece y se cumple', inf9.some(f => f.tipo === 'r' && f.variable.startsWith('Edad del participante') && f.ok), (inf9.find(f => f.tipo === 'r') || {}).obtenido);
            ok('informe: d con sociodemográfico de nombre largo aparece', inf9.some(f => f.tipo === 'd' && f.variable === 'Edad del participante por Sexo del participante'));
            const faltanPE = x => { let f = 0; for (let j = 1; j <= 8; j++) if (!esNum(x[`PE${j}`])) f++; return f; };
            const ordenados = d9.slice().sort((a, b) => a['Edad del participante'] - b['Edad del participante']);
            const mitad = ordenados.length >> 1;
            const bajos = ordenados.slice(0, mitad).reduce((s, x) => s + faltanPE(x), 0), altos = ordenados.slice(mitad).reduce((s, x) => s + faltanPE(x), 0);
            ok('MAR: los perdidos se concentran en quienes puntúan bajo en la referencia', bajos > altos * 1.3, `${bajos} vs ${altos}`);
            // 11) correlación de un General con una de sus propias dimensiones (parte–todo):
            //     si no es alcanzable se avisa con la implicada; si lo es, se cumple
            const { g: g10, d: d10 } = generar(cfgBase({ correlaciones: [{ a: 'Inteligencia emocional — EQ-i', b: 'Percepción', r: 0.10 }] }));
            const lim10 = (g10.diagnosticoCorrelaciones.limitadas || []).find(l => l.a === 'Inteligencia emocional — EQ-i');
            const r10 = g10.informePedidoObtenido(d10).find(f => f.tipo === 'r');
            ok('General ↔ propia dimensión inalcanzable → aviso con el valor implicado (= el medido)', !!lim10 && !!r10 && Math.abs(lim10.alcanzable - parseFloat(r10.obtenido)) < 0.03, lim10 && r10 && `${lim10.alcanzable.toFixed(3)} vs ${r10.obtenido}`);
            const { g: g11, d: d11 } = generar(cfgBase({ correlaciones: [{ a: 'Inteligencia emocional — EQ-i', b: 'Percepción', r: 0.80 }] }));
            const r11 = g11.informePedidoObtenido(d11).find(f => f.tipo === 'r');
            ok('General ↔ propia dimensión alcanzable → se cumple', !!r11 && r11.ok, r11 && r11.obtenido);
            // 12) d sobre el General y d explícita sobre una de sus dimensiones, misma agrupación
            const cfg12 = cfgBase({ sociodemograficos: [{ categoria: 'Sexo', categoriaCorta: 'Sexo', distribucion: 'binaria', promedio: 0.5, desviacion: 0, minimo: null, maximo: null, decimales: 0 }],
                diferenciasGrupo: [{ cuantitativa: 'Inteligencia emocional — EQ-i', agrupacion: 'Sexo', d: -0.6 }, { cuantitativa: 'Percepción', agrupacion: 'Sexo', d: 0.5 }] });
            const { g: g12, d: d12 } = generar(cfg12);
            const dd12 = g12.informePedidoObtenido(d12).filter(f => f.tipo === 'd');
            ok('d del General y d de su dimensión, misma agrupación, ambas cumplidas', dd12.length === 2 && dd12.every(f => f.ok), dd12.map(f => `${f.pedido}→${f.obtenido}`).join(' '));
            // 13) d exacta también con forma asimétrica (driver en espacio de valor)
            const cfg13 = cfgBase({ sociodemograficos: [{ categoria: 'Sexo', categoriaCorta: 'Sexo', distribucion: 'binaria', promedio: 0.5, desviacion: 0, minimo: null, maximo: null, decimales: 0 }],
                correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.40 }], diferenciasGrupo: [{ cuantitativa: 'Percepción', agrupacion: 'Sexo', d: -1.1 }] });
            cfg13.pruebas[0].distribucion = 'asimetrica';   // continua: sin recorte Likert (el recorte atenúa la DE y con ella la d; limitación conocida)
            const { g: g13, d: d13 } = generar(cfg13);
            const inf13 = g13.informePedidoObtenido(d13);
            const d13d = inf13.find(f => f.tipo === 'd'), r13 = inf13.find(f => f.tipo === 'r');
            ok('d exacta con escala asimétrica (y su r intacta)', !!d13d && d13d.ok && !!r13 && r13.ok, `${d13d && d13d.obtenido} · r ${r13 && r13.obtenido}`);
            // 9) (A3) muestra sin reemplazo uniforme (la fila 1 ya no sale favorecida)
            const g8 = new GeneradorDatos(); let vecesFila0 = 0; const reps = 1500;
            for (let s = 1; s <= reps; s++) { g8.inicializarAleatorio(s); if (g8._muestraSinReemplazo(60, 6).includes(0)) vecesFila0++; }
            ok('(A3) muestra sin reemplazo: fila 1 elegida ≈ 10 %', Math.abs(vecesFila0 / reps - 0.10) < 0.03, (vecesFila0 / reps).toFixed(3));
        } catch (e) {
            ok('el autotest no lanza excepciones', false, e && e.message);
        }
        const verdes = res.filter(r => r.ok).length;
        const resumen = `${verdes}/${res.length} en verde`;
        if (typeof console !== 'undefined') {
            res.forEach(r => console[r.ok ? 'log' : 'error'](`${r.ok ? '✓' : '✗'} ${r.nombre}${r.detalle ? ' · ' + r.detalle : ''}`));
            console.log(`[GeneradorDatos.autotest] ${resumen}`);
        }
        return { resumen, resultados: res };
    }

    // ============ IMPERFECCIONES REALISTAS (opcionales) ============
    // Una base real nunca es perfecta. Estas tres capas se aplican DESPUÉS de
    // generar y los totales se recalculan para que todo siga siendo coherente:
    //  · Valores perdidos por ítem (MCAR: al azar; MAR: más probables en quienes
    //    puntúan bajo en una variable observada). Total con regla del 80 %: si
    //    falta ≤20 % de los ítems se prorratea; si falta más, el total se pierde.
    //  · Respuestas descuidadas: «línea recta» (mismo valor en todos los ítems)
    //    o aleatorias. Su total se recalcula a partir de esos ítems.
    //  · Errores de digitación: un ítem con un valor imposible (fuera de rango),
    //    el atípico más común en bases reales y el primero que hay que limpiar.
    // ÍTEMS INVERTIDOS: los últimos «invertidos» ítems de la escala se guardan
    // reflejados (min+max−valor en Likert; alrededor de la media de ítem si es
    // continua). El total sigue siendo el correcto: quien analice debe RECODIFICAR
    // esos ítems antes de sumar o de calcular fiabilidad, como en una base real.
    _esInvertido(p, idx1) { return (p.invertidos || 0) > 0 && idx1 > p.numItems - (p.invertidos || 0); }
    // Muestra SIN reemplazo de k índices de [0, n): Fisher–Yates parcial, O(k).
    // Sustituye a sort(() => aleatorio() − 0.5), que no baraja uniformemente:
    // con n = 200 y k = 20 la fila 1 salía elegida el 25 % de las veces y la
    // 187 el 6 % (lo esperado es 10 % para todas), así que los descuidados se
    // concentraban en los primeros ID.
    _muestraSinReemplazo(n, k) {
        const idx = new Int32Array(n);
        for (let i = 0; i < n; i++) idx[i] = i;
        const tope = Math.max(0, Math.min(k, n));
        for (let j = 0; j < tope; j++) {
            const r = j + Math.floor(this.aleatorio() * (n - j));
            const t = idx[j]; idx[j] = idx[r]; idx[r] = t;
        }
        return idx.subarray(0, tope);
    }
    _reflejar(p, v) {
        if (!(typeof v === 'number' && isFinite(v))) return v;
        const centro2 = (isFinite(p.minimo) && isFinite(p.maximo)) ? (p.minimo + p.maximo) : 2 * (p.media / p.numItems);
        return Math.round((centro2 - v) * 100) / 100;
    }
    _recodificar(p, idx1, v) { return this._esInvertido(p, idx1) ? this._reflejar(p, v) : v; }
    _itemsDe(p) { const out = []; for (let j = 1; j <= p.numItems; j++) out.push(`${p.nombreCorto}${j}`); return out; }
    _recalcularTotales(d, grupos) {
        const cfg = this.configuracion;
        (cfg.pruebas || []).forEach(p => {
            if (p.numItems < 1) return;
            const items = this._itemsDe(p).map((k, j) => this._recodificar(p, j + 1, d[k])).filter(v => typeof v === 'number' && isFinite(v));
            const col = this.columnaDeEscala(p);
            if (items.length === 0) { d[col] = NaN; return; }
            if (items.length < p.numItems) {
                if (items.length < 0.8 * p.numItems) { d[col] = NaN; return; }
                const prorrateo = items.reduce((s, v) => s + v, 0) / items.length * p.numItems;   // regla del 80 %
                d[col] = Math.round(prorrateo * 100) / 100;
            } else {
                d[col] = Math.round(items.reduce((s, v) => s + v, 0) * 100) / 100;
            }
        });
        (grupos || []).forEach(g => {
            if (g.escalas.length < 2) return;
            const vals = g.escalas.map(s => d[`Dimension_${s}`]);
            d[`General_${g.sigla}`] = vals.every(v => typeof v === 'number' && isFinite(v))
                ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : NaN;
        });
    }
    aplicarImperfecciones(datos) {
        const r = this.configuracion.realismo || {};
        const cfg = this.configuracion, grupos = cfg.gruposPruebas || [];
        const n = datos.length;
        if (!n || !(r.pctPerdidos > 0 || r.pctDescuidados > 0 || r.pctDigitacion > 0)) return { perdidos: 0, descuidados: 0, digitacion: 0 };
        const pruebasConItems = (cfg.pruebas || []).filter(p => p.numItems >= 2);
        const tocados = new Set();
        let nPerdidos = 0, nDescuidados = 0, nDigitacion = 0;
        // --- Respuestas descuidadas ---
        if (r.pctDescuidados > 0 && pruebasConItems.length) {
            const k = Math.round(n * r.pctDescuidados / 100);
            const orden = this._muestraSinReemplazo(n, k);
            orden.forEach(i => {
                const d = datos[i];
                let tipo = r.tipoDescuidado;
                if (tipo === 'mixto') tipo = this.aleatorio() < 0.5 ? 'linea' : 'aleatorio';
                pruebasConItems.forEach(p => {
                    const min = isFinite(p.minimo) ? p.minimo : Math.floor(p.media / p.numItems - p.desviacion);
                    const max = isFinite(p.maximo) ? p.maximo : Math.ceil(p.media / p.numItems + p.desviacion);
                    const fijo = min + Math.floor(this.aleatorio() * (max - min + 1));
                    this._itemsDe(p).forEach(kk => {
                        d[kk] = tipo === 'linea' ? fijo : (min + Math.floor(this.aleatorio() * (max - min + 1)));
                    });
                });
                if (r.marcarDescuidados) d['Respuesta_descuidada'] = 1;
                tocados.add(i); nDescuidados++;
            });
            if (r.marcarDescuidados) datos.forEach(d => { if (d['Respuesta_descuidada'] !== 1) d['Respuesta_descuidada'] = 0; });
        }
        // --- Errores de digitación (atípicos) ---
        if (r.pctDigitacion > 0 && pruebasConItems.length) {
            const k = Math.round(n * r.pctDigitacion / 100);
            for (let c = 0; c < k; c++) {
                const i = Math.floor(this.aleatorio() * n), d = datos[i];
                const p = pruebasConItems[Math.floor(this.aleatorio() * pruebasConItems.length)];
                const items = this._itemsDe(p), kk = items[Math.floor(this.aleatorio() * items.length)];
                const max = isFinite(p.maximo) ? p.maximo : Math.ceil(p.media / p.numItems + 2 * p.desviacion);
                const v = d[kk];
                // dígito repetido («44» por «4») o un cero de más («50» por «5»)
                d[kk] = (typeof v === 'number' && isFinite(v) && this.aleatorio() < 0.5) ? Number(String(Math.round(v)) + String(Math.round(v))) : max * 10;
                tocados.add(i); nDigitacion++;
            }
        }
        // --- Valores perdidos ---
        if (r.pctPerdidos > 0 && pruebasConItems.length) {
            const p0 = r.pctPerdidos / 100;
            // MAR: referencia observada = primer sociodemográfico numérico o, si no hay, el primer total
            let ref = null;
            const socioNum = (cfg.sociodemograficos || []).find(s => s.distribucion === 'normal' || s.distribucion === 'asimetrica');
            if (socioNum) ref = socioNum.categoria;   // la columna se llama como la categoría (no como su nombre corto)
            else if (cfg.pruebas && cfg.pruebas.length) ref = this.columnaDeEscala(cfg.pruebas[0]);
            let rangos = null;
            if (r.mecanismoPerdidos === 'MAR' && ref) {
                const vals = datos.map((d, i) => [d[ref], i]).filter(x => typeof x[0] === 'number' && isFinite(x[0])).sort((a, b) => a[0] - b[0]);
                rangos = new Array(n).fill(0.5);
                vals.forEach(([, i], pos) => { rangos[i] = vals.length > 1 ? pos / (vals.length - 1) : 0.5; });
            }
            datos.forEach((d, i) => {
                // MAR: quienes puntúan bajo en la referencia pierden hasta el doble; los altos casi nada
                const pi = rangos ? Math.max(0, Math.min(1, p0 * (1.8 - 1.6 * rangos[i]))) : p0;
                pruebasConItems.forEach(p => this._itemsDe(p).forEach(kk => {
                    if (this.aleatorio() < pi) { d[kk] = NaN; nPerdidos++; tocados.add(i); }
                }));
            });
        }
        tocados.forEach(i => this._recalcularTotales(datos[i], grupos));
        return { perdidos: nPerdidos, descuidados: nDescuidados, digitacion: nDigitacion };
    }

    // ============ DIAGNÓSTICO DE LA MATRIZ DE CORRELACIONES ============
    // Una petición como r(A,B)=0.9, r(B,C)=0.9, r(A,C)=−0.5 es imposible: ninguna
    // muestra real puede tenerla. Antes se forzaba en silencio (distorsionando
    // TODO). Ahora: (1) se detectan las tríadas incompatibles, (2) se sustituye
    // por la matriz válida más cercana (recorte de autovalores) y (3) se informa
    // exactamente cuánto se movió cada correlación.
    _esDefinidaPositiva(R) {
        const n = R.length, L = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
            let s = 0;
            for (let k = 0; k < j; k++) s += L[i][k] * L[j][k];
            if (i === j) { const d = R[i][i] - s; if (d <= 1e-10) return false; L[i][i] = Math.sqrt(d); }
            else L[i][j] = (R[i][j] - s) / L[j][j];
        }
        return true;
    }
    _triadasIncompatibles(R, nombres) {
        const out = [], n = R.length;
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
            const a = R[i][j], b = R[i][k], c = R[j][k];
            if (!a || !b || !c) continue;
            const det = 1 + 2 * a * b * c - a * a - b * b - c * c;
            if (det < -1e-9) out.push({ variables: [nombres[i], nombres[j], nombres[k]], correlaciones: [a, b, c], det });
        }
        return out;
    }
    // Autovalores/autovectores de una matriz simétrica (Jacobi cíclico).
    _jacobi(A) {
        const n = A.length, M = A.map(f => f.slice()), V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
        for (let sweep = 0; sweep < 60; sweep++) {
            let off = 0;
            for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += M[p][q] * M[p][q];
            if (off < 1e-14) break;
            for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
                if (Math.abs(M[p][q]) < 1e-14) continue;
                const theta = (M[q][q] - M[p][p]) / (2 * M[p][q]);
                const tt = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
                const c = 1 / Math.sqrt(tt * tt + 1), s = tt * c;
                for (let k = 0; k < n; k++) { const mkp = M[k][p], mkq = M[k][q]; M[k][p] = c * mkp - s * mkq; M[k][q] = s * mkp + c * mkq; }
                for (let k = 0; k < n; k++) { const mpk = M[p][k], mqk = M[q][k]; M[p][k] = c * mpk - s * mqk; M[q][k] = s * mpk + c * mqk; }
                for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
            }
        }
        return { valores: M.map((f, i) => f[i]), vectores: V };
    }
    _matrizValidaMasCercana(R) {
        const n = R.length, { valores, vectores } = this._jacobi(R);
        const piso = 1e-3;
        const S = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            let s = 0;
            for (let k = 0; k < n; k++) s += vectores[i][k] * Math.max(valores[k], piso) * vectores[j][k];
            S[i][j] = s;
        }
        const d = S.map((f, i) => Math.sqrt(f[i]));
        return S.map((f, i) => f.map((x, j) => (i === j ? 1 : x / (d[i] * d[j]))));
    }
    diagnosticarMatriz(R, nombres) {
        if (this._esDefinidaPositiva(R)) return { imposible: false, triadas: [], ajustes: [], R };
        const triadas = this._triadasIncompatibles(R, nombres);
        const Rv = this._matrizValidaMasCercana(R);
        const ajustes = [];
        for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++)
            if (Math.abs(Rv[i][j] - R[i][j]) > 0.005) ajustes.push({ a: nombres[i], b: nombres[j], pedido: R[i][j], ajustado: Rv[i][j] });
        ajustes.sort((x, y) => Math.abs(y.ajustado - y.pedido) - Math.abs(x.ajustado - x.pedido));
        return { imposible: true, triadas, ajustes, R: Rv };
    }

    // ============ INFORME PEDIDO vs OBTENIDO ============
    // Cierra el ciclo «lo que se pide es lo que se entrega»: mide en la base
    // generada cada parámetro solicitado y lo pone al lado del valor real.
    _corr(x, y) {
        const n = x.length; let mx = 0, my = 0;
        for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
        mx /= n; my /= n;
        let sxy = 0, sxx = 0, syy = 0;
        for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
        return (sxx > 0 && syy > 0) ? sxy / Math.sqrt(sxx * syy) : NaN;
    }
    informePedidoObtenido(datos) {
        const filas = [];
        if (!datos || !datos.length) return filas;
        const cfg = this.configuracion;
        const col = k => datos.map(d => d[k]).filter(v => typeof v === 'number' && isFinite(v));
        const num = (v, dec = 2) => (isFinite(v) ? Number(v).toFixed(dec) : '—');
        // Columna de cada variable correlacionable (dimensión, general derivado o socio)
        const grupos = cfg.gruposPruebas || [];
        const columnaDe = nombre => {
            const p = (cfg.pruebas || []).find(x => x.nombre === nombre);
            if (p) return this.columnaDeEscala(p);
            const g = grupos.find(x => this.nombreGeneral(x) === nombre && x.escalas.length >= 2);
            if (g) return `General_${g.sigla}`;
            const s = (cfg.sociodemograficos || []).find(x => x.categoria === nombre);
            return s ? s.categoria : null;   // la columna de un sociodemográfico se llama como su categoría
        };
        // 1) Media y DE de cada escala
        (cfg.pruebas || []).forEach(p => {
            const v = col(this.columnaDeEscala(p));
            if (v.length < 3) return;
            const m = v.reduce((a, b) => a + b, 0) / v.length;
            const de = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
            filas.push({ tipo: 'Media', variable: p.nombre, pedido: num(p.media), obtenido: num(m), ok: Math.abs(m - p.media) <= Math.max(0.5, 0.1 * p.desviacion) });
            filas.push({ tipo: 'DE', variable: p.nombre, pedido: num(p.desviacion), obtenido: num(de), ok: Math.abs(de - p.desviacion) <= Math.max(0.3, 0.15 * p.desviacion) });
        });
        // 2) Fiabilidad de cada escala con objetivo (α u ω, según el índice elegido)
        const indice = cfg.indiceFiabilidad || 'alfa';
        (cfg.pruebas || []).forEach(p => {
            if (!(p.alfa > 0 && p.alfa < 1) || p.numItems < 2) return;
            const cols = [];
            // Solo casos con todos los ítems presentes, y RECODIFICANDO los invertidos
            const completos = datos.filter(d => this._itemsDe(p).every(k => typeof d[k] === 'number' && isFinite(d[k])));
            if (completos.length < 10) return;
            for (let j = 1; j <= p.numItems; j++) cols.push(completos.map(d => this._recodificar(p, j, d[`${p.nombreCorto}${j}`])));
            if (cols.length < 2) return;
            const obs = this._indiceObservado(cols, indice);
            if (obs === null || !isFinite(obs)) return;
            filas.push({ tipo: indice === 'omega' ? 'ω' : 'α', variable: p.nombre, pedido: num(p.alfa), obtenido: num(obs, 3), ok: Math.abs(obs - p.alfa) <= 0.04 });   // ±0.04 ≈ 2 EE de α con n≈300
        });
        // 3) Correlaciones objetivo (incluidas las de generales derivados)
        (cfg.correlaciones || []).forEach(({ a, b, r }) => {
            const ca = columnaDe(a), cb = columnaDe(b);
            if (!ca || !cb) return;
            const x = datos.map(d => d[ca]), y = datos.map(d => d[cb]);
            const pares = x.map((v, i) => [v, y[i]]).filter(([u, w]) => isFinite(u) && isFinite(w));
            if (pares.length < 3) return;
            const obs = this._corr(pares.map(q => q[0]), pares.map(q => q[1]));
            filas.push({ tipo: 'r', variable: `${a} ↔ ${b}`, pedido: num(r), obtenido: num(obs, 3), ok: Math.abs(obs - r) <= 0.03 });
        });
        // 4) Diferencias por grupo (d de Cohen): cambio de la media por unidad de
        //    código (pendiente), dividido por la DE intra-grupo agrupada. En modo
        //    exacto no fluctúa; si no, la tolerancia es 2 EE de la d.
        // La d solo es exacta si los drivers se ortogonalizaron a los grupos
        // (modo exacto y n suficiente); si no, fluctúa como en una muestra real.
        const exactas = cfg.correlacionesExactas !== false && this.driversOrtogonalizados === true;
        (cfg.diferenciasGrupo || []).forEach(dif => {
            const agrup = (cfg.sociodemograficos || []).find(s => s.categoria === dif.agrupacion);
            const cv = columnaDe(dif.cuantitativa);
            if (!agrup || !cv || !(typeof dif.d === 'number' && isFinite(dif.d))) return;
            const pares = datos.map(d => [d[agrup.categoria], d[cv]]).filter(([g, v]) => typeof g === 'number' && isFinite(g) && typeof v === 'number' && isFinite(v));
            if (pares.length < 6) return;
            const porGrupo = new Map();
            pares.forEach(([g, v]) => { if (!porGrupo.has(g)) porGrupo.set(g, []); porGrupo.get(g).push(v); });
            if (porGrupo.size < 2) {
                filas.push({ tipo: 'd', variable: `${dif.cuantitativa} por ${dif.agrupacion}`, pedido: num(dif.d), obtenido: 'un solo grupo en la muestra', ok: false });
                return;
            }
            let ssIntra = 0, gl = 0;
            porGrupo.forEach(vals => {
                const mg = vals.reduce((a, b) => a + b, 0) / vals.length;
                vals.forEach(v => { ssIntra += (v - mg) ** 2; });
                gl += vals.length - 1;
            });
            const deIntra = Math.sqrt(ssIntra / Math.max(1, gl));
            const codigos = pares.map(q => q[0]), valores = pares.map(q => q[1]);
            const mc = codigos.reduce((a, b) => a + b, 0) / codigos.length, mv = valores.reduce((a, b) => a + b, 0) / valores.length;
            let sxy = 0, sxx = 0;
            for (let i = 0; i < codigos.length; i++) { sxy += (codigos[i] - mc) * (valores[i] - mv); sxx += (codigos[i] - mc) ** 2; }
            if (!(sxx > 0) || !(deIntra > 0)) return;
            const obs = (sxy / sxx) / deIntra;
            const ee = 1 / Math.sqrt(sxx);   // ≈ √(1/n₀ + 1/n₁) en una binaria
            // En modo exacto solo queda el ruido del redondeo de la variable (Likert:
            // enteros; continua: 2 decimales; socio: sus decimales), DE = unidad/√12.
            const p = (cfg.pruebas || []).find(x => x.nombre === dif.cuantitativa);
            const s = (cfg.sociodemograficos || []).find(x => x.categoria === dif.cuantitativa);
            const unidad = p ? ((p.minimo !== null && p.maximo !== null) ? 1 : 0.01) : (s ? Math.pow(10, -(s.decimales || 0)) : 1);
            const eeRedondeo = (unidad / Math.sqrt(12)) / Math.sqrt(sxx) / deIntra;
            const limitada = (this.diferenciasLimitadas || []).some(l => l.variable === dif.cuantitativa && l.agrupacion === dif.agrupacion);
            const etiqueta = `${dif.cuantitativa} por ${dif.agrupacion}` + (limitada ? ' (no alcanzable con las d de sus dimensiones)' : '');
            filas.push({ tipo: 'd', variable: etiqueta, pedido: num(dif.d), obtenido: num(obs), ok: !limitada && Math.abs(obs - dif.d) <= Math.max(0.06, 2 * (exactas ? eeRedondeo : ee)) });
        });
        return filas;
    }

    prepararCorrelaciones() {
        const variables = [];

        this.configuracion.pruebas.forEach(prueba => {
            variables.push({ tipo: 'escala', clave: prueba.nombreCorto, nombre: prueba.nombre });
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
        this.configuracion.pruebas.forEach(p => { porSigla[p.nombreCorto] = p; });
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
        (this.configuracion.correlaciones || []).forEach(({ a, b, r }) => {
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
        (this.configuracion.correlaciones || []).forEach(({ a, b, r }) => {
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
        (this.configuracion.correlaciones || []).forEach(({ a, b, r }) => {
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
    }

    // ============ DIFERENCIAS POR GRUPO (d de Cohen) ============
    // Cada fila de la tabla pide que dos grupos adyacentes de la variable de
    // agrupación difieran d·σ_intra en la variable cuantitativa. Contrato:
    //  · la Media y la DE pedidas son las de TODA la base: la DE intra-grupo es
    //    σ·s, con s = 1/√(1 + Σ d²·Var(código)), y el desplazamiento de cada
    //    persona es Σ d·σ·s·(código − media del código), de media 0;
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
        const anadir = (nombre, agrup, d, origen) => {
            if (!efectivas.has(nombre)) efectivas.set(nombre, []);
            efectivas.get(nombre).push({ agrup, d, origen });
        };
        const grupos = cfg.gruposPruebas || [];
        const porSigla = {};
        (cfg.pruebas || []).forEach(p => { porSigla[p.nombreCorto] = p; });
        const vistas = new Set();          // (variable, agrupación) repetida: manda la primera fila, como en las correlaciones
        const sobreGeneral = [];
        (cfg.diferenciasGrupo || []).forEach(dif => {
            const agrup = (cfg.sociodemograficos || []).find(s => s.categoria === dif.agrupacion);
            const varC = this._varianzaCodigo(agrup);
            if (varC === null || !(typeof dif.d === 'number' && isFinite(dif.d)) || dif.d === 0) return;
            const clave = `${dif.cuantitativa}|${dif.agrupacion}`;
            if (vistas.has(clave)) return;
            vistas.add(clave);
            const esEscala = (cfg.pruebas || []).some(p => p.nombre === dif.cuantitativa);
            const esSocio = (cfg.sociodemograficos || []).some(s => s.categoria === dif.cuantitativa && !this._esSocioDiscreto(s));
            if (esEscala || esSocio) { anadir(dif.cuantitativa, agrup, dif.d, 'explicita'); return; }
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
        const varianzaCodigo = agrup => this._varianzaCodigo(agrup) || 0;
        const factorIntra = nombre => {
            let suma = 0;
            (efectivas.get(nombre) || []).forEach(e => { suma += e.d * e.d * varianzaCodigo(e.agrup); });
            return 1 / Math.sqrt(1 + suma);
        };
        const dGeneral = (req) => {
            // d observada sobre el General con las diferencias efectivas actuales:
            // Δ_G = (1/K)·Σ d_i·σ_i·s_i ; σ_G,intra² = σ_G² − Σ_k Δ_G,k²·Var(c_k)
            const K = req.dims.length;
            const sigmaG = this._factorGeneral(req.g, req.dims) * req.dims.reduce((s, p) => s + p.desviacion, 0) / K;
            const porAgrup = new Map();
            req.dims.forEach(p => {
                const s = factorIntra(p.nombre);
                (efectivas.get(p.nombre) || []).forEach(e => porAgrup.set(e.agrup, (porAgrup.get(e.agrup) || 0) + e.d * p.desviacion * s / K));
            });
            let entre = 0;
            porAgrup.forEach((delta, agrup) => { entre += delta * delta * varianzaCodigo(agrup); });
            const intra = Math.sqrt(Math.max(1e-12, sigmaG * sigmaG - entre));
            return (porAgrup.get(req.agrup) || 0) / intra;
        };
        this.diferenciasLimitadas = [];
        for (let ronda = 0; ronda < (sobreGeneral.length > 1 ? 4 : 1); ronda++) {
            sobreGeneral.forEach(req => {
                const libres = req.dims.filter(p => !(efectivas.get(p.nombre) || []).some(e => e.agrup === req.agrup && e.origen === 'explicita'));
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
        const factores = new Map();
        efectivas.forEach((lista, nombre) => factores.set(nombre, factorIntra(nombre)));
        this.diferenciasEfectivas = efectivas;
        this.factoresDEIntra = factores;
    }
    _esSocioDiscreto(socio) {
        const d = socio.distribucion || 'normal';
        return d === 'binaria' || d === 'categorica' || d === 'conteo';
    }
    // Varianza del código de una variable de agrupación: binaria p(1 − p);
    // categórica equiprobable con K niveles (K² − 1)/12. null si no agrupa.
    _varianzaCodigo(agrup) {
        if (!agrup) return null;
        if (agrup.distribucion === 'binaria') {
            const p = agrup.promedio;
            return (p > 0 && p < 1) ? p * (1 - p) : 0;
        }
        if (agrup.distribucion === 'categorica') {
            const K = Math.floor(agrup.maximo - agrup.minimo + 1);
            return K >= 1 ? (K * K - 1) / 12 : 0;
        }
        return null;
    }
    // Código centrado en su MEDIA (binaria: código − p; categórica: código −
    // (mín + máx)/2), para que el desplazamiento tenga media 0 y la Media de la
    // variable en toda la base siga siendo la pedida.
    _codigoCentrado(agrup, codigo) {
        if (!(typeof codigo === 'number' && isFinite(codigo))) return 0;
        if (agrup.distribucion === 'binaria') return codigo - agrup.promedio;
        if (agrup.distribucion === 'categorica') return codigo - (agrup.minimo + agrup.maximo) / 2;
        return 0;
    }
    // σ_G/(Σσ_i/K) del General de un test con las correlaciones OBJETIVO entre
    // sus dimensiones (parejas explícitas de la tabla III o, si no, el r intra).
    _factorGeneral(g, dims) {
        const K = dims.length;
        if (K < 2) return 1;
        const rIntra = g.rIntra === undefined ? 0.40 : g.rIntra;
        const explicitas = this.configuracion.correlaciones || [];
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
    }
    // Factor DE intra-grupo / DE total de una variable (1 si no tiene diferencias).
    _factorDE(nombre) {
        const f = this.factoresDEIntra ? this.factoresDEIntra.get(nombre) : undefined;
        return f === undefined ? 1 : f;
    }
    // DE de un sociodemográfico como variable cuantitativa: la pedida o, para la
    // uniforme continua (que no la tiene), (máx − mín)/√12.
    _deEfectiva(socio) {
        if (typeof socio.desviacion === 'number' && isFinite(socio.desviacion) && socio.desviacion > 0) return socio.desviacion;
        if (socio.distribucion === 'uniforme' && isFinite(socio.minimo) && isFinite(socio.maximo)) return (socio.maximo - socio.minimo) / Math.sqrt(12);
        return 0;
    }
    // Desplazamiento (en unidades de la variable) de un participante en la
    // variable `nombre`: Σ d·σ_intra·(código − media del código).
    _desplazamientoDe(participante, nombre, sigmaTotal) {
        const lista = this.diferenciasEfectivas ? this.diferenciasEfectivas.get(nombre) : undefined;
        if (!lista || !lista.length || !(sigmaTotal > 0)) return 0;
        const sigmaIntra = sigmaTotal * this._factorDE(nombre);
        let total = 0;
        lista.forEach(e => { total += e.d * sigmaIntra * this._codigoCentrado(e.agrup, participante[e.agrup.categoria]); });
        return total;
    }
    // Igual, pero sorteando los códigos de grupo: para calibrar la fiabilidad
    // con la misma estructura entre grupos que tendrá la base.
    _desplazamientoAleatorio(nombre, sigmaTotal) {
        const lista = this.diferenciasEfectivas ? this.diferenciasEfectivas.get(nombre) : undefined;
        if (!lista || !lista.length || !(sigmaTotal > 0)) return 0;
        const sigmaIntra = sigmaTotal * this._factorDE(nombre);
        let total = 0;
        lista.forEach(e => {
            const codigo = e.agrup.distribucion === 'binaria' ? this.generarBinaria(e.agrup.promedio)
                : this.generarCategoria(e.agrup.minimo, e.agrup.maximo);
            total += e.d * sigmaIntra * this._codigoCentrado(e.agrup, codigo);
        });
        return total;
    }
    // Columnas de diseño de los grupos con diferencias (binaria: una columna;
    // categórica: una columna indicadora por nivel salvo el primero), para
    // hacer los drivers ortogonales a ellas en modo exacto.
    _matrizCodigosGrupo(datos) {
        const usados = new Map();
        if (this.diferenciasEfectivas) this.diferenciasEfectivas.forEach(lista => lista.forEach(e => usados.set(e.agrup.categoria, e.agrup)));
        const columnas = [];
        usados.forEach(agrup => {
            const valores = datos.map(d => d[agrup.categoria]);
            if (agrup.distribucion === 'binaria') columnas.push(valores.map(v => (v === 1 ? 1 : 0)));
            else if (agrup.distribucion === 'categorica') {
                for (let nivel = agrup.minimo + 1; nivel <= agrup.maximo; nivel++) columnas.push(valores.map(v => (v === nivel ? 1 : 0)));
            }
        });
        // Solo columnas con varianza (un nivel ausente en la muestra sería una
        // columna nula y haría singular XᵀX).
        return columnas.filter(c => { const s = c.reduce((a, b) => a + b, 0); return s > 0 && s < c.length; });
    }
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
    }
    // Hay estructura de correlación que preparar si: tabla III no vacía, algún
    // test con ≥ 2 dimensiones y r intra ≠ 0, o diferencias por grupo en modo
    // exacto (para que los drivers existan y se ortogonalicen a los grupos).
    _hayEstructuraDeCorrelacion() {
        const cfg = this.configuracion;
        if ((cfg.correlaciones || []).length > 0) return true;
        if ((cfg.gruposPruebas || []).some(g => g.escalas.length >= 2 && (g.rIntra === undefined ? 0.40 : g.rIntra) !== 0)) return true;
        return cfg.correlacionesExactas !== false && !!this.diferenciasEfectivas && this.diferenciasEfectivas.size > 0;
    }

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
            const p = (this.configuracion.pruebas || []).find(x => x.nombreCorto === variable.clave);
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
    }
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
    }
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
    }
    // Inversa de la normal estándar Φ⁻¹(p): algoritmo de Acklam (error relativo
    // < 1.2·10⁻⁹ en todo el dominio).
    normalInversa(p) {
        if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
        const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
        const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
        const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
        const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
        const pBajo = 0.02425;
        if (p < pBajo) {
            const q = Math.sqrt(-2 * Math.log(p));
            return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
        }
        if (p > 1 - pBajo) {
            const q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
        }
        const q = p - 0.5, r = q * q;
        return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    _matrizIntermedia(R, variables) {
        const m = R.length, limitadas = [];
        const formas = variables.map(v => this._formaMarginal(v));
        const nombres = variables.map(v => v.nombre);
        const s = nombres.map(nm => this._factorDE(nm));
        const lista = nm => (this.diferenciasEfectivas && this.diferenciasEfectivas.get(nm)) || [];
        const Rint = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? 1 : 0)));
        for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) {
            const r = R[i][j];
            // covarianza entre grupos compartida (misma agrupación en ambas variables)
            let b = 0;
            lista(nombres[i]).forEach(ei => lista(nombres[j]).forEach(ej => {
                if (ei.agrup === ej.agrup) b += ei.d * ej.d * this._varianzaCodigo(ei.agrup);
            }));
            b *= s[i] * s[j];
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
    }

    // Genera el vector de valores normales correlacionados (uno por variable
    // correlacionable) para un participante: y = L·z con z ~ N(0,1) i.i.d.
    // ================== CORRELACIONES EXACTAS EN LA MUESTRA ==================
    // Sin esto, la correlación OBSERVADA fluctúa alrededor de la pedida por el
    // error de muestreo (con n = 250 y r = 0.40, ±0.05 es lo normal). Aquí se
    // genera la matriz de drivers de TODA la muestra y se «blanquea»:
    //   1. estandarizar columnas → media 0, DE 1
    //   2. Cholesky de la correlación MUESTRAL C = S·Sᵀ  →  W = Z·(S⁻¹)ᵀ
    //      (W queda con correlación muestral EXACTAMENTE identidad)
    //   3. Z* = W·Lᵀ con L = Cholesky de la matriz OBJETIVO
    // Resultado: la correlación muestral de los drivers es exactamente la pedida.
    _estandarizarColumnas(Z) {
        const n = Z.length, m = Z[0].length;
        for (let j = 0; j < m; j++) {
            let s = 0; for (let i = 0; i < n; i++) s += Z[i][j];
            const media = s / n;
            let v = 0; for (let i = 0; i < n; i++) v += (Z[i][j] - media) ** 2;
            const de = Math.sqrt(v / n) || 1e-9;
            for (let i = 0; i < n; i++) Z[i][j] = (Z[i][j] - media) / de;
        }
        return Z;
    }
    _correlacionMuestral(Z) {
        const n = Z.length, m = Z[0].length;
        const C = Array.from({ length: m }, () => new Array(m).fill(0));
        for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) {
            let s = 0; for (let i = 0; i < n; i++) s += Z[i][a] * Z[i][b];
            C[a][b] = s / n;
        }
        return C;
    }
    _inversaTriangularInferior(S) {
        const m = S.length;
        const inv = Array.from({ length: m }, () => new Array(m).fill(0));
        for (let i = 0; i < m; i++) {
            inv[i][i] = 1 / (S[i][i] || 1e-9);
            for (let j = 0; j < i; j++) {
                let s = 0;
                for (let k = j; k < i; k++) s += S[i][k] * inv[k][j];
                inv[i][j] = -s / (S[i][i] || 1e-9);
            }
        }
        return inv;
    }
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
        // Z* = W·Lᵀ
        const salida = new Array(n);
        for (let i = 0; i < n; i++) {
            const w = W[i], y = new Array(m).fill(0);
            for (let a = 0; a < m; a++) { let s = 0; for (let k = 0; k <= a; k++) s += L[a][k] * w[k]; y[a] = s; }
            salida[i] = y;
        }
        // Variables con diferencias por grupo: el driver pasa a ESPACIO DE VALOR
        // (forma aplicada → medias de grupo igualadas → DE 1). Igualar medias
        // en z no basta con formas no normales (las medias de grupo de e^{σz}
        // no son iguales aunque las de z lo sean), y la d dejaba de ser exacta.
        this.driversEnValor = new Set();
        if (funcionesValor) {
            funcionesValor.forEach((f, a) => {
                if (!f.enValor) return;
                const u = this._igualarPorGrupos(Float64Array.from(salida, fila => f.transformar(fila[a])), codigosGrupo);
                for (let i = 0; i < n; i++) salida[i][a] = u[i];
                this.driversEnValor.add(this.correlVariables[a].tipo + ':' + this.correlVariables[a].clave);
            });
        }
        return salida;
    }
    // Funciones de valor de cada variable correlacionable, en el orden de
    // correlVariables: (i, z) → valor final del participante i con driver z.
    // Incluyen su desplazamiento por grupo (calculado con los códigos ya
    // generados en el pase 1) y su DE intra-grupo.
    _funcionesDeValor(datos) {
        const cfg = this.configuracion;
        const conDif = nombre => !!(this.diferenciasEfectivas && (this.diferenciasEfectivas.get(nombre) || []).length);
        return this.correlVariables.map(v => {
            if (v.tipo === 'escala') {
                const p = cfg.pruebas.find(x => x.nombreCorto === v.clave);
                const f = this._factorDE(p.nombre);
                const desp = Float64Array.from(datos, d => this._desplazamientoDe(d, p.nombre, p.desviacion));
                // Con diferencias por grupo el driver llega ya EN ESPACIO DE VALOR
                // (forma aplicada, medias de grupo igualadas, DE 1): la forma no
                // se vuelve a aplicar.
                const enValor = conDif(p.nombre);
                return { enValor, transformar: z => this.transformarFormaZ(z, p.distribucion),
                    valor: (i, base) => this._totalDesdeDriver(p, base, desp[i], f, enValor) };
            }
            const s = cfg.sociodemograficos.find(x => x.categoriaCorta === v.clave);
            const f = this._factorDE(s.categoria);
            const desp = Float64Array.from(datos, d => this._desplazamientoDe(d, s.categoria, this._deEfectiva(s)));
            const enValor = conDif(s.categoria);
            return { enValor, transformar: z => this._formaSocioEstandar(s, z, f),
                valor: (i, base) => this._valorContinuoSocio(s, base, desp[i], f, enValor) };
        });
    }
    // Forma estandarizada (media 0, DE 1) de un sociodemográfico continuo a
    // partir de su driver: para el asimétrico, la log-normal de generarAsimetrico
    // llevada a media 0 y DE 1; para el normal, el propio z.
    _formaSocioEstandar(socio, z, factorDE) {
        if (socio.distribucion === 'asimetrica') {
            const de = socio.desviacion * factorDE;
            return de > 0 ? (this.generarAsimetrico(socio.promedio, de, z) - socio.promedio) / de : z;
        }
        return z;
    }
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
    }
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
        const mejor = { error: Infinity, L, Rt, C: null };
        let sinMejora = 0, proyectada = false, iteraciones = 0;
        const base = new Float64Array(n);
        for (let it = 0; it < 16; it++) {
            iteraciones = it + 1;
            for (let a = 0; a < m; a++) {
                for (let i = 0; i < n; i++) { const w = W[i]; let s = 0; for (let k = 0; k <= a; k++) s += L[a][k] * w[k]; base[i] = s; }
                const u = funciones[a].enValor ? this._igualarPorGrupos(Float64Array.from(base, z => funciones[a].transformar(z)), codigos) : base;
                for (let i = 0; i < n; i++) X[a][i] = funciones[a].valor(i, u[i]);
            }
            for (let a = 0; a < m; a++) {
                let s = 0; for (let i = 0; i < n; i++) s += X[a][i];
                medias[a] = s / n;
                let v = 0; for (let i = 0; i < n; i++) v += (X[a][i] - medias[a]) ** 2;
                des[a] = Math.sqrt(v / n) || 1e-9;
            }
            const C = Array.from({ length: m }, () => new Float64Array(m));
            let maxError = 0;
            for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) {
                let s = 0; for (let i = 0; i < n; i++) s += (X[a][i] - medias[a]) * (X[b][i] - medias[b]);
                C[a][b] = C[b][a] = s / n / (des[a] * des[b]);
                maxError = Math.max(maxError, Math.abs(R[a][b] - C[a][b]));
            }
            if (maxError < mejor.error) { mejor.error = maxError; mejor.L = L; mejor.Rt = Rt; mejor.C = C; sinMejora = 0; }
            else if (++sinMejora >= 4) break;
            if (maxError < 5e-4) break;
            // Paso completo al principio; amortiguado después, porque con valores
            // redondeados (edad entera, Likert) la Pearson muestral responde a
            // saltos y el paso completo oscila alrededor del objetivo.
            const paso = it < 2 ? 1 : 0.6;
            const Rn = Rt.map(f => f.slice());
            for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) {
                Rn[a][b] = Rn[b][a] = Math.max(-0.995, Math.min(0.995, Rt[a][b] + paso * (R[a][b] - C[a][b])));
            }
            // Si la candidata deja de ser definida positiva, la combinación
            // pedida no es alcanzable con estas formas: se proyecta a la válida
            // más cercana y el punto fijo se queda en la mejor aproximación.
            if (this._esDefinidaPositiva(Rn)) Rt = Rn; else { Rt = this._matrizValidaMasCercana(Rn); proyectada = true; }
            L = this.descomposicionCholesky(Rt);
        }
        this.correlRIntermedia = mejor.Rt;
        // Constancia para el panel de diagnóstico: si no convergió, alguna r
        // pedida no es alcanzable con las formas/recortes/grupos configurados.
        // Las parejas ya marcadas como limitadas reciben el valor MEDIDO como
        // «alcanzable» (más fiel que la cota de forma cerrada: el recorte
        // Likert también cuenta).
        // «Convergió» a efectos del aviso: error máximo < 0.01 (por debajo de la
        // tolerancia del informe, 0.03, y del efecto del redondeo a enteros).
        this.diagnosticoCorrelaciones.calibracion = { convergio: mejor.error < 0.01, error: mejor.error, iteraciones, proyectada };
        if (mejor.C) {
            const indice = {};
            this.correlVariables.forEach((v, i) => { indice[v.nombre] = i; });
            (this.diagnosticoCorrelaciones.limitadas || []).forEach(l => {
                const a = indice[l.a], b = indice[l.b];
                if (a !== undefined && b !== undefined) l.alcanzable = mejor.C[a][b];
            });
        }
        return mejor.L;
    }
    _driversDeFila(fila) {
        const drivers = {};
        this.correlVariables.forEach((v, i) => { drivers[v.tipo + ':' + v.clave] = fila[i]; });
        return drivers;
    }
    generarVectorCorrelacionado() {
        const m = this.correlVariables.length;
        const z = [];
        for (let i = 0; i < m; i++) z.push(this.generarNormalEstandar());

        const drivers = {};
        for (let i = 0; i < m; i++) {
            let y = 0;
            for (let k = 0; k <= i; k++) y += this.correlL[i][k] * z[k];
            drivers[this.correlVariables[i].tipo + ':' + this.correlVariables[i].clave] = y;
        }
        return drivers;
    }

    // ========================================
    // EXPORTACIÓN A CSV
    // ========================================

    // Exporta la base como CSV. sep=',' → internacional (decimales con punto).
    // sep=';' → Excel en español (decimales con COMA, abre en columnas directo).
    exportarCSV(sep = ',') {
        if (!this.datosGenerados || this.datosGenerados.length === 0) {
            throw new Error('No hay datos generados para exportar');
        }

        const encabezados = Object.keys(this.datosGenerados[0]);
        const escapar = (valor) => {
            let v = valor;
            // Valor perdido → celda vacía. Va ANTES del formato español: NaN no
            // es entero y se convertía en el texto «NaN» con separador «;».
            if (typeof v === 'number' && !isFinite(v)) v = '';
            // En formato español, los números decimales van con coma (3,14).
            if (sep === ';' && typeof v === 'number' && !Number.isInteger(v)) {
                v = String(v).replace('.', ',');
            }
            v = String(v ?? '');
            // Escapar si contiene el separador, comillas o saltos de línea.
            if (v.includes(sep) || v.includes('"') || v.includes('\n')) {
                v = `"${v.replace(/"/g, '""')}"`;
            }
            return v;
        };

        let csv = encabezados.map(escapar).join(sep) + '\n';
        this.datosGenerados.forEach(fila => {
            csv += encabezados.map(h => escapar(fila[h])).join(sep) + '\n';
        });

        return csv;
    }

    descargarCSV(nombreArchivo = 'base_datos_simulada.csv', sep = ',') {
        const csv = this.exportarCSV(sep);
        // BOM UTF-8: sin él, Excel muestra caracteres rotos en tildes/eñes.
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', nombreArchivo);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    }

    // ========================================
    // UTILIDADES
    // ========================================

    obtenerDatosGenerados() {
        return this.datosGenerados;
    }

    obtenerConfiguracion() {
        return this.configuracion;
    }

    limpiarDatos() {
        this.datosGenerados = null;
        this.configuracion = {
            tamanoMuestra: 100,
            semilla: null,
            pruebas: [],
            sociodemograficos: []
        };
    }

    // ========================================
    // VALIDACIONES
    // ========================================

    validarConfiguracion() {
        const errores = [];
        const advertencias = [];

        // Validar tamaño muestral
        if (this.configuracion.tamanoMuestra < 30) {
            advertencias.push('Tamaño muestral < 30: Los análisis estadísticos pueden tener bajo poder');
        }

        if (this.configuracion.tamanoMuestra > 10000) {
            advertencias.push('Tamaño muestral muy grande: Puede ser poco realista');
        }

        // Ya no se exige una fila «General»: el puntaje general de cada test se
        // deriva automáticamente como PROMEDIO de sus dimensiones.

        // Validar pruebas
        this.configuracion.pruebas.forEach(prueba => {
            // Validar que la media sea positiva
            if (prueba.media < 0) {
                errores.push(`Escala "${prueba.nombre}": La media no puede ser negativa`);
            }

            // FACTIBILIDAD DEL TOTAL (debe coincidir con las pistas en vivo):
            //  · La MEDIA solo puede caer en [k·Mín, k·Máx] (rango de la suma).
            //  · La DE máxima depende de la MEDIA: margen al tope más cercano / 3
            //    (para que quepan ±3 DE sin recortar la campana).
            if (prueba.minimo !== null && prueba.maximo !== null) {
                const k = prueba.numItems;
                const totalMin = k * prueba.minimo;
                const totalMax = k * prueba.maximo;
                const de = prueba.desviacion;

                if (prueba.media < totalMin || prueba.media > totalMax) {
                    // Imposible: la media cae fuera del rango que puede tomar la suma.
                    errores.push(
                        `Escala "${prueba.nombre}": la Media ${prueba.media} es IMPOSIBLE. ` +
                        `Con ${k} ítems de ${prueba.minimo} a ${prueba.maximo} el total solo puede ir de ${totalMin} a ${totalMax}. ` +
                        `Usa una Media dentro de ese rango (cerca del centro es lo más seguro), o cambia el Mín/Máx por ítem.`
                    );
                } else {
                    // La DE máxima la fija la distancia de la Media al tope más cercano.
                    const deMax = ReglasCoherencia.deMaxima(prueba.media, totalMin, totalMax);
                    // Mínimo anti-escalera: SOLO aplica si se busca distribución
                    // normal; con Uniforme/Asimétrica la "escalera" es irrelevante
                    // porque de todos modos no se busca pasar normalidad.
                    const buscaNormal = prueba.distribucion === 'normal';
                    const N = this.configuracion.tamanoMuestra;
                    const deSuave = buscaNormal ? ReglasCoherencia.deMinimaNormal(N) : 0;
                    const centro = Math.round((totalMin + totalMax) / 2);

                    if (de > deMax) {
                        advertencias.push(
                            `Escala "${prueba.nombre}": la DE ${de} es demasiado grande para una Media de ${prueba.media} ` +
                            `(máximo ≈ ${(Math.floor(deMax * 100) / 100)}). El total se recortará contra el tope más cercano, ` +
                            `la DE real bajará y la forma de la distribución se distorsionará. ` +
                            `Reduce la DE, acerca la Media al centro (~${centro}) o amplía el Mín/Máx por ítem.`
                        );
                    } else if (buscaNormal && deSuave > deMax) {
                        advertencias.push(
                            `Escala "${prueba.nombre}": con N=${N}, el rango por ítem [${prueba.minimo}, ${prueba.maximo}] es demasiado estrecho ` +
                            `para un total normal (haría falta DE ≈ ${deSuave}, pero el máximo con esta Media es ${(Math.floor(deMax * 100) / 100)}). ` +
                            `Amplía el Máx por ítem o reduce N.`
                        );
                    } else if (buscaNormal && de < deSuave) {
                        advertencias.push(
                            `Escala "${prueba.nombre}": la DE ${de} es muy pequeña para N=${N}; el total entero saldrá "escalonado" ` +
                            `y probablemente NO pasará la prueba de normalidad. Usa una DE de al menos ≈ ${deSuave}.`
                        );
                    }
                }
            }
        });

        // Validar sociodemográficos
        this.configuracion.sociodemograficos.forEach(socio => {
            // Validar desviación razonable
            if (socio.desviacion > Math.abs(socio.promedio) * 2) {
                advertencias.push(
                    `Variable "${socio.categoria}": Desviación estándar muy alta (${socio.desviacion}) comparada con la media (${socio.promedio})`
                );
            }
            
            // Validar coherencia de límites con la media
            if (socio.minimo !== null && socio.maximo !== null) {
                if (socio.promedio < socio.minimo || socio.promedio > socio.maximo) {
                    advertencias.push(
                        `Variable "${socio.categoria}": La media (${socio.promedio}) está fuera del rango [${socio.minimo}, ${socio.maximo}]`
                    );
                }
                
                // Validar que el rango sea razonable para la desviación
                const rango = socio.maximo - socio.minimo;
                if (socio.desviacion > rango / 2) {
                    advertencias.push(
                        `Variable "${socio.categoria}": La desviación estándar (${socio.desviacion}) es muy alta para el rango [${socio.minimo}, ${socio.maximo}]`
                    );
                }
            }
        });

        return { errores, advertencias };
    }

    // ========================================
    // ESTADÍSTICAS DESCRIPTIVAS RÁPIDAS
    // ========================================

    calcularEstadisticas(columna) {
        if (!this.datosGenerados) return null;

        const valores = this.datosGenerados
            .map(fila => fila[columna])
            .filter(v => v !== null && v !== undefined && !isNaN(v));

        if (valores.length === 0) return null;

        valores.sort((a, b) => a - b);

        const n = valores.length;
        const suma = valores.reduce((a, b) => a + b, 0);
        const media = suma / n;
        
        const varianza = valores
            .map(v => Math.pow(v - media, 2))
            .reduce((a, b) => a + b, 0) / n;
        
        const desviacion = Math.sqrt(varianza);
        
        const min = valores[0];
        const max = valores[n - 1];
        
        const mediana = n % 2 === 0
            ? (valores[n / 2 - 1] + valores[n / 2]) / 2
            : valores[Math.floor(n / 2)];

        return {
            n: n,
            media: media,
            desviacion: desviacion,
            min: min,
            max: max,
            mediana: mediana
        };
    }
}

// ========================================
// INSTANCIA GLOBAL
// ========================================
const generadorDatos = new GeneradorDatos();
