// ========================================
// COMPARACIÓN ENTRE GRUPOS — StatSim Pro
// Flujo automático: evalúa supuestos (normalidad por grupo + Levene) y decide
// la prueba: 2 grupos → t de Student / t de Welch / U de Mann-Whitney;
// 3+ grupos → ANOVA de un factor / Kruskal-Wallis (+ post-hoc con Holm).
// Reporta tamaños del efecto: d de Cohen, r, η², ε².
// ========================================

const ComparacionGrupos = {

    // ---------- Distribuciones (aprox. numéricas estándar, verificadas) ----------
    _lgamma(x) { // Lanczos
        const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
            -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
        let a = x, tmp = x + 5.5;
        tmp -= (x + 0.5) * Math.log(tmp);
        let ser = 1.000000000190015;
        for (let j = 0; j < 6; j++) ser += g[j] / ++a;
        return -tmp + Math.log(2.5066282746310005 * ser / x);
    },
    _gammp(a, x) { // P(a,x) regularizada inferior
        if (x <= 0) return 0;
        if (x < a + 1) { // serie
            let ap = a, sum = 1 / a, del = sum;
            for (let n = 0; n < 200; n++) {
                ap++; del *= x / ap; sum += del;
                if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
            }
            return sum * Math.exp(-x + a * Math.log(x) - this._lgamma(a));
        }
        // fracción continua para Q y complementar
        let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
        for (let i = 1; i < 200; i++) {
            const an = -i * (i - a);
            b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
            c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
            d = 1 / d; const del = d * c; h *= del;
            if (Math.abs(del - 1) < 1e-12) break;
        }
        return 1 - Math.exp(-x + a * Math.log(x) - this._lgamma(a)) * h;
    },
    _betacf(a, b, x) {
        const qab = a + b, qap = a + 1, qam = a - 1;
        let c = 1, d = 1 - qab * x / qap;
        if (Math.abs(d) < 1e-300) d = 1e-300;
        d = 1 / d; let h = d;
        for (let m = 1; m <= 200; m++) {
            const m2 = 2 * m;
            let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
            d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
            c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
            d = 1 / d; h *= d * c;
            aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
            d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
            c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
            d = 1 / d; const del = d * c; h *= del;
            if (Math.abs(del - 1) < 1e-12) break;
        }
        return h;
    },
    _betainc(a, b, x) { // I_x(a,b) regularizada
        if (x <= 0) return 0; if (x >= 1) return 1;
        const bt = Math.exp(this._lgamma(a + b) - this._lgamma(a) - this._lgamma(b)
            + a * Math.log(x) + b * Math.log(1 - x));
        return x < (a + 1) / (a + b + 2)
            ? bt * this._betacf(a, b, x) / a
            : 1 - bt * this._betacf(b, a, 1 - x) / b;
    },
    _pT(t, df) { // bilateral
        return this._betainc(df / 2, 0.5, df / (df + t * t));
    },
    _pF(F, d1, d2) { // cola superior
        if (!(F > 0)) return 1;
        return this._betainc(d2 / 2, d1 / 2, d2 / (d2 + d1 * F));
    },
    _pChi2(x, k) { // cola superior
        if (!(x > 0)) return 1;
        return 1 - this._gammp(k / 2, x / 2);
    },
    _phi(z) {
        const t = 1 / (1 + 0.2316419 * Math.abs(z));
        const d = 0.3989423 * Math.exp(-z * z / 2);
        const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        return z > 0 ? 1 - p : p;
    },

    // ---------- Descriptivos básicos ----------
    _media(v) { return v.reduce((s, x) => s + x, 0) / v.length; },
    _var(v) { const m = this._media(v); return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1); },
    _mediana(v) { const s = [...v].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; },

    // Rangos con empates promediados sobre el conjunto combinado.
    _rangos(v) {
        const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
        const r = new Array(v.length);
        let i = 0;
        while (i < idx.length) {
            let j = i;
            while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
            const prom = (i + j) / 2 + 1;
            for (let k = i; k <= j; k++) r[idx[k][1]] = prom;
            i = j + 1;
        }
        return r;
    },

    // ---------- Pruebas ----------
    // t de Student (varianzas agrupadas) — 2 grupos.
    tStudent(a, b) {
        const n1 = a.length, n2 = b.length, m1 = this._media(a), m2 = this._media(b);
        const v1 = this._var(a), v2 = this._var(b);
        const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
        const t = (m1 - m2) / Math.sqrt(sp2 * (1 / n1 + 1 / n2));
        const gl = n1 + n2 - 2;
        const d = (m1 - m2) / Math.sqrt(sp2); // d de Cohen (DE agrupada)
        return { nombre: 't de Student', estadistico: t, gl, pValor: this._pT(Math.abs(t), gl),
                 efecto: { nombre: 'd de Cohen', valor: d } };
    },
    // t de Welch (varianzas desiguales) — 2 grupos.
    tWelch(a, b) {
        const n1 = a.length, n2 = b.length, m1 = this._media(a), m2 = this._media(b);
        const v1 = this._var(a), v2 = this._var(b);
        const se2 = v1 / n1 + v2 / n2;
        const t = (m1 - m2) / Math.sqrt(se2);
        const gl = se2 * se2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1)); // Satterthwaite
        const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
        const d = (m1 - m2) / Math.sqrt(sp2);
        return { nombre: 't de Welch', estadistico: t, gl, pValor: this._pT(Math.abs(t), gl),
                 efecto: { nombre: 'd de Cohen', valor: d } };
    },
    // U de Mann-Whitney (aprox. normal con corrección de empates y continuidad).
    mannWhitneyU(a, b) {
        const n1 = a.length, n2 = b.length, N = n1 + n2;
        const todos = [...a, ...b];
        const r = this._rangos(todos);
        const R1 = r.slice(0, n1).reduce((s, x) => s + x, 0);
        const U1 = R1 - n1 * (n1 + 1) / 2;
        const U = Math.min(U1, n1 * n2 - U1);
        const mu = n1 * n2 / 2;
        // Corrección de empates en la varianza.
        const conteo = new Map();
        todos.forEach(x => conteo.set(x, (conteo.get(x) || 0) + 1));
        let corr = 0;
        conteo.forEach(t => { if (t > 1) corr += t * t * t - t; });
        const sigma2 = n1 * n2 / 12 * ((N + 1) - corr / (N * (N - 1)));
        const z = sigma2 > 0 ? (Math.abs(U - mu) - 0.5) / Math.sqrt(sigma2) : 0;
        const p = 2 * (1 - this._phi(Math.abs(z)));
        return { nombre: 'U de Mann-Whitney', estadistico: U, z, gl: null, pValor: Math.min(1, p),
                 efecto: { nombre: 'r', valor: Math.abs(z) / Math.sqrt(N) } };
    },
    // ANOVA de un factor.
    anova(grupos) {
        const k = grupos.length, N = grupos.reduce((s, g) => s + g.length, 0);
        const gran = grupos.flat();
        const mG = this._media(gran);
        let ssb = 0, ssw = 0;
        grupos.forEach(g => {
            const m = this._media(g);
            ssb += g.length * (m - mG) ** 2;
            g.forEach(x => { ssw += (x - m) ** 2; });
        });
        const gl1 = k - 1, gl2 = N - k;
        const F = (ssb / gl1) / (ssw / gl2);
        return { nombre: 'ANOVA de un factor', estadistico: F, gl: [gl1, gl2],
                 pValor: this._pF(F, gl1, gl2),
                 efecto: { nombre: 'η²', valor: ssb / (ssb + ssw) } };
    },
    // Kruskal-Wallis (con corrección de empates).
    kruskalWallis(grupos) {
        const k = grupos.length, N = grupos.reduce((s, g) => s + g.length, 0);
        const todos = grupos.flat();
        const r = this._rangos(todos);
        let off = 0, H = 0;
        grupos.forEach(g => {
            const Ri = r.slice(off, off + g.length).reduce((s, x) => s + x, 0);
            H += Ri * Ri / g.length;
            off += g.length;
        });
        H = 12 / (N * (N + 1)) * H - 3 * (N + 1);
        const conteo = new Map();
        todos.forEach(x => conteo.set(x, (conteo.get(x) || 0) + 1));
        let corr = 0;
        conteo.forEach(t => { if (t > 1) corr += t * t * t - t; });
        const C = 1 - corr / (N * N * N - N);
        if (C > 0) H = H / C;
        const gl = k - 1;
        const eps2 = (H - k + 1) / (N - k); // ε² (Tomczak & Tomczak)
        return { nombre: 'Kruskal-Wallis', estadistico: H, gl, pValor: this._pChi2(H, gl),
                 efecto: { nombre: 'ε²', valor: Math.max(0, eps2) } };
    },
    // Levene (centrado en la media, como SPSS): ANOVA sobre |x − media del grupo|.
    levene(grupos) {
        const abs = grupos.map(g => { const m = this._media(g); return g.map(x => Math.abs(x - m)); });
        const a = this.anova(abs);
        return { nombre: 'Levene', estadistico: a.estadistico, gl: a.gl, pValor: a.pValor,
                 homogeneas: a.pValor > 0.05 };
    },

    // ---------- Interpretación de tamaños del efecto ----------
    _magnitud(nombre, v) {
        const a = Math.abs(v);
        if (nombre === 'd de Cohen') return a < 0.2 ? 'trivial' : a < 0.5 ? 'pequeño' : a < 0.8 ? 'mediano' : 'grande';
        if (nombre === 'r') return a < 0.1 ? 'trivial' : a < 0.3 ? 'pequeño' : a < 0.5 ? 'mediano' : 'grande';
        return a < 0.01 ? 'trivial' : a < 0.06 ? 'pequeño' : a < 0.14 ? 'mediano' : 'grande'; // η² / ε²
    },

    _normalidadDe(v) {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        if (!A) return { normal: true, prueba: '—', pValor: NaN };
        const r = v.length < 50 ? A.shapiroWilk(v) : A.kolmogorovSmirnov(v);
        return { normal: r.pValor > 0.05, prueba: v.length < 50 ? 'Shapiro-Wilk' : 'K-S (Lilliefors)', pValor: r.pValor };
    },

    // ---------- Motor: analiza una variable numérica según una de agrupación ----------
    // Devuelve un objeto rico con grupos, supuestos, decisión, prueba y post-hoc.
    analizar(colGrupo, colNum, etGrupo, etNum) {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        if (!datos.length) return { error: 'No hay datos cargados.' };

        // Agrupar los valores numéricos válidos por categoría.
        const mapa = new Map();
        datos.forEach(d => {
            const g = String(d[colGrupo] ?? '').trim();
            const x = +d[colNum];
            if (g && Number.isFinite(x)) {
                if (!mapa.has(g)) mapa.set(g, []);
                mapa.get(g).push(x);
            }
        });
        const excluidos = [];
        const entradas = [...mapa.entries()].filter(([nom, v]) => {
            if (v.length >= 3) return true;
            excluidos.push(`${nom} (n = ${v.length})`); return false;
        });
        if (entradas.length < 2) return { error: 'Se necesitan al menos 2 grupos con 3 o más casos cada uno.' };
        entradas.sort((a, b) => b[1].length - a[1].length);
        const nombres = entradas.map(e => e[0]);
        const grupos = entradas.map(e => e[1]);
        const k = grupos.length;

        // Supuestos: normalidad por grupo + homogeneidad de varianzas (Levene).
        const normalidad = grupos.map((g, i) => ({ grupo: nombres[i], n: g.length, ...this._normalidadDe(g) }));
        const todasNormales = normalidad.every(x => x.normal);
        const lev = this.levene(grupos);

        // Decisión del flujo (protocolo estándar de tesis).
        let prueba, rama, razon;
        if (k === 2) {
            if (todasNormales && lev.homogeneas) {
                prueba = this.tStudent(grupos[0], grupos[1]); rama = 'parametrica';
                razon = 'ambos grupos con distribución normal y varianzas homogéneas (Levene p > .05)';
            } else if (todasNormales) {
                prueba = this.tWelch(grupos[0], grupos[1]); rama = 'parametrica';
                razon = 'grupos normales pero con varianzas desiguales (Levene p ≤ .05): se aplica la corrección de Welch';
            } else {
                prueba = this.mannWhitneyU(grupos[0], grupos[1]); rama = 'noparametrica';
                razon = 'al menos un grupo se aparta de la normalidad: se emplea la alternativa por rangos';
            }
        } else {
            if (todasNormales && lev.homogeneas) {
                prueba = this.anova(grupos); rama = 'parametrica';
                razon = 'todos los grupos con distribución normal y varianzas homogéneas (Levene p > .05)';
            } else {
                prueba = this.kruskalWallis(grupos); rama = 'noparametrica';
                razon = todasNormales
                    ? 'varianzas desiguales entre grupos (Levene p ≤ .05): se emplea la alternativa robusta por rangos'
                    : 'al menos un grupo se aparta de la normalidad: se emplea la alternativa por rangos';
            }
        }
        prueba.significativa = prueba.pValor < 0.05;
        prueba.magnitud = this._magnitud(prueba.efecto.nombre, prueba.efecto.valor);

        // Post-hoc (solo 3+ grupos y global significativo): pares con Holm.
        let postHoc = null;
        if (k >= 3 && prueba.significativa && A && A.ajustarPValoresHolm) {
            const pares = [];
            for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
                const r = rama === 'parametrica' ? this.tWelch(grupos[i], grupos[j])
                                                 : this.mannWhitneyU(grupos[i], grupos[j]);
                pares.push({ a: nombres[i], b: nombres[j], ...r });
            }
            const holm = A.ajustarPValoresHolm(pares.map(p => p.pValor));
            postHoc = pares.map((p, i) => ({ ...p, pHolm: holm[i], sig: holm[i] < 0.05 }));
        }

        return {
            etGrupo: etGrupo || colGrupo, etNum: etNum || colNum, k,
            grupos: entradas.map(([nom, v]) => ({
                nombre: nom, n: v.length,
                media: this._media(v), de: Math.sqrt(this._var(v)), mediana: this._mediana(v)
            })),
            excluidos, normalidad, levene: lev, rama, razon, prueba, postHoc
        };
    },

    // ---------- UI en la página ----------
    montar() {
        const seccion = document.getElementById('cgSlot') || document.getElementById('analizador');
        if (!seccion || document.getElementById('cgCard')) return;
        const card = document.createElement('div');
        card.id = 'cgCard';
        card.className = 'card';
        card.style.cssText = 'margin-top:1.5rem;padding:1.25rem;border:1px solid var(--color-border,#e5e5e5);border-radius:0.6rem;';
        card.innerHTML = `
          <h3 style="margin:0 0 0.3rem;">⚖️ Comparación entre grupos</h3>
          <p class="help-text" style="margin:0 0 0.8rem;">Compara una variable numérica entre los grupos de una variable categórica. La app evalúa los supuestos (normalidad por grupo y homogeneidad de varianzas) y elige automáticamente la prueba adecuada: t de Student, t de Welch o U de Mann-Whitney (2 grupos); ANOVA de un factor o Kruskal-Wallis con post-hoc de Holm (3 o más).</p>
          <div style="display:flex;gap:0.8rem;flex-wrap:wrap;align-items:flex-end;">
            <div><label class="label" for="cgGrupo">Variable de agrupación</label><br>
              <select id="cgGrupo" class="input" style="min-width:12rem;"></select></div>
            <div><label class="label" for="cgNum">Variable numérica</label><br>
              <select id="cgNum" class="input" style="min-width:12rem;"></select></div>
            <button id="cgAnalizar" class="btn btn-primary" style="padding:0.5rem 1.1rem;">Comparar grupos</button>
          </div>
          <p class="help-text" style="margin:0.7rem 0 0; font-size:0.88em; line-height:1.5;">
            <b>¿Cómo usar esta sección?</b> Sirve para responder preguntas como «¿difiere la inteligencia emocional entre hombres y mujeres?» o «¿varía el puntaje según la carrera?».
            En <b>Variable de agrupación</b> elige una columna categórica que divide tu muestra en grupos (p. ej., Sexo, Carrera, Turno): define <i>quiénes se comparan</i>.
            En <b>Variable numérica</b> elige el puntaje que quieres contrastar entre esos grupos (p. ej., General_IE o una dimensión): define <i>qué se compara</i>.
            La app verificará los supuestos por ti y explicará qué prueba aplicó y por qué.</p>
          <div id="cgEstado" class="help-text" style="margin-top:0.5rem;"></div>
          <div id="cgResultado" style="margin-top:0.8rem;"></div>`;
        seccion.appendChild(card);
        const btn = document.getElementById('cgAnalizar');
        if (btn) btn.addEventListener('click', () => this._onAnalizar());
        this.actualizarSelects();
    },

    actualizarSelects() {
        const selG = document.getElementById('cgGrupo');
        const selN = document.getElementById('cgNum');
        if (!selG || !selN) return;
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        const cats = (typeof obtenerColumnasCategoricas === 'function') ? obtenerColumnasCategoricas(8) : [];
        const nums = (typeof obtenerColumnasNumericas === 'function' && datos.length) ? obtenerColumnasNumericas(datos) : [];
        selG.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
        selN.innerHTML = nums.map(c => `<option value="${c}">${c}</option>`).join('');
        const estado = document.getElementById('cgEstado');
        if (estado) estado.textContent = (!cats.length || !nums.length)
            ? 'Genera o carga una base de datos para habilitar la comparación.' : '';
    },

    _fp(p) { return !Number.isFinite(p) ? '—' : p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0\./, '.'); },
    _fx(x, d = 2) { return Number.isFinite(x) ? x.toFixed(d) : '—'; },

    _onAnalizar() {
        const colG = (document.getElementById('cgGrupo') || {}).value;
        const colN = (document.getElementById('cgNum') || {}).value;
        const out = document.getElementById('cgResultado');
        const estado = document.getElementById('cgEstado');
        if (!colG || !colN) { if (estado) estado.textContent = '⚠️ Selecciona ambas variables.'; return; }
        const R = this.analizar(colG, colN);
        if (R.error) { if (estado) estado.textContent = '⚠️ ' + R.error; if (out) out.innerHTML = ''; return; }
        if (estado) estado.textContent = '';
        this._ultimo = R;

        const fila = (cells, th) => `<tr>${cells.map(c => th ? `<th style="border:1px solid #ddd;padding:0.35rem 0.5rem;background:#f5f5f5;">${c}</th>` : `<td style="border:1px solid #ddd;padding:0.35rem 0.5rem;">${c}</td>`).join('')}</tr>`;
        const tabla = (rows) => `<table style="border-collapse:collapse;margin:0.4rem 0 0.8rem;font-size:0.92em;">${rows}</table>`;

        let html = `<h4 style="margin:0.4rem 0 0.2rem;">Descriptivos por grupo</h4>`
            + tabla(fila(['Grupo', 'n', 'Media', 'DE', 'Mediana'], true)
                + R.grupos.map(g => fila([g.nombre, g.n, this._fx(g.media), this._fx(g.de), this._fx(g.mediana)])).join(''));
        if (R.excluidos.length) html += `<p class="help-text">Grupos excluidos por tamaño insuficiente: ${R.excluidos.join(', ')}.</p>`;

        html += `<h4 style="margin:0.6rem 0 0.2rem;">Supuestos</h4>`
            + tabla(fila(['Grupo', 'n', 'Prueba', 'p', 'Decisión'], true)
                + R.normalidad.map(x => fila([x.grupo, x.n, x.prueba, this._fp(x.pValor), x.normal ? 'Normal' : 'No normal'])).join('')
                + fila(['<b>Levene (varianzas)</b>', '', `F(${R.levene.gl[0]}, ${R.levene.gl[1]})`, this._fp(R.levene.pValor), R.levene.homogeneas ? 'Homogéneas' : 'No homogéneas']));

        const P = R.prueba;
        const glTxt = Array.isArray(P.gl) ? `(${P.gl[0]}, ${P.gl[1]})` : (P.gl != null ? `(${this._fx(P.gl, 1)})` : '');
        html += `<h4 style="margin:0.6rem 0 0.2rem;">Prueba aplicada: ${P.nombre}</h4>`
            + `<p class="help-text" style="margin:0 0 0.3rem;">Elegida porque ${R.razon}.</p>`
            + tabla(fila(['Estadístico', 'gl', 'p', `Efecto (${P.efecto.nombre})`, 'Magnitud', 'Decisión'], true)
                + fila([this._fx(P.estadistico, 3), glTxt || '—', this._fp(P.pValor), this._fx(P.efecto.valor, 3), P.magnitud,
                        P.significativa ? '<b>Diferencias significativas</b>' : 'Sin diferencias significativas']));

        if (R.postHoc) {
            html += `<h4 style="margin:0.6rem 0 0.2rem;">Comparaciones por pares (post-hoc, corrección de Holm)</h4>`
                + tabla(fila(['Par', 'Prueba', 'Estadístico', 'p', 'p (Holm)', 'Decisión'], true)
                    + R.postHoc.map(p => fila([`${p.a} vs ${p.b}`, p.nombre, this._fx(p.estadistico, 3), this._fp(p.pValor), this._fp(p.pHolm), p.sig ? '<b>Significativa</b>' : 'No significativa'])).join(''));
        }
        html += `<p style="margin:0.4rem 0 0;">${this.interpretar(R)}</p>`;
        if (out) out.innerHTML = html;
    },

    // Interpretación en lenguaje llano (compartida con el Word).
    interpretar(R) {
        const P = R.prueba;
        const medias = R.grupos.map(g => `${g.nombre} (M = ${this._fx(g.media)}, DE = ${this._fx(g.de)})`).join(', ');
        let s = `Se comparó ${R.etNum} entre los ${R.k} grupos de ${R.etGrupo}: ${medias}. `
            + `Dado que ${R.razon}, se aplicó la prueba ${P.nombre}, que resultó `
            + (P.significativa
                ? `estadísticamente significativa (p ${this._fp(P.pValor)} < .05): existen diferencias reales entre los grupos en ${R.etNum}. `
                : `no significativa (p ${this._fp(P.pValor)} ≥ .05): los datos no evidencian diferencias entre los grupos en ${R.etNum}. `)
            + `El tamaño del efecto (${P.efecto.nombre} = ${this._fx(P.efecto.valor, 3)}) indica una magnitud ${P.magnitud}, `
            + `es decir, la relevancia práctica de la diferencia observada más allá de su significancia.`;
        if (R.postHoc) {
            const sig = R.postHoc.filter(p => p.sig);
            s += sig.length
                ? ` Las comparaciones por pares con corrección de Holm localizan las diferencias en: ${sig.map(p => `${p.a} vs ${p.b} (p Holm ${this._fp(p.pHolm)})`).join('; ')}.`
                : ' Sin embargo, tras la corrección de Holm ninguna comparación por pares alcanzó la significancia, lo que sugiere diferencias globales difusas más que contrastes marcados entre pares concretos.';
        }
        return s;
    },

    // ---------- Generación automática para el capítulo Word ----------
    // Recorre las variables categóricas (2-8 grupos) × las variables indicadas.
    generarParaWord(vars) {
        const cats = (typeof obtenerColumnasCategoricas === 'function') ? obtenerColumnasCategoricas(8) : [];
        const res = [];
        cats.forEach(cat => {
            (vars || []).forEach(([col, et]) => {
                const R = this.analizar(cat, col, cat, et);
                if (!R.error) res.push(R);
            });
        });
        return res;
    }
};

if (typeof window !== 'undefined') {
    window.ComparacionGrupos = ComparacionGrupos;
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => ComparacionGrupos.montar());
    } else {
        ComparacionGrupos.montar();
    }
}
