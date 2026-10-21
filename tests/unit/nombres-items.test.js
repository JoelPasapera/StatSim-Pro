// @ts-check
// tests/unit/nombres-items.test.js — (2026.12.31, tercera y cuarta revisión) los ítems de una escala por el nombre de sus
// columnas (analizador/motor/nombres-items.js) y el plegado de mayúsculas de las expresiones regulares (core/data/texto.js):
// lo mismo que las expresiones que se usaban —/^sigla\d+$/i, /(\d+)$/, /^(.+?)[_\-]?(\d+)$/— comparado con ellas, también
// con los caracteres en que toLowerCase no coincide con la expresión (σ y ς, µ y μ, el signo kelvin, ſ), con fines de línea,
// sin distinguir mayúsculas y con números de cualquier largo; el reparto de las columnas entre siglas y el primer grupo de
// una sigla, comparados con lo que hacían las expresiones; y enseguida con miles de columnas y de dimensiones, también con
// siglas encadenadas («T», «T1», «T11»…; antes, el producto: minutos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escaparRegExp, plegarComoRegExp } from '../../src/core/data/texto.js';
import { cifrasFinales, prefijoYNumero, primeroPorSigla, repartoPorSigla } from '../../src/analizador/motor/nombres-items.js';
import { Fiabilidad } from '../../src/analizador/fiabilidad.js';
import { EtiquetasVariables } from '../../src/shared/etiquetas-variables.js';

/** Un generador congruencial (el de MINSTD), para casos reproducibles. @param {number} semilla */
const generador = semilla => {
    let s = semilla;
    const u = () => (s = (s * 48271) % 2147483647) / 2147483647;
    return { u, elige: (/** @type {readonly string[]} */ l) => /** @type {string} */ (l[Math.floor(u() * l.length)]) };
};

test('el plegado iguala dos caracteres exactamente cuando /^x$/i (sin «u») los iguala: cada carácter del plano básico, con los de su clase y los de su minúscula y su mayúscula', () => {
    const plegar = (/** @type {number} */ c) => plegarComoRegExp(String.fromCharCode(c));
    /** @type {Map<string, number[]>} */
    const clases = new Map();
    for (let c = 0; c < 65536; c++) {
        const p = plegar(c);
        assert.equal(p.length, 1, `conserva el largo: ${c.toString(16)}`);
        const l = clases.get(p);
        if (l) l.push(c); else clases.set(p, [c]);
    }
    let comparados = 0;
    for (let c = 0; c < 65536; c++) {
        const ch = String.fromCharCode(c), re = new RegExp('^' + escaparRegExp(ch) + '$', 'i');
        // los candidatos a igualarse: su clase y las de su minúscula y su mayúscula
        const candidatos = new Set(clases.get(plegar(c)));
        for (const v of [ch.toLowerCase(), ch.toUpperCase()]) for (const x of v) for (const d of clases.get(plegarComoRegExp(x)) || []) candidatos.add(d);
        for (const d of candidatos) {
            comparados++;
            assert.equal(plegar(c) === plegar(d), re.test(String.fromCharCode(d)), `${c.toString(16)} y ${d.toString(16)}`);
        }
    }
    assert.ok(comparados > 65536);
    // los que toLowerCase no pliega como la expresión
    for (const [a, b, iguales] of [['σ', 'ς', true], ['µ', 'μ', true], ['K', 'k', false], ['ſ', 's', false], ['ß', 'ẞ', false], ['İ', 'i', false], ['Ñandú', 'ñANDÚ', true]]) {
        assert.equal(plegarComoRegExp(a) === plegarComoRegExp(b), iguales, `${a} ${b}`);
        assert.equal(new RegExp('^' + escaparRegExp(a) + '$', 'i').test(/** @type {string} */ (b)), iguales, `${a} ${b} (expresión)`);
    }
    assert.equal(plegarComoRegExp('a😀b'), 'A😀B', 'los pares sustitutos, tal cual (sin «u», carácter a carácter)');
    assert.equal(plegarComoRegExp(null), '');
});

const RAICES = ['PE', 'pe', 'Pe', 'T', 't', 'T2', 'A1', 'σ', 'ς', 'Σ', 'µ', 'μ', 'K', 'K', 'k', 'ſ', 's', 'ÉS', 'és', 'X_', 'a.b', '(a+)+', 'a:', 'Ítem\n', '\ud83d', '😀', ''];
/** Unas cifras al azar: a veces con ceros delante, a veces con 25 sietes detrás. @param {() => number} u */
const cifrasAlAzar = u => (u() < 0.15 ? '0'.repeat(Math.floor(u() * 30)) : '') + String(Math.floor(u() * 300)) + (u() < 0.1 ? '7'.repeat(25) : '');
/** Unos nombres de columna al azar. @param {ReturnType<typeof generador>} g @param {number} n */
const nombresAlAzar = ({ u, elige }, n) => Array.from({ length: n }, () => (u() < 0.75 ? elige(RAICES) + (u() < 0.2 ? elige(['_', '-', 'x']) : '') + cifrasAlAzar(u) : elige(['Edad', 'Total_PE', '12', '', 'T', '7a'])));
/** Una sigla al azar: una raíz, a veces con cifras. @param {ReturnType<typeof generador>} g */
const siglaAlAzar = ({ u, elige }) => (u() < 0.7 ? elige(RAICES) + (u() < 0.3 ? cifrasAlAzar(u).slice(0, 1 + Math.floor(u() * 3)) : '') : elige(['PE_', 'T21', '0', '00', '1', 'nada']));
/** La expresión que se usaba para una sigla. @param {string} sigla */
const deLaSigla = sigla => new RegExp('^' + escaparRegExp(sigla) + '\\d+$', 'i');

test('las columnas de una sigla: las mismas, en el mismo orden, que /^sigla\\d+$/i, en 3000 listas al azar', () => {
    const g = generador(31);
    for (let caso = 0; caso < 3000; caso++) {
        const nombres = nombresAlAzar(g, Math.floor(g.u() * 40));
        for (let k = 0; k < 8; k++) {
            const sigla = siglaAlAzar(g), re = deLaSigla(sigla);
            // un reparto nuevo, que se queda con todas (al menos una): lo que encuentra la expresión
            assert.deepEqual(repartoPorSigla(nombres, 1)(sigla), nombres.flatMap((n, i) => (re.test(n) ? [i] : [])), `«${sigla}» en ${JSON.stringify(nombres)}`);
        }
    }
});

test('el reparto entre siglas, en orden: lo que hacía la detección con las expresiones (cada sigla, las libres, si son 2 o más)', () => {
    const g = generador(57);
    for (let caso = 0; caso < 3000; caso++) {
        const nombres = nombresAlAzar(g, Math.floor(g.u() * 40));
        const siglas = Array.from({ length: Math.floor(g.u() * 10) }, () => siglaAlAzar(g));
        const tomar = repartoPorSigla(nombres, 2), tomados = new Set();
        for (const sigla of siglas) {
            const re = deLaSigla(sigla);
            const libres = nombres.flatMap((n, i) => (re.test(n) && !tomados.has(i) ? [i] : []));
            const esperado = libres.length >= 2 ? libres : [];
            esperado.forEach(i => tomados.add(i));
            assert.deepEqual(tomar(sigla), esperado, `«${sigla}» tras ${JSON.stringify(siglas)} en ${JSON.stringify(nombres)}`);
        }
    }
});

test('el primer grupo con todos sus ítems de una sigla: el que encontraba la expresión, en 3000 casos al azar', () => {
    const g = generador(91);
    for (let caso = 0; caso < 3000; caso++) {
        const grupos = Array.from({ length: Math.floor(g.u() * 8) }, () => (g.u() < 0.1 ? null : nombresAlAzar(g, Math.floor(g.u() * 5))));
        const primero = primeroPorSigla(grupos);
        for (let k = 0; k < 8; k++) {
            const sigla = siglaAlAzar(g), re = deLaSigla(sigla);
            const esperado = grupos.findIndex(l => !!l && l.length > 0 && l.every(n => re.test(n)));
            assert.equal(primero(sigla), esperado, `«${sigla}» en ${JSON.stringify(grupos)}`);
        }
    }
});

test('siglas encadenadas («T», «T1», «T11»… hasta mil): cada columna se mira unas pocas veces', () => {
    // antes, cada sigla recorría las 10 000 columnas que ya se había quedado la primera (6 s), y los totales, otro tanto
    const unos = '1'.repeat(1000);
    const nombres = Array.from({ length: 10000 }, (_, k) => 'T' + unos + k);
    const siglas = Array.from({ length: 1000 }, (_, m) => 'T' + '1'.repeat(m));
    let t0 = Date.now();
    const tomar = repartoPorSigla(nombres, 2);
    const tomadas = siglas.map(s => tomar(s).length);
    assert.ok(Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
    assert.deepEqual([tomadas[0], tomadas.slice(1).every(n => n === 0)], [10000, true], 'la primera se las queda todas; las demás, ninguna');
    t0 = Date.now();
    const primero = primeroPorSigla([nombres.slice(0, 5000), nombres.slice(5000)]);
    assert.deepEqual(siglas.map(s => primero(s)).filter(i => i !== 0), [], 'de todas, el primer grupo');
    assert.ok(Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
});

test('las cifras finales y el prefijo con su número, como /(\\d+)$/ y /^(.+?)[_\\-]?(\\d+)$/ (también con fines de línea)', () => {
    const { u, elige } = generador(7);
    const piezas = ['a', 'B', '1', '2', '0', '_', '-', 'x', '9', '__', '--', 'é', 'σ', '\n', '\r', ' ', ' '];
    for (let k = 0; k < 20000; k++) {
        const nombre = Array.from({ length: 1 + Math.floor(u() * 8) }, () => elige(piezas)).join('');
        const m = nombre.match(/(\d+)$/);
        assert.equal(cifrasFinales(nombre), m ? m[1] : '', nombre);
        const p = nombre.match(/^(.+?)[_\-]?(\d+)$/), r = prefijoYNumero(nombre);
        assert.deepEqual(r ? [r.prefijo, r.numero] : null, p ? [p[1], p[2]] : null, JSON.stringify(nombre));
    }
    assert.equal(cifrasFinales('129'), '129', 'todas: el prefijo «1» y el número «29» son para agrupar');
    assert.deepEqual(prefijoYNumero('129'), { prefijo: '1', numero: '29' });
    // (cuarta revisión) el «.» de la expresión no cruza un fin de línea: «Ítem↵1» no es un ítem (antes, el configurador
    // mostraba la dimensión «Ítem↵» y el análisis la descartaba en silencio)
    assert.equal(prefijoYNumero('Ítem\n1'), null);
});

test('la detección por prefijos y columnas de puntaje: el orden de los ítems, la columna asociada y los totales', () => {
    const datosDe = (/** @type {string[]} */ columnas) => [1, 2, 3].map(i => Object.fromEntries(columnas.map((c, j) => [c, (i * (j + 2)) % 5])));
    const grupos = (/** @type {string[]} */ columnas) => Fiabilidad.detectarGrupos(datosDe(columnas)).map((/** @type {any} */ g) => [g.nombre, g.etiqueta, g.items.join()]);
    // los ítems de un prefijo, por todas sus cifras finales («129» por 129, no por 29)
    EtiquetasVariables.limpiar();
    assert.deepEqual(grupos(['ID', '129', '13', '100']), [['1', '1', '13,100,129']]);
    // la columna de puntaje que da su nombre al grupo: la que compara la expresión con «i» («ſ» no es «s»), y la primera
    EtiquetasVariables.fijar({ 'Total_ſ': 'Ese largo', Total_s: 'Ese', dimension_S: 'Otra' }, []);
    assert.deepEqual(grupos(['ID', 's1', 's2', 'Total_ſ']), [['s', 's', 's1,s2']]);
    assert.deepEqual(grupos(['ID', 's1', 's2', 'Total_ſ', 'Total_s', 'dimension_S']), [['s', 'Ese', 's1,s2']]);
    assert.deepEqual(grupos(['ID', 's1', 's2', 'dimension_S', 'Total_s']), [['s', 'Otra', 's1,s2']]);
    // escalas totales: con un grupo por dimensión que tenga TODOS sus ítems de la sigla, el primero; y sin repetir un TOTAL_
    const prueba = { prueba: 'P', variable: 'V', columnaGeneral: 'General_P', etiquetaGeneral: 'P', siglaGeneral: null, unidimensional: false, dimensiones: [{ columna: 'Dimension_A', etiqueta: 'A', sigla: 'A' }, { columna: 'Dimension_B', etiqueta: 'B', sigla: 'B' }] };
    EtiquetasVariables.fijar({ A1: 'a' }, [prueba]);
    const totales = (/** @type {any[]} */ lista) => Fiabilidad._totalesPorPrueba(lista).map((/** @type {any} */ t) => [t.nombre, t.items.join()]);
    const g = (/** @type {string} */ nombre, /** @type {string[]} */ items) => ({ nombre, etiqueta: nombre, items, origen: 'config' });
    assert.deepEqual(totales([g('A', ['A1', 'A2']), g('B', ['B1', 'B2'])]), [['TOTAL_P', 'A1,A2,B1,B2']]);
    assert.deepEqual(totales([g('A', ['A1', 'Edad']), g('B', ['B1', 'B2'])]), [], 'un grupo con un ítem que no es de la sigla no es la dimensión');
    assert.deepEqual(totales([g('A', ['A1', 'A2']), g('B', ['B1', 'B2']), g('TOTAL_P', ['A1', 'B1'])]), [], 'ya hay un TOTAL_P');
    assert.deepEqual(totales([g('X', ['A1', 'Edad']), g('A', ['a3', 'A4']), g('B', ['B1', 'B2'])]), [['TOTAL_P', 'a3,A4,B1,B2']], 'el primero que es de la sigla');
    EtiquetasVariables.limpiar();
});

test('miles de columnas y de dimensiones: la detección, enseguida y con los mismos grupos', () => {
    // 8000 ítems de una sigla y 5000 dimensiones con ella o con sus variantes: antes, una expresión por dimensión y columna
    const columnas = ['ID', ...Array.from({ length: 8000 }, (_, i) => `A${i + 1}`), ...Array.from({ length: 4000 }, (_, i) => `B${i + 1}`)];
    const fila = Object.fromEntries(columnas.map((c, i) => [c, i % 5]));
    const datos = [fila, { ...fila, A1: 3 }, { ...fila, B2: 1 }];
    const dimensiones = Array.from({ length: 2500 }, (_, i) => ({ columna: `Dimension_A${i}`, etiqueta: `D${i}`, sigla: i % 2 ? 'a' : 'A' }));
    EtiquetasVariables.fijar({ A1: 'Ítem 1' }, [{ prueba: 'P', variable: 'V', columnaGeneral: 'General_P', etiquetaGeneral: 'P', siglaGeneral: null, unidimensional: false, dimensiones }]);
    let t0 = Date.now();
    let grupos = Fiabilidad.detectarGrupos(datos);
    assert.ok(Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
    assert.deepEqual(grupos.map((/** @type {any} */ g) => [g.nombre, g.origen, g.items.length]), [['A', 'simulador', 8000], ['B', 'prefijo', 4000]]);
    // 2500 tests sobre las mismas dos dimensiones: una sola escala total (antes, 2500 totales de 12 000 ítems: 30 millones)
    const tests = Array.from({ length: 2500 }, (_, i) => ({ prueba: `T${i}`, variable: 'V', columnaGeneral: `General_T${i}`, etiquetaGeneral: `T${i}`, siglaGeneral: null, unidimensional: false,
        dimensiones: [{ columna: 'Dimension_A', etiqueta: 'A', sigla: 'A' }, { columna: 'Dimension_B', etiqueta: 'B', sigla: 'B' }] }));
    EtiquetasVariables.fijar({ A1: 'Ítem 1' }, tests);
    t0 = Date.now();
    grupos = Fiabilidad.detectarGrupos(datos);
    assert.ok(Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
    assert.deepEqual(grupos.map((/** @type {any} */ g) => [g.nombre, g.items.length]), [['A', 8000], ['B', 4000], ['TOTAL_T0', 12000]]);
    assert.deepEqual(/** @type {any} */ (grupos[2]).particion.map((/** @type {any} */ p) => p.items.length), [8000, 4000]);
    // con el configurador relleno, cada detección mira las columnas en un conjunto (antes, O(columnas²): 16 000, 2 s)
    EtiquetasVariables.limpiar();
    t0 = Date.now();
    const lista = columnas.slice(1).join(', ');
    assert.equal(Fiabilidad._grupoDesdeTexto('Todo', lista, new Set(columnas.slice(1)), new Set(), 'config')?.items.length, 12000);
    assert.ok(Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
});

test('nombres de columna que son propiedades de un objeto («constructor», «toString», «__proto__»): ni errores ni funciones heredadas', async () => {
    const { AnalizadorEstadistico } = await import('../../src/analizador/estadistica.js');
    EtiquetasVariables.limpiar();
    const columnas = ['ID', 'constructor1', 'constructor2', 'toString1', 'toString2', '__proto____1', '__proto____2', 'valueOf'];
    const datos = [1, 2, 3].map(i => Object.fromEntries(columnas.map((c, j) => [c, (i * (j + 1)) % 5])));
    // antes: «porPrefijo[clave].push is not a function» y la tarjeta de fiabilidad sin dimensiones
    assert.deepEqual(Fiabilidad.detectarGrupos(datos).map((/** @type {any} */ g) => [g.nombre, g.items.join()]),
        [['constructor', 'constructor1,constructor2'], ['toString', 'toString1,toString2'], ['__proto__', '__proto____1,__proto____2']]);
    // la etiqueta de una columna sin etiqueta es su nombre (antes, «function Object() { [native code] }»)
    EtiquetasVariables.fijar({ General_A: 'Autoestima' }, []);
    for (const c of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
        assert.equal(EtiquetasVariables.etiqueta(c), c);
        assert.equal(EtiquetasVariables.etiquetaConColumna(c), c);
    }
    assert.equal(EtiquetasVariables.etiqueta('General_A'), 'Autoestima');
    EtiquetasVariables.fijar(JSON.parse('{"__proto__": "Proto", "constructor": "Constructor"}'), []);
    assert.deepEqual([EtiquetasVariables.etiqueta('__proto__'), EtiquetasVariables.etiqueta('constructor')], ['Proto', 'Constructor'], 'y las propias, sí');
    EtiquetasVariables.limpiar();
    // las dimensiones de una variable: solo las configuradas
    AnalizadorEstadistico.cargarDatos([{ constructor: 1, __proto__x: 2, a: 1, b: 2 }, { constructor: 2, __proto__x: 1, a: 2, b: 1 }]);
    assert.equal(AnalizadorEstadistico.obtenerDimensiones('constructor'), null);
    assert.equal(AnalizadorEstadistico.obtenerDimensiones('toString'), null);
    AnalizadorEstadistico.configurarDimensiones('__proto__', { D: ['a', 'b'] });
    assert.deepEqual(AnalizadorEstadistico.obtenerDimensiones('__proto__'), { D: ['a', 'b'] });
    assert.equal(Object.getPrototypeOf(AnalizadorEstadistico.obtenerTodasDimensiones()), Object.prototype);
});
