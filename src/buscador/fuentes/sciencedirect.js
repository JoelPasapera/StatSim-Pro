// @ts-check
// buscador/fuentes/sciencedirect.js — fuente ScienceDirect (Elsevier), por la ScienceDirect Search API v2.
// (2026.12.27) Lo que conviene saber de esta API (dev.elsevier.com: documentation/ScienceDirectSearchAPI.wadl,
// tecdoc_sdsearch_migration.html, sd_search_views.html, tips/ScienceDirectSearchTips.htm y api_key_settings.html):
//   · Busca en el TEXTO COMPLETO de las revistas y los libros de Elsevier («all content excluding references»), no solo en
//     el título y el resumen como Scopus: encuentra más y con menos precisión. La v2 no deja limitar la búsqueda al título,
//     el resumen y las palabras clave. Los resultados llegan por relevancia, el orden predeterminado de la API.
//   · Usa las claves de Elsevier del proyecto (fuentes/claves-elsevier.js): no hay nada que configurar. La cuota es propia
//     de esta API (20 000 peticiones por semana y 2 por segundo por clave), aparte de la de Scopus. Con la cuota de la
//     semana agotada, Elsevier responde 429 con «X-ELS-Status: QUOTA_EXCEEDED» y X-RateLimit-Reset, sin X-RateLimit-Limit ni
//     -Remaining (api_key_settings); por exceso de ritmo, un 429 sin más. Si el navegador no deja ver esas cabeceras (o por
//     los proxies), un 429 es un frenazo y la clave descansa un rato (RotacionClaves.frenar), sin darla por agotada.
//   · Se llama con GET, la interfaz heredada de la v1 (query, date, start, count), que Elsevier no recomienda (la nativa es
//     la PUT, más robusta): es la que admiten los proxies del arsenal (solo GET) y la que el navegador manda sin comprobación
//     previa CORS (la PUT, con su cuerpo JSON, la exige). Directo a Elsevier primero; si el navegador lo bloquea, por el
//     arsenal de proxies (shared/proxies.js), como Scopus. Las claves ya están en el código del sitio: pasar por un proxy no
//     expone nada.
//   · Hasta 100 registros por petición y 6000 en total (start ≤ 6000 − count). Si la API entrega por página menos de los
//     que se piden, se pagina con los que entrega de verdad; si rechaza las páginas de 100, se piden de 25.
//   · No trae resumen, ni citas, ni ISSN: el enriquecimiento automático por DOI pone el resumen (para los DOI de Elsevier,
//     el de la Abstract Retrieval API) y el ISSN de OpenAlex (con él, el cuartil); las citas se quedan en 0, como en PubMed.
//   · (2026.12.28) Con la API real, la misma clave del sitio que responde en Scopus Search recibe aquí 401/403
//     AUTHORIZATION_ERROR («The requestor is not authorized to access the requested view or fields of the resource»):
//     Elsevier no les tiene habilitada esta API. Su portal (tecdoc_api_authentication, support): «New keys have no product
//     data access by default» y el acceso a cada API se habilita «only after the relevant entitlement has been confirmed».
//     Hasta que Elsevier la habilite, la casilla viene desmarcada y el aviso dice el motivo que dio Elsevier (_rechazo).
//   · La consulta: los términos separados por espacios, que ScienceDirect une con un AND implícito (ScienceDirectSearchTips:
//     «Words submitted without connectors will automatically be logically connected by an implicit AND connector»; con
//     conectores explícitos, la búsqueda de la web admite pocos). Como mucho 250 caracteres: si los términos no caben
//     todos, se buscan los que caben y se dice.

import { textoPlano } from '../../shared/html.js';
import { ProxiesCORS } from '../../shared/proxies.js';
import { CLAVES_ELSEVIER, RotacionClaves } from './claves-elsevier.js';
import { doiLimpio } from './doi.js';
import { conPalabrasVacias, terminosClave } from './terminos.js';

/**
 * @typedef {Record<string, any>} EntradaSD  un registro de la API (su forma cambia entre la interfaz GET y la v2)
 * @typedef {{ entradas: EntradaSD[], total: number }} PaginaSD
 * @typedef {{ pagina: PaginaSD, via: 'directo' | 'proxy' }} TraidaSD
 * @typedef {{ status: number, texto: string, restantes: string, reinicio: string, estado: string }} RespuestaSD  estado: X-ELS-Status
 * @typedef {{ titulo: string, autores: string[], anio: string, doi: string, link: string, fuente: string, volumen: string,
 *   numero: string, paginas: string, citas: number, idioma: string, resumen: string, keywords: string, issn: string,
 *   fuentesAPI: string[] }} ObraSD
 * @typedef {{ desde?: string | number, maxResultados?: number, idioma?: string }} FiltrosSD
 * @typedef {Error & { sciencedirect: true, sinTerminos?: boolean, consulta?: boolean, auth?: boolean, limitado?: boolean,
 *   cuota?: boolean, pausaMs?: number, reintentable?: boolean, rescatable?: boolean, red?: boolean, tiempo?: boolean,
 *   detalle?: string }} ErrorSD  detalle: lo que dijo Elsevier al rechazar la clave (el código HTTP y su error)
 */

/**
 * @param {string} mensaje
 * @param {Partial<ErrorSD>} [marcas]
 * @returns {ErrorSD}
 */
function errorSD(mensaje, marcas = {}) {
    return /** @type {ErrorSD} */ (Object.assign(new Error(mensaje), marcas, { sciencedirect: true }));
}

/** @param {number} ms */
const dormir = ms => new Promise(resolver => setTimeout(resolver, ms));

/**
 * El valor de un campo como texto. La interfaz GET envuelve algunos campos en un objeto ({"$": "…"}) o en una lista de
 * ellos ([{"@_fa": "true", "$": "…"}]); la v2 los da tal cual.
 * @param {unknown} v
 * @param {number} [hondo]
 * @returns {string}
 */
function valor(v, hondo = 0) {
    if (v == null || hondo > 3) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return v.length ? valor(v[0], hondo + 1) : '';
    if (typeof v === 'object') { const o = /** @type {Record<string, unknown>} */ (v); return valor(o.$ ?? o['#text'], hondo + 1); }
    return '';
}

/** Un texto de la API, limpio (sin etiquetas ni entidades: shared/html.js) y con los espacios normalizados. @param {unknown} v */
const limpio = v => textoPlano(valor(v)).replace(/\s+/g, ' ').trim();

/**
 * Los autores, en su orden y sin repetir (como hace pybliometrics). La interfaz GET los da en authors.author (una lista de
 * {"$": nombre}, un solo nombre o un objeto); la v2, en authors (una lista de {name, order}). Sin lista, el primer autor
 * (dc:creator).
 * @param {EntradaSD} e
 * @returns {string[]}
 */
function autoresDe(e) {
    const a = e.authors;
    const crudo = a && typeof a === 'object' && !Array.isArray(a) && 'author' in a ? a.author : a;
    /** @type {any[]} */
    const lista = Array.isArray(crudo) ? crudo.slice() : (crudo == null || crudo === '' ? [] : [crudo]);
    if (lista.length > 1 && lista.every(x => x && typeof x === 'object' && Number.isFinite(Number(x.order))))
        lista.sort((x, y) => Number(x.order) - Number(y.order));
    /** @param {any} x */
    const nombre = x => {
        if (!x || typeof x !== 'object' || Array.isArray(x)) return limpio(x);
        if (x.name != null) return limpio(x.name);
        if (x.$ != null) return limpio(x.$);
        return [limpio(x['given-name']), limpio(x.surname)].filter(Boolean).join(' ');
    };
    const nombres = lista.map(nombre).filter(Boolean);
    if (!nombres.length) { const primero = limpio(e['dc:creator']); if (primero) nombres.push(primero); }
    return [...new Set(nombres)];
}

/**
 * Las páginas: «inicio-fin», o solo el inicio. La interfaz GET las da en prism:startingPage y prism:endingPage; la v2, en
 * pages {first, last}. Sin página final, un inicio de cinco cifras o más («104181») o con «e» delante («e12345») es el
 * número de artículo con que Elsevier identifica los artículos de muchas revistas: la referencia APA lo pide como
 * «Artículo 104181» (como hace Web of Science, que sí lo distingue).
 * @param {EntradaSD} e
 */
function paginasDe(e) {
    let inicio = valor(e['prism:startingPage']).trim(), fin = valor(e['prism:endingPage']).trim();
    const p = e.pages;
    if (!inicio && typeof p === 'string') return p.trim();
    if (!inicio && p && typeof p === 'object') { inicio = valor(p.first).trim(); fin = valor(p.last).trim(); }
    if (!inicio) return '';
    if (fin && fin !== inicio) return `${inicio}-${fin}`;
    return /^(?:\d{5,}|e\d+)$/i.test(inicio) ? `Artículo ${inicio}` : inicio;
}

/** El PII (el identificador de ScienceDirect), sin signos, o '' si no lo parece. @param {EntradaSD} e */
function piiDe(e) {
    const p = valor(e.pii).replace(/[-().\s]/g, '');
    return /^[A-Za-z0-9]{10,30}$/.test(p) ? p : '';
}

/** Una dirección de ScienceDirect válida para un enlace, o ''. @param {string} u */
const enlaceSD = u => (/^https:\/\/www\.sciencedirect\.com\/[^\s"'<>`]*$/.test(u) ? u : '');

/**
 * Cuándo vuelve a haber una clave libre, dicho para el usuario («en un minuto», «dentro de 10 min», «dentro de 5 h»,
 * «dentro de 3 días»), o '' si no se sabe (las pausas para el resto de la sesión).
 * @param {number} ms
 */
function dentroDe(ms) {
    if (!Number.isFinite(ms)) return '';
    if (ms < 60000) return 'en un minuto';
    if (ms <= 120 * 60000) return `dentro de ${Math.ceil(ms / 60000)} min`;
    if (ms <= 48 * 3600000) return `dentro de ${Math.ceil(ms / 3600000)} h`;
    return `dentro de ${Math.ceil(ms / 86400000)} días`;
}

/**
 * Lo que dice el cuerpo de un error de Elsevier: {"service-error": {"status": {"statusCode", "statusText"}}},
 * {"error-response": {"error-code", "error-message"}}, {"message"}, o el texto (también el XML de sus errores).
 * @param {string} texto
 * @returns {string}
 */
function detalleError(texto) {
    /** @type {any} */
    let d = null;
    try { d = JSON.parse(texto); } catch (e) { /* no es JSON */ }
    if (!d || typeof d !== 'object') return String(texto || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    const se = d['service-error'] && d['service-error'].status, er = d['error-response'];
    const partes = se ? [valor(se.statusCode), valor(se.statusText)] : er ? [valor(er['error-code']), valor(er['error-message'])] : [valor(d.message), valor(d.error)];
    return partes.filter(Boolean).join(' — ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * El error que significa un detalle de Elsevier dentro de una respuesta correcta (HTTP 200), según lo que dice.
 * @param {string} detalle
 * @param {number} pausaLimite
 * @returns {ErrorSD}
 */
function errorPorDetalle(detalle, pausaLimite) {
    if (/QUOTA_EXCEEDED/i.test(detalle)) return errorSD(`la clave agotó su cuota de ScienceDirect (${detalle})`, { limitado: true, cuota: true, pausaMs: Infinity });
    if (/quota|too.?many|rate.?limit|throttl/i.test(detalle)) return errorSD(`Elsevier frenó las peticiones (${detalle})`, { limitado: true, pausaMs: pausaLimite });
    if (/auth|api.?key|entitle|forbidden|not.?authori/i.test(detalle)) return errorSD(`Elsevier rechazó la clave (${detalle})`, { auth: true, detalle });
    if (/invalid|syntax|query|parse|bad.?request/i.test(detalle)) return errorSD(`ScienceDirect rechazó la consulta (${detalle})`, { consulta: true });
    return errorSD(`ScienceDirect respondió con un error (${detalle || 'sin detalle'})`, { reintentable: true });
}

const ScienceDirectDirecto = {

    API: 'https://api.elsevier.com/content/search/sciencedirect',
    URL_WEB: 'https://www.sciencedirect.com/search',
    TAMANOS: [10, 25, 50, 100],        // los «count» que admite la API
    POR_OMISION: 50,                   // = 1 petición (y la mitad de trabajo para el enriquecimiento que 100)
    MAX_RESULTADOS: 6000,              // el techo de la API: start + count ≤ 6000
    LARGO_MAX: 250,                    // caracteres de la consulta
    INTERVALO_MS: 550,                 // ritmo por clave: la API admite 2 peticiones por segundo por clave
    VENTANA: 4,                        // páginas a la vez tras la primera (cada una con su clave)
    TIMEOUT_DIRECTO_MS: 9000,          // como Scopus (qué se hace con un tiempo agotado lo decide _pedir)
    TIMEOUT_PROXY_MS: 20000,
    ESPERA_REINTENTO_MS: 1200,         // antes del único reintento de una página (un 5xx, un tiempo agotado con el directo ya probado, una respuesta rara)
    PAUSA_LIMITE_MS: 30000,            // una clave frenada (429) sin más datos descansa este rato
    PAUSA_CUOTA_MAX_MS: 7 * 24 * 3600 * 1000,

    // AND, OR y NOT en mayúsculas son operadores de ScienceDirect; en minúsculas serían palabras sueltas sin valor.
    _VACIAS: conPalabrasVacias(['not']),

    _rotacion: new RotacionClaves(CLAVES_ELSEVIER),
    /** @type {Map<string, number>} */
    _turnos: new Map(),                // clave → cuándo puede salir su siguiente petición
    /** @type {boolean | null} */
    _directoOK: null,                  // ¿deja el navegador llamar directo a Elsevier? null = sin probar
    _cabecerasLegibles: false,         // ¿se pudo leer X-RateLimit-Remaining en una respuesta correcta? (entonces su falta significa algo)
    _tamanoMax: 100,                   // baja a 25 si la API rechaza las páginas de 100 (se recuerda en la sesión)
    _rechazo: '',                      // lo que dijo Elsevier la última vez que rechazó una clave (para el aviso: no autorizada, o inválida)

    // ---------------- consulta ----------------

    /** Los términos de la consulta (fuentes/terminos.js). @param {unknown} consulta */
    terminos(consulta) {
        return terminosClave(consulta, this._VACIAS);
    },

    /**
     * La consulta que se envía: los términos separados por espacios (ScienceDirect los une con un AND implícito) que caben
     * en los 250 caracteres de la API (en orden; el que no cabe se salta), y cuántos se quedaron fuera.
     * @param {unknown} consulta
     */
    _armar(consulta) {
        const terminos = this.terminos(consulta);
        let ecuacion = '', usados = 0;
        for (const t of terminos) {
            const con = ecuacion ? `${ecuacion} ${t}` : t;
            if (con.length > this.LARGO_MAX) continue;
            ecuacion = con; usados++;
        }
        return { ecuacion, omitidos: terminos.length - usados };
    },

    /** La consulta que se envía (y la que se pega en ScienceDirect), o '' si no queda ningún término. @param {unknown} consulta */
    ecuacion(consulta) {
        return this._armar(consulta).ecuacion;
    },

    /** El último año del filtro: el siguiente al actual (los artículos en prensa ya llevan el año próximo). */
    _anioFinal() { return new Date().getFullYear() + 1; },

    /**
     * El rango de años del filtro («2021-2027»), o '' si no hay año de inicio válido.
     * @param {FiltrosSD} [filtros]
     */
    rangoAnios(filtros = {}) {
        const fin = this._anioFinal(), desde = parseInt(String(filtros.desde ?? ''), 10);
        return Number.isFinite(desde) && desde >= 1000 ? `${Math.min(desde, fin)}-${fin}` : '';
    },

    /**
     * La URL de la API para una consulta, sin start, count ni clave (van al final, aparte).
     * @param {string} ecuacion
     * @param {string} rango
     */
    _urlBase(ecuacion, rango) {
        const parametros = [['query', ecuacion]];
        if (rango) parametros.push(['date', rango]);
        parametros.push(['httpAccept', 'application/json']);
        return `${this.API}?` + parametros.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    },

    /**
     * La URL de la primera página de una consulta, sin la clave (como construirURL de Scopus).
     * @param {unknown} consulta
     * @param {FiltrosSD} [filtros]
     */
    construirURL(consulta, filtros = {}) {
        return `${this._urlBase(this.ecuacion(consulta), this.rangoAnios(filtros))}&start=0&count=${this._tamano(this.POR_OMISION)}`;
    },

    /**
     * La misma búsqueda en la web de ScienceDirect, para abrirla en el navegador (con el acceso de la institución).
     * @param {unknown} consulta
     * @param {FiltrosSD} [filtros]
     */
    urlPublica(consulta, filtros = {}) {
        const parametros = [['qs', this.ecuacion(consulta) || String(consulta ?? '').trim()]];
        const rango = this.rangoAnios(filtros);
        if (rango) parametros.push(['date', rango]);
        return `${this.URL_WEB}?` + parametros.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    },

    /** El «count» que se pide: el menor de los que admite la API que alcanza para n, sin pasar del máximo. @param {number} n */
    _tamano(n) {
        return this.TAMANOS.find(t => t >= n && t <= this._tamanoMax) || this._tamanoMax;
    },

    // ---------------- claves ----------------

    /** ¿Queda alguna clave libre? (si no, buscar() falla sin gastar peticiones) */
    disponible() { return this._rotacion.libres() > 0; },

    /** Por qué no se puede buscar ahora (todas las claves en pausa). */
    motivoNoDisponible() { return this._sinClaves().message; },

    /** El error cuando ninguna clave puede seguir, o cuando se acabaron los intentos de una página, con su porqué. */
    _sinClaves() {
        const m = this._rotacion.motivos(), total = this._rotacion.total;
        if (m.auth >= total) {
            // «AUTHORIZATION_ERROR — not authorized»: la clave vale, pero Elsevier no le tiene habilitada esta API (eso solo lo
            // arregla Elsevier); otro motivo (una clave inválida, por ejemplo) se dice tal cual.
            if (/AUTHORIZATION_ERROR|not authori[sz]ed/i.test(this._rechazo))
                return errorSD(`Elsevier no ha habilitado la ScienceDirect Search API para las claves del sitio (${this._rechazo}): el acceso a esta API hay que pedírselo a Elsevier`, { auth: true });
            return errorSD(`Elsevier rechazó todas las claves del sitio para ScienceDirect (${this._rechazo || 'HTTP 401/403'})`, { auth: true });
        }
        if (m.auth + m.cuota >= total) {
            const cuando = dentroDe(this._rotacion.esperaMinima());   // si Elsevier dijo cuándo se renueva (X-RateLimit-Reset)
            return errorSD(`las claves del sitio agotaron su cuota semanal de ScienceDirect (20 000 peticiones por clave)${cuando ? `; la primera se renueva ${cuando}` : ''}`, { cuota: true });
        }
        if (m.auth + m.cuota + m.limite >= total) {
            const cuando = dentroDe(this._rotacion.esperaMinima()) || 'más tarde';
            return errorSD(`Elsevier está frenando las peticiones a ScienceDirect con las claves del sitio (por el ritmo, o porque agotaron su cuota de la semana): vuelve a intentarlo ${cuando}`, { limitado: true });
        }
        return errorSD('ScienceDirect no respondió tras varios intentos', { reintentable: true });
    },

    /** Vuelve al estado de inicio de la sesión (las pausas de las claves, el ritmo y lo aprendido de la API). */
    _reiniciar() {
        this._rotacion.reiniciar(); this._turnos.clear(); this._directoOK = null; this._tamanoMax = 100; this._cabecerasLegibles = false; this._rechazo = '';
    },

    // ---------------- transporte ----------------

    /** Espera el turno de una clave: una petición cada INTERVALO_MS por clave, aunque haya varias a la vez. @param {string} clave */
    async _turno(clave) {
        const ahora = Date.now(), proximo = this._turnos.get(clave) || 0, espera = Math.max(0, proximo - ahora);
        this._turnos.set(clave, Math.max(ahora, proximo) + this.INTERVALO_MS);
        if (espera) await dormir(espera);
    },

    /**
     * Una petición directa a Elsevier. Si el navegador no deja leer la respuesta (CORS) o no llega a tiempo, lanza un
     * ErrorSD rescatable (la petición puede seguir por los proxies; un tiempo agotado lleva además la marca «tiempo»). Si el
     * plazo vence leyendo el cuerpo, la puerta CORS ya está probada: el error lleva la marca «tiempo», pero no es rescatable
     * (es Elsevier lento, y se reintenta directo). Si hubo respuesta, devuelve su estado, su cuerpo y lo que dicen sus
     * cabeceras de la cuota, si Elsevier las deja leer.
     * @param {string} url
     * @param {number} [plazo] cuánto esperar la respuesta (ms; por omisión, TIMEOUT_DIRECTO_MS)
     * @returns {Promise<RespuestaSD>}
     */
    async _directo(url, plazo) {
        const espera = plazo ?? this.TIMEOUT_DIRECTO_MS;
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), espera);
        /** @type {Response} */
        let r;
        try {
            r = await fetch(url, { signal: ctrl.signal });
        } catch (e) {
            clearTimeout(tid);
            const err = /** @type {any} */ (e);
            const esAbort = !!err && (err.name === 'AbortError' || /abort/i.test(String(err.message)));
            if (typeof navigator !== 'undefined' && navigator.onLine === false) throw errorSD('sin conexión a internet', { red: true });
            // Un bloqueo del navegador (CORS) no se arregla insistiendo: el resto de la sesión, por los proxies. Un tiempo
            // agotado no condena al directo (_pedir decide si esta petición sigue por los proxies o se reintenta directo).
            if (!esAbort) this._directoOK = false;
            throw errorSD(esAbort ? `Elsevier tardó más de ${Math.round(espera / 1000)} s en responder` : 'el navegador bloqueó la llamada directa a Elsevier', { rescatable: true, tiempo: esAbort });
        }
        this._directoOK = true;   // hubo respuesta legible: la puerta CORS está abierta
        try {
            const texto = await r.text();
            /** @param {string} n */
            const cabecera = n => (r.headers && typeof r.headers.get === 'function' ? r.headers.get(n) : null) ?? '';
            const restantes = cabecera('X-RateLimit-Remaining').trim();
            if (r.ok && restantes) this._cabecerasLegibles = true;
            return { status: r.status, texto, restantes, reinicio: cabecera('X-RateLimit-Reset').trim(), estado: cabecera('X-ELS-Status').trim() };
        } catch (e) {
            // La cabecera llegó a tiempo y el cuerpo no: el mismo Elsevier lento de un tiempo agotado, no un corte.
            if (ctrl.signal.aborted) throw errorSD(`Elsevier tardó más de ${Math.round(espera / 1000)} s en responder`, { reintentable: true, tiempo: true });
            throw errorSD('la respuesta de Elsevier se cortó antes de llegar entera', { reintentable: true });
        } finally {
            clearTimeout(tid);
        }
    },

    /**
     * El error que corresponde a una respuesta de Elsevier que no es correcta.
     * @param {RespuestaSD} respuesta
     * @returns {ErrorSD}
     */
    _errorDeEstado({ status, texto, restantes, reinicio, estado }) {
        const detalle = detalleError(texto), con = detalle ? `: ${detalle}` : '';
        if (status === 400) return errorSD(`ScienceDirect rechazó la consulta (HTTP 400${con})`, { consulta: true });
        // Un 403 con una página HTML no es de Elsevier (lo manda un cortafuegos o un proxy de la red): no aparta la clave, y
        // en la llamada directa la petición puede seguir por los proxies, que no están detrás de ese cortafuegos.
        if (status === 403 && /<html|<!doctype/i.test(texto)) return errorSD(`algo entre el navegador y Elsevier rechazó la petición (HTTP 403${con})`, { rescatable: true });
        if (status === 401 || status === 403) return errorSD(`Elsevier rechazó la clave (HTTP ${status}${con})`, { auth: true, detalle: `HTTP ${status}${con}` });
        if (status === 429) {
            // La cuota de la semana: «X-ELS-Status: QUOTA_EXCEEDED» (o el código en el cuerpo), un «quedan 0» o, si en esta
            // sesión ya se pudo leer X-RateLimit-Remaining en una respuesta correcta, X-RateLimit-Reset sin él (Elsevier no lo
            // manda con la cuota agotada). La clave descansa hasta que se renueva (o el resto de la sesión). Si no, es un
            // frenazo: la clave descansa un rato, más si se repite sin una respuesta correcta entre medias (_pagina).
            if (/QUOTA_EXCEEDED/i.test(`${estado} ${detalle}`) || restantes === '0' || (this._cabecerasLegibles && !!reinicio && !restantes)) {
                const reinicioMs = parseInt(reinicio, 10) * 1000, ahora = Date.now();
                const pausaMs = Number.isFinite(reinicioMs) && reinicioMs > ahora ? Math.min(reinicioMs - ahora, this.PAUSA_CUOTA_MAX_MS) : Infinity;
                return errorSD(`la clave agotó su cuota de ScienceDirect (HTTP 429${con})`, { limitado: true, cuota: true, pausaMs });
            }
            return errorSD(`Elsevier frenó las peticiones (HTTP 429${con})`, { limitado: true, pausaMs: this.PAUSA_LIMITE_MS });
        }
        if (status >= 500) return errorSD(`Elsevier no respondió bien (HTTP ${status}${con})`, { reintentable: true });
        return errorSD(`HTTP ${status}${con}`);
    },

    /**
     * Lee el cuerpo de una respuesta correcta: sus registros y el total. La interfaz GET responde como la v1 ({"search-results":
     * {"opensearch:totalResults", "entry": […]}}; sin coincidencias, una sola entrada con «error»: «Result set was empty»); la
     * v2, {resultsFound, results}. Un error que venga dentro del cuerpo se lanza.
     * @param {string} texto
     * @returns {PaginaSD}
     */
    _leer(texto) {
        /** @type {any} */
        let d = null;
        try { d = JSON.parse(texto); } catch (e) { /* abajo */ }
        if (!d || typeof d !== 'object' || Array.isArray(d)) throw errorSD('respuesta inesperada de ScienceDirect (no es el JSON de la API)', { reintentable: true });
        if (d['service-error'] || d['error-response']) throw errorPorDetalle(detalleError(texto), this.PAUSA_LIMITE_MS);
        /** @param {unknown} v @param {number} n */
        const totalDe = (v, n) => { const t = parseInt(valor(v), 10); return Number.isFinite(t) && t >= 0 ? t : n; };
        const sr = d['search-results'];
        if (sr && typeof sr === 'object') {
            const entradas = Array.isArray(sr.entry) ? sr.entry : (sr.entry && typeof sr.entry === 'object' ? [sr.entry] : []);
            const marca = entradas.length === 1 && entradas[0] && typeof entradas[0] === 'object' && 'error' in entradas[0] && !('dc:title' in entradas[0]);
            if (marca) {
                const aviso = valor(entradas[0].error);
                if (/empty/i.test(aviso)) return { entradas: [], total: 0 };
                throw errorPorDetalle(aviso, this.PAUSA_LIMITE_MS);
            }
            return { entradas, total: totalDe(sr['opensearch:totalResults'], entradas.length) };
        }
        if (Array.isArray(d.results) || 'resultsFound' in d) {
            const entradas = Array.isArray(d.results) ? d.results : [];
            return { entradas, total: totalDe(d.resultsFound, entradas.length) };
        }
        if (d.message || d.error) throw errorPorDetalle(detalleError(texto), this.PAUSA_LIMITE_MS);
        throw errorSD('respuesta inesperada de ScienceDirect (sin la lista de registros)', { reintentable: true });
    },

    /**
     * Juzga una respuesta directa: la página que trae, o el error de su estado.
     * @param {RespuestaSD} respuesta
     * @returns {PaginaSD}
     */
    _interpretar(respuesta) {
        if (respuesta.status >= 200 && respuesta.status < 300) return this._leer(respuesta.texto);
        throw this._errorDeEstado(respuesta);
    },

    /**
     * La misma petición por el arsenal de proxies (cuando el navegador bloquea la directa). El validador lee el cuerpo: un
     * error de Elsevier que llegue en él manda sobre el fallo del arsenal (y sobre la página de error de otro proxy que
     * llegue después). Un 403 con una página HTML no para la carrera: es el cortafuegos del borde de Elsevier bloqueando la
     * IP de ese proxy, y otro puede pasar.
     * @param {string} url
     * @param {string} [motivo] por qué no fue directa (para el mensaje si los proxies tampoco responden)
     * @returns {Promise<PaginaSD>}
     */
    async _porProxies(url, motivo = '') {
        if (typeof ProxiesCORS === 'undefined') throw errorSD('el arsenal de proxies no está disponible');
        /** @type {{ error: ErrorSD | null, cuerpo: string }} */
        const senal = { error: null, cuerpo: '' };
        try {
            const { obras } = await ProxiesCORS.carrera(url, (/** @type {string} */ texto) => {
                try { return [this._leer(texto)]; } catch (e) {
                    // Se queda el primer error que dice algo (el de Elsevier); uno que no dice nada (reintentable) se sustituye.
                    if (!senal.error || senal.error.reintentable) { senal.error = /** @type {ErrorSD} */ (e); senal.cuerpo = String(texto ?? ''); }
                    return null;
                }
            }, { anchura: 4, timeout: this.TIMEOUT_PROXY_MS, oleadas: 2, sigueAnte403HTML: true });
            return /** @type {PaginaSD} */ (obras[0]);
        } catch (e) {
            if (senal.error && !senal.error.reintentable) throw senal.error;
            const err = /** @type {any} */ (e);
            // El código de Elsevier, solo si el arsenal lo distingue del de los proxies (destinoStatus). Un «HTTP401» o un
            // «HTTP429» en su mensaje es el estado del proxy, que puede ser suyo (el límite de AllOrigins, por ejemplo):
            // deducir de ahí el de Elsevier apartaba las claves sin que Elsevier recibiera una sola petición.
            const status = err && err.destino ? Number(err.destinoStatus) || 0 : 0;
            // Se juzga con el cuerpo de la respuesta que trajo ese código (el arsenal lo da): el último que vio el validador
            // puede ser de otro proxy (un «contents: null» de AllOrigins tras el 403 de un cortafuegos haría pasar ese 403 por
            // un rechazo de la clave).
            const cuerpo = err && typeof err.cuerpoDestino === 'string' ? err.cuerpoDestino : senal.cuerpo;
            if (status >= 400) throw this._errorDeEstado({ status, texto: cuerpo, restantes: '', reinicio: '', estado: '' });
            const detalle = String((err && err.message) || err).replace(/^arsenal completo probado[^·]*·\s*/, '').slice(0, 120);
            // Sin reintento: el arsenal ya hizo su propia ronda de gracia, y repetirla entera costaría medio minuto más.
            throw errorSD(`${motivo || 'sin llamada directa a Elsevier'}, y los proxies tampoco respondieron (${detalle})`);
        }
    },

    /**
     * Una petición: directo mientras el navegador lo permita; si lo bloquea (o no responde a tiempo antes de saber si lo
     * permite), por los proxies. Si el directo ya funcionó en esta sesión, un tiempo agotado es de Elsevier, no del
     * navegador: los proxies llamarían al mismo Elsevier, así que la página se reintenta directo (_pagina).
     * @param {string} url  con la clave
     * @param {number} [plazo] cuánto esperar la respuesta directa (ms; por omisión, TIMEOUT_DIRECTO_MS)
     * @returns {Promise<TraidaSD>}
     */
    async _pedir(url, plazo) {
        let motivo = 'el navegador bloquea la llamada directa a Elsevier';
        if (this._directoOK !== false) {
            const probado = this._directoOK === true;
            try { return { pagina: this._interpretar(await this._directo(url, plazo)), via: 'directo' }; }
            catch (e) {
                const err = /** @type {ErrorSD} */ (e);
                if (!err.rescatable) throw err;
                if (err.tiempo && probado) throw errorSD(err.message, { reintentable: true, tiempo: true });
                motivo = err.message;
            }
        }
        return { pagina: await this._porProxies(url, motivo), via: 'proxy' };
    },

    /**
     * Una página, con las claves por turno: la clave que Elsevier rechaza (401/403), que agotó su cuota o que frena (429)
     * queda en pausa (RotacionClaves) y la página se pide con la siguiente; un fallo pasajero de la llamada directa (5xx,
     * una respuesta rara, o un tiempo agotado con el directo ya probado, que se reintenta con el plazo largo de los
     * proxies) se reintenta una vez. Una clave que otra página dejó en pausa mientras esta esperaba su turno no se usa; y el
     * 429 de una petición que salió antes del último frenazo de su clave es de la misma ráfaga (RotacionClaves.frenar).
     * @param {string} base  la URL sin start, count ni clave
     * @param {number} inicio
     * @param {number} cuantos
     * @returns {Promise<TraidaSD>}
     */
    async _pagina(base, inicio, cuantos) {
        let reintentado = false, plazo = this.TIMEOUT_DIRECTO_MS;
        for (let intento = 0; intento < this._rotacion.total + 2; intento++) {
            const clave = this._rotacion.siguiente();
            if (!clave) break;
            await this._turno(clave);
            if (this._rotacion.enPausa(clave)) continue;   // la frenaron mientras esperaba su turno: no sale
            const enviada = this._rotacion.ahora();
            try {
                const traida = await this._pedir(`${base}&start=${inicio}&count=${cuantos}&apiKey=${encodeURIComponent(clave)}`, plazo);
                this._rotacion.exito(clave);
                return traida;
            } catch (e) {
                const err = /** @type {ErrorSD} */ (e);
                if (err.auth) { this._rotacion.pausar(clave, Infinity, 'auth'); if (err.detalle) this._rechazo = err.detalle; continue; }
                if (err.limitado) {
                    if (err.cuota) this._rotacion.pausar(clave, err.pausaMs ?? Infinity, 'cuota');
                    else this._rotacion.frenar(clave, err.pausaMs ?? this.PAUSA_LIMITE_MS, enviada);
                    continue;
                }
                if (err.reintentable && !reintentado) {
                    reintentado = true;
                    if (err.tiempo) plazo = this.TIMEOUT_PROXY_MS;   // Elsevier lento: el reintento le da más tiempo
                    await dormir(this.ESPERA_REINTENTO_MS);
                    continue;
                }
                throw err;
            }
        }
        throw this._sinClaves();
    },

    // ---------------- búsqueda ----------------

    /**
     * Un registro de la API en el formato común de las fuentes (lee la forma de la interfaz GET y la de la v2).
     * @param {EntradaSD} e
     * @returns {ObraSD}
     */
    normalizar(e) {
        const doi = doiLimpio(valor(e['prism:doi']) || valor(e.doi) || valor(e['dc:identifier'])), doiURL = doi ? `https://doi.org/${doi}` : '';
        const pii = piiDe(e);
        const enlaces = Array.isArray(e.link) ? e.link : [];
        const scidir = enlaces.find(l => l && l['@ref'] === 'scidir');
        const articulo = pii ? `https://www.sciencedirect.com/science/article/pii/${pii}` : (enlaceSD(valor(scidir && scidir['@href'])) || enlaceSD(valor(e.uri)));
        const fecha = valor(e['prism:coverDate']) || valor(e.publicationDate) || valor(e['prism:coverDisplayDate']);
        const anio = (fecha.match(/(?:^|\D)(\d{4})(?!\d)/) || [])[1] || 's. f.';
        const vi = valor(e.volumeIssue);   // v2: «Volume 44, Issue 2, …»
        const volumen = valor(e['prism:volume']).trim() || ((vi.match(/Volume\s+([^,]+)/i) || [])[1] || '').trim();
        const numero = valor(e['prism:issueIdentifier']).trim() || ((vi.match(/Issue\s+([^,]+)/i) || [])[1] || '').trim();
        return {
            titulo: limpio(e['dc:title'] ?? e.title) || '(sin título)',
            autores: autoresDe(e),
            anio,
            doi: doiURL,
            link: doiURL || articulo,
            fuente: limpio(e['prism:publicationName'] ?? e.sourceTitle),
            volumen, numero,
            paginas: paginasDe(e),
            citas: 0,                                      // la API no trae citas
            idioma: '',
            resumen: '',                                   // ni resumen: lo completa el enriquecimiento por DOI
            keywords: '',
            issn: valor(e['prism:issn']).trim() || valor(e['prism:eIssn']).trim(),
            fuentesAPI: ['ScienceDirect']
        };
    },

    /**
     * Busca la consulta y trae hasta filtros.maxResultados registros (por omisión, 50 = una petición), por relevancia. La
     * primera página dice el total y cuántos registros entrega de verdad la API por página; las demás salen de VENTANA en
     * VENTANA, cada una con su clave. Si falla una página que no es la primera, devuelve las anteriores (contiguas: el orden
     * de relevancia manda) y lo dice en «parcial». Sin coincidencias devuelve una lista vacía: un cero es un cero.
     * @param {unknown} consulta
     * @param {FiltrosSD} [filtros]
     */
    async buscar(consulta, filtros = {}) {
        const { ecuacion, omitidos } = this._armar(consulta);
        if (!ecuacion) throw errorSD('la consulta no tiene términos que buscar (solo palabras vacías o de una o dos letras)', { sinTerminos: true });
        const objetivo = Math.min(this.MAX_RESULTADOS, Math.max(1, Math.floor(Number(filtros.maxResultados) || this.POR_OMISION)));
        const base = this._urlBase(ecuacion, this.rangoAnios(filtros));
        let pedido = this._tamano(objetivo);
        /** @type {TraidaSD} */
        let primera;
        try {
            primera = await this._pagina(base, 0, pedido);
        } catch (e) {
            // Si la API rechaza la página de más de 25 (HTTP 400), se prueba una vez con 25; si vale, se recuerda.
            if (!(/** @type {ErrorSD} */ (e)).consulta || pedido <= 25) throw e;
            primera = await this._pagina(base, 0, 25);
            this._tamanoMax = 25; pedido = 25;
        }
        const vias = new Set([primera.via]);
        const n0 = primera.pagina.entradas.length, total = primera.pagina.total;
        // El paso entre páginas: lo que la API entrega de verdad si no coincide con lo pedido (y quedaban más).
        const paso = n0 > 0 && (n0 > pedido || (n0 < pedido && total > n0)) ? n0 : pedido;
        const meta = Math.min(objetivo, total, this.MAX_RESULTADOS);
        // Una primera página con menos registros que la página más pequeña de la API (10) cuando quedaban más no es una
        // página de verdad: paginar con ese paso costaría cientos de peticiones de la cuota compartida. Se para ahí.
        const anomala = n0 > 0 && n0 < this.TAMANOS[0] && n0 < meta;
        /** @type {number[]} */
        const inicios = [];
        if (n0 > 0 && !anomala) for (let s = n0; s < meta && s <= this.MAX_RESULTADOS - pedido; s += paso) inicios.push(s);
        /** @type {(PaginaSD | null)[]} */
        const lotes = inicios.map(() => null);
        /** @type {(ErrorSD | null)[]} */
        const fallos = inicios.map(() => null);
        let cursor = 0, corte = inicios.length;   // tras un fallo o una página corta, las siguientes ya no hacen falta
        const trabajador = async () => {
            while (cursor < corte) {
                const i = cursor++;
                try {
                    const r = await this._pagina(base, inicios[i], pedido);
                    lotes[i] = r.pagina; vias.add(r.via);
                    if (r.pagina.entradas.length < paso) corte = Math.min(corte, i + 1);
                } catch (e) {
                    fallos[i] = /** @type {ErrorSD} */ (e); corte = Math.min(corte, i + 1);
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(this.VENTANA, inicios.length) }, trabajador));
        const registros = [...primera.pagina.entradas];
        let paginas = 1, parcial = anomala ? `1 página (la API entregó solo ${n0} registro(s) de ${total}: no se pidieron más)` : '';
        for (let i = 0; i < inicios.length; i++) {
            const lote = lotes[i], fallo = fallos[i];
            if (!lote) { if (fallo) parcial = `${paginas}/${inicios.length + 1} páginas (${fallo.message})`; break; }
            paginas++;
            registros.push(...lote.entradas);
            if (lote.entradas.length < paso) break;   // el final real de los resultados
        }
        const vistos = new Set(), obras = [];
        let descartados = 0;
        for (const e of registros) {
            if (!e || typeof e !== 'object' || Array.isArray(e)) { descartados++; continue; }
            /** @type {ObraSD} */
            let o;
            try { o = this.normalizar(e); } catch (err) { descartados++; continue; }   // un registro con una forma inesperada no tira la búsqueda: se cuenta
            // Sin título, DOI ni PII no hay nada que citar ni que abrir: una forma de respuesta que no se conoce, no una obra.
            if (o.titulo === '(sin título)' && !o.doi && !piiDe(e)) { descartados++; continue; }
            const clave = o.doi.toLowerCase() || piiDe(e) || o.titulo.toLowerCase();
            if (vistos.has(clave)) continue;
            vistos.add(clave); obras.push(o);
        }
        return { obras: obras.slice(0, objetivo), total, paginas, parcial, descartados, omitidos, ecuacion, via: vias.has('proxy') ? 'proxy' : 'directo' };
    }
};

export { ScienceDirectDirecto };
