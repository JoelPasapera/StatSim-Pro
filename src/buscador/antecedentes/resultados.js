// buscador/antecedentes/resultados.js — Antecedentes: pintado de resultados, selección, matriz y paginación.
// Origen: buscador/antecedentes/interfaz.js (Fase 6, segunda pasada: partición por responsabilidad).

import { PrismaDiagrama } from '../prisma.js';

export const metodosAntecedentesResultados = {


    _renderResultados(obras) {
        const POR_PAGINA = 15;
        if (this._pagina == null) this._pagina = 0;
        const total = obras.length;
        const numPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
        if (this._pagina >= numPaginas) this._pagina = numPaginas - 1;
        const ini = this._pagina * POR_PAGINA;
        const visibles = obras.slice(ini, ini + POR_PAGINA);

        const filas = visibles.map((o, j) => {
            const i = ini + j; // índice real en this._obras
            return `
            <tr>
              <td><input type="checkbox" data-i="${i}" ${this._seleccion.has(this._norm(o.titulo)) ? 'checked' : ''}></td>
              <td>${(o.autores || []).slice(0, 3).join('; ')}${(o.autores || []).length > 3 ? ' et al.' : ''} (${o.anio || 's. f.'})</td>
              <td>${(o.link || o.doi) ? `<a href="${o.link || o.doi}" target="_blank">${o.titulo}</a>` : o.titulo}</td>
              <td>${o.fuente}</td><td>${o.citas}</td>
              <td>${(o.link || o.doi) ? `<a href="${o.link || o.doi}" target="_blank" title="Abrir artículo">🔗</a>` : '—'}</td>
              <td style="font-size:0.8em;color:#888;">${(o.fuentesAPI || []).join('+')}</td>
            </tr>`;
        }).join('');

        const todosVisiblesMarcados = visibles.length > 0 && visibles.every(o => this._seleccion.has(this._norm(o.titulo)));
        const controles = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-top:0.75rem; flex-wrap:wrap;">
                <label style="display:inline-flex; align-items:center; gap:0.4rem;">
                    <input type="checkbox" id="antMarcarTodos" ${todosVisiblesMarcados ? 'checked' : ''}>
                    Marcar todos (${total} resultados)
                </label>
                <span style="display:inline-flex; align-items:center; gap:0.75rem;">
                    <button id="antPrev" class="btn btn-outline" ${this._pagina === 0 ? 'disabled' : ''} style="padding:0.25rem 0.7rem;">◀</button>
                    <span class="help-text">Página ${this._pagina + 1} de ${numPaginas} — mostrando ${ini + 1}–${Math.min(ini + POR_PAGINA, total)} de ${total}</span>
                    <button id="antNext" class="btn btn-outline" ${this._pagina >= numPaginas - 1 ? 'disabled' : ''} style="padding:0.25rem 0.7rem;">▶</button>
                </span>
            </div>`;

        document.getElementById('antResultados').innerHTML = controles + `
            <div class="table-container" style="margin-top:0.5rem;"><table class="table">
              <thead><tr><th></th><th>Autores (año)</th><th>Título</th><th>Fuente</th><th>Citas</th><th>Enlace</th><th>Base</th></tr></thead>
              <tbody>${filas}</tbody></table></div>`;

        // Checkboxes individuales
        document.getElementById('antResultados').querySelectorAll('tbody input[type=checkbox]').forEach(ch =>
            ch.addEventListener('change', e => {
                const o = this._obras[+e.target.dataset.i];
                const k = this._norm(o.titulo);
                if (e.target.checked) this._seleccion.set(k, o); else this._seleccion.delete(k);
                this._renderResultados(this._obras); // refresca el "marcar todos"
                this._renderSeleccion();
            }));
        // Marcar/desmarcar TODOS (toda la búsqueda, no solo la página)
        const mt = document.getElementById('antMarcarTodos');
        if (mt) mt.addEventListener('change', e => {
            this._obras.forEach(o => {
                const k = this._norm(o.titulo);
                if (e.target.checked) this._seleccion.set(k, o); else this._seleccion.delete(k);
            });
            this._renderResultados(this._obras);
            this._renderSeleccion();
        });
        // Paginación
        const prev = document.getElementById('antPrev'), next = document.getElementById('antNext');
        if (prev) prev.addEventListener('click', () => { if (this._pagina > 0) { this._pagina--; this._renderResultados(this._obras); } });
        if (next) next.addEventListener('click', () => { if (this._pagina < numPaginas - 1) { this._pagina++; this._renderResultados(this._obras); } });
    },



    _renderSeleccion() {
        const sel = [...this._seleccion.values()];
        const cont = document.getElementById('antSeleccion');
        if (!sel.length) {
            if (typeof PrismaDiagrama !== 'undefined') PrismaDiagrama.registrar('incluidos', { n: 0 });
            cont.innerHTML = ''; this._selRef = 0; this._selMat = 0; return;
        }
        if (this._selRef == null) this._selRef = 0;
        if (this._selMat == null) this._selMat = 0;
        const PP = 15;

        // ----- Referencias (orden alfabético) con paginación -----
        const refs = sel.map(o => this.citaAPA(o)).sort((a, b) => a.localeCompare(b, 'es'));
        const npRef = Math.max(1, Math.ceil(refs.length / PP));
        if (this._selRef >= npRef) this._selRef = npRef - 1;
        const iniR = this._selRef * PP;
        const refsVis = refs.slice(iniR, iniR + PP);

        // ----- Matriz de revisión bibliográfica (12 columnas) con paginación -----
        // Filtro de vista por relevancia: la matriz (y sus exportaciones) solo
        // incluye artículos con puntuación >= umbral. No borra nada del listado.
        const umbralRel = (this._relevanciaAplicada && this._umbralRelevancia > 0) ? this._umbralRelevancia : 0;
        const selMatriz = this.obtenerFuentesRedaccion(sel);
        if (typeof PrismaDiagrama !== 'undefined') {
            PrismaDiagrama.registrar('incluidos', { n: selMatriz.length });
        }
        const filasMatriz = selMatriz.map(o => this._filaMatriz(o));
        const infoUmbral = umbralRel > 0
            ? ` <span style="font-weight:normal; font-size:0.75em; color:#666;">(mostrando ${selMatriz.length} de ${sel.length} · relevancia ≥ ${umbralRel})</span>`
            : '';
        const npMat = Math.max(1, Math.ceil(filasMatriz.length / PP));
        if (this._selMat >= npMat) this._selMat = npMat - 1;
        const iniM = this._selMat * PP;
        const matVis = filasMatriz.slice(iniM, iniM + PP);

        const COLS = [
            ...(this._relevanciaAplicada ? ['Relevancia'] : []),
            'Título', 'Autor', 'Año', 'Contexto (País)', 'Objetivos', 'Muestra', 'Instrumentos',
            'Resultados', 'Conclusiones', 'Revista', 'Cuartil', 'Indexación', 'Referencia (APA)', 'Link/DOI'];

        cont.innerHTML = `
            <h4 style="margin-top:1.25rem; display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
                <span>Referencias seleccionadas (APA 7, orden alfabético)</span>
                <button id="antCopiarRefs" class="btn btn-primary" style="padding:0.3rem 0.8rem;">📋 Copiar con formato</button>
            </h4>
            <div class="result-box" id="antRefsBox">${refsVis.map(r => `<p style="margin:0 0 0.5rem;padding-left:2rem;text-indent:-2rem;">${r}</p>`).join('')}</div>
            ${this._barraPaginas('Ref', this._selRef, npRef, iniR, refs.length, PP)}

            <h4 style="margin-top:1.5rem; display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
                <span>Matriz de revisión bibliográfica${infoUmbral}</span>
                <span style="display:inline-flex; gap:0.4rem; flex-wrap:wrap;">
                    <button id="antXlsx" class="btn btn-primary" style="padding:0.3rem 0.8rem;" title="Excel real con formato: Times New Roman 12, texto ajustado y anchos de columna">⬇ Excel (.xlsx)</button>
                    <button id="antCsvEs" class="btn btn-outline" style="padding:0.3rem 0.8rem;" title="Separador ; — abre en columnas en Excel en español">⬇ CSV (Excel español)</button>
                    <button id="antCsvEn" class="btn btn-outline" style="padding:0.3rem 0.8rem;" title="Separador , — estándar internacional, Google Sheets y Excel en inglés">⬇ CSV (internacional)</button>
                    <button id="antEnriquecer" class="btn btn-outline" style="padding:0.3rem 0.8rem;" title="Reintenta recuperar resúmenes faltantes (ya se hace automáticamente tras buscar)">✨ Reintentar completar</button>
                </span>
            </h4>
            <div class="table-container"><table class="table" style="font-size:0.85em;">
                <thead><tr>${COLS.map(c => `<th>${c}</th>`).join('')}</tr></thead>
                <tbody>${matVis.map(f => `<tr>${f.celdas.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
            </table></div>
            ${this._barraPaginas('Mat', this._selMat, npMat, iniM, filasMatriz.length, PP)}
            <p class="help-text">Esta matriz no se completa al 100&#37; automáticamente: los objetivos, instrumentos y conclusiones a menudo solo aparecen en el cuerpo del artículo, y no todos los estudios son de acceso abierto. Los campos marcados con «[completar]» requieren tu lectura de la fuente. Verifica también país e indexación antes de citar.</p>`;

        // Copiar referencias CON FORMATO (HTML enriquecido al portapapeles)
        const btnCopiar = document.getElementById('antCopiarRefs');
        if (btnCopiar) btnCopiar.addEventListener('click', () => this._copiarReferencias(refs));
        // Exportar matriz a CSV (TODAS las filas, no solo la página)
        const btnX = document.getElementById('antXlsx');
        if (btnX) btnX.addEventListener('click', () => this._exportarXLSX(COLS, filasMatriz));
        const btnEs = document.getElementById('antCsvEs');
        if (btnEs) btnEs.addEventListener('click', () => this._exportarCSV(COLS, filasMatriz, ';'));
        const btnEn = document.getElementById('antCsvEn');
        if (btnEn) btnEn.addEventListener('click', () => this._exportarCSV(COLS, filasMatriz, ','));
        const btnEnr = document.getElementById('antEnriquecer');
        if (btnEnr) btnEnr.addEventListener('click', () => this.enriquecerSeleccion());
        // Paginación de ambas secciones
        this._cablearPaginas('Ref', () => this._selRef, v => { this._selRef = v; this._renderSeleccion(); }, npRef);
        this._cablearPaginas('Mat', () => this._selMat, v => { this._selMat = v; this._renderSeleccion(); }, npMat);
    },



    // Construye las 13 celdas (HTML para mostrar) y los 13 valores planos (CSV).
    // Insignia de relevancia (1-5) con color. Tooltip con el motivo.
    _insigniaRelevancia(o) {
        const p = o._relevancia;
        if (p == null) return '';
        if (p === 0) return '<span title="No evaluado" style="color:#999;">—</span>';
        // Colores: 5 verde fuerte, 4 verde, 3 ámbar, 2 naranja, 1 rojo.
        const estilos = {
            5: 'background:#1D9E75;color:#fff;',
            4: 'background:#97C459;color:#173404;',
            3: 'background:#EF9F27;color:#412402;',
            2: 'background:#F0997B;color:#4A1B0C;',
            1: 'background:#E24B4A;color:#fff;'
        };
        const motivo = (o._relevanciaMotivo || '').replace(/"/g, '&quot;');
        return `<span title="${motivo}" style="${estilos[p] || ''}display:inline-block;min-width:1.4rem;`
            + `text-align:center;padding:0.1rem 0.4rem;border-radius:0.3rem;font-weight:600;cursor:help;">${p}</span>`;
    },



    _filaMatriz(o) {
        const ref = this.citaAPA(o).replace(/<\/?i>/g, '');
        const link = o.link || o.doi || '';
        const pais = this._detectarPais(o);
        const muestra = this._detectarMuestra(o);
        const objetivo = this._detectarObjetivo(o);
        const indexacion = this._detectarIndexacion(o);
        const ph = '<span style="color:#aaa;">[completar]</span>';
        const incluirRel = !!this._relevanciaAplicada;
        // Autor: compacto en pantalla (primer autor + «et al.»), COMPLETO en las
        // exportaciones (todos en formato APA, separados por «; » — reimportable).
        const autoresAPA = (o.autores || []).map(a => this._autorAPA(a)).filter(Boolean);
        const autorCorto = autoresAPA.length
            ? (autoresAPA.length === 1 ? autoresAPA[0] : autoresAPA[0] + ' et al.')
            : '';
        const celdas = [
            ...(incluirRel ? [this._insigniaRelevancia(o) || ph] : []),
            o.titulo || ph,
            autorCorto || ph,
            o.anio || '',
            pais || ph,
            objetivo || ph,
            muestra || ph,
            ph, // instrumentos: no disponible en metadatos
            o.resumen ? (o.resumen.slice(0, 200) + (o.resumen.length > 200 ? '…' : '')) : ph, // resultados ≈ resumen
            ph, // conclusiones: requiere texto completo
            o.fuente || ph,
            this._insigniaCuartil(o) || ph,
            indexacion || ph,
            ref,
            link ? `<a href="${link}" target="_blank">${link}</a>` : ph
        ];
        const planas = [
            ...(incluirRel ? [o._relevancia ? `${o._relevancia} (${o._relevanciaMotivo || ''})` : ''] : []),
            o.titulo || '', autoresAPA.join('; '), o.anio || '', pais, objetivo, muestra, '',
            o.resumen || '', '', o.fuente || '', this._cuartilTexto(o), indexacion, ref, link
        ];
        return { celdas, planas };
    },



    _barraPaginas(tag, pagina, num, ini, total, pp) {
        if (num <= 1) return '';
        return `<div style="display:flex; align-items:center; justify-content:flex-end; gap:0.75rem; margin-top:0.5rem;">
            <button id="ant${tag}Prev" class="btn btn-outline" ${pagina === 0 ? 'disabled' : ''} style="padding:0.2rem 0.6rem;">◀</button>
            <span class="help-text">Página ${pagina + 1} de ${num} — ${ini + 1}–${Math.min(ini + pp, total)} de ${total}</span>
            <button id="ant${tag}Next" class="btn btn-outline" ${pagina >= num - 1 ? 'disabled' : ''} style="padding:0.2rem 0.6rem;">▶</button>
        </div>`;
    },


    _cablearPaginas(tag, get, set, num) {
        const prev = document.getElementById(`ant${tag}Prev`), next = document.getElementById(`ant${tag}Next`);
        if (prev) prev.addEventListener('click', () => { if (get() > 0) set(get() - 1); });
        if (next) next.addEventListener('click', () => { if (get() < num - 1) set(get() + 1); });
    },
};
