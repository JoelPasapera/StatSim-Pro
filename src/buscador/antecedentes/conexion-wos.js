// @ts-check
// buscador/antecedentes/conexion-wos.js — Antecedentes: Web of Science en la interfaz: el panel de la conexión (la clave
// guardada en este navegador, el relevo y la prueba) y el botón «Abrir en Web of Science».
// (2026.12.26) La búsqueda en sí es una tarea más de _buscarUnaConsulta (busqueda.js); la fuente, fuentes/wos.js.

import { WebOfScienceDirecto } from '../fuentes/wos.js';
import { escaparHTML } from '../../shared/html.js';

/**
 * Lo que estos métodos usan del objeto Antecedentes (los demás módulos de su composición) y de sí mismos.
 * @typedef {object} Anfitrion
 * @property {() => [string, string][]} _idiomasSeleccionados
 * @property {(texto: string, desde: string, hacia: string) => Promise<string>} traducirTexto
 * @property {() => string} _htmlConexionWos
 * @property {() => void} _pintarEstadoWos
 * @property {(mensaje: string) => void} _avisarWos
 * @property {() => boolean} _onGuardarClaveWos
 * @property {() => void} _onOlvidarClaveWos
 * @property {() => Promise<void>} _onProbarWos
 * @property {() => Promise<void>} _onAbrirWos
 */

/** @param {string} id */
const entrada = id => /** @type {HTMLInputElement | null} */ (document.getElementById(id));

export const metodosAntecedentesWos = {

    /**
     * El panel plegable de la conexión, bajo la casilla de Web of Science.
     * @this {Anfitrion}
     */
    _htmlConexionWos() {
        return `
              <details id="antWosConexion" style="margin:0 0 0.6rem 1.6rem; border:1px solid var(--color-border, #39415a); border-radius:8px; padding:0.4rem 0.8rem; font-size:0.85em;">
                <summary style="cursor:pointer;">🔑 Conexión con Web of Science <span id="antWosResumen" style="color:var(--color-text-soft, #8b93a7);"></span></summary>
                <div style="margin-top:0.5rem; line-height:1.55;">
                  <p style="margin:0 0 0.5rem;">Web of Science (Clarivate) solo responde con una clave de su API <b>Starter</b>, que se pide gratis en <a href="${WebOfScienceDirecto.URL_PORTAL}" target="_blank" rel="noopener">developer.clarivate.com</a>. Con el <b>plan institucional</b> (si tu universidad está suscrita a Web of Science) son 5000 peticiones al día y trae el recuento de citas; con el <b>plan de prueba</b>, 50 al día y sin citas. Cada 50 resultados son 1 petición.</p>
                  <div style="display:flex; gap:0.4rem; flex-wrap:wrap; align-items:center;">
                    <input type="password" id="antWosClave" class="input" autocomplete="off" spellcheck="false" placeholder="Pega aquí tu clave (X-ApiKey)" style="flex:1; min-width:14rem; padding:0.3rem 0.5rem;">
                    <button type="button" id="antWosGuardar" class="btn btn-outline" style="padding:0.3rem 0.8rem;">Usar esta clave</button>
                    <button type="button" id="antWosProbar" class="btn btn-outline" style="padding:0.3rem 0.8rem;" title="Una petición mínima: gasta 1 de la cuota del día">Probar conexión</button>
                    <button type="button" id="antWosOlvidar" class="btn btn-outline" style="padding:0.3rem 0.8rem;">Olvidar la clave</button>
                  </div>
                  <label style="display:inline-flex; align-items:center; gap:0.35rem; margin-top:0.35rem;"><input type="checkbox" id="antWosRecordar" checked> Recordarla en este navegador (sin marcar, vale solo mientras la página esté abierta)</label>
                  <div id="antWosEstado" class="help-text" role="status" aria-live="polite" style="margin-top:0.4rem;"></div>
                  <p class="help-text" style="margin:0.4rem 0 0;">La clave no sale de este navegador salvo hacia Clarivate (o el relevo propio del sitio), nunca hacia los proxies públicos. Recordada, queda en el almacenamiento del sitio, que comparten las páginas publicadas en su mismo dominio: si prefieres, no la recuerdes. Si el navegador bloquea la llamada directa a Clarivate (CORS), Web of Science necesita el relevo del sitio, que configura quien lo publica.</p>
                </div>
              </details>`;
    },

    /**
     * Cablea el panel y el botón «Abrir en Web of Science» (lo llama montar()).
     * @this {Anfitrion}
     */
    _cablearWos() {
        const guardar = document.getElementById('antWosGuardar'), olvidar = document.getElementById('antWosOlvidar');
        const probar = document.getElementById('antWosProbar'), web = document.getElementById('antWosWeb'), clave = entrada('antWosClave');
        if (guardar) guardar.addEventListener('click', () => this._onGuardarClaveWos());
        if (olvidar) olvidar.addEventListener('click', () => this._onOlvidarClaveWos());
        if (probar) probar.addEventListener('click', () => { this._onProbarWos(); });
        if (web) web.addEventListener('click', () => { this._onAbrirWos(); });
        if (clave) clave.addEventListener('keydown', e => { if (/** @type {KeyboardEvent} */ (e).key === 'Enter') this._onGuardarClaveWos(); });
        this._pintarEstadoWos();
    },

    /**
     * El estado de la conexión, en el panel y en su título plegado.
     * @this {Anfitrion}
     */
    _pintarEstadoWos() {
        const W = WebOfScienceDirecto, modo = W.modo(), clave = W.claveVisible(), recordada = W.claveRecordada();
        const resumen = document.getElementById('antWosResumen');
        if (resumen) resumen.textContent = !modo ? '— sin clave: no se consultará'
            : W.cuotaAgotada() ? '— cuota de hoy agotada' : `— lista${clave ? ` (clave ${clave})` : ' (relevo del sitio)'}`;
        const donde = recordada ? 'guardada en este navegador' : 'en uso solo mientras la página esté abierta';
        const texto = modo === 'relevo'
            ? (clave ? `Por el relevo del sitio, con tu clave ${clave} (${donde}).` : 'Por el relevo del sitio, con sus claves (no hace falta la tuya).')
            : modo === 'directo' ? `Clave ${clave} ${donde}: la búsqueda llama directo a Clarivate.`
                : 'Sin clave: pega la tuya y pulsa «Usar esta clave».';
        this._avisarWos(texto + (W.cuotaAgotada() ? ' ⚠️ ' + W.mensajeCuota().replace(/^./, c => c.toUpperCase()) + '.' : ''));
    },

    /** @this {Anfitrion} @param {string} mensaje */
    _avisarWos(mensaje) {
        const el = document.getElementById('antWosEstado');
        if (el) el.textContent = mensaje;
    },

    /**
     * Guarda la clave del campo (y marca la casilla). Devuelve si quedó guardada.
     * @this {Anfitrion}
     */
    _onGuardarClaveWos() {
        const campo = entrada('antWosClave'), recordar = entrada('antWosRecordar');
        const quiereRecordar = !recordar || recordar.checked;
        try {
            const persistente = WebOfScienceDirecto.guardarClave(campo ? campo.value : '', { recordar: quiereRecordar });
            if (campo) campo.value = '';
            const casilla = entrada('antUsarWos');
            if (casilla) { casilla.checked = true; casilla.dispatchEvent(new Event('change', { bubbles: true })); }
            this._pintarEstadoWos();
            if (!persistente && quiereRecordar) this._avisarWos('Este navegador no deja guardar datos: la clave vale solo mientras la página esté abierta.');
            return true;
        } catch (e) {
            this._avisarWos('❌ ' + /** @type {Error} */ (e).message + '.');
            return false;
        }
    },

    /** @this {Anfitrion} */
    _onOlvidarClaveWos() {
        WebOfScienceDirecto.olvidarClave();
        const casilla = entrada('antUsarWos');
        if (casilla && !WebOfScienceDirecto.configurada()) { casilla.checked = false; casilla.dispatchEvent(new Event('change', { bubbles: true })); }
        this._pintarEstadoWos();
    },

    /**
     * Prueba la conexión (gasta 1 petición de la cuota) y dice qué pasó y, si falla, qué hacer.
     * @this {Anfitrion}
     */
    async _onProbarWos() {
        const campo = entrada('antWosClave');
        if (campo && campo.value.trim() && !this._onGuardarClaveWos()) return;   // una clave recién pegada se guarda antes de probarla
        if (!WebOfScienceDirecto.configurada()) { this._avisarWos('Primero pega tu clave y pulsa «Usar esta clave».'); return; }
        const boton = /** @type {HTMLButtonElement | null} */ (document.getElementById('antWosProbar'));
        if (boton) boton.disabled = true;
        this._avisarWos('⏳ Probando la conexión con Web of Science…');
        try {
            const r = await WebOfScienceDirecto.probar();
            this._pintarEstadoWos();   // la cuota pudo volver: el título plegado lo refleja
            this._avisarWos(`✓ Conexión correcta (${r.via === 'relevo' ? 'por el relevo del sitio' : 'directa a Clarivate'}). `
                + (r.conCitas ? 'El plan trae el recuento de citas (institucional).' : 'Sin recuento de citas: parece el plan de prueba (50 peticiones al día).'));
        } catch (e) {
            if (WebOfScienceDirecto.cuotaAgotada()) this._pintarEstadoWos();
            this._avisarWos('❌ ' + /** @type {Error} */ (e).message + '.');
        } finally {
            if (boton) boton.disabled = false;
        }
    },

    /**
     * Abre la búsqueda avanzada de webofscience.com con la ecuación copiada: el sitio no acepta una búsqueda en la
     * dirección, así que se pega (la ecuación queda también a la vista, por si el navegador no deja copiar).
     * @this {Anfitrion}
     */
    async _onAbrirWos() {
        const estado = document.getElementById('antEstado'), consulta = entrada('antQuery'), desde = entrada('antDesde');
        let q = consulta ? consulta.value.trim() : '';
        if (!q) { if (estado) estado.textContent = 'Escribe primero los términos de búsqueda.'; return; }
        // Web of Science indexa en inglés: si ese idioma está marcado, la ecuación va traducida (como en Scopus y PubMed).
        if (this._idiomasSeleccionados().some(([c]) => c === 'en')) q = await this.traducirTexto(q, 'es', 'en');
        const ecuacion = WebOfScienceDirecto.ecuacion(q, { desde: desde ? desde.value : '' });
        if (!ecuacion) { if (estado) estado.textContent = 'La consulta no tiene términos que buscar en Web of Science.'; return; }
        let copiada = false;
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(ecuacion); copiada = true; }
        } catch (e) { /* el navegador no deja copiar: la ecuación queda a la vista */ }
        window.open(WebOfScienceDirecto.URL_BUSQUEDA_AVANZADA, '_blank', 'noopener');
        if (estado) estado.innerHTML = (copiada ? '📋 Ecuación copiada: pégala en «Advanced Search» de Web of Science → ' : 'Copia esta ecuación en «Advanced Search» de Web of Science → ')
            + `<code style="user-select:all;">${escaparHTML(ecuacion)}</code>`;
    }
};
