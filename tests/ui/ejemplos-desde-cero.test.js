// @ts-check
// tests/ui/ejemplos-desde-cero.test.js — (2027.01.01, revisión) cada ejemplo de ejemplos/, rehecho desde cero en la página
// (index.html real, sin navegador): su configuración completa (simulador/configuracion_completa_simulador.csv, la que
// descargó la página) se importa como lo hace «Importar TODO», se genera la base y se compara, bit a bit, con la que guarda
// su proyecto. Quien descargue un ejemplo e importe su configuración obtiene exactamente la misma base, con sus categorías y
// sus códigos. Y la configuración que guarda el proyecto (configuracion.csv) es, byte a byte, la descargada.
// La regeneración desde generacion.json, por el Worker, está en tests/integration/ejemplos.test.js; esta es la de quien
// usa la página: la configuración pasa por las tablas del Simulador antes de generar.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearEntorno } from './minidom.js';
import { CASOS } from '../navegador/ejemplos.mjs';
import { leerProyecto } from '../../src/proyecto/paquete.js';
import { baseDesdeArchivos } from '../../src/core/data/base-archivos.js';

const raiz = new URL('../../', import.meta.url);
const ejemplos = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ejemplos');
const presentes = CASOS.filter(c => fs.existsSync(path.join(ejemplos, c, 'proyecto.statsim')));
/** @type {any} */ let env;
/** @type {Record<string, any>} */ const ui = {};
/** @type {any} */ const G = globalThis;
const q = (/** @type {string} */ sel) => env.document.querySelector(sel);
const aviso = () => { const t = env.document.getElementById('toast'); return t ? t.textContent.trim() : ''; };
/** @param {() => any} cond @param {number} [ms] */
const esperar = async (cond, ms = 120000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado'); await new Promise(r => setTimeout(r, 25)); } };
/** Los bytes de una columna, para compararlos. @param {{ datos: Float32Array | Float64Array }} c */
const bytes = c => Buffer.from(c.datos.buffer, c.datos.byteOffset, c.datos.byteLength);

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    G.fetch = () => Promise.reject(new Error('sin red en las pruebas'));
    await import(new URL('src/main.js', raiz).href);
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    for (const m of ['maestro', 'motor']) ui[m] = await import(new URL(`src/simulador/ui/${m}.js`, raiz).href);
});

test('están los cinco ejemplos', () => {
    assert.deepEqual(presentes, CASOS, 'ejemplos/ trae todos los casos de tests/navegador/ejemplos.mjs (rehazlos con «npm run ejemplos»)');
});

for (const caso of presentes) {
    test(`${caso}: su configuración, importada en la página, da bit a bit la base de su proyecto`, async () => {
        const carpeta = path.join(ejemplos, caso);
        const descargada = fs.readFileSync(path.join(carpeta, 'simulador', 'configuracion_completa_simulador.csv'));
        const proyecto = await leerProyecto(new Uint8Array(fs.readFileSync(path.join(carpeta, 'proyecto.statsim'))));
        const sim = proyecto.partes.find((/** @type {any} */ p) => p.seccion === 'simulador');
        assert.ok(Buffer.from(sim.archivos.get('configuracion.csv')).equals(descargada), 'la configuración del proyecto es la descargada');
        const guardada = baseDesdeArchivos(sim.archivos, 'base', { maximoFilas: 1e6 });

        ui.maestro.aplicarMaestro(descargada.toString('utf8'));
        G.generadorDatos.datosGenerados = null;
        ui.motor.generarBaseDatos();
        // si la configuración no pasa la validación, la página no llega a generar (el botón no se desactiva) y lo dice
        assert.ok(q('#btnGenerar').disabled, `la página no empezó a generar: «${aviso()}»`);
        await esperar(() => !q('#btnGenerar').disabled);
        const nueva = G.generadorDatos.datosGenerados;
        assert.ok(nueva, `la página no generó la base: «${aviso()}»`);

        assert.equal(nueva.n, guardada.n, 'los mismos casos');
        assert.deepEqual(nueva.nombres(), guardada.nombres(), 'las mismas columnas, en el mismo orden');
        for (const c of guardada.columnas) {
            const o = nueva.columna(c.nombre);
            assert.equal(o.datos.constructor.name, c.datos.constructor.name, `${c.nombre}: el mismo tipo de columna`);
            assert.ok(bytes(o).equals(bytes(c)), `${c.nombre}: bit a bit`);
            assert.deepEqual(o.etiquetas || null, c.etiquetas || null, `${c.nombre}: las mismas categorías`);
        }
        assert.deepEqual(nueva.codigosDeCategorias(), guardada.codigosDeCategorias(), 'y los mismos códigos');
    });
}
