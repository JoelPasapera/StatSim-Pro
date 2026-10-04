// tests/ui/simulador-nube.test.js — columna «Nube» de la tabla III (fase B del Atlas, 2026.11.04): nota de cada fila,
// lectura de la configuración (una fila lineal o plana con nube pasa a ser una recta compuesta) y CSV con la nube.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let env, pruebas, correl;
before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    [pruebas, correl] = await Promise.all(['pruebas', 'correlaciones'].map(m => import(new URL(`src/simulador/ui/${m}.js`, raiz))));
    pruebas.agregarFilaTestConDatos({ prueba: 'T', variable: 'Bienestar', dimensiones: ['Activación', 'Rendimiento', 'Calma'], rIntra: '0.3' });
    pruebas.sincronizarDimensionesDesdeTests();
});
const qa = s => [...document.querySelectorAll(s)];
function fila(a, b, valor, tipo, nube) {
    correl.agregarFilaCorrelacion();
    const f = qa('#bodyCorrelaciones .fila-correlacion').pop(), [sa, sb] = f.querySelectorAll('select');
    sa.value = a; sb.value = b;
    const sel = f.querySelector('[aria-label="Tipo de relación"]'), inp = f.querySelector('[aria-label="Correlación objetivo"]'), sn = f.querySelector('[aria-label="Nube"]');
    sel.value = tipo; env.disparar(sel, 'change');
    if (!inp.disabled) { inp.value = String(valor); env.disparar(inp, 'input'); }
    sn.value = nube; env.disparar(sn, 'change');
    return f;
}
const vaciar = () => { document.getElementById('bodyCorrelaciones').innerHTML = ''; };

test('la tabla III tiene la columna «Nube» y la nota describe la nube elegida', () => {
    vaciar();
    assert.ok(qa('#tablaCorrelaciones th').some(th => th.textContent === 'Nube'));
    const f = fila('Activación', 'Rendimiento', 0.5, 'lineal', 'abanico-abre');
    assert.deepEqual([...f.querySelectorAll('[aria-label="Nube"] option')].map(o => o.value), ['homogenea', 'abanico-abre', 'abanico-cierra', 'triangulo', 'atipico']);
    assert.match(f.querySelector('.nota-tipo-relacion').textContent, /la dispersión de B crece con A/);
    const t = fila('Rendimiento', 'Calma', 0.6, 'lineal', 'triangulo');
    assert.match(t.querySelector('.nota-tipo-relacion').textContent, /≈ \.55 si es normal; ≈ \.65 si es uniforme/, 'la fuerza natural depende de la distribución de A');
    const g = fila('Activación', 'Calma', 0.6, 'u-invertida', 'triangulo');
    assert.match(g.querySelector('.nota-tipo-relacion').textContent, /se genera sobre una relación «Lineal»/);
});

test('recolectarCorrelaciones: una fila lineal, negativa o plana con nube pasa a ser una recta compuesta; sin nube, como siempre', () => {
    vaciar();
    fila('Activación', 'Rendimiento', 0.5, 'lineal', 'abanico-abre');
    fila('Activación', 'Calma', -0.4, 'lineal', 'triangulo');
    fila('Rendimiento', 'Calma', 0, 'nula', 'abanico-cierra');
    fila('Calma', 'Activación', 0.3, 'lineal', 'homogenea');
    const G = globalThis.generadorDatos, corr = G.recolectarCorrelaciones();
    assert.deepEqual(G._formasTablaIII.map(m => [m.forma, m.eta, m.nube]), [['recta', 0.5, 'abanico-abre'], ['recta-dec', 0.4, 'triangulo'], ['recta', 0, 'abanico-cierra']]);
    assert.deepEqual(corr.map(c => [c.a, c.b, c.r]), [['Calma', 'Activación', 0.3]]);
});

test('CSV con la nube: ida y vuelta', () => {
    vaciar();
    fila('Activación', 'Rendimiento', 0.6, 'lineal', 'triangulo');
    const csv = correl.csvDeCorrelaciones();
    assert.match(csv, /^VariableA,VariableB,Correlacion,Tipo,Nube,RAtipicos,CasosAtipicos\r?\nActivación,Rendimiento,0\.6,lineal,triangulo,,/);
    assert.equal(correl.aplicarCSVCorrelaciones(csv).aplicadas, 1);
    assert.equal(qa('#bodyCorrelaciones [aria-label="Nube"]')[0].value, 'triangulo');
});
