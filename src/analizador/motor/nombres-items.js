// @ts-check
// analizador/motor/nombres-items.js — (2026.12.31, revisiones) los ítems de una escala por el nombre de sus columnas, con
// que la tarjeta de fiabilidad (fiabilidad.js) agrupa una base: el prefijo y el número final de un nombre («PE_12» → «PE»
// y «12»); el reparto de las columnas «sigla + número» entre las siglas de una estructura de pruebas (las que encontraba
// /^sigla\d+$/i); y, para las escalas totales, el primer grupo de ítems que son todos de una sigla. Dan lo mismo que las
// expresiones regulares que sustituyen —una por columna y dimensión, O(columnas × dimensiones), y una
// («^(.+?)[_\-]?(\d+)$») que con el nombre larguísimo de una columna ajena retrocedía en tiempo cuadrático—, sin recorrer
// las columnas por cada sigla: un índice ordenado por raíz y cifras, del que salen las que se toman (cuarta revisión: con
// siglas encadenadas —«T», «T1», «T11»…— cada una recorría otra vez las columnas que ya había tomado la primera). Sin DOM.
import { plegarComoRegExp } from '../../core/data/texto.js';

/** ¿Es una cifra ASCII (lo que \d encuentra, también con la bandera «i»)? @param {number} c */
const esCifra = c => c >= 48 && c <= 57;

/** Los fines de línea, que el «.» de una expresión regular (sin la bandera «s») no encuentra. */
const FIN_DE_LINEA = /[\n\r\u2028\u2029]/;

/**
 * Dónde empiezan las cifras finales de un texto (su largo, si no termina en cifra).
 * @param {string} t
 * @returns {number}
 */
function inicioDeCifras(t) {
    let k = t.length;
    while (k > 0 && esCifra(t.charCodeAt(k - 1))) k--;
    return k;
}

/**
 * La raíz de un nombre —lo que va antes de sus cifras finales, plegado como lo compara una expresión con «i»
 * (core/data/texto.js)— y esas cifras. Un nombre es «sigla + número» si tiene la raíz de la sigla y sus cifras empiezan
 * por las de la sigla y tienen alguna más («T21» lo es de «T» y de «T2»; «T2», solo de «T»).
 * @param {unknown} nombre
 * @returns {{ raiz: string, cifras: string }}
 */
function raizYCifras(nombre) {
    const plegado = plegarComoRegExp(nombre);
    const k = inicioDeCifras(plegado);
    return { raiz: plegado.slice(0, k), cifras: plegado.slice(k) };
}

/**
 * La primera posición de una lista ordenada de textos cuyo texto no va antes que t (búsqueda binaria).
 * @param {readonly string[]} lista
 * @param {string} t
 * @returns {number}
 */
function desde(lista, t) {
    let lo = 0, hi = lista.length;
    while (lo < hi) { const m = (lo + hi) >>> 1; if (/** @type {string} */ (lista[m]) < t) lo = m + 1; else hi = m; }
    return lo;
}

/**
 * El prefijo y el número final de un nombre de columna («PE_12» → «PE» y «12», «F3» → «F» y «3»), lo mismo que la
 * expresión /^(.+?)[_\-]?(\d+)$/ que se usaba, pero en tiempo lineal. null si no termina en dígitos o si lleva un fin de
 * línea (el «.» de la expresión no lo cruza: un CSV con «Ítem↵1» en su encabezado).
 * @param {string} c
 * @returns {{ prefijo: string, numero: string } | null}
 */
export function prefijoYNumero(c) {
    let k = inicioDeCifras(c);
    if (k === c.length || FIN_DE_LINEA.test(c)) return null;
    if (k === 0) { if (c.length < 2) return null; k = 1; }   // solo dígitos: como la expresión, el primero hace de prefijo
    let p = k;
    if (p > 1 && (c[p - 1] === '_' || c[p - 1] === '-')) p--;   // el separador, sin dejar el prefijo vacío
    return { prefijo: c.slice(0, p), numero: c.slice(k) };
}

/**
 * Las cifras finales de un nombre, todas («Item_012» → «012», «129» → «129»): lo que encontraba /(\d+)$/, con que se
 * ordenan los ítems de un prefijo. '' si no termina en cifra.
 * @param {string} c
 * @returns {string}
 */
export function cifrasFinales(c) {
    return c.slice(inicioDeCifras(c));
}

/**
 * El reparto de unos nombres entre siglas, en el orden en que se piden: tomar(sigla) da las posiciones, en orden, de los
 * nombres «sigla + número» —los que /^sigla\d+$/i (con la sigla escapada y sin la bandera «u») encuentra— que siguen sin
 * tomar, si son al menos `minimo`, y entonces quedan tomados; si son menos, ninguna (y siguen libres). Los nombres de cada
 * raíz, ordenados por sus cifras como texto: los de una sigla son un tramo seguido, entre sus cifras seguidas de «0» y de
 * «:» («:» sigue a «9»), que dos búsquedas binarias encuentran. Los tomados salen del tramo (un puntero al siguiente libre,
 * con compresión de caminos), así que cada nombre se mira una vez al tomarlo y, sin tomarlo, menos de `minimo` veces por
 * sigla: el reparto cuesta lo que ordenar los nombres más dos búsquedas por sigla, también con siglas encadenadas.
 * @param {readonly string[]} nombres
 * @param {number} [minimo]
 * @returns {(sigla: string) => number[]}
 */
export function repartoPorSigla(nombres, minimo = 2) {
    /** @type {Map<string, Array<{ cifras: string, posicion: number }>>} */
    const provisional = new Map();
    nombres.forEach((nombre, posicion) => {
        const { raiz, cifras } = raizYCifras(nombre);
        if (!cifras) return;   // sin número final: ninguna sigla lo encuentra
        let lista = provisional.get(raiz);
        if (!lista) provisional.set(raiz, lista = []);
        lista.push({ cifras, posicion });
    });
    /** @type {Map<string, { cifras: string[], posiciones: number[], siguiente: Int32Array }>} */
    const porRaiz = new Map();
    for (const [raiz, lista] of provisional) {
        lista.sort((a, b) => (a.cifras < b.cifras ? -1 : a.cifras > b.cifras ? 1 : a.posicion - b.posicion));
        // siguiente[j]: j si sigue libre; si no, uno más adelante (el final de la lista, lista.length, siempre «libre»)
        const siguiente = new Int32Array(lista.length + 1);
        for (let j = 0; j <= lista.length; j++) siguiente[j] = j;
        porRaiz.set(raiz, { cifras: lista.map(x => x.cifras), posiciones: lista.map(x => x.posicion), siguiente });
    }
    /** El primero libre desde j, acortando el camino. @param {Int32Array} siguiente @param {number} j */
    const libre = (siguiente, j) => {
        let r = j;
        while (siguiente[r] !== r) r = /** @type {number} */ (siguiente[r]);
        while (siguiente[j] !== r) { const t = /** @type {number} */ (siguiente[j]); siguiente[j] = r; j = t; }
        return r;
    };
    return sigla => {
        const { raiz, cifras } = raizYCifras(sigla);
        const t = porRaiz.get(raiz);
        if (!t) return [];
        const fin = desde(t.cifras, cifras + ':');
        /** @type {number[]} */
        const libres = [];
        for (let j = libre(t.siguiente, desde(t.cifras, cifras + '0')); j < fin; j = libre(t.siguiente, j + 1)) libres.push(j);
        if (libres.length < minimo) return [];
        for (const j of libres) t.siguiente[j] = j + 1;
        return libres.map(j => /** @type {number} */ (t.posiciones[j])).sort((a, b) => a - b);
    };
}

/**
 * El prefijo común de dos textos.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function prefijoComun(a, b) {
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
    return i === a.length ? a : a.slice(0, i);
}

/**
 * El mínimo de cada tramo de una lista de números, en tiempo logarítmico (un árbol de segmentos).
 * @param {readonly number[]} valores
 * @returns {(lo: number, hi: number) => number} el mínimo de valores[lo, hi), con lo < hi
 */
function minimoPorTramos(valores) {
    const n = valores.length, arbol = new Int32Array(2 * n);
    arbol.set(valores, n);
    for (let j = n - 1; j > 0; j--) arbol[j] = Math.min(/** @type {number} */ (arbol[2 * j]), /** @type {number} */ (arbol[2 * j + 1]));
    return (lo, hi) => {
        let r = 0x7fffffff;
        for (lo += n, hi += n; lo < hi; lo >>= 1, hi >>= 1) {
            if (lo & 1) r = Math.min(r, /** @type {number} */ (arbol[lo++]));
            if (hi & 1) r = Math.min(r, /** @type {number} */ (arbol[--hi]));
        }
        return r;
    };
}

/**
 * Para cada sigla, el primer conjunto (en su orden) cuyos nombres son todos «sigla + número»: su índice, o -1. Un conjunto
 * lo es de una sigla si todos sus nombres tienen la raíz de la sigla y las cifras de la sigla son un prefijo de las que
 * comparten todos, recortadas para dejarle al menos una al más corto: esa es su clave. Los conjuntos, por raíz y ordenados
 * por su clave (los de una sigla son un tramo seguido) y con el menor índice de cada tramo a mano: cada sigla, dos
 * búsquedas binarias, sin recorrer los nombres.
 * @param {ReadonlyArray<readonly string[] | null>} conjuntos (null, o vacío: ninguna sigla lo reúne)
 * @returns {(sigla: string) => number}
 */
export function primeroPorSigla(conjuntos) {
    /** @type {Map<string, Array<{ clave: string, indice: number }>>} */
    const provisional = new Map();
    conjuntos.forEach((nombres, indice) => {
        if (!nombres || !nombres.length) return;
        /** @type {string | null} */
        let raiz = null;
        let comun = '', corto = Infinity;
        for (const nombre of nombres) {
            const rc = raizYCifras(nombre);
            if (!rc.cifras || (raiz !== null && rc.raiz !== raiz)) return;   // sin número, u otra raíz: ninguna sigla los reúne
            if (raiz === null) { raiz = rc.raiz; comun = rc.cifras; } else comun = prefijoComun(comun, rc.cifras);
            if (rc.cifras.length < corto) corto = rc.cifras.length;
        }
        const r = /** @type {string} */ (raiz);
        let lista = provisional.get(r);
        if (!lista) provisional.set(r, lista = []);
        lista.push({ clave: comun.slice(0, Math.min(comun.length, corto - 1)), indice });
    });
    /** @type {Map<string, { claves: string[], minimo: (lo: number, hi: number) => number }>} */
    const porRaiz = new Map();
    for (const [raiz, lista] of provisional) {
        lista.sort((a, b) => (a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : a.indice - b.indice));
        porRaiz.set(raiz, { claves: lista.map(x => x.clave), minimo: minimoPorTramos(lista.map(x => x.indice)) });
    }
    return sigla => {
        const { raiz, cifras } = raizYCifras(sigla);
        const t = porRaiz.get(raiz);
        if (!t) return -1;
        const lo = desde(t.claves, cifras), hi = desde(t.claves, cifras + ':');
        return lo < hi ? t.minimo(lo, hi) : -1;
    };
}
