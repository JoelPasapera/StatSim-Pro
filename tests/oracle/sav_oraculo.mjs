// tests/oracle/sav_oraculo.mjs — (2026.12.29) el oráculo del puente SPSS. Lee con ReadStat (sav/volcado_readstat.c,
// independiente de core/data/sav/) los once archivos reales de SPSS de sav/ y las bases que escribe
// core/data/sav/escritor.js (sav_casos.js), y guarda lo que leyó en sav_fixture.json. La prueba de Node
// (tests/integration/sav.test.js) comprueba con ese fixture que el lector propio lee lo mismo que ReadStat y que el
// escritor sigue produciendo exactamente los bytes que ReadStat leyó bien.
//
// Uso (hace falta ReadStat compilado; ver la cabecera de sav/volcado_readstat.c):
//     node sav_oraculo.mjs /ruta/a/volcado_readstat        (o con la variable de entorno SAV_VOLCADO)
// No forma parte de la batería (tests/run.js): en Windows no suele haber un compilador de C. Hay que regenerar el fixture
// cuando cambie, a propósito, lo que escribe el escritor.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escribirSav } from '../../src/core/data/sav/escritor.js';
import { casosEscritor, sinMarcaDeTiempo } from './sav_casos.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const volcador = process.argv[2] || process.env.SAV_VOLCADO;
if (!volcador || !fs.existsSync(volcador)) {
    console.error('Falta el volcador de ReadStat: node sav_oraculo.mjs /ruta/a/volcado_readstat (cómo compilarlo: sav/volcado_readstat.c)');
    process.exit(2);
}
const sha256 = (/** @type {Uint8Array} */ b) => createHash('sha256').update(b).digest('hex');
/** @param {string} ruta */
const volcar = ruta => {
    const r = JSON.parse(execFileSync(volcador, [ruta], { maxBuffer: 1 << 28 }).toString('utf8'));
    if (r.error) throw new Error(`ReadStat no pudo leer ${path.basename(ruta)}: ${r.error}`);
    return r;
};

const dirReales = path.join(aqui, 'sav');
const reales = fs.readdirSync(dirReales).filter(f => /\.z?sav$/i.test(f)).sort().map(archivo => {
    const ruta = path.join(dirReales, archivo);
    return { archivo, sha256: sha256(fs.readFileSync(ruta)), readstat: volcar(ruta) };
});

const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'statsim-sav-'));
const escritos = casosEscritor().map(caso => {
    const { bytes, avisos, nombres } = escribirSav(caso.base, caso.opciones || {});
    const ruta = path.join(temporal, `${caso.nombre}.sav`);
    fs.writeFileSync(ruta, bytes);
    return { caso: caso.nombre, bytes: bytes.length, sha256: sha256(sinMarcaDeTiempo(bytes)), avisos, nombres, readstat: volcar(ruta) };
});
fs.rmSync(temporal, { recursive: true, force: true });

const salida = path.join(aqui, 'sav_fixture.json');
fs.writeFileSync(salida, JSON.stringify({
    descripcion: 'Lo que lee ReadStat (sav/volcado_readstat.c) de los archivos reales de SPSS de sav/ y de las bases que escribe core/data/sav/escritor.js (sav_casos.js). Generado por sav_oraculo.mjs.',
    reales, escritos
}) + '\n');
console.log(`sav_fixture.json: ${reales.length} archivos reales de SPSS y ${escritos.length} bases escritas por el escritor propio, leídos por ReadStat`);
