// @ts-check
// analizador/sem-diagrama.js — (2027.01.12, revisión) El diagrama de rutas del SEM: dónde va cada variable, por dónde va cada
// flecha y su SVG (sem-ui.js, diagramaSVG, le da el modelo y los coeficientes ya escritos). Hasta la 2027.01.11 los
// indicadores de todas las latentes iban en una sola fila a lo ancho del diagrama, 110 de ancho cada uno (1980 en el caso
// estructural de los ejemplos: en el papel y en el Word, sus nombres quedaban de unos 3 puntos); una ruta entre latentes que
// no son vecinas (el efecto directo de una mediación) pasaba por debajo de la del medio, que tapaba su coeficiente; y las
// flechas acababan en el centro de cada variable, con la punta debajo de ella. Ahora los indicadores de cada latente van
// juntos, con el ancho de su nombre; con muchos, las latentes en dos filas (las de arriba con sus indicadores encima, las de
// abajo con los suyos debajo: una mediación, en triángulo) o, con una sola latente, sus indicadores repartidos por encima y
// por debajo de ella, de modo que el diagrama quepa a lo ancho de una página con sus nombres legibles; un modelo de rutas sin
// latentes, en una fila o por columnas (las exógenas a la izquierda y cada variable a la derecha de sus predictores); una ruta
// que atravesaría otra variable se curva; las flechas acaban en el borde; y los coeficientes se pintan encima de todo, sin
// caer sobre otra flecha. Con la letra de los gráficos (Arial), en la pantalla y en el Word (la imagen, sin ella, tomaba la del
// navegador). Sin DOM.
// (2027.01.13, revisión) Con nombres de 13 a 15 letras, o con muchos indicadores, ninguna de esas disposiciones cabía (con
// ítems como «Apoyo_familia_1», el caso estructural medía 1408 de ancho: en el Word, sus nombres de 3,8 puntos). Ahora también
// en columna: las latentes una debajo de otra con sus indicadores al lado, en una columna o en dos frente a frente; y de todas
// se elige, antes que nada, la que deja la letra más grande en la página del Word (a lo ancho y a lo alto de ella). Los
// anchos, los de Arial letra a letra (con 7,2 px por letra, «WWMMW1» se salía de su caja). Una covarianza entre dos variables
// vecinas, curvada por fuera (su coeficiente caía sobre sus nombres); dos rutas entre las mismas dos variables (un modelo no
// recursivo), curvadas una hacia cada lado (iban una encima de la otra, con un coeficiente sobre el otro); los coeficientes,
// apartados de donde se cruzan dos flechas (allí quedaba uno encima del otro); y con un modelo grande se trazan menos
// disposiciones (con 20 factores correlacionados, el diagrama tardaba más que el ajuste).

import { escaparHTML } from '../shared/html.js';
import { media } from '../core/stats/descriptivos.js';

/**
 * Los anchos de las letras de Arial (los de Helvetica y Liberation Sans, la que pone el navegador en Linux, son los mismos), en
 * milésimas del tamaño de la letra, normal y en negrita: con ellos se miden las cajas, las elipses y los coeficientes.
 * (2027.01.13, revisión) Hasta la 2027.01.12, 7,2 px por letra a 12 px (7,8 en negrita): un nombre en mayúsculas anchas
 * («WWMMW1», de 61 px) se salía de su caja, de 56, y uno en minúsculas («Apoyo_familia_1», de 89) la tenía de 120.
 */
const ARIAL = anchos(
    [' !"#$%&\'()*+,-./', [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278]],
    ['0123456789:;<=>?@', [556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015]],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', [667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611]],
    ['[\\]^_`', [278, 278, 278, 469, 556, 333]],
    ['abcdefghijklmnopqrstuvwxyz', [556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500]],
    ['{|}~↔−·¿¡ºª', [334, 260, 334, 584, 1000, 584, 278, 611, 333, 365, 370]]);
const ARIAL_NEGRITA = anchos(
    [' !"#$%&\'()*+,-./', [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278]],
    ['0123456789:;<=>?@', [556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975]],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', [722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611]],
    ['[\\]^_`', [333, 278, 333, 584, 556, 333]],
    ['abcdefghijklmnopqrstuvwxyz', [556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500]],
    ['{|}~↔−·¿¡ºª', [389, 280, 389, 584, 1000, 584, 278, 611, 333, 365, 370]]);
/** Lo que mide, en milésimas, una letra que no está en la tabla (como una mayúscula ancha). */
const LETRA_DESCONOCIDA = 667;
/** El tamaño de los textos del diagrama (px). */
const LETRA = 12;

/** El alto de la caja de una variable observada, y lo que separa dos cajas, dos bloques y el diagrama de su borde. */
const ALTO_CAJA = 30;
const SEPARACION = 6;
const ENTRE_BLOQUES = 36;
const BORDE = 20;
/** El alto de la elipse de una latente. */
const ALTO_ELIPSE = 48;
/** Entre dos observadas que no son indicadores (las de las regresiones): la flecha entre ellas y su coeficiente. */
const ENTRE_OTRAS = 84;
/** Las filas: los indicadores de arriba, las latentes (las de arriba, si van en dos filas) y las demás observadas. */
const Y_INDICADORES = 40;
const Y_LATENTES = 170;
const Y_OBSERVADAS = 290;
/** De una latente a sus indicadores (por encima o por debajo de ella). */
const A_LOS_INDICADORES = Y_LATENTES - Y_INDICADORES;
/**
 * Con las latentes en dos filas, de una fila a la otra: con rutas entre ellas (regresiones o covarianzas), sin ellas (solo
 * cargas: un análisis factorial confirmatorio) y con las observadas que no son indicadores en medio.
 */
const ENTRE_FILAS = 130;
const ENTRE_FILAS_SIN_RUTAS = 90;
const ENTRE_FILAS_CON_OTRAS = 200;
/** Un modelo de rutas por columnas: entre dos columnas, y de una variable a la de debajo en su columna. */
const ENTRE_COLUMNAS = 130;
const EN_LA_COLUMNA = 74;
/**
 * (2027.01.13) Las latentes en columna: sus indicadores, en cajas de 26 de alto a 30 una de otra; entre el bloque de una latente
 * y el de la siguiente; del borde de las cajas al de la elipse más ancha de su columna; y de una columna de latentes a lo que
 * tenga al lado (la otra columna, o las variables del medio): el sitio de las curvas entre latentes de la misma columna. Entre
 * dos variables del medio, una de otra.
 */
const ALTO_CAJA_EN_COLUMNA = 26;
const PASO_EN_COLUMNA = 30;
const ENTRE_BLOQUES_EN_COLUMNA = 24;
const A_LAS_CARGAS = 100;
const JUNTO_A_LA_COLUMNA = 150;
const ENTRE_LAS_DEL_MEDIO = 40;
/**
 * Lo que se curva una ruta que atravesaría otra variable (se prueba en este orden, hacia un lado y después hacia el otro), y
 * una de dos rutas entre las mismas variables (una hacia cada lado: poco, salvo que algo lo impida).
 */
const CURVAS = [70, 100, 140, 190, 250, 320, 400];
const CURVAS_DE_UNA_PAREJA = [40, 60, 90, 130, 180, 250];
/**
 * Dónde puede ir el coeficiente de una flecha, en orden de preferencia (la fracción de su recorrido): el de una carga, de la
 * latente a su indicador, lo más cerca de él que deje libre su punta (en trazar: `cerca`; y antes de llegar a la mitad, estos
 * otros); el de una recta, en medio; y el de una curva, en su vértice. Si ahí cae sobre otro coeficiente, sobre una variable o
 * sobre otra flecha, en el siguiente que esté libre. (2027.01.14, revisión) Hasta la 2027.01.13, el de una carga en filas iba
 * al 0,86 de ella: con la punta de su tamaño (11,2 de largo), tapaba hasta el 46 % de ella.
 */
const SITIOS_DE_UNA_CARGA = [0.5, 0.68, 0.32, 0.6, 0.42, 0.25];
const SITIOS_DE_UNA_RECTA = [0.5, 0.35, 0.65, 0.42, 0.58, 0.25, 0.75, 0.2, 0.8];
const SITIOS_DE_UNA_CURVA = [0.5, 0.35, 0.65, 0.42, 0.58, 0.25, 0.75, 0.2, 0.8];
/**
 * (2027.01.13) El de una carga curvada para llegar de frente a su indicador (en columna, de lado; en filas, desde abajo o desde
 * arriba): lo más cerca de él que deje libre su punta.
 */
const SITIOS_DE_UNA_CARGA_CURVADA = [0.92, 0.88, 0.84, 0.8, 0.76, 0.72, 0.66, 0.6, 0.5];
/** Lo que se aparta una muestra de la siguiente al recorrer una flecha (para ver si pasa por una variable o un coeficiente). */
const PASO = 4;
/** (2027.01.14, revisión) El lado de las celdas en que trazar anota lo ya trazado, para buscar lo que tapa un coeficiente. */
const CELDA = 64;
/**
 * (2027.01.14, revisión) El trazo de las flechas y su punta: el marcador (un triángulo de MARCADOR_LARGO por 2 ×
 * MARCADOR_MEDIO_ANCHO, con la punta en su extremo) va a la escala del grosor del trazo (`markerUnits` por omisión): mide 11,2
 * de largo y 8,4 de ancho. Hasta la 2027.01.13 se miraba si un coeficiente la tapaba en tres puntos de su eje, a 2, 5 y 8 del
 * final: los coeficientes de las cargas tapaban hasta el 46 % de ella.
 */
const GROSOR = 1.4;
const MARCADOR_LARGO = 8;
const MARCADOR_MEDIO_ANCHO = 3;
const LARGO_DE_LA_PUNTA = MARCADOR_LARGO * GROSOR;
const MEDIO_ANCHO_DE_LA_PUNTA = MARCADOR_MEDIO_ANCHO * GROSOR;
/** El ancho mínimo del diagrama, y el que guarda en la pantalla de un teléfono (se desplaza dentro de su recuadro). */
const ANCHO_MINIMO = 640;
const ANCHO_EN_UN_TELEFONO = 560;
/**
 * (2027.01.13, revisión) La figura del Word: como mucho, a lo ancho de la página (600) y a este alto (el de la página, sin el
 * número de la figura, su título y su nota); un diagrama más grande va más pequeño, y su letra, de 12 px, con él.
 */
export const ANCHO_EN_LA_PAGINA = 600;
export const ALTO_EN_LA_PAGINA = 680;
/**
 * Hasta este ancho (y su alto), una disposición se lee como otra más pequeña (en el Word, sus nombres de 8 puntos o más), y de
 * ellas se elige la más baja; más grande, la que deja la letra más grande. Ya trazadas, cada punto que le falte a su letra para
 * llegar a PUNTOS_LEGIBLES cuenta como PESO_DE_LA_LETRA cosas montadas.
 */
const ANCHO_COMODO = 660;
const PUNTOS_LEGIBLES = 8;
const PESO_DE_LA_LETRA = 2;
/** En la pantalla, como mucho a este tanto de su tamaño (más, a lo ancho de un recuadro grande, quedaba enorme). */
const CRECE_EN_LA_PANTALLA = 1.25;
/**
 * Las latentes en dos filas (o en dos columnas): todos los repartos hasta tantas latentes; con más, unos pocos. Cuántas
 * disposiciones se trazan, y (2027.01.13, revisión) cuántas menos con muchas rutas: trazar una cuesta como el cuadrado de sus
 * rutas (con 24 factores correlacionados, 348 rutas, se trazaban 24 en 4,3 s, más que el ajuste del modelo).
 */
const LATENTES_PARA_PROBAR_TODO = 6;
const LATENTES_COMO_MUCHO = 24;
const DISPOSICIONES_A_TRAZAR = 24;
const TRABAJO_COMO_MUCHO = 100000;

/**
 * @typedef {{ x: number, y: number }} Punto
 * @typedef {{ x: number, y: number, w: number, h: number }} Caja un rectángulo, por su centro
 * @typedef {{ x0: number, y0: number, x1: number, y1: number }} Limites un rectángulo, por sus lados
 * @typedef {{ nombre: string, x: number, y: number, w: number, h: number, forma: 'caja' | 'elipse' }} Nodo
 * @typedef {{ de: string, a: string, tipo: 'carga' | 'regresion' | 'covarianza', texto: string }} Ruta
 * @typedef {{ l: Limites, ps: Punto[] }} Trozo unos puntos seguidos de un trazo, con sus límites
 * @typedef {Ruta & { d: string, curva: boolean, desde: Punto, hasta: Punto, control: Punto | null, puntos: Punto[], limites: Limites, trozos: Trozo[], etiqueta: Caja }} Flecha
 * @typedef {{ ancho: number, alto: number, nodos: Record<string, Nodo>, flechas: Flecha[] }} Disposicion
 * @typedef {{ F: string, encima: string[], debajo: string[] }} Bloque una latente y sus indicadores, por encima y por debajo de ella
 * @typedef {{ F: string, inds: string[] }} Latente una latente y sus indicadores (observados)
 * @typedef {{ nombre: string, latente: boolean }} DelMedio una variable que no es indicador ni latente con indicadores
 * @typedef {{ tipo: 'filas', arriba: Bloque[], abajo: Bloque[], alLado?: boolean }} PlanEnFilas las latentes de la fila de arriba
 *   y las de la de abajo (vacía: una sola fila; sin latentes, las observadas en una fila); `alLado`: una sola latente, con sus
 *   indicadores encima y debajo, y las demás observadas a sus lados
 * @typedef {{ tipo: 'columnas', columnas: string[][] }} PlanPorColumnas sin latentes, las observadas por columnas
 * @typedef {{ tipo: 'columna', izquierda: Latente[], derecha: Latente[], medio: DelMedio[] }} PlanEnColumna (2027.01.13) las
 *   latentes en una columna con sus indicadores a la izquierda y, si hay otra, frente a ella con los suyos a la derecha; entre
 *   las dos (o a la derecha de la única), las demás variables
 * @typedef {PlanEnFilas | PlanPorColumnas | PlanEnColumna} Plan
 * @typedef {(A: Nodo, B: Nodo) => number} Lado hacia dónde se curva primero una ruta de A a B (control)
 * @typedef {{ ancho: number, nodos: Record<string, Nodo>, lado: Lado, cargasDeLado: boolean }} Colocacion las variables de un
 *   plan colocadas; `cargasDeLado`: una carga llega a su indicador por el lado (en columna), no por arriba o por abajo
 */

/** Una tabla de anchos de letras. @param {...[string, number[]]} grupos @returns {Readonly<Record<string, number>>} */
function anchos(...grupos) {
    return Object.freeze(Object.fromEntries(grupos.flatMap(([letras, ws]) => [...letras].map((c, i) => [c, ws[i]]))));
}

/**
 * El ancho de un texto a 12 px en Arial (una letra acentuada, como la suya sin acento; una que no está en la tabla, como una
 * mayúscula ancha).
 * @param {string} texto @param {boolean} [negrita]
 */
export function anchoDeTexto(texto, negrita = false) {
    const tabla = negrita ? ARIAL_NEGRITA : ARIAL;
    let s = 0;
    for (const c of String(texto)) s += tabla[c] ?? tabla[c.normalize('NFD').charAt(0)] ?? LETRA_DESCONOCIDA;
    return s * LETRA / 1000;
}

/** El ancho de la caja de una variable observada: el de su nombre, con margen. @param {string} nombre */
export const anchoDeCaja = nombre => Math.max(36, Math.ceil(anchoDeTexto(nombre)) + 12);
/** Los ejes de la elipse de una latente: el de su nombre en negrita, con margen. @param {string} nombre */
export const ejesDeElipse = nombre => ({ w: Math.max(92, Math.ceil(anchoDeTexto(nombre, true)) + 32), h: ALTO_ELIPSE });

/** La escala de un diagrama en la página del Word: a lo ancho y a lo alto de ella, sin agrandarlo. @param {number} ancho @param {number} alto */
export const escalaEnLaPagina = (ancho, alto) => Math.min(1, ANCHO_EN_LA_PAGINA / ancho, ALTO_EN_LA_PAGINA / alto);
/** El tamaño de su figura en el Word. @param {{ ancho: number, alto: number }} tamano */
export function tamanoEnLaPagina({ ancho, alto }) {
    const e = escalaEnLaPagina(ancho, alto);
    return { w: Math.round(ancho * e), h: Math.round(alto * e) };
}
/** Hasta qué escala una disposición se lee como otra más pequeña (ANCHO_COMODO). */
const ESCALA_COMODA = ANCHO_EN_LA_PAGINA / ANCHO_COMODO;

/** ¿Está el punto dentro del nodo (con un margen)? @param {Nodo} n @param {number} x @param {number} y @param {number} [holgura] */
export function dentroDe(n, x, y, holgura = 0) {
    const a = n.w / 2 + holgura, b = n.h / 2 + holgura;
    if (n.forma === 'caja') return Math.abs(x - n.x) <= a && Math.abs(y - n.y) <= b;
    return ((x - n.x) / a) ** 2 + ((y - n.y) / b) ** 2 <= 1;
}

/** El punto del borde de un nodo en la dirección (dx, dy) desde su centro. @param {Nodo} n @param {number} dx @param {number} dy */
function borde(n, dx, dy) {
    const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    let t;
    if (n.forma === 'caja') t = Math.min(ux ? (n.w / 2) / Math.abs(ux) : Infinity, uy ? (n.h / 2) / Math.abs(uy) : Infinity);
    else t = 1 / Math.sqrt((ux / (n.w / 2)) ** 2 + (uy / (n.h / 2)) ** 2);
    return { x: n.x + ux * t, y: n.y + uy * t };
}

/** El punto t (de 0 a 1) de una curva cuadrática (o de una recta, sin control). @param {Punto} p0 @param {Punto | null} c @param {Punto} p2 @param {number} t */
function punto(p0, c, p2, t) {
    if (!c) return { x: p0.x + (p2.x - p0.x) * t, y: p0.y + (p2.y - p0.y) * t };
    return { x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * c.x + t * t * p2.x, y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * c.y + t * t * p2.y };
}

/**
 * Los puntos de una curva cuadrática (o de una recta, sin control): n + 1, o (sin n) uno cada PASO como mucho (en una curva,
 * con su mayor velocidad: el doble del tramo más largo de su polígono de control, en sus extremos).
 * @param {Punto} p0 @param {Punto | null} c @param {Punto} p2 @param {number} [n]
 * @returns {Punto[]}
 */
function muestras(p0, c, p2, n) {
    const largo = c ? 2 * Math.max(Math.hypot(c.x - p0.x, c.y - p0.y), Math.hypot(p2.x - c.x, p2.y - c.y)) : Math.hypot(p2.x - p0.x, p2.y - p0.y);
    const k = n || Math.max(48, Math.ceil(largo / PASO));
    const out = [];
    for (let i = 0; i <= k; i++) out.push(punto(p0, c, p2, i / k));
    return out;
}

/** Los límites de unos puntos. @param {Punto[]} ps @returns {Limites} */
function limitesDe(ps) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of ps) {
        if (p.x < x0) x0 = p.x;
        if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.y > y1) y1 = p.y;
    }
    return { x0, y0, x1, y1 };
}
/** ¿Toca un rectángulo (por su centro, con un margen) unos límites? @param {Limites} l @param {Caja} e @param {number} [holgura] */
const toca = (l, e, holgura = 0) => e.x + e.w / 2 + holgura >= l.x0 && e.x - e.w / 2 - holgura <= l.x1 && e.y + e.h / 2 + holgura >= l.y0 && e.y - e.h / 2 - holgura <= l.y1;
/** Los límites de una caja (de su centro y su tamaño). @param {Caja} e @returns {Limites} */
const limitesDeCaja = e => ({ x0: e.x - e.w / 2, y0: e.y - e.h / 2, x1: e.x + e.w / 2, y1: e.y + e.h / 2 });

/**
 * (2027.01.14, revisión) Una rejilla de celdas de CELDA de lado, para buscar deprisa lo que hay cerca de un rectángulo: cada
 * cosa se anota en las celdas que tocan sus rectángulos (los que hagan falta), y `cerca` da las de las celdas que tocan unos
 * rectángulos, cada una una vez, en el orden de sus celdas. Da de más (lo de una celda que el rectángulo toca solo en parte),
 * nunca de menos: quien la usa mira después si de verdad se tocan. Con un lado enorme, una sola celda: lo da todo (las pruebas
 * comprueban así que la rejilla no cambia nada).
 * @template T
 */
class Rejilla {
    /** @param {number} [lado] el de sus celdas */
    constructor(lado = CELDA) {
        this.lado = lado;
        /** @type {T[]} */
        this.cosas = [];
        /** @type {Map<number, number[]>} los números de las cosas de cada celda */
        this.celdas = new Map();
        /** @type {number[]} la última búsqueda que dio cada cosa (para no darla dos veces en una) */
        this.vista = [];
        this.sello = 0;
    }
    /** El número de una celda. @param {number} i @param {number} j */
    static celda(i, j) { return (i + 4096) * 8192 + (j + 4096); }
    /** Una cosa más (aún en ninguna celda): su número. @param {T} cosa */
    nueva(cosa) { this.cosas.push(cosa); return this.cosas.length - 1; }
    /** Anota la cosa k en las celdas de un rectángulo (una vez en cada una). @param {number} k @param {Limites} l */
    anotar(k, { x0, y0, x1, y1 }) {
        const L = this.lado;
        for (let i = Math.floor(x0 / L); i <= Math.floor(x1 / L); i++) {
            for (let j = Math.floor(y0 / L); j <= Math.floor(y1 / L); j++) {
                const c = Rejilla.celda(i, j), l = this.celdas.get(c);
                if (!l) this.celdas.set(c, [k]); else if (l[l.length - 1] !== k) l.push(k);
            }
        }
    }
    /** Las cosas de las celdas que tocan unos rectángulos (cada una, una vez). @param {Limites[]} ls @returns {T[]} */
    cerca(ls) {
        const sello = ++this.sello, L = this.lado;
        /** @type {T[]} */
        const out = [];
        for (const { x0, y0, x1, y1 } of ls) {
            for (let i = Math.floor(x0 / L); i <= Math.floor(x1 / L); i++) {
                for (let j = Math.floor(y0 / L); j <= Math.floor(y1 / L); j++) {
                    const l = this.celdas.get(Rejilla.celda(i, j));
                    if (l) for (const k of l) if (this.vista[k] !== sello) { this.vista[k] = sello; out.push(this.cosas[k]); }
                }
            }
        }
        return out;
    }
}
/** ¿Se tocan dos límites? @param {Limites} a @param {Limites} b */
const seTocan = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
/**
 * Un trazo en trozos de 12 puntos seguidos, cada uno con sus límites: para ver si pasa por un coeficiente se miran solo los
 * puntos de los trozos que lo tocan (en un modelo grande, mirarlos todos era lo que más tardaba).
 * @param {Punto[]} ps @returns {Trozo[]}
 */
function trozosDe(ps) {
    const out = [];
    for (let i = 0; i < ps.length; i += 12) { const t = ps.slice(i, i + 13); out.push({ l: limitesDe(t), ps: t }); }
    return out;
}
/**
 * ¿Pasa un trazo (en trozos) por el fondo de un coeficiente? Tramo a tramo, entre cada dos de sus puntos (2027.01.14, revisión:
 * hasta la 2027.01.13 se miraban solo sus puntos, uno cada PASO, y una flecha que cruzaba la esquina de un coeficiente entre dos
 * de ellos no contaba).
 * @param {Trozo[]} trozos @param {Caja} e
 */
const pasaPor = (trozos, e) => trozos.some(t => toca(t.l, e) && t.ps.some((p, i) => i > 0 && cortaLoEscrito(t.ps[i - 1], p, e)));

/** El tamaño del coeficiente de una flecha (12 px). @param {string} texto */
const tamanoDeEtiqueta = texto => ({ w: Math.ceil(anchoDeTexto(texto)) + 8, h: 16 });

/** Las cajas de dos nodos o etiquetas, ¿se solapan? @param {Caja} a @param {Caja} b */
const solapan = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
/**
 * Lo que una flecha puede entrar en el fondo blanco de un coeficiente sin que cuente (2027.01.14, revisión: hasta la 2027.01.13,
 * 2: las que entraban de 1,8 a 2,7 quedaban cortadas bajo él).
 */
const ROCE_CON_UN_COEFICIENTE = 0.5;
/**
 * ¿Corta el tramo pq el fondo de un coeficiente (su caja, sin ROCE_CON_UN_COEFICIENTE de cada lado), en más que un punto?
 * (recorte de Liang y Barsky)
 * @param {Punto} p @param {Punto} q @param {Caja} e
 */
function cortaLoEscrito(p, q, e) {
    const dx = q.x - p.x, dy = q.y - p.y, m = ROCE_CON_UN_COEFICIENTE;
    const x0 = e.x - e.w / 2 + m, x1 = e.x + e.w / 2 - m, y0 = e.y - e.h / 2 + m, y1 = e.y + e.h / 2 - m;
    // (sin el tramo entero a un lado de la caja, no la corta; y sin crear nada: se llama muchísimas veces)
    if ((p.x < x0 && q.x < x0) || (p.x > x1 && q.x > x1) || (p.y < y0 && q.y < y0) || (p.y > y1 && q.y > y1)) return false;
    let t0 = 0, t1 = 1;
    /** Recorta [t0, t1] con un lado: a·t ≤ b. @param {number} a @param {number} b */
    const lado = (a, b) => {
        if (a === 0) return b >= 0;
        const t = b / a;
        if (a < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
        return true;
    };
    return lado(-dx, p.x - x0) && lado(dx, x1 - p.x) && lado(-dy, p.y - y0) && lado(dy, y1 - p.y) && t0 < t1;
}
/** El sentido del giro de a a b a c (−1, 0 o 1). @param {Punto} a @param {Punto} b @param {Punto} c */
const giro = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
/** ¿Se cortan los tramos ab y cd (no en sus extremos)? @param {Punto} a @param {Punto} b @param {Punto} c @param {Punto} d */
const cortan = (a, b, c, d) => giro(a, b, c) * giro(a, b, d) < 0 && giro(c, d, a) * giro(c, d, b) < 0;
/** Un trazo en 24 tramos como mucho (sus puntos, uno de cada tantos, y el último). @param {Punto[]} ps */
const tramos = ps => { const paso = Math.max(1, Math.ceil((ps.length - 1) / 24)); return ps.filter((_, i) => i % paso === 0 || i === ps.length - 1); };
/** ¿Se cruzan dos trazos (en tramos)? (sin crear nada: se llama muchísimas veces) @param {Punto[]} P @param {Punto[]} Q */
const seCruzan = (P, Q) => {
    for (let k = 1; k < P.length; k++) for (let m = 1; m < Q.length; m++) if (cortan(P[k - 1], P[k], Q[m - 1], Q[m])) return true;
    return false;
};
/** ¿Comparten variable dos rutas? @param {Ruta} a @param {Ruta} b */
const vecinas = (a, b) => [a.de, a.a].some(v => v === b.de || v === b.a);
/** Las dos variables de una ruta, sin su sentido. @param {Ruta} r */
const pareja = r => [r.de, r.a].sort().join('\u0000');

/**
 * La punta de una flecha o, al principio, la otra punta de una covarianza: puntos de su triángulo (de LARGO_DE_LA_PUNTA por 2 ×
 * MEDIO_ANCHO_DE_LA_PUNTA, en la dirección del trazo en su extremo), en su eje y a sus lados, de su extremo a su base.
 * @param {Punto[]} ps @param {boolean} alPrincipio
 * @returns {Punto[]}
 */
function puntaDe(ps, alPrincipio) {
    const fin = alPrincipio ? ps[0] : ps[ps.length - 1];
    // la dirección del trazo en su extremo: hacia el primer punto a 1 o más de él
    const orden = alPrincipio ? ps : [...ps].reverse();
    const otro = orden.find(p => Math.hypot(p.x - fin.x, p.y - fin.y) >= 1) || orden[orden.length - 1];
    const l = Math.hypot(otro.x - fin.x, otro.y - fin.y) || 1, ux = (otro.x - fin.x) / l, uy = (otro.y - fin.y) / l;
    /** @type {Punto[]} */
    const out = [];
    for (const d of [0.5, 2.5, 4.5, 6.5, 8.5, 10, LARGO_DE_LA_PUNTA]) {
        const m = MEDIO_ANCHO_DE_LA_PUNTA * d / LARGO_DE_LA_PUNTA;
        for (const lado of [-1, -0.5, 0, 0.5, 1]) out.push({ x: fin.x + ux * d - uy * m * lado, y: fin.y + uy * d + ux * m * lado });
    }
    return out;
}
/** ¿Cae el punto en el fondo blanco de un coeficiente? @param {Caja} e @param {Punto} p */
const dentroDelFondo = (e, p) => Math.abs(p.x - e.x) < e.w / 2 && Math.abs(p.y - e.y) < e.h / 2;
/**
 * ¿Tapa el coeficiente la punta de su flecha (o, en una covarianza, alguna de las dos)? (Lejos de su extremo, no: sin calcular
 * sus puntos; se pregunta muchísimas veces.)
 * @param {Caja} e @param {{ tipo: Ruta['tipo'], puntos: Punto[] }} f
 */
function tapaLaPunta(e, f) {
    /** @param {Punto} p */
    const cerca = p => Math.abs(p.x - e.x) < e.w / 2 + LARGO_DE_LA_PUNTA && Math.abs(p.y - e.y) < e.h / 2 + LARGO_DE_LA_PUNTA;
    if (cerca(f.puntos[f.puntos.length - 1]) && puntaDe(f.puntos, false).some(p => dentroDelFondo(e, p))) return true;
    return f.tipo === 'covarianza' && cerca(f.puntos[0]) && puntaDe(f.puntos, true).some(p => dentroDelFondo(e, p));
}

/** Lo que ocupa una fila de cajas, con su separación. @param {string[]} nombres */
const anchoDeCajas = nombres => nombres.reduce((s, v) => s + anchoDeCaja(v), 0) + SEPARACION * Math.max(0, nombres.length - 1);
/** Lo que ocupa una latente con sus indicadores. @param {Bloque} b */
const anchoDeBloque = b => Math.max(anchoDeCajas(b.encima), anchoDeCajas(b.debajo), ejesDeElipse(b.F).w + 20);
/** Lo que ocupa una fila de latentes. @param {Bloque[]} fila */
const anchoDeFila = fila => fila.reduce((s, b) => s + anchoDeBloque(b), 0) + ENTRE_BLOQUES * Math.max(0, fila.length - 1);
/** Lo que ocupa la fila de las demás observadas. @param {string[]} otras */
const anchoDeOtras = otras => otras.reduce((s, v) => s + anchoDeCaja(v), 0) + ENTRE_OTRAS * Math.max(0, otras.length - 1);
/** Lo que ocupan unas columnas de observadas. @param {string[][]} columnas */
const anchoDeColumnas = columnas => columnas.reduce((s, c) => s + Math.max(...c.map(anchoDeCaja)), 0) + ENTRE_COLUMNAS * Math.max(0, columnas.length - 1);

/** Una fila de cajas centrada en x, a la altura y. @param {Record<string, Nodo>} nodos @param {string[]} nombres @param {number} centro @param {number} y */
function colocarCajas(nodos, nombres, centro, y) {
    let x = centro - anchoDeCajas(nombres) / 2;
    for (const v of nombres) {
        const w = anchoDeCaja(v);
        nodos[v] = { nombre: v, x: x + w / 2, y, w, h: ALTO_CAJA, forma: 'caja' };
        x += w + SEPARACION;
    }
}

/**
 * Hacia dónde se curva primero una ruta en una disposición en filas o por columnas: una más ancha que alta, hacia abajo, salvo
 * entre latentes de la fila de abajo (hacia arriba: entre las dos filas); una más alta que ancha, hacia fuera.
 * @param {number | null} yAbajo la fila de abajo, si hay dos @param {number} ancho
 * @returns {Lado}
 */
const ladoEnFilas = (yAbajo, ancho) => (A, B) => {
    if (Math.abs(B.x - A.x) >= Math.abs(B.y - A.y)) {
        const enLaDeAbajo = yAbajo !== null && A.forma === 'elipse' && B.forma === 'elipse' && Math.abs(A.y - yAbajo) < 1 && Math.abs(B.y - yAbajo) < 1;
        return enLaDeAbajo ? -1 : 1;
    }
    return (A.x + B.x) / 2 >= ancho / 2 ? 1 : -1;
};

/**
 * Las variables de un plan: en filas, cada fila de latentes centrada en el ancho, con sus indicadores encima o debajo, y las
 * demás observadas en una fila (debajo de la única de latentes; entre las dos, si hay dos; o, sin latentes, arriba); sin
 * latentes, por columnas (cada columna centrada en el alto de la más larga); o en columna (colocarEnColumna). `conRutas`: si
 * hay más que cargas (las dos filas, más separadas: sus flechas y sus coeficientes van entre ellas).
 * @param {Plan} plan @param {string[]} otras @param {boolean} conRutas @param {Ruta[]} rutas
 * @returns {Colocacion}
 */
function colocar(plan, otras, conRutas, rutas) {
    if (plan.tipo === 'columna') return colocarEnColumna(plan, rutas);
    /** @type {Record<string, Nodo>} */
    const nodos = {};
    if (plan.tipo === 'columnas') {
        const filas = Math.max(...plan.columnas.map(c => c.length));
        const ancho = Math.ceil(Math.max(ANCHO_MINIMO, 2 * BORDE + anchoDeColumnas(plan.columnas)));
        let x = (ancho - anchoDeColumnas(plan.columnas)) / 2;
        for (const col of plan.columnas) {
            const w = Math.max(...col.map(anchoDeCaja)), y0 = Y_INDICADORES + (filas - col.length) * EN_LA_COLUMNA / 2;
            col.forEach((v, i) => { nodos[v] = { nombre: v, x: x + w / 2, y: y0 + i * EN_LA_COLUMNA, w: anchoDeCaja(v), h: ALTO_CAJA, forma: 'caja' }; });
            x += w + ENTRE_COLUMNAS;
        }
        return { ancho, nodos, lado: ladoEnFilas(null, ancho), cargasDeLado: false };
    }
    if (plan.alLado) return colocarAlLado(plan.arriba[0], otras);
    const dosFilas = plan.abajo.length > 0;
    const yArriba = Y_LATENTES, yAbajo = yArriba + (otras.length ? ENTRE_FILAS_CON_OTRAS : conRutas ? ENTRE_FILAS : ENTRE_FILAS_SIN_RUTAS);
    const yOtras = !plan.arriba.length ? Y_INDICADORES : dosFilas ? (yArriba + yAbajo) / 2 : Y_OBSERVADAS;
    const ancho = Math.ceil(Math.max(ANCHO_MINIMO, 2 * BORDE + Math.max(anchoDeFila(plan.arriba), anchoDeFila(plan.abajo), anchoDeOtras(otras))));
    for (const [fila, y] of /** @type {Array<[Bloque[], number]>} */ ([[plan.arriba, yArriba], [plan.abajo, yAbajo]])) {
        let x0 = (ancho - anchoDeFila(fila)) / 2;
        for (const b of fila) {
            const w = anchoDeBloque(b), centro = x0 + w / 2, e = ejesDeElipse(b.F);
            nodos[b.F] = { nombre: b.F, x: centro, y, w: e.w, h: e.h, forma: 'elipse' };
            colocarCajas(nodos, b.encima, centro, y - A_LOS_INDICADORES);
            colocarCajas(nodos, b.debajo, centro, y + A_LOS_INDICADORES);
            x0 += w + ENTRE_BLOQUES;
        }
    }
    let xo = (ancho - anchoDeOtras(otras)) / 2;
    for (const v of otras) {
        const w = anchoDeCaja(v);
        nodos[v] = { nombre: v, x: xo + w / 2, y: yOtras, w, h: ALTO_CAJA, forma: 'caja' };
        xo += w + ENTRE_OTRAS;
    }
    return { ancho, nodos, lado: ladoEnFilas(dosFilas ? yAbajo : null, ancho), cargasDeLado: false };
}

/**
 * (2027.01.13, revisión) Una sola latente con sus indicadores repartidos por encima y por debajo de ella, y las demás observadas
 * en su fila, a su derecha y a su izquierda (una y una): hasta la 2027.01.12, con una covariable, sus 18 indicadores iban en una
 * fila de 820 de ancho (en el Word, de 6,6 puntos).
 * @param {Bloque} b @param {string[]} otras
 * @returns {Colocacion}
 */
function colocarAlLado(b, otras) {
    /** @type {Record<string, Nodo>} */
    const nodos = {};
    const e = ejesDeElipse(b.F), derecha = otras.filter((_, i) => i % 2 === 0), izquierda = otras.filter((_, i) => i % 2 === 1);
    /** @param {string[]} vs */
    const deUnLado = vs => (vs.length ? e.w / 2 + ENTRE_OTRAS + anchoDeOtras(vs) : 0);
    const ancho = Math.ceil(Math.max(ANCHO_MINIMO, 2 * BORDE + Math.max(anchoDeBloque(b), 2 * deUnLado(derecha), 2 * deUnLado(izquierda))));
    const centro = ancho / 2;
    nodos[b.F] = { nombre: b.F, x: centro, y: Y_LATENTES, w: e.w, h: e.h, forma: 'elipse' };
    colocarCajas(nodos, b.encima, centro, Y_LATENTES - A_LOS_INDICADORES);
    colocarCajas(nodos, b.debajo, centro, Y_LATENTES + A_LOS_INDICADORES);
    for (const [vs, signo] of /** @type {Array<[string[], number]>} */ ([[derecha, 1], [izquierda, -1]])) {
        let x = centro + signo * (e.w / 2 + ENTRE_OTRAS);
        for (const v of vs) {
            const w = anchoDeCaja(v);
            nodos[v] = { nombre: v, x: x + signo * w / 2, y: Y_LATENTES, w, h: ALTO_CAJA, forma: 'caja' };
            x += signo * (w + ENTRE_OTRAS);
        }
    }
    return { ancho, nodos, lado: ladoEnFilas(null, ancho), cargasDeLado: false };
}

/**
 * (2027.01.13, revisión) Las variables de un plan en columna: las latentes de la izquierda una debajo de otra, cada una a media
 * altura de sus indicadores, que van a su izquierda uno debajo de otro; las de la derecha, igual, con los suyos a la derecha;
 * las dos columnas, centradas en el alto de la más larga; y entre ellas (o a la derecha de la única), las demás variables,
 * cada una a la altura media de las latentes con que se une (sin unirse a ninguna, debajo de las demás), sin montarse. Una
 * ruta entre dos latentes de la misma columna se curva primero hacia dentro (hacia la otra).
 * @param {PlanEnColumna} plan @param {Ruta[]} rutas
 * @returns {Colocacion}
 */
function colocarEnColumna({ izquierda, derecha, medio }, rutas) {
    /** @type {Record<string, Nodo>} */
    const nodos = {};
    /** @param {number} n */
    const altoDeCajas = n => n * PASO_EN_COLUMNA - (PASO_EN_COLUMNA - ALTO_CAJA_EN_COLUMNA);
    /** @param {Latente} l */
    const altoDeBloque = l => Math.max(ALTO_ELIPSE, altoDeCajas(l.inds.length));
    /** @param {Latente[]} ls */
    const altoDeColumna = ls => ls.reduce((s, l) => s + altoDeBloque(l), 0) + ENTRE_BLOQUES_EN_COLUMNA * Math.max(0, ls.length - 1);
    /** @param {Latente[]} ls */
    const anchoDeIndicadores = ls => Math.max(0, ...ls.flatMap(l => l.inds.map(anchoDeCaja)));
    /** @param {Latente[]} ls */
    const anchoDeElipses = ls => Math.max(0, ...ls.map(l => ejesDeElipse(l.F).w));
    /** @param {DelMedio} m */
    const tamano = m => (m.latente ? ejesDeElipse(m.nombre) : { w: anchoDeCaja(m.nombre), h: ALTO_CAJA_EN_COLUMNA });
    // a lo ancho: los indicadores de la izquierda (pegados a su borde derecho), sus latentes, las del medio, las latentes de la
    // derecha y sus indicadores (pegados a su borde izquierdo)
    const eI = anchoDeElipses(izquierda), eD = anchoDeElipses(derecha), wM = Math.max(0, ...medio.map(m => tamano(m).w));
    const bordeIzquierdo = BORDE + anchoDeIndicadores(izquierda), xIzquierda = bordeIzquierdo + A_LAS_CARGAS + eI / 2;
    let x = xIzquierda + eI / 2;
    const xMedio = medio.length ? x + JUNTO_A_LA_COLUMNA + wM / 2 : null;
    if (xMedio !== null) x = xMedio + wM / 2;
    const xDerecha = derecha.length ? x + JUNTO_A_LA_COLUMNA + eD / 2 : null;
    const bordeDerecho = xDerecha !== null ? xDerecha + eD / 2 + A_LAS_CARGAS : null;
    if (bordeDerecho !== null) x = bordeDerecho + anchoDeIndicadores(derecha);
    const usado = x + BORDE, ancho = Math.ceil(Math.max(ANCHO_MINIMO, usado)), dx = (ancho - usado) / 2;
    // a lo alto: cada columna centrada en el alto de la más larga
    const alto = Math.max(altoDeColumna(izquierda), altoDeColumna(derecha));
    /** @param {Latente[]} ls @param {number} xl @param {number} xb @param {number} lado de qué lado van los indicadores (−1, a la izquierda) */
    const columna = (ls, xl, xb, lado) => {
        let y = Y_INDICADORES - ALTO_CAJA_EN_COLUMNA / 2 + (alto - altoDeColumna(ls)) / 2;
        for (const l of ls) {
            const h = altoDeBloque(l), cy = y + h / 2, e = ejesDeElipse(l.F), y0 = cy - altoDeCajas(l.inds.length) / 2 + ALTO_CAJA_EN_COLUMNA / 2;
            nodos[l.F] = { nombre: l.F, x: xl + dx, y: cy, w: e.w, h: e.h, forma: 'elipse' };
            l.inds.forEach((v, i) => {
                const w = anchoDeCaja(v);
                nodos[v] = { nombre: v, x: xb + lado * w / 2 + dx, y: y0 + i * PASO_EN_COLUMNA, w, h: ALTO_CAJA_EN_COLUMNA, forma: 'caja' };
            });
            y += h + ENTRE_BLOQUES_EN_COLUMNA;
        }
    };
    columna(izquierda, xIzquierda, bordeIzquierdo, -1);
    if (xDerecha !== null && bordeDerecho !== null) columna(derecha, xDerecha, bordeDerecho, 1);
    if (xMedio !== null) {
        // cada una, a la altura media de las variables ya colocadas con que se une; sin ninguna, debajo de las demás
        const objetivos = medio.map((m, i) => {
            const ys = rutas.filter(r => r.de === m.nombre || r.a === m.nombre).map(r => nodos[r.de === m.nombre ? r.a : r.de]).filter(Boolean).map(n => n.y);
            return { m, i, y: ys.length ? media(ys) : Infinity };
        }).sort((a, b) => a.y - b.y || a.i - b.i);
        let previa = null;
        for (const o of objetivos) {
            const t = tamano(o.m);
            const minima = previa ? previa.y + (previa.h + t.h) / 2 + ENTRE_LAS_DEL_MEDIO : -Infinity;
            const y = Math.max(Number.isFinite(o.y) ? o.y : Y_INDICADORES + alto / 2, minima);
            nodos[o.m.nombre] = { nombre: o.m.nombre, x: xMedio + dx, y, w: t.w, h: t.h, forma: o.m.latente ? 'elipse' : 'caja' };
            previa = { y, h: t.h };
        }
    }
    // (las curvas entre latentes de una misma columna, hacia la otra; una ruta más ancha que alta, hacia abajo)
    const centro = xMedio !== null ? xMedio + dx : xDerecha !== null ? (xIzquierda + xDerecha) / 2 + dx : Infinity;
    /** @type {Lado} */
    const lado = (A, B) => (Math.abs(B.x - A.x) >= Math.abs(B.y - A.y) ? 1 : (A.x + B.x) / 2 <= centro ? 1 : -1);
    return { ancho, nodos, lado, cargasDeLado: true };
}

/**
 * El control de la curva de A a B: en la perpendicular por su punto medio, a `s` de él, hacia el lado `lado` (+1: abajo, en una
 * ruta más ancha que alta; a la derecha, en una más alta que ancha; −1, al contrario).
 * @param {Nodo} A @param {Nodo} B @param {number} lado @param {number} s
 * @returns {Punto}
 */
function control(A, B, lado, s) {
    const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const signo = (Math.abs(dx) >= Math.abs(dy) ? Math.sign(ny) : Math.sign(nx)) || 1;
    return { x: (A.x + B.x) / 2 + lado * signo * nx * s, y: (A.y + B.y) / 2 + lado * signo * ny * s };
}

/**
 * Las flechas entre las variables ya colocadas, en el orden de las rutas (las cargas, primero): de borde a borde; una carga, al
 * centro del lado de su indicador que mira a la latente (en filas, el de arriba o el de abajo); y curvada, una ruta que
 * atravesaría otra variable, una (que no sea una carga) cuyo coeficiente no cabe en la recta (entre dos variables vecinas) y
 * cada una de dos rutas entre las mismas variables (una hacia cada lado). De las curvas que no pasan por otra variable ni por un
 * coeficiente ya puesto, y con el suyo libre de variables, coeficientes y flechas, la que menos flechas ya puestas cruza, y a
 * igualdad la primera hacia donde suele haber sitio (`lado`; entre dos indicadores, por fuera de sus latentes) y la menos
 * honda; si ninguna se libra, la que atraviesa menos variables. El coeficiente, en el primero de sus sitios que esté libre
 * (SITIOS_DE_UNA_CARGA, SITIOS_DE_UNA_RECTA, SITIOS_DE_UNA_CURVA); y ya con todas las flechas, uno que ha quedado sobre una
 * flecha trazada después, sobre otro coeficiente o sobre la punta de su flecha, a otro de sus sitios libre de todo.
 * @param {Record<string, Nodo>} nodos @param {Ruta[]} rutas @param {{ lado: Lado, cargasDeLado: boolean, celda: number }} opciones
 * (`celda`: el lado de las celdas de sus rejillas)
 * @returns {Flecha[]}
 */
function trazar(nodos, rutas, { lado, cargasDeLado, celda }) {
    /** @type {Flecha[]} */
    const flechas = [];
    /** @type {Map<Flecha, Punto[]>} los sitios de cada coeficiente, en orden de preferencia */
    const sitiosDe = new Map();
    const todos = Object.values(nodos);
    // (2027.01.14, revisión) Lo ya trazado, en dos rejillas (Rejilla): cada variable, en las celdas que toca su caja; cada
    // flecha, en las que tocan los trozos de su trazo (los de 12 puntos, no el rectángulo de la flecha entera: el de una
    // covarianza larga y curva cubre medio diagrama) y los sitios de su coeficiente (con su tamaño). Lo que puede tapar un
    // coeficiente o atravesar una curva se busca solo en las celdas que tocan (costeDe, choca, atraviesa): con muchas
    // covarianzas, mirar todas las flechas y todas las variables en cada sitio de cada coeficiente era lo que más tardaba.
    /** @type {Rejilla<Nodo>} */
    const variables = new Rejilla(celda);
    for (const n of todos) variables.anotar(variables.nueva(n), limitesDeCaja(n));
    /** @type {Rejilla<Flecha>} */
    const trazadas = new Rejilla(celda);
    /** ¿Se monta la caja con alguna variable? @param {Caja} e */
    const sobreUnaVariable = e => variables.cerca([limitesDeCaja(e)]).some(n => solapan(e, n));
    /** @type {Punto[][]} los tramos de cada flecha (los de flechas[k], en tramosDeLas[k]) */
    const tramosDeLas = [];
    /** @type {Map<string, string[]>} las latentes de cada indicador */
    const latentesDe = new Map();
    for (const r of rutas) if (r.tipo === 'carga' && nodos[r.a] && nodos[r.a].forma === 'caja') latentesDe.set(r.a, [...(latentesDe.get(r.a) || []), r.de]);
    /** @type {Map<string, number>} cuántas rutas (que no son cargas) unen cada pareja de variables */
    const enLaPareja = new Map();
    for (const r of rutas) if (r.tipo !== 'carga') enLaPareja.set(pareja(r), (enLaPareja.get(pareja(r)) || 0) + 1);
    /** @type {Map<string, number>} hacia dónde se curvó la primera ruta de una pareja */
    const ladoDeLaPareja = new Map();
    /**
     * Adónde llega una carga a su indicador (una caja): al centro del lado que mira a la latente (en columna, el de al lado; en
     * filas, el de arriba o el de abajo) o, si le llegan dos o más (una carga cruzada), a uno de los puntos de ese lado
     * repartidos en el orden de sus latentes (a lo alto en columna, a lo ancho en filas).
     * @param {Nodo} A la latente @param {Nodo} B el indicador
     * @returns {Punto}
     */
    const llegadaDe = (A, B) => {
        const suyas = (latentesDe.get(B.nombre) || []).map(F => nodos[F]).filter(Boolean).sort((m, n) => (cargasDeLado ? m.y - n.y || m.x - n.x : m.x - n.x || m.y - n.y));
        const k = suyas.length, i = suyas.indexOf(A);
        const paso = k > 1 ? (cargasDeLado ? Math.min(12, (B.h - 6) / (k - 1)) : Math.min(16, (B.w - 8) / (k - 1))) : 0;
        const d = i >= 0 ? (i - (k - 1) / 2) * paso : 0;
        return cargasDeLado ? { x: B.x + Math.sign(A.x - B.x) * B.w / 2, y: B.y + d } : { x: B.x + d, y: B.y + (B.y < A.y ? 1 : -1) * B.h / 2 };
    };
    /**
     * Hacia dónde se curva primero una ruta: entre dos indicadores, por fuera de sus latentes (una covarianza entre dos de una
     * fila de arriba, por encima de ella); si no, `lado`.
     * @param {Nodo} A @param {Nodo} B
     */
    const ladoPreferido = (A, B) => {
        const suyas = [...(latentesDe.get(A.nombre) || []), ...(latentesDe.get(B.nombre) || [])].map(F => nodos[F]).filter(Boolean);
        if (!latentesDe.has(A.nombre) || !latentesDe.has(B.nombre) || !suyas.length) return lado(A, B);
        const m = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, k = control(A, B, 1, 1);
        const cx = media(suyas.map(n => n.x)), cy = media(suyas.map(n => n.y));
        return (cx - m.x) * (k.x - m.x) + (cy - m.y) * (k.y - m.y) > 0 ? -1 : 1;
    };
    for (const r of rutas) {
        const A = nodos[r.de], B = nodos[r.a];
        if (!A || !B || A === B) continue;
        const tam = tamanoDeEtiqueta(r.texto);
        // una carga llega a su indicador por el centro del lado que mira a la latente (desde el centro, la línea a uno del
        // extremo de una fila larga entraba por un lado y rozaba antes la caja vecina); (2027.01.14, revisión) con dos o más
        // (una carga cruzada), cada una a un punto de ese lado, en el orden de sus latentes: llegaban las dos al mismo, una
        // punta sobre la otra, y la cruzada pasaba por el coeficiente de la otra, junto a la caja
        const llegada = r.tipo === 'carga' && B.forma === 'caja' ? llegadaDe(A, B) : null;
        // el de una carga recta, lo más cerca de su indicador que deje libre su punta y su caja (de punto en punto, desde el final;
        // en columna, hasta la 2027.01.13, a 12 de la caja; en filas, al 0,86 de la carga, sobre casi la mitad de su punta)
        const hastaLlegada = llegada ? Math.hypot(llegada.x - A.x, llegada.y - A.y) || 1 : 1;
        let cerca = 0.5;
        if (llegada) {
            const recta = { tipo: r.tipo, puntos: muestras(borde(A, llegada.x - A.x, llegada.y - A.y), null, llegada) };
            for (let d = LARGO_DE_LA_PUNTA; d < hastaLlegada / 2; d++) {
                const e = { ...punto(A, null, llegada, 1 - d / hastaLlegada), ...tam };
                if (!solapan(e, B) && !tapaLaPunta(e, recta)) { cerca = 1 - d / hastaLlegada; break; }
            }
        }
        // (y si ahí no cabe, los de siempre, antes de llegar a él: en medio de la carga, algo más cerca o más lejos. Escalonarlos
        // —uno o dos coeficientes más allá— no mejoraba nada en 111 modelos, y en uno los dejaba algo peor: no se escalonan)
        const deUnaCarga = [cerca, ...SITIOS_DE_UNA_CARGA.filter(t => t < cerca)];
        /** Los sitios de su coeficiente con la recta, o con la curva de control c. @param {Punto | null} c */
        const sitios = c => (c ? SITIOS_DE_UNA_CURVA.map(t => punto(A, c, B, t))
            : (llegada ? deUnaCarga : SITIOS_DE_UNA_RECTA).map(t => punto(A, null, llegada || B, t)));
        /**
         * Las otras variables por las que pasa la línea (hasta donde llega: en una carga, al lado de su indicador) o la curva;
         * con `alguna`, si pasa por alguna (1 o 0: deja de mirar en la primera); `holgura`, lo que se aparta de ellas; y
         * `extremos`, de dónde a dónde va la que se dibuja (sin ellos, del centro de una variable al de la otra o, la línea de
         * una carga, al lado de su indicador).
         * @param {Punto | null} c @param {boolean} [alguna] @param {number} [holgura] @param {[Punto, Punto] | null} [extremos]
         */
        const atraviesa = (c, alguna = false, holgura = 4, extremos = null) => {
            const [p0, p2] = extremos || [A, c ? B : llegada || B];
            const trozos = trozosDe(muestras(p0, c, p2).filter(p => !dentroDe(A, p.x, p.y) && !dentroDe(B, p.x, p.y)));
            /** @type {Set<Nodo>} */
            const pasadas = new Set();
            const h = Math.max(0, holgura);
            for (const t of trozos) {
                for (const m of variables.cerca([{ x0: t.l.x0 - h, y0: t.l.y0 - h, x1: t.l.x1 + h, y1: t.l.y1 + h }])) {
                    if (m === A || m === B || pasadas.has(m)) continue;
                    if (toca(t.l, m, holgura) && t.ps.some(p => dentroDe(m, p.x, p.y, holgura))) { pasadas.add(m); if (alguna) return 1; }
                }
            }
            return pasadas.size;
        };
        /**
         * ¿Pasa la curva por otra variable o por un coeficiente? ¿Cae el suyo sobre algo, o (2027.01.14, revisión) sobre una de
         * sus propias puntas? Entre dos indicadores contiguos de una columna, la primera curva cuyo coeficiente no tocaba las cajas
         * dejaba debajo de él la mitad de la curva y parte de sus puntas: ahora, una más honda.
         * @param {Punto} c
         */
        const choca = c => {
            if (atraviesa(c, true)) return true;
            const trozos = trozosDe(muestras(A, c, B));
            const e = { ...punto(A, c, B, 0.5), ...tam };
            const ini = borde(A, c.x - A.x, c.y - A.y), fin = borde(B, c.x - B.x, c.y - B.y);
            /** (sus puntas, solo si el coeficiente queda cerca de un extremo) @param {Punto} p */
            const cerca = p => Math.abs(p.x - e.x) < e.w / 2 + LARGO_DE_LA_PUNTA && Math.abs(p.y - e.y) < e.h / 2 + LARGO_DE_LA_PUNTA;
            if ((cerca(fin) || (r.tipo === 'covarianza' && cerca(ini))) && tapaLaPunta(e, { tipo: r.tipo, puntos: muestras(ini, c, fin) })) return true;
            return sobreUnaVariable(e) || trazadas.cerca([limitesDeCaja(e), ...trozos.map(t => t.l)]).some(f => solapan(e, f.etiqueta) || pasaPor(trozos, f.etiqueta) || pasaPor(f.trozos, e));
        };
        // (2027.01.13, revisión) dos rutas entre las mismas variables (un modelo no recursivo) iban una encima de la otra: si
        // no hay nada entre ellas, se curvan poco, una hacia cada lado (con algo en medio, se curvan como las demás, sin caer una
        // sobre la otra ni sobre su coeficiente); y una ruta cuyo coeficiente no cabe en la recta (entre dos cajas vecinas, a 6
        // una de otra) lo dejaba sobre sus nombres
        // (una carga, solo si pasa por dentro de otra variable: las de una fila larga pasan a ras de las cajas vecinas)
        const cruzaAlgo = atraviesa(null, true, r.tipo === 'carga' ? -1 : 4) > 0;
        const enPareja = r.tipo !== 'carga' && !cruzaAlgo && (enLaPareja.get(pareja(r)) || 0) > 1;
        // (2027.01.14, revisión) tampoco cabe si en todos sus sitios tapa una de sus puntas: entre el último indicador de una latente
        // y el primero de la siguiente, en columna (a 24), la covarianza iba recta, con el 67 % de su trazo y sus dos puntas debajo
        // de su coeficiente
        const recta = r.tipo === 'carga' ? null : { tipo: r.tipo, puntos: muestras(borde(A, B.x - A.x, B.y - A.y), null, borde(B, A.x - B.x, A.y - B.y)) };
        const sinSitio = recta !== null && sitios(null).every(q => { const e = { ...q, ...tam }; return sobreUnaVariable(e) || tapaLaPunta(e, recta); });
        /** @type {Punto | null} */
        let c = null;
        if (enPareja || sinSitio || cruzaAlgo) {
            const otra = enPareja ? ladoDeLaPareja.get(pareja(r)) : undefined;
            const primero = otra !== undefined ? -otra : ladoPreferido(A, B);
            const lados = otra !== undefined ? [primero] : [primero, -primero], curvas = enPareja ? CURVAS_DE_UNA_PAREJA : CURVAS;
            const ajenas = flechas.flatMap((f, k) => (vecinas(f, r) ? [] : [{ ps: tramosDeLas[k], l: f.limites }]));
            /** @type {{ c: Punto | null, n: number, l: number } | null} */
            let mejor = null;
            busca: for (const l of lados) {
                for (const s of curvas) {
                    const k = control(A, B, l, s);
                    if (choca(k)) continue;
                    const ps = tramos(muestras(A, k, B)), lk = limitesDe(ps), n = ajenas.filter(q => seTocan(lk, q.l) && seCruzan(ps, q.ps)).length;
                    if (!mejor || n < mejor.n) mejor = { c: k, n, l };
                    if (!n) break busca;
                }
            }
            // si ninguna curva se libra, la que (o la recta, si puede ir recta) atraviesa menos variables
            if (!mejor) {
                const opciones = [...(enPareja || sinSitio ? [] : [{ c: null, l: 0 }]), ...lados.flatMap(l => curvas.map(s => ({ c: control(A, B, l, s), l })))];
                const cuantas = opciones.map(o => atraviesa(o.c));
                mejor = { ...opciones[cuantas.indexOf(Math.min(...cuantas))], n: 0 };
            }
            c = mejor.c;
            if (enPareja && otra === undefined) ladoDeLaPareja.set(pareja(r), mejor.l);
        }
        // (en columna, una carga a un indicador más alto o más bajo que su latente, curvada para llegar a él de lado, a lo
        // ancho: recta, con muchos indicadores, quedaba empinada, y su coeficiente, junto a la caja, a la altura de la vecina; si
        // esa curva pasara por otra variable o a menos de 4 de ella, como las demás curvas (como la de una carga cruzada a un
        // indicador de otra latente, por la elipse de esa latente), se queda recta. (2027.01.15, revisión) La curva que se mide
        // es la que se dibuja: de su borde al lado de su indicador. Hasta la 2027.01.14 se medía la que va al centro de su caja,
        // que cerca de ella pasa a 2–4 de la vecina: con la holgura de 4 (la 2027.01.14; la 2027.01.13, 2), en una columna
        // larga de nombres medios las cargas de los extremos se quedaban rectas, cruzaban las de sus vecinos y la disposición
        // en columna se perdía (una escala de 21 ítems «Ansiedad_1»…, de 8,4 a 5,7 puntos en el Word; dos de 20, de 7,1 a 2,6).
        // En 588 modelos corrientes, frente a la 2027.01.13, la letra ya no baja 1,5 puntos en ninguno.)
        // (2027.01.14, revisión) Y en filas, una carga tan inclinada que su coeficiente, junto a la caja de su indicador, quedaría
        // más allá de la mitad del hueco con la de al lado, frente a ella (en un abanico de muchos indicadores), curvada para
        // llegarle de frente, en vertical: su coeficiente, debajo (o encima) de él. Hasta la 2027.01.13, con dos latentes de 15
        // indicadores, 14 quedaban frente al vecino.
        let curvada = false;
        if (!c && llegada) {
            const junto = punto(A, null, llegada, cerca);
            const k = cargasDeLado
                ? (Math.abs(llegada.y - A.y) > 1 ? { x: llegada.x + Math.sign(A.x - llegada.x) * 0.45 * Math.abs(A.x - llegada.x), y: llegada.y } : null)
                : (Math.abs(junto.x - B.x) > (B.w + SEPARACION) / 2 ? { x: llegada.x, y: llegada.y + Math.sign(A.y - llegada.y) * 0.45 * Math.abs(A.y - llegada.y) } : null);
            if (k && !atraviesa(k, true, 4, [borde(A, k.x - A.x, k.y - A.y), llegada])) { c = k; curvada = true; }
        }
        const desde = c ? borde(A, c.x - A.x, c.y - A.y) : llegada ? borde(A, llegada.x - A.x, llegada.y - A.y) : borde(A, B.x - A.x, B.y - A.y);
        const hasta = curvada && llegada ? llegada : c ? borde(B, c.x - B.x, c.y - B.y) : llegada || borde(B, A.x - B.x, A.y - B.y);
        // (la carga de un factor de segundo orden en otro, como una ruta: en medio)
        const puntos = muestras(desde, c, hasta), suyos = curvada ? SITIOS_DE_UNA_CARGA_CURVADA.map(t => punto(desde, c, hasta, t)) : sitios(c);
        /** @type {Flecha} */
        const f = { ...r, d: '', curva: !!c, desde, hasta, control: c, puntos, limites: limitesDe(puntos), trozos: trozosDe(puntos), etiqueta: { ...suyos[0], ...tam } };
        const p = elMenosMalo(suyos, f, tam).sitio;
        Object.assign(f.etiqueta, { x: p.x, y: p.y });
        flechas.push(f);
        tramosDeLas.push(tramos(puntos));
        sitiosDe.set(f, suyos);
        // (en la rejilla, por los trozos de su trazo y por todos los sitios de su coeficiente: al recolocarlo, va a uno de ellos)
        const k = trazadas.nueva(f), mx = tam.w / 2 + 1, my = tam.h / 2 + 1;
        for (const t of f.trozos) trazadas.anotar(k, t.l);
        for (const q of suyos) trazadas.anotar(k, { x0: q.x - mx, y0: q.y - my, x1: q.x + mx, y1: q.y + my });
    }
    // (2027.01.12) ya con todas las flechas: un coeficiente que cruza una flecha trazada después (una regresión a un indicador
    // pasa junto al de su carga), a otro de sus sitios que esté libre de todo. (2027.01.13, revisión) Hasta tres vueltas, y
    // también uno que quedó sobre otro: dos rectas que se cruzan en su medio dejaban sus coeficientes uno encima del otro
    // (2027.01.14, revisión) Sin ninguno libre, al que menos tapa (costeDe); hasta la 2027.01.13, al primero de sus sitios,
    // tapara lo que tapara: con muchas covarianzas, coeficientes uno encima de otro donde había otro sitio que solo rozaba una
    // flecha.
    for (let vuelta = 0; vuelta < 3; vuelta++) {
        let movidos = 0;
        for (const f of flechas) {
            const e = f.etiqueta, ahora = costeDe(e, f);
            if (!ahora) continue;
            const { sitio, coste } = elMenosMalo(/** @type {Punto[]} */ (sitiosDe.get(f)), f, e, ahora);
            if (coste < ahora) { Object.assign(e, { x: sitio.x, y: sitio.y }); movidos++; }
        }
        if (!movidos) break;
    }
    return flechas;

    /**
     * Lo que tapa el coeficiente de una flecha en ese sitio: 0, nada (ni una variable, ni otro coeficiente, ni el trazo de otra
     * flecha, ni la punta de la suya); si no, más cuanto peor (una variable, mucho más que otro coeficiente, y este más que su
     * punta o que el trazo de otra flecha). Deja de contar al llegar a `tope` (el de un sitio mejor ya visto).
     * @param {Caja} e @param {Flecha} propia @param {number} [tope]
     */
    function costeDe(e, propia, tope = Infinity) {
        let n = 0;
        if (sobreUnaVariable(e) && (n += 100) >= tope) return n;
        if (tapaLaPunta(e, propia) && (n += 5) >= tope) return n;
        for (const f of trazadas.cerca([limitesDeCaja(e)])) {
            if (f === propia) continue;
            if (solapan(e, f.etiqueta)) n += 20;
            else if (toca(f.limites, e) && pasaPor(f.trozos, e)) n += 1;
            if (n >= tope) return n;
        }
        return n;
    }
    /**
     * De unos sitios (en orden de preferencia), el primero que no tapa nada o, sin ninguno, el que menos tapa (de los que tapan
     * menos que `tope`, el del sitio en que ya está).
     * @param {Punto[]} sitios @param {Flecha} propia @param {{ w: number, h: number }} tam @param {number} [tope]
     * @returns {{ sitio: Punto, coste: number }}
     */
    function elMenosMalo(sitios, propia, tam, tope = Infinity) {
        /** @param {Punto} q */
        const caja = q => ({ x: q.x, y: q.y, w: tam.w, h: tam.h });
        // el primero libre (deja de mirar cada uno en lo primero que tapa); si no hay ninguno, el que menos tapa
        for (const q of sitios) if (!costeDe(caja(q), propia, 1)) return { sitio: q, coste: 0 };
        let mejor = { sitio: sitios[0], coste: tope };
        for (const q of sitios) {
            const coste = costeDe(caja(q), propia, mejor.coste);
            if (coste < mejor.coste) mejor = { sitio: q, coste };
        }
        return mejor;
    }
}

/** El trazo SVG de una flecha. @param {Flecha} f */
const trazo = f => (f.control
    ? `M${f.desde.x.toFixed(1)},${f.desde.y.toFixed(1)} Q${f.control.x.toFixed(1)},${f.control.y.toFixed(1)} ${f.hasta.x.toFixed(1)},${f.hasta.y.toFixed(1)}`
    : `M${f.desde.x.toFixed(1)},${f.desde.y.toFixed(1)} L${f.hasta.x.toFixed(1)},${f.hasta.y.toFixed(1)}`);

/**
 * Hasta dónde llega lo dibujado (variables, flechas y coeficientes), por cada lado.
 * @param {Record<string, Nodo>} nodos @param {Flecha[]} flechas
 */
function extremos(nodos, flechas) {
    // (2027.01.13) con los límites de cada flecha: hasta la 2027.01.12, todos sus puntos como argumentos de Math.min (decenas
    // de miles en un modelo grande)
    const e = { izquierda: Infinity, derecha: -Infinity, tope: Infinity, fondo: -Infinity };
    for (const n of [...Object.values(nodos), ...flechas.map(f => f.etiqueta)]) {
        e.izquierda = Math.min(e.izquierda, n.x - n.w / 2); e.derecha = Math.max(e.derecha, n.x + n.w / 2);
        e.tope = Math.min(e.tope, n.y - n.h / 2); e.fondo = Math.max(e.fondo, n.y + n.h / 2);
    }
    for (const { limites: l } of flechas) {
        e.izquierda = Math.min(e.izquierda, l.x0); e.derecha = Math.max(e.derecha, l.x1); e.tope = Math.min(e.tope, l.y0); e.fondo = Math.max(e.fondo, l.y1);
    }
    return e;
}

/** Todo, movido (dx, dy). @param {Record<string, Nodo>} nodos @param {Flecha[]} flechas @param {number} dx @param {number} dy */
function mover(nodos, flechas, dx, dy) {
    /** @param {Punto} p */
    const m = p => ({ x: p.x + dx, y: p.y + dy });
    for (const n of Object.values(nodos)) Object.assign(n, m(n));
    for (const f of flechas) {
        const puntos = f.puntos.map(m);
        Object.assign(f, { desde: m(f.desde), hasta: m(f.hasta), control: f.control && m(f.control), puntos, limites: limitesDe(puntos), trozos: trozosDe(puntos) });
        Object.assign(f.etiqueta, m(f.etiqueta));
    }
}

/**
 * Un plan colocado y trazado, con todo dentro del diagrama: lo que una curva saque por la izquierda o por arriba, movido (y el
 * diagrama, más ancho por los dos lados: lo centrado sigue centrado); por la derecha o por abajo, el diagrama, más grande.
 * Debajo, sitio para su nota.
 * @param {Plan} plan @param {string[]} otras @param {Ruta[]} rutas @param {boolean} conRutas (colocar)
 * @param {number} celda el lado de las celdas de las rejillas de trazar
 * @returns {Disposicion}
 */
function disponer(plan, otras, rutas, conRutas, celda) {
    const { ancho, nodos, lado, cargasDeLado } = colocar(plan, otras, conRutas, rutas);
    const flechas = trazar(nodos, rutas, { lado, cargasDeLado, celda });
    const e = extremos(nodos, flechas);
    const dx = Math.max(0, Math.ceil(BORDE / 2 - e.izquierda)), dy = Math.max(0, Math.ceil(BORDE / 2 - e.tope));
    if (dx || dy) mover(nodos, flechas, dx, dy);
    for (const f of flechas) f.d = trazo(f);
    return { ancho: Math.ceil(Math.max(ancho + 2 * dx, e.derecha + dx + BORDE / 2)), alto: Math.ceil(e.fondo + dy + 30), nodos, flechas };
}

/**
 * Lo que se monta en una disposición: dos variables una sobre otra, una flecha que atraviesa otra variable, un coeficiente
 * sobre una variable, sobre otro coeficiente, sobre otra flecha (su fondo blanco la taparía) o sobre la punta de la suya. 0:
 * nada.
 * @param {Disposicion} D
 */
function montados(D) {
    const nodos = Object.values(D.nodos);
    let n = 0;
    nodos.forEach((a, i) => { for (const b of nodos.slice(i + 1)) if (solapan(a, b)) n++; });
    for (const f of D.flechas) {
        const A = D.nodos[f.de], B = D.nodos[f.a], e = f.etiqueta;
        const cerca = nodos.filter(m => m !== A && m !== B && toca(f.limites, m, 2));
        if (cerca.length && f.puntos.some(p => !dentroDe(A, p.x, p.y) && !dentroDe(B, p.x, p.y) && cerca.some(m => dentroDe(m, p.x, p.y, 2)))) n++;
        for (const m of nodos) if (solapan(e, m)) n++;
        for (const g of D.flechas) if (g !== f && toca(g.limites, e) && pasaPor(g.trozos, e)) n++;
        if (tapaLaPunta(e, f)) n++;
    }
    D.flechas.forEach((f, i) => { for (const g of D.flechas.slice(i + 1)) if (solapan(f.etiqueta, g.etiqueta)) n++; });
    return n;
}

/**
 * Cuántas veces se cruzan dos flechas que no comparten variable (sobre sus trazos, con 24 tramos cada una como mucho).
 * @param {Disposicion} D
 */
function cruces(D) {
    const datos = D.flechas.map(f => ({ f, ps: tramos(f.puntos), l: f.limites }));
    let n = 0;
    datos.forEach((a, i) => {
        for (const b of datos.slice(i + 1)) if (!vecinas(a.f, b.f) && seTocan(a.l, b.l) && seCruzan(a.ps, b.ps)) n++;
    });
    return n;
}

/**
 * Las columnas de un modelo de rutas sin latentes: las exógenas en la primera, y cada variable una columna a la derecha de la
 * última de sus predictores; en cada columna, en el orden de la media de sus predictores (para que se crucen poco). null si
 * no hay más de una columna o si las rutas hacen un ciclo (un modelo no recursivo).
 * @param {string[]} otras @param {Ruta[]} rutas
 * @returns {string[][] | null}
 */
function columnasDeRutas(otras, rutas) {
    const nivel = nivelesDe(otras, rutas);
    if (!nivel) return null;
    const k = Math.max(0, ...nivel.values());
    if (k < 1) return null;
    /** @type {Map<string, string[]>} */
    const predictores = new Map(otras.map(v => [v, []]));
    for (const r of rutas) if (r.tipo === 'regresion' && predictores.has(r.a) && predictores.has(r.de)) /** @type {string[]} */ (predictores.get(r.a)).push(r.de);
    /** @type {string[][]} */
    const columnas = Array.from({ length: k + 1 }, () => []);
    otras.forEach(v => columnas[/** @type {number} */ (nivel.get(v))].push(v));
    /** @type {Map<string, number>} */
    const fila = new Map();
    columnas.forEach((col, i) => {
        if (i > 0) {
            const media = (/** @type {string} */ v) => { const ps = /** @type {string[]} */ (predictores.get(v)).filter(p => fila.has(p)); return ps.length ? ps.reduce((s, p) => s + /** @type {number} */ (fila.get(p)) - (columnas[/** @type {number} */ (nivel.get(p))].length - 1) / 2, 0) / ps.length : 0; };
            col.sort((a, b) => media(a) - media(b) || otras.indexOf(a) - otras.indexOf(b));
        }
        col.forEach((v, j) => fila.set(v, j));
    });
    return columnas;
}

/**
 * El nivel de cada variable en las regresiones entre ellas: 0 las que no tienen predictores entre ellas, y cada una, uno más
 * que el más alto de sus predictores. null si las regresiones hacen un ciclo (un modelo no recursivo).
 * @param {string[]} variables @param {Ruta[]} rutas
 * @returns {Map<string, number> | null}
 */
function nivelesDe(variables, rutas) {
    /** @type {Map<string, string[]>} */
    const predictores = new Map(variables.map(v => [v, []]));
    for (const r of rutas) if (r.tipo === 'regresion' && predictores.has(r.a) && predictores.has(r.de)) /** @type {string[]} */ (predictores.get(r.a)).push(r.de);
    const nivel = new Map(variables.map(v => [v, 0]));
    for (let vuelta = 0; vuelta <= variables.length; vuelta++) {
        let quieto = true;
        for (const v of variables) {
            const n = Math.max(0, .../** @type {string[]} */ (predictores.get(v)).map(p => /** @type {number} */ (nivel.get(p)) + 1));
            if (n !== nivel.get(v)) { nivel.set(v, n); quieto = false; }
        }
        if (quieto) return nivel;
    }
    return null;
}

/**
 * Los repartos de k latentes en dos filas (o columnas): con pocas, todos (sin `espejo`, solo los que dejan la primera en la de
 * arriba o en la de la izquierda: el otro es su imagen en el espejo); con más, una sí y otra no, y la primera mitad (y, con
 * `espejo`, al revés).
 * @param {number} k @param {boolean} espejo
 * @returns {number[]} cada reparto, una máscara: las latentes de la primera fila (o columna)
 */
function repartos(k, espejo) {
    const todas = (1 << k) - 1;
    if (k <= LATENTES_PARA_PROBAR_TODO) {
        const out = [];
        for (let m = 1; m < todas; m++) if (espejo || m & 1) out.push(m);
        return out;
    }
    const alternas = Array.from({ length: k }, (_, i) => i).reduce((m, i) => (i % 2 ? m : m | (1 << i)), 0), mitad = (1 << Math.ceil(k / 2)) - 1;
    return espejo ? [alternas, todas ^ alternas, mitad, todas ^ mitad] : [alternas, mitad];
}

/**
 * Las disposiciones posibles: todas las latentes en una fila con sus indicadores encima (la de siempre; sin latentes, las
 * observadas en una fila); con una sola latente, sus indicadores repartidos por encima y por debajo (y, desde la 2027.01.13,
 * las demás observadas a sus lados: colocarAlLado); con
 * dos o más, en dos filas, de cada reparto (repartos); sin latentes, por columnas (columnasDeRutas); y (2027.01.13, revisión)
 * con latentes, en columna: en una sola, y en dos, de cada reparto (en el orden de sus regresiones: la que predice a otra, más
 * arriba). En columna, las latentes sin indicadores observados (un factor de segundo orden) van con las demás variables.
 * @param {Latente[]} latentes @param {string[]} otras @param {Ruta[]} rutas
 * @returns {Plan[]}
 */
function planes(latentes, otras, rutas) {
    /** @type {Plan[]} */
    const out = [{ tipo: 'filas', arriba: latentes.map(l => ({ F: l.F, encima: l.inds, debajo: [] })), abajo: [] }];
    const k = latentes.length;
    if (!k) {
        const columnas = columnasDeRutas(otras, rutas);
        if (columnas) out.push({ tipo: 'columnas', columnas });
    }
    if (k === 1 && latentes[0].inds.length >= 4) {
        const { F, inds } = latentes[0], m = Math.ceil(inds.length / 2);
        out.push({ tipo: 'filas', arriba: [{ F, encima: inds.slice(0, m), debajo: inds.slice(m) }], abajo: [], alLado: otras.length > 0 });
    }
    if (k >= 2 && k <= LATENTES_COMO_MUCHO) {
        for (const m of repartos(k, true)) {
            out.push({
                tipo: 'filas',
                arriba: latentes.filter((_, i) => m & (1 << i)).map(l => ({ F: l.F, encima: l.inds, debajo: [] })),
                abajo: latentes.filter((_, i) => !(m & (1 << i))).map(l => ({ F: l.F, encima: [], debajo: l.inds })),
            });
        }
    }
    const conIndicadores = latentes.filter(l => l.inds.length);
    if (conIndicadores.length) {
        const nivel = nivelesDe(conIndicadores.map(l => l.F), rutas);
        const orden = nivel ? [...conIndicadores].sort((a, b) => /** @type {number} */ (nivel.get(a.F)) - /** @type {number} */ (nivel.get(b.F))) : conIndicadores;
        /** @type {DelMedio[]} */
        const medio = [...latentes.filter(l => !l.inds.length).map(l => ({ nombre: l.F, latente: true })), ...otras.map(v => ({ nombre: v, latente: false }))];
        out.push({ tipo: 'columna', izquierda: orden, derecha: [], medio });
        if (orden.length >= 2 && orden.length <= LATENTES_COMO_MUCHO) {
            for (const m of repartos(orden.length, false)) out.push({ tipo: 'columna', izquierda: orden.filter((_, i) => m & (1 << i)), derecha: orden.filter((_, i) => !(m & (1 << i))), medio });
        }
    }
    return out;
}

/** El orden de dos claves (listas de números), de menor a mayor. @param {number[]} a @param {number[]} b */
function comparar(a, b) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
}

/**
 * Dónde va cada variable y por dónde cada flecha. Los indicadores de cada latente, juntos (uno que cargue en dos, con la
 * primera); las demás observadas, en una fila, por columnas o (en columna) entre las latentes. De las disposiciones posibles
 * (planes), la que menos cosas montadas tiene, contando como PESO_DE_LA_LETRA cada punto que le falta a su letra en el Word
 * para llegar a PUNTOS_LEGIBLES (antes que el sitio, que se lea); después, la que menos flechas cruza entre sí y menos
 * regresiones curva (cada una, como dos cruces: una covarianza curvada es lo de siempre en estos diagramas; una regresión, no)
 * y, a igualdad, en este orden: la que deja la letra más grande, hasta ANCHO_COMODO (y su alto); en filas antes que en columna
 * (la de siempre, si se lee igual); la más baja; la más estrecha;
 * la que menos regresiones lleva hacia atrás (de derecha a izquierda; en columna, de abajo arriba); y la que menos latentes
 * pone arriba (una mediación: la mediadora arriba, en el vértice). Se trazan en ese orden, hasta la primera sin nada de eso
 * (o DISPOSICIONES_A_TRAZAR, menos con muchas rutas: TRABAJO_COMO_MUCHO).
 * @param {{ latentes: string[], indicadoresDe: Record<string, string[]>, observadas: string[], rutas: Ruta[] }} modelo
 * @param {{ celda?: number }} [opciones] para las pruebas: el lado de las celdas de las rejillas con que se busca lo ya trazado
 * (CELDA; con uno enorme, una sola celda: se mira todo, y debe salir lo mismo)
 * @returns {Disposicion}
 */
export function disposicionDelDiagrama({ latentes, indicadoresDe, observadas, rutas }, { celda = CELDA } = {}) {
    /** @type {Set<string>} */
    const asignados = new Set();
    const conIndicadores = latentes.map(F => {
        const inds = (indicadoresDe[F] || []).filter(v => observadas.includes(v) && !asignados.has(v));
        inds.forEach(v => asignados.add(v));
        return { F, inds };
    });
    const otras = observadas.filter(v => !asignados.has(v));
    // más que cargas en sus indicadores: regresiones, covarianzas o las cargas de un factor de segundo orden (entre latentes)
    const regresiones = rutas.filter(r => r.tipo === 'regresion'), conRutas = rutas.some(r => r.tipo !== 'carga' || latentes.includes(r.a));
    const candidatas = planes(conIndicadores, otras, rutas).map((plan, i) => {
        const { ancho, nodos } = colocar(plan, otras, conRutas, rutas);
        const alto = Math.max(...Object.values(nodos).map(n => n.y + n.h / 2), Y_INDICADORES) + 30;
        const enColumna = plan.tipo === 'columna';
        const alReves = regresiones.filter(r => nodos[r.de] && nodos[r.a] && (enColumna ? nodos[r.de].y > nodos[r.a].y + 1 : nodos[r.de].x > nodos[r.a].x + 1)).length;
        return { plan, clave: [-Math.min(escalaEnLaPagina(ancho, alto), ESCALA_COMODA), enColumna ? 1 : 0, alto, ancho, alReves, plan.tipo === 'filas' ? plan.arriba.length : 0, i] };
    }).sort((a, b) => comparar(a.clave, b.clave));
    const aTrazar = Math.max(1, Math.min(DISPOSICIONES_A_TRAZAR, Math.floor(TRABAJO_COMO_MUCHO / (rutas.length ** 2 + 1))));
    // (con una sola que trazar, sin medirla: medir lo montado y los cruces de cientos de flechas tarda tanto como trazarlas)
    if (aTrazar === 1) return disponer(candidatas[0].plan, otras, rutas, conRutas, celda);
    /** @type {{ D: Disposicion, clave: number[] } | null} */
    let mejor = null;
    for (const c of candidatas.slice(0, aTrazar)) {
        const D = disponer(c.plan, otras, rutas, conRutas, celda);
        const puntos = 9 * escalaEnLaPagina(D.ancho, D.alto);   // (12 px a 96 por pulgada: 9 puntos)
        const clave = [montados(D) + PESO_DE_LA_LETRA * Math.max(0, PUNTOS_LEGIBLES - puntos), cruces(D) + 2 * D.flechas.filter(f => f.curva && f.tipo === 'regresion').length];
        if (!mejor || comparar(clave, mejor.clave) < 0) mejor = { D, clave };
        if (clave.every(v => !v)) break;
    }
    return /** @type {{ D: Disposicion }} */ (mejor).D;
}

/**
 * El SVG de una disposición: las flechas, las variables (cajas las observadas, elipses las latentes) y, encima de todo, los
 * coeficientes. Los nombres, escapados (vienen de los datos). Ocupa el ancho de su recuadro, hasta CRECE_EN_LA_PANTALLA veces
 * su tamaño, y en un teléfono guarda un ancho legible (se desplaza dentro de él).
 * @param {Disposicion} disp
 * @returns {string}
 */
export function svgDelDiagrama({ ancho, alto, nodos, flechas }) {
    const esc = escaparHTML;
    let s = `<svg viewBox="0 0 ${ancho} ${alto}" xmlns="http://www.w3.org/2000/svg" class="sem-diagrama" font-family="Arial, Helvetica, sans-serif" style="display:block;margin:0 auto;width:100%;max-width:${Math.round(ancho * CRECE_EN_LA_PANTALLA)}px;min-width:${Math.min(ancho, ANCHO_EN_UN_TELEFONO)}px;background:#fff;">
        <defs><marker id="fle" markerWidth="${MARCADOR_LARGO + 1}" markerHeight="${2 * MARCADOR_MEDIO_ANCHO + 3}" refX="${MARCADOR_LARGO}" refY="${MARCADOR_MEDIO_ANCHO}" orient="auto-start-reverse"><path d="M0,0 L${MARCADOR_LARGO},${MARCADOR_MEDIO_ANCHO} L0,${2 * MARCADOR_MEDIO_ANCHO} z" fill="#333"/></marker></defs>`;
    // (una covarianza, con punta en los dos extremos)
    for (const f of flechas) s += `<path d="${f.d}" fill="none" stroke="#333" stroke-width="${GROSOR}" marker-end="url(#fle)"${f.tipo === 'covarianza' ? ' marker-start="url(#fle)" stroke-dasharray="5,4"' : ''}/>`;
    for (const n of Object.values(nodos)) {
        s += n.forma === 'caja'
            ? `<rect x="${(n.x - n.w / 2).toFixed(1)}" y="${(n.y - n.h / 2).toFixed(1)}" width="${n.w}" height="${n.h}" rx="4" fill="#eef4ff" stroke="#2E5BBA"/><text x="${n.x.toFixed(1)}" y="${(n.y + 4).toFixed(1)}" text-anchor="middle" font-size="12">${esc(n.nombre)}</text>`
            : `<ellipse cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" rx="${n.w / 2}" ry="${n.h / 2}" fill="#fff6e8" stroke="#c07820"/><text x="${n.x.toFixed(1)}" y="${(n.y + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="bold">${esc(n.nombre)}</text>`;
    }
    for (const f of flechas) {
        const e = f.etiqueta;
        s += `<rect x="${(e.x - e.w / 2).toFixed(1)}" y="${(e.y - e.h / 2).toFixed(1)}" width="${e.w}" height="${e.h}" fill="#fff" opacity="0.9"/><text x="${e.x.toFixed(1)}" y="${(e.y + 4).toFixed(1)}" text-anchor="middle" font-size="12" fill="#b03030">${esc(f.texto)}</text>`;
    }
    s += `<text x="${ancho - 6}" y="${alto - 6}" text-anchor="end" font-size="12" fill="#555">Coeficientes estandarizados</text></svg>`;
    return s;
}

/**
 * El tamaño del diagrama de un SVG hecho por svgDelDiagrama (su viewBox), o null.
 * @param {string} svg
 * @returns {{ ancho: number, alto: number } | null}
 */
export function tamanoDelDiagrama(svg) {
    const m = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
    return m ? { ancho: Number(m[1]), alto: Number(m[2]) } : null;
}
