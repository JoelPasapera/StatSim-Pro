// @ts-check
// tests/navegador/calculos.mjs — (2027.01.01) los cálculos del Analizador que comprueban los ejemplos, escritos una sola
// vez para la página y para Node. En la página, al terminar cada receta (tests/navegador/ejemplos.mjs), con los datos que
// tiene cargados; en Node (tests/integration/ejemplos.test.js), con los del proyecto guardado. De cada resultado se guarda
// una instantánea —sus números, textos y valores lógicos; lo muy largo, por su forma y sus sumas— y la prueba compara la
// de Node con la de la página: cualquier cifra o texto de estos análisis que cambie la hace fallar.
// Se llaman con la base y las etiquetas ya cargadas (AnalizadorEstadistico.cargarDatos, EtiquetasVariables.fijar).
import { AnalizadorEstadistico } from '../../src/analizador/estadistica.js';
import { RegresionMultiple } from '../../src/analizador/regresion.js';
import { ComparacionGrupos } from '../../src/analizador/comparacion-grupos.js';
import { SEM } from '../../src/analizador/sem-motor.js';
import { Fiabilidad } from '../../src/analizador/fiabilidad.js';
import { AnalisisDimensiones } from '../../src/analizador/analisis-dimensiones.js';
import { analizarAFE } from '../../src/analizador/psicometria/afe.js';
import { parsearMatriz } from '../../src/analizador/psicometria/aiken-entrada.js';
import { analizarValidezContenido } from '../../src/analizador/psicometria/aiken.js';
import { analizarInvarianza } from '../../src/analizador/psicometria/invarianza.js';
import { analizarInvarianzaOrdinal } from '../../src/analizador/psicometria/invarianza-ordinal.js';
import { aNumero } from '../../src/core/data/celdas.js';

/**
 * @typedef {{ tipo: string, entrada: Record<string, any> }} Pedido
 *   tipo: el análisis; entrada: con qué se pidió (las variables, las opciones, la sintaxis, los archivos de entrada)
 * @typedef {Pedido & { resultado: unknown }} Comprobacion   el pedido con la instantánea de lo que dio la página
 */

/**
 * Cómo se compara cada análisis: la tolerancia relativa de sus números (los iterativos, algo más holgada) y las claves que
 * no se comparan, a cualquier profundidad: las de la marcha de un optimizador (sus iteraciones y su estado al parar), que
 * cambian con el último bit de una cuenta aunque el resultado sea el mismo (Node y Chromium pueden llevar versiones de V8
 * distintas).
 * @type {Readonly<Record<string, { tolerancia: number, ignorar: string[] }>>}
 */
export const CRITERIO = Object.freeze({
    correlacion: { tolerancia: 1e-9, ignorar: [] }, regresion: { tolerancia: 1e-9, ignorar: [] }, grupos: { tolerancia: 1e-9, ignorar: [] },
    chi2: { tolerancia: 1e-9, ignorar: [] }, fiabilidad: { tolerancia: 1e-9, ignorar: [] }, objetivos: { tolerancia: 1e-9, ignorar: [] },
    aiken: { tolerancia: 1e-9, ignorar: [] }, afe: { tolerancia: 1e-7, ignorar: ['iteraciones'] },
    sem: { tolerancia: 1e-7, ignorar: ['optimizacion'] }, invarianza: { tolerancia: 1e-7, ignorar: ['optimizacion', 'iteraciones'] },
});

/**
 * El resultado del motor para un pedido, con la base cargada en el Analizador.
 * @param {Pedido} pedido
 * @param {(ruta: string) => string} [textoDe] el texto de un archivo de entrada del caso (las valoraciones de los jueces)
 * @returns {unknown}
 */
export function calcular({ tipo, entrada }, textoDe = ruta => { throw new Error(`no hay cómo leer «${ruta}»`); }) {
    const A = AnalizadorEstadistico, datos = A.obtenerDatos() || [];
    switch (tipo) {
        case 'correlacion': return A.calcularCorrelacion(entrada.var1, entrada.var2, entrada.tipoPrueba);
        case 'regresion': return RegresionMultiple.regresionAvanzada(entrada.dependiente, entrada.predictores, entrada.etY, entrada.etsX, entrada.opciones || {});
        case 'grupos': return ComparacionGrupos.analizar(entrada.grupo, entrada.numerica, entrada.grupo, entrada.numerica);
        case 'chi2': return A.chiCuadradoIndependencia(datos.map(f => f[entrada.var1]), datos.map(f => f[entrada.var2]));
        case 'sem': return SEM.ajustar(entrada.sintaxis, null, entrada.etiqueta, { estimador: entrada.estimador });
        case 'fiabilidad':
            // las cifras de cada escala, sin su nombre ni su origen (en la página, las escalas salen del configurador de
            // dimensiones, que se rellena con la estructura del Simulador; aquí, de la estructura: los mismos ítems, con otro
            // nombre), en el orden de sus ítems
            return Fiabilidad.analizarTodo(datos, { ordinal: true }).validos
                .map((/** @type {any} */ { grupo, etiqueta, origen, huella, avisos, ...cifras }) => ({ escala: cifras.items.map((/** @type {any} */ i) => i.item).join(' '), ...cifras }))
                .sort((a, b) => (a.escala < b.escala ? -1 : a.escala > b.escala ? 1 : 0));
        case 'objetivos': return AnalisisDimensiones.cribarObjetivos(entrada.var1, entrada.var2);
        case 'afe': {
            // como la tarjeta (psicometria/afe-ui.js): los casos completos en los ítems
            const filas = datos.map(f => entrada.items.map((/** @type {string} */ it) => aNumero(f[it]))).filter(v => v.every(Number.isFinite));
            return analizarAFE(entrada.items.map((/** @type {string} */ _, /** @type {number} */ j) => filas.map(f => f[j])), entrada.items, entrada.opciones);
        }
        case 'aiken': {
            // como la tarjeta (psicometria/aiken-ui.js): una matriz por criterio
            const criterios = entrada.criterios.map((/** @type {{ nombre: string, archivo: string }} */ k) => {
                const m = parsearMatriz(textoDe(k.archivo));
                return { nombre: k.nombre, jueces: m.jueces, valoraciones: m.valoraciones, etiquetas: m.etiquetas };
            });
            return analizarValidezContenido({ minimo: entrada.minimo, maximo: entrada.maximo, confianza: entrada.confianza, v0: entrada.v0, items: criterios[0].etiquetas, criterios });
        }
        case 'invarianza': {
            // como la tarjeta (psicometria/invarianza-ui.js): los ítems del modelo y el grupo de cada caso
            const modelo = SEM.parsear(entrada.sintaxis);
            const items = [...new Set(Object.values(modelo.latentes || {}).flat())];
            const columnas = [...items.filter(c => c in (datos[0] || {})), entrada.grupo];
            const ligeras = datos.map(f => Object.fromEntries(columnas.map(c => [c, f[c]])));
            const analizar = entrada.estimador === 'WLSMV' ? analizarInvarianzaOrdinal : analizarInvarianza;
            return analizar(modelo, ligeras, entrada.grupo, { estricta: !!entrada.estricta, estimador: entrada.estimador, agrupar: !!entrada.agrupar });
        }
        default: throw new Error(`no se sabe recalcular «${tipo}»`);
    }
}

/** Una lista más larga que esto se guarda por su forma y sus sumas. */
const LARGO_MAXIMO = 200;
/** Lo mismo con una lista de listas de más números que esto (una matriz de 18 × 18 entra; la Γ de 153 × 153, no). */
const NUMEROS_MAXIMOS = 2000;

/** ¿Es una lista de números, o de listas de números, a cualquier profundidad? Devuelve sus números, o null. @param {unknown[]} x */
function numerosDe(x) {
    /** @type {number[]} */
    const fuera = [];
    const recorrer = (/** @type {unknown} */ v) => {
        if (typeof v === 'number') { fuera.push(v); return true; }
        if (Array.isArray(v) || ArrayBuffer.isView(v)) { for (const w of /** @type {ArrayLike<unknown>} */ (/** @type {unknown} */ (v))) if (!recorrer(w)) return false; return true; }
        return false;
    };
    return recorrer(x) ? fuera : null;
}

/** Un número que JSON conserva: NaN y los infinitos, como texto. @param {number} v */
const numero = v => (Number.isFinite(v) ? v : Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity');

/**
 * La instantánea de un resultado: sus números (NaN e infinitos como texto), textos y valores lógicos, en objetos y listas
 * sin las claves que empiezan por «_» ni las funciones; una lista larga, como { forma, suma, sumaCuadrados } si es de
 * números (así su cambio se nota), o como su largo si no.
 * @param {unknown} x
 * @param {number} [profundidad]
 * @returns {unknown}
 */
export function instantanea(x, profundidad = 0) {
    if (x === null || x === undefined) return null;
    if (typeof x === 'number') return numero(x);
    if (typeof x === 'string' || typeof x === 'boolean') return x;
    if (typeof x !== 'object' || profundidad > 16) return null;
    if (x instanceof Date) return null;
    if (x instanceof Map) return instantanea(Object.fromEntries(x), profundidad);
    if (x instanceof Set) return instantanea([...x], profundidad);
    const lista = Array.isArray(x) ? x : ArrayBuffer.isView(x) ? Array.from(/** @type {any} */ (x)) : null;
    if (lista) {
        const nums = numerosDe(lista);
        if (nums && (lista.length > LARGO_MAXIMO || nums.length > NUMEROS_MAXIMOS)) {
            let suma = 0, sumaCuadrados = 0;
            for (const v of nums) if (Number.isFinite(v)) { suma += v; sumaCuadrados += v * v; }
            return { forma: lista.length, numeros: nums.length, suma: numero(suma), sumaCuadrados: numero(sumaCuadrados) };
        }
        if (lista.length > LARGO_MAXIMO) return { largo: lista.length };
        return lista.map(v => instantanea(v, profundidad + 1));
    }
    /** @type {Record<string, unknown>} */
    const fuera = {};
    for (const [k, v] of Object.entries(x)) {
        if (k.startsWith('_') || typeof v === 'function') continue;
        Object.defineProperty(fuera, k, { value: instantanea(v, profundidad + 1), enumerable: true, writable: true, configurable: true });
    }
    return fuera;
}

/**
 * Lo que distingue dos instantáneas (vacío si son iguales): los números, con una tolerancia relativa (sobre el mayor de
 * los dos y 1); lo demás, exacto; sin las claves de `ignorar`. Hasta `maximo` diferencias, con su ruta.
 * @param {unknown} a la que se acaba de calcular
 * @param {unknown} b la guardada (la de la página)
 * @param {{ tolerancia: number, ignorar?: string[] }} criterio
 * @param {string} [ruta]
 * @param {string[]} [fuera]
 * @param {number} [maximo]
 * @returns {string[]}
 */
export function diferencias(a, b, criterio, ruta = '', fuera = [], maximo = 12) {
    if (fuera.length >= maximo) return fuera;
    const { tolerancia } = criterio, ignorar = criterio.ignorar || [];
    const donde = ruta || '(raíz)';
    if (typeof a === 'number' && typeof b === 'number') {
        if (Math.abs(a - b) > tolerancia * Math.max(1, Math.abs(a), Math.abs(b))) fuera.push(`${donde}: ${a} frente a ${b}`);
        return fuera;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) { fuera.push(`${donde}: ${a.length} elementos frente a ${b.length}`); return fuera; }
        a.forEach((v, i) => diferencias(v, b[i], criterio, `${ruta}[${i}]`, fuera, maximo));
        return fuera;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
        const ka = Object.keys(a).filter(k => !ignorar.includes(k)), kb = Object.keys(b).filter(k => !ignorar.includes(k));
        for (const k of ka) if (!kb.includes(k)) fuera.push(`${ruta}.${k}: sobra (no estaba en la página)`);
        for (const k of kb) if (!ka.includes(k)) fuera.push(`${ruta}.${k}: falta (estaba en la página)`);
        for (const k of ka) if (kb.includes(k)) diferencias(/** @type {any} */ (a)[k], /** @type {any} */ (b)[k], criterio, `${ruta}.${k}`, fuera, maximo);
        return fuera;
    }
    if (a !== b) fuera.push(`${donde}: ${JSON.stringify(a)} frente a ${JSON.stringify(b)}`);
    return fuera;
}

/**
 * Las comprobaciones de una lista de pedidos (en la página, al terminar la receta): cada pedido con la instantánea de su
 * resultado.
 * @param {Pedido[]} pedidos
 * @param {Record<string, string>} textos los archivos de entrada del caso (ruta → texto)
 * @returns {Comprobacion[]}
 */
export function comprobaciones(pedidos, textos) {
    return pedidos.map(p => ({ ...p, resultado: instantanea(calcular(p, ruta => {
        if (!Object.prototype.hasOwnProperty.call(textos, ruta)) throw new Error(`falta el archivo de entrada «${ruta}»`);
        return /** @type {string} */ (textos[ruta]);
    })) }));
}
