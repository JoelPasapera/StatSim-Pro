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
        // Una base de datos nueva invalida la configuración de dimensiones y los
        // resultados anteriores (los ítems podrían no existir en estos datos).
        this.dimensiones = {};
        this.resultados = {};
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
            resultado.prueba = 'Kolmogorov-Smirnov (Lilliefors)';
            resultado.razon = 'n ≥ 50';
        }

        resultado.n = n;
        resultado.normal = resultado.pValor > 0.05;
        resultado.decision = resultado.pValor > 0.05
            ? 'Los datos siguen una distribución normal (p > 0.05)'
            : 'Los datos NO siguen una distribución normal (p ≤ 0.05)';

        return resultado;
    }

    /**
     * Prueba de Shapiro-Wilk según el algoritmo de Royston (1992, AS R94),
     * el mismo que usan R y SPSS. Calcula los pesos a_i a partir de las
     * puntuaciones normales esperadas (Blom) con las correcciones polinómicas
     * de Royston, en lugar de un peso constante (que invalidaba el estadístico).
     */
    shapiroWilk(valores) {
        const n = valores.length;
        const x = [...valores].sort((a, b) => a - b);

        // Puntuaciones normales esperadas m_i y su norma
        const m = new Array(n);
        for (let i = 0; i < n; i++) {
            m[i] = this.cuantilNormalEstandar((i + 1 - 0.375) / (n + 0.25));
        }
        const ssm = m.reduce((acc, v) => acc + v * v, 0);
        const sqrtSsm = Math.sqrt(ssm);
        const rsn = 1 / Math.sqrt(n);

        const poly = (coef, valor) => coef.reduce((acc, c, idx) => acc + c * Math.pow(valor, idx), 0);
        const c1 = [0, 0.221157, -0.147981, -2.071190, 4.434685, -2.706056];
        const c2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];

        // Pesos a_i (antisimétricos: a[n-1-i] = -a[i])
        const a = new Array(n).fill(0);
        let aUltimo = m[n - 1] / sqrtSsm;
        let phi, indiceMedio;

        if (n > 5) {
            let aPenultimo = m[n - 2] / sqrtSsm;
            aUltimo = poly(c1, rsn) + aUltimo;
            aPenultimo = poly(c2, rsn) + aPenultimo;
            phi = (ssm - 2 * m[n - 1] * m[n - 1] - 2 * m[n - 2] * m[n - 2]) /
                (1 - 2 * aUltimo * aUltimo - 2 * aPenultimo * aPenultimo);
            a[n - 1] = aUltimo; a[0] = -aUltimo;
            a[n - 2] = aPenultimo; a[1] = -aPenultimo;
            indiceMedio = 2;
        } else {
            aUltimo = poly(c1, rsn) + aUltimo;
            phi = (ssm - 2 * m[n - 1] * m[n - 1]) / (1 - 2 * aUltimo * aUltimo);
            a[n - 1] = aUltimo; a[0] = -aUltimo;
            indiceMedio = 1;
        }

        const sqrtPhi = Math.sqrt(phi);
        for (let i = indiceMedio; i < n - indiceMedio; i++) {
            a[i] = m[i] / sqrtPhi;
        }

        // Estadístico W = (Σ a_i x_(i))² / Σ (x_i - x̄)²
        const media = x.reduce((s, v) => s + v, 0) / n;
        let numerador = 0;
        let denominador = 0;
        for (let i = 0; i < n; i++) {
            numerador += a[i] * x[i];
            denominador += (x[i] - media) * (x[i] - media);
        }
        const W = denominador > 0 ? (numerador * numerador) / denominador : 0;

        return {
            estadistico: W,
            pValor: this.estimarPValorShapiro(W, n)
        };
    }

    /**
     * p-valor de Shapiro-Wilk mediante la transformación de Royston (1992),
     * con las ramas correspondientes a n = 3, 4 ≤ n ≤ 11 y n ≥ 12.
     */
    estimarPValorShapiro(W, n) {
        if (W <= 0 || W >= 1) {
            return W >= 1 ? 1 : 0;
        }

        // Caso exacto para n = 3 (Royston)
        if (n === 3) {
            const p = (6 / Math.PI) * (Math.asin(Math.sqrt(W)) - Math.asin(Math.sqrt(0.75)));
            return Math.max(0, Math.min(1, p));
        }

        const poly = (coef, valor) => coef.reduce((acc, c, idx) => acc + c * Math.pow(valor, idx), 0);
        let w1, mu, sigma;

        if (n <= 11) {
            const gamma = poly([-2.273, 0.459], n);
            w1 = -Math.log(gamma - Math.log(1 - W));
            mu = poly([0.5440, -0.39978, 0.025054, -0.0006714], n);
            sigma = Math.exp(poly([1.3822, -0.77857, 0.062767, -0.0020322], n));
        } else {
            const ln = Math.log(n);
            w1 = Math.log(1 - W);
            mu = poly([-1.5861, -0.31082, -0.083751, 0.0038915], ln);
            sigma = Math.exp(poly([-0.4803, -0.082676, 0.0030302], ln));
        }

        const z = (w1 - mu) / sigma;
        const p = 1 - this.distribucionNormalAcumulada(z);
        return Math.max(0, Math.min(1, p));
    }

    /**
     * Cuantil de la distribución normal estándar (función inversa de la CDF),
     * mediante la aproximación racional de Acklam (precisión ~1e-9).
     */
    cuantilNormalEstandar(p) {
        if (p <= 0) return -Infinity;
        if (p >= 1) return Infinity;

        const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
            1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
        const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
            6.680131188771972e+01, -1.328068155288572e+01];
        const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
            -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
        const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
            3.754408661907416e+00];

        const pBajo = 0.02425;
        const pAlto = 1 - pBajo;
        let q, r;

        if (p < pBajo) {
            q = Math.sqrt(-2 * Math.log(p));
            return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
                ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
        } else if (p <= pAlto) {
            q = p - 0.5;
            r = q * q;
            return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
                (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
        }
        q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
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

    /**
     * p-valor del test de normalidad de Kolmogorov-Smirnov con parámetros
     * estimados de la muestra (= test de Lilliefors). La distribución estándar
     * de Kolmogorov es demasiado conservadora al estimar la media y la DE, por
     * lo que se usa la aproximación de Dallal-Wilkinson (cola, p ≤ 0.1) y la de
     * Khorzad (zona central), igual que nortest::lillie.test de R.
     */
    estimarPValorKS(D, n) {
        let dMod = D;
        let nMod = n;
        if (n > 100) {
            dMod = D * Math.pow(n / 100, 0.49);
            nMod = 100;
        }

        // Aproximación de Dallal-Wilkinson (precisa en la cola, p ≤ 0.1)
        let p = Math.exp(
            -7.01256 * dMod * dMod * (nMod + 2.78019)
            + 2.99587 * dMod * Math.sqrt(nMod + 2.78019)
            - 0.122119 + 0.974598 / Math.sqrt(nMod) + 1.67997 / nMod
        );

        // Para p > 0.1, aproximación polinómica de Khorzad sobre el estadístico
        // modificado (la cola de Dallal-Wilkinson deja de ser fiable ahí).
        if (p > 0.1) {
            const kk = (Math.sqrt(n) - 0.01 + 0.85 / Math.sqrt(n)) * D;
            const k2 = kk * kk;
            const k3 = k2 * kk;
            const k4 = k3 * kk;

            if (kk <= 0.302) {
                p = 1;
            } else if (kk <= 0.5) {
                p = 2.76773 - 19.828315 * kk + 80.709644 * k2 - 138.55152 * k3 + 81.218052 * k4;
            } else if (kk <= 0.9) {
                p = -4.901232 + 40.662806 * kk - 97.490286 * k2 + 94.029866 * k3 - 32.355711 * k4;
            } else if (kk <= 1.31) {
                p = 6.198765 - 19.558097 * kk + 23.186922 * k2 - 12.234627 * k3 + 2.423045 * k4;
            } else {
                p = 0;
            }
        }

        return Math.max(0, Math.min(1, p));
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

        // Estadísticos adicionales para el reporte (descriptivos, grados de
        // libertad, tamaño del efecto r² e intervalo de confianza del coeficiente).
        resultado.descriptivas1 = this.calcularDescriptivas(valores1);
        resultado.descriptivas2 = this.calcularDescriptivas(valores2);
        resultado.gl = resultado.n - 2;
        resultado.r2 = resultado.coeficiente * resultado.coeficiente;
        resultado.intervaloConfianza = this.intervaloConfianzaR(
            resultado.coeficiente, resultado.n, resultado.tipoCorrelacion
        );

        // Regresión lineal simple (var2 predicha desde var1). Solo se ofrece
        // cuando se cumple el supuesto de normalidad (método paramétrico), por
        // coherencia con el uso de Pearson.
        if (resultado.tipoCorrelacion === 'Pearson') {
            resultado.regresion = this.calcularRegresionLineal(valores1, valores2);
        }

        // Pares de valores (para el diagrama de dispersión de las dos variables).
        resultado.valoresPareados = { x: valores1, y: valores2 };

        return resultado;
    }

    /**
     * Regresión lineal simple por mínimos cuadrados: predice `y` (criterio) a
     * partir de `x` (predictor). Devuelve la pendiente y el intercepto, el
     * coeficiente de determinación, el error estándar de estimación y la
     * significancia de la pendiente (t de Student, gl = n − 2).
     */
    calcularRegresionLineal(x, y) {
        const n = x.length;
        const mediaX = x.reduce((a, b) => a + b, 0) / n;
        const mediaY = y.reduce((a, b) => a + b, 0) / n;

        let sxy = 0, sxx = 0, syy = 0;
        for (let i = 0; i < n; i++) {
            const dx = x[i] - mediaX;
            const dy = y[i] - mediaY;
            sxy += dx * dy;
            sxx += dx * dx;
            syy += dy * dy;
        }

        const pendiente = sxy / sxx;
        const intercepto = mediaY - pendiente * mediaX;
        const r2 = (sxy * sxy) / (sxx * syy);

        // Suma de cuadrados residual y errores estándar
        const ssResidual = Math.max(0, syy - pendiente * sxy);
        const errorEstandarEstimacion = n > 2 ? Math.sqrt(ssResidual / (n - 2)) : 0;
        const errorEstandarPendiente = errorEstandarEstimacion / Math.sqrt(sxx);
        const tPendiente = errorEstandarPendiente > 0 ? pendiente / errorEstandarPendiente : 0;
        const pPendiente = this.calcularPValorT(Math.abs(tPendiente), n - 2);

        return {
            pendiente: pendiente,
            intercepto: intercepto,
            r2: r2,
            errorEstandarEstimacion: errorEstandarEstimacion,
            errorEstandarPendiente: errorEstandarPendiente,
            tPendiente: tPendiente,
            gl: n - 2,
            pPendiente: pPendiente
        };
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
        if (n <= 2) {
            return 1; // Sin grados de libertad suficientes
        }
        if (Math.abs(r) >= 1) {
            return 0; // Correlación perfecta: significancia máxima
        }

        const t = r * Math.sqrt((n - 2) / (1 - r * r));
        const gl = n - 2;

        // calcularPValorT devuelve la probabilidad de DOS colas, P(|T| > |t|),
        // que es directamente el p-valor bilateral. El unilateral es la mitad.
        const pDosColas = this.calcularPValorT(Math.abs(t), gl);
        const pValor = tipoPrueba === 'bilateral' ? pDosColas : pDosColas / 2;

        return Math.min(1, Math.max(0, pValor));
    }

    calcularPValorSpearman(rho, n, tipoPrueba) {
        // Significancia de Spearman mediante la aproximación t:
        //   t = r_s · √((n − 2) / (1 − r_s²)), con gl = n − 2.
        // Es la prueba asintótica estándar (SPSS, R cor.test) y resulta
        // coherente con aplicar Pearson sobre los rangos. Antes se usaba
        // z = r_s·√(n−1) para n > 10 y la t para n ≤ 10, lo que era
        // inconsistente y menos preciso.
        return this.calcularPValorPearson(rho, n, tipoPrueba);
    }

    /**
     * Intervalo de confianza del coeficiente de correlación mediante la
     * transformación z de Fisher. Para Spearman se aplica la corrección del
     * error estándar de Bonett-Wright (2000). Devuelve null si N ≤ 3 o si el
     * coeficiente es exactamente ±1 (la transformación no está definida).
     */
    intervaloConfianzaR(r, n, tipoCorrelacion, nivel = 0.95) {
        if (n <= 3 || Math.abs(r) >= 1) {
            return null;
        }

        // Transformación de Fisher (z) y su error estándar
        const zr = 0.5 * Math.log((1 + r) / (1 - r));
        const esSpearman = typeof tipoCorrelacion === 'string' && tipoCorrelacion.includes('Spearman');
        const errorEstandar = esSpearman
            ? Math.sqrt((1 + r * r / 2) / (n - 3))   // Bonett-Wright para Spearman
            : 1 / Math.sqrt(n - 3);                   // Fisher para Pearson

        const zCritico = this.obtenerZCritico(nivel);
        const zInferior = zr - zCritico * errorEstandar;
        const zSuperior = zr + zCritico * errorEstandar;

        // Transformación inversa (tanh)
        const aCorrelacion = z => (Math.exp(2 * z) - 1) / (Math.exp(2 * z) + 1);

        return {
            inferior: aCorrelacion(zInferior),
            superior: aCorrelacion(zSuperior),
            nivel: nivel
        };
    }

    // z crítico bilateral para los niveles de confianza más usados.
    obtenerZCritico(nivel) {
        const tabla = { 0.90: 1.644854, 0.95: 1.959964, 0.99: 2.575829 };
        return tabla[nivel] || 1.959964;
    }

    // Devuelve la probabilidad de DOS colas P(|T| > t) de una t de Student con
    // `gl` grados de libertad, mediante la beta incompleta regularizada:
    // P(|T| > t) = I_x(gl/2, 1/2) con x = gl / (gl + t²).
    calcularPValorT(t, gl) {
        const x = gl / (gl + t * t);
        return this.betaIncompleta(x, gl / 2, 0.5);
    }

    /**
     * Función beta incompleta regularizada I_x(a, b), calculada con la fracción
     * continua de Lentz (Numerical Recipes). Se aplica la simetría
     * I_x(a, b) = 1 - I_{1-x}(b, a) según el valor de x para garantizar la
     * convergencia (la serie directa fallaba cuando x se acercaba a 1, lo que
     * producía p-valores erróneamente pequeños).
     */
    betaIncompleta(x, a, b) {
        if (x <= 0) return 0;
        if (x >= 1) return 1;

        // Factor frontal x^a (1-x)^b / B(a, b), vía lnGamma para estabilidad.
        const ln = this.lnGamma(a + b) - this.lnGamma(a) - this.lnGamma(b)
            + a * Math.log(x) + b * Math.log(1 - x);
        const factor = Math.exp(ln);

        if (x < (a + 1) / (a + b + 2)) {
            return factor * this.fraccionContinuaBeta(x, a, b) / a;
        }
        return 1 - factor * this.fraccionContinuaBeta(1 - x, b, a) / b;
    }

    // Fracción continua para la beta incompleta (método de Lentz modificado).
    fraccionContinuaBeta(x, a, b) {
        const MAX_ITER = 200;
        const EPS = 3e-12;
        const FPMIN = 1e-300;

        const qab = a + b;
        const qap = a + 1;
        const qam = a - 1;

        let c = 1;
        let d = 1 - qab * x / qap;
        if (Math.abs(d) < FPMIN) d = FPMIN;
        d = 1 / d;
        let h = d;

        for (let m = 1; m <= MAX_ITER; m++) {
            const m2 = 2 * m;

            // Paso par
            let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
            d = 1 + aa * d;
            if (Math.abs(d) < FPMIN) d = FPMIN;
            c = 1 + aa / c;
            if (Math.abs(c) < FPMIN) c = FPMIN;
            d = 1 / d;
            h *= d * c;

            // Paso impar
            aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
            d = 1 + aa * d;
            if (Math.abs(d) < FPMIN) d = FPMIN;
            c = 1 + aa / c;
            if (Math.abs(c) < FPMIN) c = FPMIN;
            d = 1 / d;
            const delta = d * c;
            h *= delta;

            if (Math.abs(delta - 1) < EPS) break;
        }

        return h;
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