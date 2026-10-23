// @ts-check
// analizador/estadistica.js — EL ORQUESTADOR del análisis general del Analizador (2026.12.24, fase F6, paso 4): guarda el
// estado (la base cargada y sus columnas, el marco de la investigación y las dimensiones de cada variable) y encadena con él
// los análisis. Los cálculos y su formato viven en analizador/motor/, sin estado ni DOM (datos, marco, descriptivos,
// normalidad, correlación, grupos, contingencia, fiabilidad de las escalas y magnitudes), sobre el núcleo único
// (core/stats/), y la redacción en interpretaciones.js. Hasta la 2026.12.23 este archivo lo hacía todo por su cuenta
// (50 KB y 74 métodos: la carga del CSV, las pruebas y sus formatos, la χ² de independencia, el α de las dimensiones, las
// bandas de interpretación…), la prioridad 4 del análisis externo sobre código repetido. Los métodos de una línea conservan
// la API que usan los demás módulos, las pruebas y la consola (StatSim.api.analizador.AnalizadorEstadistico), y los
// envoltorios de las distribuciones que muchos módulos llaman por su nombre (calcularPValorT, lnGamma…).
import { InterpretacionesEstadisticas } from './interpretaciones.js';
import { lnGamma as lnGammaNucleo, pTBilateral, colaSuperiorF, pChiCuadrado, cuantilNormal } from '../core/stats/numerico.js';
import { shapiroWilk as shapiroWilkNucleo, kolmogorovSmirnov as kolmogorovSmirnovNucleo } from '../core/stats/normalidad.js';
import { paresCompletos } from '../core/stats/correlacion.js';
import { ajustarHolm } from '../core/stats/multiples.js';
import { aNumero } from '../core/data/celdas.js';
import { parsearLineaCSVCon } from '../shared/csv.js';
import { esConstante as serieConstante, valoresNumericos, leerCSV } from './motor/datos.js';
import { marcoInicial, alfaDelMarco, parsearDimensiones, itemsAusentes } from './motor/marco.js';
import { descriptivos, percentil as percentilOrdenado } from './motor/descriptivos.js';
import * as motorNormalidad from './motor/normalidad.js';
import * as motorCorrelacion from './motor/correlacion.js';
import * as motorGrupos from './motor/grupos.js';
import * as motorContingencia from './motor/contingencia.js';
import * as motorFiabilidad from './motor/fiabilidad-escalas.js';
import { magnitudD, magnitudEta2, nivelFiabilidad } from './motor/magnitudes.js';

/** @typedef {Record<string, unknown>} Fila */
/** @typedef {import('./motor/marco.js').MarcoInvestigacion} MarcoInvestigacion */
/** @typedef {import('./motor/marco.js').Dimensiones} Dimensiones */
/** @typedef {import('./motor/correlacion.js').ResultadoCorrelacion} ResultadoCorrelacion */

class AnalizadorEstadisticoProfesional {
    constructor() {
        /** @type {Fila[] | null} la base cargada, una fila por caso */
        this.datos = null;
        /** @type {string[]} las columnas de la base (las claves de su primera fila) */
        this.columnas = [];
        /** @type {Record<string, unknown>} */
        this.resultados = {};
        /** @type {MarcoInvestigacion} el tipo de estudio y el nivel de significación */
        this.configuracionInvestigacion = marcoInicial();
        /** @type {Record<string, Dimensiones>} variable → sus dimensiones con sus ítems */
        this.dimensiones = {};
        /** @type {Map<string, Array<[number, string]>>} (2027.01.01) columna → los códigos de sus categorías, si la base los trae */
        this.codigosDeCategorias = new Map();
    }

    // ========================================
    // MARCO DE LA INVESTIGACIÓN
    // ========================================

    /** @param {Partial<MarcoInvestigacion>} config @returns {true} */
    configurarMarcoInvestigacion(config) {
        this.configuracionInvestigacion = { ...this.configuracionInvestigacion, ...config };
        return true;
    }

    /** El nivel de significación del estudio, validado (0 < α < 1; si no, .05): el de todas las decisiones del Analizador. */
    alfaEstudio() { return alfaDelMarco(this.configuracionInvestigacion); }

    obtenerMarcoInvestigacion() { return this.configuracionInvestigacion; }

    // ========================================
    // DIMENSIONES DE LAS VARIABLES
    // ========================================

    /**
     * Configura las dimensiones de una variable (p. ej., { "Atención": ["W1", "W2"], "Memoria": ["W3", "W4"] }); avisa en la
     * consola de los ítems que no son columnas de la base.
     * @param {string} nombreVariable
     * @param {Dimensiones} dimensiones
     * @returns {true}
     */
    configurarDimensiones(nombreVariable, dimensiones) {
        if (!nombreVariable || typeof dimensiones !== 'object') {
            throw new Error('Configuración de dimensiones inválida');
        }
        const ausentes = itemsAusentes(dimensiones, this.columnas);
        if (ausentes.length > 0) {
            console.warn(`Ítems no encontrados en los datos: ${ausentes.join(', ')}`);
        }
        // como propiedad propia: una variable «__proto__» (una columna de un CSV ajeno) no cambia el prototipo del diccionario
        Object.defineProperty(this.dimensiones, nombreVariable, { value: dimensiones, enumerable: true, writable: true, configurable: true });
        return true;
    }

    /** Las dimensiones escritas como «Dimensión1:Ítem1,Ítem2;Dimensión2:Ítem3» (motor/marco.js). @param {string} nombreVariable @param {string} texto */
    parsearDimensionesDesdeString(nombreVariable, texto) { return this.configurarDimensiones(nombreVariable, parsearDimensiones(texto)); }

    /** @param {string} nombreVariable @returns {Dimensiones | null} */
    obtenerDimensiones(nombreVariable) { return (Object.prototype.hasOwnProperty.call(this.dimensiones, nombreVariable) && this.dimensiones[nombreVariable]) || null; }

    obtenerTodasDimensiones() { return this.dimensiones; }

    // ========================================
    // LA BASE DE DATOS
    // ========================================

    /**
     * Carga una base (una fila por caso). Una base nueva invalida las dimensiones y los resultados anteriores: sus ítems
     * podrían no existir en ella.
     * @param {Fila[]} datos
     * @param {{ codigosDeCategorias?: Record<string, Array<[number, string]>> | null }} [opciones] (2027.01.01) los códigos de
     *   las categorías de las columnas que los traen (del Simulador, de un .sav, del libro de Excel del Simulador o de un
     *   proyecto): con ellos, la regresión logística sabe qué categoría de una dependiente binaria es el 1. Sin ellos (un
     *   CSV), lo deduce de los nombres (motor/dependiente-binaria.js)
     * @returns {true}
     */
    cargarDatos(datos, opciones = {}) {
        if (!datos || datos.length === 0) {
            throw new Error('No hay datos para analizar');
        }
        this.datos = datos;
        this.columnas = Object.keys(/** @type {Fila} */ (datos[0]));
        this.dimensiones = {};
        this.resultados = {};
        this.codigosDeCategorias = new Map(Object.entries(opciones.codigosDeCategorias || {}));
        return true;
    }

    /** (2027.01.01) Los códigos de las categorías de una columna, si la base los trae; si no, null. @param {string} columna */
    codigosDe(columna) { return this.codigosDeCategorias.get(columna) || null; }

    /** (2027.01.01) Los de todas las columnas que los traen (para guardarlos en un proyecto). @returns {Record<string, Array<[number, string]>>} */
    todosLosCodigos() { return Object.fromEntries(this.codigosDeCategorias); }

    /** Carga un CSV con encabezados (motor/datos.js: delimitador «;» o «,», celdas numéricas solo si lo son completas). @param {string} csvText */
    cargarDesdeCSV(csvText) { return this.cargarDatos(leerCSV(csvText)); }

    /** @param {string} linea @param {string} delimitador @returns {string[]} */
    parsearLineaCSV(linea, delimitador) { return parsearLineaCSVCon(linea, delimitador); }

    obtenerColumnas() { return this.columnas; }

    obtenerDatos() { return this.datos; }

    obtenerResultados() { return this.resultados; }

    /** Los valores numéricos de una columna, sin perdidos ni textos. @param {string} nombreColumna @returns {number[]} */
    obtenerValoresNumericos(nombreColumna) { return valoresNumericos(this.datos, nombreColumna); }

    /** ¿Todos los valores iguales (varianza cero)? @param {unknown[]} valores */
    esConstante(valores) { return serieConstante(valores); }

    // ========================================
    // REDACCIÓN DEL MARCO METODOLÓGICO (interpretaciones.js, con las dimensiones y el marco de este estado)
    // ========================================

    /** @param {string} var1 @param {string} var2 @param {string} unidadAnalisis @param {string} lugarContexto */
    generarPreguntaInvestigacion(var1, var2, unidadAnalisis, lugarContexto) {
        return InterpretacionesEstadisticas.generarPreguntaInvestigacion(var1, var2, unidadAnalisis, lugarContexto);
    }

    /** @param {string} var1 @param {string} var2 @param {string} unidadAnalisis @param {string} lugarContexto */
    generarObjetivoGeneral(var1, var2, unidadAnalisis, lugarContexto) {
        return InterpretacionesEstadisticas.generarObjetivoGeneral(var1, var2, unidadAnalisis, lugarContexto);
    }

    /** @param {string} var1 @param {string} var2 */
    generarObjetivosEspecificos(var1, var2) {
        return InterpretacionesEstadisticas.generarObjetivosEspecificos(var1, var2, this.obtenerDimensiones(var1), this.obtenerDimensiones(var2));
    }

    /** @param {string} var1 @param {string} var2 @param {string} unidadAnalisis @param {string} lugarContexto */
    generarHipotesis(var1, var2, unidadAnalisis, lugarContexto) {
        return InterpretacionesEstadisticas.generarHipotesis(var1, var2, unidadAnalisis, lugarContexto);
    }

    /** @param {string} var1 @param {string} var2 @param {string} unidadAnalisis @param {string} lugarContexto */
    generarMarcoMetodologico(var1, var2, unidadAnalisis, lugarContexto) {
        return InterpretacionesEstadisticas.generarMarcoMetodologico(var1, var2, unidadAnalisis, lugarContexto, {
            dimensiones1: this.obtenerDimensiones(var1),
            dimensiones2: this.obtenerDimensiones(var2),
            configuracion: this.configuracionInvestigacion
        });
    }

    // ========================================
    // DESCRIPTIVOS Y NORMALIDAD (motor/descriptivos.js, motor/normalidad.js)
    // ========================================

    /** @param {number[]} valores */
    calcularDescriptivas(valores) { return descriptivos(valores); }

    /** Percentil de tipo 7 de una serie ya ordenada (de 0 a 100). @param {number[]} ordenados @param {number} percentil */
    calcularPercentil(ordenados, percentil) { return percentilOrdenado(ordenados, percentil); }

    /** @param {string} nombreColumna */
    pruebaDeNormalidad(nombreColumna) { return motorNormalidad.evaluarNormalidad(this.obtenerValoresNumericos(nombreColumna)); }

    /** Shapiro-Wilk con n < 50 y Kolmogórov-Smirnov (Lilliefors) con n ≥ 50: convención del programa. @param {number[]} valores */
    evaluarNormalidad(valores) { return motorNormalidad.evaluarNormalidad(valores); }

    /** @param {number[]} valores */
    pruebaDeNormalidadArray(valores) { return motorNormalidad.evaluarNormalidad(valores); }

    /** Shapiro-Wilk (Royston, 1992; la de R y SPSS), del núcleo único. @param {number[]} valores */
    shapiroWilk(valores) { return shapiroWilkNucleo(valores); }

    /** Kolmogórov-Smirnov con la corrección de Lilliefors, del núcleo único. @param {number[]} valores */
    kolmogorovSmirnov(valores) { return kolmogorovSmirnovNucleo(valores); }

    /** Cuantil de la normal estándar (AS241, del núcleo único); ±∞ en los bordes. @param {number} p */
    cuantilNormalEstandar(p) { return p <= 0 ? -Infinity : p >= 1 ? Infinity : cuantilNormal(p); }

    // ========================================
    // CORRELACIÓN (motor/correlacion.js)
    // ========================================

    /**
     * La correlación de dos columnas con los casos que tienen las dos (eliminación por casos: un perdido en una sola variable
     * desplazaría todos los pares siguientes) y el α del estudio para la potencia.
     * @param {string} nombreColumna1
     * @param {string} nombreColumna2
     * @param {string} [tipoPrueba]  'bilateral' (por defecto) o 'unilateral'
     * @returns {ResultadoCorrelacion}
     */
    calcularCorrelacion(nombreColumna1, nombreColumna2, tipoPrueba = 'bilateral') {
        const pares = (this.datos || [])
            .map(fila => [aNumero(fila[nombreColumna1]), aNumero(fila[nombreColumna2])])
            .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
        return motorCorrelacion.analizarCorrelacion(pares.map(par => /** @type {number} */ (par[0])), pares.map(par => /** @type {number} */ (par[1])),
            { tipoPrueba, alfa: this.alfaEstudio(), nombreX: nombreColumna1, nombreY: nombreColumna2 });
    }

    /** @param {number[]} x @param {number[]} y */
    calcularRegresionLineal(x, y) { return motorCorrelacion.regresionLineal(x, y); }

    /** @param {number[]} valores1 @param {number[]} valores2 @param {string} [tipoPrueba] */
    correlacionPearson(valores1, valores2, tipoPrueba) { return motorCorrelacion.correlacionPearson(valores1, valores2, tipoPrueba); }

    /** @param {number[]} valores1 @param {number[]} valores2 @param {string} [tipoPrueba] */
    correlacionSpearman(valores1, valores2, tipoPrueba) { return motorCorrelacion.correlacionSpearman(valores1, valores2, tipoPrueba); }

    /** @param {number} r @param {number} n @param {string} [tipoPrueba] */
    calcularPValorPearson(r, n, tipoPrueba) { return motorCorrelacion.pValorCorrelacion(r, n, tipoPrueba); }

    /** @param {number} rho @param {number} n @param {string} [tipoPrueba] */
    calcularPValorSpearman(rho, n, tipoPrueba) { return motorCorrelacion.pValorCorrelacion(rho, n, tipoPrueba); }

    /** @param {number} r @param {number} n @param {unknown} tipoCorrelacion @param {number} [nivel] */
    intervaloConfianzaR(r, n, tipoCorrelacion, nivel = 0.95) { return motorCorrelacion.intervaloCorrelacion(r, n, tipoCorrelacion, nivel); }

    /** @param {number} r @param {number} n @param {number} [alpha] @param {string} [tipoPrueba] */
    calcularPoderEstadistico(r, n, alpha = 0.05, tipoPrueba = 'bilateral') { return motorCorrelacion.potenciaPosteriori(r, n, alpha, tipoPrueba); }

    /** @param {number} r @param {number} p */
    interpretarCorrelacion(r, p) { return motorCorrelacion.interpretarCorrelacion(r, p); }

    // ========================================
    // ENVOLTORIOS DE LAS DISTRIBUCIONES (del núcleo único; muchos módulos los llaman por su nombre)
    // ========================================

    /** P(|T| > t) de una t de Student con `gl` gl. @param {number} t @param {number} gl */
    calcularPValorT(t, gl) { return pTBilateral(t, gl); }

    /** Cola superior de la F; 1 si f ≤ 0. @param {number} f @param {number} df1 @param {number} df2 */
    calcularPValorF(f, df1, df2) { return f <= 0 ? 1 : colaSuperiorF(f, df1, df2); }

    /** Cola superior de la χ²; con 0 gl, la χ² es una masa en 0 (lo inválido sigue dando NaN). @param {number} x @param {number} gl */
    calcularPValorChiCuadrado(x, gl) { return x <= 0 ? 1 : gl === 0 ? (x > 0 ? 0 : NaN) : pChiCuadrado(x, gl); }

    /** ln Γ(x); +∞ con x ≤ 0. @param {number} x */
    lnGamma(x) { return x <= 0 ? Infinity : lnGammaNucleo(x); }

    // ========================================
    // COMPARACIÓN DE GRUPOS (motor/grupos.js, con el α del estudio)
    // ========================================

    /** @param {number[][]} grupos */
    pruebaLevene(grupos) { return motorGrupos.pruebaLevene(grupos); }

    /** @param {number[]} grupo1 @param {number[]} grupo2 */
    pruebaTStudent(grupo1, grupo2) { return motorGrupos.pruebaTStudent(grupo1, grupo2); }

    /** @param {number[]} grupo1 @param {number[]} grupo2 */
    pruebaTWelch(grupo1, grupo2) { return motorGrupos.pruebaTWelch(grupo1, grupo2); }

    /** @param {number[]} grupo1 @param {number[]} grupo2 */
    pruebaMannWhitney(grupo1, grupo2) { return motorGrupos.pruebaMannWhitney(grupo1, grupo2); }

    /** @param {number[]} grupo1 @param {number[]} grupo2 */
    calcularCohenD(grupo1, grupo2) { return motorGrupos.efectoD(grupo1, grupo2); }

    /** @param {number} v */
    interpretarEtaCuadrado(v) { return magnitudEta2(v); }

    /** @param {number} d */
    interpretarCohenD(d) { return magnitudD(d); }

    /** Dos grupos con el protocolo único. @param {number[]} grupo1 @param {number[]} grupo2 @param {string} etiqueta1 @param {string} etiqueta2 */
    compararGrupos(grupo1, grupo2, etiqueta1, etiqueta2) { return motorGrupos.compararDosGrupos(grupo1, grupo2, etiqueta1, etiqueta2, this.alfaEstudio()); }

    /** Holm (del núcleo único), en el orden de entrada; un p no finito cuenta como 1. @param {number[]} pvalores */
    ajustarPValoresHolm(pvalores) { return ajustarHolm(pvalores); }

    /** @param {number[][]} grupos */
    anovaUnaVia(grupos) { return motorGrupos.anovaUnFactor(grupos); }

    /** @param {number[][]} grupos */
    anovaWelch(grupos) { return motorGrupos.anovaWelch(grupos); }

    /** @param {number[][]} grupos */
    kruskalWallis(grupos) { return motorGrupos.kruskalWallis(grupos); }

    /**
     * Pares post-hoc con Holm y el modelo de error de la prueba global: 'mce' (por defecto), 'welch' o 'dunn'.
     * @param {number[][]} grupos
     * @param {string[]} etiquetas
     * @param {import('../core/stats/protocolo-grupos.js').ClavePostHoc} [metodo]
     */
    compararParesPostHoc(grupos, etiquetas, metodo = 'mce') { return motorGrupos.paresPostHoc(grupos, etiquetas, metodo, this.alfaEstudio()); }

    /** Tres o más grupos con el protocolo único. @param {number[][]} grupos @param {string[]} etiquetas */
    compararVariosGrupos(grupos, etiquetas) { return motorGrupos.compararVariosGrupos(grupos, etiquetas, this.alfaEstudio()); }

    // ========================================
    // ASOCIACIÓN DE VARIABLES CATEGÓRICAS (motor/contingencia.js)
    // ========================================

    /** χ² de independencia de dos variables categóricas, con el α del estudio. @param {ArrayLike<unknown>} valores1 @param {ArrayLike<unknown>} valores2 */
    chiCuadradoIndependencia(valores1, valores2) { return motorContingencia.chiCuadradoIndependencia(valores1, valores2, this.alfaEstudio()); }

    // ========================================
    // DIMENSIONES Y FIABILIDAD (motor/fiabilidad-escalas.js)
    // ========================================

    /**
     * La correlación entre cada par de dimensiones de dos variables (con los casos que tienen los dos puntajes).
     * @param {string} variable1
     * @param {string} variable2
     * @param {string} [tipoPrueba]
     */
    calcularCorrelacionPorDimensiones(variable1, variable2, tipoPrueba = 'bilateral') {
        const dimensiones1 = this.obtenerDimensiones(variable1), dimensiones2 = this.obtenerDimensiones(variable2);
        if (!dimensiones1 || !dimensiones2) {
            throw new Error('Ambas variables deben tener dimensiones configuradas');
        }
        /** @type {ReturnType<typeof motorCorrelacion.correlacionEntreDimensiones>[]} */
        const resultados = [];
        Object.entries(dimensiones1).forEach(([dimension1, items1]) => {
            Object.entries(dimensiones2).forEach(([dimension2, items2]) => {
                // (2026.12.18) con la regla del 80 % un puntaje puede faltar: los pares completos
                const pares = paresCompletos(this.calcularPuntajesTotalesDimension(items1), this.calcularPuntajesTotalesDimension(items2));
                resultados.push(motorCorrelacion.correlacionEntreDimensiones(Array.from(pares.x), Array.from(pares.y), tipoPrueba, { dimension1, dimension2, items1, items2 }));
            });
        });
        return resultados;
    }

    /** Puntajes de una dimensión con la regla del 80 %. @param {string[]} items */
    calcularPuntajesTotalesDimension(items) { return motorFiabilidad.puntajesDimension(/** @type {Fila[]} */ (this.datos), items); }

    /** Varianza muestral (n − 1); 0 con menos de 2 valores. @param {number[]} valores */
    varianzaMuestral(valores) { return motorFiabilidad.varianzaMuestral(valores); }

    /** α de Cronbach de unos ítems con los casos completos; null si no se puede calcular. @param {string[]} items */
    calcularAlfaCronbach(items) { return motorFiabilidad.alfaDeItems(this.datos || [], items); }

    /** Bandas de George y Mallery (2003). @param {number} alfa */
    interpretarAlfaCronbach(alfa) { return nivelFiabilidad(alfa); }

    /** α de la escala completa y de cada dimensión; null sin dimensiones configuradas. @param {string} variable */
    calcularFiabilidadVariable(variable) {
        const dimensiones = this.obtenerDimensiones(variable);
        if (!dimensiones) return null;
        return motorFiabilidad.fiabilidadPorDimensiones(this.datos || [], dimensiones);
    }

    // ========================================
    // PRUEBA DE HIPÓTESIS, DISCUSIÓN Y REPORTE
    // ========================================

    /**
     * La decisión sobre H0 y las conclusiones con el α dado o, sin él, el del estudio.
     * @param {{ pValor: number, interpretacion: { direccion: string } }} resultadoCorrelacion
     * @param {number | null} [alpha]
     */
    pruebaHipotesis(resultadoCorrelacion, alpha = null) {
        return motorCorrelacion.pruebaHipotesis(resultadoCorrelacion, alpha === null ? this.alfaEstudio() : alpha);
    }

    /**
     * La discusión del resultado (interpretaciones.js) con la prueba de hipótesis al α del estudio: no se le pasa
     * unidadAnalisis como α, que un texto rompería la comparación p < α.
     * @param {string} var1
     * @param {string} var2
     * @param {ResultadoCorrelacion} resultadoCorrelacion
     * @param {string} unidadAnalisis
     * @param {string} lugarContexto
     */
    generarDiscusion(var1, var2, resultadoCorrelacion, unidadAnalisis, lugarContexto) {
        const prueba = this.pruebaHipotesis(resultadoCorrelacion);
        return InterpretacionesEstadisticas.generarDiscusion(var1, var2, resultadoCorrelacion, prueba, unidadAnalisis, lugarContexto, {
            dimensiones1: this.obtenerDimensiones(var1),
            dimensiones2: this.obtenerDimensiones(var2),
            configuracion: this.configuracionInvestigacion
        });
    }

    /**
     * El reporte completo: marco metodológico, resultados, prueba de hipótesis, discusión y, si las dos variables tienen
     * dimensiones, la correlación entre ellas (si falla, se avisa en la consola y el reporte sigue sin ella).
     * @param {string} var1
     * @param {string} var2
     * @param {ResultadoCorrelacion} resultadoCorrelacion
     * @param {string} unidadAnalisis
     * @param {string} lugarContexto
     */
    generarReporteCompleto(var1, var2, resultadoCorrelacion, unidadAnalisis, lugarContexto) {
        const marco = this.generarMarcoMetodologico(var1, var2, unidadAnalisis, lugarContexto);
        const discusion = this.generarDiscusion(var1, var2, resultadoCorrelacion, unidadAnalisis, lugarContexto);
        /** @type {{ marcoMetodologico: unknown, resultadosEstadisticos: ResultadoCorrelacion, pruebaHipotesis: unknown, discusion: unknown, analisisPorDimensiones?: unknown[] }} */
        const reporte = {
            marcoMetodologico: marco,
            resultadosEstadisticos: resultadoCorrelacion,
            pruebaHipotesis: this.pruebaHipotesis(resultadoCorrelacion),
            discusion
        };
        if (this.obtenerDimensiones(var1) && this.obtenerDimensiones(var2)) {
            try {
                reporte.analisisPorDimensiones = this.calcularCorrelacionPorDimensiones(var1, var2, resultadoCorrelacion.tipoPrueba);
            } catch (error) {
                console.warn('No se pudo realizar análisis por dimensiones:', error);
            }
        }
        return reporte;
    }
}

// La instancia única del Analizador.
const AnalizadorEstadistico = new AnalizadorEstadisticoProfesional();

export { AnalizadorEstadistico, AnalizadorEstadisticoProfesional };
