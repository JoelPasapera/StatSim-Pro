// @ts-check
// ejemplos/caso.js — (2027.01.02) la vista de un caso en la pestaña «Ejemplos»: su cabecera (número y diseño, título, lo que
// muestra, cifras clave y los botones «Abrir en StatSim» y «Descargar todo»), sus archivos por grupos (lo del Simulador,
// cada análisis del Analizador y el proyecto), cada uno con lo que es, su tamaño y su descarga (un PDF, también para verlo en
// otra pestaña; el proyecto, también para abrirlo), y su README por secciones plegables, sin su título (lo dice la cabecera)
// ni su tabla de archivos (la reemplaza la lista). Solo arma el HTML, con todo el texto escapado (el README, por
// markdown.js); los botones los atiende index.js por su data-accion-ejemplo. Sin DOM.

import { escaparHTML } from '../shared/html.js';
import { enLinea, markdownAHtml, partirEnSecciones } from './markdown.js';
import { ACOMPANANTES, PROYECTO_DEL_CASO, bytesDelCaso, gruposDeArchivos, numeroDe, tamanoDe, tipoDeArchivo, urlDelArchivo } from './catalogo.js';
import { listaDeDestacados } from './galeria.js';

/** Las secciones del README que no se muestran: la de los archivos (la reemplaza la lista de archivos, con sus descargas). */
const SIN_MOSTRAR = ['Archivos'];
/** Las que empiezan plegadas: las de consulta. Si un README cambia sus títulos, sus secciones simplemente salen abiertas. */
const PLEGADAS = ['Pedido vs. obtenido', 'Cómo reproducirlo', 'Los avisos del Simulador'];
/** El nivel HTML del título del caso (h3: la pestaña lleva el h2); las secciones de su README van un nivel por debajo. */
const NIVEL_DEL_CASO = 3;

/**
 * El README de un caso en HTML: lo que va antes de su primera sección, sin su título («# Caso N · …»), y cada sección en
 * un <details> con su título como encabezado.
 * @param {string} leeme
 * @param {import('./markdown.js').OpcionesMarkdown} op
 * @returns {string}
 */
export function htmlDelLeeme(leeme, op) {
    const opciones = { ...op, nivelBase: NIVEL_DEL_CASO };
    const { inicio, secciones } = partirEnSecciones(leeme);
    const sinTitulo = inicio.replace(/^\s*#[ \t][^\n]*(?:\n|$)/, '');
    const n = NIVEL_DEL_CASO + 1;
    const partes = secciones.filter(s => !SIN_MOSTRAR.includes(s.titulo)).map(s => `<details class="ejemplo-seccion"${PLEGADAS.includes(s.titulo) ? '' : ' open'}>
    <summary><h${n} class="ejemplo-seccion-titulo">${enLinea(s.titulo, opciones)}</h${n}></summary>
    <div class="ejemplo-seccion-cuerpo">${markdownAHtml(s.texto, opciones)}</div>
</details>`);
    return `<div class="ejemplo-leeme-inicio">${markdownAHtml(sinTitulo, opciones)}</div>${partes.join('')}`;
}

/**
 * Los enlaces del README a los archivos del caso («simulador/base.sav»), a su dirección en el sitio; los demás, sin
 * enlace (solo su texto).
 * @param {import('./catalogo.js').Ejemplo} e
 * @param {string} version
 * @returns {(ruta: string) => string | null}
 */
export function resolverRutasDelCaso(e, version) {
    const propias = new Set([...ACOMPANANTES, ...e.archivos.map(a => a.ruta)]);
    return ruta => {
        const limpia = ruta.replace(/^\.\//, '').split('#')[0];
        return propias.has(limpia) ? urlDelArchivo(e.carpeta, limpia, version) : null;
    };
}

/**
 * Un archivo de la lista: su icono, su nombre, su tipo y tamaño, lo que es y sus botones (un PDF, «Ver» en otra pestaña;
 * el proyecto, «Abrir en StatSim»; todos, «Descargar», con su nombre).
 * @param {import('./catalogo.js').Ejemplo} e
 * @param {import('./catalogo.js').ArchivoDelEjemplo} a
 * @param {string} version
 * @returns {string}
 */
function filaDeArchivo(e, a, version) {
    const nombre = /** @type {string} */ (a.ruta.split('/').pop());
    const tipo = tipoDeArchivo(a.ruta);
    const url = escaparHTML(urlDelArchivo(e.carpeta, a.ruta, version));
    const n = escaparHTML(nombre);
    /** @type {string[]} */
    const botones = [];
    if (tipo.clase === 'pdf') botones.push(`<a class="btn btn-outline ejemplo-boton" href="${url}" target="_blank" rel="noopener" aria-label="Ver ${n} (se abre en otra pestaña)">Ver</a>`);
    if (a.ruta === PROYECTO_DEL_CASO) botones.push(`<button type="button" class="btn btn-outline ejemplo-boton" data-accion-ejemplo="abrir" data-carpeta="${escaparHTML(e.carpeta)}">Abrir en StatSim</button>`);
    botones.push(`<a class="btn btn-outline ejemplo-boton" href="${url}" download="${n}" aria-label="Descargar ${n}">Descargar</a>`);
    return `<li class="ejemplo-archivo ejemplo-archivo-${tipo.clase}">
    <span class="ejemplo-archivo-icono" aria-hidden="true">${tipo.icono}</span>
    <div class="ejemplo-archivo-texto">
        <p class="ejemplo-archivo-nombre">${n}</p>
        <p class="ejemplo-archivo-meta">${escaparHTML(tipo.etiqueta)} · ${tamanoDe(a.bytes)}</p>
        ${a.descripcion ? `<p class="ejemplo-archivo-descripcion">${enLinea(a.descripcion)}</p>` : ''}
    </div>
    <div class="ejemplo-archivo-acciones">${botones.join('')}</div>
</li>`;
}

/**
 * La lista de archivos del caso, por grupos.
 * @param {import('./catalogo.js').Ejemplo} e
 * @param {string} version
 * @returns {string}
 */
function htmlDeLosArchivos(e, version) {
    const n = NIVEL_DEL_CASO + 2;
    return gruposDeArchivos(e.archivos, e.carpetas).map(g => `<div class="ejemplo-grupo">
    <h${n} class="ejemplo-grupo-titulo">${escaparHTML(g.titulo)}</h${n}>
    <ul class="ejemplo-lista-archivos">${g.archivos.map(a => filaDeArchivo(e, a, version)).join('')}</ul>
</div>`).join('');
}

/**
 * La vista entera de un caso.
 * @param {import('./catalogo.js').Ejemplo} e
 * @param {string | null} leeme el README del caso (null: no se pudo leer; la vista sale igual, con sus archivos)
 * @param {string} version la de la página (las direcciones de los archivos la llevan)
 * @param {string} [aviso] por qué no está el README
 * @returns {string}
 */
export function htmlDelCaso(e, leeme, version, aviso = '') {
    const carpeta = escaparHTML(e.carpeta), n = NIVEL_DEL_CASO;
    const tieneProyecto = e.archivos.some(a => a.ruta === PROYECTO_DEL_CASO);
    return `<div class="ejemplo-caso" data-carpeta="${carpeta}">
<div class="ejemplo-barra">
    <button type="button" class="btn btn-outline" data-accion-ejemplo="volver" data-carpeta="${carpeta}">← Todos los ejemplos</button>
</div>
<header class="card ejemplo-cabecera">
    <p class="ejemplo-eyebrow">Caso ${numeroDe(e)} · ${escaparHTML(e.diseno)}</p>
    <h${n} class="ejemplo-caso-titulo" id="ejemploCasoTitulo" tabindex="-1">${escaparHTML(e.titulo)}</h${n}>
    <p class="ejemplo-resumen">${escaparHTML(e.resumen)}</p>
    ${listaDeDestacados(e)}
    <div class="ejemplo-acciones">
        ${tieneProyecto ? `<button type="button" class="btn btn-primary" data-accion-ejemplo="abrir" data-carpeta="${carpeta}">Abrir en StatSim</button>` : ''}
        <button type="button" class="btn btn-secondary" data-accion-ejemplo="zip" data-carpeta="${carpeta}">Descargar todo (.zip, ${tamanoDe(bytesDelCaso(e))})</button>
    </div>
    <p class="ejemplo-progreso" role="status" aria-live="polite"></p>
    <div class="orden-guia" role="note" aria-label="Qué hace «Abrir en StatSim»">
        <span class="orden-guia-titulo">Para qué sirve:</span>
        <span class="orden-nota">«Abrir en StatSim» carga el proyecto del caso —el Simulador con su configuración y su base, el Analizador con sus datos— y te deja a la vista sus pasos para que repitas el análisis y veas los mismos resultados. Reemplaza lo que tengas ahora en la página: si tienes trabajo sin guardar, guárdalo antes con Ayuda → «Guardar proyecto». «Descargar todo» baja la carpeta entera del caso en un .zip.</span>
    </div>
    <p class="ejemplo-meta">${e.archivos.length} archivos · hecho por la versión ${escaparHTML(e.version)} de StatSim Pro, con datos simulados</p>
</header>
<div class="ejemplo-cuerpo">
    <section class="card ejemplo-archivos" aria-labelledby="ejemploArchivosTitulo">
        <h${n + 1} class="card-title" id="ejemploArchivosTitulo">Archivos del caso</h${n + 1}>
        ${htmlDeLosArchivos(e, version)}
    </section>
    <article class="card ejemplo-leeme" aria-labelledby="ejemploCasoTitulo">
        ${leeme !== null ? htmlDelLeeme(leeme, { resolverRuta: resolverRutasDelCaso(e, version) })
            : `<p class="ejemplo-sin-leeme" role="alert">No se pudo cargar la explicación del caso (su README.md)${aviso ? `: ${escaparHTML(aviso.replace(/[.\s]+$/, ''))}` : ''}. Sus archivos sí están a la mano.</p>`}
    </article>
</div>
</div>`;
}
