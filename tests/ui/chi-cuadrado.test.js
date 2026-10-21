// tests/ui/chi-cuadrado.test.js — (2026.12.24) la asociación de dos variables categóricas de extremo a extremo, sobre
// index.html: «Asociación (chi-cuadrado)» muestra la tabla de contingencia con las categorías en orden (los números por su
// valor) y sin los perdidos, la χ² de la API (la del núcleo único, core/stats/contingencia.js), la V de Cramér con su banda
// (motor/magnitudes.js; antes, suelta en la interfaz) y la decisión con el α del estudio. Hasta esta versión ninguna prueba
// recorría esta vista.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let A, analisis, carga, asociacionCramerV;
const q = sel => globalThis.document.querySelector(sel);
const esperar = async (cond, ms = 20000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado'); await new Promise(r => setTimeout(r, 25)); } };

// Nivel (1, 2 o 10: en orden de texto, «10» iría antes que «2») asociado con Turno con una V moderada (≈ .39: su banda no es
// la de la χ², 13,1, «fuerte»); perdidos de las dos formas habituales
const filas = [];
for (let i = 0; i < 90; i++) {
    const nivel = [1, 2, 10][i % 3], turno = (i % 3 === 0 && i % 4 !== 0) || (i % 3 === 1 && i % 2 === 0) || (i % 3 === 2 && i % 4 === 1) ? 'mañana' : 'tarde';
    filas.push({ Nivel: nivel, Turno: turno, Puntaje: 10 + (i % 7) });
}
filas[4].Nivel = ''; filas[7].Turno = NaN;   // celda vacía de un CSV y perdido del Simulador: no cuentan

before(async () => {
    const env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    globalThis.fetch = () => Promise.reject(new Error('sin red'));
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    analisis = await import(new URL('src/analizador/ui/analisis.js', raiz));
    ({ AnalizadorEstadistico: A } = await import(new URL('src/analizador/estadistica.js', raiz)));
    ({ asociacionCramerV } = await import(new URL('src/analizador/motor/magnitudes.js', raiz)));
    carga = await import(new URL('src/analizador/ui/carga.js', raiz));
    A.cargarDatos(filas); carga.mostrarDatosCargados(filas); carga.poblarSelectsVariables(filas);
});

/** Ejecuta «Asociación (chi-cuadrado)» con Nivel y Turno y devuelve el texto de la vista. */
async function ejecutar() {
    // al elegir la asociación, los desplegables ofrecen también las categóricas de texto (Turno)
    q('input[name="tipoAnalisis"][value="correlacion"]').checked = false;
    q('input[name="tipoAnalisis"][value="asociacion"]').checked = true;
    carga.poblarSelectsVariables(filas);
    assert.ok([...q('#variable2').querySelectorAll('option')].some(o => o.value === 'Turno'), 'Turno en el desplegable');
    q('#variable1').value = 'Nivel'; q('#variable2').value = 'Turno';
    const contenedor = q('#resultadosChiCuadrado');
    contenedor.innerHTML = '';
    analisis.ejecutarAnalisis();
    await esperar(() => /Chi-cuadrado de Pearson/.test(contenedor.innerHTML));
    return contenedor.innerHTML;
}

test('la vista de la χ²: tabla ordenada sin perdidos, el estadístico de la API, la V con su banda y la decisión con el α del estudio', async () => {
    const R = A.chiCuadradoIndependencia(filas.map(f => f.Nivel), filas.map(f => f.Turno));
    assert.deepEqual(R.categorias1, ['1', '2', '10'], 'los números por su valor');
    assert.equal(R.n, 88, 'sin los dos casos con un perdido');
    assert.equal(asociacionCramerV(R.cramerV), 'asociación moderada', 'precondición: una V moderada (la χ² caería en «fuerte»)');
    const html = await ejecutar();
    assert.match(html, /<th>Nivel \\ Turno<\/th><th>mañana<\/th><th>tarde<\/th><th>Total<\/th>/);
    const filasTabla = [...html.matchAll(/<tr><td><strong>(1|2|10)<\/strong><\/td>((?:<td>\d+<\/td>)+)<td><strong>(\d+)<\/strong><\/td><\/tr>/g)];
    assert.deepEqual(filasTabla.map(m => m[1]), ['1', '2', '10'], 'las filas en orden numérico');
    filasTabla.forEach((m, i) => assert.deepEqual([...m[2].matchAll(/<td>(\d+)<\/td>/g)].map(x => Number(x[1])), R.observadas[i], `fila ${m[1]}`));
    assert.ok(html.includes(`χ²(${R.gl}) = ${R.chiCuadrado.toFixed(3)}`), 'el estadístico de la API');
    assert.ok(html.includes(`<strong>${R.cramerV.toFixed(3)}</strong> (${asociacionCramerV(R.cramerV)})`), 'la V con su banda');
    assert.ok(R.decision === 'rechazar' && html.includes('SE RECHAZA H₀') && html.includes(`indica una ${asociacionCramerV(R.cramerV)}`), 'asociación significativa con α = .05');
    const original = A.configuracionInvestigacion.nivelSignificancia;
    try {
        A.configurarMarcoInvestigacion({ nivelSignificancia: R.pValor / 2 });
        const estricto = await ejecutar();
        assert.ok(estricto.includes('NO SE RECHAZA H₀') && estricto.includes('pueden considerarse independientes'), 'la decisión usa el α del estudio');
    } finally { A.configurarMarcoInvestigacion({ nivelSignificancia: original }); }
});
