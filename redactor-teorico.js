// ========================================
// REDACTOR DEL MARCO TEÓRICO (borrador asistido por IA) — Sesión A.
// La IA redacta un borrador sustentado ÚNICAMENTE en las fuentes de la matriz
// de revisión (respetando el filtro de relevancia). Anti-alucinación: solo puede
// citar las fuentes reales, con citas cortas ya construidas por la app, y las
// citas textuales solo pueden salir de los resúmenes.
//
// IMPORTANTE (honestidad académica): el resultado es un BORRADOR de trabajo.
// El investigador debe verificar cada cita contra la fuente original, corregir
// y reescribir con su propia voz antes de usarlo en la tesis.
// ========================================

const RedactorTeorico = {

    _textos: {}, // secciones redactadas: { clave: { titulo, texto, fuentesUsadas } }

    montar() {
        const cont = document.getElementById('antRedactor');
        if (!cont) return; // el buscador aún no está montado

        cont.innerHTML = `
          <div class="form-group" style="margin-top:1.5rem; padding-top:1.2rem; border-top:1px dashed var(--color-border, #e5e5e5);">
            <h3 style="margin:0 0 0.3rem; font-size:1.05rem;">📝 Redacción del marco teórico (borrador asistido)</h3>
            <p class="help-text" style="margin:0 0 0.6rem;">La IA redacta un borrador sustentado <strong>únicamente en las fuentes de tu matriz</strong> (respetando el filtro de relevancia). Es un punto de partida: <strong>verifica cada cita contra la fuente original</strong>, corrige y reescribe con tu voz antes de usarlo.</p>
            <div id="redFuentesInfo" class="help-text" style="margin:0 0 0.8rem;"></div>

            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.4rem;">
              <label class="label" for="redVariables" style="margin:0;">Variables de estudio</label>
              <button id="redIdentificar" class="btn btn-outline" style="padding:0.3rem 0.8rem;">🧩 Identificar variables</button>
            </div>
            <textarea id="redVariables" class="input" rows="4" style="resize:vertical;"
              placeholder="Una variable por línea, con el formato:  Nombre — definición conceptual breve.&#10;Pulsa «Identificar variables» para que la IA las proponga a partir del problema de investigación; luego edítalas a tu criterio."></textarea>
            <p class="help-text" style="margin:0.4rem 0 0;">La IA propone; tú confirmas. Estas variables guiarán todas las secciones del marco teórico.</p>

            <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap; margin-top:1rem;">
              <button id="redProbar" class="btn btn-primary" style="padding:0.4rem 1rem;">✍️ Probar el motor: redactar «Planteamiento del problema»</button>
            </div>
            <p class="help-text" style="margin:0.4rem 0 0;">Prueba con una sección real para validar la calidad del texto y de las citas antes de generar el documento completo (siguiente fase).</p>
            <div id="redEstado" class="help-text" style="margin-top:0.5rem;"></div>
            <div id="redResultado" style="display:none; margin-top:0.8rem; padding:1rem; border:1px solid var(--color-border, #ddd); border-radius:0.5rem; background:#fafafa; white-space:pre-wrap; font-family:'Times New Roman', serif; font-size:0.95rem; line-height:1.6; max-height:28rem; overflow:auto;"></div>
          </div>`;

        const btnVar = document.getElementById('redIdentificar');
        if (btnVar) btnVar.addEventListener('click', () => this._onIdentificarVariables());
        const btnProbar = document.getElementById('redProbar');
        if (btnProbar) btnProbar.addEventListener('click', () => this._onProbarSeccion());

        this.actualizarInfoFuentes();
    },

    // ---- Fuentes: las de la matriz (marcadas) respetando el filtro de relevancia ----
    _fuentes() {
        if (typeof Antecedentes === 'undefined' || !Antecedentes.obtenerFuentesRedaccion) return [];
        const obras = Antecedentes.obtenerFuentesRedaccion();
        return obras.map(o => ({
            cita: this._citaCorta(o),
            ref: (Antecedentes.citaAPA ? Antecedentes.citaAPA(o) : ''),
            titulo: o.titulo || '',
            anio: o.anio || '',
            resumen: o.resumen || o.abstract || ''
        }));
    },

    // Cita corta APA a partir de los autores: (Apellido, año) · (A y B, año) ·
    // (A et al., año). La construye la app para que el modelo NO la invente.
    _apellido(nombre) {
        const n = String(nombre || '').trim();
        if (!n) return '';
        if (n.includes(',')) return n.split(',')[0].trim(); // "García, J." → García
        const partes = n.split(/\s+/);
        return partes[partes.length - 1]; // "Juan García" → García
    },
    _citaCorta(o) {
        const autores = (o.autores || []).map(a => this._apellido(a)).filter(Boolean);
        const anio = o.anio || 's. f.';
        if (!autores.length) {
            // Sin autores: usar las primeras palabras del título (regla APA de recurso).
            const t = String(o.titulo || 'Anónimo').split(/\s+/).slice(0, 3).join(' ');
            return `("${t}", ${anio})`;
        }
        if (autores.length === 1) return `(${autores[0]}, ${anio})`;
        if (autores.length === 2) return `(${autores[0]} y ${autores[1]}, ${anio})`;
        return `(${autores[0]} et al., ${anio})`;
    },

    actualizarInfoFuentes() {
        const info = document.getElementById('redFuentesInfo');
        if (!info) return;
        const n = this._fuentes().length;
        let filtro = '';
        if (typeof Antecedentes !== 'undefined' && Antecedentes._relevanciaAplicada && Antecedentes._umbralRelevancia > 0) {
            filtro = ` (filtro: relevancia ≥ ${Antecedentes._umbralRelevancia})`;
        }
        info.textContent = n
            ? `📚 Fuentes disponibles para la redacción: ${n}${filtro}.`
            : '📚 Aún no hay fuentes: busca, marca artículos en la matriz y (recomendado) analiza y filtra por relevancia.';
    },

    // ---- Identificar variables con IA (editables por el usuario) ----
    async _onIdentificarVariables() {
        const problema = (document.getElementById('antProblema') || {}).value || '';
        const caja = document.getElementById('redVariables');
        const estado = document.getElementById('redEstado');
        const btn = document.getElementById('redIdentificar');

        if (problema.trim().length < 15) {
            if (estado) estado.textContent = '⚠️ Escribe primero el problema de investigación (arriba, en «Búsqueda intensiva»).';
            const p = document.getElementById('antProblema'); if (p) p.focus();
            return;
        }
        if (caja && caja.value.trim().length > 5) {
            if (!confirm('Ya tienes variables escritas. ¿Reemplazarlas por una nueva propuesta de la IA?')) return;
        }

        const t = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Identificando…'; }
        if (estado) estado.textContent = 'La IA está identificando las variables de estudio…';
        try {
            if (typeof IAAsistente === 'undefined') throw new Error('El asistente de IA no está cargado.');
            const vars = await IAAsistente.extraerVariables(problema);
            if (caja) caja.value = vars.map(v => `${v.nombre} — ${v.definicion}`).join('\n');
            if (estado) estado.textContent = `✓ ${vars.length} variable(s) identificada(s). Revísalas y edítalas a tu criterio.`;
        } catch (e) {
            if (estado) estado.textContent = '❌ ' + (e.message || 'No se pudieron identificar las variables.');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = t; }
        }
    },

    // ---- Probar el motor: redactar el Planteamiento del problema ----
    async _onProbarSeccion() {
        const estado = document.getElementById('redEstado');
        const btn = document.getElementById('redProbar');
        const res = document.getElementById('redResultado');
        const problema = (document.getElementById('antProblema') || {}).value || '';
        const variablesTexto = (document.getElementById('redVariables') || {}).value || '';

        this.actualizarInfoFuentes();
        const fuentes = this._fuentes();

        if (problema.trim().length < 15) {
            if (estado) estado.textContent = '⚠️ Falta el problema de investigación (arriba).';
            return;
        }
        if (variablesTexto.trim().length < 5) {
            if (estado) estado.textContent = '⚠️ Identifica (o escribe) primero las variables de estudio.';
            return;
        }
        if (!fuentes.length) {
            if (estado) estado.textContent = '⚠️ No hay fuentes en la matriz: busca y marca artículos primero.';
            return;
        }

        const t = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Redactando…'; }
        if (estado) estado.textContent = `✍️ Redactando con ${Math.min(fuentes.length, 20)} fuentes (modelo potente)… puede tardar ~1 minuto.`;
        const _t0 = performance.now();
        try {
            if (typeof IAAsistente === 'undefined') throw new Error('El asistente de IA no está cargado.');
            const texto = await IAAsistente.redactarSeccion({
                titulo: 'Planteamiento del problema',
                instrucciones: 'Presenta la magnitud y relevancia del problema (con datos epidemiológicos o '
                    + 'de prevalencia SOLO si aparecen en los resúmenes de las fuentes), el contexto en que '
                    + 'ocurre, sus consecuencias y el vacío que justifica investigarlo. Cierra con la '
                    + 'formulación del problema en forma de pregunta.',
                problema,
                variablesTexto,
                fuentes,
                keyHint: 0
            });
            const seg = ((performance.now() - _t0) / 1000).toFixed(1);
            this._textos['planteamiento'] = { titulo: 'Planteamiento del problema', texto };
            if (res) { res.style.display = ''; res.textContent = texto; }
            if (estado) estado.textContent = `✓ Sección redactada en ${seg} s. Revisa el texto y las citas: `
                + `si la calidad te convence, pasamos a generar el documento completo.`;
        } catch (e) {
            if (estado) estado.textContent = '❌ ' + (e.message || 'No se pudo redactar la sección.');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = t; }
        }
    }
};

if (typeof window !== 'undefined') {
    window.RedactorTeorico = RedactorTeorico;
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => RedactorTeorico.montar());
    } else {
        RedactorTeorico.montar();
    }
}
