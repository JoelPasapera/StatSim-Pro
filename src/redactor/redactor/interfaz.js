// redactor/redactor/interfaz.js — RedactorTeorico: montaje de la interfaz del Redactor.
// Origen: redactor/redactor.js (Fase 6: partición por responsabilidad, sin cambios de comportamiento).

export const metodosRedactorTeoricoInterfaz = {
    montar() {
        if (this._montado) return; // guardia: montar() dos veces duplicaría listeners
        const cont = document.getElementById('antRedactor');
        if (!cont) return; // el buscador aún no está montado
        this._montado = true;
        cont.innerHTML = `
          <div class="form-group" style="margin-top:1.5rem; padding-top:1.2rem; border-top:1px dashed var(--color-border, #e5e5e5);">
            <h3 style="margin:0 0 0.3rem; font-size:1.05rem;">📝 Redacción del marco teórico (borrador asistido)</h3>
            <p class="help-text" style="margin:0 0 0.6rem;">La IA redacta un borrador sustentado <strong>únicamente en las fuentes de tu matriz</strong> (respetando el filtro de relevancia). Es un punto de partida: <strong>verifica cada cita contra la fuente original</strong>, corrige y reescribe con tu voz antes de usarlo.</p>
            <div id="redFuentesInfo" class="help-text" style="margin:0 0 0.8rem;"></div>
            <div style="margin:0 0 1rem; padding:0.7rem 0.9rem; border:1px dashed var(--color-border, #ccc); border-radius:0.5rem;">
              <label class="label" style="display:block; margin:0 0 0.5rem;">📂 Matriz de fuentes para redactar</label>
              <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
                <button id="redUsarGenerada" class="btn btn-primary" style="padding:0.4rem 1rem;">📊 Usar la matriz generada</button>
                <button id="redSubirArchivo" class="btn btn-outline" style="padding:0.4rem 1rem;">📁 Subir archivo (.xlsx / .csv)</button>
                <input type="file" id="redArchivo" accept=".xlsx,.csv" style="display:none;">
                <button id="redQuitarImport" class="btn btn-outline" style="padding:0.25rem 0.7rem; display:none;">✕ Quitar matriz importada</button>
              </div>
              <p class="help-text" style="margin:0.5rem 0 0.2rem;">🎯 <b>Filtrar por relevancia:</b> 
                <select id="redFiltroRel" style="padding:0.15rem 0.4rem;">
                  <option value="0">Todas las fuentes</option>
                  <option value="2">≥ 2</option>
                  <option value="3">≥ 3</option>
                  <option value="4">≥ 4</option>
                  <option value="5">≥ 5</option>
                </select> <span id="redFiltroRelInfo" class="help-text"></span></p>
              <p class="help-text" style="margin:0.4rem 0 0;"><b>Usar la matriz generada</b>: redacta con lo que tengas ahora en el Buscador (respetando el filtro de relevancia). <b>Subir archivo</b>: usa una matriz exportada antes — Excel (.xlsx), CSV español (;) o CSV internacional (,) — sin repetir la búsqueda.</p>
              <div id="redImportInfo" class="help-text" style="margin-top:0.4rem;"></div>
            </div>
            <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap; margin-top:0.2rem;">
              <button id="redRedactarTodo" class="btn btn-primary" style="padding:0.45rem 1.1rem;">📄 Redactar marco teórico completo</button>
              <button id="redProbar" class="btn btn-outline" style="padding:0.4rem 1rem;">✍️ Probar solo una sección</button>
              <button id="redDescargarWord" class="btn btn-outline" style="padding:0.4rem 1rem; display:none;">⬇ Descargar Word (.docx)</button>
              <button id="redDescargarPDF" class="btn btn-outline" style="padding:0.4rem 1rem; display:none;">⬇ Descargar PDF</button>
              <button id="redPaseF3" class="btn btn-outline" style="padding:0.4rem 1rem; display:none;">🧪 Pase de coherencia (F3)</button>
              <button id="redCopiar" class="btn btn-outline" style="padding:0.4rem 1rem; display:none;">📋 Copiar texto</button>
            </div>
            <p class="help-text" style="margin:0.4rem 0 0;">El documento completo redacta todas las secciones en paralelo (planteamiento, estado de la cuestión, antecedentes, bases teóricas y modelos por variable, justificación y definiciones), con la regla de oro: <strong>toda idea con su cita</strong>. Al terminar podrás descargarlo como Word (.docx) en formato APA con las referencias al final.</p>
            <div id="redEstado" class="help-text" style="margin-top:0.5rem;"></div>
            <a id="redRecuperar" href="#" class="help-text" style="display:none; margin-top:0.3rem; text-decoration:underline; cursor:pointer;">📂 Recuperar última redacción</a>
            <div id="redResultado" style="display:none; margin-top:0.8rem; padding:1rem; border:1px solid var(--color-border, #ddd); border-radius:0.5rem; background:#fafafa; white-space:pre-wrap; font-family:'Times New Roman', serif; font-size:0.95rem; line-height:1.6; max-height:28rem; overflow:auto;"></div>
          </div>`;
        // Variables de estudio: se montan ARRIBA, entre «Problema de investigación»
        // y «Criterios» (flujo natural: problema → variables → criterios). Si el
        // slot no existiera (versión vieja del buscador), caen dentro del redactor.
        const slotVars = document.getElementById('antVariablesSlot') || cont;
        const bloqueVars = document.createElement('div');
        bloqueVars.className = 'form-group';
        bloqueVars.style.marginTop = '1rem';
        bloqueVars.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.4rem;">
              <label class="label" for="redVariables" style="margin:0;">Variables de estudio</label>
              <button id="redIdentificar" class="btn btn-outline" style="padding:0.3rem 0.8rem;">🧩 Identificar variables</button>
            </div>
            <textarea id="redVariables" class="input" rows="4" style="resize:vertical;"
              placeholder="Una variable por línea, con el formato:  Nombre — definición conceptual breve.&#10;Pulsa «Identificar variables» para que la IA las proponga a partir del problema de investigación; luego edítalas a tu criterio."></textarea>
            <p class="help-text" style="margin:0.4rem 0 0;">La IA propone; tú confirmas. Estas variables guiarán los criterios y todas las secciones del marco teórico.</p>`;
        if (slotVars === cont) cont.insertBefore(bloqueVars, cont.firstChild); else slotVars.appendChild(bloqueVars);
        const btnVar = document.getElementById('redIdentificar');
        if (btnVar) btnVar.addEventListener('click', () => this._onIdentificarVariables());
        const btnProbar = document.getElementById('redProbar');
        if (btnProbar) btnProbar.addEventListener('click', () => this._onProbarSeccion());
        console.info('[Redactor] versión ' + this._VERSION + ' activa · verificación: RedactorTeorico.autotest()');
        const rec = document.getElementById('redRecuperar');
        if (rec) {
            rec.addEventListener('click', (ev) => { ev.preventDefault(); this._recuperarUltimo(); });
            try {
                const g = JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(this._CLAVE_GUARDADO)) || 'null');
                if (g && Array.isArray(g.secciones) && g.secciones.length) {
                    const min = Math.max(1, Math.round((Date.now() - (g.t || Date.now())) / 60000));
                    rec.textContent = `📂 Recuperar última redacción (hace ${min < 60 ? min + ' min' : Math.round(min / 60) + ' h'})`;
                    rec.style.display = '';
                }
            } catch (e) {}
        }
        const inpArchivo = document.getElementById('redArchivo');
        if (inpArchivo) inpArchivo.addEventListener('change', (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) this._onArchivo(f);
            e.target.value = ''; // permite volver a cargar el mismo archivo
        });
        const btnQuitar = document.getElementById('redQuitarImport');
        if (btnQuitar) btnQuitar.addEventListener('click', () => this._quitarImportadas());
        const bSubir = document.getElementById('redSubirArchivo');
        if (bSubir) bSubir.addEventListener('click', () => {
            const f = document.getElementById('redArchivo');
            if (f) f.click();
        });
        const bGen = document.getElementById('redUsarGenerada');
        if (bGen) bGen.addEventListener('click', () => {
            const q2 = document.getElementById('redQuitarImport');
            if (q2 && q2.style.display !== 'none') q2.click();
            else this.actualizarInfoFuentes();
            const info = document.getElementById('redImportInfo');
            if (info) info.textContent = '📊 Redactando con la matriz generada en el Buscador (con su filtro de relevancia).';
        });
        const btnTodo = document.getElementById('redRedactarTodo');
        if (btnTodo) btnTodo.addEventListener('click', () => this._onRedactarTodo());
        const btnWord = document.getElementById('redDescargarWord');
        if (btnWord) btnWord.addEventListener('click', () => this._onDescargarWord());
        const btnPDF = document.getElementById('redDescargarPDF');
        if (btnPDF) btnPDF.addEventListener('click', () => this._onDescargarPDF());
        const btnF3 = document.getElementById('redPaseF3');
        if (btnF3) btnF3.addEventListener('click', () => this._onPaseF3());
        const selRel = document.getElementById('redFiltroRel');
        if (selRel) selRel.addEventListener('change', () => {
            this._filtroRel = parseInt(selRel.value, 10) || 0;
            const guard = this._filtroRel; this._filtroRel = 0;
            const todas = this._fuentes(); const tot = todas.length;
            const sinDato = todas.filter(f => this._valorRelevancia(f) === null).length;
            this._filtroRel = guard;
            const pasan = this._fuentes().length;
            const info = document.getElementById('redFiltroRelInfo');
            if (info) info.textContent = guard === 0 ? '' : `→ ${pasan} de ${tot} fuente(s) pasan el filtro${sinDato ? ` (${sinDato} sin dato de relevancia, incluidas)` : ''}.`;
        });
        const btnCopiar = document.getElementById('redCopiar');
        if (btnCopiar) btnCopiar.addEventListener('click', () => this._onCopiar());
        this.actualizarInfoFuentes();
    },
};
