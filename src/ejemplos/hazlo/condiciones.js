// @ts-check
// ejemplos/hazlo/condiciones.js — (2027.01.03) lo que se espera entre un paso y el siguiente de un guion (planes.js): que la
// página diga que terminó un análisis, que una tarjeta muestre sus resultados, que el SEM acabe de estimar… Cada condición
// es una función que mira la página y dice si ya se cumple, sin nada de fuera (solo `document` y su argumento): así sirve
// tal cual en la página (conductor.js, que la consulta cada poco) y en Chromium (tests/navegador/conductor.mjs, que se la
// pasa a Playwright, que la copia a la página por su texto). Y, cumplida, VEREDICTO dice si salió bien y lo que dijo la
// página (el mismo juicio en los dos).

/**
 * @typedef {'aviso' | 'conTexto' | 'conTextoOAviso' | 'semListo' | 'resultados' | 'calculado' | 'habilitado' | 'sinPendientes' | 'conLaBaseDelSimulador'} NombreDeCondicion
 */

/** @type {Record<NombreDeCondicion, (arg: any) => boolean>} */
export const CONDICIONES = {
    /** El aviso emergente (#toast) dice algo que encaja con un patrón ([fuente, banderas]), o es un aviso de error. */
    aviso: ([fuente, banderas]) => {
        const t = document.getElementById('toast');
        const texto = t ? t.textContent || '' : '';
        return !!t && (new RegExp(fuente, banderas).test(texto) || (t.classList.contains('error') && texto.trim().length > 0));
    },
    /** Un elemento (por su id) con algo de texto. */
    conTexto: id => ((document.getElementById(id) || {}).textContent || '').trim().length > 0,
    /** Un elemento con algo de texto, o el aviso de su tarjeta («⚠️ …», como el de «Comparar grupos»): [elemento, aviso]. */
    conTextoOAviso: ([id, estado]) => ((document.getElementById(id) || {}).textContent || '').trim().length > 0
        || /^\s*⚠️/.test((document.getElementById(estado) || {}).textContent || ''),
    /** El SEM terminó de estimar: su salida tiene texto y ya no dice «Estimando…». */
    semListo: () => {
        const t = ((document.getElementById('semOut') || {}).textContent || '').trim();
        return t.length > 0 && !/^Estimando/.test(t);
    },
    /** Una tarjeta de psicometría con sus resultados a la vista, o un error en sus mensajes (su recuadro de errores): [resultados, mensajes]. */
    resultados: ([r, m]) => {
        const res = document.getElementById(r), men = document.getElementById(m);
        return (!!res && !res.hidden && (res.textContent || '').trim().length > 0)
            || (!!men && (!!men.querySelector('.aiken-errores') || /error|no se pud|no hay|falta/i.test(men.textContent || '')));
    },
    /**
     * Una tarjeta que calcula en segundo plano (el AFE, la invarianza) terminó: su botón, que el clic desactiva, vuelve a estar
     * libre, y hay resultados o mensajes (un error, «Cálculo cancelado»): [resultados, mensajes, botón].
     */
    calculado: ([r, m, b]) => {
        const boton = /** @type {HTMLButtonElement | null} */ (document.getElementById(b));
        const res = document.getElementById(r), men = document.getElementById(m);
        return !!boton && !boton.disabled && ((!!res && !res.hidden && (res.textContent || '').trim().length > 0) || (!!men && (men.textContent || '').trim().length > 0));
    },
    /** Un botón (por su id) que ya se puede pulsar. */
    habilitado: id => {
        const b = /** @type {HTMLButtonElement | null} */ (document.getElementById(id));
        return !!b && !b.disabled;
    },
    /** Sin cálculos en segundo plano: el α y el ω ordinales de la fiabilidad, que llegan del Worker después. */
    sinPendientes: () => {
        const cuerpo = /** @type {HTMLElement} */ (document.body);
        const texto = typeof cuerpo.innerText === 'string' ? cuerpo.innerText : cuerpo.textContent || '';
        return !document.querySelector('.calculando') && !/Esperando los coeficientes ordinales/.test(texto);
    },
    /** El Analizador con la base del Simulador cargada: su contador de casos (#analisisN) dice los de la base. */
    conLaBaseDelSimulador: () => {
        const g = /** @type {any} */ (window).generadorDatos;
        return !!g && !!g.datosGenerados && ((document.getElementById('analisisN') || {}).textContent || '') === String(g.datosGenerados.n);
    },
};

/**
 * Cumplida una espera, si salió bien y lo que dijo la página: el aviso (con `exito`, debe además encajar con su patrón: si
 * no, es el de un error), la salida del SEM (con `fallo: 'sem'`, la que empieza por «⚠️» sin parámetros estimados es la de
 * un modelo que no se pudo ajustar), los resultados de una tarjeta (con `fallo: 'resultados'`, sin ellos a la vista, sus
 * mensajes dicen por qué; con `fallo: 'estado'`, sin ellos, su aviso) o el texto del elemento que se esperaba. Autocontenida,
 * como las condiciones.
 * @param {{ condicion: string, arg: any, exito?: [string, string], fallo?: string }} o la operación «esperar» del plan
 * @returns {{ dicho: string, error: string }} error: vacío si salió bien
 */
export const VEREDICTO = o => {
    const texto = (/** @type {string} */ id) => ((document.getElementById(id) || {}).textContent || '');
    const acotado = (/** @type {string} */ t) => (t.length > 300 ? `${t.slice(0, 299)}…` : t);
    /** Lo que dicen los mensajes de una tarjeta: su recuadro de errores (o el de avisos), «título: uno; otro». @param {string} id */
    const mensajes = id => {
        const caja = document.getElementById(id);
        if (!caja) return '';
        const fuente = caja.querySelector('.aiken-errores') || caja;
        const titulo = ((fuente.querySelector('strong') || {}).textContent || '').trim();
        const items = [...fuente.querySelectorAll('li')].map(li => (li.textContent || '').trim()).filter(Boolean);
        return acotado(items.length ? `${titulo ? `${titulo} ` : ''}${items.join('; ')}` : (fuente.textContent || '').trim().replace(/\s+/g, ' '));
    };
    if (o.condicion === 'aviso') {
        const aviso = texto('toast');
        return { dicho: aviso, error: o.exito && !new RegExp(o.exito[0], o.exito[1]).test(aviso) ? `la página respondió «${acotado(aviso.trim())}»` : '' };
    }
    if (o.fallo === 'sem') {
        const salida = texto('semOut');
        return { dicho: salida, error: /^\s*⚠️/.test(salida) && !/parámetros estimados/.test(salida) ? 'el SEM no se ajustó: ' + salida.slice(0, 300) : '' };
    }
    if (o.fallo === 'resultados') {
        const [r, m] = o.arg, el = document.getElementById(r);
        return el && !el.hidden && texto(r).trim() ? { dicho: texto(r), error: '' } : { dicho: '', error: mensajes(m) || 'la tarjeta no dio resultados' };
    }
    if (o.fallo === 'estado') {
        const [r, e] = o.arg;
        return texto(r).trim() ? { dicho: texto(r), error: '' } : { dicho: '', error: acotado(texto(e).replace(/^\s*⚠️\s*/, '').trim()) || 'la tarjeta no dio resultados' };
    }
    return { dicho: o.condicion === 'conTexto' ? texto(o.arg) : '', error: '' };
};

/** ¿Es un nombre de condición conocido? @param {unknown} x @returns {x is NombreDeCondicion} */
export const esCondicion = x => typeof x === 'string' && Object.prototype.hasOwnProperty.call(CONDICIONES, x);
