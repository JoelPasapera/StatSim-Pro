// tests/ui/siglas-ui.test.js — las siglas de las sociodemográficas se reservan después de las de las escalas: una
// sociodemográfica con las mismas iniciales que una escala (Estado civil / Estrés crónico) no repite su sigla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

test('«Estado civil» (sociodemográfica) no repite la sigla EC de «Estrés crónico» (escala)', async () => {
    const env = crearEntorno(fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8'));
    env.document.readyState = 'interactive';
    globalThis.fetch = () => Promise.reject(new Error('sin red'));
    await import(new URL('../../src/main.js', import.meta.url));
    await new Promise(r => setTimeout(r, 0));
    const pruebas = await import('../../src/simulador/ui/pruebas.js'), socios = await import('../../src/simulador/ui/sociodemograficos.js');
    document.querySelectorAll('#bodyPruebas tr, #bodySocio tr').forEach(tr => tr.remove());
    pruebas.agregarFilaTestConDatos({ prueba: 'EEC', variable: 'estrés', dimensiones: ['Estrés crónico'] });
    pruebas.sincronizarDimensionesDesdeTests(true);
    for (const f of document.querySelectorAll('#bodyPruebas .fila-prueba')) {
        [['Número de ítems', '6'], ['Mínimo por ítem', '1'], ['Máximo por ítem', '5'], ['Alfa de Cronbach objetivo', '0.8'], ['Media (M)', '18'], ['Desviación estándar (DE)', '4']]
            .forEach(([et, v]) => { const el = f.querySelector(`[aria-label="${et}"]`); if (el) { el.disabled = false; el.value = v; env.disparar(el, 'input'); } });
    }
    socios.agregarFilaSocioConDatos({ categoria: 'Estado civil', distribucion: 'categorica', promedio: '', de: '', min: '', max: '', decimales: '0', opciones: 'Soltero, Casado' });
    const g = globalThis.generadorDatos;
    g.configuracion = { pruebas: g.recolectarPruebas() };
    const escala = g.configuracion.pruebas.find(p => p.nombre === 'Estrés crónico');
    const socio = g.recolectarSociodemograficos().find(s => s.categoria === 'Estado civil');
    assert.equal(escala.nombreCorto, 'EC');
    assert.ok(socio.categoriaCorta !== 'EC' && /^[A-Z]+$/.test(socio.categoriaCorta), 'sigla distinta y solo letras: ' + socio.categoriaCorta);
});
