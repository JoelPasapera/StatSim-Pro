// tests/integration/simulador-terceras.test.js — terceras variables en el Simulador (Atlas, fase C): confusión, supresión y
// colisionador. La parcial se comprueba con un método independiente del motor (correlación de los residuos sobre Z), y el
// colisionador con la selección por rango sobre Z (B3) reproduce la paradoja de Berkson.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';

const esc = (nombre, corto) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 10, media: 30, desviacion: 6, minimo: 1, maximo: 5, alfa: 0.85, distribucion: 'normal', invertidos: 0 });
function generador({ modelos, correlaciones = [], n = 300, exactas = true, extra = {} }) {
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: n, semilla: 3, generarPercentiles: false, correlacionesExactas: exactas, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: [esc('Estrés', 'ES'), esc('Sueño', 'SU'), esc('Carga', 'CA')], sociodemograficos: [], correlaciones, diferenciasGrupo: [], modelos, medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {}, ...extra };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    return g;
}
const pr = (u, v) => { const n = u.length, mu = u.reduce((a, b) => a + b) / n, mv = v.reduce((a, b) => a + b) / n; let a = 0, b = 0, c = 0; for (let i = 0; i < n; i++) { a += (u[i] - mu) * (v[i] - mv); b += (u[i] - mu) ** 2; c += (v[i] - mv) ** 2; } return a / Math.sqrt(b * c); };
const residuo = (v, z) => { const n = v.length, mv = v.reduce((a, b) => a + b) / n, mz = z.reduce((a, b) => a + b) / n; let s = 0, q = 0; for (let i = 0; i < n; i++) { s += (v[i] - mv) * (z[i] - mz); q += (z[i] - mz) ** 2; } return v.map((x, i) => x - mv - (s / q) * (z[i] - mz)); };
const columnas = (g, b) => g.configuracion.pruebas.map(p => Array.from(b.columna(g.columnaDeEscala(p)).datos));

test('los tres fenómenos, exactos y verificados: parcial por residuos, informe sin ✗ y el veredicto correcto', () => {
    for (const [tipo, c1, c2, c3, parcialEsperada, rEsperada, texto] of [
        ['confusion', 0.6, 0.6, 0, 0, 0.36, /espuria/], ['supresion', 0.6, 0, 0.4, 0.4, 0.32, /ocultaba/], ['colisionador', 0.5, 0.5, 0, -1 / 3, 0, /sesgo/]]) {
        const g = generador({ modelos: [{ tipo, x: 'Estrés', m: 'Carga', y: 'Sueño', c1, c2, c3 }] }), v = g.validarConfiguracion();
        assert.deepEqual(v.errores, []); assert.ok(!v.advertencias.some(a => /Z = Carga/.test(a)), tipo);
        const b = g.generarBaseDatos(), [X, Y, Z] = columnas(g, b), inf = g.informePedidoObtenido(b).filter(f => /\(Z = Carga\)/.test(f.variable));
        assert.ok(Math.abs(pr(residuo(X, Z), residuo(Y, Z)) - parcialEsperada) < 0.01, `${tipo}: parcial por residuos`);
        assert.ok(Math.abs(pr(X, Y) - rEsperada) < 0.01, `${tipo}: r de orden cero`);
        assert.equal(inf.filter(f => f.ok === false).length, 0);
        assert.equal(inf.filter(f => f.ok === true).length, 4, 'tres correlaciones y la parcial');
        assert.match(inf.find(f => f.tipo === 'fenómeno').obtenido, texto);
    }
});

test('sin modo exacto, el muestreo se tolera y el fenómeno se sigue viendo (n = 400)', () => {
    const g = generador({ modelos: [{ tipo: 'confusion', x: 'Estrés', m: 'Carga', y: 'Sueño', c1: 0.6, c2: 0.6, c3: 0 }], exactas: false, n: 400 });
    const b = g.generarBaseDatos(), inf = g.informePedidoObtenido(b).filter(f => /\(Z = Carga\)/.test(f.variable));
    assert.equal(inf.filter(f => f.ok === false).length, 0, JSON.stringify(inf.map(f => [f.variable, f.obtenido])));
});

test('validación: variables repetidas, colisionador imposible y conflicto con la tabla III son errores; un fenómeno que no se produce, un aviso', () => {
    const errores = md => generador({ modelos: [md] }).validarConfiguracion().errores.join(' | ');
    assert.match(errores({ tipo: 'confusion', x: 'Estrés', m: 'Estrés', y: 'Sueño', c1: 0.5, c2: 0.5, c3: 0 }), /tres variables distintas/);
    assert.match(errores({ tipo: 'colisionador', x: 'Estrés', m: 'Carga', y: 'Sueño', c1: 0.9, c2: 0.9, c3: -0.5 }), /imposible/);
    assert.match(errores({ tipo: 'supresion', x: 'Estrés', m: 'Carga', y: 'Sueño', c1: 0.97, c2: 0, c3: 0.4 }), /entre −0,95 y 0,95/);
    const conflicto = generador({ modelos: [{ tipo: 'confusion', x: 'Estrés', m: 'Carga', y: 'Sueño', c1: 0.6, c2: 0.6, c3: 0 }], correlaciones: [{ a: 'Estrés', b: 'Sueño', r: 0.1 }] }).validarConfiguracion();
    assert.ok(conflicto.errores.some(e => /Conflicto|tabla III/i.test(e)) || conflicto.advertencias.some(a => /tabla III/i.test(a)), JSON.stringify(conflicto));
    const aviso = generador({ modelos: [{ tipo: 'supresion', x: 'Estrés', m: 'Carga', y: 'Sueño', c1: 0.5, c2: 0.5, c3: 0.3 }] }).validarConfiguracion();
    assert.ok(aviso.advertencias.some(a => /no hay supresión/.test(a)));
});

test('colisionador + selección por rango sobre Z: la paradoja de Berkson (r negativa en la muestra seleccionada)', () => {
    const g = generador({ modelos: [{ tipo: 'colisionador', x: 'Estrés', m: 'Carga', y: 'Sueño', c1: 0.5, c2: 0.5, c3: 0 }], n: 400, extra: { seleccion: { variable: 'Carga', lado: 'superior', proporcion: 0.3 } } });
    assert.deepEqual(g.validarConfiguracion().errores, []);
    const b = g.generarBaseDatos(), [X, Y] = columnas(g, b), r = pr(X, Y);
    assert.ok(r < -0.1, `en la muestra seleccionada por Z, X e Y (independientes en la población) quedan relacionadas: r = ${r.toFixed(3)}`);
    assert.equal(g.informePedidoObtenido(b).filter(f => f.ok === false).length, 0);
});

test('revisión de la fase C: las terceras variables ya no pasan por la validación de la moderación', () => {
    // una confusión con .70, .70 y parcial .30 siempre es posible (la parcial garantiza la matriz); la 2026.11.15 la rechazaba
    // con «Mediación …: los coeficientes explican el 107 % de la varianza» (la varianza explicada de la moderación)
    const g = generador({ modelos: [{ tipo: 'confusion', x: 'Estrés', m: 'Carga', y: 'Sueño', c1: 0.7, c2: 0.7, c3: 0.3 }] }), v = g.validarConfiguracion();
    assert.deepEqual(v.errores, []);
    assert.ok(!v.advertencias.some(a => /Mediación|moderación/.test(a)));
    const b = g.generarBaseDatos(), [X, Y, Z] = columnas(g, b);
    assert.ok(Math.abs(pr(residuo(X, Z), residuo(Y, Z)) - 0.3) < 0.01);
    // dos modelos con la misma Y: antes, «ya es criterio de otra moderación»
    const dos = generador({ modelos: [{ tipo: 'confusion', x: 'Estrés', m: 'Carga', y: 'Sueño', c1: 0.5, c2: 0.5, c3: 0 }, { tipo: 'colisionador', x: 'Carga', m: 'Estrés', y: 'Sueño', c1: 0.5, c2: 0.5, c3: 0.5 }] }).validarConfiguracion();
    assert.ok(!dos.errores.some(e => /criterio/.test(e)), JSON.stringify(dos.errores));
});

