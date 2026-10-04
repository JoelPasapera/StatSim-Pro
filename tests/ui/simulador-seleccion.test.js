// tests/ui/simulador-seleccion.test.js — selección de la muestra por rango en la interfaz (fase B3 del Atlas, 2026.11.08):
// lista de variables al abrirla, campos visibles con una variable elegida, nota con el efecto previsto, lectura de la
// configuración y viaje por la configuración maestra (también si la opción aún no existe al importar).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let env, pruebas, maestro;
before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    [pruebas, maestro] = await Promise.all(['pruebas', 'maestro'].map(m => import(new URL(`src/simulador/ui/${m}.js`, raiz))));
    pruebas.agregarFilaTestConDatos({ prueba: 'T', variable: 'Bienestar', dimensiones: ['Activación', 'Calma'], rIntra: '0.3' });
    pruebas.sincronizarDimensionesDesdeTests();
});
const q = id => document.getElementById(id);

test('la lista se rellena al abrirla; con una variable elegida aparecen el lado y el porcentaje, y la nota adelanta el efecto', () => {
    const sel = q('seleccionVariable');
    assert.equal(q('camposSeleccion').style.display, 'none');
    env.disparar(sel, 'focus');
    // sin el puntaje general «Bienestar — T»: es derivado, sin driver propio (la validación también lo rechaza)
    assert.deepEqual([...sel.options].map(o => o.value), ['', 'Activación', 'Calma']);
    sel.value = 'Activación'; env.disparar(sel, 'change');
    assert.equal(q('camposSeleccion').style.display, 'flex');
    assert.match(q('notaSeleccion').textContent, /solo el 30 % superior de «Activación».*DE bajará a ≈ 51 %.*≈ \.28\./);   // Thorndike cerrado: .5·.514/√(1 − .25 + .25·.265) = .285
    assert.deepEqual(globalThis.generadorDatos.recolectarSeleccion(), { variable: 'Activación', lado: 'superior', proporcion: 0.3 });
});

test('la configuración maestra la conserva, también si al importar la opción aún no existe', () => {
    q('seleccionLado').value = 'inferior'; q('seleccionProporcion').value = '20';
    const csv = maestro.csvDeGeneral();
    assert.match(csv, /SeleccionVariable,Activación/);
    const sel = q('seleccionVariable'); sel.value = ''; while (sel.options.length > 1) sel.removeChild(sel.options[sel.options.length - 1]); env.disparar(sel, 'change');
    maestro.aplicarCSVGeneral(csv);
    assert.equal(sel.value, 'Activación', 'la opción se crea antes de asignarla');
    assert.equal(q('camposSeleccion').style.display, 'flex');
    assert.deepEqual(globalThis.generadorDatos.recolectarSeleccion(), { variable: 'Activación', lado: 'inferior', proporcion: 0.2 });
});

test('revisión 2026.11.09: una configuración maestra sin campos de selección (archivos anteriores) la reinicia en lugar de conservarla', () => {
    const sel = q('seleccionVariable');
    assert.equal(sel.value, 'Activación', 'hay una selección activa');
    maestro.aplicarCSVGeneral('Campo,Valor\nTamanoMuestra,150\n');
    assert.equal(sel.value, '');
    assert.equal(q('camposSeleccion').style.display, 'none');
    assert.equal(globalThis.generadorDatos.recolectarSeleccion(), null);
});

