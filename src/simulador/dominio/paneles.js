// @ts-check
// simulador/dominio/paneles.js — relaciones en el tiempo: rezagada y recíproca, el panel cruzado (Atlas de relaciones, fase E1;
// sin DOM ni estado). Con medidas repetidas de X e Y según AR(1), cada onda depende de la anterior:
//     X_{t+1} = a·X_t + b·Y_t + e,     Y_{t+1} = d·Y_t + c·X_t + f,     Z = (X, Y), A = [[a, b], [c, d]]
// c es el efecto cruzado de X sobre la Y siguiente (controlando la Y anterior) y b el de Y sobre la X siguiente; en la relación
// rezagada, b = 0. Con la correlación en la misma onda r estacionaria (Σ = [[1, r], [r, 1]], variables tipificadas), la
// covarianza entre ondas es Cov(Z_s, Z_t) = A^(s−t)·Σ, y lo nuevo de cada onda, Ψ = Σ − A·Σ·Aᵀ, debe ser definido positivo.
// La estabilidad de la tabla VI conserva su sentido (la r entre ondas consecutivas): a = estab_X − b·r, d = estab_Y − c·r.
// (RI-CLPM, 2026.12.07) Con interceptos aleatorios (Hamaker, Kuiper y Grasman, 2015) cada persona tiene además un nivel estable:
//     X_t = √ICC_X·RI_X + √(1 − ICC_X)·x*_t,  Y_t = √ICC_Y·RI_Y + √(1 − ICC_Y)·y*_t,  r(RI_X, RI_Y) = r_RI
// y la dinámica (A, Σ) es la de las partes de dentro x*, y*: la r en la misma onda y los efectos cruzados de la fila son DE DENTRO
// de la persona, y la estabilidad de dentro se deduce de la observada, s* = (s − ICC)/(1 − ICC). La correlación entre ondas es
// B + D·A^(s−t)·Σ·D, con B la parte de los interceptos y D = diag(√(1 − ICC)). Con ICC = 0 es exactamente el panel de antes.
// El panel cruzado clásico, que regresa Y_{t+1} sobre X_t e Y_t con los datos observados, mezcla las dos partes: unos rasgos
// estables relacionados le dan efectos cruzados aunque dentro de la persona no los haya (clpmIngenuo).

/** @typedef {number[][]} Matriz2  matriz 2×2 */
/**
 * La dinámica de una fila de relación en el tiempo.
 * @typedef {object} EstructuraPanel
 * @property {Matriz2} A  dinámica: autorregresivos en la diagonal, efectos cruzados fuera (A[1][0] = c, X → Y; A[0][1] = b, Y → X)
 * @property {Matriz2} Sigma  correlaciones en la misma onda
 * @property {Matriz2} Psi  lo nuevo de cada onda, Σ − A·Σ·Aᵀ
 * @property {boolean} posible  Ψ es definida positiva
 * @property {number} a  autorregresivo de X
 * @property {number} d  autorregresivo de Y
 * @property {Matriz2 | null} B  (RI-CLPM) la parte de los interceptos aleatorios en la correlación entre ondas; null sin ellos
 * @property {number[] | null} D  (RI-CLPM) √(1 − ICC) de X y de Y; null sin interceptos
 */

/**
 * @param {Matriz2} P
 * @param {Matriz2} Q
 * @returns {Matriz2}
 */
const mul = (P, Q) => [[P[0][0] * Q[0][0] + P[0][1] * Q[1][0], P[0][0] * Q[0][1] + P[0][1] * Q[1][1]], [P[1][0] * Q[0][0] + P[1][1] * Q[1][0], P[1][0] * Q[0][1] + P[1][1] * Q[1][1]]];
/**
 * @param {Matriz2} P
 * @returns {Matriz2}
 */
const tr = P => [[P[0][0], P[1][0]], [P[0][1], P[1][1]]];

// La dinámica de una fila: { A, Sigma, Psi, posible, a, d }
/**
 * @param {{ estabX: number, estabY: number, r: number, cXY: number, cYX?: number, iccX?: number, iccY?: number, rRI?: number }} fila  estabilidades observadas, r en la misma onda y efectos cruzados (de dentro, si hay interceptos), y los interceptos aleatorios (opcionales)
 * @returns {EstructuraPanel}
 */
export function estructuraPanel({ estabX, estabY, r, cXY, cYX = 0, iccX = 0, iccY = 0, rRI = 0 }) {
    if (iccX > 0 || iccY > 0) {
        const sX = (estabX - iccX) / (1 - iccX), sY = (estabY - iccY) / (1 - iccY);
        const dentro = estructuraPanel({ estabX: sX, estabY: sY, r, cXY, cYX });
        const rb = Math.sqrt(iccX * iccY) * rRI;
        const valida = iccX >= 0 && iccX < 1 && iccY >= 0 && iccY < 1 && Math.abs(sX) < 1 && Math.abs(sY) < 1 && Math.abs(rRI) < 1;
        return Object.assign(dentro, { B: [[iccX, rb], [rb, iccY]], D: [Math.sqrt(1 - iccX), Math.sqrt(1 - iccY)], posible: dentro.posible && valida });
    }
    const a = estabX - cYX * r, d = estabY - cXY * r;
    const A = [[a, cYX], [cXY, d]], Sigma = [[1, r], [r, 1]], ASA = mul(mul(A, Sigma), tr(A));
    const Psi = [[1 - ASA[0][0], r - ASA[0][1]], [r - ASA[1][0], 1 - ASA[1][1]]];
    const posible = Psi[0][0] > 1e-6 && Psi[1][1] > 1e-6 && Psi[0][0] * Psi[1][1] - Psi[0][1] * Psi[1][0] > 1e-9;
    return { A, Sigma, Psi, posible, a, d, B: null, D: null };
}

// Matriz 2×2 de correlaciones entre la onda s y la onda t (s ≥ t): A^(s−t)·Σ; [0][0] = r(X_s, X_t), [0][1] = r(X_s, Y_t),
// [1][0] = r(Y_s, X_t), [1][1] = r(Y_s, Y_t)
/**
 * @param {{ A: Matriz2, Sigma: Matriz2, B?: Matriz2 | null, D?: number[] | null }} est
 * @param {number} s
 * @param {number} t  t ≤ s
 * @returns {Matriz2}  las correlaciones OBSERVADAS (con interceptos, B + D·A^(s−t)·Σ·D)
 */
export function correlacionEntreOndas(est, s, t) {
    let M = est.Sigma;
    for (let k = 0; k < s - t; k++) M = mul(est.A, M);
    const B = est.B, D = est.D;
    if (!B || !D) return M;
    return [[B[0][0] + D[0] * M[0][0] * D[0], B[0][1] + D[0] * M[0][1] * D[1]], [B[1][0] + D[1] * M[1][0] * D[0], B[1][1] + D[1] * M[1][1] * D[1]]];
}

/**
 * (RI-CLPM) Los β tipificados que estimaría el panel cruzado CLÁSICO con los datos observados (regresión de cada variable en la
 * onda siguiente sobre las dos de la anterior), en la población: mezclan la dinámica de dentro con los rasgos estables.
 * @param {{ A: Matriz2, Sigma: Matriz2, B?: Matriz2 | null, D?: number[] | null }} est
 * @returns {{ cXY: number, cYX: number, a: number, d: number }}
 */
export function clpmIngenuo(est) {
    const M1 = correlacionEntreOndas(est, 2, 1), M0 = correlacionEntreOndas(est, 1, 1);
    const y = regresionRezagada(M1[1][1], M1[1][0], M0[0][1]), x = regresionRezagada(M1[0][0], M1[0][1], M0[0][1]);
    return { cXY: y.cruzado, cYX: x.cruzado, a: x.propio, d: y.propio };
}

/**
 * (RI-CLPM) Qué separa el modelo con interceptos: el efecto cruzado de dentro de la persona frente al que vería el panel clásico.
 * En la recíproca, también el de Y → X (revisión de la 2026.12.08: antes solo se hablaba de X → Y).
 * @param {number} dentroXY  efecto X → Y dentro de la persona (el pedido)
 * @param {number} clasicoXY  el que estima el panel clásico con los datos
 * @param {number} rRI  r entre los interceptos (los rasgos estables)
 * @param {{ dentro: number, clasico: number } | null} [yx]  en la recíproca, los de Y → X
 * @returns {string}
 */
export function fenomenoRIclpm(dentroXY, clasicoXY, rRI, yx = null) {
    /** @param {string} nombre @param {number} clasico @param {number} dentro */
    const frase = (nombre, clasico, dentro) => `el panel cruzado clásico estima un efecto ${nombre} de ${clasico.toFixed(2)}, pero dentro de la persona es de ${dentro.toFixed(2)}`;
    /** @type {Array<[number, string]>} */
    const pares = [[clasicoXY - dentroXY, frase('X → Y', clasicoXY, dentroXY)]];
    if (yx) pares.push([yx.clasico - yx.dentro, frase('Y → X', yx.clasico, yx.dentro)]);
    const sesgados = pares.filter(([s]) => Math.abs(s) >= 0.05);
    if (!sesgados.length) return `el panel cruzado clásico y el de dentro de la persona dan ${yx ? 'efectos cruzados parecidos' : 'un efecto X → Y parecido'}: los rasgos estables apenas los contaminan`;
    const base = sesgados.map(([, f]) => f).join('; ');
    return Math.abs(rRI) >= 0.05 ? `${base}: la diferencia la crean los rasgos estables relacionados (r entre interceptos ${rRI.toFixed(2)}), que el RI-CLPM separa de los cambios`
        : `${base}: la diferencia la crean los rasgos estables (sus interceptos), que el RI-CLPM separa de los cambios`;
}

// Propagación de una variable que no se repite: con r(X₁, W) y r(Y₁, W), las de la onda k son A^(k−1)·(r_XW, r_YW)
/**
 * @param {{ A: Matriz2 }} est
 * @param {number} rXW
 * @param {number} rYW
 * @param {number} k  onda (1 = T1)
 * @returns {number[]}  [r(X_k, W), r(Y_k, W)]
 */
export function propagarExogena(est, rXW, rYW, k) {
    let v = [rXW, rYW];
    for (let j = 1; j < k; j++) v = [est.A[0][0] * v[0] + est.A[0][1] * v[1], est.A[1][0] * v[0] + est.A[1][1] * v[1]];
    return v;
}

// β tipificados de la regresión de V_{t+1} sobre (V_t, U_t): { propio, cruzado }, con r(V_t, V_{t+1}), r(U_t, V_{t+1}) y r(U_t, V_t)
/**
 * @param {number} rPropio
 * @param {number} rCruzado
 * @param {number} rMisma
 * @returns {{ propio: number, cruzado: number }}
 */
export function regresionRezagada(rPropio, rCruzado, rMisma) {
    const den = 1 - rMisma * rMisma;
    return { propio: (rPropio - rCruzado * rMisma) / den, cruzado: (rCruzado - rPropio * rMisma) / den };
}

// Qué muestran los dos efectos cruzados estimados (umbral .05 en valor absoluto)
/**
 * @param {string} tipo  'rezagada' o 'reciproca'
 * @param {number} bXY  efecto cruzado estimado de X sobre la Y siguiente
 * @param {number} bYX  efecto cruzado estimado de Y sobre la X siguiente
 * @returns {string}
 */
export function fenomenoPanel(tipo, bXY, bYX) {
    const x = Math.abs(bXY), y = Math.abs(bYX);
    if (tipo === 'rezagada' || y < 0.05) return x < 0.05 ? 'ninguna de las dos predice a la otra en la onda siguiente' : 'X precede a Y: predice su onda siguiente más allá de lo que Y ya traía, y no al revés';
    if (x < 0.05) return 'Y precede a X: predice su onda siguiente, y no al revés';
    if (Math.abs(x - y) < 0.05) return 'relación recíproca y equilibrada: cada una predice la onda siguiente de la otra con fuerza parecida';
    return `relación recíproca: cada una predice la onda siguiente de la otra, y domina ${x > y ? 'X → Y' : 'Y → X'}`;
}
