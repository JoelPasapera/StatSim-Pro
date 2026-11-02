// @ts-check
// analizador/depuracion/deteccion-casos.js — (2027.01.18) la depuración de una base antes de analizarla: qué casos
// conviene revisar y por qué. Cada criterio, con su referencia y su umbral a la vista:
//   · duplicados: filas idénticas y, si hay identificador, identificadores repetidos. (2027.01.20, revisión) Las filas se
//     comparan en todas las columnas de la base salvo el identificador y los datos del envío que distinguen dos envíos de la
//     misma persona (una marca temporal con su hora, un número de fila); hasta la 2027.01.19, solo en las variables
//     revisadas, y con 5 ítems de 1 a 5 y 300 personas salían 93 «duplicados» que eran dos personas que respondieron igual.
//     Y se estiman las coincidencias esperables por azar (con pocas columnas de pocas opciones, muchas): la tarjeta no excluye
//     entonces los duplicados por defecto y lo avisa;
//   · fuera de rango: valores de los ítems fuera de la escala de respuesta (o no enteros en una escala entera); una variable
//     con más de la mitad de sus valores fuera no usa esa escala (un puntaje total, la edad): se deja fuera de esta revisión y
//     se dice;
//   · perdidos por caso: la proporción de ítems sin respuesta (por defecto, más del 20 %);
//   · respuesta descuidada (Curran, 2016): la cadena más larga de respuestas idénticas seguidas (longstring; Johnson, 2005)
//     de al menos la mitad de los ítems (y 6 o más), y la variabilidad intraindividual nula (IRV = 0, la misma respuesta en
//     todo; Dunn et al., 2018);
//   · atípicos univariados: |z| > 3,29 (p < .001 bilateral) en alguna variable;
//   · atípicos multivariados: la distancia de Mahalanobis con p < .001 en la χ² con k gl (Tabachnick y Fidell, 2019).
// Sin DOM: lo usa la tarjeta 12.
import { aNumero, esPerdido } from '../../core/data/celdas.js';
import { media, desviacion, matrizCovarianzas } from '../../core/stats/descriptivos.js';
import { inversaDefinidaPositiva } from '../../core/linalg/cholesky.js';
import { pChiCuadrado } from '../../core/stats/distribuciones.js';

/** @typedef {Record<string, unknown>} Fila */
/** @typedef {'duplicado' | 'idRepetido' | 'fueraDeRango' | 'perdidos' | 'longstring' | 'sinVariabilidad' | 'atipicoUnivariado' | 'atipicoMultivariado'} Motivo */

/** Los umbrales por defecto. */
export const UMBRALES = Object.freeze({ perdidosPorCaso: 0.2, zUnivariado: 3.29, pMahalanobis: 0.001, longstringMinimo: 6 });

/**
 * Las coincidencias por azar desde las que los duplicados no se excluyen por defecto: con columnas independientes, ya se
 * esperaría un par de filas idénticas cada cien bases. Como las respuestas a los ítems de una escala se correlacionan, las
 * coincidencias reales son más (con 10 ítems de 1 a 5 y 300 personas, una, frente a 0,09 esperadas sin correlación).
 */
export const COINCIDENCIAS_POR_AZAR = 0.01;

/** El valor de una celda con el que se comparan las filas (los perdidos, como tales). @param {unknown} v */
const valorClave = v => (esPerdido(v) ? null : String(v).trim());

/** Una hora («10:23», «10:23:11»), dentro de una marca temporal. */
const HORA = /\d{1,2}:\d{2}/;
/** Solo los caracteres de una fecha con su hora («2026-10-01 10:23:11», «1/10/2026 10:23:11 a. m. GMT-5»). */
const FECHA_Y_HORA = /^[\d\s/.,:+\-TZapmAPMGTUC]+$/;

/**
 * (2027.01.20, revisión) Si una columna sin valores repetidos es un dato del envío, de los que distinguen dos envíos de la
 * misma persona: una marca temporal (una fecha con su hora, o una hora: la «Marca temporal» de un formulario) o un número de
 * fila (enteros consecutivos en el orden de las filas, sin huecos). Una medida continua (un peso, un tiempo de reacción), un
 * correo o una fecha sin hora (la de nacimiento) no lo son: son de la persona, y se comparan (si se quitaran, dos personas con
 * las mismas respuestas y distinto peso saldrían duplicadas).
 * @param {Fila[]} filas
 * @param {string} c
 */
function esDatoDelEnvio(filas, c) {
    const valores = filas.map(f => valorClave(f[c]));
    if (valores.some(v => v === null)) return false;
    const texto = /** @type {string[]} */ (valores);
    if (texto.every(v => HORA.test(v) && FECHA_Y_HORA.test(v))) return true;
    const numeros = texto.map(Number);
    if (!numeros.every(Number.isInteger)) return false;
    const paso = (/** @type {number} */ d) => numeros.every((x, i) => i === 0 || x === /** @type {number} */ (numeros[i - 1]) + d);
    return paso(1) || paso(-1);
}

/**
 * Las columnas con que se comparan las filas para hallar duplicados: todas las de la base salvo el identificador y los datos
 * del envío sin valores repetidos (una marca temporal, un número de fila), que harían única cada fila: en un formulario
 * enviado dos veces, todo coincide salvo la hora del envío.
 * @param {Fila[]} filas
 * @param {string | null} id
 * @returns {{ columnas: string[], delEnvio: string[] }}
 */
export function columnasDeDuplicados(filas, id) {
    /** @type {string[]} */ const columnas = [], delEnvio = [];
    const todas = [...new Set(filas.flatMap(f => Object.keys(f)))];
    for (const c of todas) {
        if (c === id) continue;
        /** @type {Set<string>} */ const vistos = new Set();
        let validos = 0, repite = false;
        for (const f of filas) { const v = valorClave(f[c]); if (v === null) continue; validos++; if (vistos.has(v)) { repite = true; break; } vistos.add(v); }
        if (!repite && validos >= 2 && esDatoDelEnvio(filas, c)) delEnvio.push(c); else columnas.push(c);
    }
    return { columnas, delEnvio };
}

/**
 * Los pares de filas idénticas que cabría esperar por azar en unas columnas si fueran independientes: C(n, 2)·Π_j Σ_v p_jv²
 * (la probabilidad de que dos filas coincidan en la columna j, con los perdidos como un valor más). Con ítems correlacionados
 * es una cota inferior.
 * @param {Fila[]} filas
 * @param {string[]} columnas
 */
export function coincidenciasEsperadas(filas, columnas) {
    const n = filas.length;
    let logP = 0;
    for (const c of columnas) {
        /** @type {Map<string | null, number>} */ const cuenta = new Map();
        for (const f of filas) { const v = valorClave(f[c]); cuenta.set(v, (cuenta.get(v) || 0) + 1); }
        let s = 0;
        for (const m of cuenta.values()) s += (m / n) * (m / n);
        logP += Math.log(s);
    }
    return n < 2 ? 0 : Math.exp(Math.log(n * (n - 1) / 2) + logP);
}

/**
 * La cadena más larga de valores idénticos seguidos (sin contar los perdidos, que la cortan).
 * @param {number[]} v
 */
export function cadenaMasLarga(v) {
    let mejor = 0, actual = 0, previo = NaN;
    for (const x of v) {
        if (!Number.isFinite(x)) { actual = 0; previo = NaN; continue; }
        actual = x === previo ? actual + 1 : 1; previo = x;
        if (actual > mejor) mejor = actual;
    }
    return mejor;
}

/**
 * La distancia de Mahalanobis al cuadrado de cada caso completo (con la media y la covarianza de esos casos) y su p en la χ²
 * con k gl. null si la covarianza es singular (una variable es combinación de otras: un pivote de Cholesky que no supera la
 * diezmilmillonésima parte de su diagonal, así un total junto a sus ítems no da distancias enormes por el redondeo).
 * @param {number[][]} X casos completos × k variables
 * @returns {{ d2: number[], p: number[] } | null}
 */
export function mahalanobis(X) {
    const k = /** @type {number[]} */ (X[0]).length, cols = Array.from({ length: k }, (_, j) => X.map(f => /** @type {number} */ (f[j])));
    const mu = cols.map(c => media(c)), Si = inversaDefinidaPositiva(matrizCovarianzas(cols), { tolerancia: 1e-10 });
    if (!Si) return null;
    const d2 = X.map(f => {
        let s = 0;
        for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) s += (/** @type {number} */ (f[i]) - /** @type {number} */ (mu[i])) * /** @type {number} */ (/** @type {ArrayLike<number>} */ (Si[i])[j]) * (/** @type {number} */ (f[j]) - /** @type {number} */ (mu[j]));
        return s;
    });
    return { d2, p: d2.map(d => pChiCuadrado(d, k)) };
}

/**
 * La revisión completa de unas filas.
 * @param {Fila[]} filas
 * @param {{ items: string[], id?: string | null, minimo?: number | null, maximo?: number | null, enteros?: boolean,
 *   umbrales?: Partial<typeof UMBRALES> }} opciones items: las variables que se revisan (los ítems de una escala, o las que
 *   se analizarán); minimo y maximo: la escala de respuesta (null: sin revisar el rango)
 * @returns {{ casos: { fila: number, id: string, motivos: { motivo: Motivo, detalle: string }[] }[], resumen: Record<Motivo, number>,
 *   n: number, longstringUmbral: number, mahalanobisCalculable: boolean, fueraDeEscala: string[],
 *   duplicados: { columnas: string[], delEnvio: string[], esperables: number, porAzar: boolean } }} fueraDeEscala: las
 *   variables que no usan la escala de respuesta (más de la mitad de sus valores, fuera), sin revisar en el rango;
 *   duplicados: las columnas con que se compararon las filas, las que se dejaron fuera por no repetir ningún valor y las
 *   coincidencias esperables por azar
 */
export function revisarCasos(filas, { items, id = null, minimo = null, maximo = null, enteros = false, umbrales = {} }) {
    const U = { ...UMBRALES, ...umbrales }, k = items.length, n = filas.length;
    const M = filas.map(f => items.map(c => aNumero(f[c])));
    /** @type {Map<number, { motivo: Motivo, detalle: string }[]>} */ const marcas = new Map();
    const marcar = (/** @type {number} */ i, /** @type {Motivo} */ motivo, /** @type {string} */ detalle) => { (marcas.get(i) || marcas.set(i, []).get(i) || []).push({ motivo, detalle }); };
    // duplicados (en todas las columnas salvo el identificador y las que no se repiten, con los perdidos como tales) e
    // identificadores repetidos
    const { columnas: columnasDuplicados, delEnvio } = columnasDeDuplicados(filas, id);
    /** @type {Map<string, number>} */ const vistas = new Map();
    if (columnasDuplicados.length) filas.forEach((f, i) => {
        const clave = JSON.stringify(columnasDuplicados.map(c => valorClave(f[c])));
        if (vistas.has(clave)) marcar(i, 'duplicado', `igual a la fila ${/** @type {number} */ (vistas.get(clave)) + 1}`); else vistas.set(clave, i);
    });
    const esperables = columnasDuplicados.length ? coincidenciasEsperadas(filas, columnasDuplicados) : 0;
    if (id) {
        /** @type {Map<string, number>} */ const ids = new Map();
        filas.forEach((f, i) => { if (esPerdido(f[id])) return; const v = String(f[id]).trim(); if (ids.has(v)) marcar(i, 'idRepetido', `«${v}», también en la fila ${/** @type {number} */ (ids.get(v)) + 1}`); else ids.set(v, i); });
    }
    // rango (solo en las variables que usan la escala) y perdidos
    const fuera = (/** @type {number} */ x) => minimo !== null && maximo !== null && (x < minimo || x > maximo || (enteros && !Number.isInteger(x)));
    /** @type {string[]} */ const fueraDeEscala = [];
    const enEscala = items.map((c, j) => {
        if (minimo === null || maximo === null) return false;
        const col = M.map(v => /** @type {number} */ (v[j])).filter(Number.isFinite);
        const usa = !col.length || col.filter(fuera).length / col.length <= 0.5;
        if (!usa) fueraDeEscala.push(c);
        return usa;
    });
    M.forEach((v, i) => {
        if (minimo !== null && maximo !== null) {
            const malos = v.map((x, j) => (enEscala[j] && Number.isFinite(x) && fuera(x) ? items[j] : null)).filter(Boolean);
            if (malos.length) marcar(i, 'fueraDeRango', `${malos.length} valor(es) fuera de ${minimo}–${maximo}${enteros ? ' o no enteros' : ''} (${malos.slice(0, 3).join(', ')}${malos.length > 3 ? '…' : ''})`);
        }
        const perdidos = v.filter(x => !Number.isFinite(x)).length;
        if (perdidos / k > U.perdidosPorCaso) marcar(i, 'perdidos', `${perdidos} de ${k} sin respuesta (${(100 * perdidos / k).toFixed(0)} %)`);
    });
    // respuesta descuidada: longstring e IRV (solo con varios ítems)
    const longstringUmbral = Math.max(U.longstringMinimo, Math.ceil(k / 2));
    if (k >= U.longstringMinimo) M.forEach((v, i) => {
        const ls = cadenaMasLarga(v), validos = v.filter(Number.isFinite);
        if (ls >= longstringUmbral) marcar(i, 'longstring', `${ls} respuestas iguales seguidas (umbral: ${longstringUmbral})`);
        if (validos.length >= U.longstringMinimo && desviacion(validos) === 0) marcar(i, 'sinVariabilidad', `la misma respuesta (${validos[0]}) en los ${validos.length} ítems respondidos`);
    });
    // atípicos univariados (z con la media y la DE de cada variable)
    items.forEach((c, j) => {
        const col = M.map(v => /** @type {number} */ (v[j])).filter(Number.isFinite);
        if (col.length < 3) return;
        const m = media(col), s = desviacion(col);
        if (!(s > 0)) return;
        M.forEach((v, i) => { const x = /** @type {number} */ (v[j]); if (Number.isFinite(x) && Math.abs((x - m) / s) > U.zUnivariado) marcar(i, 'atipicoUnivariado', `${c}: z = ${((x - m) / s).toFixed(2)}`); });
    });
    // atípicos multivariados (casos completos; hacen falta más casos que variables)
    const completos = M.map((v, i) => ({ v, i })).filter(x => x.v.every(Number.isFinite));
    let mahalanobisCalculable = false;
    if (k >= 2 && completos.length > k + 1) {
        const r = mahalanobis(completos.map(x => x.v));
        if (r) {
            mahalanobisCalculable = true;
            completos.forEach((x, a) => { const p = /** @type {number} */ (r.p[a]); if (p < U.pMahalanobis) marcar(x.i, 'atipicoMultivariado', `D² = ${/** @type {number} */ (r.d2[a]).toFixed(2)}, p ${p < 0.001 ? '< .001' : `= ${p.toFixed(3).replace(/^0/, '')}`}`); });
        }
    }
    const casos = [...marcas.entries()].sort((a, b) => a[0] - b[0]).map(([fila, motivos]) => ({ fila: fila + 1, id: id && !esPerdido(/** @type {Fila} */ (filas[fila])[id]) ? String(/** @type {Fila} */ (filas[fila])[id]) : String(fila + 1), motivos }));
    /** @type {Record<Motivo, number>} */ const resumen = { duplicado: 0, idRepetido: 0, fueraDeRango: 0, perdidos: 0, longstring: 0, sinVariabilidad: 0, atipicoUnivariado: 0, atipicoMultivariado: 0 };
    for (const c of casos) for (const m of new Set(c.motivos.map(x => x.motivo))) resumen[m]++;
    return { casos, resumen, n, longstringUmbral, mahalanobisCalculable, fueraDeEscala,
        duplicados: { columnas: columnasDuplicados, delEnvio, esperables, porAzar: esperables >= COINCIDENCIAS_POR_AZAR } };
}
