// @ts-check
// tests/integration/seleccion-dicotomica.test.js — escalas de acierto/error con la selección por rango (deuda técnica de la B3,
// resuelta en la 2026.11.26). Lo esperado tras la selección usa la forma beta-binomial del total (la misma que el generador) y,
// para las dificultades y el KR-20, un Monte Carlo con el propio generador y un azar aislado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';

const dificultades = Array.from({ length: 20 }, (_, j) => +(0.3 + 0.55 * j / 19).toFixed(3));
/** @param {object | null} seleccion @param {number} r */
function generador(seleccion, r = 0.5) {
    const g = new GeneradorDatos();
    /** @type {any} */ (g).configuracion = { tamanoMuestra: 300, semilla: 9, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 }, R: { variable: 'Q', rIntra: 0 } },
        pruebas: [{ nombre: 'Estrés', nombreCorto: 'ES', prueba: 'T', tipo: 'dimension', numItems: 20, media: 60, desviacion: 10, minimo: 1, maximo: 5, alfa: 0.85, distribucion: 'normal', invertidos: 0 },
            { nombre: 'Razonamiento', nombreCorto: 'RZ', prueba: 'R', tipo: 'dimension', numItems: 20, media: 11.5, desviacion: 4.25, alfa: 0.8, minimo: 0, maximo: 1, distribucion: 'normal', invertidos: 0, dificultades }],
        sociodemograficos: [], correlaciones: [{ a: 'Estrés', b: 'Razonamiento', r }], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], niveles: [], paneles: [], histeresis: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {}, seleccion };
    const cfg = /** @type {any} */ (g).configuracion; cfg.gruposPruebas = /** @type {any} */ (g).agruparPruebas(cfg.pruebas);
    return /** @type {any} */ (g);
}
const filasDe = (inf, nombre) => inf.filter(f => f.variable.startsWith(nombre));

test('una escala de acierto/error relacionada con la selección: media, DE, KR-20, dificultades y r esperados, sin ✗, y el azar aislado', () => {
    const g = generador({ variable: 'Estrés', lado: 'superior', proporcion: 0.3 });
    assert.deepEqual(g.validarConfiguracion().errores, []);
    const b = g.generarBaseDatos(), col = g.columnaDeEscala(g.configuracion.pruebas[1]), antes = Array.from(b.columna(col).datos).join(',');
    const inf = g.informePedidoObtenido(b), rz = filasDe(inf, 'Razonamiento');
    assert.deepEqual(inf.filter(f => f.ok === false).map(f => `${f.tipo} ${f.variable}`), []);
    const kr = rz.find(f => f.tipo === 'KR-20'), de = rz.find(f => f.tipo === 'DE');
    assert.match(kr.pedido, /^≈ 0\.7/, 'el KR-20 esperado baja respecto a 0.80 (restricción de rango)');
    assert.ok(parseFloat(de.pedido.replace('≈ ', '')) < 4.25, 'la DE esperada baja (con la forma normal de antes, subía)');
    // (2026.12.25) la discriminación esperada es la r ítem–RESTO media (la del núcleo), como la obtenida: con la ítem–total
    // salía ≈ 0.41 frente a 0.31, y la tolerancia de la fila (tres errores típicos de una r) no lo distinguía
    const disc = rz.find(f => f.tipo === 'disc'), dEsp = parseFloat(disc.pedido.replace('≈ ', '')), dObs = parseFloat(disc.obtenido);
    assert.ok(Math.abs(dObs - dEsp) < 0.04, `discriminación esperada ${disc.pedido}, obtenida ${disc.obtenido}`);
    assert.equal(JSON.stringify(g.informePedidoObtenido(b)), JSON.stringify(inf), 'el informe repetido es idéntico');
    assert.equal(JSON.stringify(g.informePedidoObtenido(b.aObjetos())), JSON.stringify(inf), 'y desde objetos');
    assert.equal(Array.from(b.columna(col).datos).join(','), antes, 'el Monte Carlo no altera la base');
});

test('la selección sobre la propia escala de acierto/error, y una escala no relacionada (r = 0), que conserva lo pedido para la población', () => {
    const propia = generador({ variable: 'Razonamiento', lado: 'inferior', proporcion: 0.4 });
    assert.deepEqual(propia.validarConfiguracion().errores, []);
    const infP = propia.informePedidoObtenido(propia.generarBaseDatos());
    assert.deepEqual(infP.filter(f => f.ok === false).map(f => `${f.tipo} ${f.variable}`), []);
    const ajena = generador({ variable: 'Estrés', lado: 'superior', proporcion: 0.3 }, 0);
    const infA = ajena.informePedidoObtenido(ajena.generarBaseDatos());
    assert.equal(filasDe(infA, 'Razonamiento').find(f => f.tipo === 'KR-20').pedido, '0.80', 'sin relación con la selección, su distribución no cambia');
});

test('_txDe usa, tras generar, la forma beta-binomial del generador (antes, la normal)', () => {
    const g = generador({ variable: 'Estrés', lado: 'superior', proporcion: 0.3 });
    g.generarBaseDatos();
    assert.match(g._txDe('Razonamiento').clave, /^p:bb:Razonamiento:/);
    assert.match(g._txDe('Estrés').clave, /^p:normal:/, 'normal (desde la 2026.12.04 la clave incluye la media, la DE y el rango, de los que depende el recorte)');
});

test('revisión de la 2026.11.26: con el mismo generador reutilizado (como en la aplicación), lo esperado no arrastra la caché de una generación anterior', () => {
    /** @param {any} g @param {string} heter */
    const correr = (g, heter) => { const n = generador({ variable: 'Razonamiento', lado: 'inferior', proporcion: 0.4 }); g.configuracion = n.configuracion; g.configuracion.heterogeneidadItems = heter; g.generarBaseDatos(); return g._dicotomicaTrasSeleccion(g.configuracion.pruebas[1]); };
    const reutilizado = /** @type {any} */ (new GeneradorDatos()); correr(reutilizado, 'leve');
    assert.equal(correr(reutilizado, 'alta').kr20, correr(/** @type {any} */ (new GeneradorDatos()), 'alta').kr20);
});

