// tests/unit/afe.test.js — paso 3 (AFE) contra el oráculo de NumPy/SciPy (tests/oracle/afe_fixture.json) y propiedades
// que toda solución debe cumplir (la rotación no cambia las comunalidades; Φ con diagonal 1; cota de Ledermann).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analizarAFE, kmo, bartlett, analisisParalelo, rotar, ordenarFactores, maximoFactores, interpretarKMO, factoresSugeridos } from '../../src/analizador/psicometria/afe.js';
import { ejesPrincipales } from '../../src/analizador/psicometria/factorial.js';
import { matrizCorrelaciones } from '../../src/analizador/psicometria/clasica.js';
import { multiplicar, traspuesta, eigenSimetrica } from '../../src/analizador/psicometria/algebra.js';
import { pChiCuadrado } from '../../src/analizador/psicometria/numerico.js';

const fx = JSON.parse(fs.readFileSync(new URL('../oracle/afe_fixture.json', import.meta.url), 'utf8'));
const cerca = (a, b, tol, que) => assert.ok(Math.abs(a - b) <= tol, `${que}: ${a} vs ${b}`);
const matricesCerca = (A, B, tol, que) => A.forEach((f, i) => f.forEach((v, j) => cerca(v, B[i][j], tol, `${que}[${i}][${j}]`)));
const R = matrizCorrelaciones(fx.cols), n = fx.cols[0].length;

test('adecuación: KMO, MSA por ítem y Bartlett iguales a SciPy', () => {
    const k = kmo(R);
    cerca(k.kmo, fx.kmo, 1e-12, 'KMO'); k.msa.forEach((v, i) => cerca(v, fx.msa[i], 1e-12, 'MSA ' + i));
    const b = bartlett(R, n);
    cerca(b.chi2, fx.bartlett[0], 1e-9 * fx.bartlett[0], 'χ²'); assert.equal(b.gl, fx.bartlett[1]);
    cerca(b.p, fx.bartlett[2], 1e-300 + 1e-10 * fx.bartlett[2], 'p');
    cerca(pChiCuadrado(3.841458820694124, 1), 0.05, 1e-14, 'χ² crítica');
    assert.deepEqual([0.95, 0.85, 0.75, 0.65, 0.55, 0.4].map(interpretarKMO), ['excelente', 'meritorio', 'aceptable', 'mediocre', 'bajo', 'inaceptable']);
});

test('autovalores y análisis paralelo por permutaciones (mismo sfc32 que el oráculo)', () => {
    eigenSimetrica(R).valores.forEach((v, i) => cerca(v, fx.autovalores[i], 1e-12, 'autovalor ' + i));
    const pa = analisisParalelo(fx.cols, 'pearson', { B: 100, semilla: 7 });
    pa.forEach((r, i) => { cerca(r.media, fx.paraleloMedia[i], 1e-12, 'media ' + i); cerca(r.percentil, fx.paraleloP95[i], 1e-12, 'p95 ' + i); });
    assert.equal(factoresSugeridos(fx.autovalores, pa), fx.m);
    assert.equal(fx.m, 3, 'la estructura simulada tiene 3 factores');
});

test('ejes principales y rotaciones (oblimin, varimax, promax) iguales al oráculo', () => {
    const ep = ejesPrincipales(R, fx.m);
    matricesCerca(ep.cargas, fx.cargasSinRotar, 1e-8, 'A'); ep.comunalidades.forEach((v, i) => cerca(v, fx.comunalidades[i], 1e-9, 'h² ' + i));
    const o = ordenarFactores(rotar(ep.cargas, 'oblimin').L, rotar(ep.cargas, 'oblimin').Phi);
    matricesCerca(o.L, fx.oblimin.L, 2e-5, 'oblimin L'); matricesCerca(o.Phi, fx.oblimin.Phi, 2e-5, 'oblimin Φ');
    const rv = rotar(ep.cargas, 'varimax'), v = ordenarFactores(rv.L, rv.Phi);
    matricesCerca(v.L, fx.varimax.L, 2e-5, 'varimax L');
    const rp = rotar(ep.cargas, 'promax'), pr = ordenarFactores(rp.L, rp.Phi);
    matricesCerca(pr.L, fx.promax.L, 2e-5, 'promax L'); matricesCerca(pr.Phi, fx.promax.Phi, 2e-5, 'promax Φ');
});

test('propiedades: comunalidades invariantes, Φ con diagonal 1, cota de Ledermann y análisis completo coherente', () => {
    const r = analizarAFE(fx.cols, fx.cols.map((_, j) => 'X' + (j + 1)), { correlacion: 'pearson', factores: 'paralelo', rotacion: 'oblimin', B: 100, semilla: 7 });
    assert.ok(!r.error && r.m === 3 && r.tipo === 'pearson' && r.rotacion.convergio);
    const h = multiplicar(multiplicar(r.patron, r.phi), traspuesta(r.patron));
    r.items.forEach((it, i) => cerca(h[i][i], it.comunalidad, 1e-12, 'h² tras rotar ' + i));
    r.phi.forEach((f, i) => cerca(f[i], 1, 1e-12, 'Φ diagonal'));
    assert.deepEqual(r.items.map(x => x.factor).join(''), '000022221111'.split('').map((_, i) => r.items[Math.floor(i / 4) * 4].factor).join(''), 'cada bloque de 4 ítems en un mismo factor');
    assert.equal(new Set([0, 4, 8].map(i => r.items[i].factor)).size, 3, 'tres factores distintos');
    assert.deepEqual([maximoFactores(12), maximoFactores(4), maximoFactores(3)], [7, 1, 1]);
    assert.match(analizarAFE([[1, 2, 3], [2, 3, 4]], ['a', 'b'], {}).error, /al menos 3 ítems/);
});

test('revisión 2026.10.12: ítems constantes, paralelo sin factores, número fijado y referencias solo de lo citado', async () => {
    const { redactarParrafo, referenciasAFE, tablaAutovalores } = await import('../../src/analizador/psicometria/afe-redaccion.js');
    const cte = fx.cols.map((c, j) => (j === 2 ? c.map(() => 3) : c));
    assert.match(analizarAFE(cte, cte.map((_, j) => 'X' + (j + 1)), { correlacion: 'pearson' }).error, /Sin variación.*X3/);
    let s = 5; const u = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const ruido = Array.from({ length: 8 }, () => Array.from({ length: 300 }, () => 1 + Math.floor(u() * 5)));
    const rr = analizarAFE(ruido, ruido.map((_, j) => 'R' + (j + 1)), { correlacion: 'pearson', B: 100, semilla: 3 });
    assert.ok(rr.sugeridosReales === 0 && rr.m === 1 && rr.avisos.some(a => /Ningún autovalor supera/.test(a)), 'datos sin estructura: aviso y un factor descriptivo');
    const fija = analizarAFE(fx.cols, fx.cols.map((_, j) => 'X' + (j + 1)), { correlacion: 'pearson', factores: '2', B: 100, semilla: 7 });
    assert.ok(fija.fijado && fija.m === 2);
    assert.match(redactarParrafo(fija, 'del test'), /Se extrajeron 2 factores, número fijado según la estructura teórica del instrumento, por ejes principales/);
    assert.match(tablaAutovalores(fija).nota, /Se extrajeron 2 por decisión del investigador/);
    const refs = referenciasAFE(fija).join(' ');
    assert.ok(/British Journal of Statistical Psychology, 3<\/i>\(2\)/.test(refs) && refs.includes('Kaiser, H. F. (1974)'));
    assert.ok(!referenciasAFE({ ...fija, adecuacion: { kmo: null, bartlett: null } }).some(x => x.startsWith('Bartlett')), 'sin KMO ni Bartlett en el texto, sin sus referencias');
});

test('revisión 2026.10.12: un Worker por canal; cancelar el AFE no corta un bootstrap en curso', async () => {
    const creados = [];
    globalThis.Worker = class {
        constructor(url, op) { this.nombre = op.name; creados.push(this); }
        postMessage({ id, tipo }) { this.t = setTimeout(() => this.onmessage && this.onmessage({ data: { id, tipo: 'fin', res: [{ clave: 'x', eco: tipo }] } }), 30); }
        terminate() { clearTimeout(this.t); this.terminado = true; }
    };
    const srv = await import('../../src/analizador/psicometria/servicio-psicometrico.js?canales');
    const boot = srv.ejecutarTarea('bootstrap', [], {}), afe = srv.ejecutarTarea('afe', [], {});
    assert.deepEqual(creados.map(w => w.nombre).sort(), ['psicometria-afe', 'psicometria-fiabilidad']);
    afe.cancelar();
    await assert.rejects(afe.promesa, e => e.cancelado === true);
    assert.equal((await boot.promesa)[0].eco, 'bootstrap', 'el bootstrap termina igual');
    assert.ok(creados.find(w => w.nombre === 'psicometria-afe').terminado && !creados.find(w => w.nombre === 'psicometria-fiabilidad').terminado);
    delete globalThis.Worker;
});
