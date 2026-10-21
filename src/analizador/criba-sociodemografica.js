// analizador/criba-sociodemografica.js — criba sociodemográfica.
// Origen: criba-sociodemografica.js (Fase 3), sin cambios de comportamiento; dependencias explícitas.

import { AnalizadorEstadistico } from './estadistica.js';
import { InterpretacionesEstadisticas } from './interpretaciones.js';
import { Fiabilidad } from './fiabilidad.js';
import { indiceGrupoMayor } from './motor/grupos.js';
import { aNumero, esPerdido, esColumnaNumerica, esColumnaTexto } from '../core/data/celdas.js';
import { MAX_GRUPOS } from '../core/stats/protocolo-grupos.js';
import { formatoNumero } from '../shared/formato-numero.js';

// ========================================
// CRIBA SOCIODEMOGRÁFICA (hallazgos según variables de caracterización)
// Para cada dato sociodemográfico detectado en la base, evalúa su relación
// con las DOS variables del análisis usando la prueba correcta:
//   · Categórico con 2 grupos → comparación de medias (t de Student, t de Welch o
//     U de Mann-Whitney según los supuestos; el protocolo único de comparación de
//     grupos, core/stats/protocolo-grupos.js), con el tamaño del efecto apropiado
//     (d de Cohen o r de rangos).
//   · Numérico (p. ej., Edad) → correlación (Pearson/Spearman automático).
//   · Categórico con 3 o más grupos → (2026.12.20) la prueba global del mismo
//     protocolo: ANOVA de un factor, ANOVA de Welch o Kruskal-Wallis, con η² o ε²;
//     los grupos con menos de 3 casos se excluyen (como en la pestaña de grupos).
//     Hasta la 2026.12.19 la fila solo decía «Requiere ANOVA/Kruskal-Wallis
//     (próximamente)». Con más de MAX_GRUPOS (10) grupos comparables, la fila se
//     informa sin prueba, como en el resto del programa.
// Toda la familia de p-valores se ajusta con la corrección de Holm, y la decisión usa el α del estudio (2026.12.22; hasta
// la 2026.12.21, .05 fijo).
// Eficiencia: clasificación de columnas en UNA pasada, extracción de valores
// una vez por par, y cero matemática propia (reutiliza el motor validado).
// ========================================

const CribaSociodemografica = {

    _esEscala: col => /^(total|dimension|general|pc)_/i.test(col),
    _esItem: col => /^[A-Za-z]{1,6}\d+$/.test(col),
    // (2026.12.30) Los ítems de las escalas que reconoce la fiabilidad (por prefijo, como «AE_1», «Ansiedad1» o
    // «Item_01»; por la estructura del Simulador; o los que fijó el usuario en el configurador). Antes solo se excluían los
    // nombres como «AE1»: con «AE_1», cada ítem entraba en la criba como un dato sociodemográfico, salía como «hallazgo»
    // (un ítem correlaciona con su escala) y la familia de Holm pasaba de 4 a 28 pruebas, lo que podía invertir la
    // conclusión de las demás.
    _itemsDeEscalas(datos) {
        try { return new Set(Fiabilidad.detectarGrupos(datos).flatMap(g => g.items || [])); } catch (e) { return new Set(); }
    },

    // (2026.12.30) Cómo se nombra el grupo de valores más altos: por la media en las pruebas paramétricas y por el rango
    // medio en las de rangos (Mann-Whitney, Kruskal-Wallis), que es lo que comparan.
    _rotuloMayor: c => (c.parametrica ? 'media más alta' : 'rango medio más alto'),

    // Clasifica las columnas sociodemográficas: categóricas (con sus niveles)
    // y numéricas. Excluye ID, escalas e ítems.
    detectarSocios(datos, excluir) {
        if (!datos || !datos.length) return [];
        const socios = [];
        const items = this._itemsDeEscalas(datos);
        Object.keys(datos[0]).forEach(col => {
            if (col === 'ID' || this._esEscala(col) || this._esItem(col) || items.has(col) || excluir.includes(col)) return;
            // Categórica = texto que NO es un número completo ('3ro' es texto). (2026.12.18) El tipo, por el primer valor NO
            // perdido y con la conversión del núcleo: antes, por la primera fila y con +valor, una celda vacía al principio
            // hacía «numérica» a una columna de texto (+'' = 0), y los perdidos (NaN del Simulador) formaban el nivel «NaN».
            if (esColumnaTexto(datos, col)) {
                const niveles = [...new Set(datos.filter(d => !esPerdido(d[col])).map(d => String(d[col]).trim()))];
                if (niveles.length >= 2) socios.push({ col, tipo: 'categorica', niveles });
            } else if (esColumnaNumerica(datos, col)) {
                socios.push({ col, tipo: 'numerica' });
            }
        });
        return socios;
    },

    // (2026.12.20) Una variable categórica de 3 o más grupos frente a una del estudio: la prueba global del protocolo único
    // (la de la vista principal: ANOVA de un factor, ANOVA de Welch o Kruskal-Wallis), sin los grupos de menos de 3 casos;
    // si solo quedan dos, la comparación de dos grupos; si quedan más de MAX_GRUPOS, una fila sin prueba. null si no quedan
    // dos grupos comparables.
    _compararVarios(datos, socio, v, et) {
        const A = AnalizadorEstadistico;
        /** @type {Map<string, number[]>} */ const porNivel = new Map(socio.niveles.map(nv => [nv, []]));
        datos.forEach(d => {
            const x = aNumero(d[v]);
            if (!Number.isFinite(x) || esPerdido(d[socio.col])) return;
            const g = porNivel.get(String(d[socio.col]).trim());
            if (g) g.push(x);
        });
        const validos = [...porNivel.entries()].filter(([, g]) => g.length >= 3);
        if (validos.length < 2) return null;
        if (validos.length > MAX_GRUPOS) {
            return { socio: socio.col, variable: et, tipo: 'omitida', prueba: `${validos.length} grupos`, valor: '—', p: null, efecto: '—',
                detalle: `Demasiados grupos para compararlos (más de ${MAX_GRUPOS}): conviene reunirlos en categorías más amplias` };
        }
        const excluidos = [...porNivel.entries()].filter(([, g]) => g.length < 3).map(([nv, g]) => `${nv} (n = ${g.length})`);
        const nombres = validos.map(e => e[0]), grupos = validos.map(e => e[1]);
        const sinExcluidos = excluidos.length ? `; excluidos por n < 3: ${excluidos.join(', ')}` : '';
        if (grupos.length === 2) {
            const c = A.compararGrupos(grupos[0], grupos[1], nombres[0], nombres[1]);
            const ef = c.tamanoEfectoRangos
                ? `r de rangos = ${c.tamanoEfectoRangos.r.toFixed(2)} (${c.tamanoEfectoRangos.interpretacion})`
                : `d de Cohen = ${formatoNumero(c.tamanoEfecto.d, 2)} (${c.tamanoEfecto.interpretacion})`;
            const est = c.prueba.estadistico ?? c.prueba.U;
            return { socio: socio.col, variable: et, tipo: 'comparacion', prueba: c.prueba.prueba, valor: est == null ? '—' : formatoNumero(+est, 3),
                p: c.prueba.pValor, efecto: ef, detalle: `${this._rotuloMayor(c)}: ${nombres[indiceGrupoMayor(c)]}${sinExcluidos}` };
        }
        const c = A.compararVariosGrupos(grupos, nombres), pr = c.prueba, conF = pr.prueba !== 'Kruskal-Wallis';
        const efecto = conF ? pr.etaCuadrado : pr.epsilonCuadrado, est = conF ? pr.F : pr.H;
        const iMax = indiceGrupoMayor(c);
        return {
            socio: socio.col, variable: et, tipo: 'comparacion', prueba: pr.prueba, valor: formatoNumero(est, 3),
            p: pr.pValor, efecto: `${conF ? 'η²' : 'ε²'} = ${efecto.toFixed(2)} (${A.interpretarEtaCuadrado(efecto)})`,
            detalle: `${this._rotuloMayor(c)}: ${nombres[iMax]}${sinExcluidos}`
        };
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
                            const x = aNumero(d[v]);   // (2026.12.18) antes +valor: la celda vacía contaba como 0
                            if (!Number.isFinite(x)) return;
                            if (String(d[socio.col]).trim() === n1) g1.push(x);
                            else if (String(d[socio.col]).trim() === n2) g2.push(x);
                        });
                        if (g1.length < 3 || g2.length < 3) return;
                        const c = A.compararGrupos(g1, g2, n1, n2);
                        const est = c.prueba.estadistico ?? c.prueba.t ?? c.prueba.U;
                        const ef = c.tamanoEfectoRangos
                            ? `r de rangos = ${c.tamanoEfectoRangos.r.toFixed(2)} (${c.tamanoEfectoRangos.interpretacion})`
                            : `d de Cohen = ${formatoNumero(c.tamanoEfecto.d, 2)} (${c.tamanoEfecto.interpretacion})`;
                        const mayor = indiceGrupoMayor(c) === 0 ? n1 : n2;
                        filas.push({
                            socio: socio.col, variable: et, tipo: 'comparacion',
                            prueba: c.prueba.prueba,
                            valor: est == null ? '—' : formatoNumero(+est, 3),
                            p: c.prueba.pValor, efecto: ef,
                            detalle: `${this._rotuloMayor(c)}: ${mayor}`
                        });
                    } else {
                        const fila = this._compararVarios(datos, socio, v, et);
                        if (fila) filas.push(fila);
                    }
                } catch (e) { /* par no calculable: se omite sin romper la sección */ }
            });
        });
        if (!filas.length) return null;

        // Holm sobre la familia completa de pruebas efectivamente realizadas
        const conP = filas.filter(f => Number.isFinite(f.p));
        const holm = AnalizadorEstadistico.ajustarPValoresHolm(conP.map(f => f.p)), alfa = AnalizadorEstadistico.alfaEstudio();
        conP.forEach((f, i) => { f.pHolm = holm[i]; f.sig = holm[i] < alfa; });

        return { filas, totalPruebas: conP.length };
    },

    // Síntesis en prosa de los hallazgos (la consumen la web y el Word).
    sintetizar(res) {
        const sig = res.filas.filter(f => f.sig);
        let t = `Se realizaron ${res.totalPruebas} pruebas (correlaciones para sociodemográficos numéricos; comparaciones de grupos para los categóricos), con corrección de Holm para la familia completa. `;
        t += sig.length
            ? `Hallazgos significativos tras el ajuste: ${sig.map(f => `${f.socio} ↔ ${f.variable}${f.detalle ? ` (${f.detalle})` : ''}`).join('; ')}.`
            : `Ningún hallazgo alcanzó significancia tras el ajuste: las variables del estudio no muestran diferencias ni asociaciones detectables según los datos sociodemográficos disponibles.`;
        return t;
    },

    // Render de la sección web.
    mostrar(var1, var2, et1, et2) {
        // Autosuficiente: si el contenedor no existe en el HTML (index antiguo),
        // se crea dinámicamente justo después de la sección de Niveles.
        let container = document.getElementById('resultadosHallazgosSocio');
        if (!container) {
            const ancla = document.getElementById('resultadosNiveles')
                || document.getElementById('resultadosDimensiones')
                || document.getElementById('marcoMetodologicoContainer');
            if (!ancla || !ancla.parentNode) return;
            container = document.createElement('div');
            container.id = 'resultadosHallazgosSocio';
            container.style.display = 'none';
            ancla.parentNode.insertBefore(container, ancla.nextSibling);
        }
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
                <td>${f.tipo === 'omitida' ? f.detalle : (f.sig ? `✅ Significativa${f.detalle ? ' — ' + f.detalle : ''}` : '➖ No significativa')}</td>
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
}

export { CribaSociodemografica };
