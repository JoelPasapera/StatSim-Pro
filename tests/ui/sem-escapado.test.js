// @ts-check
// tests/ui/sem-escapado.test.js — (2027.01.14, revisión) la tarjeta del SEM escribe como texto lo que lleva nombres: los
// avisos de lo que la sintaxis repite («La sintaxis escribe dos veces «F1 =~ A<b>»…») y los errores. Hasta la 2027.01.13 los
// avisos iban sin escapar (la tabla de parámetros sí escapaba sus nombres): una columna «A<b>» dejaba en negrita el resto de la
// tarjeta. Y sus tablas, desplazables dentro de su recuadro (en un teléfono, la de parámetros hacía la página de 515 de ancho).
// En el capítulo de Word, igual: el aviso, los parámetros y la validez (con el nombre de una latente, que la sintaxis admite
// con cualquier letra, como «F1<u>»), escapados; hasta la 2027.01.13 iban tal cual.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const afe = JSON.parse(fs.readFileSync(new URL('../oracle/afe_fixture.json', import.meta.url), 'utf8'));

test('(2027.01.14) los avisos y los errores del SEM, escapados, en la tarjeta y en el Word; sus tablas, en un recuadro desplazable', async () => {
    crearEntorno(fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8'));
    const { AnalizadorEstadistico } = await import('../../src/analizador/estadistica.js');
    const { SEMUI } = await import('../../src/analizador/sem-ui.js');
    if (!document.getElementById('cgSlot')) { const s = document.createElement('div'); s.id = 'cgSlot'; document.body.appendChild(s); }
    SEMUI.montar();
    // las columnas del fixture, con la primera llamada «X1<b>» (un nombre que llega sin pasar por el lector de CSV)
    const nombres = afe.cols.map((/** @type {unknown} */ _, /** @type {number} */ j) => (j === 0 ? 'X1<b>' : `X${j + 1}`));
    AnalizadorEstadistico.cargarDatos(afe.cols[0].map((/** @type {unknown} */ _, /** @type {number} */ i) => Object.fromEntries(nombres.map((/** @type {string} */ nm, /** @type {number} */ j) => [nm, afe.cols[j][i]]))));
    const sintaxis = /** @type {any} */ (document.getElementById('semSintaxis')), out = /** @type {any} */ (document.getElementById('semOut'));
    sintaxis.value = 'F1<u> =~ X1<b> + X2 + X3 + X4 + X1<b>\nF2 =~ X5 + X6 + X7 + X8\nF3 =~ X9 + X10 + X11 + X12';
    SEMUI._onAjustar();
    const avisos = [...out.querySelectorAll('p')].map(p => p.textContent).filter(t => /dos veces/.test(t));
    assert.equal(avisos.length, 1, out.innerHTML.slice(0, 400));
    assert.match(avisos[0], /«F1<u> =~ X1<b>»: cuenta una sola vez/, 'el aviso, con el nombre entero');
    assert.equal(out.querySelectorAll('p.help-text b').length, 0, 'ninguna negrita salida de un nombre');
    assert.equal(out.querySelectorAll('u').length, 0, 'ni un subrayado salido del nombre de la latente');
    assert.ok(/F1<u> =~ X2/.test(out.textContent), 'la tabla de parámetros, con los nombres enteros');
    // el capítulo de Word: el aviso, los parámetros y la validez (la latente F1<u>, en sus tablas y en su texto), escapados
    const { ExportadorWord } = await import('../../src/analizador/exportador-word.js');
    const word = ExportadorWord._seccionSEM();
    assert.ok(word.includes('Advertencia: La sintaxis escribe dos veces «F1&lt;u&gt; =~ X1&lt;b&gt;»: cuenta una sola vez'), word.slice(0, 1500));
    assert.ok(word.includes('>F1&lt;u&gt; =~ X2<'), 'el parámetro, escapado');
    assert.ok(word.includes('>F1&lt;u&gt;<'), 'la latente, escapada en las tablas de validez');
    assert.ok(!/<u>|<b>X|X1<b>/.test(word), 'ningún nombre sin escapar en el Word');
    const tablas = [...out.querySelectorAll('table')];
    assert.ok(tablas.length >= 2 && tablas.every(t => t.parentNode && t.parentNode.classList.contains('tabla-ancha')), 'cada tabla, en su recuadro desplazable');
    // un error que repite lo escrito: la línea, como texto
    sintaxis.value = 'F1 =~ X2 + X3 + X4\n<img src=x onerror=alert(1)>';
    SEMUI._onAjustar();
    assert.equal(out.querySelectorAll('img').length, 0, out.innerHTML);
    assert.match(out.textContent, /Línea no reconocida en la sintaxis del modelo: «<img src=x onerror=alert\(1\)>»/);
    // y el motor de decisión («¿Es adecuado usar SEM aquí?»), con el mismo error
    SEMUI._onEvaluar();
    const decision = /** @type {any} */ (document.getElementById('semDecision'));
    assert.equal(decision.querySelectorAll('img').length, 0, decision.innerHTML);
    assert.match(decision.textContent, /«<img src=x onerror=alert\(1\)>»/);
    // (2027.01.16, revisión) y sus veredictos, que nombran los factores como los escribe la sintaxis: hasta la 2027.01.15 iban sin
    // escapar («El factor F1<u>…» subrayaba lo que seguía; un factor llamado «<img/src/onerror=…>» ejecutaba su onerror)
    for (const nombre of ['F1<u>', '<img/src/onerror=alert(1)>']) {
        sintaxis.value = `${nombre} =~ X2 + X3 + X4`;
        SEMUI._onEvaluar();
        assert.equal(decision.querySelectorAll('u, img').length, 0, decision.innerHTML);
        assert.ok(decision.textContent.includes(`El factor ${nombre} está justo identificado (3 indicadores)`), decision.textContent.slice(0, 400));
    }
});
