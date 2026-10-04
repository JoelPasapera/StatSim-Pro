// buscador/antecedentes/interfaz.js — Antecedentes: montaje, búsqueda desde la interfaz, resultados, matriz, paginación y protocolo.
// Origen: buscador/antecedentes.js (Fase 6: partición por responsabilidad, sin cambios de comportamiento).

import { AliciaDirecto } from '../fuentes/alicia.js';
import { PubMedDirecto } from '../fuentes/pubmed.js';
import { ScieloDirecto } from '../fuentes/scielo.js';
import { ScopusDirecto } from '../fuentes/scopus.js';
import { PrismaDiagrama } from '../prisma.js';
import { ProtocoloBusqueda } from '../protocolo.js';
import { EVENTOS, bus } from '../../shared/eventos.js';

export const metodosAntecedentesInterfaz = {

    // ---------- interfaz ----------
    montar() {
        let cont = document.getElementById('seccionAntecedentes');
        if (!cont) {
            // Respaldo: si la sección no existe en el HTML, crear al pie (compat).
            cont = document.createElement('div');
            cont.id = 'seccionAntecedentes';
            const ancla = document.querySelector('footer');
            (ancla ? ancla.parentNode : document.body).insertBefore(cont, ancla || null);
        }
        const sugerida = window.ultimoAnalisis ? `${window.ultimoAnalisis.et1} ${window.ultimoAnalisis.et2}` : '';
        cont.innerHTML = `
        <div class="card">
            <div>
              <div class="form-row">
                <div class="form-group" style="flex:2;">
                  <label class="label">Problema de investigación / términos de búsqueda</label>
                  <textarea id="antQuery" class="input" rows="2" style="resize:vertical;"
                    placeholder="Ej.: ¿Existe relación entre la inteligencia emocional y el rendimiento académico en universitarios de Lima? — o simplemente: inteligencia emocional rendimiento académico">${sugerida}</textarea>
                  <p class="help-text" style="margin:0.3rem 0 0; font-size:0.85em;">Un solo campo para ambas búsquedas: la <b>individual</b> lo usa tal cual; la <b>intensiva</b> lo toma como semilla para generar variantes con IA.</p>
              <details style="margin:0.6rem 0 0.2rem; border:1px solid var(--color-border, #39415a); border-radius:8px; padding:0.45rem 0.8rem; font-size:0.85em;">
                <summary style="cursor:pointer; color:#fbbf24;">📚 Conceptos clave para no perderse: base de datos, revista, cuartil, DOI…</summary>
                <div style="margin-top:0.5rem; line-height:1.6; color:var(--color-text-soft, #b8c0d4);">
                  Piensa en una biblioteca. El <b>artículo</b> es el texto que buscas: un estudio concreto. La <b>revista</b> (journal) es la publicación que lo editó tras <b>revisión por pares</b> — el filtro donde expertos independientes evalúan el estudio antes de publicarse; es la línea que separa la evidencia de la opinión (ej.: <i>The Lancet</i>, <i>Revista Latinoamericana de Psicología</i>). Y la <b>base de datos</b> (Scopus, PubMed, SciELO) es el catálogo: indexa artículos de miles de revistas, no publica nada — organiza, filtra y deja buscar. Un artículo se publica en UNA revista, pero puede estar indexado en VARIAS bases a la vez (por eso aquí se deduplican).<br><br>
                  <b>Indexación:</b> en qué bases figura una revista; «indexada en Scopus» significa que pasó su filtro de calidad. <b>Cuartil (Q1–Q4):</b> la posición de la <u>revista</u> — no del artículo — dentro de su categoría según citas: Q1 es el 25 % superior. <b>DOI:</b> la huella digital permanente de un artículo; el enlace que nunca muere. <b>Repositorio</b> (ALICIA): almacén institucional que aloja los documentos completos, incluida la <b>literatura gris</b> (tesis, informes técnicos) que no pasó por revistas — cobertura local valiosa que las bases comerciales ignoran. <b>Buscador académico</b> (Google Académico): rastrea toda la web académica; más amplio que una base, pero sin su curaduría — encuentra más y filtra menos.
                </div>
              </details>
                  <div id="antSinonimos" class="help-text" style="margin-top:0.35rem;"></div>
                </div>
                <div class="form-group"><label class="label">Desde el año</label>
                  <input type="number" id="antDesde" class="input" value="${new Date().getFullYear() - 5}"></div>
                <div class="form-group" style="grid-column: 1 / -1;"><label class="label">Idiomas de búsqueda</label>
                  <div id="antIdiomas" style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                    <label style="display:inline-flex; align-items:center; gap:0.35rem; border:1px solid var(--color-border, #39415a); border-radius:8px; padding:0.3rem 0.55rem; cursor:pointer; font-size:0.88em;"><input type="checkbox" value="es" checked> Español</label>
                    <label style="display:inline-flex; align-items:center; gap:0.35rem; border:1px solid var(--color-border, #39415a); border-radius:8px; padding:0.3rem 0.55rem; cursor:pointer; font-size:0.88em;"><input type="checkbox" value="en" checked> English</label>
                    <label style="display:inline-flex; align-items:center; gap:0.35rem; border:1px solid var(--color-border, #39415a); border-radius:8px; padding:0.3rem 0.55rem; cursor:pointer; font-size:0.88em;"><input type="checkbox" value="pt"> Portugués</label>
                    <label style="display:inline-flex; align-items:center; gap:0.35rem; border:1px solid var(--color-border, #39415a); border-radius:8px; padding:0.3rem 0.55rem; cursor:pointer; font-size:0.88em;"><input type="checkbox" value="fr"> Francés</label>
                    <label style="display:inline-flex; align-items:center; gap:0.35rem; border:1px solid var(--color-border, #39415a); border-radius:8px; padding:0.3rem 0.55rem; cursor:pointer; font-size:0.88em;"><input type="checkbox" value="de"> Alemán</label>
                    <label style="display:inline-flex; align-items:center; gap:0.35rem; border:1px solid var(--color-border, #39415a); border-radius:8px; padding:0.3rem 0.55rem; cursor:pointer; font-size:0.88em;"><input type="checkbox" value="zh-CN"> 中文 (chino)</label>
                  </div>
                  <div id="antIdiomasCoste" style="font-size:0.78em; color:var(--color-text-soft, #8b93a7); margin-top:0.35rem;"></div>
                  <div style="font-size:0.74em; color:var(--color-text-soft, #8b93a7); margin-top:0.15rem;">La consulta se traduce a cada idioma marcado y cada ecuación queda documentada en la ficha del protocolo. Ojo: Scopus y PubMed indexan título y resumen en inglés incluso para artículos en chino, alemán o francés — la consulta en English ya los captura; esos idiomas rinden sobre todo vía Google Académico.</div>
                </div>
                <div class="form-group"><label class="label">Resultados (OMS)</label>
                  <input type="number" id="antNumOMS" class="input" value="15" min="0" max="50" step="1"
                    title="Informes y guías del repositorio IRIS de la OMS. 0 = no consultar."></div>
                <div class="form-group"><label class="label">Resultados (Scholar)</label>
                  <input type="number" id="antCantidad" class="input" value="20" min="10" max="50" step="10"
                    title="Google Académico pagina de 10 en 10 y castiga la avidez (anti-bot): tope prudente de 50."></div>
                <div class="form-group"><label class="label">Resultados (ONU)</label>
                  <input type="number" id="antNumONU" class="input" value="10" min="0" max="25" step="1"
                    title="Biblioteca Digital de la ONU (su API responde lento: cifras moderadas). 0 = no consultar."></div>
                <div class="form-group"><label class="label">Resultados (Scopus)</label>
                  <input type="number" id="antCantidadScopus" class="input" value="500" min="25" max="5000" step="100"
                    title="Paginación paralela directa a Elsevier. Tope 5000: es el techo de la propia API de Scopus (su paginación por offset no llega más lejos). ~200 peticiones = 1% de la cuota semanal de UNA clave."></div>
                <div class="form-group"><label class="label">Resultados (PubMed)</label>
                  <input type="number" id="antCantidadPubmed" class="input" value="100" min="10" max="1000" step="10"
                    title="API oficial de NCBI, eficiente en dos pasos: aguanta cifras grandes sin drama."></div>
                <div class="form-group"><label class="label">Resultados (SciELO)</label>
                  <input type="number" id="antCantidadScielo" class="input" value="100" min="10" max="500" step="10"
                    title="Vía Crossref. Teclea la cifra que quieras (tope 500)."></div>
                <div class="form-group"><label class="label">Resultados (ALICIA)</label>
                  <input type="number" id="antCantidadAlicia" class="input" value="100" min="10" max="500" step="10"
                    title="Repositorio nacional (Concytec). Teclea la cifra que quieras (tope 500)."></div>
              </div>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.4rem;">
                <input type="checkbox" id="antUsarScholar" checked> Intentar Google Académico directo (experimental, vía proxy)
              </label><br>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.4rem;">
                <input type="checkbox" id="antUsarScopus" checked> Buscar en Scopus (Elsevier, vía proxy)
              </label><br>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.6rem;">
                <input type="checkbox" id="antUsarPubmed" checked> Buscar en PubMed (NCBI — psicología clínica, salud, neurociencia)
              </label><br>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.6rem;">
                <input type="checkbox" id="antUsarScielo" checked> Buscar en SciELO (investigación latinoamericana en español)
              </label><br>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.6rem;">
                <input type="checkbox" id="antUsarAlicia" checked> Buscar en ALICIA (tesis y producción científica peruana — CONCYTEC)
              </label><br>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.6rem;">
                <input type="checkbox" id="antUsarOMS" checked> Buscar en OMS (IRIS — guías e informes oficiales de salud; API oficial con proxy de rescate)
              </label><br>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.6rem;">
                <input type="checkbox" id="antUsarONU" checked> Buscar en ONU (Biblioteca Digital — documentos oficiales de Naciones Unidas)
              </label><br>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;margin:0 0 0.6rem;">
                <input type="checkbox" id="antUsarAbiertas"> Buscar en fuentes complementarias (OpenAlex, Crossref, Semantic Scholar)
              </label><br>
              <div id="antAvisoScopusEs" style="display:none; margin:0 0 0.6rem; padding:0.5rem 0.75rem; background:#fff8e1; border-left:3px solid #f5b301; border-radius:4px; font-size:0.85em;">
                ⚠️ Scopus indexa casi exclusivamente artículos en <strong>inglés</strong>. Con el idioma en «Español», es probable que devuelva pocos o ningún resultado. Para aprovechar Scopus, marca <strong>English</strong> en «Idiomas de búsqueda»: la consulta se traducirá automáticamente.
              </div>
              <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap; margin:0.2rem 0 0.6rem;">
                <button id="antBuscar" class="btn btn-primary">🔎 Búsqueda individual</button>
                <button id="antIntensivaBtn" class="btn btn-primary">🚀 Búsqueda intensiva con variantes</button>
                <label for="antTopeConsultas" style="font-size:0.85em; color:var(--color-text-soft, #666);">Máx. búsquedas (variantes × idiomas):</label>
                <input type="number" id="antTopeConsultas" class="input" value="60" min="10" max="200" step="10"
                       style="width:5rem; padding:0.3rem 0.5rem;" title="Número máximo de BÚSQUEDAS que se lanzan (variantes × idiomas). No limita cuántos artículos encuentras: limita cuántas búsquedas se ejecutan.">
                <label for="antNumVariantes" style="font-size:0.85em; color:var(--color-text-soft, #666);">Nº variantes:</label>
                <input type="number" id="antNumVariantes" class="input" value="5" min="2" max="12" step="1"
                  style="width:4.5rem; padding:0.3rem 0.5rem;" title="Cuántas variantes generar (2 a 12)">
              </div>
              <div id="antVariantesZona" style="margin:0 0 0.6rem;">
                <label for="antVariantes" class="help-text" style="display:block; margin:0 0 0.2rem;">🔀 <b>Variantes de búsqueda</b> (opcional — escribe las TUYAS, una por línea; si lo dejas vacío, 🚀 generará automáticamente el Nº configurado):</label>
                <textarea id="antVariantes" class="input" rows="5" style="resize:vertical;" placeholder="p. ej.:&#10;inteligencia emocional adolescentes rendimiento&#10;emotional intelligence academic achievement teens"
                  placeholder="Aquí aparecerán las variantes generadas, una por línea. Puedes editarlas, borrar las que no quieras o añadir las tuyas."></textarea>
                <div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center; margin-top:0.5rem;">
                  <button id="antGenerarVariantes" class="btn btn-outline" style="padding:0.3rem 0.8rem;">🔀 Regenerar variantes</button>
                  <label style="display:inline-flex; align-items:center; gap:0.35rem; font-size:0.85em; color:var(--color-text-soft, #666);">
                    <input type="checkbox" id="antIncluirOriginal" checked> Incluir también la consulta original
                  </label>
                  <span class="help-text" style="font-size:0.82em;">Edita libremente y vuelve a pulsar 🚀: buscará exactamente con las que dejes aquí.</span>
                </div>
              </div>
              <div id="antVariantesEstado" class="help-text" style="margin:0 0 0.4rem;"></div>
              <button id="antScholar" class="btn btn-outline">↗ Abrir en Google Académico</button>
              <button id="antScopusWeb" class="btn btn-outline">↗ Abrir en Scopus</button>
              <button id="antPubmedWeb" class="btn btn-outline">↗ Abrir en PubMed</button>
              <button id="antScieloWeb" class="btn btn-outline">↗ Abrir en SciELO</button>
              <button id="antAliciaWeb" class="btn btn-outline">↗ Abrir en ALICIA</button>
              <div id="antEstado" class="help-text" style="margin-top:0.5rem;"></div>
              <div id="antResultados"></div>
              <div id="antSeleccion"></div>
              <div id="antProtocolo"></div>

              <div id="antIntensiva" style="margin-top:2rem; border-top:2px solid var(--color-border, #e5e5e5); padding-top:1.5rem;">
                <h3 style="margin:0 0 0.3rem; font-size:1.15rem;">✨ Criba con IA — criterios y relevancia</h3>
                <p class="help-text" style="margin:0 0 1rem;">Genera criterios de inclusión/exclusión a partir de tu problema y evalúa la relevancia de cada artículo de la matriz con ayuda de un modelo de IA.</p>

                                <div id="antVariablesSlot"></div>

                <div class="form-group">
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.4rem;">
                    <label class="label" for="antCriterios" style="margin:0;">Criterios de inclusión y exclusión</label>
                    <button id="antGenerarCriterios" class="btn btn-outline" style="padding:0.3rem 0.8rem;">🪄 Generar criterios</button>
                  </div>
                  <textarea id="antCriterios" class="input" rows="8" style="resize:vertical;"
                    placeholder="Se generarán automáticamente al pulsar «Generar criterios» a partir del problema de investigación. Podrás editarlos libremente antes de filtrar."></textarea>
                  <p class="help-text" style="margin:0.4rem 0 0;">La IA propone un borrador; tú decides los criterios finales. Son totalmente editables.</p>
                  <div id="antCriteriosEstado" class="help-text" style="margin-top:0.4rem;"></div>
                </div>

                                <div class="form-group" style="margin-top:1.5rem; padding-top:1.2rem; border-top:1px dashed var(--color-border, #e5e5e5);">
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.4rem;">
                    <label class="label" style="margin:0;">Relevancia de las investigaciones</label>
                    <button id="antAnalizarRelevancia" class="btn btn-primary" style="padding:0.4rem 1rem;">🔎 Analizar relevancia</button>
                  </div>
                  <p class="help-text" style="margin:0;">La IA evalúa cada artículo de la matriz (título y resumen) según tus criterios de inclusión/exclusión y le asigna una relevancia del 1 al 5 con su justificación. La matriz se reordena por relevancia, pero <strong>no se elimina nada</strong>: tú decides la inclusión final leyendo. Usa el modelo más potente.</p>

                  <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap; margin-top:0.9rem;">
                    <label class="label" for="antUmbralRelevancia" style="margin:0;">🎯 Filtrar por relevancia:</label>
                    <select id="antUmbralRelevancia" class="input" style="width:auto; padding:0.3rem 0.6rem;" disabled title="Se activa tras analizar la relevancia">
                      <option value="0">Mostrar todas</option>
                      <option value="2">Relevancia ≥ 2</option>
                      <option value="3">Relevancia ≥ 3</option>
                      <option value="4">Relevancia ≥ 4</option>
                      <option value="5">Solo relevancia 5</option>
                    </select>
                  </div>
                  <p class="help-text" style="margin:0.4rem 0 0;">Oculta de la matriz (y de sus exportaciones a Excel/CSV) los artículos por debajo del umbral, para no borrar filas a mano. No elimina nada: es solo la vista, y puedes volver a «Mostrar todas» cuando quieras.</p>
                  <div id="antRelevanciaEstado" class="help-text" style="margin-top:0.5rem;"></div>
                </div>

                <div id="antRedactor"></div>
              </div>
            </div>
        </div>`;
        document.getElementById('antBuscar').addEventListener('click', () => this._onBuscar());
        if (typeof ProtocoloBusqueda !== 'undefined' && ProtocoloBusqueda.resumen().nFuentes > 0) {
            ProtocoloBusqueda.mostrarFicha('antProtocolo');
        }
        const btnCrit = document.getElementById('antGenerarCriterios');
        if (btnCrit) btnCrit.addEventListener('click', () => this._onGenerarCriterios());
        const btnVar = document.getElementById('antGenerarVariantes');
        if (btnVar) btnVar.addEventListener('click', () => this._onGenerarVariantes());
        const btnInt = document.getElementById('antIntensivaBtn');
        if (btnInt) btnInt.addEventListener('click', () => this._onIntensiva());
        const btnRel = document.getElementById('antAnalizarRelevancia');
        if (btnRel) btnRel.addEventListener('click', () => this._onAnalizarRelevancia());
        const selUmbral = document.getElementById('antUmbralRelevancia');
        if (selUmbral) selUmbral.addEventListener('change', () => {
            this._umbralRelevancia = parseInt(selUmbral.value, 10) || 0;
            this._selMat = 0; // volver a la primera página de la matriz
            if (typeof PrismaDiagrama !== 'undefined') {
                const u = this._umbralRelevancia;
                const exc = u > 0 ? this._obras.filter(o => (o._relevancia || 0) > 0 && o._relevancia < u).length : 0;
                PrismaDiagrama.registrar('excluidos', { n: exc, motivo: u > 0 ? `relevancia < ${u} según los criterios de inclusión/exclusión` : '' });
            }
            this._renderSeleccion();
            bus.emit(EVENTOS.FUENTES_CAMBIADAS);   // el Redactor se suscribe; el Buscador no lo importa
        });
        document.getElementById('antScholar').addEventListener('click', () => {
            const q = document.getElementById('antQuery').value.trim();
            if (q) window.open(this.urlScholar(q, { desde: document.getElementById('antDesde').value }), '_blank');
        });
        const btnScopusWeb = document.getElementById('antScopusWeb');
        if (btnScopusWeb) btnScopusWeb.addEventListener('click', async () => {
            let q = document.getElementById('antQuery').value.trim();
            if (!q || typeof ScopusDirecto === 'undefined') return;
            // Si se prioriza inglés, traducir también para la búsqueda web.
            if (this._idiomasSeleccionados().some(([c]) => c === 'en')) {
                q = await this.traducirTexto(q, 'es', 'en');
            }
            window.open(ScopusDirecto.urlPublica(q, { desde: document.getElementById('antDesde').value }), '_blank');
        });
        const btnScieloWeb = document.getElementById('antScieloWeb');
        if (btnScieloWeb) btnScieloWeb.addEventListener('click', () => {
            const q = document.getElementById('antQuery').value.trim();
            if (q && typeof ScieloDirecto !== 'undefined') window.open(ScieloDirecto.urlPublica(q), '_blank');
        });
        const btnAliciaWeb = document.getElementById('antAliciaWeb');
        if (btnAliciaWeb) btnAliciaWeb.addEventListener('click', () => {
            const q = document.getElementById('antQuery').value.trim();
            if (q && typeof AliciaDirecto !== 'undefined') window.open(AliciaDirecto.urlPublica(q), '_blank');
        });
        const btnPubmedWeb = document.getElementById('antPubmedWeb');
        if (btnPubmedWeb) btnPubmedWeb.addEventListener('click', async () => {
            let q = document.getElementById('antQuery').value.trim();
            if (!q || typeof PubMedDirecto === 'undefined') return;
            // PubMed es mayormente inglés: traducir si se prioriza inglés.
            if (this._idiomasSeleccionados().some(([c]) => c === 'en')) {
                q = await this.traducirTexto(q, 'es', 'en');
            }
            window.open(PubMedDirecto.urlPublica(q, { desde: document.getElementById('antDesde').value }), '_blank');
        });
        document.getElementById('antQuery').addEventListener('input', () => this._renderSinonimos());
        this._renderSinonimos();
        // Aviso Scopus+Español: actualizar al cambiar idioma o la casilla de Scopus.
        const actualizarAvisoScopus = () => {
            const aviso = document.getElementById('antAvisoScopusEs');
            if (!aviso) return;
            const scopusOn = document.getElementById('antUsarScopus') && document.getElementById('antUsarScopus').checked;
            const enMarcado = !!document.querySelector('#antIdiomas input[value="en"]:checked');
            aviso.style.display = (scopusOn && !enMarcado) ? 'block' : 'none';
        };
        // Contador de coste en vivo: idiomas × variantes = consultas totales.
        const actualizarCosteIdiomas = () => {
            const coste = document.getElementById('antIdiomasCoste');
            if (!coste) return;
            const nIdi = this._idiomasSeleccionados().length;
            // Si el usuario ya escribió sus variantes, ESAS mandan en el cálculo.
            const propias = ((document.getElementById('antVariantes') || {}).value || '').split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 2).length;
            const nVar = propias || parseInt((document.getElementById('antNumVariantes') || {}).value || '5', 10) || 5;
            const plan = this._planPresupuesto(nVar, nIdi);
            coste.textContent = `Individual: ${nIdi} consulta${nIdi === 1 ? '' : 's'} · Intensiva: `
                + `${plan.recortado ? `${plan.variantes} de ${nVar}` : nVar} variantes × ${nIdi} idioma${nIdi === 1 ? '' : 's'} `
                + `= ${plan.total} búsquedas (máx. ${plan.tope})`
                + (plan.recortado ? ` ⚠️ se recortarán variantes: sube «Máx. búsquedas» para lanzarlas todas` : '');
        };
        const cajaVar = document.getElementById('antVariantes');
        if (cajaVar) cajaVar.addEventListener('input', actualizarCosteIdiomas);
        const zonaIdiomas = document.getElementById('antIdiomas');
        if (zonaIdiomas) zonaIdiomas.addEventListener('change', () => { actualizarAvisoScopus(); actualizarCosteIdiomas(); });
        const elUsarScopus = document.getElementById('antUsarScopus');
        if (elUsarScopus) elUsarScopus.addEventListener('change', actualizarAvisoScopus);
        const elNumVar = document.getElementById('antNumVariantes');
        if (elNumVar) elNumVar.addEventListener('input', actualizarCosteIdiomas);
        const elTope = document.getElementById('antTopeConsultas');
        if (elTope) elTope.addEventListener('input', actualizarCosteIdiomas);
        actualizarAvisoScopus();
        actualizarCosteIdiomas();
    },
};
