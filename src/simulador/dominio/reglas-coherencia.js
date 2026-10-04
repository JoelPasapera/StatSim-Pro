// simulador/dominio/reglas-coherencia.js — reglas de coherencia entre media, DE y rango (las usa la guía en vivo de la interfaz).

export const ReglasCoherencia = {
    // Rango permitido de la Media de un puntaje que es suma de k ítems en [min, max]
    rangoMedia(k, min, max) {
        return { minimo: Math.ceil(k * min), maximo: Math.floor(k * max) };
    },

    // DE máxima sin recorte: la distribución (±3·DE) debe caber hasta el tope más cercano
    deMaxima(media, totalMin, totalMax) {
        return Math.min(media - totalMin, totalMax - media) / 3;
    },

    // DE mínima recomendada para que un total ENTERO con forma normal no salga tan "escalonado" que la prueba de
    // Kolmogorov–Smirnov con Lilliefors (la que se usa con N ≥ 50, en SPSS y en el Analizador) rechace su normalidad: con
    // DE = 1,1·√N la rechaza en ≈ 13 % de las muestras (ver rechazoKS; revisión 2026.11.17, que la confirmó por Monte Carlo)
    // Con N < 50 se usa Shapiro–Wilk, poco sensible a los escalones: la regla no aplica (0)
    deMinimaNormal(n) {
        return (Number.isFinite(n) && n >= 50) ? Math.ceil(1.1 * Math.sqrt(n)) : 0;
    },

    // Porcentaje aproximado de muestras en que la prueba de Kolmogorov–Smirnov con Lilliefors rechaza al 5 % la normalidad de
    // un total ENTERO con forma normal. La discreción desplaza el estadístico en ≈ 0,2/DE, y su dispersión de muestreo escala
    // con 1/√N, así que el rechazo depende casi solo de s = DE/√N. Calibrada con la prueba del Analizador sobre una normal
    // discretizada (600 réplicas con N = 300; con N = 1000 sale la misma curva) y comprobada con totales del Simulador, que se
    // comportan igual (el rechazo es de la discreción, no de la forma). Interpolación lineal; fuera de la tabla, sus extremos.
    rechazoKS(de, n) {
        if (!(de > 0) || !(n >= 2)) return null;
        const s = de / Math.sqrt(n), c = CURVA_RECHAZO_KS;
        if (s <= c[0][0]) return c[0][1];
        if (s >= c[c.length - 1][0]) return c[c.length - 1][1];
        const k = c.findIndex(([x]) => x >= s), [x0, y0] = c[k - 1], [x1, y1] = c[k];
        return y0 + (y1 - y0) * (s - x0) / (x1 - x0);
    }
};

// [s = DE/√N, % de rechazo de la prueba de Kolmogorov–Smirnov al 5 %], monótona (media de N = 300 y N = 1000, suavizada)
const CURVA_RECHAZO_KS = Object.freeze([[0.25, 99], [0.3, 90], [0.35, 78], [0.4, 61], [0.5, 43], [0.6, 27], [0.7, 23], [0.8, 19], [0.9, 16], [1.0, 15], [1.1, 13], [1.25, 12], [1.5, 9], [2.0, 8], [3.0, 5]]);
