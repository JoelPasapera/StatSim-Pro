// ============================================================
// FIABILIDAD Y CONSISTENCIA INTERNA — StatSim Pro
// ------------------------------------------------------------
// Módulo autónomo. Detecta automáticamente las escalas (ítems
// agrupados por prefijo, estructura del Simulador o campos
// manuales), calcula una batería completa de consistencia
// interna y genera tanto la sección de la interfaz como los
// bloques del documento Word.
//   · Alfa de Cronbach (bruto y estandarizado) con IC 95 % (Feldt)
//   · Omega total de McDonald (solución unifactorial, ejes
//     principales iterados sobre la matriz de correlaciones)
//   · Lambda 2 de Guttman
//   · Correlación media inter-ítem y su rango
//   · Análisis de ítems: media, DE, correlación ítem-total
//     corregida y alfa si se elimina el elemento
//   · Resiliencia: ítems constantes o no numéricos se excluyen
//     con aviso; posibles ítems inversos se señalan; n efectivo
//     por eliminación de casos incompletos (listwise)
// ============================================================
const Fiabilidad = {
    _ultimo: null,

    // ---------- utilidades numéricas autónomas ----------
    _media(v) { return v.reduce((s, x) => s + x, 0) / v.length; },
    _varianza(v) { // muestral (n-1)
        const m = this._media(v);
        return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1);
    },
    _cov(a, b) {
        const ma = this._media(a), mb = this._media(b);
        let s = 0;
        for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
        return s / (a.length - 1);
    },
    _cor(a, b) {
        const c = this._cov(a, b), va = this._varianza(a), vb = this._varianza(b);
        return (va > 0 && vb > 0) ? c / Math.sqrt(va * vb) : 0;
    },
    // Beta incompleta regularizada (para la CDF de la F de Fisher)
    _betacf(a, b, x) {
        const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300;
        let qab = a + b, qap = a + 1, qam = a - 1;
        let c = 1, d = 1 - qab * x / qap;
        if (Math.abs(d) < FPMIN) d = FPMIN;
        d = 1 / d;
        let h = d;
        for (let m = 1; m <= MAXIT; m++) {
            const m2 = 2 * m;
            let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
            d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
            c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
            d = 1 / d; h *= d * c;
            aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
            d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
            c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
            d = 1 / d;
            const del = d * c; h *= del;
            if (Math.abs(del - 1) < EPS) break;
        }
        return h;
    },
    _gammaln(x) {
        const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091,
            -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
        let y = x, tmp = x + 5.5;
        tmp -= (x + 0.5) * Math.log(tmp);
        let ser = 1.000000000190015;
        for (let j = 0; j < 6; j++) ser += cof[j] / ++y;
        return -tmp + Math.log(2.5066282746310005 * ser / x);
    },
    _betai(a, b, x) {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        const bt = Math.exp(this._gammaln(a + b) - this._gammaln(a) - this._gammaln(b)
            + a * Math.log(x) + b * Math.log(1 - x));
        if (x < (a + 1) / (a + b + 2)) return bt * this._betacf(a, b, x) / a;
        return 1 - bt * this._betacf(b, a, 1 - x) / b;
    },
    _pF(f, df1, df2) { // CDF de la F
        if (!(f > 0)) return 0;
        return this._betai(df1 / 2, df2 / 2, df1 * f / (df1 * f + df2));
    },
    _qF(p, df1, df2) { // inversa por bisección
        let lo = 1e-8, hi = 1e6;
        for (let i = 0; i < 200; i++) {
            const mid = (lo + hi) / 2;
            if (this._pF(mid, df1, df2) < p) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
    },

    // ---------- detección de estructura ----------
    // Devuelve grupos { nombre, etiqueta, items:[col...], origen } a partir de:
    //  1) los campos manuales de dimensiones (si están rellenos: prioridad),
    //  2) la estructura del Simulador (EtiquetasVariables), si existe,
    //  3) la heurística de prefijos: columnas numéricas no-puntaje con patrón
    //     «prefijo + número» (PE1…PE8, F1…F36) forman una escala candidata.
    detectarGrupos(datos) {
        const grupos = [];
        const usados = new Set();
        if (!datos || !datos.length) return grupos;
        const columnas = Object.keys(datos[0]).filter(c => c !== 'ID');
        const esPuntaje = c => /^\s*(total|dimensi[oó]n|general)[_\-]/i.test(c);
        // Una columna cuenta como numérica si CUALQUIER fila aporta un valor
        // válido (resiliencia: una primera celda vacía no debe descartar el ítem).
        const numericas = columnas.filter(c =>
            datos.some(f => Number.isFinite(parseFloat(f[c]))));

        // 1) Campos manuales «Nombre: it1, it2; Nombre2: it3, it4»
        ['dimensionesVar1', 'dimensionesVar2'].forEach(id => {
            const campo = (typeof document !== 'undefined') ? document.getElementById(id) : null;
            const txt = campo && campo.value ? campo.value.trim() : '';
            if (!txt) return;
            txt.split(';').forEach(bloque => {
                const [nombre, lista] = bloque.split(':');
                if (!nombre || !lista) return;
                const pedidos = lista.split(',').map(s => s.trim()).filter(Boolean);
                const items = pedidos.filter(it => numericas.includes(it) && !usados.has(it));
                const noEncontrados = pedidos.filter(it => !numericas.includes(it));
                if (items.length >= 2) {
                    items.forEach(it => usados.add(it));
                    grupos.push({
                        nombre: nombre.trim(), etiqueta: nombre.trim(), items, origen: 'manual',
                        avisosPrevios: noEncontrados.length ? [`Ítem(s) indicado(s) manualmente pero no encontrado(s) en la base: ${noEncontrados.join(', ')}.`] : []
                    });
                }
            });
        });

        // 2) Estructura del Simulador
        if (typeof EtiquetasVariables !== 'undefined' && EtiquetasVariables.tieneEtiquetas
            && EtiquetasVariables.tieneEtiquetas() && Array.isArray(EtiquetasVariables._estructura)) {
            EtiquetasVariables._estructura.forEach(prueba => {
                (prueba.dimensiones || []).forEach(dim => {
                    const sigla = dim.sigla || dim.columna || '';
                    const items = numericas.filter(c =>
                        !usados.has(c) && !esPuntaje(c) &&
                        new RegExp('^' + sigla + '\\d+$', 'i').test(c));
                    if (items.length >= 2) {
                        items.forEach(it => usados.add(it));
                        grupos.push({
                            nombre: sigla,
                            etiqueta: (dim.etiqueta || sigla) + (prueba.prueba ? ` (${prueba.prueba})` : ''),
                            items, origen: 'simulador'
                        });
                    }
                });
            });
        }

        // I1: escala TOTAL por prueba del Simulador (todas sus dimensiones)
        const porPrueba = {};
        grupos.filter(g => g.origen === 'simulador').forEach(g => {
            const m = g.etiqueta.match(/\(([^)]+)\)$/);
            if (m) (porPrueba[m[1]] = porPrueba[m[1]] || []).push(g);
        });
        Object.keys(porPrueba).forEach(prueba => {
            const dims = porPrueba[prueba];
            if (dims.length < 2) return;
            grupos.push({
                nombre: 'TOTAL_' + prueba,
                etiqueta: `Escala total (${prueba})`,
                items: dims.flatMap(d => d.items),
                origen: 'simulador'
            });
        });
        // 3) Heurística de prefijos sobre lo restante
        const porPrefijo = {};
        numericas.forEach(c => {
            if (usados.has(c) || esPuntaje(c)) return;
            const m = c.match(/^(.+?)[_\-]?(\d+)$/);
            if (!m || !m[1]) return;
            const clave = m[1].replace(/[_\-]$/, '');
            (porPrefijo[clave] = porPrefijo[clave] || []).push(c);
        });
        Object.keys(porPrefijo).forEach(prefijo => {
            const items = porPrefijo[prefijo];
            if (items.length < 2) return;
            items.sort((a, b) => (parseInt(a.match(/(\d+)$/)[1], 10)) - (parseInt(b.match(/(\d+)$/)[1], 10)));
            items.forEach(it => usados.add(it));
            const etiqueta = (typeof EtiquetasVariables !== 'undefined' && EtiquetasVariables.etiqueta)
                ? EtiquetasVariables.etiqueta(prefijo) : prefijo;
            grupos.push({ nombre: prefijo, etiqueta, items, origen: 'prefijo' });
        });
        return grupos;
    },

    // ---------- cálculo por grupo ----------
    analizarGrupo(datos, grupo) {
        const avisos = (grupo.avisosPrevios || []).slice();
        // C5: primero se excluyen los ítems inservibles (cobertura < 60 % de
        // casos válidos); el listwise se aplica después sobre los restantes.
        let itemsUtiles = grupo.items.slice();
        const bajaCobertura = [];
        itemsUtiles = itemsUtiles.filter(it => {
            const validos = datos.reduce((s, f) => s + (Number.isFinite(parseFloat(f[it])) ? 1 : 0), 0);
            if (validos / datos.length < 0.6) { bajaCobertura.push(it); return false; }
            return true;
        });
        if (bajaCobertura.length) avisos.push(`Ítem(s) excluido(s) por cobertura insuficiente de datos (< 60 % de casos válidos): ${bajaCobertura.join(', ')}.`);
        if (itemsUtiles.length < 2) return { error: 'Se requieren al menos 2 ítems con cobertura suficiente.', avisos };
        const filas = [];
        datos.forEach(f => {
            const vals = itemsUtiles.map(it => parseFloat(f[it]));
            if (vals.every(Number.isFinite)) filas.push(vals);
        });
        const nExcluidos = datos.length - filas.length;
        if (nExcluidos > 0) avisos.push(`${nExcluidos} caso(s) excluido(s) por datos incompletos en los ítems (n efectivo = ${filas.length}).`);
        if (filas.length < 3) return { error: 'Se requieren al menos 3 casos completos.', avisos };

        // Columnas por ítem; se excluyen los constantes (varianza nula)
        let items = itemsUtiles.slice();
        let cols = items.map((_, j) => filas.map(fila => fila[j]));
        const constantes = [];
        for (let j = items.length - 1; j >= 0; j--) {
            if (this._varianza(cols[j]) <= 0) {
                constantes.push(items[j]);
                items.splice(j, 1); cols.splice(j, 1);
            }
        }
        if (constantes.length) avisos.push(`Ítem(s) sin variabilidad excluido(s) del cálculo: ${constantes.join(', ')}.`);
        const k = items.length;
        if (k < 2) return { error: 'Se requieren al menos 2 ítems con variabilidad.', avisos };

        // Covarianzas, correlaciones y total
        const vars = cols.map(c => this._varianza(c));
        // Puntuación total = suma de los ítems conservados
        const total = new Array(filas.length).fill(0);
        for (let i = 0; i < filas.length; i++) {
            let s = 0;
            for (let j = 0; j < k; j++) s += cols[j][i];
            total[i] = s;
        }
        const varTotal = this._varianza(total);
        if (varTotal <= 0) return { error: 'La puntuación total no presenta variabilidad.', avisos };

        const R = [], C = [];
        let sumaCov = 0, sumaCov2 = 0, sumaR = 0, rMin = 1, rMax = -1, negativos = [];
        for (let i = 0; i < k; i++) {
            R.push([]); C.push([]);
            for (let j = 0; j < k; j++) {
                const r = i === j ? 1 : this._cor(cols[i], cols[j]);
                const cv = i === j ? vars[i] : this._cov(cols[i], cols[j]);
                R[i].push(r); C[i].push(cv);
                if (i < j) {
                    sumaCov += cv; sumaCov2 += cv * cv; sumaR += r;
                    if (r < rMin) rMin = r;
                    if (r > rMax) rMax = r;
                    if (r < -0.05) negativos.push(`${items[i]}–${items[j]}`);
                }
            }
        }
        const nPares = k * (k - 1) / 2;
        const rMedia = sumaR / nPares;
        // C2: candidatos a ítem inverso = correlación media negativa con el resto
        const inversos = [];
        for (let i = 0; i < k; i++) {
            let s = 0;
            for (let j = 0; j < k; j++) if (j !== i) s += R[i][j];
            if (s / (k - 1) < -0.05) inversos.push(i);
        }
        let alfaRecod = null;
        if (inversos.length && inversos.length < k) {
            const colsR = cols.map((c, j) => {
                if (!inversos.includes(j)) return c;
                const mx = Math.max(...c), mn = Math.min(...c);
                return c.map(x => mx + mn - x);
            });
            const totR = filas.map((_, i) => colsR.reduce((s, c) => s + c[i], 0));
            const vT = this._varianza(totR);
            if (vT > 0) alfaRecod = (k / (k - 1)) * (1 - colsR.reduce((s, c) => s + this._varianza(c), 0) / vT);
        }
        if (negativos.length) avisos.push(`Correlaciones inter-ítem negativas (${negativos.slice(0, 4).join('; ')}${negativos.length > 4 ? '…' : ''}): posible(s) ítem(s) en sentido inverso sin recodificar${inversos.length ? ` (candidato(s): ${inversos.map(i => items[i]).join(', ')})` : ''}.${alfaRecod != null ? ` Si se recodifican, el alfa asciende a ${alfaRecod.toFixed(3)}; el alfa de la tabla está afectado por esta circunstancia.` : ''}`);

        // Alfa (bruto y estandarizado) y lambda 2 de Guttman
        const sumaVarItems = vars.reduce((s, v) => s + v, 0);
        const alfa = (k / (k - 1)) * (1 - sumaVarItems / varTotal);
        const alfaStd = (k * rMedia) / (1 + (k - 1) * rMedia);
        const lambda1 = 1 - sumaVarItems / varTotal;
        const lambda2 = lambda1 + Math.sqrt((k / (k - 1)) * (2 * sumaCov2)) / varTotal;

        // IC 95 % del alfa (Feldt, 1965)
        const n = filas.length;
        let icAlfa = null;
        if (alfa < 0) {
            avisos.push('El alfa resultó negativo: violación grave del supuesto de covariación positiva entre los ítems (revise posibles ítems inversos o la pertenencia de los ítems a un mismo constructo); no se reporta intervalo de confianza.');
        }
        if (alfa >= 0 && alfa < 1 && n > 3) {
            const fInf = this._qF(0.975, n - 1, (n - 1) * (k - 1));
            const fSup = this._qF(0.025, n - 1, (n - 1) * (k - 1));
            icAlfa = { inferior: 1 - (1 - alfa) * fInf, superior: 1 - (1 - alfa) * fSup };
        }

        // Omega total de McDonald: ejes principales iterados (1 factor) sobre R
        const om = this._omegaUnifactorial(R, k);
        const omega = (om && om.ok) ? om.valor : null;
        if (om && om.motivo) avisos.push(om.motivo);
        const spearmanBrown = (k === 2) ? (2 * rMedia) / (1 + rMedia) : null;

        // Análisis de ítems: r ítem-total corregida y alfa sin el elemento
        const itemsInfo = items.map((it, j) => {
            const resto = filas.map((fila, i) => total[i] - cols[j][i]);
            const rDrop = this._cor(cols[j], resto);
            // alfa sin el ítem
            let a = null;
            if (k > 2) {
                const varsSin = vars.filter((_, q) => q !== j);
                const totalSin = resto;
                const vTotSin = this._varianza(totalSin);
                a = vTotSin > 0 ? ((k - 1) / (k - 2)) * (1 - varsSin.reduce((s, v) => s + v, 0) / vTotSin) : null;
            }
            return {
                item: it,
                media: this._media(cols[j]),
                de: Math.sqrt(vars[j]),
                rItemTotal: rDrop,
                alfaSinItem: a,
                debil: rDrop < 0.30
            };
        });
        if (grupo.origen === 'prefijo' && (alfa < 0.50 || rMedia < 0.10)) {
            avisos.push('Agrupación heurística de dudosa entidad como escala (alfa < .50 o correlación inter-ítem media < .10): verifique que estos ítems midan un constructo común antes de reportar estos coeficientes.');
        }
        const debiles = itemsInfo.filter(x => x.debil).map(x => x.item);
        if (debiles.length) avisos.push(`Ítem(s) con correlación ítem-total corregida inferior a .30: ${debiles.join(', ')}; su aporte a la escala es reducido y conviene revisarlos.`);

        return {
            grupo: grupo.nombre, etiqueta: grupo.etiqueta, origen: grupo.origen,
            k, n, alfa, alfaRecod, alfaStd, icAlfa, omega, spearmanBrown, lambda2, rMedia, rMin, rMax,
            items: itemsInfo, avisos,
            dudosa: (grupo.origen === 'prefijo' && (alfa < 0.50 || rMedia < 0.10)),
            interpretacion: this.interpretar(alfa)
        };
    },

    _omegaUnifactorial(R, k) {
        if (k < 3) return { ok: false, motivo: null }; // k=2: se reporta Spearman-Brown
        // comunalidades iniciales: máxima |r| de cada fila
        let h2 = R.map((fila, i) => Math.max(...fila.map((r, j) => i === j ? 0 : Math.abs(r))));
        let cargas = null;
        for (let iter = 0; iter < 50; iter++) {
            const Rr = R.map((fila, i) => fila.map((r, j) => i === j ? h2[i] : r));
            // autovector dominante por el método de las potencias
            let v = new Array(k).fill(1 / Math.sqrt(k)), lambda = 0;
            for (let p = 0; p < 100; p++) {
                const w = Rr.map(fila => fila.reduce((s, r, j) => s + r * v[j], 0));
                const norma = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
                if (!(norma > 0)) return { ok: false, motivo: 'El ω no se reporta: la solución factorial no es estimable con estos datos.' };
                const vNuevo = w.map(x => x / norma);
                lambda = norma;
                v = vNuevo;
            }
            if (!(lambda > 0)) return { ok: false, motivo: 'El ω no se reporta: la solución factorial no es estimable con estos datos.' };
            // Signo global alineado (convención: suma positiva); el signo
            // INDIVIDUAL de cada carga se conserva para detectar ítems inversos.
            const signoGlobal = v.reduce((s, x) => s + x, 0) >= 0 ? 1 : -1;
            const nuevas = v.map(x => Math.sqrt(lambda) * x * signoGlobal);
            if (nuevas.some(l => l < -0.05)) {
                return { ok: false, motivo: 'El ω no se reporta: existen cargas factoriales de signo mixto (posible ítem inverso sin recodificar); recodifique los ítems señalados y repita el análisis.' };
            }
            const cambio = Math.max(...nuevas.map((c, i) => Math.abs(c * c - h2[i])));
            h2 = nuevas.map(c => Math.min(c * c, 0.999));
            cargas = nuevas;
            if (cambio < 1e-6) break;
        }
        const heywood = cargas.some(l => l * l >= 0.999);
        const sumaCargas = cargas.reduce((s, l) => s + l, 0);
        const sumaUnicidades = cargas.reduce((s, l) => s + (1 - Math.min(l * l, 0.999)), 0);
        const om = (sumaCargas ** 2) / ((sumaCargas ** 2) + sumaUnicidades);
        if (!(om > 0 && om <= 1)) return { ok: false, motivo: 'El ω no se reporta: la solución factorial produjo un valor fuera de rango.' };
        return { ok: true, valor: om, motivo: heywood ? 'La solución del ω presenta un caso Heywood (comunalidad en el límite); el valor debe tomarse como orientativo.' : null };
    },

    interpretar(alfa) {
        if (alfa >= 0.9) return 'excelente';
        if (alfa >= 0.8) return 'buena';
        if (alfa >= 0.7) return 'aceptable';
        if (alfa >= 0.6) return 'cuestionable';
        if (alfa >= 0.5) return 'pobre';
        return 'inaceptable';
    },

    // ---------- análisis completo ----------
    analizarTodo(datos) {
        const grupos = this.detectarGrupos(datos);
        const resultados = grupos.map(g => this.analizarGrupo(datos, g)).filter(r => !r.error || r.avisos.length);
        const validos = resultados.filter(r => !r.error);
        this._ultimo = { grupos: resultados, validos, fecha: new Date() };
        return this._ultimo;
    },

    // ---------- sección de la interfaz ----------
    mostrar(idContenedor, datos) {
        const cont = (typeof document !== 'undefined') ? document.getElementById(idContenedor) : null;
        if (!cont) return null;
        const res = this.analizarTodo(datos);
        if (!res.validos.length) {
            cont.style.display = 'none';
            cont.innerHTML = '';
            return res;
        }
        const fmt = x => Number.isFinite(x) ? x.toFixed(3) : '—';
        const filasResumen = res.validos.map(r => `
            <tr>
                <td><strong>${r.etiqueta}</strong></td>
                <td>${r.k}</td><td>${r.n}</td>
                <td><strong>${fmt(r.alfa)}</strong>${r.icAlfa ? `<br><span style="font-size:0.85em;">[${fmt(r.icAlfa.inferior)}, ${fmt(r.icAlfa.superior)}]</span>` : ''}</td>
                <td>${fmt(r.alfaStd)}</td>
                <td>${r.omega != null ? fmt(r.omega) : '—'}</td>
                <td>${fmt(r.lambda2)}</td>
                <td>${fmt(r.rMedia)}<br><span style="font-size:0.85em;">[${fmt(r.rMin)}, ${fmt(r.rMax)}]</span></td>
                <td>${r.interpretacion}</td>
            </tr>`).join('');
        const bloquesItems = res.validos.map(r => `
            <div class="result-box" style="margin-top: 0.75rem;">
                <h5 style="margin-bottom: 0.5rem; font-weight: 600;">Análisis de ítems: ${r.etiqueta}</h5>
                <table class="result-table">
                    <tr><th>Ítem</th><th>M</th><th>DE</th><th>r ítem-total corregida</th><th>α si se elimina</th></tr>
                    ${r.items.map(it => `<tr${it.debil ? ' style="background: rgba(180, 83, 9, 0.08);"' : ''}>
                        <td>${it.item}${it.debil ? ' ⚠️' : ''}</td>
                        <td>${it.media.toFixed(2)}</td><td>${it.de.toFixed(2)}</td>
                        <td>${fmt(it.rItemTotal)}</td>
                        <td>${it.alfaSinItem != null ? fmt(it.alfaSinItem) : '—'}</td>
                    </tr>`).join('')}
                </table>
                ${r.avisos.length ? `<p class="result-subtitle" style="color: #b45309; margin-top: 0.5rem;">${r.avisos.join(' ')}</p>` : ''}
            </div>`).join('');
        cont.innerHTML = `
            <div class="result-section">
                <h3 class="section-title">Fiabilidad y Consistencia Interna</h3>
                <p class="result-subtitle">Consistencia interna de las escalas detectadas en la base de datos. El alfa de Cronbach se reporta en su forma bruta (con intervalo de confianza del 95 % según el procedimiento de Feldt) y estandarizada; el omega total de McDonald se estima a partir de una solución unifactorial y la lambda 2 de Guttman constituye una cota inferior alternativa de la fiabilidad. Según George y Mallery (2003), valores de α ≥ .70 indican una fiabilidad aceptable, ≥ .80 buena y ≥ .90 excelente.</p>
                <div class="result-box" style="overflow-x: auto;">
                    <table class="result-table">
                        <tr><th>Escala</th><th>k</th><th>n</th><th>α [IC 95 %]</th><th>α estand.</th><th>ω</th><th>λ₂</th><th>r inter-ítem M [mín, máx]</th><th>Interpretación</th></tr>
                        ${filasResumen}
                    </table>
                </div>
                ${bloquesItems}
                <div class="result-box interpretation-box interpretation-box--hipotesis">
                    <h5 class="interpretation-title">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/></svg>
                        Interpretación
                    </h5>
                    <p class="interpretation-text">${this.redactarInterpretacion(res.validos)}</p>
                </div>
            </div>`;
        cont.style.display = 'block';
        return res;
    },

    // Redacción formal (registro de tesis) del conjunto de escalas
    redactarInterpretacion(validos) {
        const fmt = x => Number.isFinite(x) ? x.toFixed(3).replace(/^0\./, '.') : '—';
        const partes = validos.map(r => {
            const om = r.omega != null ? ` y un omega total de ${fmt(r.omega)}` : '';
            return `${r.etiqueta} obtuvo un alfa de Cronbach de ${fmt(r.alfa)}${r.icAlfa ? ` (IC 95 % [${fmt(r.icAlfa.inferior)}, ${fmt(r.icAlfa.superior)}])` : ''}${om}, lo que corresponde a una fiabilidad ${r.interpretacion}`;
        });
        const conAviso = validos.filter(r => r.avisos.length).length;
        let texto = `El análisis de consistencia interna se aplicó a ${validos.length === 1 ? 'la escala detectada' : `las ${validos.length} escalas detectadas`} en la base de datos. ${partes.join('; ')}. `;
        texto += `La convergencia entre el alfa y el omega respalda la estabilidad de las estimaciones, dado que el omega no exige el supuesto de tau-equivalencia que el alfa presupone. `;
        if (conAviso) texto += `Las observaciones señaladas en el análisis de ítems (correlaciones ítem-total reducidas o posibles ítems inversos) deben considerarse antes de interpretar las puntuaciones totales.`;
        return texto;
    },

    // ---------- bloques para el Word ----------
    // Devuelve { tablas: [{titulo, headers, filas, nota}], parrafos: [texto] }
    paraWord() {
        // C1: si los datos vigentes del analizador están disponibles, se
        // recalcula sobre ellos; el Word nunca arrastra una base anterior.
        try {
            if (typeof AnalizadorEstadistico !== 'undefined' && AnalizadorEstadistico.obtenerDatos) {
                const d = AnalizadorEstadistico.obtenerDatos();
                if (d && d.length) this.analizarTodo(d);
            }
        } catch (e) { /* se conserva el último análisis */ }
        const res = this._ultimo;
        if (!res || !res.validos.length) return null;
        const fmt = x => Number.isFinite(x) ? x.toFixed(3).replace(/^0\./, '.') : '—';
        const tablas = [];
        const parrafosExtra = [];
        const reportables = res.validos.filter(r => !r.dudosa);
        const excluidas = res.validos.filter(r => r.dudosa);
        if (!reportables.length) return null;
        if (excluidas.length) parrafosExtra.push(`Se excluyó del reporte ${excluidas.length === 1 ? 'una agrupación heurística' : excluidas.length + ' agrupaciones heurísticas'} de dudosa entidad como escala (${excluidas.map(r => r.etiqueta).join(', ')}), por presentar coeficientes alfa inferiores a .50 o correlaciones inter-ítem medias inferiores a .10.`);
        tablas.push({
            titulo: 'Fiabilidad y consistencia interna de las escalas',
            headers: ['Escala', 'k', 'n', 'α [IC 95 %]', 'α estandarizado', 'ω total', 'λ₂', 'r inter-ítem (M)'],
            filas: reportables.map(r => [
                r.etiqueta, r.k, r.n,
                `${fmt(r.alfa)}${r.icAlfa ? ` [${fmt(r.icAlfa.inferior)}, ${fmt(r.icAlfa.superior)}]` : ''}`,
                fmt(r.alfaStd),
                r.omega != null ? fmt(r.omega) : (r.spearmanBrown != null ? `SB = ${fmt(r.spearmanBrown)}` : '—'),
                fmt(r.lambda2), fmt(r.rMedia)
            ]),
            nota: 'α = alfa de Cronbach (IC 95 % según Feldt; se omite si α < 0); ω = omega total de McDonald (solución unifactorial; requiere al menos 3 ítems y cargas de signo homogéneo — con 2 ítems se reporta el coeficiente de Spearman-Brown, SB); λ₂ = lambda 2 de Guttman; k = número de ítems; n = casos completos. Si se detectan ítems en sentido inverso, el α informado está afectado y la nota de la escala indica el α tras la recodificación.'
        });
        reportables.slice(0, 6).forEach(r => {
            tablas.push({
                titulo: `Análisis de ítems de ${r.etiqueta}`,
                headers: ['Ítem', 'M', 'DE', 'r ítem-total corregida', 'α si se elimina el ítem'],
                filas: r.items.map(it => [
                    it.item, it.media.toFixed(2), it.de.toFixed(2), fmt(it.rItemTotal),
                    it.alfaSinItem != null ? fmt(it.alfaSinItem) : '—'
                ]),
                nota: r.avisos.length ? r.avisos.join(' ') : null
            });
        });
        const parrafos = [this.redactarInterpretacion(reportables), ...parrafosExtra];
        if (reportables.length > 6) parrafos.push(`Por razones de extensión, las tablas de análisis de ítems se presentan para las seis primeras escalas; los coeficientes globales de la tabla de fiabilidad comprenden la totalidad de las escalas detectadas.`);
        return { tablas, parrafos };
    }
};
if (typeof window !== 'undefined') window.Fiabilidad = Fiabilidad;
