'use strict';
const fs = require('fs');
eval(fs.readFileSync('base-columnar.js', 'utf8') + '\n;globalThis.BaseColumnar = BaseColumnar;');
eval(fs.readFileSync('generador-datos.js', 'utf8') + '\n;globalThis.GeneradorDatos = GeneradorDatos;');

const escala = (nombre, corto, prueba, k, media, de, alfa, extra = {}) => ({ nombre, nombreCorto: corto, prueba, tipo: 'dimension', numItems: k, media, desviacion: de, alfa, minimo: 1, maximo: 5, distribucion: 'normal', invertidos: 0, ...extra });
const socioN = (categoria, corta, media, de, min, max) => ({ categoria, categoriaCorta: corta, distribucion: 'normal', promedio: media, desviacion: de, minimo: min, maximo: max, decimales: 0 });
const socioB = (categoria, corta, p, niveles = null, extra = {}) => ({ categoria, categoriaCorta: corta, distribucion: 'binaria', promedio: p, desviacion: 1, minimo: null, maximo: null, decimales: 0, niveles, ordinal: false, fechaNacimiento: null, dependeDe: '', fuerza: 0.4, ...extra });
const socioC = (categoria, corta, K, niveles = null, extra = {}) => ({ categoria, categoriaCorta: corta, distribucion: 'categorica', promedio: 0, desviacion: 1, minimo: 1, maximo: K, decimales: 0, niveles, ordinal: false, fechaNacimiento: null, dependeDe: '', fuerza: 0.4, ...extra });
const base = (n, extra = {}) => Object.assign({
    tamanoMuestra: n, semilla: 7, generarPercentiles: true, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve',
    variablesPorTest: { 'EQ-i': { variable: 'IE', rIntra: 0.4 }, 'PSS': { variable: 'Estrés percibido', rIntra: 0.4 } },
    pruebas: [escala('Percepción', 'PE', 'EQ-i', 8, 24, 5, 0.80), escala('Comprensión', 'CE', 'EQ-i', 8, 24, 5, 0.85, { invertidos: 3 }), escala('Regulación', 'RE', 'EQ-i', 8, 24, 5, 0.78), escala('Estrés', 'ST', 'PSS', 10, 30, 6, 0.82, { invertidos: 4 })],
    sociodemograficos: [socioN('Edad', 'E', 20, 3, 15, 30), socioB('Sexo', 'S', 0.5)],
    correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], gruposPruebas: [], realismo: {}
}, extra);
const cargas = (k, l, F, f) => Array.from({ length: k }, () => Array.from({ length: F }, (_, j) => j === f ? l : 0));
const dicot = (nombre, corto, prueba, k, media, alfa, extra = {}) => ({ nombre, nombreCorto: corto, prueba, tipo: 'dimension', numItems: k, media, desviacion: 1, alfa, minimo: 0, maximo: 1, distribucion: 'normal', invertidos: 0, dificultades: null, ...extra });

const ESCENARIOS = {
    S1_general_con_dicotomica: (() => { const c = base(1000, { correlaciones: [{ a: 'IE — EQ-i', b: 'Estrés', r: -0.4 }, { a: 'Percepción', b: 'Aptitud', r: 0.3 }] }); c.pruebas.push(dicot('Aptitud', 'AP', 'EQ-i', 12, 7, 0.75)); return c; })(),
    S2_informante_con_estructura: base(1000, { estructuras: [{ prueba: 'EQ-i', modo: 'cargas', factores: ['Percepción', 'Comprensión', 'Regulación'], cargas: { 'Comprensión': cargas(8, 0.65, 3, 1) }, metodo: { carga: 0.3 }, desajuste: 'ninguno' }], concordancias: [{ tipo: 'informante', variable: 'Comprensión', etiqueta: 'madre', r: 0.5, sesgo: -0.3 }] }),
    S3_jueces_sobre_ordinal: base(800, { desenlaces: [{ nombre: 'Riesgo', tipo: 'ordinal', prevalencia: null, media: null, niveles: [{ codigo: 1, etiqueta: 'Bajo', proporcion: 0.5 }, { codigo: 2, etiqueta: 'Medio', proporcion: 0.3 }, { codigo: 3, etiqueta: 'Alto', proporcion: 0.2 }], etiquetas: null, predictores: [{ variable: 'Estrés', efecto: 1.8 }] }], concordancias: [{ tipo: 'jueces', variable: 'Riesgo', jueces: 3, kappa: 0.65, icc: null }] }),
    S4_moderacion_con_MNAR: base(800, { modelos: [{ tipo: 'moderacion', x: 'Percepción', m: 'Edad', y: 'Estrés', c1: -0.3, c2: 0.1, c3: 0.2 }], realismo: { pctPerdidos: 8, mecanismoPerdidos: 'MNAR', referenciaMAR: '', sentidoMAR: 'altos', pctDescuidados: 0, pctDigitacion: 0 } }),
    S5_corte_percentil_General_y_jueces: base(800, { cortes: [{ variable: 'IE — EQ-i', etiquetas: ['Bajo', 'Medio', 'Alto'], cortes: [25, 75], porPercentil: true }], concordancias: [{ tipo: 'jueces', variable: 'IE — EQ-i', jueces: 2, kappa: 0.7, icc: null }] }),
    S6_crecimiento_dicotomica_grupo: (() => { const c = base(1000, { medidasRepetidas: [{ variable: 'Aptitud', ondas: 3, estabilidad: 0.6, cambio: 0.4, agrupacion: 'Sexo', cambioGrupo: 0.8, modelo: 'crecimiento', dePendientes: 0.4, rInterceptoPendiente: 0 }] }); c.pruebas.push(dicot('Aptitud', 'AP', 'Examen', 12, 6, 0.8)); return c; })(),
    S7_siglas_que_chocan: base(600, { pruebas: [escala('Ansiedad', 'A', 'STAI', 6, 18, 4, 0.8), escala('Ansiedad rasgo', 'AR', 'STAI', 6, 18, 4, 0.8), escala('A', 'A', 'Otro', 5, 15, 3, 0.75), escala('Autoestima', 'A', 'Otro', 5, 15, 3, 0.75)], variablesPorTest: { STAI: { variable: 'Ansiedad', rIntra: 0.5 }, Otro: { variable: 'Otro', rIntra: 0.3 } }, correlaciones: [{ a: 'Ansiedad', b: 'Autoestima', r: -0.4 }] }),
    S8_nombres_raros: base(600, { pruebas: [escala('Percepción, "emocional"', 'PE', 'EQ-i, v2', 6, 18, 4, 0.8), escala('Regulación; afectiva', 'RA', 'EQ-i, v2', 6, 18, 4, 0.8)], variablesPorTest: { 'EQ-i, v2': { variable: 'IE "total"', rIntra: 0.4 } }, sociodemograficos: [socioB('Sexo, biológico', 'SB', 0.5, [{ codigo: 0, etiqueta: 'Fem, "F"', proporcion: 0.5 }, { codigo: 1, etiqueta: 'Masc; M', proporcion: 0.5 }])], desenlaces: [{ nombre: 'Deserción, "sí/no"', tipo: 'binario', prevalencia: 0.3, media: null, niveles: null, etiquetas: ['No, nunca', 'Sí; alguna'], predictores: [{ variable: 'Percepción, "emocional"', efecto: 1.5 }] }], cortes: [{ variable: 'Regulación; afectiva', etiquetas: ['Bajo, B', 'Alto; A'], cortes: [18], porPercentil: false }] }),
    S9_todo_con_n30: null,
    S10_semilla_vacia: base(300, { semilla: null, correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.3 }] }),
    S11_interaccion_dependientes_estructura: base(1200, { sociodemograficos: [socioN('Edad', 'E', 20, 3, 15, 30), socioB('Sexo', 'S', 0.5), socioB('Programa', 'Pr', 0.4, null, { dependeDe: 'Sexo', fuerza: 0.4 })], diferenciasGrupo: [{ tipo: 'interaccion', cuantitativa: 'Comprensión', agrupacion: 'Sexo', agrupacion2: 'Programa', d: 0.5 }, { tipo: 'd', cuantitativa: 'Comprensión', agrupacion: 'Sexo', d: 0.3 }], estructuras: [{ prueba: 'EQ-i', modo: 'cargas', factores: ['Percepción', 'Comprensión', 'Regulación'], cargas: { 'Comprensión': cargas(8, 0.65, 3, 1) }, metodo: null, desajuste: 'ninguno' }] }),
    S12_mediacion_paralela_curvilinea_estilos: base(1200, { modelos: [{ tipo: 'mediacion', x: 'Percepción', m: 'Comprensión', y: 'Estrés', c1: 0.4, c2: -0.3, c3: -0.1 }, { tipo: 'mediacion', x: 'Percepción', m: 'Regulación', y: 'Estrés', c1: 0.3, c2: -0.2, c3: -0.1 }, { tipo: 'curvilinea', x: 'Edad', m: 'Edad', y: 'Percepción', c1: 0.2, c2: -0.2, c3: 0 }], realismo: { pctPerdidos: 0, pctDescuidados: 0, pctDigitacion: 0, pctAquiescencia: 10, pctExtrema: 5, intensidadEstilos: 'leve', itemsControl: 1, tiempoMinutos: 0 } }),
    S13_dicotomica_total: (() => { const c = base(1500, { cortes: [{ variable: 'Aptitud', etiquetas: ['Reprueba', 'Aprueba'], cortes: [7], porPercentil: false }], concordancias: [{ tipo: 'informante', variable: 'Aptitud', etiqueta: 'forma B', r: 0.7, sesgo: 0 }, { tipo: 'jueces', variable: 'Aptitud', jueces: 2, kappa: 0.8, icc: null }], desenlaces: [{ nombre: 'Beca', tipo: 'binario', prevalencia: 0.2, media: null, niveles: null, etiquetas: ['No', 'Sí'], predictores: [{ variable: 'Aptitud', efecto: 2.5 }] }] }); c.pruebas.push(dicot('Aptitud', 'AP', 'Examen', 12, 7, 0.8, { dificultades: [0.9, 0.85, 0.8, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.25] })); return c; })()
};
// S9: la configuración máxima de referencias.js con n = 30
{
    const src = fs.readFileSync('referencias.js', 'utf8');
    const m = src.match(/const maxima = \(n, exactas\) => \{[\s\S]*?\n\};/);
    eval(m[0].replace('const maxima', 'globalThis.maximaRef'));
    ESCENARIOS.S9_todo_con_n30 = globalThis.maximaRef(30, true);
}

const hallazgos = [];
const registrar = (esc, texto) => hallazgos.push(`${esc}: ${texto}`);
Object.entries(ESCENARIOS).forEach(([id, cfg]) => {
    const gen = () => { const g = new GeneradorDatos(); g.configuracion = JSON.parse(JSON.stringify(cfg)); g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas); return g; };
    let g;
    try {
        g = gen();
        const val = g.validarConfiguracion();
        if (val.errores.length) { registrar(id, 'VALIDACIÓN RECHAZA: ' + val.errores.join(' | ')); return; }
        const b = g.generarBaseDatos();
        const inf = g.informePedidoObtenido(b);
        const sinImperf = !(cfg.realismo && (cfg.realismo.pctPerdidos || cfg.realismo.pctDescuidados || cfg.realismo.pctDigitacion || cfg.realismo.pctAquiescencia || cfg.realismo.pctExtrema));
        const noOk = inf.filter(f => !f.ok);
        if (cfg.correlacionesExactas && sinImperf && cfg.tamanoMuestra >= 300 && noOk.length) registrar(id, 'informe no cumplido en exacto: ' + noOk.map(f => `${f.tipo} ${f.variable.slice(0, 45)} ${f.pedido}→${f.obtenido}`).join(' || '));
        // etiquetas de todas las columnas
        const et = g.obtenerEtiquetas();
        const sinEtiqueta = b.nombres().filter(c => !et[c]);
        if (sinEtiqueta.length) registrar(id, 'columnas sin etiqueta en el diccionario: ' + sinEtiqueta.join(', '));
        // suma de ítems = total (recodificando), en filas completas
        g.configuracion.pruebas.forEach(p => {
            const items = g._itemsDe(p).map(c => b.columna(c)).filter(Boolean); const tot = b.columna(g.columnaDeEscala(p));
            if (!tot || items.length !== p.numItems) { registrar(id, `faltan columnas de «${p.nombre}»`); return; }
            let malas = 0;
            for (let i = 0; i < b.n; i++) { if (!isFinite(tot.datos[i]) || items.some(c => !isFinite(c.datos[i]))) continue; let s = 0; items.forEach((c, j) => { s += g._recodificar(p, j + 1, c.datos[i]); }); if (Math.abs(s - tot.datos[i]) > 0.011) malas++; }
            if (malas) registrar(id, `«${p.nombre}»: ${malas} filas con suma de ítems ≠ total`);
            // rangos de los ítems
            if (p.minimo !== null && p.maximo !== null && !(cfg.realismo && cfg.realismo.pctDigitacion)) items.forEach(c => { for (let i = 0; i < b.n; i++) { const v = c.datos[i]; if (isFinite(v) && (v < p.minimo || v > p.maximo || v !== Math.round(v))) { registrar(id, `«${p.nombre}» ítem fuera de rango o no entero: ${v}`); break; } } });
        });
        // reproducibilidad (salvo semilla vacía)
        if (cfg.semilla !== null && cfg.semilla !== undefined) {
            const b2 = gen().generarBaseDatos();
            const o1 = b.aObjetos(0, 30), o2 = b2.aObjetos(0, 30);
            if (JSON.stringify(o1) !== JSON.stringify(o2)) registrar(id, 'NO reproducible con la misma semilla');
        } else {
            const b2 = gen().generarBaseDatos();
            if (JSON.stringify(b.aObjetos(0, 5)) === JSON.stringify(b2.aObjetos(0, 5))) registrar(id, 'con semilla vacía dos bases salieron idénticas');
        }
        // ida y vuelta por objetos: mismo informe
        const inf2 = g.informePedidoObtenido(b.aObjetos());
        if (JSON.stringify(inf) !== JSON.stringify(inf2)) registrar(id, 'informe distinto al reconstruir desde objetos: ' + inf.filter((f, k) => JSON.stringify(f) !== JSON.stringify(inf2[k])).map(f => f.tipo + ' ' + f.variable.slice(0, 30)).join(', '));
        // CSV: columnas y filas; comillas escapadas
        const csv = g.exportarCSV(','); const lineas = csv.trim().split('\n');
        if (lineas.length !== b.n + 1) registrar(id, `CSV con ${lineas.length - 1} filas (n = ${b.n})`);
        const enc = []; { let cur = '', q = false; for (const ch of lineas[0]) { if (ch === '"') { q = !q; cur += ch; } else if (ch === ',' && !q) { enc.push(cur); cur = ''; } else cur += ch; } enc.push(cur); }
        if (enc.length !== b.columnas.length) registrar(id, `CSV: ${enc.length} columnas en el encabezado, base con ${b.columnas.length}`);
        // Worker: serialización ida y vuelta conserva etiquetas y formato
        const s = b.serializar(); const b3 = BaseColumnar.desdeSerializado(s);
        if (JSON.stringify(b3.fila(0)) !== JSON.stringify(b.fila(0))) registrar(id, 'serialización: la fila 0 cambia tras deserializar');
        console.log(`✓ ${id}: n ${b.n}, ${b.columnas.length} columnas, ${inf.length} filas del informe${noOk.length ? ` (${noOk.length} no ok${sinImperf ? '' : ', con imperfecciones'})` : ''}, ${val.advertencias.length} avisos`);
    } catch (e) {
        registrar(id, 'EXCEPCIÓN: ' + e.message + ' | ' + (e.stack || '').split('\n')[1]);
        console.log(`✗ ${id}: excepción`);
    }
});
console.log('\nHALLAZGOS (' + hallazgos.length + '):'); hallazgos.forEach(h => console.log(' - ' + h));
