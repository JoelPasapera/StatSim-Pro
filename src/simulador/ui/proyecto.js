// @ts-check
// simulador/ui/proyecto.js — (2026.12.31) lo que el Simulador guarda en un proyecto (shared/proyecto.js; «Guardar
// proyecto», en Ayuda) y cómo lo restaura: la configuración de todas sus tablas (el mismo texto que «Exportar TODO»,
// maestro.js) y, si hay, la base generada exacta (sus columnas en binario: core/data/base-archivos.js), con la
// configuración expandida con que se generó, el informe «pedido vs. obtenido» y sus diagnósticos (en JSON que conserva NaN
// e infinitos: core/data/json-fiel.js). Al abrirlo, las tablas quedan como estaban y la base, lista para descargar o para
// el Analizador, sin volver a generarla (con o sin semilla, es la misma).
// (2026.12.31, revisión) Al abrirlo, la base y su generación se comprueban antes de cambiar nada (un proyecto puede ser de
// otra persona: simulador/dominio/generacion-guardada.js), y un proyecto sin base deja el Simulador sin base, como estaba
// al guardarlo (antes quedaba la anterior, que ya no correspondía a la configuración abierta).

import { inscribirEnProyecto } from '../../shared/proyecto.js';
import { baseAArchivos, baseDesdeArchivos } from '../../core/data/base-archivos.js';
import { aJsonFiel, deJsonFiel } from '../../core/data/json-fiel.js';
import { leerJsonAcotado } from '../../core/data/json-acotado.js';
import { TOPES_JSON_GENERACION, comprobarGeneracionGuardada, generacionParaGuardar } from '../dominio/generacion-guardada.js';
import { TAMANO_MUESTRAL_MAXIMO } from '../dominio/constantes.js';
import { aplicarMaestro, textoMaestro } from './maestro.js';
import { descartarGeneracionEnCurso, mostrarResultadoGeneracion } from './motor.js';
import { ocultarResultadoGeneracion, ultimoInforme } from './resultado.js';

/** El texto UTF-8 de un archivo del proyecto. @param {Uint8Array | undefined} b */
const texto = b => (b ? new TextDecoder().decode(b) : null);

/** El generador de la página (lo crea main.js como global). @returns {any} */
const generador = () => /** @type {any} */ (globalThis).generadorDatos;

/** @returns {import('../../shared/proyecto.js').ParteCapturada | null} */
function capturar() {
    const generadorDatos = generador();
    const maestro = textoMaestro();
    const base = generadorDatos.datosGenerados;
    const conBase = !!(base && base.n && base.columnas && base.columnas.length);
    if (!maestro && !conBase) return null;
    /** @type {import('../../shared/proyecto.js').ArchivosDeParte} */
    const archivos = {};
    /** @type {string[]} */
    const partes = [];
    if (maestro) {
        archivos['configuracion.csv'] = maestro.texto;
        partes.push(`la configuración del Simulador (${maestro.filas.pruebas} escala(s) y ${maestro.filas.socio} variable(s) sociodemográfica(s))`);
    }
    if (conBase) {
        Object.assign(archivos, baseAArchivos(base, 'base'));
        archivos['generacion.json'] = aJsonFiel(generacionParaGuardar(generadorDatos, /** @type {unknown[]} */ (ultimoInforme)));
        partes.push(`la base generada (n = ${base.n}, ${base.columnas.length} columnas)`);
    }
    return { archivos, resumen: partes.join(' y ') };
}

/** @param {Map<string, Uint8Array>} archivos @returns {string} */
function restaurar(archivos) {
    const generadorDatos = generador();
    // primero, todo comprobado: la base y su generación
    /** @type {any} */
    let base = null;
    /** @type {ReturnType<typeof comprobarGeneracionGuardada> | null} */
    let generacion = null;
    if (archivos.has('base.json')) {
        // no más filas de las que genera el Simulador (un proyecto ajeno podría declarar cientos de millones)
        base = baseDesdeArchivos(archivos, 'base', { maximoFilas: TAMANO_MUESTRAL_MAXIMO });
        const crudo = texto(archivos.get('generacion.json'));
        if (crudo === null) throw new Error('falta la configuración con que se generó la base («generacion.json»)');
        // (cuarta revisión) medida antes de leerla
        const guardada = leerJsonAcotado(crudo, TOPES_JSON_GENERACION, { forma: 'la generación guardada no tiene la forma esperada («generacion.json»)', invalido: 'la configuración con que se generó la base no es JSON válido («generacion.json»)' }, deJsonFiel);
        generacion = comprobarGeneracionGuardada(guardada, generadorDatos, base.columnas.length);
    }
    // después, en la página. (2027.01.01, revisión) Lo que se estuviera generando es de la configuración anterior: no entra
    descartarGeneracionEnCurso();
    /** @type {string[]} */
    const partes = [];
    const maestro = texto(archivos.get('configuracion.csv'));
    if (maestro !== null) {
        aplicarMaestro(maestro);
        partes.push('la configuración del Simulador');
    }
    if (base && generacion) {
        // (revisión) si algo falla al mostrarla, el Simulador queda sin base, no con una a medias (ya publicada al Analizador)
        try { mostrarResultadoGeneracion({ base, ...generacion }); } catch (e) { ocultarResultadoGeneracion(); throw e; }
        partes.push(`la base generada (n = ${base.n})`);
    } else ocultarResultadoGeneracion();
    return partes.length ? partes.join(' y ') : 'nada del Simulador';
}

inscribirEnProyecto({ seccion: 'simulador', titulo: 'el Simulador', orden: 10, capturar, restaurar });

export { capturar as capturarSimuladorParaProyecto, restaurar as restaurarSimuladorDeProyecto };
