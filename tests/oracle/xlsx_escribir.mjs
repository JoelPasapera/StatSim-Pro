// tests/oracle/xlsx_escribir.mjs — (2026.12.31) escribe con core/data/xlsx/escritor.js los libros de xlsx_casos.js en la
// carpeta dada, para que xlsx_oraculo.py los lea con openpyxl. Imprime, en JSON, cada caso con su archivo, sus avisos y el
// SHA-256 del contenido de cada parte del libro (sin docProps/core.xml, que lleva la fecha de creación en UTC y cambia con
// la zona horaria de quien lo ejecuta).
//
// Uso: node xlsx_escribir.mjs /carpeta/de/salida     (lo llama xlsx_oraculo.py)
import fs from 'node:fs';
import path from 'node:path';
import { unirTrozos } from '../../src/core/data/zip/escritor.js';
import { casosEscritor, huellasDePartes } from './xlsx_casos.js';

const carpeta = process.argv[2];
if (!carpeta || !fs.existsSync(carpeta)) {
    console.error('Uso: node xlsx_escribir.mjs /carpeta/de/salida');
    process.exit(2);
}

const salida = [];
for (const caso of casosEscritor()) {
    const { trozos, avisos } = await caso.escribir();
    const bytes = unirTrozos(trozos);
    const archivo = `${caso.nombre}.xlsx`;
    fs.writeFileSync(path.join(carpeta, archivo), bytes);
    salida.push({ caso: caso.nombre, archivo, determinista: caso.determinista, bytes: bytes.length, avisos, partes: await huellasDePartes(bytes) });
}
console.log(JSON.stringify(salida));
