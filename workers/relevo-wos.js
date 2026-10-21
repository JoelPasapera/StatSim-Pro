// @ts-check
// workers/relevo-wos.js — relevo (Cloudflare Worker) entre StatSim Pro y la Web of Science Starter API de Clarivate.
// (2026.12.26) No es parte de la página: se despliega aparte, en Cloudflare (los pasos, en docs/WEB-OF-SCIENCE.md).
// Qué resuelve:
//   · El CORS: si Clarivate no deja leer sus respuestas desde el navegador, el relevo las reenvía con las cabeceras que
//     el navegador exige.
//   · Las claves: viven en los secretos del Worker (WOS_KEY_1, WOS_KEY_2, …; o una sola, WOS_KEY), nunca en la página
//     ni en el repositorio. Rota entre ellas: si una agota su cuota (429) o deja de valer (401/403), prueba la
//     siguiente. Si la petición trae su propia clave (cabecera X-ApiKey: la que el usuario guardó en su navegador),
//     usa esa y no gasta las del relevo.
//   · No es un proxy de uso general: solo reenvía a Clarivate GET /documents, con los parámetros de búsqueda en lista
//     blanca y con límites; un navegador solo lo usa desde las páginas autorizadas (la variable ORIGENES, separadas por
//     comas; por omisión, el sitio publicado; las pruebas en localhost siempre). Un programa que no es un navegador
//     puede falsear el origen: el límite de peticiones por minuto de cada dirección IP (LIMITE_POR_MINUTO, 120 por
//     omisión; las IPv6, por su red /64; contado en cada instancia del Worker, así que frena el abuso pero no lo impide)
//     es la otra barrera. Por eso, y por los términos de Clarivate, piensa qué claves pones en un relevo público
//     (docs/WEB-OF-SCIENCE.md).
//   · GET / responde { servicio, claves: N }, como los Workers de IA: para comprobar el despliegue sin gastar cuota.

const API = 'https://api.clarivate.com/apis/wos-starter/v1/documents';
const PARAMETROS = ['db', 'q', 'limit', 'page', 'sortField', 'publishTimeSpan', 'detail', 'edition'];
const ORIGENES_POR_OMISION = ['https://joelpasapera.github.io'];
const CLAVE_VALIDA = /^[\x21-\x7E]{16,200}$/;
// Todo el reenvío (con todas las claves que haga falta probar) termina antes que la espera de la página (20 s): si no,
// la página reintentaría mientras el relevo sigue con la primera petición y la cuota se gastaría dos veces.
const TIEMPO_TOTAL_MS = 15000;

/** @typedef {Record<string, string | undefined>} Entorno */

let turno = 0;   // rotación entre las claves (dentro de cada instancia del Worker)
/** @type {Map<string, { inicio: number, n: number }>} */
const porIP = new Map();   // peticiones por dirección (o red /64) en el último minuto, dentro de cada instancia
const MAX_DIRECCIONES = 10000;
let ultimoBarrido = 0;

/**
 * La dirección con la que se cuenta el límite: la IPv4 tal cual; la IPv6, su red /64 (los cuatro primeros grupos, con
 * los «::» expandidos), porque quien tiene una dirección IPv6 suele tener la red entera. Las IPv4 dentro de IPv6
 * (::ffff:203.0.113.9) cuentan como IPv4.
 * @param {string} ip
 */
export function claveDeIP(ip) {
    const s = String(ip || '').trim().toLowerCase();
    if (!s.includes(':')) return s || 'sin-ip';
    const v4 = s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (v4) return v4[1];
    const [izq, der] = s.split('::');
    const a = izq ? izq.split(':') : [], b = der !== undefined && der ? der.split(':') : [];
    const grupos = der !== undefined ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b] : a;
    return grupos.slice(0, 4).map(g => (g || '0').replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

/**
 * ¿Supera esta dirección su límite de peticiones por minuto? Devuelve los segundos que faltan para que se libere, o 0.
 * El registro se barre como mucho cada diez segundos y tiene un tope de direcciones: lleno, se desalojan primero las de
 * ventana vencida y luego las más antiguas que NO están limitadas (un aluvión de direcciones nuevas no le devuelve el
 * cupo a una que ya lo agotó).
 * @param {string} ip
 * @param {number} limite
 * @param {number} ahora
 */
export function excedeLimite(ip, limite, ahora = Date.now()) {
    const lleno = porIP.size >= MAX_DIRECCIONES;
    if (lleno || (porIP.size > 1000 && ahora - ultimoBarrido > 10000)) {
        ultimoBarrido = ahora;
        for (const [k, v] of porIP) if (ahora - v.inicio >= 60000) porIP.delete(k);
    }
    if (porIP.size >= MAX_DIRECCIONES) {
        for (const [k, v] of porIP) { if (porIP.size < MAX_DIRECCIONES * 0.9) break; if (v.n <= limite) porIP.delete(k); }
        if (porIP.size >= MAX_DIRECCIONES) porIP.clear();   // todas limitadas a la vez: no queda más remedio
    }
    const clave = claveDeIP(ip), r = porIP.get(clave);
    if (!r || ahora - r.inicio >= 60000) { porIP.set(clave, { inicio: ahora, n: 1 }); return 0; }
    r.n++;
    return r.n > limite ? Math.max(1, Math.ceil((r.inicio + 60000 - ahora) / 1000)) : 0;
}

/**
 * Las claves de los secretos: WOS_KEY y WOS_KEY_1 … WOS_KEY_50 (pueden faltar números), sin repetir.
 * @param {Entorno} env
 * @returns {string[]}
 */
export function clavesDe(env) {
    const claves = [env.WOS_KEY];
    for (let i = 1; i <= 50; i++) claves.push(env['WOS_KEY_' + i]);
    return [...new Set(claves.map(k => String(k || '').trim()).filter(k => CLAVE_VALIDA.test(k)))];
}

/**
 * ¿Puede esta página usar el relevo? Las de ORIGENES (o, sin esa variable, el sitio publicado) y las de localhost.
 * @param {string} origen
 * @param {Entorno} env
 */
export function origenPermitido(origen, env) {
    let u;
    try { u = new URL(origen); } catch (e) { return false; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    const lista = env.ORIGENES ? env.ORIGENES.split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean) : ORIGENES_POR_OMISION;
    return lista.includes(u.origin);
}

/** @param {string} origen @returns {Record<string, string>} */
function cabecerasCors(origen) {
    return {
        'Access-Control-Allow-Origin': origen,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'X-ApiKey, Accept',
        'Access-Control-Expose-Headers': 'Retry-After',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    };
}

/**
 * @param {number} status
 * @param {object} cuerpo
 * @param {Record<string, string>} cabeceras
 */
function json(status, cuerpo, cabeceras) {
    return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cabeceras } });
}

/**
 * La URL de Clarivate con los parámetros permitidos (vueltos a codificar con encodeURIComponent), o el motivo del rechazo.
 * @param {URL} url
 * @returns {{ url: string, error?: undefined } | { error: string, url?: undefined }}
 */
export function destino(url) {
    const q = url.searchParams.get('q') || '';
    if (!q.trim()) return { error: 'falta la ecuación (q)' };
    if (q.length > 3000) return { error: 'la ecuación es demasiado larga' };
    for (const [p, max] of /** @type {[string, number][]} */ ([['limit', 50], ['page', 2000]])) {
        const v = url.searchParams.get(p);
        if (v !== null && !(/^\d+$/.test(v) && +v >= 1 && +v <= max)) return { error: `${p} debe ser un entero entre 1 y ${max}` };
    }
    const partes = [];
    for (const p of PARAMETROS) {
        const v = url.searchParams.get(p);
        if (v !== null && v !== '') partes.push(`${p}=${encodeURIComponent(v.slice(0, 3000))}`);
    }
    return { url: `${API}?${partes.join('&')}` };
}

/**
 * Reenvía la respuesta de Clarivate (estado, cuerpo, tipo y Retry-After) con las cabeceras CORS.
 * @param {Response} r
 * @param {Record<string, string>} cors
 */
function pasar(r, cors) {
    /** @type {Record<string, string>} */
    const h = { 'Content-Type': r.headers.get('Content-Type') || 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors };
    const ra = r.headers.get('Retry-After');
    if (ra) h['Retry-After'] = ra;
    return new Response(r.body, { status: r.status, headers: h });
}

export default {
    /**
     * @param {Request} request
     * @param {Entorno} env
     * @returns {Promise<Response>}
     */
    async fetch(request, env) {
        const url = new URL(request.url);
        const origen = request.headers.get('Origin') || '';
        const permitido = !!origen && origenPermitido(origen, env);
        const cors = permitido ? cabecerasCors(origen) : {};
        // La comprobación previa se contesta a cualquier página: así una no autorizada recibe en el GET el motivo (403
        // ORIGEN) en vez de un fallo de red; la búsqueda, en cambio, solo la hacen las autorizadas.
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: origen ? cabecerasCors(origen) : {} });
        if (request.method !== 'GET') return json(405, { error: 'solo GET', codigo: 'METODO' }, cors);
        if (url.pathname === '/') return json(200, { servicio: 'relevo de Web of Science Starter', claves: clavesDe(env).length }, cors);
        if (url.pathname !== '/documents') return json(404, { error: 'ruta desconocida (solo /documents)', codigo: 'RUTA' }, cors);
        // Una página no autorizada recibe el motivo con CORS (para que pueda mostrarlo), pero nunca la búsqueda.
        if (!permitido) return json(403, { error: 'origen no autorizado', codigo: 'ORIGEN' }, origen ? cabecerasCors(origen) : {});
        const limite = parseInt(env.LIMITE_POR_MINUTO || '', 10) > 0 ? parseInt(env.LIMITE_POR_MINUTO || '', 10) : 120;
        const espera = excedeLimite(request.headers.get('CF-Connecting-IP') || '', limite);
        if (espera) return json(429, { error: 'demasiadas peticiones desde esta red en poco tiempo', codigo: 'IP_RATE' }, { ...cors, 'Retry-After': String(espera) });
        const d = destino(url);
        if (d.error !== undefined) return json(400, { error: d.error, codigo: 'PARAMETROS' }, cors);
        const propia = (request.headers.get('X-ApiKey') || '').trim();
        if (propia && !CLAVE_VALIDA.test(propia)) return json(400, { error: 'la clave enviada no es válida', codigo: 'CLAVE' }, cors);
        const todas = clavesDe(env);
        const inicio = todas.length ? turno++ % todas.length : 0;
        const lista = propia ? [propia] : [...todas.slice(inicio), ...todas.slice(0, inicio)];
        if (!lista.length) return json(503, { error: 'el relevo no tiene claves', codigo: 'SIN_CLAVES' }, cors);
        const total = parseInt(env.TIEMPO_TOTAL_MS || '', 10) > 0 ? Math.min(TIEMPO_TOTAL_MS, parseInt(env.TIEMPO_TOTAL_MS || '', 10)) : TIEMPO_TOTAL_MS;
        const fin = Date.now() + total;   // (TIEMPO_TOTAL_MS en el entorno solo puede acortarlo: lo usan las pruebas)
        for (let i = 0; i < lista.length; i++) {
            const restante = fin - Date.now();
            if (restante <= 0) return json(504, { error: 'Clarivate no respondió a tiempo', codigo: 'RED' }, cors);
            const ctrl = new AbortController(), tid = setTimeout(() => ctrl.abort(), restante);
            let r;
            try { r = await fetch(d.url, { headers: { 'X-ApiKey': lista[i], Accept: 'application/json' }, signal: ctrl.signal }); }
            catch (e) { return json(504, { error: 'Clarivate no respondió', codigo: 'RED' }, cors); }
            finally { clearTimeout(tid); }
            // Cuota agotada o clave rechazada: la siguiente clave (si queda alguna).
            if ((r.status === 429 || r.status === 401 || r.status === 403) && i < lista.length - 1) {
                try { if (r.body) await r.body.cancel(); } catch (e) { /* nada que liberar */ }
                continue;
            }
            return pasar(r, cors);
        }
        return json(502, { error: 'sin respuesta', codigo: 'RED' }, cors);   // inalcanzable: la última clave siempre devuelve
    }
};
