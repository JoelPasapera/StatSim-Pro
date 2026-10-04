// tests/unit/siglas.test.js — siglas de escalas, sociodemográficas y tests: solo letras, únicas, compatibles con las
// de siempre cuando no hay choque, y sin ambigüedad entre «sigla + número de ítem» (antes: I_2 → ítems I_21, I_22…).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { EtiquetasVariables } from '../../src/shared/etiquetas-variables.js';
import { Fiabilidad } from '../../src/analizador/fiabilidad.js';

const g = new GeneradorDatos();
const siglas = nombres => { const u = new Set(); return nombres.map(n => g.generarNombreCortoUnico(n, u)); };

test('sin choque, las siglas son las iniciales de siempre', () => {
    assert.deepEqual(siglas(['Percepción emocional', 'Memoria de trabajo', 'Estrés percibido', 'EQ-i:YV', 'TMMS24', 'Regulación emocional']), ['PE', 'MDT', 'EP', 'E', 'T', 'RE']);
});

test('con choque, se alarga con letras la palabra que distingue; nunca números ni guiones bajos', () => {
    assert.deepEqual(siglas(['Intrapersonal', 'Interpersonal', 'Adaptabilidad']), ['I', 'IN', 'A']);
    assert.deepEqual(siglas(['Percepción emocional', 'Percepción espacial', 'Presión escolar']), ['PE', 'PES', 'PRE']);
    assert.deepEqual(siglas(['Auto', 'Autoestima', 'Autonomía', 'Autoeficacia', 'Autocontrol']), ['A', 'AU', 'AUT', 'AUTO', 'AUTOC']);
    assert.deepEqual(siglas(['Escala 1', 'Escala 2', 'Escala 3']), ['E', 'ES', 'ESC'], 'los dígitos del nombre no pasan a la sigla');
});

test('las tildes se normalizan sin perder la letra; nombres sin letras tienen respaldo', () => {
    assert.deepEqual(siglas(['Índice de masa corporal', 'Ética', 'Ñandú']), ['IDMC', 'E', 'N']);
    assert.deepEqual(siglas(['123', '', '—']), ['V', 'VA', 'VB']);
});

test('propiedad: 200 conjuntos aleatorios de nombres → siglas únicas, solo letras y sin choques «sigla + ítem»', () => {
    const palabras = ['auto', 'autoestima', 'ansiedad', 'apego', 'Índice', 'ética', 'estrés', 'estado', 'emocional', 'escolar', 'de', 'la', 'percepción', 'presión', 'inter', 'intra', 'personal', 'social', 'regulación', 'rasgo', '2', 'II', 'EQ-i'];
    let semilla = 20261006;
    const azar = n => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % n; };
    for (let r = 0; r < 200; r++) {
        const nombres = Array.from({ length: 2 + azar(38) }, () => Array.from({ length: 1 + azar(3) }, () => palabras[azar(palabras.length)]).join(' '));
        const s = siglas(nombres);
        assert.equal(new Set(s).size, s.length, 'únicas: ' + s.join(','));
        s.forEach(x => assert.match(x, /^[A-Z]{1,10}$/));
        const items = new Set();
        s.forEach(x => { for (let j = 1; j <= 60; j++) { assert.ok(!items.has(x + j), `choque de ítems: ${x}${j}`); items.add(x + j); } });
    }
});

test('base generada: Intrapersonal e Interpersonal dan ítems I1… e IN1…, y el Analizador los separa sin la estructura', () => {
    const esc = (nombre, prueba) => ({ nombre, nombreCorto: null, prueba, tipo: 'dimension', numItems: 8, media: 24, desviacion: 4, minimo: 1, maximo: 5, alfa: 0.8, distribucion: 'normal', invertidos: 0 });
    const g2 = new GeneradorDatos();
    const usadas = new Set();
    const pruebas = [esc('Intrapersonal', 'EQ'), esc('Interpersonal', 'EQ'), esc('Adaptabilidad', 'EQ')].map(p => ({ ...p, nombreCorto: g2.generarNombreCortoUnico(p.nombre, usadas) }));
    g2.configuracion = { tamanoMuestra: 200, semilla: 3, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: {}, pruebas,
        sociodemograficos: [], correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} };
    g2.configuracion.gruposPruebas = g2.agruparPruebas(pruebas);
    const datos = g2.generarBaseDatos().aObjetos();
    const cols = Object.keys(datos[0]);
    assert.ok(['I1', 'I8', 'IN1', 'IN8', 'Dimension_I', 'Dimension_IN'].every(c => cols.includes(c)) && !cols.some(c => /_\d/.test(c)), cols.join(' '));
    EtiquetasVariables.limpiar();   // base «externa»: el Analizador solo tiene los nombres de columna
    const grupos = Fiabilidad.detectarGrupos(datos);
    const de = n => (grupos.find(x => x.nombre === n) || { items: [] }).items.length;
    assert.deepEqual([de('I'), de('IN'), de('A')], [8, 8, 8]);
});
