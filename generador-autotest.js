// ============================================================================
// generador-autotest.js — autotest interno de GeneradorDatos (cárgalo cuando lo necesites:
// no forma parte de la generación). Desde la consola: GeneradorDatos.autotest()
// ============================================================================
Object.assign(GeneradorDatos, {
    // ============ AUTOTEST INTERNO ============
    // Verificación en segundos, sin tocar la interfaz. Desde la consola:
    //     GeneradorDatos.autotest()
    // Cada línea comprueba una propiedad que se rompió alguna vez y ya no debe
    // romperse: correlaciones exactas, fiabilidad autocalibrada, General derivado,
    // relleno intra-test, reparto sobre el General, matrices imposibles,
    // ítems invertidos, valores perdidos y exportación limpia.
    autotest(opciones = {}) {
        const n = opciones.n || 300, res = [];
        const ok = (nombre, cond, detalle = '') => { res.push({ nombre, ok: !!cond, detalle }); };
        const esNum = v => typeof v === 'number' && isFinite(v);
        const corr = (x, y) => { const pares = x.map((v, i) => [v, y[i]]).filter(q => esNum(q[0]) && esNum(q[1])); const a = pares.map(q => q[0]), b = pares.map(q => q[1]);
            const m = a.length, ma = a.reduce((s, v) => s + v, 0) / m, mb = b.reduce((s, v) => s + v, 0) / m; let sab = 0, saa = 0, sbb = 0;
            for (let i = 0; i < m; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; } return sab / Math.sqrt(saa * sbb); };
        const escala = (nombre, corto, prueba, k, media, de, alfa, extra = {}) => ({ nombre, nombreCorto: corto, prueba, tipo: 'dimension', numItems: k, media, desviacion: de, minimo: 1, maximo: 5, alfa, distribucion: 'normal', invertidos: 0, ...extra });
        const cfgBase = (extra = {}) => ({ tamanoMuestra: n, semilla: 2026, generarPercentiles: true, correlacionesExactas: true, indiceFiabilidad: 'alfa',
            variablesPorTest: { 'EQ-i': { variable: 'Inteligencia emocional', rIntra: 0.40 } },
            pruebas: [escala('Percepción', 'PE', 'EQ-i', 8, 24, 4, 0.80), escala('Comprensión', 'CE', 'EQ-i', 8, 24, 4, 0.85), escala('Regulación', 'RE', 'EQ-i', 8, 24, 4, 0.75),
                      escala('Estrés', 'ST', 'PSS', 10, 20, 6, 0.80, { minimo: 0, maximo: 4 })],
            sociodemograficos: [{ categoria: 'Edad', categoriaCorta: 'Edad', distribucion: 'normal', promedio: 16, desviacion: 1.5, minimo: 12, maximo: 20, decimales: 0 }],
            correlaciones: [], diferenciasGrupo: [], gruposPruebas: [], realismo: { pctPerdidos: 0, pctDescuidados: 0, pctDigitacion: 0 }, ...extra });
        const generar = cfg => { const g = new GeneradorDatos(); g.configuracion = JSON.parse(JSON.stringify(cfg)); g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas); return { g, d: g.generarBaseDatos().aObjetos() }; };
        const col = (d, k) => d.map(x => x[k]);
        try {
            // 1-2) correlación exacta + fiabilidad calibrada
            const { g: g1, d: d1 } = generar(cfgBase({ correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.40 }, { a: 'Inteligencia emocional — EQ-i', b: 'Estrés', r: -0.30 }] }));
            const rPE = corr(col(d1, 'Dimension_PE'), col(d1, 'Dimension_ST'));
            ok('correlación exacta pedida −0.40', Math.abs(rPE + 0.40) < 0.012, rPE.toFixed(3));
            const gCol = Object.keys(d1[0]).find(k => k.startsWith('General_'));
            const rG = corr(col(d1, gCol), col(d1, 'Dimension_ST'));
            ok('correlación sobre el General derivado −0.30', Math.abs(rG + 0.30) < 0.02, rG.toFixed(3));
            const rIn = corr(col(d1, 'Dimension_CE'), col(d1, 'Dimension_RE'));
            ok('relleno intra-test 0.40', Math.abs(rIn - 0.40) < 0.02, rIn.toFixed(3));
            const inf = g1.informePedidoObtenido(d1);
            const fiab = inf.filter(f => f.tipo === 'α');
            ok('fiabilidad autocalibrada (α) dentro de ±0.04 (≈2 EE)', fiab.length >= 3 && fiab.every(f => f.ok), fiab.map(f => `${f.pedido}→${f.obtenido}`).join(' '));
            ok('General = promedio ENTERO de las dimensiones', d1.every(x => !esNum(x[gCol]) || x[gCol] === Math.round((x.Dimension_PE + x.Dimension_CE + x.Dimension_RE) / 3)));
            // 3) matriz imposible detectada y corregida
            const { g: g2 } = generar(cfgBase({ correlaciones: [{ a: 'Percepción', b: 'Comprensión', r: 0.95 }, { a: 'Comprensión', b: 'Regulación', r: 0.95 }, { a: 'Percepción', b: 'Regulación', r: -0.90 }] }));
            ok('matriz imposible detectada, con tríada y matriz válida', g2.diagnosticoCorrelaciones.imposible && g2.diagnosticoCorrelaciones.triadas.length === 1 && g2._esDefinidaPositiva(g2.diagnosticoCorrelaciones.R));
            // 4) ítems invertidos: reflejados en bruto, total correcto tras recodificar
            const cfgInv = cfgBase(); cfgInv.pruebas[0].invertidos = 3; cfgInv.pruebas[0].media = 30;   // media de ítem 3.75: la reflexión desplaza la suma
            const { g: g3, d: d3 } = generar(cfgInv);
            const p0 = g3.configuracion.pruebas[0];
            const sumaRecod = x => { let s = 0; for (let j = 1; j <= 8; j++) s += g3._recodificar(p0, j, x[`PE${j}`]); return s; };
            ok('ítems invertidos: total = suma de ítems RECODIFICADOS', d3.every(x => Math.abs(sumaRecod(x) - x.Dimension_PE) < 0.01));
            const sumaBruta = x => { let s = 0; for (let j = 1; j <= 8; j++) s += x[`PE${j}`]; return s; };
            ok('ítems invertidos: la suma BRUTA no coincide (hay que recodificar)', d3.filter(x => Math.abs(sumaBruta(x) - x.Dimension_PE) > 0.5).length > d3.length * 0.8);
            const rInv = corr(col(d3, 'PE1'), col(d3, 'PE8'));
            ok('ítem invertido correlaciona NEGATIVO en bruto con uno directo', rInv < -0.05, rInv.toFixed(3));
            // 5) valores perdidos: regla del 80 % y exportación limpia
            const { g: g4, d: d4 } = generar(cfgBase({ realismo: { pctPerdidos: 8, mecanismoPerdidos: 'MCAR', pctDescuidados: 0, pctDigitacion: 0 } }));
            const faltan = x => { let f = 0; for (let j = 1; j <= 8; j++) if (!esNum(x[`PE${j}`])) f++; return f; };
            ok('regla del 80 %: total vacío solo si faltan >20 % de los ítems', d4.every(x => (faltan(x) >= 2) === !esNum(x.Dimension_PE)));
            ok('exportación: perdidos como celda vacía, nunca NaN', !/NaN/.test(g4.exportarCSV(',')));
            ok('exportación en formato español (;): perdidos vacíos, decimales con coma', !/NaN/.test(g4.exportarCSV(';')) && /;\d+,\d/.test(g4.exportarCSV(';')));
            ok('percentil vacío cuando el total falta', d4.filter(x => !esNum(x.Dimension_PE)).every(x => !esNum(x.PC_PE)));
            // 6) (A1) d por grupo sin sesgo de redondeo, con Media y DE totales intactas
            const cfgDif = cfgBase({ sociodemograficos: [{ categoria: 'Sexo', categoriaCorta: 'Sexo', distribucion: 'binaria', promedio: 0.5, desviacion: 0, minimo: null, maximo: null, decimales: 0 }],
                diferenciasGrupo: [{ cuantitativa: 'Estrés', agrupacion: 'Sexo', d: 0.8 }] });
            const { g: g5, d: d5 } = generar(cfgDif);
            const inf5 = g5.informePedidoObtenido(d5);
            const fd = inf5.find(f => f.tipo === 'd'), fDE = inf5.find(f => f.tipo === 'DE' && f.variable === 'Estrés');
            ok('(A1) d por grupo pedida 0.8 → obtenida', !!fd && Math.abs(parseFloat(fd.obtenido) - 0.8) <= 0.06, fd && fd.obtenido);
            ok('(A1) DE total de la escala con diferencias sigue siendo la pedida', !!fDE && Math.abs(parseFloat(fDE.obtenido) - 6) <= 0.3, fDE && fDE.obtenido);
            // 7) (A2) correlación exacta con forma asimétrica
            const cfgAs = cfgBase({ correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.40 }] });
            cfgAs.pruebas[0].distribucion = 'asimetrica'; cfgAs.pruebas[3].distribucion = 'asimetrica';
            const { d: d6 } = generar(cfgAs);
            const rAs = corr(col(d6, 'Dimension_PE'), col(d6, 'Dimension_ST'));
            ok('(A2) r −0.40 exacta entre dos escalas asimétricas', Math.abs(rAs + 0.40) < 0.02, rAs.toFixed(3));
            // 8) (A4) relleno intra-test con la tabla III vacía
            const { d: d7 } = generar(cfgBase({ correlaciones: [] }));
            const rIntraVacia = corr(col(d7, 'Dimension_CE'), col(d7, 'Dimension_RE'));
            ok('(A4) relleno intra-test 0.40 sin tabla III', Math.abs(rIntraVacia - 0.40) < 0.02, rIntraVacia.toFixed(3));
            // 10) sociodemográfico cuyo nombre corto NO coincide con su nombre: la columna
            //     se llama como la categoría; el informe (r, d) y el MAR deben encontrarla
            const cfgSoc = cfgBase({ sociodemograficos: [{ categoria: 'Edad del participante', categoriaCorta: 'EDP', distribucion: 'normal', promedio: 16, desviacion: 1.5, minimo: 12, maximo: 20, decimales: 0 },
                { categoria: 'Sexo del participante', categoriaCorta: 'SDP', distribucion: 'binaria', promedio: 0.5, desviacion: 0, minimo: null, maximo: null, decimales: 0 }],
                correlaciones: [{ a: 'Edad del participante', b: 'Estrés', r: 0.30 }], diferenciasGrupo: [{ cuantitativa: 'Edad del participante', agrupacion: 'Sexo del participante', d: 0.5 }],
                realismo: { pctPerdidos: 10, mecanismoPerdidos: 'MAR', pctDescuidados: 0, pctDigitacion: 0 } });
            const { g9, d9 } = (() => { const r = generar(cfgSoc); return { g9: r.g, d9: r.d }; })();
            const inf9 = g9.informePedidoObtenido(d9);
            ok('informe: r con sociodemográfico de nombre largo aparece y se cumple', inf9.some(f => f.tipo === 'r' && f.variable.startsWith('Edad del participante') && f.ok), (inf9.find(f => f.tipo === 'r') || {}).obtenido);
            ok('informe: d con sociodemográfico de nombre largo aparece', inf9.some(f => f.tipo === 'd' && f.variable === 'Edad del participante por Sexo del participante'));
            const faltanPE = x => { let f = 0; for (let j = 1; j <= 8; j++) if (!esNum(x[`PE${j}`])) f++; return f; };
            const ordenados = d9.slice().sort((a, b) => a['Edad del participante'] - b['Edad del participante']);
            const mitad = ordenados.length >> 1;
            const bajos = ordenados.slice(0, mitad).reduce((s, x) => s + faltanPE(x), 0), altos = ordenados.slice(mitad).reduce((s, x) => s + faltanPE(x), 0);
            ok('MAR: los perdidos se concentran en quienes puntúan bajo en la referencia', bajos > altos * 1.3, `${bajos} vs ${altos}`);
            // 11) correlación de un General con una de sus propias dimensiones (parte–todo):
            //     si no es alcanzable se avisa con la implicada; si lo es, se cumple
            const { g: g10, d: d10 } = generar(cfgBase({ correlaciones: [{ a: 'Inteligencia emocional — EQ-i', b: 'Percepción', r: 0.10 }] }));
            const lim10 = (g10.diagnosticoCorrelaciones.limitadas || []).find(l => l.a === 'Inteligencia emocional — EQ-i');
            const r10 = g10.informePedidoObtenido(d10).find(f => f.tipo === 'r');
            ok('General ↔ propia dimensión inalcanzable → aviso con el valor implicado (= el medido)', !!lim10 && !!r10 && Math.abs(lim10.alcanzable - parseFloat(r10.obtenido)) < 0.03, lim10 && r10 && `${lim10.alcanzable.toFixed(3)} vs ${r10.obtenido}`);
            const { g: g11, d: d11 } = generar(cfgBase({ correlaciones: [{ a: 'Inteligencia emocional — EQ-i', b: 'Percepción', r: 0.80 }] }));
            const r11 = g11.informePedidoObtenido(d11).find(f => f.tipo === 'r');
            ok('General ↔ propia dimensión alcanzable → se cumple', !!r11 && r11.ok, r11 && r11.obtenido);
            // 12) d sobre el General y d explícita sobre una de sus dimensiones, misma agrupación
            const cfg12 = cfgBase({ sociodemograficos: [{ categoria: 'Sexo', categoriaCorta: 'Sexo', distribucion: 'binaria', promedio: 0.5, desviacion: 0, minimo: null, maximo: null, decimales: 0 }],
                diferenciasGrupo: [{ cuantitativa: 'Inteligencia emocional — EQ-i', agrupacion: 'Sexo', d: -0.6 }, { cuantitativa: 'Percepción', agrupacion: 'Sexo', d: 0.5 }] });
            const { g: g12, d: d12 } = generar(cfg12);
            const dd12 = g12.informePedidoObtenido(d12).filter(f => f.tipo === 'd');
            ok('d del General y d de su dimensión, misma agrupación, ambas cumplidas', dd12.length === 2 && dd12.every(f => f.ok), dd12.map(f => `${f.pedido}→${f.obtenido}`).join(' '));
            // 13) d exacta también con forma asimétrica (driver en espacio de valor)
            const cfg13 = cfgBase({ sociodemograficos: [{ categoria: 'Sexo', categoriaCorta: 'Sexo', distribucion: 'binaria', promedio: 0.5, desviacion: 0, minimo: null, maximo: null, decimales: 0 }],
                correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.40 }], diferenciasGrupo: [{ cuantitativa: 'Percepción', agrupacion: 'Sexo', d: -1.1 }] });
            cfg13.pruebas[0].distribucion = 'asimetrica';   // continua: sin recorte Likert (el recorte atenúa la DE y con ella la d; limitación conocida)
            const { g: g13, d: d13 } = generar(cfg13);
            const inf13 = g13.informePedidoObtenido(d13);
            const d13d = inf13.find(f => f.tipo === 'd'), r13 = inf13.find(f => f.tipo === 'r');
            ok('d exacta con escala asimétrica (y su r intacta)', !!d13d && d13d.ok && !!r13 && r13.ok, `${d13d && d13d.obtenido} · r ${r13 && r13.obtenido}`);
            // 14) (B5) heterogeneidad de ítems: medias y cargas dispersas, cargas cruzadas,
            //     con α, Media, DE y r intactos; con «ninguna», ítems paralelos como antes
            const itemTotal = (d, p, j, colTotal) => corr(col(d, `${p}${j}`), col(d, colTotal));
            const mediasItems = (d, p, k) => Array.from({ length: k }, (_, j) => { const v = col(d, `${p}${j + 1}`); return v.reduce((a, b) => a + b, 0) / v.length; });
            const cfgHet = cfgBase({ tamanoMuestra: 1500, heterogeneidadItems: 'alta', correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.40 }] });
            cfgHet.pruebas[3].minimo = 1; cfgHet.pruebas[3].maximo = 5; cfgHet.pruebas[3].media = 30; cfgHet.pruebas[3].desviacion = 6;
            const { g: g14, d: d14 } = generar(cfgHet);
            const inf14 = g14.informePedidoObtenido(d14);
            const mST = mediasItems(d14, 'ST', 10), rST = Array.from({ length: 10 }, (_, j) => itemTotal(d14, 'ST', j + 1, 'Dimension_ST'));
            ok('(B5) «alta»: medias de ítem dispersas (ítems fáciles y difíciles)', Math.max(...mST) - Math.min(...mST) > 0.6, (Math.max(...mST) - Math.min(...mST)).toFixed(2));
            ok('(B5) «alta»: correlaciones ítem-total desiguales (cargas desiguales)', Math.max(...rST) - Math.min(...rST) > 0.12, (Math.max(...rST) - Math.min(...rST)).toFixed(3));
            ok('(B5) «alta»: α, Media, DE y r siguen siendo los pedidos', inf14.filter(f => ['α', 'Media', 'DE', 'r'].includes(f.tipo)).every(f => f.ok), inf14.filter(f => !f.ok).map(f => `${f.tipo} ${f.variable} ${f.obtenido}`).join('; '));
            const perfilPE = g14.perfilesItems.get(g14.configuracion.pruebas[0]);
            const cruzados = perfilPE.cruzadas.map(c => c.item), noCruzados = Array.from({ length: 8 }, (_, j) => j).filter(j => !cruzados.includes(j));
            const rCruz = cruzados.map(j => itemTotal(d14, 'PE', j + 1, `Dimension_${perfilPE.cruzadas.find(c => c.item === j).sigla}`));
            const rNo = noCruzados.map(j => { const s = perfilPE.cruzadas[0].sigla; return itemTotal(d14, 'PE', j + 1, `Dimension_${s}`); });
            const prom = a => a.reduce((x, y) => x + y, 0) / a.length;
            ok('(B5) «alta»: los ítems con carga cruzada correlacionan más con la otra dimensión', cruzados.length > 0 && prom(rCruz) - prom(rNo) > 0.08, `${prom(rCruz).toFixed(3)} vs ${prom(rNo).toFixed(3)}`);
            const { d: d15 } = generar(cfgBase({ tamanoMuestra: 1500, heterogeneidadItems: 'ninguna' }));
            const mPE = mediasItems(d15, 'PE', 8);
            ok('(B5) «ninguna»: ítems paralelos (medias iguales)', Math.max(...mPE) - Math.min(...mPE) < 0.25, (Math.max(...mPE) - Math.min(...mPE)).toFixed(2));
            // 15) nombres de columna duplicados: error claro en vez de sobrescritura silenciosa
            let mensajeDup = '';
            try { generar(cfgBase({ sociodemograficos: [{ categoria: 'PE1', categoriaCorta: 'X', distribucion: 'binaria', promedio: 0.5, desviacion: 1, minimo: null, maximo: null, decimales: 0 }] })); }
            catch (e) { mensajeDup = e.message; }
            ok('columna duplicada («PE1» como sociodemográfico y como ítem) → error que la nombra', /PE1/.test(mensajeDup) && /sociodemográfica/.test(mensajeDup), mensajeDup.slice(0, 60));
            // 16) (B6) mediación X → M → Y: a, b, c′ e indirecto exactos; y moderación con interacción
            const cfgMed = cfgBase({ tamanoMuestra: 1500, correlaciones: [{ a: 'Comprensión', b: 'Estrés', r: 0.15 }],
                modelos: [{ tipo: 'mediacion', x: 'Percepción', m: 'Regulación', y: 'Estrés', c1: 0.5, c2: -0.4, c3: -0.2 }] });
            const { g: g16, d: d16 } = generar(cfgMed);
            const inf16 = g16.informePedidoObtenido(d16);
            const coef = (tipo, patron) => inf16.find(f => f.tipo === tipo && (!patron || f.variable.includes(patron)));
            ok('(B6) mediación: a, b, c′ e indirecto obtenidos = pedidos', ['a', 'b', 'c′', 'a·b'].every(t => coef(t) && coef(t).ok), ['a', 'b', 'c′', 'a·b'].map(t => `${t}=${coef(t) && coef(t).obtenido}`).join(' '));
            ok('(B6) mediación: la r de la tabla III con otra variable sigue exacta', inf16.filter(f => f.tipo === 'r').every(f => f.ok), inf16.filter(f => f.tipo === 'r').map(f => f.obtenido).join(' '));
            const cfgMod = cfgBase({ tamanoMuestra: 2000, correlaciones: [{ a: 'Percepción', b: 'Comprensión', r: 0.30 }, { a: 'Estrés', b: 'Regulación', r: -0.35 }],
                modelos: [{ tipo: 'moderacion', x: 'Percepción', m: 'Comprensión', y: 'Estrés', c1: -0.30, c2: 0.20, c3: 0.25 }] });
            const { g: g17, d: d17 } = generar(cfgMod);
            const inf17 = g17.informePedidoObtenido(d17);
            const beta = t => inf17.find(f => f.tipo === t);
            ok('(B6) moderación: β₁, β₂ y β₃ (interacción) obtenidos = pedidos', ['β₁', 'β₂', 'β₃'].every(t => beta(t) && beta(t).ok), ['β₁', 'β₂', 'β₃'].map(t => `${t}=${beta(t) && beta(t).obtenido}`).join(' '));
            ok('(B6) moderación: Y conserva Media/DE y su r con una tercera variable', inf17.filter(f => (f.tipo === 'Media' || f.tipo === 'DE') && f.variable === 'Estrés').every(f => f.ok) && inf17.filter(f => f.tipo === 'r' && f.variable.includes('Regulación')).every(f => f.ok), inf17.filter(f => f.tipo === 'r').map(f => `${f.variable} ${f.obtenido}`).join('; '));
            // 17) (B7) medidas repetidas: estabilidad exacta, cambio global y por grupo, columnas y etiquetas
            const cfgRep = cfgBase({ tamanoMuestra: 1200, sociodemograficos: [{ categoria: 'Grupo', categoriaCorta: 'Gr', distribucion: 'binaria', promedio: 0.5, desviacion: 1, minimo: null, maximo: null, decimales: 0 }],
                correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.40 }], diferenciasGrupo: [{ cuantitativa: 'Estrés', agrupacion: 'Grupo', d: 0.3 }],
                medidasRepetidas: [{ variable: 'Estrés', ondas: 3, estabilidad: 0.7, cambio: -0.2, agrupacion: 'Grupo', cambioGrupo: -0.8 }, { variable: 'Percepción', ondas: 2, estabilidad: 0.6, cambio: 0.5, agrupacion: '', cambioGrupo: null }] });
            const { g: g18, d: d18 } = generar(cfgRep);
            const inf18 = g18.informePedidoObtenido(d18);
            const cols18 = Object.keys(d18[0]);
            ok('(B7) columnas de las ondas: ítems, total y percentil con sufijo _T2/_T3', ['ST1_T2', 'ST10_T3', 'Dimension_ST_T2', 'Dimension_ST_T3', 'PC_ST_T3', 'PE8_T2', 'Dimension_PE_T2'].every(c => cols18.includes(c)) && !cols18.includes('General_E_T2'), cols18.filter(c => /_T[23]$/.test(c)).length + ' columnas de onda');
            const rtt = inf18.filter(f => f.tipo === 'r_tt');
            ok('(B7) estabilidad T1→T2 y T1→T3 (AR(1)) exactas', rtt.length === 3 && rtt.every(f => f.ok), rtt.map(f => `${f.pedido}→${f.obtenido}`).join(' '));
            const camb = inf18.filter(f => f.tipo === 'd cambio' || f.tipo === 'interacción');
            ok('(B7) cambio global (Percepción) y por grupo (Estrés) e interacción tiempo × grupo', camb.length >= 5 && camb.every(f => f.ok), camb.map(f => `${f.pedido}→${f.obtenido}`).join(' '));
            ok('(B7) la r de la onda 2 con otra variable queda atenuada por la estabilidad', (() => { const r = corr(col(d18, 'Dimension_ST_T2'), col(d18, 'Dimension_PE')); return Math.abs(r - (-0.40 * 0.7)) < 0.03; })(), corr(col(d18, 'Dimension_ST_T2'), col(d18, 'Dimension_PE')).toFixed(3));
            ok('(B7) α de la onda 2 es el pedido y sus etiquetas existen', inf18.filter(f => f.tipo === 'α' && /\(T2\)/.test(f.variable)).every(f => f.ok) && !!g18.obtenerEtiquetas()['Dimension_ST_T2'], g18.obtenerEtiquetas()['Dimension_ST_T3']);
            // 18) (B8) estilos de respuesta, ítems de control y tiempo de respuesta
            const cfgB8 = cfgBase({ tamanoMuestra: 1000, realismo: { pctPerdidos: 0, pctDescuidados: 10, tipoDescuidado: 'mixto', marcarDescuidados: true, pctDigitacion: 0, pctAquiescencia: 20, pctExtrema: 20, intensidadEstilos: 'alta', tiempoMinutos: 12, itemsControl: 2 } });
            cfgB8.pruebas[2].invertidos = 4;   // Estrés (Likert 0–4) con ítems invertidos: la aquiescencia debe delatarse
            const { g: g19, d: d19 } = generar(cfgB8);
            const cols19 = Object.keys(d19[0]);
            ok('(B8) columnas: marcadores, Control_1/2 y Tiempo_respuesta_seg', ['Respuesta_descuidada', 'Estilo_respuesta', 'Control_1', 'Control_2', 'Tiempo_respuesta_seg'].every(c => cols19.includes(c)), cols19.slice(-6).join(','));
            const marcaE = col(d19, 'Estilo_respuesta'), marcaD = col(d19, 'Respuesta_descuidada');
            const nAq = marcaE.filter(v => v === 1).length, nEx = marcaE.filter(v => v === 2).length, nDs = marcaD.filter(v => v === 1).length;
            ok('(B8) 20 % aquiescentes, 20 % extremos y 10 % descuidados, sin solaparse', nAq === 200 && nEx === 200 && nDs === 100 && marcaE.every((v, i) => !(v && marcaD[i])), `${nAq} ${nEx} ${nDs}`);
            // aquiescencia: en los ítems INVERTIDOS de Estrés, la respuesta bruta media sube en los aquiescentes; en los extremos, más 0 y 4
            const brutaInv = quien => { let s = 0, c = 0; d19.forEach((f, i) => { if (quien(i)) for (let j = 7; j <= 10; j++) { s += f[`ST${j}`]; c++; } }); return s / c; };
            const mediaInvAq = brutaInv(i => marcaE[i] === 1), mediaInvNo = brutaInv(i => marcaE[i] === 0 && !marcaD[i]);
            ok('(B8) aquiescencia: sube la respuesta BRUTA de los ítems invertidos (≈ +1 punto)', mediaInvAq - mediaInvNo > 0.6, `${mediaInvAq.toFixed(2)} vs ${mediaInvNo.toFixed(2)}`);
            const pExtremos = quien => { let e = 0, c = 0; d19.forEach((f, i) => { if (quien(i)) for (let j = 1; j <= 10; j++) { const v = f[`ST${j}`]; if (v === 0 || v === 4) e++; c++; } }); return e / c; };
            ok('(B8) respuesta extrema: más respuestas en los extremos del rango', pExtremos(i => marcaE[i] === 2) > pExtremos(i => marcaE[i] === 0 && !marcaD[i]) + 0.2, `${pExtremos(i => marcaE[i] === 2).toFixed(2)} vs ${pExtremos(i => marcaE[i] === 0 && !marcaD[i]).toFixed(2)}`);
            const correctas = g19.controlesGenerados.map(x => x.correcta);
            const fallos = quien => { let f = 0, c = 0; d19.forEach((fila, i) => { if (quien(i)) { c++; if (fila.Control_1 !== correctas[0] || fila.Control_2 !== correctas[1]) f++; } }); return f / c; };
            ok('(B8) ítems de control: los descuidados fallan casi siempre y los atentos casi nunca', fallos(i => marcaD[i] === 1) > 0.7 && fallos(i => marcaD[i] === 0) < 0.12, `${fallos(i => marcaD[i] === 1).toFixed(2)} vs ${fallos(i => marcaD[i] === 0).toFixed(2)}`);
            const medianaT = quien => { const v = d19.filter((f, i) => quien(i)).map(f => f.Tiempo_respuesta_seg).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
            ok('(B8) tiempo: mediana ≈ 12 min en atentos y los descuidados tardan menos de la mitad', Math.abs(medianaT(i => marcaD[i] === 0 && !marcaE[i]) - 720) < 90 && medianaT(i => marcaD[i] === 1) < 0.6 * 720, `${medianaT(i => marcaD[i] === 0 && !marcaE[i])} vs ${medianaT(i => marcaD[i] === 1)} s`);
            ok('(B8) sin estilos ni controles, la base sale como antes', !Object.keys(generar(cfgBase({ tamanoMuestra: 100 })).d[0]).some(c => /^(Control_|Tiempo_|Estilo_)/.test(c)), '');
            // 19) (B9) sociodemográficos con contenido
            const sociosB9 = [
                { categoria: 'Sexo', categoriaCorta: 'S', distribucion: 'binaria', promedio: 0.4, desviacion: 1, minimo: null, maximo: null, decimales: 0, niveles: [{ codigo: 0, etiqueta: 'Femenino', proporcion: 0.6 }, { codigo: 1, etiqueta: 'Masculino', proporcion: 0.4 }], ordinal: false, fechaNacimiento: null, dependeDe: '', fuerza: 0 },
                { categoria: 'Grado', categoriaCorta: 'Gr', distribucion: 'categorica', promedio: 0, desviacion: 1, minimo: 1, maximo: 3, decimales: 0, niveles: [{ codigo: 1, etiqueta: 'Primaria', proporcion: 0.2 }, { codigo: 2, etiqueta: 'Secundaria', proporcion: 0.5 }, { codigo: 3, etiqueta: 'Superior', proporcion: 0.3 }], ordinal: true, fechaNacimiento: null, dependeDe: 'Sexo', fuerza: 0.5 },
                { categoria: 'Edad', categoriaCorta: 'E', distribucion: 'normal', promedio: 30, desviacion: 8, minimo: 18, maximo: 65, decimales: 0, niveles: null, ordinal: false, fechaNacimiento: '2026-06-30', dependeDe: '', fuerza: 0 }
            ];
            const cfgB9 = cfgBase({ tamanoMuestra: 500, sociodemograficos: sociosB9, diferenciasGrupo: [{ cuantitativa: 'Estrés', agrupacion: 'Sexo', d: 0.5 }, { cuantitativa: 'Percepción', agrupacion: 'Grado', d: -0.4 }] });
            const { g: g20, d: d20 } = generar(cfgB9);
            const inf20 = g20.informePedidoObtenido(g20.datosGenerados);   // con la base (los objetos llevan las etiquetas de texto)
            const objetos20 = g20.datosGenerados.aObjetos();
            const cuenta = (col, v) => objetos20.filter(f => f[col] === v).length;
            ok('(B9) proporciones EXACTAS y etiquetas de texto en la vista por objetos (Sexo 60/40)', cuenta('Sexo', 'Femenino') === 300 && cuenta('Sexo', 'Masculino') === 200, `${cuenta('Sexo', 'Femenino')}/${cuenta('Sexo', 'Masculino')}`);
            ok('(B9) categórica ordinal dependiente con proporciones exactas (20/50/30) y códigos 1–3 en el motor', cuenta('Grado', 'Primaria') === 100 && cuenta('Grado', 'Secundaria') === 250 && cuenta('Grado', 'Superior') === 150 && Array.from(g20.datosGenerados.columna('Grado').datos).every(v => v >= 1 && v <= 3), `${cuenta('Grado', 'Primaria')}/${cuenta('Grado', 'Secundaria')}/${cuenta('Grado', 'Superior')}`);
            const filaV = inf20.find(f => f.tipo === 'V');
            ok('(B9) asociación Grado según Sexo: V de Cramér obtenida ≈ esperada por el mecanismo', !!filaV && filaV.ok && parseFloat(filaV.obtenido) > 0.15, filaV ? `${filaV.pedido}→${filaV.obtenido}` : 'sin fila');
            ok('(B9) d exactas con una binaria 60/40 y una categórica con proporciones desiguales', inf20.filter(f => f.tipo === 'd').every(f => f.ok), inf20.filter(f => f.tipo === 'd').map(f => `${f.pedido}→${f.obtenido}`).join(' '));
            const edadOk = objetos20.every(f => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.FechaNac_E); if (!m) return false; const nac = Date.UTC(+m[1], +m[2] - 1, +m[3]); const ref = Date.UTC(2026, 5, 30); let edad = 2026 - (+m[1]); if (Date.UTC(2026, +m[2] - 1, +m[3]) > ref) edad--; return edad === f.Edad; });
            ok('(B9) fecha de nacimiento AAAA-MM-DD coherente con la edad en años cumplidos al 2026-06-30', edadOk && Object.keys(objetos20[0]).indexOf('FechaNac_E') === Object.keys(objetos20[0]).indexOf('Edad') + 1, objetos20[0].Edad + ' → ' + objetos20[0].FechaNac_E);
            const csv20 = g20.exportarCSV(';');
            ok('(B9) el CSV lleva etiquetas de texto y fechas ISO', csv20.split('\n')[1].includes('Femenino') || csv20.split('\n')[1].includes('Masculino'), csv20.split('\n')[1].slice(0, 60));
            ok('(B9) etiquetas del diccionario con los códigos y sus categorías', /0 = Femenino, 1 = Masculino/.test(g20.obtenerEtiquetas()['Sexo']) && /ordinal/.test(g20.obtenerEtiquetas()['Grado']) && !!g20.obtenerEtiquetas()['FechaNac_E'], g20.obtenerEtiquetas()['Grado']);
            // MAR con referencia elegida (Percepción, sentido altos) y MNAR
            const cfgMar = cfgBase({ tamanoMuestra: 1500, sociodemograficos: sociosB9, realismo: { pctPerdidos: 10, mecanismoPerdidos: 'MAR', referenciaMAR: 'Percepción', sentidoMAR: 'altos', pctDescuidados: 0, pctDigitacion: 0 } });
            const { g: g21, d: d21 } = generar(cfgMar);
            const perdidosPor = (rows, colRef, colsItem) => { const ord = rows.map((f, i) => [f[colRef], i]).filter(x => isFinite(x[0])).sort((a, b) => a[0] - b[0]); const q = Math.floor(ord.length / 4); const cnt = idxs => idxs.reduce((s, i) => s + colsItem.reduce((t, c) => t + (isNaN(rows[i][c]) ? 1 : 0), 0), 0); return [cnt(ord.slice(0, q).map(x => x[1])), cnt(ord.slice(-q).map(x => x[1]))]; };
            const itemsST = Array.from({ length: 10 }, (_, j) => `ST${j + 1}`);
            const [bajosP, altosP] = perdidosPor(d21, 'Dimension_PE', itemsST);
            ok('(B9) MAR con referencia elegida y sentido «altos»: pierden más quienes puntúan alto en Percepción', g21.referenciaMARUsada === 'Dimension_PE' && altosP > bajosP * 1.3, `${bajosP} vs ${altosP}`);
            const cfgMnar = cfgBase({ tamanoMuestra: 1500, sociodemograficos: sociosB9, realismo: { pctPerdidos: 10, mecanismoPerdidos: 'MNAR', referenciaMAR: '', sentidoMAR: 'altos', pctDescuidados: 0, pctDigitacion: 0 } });
            const { d: d22 } = generar(cfgMnar);
            const [bajosM, altosM] = perdidosPor(d22, 'Dimension_ST', itemsST);
            ok('(B9) MNAR: los ítems de Estrés se pierden más en quienes puntúan alto en el propio Estrés', altosM > bajosM * 1.3, `${bajosM} vs ${altosM}`);
            // 20) (C1) estructura factorial controlada
            const cargasPE = [0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50, 0.45].map(l => [l, 0, 0]);
            cargasPE[2][1] = 0.30;   // cruzada del ítem 3 sobre Comprensión
            const cargasCE = [0.70, 0.70, 0.70, 0.70, 0.70, 0.70, 0.70, 0.70].map(l => [0, l, 0]);
            const cargasRE = [0.60, 0.60, 0.60, 0.60, 0.60, 0.60, 0.60, 0.60].map(l => [0, 0, l]);
            const estructuraEQ = [{ prueba: 'EQ-i', modo: 'cargas', factores: ['Percepción', 'Comprensión', 'Regulación'], cargas: { 'Percepción': cargasPE, 'Comprensión': cargasCE, 'Regulación': cargasRE }, metodo: { carga: 0.30, sobre: 'invertidos' }, desajuste: 'ninguno' }];
            const cfgC1 = cfgBase({ tamanoMuestra: 1500, estructuras: estructuraEQ });
            cfgC1.pruebas[2].invertidos = 4;   // Regulación con 4 invertidos → factor de método
            const { g: g23, d: d23 } = generar(cfgC1);
            const inf23 = g23.informePedidoObtenido(g23.datosGenerados);
            const filaL = nombre => inf23.find(f => f.tipo === 'λ' && f.variable.startsWith(nombre));
            ok('(C1) cargas propias recuperadas por ejes principales (escalera 0.80→0.45, Likert 1–5)', filaL('Percepción') && filaL('Percepción').ok && filaL('Comprensión') && filaL('Comprensión').ok, [filaL('Percepción'), filaL('Comprensión')].map(f => f && `${f.pedido}→${f.obtenido}`).join(' | '));
            const filaX = inf23.find(f => f.tipo === 'λ×');
            ok('(C1) carga cruzada explícita 0.30 recuperada', !!filaX && filaX.ok, filaX ? `${filaX.pedido}→${filaX.obtenido}` : 'sin fila');
            const filaM = inf23.find(f => f.tipo === 'λmét');
            ok('(C1) factor de método sobre los invertidos de Regulación detectable', !!filaM && filaM.ok, filaM ? `${filaM.pedido}→${filaM.obtenido}` : 'sin fila');
            const filaA = inf23.filter(f => f.tipo === 'α' && /implícito/.test(f.variable));
            ok('(C1) fiabilidad implícita por las cargas = obtenida', filaA.length === 3 && filaA.every(f => f.ok), filaA.map(f => `${f.pedido}→${f.obtenido}`).join(' '));
            const filaS = inf23.find(f => f.tipo === 'SRMR');
            ok('(C1) SRMR pequeño sin desajuste y KMO adecuado', !!filaS && filaS.ok && inf23.some(f => f.tipo === 'KMO' && f.ok), filaS ? filaS.obtenido : 'sin fila');
            // la estructura en modo «alfa» respeta el α de la tabla I; ítems continuos; desajuste moderado sube el SRMR
            const estructuraAlfa = [{ prueba: 'PSS', modo: 'alfa', factores: ['Estrés'], cargas: { 'Estrés': [0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.6, 0.7, 0.8, 0.9].map(l => [l]) }, metodo: null, desajuste: 'moderado' }];
            const cfgC1b = cfgBase({ tamanoMuestra: 1500, estructuras: estructuraAlfa });
            cfgC1b.pruebas[3].minimo = null; cfgC1b.pruebas[3].maximo = null;   // Estrés continua
            const { g: g24 } = generar(cfgC1b);
            const inf24 = g24.informePedidoObtenido(g24.datosGenerados);
            const alfaImpl = inf24.find(f => f.tipo === 'α' && /Estrés/.test(f.variable));
            ok('(C1) modo «respetar el α»: el α implícito coincide con el de la tabla I (0.80) y se obtiene', !!alfaImpl && Math.abs(parseFloat(alfaImpl.pedido) - 0.80) < 0.01 && alfaImpl.ok, alfaImpl ? `${alfaImpl.pedido}→${alfaImpl.obtenido}` : 'sin fila');
            const srmrMod = inf24.find(f => f.tipo === 'SRMR');
            ok('(C1) desajuste moderado: SRMR obtenido ≈ esperado por los pares', !!srmrMod && srmrMod.ok && parseFloat(srmrMod.obtenido) > 0.03, srmrMod ? `${srmrMod.pedido}→${srmrMod.obtenido}` : 'sin fila');
            ok('(C1) los totales siguen siendo exactos con estructura (Media, DE y suma de ítems)', inf24.filter(f => f.tipo === 'Media' || f.tipo === 'DE').every(f => f.ok) && g24.datosGenerados.aObjetos().slice(0, 50).every(f => Math.abs(Object.keys(f).filter(c => /^ST\d+$/.test(c)).reduce((s, c) => s + g24._recodificar(cfgC1b.pruebas[3], parseInt(c.slice(2), 10), f[c]), 0) - f.Dimension_ST) < 0.011), '');
            ok('(C1) un test sin matriz sale idéntico a antes (misma semilla, misma base)', JSON.stringify(generar(cfgBase({ tamanoMuestra: 60 })).d[0]) === JSON.stringify(generar(cfgBase({ tamanoMuestra: 60, estructuras: [] })).d[0]), '');
            // 21) (C2/C3) desenlaces no continuos y puntos de corte
            const cfgC2 = cfgBase({ tamanoMuestra: 2000, correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.3 }],
                desenlaces: [
                    { nombre: 'Deserción', tipo: 'binario', prevalencia: 0.25, media: null, niveles: null, etiquetas: ['No', 'Sí'], predictores: [{ variable: 'Estrés', efecto: 2.0 }, { variable: 'Percepción', efecto: 0.6 }] },
                    { nombre: 'Faltas', tipo: 'conteo', prevalencia: null, media: 2.5, niveles: null, etiquetas: null, predictores: [{ variable: 'Estrés', efecto: 1.4 }] },
                    { nombre: 'Riesgo', tipo: 'ordinal', prevalencia: null, media: null, niveles: [{ codigo: 1, etiqueta: 'Bajo', proporcion: 0.5 }, { codigo: 2, etiqueta: 'Medio', proporcion: 0.3 }, { codigo: 3, etiqueta: 'Alto', proporcion: 0.2 }], etiquetas: null, predictores: [{ variable: 'Estrés', efecto: 1.8 }] }
                ],
                cortes: [{ variable: 'Estrés', etiquetas: ['Bajo', 'Medio', 'Alto'], cortes: [24, 36], porPercentil: false }, { variable: 'Percepción', etiquetas: ['Bajo', 'Alto'], cortes: [75], porPercentil: true }] });
            const { g: g25, d: d25 } = generar(cfgC2);
            const inf25 = g25.informePedidoObtenido(g25.datosGenerados);
            const fila = (tipo, texto) => inf25.find(f => f.tipo === tipo && (!texto || f.variable.includes(texto)));
            ok('(C2) binario: prevalencia exacta y OR por DE recuperados (2.0 y 0.6)', fila('prevalencia').ok && inf25.filter(f => f.tipo === 'OR' && f.variable.startsWith('Deserción')).every(f => f.ok), inf25.filter(f => f.tipo === 'OR' && f.variable.startsWith('Deserción')).map(f => `${f.pedido}→${f.obtenido}`).join(' ') + ' prev ' + fila('prevalencia').obtenido);
            ok('(C2) conteo: media e IRR recuperados', fila('media').ok && fila('IRR').ok, `media ${fila('media').obtenido}; IRR ${fila('IRR').pedido}→${fila('IRR').obtenido}`);
            ok('(C2) ordinal: proporciones exactas y OR de odds proporcionales', fila('%', 'Riesgo').ok && fila('OR', 'Riesgo').ok, `${fila('%', 'Riesgo').obtenido}; OR ${fila('OR', 'Riesgo').obtenido}`);
            ok('(C2) etiquetas de texto del desenlace binario y del ordinal en la vista por objetos', ['No', 'Sí'].includes(d25[0].Deserción) && ['Bajo', 'Medio', 'Alto'].includes(d25[0].Riesgo) && Number.isInteger(d25[0].Faltas), `${d25[0].Deserción} ${d25[0].Riesgo} ${d25[0].Faltas}`);
            ok('(C3) puntos de corte fijos: Nivel_ST con etiquetas coherentes con el total', d25.every(f => f.Nivel_ST === (f.Dimension_ST < 24 ? 'Bajo' : (f.Dimension_ST < 36 ? 'Medio' : 'Alto'))), g25.obtenerEtiquetas()['Nivel_ST']);
            ok('(C3) puntos de corte por percentil: 75/25 dentro de la masa de empates (totales enteros)', fila('niveles', 'Nivel_PE').ok && Math.abs(d25.filter(f => f.Nivel_PE === 'Alto').length - 500) <= g25.cortesGenerados[1].empateMax + 1, fila('niveles', 'Nivel_PE').obtenido);
            { g25.configuracion = JSON.parse(JSON.stringify(cfgBase({ tamanoMuestra: 80 }))); g25.configuracion.gruposPruebas = g25.agruparPruebas(g25.configuracion.pruebas); const b26 = g25.generarBaseDatos(); ok('(C3) una generación posterior sin cortes no arrastra niveles ni desenlaces al informe', !g25.informePedidoObtenido(b26).some(f => f.tipo === 'niveles' || f.tipo === 'OR') && !b26.nombres().some(c => /^Nivel_/.test(c)), ''); }
            // 22) (C4) interacción 2×2, anidamiento con CCI y crecimiento con pendientes aleatorias
            const sociosC4 = [
                { categoria: 'Sexo', categoriaCorta: 'S', distribucion: 'binaria', promedio: 0.5, desviacion: 1, minimo: null, maximo: null, decimales: 0 },
                { categoria: 'Programa', categoriaCorta: 'Pr', distribucion: 'binaria', promedio: 0.4, desviacion: 1, minimo: null, maximo: null, decimales: 0 },
                { categoria: 'Aula', categoriaCorta: 'Au', distribucion: 'categorica', promedio: 0, desviacion: 1, minimo: 1, maximo: 20, decimales: 0 }
            ];
            const cfgC4 = cfgBase({ tamanoMuestra: 2000, sociodemograficos: sociosC4,
                diferenciasGrupo: [{ tipo: 'd', cuantitativa: 'Estrés', agrupacion: 'Sexo', d: 0.4 }, { tipo: 'interaccion', cuantitativa: 'Estrés', agrupacion: 'Sexo', agrupacion2: 'Programa', d: 0.5 }, { tipo: 'icc', cuantitativa: 'Percepción', agrupacion: 'Aula', d: 0.20 }],
                medidasRepetidas: [{ variable: 'Comprensión', ondas: 3, estabilidad: 0.6, cambio: 0.4, agrupacion: '', cambioGrupo: null, modelo: 'crecimiento', dePendientes: 0.5, rInterceptoPendiente: -0.2 }] });
            const { g: g27 } = generar(cfgC4);
            const inf27 = g27.informePedidoObtenido(g27.datosGenerados);
            const f27 = tipo => inf27.find(f => f.tipo === tipo);
            ok('(C4) interacción Sexo × Programa: diferencia de diferencias exacta, con el efecto principal de Sexo intacto', f27('d×') && f27('d×').ok && inf27.filter(f => f.tipo === 'd').every(f => f.ok), `d× ${f27('d×') && f27('d×').pedido}→${f27('d×') && f27('d×').obtenido}; d ${inf27.filter(f => f.tipo === 'd').map(f => f.obtenido).join(' ')}`);
            ok('(C4) anidamiento en 20 aulas: CCI(1) por ANOVA ≈ 0.20 y Media/DE de Percepción intactas', f27('CCI') && f27('CCI').ok && inf27.filter(f => (f.tipo === 'Media' || f.tipo === 'DE') && f.variable === 'Percepción').every(f => f.ok), f27('CCI') && `${f27('CCI').pedido}→${f27('CCI').obtenido}`);
            const rtt27 = inf27.filter(f => f.tipo === 'r_tt'), de27 = inf27.filter(f => f.tipo === 'DE' && /Comprensión \(T3\)/.test(f.variable)), de1 = inf27.find(f => f.tipo === 'DE' && f.variable === 'Comprensión');
            ok('(C4) crecimiento: correlaciones entre ondas y DE creciente («abanico») implicadas por el modelo y cumplidas', rtt27.length === 2 && rtt27.every(f => f.ok) && de27.length === 1 && de27[0].ok && parseFloat(de27[0].pedido) > parseFloat(de1.pedido) * 1.03, `r ${rtt27.map(f => `${f.pedido}→${f.obtenido}`).join(' ')}; DE T1 ${de1 && de1.pedido} → T3 ${de27[0] && de27[0].pedido}→${de27[0] && de27[0].obtenido}`);
            // 23) (C4, revisión) reproducibilidad con CCI, efecto de aula compartido entre ondas, interacción desbalanceada sobre una continua
            const cfgC4b = cfgBase({ tamanoMuestra: 1200, sociodemograficos: sociosC4.map(s => s.categoria === 'Programa' ? Object.assign({}, s, { promedio: 0.3 }) : s).concat([{ categoria: 'Ingreso', categoriaCorta: 'In', distribucion: 'normal', promedio: 1500, desviacion: 600, minimo: 200, maximo: 6000, decimales: 0 }]),
                diferenciasGrupo: [{ tipo: 'icc', cuantitativa: 'Estrés', agrupacion: 'Aula', d: 0.25 }, { tipo: 'interaccion', cuantitativa: 'Ingreso', agrupacion: 'Sexo', agrupacion2: 'Programa', d: -0.6 }, { tipo: 'd', cuantitativa: 'Ingreso', agrupacion: 'Programa', d: 0.3 }],
                medidasRepetidas: [{ variable: 'Estrés', ondas: 2, estabilidad: 0.7, cambio: 0.2, agrupacion: '', cambioGrupo: null, modelo: 'ar1', dePendientes: 0, rInterceptoPendiente: 0 }] });
            const { g: g28, d: d28 } = generar(cfgC4b);
            const inf28 = g28.informePedidoObtenido(g28.datosGenerados);
            const g28b = new GeneradorDatos(); g28b.configuracion = JSON.parse(JSON.stringify(cfgC4b)); g28b.configuracion.gruposPruebas = g28b.agruparPruebas(g28b.configuracion.pruebas); g28b.generarBaseDatos(); const d28b = g28b.datosGenerados.aObjetos();
            ok('(C4) con CCI, la misma semilla reproduce la misma base (y una segunda generación en la misma instancia también)', JSON.stringify(d28[5]) === JSON.stringify(d28b[5]) && JSON.stringify(generar(cfgC4b).d[5]) === JSON.stringify(d28[5]), '');
            const mediaAula = (col) => { const m = new Map(); d28.forEach(f => { if (!m.has(f.Aula)) m.set(f.Aula, []); m.get(f.Aula).push(f[col]); }); return Array.from(m.values()).map(v => v.reduce((s, x) => s + x, 0) / v.length); };
            const rAulas = g28._corr(mediaAula('Dimension_ST'), mediaAula('Dimension_ST_T2'));
            ok('(C4) el efecto de aula se comparte entre las ondas T1 y T2 (medias de aula muy correlacionadas)', rAulas > 0.8, `r entre medias de aula T1/T2 = ${rAulas.toFixed(2)}`);
            const fInt = inf28.find(f => f.tipo === 'd×'), fD = inf28.find(f => f.tipo === 'd' && /Ingreso por Programa/.test(f.variable));
            ok('(C4) interacción desbalanceada (Programa 30 %) sobre una sociodemográfica continua, con su efecto principal', fInt && fInt.ok && fD && fD.ok, `${fInt && fInt.pedido}→${fInt && fInt.obtenido}; d ${fD && fD.pedido}→${fD && fD.obtenido}`);
            // 24) (C5) escala dicotómica: KR-20, dificultades y DE implícita
            const dific = [0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2];
            const cfgC5 = cfgBase({ tamanoMuestra: 2000, correlaciones: [{ a: 'Conocimientos', b: 'Percepción', r: 0.35 }] });
            cfgC5.pruebas.push({ nombre: 'Conocimientos', nombreCorto: 'CO', prueba: 'Examen', tipo: 'dimension', numItems: 15, media: 9, desviacion: 2, alfa: 0.80, minimo: 0, maximo: 1, distribucion: 'normal', invertidos: 0, dificultades: dific });
            const { g: g29, d: d29 } = generar(cfgC5);
            const inf29 = g29.informePedidoObtenido(g29.datosGenerados);
            const pC5 = g29.configuracion.pruebas.find(p => p.nombre === 'Conocimientos');
            const f29 = tipo => inf29.find(f => f.tipo === tipo && /Conocimientos/.test(f.variable));
            ok('(C5) dicotómica: Media = Σ dificultades (8.25) y DE derivada del KR-20 y las dificultades, ambas cumplidas', Math.abs(pC5.media - 8.25) < 1e-9 && Math.abs(pC5.desviacion - Math.sqrt(dific.reduce((s, v) => s + v * (1 - v), 0) / (1 - 0.8 * 14 / 15))) < 1e-9 && inf29.filter(f => (f.tipo === 'Media' || f.tipo === 'DE') && f.variable === 'Conocimientos').every(f => f.ok), `M ${pC5.media} DE ${pC5.desviacion.toFixed(2)}`);
            ok('(C5) KR-20 obtenido = pedido (0.80)', f29('KR-20') && f29('KR-20').ok, f29('KR-20') && `${f29('KR-20').pedido}→${f29('KR-20').obtenido}`);
            ok('(C5) dificultades por ítem recuperadas (0.90…0.20) y discriminación adecuada', f29('p') && f29('p').ok && f29('disc') && f29('disc').ok, `${f29('p') && f29('p').obtenido} | ${f29('disc') && f29('disc').obtenido}`);
            ok('(C5) los ítems son 0/1 y la r con otra escala sigue exacta', d29.every(f => [0, 1].includes(f.CO1) && [0, 1].includes(f.CO15)) && inf29.filter(f => f.tipo === 'r').every(f => f.ok), inf29.filter(f => f.tipo === 'r').map(f => f.obtenido).join(' '));
            const cfgC5b = cfgBase({ tamanoMuestra: 100 }); cfgC5b.pruebas.push({ nombre: 'Síntomas', nombreCorto: 'SI', prueba: 'Lista', tipo: 'dimension', numItems: 10, media: 3, desviacion: 5, alfa: 0.75, minimo: 0, maximo: 1, distribucion: 'normal', invertidos: 0, dificultades: null });
            { const gv = new GeneradorDatos(); gv.configuracion = JSON.parse(JSON.stringify(cfgC5b)); gv.configuracion.gruposPruebas = gv.agruparPruebas(gv.configuracion.pruebas); const v = gv.validarConfiguracion(); ok('(C5) validación: avisa de que la DE la fijan las dificultades y el KR-20 (y no usa los avisos Likert)', v.advertencias.some(a => /Síntomas.*la DE la fijan/.test(a)) && !v.advertencias.some(a => /Síntomas.*medio punto/.test(a)), v.advertencias.filter(a => /Síntomas/.test(a)).map(a => a.slice(0, 80)).join(' | ')); }
            // 25) (C6) relación curvilínea (U invertida) con X normal y con X asimétrica; Y conserva Media/DE y su r con terceras
            const cfgC6 = cfgBase({ tamanoMuestra: 1500, correlaciones: [{ a: 'Estrés', b: 'Regulación', r: -0.30 }], modelos: [{ tipo: 'curvilinea', x: 'Percepción', m: 'Percepción', y: 'Estrés', c1: 0.20, c2: -0.30, c3: 0 }] });
            const { g: g30 } = generar(cfgC6);
            const inf30 = g30.informePedidoObtenido(g30.datosGenerados);
            const b30 = t => inf30.find(f => f.tipo === t && /Curvilínea/.test(f.variable));
            ok('(C6) curvilínea: β₁ = 0.20 y β₂ = −0.30 recuperados por regresión sobre X y X²', b30('β₁') && b30('β₁').ok && b30('β₂') && b30('β₂').ok, `${b30('β₁') && b30('β₁').obtenido} ${b30('β₂') && b30('β₂').obtenido}`);
            ok('(C6) curvilínea: Media y DE de Y intactas, r(X,Y) = β₁ y r con una tercera variable exacta', inf30.filter(f => (f.tipo === 'Media' || f.tipo === 'DE') && f.variable === 'Estrés').every(f => f.ok) && inf30.filter(f => f.tipo === 'r').every(f => f.ok) && Math.abs(corr(col(g30.datosGenerados.aObjetos(), 'Dimension_PE'), col(g30.datosGenerados.aObjetos(), 'Dimension_ST')) - 0.20) < 0.03, inf30.filter(f => f.tipo === 'r').map(f => `${f.pedido}→${f.obtenido}`).join(' '));
            const cfgC6b = cfgBase({ tamanoMuestra: 1500, modelos: [{ tipo: 'curvilinea', x: 'Percepción', m: 'Percepción', y: 'Estrés', c1: 0.20, c2: -0.30, c3: 0 }] });
            cfgC6b.pruebas[0].distribucion = 'asimetrica';
            const { g: g31 } = generar(cfgC6b);
            const inf31 = g31.informePedidoObtenido(g31.datosGenerados);
            const b31 = t => inf31.find(f => f.tipo === t && /Curvilínea/.test(f.variable));
            ok('(C6) curvilínea con X asimétrica: coeficientes recuperados igualmente', b31('β₁') && b31('β₁').ok && b31('β₂') && b31('β₂').ok, `${b31('β₁') && b31('β₁').obtenido} ${b31('β₂') && b31('β₂').obtenido}`);
            { const gv = new GeneradorDatos(); gv.configuracion = JSON.parse(JSON.stringify(cfgC6b)); gv.configuracion.modelos[0].c2 = -0.6; gv.configuracion.gruposPruebas = gv.agruparPruebas(gv.configuracion.pruebas); const v = gv.validarConfiguracion(); ok('(C6) validación: con X asimétrica y β₂ = −0.6 el R² real supera el 98 % y se rechaza', v.errores.some(e => /Curvilínea.*varianza de X²/.test(e)), v.errores.filter(e => /Curvilínea/.test(e)).map(e => e.slice(0, 90)).join(' | ')); }
            // 26) (C7) concordancia: informante (r y sesgo), jueces categóricos (κ) y jueces continuos (CCI)
            const cfgC7 = cfgBase({ tamanoMuestra: 1500, correlaciones: [{ a: 'Estrés', b: 'Percepción', r: -0.3 }],
                cortes: [{ variable: 'Estrés', etiquetas: ['Bajo', 'Medio', 'Alto'], cortes: [24, 36], porPercentil: false }],
                concordancias: [{ tipo: 'informante', variable: 'Estrés', etiqueta: 'madre', r: 0.55, sesgo: -0.4 }, { tipo: 'jueces', variable: 'Estrés', jueces: 3, kappa: 0.6 }, { tipo: 'juecesContinuo', variable: 'Percepción', jueces: 2, icc: 0.8 }] });
            const { g: g32, d: d32 } = generar(cfgC7);
            const inf32 = g32.informePedidoObtenido(g32.datosGenerados);
            const f32 = t => inf32.find(f => f.tipo === t);
            ok('(C7) informante: columnas con sufijo, r de concordancia exacta y sesgo −0.4 DE', Object.keys(d32[0]).includes('Dimension_ST_madre') && Object.keys(d32[0]).includes('ST1_madre') && f32('r inf') && f32('r inf').ok && f32('d sesgo') && f32('d sesgo').ok, `${f32('r inf') && f32('r inf').obtenido} · sesgo ${f32('d sesgo') && f32('d sesgo').obtenido}`);
            ok('(C7) el informante conserva la r de la base con otra variable atenuada por la concordancia (−0.3·0.55)', Math.abs(corr(col(d32, 'Dimension_ST_madre'), col(d32, 'Dimension_PE')) - (-0.3 * 0.55)) < 0.03, corr(col(d32, 'Dimension_ST_madre'), col(d32, 'Dimension_PE')).toFixed(3));
            ok('(C7) jueces categóricos: κ de Fleiss ≈ 0.60 sobre los niveles de Estrés, con etiquetas', f32('κ') && f32('κ').ok && ['Bajo', 'Medio', 'Alto'].includes(d32[0].Juez1_ST), f32('κ') && `${f32('κ').pedido}→${f32('κ').obtenido}`);
            ok('(C7) jueces continuos: CCI(1) ≈ 0.80 sobre Percepción', f32('CCI jueces') && f32('CCI jueces').ok, f32('CCI jueces') && `${f32('CCI jueces').pedido}→${f32('CCI jueces').obtenido}`);
            ok('(C7) etiquetas de las columnas nuevas', /κ 0.6/.test(g32.obtenerEtiquetas()['Juez2_ST']) && /CCI 0.8/.test(g32.obtenerEtiquetas()['Juez1_PE']) && g32.obtenerEtiquetas()['Dimension_ST_madre'] === 'Estrés (madre)', g32.obtenerEtiquetas()['Juez2_ST']);
            // (C7, revisión) informante de una dimensión con ondas y con puntaje general: no entra en el General ni cuenta como onda
            const cfgC7b = cfgBase({ tamanoMuestra: 600, medidasRepetidas: [{ variable: 'Percepción', ondas: 2, estabilidad: 0.7, cambio: 0.3, agrupacion: '', cambioGrupo: null, modelo: 'ar1' }], concordancias: [{ tipo: 'informante', variable: 'Percepción', etiqueta: 'docente', r: 0.5, sesgo: 0.2 }] });
            const { g: g33, d: d33 } = generar(cfgC7b);
            const inf33 = g33.informePedidoObtenido(g33.datosGenerados);
            ok('(C7) informante + ondas + General: columnas de las tres versiones, General intacto (sin el informante) y r_tt/r inf cumplidas', ['Dimension_PE', 'Dimension_PE_T2', 'Dimension_PE_docente'].every(c => c in d33[0]) && g33.configuracion.gruposPruebas.find(x => x.nombre === 'EQ-i').escalas.length === 3 && inf33.filter(f => f.tipo === 'r_tt' || f.tipo === 'r inf').length === 2 && inf33.filter(f => f.tipo === 'r_tt' || f.tipo === 'r inf').every(f => f.ok), inf33.filter(f => f.tipo === 'r_tt' || f.tipo === 'r inf').map(f => `${f.tipo} ${f.pedido}→${f.obtenido}`).join(' | '));
            { const gv = new GeneradorDatos(); gv.configuracion = JSON.parse(JSON.stringify(cfgC7b)); gv.configuracion.concordancias[0].etiqueta = 'T2'; gv.configuracion.gruposPruebas = gv.agruparPruebas(gv.configuracion.pruebas); const v = gv.validarConfiguracion(); ok('(C7) validación: una etiqueta «T2» de informante se rechaza (se confunde con una onda)', v.errores.some(e => /se confunde con una onda/.test(e)), ''); }
            // 27) (Revisión transversal F-1) CCI por aula sobre una escala: α y cargas siguen calibradas
            const cfgF1 = cfgBase({ tamanoMuestra: 1500, sociodemograficos: [{ categoria: 'Aula', categoriaCorta: 'Au', distribucion: 'categorica', promedio: 0, desviacion: 1, minimo: 1, maximo: 20, decimales: 0 }], diferenciasGrupo: [{ tipo: 'icc', cuantitativa: 'Percepción', agrupacion: 'Aula', d: 0.2 }, { tipo: 'icc', cuantitativa: 'Comprensión', agrupacion: 'Aula', d: 0.15 }], estructuras: [{ prueba: 'EQ-i', modo: 'cargas', factores: ['Percepción', 'Comprensión', 'Regulación'], cargas: { 'Comprensión': Array.from({ length: 8 }, () => [0, 0.65, 0]) }, metodo: null, desajuste: 'ninguno' }] });
            const { g: g34 } = generar(cfgF1);
            const inf34 = g34.informePedidoObtenido(g34.datosGenerados);
            const fA = inf34.find(f => f.tipo === 'α' && f.variable === 'Percepción'), fL = inf34.find(f => f.tipo === 'λ' && /Comprensión/.test(f.variable)), fC = inf34.filter(f => f.tipo === 'CCI');
            ok('(F-1) con CCI por aula, el α de la escala y las cargas de la estructura siguen siendo los pedidos, y la CCI también', fA && fA.ok && fL && fL.ok && fC.length === 2 && fC.every(f => f.ok), `α ${fA && fA.obtenido} · λ ${fL && fL.obtenido} · CCI ${fC.map(f => f.obtenido).join(' ')}`);
            // 9) (A3) muestra sin reemplazo uniforme (la fila 1 ya no sale favorecida)
            const g8 = new GeneradorDatos(); let vecesFila0 = 0; const reps = 1500;
            for (let s = 1; s <= reps; s++) { g8.inicializarAleatorio(s); if (g8._muestraSinReemplazo(60, 6).includes(0)) vecesFila0++; }
            ok('(A3) muestra sin reemplazo: fila 1 elegida ≈ 10 %', Math.abs(vecesFila0 / reps - 0.10) < 0.03, (vecesFila0 / reps).toFixed(3));
        } catch (e) {
            ok('el autotest no lanza excepciones', false, e && e.message);
        }
        const verdes = res.filter(r => r.ok).length;
        const resumen = `${verdes}/${res.length} en verde`;
        if (typeof console !== 'undefined') {
            res.forEach(r => console[r.ok ? 'log' : 'error'](`${r.ok ? '✓' : '✗'} ${r.nombre}${r.detalle ? ' · ' + r.detalle : ''}`));
            console.log(`[GeneradorDatos.autotest] ${resumen}`);
        }
        return { resumen, resultados: res };
    },
});
