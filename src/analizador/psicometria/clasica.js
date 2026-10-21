import { media, varianza, covarianza } from '../../core/stats/descriptivos.js';
import { correlacion as correlacionNucleo, matrizCorrelaciones } from '../../core/stats/correlacion.js';
import { ejesPrincipalesUnFactor, omegaCovarianzas, alfaCronbach } from '../../core/stats/fiabilidad.js';
export { media, varianza, covarianza };   // (2026.12.12) del núcleo único (core/stats/descriptivos.js)
// analizador/psicometria/clasica.js — α de Cronbach y ω de McDonald clásicos (correlaciones de Pearson), con la misma
// aritmética que la tabla de fiabilidad: fiabilidad.js los usa desde aquí y el Worker del bootstrap también, así el
// intervalo de confianza se calcula sobre exactamente el mismo estadístico que se reporta.

export function correlacion(a, b) { const r = correlacionNucleo(a, b); return Number.isNaN(r) ? 0 : r; }   // 0 si no está definida, como siempre aquí

// ω unifactorial por ejes principales (autovector dominante por potencias) sobre la matriz de correlaciones
export function omegaUnifactorial(R, k) {
    if (k < 3) return { ok: false, motivo: null }; // k=2: se reporta Spearman-Brown
    // (2026.12.13) del motor único del núcleo, hasta la convergencia: antes, hasta 50 iteraciones con parada por cambio
    // < 1e−6, y con 3 o 4 ítems y cargas modestas la ω salía hasta 0,02 por debajo de la solución
    const ep = ejesPrincipalesUnFactor(R);
    if (!ep.estimable) return { ok: false, motivo: 'El ω no se reporta: la solución factorial no es estimable con estos datos.' };
    const cargas = ep.cargas;
    // el signo de cada carga se conserva (signo global de suma positiva): se comprueba en la solución convergida
    if (cargas.some(l => l < -0.05)) {
        return { ok: false, motivo: 'El ω no se reporta: existen cargas factoriales de signo mixto. Examine el origen de las correlaciones negativas señaladas (formulación inversa, redacción deficiente, multidimensionalidad, errores de captura o constructo distinto) antes de cualquier recodificación.' };
    }
    const heywood = cargas.some(l => l * l >= 0.999);
    const sumaCargas = cargas.reduce((s, l) => s + Math.max(l, 0), 0);
    const sumaUnicidades = cargas.reduce((s, l) => s + (1 - Math.min(l * l, 0.999)), 0);
    const om = (sumaCargas ** 2) / ((sumaCargas ** 2) + sumaUnicidades);
    if (!(om > 0 && om <= 1)) return { ok: false, motivo: 'El ω no se reporta: la solución factorial produjo un valor fuera de rango.' };
    return { ok: true, valor: om, cargas, motivo: heywood ? 'La solución del ω presenta un caso Heywood (comunalidad en el límite); el valor debe tomarse como orientativo.' : null };
}

// ω en la métrica de la puntuación total observada: cargas y unicidades reescaladas por las DE de los ítems
export function omegaObservado(om, vars) {
    if (!(om && om.ok)) return { omega: null, omegaStd: null };
    const oc = omegaCovarianzas(om.cargas, vars);   // (2026.12.13) del núcleo único: la misma que usa el Simulador al calibrar
    return { omega: (oc > 0 && oc <= 1) ? oc : om.valor, omegaStd: om.valor };
}

// α y ω de un conjunto de columnas completas (sin excluir ítems: el llamador decide qué hacer con los constantes)
export function coeficientesClasicos(cols) {
    const k = cols.length, n = cols[0].length;
    const vars = cols.map(c => varianza(c));
    const total = new Array(n).fill(0);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < k; j++) s += cols[j][i]; total[i] = s; }
    const varTotal = varianza(total);
    if (!(varTotal > 0)) return { alfa: null, omega: null, omegaStd: null };
    // (2026.12.25) la matriz del núcleo único, con la aritmética de correlacion() (medias y sumas de cuadrados una sola vez
    // por ítem: el bootstrap repite esto cientos de veces); hasta la 2026.12.24, una copia que difería en el último bit
    const R = matrizCorrelaciones(cols);
    const alfa = alfaCronbach(vars, varTotal);   // del núcleo único
    return { alfa, ...omegaObservado(omegaUnifactorial(R, k), vars) };
}

// Matriz de correlaciones de Pearson de unas columnas completas (0 si una es constante): la del núcleo único
export { matrizCorrelaciones };
