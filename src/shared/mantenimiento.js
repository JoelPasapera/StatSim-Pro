// shared/mantenimiento.js — recargar sin caché / restablecer el sitio (tarjeta de Ayuda) y autotest a demanda.
// Origen: mantenimiento.js (Fase 5), sin cambios de comportamiento; dependencias explícitas.

// ============================================================================
// MANTENIMIENTO — recargar sin caché y restablecer el sitio
// ----------------------------------------------------------------------------
// Por qué existe: el navegador guarda los .js y .css del sitio (GitHub Pages
// los sirve con caché de varios minutos) y, tras una actualización, puede
// mezclar un index.html nuevo con un app.js viejo o al revés. Ctrl+F5 no
// siempre revalida todos los recursos. Aquí se hace explícitamente:
//   1. cada recurso de la página (scripts, hojas de estilo, favicon) y el propio
//      HTML se vuelven a pedir con `cache: 'reload'`: el navegador los descarga
//      de nuevo y SUSTITUYE su copia en la caché HTTP; (2027.01.04) y todo lo que
//      importan, módulo a módulo (shared/modulos-del-sitio.js): también los de
//      las pestañas que aún no se abrieron esta vez (la de Ejemplos);
//   2. si algún día hubiera Cache Storage o service workers, se vacían y se dan
//      de baja (hoy el sitio no los usa; queda por si acaso);
//   3. opcionalmente (restablecer) se borran localStorage, sessionStorage e
//      IndexedDB (aquí solo guardan el estado de salud de los proxies del
//      Buscador, el flujo PRISMA de la sesión y, desde la 2026.12.26, la clave
//      de Web of Science si el usuario la guardó: habrá que volver a pegarla);
//   4. se recarga la página.
// Lo que NO se pierde: los archivos que el usuario haya descargado. Lo que SÍ:
// la configuración que tenga a medias en el Simulador (vive en la página).
// ============================================================================

import { recorrerSitio } from './modulos-del-sitio.js';

const ESTADO = { enCurso: false };

function escribir(log, texto, clase) {
    if (!log) return;
    const linea = document.createElement('div');
    linea.textContent = texto;
    if (clase) linea.className = clase;
    log.appendChild(linea);
    log.scrollTop = log.scrollHeight;
}

// URLs de los recursos cargados por la página (sin duplicados, mismo origen o no: fetch los revalida igual)
function recursosDeLaPagina() {
    const urls = new Set();
    document.querySelectorAll('script[src]').forEach(s => urls.add(s.src));
    document.querySelectorAll('link[rel~="stylesheet"][href], link[rel~="icon"][href]').forEach(l => urls.add(l.href));
    // (F5) todo lo que el navegador registró como recurso: módulos ES importados, hojas @import, JSON y terceros
    try { performance.getEntriesByType('resource').forEach(e => { if (/\.(m?js|css|json|svg)(\?|$)/.test(e.name)) urls.add(e.name); }); } catch (e) { /* sin Performance API */ }
    // el Worker del generador no está en el DOM: se añade con la versión del sitio
    const version = (window.StatSim && StatSim.version) || '1';
    urls.add(new URL('src/simulador/worker/generador.worker.js?v=' + encodeURIComponent(version), location.href).href);
    return Array.from(urls);
}

// (2027.01.04) Los recursos de la página y todo lo que importan (shared/modulos-del-sitio.js), de cuatro en cuatro para no
// saturar: hasta la 2027.01.03 solo los que el navegador había anotado al cargar (un registro de 250, que la página llena
// antes de terminar de arrancar), y los módulos de una pestaña que se carga después (la de Ejemplos) seguían viejos.
async function revalidar(urls, log) {
    const delSitio = url => new URL(url, location.href).origin === location.origin;
    const { pedidas, fallidas } = await recorrerSitio(urls.map(u => new URL(u, location.href).href), {
        delSitio,
        // los recursos de otros dominios (CDN) se piden en modo opaco: refrescan su caché igual
        obtener: url => fetch(url, delSitio(url) ? { cache: 'reload', credentials: 'same-origin' } : { cache: 'reload', mode: 'no-cors' }),
        aLaVez: 4,
    });
    escribir(log, `Recursos vueltos a descargar: ${pedidas.length}${fallidas.length ? ` (${fallidas.length} no disponibles)` : ''}`);
}

async function vaciarCaches(log) {
    if (!('caches' in window)) return;
    try {
        const nombres = await caches.keys();
        await Promise.all(nombres.map(n => caches.delete(n)));
        if (nombres.length) escribir(log, `Cache Storage vaciado (${nombres.length})`);
    } catch (e) { escribir(log, 'Cache Storage: no se pudo vaciar (' + e.message + ')', 'aviso'); }
}

async function bajaServiceWorkers(log) {
    if (!('serviceWorker' in navigator)) return;
    try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
        if (regs.length) escribir(log, `Service workers dados de baja: ${regs.length}`);
    } catch (e) { escribir(log, 'Service workers: no se pudieron dar de baja (' + e.message + ')', 'aviso'); }
}

async function borrarAlmacenamiento(log) {
    try { const n = localStorage.length; localStorage.clear(); escribir(log, `localStorage borrado (${n} claves)`); } catch (e) { escribir(log, 'localStorage: no accesible', 'aviso'); }
    try { const n = sessionStorage.length; sessionStorage.clear(); escribir(log, `sessionStorage borrado (${n} claves)`); } catch (e) { escribir(log, 'sessionStorage: no accesible', 'aviso'); }
    if (window.indexedDB && indexedDB.databases) {
        try {
            const bases = (await indexedDB.databases()).filter(b => b && b.name);
            await Promise.all(bases.map(b => new Promise(res => { const req = indexedDB.deleteDatabase(b.name); req.onsuccess = req.onerror = req.onblocked = () => res(); })));
            if (bases.length) escribir(log, `IndexedDB borrado (${bases.length} bases)`);
        } catch (e) { escribir(log, 'IndexedDB: no se pudo borrar (' + e.message + ')', 'aviso'); }
    }
}

// (2026.12.30) Lo que el restablecimiento borraría, según lo que de verdad hay guardado en este navegador: la confirmación
// lo nombra. Hasta la 2026.12.29 no decía que se pierden la última redacción del Redactor ni la tabla de la V de Aiken.
const GUARDADOS_LOCALES = Object.freeze([
    ['statsim_redactor_ultimo', 'la última redacción del Redactor (la que ofrece «Recuperar última redacción»)'],
    ['statsim.aiken.v1', 'la tabla de valoraciones de la V de Aiken'],
    ['statsim_wos_clave', 'tu clave de Web of Science'],
    ['statsim_ranking_psyc_v5', 'el ranking de revistas descargado (se volverá a descargar)'],
    ['statsim_proxy_health', 'el estado de los proxies del Buscador']
]);
const GUARDADOS_DE_SESION = Object.freeze([
    ['statsim_protocolo_busqueda_v1', 'el protocolo de búsqueda de esta sesión'],
    ['statsim_prisma_flujo_v1', 'el flujo PRISMA de esta sesión']
]);

/** Las descripciones de lo guardado que hay ahora (las claves conocidas). @returns {string[]} */
function guardadosPresentes() {
    const presentes = [];
    const mirar = (almacen, lista) => { try { for (const [clave, texto] of lista) if (almacen.getItem(clave) !== null) presentes.push(texto); } catch (e) { /* almacenamiento no accesible */ } };
    if (typeof localStorage !== 'undefined') mirar(localStorage, GUARDADOS_LOCALES);
    if (typeof sessionStorage !== 'undefined') mirar(sessionStorage, GUARDADOS_DE_SESION);
    return presentes;
}

/** El texto de la confirmación del restablecimiento. @returns {string} */
function textoConfirmacion() {
    const lista = guardadosPresentes();
    const que = lista.length ? `Se borrará lo que el sitio guarda en este navegador: ${lista.join('; ')}.` : 'Se borrará el almacenamiento local del sitio (ahora no guarda nada tuyo).';
    return `${que} La página se recargará, y lo que tengas a medias (la configuración y la base del Simulador, los datos del Analizador) se perderá si no lo guardaste con «Guardar proyecto». ¿Continuar?`;
}

// Recarga SIN caché. `restablecer` añade el borrado del almacenamiento local.
async function recargarSinCache(restablecer) {
    if (ESTADO.enCurso) return;
    const log = document.getElementById('mantenimientoLog');
    const botones = document.querySelectorAll('#btnRecargarSinCache, #btnRestablecerSitio');
    if (restablecer && !window.confirm(textoConfirmacion())) return;
    ESTADO.enCurso = true;
    botones.forEach(b => { b.disabled = true; });
    if (log) { log.textContent = ''; log.hidden = false; }
    escribir(log, restablecer ? 'Restableciendo el sitio…' : 'Recargando sin caché…');
    try {
        await bajaServiceWorkers(log);
        await vaciarCaches(log);
        if (restablecer) await borrarAlmacenamiento(log);
        await revalidar(recursosDeLaPagina(), log);
        // el propio HTML, para que traiga las versiones nuevas de los scripts
        try { await fetch(location.pathname || '/', { cache: 'reload', credentials: 'same-origin' }); escribir(log, 'Página revalidada'); } catch (e) { escribir(log, 'Página: no se pudo revalidar (' + e.message + ')', 'aviso'); }
        escribir(log, 'Listo: recargando…');
        setTimeout(() => location.reload(), 400);
    } catch (e) {
        escribir(log, 'Error inesperado: ' + e.message + '. Prueba cerrando la pestaña y abriendo el sitio de nuevo.', 'aviso');
        ESTADO.enCurso = false;
        botones.forEach(b => { b.disabled = false; });
    }
}

// Versiones de los módulos cargados: en la consola (diagnóstico completo) y,
// en la tarjeta, dentro de un desplegable cerrado que no ocupa espacio.
let versionesRegistradas = false;
function pintarVersiones() {
    const lista = Array.from(document.querySelectorAll('script[src]')).map(s => s.getAttribute('src')).filter(src => /\?v=/.test(src)).map(src => src.replace(/\.js\?v=/, ' v'));
    if (!lista.length) return;
    if (!versionesRegistradas && typeof console !== 'undefined' && console.info) { console.info('[StatSim] Versiones cargadas:\n' + lista.join('\n')); versionesRegistradas = true; }
    const ver = document.getElementById('mantenimientoVersionesLista');
    if (ver) ver.textContent = lista.join(' · ');
}
// Delegación en el documento: los botones funcionan aunque la sección de Ayuda
// se vuelva a pintar después de cargar (los oyentes puestos sobre el botón se
// perderían). Si el botón trae su propio onclick en el HTML, no se duplica.
document.addEventListener('click', e => {
    const b = e.target && e.target.closest ? e.target.closest('#btnRecargarSinCache, #btnRestablecerSitio') : null;
    if (!b || b.hasAttribute('onclick')) return;
    e.preventDefault();
    recargarSinCache(b.id === 'btnRestablecerSitio');
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pintarVersiones); else pintarVersiones();
window.addEventListener('load', pintarVersiones);

// Autotest del generador bajo demanda (el módulo no se carga con la página):
//   StatSimMantenimiento.autotest()  →  carga generador-autotest.js y lo ejecuta en la consola
const autotest = () => (window.StatSim && StatSim.autotest ? StatSim.autotest() : Promise.reject(new Error('StatSim no está cargado')));

export { recargarSinCache, autotest, textoConfirmacion };
