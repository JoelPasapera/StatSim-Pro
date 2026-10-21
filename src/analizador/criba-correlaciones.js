import { varianza } from '../core/stats/descriptivos.js';
import { correlacion, paresCompletos } from '../core/stats/correlacion.js';
import { columnaNumerica } from '../core/data/celdas.js';
import { rangosPromedio } from '../core/stats/orden.js';
// analizador/criba-correlaciones.js — criba de correlaciones.
// Origen: criba-correlaciones.js (Fase 3), sin cambios de comportamiento; dependencias explícitas.

// ========================================
// CRIBA VECTORIZADA DE CORRELACIONES
// Evalúa MUCHOS pares candidatos a bajo costo para seleccionar los objetivos
// específicos EN FUNCIÓN DE LOS DATOS, y deja el reporte fino de los elegidos
// al motor estadístico validado (cero duplicación de matemática reportada).
//
// Eficiencia (n = casos, c = columnas distintas, m = pares):
//   · Extracción de columnas a Float64Array (memoria contigua): O(n·c), UNA vez
//   · Normalidad: UNA por columna (caché), no por par → 2m pruebas pasan a ser c
//   · Rangos de Spearman: UNA por columna (caché), O(n log n)
//   · Coeficiente por par: UNA pasada fusionada de 5 acumuladores, O(n), sin
//     arreglos intermedios
//   · Selección top-k: una pasada con inserción acotada (k constante), O(m)
// Total: O(c·n log n + m·n), frente al ingenuo O(m·(n log n + normalidades)).
// ========================================

const CribaCorrelaciones = {

    // CONFIGURACIÓN (hardcodeada y conmutable al instante):
    // Umbral mínimo de |r| para que un par sea candidato a objetivo específico.
    // Cohen (1988): |r| ≥ .10 efecto pequeño (mínimo reportable), .30 mediano, .50 grande.
    UMBRAL_ABS: 0.10,
    // Máximo de objetivos específicos correlacionales a seleccionar.
    MAX_OBJETIVOS: 5,
    // ¿El umbral EXCLUYE de la selección?
    //   false → se eligen los mejores |r| hasta MAX_OBJETIVOS aunque no lleguen
    //           al umbral (este queda como referencia informativa en la tabla)
    //   true  → solo entran pares con |r| ≥ UMBRAL_ABS
    SELECCION_ESTRICTA: false,

    // datos: arreglo de filas {col: valor}; pares: [{columnaX, columnaY, ...meta}];
    // analizador: instancia con evaluarNormalidad(valores).
    // Devuelve { evaluados (orden |r| desc), seleccionados (≤ MAX), umbral, maximo }.
    cribar(datos, pares, analizador) {
        const n = (datos || []).length;
        const cacheCol = new Map();    // col -> { v: Float64Array alineada (NaN si falta), finitos, completa } | null
        const cacheNorm = new Map();   // col -> boolean
        const cacheRangos = new Map(); // col -> Float64Array (rango medio en empates), solo de columnas completas

        // Columna como memoria contigua, con la conversión de todo el Analizador (core/data/celdas.js); null si tiene
        // menos de 3 valores. (2026.12.18) Antes, con +valor: una columna con un solo perdido (NaN) quedaba fuera de la
        // criba entera, y la celda vacía de un CSV contaba como 0.
        const columna = (col) => {
            if (cacheCol.has(col)) return cacheCol.get(col);
            const v = columnaNumerica(datos || [], col), finitos = v.filter(Number.isFinite);
            const res = finitos.length >= 3 ? { v, finitos, completa: finitos.length === n } : null;
            cacheCol.set(col, res);
            return res;
        };

        // Normalidad evaluada UNA sola vez por columna, con todos sus valores.
        const esNormal = (col) => {
            if (cacheNorm.has(col)) return cacheNorm.get(col);
            const c = columna(col);
            let r = false;
            if (c) {
                try { r = !!analizador.evaluarNormalidad(Array.from(c.finitos)).normal; }
                catch (e) { r = false; }
            }
            cacheNorm.set(col, r);
            return r;
        };

        // Rangos (para Spearman = Pearson sobre rangos, con rango medio en empates), en caché para las columnas completas.
        const rangos = (col) => { if (cacheRangos.has(col)) return cacheRangos.get(col); const rg = rangosPromedio(columna(col).v); cacheRangos.set(col, rg); return rg; };

        // Pearson en UNA pasada fusionada (5 acumuladores, cero arreglos extra).
        const pearson = (/** @type {ArrayLike<number>} */ x, /** @type {ArrayLike<number>} */ y) => { const r = correlacion(x, y); if (!Number.isNaN(r)) return r; return varianza(x) === 0 || varianza(y) === 0 ? 0 : NaN; };   // (2026.12.12) en dos pasadas; 0 si alguna es constante, NaN si hay datos inválidos

        // Evaluar todos los pares candidatos
        // (2026.12.18) cada par, con los casos que tienen las DOS variables (eliminación por pares, como el análisis
        // completo de cada objetivo); sin perdidos, las columnas enteras y sus rangos en caché, como antes
        const evaluados = (pares || []).map(par => {
            const cx = columna(par.columnaX), cy = columna(par.columnaY);
            const completas = !!(cx && cy && cx.completa && cy.completa), pp = cx && cy && !completas ? paresCompletos(cx.v, cy.v) : null;
            if (!cx || !cy || (pp && pp.x.length < 3)) {
                return Object.assign({}, par, { valido: false, coeficiente: NaN, metodo: null, superaUmbral: false });
            }
            const usarPearson = esNormal(par.columnaX) && esNormal(par.columnaY);
            const coef = completas
                ? (usarPearson ? pearson(cx.v, cy.v) : pearson(rangos(par.columnaX), rangos(par.columnaY)))
                : (usarPearson ? pearson(pp.x, pp.y) : pearson(rangosPromedio(pp.x), rangosPromedio(pp.y)));
            return Object.assign({}, par, {
                valido: true,
                metodo: usarPearson ? 'Pearson' : 'Spearman',
                coeficiente: coef,
                superaUmbral: Math.abs(coef) >= this.UMBRAL_ABS
            });
        });

        // Selección top-k por |r| RESPETANDO PRIORIDADES: los pares con
        // prioridad 1 (dimensión ↔ escala general) entran SÍ O SÍ primero,
        // de mayor a menor |r|; los de prioridad 2 (dimensión ↔ dimensión)
        // completan los cupos restantes. Inserción acotada por nivel: O(m).
        const k = this.MAX_OBJETIVOS;
        const seleccionados = [];
        const niveles = [...new Set(evaluados.map(e => e.prioridad || 1))].sort((a, b) => a - b);
        for (const nivel of niveles) {
            if (seleccionados.length >= k) break;
            const cupo = k; // la lista global no puede exceder k
            const delNivel = [];
            for (const e of evaluados) {
                if (!e.valido || (this.SELECCION_ESTRICTA && !e.superaUmbral) || (e.prioridad || 1) !== nivel) continue;
                let pos = delNivel.length;
                while (pos > 0 && Math.abs(delNivel[pos - 1].coeficiente) < Math.abs(e.coeficiente)) pos--;
                if (pos < cupo - seleccionados.length) {
                    delNivel.splice(pos, 0, e);
                    if (delNivel.length > cupo - seleccionados.length) delNivel.pop();
                }
            }
            seleccionados.push(...delNivel);
        }
        seleccionados.forEach(s => { s.seleccionado = true; });

        // Orden descendente por |r| solo para PRESENTAR la criba (m es pequeño)
        evaluados.sort((a, b) => (Math.abs(b.coeficiente) || 0) - (Math.abs(a.coeficiente) || 0));

        return { evaluados, seleccionados, umbral: this.UMBRAL_ABS, maximo: k, n };
    }
};

if (typeof window !== 'undefined') {
}

export { CribaCorrelaciones };
