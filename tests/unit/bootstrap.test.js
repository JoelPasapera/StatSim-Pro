// tests/unit/bootstrap.test.js — paso 2B: generador con semilla, remuestras e intervalos (percentil y BCa) contra el
// oráculo de Python; coeficientes clásicos idénticos a la tabla de fiabilidad; versiones rápidas iguales a las completas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearAleatorio } from '../../src/analizador/psicometria/aleatorio.js';
import { bootstrap, jackknife, intervaloPercentil, intervaloBCa, bootstrapGrupo, cuantilLineal } from '../../src/analizador/psicometria/bootstrap.js';
import { coeficientesClasicos } from '../../src/analizador/psicometria/clasica.js';
import { policorica, policoricaDesde } from '../../src/analizador/psicometria/policorica.js';
import { coeficientesOrdinales, coeficientesOrdinalesRapidos, fiabilidadOrdinal } from '../../src/analizador/psicometria/ordinal.js';
import { Fiabilidad } from '../../src/analizador/fiabilidad.js';

const fx = JSON.parse(fs.readFileSync(new URL('../oracle/bootstrap_fixture.json', import.meta.url), 'utf8'));
const fo = JSON.parse(fs.readFileSync(new URL('../oracle/ordinal_fixture.json', import.meta.url), 'utf8'));
const cerca = (a, b, tol, que) => assert.ok(Math.abs(a - b) <= tol, `${que}: ${a} vs ${b}`);

test('sfc32 con semilla: misma secuencia que el oráculo en Python, bit a bit', () => {
    for (const [s, esperada] of Object.entries(fx.secuencias)) {
        const g = crearAleatorio(Number(s));
        assert.deepEqual(Array.from({ length: 20 }, () => g.siguiente32()), esperada, 'semilla ' + s);
    }
});

test('remuestras, réplicas e intervalos percentil y BCa iguales al oráculo (media asimétrica y α de Cronbach)', () => {
    for (const c of fx.casos) {
        const est = c.estadistico === 'media'
            ? idx => ({ v: Array.from(idx).reduce((s, i) => s + c.datos[i], 0) / idx.length })
            : idx => ({ v: coeficientesClasicos(c.datos[0].map((_, j) => Array.from(idx, i => c.datos[i][j]))).alfa });
        const { reps } = bootstrap(c.datos.length, est, { B: c.B, semilla: c.semilla });
        reps.v.forEach((v, b) => cerca(v, c.replicas[b], 1e-12, `${c.estadistico} réplica ${b}`));
        const p = intervaloPercentil(reps.v, 0.95);
        cerca(p.inferior, c.percentil[0], 1e-12, 'percentil inferior'); cerca(p.superior, c.percentil[1], 1e-12, 'percentil superior');
        const todos = Int32Array.from({ length: c.datos.length }, (_, i) => i);
        const bca = intervaloBCa(reps.v, est(todos).v, jackknife(c.datos.length, est).v, 0.95);
        cerca(bca.z0, c.z0, 1e-12, 'z0'); cerca(bca.aceleracion, c.aceleracion, 1e-12, 'aceleración');
        cerca(bca.inferior, c.bca[0], 1e-12, 'BCa inferior'); cerca(bca.superior, c.bca[1], 1e-12, 'BCa superior');
    }
    assert.equal(cuantilLineal(Float64Array.from([1, 2, 3, 4]), 0.5), 2.5);
});

test('α y ω clásicos del módulo puro idénticos a los de la tabla de fiabilidad', () => {
    for (const nombre of ['likert5', 'tres_categorias', 'dicotomicos']) {
        const cols = fo.conjuntos[nombre].cols;
        const filas = cols[0].map((_, i) => Object.fromEntries(cols.map((c, j) => [`Q${j + 1}`, c[i]])));
        const r = Fiabilidad.analizarGrupo(filas, { nombre: 'Q', etiqueta: nombre, origen: 'manual', items: cols.map((_, j) => `Q${j + 1}`), invertidos: [] }, { ordinal: false });
        const c = coeficientesClasicos(cols);
        cerca(c.alfa, r.alfa, 1e-15, nombre + ' α'); cerca(c.omega, r.omega, 1e-15, nombre + ' ω');
    }
});

test('versiones rápidas del bootstrap iguales a las completas (policórica por Fisher scoring, ω por potencias)', () => {
    const c = fo.conjuntos.likert5.cols;
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) cerca(policoricaDesde(c[i], c[j], -0.2).rho, policorica(c[i], c[j]).rho, 1e-9, `ρ ${i}${j}`);
    const d = fo.conjuntos.dicotomicos.cols;   // tetracóricas por Newton con derivada analítica
    for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) cerca(policoricaDesde(d[i], d[j], 0.1).rho, policorica(d[i], d[j]).rho, 1e-10, `tetracórica ${i}${j}`);
    for (const nombre of ['likert5', 'tres_categorias', 'dicotomicos']) {
        const R = fiabilidadOrdinal(fo.conjuntos[nombre].cols).R, a = coeficientesOrdinales(R), b = coeficientesOrdinalesRapidos(R);
        cerca(b.alfa, a.alfa, 1e-15, nombre + ' α'); cerca(b.omega, a.omega, 1e-9, nombre + ' ω');
    }
});

test('bootstrap de una escala: reproducible con la misma semilla, intervalos que contienen el estimado', () => {
    const c = fo.conjuntos.likert5.cols;
    const r1 = bootstrapGrupo(c, { B: 200, semilla: 11 }), r2 = bootstrapGrupo(c, { B: 200, semilla: 11 }), r3 = bootstrapGrupo(c, { B: 200, semilla: 12 });
    assert.deepEqual(r1.intervalos, r2.intervalos, 'misma semilla, mismo resultado');
    assert.notDeepEqual(r1.intervalos.omega, r3.intervalos.omega, 'otra semilla, otras remuestras');
    for (const k of ['alfa', 'omega', 'alfaOrdinal', 'omegaOrdinal']) {
        const iv = r1.intervalos[k];
        assert.ok(iv && iv.inferior < r1.estimados[k] && r1.estimados[k] < iv.superior && iv.validas === 200, k);
    }
    const bca = bootstrapGrupo(c, { B: 200, semilla: 11, metodo: 'bca' });
    assert.ok(Number.isFinite(bca.intervalos.omegaOrdinal.z0) && bca.metodo === 'bca');
});

test('revisión 2026.10.10: progreso exacto con BCa (incluye el jackknife) y Worker que falla → la tarea se completa igual', async () => {
    const { procesar } = await import('../../src/analizador/psicometria/tareas-psicometricas.js');
    const c = fo.conjuntos.likert5.cols.map(col => col.slice(0, 80));
    const vistos = [];
    procesar('bootstrap', [{ clave: 'a', cols: c }, { clave: 'b', cols: c }], { B: 40, semilla: 3, metodo: 'bca' }, (h, t) => vistos.push([h, t]));
    const total = 2 * (40 + 80);
    assert.ok(vistos.every(([, t]) => t === total), 'el total incluye el jackknife');
    assert.deepEqual(vistos[vistos.length - 1], [total, total], 'termina en el 100 %');
    assert.ok(vistos.every(([h], i) => i === 0 || h >= vistos[i - 1][0]), 'el progreso nunca retrocede');
    // un Worker de módulo que no carga (navegadores antiguos): el servicio termina la tarea en el hilo principal
    globalThis.Worker = class { constructor() { setTimeout(() => this.onerror && this.onerror({ message: 'módulo no soportado' }), 5); } postMessage() {} terminate() {} };
    const s = await import('../../src/analizador/psicometria/servicio-psicometrico.js?falla');
    assert.equal(s.hayWorker(), true);
    const r = await s.ejecutarTarea('ordinal', [{ clave: 'x', cols: fo.conjuntos.likert5.cols }]).promesa;
    assert.ok(Math.abs(r[0].ordinal.alfa - fo.conjuntos.likert5.alfa) < 1e-9, 'resultado correcto pese al fallo del Worker');
    assert.equal(s.hayWorker(), false, 'no se vuelve a intentar con Worker');
    delete globalThis.Worker;
});
