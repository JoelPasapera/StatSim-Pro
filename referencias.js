'use strict';
// Genera las bases de referencia R1–R12 (plan de revisión transversal, F2) y deja
// en /home/claude/ref/ tres archivos por base: refN.csv (exportarCSV con «;»),
// refN.esquema.json (columnas de cada variable) y refN.informe.json (filas del
// informe). oraculo.py recalcula cada fila sobre el CSV y compara.
const fs = require('fs');
eval(fs.readFileSync('base-columnar.js', 'utf8') + '\n;globalThis.BaseColumnar = BaseColumnar;');
eval(fs.readFileSync('generador-datos.js', 'utf8') + '\n;globalThis.GeneradorDatos = GeneradorDatos;');

const escala = (nombre, corto, prueba, k, media, de, alfa, extra = {}) => ({ nombre, nombreCorto: corto, prueba, tipo: 'dimension', numItems: k, media, desviacion: de, alfa, minimo: 1, maximo: 5, distribucion: 'normal', invertidos: 0, ...extra });
const socioN = (categoria, corta, media, de, min, max) => ({ categoria, categoriaCorta: corta, distribucion: 'normal', promedio: media, desviacion: de, minimo: min, maximo: max, decimales: 0 });
const socioB = (categoria, corta, p, niveles = null) => ({ categoria, categoriaCorta: corta, distribucion: 'binaria', promedio: p, desviacion: 1, minimo: null, maximo: null, decimales: 0, niveles, ordinal: false, fechaNacimiento: null, dependeDe: '', fuerza: 0.4 });
const socioC = (categoria, corta, K, niveles = null) => ({ categoria, categoriaCorta: corta, distribucion: 'categorica', promedio: 0, desviacion: 1, minimo: 1, maximo: K, decimales: 0, niveles, ordinal: false, fechaNacimiento: null, dependeDe: '', fuerza: 0.4 });
const base = (n, extra = {}) => Object.assign({
    tamanoMuestra: n, semilla: 2026, generarPercentiles: true, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve',
    variablesPorTest: { 'EQ-i': { variable: 'IE', rIntra: 0.4 }, 'PSS': { variable: 'Estrés percibido', rIntra: 0.4 } },
    pruebas: [escala('Percepción', 'PE', 'EQ-i', 8, 24, 5, 0.80), escala('Comprensión', 'CE', 'EQ-i', 8, 24, 5, 0.85, { invertidos: 3 }), escala('Regulación', 'RE', 'EQ-i', 8, 24, 5, 0.78), escala('Estrés', 'ST', 'PSS', 10, 30, 6, 0.82, { invertidos: 4 })],
    sociodemograficos: [socioN('Edad', 'E', 20, 3, 15, 30), socioB('Sexo', 'S', 0.5)],
    correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], gruposPruebas: [], realismo: {}
}, extra);

const cargas = (k, l, F, f) => Array.from({ length: k }, () => Array.from({ length: F }, (_, j) => j === f ? l : 0));
const REFERENCIAS = {
    R1: base(800, { correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.35 }, { a: 'IE — EQ-i', b: 'Estrés', r: -0.45 }, { a: 'Edad', b: 'Regulación', r: 0.2 }], diferenciasGrupo: [{ tipo: 'd', cuantitativa: 'Estrés', agrupacion: 'Sexo', d: 0.4 }, { tipo: 'd', cuantitativa: 'IE — EQ-i', agrupacion: 'Sexo', d: -0.3 }] }),
    R2: base(1500, { estructuras: [{ prueba: 'EQ-i', modo: 'cargas', factores: ['Percepción', 'Comprensión', 'Regulación'], cargas: { 'Percepción': cargas(8, 0.7, 3, 0).map((r, i) => i === 2 ? [0.7, 0.3, 0] : r), 'Comprensión': cargas(8, 0.65, 3, 1), 'Regulación': cargas(8, 0.6, 3, 2) }, metodo: { carga: 0.3 }, desajuste: 'ninguno' }] }),
    R3: (() => { const c = base(1500, { correlaciones: [{ a: 'Conocimientos', b: 'Percepción', r: 0.35 }] }); c.pruebas.push({ nombre: 'Conocimientos', nombreCorto: 'CO', prueba: 'Examen', tipo: 'dimension', numItems: 15, media: 9, desviacion: 2, alfa: 0.8, minimo: 0, maximo: 1, distribucion: 'normal', invertidos: 0, dificultades: [0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2] }); return c; })(),
    R4: base(1000, { medidasRepetidas: [{ variable: 'Estrés', ondas: 3, estabilidad: 0.7, cambio: -0.3, agrupacion: 'Sexo', cambioGrupo: -0.6, modelo: 'ar1', dePendientes: 0, rInterceptoPendiente: 0 }, { variable: 'Comprensión', ondas: 3, estabilidad: 0.6, cambio: 0.4, agrupacion: '', cambioGrupo: null, modelo: 'crecimiento', dePendientes: 0.5, rInterceptoPendiente: -0.2 }] }),
    R5: null,
    R6: base(1500, { sociodemograficos: [socioN('Edad', 'E', 20, 3, 15, 30), socioB('Sexo', 'S', 0.4, [{ codigo: 0, etiqueta: 'Femenino', proporcion: 0.6 }, { codigo: 1, etiqueta: 'Masculino', proporcion: 0.4 }]), Object.assign(socioC('Grado', 'Gr', 3, [{ codigo: 1, etiqueta: 'Primaria', proporcion: 0.2 }, { codigo: 2, etiqueta: 'Secundaria', proporcion: 0.5 }, { codigo: 3, etiqueta: 'Superior', proporcion: 0.3 }]), { ordinal: true, dependeDe: 'Sexo', fuerza: 0.5 })], diferenciasGrupo: [{ tipo: 'd', cuantitativa: 'Estrés', agrupacion: 'Grado', d: 0.3 }], realismo: { pctPerdidos: 6, mecanismoPerdidos: 'MNAR', referenciaMAR: '', sentidoMAR: 'altos', pctDescuidados: 0, pctDigitacion: 0 } }),
    R7: base(2000, { correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.3 }], desenlaces: [{ nombre: 'Deserción', tipo: 'binario', prevalencia: 0.25, media: null, niveles: null, etiquetas: ['No', 'Sí'], predictores: [{ variable: 'Estrés', efecto: 2.0 }, { variable: 'IE — EQ-i', efecto: 0.6 }, { variable: 'Edad', efecto: 1.2 }] }, { nombre: 'Faltas', tipo: 'conteo', prevalencia: null, media: 2.5, niveles: null, etiquetas: null, predictores: [{ variable: 'Estrés', efecto: 1.4 }] }, { nombre: 'Riesgo', tipo: 'ordinal', prevalencia: null, media: null, niveles: [{ codigo: 1, etiqueta: 'Bajo', proporcion: 0.5 }, { codigo: 2, etiqueta: 'Medio', proporcion: 0.3 }, { codigo: 3, etiqueta: 'Alto', proporcion: 0.2 }], etiquetas: null, predictores: [{ variable: 'Estrés', efecto: 1.8 }] }] }),
    R8: base(1500, { cortes: [{ variable: 'Estrés', etiquetas: ['Bajo', 'Medio', 'Alto'], cortes: [24, 36], porPercentil: false }, { variable: 'Percepción', etiquetas: ['Bajo', 'Alto'], cortes: [75], porPercentil: true }], concordancias: [{ tipo: 'informante', variable: 'Estrés', etiqueta: 'madre', r: 0.55, sesgo: -0.4 }, { tipo: 'jueces', variable: 'Estrés', jueces: 3, kappa: 0.6, icc: null }, { tipo: 'juecesContinuo', variable: 'Percepción', jueces: 2, kappa: null, icc: 0.8 }] }),
    R9: base(2000, { sociodemograficos: [socioN('Edad', 'E', 20, 3, 15, 30), socioB('Sexo', 'S', 0.5), socioB('Programa', 'Pr', 0.4), socioC('Aula', 'Au', 20)], diferenciasGrupo: [{ tipo: 'd', cuantitativa: 'Estrés', agrupacion: 'Sexo', d: 0.4 }, { tipo: 'interaccion', cuantitativa: 'Estrés', agrupacion: 'Sexo', agrupacion2: 'Programa', d: 0.5 }, { tipo: 'icc', cuantitativa: 'Percepción', agrupacion: 'Aula', d: 0.2 }] }),
    R10: base(800, { correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.35 }], diferenciasGrupo: [{ tipo: 'd', cuantitativa: 'Estrés', agrupacion: 'Sexo', d: 0.4 }], realismo: { pctPerdidos: 5, mecanismoPerdidos: 'MAR', referenciaMAR: 'Edad', sentidoMAR: 'bajos', pctDescuidados: 6, tipoDescuidado: 'mixto', marcarDescuidados: true, pctDigitacion: 3, pctAquiescencia: 10, pctExtrema: 8, intensidadEstilos: 'moderada', itemsControl: 2, tiempoMinutos: 12 } }),
    R11: null, R12: null
};
// R5 corregida (la línea de arriba se limpia)
REFERENCIAS.R5 = base(1500, { modelos: [{ tipo: 'mediacion', x: 'Percepción', m: 'Comprensión', y: 'Estrés', c1: 0.4, c2: -0.3, c3: -0.15 }, { tipo: 'moderacion', x: 'Regulación', m: 'Edad', y: 'Comprensión', c1: 0.3, c2: 0.2, c3: 0.15 }, { tipo: 'curvilinea', x: 'Edad', m: 'Edad', y: 'Regulación', c1: 0.2, c2: -0.25, c3: 0 }] });
// R11/R12: configuración máxima (todas las tablas) en exacto n = 1200 y en no exacto n = 60
const maxima = (n, exactas) => {
    const c = base(n, { correlacionesExactas: exactas,
        sociodemograficos: [socioN('Edad', 'E', 20, 3, 15, 30), socioB('Sexo', 'S', 0.5, [{ codigo: 0, etiqueta: 'Femenino', proporcion: 0.5 }, { codigo: 1, etiqueta: 'Masculino', proporcion: 0.5 }]), socioB('Programa', 'Pr', 0.4), socioC('Aula', 'Au', 12)],
        correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.35 }, { a: 'Edad', b: 'Regulación', r: 0.2 }],
        diferenciasGrupo: [{ tipo: 'd', cuantitativa: 'Estrés', agrupacion: 'Sexo', d: 0.4 }, { tipo: 'interaccion', cuantitativa: 'Regulación', agrupacion: 'Sexo', agrupacion2: 'Programa', d: 0.4 }, { tipo: 'icc', cuantitativa: 'Comprensión', agrupacion: 'Aula', d: 0.15 }],
        modelos: [{ tipo: 'mediacion', x: 'Percepción', m: 'Comprensión', y: 'Estrés', c1: 0.4, c2: -0.3, c3: -0.15 }],
        medidasRepetidas: [{ variable: 'Regulación', ondas: 2, estabilidad: 0.7, cambio: 0.3, agrupacion: 'Programa', cambioGrupo: 0.6, modelo: 'ar1', dePendientes: 0, rInterceptoPendiente: 0 }],
        estructuras: [{ prueba: 'EQ-i', modo: 'cargas', factores: ['Percepción', 'Comprensión', 'Regulación'], cargas: { 'Percepción': cargas(8, 0.7, 3, 0), 'Comprensión': cargas(8, 0.65, 3, 1), 'Regulación': cargas(8, 0.6, 3, 2) }, metodo: { carga: 0.25 }, desajuste: 'leve' }],
        desenlaces: [{ nombre: 'Deserción', tipo: 'binario', prevalencia: 0.3, media: null, niveles: null, etiquetas: ['No', 'Sí'], predictores: [{ variable: 'Estrés', efecto: 1.8 }] }],
        cortes: [{ variable: 'Estrés', etiquetas: ['Bajo', 'Medio', 'Alto'], cortes: [24, 36], porPercentil: false }],
        concordancias: [{ tipo: 'informante', variable: 'Percepción', etiqueta: 'docente', r: 0.5, sesgo: 0.2 }, { tipo: 'jueces', variable: 'Estrés', jueces: 2, kappa: 0.7, icc: null }],
        realismo: exactas ? { pctPerdidos: 0, pctDescuidados: 0, pctDigitacion: 0 } : { pctPerdidos: 4, mecanismoPerdidos: 'MCAR', pctDescuidados: 3, tipoDescuidado: 'mixto', marcarDescuidados: true, pctDigitacion: 2, pctAquiescencia: 5, pctExtrema: 5, intensidadEstilos: 'leve', itemsControl: 1, tiempoMinutos: 10 } });
    c.pruebas.push({ nombre: 'Conocimientos', nombreCorto: 'CO', prueba: 'Examen', tipo: 'dimension', numItems: 12, media: 7, desviacion: 2, alfa: 0.75, minimo: 0, maximo: 1, distribucion: 'normal', invertidos: 0, dificultades: null });
    return c;
};
REFERENCIAS.R11 = maxima(1200, true);
REFERENCIAS.R12 = maxima(60, false);

if (!fs.existsSync('ref')) fs.mkdirSync('ref');
const t0 = Date.now();
Object.entries(REFERENCIAS).forEach(([id, cfg]) => {
    if (!cfg) return;
    const g = new GeneradorDatos();
    g.configuracion = JSON.parse(JSON.stringify(cfg));
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const val = g.validarConfiguracion();
    if (val.errores.length) { console.log(id, 'ERRORES DE VALIDACIÓN:', val.errores.join(' | ')); return; }
    const b = g.generarBaseDatos();
    const inf = g.informePedidoObtenido(b);
    const cfgE = g.configuracion;
    const esquema = {
        n: b.n, exactas: cfgE.correlacionesExactas !== false, indice: cfgE.indiceFiabilidad,
        pruebas: cfgE.pruebas.map(p => ({ nombre: p.nombre, columna: g.columnaDeEscala(p), items: g._itemsDe(p), invertidos: p.invertidos || 0, numItems: p.numItems, minimo: p.minimo, maximo: p.maximo, media: p.media, desviacion: p.desviacion, alfa: p.alfa, dicotomica: g._esDicotomica(p), base: p.base ? p.base.nombre : null, onda: p.onda || null, informante: p.informante || null, dificultades: p.dificultadesEfectivas || null, estructura: !!(g.perfilesItems && g.perfilesItems.get(p) && g.perfilesItems.get(p).estructura) })),
        generales: cfgE.gruposPruebas.filter(x => x.escalas.length >= 2).map(x => ({ nombre: g.nombreGeneral(x), columna: `General_${x.sigla}`, dims: x.escalas })),
        socios: cfgE.sociodemograficos.map(s => ({ categoria: s.categoria, columna: s.categoria, distribucion: s.distribucion, niveles: s.niveles || null, dependeDe: s.dependeDe || '' })),
        correlaciones: cfgE.correlaciones, diferenciasGrupo: cfgE.diferenciasGrupo, modelos: cfgE.modelos, desenlaces: cfgE.desenlaces, cortes: (g.cortesGenerados || []), concordancias: cfgE.concordancias, jueces: g.juecesGenerados || [], medidasRepetidas: cfgE.medidasRepetidas,
        columnaDe: {}
    };
    esquema.pruebas.forEach(p => { esquema.columnaDe[p.nombre] = p.columna; });
    esquema.generales.forEach(gn => { esquema.columnaDe[gn.nombre] = gn.columna; });
    esquema.socios.forEach(s => { esquema.columnaDe[s.categoria] = s.columna; });
    fs.writeFileSync(`ref/${id}.csv`, g.exportarCSV(';'));
    fs.writeFileSync(`ref/${id}.esquema.json`, JSON.stringify(esquema));
    fs.writeFileSync(`ref/${id}.informe.json`, JSON.stringify(inf));
    console.log(id, 'n', b.n, 'columnas', b.columnas.length, 'filas del informe', inf.length, 'no ok', inf.filter(f => !f.ok).length, 'avisos', val.advertencias.length);
});
console.log('listo en', ((Date.now() - t0) / 1000).toFixed(1), 's');
