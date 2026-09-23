// ============================================================================
// generador-imperfecciones.js — perdidos, descuidados, digitación, estilos de respuesta, controles, tiempo
// Métodos de GeneradorDatos añadidos al prototipo (misma semántica que en la clase).
// ============================================================================
Object.assign(GeneradorDatos.prototype, {
    aplicarImperfecciones(base) {
        const r = this.configuracion.realismo || {};
        const cfg = this.configuracion, grupos = cfg.gruposPruebas || [];
        const n = base.n;
        this.controlesGenerados = [];
        const vacio = { perdidos: 0, descuidados: 0, digitacion: 0, aquiescentes: 0, extremos: 0, controles: 0, fallosControl: 0, tiempo: false };
        if (!n || !(r.pctPerdidos > 0 || r.pctDescuidados > 0 || r.pctDigitacion > 0 || r.pctAquiescencia > 0 || r.pctExtrema > 0 || r.tiempoMinutos > 0 || r.itemsControl > 0)) return vacio;
        const pruebasConItems = (cfg.pruebas || []).filter(p => p.numItems >= 2);
        const columnasItems = p => this._itemsDe(p).map(k => base.columna(k).datos);
        const tocados = new Set();
        let nPerdidos = 0, nDescuidados = 0, nDigitacion = 0;
        // Quién es descuidado se decide primero: los estilos de respuesta se
        // reparten entre los demás, y tiempo e ítems de control dependen de ello.
        const esDescuidado = new Uint8Array(n);
        const tipoDescuidado = new Array(n).fill(null), valorLinea = new Map();
        const kDesc = (r.pctDescuidados > 0 && pruebasConItems.length) ? Math.round(n * r.pctDescuidados / 100) : 0;
        const ordenDesc = kDesc > 0 ? this._muestraSinReemplazo(n, kDesc) : [];
        ordenDesc.forEach(i => { esDescuidado[i] = 1; let tipo = r.tipoDescuidado; if (tipo === 'mixto') tipo = this.aleatorio() < 0.5 ? 'linea' : 'aleatorio'; tipoDescuidado[i] = tipo; });
        // columnas marcadoras en orden fijo: Respuesta_descuidada, Estilo_respuesta
        const marcador = (kDesc > 0 && r.marcarDescuidados) ? base.agregar('Respuesta_descuidada', true).datos : null;
        // --- (B8) Estilos de respuesta: aquiescencia y respuesta extrema ---
        const estilos = this._aplicarEstilosRespuesta(base, pruebasConItems, esDescuidado, tocados);
        // --- Respuestas descuidadas ---
        if (kDesc > 0) {
            ordenDesc.forEach(i => {
                const tipo = tipoDescuidado[i];
                pruebasConItems.forEach(p => {
                    const min = isFinite(p.minimo) ? p.minimo : Math.floor(p.media / p.numItems - p.desviacion);
                    const max = isFinite(p.maximo) ? p.maximo : Math.ceil(p.media / p.numItems + p.desviacion);
                    const fijo = min + Math.floor(this.aleatorio() * (max - min + 1));
                    if (tipo === 'linea' && !valorLinea.has(i)) valorLinea.set(i, fijo);
                    columnasItems(p).forEach(col => {
                        col[i] = tipo === 'linea' ? fijo : (min + Math.floor(this.aleatorio() * (max - min + 1)));
                    });
                });
                if (marcador) marcador[i] = 1;
                tocados.add(i); nDescuidados++;
            });
        }
        // --- Errores de digitación (atípicos) ---
        if (r.pctDigitacion > 0 && pruebasConItems.length) {
            const k = Math.round(n * r.pctDigitacion / 100);
            for (let c = 0; c < k; c++) {
                const i = Math.floor(this.aleatorio() * n);
                const p = pruebasConItems[Math.floor(this.aleatorio() * pruebasConItems.length)];
                const cols = columnasItems(p), col = cols[Math.floor(this.aleatorio() * cols.length)];
                const max = isFinite(p.maximo) ? p.maximo : Math.ceil(p.media / p.numItems + 2 * p.desviacion);
                const v = col[i];
                // dígito repetido («44» por «4») o un cero de más («50» por «5»)
                col[i] = (isFinite(v) && this.aleatorio() < 0.5) ? Number(String(Math.round(v)) + String(Math.round(v))) : max * 10;
                tocados.add(i); nDigitacion++;
            }
        }
        // --- Valores perdidos ---
        if (r.pctPerdidos > 0 && pruebasConItems.length) {
            const p0 = r.pctPerdidos / 100;
            const altos = r.sentidoMAR === 'altos';
            // rangos [0,1] de una columna (casos observados); NaN → 0.5
            const rangosDe = datosRef => {
                const vals = [];
                for (let i = 0; i < n; i++) if (isFinite(datosRef[i])) vals.push([datosRef[i], i]);
                vals.sort((a, b) => a[0] - b[0]);
                const rg = new Float64Array(n).fill(0.5);
                vals.forEach(([, i], pos) => { rg[i] = vals.length > 1 ? pos / (vals.length - 1) : 0.5; });
                return rg;
            };
            // quienes están en el extremo elegido pierden hasta el doble; el otro extremo casi nada
            const probabilidad = rg => Math.max(0, Math.min(1, p0 * (1.8 - 1.6 * (altos ? 1 - rg : rg))));
            let rangos = null;
            if (r.mecanismoPerdidos === 'MAR') {
                // (B9) referencia elegible: variable numérica u ordinal del estudio; si no, la automática
                let ref = null;
                if (r.referenciaMAR) {
                    const p = (cfg.pruebas || []).find(x => x.nombre === r.referenciaMAR);
                    ref = p ? this.columnaDeEscala(p) : r.referenciaMAR;
                }
                if (!ref || !base.tiene(ref)) {
                    const socioNum = (cfg.sociodemograficos || []).find(s => s.distribucion === 'normal' || s.distribucion === 'asimetrica');
                    if (socioNum) ref = socioNum.categoria;   // la columna se llama como la categoría (no como su nombre corto)
                    else if (cfg.pruebas && cfg.pruebas.length) ref = this.columnaDeEscala(cfg.pruebas[0]);
                }
                if (ref && base.tiene(ref)) rangos = rangosDe(base.columna(ref).datos);
                this.referenciaMARUsada = ref;
            }
            const columnasPorPrueba = pruebasConItems.map(columnasItems);
            if (r.mecanismoPerdidos === 'MNAR') {
                // (B9) MNAR: la pérdida depende del propio total de la escala (antes de perder)
                pruebasConItems.forEach((p, k) => {
                    const total = base.columna(this.columnaDeEscala(p));
                    const rg = total ? rangosDe(total.datos) : null;
                    for (let i = 0; i < n; i++) {
                        const pi = rg ? probabilidad(rg[i]) : p0;
                        columnasPorPrueba[k].forEach(col => { if (this.aleatorio() < pi) { col[i] = NaN; nPerdidos++; tocados.add(i); } });
                    }
                });
            } else {
                for (let i = 0; i < n; i++) {
                    const pi = rangos ? probabilidad(rangos[i]) : p0;
                    columnasPorPrueba.forEach(cols => cols.forEach(col => {
                        if (this.aleatorio() < pi) { col[i] = NaN; nPerdidos++; tocados.add(i); }
                    }));
                }
            }
        }
        tocados.forEach(i => this._recalcularTotales(base, i, grupos));
        // --- (B8) Ítems de control y tiempo de respuesta (tras saber quién es descuidado) ---
        const control = this._generarItemsControl(base, esDescuidado, tipoDescuidado, valorLinea);
        const tiempo = this._generarTiempoRespuesta(base, esDescuidado, estilos.marcaPersona);
        return { perdidos: nPerdidos, descuidados: nDescuidados, digitacion: nDigitacion, aquiescentes: estilos.aquiescentes, extremos: estilos.extremos, controles: control.columnas, fallosControl: control.fallos, tiempo };
    },

    // (B8) Estilos de respuesta sobre las escalas Likert. Se reparten entre las
    // personas NO descuidadas, sin solaparse (una persona tiene a lo sumo un
    // estilo). La intensidad de cada persona es la del preset × U(0.7, 1.3).
    //  · Aquiescencia: suma «a» puntos a la respuesta bruta de cada ítem (la
    //    parte fraccionaria, con esa probabilidad) y recorta al máximo.
    //  · Extrema: cada respuesta salta al extremo de su lado con probabilidad q
    //    (en el punto medio exacto, a un extremo al azar con probabilidad q/2).
    // Devuelve el marcador por persona (0 ninguno, 1 aquiescente, 2 extremo).
    _aplicarEstilosRespuesta(base, pruebasConItems, esDescuidado, tocados) {
        const r = this.configuracion.realismo || {};
        const n = base.n;
        const marcaPersona = new Uint8Array(n);
        const salida = { aquiescentes: 0, extremos: 0, marcaPersona };
        const pctA = r.pctAquiescencia || 0, pctE = r.pctExtrema || 0;
        if (!(pctA > 0 || pctE > 0)) return salida;
        const likert = pruebasConItems.filter(p => p.minimo !== null && p.maximo !== null && isFinite(p.minimo) && isFinite(p.maximo) && (p.maximo - p.minimo) >= 2);   // (C5) sin dicotómicas
        if (!likert.length) return salida;
        const preset = ESTILOS_RESPUESTA[r.intensidadEstilos] || ESTILOS_RESPUESTA.moderada;
        const candidatos = [];
        for (let i = 0; i < n; i++) if (!esDescuidado[i]) candidatos.push(i);
        const nA = Math.min(candidatos.length, Math.round(n * pctA / 100));
        const nE = Math.min(candidatos.length - nA, Math.round(n * pctE / 100));
        const orden = this._muestraSinReemplazo(candidatos.length, nA + nE).map(k => candidatos[k]);
        const columnas = likert.map(p => ({ p, cols: this._itemsDe(p).map(k => base.columna(k).datos) }));
        for (let idx = 0; idx < orden.length; idx++) {
            const i = orden[idx];
            const factor = 0.7 + 0.6 * this.aleatorio();
            if (idx < nA) {
                const a = preset.aquiescencia * factor, entero = Math.floor(a), frac = a - entero;
                columnas.forEach(({ p, cols }) => cols.forEach(col => {
                    const v = col[i];
                    if (!(v === v)) return;
                    const salto = entero + (this.aleatorio() < frac ? 1 : 0);
                    col[i] = Math.min(p.maximo, v + salto);
                }));
                marcaPersona[i] = 1; salida.aquiescentes++;
            } else {
                const q = Math.min(0.98, preset.extrema * factor);
                columnas.forEach(({ p, cols }) => {
                    const m = (p.minimo + p.maximo) / 2;
                    cols.forEach(col => {
                        const v = col[i];
                        if (!(v === v)) return;
                        if (v === m) { if (this.aleatorio() < q / 2) col[i] = this.aleatorio() < 0.5 ? p.minimo : p.maximo; }
                        else if (this.aleatorio() < q) col[i] = v < m ? p.minimo : p.maximo;
                    });
                });
                marcaPersona[i] = 2; salida.extremos++;
            }
            tocados.add(i);
        }
        if (r.marcarDescuidados) {
            const col = base.agregar('Estilo_respuesta', true).datos;
            for (let i = 0; i < n; i++) col[i] = marcaPersona[i];
        }
        return salida;
    },

    // (B8) Ítems de control («marque X»): columnas Control_1…k con el rango de
    // las escalas Likert (por turno). La respuesta correcta es el máximo del
    // rango. Atentos: aciertan con probabilidad 0.97; descuidados en línea
    // recta responden su valor fijo; descuidados al azar, un valor uniforme.
    // Ítems de control que corresponden a la configuración: columna, número,
    // respuesta correcta y rango. Se deriva de la configuración (no del estado
    // de la generación) para que las etiquetas valgan también en el hilo
    // principal cuando la base la generó el Worker.
    _controlesEsperados() {
        const cfg = this.configuracion || {}, r = cfg.realismo || {};
        const k = Math.max(0, Math.min(3, Math.round(r.itemsControl || 0)));
        if (!k) return [];
        const likert = (cfg.pruebas || []).filter(p => p.numItems >= 2 && p.minimo !== null && p.maximo !== null && isFinite(p.minimo) && isFinite(p.maximo) && (p.maximo - p.minimo) >= 2 && !p.sufijo);   // (C5) sin dicotómicas
        if (!likert.length) return [];
        const salida = [];
        for (let c = 1; c <= k; c++) {
            const p = likert[(c - 1) % likert.length];
            salida.push({ columna: `Control_${c}`, indice: c, correcta: p.maximo, minimo: p.minimo, maximo: p.maximo });
        }
        return salida;
    },

    _generarItemsControl(base, esDescuidado, tipoDescuidado, valorLinea) {
        const salida = { columnas: 0, fallos: 0 };
        const esperados = this._controlesEsperados();
        if (!esperados.length) return salida;
        const n = base.n;
        esperados.forEach(ctrl => {
            const min = ctrl.minimo, max = ctrl.maximo, ancho = max - min + 1;
            const col = base.agregar(ctrl.columna, true).datos;
            for (let i = 0; i < n; i++) {
                let v;
                if (esDescuidado[i]) {
                    v = (tipoDescuidado[i] === 'linea' && valorLinea.has(i)) ? Math.max(min, Math.min(max, valorLinea.get(i))) : min + Math.floor(this.aleatorio() * ancho);
                } else if (this.aleatorio() < 0.97 || ancho < 2) {
                    v = max;
                } else {
                    v = min + Math.floor(this.aleatorio() * (ancho - 1));   // cualquier valor distinto del correcto
                }
                col[i] = v;
                if (v !== max) salida.fallos++;
            }
            this.controlesGenerados.push(ctrl);
            salida.columnas++;
        });
        return salida;
    },

    // (B8) Tiempo total de respuesta (segundos): log-normal alrededor de la
    // mediana pedida (σ_log = 0.35); los descuidados tardan ×U(0.25, 0.55) y
    // quienes tienen un estilo de respuesta ×U(0.8, 1.0). Mínimo 30 s.
    _generarTiempoRespuesta(base, esDescuidado, marcaPersona) {
        const r = this.configuracion.realismo || {};
        const mediana = (r.tiempoMinutos || 0) * 60;
        if (!(mediana > 0)) return false;
        const n = base.n;
        const col = base.agregar('Tiempo_respuesta_seg', true).datos;
        for (let i = 0; i < n; i++) {
            let t = mediana * Math.exp(0.35 * this.generarNormalEstandar());
            if (esDescuidado[i]) t *= 0.25 + 0.30 * this.aleatorio();
            else if (marcaPersona && marcaPersona[i]) t *= 0.8 + 0.2 * this.aleatorio();
            col[i] = Math.max(30, Math.round(t));
        }
        return true;
    },

    // Recalcula, para la fila i, los totales de las escalas (regla del 80 %) y
    // los puntajes generales derivados tras alterar sus ítems.
    _recalcularTotales(base, i, grupos) {
        const cfg = this.configuracion;
        (cfg.pruebas || []).forEach(p => {
            if (p.numItems < 1) return;
            const items = [];
            this._itemsDe(p).forEach((k, j) => {
                const v = this._recodificar(p, j + 1, base.columna(k).datos[i]);
                if (typeof v === 'number' && isFinite(v)) items.push(v);
            });
            const col = base.columna(this.columnaDeEscala(p)).datos;
            if (items.length === 0) { col[i] = NaN; return; }
            if (items.length < p.numItems) {
                if (items.length < 0.8 * p.numItems) { col[i] = NaN; return; }
                const prorrateo = items.reduce((s, v) => s + v, 0) / items.length * p.numItems;   // regla del 80 %
                col[i] = Math.round(prorrateo * 100) / 100;
            } else {
                col[i] = Math.round(items.reduce((s, v) => s + v, 0) * 100) / 100;
            }
        });
        (grupos || []).forEach(g => {
            if (g.escalas.length < 2) return;
            const general = base.columna(`General_${g.sigla}`);
            if (!general) return;
            let suma = 0, completo = true;
            g.escalas.forEach(s => { const v = base.columna(`Dimension_${s}`).datos[i]; if (v === v) suma += v; else completo = false; });
            general.datos[i] = completo ? Math.round(suma / g.escalas.length) : NaN;
        });
    },

});
