// @ts-check
// core/data/texto.js — (2026.12.29) texto que llega de un archivo ajeno (un CSV, un .sav) y que la interfaz pinta en sus
// informes. Sin DOM.

/**
 * El texto sin los dos caracteres con que el HTML abre y cierra una etiqueta: «<» y «>» pasan a «‹» y «›», que se leen
 * igual. Para los nombres de columna, las etiquetas y las categorías de un archivo ajeno: el Analizador los pinta en muchos
 * informes, y así ninguno puede abrir una etiqueta HTML (los atributos, aparte, se escapan con shared/html.js,
 * escaparHTML).
 * @param {unknown} texto
 * @returns {string}
 */
export function sinMarcado(texto) {
    return String(texto ?? '').replace(/</g, '‹').replace(/>/g, '›');
}

const MARCADO = /[<>]/;

/**
 * (2026.12.29, revisión) Lo mismo en una estructura entera: los textos, las claves de los objetos y los elementos de las
 * listas, a cualquier profundidad (los números y demás, tal cual). Para lo que llega al Analizador desde el Simulador (los
 * nombres de las columnas, sus categorías, las etiquetas y la estructura de las pruebas), que puede traer los nombres de
 * un CSV de configuración ajeno. Devuelve el mismo valor si no hay nada que cambiar (sin copiar).
 * @template T
 * @param {T} valor
 * @returns {T}
 */
export function sinMarcadoEnTodo(valor) {
    if (typeof valor === 'string') return /** @type {T} */ (/** @type {unknown} */ (MARCADO.test(valor) ? sinMarcado(valor) : valor));
    if (Array.isArray(valor)) {
        let copia = null;
        for (let i = 0; i < valor.length; i++) {
            const x = sinMarcadoEnTodo(valor[i]);
            if (x !== valor[i]) { if (!copia) copia = valor.slice(); copia[i] = x; }
        }
        return /** @type {T} */ (/** @type {unknown} */ (copia || valor));
    }
    if (valor && typeof valor === 'object' && Object.getPrototypeOf(valor) === Object.prototype) {
        /** @type {Record<string, unknown> | null} */
        let copia = null;
        const entradas = Object.entries(valor);
        for (const [k, v] of entradas) {
            const k2 = MARCADO.test(k) ? sinMarcado(k) : k, v2 = sinMarcadoEnTodo(v);
            if (k2 !== k || v2 !== v) { copia = {}; break; }
        }
        if (!copia) return valor;
        // como propiedades propias (una clave «__proto__» —una columna con ese nombre— no cambia el prototipo de la copia
        // ni se pierde: con una asignación, su valor null le quitaba el prototipo a la fila)
        for (const [k, v] of entradas) Object.defineProperty(copia, MARCADO.test(k) ? sinMarcado(k) : k, { value: sinMarcadoEnTodo(v), enumerable: true, writable: true, configurable: true });
        return /** @type {T} */ (/** @type {unknown} */ (copia));
    }
    return valor;
}

/**
 * (2026.12.31, revisión) El texto como literal de una expresión regular: sus metacaracteres ( ) [ ] { } . * + ? ^ $ | \\
 * escapados. Para un texto que entra en un RegExp y puede llegar de un archivo ajeno (los nombres de los instrumentos y
 * de los constructos que busca el Redactor): sin escapar, «(a+)+» colgaba la página con un retroceso exponencial. Las
 * siglas de una estructura de pruebas ya no entran en ninguno: el Analizador las busca con un índice
 * (analizador/motor/nombres-items.js, con plegarComoRegExp).
 * @param {unknown} texto
 * @returns {string}
 */
export function escaparRegExp(texto) {
    return String(texto ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** La forma canónica de los caracteres no ASCII ya vistos (plegarComoRegExp). @type {Map<number, number>} */
const canonicos = new Map();

/**
 * La forma canónica de un carácter (una unidad UTF-16) para una expresión regular con la bandera «i» y sin «u» (ECMAScript,
 * Canonicalize): su mayúscula, si es un solo carácter y no lleva de uno no ASCII a uno ASCII.
 * @param {number} c
 * @returns {number}
 */
function canonico(c) {
    if (c < 128) return c >= 97 && c <= 122 ? c - 32 : c;
    let r = canonicos.get(c);
    if (r === undefined) {
        const u = String.fromCharCode(c).toUpperCase();
        r = u.length !== 1 || u.charCodeAt(0) < 128 ? c : u.charCodeAt(0);
        canonicos.set(c, r);
    }
    return r;
}

const SOLO_ASCII = /^[\x00-\x7f]*$/;

/**
 * (2026.12.31, tercera revisión) El texto plegado como lo compara una expresión regular con la bandera «i» (sin «u»):
 * cada carácter, en su forma canónica. Dos textos se igualan con /^…$/i (el primero escapado) si y solo si sus plegados son
 * iguales —también donde toLowerCase no coincide con la expresión: «σ» y «ς», «µ» y «μ» se igualan; «ſ» y «s», el signo
 * kelvin y «k», no—. Carácter a carácter, así que el texto conserva su largo y plegar(t).slice(0, j) es plegar(t.slice(0, j)):
 * para indexar nombres y buscarlos sin una expresión por nombre.
 * @param {unknown} texto
 * @returns {string}
 */
export function plegarComoRegExp(texto) {
    const s = String(texto ?? '');
    if (SOLO_ASCII.test(s)) return s.toUpperCase();
    return s.replace(/[a-z]|[^\x00-\x7f]/g, ch => String.fromCharCode(canonico(ch.charCodeAt(0))));
}
