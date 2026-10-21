// @ts-check
// buscador/proyecto.js — (2026.12.31) lo que el Buscador guarda en un proyecto (shared/proyecto.js; «Guardar proyecto», en
// Ayuda): el protocolo de búsqueda (cada ecuación, su fuente, sus filtros y sus resultados) y el flujo PRISMA. Los dos
// viven en la sesión del navegador y se pierden al cerrarlo: con el proyecto, la revisión sigue otro día. Al abrirlo, los
// dos se comprueban antes de cambiar nada (un proyecto puede ser de otra persona: solo se acepta lo que tiene la forma que
// escribe el Buscador) y reemplazan los de la sesión; el que el proyecto no trae queda vacío, como estaba al guardarlo.

import { inscribirEnProyecto } from '../shared/proyecto.js';
import { leerJsonAcotado } from '../core/data/json-acotado.js';
import { ProtocoloBusqueda } from './protocolo.js';
import { PrismaDiagrama } from './prisma.js';

/**
 * (2026.12.31, cuarta revisión) Lo más que trae el protocolo o el flujo PRISMA, para medirlos antes de leerlos
 * (core/data/json-acotado.js): hasta 10 000 ecuaciones con sus campos y sus filtros, con holgura.
 * @type {import('../core/data/json-acotado.js').TopesJson}
 */
const TOPES_JSON_BUSCADOR = { profundidad: 8, contenedores: 100000, elementos: 1000000 };

/** El texto UTF-8 de un archivo del proyecto. @param {Uint8Array | undefined} b */
const texto = b => (b ? new TextDecoder().decode(b) : null);

/**
 * Un archivo JSON del proyecto, comprobado con `validar`; null si el proyecto no lo trae.
 * @param {Map<string, Uint8Array>} archivos @param {string} nombre @param {string} que @param {(x: unknown) => any} validar
 */
function leerJson(archivos, nombre, que, validar) {
    const crudo = texto(archivos.get(nombre));
    if (crudo === null) return null;
    const valor = leerJsonAcotado(crudo, TOPES_JSON_BUSCADOR, { forma: `${que} guardado no tiene la forma esperada («${nombre}»)`, invalido: `${que} guardado no es JSON válido («${nombre}»)` });
    const valido = validar(valor);
    if (!valido) throw new Error(`${que} guardado no tiene la forma esperada («${nombre}»)`);
    return valido;
}

inscribirEnProyecto({
    seccion: 'buscador', titulo: 'el Buscador', orden: 50,
    capturar() {
        const protocolo = ProtocoloBusqueda.estadoActual();
        const prisma = JSON.parse(JSON.stringify(PrismaDiagrama._datos || {}));
        const identificados = Object.values(prisma.identificados || {}).reduce((s, n) => s + (Number(n) || 0), 0);
        const conPrisma = identificados > 0 || prisma.incluidos > 0;
        if (!protocolo.consultas.length && !conPrisma) return null;
        /** @type {Record<string, string>} */
        const archivos = {};
        /** @type {string[]} */
        const partes = [];
        if (protocolo.consultas.length) { archivos['protocolo.json'] = JSON.stringify(protocolo); partes.push(`el protocolo de búsqueda (${protocolo.consultas.length} ecuación(es))`); }
        if (conPrisma) { archivos['prisma.json'] = JSON.stringify(prisma); partes.push('el flujo PRISMA'); }
        return { archivos, resumen: partes.join(' y ') };
    },
    /** @param {Map<string, Uint8Array>} archivos */
    restaurar(archivos) {
        const protocolo = leerJson(archivos, 'protocolo.json', 'el protocolo de búsqueda', x => ProtocoloBusqueda.validarEstado(x));
        const prisma = leerJson(archivos, 'prisma.json', 'el flujo PRISMA', x => PrismaDiagrama.validar(x));
        /** @type {string[]} */
        const partes = [];
        ProtocoloBusqueda.restaurarEstado(protocolo || { consultas: [] });
        if (protocolo) partes.push('el protocolo de búsqueda');
        if (prisma) { PrismaDiagrama.restaurar(prisma); partes.push('el flujo PRISMA'); }
        else PrismaDiagrama.reiniciar();
        return partes.length ? partes.join(' y ') : 'nada del Buscador';
    }
});
