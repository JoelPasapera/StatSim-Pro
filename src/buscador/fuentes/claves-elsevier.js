// @ts-check
// buscador/fuentes/claves-elsevier.js — las claves de la API de Elsevier del proyecto y su reparto por turno.
// (2026.12.27) Las claves vivían dentro de fuentes/scopus.js; ScienceDirect usa las mismas, así que la lista está aquí, una
// sola vez. Claves hardcodeadas por decisión explícita del propietario (son suyas).
// Elsevier lleva la cuota de cada clave POR API («Quota limits are unique to each API, there is not a single global setting
// for a given APIKey», dev.elsevier.com/api_key_settings.html): que una clave agote Scopus Search no dice nada de
// ScienceDirect Search. Por eso cada fuente reparte la misma lista con su propio turno y sus propias pausas
// (RotacionClaves); Scopus conserva el reparto que ya tenía (ScopusDirecto._siguienteKey).

/** Las claves de la API de Elsevier del proyecto (Scopus, ScienceDirect, revistas y resúmenes). @type {readonly string[]} */
export const CLAVES_ELSEVIER = Object.freeze([
    'd54be3207354b928a6e2ce355101c81f',
    '147d71e438d2d472bea28abbe4aa9c4e',
    '359dd3266f644bf44e1b6610d7c6664c',
    '16ccbb33ab907de19c7064a0d479451f',
    '1c4210c2199d31dc7d7560702729d51d',
    '92d98589eeb9940076461f3a1857661a',
    'ce978a4f4d8c9f38507a7720ddbb3998',
    '81e47fc17a598deb0880e72af71709d5'
]);

/** @typedef {'auth' | 'cuota' | 'limite'} MotivoPausa */

// Cuánto descansa una clave frenada (429 sin más datos) según los frenazos seguidos que lleva: el ritmo (dos por segundo
// por clave, que comparten todos los usuarios del sitio) se recupera en segundos; una cuota agotada que el navegador no
// deja ver, no. Un frenazo vale la pausa pedida; el segundo seguido, 20 veces esa pausa; el tercero y los demás, 120 veces
// (con 30 s: 30 s, 10 min y 1 h). Una respuesta correcta con la clave pone la cuenta a cero. Los 429 de una misma ráfaga
// (peticiones que ya iban en vuelo cuando llegó el primero) cuentan como uno.
const ESCALA_FRENAZOS = [1, 20, 120];

/**
 * Reparte las peticiones entre unas claves, por turno, saltando las que están en pausa: una clave que Elsevier rechazó
 * (401/403) queda fuera el resto de la sesión; una que agotó su cuota, hasta que se renueva; una a la que Elsevier frenó
 * (429 sin más datos), un rato que crece si la vuelve a frenar sin una respuesta correcta entre medias. Cada sesión empieza
 * el turno en una clave al azar: así los usuarios del sitio no estrenan todos la misma.
 */
export class RotacionClaves {
    /**
     * @param {readonly string[]} claves
     * @param {{ reloj?: () => number, inicio?: number }} [opciones] la hora en ms y la clave del primer turno (para las
     *   pruebas; por omisión, la hora del sistema y una clave al azar)
     */
    constructor(claves, { reloj = () => Date.now(), inicio = Math.floor(Math.random() * Math.max(1, claves.length)) } = {}) {
        this._claves = claves;
        this._reloj = reloj;
        this._inicio = claves.length ? ((Math.floor(inicio) % claves.length) + claves.length) % claves.length : 0;
        this._indice = this._inicio;
        /** @type {Map<string, { hasta: number, motivo: MotivoPausa }>} */
        this._pausas = new Map();
        /** @type {Map<string, number>} */
        this._frenazos = new Map();   // clave → cuántos 429 sin más datos seguidos lleva (sin una respuesta correcta entre medias)
        /** @type {Map<string, number>} */
        this._ultimoFrenazo = new Map();   // clave → cuándo llegó su último 429 sin más datos (en el reloj de la rotación)
    }

    /** La hora del reloj de la rotación (ms): la que se apunta al enviar una petición, para frenar(). */
    ahora() { return this._reloj(); }

    /** Cuántas claves hay. */
    get total() { return this._claves.length; }

    /** ¿Está la clave en pausa ahora? (una pausa vencida se olvida) @param {string} clave */
    enPausa(clave) {
        const p = this._pausas.get(clave);
        if (!p) return false;
        if (p.hasta > this._reloj()) return true;
        this._pausas.delete(clave);
        return false;
    }

    /** La siguiente clave libre por turno, o '' si todas están en pausa. */
    siguiente() {
        const n = this._claves.length;
        for (let i = 0; i < n; i++) {
            const k = this._claves[(this._indice + i) % n];
            if (!this.enPausa(k)) { this._indice = (this._indice + i + 1) % n; return k; }
        }
        return '';
    }

    /**
     * Pone una clave en pausa durante ms (Infinity: el resto de la sesión). Si ya tenía una pausa más larga, se queda la
     * más larga.
     * @param {string} clave
     * @param {number} ms
     * @param {MotivoPausa} motivo
     */
    pausar(clave, ms, motivo) {
        const hasta = this._reloj() + Math.max(0, ms), previa = this._pausas.get(clave);
        if (!previa || previa.hasta <= hasta) this._pausas.set(clave, { hasta, motivo });
    }

    /**
     * Una clave frenada (429) sin saber si fue el ritmo o la cuota de la semana (el navegador no dejó ver las cabeceras de
     * Elsevier): descansa ms la primera vez y más si los frenazos siguen sin una respuesta correcta entre medias
     * (ESCALA_FRENAZOS). Nunca se da por agotada su cuota: eso solo lo dice Elsevier. El 429 de una petición que salió antes
     * del último frenazo de la clave (iba en vuelo cuando llegó) es de la misma ráfaga: no cuenta como otro frenazo, aunque
     * la clave descansa igual, desde ahora. Devuelve la pausa aplicada.
     * @param {string} clave
     * @param {number} ms
     * @param {number} [enviada] cuándo salió la petición frenada, en el reloj de la rotación (ahora()); sin ella, cuenta
     * @returns {number}
     */
    frenar(clave, ms, enviada = Infinity) {
        const ultimo = this._ultimoFrenazo.get(clave);
        const mismaRafaga = ultimo !== undefined && enviada <= ultimo;
        const veces = mismaRafaga ? Math.max(1, this._frenazos.get(clave) || 0) : (this._frenazos.get(clave) || 0) + 1;
        this._frenazos.set(clave, veces);
        this._ultimoFrenazo.set(clave, this._reloj());
        const pausa = ms * ESCALA_FRENAZOS[Math.min(veces, ESCALA_FRENAZOS.length) - 1];
        this.pausar(clave, pausa, 'limite');
        return pausa;
    }

    /** La clave respondió bien: sus frenazos ya no cuentan. @param {string} clave */
    exito(clave) { this._frenazos.delete(clave); }

    /** Cuántas claves están libres ahora. */
    libres() { return this._claves.filter(k => !this.enPausa(k)).length; }

    /** Cuánto falta (ms) para que quede libre alguna clave: 0 si ya hay una; Infinity si todas lo están para la sesión. */
    esperaMinima() {
        let minima = Infinity;
        for (const k of this._claves) {
            if (!this.enPausa(k)) return 0;
            const p = this._pausas.get(k);
            if (p) minima = Math.min(minima, p.hasta - this._reloj());
        }
        return minima;
    }

    /** Cuántas claves hay en pausa por cada motivo (para explicar por qué no queda ninguna). */
    motivos() {
        /** @type {Record<MotivoPausa, number>} */
        const cuenta = { auth: 0, cuota: 0, limite: 0 };
        for (const k of this._claves) { if (this.enPausa(k)) { const p = this._pausas.get(k); if (p) cuenta[p.motivo]++; } }
        return cuenta;
    }

    /** Quita todas las pausas (y los frenazos contados) y vuelve a empezar el turno donde empezó. */
    reiniciar() { this._pausas.clear(); this._frenazos.clear(); this._ultimoFrenazo.clear(); this._indice = this._inicio; }
}
