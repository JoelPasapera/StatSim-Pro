// simulador/dominio/terceras.js — terceras variables (Atlas de relaciones, fase C; sin DOM ni estado).
// Tres fenómenos en los que una tercera variable Z cambia lo que se ve de la relación entre X e Y:
//   confusión:    Z causa X e Y. La r de orden cero incluye lo que pasa por Z; la relación VERDADERA es la parcial.
//   supresión:    Z se relaciona con X (y poco o nada con Y). Controlarla limpia a X de lo que no predice Y: la relación
//                 verdadera, la parcial, es MAYOR que la de orden cero.
//   colisionador: X e Y causan Z (efecto común). La verdadera es la de orden cero; controlar Z CREA una relación que no
//                 existe (sesgo del colisionador; seleccionando por Z, la paradoja de Berkson).
// Parámetros de la fila (sección V): c1 = r(Z, X), c2 = r(Z, Y), c3 = la relación VERDADERA de X con Y (la parcial en la
// confusión y la supresión; la de orden cero en el colisionador). Con la parcial como parámetro, cualquier c1, c2, c3 en
// (−1, 1) da una matriz definida positiva; en el colisionador la parcial se deduce y hay que comprobarlo.

export const TIPOS_TERCERA = Object.freeze({
    confusion: Object.freeze({ etiqueta: 'Confusión', verdadera: 'parcial' }),
    supresion: Object.freeze({ etiqueta: 'Supresión', verdadera: 'parcial' }),
    colisionador: Object.freeze({ etiqueta: 'Colisionador', verdadera: 'cero' })
});

export const esTerceraVariable = tipo => Object.prototype.hasOwnProperty.call(TIPOS_TERCERA, tipo);

// r parcial de X e Y controlando Z
export function parcialDe(rXY, rXZ, rYZ) {
    const k = Math.sqrt((1 - rXZ * rXZ) * (1 - rYZ * rYZ));
    return k > 0 ? (rXY - rXZ * rYZ) / k : NaN;
}

// β estandarizado de X en la regresión de Y sobre X y Z
export const betaControlado = (rXY, rXZ, rYZ) => (rXY - rYZ * rXZ) / (1 - rXZ * rXZ);

// Las tres correlaciones y la parcial que implica una fila: { rXZ, rYZ, rXY, parcial, posible }
export function estructuraTercera({ tipo, c1, c2, c3 }) {
    const k = Math.sqrt((1 - c1 * c1) * (1 - c2 * c2));
    if (TIPOS_TERCERA[tipo].verdadera === 'parcial') return { rXZ: c1, rYZ: c2, rXY: c3 * k + c1 * c2, parcial: c3, posible: true };
    const parcial = (c3 - c1 * c2) / k;
    return { rXZ: c1, rYZ: c2, rXY: c3, parcial, posible: Math.abs(parcial) < 0.99 };
}

// ¿Muestran las dos r el fenómeno? Confusión: la relación se reduce al controlar Z; supresión: crece; colisionador: cambia
// (aparece) al controlar Z. Umbral de .05 en valor absoluto. Devuelve { hay, texto } (el texto, sin las cifras).
export function fenomenoTercera(tipo, rXY, parcial) {
    const a = Math.abs(rXY), b = Math.abs(parcial), invierte = a >= 0.05 && b >= 0.05 && Math.sign(rXY) !== Math.sign(parcial);
    if (tipo === 'confusion') {
        const hay = b < a - 0.05;
        return { hay, texto: hay ? (b < 0.05 ? 'la relación era espuria: se debía a Z' : invierte ? 'la relación se invierte al controlar Z: la de orden cero se debía sobre todo a Z' : 'parte de la relación se debía a Z') : 'Z apenas confunde: controlarla no reduce la relación' };
    }
    if (tipo === 'supresion') {
        const hay = b > a + 0.05;
        return { hay, texto: hay ? (invierte ? 'controlar Z invierte la relación y la hace más fuerte (supresión negativa)' : 'Z ocultaba parte de la relación: controlarla la aumenta') : 'no hay supresión: controlar Z no aumenta la relación' };
    }
    const hay = Math.abs(parcial - rXY) > 0.05;
    return { hay, texto: hay ? 'controlar el efecto común cambia la relación: la diferencia es un sesgo, no un efecto' : 'controlar Z apenas cambia la relación' };
}
