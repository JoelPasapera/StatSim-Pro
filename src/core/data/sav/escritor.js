// @ts-check
// core/data/sav/escritor.js — escribe un archivo de datos de SPSS (.sav) desde cero, sin bibliotecas: el diccionario
// (nombres largos, etiquetas de variable y de valor, formatos, niveles de medida, codificación UTF-8) y los casos, con la
// compresión por bytes de SPSS. (2026.12.29) Formato: «System File Format» del manual de desarrolladores de GNU PSPP;
// lo que escribe se comprueba leyéndolo con ReadStat (la biblioteca de haven y pyreadstat), en tests/oracle/sav_oraculo.sh.
// Sin DOM: funciona en la página, en un Worker y en Node.
//
// Decisiones (documentadas en docs/LIMITACIONES.md):
//   · Los nombres que SPSS no admite se ajustan (caracteres no válidos → «_», primero una letra, sin punto final, como
//     mucho 64 bytes, sin palabras reservadas, sin repetirse) y se informa en `avisos` con el nombre original.
//   · Las cadenas, como mucho 255 bytes por valor (más largas exigen el registro de «cadenas muy largas», que aquí no se
//     escribe): lo que pase se recorta sin partir un carácter y se avisa.
//   · Etiquetas de variable hasta 256 bytes y de valor hasta 120 (los límites de SPSS), recortadas sin partir un carácter.
//   · Los perdidos son el perdido del sistema (NaN, null o un número no finito): no se declaran valores perdidos.

import { CODIGO_FORMATO, CODIGO_MEDIDA, HIGHEST, LOWEST, REGISTRO, RESERVADAS, SUBTIPO, SYSMIS, diasASegundos, utf8, utf8Recortado } from './formato.js';

/**
 * @typedef {'nominal' | 'ordinal' | 'escala'} MedidaSav
 * @typedef {{
 *   nombre: string,
 *   etiqueta?: string,
 *   tipo?: 'numerica' | 'texto',
 *   valores: ArrayLike<number | string | null | undefined>,
 *   decimales?: number,
 *   fecha?: boolean,
 *   medida?: MedidaSav,
 *   etiquetasValor?: Record<string, string> | Array<[number | string, string]>
 * }} VariableSav
 *   `valores`: la columna (numérica: números, con NaN o null como perdido; texto: cadenas). `fecha`: los valores son días
 *   desde el 1 de enero de 1970 y se escriben como fecha de SPSS (formato DATE11). `decimales`: los del formato F (si no
 *   se dan, los menos que representan todos los valores, hasta 3; si no basta, 2).
 * @typedef {{ variables: VariableSav[], n?: number, etiquetaArchivo?: string, documentos?: string[], fecha?: Date }} BaseSav
 * @typedef {{ comprimir?: boolean, granEndian?: boolean, producto?: string }} OpcionesSav  granEndian: solo para las pruebas del
 *   lector; producto: quién escribe, tras «@(#) SPSS DATA FILE - » en la cabecera (ASCII; «StatSim Pro» por omisión)
 * @typedef {{ bytes: Uint8Array, avisos: string[], nombres: Array<[string, string]> }} ResultadoSav
 *   nombres: [nombre original, nombre en el archivo] de cada variable que hubo que ajustar
 */

/** Un búfer de bytes que crece. */
class Bytes {
    /** @param {boolean} granEndian */
    constructor(granEndian) {
        this.buf = new Uint8Array(1 << 16);
        this.vista = new DataView(this.buf.buffer);
        this.n = 0;
        this.le = !granEndian;
    }
    /** @param {number} k */
    reservar(k) {
        if (this.n + k <= this.buf.length) return;
        let capacidad = this.buf.length * 2;
        while (capacidad < this.n + k) capacidad *= 2;
        const nuevo = new Uint8Array(capacidad);
        nuevo.set(this.buf.subarray(0, this.n));
        this.buf = nuevo;
        this.vista = new DataView(nuevo.buffer);
    }
    /** @param {number} v */
    i32(v) { this.reservar(4); this.vista.setInt32(this.n, v, this.le); this.n += 4; }
    /** @param {number} v */
    f64(v) { this.reservar(8); this.vista.setFloat64(this.n, v, this.le); this.n += 8; }
    /** @param {number} v */
    u8(v) { this.reservar(1); this.buf[this.n++] = v & 0xFF; }
    /** @param {Uint8Array} b */
    bytes(b) { this.reservar(b.length); this.buf.set(b, this.n); this.n += b.length; }
    /**
     * Unos bytes ajustados a `ancho`: recortados o completados con `relleno` (por omisión, espacios).
     * @param {Uint8Array} b @param {number} ancho @param {number} [relleno]
     */
    ajustado(b, ancho, relleno = 0x20) {
        this.reservar(ancho);
        const k = Math.min(b.length, ancho);
        this.buf.set(b.subarray(0, k), this.n);
        this.buf.fill(relleno, this.n + k, this.n + ancho);
        this.n += ancho;
    }
    resultado() { return this.buf.slice(0, this.n); }
}

/** Ocho espacios: un trozo de cadena vacío. */
const ESPACIOS = new Uint8Array(8).fill(0x20);

/**
 * El nombre recortado a `maximo` bytes de UTF-8 sin partir un carácter.
 * @param {string} texto @param {number} maximo
 */
function recortarNombre(texto, maximo) {
    const { bytes } = utf8Recortado(texto, maximo);
    return new TextDecoder().decode(bytes);
}

/**
 * Un nombre de variable válido para SPSS y distinto de los ya usados (sin distinguir mayúsculas).
 * (2026.12.29, revisión) Con un contador por nombre base (`siguientes`): repetir la búsqueda desde «_2» para cada variable
 * que comparte la base era cuadrático (6000 variables «Pregunta_N…» tardaban 28 s). Da los mismos nombres: los sufijos
 * ocupados nunca se liberan, así que el primero libre siempre está a partir del último que se dio.
 * @param {string} original
 * @param {Set<string>} usados  en mayúsculas
 * @param {Map<string, number>} [siguientes]  base en mayúsculas → el próximo sufijo que probar
 * @returns {string}
 */
function nombreValido(original, usados, siguientes = new Map()) {
    let n = String(original ?? '').normalize('NFC').trim().replace(/[^\p{L}\p{N}_.@#$]/gu, '_');
    if (!/^\p{L}/u.test(n)) n = 'V' + n;
    n = recortarNombre(n, 64).replace(/\.+$/, '');
    if (RESERVADAS.has(n.toUpperCase())) n += '_';
    const base = n, clave = base.toUpperCase();
    let k = siguientes.get(clave) || 2;
    while (usados.has(n.toUpperCase())) {
        const sufijo = '_' + k++;
        n = recortarNombre(base, 64 - sufijo.length).replace(/\.+$/, '') + sufijo;
    }
    if (n !== base) siguientes.set(clave, k);
    usados.add(n.toUpperCase());
    return n;
}

/**
 * El nombre corto (8 bytes) que va en el registro de la variable: el largo en mayúsculas y recortado, distinto de los
 * demás; el registro de nombres largos (7.13) los empareja.
 * (2026.12.29, revisión) Con un contador por nombre corto inicial, como nombreValido.
 * @param {string} largo
 * @param {Set<string>} usados
 * @param {Map<string, number>} [siguientes]
 */
function nombreCorto(largo, usados, siguientes = new Map()) {
    const mayus = largo.toUpperCase();
    const inicial = recortarNombre(mayus, 8);
    let n = inicial, k = siguientes.get(inicial) || 1;
    while (usados.has(n)) {
        const sufijo = '_' + (k++).toString(36).toUpperCase();
        n = recortarNombre(mayus, 8 - sufijo.length) + sufijo;
    }
    if (n !== inicial) siguientes.set(inicial, k);
    usados.add(n);
    return n;
}

/**
 * Los decimales del formato F: los menos (hasta 3) que representan exactamente todos los valores; si no basta, 2.
 * @param {ArrayLike<number | string | null | undefined>} valores
 */
function decimalesNecesarios(valores) {
    let d = 0;
    for (let i = 0; i < valores.length; i++) {
        const v = valores[i];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        while (d <= 3) {
            const escalado = v * 10 ** d;
            if (Math.abs(escalado - Math.round(escalado)) <= 1e-9 * Math.max(1, Math.abs(escalado))) break;
            d++;
        }
        if (d > 3) return 2;
    }
    return d;
}

/**
 * El ancho del formato F para unos valores con d decimales (entre 1 y 40).
 * @param {ArrayLike<number | string | null | undefined>} valores @param {number} d
 */
function anchoNumerico(valores, d) {
    let maximo = 0, negativo = false;
    for (let i = 0; i < valores.length; i++) {
        const v = valores[i];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        if (v < 0) negativo = true;
        const a = Math.abs(v);
        if (a > maximo) maximo = a;
    }
    // las cifras de la parte entera, sin logaritmos (log10 de una potencia de 10 puede quedarse una milésima corto)
    const enteros = maximo >= 1 ? (maximo < 1e21 ? String(Math.trunc(maximo)).length : 22) : 1;
    return Math.max(1, Math.min(40, enteros + (d > 0 ? d + 1 : 0) + (negativo ? 1 : 0)));
}

/**
 * El código de formato empaquetado (tipo << 16 | ancho << 8 | decimales).
 * @param {string} tipo @param {number} ancho @param {number} decimales
 */
const formato = (tipo, ancho, decimales) => (CODIGO_FORMATO[tipo] << 16) | (ancho << 8) | decimales;

/** Un código decimal escrito como texto: «3», «-1», «2.5» o «2,5» (no «», « », «0x10», «0b11» ni «1e3»). */
const CODIGO_DECIMAL = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

/**
 * Las etiquetas de valor como lista [valor, etiqueta]; para las numéricas, el valor como número (las claves de un objeto
 * llegan como texto). (2026.12.29, revisión) Solo códigos decimales: con Number(), «» y « » pasaban a 0, «0x10» a 16,
 * «0b11» a 3 y «1e3» a 1000. Se omiten, con aviso, los códigos que no lo son y los repetidos (queda la primera etiqueta).
 * @param {VariableSav['etiquetasValor']} entrada
 * @param {boolean} numerica
 * @param {string[]} [avisos]
 * @param {string} [nombre]  el de la variable, para los avisos
 * @returns {Array<[number | string, string]>}
 */
function etiquetasComoLista(entrada, numerica, avisos = [], nombre = '') {
    if (!entrada) return [];
    /** @type {Array<[number | string, string]>} */
    const pares = Array.isArray(entrada) ? entrada : Object.entries(entrada);
    /** @type {Array<[number | string, string]>} */
    const salida = [];
    const vistos = new Set();
    let noNumericas = 0, repetidas = 0;
    for (const [valor, etiqueta] of pares) {
        if (etiqueta === undefined || etiqueta === null) continue;
        /** @type {number | string} */
        let clave;
        if (numerica) {
            const t = typeof valor === 'string' ? valor.trim() : '';
            const x = typeof valor === 'number' ? valor : (CODIGO_DECIMAL.test(t) ? Number(t.replace(',', '.')) : NaN);
            if (!Number.isFinite(x)) { noNumericas++; continue; }
            clave = x;
        } else clave = String(valor).replace(/ +$/, '');   // SPSS completa con espacios: «A» y «A » son el mismo valor
        if (vistos.has(clave)) { repetidas++; continue; }
        vistos.add(clave);
        salida.push([numerica ? clave : String(valor), String(etiqueta)]);
    }
    if (noNumericas) avisos.push(`«${nombre}»: ${noNumericas} etiqueta(s) de valor con un código que no es un número se omiten`);
    if (repetidas) avisos.push(`«${nombre}»: ${repetidas} etiqueta(s) de valor repiten un código y se omiten (queda la primera)`);
    return salida;
}

/**
 * La fecha y la hora de creación como las guarda la cabecera: «dd mmm yy» y «hh:mm:ss».
 * @param {Date} d
 */
function marcaDeTiempo(d) {
    const meses = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dos = (/** @type {number} */ x) => String(x).padStart(2, '0');
    return { fecha: `${dos(d.getDate())} ${meses[d.getMonth()]} ${dos(d.getFullYear() % 100)}`, hora: `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}` };
}

/**
 * La compresión por bytes de SPSS: bloques de ocho códigos de un byte (1–251: el número entero código − sesgo; 253: los
 * ocho bytes siguientes, tal cual; 254: ocho espacios; 255: el perdido del sistema), cada bloque seguido de los datos
 * de sus códigos 253.
 */
class Compresor {
    /** @param {Bytes} salida @param {number} sesgo */
    constructor(salida, sesgo) {
        this.salida = salida;
        this.sesgo = sesgo;
        this.codigos = new Uint8Array(8);
        this.k = 0;
        this.pendientes = new Uint8Array(64);
        this.vistaPendientes = new DataView(this.pendientes.buffer);
        this.p = 0;
    }
    /** @param {number} codigo */
    codigo(codigo) {
        this.codigos[this.k++] = codigo;
        if (this.k === 8) this.vaciar();
    }
    /** @param {number} v */
    numero(v) {
        if (!Number.isFinite(v)) { this.codigo(255); return; }
        if (Number.isInteger(v) && v >= 1 - this.sesgo && v <= 251 - this.sesgo) { this.codigo(v + this.sesgo); return; }
        this.vistaPendientes.setFloat64(this.p, v, this.salida.le);
        this.p += 8;
        this.codigo(253);
    }
    /** Un trozo de 8 bytes de una cadena. @param {Uint8Array} trozo */
    trozo(trozo) {
        let espacios = true;
        for (let i = 0; i < 8; i++) if (trozo[i] !== 0x20) { espacios = false; break; }
        if (espacios) { this.codigo(254); return; }
        this.pendientes.set(trozo, this.p);
        this.p += 8;
        this.codigo(253);
    }
    vaciar() {
        if (!this.k) return;
        this.codigos.fill(0, this.k);   // el último bloque se completa con 0 (código «nada»)
        this.salida.bytes(this.codigos);
        this.salida.bytes(this.pendientes.subarray(0, this.p));
        this.k = 0;
        this.p = 0;
    }
}

/**
 * Escribe la base como archivo .sav.
 * @param {BaseSav} base
 * @param {OpcionesSav} [opciones]
 * @returns {ResultadoSav}
 */
export function escribirSav(base, opciones = {}) {
    const comprimir = opciones.comprimir !== false;
    const variables = base.variables || [];
    if (!variables.length) throw new Error('No hay variables que escribir en el archivo de SPSS');
    const n = Number.isInteger(base.n) ? /** @type {number} */ (base.n) : Math.max(...variables.map(v => (v.valores ? v.valores.length : 0)));
    /** @type {string[]} */
    const avisos = [];
    /** @type {Array<[string, string]>} */
    const renombradas = [];
    const usados = new Set(), cortosUsados = new Set(), siguientes = new Map(), siguientesCortos = new Map();

    // 1) El diccionario: nombres, tipos, anchos, formatos y etiquetas de cada variable.
    const dicc = variables.map((v, indice) => {
        const nombre = nombreValido(v.nombre, usados, siguientes);
        if (nombre !== v.nombre) renombradas.push([v.nombre, nombre]);
        const texto = v.tipo === 'texto';
        const valores = v.valores || [];
        /** @type {Uint8Array[] | null} */
        let cadenas = null;
        let ancho = 0;
        if (texto) {
            let recortes = 0;
            cadenas = new Array(n);
            for (let i = 0; i < n; i++) {
                const x = valores[i];
                const r = utf8Recortado(x === null || x === undefined ? '' : String(x), 255);
                if (r.recortado) recortes++;
                cadenas[i] = r.bytes;
                if (r.bytes.length > ancho) ancho = r.bytes.length;
            }
            ancho = Math.max(1, ancho);
            if (recortes) avisos.push(`«${nombre}»: ${recortes} valor(es) de más de 255 bytes, recortado(s)`);
        }
        const elementos = texto ? Math.ceil(ancho / 8) : 1;
        let fmt;
        if (texto) fmt = formato('A', ancho, 0);
        else if (v.fecha) fmt = formato('DATE', 11, 0);
        else {
            const d = Number.isInteger(v.decimales) ? Math.max(0, Math.min(16, /** @type {number} */ (v.decimales))) : decimalesNecesarios(valores);
            fmt = formato('F', Math.max(anchoNumerico(valores, d), d + 1), d);
        }
        const etiquetas = etiquetasComoLista(v.etiquetasValor, !texto, avisos, nombre);
        const etiquetasLargas = etiquetas.filter(([, e]) => utf8(e).length > 120).length;
        if (etiquetasLargas) avisos.push(`«${nombre}»: ${etiquetasLargas} etiqueta(s) de valor recortada(s) a 120 bytes`);
        const medida = v.medida && CODIGO_MEDIDA[v.medida] ? v.medida : (texto || etiquetas.length ? 'nominal' : 'escala');
        const etiqueta = v.etiqueta ? utf8Recortado(String(v.etiqueta), 256) : null;
        if (etiqueta && etiqueta.recortado) avisos.push(`«${nombre}»: etiqueta de variable recortada a 256 bytes`);
        return { indice, v, nombre, corto: nombreCorto(nombre, cortosUsados, siguientesCortos), texto, ancho, elementos, fmt, etiquetas, medida, etiqueta: etiqueta ? etiqueta.bytes : null, cadenas, valores };
    });
    let posicion = 0;
    const primerElemento = dicc.map(d => { const p = posicion; posicion += d.elementos; return p; });
    const elementosPorCaso = posicion;
    renombradas.forEach(([a, b]) => avisos.push(`«${a}» se llama «${b}» en el archivo (SPSS no admite el nombre original)`));

    const out = new Bytes(!!opciones.granEndian);

    // 2) La cabecera (176 bytes).
    out.bytes(utf8('$FL2'));
    out.ajustado(utf8('@(#) SPSS DATA FILE - ' + String(opciones.producto || 'StatSim Pro').replace(/[^\x20-\x7E]/g, '?')), 60);
    out.i32(2);                                 // layout_code: delata el orden de los bytes
    out.i32(elementosPorCaso);
    out.i32(comprimir ? 1 : 0);
    out.i32(0);                                 // sin variable de ponderación
    out.i32(n);
    out.f64(100);                               // sesgo de la compresión
    const marca = marcaDeTiempo(base.fecha instanceof Date ? base.fecha : new Date());
    out.ajustado(utf8(marca.fecha), 9);
    out.ajustado(utf8(marca.hora), 8);
    const etiquetaArchivo = utf8Recortado(base.etiquetaArchivo || '', 64);
    out.ajustado(etiquetaArchivo.bytes, 64);
    out.ajustado(new Uint8Array(0), 3, 0);

    // 3) Un registro por variable (y los de continuación de las cadenas de más de 8 bytes).
    for (const d of dicc) {
        out.i32(REGISTRO.VARIABLE);
        out.i32(d.texto ? d.ancho : 0);
        out.i32(d.etiqueta ? 1 : 0);
        out.i32(0);                             // sin valores perdidos declarados
        out.i32(d.fmt);
        out.i32(d.fmt);
        out.ajustado(utf8(d.corto), 8);
        if (d.etiqueta) {
            out.i32(d.etiqueta.length);
            out.ajustado(d.etiqueta, Math.ceil(d.etiqueta.length / 4) * 4);
        }
        for (let k = 1; k < d.elementos; k++) {
            out.i32(REGISTRO.VARIABLE); out.i32(-1); out.i32(0); out.i32(0); out.i32(0); out.i32(0);
            out.bytes(ESPACIOS);
        }
    }

    // 4) Las etiquetas de valor: las variables con el mismo conjunto comparten registro (3 + 4). Las cadenas de más de 8
    //    bytes van en el registro 7.21.
    /** @type {Map<string, number[]>} */
    const conjuntos = new Map();
    const largas = dicc.filter(d => d.texto && d.ancho > 8 && d.etiquetas.length);
    for (const d of dicc) {
        if (!d.etiquetas.length || (d.texto && d.ancho > 8)) continue;
        const clave = (d.texto ? 'T' : 'N') + JSON.stringify(d.etiquetas);
        const lista = conjuntos.get(clave);
        if (lista) lista.push(d.indice); else conjuntos.set(clave, [d.indice]);
    }
    for (const indices of conjuntos.values()) {
        const d0 = dicc[indices[0]];
        out.i32(REGISTRO.ETIQUETAS_VALOR);
        out.i32(d0.etiquetas.length);
        for (const [valor, etiqueta] of d0.etiquetas) {
            if (d0.texto) out.ajustado(utf8(String(valor)), 8);
            else out.f64(/** @type {number} */ (valor));
            const e = utf8Recortado(etiqueta, 120).bytes;
            out.u8(e.length);
            out.ajustado(e, Math.ceil((e.length + 1) / 8) * 8 - 1);
        }
        out.i32(REGISTRO.INDICES_ETIQUETAS);
        out.i32(indices.length);
        indices.forEach(i => out.i32(primerElemento[i] + 1));
    }

    // 5) Los documentos (registro 6): líneas de 80 bytes.
    const documentos = (base.documentos || []).filter(l => l !== undefined && l !== null);
    if (documentos.length) {
        out.i32(REGISTRO.DOCUMENTO);
        out.i32(documentos.length);
        documentos.forEach(l => out.ajustado(utf8Recortado(String(l), 80).bytes, 80));
    }

    // 6) Las extensiones: la máquina (7.3 y 7.4), la visualización y la medida (7.11), los nombres largos (7.13), la
    //    codificación (7.20) y las etiquetas de las cadenas largas (7.21).
    out.i32(REGISTRO.EXTENSION); out.i32(SUBTIPO.ENTEROS); out.i32(4); out.i32(8);
    [20, 0, 0, -1, 1, 1, opciones.granEndian ? 1 : 2, 65001].forEach(x => out.i32(x));
    out.i32(REGISTRO.EXTENSION); out.i32(SUBTIPO.REALES); out.i32(8); out.i32(3);
    out.f64(SYSMIS); out.f64(HIGHEST); out.f64(LOWEST);
    out.i32(REGISTRO.EXTENSION); out.i32(SUBTIPO.VISUALIZACION); out.i32(4); out.i32(3 * dicc.length);
    for (const d of dicc) {
        out.i32(CODIGO_MEDIDA[/** @type {MedidaSav} */ (d.medida)]);
        out.i32(d.texto ? Math.min(Math.max(d.ancho, 8), 40) : 8);
        out.i32(d.texto ? 0 : 1);               // cadenas a la izquierda, números a la derecha
    }
    const largos = utf8(dicc.map(d => `${d.corto}=${d.nombre}`).join('\t'));
    out.i32(REGISTRO.EXTENSION); out.i32(SUBTIPO.NOMBRES_LARGOS); out.i32(1); out.i32(largos.length);
    out.bytes(largos);
    const codificacion = utf8('UTF-8');
    out.i32(REGISTRO.EXTENSION); out.i32(SUBTIPO.CODIFICACION); out.i32(1); out.i32(codificacion.length);
    out.bytes(codificacion);
    if (largas.length) {
        const r = new Bytes(!!opciones.granEndian);
        for (const d of largas) {
            const nombre = utf8(d.nombre);
            r.i32(nombre.length); r.bytes(nombre);
            r.i32(d.ancho); r.i32(d.etiquetas.length);
            for (const [valor, etiqueta] of d.etiquetas) {
                r.i32(d.ancho); r.ajustado(utf8Recortado(String(valor), d.ancho).bytes, d.ancho);
                const e = utf8Recortado(etiqueta, 120).bytes;
                r.i32(e.length); r.bytes(e);
            }
        }
        const cuerpo = r.resultado();
        out.i32(REGISTRO.EXTENSION); out.i32(SUBTIPO.ETIQUETAS_CADENA_LARGA); out.i32(1); out.i32(cuerpo.length);
        out.bytes(cuerpo);
    }
    out.i32(REGISTRO.FIN); out.i32(0);

    // 7) Los casos.
    const compresor = comprimir ? new Compresor(out, 100) : null;
    const trozo = new Uint8Array(8);
    /** @type {Map<string, number>} */
    const extremos = new Map();
    for (let i = 0; i < n; i++) {
        for (const d of dicc) {
            if (d.texto) {
                const b = /** @type {Uint8Array[]} */ (d.cadenas)[i];
                for (let k = 0; k < d.elementos; k++) {
                    trozo.fill(0x20);
                    trozo.set(b.subarray(k * 8, Math.min(b.length, k * 8 + 8)));
                    if (compresor) compresor.trozo(trozo); else out.bytes(trozo);
                }
                continue;
            }
            const crudo = d.valores[i];
            let x = typeof crudo === 'number' ? crudo : (crudo === null || crudo === undefined || crudo === '' ? NaN : Number(crudo));
            // (2026.12.29, revisión) ±DBL_MAX y LOWEST son los números reservados de SPSS (el perdido del sistema y los
            // extremos de los rangos): ReadStat y SPSS los leen como perdidos, así que se escriben como tales, con aviso
            if (x === HIGHEST || x === LOWEST || x === SYSMIS) { x = NaN; extremos.set(d.nombre, (extremos.get(d.nombre) || 0) + 1); }
            if (d.v.fecha && Number.isFinite(x)) x = diasASegundos(x);
            if (compresor) compresor.numero(x);
            else out.f64(Number.isFinite(x) ? x : SYSMIS);
        }
    }
    if (compresor) compresor.vaciar();
    extremos.forEach((k, nombre) => avisos.push(`«${nombre}»: ${k} valor(es) iguales a ±1.797693e308, los números que SPSS reserva para los perdidos, se escribieron como perdidos`));
    return { bytes: out.resultado(), avisos, nombres: renombradas };
}
