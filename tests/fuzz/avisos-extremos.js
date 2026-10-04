// tests/fuzz/avisos-extremos.js — avisos de la validación que declaran una configuración EXTREMA (un objetivo inalcanzable o
// recortado): con ellos, el fuzz no exige que el informe se cumpla en modo exacto. Depende de la redacción de los avisos, así que
// la comparte una prueba unitaria (tests/unit/avisos-extremos.test.js) que falla si un aviso deja de coincidir. Revisión de la
// fase D: la expresión buscaba «no es alcanzable» y el aviso de fiabilidad dice «no será alcanzable»; lo tapaba, por accidente,
// la palabra «demasiado» del viejo aviso de discreción, reescrito en la 2026.11.17.
export const AVISO_EXTREMO = /demasiado|no (?:es|será) alcanzable|se llevan|recort|imposible|no cabe|mínimo|tope/i;
