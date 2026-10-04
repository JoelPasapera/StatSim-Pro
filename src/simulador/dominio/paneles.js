// simulador/dominio/paneles.js — relaciones en el tiempo: rezagada y recíproca, el panel cruzado (Atlas de relaciones, fase E1;
// sin DOM ni estado). Con medidas repetidas de X e Y según AR(1), cada onda depende de la anterior:
//     X_{t+1} = a·X_t + b·Y_t + e,     Y_{t+1} = d·Y_t + c·X_t + f,     Z = (X, Y), A = [[a, b], [c, d]]
// c es el efecto cruzado de X sobre la Y siguiente (controlando la Y anterior) y b el de Y sobre la X siguiente; en la relación
// rezagada, b = 0. Con la correlación en la misma onda r estacionaria (Σ = [[1, r], [r, 1]], variables tipificadas), la
// covarianza entre ondas es Cov(Z_s, Z_t) = A^(s−t)·Σ, y lo nuevo de cada onda, Ψ = Σ − A·Σ·Aᵀ, debe ser definido positivo.
// La estabilidad de la tabla VI conserva su sentido (la r entre ondas consecutivas): a = estab_X − b·r, d = estab_Y − c·r.

const mul = (P, Q) => [[P[0][0] * Q[0][0] + P[0][1] * Q[1][0], P[0][0] * Q[0][1] + P[0][1] * Q[1][1]], [P[1][0] * Q[0][0] + P[1][1] * Q[1][0], P[1][0] * Q[0][1] + P[1][1] * Q[1][1]]];
const tr = P => [[P[0][0], P[1][0]], [P[0][1], P[1][1]]];

// La dinámica de una fila: { A, Sigma, Psi, posible, a, d }
export function estructuraPanel({ estabX, estabY, r, cXY, cYX = 0 }) {
    const a = estabX - cYX * r, d = estabY - cXY * r;
    const A = [[a, cYX], [cXY, d]], Sigma = [[1, r], [r, 1]], ASA = mul(mul(A, Sigma), tr(A));
    const Psi = [[1 - ASA[0][0], r - ASA[0][1]], [r - ASA[1][0], 1 - ASA[1][1]]];
    const posible = Psi[0][0] > 1e-6 && Psi[1][1] > 1e-6 && Psi[0][0] * Psi[1][1] - Psi[0][1] * Psi[1][0] > 1e-9;
    return { A, Sigma, Psi, posible, a, d };
}

// Matriz 2×2 de correlaciones entre la onda s y la onda t (s ≥ t): A^(s−t)·Σ; [0][0] = r(X_s, X_t), [0][1] = r(X_s, Y_t),
// [1][0] = r(Y_s, X_t), [1][1] = r(Y_s, Y_t)
export function correlacionEntreOndas(est, s, t) {
    let M = est.Sigma;
    for (let k = 0; k < s - t; k++) M = mul(est.A, M);
    return M;
}

// Propagación de una variable que no se repite: con r(X₁, W) y r(Y₁, W), las de la onda k son A^(k−1)·(r_XW, r_YW)
export function propagarExogena(est, rXW, rYW, k) {
    let v = [rXW, rYW];
    for (let j = 1; j < k; j++) v = [est.A[0][0] * v[0] + est.A[0][1] * v[1], est.A[1][0] * v[0] + est.A[1][1] * v[1]];
    return v;
}

// β tipificados de la regresión de V_{t+1} sobre (V_t, U_t): { propio, cruzado }, con r(V_t, V_{t+1}), r(U_t, V_{t+1}) y r(U_t, V_t)
export function regresionRezagada(rPropio, rCruzado, rMisma) {
    const den = 1 - rMisma * rMisma;
    return { propio: (rPropio - rCruzado * rMisma) / den, cruzado: (rCruzado - rPropio * rMisma) / den };
}

// Qué muestran los dos efectos cruzados estimados (umbral .05 en valor absoluto)
export function fenomenoPanel(tipo, bXY, bYX) {
    const x = Math.abs(bXY), y = Math.abs(bYX);
    if (tipo === 'rezagada' || y < 0.05) return x < 0.05 ? 'ninguna de las dos predice a la otra en la onda siguiente' : 'X precede a Y: predice su onda siguiente más allá de lo que Y ya traía, y no al revés';
    if (x < 0.05) return 'Y precede a X: predice su onda siguiente, y no al revés';
    if (Math.abs(x - y) < 0.05) return 'relación recíproca y equilibrada: cada una predice la onda siguiente de la otra con fuerza parecida';
    return `relación recíproca: cada una predice la onda siguiente de la otra, y domina ${x > y ? 'X → Y' : 'Y → X'}`;
}
