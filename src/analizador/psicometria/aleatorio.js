// analizador/psicometria/aleatorio.js — generador pseudoaleatorio con semilla (sfc32 de Chris Doty-Humphrey, sembrado
// con la mezcla fmix32 de MurmurHash3), escrito con aritmética de 32 bits: la misma semilla da la misma secuencia en
// cualquier navegador, y el oráculo en Python la reproduce bit a bit. Sirve al bootstrap (remuestras reproducibles).
export function crearAleatorio(semilla = 2026) {
    let s = semilla >>> 0;
    const mezcla = () => {
        s = (s + 0x9e3779b9) >>> 0;
        let z = s;
        z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
        z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
        return (z ^ (z >>> 16)) >>> 0;
    };
    let a = mezcla(), b = mezcla(), c = mezcla(), d = mezcla();
    const siguiente32 = () => {
        let t = (a + b) >>> 0;
        a = (b ^ (b >>> 9)) >>> 0;
        b = (c + (c << 3)) >>> 0;
        c = ((c << 21) | (c >>> 11)) >>> 0;
        d = (d + 1) >>> 0;
        t = (t + d) >>> 0;
        c = (c + t) >>> 0;
        return t;
    };
    for (let i = 0; i < 12; i++) siguiente32();   // se descarta el arranque
    return {
        siguiente32,
        siguiente: () => siguiente32() / 4294967296,              // [0, 1)
        entero: n => Math.floor((siguiente32() / 4294967296) * n)  // {0, …, n − 1}: exacto (≤ 52 bits)
    };
}
