// ========================================
// META-ANÁLISIS BÁSICO (correlaciones) — módulo autónomo.
// Filosofía de honestidad académica: el INVESTIGADOR transcribe el tamaño del
// efecto (r) y el N de cada estudio LEYENDO EL TEXTO COMPLETO (no el resumen);
// la app hace la estadística con rigor: transformación de Fisher, modelo de
// efectos aleatorios (DerSimonian-Laird), heterogeneidad (Q, I², τ²) y el
// forest plot. Nada se extrae automáticamente: un efecto mal extraído es peor
// que ninguno.
//
// Alcance v1: correlaciones (r de Pearson/Spearman) — el efecto natural de los
// estudios correlacionales. (d de Cohen: fase siguiente si se necesita.)
// ========================================
const MetaAnalisis = {
    _estudios: [], // {etiqueta, r, n}
    montar() {
        const secc = document.getElementById('seccionAntecedentes');
        if (!secc || document.getElementById('metaPanel')) return;
        const panel = document.createElement('div');
        panel.id = 'metaPanel';
        panel.className = 'form-group';
        panel.style.cssText = 'margin-top:1.5rem; padding-top:1.2rem; border-top:1px dashed var(--color-border, #e5e5e5);';
        panel.innerHTML = `
          <h3 style="margin:0 0 0.3rem; font-size:1.05rem;">📊 Meta-análisis de correlaciones (forest plot)</h3>
          <p class="help-text" style="margin:0 0 0.6rem;"><strong>Tú transcribes, la app calcula.</strong> Lee el <em>texto completo</em> de cada estudio incluido y anota su correlación (r) y tamaño muestral (N) — no los tomes del resumen: los abstracts suelen reportar efectos de subescalas o submuestras. La app combina los efectos con un modelo de efectos aleatorios y dibuja el forest plot.</p>
          <div class="table-container">
            <table class="table" id="metaTabla" style="max-width:640px;">
              <thead><tr><th>Estudio (cita corta)</th><th>r</th><th>N</th><th></th></tr></thead>
              <tbody id="metaBody"></tbody>
            </table>
          </div>
          <div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center; margin-top:0.5rem;">
            <button id="metaAgregar" class="btn btn-secondary" style="padding:0.35rem 0.9rem;">＋ Agregar estudio</button>
            <button id="metaCalcular" class="btn btn-primary" style="padding:0.4rem 1rem;">🧮 Calcular y dibujar</button>
            <button id="metaPNG" class="btn btn-outline" style="padding:0.4rem 1rem; display:none;">⬇ Descargar PNG</button>
          </div>
          <div id="metaEstado" class="help-text" style="margin-top:0.5rem;"></div>
          <div id="metaResultado" style="display:none; margin-top:0.8rem; padding:0.9rem 1rem; border:1px solid var(--color-border,#ddd); border-radius:0.5rem; background:#fafafa; font-size:0.93rem; line-height:1.55;"></div>
          <div id="metaLienzo" style="display:none; margin-top:0.8rem; overflow:auto; border:1px solid var(--color-border,#ddd); border-radius:0.5rem; background:#fff; padding:0.8rem;"></div>`;
        secc.parentElement.appendChild(panel);
        document.getElementById('metaAgregar').addEventListener('click', () => this._agregarFila());
        document.getElementById('metaCalcular').addEventListener('click', () => this._onCalcular());
        document.getElementById('metaPNG').addEventListener('click', () => this._descargarPNG());
        this._agregarFila(); this._agregarFila(); // dos filas de arranque
    },
    _agregarFila(datos = {}) {
        const body = document.getElementById('metaBody');
        if (!body) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" class="input input-sm meta-etq" placeholder="Ej: García et al. (2023)" value="${datos.etiqueta || ''}"></td>
          <td><input type="number" class="input input-sm meta-r" step="0.01" min="-0.999" max="0.999" placeholder="0.35" style="width:90px;" value="${datos.r != null ? datos.r : ''}"></td>
          <td><input type="number" class="input input-sm meta-n" step="1" min="4" placeholder="120" style="width:90px;" value="${datos.n != null ? datos.n : ''}"></td>
          <td><button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar">✕</button></td>`;
        tr.querySelector('.btn-delete').addEventListener('click', () => tr.remove());
        body.appendChild(tr);
    },
    _leerFilas() {
        const filas = [...document.querySelectorAll('#metaBody tr')];
        const estudios = [];
        const errores = [];
        filas.forEach((tr, i) => {
            const etiqueta = tr.querySelector('.meta-etq').value.trim();
            const rTxt = tr.querySelector('.meta-r').value.trim().replace(',', '.');
            const nTxt = tr.querySelector('.meta-n').value.trim();
            if (!etiqueta && !rTxt && !nTxt) return; // fila vacía: ignorar
            const r = parseFloat(rTxt), n = parseInt(nTxt, 10);
            if (!etiqueta) errores.push(`Fila ${i + 1}: falta la cita del estudio.`);
            if (!(r > -1 && r < 1)) errores.push(`Fila ${i + 1}: r debe estar entre −1 y 1 (exclusivos).`);
            if (!(n >= 4)) errores.push(`Fila ${i + 1}: N debe ser un entero ≥ 4 (la fórmula usa N − 3).`);
            if (etiqueta && r > -1 && r < 1 && n >= 4) estudios.push({ etiqueta, r, n });
        });
        return { estudios, errores };
    },
    // ---- ESTADÍSTICA ----
    // Modelo de efectos aleatorios sobre correlaciones vía transformación de
    // Fisher: z = atanh(r), Var(z) = 1/(N−3). DerSimonian-Laird para τ².
    calcular(estudios) {
        const k = estudios.length;
        const zs = estudios.map(e => Math.atanh(e.r));
        const vs = estudios.map(e => 1 / (e.n - 3)); // varianza de z
        // Efectos fijos (base para Q y τ²)
        const wF = vs.map(v => 1 / v);
        const sumWF = wF.reduce((a, b) => a + b, 0);
        const zF = wF.reduce((s, w, i) => s + w * zs[i], 0) / sumWF;
        const Q = wF.reduce((s, w, i) => s + w * Math.pow(zs[i] - zF, 2), 0);
        const df = k - 1;
        const C = sumWF - wF.reduce((s, w) => s + w * w, 0) / sumWF;
        const tau2 = df > 0 && C > 0 ? Math.max(0, (Q - df) / C) : 0;
        const I2 = Q > 0 && df > 0 ? Math.max(0, ((Q - df) / Q) * 100) : 0;
        // Efectos aleatorios
        const wR = vs.map(v => 1 / (v + tau2));
        const sumWR = wR.reduce((a, b) => a + b, 0);
        const zR = wR.reduce((s, w, i) => s + w * zs[i], 0) / sumWR;
        const seR = Math.sqrt(1 / sumWR);
        const icZ = [zR - 1.959964 * seR, zR + 1.959964 * seR];
        // p bilateral del efecto combinado (normal estándar)
        const zEst = zR / seR;
        const p = 2 * (1 - this._phi(Math.abs(zEst)));
        // De vuelta a la métrica r
        const detalle = estudios.map((e, i) => {
            const se = Math.sqrt(vs[i]);
            return {
                etiqueta: e.etiqueta, r: e.r, n: e.n,
                icR: [Math.tanh(zs[i] - 1.959964 * se), Math.tanh(zs[i] + 1.959964 * se)],
                pesoPct: 100 * wR[i] / sumWR
            };
        });
        return {
            k, nTotal: estudios.reduce((s, e) => s + e.n, 0),
            rComb: Math.tanh(zR), icComb: [Math.tanh(icZ[0]), Math.tanh(icZ[1])],
            p, Q, df, tau2, I2, detalle
        };
    },
    // Φ(x): función de distribución normal estándar (aprox. Abramowitz-Stegun).
    _phi(x) {
        const t = 1 / (1 + 0.2316419 * x);
        const d = 0.3989422804014327 * Math.exp(-x * x / 2);
        const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
        return 1 - p;
    },
    _fmt(x, dec = 3) { return Number(x).toFixed(dec).replace('.', ','); },
    _onCalcular() {
        const estado = document.getElementById('metaEstado');
        const { estudios, errores } = this._leerFilas();
        if (errores.length) { if (estado) estado.textContent = '⚠️ ' + errores.join(' '); return; }
        if (estudios.length < 2) { if (estado) estado.textContent = '⚠️ Se necesitan al menos 2 estudios con cita, r y N.'; return; }
        this._estudios = estudios;
        const res = this.calcular(estudios);
        if (estado) estado.textContent = '';
        this._pintarResultado(res);
        this._pintarForest(res);
        const png = document.getElementById('metaPNG'); if (png) png.style.display = '';
    },
    _pintarResultado(res) {
        const div = document.getElementById('metaResultado');
        if (!div) return;
        const f = this._fmt;
        const magnitud = Math.abs(res.rComb) < 0.10 ? 'trivial' : Math.abs(res.rComb) < 0.30 ? 'pequeña'
            : Math.abs(res.rComb) < 0.50 ? 'moderada' : 'grande';
        const het = res.I2 < 25 ? 'baja' : res.I2 < 50 ? 'moderada' : res.I2 < 75 ? 'sustancial' : 'considerable';
        const pTxt = res.p < 0.001 ? 'p < 0,001' : 'p = ' + f(res.p);
        div.style.display = '';
        div.innerHTML = `
          <strong>Efecto combinado (efectos aleatorios):</strong> r = ${f(res.rComb)},
          IC 95 % [${f(res.icComb[0])}, ${f(res.icComb[1])}], ${pTxt} —
          magnitud <em>${magnitud}</em> según la convención de Cohen
          (k = ${res.k} estudios, N total = ${res.nTotal.toLocaleString('es')}).<br>
          <strong>Heterogeneidad:</strong> Q(${res.df}) = ${f(res.Q, 2)}, I² = ${f(res.I2, 1)} % (${het}), τ² = ${f(res.tau2, 4)}.<br><br>
          <strong>¿Por qué así?</strong> Cada r se transforma a la escala z de Fisher, porque en esa escala
          la distribución del efecto es aproximadamente normal y su varianza depende solo del tamaño muestral
          (1/(N−3)) — por eso los estudios grandes pesan más. Se usa el modelo de <em>efectos aleatorios</em>
          (DerSimonian-Laird) porque asume, con realismo, que los estudios no estiman un único efecto idéntico
          sino una distribución de efectos verdaderos (poblaciones, instrumentos y contextos distintos); τ²
          estima esa varianza entre estudios. I² indica qué porcentaje de la variabilidad observada se debe a
          heterogeneidad real y no al azar del muestreo${res.I2 >= 50 ? ' — con este nivel, conviene interpretar el efecto combinado con cautela y explorar posibles moderadores' : ''}.
          El resultado combinado se devuelve a la métrica r con la transformación inversa.<br><br>
          <em>⚠️ Recordatorio de honestidad: verifica que cada r y N provengan del texto completo del estudio
          (no del resumen) y que todos midan la MISMA relación entre las mismas variables.</em>`;
    },
    // ---- Forest plot (SVG) ----
    _svgForest(res) {
        const f = this._fmt;
        const filas = res.detalle;
        const W = 720, filaH = 30, margenSup = 56;
        const H = margenSup + (filas.length + 2) * filaH + 60;
        const x0 = 320, x1 = 620; // zona del gráfico
        const rMin = Math.min(-0.1, ...filas.map(d => d.icR[0]), res.icComb[0]) - 0.05;
        const rMax = Math.max(0.1, ...filas.map(d => d.icR[1]), res.icComb[1]) + 0.05;
        const X = r => x0 + (r - rMin) / (rMax - rMin) * (x1 - x0);
        const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const partes = [];
        // Cabecera
        partes.push(`<text x="16" y="${margenSup - 14}" font-size="12" font-weight="bold">Estudio</text>`);
        partes.push(`<text x="${x1 + 8}" y="${margenSup - 14}" font-size="12" font-weight="bold">r [IC 95 %]</text>`);
        // Línea de efecto nulo (r = 0)
        partes.push(`<line x1="${X(0)}" y1="${margenSup - 6}" x2="${X(0)}" y2="${margenSup + filas.length * filaH + 14}" stroke="#999" stroke-dasharray="4 3"/>`);
        // Estudios
        filas.forEach((d, i) => {
            const y = margenSup + i * filaH + filaH / 2;
            const lado = 5 + Math.sqrt(d.pesoPct) * 1.6; // área ∝ peso
            partes.push(`<text x="16" y="${y + 4}" font-size="11.5">${esc(d.etiqueta)}</text>`);
            partes.push(`<line x1="${X(d.icR[0])}" y1="${y}" x2="${X(d.icR[1])}" y2="${y}" stroke="#1a1a1a" stroke-width="1.4"/>`);
            partes.push(`<rect x="${X(d.r) - lado / 2}" y="${y - lado / 2}" width="${lado}" height="${lado}" fill="#2E5BBA"/>`);
            partes.push(`<text x="${x1 + 8}" y="${y + 4}" font-size="11">${f(d.r, 2)} [${f(d.icR[0], 2)}, ${f(d.icR[1], 2)}] · ${f(d.pesoPct, 1)} %</text>`);
        });
        // Diamante del efecto combinado
        const yC = margenSup + (filas.length + 0.7) * filaH;
        const cx = X(res.rComb), izq = X(res.icComb[0]), der = X(res.icComb[1]);
        partes.push(`<polygon points="${izq},${yC} ${cx},${yC - 9} ${der},${yC} ${cx},${yC + 9}" fill="#B85C2E"/>`);
        partes.push(`<text x="16" y="${yC + 4}" font-size="12" font-weight="bold">Efecto combinado (EA)</text>`);
        partes.push(`<text x="${x1 + 8}" y="${yC + 4}" font-size="11" font-weight="bold">${f(res.rComb, 2)} [${f(res.icComb[0], 2)}, ${f(res.icComb[1], 2)}]</text>`);
        // Eje r
        const yEje = yC + 26;
        partes.push(`<line x1="${x0}" y1="${yEje}" x2="${x1}" y2="${yEje}" stroke="#1a1a1a"/>`);
        for (let r = Math.ceil(rMin * 5) / 5; r <= rMax + 1e-9; r = +(r + 0.2).toFixed(1)) {
            partes.push(`<line x1="${X(r)}" y1="${yEje}" x2="${X(r)}" y2="${yEje + 5}" stroke="#1a1a1a"/>`);
            partes.push(`<text x="${X(r)}" y="${yEje + 18}" font-size="10" text-anchor="middle">${f(r, 1)}</text>`);
        }
        partes.push(`<text x="${(x0 + x1) / 2}" y="${yEje + 34}" font-size="11" text-anchor="middle">Correlación (r) — Fisher z para el cálculo, mostrada en r</text>`);
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">
          <rect width="${W}" height="${H}" fill="#fff"/>
          <text x="16" y="24" font-size="13" font-weight="bold">Forest plot — modelo de efectos aleatorios (I² = ${f(res.I2, 1)} %)</text>
          ${partes.join('\n')}
        </svg>`;
    },
    _pintarForest(res) {
        const lienzo = document.getElementById('metaLienzo');
        if (!lienzo) return;
        lienzo.innerHTML = this._svgForest(res);
        lienzo.style.display = '';
    },
    _descargarPNG() {
        const lienzo = document.getElementById('metaLienzo');
        const svgEl = lienzo && lienzo.querySelector('svg');
        if (!svgEl) return;
        const xml = new XMLSerializer().serializeToString(svgEl);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = svgEl.viewBox.baseVal.width * 2;
            canvas.height = svgEl.viewBox.baseVal.height * 2;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = 'forest_plot.png';
            a.click();
        };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    }
};
if (typeof window !== 'undefined') {
    window.MetaAnalisis = MetaAnalisis;
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => MetaAnalisis.montar());
    } else {
        MetaAnalisis.montar();
    }
}
