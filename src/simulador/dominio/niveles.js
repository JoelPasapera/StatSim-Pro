// simulador/dominio/niveles.js — relación entre personas y dentro de la persona (Atlas de relaciones, fase D; sin DOM ni
// estado). Con medidas repetidas de X e Y según el modelo de interceptos aleatorios, cada puntuación es el nivel propio de la
// persona (varianza ICC, la estabilidad) más una fluctuación de la onda (varianza 1 − ICC). La relación existe en dos niveles
// que pueden no parecerse (ni en el signo):
//   entre personas (ρ_B): la de sus niveles propios; dentro de la persona (ρ_W): la de sus fluctuaciones de onda a onda.
// En una misma onda, r = ρ_B·√(ICC_X·ICC_Y) + ρ_W·√((1 − ICC_X)(1 − ICC_Y)); entre ondas distintas solo queda la parte entre
// personas, ρ_B·√(ICC_X·ICC_Y). La matriz de todas las ondas se separa en esos dos niveles, así que es posible para cualquier
// ρ_B y ρ_W en (−1, 1).

// Las dos correlaciones que fija una pareja: en la misma onda y entre ondas distintas
export function estructuraNiveles({ iccX, iccY, rEntre, rDentro }) {
    const entre = rEntre * Math.sqrt(iccX * iccY);
    return { rMisma: entre + rDentro * Math.sqrt((1 - iccX) * (1 - iccY)), rCruzada: entre };
}

// Lo que se observa con K ondas (y la misma DE en todas): la r de las medias de cada persona, que tiende a ρ_B cuando K crece
// (con pocas ondas, la media arrastra fluctuaciones), y la r dentro de la persona (centrada en la persona y en la onda), ρ_W
export function esperadoNiveles(K, nivel) {
    const { rMisma, rCruzada } = estructuraNiveles(nivel);
    const rMedias = (rMisma + (K - 1) * rCruzada) / Math.sqrt((1 + (K - 1) * nivel.iccX) * (1 + (K - 1) * nivel.iccY));
    return { rMisma, rCruzada, rMedias, rEntre: nivel.rEntre, rDentro: nivel.rDentro };
}

// Qué muestran la r entre personas y la r dentro de la persona (umbrales en valor absoluto)
export function fenomenoNiveles(rEntre, rDentro) {
    const a = Math.abs(rEntre), b = Math.abs(rDentro);
    if (a >= 0.1 && b >= 0.1 && Math.sign(rEntre) !== Math.sign(rDentro)) return 'la relación cambia de signo según el nivel: lo que vale entre personas no vale dentro de cada persona (concluir sobre un nivel a partir del otro sería una falacia de nivel)';
    if (a - b >= 0.15) return 'la relación es sobre todo entre personas: dentro de cada persona, X e Y apenas se mueven juntas';
    if (b - a >= 0.15) return 'la relación es sobre todo dentro de la persona: entre personas apenas se ve';
    return 'la relación es parecida en los dos niveles';
}
