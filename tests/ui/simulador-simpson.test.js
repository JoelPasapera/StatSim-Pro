// tests/ui/simulador-simpson.test.js — la paradoja de Simpson en la sección V (Atlas): la columna central ofrece las variables
// binarias, vuelve a las cuantitativas al cambiar de tipo, la carga desde un archivo conserva el grupo y se refresca al abrirla.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let env, pruebas, modelos, socios;
before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    [pruebas, modelos, socios] = await Promise.all(['pruebas', 'modelos', 'sociodemograficos'].map(m => import(new URL(`src/simulador/ui/${m}.js`, raiz))));
    for (const nombre of ['Gravedad', 'Recuperación']) pruebas.agregarFilaPruebaConDatos({ prueba: 'T', nombre, numItems: '10', distribucion: 'normal', media: '30', de: '6', min: '1', max: '5', alfa: '0.8' });
    socios.agregarFilaSocioConDatos({ categoria: 'Hospital', distribucion: 'binaria', promedio: '0.5', de: '', min: '', max: '', decimales: '0', opciones: 'A, B' });
});
const campo = (fila, etiqueta) => fila.querySelector(`[aria-label="${etiqueta}"]`);
const opciones = sel => Array.from(sel.options).slice(1).map(o => o.value);

test('una fila de Simpson: la columna central ofrece las binarias, rótulos propios y recolección', () => {
    const fila = modelos.agregarFilaModelo({ tipo: 'simpson', x: 'Gravedad', m: 'Hospital', y: 'Recuperación', c1: 0.4, c2: 1.5, c3: -1.5 });
    const central = campo(fila, 'Mediador o moderador');
    assert.deepEqual(opciones(central), ['Hospital']);
    assert.equal(central.value, 'Hospital');
    assert.equal(central.options[0].textContent, 'Grupos (binaria o categórica)...');
    assert.deepEqual([1, 2, 3].map(k => campo(fila, `Coeficiente ${k}`).placeholder), ['r dentro', 'd de X', 'd de Y']);
    const md = globalThis.generadorDatos.recolectarModelos().find(m => m.tipo === 'simpson');
    assert.deepEqual(md && [md.x, md.m, md.y, md.c1, md.c2, md.c3], ['Gravedad', 'Hospital', 'Recuperación', 0.4, 1.5, -1.5]);
});

test('al cambiar a mediación vuelven las cuantitativas (sin conservar el grupo), y al volver a Simpson, las binarias', () => {
    const fila = modelos.agregarFilaModelo({ tipo: 'simpson', x: 'Gravedad', m: 'Hospital', y: 'Recuperación', c1: 0.4, c2: 1.5, c3: -1.5 });
    const tipo = campo(fila, 'Tipo de modelo'), central = campo(fila, 'Mediador o moderador');
    tipo.value = 'mediacion'; env.disparar(tipo, 'change');
    assert.ok(opciones(central).includes('Gravedad') && !opciones(central).includes('Hospital'));
    assert.equal(central.value, '', 'un grupo no es un mediador');
    central.value = 'Gravedad'; tipo.value = 'simpson'; env.disparar(tipo, 'change');
    assert.deepEqual(opciones(central), ['Hospital']);
    assert.equal(central.value, '', 'una escala no es un grupo');
});

test('la carga desde un archivo conserva un grupo que aún no está en la tabla, y al abrir la columna se ven las binarias nuevas', () => {
    const fila = modelos.agregarFilaModelo({ tipo: 'simpson', x: 'Gravedad', m: 'Turno', y: 'Recuperación', c1: 0.4, c2: 1, c3: -1 });
    const central = campo(fila, 'Mediador o moderador');
    assert.equal(central.value, 'Turno', 'no se pierde en silencio: la validación lo dirá');
    socios.agregarFilaSocioConDatos({ categoria: 'Sede', distribucion: 'binaria', promedio: '0.4', de: '', min: '', max: '', decimales: '0', opciones: 'Norte, Sur' });
    env.disparar(central, 'focusin');
    assert.ok(opciones(central).includes('Sede'), 'refrescada al abrirla');
    assert.equal(central.value, 'Turno', 'y conserva la elegida');
    const csv = modelos.csvDeModelos();
    assert.match(csv, /simpson,Gravedad,Hospital,Recuperación/);
});

test('revisión de Simpson: el CSV de modelos (el que usa el maestro) conserva el tipo y el grupo en la ida y vuelta', () => {
    document.getElementById('bodyModelos').innerHTML = '';
    modelos.agregarFilaModelo({ tipo: 'simpson', x: 'Gravedad', m: 'Hospital', y: 'Recuperación', c1: 0.4, c2: 1.5, c3: -1.5 });
    const csv = modelos.csvDeModelos();
    document.getElementById('bodyModelos').innerHTML = '';
    const r = modelos.aplicarCSVModelos(csv);
    assert.equal(r.aplicadas, 1);
    const md = globalThis.generadorDatos.recolectarModelos();
    assert.deepEqual(md.map(m => [m.tipo, m.x, m.m, m.y, m.c1, m.c2, m.c3]), [['simpson', 'Gravedad', 'Hospital', 'Recuperación', 0.4, 1.5, -1.5]]);
});

test('2026.12.05: la columna central también ofrece las categóricas (grupos de más de dos niveles)', () => {
    socios.agregarFilaSocioConDatos({ categoria: 'Planta', distribucion: 'categorica', promedio: '', de: '', min: '', max: '', decimales: '0', opciones: 'Baja, Media, Alta' });
    const fila = modelos.agregarFilaModelo({ tipo: 'simpson', x: 'Gravedad', m: 'Planta', y: 'Recuperación', c1: 0.4, c2: 1, c3: -1 });
    const central = campo(fila, 'Mediador o moderador');
    assert.ok(opciones(central).includes('Planta') && opciones(central).includes('Hospital'));
    assert.equal(central.value, 'Planta');
});

