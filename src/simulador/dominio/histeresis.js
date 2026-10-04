// simulador/dominio/histeresis.js — estados con histéresis (Atlas de relaciones, fase E2; sin DOM ni estado).
// Un estado de dos valores (bajo 0, alto 1) depende del CAMINO de X: se entra por encima del umbral de entrada y se sale por debajo
// del de salida, más bajo; entre los dos (la franja) se conserva el estado de la onda anterior. Con el mismo X hoy, dos personas
// pueden estar en estados distintos según de dónde vengan. En T1, sin pasado, el estado alto es tanto más probable cuanto más cerca
// está X del umbral de entrada. La nitidez es la proporción de observaciones en que el estado no sigue la regla: con 0 la separación
// es perfecta y una regresión logística con el estado anterior no converge.

// Cuantil empírico con interpolación lineal (tipo 7) de un vector ya ordenado
export function cuantilOrdenado(ordenados, p) {
    const h = (ordenados.length - 1) * p, i = Math.floor(h);
    return i + 1 < ordenados.length ? ordenados[i] + (h - i) * (ordenados[i + 1] - ordenados[i]) : ordenados[i];
}

// Estados de n personas en K ondas: X[k][i] (totales), umbrales alto > bajo, ruido en [0, 0.5), aleatorio() uniforme en [0, 1).
// Devuelve S[k] (Uint8Array con 0/1)
export function generarEstados(X, alto, bajo, ruido, aleatorio) {
    const K = X.length, n = X[0].length, S = X.map(() => new Uint8Array(n));
    for (let i = 0; i < n; i++) {
        let s = 0;
        for (let k = 0; k < K; k++) {
            const x = X[k][i];
            const regla = x >= alto ? 1 : x <= bajo ? 0 : (k === 0 ? (aleatorio() < (x - bajo) / (alto - bajo) ? 1 : 0) : s);
            s = ruido > 0 && aleatorio() < ruido ? 1 - regla : regla;
            S[k][i] = s;
        }
    }
    return S;
}

// Resumen de trayectorias y estados (salta las observaciones con X o estado no finitos): cuántas siguen la regla fuera de la franja,
// cuántas conservan el estado dentro (desde la onda 2), el estado según el anterior dentro de la franja, el X medio al entrar y al
// salir SIGUIENDO la regla (revisión de la fase E2: mezclar los cambios de la nitidez daba entradas por debajo del umbral de
// entrada), los cambios que no la siguen, las observaciones en la franja y las personas con algún cambio
export function resumenHisteresis(X, S, alto, bajo) {
    const K = X.length, n = X[0].length, r = { nFuera: 0, fueraSigue: 0, nDentro: 0, dentroConserva: 0, altosDesdeAlto: 0, nDesdeAlto: 0, altosDesdeBajo: 0, nDesdeBajo: 0, sumaEntra: 0, nEntra: 0, sumaSale: 0, nSale: 0, cambios: 0, cambiosFueraDeRegla: 0, nObs: 0, nFranja: 0, personasConCambio: 0, personas: 0 };
    for (let i = 0; i < n; i++) {
        let previo = NaN, cambio = false, vista = false;
        for (let k = 0; k < K; k++) {
            const x = X[k][i], s = S[k][i];
            if (!Number.isFinite(x) || !Number.isFinite(s)) { previo = NaN; continue; }
            vista = true; r.nObs++;
            if (x > bajo && x < alto) r.nFranja++;
            if (x >= alto || x <= bajo) { r.nFuera++; if (s === (x >= alto ? 1 : 0)) r.fueraSigue++; }
            else if (Number.isFinite(previo)) {
                r.nDentro++; if (s === previo) r.dentroConserva++;
                if (previo === 1) { r.nDesdeAlto++; r.altosDesdeAlto += s; } else { r.nDesdeBajo++; r.altosDesdeBajo += s; }
            }
            if (Number.isFinite(previo) && s !== previo) {
                cambio = true; r.cambios++;
                if (s === 1 && x >= alto) { r.sumaEntra += x; r.nEntra++; } else if (s === 0 && x <= bajo) { r.sumaSale += x; r.nSale++; } else r.cambiosFueraDeRegla++;
            }
            previo = s;
        }
        if (vista) { r.personas++; if (cambio) r.personasConCambio++; }
    }
    return r;
}
