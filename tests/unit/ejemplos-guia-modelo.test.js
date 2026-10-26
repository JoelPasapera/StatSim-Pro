// tests/unit/ejemplos-guia-modelo.test.js — (2027.01.07) Lo que dice la guía de las descargas («Hazlo por mí» y «Hazlo todo
// por mí», src/ejemplos/hazlo/sesion.js), comparado con un modelo de la página escrito aparte (modelo-de-la-pagina.js), en
// miles de casos que cumplen las reglas de la guía (src/ejemplos/hazlo/reglas.js), armados como los arma una receta y con algo
// de ruido, y en los cinco de ejemplos/:
// - «Hazlo por mí» de un paso, con cualquier conjunto de pasos marcados, hechos antes en cualquier orden: si no dice nada, sus
//   descargas son las del caso; si dice que faltan unos, su remedio (hacerlos y, si lo pide, repetir este) da las del caso, y no
//   pide repetir este sin hacer falta; lo que dice que lleva cada descarga, lo lleva, y no calla ninguno de los que faltan; y
//   si dice que sobran unos, no son las del caso;
// - «Hazlo todo por mí»: las que da por perdidas lo están (otro análisis después) y, repetidas ahora, salen como dice ((2027.01.09,
//   revisión) cada una de sus descargas, con lo de los pasos que dice y nada de menos: hasta la 2027.01.08 solo se miraba si
//   decía algo del paso); ninguna de las que lo están sigue entre las que valen; y de las que valen, dice cuáles llevan ya lo de
//   un paso de después (y solo esas).
// Lo empezó la revisión independiente de la 2027.01.06: con su modelo halló los casos en que la guía aconsejaba mal (el SEM
// en dos pasos, una comparación con covariable junto al SEM…), que ahora las reglas no admiten o la guía dice bien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { accionValida, descargasDelAnalisis } from '../../src/ejemplos/hazlo/planes.js';
import { loQueNoCumple } from '../../src/ejemplos/hazlo/reglas.js';
import { descargasTras, finDelPaso, finDeTodo, guionDe, loDeDespues, loQueYaLlevan, pasosQueSeHacen, porDescarga, tarjetasQueLleva } from '../../src/ejemplos/hazlo/sesion.js';
import { copia, delCaso, descargas, hacerPaso, inicial, pasoDe } from './modelo-de-la-pagina.js';

const indice = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ejemplos', 'indice.json');

const a = (accion, datos = {}) => ({ accion, datos });
/** Las acciones de los casos armados. */
const PALETA = {
    A: a('analizar', { tipo: 'correlacion', variables: ['A', 'B'] }),
    E: a('exportarAnalisis', { word: true }),
    Ew: a('exportarAnalisis', { word: false }),
    CG: a('compararGrupos', { grupo: 'G', numerica: 'A' }),
    CGa: a('compararGrupos', { grupo: 'G', numerica: 'A', covariable: 'B' }),
    CGm: a('compararGrupos', { grupo: 'G', numerica: 'A', adicionales: ['B'] }),
    CGb: a('compararGrupos', { grupo: 'G', numerica: 'A', covariable: 'B', adicionales: ['C'] }),
    Si: a('ajustarSEM', { sintaxis: 'F =~ a + b + c + d', etiqueta: 'Modelo inicial' }),
    S0: a('ajustarSEM', { sintaxis: 'F =~ a + b + c + d' }),
    Sa: a('ajustarSEM', { sintaxis: 'F =~ a + b + c', etiqueta: 'Modelo alternativo' }),
    Sf: a('ajustarSEM', { sintaxis: 'F =~ a + b + c + e', etiqueta: 'Modelo final' }),
    AFE: a('calcularAFE', { conjunto: 'Escala total' }),
    AIK: a('calcularAiken', { minimo: 1, maximo: 4, criterios: [{ nombre: 'C', archivo: 'x/v.csv' }] }),
    INV: a('evaluarInvarianza', { sintaxis: 'F =~ a + b', grupo: 'G' }),
    INVs: a('evaluarInvarianza', { delSEM: true, grupo: 'G' }),
    D: a('describirInvestigacion', { titulo: 'otro' }),
    U: a('usarBaseDelSimulador'),
    G: a('guardarProyecto'),
};

/** Un azar con semilla (mulberry32). @param {number} semilla */
function azarCon(semilla) {
    let s = semilla | 0;
    return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Los pasos que se repiten de un caso, como los arma una receta: cada tarjeta una vez (una comparación de grupos, con o sin
 * covariable o variables adicionales; el AFE; la V de Aiken; la invarianza, con su modelo o con el del SEM), el SEM en un paso
 * (de uno a tres papeles) y, en cada paso, quizá un análisis, y tras él quizá sus descargas; con algo de ruido (dos acciones
 * cambiadas de sitio, una tarjeta o un modelo de más), para que también salgan casos que las reglas no admiten.
 * @param {() => number} azar
 * @param {number} r cuántos pasos
 */
function armar(azar, r) {
    const elegir = (/** @type {string[]} */ xs) => xs[Math.floor(azar() * xs.length)];
    const barajar = (/** @type {string[]} */ xs) => { const ys = [...xs]; for (let i = ys.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [ys[i], ys[j]] = [ys[j], ys[i]]; } return ys; };
    /** @type {string[][]} */
    const pasos = Array.from({ length: r }, () => []);
    const tarjetas = barajar([elegir(['CG', 'CGa', 'CGm', 'CGb']), 'AFE', 'AIK', elegir(['INV', 'INVs'])]).slice(0, Math.floor(azar() * 5));
    let conSEM = -1;
    if (azar() < 0.5) {
        conSEM = Math.floor(azar() * r);
        pasos[conSEM].push(...barajar([elegir(['Si', 'S0']), 'Sa', 'Sf']).slice(0, 1 + Math.floor(azar() * 3)));
    }
    for (const c of tarjetas) pasos[c === 'INVs' && conSEM >= 0 && azar() < 0.8 ? conSEM : Math.floor(azar() * r)].push(c);
    for (const g of pasos) {
        if (azar() < 0.6 || !g.length) g.splice(Math.floor(azar() * (g.length + 1)), 0, 'A');
        if (g.includes('A') && azar() < 0.55) g.push(azar() < 0.6 ? 'E' : 'Ew');
    }
    if (azar() < 0.15) { const g = elegir(pasos.map((_, i) => String(i))); const p = pasos[Number(g)]; if (p.length > 1) { const i = Math.floor(azar() * p.length), j = Math.floor(azar() * p.length); [p[i], p[j]] = [p[j], p[i]]; } }
    if (azar() < 0.05) pasos[Math.floor(azar() * r)].push(elegir(['CG', 'AFE', 'Sf', 'S0', 'G', 'D']));
    return pasos;
}

const iguales = (/** @type {any} */ x, /** @type {any} */ y, /** @type {string[]} */ ds) => ds.every(d => JSON.stringify(x[d]) === JSON.stringify(y[d]));
/** Todos los subconjuntos. @param {number[]} xs @returns {number[][]} */
const subconjuntos = xs => xs.reduce((acc, x) => acc.concat(acc.map(s => [...s, x])), /** @type {number[][]} */ ([[]]));
/** Todos los órdenes. @param {number[]} xs @returns {number[][]} */
const ordenes = xs => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => ordenes([...xs.slice(0, i), ...xs.slice(i + 1)]).map(o => [x, ...o])));
/** Las descargas del análisis del paso n (las suyas y, en el último que se repite, las de los opcionales). @param {any} e @param {number} n */
const delAnalisis = (e, n) => descargasDelAnalisis(descargasTras(e, [n]).vigentes.filter(v => v.clave === 'analisis').flatMap(v => v.ops));

/**
 * Lo que dice la guía de un caso y lo que hace la página, comparados: lo que no cuadra, en frases.
 * @param {any} e
 * @param {Record<string, number>} cuenta lo revisado
 * @returns {string[]}
 */
function revisar(e, cuenta) {
    /** @type {string[]} */
    const mal = [];
    const repetidos = pasosQueSeHacen(e);
    for (const n of repetidos) {
        const ds = delAnalisis(e, n);
        if (!ds.length) continue;
        const caso = delCaso(e, n);
        for (const marcados of subconjuntos(repetidos.filter(k => k !== n))) {
            const t = tarjetasQueLleva(e, n);
            const sinHacer = t.antes.filter(k => !marcados.includes(k)), sobran = t.despues.filter(k => marcados.includes(k));
            const opciones = { sinHacer, conAnalisis: t.conAnalisis.filter(k => sinHacer.includes(k)), enSinHacer: porDescarga(sinHacer, t.lleva), deMas: porDescarga(sinHacer, t.deMas), queDeja: t.queDeja, sobran, enSobran: porDescarga(sobran, t.lleva), plegada: false };
            const texto = finDelPaso(n, ['X'], true, opciones), repite = /y después repite este/.test(texto);
            cuenta.avisos++;
            if (repite) cuenta.repiteEste++;
            if (sobran.length) cuenta.sobran++;
            for (const orden of ordenes(marcados)) {
                cuenta.ordenes++;
                const st = inicial();
                orden.forEach(k => hacerPaso(st, e, k));
                hacerPaso(st, e, n);
                const pagina = descargas(st), donde = `paso ${n}, con ${orden.join(',') || 'nada'} hecho antes: «${texto}»`;
                if (!sinHacer.length && !sobran.length) {
                    if (!iguales(pagina, caso, ds)) mal.push(`no dice nada, y sus descargas no son las del caso (${donde})`);
                } else if (!sobran.length) {
                    const remedio = copia(st);
                    sinHacer.forEach(k => hacerPaso(remedio, e, k));
                    const sinRepetir = descargas(remedio);
                    if (repite) hacerPaso(remedio, e, n);
                    if (!iguales(descargas(remedio), caso, ds)) mal.push(`su remedio no da las del caso (${donde})`);
                    if (repite && iguales(sinRepetir, caso, ds)) mal.push(`pide repetir este sin hacer falta (${donde})`);
                    for (const d of ds) {
                        for (const k of opciones.enSinHacer[d] || []) if (!caso[d].some(f => pasoDe(f) === k)) mal.push(`dice que ${d} lleva lo del paso ${k}, y en el caso no (${donde})`);
                        for (const k of sinHacer) if (caso[d].some(f => pasoDe(f) === k) && !(opciones.enSinHacer[d] || []).includes(k)) mal.push(`no dice que ${d} lleva lo del paso ${k}, que falta (${donde})`);
                    }
                } else {
                    if (iguales(pagina, caso, ds)) mal.push(`dice que sobran unos, y son las del caso (${donde})`);
                    for (const d of ds) for (const k of opciones.enSobran[d] || []) if (!pagina[d].some(f => pasoDe(f) === k)) mal.push(`dice que ${d} lleva lo del paso ${k}, y no (${donde})`);
                }
            }
        }
    }
    if (!repetidos.length) return mal;
    // «Hazlo todo por mí»: desde el caso recién abierto, todos en orden
    cuenta.todo++;
    const { vigentes, perdidos } = descargasTras(e, repetidos);
    const { despuesDe, enDespuesDe } = loDeDespues(e, repetidos, perdidos);
    const st = inicial();
    repetidos.forEach(k => hacerPaso(st, e, k));
    const ahora = descargas(st);
    const texto = finDeTodo(repetidos, { vigentes: [...new Set(vigentes.map(v => v.n))], perdidos, senaladas: true, ...loDeDespues(e, repetidos, perdidos), yaLlevan: loQueYaLlevan(e, repetidos, vigentes) });
    for (const k of repetidos) {
        const conSusDescargas = guionDe(e, k).some(x => x.accion === 'exportarAnalisis');
        const otroAnalisis = repetidos.some(j => j > k && guionDe(e, j).some(x => x.accion === 'analizar'));
        if (perdidos.includes(k) !== (conSusDescargas && otroAnalisis)) mal.push(`«Hazlo todo»: ${perdidos.includes(k) ? 'da por perdidas' : 'no da por perdidas'} las descargas del análisis del paso ${k} («${texto}»)`);
        if (perdidos.includes(k) && vigentes.some(v => v.n === k && v.clave === 'analisis')) mal.push(`«Hazlo todo»: las del paso ${k}, perdidas y entre las que valen`);
    }
    for (const p of perdidos) {
        cuenta.perdidos++;
        const ds = delAnalisis(e, p), otraVez = copia(st);
        hacerPaso(otraVez, e, p);
        const repetido = descargas(otraVez), caso = delCaso(e, p);
        const dice = (despuesDe[p] || []).length > 0;
        if (dice !== !iguales(repetido, caso, ds)) mal.push(`«Hazlo todo»: del paso ${p}, repetido ahora, ${dice ? 'dice que saldría con lo de otros, y sale como el del caso' : 'calla, y no saldría como el del caso'} («${texto}»)`);
        // (2027.01.09, revisión) y de cada una de sus descargas, lo de qué pasos llevaría (enDespuesDe): lo que lleva de más frente a
        // la del caso, y nada de menos (hasta la 2027.01.08 solo se miraba si decía algo del paso)
        for (const d of ds) {
            const deMas = [...new Set(repetido[d].filter(f => !caso[d].includes(f)).map(pasoDe))].sort((x, y) => x - y), dicho = (enDespuesDe[p] || {})[d] || [];
            if (deMas.length) cuenta.enDespuesDe++;
            if (JSON.stringify(dicho) !== JSON.stringify(deMas)) mal.push(`«Hazlo todo»: de ${d} del paso ${p}, repetido ahora, dice que lleva lo de los pasos ${JSON.stringify(dicho)}, y lleva de más lo de ${JSON.stringify(deMas)} («${texto}»)`);
            const faltan = caso[d].filter(f => !repetido[d].includes(f));
            if (faltan.length) mal.push(`«Hazlo todo»: a ${d} del paso ${p}, repetido ahora, le faltaría ${faltan.join(', ')}, y no lo dice («${texto}»)`);
        }
    }
    for (const v of vigentes.filter(x => x.clave === 'analisis')) {
        cuenta.vigentes++;
        const caso = delCaso(e, v.n), ya = loQueYaLlevan(e, repetidos, [v]);
        if (Object.keys(ya.despuesDe).length) cuenta.yaLlevan++;
        for (const d of descargasDelAnalisis(v.ops)) {
            const distinta = JSON.stringify(ahora[d]) !== JSON.stringify(caso[d]), dice = (ya.enDespues[d] || []).length > 0;
            if (distinta !== dice) mal.push(`«Hazlo todo»: de ${d} del paso ${v.n}, ${dice ? 'dice que lleva lo de después, y es la del caso' : 'calla, y no es la del caso'} («${texto}»)`);
            for (const k of ya.enDespues[d] || []) if (!ahora[d].some(f => pasoDe(f) === k)) mal.push(`«Hazlo todo»: dice que ${d} del paso ${v.n} lleva lo del paso ${k}, y no («${texto}»)`);
        }
    }
    return mal;
}

test('(2027.01.07) lo que dice la guía de las descargas, contra un modelo de la página, en miles de casos que cumplen sus reglas', () => {
    for (const x of Object.values(PALETA)) assert.ok(accionValida(x), JSON.stringify(x));
    const azar = azarCon(20270107);
    const cuenta = { admitidos: 0, rechazados: 0, avisos: 0, repiteEste: 0, sobran: 0, ordenes: 0, todo: 0, perdidos: 0, enDespuesDe: 0, vigentes: 0, yaLlevan: 0 };
    /** @type {string[]} */
    const mal = [];
    const vistos = new Set();
    for (let t = 0; t < 25000 && mal.length < 5; t++) {
        const r = 2 + Math.floor(azar() * 3);
        const nombres = [['U', 'D'], ...armar(azar, r), azar() < 0.4 ? [azar() < 0.5 ? 'E' : 'Ew'] : ['G'], ...(azar() < 0.15 ? [['G']] : [])];
        const clave = JSON.stringify(nombres);
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        const guiones = nombres.map(p => p.map(x => PALETA[/** @type {keyof typeof PALETA} */ (x)]));
        const e = { pasos: guiones.map((_, i) => `p${i + 1}`), repetir: { desde: 2, hasta: 1 + r, nota: '' }, guiones };
        if (loQueNoCumple(e).length) { cuenta.rechazados++; continue; }
        cuenta.admitidos++;
        mal.push(...revisar(e, cuenta).map(m => `${clave}: ${m}`));
    }
    assert.deepEqual(mal.slice(0, 5), [], `lo que no cuadra (${JSON.stringify(cuenta)})`);
    // que no quede en nada: cada parte de lo que dice la guía, revisada muchas veces
    for (const [k, minimo] of Object.entries({ admitidos: 10000, rechazados: 2000, avisos: 50000, repiteEste: 5000, sobran: 20000, ordenes: 100000, perdidos: 2000, enDespuesDe: 5000, vigentes: 10000, yaLlevan: 600 })) {
        assert.ok(cuenta[/** @type {keyof typeof cuenta} */ (k)] >= minimo, `${k}: ${cuenta[/** @type {keyof typeof cuenta} */ (k)]} (al menos ${minimo})`);
    }
});

test('(2027.01.07) y en los casos de ejemplos/', { skip: !fs.existsSync(indice) && 'sin ejemplos/indice.json' }, () => {
    const cuenta = { avisos: 0, repiteEste: 0, sobran: 0, ordenes: 0, todo: 0, perdidos: 0, enDespuesDe: 0, vigentes: 0, yaLlevan: 0 };
    for (const e of JSON.parse(fs.readFileSync(indice, 'utf8')).casos) {
        assert.deepEqual(loQueNoCumple(e), [], e.carpeta);
        assert.deepEqual(revisar(e, cuenta), [], e.carpeta);
    }
    assert.ok(cuenta.avisos >= 20 && cuenta.todo === 5 && cuenta.perdidos === 3, JSON.stringify(cuenta));
});
