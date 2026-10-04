// tests/ui/simulador-formas.test.js — columna «Tipo de relación» de la tabla III sobre index.html real: nota con la r
// esperada, límites de la fuerza η, «Plana», lectura de la configuración (las filas con forma pasan a los modelos
// compuestos) y CSV con el tipo (el que usan la exportación de correlaciones y el maestro), también el antiguo sin él.
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
function fila(a, b, valor, tipo) {
    correl.agregarFilaCorrelacion();
    const f = qa('#bodyCorrelaciones .fila-correlacion').pop(), [sa, sb] = f.querySelectorAll('select');
    sa.value = a; sb.value = b;
    const sel = f.querySelector('[aria-label="Tipo de relación"]'), inp = f.querySelector('[aria-label="Correlación objetivo"]');
    sel.value = tipo; env.disparar(sel, 'change');
    if (!inp.disabled) { inp.value = String(valor); env.disparar(inp, 'input'); }
    return f;
}
const vaciar = () => { document.getElementById('bodyCorrelaciones').innerHTML = ''; };

test('una fila con forma: grupos del atlas, nota con la r esperada, límites de η; «Plana» queda en 0', () => {
    vaciar();
    const f = fila('Activación', 'Rendimiento', 0.6, 'u-invertida'), sel = f.querySelector('[aria-label="Tipo de relación"]'), inp = f.querySelector('[aria-label="Correlación objetivo"]');
    assert.deepEqual(qa('#bodyCorrelaciones optgroup').map(g => g.getAttribute('label')), ['Monotónica creciente', 'Monotónica decreciente', 'No monotónica', 'Sin tendencia']);
    assert.match(f.querySelector('.nota-tipo-relacion').textContent, /Con η = 0\.6 y A normal, la r de Pearson rondará 0\.00\./);
    assert.deepEqual([inp.min, inp.max], ['0.05', '0.97']);
    sel.value = 'nula'; env.disparar(sel, 'change');
    assert.ok(inp.disabled && inp.value === '0');
    sel.value = 'lineal'; env.disparar(sel, 'change');
    assert.ok(!inp.disabled && inp.min === '-0.99');
});

test('recolectarCorrelaciones: filas con forma → modelos compuestos; lineales y «Plana» → correlaciones; η vacía → error', () => {
    vaciar();
    fila('Activación', 'Rendimiento', 0.6, 'u-invertida'); fila('Activación', 'Calma', 0.3, 'lineal'); fila('Rendimiento', 'Calma', 0, 'nula');
    const g = globalThis.generadorDatos, cor = g.recolectarCorrelaciones();
    assert.deepEqual(cor, [{ a: 'Activación', b: 'Calma', r: 0.3 }, { a: 'Rendimiento', b: 'Calma', r: 0 }]);
    assert.deepEqual(g._formasTablaIII, [{ tipo: 'forma', forma: 'u-invertida', x: 'Activación', y: 'Rendimiento', eta: 0.6 }]);
    vaciar();
    const f = fila('Activación', 'Rendimiento', '', 'sigmoide');
    f.querySelector('[aria-label="Correlación objetivo"]').value = '';
    assert.throws(() => g.recolectarCorrelaciones(), /Relación sigmoide \(en S\) entre "Activación" y "Rendimiento": la fuerza η debe estar entre 0 y 0\.97/);
});

test('CSV con el tipo (exportación y maestro): ida y vuelta; un CSV anterior sin columna Tipo se lee como lineal', () => {
    vaciar();
    fila('Activación', 'Rendimiento', 0.6, 'u-invertida'); fila('Activación', 'Calma', -0.3, 'lineal');
    const csv = correl.csvDeCorrelaciones();
    // (2026.11.04) quinta columna, Nube (homogénea por defecto); los CSV anteriores, sin ella, se siguen leyendo
    // (2026.11.10) dos columnas más, las de los atípicos (vacías si la fila no los lleva)
    assert.match(csv, /^VariableA,VariableB,Correlacion,Tipo,Nube,RAtipicos,CasosAtipicos\r?\nActivación,Rendimiento,0\.6,u-invertida,homogenea,,\r?\nActivación,Calma,-0\.3,lineal,homogenea,,/);
    vaciar();
    assert.equal(correl.aplicarCSVCorrelaciones(csv).aplicadas, 2);
    const tipos = qa('#bodyCorrelaciones [aria-label="Tipo de relación"]').map(s => s.value);
    assert.deepEqual(tipos, ['u-invertida', 'lineal']);
    assert.match(qa('#bodyCorrelaciones .nota-tipo-relacion')[0].textContent, /rondará 0\.00/, 'la nota se recalcula al importar');
    assert.equal(correl.aplicarCSVCorrelaciones('VariableA,VariableB,Correlacion\nActivación,Calma,0.4\n').aplicadas, 1);
    assert.equal(qa('#bodyCorrelaciones [aria-label="Tipo de relación"]')[0].value, 'lineal');
});
