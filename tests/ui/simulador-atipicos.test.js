// tests/ui/simulador-atipicos.test.js — «Atípico influyente» en la columna Nube de la tabla III (fase B4, 2026.11.10):
// campos propios visibles solo con esa nube, nota, lectura de la configuración y CSV con dos columnas nuevas.
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
    pruebas.agregarFilaTestConDatos({ prueba: 'T', variable: 'Bienestar', dimensiones: ['Activación', 'Calma'], rIntra: '0.3' });
    pruebas.sincronizarDimensionesDesdeTests();
});
const qa = s => [...document.querySelectorAll(s)];
function fila({ a = 'Activación', b = 'Calma', r = '0.5', nube = 'homogenea', rCon = null, casos = null } = {}) {
    document.getElementById('bodyCorrelaciones').innerHTML = '';
    correl.agregarFilaCorrelacion();
    const f = qa('#bodyCorrelaciones .fila-correlacion').pop(), [sa, sb] = f.querySelectorAll('select');
    sa.value = a; sb.value = b;
    const inp = f.querySelector('[aria-label="Correlación objetivo"]'); inp.value = r; env.disparar(inp, 'input');
    const sn = f.querySelector('[aria-label="Nube"]'); sn.value = nube; env.disparar(sn, 'change');
    if (rCon !== null) f.querySelector('[aria-label="r con los atípicos"]').value = rCon;
    if (casos !== null) f.querySelector('[aria-label="Casos atípicos"]').value = casos;
    return f;
}

test('con «Atípico influyente» aparecen sus campos y la nota explica qué r es cuál; con otra nube, se ocultan', () => {
    const f = fila({ nube: 'atipico' });
    assert.equal(f.querySelector('.campos-atipico').style.display, 'flex');
    // (revisión 2026.11.11) etiquetas visibles: antes eran dos números sin rótulo («0.05» y «3»)
    assert.match(f.querySelector('.campos-atipico').textContent, /r con atípicos/);
    assert.match(f.querySelector('.campos-atipico').textContent, /casos/);
    assert.match(f.querySelector('.nota-tipo-relacion').textContent, /la r de la fila es la de la mayoría y «r con los atípicos», la de la base completa/);
    const sn = f.querySelector('[aria-label="Nube"]'); sn.value = 'homogenea'; env.disparar(sn, 'change');
    assert.equal(f.querySelector('.campos-atipico').style.display, 'none');
});

test('recolectarCorrelaciones: la fila sigue siendo una correlación (la de la mayoría) y añade su atípico', () => {
    fila({ r: '0.5', nube: 'atipico', rCon: '0.05', casos: '3' });
    const G = globalThis.generadorDatos, corr = G.recolectarCorrelaciones();
    assert.deepEqual(corr.map(c => [c.a, c.b, c.r]), [['Activación', 'Calma', 0.5]]);
    assert.deepEqual(G._atipicosTablaIII, [{ x: 'Activación', y: 'Calma', rMayoria: 0.5, rCon: 0.05, casos: 3 }]);
});

test('CSV con los atípicos: ida y vuelta, y un CSV anterior (5 columnas) se sigue leyendo', () => {
    fila({ r: '0.5', nube: 'atipico', rCon: '0.05', casos: '3' });
    const csv = correl.csvDeCorrelaciones();
    assert.match(csv, /^VariableA,VariableB,Correlacion,Tipo,Nube,RAtipicos,CasosAtipicos\r?\nActivación,Calma,0\.5,lineal,atipico,0\.05,3/);
    document.getElementById('bodyCorrelaciones').innerHTML = '';
    assert.equal(correl.aplicarCSVCorrelaciones(csv).aplicadas, 1);
    const f = qa('#bodyCorrelaciones .fila-correlacion')[0];
    assert.equal(f.querySelector('[aria-label="Nube"]').value, 'atipico');
    assert.equal(f.querySelector('[aria-label="r con los atípicos"]').value, '0.05');
    assert.equal(f.querySelector('[aria-label="Casos atípicos"]').value, '3');
    document.getElementById('bodyCorrelaciones').innerHTML = '';
    assert.equal(correl.aplicarCSVCorrelaciones('VariableA,VariableB,Correlacion,Tipo,Nube\nActivación,Calma,0.3,lineal,homogenea\n').aplicadas, 1);
});
