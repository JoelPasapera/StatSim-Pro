// @ts-check
// simulador/dominio/simpson.js — la paradoja de Simpson (Atlas de relaciones, ampliación de la fase C; sin DOM ni estado).
// Dentro de los grupos de una variable G, binaria o categórica, X e Y se relacionan con ρ_W, y los grupos difieren d_X y d_Y (d de
// Cohen en DE dentro del grupo, como las diferencias por grupo del Simulador; con más de dos grupos, por unidad de código: la
// diferencia entre grupos consecutivos, una tendencia lineal según su orden). Con v = Var(código de G) (π(1 − π) si es binaria), la r de toda
// la base es r = (ρ_W + v·d_X·d_Y) / √[(1 + v·d_X²)(1 + v·d_Y²)]: la misma descomposición que usa la matriz intermedia del motor
// (r_total = s_X·s_Y·ρ_W + b_XY, con s² = 1/(1 + v·d²) y b = v·d_X·d_Y·s_X·s_Y). Se invierte respecto a ρ_W cuando v·d_X·d_Y
// tiene el signo contrario y supera |ρ_W|.

/**
 * La r de toda la base que implican la r dentro de los grupos y las dos diferencias.
 * @param {{ rDentro: number, dX: number, dY: number, varianzaCodigo: number }} s
 * @returns {number}
 */
export function rTotalSimpson({ rDentro, dX, dY, varianzaCodigo }) {
    const v = varianzaCodigo;
    return (rDentro + v * dX * dY) / Math.sqrt((1 + v * dX * dX) * (1 + v * dY * dY));
}

/**
 * Qué muestran la r dentro de los grupos y la de toda la base (umbrales en valor absoluto).
 * @param {number} rDentro
 * @param {number} rTotal
 * @returns {{ hay: boolean, texto: string }}
 */
export function fenomenoSimpson(rDentro, rTotal) {
    const a = Math.abs(rDentro), b = Math.abs(rTotal);
    if (a >= 0.05 && b >= 0.05 && Math.sign(rDentro) !== Math.sign(rTotal)) return { hay: true, texto: 'la relación se invierte al juntar los grupos: dentro de cada uno va en un sentido y en toda la base en el contrario, porque los grupos difieren en X y en Y (paradoja de Simpson)' };
    if (b < a - 0.1) return { hay: true, texto: 'al juntar los grupos la relación se debilita: las diferencias entre los grupos la ocultan en parte' };
    if (b > a + 0.1) return { hay: true, texto: 'al juntar los grupos la relación se exagera: parte de ella son las diferencias entre los grupos' };
    return { hay: false, texto: 'la relación es parecida dentro de los grupos y en toda la base' };
}
