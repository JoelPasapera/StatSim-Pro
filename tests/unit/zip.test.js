// tests/unit/zip.test.js — (2026.12.31) el núcleo ZIP propio (core/data/zip/): el CRC-32 contra una implementación bit a
// bit (y contra el de zlib, si el Node lo trae), el descompresor DEFLATE contra lo que comprime zlib con todos sus niveles y
// estrategias (bloques almacenados, fijos y dinámicos, ventanas cortas, datos aleatorios y repetitivos), sus errores ante
// datos dañados (siempre un mensaje, nunca un cuelgue ni una reserva desmedida), y el lector y el escritor de ZIP: ida y
// vuelta, nombres UTF-8, entradas almacenadas y comprimidas, por trozos, y los límites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { crc32 } from '../../src/core/data/zip/crc32.js';
import { inflarDeflate } from '../../src/core/data/zip/inflate.js';
import { esZip, extraerZip, listarZip } from '../../src/core/data/zip/lector.js';
import { escribirZip, unirTrozos } from '../../src/core/data/zip/escritor.js';

/** CRC-32 (IEEE 802.3) bit a bit: la referencia, independiente de las tablas de crc32.js. */
function crcBitABit(bytes) {
    let c = 0xFFFFFFFF;
    for (const b of bytes) {
        c ^= b;
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Azar reproducible (Park–Miller). */
function azar(semilla) {
    let s = semilla;
    return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

/** Datos de prueba: vacíos, de un byte, aleatorios, repetitivos y con forma de XML de una hoja. */
function muestras() {
    const u = azar(7);
    const lista = [new Uint8Array(0), new TextEncoder().encode('a')];
    for (const n of [10, 100, 1000, 70000, 200000]) {
        lista.push(Uint8Array.from({ length: n }, () => Math.floor(u() * 256)));
        lista.push(Uint8Array.from({ length: n }, () => 97 + Math.floor(u() * u() * 6)));
        lista.push(new TextEncoder().encode(Array.from({ length: Math.ceil(n / 25) }, (_, i) => `<c r="A${i}"><v>${i * 3}</v></c>`).join('')).slice(0, n));
    }
    return lista;
}

test('CRC-32: el valor de comprobación, por partes y como el bit a bit (y el de zlib)', () => {
    assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926, 'el valor de comprobación de CRC-32/ISO-HDLC');
    assert.equal(crc32(new Uint8Array(0)), 0);
    for (const d of muestras()) {
        const esperado = crcBitABit(d);
        assert.equal(crc32(d), esperado, `${d.length} bytes`);
        const corte = Math.floor(d.length / 3);
        assert.equal(crc32(d.subarray(corte), crc32(d.subarray(0, corte))), esperado, `${d.length} bytes, en dos partes`);
        if (typeof zlib.crc32 === 'function') assert.equal(crc32(d), zlib.crc32(d) >>> 0);
    }
    // desalineado: empieza en un desplazamiento impar de su ArrayBuffer
    const grande = muestras()[5];
    assert.equal(crc32(grande.subarray(3)), crcBitABit(grande.subarray(3)));
});

test('DEFLATE: descomprime lo que comprime zlib, con todos los niveles y estrategias', () => {
    const opciones = [{ level: 0 }, { level: 1 }, { level: 6 }, { level: 9 }, { strategy: zlib.constants.Z_FIXED }, { strategy: zlib.constants.Z_HUFFMAN_ONLY },
        { strategy: zlib.constants.Z_RLE }, { level: 9, memLevel: 1, windowBits: 9 }];
    let casos = 0;
    for (const d of muestras()) {
        for (const o of opciones) {
            const c = zlib.deflateRawSync(d, o);
            for (const tamano of [d.length, undefined]) {
                const r = inflarDeflate(c, tamano);
                assert.equal(r.length, d.length, `${d.length} bytes con ${JSON.stringify(o)}`);
                assert.ok(Buffer.from(r).equals(Buffer.from(d)), `${d.length} bytes con ${JSON.stringify(o)}: el contenido`);
                casos++;
            }
        }
    }
    assert.equal(casos, 17 * 8 * 2);
    // un flujo con varios bloques (zlib los parte al vaciar a mitad)
    const z = zlib.createDeflateRaw();
    const trozos = [];
    z.on('data', t => trozos.push(t));
    const parte = new TextEncoder().encode('<row r="1"><c r="A1"><v>1</v></c></row>'.repeat(500));
    z.write(parte); z.flush(zlib.constants.Z_FULL_FLUSH, () => {});
    z.write(parte); z.end();
    return new Promise(resolve => z.on('end', () => {
        const r = inflarDeflate(Buffer.concat(trozos));
        assert.equal(r.length, parte.length * 2);
        resolve();
    }));
});

test('DEFLATE: los datos dañados dan un error con mensaje (y nada de memoria desmedida)', () => {
    const d = muestras()[7];
    const c = zlib.deflateRawSync(d);
    const malos = [c.subarray(0, c.length - 5), new Uint8Array([0xff, 0xff, 0xff]), new Uint8Array([7]), new Uint8Array([0x06]), new Uint8Array([0x01, 0x05, 0x00, 0x00, 0x00])];
    for (const m of malos) assert.throws(() => inflarDeflate(m), /^Error: DEFLATE: /);
    // más largo de lo declarado: se detiene en lo que declara el archivo
    assert.throws(() => inflarDeflate(c, d.length - 1), /DEFLATE: los datos descomprimidos son más largos de lo que declara el archivo/);
    assert.throws(() => inflarDeflate(c, d.length + 1), /DEFLATE: se esperaban/);
    // una «bomba»: un tamaño declarado pequeño no se rebasa
    const bomba = zlib.deflateRawSync(new Uint8Array(10_000_000));
    assert.throws(() => inflarDeflate(bomba, 1000), /más largos de lo que declara/);
    // (2026.12.31, revisión) un flujo cortado (aquí, un bloque dinámico, en cada punto): se rechaza al acabarse sus bytes,
    // sin seguir produciendo con ceros inventados hasta el tamaño declarado (antes llenaba los 16 MiB declarados) ni crecer
    // sin fin cuando no se declara ninguno
    const dinamico = zlib.deflateRawSync(new TextEncoder().encode('b'.repeat(3000) + 'abcabcabc'.repeat(50)), { level: 9 });
    assert.equal((dinamico[0] >> 1) & 3, 2, 'un bloque dinámico');
    for (let corte = 1; corte < dinamico.length; corte++) {
        for (const tamano of [1 << 24, undefined]) {
            const t0 = Date.now();
            assert.throws(() => inflarDeflate(dinamico.subarray(0, corte), tamano), /^Error: DEFLATE: /, `cortado en ${corte}`);
            assert.ok(Date.now() - t0 < 300, `cortado en ${corte}: ${Date.now() - t0} ms`);
        }
    }
    assert.throws(() => inflarDeflate(dinamico.subarray(0, 18), 1 << 24), /^Error: DEFLATE: el flujo comprimido está cortado$/);
});

test('ZIP: ida y vuelta, con y sin compresión, por trozos, con nombres UTF-8 y una entrada vacía', async () => {
    async function* hoja() { for (let i = 0; i < 5000; i++) yield `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`; }
    for (const comprimir of [true, false]) {
        const partes = await escribirZip([
            { nombre: '[Content_Types].xml', contenido: '<Types/>' },
            { nombre: 'xl/worksheets/sheet1.xml', contenido: hoja() },
            { nombre: 'datos/año ñandú.bin', contenido: new Uint8Array([1, 2, 3]) },
            { nombre: 'vacía.txt', contenido: '' },
            { nombre: 'sin_comprimir.txt', contenido: 'abc'.repeat(100), comprimir: false }
        ], { comprimir, fecha: new Date(2026, 9, 20, 10, 30, 0) });
        const zip = unirTrozos(partes);
        assert.ok(esZip(zip));
        const entradas = listarZip(zip);
        assert.deepEqual(entradas.map(e => e.nombre), ['[Content_Types].xml', 'xl/worksheets/sheet1.xml', 'datos/año ñandú.bin', 'vacía.txt', 'sin_comprimir.txt']);
        assert.equal(entradas[4].metodo, 0, 'la entrada que pide no comprimirse');
        if (!comprimir) assert.ok(entradas.every(e => e.metodo === 0));
        for (const nativo of [true, false]) {
            const xml = new TextDecoder().decode(await extraerZip(zip, entradas[1], { nativo }));
            assert.equal((xml.match(/<row /g) || []).length, 5000);
            assert.deepEqual([...await extraerZip(zip, entradas[2], { nativo })], [1, 2, 3]);
            assert.equal((await extraerZip(zip, entradas[3], { nativo })).length, 0);
        }
        // la fecha de MS-DOS de las cabeceras: 2026-10-20 10:30:00
        const v = new DataView(zip.buffer, zip.byteOffset);
        const dia = v.getUint16(12, true), hora = v.getUint16(10, true);
        assert.deepEqual([(dia >> 9) + 1980, (dia >> 5) & 15, dia & 31, hora >> 11, (hora >> 5) & 63], [2026, 10, 20, 10, 30]);
    }
});

test('ZIP: los archivos dañados o que no son ZIP dan un error claro', async () => {
    const zip = unirTrozos(await escribirZip([{ nombre: 'a.txt', contenido: 'hola '.repeat(200) }], { comprimir: false }));
    assert.throws(() => listarZip(new Uint8Array(100)), /^Error: ZIP: le falta el directorio central del ZIP$/);
    assert.throws(() => listarZip(zip.subarray(0, zip.length - 10)), /le falta el directorio central/);
    assert.equal(esZip(new TextEncoder().encode('ID;Edad\n')), false);
    const e = listarZip(zip)[0];
    const danado = zip.slice();
    danado[e.cabeceraLocal + 30 + 5 + 20] ^= 1;
    await assert.rejects(extraerZip(danado, e), /^Error: ZIP: el CRC-32 de la entrada «a\.txt» no coincide$/);
    const cifrado = zip.slice();
    cifrado[e.cabeceraLocal + 6] |= 1;
    await assert.rejects(extraerZip(cifrado, { ...e, banderas: e.banderas | 1 }), /está cifrada/);
    await assert.rejects(extraerZip(zip, { ...e, metodo: 12 }), /método de compresión que no se admite \(12\)/);
    await assert.rejects(extraerZip(zip.subarray(0, 60), e), /está cortada/);
    // comprimida y dañada: con los dos descompresores, un mensaje (no el del navegador, en inglés)
    const comprimido = unirTrozos(await escribirZip([{ nombre: 'b.txt', contenido: 'datos '.repeat(5000) }]));
    const eb = listarZip(comprimido)[0];
    const roto = comprimido.slice();
    for (let k = 0; k < 40; k++) roto[eb.cabeceraLocal + 30 + 5 + 3 + k] ^= 0x5A;
    for (const nativo of [true, false]) await assert.rejects(extraerZip(roto, eb, { nativo }), /^Error: ZIP: (la entrada «b\.txt» no se puede descomprimir|el CRC-32 de la entrada «b\.txt» no coincide|la entrada «b\.txt» no tiene el tamaño que declara)/);
});

test('ZIP: lo que declara una entrada no puede ser imposible, y dos entradas no comparten sus datos', async () => {
    // (2026.12.31, revisión) 600 MB declarados para unos pocos bytes comprimidos: imposible con DEFLATE (unas 1032 veces lo
    // comprimido, como mucho), y se dice sin reservar los 600 MB
    const zip = unirTrozos(await escribirZip([{ nombre: 'a.txt', contenido: 'hola '.repeat(2000) }]));
    const e = listarZip(zip)[0];
    assert.equal(e.metodo, 8);
    for (const nativo of [true, false]) {
        await assert.rejects(extraerZip(zip, { ...e, tamano: 600 * 1024 * 1024 }, { nativo }), /^Error: ZIP: la entrada «a\.txt» no tiene el tamaño que declara$/);
        await assert.rejects(extraerZip(zip, { ...e, tamano: e.comprimido * 1032 + 1025 }, { nativo }), /no tiene el tamaño que declara/);
        assert.equal((await extraerZip(zip, e, { nativo })).length, 10000);
    }
    // dos entradas del directorio central con la misma cabecera local: la forma de las «bombas» que repiten un bloque
    const dos = unirTrozos(await escribirZip([{ nombre: 'x.xml', contenido: '<x/>'.repeat(100) }, { nombre: 'y.xml', contenido: '<y/>'.repeat(100) }]));
    const [ex, ey] = listarZip(dos);
    const v = new DataView(dos.buffer, dos.byteOffset, dos.byteLength);
    let central = -1;
    for (let i = dos.length - 22; i >= 0; i--) if (v.getUint32(i, true) === 0x02014b50 && dos[i + 46] === 'y'.charCodeAt(0)) { central = i; break; }
    assert.ok(central > 0);
    const solapado = dos.slice();
    new DataView(solapado.buffer).setUint32(central + 42, ex.cabeceraLocal, true);
    assert.throws(() => listarZip(solapado), /^Error: ZIP: dos entradas comparten sus datos \(el archivo está dañado o manipulado\)$/);
    // y una que empieza dentro de los datos de la anterior
    const dentro = dos.slice();
    new DataView(dentro.buffer).setUint32(central + 42, ex.cabeceraLocal + 31, true);
    assert.throws(() => listarZip(dentro), /comparten sus datos/);
    assert.ok(ey.cabeceraLocal >= ex.cabeceraLocal + 30 + ex.comprimido, 'las entradas de verdad no se solapan');
});
