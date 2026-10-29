// @ts-check
// tests/unit/sem-diagrama.test.js — (2027.01.12, revisión) El diagrama de rutas del SEM (src/analizador/sem-diagrama.js), sin
// DOM: con los modelos de los ejemplos (el estructural, con su mediación, y los dos del instrumental), uno de rutas entre
// observadas, uno mixto, otros con muchos indicadores y otros menos corrientes (de segundo orden, con una carga cruzada, no
// recursivo, un MIMIC con efectos directos en ítems, con efectos en indicadores de otra latente). Hasta la 2027.01.11 los indicadores iban en una sola fila de 110 de
// ancho cada uno (1980 en el caso estructural: en el Word, de 450 de ancho, sus nombres quedaban de unos 3 puntos), el efecto
// directo de la mediación pasaba por debajo de la latente del medio, que tapaba su coeficiente, y las puntas de las flechas
// quedaban debajo de las variables. Aquí: el diagrama, de ANCHO_LEGIBLE como mucho (en el Word, a 600 de ancho, sus textos de
// 12 quedan de 8 puntos o más); ninguna variable sobre otra; ninguna flecha atraviesa una variable que no es la suya; ningún
// coeficiente sobre una variable, sobre otro ni sobre otra flecha (su fondo blanco la taparía); las flechas, del borde al
// borde; todo dentro del diagrama; un modelo de rutas sin latentes, por columnas; y el SVG, con los nombres escapados y los
// coeficientes encima de todo.
// (2027.01.13, revisión) La letra en el Word, a lo ancho y a lo alto de la página (puntosEnElWord): con nombres de 15 letras o
// más, con 18 indicadores y una covariable o con 6 factores correlacionados, en columna o en dos filas, de 8 puntos o más
// (hasta la 2027.01.12, de 1,9 a 6,6); una latente de 18 con una covariable, con sus indicadores encima y debajo y la
// covariable a su lado; en columna, con 8 o 10 indicadores, el coeficiente de cada carga a la altura de su indicador; los
// nombres, con el ancho de Arial; una covarianza entre indicadores vecinos, curvada por fuera (también con una latente sola);
// dos rutas recíprocas, una hacia cada lado; los coeficientes de dos rectas que se cruzan, fuera del cruce; con 20 o 24
// factores correlacionados, deprisa; y en columna, una carga cruzada que no pasa por la elipse de la otra latente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchoDeCaja, dentroDe, disposicionDelDiagrama, ejesDeElipse, svgDelDiagrama, tamanoDelDiagrama, tamanoEnLaPagina } from '../../src/analizador/sem-diagrama.js';

/**
 * Un modelo como lo arma sem-ui.js (diagramaSVG), con coeficientes inventados. (2027.01.14, revisión) Las covarianzas, con su
 * correlación («0.13», de 32 de ancho, como en el diagrama desde la 2027.01.12); hasta la 2027.01.13, con «↔» (20 de ancho): con
 * seis factores correlacionados, los coeficientes reales quedaban en los cruces y la prueba no lo veía.
 * @param {Record<string, string[]>} latentes @param {Array<[string, string]>} regresiones (x, y) @param {string[]} [otras] @param {Array<[string, string]>} [covarianzas]
 * @param {{ celda?: number }} [opciones] las de disposicionDelDiagrama
 */
function modelo(latentes, regresiones, otras = [], covarianzas = [], opciones = {}) {
    /** @type {import('../../src/analizador/sem-diagrama.js').Ruta[]} */
    const rutas = [];
    let k = 0;
    for (const [F, is] of Object.entries(latentes)) for (const ind of is) rutas.push({ de: F, a: ind, tipo: 'carga', texto: (0.55 + ((k++ * 7) % 40) / 100).toFixed(2) });
    for (const [x, y] of regresiones) rutas.push({ de: x, a: y, tipo: 'regresion', texto: (k++ % 2 ? -0.21 : 0.37).toFixed(2) });
    for (const [a, b] of covarianzas) rutas.push({ de: a, a: b, tipo: 'covarianza', texto: (0.05 + ((k++ * 13) % 60) / 100).toFixed(2) });
    const observadas = [...new Set([...Object.values(latentes).flat(), ...otras])];
    return disposicionDelDiagrama({ latentes: Object.keys(latentes), indicadoresDe: latentes, observadas, rutas }, opciones);
}
const serie = (/** @type {string} */ p, /** @type {number} */ n) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
/**
 * (2027.01.13) La letra del diagrama en el Word, en puntos: sus textos de 12 px, con el diagrama a lo ancho de la página (600) y
 * sin pasar de su alto (680; hasta la 2027.01.12, solo a lo ancho: un diagrama de 640 o menos de ancho, de 8 puntos o más).
 * @param {{ ancho: number, alto: number }} D
 */
const puntosEnElWord = D => 12 * Math.min(1, 600 / D.ancho, 680 / D.alto) * 72 / 96;

/** Las cajas de dos nodos o etiquetas, ¿se solapan? @param {{x:number,y:number,w:number,h:number}} a @param {{x:number,y:number,w:number,h:number}} b */
const solapan = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;

/**
 * ¿Entra el tramo pq en la caja (por su centro), en más que un punto? Lo recorre en pasos de 0,25 (independiente del módulo).
 * @param {{x:number,y:number}} p @param {{x:number,y:number}} q @param {{x:number,y:number,w:number,h:number}} c
 */
function tramoPorLaCaja(p, q, c) {
    const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 0.25));
    for (let i = 0; i <= n; i++) {
        const x = p.x + (q.x - p.x) * i / n, y = p.y + (q.y - p.y) * i / n;
        if (Math.abs(x - c.x) < c.w / 2 && Math.abs(y - c.y) < c.h / 2) return true;
    }
    return false;
}

/**
 * Lo que no debe pasar en una disposición: lo que se monta, en frases.
 * @param {import('../../src/analizador/sem-diagrama.js').Disposicion} D
 */
function loQueSeMonta(D) {
    /** @type {string[]} */
    const mal = [];
    const nodos = Object.values(D.nodos);
    nodos.forEach((a, i) => nodos.slice(i + 1).forEach(b => { if (solapan(a, b)) mal.push(`${a.nombre} sobre ${b.nombre}`); }));
    for (const f of D.flechas) {
        const A = D.nodos[f.de], B = D.nodos[f.a];
        const otro = f.puntos.find(p => !dentroDe(A, p.x, p.y) && !dentroDe(B, p.x, p.y) && nodos.some(n => n !== A && n !== B && dentroDe(n, p.x, p.y)));
        if (otro) mal.push(`${f.de} → ${f.a} atraviesa otra variable en (${otro.x.toFixed(0)}, ${otro.y.toFixed(0)})`);
        const e = f.etiqueta;
        for (const n of nodos) if (solapan(e, n)) mal.push(`el coeficiente de ${f.de} → ${f.a} sobre ${n.nombre}`);
        // del borde al borde: el principio, en el borde de la de salida; el final, en el de la de llegada
        const n = (f.d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
        const [x0, y0, x1, y1] = [n[0], n[1], n[n.length - 2], n[n.length - 1]];
        if (!(dentroDe(A, x0, y0, 1) && !dentroDe(A, x0, y0, -1))) mal.push(`${f.de} → ${f.a} no sale del borde de ${f.de}`);
        if (!(dentroDe(B, x1, y1, 1) && !dentroDe(B, x1, y1, -1))) mal.push(`${f.de} → ${f.a} no llega al borde de ${f.a}`);
        if (f.puntos.some(p => p.x < 0 || p.x > D.ancho || p.y < 0 || p.y > D.alto)) mal.push(`${f.de} → ${f.a} se sale del diagrama`);
    }
    for (const n of nodos) if (n.x - n.w / 2 < 0 || n.x + n.w / 2 > D.ancho || n.y - n.h / 2 < 0 || n.y + n.h / 2 > D.alto - 20) mal.push(`${n.nombre} se sale del diagrama (o pisa su nota)`);
    D.flechas.forEach((f, i) => D.flechas.slice(i + 1).forEach(g => { if (solapan(f.etiqueta, g.etiqueta)) mal.push(`los coeficientes de ${f.de} → ${f.a} y ${g.de} → ${g.a}, uno sobre otro`); }));
    // un coeficiente sobre otra flecha: su fondo blanco (sin medio punto de cada lado) cruzado por el trazo de otra, tramo a
    // tramo (2027.01.14, revisión: hasta la 2027.01.13, lo escrito, sin 2 de cada lado, y en sus puntos, a 4 o menos uno de otro:
    // una flecha que cruzaba la esquina de un coeficiente entre dos de ellos, o que entraba de 1,8 a 2,7 en su fondo, no contaba)
    for (const f of D.flechas) {
        const e = f.etiqueta;
        for (const g of D.flechas) {
            if (g === f) continue;
            const pasos = g.puntos.slice(1).map((p, i) => Math.hypot(p.x - g.puntos[i].x, p.y - g.puntos[i].y));
            if (Math.max(...pasos) > 4.01) mal.push(`${g.de} → ${g.a}: puntos a ${Math.max(...pasos).toFixed(1)} uno de otro`);
            if (g.puntos.some((p, i) => i > 0 && tramoPorLaCaja(g.puntos[i - 1], p, { x: e.x, y: e.y, w: e.w - 1, h: e.h - 1 }))) mal.push(`el coeficiente de ${f.de} → ${f.a} sobre la flecha ${g.de} → ${g.a}`);
        }
    }
    return mal;
}

/**
 * Las flechas que se cruzan (sin compartir variable): sus trazos, tramo a tramo (cada uno entre dos de sus puntos).
 * @param {import('../../src/analizador/sem-diagrama.js').Disposicion} D
 */
function cruzadas(D) {
    /** @param {{x:number,y:number}} a @param {{x:number,y:number}} b @param {{x:number,y:number}} c */
    const lado = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    /** @type {string[]} */
    const mal = [];
    D.flechas.forEach((f, i) => D.flechas.slice(i + 1).forEach(g => {
        if ([f.de, f.a].some(v => v === g.de || v === g.a)) return;
        const corta = f.puntos.slice(1).some((p, k) => g.puntos.slice(1).some((q, m) => {
            const a = f.puntos[k], c = g.puntos[m];
            return lado(a, p, c) * lado(a, p, q) < 0 && lado(c, q, a) * lado(c, q, p) < 0;
        }));
        if (corta) mal.push(`${f.de} → ${f.a} con ${g.de} → ${g.a}`);
    }));
    return mal;
}

test('el diagrama del caso estructural (tres latentes de 6 indicadores y una mediación): legible a lo ancho de una página, nada montado, y la mediación en triángulo', () => {
    const D = modelo({ Apoyo: serie('ASP', 6), Autoeficacia: serie('AA', 6), Engagement: serie('EA', 6) },
        [['Apoyo', 'Autoeficacia'], ['Autoeficacia', 'Engagement'], ['Apoyo', 'Engagement']]);
    assert.ok(puntosEnElWord(D) >= 8, `${D.ancho} × ${D.alto} (la 2027.01.11, 1980 de ancho)`);
    assert.deepEqual(loQueSeMonta(D), []);
    assert.deepEqual(cruzadas(D), [], 'ninguna flecha cruza otra');
    // la mediadora arriba, entre las otras dos; las tres rutas, rectas y de izquierda a derecha
    const { Apoyo, Autoeficacia, Engagement } = D.nodos;
    assert.ok(Autoeficacia.y < Apoyo.y && Apoyo.y === Engagement.y && Apoyo.x < Autoeficacia.x && Autoeficacia.x < Engagement.x, 'en triángulo, con la mediadora en el vértice');
    assert.deepEqual(D.flechas.filter(f => f.curva).map(f => `${f.de} → ${f.a}`), [], 'ninguna curva');
    for (const f of D.flechas.filter(g => g.tipo === 'regresion')) assert.ok(D.nodos[f.de].x < D.nodos[f.a].x, `${f.de} → ${f.a}, de izquierda a derecha`);
    // los indicadores de cada latente, juntos y por el lado de fuera (encima de la de arriba, debajo de las de abajo)
    for (const [F, p] of [['Apoyo', 'ASP'], ['Autoeficacia', 'AA'], ['Engagement', 'EA']]) {
        const cajas = serie(p, 6).map(v => D.nodos[v]), xs = cajas.map(c => c.x);
        assert.ok(Math.min(...xs) < D.nodos[F].x && D.nodos[F].x < Math.max(...xs), `${F}, en medio de sus indicadores`);
        assert.ok(cajas.every(c => (F === 'Autoeficacia' ? c.y < D.nodos[F].y : c.y > D.nodos[F].y)), `los de ${F}, por fuera`);
    }
});

test('los del caso instrumental (una latente de 15 indicadores, y tres de 5), uno de rutas entre observadas, uno mixto y otros con muchos indicadores: nada montado, y legibles', () => {
    const casos = {
        'una latente de 15': modelo({ Procrastinacion: [...serie('P', 5), ...serie('D', 5), ...serie('DE', 5)] }, []),
        // (con las correlaciones entre sus factores, que el modelo estima y el diagrama dibuja)
        'tres de 5': modelo({ Postergacion: serie('P', 5), Distraccion: serie('D', 5), Desorganizacion: serie('DE', 5) }, [], [], [['Postergacion', 'Distraccion'], ['Postergacion', 'Desorganizacion'], ['Distraccion', 'Desorganizacion']]),
        'rutas entre observadas': modelo({}, [['X1', 'Y'], ['X2', 'Y'], ['X1', 'X2']], ['X1', 'X2', 'Y']),
        'mixto, con una covarianza': modelo({ F: ['a', 'b', 'c'], G: ['d', 'e', 'f'] }, [['F', 'Y'], ['X', 'Y'], ['G', 'Y']], ['Y', 'X'], [['F', 'G']]),
        'nombres largos': modelo({ 'Inteligencia emocional': serie('Item_emocional_', 4), 'Rendimiento académico global': serie('Nota_del_curso_', 3) }, [['Inteligencia emocional', 'Rendimiento académico global']]),
        'una cadena de cuatro latentes de 6, con un atajo': modelo({ A: serie('a', 6), B: serie('b', 6), C: serie('c', 6), D: serie('d', 6) }, [['A', 'B'], ['B', 'C'], ['C', 'D'], ['A', 'D']]),
        'tres latentes de 6 y una covariable': modelo({ F1: serie('x', 6), F2: serie('y', 6), F3: serie('z', 6) }, [['F1', 'F3'], ['F2', 'F3'], ['edad', 'F3']], ['edad']),
        'dos latentes de 10, correlacionadas': modelo({ F: serie('f', 10), G: serie('g', 10) }, [], [], [['F', 'G']]),
    };
    for (const [que, D] of Object.entries(casos)) {
        assert.deepEqual(loQueSeMonta(D), [], que);
        assert.ok(puntosEnElWord(D) >= 8, `${que}: ${D.ancho} × ${D.alto}`);
    }
    const una = casos['una latente de 15'], F = una.nodos.Procrastinacion, inds = Object.values(una.nodos).filter(n => n.forma === 'caja');
    assert.ok(inds.some(n => n.y < F.y) && inds.some(n => n.y > F.y), 'una latente de 15: sus indicadores, por encima y por debajo de ella');
    const rutas = casos['rutas entre observadas'];
    assert.deepEqual(rutas.flechas.filter(f => f.curva).map(f => `${f.de} → ${f.a}`), ['X1 → Y'], 'sin latentes, en una fila: la que salta a la del medio, curvada');
    // con pocos indicadores, en una sola fila (la más baja de las legibles)
    const mixto = casos['mixto, con una covarianza'];
    assert.equal(mixto.nodos.F.y, mixto.nodos.G.y, 'el mixto, con sus dos latentes en una fila');
});

test('un modelo de rutas sin latentes (tres predictores correlacionados, una mediadora y una consecuencia), por columnas; y una covarianza entre indicadores de dos latentes, por encima de ellos', () => {
    const rutas = modelo({}, [['X1', 'M'], ['X2', 'M'], ['X3', 'M'], ['M', 'Y']], ['X1', 'X2', 'X3', 'M', 'Y'], [['X1', 'X2'], ['X1', 'X3'], ['X2', 'X3']]);
    assert.deepEqual(loQueSeMonta(rutas), []);
    assert.deepEqual(cruzadas(rutas), [], 'ninguna flecha cruza otra');
    const { X1, X2, X3, M, Y } = rutas.nodos;
    assert.ok(X1.x === X2.x && X2.x === X3.x && X1.y < X2.y && X2.y < X3.y, 'los predictores, en una columna (en su orden)');
    assert.ok(X1.x < M.x && M.x < Y.x && Math.abs(M.y - X2.y) < 1 && Math.abs(Y.y - M.y) < 1, 'la mediadora a su derecha, a media altura, y la consecuencia a la derecha de ella');
    const salto = rutas.flechas.find(f => f.de === 'X1' && f.a === 'X3');
    assert.ok(salto && salto.curva && Math.min(...salto.puntos.map(p => p.x)) < X1.x - X1.w / 2, 'la covarianza que salta a la del medio, curvada por fuera de la columna');
    // en un análisis factorial de tres latentes, una covarianza entre indicadores de dos de ellas: curvada por encima de la fila
    const cfa = modelo({ F1: serie('a', 4), F2: serie('b', 4), F3: serie('c', 4) }, [], [], [['a1', 'b1'], ['F1', 'F2'], ['F1', 'F3'], ['F2', 'F3']]);
    assert.deepEqual(loQueSeMonta(cfa), []);
    assert.deepEqual(cruzadas(cfa), [], 'ninguna flecha cruza otra');
    // dos covarianzas entre latentes no vecinas (F1–F3 y F2–F4): en una fila se cruzarían por fuerza; se colocan para que no
    const cuatro = modelo({ F1: ['a1', 'a2'], F2: ['b1', 'b2'], F3: ['c1', 'c2'], F4: ['d1', 'd2'] }, [], [], [['F1', 'F3'], ['F2', 'F4']]);
    assert.deepEqual([loQueSeMonta(cuatro), cruzadas(cuatro)], [[], []], 'dos covarianzas que se cruzarían en una fila');
    const residual = cfa.flechas.find(f => f.de === 'a1' && f.a === 'b1');
    assert.ok(residual && Math.min(...residual.puntos.map(p => p.y)) < cfa.nodos.a1.y - cfa.nodos.a1.h / 2, 'la covarianza entre indicadores, por encima de su fila');
    assert.ok(puntosEnElWord(cfa) >= 8, `${cfa.ancho} × ${cfa.alto}`);
});

test('un factor de segundo orden, una carga cruzada y un modelo no recursivo: nada montado ni cruzado; el coeficiente de la carga cruzada, lejos del de la otra carga a su indicador', () => {
    // (las cargas de G en F1, F2 y F3 son rutas entre latentes: modelo() las escribe como cargas)
    const segundo = disposicionDelDiagrama({
        latentes: ['F1', 'F2', 'F3', 'G'], indicadoresDe: { F1: serie('a', 4), F2: serie('b', 4), F3: serie('c', 4), G: ['F1', 'F2', 'F3'] }, observadas: [...serie('a', 4), ...serie('b', 4), ...serie('c', 4)],
        rutas: [...['a', 'b', 'c'].flatMap((p, i) => serie(p, 4).map(v => ({ de: `F${i + 1}`, a: v, tipo: /** @type {const} */ ('carga'), texto: '0.70' }))), ...['F1', 'F2', 'F3'].map(F => ({ de: 'G', a: F, tipo: /** @type {const} */ ('carga'), texto: '0.60' }))],
    });
    assert.deepEqual(loQueSeMonta(segundo), []);
    const G = segundo.nodos.G;
    assert.ok(['F1', 'F2', 'F3'].every(F => Math.abs(segundo.nodos[F].y - G.y) > 1), 'G, en otra fila que sus factores');
    const cruzada = modelo({ F1: serie('x', 4), F2: ['x4', 'x5', 'x6', 'x7'] }, [], [], [['F1', 'F2']]);
    assert.deepEqual(loQueSeMonta(cruzada), []);
    const [suya, otra] = ['F1', 'F2'].map(F => /** @type {any} */ (cruzada.flechas.find(f => f.de === F && f.a === 'x4')).etiqueta);
    assert.ok(Math.hypot(suya.x - otra.x, suya.y - otra.y) > 30, 'los dos coeficientes de x4, separados');
    // regresiones que llegan a un indicador (un efecto directo de una covariable, como en un MIMIC con DIF, o de otra latente):
    // pasan junto al coeficiente de la carga de ese indicador, que se aparta
    const mimic = modelo({ F: serie('x', 5) }, [['edad', 'F'], ['edad', 'x2'], ['sexo', 'F'], ['sexo', 'x4']], ['edad', 'sexo']);
    assert.deepEqual(loQueSeMonta(mimic), [], 'un MIMIC con dos efectos directos en ítems');
    const aIndicadores = modelo({ F1: serie('a', 4), F2: serie('b', 4), F3: serie('c', 4) }, [['F1', 'F3'], ['F2', 'F3'], ['F1', 'c2'], ['F2', 'a3']], [], [['F1', 'F2']]);
    assert.deepEqual(loQueSeMonta(aIndicadores), [], 'tres latentes con efectos en indicadores de otra');
    const noRecursivo = modelo({}, [['X1', 'Y1'], ['Y2', 'Y1'], ['Y1', 'Y2'], ['X2', 'Y2']], ['Y1', 'X1', 'Y2', 'X2'], [['X1', 'X2']]);
    assert.deepEqual(loQueSeMonta(noRecursivo), []);
    assert.deepEqual(cruzadas(noRecursivo), [], 'la covarianza de las exógenas, sin cruzar el bucle (por el otro lado)');
});

test('con más latentes de las que se prueban todas (8 de 4 indicadores, en cadena): una disposición sin nada montado, y deprisa', () => {
    const latentes = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`F${i + 1}`, serie(`v${i + 1}_`, 4)]));
    const cadena = /** @type {Array<[string, string]>} */ (Array.from({ length: 7 }, (_, i) => [`F${i + 1}`, `F${i + 2}`]));
    const t0 = performance.now();
    const D = modelo(latentes, cadena);
    const ms = performance.now() - t0;
    assert.deepEqual(loQueSeMonta(D), []);
    assert.ok(ms < 2000, `${ms.toFixed(0)} ms`);
});

test('el SVG: los nombres escapados (vienen de los datos), su tamaño, y los coeficientes encima de las variables', () => {
    const D = modelo({ '<b>F</b>': ['x"1', 'x&2', 'x3'] }, [['<b>F</b>', 'Y']], ['Y']);
    const svg = svgDelDiagrama(D);
    assert.ok(!svg.includes('<b>') && svg.includes('&lt;b&gt;F&lt;/b&gt;') && svg.includes('x&quot;1') && svg.includes('x&amp;2'), 'escapados');
    assert.deepEqual(tamanoDelDiagrama(svg), { ancho: D.ancho, alto: D.alto });
    assert.match(svg, new RegExp(`style="display:block;margin:0 auto;width:100%;max-width:${Math.round(D.ancho * 1.25)}px;min-width:560px;background:#fff;"`), 'a lo ancho de su recuadro (hasta 1,25 veces su tamaño), y legible en un teléfono (se desplaza en él)');
    assert.deepEqual([...new Set([...svg.matchAll(/font-size="(\d+)"/g)].map(m => m[1]))], ['12'], 'todos sus textos, de 12');
    assert.match(svg, /^<svg [^>]*font-family="Arial, Helvetica, sans-serif"/, 'con la letra con que se miden sus cajas (la de los gráficos), también en la imagen del Word');
    const ultimaVariable = Math.max(svg.lastIndexOf('<ellipse'), svg.lastIndexOf('fill="#eef4ff"')), primerCoeficiente = svg.indexOf('fill="#b03030"');
    assert.ok(ultimaVariable > 0 && primerCoeficiente > ultimaVariable, 'los coeficientes, pintados después de las variables');
    assert.equal((svg.match(/marker-end="url\(#fle\)"/g) || []).length, D.flechas.length, 'una flecha por ruta');
});

test('(2027.01.13) los nombres, con el ancho de Arial: en mayúsculas anchas caben en su caja, y en minúsculas no la ensanchan de más', () => {
    // los anchos de Arial a 12 px (los de sus tablas de métricas: W 944, M 833, … milésimas del tamaño de la letra)
    const ANCHOS = /** @type {Array<[string, number]>} */ ([['WWMMW1', 60.65], ['WOMEN_1', 60.67], ['Apoyo_familia_1', 88.7], ['ASP1', 30.68]]);
    for (const [nombre, ancho] of ANCHOS) {
        const w = anchoDeCaja(nombre);
        assert.ok(w >= ancho + 8 && w <= Math.max(36, ancho + 16), `«${nombre}» (${ancho} px): caja de ${w} (la 2027.01.12, «WWMMW1» en una de 56; «Apoyo_familia_1», en una de 120)`);
    }
    // en negrita (M, 833): diez emes, 100 px
    assert.ok(ejesDeElipse('MMMMMMMMMM').w >= 100 + 24, `elipse de ${ejesDeElipse('MMMMMMMMMM').w}`);
});

test('(2027.01.13) con nombres de 15 a 38 letras, con 18 indicadores y una covariable o con 6 factores correlacionados: en el Word, de 8 puntos o más, y nada montado', () => {
    const it = (/** @type {string} */ p) => serie(p, 6);
    /** @param {string[]} n @returns {Array<[string, string]>} */
    const mediacion = n => [[n[0], n[1]], [n[1], n[2]], [n[0], n[2]]];
    const largos = ['Apoyo_social_percibido', 'Autoeficacia_academica', 'Engagement_academico'];
    const factores = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`F${i + 1}`, serie(`v${i + 1}_`, 4)]));
    /** @type {Array<[string, string]>} */
    const correlaciones = [];
    for (let a = 1; a <= 6; a++) for (let b = a + 1; b <= 6; b++) correlaciones.push([`F${a}`, `F${b}`]);
    const casos = {
        // (en la 2027.01.12, 1408 de ancho: 3,8 puntos)
        'ítems de 15 letras, con una mediación': modelo({ Apoyo: it('Apoyo_familia_'), Autoeficacia: it('Autoeficacia_'), Engagement: it('Engagement_') }, mediacion(['Apoyo', 'Autoeficacia', 'Engagement'])),
        // (2878 de ancho: 1,9 puntos)
        'ítems de 38 letras': modelo({ [largos[0]]: it('Apoyo_social_percibido_de_la_familia_'), [largos[1]]: it('Autoeficacia_academica_general_'), [largos[2]]: it('Engagement_academico_vigor_') }, mediacion(largos)),
        // (820 de ancho: 6,6 puntos)
        'una latente de 18 y una covariable': modelo({ F: [...serie('ASP', 6), ...serie('AA', 6), ...serie('EA', 6)] }, [['Edad', 'F']], ['Edad']),
        // (876 de ancho: 6,2 puntos)
        'seis factores de 4, correlacionados': modelo(factores, [], [], correlaciones),
        'mayúsculas anchas': modelo({ MMMMMMMMMM: serie('WWMMW', 6), Autoeficacia: serie('MMWWM', 6), Engagement: serie('WMWMW', 6) }, []),
    };
    for (const [que, D] of Object.entries(casos)) {
        assert.deepEqual(loQueSeMonta(D), [], que);
        assert.ok(puntosEnElWord(D) >= 8, `${que}: ${D.ancho} × ${D.alto}, de ${puntosEnElWord(D).toFixed(1)} puntos`);
        const { w, h } = tamanoEnLaPagina(D);
        assert.ok(w <= 600 && h <= 680 && Math.abs(w / h - D.ancho / D.alto) < 0.02, `${que}: su figura del Word, de ${w} × ${h}`);
    }
    // una latente de 18 con una covariable: sus indicadores, en una fila encima de ella y otra debajo, y la covariable a su lado,
    // a su altura (en columna, igual de legible, pero de 593 de alto en lugar de 345)
    const sola = casos['una latente de 18 y una covariable'], { F, Edad } = sola.nodos;
    const filas = new Set(Object.values(sola.nodos).filter(n => n.forma === 'caja' && n !== Edad).map(n => n.y));
    assert.ok(filas.size === 2 && Math.min(...filas) < F.y && Math.max(...filas) > F.y, `la latente de 18: sus indicadores, encima y debajo de ella (${[...filas].join(', ')})`);
    assert.ok(Math.abs(Edad.y - F.y) < 1 && Edad.x !== F.x && sola.alto < sola.ancho, `la covariable, a su lado (${sola.ancho} × ${sola.alto})`);
    // con nombres largos, las latentes en columna, con sus indicadores al lado, uno debajo de otro, cada uno con su coeficiente a
    // su altura
    const D = casos['ítems de 15 letras, con una mediación'], { Apoyo, Autoeficacia, Engagement } = D.nodos;
    assert.ok(Apoyo.x === Autoeficacia.x && Autoeficacia.x === Engagement.x && Apoyo.y < Autoeficacia.y && Autoeficacia.y < Engagement.y, 'las latentes, en columna');
    for (const v of it('Apoyo_familia_')) {
        const caja = D.nodos[v], e = /** @type {any} */ (D.flechas.find(f => f.de === 'Apoyo' && f.a === v)).etiqueta;
        assert.ok(caja.x < Apoyo.x && Math.abs(e.y - caja.y) < 15, `${v}: a la izquierda de Apoyo, con su coeficiente a su altura (${e.y.toFixed(0)} y ${caja.y})`);
    }
    // y con 8 o 10 indicadores por latente (en una de 7,4 a 7,5 puntos): cada coeficiente, a menos de 15 de la altura de su
    // indicador, la mitad del paso entre dos cajas (con la carga recta, el de los de los extremos, a 16, más cerca de la vecina)
    const muchos = {
        'tres de 8 ítems de 13 letras, con una mediación': modelo({ Inteligencia_emocional: serie('IE_item_', 8), Autoeficacia: serie('Autoef_item_', 8), Rendimiento: serie('Rend_item_', 8) }, mediacion(['Inteligencia_emocional', 'Autoeficacia', 'Rendimiento'])),
        'tres de 10 ítems, correlacionadas': modelo({ Ansiedad: serie('Ansiedad_', 10), Depresion: serie('Depresion_', 10), Estres: serie('Estres_', 10) }, [], [], [['Ansiedad', 'Depresion'], ['Ansiedad', 'Estres'], ['Depresion', 'Estres']]),
    };
    for (const [que, M] of Object.entries(muchos)) {
        const lat = Object.values(M.nodos).filter(n => n.forma === 'elipse');
        assert.ok(new Set(lat.map(n => n.x)).size < lat.length, `${que}: en columna`);
        assert.deepEqual(loQueSeMonta(M), [], que);
        const lejos = M.flechas.filter(f => f.tipo === 'carga' && Math.abs(f.etiqueta.y - M.nodos[f.a].y) >= 15).map(f => `${f.a} (a ${(f.etiqueta.y - M.nodos[f.a].y).toFixed(0)})`);
        assert.deepEqual(lejos, [], `${que}: cada coeficiente, a la altura de su indicador`);
    }
});

test('(2027.01.13) una covarianza entre indicadores vecinos, curvada por fuera; dos rutas recíprocas, una hacia cada lado; y los coeficientes de dos rectas que se cruzan, fuera del cruce', () => {
    // entre dos cajas vecinas (a 6 una de otra), la covarianza iba recta y su coeficiente caía sobre sus nombres
    // (por fuera: su coeficiente, al otro lado de la recta entre las dos cajas que su latente; con una latente sola, de la que
    // nada lo impide, también; entre sus cargas se confundía con el coeficiente de una de ellas)
    /** @param {import('../../src/analizador/sem-diagrama.js').Disposicion} D @param {string} x @param {string} y @param {string} F */
    const porFuera = (D, x, y, F) => {
        const f = /** @type {any} */ (D.flechas.find(g => g.de === x && g.a === y)), A = D.nodos[x], B = D.nodos[y];
        const lado = (/** @type {{x:number,y:number}} */ p) => Math.sign((B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x));
        return f.curva && lado(f.etiqueta) * lado(D.nodos[F]) < 0;
    };
    const vecinas = modelo({ F1: serie('a', 6), F2: serie('b', 6), F3: serie('c', 6) }, [], [], [['a1', 'a2'], ['a3', 'a4'], ['c5', 'c6']]);
    assert.deepEqual(loQueSeMonta(vecinas), []);
    for (const [x, y, F] of [['a1', 'a2', 'F1'], ['a3', 'a4', 'F1'], ['c5', 'c6', 'F3']]) assert.ok(porFuera(vecinas, x, y, F), `${x} ~~ ${y}: curvada, por fuera de ${F}`);
    for (const [x, y] of [['a1', 'a2'], ['a7', 'a8']]) {
        const sola = modelo({ F: serie('a', 8) }, [], [], [[x, y]]);
        assert.deepEqual(loQueSeMonta(sola), [], `una latente de 8 con ${x} ~~ ${y}`);
        assert.ok(porFuera(sola, x, y, 'F'), `una latente de 8: ${x} ~~ ${y}, curvada por fuera de ella`);
    }
    // Y1 → Y2 e Y2 → Y1, vecinas: iban una encima de la otra, como una covarianza, con un coeficiente sobre el otro
    const reciproco = modelo({}, [['X', 'Y1'], ['Y1', 'Y2'], ['Y2', 'Y1'], ['Z', 'Y2']], ['X', 'Y1', 'Y2', 'Z']);
    assert.deepEqual(loQueSeMonta(reciproco), []);
    const { Y1, Y2 } = reciproco.nodos;
    const ida = /** @type {any} */ (reciproco.flechas.find(f => f.de === 'Y1' && f.a === 'Y2')), vuelta = /** @type {any} */ (reciproco.flechas.find(f => f.de === 'Y2' && f.a === 'Y1'));
    /** De qué lado de la recta de Y1 a Y2 queda un punto. @param {{x:number,y:number}} p */
    const lado = p => Math.sign((Y2.x - Y1.x) * (p.y - Y1.y) - (Y2.y - Y1.y) * (p.x - Y1.x));
    assert.ok(ida.curva && vuelta.curva && lado(ida.control) * lado(vuelta.control) < 0, 'curvadas, una hacia cada lado');
    // dos predictores, dos mediadoras y dos consecuencias, con rutas que se cruzan: por columnas, y sus coeficientes fuera del
    // cruce (quedaban uno encima del otro, y se elegía la fila, con seis regresiones curvas)
    const cruce = modelo({}, [['X1', 'M1'], ['X2', 'M1'], ['X1', 'M2'], ['X2', 'M2'], ['M1', 'Y1'], ['M2', 'Y1'], ['M1', 'Y2'], ['M2', 'Y2'], ['X1', 'Y2']], ['X1', 'X2', 'M1', 'M2', 'Y1', 'Y2'], [['X1', 'X2']]);
    assert.deepEqual(loQueSeMonta(cruce), []);
    const n = cruce.nodos;
    assert.ok(n.X1.x === n.X2.x && n.X2.x < n.M1.x && n.M1.x === n.M2.x && n.M2.x < n.Y1.x && n.Y1.x === n.Y2.x, 'por columnas');
    assert.ok(cruce.flechas.filter(f => f.curva && f.tipo === 'regresion').length <= 1, 'una regresión curva como mucho');
});

test('(2027.01.13) con 20 y 24 factores correlacionados, deprisa (en la 2027.01.12, 2,3 y 4,3 s); y la figura del Word, sin pasar del alto de la página', () => {
    for (const k of [20, 24]) {
        const factores = Object.fromEntries(Array.from({ length: k }, (_, i) => [`F${i + 1}`, serie(`v${i + 1}_`, 3)]));
        /** @type {Array<[string, string]>} */
        const correlaciones = [];
        for (let a = 1; a <= k; a++) for (let b = a + 1; b <= k; b++) correlaciones.push([`F${a}`, `F${b}`]);
        const t0 = performance.now();
        const D = modelo(factores, [], [], correlaciones);
        const ms = performance.now() - t0;
        assert.ok(ms < 2500, `${k} factores: ${ms.toFixed(0)} ms`);
        assert.equal(D.flechas.length, 3 * k + k * (k - 1) / 2, 'todas sus flechas');
    }
    assert.deepEqual(tamanoEnLaPagina({ ancho: 640, alto: 475 }), { w: 600, h: 445 }, 'a lo ancho de la página');
    assert.deepEqual(tamanoEnLaPagina({ ancho: 640, alto: 1000 }), { w: 435, h: 680 }, 'a lo alto de ella');
});

test('(2027.01.13) en columna, una carga cruzada a un indicador de otra latente de nombre largo no pasa por su elipse (curvada para llegar de lado, la atravesaba)', () => {
    for (const largo of ['Apoyo_social_percibido_de_la_familia_y_amigos', 'Autoeficacia_academica_general_percibida']) {
        for (const indicador of ['v1_1', 'v1_2']) {
            const D = modelo({ [largo]: serie('v1_', 8), Apoyo_2: [...serie('v2_', 8), indicador], Apoyo_3: serie('v3_', 8) }, []);
            assert.ok(D.alto > D.ancho, `${largo}: en columna (${D.ancho}×${D.alto})`);
            assert.deepEqual(loQueSeMonta(D), [], `${largo}, con la carga cruzada Apoyo_2 → ${indicador}`);
        }
    }
    // (2027.01.14, revisión) y una a un indicador del medio de otra latente, en la otra columna: con las dos cargas llegando al
    // mismo punto de su caja, la cruzada pasaba por el coeficiente de la otra
    const cruzada = modelo({ F1: serie('v1_', 8), F2: serie('v2_', 8), F3: [...serie('v3_', 8), 'v1_5'] }, []);
    assert.deepEqual(loQueSeMonta(cruzada), [], 'la carga cruzada F3 → v1_5');
    assert.ok(puntosEnElWord(cruzada) >= 8, `la carga cruzada F3 → v1_5: ${cruzada.ancho} × ${cruzada.alto}, de ${puntosEnElWord(cruzada).toFixed(1)} puntos`);
});

/**
 * (2027.01.14) Las puntas de una flecha (la del final y, en una covarianza, la del principio): el triángulo del marcador (8 × 6
 * a la escala del grosor del trazo, 1,4: 11,2 de largo y 8,4 de ancho), en la dirección de su trazo en el extremo, leído del
 * atributo d de la flecha (sin el módulo).
 * @param {{ d: string, tipo: string }} f
 * @returns {Array<Array<{x:number,y:number}>>}
 */
function puntasDe(f) {
    const n = (f.d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number), curva = /Q/.test(f.d);
    const p0 = { x: n[0], y: n[1] }, c = curva ? { x: n[2], y: n[3] } : null, p2 = curva ? { x: n[4], y: n[5] } : { x: n[2], y: n[3] };
    /** el triángulo con la punta en a, que viene de b @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
    const triangulo = (a, b) => {
        const l = Math.hypot(a.x - b.x, a.y - b.y) || 1, ux = (a.x - b.x) / l, uy = (a.y - b.y) / l, base = { x: a.x - ux * 11.2, y: a.y - uy * 11.2 };
        return [a, { x: base.x - uy * 4.2, y: base.y + ux * 4.2 }, { x: base.x + uy * 4.2, y: base.y - ux * 4.2 }];
    };
    const out = [triangulo(p2, c || p0)];
    if (f.tipo === 'covarianza') out.push(triangulo(p0, c || p2));
    return out;
}
/** ¿Qué parte del triángulo cae dentro de la caja? (en una rejilla de 0,2) @param {Array<{x:number,y:number}>} t @param {{x:number,y:number,w:number,h:number}} e */
function parteTapada(t, e) {
    const s = (/** @type {{x:number,y:number}} */ p, /** @type {{x:number,y:number}} */ a, /** @type {{x:number,y:number}} */ b) => (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
    const xs = t.map(p => p.x), ys = t.map(p => p.y);
    let dentro = 0, tapado = 0;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.2) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.2) {
        const p = { x, y }, d1 = s(p, t[0], t[1]), d2 = s(p, t[1], t[2]), d3 = s(p, t[2], t[0]);
        if ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue;
        dentro++;
        if (Math.abs(x - e.x) < e.w / 2 && Math.abs(y - e.y) < e.h / 2) tapado++;
    }
    return dentro ? tapado / dentro : 0;
}

test('(2027.01.14) ningún coeficiente tapa una punta (de 11,2 × 8,4); y en columna, una covarianza entre dos ítems contiguos, también de dos latentes, curvada por fuera y con su trazo a la vista', () => {
    const it = (/** @type {string} */ p) => serie(p, 6);
    /** @type {Array<[string, string]>} */
    const mediacion = [['Apoyo', 'Autoeficacia'], ['Autoeficacia', 'Engagement'], ['Apoyo', 'Engagement']];
    const latentes = { Apoyo: it('Apoyo_familia_'), Autoeficacia: it('Autoeficacia_'), Engagement: it('Engagement_') };
    const casos = {
        // (en filas, el coeficiente de una carga iba al 0,86 de ella: tapaba hasta el 46 % de su punta)
        'el caso estructural': modelo({ Apoyo: serie('ASP', 6), Autoeficacia: serie('AA', 6), Engagement: serie('EA', 6) }, mediacion),
        'una latente de 18': modelo({ F: [...serie('ASP', 6), ...serie('AA', 6), ...serie('EA', 6)] }, []),
        // (en columna, la curva entre dos contiguos dejaba bajo su coeficiente la mitad de su trazo y parte de sus puntas)
        'en columna, covarianzas entre contiguos': modelo(latentes, mediacion, [], [['Apoyo_familia_1', 'Apoyo_familia_2'], ['Autoeficacia_3', 'Autoeficacia_4'], ['Engagement_5', 'Engagement_6']]),
        // (entre el último de una latente y el primero de la siguiente, a 24, iba recta: el 67 % y sus dos puntas, debajo)
        'en columna, covarianzas entre latentes': modelo(latentes, mediacion, [], [['Apoyo_familia_6', 'Autoeficacia_1'], ['Autoeficacia_6', 'Engagement_1']]),
    };
    for (const [que, D] of Object.entries(casos)) {
        assert.deepEqual(loQueSeMonta(D), [], que);
        const tapadas = D.flechas.flatMap(f => puntasDe(f).map((t, i) => [f, i, Math.max(...D.flechas.map(g => parteTapada(t, g.etiqueta)))]))
            .filter(([, , parte]) => /** @type {number} */ (parte) > 0.005).map(([f, i, parte]) => `${/** @type {any} */ (f).de} → ${/** @type {any} */ (f).a}${i ? ' (al principio)' : ''}: ${(100 * /** @type {number} */ (parte)).toFixed(0)} %`);
        assert.deepEqual(tapadas, [], `${que}: puntas tapadas`);
        for (const f of D.flechas.filter(g => g.tipo === 'covarianza' && D.nodos[g.de].forma === 'caja')) {
            const e = f.etiqueta, ps = f.puntos, fuera = ps.filter(p => !(Math.abs(p.x - e.x) < e.w / 2 && Math.abs(p.y - e.y) < e.h / 2)).length;
            assert.ok(f.curva && fuera / ps.length >= 0.5, `${que}: ${f.de} ~~ ${f.a}, curvada y con su trazo a la vista (${(100 * fuera / ps.length).toFixed(0)} %)`);
            assert.ok(e.x < D.nodos[f.de].x - D.nodos[f.de].w / 2, `${que}: ${f.de} ~~ ${f.a}, por fuera (a la izquierda de sus cajas)`);
        }
    }
});

test('(2027.01.14) en filas, con muchos indicadores en abanico, el coeficiente de cada carga, frente a su indicador (no frente al de al lado)', () => {
    const casos = {
        // (hasta la 2027.01.13, 14 frente al de al lado)
        'dos latentes de 15 con una mediadora': modelo({ F1: serie('F1_', 15), F2: serie('F2_', 15) }, [['F1', 'x1'], ['x1', 'F2'], ['F1', 'F2']], ['x1']),
        'una latente de 18': modelo({ F: [...serie('ASP', 6), ...serie('AA', 6), ...serie('EA', 6)] }, []),
        'una latente de 12 con dos covariables': modelo({ F: [...serie('ASP', 6), ...serie('AA', 6)] }, [['Edad', 'F'], ['Sexo', 'F']], ['Edad', 'Sexo']),
    };
    for (const [que, D] of Object.entries(casos)) {
        assert.deepEqual(loQueSeMonta(D), [], que);
        const cajas = Object.values(D.nodos).filter(n => n.forma === 'caja');
        const frente = D.flechas.filter(f => f.tipo === 'carga').flatMap(f => {
            const B = D.nodos[f.a], e = f.etiqueta;
            const otro = cajas.find(C => C !== B && Math.abs(C.y - B.y) < 1 && Math.abs(e.x - C.x) < C.w / 2 && Math.abs(e.x - B.x) >= B.w / 2);
            return otro ? [`«${f.texto}» de ${f.a}, frente a ${otro.nombre}`] : [];
        });
        assert.deepEqual(frente, [], que);
    }
});

test('(2027.01.14, revisión) sin ningún sitio libre, cada coeficiente en el que menos tapa: con 8 y 10 factores correlacionados de 4 ítems, en el Word de 8 puntos o más y ningún coeficiente sobre otro; con 6 exógenas correlacionadas, nada montado; y la rejilla con que se busca lo ya trazado no cambia nada', () => {
    /** Todas las parejas. @param {string[]} vs @returns {Array<[string, string]>} */
    const pares = vs => vs.flatMap((a, i) => vs.slice(i + 1).map(b => /** @type {[string, string]} */ ([a, b])));
    /** k factores correlacionados de 4 ítems. @param {number} k @param {{ celda?: number }} [op] */
    const factores = (k, op) => modelo(Object.fromEntries(serie('F', k).map((F, i) => [F, serie(`v${i + 1}_`, 4)])), [], [], pares(serie('F', k)), op);
    /** k exógenas correlacionadas, una mediadora y una consecuencia. @param {number} k @param {{ celda?: number }} [op] */
    const exogenas = (k, op) => {
        const xs = serie('X', k);
        /** @type {Array<[string, string]>} */
        const regresiones = [...xs.map(x => /** @type {[string, string]} */ ([x, 'M'])), ...xs.map(x => /** @type {[string, string]} */ ([x, 'Y'])), ['M', 'Y']];
        return modelo({}, regresiones, [...xs, 'M', 'Y'], pares(xs), op);
    };
    // con muchas covarianzas no siempre hay un sitio libre: hasta la 2027.01.13, el primero de sus sitios, tapara lo que tapara
    // (y al recolocarlo, solo a uno libre); así, con 8 factores, la disposición menos mala era una fila de 1684, de 3,2 puntos
    for (const k of [8, 10]) {
        const D = factores(k);
        assert.ok(puntosEnElWord(D) >= 8, `${k} factores: ${D.ancho} × ${D.alto}, ${puntosEnElWord(D).toFixed(2)} puntos`);
        assert.deepEqual(loQueSeMonta(D).filter(m => /uno sobre otro/.test(m)), [], `${k} factores: un coeficiente sobre otro, antes que sobre una flecha`);
    }
    // lo que pasa por un coeficiente, tramo a tramo (en sus puntos, cada 4, con 6 exógenas quedaba uno en un cruce y la disposición
    // menos mala era otra, de 916 de ancho)
    const seis = exogenas(6);
    assert.ok(puntosEnElWord(seis) >= 8, `6 exógenas: ${seis.ancho} × ${seis.alto}`);
    assert.deepEqual(loQueSeMonta(seis), [], '6 exógenas');
    // la rejilla (celdas de 64) da lo mismo que mirarlo todo (una sola celda): no se le escapa nada de lo trazado
    for (const [que, f] of /** @type {Array<[string, (op?: { celda?: number }) => import('../../src/analizador/sem-diagrama.js').Disposicion]>} */ ([['10 factores', op => factores(10, op)], ['8 exógenas', op => exogenas(8, op)]])) {
        assert.equal(svgDelDiagrama(f()), svgDelDiagrama(f({ celda: 1e9 })), `${que}: con la rejilla, otro diagrama que mirándolo todo`);
    }
});

test('(2027.01.15, revisión) en columna, una escala larga de nombres medios (un factor de 20 a 22 ítems como «Ansiedad_1», dos de 20): sus cargas, curvadas para llegar de lado, y en el Word de 8 puntos o más (dos factores, de 7 o más), sin nada montado', () => {
    // la curva de una carga que llega de lado se mide como se dibuja (hasta el lado de su indicador): medida hasta el centro de
    // su caja, cerca de ella pasaba a 2–4 de la vecina, y con la holgura de 4 de la 2027.01.14 las de los extremos quedaban
    // rectas y la disposición en columna se perdía (un factor de 21, de 8,4 a 5,7 puntos; dos de 20, de 7,1 a 2,6)
    const casos = /** @type {Array<[string, import('../../src/analizador/sem-diagrama.js').Disposicion, number]>} */ ([
        ['un factor de 20 («Ansiedad_1»…)', modelo({ Ansiedad: serie('Ansiedad_', 20) }, []), 8],
        ['un factor de 21 («Ansiedad_1»…)', modelo({ Ansiedad: serie('Ansiedad_', 21) }, []), 8],
        ['un factor de 22 («Agotamiento_1»…)', modelo({ Agotamiento: serie('Agotamiento_', 22) }, []), 8],
        ['dos factores de 20', modelo({ Agotamiento: serie('Agotamiento_', 20), Cinismo: serie('Cinismo_', 20) }, [], [], [['Agotamiento', 'Cinismo']]), 7],
    ]);
    for (const [que, D, minimo] of casos) {
        assert.ok(puntosEnElWord(D) >= minimo, `${que}: ${D.ancho} × ${D.alto}, ${puntosEnElWord(D).toFixed(2)} puntos`);
        assert.deepEqual(loQueSeMonta(D), [], que);
        // en columna, cada carga a un indicador más alto o más bajo que su latente, curvada (recta, la de los extremos cruzaba las
        // de sus vecinos)
        const rectas = D.flechas.filter(f => f.tipo === 'carga' && !f.curva && Math.abs(D.nodos[f.a].y - D.nodos[f.de].y) > 1).map(f => f.a);
        assert.deepEqual(rectas, [], `${que}: cargas rectas`);
    }
});

test('(2027.01.16, revisión) dos coeficientes que se montan donde se cruzan dos flechas cortas: se mueven los dos a la vez, a la pareja de sus sitios que menos tapa, y ninguno queda bajo el otro (sin perder letra)', () => {
    // al recolocarlos, cada uno se probaba con el otro quieto: en el centro del cruce, el primero tapaba todos los sitios del
    // segundo y ninguno se movía (el modelo de rutas de la revisión, de 9 variables: «1.00», de Variable_7 → Variable_8, entero
    // bajo «-0.14», de Variable_6 → Variable_9; y otro de 8, con las covarianzas de x3 y de x4 con x5, una sobre otra)
    /**
     * Un modelo de rutas sin latentes, con sus rutas escritas «x>y:coef» (una regresión) o «x~y:coef» (una covarianza).
     * @param {string[]} observadas @param {string} rutas @param {{ celda?: number }} [op]
     */
    const deRutas = (observadas, rutas, op) => disposicionDelDiagrama({ latentes: [], indicadoresDe: {}, observadas, rutas: rutas.trim().split(/\s+/).map(t => {
        const m = /^(\w+)([>~])(\w+):(-?[\d.]+)$/.exec(t);
        assert.ok(m, t);
        return /** @type {import('../../src/analizador/sem-diagrama.js').Ruta} */ ({ de: m[1], a: m[3], tipo: m[2] === '>' ? 'regresion' : 'covarianza', texto: m[4] });
    }) }, op);
    const casos = /** @type {Array<[string, string[], string, number]>} */ ([
        ['9 variables (el de la revisión)', serie('Variable_', 9), `
            Variable_2>Variable_6:0.11 Variable_4>Variable_6:-0.94 Variable_1>Variable_7:0.07 Variable_2>Variable_7:0.63 Variable_3>Variable_7:0.25
            Variable_4>Variable_7:0.16 Variable_4>Variable_8:0.57 Variable_5>Variable_8:0.42 Variable_7>Variable_8:1.00 Variable_1>Variable_9:0.77
            Variable_2>Variable_9:0.22 Variable_3>Variable_9:0.73 Variable_4>Variable_9:0.67 Variable_6>Variable_9:-0.14
            Variable_1~Variable_2:0.42 Variable_1~Variable_3:0.07 Variable_1~Variable_4:0.33 Variable_1~Variable_5:-0.69 Variable_2~Variable_3:0.44
            Variable_2~Variable_4:0.74 Variable_2~Variable_5:0.85 Variable_3~Variable_4:0.05 Variable_3~Variable_5:0.07 Variable_4~Variable_5:1.00`, 6.9],
        ['8 variables, seis correlacionadas', serie('x', 8), `
            x1>x7:0.19 x2>x7:0.29 x3>x7:0.60 x1>x8:0.31 x3>x8:0.67 x6>x8:0.43
            x1~x2:0.72 x1~x3:0.06 x1~x4:0.18 x1~x5:0.05 x1~x6:0.53 x2~x3:0.91 x2~x4:0.21 x2~x5:0.23 x2~x6:0.73 x3~x4:0.88 x3~x5:-0.59
            x3~x6:0.17 x4~x5:0.39 x4~x6:0.60 x5~x6:0.52`, 8.4],
    ]);
    for (const [que, observadas, rutas, letra] of casos) {
        const D = deRutas(observadas, rutas);
        assert.deepEqual(loQueSeMonta(D).filter(m => /uno sobre otro/.test(m)), [], que);
        // con la misma disposición que antes de moverlos a la vez (la letra en el Word, la de entonces)
        assert.ok(puntosEnElWord(D) >= letra, `${que}: ${D.ancho} × ${D.alto}, ${puntosEnElWord(D).toFixed(2)} puntos`);
        assert.equal(svgDelDiagrama(D), svgDelDiagrama(deRutas(observadas, rutas, { celda: 1e9 })), `${que}: con la rejilla, otro diagrama que mirándolo todo`);
    }
});
