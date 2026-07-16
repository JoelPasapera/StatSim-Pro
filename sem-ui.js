// ============================================================================
// SEM-UI — CAPA PEDAGÓGICA, VISUAL Y DE DECISIÓN · StatSim Pro (Fase 2)
// ----------------------------------------------------------------------------
// Sobre el motor verificado (sem-motor.js) añade: (1) motor de decisión previo
// al ajuste; (2) interpretación pedagógica de cada índice con la plantilla
// qué-es / por-qué / cómo / qué-si-fuera-.82 / cómo-mejorar / errores-comunes /
// reporte-APA; (3) interfaz con sintaxis lavaan y ejemplos clicables;
// (4) diagrama de rutas SVG con coeficientes estandarizados; (5) comparación
// inicial–alternativo–final con Δχ² (anidados) o AIC; (6) estado para el Word.
// Umbrales de ajuste: Hu & Bentler (1999); reglas de n: Bentler & Chou (1987)
// y Kline (2016); estrategia en dos pasos: Anderson & Gerbing (1988).
// ============================================================================

const SEMUI = {

    // ═════════ (1) MOTOR DE DECISIÓN: ¿es adecuado usar SEM aquí? ═════════
    evaluarViabilidad(sintaxis) {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        const modelo = SEM.parsear(sintaxis);
        if (modelo.error) return { error: modelo.error };
        const lat = Object.keys(modelo.latentes);
        const veredictos = [];
        const V = (nivel, titulo, texto) => veredictos.push({ nivel, titulo, texto });

        // Recuento de variables observadas y de parámetros aproximados.
        const obs = new Set();
        Object.values(modelo.latentes).forEach(is => is.forEach(i => obs.add(i)));
        modelo.regresiones.forEach(r => { if (!lat.includes(r.y)) obs.add(r.y); r.xs.forEach(x => { if (!lat.includes(x)) obs.add(x); }); });
        const p = obs.size;
        const nombres = [...obs];
        const filas = datos.map(d => nombres.map(c => +d[c])).filter(f => f.every(Number.isFinite));
        const n = filas.length;
        let q = p; // varianzas de observadas
        Object.values(modelo.latentes).forEach(is => { q += (is.length - 1) + 1; }); // cargas libres + var factor
        modelo.regresiones.forEach(r => { q += r.xs.length; });
        q += modelo.covars.length;

        // — ¿Tamaño muestral suficiente? (Bentler & Chou, 1987: ≥5:1; Kline, 2016: ideal 10:1; n≥200 deseable)
        const ratio = q > 0 ? n / q : Infinity;
        if (n < 100) V('alto', `Muestra pequeña (n = ${n})`,
            `El SEM estima ~${q} parámetros a la vez y necesita información abundante: con n < 100 las soluciones se vuelven inestables (casos Heywood, no convergencia) y los índices de ajuste pierden calibración. Regla práctica: al menos 5 casos por parámetro (Bentler & Chou, 1987) y 10:1 como ideal (Kline, 2016). Tu razón actual es ${ratio.toFixed(1)}:1. Alternativa honesta: simplifica el modelo o usa regresión múltiple sobre puntajes sumados.`);
        else if (ratio < 5) V('alto', `Razón casos/parámetros insuficiente (${ratio.toFixed(1)}:1)`,
            `Con ~${q} parámetros y n = ${n} estás por debajo del mínimo 5:1 (Bentler & Chou, 1987). El riesgo: estimaciones erráticas y errores estándar poco confiables. Reduce parámetros (menos indicadores redundantes, fija covarianzas) o reúne más casos.`);
        else if (ratio < 10) V('aviso', `Razón casos/parámetros justa (${ratio.toFixed(1)}:1)`,
            `Superas el mínimo 5:1 pero no el ideal 10:1 (Kline, 2016). El modelo puede estimarse; interpreta los errores estándar con prudencia y evita añadir complejidad.`);
        else V('ok', `Tamaño muestral adecuado (${ratio.toFixed(1)} casos por parámetro)`,
            `n = ${n} para ~${q} parámetros supera la regla ideal de 10:1 (Kline, 2016): hay información suficiente para estimaciones estables.`);

        // — ¿Conviene CFA primero? (Anderson & Gerbing, 1988)
        const hayEstructural = modelo.regresiones.some(r => lat.includes(r.y) || r.xs.some(x => lat.includes(x)));
        if (lat.length && hayEstructural) V('aviso', 'Estrategia en dos pasos: valida la medición antes que la estructura',
            `Tu modelo mezcla medición (=~) y relaciones estructurales (~). Anderson y Gerbing (1988) recomiendan el enfoque en dos pasos: ajusta PRIMERO el CFA puro (solo las líneas =~, con los factores correlacionando libremente) y verifica que los constructos se miden bien; solo entonces añade las flechas estructurales. ¿Por qué? Si el paso estructural ajusta mal, no sabrás si falla tu teoría o tu instrumento — el dos-pasos separa ambos diagnósticos. Sugerencia: ejecuta aquí mismo la versión solo-CFA como «Modelo inicial» y la completa como «Modelo final».`);
        else if (lat.length && !hayEstructural) V('ok', 'CFA puro: el punto de partida correcto',
            'Un análisis factorial confirmatorio evalúa si tus indicadores miden los constructos que dices medir — exactamente el primer paso del enfoque de Anderson y Gerbing (1988).');

        // — ¿Basta con regresión o mediación? (parsimonia de técnica)
        if (!lat.length) {
            const esMediacion = modelo.regresiones.length === 2 &&
                modelo.regresiones.some(r1 => modelo.regresiones.some(r2 => r2 !== r1 && r2.xs.includes(r1.y)));
            if (esMediacion) V('aviso', 'Sin variables latentes: esto es un análisis de mediación',
                'Tu modelo solo usa variables observadas con estructura X → M → Y. El SEM lo estima correctamente (y aquí lo haremos), pero conviene saber que es equivalente al análisis de mediación clásico por regresiones — la ventaja del SEM aparece cuando incorporas latentes que descuentan el error de medición. Recuerda la lectura clave: efecto indirecto = a·b, y la identidad c = c′ + a·b.');
            else if (modelo.regresiones.length === 1) V('aviso', 'Sin latentes y una sola ecuación: la regresión múltiple basta',
                'Este modelo es exactamente una regresión múltiple — que StatSim ya ofrece con VIF, jerárquica y diagnósticos. El SEM dará los mismos coeficientes (lo verificamos matemáticamente); úsalo aquí solo si quieres los índices de ajuste o piensas ampliar a latentes.');
            else V('ok', 'Análisis de rutas (path analysis) con observadas',
                'Varias ecuaciones simultáneas entre observadas: el SEM es la herramienta natural para estimarlas de una vez y evaluar el ajuste global del sistema.');
        }

        // — ¿Indicadores suficientes por factor?
        for (const [F, is] of Object.entries(modelo.latentes)) {
            if (is.length < 3) V('alto', `El factor ${F} tiene solo ${is.length} indicador(es)`,
                `Con menos de 3 indicadores un factor aislado no está identificado (2 indicadores solo se sostienen si el factor se ancla a otros). ¿Por qué 3? Cada indicador aporta ecuaciones (covarianzas) y con 3 hay justo las necesarias para resolver cargas y varianzas. Añade un indicador o parcela ítems.`);
            else if (is.length === 3) V('aviso', `El factor ${F} está justo identificado (3 indicadores)`,
                'Con 3 indicadores el factor se estima de forma exacta (gl aportados = 0): el modelo puede ajustarse, pero ese factor no contribuye a PONER A PRUEBA el ajuste. Con 4+ indicadores el factor se vuelve falsable.');
        }

        const nivelGlobal = veredictos.some(v => v.nivel === 'alto') ? 'alto'
            : veredictos.some(v => v.nivel === 'aviso') ? 'aviso' : 'ok';
        return { veredictos, nivelGlobal, n, p, qAprox: q };
    },

    // ═════════ (2) PEDAGOGÍA POR ÍNDICE: plantilla de 7 preguntas ═════════
    _semaforo(clave, R) {
        const v = R[clave];
        const zonas = {
            CFI: [[0.95, '🟢'], [0.90, '🟡'], [-1, '🔴']],
            TLI: [[0.95, '🟢'], [0.90, '🟡'], [-1, '🔴']],
            RMSEA: [[0.06, '🟢'], [0.08, '🟡'], [99, '🔴']],
            SRMR: [[0.08, '🟢'], [0.10, '🟡'], [99, '🔴']]
        };
        if (clave === 'RMSEA' || clave === 'SRMR') {
            for (const [u, s] of zonas[clave]) if (v <= u) return s;
            return '🔴';
        }
        for (const [u, s] of zonas[clave] || []) if (v >= u) return s;
        return '🔴';
    },

    _pedagogiaIndice(clave, R) {
        const fx = (x, d = 3) => Number.isFinite(x) ? x.toFixed(d) : '—';
        const D = {
            chi2: {
                titulo: `χ²(${R.gl}) = ${fx(R.chi2, 2)}, p ${R.pChi2 < 0.001 ? '< .001' : '= ' + fx(R.pChi2)}`,
                que: 'Contrasta la hipótesis de ajuste PERFECTO: que la matriz de covarianzas que tu modelo implica sea idéntica a la observada. Es la única prueba estadística formal del SEM; los demás índices son descriptivos.',
                porque: 'Porque el SEM es, en el fondo, una teoría sobre covarianzas: tu diagrama de flechas PREDICE cuánto deben covariar las variables, y el χ² mide la discrepancia entre esa predicción y la realidad, escalada por el tamaño muestral: χ² = (n−1)·F_ML.',
                como: 'p > .05 significa que no puedes rechazar el ajuste perfecto (deseable). Pero cuidado con la lectura ingenua: al crecer n, discrepancias triviales se vuelven "significativas" — el χ² castiga el éxito de reclutar muestra.',
                sifuera: 'Un χ² significativo con n grande y buenos índices descriptivos NO condena el modelo; un χ² no significativo con n = 80 tampoco lo salva (falta potencia para detectar el desajuste).',
                mejorar: 'Revisa los residuos de covarianza mayores: señalan pares de variables cuya relación el modelo no reproduce (¿falta una carga cruzada teóricamente defendible? ¿una covarianza de errores por redacción similar de ítems?). Nunca agregues parámetros solo para bajar el χ².',
                errores: 'El error clásico: reportar solo "χ² significativo, mal modelo" o esconderlo. Las revistas esperan verlo SIEMPRE, con gl y p, aunque los índices descriptivos lleven el peso del argumento.',
                apa: `Reporte tipo: «El modelo mostró χ²(${R.gl}) = ${fx(R.chi2, 2)}, p ${R.pChi2 < 0.001 ? '< .001' : '= ' + fx(R.pChi2)}».`
            },
            CFI: {
                titulo: `CFI = ${fx(R.CFI)} ${this._semaforo('CFI', R)}`,
                que: 'Índice de ajuste comparativo (Bentler, 1990): sitúa tu modelo en una regla del 0 al 1 cuyo extremo inferior es el peor modelo concebible — el de independencia, donde nada covaría con nada.',
                porque: 'Porque "¿ajusta bien?" necesita un punto de comparación. El CFI responde: de toda la covariación que existía por explicar, ¿qué proporción recupera tu modelo? Y a diferencia del χ², es poco sensible al tamaño muestral.',
                como: '≥ .95 excelente, .90–.95 aceptable, < .90 problemático (Hu & Bentler, 1999). El tuyo: ' + fx(R.CFI) + '.',
                sifuera: 'Si fuera .82 significaría que tu modelo deja sin recuperar cerca de una quinta parte de la estructura de covariación — típicamente un factor mal definido, indicadores que pertenecen a otro constructo o una dimensionalidad equivocada. No se publica ni se parchea con un párrafo: se rediagnostica.',
                mejorar: 'Examina las cargas bajas (< .40) y los residuos grandes; considera si dos factores deberían ser uno (o al revés). El CFI sube cuando el MODELO mejora, no cuando se maquilla.',
                errores: 'Confundirlo con un R² (no lo es: compara contra la independencia, no mide varianza explicada) y redondearlo generosamente (.949 no es .95).',
                apa: `Se reporta con dos decimales junto al resto: «CFI = ${fx(R.CFI, 2)}».`
            },
            TLI: {
                titulo: `TLI = ${fx(R.TLI)} ${this._semaforo('TLI', R)}`,
                que: 'Índice de Tucker-Lewis (1973), pariente del CFI con un rasgo propio: penaliza la complejidad, premiando el ajuste POR grado de libertad.',
                porque: 'Porque un modelo puede "comprar" ajuste añadiendo parámetros. El TLI pregunta: ¿tu ajuste es bueno en relación con lo simple que es tu modelo? Por eso puede superar 1 o bajar de 0 — no está acotado.',
                como: 'Mismos umbrales prácticos que el CFI (≥ .95 excelente). Si el CFI luce bien y el TLI cae, sospecha de un modelo sobreparametrizado.',
                sifuera: 'Un TLI de .82 con CFI de .90 delataría que el ajuste aparente descansa en parámetros de más: el modelo es menos convincente de lo que el CFI sugiere.',
                mejorar: 'Elimina parámetros que no aportan (cargas triviales, covarianzas de errores injustificadas): el TLI premia la parsimonia.',
                errores: 'Alarmarse por TLI > 1 (es normal en modelos muy buenos con muestras grandes) o ignorar su divergencia respecto del CFI.',
                apa: `«TLI = ${fx(R.TLI, 2)}».`
            },
            RMSEA: {
                titulo: `RMSEA = ${fx(R.RMSEA)} [IC 90 %: ${fx(R.rmseaIC[0])}, ${fx(R.rmseaIC[1])}] ${this._semaforo('RMSEA', R)}`,
                que: 'Raíz del error cuadrático medio de aproximación (Steiger, 1990): cuánta discrepancia queda por GRADO DE LIBERTAD — el "error de aproximación por unidad de exigencia" del modelo, con su intervalo de confianza (Browne & Cudeck, 1993).',
                porque: 'Porque necesitamos un índice que reconozca que ningún modelo es perfecto y pregunte, en cambio, si se aproxima RAZONABLEMENTE — y que castigue a los modelos que ajustan solo porque apenas se comprometen (pocos gl).',
                como: '≤ .06 excelente, .06–.08 razonable, > .10 pobre (Hu & Bentler, 1999). El IC 90 % importa tanto como el punto: se desea que el límite inferior roce 0 y que el superior no supere .08.',
                sifuera: 'Un RMSEA de .82 no existe en la práctica (la escala rara vez pasa de .2); uno de .12 significaría un error de aproximación grande por cada grado de libertad: especificación errónea seria, no ruido muestral.',
                mejorar: 'Igual receta que el χ² (son primos): residuos grandes → reespecificación con justificación teórica. Ojo: con gl muy pequeños el RMSEA se vuelve inestable y pesimista.',
                errores: 'Reportarlo sin IC, o celebrarlo en modelos casi saturados donde apenas significa nada (con gl = 1 o 2, desconfía).',
                apa: `«RMSEA = ${fx(R.RMSEA, 3)}, IC 90 % [${fx(R.rmseaIC[0], 3)}, ${fx(R.rmseaIC[1], 3)}]».`
            },
            SRMR: {
                titulo: `SRMR = ${fx(R.SRMR)} ${this._semaforo('SRMR', R)}`,
                que: 'Residuo cuadrático medio estandarizado: la distancia PROMEDIO entre las correlaciones observadas y las que tu modelo reproduce — el índice más literal de todos.',
                porque: 'Porque al final del día la pregunta es tangible: ¿cuánto se equivocan, en promedio, las correlaciones predichas? Un SRMR de .05 dice: mis correlaciones implicadas erran en unas 5 centésimas de media.',
                como: '≤ .08 buen ajuste (Hu & Bentler, 1999). Combínalo siempre con un índice de la familia del χ² — Hu y Bentler proponen la regla conjunta SRMR ≤ .08 con CFI ≥ .95 o RMSEA ≤ .06.',
                sifuera: 'Un SRMR de .82 sería absurdo (correlaciones erradas casi por completo); uno de .12 indicaría que el patrón de correlaciones reproducido se aleja sistemáticamente del real.',
                mejorar: 'Es el índice que más directamente apunta al remedio: mira la matriz de residuos, localiza los pares peor reproducidos y pregúntate qué relación teórica olvidaste.',
                errores: 'Usarlo solo (es ciego a la parsimonia: el saturado siempre da 0) o compararlo entre muestras con varianzas muy distintas.',
                apa: `«SRMR = ${fx(R.SRMR, 3)}».`
            }
        };
        const d = D[clave];
        return `<details style="margin:0.35rem 0;"><summary style="cursor:pointer;"><b>${d.titulo}</b></summary>
          <div style="padding:0.4rem 0.8rem; font-size:0.92em;">
            <p style="margin:0.25rem 0;"><b>¿Qué es?</b> ${d.que}</p>
            <p style="margin:0.25rem 0;"><b>¿Por qué se calcula?</b> ${d.porque}</p>
            <p style="margin:0.25rem 0;"><b>¿Cómo se interpreta?</b> ${d.como}</p>
            <p style="margin:0.25rem 0;"><b>¿Y si fuera distinto?</b> ${d.sifuera}</p>
            <p style="margin:0.25rem 0;"><b>¿Cómo mejorar el modelo?</b> ${d.mejorar}</p>
            <p style="margin:0.25rem 0;"><b>Errores comunes:</b> ${d.errores}</p>
            <p style="margin:0.25rem 0;"><b>Reporte científico:</b> ${d.apa}</p>
          </div></details>`;
    },

    // ═════════ Coeficientes estandarizados aproximados (para el diagrama) ═════════
    _sdDe(R, v) {
        const i = R.nombresObs.indexOf(v);
        if (i >= 0) return Math.sqrt(R.S_obs[i][i]);
        const pv = R.parametros.find(p => p.nombre === `var (${v})` || p.nombre === `var residual (${v})`);
        return pv && pv.estimado > 0 ? Math.sqrt(pv.estimado) : 1;
    },
    _std(R, nombre, est) {
        let m;
        if ((m = nombre.match(/^(\S+) =~ (\S+)$/))) return est * this._sdDe(R, m[1]) / this._sdDe(R, m[2]);
        if ((m = nombre.match(/^(\S+) ~ (\S+)$/))) return est * this._sdDe(R, m[2]) / this._sdDe(R, m[1]);
        return est;
    },

    // ═════════ (4) DIAGRAMA DE RUTAS SVG ═════════
    diagramaSVG(R) {
        const lat = R.latentes || [];
        const modelo = SEM.parsear(R.sintaxis);
        const indicadores = [];
        Object.values(modelo.latentes).forEach(is => is.forEach(i => { if (!indicadores.includes(i)) indicadores.push(i); }));
        const estructurales = R.nombresObs.filter(v => !indicadores.includes(v));
        const W = Math.max(640, 110 * Math.max(indicadores.length, lat.length * 2, estructurales.length));
        const H = 150 + (lat.length ? 130 : 0) + (estructurales.length ? 120 : 0);
        const pos = {};
        indicadores.forEach((v, i) => { pos[v] = { x: (i + 0.5) * W / Math.max(indicadores.length, 1), y: 55 }; });
        lat.forEach((F, i) => { pos[F] = { x: (i + 0.5) * W / Math.max(lat.length, 1), y: 185 }; });
        estructurales.forEach((v, i) => { pos[v] = { x: (i + 0.5) * W / Math.max(estructurales.length, 1), y: lat.length ? 300 : 170 }; });
        const coef = {};
        R.parametros.forEach(p => { coef[p.nombre] = this._std(R, p.nombre, p.estimado); });
        let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;background:#fff;">
        <defs><marker id="fle" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 z" fill="#333"/></marker></defs>`;
        const flecha = (a, b, txt, dash) => {
            const A0 = pos[a], B0 = pos[b];
            if (!A0 || !B0) return '';
            const mx = (A0.x + B0.x) / 2, my = (A0.y + B0.y) / 2;
            return `<line x1="${A0.x}" y1="${A0.y}" x2="${B0.x}" y2="${B0.y}" stroke="#333" stroke-width="1.4" marker-end="url(#fle)" ${dash ? 'stroke-dasharray="5,4"' : ''}/>
            <rect x="${mx - 20}" y="${my - 9}" width="40" height="15" fill="#fff" opacity="0.85"/>
            <text x="${mx}" y="${my + 3}" text-anchor="middle" font-size="11" fill="#b03030">${txt}</text>`;
        };
        // Flechas latente → indicador y estructurales x → y
        Object.entries(modelo.latentes).forEach(([F, is]) => is.forEach((ind, k) => {
            const c = k === 0 ? this._std(R, `${F} =~ ${ind}`, 1) : coef[`${F} =~ ${ind}`];
            s += flecha(F, ind, (c ?? 1).toFixed(2));
        }));
        modelo.regresiones.forEach(r => r.xs.forEach(x => { s += flecha(x, r.y, (coef[`${r.y} ~ ${x}`] ?? 0).toFixed(2)); }));
        modelo.covars.forEach(([a, b]) => { s += flecha(a, b, '↔', true); });
        // Nodos: rectángulos (observadas) y elipses (latentes)
        R.nombresObs.forEach(v => { const P = pos[v]; if (!P) return;
            s += `<rect x="${P.x - 42}" y="${P.y - 16}" width="84" height="32" rx="4" fill="#eef4ff" stroke="#2E5BBA"/>
            <text x="${P.x}" y="${P.y + 4}" text-anchor="middle" font-size="12">${v}</text>`; });
        lat.forEach(F => { const P = pos[F];
            s += `<ellipse cx="${P.x}" cy="${P.y}" rx="52" ry="24" fill="#fff6e8" stroke="#c07820"/>
            <text x="${P.x}" y="${P.y + 4}" text-anchor="middle" font-size="12" font-weight="bold">${F}</text>`; });
        s += `<text x="${W - 6}" y="${H - 6}" text-anchor="end" font-size="10" fill="#777">Coeficientes estandarizados</text></svg>`;
        return s;
    },

    // Rasteriza el SVG a PNG (solo navegador) y lo guarda para el Word.
    _rasterizar(svg) {
        try {
            const img = new Image();
            const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
            img.onload = () => {
                const cv = document.createElement('canvas');
                cv.width = img.width * 1.5 || 960; cv.height = img.height * 1.5 || 480;
                const g = cv.getContext('2d');
                g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
                g.drawImage(img, 0, 0, cv.width, cv.height);
                SEM._ultimoDiagramaPNG = { url: cv.toDataURL('image/png'), w: cv.width, h: cv.height };
            };
            img.src = url;
        } catch (e) { /* el Word usará solo tablas */ }
    },

    // ═════════ (5) COMPARACIÓN DE MODELOS ═════════
    _aic(R) { return R.chi2 + 2 * R.q; }, // AIC relativo para ranking (Kline, 2016)
    _anidados(Ra, Rb) {
        return Ra.p === Rb.p && JSON.stringify([...Ra.nombresObs].sort()) === JSON.stringify([...Rb.nombresObs].sort()) && Ra.gl !== Rb.gl;
    },
    htmlComparacion() {
        const M = SEM._ultimos;
        if (M.length < 2) return '';
        const fx = (x, d = 3) => Number.isFinite(x) ? x.toFixed(d) : '—';
        let h = `<h4 style="margin:0.8rem 0 0.2rem;">📊 Comparación de modelos</h4>
        <table style="border-collapse:collapse;font-size:0.92em;">
        <tr>${['Modelo', 'χ²', 'gl', 'CFI', 'TLI', 'RMSEA', 'SRMR', 'AIC'].map(c => `<th style="border:1px solid #ddd;padding:0.3rem 0.5rem;background:#f5f5f5;">${c}</th>`).join('')}</tr>`;
        const mejorAIC = Math.min(...M.map(m => this._aic(m)));
        M.forEach(m => {
            const esMejor = Math.abs(this._aic(m) - mejorAIC) < 1e-9;
            h += `<tr>${[esMejor ? `<b>${m.etiquetaModelo} ★</b>` : m.etiquetaModelo, fx(m.chi2, 1), m.gl, fx(m.CFI, 3), fx(m.TLI, 3), fx(m.RMSEA, 3), fx(m.SRMR, 3), fx(this._aic(m), 1)]
                .map(c => `<td style="border:1px solid #ddd;padding:0.3rem 0.5rem;">${c}</td>`).join('')}</tr>`;
        });
        h += `</table>`;
        // Δχ² por pares consecutivos anidados; si no, AIC.
        for (let i = 1; i < M.length; i++) {
            const Ra = M[i - 1], Rb = M[i];
            const simple = Ra.gl > Rb.gl ? Ra : Rb, complejo = Ra.gl > Rb.gl ? Rb : Ra;
            if (this._anidados(Ra, Rb)) {
                const dChi = simple.chi2 - complejo.chi2, dGl = simple.gl - complejo.gl;
                const pD = (typeof ComparacionGrupos !== 'undefined' && dGl > 0) ? ComparacionGrupos._pChi2(Math.max(dChi, 0), dGl) : NaN;
                h += `<p style="margin:0.4rem 0 0;"><b>${simple.etiquetaModelo} vs ${complejo.etiquetaModelo} (anidados):</b> Δχ²(${dGl}) = ${fx(Math.max(dChi, 0), 2)}, p ${pD < 0.001 ? '< .001' : '= ' + fx(pD)}. ${pD < 0.05
                    ? `La mejora del modelo más complejo es real: sus parámetros adicionales compran ajuste genuino, no ruido. Preferible: <b>${complejo.etiquetaModelo}</b>.`
                    : `El modelo complejo NO mejora significativamente al simple: sus parámetros extra no se justifican y, por parsimonia, es preferible <b>${simple.etiquetaModelo}</b>.`} <i>¿Por qué Δχ²?</i> Cuando un modelo es un caso particular del otro, la diferencia de sus χ² sigue a su vez una χ² con gl = diferencia de gl — una prueba formal de si la complejidad extra vale la pena.</p>`;
            } else {
                h += `<p style="margin:0.4rem 0 0;"><b>${Ra.etiquetaModelo} vs ${Rb.etiquetaModelo}:</b> no son anidados (uno no es caso particular del otro), así que el Δχ² no aplica; se comparan por AIC — menor es mejor, y la estrella ★ marca al preferido.</p>`;
            }
        }
        return h;
    },

    // ═════════ (3) UI ═════════
    _ejemplos() {
        const nums = (typeof obtenerColumnasNumericas === 'function' && typeof AnalizadorEstadistico !== 'undefined')
            ? (obtenerColumnasNumericas(AnalizadorEstadistico.obtenerDatos() || []) || []) : [];
        const v = i => nums[i] || `x${i + 1}`;
        return [
            { nombre: 'CFA (1 factor)', sx: `Factor =~ ${v(0)} + ${v(1)} + ${v(2)} + ${v(3)}` },
            { nombre: 'Mediación X→M→Y', sx: `${v(1)} ~ ${v(0)}\n${v(2)} ~ ${v(1)} + ${v(0)}` },
            { nombre: 'SEM completo', sx: `F1 =~ ${v(0)} + ${v(1)} + ${v(2)}\nF2 =~ ${v(3)} + ${v(4)} + ${v(5)}\nF2 ~ F1` }
        ];
    },

    montar() {
        const slot = document.getElementById('cgSlot');
        if (!slot || document.getElementById('semCard')) return;
        const card = document.createElement('div');
        card.id = 'semCard';
        card.className = 'card';
        card.style.cssText = 'margin-top:1.5rem;padding:1.25rem;border:1px solid var(--color-border,#e5e5e5);border-radius:0.6rem;';
        card.innerHTML = `
          <h3 style="margin:0 0 0.3rem;">🏛️ Modelos de ecuaciones estructurales (SEM)</h3>
          <p class="help-text" style="margin:0 0 0.6rem;">La técnica que une medición y teoría: pon a prueba <b>a la vez</b> si tus ítems miden lo que dices (CFA) y si tus constructos se relacionan como tu hipótesis predice. Escribe el modelo con la sintaxis estándar (la misma de lavaan) o parte de un ejemplo:</p>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.4rem;">
            ${this._ejemplos().map((e, i) => `<button type="button" class="btn btn-outline" data-sem-ej="${i}" style="padding:0.25rem 0.7rem;font-size:0.85em;">${e.nombre}</button>`).join('')}
          </div>
          <textarea id="semSintaxis" class="input" rows="5" style="width:100%;font-family:monospace;" placeholder="Factor =~ item1 + item2 + item3&#10;resultado ~ Factor + edad&#10;item1 ~~ item2"></textarea>
          <p class="help-text" style="margin:0.3rem 0 0.5rem; font-size:0.85em;"><b>=~</b> «se mide con» (latente =~ indicadores) · <b>~</b> «es predicho por» · <b>~~</b> covarianza libre · <b>#</b> comentario.</p>
          <div style="display:flex; gap:0.8rem; flex-wrap:wrap; align-items:flex-end;">
            <div><label class="label" for="semEtiqueta" style="font-weight:normal;">¿Qué papel juega este modelo?</label><br>
              <select id="semEtiqueta" class="input"><option>Modelo inicial</option><option>Modelo alternativo</option><option>Modelo final</option></select></div>
            <button id="semEvaluar" class="btn btn-outline" style="padding:0.5rem 1rem;">1️⃣ ¿Es adecuado usar SEM aquí?</button>
            <button id="semAjustar" class="btn btn-primary" style="padding:0.5rem 1rem;">2️⃣ Ajustar modelo</button>
          </div>
          <div id="semDecision" style="margin-top:0.7rem;"></div>
          <div id="semOut" style="margin-top:0.7rem;"></div>`;
        slot.appendChild(card);
        card.querySelectorAll('[data-sem-ej]').forEach(b => b.addEventListener('click', () => {
            const e = this._ejemplos()[+b.dataset.semEj];
            const ta = document.getElementById('semSintaxis');
            if (ta) ta.value = e.sx;
        }));
        const bE = document.getElementById('semEvaluar');
        if (bE) bE.addEventListener('click', () => this._onEvaluar());
        const bA = document.getElementById('semAjustar');
        if (bA) bA.addEventListener('click', () => this._onAjustar());
    },

    _onEvaluar() {
        const sx = (document.getElementById('semSintaxis') || {}).value || '';
        const out = document.getElementById('semDecision');
        const E = this.evaluarViabilidad(sx);
        if (E.error) { if (out) out.innerHTML = `<p class="help-text">⚠️ ${E.error}</p>`; return; }
        const color = { ok: '#e8f6ee|#2e8b57', aviso: '#fff8e1|#f0ad4e', alto: '#fdecea|#c0392b' };
        let h = `<h4 style="margin:0 0 0.3rem;">Motor de decisión: ${E.nivelGlobal === 'ok' ? '🟢 adelante' : E.nivelGlobal === 'aviso' ? '🟡 adelante con cautelas' : '🔴 reconsidera antes de ajustar'}</h4>`;
        E.veredictos.forEach(v => {
            const [bg, bd] = color[v.nivel].split('|');
            h += `<div style="margin:0.35rem 0;padding:0.5rem 0.7rem;background:${bg};border-left:3px solid ${bd};border-radius:0.3rem;font-size:0.92em;"><b>${v.titulo}.</b> ${v.texto}</div>`;
        });
        if (out) out.innerHTML = h;
    },

    _onAjustar() {
        const sx = (document.getElementById('semSintaxis') || {}).value || '';
        const etiqueta = (document.getElementById('semEtiqueta') || {}).value || 'Modelo';
        const out = document.getElementById('semOut');
        if (out) out.innerHTML = '<p class="help-text">Estimando por máxima verosimilitud…</p>';
        const R = SEM.ajustar(sx, null, etiqueta);
        if (R.error) { if (out) out.innerHTML = `<p class="help-text">⚠️ ${R.error}</p>`; return; }
        const fx = (x, d = 3) => Number.isFinite(x) ? x.toFixed(d) : '—';
        const fp = p => !Number.isFinite(p) ? '—' : p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0\./, '.');
        const grupos = { coeficiente: 'Cargas y coeficientes estructurales', 'var/cov': 'Varianzas y covarianzas' };
        let h = `<h4 style="margin:0 0 0.2rem;">${etiqueta} — parámetros estimados (n = ${R.n})</h4>`;
        for (const [tipo, titulo] of Object.entries(grupos)) {
            const ps = R.parametros.filter(p => p.tipo === tipo);
            if (!ps.length) continue;
            h += `<p style="margin:0.4rem 0 0.1rem;"><b>${titulo}</b></p>
            <table style="border-collapse:collapse;font-size:0.92em;">
            <tr>${['Parámetro', 'Estimado', 'Estandarizado', 'EE', 'z', 'p'].map(c => `<th style="border:1px solid #ddd;padding:0.3rem 0.5rem;background:#f5f5f5;">${c}</th>`).join('')}</tr>`
            + ps.map(p => `<tr>${[p.nombre, fx(p.estimado), p.tipo === 'coeficiente' ? fx(this._std(R, p.nombre, p.estimado), 2) : '—', fx(p.se), fx(p.z, 2), fp(p.pValor)]
                .map(c => `<td style="border:1px solid #ddd;padding:0.3rem 0.5rem;">${c}</td>`).join('')}</tr>`).join('') + `</table>`;
        }
        h += `<h4 style="margin:0.7rem 0 0.2rem;">Ajuste global — y qué significa cada índice</h4>`;
        ['chi2', 'CFI', 'TLI', 'RMSEA', 'SRMR'].forEach(k => { h += this._pedagogiaIndice(k, R); });
        const svg = this.diagramaSVG(R);
        h += `<h4 style="margin:0.7rem 0 0.2rem;">Diagrama de rutas</h4><div style="overflow:auto;border:1px solid #eee;border-radius:0.4rem;">${svg}</div>`;
        h += this.htmlComparacion();
        if (out) out.innerHTML = h;
        SEM._ultimoDiagramaSVG = svg;
        this._rasterizar(svg);
    }
};

if (typeof window !== 'undefined') {
    window.SEMUI = SEMUI;
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => SEMUI.montar());
    else SEMUI.montar();
}
