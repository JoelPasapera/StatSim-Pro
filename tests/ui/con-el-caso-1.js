// @ts-check
// tests/ui/con-el-caso-1.js — (2027.01.05) el Analizador sobre index.html real con la base del caso 1 de ejemplos/ y su
// correlación (la del paso 3: General_EE y General_EB, con el título, la unidad y el lugar del caso), como la deja el caso.
// Lo comparten las pruebas de interfaz que miran lo que queda en la página tras un análisis de verdad
// (ronda-2027-01-04.test.js, ronda-2027-01-05.test.js). Sin Worker: los cálculos de la psicometría van al hilo principal.
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';
import { MAESTRO as MAESTRO_CORRELACIONAL } from '../navegador/recetas/01-correlacional.mjs';

const raiz = new URL('../../', import.meta.url);
/** @type {any} */ const G = globalThis;

/** Espera a que se cumpla una condición. @param {() => any} cond */
export const esperar = async (cond, ms = 20000) => {
    const t0 = Date.now();
    while (!cond()) {
        if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado');
        await new Promise(r => setTimeout(r, 25));
    }
};

/**
 * Elige el tipo de análisis y sus dos variables, como la persona (sin pulsar «Analizar»).
 * @param {any} env el de crearEntorno
 * @param {string} tipo 'correlacion' | 'comparacion' | 'asociacion'
 * @param {string} v1
 * @param {string} v2
 */
export function elegirAnalisis(env, tipo, v1, v2) {
    const q = (/** @type {string} */ s) => env.document.querySelector(s);
    for (const r of env.document.querySelectorAll('input[name="tipoAnalisis"]')) r.checked = r.value === tipo;
    env.disparar(q(`input[name="tipoAnalisis"][value="${tipo}"]`), 'change');
    q('#variable1').value = v1;
    q('#variable2').value = v2;
}

/**
 * La página con la base del caso 1 en el Analizador y su correlación hecha (hasta su discusión a la vista).
 * @returns {Promise<{ env: any, ui: Record<string, any> }>} ui: los módulos de la interfaz que usan las pruebas (maestro, motor,
 *   analisis, carga, sociodemografica, resultados), A (AnalizadorEstadistico) y textoParaExportar
 */
export async function analizadorConElCaso1() {
    const env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    /** @type {Record<string, any>} */
    const ui = {};
    const q = (/** @type {string} */ s) => env.document.querySelector(s);
    env.document.readyState = 'interactive';
    G.fetch = () => Promise.reject(new Error('sin red en las pruebas'));
    await import(new URL('src/main.js', raiz).href);
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    for (const m of ['maestro', 'motor']) ui[m] = await import(new URL(`src/simulador/ui/${m}.js`, raiz).href);
    for (const m of ['analisis', 'carga', 'sociodemografica', 'resultados']) ui[m] = await import(new URL(`src/analizador/ui/${m}.js`, raiz).href);
    ({ AnalizadorEstadistico: ui.A } = await import(new URL('src/analizador/estadistica.js', raiz).href));
    ({ textoParaExportar: ui.textoParaExportar } = await import(new URL('src/shared/texto-exportable.js', raiz).href));
    // la base del caso 1 y su correlación, como en el caso (paso 3: General_EE y General_EB)
    ui.maestro.aplicarMaestro(MAESTRO_CORRELACIONAL);
    G.generadorDatos.datosGenerados = null;
    ui.motor.generarBaseDatos();
    await esperar(() => !q('#btnGenerar').disabled && G.generadorDatos.datosGenerados && G.generadorDatos.datosGenerados.n > 0);
    for (const s of env.document.querySelectorAll('main .section')) s.classList.toggle('active', s.id === 'analizador');
    ui.carga.cargarDatosGenerados();
    ui.carga.poblarSelectsVariables(ui.A.obtenerDatos());
    q('#tituloTesis').value = 'Estrés académico y bienestar psicológico';
    q('#unidadAnalisis').value = 'estudiantes universitarios'; q('#lugarContexto').value = 'Lima Metropolitana';
    elegirAnalisis(env, 'correlacion', 'General_EE', 'General_EB');
    ui.analisis.ejecutarAnalisis();
    await esperar(() => !q('#btnAnalizar').disabled && q('#resultadosDiscusion .discussion-box'));
    return { env, ui };
}
