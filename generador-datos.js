// ========================================
// GENERADOR DE BASE DE DATOS SIMULADA
// ========================================

// Tope superior del tamaño muestral para evitar congelar el navegador.
const TAMANO_MUESTRAL_MAXIMO = 100000;

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

        // Pruebas aplicadas (cada fila es una ESCALA; se agrupan por prueba)
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

    recolectarPruebas() {
        const pruebas = [];
        const nombresCortosUsados = new Set();
        const filas = document.querySelectorAll('#bodyPruebas .fila-prueba');

        filas.forEach((fila, index) => {
            const inputs = fila.querySelectorAll('input');
            const selectTipo = fila.querySelector('[aria-label="Tipo de escala"]');
            const selectDist = fila.querySelector('[aria-label="Distribución"]');
            const tipo = selectTipo ? selectTipo.value : 'dimension';
            const esGeneral = tipo === 'general';
            const distribucion = selectDist ? selectDist.value : 'normal';
            const prueba = inputs[0].value.trim();      // test al que pertenece la escala
            const nombre = inputs[1].value.trim();      // nombre de la ESCALA (cada fila = una escala)
            // Escala general: es UNA sola columna de datos → no lleva N° de ítems ni α
            const numItems = esGeneral ? 1 : parseInt(inputs[2].value);
            const media = parseFloat(inputs[3].value);
            const desviacion = parseFloat(inputs[4].value);
            const minimo = parseFloat(inputs[5].value);
            const maximo = parseFloat(inputs[6].value);
            const alfa = esGeneral ? NaN : (inputs[7] ? parseFloat(inputs[7].value) : NaN);

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
            mapa[this.columnaDeEscala(e)] = e.nombre;
            mapa[`PC_${e.nombreCorto}`] = `Percentil — ${e.nombre}`;
        });
        (this.configuracion && this.configuracion.gruposPruebas || []).forEach(g => {
            if (!g.tieneGeneral && g.escalas.length >= 2) {
                mapa[`General_${g.sigla}`] = `Puntaje general — ${g.nombre}`;
                mapa[`PC_${g.sigla}`] = `Percentil — ${g.nombre}`;
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
        const generales = new Set();
        escalas.forEach(e => {
            if (!e.prueba) return;
            if (e.tipo === 'general') {
                generales.add(e.prueba);
                return; // la general no entra en la suma de dimensiones
            }
            if (!porNombre.has(e.prueba)) porNombre.set(e.prueba, []);
            porNombre.get(e.prueba).push(e.nombreCorto);
        });
        const grupos = [];
        porNombre.forEach((siglasEscalas, nombrePrueba) => {
            grupos.push({
                nombre: nombrePrueba,
                sigla: this.generarNombreCortoUnico(nombrePrueba, usados),
                escalas: siglasEscalas,
                tieneGeneral: generales.has(nombrePrueba)
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

        // Preparar correlaciones objetivo (si las hay)
        const hayCorrelaciones = (this.configuracion.correlaciones || []).length > 0;
        if (hayCorrelaciones) {
            this.prepararCorrelaciones();
        }

        const n = this.configuracion.tamanoMuestra;
        const datos = [];

        // Generar datos para cada participante
        for (let i = 0; i < n; i++) {
            const participante = { ID: i + 1 };

            // Valores normales correlacionados (driver) por variable, si aplica
            const drivers = hayCorrelaciones ? this.generarVectorCorrelacionado() : {};

            // Generar datos sociodemográficos según su distribución
            this.configuracion.sociodemograficos.forEach(socio => {
                const driver = drivers['socio:' + socio.categoriaCorta];
                participante[socio.categoria] = this.generarValorSociodemografico(
                    socio, driver !== undefined ? driver : null
                );
            });

            // Generar datos de cada prueba.
            // ORDEN DE COLUMNAS: primero TODOS los ítems, luego los totales de
            // las DIMENSIONES, y al final los puntajes de las ESCALAS GENERALES
            // (y las sumas automáticas de pruebas sin general).
            const totalesPendientes = [];
            this.configuracion.pruebas.forEach(prueba => {
                const driverEscala = drivers['escala:' + prueba.nombreCorto];
                const puntajes = this.generarPuntajesPrueba(
                    prueba.numItems,
                    prueba.media,
                    prueba.desviacion,
                    prueba.minimo,
                    prueba.maximo,
                    prueba.alfa,
                    driverEscala !== undefined ? driverEscala : null,
                    prueba.distribucion
                );

                // Ítems (la Escala general es una sola columna de datos: no
                // tiene ítems, solo su Total_)
                if (prueba.tipo !== 'general') {
                    puntajes.items.forEach((puntaje, idx) => {
                        const nombreColumna = `${prueba.nombreCorto}${idx + 1}`;
                        participante[nombreColumna] = puntaje;
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

            // Aplicar diferencias por grupo (desplazan la media según el grupo)
            this.aplicarDiferenciasGrupo(participante);

            // Suma automática (pruebas SIN Escala general y con 2+ dimensiones):
            // también va al final, junto a los puntajes generales.
            (this.configuracion.gruposPruebas || []).forEach(grupo => {
                if (grupo.tieneGeneral || grupo.escalas.length < 2) return;
                let suma = 0;
                grupo.escalas.forEach(sigla => { suma += participante[`Dimension_${sigla}`]; });
                participante[`General_${grupo.sigla}`] = Math.round(suma * 100) / 100;
            });

            datos.push(participante);
        }

        // PERCENTILES (post-proceso, OPCIONAL): posición relativa (0-100) de cada
        // persona dentro de la muestra generada, para el puntaje directo de cada
        // escala. Rango medio: PC = (inferiores + 0.5·empates) / N · 100.
        if (this.configuracion.generarPercentiles) {
            const columnasPercentil = [];
        // mismo orden que los totales: primero dimensiones, luego generales
        this.configuracion.pruebas.forEach(e => { if (e.tipo !== 'general') columnasPercentil.push({ sigla: e.nombreCorto, col: this.columnaDeEscala(e) }); });
        this.configuracion.pruebas.forEach(e => { if (e.tipo === 'general') columnasPercentil.push({ sigla: e.nombreCorto, col: this.columnaDeEscala(e) }); });
        (this.configuracion.gruposPruebas || []).forEach(g => {
            if (!g.tieneGeneral && g.escalas.length >= 2) columnasPercentil.push({ sigla: g.sigla, col: `General_${g.sigla}` });
        });
        columnasPercentil.forEach(({ sigla, col }) => {
            const valores = datos.map(d => d[col]).slice().sort((a, b) => a - b);
            const n = valores.length;
            datos.forEach(d => {
                const v = d[col];
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

    generarPuntajesPrueba(numItems, mediaTotal, desviacionTotal, minItem = null, maxItem = null, alfaObjetivo = 0, factor = null, distribucion = 'normal') {
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
        const zForma = this.transformarFormaZ(base, distribucion); // media 0, var 1
        const totalObjetivo = mediaTotal + desviacionTotal * zForma;

        // (2) Estructura inter-ítem para que el α de Cronbach observado se acerque
        // al α objetivo: λ es la carga factorial (Spearman-Brown invertida).
        let lambda = 0;
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
                items[i] = Math.round((totalObjetivo / k + desviacionPorItem * (g[i] - gMedia)) * 100) / 100;
            }
            const total = Math.round(items.reduce((a, b) => a + b, 0) * 100) / 100;
            return { items: items, total: total, factorUtilizado: base };
        }

        // ESCALA LIKERT (rango fijado): el total se acota al rango ALCANZABLE
        // [k·mín, k·máx] (solo afecta a la cola extrema, poco frecuente) y se
        // reparte en ítems ENTEROS dentro de [mín, máx]. El grueso del total
        // conserva la forma normal.
        const totalEntero = Math.round(Math.max(k * minItem, Math.min(k * maxItem, totalObjetivo)));

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
            let v = Math.round(mediaPorItem + dispersionItem * (g[i] - gMedia));
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
                const sigma = 0.6;
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
    generarValorSociodemografico(socio, normalEstandar = null) {
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
        let valor;
        if (dist === 'uniforme') {
            valor = this.generarUniforme(socio.minimo, socio.maximo);
        } else if (dist === 'asimetrica') {
            valor = this.generarAsimetrico(socio.promedio, socio.desviacion, normalEstandar);
        } else {
            valor = this.generarValorNormal(socio.promedio, socio.desviacion, normalEstandar);
        }

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

        (this.configuracion.correlaciones || []).forEach(({ a, b, r }) => {
            const i = indicePorNombre[a];
            const j = indicePorNombre[b];
            if (i === undefined || j === undefined || i === j) return;
            // El TOTAL de cada escala se gobierna directamente por el driver
            // correlacionado (modelo "total autoritativo"), de modo que la
            // correlación OBSERVADA entre totales ≈ la pedida, sin desatenuar y
            // sin depender de α.
            const rFactor = Math.max(-0.99, Math.min(0.99, r));
            R[i][j] = rFactor;
            R[j][i] = rFactor;
        });

        this.correlVariables = variables;
        this.correlL = m > 0 ? this.descomposicionCholesky(R) : [];
    }

    /**
     * Aplica las diferencias por grupo a un participante: desplaza la media de
     * la variable cuantitativa según el grupo al que pertenece. El
     * desplazamiento es d·σ·(código − códigoMedio), de modo que entre dos
     * grupos adyacentes la diferencia estandarizada sea ≈ d (de Cohen). En las
     * escalas el desplazamiento se reparte entre los ítems para mantener la
     * coherencia ítems↔total.
     */
    aplicarDiferenciasGrupo(participante) {
        (this.configuracion.diferenciasGrupo || []).forEach(dif => {
            const agrup = this.configuracion.sociodemograficos.find(s => s.categoria === dif.agrupacion);
            if (!agrup) return;

            const codigo = participante[agrup.categoria];
            let codigoMedio;
            if (agrup.distribucion === 'binaria') {
                codigoMedio = 0.5;
            } else if (agrup.distribucion === 'categorica') {
                codigoMedio = (agrup.minimo + agrup.maximo) / 2;
            } else {
                return; // solo binaria/categórica sirven como agrupación
            }

            const escala = this.configuracion.pruebas.find(p => p.nombre === dif.cuantitativa);
            if (escala) {
                const sigma = escala.desviacion;
                const k = escala.numItems;
                const desplazamientoTotal = dif.d * sigma * (codigo - codigoMedio);
                const modoLikert = (escala.minimo !== null && escala.maximo !== null);

                if (!modoLikert) {
                    // Medida continua: desplazar el total y repartirlo por igual
                    // entre los ítems (2 decimales), sin recorte.
                    const porItem = desplazamientoTotal / k;
                    for (let idx = 0; idx < k; idx++) {
                        const col = escala.nombreCorto + (idx + 1);
                        participante[col] = Math.round((participante[col] + porItem) * 100) / 100;
                    }
                } else {
                    // Likert: desplazamiento del total como unidades enteras
                    // repartidas entre los ítems, respetando el rango.
                    let unidades = Math.round(desplazamientoTotal);
                    const min = escala.minimo;
                    const max = escala.maximo;
                    if (unidades !== 0) {
                        const paso = unidades > 0 ? 1 : -1;
                        let restantes = Math.abs(unidades);
                        let idx = 0;
                        let intentos = 0;
                        const limiteIntentos = k * 4;
                        while (restantes > 0 && intentos < limiteIntentos) {
                            const col = escala.nombreCorto + (idx % k + 1);
                            const nuevo = participante[col] + paso;
                            if (nuevo >= min && nuevo <= max) {
                                participante[col] = nuevo;
                                restantes--;
                            }
                            idx++;
                            intentos++;
                        }
                    }
                }

                let total = 0;
                for (let idx = 0; idx < k; idx++) {
                    total += participante[escala.nombreCorto + (idx + 1)];
                }
                participante[this.columnaDeEscala(escala)] = Math.round(total * 100) / 100;
                return;
            }

            const socio = this.configuracion.sociodemograficos.find(s => s.categoria === dif.cuantitativa);
            if (socio) {
                let v = participante[socio.categoria] + dif.d * socio.desviacion * (codigo - codigoMedio);
                if (socio.minimo !== null && socio.maximo !== null) {
                    v = Math.max(socio.minimo, Math.min(socio.maximo, v));
                }
                const factor = Math.pow(10, socio.decimales);
                participante[socio.categoria] = Math.round(v * factor) / factor;
            }
        });
    }

    // Genera el vector de valores normales correlacionados (uno por variable
    // correlacionable) para un participante: y = L·z con z ~ N(0,1) i.i.d.
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
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
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

        // Toda prueba debe tener exactamente UNA Escala general (tipo "General"):
        // aunque un test no tenga varias dimensiones, siempre tiene un puntaje
        // general, así que la fila General es obligatoria.
        const pruebasNombres = new Set();
        const generalesPorPrueba = new Map();
        (this.configuracion.pruebas || []).forEach(e => {
            if (!e.prueba) return;
            pruebasNombres.add(e.prueba);
            if (e.tipo === 'general') {
                generalesPorPrueba.set(e.prueba, (generalesPorPrueba.get(e.prueba) || 0) + 1);
            }
        });
        pruebasNombres.forEach(nombrePrueba => {
            const cuenta = generalesPorPrueba.get(nombrePrueba) || 0;
            if (cuenta === 0) {
                errores.push(`Prueba "${nombrePrueba}": le falta su Escala general. Agrega una fila con Tipo = "General" ` +
                    `(nombre = la variable que mide el test, con su Mín/Máx, Media y DE).`);
            } else if (cuenta > 1) {
                errores.push(`Prueba "${nombrePrueba}": tiene ${cuenta} Escalas generales; solo puede haber UNA por prueba`);
            }
        });

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
