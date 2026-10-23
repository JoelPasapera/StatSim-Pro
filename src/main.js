// main.js — arranque de StatSim Pro (módulo ES). Crea el espacio StatSim, monta las secciones migradas y deja
// listo el cargador perezoso por #hash para las que vayan migrando. No usa ningún framework.
import { VERSION, SECCIONES } from './version.js';
import { montarSimulador } from './simulador/index.js';
import { montarInterfazSimulador } from './simulador/ui/index.js';
import { configurarNavegacion } from './shared/navegacion.js';
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
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alCargarDOM); else alCargarDOM();

// Carga perezosa: cuando una sección migrada entra en pantalla (#hash), se importa una sola vez.
const cargarSeccion = async id => {
    const s = SECCIONES.find(x => x.id === id);
    if (!s || s.heredado || StatSim.secciones.get(id)?.cargada) return;
    StatSim.secciones.set(id, { cargada: true, modulo: await s.cargar() });
};
window.addEventListener('hashchange', () => cargarSeccion(location.hash.replace('#', '')));
cargarSeccion(location.hash.replace('#', ''));
