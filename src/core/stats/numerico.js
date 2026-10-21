// core/stats/numerico.js — fachada del núcleo numérico ÚNICO del proyecto, escrito desde cero (2026.12.09: antes, analizador/psicometria/numerico.js).
// Capa core (docs/ARQUITECTURA.md): sin DOM y sin importar de fuera de core; cualquier sección lo usa.
// El Simulador, el Analizador y el Buscador toman de aquí sus distribuciones: antes había hasta seis copias de la misma (la CDF
// normal, en diez sitios). Un banco contra SciPy mostró que coincidían a efectos prácticos, pero con trampas latentes (una Φ que
// fallaba con argumentos negativos, una cola de la χ² que se iba a 0 con p < 1e−15) y obligaba a corregir cada cosa en seis sitios.
// Cada función está verificada contra SciPy en tests/oracle (sin dependencias en el sitio).
// (2026.12.12) Dividido por responsabilidades; este archivo solo reexporta, para que sus importaciones sigan valiendo:
//   normal.js         Φ, su inversa, las colas, la densidad y la normal bivariada
//   especiales.js     lnΓ, gamma y beta incompletas
//   distribuciones.js χ², F y t, con sus colas sin restar y sus inversas
//   optimizacion.js   Brent: máximo y raíz
export * from './normal.js';
export * from './especiales.js';
export * from './distribuciones.js';
export * from './optimizacion.js';
