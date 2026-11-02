// reparto.mjs — (2027.01.19) cuánto gana el grupo de Workers (shared/grupo-workers.js) en este equipo: la imputación múltiple
// (sus cadenas) y la potencia de la mediación por Monte Carlo (sus réplicas), en un hilo y repartidas en P hilos de
// node:worker_threads con las mismas tareas del programa (tareas-psicometricas.js), y que el resultado sea el mismo. Lo cita
// docs/EVALUACION-WASM.md. No es parte de la batería.
//   node tests/rendimiento/reparto.mjs [hilos]
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import { procesar } from '../../src/analizador/psicometria/tareas-psicometricas.js';
import { tramos } from '../../src/shared/grupo-workers.js';
import { sfc32 } from '../../src/core/random/sfc32.js';
import { generadorNormales } from '../../src/core/random/normal.js';

const P = Number(process.argv[2]) || Math.max(2, os.availableParallelism ? os.availableParallelism() : os.cpus().length);
const tareas = new URL('../../src/analizador/psicometria/tareas-psicometricas.js', import.meta.url).href;
const codigo = `import { parentPort } from 'node:worker_threads'; const { procesar } = await import(${JSON.stringify(tareas)});
parentPort.on('message', m => parentPort.postMessage(procesar(m.tipo, m.grupos, m.opciones, null)));`;
const hilos = Array.from({ length: P }, () => new Worker(codigo, { eval: true }));
const enHilo = (/** @type {Worker} */ w, /** @type {any} */ parte) => new Promise(r => { w.once('message', r); w.postMessage(parte); });

// una base de 1000 casos y 8 variables con un 10 % de perdidos
const g = sfc32(11), normal = generadorNormales(g.siguiente), n = 1000, k = 8;
const z = Array.from({ length: n }, () => normal());
const X = Array.from({ length: k }, (_, j) => Float64Array.from(z, v => (g.siguiente() < 0.1 && j > 0 ? NaN : 0.7 * v + 0.7 * normal())));
const opcionesMI = { m: 20, iteraciones: 10, semilla: 2027, metodo: 'pmm' };
const medir = async (/** @type {() => Promise<unknown> | unknown} */ f) => { const t0 = performance.now(); const r = await f(); return { ms: performance.now() - t0, r }; };

await Promise.all(hilos.map(w => enHilo(w, { tipo: 'exitos-mediacion', grupos: [{ clave: 'x', a: 0.3, b: 0.3, cp: 0, n: 50 }], opciones: { desde: 0, hasta: 20 } })));   // calentar
const uno = await medir(() => procesar('imputacion', [{ clave: 'i', columnas: X }], opcionesMI, null)[0].resultado);
const repartido = await medir(async () => (await Promise.all(tramos(20, P).map(([desde, hasta], h) => enHilo(/** @type {Worker} */ (hilos[h]), { tipo: 'imputacion', grupos: [{ clave: 'i', columnas: X }], opciones: { ...opcionesMI, cadenas: Array.from({ length: hasta - desde }, (_, l) => desde + l) } })))).flatMap((/** @type {any} */ x) => x[0].resultado.imputaciones));
const igualesMI = JSON.stringify(/** @type {any} */ (uno.r).imputaciones.map((/** @type {any} */ c) => c.columnas.map((/** @type {Float64Array} */ x) => [...x]))) === JSON.stringify(/** @type {any} */ (repartido.r).map((/** @type {any} */ c) => c.columnas.map((/** @type {Float64Array} */ x) => [...x])));
const R = 4000, rutas = { clave: 'p', a: 0.3, b: 0.3, cp: 0, n: 150 };
const mcUno = await medir(() => procesar('exitos-mediacion', [rutas], { desde: 0, hasta: R }, null)[0].resultado);
const mcRep = await medir(async () => (await Promise.all(tramos(R, P).map(([desde, hasta], h) => enHilo(/** @type {Worker} */ (hilos[h]), { tipo: 'exitos-mediacion', grupos: [rutas], opciones: { desde, hasta } })))).reduce((s, /** @type {any} */ x) => s + x[0].resultado, 0));
await Promise.all(hilos.map(w => w.terminate()));

console.log(`${P} hilos en un equipo de ${os.cpus().length} núcleos (${process.version})\n`);
console.log('| Cálculo | Un hilo (ms) | Repartido (ms) | Aceleración | Mismo resultado |');
console.log('|---|---:|---:|---:|---|');
console.log(`| Imputación múltiple PMM (n = ${n}, ${k} variables, m = 20, 10 iteraciones) | ${uno.ms.toFixed(0)} | ${repartido.ms.toFixed(0)} | ×${(uno.ms / repartido.ms).toFixed(2)} | ${igualesMI ? 'sí, bit a bit' : 'NO'} |`);
console.log(`| Potencia de la mediación (${R} réplicas, n = ${rutas.n}) | ${mcUno.ms.toFixed(0)} | ${mcRep.ms.toFixed(0)} | ×${(mcUno.ms / mcRep.ms).toFixed(2)} | ${mcUno.r === mcRep.r ? `sí (${mcUno.r} éxitos)` : 'NO'} |`);
