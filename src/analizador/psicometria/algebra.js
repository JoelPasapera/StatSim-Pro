// analizador/psicometria/algebra.js — el álgebra lineal de la psicometría, del núcleo único (core/linalg/): solo
// reexporta, con los nombres que usan sus módulos. (2026.12.25, cierre de la fase F6) Hasta la 2026.12.24 aquí vivían
// Jacobi, la inversa general, el producto, la traspuesta, el factor polar, el suavizado y los log-determinantes.
export { cholesky, inversaDefinidaPositiva, logDeterminante, inversaYLogDet } from '../../core/linalg/cholesky.js';
export { autovaloresSimetrica as eigenSimetrica, suavizarCorrelacion, definidaPositivaCon, factorPolar } from '../../core/linalg/autovalores.js';
export { traspuesta, identidad, multiplicar } from '../../core/linalg/matrices.js';
export { inversaGeneral } from '../../core/linalg/gauss.js';
