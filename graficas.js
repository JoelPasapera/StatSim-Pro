/**
 * ScientificCharts - Librería de Visualización Científica
 * Arquitectura: Patrón Builder con Clases ES6
 * Estilo: Publicación Científica (APA/IEEE)
 * Autor: Ingeniero de Software Principal
 * Versión: 1.0.0
 */
class ScientificCharts {
    /**
     * Constructor principal de la clase ScientificCharts
     * @param {string} containerId - ID del contenedor DOM
     * @param {object} config - Configuración del gráfico
     */
    constructor(containerId, config = {}) {
        // Validación básica
        if (!containerId || typeof containerId !== 'string') {
            throw new Error('El ID del contenedor es requerido y debe ser un string');
        }
        
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`No se encontró el contenedor con ID: ${containerId}`);
        }
        // Configuración por defecto con estilo APA/IEEE
        this.config = {
            width: 800,
            height: 600,
            margin: { top: 40, right: 40, bottom: 60, left: 60 },
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: 12,
            titleFontSize: 16,
            axisColor: '#333333',
            gridColor: '#E5E5E5',
            primaryColor: '#2E5BBA',
            secondaryColor: '#D32F2F',
            backgroundColor: 'transparent',
            ...config
        };
        // Estado interno
        this.data = null;
        this.svg = null;
        this.scales = {};
        this.elements = {};
        // Inicializar SVG base
        this._initializeSVG();
    }
    /**
     * Inicializa el elemento SVG base
     * @private
     */
    _initializeSVG() {
        this.svg = d3.select(this.container)
            .append('svg')
            .attr('viewBox', `0 0 ${this.config.width} ${this.config.height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            // Color de texto por defecto (heredado por todos los <text> sin
            // fill propio): claro, en sintonía con el tema oscuro de la web.
            .attr('fill', '#e2e8f0')
            .style('display', 'block')
            .style('margin', '0 auto')
            .attr('font-family', this.config.fontFamily)
            // role="img" + aria-label (con el título) para lectores de pantalla.
            .attr('role', 'img')
            .style('background-color', this.config.backgroundColor);
        // Añadir definiciones para gradientes y patrones
        this.defs = this.svg.append('defs');
        this._createGradients();
        this._ajustarTamanoCSS(this.config.width, this.config.height);
    }
    /**
     * Fija el tamaño CSS del SVG midiendo el marco real donde vive, de modo
     * que el gráfico ocupe el ancho disponible SIN desbordar nunca su card
     * (ni en ancho ni en alto; se reserva un pequeño espacio para el
     * subtítulo/caption que pueda haber debajo). El dibujo escala por viewBox.
     * @private
     */
    _ajustarTamanoCSS(vbW, vbH) {
        const cw = (this.container && this.container.clientWidth) || 0;
        const chDisp = (this.container && this.container.clientHeight) || 0;
        let w = cw > 40 ? Math.min(cw, vbW * (this._cardExpandida ? 2.2 : 1.3)) : vbW;
        let h = w * vbH / vbW;
        // Si la card tiene alto definido, no sobrepasarlo (dejando ~34 px
        // para el caption); se reduce manteniendo la proporción. Las cards
        // expandidas crecen libremente: su alto pasa a ser automático y el
        // flujo de la página empuja lo demás en lugar de superponerse.
        if (!this._cardExpandida && chDisp > 80 && h > chDisp - 34) {
            h = chDisp - 34;
            w = h * vbW / vbH;
        }
        // Card expandida: tope estético de altura (se reduce en proporción).
        if (this._cardExpandida && h > 660) {
            h = 660;
            w = h * vbW / vbH;
        }
        this.svg
            .style('width', `${Math.round(w)}px`)
            .style('height', `${Math.round(h)}px`);
    }
    /**
     * Expande la card del gráfico a la fila completa del layout (el espacio
     * de dos gráficos) y libera su alto para que crezca con el contenido.
     * Inofensivo si el layout no es un grid. Reajusta el tamaño después.
     * @private
     */
    _expandirCard() {
        this._cardExpandida = true;
        if (this.container && this.container.style) {
            this.container.style.gridColumn = '1 / -1';
            this.container.style.width = '100%';
            this.container.style.maxWidth = 'none';
            this.container.style.height = 'auto';
            this.container.style.maxHeight = 'none';
        }
        const vb = (this.svg.attr('viewBox') || `0 0 ${this.config.width} ${this.config.height}`).split(' ');
        this._ajustarTamanoCSS(+vb[2], +vb[3]);
    }
    /**
     * Crea gradientes y patrones comunes
     * @private
     */
    _createGradients() {
        // Gradiente para áreas sombreadas
        const gradient = this.defs.append('linearGradient')
            .attr('id', 'areaGradient')
            .attr('x1', '0%')
            .attr('y1', '0%')
            .attr('x2', '0%')
            .attr('y2', '100%');
        gradient.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', this.config.primaryColor)
            .attr('stop-opacity', 0.3);
        gradient.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', this.config.primaryColor)
            .attr('stop-opacity', 0.1);
    }
    /**
     * Valida que los arrays tengan la misma longitud
     * @param {...Array} arrays - Arrays a validar
     * @private
     */
    _validateArrays(...arrays) {
        if (arrays.length < 2) return true;
        const length = arrays[0].length;
        return arrays.every(arr => Array.isArray(arr) && arr.length === length);
    }
    /**
     * Calcula estadísticas básicas
     * @param {Array} data - Array de números
     * @returns {object} - Objeto con estadísticas
     * @private
     */
    _calculateStats(data) {
        const sorted = [...data].sort((a, b) => a - b);
        const n = data.length;
        const mean = d3.mean(data);
        const median = d3.median(data);
        const std = d3.deviation(data) || 0;
        const min = d3.min(data);
        const max = d3.max(data);
        const q1 = d3.quantile(sorted, 0.25);
        const q3 = d3.quantile(sorted, 0.75);
        const iqr = q3 - q1;
        return { mean, median, std, min, max, q1, q3, iqr, n };
    }
    /**
     * Crea la estructura base del gráfico (ejes, títulos)
     * @param {string} title - Título del gráfico
     * @param {string} xLabel - Etiqueta del eje X
     * @param {string} yLabel - Etiqueta del eje Y
     * @private
     */
    _createChartBase(title, xLabel, yLabel) {
        // Limpiar contenido previo
        this.svg.selectAll('.chart-content').remove();
        
        const g = this.svg.append('g')
            .attr('class', 'chart-content')
            .attr('transform', `translate(${this.config.margin.left},${this.config.margin.top})`);
        // Título
        if (title) {
            this.svg.attr('aria-label', title);
            this.svg.append('text')
                .attr('x', this.config.width / 2)
                .attr('y', 25)
                .attr('text-anchor', 'middle')
                .attr('font-size', this.config.titleFontSize)
                .attr('font-weight', 'bold')
                .attr('class', 'titulo-grafico')
                .text(title);
        }
        // Dimensiones del área de contenido (dentro de los márgenes)
        const anchoContenido = this.config.width - this.config.margin.left - this.config.margin.right;
        const altoContenido = this.config.height - this.config.margin.top - this.config.margin.bottom;
        // Etiquetas de ejes
        if (yLabel) {
            g.append('text')
                .attr('transform', 'rotate(-90)')
                .attr('y', 0 - this.config.margin.left)
                .attr('x', 0 - altoContenido / 2)
                .attr('dy', '1em')
                .style('text-anchor', 'middle')
                .attr('font-size', this.config.fontSize)
                .text(yLabel);
        }
        if (xLabel) {
            // Posición relativa al área de contenido, con holgura suficiente bajo
            // las etiquetas de los ticks del eje X (que quedan en altoContenido).
            g.append('text')
                .attr('transform', `translate(${anchoContenido / 2}, ${altoContenido + 42})`)
                .style('text-anchor', 'middle')
                .attr('font-size', this.config.fontSize)
                .text(xLabel);
        }
        return g;
    }
    /**
     * Crea una distribución gaussiana con área sombreada
     * @param {Array} data - Datos numéricos
     * @param {number} mean - Media (opcional)
     * @param {number} std - Desviación estándar (opcional)
     * @param {object} options - Opciones adicionales
     * @returns {ScientificCharts} - Instancia para chaining
     */
    createGaussianDistribution(data, mean = null, std = null, options = {}) {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Los datos deben ser un array no vacío');
        }
        const stats = this._calculateStats(data);
        const mu = mean !== null ? mean : stats.mean;
        const sigma = std !== null ? std : stats.std;
        // Generar puntos para la curva gaussiana
        const xMin = mu - 4 * sigma;
        const xMax = mu + 4 * sigma;
        const xValues = d3.range(xMin, xMax, (xMax - xMin) / 100);
        
        const gaussianData = xValues.map(x => ({
            x: x,
            y: (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2))
        }));
        // Configurar escalas
        const xScale = d3.scaleLinear()
            .domain([xMin, xMax])
            .range([0, this.config.width - this.config.margin.left - this.config.margin.right]);
        const yScale = d3.scaleLinear()
            .domain([0, d3.max(gaussianData, d => d.y)])
            .range([this.config.height - this.config.margin.top - this.config.margin.bottom, 0]);
        // Crear base del gráfico
        const g = this._createChartBase(
            options.title || 'Distribución Gaussiana',
            options.xLabel || 'Valor',
            options.yLabel || 'Densidad de Probabilidad'
        );
        // Área sombreada
        const area = d3.area()
            .x(d => xScale(d.x))
            .y0(this.config.height - this.config.margin.top - this.config.margin.bottom)
            .y1(d => yScale(d.y))
            .curve(d3.curveBasis);
        g.append('path')
            .datum(gaussianData)
            .attr('fill', 'url(#areaGradient)')
            .attr('d', area);
        // Línea de la curva
        const line = d3.line()
            .x(d => xScale(d.x))
            .y(d => yScale(d.y))
            .curve(d3.curveBasis);
        g.append('path')
            .datum(gaussianData)
            .attr('fill', 'none')
            .attr('stroke', this.config.primaryColor)
            .attr('stroke-width', 2)
            .attr('d', line);
        // Líneas verticales para desviaciones estándar
        [-2, -1, 0, 1, 2].forEach(sd => {
            const x = mu + sd * sigma;
            g.append('line')
                .attr('x1', xScale(x))
                .attr('x2', xScale(x))
                .attr('y1', this.config.height - this.config.margin.top - this.config.margin.bottom)
                .attr('y2', 0)
                .attr('stroke', this.config.secondaryColor)
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '3,3')
                .attr('opacity', 0.5);
        });
        // Ejes
        g.append('g')
            .attr('transform', `translate(0,${this.config.height - this.config.margin.top - this.config.margin.bottom})`)
            .call(d3.axisBottom(xScale));
        g.append('g')
            .call(d3.axisLeft(yScale));
        // Leyenda con estadísticas, anclada a la esquina superior derecha
        // (zona libre: en las colas la densidad es baja y la curva queda abajo).
        const legend = g.append('g')
            .attr('transform', `translate(${this.config.width - this.config.margin.left - this.config.margin.right}, 0)`);
        const legendData = [
            `μ = ${mu.toFixed(3)}`,
            `σ = ${sigma.toFixed(3)}`,
            `N = ${stats.n}`
        ];
        legendData.forEach((text, i) => {
            legend.append('text')
                .attr('y', i * 18 + 12)
                .attr('text-anchor', 'end')
                .attr('font-size', this.config.fontSize)
                .text(text);
        });
        return this;
    }
    /**
     * Distribución normal teórica de VARIAS variables superpuestas: una curva
     * N(μᵢ, σᵢ) por variable, con línea vertical en cada media y leyenda con
     * μ y σ. Pensado para justificar la normalidad de todas las variables del
     * análisis en un solo panel (sección de descriptivos de una tesis).
     * @param {Array<Array>} datasets - Array de arrays numéricos (una serie por variable)
     * @param {Array<string>} labels - Nombres de las variables
     * @param {object} options - Opciones (title, xLabel, yLabel)
     * @returns {ScientificCharts} - Instancia para chaining
     */
    createGaussianDistributionMulti(datasets, labels = [], options = {}) {
        if (!Array.isArray(datasets) || !datasets.length || !Array.isArray(datasets[0])) {
            throw new Error('datasets debe ser un array de arrays numéricos');
        }
        const PALETA = ['#60a5fa', '#f87171', '#34d399', '#fbbf24', '#c084fc', '#22d3ee', '#fb923c', '#a3e635'];
        const series = datasets.map((d, i) => {
            const mu = d3.mean(d);
            const sigma = d3.deviation(d) || 1;
            return { mu, sigma, n: d.length, label: labels[i] || `Variable ${i + 1}`, color: PALETA[i % PALETA.length] };
        });
        const xMin = d3.min(series, s => s.mu - 4 * s.sigma);
        const xMax = d3.max(series, s => s.mu + 4 * s.sigma);
        const W = this.config.width - this.config.margin.left - this.config.margin.right;
        const H = this.config.height - this.config.margin.top - this.config.margin.bottom;
        const xScale = d3.scaleLinear().domain([xMin, xMax]).range([0, W]).nice();
        const pdf = (x, s) => Math.exp(-0.5 * ((x - s.mu) / s.sigma) ** 2) / (s.sigma * Math.sqrt(2 * Math.PI));
        const yMax = d3.max(series, s => pdf(s.mu, s)) * 1.06;
        const yScale = d3.scaleLinear().domain([0, yMax]).range([H, 0]);
        const g = this._createChartBase(
            options.title || 'Distribución Normal de Puntajes',
            options.xLabel || 'Puntaje',
            options.yLabel || 'Densidad de Probabilidad'
        );
        const dom = xScale.domain();
        series.forEach(s => {
            const curva = d3.range(120).map(i => {
                const x = dom[0] + (i / 119) * (dom[1] - dom[0]);
                return { x, y: pdf(x, s) };
            });
            // Área suave translúcida + contorno
            g.append('path').datum(curva)
                .attr('fill', s.color).attr('fill-opacity', 0.12)
                .attr('d', d3.area().x(d => xScale(d.x)).y0(H).y1(d => yScale(d.y)).curve(d3.curveBasis));
            g.append('path').datum(curva)
                .attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', 2.2)
                .attr('d', d3.line().x(d => xScale(d.x)).y(d => yScale(d.y)).curve(d3.curveBasis));
            // Línea vertical en la media
            g.append('line')
                .attr('x1', xScale(s.mu)).attr('x2', xScale(s.mu))
                .attr('y1', H).attr('y2', yScale(pdf(s.mu, s)))
                .attr('stroke', s.color).attr('stroke-width', 1.2)
                .attr('stroke-dasharray', '4,3').attr('opacity', 0.85);
        });
        // Ejes
        g.append('g').attr('transform', `translate(0,${H})`).call(d3.axisBottom(xScale));
        g.append('g').call(d3.axisLeft(yScale));
        // Leyenda: etiqueta + μ y σ de cada variable
        const leyenda = g.append('g').attr('class', 'leyenda-multi')
            .attr('transform', `translate(${W - 8}, 4)`);
        series.forEach((s, i) => {
            const fila = leyenda.append('g').attr('transform', `translate(0, ${i * 18})`);
            fila.append('line').attr('x1', -180).attr('x2', -160).attr('y1', 6).attr('y2', 6)
                .attr('stroke', s.color).attr('stroke-width', 3);
            fila.append('text').attr('x', -154).attr('y', 10).attr('font-size', 11)
                .text(`${s.label}: μ=${s.mu.toFixed(1)}, σ=${s.sigma.toFixed(1)}`);
        });
        // ---- Cursor de coordenadas (cruz) SOLO dentro de este gráfico ----
        const capa = g.append('g').attr('class', 'crosshair-capa').style('display', 'none');
        capa.append('line').attr('class', 'ch-v').attr('y1', 0).attr('y2', H)
            .attr('stroke', '#94a3b8').attr('stroke-width', 1).attr('stroke-dasharray', '3,3');
        capa.append('line').attr('class', 'ch-h').attr('x1', 0).attr('x2', W)
            .attr('stroke', '#94a3b8').attr('stroke-width', 1).attr('stroke-dasharray', '3,3');
        const chFondo = capa.append('rect')
            .attr('height', 20).attr('rx', 4)
            .attr('fill', 'rgba(15, 23, 42, 0.92)').attr('stroke', '#475569');
        const chTexto = capa.append('text')
            .attr('font-size', 12).attr('fill', '#e2e8f0');
        const svgNode = this.svg.node();
        const self = this;
        g.append('rect')
            .attr('width', W).attr('height', H)
            .attr('fill', 'transparent')
            .style('cursor', 'crosshair')
            .on('mousemove', function (event) {
                const rect = svgNode.getBoundingClientRect();
                const vb = (self.svg.attr('viewBox') || `0 0 ${self.config.width} ${self.config.height}`).split(' ').map(Number);
                const fx = rect.width > 0 ? vb[2] / rect.width : 1;
                const fy = rect.height > 0 ? vb[3] / rect.height : 1;
                const px = (event.clientX - rect.left) * fx - self.config.margin.left;
                const py = (event.clientY - rect.top) * fy - self.config.margin.top;
                if (px < 0 || px > W || py < 0 || py > H) { capa.style('display', 'none'); return; }
                const xVal = xScale.invert(px);
                const yVal = yScale.invert(py);
                capa.style('display', '');
                capa.select('.ch-v').attr('x1', px).attr('x2', px);
                capa.select('.ch-h').attr('y1', py).attr('y2', py);
                const etiqueta = `(${xVal.toFixed(1)}, ${yVal.toFixed(4)})`;
                chTexto.text(etiqueta);
                const anchoCaja = 14 + etiqueta.length * 6.6;
                const cx = Math.max(0, Math.min(px + 12, W - anchoCaja));
                const cy = Math.max(py - 26, 2);
                chFondo.attr('x', cx).attr('y', cy).attr('width', anchoCaja);
                chTexto.attr('x', cx + 7).attr('y', cy + 14);
            })
            .on('mouseleave', function () { capa.style('display', 'none'); });
        return this;
    }
    /**
     * Crea una matriz de correlación (heatmap)
     * @param {Array} data - Matriz de correlaciones
     * @param {Array} labels - Etiquetas de variables
     * @param {object} options - Opciones adicionales
     * @returns {ScientificCharts} - Instancia para chaining
     */
    createCorrelationMatrix(data, labels, options = {}) {
        if (!Array.isArray(data) || !Array.isArray(labels)) {
            throw new Error('Los datos y etiquetas deben ser arrays');
        }
        const n = labels.length;
        this._expandirCard();
        if (!this._validateArrays(...data)) {
            throw new Error('Todas las filas deben tener la misma longitud');
        }
        // Reservar espacio para las etiquetas: un margen a la izquierda para las
        // etiquetas de fila y otro arriba para las de columna (que se rotan para
        // no solaparse cuando hay varias columnas o nombres largos). El tamaño de
        // celda se calcula con el espacio RESTANTE, de modo que ni las celdas ni
        // las etiquetas se salgan del área del gráfico.
        const anchoContenido = this.config.width - this.config.margin.left - this.config.margin.right;
        const altoContenido = this.config.height - this.config.margin.top - this.config.margin.bottom;
        // Margen para etiquetas de fila proporcional al nombre más largo,
        // para que quepan completos (con tope para no comerse la matriz).
        const largoMaximo = Math.max(...labels.map(l => String(l).length));
        const margenEtiquetasFila = Math.min(180, Math.max(72, 14 + 6.6 * largoMaximo));
        const maxCaracteres = Math.floor((margenEtiquetasFila - 14) / 6.6);
        // Altura para las etiquetas de columna rotadas -45°: proporcional al
        // nombre más largo (su proyección vertical), para que no se recorten
        // por arriba ni pisen el subtítulo.
        const margenEtiquetasColumna = Math.max(56, 20 + Math.ceil(4.7 * largoMaximo));
        const espacioLeyenda = 44;
        // La matriz llena el ancho disponible; el lienzo crece en vertical si
        // hace falta (el SVG es responsive por viewBox).
        const cellSize = Math.max(52, Math.min(120, (anchoContenido - margenEtiquetasFila) / n));
        const width = cellSize * n;
        const height = cellSize * n;
        // Ampliar el viewBox del lienzo (ancho Y alto) si la matriz completa
        // — celdas + etiquetas + leyenda — no cabe en el tamaño configurado.
        // Sin esto, con lienzos pequeños (p. ej. 400×300) el dibujo excedería
        // el viewBox y se vería RECORTADO por la derecha y por abajo.
        const extraEtiquetasCol = Math.max(0, Math.ceil(4.7 * largoMaximo) - this.config.margin.right);
        const anchoNecesario = Math.max(
            this.config.width,
            this.config.margin.left + margenEtiquetasFila + width + extraEtiquetasCol + this.config.margin.right
        );
        const altoNecesario = Math.max(
            this.config.height,
            this.config.margin.top + margenEtiquetasColumna + height + 100 + this.config.margin.bottom
        );
        if (this.svg) {
            this.svg.attr('viewBox', `0 0 ${anchoNecesario} ${altoNecesario}`);
            this._ajustarTamanoCSS(anchoNecesario, altoNecesario);
            this.svg.select('.titulo-grafico').attr('x', anchoNecesario / 2);
        }
        // Centrado horizontal de la matriz (etiquetas incluidas) en el lienzo,
        // sea cual sea el número de variables.
        const anchoEfectivo = anchoNecesario - this.config.margin.left - this.config.margin.right;
        const offsetXMatriz = margenEtiquetasFila +
            Math.max(0, (anchoEfectivo - margenEtiquetasFila - width - extraEtiquetasCol) / 2);
        // Acorta etiquetas muy largas (el nombre completo queda en el tooltip).
        const acortarEtiqueta = t => (typeof t === 'string' && t.length > maxCaracteres) ? t.slice(0, maxCaracteres - 1) + '…' : t;
        // Escala de color para correlaciones, diseñada para tema oscuro:
        // rojo (negativas) ← slate oscuro (r≈0) → azul (positivas).
        // A diferencia de RdBu clásica, el centro NO es blanco, así que
        // ninguna celda queda con fondo claro sobre la web oscura.
        const PARADAS_CORR = [
            [153, 27, 27],   // -1.0  rojo profundo
            [239, 68, 68],   // -0.5  rojo
            [51, 65, 85],    //  0.0  slate oscuro (neutro)
            [59, 130, 246],  // +0.5  azul
            [29, 78, 216]    // +1.0  azul profundo
        ];
        const interpolarCorrelacion = t => {
            t = Math.max(0, Math.min(1, t));
            const x = t * (PARADAS_CORR.length - 1);
            const i = Math.min(PARADAS_CORR.length - 2, Math.floor(x));
            const u = x - i;
            const c = PARADAS_CORR[i].map((a, k) => Math.round(a + (PARADAS_CORR[i + 1][k] - a) * u));
            return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
        };
        const colorScale = d3.scaleSequential()
            .domain([-1, 1])
            .interpolator(interpolarCorrelacion);
        // Crear base del gráfico
        const g = this._createChartBase(
            options.title || 'Matriz de Correlación',
            options.xLabel || '',
            options.yLabel || ''
        );
        // Subtítulo con el coeficiente empleado (coherente con el análisis).
        if (options.subtitle) {
            g.append('text')
                .attr('x', (anchoNecesario - this.config.margin.left - this.config.margin.right) / 2)
                .attr('y', 16)
                .attr('text-anchor', 'middle')
                .attr('font-size', 13)
                .attr('font-weight', 600)
                .attr('fill', '#cbd5e1')
                .text(options.subtitle);
        }
        // Subgrupo de la matriz, desplazado para dejar sitio a las etiquetas.
        const gMatriz = g.append('g')
            .attr('transform', `translate(${offsetXMatriz}, ${margenEtiquetasColumna})`);
        // Crear celdas del heatmap
        const cells = gMatriz.selectAll('.cell')
            .data(data.flatMap((row, i) =>
                row.map((value, j) => ({ value, i, j }))
            ))
            .enter().append('g')
            .attr('class', 'cell')
            .attr('transform', d => `translate(${d.j * cellSize}, ${d.i * cellSize})`);
        // Rectángulos de las celdas
        cells.append('rect')
            .attr('width', cellSize)
            .attr('height', cellSize)
            .attr('fill', d => colorScale(d.value))
            .attr('stroke', d => d.i === d.j ? '#94a3b8' : 'rgba(148, 163, 184, 0.25)')
            .attr('stroke-width', d => d.i === d.j ? 1.5 : 1);
        // Texto con valores de correlación
        cells.append('text')
            .attr('x', cellSize / 2)
            .attr('y', cellSize / 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', cellSize * 0.3)
            .attr('font-weight', 600)
            .attr('fill', d => {
                // Luminancia relativa del color de fondo: decide blanco u oscuro.
                const m = String(colorScale(d.value)).match(/\d+/g).map(Number);
                const lum = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
                return lum > 0.55 ? '#0f172a' : '#FFFFFF';
            })
            .text(d => d.value.toFixed(2));
        // Etiquetas de filas (ancladas a la derecha, dentro del margen izquierdo)
        const rowLabels = gMatriz.selectAll('.row-label')
            .data(labels)
            .enter().append('text')
            .attr('class', 'row-label')
            .attr('x', -10)
            .attr('y', (d, i) => i * cellSize + cellSize / 2)
            .attr('text-anchor', 'end')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', this.config.fontSize)
            .text(d => acortarEtiqueta(d));
        rowLabels.append('title').text(d => d);
        // Etiquetas de columnas (rotadas -45° para no solaparse entre sí)
        const colLabels = gMatriz.selectAll('.col-label')
            .data(labels)
            .enter().append('text')
            .attr('class', 'col-label')
            .attr('transform', (d, i) => `translate(${i * cellSize + cellSize / 2}, -8) rotate(-45)`)
            .attr('text-anchor', 'start')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', this.config.fontSize)
            .text(d => acortarEtiqueta(d));
        colLabels.append('title').text(d => d);
        // Leyenda de color
        const legendWidth = 200;
        const legendHeight = 20;
        const legendX = (width - legendWidth) / 2;
        const legendY = height + 40;
        const legendScale = d3.scaleLinear()
            .domain([-1, 1])
            .range([0, legendWidth]);
        const legendAxis = d3.axisBottom(legendScale)
            .ticks(5)
            .tickFormat(d3.format('.1f'));
        const legend = gMatriz.append('g')
            .attr('transform', `translate(${legendX}, ${legendY})`);
        // Gradientes para la leyenda
        const legendGradient = this.defs.append('linearGradient')
            .attr('id', 'legend-gradient')
            .attr('x1', '0%')
            .attr('x2', '100%')
            .attr('y1', '0%')
            .attr('y2', '0%');
        [-1, -0.5, 0, 0.5, 1].forEach((value, i) => {
            legendGradient.append('stop')
                .attr('offset', `${i * 25}%`)
                .attr('stop-color', colorScale(value));
        });
        legend.append('rect')
            .attr('width', legendWidth)
            .attr('height', legendHeight)
            .style('fill', 'url(#legend-gradient)');
        legend.append('g')
            .attr('transform', `translate(0, ${legendHeight})`)
            .call(legendAxis);
        return this;
    }
    /**
     * Crea un diagrama de caja y bigotes (boxplot)
     * @param {Array} data - Datos numéricos o array de arrays
     * @param {Array} labels - Etiquetas para múltiples boxplots
     * @param {object} options - Opciones adicionales
     * @returns {ScientificCharts} - Instancia para chaining
     */
    createBoxPlot(data, labels = null, options = {}) {
        this._expandirCard();
        let datasets;
        
        if (Array.isArray(data[0])) {
            datasets = data.map((d, i) => ({
                data: d,
                label: labels ? labels[i] : `Grupo ${i + 1}`
            }));
        } else {
            datasets = [{
                data: data,
                label: labels ? labels[0] : 'Datos'
            }];
        }
        // Calcular estadísticas para cada dataset
        const boxData = datasets.map(dataset => {
            const sorted = [...dataset.data].sort((a, b) => a - b);
            const stats = this._calculateStats(dataset.data);
            
            return {
                ...stats,
                label: dataset.label,
                outliers: dataset.data.filter(d => 
                    d < stats.q1 - 1.5 * stats.iqr || d > stats.q3 + 1.5 * stats.iqr
                )
            };
        });
        // Configurar escalas
        const xScale = d3.scaleBand()
            .domain(boxData.map(d => d.label))
            .range([0, this.config.width - this.config.margin.left - this.config.margin.right])
            .padding(0.3);
        // Los valores se toman de `datasets` (que conserva `.data`); `boxData`
        // solo guarda estadísticos resumidos, no las observaciones originales.
        const allValues = datasets.flatMap(d => d.data);
        const yScale = d3.scaleLinear()
            .domain([d3.min(allValues) * 0.9, d3.max(allValues) * 1.1])
            .range([this.config.height - this.config.margin.top - this.config.margin.bottom, 0]);
        // Crear base del gráfico
        const g = this._createChartBase(
            options.title || 'Diagrama de Caja y Bigotes',
            options.xLabel || '',
            options.yLabel || 'Valor'
        );
        // Crear boxplots
        boxData.forEach((d, i) => {
            const x = xScale(d.label);
            const width = xScale.bandwidth();
            // Caja principal
            g.append('rect')
                .attr('x', x)
                .attr('y', yScale(d.q3))
                .attr('width', width)
                .attr('height', yScale(d.q1) - yScale(d.q3))
                .attr('fill', this.config.primaryColor)
                .attr('opacity', 0.3)
                .attr('stroke', this.config.primaryColor)
                .attr('stroke-width', 1);
            // Línea media
            g.append('line')
                .attr('x1', x)
                .attr('x2', x + width)
                .attr('y1', yScale(d.median))
                .attr('y2', yScale(d.median))
                .attr('stroke', this.config.primaryColor)
                .attr('stroke-width', 2);
            // Bigotes
            const whiskerTop = Math.min(d.max, d.q3 + 1.5 * d.iqr);
            const whiskerBottom = Math.max(d.min, d.q1 - 1.5 * d.iqr);
            // Líneas de bigotes
            g.append('line')
                .attr('x1', x + width / 2)
                .attr('x2', x + width / 2)
                .attr('y1', yScale(whiskerBottom))
                .attr('y2', yScale(d.q1))
                .attr('stroke', this.config.primaryColor)
                .attr('stroke-width', 1);
            g.append('line')
                .attr('x1', x + width / 2)
                .attr('x2', x + width / 2)
                .attr('y1', yScale(d.q3))
                .attr('y2', yScale(whiskerTop))
                .attr('stroke', this.config.primaryColor)
                .attr('stroke-width', 1);
            // Límites de bigotes
            g.append('line')
                .attr('x1', x + width * 0.3)
                .attr('x2', x + width * 0.7)
                .attr('y1', yScale(whiskerBottom))
                .attr('y2', yScale(whiskerBottom))
                .attr('stroke', this.config.primaryColor)
                .attr('stroke-width', 1);
            g.append('line')
                .attr('x1', x + width * 0.3)
                .attr('x2', x + width * 0.7)
                .attr('y1', yScale(whiskerTop))
                .attr('y2', yScale(whiskerTop))
                .attr('stroke', this.config.primaryColor)
                .attr('stroke-width', 1);
            // Outliers
            if (d.outliers.length > 0) {
                g.selectAll(`.outlier-${i}`)
                    .data(d.outliers)
                    .enter().append('circle')
                    .attr('class', `outlier-${i}`)
                    .attr('cx', x + width / 2)
                    .attr('cy', d => yScale(d))
                    .attr('r', 3)
                    .attr('fill', this.config.secondaryColor);
            }
        });
        // Ejes (etiquetas del eje X en diagonal: legibles con muchas variables)
        const ejeXBox = g.append('g')
            .attr('transform', `translate(0,${this.config.height - this.config.margin.top - this.config.margin.bottom})`)
            .call(d3.axisBottom(xScale));
        ejeXBox.selectAll('text')
            .attr('transform', 'rotate(-35)')
            .attr('text-anchor', 'end')
            .attr('dx', '-0.4em')
            .attr('dy', '0.45em');
        g.append('g')
            .call(d3.axisLeft(yScale));
        return this;
    }
    /**
     * Crea un diagrama de violín
     * @param {Array} data - Datos numéricos o array de arrays
     * @param {Array} labels - Etiquetas para múltiples violines
     * @param {object} options - Opciones adicionales
     * @returns {ScientificCharts} - Instancia para chaining
     */
    createViolinPlot(data, labels = null, options = {}) {
        let datasets;
        
        if (Array.isArray(data[0])) {
            datasets = data.map((d, i) => ({
                data: d,
                label: labels ? labels[i] : `Grupo ${i + 1}`
            }));
        } else {
            datasets = [{
                data: data,
                label: labels ? labels[0] : 'Datos'
            }];
        }
        // Configurar escalas
        const xScale = d3.scaleBand()
            .domain(datasets.map(d => d.label))
            .range([0, this.config.width - this.config.margin.left - this.config.margin.right])
            .padding(0.3);
        const allValues = datasets.flatMap(d => d.data);
        const yScale = d3.scaleLinear()
            .domain([d3.min(allValues) * 0.9, d3.max(allValues) * 1.1])
            .range([this.config.height - this.config.margin.top - this.config.margin.bottom, 0]);
        // Crear base del gráfico
        const g = this._createChartBase(
            options.title || 'Diagrama de Violín',
            options.xLabel || '',
            options.yLabel || 'Valor'
        );
        // Función para generar curva de densidad
        const kde = (data, bandwidth = 1) => {
            const n = data.length;
            const min = d3.min(data);
            const max = d3.max(data);
            const x = d3.range(min, max, (max - min) / 100);
            
            return x.map(xi => {
                let sum = 0;
                data.forEach(d => {
                    sum += Math.exp(-0.5 * Math.pow((xi - d) / bandwidth, 2));
                });
                return {
                    x: xi,
                    y: sum / (n * bandwidth * Math.sqrt(2 * Math.PI))
                };
            });
        };
        // Crear violines
        datasets.forEach((dataset, i) => {
            const x = xScale(dataset.label);
            const width = xScale.bandwidth();
            
            // Calcular densidad
            // Regla de Silverman; si la desviación es 0 (datos constantes) el
            // ancho de banda sería 0 y la densidad daría NaN, así que se usa un
            // mínimo positivo.
            const desviacion = d3.deviation(dataset.data) || 0;
            const bandwidth = (1.06 * desviacion * Math.pow(dataset.data.length, -0.2)) || 1;
            const density = kde(dataset.data, bandwidth);
            
            const maxDensity = d3.max(density, d => d.y);
            
            // Escalar el ancho del violín
            const xViolin = d3.scaleLinear()
                .domain([0, maxDensity])
                .range([width / 2, 0]);
            // Generar paths para ambos lados del violín
            const areaLeft = d3.area()
                .x0(d => x + width / 2 - xViolin(d.y))
                .x1(d => x + width / 2)
                .y(d => yScale(d.x))
                .curve(d3.curveBasis);
            const areaRight = d3.area()
                .x0(d => x + width / 2)
                .x1(d => x + width / 2 + xViolin(d.y))
                .y(d => yScale(d.x))
                .curve(d3.curveBasis);
            // Área del violín
            g.append('path')
                .datum(density)
                .attr('d', areaLeft)
                .attr('fill', this.config.primaryColor)
                .attr('opacity', 0.3);
            g.append('path')
                .datum(density)
                .attr('d', areaRight)
                .attr('fill', this.config.primaryColor)
                .attr('opacity', 0.3);
            // Línea central
            const stats = this._calculateStats(dataset.data);
            g.append('line')
                .attr('x1', x)
                .attr('x2', x + width)
                .attr('y1', yScale(stats.median))
                .attr('y2', yScale(stats.median))
                .attr('stroke', this.config.primaryColor)
                .attr('stroke-width', 2);
            // Cuartiles
            g.append('line')
                .attr('x1', x + width * 0.25)
                .attr('x2', x + width * 0.75)
                .attr('y1', yScale(stats.q1))
                .attr('y2', yScale(stats.q1))
                .attr('stroke', this.config.primaryColor)
                .attr('stroke-width', 1);
            g.append('line')
                .attr('x1', x + width * 0.25)
                .attr('x2', x + width * 0.75)
                .attr('y1', yScale(stats.q3))
                .attr('y2', yScale(stats.q3))
                .attr('stroke', this.config.primaryColor)
                .attr('stroke-width', 1);
        });
        // Ejes
        g.append('g')
            .attr('transform', `translate(0,${this.config.height - this.config.margin.top - this.config.margin.bottom})`)
            .call(d3.axisBottom(xScale));
        g.append('g')
            .call(d3.axisLeft(yScale));
        return this;
    }
    /**
     * Crea un scatter plot con línea de regresión
     * @param {Array} xData - Datos del eje X
     * @param {Array} yData - Datos del eje Y
     * @param {object} options - Opciones adicionales
     * @returns {ScientificCharts} - Instancia para chaining
     */
    createScatterPlot(xData, yData, options = {}) {
        if (!this._validateArrays(xData, yData)) {
            throw new Error('Los arrays deben tener la misma longitud');
        }
        // Calcular regresión lineal
        const n = xData.length;
        const sumX = d3.sum(xData);
        const sumY = d3.sum(yData);
        const sumXY = d3.sum(xData.map((x, i) => x * yData[i]));
        const sumXX = d3.sum(xData.map(x => x * x));
        const sumYY = d3.sum(yData.map(y => y * y));
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        // Calcular R²
        const meanY = sumY / n;
        const ssTotal = d3.sum(yData.map(y => Math.pow(y - meanY, 2)));
        const ssResidual = d3.sum(yData.map((y, i) => 
            Math.pow(y - (slope * xData[i] + intercept), 2)
        ));
        const rSquared = 1 - (ssResidual / ssTotal);
        // Configurar escalas
        const xScale = d3.scaleLinear()
            .domain(d3.extent(xData))
            .range([0, this.config.width - this.config.margin.left - this.config.margin.right]);
        const yScale = d3.scaleLinear()
            .domain(d3.extent(yData))
            .range([this.config.height - this.config.margin.top - this.config.margin.bottom, 0]);
        // Crear base del gráfico
        const g = this._createChartBase(
            options.title || 'Scatter Plot con Regresión',
            options.xLabel || 'X',
            options.yLabel || 'Y'
        );
        // Línea de regresión
        const xMin = d3.min(xData);
        const xMax = d3.max(xData);
        const yMinPred = slope * xMin + intercept;
        const yMaxPred = slope * xMax + intercept;
        g.append('line')
            .attr('x1', xScale(xMin))
            .attr('x2', xScale(xMax))
            .attr('y1', yScale(yMinPred))
            .attr('y2', yScale(yMaxPred))
            .attr('stroke', this.config.secondaryColor)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5');
        // Puntos de datos
        g.selectAll('.dot')
            .data(xData.map((x, i) => ({ x, y: yData[i] })))
            .enter().append('circle')
            .attr('class', 'dot')
            .attr('cx', d => xScale(d.x))
            .attr('cy', d => yScale(d.y))
            .attr('r', 4)
            .attr('fill', this.config.primaryColor)
            .attr('opacity', 0.7);
        // Ejes
        g.append('g')
            .attr('transform', `translate(0,${this.config.height - this.config.margin.top - this.config.margin.bottom})`)
            .call(d3.axisBottom(xScale));
        g.append('g')
            .call(d3.axisLeft(yScale));
        // Leyenda con ecuación y R²
        const legend = g.append('g')
            .attr('transform', `translate(${this.config.width - this.config.margin.left - this.config.margin.right - 150}, 20)`);
        legend.append('rect')
            .attr('width', 140)
            .attr('height', 60)
            .attr('fill', 'rgba(15, 23, 42, 0.88)')
            .attr('stroke', '#475569')
            .attr('opacity', 0.8);
        legend.append('text')
            .attr('x', 10)
            .attr('y', 20)
            .attr('font-size', this.config.fontSize)
            .text(`y = ${slope.toFixed(3)}x + ${intercept.toFixed(3)}`);
        legend.append('text')
            .attr('x', 10)
            .attr('y', 40)
            .attr('font-size', this.config.fontSize)
            .text(`R² = ${rSquared.toFixed(3)}`);
        return this;
    }
    /**
     * Crea un gráfico Q-Q (cuantil-cuantil) para evaluar visualmente la
     * normalidad: enfrenta los cuantiles observados (estandarizados) con los
     * cuantiles teóricos de la normal estándar. Si los puntos se alinean con la
     * recta de referencia y = x, la distribución es aproximadamente normal.
     * @param {Array} data - Datos numéricos
     * @param {object} options - Opciones adicionales
     * @returns {ScientificCharts} - Instancia para chaining
     */
    // ----------------------------------------------------------------
    // DISPERSIÓN PROFESIONAL: puntos translúcidos, recta de mínimos
    // cuadrados, BANDA DE CONFIANZA 95% de la recta y caja de anotaciones
    // estadísticas (método, coeficiente, p, R², n). Nivel publicación.
    // ----------------------------------------------------------------
    createScatterPlotPro(xData, yData, options = {}) {
        this._validateArrays(xData, yData);
        const n = xData.length;
        const W = this.config.width - this.config.margin.left - this.config.margin.right;
        const H = this.config.height - this.config.margin.top - this.config.margin.bottom;
        // Regresión por mínimos cuadrados
        const xm = d3.mean(xData), ym = d3.mean(yData);
        let Sxx = 0, Sxy = 0;
        for (let i = 0; i < n; i++) { const dx = xData[i] - xm; Sxx += dx * dx; Sxy += dx * (yData[i] - ym); }
        const b = Sxx === 0 ? 0 : Sxy / Sxx;
        const a = ym - b * xm;
        let SSE = 0;
        for (let i = 0; i < n; i++) { const e = yData[i] - (a + b * xData[i]); SSE += e * e; }
        const gl = Math.max(n - 2, 1);
        const s = Math.sqrt(SSE / gl);
        const t = 1.96 + 2.4 / gl; // aprox. t(0.975, gl), suficiente para visualización
        // Escalas con 5% de respiro
        const padX = (d3.max(xData) - d3.min(xData)) * 0.05 || 1;
        const padY = (d3.max(yData) - d3.min(yData)) * 0.05 || 1;
        const xScale = d3.scaleLinear().domain([d3.min(xData) - padX, d3.max(xData) + padX]).range([0, W]);
        const yScale = d3.scaleLinear().domain([d3.min(yData) - padY, d3.max(yData) + padY]).range([H, 0]);
        const g = this._createChartBase(options.title || 'Diagrama de dispersión',
            options.xLabel || 'X', options.yLabel || 'Y');
        // Rejilla sutil
        g.append('g').attr('class', 'grid')
            .selectAll('line.h').data(yScale.ticks(6)).enter().append('line')
            .attr('x1', 0).attr('x2', W)
            .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
            .attr('stroke', '#94a3b8').attr('stroke-opacity', 0.18);
        g.append('g').attr('class', 'grid')
            .selectAll('line.v').data(xScale.ticks(6)).enter().append('line')
            .attr('y1', 0).attr('y2', H)
            .attr('x1', d => xScale(d)).attr('x2', d => xScale(d))
            .attr('stroke', '#94a3b8').attr('stroke-opacity', 0.12);
        // Banda de confianza 95% de la recta (media condicional)
        const dominio = xScale.domain();
        const malla = d3.range(60).map(i => dominio[0] + (i / 59) * (dominio[1] - dominio[0]));
        const banda = malla.map(x => {
            const half = t * s * Math.sqrt(1 / n + (Sxx === 0 ? 0 : ((x - xm) ** 2) / Sxx));
            const yc = a + b * x;
            return { x, lo: yc - half, hi: yc + half };
        });
        g.append('path').datum(banda)
            .attr('fill', this.config.primaryColor).attr('fill-opacity', 0.13).attr('stroke', 'none')
            .attr('d', d3.area().x(d => xScale(d.x)).y0(d => yScale(d.lo)).y1(d => yScale(d.hi)));
        // Puntos
        g.selectAll('.punto').data(xData).enter().append('circle')
            .attr('cx', (d, i) => xScale(xData[i])).attr('cy', (d, i) => yScale(yData[i]))
            .attr('r', 4).attr('fill', this.config.primaryColor).attr('fill-opacity', 0.55)
            .attr('stroke', '#ffffff').attr('stroke-width', 0.8);
        // Recta de regresión sobre la banda
        g.append('line')
            .attr('x1', xScale(dominio[0])).attr('y1', yScale(a + b * dominio[0]))
            .attr('x2', xScale(dominio[1])).attr('y2', yScale(a + b * dominio[1]))
            .attr('stroke', '#b91c1c').attr('stroke-width', 2.2);
        // Caja de anotaciones (lado opuesto a la pendiente para no tapar puntos)
        const lineas = options.annotationLines || [];
        if (lineas.length) {
            const anchoCaja = 12 + 7.2 * d3.max(lineas, l => l.length);
            const altoCaja = 14 + lineas.length * 17;
            const cx = b >= 0 ? 10 : W - anchoCaja - 10;
            const caja = g.append('g').attr('transform', `translate(${cx},8)`);
            caja.append('rect').attr('width', anchoCaja).attr('height', altoCaja)
                .attr('rx', 6).attr('fill', 'rgba(15, 23, 42, 0.92)')
                .attr('stroke', '#475569');
            lineas.forEach((l, i) => {
                caja.append('text').attr('x', 8).attr('y', 20 + i * 17)
                    .attr('font-size', 12).attr('fill', '#e2e8f0').text(l);
            });
        }
        return this;
    }
    // ----------------------------------------------------------------
    // HISTOGRAMA CON CURVA NORMAL TEÓRICA N(μ, σ) superpuesta, escalada a
    // frecuencias esperadas. Acompaña al Q-Q en el panel de normalidad.
    // ----------------------------------------------------------------
    createHistogramNormal(data, options = {}) {
        if (!Array.isArray(data) || data.length < 3) {
            throw new Error('Se necesitan al menos 3 datos');
        }
        const n = data.length;
        const media = d3.mean(data), de = d3.deviation(data) || 1;
        const binCount = Math.ceil(Math.log2(n)) + 1;
        const histo = d3.histogram().domain(d3.extent(data)).thresholds(binCount);
        const bins = histo(data);
        const anchoBin = bins.length ? (bins[0].x1 - bins[0].x0) : 1;
        const W = this.config.width - this.config.margin.left - this.config.margin.right;
        const H = this.config.height - this.config.margin.top - this.config.margin.bottom;
        const xScale = d3.scaleLinear().domain(d3.extent(data)).range([0, W]).nice();
        const pdf = x => Math.exp(-((x - media) ** 2) / (2 * de * de)) / (de * Math.sqrt(2 * Math.PI));
        const maxY = Math.max(d3.max(bins, d => d.length), n * anchoBin * pdf(media)) * 1.08;
        const yScale = d3.scaleLinear().domain([0, maxY]).range([H, 0]);
        const g = this._createChartBase(options.title || 'Histograma con curva normal',
            options.xLabel || 'Valor', options.yLabel || 'Frecuencia');
        // Ejes con marcas numéricas: el eje X muestra los valores de los
        // intervalos de las barras y el eje Y las frecuencias.
        const ejeX = g.append('g').attr('transform', `translate(0,${H})`)
            .call(d3.axisBottom(xScale).ticks(7).tickSizeOuter(0));
        const ejeY = g.append('g')
            .call(d3.axisLeft(yScale).ticks(5).tickFormat(d3.format('d')).tickSizeOuter(0));
        [ejeX, ejeY].forEach(e => e.selectAll('text').attr('font-size', 10).attr('fill', '#cbd5e1'));
        g.selectAll('.barra').data(bins).enter().append('rect')
            .attr('x', d => xScale(d.x0) + 0.5)
            .attr('width', d => Math.max(xScale(d.x1) - xScale(d.x0) - 1, 1))
            .attr('y', d => yScale(d.length))
            .attr('height', d => H - yScale(d.length))
            .attr('fill', this.config.primaryColor).attr('fill-opacity', 0.55)
            .attr('stroke', '#ffffff');
        // Curva normal teórica escalada a frecuencias: f(x) = n·Δbin·pdf(x)
        const dom = xScale.domain();
        const curva = d3.range(80).map(i => {
            const x = dom[0] + (i / 79) * (dom[1] - dom[0]);
            return { x, y: n * anchoBin * pdf(x) };
        });
        g.append('path').datum(curva)
            .attr('fill', 'none').attr('stroke', '#b91c1c').attr('stroke-width', 2.2)
            .attr('d', d3.line().x(d => xScale(d.x)).y(d => yScale(d.y)).curve(d3.curveBasis));
        g.append('text').attr('x', W - 6).attr('y', 14).attr('text-anchor', 'end')
            .attr('font-size', 11).attr('fill', '#b91c1c')
            .text(`— Normal teórica N(${media.toFixed(1)}, ${de.toFixed(1)})`);
        return this;
    }
    createQQPlot(data, options = {}) {
        if (!Array.isArray(data) || data.length < 3) {
            throw new Error('Se necesitan al menos 3 datos para el gráfico Q-Q');
        }
        const n = data.length;
        const ordenados = [...data].sort((a, b) => a - b);
        const media = d3.mean(ordenados);
        const desviacion = d3.deviation(ordenados) || 1;
        // (cuantil teórico normal, valor observado estandarizado)
        const puntos = ordenados.map((v, i) => ({
            teorico: this._cuantilNormalEstandar((i + 0.5) / n),
            observado: (v - media) / desviacion
        }));
        const contentWidth = this.config.width - this.config.margin.left - this.config.margin.right;
        const contentHeight = this.config.height - this.config.margin.top - this.config.margin.bottom;
        const minimo = Math.min(d3.min(puntos, d => d.teorico), d3.min(puntos, d => d.observado));
        const maximo = Math.max(d3.max(puntos, d => d.teorico), d3.max(puntos, d => d.observado));
        const xScale = d3.scaleLinear().domain([minimo, maximo]).range([0, contentWidth]);
        const yScale = d3.scaleLinear().domain([minimo, maximo]).range([contentHeight, 0]);
        const g = this._createChartBase(
            options.title || 'Gráfico Q-Q',
            options.xLabel || 'Cuantiles teóricos (normal)',
            options.yLabel || 'Cuantiles observados'
        );
        // Recta de referencia y = x (normalidad perfecta)
        g.append('line')
            .attr('x1', xScale(minimo)).attr('y1', yScale(minimo))
            .attr('x2', xScale(maximo)).attr('y2', yScale(maximo))
            .attr('stroke', this.config.secondaryColor)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5');
        // Puntos
        g.selectAll('.qq-dot')
            .data(puntos).enter().append('circle')
            .attr('class', 'qq-dot')
            .attr('cx', d => xScale(d.teorico))
            .attr('cy', d => yScale(d.observado))
            .attr('r', 3)
            .attr('fill', this.config.primaryColor)
            .attr('opacity', 0.7);
        // Ejes
        g.append('g')
            .attr('transform', `translate(0,${contentHeight})`)
            .call(d3.axisBottom(xScale));
        g.append('g').call(d3.axisLeft(yScale));
        return this;
    }
    /**
     * Inverso de la CDF normal estándar (aproximación racional de Acklam),
     * usado para los cuantiles teóricos del gráfico Q-Q.
     * @private
     */
    _cuantilNormalEstandar(p) {
        if (p <= 0) return -3.5;
        if (p >= 1) return 3.5;
        const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
            1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
        const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
            6.680131188771972e+01, -1.328068155288572e+01];
        const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
            -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
        const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
            3.754408661907416e+00];
        const pBajo = 0.02425;
        const pAlto = 1 - pBajo;
        if (p < pBajo) {
            const q = Math.sqrt(-2 * Math.log(p));
            return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
                ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
        } else if (p <= pAlto) {
            const q = p - 0.5;
            const r = q * q;
            return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
                (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
        }
        const q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    /**
     * Crea un histograma con curva de densidad
     * @param {Array} data - Datos numéricos
     * @param {number} bins - Número de bins (opcional)
     * @param {object} options - Opciones adicionales
     * @returns {ScientificCharts} - Instancia para chaining
     */
    createHistogram(data, bins = null, options = {}) {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Los datos deben ser un array no vacío');
        }
        const stats = this._calculateStats(data);
        const binCount = bins || Math.ceil(Math.log2(data.length)) + 1;
        // Crear histograma
        const histogram = d3.histogram()
            .domain(d3.extent(data))
            .thresholds(binCount);
        const binsData = histogram(data);
        // Configurar escalas
        const xScale = d3.scaleLinear()
            .domain(d3.extent(data))
            .range([0, this.config.width - this.config.margin.left - this.config.margin.right]);
        const yScale = d3.scaleLinear()
            .domain([0, d3.max(binsData, d => d.length)])
            .range([this.config.height - this.config.margin.top - this.config.margin.bottom, 0]);
        // Crear base del gráfico
        const g = this._createChartBase(
            options.title || 'Histograma',
            options.xLabel || 'Valor',
            options.yLabel || 'Frecuencia'
        );
        // Barras del histograma
        g.selectAll('.bar')
            .data(binsData)
            .enter().append('rect')
            .attr('class', 'bar')
            .attr('x', d => xScale(d.x0))
            .attr('width', d => xScale(d.x1) - xScale(d.x0) - 1)
            .attr('y', d => yScale(d.length))
            .attr('height', d => this.config.height - this.config.margin.top - this.config.margin.bottom - yScale(d.length))
            .attr('fill', this.config.primaryColor)
            .attr('opacity', 0.7);
        // Curva de densidad
        const densityData = binsData.map(bin => ({
            x: bin.x0 + (bin.x1 - bin.x0) / 2,
            y: bin.length / data.length / (bin.x1 - bin.x0)
        }));
        // Escalar densidad para que se ajuste al gráfico
        const maxDensity = d3.max(densityData, d => d.y);
        const densityScale = d3.scaleLinear()
            .domain([0, maxDensity])
            .range([0, d3.max(binsData, d => d.length)]);
        const line = d3.line()
            .x(d => xScale(d.x))
            .y(d => yScale(densityScale(d.y)))
            .curve(d3.curveBasis);
        g.append('path')
            .datum(densityData)
            .attr('fill', 'none')
            .attr('stroke', this.config.secondaryColor)
            .attr('stroke-width', 2)
            .attr('d', line);
        // Ejes
        g.append('g')
            .attr('transform', `translate(0,${this.config.height - this.config.margin.top - this.config.margin.bottom})`)
            .call(d3.axisBottom(xScale));
        g.append('g')
            .call(d3.axisLeft(yScale));
        // Leyenda con estadísticas
        const legend = g.append('g')
            .attr('transform', `translate(${this.config.width - this.config.margin.left - this.config.margin.right - 150}, 20)`);
        const legendData = [
            `μ = ${stats.mean.toFixed(3)}`,
            `σ = ${stats.std.toFixed(3)}`,
            `N = ${stats.n}`
        ];
        legendData.forEach((text, i) => {
            legend.append('text')
                .attr('y', i * 20)
                .attr('font-size', this.config.fontSize)
                .text(text);
        });
        return this;
    }
    /**
     * Crea un gráfico de barras con intervalos de confianza
     * @param {Array} categories - Categorías
     * @param {Array} values - Valores
     * @param {Array} errors - Errores (opcional)
     * @param {object} options - Opciones adicionales
     * @returns {ScientificCharts} - Instancia para chaining
     */
    createBarChartWithErrorBars(categories, values, errors = null, options = {}) {
        if (!this._validateArrays(categories, values)) {
            throw new Error('Las categorías y valores deben tener la misma longitud');
        }
        if (errors && errors.length !== values.length) {
            throw new Error('Los errores deben tener la misma longitud que los valores');
        }
        // Configurar escalas
        const xScale = d3.scaleBand()
            .domain(categories)
            .range([0, this.config.width - this.config.margin.left - this.config.margin.right])
            .padding(0.3);
        const yScale = d3.scaleLinear()
            .domain([0, d3.max(values) * 1.2])
            .range([this.config.height - this.config.margin.top - this.config.margin.bottom, 0]);
        // Crear base del gráfico
        const g = this._createChartBase(
            options.title || 'Gráfico de Barras con Error Bars',
            options.xLabel || '',
            options.yLabel || 'Valor'
        );
        // Barras
        g.selectAll('.bar')
            .data(values)
            .enter().append('rect')
            .attr('class', 'bar')
            .attr('x', (d, i) => xScale(categories[i]))
            .attr('width', xScale.bandwidth())
            .attr('y', d => yScale(d))
            .attr('height', d => this.config.height - this.config.margin.top - this.config.margin.bottom - yScale(d))
            .attr('fill', this.config.primaryColor)
            .attr('opacity', 0.7);
        // Error bars
        if (errors) {
            values.forEach((value, i) => {
                const x = xScale(categories[i]) + xScale.bandwidth() / 2;
                const error = errors[i];
                // Línea principal del error bar
                g.append('line')
                    .attr('x1', x)
                    .attr('x2', x)
                    .attr('y1', yScale(value - error))
                    .attr('y2', yScale(value + error))
                    .attr('stroke', this.config.secondaryColor)
                    .attr('stroke-width', 2);
                // Top cap
                g.append('line')
                    .attr('x1', x - 5)
                    .attr('x2', x + 5)
                    .attr('y1', yScale(value + error))
                    .attr('y2', yScale(value + error))
                    .attr('stroke', this.config.secondaryColor)
                    .attr('stroke-width', 2);
                // Bottom cap
                g.append('line')
                    .attr('x1', x - 5)
                    .attr('x2', x + 5)
                    .attr('y1', yScale(value - error))
                    .attr('y2', yScale(value - error))
                    .attr('stroke', this.config.secondaryColor)
                    .attr('stroke-width', 2);
            });
        }
        // Ejes
        g.append('g')
            .attr('transform', `translate(0,${this.config.height - this.config.margin.top - this.config.margin.bottom})`)
            .call(d3.axisBottom(xScale));
        g.append('g')
            .call(d3.axisLeft(yScale));
        return this;
    }
    /**
     * Crea un gráfico de Bland-Altman
     * @param {Array} method1 - Datos del método 1
     * @param {Array} method2 - Datos del método 2
     * @param {object} options - Opciones adicionales
     * @returns {ScientificCharts} - Instancia para chaining
     */
    createBlandAltmanPlot(method1, method2, options = {}) {
        if (!this._validateArrays(method1, method2)) {
            throw new Error('Los métodos deben tener la misma longitud');
        }
        // Calcular diferencias y promedios
        const differences = method1.map((m1, i) => m1 - method2[i]);
        const averages = method1.map((m1, i) => (m1 + method2[i]) / 2);
        // Calcular límites de acuerdo
        const meanDiff = d3.mean(differences);
        const stdDiff = d3.deviation(differences);
        const limitOfAgreement = 1.96 * stdDiff;
        // Configurar escalas
        const xScale = d3.scaleLinear()
            .domain(d3.extent(averages))
            .range([0, this.config.width - this.config.margin.left - this.config.margin.right]);
        const yScale = d3.scaleLinear()
            .domain([meanDiff - 3 * stdDiff, meanDiff + 3 * stdDiff])
            .range([this.config.height - this.config.margin.top - this.config.margin.bottom, 0]);
        // Crear base del gráfico
        const g = this._createChartBase(
            options.title || 'Gráfico de Bland-Altman',
            options.xLabel || 'Promedio de las mediciones',
            options.yLabel || 'Diferencia entre métodos'
        );
        // Línea de sesgo (media de las diferencias)
        g.append('line')
            .attr('x1', 0)
            .attr('x2', this.config.width - this.config.margin.left - this.config.margin.right)
            .attr('y1', yScale(meanDiff))
            .attr('y2', yScale(meanDiff))
            .attr('stroke', this.config.secondaryColor)
            .attr('stroke-width', 2);
        // Límites de acuerdo
        g.append('line')
            .attr('x1', 0)
            .attr('x2', this.config.width - this.config.margin.left - this.config.margin.right)
            .attr('y1', yScale(meanDiff + limitOfAgreement))
            .attr('y2', yScale(meanDiff + limitOfAgreement))
            .attr('stroke', this.config.secondaryColor)
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '5,5');
        g.append('line')
            .attr('x1', 0)
            .attr('x2', this.config.width - this.config.margin.left - this.config.margin.right)
            .attr('y1', yScale(meanDiff - limitOfAgreement))
            .attr('y2', yScale(meanDiff - limitOfAgreement))
            .attr('stroke', this.config.secondaryColor)
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '5,5');
        // Puntos de datos
        g.selectAll('.dot')
            .data(averages.map((avg, i) => ({ x: avg, y: differences[i] })))
            .enter().append('circle')
            .attr('class', 'dot')
            .attr('cx', d => xScale(d.x))
            .attr('cy', d => yScale(d.y))
            .attr('r', 4)
            .attr('fill', this.config.primaryColor)
            .attr('opacity', 0.7);
        // Ejes
        g.append('g')
            .attr('transform', `translate(0,${this.config.height - this.config.margin.top - this.config.margin.bottom})`)
            .call(d3.axisBottom(xScale));
        g.append('g')
            .call(d3.axisLeft(yScale));
        // Leyenda con estadísticas
        const legend = g.append('g')
            .attr('transform', `translate(${this.config.width - this.config.margin.left - this.config.margin.right - 200}, 20)`);
        legend.append('rect')
            .attr('width', 190)
            .attr('height', 80)
            .attr('fill', 'rgba(15, 23, 42, 0.88)')
            .attr('stroke', '#475569')
            .attr('opacity', 0.8);
        legend.append('text')
            .attr('x', 10)
            .attr('y', 20)
            .attr('font-size', this.config.fontSize)
            .text(`Sesgo: ${meanDiff.toFixed(3)}`);
        legend.append('text')
            .attr('x', 10)
            .attr('y', 40)
            .attr('font-size', this.config.fontSize)
            .text(`±1.96 SD: ±${limitOfAgreement.toFixed(3)}`);
        legend.append('text')
            .attr('x', 10)
            .attr('y', 60)
            .attr('font-size', this.config.fontSize)
            .text(`N = ${method1.length}`);
        return this;
    }
    /**
     * Crea un gráfico de radar (spider plot)
     * @param {Array} categories - Categorías/dimensiones
     * @param {Array} values - Valores para cada categoría
     * @param {object} options - Opciones adicionales
     * @returns {ScientificCharts} - Instancia para chaining
     */
    createRadarChart(categories, values, options = {}) {
        if (!this._validateArrays(categories, values)) {
            throw new Error('Las categorías y valores deben tener la misma longitud');
        }
        const n = categories.length;
        const maxValue = d3.max(values) * 1.1;
        
        // Calcular centro y radio
        const centerX = (this.config.width - this.config.margin.left - this.config.margin.right) / 2;
        const centerY = (this.config.height - this.config.margin.top - this.config.margin.bottom) / 2;
        const radius = Math.min(centerX, centerY) * 0.8;
        // Crear base del gráfico
        const g = this._createChartBase(
            options.title || 'Gráfico de Radar',
            options.xLabel || '',
            options.yLabel || ''
        );
        // Ángulos para cada categoría
        const angleSlice = (Math.PI * 2) / n;
        // Escala radial
        const rScale = d3.scaleLinear()
            .domain([0, maxValue])
            .range([0, radius]);
        // Círculos concéntricos
        const levels = 5;
        for (let level = 1; level <= levels; level++) {
            const r = radius * level / levels;
            
            g.append('circle')
                .attr('cx', centerX)
                .attr('cy', centerY)
                .attr('r', r)
                .attr('fill', 'none')
                .attr('stroke', this.config.gridColor)
                .attr('stroke-width', 1);
            // Etiquetas de valores
            g.append('text')
                .attr('x', centerX + 5)
                .attr('y', centerY - r)
                .attr('font-size', this.config.fontSize - 2)
                .text((maxValue * level / levels).toFixed(1));
        }
        // Líneas radiales
        categories.forEach((category, i) => {
            const angle = angleSlice * i - Math.PI / 2;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            g.append('line')
                .attr('x1', centerX)
                .attr('y1', centerY)
                .attr('x2', x)
                .attr('y2', y)
                .attr('stroke', this.config.gridColor)
                .attr('stroke-width', 1);
            // Etiquetas de categorías
            const labelX = centerX + Math.cos(angle) * (radius + 20);
            const labelY = centerY + Math.sin(angle) * (radius + 20);
            
            g.append('text')
                .attr('x', labelX)
                .attr('y', labelY)
                .attr('text-anchor', Math.abs(angle) < 0.1 ? 'middle' : (angle < 0 ? 'end' : 'start'))
                .attr('dominant-baseline', 'middle')
                .attr('font-size', this.config.fontSize)
                .text(category);
        });
        // Datos del radar
        const dataPoints = values.map((value, i) => {
            const angle = angleSlice * i - Math.PI / 2;
            const r = rScale(value);
            return {
                x: centerX + Math.cos(angle) * r,
                y: centerY + Math.sin(angle) * r
            };
        });
        // Área del radar
        const radarArea = d3.line()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveLinearClosed);
        g.append('path')
            .datum(dataPoints)
            .attr('fill', this.config.primaryColor)
            .attr('fill-opacity', 0.3)
            .attr('stroke', this.config.primaryColor)
            .attr('stroke-width', 2)
            .attr('d', radarArea);
        // Puntos de datos
        dataPoints.forEach((point, i) => {
            g.append('circle')
                .attr('cx', point.x)
                .attr('cy', point.y)
                .attr('r', 4)
                .attr('fill', this.config.primaryColor);
            // Valores en los puntos
            g.append('text')
                .attr('x', point.x)
                .attr('y', point.y - 10)
                .attr('text-anchor', 'middle')
                .attr('font-size', this.config.fontSize - 2)
                .text(values[i].toFixed(1));
        });
        return this;
    }
    /**
     * Crea un gráfico de residuos
     * @param {Array} predicted - Valores predichos
     * @param {Array} observed - Valores observados
     * @param {object} options - Opciones adicionales
     * @returns {ScientificCharts} - Instancia para chaining
     */
    createResidualPlot(predicted, observed, options = {}) {
        if (!this._validateArrays(predicted, observed)) {
            throw new Error('Los valores predichos y observados deben tener la misma longitud');
        }
        // Calcular residuos
        const residuals = predicted.map((pred, i) => observed[i] - pred);
        // Configurar escalas
        const xScale = d3.scaleLinear()
            .domain(d3.extent(predicted))
            .range([0, this.config.width - this.config.margin.left - this.config.margin.right]);
        const yScale = d3.scaleLinear()
            .domain(d3.extent(residuals).map(d => d * 1.1))
            .range([this.config.height - this.config.margin.top - this.config.margin.bottom, 0]);
        // Crear base del gráfico
        const g = this._createChartBase(
            options.title || 'Gráfico de Residuos',
            options.xLabel || 'Valores Predichos',
            options.yLabel || 'Residuos'
        );
        // Línea horizontal en cero
        g.append('line')
            .attr('x1', 0)
            .attr('x2', this.config.width - this.config.margin.left - this.config.margin.right)
            .attr('y1', yScale(0))
            .attr('y2', yScale(0))
            .attr('stroke', this.config.secondaryColor)
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '5,5');
        // Puntos de residuos
        g.selectAll('.residual')
            .data(predicted.map((pred, i) => ({ x: pred, y: residuals[i] })))
            .enter().append('circle')
            .attr('class', 'residual')
            .attr('cx', d => xScale(d.x))
            .attr('cy', d => yScale(d.y))
            .attr('r', 4)
            .attr('fill', this.config.primaryColor)
            .attr('opacity', 0.7);
        // Ejes
        g.append('g')
            .attr('transform', `translate(0,${this.config.height - this.config.margin.top - this.config.margin.bottom})`)
            .call(d3.axisBottom(xScale));
        g.append('g')
            .call(d3.axisLeft(yScale));
        // Estadísticas de residuos
        const mse = d3.mean(residuals.map(r => r * r));
        const rmse = Math.sqrt(mse);
        const mae = d3.mean(residuals.map(r => Math.abs(r)));
        // Leyenda
        const legend = g.append('g')
            .attr('transform', `translate(${this.config.width - this.config.margin.left - this.config.margin.right - 150}, 20)`);
        legend.append('rect')
            .attr('width', 140)
            .attr('height', 80)
            .attr('fill', 'rgba(15, 23, 42, 0.88)')
            .attr('stroke', '#475569')
            .attr('opacity', 0.8);
        legend.append('text')
            .attr('x', 10)
            .attr('y', 20)
            .attr('font-size', this.config.fontSize)
            .text(`RMSE: ${rmse.toFixed(3)}`);
        legend.append('text')
            .attr('x', 10)
            .attr('y', 40)
            .attr('font-size', this.config.fontSize)
            .text(`MAE: ${mae.toFixed(3)}`);
        legend.append('text')
            .attr('x', 10)
            .attr('y', 60)
            .attr('font-size', this.config.fontSize)
            .text(`N = ${predicted.length}`);
        return this;
    }
    /**
     * Método para limpiar el gráfico actual
     * @returns {ScientificCharts} - Instancia para chaining
     */
    clear() {
        this.svg.selectAll('*').remove();
        this._initializeSVG();
        return this;
    }
    /**
     * Método para exportar el gráfico como SVG
     * @returns {string} - SVG como string
     */
    exportSVG() {
        return this.svg.node().outerHTML;
    }
    /**
     * Método para redimensionar el gráfico
     * @param {number} width - Nuevo ancho
     * @param {number} height - Nuevo alto
     * @returns {ScientificCharts} - Instancia para chaining
     */
    resize(width, height) {
        this.config.width = width;
        this.config.height = height;
        
        this.svg.attr('viewBox', `0 0 ${width} ${height}`);
        this._ajustarTamanoCSS(width, height);
        
        return this;
    }
}
// Clase Builder para facilitar la creación de gráficos
class ScientificChartsBuilder {
    constructor(containerId) {
        this.containerId = containerId;
        this.config = {};
    }
    setDimensions(width, height) {
        this.config.width = width;
        this.config.height = height;
        return this;
    }
    setMargins(top, right, bottom, left) {
        this.config.margin = { top, right, bottom, left };
        return this;
    }
    setColors(primary, secondary) {
        this.config.primaryColor = primary;
        this.config.secondaryColor = secondary;
        return this;
    }
    setFont(fontFamily, fontSize) {
        this.config.fontFamily = fontFamily;
        this.config.fontSize = fontSize;
        return this;
    }
    build() {
        return new ScientificCharts(this.containerId, this.config);
    }
}
// Exportar clases para uso global
if (typeof window !== 'undefined') {
    window.ScientificCharts = ScientificCharts;
    window.ScientificChartsBuilder = ScientificChartsBuilder;
}
// Exportar para módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ScientificCharts, ScientificChartsBuilder };
}
