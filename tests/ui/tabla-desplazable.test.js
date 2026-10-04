// tests/ui/tabla-desplazable.test.js — el componente de tablas anchas: marco, barra flotante sincronizada,
// medidas de las columnas fijas y estados (desborda, desplazada, hay más a la derecha).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno } from './minidom.js';

const HTML = `<!DOCTYPE html><html><body><div class="card">
  <div class="table-container tabla-desplazable" data-columnas-fijas="2" id="ancha"><table class="table"><thead><tr><th>Prueba</th><th>Escala</th><th>Media</th></tr></thead><tbody><tr><td>a</td><td>b</td><td>c</td></tr></tbody></table></div>
  <div class="table-container tabla-desplazable" id="estrecha"><table class="table"><thead><tr><th>X</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table></div>
</div></body></html>`;

test('envuelve cada tabla en un marco con barra flotante y mide columnas fijas y desborde', async () => {
    const env = crearEntorno(HTML);
    const ancha = document.getElementById('ancha'), estrecha = document.getElementById('estrecha');
    Object.defineProperty(ancha, 'scrollWidth', { get: () => 1900 });       // clientWidth del DOM mínimo: 900
    Object.defineProperty(estrecha, 'scrollWidth', { get: () => 901 });     // 1 px: redondeo, no cuenta como desborde
    ancha.scrollLeft = 0; estrecha.scrollLeft = 0;
    const { mejorarTablasDesplazables } = await import('../../src/shared/tabla-desplazable.js');
    const mejoras = mejorarTablasDesplazables(document);
    assert.equal(mejoras.length, 2);
    const [m1, m2] = mejoras;
    assert.ok(m1.marco.classList.contains('tabla-desplazable-marco') && ancha.parentNode === m1.marco, 'el contenedor queda dentro del marco');
    assert.equal(m1.marco.children[1], m1.barra, 'la barra va justo después del contenedor');
    assert.ok(m1.marco.classList.contains('desborda') && m1.marco.classList.contains('hay-mas-derecha'));
    assert.equal(m1.barra.children[0].style.width, '1900px', 'mismo recorrido en la barra que en la tabla');
    const tabla = ancha.querySelector('table');
    assert.equal(tabla.style.getPropertyValue('--fija-1'), '0px');
    assert.equal(tabla.style.getPropertyValue('--fija-2'), '900px', 'la segunda columna fija empieza donde acaba la primera');
    assert.equal(ancha.style.getPropertyValue('--ancho-fijas'), '1800px');
    assert.ok(!m2.marco.classList.contains('desborda'), 'una tabla que cabe no muestra la barra');
    assert.deepEqual(mejorarTablasDesplazables(document), [], 'idempotente: no envuelve dos veces');
    // desplazar la tabla mueve la barra, y al revés
    m1.barra.scrollLeft = 0;
    ancha.scrollLeft = 300; env.disparar(ancha, 'scroll', { bubbles: false });
    assert.equal(m1.barra.scrollLeft, 300); assert.ok(m1.marco.classList.contains('desplazada'));
    m1.barra.scrollLeft = 1000; env.disparar(m1.barra, 'scroll', { bubbles: false });
    assert.equal(ancha.scrollLeft, 1000);
    m1.medir();
    assert.ok(!m1.marco.classList.contains('hay-mas-derecha'), 'al final ya no hay más a la derecha');
});

test('index.html: las once tablas de configuración del Simulador usan el componente', async () => {
    const fs = await import('node:fs');
    const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const tablas = [...html.matchAll(/<div class="table-container tabla-desplazable"[^>]*>\s*<table class="table" id="(\w+)">/g)].map(m => m[1]);
    assert.deepEqual(tablas.sort(), ['tablaCargas', 'tablaConcordancia', 'tablaCorrelaciones', 'tablaCortes', 'tablaDesenlaces', 'tablaDiferencias', 'tablaModelos', 'tablaPruebas', 'tablaRepetidas', 'tablaSocio', 'tablaTests']);
    assert.match(html, /data-columnas-fijas="2"[^>]*>\s*<table class="table" id="tablaPruebas">/, 'escalas: Prueba y Escala fijas');
});
