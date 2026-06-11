// ========================================
// MATRIZ DE CONSISTENCIA (formato clásico de tesis: Problema | Objetivos |
// Hipótesis | Variables | Metodología). construir(ctx) devuelve la estructura
// de datos (la consumirán la web AHORA y el exportador Word DESPUÉS);
// mostrar(ctx) la renderiza en la página. Todos los contenidos provienen del
// marco ya generado (fuente única): la matriz es coherente por construcción.
// ========================================

const MatrizConsistencia = {

    construir(ctx) {
        if (!ctx || !ctx.marco) return null;
        const { marco, et1, et2, var1, var2, resultado, unidadAnalisis, lugarContexto } = ctx;
        const I = InterpretacionesEstadisticas;
        const E = (typeof EtiquetasVariables !== 'undefined') ? EtiquetasVariables : null;
        const p1 = E ? E.pruebaConGeneral(var1) : null;
        const p2 = E ? E.pruebaConGeneral(var2) : null;

        const objetivos = [
            { rotulo: 'General', texto: marco.objetivoGeneral },
            ...(marco.objetivosEspecificos || []).map((o, i) => ({ rotulo: `OE${i + 1}`, texto: o }))
        ];

        const hipEspecificas = I.generarHipotesisEspecificas
            ? I.generarHipotesisEspecificas(marco.objetivosEspecificos || [])
            : [];
        const hipotesis = [
            { rotulo: 'H₁', texto: marco.hipotesis.hipotesisInvestigador },
            { rotulo: 'H₀', texto: marco.hipotesis.hipotesisNula },
            ...hipEspecificas.map((h, i) => ({ rotulo: `Hi${i + 1}`, texto: h }))
        ];

        const variableDe = (et, p) => {
            const dims = (p && p.dimensiones && p.dimensiones.length)
                ? ` Dimensiones: ${p.dimensiones.map(d => d.etiqueta).join(', ')}.`
                : '';
            return `${et}.${dims}`;
        };

        const esSp = resultado ? I._esSpearman(resultado.tipoCorrelacion) : false;
        const muestra = resultado
            ? `N = ${resultado.n}${(unidadAnalisis ? ` (${unidadAnalisis}${lugarContexto ? ` de ${lugarContexto}` : ''})` : '')}`
            : (unidadAnalisis || '—');
        const instrumentos = [p1 && p1.prueba, p2 && p2.prueba].filter(Boolean).join(' y ')
            || 'Instrumentos estandarizados de medición psicológica';

        return {
            problema: [marco.preguntaInvestigacion],
            objetivos,
            hipotesis,
            variables: (() => {
                const vs = [
                    { rotulo: 'V1', texto: variableDe(et1, p1) },
                    { rotulo: 'V2', texto: variableDe(et2, p2) }
                ];
                // CSV externo sin estructura: listar las columnas Dimension_*
                // (con sus etiquetas renombradas) como dimensiones en estudio.
                if (!p1 && !p2 && typeof AnalizadorEstadistico !== 'undefined') {
                    const datos = AnalizadorEstadistico.obtenerDatos() || [];
                    if (datos.length) {
                        const dims = Object.keys(datos[0])
                            .filter(c => /^dimension_/i.test(c))
                            .map(c => (E ? E.etiqueta(c) : c));
                        if (dims.length) vs.push({ rotulo: 'Dimensiones en estudio', texto: dims.join(', ') + '.' });
                    }
                }
                return vs;
            })(),
            metodologia: [
                'Tipo: básica', 'Enfoque: cuantitativo', 'Diseño: no experimental',
                'Alcance: correlacional', 'Corte: transversal',
                `Población/Muestra: ${muestra}`,
                `Instrumentos: ${instrumentos}`,
                `Análisis: pruebas de normalidad, correlación de ${esSp ? 'Spearman' : 'Pearson'} y corrección de Holm para comparaciones múltiples`
            ]
        };
    },

    mostrar(ctx) {
        const m = this.construir(ctx);
        if (!m) return;

        // Contenedor autosuficiente (patrón probado: se crea si el HTML no lo trae)
        let container = document.getElementById('resultadosMatrizConsistencia');
        if (!container) {
            const ancla = document.getElementById('resultadosDimensiones')
                || document.getElementById('marcoMetodologicoContainer');
            if (!ancla || !ancla.parentNode) return;
            container = document.createElement('div');
            container.id = 'resultadosMatrizConsistencia';
            container.style.display = 'none';
            ancla.parentNode.insertBefore(container, ancla.nextSibling);
        }

        const lista = items => `<ul style="margin:0; padding-left:1rem;">${items.map(it =>
            typeof it === 'string'
                ? `<li style="margin-bottom:0.4rem;">${it}</li>`
                : `<li style="margin-bottom:0.4rem;"><strong>${it.rotulo}:</strong> ${it.texto}</li>`
        ).join('')}</ul>`;

        container.innerHTML = `
            <div class="result-section">
                <h3 class="section-title">🧩 Matriz de Consistencia</h3>
                <p class="result-subtitle">Alineación problema → objetivos → hipótesis → variables → metodología.
                Generada desde el mismo marco del estudio, por lo que la coherencia entre columnas está
                garantizada por construcción.</p>
                <div class="result-box"><div class="table-container">
                    <table class="table" style="vertical-align: top;">
                        <thead><tr>
                            <th style="width:18%">Problema</th><th style="width:22%">Objetivos</th>
                            <th style="width:24%">Hipótesis</th><th style="width:16%">Variables</th>
                            <th style="width:20%">Metodología</th>
                        </tr></thead>
                        <tbody><tr style="vertical-align: top;">
                            <td>${lista(m.problema)}</td>
                            <td>${lista(m.objetivos)}</td>
                            <td>${lista(m.hipotesis)}</td>
                            <td>${lista(m.variables)}</td>
                            <td>${lista(m.metodologia)}</td>
                        </tr></tbody>
                    </table>
                </div></div>
            </div>`;
        container.style.display = 'block';
    }
};

if (typeof window !== 'undefined') {
    window.MatrizConsistencia = MatrizConsistencia;
}
