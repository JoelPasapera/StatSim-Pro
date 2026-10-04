// shared/tabla-desplazable.js — tablas de configuración anchas: cuando una fila no cabe, la tabla se desplaza en
// horizontal con (1) una barra que se queda al pie de la ventana mientras la tabla está a la vista, (2) columnas
// de identificación fijas a la izquierda (data-columnas-fijas="1" o "2") y (3) un fundido en el borde derecho
// mientras quede contenido por ver. Estilos en assets/css/componentes/tabla-desplazable.css.
//   Marcado: <div class="table-container tabla-desplazable" data-columnas-fijas="2"><table class="table">…</table></div>
// Sin este script la tabla conserva su barra nativa (mejora progresiva).

const TOLERANCIA = 0.5;   // px: sin ella, las dos barras se reenviarían desplazamientos fraccionarios sin fin
const DESBORDE_MINIMO = 2;   // px: el redondeo subpíxel de una tabla al 100 % no cuenta como «no cabe»

export function mejorarTablaDesplazable(contenedor) {
    if (!contenedor || contenedor.dataset.desplazableListo === '1') return null;
    const tabla = contenedor.querySelector('table');
    if (!tabla || !contenedor.parentNode) return null;
    contenedor.dataset.desplazableListo = '1';

    // marco = contenedor + barra: la barra es «sticky» dentro del marco, así solo flota mientras la tabla está a la vista
    const marco = document.createElement('div');
    marco.className = 'tabla-desplazable-marco';
    contenedor.parentNode.insertBefore(marco, contenedor);
    marco.appendChild(contenedor);
    const barra = document.createElement('div');
    barra.className = 'barra-desplazable';
    barra.setAttribute('aria-hidden', 'true');   // duplica el desplazamiento del contenedor, que sigue siendo accesible con teclado
    const relleno = document.createElement('div');
    relleno.className = 'barra-desplazable-relleno';
    barra.appendChild(relleno);
    marco.appendChild(barra);
    contenedor.classList.add('con-barra-flotante');

    const fijas = Math.max(0, Math.min(2, parseInt(contenedor.dataset.columnasFijas || '0', 10) || 0));

    function estado() {
        const recorrido = contenedor.scrollWidth - contenedor.clientWidth;
        marco.classList.toggle('desplazada', contenedor.scrollLeft > TOLERANCIA);
        marco.classList.toggle('hay-mas-derecha', recorrido > DESBORDE_MINIMO && recorrido - contenedor.scrollLeft > TOLERANCIA);
    }
    function medir() {
        const recorrido = Math.max(0, contenedor.scrollWidth - contenedor.clientWidth);
        marco.classList.toggle('desborda', recorrido > DESBORDE_MINIMO);
        // mismo recorrido en la barra que en la tabla: relleno = ancho visible de la barra + lo que sobra de la tabla
        relleno.style.width = (barra.clientWidth + recorrido) + 'px';
        if (fijas) {
            const cabecera = tabla.querySelector('thead tr');
            const celdas = cabecera ? Array.from(cabecera.children) : [];
            let acumulado = 0;
            for (let i = 0; i < fijas && i < celdas.length; i++) {
                tabla.style.setProperty(`--fija-${i + 1}`, acumulado + 'px');
                acumulado += celdas[i].getBoundingClientRect().width;
            }
            contenedor.style.setProperty('--ancho-fijas', acumulado + 'px');
        }
        if (Math.abs(barra.scrollLeft - contenedor.scrollLeft) > TOLERANCIA) barra.scrollLeft = contenedor.scrollLeft;
        estado();
    }
    const copiar = (desde, hacia) => { if (Math.abs(hacia.scrollLeft - desde.scrollLeft) > TOLERANCIA) hacia.scrollLeft = desde.scrollLeft; };
    contenedor.addEventListener('scroll', () => { copiar(contenedor, barra); estado(); }, { passive: true });
    barra.addEventListener('scroll', () => copiar(barra, contenedor), { passive: true });

    // el ancho cambia al añadir filas, al aparecer avisos, al mostrar la sección o al redimensionar la ventana
    if (typeof ResizeObserver === 'function') {
        const observador = new ResizeObserver(() => medir());
        observador.observe(contenedor);
        observador.observe(tabla);
    } else if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('resize', medir);
    }
    medir();
    return { marco, barra, medir };
}

export function mejorarTablasDesplazables(raiz = document) {
    return Array.from(raiz.querySelectorAll('.tabla-desplazable')).map(mejorarTablaDesplazable).filter(Boolean);
}
