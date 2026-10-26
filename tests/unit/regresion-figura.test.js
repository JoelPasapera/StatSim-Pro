// @ts-check
// tests/unit/regresion-figura.test.js — (2027.01.13, revisión) La figura de la regresión bivariada (regresion.js,
// graficoModelo: un lienzo, la que va al Word), con un lienzo de mentira que anota lo que se escribe en él y mide cada letra
// como un 0,6 de su tamaño: con valores del eje Y de 7 cifras, ninguno sale cortado por la izquierda ni se monta con el nombre
// del eje (hasta la 2027.01.12, con el margen fijo de 60, «10530356.7» salía como «0530356.7», encima de él); y unos nombres de
// ejes largos, más pequeños o cortados con «…», caben a lo largo de su eje. (2027.01.14, revisión) Y con valores del eje X de 7
// o de 10 cifras, ninguno sale cortado por los lados (con el margen derecho fijo de 20, «2456500000.0» se leía «24565000»);
// y con 17, tampoco el primero, por la izquierda (su margen, también a la medida del primer valor), y los que se escriben no se
// montan unos con otros (con 13 cifras o más se montaban: ahora el primero, el último y los de en medio que quepan).
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** @typedef {{ texto: string, x: number, y: number, px: number, alineado: string, girado: boolean }} Escrito */

/** Un lienzo de mentira: anota cada texto con su letra, su alineación y si va girado. */
function lienzoQueAnota() {
    /** @type {Escrito[]} */
    const escritos = [];
    let girado = false;
    /** @type {boolean[]} */
    const pila = [];
    const ctx = {
        font: '10px sans-serif', textAlign: 'start', fillStyle: '', strokeStyle: '', lineWidth: 1,
        fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {},
        save() { pila.push(girado); }, restore() { girado = /** @type {boolean} */ (pila.pop()); }, translate() {}, rotate() { girado = true; },
        /** @param {string} t */
        measureText(t) { return { width: String(t).length * 0.6 * parseFloat(this.font) }; },
        /** @param {string} texto @param {number} x @param {number} y */
        fillText(texto, x, y) { escritos.push({ texto: String(texto), x, y, px: parseFloat(this.font), alineado: this.textAlign, girado }); },
    };
    return { lienzo: { width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,' }, escritos };
}

test('(2027.01.13, revisión) la figura de la regresión bivariada: valores del eje Y de 7 cifras enteros y lejos del nombre del eje, y nombres largos que caben', async () => {
    const { lienzo, escritos } = lienzoQueAnota();
    /** @type {any} */ (globalThis).document = { createElement: () => lienzo };
    try {
        const { RegresionMultiple } = await import('../../src/analizador/regresion.js');
        const x = Array.from({ length: 40 }, (_, i) => 18 + i), y = x.map(e => 1200000 + 150000 * e);
        const MM = { tipoY: 'continua', ganador: { nombre: 'Lineal', B: [1200000, 150000] } };
        const largo = 'Ingreso familiar anual del hogar en soles, declarado por el jefe de hogar en la encuesta de 2025';
        const fig = /** @type {any} */ (RegresionMultiple).graficoModelo(x, y, MM, `${largo} (eje X)`, largo);
        assert.ok(fig && fig.w === 640 && fig.h === 400, 'la figura');
        const nombreY = /** @type {Escrito} */ (escritos.find(e => e.girado));
        // el nombre del eje Y, girado: a lo alto ocupa su letra, desde x = 14 hacia la izquierda y hasta un poco a la derecha
        const finDelNombre = 14 + 0.3 * nombreY.px;
        const valoresY = escritos.filter(e => e.alineado === 'right' && /^-?\d+(\.\d+)?$/.test(e.texto));
        assert.equal(valoresY.length, 6, 'los seis valores del eje Y');
        for (const v of valoresY) {
            const inicio = v.x - v.texto.length * 0.6 * v.px;
            assert.ok(inicio >= 0, `«${v.texto}», entero (empieza en ${inicio.toFixed(1)})`);
            assert.ok(inicio > finDelNombre + 2, `«${v.texto}», lejos del nombre del eje (empieza en ${inicio.toFixed(1)}; el nombre acaba en ${finDelNombre.toFixed(1)})`);
        }
        assert.ok(valoresY.some(v => v.texto.replace('-', '').split('.')[0].length >= 7), 'con valores de 7 cifras');
        // los nombres de los ejes, a lo largo de su eje (el área de datos: 400 − 40 − 50 de alto; a lo ancho, 640 − su margen − 20)
        assert.ok(nombreY.texto.length * 0.6 * nombreY.px <= 310 && nombreY.px >= 9, `el nombre del eje Y, de ${nombreY.texto.length} letras de ${nombreY.px} px: cabe en 310`);
        assert.ok(nombreY.texto.endsWith('…'), 'cortado con «…» (no cabe ni a 9 px)');
        const nombreX = /** @type {Escrito} */ (escritos.find(e => e.texto.includes('(eje X)') || e.texto.startsWith('Ingreso') && !e.girado));
        const margen = Math.min(...valoresY.map(v => v.x)) + 7;
        assert.ok(nombreX.texto.length * 0.6 * nombreX.px <= 640 - margen - 20, `el nombre del eje X cabe en ${640 - margen - 20}`);
    } finally {
        delete (/** @type {any} */ (globalThis).document);
    }
});

test('(2027.01.14, revisión) la figura de la regresión bivariada: los valores del eje X de 7, de 10 y de 17 cifras, enteros por los dos lados', async () => {
    for (const base of [1479000, 2456000000, 1.2e16]) {
        const { lienzo, escritos } = lienzoQueAnota();
        /** @type {any} */ (globalThis).document = { createElement: () => lienzo };
        try {
            const { RegresionMultiple } = await import('../../src/analizador/regresion.js');
            const x = Array.from({ length: 40 }, (_, i) => base + 13 * i * (base / 1479000)), y = x.map((e, i) => 20 + 0.5 * i);
            const MM = { tipoY: 'continua', ganador: { nombre: 'Lineal', B: [20, 0] } };
            const fig = /** @type {any} */ (RegresionMultiple).graficoModelo(x, y, MM, 'Ingreso', 'Puntaje');
            assert.ok(fig && fig.w === 640, 'la figura');
            const valoresX = escritos.filter(e => e.alineado === 'center' && !e.girado && /^-?\d+(\.\d+)?$/.test(e.texto));
            if (base < 1e15) assert.equal(valoresX.length, 6, 'los seis valores del eje X');
            else assert.ok(valoresX.length >= 2 && valoresX.length < 6, `con 17 cifras, el primero, el último y los que quepan: ${valoresX.length}`);
            assert.ok(valoresX.some(v => v.texto.split('.')[0].length >= 7), `con valores de 7 cifras o más (${valoresX.map(v => v.texto).join(', ')})`);
            for (const v of valoresX) {
                const mitad = v.texto.length * 0.6 * v.px / 2;
                assert.ok(v.x - mitad >= 0 && v.x + mitad <= 640, `«${v.texto}», entero (de ${(v.x - mitad).toFixed(1)} a ${(v.x + mitad).toFixed(1)}, en 640)`);
            }
            const tramos = valoresX.map(v => [v.x - v.texto.length * 0.6 * v.px / 2, v.x + v.texto.length * 0.6 * v.px / 2]).sort((a, b) => a[0] - b[0]);
            for (let i = 1; i < tramos.length; i++) assert.ok(tramos[i][0] >= tramos[i - 1][1] + 4, `dos valores del eje X montados (${base}): ${tramos.map(t => t.map(n => n.toFixed(0)).join('–')).join(', ')}`);
        } finally {
            delete (/** @type {any} */ (globalThis).document);
        }
    }
});
