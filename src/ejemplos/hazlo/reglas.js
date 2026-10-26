// @ts-check
// ejemplos/hazlo/reglas.js — (2027.01.07) Las reglas que cumplen los guiones de un caso. Lo que dice la guía de las descargas
// de un paso (sesion.js: qué llevan de otros pasos, qué les falta, qué les sobra y cómo arreglarlo) sigue lo que deja cada
// acción en la página, y es cierto en los casos que las cumplen:
// - cada paso, con lo suyo: los de antes de los que se repiten, solo lo que trae el proyecto (los datos y la configuración de
//   la investigación), y eso solo en ellos; los que se repiten, algún análisis; los opcionales del final, ninguno;
// - las descargas del análisis de un paso, una vez, al final de lo que hace (lo de después no va en ellas) y tras su propio
//   análisis (las de un opcional, tras el del último que se repite): si no, serían las del análisis de otro paso; y, desde la
//   2027.01.08, con el capítulo de Word solo si ese análisis lo tiene (una correlación de dos variables);
// - cada tarjeta (la comparación de grupos, el AFE, la V de Aiken, la invarianza), una vez en el caso: calcular otra vez
//   reemplaza su resultado en la página;
// - el SEM, en un solo paso y cada papel una vez: la comparación de modelos tiene uno por papel (sem-motor.js, _recordar);
// - la invarianza con el modelo de la sección SEM, tras ajustarlo en su mismo paso (el proyecto no guarda esa sintaxis);
// - «Guardar proyecto», en los opcionales del final: lo que guarda es lo de la página, y la guía no lo sigue;
// - (2027.01.10) cada acción, como la página puede hacerla (planes.js, queNoPuede: ni la misma variable dos veces, ni más
//   variables o predictores de los que admite, ni una regresión que deja fuera…): si no, «Hazlo por mí» fallaría a medio paso o
//   la haría a medias. Hasta la 2027.01.09, la misma variable dos veces dejaba el catálogo entero sin leer (accionValida).
// Las comprueba el generador de los ejemplos (tests/navegador/ejemplos.mjs: no escribe un caso que no las cumpla) y la página
// al leer el catálogo (catalogo.js: un caso que no las cumple se lee sin sus guiones, y su guía no ofrece «Muéstrame» ni
// «Hazlo por mí»). Hasta la 2027.01.06 el generador admitía casos en los que la guía aconsejaba mal: el SEM en dos pasos, dos
// comparaciones de grupos, una tarjeta tras las descargas del análisis… Sin DOM.

import { accionEjecutable, papelDelSEM, queNoPuede, tieneCapitulo } from './planes.js';

/**
 * @typedef {import('./planes.js').AccionDelGuion} AccionDelGuion
 * @typedef {{ pasos: readonly unknown[], repetir: { desde: number, hasta: number }, guiones?: AccionDelGuion[][] }} CasoConGuiones
 * @typedef {{ paso: number, regla: string, texto: string }} Incumplimiento  paso: el primero en que se ve (0: el caso entero);
 *   regla: cuál (su nombre, para las pruebas); texto: qué pasa, en una frase sin punto final
 */

/** Las tarjetas que dejan un solo resultado en la página: calcular otra vez lo reemplaza. Una vez en el caso cada una. */
export const TARJETAS_DE_UNA_VEZ = Object.freeze(['compararGrupos', 'calcularAFE', 'calcularAiken', 'evaluarInvarianza']);
/** Lo que trae el proyecto del caso (los datos y la configuración de la investigación): solo en los pasos que ya trae. */
export const LO_QUE_TRAE_EL_PROYECTO = Object.freeze(['usarBaseDelSimulador', 'describirInvestigacion']);

/** Unos textos, en una frase: «a», «a y b», «a, b y c». @param {Array<string | number>} xs */
const unir = xs => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
/** Las acciones de un guion, por su nombre. @param {AccionDelGuion[]} g */
const nombres = g => g.map(a => a.accion).join(', ') || 'nada';
/** «el paso 3», «los pasos 3 y 4». @param {number[]} pasos (distintos, en orden) */
const losPasos = pasos => (pasos.length === 1 ? `el paso ${pasos[0]}` : `los pasos ${unir(pasos)}`);
/** Qué es un análisis sin capítulo de Word, en una frase. @param {AccionDelGuion} a (un «analizar») */
const sinCapitulo = a => (a.datos.tipo === 'comparacion' ? 'una comparación de grupos' : a.datos.tipo === 'asociacion' ? 'una asociación (χ²)' : 'una matriz de correlaciones (tres o más variables)');

/**
 * Lo que un caso no cumple de las reglas, en el orden de sus pasos: vacío si las cumple (o si no trae guiones: entonces no hay
 * nada que cumplir, y su guía no ofrece «Hazlo por mí»). Supone su «repetir» bien formado (desde ≤ hasta ≤ los pasos) y cada
 * acción válida (planes.js, accionValida): eso lo comprueba antes quien lo lee.
 * @param {CasoConGuiones} e
 * @returns {Incumplimiento[]}
 */
export function loQueNoCumple(e) {
    if (!Array.isArray(e.guiones)) return [];
    const guiones = e.guiones, { desde, hasta } = e.repetir;
    /** @type {Incumplimiento[]} */
    const malos = [];
    /** @param {number} paso @param {string} regla @param {string} texto */
    const mal = (paso, regla, texto) => { malos.push({ paso, regla, texto }); };
    /** @param {AccionDelGuion[]} g */
    const analiza = g => g.some(a => a.accion === 'analizar');
    if (guiones.length !== e.pasos.length) mal(0, 'unGuionPorPaso', `trae ${guiones.length} guiones para sus ${e.pasos.length} pasos`);
    /** Los pasos de cada tarjeta, una vez por cada vez que calcula. @type {Map<string, number[]>} */
    const tarjetas = new Map();
    /** @type {number[]} */
    const conSEM = [];
    guiones.forEach((g, i) => {
        const n = i + 1;
        if (!g.length) { mal(n, 'conGuion', `el paso ${n} no tiene guion`); return; }
        g.forEach(a => { const motivo = queNoPuede(a); if (motivo) mal(n, 'laPaginaLoHace', `el paso ${n} pide ${motivo}`); });
        if (n < desde) {
            // lo trae el proyecto: nada más que eso (lo demás no lo guarda, y nadie lo repetiría)
            if (!g.every(a => LO_QUE_TRAE_EL_PROYECTO.includes(a.accion))) mal(n, 'soloLoQueTraeElProyecto', `el paso ${n} lo trae el proyecto («repetir»), pero hace ${nombres(g)}`);
            return;
        }
        if (n <= hasta) {
            const delProyecto = g.filter(a => LO_QUE_TRAE_EL_PROYECTO.includes(a.accion));
            if (delProyecto.length) mal(n, 'loQueTraeElProyectoAntes', `el paso ${n} se repite («repetir») y hace ${nombres(delProyecto)}, que trae el proyecto: va en los pasos de antes`);
            if (!g.some(accionEjecutable)) mal(n, 'conAnalisis', `el paso ${n} se repite («repetir») y no hace ningún análisis (${nombres(g)})`);
        } else if (g.some(accionEjecutable)) {
            mal(n, 'opcionalSinAnalisis', `el paso ${n} es opcional («repetir»), pero hace ${nombres(g.filter(accionEjecutable))}`);
        }
        if (n <= hasta && g.some(a => a.accion === 'guardarProyecto')) mal(n, 'guardarAlFinal', `el paso ${n} se repite («repetir») y guarda el proyecto: «Guardar proyecto» va en los opcionales del final`);
        const descargas = g.flatMap((a, j) => (a.accion === 'exportarAnalisis' ? [j] : []));
        if (descargas.length > 1) mal(n, 'unasDescargas', `el paso ${n} trae ${descargas.length} veces las descargas del análisis`);
        if (descargas.length) {
            const j = descargas[0], antes = n <= hasta ? g.slice(0, j) : guiones[hasta - 1] || [];
            if (!analiza(antes)) {
                mal(n, 'descargasTrasSuAnalisis', `las descargas del análisis del paso ${n} no van tras ${n <= hasta ? 'un análisis de su mismo paso' : `un análisis del último que se repite (el ${hasta})`}: serían las del análisis de otro paso`);
            } else {
                // (2027.01.08, revisión) con el Word, solo si su análisis lo tiene (el generador no podía bajarlo; la página leía el caso)
                const suAnalisis = [...antes].reverse().find(a => a.accion === 'analizar');
                if (suAnalisis && g[j].datos.word !== false && !tieneCapitulo(suAnalisis)) {
                    mal(n, 'wordConSuCapitulo', `el paso ${n} baja el capítulo de Word tras ${sinCapitulo(suAnalisis)}, que no lo tiene (solo una correlación de dos variables): sus descargas van sin él («word: false»)`);
                }
            }
            const tras = g.slice(j + 1).filter(accionEjecutable);
            if (tras.length) mal(n, 'nadaTrasLasDescargas', `el paso ${n} hace ${nombres(tras)} después de sus descargas del análisis: no va en ellas, y «Hazlo por mí» lo haría antes de que las bajes`);
        }
        g.forEach(a => { if (TARJETAS_DE_UNA_VEZ.includes(a.accion)) tarjetas.set(a.accion, [...(tarjetas.get(a.accion) || []), n]); });
        const sem = g.filter(a => a.accion === 'ajustarSEM');
        if (sem.length) conSEM.push(n);
        const papeles = sem.map(a => papelDelSEM(a.datos));
        const repetidos = [...new Set(papeles.filter((p, k) => papeles.indexOf(p) !== k))];
        if (repetidos.length) mal(n, 'cadaPapelUnaVez', `el paso ${n} ajusta más de una vez ${unir(repetidos.map(p => `el «${p}»`))}: la comparación de modelos tiene uno por papel, y el segundo reemplaza al primero`);
        g.forEach((a, j) => {
            if (a.accion === 'evaluarInvarianza' && a.datos.delSEM && !g.slice(0, j).some(b => b.accion === 'ajustarSEM')) {
                mal(n, 'invarianzaTrasSuSEM', `el paso ${n} evalúa la invarianza con el modelo de la sección SEM sin ajustarlo antes en su mismo paso`);
            }
        });
    });
    for (const [accion, pasos] of tarjetas) {
        if (pasos.length > 1) mal(pasos[1], 'cadaTarjetaUnaVez', `${accion} calcula ${pasos.length} veces (en ${losPasos([...new Set(pasos)])}): en la página, cada vez reemplaza a la anterior`);
    }
    if (conSEM.length > 1) mal(conSEM[1], 'elSEMEnUnPaso', `el SEM se ajusta en ${losPasos(conSEM)}: sus modelos van en un solo paso`);
    return malos.sort((x, y) => x.paso - y.paso);
}
