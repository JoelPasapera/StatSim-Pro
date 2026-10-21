// @ts-check
// tests/solo-completa.js — pruebas lentas (más de ~2 s: Monte Carlo, bases grandes, círculos cerrados extensos) que la batería
// rápida (npm test) omite y la completa (npm run test:completo) ejecuta. La completa es la que se pasa antes de cada entrega;
// el ejecutor (tests/run.js) fija STATSIM_TEST=completo para sus procesos hijos. Para una prueba suelta en el modo completo:
// STATSIM_TEST=completo node --test <archivo>.

/** Opción `skip` de node:test: false en la batería completa; en la rápida, el motivo de la omisión. */
export const soloCompleta = process.env.STATSIM_TEST === 'completo' ? false : 'solo en la batería completa (npm run test:completo)';
