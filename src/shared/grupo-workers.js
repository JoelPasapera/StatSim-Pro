// @ts-check
// shared/grupo-workers.js — (2027.01.19) un grupo de Workers para repartir un cálculo en partes independientes (las cadenas
// de la imputación múltiple, los tramos de réplicas de un Monte Carlo): cada parte va al primer Worker libre, en el orden en
// que llegó; los Workers se crean al hacer falta (hasta `tamano`) y se reutilizan. Varios cálculos pueden compartir el grupo:
// cancelar uno quita sus partes de la cola y termina solo los Workers que las calculaban (los demás siguen). Si un Worker no
// puede cargarse o se rompe, su parte se calcula con `respaldo` en el hilo principal (sin perder el resto) y el grupo no
// crea más; si no queda ninguno, la cola entera va al respaldo. El protocolo, el de psicometria.worker.js: el mensaje
// { id, tipo, grupos, opciones } y las respuestas { id, tipo: 'progreso', hecho, total }, { id, tipo: 'fin', res } y
// { id, tipo: 'error', mensaje }. Sin dependencias del resto del programa.
// (2027.01.20, revisión) Un mensaje que no se puede enviar (datos que no se clonan) lleva su parte al respaldo, en lugar de
// lanzar dentro del reparto; terminar() cancela también las llamadas cuyas partes esperaban en el respaldo (antes, esas se
// calculaban después de terminar), y con uno o dos núcleos se usan todos (la página solo espera).

/** @typedef {{ tipo: string, grupos: object[], opciones: object }} Parte */
/**
 * @typedef {{ id: number, parte: Parte, indice: number, llamada: Llamada, ranura: Ranura | null }} Pendiente
 * @typedef {{ w: Worker, pendiente: Pendiente | null }} Ranura
 * @typedef {{ resultados: unknown[], faltan: number, resolver: (r: unknown[]) => void, rechazar: (e: unknown) => void,
 *   alProgreso: ((indice: number, hecho: number, total: number) => void) | null, terminada: boolean }} Llamada
 */

const cancelacion = () => Object.assign(new Error('Cálculo cancelado'), { cancelado: true });

/**
 * Un grupo de Workers.
 * @param {() => Worker | null} crear la fábrica (null o una excepción si no hay Workers)
 * @param {number} tamano cuántos Workers a la vez, como mucho
 * @param {(parte: Parte, alProgreso: (hecho: number, total: number) => void) => unknown} respaldo el mismo cálculo en el
 *   hilo principal
 */
export function crearGrupoWorkers(crear, tamano, respaldo) {
    /** @type {Ranura[]} */ const ranuras = [];
    /** @type {Pendiente[]} */ const cola = [];
    /** @type {Set<Llamada>} las llamadas en curso */ const enCurso = new Set();
    let secuencia = 0, sinWorkers = false;

    /** Una parte terminada (o fallida) de una llamada. @param {Pendiente} p @param {boolean} ok @param {unknown} valor */
    const cerrar = (p, ok, valor) => {
        const ll = p.llamada;
        if (ll.terminada) return;
        if (!ok) { ll.terminada = true; enCurso.delete(ll); cancelarLlamada(ll, false); ll.rechazar(valor); return; }
        ll.resultados[p.indice] = valor;
        if (--ll.faltan === 0) { ll.terminada = true; enCurso.delete(ll); ll.resolver(ll.resultados); }
    };

    /** La parte, en el hilo principal (en un turno aparte, para no bloquear quien la pidió). @param {Pendiente} p */
    const enRespaldo = p => setTimeout(() => {
        if (p.llamada.terminada) return;
        try { cerrar(p, true, respaldo(p.parte, (h, t) => { if (p.llamada.alProgreso) p.llamada.alProgreso(p.indice, h, t); })); }
        catch (e) { cerrar(p, false, e); }
    }, 0);

    /** Quita una ranura del grupo y termina su Worker. @param {Ranura} r */
    const quitar = r => {
        const k = ranuras.indexOf(r);
        if (k >= 0) ranuras.splice(k, 1);
        try { r.w.terminate(); } catch (_) { /* ya terminado */ }
    };

    /** Un Worker nuevo con sus manejadores, o null. */
    const nueva = () => {
        if (sinWorkers) return null;
        /** @type {Worker | null} */ let w = null;
        try { w = crear(); } catch (_) { w = null; }
        if (!w) { sinWorkers = true; return null; }
        /** @type {Ranura} */ const r = { w, pendiente: null };
        w.onmessage = ({ data }) => {
            const p = r.pendiente;
            if (!p || data.id !== p.id) return;
            if (data.tipo === 'progreso') { if (p.llamada.alProgreso) p.llamada.alProgreso(p.indice, data.hecho, data.total); return; }
            r.pendiente = null;
            if (data.tipo === 'fin') cerrar(p, true, data.res); else cerrar(p, false, new Error(data.mensaje));
            despachar();
        };
        w.onerror = e => {
            // no pudo cargarse o se rompió: su parte, al hilo principal; el grupo no crea más Workers
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            sinWorkers = true;
            const p = r.pendiente;
            r.pendiente = null;
            quitar(r);
            if (p && !p.llamada.terminada) { p.ranura = null; enRespaldo(p); }
            despachar();
        };
        ranuras.push(r);
        return r;
    };

    /** Reparte la cola entre los Workers libres (y crea los que falten). */
    function despachar() {
        while (cola.length) {
            const r = ranuras.find(x => !x.pendiente) || (ranuras.length < tamano ? nueva() : null);
            if (!r) break;
            const p = /** @type {Pendiente} */ (cola.shift());
            r.pendiente = p; p.ranura = r;
            // un mensaje que no se puede enviar (unos datos que no se clonan): esa parte, al hilo principal; el Worker sigue libre
            try { r.w.postMessage({ id: p.id, tipo: p.parte.tipo, grupos: p.parte.grupos, opciones: p.parte.opciones }); }
            catch (_) { r.pendiente = null; p.ranura = null; enRespaldo(p); }
        }
        // sin ningún Worker vivo (y sin poder crearlos), la cola va al hilo principal
        if (cola.length && !ranuras.length && sinWorkers) for (const p of cola.splice(0)) enRespaldo(p);
    }

    /** Quita de la cola las partes de una llamada y termina los Workers que calculan las suyas. @param {Llamada} ll @param {boolean} rechazar */
    function cancelarLlamada(ll, rechazar) {
        for (let k = cola.length - 1; k >= 0; k--) if (/** @type {Pendiente} */ (cola[k]).llamada === ll) cola.splice(k, 1);
        for (const r of [...ranuras]) if (r.pendiente && r.pendiente.llamada === ll) { r.pendiente = null; quitar(r); }
        if (rechazar && !ll.terminada) { ll.terminada = true; enCurso.delete(ll); ll.rechazar(cancelacion()); }
        despachar();
    }

    return {
        /** El número de Workers a la vez. */
        tamano,
        /**
         * Calcula unas partes y devuelve sus resultados en su orden.
         * @param {Parte[]} partes
         * @param {((indice: number, hecho: number, total: number) => void) | null} [alProgreso] el de cada parte
         * @returns {{ promesa: Promise<unknown[]>, cancelar: () => void }}
         */
        ejecutar(partes, alProgreso = null) {
            /** @type {Llamada} */ let ll = /** @type {any} */ (null);
            const promesa = new Promise((resolver, rechazar) => { ll = { resultados: new Array(partes.length), faltan: partes.length, resolver, rechazar, alProgreso, terminada: false }; });
            if (!partes.length) { ll.terminada = true; ll.resolver([]); return { promesa, cancelar: () => {} }; }
            enCurso.add(ll);
            partes.forEach((parte, indice) => cola.push({ id: ++secuencia, parte, indice, llamada: ll, ranura: null }));
            despachar();
            return { promesa, cancelar: () => cancelarLlamada(ll, true) };
        },
        /** Termina todos los Workers: las llamadas en curso se cancelan, también las que esperaban en el respaldo. */
        terminar() {
            cola.splice(0);
            for (const r of [...ranuras]) { r.pendiente = null; quitar(r); }
            for (const ll of [...enCurso]) { enCurso.delete(ll); if (!ll.terminada) { ll.terminada = true; ll.rechazar(cancelacion()); } }
        },
        /** Cuántos Workers vivos hay (para las pruebas). */
        vivos: () => ranuras.length
    };
}

/**
 * Cuántos Workers usar para un cálculo repartido: con uno o dos núcleos, todos (la página solo espera el resultado); con más,
 * los núcleos menos uno (el de la página), hasta 8.
 * @param {number | undefined} nucleos navigator.hardwareConcurrency
 */
export function tamanoGrupo(nucleos) {
    const n = Number.isFinite(nucleos) && /** @type {number} */ (nucleos) >= 1 ? Math.floor(/** @type {number} */ (nucleos)) : 2;
    return n <= 2 ? n : Math.min(8, n - 1);
}

/**
 * Los tramos [desde, hasta) en que se reparten `total` unidades entre `partes` partes, lo más iguales posible.
 * @param {number} total
 * @param {number} partes
 * @returns {[number, number][]}
 */
export function tramos(total, partes) {
    const k = Math.max(1, Math.min(partes, total)), base = Math.floor(total / k), resto = total % k, salida = [];
    let desde = 0;
    for (let i = 0; i < k; i++) { const hasta = desde + base + (i < resto ? 1 : 0); salida.push(/** @type {[number, number]} */ ([desde, hasta])); desde = hasta; }
    return salida;
}
