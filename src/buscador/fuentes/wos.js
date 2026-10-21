// @ts-check
// buscador/fuentes/wos.js — fuente Web of Science (Clarivate), por la Web of Science Starter API.
// (2026.12.26) Lo que conviene saber de esta API (developer.clarivate.com/apis/wos-starter):
//   · Exige una clave, que viaja en la cabecera X-ApiKey (no en la URL). Se pide gratis en el portal de Clarivate; hay
//     dos planes al alcance de un investigador: el de prueba (cualquiera: 1 petición por segundo y 50 al día, sin
//     recuento de citas) y el institucional (miembros de una institución suscrita a Web of Science: 5 por segundo y
//     5000 al día, con citas). Cada página trae hasta 50 registros: 50 resultados = 1 petición.
//   · No devuelve resúmenes: los completa, como en las demás fuentes, el enriquecimiento automático por DOI.
//   · Devuelve el nombre de la revista en mayúsculas y sin tildes («FRONTIERS IN PSYCHOLOGY»): se pasa a mayúsculas
//     iniciales para la referencia APA, y el enriquecimiento pone el de OpenAlex cuando es la misma revista.
//   · Dos caminos: directo a Clarivate con la clave guardada en este navegador, o por el relevo propio
//     (workers/relevo-wos.js, un Cloudflare Worker), que guarda las claves en sus secretos y resuelve el CORS si
//     Clarivate no deja llamar desde el navegador. Con RELEVO_URL se usa el relevo; si además hay una clave guardada,
//     el relevo usa esa en lugar de las suyas.
//   · La clave NUNCA pasa por los proxies CORS públicos del arsenal (shared/proxies.js): sería entregársela a terceros.

import { doiLimpio } from './doi.js';
import { conPalabrasVacias, terminosClave } from './terminos.js';

/**
 * @typedef {{ displayName?: string, wosStandard?: string }} NombreWos
 * @typedef {{ range?: string, begin?: string, end?: string, count?: number }} PaginasWos
 * @typedef {{ sourceTitle?: string, publishYear?: number | string, volume?: string, issue?: string, articleNumber?: string, pages?: PaginasWos }} OrigenWos
 * @typedef {{ db?: string, count?: number | string }} CitasWos
 * @typedef {{ uid?: string, title?: string, source?: OrigenWos, names?: { authors?: NombreWos[], corp?: NombreWos[] },
 *   links?: { record?: string }, citations?: CitasWos[], identifiers?: { doi?: string, issn?: string, eissn?: string, pmid?: string },
 *   keywords?: { authorKeywords?: string[] } }} DocumentoWos
 * @typedef {{ metadata?: { total?: number, page?: number, limit?: number }, hits: DocumentoWos[] }} ListaWos
 * @typedef {{ titulo: string, autores: string[], anio: string, doi: string, link: string, fuente: string, volumen: string,
 *   numero: string, paginas: string, citas: number, idioma: string, resumen: string, keywords: string, issn: string,
 *   pmid: string, fuentesAPI: string[], _revistaProvisional: boolean }} ObraWos
 * @typedef {{ desde?: string | number, maxResultados?: number, idioma?: string }} FiltrosWos
 * @typedef {{ status: number, texto: string, reintentarEn: number }} RespuestaWos
 * @typedef {Error & { wos: true, sinConfigurar?: boolean, sinTerminos?: boolean, cors?: boolean, red?: boolean, timeout?: boolean,
 *   auth?: boolean, limitado?: boolean, cuota?: boolean, consulta?: boolean, reintentable?: boolean, reintentarEn?: number }} ErrorWos
 */

/**
 * @param {string} mensaje
 * @param {Partial<ErrorWos>} [marcas]
 * @returns {ErrorWos}
 */
function errorWos(mensaje, marcas = {}) {
    return /** @type {ErrorWos} */ (Object.assign(new Error(mensaje), marcas, { wos: true }));
}

/** @param {number} ms */
const dormir = ms => new Promise(resolver => setTimeout(resolver, ms));

// ---- el nombre de la revista: de «FRONTIERS IN PSYCHOLOGY» a «Frontiers in Psychology» ----
// Palabras que van en minúscula salvo al empezar (APA 7: artículos, conjunciones y preposiciones cortas; y las del
// español, el portugués, el francés y el alemán, que Web of Science escribe sin tildes).
const MENORES = new Set(['a', 'an', 'the', 'and', 'but', 'for', 'nor', 'or', 'so', 'yet', 'as', 'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to', 'up', 'via', 'vs',
    'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'u', 'en', 'al', 'con', 'por', 'para', 'sin', 'un', 'una',
    'da', 'das', 'do', 'dos', 'em', 'na', 'nas', 'no', 'nos', 'com', 'des', 'du', 'le', 'les', 'et', 'sur', 'pour', 'und', 'fur', 'der', 'die']);
// Siglas que se quedan en mayúsculas (las frecuentes en revistas de psicología y salud).
const SIGLAS = new Set(['ACM', 'ADHD', 'AIDS', 'APA', 'BJPSYCH', 'BMC', 'BMJ', 'CNS', 'EEG', 'EU', 'HIV', 'ICT', 'IEEE', 'JAMA', 'JMIR', 'MRI', 'NPJ',
    'OCD', 'PLOS', 'PNAS', 'PTSD', 'SAGE', 'SIDA', 'SSM', 'STEM', 'TDAH', 'UK', 'USA', 'VIH']);
const ROMANO = /^(?=[IVX]{2,}$)X{0,3}(?:IX|IV|V?I{0,3})$/;

/**
 * El nombre de una revista en mayúsculas iniciales, como lo pide la referencia APA. Solo cambia los nombres escritos
 * enteros en mayúsculas (si ya trae minúsculas, vuelve tal cual): cada palabra con su inicial en mayúscula, salvo las
 * cortas de unión; las siglas conocidas, los números romanos y las palabras con cifras («XX1»), como vienen.
 * @param {unknown} nombre
 * @returns {string}
 */
export function nombreRevista(nombre) {
    const texto = String(nombre ?? '').replace(/\s+/g, ' ').trim();
    if (!texto || /\p{Ll}/u.test(texto)) return texto;
    let inicio = true;   // la primera palabra, y la que sigue a «:» o a un guion suelto, van con mayúscula
    const palabras = texto.split(' ');
    return palabras.map((palabra, k) => {
        const partes = palabra.split(/([-/])/);
        const salida = partes.map((parte, i) => {
            if (parte === '-' || parte === '/') return parte;
            const letras = parte.replace(/[^\p{L}\p{N}]/gu, '');
            if (!letras || /\p{N}/u.test(letras) || SIGLAS.has(letras) || ROMANO.test(letras)) return parte;
            const minuscula = parte.toLowerCase();
            // Una palabra de unión no cierra un título ni va pegada a un guion: «PHYSICAL REVIEW E», «PART A»,
            // «SERIES A-BIOLOGICAL SCIENCES» llevan una letra de serie, no la conjunción.
            const union = !inicio && i === 0 && k < palabras.length - 1 && partes[1] !== '-' && MENORES.has(letras.toLowerCase());
            return union ? minuscula : minuscula.replace(/\p{L}/u, c => c.toUpperCase());
        }).join('');
        inicio = /[:.?!]$/.test(palabra) || palabra === '-' || palabra === '–';
        return salida;
    }).join(' ');
}

/**
 * Las veces citado en la Colección Principal (la entrada «WOS»; si no está, la mayor de las que haya). El plan de prueba
 * no trae citas: 0.
 * @param {CitasWos[] | undefined} citas
 * @returns {number}
 */
function citasWos(citas) {
    if (!Array.isArray(citas) || !citas.length) return 0;
    /** @param {CitasWos | undefined} c */
    const n = c => { const v = Number(c && c.count); return Number.isFinite(v) && v >= 0 ? v : 0; };
    const wos = citas.find(c => c && String(c.db || '').toUpperCase() === 'WOS');
    return wos ? n(wos) : Math.max(0, ...citas.map(n));
}

/** @param {DocumentoWos | undefined} h */
const traeCitas = h => !!h && Array.isArray(h.citations) && h.citations.length > 0;

/**
 * Un texto de la API sin etiquetas HTML (las de cursiva o subíndice que traen algunos títulos) y con los espacios
 * normalizados. Solo se quita lo que tiene forma de etiqueta: «p < .05 y q > .01» se queda como está.
 * @param {unknown} texto
 */
const sinEtiquetas = texto => String(texto ?? '').replace(/<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?>/gi, '').replace(/\s+/g, ' ').trim();

/**
 * Lo que dice el cuerpo de un error de Clarivate o del relevo (sus formas: {error: {details|title}}, {error_description},
 * {error: '…'}, {message}).
 * @param {string} texto
 * @returns {{ detalle: string, codigo: string }}
 */
function leerError(texto) {
    /** @type {any} */
    let d = null;
    try { d = JSON.parse(texto); } catch (e) { /* no es JSON */ }
    if (!d || typeof d !== 'object') return { detalle: String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 160), codigo: '' };
    /** @param {unknown} v */
    const aTexto = v => (typeof v === 'string' ? v : (v ? JSON.stringify(v) : ''));
    const e = d.error;
    const detalle = (e && typeof e === 'object' && aTexto(e.details || e.title || e.message)) || aTexto(d.error_description) || (typeof e === 'string' ? e : '') || aTexto(d.message);
    return { detalle: detalle.replace(/\s+/g, ' ').trim().slice(0, 200), codigo: typeof d.codigo === 'string' ? d.codigo : '' };
}

// Una clave va en una cabecera HTTP: caracteres visibles de ASCII, sin espacios (y nada que permita inyectar otra cabecera).
const CLAVE_VALIDA = /^[\x21-\x7E]{16,200}$/;

const WebOfScienceDirecto = {

    API: 'https://api.clarivate.com/apis/wos-starter/v1',
    // Dirección del relevo (workers/relevo-wos.js) una vez desplegado en Cloudflare, p. ej.
    // 'https://wos.TU-SUBDOMINIO.workers.dev'. Vacía: sin relevo (solo el camino directo con una clave guardada).
    RELEVO_URL: '',
    BASE_DATOS: 'WOS',                 // la Colección Principal (Core Collection)
    POR_PAGINA: 50,                    // el máximo de la API por petición
    MAX_RESULTADOS: 1000,              // = 20 peticiones
    INTERVALO_MS: 1100,                // ritmo: el plan de prueba admite 1 petición por segundo (el institucional, 5)
    TIMEOUT_MS: 20000,
    ESPERA_REINTENTO_MS: 1500,         // antes del único reintento (429 por segundo, 5xx, tiempo agotado)
    ESPERA_MAX_MS: 10000,              // tope para lo que pida Retry-After
    CLAVE_ALMACEN: 'statsim_wos_clave',
    URL_BUSQUEDA_AVANZADA: 'https://www.webofscience.com/wos/woscc/advanced-search',
    URL_PORTAL: 'https://developer.clarivate.com/apis/wos-starter',

    // AND, OR, NOT, NEAR y SAME son operadores de Web of Science: como palabras sueltas romperían la ecuación.
    _VACIAS: conPalabrasVacias(['not', 'near', 'same']),

    _claveMemoria: '',      // la clave de esta sesión (también si el navegador no deja guardarla)
    _agotada: '',           // la credencial que agotó su cuota en esta sesión: no se vuelve a gastar en ella
    _proximoTurno: 0,       // cuándo puede salir la siguiente petición (ritmo compartido por todas las búsquedas)

    // ---------------- ecuación ----------------

    /** Los términos de la consulta (fuentes/terminos.js, sin los operadores de Web of Science). @param {unknown} consulta */
    terminos(consulta) {
        return terminosClave(consulta, this._VACIAS);
    },

    /** El último año del filtro: el siguiente al actual (los artículos de acceso anticipado ya llevan el año próximo). */
    _anioFinal() { return new Date().getFullYear() + 1; },

    /**
     * La ecuación de búsqueda avanzada: los términos en el tema (título, resumen, palabras clave del autor y Keywords
     * Plus) unidos por AND y, si hay año de inicio, el rango de años de publicación. '' si no queda ningún término.
     * Es la misma que se copia para pegarla en la búsqueda avanzada de webofscience.com.
     * @param {unknown} consulta
     * @param {FiltrosWos} [filtros]
     */
    ecuacion(consulta, filtros = {}) {
        const terminos = this.terminos(consulta);
        if (!terminos.length) return '';
        const partes = [`TS=(${terminos.join(' AND ')})`];
        const fin = this._anioFinal(), desde = parseInt(String(filtros.desde ?? ''), 10);
        if (Number.isFinite(desde) && desde >= 1900) partes.push(`PY=(${Math.min(desde, fin)}-${fin})`);
        return partes.join(' AND ');
    },

    /** La dirección del relevo sin barra final, o '' si no hay. */
    _relevo() {
        const u = String(this.RELEVO_URL || '').trim().replace(/\/+$/, '');
        return /^https?:\/\//i.test(u) ? u : '';
    },

    /**
     * La URL de una página de resultados (directa a Clarivate o al relevo). Los valores van con encodeURIComponent:
     * el «+» de sortField viaja como %2B y los espacios de la ecuación como %20, sin depender de cómo decodifique el
     * servidor un «+».
     * @param {string} ecuacion
     * @param {number} pagina
     * @param {number} limite
     */
    _urlPagina(ecuacion, pagina, limite) {
        const parametros = [['db', this.BASE_DATOS], ['q', ecuacion], ['limit', String(limite)], ['page', String(pagina)], ['sortField', 'RS+D']];
        return `${this._relevo() || this.API}/documents?` + parametros.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    },

    /**
     * La URL de la primera página de una consulta (como construirURL de Scopus).
     * @param {unknown} consulta
     * @param {FiltrosWos} [filtros]
     */
    construirURL(consulta, filtros = {}) {
        return this._urlPagina(this.ecuacion(consulta, filtros), 1, this.POR_PAGINA);
    },

    // ---------------- credenciales ----------------

    /** La clave guardada en este navegador (o la de esta sesión), o ''. */
    clave() {
        let guardada = '';
        try { guardada = (typeof localStorage !== 'undefined' && localStorage.getItem(this.CLAVE_ALMACEN)) || ''; } catch (e) { /* almacenamiento bloqueado */ }
        return String(this._claveMemoria || guardada || '').trim();
    },

    /**
     * Pone la clave en uso (nunca sale de este navegador salvo hacia Clarivate o el relevo propio). Con recordar (por
     * omisión), la guarda en el almacenamiento del sitio; sin él, vale solo mientras la página esté abierta (y se borra
     * la que hubiera guardada). Devuelve si quedó guardada: false si no se pidió o si el navegador no deja guardarla.
     * @param {unknown} clave
     * @param {{ recordar?: boolean }} [opciones]
     */
    guardarClave(clave, { recordar = true } = {}) {
        const k = String(clave ?? '').trim();
        if (!CLAVE_VALIDA.test(k)) throw errorWos('la clave no parece válida: cópiala entera, sin espacios, tal como la muestra developer.clarivate.com');
        this._claveMemoria = k;
        this._agotada = '';
        try {
            if (!recordar) { localStorage.removeItem(this.CLAVE_ALMACEN); return false; }
            localStorage.setItem(this.CLAVE_ALMACEN, k);
            return true;
        } catch (e) { return false; }
    },

    /** Borra la clave de este navegador y de la sesión. */
    olvidarClave() {
        this._claveMemoria = '';
        this._agotada = '';
        try { localStorage.removeItem(this.CLAVE_ALMACEN); } catch (e) { /* almacenamiento bloqueado */ }
    },

    /** ¿Está la clave guardada en el almacenamiento del navegador? (si no, vale solo mientras la página esté abierta) */
    claveRecordada() {
        try { return typeof localStorage !== 'undefined' && !!localStorage.getItem(this.CLAVE_ALMACEN); } catch (e) { return false; }
    },

    /** ¿Hay por dónde buscar? (un relevo, o una clave para el camino directo) */
    configurada() { return !!(this._relevo() || this.clave()); },

    /** 'relevo', 'directo' o '' (sin configurar). */
    modo() { return this._relevo() ? 'relevo' : (this.clave() ? 'directo' : ''); },

    /** La clave abreviada para mostrarla («…a1b2»), o ''. */
    claveVisible() { const k = this.clave(); return k ? '…' + k.slice(-4) : ''; },

    /** Identifica la credencial en uso (camino + clave) para recordar si agotó su cuota. */
    _credencial() { return this.modo() + '|' + this.clave(); },

    /** ¿La credencial en uso agotó su cuota en esta sesión? (entonces buscar() falla sin gastar peticiones) */
    cuotaAgotada() { return !!this._agotada && this._agotada === this._credencial(); },

    // ---------------- transporte ----------------

    /** Espera el turno: una petición cada INTERVALO_MS, aunque haya varias búsquedas a la vez. */
    async _turno() {
        const ahora = Date.now(), espera = Math.max(0, this._proximoTurno - ahora);
        this._proximoTurno = Math.max(ahora, this._proximoTurno) + this.INTERVALO_MS;
        if (espera) await dormir(espera);
    },

    /**
     * Una petición GET con la clave en su cabecera. Lanza ErrorWos si no hubo respuesta (tiempo agotado, sin red,
     * bloqueo del navegador); si la hubo, devuelve su estado y su cuerpo sin juzgarlos.
     * @param {string} url
     * @returns {Promise<RespuestaWos>}
     */
    async _pedir(url) {
        const clave = this.clave(), relevo = this._relevo();
        if (!relevo && !clave) throw errorWos(this.MENSAJES.sinConfigurar, { sinConfigurar: true });
        /** @type {Record<string, string>} */
        const cabeceras = { Accept: 'application/json' };
        if (clave) cabeceras['X-ApiKey'] = clave;
        await this._turno();
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), this.TIMEOUT_MS);
        try {
            const r = await fetch(url, { headers: cabeceras, signal: ctrl.signal });
            const texto = await r.text();
            const ra = r.headers && typeof r.headers.get === 'function' ? r.headers.get('Retry-After') : null;
            return { status: r.status, texto, reintentarEn: Math.max(0, parseInt(String(ra ?? ''), 10) || 0) };
        } catch (e) {
            const err = /** @type {any} */ (e);
            if (err && (err.name === 'AbortError' || /abort/i.test(String(err.message))))
                throw errorWos(`${relevo ? 'el relevo' : 'Clarivate'} tardó más de ${Math.round(this.TIMEOUT_MS / 1000)} s en responder`, { timeout: true, reintentable: true });
            if (typeof navigator !== 'undefined' && navigator.onLine === false) throw errorWos('sin conexión a internet', { red: true });
            throw relevo
                ? errorWos(`no se pudo conectar con el relevo (${relevo}): ¿está desplegado y la dirección es la correcta?`, { red: true, reintentable: true })
                : errorWos(this.MENSAJES.cors, { cors: true });
        } finally {
            clearTimeout(tid);
        }
    },

    /**
     * Juzga una respuesta: los resultados, o el ErrorWos que corresponde a su estado.
     * @param {RespuestaWos} respuesta
     * @returns {ListaWos}
     */
    _interpretar({ status, texto, reintentarEn }) {
        const relevo = !!this._relevo();
        if (status >= 200 && status < 300) {
            /** @type {any} */
            let d = null;
            try { d = JSON.parse(texto); } catch (e) { /* abajo */ }
            if (!d || !Array.isArray(d.hits)) throw errorWos('respuesta inesperada de Web of Science (sin la lista de registros)', { reintentable: true });
            return d;
        }
        const { detalle, codigo } = leerError(texto);
        const con = detalle ? `: ${detalle}` : '';
        if (codigo === 'ORIGEN') throw errorWos('el relevo no admite esta página (su dirección no está en ORIGENES del Worker)', { auth: true });
        if (codigo === 'SIN_CLAVES') throw errorWos('el relevo no tiene claves: añade WOS_KEY_1 (y las que quieras) en los secretos del Worker', { auth: true });
        if (codigo === 'IP_RATE') throw errorWos('demasiadas peticiones desde esta red en poco tiempo: espera un minuto', { reintentarEn });
        if (codigo === 'PARAMETROS' || codigo === 'CLAVE') throw errorWos(`el relevo rechazó la petición (${detalle || codigo})`, { consulta: codigo === 'PARAMETROS', auth: codigo === 'CLAVE' });
        if (status === 400) throw errorWos(`Web of Science rechazó la ecuación (HTTP 400${con})`, { consulta: true });
        if (status === 401 || status === 403)
            throw errorWos(relevo && !this.clave()
                ? `Clarivate rechazó las claves del relevo (HTTP ${status}${con}): revisa WOS_KEY_N en el Worker`
                : `Clarivate rechazó la clave (HTTP ${status}${con}): revisa que esté completa y activa en developer.clarivate.com`, { auth: true });
        if (status === 429) throw errorWos(`Clarivate limitó las peticiones (HTTP 429${con})`, { limitado: true, reintentarEn });
        if (status >= 500) throw errorWos(`${relevo ? 'el relevo o Clarivate' : 'Clarivate'} no respondió bien (HTTP ${status}${con})`, { reintentable: true, reintentarEn });
        throw errorWos(`HTTP ${status}${con}`);
    },

    /**
     * Una página de resultados, con un reintento ante lo pasajero (el límite por segundo, un 5xx, el tiempo agotado).
     * La cuota del día se reconoce por dos 429 seguidos, o por un 429 que pide esperar más de ESPERA_MAX_MS: la
     * credencial queda marcada para no volver a gastar peticiones en ella (un 503 seguido de un 429 no la marca).
     * @param {string} ecuacion
     * @param {number} pagina
     * @param {number} limite
     * @returns {Promise<ListaWos>}
     */
    async _pagina(ecuacion, pagina, limite) {
        /** @type {ErrorWos | null} */
        let anterior = null;
        for (let intento = 0; ; intento++) {
            try {
                return this._interpretar(await this._pedir(this._urlPagina(ecuacion, pagina, limite)));
            } catch (e) {
                const err = /** @type {ErrorWos} */ (e);
                const esperaLarga = !!err.limitado && (err.reintentarEn || 0) * 1000 > this.ESPERA_MAX_MS;
                if (err.limitado && (esperaLarga || (anterior && anterior.limitado))) {
                    this._agotada = this._credencial();
                    throw errorWos(this.mensajeCuota(), { cuota: true });
                }
                if (intento > 0 || !(err.limitado || err.reintentable)) throw err;
                anterior = err;
                await dormir(Math.min(this.ESPERA_MAX_MS, Math.max(this.ESPERA_REINTENTO_MS, (err.reintentarEn || 0) * 1000)));
            }
        }
    },

    // ---------------- búsqueda ----------------

    /**
     * Normaliza un registro de la API al formato común de las fuentes.
     * @param {DocumentoWos} h
     * @returns {ObraWos}
     */
    normalizar(h) {
        const origen = h.source || {}, ids = h.identifiers || {}, nombres = h.names || {};
        /** @param {NombreWos[] | undefined} lista */
        const nombresDe = lista => (Array.isArray(lista) ? lista : []).map(a => sinEtiquetas(a && (a.displayName || a.wosStandard))).filter(Boolean);
        const autores = nombresDe(nombres.authors);
        const doi = doiLimpio(ids.doi), doiURL = doi ? `https://doi.org/${doi}` : '';
        const uid = /^[A-Za-z0-9:._-]+$/.test(String(h.uid || '')) ? String(h.uid) : '';
        const registro = (h.links && typeof h.links.record === 'string' && /^https:\/\/[^\s"'<>`]+$/.test(h.links.record) && h.links.record)
            || (uid ? `https://www.webofscience.com/wos/woscc/full-record/${uid}` : '');
        const pags = origen.pages || {};
        const paginas = pags.range || (pags.begin && pags.end ? `${pags.begin}-${pags.end}` : pags.begin || '')
            || (origen.articleNumber ? `Artículo ${origen.articleNumber}` : '');
        const revistaOriginal = sinEtiquetas(origen.sourceTitle), revista = nombreRevista(revistaOriginal);
        const anio = parseInt(String(origen.publishYear ?? ''), 10);
        return {
            titulo: sinEtiquetas(h.title) || '(sin título)',
            autores: autores.length ? autores : nombresDe(nombres.corp),
            anio: Number.isFinite(anio) ? String(anio) : 's. f.',
            doi: doiURL,
            link: doiURL || registro,
            fuente: revista,
            volumen: String(origen.volume || ''), numero: String(origen.issue || ''),
            paginas: String(paginas),
            citas: citasWos(h.citations),
            idioma: '',
            resumen: '',                                   // la API no lo trae: lo completa el enriquecimiento por DOI
            keywords: (h.keywords && Array.isArray(h.keywords.authorKeywords) ? h.keywords.authorKeywords : []).filter(x => typeof x === 'string' && x).join('; '),
            issn: String(ids.issn || ids.eissn || ''),
            pmid: String(ids.pmid || ''),
            fuentesAPI: ['Web of Science'],
            _revistaProvisional: revista !== revistaOriginal  // el enriquecimiento la sustituye por la de OpenAlex si es la misma revista
        };
    },

    /**
     * Busca la consulta y trae hasta filtros.maxResultados registros (por omisión, 50 = una petición), en páginas de
     * 50 seguidas y al ritmo del plan. Si falla una página que no es la primera, devuelve las anteriores (contiguas: el
     * orden de relevancia manda) y lo dice en «parcial». Sin coincidencias devuelve una lista vacía: un cero es un cero.
     * @param {unknown} consulta
     * @param {FiltrosWos} [filtros]
     */
    async buscar(consulta, filtros = {}) {
        if (!this.configurada()) throw errorWos(this.MENSAJES.sinConfigurar, { sinConfigurar: true });
        if (this.cuotaAgotada()) throw errorWos(this.mensajeCuota(), { cuota: true });
        const ecuacion = this.ecuacion(consulta, filtros);
        if (!ecuacion) throw errorWos('la consulta no tiene términos que buscar (solo palabras vacías o de una o dos letras)', { sinTerminos: true });
        const pedidos = Math.floor(Number(filtros.maxResultados) || this.POR_PAGINA);
        const objetivo = Math.min(this.MAX_RESULTADOS, Math.max(1, pedidos));
        const limite = Math.min(this.POR_PAGINA, objetivo);
        const primera = await this._pagina(ecuacion, 1, limite);
        const total = Math.max(0, parseInt(String((primera.metadata && primera.metadata.total) ?? primera.hits.length), 10) || 0);
        const paginas = Math.max(1, Math.ceil(Math.min(objetivo, total) / limite));
        const lotes = [primera.hits];
        let parcial = '';
        for (let p = 2; p <= paginas && lotes[lotes.length - 1].length >= limite; p++) {
            try { lotes.push((await this._pagina(ecuacion, p, limite)).hits); }
            catch (e) { parcial = `${p - 1}/${paginas} páginas (${/** @type {Error} */ (e).message})`; break; }
        }
        const registros = lotes.flat(), vistos = new Set(), obras = [];
        let descartados = 0;
        for (const h of registros) {
            if (!h || typeof h !== 'object') { descartados++; continue; }
            if (h.uid) { if (vistos.has(h.uid)) continue; vistos.add(h.uid); }
            try { obras.push(this.normalizar(h)); } catch (e) { descartados++; }   // un registro con una forma inesperada no tira la búsqueda: se cuenta
        }
        return { obras: obras.slice(0, objetivo), total, paginas: lotes.length, parcial, descartados, conCitas: registros.some(traeCitas), via: this.modo(), ecuacion };
    },

    /**
     * Prueba la conexión con una petición mínima (1 registro: gasta 1 de la cuota). Sirve para saber, antes de buscar,
     * si la clave vale, si el navegador deja llamar directo a Clarivate y si el plan trae citas.
     */
    async probar() {
        if (!this.configurada()) throw errorWos(this.MENSAJES.sinConfigurar, { sinConfigurar: true });
        const d = await this._pagina('TS=(psychology)', 1, 1);
        this._agotada = '';
        return { via: this.modo(), total: Math.max(0, Number(d.metadata && d.metadata.total) || 0), conCitas: d.hits.some(traeCitas) };
    },

    /** El aviso de la cuota agotada, según de quién sea la credencial (la clave del usuario o las del relevo). */
    mensajeCuota() {
        return this.modo() === 'relevo' && !this.clave()
            ? 'las claves del relevo agotaron su cuota de hoy'
            : 'tu clave agotó su cuota de hoy (plan de prueba: 50 peticiones al día; institucional: 5000)';
    },

    MENSAJES: {
        sinConfigurar: 'Web of Science no está configurado: falta la clave de la API (pégala en «🔑 Conexión con Web of Science») o el relevo',
        cors: 'el navegador bloqueó la llamada directa a Clarivate (CORS) o no hubo red: Web of Science necesita el relevo del sitio, que despliega quien lo publica (docs/WEB-OF-SCIENCE.md)'
    }
};

export { WebOfScienceDirecto };
