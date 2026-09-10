// ============================================================================
// MANTENIMIENTO — recargar sin caché y restablecer el sitio
// ----------------------------------------------------------------------------
// Por qué existe: el navegador guarda los .js y .css del sitio (GitHub Pages
// los sirve con caché de varios minutos) y, tras una actualización, puede
// mezclar un index.html nuevo con un app.js viejo o al revés. Ctrl+F5 no
// siempre revalida todos los recursos. Aquí se hace explícitamente:
//   1. cada recurso de la página (scripts, hojas de estilo, favicon) y el propio
//      HTML se vuelven a pedir con `cache: 'reload'`: el navegador los descarga
//      de nuevo y SUSTITUYE su copia en la caché HTTP;
//   2. si algún día hubiera Cache Storage o service workers, se vacían y se dan
//      de baja (hoy el sitio no los usa; queda por si acaso);
//   3. opcionalmente (restablecer) se borran localStorage, sessionStorage e
//      IndexedDB (aquí solo guardan el estado de salud de los proxies del
//      Buscador y el flujo PRISMA de la sesión: nada que el usuario haya creado);
//   4. se recarga la página.
// Lo que NO se pierde: los archivos que el usuario haya descargado. Lo que SÍ:
// la configuración que tenga a medias en el Simulador (vive en la página).
// ============================================================================
(function () {
    'use strict';

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
        // el Worker del generador no está en el DOM: se añade con la versión que indique app.js
        const app = document.querySelector('script[src^="app.js"]');
        if (app) urls.add(new URL('generador-worker.js', location.href).href);
        return Array.from(urls);
    }

    async function revalidar(urls, log) {
        let ok = 0, fallos = 0;
        // de cuatro en cuatro para no saturar
        for (let i = 0; i < urls.length; i += 4) {
            await Promise.all(urls.slice(i, i + 4).map(async url => {
                try {
                    // los recursos de otros dominios (CDN) se piden en modo opaco: refrescan su caché igual
                    const mismoOrigen = new URL(url, location.href).origin === location.origin;
                    const r = await fetch(url, mismoOrigen ? { cache: 'reload', credentials: 'same-origin' } : { cache: 'reload', mode: 'no-cors' });
                    if (r.ok || r.type === 'opaque') ok++; else fallos++;
                } catch (e) { fallos++; }
            }));
        }
        escribir(log, `Recursos vueltos a descargar: ${ok}${fallos ? ` (${fallos} no disponibles)` : ''}`);
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

    // Recarga SIN caché. `restablecer` añade el borrado del almacenamiento local.
    async function recargarSinCache(restablecer) {
        if (ESTADO.enCurso) return;
        const log = document.getElementById('mantenimientoLog');
        const botones = document.querySelectorAll('#btnRecargarSinCache, #btnRestablecerSitio');
        if (restablecer && !window.confirm('Se borrará el almacenamiento local del sitio (estado de los proxies del Buscador y flujo PRISMA de la sesión) y se recargará la página. La configuración que tengas a medias en el Simulador se perderá si no la has exportado. ¿Continuar?')) return;
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

    window.StatSimMantenimiento = { recargarSinCache };
})();
