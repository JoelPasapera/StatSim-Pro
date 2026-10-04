// tests/ui/fiabilidad.test.js — con el configurador de dimensiones relleno (lo normal en el navegador), la fiabilidad
// sigue formando la escala total de cada test multidimensional y la tabla la muestra junto a los coeficientes ordinales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

test('configurador relleno + estructura del Simulador → «Escala total (TMMS24)» con ω jerárquico y columnas ordinales', async () => {
    crearEntorno(fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8'));
    const { GeneradorDatos } = await import('../../src/simulador/dominio/generador.js');
    const { EtiquetasVariables } = await import('../../src/shared/etiquetas-variables.js');
    const { Fiabilidad } = await import('../../src/analizador/fiabilidad.js');
    const esc = (nombre, corto, prueba, k, media, de, min, max) => ({ nombre, nombreCorto: corto, prueba, tipo: 'dimension', numItems: k, media, desviacion: de, minimo: min, maximo: max, alfa: 0.85, distribucion: 'normal', invertidos: 0 });
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: 300, semilla: 5, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { RAVEN: { variable: 'inteligencia cognitiva' }, TMMS24: { variable: 'inteligencia emocional', rIntra: 0.4 } },
        pruebas: [esc('inteligencia cognitiva', 'IC', 'RAVEN', 36, 24, 5, 0, 1), esc('Percepción emocional', 'PE', 'TMMS24', 8, 26, 4, 1, 5), esc('comprensión emocional', 'CE', 'TMMS24', 8, 26, 4, 1, 5), esc('regulación emocional', 'RE', 'TMMS24', 8, 26, 4, 1, 5)],
        sociodemograficos: [], correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const datos = g.generarBaseDatos().aObjetos();
    EtiquetasVariables.fijar(g.obtenerEtiquetas(), g.obtenerEstructuraEscalas());
    Fiabilidad.mostrarConfigurador('configuradorDimensiones', datos);
    const filasCfg = document.querySelectorAll('#configuradorDimensiones [data-fb-fila]');
    assert.equal(filasCfg.length, 4, 'el configurador lista las 4 escalas (la total no es editable)');
    const grupos = Fiabilidad.detectarGrupos(datos);
    const total = grupos.find(x => x.etiqueta === 'Escala total (TMMS24)');
    assert.ok(total && total.items.length === 24 && total.particion.length === 3, 'la escala total sobrevive al configurador');
    Fiabilidad.mostrar('resultadosFiabilidad', datos);
    const txt = document.getElementById('resultadosFiabilidad').textContent;
    assert.ok(txt.includes('Escala total (TMMS24)') && txt.includes('(KR-20)') && txt.includes('α ordinal'), 'tabla con la escala total, el KR-20 y lo ordinal');
});

test('(paso 2B) bootstrap desde la tabla: sin Worker se calcula en el hilo principal; tabla, frase y Word con intervalos', async () => {
    const { Fiabilidad } = await import('../../src/analizador/fiabilidad.js');
    const { EtiquetasVariables } = await import('../../src/shared/etiquetas-variables.js');
    EtiquetasVariables.limpiar();
    const cols = JSON.parse(fs.readFileSync(new URL('../oracle/ordinal_fixture.json', import.meta.url), 'utf8')).conjuntos.likert5.cols;
    const datos = cols[0].map((_, i) => Object.fromEntries(cols.map((c, j) => [`LK${j + 1}`, c[i]])));
    document.getElementById('configuradorDimensiones').innerHTML = '';
    Fiabilidad.mostrar('resultadosFiabilidad', datos);
    const zona = document.getElementById('bootstrapFiabilidad');
    assert.ok(zona && zona.querySelector('#bootCalcular') && !zona.querySelector('#bootCalcular').disabled, 'bloque montado y listo');
    zona.querySelector('#bootB').value = '500';
    globalThis.__eventoFiabilidad = 0;
    const { bus, EVENTOS } = await import('../../src/shared/eventos.js');
    bus.on(EVENTOS.FIABILIDAD_ACTUALIZADA, () => { globalThis.__eventoFiabilidad++; });
    zona.querySelector('#bootCalcular').dispatchEvent(Object.assign(new Event('click'), {}));
    for (let t = 0; t < 400 && !Fiabilidad._bootstrap; t++) await new Promise(r => setTimeout(r, 50));
    assert.ok(Fiabilidad._bootstrap && Fiabilidad._bootstrap.opciones.B === 500, 'resultados guardados');
    const txt = document.getElementById('resultadosFiabilidad').textContent;
    assert.match(txt, /Intervalos de confianza por bootstrap/);
    assert.match(txt, /bootstrap percentil \(B = 500; Efron y Tibshirani, 1993\) fueron: /, 'frase en la interpretación');
    assert.ok(/\[\.\d{3}, \.\d{3}\]/.test(document.getElementById('bootResultados').textContent), 'tabla con intervalos');
    assert.equal(globalThis.__eventoFiabilidad, 1, 'aviso por el bus (refresca las referencias)');
    const w = Fiabilidad.paraWord();
    assert.ok(w === null || w.conBootstrap !== undefined);
});
