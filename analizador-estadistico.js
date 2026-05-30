// ========================================
// ANALIZADOR ESTADÍSTICO PROFESIONAL PhD
// Sistema Avanzado de Análisis Correlacional
// ========================================

class AnalizadorEstadisticoProfesional {
    constructor() {
        this.datos = null;
        this.columnas = [];
        this.resultados = {};
        // NUEVO: Configuración del marco de investigación
        this.configuracionInvestigacion = {
            tipoEstudio: 'correlacional', // correlacional, descriptivo, experimental
            nivelSignificancia: 0.05
        };
        // NUEVO: Dimensiones y estructura de las variables
        this.dimensiones = {
            // variable1: { dimension1: [items], dimension2: [items] }
            // variable2: { dimension1: [items], dimension2: [items] }
        };
    }

    // ========================================
    // CONFIGURACIÓN DEL MARCO DE INVESTIGACIÓN
    // ========================================

    configurarMarcoInvestigacion(config) {
        this.configuracionInvestigacion = {
            ...this.configuracionInvestigacion,
            ...config
        };
        return true;
    }

    obtenerMarcoInvestigacion() {
        return this.configuracionInvestigacion;
    }

    // ========================================
    // GESTIÓN DE DIMENSIONES
    // ========================================

    /**
     * Configura las dimensiones de una variable
     * @param {string} nombreVariable - Nombre de la variable principal
     * @param {Object} dimensiones - Objeto con dimensiones y sus ítems
     * Ejemplo: {
     *   "Atención": ["W1", "W2", "W3"],
     *   "Memoria": ["W4", "W5", "W6"]
     * }
     */
    configurarDimensiones(nombreVariable, dimensiones) {
        if (!nombreVariable || typeof dimensiones !== 'object') {
            throw new Error('Configuración de dimensiones inválida');
        }

        // Validar que los ítems existan en las columnas
        const todosLosItems = Object.values(dimensiones).flat();
        const itemsInvalidos = todosLosItems.filter(item => !this.columnas.includes(item));

        if (itemsInvalidos.length > 0) {
            console.warn(`Ítems no encontrados en los datos: ${itemsInvalidos.join(', ')}`);
        }

        this.dimensiones[nombreVariable] = dimensiones;
        return true;
    }

    /**
     * Parsea dimensiones desde formato string
     * Formato: "Dimension1:Item1,Item2,Item3;Dimension2:Item4,Item5"
     */
    parsearDimensionesDesdeString(nombreVariable, dimensionesStr) {
        const dimensionesObj = {};

        // Dividir por dimensiones (separadas por ;)
        const dimensionesSplit = dimensionesStr.split(';').map(d => d.trim()).filter(d => d);

        dimensionesSplit.forEach(dimStr => {
            // Dividir dimensión:items
            const partes = dimStr.split(':');
            if (partes.length !== 2) return;

            const nombreDimension = partes[0].trim();
            const items = partes[1].split(',').map(i => i.trim()).filter(i => i);

            if (nombreDimension && items.length > 0) {
                dimensionesObj[nombreDimension] = items;
            }
        });

        return this.configurarDimensiones(nombreVariable, dimensionesObj);
    }

    obtenerDimensiones(nombreVariable) {
        return this.dimensiones[nombreVariable] || null;
    }

    obtenerTodasDimensiones() {
        return this.dimensiones;
    }

    // ========================================
    // CARGA DE DATOS
    // ========================================

    cargarDatos(datos) {
        if (!datos || datos.length === 0) {
            throw new Error('No hay datos para analizar');
        }

        this.datos = datos;
        this.columnas = Object.keys(datos[0]);
        return true;
    }

    cargarDesdeCSV(csvText) {
        const lineas = csvText.trim().split('\n');
        if (lineas.length < 2) {
            throw new Error('El archivo CSV debe tener al menos encabezados y una fila de datos');
        }

        const delimitador = lineas[0].includes(';') ? ';' : ',';
        const encabezados = lineas[0].split(delimitador).map(h => h.trim());
        const datos = [];

        for (let i = 1; i < lineas.length; i++) {
            const valores = this.parsearLineaCSV(lineas[i], delimitador);
            if (valores.length !== encabezados.length) continue;

            const fila = {};
            encabezados.forEach((encabezado, idx) => {
                const valor = valores[idx].trim();
                const numero = parseFloat(valor);
                // Se almacena como número solo si el valor es realmente numérico;
                // la comprobación se hace sobre el resultado de parseFloat para
                // que coincida con la conversión (un '' o un texto queda como string).
                fila[encabezado] = isNaN(numero) ? valor : numero;
            });
            datos.push(fila);
        }

        if (datos.length === 0) {
            throw new Error('Ninguna fila coincide con el número de columnas del encabezado; revisa el delimitador o el formato del CSV');
        }

        return this.cargarDatos(datos);
    }

    parsearLineaCSV(linea, delimitador) {
        // Respeta los campos entrecomillados para no partir un valor que
        // contenga el delimitador (p. ej. "Lima, Perú").
        const valores = [];
        let dentroComillas = false;
        let actual = '';

        for (let i = 0; i < linea.length; i++) {
            const caracter = linea[i];

            if (caracter === '"') {
                dentroComillas = !dentroComillas;
            } else if (caracter === delimitador && !dentroComillas) {
                valores.push(actual.trim());
                actual = '';
            } else {
                actual += caracter;
            }
        }

        valores.push(actual.trim());
        return valores;
    }

    obtenerColumnas() {
        return this.columnas;
    }


    // ========================================
    // GENERACIÓN DE MARCO METODOLÓGICO
    // ========================================

    /**
     * Genera pregunta de investigación
     */
    generarPreguntaInvestigacion(var1, var2, unidadAnalisis, lugarContexto) {

        if (!unidadAnalisis || !lugarContexto) {
            return `¿Cuál es la relación entre ${var1} y ${var2}?`;
        }

        return `¿Cuál es la relación entre ${var1} y ${var2} en ${unidadAnalisis} de ${lugarContexto}?`;
    }

    /**
     * Genera objetivo general
     */
    generarObjetivoGeneral(var1, var2, unidadAnalisis, lugarContexto) {

        if (!unidadAnalisis || !lugarContexto) {
            return `Determinar la relación entre ${var1} y ${var2}.`;
        }

        return `Determinar la relación entre ${var1} y ${var2} en ${unidadAnalisis} de ${lugarContexto}.`;
    }

    /**
     * Genera objetivos específicos basados en dimensiones
     */
    generarObjetivosEspecificos(var1, var2) {
        const dim1 = this.obtenerDimensiones(var1);
        const dim2 = this.obtenerDimensiones(var2);

        const objetivos = [];

        if (dim1 && dim2) {
            // Ambas tienen dimensiones - objetivos cruzados
            Object.keys(dim1).forEach(d1 => {
                Object.keys(dim2).forEach(d2 => {
                    objetivos.push(
                        `Establecer el vínculo entre '${d1}' de ${var1} y '${d2}' de ${var2}.`
                    );
                });
            });
        } else if (dim1) {
            // Solo var1 tiene dimensiones
            Object.keys(dim1).forEach(d1 => {
                objetivos.push(
                    `Establecer el vínculo entre '${d1}' de ${var1} y ${var2}.`
                );
            });
        } else if (dim2) {
            // Solo var2 tiene dimensiones
            Object.keys(dim2).forEach(d2 => {
                objetivos.push(
                    `Establecer el vínculo entre ${var1} y '${d2}' de ${var2}.`
                );
            });
        } else {
            // Ninguna tiene dimensiones
            objetivos.push(`Establecer el vínculo entre ${var1} y ${var2}.`);
        }

        return objetivos;
    }

    /**
     * Genera hipótesis
     */
    generarHipotesis(var1, var2, unidadAnalisis, lugarContexto) {

        let contexto = '';
        if (unidadAnalisis && lugarContexto) {
            contexto = ` en ${unidadAnalisis} de ${lugarContexto}`;
        }

        return {
            hipotesisInvestigador: `Existe una relación estadísticamente significativa entre ${var1} y ${var2}${contexto}.`,
            hipotesisNula: `No existe una relación estadísticamente significativa entre ${var1} y ${var2}${contexto}.`,
            hipotesisAlterna: `Sí existe una relación estadísticamente significativa entre ${var1} y ${var2}${contexto}.`
        };
    }

    /**
     * Genera marco metodológico completo
     */
    generarMarcoMetodologico(var1, var2, unidadAnalisis, lugarContexto) {

        return {
            preguntaInvestigacion: this.generarPreguntaInvestigacion(var1, var2, unidadAnalisis, lugarContexto),
            objetivoGeneral: this.generarObjetivoGeneral(var1, var2, unidadAnalisis, lugarContexto),
            objetivosEspecificos: this.generarObjetivosEspecificos(var1, var2, unidadAnalisis, lugarContexto),
            hipotesis: this.generarHipotesis(var1, var2, unidadAnalisis, lugarContexto),
            configuracion: this.configuracionInvestigacion
        };
    }

    // ========================================
    // ESTADÍSTICAS DESCRIPTIVAS
    // ========================================

    calcularDescriptivas(valores) {
        if (valores.length === 0) {
            throw new Error('No hay valores numéricos para calcular las estadísticas descriptivas');
        }

        const n = valores.length;
        const suma = valores.reduce((a, b) => a + b, 0);
        const media = suma / n;

        // Varianza y desviación estándar
        const varianza = valores
            .map(v => Math.pow(v - media, 2))
            .reduce((a, b) => a + b, 0) / (n - 1);

        const desviacion = Math.sqrt(varianza);
        const errorEstandar = desviacion / Math.sqrt(n);

        // Ordenar para percentiles
        const ordenados = [...valores].sort((a, b) => a - b);
        const min = ordenados[0];
        const max = ordenados[n - 1];

        // Mediana
        const mediana = n % 2 === 0
            ? (ordenados[n / 2 - 1] + ordenados[n / 2]) / 2
            : ordenados[Math.floor(n / 2)];

        // Cuartiles
        const q1 = this.calcularPercentil(ordenados, 25);
        const q3 = this.calcularPercentil(ordenados, 75);

        // Asimetría
        const asimetria = this.calcularAsimetria(valores, media, desviacion, n);

        // Curtosis
        const curtosis = this.calcularCurtosis(valores, media, desviacion, n);

        return {
            n: n,
            media: media,
            desviacion: desviacion,
            varianza: varianza,
            errorEstandar: errorEstandar,
            min: min,
            max: max,
            rango: max - min,
            mediana: mediana,
            q1: q1,
            q3: q3,
            iqr: q3 - q1,
            asimetria: asimetria,
            curtosis: curtosis
        };
    }

    calcularPercentil(ordenados, percentil) {
        const index = (percentil / 100) * (ordenados.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index % 1;

        if (lower === upper) {
            return ordenados[lower];
        }

        return ordenados[lower] * (1 - weight) + ordenados[upper] * weight;
    }

    calcularAsimetria(valores, media, desviacion, n) {
        if (desviacion === 0) return 0;

        const suma = valores
            .map(v => Math.pow((v - media) / desviacion, 3))
            .reduce((a, b) => a + b, 0);

        return (n / ((n - 1) * (n - 2))) * suma;
    }

    calcularCurtosis(valores, media, desviacion, n) {
        if (desviacion === 0) return 0;

        const suma = valores
            .map(v => Math.pow((v - media) / desviacion, 4))
            .reduce((a, b) => a + b, 0);

        const kurtosis = (n * (n + 1) / ((n - 1) * (n - 2) * (n - 3))) * suma;
        const ajuste = (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));

        return kurtosis - ajuste;
    }

    // ========================================
    // PRUEBAS DE NORMALIDAD
    // ========================================

    pruebaDeNormalidad(nombreColumna) {
        const valores = this.obtenerValoresNumericos(nombreColumna);
        return this.evaluarNormalidad(valores);
    }

    // Evalúa el supuesto de normalidad sobre un arreglo de valores numéricos.
    // Selección de prueba según N (Shapiro-Wilk si n < 50, Kolmogorov-Smirnov
    // si n ≥ 50): convención intencional, no modificar.
    evaluarNormalidad(valores) {
        const n = valores.length;

        if (n < 3) {
            throw new Error('Se necesitan al menos 3 observaciones para la prueba de normalidad');
        }

        let resultado;
        if (n < 50) {
            resultado = this.shapiroWilk(valores);
            resultado.prueba = 'Shapiro-Wilk';
            resultado.razon = 'n < 50';
        } else {
            resultado = this.kolmogorovSmirnov(valores);
            resultado.prueba = 'Kolmogorov-Smirnov';
            resultado.razon = 'n ≥ 50';
        }

        resultado.n = n;
        resultado.normal = resultado.pValor > 0.05;
        resultado.decision = resultado.pValor > 0.05
            ? 'Los datos siguen una distribución normal (p > 0.05)'
            : 'Los datos NO siguen una distribución normal (p ≤ 0.05)';

        return resultado;
    }

    shapiroWilk(valores) {
        const n = valores.length;
        const ordenados = [...valores].sort((a, b) => a - b);

        const descriptivas = this.calcularDescriptivas(valores);
        const media = descriptivas.media;
        const desviacion = descriptivas.desviacion;

        const estandarizados = ordenados.map(v => (v - media) / desviacion);

        let numerador = 0;
        for (let i = 0; i < Math.floor(n / 2); i++) {
            const peso = this.obtenerPesoShapiro(n, i + 1);
            numerador += peso * (estandarizados[n - 1 - i] - estandarizados[i]);
        }

        const denominador = estandarizados
            .map(v => v * v)
            .reduce((a, b) => a + b, 0);

        const W = (numerador * numerador) / denominador;
        const pValor = this.estimarPValorShapiro(W, n);

        return {
            estadistico: W,
            pValor: pValor
        };
    }

    obtenerPesoShapiro(n, i) {
        return 1 / Math.sqrt(n);
    }

    estimarPValorShapiro(W, n) {
        const mu = -1.5861 - 0.31082 * Math.log(n) - 0.083751 * Math.log(n) * Math.log(n);
        const sigma = Math.exp(-0.4803 - 0.082676 * Math.log(n) + 0.0030302 * Math.log(n) * Math.log(n));

        const z = (Math.log(1 - W) - mu) / sigma;
        const p = 1 - this.distribucionNormalAcumulada(z);

        return Math.max(0.001, Math.min(0.999, p));
    }

    kolmogorovSmirnov(valores) {
        const n = valores.length;
        const ordenados = [...valores].sort((a, b) => a - b);

        const descriptivas = this.calcularDescriptivas(valores);
        const media = descriptivas.media;
        const desviacion = descriptivas.desviacion;

        let D = 0;
        for (let i = 0; i < n; i++) {
            const z = (ordenados[i] - media) / desviacion;
            const Fn = (i + 1) / n;
            const Fz = this.distribucionNormalAcumulada(z);

            const D1 = Math.abs(Fn - Fz);
            const D2 = Math.abs(Fz - i / n);

            D = Math.max(D, D1, D2);
        }

        const pValor = this.estimarPValorKS(D, n);

        return {
            estadistico: D,
            pValor: pValor
        };
    }

    estimarPValorKS(D, n) {
        const lambda = (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n)) * D;

        let suma = 0;
        for (let k = 1; k <= 10; k++) {
            suma += Math.pow(-1, k - 1) * Math.exp(-2 * k * k * lambda * lambda);
        }

        const p = 2 * suma;
        return Math.max(0.001, Math.min(0.999, p));
    }

    distribucionNormalAcumulada(z) {
        const t = 1 / (1 + 0.2316419 * Math.abs(z));
        const d = 0.3989423 * Math.exp(-z * z / 2);
        const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

        return z > 0 ? 1 - p : p;
    }

    // ========================================
    // ANÁLISIS DE CORRELACIÓN
    // ========================================

    calcularCorrelacion(nombreColumna1, nombreColumna2, tipoPrueba = 'bilateral') {
        // Eliminación por casos: conservar solo las filas con valor numérico en
        // AMBAS columnas, para no desalinear los pares (un NaN en una sola
        // variable desplazaría todos los pares siguientes).
        const pares = (this.datos || [])
            .map(fila => [parseFloat(fila[nombreColumna1]), parseFloat(fila[nombreColumna2])])
            .filter(([a, b]) => isFinite(a) && isFinite(b));

        if (pares.length < 3) {
            throw new Error('Se necesitan al menos 3 pares de valores válidos');
        }

        const valores1 = pares.map(par => par[0]);
        const valores2 = pares.map(par => par[1]);

        // Una variable sin variabilidad (todos sus valores iguales) hace que la
        // desviación sea 0 y el coeficiente quede indefinido (NaN). Se avisa con
        // un mensaje claro en lugar de mostrar "NaN".
        if (this.esConstante(valores1) || this.esConstante(valores2)) {
            const nombreConstante = this.esConstante(valores1) ? nombreColumna1 : nombreColumna2;
            throw new Error(`La variable "${nombreConstante}" no tiene variabilidad (todos sus valores son iguales); no es posible calcular la correlación.`);
        }

        const normalidad1 = this.evaluarNormalidad(valores1);
        const normalidad2 = this.evaluarNormalidad(valores2);

        let resultado = {};

        if (normalidad1.normal && normalidad2.normal) {
            resultado = this.correlacionPearson(valores1, valores2, tipoPrueba);
            resultado.tipoCorrelacion = 'Pearson';
        } else {
            resultado = this.correlacionSpearman(valores1, valores2, tipoPrueba);
            resultado.tipoCorrelacion = 'Spearman (Rho)';
        }

        resultado.normalidad1 = normalidad1;
        resultado.normalidad2 = normalidad2;
        resultado.interpretacion = this.interpretarCorrelacion(resultado.coeficiente, resultado.pValor);
        resultado.tipoPrueba = tipoPrueba;

        return resultado;
    }

    correlacionPearson(valores1, valores2, tipoPrueba) {
        const n = valores1.length;

        const desc1 = this.calcularDescriptivas(valores1);
        const desc2 = this.calcularDescriptivas(valores2);

        let covarianza = 0;
        for (let i = 0; i < n; i++) {
            covarianza += (valores1[i] - desc1.media) * (valores2[i] - desc2.media);
        }
        covarianza /= (n - 1);

        const r = covarianza / (desc1.desviacion * desc2.desviacion);
        const pValor = this.calcularPValorPearson(r, n, tipoPrueba);

        return {
            coeficiente: r,
            pValor: pValor,
            n: n
        };
    }

    correlacionSpearman(valores1, valores2, tipoPrueba) {
        const n = valores1.length;

        const rangos1 = this.convertirARangos(valores1);
        const rangos2 = this.convertirARangos(valores2);

        const resultadoPearson = this.correlacionPearson(rangos1, rangos2, tipoPrueba);

        return {
            coeficiente: resultadoPearson.coeficiente,
            pValor: this.calcularPValorSpearman(resultadoPearson.coeficiente, n, tipoPrueba),
            n: n
        };
    }

    convertirARangos(valores) {
        const n = valores.length;
        const pares = valores.map((valor, idx) => ({ valor, idx }));

        pares.sort((a, b) => a.valor - b.valor);

        const rangos = new Array(n);
        for (let i = 0; i < n; i++) {
            rangos[pares[i].idx] = i + 1;
        }

        let i = 0;
        while (i < pares.length) {
            let j = i;
            while (j < pares.length && pares[j].valor === pares[i].valor) {
                j++;
            }

            if (j - i > 1) {
                const rangoPromedio = ((i + 1) + j) / 2;
                for (let k = i; k < j; k++) {
                    rangos[pares[k].idx] = rangoPromedio;
                }
            }

            i = j;
        }

        return rangos;
    }

    calcularPValorPearson(r, n, tipoPrueba) {
        const t = r * Math.sqrt((n - 2) / (1 - r * r));
        const gl = n - 2;

        let pValor = this.calcularPValorT(Math.abs(t), gl);

        if (tipoPrueba === 'bilateral') {
            pValor = pValor * 2;
        }

        return Math.min(1, pValor);
    }

    calcularPValorSpearman(rho, n, tipoPrueba) {
        if (n > 10) {
            const z = rho * Math.sqrt(n - 1);
            let pValor = 1 - this.distribucionNormalAcumulada(Math.abs(z));

            if (tipoPrueba === 'bilateral') {
                pValor = pValor * 2;
            }

            return Math.min(1, pValor);
        } else {
            return this.calcularPValorPearson(rho, n, tipoPrueba);
        }
    }

    calcularPValorT(t, gl) {
        const x = gl / (gl + t * t);
        const a = gl / 2;
        const b = 0.5;

        const betaInc = this.betaIncompleta(x, a, b);

        return betaInc;
    }

    betaIncompleta(x, a, b) {
        if (x <= 0) return 0;
        if (x >= 1) return 1;

        const lnBeta = this.lnGamma(a) + this.lnGamma(b) - this.lnGamma(a + b);
        const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

        let suma = 1.0;
        let termino = 1.0;

        for (let i = 0; i < 100; i++) {
            termino *= (a + i) / (a + b + i) * x;
            suma += termino / (a + i + 1);
            if (Math.abs(termino) < 1e-10) break;
        }

        return front * suma;
    }

    lnGamma(x) {
        if (x <= 0) return Infinity;

        const cof = [76.18009172947146, -86.50532032941677,
            24.01409824083091, -1.231739572450155,
            0.001208650973866179, -0.000005395239384953];

        let ser = 1.000000000190015;
        let tmp = x + 5.5;
        tmp -= (x + 0.5) * Math.log(tmp);

        for (let j = 0; j < 6; j++) {
            ser += cof[j] / (x + j + 1);
        }

        return -tmp + Math.log(2.5066282746310005 * ser / x);
    }

    interpretarCorrelacion(r, p) {
        let fuerza, direccion, significancia;

        direccion = r >= 0 ? 'positiva' : 'negativa';

        const absR = Math.abs(r);
        if (absR < 0.1) {
            fuerza = 'nula o muy débil';
        } else if (absR < 0.3) {
            fuerza = 'débil';
        } else if (absR < 0.5) {
            fuerza = 'moderada';
        } else if (absR < 0.7) {
            fuerza = 'moderada-fuerte';
        } else if (absR < 0.9) {
            fuerza = 'fuerte';
        } else {
            fuerza = 'muy fuerte';
        }

        if (p < 0.001) {
            significancia = 'altamente significativa (p < .001)';
        } else if (p < 0.01) {
            significancia = 'muy significativa (p < .01)';
        } else if (p < 0.05) {
            significancia = 'significativa (p < .05)';
        } else {
            significancia = 'no significativa (p ≥ .05)';
        }

        return {
            fuerza: fuerza,
            direccion: direccion,
            significancia: significancia,
            texto: `Correlación ${fuerza} ${direccion} ${significancia}`
        };
    }

    // ========================================
    // ANÁLISIS POR DIMENSIONES
    // ========================================

    /**
     * Calcula la correlación entre dimensiones específicas de dos variables
     */
    calcularCorrelacionPorDimensiones(variable1, variable2, tipoPrueba = 'bilateral') {
        const dimensiones1 = this.obtenerDimensiones(variable1);
        const dimensiones2 = this.obtenerDimensiones(variable2);

        if (!dimensiones1 || !dimensiones2) {
            throw new Error('Ambas variables deben tener dimensiones configuradas');
        }

        const resultados = [];

        Object.entries(dimensiones1).forEach(([nombreDim1, items1]) => {
            Object.entries(dimensiones2).forEach(([nombreDim2, items2]) => {
                // Calcular puntaje total para cada dimensión
                const puntajesDim1 = this.calcularPuntajesTotalesDimension(items1);
                const puntajesDim2 = this.calcularPuntajesTotalesDimension(items2);

                // Determinar tipo de correlación basado en normalidad
                const normalidad1 = this.pruebaDeNormalidadArray(puntajesDim1);
                const normalidad2 = this.pruebaDeNormalidadArray(puntajesDim2);

                let resultado;
                if (normalidad1.normal && normalidad2.normal) {
                    resultado = this.correlacionPearson(puntajesDim1, puntajesDim2, tipoPrueba);
                    resultado.tipoCorrelacion = 'Pearson';
                } else {
                    resultado = this.correlacionSpearman(puntajesDim1, puntajesDim2, tipoPrueba);
                    resultado.tipoCorrelacion = 'Spearman (Rho)';
                }

                resultado.dimension1 = nombreDim1;
                resultado.dimension2 = nombreDim2;
                resultado.items1 = items1;
                resultado.items2 = items2;
                resultado.normalidad1 = normalidad1;
                resultado.normalidad2 = normalidad2;
                resultado.interpretacion = this.interpretarCorrelacion(resultado.coeficiente, resultado.pValor);

                resultados.push(resultado);
            });
        });

        return resultados;
    }

    /**
     * Calcula puntajes totales para una dimensión sumando los ítems
     */
    calcularPuntajesTotalesDimension(items) {
        return this.datos.map(fila => {
            return items.reduce((suma, item) => {
                const valor = parseFloat(fila[item]);
                return suma + (isNaN(valor) ? 0 : valor);
            }, 0);
        });
    }

    /**
     * Prueba de normalidad para un array de valores
     */
    pruebaDeNormalidadArray(valores) {
        return this.evaluarNormalidad(valores);
    }

    // ========================================
    // PRUEBA DE HIPÓTESIS
    // ========================================

    pruebaHipotesis(resultadoCorrelacion, alpha = null) {
        if (alpha === null) {
            alpha = this.configuracionInvestigacion.nivelSignificancia;
        }

        const decisión = resultadoCorrelacion.pValor < alpha
            ? 'rechazar'
            : 'no_rechazar';

        return {
            alpha: alpha,
            pValor: resultadoCorrelacion.pValor,
            decision: decisión,
            conclusionH0: decisión === 'rechazar'
                ? `Se rechaza la hipótesis nula (p = ${resultadoCorrelacion.pValor.toFixed(4)} < α = ${alpha})`
                : `No se rechaza la hipótesis nula (p = ${resultadoCorrelacion.pValor.toFixed(4)} ≥ α = ${alpha})`,
            conclusionH1: decisión === 'rechazar'
                ? `Existe una relación estadísticamente significativa ${resultadoCorrelacion.interpretacion.direccion}`
                : 'No existe evidencia suficiente de una relación estadísticamente significativa'
        };
    }

    // ========================================
    // GENERACIÓN DE DISCUSIÓN PROFESIONAL
    // ========================================

    generarDiscusion(var1, var2, resultadoCorrelacion, unidadAnalisis, lugarContexto) {
        const marco = this.generarMarcoMetodologico(var1, var2, unidadAnalisis, lugarContexto);
        // alpha debe omitirse aquí para que use el nivel de significancia configurado.
        // NO pasar unidadAnalisis/lugarContexto: el 2º parámetro es alpha y un string
        // rompería la comparación p < alpha (siempre daría "no rechazar").
        const prueba = this.pruebaHipotesis(resultadoCorrelacion);
        const config = this.configuracionInvestigacion;

        let contexto = '';
        if (unidadAnalisis && lugarContexto) {
            contexto = ` en ${unidadAnalisis} de ${lugarContexto}`;
        }

        let discusion = '';

        // Sección 1: Marco de la investigación
        discusion += `**MARCO DE INVESTIGACIÓN**\n\n`;
        discusion += `**Pregunta de Investigación:**\n${marco.preguntaInvestigacion}\n\n`;
        discusion += `**Objetivo General:**\n${marco.objetivoGeneral}\n\n`;

        if (marco.objetivosEspecificos.length > 0) {
            discusion += `**Objetivos Específicos:**\n`;
            marco.objetivosEspecificos.forEach((obj, idx) => {
                discusion += `${idx + 1}. ${obj}\n`;
            });
            discusion += '\n';
        }

        discusion += `**Hipótesis de Investigación:**\n${marco.hipotesis.hipotesisInvestigador}\n\n`;
        discusion += `**Hipótesis Nula (H₀):**\n${marco.hipotesis.hipotesisNula}\n\n`;
        discusion += `**Hipótesis Alterna (H₁):**\n${marco.hipotesis.hipotesisAlterna}\n\n`;

        // Sección 2: Metodología
        discusion += `---\n\n**METODOLOGÍA ESTADÍSTICA**\n\n`;
        discusion += `El análisis correlacional se realizó mediante el coeficiente de ${resultadoCorrelacion.tipoCorrelacion}, `;
        discusion += `seleccionado en función de las pruebas de normalidad aplicadas. `;

        if (resultadoCorrelacion.normalidad1.normal && resultadoCorrelacion.normalidad2.normal) {
            discusion += `Ambas variables cumplieron con el supuesto de normalidad `;
            discusion += `(${var1}: ${resultadoCorrelacion.normalidad1.prueba}, p = ${resultadoCorrelacion.normalidad1.pValor.toFixed(3)}; `;
            discusion += `${var2}: ${resultadoCorrelacion.normalidad2.prueba}, p = ${resultadoCorrelacion.normalidad2.pValor.toFixed(3)}), `;
            discusion += `justificando el uso de estadística paramétrica.\n\n`;
        } else {
            discusion += `Al menos una de las variables no cumplió con el supuesto de normalidad `;
            discusion += `(${var1}: p = ${resultadoCorrelacion.normalidad1.pValor.toFixed(3)}; `;
            discusion += `${var2}: p = ${resultadoCorrelacion.normalidad2.pValor.toFixed(3)}), `;
            discusion += `por lo que se optó por estadística no paramétrica.\n\n`;
        }

        discusion += `Se estableció un nivel de significancia de α = ${prueba.alpha}, `;
        discusion += `utilizando una prueba ${resultadoCorrelacion.tipoPrueba === 'bilateral' ? 'bilateral' : 'unilateral'}.\n\n`;

        // Sección 3: Resultados
        discusion += `---\n\n**RESULTADOS**\n\n`;
        discusion += `El análisis reveló un coeficiente de correlación de `;
        discusion += `${resultadoCorrelacion.tipoCorrelacion === 'Pearson' ? 'r' : 'ρ'} = ${resultadoCorrelacion.coeficiente.toFixed(4)}, `;
        discusion += `con un valor de significancia p = ${resultadoCorrelacion.pValor.toFixed(4)}. `;

        if (prueba.decision === 'rechazar') {
            discusion += `Dado que p < α (${resultadoCorrelacion.pValor.toFixed(4)} < ${prueba.alpha}), `;
            discusion += `se rechaza la hipótesis nula, concluyendo que **existe una relación estadísticamente significativa** `;
            discusion += `entre ${var1} y ${var2}${contexto}.\n\n`;

            discusion += `La magnitud del efecto indica una correlación **${resultadoCorrelacion.interpretacion.fuerza}** `;
            discusion += `de dirección **${resultadoCorrelacion.interpretacion.direccion}**, `;
            discusion += `lo que sugiere que ${resultadoCorrelacion.interpretacion.direccion === 'positiva' ?
                'a medida que aumenta una variable, la otra tiende a aumentar' :
                'a medida que aumenta una variable, la otra tiende a disminuir'}.\n\n`;
        } else {
            discusion += `Dado que p ≥ α (${resultadoCorrelacion.pValor.toFixed(4)} ≥ ${prueba.alpha}), `;
            discusion += `no se puede rechazar la hipótesis nula. Por lo tanto, **no existe evidencia suficiente** `;
            discusion += `para afirmar la existencia de una relación estadísticamente significativa `;
            discusion += `entre ${var1} y ${var2}${contexto}.\n\n`;
        }

        // Sección 4: Interpretación y Discusión
        discusion += `---\n\n**DISCUSIÓN E INTERPRETACIÓN**\n\n`;

        if (prueba.decision === 'rechazar') {
            discusion += `Los hallazgos ${prueba.decision === 'rechazar' ? 'confirman' : 'no confirman'} `;
            discusion += `la hipótesis de investigación planteada. `;
            discusion += `Este resultado puede interpretarse en el contexto de [MARCO TEÓRICO]. `;
            discusion += `Según [AUTOR] ([AÑO]), [CONCEPTO TEÓRICO RELACIONADO].\n\n`;

            discusion += `La relación ${resultadoCorrelacion.interpretacion.direccion} observada `;
            discusion += `sugiere que [INTERPRETACIÓN TEÓRICA]. `;
            discusion += `Esto coincide con lo reportado por [AUTOR] ([AÑO]), quien encontró [HALLAZGO SIMILAR].\n\n`;
        } else {
            discusion += `La ausencia de una relación estadísticamente significativa `;
            discusion += `puede explicarse por diversos factores, incluyendo [POSIBLES EXPLICACIONES]. `;
            discusion += `Este resultado contrasta con [AUTOR] ([AÑO]), quien reportó [HALLAZGO DIFERENTE]. `;
            discusion += `Las diferencias metodológicas, contextuales o muestrales podrían explicar esta discrepancia.\n\n`;
        }

        discusion += `**Implicaciones:**\n`;
        discusion += `- [IMPLICACIÓN TEÓRICA]\n`;
        discusion += `- [IMPLICACIÓN PRÁCTICA]\n`;
        discusion += `- [IMPLICACIÓN METODOLÓGICA]\n\n`;

        discusion += `**Limitaciones del estudio:**\n`;
        discusion += `- [LIMITACIÓN MUESTRAL/METODOLÓGICA]\n`;
        discusion += `- [LIMITACIÓN DE GENERALIZACIÓN]\n\n`;

        discusion += `**Recomendaciones para futuras investigaciones:**\n`;
        discusion += `- [RECOMENDACIÓN 1]\n`;
        discusion += `- [RECOMENDACIÓN 2]\n`;

        return discusion;
    }

    // ========================================
    // GENERACIÓN DE REPORTE COMPLETO
    // ========================================

    generarReporteCompleto(var1, var2, resultadoCorrelacion, unidadAnalisis, lugarContexto) {
        const marco = this.generarMarcoMetodologico(var1, var2, unidadAnalisis, lugarContexto);
        const discusion = this.generarDiscusion(var1, var2, resultadoCorrelacion, unidadAnalisis, lugarContexto);

        let reporte = {
            marcoMetodologico: marco,
            resultadosEstadisticos: resultadoCorrelacion,
            pruebaHipotesis: this.pruebaHipotesis(resultadoCorrelacion),
            discusion: discusion
        };

        // Agregar análisis por dimensiones si están configuradas
        const dimensiones1 = this.obtenerDimensiones(var1);
        const dimensiones2 = this.obtenerDimensiones(var2);

        if (dimensiones1 && dimensiones2) {
            try {
                reporte.analisisPorDimensiones = this.calcularCorrelacionPorDimensiones(var1, var2, resultadoCorrelacion.tipoPrueba);
            } catch (error) {
                console.warn('No se pudo realizar análisis por dimensiones:', error);
            }
        }

        return reporte;
    }

    // ========================================
    // UTILIDADES
    // ========================================

    // Indica si todos los valores del arreglo son iguales (varianza cero).
    esConstante(valores) {
        return valores.length > 0 && valores.every(v => v === valores[0]);
    }

    obtenerValoresNumericos(nombreColumna) {
        if (!this.datos) return [];

        return this.datos
            .map(fila => fila[nombreColumna])
            .filter(valor => {
                const num = parseFloat(valor);
                return !isNaN(num) && isFinite(num);
            })
            .map(valor => parseFloat(valor));
    }

    obtenerDatos() {
        return this.datos;
    }

    obtenerResultados() {
        return this.resultados;
    }
}

// ========================================
// INSTANCIA GLOBAL
// ========================================
var AnalizadorEstadistico = new AnalizadorEstadisticoProfesional();
if (typeof window !== 'undefined') {
    window.AnalizadorEstadistico = AnalizadorEstadistico;
}