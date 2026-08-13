// ========================================
// ETIQUETAS DE VARIABLES (estilo "variable labels" de SPSS)
// Las columnas del dataset conservan su nombre técnico (Total_IC, PC_IE…)
// para no romper nada; la interfaz y los textos muestran la etiqueta humana
// ("Inteligencia Cognitiva"). El simulador registra aquí las etiquetas y la
// estructura de pruebas al generar; con datos importados por CSV simplemente
// no hay etiquetas y todo cae al nombre de columna (comportamiento anterior).
// ========================================
const EtiquetasVariables = {
    _mapa: {},        // { nombreColumna: etiqueta }
    _estructura: [],  // [{ prueba, columnaGeneral, etiquetaGeneral, dimensiones: [{columna, etiqueta}] }]
    // Registra el diccionario de etiquetas y la estructura de pruebas.
    fijar(mapa, estructura) {
        this._version = (this._version || 0) + 1;
        this._mapa = mapa || {};
        this._estructura = estructura || [];
    },
    limpiar() {
        this._version = (this._version || 0) + 1;
        this._mapa = {};
        this._estructura = [];
        this._columnasVacias = [];
    },
    // Etiqueta humana de una columna; si no existe, devuelve la columna tal cual.
    etiqueta(columna) {
        return this._mapa[columna] || columna;
    },
    // Texto para desplegables: "Etiqueta (columna)" cuando hay etiqueta.
    etiquetaConColumna(columna) {
        const et = this.etiqueta(columna);
        return et === columna ? columna : `${et} (${columna})`;
    },
    tieneEtiquetas() {
        return Object.keys(this._mapa).length > 0;
    },
    // Estructura de pruebas (para el análisis por dimensiones).
    estructura() {
        return this._estructura;
    },
    // Devuelve la prueba cuya escala general es esta columna (o null).
    pruebaConGeneral(columna) {
        return this._estructura.find(p => p.columnaGeneral === columna) || null;
    },
    // ----------------------------------------
    // EDITOR DE ETIQUETAS (solo para bases de datos EXTERNAS)
    // Con datos del simulador las etiquetas llegan solas y este editor no se
    // muestra; con un CSV externo permite renombrar las variables a mano.
    // ----------------------------------------
    // QUÉ COLUMNAS PUEDE RENOMBRAR EL USUARIO.
    // Cambia MODO_RENOMBRADO para ajustarlo al instante:
    //   'total' → solo puntajes de escala (prefijo Total_), NO ítems individuales
    //   'todos' → todas las columnas numéricas del dataset
    // (Para un criterio nuevo, agrega otra entrada en _FILTROS_RENOMBRADO y apunta el modo a ella.)
    MODO_RENOMBRADO: 'puntajes',
    _FILTROS_RENOMBRADO: {
        // Puntajes de escala: nuevos prefijos por tipo + Total_ (bases antiguas)
        // Blindado: acepta tilde (Dimensión), mayúsculas, espacios iniciales y _ o - como separador
        puntajes: col => /^\s*(total|dimensi[oó]n|general)[_\-]/i.test(col),
        todos: () => true
    },
    // Estado VACÍO del editor: la sección queda siempre visible en la página.
    // Sin datos muestra la explicación y un aviso; al cargar un CSV, mostrarEditor
    // la reemplaza por la tabla de columnas renombrables.
    mostrarVacio(idContenedor, nota) {
        const cont = document.getElementById(idContenedor);
        if (!cont) return;
        const aviso = nota || '📂 Aún no hay datos: cuando cargues tu CSV, aquí aparecerán tus columnas <code>General_</code> y <code>Dimension_</code> listas para renombrar.';
        cont.innerHTML = `
            <div class="card">
                <details>
                    <summary style="cursor: pointer; font-weight: 700; padding: 0.25rem 0;">
                        ✏️ Renombrar variables (etiquetas) — opcional
                    </summary>
                    <p class="help-text" style="margin-top: 0.5rem;">
                        Aquí puedes ponerle un <strong>nombre legible</strong> a los puntajes de tu base,
                        para que la pregunta, los objetivos, las hipótesis, los resultados y la discusión
                        hablen en humano (Ej: <code>General_IE</code> → "Inteligencia emocional",
                        <code>Dimension_Atencion</code> → "Atención sostenida"). Se listan solo las
                        columnas de puntaje: <code>General_</code> es la <strong>escala general</strong>
                        del test (una sola columna con el puntaje global — la fila "General" del
                        Simulador), <code>Dimension_</code> es cada <strong>subescala</strong> con sus
                        propios ítems, y <code>Total_</code> aparece en bases antiguas. Los ítems
                        individuales (F1, PE3…) no se renombran y tus datos no cambian: solo los textos.
                    </p>
                    <p class="help-text" style="margin-top: 0.5rem;">${aviso}</p>
                </details>
            </div>
        `;
        cont.style.display = 'block';
    },
    mostrarEditor(idContenedor, columnas, alAplicar) {
        const cont = document.getElementById(idContenedor);
        if (!cont) return;
        const filtro = this._FILTROS_RENOMBRADO[this.MODO_RENOMBRADO] || this._FILTROS_RENOMBRADO.todos;
        const columnasEditables = (columnas || []).filter(filtro);
        // Columnas que por NOMBRE son puntajes pero llegaron sin datos: no se
        // pueden renombrar ni analizar, y casi siempre delatan un error de
        // exportación del CSV. Se avisan con nombres concretos.
        const vaciasPuntaje = (this._columnasVacias || []).filter(filtro);
        this._columnasVacias = []; // no arrastrar a cargas posteriores
        const avisoVacias = vaciasPuntaje.length
            ? '<p class="help-text" style="color: #b45309; margin-top: 0.5rem;">⚠️ Sin datos (no se pueden renombrar ni analizar): ' + vaciasPuntaje.map(c => '<code>' + c + '</code>').join(', ') + '. Estas columnas están vacías en tu CSV — rellénalas o elimínalas antes de analizar.</p>'
            : '';
        try { console.info('[Etiquetas] columnas recibidas:', columnas, '→ renombrables:', columnasEditables, '· vacías (sin datos):', vaciasPuntaje); } catch (e) {}
        // Sin columnas renombrables: la sección permanece visible con su explicación.
        if (columnasEditables.length === 0) {
            const muestra = (columnas || []).slice(0, 10).map(c => '<code>' + c + '</code>').join(', ');
            if (vaciasPuntaje.length) {
                this.mostrarVacio(idContenedor, '⚠️ Encontré columnas de puntaje pero están VACÍAS (sin datos): ' + vaciasPuntaje.map(c => '<code>' + c + '</code>').join(', ') + '. Una columna sin valores no se puede renombrar ni analizar — rellénala en tu CSV (o elimínala) y vuelve a subirlo.');
                return;
            }
            this.mostrarVacio(idContenedor, '⚠️ No se encontraron columnas de puntaje (<code>General_</code>, <code>Dimension_</code> o <code>Total_</code>) en tu base. Columnas leídas: ' + (muestra || '(ninguna)') + (columnas && columnas.length > 10 ? '…' : '') + '. Si alguna debería aparecer aquí, revisa su nombre exacto.');
            return;
        }
        const filas = columnasEditables.map(col => `
            <tr>
                <td><code>${col}</code></td>
                <td>
                    <input type="text" class="input input-sm" data-columna="${col}"
                        value="${(this._mapa[col] && this._mapa[col] !== col) ? this._mapa[col] : ''}"
                        placeholder="Ej: Inteligencia emocional" maxlength="120">
                </td>
            </tr>
        `).join('');
        cont.innerHTML = `
            <div class="card">
                <details open>
                    <summary style="cursor: pointer; font-weight: 700; padding: 0.25rem 0;">
                        ✏️ Renombrar variables (etiquetas) — opcional
                    </summary>
                    <p class="help-text" style="margin-top: 0.5rem;">
                        Aquí puedes ponerle un <strong>nombre legible</strong> a los puntajes de tu base,
                        para que la pregunta, los objetivos, las hipótesis, los resultados y la discusión
                        hablen en humano (Ej: <code>General_IE</code> → "Inteligencia emocional",
                        <code>Dimension_Atencion</code> → "Atención sostenida"). Se listan solo las
                        columnas de puntaje: <code>General_</code> es la <strong>escala general</strong>
                        del test (una sola columna con el puntaje global — la fila "General" del
                        Simulador), <code>Dimension_</code> es cada <strong>subescala</strong> con sus
                        propios ítems, y <code>Total_</code> aparece en bases antiguas. Los ítems
                        individuales (F1, PE3…) no se renombran y tus datos no cambian: solo los textos.
                        Deja vacío lo que no quieras renombrar.
                    </p>
                    <div class="table-container">
                        <table class="table">
                            <thead><tr><th>Columna</th><th>Etiqueta (nombre completo)</th></tr></thead>
                            <tbody>${filas}</tbody>
                        </table>
                    </div>
                    ${avisoVacias}
                    <button type="button" id="btnAplicarEtiquetas" class="btn btn-primary" style="margin-top: 0.5rem;">
                        Aplicar etiquetas
                    </button>
                </details>
            </div>
        `;
        cont.style.display = 'block';
        const self = this;
        const btn = document.getElementById('btnAplicarEtiquetas');
        if (btn) {
            btn.addEventListener('click', function () {
                const mapa = {};
                cont.querySelectorAll('input[data-columna]').forEach(input => {
                    const etiqueta = input.value.trim();
                    if (etiqueta) mapa[input.getAttribute('data-columna')] = etiqueta;
                });
                // Base externa: hay etiquetas pero no estructura de pruebas
                self.fijar(mapa, []);
                if (typeof alAplicar === 'function') alAplicar();
            });
        }
    },
    ocultarEditor(idContenedor) {
        const cont = document.getElementById(idContenedor);
        if (!cont) return;
        cont.innerHTML = '';
        cont.style.display = 'none';
    }
};
if (typeof window !== 'undefined') {
    window.EtiquetasVariables = EtiquetasVariables;
}
