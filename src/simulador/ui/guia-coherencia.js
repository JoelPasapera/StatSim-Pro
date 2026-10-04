// simulador/ui/guia-coherencia.js — guía de coherencia en vivo de la tabla I y II (límites de media y DE).
// Origen: guia-coherencia.js (Fase 3), sin cambios de comportamiento; dependencias explícitas.

import { ReglasCoherencia } from '../dominio/reglas-coherencia.js';
import { mostrarToast } from '../../shared/toast.js';

// ========================================
// GUÍA DE COHERENCIA EN VIVO (interfaz)
// Activación progresiva de campos, pistas de rangos (Media/DE) y validación
// visual de las tablas Pruebas Aplicadas y Sociodemográficos.
// Extraído de app.js. Usa ReglasCoherencia (definida en generador-datos.js)
// como fuente única de las fórmulas. Debe cargarse ANTES que app.js.
// ========================================

function fmtNum(x) {
    return (Math.round(x * 100) / 100).toString();
}

// Crea (si no existe) un <small> de pista justo después de un input.
function pistaPara(input, clase) {
    let s = input.parentNode.querySelector('.' + clase);
    if (!s) {
        s = document.createElement('small');
        s.className = 'campo-hint ' + clase;
        input.insertAdjacentElement('afterend', s);
    }
    return s;
}

// ============================================================
//  LÍMITES EN VIVO DE MEDIA Y DE
//  El total es la suma de ítems → solo puede caer en [k·Mín, k·Máx].
//   · La MEDIA depende SOLO de las variables fijas (N° ítems, Mín, Máx):
//     su rango permitido es [k·Mín, k·Máx] (es la cantidad más decisiva).
//   · La DE depende de la MEDIA: el margen entre la Media y el tope más
//     cercano (dividido entre 3, para que quepan ±3 DE) marca su máximo.
//  Todo se calcula y se muestra ANTES de generar.
// ============================================================
function inputsPrueba(fila) {
    return {
        prueba: fila.querySelector('[aria-label="Nombre de la prueba"]'),
        escala: fila.querySelector('[aria-label="Nombre de la escala"]'),
        tipo: fila.querySelector('[aria-label="Tipo de escala"]'),
        dist: fila.querySelector('[aria-label="Distribución"]'),
        items: fila.querySelector('[aria-label="Número de ítems"]'),
        media: fila.querySelector('[aria-label="Media (M)"]'),
        de: fila.querySelector('[aria-label="Desviación estándar (DE)"]'),
        min: fila.querySelector('[aria-label="Mínimo por ítem"]'),
        max: fila.querySelector('[aria-label="Máximo por ítem"]'),
        alfa: fila.querySelector('[aria-label="Alfa de Cronbach objetivo"]')
    };
}

// Recalcula y muestra los límites de Media y DE de una fila.
function actualizarLimitesPrueba(fila) {
    const io = inputsPrueba(fila);
    if (!io.media || !io.de || !io.items || !io.min || !io.max) return;

    const pMedia = pistaPara(io.media, 'hint-media');
    const pDe = pistaPara(io.de, 'hint-de');

    const k = parseInt(io.items.value, 10);
    const min = parseFloat(io.min.value);
    const max = parseFloat(io.max.value);

    // ACTIVACIÓN PROGRESIVA en el orden de la guía:
    // Prueba → Escala → [Tipo] → N° ítems → Mín → Máx → α (opcional) → Media → DE
    // Si Tipo = General: la escala es UNA sola columna de datos → no lleva N° de
    // ítems ni α, y Mín/Máx son de la escala general completa (k efectivo = 1).
    const esGeneral = !!(io.tipo && io.tipo.value === 'general');
    const pruebaOk = !!(io.prueba && io.prueba.value.trim() !== '');
    const escalaOk = pruebaOk && !!(io.escala && io.escala.value.trim() !== '');
    const itemsOk = escalaOk && (esGeneral || (Number.isFinite(k) && k >= 1));
    const minOk = itemsOk && Number.isFinite(min);
    const maxOk = minOk && Number.isFinite(max) && max > min;
    const kEf = esGeneral ? 1 : k; // k efectivo para todas las fórmulas

    if (io.escala) io.escala.disabled = !pruebaOk;
    if (io.items) {
        io.items.disabled = esGeneral || !escalaOk;
        io.items.placeholder = esGeneral ? '—' : 'Ej: 60';
    }
    if (io.min) io.min.disabled = !itemsOk;
    if (io.max) io.max.disabled = !minOk;
    if (io.alfa) {
        io.alfa.disabled = esGeneral || !maxOk; // α se activa tras Máx (es opcional)
        io.alfa.placeholder = esGeneral ? '—' : 'Ej: 0.85';
    }

    // Marcar en rojo valores matemáticamente incoherentes en los campos fijos
    if (io.items) io.items.classList.toggle('invalid',
        !esGeneral && io.items.value !== '' && (!Number.isFinite(k) || k < 1));
    if (io.max) io.max.classList.toggle('invalid',
        io.max.value !== '' && Number.isFinite(max) && Number.isFinite(min) && max <= min);
    if (io.alfa) {
        const a = parseFloat(io.alfa.value);
        io.alfa.classList.toggle('invalid',
            !esGeneral && io.alfa.value !== '' && (!Number.isFinite(a) || a < 0 || a >= 1));
    }

    // Variables fijas incompletas → Media y DE bloqueadas
    if (!maxOk) {
        io.media.disabled = true;
        io.de.disabled = true;
        const queMinMax = esGeneral ? 'de la escala general' : 'por ítem';
        if (!pruebaOk) pMedia.textContent = 'Bloqueado: empieza por el nombre de la Prueba';
        else if (!escalaOk) pMedia.textContent = 'Bloqueado: completa el nombre de la Escala';
        else if (!itemsOk) pMedia.textContent = 'Bloqueado: completa el N° de ítems';
        else if (!minOk) pMedia.textContent = `Bloqueado: completa el Mín ${queMinMax}`;
        else pMedia.textContent = `Bloqueado: completa el Máx ${queMinMax} (debe ser mayor que el Mín)`;
        pMedia.className = 'campo-hint hint-media';
        pDe.textContent = 'Bloqueado: completa la Media';
        pDe.className = 'campo-hint hint-de';
        io.media.removeAttribute('min'); io.media.removeAttribute('max');
        io.de.removeAttribute('min'); io.de.removeAttribute('max');
        io.media.classList.remove('invalid'); io.de.classList.remove('invalid');
        return;
    }

    // Variables fijas completas → la Media se activa
    io.media.disabled = false;

    const totalMin = kEf * min, totalMax = kEf * max;

    // --- MEDIA: depende SOLO de las variables fijas (kEf, Mín, Máx) ---
    const rangoM = ReglasCoherencia.rangoMedia(kEf, min, max);
    const mMinR = rangoM.minimo;
    const mMaxR = rangoM.maximo;
    io.media.min = mMinR; io.media.max = mMaxR;
    const m = parseFloat(io.media.value);
    const mediaFuera = Number.isFinite(m) && (m < mMinR || m > mMaxR);
    pMedia.textContent = esGeneral
        ? `Media permitida: ${mMinR} – ${mMaxR}  (rango de la escala general)`
        : `Media permitida: ${mMinR} – ${mMaxR}  (suma de ${kEf} ítems de ${min} a ${max})`;
    pMedia.className = 'campo-hint hint-media' + (mediaFuera ? ' invalido' : '');
    io.media.classList.toggle('invalid', mediaFuera);

    // --- DE: se activa solo cuando hay una Media VÁLIDA ---
    io.de.min = '0.01';
    if (!Number.isFinite(m) || mediaFuera) {
        io.de.disabled = true;
        pDe.textContent = Number.isFinite(m) ? 'Bloqueado: corrige la Media (fuera de rango)' : 'Bloqueado: completa la Media';
        pDe.className = 'campo-hint hint-de';
        io.de.removeAttribute('max');
        io.de.classList.remove('invalid');
        return;
    }
    io.de.disabled = false;
    const deMax = Math.floor(ReglasCoherencia.deMaxima(m, totalMin, totalMax) * 100) / 100; // sin recorte
    const deMin = 0.01;

    if (deMax < deMin) {
        // La Media está pegada a un tope: no queda margen para dispersión
        const centro = Math.round((totalMin + totalMax) / 2);
        pDe.textContent = `La Media ${m} está pegada a un tope: casi no hay margen para la DE. Acércala al centro (~${centro}).`;
        pDe.className = 'campo-hint hint-de invalido';
        io.de.max = fmtNum(deMin);
        io.de.classList.add('invalid');
        return;
    }

    // Límite INFERIOR por discretización: un total entero con DE pequeña sale
    // "escalonado" y la prueba KS lo rechaza, y empeora cuanto mayor es N.
    // Umbral empírico para ~10–14% de rechazo: DE ≳ 1.1·√N.
    // SOLO aplica si se busca distribución Normal: con Uniforme o Asimétrica no
    // se persigue pasar normalidad, así que basta la coherencia matemática.
    const esNormal = !io.dist || io.dist.value === 'normal';
    const Nmuestra = parseInt((document.getElementById('tamanoMuestra') || {}).value, 10);
    const deSuave = esNormal ? (ReglasCoherencia.deMinimaNormal(Nmuestra) || null) : null;

    io.de.max = fmtNum(deMax);
    const de = parseFloat(io.de.value);

    // Caso sin salida (solo para Normal): ni la DE máxima alcanza el mínimo anti-escalera
    // (revisión 2026.11.17) no es un error: la configuración es válida, pero la prueba de normalidad detectará los escalones.
    // El texto dice el mecanismo y la consecuencia en cifras (antes, «muy estrecho para un total normal», y la normal sí cabe)
    const rechazo = d => Math.round(ReglasCoherencia.rechazoKS(d, Nmuestra));
    if (deSuave !== null && deSuave > deMax) {
        const deUsada = Number.isFinite(de) && de > 0 && de <= deMax ? de : deMax;
        pDe.textContent = `Con N=${Nmuestra}, el total entero queda escalonado incluso con la DE máxima posible (${fmtNum(deMax)}): ` +
            `la prueba de Kolmogorov–Smirnov (N ≥ 50) rechazará su normalidad en ≈ ${rechazo(deUsada)} % de las muestras aunque su forma sea normal; ` +
            `Shapiro–Wilk es mucho menos sensible. Para bajar a ≈ 13 % haría falta DE ≈ ${deSuave}: ${esGeneral ? 'amplía el Máx' : 'añade ítems o amplía el Máx por ítem'}, o reduce N.`;
        pDe.className = 'campo-hint hint-de aviso';
        io.de.classList.toggle('invalid', !(Number.isFinite(de) && de >= deMin && de <= deMax));
        return;
    }

    if (Number.isFinite(de) && de > deMax) {
        // Demasiado grande → recorte contra los topes (incoherente para cualquier forma)
        pDe.textContent = `La DE máxima sin recorte es ${fmtNum(deMax)} (según la Media ${m}): ${fmtNum(de)} es demasiado grande y el puntaje se recortará contra los topes.`;
        pDe.className = 'campo-hint hint-de invalido';
        io.de.classList.add('invalid');
    } else if (deSuave !== null && Number.isFinite(de) && de < deSuave) {
        // Demasiado pequeña → escalera (válida pero probablemente no pasará KS); solo Normal
        pDe.textContent = `DE recomendada: ${deSuave} – ${fmtNum(deMax)} para N=${Nmuestra} (según la Media ${m}). Con ${fmtNum(de)}, el total entero queda escalonado y la prueba de Kolmogorov–Smirnov rechazará su normalidad en ≈ ${rechazo(de)} % de las muestras (con ${deSuave}, ≈ 13 %).`;
        pDe.className = 'campo-hint hint-de aviso';
        io.de.classList.remove('invalid');
    } else if (esNormal) {
        pDe.textContent = `DE recomendada: ${deSuave !== null ? deSuave : fmtNum(deMin)} – ${fmtNum(deMax)}${deSuave !== null ? ` (para N=${Nmuestra})` : ''} · según la Media ${m}`;
        pDe.className = 'campo-hint hint-de';
        io.de.classList.remove('invalid');
    } else {
        // Uniforme / Asimétrica: solo el límite de coherencia matemática
        pDe.textContent = `DE permitida: ${fmtNum(deMin)} – ${fmtNum(deMax)}  (según la Media ${m})`;
        pDe.className = 'campo-hint hint-de';
        io.de.classList.remove('invalid');
    }
}

function actualizarTodasLasPruebas() {
    document.querySelectorAll('#bodyPruebas .fila-prueba').forEach(actualizarLimitesPrueba);
    actualizarListaPruebas();
}

// Sugerencias del campo Prueba: nombres ya usados en otras filas, para agrupar
// escalas bajo el mismo test sin errores de tipeo.
function actualizarListaPruebas() {
    const dl = document.getElementById('listaPruebas');
    if (!dl) return;
    const nombres = new Set();
    document.querySelectorAll('#bodyPruebas .fila-prueba [aria-label="Nombre de la prueba"]').forEach(i => {
        const v = i.value.trim();
        if (v) nombres.add(v);
    });
    dl.innerHTML = Array.from(nombres)
        .map(n => `<option value="${n.replace(/"/g, '&quot;')}"></option>`)
        .join('');
}

// Al salir de un campo, ajusta el valor a su rango permitido.
// La Media manda: si al cambiarla la DE queda fuera de rango, la DE se ajusta.
function ajustarPruebaEnCambio(e) {
    const inp = e.target;
    if (!inp) return;
    // Cambios en los selects (Tipo de escala, Distribución) → recalcular la fila
    if (inp.tagName === 'SELECT') {
        const filaSel = inp.closest('.fila-prueba');
        if (filaSel) actualizarLimitesPrueba(filaSel);
        return;
    }
    if (inp.tagName !== 'INPUT') return;
    const fila = inp.closest('.fila-prueba');
    if (!fila) return;
    const etiqueta = inp.getAttribute('aria-label');
    const io = inputsPrueba(fila);

    if (etiqueta === 'Media (M)') {
        const min = parseFloat(inp.min), max = parseFloat(inp.max);
        const v = parseFloat(inp.value);
        if (Number.isFinite(v)) {
            if (Number.isFinite(max) && v > max) { inp.value = max; mostrarToast('Media ajustada al máximo posible (k·Máx)', 'warning', 4000); }
            else if (Number.isFinite(min) && v < min) { inp.value = min; mostrarToast('Media ajustada al mínimo posible (k·Mín)', 'warning', 4000); }
        }
        actualizarLimitesPrueba(fila); // recalcula el rango de DE según la nueva Media
        // Si la DE quedó fuera del nuevo rango, ajustarla (la Media es decisiva)
        if (io.de) {
            const deMax = parseFloat(io.de.max);
            const deVal = parseFloat(io.de.value);
            if (Number.isFinite(deMax) && Number.isFinite(deVal) && deVal > deMax) {
                io.de.value = deMax;
                mostrarToast('DE ajustada al máximo para esta Media', 'warning', 4000);
                actualizarLimitesPrueba(fila);
            }
        }
        return;
    }

    if (etiqueta === 'Desviación estándar (DE)') {
        const min = parseFloat(inp.min), max = parseFloat(inp.max);
        const v = parseFloat(inp.value);
        if (Number.isFinite(v)) {
            if (Number.isFinite(max) && v > max) { inp.value = max; mostrarToast('DE ajustada al máximo para esta Media', 'warning', 4000); }
            else if (Number.isFinite(min) && v < min && v >= 0) { inp.value = min; }
        }
        actualizarLimitesPrueba(fila);
        return;
    }

    // Otros campos fijos (N° ítems, Mín, Máx): recalcular todo
    actualizarLimitesPrueba(fila);
}

// Sociodemográficos: todo se desbloquea al escribir la Categoría (paso 1)
function actualizarBloqueoSocio(fila) {
    const inputs = fila.querySelectorAll('input');
    const select = fila.querySelector('select');
    if (!inputs.length) return;
    const categoriaOk = inputs[0].value.trim() !== '';
    for (let i = 1; i < inputs.length; i++) inputs[i].disabled = !categoriaOk;
    if (select) select.disabled = !categoriaOk;
}

function actualizarTodosSocio() {
    document.querySelectorAll('#bodySocio .fila-socio').forEach(actualizarBloqueoSocio);
}

export { actualizarBloqueoSocio, actualizarLimitesPrueba, actualizarListaPruebas, actualizarTodasLasPruebas, actualizarTodosSocio, ajustarPruebaEnCambio, fmtNum, inputsPrueba, pistaPara };
