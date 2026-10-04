// shared/eventos.js — bus de eventos entre secciones. Una sección publica lo que le pasa
// («base:generada», «fuentes:cambiadas») y las demás se suscriben; ninguna importa a otra.
// Uso:  bus.on('base:generada', ({ datos }) => …);   bus.emit('base:generada', { datos });
const oyentes = new Map();

export const bus = {
    on(tipo, fn) { if (!oyentes.has(tipo)) oyentes.set(tipo, new Set()); oyentes.get(tipo).add(fn); return () => this.off(tipo, fn); },
    una(tipo, fn) { const quitar = this.on(tipo, (...args) => { quitar(); fn(...args); }); return quitar; },
    off(tipo, fn) { const s = oyentes.get(tipo); if (s) s.delete(fn); },
    emit(tipo, detalle) {
        const s = oyentes.get(tipo); if (!s) return 0;
        let n = 0;
        for (const fn of [...s]) { try { fn(detalle); n++; } catch (e) { console.error(`[bus] oyente de «${tipo}» falló:`, e); } }
        return n;
    },
    limpiar() { oyentes.clear(); }
};

// Nombres de evento usados en el sitio (documentación viva; el bus acepta cualquier cadena).
export const EVENTOS = {
    BASE_GENERADA: 'base:generada',        // Simulador → Analizador: { datos, etiquetas, estructura }
    FUENTES_CAMBIADAS: 'fuentes:cambiadas', // Buscador → Redactor: las fuentes seleccionadas cambiaron
    FIABILIDAD_ACTUALIZADA: 'fiabilidad:actualizada' // Analizador: la fiabilidad se completó en segundo plano (p. ej., bootstrap)
};
