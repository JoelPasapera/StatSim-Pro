// @ts-check
// tests/integration/relevo-wos.test.js — (2026.12.26) el relevo de Web of Science (workers/relevo-wos.js, un Cloudflare
// Worker) ejecutado en Node con Request/Response reales y la API de Clarivate simulada: CORS, orígenes, la lista blanca de
// parámetros, la rotación de claves y la clave propia del usuario.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import relevo, { clavesDe, origenPermitido, destino, claveDeIP, excedeLimite } from '../../workers/relevo-wos.js';

const SITIO = 'https://joelpasapera.github.io';
const K1 = 'clave-uno-000000000001', K2 = 'clave-dos-000000000002', K3 = 'clave-tres-00000000003';
/** @type {{ url: string, clave: string }[]} */
let llamadas = [];
/** @param {(clave: string, n: number) => Response} responder */
function clarivate(responder) {
    llamadas = [];
    globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ url, /** @type {any} */ op) => {
        llamadas.push({ url: String(url), clave: op.headers['X-ApiKey'] });
        return responder(op.headers['X-ApiKey'], llamadas.length);
    });
}
const ok = () => new Response(JSON.stringify({ metadata: { total: 1, page: 1, limit: 50 }, hits: [{ uid: 'WOS:1' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
/** @param {string} ruta @param {{ origen?: string | null, metodo?: string, cabeceras?: Record<string, string> }} [op] @param {Record<string, string>} [env] */
function pedir(ruta, op = {}, env = { WOS_KEY_1: K1, WOS_KEY_2: K2 }) {
    /** @type {Record<string, string>} */
    const h = { ...(op.cabeceras || {}) };
    if (op.origen !== null) h.Origin = op.origen || SITIO;
    return relevo.fetch(new Request('https://wos.relevo.test' + ruta, { method: op.metodo || 'GET', headers: h }), env);
}
const RUTA = '/documents?db=WOS&q=TS%3D(estres%20AND%20sueno)%20AND%20PY%3D(2021-2027)&limit=50&page=1&sortField=RS%2BD';

test('GET /: el estado del relevo y cuántas claves tiene (sin gastar cuota)', async () => {
    clarivate(ok);
    const r = await pedir('/', {}, { WOS_KEY_1: K1, WOS_KEY_3: K3, WOS_KEY_4: 'corta' });
    assert.equal(r.status, 200); assert.deepEqual(await r.json(), { servicio: 'relevo de Web of Science Starter', claves: 2 });
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), SITIO); assert.equal(llamadas.length, 0);
});

test('las claves: WOS_KEY y WOS_KEY_1…50 (con huecos), sin repetir ni aceptar basura', () => {
    assert.deepEqual(clavesDe({ WOS_KEY: K1, WOS_KEY_1: K1, WOS_KEY_7: ` ${K2} `, WOS_KEY_51: K3, WOS_KEY_2: 'x y' }), [K1, K2]);
    assert.deepEqual(clavesDe({}), []);
});

test('los orígenes: el sitio publicado y localhost por omisión; ORIGENES los sustituye; nada más', () => {
    assert.equal(origenPermitido(SITIO, {}), true); assert.equal(origenPermitido('http://localhost:5173', {}), true); assert.equal(origenPermitido('http://127.0.0.1:8080', {}), true);
    assert.equal(origenPermitido('https://otro.example', {}), false); assert.equal(origenPermitido('https://joelpasapera.github.io.evil.example', {}), false);
    assert.equal(origenPermitido('null', {}), false); assert.equal(origenPermitido('file://', {}), false);
    assert.equal(origenPermitido('https://statsim.mi-dominio.pe', { ORIGENES: 'https://statsim.mi-dominio.pe/, https://otro.pe' }), true);
    assert.equal(origenPermitido(SITIO, { ORIGENES: 'https://statsim.mi-dominio.pe' }), false);
});

test('CORS: la comprobación previa (OPTIONS) admite la cabecera X-ApiKey, también para una página ajena (que en el GET recibe el motivo, no la búsqueda)', async () => {
    const r = await pedir(RUTA, { metodo: 'OPTIONS' });
    assert.equal(r.status, 204); assert.equal(r.headers.get('Access-Control-Allow-Origin'), SITIO);
    assert.match(r.headers.get('Access-Control-Allow-Headers') || '', /X-ApiKey/); assert.match(r.headers.get('Access-Control-Allow-Methods') || '', /GET/);
    const ajena = await pedir(RUTA, { metodo: 'OPTIONS', origen: 'https://otro.example' });
    assert.equal(ajena.status, 204); assert.equal(ajena.headers.get('Access-Control-Allow-Origin'), 'https://otro.example');
    clarivate(ok);
    const get = await pedir(RUTA, { origen: 'https://otro.example', cabeceras: { 'X-ApiKey': 'propia-del-usuario-00000001' } });
    assert.equal(get.status, 403); assert.equal((await get.json()).codigo, 'ORIGEN'); assert.equal(llamadas.length, 0);
});

test('el límite por dirección IP: pasado el de LIMITE_POR_MINUTO, 429 IP_RATE con Retry-After (las demás direcciones, no)', async () => {
    clarivate(ok);
    const env = { WOS_KEY_1: K1, LIMITE_POR_MINUTO: '2' };
    const ip = /** @param {string} d */ d => ({ cabeceras: { 'CF-Connecting-IP': d } });
    assert.equal((await pedir(RUTA, ip('203.0.113.9'), env)).status, 200);
    assert.equal((await pedir(RUTA, ip('203.0.113.9'), env)).status, 200);
    const tercera = await pedir(RUTA, ip('203.0.113.9'), env);
    assert.equal(tercera.status, 429); assert.equal((await tercera.json()).codigo, 'IP_RATE');
    assert.ok(+(tercera.headers.get('Retry-After') || 0) >= 1); assert.equal(tercera.headers.get('Access-Control-Allow-Origin'), SITIO);
    assert.equal((await pedir(RUTA, ip('198.51.100.7'), env)).status, 200, 'otra dirección');
    assert.equal(llamadas.length, 3, 'la petición limitada no llega a Clarivate');
    // las IPv6 cuentan por su red /64: cambiar de dirección dentro de ella no esquiva el límite
    assert.equal((await pedir(RUTA, ip('2001:db8:aa:bb::1'), env)).status, 200);
    assert.equal((await pedir(RUTA, ip('2001:db8:aa:bb:0:0:0:2'), env)).status, 200);
    assert.equal((await pedir(RUTA, ip('2001:0db8:00aa:00bb:ffff::3'), env)).status, 429, 'la misma /64');
    assert.equal((await pedir(RUTA, ip('2001:db8:aa:cc::1'), env)).status, 200, 'otra /64');
    assert.equal(claveDeIP('::ffff:198.51.100.7'), '198.51.100.7'); assert.equal(claveDeIP('2001:db8::1'), '2001:db8:0:0::/64'); assert.equal(claveDeIP(''), 'sin-ip');
});

test('agotado el tiempo total, no se prueba otra clave (no se gasta otra petición en Clarivate)', async () => {
    clarivate(() => ok());
    globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ url, /** @type {any} */ op) => {
        llamadas.push({ url: String(url), clave: op.headers['X-ApiKey'] });
        await new Promise(r => setTimeout(r, 80));
        return new Response('{"error":"quota"}', { status: 429 });
    });
    const r = await pedir(RUTA, {}, { WOS_KEY_1: K1, WOS_KEY_2: K2, TIEMPO_TOTAL_MS: '50' });
    assert.equal(r.status, 504); assert.match((await r.json()).error, /a tiempo/);
    assert.equal(llamadas.length, 1, 'la segunda clave no llega a usarse');
});

test('el registro del límite tiene tope, pero un aluvión de direcciones nuevas no le devuelve el cupo a una que ya lo agotó', () => {
    const t0 = 1e13;   // muy en el futuro: lo que dejaron las demás pruebas ya venció
    assert.equal(excedeLimite('192.0.2.77', 2, t0), 0); assert.equal(excedeLimite('192.0.2.77', 2, t0), 0);
    assert.ok(excedeLimite('192.0.2.77', 2, t0 + 1) > 0, 'limitada');
    for (let i = 0; i < 12000; i++) excedeLimite(`10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`, 2, t0 + 2);
    assert.ok(excedeLimite('192.0.2.77', 2, t0 + 3) > 0, 'sigue limitada tras el aluvión');
    assert.equal(excedeLimite('192.0.2.77', 2, t0 + 61000), 0, 'pasado el minuto, libre');
});

test('el relevo corta antes que la página: con Clarivate colgado, 504 dentro del tiempo total', async () => {
    globalThis.fetch = /** @type {any} */ ((/** @type {string} */ u, /** @type {any} */ op) => new Promise((_, rechazar) => op.signal.addEventListener('abort', () => rechazar(new Error('aborted')))));
    const t0 = Date.now();
    const r = await pedir(RUTA, {}, { WOS_KEY_1: K1, WOS_KEY_2: K2, TIEMPO_TOTAL_MS: '60' });
    assert.equal(r.status, 504); assert.ok(Date.now() - t0 < 2000, 'el tiempo total vale para todas las claves');
});

test('una búsqueda desde el sitio: reenvía a Clarivate solo los parámetros permitidos, con la clave en la cabecera, y devuelve la respuesta con CORS', async () => {
    clarivate(ok);
    const r = await pedir(RUTA + '&apiKey=robada&callback=x');
    assert.equal(r.status, 200); assert.equal(r.headers.get('Access-Control-Allow-Origin'), SITIO);
    assert.equal((await r.json()).hits[0].uid, 'WOS:1');
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].url, 'https://api.clarivate.com/apis/wos-starter/v1/documents?db=WOS&q=TS%3D(estres%20AND%20sueno)%20AND%20PY%3D(2021-2027)&limit=50&page=1&sortField=RS%2BD');
    assert.ok([K1, K2].includes(llamadas[0].clave));
});

test('desde una página no autorizada, o sin origen: 403 con el motivo y sin llamar a Clarivate', async () => {
    clarivate(ok);
    const r = await pedir(RUTA, { origen: 'https://otro.example' });
    assert.equal(r.status, 403); assert.deepEqual(await r.json(), { error: 'origen no autorizado', codigo: 'ORIGEN' });
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://otro.example', 'la página puede leer el motivo');
    assert.equal((await pedir(RUTA, { origen: null })).status, 403);
    assert.equal(llamadas.length, 0);
});

test('parámetros fuera de la lista o de sus límites: 400 sin llamar a Clarivate', async () => {
    clarivate(ok);
    for (const ruta of ['/documents?db=WOS', '/documents?q=TS%3D(a)&limit=51', '/documents?q=TS%3D(a)&limit=0', '/documents?q=TS%3D(a)&page=x', '/documents?q=' + 'a'.repeat(3001)]) {
        const r = await pedir(ruta);
        assert.equal(r.status, 400, ruta); assert.equal((await r.json()).codigo, 'PARAMETROS');
    }
    assert.equal((await pedir('/journals?issn=1')).status, 404); assert.equal((await pedir(RUTA, { metodo: 'POST' })).status, 405);
    assert.equal(llamadas.length, 0);
    assert.deepEqual(destino(new URL('https://x/documents?q=PY%3D2020&detail=short&edition=WOS%2BSSCI')), { url: 'https://api.clarivate.com/apis/wos-starter/v1/documents?q=PY%3D2020&detail=short&edition=WOS%2BSSCI' });
});

test('rotación: una clave con la cuota agotada (429) o rechazada (401) cede a la siguiente; un 400 o un 500 se devuelven tal cual', async () => {
    clarivate(clave => (clave === K1 ? new Response('{"error":"quota"}', { status: 429, headers: { 'Retry-After': '30' } }) : ok()));
    for (let i = 0; i < 4; i++) { const r = await pedir(RUTA); assert.equal(r.status, 200); }
    assert.ok(llamadas.filter(l => l.clave === K2).length === 4, 'todas las búsquedas acaban con la clave buena');
    clarivate(clave => (clave === K2 ? new Response('{"error":"invalid_client"}', { status: 401 }) : ok()));
    for (let i = 0; i < 3; i++) assert.equal((await pedir(RUTA)).status, 200, 'una clave rechazada cede a la siguiente');
    assert.ok(llamadas.length >= 4 && llamadas.at(-1)?.clave === K1);
    clarivate(() => new Response('{"error":"quota"}', { status: 429, headers: { 'Retry-After': '30' } }));
    const agotadas = await pedir(RUTA);
    assert.equal(agotadas.status, 429, 'todas agotadas: el 429 llega al cliente'); assert.equal(agotadas.headers.get('Retry-After'), '30');
    assert.match(agotadas.headers.get('Access-Control-Expose-Headers') || '', /Retry-After/); assert.equal(llamadas.length, 2);
    clarivate(() => new Response('{"error":{"status":400,"details":"syntax"}}', { status: 400 }));
    assert.equal((await pedir(RUTA)).status, 400); assert.equal(llamadas.length, 1, 'un 400 no se arregla con otra clave');
    clarivate(() => new Response('caído', { status: 502 }));
    assert.equal((await pedir(RUTA)).status, 502); assert.equal(llamadas.length, 1);
});

test('la clave propia del usuario (X-ApiKey): se usa sola, sin gastar las del relevo; una mal formada se rechaza', async () => {
    const propia = 'propia-del-usuario-00000001';
    clarivate(() => new Response('{"error":"quota"}', { status: 429 }));
    const r = await pedir(RUTA, { cabeceras: { 'X-ApiKey': propia } });
    assert.equal(r.status, 429); assert.deepEqual(llamadas.map(l => l.clave), [propia]);
    clarivate(ok);
    const mala = await pedir(RUTA, { cabeceras: { 'X-ApiKey': 'corta' } });
    assert.equal(mala.status, 400); assert.equal((await mala.json()).codigo, 'CLAVE'); assert.equal(llamadas.length, 0);
});

test('sin claves: 503 SIN_CLAVES; Clarivate sin respuesta: 504', async () => {
    clarivate(ok);
    const r = await pedir(RUTA, {}, {});
    assert.equal(r.status, 503); assert.equal((await r.json()).codigo, 'SIN_CLAVES');
    globalThis.fetch = /** @type {any} */ (async () => { throw new TypeError('fetch failed'); });
    const caida = await pedir(RUTA);
    assert.equal(caida.status, 504); assert.equal((await caida.json()).codigo, 'RED');
});
