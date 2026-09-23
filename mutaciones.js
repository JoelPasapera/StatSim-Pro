'use strict';
const fs = require('fs');
eval(fs.readFileSync('base-columnar.js', 'utf8') + '\n;globalThis.BaseColumnar = BaseColumnar;');
eval(fs.readFileSync('generador-datos.js', 'utf8') + '\n;globalThis.GeneradorDatos = GeneradorDatos;');
// helpers y configuración máxima de referencias.js (mismo ámbito, para que `base` sea visible)
{ const srcR = fs.readFileSync('referencias.js', 'utf8'); const a = srcR.indexOf('const escala'); const b = srcR.indexOf('const REFERENCIAS'); const m = srcR.match(/const maxima = \(n, exactas\) => \{[\s\S]*?\n\};/)[0]; eval(srcR.slice(a, b) + m.replace('const maxima', 'globalThis.maximaRef')); }

const valida = () => JSON.parse(JSON.stringify(globalThis.maximaRef(200, true)));   // configuración válida con todas las tablas
const M = [];
const mut = (nombre, fn, esperado = 'error') => M.push({ nombre, fn, esperado });
// tabla I
mut('numItems = 1', c => { c.pruebas[0].numItems = 1; });
mut('numItems = 0', c => { c.pruebas[0].numItems = 0; });
mut('numItems = 200', c => { c.pruebas[0].numItems = 200; }, 'aviso');
mut('media fuera del rango del total', c => { c.pruebas[0].media = 60; });
mut('DE = 0', c => { c.pruebas[0].desviacion = 0; });
mut('DE negativa', c => { c.pruebas[0].desviacion = -2; });
mut('DE enorme', c => { c.pruebas[0].desviacion = 30; });
mut('mín > máx', c => { c.pruebas[0].minimo = 5; c.pruebas[0].maximo = 1; });
mut('α = 1.2', c => { c.pruebas[0].alfa = 1.2; });
mut('α negativo', c => { c.pruebas[0].alfa = -0.1; });
mut('invertidos > ítems', c => { c.pruebas[0].invertidos = 20; });
mut('dos escalas con el mismo nombre', c => { c.pruebas[1].nombre = c.pruebas[0].nombre; });
mut('escala con nombre vacío', c => { c.pruebas[0].nombre = ''; });
mut('dificultades con k−1 valores', c => { const p = c.pruebas.find(x => x.nombre === 'Conocimientos'); p.dificultades = [0.5, 0.5, 0.5]; });
mut('dificultad 1.5', c => { const p = c.pruebas.find(x => x.nombre === 'Conocimientos'); p.dificultades = Array(12).fill(1.5); }, 'aviso');
mut('dicotómica con KR-20 0.99', c => { const p = c.pruebas.find(x => x.nombre === 'Conocimientos'); p.alfa = 0.99; });
// tabla II
mut('binaria promedio 1.5', c => { c.sociodemograficos[1].promedio = 1.5; });
mut('categórica mín > máx', c => { c.sociodemograficos[3].minimo = 12; c.sociodemograficos[3].maximo = 1; });
mut('niveles con proporción 0', c => { c.sociodemograficos[1].niveles[0].proporcion = 0; c.sociodemograficos[1].niveles[1].proporcion = 1; }, 'aviso');
mut('dependeDe sí misma', c => { c.sociodemograficos[3].dependeDe = 'Aula'; });
mut('dependeDe inexistente', c => { c.sociodemograficos[3].dependeDe = 'Fantasma'; });
mut('fuerza 2', c => { c.sociodemograficos[3].dependeDe = 'Sexo'; c.sociodemograficos[3].fuerza = 2; }, 'aviso');
mut('socio con nombre de escala', c => { c.sociodemograficos[0].categoria = 'Percepción'; });
mut('socio normal DE 0', c => { c.sociodemograficos[0].desviacion = 0; });
mut('socio normal media fuera de mín–máx', c => { c.sociodemograficos[0].promedio = 100; });
// tabla III
mut('r = 1.5', c => { c.correlaciones[0].r = 1.5; });
mut('r consigo misma', c => { c.correlaciones.push({ a: 'Percepción', b: 'Percepción', r: 0.5 }); });
mut('r con variable inexistente', c => { c.correlaciones.push({ a: 'Percepción', b: 'Nada', r: 0.5 }); });
mut('r duplicada con valores distintos', c => { c.correlaciones.push({ a: 'Percepción', b: 'Estrés', r: 0.5 }); });
mut('matriz imposible (tríada)', c => { c.correlaciones = [{ a: 'Percepción', b: 'Comprensión', r: 0.9 }, { a: 'Comprensión', b: 'Regulación', r: 0.9 }, { a: 'Percepción', b: 'Regulación', r: -0.9 }]; c.estructuras = []; c.modelos = []; c.diferenciasGrupo = []; }, 'aviso');
// tabla IV
mut('d = 5', c => { c.diferenciasGrupo[0].d = 5; });
mut('d con agrupación continua', c => { c.diferenciasGrupo[0].agrupacion = 'Edad'; });
mut('d con cuantitativa inexistente', c => { c.diferenciasGrupo[0].cuantitativa = 'Nada'; });
mut('CCI = 1.5', c => { c.diferenciasGrupo[2].d = 1.5; });
mut('interacción con la misma agrupación dos veces', c => { c.diferenciasGrupo[1].agrupacion2 = 'Sexo'; });
// tabla V
mut('mediación con coeficiente 2', c => { c.modelos[0].c1 = 2; });
mut('mediación x = y', c => { c.modelos[0].y = c.modelos[0].x; });
mut('mediación con R² > 1', c => { c.modelos[0].c1 = 0.95; c.modelos[0].c2 = 0.95; c.modelos[0].c3 = 0.95; });
// tabla VI
mut('ondas = 9', c => { c.medidasRepetidas[0].ondas = 9; });
mut('estabilidad 1.2', c => { c.medidasRepetidas[0].estabilidad = 1.2; });
mut('cambio 5', c => { c.medidasRepetidas[0].cambio = 5; });
mut('agrupación del cambio categórica', c => { c.medidasRepetidas[0].agrupacion = 'Aula'; });
// tabla VII
mut('estructura con filas de menos', c => { c.estructuras[0].cargas['Percepción'].pop(); });
mut('carga 2', c => { c.estructuras[0].cargas['Percepción'][0][0] = 2; });
mut('carga propia 0', c => { c.estructuras[0].cargas['Percepción'][0][0] = 0; });
mut('cruzada mayor que la propia', c => { c.estructuras[0].cargas['Percepción'][0][1] = 0.9; });
mut('método 0.9', c => { c.estructuras[0].metodo = { carga: 0.9 }; });
mut('desajuste desconocido', c => { c.estructuras[0].desajuste = 'brutal'; });
// tabla VIII
mut('prevalencia 1.5', c => { c.desenlaces[0].prevalencia = 1.5; });
mut('OR 50', c => { c.desenlaces[0].predictores[0].efecto = 50; });
mut('predictor inexistente', c => { c.desenlaces[0].predictores[0].variable = 'Nada'; });
mut('desenlace con nombre de escala', c => { c.desenlaces[0].nombre = 'Estrés'; });
mut('corte desordenado', c => { c.cortes[0].cortes = [36, 24]; });
mut('corte fuera del rango', c => { c.cortes[0].cortes = [24, 90]; }, 'aviso');
mut('corte sobre sociodemográfica', c => { c.cortes[0].variable = 'Edad'; });
// tabla IX
mut('informante r = 0', c => { c.concordancias[0].r = 0; });
mut('informante etiqueta T2', c => { c.concordancias[0].etiqueta = 'T2'; });
mut('jueces = 10', c => { c.concordancias[1].jueces = 10; });
mut('κ = 1.2', c => { c.concordancias[1].kappa = 1.2; });
mut('jueces sobre escala sin corte', c => { c.concordancias[1].variable = 'Percepción'; });
// general y realismo
mut('n = 5', c => { c.tamanoMuestra = 5; });
mut('n = 0', c => { c.tamanoMuestra = 0; });
mut('n = 10 000 000', c => { c.tamanoMuestra = 1e7; });
mut('semilla «abc»', c => { c.semilla = 'abc'; }, 'silencio');
mut('perdidos 200 %', c => { c.realismo = { pctPerdidos: 200, mecanismoPerdidos: 'MCAR', pctDescuidados: 0, pctDigitacion: 0 }; });
mut('descuidados 90 %', c => { c.realismo = { pctPerdidos: 0, pctDescuidados: 90, tipoDescuidado: 'mixto', pctDigitacion: 0 }; }, 'aviso');
mut('mecanismo desconocido', c => { c.realismo = { pctPerdidos: 5, mecanismoPerdidos: 'XYZ', pctDescuidados: 0, pctDigitacion: 0 }; }, 'silencio');
mut('referencia MAR inexistente', c => { c.realismo = { pctPerdidos: 5, mecanismoPerdidos: 'MAR', referenciaMAR: 'Nada', pctDescuidados: 0, pctDigitacion: 0 }; });

const filas = [];
M.forEach(m => {
    const cfg = valida();
    try { m.fn(cfg); } catch (e) { filas.push([m.nombre, 'MUTACIÓN INVÁLIDA ' + e.message]); return; }
    const g = new GeneradorDatos();
    g.configuracion = cfg;
    let val;
    try { g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas); val = g.validarConfiguracion(); } catch (e) { filas.push([m.nombre, 'EXCEPCIÓN EN VALIDACIÓN: ' + e.message.slice(0, 90)]); return; }
    if (val.errores.length) { filas.push([m.nombre, 'atrapada: ' + val.errores[0].slice(0, 110)]); return; }
    let resultado;
    if (cfg.tamanoMuestra > 1e6) { filas.push([m.nombre, 'SILENCIO → (generación omitida en el arnés: n > 1e6)', m.esperado]); return; }
    try { const b = g.generarBaseDatos(); const inf = g.informePedidoObtenido(b); const noOk = inf.filter(f => !f.ok).length; resultado = `generó (n ${b.n}, ${noOk} filas no ok)`; }
    catch (e) { resultado = 'EXCEPCIÓN AL GENERAR: ' + e.message.slice(0, 90); }
    filas.push([m.nombre, (val.advertencias.length ? 'aviso: ' + val.advertencias[0].slice(0, 70) + ' → ' : 'SILENCIO → ') + resultado, m.esperado]);
});
filas.forEach(([n, r, esp]) => console.log(`${n.padEnd(46)} | ${r}${esp && !r.startsWith('atrapada') && esp === 'error' ? '   ← esperaba error' : ''}`));
