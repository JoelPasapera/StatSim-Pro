// shared/tabla-datos.js — tabla de datos en pantalla y desplazamiento.
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

// Renderiza encabezados y las primeras `maxFilas` filas de una base de datos
// en una tabla (thead/tbody). Devuelve la lista de columnas.
function renderizarTablaDatos(thead, tbody, datos, maxFilas = 10) {
    thead.innerHTML = '';
    tbody.innerHTML = '';
    // Acepta la base columnar del Simulador o un arreglo de filas-objeto (Analizador)
    const esBase = typeof datos.nombres === 'function' && typeof datos.valor === 'function';
    const columnas = esBase ? datos.nombres() : Object.keys(datos[0]);
    const filaEncabezados = document.createElement('tr');
    columnas.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        filaEncabezados.appendChild(th);
    });
    thead.appendChild(filaEncabezados);
    const limite = Math.min(maxFilas, datos.length);
    for (let i = 0; i < limite; i++) {
        const fila = document.createElement('tr');
        columnas.forEach(col => {
            const td = document.createElement('td');
            const valor = esBase ? datos.valor(col, i) : datos[i][col];
            td.textContent = typeof valor === 'number' ? (Number.isNaN(valor) ? '' : valor.toFixed(2)) : valor;
            fila.appendChild(td);
        });
        tbody.appendChild(fila);
    }
    return columnas;
}

// Desplaza la vista hacia un elemento respetando la preferencia de movimiento
// reducido del sistema (accesibilidad).
function desplazarHacia(elemento) {
    const movimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    elemento.scrollIntoView({ behavior: movimientoReducido ? 'auto' : 'smooth', block: 'nearest' });
}

export { renderizarTablaDatos, desplazarHacia };
