// simulador/dominio/informe.js — informe pedido vs. obtenido, etiquetas, estructura de escalas, CSV y acceso a la base.
// Métodos de GeneradorDatos: se componen en generador.js (Object.assign sobre el prototipo).

import { BaseColumnar } from '../../core/data/base-columnar.js';
import { aplicarForma, formaPorId, nombreEnFrase, spearman, rhoEsperadaForma, pearsonVec, curvaTeorica, uVentana } from './formas-relacion.js';
import { esNubeCompuesta, nubePorId, gNube, razonDispersionEsperada, razonDispersionObservada, bordesPorTramos, razonBordesTriangulo } from './nubes-relacion.js';
import { alfaTrasSeleccion, corregirThorndike, tamanoPoblacion } from './seleccion.js';
import { betaControlado, esTerceraVariable, estructuraTercera, fenomenoTercera, parcialDe, TIPOS_TERCERA } from './terceras.js';
import { esperadoNiveles, fenomenoNiveles } from './niveles.js';
import { correlacionEntreOndas, fenomenoPanel, regresionRezagada } from './paneles.js';
import { resumenHisteresis } from './histeresis.js';

export const metodosInforme = {
    informePedidoObtenido(datos) {
        const filas = [];
        if (!datos || !datos.length) return filas;
        // Acepta la base columnar o, por compatibilidad, un arreglo de filas-objeto.
        const base = (typeof BaseColumnar !== 'undefined' && datos instanceof BaseColumnar) ? datos : this._baseDesdeObjetos(datos);
        const n = base.n;
        const cfg = this.configuracion;
        const col = k => (base.tiene(k) ? Array.from(base.finitos(k)) : []);
        const num = (v, dec = 2) => (isFinite(v) ? Number(v).toFixed(dec) : '—');
        // Columna de cada variable correlacionable (dimensión, general derivado o socio)
        const grupos = cfg.gruposPruebas || [];
        const columnaDe = nombre => {
            const p = (cfg.pruebas || []).find(x => x.nombre === nombre);
            if (p) return this.columnaDeEscala(p);
            const g = grupos.find(x => this.nombreGeneral(x) === nombre && x.escalas.length >= 2);
            if (g) return `General_${g.sigla}`;
            const s = (cfg.sociodemograficos || []).find(x => x.categoria === nombre);
            return s ? s.categoria : null;   // la columna de un sociodemográfico se llama como su categoría
        };
        // (Atlas, dimensión B3) con selección por rango, las tablas describen la POBLACIÓN: las variables afectadas se comparan
        // con lo esperado tras la selección (tolerancia de muestreo más el error de su simulación)
        const sel = this._esperadoTrasSeleccion();
        // (Atlas, dimensión B4) con atípicos, la media, la DE, el α y la r pedidos son los de la MAYORÍA: se excluyen sus k filas
        const kAtip = nombre => { const at = (cfg.atipicos || [])[0]; return at && (at.x === nombre || at.y === nombre) ? at.casos : 0; };
        const notaAtip = nombre => (kAtip(nombre) ? ` (la mayoría, sin los ${kAtip(nombre)} casos atípicos)` : '');
        const colMayoria = (clave, k) => { if (!k || !base.tiene(clave)) return col(clave); const d = base.columna(clave).datos, out = []; for (let i = 0; i < d.length - k; i++) if (isFinite(d[i])) out.push(d[i]); return out; };
        // 1) Media y DE de cada escala
        (cfg.pruebas || []).forEach(p => {
            const v = colMayoria(this.columnaDeEscala(p), kAtip(p.nombre));
            if (v.length < 3) return;
            const m = v.reduce((a, b) => a + b, 0) / v.length;
            const de = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
            const eS = sel ? sel.porNombre.get(p.nombre) : null;
            if (eS) {
                filas.push({ tipo: 'Media', variable: `${p.nombre} (tras la selección; población ${num(p.media)})`, pedido: `≈ ${num(eS.media)}`, obtenido: num(m), ok: Math.abs(m - eS.media) <= (3 * eS.de) / Math.sqrt(v.length) + 0.01 * p.desviacion });
                // error típico del propio modelo (la cola seleccionada no es normal)
                filas.push({ tipo: 'DE', variable: `${p.nombre} (tras la selección; población ${num(p.desviacion)})`, pedido: `≈ ${num(eS.de)}`, obtenido: num(de), ok: Math.abs(de - eS.de) <= 3 * sel.eeDE(p.nombre, v.length) + 0.01 * p.desviacion });
            } else {
                filas.push({ tipo: 'Media', variable: p.nombre + notaAtip(p.nombre), pedido: num(p.media), obtenido: num(m), ok: Math.abs(m - p.media) <= Math.max(0.5, 0.1 * p.desviacion) });
                filas.push({ tipo: 'DE', variable: p.nombre + notaAtip(p.nombre), pedido: num(p.desviacion), obtenido: num(de), ok: Math.abs(de - p.desviacion) <= Math.max(0.3, 0.15 * p.desviacion) });
            }
            // (Atlas, dimensión B2) techo o suelo: casos en el límite, frente a la proporción que implican M, DE y el límite (con
            // el redondeo del total a entero); tolerancia binomial de 3 errores típicos más 1 punto
            const cen = this._censuraDe(p);
            if (cen) {
                const enLimite = v.filter(t => Math.abs(t - cen.limite) < 1e-9).length / v.length, tolP = 3 * Math.sqrt((cen.pRedondeo * (1 - cen.pRedondeo)) / v.length) + 0.01;
                filas.push({ tipo: 'límite', variable: `${p.nombre}: casos en el ${cen.lado === 'suelo' ? 'mínimo' : 'máximo'} (${cen.lado}; la proporción la fijan M, DE y el límite ${cen.limite})`, pedido: `≈ ${num(100 * cen.pRedondeo, 1)} %`, obtenido: `${num(100 * enLimite, 1)} %`, ok: eS ? null : Math.abs(enLimite - cen.pRedondeo) <= tolP });   // con selección, la proporción pedida es la de la población
            }
        });
        // 2) Fiabilidad de cada escala con objetivo (α u ω, según el índice elegido)
        const indice = cfg.indiceFiabilidad || 'alfa';
        (cfg.pruebas || []).forEach(p => {
            if (!(p.alfa > 0 && p.alfa < 1) || p.numItems < 2) return;
            const cols = [];
            // Solo casos con todos los ítems presentes, y RECODIFICANDO los invertidos
            const columnasItems = this._itemsDe(p).map(k => base.columna(k)).filter(Boolean);
            if (columnasItems.length !== p.numItems) return;
            const completos = [];
            for (let i = 0; i < n - kAtip(p.nombre); i++) if (columnasItems.every(c => isFinite(c.datos[i]))) completos.push(i);
            if (completos.length < 10) return;
            for (let j = 1; j <= p.numItems; j++) cols.push(completos.map(i => this._recodificar(p, j, columnasItems[j - 1].datos[i])));
            if (cols.length < 2) return;
            const obs = this._indiceObservado(cols, indice);
            if (obs === null || !isFinite(obs)) return;
            // (C1) con matriz de cargas, la fiabilidad la fijan las cargas: se informa en la sección de estructura
            if (this.perfilesItems && this.perfilesItems.get(p) && this.perfilesItems.get(p).estructura) return;
            // (C5) en dicotómicas el α es el KR-20; además, dificultades y discriminación
            if (this._esDicotomica(p)) {
                filas.push({ tipo: 'KR-20', variable: `${p.nombre} (ítems dicotómicos)`, pedido: num(p.alfa), obtenido: num(obs, 3), ok: Math.abs(obs - p.alfa) <= 0.04 });
                const st = this._estadisticosDicotomica(cols.map(c => c.map(v => v - p.minimo)));
                const pedidas = p.dificultadesEfectivas || [];
                const mediaP = st.p.reduce((s, v) => s + v, 0) / st.p.length;
                const mediaPed = pedidas.length ? pedidas.reduce((s, v) => s + v, 0) / pedidas.length : (p.media - p.numItems * p.minimo) / p.numItems;
                const maxDesv = pedidas.length ? Math.max(...st.p.map((v, i) => Math.abs(v - pedidas[i]))) : 0;
                const tolP = 0.04 + 2 / Math.sqrt(Math.max(4, n));
                filas.push({ tipo: 'p', variable: `${p.nombre}: dificultad de los ítems (proporción de unos; media, mín–máx${pedidas.length ? ', desviación máxima respecto a las pedidas' : ''})`, pedido: `${num(mediaPed, 2)} (${num(Math.min(...(pedidas.length ? pedidas : [mediaPed])), 2)}–${num(Math.max(...(pedidas.length ? pedidas : [mediaPed])), 2)})`, obtenido: `${num(mediaP, 2)} (${num(Math.min(...st.p), 2)}–${num(Math.max(...st.p), 2)})${pedidas.length ? ` · máx. desv. ${num(maxDesv, 2)}` : ''}`, ok: Math.abs(mediaP - mediaPed) <= 0.02 + 1 / Math.sqrt(n) && maxDesv <= tolP });
                const discV = st.disc.filter(v => isFinite(v));
                if (discV.length) { const md = discV.reduce((s, v) => s + v, 0) / discV.length; filas.push({ tipo: 'disc', variable: `${p.nombre}: discriminación (r ítem–resto media; mín)`, pedido: '≥ 0.20', obtenido: `${num(md, 2)} (mín ${num(Math.min(...discV), 2)})`, ok: md >= 0.2 }); }
                return;
            }
            // (dimensión B3) con selección, la fiabilidad baja con la varianza: 1 − (1 − α)·σ²_pob/σ²_sel (Gulliksen), que supone
            // la varianza de error constante. Vale en las escalas seleccionadas INDIRECTAMENTE (sus errores no dependen de X: .816
            // previsto, .817 obtenido); en la seleccionada directamente, elegir por el puntaje observado también recorta sus
            // errores y la fórmula no aplica (preveía .433 y salía .48; con X uniforme, −.667): esa fila es informativa
            const eA = sel ? sel.porNombre.get(p.nombre) : null, alfaObjetivo = eA ? alfaTrasSeleccion(p.alfa, eA.razonVarianzas) : p.alfa, directa = eA && p.nombre === sel.variable;
            // (revisión 2026.11.10) tolerancia según n: el error típico asintótico de α es (1 − α)·√(2k/((k − 1)·n)); con n = 60 y
            // k = 10, ≈ .029, y la tolerancia fija de ±.04 daba falsas alarmas (con n ≥ ~300 queda igual: max(.04, 3 EE))
            const eeAlfa = (1 - p.alfa) * Math.sqrt((2 * p.numItems) / ((p.numItems - 1) * completos.length)), tolAlfa = Math.max(eA ? 0.05 : 0.04, 3 * eeAlfa);
            if (directa) filas.push({ tipo: indice === 'omega' ? 'ω' : 'α', variable: `${p.nombre} (seleccionada directamente; población ${num(p.alfa)}): la selección por su puntaje observado recorta también sus errores, así que la fórmula clásica no aplica; baja con la varianza`, pedido: '—', obtenido: num(obs, 3), ok: null });
            else filas.push({ tipo: indice === 'omega' ? 'ω' : 'α', variable: eA ? `${p.nombre} (tras la selección; población ${num(p.alfa)})` : p.nombre + notaAtip(p.nombre), pedido: eA ? `≈ ${num(alfaObjetivo, 3)}` : num(p.alfa), obtenido: num(obs, 3), ok: Math.abs(obs - alfaObjetivo) <= tolAlfa });   // ±0.04 ≈ 2 EE de α con n≈300
        });
        // 3) Correlaciones objetivo (incluidas las de generales derivados; las
        //    parejas que fija un modelo estructural se informan en 5 y las de
        //    medidas repetidas en 6)
        const fijadasPorModelos = this._paresFijadosPorModelos();
        (cfg.correlaciones || []).forEach(({ a, b, r, origen }) => {
            if (origen === 'repetidas') return;
            if (fijadasPorModelos.has(a < b ? `${a}|${b}` : `${b}|${a}`)) return;
            const ca = columnaDe(a), cb = columnaDe(b);
            if (!ca || !cb || !base.tiene(ca) || !base.tiene(cb)) return;
            const x = base.columna(ca).datos, y = base.columna(cb).datos;
            const u = [], w = [];
            for (let i = 0; i < n; i++) if (isFinite(x[i]) && isFinite(y[i])) { u.push(x[i]); w.push(y[i]); }
            if (u.length < 3) return;
            // (Atlas, dimensión B4) el par con atípicos: la r de la tabla es la de la MAYORÍA; la de la base completa, aparte
            const at = (cfg.atipicos || []).find(t => (t.x === a && t.y === b) || (t.x === b && t.y === a));
            if (at) { this._informeAtipicos(filas, num, at, x, y, n, a, b); return; }
            const obs = this._corr(u, w);
            const rSel = sel ? sel.corr(a, b) : null;
            if (rSel !== null) {
                const eeR = sel.eeR(a, b, u.length), tolR = 3 * Math.sqrt(eeR * eeR + (1 - rSel * rSel) ** 2 / sel.k) + 0.005;   // error típico del propio modelo
                filas.push({ tipo: 'r', variable: `${a} ↔ ${b} (tras la selección; población ${num(r)})`, pedido: `≈ ${num(rSel)}`, obtenido: num(obs, 3), ok: Math.abs(obs - rSel) <= tolR });
            } else if (sel) filas.push({ tipo: 'r', variable: `${a} ↔ ${b} (tras la selección; población ${num(r)}; informativa: un puntaje general se deriva de sus dimensiones y no tiene valor esperado propio)`, pedido: '—', obtenido: num(obs, 3), ok: null });
            else filas.push({ tipo: 'r', variable: `${a} ↔ ${b}`, pedido: num(r), obtenido: num(obs, 3), ok: Math.abs(obs - r) <= 0.03 });
        });
        if (sel) this._informeSeleccion(base, filas, num, sel, columnaDe);
        // 4) Diferencias por grupo (d de Cohen): cambio de la media por unidad de
        //    código (pendiente), dividido por la DE intra-grupo agrupada. En modo
        //    exacto no fluctúa; si no, la tolerancia es 2 EE de la d.
        // La d solo es exacta si los drivers se ortogonalizaron a los grupos
        // (modo exacto y n suficiente); si no, fluctúa como en una muestra real.
        const exactas = cfg.correlacionesExactas !== false && this.driversOrtogonalizados === true;
        (cfg.diferenciasGrupo || []).forEach(difPedida => {
            if (difPedida.tipo && difPedida.tipo !== 'd') return;   // (C4) interacción y CCI van en su sección
            // (B7) en una onda T2… con cambio diferencial, la d efectiva se recompone
            // con la heredada del General: se informa esa, no la de la expansión
            const efectiva = difPedida.extraAmp !== undefined && this.diferenciasEfectivas
                ? (this.diferenciasEfectivas.get(difPedida.cuantitativa) || []).find(e => e.agrup && e.agrup.categoria === difPedida.agrupacion) : null;
            const dif = efectiva ? Object.assign({}, difPedida, { d: efectiva.d }) : difPedida;
            const agrup = (cfg.sociodemograficos || []).find(s => s.categoria === dif.agrupacion);
            const cv = columnaDe(dif.cuantitativa);
            if (!agrup || !cv || !(typeof dif.d === 'number' && isFinite(dif.d)) || !base.tiene(agrup.categoria) || !base.tiene(cv)) return;
            const cg = base.columna(agrup.categoria).datos, cvv = base.columna(cv).datos;
            const pares = [];
            for (let i = 0; i < n; i++) if (isFinite(cg[i]) && isFinite(cvv[i])) pares.push([cg[i], cvv[i]]);
            if (pares.length < 6) return;
            const porGrupo = new Map();
            pares.forEach(([g, v]) => { if (!porGrupo.has(g)) porGrupo.set(g, []); porGrupo.get(g).push(v); });
            if (porGrupo.size < 2) {
                filas.push({ tipo: 'd', variable: `${dif.cuantitativa} por ${dif.agrupacion}`, pedido: num(dif.d), obtenido: 'un solo grupo en la muestra', ok: false });
                return;
            }
            let ssIntra = 0, gl = 0;
            porGrupo.forEach(vals => {
                const mg = vals.reduce((a, b) => a + b, 0) / vals.length;
                vals.forEach(v => { ssIntra += (v - mg) ** 2; });
                gl += vals.length - 1;
            });
            const deIntra = Math.sqrt(ssIntra / Math.max(1, gl));
            const codigos = pares.map(q => q[0]), valores = pares.map(q => q[1]);
            const mc = codigos.reduce((a, b) => a + b, 0) / codigos.length, mv = valores.reduce((a, b) => a + b, 0) / valores.length;
            let sxy = 0, sxx = 0;
            for (let i = 0; i < codigos.length; i++) { sxy += (codigos[i] - mc) * (valores[i] - mv); sxx += (codigos[i] - mc) ** 2; }
            if (!(sxx > 0) || !(deIntra > 0)) return;
            const obs = (sxy / sxx) / deIntra;
            const ee = 1 / Math.sqrt(sxx);   // ≈ √(1/n₀ + 1/n₁) en una binaria
            // En modo exacto solo queda el ruido del redondeo de la variable (Likert:
            // enteros; continua: 2 decimales; socio: sus decimales), DE = unidad/√12.
            const p = (cfg.pruebas || []).find(x => x.nombre === dif.cuantitativa);
            const s = (cfg.sociodemograficos || []).find(x => x.categoria === dif.cuantitativa);
            const unidad = p ? ((p.minimo !== null && p.maximo !== null) ? 1 : 0.01) : (s ? Math.pow(10, -(s.decimales || 0)) : 1);
            const eeRedondeo = (unidad / Math.sqrt(12)) / Math.sqrt(sxx) / deIntra;
            // El redondeo también INFLA la DE intra-grupo (corrección de Sheppard,
            // +unidad²/12 de varianza) y deflacta la d observada en ≈ d·unidad²/(24·DE²):
            // solo pesa en escalas muy cortas (DE de un punto o dos).
            const sesgoRedondeo = Math.abs(dif.d) * unidad * unidad / (24 * deIntra * deIntra);
            // Con algún grupo de menos de 5 personas la d no puede ser exacta ni
            // en modo exacto (medias de grupo dominadas por dos o tres casos y
            // confundidas con las otras agrupaciones): tolerancia muestral.
            let minGrupo = Infinity;
            porGrupo.forEach(vals => { if (vals.length < minGrupo) minGrupo = vals.length; });
            const tolerancia = (exactas && minGrupo >= 5) ? Math.max(0.06, 2 * eeRedondeo) + sesgoRedondeo : Math.max(0.06, 2 * ee);
            const limitada = (this.diferenciasLimitadas || []).some(l => l.variable === dif.cuantitativa && l.agrupacion === dif.agrupacion);
            const etiqueta = `${dif.cuantitativa} por ${dif.agrupacion}` + (limitada ? ' (no alcanzable con las d de sus dimensiones)' : '');
            filas.push({ tipo: 'd', variable: etiqueta, pedido: num(dif.d), obtenido: num(obs), ok: !limitada && Math.abs(obs - dif.d) <= tolerancia });
        });
        // 5) (B6) Modelos estructurales: coeficientes estandarizados obtenidos por
        //    regresión sobre los casos completos (X y W estandarizados en la
        //    muestra; el producto X·W se forma con los valores estandarizados).
        this._informeModelos(base, filas, columnaDe, num);
        this._informeTerceras(base, filas, columnaDe, num);
        // 6) (B7) Medidas repetidas: estabilidad y cambio (global o por grupo)
        this._informeRepetidas(base, filas, num);
        this._informeNiveles(base, filas, num);
        this._informePaneles(base, filas, num);
        this._informeHisteresis(base, filas, num);
        // 7) (B9) Sociodemográficos: proporciones pedidas y asociaciones entre discretas
        this._informeSociodemograficos(base, filas, num);
        // 8) (C1) Estructura factorial: cargas, cruzadas, método, fiabilidad implícita, SRMR, KMO
        this._informeEstructuras(base, filas, num);
        // 9) (C2/C3) Desenlaces no continuos y puntos de corte
        this._informeDesenlacesYCortes(base, filas, num);
        // 10) (C4) Interacciones 2×2 y anidamiento
        this._informeEfectosCompuestos(base, filas, columnaDe, num);
        // 11) (C7) Concordancia entre informantes y jueces
        this._informeConcordancia(base, filas, num);
        // (revisión 2026.11.13) con imperfecciones, la verificación es la de la base limpia (calculada en el flujo antes de
        // contaminarla) y los valores finales se añaden aparte
        const limpio = this._informeLimpio;
        if (limpio && limpio.huella && limpio.filas !== filas && limpio.huella === this._huellaBase(base)) return this._combinarConImperfecciones(limpio.filas, filas);
        return filas;
    },

    // (Atlas, fase C) terceras variables: las tres correlaciones y la parcial se verifican; el β de X controlando Z y el
    // veredicto del fenómeno son informativos. Las etiquetas identifican y no miden: las cifras van en lo obtenido.
    _informeTerceras(base, filas, columnaDe, num) {
        const cfg = this.configuracion, n = base.n, exactas = cfg.correlacionesExactas !== false;
        const tol = exactas ? 0.03 : Math.max(0.03, 2 / Math.sqrt(Math.max(4, n)));
        const columna = nombre => { const c = columnaDe(nombre); return c && base.tiene(c) ? base.columna(c).datos : null; };
        const r = (u, v) => { let su = 0, sv = 0, k = 0; for (let i = 0; i < u.length; i++) { su += u[i]; sv += v[i]; k++; } const mu = su / k, mv = sv / k; let suv = 0, suu = 0, svv = 0; for (let i = 0; i < u.length; i++) { const du = u[i] - mu, dv = v[i] - mv; suv += du * dv; suu += du * du; svv += dv * dv; } return suv / Math.sqrt(suu * svv); };
        // con selección por rango, lo pedido es lo esperado en la muestra seleccionada (Pearson–Lawley sobre la matriz completa, que
        // incluye estas correlaciones) y la tolerancia, la del propio modelo de la selección (tres errores típicos)
        const sel = this._esperadoTrasSeleccion();
        (cfg.modelos || []).filter(md => esTerceraVariable(md.tipo) && new Set([md.x, md.m, md.y]).size === 3).forEach(md => {
            const X = columna(md.x), Y = columna(md.y), Z = columna(md.m);
            if (!X || !Y || !Z) return;
            const x = [], y = [], z = [];
            for (let i = 0; i < n; i++) if (Number.isFinite(X[i]) && Number.isFinite(Y[i]) && Number.isFinite(Z[i])) { x.push(X[i]); y.push(Y[i]); z.push(Z[i]); }
            if (x.length < 4) return;
            const rXY = r(x, y), rXZ = r(x, z), rYZ = r(y, z), parcial = parcialDe(rXY, rXZ, rYZ), poblacion = estructuraTercera(md);
            const conSel = !!(sel && [md.x, md.y, md.m].every(v => sel.corr(v, sel.variable) !== null && sel.corr(v, sel.variable) !== undefined));
            const e = conSel ? { rXZ: sel.corr(md.m, md.x), rYZ: sel.corr(md.m, md.y), rXY: sel.corr(md.x, md.y) } : poblacion;
            if (conSel) e.parcial = parcialDe(e.rXY, e.rXZ, e.rYZ);
            const tolDe = (a, b) => (conSel ? 3 * sel.eeR(a, b, x.length) + 0.01 : tol), tolP = Math.max(tolDe(md.x, md.y), tolDe(md.x, md.m), tolDe(md.y, md.m)), pide = v => (conSel ? `≈ ${num(v)}` : num(v));
            const et = `${TIPOS_TERCERA[md.tipo].etiqueta} ${md.x} ↔ ${md.y} (Z = ${md.m})`, fen = fenomenoTercera(md.tipo, rXY, parcial);
            filas.push({ tipo: 'r', variable: `${et}: Z ↔ X`, pedido: pide(e.rXZ), obtenido: num(rXZ, 3), ok: Math.abs(rXZ - e.rXZ) <= tolDe(md.m, md.x) });
            filas.push({ tipo: 'r', variable: `${et}: Z ↔ Y`, pedido: pide(e.rYZ), obtenido: num(rYZ, 3), ok: Math.abs(rYZ - e.rYZ) <= tolDe(md.m, md.y) });
            filas.push({ tipo: 'r', variable: `${et}: X ↔ Y sin controlar Z${TIPOS_TERCERA[md.tipo].verdadera === 'cero' ? ' (la relación verdadera)' : ''}`, pedido: pide(e.rXY), obtenido: num(rXY, 3), ok: Math.abs(rXY - e.rXY) <= tolDe(md.x, md.y) });
            filas.push({ tipo: 'r parcial', variable: `${et}: X ↔ Y controlando Z${TIPOS_TERCERA[md.tipo].verdadera === 'parcial' ? ' (la relación verdadera)' : ''}`, pedido: pide(e.parcial), obtenido: num(parcial, 3), ok: Math.abs(parcial - e.parcial) <= tolP });
            filas.push({ tipo: 'β', variable: `${et}: β de X en Y ~ X + Z`, pedido: '—', obtenido: num(betaControlado(rXY, rXZ, rYZ), 3), ok: null });
            filas.push({ tipo: 'fenómeno', variable: `${et}: qué muestran los datos`, pedido: '—', obtenido: fen.texto, ok: null });
            // seleccionar por el efecto común es condicionar en él: la paradoja de Berkson, con las dos r a la vista
            if (conSel && md.tipo === 'colisionador' && sel.variable === md.m) filas.push({ tipo: 'fenómeno', variable: `${et}: paradoja de Berkson`, pedido: '—', obtenido: `al seleccionar por Z, X e Y quedan relacionadas en la muestra (r = ${num(rXY, 2)}) aunque en la población la relación sea ${num(poblacion.rXY, 2)}`, ok: null });
        });
    },

    _informeModelos(base, filas, columnaDe, num) {
        const cfg = this.configuracion, modelos = cfg.modelos || [];
        if (!modelos.length) return;
        const n = base.n;
        const exactas = cfg.correlacionesExactas !== false;
        const tol = exactas ? 0.03 : Math.max(0.03, 2 / Math.sqrt(Math.max(4, n)));
        const columna = nombre => { const c = columnaDe(nombre); return c && base.tiene(c) ? base.columna(c).datos : null; };
        const par = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
        // Mediación: por par (X,Y), regresión de Y sobre X y TODOS sus mediadores
        const grupos = new Map();
        modelos.filter(md => md.tipo === 'mediacion').forEach(md => {
            const clave = par(md.x, md.y);
            if (!grupos.has(clave)) grupos.set(clave, { x: md.x, y: md.y, cprima: md.c3, mediadores: [] });
            const g = grupos.get(clave);
            if (!g.mediadores.some(q => q.m === md.m)) g.mediadores.push({ m: md.m, a: md.c1, b: md.c2 });
        });
        grupos.forEach(g => {
            const cols = [columna(g.x)].concat(g.mediadores.map(q => columna(q.m))).concat([columna(g.y)]);
            if (cols.some(c => !c)) return;
            const completos = [];
            for (let i = 0; i < n; i++) if (cols.every(c => isFinite(c[i]))) completos.push(i);
            if (completos.length < 10) return;
            const tomar = c => completos.map(i => c[i]);
            const X = tomar(cols[0]), Y = tomar(cols[cols.length - 1]), Ms = g.mediadores.map((q, k) => tomar(cols[k + 1]));
            const betasY = this._betasEstandarizadas(Y, [X].concat(Ms));   // [c′, b1, b2, …]
            if (!betasY) return;
            const etiqueta = `Mediación ${g.x} → ${g.mediadores.map(q => q.m).join(' / ')} → ${g.y}`;
            g.mediadores.forEach((q, k) => {
                const aObs = this._corr(X, Ms[k]), bObs = betasY[k + 1];
                filas.push({ tipo: 'a', variable: `${etiqueta}: a (${g.x} → ${q.m})`, pedido: num(q.a), obtenido: num(aObs, 3), ok: Math.abs(aObs - q.a) <= tol });
                filas.push({ tipo: 'b', variable: `${etiqueta}: b (${q.m} → ${g.y}, con ${g.x})`, pedido: num(q.b), obtenido: num(bObs, 3), ok: Math.abs(bObs - q.b) <= tol });
                filas.push({ tipo: 'a·b', variable: `${etiqueta}: efecto indirecto vía ${q.m}`, pedido: num(q.a * q.b, 3), obtenido: num(aObs * bObs, 3), ok: Math.abs(aObs * bObs - q.a * q.b) <= tol });
            });
            filas.push({ tipo: 'c′', variable: `${etiqueta}: c′ (${g.x} → ${g.y} directo)`, pedido: num(g.cprima), obtenido: num(betasY[0], 3), ok: Math.abs(betasY[0] - g.cprima) <= tol });
        });
        // (C6) Curvilínea: regresión de Y (estandarizada) sobre z_X y z_X² centrada
        modelos.filter(md => md.tipo === 'curvilinea').forEach(md => {
            const cx = columna(md.x), cy = columna(md.y);
            if (!cx || !cy) return;
            const completos = [];
            for (let i = 0; i < n; i++) if (isFinite(cx[i]) && isFinite(cy[i])) completos.push(i);
            if (completos.length < 10) return;
            const est = arr => { const mu = arr.reduce((s, v) => s + v, 0) / arr.length; const sd = Math.sqrt(arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length) || 1; return arr.map(v => (v - mu) / sd); };
            const zx = est(completos.map(i => cx[i])), y = completos.map(i => cy[i]);
            const q = zx.map(v => v * v); const mq = q.reduce((s, v) => s + v, 0) / q.length;
            const betas = this._betasEstandarizadas(y, [zx, q.map(v => v - mq)], false);
            if (!betas) return;
            const conGrupos = !!(this.diferenciasEfectivas && (this.diferenciasEfectivas.get(md.y) || []).length);
            const tolM = conGrupos ? Math.max(tol, 2 / Math.sqrt(Math.max(4, completos.length))) : tol;
            const etiqueta = `Curvilínea ${md.x} → ${md.y}`;
            filas.push({ tipo: 'β₁', variable: `${etiqueta}: β₁ lineal (${md.x})`, pedido: num(md.c1), obtenido: num(betas[0], 3), ok: Math.abs(betas[0] - md.c1) <= tolM });
            filas.push({ tipo: 'β₂', variable: `${etiqueta}: β₂ cuadrática (${md.x}², X estandarizada)`, pedido: num(md.c2), obtenido: num(betas[1], 3), ok: Math.abs(betas[1] - md.c2) <= tolM });
        });
        // (Atlas, dimensión A) relación con forma: fuerza η = r(Y, f(X)); r de Pearson y ρ de Spearman, informativas
        const pearson = pearsonVec;
        // (revisión 2026.10.27) la curva con que el motor generó los datos: en modo exacto, sobre la ventana de ESTA muestra;
        // en modo no exacto (fila a fila, sin muestra), sobre X estandarizada con su media y DE configuradas y la ventana
        // teórica de su distribución real. Así las tres filas miden lo que se generó (antes, en modo no exacto la ρ daba
        // falsas alarmas y la η se medía con otra curva)
        const curvaGenerada = (md, xs) => {
            if (exactas) return Array.from(aplicarForma(md.forma, xs));
            const p = (cfg.pruebas || []).find(q => q.nombre === md.x), s = (cfg.sociodemograficos || []).find(q => q.categoria === md.x);
            const media = p ? p.media : s ? s.promedio : 0, de = p ? p.desviacion : s ? (this._deEfectiva ? this._deEfectiva(s) : s.desviacion) : 1;
            const { tx } = this._txDe(md.x), c = curvaTeorica(md.forma, tx), F = formaPorId(md.forma);
            return xs.map(v => F.f(c.u((v - media) / (de || 1))));
        };
        modelos.filter(md => md.tipo === 'forma').forEach(md => {
            const cx = columna(md.x), cy = columna(md.y), F = formaPorId(md.forma);
            if (!cx || !cy || !F) return;
            const idx = [];
            for (let i = 0; i < n; i++) if (isFinite(cx[i]) && isFinite(cy[i])) idx.push(i);
            if (idx.length < 10) return;
            const xs = idx.map(i => cx[i]), ys = idx.map(i => cy[i]), fxs = curvaGenerada(md, xs), eta = pearson(fxs, ys);
            const conGrupos = !!(this.diferenciasEfectivas && (this.diferenciasEfectivas.get(md.y) || []).length);
            const tolM = conGrupos ? Math.max(tol, 2 / Math.sqrt(Math.max(4, idx.length))) : tol, etiqueta = `Relación ${nombreEnFrase(md.forma)} ${md.x} → ${md.y}`, implicada = md.eta * this._kappaFormaDe(md);
            filas.push({ tipo: 'η', variable: `${etiqueta}: fuerza η = r(Y, f(X))`, pedido: num(md.eta), obtenido: num(eta, 3), ok: Math.abs(eta - md.eta) <= tolM });
            // Identidad exacta si el residuo de Y es ortogonal a X y a f(X): r(X, Y) = η · r(f(X), X), con r(f(X), X) de ESTA muestra
            const rImplicada = md.eta * pearson(fxs, xs), rObtenida = pearson(xs, ys);
            filas.push({ tipo: 'r', variable: `${etiqueta}: r de Pearson = η · r(f(X), X) en la muestra (≈ ${num(Math.abs(implicada) < 0.005 ? 0 : implicada)} en teoría, con la distribución de X)`, pedido: num(Math.abs(rImplicada) < 0.0005 ? 0 : rImplicada, 3), obtenido: num(rObtenida, 3), ok: Math.abs(rObtenida - rImplicada) <= tolM });
            // (revisión 2026.10.26) ρ de Spearman verificada: sin identidad exacta, se compara con su distribución bajo la forma y
            // la fuerza pedidas, simulada sobre ESTA muestra (misma X, residuo como el del motor, marginal observado de Y)
            // tolerancia 3,5 DE simuladas: la calibración (≈ 300 bases, ambos modos) da DE(z) ≈ 1,1, así que 3,5 DE simuladas son
            // ≈ 3,1 DE reales (falsas alarmas ≈ 0,2 %)
            // (dimensión B) con una nube, la simulación usa el MISMO residuo que el motor: g(X)·φ(e) (acotado en el triángulo)
            const residuo = esNubeCompuesta(md.nube) ? { g: Array.from(uVentana(xs), u => gNube(md.nube, u, md.forma === 'recta-dec' ? -1 : 1)), acotada: !!nubePorId(md.nube).acotada } : null;
            const esp = rhoEsperadaForma(xs, fxs, ys, md.eta, { exacto: exactas, residuo }), tolRho = Math.max(0.02, 3.5 * esp.de), rhoObt = spearman(xs, ys);
            filas.push({ tipo: 'ρ', variable: `${etiqueta}: ρ de Spearman (esperada por la forma, simulada sobre esta muestra)`, pedido: `${num(esp.media, 3)} (±${num(tolRho, 3)})`, obtenido: num(rhoObt, 3), ok: Math.abs(rhoObt - esp.media) <= tolRho });
            // (Atlas, dimensión B) la nube: razón de dispersión del abanico o borde inferior plano del triángulo
            if (esNubeCompuesta(md.nube)) {
                const N = nubePorId(md.nube), txX = this._txDe(md.x).tx;
                const sentido = md.forma === 'recta-dec' ? -1 : 1, etN = `Nube «${N.etiqueta.toLowerCase()}» ${md.x} → ${md.y}`;
                if (N.acotada) {
                    // (2026.11.04) se compara con la razón PREVISTA para la fuerza pedida; tolerancia de muestreo medida (entre semillas,
                    // DE ≈ .08 con n = 400): max(.15, 4/√n)
                    const { b10, b90 } = bordesPorTramos(xs, ys), razon = b90 !== 0 ? b10 / b90 : Infinity, prevista = razonBordesTriangulo(md.eta, md.forma, txX, null, sentido);
                    filas.push({ tipo: 'nube', variable: `${etN}: bordes (pendiente del cuantil .10 / la del .90, por tramos de X; casi 0 = borde inferior plano)`, pedido: `≈ ${num(prevista, 2)}`, obtenido: num(razon, 2), ok: Math.sign(b90) === sentido && Math.abs(razon - prevista) <= Math.max(0.15, 4 / Math.sqrt(xs.length)) });
                } else {
                    // tolerancia: 3 errores típicos del logaritmo de la razón de dos DE con n/3 casos cada una (mínimo ±35 %)
                    const esperada = razonDispersionEsperada(md.nube, md.forma, txX, null, sentido), obtenida = razonDispersionObservada(xs, ys, fxs), tolLog = Math.max(Math.log(1.35), 3 / Math.sqrt(xs.length / 3));
                    filas.push({ tipo: 'nube', variable: `${etN}: razón de dispersión (DE del residuo en el tercio alto de X / en el tercio bajo)`, pedido: num(esperada, 2), obtenido: num(obtenida, 2), ok: Math.abs(Math.log(obtenida / esperada)) <= tolLog });
                }
            }
        });
        // Moderación: regresión de Y (estandarizada) sobre z_X, z_W y z_X·z_W
        modelos.filter(md => md.tipo === 'moderacion').forEach(md => {
            const cx = columna(md.x), cw = columna(md.m), cy = columna(md.y);
            if (!cx || !cw || !cy) return;
            const completos = [];
            for (let i = 0; i < n; i++) if (isFinite(cx[i]) && isFinite(cw[i]) && isFinite(cy[i])) completos.push(i);
            if (completos.length < 10) return;
            const est = arr => { const mu = arr.reduce((s, v) => s + v, 0) / arr.length; const sd = Math.sqrt(arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length) || 1; return arr.map(v => (v - mu) / sd); };
            const zx = est(completos.map(i => cx[i])), zw = est(completos.map(i => cw[i])), y = completos.map(i => cy[i]);
            const betas = this._betasEstandarizadas(y, [zx, zw, zx.map((v, i) => v * zw[i])], false);
            if (!betas) return;
            const etiqueta = `Moderación ${md.x} × ${md.m} → ${md.y}`;
            // Con diferencias por grupo en Y, el desplazamiento de grupo se confunde
            // por azar con los predictores (∝ 1/√n): tolerancia muestral.
            const conGrupos = !!(this.diferenciasEfectivas && (this.diferenciasEfectivas.get(md.y) || []).length);
            const tolM = conGrupos ? Math.max(tol, 2 / Math.sqrt(Math.max(4, completos.length))) : tol;
            filas.push({ tipo: 'β₁', variable: `${etiqueta}: β₁ (${md.x})`, pedido: num(md.c1), obtenido: num(betas[0], 3), ok: Math.abs(betas[0] - md.c1) <= tolM });
            filas.push({ tipo: 'β₂', variable: `${etiqueta}: β₂ (${md.m})`, pedido: num(md.c2), obtenido: num(betas[1], 3), ok: Math.abs(betas[1] - md.c2) <= tolM });
            filas.push({ tipo: 'β₃', variable: `${etiqueta}: β₃ (${md.x} × ${md.m})`, pedido: num(md.c3), obtenido: num(betas[2], 3), ok: Math.abs(betas[2] - md.c3) <= tolM });
        });
    },

    // (Atlas, fase D) relación entre personas y dentro de la persona. Entre personas: las r entre ondas DISTINTAS divididas por la
    // raíz de las estabilidades (las del nivel propio); dentro: puntuaciones centradas en la persona y en la onda (sin ese doble
    // centrado, el cambio medio de X y de Y se colaría como relación); las medias de cada persona, con su valor esperado para K
    // ondas; y una sola onda, que mezcla los dos niveles. Las etiquetas identifican y no miden.
    // (Atlas, fase E1) relación en el tiempo: en cada desfase t → t+1, las regresiones tipificadas de Y_{t+1} sobre (Y_t, X_t) y de
    // X_{t+1} sobre (X_t, Y_t) dan los efectos cruzados y los autorregresivos (promediados entre desfases); la r en la misma onda,
    // promediada entre ondas. Las etiquetas identifican y no miden.
    // (Atlas, fase E2) estados con histéresis: la regla fuera de la franja y la memoria dentro se verifican (con la nitidez pedida y
    // la tolerancia binomial); el fenómeno, el bucle y las transiciones son informativos. Las etiquetas identifican y no miden.
    _informeHisteresis(base, filas, num) {
        const cfg = this.configuracion;
        if (!(cfg.histeresis || []).length) return;
        const pct = v => (Number.isFinite(v) ? `${(100 * v).toFixed(1)} %` : '—');
        (cfg.histeresis || []).forEach(h => {
            const g = (this.histeresisGenerada || []).find(x => x.x === h.x);
            if (!g || g.columnas.some(c => !base.tiene(c.nombre) || !base.tiene(c.total))) return;
            const X = g.columnas.map(c => Array.from(base.columna(c.total).datos)), S = g.columnas.map(c => Array.from(base.columna(c.nombre).datos));
            const r = resumenHisteresis(X, S, g.alto, g.bajo), eps = (h.ruido || 0) / 100, esperado = 1 - eps, tol = n => 3 * Math.sqrt(eps * (1 - eps) / Math.max(1, n)) + 0.01;
            const et = `Estado con histéresis de ${h.x} (${h.nombre})`, [bajo, alto] = h.etiquetas, fuera = r.fueraSigue / r.nFuera, dentro = r.dentroConserva / r.nDentro, cambian = r.personasConCambio / r.personas;
            filas.push({ tipo: 'regla', variable: `${et}: fuera de la franja, el estado sigue a X`, pedido: pct(esperado), obtenido: pct(fuera), ok: r.nFuera ? Math.abs(fuera - esperado) <= tol(r.nFuera) : null });
            filas.push({ tipo: 'memoria', variable: `${et}: dentro de la franja, conserva el estado anterior`, pedido: pct(esperado), obtenido: pct(dentro), ok: r.nDentro ? Math.abs(dentro - esperado) <= tol(r.nDentro) : null });
            filas.push({ tipo: 'fenómeno', variable: `${et}: con X dentro de la franja, en estado «${alto}»`, pedido: '—', obtenido: `${pct(r.altosDesdeAlto / r.nDesdeAlto)} si venía de «${alto}» y ${pct(r.altosDesdeBajo / r.nDesdeBajo)} si venía de «${bajo}»`, ok: null });
            // (revisión de la fase E2) el bucle, con los cambios que siguen la regla; la franja vacía (umbrales iguales por los empates)
            // se declara: sin franja no hay memoria ni histéresis
            const franja = r.nFranja / r.nObs;
            filas.push({ tipo: 'bucle', variable: `${et}: puntuación media al cambiar de estado siguiendo la regla`, pedido: '—', obtenido: r.nFranja === 0
                ? `la franja quedó vacía: los umbrales coinciden (${num(g.alto, 1)}) por los empates de la escala, así que el estado no tiene memoria; baja el umbral de salida o usa una escala con menos empates`
                : `entra con ${num(r.sumaEntra / r.nEntra, 1)} (umbral ${num(g.alto, 1)}) y sale con ${num(r.sumaSale / r.nSale, 1)} (umbral ${num(g.bajo, 1)}); en la franja entre los dos está el ${pct(franja)} de las observaciones`, ok: null });
            filas.push({ tipo: 'transiciones', variable: `${et}: personas que cambian de estado alguna vez`, pedido: '—', obtenido: `${r.personasConCambio} (${pct(cambian)})${cambian < 0.1 ? ': pocas; el fenómeno se ve en pocas personas' : ''}; de los ${r.cambios} cambios, ${r.cambiosFueraDeRegla} no siguen la regla (la nitidez)`, ok: null });
        });
    },

    _informePaneles(base, filas, num) {
        const cfg = this.configuracion;
        if (!(cfg.paneles || []).length) return;
        const n = base.n, exactas = cfg.correlacionesExactas !== false, media = a => a.reduce((s, v) => s + v, 0) / a.length;
        const ondasDe = nombre => { const p = (cfg.pruebas || []).find(x => x.nombre === nombre && !x.sufijo); return p ? [p].concat((cfg.pruebas || []).filter(x => x.base === p && x.onda).sort((a, b) => a.onda - b.onda)).map(x => base.columna(this.columnaDeEscala(x))) : null; };
        (cfg.paneles || []).forEach(pn => {
            const d = this._datosPanel(pn), cx = d && ondasDe(pn.x), cy = d && ondasDe(pn.y);
            if (!d || !cx || !cy || cx.length !== d.K || cy.length !== d.K || cx.concat(cy).some(c => !c)) return;
            const K = d.K, ok = [];
            for (let i = 0; i < n; i++) if (cx.every(c => Number.isFinite(c.datos[i])) && cy.every(c => Number.isFinite(c.datos[i]))) ok.push(i);
            if (ok.length < 10) return;
            const X = cx.map(c => ok.map(i => c.datos[i])), Y = cy.map(c => ok.map(i => c.datos[i])), m = ok.length;
            const bXY = [], bYX = [], aX = [], dY = [], misma = [this._corr(X[0], Y[0])];
            for (let t = 0; t < K - 1; t++) {
                const rMisma = this._corr(X[t], Y[t]);
                const regY = regresionRezagada(this._corr(Y[t], Y[t + 1]), this._corr(X[t], Y[t + 1]), rMisma), regX = regresionRezagada(this._corr(X[t], X[t + 1]), this._corr(Y[t], X[t + 1]), rMisma);
                bXY.push(regY.cruzado); dY.push(regY.propio); bYX.push(regX.cruzado); aX.push(regX.propio); misma.push(this._corr(X[t + 1], Y[t + 1]));
            }
            const cYX = pn.tipo === 'rezagada' ? 0 : pn.cYX, tolB = exactas ? 0.03 : Math.max(0.03, 2.5 / Math.sqrt(m * (K - 1) * Math.max(0.05, 1 - pn.r * pn.r))), tolR = exactas ? 0.03 : Math.max(0.03, 2 / Math.sqrt(m * K));
            const et = `Relación en el tiempo ${pn.x} ↔ ${pn.y}`;
            filas.push({ tipo: 'β cruzado', variable: `${et}: X de una onda → Y de la siguiente (controlando la Y anterior)`, pedido: num(pn.cXY), obtenido: num(media(bXY), 3), ok: Math.abs(media(bXY) - pn.cXY) <= tolB });
            filas.push({ tipo: 'β cruzado', variable: `${et}: Y de una onda → X de la siguiente (controlando la X anterior)`, pedido: num(cYX), obtenido: num(media(bYX), 3), ok: Math.abs(media(bYX) - cYX) <= tolB });
            filas.push({ tipo: 'β autorreg.', variable: `${et}: X de una onda → X de la siguiente (de su estabilidad)`, pedido: num(d.est.a), obtenido: num(media(aX), 3), ok: Math.abs(media(aX) - d.est.a) <= tolB });
            filas.push({ tipo: 'β autorreg.', variable: `${et}: Y de una onda → Y de la siguiente (de su estabilidad)`, pedido: num(d.est.d), obtenido: num(media(dY), 3), ok: Math.abs(media(dY) - d.est.d) <= tolB });
            filas.push({ tipo: 'r', variable: `${et}: en la misma onda (media de las ${K})`, pedido: num(pn.r), obtenido: num(media(misma), 3), ok: Math.abs(media(misma) - pn.r) <= tolR });
            filas.push({ tipo: 'fenómeno', variable: `${et}: qué muestran los datos`, pedido: '—', obtenido: fenomenoPanel(pn.tipo, media(bXY), media(bYX)), ok: null });
        });
    },

    _informeNiveles(base, filas, num) {
        const cfg = this.configuracion;
        if (!(cfg.niveles || []).length) return;
        const n = base.n, exactas = cfg.correlacionesExactas !== false, media = a => a.reduce((s, v) => s + v, 0) / a.length;
        const ondasDe = nombre => { const p = (cfg.pruebas || []).find(x => x.nombre === nombre && !x.sufijo); return p ? [p].concat((cfg.pruebas || []).filter(x => x.base === p && x.onda).sort((a, b) => a.onda - b.onda)).map(x => base.columna(this.columnaDeEscala(x))) : null; };
        (cfg.niveles || []).forEach(nv => {
            const d = this._datosNivel(nv), cx = d && ondasDe(nv.x), cy = d && ondasDe(nv.y);
            if (!d || !cx || !cy || cx.length !== d.K || cy.length !== d.K || cx.concat(cy).some(c => !c)) return;
            const K = d.K, ok = [];
            for (let i = 0; i < n; i++) if (cx.every(c => Number.isFinite(c.datos[i])) && cy.every(c => Number.isFinite(c.datos[i]))) ok.push(i);
            if (ok.length < 10) return;
            const col = (c) => ok.map(i => c.datos[i]), X = cx.map(col), Y = cy.map(col), m = ok.length;
            const mox = X.map(media), moy = Y.map(media), gx = media(mox), gy = media(moy), mx = [], my = [];
            let sxy = 0, sxx = 0, syy = 0;
            for (let j = 0; j < m; j++) {
                let px = 0, py = 0; for (let k = 0; k < K; k++) { px += X[k][j]; py += Y[k][j]; } px /= K; py /= K; mx.push(px); my.push(py);
                for (let k = 0; k < K; k++) { const dx = X[k][j] - px - mox[k] + gx, dy = Y[k][j] - py - moy[k] + gy; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
            }
            const cruz = [], estX = [], estY = [];
            for (let k = 0; k < K; k++) for (let l = 0; l < K; l++) { if (k !== l) cruz.push(this._corr(X[k], Y[l])); if (k < l) { estX.push(this._corr(X[k], X[l])); estY.push(this._corr(Y[k], Y[l])); } }
            const rEntre = media(estX) > 0 && media(estY) > 0 ? media(cruz) / Math.sqrt(media(estX) * media(estY)) : NaN;
            const rDentro = sxy / Math.sqrt(sxx * syy), rMedias = this._corr(mx, my), rMisma = this._corr(X[0], Y[0]);
            const e = esperadoNiveles(K, { iccX: d.iccX, iccY: d.iccY, rEntre: nv.rEntre, rDentro: nv.rDentro });
            const tolM = exactas ? 0.03 : Math.max(0.03, 2 / Math.sqrt(m)), tolW = exactas ? 0.03 : Math.max(0.03, 2 / Math.sqrt(m * (K - 1))), tolB = exactas ? 0.03 : Math.max(0.05, 3 / Math.sqrt(m));
            const et = `Relación entre niveles ${nv.x} ↔ ${nv.y}`;
            filas.push({ tipo: 'r entre', variable: `${et}: entre personas (sus niveles propios)`, pedido: num(nv.rEntre), obtenido: num(rEntre, 3), ok: Math.abs(rEntre - nv.rEntre) <= tolB });
            filas.push({ tipo: 'r dentro', variable: `${et}: dentro de la persona (centrada en la persona y en la onda)`, pedido: num(nv.rDentro), obtenido: num(rDentro, 3), ok: Math.abs(rDentro - nv.rDentro) <= tolW });
            filas.push({ tipo: 'r', variable: `${et}: medias de cada persona (${K} ondas)`, pedido: `≈ ${num(e.rMedias)}`, obtenido: num(rMedias, 3), ok: Math.abs(rMedias - e.rMedias) <= tolM });
            filas.push({ tipo: 'r', variable: `${et}: en una sola onda (T1), que mezcla los dos niveles`, pedido: num(e.rMisma), obtenido: num(rMisma, 3), ok: Math.abs(rMisma - e.rMisma) <= tolM });
            filas.push({ tipo: 'fenómeno', variable: `${et}: qué muestran los datos`, pedido: '—', obtenido: fenomenoNiveles(rEntre, rDentro), ok: null });
        });
    },

    _informeRepetidas(base, filas, num) {
        const cfg = this.configuracion, lista = cfg.medidasRepetidas || [];
        if (!lista.length) return;
        const n = base.n, exactas = cfg.correlacionesExactas !== false;
        const tolR = exactas ? 0.03 : Math.max(0.03, 2 / Math.sqrt(Math.max(4, n)));
        const tolD = exactas ? 0.06 : Math.max(0.06, 2 / Math.sqrt(Math.max(4, n)));
        const vistas = new Set();
        lista.forEach(mr => {
            if (vistas.has(mr.variable)) return;
            vistas.add(mr.variable);
            const p = (cfg.pruebas || []).find(x => x.nombre === mr.variable && !x.sufijo);
            if (!p) return;
            const clones = (cfg.pruebas || []).filter(x => x.base === p && x.onda);   // solo ondas (no informantes)
            if (!clones.length) return;
            const K = clones[clones.length - 1].onda;
            const t1 = base.columna(this.columnaDeEscala(p));
            if (!t1) return;
            const agrup = mr.agrupacion ? (cfg.sociodemograficos || []).find(s => s.categoria === mr.agrupacion && s.distribucion === 'binaria') : null;
            const codigos = agrup && base.tiene(agrup.categoria) ? base.columna(agrup.categoria).datos : null;
            const stab = Math.max(-0.99, Math.min(0.99, mr.estabilidad));
            const desv = arr => { const m = arr.reduce((s, v) => s + v, 0) / arr.length; return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, arr.length - 1)); };
            // En modo exacto solo queda el ruido del redondeo de los dos totales
            // (Likert: enteros; continua: 2 decimales): varianza 2·unidad²/12.
            const unidad = (p.minimo !== null && p.maximo !== null) ? 1 : 0.01;
            const eeRedondeo = (nk, sd1) => unidad * Math.sqrt(2 / 12) / Math.sqrt(Math.max(1, nk)) / (sd1 || 1);
            clones.forEach(cl => {
                const tk = base.columna(this.columnaDeEscala(cl));
                if (!tk) return;
                const frac = (cl.onda - 1) / (K - 1);
                const x = [], y = [], g = [];
                for (let i = 0; i < n; i++) if (isFinite(t1.datos[i]) && isFinite(tk.datos[i])) { x.push(t1.datos[i]); y.push(tk.datos[i]); if (codigos) g.push(codigos[i]); }
                if (x.length < 10) return;
                const rObs = this._corr(x, y);
                let rPed = mr.modelo === 'intercepto' ? stab : Math.pow(stab, cl.onda - 1);   // (fase D) interceptos: la misma r
                const rPanel = this._rOndasPanel(mr.variable, cl.onda); if (rPanel !== null) rPed = rPanel;   // (fase E1) con efectos cruzados, la de la dinámica
                if (mr.modelo === 'crecimiento') {   // (C4) r implicada por el modelo de crecimiento
                    const vb = Math.max(0, Math.min(0.99, mr.estabilidad)), ss = Math.max(0, mr.dePendientes || 0), rip = Math.max(-0.95, Math.min(0.95, mr.rInterceptoPendiente || 0));
                    const tau = (cl.onda - 1) / (K - 1);
                    rPed = (vb + rip * Math.sqrt(vb) * ss * tau) / Math.sqrt(1 + ss * ss * tau * tau + 2 * rip * Math.sqrt(vb) * ss * tau);
                }
                const etiqueta = `${mr.variable}: T1 → T${cl.onda}`;
                filas.push({ tipo: 'r_tt', variable: `${etiqueta} estabilidad`, pedido: num(rPed, 3), obtenido: num(rObs, 3), ok: Math.abs(rObs - rPed) <= tolR });
                const sd1 = desv(x) || 1;
                if (!codigos) {
                    const dObs = (y.reduce((s, v) => s + v, 0) - x.reduce((s, v) => s + v, 0)) / x.length / sd1;
                    const dPed = (mr.cambio || 0) * frac;
                    filas.push({ tipo: 'd cambio', variable: `${etiqueta} cambio (media T${cl.onda} − media T1, en DE de T1)`, pedido: num(dPed), obtenido: num(dObs), ok: Math.abs(dObs - dPed) <= Math.max(tolD, exactas ? 2 * eeRedondeo(x.length, sd1) : tolD) });
                } else {
                    const porGrupo = [0, 1].map(codigo => { const dx = [], dy = []; for (let i = 0; i < x.length; i++) if (g[i] === codigo) { dx.push(x[i]); dy.push(y[i]); } return { n: dx.length, cambio: dx.length ? (dy.reduce((s, v) => s + v, 0) - dx.reduce((s, v) => s + v, 0)) / dx.length / sd1 : NaN }; });
                    const c0 = (mr.cambio || 0) * frac, c1 = (isFinite(mr.cambioGrupo) && mr.cambioGrupo !== null ? mr.cambioGrupo : (mr.cambio || 0)) * frac;
                    const tolG = k => Math.max(tolD, exactas ? 2 * eeRedondeo(porGrupo[k].n, sd1) : 2 / Math.sqrt(Math.max(4, porGrupo[k].n)));
                    if (porGrupo[0].n >= 5) filas.push({ tipo: 'd cambio', variable: `${etiqueta} cambio en ${mr.agrupacion} = 0`, pedido: num(c0), obtenido: num(porGrupo[0].cambio), ok: Math.abs(porGrupo[0].cambio - c0) <= tolG(0) });
                    if (porGrupo[1].n >= 5) filas.push({ tipo: 'd cambio', variable: `${etiqueta} cambio en ${mr.agrupacion} = 1`, pedido: num(c1), obtenido: num(porGrupo[1].cambio), ok: Math.abs(porGrupo[1].cambio - c1) <= tolG(1) });
                    if (porGrupo[0].n >= 5 && porGrupo[1].n >= 5) {
                        const inter = porGrupo[1].cambio - porGrupo[0].cambio;
                        filas.push({ tipo: 'interacción', variable: `${etiqueta} tiempo × ${mr.agrupacion} (diferencia de cambios)`, pedido: num(c1 - c0), obtenido: num(inter), ok: Math.abs(inter - (c1 - c0)) <= Math.max(tolG(0), tolG(1)) });
                    }
                }
            });
        });
    },

    // (Atlas, dimensión B4) el par con atípicos: la r de la mayoría (la pedida en la tabla), la de la base completa (la pedida
    // con los atípicos), la ρ de Spearman (por rangos, menos sensible a ellos) y dónde quedaron los casos
    _informeAtipicos(filas, num, at, x, y, n, a, b) {
        const k = at.casos, mayoria = [[], []], todos = [[], []];
        for (let i = 0; i < n; i++) if (isFinite(x[i]) && isFinite(y[i])) { todos[0].push(x[i]); todos[1].push(y[i]); if (i < n - k) { mayoria[0].push(x[i]); mayoria[1].push(y[i]); } }
        const rMay = this._corr(mayoria[0], mayoria[1]), rTodos = this._corr(todos[0], todos[1]), exacto = this.configuracion.correlacionesExactas !== false;
        const tolMay = exacto ? 0.03 : 3 * (1 - at.rMayoria * at.rMayoria) / Math.sqrt(mayoria[0].length);
        filas.push({ tipo: 'r', variable: `${a} ↔ ${b} (la mayoría, sin los ${k} casos atípicos)`, pedido: num(at.rMayoria), obtenido: num(rMay, 3), ok: Math.abs(rMay - at.rMayoria) <= tolMay });
        filas.push({ tipo: 'r con atípicos', variable: `${a} ↔ ${b}: r de la base completa, con los ${k} casos atípicos (filas ${n - k + 1}–${n})`, pedido: num(at.rCon), obtenido: num(rTodos, 3), ok: Math.abs(rTodos - at.rCon) <= 0.015 });
        filas.push({ tipo: 'ρ', variable: `${a} ↔ ${b}: ρ de Spearman con los atípicos (por rangos, menos sensible a ellos)`, pedido: '—', obtenido: num(spearman(todos[0], todos[1]), 3), ok: null });
        const media = v => v.reduce((s, t) => s + t, 0) / v.length, de = v => { const m = media(v); return Math.sqrt(v.reduce((s, t) => s + (t - m) ** 2, 0) / v.length); };
        const [mx, my, dx, dy] = [media(mayoria[0]), media(mayoria[1]), de(mayoria[0]), de(mayoria[1])];
        const dist = []; for (let i = n - k; i < n; i++) if (isFinite(x[i]) && isFinite(y[i])) dist.push(Math.sqrt((((x[i] - mx) / dx) ** 2 + ((y[i] - my) / dy) ** 2) / 2));
        filas.push({ tipo: 'atípicos', variable: `${a} ↔ ${b}: distancia media de los ${k} casos atípicos a la mayoría (en DE, en X y en Y)`, pedido: '—', obtenido: `${num(media(dist), 1)} DE`, ok: null });
    },

    // (Atlas, dimensión B3) la selección: su resumen, la u de X (DE tras la selección / DE poblacional) y la corrección de
    // Thorndike (Caso II) de cada r de X, que debe devolver la ρ de la población (informativa si X no es normal: el Caso II
    // supone linealidad y homocedasticidad)
    // Combina el informe de la base limpia (verificación del generador) con el de la base final (con imperfecciones): cada fila
    // limpia conserva su pedido, su obtenido y su estado, y anota el valor final si cambia; las filas que solo existen al final
    // (tasas de imperfecciones, niveles por puntos de corte, que se calculan sobre los totales finales) se conservan tal cual
    _combinarConImperfecciones(limpias, finales) {
        const clave = f => `${f.tipo}|${f.variable}`, porClave = new Map(finales.map(f => [clave(f), f])), usadas = new Set();
        const salida = [{ tipo: 'imperfecciones', variable: 'El informe verifica la base ANTES de aplicar las imperfecciones pedidas (perdidos, descuidados, estilos de respuesta, digitación); bajo cada valor obtenido, el de la base final con ellas', pedido: '—', obtenido: '—', ok: null }];
        for (const f of limpias) {
            const k = clave(f), g = porClave.get(k); usadas.add(k);
            salida.push(g && String(g.obtenido) !== String(f.obtenido) ? { ...f, conImperfecciones: g.obtenido } : f);
        }
        for (const g of finales) if (!usadas.has(clave(g))) salida.push(g);
        return salida;
    },

    _informeSeleccion(base, filas, num, sel, columnaDe) {
        const cfg = this.configuracion, X = sel.variable, eX = sel.porNombre.get(X), valores = c => { const d = base.columna(c).datos, out = []; for (let i = 0; i < d.length; i++) if (isFinite(d[i])) out.push(d[i]); return out; };
        const cx = columnaDe(X); if (!eX || !cx || !base.tiene(cx)) return;
        const vx = valores(cx), n = vx.length, mx = vx.reduce((s, v) => s + v, 0) / n, deObs = Math.sqrt(vx.reduce((s, v) => s + (v - mx) ** 2, 0) / (n - 1));
        const uObs = deObs / eX.dePoblacion, uEsp = eX.de / eX.dePoblacion;
        filas.push({ tipo: 'selección', variable: `Selección: el ${Math.round(100 * sel.proporcion)} % ${sel.lado} de ${X} (de una población de ${tamanoPoblacion(cfg.tamanoMuestra, sel.proporcion)} casos se conservan ${cfg.tamanoMuestra}); las tablas describen la población`, pedido: '—', obtenido: '—', ok: null });
        filas.push({ tipo: 'u', variable: `${X}: u = DE tras la selección / DE en la población (${num(eX.dePoblacion)})`, pedido: `≈ ${num(uEsp, 3)}`, obtenido: num(uObs, 3), ok: Math.abs(uObs - uEsp) <= (3 * sel.eeDE(X, n)) / eX.dePoblacion + 0.01 });
        (cfg.correlaciones || []).filter(c => (c.a === X || c.b === X) && c.origen !== 'repetidas').forEach(c => {
            const otra = c.a === X ? c.b : c.a, co = columnaDe(otra); if (!co || !base.tiene(co)) return;
            const dx = base.columna(cx).datos, dy = base.columna(co).datos, u = [], w = [];
            for (let i = 0; i < dx.length; i++) if (isFinite(dx[i]) && isFinite(dy[i])) { u.push(dx[i]); w.push(dy[i]); }
            const rObs = this._corr(u, w), rho = corregirThorndike(rObs, uObs), h = 1e-4;
            // tolerancia por el método delta: 3 errores típicos de r propagados por la corrección, más un margen
            // tolerancia por el método delta con el error típico de r del propio modelo (la cola no es normal)
            // un par fuera del modelo (un puntaje general) no tiene error típico propio: el de la normal (sin él, la tolerancia era
            // NaN y cualquier comparación fallaba)
            const eeModelo = sel.eeR(X, otra, u.length), ee = eeModelo !== null ? eeModelo : (1 - rObs * rObs) / Math.sqrt(u.length);
            const derivada = Math.abs((corregirThorndike(rObs + h, uObs) - corregirThorndike(rObs - h, uObs)) / (2 * h)), tol = 3 * derivada * ee + 0.01;
            const informativa = !eX.normal ? ' (informativa: el Caso II supone X normal)' : '';
            // (revisión 2026.11.14) la etiqueta identifica y no mide: la r y la u observadas van en lo obtenido (con imperfecciones,
            // una etiqueta con datos no encontraba su pareja limpia y la fila salía dos veces)
            filas.push({ tipo: 'ρ corregida', variable: `${X} ↔ ${otra}: r de la muestra corregida por Thorndike (Caso II)${informativa}`, pedido: num(c.r), obtenido: `${num(rho, 3)} (r = ${num(rObs, 3)}, u = ${num(uObs, 3)})`, ok: informativa ? null : Math.abs(rho - c.r) <= tol });
        });
    },

    _informeSociodemograficos(base, filas, num) {
        const cfg = this.configuracion, socios = cfg.sociodemograficos || [];
        const n = base.n, exactas = cfg.correlacionesExactas !== false;
        socios.forEach(s => {
            if (!s.niveles || !this._esSocioDiscreto(s) || !base.tiene(s.categoria)) return;
            const datos = base.columna(s.categoria).datos;
            const conteos = new Map(); let total = 0;
            for (let i = 0; i < n; i++) if (datos[i] === datos[i]) { conteos.set(datos[i], (conteos.get(datos[i]) || 0) + 1); total++; }
            if (!total) return;
            const obtenidas = s.niveles.map(x => ((conteos.get(x.codigo) || 0) / total));
            const maxDif = Math.max(...s.niveles.map((x, k) => Math.abs(obtenidas[k] - x.proporcion)));
            const tol = (exactas || s.dependeDe) ? 1 / total + 1e-9 : Math.max(0.03, 2 * Math.sqrt(0.25 / total));
            filas.push({ tipo: '%', variable: `${s.categoria} (${s.niveles.map(x => x.etiqueta || x.codigo).join(' / ')})`, pedido: s.niveles.map(x => Math.round(x.proporcion * 100) + '%').join(' / '), obtenido: obtenidas.map(p => (p * 100).toFixed(1) + '%').join(' / '), ok: maxDif <= tol });
        });
        socios.forEach(s => {
            if (!s.dependeDe || !this._esSocioDiscreto(s)) return;
            const ref = socios.find(x => x.categoria === s.dependeDe);
            if (!ref || !base.tiene(s.categoria) || !base.tiene(ref.categoria)) return;
            const V = this._cramerV(base.columna(ref.categoria).datos, base.columna(s.categoria).datos);
            const esperada = s.fuerza > 0 ? this._vEsperada(s, ref) : 0;
            const tol = Math.max(0.06, 2.5 / Math.sqrt(Math.max(4, n)));
            filas.push({ tipo: 'V', variable: `${s.categoria} según ${ref.categoria} (V de Cramér; fuerza latente ${num(s.fuerza)})`, pedido: esperada === null ? '—' : num(esperada, 3), obtenido: num(V, 3), ok: esperada === null ? true : Math.abs(V - esperada) <= tol });
        });
    },

    // Informe de la estructura factorial de cada test con matriz
    _informeEstructuras(base, filas, num) {
        const cfg = this.configuracion, lista = cfg.estructuras || [];
        if (!lista.length) return;
        const n = base.n, exactas = cfg.correlacionesExactas !== false;
        // las cargas de ítem llevan el ruido de muestreo del ítem aunque los totales sean exactos
        const tolCarga = Math.max(0.06, 2.5 / Math.sqrt(Math.max(4, n)));
        const est = arr => { const m = arr.reduce((s, v) => s + v, 0) / arr.length; const sd = Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length) || 1e-9; return arr.map(v => (v - m) / sd); };
        lista.forEach(e => {
            const dims = (cfg.pruebas || []).filter(p => p.prueba === e.prueba && !p.sufijo && p.tipo !== 'general' && p.numItems >= 2 && this.perfilesItems && this.perfilesItems.get(p) && this.perfilesItems.get(p).estructura);
            if (!dims.length) return;
            // ítems recodificados y casos completos del test entero
            const columnasPorDim = new Map();
            dims.forEach(p => columnasPorDim.set(p, this._itemsDe(p).map(k => base.columna(k)).filter(Boolean)));
            const totalPorDim = new Map(dims.map(p => [p, base.columna(this.columnaDeEscala(p))]));   // una búsqueda por dimensión, no por caso
            // casos completos del TEST (para SRMR/KMO) y de cada DIMENSIÓN (para sus cargas)
            const completosTest = [];
            for (let i = 0; i < n; i++) if (dims.every(p => columnasPorDim.get(p).every(c => isFinite(c.datos[i])) && isFinite(totalPorDim.get(p).datos[i]))) completosTest.push(i);
            const completosDe = p => { const out = []; const cols = columnasPorDim.get(p), tot = totalPorDim.get(p); for (let i = 0; i < n; i++) if (cols.every(c => isFinite(c.datos[i])) && isFinite(tot.datos[i])) out.push(i); return out; };
            const itemsDe = (p, casos) => columnasPorDim.get(p).map((c, j) => casos.map(i => this._recodificar(p, j + 1, c.datos[i])));
            const totalZDe = (p, casos) => { const tot = totalPorDim.get(p).datos; return est(casos.map(i => tot[i])); };
            const totalesZ = new Map(); dims.forEach(p => totalesZ.set(p, totalZDe(p, completosTest)));
            const todos = [];
            dims.forEach(p => {
                const est1 = this.perfilesItems.get(p).estructura;
                const completos = completosDe(p);
                if (completos.length < 30) return;
                const cols = itemsDe(p, completos);
                const zPropio = totalZDe(p, completos);
                const R = this._matrizCorrelacion(cols);
                const cargas = this._pafUnFactor(R);
                if (!cargas) return;
                const pedidas = Array.from(est1.lambda);
                const mediaP = pedidas.reduce((s, l) => s + l, 0) / pedidas.length, mediaO = cargas.reduce((s, l) => s + l, 0) / cargas.length;
                const maxDesv = Math.max(...cargas.map((l, i) => Math.abs(l - pedidas[i])));
                filas.push({ tipo: 'λ', variable: `${p.nombre}: cargas propias (ejes principales; media, y desviación máxima por ítem)`, pedido: num(mediaP, 2), obtenido: `${num(mediaO, 2)} (máx. desv. ${num(maxDesv, 2)})`, ok: Math.abs(mediaO - mediaP) <= 0.03 + (exactas ? 0 : 1 / Math.sqrt(n)) && maxDesv <= tolCarga * 1.5 });
                // cruzadas: coeficiente estandarizado del ítem sobre [total propio, total ajeno]
                (this.perfilesItems.get(p).cruzadas || []).forEach(cz => {
                    const otra = dims.find(d => d.nombreCorto === cz.sigla);
                    if (!otra) return;
                    // casos completos de ambas dimensiones
                    const casos = completos.filter(i => columnasPorDim.get(otra).every(c => isFinite(c.datos[i])) && isFinite(base.columna(this.columnaDeEscala(otra)).datos[i]));
                    if (casos.length < 30) return;
                    const item = casos.map(i => this._recodificar(p, cz.item + 1, columnasPorDim.get(p)[cz.item].datos[i]));
                    const betas = this._betasEstandarizadas(item, [totalZDe(p, casos), totalZDe(otra, casos)]);
                    if (!betas) return;
                    filas.push({ tipo: 'λ×', variable: `${p.nombre} ítem ${cz.item + 1}: carga cruzada sobre ${otra.nombre}`, pedido: num(cz.c, 2), obtenido: num(betas[1], 2), ok: Math.abs(betas[1] - cz.c) <= Math.max(0.06, 2.5 / Math.sqrt(Math.max(4, casos.length))) });
                });
                // fiabilidad implícita frente a la obtenida
                const indice = cfg.indiceFiabilidad === 'omega' ? 'omega' : 'alfa';
                const impl = indice === 'omega' ? est1.omegaImplicito : est1.alfaImplicito;
                if (isFinite(impl)) {
                    const obs = this._indiceObservado(cols, indice);
                    if (obs !== null && isFinite(obs)) filas.push({ tipo: indice === 'omega' ? 'ω' : 'α', variable: `${p.nombre} (implícito por las cargas)`, pedido: num(impl, 3), obtenido: num(obs, 3), ok: Math.abs(obs - impl) <= (p.distribucion === 'normal' ? 0.04 : 0.06) });
                }
                // método: ejes principales sobre los residuos de los ítems de método tras su total
                if (est1.metodo && est1.metodo.items.length >= 2) {
                    const residuos = est1.metodo.items.map(i => { const z = est(cols[i]); const t = zPropio; let sxy = 0, sxx = 0; for (let q = 0; q < z.length; q++) { sxy += z[q] * t[q]; sxx += t[q] * t[q]; } const b = sxy / sxx; return z.map((v, q) => v - b * t[q]); });
                    const cargasMet = this._pafUnFactor(this._matrizCorrelacion(residuos));
                    if (cargasMet) { const mediaM = cargasMet.reduce((s, l) => s + Math.abs(l), 0) / cargasMet.length; filas.push({ tipo: 'λmét', variable: `${p.nombre}: factor de método (${est1.metodo.items.length} ítems; carga media residual)`, pedido: num(est1.metodo.carga, 2), obtenido: num(mediaM, 2), ok: Math.abs(mediaM - est1.metodo.carga) <= Math.max(0.08, tolCarga) }); }
                }
            });
            // ajuste del test completo (casos completos del test): SRMR entre R
            // observada y la implicada por la estructura pedida (sin los pares de
            // desajuste), frente al SRMR esperado por esos pares y el error muestral
            if (completosTest.length >= 30) {
                todos.length = 0;
                dims.forEach(p => itemsDe(p, completosTest).forEach(c => todos.push(c)));
            }
            if (todos.length >= 3 && completosTest.length >= 30) {
                const completos = completosTest;
                const impl = this._matrizImplicadaTest(dims);
                const Robs = this._matrizCorrelacion(todos);
                const K = todos.length;
                if (impl) {
                    let suma = 0, cuenta = 0;
                    for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) { suma += (Robs[a][b] - impl.R[a][b]) ** 2; cuenta++; }
                    const srmr = Math.sqrt(suma / cuenta);
                    // esperado: desajuste de los pares + error muestral de las correlaciones (≈ 0.9/√n)
                    const piso = 0.9 / Math.sqrt(Math.max(4, completos.length));
                    const esperado = Math.sqrt(impl.srmrPares * impl.srmrPares + piso * piso);
                    const nivel = e.desajuste || 'ninguno';
                    filas.push({ tipo: 'SRMR', variable: `${e.prueba}: SRMR entre la matriz de ítems observada y la implicada por la estructura (desajuste «${nivel}»; incluye el error muestral)`, pedido: num(esperado, 3), obtenido: num(srmr, 3), ok: Math.abs(srmr - esperado) <= Math.max(0.015, 0.6 * piso) });
                }
                const kb = this._kmoBartlett(Robs, completos.length);
                if (kb) filas.push({ tipo: 'KMO', variable: `${e.prueba}: KMO global y esfericidad de Bartlett (χ² gl ${kb.gl})`, pedido: '≥ 0.60; p < .001', obtenido: `${num(kb.kmo, 2)}; χ² = ${num(kb.chi2, 0)} ${kb.significativo ? '(p < .001)' : '(no significativo)'}`, ok: kb.kmo >= 0.6 && kb.significativo });
            }
        });
    },

    _informeDesenlacesYCortes(base, filas, num) {
        const cfg = this.configuracion, n = base.n;
        (cfg.desenlaces || []).forEach(d => {
            if (!base.tiene(d.nombre)) return;
            const y = base.columna(d.nombre).datos;
            const casos = [];
            const preds = d.predictores.map(pr => this._columnaPredictor(base, pr.variable)).filter(Boolean);
            for (let i = 0; i < n; i++) if (y[i] === y[i] && preds.every(c => c[i] === c[i])) casos.push(i);
            if (casos.length < 20) return;
            const est = col => { const v = casos.map(i => col[i]); const m = v.reduce((s, x) => s + x, 0) / v.length; const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) || 1; return v.map(x => (x - m) / sd); };
            const X = preds.map(est);
            // prevalencia/proporciones sobre TODOS los casos con desenlace; los OR sobre los casos completos
            const todosY = []; for (let i = 0; i < n; i++) if (y[i] === y[i]) todosY.push(y[i]);
            if (d.tipo === 'binario') {
                const yy = casos.map(i => y[i]);
                const prev = todosY.reduce((s, v) => s + v, 0) / todosY.length;
                filas.push({ tipo: 'prevalencia', variable: `${d.nombre} (desenlace binario)`, pedido: num(d.prevalencia * 100, 1) + '%', obtenido: num(prev * 100, 1) + '%', ok: Math.abs(prev - d.prevalencia) <= 1 / todosY.length + 1e-9 });
                const fit = X.length ? this._glm(yy, X, 'logit') : null;
                if (fit) d.predictores.forEach((pr, j) => { const b = fit.beta[j + 1], ee = fit.ee[j + 1]; filas.push({ tipo: 'OR', variable: `${d.nombre} ~ ${pr.variable} (OR por DE, regresión logística)`, pedido: num(pr.efecto, 2), obtenido: num(Math.exp(b), 2), ok: Math.abs(b - Math.log(pr.efecto)) <= 2.5 * (isFinite(ee) ? ee : 0.15) + 0.05 }); });
            } else if (d.tipo === 'conteo') {
                const yy = casos.map(i => y[i]);
                const media = yy.reduce((s, v) => s + v, 0) / yy.length;
                filas.push({ tipo: 'media', variable: `${d.nombre} (conteo)`, pedido: num(d.media, 2), obtenido: num(media, 2), ok: Math.abs(media - d.media) <= 3 * Math.sqrt(d.media / yy.length) + 0.02 });
                const fit = X.length ? this._glm(yy, X, 'log') : null;
                if (fit) d.predictores.forEach((pr, j) => { const b = fit.beta[j + 1], ee = fit.ee[j + 1]; filas.push({ tipo: 'IRR', variable: `${d.nombre} ~ ${pr.variable} (IRR por DE, regresión de Poisson)`, pedido: num(pr.efecto, 2), obtenido: num(Math.exp(b), 2), ok: Math.abs(b - Math.log(pr.efecto)) <= 2.5 * (isFinite(ee) ? ee : 0.15) + 0.05 }); });
            } else {
                const yy = casos.map(i => y[i]);
                const conteos = new Map(); todosY.forEach(v => conteos.set(v, (conteos.get(v) || 0) + 1));
                const obt = d.niveles.map(nv => (conteos.get(nv.codigo) || 0) / todosY.length);
                filas.push({ tipo: '%', variable: `${d.nombre} (ordinal: ${d.niveles.map(x => x.etiqueta).join(' / ')})`, pedido: d.niveles.map(x => Math.round(x.proporcion * 100) + '%').join(' / '), obtenido: obt.map(p => (p * 100).toFixed(1) + '%').join(' / '), ok: Math.max(...d.niveles.map((x, k) => Math.abs(obt[k] - x.proporcion))) <= 1 / todosY.length + 1e-9 });
                // odds proporcionales: OR en la dicotomía más cercana a la mediana
                let acum = 0, corte = 1; for (let k = 0; k < d.niveles.length - 1; k++) { acum += d.niveles[k].proporcion; if (Math.abs(acum - 0.5) < Math.abs((acum - d.niveles[k].proporcion) - 0.5) || k === 0) corte = k + 1; }
                const yb = yy.map(v => (v > corte ? 1 : 0));
                const fit = X.length ? this._glm(yb, X, 'logit') : null;
                if (fit) d.predictores.forEach((pr, j) => { const b = fit.beta[j + 1], ee = fit.ee[j + 1]; filas.push({ tipo: 'OR', variable: `${d.nombre} ~ ${pr.variable} (OR por DE; odds proporcionales, dicotomía «> ${d.niveles[corte - 1].etiqueta}»)`, pedido: num(pr.efecto, 2), obtenido: num(Math.exp(b), 2), ok: Math.abs(b - Math.log(pr.efecto)) <= 2.5 * (isFinite(ee) ? ee : 0.15) + 0.05 }); });
            }
        });
        (this.cortesGenerados || []).forEach(c => {
            if (!base.tiene(c.columna)) return;
            const datos = base.columna(c.columna).datos;
            const conteos = new Map(); let total = 0;
            for (let i = 0; i < n; i++) if (datos[i] === datos[i]) { conteos.set(datos[i], (conteos.get(datos[i]) || 0) + 1); total++; }
            const obt = c.etiquetas.map((e, k) => (conteos.get(k + 1) || 0) / Math.max(1, total));
            const pedido = c.porPercentil ? c.percentiles.concat([100]).map((p, k) => (p - (k ? c.percentiles[k - 1] : 0)) + '%').join(' / ') : `cortes en ${c.cortes.map(x => num(x, 2)).join(', ')}`;
            // con empates en el corte (totales enteros), la desviación admisible es la masa del empate
            const tol = c.porPercentil ? (c.empateMax + 1) / Math.max(1, total) + 1e-9 : 1;
            const ok = c.porPercentil ? Math.max(...obt.map((p, k) => Math.abs(p - ((c.percentiles.concat([100])[k] - (k ? c.percentiles[k - 1] : 0)) / 100)))) <= tol : true;
            filas.push({ tipo: 'niveles', variable: `${c.columna} (${c.variable}: ${c.etiquetas.join(' / ')})${c.porPercentil && c.empateMax > 1 ? ' — por percentil, con empates en los cortes' : ''}`, pedido, obtenido: obt.map(p => (p * 100).toFixed(1) + '%').join(' / '), ok });
        });
    },

    _informeEfectosCompuestos(base, filas, columnaDe, num) {
        const cfg = this.configuracion, n = base.n;
        const exactas = cfg.correlacionesExactas !== false && this.driversOrtogonalizados === true;
        (cfg.diferenciasGrupo || []).forEach(dif => {
            if (!dif.tipo || dif.tipo === 'd') return;
            const cv = columnaDe(dif.cuantitativa);
            const A = (cfg.sociodemograficos || []).find(s => s.categoria === dif.agrupacion);
            if (!cv || !A || !base.tiene(cv) || !base.tiene(A.categoria)) return;
            const valores = base.columna(cv).datos, codA = base.columna(A.categoria).datos;
            if (dif.tipo === 'interaccion') {
                const B = (cfg.sociodemograficos || []).find(s => s.categoria === dif.agrupacion2);
                if (!B || !base.tiene(B.categoria)) return;
                const obs = this._dInteraccion(valores, codA, base.columna(B.categoria).datos);
                if (obs === null) return;
                // EE aproximado de la diferencia de diferencias: 2/√n̄ con n̄ por celda
                const tol = exactas ? 0.06 : Math.max(0.06, 2 * 2 / Math.sqrt(Math.max(4, n / 4)));
                filas.push({ tipo: 'd×', variable: `${dif.cuantitativa}: interacción ${dif.agrupacion} × ${dif.agrupacion2} (diferencia de diferencias / DE intra-celda)`, pedido: num(dif.d), obtenido: num(obs), ok: Math.abs(obs - dif.d) <= tol });
            } else if (dif.tipo === 'icc') {
                const obs = this._iccAnova(valores, codA);
                if (obs === null) return;
                const K = this._nivelesDe(A) ? this._nivelesDe(A).length : 2;
                // el estimador ANOVA fluctúa con el número de conglomerados: ≈ (1 − CCI)·√(2/(K − 1))
                const tol = Math.max(0.03, 1.2 * (1 - dif.d) * Math.sqrt(2 / Math.max(1, K - 1)));
                filas.push({ tipo: 'CCI', variable: `${dif.cuantitativa}: coeficiente de correlación intraclase por ${dif.agrupacion} (${K} grupos; ANOVA)`, pedido: num(dif.d, 3), obtenido: num(obs, 3), ok: Math.abs(obs - dif.d) <= tol });
            }
        });
    },

    _informeConcordancia(base, filas, num) {
        const cfg = this.configuracion, n = base.n, exactas = cfg.correlacionesExactas !== false;
        // informantes: r de concordancia y sesgo (media informante − media base, en DE de la base)
        (cfg.pruebas || []).filter(p => p.informante && p.base).forEach(cl => {
            const c1 = base.columna(this.columnaDeEscala(cl.base)), c2 = base.columna(this.columnaDeEscala(cl));
            if (!c1 || !c2) return;
            const x = [], y = [];
            for (let i = 0; i < n; i++) if (isFinite(c1.datos[i]) && isFinite(c2.datos[i])) { x.push(c1.datos[i]); y.push(c2.datos[i]); }
            if (x.length < 10) return;
            const rPed = (cfg.correlaciones || []).find(c => c.origen === 'repetidas' && ((c.a === cl.base.nombre && c.b === cl.nombre) || (c.b === cl.base.nombre && c.a === cl.nombre)));
            const rObs = this._corr(x, y);
            if (rPed) filas.push({ tipo: 'r inf', variable: `${cl.base.nombre}: concordancia autoinforme ↔ ${cl.informante}`, pedido: num(rPed.r, 3), obtenido: num(rObs, 3), ok: Math.abs(rObs - rPed.r) <= (exactas ? 0.03 : Math.max(0.03, 2 / Math.sqrt(n))) });
            const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length;
            const sd1 = Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0) / Math.max(1, x.length - 1)) || 1;
            const sesgoPed = (cl.media - cl.base.media) / cl.base.desviacion;
            filas.push({ tipo: 'd sesgo', variable: `${cl.base.nombre}: sesgo de ${cl.informante} (media informante − media autoinforme, en DE)`, pedido: num(sesgoPed), obtenido: num((my - mx) / sd1), ok: Math.abs((my - mx) / sd1 - sesgoPed) <= (exactas ? 0.06 : Math.max(0.06, 2 / Math.sqrt(n))) });
        });
        // jueces
        (this.juecesGenerados || []).forEach(j => {
            const cols = j.columnas.map(c => base.tiene(c) ? base.columna(c).datos : null);
            if (cols.some(c => !c)) return;
            if (j.tipo === 'jueces') {
                const kf = this._kappaFleiss(cols);
                if (!kf) return;
                const tol = Math.max(0.05, 2.5 / Math.sqrt(Math.max(4, n)));
                filas.push({ tipo: 'κ', variable: `${j.variable}: κ de Fleiss entre ${j.columnas.length} jueces (acuerdo bruto ${(kf.acuerdo * 100).toFixed(0)} %)`, pedido: num(j.kappa, 2), obtenido: num(kf.kappa, 3), ok: Math.abs(kf.kappa - j.kappa) <= tol });
            } else {
                // CCI(1) con las personas como grupos y las puntuaciones de los jueces como réplicas
                const valores = [], codigos = [];
                for (let i = 0; i < n; i++) cols.forEach(c => { if (c[i] === c[i]) { valores.push(c[i]); codigos.push(i); } });
                const icc = this._iccAnova(valores, codigos);
                if (icc === null) return;
                const tol = Math.max(0.03, 2 * (1 - j.icc) / Math.sqrt(Math.max(4, n)));
                filas.push({ tipo: 'CCI jueces', variable: `${j.variable}: CCI(1) entre ${j.columnas.length} jueces (ANOVA, personas como grupos)`, pedido: num(j.icc, 2), obtenido: num(icc, 3), ok: Math.abs(icc - j.icc) <= tol });
            }
        });
    },

    // Filas-objeto → base columnar, traduciendo las etiquetas de texto de las
    // categóricas (B9) y las fechas ISO a sus códigos/días, para que el informe
    // sea el mismo que sobre la base columnar.
    _baseDesdeObjetos(datos) {
        const socios = (this.configuracion && this.configuracion.sociodemograficos) || [];
        const traductores = new Map();
        const conEtiquetas = [];   // [columna, {etiqueta → código}]
        socios.forEach(s => {
            if (s.niveles && s.niveles.some(x => x.etiqueta)) { const m = new Map(); s.niveles.forEach(x => m.set(String(x.etiqueta), x.codigo)); conEtiquetas.push([s.categoria, m]); }
            if (s.fechaNacimiento && !this._esSocioDiscreto(s)) traductores.set(`FechaNac_${s.categoriaCorta}`, v => (typeof v === 'string' ? BaseColumnar.isoADias(v) : v));
        });
        // (C2/C3) desenlaces con etiquetas y niveles por puntos de corte
        ((this.configuracion && this.configuracion.desenlaces) || []).forEach(d => {
            if (d.tipo === 'binario' && d.etiquetas) conEtiquetas.push([d.nombre, new Map([[d.etiquetas[0], 0], [d.etiquetas[1], 1]])]);
            if (d.tipo === 'ordinal' && d.niveles) conEtiquetas.push([d.nombre, new Map(d.niveles.map(x => [String(x.etiqueta), x.codigo]))]);
        });
        ((this.configuracion && this.configuracion.cortes) || []).forEach(c => conEtiquetas.push([`Nivel_${this._siglaDeVariable(c.variable)}`, new Map(c.etiquetas.map((e, k) => [e, k + 1]))]));
        // (fase E2) estados con histéresis: 0/1 con sus etiquetas, en cada onda
        ((this.configuracion && this.configuracion.histeresis) || []).forEach(h => { const mapa = new Map([[h.etiquetas[0], 0], [h.etiquetas[1], 1]]); this._columnasDeEstado(h).forEach(c => conEtiquetas.push([c, mapa])); });
        // (C7) los jueces categóricos comparten las etiquetas de la variable que juzgan
        ((this.configuracion && this.configuracion.concordancias) || []).filter(c => c.tipo === 'jueces').forEach(c => {
            const colV = this._columnaCategoricaDe(c.variable);
            const par = conEtiquetas.find(([col]) => col === colV);
            if (par) for (let j = 1; j <= (c.jueces || 2); j++) conEtiquetas.push([`Juez${j}_${this._siglaDeVariable(c.variable)}`, par[1]]);
        });
        conEtiquetas.forEach(([col, m]) => traductores.set(col, v => (typeof v === 'string' && m.has(v)) ? m.get(v) : v));
        if (!traductores.size) return BaseColumnar.desdeObjetos(datos);
        const copia = datos.map(f => { const o = Object.assign({}, f); traductores.forEach((tr, col) => { if (col in o) o[col] = tr(o[col]); }); return o; });
        const base = BaseColumnar.desdeObjetos(copia);
        socios.forEach(s => {
            if (s.fechaNacimiento && !this._esSocioDiscreto(s) && base.tiene(`FechaNac_${s.categoriaCorta}`)) base.formatear(`FechaNac_${s.categoriaCorta}`, 'fecha');
        });
        conEtiquetas.forEach(([col, m]) => { if (base.tiene(col)) { const e = {}; m.forEach((codigo, etiqueta) => { e[codigo] = etiqueta; }); base.etiquetar(col, e); } });
        return base;
    },

    // Diccionario de etiquetas humanas para las columnas generadas (estilo
    // "variable labels" de SPSS): Total_IC → "Inteligencia Cognitiva".
    obtenerEtiquetas() {
        const mapa = { ID: 'Identificador del participante' };
        const escalas = (this.configuracion && this.configuracion.pruebas) || [];
        escalas.forEach(e => {
            const suf = e.sufijo || '';
            // (2026.09.30) cada ítem con su escala, rango y si está invertido (antes solo los invertidos tenían etiqueta)
            const rango = (e.minimo !== null && e.maximo !== null && isFinite(e.minimo) && isFinite(e.maximo)) ? ` (${e.minimo}–${e.maximo})` : '';
            for (let j = 1; j <= e.numItems; j++) if (!((e.invertidos || 0) > 0 && j > e.numItems - e.invertidos)) mapa[`${e.nombreCorto}${j}${suf}`] = `${e.nombre} — ítem ${j}${rango}`;
            if ((e.invertidos || 0) > 0) for (let j = e.numItems - e.invertidos + 1; j <= e.numItems; j++) mapa[`${e.nombreCorto}${j}${suf}`] = `${e.nombre} — ítem ${j} (INVERTIDO: recodificar)`;
            // test unidimensional: su escala es la variable general → se etiqueta con la variable que mide el test
            // (la del cuadro de pruebas, o el nombre de la escala). Sin «— test» al final: la etiqueta entra en la
            // redacción del Analizador («…e inteligencia cognitiva») y el instrumento ya lo aporta la estructura.
            // Las ondas e informantes (clones) conservan su marca: «inteligencia cognitiva (T2)».
            let etTotal = e.nombre;
            if (this._esUnidimensional(e)) {
                const base = e.base || e;
                const marca = e.base && e.nombre.startsWith(base.nombre) ? e.nombre.slice(base.nombre.length) : '';
                etTotal = `${this._variableDeTest(e.prueba) || base.nombre}${marca}`;
            }
            mapa[this.columnaDeEscala(e)] = etTotal;
            mapa[`PC_${this._claveEscala(e)}`] = `Percentil — ${etTotal}`;
        });
        // (B9) sociodemográficos con categorías etiquetadas, ordinales y fechas
        ((this.configuracion && this.configuracion.sociodemograficos) || []).forEach(s => {
            // sin categorías etiquetadas: al menos el tipo y el rango
            if (!(s.niveles && s.niveles.some(x => x.etiqueta))) {
                const tipo = { normal: 'continua', asimetrica: 'continua asimétrica', uniforme: 'continua uniforme', conteo: 'conteo', binaria: 'binaria (0/1)', categorica: 'categórica' }[s.distribucion] || s.distribucion;
                const rango = (s.minimo !== null && s.maximo !== null && isFinite(s.minimo) && isFinite(s.maximo)) ? `, ${s.minimo}–${s.maximo}` : '';
                mapa[s.categoria] = `${s.categoria} (sociodemográfica ${tipo}${rango})`;
            }
            if (s.niveles && s.niveles.some(x => x.etiqueta)) {
                const lista = s.niveles.map(x => `${x.codigo} = ${x.etiqueta}`).join(', ');
                mapa[s.categoria] = `${s.categoria} (${s.ordinal ? 'ordinal' : (s.distribucion === 'binaria' ? 'binaria' : 'categórica')}: ${lista})` + (s.dependeDe ? `; asociada a ${s.dependeDe}` : '');
            }
            if (s.fechaNacimiento && !this._esSocioDiscreto(s)) mapa[`FechaNac_${s.categoriaCorta}`] = `Fecha de nacimiento (AAAA-MM-DD) coherente con «${s.categoria}» a la fecha ${s.fechaNacimiento === 'hoy' ? 'de generación' : s.fechaNacimiento}`;
        });
        // (C7) jueces
        ((this.configuracion && this.configuracion.concordancias) || []).forEach(c => {
            if (c.tipo === 'informante') return;
            const sigla = this._siglaDeVariable(c.variable);
            for (let j = 1; j <= (c.jueces || 2); j++) mapa[`Juez${j}_${sigla}`] = c.tipo === 'jueces' ? `Juez ${j}: categoría asignada a «${c.variable}» (κ ${c.kappa} entre jueces)` : `Juez ${j}: puntuación de «${c.variable}» (CCI ${c.icc} entre jueces)`;
        });
        // (C2) desenlaces y (C3) niveles por puntos de corte
        ((this.configuracion && this.configuracion.desenlaces) || []).forEach(d => {
            const pred = d.predictores.length ? `; depende de ${d.predictores.map(p => `${p.variable} (${d.tipo === 'conteo' ? 'IRR' : 'OR'} ${p.efecto} por DE)`).join(', ')}` : '';
            if (d.tipo === 'binario') mapa[d.nombre] = `${d.nombre} (binario: 0 = ${d.etiquetas ? d.etiquetas[0] : 'no'}, 1 = ${d.etiquetas ? d.etiquetas[1] : 'sí'}; prevalencia ${Math.round(d.prevalencia * 100)} %${pred})`;
            else if (d.tipo === 'conteo') mapa[d.nombre] = `${d.nombre} (conteo; media ${d.media}${pred})`;
            else mapa[d.nombre] = `${d.nombre} (ordinal: ${d.niveles.map(x => `${x.codigo} = ${x.etiqueta}`).join(', ')}${pred})`;
        });
        ((this.configuracion && this.configuracion.cortes) || []).forEach(c => {
            const nombre = `Nivel_${this._siglaDeVariable(c.variable)}`;
            const cortes = c.porPercentil ? c.cortes.map(p => `P${p}`) : c.cortes;
            mapa[nombre] = `Nivel de «${c.variable}»: ${c.etiquetas.map((e, k) => `${k + 1} = ${e}${k < cortes.length ? ` (< ${cortes[k]})` : ` (≥ ${cortes[cortes.length - 1]})`}`).join(', ')}`;
        });
        // (Atlas, fase E2) estados con histéresis, uno por onda
        ((this.configuracion && this.configuracion.histeresis) || []).forEach(h => this._columnasDeEstado(h).forEach((c, k) => {
            mapa[c] = `${h.nombre} (T${k + 1}): 0 = ${h.etiquetas[0]}, 1 = ${h.etiquetas[1]}; estado con histéresis de «${h.x}» (entra por encima del P${h.pEntrada} de T1 y sale por debajo del P${h.pSalida}; nitidez ${h.ruido} %)`;
        }));
        // (B8) columnas auxiliares de las imperfecciones
        mapa['Respuesta_descuidada'] = 'Marcador: 1 = respondiente descuidado (línea recta o al azar)';
        mapa['Estilo_respuesta'] = 'Marcador de estilo de respuesta: 0 = ninguno, 1 = aquiescente, 2 = extremo';
        mapa['Tiempo_respuesta_seg'] = 'Tiempo total de respuesta al cuestionario (segundos)';
        this._controlesEsperados().forEach(c => { mapa[c.columna] = `Ítem de control ${c.indice}: instrucción «marque ${c.correcta}» (rango ${c.minimo}–${c.maximo})`; });
        (this.configuracion && this.configuracion.gruposPruebas || []).forEach(g => {
            if (g.escalas.length >= 2) {
                const etiqueta = g.variable ? `${g.variable} — ${g.nombre}` : `Puntaje general — ${g.nombre}`;
                mapa[`General_${g.sigla}`] = etiqueta;
                mapa[`PC_${g.sigla}`] = `Percentil — ${etiqueta}`;
            }
        });
        return mapa;
    },

    // Variable psicológica declarada para un test en el cuadro de pruebas ('' si no hay)
    _variableDeTest(prueba) {
        return ((((this.configuracion && this.configuracion.variablesPorTest) || {})[prueba] || {}).variable || '').trim();
    },

    // Estructura de pruebas que usa el Analizador (instrumentos, análisis por dimensiones, matriz, fiabilidad):
    // [{ prueba, variable, columnaGeneral, etiquetaGeneral, siglaGeneral, unidimensional, dimensiones: [{columna, etiqueta, sigla}] }]
    // Cada test tiene SIEMPRE su variable general:
    //  · con 2+ dimensiones → el puntaje General_<sigla del test> derivado de ellas;
    //  · unidimensional     → su única escala (General_<sigla de la escala>), sin dimensiones;
    //  · con escala general explícita (bases antiguas) → esa escala.
    // (Antes solo se describían los tests con escala general explícita, que la tabla
    // de escalas ya no admite: la lista llegaba vacía y el Analizador trataba todas
    // las escalas como sueltas, sin instrumento ni dimensiones.)
    obtenerEstructuraEscalas() {
        const cfg = this.configuracion || {};
        const escalas = (cfg.pruebas || []).filter(e => e.prueba && !e.sufijo);   // las ondas T2… no son dimensiones nuevas
        const grupos = (cfg.gruposPruebas && cfg.gruposPruebas.length) ? cfg.gruposPruebas : this.agruparPruebas(cfg.pruebas || []);
        const dimension = e => ({ columna: this.columnaDeEscala(e), etiqueta: e.nombre, sigla: this._claveEscala(e) });
        const estructura = [];
        grupos.forEach(g => {
            const delTest = escalas.filter(e => e.prueba === g.nombre);
            const general = delTest.find(e => e.tipo === 'general');
            const dims = delTest.filter(e => e.tipo !== 'general');
            const variable = g.variable || this._variableDeTest(g.nombre);
            let entrada = null;
            if (general) entrada = { columnaGeneral: this.columnaDeEscala(general), etiquetaGeneral: general.nombre, siglaGeneral: this._claveEscala(general), unidimensional: false, dimensiones: dims.map(dimension) };
            else if (dims.length === 1) entrada = { columnaGeneral: this.columnaDeEscala(dims[0]), etiquetaGeneral: variable || dims[0].nombre, siglaGeneral: this._claveEscala(dims[0]), unidimensional: true, dimensiones: [] };
            else if (dims.length >= 2) entrada = { columnaGeneral: `General_${g.sigla}`, etiquetaGeneral: variable || g.nombre, siglaGeneral: null, unidimensional: false, dimensiones: dims.map(dimension) };
            if (entrada) estructura.push(Object.assign({ prueba: g.nombre, variable }, entrada));
        });
        return estructura;
    },

    // ========================================
    // EXPORTACIÓN A CSV
    // ========================================
    // Exporta la base como CSV. sep=',' → internacional (decimales con punto).
    // sep=';' → Excel en español (decimales con COMA, abre en columnas directo).
    exportarCSV(sep = ',') {
        const base = this.datosGenerados;
        if (!base || base.length === 0) {
            throw new Error('No hay datos generados para exportar');
        }
        const escapar = (valor) => {
            let v = String(valor ?? '');
            // Escapar si contiene el separador, comillas o saltos de línea.
            if (v.includes(sep) || v.includes('"') || v.includes('\n')) {
                v = `"${v.replace(/"/g, '""')}"`;
            }
            return v;
        };
        // Número → texto: perdido (NaN) → celda vacía; en formato español los
        // decimales van con coma (3,14). Los enteros no cambian.
        const espanol = sep === ';';
        const texto = v => {
            if (!(v === v)) return '';                       // NaN → celda vacía
            const s = String(v);
            return (espanol && !Number.isInteger(v)) ? s.replace('.', ',') : s;
        };
        const columnas = base.columnas.map(c => c.datos);
        // (B9) columnas con etiquetas de valor o formato de fecha: texto de presentación
        const presentables = base.columnas.map(c => !!(c.etiquetas || c.formato));
        const lineas = new Array(base.n + 1);
        lineas[0] = base.columnas.map(c => escapar(c.nombre)).join(sep);
        const partes = new Array(columnas.length);
        for (let i = 0; i < base.n; i++) {
            for (let c = 0; c < columnas.length; c++) {
                if (presentables[c]) { const v = base.presentar(base.columnas[c], i); partes[c] = typeof v === 'string' ? escapar(v) : texto(v); }
                else partes[c] = texto(columnas[c][i]);
            }
            lineas[i + 1] = partes.join(sep);
        }
        return lineas.join('\n') + '\n';
    },

    descargarCSV(nombreArchivo = 'base_datos_simulada.csv', sep = ',') {
        const csv = this.exportarCSV(sep);
        // BOM UTF-8: sin él, Excel muestra caracteres rotos en tildes/eñes.
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', nombreArchivo);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    },

    // ========================================
    // UTILIDADES
    // ========================================
    /**
     * Datos generados como arreglo de filas-objeto (lo que esperan el
     * Analizador y los gráficos). Se materializa desde la base columnar la
     * primera vez y queda en caché. Para leer por columnas sin ese coste,
     * usar `obtenerBase()`.
     */
    obtenerDatosGenerados() {
        return this.datosGenerados ? this.datosGenerados.aObjetos() : null;
    },

    obtenerBase() {
        return this.datosGenerados;
    },

    limpiarDatos() {
        this.datosGenerados = null;
        this.configuracion = {
            tamanoMuestra: 100,
            semilla: null,
            pruebas: [],
            sociodemograficos: []
        };
    },

    // ========================================
    // ESTADÍSTICAS DESCRIPTIVAS RÁPIDAS
    // ========================================
    calcularEstadisticas(columna) {
        if (!this.datosGenerados) return null;

        const valores = this.datosGenerados
            .map(fila => fila[columna])
            .filter(v => v !== null && v !== undefined && !isNaN(v));

        if (valores.length === 0) return null;

        valores.sort((a, b) => a - b);

        const n = valores.length;
        const suma = valores.reduce((a, b) => a + b, 0);
        const media = suma / n;
        
        const varianza = valores
            .map(v => Math.pow(v - media, 2))
            .reduce((a, b) => a + b, 0) / n;
        
        const desviacion = Math.sqrt(varianza);
        
        const min = valores[0];
        const max = valores[n - 1];
        
        const mediana = n % 2 === 0
            ? (valores[n / 2 - 1] + valores[n / 2]) / 2
            : valores[Math.floor(n / 2)];

        return {
            n: n,
            media: media,
            desviacion: desviacion,
            min: min,
            max: max,
            mediana: mediana
        };
    },
};
