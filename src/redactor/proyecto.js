// @ts-check
// redactor/proyecto.js — (2026.12.31) lo que el Redactor guarda en un proyecto (shared/proyecto.js; «Guardar proyecto»,
// en Ayuda): su última redacción, la misma que ofrece «Recuperar última redacción» (secciones, problema y fuentes
// citadas). Al abrir el proyecto, se guarda en el navegador y se muestra como si se recuperara.

import { inscribirEnProyecto } from '../shared/proyecto.js';
import { leerJsonAcotado } from '../core/data/json-acotado.js';
import { RedactorTeorico as Redactor } from './redactor/index.js';

/**
 * (2026.12.31, cuarta revisión) Lo más que trae «redaccion.json», para medirlo antes de leerlo (core/data/json-acotado.js):
 * sus secciones y sus fuentes, con holgura. @type {import('../core/data/json-acotado.js').TopesJson}
 */
const TOPES_JSON_REDACCION = { profundidad: 16, contenedores: 200000, elementos: 2000000 };

/** El Redactor, con los métodos que le añaden sus partes (redaccion.js: guardar y recuperar la última redacción). */
const RedactorTeorico = /** @type {any} */ (Redactor);

/** ¿Es una redacción guardada con secciones? @param {any} d */
const conSecciones = d => !!d && Array.isArray(d.secciones) && d.secciones.length > 0 && d.secciones.every((/** @type {any} */ s) => s && typeof s.titulo === 'string' && typeof s.texto === 'string');

/**
 * (2026.12.31, revisión) ¿Tiene la redacción de un proyecto la forma que guarda el Redactor? Sus secciones; el problema, un
 * texto; las fuentes, objetos; las citadas, posiciones de esas fuentes; la fecha, un número (un proyecto puede ser de
 * otra persona: la redacción se pinta como texto, pero sus campos se usan como lo que dicen ser).
 * @param {any} d
 */
const redaccionValida = d => conSecciones(d) && d.secciones.length <= 1000
    && d.secciones.every((/** @type {any} */ s) => s.capitulo === undefined || s.capitulo === null || typeof s.capitulo === 'string')
    && (d.problema === undefined || d.problema === null || typeof d.problema === 'string')
    && (d.t === undefined || Number.isFinite(d.t))
    && (d.fuentes === undefined || (Array.isArray(d.fuentes) && d.fuentes.every((/** @type {any} */ f) => f && typeof f === 'object' && !Array.isArray(f))))
    && (d.citadasIdx === undefined || (Array.isArray(d.citadasIdx) && d.citadasIdx.every((/** @type {any} */ i) => Number.isSafeInteger(i) && i >= 0 && i < (d.fuentes || []).length)));

inscribirEnProyecto({
    seccion: 'redactor', titulo: 'el Redactor', orden: 40,
    capturar() {
        let guardada = null;
        try {
            if (RedactorTeorico._documento) RedactorTeorico._guardarUltimo();   // lo que hay en pantalla, si hay algo
            guardada = localStorage.getItem(RedactorTeorico._CLAVE_GUARDADO);
        } catch (e) { return null; }
        if (!guardada) return null;
        let d;
        try { d = JSON.parse(guardada); } catch (e) { return null; }
        if (!conSecciones(d)) return null;
        return { archivos: { 'redaccion.json': guardada }, resumen: `la última redacción del Redactor (${d.secciones.length} secciones)` };
    },
    restaurar(archivos) {
        const bytes = archivos.get('redaccion.json');
        if (!bytes) throw new Error('falta la redacción («redaccion.json»)');
        const texto = new TextDecoder().decode(bytes);
        const d = leerJsonAcotado(texto, TOPES_JSON_REDACCION, { forma: 'la redacción guardada no tiene la forma esperada', invalido: 'la redacción guardada no es JSON válido' });
        if (!redaccionValida(d)) throw new Error('la redacción guardada no tiene la forma esperada');
        try { localStorage.setItem(RedactorTeorico._CLAVE_GUARDADO, texto); } catch (e) { throw new Error('el navegador no deja guardarla (almacenamiento bloqueado)'); }
        RedactorTeorico._recuperarUltimo();
        return `la última redacción del Redactor (${d.secciones.length} secciones)`;
    }
});
