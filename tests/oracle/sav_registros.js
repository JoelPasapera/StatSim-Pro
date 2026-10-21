// @ts-check
// tests/oracle/sav_registros.js — (revisión de la 2026.12.29) partir un .sav little endian en sus registros del diccionario
// y volver a unirlos, para fabricar en las pruebas lo que el escritor propio no escribe (el 7.22 de PSPP antiguo, una
// página de código sin registro 7.20…). Solo para las pruebas.

/**
 * @typedef {{ tipo: number, subtipo?: number, tam?: number, cuenta?: number, datos?: Uint8Array, bytes: Uint8Array }} Registro
 * @param {Uint8Array} b
 * @returns {{ cabecera: Uint8Array, registros: Registro[], datos: Uint8Array }}
 */
export function partir(b) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    /** @type {Registro[]} */
    const registros = [];
    let p = 176;
    for (;;) {
        const inicio = p, tipo = v.getInt32(p, true);
        if (tipo === 2) {
            const conEtiqueta = v.getInt32(p + 8, true), nPerdidos = v.getInt32(p + 12, true);
            p += 32;
            if (conEtiqueta) { const l = v.getInt32(p, true); p += 4 + Math.ceil(l / 4) * 4; }
            p += Math.abs(nPerdidos) * 8;
        } else if (tipo === 3) {
            const n = v.getInt32(p + 4, true); p += 8;
            for (let i = 0; i < n; i++) { const l = /** @type {number} */ (b[p + 8]); p += 8 + Math.ceil((l + 1) / 8) * 8; }
            const nv = v.getInt32(p + 4, true); p += 8 + 4 * nv;
        } else if (tipo === 6) {
            p += 8 + 80 * v.getInt32(p + 4, true);
        } else if (tipo === 7) {
            const subtipo = v.getInt32(p + 4, true), tam = v.getInt32(p + 8, true), cuenta = v.getInt32(p + 12, true);
            p += 16 + tam * cuenta;
            registros.push({ tipo, subtipo, tam, cuenta, datos: b.slice(inicio + 16, p), bytes: b.slice(inicio, p) });
            continue;
        } else if (tipo === 999) {
            p += 8;
            registros.push({ tipo, bytes: b.slice(inicio, p) });
            break;
        } else throw new Error(`registro desconocido ${tipo} en ${p}`);
        registros.push({ tipo, bytes: b.slice(inicio, p) });
    }
    return { cabecera: b.slice(0, 176), registros, datos: b.slice(p) };
}

/** Un registro 7.x con estos datos (de bytes sueltos). @param {number} subtipo @param {Uint8Array} datos @returns {Registro} */
export function extension(subtipo, datos) {
    const bytes = new Uint8Array(16 + datos.length), v = new DataView(bytes.buffer);
    v.setInt32(0, 7, true); v.setInt32(4, subtipo, true); v.setInt32(8, 1, true); v.setInt32(12, datos.length, true);
    bytes.set(datos, 16);
    return { tipo: 7, subtipo, tam: 1, cuenta: datos.length, datos, bytes };
}

/** @param {{ cabecera: Uint8Array, registros: Registro[], datos: Uint8Array }} partes */
export function unir({ cabecera, registros, datos }) {
    const out = new Uint8Array(cabecera.length + registros.reduce((s, r) => s + r.bytes.length, 0) + datos.length);
    let p = 0;
    out.set(cabecera, p); p += cabecera.length;
    for (const r of registros) { out.set(r.bytes, p); p += r.bytes.length; }
    out.set(datos, p);
    return out;
}
