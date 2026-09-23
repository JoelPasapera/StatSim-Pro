const fs = require('fs');
eval(fs.readFileSync('base-columnar.js', 'utf8') + '\n;globalThis.BaseColumnar = BaseColumnar;');
eval(fs.readFileSync('generador-datos.js', 'utf8') + '\n;globalThis.GeneradorDatos = GeneradorDatos;');
const escala = (nombre, corto, prueba, k, media, de, alfa, extra = {}) => ({ nombre, nombreCorto: corto, prueba, tipo: 'dimension', numItems: k, media, desviacion: de, alfa, minimo: 1, maximo: 5, distribucion: 'normal', invertidos: 0, ...extra });
const cfg = (n, pruebas, socios, extra = {}) => Object.assign({ tamanoMuestra: n, semilla: 3, generarPercentiles: true, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: {}, pruebas, sociodemograficos: socios, correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], gruposPruebas: [], realismo: {} }, extra);
const sexo = { categoria: 'Sexo', categoriaCorta: 'S', distribucion: 'binaria', promedio: 0.5 };
const edad = { categoria: 'Edad', categoriaCorta: 'E', distribucion: 'normal', promedio: 20, desviacion: 3, minimo: 15, maximo: 30, decimales: 0 };
const sondas = {
    'n = 2': cfg(2, [escala('A', 'A', 'T', 5, 15, 3, 0.8)], [sexo]),
    'n = 3 con correlación': cfg(3, [escala('A', 'A', 'T', 5, 15, 3, 0.8), escala('B', 'B', 'T', 5, 15, 3, 0.8)], [sexo], { correlaciones: [{ a: 'A', b: 'B', r: 0.5 }] }),
    'escala de 1 ítem': cfg(100, [escala('A', 'A', 'T', 1, 3, 1, 0)], [sexo]),
    'escala de 2 ítems todos invertidos': cfg(200, [escala('A', 'A', 'T', 2, 6, 1.5, 0.7, { invertidos: 2 })], [sexo]),
    'DE 0.01': cfg(100, [escala('A', 'A', 'T', 5, 15, 0.01, 0.8)], [sexo]),
    'media en el mínimo del rango': cfg(100, [escala('A', 'A', 'T', 5, 5, 1, 0.8)], [sexo]),
    'categórica de 1 nivel como agrupación': cfg(100, [escala('A', 'A', 'T', 5, 15, 3, 0.8)], [{ categoria: 'G', categoriaCorta: 'G', distribucion: 'categorica', promedio: 0, minimo: 1, maximo: 1 }], { diferenciasGrupo: [{ tipo: 'd', cuantitativa: 'A', agrupacion: 'G', d: 0.5 }] }),
    'r = 0.99 y −0.99': cfg(300, [escala('A', 'A', 'T', 5, 15, 3, 0.8), escala('B', 'B', 'T', 5, 15, 3, 0.8), escala('C', 'C', 'U', 5, 15, 3, 0.8)], [sexo], { correlaciones: [{ a: 'A', b: 'B', r: 0.99 }, { a: 'A', b: 'C', r: -0.99 }] }),
    'conteo con media 150': cfg(300, [escala('A', 'A', 'T', 5, 15, 3, 0.8)], [sexo, { categoria: 'Faltas', categoriaCorta: 'F', distribucion: 'conteo', promedio: 150 }]),
    'conteo con media 1000': cfg(300, [escala('A', 'A', 'T', 5, 15, 3, 0.8)], [sexo, { categoria: 'Faltas', categoriaCorta: 'F', distribucion: 'conteo', promedio: 1000 }]),
    'desenlace conteo con IRR 10': cfg(500, [escala('A', 'A', 'T', 5, 15, 3, 0.8)], [sexo], { desenlaces: [{ nombre: 'Eventos', tipo: 'conteo', prevalencia: null, media: 3, niveles: null, etiquetas: null, predictores: [{ variable: 'A', efecto: 10 }] }] }),
    'socio continuo con rango minúsculo': cfg(100, [escala('A', 'A', 'T', 5, 15, 3, 0.8)], [{ categoria: 'Edad', categoriaCorta: 'E', distribucion: 'normal', promedio: 20, desviacion: 3, minimo: 20, maximo: 20.5, decimales: 1 }]),
    'binaria con promedio 0': cfg(100, [escala('A', 'A', 'T', 5, 15, 3, 0.8)], [{ categoria: 'Sexo', categoriaCorta: 'S', distribucion: 'binaria', promedio: 0 }], { diferenciasGrupo: [{ tipo: 'd', cuantitativa: 'A', agrupacion: 'Sexo', d: 0.5 }] }),
    'escala uniforme 1–2 (dicotómica codificada 1/2)': cfg(300, [escala('A', 'A', 'T', 10, 15, 1, 0.7, { minimo: 1, maximo: 2 })], [sexo]),
    'percentiles con perdidos totales': cfg(100, [escala('A', 'A', 'T', 5, 15, 3, 0.8)], [sexo], { realismo: { pctPerdidos: 30, mecanismoPerdidos: 'MCAR', pctDescuidados: 0, pctDigitacion: 0 } }),
    'ondas 4 sobre escala continua asimétrica con estructura': cfg(300, [escala('A', 'A', 'T', 6, 15, 3, 0.8, { minimo: null, maximo: null, distribucion: 'asimetrica' })], [sexo], { medidasRepetidas: [{ variable: 'A', ondas: 4, estabilidad: 0.6, cambio: 0.5, agrupacion: '', cambioGrupo: null, modelo: 'ar1' }], estructuras: [{ prueba: 'T', modo: 'cargas', factores: ['A'], cargas: { A: [[0.7], [0.7], [0.6], [0.6], [0.5], [0.5]] }, metodo: null, desajuste: 'leve' }] }),
    'nombres con caracteres regex': cfg(100, [escala('A (1+2)*', 'A1', 'T.$', 5, 15, 3, 0.8), escala('B[x]?', 'B2', 'T.$', 5, 15, 3, 0.8)], [sexo], { correlaciones: [{ a: 'A (1+2)*', b: 'B[x]?', r: 0.3 }] }),
};
Object.entries(sondas).forEach(([nombre, c]) => {
    const g = new GeneradorDatos(); g.configuracion = JSON.parse(JSON.stringify(c)); g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    let out;
    try {
        const v = g.validarConfiguracion();
        if (v.errores.length) { out = 'validación: ' + v.errores[0].slice(0, 110); }
        else { const t0 = Date.now(); const b = g.generarBaseDatos(); const inf = g.informePedidoObtenido(b); const o = b.aObjetos(); const nan = b.columnas.filter(col => Array.from(col.datos).some(x => x !== x)).map(col => col.nombre); out = `generó n ${b.n} · ${((Date.now() - t0) / 1000).toFixed(1)} s · filas informe ${inf.length} (${inf.filter(f => !f.ok).length} no ok) · columnas con NaN: ${nan.slice(0, 4).join(',') || 'ninguna'}${v.advertencias.length ? ' · aviso: ' + v.advertencias[0].slice(0, 60) : ''}`; if (nombre.startsWith('conteo')) { const f = Array.from(b.columna('Faltas').datos); out += ` · Faltas media ${(f.reduce((s, x) => s + x, 0) / f.length).toFixed(1)} máx ${Math.max(...f)}`; } }
    } catch (e) { out = 'EXCEPCIÓN: ' + e.message.slice(0, 120); }
    console.log(`${nombre.padEnd(50)} | ${out}`);
});
