import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';

test('el generador aleatorio es reproducible por semilla y sus distribuciones tienen la media esperada', () => {
    const g = new GeneradorDatos(); g.inicializarAleatorio(7);
    const a = Array.from({ length: 5 }, () => g.aleatorio());
    g.inicializarAleatorio(7);
    const b = Array.from({ length: 5 }, () => g.aleatorio());
    assert.deepEqual(a, b);
    let s = 0; for (let i = 0; i < 20000; i++) s += g.generarPoisson(150);
    assert.ok(Math.abs(s / 20000 - 150) < 1, 'Poisson λ = 150');
    let z = 0, z2 = 0; for (let i = 0; i < 20000; i++) { const v = g.generarNormalEstandar(); z += v; z2 += v * v; }
    assert.ok(Math.abs(z / 20000) < 0.03 && Math.abs(z2 / 20000 - 1) < 0.05, 'normal estándar');
});

test('la validación es autosuficiente: rechaza entradas imposibles sin la interfaz', () => {
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: 5000000, semilla: 1, pruebas: [{ nombre: 'A', nombreCorto: 'A', prueba: 'T', tipo: 'dimension', numItems: 5, media: 15, desviacion: 3, alfa: 1.2, minimo: 1, maximo: 5, distribucion: 'normal', invertidos: 9 }], sociodemograficos: [], correlaciones: [{ a: 'A', b: 'A', r: 1.5 }], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], gruposPruebas: [], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const v = g.validarConfiguracion();
    for (const patron of [/máximo es 1 000 000/, /entre 0 y 1/, /invertidos/, /consigo misma/]) assert.ok(v.errores.some(e => patron.test(e)), 'falta el error ' + patron);
});

test('(2026.12.25) _cargasConFiabilidad: el α o la ω implícitos de las cargas reescaladas son los pedidos (40 pasos de bisección), con tope 0,95; _lambdasEfectivas la usa en el modo «el α de la tabla I»', () => {
    const g = new GeneradorDatos();
    for (const [crudas, objetivo, indice] of [[[0.5, 0.6, 0.4, 0.55], 0.8, 'alfa'], [[0.3, 0.35, 0.3], 0.6, 'omega'], [[0.7, 0.7, 0.7, 0.7, 0.7, 0.7], 0.75, 'alfa'], [[0.4, 0.9, 0.85, 0.5], 0.9, 'omega']]) {
        const l = g._cargasConFiabilidad(crudas, objetivo, indice), fi = g._fiabilidadImplicita(l)[indice];
        assert.ok(Math.abs(fi - objetivo) < 1e-10, `${indice} implícito ${fi} frente a ${objetivo}`);
        assert.ok(l.every(x => x <= 0.95));
        // un solo multiplicador para todas (las que pasarían de 0,95 se quedan en 0,95)
        const m = l[0] / crudas[0];
        l.forEach((x, i) => assert.ok(Math.abs(x - Math.min(0.95, crudas[i] * m)) < 1e-15, `carga ${i}`));
    }
    // inalcanzable: el multiplicador llega a su tope (3)
    g._cargasConFiabilidad([0.05, 0.05], 0.99, 'alfa').forEach(x => assert.ok(Math.abs(x - 0.15) < 1e-9, `${x}`));
    g.configuracion = { indiceFiabilidad: 'alfa', estructuras: [{ prueba: 'T', modo: 'alfa', cargas: { A: [[0.5], [0.6], [0.4]] } }] };
    const p = { prueba: 'T', nombre: 'A', numItems: 3, alfa: 0.7 };
    assert.deepEqual(g._lambdasEfectivas(p, [[0.5], [0.6], [0.4]], 0), g._cargasConFiabilidad([0.5, 0.6, 0.4], 0.7, 'alfa'));
    g.configuracion.estructuras[0].modo = 'cargas';
    assert.deepEqual(g._lambdasEfectivas(p, [[0.5], [1.2], [-0.1]], 0), [0.5, 0.95, 0.05], 'en modo «las cargas», las de la matriz, acotadas');
});

test('(2026.12.25) la matriz válida más cercana a una imposible: la de NumPy (autovalores con piso 10⁻³ y diagonal 1); el Cholesky forzado, con piso 10⁻⁹ y sus marcas', () => {
    const g = new GeneradorDatos();
    const R = [[1, 0.9, 0.9, 0.1], [0.9, 1, -0.5, 0.2], [0.9, -0.5, 1, 0.3], [0.1, 0.2, 0.3, 1]];   // autovalor mínimo −0,576
    // numpy.linalg.eigh, piso 10⁻³, reescalada a diagonal 1
    const numpy = [[1.0, 0.590734372950101, 0.5877683528357657, 0.13333400155094555], [0.590734372950101, 1.0, -0.27861286168579313, 0.14489640642674093], [0.5877683528357657, -0.2786128616857932, 1.0, 0.23594357394525117], [0.1333340015509456, 0.1448964064267409, 0.23594357394525117, 1.0]];
    const P = g._matrizValidaMasCercana(R);
    P.forEach((f, i) => f.forEach((v, j) => assert.ok(Math.abs(v - numpy[i][j]) < 1e-12, `(${i}, ${j}): ${v} frente a ${numpy[i][j]}`)));
    assert.ok(g._esDefinidaPositiva(P) && !g._esDefinidaPositiva(R));
    const L = g.descomposicionCholesky([[1, 1], [1, 1]]);
    assert.deepEqual(L, [[1, 0], [1, Math.sqrt(1e-9)]]);
    assert.ok(g.matrizForzada && g.matrizNoDefinidaPositiva, 'pedido imposible: forzada y no definida positiva');
    g.descomposicionCholesky([[1, 0.5], [0.5, 1]]);
    assert.equal(g.matrizNoDefinidaPositiva, false);
});

test('(2026.12.25) calibrarFiabilidad en una escala continua: la α teórica del valor interno es la pedida (bisección del núcleo), también por encima de 0,9', () => {
    const g = new GeneradorDatos();
    g.configuracion = /** @type {any} */ ({ indiceFiabilidad: 'alfa', estructuras: [], heterogeneidadItems: 'ninguna' });
    for (const alfa of [0.5, 0.8, 0.95, 0.97]) {
        const p = { nombre: 'A', prueba: 'T', numItems: 6, alfa, minimo: null, maximo: null, media: 30, desviacion: 5, distribucion: 'normal' };
        const interno = g.calibrarFiabilidad(p, 'alfa');
        assert.ok(Math.abs(g._alfaTeorica(p, interno, null) - alfa) < 1e-9, `α ${alfa}: interno ${interno}`);
    }
});

test('(2026.12.25) _pafUnFactor: los ejes principales de pasos fijos del Simulador (fuera del núcleo a propósito) se acercan a la solución exacta sin alcanzarla', () => {
    const g = new GeneradorDatos();
    for (const [lam, tol] of /** @type {[number[], number][]} */ ([[[0.45, 0.5, 0.4], 1e-4], [[0.25, 0.3, 0.2], 1e-4], [[0.6, 0.7, 0.5], 1e-4], [[0.7, 0.7, 0.6, 0.6, 0.5, 0.5], 1e-5]])) {
        // la matriz de la población: el modelo de un factor la reproduce exactamente (con tres ítems, λ₁² = r₁₂·r₁₃/r₂₃)
        const R = lam.map((a, i) => lam.map((b, j) => (i === j ? 1 : a * b))), c = /** @type {number[]} */ (g._pafUnFactor(R));
        lam.forEach((l, i) => assert.ok(Math.abs(c[i] - l) < tol, `k = ${lam.length}, λ${i + 1}: ${c[i]} frente a ${l}`));
    }
    assert.equal(g._pafUnFactor([[1]]), null, 'un solo ítem');
    assert.equal(g._pafUnFactor([[1, NaN], [NaN, 1]]), null, 'no estimable');
    assert.equal(g._pafUnFactor([[1, 0, 0], [0, 1, 0], [0, 0, 1]]), null, 'ítems incorrelados: sin factor');
});

test('(2026.12.25) la d pedida sobre un General se traslada a sus dimensiones (por la bisección del núcleo) y se alcanza', () => {
    const esc = (/** @type {string} */ nombre, /** @type {string} */ corto, /** @type {number} */ alfa) => ({ nombre, nombreCorto: corto, prueba: 'EQ-i', tipo: 'dimension', numItems: 8, media: 24, desviacion: 5, alfa, minimo: 1, maximo: 5, distribucion: 'normal', invertidos: 0 });
    const g = new GeneradorDatos();
    g.configuracion = /** @type {any} */ ({ tamanoMuestra: 800, semilla: 2026, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve',
        variablesPorTest: { 'EQ-i': { variable: 'IE', rIntra: 0.4 } }, pruebas: [esc('Percepción', 'PE', 0.8), esc('Comprensión', 'CE', 0.85), esc('Regulación', 'RE', 0.78)],
        sociodemograficos: [{ categoria: 'Sexo', categoriaCorta: 'S', distribucion: 'binaria', promedio: 0.5, desviacion: 1, minimo: null, maximo: null, decimales: 0, niveles: null, ordinal: false, fechaNacimiento: null, dependeDe: '', fuerza: 0.4 }],
        correlaciones: [], diferenciasGrupo: [{ tipo: 'd', cuantitativa: 'IE — EQ-i', agrupacion: 'Sexo', d: -0.3 }], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], gruposPruebas: [], realismo: {} });
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    assert.deepEqual(g.validarConfiguracion().errores, []);
    const b = g.generarBaseDatos(), fila = g.informePedidoObtenido(b).find((/** @type {any} */ f) => f.tipo === 'd' && /IE — EQ-i/.test(f.variable));
    assert.ok(fila && fila.ok, `fila del informe: ${JSON.stringify(fila)}`);
    assert.ok(Math.abs(parseFloat(fila.obtenido) + 0.3) <= 0.02, `d obtenida ${fila.obtenido}`);   // los totales se redondean a enteros
    assert.deepEqual(g.diferenciasLimitadas, [], 'alcanzable: no se informa como limitada');
});

test('(2026.12.25) estructura con factores de 3 ítems y cargas modestas: la calibración de μ es estable (con los ejes principales convergidos del núcleo, caía en casos Heywood y subía μ hasta su tope)', () => {
    const esc = (/** @type {string} */ nombre, /** @type {string} */ corto) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 3, media: 9, desviacion: 1.8, alfa: 0.6, minimo: 1, maximo: 5, distribucion: 'normal', invertidos: 0 });
    /** @type {number[]} */ const mus = [], lam = [0.35, 0.35, 0.35];
    for (let semilla = 1; semilla <= 40; semilla++) {
        const g = new GeneradorDatos();
        g.configuracion = /** @type {any} */ ({ tamanoMuestra: 300, semilla, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve',
            variablesPorTest: { T: { variable: 'Total', rIntra: 0.3 } }, pruebas: [esc('Alfa', 'AL'), esc('Beta', 'BE')], sociodemograficos: [], correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [],
            estructuras: [{ prueba: 'T', modo: 'cargas', factores: ['Alfa', 'Beta'], cargas: { Alfa: lam.map(l => [l, 0]), Beta: lam.map(l => [0, l]) }, metodo: null, desajuste: 'ninguno' }],
            desenlaces: [], cortes: [], concordancias: [], realismo: {} });
        g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
        assert.deepEqual(g.validarConfiguracion().errores, []);
        g.generarBaseDatos();
        /** @type {any} */ (g).perfilesItems.forEach((/** @type {any} */ perfil) => { if (perfil.estructura) mus.push(perfil.estructura.mu); });
    }
    assert.equal(mus.length, 80);
    // con los ejes principales de pasos fijos, los 80 μ entre 0,485 y 0,540; con los convergidos, hasta 0,664
    assert.ok(Math.max(...mus) - Math.min(...mus) < 0.1, `μ calibrados: ${mus.map(m => m.toFixed(3)).join(', ')}`);
});
