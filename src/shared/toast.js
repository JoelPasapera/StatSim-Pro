// shared/toast.js — avisos flotantes (toast).
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

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
    temporizadorToast = setTimeout(() => {
        toast.classList.remove('show');
        temporizadorToast = null;
    }, duracion);
}

let temporizadorToast = null;

export { mostrarToast, temporizadorToast };
