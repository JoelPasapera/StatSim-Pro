// main.js — arranque de StatSim Pro (módulo ES). Crea el espacio StatSim, monta las secciones migradas y deja
// listo el cargador perezoso por #hash para las que vayan migrando. No usa ningún framework.
import { VERSION, SECCIONES } from './version.js';
import { montarSimulador } from './simulador/index.js';
import { montarInterfazSimulador } from './simulador/ui/index.js';
import { configurarNavegacion, seccionDe } from './shared/navegacion.js';
import { mejorarTablasDesplazables } from './shared/tabla-desplazable.js';
import { montarAnalizador } from './analizador/index.js';
import * as analizador from './analizador/index.js';
import * as buscador from './buscador/index.js';
import * as redactor from './redactor/index.js';
import * as explorador from './explorador/index.js';
import './shared/video-tutoriales.js';
import { recargarSinCache, autotest } from './shared/mantenimiento.js';
import { montarProyecto } from './proyecto/ui.js';
import { montarImpresion } from './shared/impresion.js';
import { d3 } from './shared/statviz.js';
import { bus, EVENTOS } from './shared/eventos.js';

const StatSim = { version: VERSION, secciones: new Map(), autotest };
window.StatSim = StatSim;
window.StatSimMantenimiento = { recargarSinCache, autotest };   // los botones de Ayuda lo llaman por nombre (onclick)
window.d3 = d3;                                                 // scripts o consolas que aún pidan el motor de dibujo por su nombre

// El Simulador se monta de forma estática: dominio (F1) e interfaz (F2). El puente heredado sirve a los
// scripts clásicos que aún quedan (Analizador, guía de coherencia, exportador) hasta que migren.
montarSimulador(StatSim);
// (F5) ya no hay puentes de clases en window: cada módulo importa lo que usa. Para la consola, todo cuelga de StatSim.api.
StatSim.api = { analizador, buscador, redactor, explorador };
StatSim.secciones.set('simulador', { cargada: true });
// (revisión 2026.12.30) cada montaje por separado: un fallo en uno (como el de la navegación con una dirección «#100%»,
// que dejaba la página sin el Simulador ni el Analizador) no impide los demás
const montarAparte = (/** @type {string} */ nombre, /** @type {() => void} */ montar) => {
    try { montar(); } catch (e) { console.error(`[StatSim] no se pudo montar ${nombre}:`, e); }
};
const alCargarDOM = () => {
    montarAparte('la navegación', configurarNavegacion);
    montarAparte('el Simulador', montarInterfazSimulador);
    montarAparte('el Analizador', montarAnalizador);
    montarAparte('las tablas desplazables', mejorarTablasDesplazables);
    montarAparte('el proyecto', montarProyecto);   // (2026.12.31) «Guardar proyecto» y «Abrir proyecto», en Ayuda
    montarAparte('la impresión', montarImpresion);   // (2027.01.01) el encabezado de lo que se imprime o se guarda en PDF
};

// Control de versión en línea: version.json se pide sin caché al arrancar; si el sitio publicado es más nuevo que
// los módulos que este navegador cargó (caché del hospedaje o del navegador), se recarga sin caché una sola vez.
async function comprobarVersionPublicada() {
    try {
        const r = await fetch('version.json', { cache: 'no-store' });
        if (!r.ok) return;
        const { version } = await r.json();
        if (!version || version === VERSION) return;
        const marca = 'statsim.recargadoPara';
        if (sessionStorage.getItem(marca) === version) { console.warn(`[StatSim] la versión publicada (${version}) sigue sin coincidir con la cargada (${VERSION}) tras recargar`); return; }
        sessionStorage.setItem(marca, version);
        recargarSinCache(false);
    } catch (e) { /* sin red o sin version.json: no pasa nada */ }
}
if (typeof fetch === 'function' && typeof sessionStorage !== 'undefined') comprobarVersionPublicada();

// Carga perezosa: cuando una sección de carga perezosa se muestra, su módulo se importa una sola vez. (2027.01.02) Por el aviso
// «seccion:mostrada» de shared/navegacion.js, con el id ya decodificado: también la que se muestra al arrancar (un enlace
// profundo, «index.html#ejemplos»), por eso se escucha antes de montar la navegación. Si su módulo no se pudo cargar, lo dice
// en la propia sección (en su elemento [data-estado-carga]) y ofrece recargar sin caché: el navegador recuerda el fallo de un
// módulo, y volver a importarlo sin recargar no lo arregla.
/**
 * (2027.01.04, revisión) Por qué no se pudo cargar una pestaña, por su error: un archivo que no llegó (el navegador lo dice
 * así: «Failed to fetch dynamically imported module», «error loading dynamically imported module», «Importing a module
 * script failed»), uno que no encaja con los demás (un SyntaxError: lo que importa no está, lo normal con una copia vieja en
 * la caché) o uno que dio un error al ponerse en marcha. Hasta la revisión, cualquiera se achacaba a la red.
 * @param {unknown} e
 */
const porQueNoCargo = e => {
    const mensaje = e instanceof Error ? e.message : String(e);
    if (e instanceof TypeError && /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(mensaje)) {
        return 'el navegador no pudo traer uno de sus archivos (sin conexión, o con una copia vieja en su caché). Vuelve a cargar la página sin caché';
    }
    if (e instanceof SyntaxError) return 'uno de sus archivos no encaja con los demás (lo normal tras una actualización: una copia vieja en la caché del navegador). Vuelve a cargar la página sin caché';
    return 'uno de sus archivos dio un error al ponerse en marcha (el detalle, en la consola del navegador). Prueba a cargar la página sin caché';
};
/** @param {string} id @param {unknown} e */
const avisarFalloDeCarga = (id, e) => {
    const aviso = document.querySelector(`#${id} [data-estado-carga]`);
    if (!aviso) return;
    // (2027.01.04) en castellano (el detalle del navegador, en inglés, queda en la consola) y sin prometer lo que no es: recargar
    // pierde lo que no se haya guardado (lo guardado en el navegador, como la tabla de la V de Aiken, se queda)
    aviso.textContent = `No se pudo cargar esta pestaña: ${porQueNoCargo(e)}; se pierde lo que no hayas guardado con «Guardar proyecto»: `;
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn btn-outline';
    boton.textContent = 'Recargar sin caché';
    boton.addEventListener('click', () => { recargarSinCache(false); });
    aviso.appendChild(boton);
    aviso.classList.add('aviso-error');
};
/** @param {string | null} id */
const cargarSeccion = async id => {
    const s = SECCIONES.find(x => x.id === id);
    if (!id || !s || s.heredado || StatSim.secciones.get(id)?.cargada) return;
    StatSim.secciones.set(id, { cargada: true });
    try {
        StatSim.secciones.set(id, { cargada: true, modulo: await s.cargar() });
    } catch (e) {
        StatSim.secciones.delete(id);   // la próxima vez que se muestre, se vuelve a pedir (tras recargar, ya sin el fallo)
        console.error(`[StatSim] no se pudo cargar la sección «${id}»:`, e);
        avisarFalloDeCarga(id, e);
    }
};
bus.on(EVENTOS.SECCION_MOSTRADA, ({ id }) => { cargarSeccion(id); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alCargarDOM); else alCargarDOM();
// por si la navegación no llegara a montarse: la sección de la dirección (decodificada, si es una del menú)
window.addEventListener('hashchange', () => { cargarSeccion(seccionDe(location.hash)); });
cargarSeccion(seccionDe(location.hash));
