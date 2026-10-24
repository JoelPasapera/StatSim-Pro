// tests/run.js — batería de StatSim Pro. Desde la raíz del proyecto:
//     npm test              → modo rápido (pruebas de Node + escenarios; unos dos minutos)
//     npm run test:completo → todo (añade mutaciones, sondas, fuzz y los dieciocho oráculos en Python; el de Excel, si hay openpyxl)
// Los bloques independientes se ejecutan EN PARALELO (antes iban uno detrás de otro).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, '..');
const completo = process.argv.includes('completo') || process.env.STATSIM_TEST === 'completo';
// los procesos hijos heredan el modo: en la completa corren también las pruebas lentas (tests/solo-completa.js)
if (completo) process.env.STATSIM_TEST = 'completo';
// solo=node,escenarios,extra,oraculos,navegador: ejecuta solo esos bloques. La batería completa roza el límite de tiempo de
// algunos entornos (272 s en la 2026.11.09); en dos llamadas («solo=node» y «solo=escenarios,extra,oraculos,navegador») cubre
// lo mismo. (2027.01.01) «navegador»: los ejemplos de ejemplos/ rehechos en Chromium, si está Playwright.
// Sin «solo=», todos, como siempre
const solo = (process.argv.find(a => a.startsWith('solo=')) || '').slice(5).split(',').filter(Boolean);
const incluye = bloque => !solo.length || solo.includes(bloque);
const t0 = Date.now();
const seg = ms => `${(ms / 1000).toFixed(1)} s`;

function correr(cmd, args, cwd) {
    return new Promise(resolver => {
        const inicio = Date.now();
        // sin shell: node es una ruta absoluta y python/python3/py son ejecutables que spawn encuentra en el PATH
        const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        let out = '';
        p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
        p.on('error', e => resolver({ ok: false, out: String(e), ms: Date.now() - inicio }));
        // (2027.01.01) un proceso que muere por una señal (el sistema sin memoria lo mata) no escribe nada: se dice
        p.on('close', (codigo, senal) => resolver({ ok: codigo === 0, out: senal ? `${out}\nFALLO: el proceso terminó por la señal ${senal} (¿sin memoria?)` : out, ms: Date.now() - inicio }));
    });
}
// el script de TypeScript (typescript/bin/tsc): en el proyecto, en el PATH (resolviendo el enlace) o en la carpeta global de npm
function rutaTsc() {
    const candidatos = [];
    try { candidatos.push(createRequire(path.join(raiz, 'package.json')).resolve('typescript/bin/tsc')); } catch (e) { /* no está en el proyecto */ }
    for (const dir of (process.env.PATH || '').split(path.delimiter)) { try { const f = path.join(dir, 'tsc'); if (fs.existsSync(f)) candidatos.push(fs.realpathSync(f)); } catch (e) { /* entrada del PATH inaccesible */ } }
    if (process.env.APPDATA) candidatos.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'typescript', 'bin', 'tsc'));
    return candidatos.find(f => { try { return fs.existsSync(f) && /typescript[\\/]bin[\\/]tsc$/.test(f); } catch (e) { return false; } }) || null;
}
function listarJs(dir) {
    const fuera = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) fuera.push(...listarJs(p)); else if (e.name.endsWith('.js')) fuera.push(p); }
    return fuera.sort();
}
async function python() {
    for (const cmd of ['python3', 'python', 'py']) { const r = await correr(cmd, ['-c', 'import numpy, scipy'], aqui); if (r.ok) return cmd; }
    return null;
}
let fallos = 0;
const filas = [];
const registrar = (nombre, r, resumen) => {
    filas.push(`${r.ok ? '✓' : '✗'} ${nombre}${resumen ? ' · ' + resumen : ''} (${seg(r.ms)})`);
    if (!r.ok) { fallos++; filas.push(r.out.split('\n').filter(l => /not ok|Error|✗|FALL|Traceback|AssertionError/.test(l)).slice(0, 15).map(l => '    ' + l).join('\n')); }
};

// 0) versión coherente en src/version.js, index.html y version.json
{
    const v = (fs.readFileSync(path.join(raiz, 'src', 'version.js'), 'utf8').match(/VERSION = '([^']+)'/) || [])[1];
    const enIndex = (fs.readFileSync(path.join(raiz, 'index.html'), 'utf8').match(/<script type="module" src="src\/main\.js\?v=([^"]+)"/) || [])[1];
    const enJson = JSON.parse(fs.readFileSync(path.join(raiz, 'version.json'), 'utf8')).version;
    const ok = !!v && v === enIndex && v === enJson;
    filas.push(`${ok ? '✓' : '✗'} versión coherente · src/version.js ${v} · index.html ${enIndex} · version.json ${enJson}`);
    if (!ok) fallos++;
}

// 1) pruebas del runner nativo (TAP para leer el resumen igual en todas las versiones de Node)
const archivosTest = ['unit', 'integration', 'ui'].flatMap(d => fs.readdirSync(path.join(aqui, d)).filter(f => f.endsWith('.test.js')).map(f => path.join(aqui, d, f)));
const tareas = [];
if (incluye('node')) tareas.push(
    correr(process.execPath, ['--test', '--test-reporter=tap', ...archivosTest], raiz).then(r => {
        const pasa = (r.out.match(/^# pass (\d+)/m) || [])[1], falla = (r.out.match(/^# fail (\d+)/m) || [])[1], omite = +((r.out.match(/^# skipped (\d+)/m) || [])[1] || 0);
        registrar(`node --test (${archivosTest.length} archivos: unit + integration + ui)`, r, `pasan ${pasa ?? '?'} · fallan ${falla ?? '?'}${omite ? ` · omitidas ${omite} (las lentas: solo en la completa)` : ''}`);
    }));
if (incluye('escenarios')) tareas.push(
    correr(process.execPath, ['escenarios.js'], path.join(aqui, 'integration')).then(r => {
        // (revisión 2026.11.14) solo se excluye el resultado ESPERADO de S7 (dos siglas que chocan: rechazo o error con ese mensaje);
        // antes se excluía cualquier hallazgo de S7 y cualquier «columnas sin etiqueta», lo que podía ocultar regresiones
        const malos = r.out.match(/^ - (?!S7_siglas_que_chocan: (?:EXCEPCIÓN|VALIDACIÓN RECHAZA): Dos columnas se llamarían).*/gm) || [];
        registrar('escenarios compuestos', { ...r, ok: r.ok && malos.length === 0, out: malos.join('\n') }, malos.length ? malos.length + ' hallazgo(s)' : 'limpio');
    }));
if (completo) {
    // (revisión de la 2026.12.06) comprobación de tipos de los módulos con // @ts-check: en la 2026.12.04 un módulo nuevo entró con
    // 5 errores porque la batería no la hacía. Se ejecuta con node el script de TypeScript (sin shell: en Windows un .cmd no se puede
    // lanzar así); si no está instalado, el bloque se omite y lo dice (nunca un verde falso)
    if (incluye('extra')) tareas.push((async () => {
        const script = rutaTsc();
        if (!script) { filas.push('· comprobación de tipos omitida: TypeScript no está instalado (npm i -D typescript)'); return; }
        const archivos = listarJs(path.join(raiz, 'src'));
        const r = await correr(process.execPath, [script, '--noEmit', '--allowJs', '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler', '--lib', 'es2022,dom,dom.iterable', '--skipLibCheck', ...archivos], raiz);
        const errores = (r.out.match(/error TS\d+/g) || []).length;
        registrar('comprobación de tipos (tsc sobre los módulos con // @ts-check)', { ...r, ok: errores === 0 && r.ok }, `${archivos.length} archivos · ${errores} errores`);
    })());
    if (incluye('extra')) tareas.push(correr(process.execPath, ['mutaciones.js'], path.join(aqui, 'integration')).then(r => { const malos = r.out.match(/esperaba error/g) || []; registrar('mutaciones de la validación', { ...r, ok: r.ok && malos.length === 0, out: (r.out.match(/.*esperaba error.*/g) || []).join('\n') }, malos.length ? malos.length + ' sin atrapar' : 'todas atrapadas o avisadas'); }));
    if (incluye('extra')) tareas.push(correr(process.execPath, ['sondas.js'], path.join(aqui, 'integration')).then(r => { const malos = r.out.match(/EXCEPCIÓN/g) || []; registrar('sondas de casos límite', { ...r, ok: r.ok && malos.length === 0, out: (r.out.match(/.*EXCEPCIÓN.*/g) || []).join('\n') }, malos.length ? malos.length + ' excepción(es)' : 'sin excepciones'); }));
    if (incluye('extra')) tareas.push(correr(process.execPath, ['fuzz.js', '60', '2026'], path.join(aqui, 'fuzz')).then(r => registrar('fuzz (60 configuraciones aleatorias)', r, (r.out.match(/\d+ fallos/) || [''])[0])));
    // Monte Carlo de la invarianza ordinal (paso 6B): solo Node
    if (incluye('extra')) tareas.push(correr(process.execPath, ['montecarlo/invarianza-ordinal.mjs', '200', '60'], aqui).then(rM => {
        registrar('Monte Carlo de la invarianza ordinal (200 réplicas: DIFFTEST, χ² corregido, medias latentes, potencia)', rM, (() => { try { const r = JSON.parse(rM.out.trim().split('\n')[0]); return `DIFFTEST ${Object.values(r.rechazo).map(v => (100 * v).toFixed(1) + ' %').join(' / ')}, EE ×${r.razonEE.toFixed(2)}, potencia ${r.potenciaEscalar.toFixed(2)} y ${r.potenciaUmbrales.toFixed(2)}`; } catch (e) { return ''; } })());
    }));
    if (incluye('extra')) tareas.push(correr(process.execPath, ['montecarlo/invarianza-ordinal-multifactor.mjs', '100'], aqui).then(rM => {
        registrar('Monte Carlo de la invarianza ordinal multifactor (2 factores, 3 grupos, 3 y 5 categorías)', rM, (() => { try { const r = JSON.parse(rM.out.trim().split('\n')[0]); return `DIFFTEST ${Object.values(r.rechazo).map(v => (100 * v).toFixed(0) + ' %').join(' / ')}, EE ×${Object.values(r.razonEE).join('–')}`; } catch (e) { return ''; } })());
    }));
    // Monte Carlo del WLSMV: solo Node, así que corre también sin Python
    if (incluye('extra')) tareas.push(correr(process.execPath, ['montecarlo/wlsmv.mjs', '600'], aqui).then(rM => {
        registrar('Monte Carlo del WLSMV (600 réplicas: Γ, EE robustos, tasa de rechazo, sesgo)', rM, (() => { try { const r = JSON.parse(rM.out.trim().split('\n')[0]); return `rechazo ${(100 * r.tasaRechazo).toFixed(1)} %, Γ ×${r.razonGammaMedia.toFixed(3)}, EE ×[${r.razonEE.map(v => v.toFixed(2)).join(', ')}]`; } catch (e) { return ''; } })());
    }));
    // (2027.01.01) los ejemplos de ejemplos/, rehechos en Chromium pulsando los botones y comparados con su carpeta
    // (tests/navegador/ejemplos.mjs). Sin Playwright se omite y se dice: las pruebas de Node (integration/ejemplos.test.js)
    // comprueban siempre, sin navegador, sus archivos, sus bases y sus cifras
    if (incluye('navegador')) tareas.push((async () => {
        const { prepararChromium } = await import('./navegador/entorno.mjs');
        const { pw, motivo } = await prepararChromium();
        if (!pw) { filas.push(`· ejemplos en el navegador omitidos: ${motivo}; las pruebas de Node ya comprueban sus archivos, sus bases y sus cifras`); return; }
        const r = await correr(process.execPath, [path.join('navegador', 'ejemplos.mjs'), 'comprobar'], aqui);
        const iguales = (r.out.match(/^✓/gm) || []).length, distintos = (r.out.match(/^✗/gm) || []).length, sinDibujo = /salvo el dibujo/.test(r.out);
        const ok = r.ok && distintos === 0 && iguales > 0;
        // (2027.01.01) si falla, las últimas líneas de su salida (un error de Playwright no siempre dice «Error»)
        const cola = ok ? '' : '\n' + r.out.trim().split('\n').slice(-6).map(l => `✗ ${l}`).join('\n');
        registrar('ejemplos rehechos en Chromium (los cinco casos de ejemplos/, comparados con su carpeta)', { ...r, out: r.out + cola, ok }, `${iguales} iguales${distintos ? ` · ${distintos} distintos` : ''}${sinDibujo ? ' · PDF y figuras del Word sin comparar byte a byte (otro dibujo: otras fuentes u otro Chromium)' : ''}`);
    })());
    // (2027.01.02) la pestaña «Ejemplos» en Chromium: la galería, cada caso con sus descargas, el .zip, «Abrir en StatSim» y
    // la guía, en el escritorio y en un teléfono (tests/navegador/pestana-ejemplos.mjs)
    if (incluye('navegador')) tareas.push((async () => {
        const { prepararChromium } = await import('./navegador/entorno.mjs');
        const { pw } = await prepararChromium();
        if (!pw) return;   // el bloque de los ejemplos ya dijo por qué se omite
        const r = await correr(process.execPath, [path.join('navegador', 'pestana-ejemplos.mjs')], aqui);
        const bien = (r.out.match(/^✓/gm) || []).length, mal = (r.out.match(/^✗/gm) || []).length;
        const ok = r.ok && mal === 0 && bien > 0;
        const cola = ok ? '' : '\n' + r.out.trim().split('\n').filter(l => !/^✓/.test(l)).slice(-6).map(l => (/^✗/.test(l) ? l : `✗ ${l}`)).join('\n');
        registrar('la pestaña «Ejemplos» en Chromium (galería, descargas, .zip, «Abrir en StatSim», guía; escritorio y teléfono)', { ...r, out: r.out + cola, ok }, `${bien} comprobaciones${mal ? ` · ${mal} fallan` : ''}`);
    })());
    // (2027.01.03) «Hazlo por mí» en Chromium: los cinco casos repetidos con los botones de su guía, y lo que se descarga tras
    // cada paso, byte a byte el de su carpeta; «Muéstrame», a la vista en el escritorio y en un teléfono (tests/navegador/hazlo-por-mi.mjs)
    if (incluye('navegador')) tareas.push((async () => {
        const { prepararChromium } = await import('./navegador/entorno.mjs');
        const { pw } = await prepararChromium();
        if (!pw) return;   // el bloque de los ejemplos ya dijo por qué se omite
        const r = await correr(process.execPath, [path.join('navegador', 'hazlo-por-mi.mjs')], aqui);
        const bien = (r.out.match(/^✓/gm) || []).length, mal = (r.out.match(/^✗/gm) || []).length;
        const ok = r.ok && mal === 0 && bien > 0;
        const cola = ok ? '' : '\n' + r.out.trim().split('\n').filter(l => !/^✓/.test(l)).slice(-6).map(l => (/^✗/.test(l) ? l : `✗ ${l}`)).join('\n');
        registrar('«Hazlo por mí» en Chromium (los cinco casos con su guía, comparados byte a byte con su carpeta; «Muéstrame» a la vista)', { ...r, out: r.out + cola, ok }, `${bien} comprobaciones${mal ? ` · ${mal} fallan` : ''}`);
    })());
    if (incluye('oraculos')) tareas.push((async () => {
        const py = await python();
        if (!py) { filas.push('· oráculos omitidos (hace falta Python 3 con NumPy y SciPy)'); return; }
        const [r0, r1, rA, rO, rB, rF, rS, rC, rI, rFo, rDf, rDc, rNb, rCf, rIn, rNo, rSe] = await Promise.all([correr(py, ['analizador_oraculo.py'], path.join(aqui, 'oracle')), correr(process.execPath, ['referencias.js'], path.join(aqui, 'oracle')), correr(py, ['aiken_oraculo.py'], path.join(aqui, 'oracle')), correr(py, ['ordinal_oraculo.py'], path.join(aqui, 'oracle')), correr(py, ['bootstrap_oraculo.py'], path.join(aqui, 'oracle')), correr(py, ['afe_oraculo.py'], path.join(aqui, 'oracle')), correr(py, ['sem_oraculo.py'], path.join(aqui, 'oracle')), correr(py, ['concordancia_oraculo.py'], path.join(aqui, 'oracle')), correr(py, ['invarianza_oraculo.py'], path.join(aqui, 'oracle')),
            correr(process.execPath, ['formas_generar.mjs'], path.join(aqui, 'oracle')).then(g => (g.ok ? correr(py, ['formas_oraculo.py'], path.join(aqui, 'oracle')) : g)),
            correr(py, ['forma_oraculo.py'], path.join(aqui, 'oracle')),
            correr(py, ['forma_confirmacion_oraculo.py'], path.join(aqui, 'oracle')),
            correr(py, ['nube_oraculo.py'], path.join(aqui, 'oracle')),
            correr(py, ['cribado_oraculo.py'], path.join(aqui, 'oracle')),
            correr(py, ['inferencia_oraculo.py'], path.join(aqui, 'oracle')),
            correr(py, ['normalidad_oraculo.py'], path.join(aqui, 'oracle')),
            correr(py, ['separacion_oraculo.py'], path.join(aqui, 'oracle'))]);   // `correr` devuelve { ok, out, ms }
        registrar('oráculo del Analizador (fixture regenerado con SciPy)', r0, (r0.out.match(/\d+ bloques/) || [''])[0]);
        registrar('oráculo de la V de Aiken (convolución verificada por enumeración)', rA, (rA.out.match(/\d+ casos \(\d+ verificados por enumeración\)/) || [''])[0]);
        registrar('oráculo ordinal (Φ con mpmath, Φ₂ verificada con Owen, policóricas, α y ω ordinales)', rO, (rO.out.match(/\d+ Φ₂.*$/m) || [''])[0]);
        registrar('oráculo del bootstrap (sfc32 bit a bit, percentil y BCa)', rB, (rB.out.match(/\d+ secuencias.*$/m) || [''])[0]);
        registrar('oráculo del AFE (KMO, Bartlett, paralelo, ejes principales, oblimin, varimax, promax)', rF, (rF.out.match(/12 ítems.*$/m) || [''])[0]);
        registrar('oráculo del SEM por ML (forma LISREL, gradiente numérico, información esperada)', rS, (rS.out.match(/AFC.*$/m) || [''])[0]);
        registrar('oráculo de concordancia (κ de Cohen con scikit-learn, Fleiss, CCI y F de SciPy)', rC, (rC.out.match(/κ de Cohen.*$/m) || [''])[0]);
        registrar('oráculo de las relaciones con forma (68 bases analizadas en NumPy/SciPy: η, identidad de r, identificación, marginales)', rFo, (rFo.out.match(/^formas:.*$/m) || [''])[0].slice(0, 150));
        registrar('oráculo de invarianza (AFC multigrupo ML con medias en SciPy, 4 niveles, 2 y 3 grupos)', rI, (rI.out.match(/^invariante:.*$/m) || [''])[0].slice(0, 120));
        registrar('oráculo del diagnóstico de forma (r, ρ, τ-b, dCor, η y mínimos de los 10 modelos en SciPy)', rDf, (rDf.out.match(/^forma_fixture.*$/m) || [''])[0].slice(0, 120));
        registrar('oráculo de las confirmaciones (P-spline, Robin Hood, HC3, Lind–Mehlum con Fieller y TOST en SciPy)', rDc, (rDc.out.match(/^forma_confirmacion_fixture.*$/m) || [''])[0].slice(0, 120));
        registrar('oráculo de la nube (cuantiles por programación lineal, Breusch–Pagan, White, NCA e influencia en SciPy)', rNb, (rNb.out.match(/^nube_fixture.*$/m) || [''])[0].slice(0, 120));
        registrar('oráculo del cribado de forma (RESET con HC3, giros de la cúbica y Holm en SciPy)', rCf, (rCf.out.match(/^cribado_fixture.*$/m) || [''])[0].slice(0, 120));
        registrar('oráculo de la inferencia (grupos y su protocolo con el ANOVA de Welch y los post-hoc, regresión con los mínimos cuadrados exactos en racionales, logística y Poisson con Newton en decimal de 50 cifras, ANCOVA, MANOVA, metaanálisis, Δχ² del SEM e inferencia de la correlación con su potencia exacta, en SciPy y R)', rIn, (rIn.out.match(/^inferencia_fixture.*$/m) || [''])[0].slice(0, 120));
        registrar('oráculo de la normalidad (Shapiro-Wilk en SciPy; Kolmogórov-Smirnov: D en SciPy y p de nortest::lillie.test)', rNo, (rNo.out.match(/^normalidad_fixture.*$/m) || [''])[0].slice(0, 120));
        registrar('oráculo de la separación (¿estimación finita en la logística y Poisson? Programación lineal con HiGHS de SciPy)', rSe, (rSe.out.match(/^separacion_fixture.*$/m) || [''])[0].slice(0, 120));
        // (2026.12.31) el de Excel, si Python tiene openpyxl (no viene con NumPy ni SciPy): sin él se omite y se dice. Las pruebas
        // de Node (integration/xlsx.test.js) comparan igual con lo que openpyxl leyó al generar xlsx_fixture.json: lo que
        // falta sin openpyxl es volver a leerlo ahora
        const conOpenpyxl = await correr(py, ['-c', 'import openpyxl'], path.join(aqui, 'oracle'));
        if (conOpenpyxl.ok) {
            const rX = await correr(py, ['xlsx_oraculo.py'], path.join(aqui, 'oracle'));
            registrar('oráculo de Excel (openpyxl lee los libros de openpyxl, XlsxWriter, LibreOffice y a mano, y los del escritor propio)', rX, (rX.out.match(/^xlsx_fixture.*$/m) || [''])[0].slice(0, 140));
        } else filas.push('· oráculo de Excel omitido: hace falta openpyxl (pip install openpyxl); las pruebas de Node ya comparan con su lectura guardada (xlsx_fixture.json)');
        const r2 = await correr(py, ['oraculo.py'], path.join(aqui, 'oracle'));
        registrar('referencias del Simulador + oráculo NumPy', { ...r2, ok: r1.ok && r2.ok && /'DIF': 0/.test(r2.out) }, (r2.out.match(/TOTAL .*/) || [''])[0]);
    })());
}
await Promise.all(tareas);
console.log(filas.join('\n'));
console.log(`\n${fallos ? fallos + ' bloque(s) con fallos' : 'Batería en verde'} · modo ${completo ? 'completo' : 'rápido (npm run test:completo para todo)'}${solo.length ? ' · solo: ' + solo.join(', ') : ''} · ${seg(Date.now() - t0)}`);
process.exitCode = fallos ? 1 : 0;
