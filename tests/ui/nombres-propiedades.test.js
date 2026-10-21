// tests/ui/nombres-propiedades.test.js — (2026.12.31, cuarta revisión) un test del Simulador con un nombre que es una
// propiedad de los objetos de JavaScript («constructor», que un maestro ajeno puede traer): su puntaje general se ofrece
// para correlacionar (correlaciones.js y pruebas.js lo contaban en un objeto, donde «constructor» ya era una función), y la
// tarjeta VII (estructura factorial) no le atribuye una estructura heredada: antes lo marcaba con ✓ sin tenerla y su matriz,
// y «Generar» con ese test elegido, fallaban con un error de JavaScript.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

let env, pruebas, correlaciones, estructura;
const q = sel => globalThis.document.querySelector(sel);
const qa = sel => globalThis.document.querySelectorAll(sel);

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8'));
    env.document.readyState = 'interactive';
    globalThis.fetch = () => Promise.reject(new Error('sin red'));
    await import(new URL('../../src/main.js', import.meta.url));
    await new Promise(r => setTimeout(r, 0));
    pruebas = await import('../../src/simulador/ui/pruebas.js');
    correlaciones = await import('../../src/simulador/ui/correlaciones.js');
    estructura = await import('../../src/simulador/ui/estructura.js');
});

/** La tabla I con un test de dos dimensiones, cada una de cuatro ítems. @param {string} nombre @param {string[]} dims */
function conUnTest(nombre, dims) {
    qa('#bodyPruebas tr, #bodySocio tr').forEach(tr => tr.remove());
    pruebas.agregarFilaTestConDatos({ prueba: nombre, variable: 'Bienestar', dimensiones: dims });
    pruebas.sincronizarDimensionesDesdeTests(true);
    for (const f of qa('#bodyPruebas .fila-prueba')) {
        for (const [et, v] of [['Número de ítems', '4'], ['Mínimo por ítem', '1'], ['Máximo por ítem', '5'], ['Alfa de Cronbach objetivo', '0.8'], ['Media (M)', '12'], ['Desviación estándar (DE)', '3']]) {
            const el = f.querySelector(`[aria-label="${et}"]`);
            if (el) { el.disabled = false; el.value = v; env.disparar(el, 'input'); }
        }
    }
}

test('un test llamado «constructor»: su puntaje general se ofrece para correlacionar', () => {
    conUnTest('constructor', ['Alfa uno', 'Beta dos']);
    assert.ok(correlaciones.obtenerVariablesCorrelacionables().includes('Bienestar — constructor'), JSON.stringify(correlaciones.obtenerVariablesCorrelacionables()));
    assert.deepEqual(pruebas.nombresGeneralesDerivados(), ['Bienestar — constructor']);
});

test('la tarjeta VII con un test «constructor» o una dimensión «constructor»: sin estructura heredada ni errores', () => {
    conUnTest('constructor', ['Alfa uno', 'Beta dos']);
    estructura.poblarSelectorEstructura();
    const opcion = () => [...qa('#selectorTestEstructura option')].map(o => o.textContent).find(t => t.startsWith('constructor'));
    assert.equal(opcion(), 'constructor', 'sin ✓: aún no tiene estructura');
    assert.doesNotThrow(() => estructura.renderMatrizCargas('constructor'));
    assert.equal(qa('#bodyCargas .fila-carga').length, 8, 'la matriz: los ocho ítems');
    assert.equal(Object.keys(estructura.estructurasUI).includes('constructor'), true);
    estructura.poblarSelectorEstructura();
    assert.equal(opcion(), 'constructor ✓', 'y ahora, con ella');
    // «Generar» reconcilia antes las estructuras, con ese test elegido
    q('#selectorTestEstructura').value = 'constructor';
    assert.doesNotThrow(() => estructura.reconciliarEstructurasTodas(false));
    // una dimensión «constructor»: sus cargas son las suyas, propias (antes, la función del prototipo)
    conUnTest('Test', ['constructor', 'toString']);
    assert.doesNotThrow(() => estructura.renderMatrizCargas('Test'));
    const est = estructura.estructurasUI.Test;
    assert.deepEqual(Object.keys(est.cargas), ['constructor', 'toString']);
    assert.equal(est.cargas.constructor.length, 4);
    assert.match(String(q('#estructurasJSON').value), /"constructor":\[\[/, 'y se guardan');
    // y una «__proto__»: también propia (con un objeto normal, asignarla le cambiaba el prototipo y se perdía al guardar)
    conUnTest('Otro', ['__proto__', 'Beta']);
    estructura.renderMatrizCargas('Otro');
    assert.deepEqual(Object.keys(estructura.estructurasUI.Otro.cargas), ['__proto__', 'Beta']);
    assert.match(String(q('#estructurasJSON').value), /"__proto__":\[\[/);
    // (quinta revisión) y al renombrar a «__proto__» una dimensión de una estructura leída del maestro (un objeto normal)
    const linea = JSON.stringify({ prueba: 'Leida', modo: 'cargas', factores: ['Alfa', 'Beta'], cargas: { Alfa: [[0.71, 0.1], [0.62, 0]], Beta: [[0, 0.7], [0.1, 0.6]] }, metodo: null, desajuste: 'ninguno' });
    estructura.aplicarCSVEstructuras(`Prueba,EstructuraJSON\nLeida,"${linea.replace(/"/g, '""')}"`);
    estructura.renombrarEnEstructuras('Alfa', '__proto__');
    const leida = estructura.estructurasUI.Leida;
    assert.deepEqual([Object.keys(leida.cargas), leida.cargas.__proto__, leida.factores], [['Beta', '__proto__'], [[0.71, 0.1], [0.62, 0]], ['__proto__', 'Beta']]);
});
