// @ts-check
// core/data/json-fiel.js — (2026.12.31) JSON que no pierde nada de lo que pueden llevar una configuración o un informe del
// programa: NaN, ±Infinity y −0 (JSON.stringify los convierte en null o en 0), undefined (que JSON omite o convierte en
// null), fechas, Map, Set y arreglos tipados (Float64Array…, con sus bytes en base64). Para el archivo de proyecto
// (proyecto/). Cada valor especial va como un objeto con la clave «$statsim»; un objeto del usuario que la tuviera se
// envuelve, así que la ida y vuelta es exacta. Sin DOM.

const MARCA = '$statsim';

/**
 * Una propiedad propia, también si se llama «__proto__» (la asignación o[k] = v llamaría al setter del prototipo y la
 * perdería, o cambiaría el prototipo del objeto).
 * @param {Record<string, unknown>} o @param {string} k @param {unknown} v
 */
const propia = (o, k, v) => {
    if (k === '__proto__') Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
    else o[k] = v;
};
const TIPADOS = /** @type {const} */ (['Float64Array', 'Float32Array', 'Int32Array', 'Uint32Array', 'Int16Array', 'Uint16Array', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray']);

/** Los bytes en base64 (por tramos: String.fromCharCode con un millón de argumentos desborda la pila). @param {Uint8Array} b */
function aBase64(b) {
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, /** @type {number[]} */ (/** @type {unknown} */ (b.subarray(i, i + 0x8000))));
    return btoa(s);
}

/** @param {string} t */
function deBase64(t) {
    const s = atob(t);
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
}

/**
 * @param {unknown} v
 * @returns {unknown}
 */
function codificar(v) {
    if (typeof v === 'number') {
        if (Number.isNaN(v)) return { [MARCA]: 'NaN' };
        if (v === Infinity) return { [MARCA]: 'Infinity' };
        if (v === -Infinity) return { [MARCA]: '-Infinity' };
        if (Object.is(v, -0)) return { [MARCA]: '-0' };
        return v;
    }
    if (v === undefined) return { [MARCA]: 'undefined' };
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v !== 'object') throw new Error(`JSON fiel: no se puede guardar un valor de tipo ${typeof v}`);
    if (Array.isArray(v)) return v.map(codificar);
    if (v instanceof DataView || v instanceof ArrayBuffer) throw new Error(`JSON fiel: no se puede guardar un ${v.constructor.name}`);
    if (ArrayBuffer.isView(v)) {
        const tipo = v.constructor.name;
        if (!TIPADOS.includes(/** @type {any} */ (tipo))) throw new Error(`JSON fiel: no se puede guardar un ${tipo}`);
        return { [MARCA]: 'tipado', tipo, base64: aBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    }
    if (v instanceof Date) return { [MARCA]: 'fecha', iso: Number.isNaN(v.getTime()) ? null : v.toISOString() };
    if (v instanceof Map) return { [MARCA]: 'mapa', pares: [...v].map(([k, x]) => [codificar(k), codificar(x)]) };
    if (v instanceof Set) return { [MARCA]: 'conjunto', valores: [...v].map(codificar) };
    // el resto, como objetos planos (sus propiedades propias), igual que el clon estructurado de postMessage
    /** @type {Record<string, unknown>} */
    const o = {};
    for (const [k, x] of Object.entries(v)) propia(o, k, codificar(x));
    return Object.prototype.hasOwnProperty.call(o, MARCA) ? { [MARCA]: 'objeto', valor: o } : o;
}

/**
 * @param {unknown} v
 * @returns {unknown}
 */
function decodificar(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(decodificar);
    const o = /** @type {Record<string, any>} */ (v);
    if (Object.prototype.hasOwnProperty.call(o, MARCA)) {
        const t = o[MARCA];
        if (t === 'NaN') return NaN;
        if (t === 'Infinity') return Infinity;
        if (t === '-Infinity') return -Infinity;
        if (t === '-0') return -0;
        if (t === 'undefined') return undefined;
        if (t === 'fecha') return new Date(o.iso === null ? NaN : o.iso);
        if (t === 'mapa') return new Map(o.pares.map((/** @type {[unknown, unknown]} */ [k, x]) => [decodificar(k), decodificar(x)]));
        if (t === 'conjunto') return new Set(o.valores.map(decodificar));
        if (t === 'tipado') {
            if (!TIPADOS.includes(o.tipo)) throw new Error(`JSON fiel: un arreglo de tipo desconocido (${o.tipo})`);
            const bytes = deBase64(o.base64);
            const Tipo = /** @type {any} */ (globalThis)[o.tipo];
            if (bytes.length % Tipo.BYTES_PER_ELEMENT) throw new Error(`JSON fiel: un ${o.tipo} con un número de bytes que no le corresponde`);
            return new Tipo(bytes.buffer, 0, bytes.length / Tipo.BYTES_PER_ELEMENT);
        }
        if (t === 'objeto') return decodificarObjeto(o.valor);
        throw new Error(`JSON fiel: una marca desconocida (${String(t)})`);
    }
    return decodificarObjeto(o);
}

/** @param {Record<string, unknown>} o */
function decodificarObjeto(o) {
    /** @type {Record<string, unknown>} */
    const salida = {};
    for (const [k, x] of Object.entries(o)) propia(salida, k, decodificar(x));
    return salida;
}

/**
 * Un valor como texto JSON, sin perder NaN, ±Infinity, −0, undefined, fechas, Map, Set ni arreglos tipados.
 * @param {unknown} valor
 * @returns {string}
 */
export function aJsonFiel(valor) {
    return JSON.stringify(codificar(valor));
}

/**
 * El valor que guardó aJsonFiel.
 * @param {string} texto
 * @returns {any}
 */
export function deJsonFiel(texto) {
    return decodificar(JSON.parse(texto));
}
