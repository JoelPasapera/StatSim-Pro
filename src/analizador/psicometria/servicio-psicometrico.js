// analizador/psicometria/servicio-psicometrico.js — puerta única del hilo principal a las tareas pesadas de la psicometría.
// Con Worker: se ejecutan en segundo plano, con progreso y cancelación (terminar el Worker es inmediato). Sin Worker
// (navegadores muy antiguos, pruebas en Node): el mismo cálculo en el hilo principal, en un turno aparte.
import { procesar } from './tareas-psicometricas.js';
import { crearGrupoWorkers, tamanoGrupo, tramos } from '../../shared/grupo-workers.js';
import { potenciaDeExitos, tamanoMuestraMediacionAsincrono } from '../../core/stats/potencia-mediacion.js';

// Un Worker por canal: el AFE no espera a que termine un bootstrap de la fiabilidad (ni al revés) y cancelar uno no
// corta el otro. sinWorker: un Worker falló una vez; desde entonces todo va al hilo principal.
const workers = new Map(), tareas = new Map();
let secuencia = 0, sinWorker = false;
const canalDe = tipo => (tipo === 'dif' ? 'tri' : ['afe', 'invarianza', 'forma', 'mediacion', 'tri'].includes(tipo) ? tipo : 'fiabilidad');   // (2026.10.19) canal propio para la invarianza; (2027.01.17) y para la mediación; (2027.01.19) y para la TRI (la imputación y la potencia por Monte Carlo, desde la 2027.01.19, en el grupo de Workers de más abajo); (2027.01.20) el DIF, en el de la TRI

function crearWorker(canal) {
    if (typeof Worker === 'undefined' || typeof URL === 'undefined') return null;
    try {
        const w = new Worker(new URL('./psicometria.worker.js', import.meta.url), { type: 'module', name: 'psicometria-' + canal });
        w.onmessage = ({ data }) => {
            const t = tareas.get(data.id);
            if (!t || t.canal !== canal) return;
            if (data.tipo === 'progreso') { if (t.alProgreso) t.alProgreso(data.hecho, data.total); return; }
            tareas.delete(data.id);
            if (data.tipo === 'fin') t.resolver(data.res); else t.rechazar(new Error(data.mensaje));
        };
        w.onerror = e => {
            // el Worker no pudo cargarse o se rompió: sus tareas se terminan en el hilo principal, sin perder el trabajo
            sinWorker = true;
            console.warn('Cálculo en segundo plano no disponible; se usa el hilo principal:', (e && e.message) || e);
            for (const [id, t] of tareas) {
                if (t.canal !== canal) continue;
                tareas.delete(id);
                setTimeout(() => { try { t.resolver(procesar(t.tipo, t.grupos, t.opciones, t.alProgreso)); } catch (err) { t.rechazar(err); } }, 0);
            }
            try { w.terminate(); } catch (_) { /* ya terminado */ }
            if (workers.get(canal) === w) workers.delete(canal);
        };
        return w;
    } catch (e) { return null; }
}

function workerDe(canal) {
    if (sinWorker) return null;
    if (!workers.has(canal)) { const w = crearWorker(canal); if (!w) return null; workers.set(canal, w); }
    return workers.get(canal);
}
export function hayWorker(canal = 'fiabilidad') { return !!workerDe(canal); }

const cancelacion = () => Object.assign(new Error('Cálculo cancelado'), { cancelado: true });

// (2027.01.19) El grupo de Workers de los cálculos que se reparten en partes independientes (la imputación múltiple, la
// potencia de la mediación por Monte Carlo): uno por núcleo del equipo menos el de la página. Sin Workers (o si fallan),
// las partes se calculan en el hilo principal, con el mismo resultado.
let grupo = null;
function crearWorkerDeReparto() {
    if (sinWorker || typeof Worker === 'undefined' || typeof URL === 'undefined') return null;
    return new Worker(new URL('./psicometria.worker.js', import.meta.url), { type: 'module', name: 'psicometria-reparto' });
}
function grupoDeReparto() {
    if (!grupo) grupo = crearGrupoWorkers(crearWorkerDeReparto, tamanoGrupo(typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined), (parte, alProgreso) => procesar(parte.tipo, parte.grupos, parte.opciones, alProgreso));
    return grupo;
}
/** Cuántas partes, por defecto, tiene un cálculo repartido: una por Worker del grupo. */
export function partesPorDefecto() { return grupoDeReparto().tamano; }

/**
 * (2027.01.19) La imputación múltiple repartida: sus m cadenas, en tramos consecutivos, cada tramo en un Worker. Como cada
 * cadena tiene su generador, el resultado es el mismo que el de imputarPMM con todas.
 * @param {ArrayLike<number>[]} X las columnas (NaN donde falta)
 * @param {{ m: number, iteraciones: number, semilla: number, metodo: 'pmm' | 'norm', donantes?: number }} opciones
 * @param {((hecho: number, total: number) => void) | null} [alProgreso] en iteraciones de todas las cadenas
 * @param {{ partes?: number }} [reparto]
 * @returns {{ promesa: Promise<ReturnType<typeof import('../../core/stats/imputacion.js').imputarPMM>>, cancelar: () => void }}
 */
export function imputarRepartido(X, opciones, alProgreso = null, { partes = partesPorDefecto() } = {}) {
    const bloques = tramos(opciones.m, partes), total = opciones.m * opciones.iteraciones, hechos = new Array(bloques.length).fill(0);
    const llamada = grupoDeReparto().ejecutar(bloques.map(([desde, hasta]) => ({ tipo: 'imputacion', grupos: [{ clave: 'imputacion', columnas: X }], opciones: { ...opciones, cadenas: Array.from({ length: hasta - desde }, (_, l) => desde + l) } })),
        alProgreso ? (k, h) => { hechos[k] = h; alProgreso(hechos.reduce((s, v) => s + v, 0), total); } : null);
    const promesa = llamada.promesa.then(lista => {
        const r = lista.map(x => x[0].resultado), primero = r[0];
        return { ...primero, imputaciones: r.flatMap(x => x.imputaciones), traza: r.flatMap(x => x.traza), m: opciones.m };
    });
    return { promesa, cancelar: llamada.cancelar };
}

/**
 * (2027.01.19) La potencia de la mediación simple por Monte Carlo, repartida: con un n, sus R réplicas en tramos, cada uno en
 * un Worker; sin n (0), el tamaño de muestra, con cada potencia de la búsqueda calculada así. Mismos resultados que
 * potenciaMediacion y tamanoMuestraMediacion.
 * @param {{ a: number, b: number, cp: number, n: number }} rutas
 * @param {{ R: number, alfa: number, semilla: number, potenciaDeseada: number }} opciones
 * @param {((hecho: number, total: number) => void) | null} [alProgreso] con n, en réplicas; sin n, en tamaños probados
 * @param {{ partes?: number }} [reparto]
 * @returns {{ promesa: Promise<{ n?: number, potencia: number, ee: number, R: number } | null>, cancelar: () => void }}
 */
export function potenciaMediacionRepartida({ a, b, cp, n }, opciones, alProgreso = null, { partes = partesPorDefecto() } = {}) {
    const { R, alfa, semilla } = opciones;
    let actual = null, cancelado = false;
    /** La potencia con m casos: sus réplicas repartidas. */
    const potenciaEn = (m, conProgreso) => {
        if (cancelado) return Promise.reject(cancelacion());
        const bloques = tramos(R, partes), hechos = new Array(bloques.length).fill(0);
        actual = grupoDeReparto().ejecutar(bloques.map(([desde, hasta]) => ({ tipo: 'exitos-mediacion', grupos: [{ clave: 'exitos', a, b, cp, n: m }], opciones: { desde, hasta, alfa, semilla } })),
            conProgreso ? (k, h) => { hechos[k] = h; conProgreso(hechos.reduce((s, v) => s + v, 0), R); } : null);
        return actual.promesa.then(lista => potenciaDeExitos(lista.reduce((s, x) => s + x[0].resultado, 0), R));
    };
    const promesa = n
        ? potenciaEn(n, alProgreso)
        : tamanoMuestraMediacionAsincrono(a, b, cp, m => potenciaEn(m, null), { potenciaDeseada: opciones.potenciaDeseada, alProgreso });
    return { promesa, cancelar: () => { cancelado = true; if (actual) actual.cancelar(); } };
}

// → { promesa, cancelar }
export function ejecutarTarea(tipo, grupos, opciones = {}, alProgreso = null) {
    const id = ++secuencia, canal = canalDe(tipo), w = workerDe(canal);
    if (w) {
        let cancelar = () => {};
        const promesa = new Promise((resolver, rechazar) => {
            tareas.set(id, { resolver, rechazar, alProgreso, tipo, grupos, opciones, canal });
            w.postMessage({ id, tipo, grupos, opciones });
            cancelar = () => {
                if (!tareas.has(id)) return;
                for (const [otra, t] of tareas) if (t.canal === canal) { tareas.delete(otra); if (otra !== id) t.rechazar(cancelacion()); }   // solo las de su canal
                w.terminate(); workers.delete(canal);
                rechazar(cancelacion());
            };
        });
        return { promesa, cancelar };
    }
    let cancelado = false;
    const promesa = new Promise((resolver, rechazar) => setTimeout(() => {
        if (cancelado) { rechazar(cancelacion()); return; }
        try { resolver(procesar(tipo, grupos, opciones, alProgreso)); } catch (e) { rechazar(e); }
    }, 0));
    return { promesa, cancelar: () => { cancelado = true; } };
}
