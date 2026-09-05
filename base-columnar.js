/**
 * BaseColumnar — almacén de datos por COLUMNAS con arreglos tipados (B4).
 *
 * Antes cada participante era un objeto con claves de texto (≈68 B por
 * celda: con n = 100 000 y 54 columnas, +365 MB de memoria y la pestaña
 * congelada varios segundos). Aquí cada columna es un arreglo tipado
 * contiguo: 4 B por celda si la columna es de enteros (ítems Likert,
 * sociodemográficos discretos, IDs, marcadores) y 8 B si lleva decimales
 * (totales, continuos, percentiles). Los valores perdidos son NaN, nativo en
 * ambos tipos, así que no hace falta un mapa de bits ni un centinela.
 *
 * Responsabilidades (y solo estas):
 *   · declarar columnas en orden y guardar/leer celdas;
 *   · ofrecer una vista FILA A FILA (fila(i), aObjetos()) para el código que
 *     sigue pensando en objetos: vista previa, Analizador, gráficos;
 *   · serializarse para viajar entre el Web Worker y la interfaz sin copiar
 *     (los ArrayBuffer se TRANSFIEREN, no se clonan).
 *
 * Sin dependencias. Funciona en la página y dentro de un Web Worker.
 */
class BaseColumnar {
    constructor(n) {
        if (!(Number.isInteger(n) && n >= 0)) throw new Error('BaseColumnar: n debe ser un entero no negativo');
        this.n = n;
        this.columnas = [];          // [{ nombre, datos, entera }] en orden de creación
        this._indice = new Map();    // nombre → columna
        this._objetos = null;        // caché de aObjetos() completo
    }

    /** Número de filas (mismo contrato que `datos.length` en la versión por objetos). */
    get length() { return this.n; }

    /**
     * Declara una columna nueva al final. `entera = true` reserva 4 B por celda
     * (Float32: exacto hasta 16 777 216, sobra para códigos, ítems y
     * conteos); si no, 8 B (Float64) para valores con decimales.
     */
    agregar(nombre, entera = false) {
        if (this._indice.has(nombre)) throw new Error(`BaseColumnar: la columna «${nombre}» ya existe`);
        const columna = { nombre, entera: !!entera, datos: entera ? new Float32Array(this.n) : new Float64Array(this.n) };
        this.columnas.push(columna);
        this._indice.set(nombre, columna);
        this._objetos = null;
        return columna;
    }

    /** Columna por nombre (objeto {nombre, datos, entera}) o undefined. */
    columna(nombre) { return this._indice.get(nombre); }

    tiene(nombre) { return this._indice.has(nombre); }

    /** Nombres de las columnas en orden (equivale a Object.keys(fila)). */
    nombres() { return this.columnas.map(c => c.nombre); }

    /** Celda (NaN si es un valor perdido; undefined si la columna no existe). */
    valor(nombre, i) {
        const c = this._indice.get(nombre);
        return c ? c.datos[i] : undefined;
    }

    fijar(nombre, i, v) {
        const c = this._indice.get(nombre);
        if (!c) throw new Error(`BaseColumnar: no existe la columna «${nombre}»`);
        c.datos[i] = v;
        this._objetos = null;
    }

    /**
     * Valores FINITOS de una columna (sin perdidos), como Float64Array. Es lo
     * que necesitan medias, DE, correlaciones y percentiles.
     */
    finitos(nombre) {
        const c = this._indice.get(nombre);
        if (!c) return new Float64Array(0);
        const salida = new Float64Array(this.n);
        let k = 0;
        for (let i = 0; i < this.n; i++) { const v = c.datos[i]; if (v === v) salida[k++] = v; }   // v === v descarta NaN
        return salida.subarray(0, k);
    }

    /** Fila i como objeto {columna: valor}, en el orden de las columnas. */
    fila(i) {
        const salida = {};
        for (let c = 0; c < this.columnas.length; c++) salida[this.columnas[c].nombre] = this.columnas[c].datos[i];
        return salida;
    }

    /**
     * Vista por objetos [ {col: valor}, ... ] de las filas [desde, hasta).
     * Cuesta lo que costaba la versión anterior (≈68 B por celda), así que se
     * usa solo donde hace falta (vista previa: pocas filas; Analizador: una vez)
     * y el resultado completo se guarda en caché.
     */
    aObjetos(desde = 0, hasta = this.n) {
        const completo = desde === 0 && hasta === this.n;
        if (completo && this._objetos) return this._objetos;
        const filas = new Array(Math.max(0, hasta - desde));
        for (let i = desde; i < hasta; i++) filas[i - desde] = this.fila(i);
        if (completo) this._objetos = filas;
        return filas;
    }

    /**
     * Construye una base a partir de filas-objeto (compatibilidad con código
     * que todavía produce objetos, p. ej. el autotest). Las columnas salen de
     * las claves de la primera fila; todo se guarda con decimales (Float64).
     */
    static desdeObjetos(filas) {
        const n = filas ? filas.length : 0;
        const base = new BaseColumnar(n);
        if (!n) return base;
        Object.keys(filas[0]).forEach(nombre => {
            const col = base.agregar(nombre, false);
            for (let i = 0; i < n; i++) {
                const v = filas[i][nombre];
                col.datos[i] = (typeof v === 'number') ? v : NaN;
            }
        });
        return base;
    }

    /**
     * Forma transportable por postMessage. Los ArrayBuffer devueltos en
     * `transferibles` deben pasarse como lista de transferencia: el emisor
     * pierde el acceso y el receptor los recibe sin copia.
     */
    serializar() {
        return {
            n: this.n,
            columnas: this.columnas.map(c => ({ nombre: c.nombre, entera: c.entera, buffer: c.datos.buffer })),
            transferibles: this.columnas.map(c => c.datos.buffer)
        };
    }

    static desdeSerializado(serial) {
        const base = new BaseColumnar(serial.n);
        (serial.columnas || []).forEach(c => {
            const columna = { nombre: c.nombre, entera: !!c.entera, datos: c.entera ? new Float32Array(c.buffer) : new Float64Array(c.buffer) };
            base.columnas.push(columna);
            base._indice.set(c.nombre, columna);
        });
        return base;
    }

    /** Bytes ocupados por los datos (para diagnóstico). */
    bytes() { return this.columnas.reduce((s, c) => s + c.datos.byteLength, 0); }
}

if (typeof window !== 'undefined') window.BaseColumnar = BaseColumnar;
