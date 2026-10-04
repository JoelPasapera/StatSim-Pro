// tests/fuzz/fuzz.js — configuraciones aleatorias contra el dominio del Simulador.
// Uso: node tests/fuzz/fuzz.js [iteraciones=80] [semilla=12345]
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { AVISO_EXTREMO } from './avisos-extremos.js';

const N = parseInt(process.argv[2] || '80', 10), SEMILLA = parseInt(process.argv[3] || '12345', 10);
let s = SEMILLA >>> 0;
const rnd = () => { s = (s + 0x6D2B79F5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const elegir = arr => arr[Math.floor(rnd() * arr.length)];
const NOMBRES = ['Percepción', 'Comprensión', 'Regulación', 'Estrés', 'Ansiedad', 'Autoestima', 'Resiliencia', 'Apoyo social', 'Depresión', 'Aptitud'];

function configAleatoria() {
    const n = elegir([40, 120, 300, 600, 1500]);
    const tests = ['EQ-i', 'PSS'];
    const pruebas = [];
    const nombres = [...NOMBRES].sort(() => rnd() - 0.5).slice(0, entre(2, 5));
    nombres.forEach((nombre, i) => {
        const k = entre(4, 12), min = elegir([0, 1]), max = min + elegir([3, 4, 5, 6]);
        const media = +(k * (min + (max - min) * (0.3 + 0.4 * rnd()))).toFixed(1);
        const p = { nombre, nombreCorto: nombre.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() + i, prueba: elegir(tests), tipo: 'dimension', numItems: k, media, desviacion: +(k * (max - min) * (0.08 + 0.1 * rnd())).toFixed(2), alfa: +(0.65 + 0.3 * rnd()).toFixed(2), minimo: min, maximo: max, distribucion: elegir(['normal', 'normal', 'asimetrica', 'uniforme']), invertidos: rnd() < 0.3 ? entre(1, Math.max(1, k - 3)) : 0 };
        if (rnd() < 0.2) { p.minimo = 0; p.maximo = 1; p.media = +(k * (0.35 + 0.3 * rnd())).toFixed(1); p.desviacion = 1; p.distribucion = 'normal'; p.dificultades = null; }
        pruebas.push(p);
    });
    const socios = [{ categoria: 'Sexo', categoriaCorta: 'S', distribucion: 'binaria', promedio: +(0.3 + 0.4 * rnd()).toFixed(2), desviacion: 1, minimo: null, maximo: null, decimales: 0 }, { categoria: 'Edad', categoriaCorta: 'E', distribucion: 'normal', promedio: 20, desviacion: 3, minimo: 15, maximo: 30, decimales: 0 }];
    if (rnd() < 0.5) socios.push({ categoria: 'Aula', categoriaCorta: 'A', distribucion: 'categorica', promedio: 0, desviacion: 1, minimo: 1, maximo: entre(3, 12), decimales: 0 });
    const correlaciones = []; if (nombres.length >= 2 && rnd() < 0.8) correlaciones.push({ a: nombres[0], b: nombres[1], r: +((rnd() - 0.5) * 1.2).toFixed(2) });
    const diferenciasGrupo = []; if (rnd() < 0.6) diferenciasGrupo.push({ tipo: 'd', cuantitativa: elegir(nombres), agrupacion: 'Sexo', d: +((rnd() - 0.5) * 1.6).toFixed(2) });
    if (socios.length === 3 && rnd() < 0.4) diferenciasGrupo.push({ tipo: 'icc', cuantitativa: elegir(nombres), agrupacion: 'Aula', d: +(0.05 + 0.3 * rnd()).toFixed(2) });
    const modelos = []; if (nombres.length >= 3 && rnd() < 0.4) modelos.push({ tipo: 'mediacion', x: nombres[0], m: nombres[1], y: nombres[2], c1: +(0.2 + 0.4 * rnd()).toFixed(2), c2: +(-0.4 + 0.3 * rnd()).toFixed(2), c3: +(-0.2 + 0.4 * rnd()).toFixed(2) });
    else if (nombres.length >= 2 && rnd() < 0.5 && !correlaciones.length) modelos.push({ tipo: 'curvilinea', x: 'Edad', m: 'Edad', y: nombres[0], c1: +((rnd() - 0.5) * 0.6).toFixed(2), c2: +((rnd() - 0.5) * 0.5).toFixed(2), c3: 0 });
    const medidasRepetidas = []; if (rnd() < 0.4) medidasRepetidas.push({ variable: elegir(nombres), ondas: entre(2, 3), estabilidad: +(0.4 + 0.5 * rnd()).toFixed(2), cambio: +((rnd() - 0.5) * 0.8).toFixed(2), agrupacion: rnd() < 0.4 ? 'Sexo' : '', cambioGrupo: +((rnd() - 0.5) * 0.8).toFixed(2), modelo: elegir(['ar1', 'crecimiento', 'intercepto']), dePendientes: +(0.3 * rnd()).toFixed(2), rInterceptoPendiente: +((rnd() - 0.5) * 0.6).toFixed(2) });
    // (fase D) relación entre personas y dentro de la persona: dos escalas con interceptos aleatorios y el mismo número de ondas
    const niveles = []; if (nombres.length >= 2 && rnd() < 0.3) { const K = entre(2, 4); nombres.slice(0, 2).forEach(v => { const mr = { variable: v, ondas: K, estabilidad: +(0.3 + 0.5 * rnd()).toFixed(2), cambio: +((rnd() - 0.5) * 0.6).toFixed(2), agrupacion: '', cambioGrupo: null, modelo: 'intercepto', dePendientes: 0, rInterceptoPendiente: 0 }; const i = medidasRepetidas.findIndex(m => m.variable === v); if (i >= 0) medidasRepetidas[i] = mr; else medidasRepetidas.push(mr); }); niveles.push({ x: nombres[0], y: nombres[1], rEntre: +((rnd() - 0.5) * 1.2).toFixed(2), rDentro: +((rnd() - 0.5) * 1.2).toFixed(2) }); }
    // (fase E1) relación en el tiempo: dos escalas con AR(1) y el mismo número de ondas (si no están ya en una pareja entre niveles)
    const paneles = []; if (!niveles.length && nombres.length >= 2 && rnd() < 0.3) { const K = entre(2, 4); nombres.slice(0, 2).forEach(v => { const mr = { variable: v, ondas: K, estabilidad: +(0.4 + 0.4 * rnd()).toFixed(2), cambio: +((rnd() - 0.5) * 0.6).toFixed(2), agrupacion: '', cambioGrupo: null, modelo: 'ar1', dePendientes: 0, rInterceptoPendiente: 0 }; const i = medidasRepetidas.findIndex(m => m.variable === v); if (i >= 0) medidasRepetidas[i] = mr; else medidasRepetidas.push(mr); }); const reciproca = rnd() < 0.5; paneles.push({ tipo: reciproca ? 'reciproca' : 'rezagada', x: nombres[0], y: nombres[1], r: +((rnd() - 0.5) * 0.6).toFixed(2), cXY: +((rnd() - 0.5) * 0.6).toFixed(2), cYX: reciproca ? +((rnd() - 0.5) * 0.4).toFixed(2) : 0 }); }
    // (fase E2) estado con histéresis sobre una escala repetida
    const histeresis = []; if (medidasRepetidas.length && rnd() < 0.3) { const pE = entre(60, 90), pS = entre(15, pE - 10); histeresis.push({ x: medidasRepetidas[0].variable, nombre: 'Estado', etiquetas: ['No', 'Sí'], pEntrada: pE, pSalida: pS, ruido: entre(0, 10) }); }
    const cortes = []; if (rnd() < 0.4) { const p = elegir(pruebas); cortes.push({ variable: p.nombre, etiquetas: ['Bajo', 'Alto'], cortes: [50], porPercentil: true }); }
    const desenlaces = []; if (rnd() < 0.4) desenlaces.push({ nombre: 'Desenlace', tipo: elegir(['binario', 'conteo']), prevalencia: 0.3, media: 2, niveles: null, etiquetas: null, predictores: [{ variable: elegir(nombres), efecto: +(0.5 + 2 * rnd()).toFixed(2) }] });
    const concordancias = []; if (rnd() < 0.3) concordancias.push({ tipo: 'informante', variable: elegir(nombres), etiqueta: 'madre', r: +(0.3 + 0.5 * rnd()).toFixed(2), sesgo: +((rnd() - 0.5) * 0.8).toFixed(2) });
    if (cortes.length && rnd() < 0.5) concordancias.push({ tipo: 'jueces', variable: cortes[0].variable, jueces: entre(2, 4), kappa: +(0.3 + 0.6 * rnd()).toFixed(2), icc: null });
    const conImperf = rnd() < 0.4;
    const realismo = conImperf ? { pctPerdidos: entre(0, 8), mecanismoPerdidos: elegir(['MCAR', 'MAR', 'MNAR']), referenciaMAR: '', sentidoMAR: 'bajos', pctDescuidados: entre(0, 6), tipoDescuidado: 'mixto', marcarDescuidados: rnd() < 0.5, pctDigitacion: entre(0, 3), pctAquiescencia: entre(0, 10), pctExtrema: entre(0, 8), intensidadEstilos: 'leve', itemsControl: entre(0, 2), tiempoMinutos: 0 } : { pctPerdidos: 0, pctDescuidados: 0, pctDigitacion: 0 };
    return { cfg: { tamanoMuestra: n, semilla: entre(1, 99999), generarPercentiles: rnd() < 0.5, correlacionesExactas: rnd() < 0.7, indiceFiabilidad: elegir(['alfa', 'omega']), heterogeneidadItems: elegir(['ninguna', 'leve', 'moderada']), variablesPorTest: { 'EQ-i': { variable: 'IE', rIntra: 0.4 }, PSS: { variable: 'Estrés', rIntra: 0.4 } }, pruebas, sociodemograficos: socios, correlaciones, diferenciasGrupo, modelos, medidasRepetidas, niveles, paneles, histeresis, estructuras: [], desenlaces, cortes, concordancias, gruposPruebas: [], realismo }, conImperf };
}

const fallos = []; let generadas = 0, rechazadas = 0; const t0 = Date.now();
for (let it = 0; it < N; it++) {
    const { cfg, conImperf } = configAleatoria();
    const g = new GeneradorDatos(); g.configuracion = JSON.parse(JSON.stringify(cfg)); g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    let val; try { val = g.validarConfiguracion(); } catch (e) { fallos.push(`iter ${it}: EXCEPCIÓN al validar: ${e.message}`); continue; }
    if (val.errores.length) { rechazadas++; continue; }
    let b, inf;
    try { b = g.generarBaseDatos(); inf = g.informePedidoObtenido(b); } catch (e) { fallos.push(`iter ${it}: EXCEPCIÓN al generar: ${e.message.slice(0, 120)}`); continue; }
    generadas++;
    if (b.n !== cfg.tamanoMuestra) fallos.push(`iter ${it}: n ${b.n} ≠ ${cfg.tamanoMuestra}`);
    const avisado = val.advertencias.some(a => AVISO_EXTREMO.test(a));   // expresión compartida con su prueba unitaria
    if (cfg.correlacionesExactas && !conImperf && cfg.tamanoMuestra >= 300 && !avisado) {
        // solo las filas verificadas que fallan: las informativas (ok === null, como los veredictos de las fases C a E) no son
        // «no cumplidas» (mismo defecto que el arnés de escenarios, corregido en la revisión de la fase D)
        const noOk = inf.filter(f => f.ok === false && !['V', 'disc', 'KMO', 'SRMR', 'λmét'].includes(f.tipo));
        if (noOk.length) fallos.push(`iter ${it}: informe no cumplido en exacto: ` + noOk.slice(0, 3).map(f => `${f.tipo} ${f.variable.slice(0, 40)} ${f.pedido}→${f.obtenido}`).join(' | '));
    }
    // suma de ítems = total (recodificando) en filas completas
    for (const p of g.configuracion.pruebas) {
        const items = g._itemsDe(p).map(c => b.columna(c)).filter(Boolean), tot = b.columna(g.columnaDeEscala(p));
        if (!tot || items.length !== p.numItems) { fallos.push(`iter ${it}: faltan columnas de ${p.nombre}`); continue; }
        let malas = 0;
        for (let i = 0; i < b.n; i++) { if (!isFinite(tot.datos[i]) || items.some(c => !isFinite(c.datos[i]))) continue; let sm = 0; items.forEach((c, j) => { sm += g._recodificar(p, j + 1, c.datos[i]); }); if (Math.abs(sm - tot.datos[i]) > 0.011) malas++; }
        if (malas) fallos.push(`iter ${it}: ${p.nombre}: ${malas} filas con Σ ítems ≠ total`);
    }
    // reproducibilidad y reconstrucción desde objetos (mismo informe)
    const g2 = new GeneradorDatos(); g2.configuracion = JSON.parse(JSON.stringify(cfg)); g2.configuracion.gruposPruebas = g2.agruparPruebas(g2.configuracion.pruebas);
    const b2 = g2.generarBaseDatos();
    if (JSON.stringify(b.aObjetos(0, 20)) !== JSON.stringify(b2.aObjetos(0, 20))) fallos.push(`iter ${it}: no reproducible con la misma semilla`);
    if (JSON.stringify(inf) !== JSON.stringify(g.informePedidoObtenido(b.aObjetos()))) fallos.push(`iter ${it}: informe distinto al reconstruir desde objetos`);
}
console.log(`${N} configuraciones · ${generadas} generadas · ${rechazadas} rechazadas por la validación · ${fallos.length} fallos · ${Math.round((Date.now() - t0) / Math.max(1, generadas))} ms por base`);
fallos.forEach(f => console.log('✗ ' + f));
process.exitCode = fallos.length ? 1 : 0;
