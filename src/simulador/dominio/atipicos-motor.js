// simulador/dominio/atipicos-motor.js — plantar los atípicos influyentes en la base (Atlas de relaciones, dimensión B4).
// Mixin del generador: las últimas k filas del par X–Y se reescriben como casos atípicos. Su X y su Y se resuelven con los
// estadísticos REALES de las demás filas (la mayoría), para que la r con ellos sea la pedida; sus ítems se reparten de
// nuevo desde el total extremo y el puntaje general de su test se recalcula. El resto de sus variables no cambia: son
// atípicos solo en X y en Y.
import { resolverAtipicos, limitesEscala } from './atipicos.js';

export const metodosAtipicos = {
    _plantarAtipicos(base, { colTotal, colItems, colGeneral, objetivoInterno, factorDEPrueba }) {
        const cfg = this.configuracion, n = base.n;
        for (const at of cfg.atipicos || []) {
            const pX = (cfg.pruebas || []).find(p => p.nombre === at.x), pY = (cfg.pruebas || []).find(p => p.nombre === at.y);
            if (!pX || !pY || !colTotal.has(pX) || !colTotal.has(pY)) continue;   // la validación exige dos escalas
            const cx = colTotal.get(pX).datos, cy = colTotal.get(pY).datos, desde = n - at.casos;
            const mayoria = { n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 };
            for (let i = 0; i < desde; i++) { const x = cx[i], y = cy[i]; mayoria.n++; mayoria.sx += x; mayoria.sy += y; mayoria.sxx += x * x; mayoria.syy += y * y; mayoria.sxy += x * y; }
            const sol = resolverAtipicos({ mayoria, k: at.casos, rObjetivo: at.rCon, limitesX: limitesEscala(pX), limitesY: limitesEscala(pY) });
            const contexto = { colTotal, colItems, objetivoInterno, factorDEPrueba };
            sol.puntos.forEach(([x, y], j) => { this._reescribirTotal(pX, desde + j, x, contexto); this._reescribirTotal(pY, desde + j, y, contexto); });
            colGeneral.forEach(({ columna, dims }) => {
                if (!dims.some(d => d === colTotal.get(pX) || d === colTotal.get(pY))) return;
                for (let i = desde; i < n; i++) { let s = 0; for (const d of dims) s += d.datos[i]; columna.datos[i] = Math.round(s / dims.length); }
            });
        }
    },

    // total de una fila reescrito, con sus ítems repartidos de nuevo desde él (invertidos, reflejados). Sin factores de
    // otras dimensiones ni de método (neutros): el atípico lo es solo en su total
    _reescribirTotal(prueba, i, total, { colTotal, colItems, objetivoInterno, factorDEPrueba }) {
        const perfil = this.perfilesItems ? this.perfilesItems.get(prueba) : null, de = prueba.desviacion * (factorDEPrueba.get(prueba) || 1);
        const zOtras = { ['metodo:' + prueba.prueba]: 0 };
        if (perfil && perfil.cruzadas) perfil.cruzadas.forEach(c => { zOtras[c.sigla] = 0; });
        const puntajes = this._repartirEnItems(prueba.numItems, total, prueba.media, de, prueba.minimo, prueba.maximo,
            objetivoInterno.has(prueba) ? objetivoInterno.get(prueba) : prueba.alfa, perfil, zOtras, (total - prueba.media) / de);
        const cols = colItems.get(prueba);
        for (let idx = 0; idx < cols.length; idx++) { const pu = puntajes.items[idx]; cols[idx].datos[i] = this._esInvertido(prueba, idx + 1) ? this._reflejar(prueba, pu) : pu; }
        colTotal.get(prueba).datos[i] = puntajes.total;
    }
};
