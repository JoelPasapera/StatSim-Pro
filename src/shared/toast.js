// shared/toast.js — avisos flotantes (toast).
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.
import { temporizadorCosmetico } from './temporizador.js';

function mostrarToast(mensaje, tipo = 'success', duracion = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = mensaje;
    toast.className = `toast ${tipo}`;
    toast.classList.add('show');
    // Cancelar el temporizador previo para que un toast nuevo no se oculte
    // antes de tiempo por el setTimeout de uno anterior.
    if (temporizadorToast) {
        clearTimeout(temporizadorToast);
    }
    temporizadorToast = temporizadorCosmetico(() => {
        toast.classList.remove('show');
        temporizadorToast = null;
    }, duracion);
}

let temporizadorToast = null;

/**
 * (2026.12.29, revisión) Un aviso de éxito con lo que conviene saber (`avisos`: un texto o una lista; los vacíos no
 * cuentan): si hay algo, va en el mismo aviso —uno nuevo taparía al anterior—, como advertencia y con más tiempo.
 * @param {string} mensaje
 * @param {string | string[]} [avisos]
 */
function mostrarToastConAvisos(mensaje, avisos) {
    const lista = (Array.isArray(avisos) ? avisos : [avisos]).filter(Boolean);
    if (lista.length) mostrarToast(`${mensaje}. Ten en cuenta: ${lista.join('; ')}.`, 'warning', 9000);
    else mostrarToast(mensaje, 'success');
}

export { mostrarToast, mostrarToastConAvisos, temporizadorToast };
