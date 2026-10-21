// @ts-check
// tests/ui/buscador-wos.test.js — (2026.12.26) Web of Science en la interfaz del Buscador, montada sobre index.html real
// (sin red): la casilla, la cantidad, el panel de la conexión (guardar, olvidar), el aviso de inglés, la tarea de la
// búsqueda con su protocolo y su PRISMA, la fusión de duplicados entre bases, la indexación, el nombre de la revista que
// corrige el enriquecimiento, el botón «Abrir en Web of Science» y la guardia de fuentes (la OMS y la ONU cuentan).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
const CLAVE = 'abcdef0123456789abcdef0123456789abcdef01';
/** @type {any} */ let env;
/** @type {any} */ let A;
/** @type {any} */ let W;
/** @type {any} */ let P;
/** @type {any} */ let PRISMA;
/** @type {string[]} */ let pedidas = [];

const sinRed = () => { globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ u) => { pedidas.push(String(u)); throw new Error('sin red en las pruebas'); }); };
/** @param {string} id */
const $ = id => env.document.getElementById(id);
/** @param {Record<string, boolean>} marcas */
function casillas(marcas) {
    for (const id of ['antUsarScholar', 'antUsarScopus', 'antUsarSciencedirect', 'antUsarWos', 'antUsarPubmed', 'antUsarScielo', 'antUsarAlicia', 'antUsarOMS', 'antUsarONU', 'antUsarAbiertas']) $(id).checked = !!marcas[id];
}
/** @param {number} i */
const registro = i => ({ uid: `WOS:00099${String(i).padStart(7, '0')}`, title: `Burnout in teachers ${i}`, source: { sourceTitle: 'REVISTA LATINOAMERICANA DE PSICOLOGIA', publishYear: 2023, volume: '55' },
    names: { authors: [{ displayName: 'Huaman, Ana' }] }, citations: [{ db: 'WOS', count: 3 }], identifiers: { doi: `10.14349/rlp.2023.v55.${i}`, issn: '0120-0534' } });

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    sinRed();
    await import(new URL('src/main.js', raiz).href);
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    const b = await import(new URL('src/buscador/index.js', raiz).href);
    await new Promise(r => setTimeout(r, 0));   // la microtarea de montaje
    A = b.Antecedentes; W = b.WebOfScienceDirecto; P = b.ProtocoloBusqueda; PRISMA = b.PrismaDiagrama;
});

beforeEach(() => {
    sinRed(); pedidas = [];
    W.olvidarClave(); W.RELEVO_URL = ''; W._proximoTurno = 0; W.INTERVALO_MS = 0; W.ESPERA_REINTENTO_MS = 5;
    P.limpiar();
});

test('el formulario trae Web of Science: casilla (sin clave, sin marcar), cantidad, panel de conexión y botón web; y la fuente se exporta', () => {
    assert.ok($('antUsarWos'), 'casilla'); assert.equal($('antUsarWos').checked, false, 'sin clave no se marca sola');
    assert.equal($('antCantidadWos').value, '50'); assert.equal($('antCantidadWos').getAttribute('max'), '1000');
    assert.ok($('antWosConexion') && $('antWosClave') && $('antWosGuardar') && $('antWosProbar') && $('antWosOlvidar'), 'panel de conexión');
    assert.match($('antWosResumen').textContent, /sin clave/);
    assert.ok($('antWosWeb'), 'botón «Abrir en Web of Science»');
    assert.equal(globalThis.StatSim.api.buscador.WebOfScienceDirecto, W, 'expuesta por el puente de la consola');
});

test('guardar la clave desde el panel: queda en este navegador, marca la casilla y se muestra abreviada; una mal copiada no se guarda', () => {
    $('antWosClave').value = 'no vale';
    env.disparar($('antWosGuardar'), 'click');
    assert.match($('antWosEstado').textContent, /no parece válida/); assert.equal(W.clave(), '');
    $('antWosClave').value = CLAVE;
    env.disparar($('antWosGuardar'), 'click');
    assert.equal(globalThis.localStorage.getItem('statsim_wos_clave'), CLAVE); assert.equal($('antWosClave').value, '', 'el campo se vacía');
    assert.equal($('antUsarWos').checked, true); assert.match($('antWosEstado').textContent, /…ef01/); assert.match($('antWosResumen').textContent, /lista/);
    env.disparar($('antWosOlvidar'), 'click');
    assert.equal(globalThis.localStorage.getItem('statsim_wos_clave'), null); assert.equal($('antUsarWos').checked, false);
});

test('«Recordarla en este navegador» sin marcar: la clave vale solo mientras la página está abierta (y se borra la guardada)', () => {
    $('antWosClave').value = CLAVE; $('antWosRecordar').checked = true;
    env.disparar($('antWosGuardar'), 'click');
    assert.equal(globalThis.localStorage.getItem('statsim_wos_clave'), CLAVE);
    $('antWosClave').value = 'ffffffffffffffff0000000000000000'; $('antWosRecordar').checked = false;
    env.disparar($('antWosGuardar'), 'click');
    assert.equal(globalThis.localStorage.getItem('statsim_wos_clave'), null, 'la guardada se borra'); assert.equal(W.clave(), 'ffffffffffffffff0000000000000000');
    assert.match($('antWosEstado').textContent, /…0000 en uso solo mientras la página esté abierta/);
    $('antWosRecordar').checked = true; W.olvidarClave();
});

test('el aviso de inglés nombra las bases marcadas (Scopus, Web of Science o las dos) y se va al marcar English', () => {
    const ingles = env.document.querySelector('#antIdiomas input[value="en"]');
    ingles.checked = false;
    casillas({ antUsarWos: true });
    env.disparar($('antUsarWos'), 'change');
    assert.equal($('antAvisoScopusEs').style.display, 'block'); assert.match($('antAvisoScopusEs').innerHTML, /^⚠️ Web of Science indexa el título/);
    $('antUsarScopus').checked = true; env.disparar($('antUsarScopus'), 'change');
    assert.match($('antAvisoScopusEs').innerHTML, /Scopus y Web of Science indexan/);
    ingles.checked = true; env.disparar(ingles, 'change');
    assert.equal($('antAvisoScopusEs').style.display, 'none');
});

test('la búsqueda con Web of Science: obras con su base, el protocolo con la ecuación y el conteo, y el PRISMA', async () => {
    W.guardarClave(CLAVE);
    globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ u, /** @type {any} */ op) => {
        pedidas.push(String(u));
        if (!/api\.clarivate\.com/.test(String(u))) throw new Error('sin red');
        assert.equal(op.headers['X-ApiKey'], CLAVE);
        return new Response(JSON.stringify({ metadata: { total: 2 }, hits: [registro(1), registro(2)] }), { status: 200 });
    });
    $('antCantidadWos').value = '20';
    const r = await A._buscarUnaConsulta('burnout docente', { desde: '2021' }, { usarWos: true, usarScopus: false, usarSciencedirect: false, usarScholar: false, usarAbiertas: false, usarPubmed: false, usarScielo: false, usarAlicia: false, usarOMS: false, usarONU: false });
    assert.equal(r.obras.length, 2); assert.deepEqual(r.obras[0].fuentesAPI, ['Web of Science']);
    const clarivate = pedidas.find(u => /api\.clarivate\.com/.test(u)) || '';
    assert.equal(new URL(clarivate).searchParams.get('limit'), '20', 'la cantidad del formulario llega a la petición');
    assert.match(r.infos, /^Web of Science \(2 result\.\)$/);
    const fuente = P.resumen().fuentes.find((/** @type {any} */ f) => f.nombre === 'Web of Science');
    assert.ok(fuente, 'el protocolo registra la fuente'); assert.equal(fuente.totalResultados, 2);
    assert.ok(P.fichaHTML().includes(`TS=(burnout AND docente) AND PY=(2021-${new Date().getFullYear() + 1})`), 'con la ecuación literal que se envió');
    assert.ok(PRISMA._datos.identificados['Web of Science'] >= 2, 'PRISMA: identificados en Web of Science');
});

test('sin clave, o con la cuota agotada, Web of Science no se consulta ni entra en el protocolo (y lo dice)', async () => {
    const solo = { usarWos: true, usarScopus: false, usarSciencedirect: false, usarScholar: false, usarAbiertas: false, usarPubmed: false, usarScielo: false, usarAlicia: false, usarOMS: false, usarONU: false };
    let r = await A._buscarUnaConsulta('burnout', {}, solo);
    assert.match(r.infos, /Web of Science no se consultó \(falta la clave/); assert.equal(pedidas.length, 0);
    W.guardarClave(CLAVE); W._agotada = W._credencial();
    r = await A._buscarUnaConsulta('burnout', {}, solo);
    assert.match(r.infos, /Web of Science no se consultó \(tu clave agotó su cuota de hoy/); assert.equal(pedidas.length, 0);
    assert.equal(P.resumen().fuentes.length, 0, 'el protocolo no registra lo que no se buscó');
    W._agotada = '';
});

test('una obra que encuentran Scopus y Web of Science: una sola fila con las dos bases (sin tocar el objeto de la fuente), y la indexación las nombra', () => {
    const scopus = { titulo: 'Burnout in teachers', doi: 'https://doi.org/10.1/abc', fuente: 'Revista X', fuentesAPI: ['Scopus'], resumen: '', citas: 0, issn: '' };
    const wos = { titulo: 'Burnout in teachers', doi: 'https://doi.org/10.1/ABC', fuente: 'Revista X', fuentesAPI: ['Web of Science'], resumen: '', citas: 5, issn: '1234-5678' };
    const solo = { titulo: 'Otra obra', doi: '', fuentesAPI: ['Web of Science'] };
    const indice = new Map(), acumuladas = /** @type {any[]} */ ([]);
    assert.equal(A._incorporarObras(indice, acumuladas, [scopus]), 1);
    assert.equal(A._incorporarObras(indice, acumuladas, [wos, solo, scopus]), 1, 'solo «Otra obra» es nueva');
    assert.equal(acumuladas.length, 2);
    const fila = acumuladas[0];
    assert.notEqual(fila, scopus, 'se copia la primera vez que suma algo'); assert.deepEqual(scopus.fuentesAPI, ['Scopus'], 'el objeto de la fuente no cambia');
    assert.equal(fila.titulo, scopus.titulo); assert.deepEqual(fila.fuentesAPI, ['Scopus', 'Web of Science']);
    assert.equal(fila.citas, 5, 'por DOI, las citas que le faltaban'); assert.equal(fila.issn, '1234-5678', 'y el ISSN');
    assert.equal(A._detectarIndexacion(fila), 'Scopus, Web of Science, Crossref');
    // el fragmento de Google Académico no se toma como resumen (con él la obra ya no se enriquecería)…
    A._incorporarObras(indice, acumuladas, [{ titulo: 'Burnout in teachers', doi: 'https://doi.org/10.1/abc', fuentesAPI: ['Scholar'], resumen: 'Se evaluó la relación entre el burnout y el desempeño de los docentes de…', citas: 99 }]);
    assert.equal(fila.resumen, '', 'sin el fragmento'); assert.equal(fila.citas, 5, 'las citas que ya tenía no cambian');
    assert.deepEqual(fila.fuentesAPI, ['Scopus', 'Web of Science', 'Scholar']);
    // …pero el resumen completo de PubMed sí (Web of Science no lo trae)
    const resumenPubmed = 'Higher academic stress predicted poorer sleep quality in 350 university students of Lima.';
    A._incorporarObras(indice, acumuladas, [{ titulo: 'Burnout in teachers', doi: 'https://doi.org/10.1/abc', fuentesAPI: ['PubMed'], resumen: resumenPubmed, citas: 0 }]);
    assert.equal(fila.resumen, resumenPubmed); assert.deepEqual(fila.fuentesAPI, ['Scopus', 'Web of Science', 'Scholar', 'PubMed']);
    A._incorporarObras(indice, acumuladas, [{ titulo: 'Burnout in teachers', doi: 'https://doi.org/10.1/abc', fuentesAPI: ['PubMed'], resumen: 'Otro resumen, también completo, de la misma obra en otra pasada de la búsqueda.' }]);
    assert.equal(fila.resumen, resumenPubmed, 'un resumen que ya estaba no se pisa');
    // una repetida que no aporta nada (mismas bases y resumen ya presente): ni se copia ni cambia la fila
    const i3 = new Map(), a3 = /** @type {any[]} */ ([]), unica = { titulo: 'X', doi: 'https://doi.org/10.1/x', fuentesAPI: ['Scopus'], resumen: resumenPubmed };
    A._incorporarObras(i3, a3, [unica, { ...unica, fuentesAPI: ['Scopus'], resumen: 'Un resumen largo distinto que no se toma porque la fila ya tiene el suyo.' }]);
    assert.equal(a3[0], unica, 'sin copia');
    // la misma base, de otra pasada, que sí trae el resumen (Scopus con la vista completa ya confirmada): se toma
    const i4 = new Map(), a4 = /** @type {any[]} */ ([]), sinResumen = { titulo: 'Y', doi: 'https://doi.org/10.1/y', fuentesAPI: ['Scopus'], resumen: '' };
    A._incorporarObras(i4, a4, [sinResumen, { ...sinResumen, resumen: resumenPubmed }]);
    assert.equal(a4[0].resumen, resumenPubmed); assert.equal(sinResumen.resumen, '', 'en una copia');
    // coincidencia solo por título: se descarta como antes, sin sumar nada (dos obras distintas pueden llamarse igual)
    const i2 = new Map(), a2 = /** @type {any[]} */ ([]);
    const n2 = A._incorporarObras(i2, a2, [{ titulo: 'Depression', doi: '', fuentesAPI: ['PubMed'], issn: '', citas: 0 }, { titulo: 'Depression', doi: '', fuentesAPI: ['OMS/IRIS'], issn: '9999-9999', citas: 3 }]);
    assert.equal(n2, 1); assert.deepEqual(a2[0].fuentesAPI, ['PubMed'], 'el Redactor no la tomaría por un documento de la OMS'); assert.equal(a2[0].issn, '');
});

test('lo que llega de las fuentes se pinta como texto: ni etiquetas ni enlaces «javascript:» (resultados, matriz y referencias)', () => {
    const hostil = { titulo: '<img src=x onerror="window.__xss=1">Burnout', autores: ['<b>Quispe</b>, M.'], anio: '2024', fuente: 'Revista <script>x</script> & Co', citas: 1,
        link: 'javascript:window.__xss=1', doi: '', fuentesAPI: ['Scholar'], resumen: 'Resumen con <img src=x onerror=alert(1)> dentro y bastante texto para que cuente.', issn: '' };
    A._obras = [hostil]; A._pagina = 0; A._seleccion.clear();
    A._renderResultados(A._obras);
    const html = $('antResultados').innerHTML;
    assert.equal($('antResultados').querySelectorAll('img').length, 0, 'ninguna etiqueta del título'); assert.equal($('antResultados').querySelectorAll('script').length, 0);
    assert.ok(!/onerror/.test(html), 'la etiqueta se quita entera'); assert.match(html, /<td>Burnout<\/td>/, 'el título, como texto'); assert.ok(!/href="javascript:/i.test(html), 'sin enlaces javascript:');
    assert.match(html, /Revista x &amp; Co/);
    // el marcado y las entidades legítimos de otras fuentes (Scopus, Crossref) se leen limpios, no a la vista
    A._obras = [{ ...hostil, titulo: '5-HT<inf>2A</inf> receptors <i>in vivo</i>', fuente: 'Health &amp; Social Care', link: '' }]; A._renderResultados(A._obras);
    const limpio = $('antResultados').querySelector('tbody').textContent;
    assert.match(limpio, /5-HT2A receptors in vivo/); assert.match(limpio, /Health & Social Care/); assert.ok(!/&amp;|<inf>/.test(limpio));
    A._obras = [hostil]; A._renderResultados(A._obras);
    const { celdas, planas } = A._filaMatriz(hostil);
    assert.ok(celdas.every((/** @type {string} */ c) => !/<img|<script|onerror|href="javascript:/i.test(c)), 'celdas escapadas: ' + celdas.join(' | '));
    assert.equal(celdas.at(-1), 'javascript:window.__xss=1', 'un enlace que no es http(s) queda como texto, sin <a>');
    assert.ok(planas.includes('<img src=x onerror="window.__xss=1">Burnout'), 'las exportaciones conservan el texto tal cual');
    const comillas = { ...hostil, titulo: 'Otra obra', link: 'https://evil.example/x"onmouseover="window.__xss=1' };
    A._obras = [comillas]; A._renderResultados(A._obras);
    const enlace = $('antResultados').querySelector('tbody a');
    assert.ok(enlace && enlace.getAttribute('onmouseover') === null, 'unas comillas en el enlace no abren otro atributo');
    assert.match(enlace.getAttribute('href'), /x"onmouseover=/);
    A._obras = [hostil];
    A._seleccion.set(A._norm(hostil.titulo), hostil); A._renderSeleccion();
    const refs = $('antRefsBox').innerHTML;
    assert.match(refs, /<i>Revista x &amp; Co<\/i>/, 'la referencia conserva solo sus cursivas');
    assert.equal($('antRefsBox').querySelectorAll('img').length, 0);
    A._seleccion.clear(); A._obras = []; A._renderSeleccion();
    P.registrar({ fuente: 'Web of Science', ecuacion: 'TS=(<img src=x onerror=window.__xss=1>)', filtros: '<b>2021</b>' });
    assert.ok(P.fichaHTML().includes('TS=(&lt;img src=x onerror=window.__xss=1&gt;)'), 'la ficha del protocolo, escapada');
    assert.ok(!P.fichaHTML().includes('<b>2021</b>'));
});

test('el enriquecimiento corrige la revista provisional aunque la obra ya tenga resumen (solo pregunta a OpenAlex)', async () => {
    const o = W.normalizar(registro(1));
    o.resumen = 'Un resumen que ya llegó de otra base, suficientemente largo para contar como resumen.';
    globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ u) => {
        pedidas.push(String(u));
        if (/api\.openalex\.org\/works\/doi:10\.14349\/rlp\.2023\.v55\.1$/.test(String(u)))
            return new Response(JSON.stringify({ primary_location: { source: { display_name: 'Revista Latinoamericana de Psicología', type: 'journal' } } }), { status: 200 });
        throw new Error('sin red');
    });
    A._obras = [o];
    await A._enriquecerAutomatico([o]);
    assert.equal(o.fuente, 'Revista Latinoamericana de Psicología'); assert.equal(o._revistaProvisional, false);
    assert.equal(pedidas.filter(u => /openalex/.test(u)).length, 1, 'una sola petición, a OpenAlex');
    await A._enriquecerAutomatico([o]);
    assert.equal(pedidas.filter(u => /openalex/.test(u)).length, 1, 'no se repite');
    // si OpenAlex no la tiene, la revista sigue provisional, pero no se vuelve a preguntar en cada búsqueda
    const sin = W.normalizar(registro(4)); sin.resumen = o.resumen; pedidas = [];
    await A._enriquecerAutomatico([sin]); await A._enriquecerAutomatico([sin]);
    assert.equal(sin._revistaProvisional, true); assert.equal(pedidas.filter(u => /openalex/.test(u)).length, 1, 'una sola vez');
    A._obras = [];
});

test('si una búsqueda agota la cuota, el panel de la conexión lo muestra', async () => {
    W.guardarClave(CLAVE);
    globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ u) => { pedidas.push(String(u)); return new Response('{"error":"quota"}', { status: 429 }); });
    const r = await A._buscarUnaConsulta('burnout', {}, { usarWos: true, usarScopus: false, usarSciencedirect: false, usarScholar: false, usarAbiertas: false, usarPubmed: false, usarScielo: false, usarAlicia: false, usarOMS: false, usarONU: false });
    assert.match(r.infos, /Web of Science falló \(tu clave agotó su cuota de hoy/);
    assert.match($('antWosResumen').textContent, /cuota de hoy agotada/); assert.match($('antWosEstado').textContent, /Tu clave agotó su cuota de hoy/);
    globalThis.fetch = /** @type {any} */ (async () => new Response(JSON.stringify({ metadata: { total: 1 }, hits: [registro(1)] }), { status: 200 }));
    await A._onProbarWos();
    assert.doesNotMatch($('antWosResumen').textContent, /agotada/, 'probar con éxito pone al día el título del panel'); assert.match($('antWosEstado').textContent, /Conexión correcta/);
    W.olvidarClave();
});

test('el nombre provisional de la revista: el enriquecimiento pone el de OpenAlex solo si es la misma revista', () => {
    const o = W.normalizar(registro(9));
    assert.equal(o.fuente, 'Revista Latinoamericana de Psicologia'); assert.equal(o._revistaProvisional, true);
    assert.equal(A._aplicarRevista(o, { revista: 'Psychology Today' }), false, 'otra revista: no');
    assert.equal(o.fuente, 'Revista Latinoamericana de Psicologia');
    assert.equal(A._aplicarRevista(o, { revista: 'Revista Latinoamericana de Psicología' }), true);
    assert.equal(o.fuente, 'Revista Latinoamericana de Psicología'); assert.equal(o._revistaProvisional, false);
    assert.equal(A._aplicarRevista({ fuente: 'Journal X', _revistaProvisional: false }, { revista: 'JOURNAL X' }), false, 'las demás fuentes no se tocan');
});

test('el enriquecimiento por DOI trae el nombre de la revista de OpenAlex, solo si su fuente es una revista (no un repositorio)', async () => {
    let tipo = 'journal';
    globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ u) => {
        if (/api\.openalex\.org\/works\/doi:10\.14349\/rlp\.2023\.1$/.test(String(u)))
            return new Response(JSON.stringify({ publication_year: 2023, primary_location: { source: { display_name: tipo === 'journal' ? 'Revista Latinoamericana de Psicología' : 'PubMed Central', type: tipo } } }), { status: 200 });
        throw new Error('sin red');
    });
    assert.equal((await A._recuperarDatos('https://doi.org/10.14349/rlp.2023.1')).revista, 'Revista Latinoamericana de Psicología');
    tipo = 'repository';
    assert.equal((await A._recuperarDatos('10.14349/rlp.2023.1')).revista, '');
});

test('«Abrir en Web of Science»: copia la ecuación (traducida si English está marcado), abre la búsqueda avanzada y la deja a la vista', async () => {
    /** @type {any[]} */ const abiertas = []; /** @type {string[]} */ const copiadas = [];
    globalThis.open = /** @type {any} */ ((/** @type {any[]} */ ...a) => { abiertas.push(a); return null; });
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText: async (/** @type {string} */ t) => { copiadas.push(t); } }, configurable: true });
    globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ u) => {
        if (/mymemory/.test(String(u))) return new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'teacher burnout' } }), { status: 200 });
        throw new Error('sin red');
    });
    $('antQuery').value = 'burnout docente'; $('antDesde').value = '2022';
    env.document.querySelector('#antIdiomas input[value="en"]').checked = true;
    await A._onAbrirWos();
    const fin = new Date().getFullYear() + 1;
    assert.deepEqual(copiadas, [`TS=(teacher AND burnout) AND PY=(2022-${fin})`]);
    assert.deepEqual(abiertas, [['https://www.webofscience.com/wos/woscc/advanced-search', '_blank', 'noopener']]);
    assert.match($('antEstado').innerHTML, /Ecuación copiada/); assert.match($('antEstado').innerHTML, /TS=\(teacher AND burnout\)/);
    delete (/** @type {any} */ (globalThis.navigator)).clipboard;
});

test('la guardia de fuentes: con solo la OMS marcada, la búsqueda se lanza (antes decía «Marca al menos una fuente»)', async () => {
    casillas({ antUsarOMS: true });
    $('antQuery').value = 'salud mental adolescentes';
    env.document.querySelectorAll('#antIdiomas input').forEach((/** @type {any} */ i) => { i.checked = i.value === 'es'; });
    await A._onBuscar();
    assert.doesNotMatch($('antEstado').textContent, /Marca al menos una fuente/);
    assert.ok(pedidas.some(u => /iris|who\.int/i.test(u)), 'consultó la OMS: ' + pedidas.join(' | '));
    casillas({});
    await A._onBuscar();
    assert.match($('antEstado').textContent, /Marca al menos una fuente/, 'sin ninguna, sí');
});
