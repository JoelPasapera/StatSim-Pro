// tests/integration/analizador-oraculo.test.js — el motor estadístico del Analizador contra valores de referencia de SciPy
// (tests/oracle/analizador_fixture.json, generado por analizador_oraculo.py). Misma muestra, mismo estimador:
// las tolerancias son numéricas, no muestrales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AnalizadorEstadistico } from '../../src/analizador/estadistica.js';
import { Fiabilidad } from '../../src/analizador/fiabilidad.js';

const fx = JSON.parse(fs.readFileSync(new URL('../oracle/analizador_fixture.json', import.meta.url), 'utf8'));
const D = fx.datos, R = fx.referencia, A = AnalizadorEstadistico;
const cerca = (obtenido, esperado, tol, que) => assert.ok(Math.abs(obtenido - esperado) <= tol, `${que}: ${obtenido} vs ${esperado} (tol ${tol})`);
const cercaP = (obtenido, esperado, que) => cerca(obtenido, esperado, Math.max(0.002, 0.03 * esperado), que);   // p-valores: 3 % relativo

test('descriptivos: media, DE, mediana, asimetría y curtosis', () => {
    for (const [clave, datos] of [['descriptivas_x', D.x], ['descriptivas_z', D.z]]) {
        const d = A.calcularDescriptivas(datos), r = R[clave];
        cerca(d.media, r.media, 1e-6, clave + ' media'); cerca(d.desviacion, r.desviacion, 1e-6, clave + ' DE'); cerca(d.mediana, r.mediana, 1e-6, clave + ' mediana');
        cerca(d.asimetria, r.asimetria, 0.02, clave + ' asimetría'); cerca(d.curtosis, r.curtosis, 0.05, clave + ' curtosis');
    }
});

test('correlaciones: Pearson y Spearman con sus p-valores', () => {
    const p = A.correlacionPearson(D.x, D.y, 'bilateral');
    cerca(p.coeficiente, R.pearson.r, 1e-6, 'r de Pearson'); cercaP(p.pValor, R.pearson.p, 'p de Pearson');
    const s = A.correlacionSpearman(D.x, D.y, 'bilateral');
    cerca(s.coeficiente, R.spearman.rho, 1e-6, 'rho de Spearman'); cercaP(s.pValor, R.spearman.p, 'p de Spearman');
});

test('normalidad: Shapiro–Wilk sobre una variable asimétrica', () => {
    const sw = A.shapiroWilk(D.z);
    cerca(sw.estadistico, R.shapiro_z.W, 0.002, 'W'); cerca(sw.pValor, R.shapiro_z.p, Math.max(0.001, 0.1 * R.shapiro_z.p), 'p de Shapiro');
});

test('dos grupos: t de Student, t de Welch, U de Mann–Whitney, Levene y d de Cohen', () => {
    const a = D.y_g.filter((_, i) => D.g2[i] === 0), b = D.y_g.filter((_, i) => D.g2[i] === 1);
    const t = A.pruebaTStudent(a, b); cerca(Math.abs(t.estadistico), Math.abs(R.t_student.t), 1e-6, 't'); assert.equal(t.gl, R.t_student.gl); cercaP(t.pValor, R.t_student.p, 'p de t');
    const w = A.pruebaTWelch(a, b); cerca(Math.abs(w.estadistico), Math.abs(R.t_welch.t), 1e-6, 't de Welch'); cercaP(w.pValor, R.t_welch.p, 'p de Welch');
    const u = A.pruebaMannWhitney(a, b); cerca(u.U, R.mann_whitney.U, 1e-6, 'U'); cercaP(u.pValor, R.mann_whitney.p, 'p de U');
    const l = A.pruebaLevene([a, b]); cerca(l.estadistico, R.levene.F, 1e-4, 'F de Levene (Brown–Forsythe, centrado en la mediana)'); cercaP(l.pValor, R.levene.p, 'p de Levene');
    const d = A.calcularCohenD(a, b); cerca(Math.abs(d.d), Math.abs(R.cohen_d), 1e-6, 'd de Cohen');
});

test('tres grupos: ANOVA y Kruskal–Wallis', () => {
    const g = [1, 2, 3].map(k => D.y.filter((_, i) => D.g3[i] === k));
    const f = A.anovaUnaVia(g); cerca(f.F, R.anova.F, 1e-4, 'F'); cercaP(f.pValor, R.anova.p, 'p de F');
    const k = A.kruskalWallis(g); cerca(k.H, R.kruskal.H, 1e-4, 'H'); cercaP(k.pValor, R.kruskal.p, 'p de H');
});

test('regresión lineal simple y alfa de Cronbach', () => {
    const r = A.calcularRegresionLineal(D.x, D.y);
    cerca(r.pendiente, R.regresion.pendiente, 1e-6, 'pendiente'); cerca(r.intercepto, R.regresion.intercepto, 1e-6, 'intercepto'); cerca(r.r2, R.regresion.r2, 1e-6, 'R²'); cercaP(r.pPendiente, R.regresion.p, 'p de la pendiente');
    const items = D.items[0].map((_, j) => 'it' + (j + 1));
    const datos = D.items.map(fila => Object.fromEntries(fila.map((v, j) => [items[j], v])));
    const res = Fiabilidad.analizarGrupo(datos, { nombre: 'Escala', etiqueta: 'Escala', origen: 'manual', items, invertidos: [] });
    assert.ok(!res.error, res.error); cerca(res.alfa, R.alfa_cronbach, 1e-6, 'alfa');
});

test('chi cuadrado de independencia (2×2, sin corrección)', () => {
    const v1 = [], v2 = [];
    D.tabla.forEach((fila, i) => fila.forEach((c, j) => { for (let k = 0; k < c; k++) { v1.push('F' + i); v2.push('C' + j); } }));
    const chi = A.chiCuadradoIndependencia(v1, v2);
    cerca(chi.chiCuadrado, R.chi2.chi2, 1e-4, 'χ²'); assert.equal(chi.gl, R.chi2.gl); cercaP(chi.pValor, R.chi2.p, 'p de χ²');
});
