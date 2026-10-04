// shared/estado.js — almacén compartido entre secciones: valores y servicios publicados por su dueño
// y leídos por quien los necesite, sin importarse entre sí.
//   estado.set('simulador.base', { datos, etiquetas, estructura });
//   estado.get('buscador.fuentes')?.citaAPA(obra);
//   estado.suscribir('simulador.base', base => …);
const valores = new Map();
const suscriptores = new Map();

export const estado = {
    get(clave, porDefecto = undefined) { return valores.has(clave) ? valores.get(clave) : porDefecto; },
    set(clave, valor) {
        valores.set(clave, valor);
        const s = suscriptores.get(clave); if (!s) return valor;
        for (const fn of [...s]) { try { fn(valor, clave); } catch (e) { console.error(`[estado] suscriptor de «${clave}» falló:`, e); } }
        return valor;
    },
    tiene(clave) { return valores.has(clave); },
    borrar(clave) { valores.delete(clave); },
    suscribir(clave, fn) { if (!suscriptores.has(clave)) suscriptores.set(clave, new Set()); suscriptores.get(clave).add(fn); return () => suscriptores.get(clave)?.delete(fn); },
    claves() { return [...valores.keys()]; },
    limpiar() { valores.clear(); suscriptores.clear(); }
};

// Claves usadas en el sitio (documentación viva).
export const CLAVES = {
    BASE_SIMULADOR: 'simulador.base',      // { datos (objetos), etiquetas, estructura } de la última generación
    FUENTES_BUSCADOR: 'buscador.fuentes'   // servicio del Buscador para el Redactor: obtenerFuentesRedaccion, citaAPA, autorAPA, autoresAPA, recuperarDatos, umbralRelevancia, relevanciaAplicada
};
