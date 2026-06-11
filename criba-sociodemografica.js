// ========================================
// CRIBA SOCIODEMOGRÁFICA (hallazgos según variables de caracterización)
// Para cada dato sociodemográfico detectado en la base, evalúa su relación
// con las DOS variables del análisis usando la prueba correcta:
//   · Categórico con 2 grupos → comparación de medias (t de Student o
//     U de Mann-Whitney según normalidad; motor validado del analizador),
//     con el tamaño del efecto apropiado (d de Cohen o r de rangos).
//   · Numérico (p. ej., Edad) → correlación (Pearson/Spearman automático).
//   · Categórico con 3+ grupos → se informa que requiere ANOVA/Kruskal-Wallis
//     (función planificada), sin inventar pruebas.
// Toda la familia de p-valores se ajusta con la corrección de Holm.
// Eficiencia: clasificación de columnas en UNA pasada, extracción de valores
// una vez por par, y cero matemática propia (reutiliza el motor validado).
// ========================================

const CribaSociodemografica = {

    _esEscala: col => /^(total|dimension|general|pc)_/i.test(col),
    _esItem: col => /^[A-Za-z]{1,6}\d+$/.test(col),

    // Clasifica las columnas sociodemográficas: categóricas (con sus niveles)
    // y numéricas. Excluye ID, escalas e ítems.
    detectarSocios(datos, excluir) {
        if (!datos || !datos.length) return [];
        const socios = [];
        Object.keys(datos[0]).forEach(col => {
            if (col === 'ID' || this._esEscala(col) || this._esItem(col) || excluir.includes(col)) return;
            const muestra = datos[0][col];
            // Categórica = texto que NO es un número completo ('3ro' es texto:
            // parseFloat lo confundiría con 3, por eso se usa conversión total).
            if (typeof muestra === 'string' && !Number.isFinite(+muestra)) {
                const niveles = [...new Set(datos.map(d => String(d[col] ?? '').trim()).filter(Boolean))];
                if (niveles.length >= 2) socios.push({ col, tipo: 'categorica', niveles });
            } else if (Number.isFinite(+muestra)) {
                socios.push({ col, tipo: 'numerica' });
            }
        });
        return socios;
    },

    // Ejecuta todas las pruebas pertinentes y ajusta los p por Holm.
    analizar(var1, var2, et1, et2) {
        const A = AnalizadorEstadistico;
        const datos = A.obtenerDatos() || [];
        const socios = this.detectarSocios(datos, [var1, var2]);
        if (!socios.length) return null;

        const I = InterpretacionesEstadisticas;
        const filas = [];
        const pares = [[var1, et1], [var2, et2]];

        socios.forEach(socio => {
            pares.forEach(([v, et]) => {
                try {
                    if (socio.tipo === 'numerica') {
                        const r = A.calcularCorrelacion(socio.col, v);
                        filas.push({
                            socio: socio.col, variable: et, tipo: 'correlacion',
                            prueba: I._esSpearman(r.tipoCorrelacion) ? 'Spearman (ρ)' : 'Pearson (r)',
                            valor: r.coeficiente.toFixed(3), p: r.pValor,
                            efecto: `${r.interpretacion.fuerza} (${r.interpretacion.direccion})`,
                            detalle: ''
                        });
                    } else if (socio.niveles.length === 2) {
                        const [n1, n2] = socio.niveles;
                        const g1 = [], g2 = [];
                        datos.forEach(d => {
                            const x = +d[v];
                            if (!Number.isFinite(x)) return;
                            if (String(d[socio.col]).trim() === n1) g1.push(x);
                            else if (String(d[socio.col]).trim() === n2) g2.push(x);
                        });
                        if (g1.length < 3 || g2.length < 3) return;
                        const c = A.compararGrupos(g1, g2, n1, n2);
                        const est = c.prueba.estadistico ?? c.prueba.t ?? c.prueba.U;
                        const ef = c.tamanoEfectoRangos
                            ? `r de rangos = ${c.tamanoEfectoRangos.r.toFixed(2)} (${c.tamanoEfectoRangos.interpretacion})`
                            : `d de Cohen = ${c.tamanoEfecto.d.toFixed(2)} (${c.tamanoEfecto.interpretacion})`;
                        const mayor = c.descriptivas1.media >= c.descriptivas2.media ? n1 : n2;
                        filas.push({
                            socio: socio.col, variable: et, tipo: 'comparacion',
                            prueba: c.prueba.prueba,
                            valor: Number.isFinite(est) ? (+est).toFixed(3) : '—',
                            p: c.prueba.pValor, efecto: ef,
                            detalle: `media mayor: ${mayor}`
                        });
                    } else {
                        filas.push({
                            socio: socio.col, variable: et, tipo: 'pendiente',
                            prueba: `${socio.niveles.length} grupos`, valor: '—', p: null,
                            efecto: '—', detalle: 'Requiere ANOVA/Kruskal-Wallis (próximamente)'
                        });
                    }
                } catch (e) { /* par no calculable: se omite sin romper la sección */ }
            });
        });
        if (!filas.length) return null;

        // Holm sobre la familia completa de pruebas efectivamente realizadas
        const conP = filas.filter(f => Number.isFinite(f.p));
        const holm = AnalizadorEstadistico.ajustarPValoresHolm(conP.map(f => f.p));
        conP.forEach((f, i) => { f.pHolm = holm[i]; f.sig = holm[i] < 0.05; });

        return { filas, totalPruebas: conP.length };
    },

    // Síntesis en prosa de los hallazgos (la consumen la web y el Word).
    sintetizar(res) {
        const sig = res.filas.filter(f => f.sig);
        let t = `Se realizaron ${res.totalPruebas} pruebas (correlaciones para sociodemográficos numéricos; comparaciones de dos grupos para los categóricos), con corrección de Holm para la familia completa. `;
        t += sig.length
            ? `Hallazgos significativos tras el ajuste: ${sig.map(f => `${f.socio} ↔ ${f.variable}${f.detalle ? ` (${f.detalle})` : ''}`).join('; ')}.`
            : `Ningún hallazgo alcanzó significancia tras el ajuste: las variables del estudio no muestran diferencias ni asociaciones detectables según los datos sociodemográficos disponibles.`;
        return t;
    },

    // Render de la sección web.
    mostrar(var1, var2, et1, et2) {
        const container = document.getElementById('resultadosHallazgosSocio');
        if (!container) return;
        const res = this.analizar(var1, var2, et1, et2);
        if (!res) { container.style.display = 'none'; container.innerHTML = ''; return; }

        const I = InterpretacionesEstadisticas;
        const filasHtml = res.filas.map(f => `
            <tr>
                <td><strong>${f.socio}</strong></td>
                <td>${f.variable}</td>
                <td>${f.prueba}</td>
                <td>${f.valor}</td>
                <td>${Number.isFinite(f.p) ? I._fmtP(f.p) : '—'}</td>
                <td>${Number.isFinite(f.pHolm) ? I._fmtP(f.pHolm) : '—'}</td>
                <td>${f.efecto}</td>
                <td>${f.tipo === 'pendiente' ? f.detalle : (f.sig ? `✅ Significativa${f.detalle ? ' — ' + f.detalle : ''}` : '➖ No significativa')}</td>
            </tr>`).join('');

        const sintesis = this.sintetizar(res);

        container.innerHTML = `
            <div class="result-section">
                <h3 class="section-title">🔎 Hallazgos según Variables Sociodemográficas</h3>
                <p class="result-subtitle">Exploración sistemática de cada dato sociodemográfico frente a las variables
                del estudio, con la prueba estadística apropiada a su naturaleza y la decisión basada en el p ajustado
                (corrección de Holm para comparaciones múltiples).</p>
                <div class="result-box">
                    <div class="table-container"><table class="table">
                        <thead><tr><th>Sociodemográfico</th><th>Variable</th><th>Prueba</th><th>Estadístico/Coef.</th>
                        <th>p</th><th>p (Holm)</th><th>Tamaño del efecto</th><th>Decisión</th></tr></thead>
                        <tbody>${filasHtml}</tbody>
                    </table></div>
                    <p style="margin: 0.6rem 0 0;">${sintesis}</p>
                </div>
            </div>`;
        container.style.display = 'block';
    }
};

if (typeof window !== 'undefined') {
    window.CribaSociodemografica = CribaSociodemografica;
}
