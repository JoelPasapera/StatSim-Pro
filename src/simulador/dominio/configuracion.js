// simulador/dominio/configuracion.js — lectura de la interfaz, gramáticas, nombres y siglas, expansión de ondas e informantes, dicotómicas.
// Métodos de GeneradorDatos: se componen en generador.js (Object.assign sobre el prototipo).

import { BaseColumnar } from '../../core/data/base-columnar.js';
import { esFormaCompuesta, nombreEnFrase } from './formas-relacion.js';
import { esNubeCompuesta, nubePorId } from './nubes-relacion.js';
import { parametrosCensura, formaCensurada } from './censura.js';
import { TAMANO_MUESTRAL_MAXIMO, ESTILOS_RESPUESTA, PERFILES_HETEROGENEIDAD } from './constantes.js';
import { esTerceraVariable, TIPOS_TERCERA } from './terceras.js';
import { correlacionEntreOndas, propagarExogena } from './paneles.js';

export const metodosConfiguracion = {
    // ========================================
    // RECOLECCIÓN DE CONFIGURACIÓN
    // ========================================
    recolectarConfiguracion() {
        // Tamaño muestral
        const tamano = parseInt(document.getElementById('tamanoMuestra').value);
        if (isNaN(tamano) || tamano < 2) {
            throw new Error('El tamaño muestral debe ser al menos 2');
        }
        // Tope superior para evitar congelar el navegador ante un valor enorme
        // (p. ej. un error tipográfico como 1000000).
        if (tamano > TAMANO_MUESTRAL_MAXIMO) {
            throw new Error(`El tamaño muestral máximo permitido es ${TAMANO_MUESTRAL_MAXIMO}`);
        }
        this.configuracion.tamanoMuestra = tamano;

        // Semilla opcional para reproducibilidad
        const semillaTexto = document.getElementById('semilla').value.trim();
        this.configuracion.semilla = semillaTexto === '' ? null : parseInt(semillaTexto, 10);

        // Percentiles opcionales (columnas PC_)
        const chkPC = document.getElementById('generarPercentiles');
        this.configuracion.generarPercentiles = !!(chkPC && chkPC.checked);
        const chkCE = document.getElementById('correlacionesExactas');
        // Por defecto ACTIVADO: si el usuario pide r = 0.40, la muestra entrega 0.40.
        this.configuracion.correlacionesExactas = chkCE ? !!chkCE.checked : true;
        const selIF = document.getElementById('indiceFiabilidad');
        this.configuracion.indiceFiabilidad = selIF ? selIF.value : 'alfa';
        // (B5) Heterogeneidad de los ítems; sin el selector en la página, ítems paralelos como antes
        const selHet = document.getElementById('heterogeneidadItems');
        this.configuracion.heterogeneidadItems = (selHet && PERFILES_HETEROGENEIDAD[selHet.value]) ? selHet.value : 'ninguna';
        // Imperfecciones realistas (opcionales; 0 = base perfecta, como hasta ahora)
        const leerPct = (id, tope) => { const el = document.getElementById(id); const v = el ? parseFloat(el.value) : 0; return isFinite(v) ? Math.max(0, Math.min(tope, v)) : 0; };
        this.configuracion.realismo = {
            pctPerdidos: leerPct('pctPerdidos', 30),
            mecanismoPerdidos: ((document.getElementById('mecanismoPerdidos') || {}).value) || 'MCAR',
            // (B9) MAR con referencia elegible y sentido; MNAR según el propio total
            referenciaMAR: ((document.getElementById('referenciaMAR') || {}).value) || '',
            sentidoMAR: ((document.getElementById('sentidoMAR') || {}).value) === 'altos' ? 'altos' : 'bajos',
            pctDescuidados: leerPct('pctDescuidados', 20),
            tipoDescuidado: ((document.getElementById('tipoDescuidado') || {}).value) || 'mixto',
            marcarDescuidados: !!((document.getElementById('marcarDescuidados') || {}).checked),
            pctDigitacion: leerPct('pctDigitacion', 10),
            // (B8) estilos de respuesta, tiempo de respuesta e ítems de control
            pctAquiescencia: leerPct('pctAquiescencia', 40),
            pctExtrema: leerPct('pctExtrema', 40),
            intensidadEstilos: (ESTILOS_RESPUESTA[((document.getElementById('intensidadEstilos') || {}).value)] ? document.getElementById('intensidadEstilos').value : 'moderada'),
            tiempoMinutos: (() => { const el = document.getElementById('tiempoMinutos'); const v = el ? parseFloat(el.value) : 0; return isFinite(v) && v > 0 ? Math.min(600, v) : 0; })(),
            itemsControl: (() => { const el = document.getElementById('itemsControl'); const v = el ? parseInt(el.value, 10) : 0; return isFinite(v) ? Math.max(0, Math.min(3, v)) : 0; })()
        };

        // Pruebas aplicadas (cada fila es una ESCALA; se agrupan por prueba)
        this.configuracion.variablesPorTest = this.recolectarTests();
        this.configuracion.pruebas = this.recolectarPruebas();
        if (this.configuracion.pruebas.length === 0) {
            throw new Error('Debe agregar al menos una escala');
        }
        this.configuracion.gruposPruebas = this.agruparPruebas(this.configuracion.pruebas);

        // Datos sociodemográficos
        this.configuracion.sociodemograficos = this.recolectarSociodemograficos();
        if (this.configuracion.sociodemograficos.length === 0) {
            throw new Error('Debe agregar al menos un dato sociodemográfico');
        }

        // Correlaciones objetivo (opcionales)
        this.configuracion.correlaciones = this.recolectarCorrelaciones();

        // Diferencias por grupo (opcionales)
        this.configuracion.diferenciasGrupo = this.recolectarDiferenciasGrupo();
        this.configuracion.seleccion = this.recolectarSeleccion();   // (Atlas, dimensión B3) selección por rango
        // (B6) Modelos estructurales: mediación y moderación desde coeficientes
        this.configuracion.modelos = this.recolectarModelos().concat(this._formasTablaIII || []);   // (Atlas) relaciones con forma de la tabla III
        this.configuracion.atipicos = this._atipicosTablaIII || [];   // (Atlas, dimensión B4) atípicos influyentes de la tabla III
        // (B7) Medidas repetidas: ondas T2… con estabilidad y d de cambio
        this.configuracion.medidasRepetidas = this.recolectarMedidasRepetidas();
        // (Atlas, fase D) relación entre personas y dentro de la persona
        this.configuracion.niveles = this.recolectarNiveles();
        // (Atlas, fase E1) relación en el tiempo (panel cruzado)
        this.configuracion.paneles = this.recolectarPaneles();
        // (Atlas, fase E2) estados con histéresis
        this.configuracion.histeresis = this.recolectarHisteresis();
        // (C1) Estructura factorial por test (la interfaz la guarda como JSON)
        this.configuracion.estructuras = this.recolectarEstructuras();
        // (C2) Desenlaces no continuos y (C3) puntos de corte clínicos
        this.configuracion.desenlaces = this.recolectarDesenlaces();
        this.configuracion.cortes = this.recolectarCortes();
        // (C7) Concordancia: informantes, jueces categóricos (κ) y jueces continuos (CCI)
        this.configuracion.concordancias = this.recolectarConcordancias();

        return this.configuracion;
    },

    // (B6) Tabla de modelos estructurales: selects [tipo, X, mediador/moderador, Y]
    // e inputs [c1, c2, c3]. Mediación: c1 = a (X→M), c2 = b (M→Y), c3 = c′ (X→Y
    // directo). Moderación: c1 = β₁ (X), c2 = β₂ (W), c3 = β₃ (X×W). Todos
    // estandarizados.
    recolectarModelos() {
        const modelos = [];
        const filas = document.querySelectorAll('#bodyModelos .fila-modelo');
        filas.forEach(fila => {
            const selects = fila.querySelectorAll('select');
            const inputs = fila.querySelectorAll('input');
            if (selects.length < 4 || inputs.length < 3) return;
            const tipo = ['moderacion', 'curvilinea'].includes(selects[0].value) || esTerceraVariable(selects[0].value) ? selects[0].value : 'mediacion';
            const x = selects[1].value, y = selects[3].value;
            // (C6) curvilínea: solo X e Y; β₁ (lineal) y β₂ (cuadrática)
            const m = tipo === 'curvilinea' ? x : selects[2].value;
            const c1 = parseFloat(inputs[0].value), c2 = parseFloat(inputs[1].value), c3 = tipo === 'curvilinea' ? 0 : parseFloat(inputs[2].value);
            if (!x || !m || !y) return;
            if ([c1, c2, c3].some(c => isNaN(c))) {
                throw new Error(`Modelo ${esTerceraVariable(tipo) ? `de ${TIPOS_TERCERA[tipo].etiqueta.toLowerCase()}` : tipo === 'moderacion' ? 'de moderación' : (tipo === 'curvilinea' ? 'curvilíneo' : 'de mediación')} (${x} · ${y}): faltan coeficientes`);
            }
            modelos.push({ tipo, x, m, y, c1, c2, c3 });
        });
        return modelos;
    },

    // (C2) Tabla de desenlaces: inputs [nombre, parámetro, efecto1, efecto2, efecto3],
    // selects [tipo, predictor1, predictor2, predictor3]. Parámetro: prevalencia
    // (binario, 0–1 o %), media (conteo) o categorías con proporciones (ordinal,
    // gramática de la tabla II: «Bajo:30, Medio:50, Alto:20»). Efecto = OR (binario y
    // ordinal) o IRR (conteo) por cada DE del predictor.
    recolectarDesenlaces() {
        const salida = [];
        document.querySelectorAll('#bodyDesenlaces .fila-desenlace').forEach(fila => {
            const inputs = fila.querySelectorAll('input'), selects = fila.querySelectorAll('select');
            if (inputs.length < 5 || selects.length < 4) return;
            const nombre = inputs[0].value.trim();
            if (!nombre) return;
            const tipo = ['binario', 'conteo', 'ordinal'].includes(selects[0].value) ? selects[0].value : 'binario';
            const parametro = inputs[1].value.trim();
            const predictores = [];
            for (let j = 0; j < 3; j++) {
                const variable = selects[j + 1].value.trim();
                const efecto = parseFloat(inputs[j + 2].value);
                if (variable && isFinite(efecto) && efecto > 0) predictores.push({ variable, efecto });
            }
            salida.push(this._normalizarDesenlace({ nombre, tipo, parametro, predictores }));
        });
        return salida;
    },

    _normalizarDesenlace(d) {
        const out = { nombre: d.nombre, tipo: d.tipo, predictores: d.predictores || [], prevalencia: null, media: null, niveles: null, etiquetas: null };
        const t = String(d.parametro || '').trim();
        if (d.tipo === 'binario') {
            // «0.25», «25%», o «No, Sí: 25%» (etiquetas para 0 y 1)
            const m = /^(?:(.+?)\s*,\s*(.+?)\s*:\s*)?([0-9]+(?:[.,][0-9]+)?)\s*(%?)\s*$/.exec(t);
            if (!m) throw new Error(`Desenlace «${d.nombre}»: indica la prevalencia (p. ej. 0.25 o 25 %; con etiquetas «No, Sí: 25 %»)`);
            let p = parseFloat(m[3].replace(',', '.'));
            if (m[4] === '%' || p > 1) p = p / 100;
            out.prevalencia = p;
            if (m[1] && m[2]) out.etiquetas = [m[1].trim(), m[2].trim()];
        } else if (d.tipo === 'conteo') {
            const v = parseFloat(t.replace(',', '.'));
            if (!isFinite(v)) throw new Error(`Desenlace «${d.nombre}»: indica la media del conteo (p. ej. 2.5)`);
            out.media = v;
        } else {
            const op = this._parsearOpcionesSocio(t, 'categorica', d.nombre);
            if (!op.niveles) throw new Error(`Desenlace «${d.nombre}»: indica las categorías ordenadas con sus proporciones (p. ej. «Bajo:30, Medio:50, Alto:20»)`);
            out.niveles = op.niveles;
        }
        return out;
    },

    // (C7) Tabla de concordancia: selects [tipo, variable], inputs [etiqueta/n jueces, concordancia, sesgo]
    recolectarConcordancias() {
        const salida = [];
        document.querySelectorAll('#bodyConcordancia .fila-concordancia').forEach(fila => {
            const selects = fila.querySelectorAll('select'), inputs = fila.querySelectorAll('input');
            if (selects.length < 2 || inputs.length < 3) return;
            const tipo = ['informante', 'jueces', 'juecesContinuo'].includes(selects[0].value) ? selects[0].value : 'informante';
            const variable = selects[1].value.trim();
            if (!variable) return;
            const concordancia = parseFloat(inputs[1].value);
            if (isNaN(concordancia)) throw new Error(`Concordancia de «${variable}»: falta el valor de acuerdo (r, κ o CCI)`);
            if (tipo === 'informante') {
                const etiqueta = inputs[0].value.trim() || 'informante 2';
                const sesgo = parseFloat(inputs[2].value);
                salida.push({ tipo, variable, etiqueta, r: concordancia, sesgo: isNaN(sesgo) ? 0 : sesgo });
            } else {
                const jueces = parseInt(inputs[0].value, 10);
                salida.push({ tipo, variable, jueces: isNaN(jueces) ? 2 : jueces, kappa: tipo === 'jueces' ? concordancia : null, icc: tipo === 'juecesContinuo' ? concordancia : null });
            }
        });
        return salida;
    },

    _slugSufijo(texto) {
        return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 12) || 'inf2';
    },

    // (C3) Tabla de puntos de corte: select [variable], input [texto]. Gramática:
    // «Bajo, Medio, Alto @ 20, 30» (cortes fijos: < 20 Bajo; 20–29.99 Medio; ≥ 30 Alto)
    // o «Bajo, Medio, Alto @ P25, P75» (cortes por percentiles de la muestra).
    recolectarCortes() {
        const salida = [];
        document.querySelectorAll('#bodyCortes .fila-corte').forEach(fila => {
            const sel = fila.querySelector('select'), inp = fila.querySelector('input');
            const variable = sel ? sel.value.trim() : '';
            if (!variable || !inp) return;
            salida.push(this._parsearCortes(variable, inp.value));
        });
        return salida;
    },

    _parsearCortes(variable, texto) {
        const t = String(texto || '').trim();
        const partes = t.split('@');
        if (partes.length !== 2) throw new Error(`Puntos de corte de «${variable}»: escribe las categorías y los cortes separados por «@» (p. ej. «Bajo, Medio, Alto @ 20, 30»)`);
        const etiquetas = partes[0].split(',').map(s => s.trim()).filter(Boolean);
        const cortesTxt = partes[1].split(',').map(s => s.trim()).filter(Boolean);
        if (etiquetas.length < 2 || etiquetas.length > 10) throw new Error(`Puntos de corte de «${variable}»: entre 2 y 10 categorías`);
        if (cortesTxt.length !== etiquetas.length - 1) throw new Error(`Puntos de corte de «${variable}»: ${etiquetas.length} categorías necesitan ${etiquetas.length - 1} cortes (hay ${cortesTxt.length})`);
        const porPercentil = cortesTxt.every(c => /^p\s*[0-9]/i.test(c));
        const cortes = cortesTxt.map(c => parseFloat(c.replace(/^p\s*/i, '').replace(',', '.')));
        if (cortes.some(c => !isFinite(c))) throw new Error(`Puntos de corte de «${variable}»: cortes no numéricos`);
        for (let i = 1; i < cortes.length; i++) if (!(cortes[i] > cortes[i - 1])) throw new Error(`Puntos de corte de «${variable}»: los cortes deben ir en orden creciente`);
        if (porPercentil && cortes.some(c => c <= 0 || c >= 100)) throw new Error(`Puntos de corte de «${variable}»: los percentiles deben estar entre 1 y 99`);
        return { variable, etiquetas, cortes, porPercentil };
    },

    // (C1) La tarjeta VII guarda las estructuras en #estructurasJSON:
    // [{ prueba, modo: 'cargas'|'alfa', factores: [nombres de dimensión],
    //    cargas: { <dimensión>: [[λ por factor] por ítem] }, metodo: {carga, sobre}|null, desajuste }]
    recolectarEstructuras() {
        const el = document.getElementById('estructurasJSON');
        if (!el) return [];
        try {
            const lista = JSON.parse(el.value || '[]');
            return Array.isArray(lista) ? lista.filter(e => e && e.prueba && e.cargas && typeof e.cargas === 'object') : [];
        } catch (e) {
            throw new Error('Estructura factorial: el contenido guardado no es válido (' + e.message + ')');
        }
    },

    // (B7) Tabla de medidas repetidas: selects [variable, agrupación] e inputs
    // [ondas, estabilidad, cambio, cambioGrupo].
    // (Atlas, fase E2) nombres de las columnas de un estado con histéresis, una por onda (fuente única: el flujo, el registro de
    // nombres, el diccionario y la reconstrucción desde objetos)
    _columnasDeEstado(h, cfg = this.configuracion) {
        const mr = (cfg.medidasRepetidas || []).find(m => m.variable === h.x), K = mr ? Math.max(2, Math.min(4, Math.round(mr.ondas || 2))) : 1, s = this._siglaDeVariable(h.x);
        return Array.from({ length: K }, (_, k) => (k === 0 ? `Estado_${s}` : `Estado_${s}_T${k + 1}`));
    },

    // (Atlas, fase E2) estados con histéresis: [escala, nombre, etiquetas baja/alta, umbrales de entrada y salida (percentiles), nitidez (%)]
    recolectarHisteresis() {
        const salida = [];
        document.querySelectorAll('#bodyHisteresis .fila-histeresis').forEach(fila => {
            const campo = et => fila.querySelector(`[aria-label="${et}"]`), x = campo('Escala con histéresis').value;
            if (!x) return;
            const pEntrada = parseFloat(campo('Umbral de entrada (percentil)').value), pSalida = parseFloat(campo('Umbral de salida (percentil)').value), ruido = campo('Nitidez (% fuera de la regla)').value;
            if (isNaN(pEntrada) || isNaN(pSalida)) throw new Error(`Estado con histéresis de ${x}: faltan los umbrales de entrada y de salida`);
            salida.push({ x, nombre: campo('Nombre del estado').value.trim() || `Estado de ${x}`, etiquetas: [campo('Etiqueta del estado bajo').value.trim() || 'No', campo('Etiqueta del estado alto').value.trim() || 'Sí'], pEntrada, pSalida, ruido: ruido === '' ? 5 : parseFloat(ruido) });
        });
        return salida;
    },

    // (Atlas, fase E1) relación en el tiempo: [tipo, escala X, escala Y, r en la misma onda, efecto X → Y, efecto Y → X]
    recolectarPaneles() {
        const salida = [];
        document.querySelectorAll('#bodyPaneles .fila-panel').forEach(fila => {
            const campo = et => fila.querySelector(`[aria-label="${et}"]`), x = campo('Escala X (tiempo)').value, y = campo('Escala Y (tiempo)').value;
            if (!x && !y) return;
            const tipo = campo('Tipo de relación en el tiempo').value === 'reciproca' ? 'reciproca' : 'rezagada';
            const r = parseFloat(campo('r en la misma onda').value), cXY = parseFloat(campo('Efecto X → Y').value), cYXv = parseFloat(campo('Efecto Y → X').value);
            if (isNaN(r) || isNaN(cXY) || (tipo === 'reciproca' && isNaN(cYXv))) throw new Error(`Relación en el tiempo ${x || '?'} ↔ ${y || '?'}: faltan la r en la misma onda o los efectos cruzados`);
            salida.push({ tipo, x, y, r, cXY, cYX: tipo === 'reciproca' ? cYXv : 0 });
        });
        return salida;
    },

    // (Atlas, fase D) relación entre niveles: [escala X, escala Y, r entre personas, r dentro de la persona]
    recolectarNiveles() {
        const salida = [];
        document.querySelectorAll('#bodyNiveles .fila-nivel').forEach(fila => {
            const campo = et => fila.querySelector(`[aria-label="${et}"]`), x = campo('Escala X (niveles)').value, y = campo('Escala Y (niveles)').value;
            if (!x && !y) return;
            const rEntre = parseFloat(campo('r entre personas').value), rDentro = parseFloat(campo('r dentro de la persona').value);
            if (isNaN(rEntre) || isNaN(rDentro)) throw new Error(`Relación entre niveles ${x || '?'} ↔ ${y || '?'}: faltan las dos correlaciones (entre personas y dentro de la persona)`);
            salida.push({ x, y, rEntre, rDentro });
        });
        return salida;
    },

    recolectarMedidasRepetidas() {
        const salida = [];
        const filas = document.querySelectorAll('#bodyRepetidas .fila-repetida');
        filas.forEach(fila => {
            const selects = fila.querySelectorAll('select');
            const inputs = fila.querySelectorAll('input');
            if (selects.length < 2 || inputs.length < 4) return;
            const variable = selects[0].value, agrupacion = selects[1].value;
            if (!variable) return;
            const ondas = parseInt(inputs[0].value, 10), estabilidad = parseFloat(inputs[1].value), cambio = parseFloat(inputs[2].value), cambioGrupo = parseFloat(inputs[3].value);
            if (isNaN(estabilidad)) throw new Error(`Medida repetida «${variable}»: falta la estabilidad test-retest (r entre ondas)`);
            // (C4) modelo de crecimiento: pendientes individuales aleatorias
            const selModelo = fila.querySelector('[aria-label="Modelo longitudinal"]');
            const modelo = selModelo && ['crecimiento', 'intercepto'].includes(selModelo.value) ? selModelo.value : 'ar1';
            const dePend = fila.querySelector('[aria-label="DE de las pendientes"]'), rIP = fila.querySelector('[aria-label="Correlación intercepto-pendiente"]');
            const dePendientes = dePend ? parseFloat(dePend.value) : NaN, rInterceptoPendiente = rIP ? parseFloat(rIP.value) : NaN;
            salida.push({ variable, ondas: isNaN(ondas) ? 2 : ondas, estabilidad, cambio: isNaN(cambio) ? 0 : cambio, agrupacion: agrupacion || '', cambioGrupo: isNaN(cambioGrupo) ? null : cambioGrupo,
                modelo, dePendientes: isNaN(dePendientes) ? 0 : dePendientes, rInterceptoPendiente: isNaN(rInterceptoPendiente) ? 0 : rInterceptoPendiente });
        });
        return salida;
    },

    recolectarDiferenciasGrupo() {
        const diferencias = [];
        const filas = document.querySelectorAll('#bodyDiferencias .fila-diferencia');

        filas.forEach(fila => {
            const selects = fila.querySelectorAll('select');
            const inputD = fila.querySelector('input');
            if (selects.length < 2 || !inputD) return;
            // (C4) filas nuevas: [tipo, cuantitativa, agrupación A, agrupación B]; filas antiguas: [cuantitativa, agrupación]
            const selTipo = fila.querySelector('[aria-label="Tipo de efecto"]');
            const selCuant = fila.querySelector('[aria-label="Variable cuantitativa"]') || selects[0];
            const selAgrup = fila.querySelector('[aria-label="Variable de agrupación"]') || selects[1];
            const selAgrup2 = fila.querySelector('[aria-label="Segunda agrupación"]');
            const tipo = selTipo && ['interaccion', 'icc'].includes(selTipo.value) ? selTipo.value : 'd';
            const cuantitativa = selCuant.value;
            const agrupacion = selAgrup.value;
            const agrupacion2 = tipo === 'interaccion' && selAgrup2 ? selAgrup2.value : '';
            const d = parseFloat(inputD.value);

            if (cuantitativa && agrupacion && cuantitativa !== agrupacion && !isNaN(d)) {
                const fila2 = { cuantitativa: cuantitativa, agrupacion: agrupacion, d: d, tipo };
                if (tipo === 'interaccion') fila2.agrupacion2 = agrupacion2;
                diferencias.push(fila2);
            }
        });

        return diferencias;
    },

    // Lee las correlaciones objetivo de la tabla (pares de variables + r).
    recolectarCorrelaciones() {
        const correlaciones = [];
        this._formasTablaIII = [];   // (Atlas, dimensión A) filas con forma no lineal: van a los modelos compuestos
        this._atipicosTablaIII = [];   // (Atlas, dimensión B4) filas «Lineal» o «Plana» con atípicos influyentes
        const filas = document.querySelectorAll('#bodyCorrelaciones .fila-correlacion');

        filas.forEach(fila => {
            const selects = fila.querySelectorAll('select');
            const inputR = fila.querySelector('input');
            if (selects.length < 2 || !inputR) return;

            const a = selects[0].value;
            const b = selects[1].value;
            const selTipo = fila.querySelector('[aria-label="Tipo de relación"]'), tipo = selTipo ? selTipo.value : 'lineal';
            const selNube = fila.querySelector('[aria-label="Nube"]'), nube = selNube ? selNube.value : 'homogenea';
            if (a && b && a !== b && esFormaCompuesta(tipo)) {
                if (nube === 'atipico') throw new Error(`Atípico influyente entre "${a}" y "${b}": se genera sobre una relación «Lineal» o «Plana».`);
                const eta = parseFloat(inputR.value);
                if (!(eta > 0 && eta <= 0.97)) throw new Error(`Relación ${nombreEnFrase(tipo)} entre "${a}" y "${b}": la fuerza η debe estar entre 0 y 0.97`);
                // la nube solo se anota si no es homogénea: los modelos sin nube quedan exactamente como antes
                this._formasTablaIII.push({ tipo: 'forma', forma: tipo, x: a, y: b, eta, ...(esNubeCompuesta(nube) ? { nube } : {}) });
                return;
            }
            const r = tipo === 'nula' ? 0 : parseFloat(inputR.value);
            // (Atlas, dimensión B) una fila «Lineal» o «Plana» con una nube no homogénea se compone como una recta interna
            if (a && b && a !== b && esNubeCompuesta(nube)) {
                if (!(Number.isFinite(r) && Math.abs(r) <= 0.97)) throw new Error(`Nube «${nubePorId(nube).etiqueta.toLowerCase()}» entre "${a}" y "${b}": r debe estar entre -0.97 y 0.97`);
                this._formasTablaIII.push({ tipo: 'forma', forma: r < 0 ? 'recta-dec' : 'recta', x: a, y: b, eta: Math.abs(r), nube, desdeLineal: true });
                return;
            }

            if (a && b && a !== b && !isNaN(r)) {
                if (r <= -1 || r >= 1) {
                    throw new Error(`Correlación entre "${a}" y "${b}": r debe estar entre -1 y 1`);
                }
                correlaciones.push({ a: a, b: b, r: r });
                // (Atlas, dimensión B4) la r de la fila es la de la MAYORÍA; la de la base completa, «r con los atípicos»
                if (nube === 'atipico') {
                    const rCon = parseFloat((fila.querySelector('[aria-label="r con los atípicos"]') || {}).value), casos = parseInt((fila.querySelector('[aria-label="Casos atípicos"]') || {}).value, 10);
                    this._atipicosTablaIII.push({ x: a, y: b, rMayoria: r, rCon, casos });
                }
            }
        });

        return correlaciones;
    },

    // Cuadro superior: qué tests existen y qué variable psicológica mide cada uno.
    recolectarTests() {
        const mapa = {};
        document.querySelectorAll('#bodyTests .fila-test').forEach(fila => {
            const nombre = (fila.querySelector('[aria-label="Nombre del test"]') || {}).value || '';
            const variable = (fila.querySelector('[aria-label="Variable psicológica"]') || {}).value || '';
            const rIn = parseFloat((fila.querySelector('[aria-label="Correlación entre dimensiones"]') || {}).value);
            if (nombre.trim()) mapa[nombre.trim()] = { variable: variable.trim(), rIntra: isFinite(rIn) ? Math.max(-0.99, Math.min(0.99, rIn)) : 0.40 };
        });
        return mapa;
    },

    recolectarPruebas() {
        const pruebas = [];
        const nombresCortosUsados = new Set();
        const filas = document.querySelectorAll('#bodyPruebas .fila-prueba');

        filas.forEach((fila, index) => {
            const inputs = fila.querySelectorAll('input');
            const selPrueba = fila.querySelector('[aria-label="Nombre de la prueba"]');
            const selectDist = fila.querySelector('[aria-label="Distribución"]');
            // Cada fila es SIEMPRE una dimensión: el puntaje general del test se
            // calcula solo (promedio de sus dimensiones), no se configura a mano.
            const tipo = 'dimension';
            const esGeneral = false;
            const distribucion = selectDist ? selectDist.value : 'normal';
            const prueba = selPrueba ? selPrueba.value.trim() : '';   // test elegido en el cuadro superior
            const nombre = inputs[0].value.trim();      // nombre de la ESCALA (cada fila = una escala)
            const numItems = parseInt(inputs[1].value);
            const media = parseFloat(inputs[2].value);
            const desviacion = parseFloat(inputs[3].value);
            const minimo = parseFloat(inputs[4].value);
            const maximo = parseFloat(inputs[5].value);
            const alfa = inputs[6] ? parseFloat(inputs[6].value) : NaN;
            const invertidosRaw = inputs[7] ? parseInt(inputs[7].value, 10) : 0;
            const invertidos = Number.isFinite(invertidosRaw) ? Math.max(0, invertidosRaw) : 0;
            // (C5) dificultades de los ítems dicotómicos (proporción de aciertos por ítem)
            const inpDif = fila.querySelector('[aria-label="Dificultades de los ítems"]');
            const dificultades = inpDif ? this._parsearDificultades(inpDif.value, nombre) : null;

            if (nombre && !isNaN(numItems) && !isNaN(media) && !isNaN(desviacion)) {
                if (numItems < 1) {
                    throw new Error(`Escala "${nombre}": El número de ítems debe ser al menos 1`);
                }
                if (desviacion <= 0) {
                    throw new Error(`Escala "${nombre}": La desviación estándar debe ser mayor a 0`);
                }
                if (esGeneral && (isNaN(minimo) || isNaN(maximo))) {
                    throw new Error(`Escala general "${nombre}": debes indicar el Mínimo y el Máximo de la escala`);
                }

                // Validar rango si se especifica
                if (!isNaN(minimo) && !isNaN(maximo)) {
                    if (minimo >= maximo) {
                        throw new Error(`Escala "${nombre}": El mínimo debe ser menor que el máximo`);
                    }
                }

                // Validar alfa objetivo si se especifica
                if (!isNaN(alfa) && (alfa < 0 || alfa >= 1)) {
                    throw new Error(`Escala "${nombre}": El α objetivo debe estar entre 0 y 1`);
                }

                pruebas.push({
                    invertidos: Math.min(invertidos, Math.max(0, numItems - 1)),   // últimos ítems de la escala, puntuados al revés
                    prueba: prueba || null,             // agrupa escalas bajo el mismo test
                    tipo: tipo,                         // 'dimension' | 'general'
                    nombre: nombre,
                    nombreCorto: this.generarNombreCortoUnico(nombre, nombresCortosUsados),
                    numItems: numItems,
                    distribucion: distribucion,
                    media: media,
                    desviacion: desviacion,
                    minimo: !isNaN(minimo) ? minimo : null,
                    maximo: !isNaN(maximo) ? maximo : null,
                    dificultades: dificultades,
                    alfa: !isNaN(alfa) ? alfa : 0
                });
            }
        });

        return pruebas;
    },

    recolectarSociodemograficos() {
        const socio = [];
        const nombresCortosUsados = new Set(((this.configuracion && this.configuracion.pruebas) || []).map(p => p.nombreCorto).filter(Boolean));   // (2026.10.08) no repetir siglas de escalas
        const filas = document.querySelectorAll('#bodySocio .fila-socio');

        filas.forEach((fila, index) => {
            const inputs = fila.querySelectorAll('input');
            const selectDist = fila.querySelector('select');
            const distribucion = selectDist ? selectDist.value : 'normal';
            const categoria = inputs[0].value.trim();
            let promedio = parseFloat(inputs[1].value);
            const desviacion = parseFloat(inputs[2].value);
            let minimo = parseFloat(inputs[3].value);
            let maximo = parseFloat(inputs[4].value);
            const decimales = parseInt(inputs[5].value);
            // (B9) opciones: categorías con proporciones/etiquetas/orden, o «fecha» para la edad
            const textoOpciones = inputs[6] ? inputs[6].value : '';
            const opciones = this._parsearOpcionesSocio(textoOpciones, distribucion, categoria);
            const selDepende = fila.querySelector('[aria-label="Depende de"]');
            const dependeDe = selDepende ? selDepende.value.trim() : '';
            const fuerzaRaw = inputs[7] ? parseFloat(inputs[7].value) : NaN;
            const fuerza = isFinite(fuerzaRaw) ? Math.max(0, Math.min(0.95, fuerzaRaw)) : 0.4;
            if (opciones.niveles) {
                if (distribucion === 'binaria') {
                    // el texto manda sobre el promedio si trae proporciones; si no, el promedio reparte
                    if (opciones.conProporciones) promedio = opciones.niveles[1].proporcion;
                    else if (isFinite(promedio) && promedio >= 0 && promedio <= 1) { opciones.niveles[0].proporcion = 1 - promedio; opciones.niveles[1].proporcion = promedio; }
                    if (!isFinite(promedio)) promedio = opciones.niveles[1].proporcion;
                } else { minimo = 1; maximo = opciones.niveles.length; if (!isFinite(promedio)) promedio = 0; }
            }
            if (distribucion === 'categorica' && !opciones.niveles && !isFinite(promedio)) promedio = 0;

            // Distribuciones que no requieren DE (uniforme, conteo, binaria,
            // categórica): basta con la categoría y el promedio/rango.
            const requiereDE = distribucion === 'normal' || distribucion === 'asimetrica';

            if (categoria && !isNaN(promedio) && (!requiereDE || !isNaN(desviacion))) {
                if (requiereDE && desviacion <= 0) {
                    throw new Error(`Categoría "${categoria}": La desviación estándar debe ser mayor a 0`);
                }
                if ((distribucion === 'uniforme' || distribucion === 'categorica') && (isNaN(minimo) || isNaN(maximo))) {
                    throw new Error(`Categoría "${categoria}": las distribuciones uniforme y categórica requieren mínimo y máximo`);
                }
                if (distribucion === 'binaria' && (promedio < 0 || promedio > 1)) {
                    throw new Error(`Categoría "${categoria}": en una variable binaria el promedio es la proporción de unos (entre 0 y 1)`);
                }
                
                // Validar rango si se especifica
                if (!isNaN(minimo) && !isNaN(maximo)) {
                    if (minimo >= maximo) {
                        throw new Error(`Categoría "${categoria}": El mínimo debe ser menor que el máximo`);
                    }
                }
                
                // Validar número de decimales
                let numDecimales = 2; // Por defecto
                if (!isNaN(decimales)) {
                    if (decimales < 0 || decimales > 4) {
                        throw new Error(`Categoría "${categoria}": Los decimales deben estar entre 0 y 4`);
                    }
                    numDecimales = decimales;
                }

                socio.push({
                    categoria: categoria,
                    categoriaCorta: this.generarNombreCortoUnico(categoria, nombresCortosUsados),
                    distribucion: distribucion,
                    promedio: promedio,
                    desviacion: !isNaN(desviacion) ? desviacion : 1,
                    minimo: !isNaN(minimo) ? minimo : null,
                    maximo: !isNaN(maximo) ? maximo : null,
                    decimales: numDecimales,
                    // (B9)
                    niveles: opciones.niveles,
                    ordinal: opciones.ordinal,
                    fechaNacimiento: opciones.fechaNacimiento,
                    dependeDe: dependeDe && dependeDe !== categoria ? dependeDe : '',
                    fuerza: fuerza
                });
            }
        });

        return socio;
    },

    // ============ SOCIODEMOGRÁFICOS CON CONTENIDO (B9) ============
    // Texto de la casilla «Categorías / opciones» de la tabla II:
    //  · binaria / categórica: «Femenino, Masculino» (equiprobables),
    //    «Soltero:60, Casado:30, Divorciado:10» (proporciones en % o fracción),
    //    «Primaria < Secundaria < Superior» (ordinal; también con :proporción).
    //    Códigos: binaria 0 = primera, 1 = segunda; categórica 1…K en ese orden.
    //  · normal / asimétrica / uniforme (una edad): «fecha» o «fecha:AAAA-MM-DD»
    //    añade la columna FechaNac_<sigla> coherente con la edad a esa fecha.
    _parsearOpcionesSocio(texto, distribucion, categoria) {
        const salida = { niveles: null, ordinal: false, fechaNacimiento: null, conProporciones: false };
        const t = String(texto || '').trim();
        if (!t) return salida;
        const nombre = categoria || 'variable';
        if (distribucion === 'binaria' || distribucion === 'categorica') {
            const ordinal = t.includes('<');
            const partes = t.split(ordinal ? '<' : ',').map(s => s.trim()).filter(Boolean);
            const niveles = partes.map(p => {
                const m = /^(.*?)\s*:\s*([0-9]+(?:[.,][0-9]+)?)\s*%?\s*$/.exec(p);
                if (m) return { etiqueta: m[1].trim(), proporcion: parseFloat(m[2].replace(',', '.')) };
                return { etiqueta: p, proporcion: null };
            });
            if (niveles.some(x => !x.etiqueta)) throw new Error(`Variable «${nombre}»: hay una categoría sin nombre en las opciones`);
            const etiquetas = new Set(niveles.map(x => x.etiqueta.toLowerCase()));
            if (etiquetas.size < niveles.length) throw new Error(`Variable «${nombre}»: hay categorías repetidas en las opciones`);
            if (distribucion === 'binaria' && niveles.length !== 2) throw new Error(`Variable «${nombre}»: una binaria necesita exactamente dos categorías (p. ej. «Femenino, Masculino»)`);
            if (distribucion === 'categorica' && (niveles.length < 2 || niveles.length > 20)) throw new Error(`Variable «${nombre}»: una categórica necesita entre 2 y 20 categorías`);
            const conProp = niveles.filter(x => x.proporcion !== null).length;
            if (conProp && conProp !== niveles.length) throw new Error(`Variable «${nombre}»: indica la proporción de todas las categorías o de ninguna`);
            if (conProp) {
                const suma = niveles.reduce((s, x) => s + x.proporcion, 0);
                if (!(suma > 0)) throw new Error(`Variable «${nombre}»: las proporciones deben sumar más de 0`);
                niveles.forEach(x => { x.proporcion = x.proporcion / suma; });   // 60/40, 0.6/0.4 o 3/2: se normalizan
            } else niveles.forEach(x => { x.proporcion = 1 / niveles.length; });
            niveles.forEach((x, k) => { x.codigo = distribucion === 'binaria' ? k : k + 1; });
            return { niveles, ordinal, fechaNacimiento: null, conProporciones: conProp > 0 };
        }
        if (distribucion === 'conteo') throw new Error(`Variable «${nombre}»: un conteo no admite opciones (deja la casilla vacía)`);
        const m = /^fecha(?:\s*:\s*(\d{4}-\d{2}-\d{2}))?$/i.exec(t);
        if (!m) throw new Error(`Variable «${nombre}»: para una variable continua la casilla solo admite «fecha» o «fecha:AAAA-MM-DD» (fecha de nacimiento a partir de la edad)`);
        if (m[1] && !isFinite(BaseColumnar.isoADias(m[1]))) throw new Error(`Variable «${nombre}»: fecha de referencia no válida (${m[1]})`);
        return { niveles: null, ordinal: false, fechaNacimiento: m[1] || 'hoy', conProporciones: false };
    },

    _parsearDificultades(texto, nombre) {
        const t = String(texto || '').trim();
        if (!t) return null;
        const vals = t.split(/[,;\s]+/).filter(Boolean).map(s => { let v = parseFloat(s.replace(',', '.')); if (/%$/.test(s) || v > 1) v = v / 100; return v; });
        if (vals.some(v => !isFinite(v))) throw new Error(`Escala «${nombre}»: dificultades no numéricas (usa proporciones de acierto entre 0.05 y 0.95, separadas por coma)`);
        return vals;
    },

    // Agrupa las escalas por el nombre de su prueba. Cada grupo recibe una sigla
    // única (sin chocar con las siglas de las escalas) que se usa para el puntaje
    // general del test cuando NO hay Escala general configurada:
    // Total_{sigla} = suma de los totales de sus dimensiones.
    // Si la prueba tiene una Escala general (tipo 'general'), esa columna ES el
    // puntaje general y la suma automática no se emite.
    agruparPruebas(escalas) {
        const usados = new Set(escalas.map(e => e.nombreCorto));
        const porNombre = new Map();
        escalas.forEach(e => {
            if (!e.prueba || e.sufijo) return;   // (B7) las ondas T2… no forman dimensiones nuevas
            if (!porNombre.has(e.prueba)) porNombre.set(e.prueba, []);
            porNombre.get(e.prueba).push(e.nombreCorto);
        });
        const grupos = [];
        porNombre.forEach((siglasEscalas, nombrePrueba) => {
            grupos.push({
                nombre: nombrePrueba,
                sigla: this.generarNombreCortoUnico(nombrePrueba, usados),
                escalas: siglasEscalas,
                variable: (((this.configuracion && this.configuracion.variablesPorTest) || {})[nombrePrueba] || {}).variable || '',
                rIntra: (((this.configuracion && this.configuracion.variablesPorTest) || {})[nombrePrueba] || {}).rIntra
            });
        });
        return grupos;
    },

    // ============ SIGLAS (2026.10.06) ============
    // La sigla de una escala nombra sus ítems (sigla + número: PE1, PE2…) y sus columnas (Dimension_, General_,
    // PC_ + sigla); la de un test, su General derivado. Reglas:
    //  · solo letras A–Z, sin dígitos ni guiones bajos, para que «sigla + número de ítem» nunca sea ambiguo
    //    (antes, al chocar, «Interpersonal» quedaba I_2 y su ítem 1 se llamaba I_21, que se lee como el ítem 21
    //    de I y que la detección por prefijos del Analizador mezclaba con los ítems de I);
    //  · las tildes se quitan sin perder la letra («Índice de masa» → IDM; antes se borraba la Í);
    //  · sin choque, la sigla son las iniciales, como siempre; si choca, se alarga la palabra que más distingue:
    //    Intrapersonal → I, Interpersonal → IN; Percepción emocional → PE, Percepción espacial → PES,
    //    Presión escolar → PRE.
    _palabrasSigla(nombre) {
        return String(nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Za-z0-9\s]/g, '')                  // como antes: «EQ-i:YV» es UNA palabra
            .split(/\s+/).map(p => p.replace(/[0-9]/g, '').toUpperCase()).filter(Boolean);
    },

    generarNombreCorto(nombre) {
        return this._palabrasSigla(nombre).map(p => p[0]).join('').substring(0, 10);
    },

    // Candidatas en orden de preferencia: iniciales; después, alargando una sola palabra (las más cortas primero y,
    // a igual largo, la última palabra, que suele ser la que distingue); todas las letras; y, como último recurso,
    // las iniciales seguidas de letras (A, B… Z, AA…). Nunca dígitos.
    *_candidatasSigla(nombre) {
        const P = this._palabrasSigla(nombre);
        const letras = n => { let s = ''; for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s; return s; };
        const vistas = new Set();
        const nueva = c => { c = c.substring(0, 10); if (!c || vistas.has(c)) return null; vistas.add(c); return c; };
        const iniciales = P.map(p => p[0]).join('') || 'V';
        let c = nueva(iniciales); if (c) yield c;
        const alargadas = [];
        P.forEach((p, w) => { for (let k = 2; k <= p.length; k++) alargadas.push({ c: P.map((q, i) => (i === w ? q.substring(0, k) : q[0])).join(''), w }); });
        alargadas.sort((a, b) => a.c.length - b.c.length || b.w - a.w);
        for (const a of alargadas) { c = nueva(a.c); if (c) yield c; }
        c = nueva(P.join('')); if (c) yield c;
        const base = iniciales.substring(0, 7);
        for (let n = 1; ; n++) { c = nueva(base + letras(n)); if (c) yield c; }
    },

    // Devuelve una sigla única respecto a `usados` y la reserva. Dos escalas, sociodemográficas o tests con las
    // mismas iniciales nunca comparten prefijo de columna.
    generarNombreCortoUnico(nombre, usados) {
        for (const c of this._candidatasSigla(nombre)) {
            if (!usados.has(c)) { usados.add(c); return c; }
        }
        return null;   // inalcanzable: las candidatas con letras son infinitas
    },

    // Nombre de columna de una escala según su papel (FUENTE ÚNICA):
    // dimensión → Dimension_<sigla>; variable general → General_<sigla>.
    // Es general la escala de tipo 'general' (bases antiguas) y también la ÚNICA
    // escala de un test unidimensional (p. ej. el Raven): ese test no «carece» de
    // variable general, su escala ES la variable que mide. El prefijo codifica el
    // papel para que una base exportada conserve su estructura.
    columnaDeEscala(escala) {
        const general = escala.tipo === 'general' || this._esUnidimensional(escala);
        return `${general ? 'General' : 'Dimension'}_${this._claveEscala(escala)}`;
    },

    // (2026.10.03) Un test con UNA sola escala (sin contar las ondas T2… ni los
    // informantes, que son clones con sufijo) es unidimensional. Las escalas sin
    // test y los tests con escala general explícita (tipo 'general') no lo son.
    _esUnidimensional(escala) {
        if (!escala || escala.tipo === 'general' || !escala.prueba) return false;
        let n = 0;
        for (const p of ((this.configuracion && this.configuracion.pruebas) || [])) {
            if (p.prueba !== escala.prueba || p.sufijo) continue;
            if (p.tipo === 'general') return false;
            n++;
        }
        return n === 1;
    },

    // (B7) Para una onda T2…, la carga cruzada mira a la MISMA onda de la otra
    // dimensión si existe; si no, a su onda 1. Misma regla en el pase 2, en la
    // α teórica y en la simulación de calibración.
    _siglaOnda(prueba, sigla) {
        if (!prueba.sufijo) return sigla;
        const k = sigla + prueba.sufijo;
        return (this.configuracion.pruebas || []).some(p => this._claveEscala(p) === k) ? k : sigla;
    },

    // (B7) Clave única de una escala: sigla + sufijo de onda («PE», «PE_T2»).
    // Las ondas T2… de una medida repetida son clones de la escala base con
    // `sufijo` y `base`; la onda 1 conserva los nombres de siempre.
    _claveEscala(escala) { return `${escala.nombreCorto}${escala.sufijo || ''}`; },

    _itemsDe(p) { const out = []; const suf = p.sufijo || ''; for (let j = 1; j <= p.numItems; j++) out.push(`${p.nombreCorto}${j}${suf}`); return out; },

    /**
     * Prepara la estructura de correlaciones: la lista de variables
     * correlacionables (totales de escala y sociodemográficas continuas), la
     * matriz de correlaciones objetivo y su factor de Cholesky. Para las
     * escalas se desatenúa la correlación objetivo por la fiabilidad del total
     * (corr(F,Total)), de modo que la correlación OBSERVADA entre totales se
     * acerque a la pedida.
     */
    nombreGeneral(grupo) {
        return grupo.variable ? `${grupo.variable} — ${grupo.nombre}` : `Puntaje general — ${grupo.nombre}`;
    },

    // Lee las diferencias por grupo de la tabla (variable cuantitativa,
    // variable de agrupación y d de Cohen).
    // Nombres de las variables correlacionables (mismos que la tabla III):
    // escalas por nombre, puntajes generales derivados y sociodemográficos continuos.
    _nombresCorrelacionables() {
        const cfg = this.configuracion, nombres = new Set();
        (cfg.pruebas || []).forEach(p => nombres.add(p.nombre));
        (cfg.gruposPruebas || []).forEach(g => { if (g.escalas.length >= 2) nombres.add(this.nombreGeneral(g)); });
        (cfg.sociodemograficos || []).forEach(s => { if (s.distribucion === 'normal' || s.distribucion === 'asimetrica') nombres.add(s.categoria); });
        return nombres;
    },

    _esNombreGeneral(nombre) {
        return (this.configuracion.gruposPruebas || []).some(g => g.escalas.length >= 2 && this.nombreGeneral(g) === nombre);
    },

    // ============ DESENLACES NO CONTINUOS (C2) ============
    // Modelo latente con predictores estandarizados en la muestra:
    //   η_i = Σ_j ln(efecto_j)·z_ij
    //  · binario: Y = 1 si η + ε > c, ε logístico, c = cuantil muestral → prevalencia
    //    EXACTA; la regresión logística recupera ln(OR) = ln(efecto) por DE;
    //  · conteo: Y ~ Poisson(exp(β₀ + η)), β₀ por bisección para la media pedida
    //    (la regresión de Poisson recupera ln(IRR));
    //  · ordinal: u = η + ε, cortes en los cuantiles muestrales de las proporciones
    //    pedidas (odds proporcionales: mismo OR en cada corte).
    _columnaPredictor(base, nombre) {
        const col = this._columnaDeVariable(nombre);
        return col && base.tiene(col) ? base.columna(col).datos : null;
    },

    _columnaDeVariable(nombre) {
        const cfg = this.configuracion;
        const p = (cfg.pruebas || []).find(x => x.nombre === nombre);
        if (p) return this.columnaDeEscala(p);
        const g = (cfg.gruposPruebas || []).find(x => x.escalas.length >= 2 && this.nombreGeneral(x) === nombre);
        if (g) return `General_${g.sigla}`;
        const s = (cfg.sociodemograficos || []).find(x => x.categoria === nombre);
        return s ? s.categoria : null;
    },

    _siglaDeVariable(nombre) {
        const cfg = this.configuracion;
        const p = (cfg.pruebas || []).find(x => x.nombre === nombre);
        if (p) return this._claveEscala(p);
        const g = (cfg.gruposPruebas || []).find(x => x.escalas.length >= 2 && this.nombreGeneral(x) === nombre);
        if (g) return g.sigla;
        const s = (cfg.sociodemograficos || []).find(x => x.categoria === nombre);
        return s ? s.categoriaCorta : nombre.replace(/\s+/g, '_');
    },

    // Columna categórica que juzgan los jueces: el nivel de una escala con corte,
    // un sociodemográfico binario/categórico o un desenlace binario/ordinal
    _columnaCategoricaDe(nombre) {
        const cfg = this.configuracion;
        if ((cfg.cortes || []).some(c => c.variable === nombre)) return `Nivel_${this._siglaDeVariable(nombre)}`;
        const s = (cfg.sociodemograficos || []).find(x => x.categoria === nombre);
        if (s && (s.distribucion === 'binaria' || s.distribucion === 'categorica')) return s.categoria;
        const d = (cfg.desenlaces || []).find(x => x.nombre === nombre);
        if (d && (d.tipo === 'binario' || d.tipo === 'ordinal')) return d.nombre;
        return null;
    },

    // Dos columnas no pueden llamarse igual (antes, con filas-objeto, la segunda
    // sobrescribía a la primera EN SILENCIO). Se avisa con el origen de cada
    // nombre para que el usuario sepa qué renombrar.
    _comprobarNombresDeColumna() {
        const cfg = this.configuracion;
        const origen = new Map([['ID', 'la columna ID']]);
        const registrar = (nombre, descripcion) => {
            if (origen.has(nombre)) {
                throw new Error(`Dos columnas se llamarían «${nombre}»: ${origen.get(nombre)} y ${descripcion}. Cambia uno de los nombres.`);
            }
            origen.set(nombre, descripcion);
        };
        (cfg.sociodemograficos || []).forEach(s => registrar(s.categoria, `la variable sociodemográfica «${s.categoria}»`));
        (cfg.pruebas || []).forEach(p => {
            if (p.tipo !== 'general') this._itemsDe(p).forEach((col, j) => registrar(col, `el ítem ${j + 1} de «${p.nombre}» (sigla ${p.nombreCorto})`));
        });
        (cfg.pruebas || []).forEach(p => registrar(this.columnaDeEscala(p), `el total de «${p.nombre}»`));
        (cfg.desenlaces || []).forEach(d => registrar(d.nombre, `el desenlace «${d.nombre}»`));
        // (fase E2) una columna de estado por onda
        (cfg.histeresis || []).forEach(h => this._columnasDeEstado(h, cfg).forEach(c => registrar(c, `el estado con histéresis de «${h.x}»`)));
        (cfg.concordancias || []).filter(c => c.tipo !== 'informante').forEach(c => { for (let j = 1; j <= (c.jueces || 2); j++) registrar(`Juez${j}_${this._siglaDeVariable(c.variable)}`, `el juez ${j} de «${c.variable}»`); });
        (cfg.gruposPruebas || []).forEach(g => { if (g.escalas.length >= 2) registrar(`General_${g.sigla}`, `el puntaje general del test «${g.nombre}»`); });
    },

    _esSocioDiscreto(socio) {
        const d = socio.distribucion || 'normal';
        return d === 'binaria' || d === 'categorica' || d === 'conteo';
    },

    // Niveles efectivos de una discreta (con o sin texto de opciones)
    _nivelesDe(socio) {
        if (socio.niveles && socio.niveles.length) return socio.niveles;
        if (socio.distribucion === 'binaria') { const p = Math.max(0, Math.min(1, socio.promedio)); return [{ codigo: 0, proporcion: 1 - p }, { codigo: 1, proporcion: p }]; }
        if (socio.distribucion === 'categorica') {
            const K = Math.max(1, Math.floor(socio.maximo - socio.minimo + 1));
            return Array.from({ length: K }, (_, k) => ({ codigo: socio.minimo + k, proporcion: 1 / K }));
        }
        return null;
    },

    _mediaCodigo(agrup) {
        const niveles = this._nivelesDe(agrup);
        if (!niveles) return 0;
        return niveles.reduce((s, x) => s + x.proporcion * x.codigo, 0);
    },

    // Varianza del código de una variable de agrupación: binaria p(1 − p);
    // categórica equiprobable con K niveles (K² − 1)/12. null si no agrupa.
    _varianzaCodigo(agrup) {
        if (!agrup) return null;
        if (agrup.distribucion === 'binaria' || agrup.distribucion === 'categorica') {
            // (B9) con las proporciones de sus niveles (equiprobables si no hay texto)
            const niveles = this._nivelesDe(agrup);
            if (!niveles) return 0;
            const media = niveles.reduce((s, x) => s + x.proporcion * x.codigo, 0);
            return niveles.reduce((s, x) => s + x.proporcion * (x.codigo - media) * (x.codigo - media), 0);
        }
        return null;
    },

    // Código centrado en su MEDIA (binaria: código − p; categórica: código −
    // (mín + máx)/2), para que el desplazamiento tenga media 0 y la Media de la
    // variable en toda la base siga siendo la pedida.
    _codigoCentrado(agrup, codigo) {
        if (!(typeof codigo === 'number' && isFinite(codigo))) return 0;
        if (agrup.distribucion === 'binaria' || agrup.distribucion === 'categorica') return codigo - this._mediaCodigo(agrup);
        return 0;
    },

    // ============ IMPERFECCIONES REALISTAS (opcionales) ============
    // Una base real nunca es perfecta. Estas tres capas se aplican DESPUÉS de
    // generar y los totales se recalculan para que todo siga siendo coherente:
    //  · Valores perdidos por ítem (MCAR: al azar; MAR: más probables en quienes
    //    puntúan bajo en una variable observada). Total con regla del 80 %: si
    //    falta ≤20 % de los ítems se prorratea; si falta más, el total se pierde.
    //  · Respuestas descuidadas: «línea recta» (mismo valor en todos los ítems)
    //    o aleatorias. Su total se recalcula a partir de esos ítems.
    //  · Errores de digitación: un ítem con un valor imposible (fuera de rango),
    //    el atípico más común en bases reales y el primero que hay que limpiar.
    // ÍTEMS INVERTIDOS: los últimos «invertidos» ítems de la escala se guardan
    // reflejados (min+max−valor en Likert; alrededor de la media de ítem si es
    // continua). El total sigue siendo el correcto: quien analice debe RECODIFICAR
    // esos ítems antes de sumar o de calcular fiabilidad, como en una base real.
    _esInvertido(p, idx1) { return (p.invertidos || 0) > 0 && idx1 > p.numItems - (p.invertidos || 0); },

    _reflejar(p, v) {
        if (!(typeof v === 'number' && isFinite(v))) return v;
        const centro2 = (isFinite(p.minimo) && isFinite(p.maximo)) ? (p.minimo + p.maximo) : 2 * (p.media / p.numItems);
        return Math.round((centro2 - v) * 100) / 100;
    },

    _recodificar(p, idx1, v) { return this._esInvertido(p, idx1) ? this._reflejar(p, v) : v; },

    // ============ ESCALAS DICOTÓMICAS (C5) ============
    // Ítems de dos valores (0/1: acierto/error, sí/no, presente/ausente). Contrato:
    //  · la Media del total es Σ p_i (p_i = dificultad = proporción de unos del ítem);
    //    si se dan las dificultades, la Media se deriva de ellas;
    //  · la DE NO es libre: con KR-20 = α y dificultades p_i,
    //        Var(T) = Σ p_i(1 − p_i) / (1 − α·(k − 1)/k)
    //    así que se deriva y sustituye a la de la tabla I (la validación lo dice);
    //  · las medias de ítem son las dificultades; α es el KR-20 (mismo cálculo);
    //  · sin dificultades, se reparten alrededor de M/k con la heterogeneidad elegida.
    _esDicotomica(p) {
        return !!p && p.minimo !== null && p.maximo !== null && isFinite(p.minimo) && isFinite(p.maximo) && (p.maximo - p.minimo) === 1 && p.numItems >= 2 && p.tipo !== 'general';
    },

    // Dificultades efectivas (dadas o repartidas alrededor de M/k) y DE implícita
    _dicotomicaImplicita(p, heterogeneidad) {
        const k = p.numItems, min = p.minimo;
        let pi;
        if (Array.isArray(p.dificultades) && p.dificultades.length === k) pi = p.dificultades.map(v => Math.max(0.02, Math.min(0.98, v)));
        else {
            const media = Math.max(0.02, Math.min(0.98, (p.media - k * min) / k));   // proporción media de unos
            const disp = { ninguna: 0, leve: 0.10, moderada: 0.20, alta: 0.30 }[heterogeneidad || 'leve'] || 0.10;
            const espacio = Math.min(media - 0.05, 0.95 - media, disp);
            pi = Array.from({ length: k }, (_, i) => Math.max(0.02, Math.min(0.98, media + (k > 1 ? (2 * i / (k - 1) - 1) : 0) * espacio)));
        }
        const sumaPQ = pi.reduce((s, v) => s + v * (1 - v), 0);
        const alfa = (p.alfa > 0 && p.alfa < 1) ? p.alfa : 0.7;
        const varT = sumaPQ / Math.max(0.02, 1 - alfa * (k - 1) / k);
        return { dificultades: pi, media: pi.reduce((s, v) => s + v, 0) + k * min, desviacion: Math.sqrt(varT), sumaPQ };
    },

    // Media y DE derivadas para todas las dicotómicas (idempotente), más la FORMA
    // del total: una suma de aciertos vive en [0, k] sin picos en los topes, así
    // que el total se muestrea de una beta-binomial con esa media y esa varianza
    // (cuantil de Φ(z), estandarizado): con una normal recortada la varianza se
    // perdía en las colas (KR-20 0.80 salía 0.77) y aparecían picos en 0 y k.
    _ajustarDicotomicas(cfg) {
        (cfg.pruebas || []).forEach(p => {
            if (!this._esDicotomica(p) || p.sufijo) return;
            const imp = this._dicotomicaImplicita(p, cfg.heterogeneidadItems);
            p.dificultadesEfectivas = imp.dificultades;
            if (Array.isArray(p.dificultades) && p.dificultades.length === p.numItems) p.media = imp.media;
            p.desviacionPedida = p.desviacion;
            p.desviacion = imp.desviacion;
            p.formaTotal = this._formaBetaBinomial(p.numItems, p.media - p.numItems * p.minimo, imp.desviacion);
            p.formaTotal.minimo = p.minimo;
        });
    },

    // (Atlas, dimensión B3) selección de la muestra por rango: null si no se eligió variable; la proporción, en tanto por uno
    recolectarSeleccion() {
        const v = document.getElementById('seleccionVariable'), l = document.getElementById('seleccionLado'), p = document.getElementById('seleccionProporcion');
        if (!v || !v.value) return null;
        return { variable: v.value, lado: l && l.value === 'inferior' ? 'inferior' : 'superior', proporcion: (parseFloat(p && p.value) || 0) / 100 };
    },

    // (Atlas, dimensión B2) techo o suelo de una escala: parámetros de su censura, calculados a demanda (también en el hilo
    // principal, adonde no llegan las funciones creadas en el Worker); null si no los tiene
    _censuraDe(p) {
        if (!p || (p.distribucion !== 'techo' && p.distribucion !== 'suelo') || p.minimo === null || p.maximo === null || this._esDicotomica(p)) return null;
        return parametrosCensura(p.distribucion, p.media, p.desviacion, p.numItems * p.minimo, p.numItems * p.maximo);
    },
    // Instala la forma censurada como forma propia del total («formaTotal»: se aplica siempre al final, también si la escala es
    // el criterio de un modelo). Va DESPUÉS de expandir las ondas: la expansión rehace «formaTotal» como beta-binomial, y así
    // cada onda tiene su propia latente (con su media desplazada, su propia proporción en el límite)
    _ajustarCensuradas(cfg) {
        (cfg.pruebas || []).forEach(p => { const par = this._censuraDe(p); if (par) { p.censura = par; p.formaTotal = formaCensurada(par); } });
    },

    // Cuantil estandarizado de una beta-binomial(k, α, β) con media m·k y varianza v
    _formaBetaBinomial(k, mediaSuma, de) {
        const m = Math.max(0.01, Math.min(0.99, mediaSuma / k)), v = de * de;
        const r = v / (k * m * (1 - m));   // sobredispersión respecto a la binomial
        let pmf;
        const lchoose = j => this._lgamma(k + 1) - this._lgamma(j + 1) - this._lgamma(k - j + 1);
        if (r <= 1.02) {
            pmf = Array.from({ length: k + 1 }, (_, j) => Math.exp(lchoose(j) + j * Math.log(m) + (k - j) * Math.log(1 - m)));
        } else {
            const s = Math.max(0.2, (k - Math.min(r, k - 0.05)) / (Math.min(r, k - 0.05) - 1)), al = m * s, be = (1 - m) * s;
            const lB = this._lgamma(al) + this._lgamma(be) - this._lgamma(s);
            pmf = Array.from({ length: k + 1 }, (_, j) => Math.exp(lchoose(j) + this._lgamma(j + al) + this._lgamma(k - j + be) - this._lgamma(k + s) - lB));
        }
        const total = pmf.reduce((a, b) => a + b, 0);
        const cdf = []; let acum = 0; pmf.forEach(p => { acum += p / total; cdf.push(acum); });
        let mu = 0, va = 0; pmf.forEach((p, j) => { mu += j * p / total; }); pmf.forEach((p, j) => { va += (j - mu) ** 2 * p / total; });
        const sd = Math.sqrt(va) || 1;
        const forma = z => {
            const u = this.normalCDF(z);
            let j = 0; while (j < k && cdf[j] < u) j++;
            return (j - mu) / sd;
        };
        forma.sigma = de; forma.k = k;   // DE de la forma y número de ítems (formas por grupo en _totalObjetivo)
        return forma;
    },

    // Dificultades de un clon (onda o informante) de una dicotómica: las de la base
    // desplazadas por la diferencia de medias repartida entre los ítems
    _desplazarDificultades(clon, base) {
        if (!Array.isArray(base.dificultadesEfectivas) || !base.numItems) return;
        const delta = (clon.media - base.media) / base.numItems;
        clon.dificultadesEfectivas = base.dificultadesEfectivas.map(v => Math.max(0.02, Math.min(0.98, v + delta)));
    },

    // ============ MEDIDAS REPETIDAS (B7) ============
    // Ondas T2…TK de una escala. Contrato:
    //  · la onda 1 es la escala tal cual (mismos nombres de columna);
    //  · la onda k es un CLON (mismos ítems, α, forma, perfil de ítems) con
    //    sufijo «_Tk» en ítems, total y percentil, y media
    //    M + σ·[(1 − p₁)·c₀ + p₁·c₁]·(k − 1)/(K − 1), con c₀ la d de cambio
    //    (global o del grupo 0) y c₁ la del grupo 1 (p₁ = proporción de unos);
    //  · (fase D) interceptos aleatorios: r(Tj, Tk) = estabilidad; las variables que no se repiten, iguales en todas las ondas;
    //  · estabilidad AR(1): r(Tj, Tk) = estabilidad^|j − k|, exacta en modo exacto;
    //  · las correlaciones de la base con otras variables (tabla III, modelos e
    //    intra-test) se propagan a cada onda atenuadas por estabilidad^(k − 1);
    //  · las diferencias por grupo de la base se mantienen en cada onda, y el
    //    cambio diferencial por grupo entra como d adicional (c₁ − c₀)·frac;
    //  · los puntajes generales derivados y los modelos usan solo la onda 1.
    _expandirConfiguracion(cfg) {
        const lista = (cfg && cfg.medidasRepetidas) || [];
        const hayInformantes = ((cfg && cfg.concordancias) || []).some(c => c.tipo === 'informante');
        if ((!lista.length && !hayInformantes) || (cfg.pruebas || []).some(p => p.sufijo)) return cfg;
        const nueva = Object.assign({}, cfg, { pruebas: [], correlaciones: (cfg.correlaciones || []).slice(), diferenciasGrupo: (cfg.diferenciasGrupo || []).slice(), pruebasOriginales: cfg.pruebas });
        const repetidas = new Map();
        lista.forEach(mr => { if (!repetidas.has(mr.variable)) repetidas.set(mr.variable, mr); });
        const ondasDe = new Map();   // nombre base → { mr, clones, stab }
        (cfg.pruebas || []).forEach(p => {
            nueva.pruebas.push(p);
            const mr = repetidas.get(p.nombre);
            if (!mr || p.tipo === 'general') return;
            const K = Math.max(2, Math.min(4, Math.round(mr.ondas || 2)));
            const agrup = mr.agrupacion ? (cfg.sociodemograficos || []).find(s => s.categoria === mr.agrupacion && s.distribucion === 'binaria') : null;
            const c0 = isFinite(mr.cambio) ? mr.cambio : 0;
            const c1 = agrup && isFinite(mr.cambioGrupo) && mr.cambioGrupo !== null ? mr.cambioGrupo : c0;
            const p1 = agrup ? agrup.promedio : 0;
            const clones = [];
            for (let k = 2; k <= K; k++) {
                const frac = (k - 1) / (K - 1);
                const clon = Object.assign({}, p, {
                    nombre: `${p.nombre} (T${k})`, sufijo: `_T${k}`, onda: k, base: p, ondasTotales: K,
                    media: p.media + p.desviacion * ((1 - p1) * c0 + p1 * c1) * frac
                });
                // (C5) dicotómica: la onda muestrea su total de una beta-binomial con SU media
                // (con la de la base, un cambio menor de medio punto se perdía al redondear)
                if (p.formaTotal) { clon.formaTotal = this._formaBetaBinomial(p.numItems, clon.media - p.numItems * p.minimo, p.desviacion); clon.formaTotal.minimo = p.minimo; }
                // (Revisión transversal, F-2) las dificultades de la onda se desplazan con su
                // media: si la media sube 0.4·σ, cada ítem sube (Δmedia)/k; sin esto la
                // calibración y el informe perseguían las dificultades de T1 en una onda con otra media
                this._desplazarDificultades(clon, p);
                clones.push(clon);
                nueva.pruebas.push(clon);
            }
            // (C4) crecimiento con pendientes aleatorias: T_k = μ_k + b + s·τ_k + e_k con
            // τ_k = (k − 1)/(K − 1), Var(b) = estabilidad·σ², Var(s) = DEpend²·σ², Var(e) = (1 − estabilidad)·σ²,
            // r(b, s) = rIP. La DE de cada onda crece («abanico») y las correlaciones
            // entre ondas salen de la covarianza del modelo; todo entra como DE y r
            // de los clones, exactas en modo exacto.
            let rImplicada = null;
            // (Atlas, fase D) interceptos aleatorios: el crecimiento sin pendientes (la misma r entre cualquier par de ondas, la
            // estabilidad, que es la parte de la varianza que es de la persona, y la misma DE)
            if (mr.modelo === 'crecimiento' || mr.modelo === 'intercepto') {
                const inter = mr.modelo === 'intercepto';
                const vb = Math.max(0, Math.min(0.99, mr.estabilidad)), ss = inter ? 0 : Math.max(0, mr.dePendientes || 0), rip = inter ? 0 : Math.max(-0.95, Math.min(0.95, mr.rInterceptoPendiente || 0));
                const tau = k => (k - 1) / (K - 1);
                const varOnda = k => 1 + ss * ss * tau(k) * tau(k) + 2 * rip * Math.sqrt(vb) * ss * tau(k);
                const cov = (j, k) => vb + ss * ss * tau(j) * tau(k) + rip * Math.sqrt(vb) * ss * (tau(j) + tau(k));
                rImplicada = (j, k) => cov(j, k) / Math.sqrt(varOnda(j) * varOnda(k));
                clones.forEach(cl => {
                    cl.desviacion = p.desviacion * Math.sqrt(varOnda(cl.onda));
                    if (p.formaTotal) {
                        cl.formaTotal = this._formaBetaBinomial(p.numItems, cl.media - p.numItems * p.minimo, cl.desviacion); cl.formaTotal.minimo = p.minimo;
                        // (C5) en una dicotómica el KR-20 depende de la varianza del total: la onda tiene el suyo
                        const k = p.numItems, pi = p.dificultadesEfectivas || [];
                        const sumaPQ = pi.length === k ? pi.reduce((s, v) => s + v * (1 - v), 0) : k * 0.25;
                        cl.alfa = Math.max(0.05, Math.min(0.97, (k / (k - 1)) * (1 - sumaPQ / (cl.desviacion * cl.desviacion))));
                    }
                });
            }
            // atenuación de las correlaciones con otras variables en la onda k: con interceptos aleatorios, lo que se relaciona con
            // otra variable es el nivel de la persona, igual en todas las ondas (sin relación declarada entre niveles, toda es
            // entre personas); en los demás modelos, estabilidad^(k−1)
            const stabAcotada = Math.max(-0.99, Math.min(0.99, mr.estabilidad)), aten = k => (mr.modelo === 'intercepto' ? 1 : Math.pow(stabAcotada, k - 1));
            ondasDe.set(p.nombre, { mr, clones, stab: stabAcotada, aten, agrup, c0, c1, K, rImplicada });
        });
        // Correlaciones efectivas de la configuración base: implicadas por
        // mediación, tabla III y relleno intra-test (manda la primera aparición).
        const par = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
        const efectivas = new Map();
        const anotar = (a, b, r) => { const k = par(a, b); if (!efectivas.has(k)) efectivas.set(k, { a, b, r }); };
        const guardado = this.configuracion;
        this.configuracion = cfg;
        try { this._correlacionesImplicadasPorModelos().forEach(c => anotar(c.a, c.b, c.r)); this._correlacionesImplicadasPorNiveles(cfg).forEach(c => anotar(c.a, c.b, c.r)); this._correlacionesImplicadasPorPaneles(cfg).forEach(c => anotar(c.a, c.b, c.r)); } finally { this.configuracion = guardado; }
        (cfg.correlaciones || []).forEach(c => anotar(c.a, c.b, c.r));
        (cfg.gruposPruebas || []).forEach(g => {
            if (g.escalas.length < 2) return;
            const rIntra = g.rIntra === undefined ? 0.40 : g.rIntra;
            const nombres = g.escalas.map(s => ((cfg.pruebas || []).find(p => p.nombreCorto === s && !p.sufijo) || {}).nombre).filter(Boolean);
            for (let i = 0; i < nombres.length; i++) for (let j = i + 1; j < nombres.length; j++) anotar(nombres[i], nombres[j], rIntra);
        });
        ondasDe.forEach(({ clones, stab, aten, rImplicada }, nombre) => {
            // estabilidad entre ondas (AR(1) o modelo de crecimiento); van DELANTE para que manden
            const ondas = [{ nombre, onda: 1 }].concat(clones.map(c => ({ nombre: c.nombre, onda: c.onda })));
            for (let i = 0; i < ondas.length; i++) for (let j = i + 1; j < ondas.length; j++) {
                const r = rImplicada ? rImplicada(ondas[i].onda, ondas[j].onda) : Math.pow(stab, ondas[j].onda - ondas[i].onda);
                nueva.correlaciones.unshift({ a: ondas[i].nombre, b: ondas[j].nombre, r: Math.max(-0.99, Math.min(0.99, r)), origen: 'repetidas' });
            }
            // correlaciones de la base con las demás variables, atenuadas por onda
            efectivas.forEach(c => {
                if (c.a !== nombre && c.b !== nombre) return;
                const otro = c.a === nombre ? c.b : c.a;
                const otroRep = ondasDe.get(otro);
                clones.forEach(cl => {
                    nueva.correlaciones.push({ a: cl.nombre, b: otro, r: c.r * aten(cl.onda), origen: 'repetidas' });
                });
                // el otro también es repetido: onda × onda con atenuación de ambos
                // lados, añadido una sola vez (desde el nombre menor)
                if (otroRep && otro > nombre) {
                    clones.forEach(cl => otroRep.clones.forEach(ol => {
                        nueva.correlaciones.push({ a: cl.nombre, b: ol.nombre, r: c.r * aten(cl.onda) * otroRep.aten(ol.onda), origen: 'repetidas' });
                    }));
                }
            });
        });
        // (Atlas, fase D) relación entre niveles: en cada pareja, las ondas de X e Y se relacionan con r_misma en la misma onda y
        // con la parte entre personas en ondas distintas; van DELANTE para que manden sobre la atenuación genérica
        const ondasLista = (nombre, o) => [{ nombre, onda: 1 }].concat(o.clones.map(c => ({ nombre: c.nombre, onda: c.onda })));
        const fijarOndas = (x, ox, y, oy, rMisma, rCruzada) => ondasLista(x, ox).forEach(a => ondasLista(y, oy).forEach(b => nueva.correlaciones.unshift({ a: a.nombre, b: b.nombre, r: a.onda === b.onda ? rMisma : rCruzada, origen: 'niveles' })));
        const declaradas = new Set();
        (cfg.niveles || []).forEach(nv => {
            const d = this._datosNivel(nv, cfg), ox = ondasDe.get(nv.x), oy = ondasDe.get(nv.y);
            if (!d || !ox || !oy) return;
            declaradas.add(par(nv.x, nv.y));
            fijarOndas(nv.x, ox, nv.y, oy, d.rMisma, d.rCruzada);
        });
        // (revisión de la fase D) sin pareja declarada, dos escalas con interceptos aleatorios tienen la MISMA relación en los dos
        // niveles (ρ, tal que en la misma onda salga la r pedida): la misma onda conserva r y las distintas quedan atenuadas por la
        // estabilidad. Antes era «toda entre personas» (la misma r entre ondas distintas), raro en datos reales, imposible desde
        // r ≈ .63 con estabilidades de .5 y 4 ondas, y con una r entre personas implícita mayor que 1 desde |r| > √(ICC_X·ICC_Y)
        efectivas.forEach(c => {
            const ox = ondasDe.get(c.a), oy = ondasDe.get(c.b);
            if (!ox || !oy || ox.mr.modelo !== 'intercepto' || oy.mr.modelo !== 'intercepto' || declaradas.has(par(c.a, c.b))) return;
            const ix = ox.stab, iy = oy.stab, k = Math.sqrt(ix * iy) + Math.sqrt((1 - ix) * (1 - iy));
            if (!(ix > 0 && iy > 0 && k > 0) || !(Math.abs(c.r / k) < 0.99)) return;
            fijarOndas(c.a, ox, c.b, oy, c.r, (c.r / k) * Math.sqrt(ix * iy));
        });
        // (Atlas, fase E1) relación en el tiempo (panel cruzado): las ondas de X e Y siguen la dinámica A, Cov(Z_s, Z_t) = A^(s−t)·Σ,
        // también dentro de cada escala (con efectos cruzados, la r entre ondas no contiguas ya no es estabilidad^k), y cada
        // variable que no se repite se propaga por la misma dinámica desde T1. Van DELANTE para que manden
        const fijarPanel = (a, b, r) => nueva.correlaciones.unshift({ a, b, r: Math.max(-0.99, Math.min(0.99, r)), origen: 'paneles' });
        const panelDe = new Map();   // escala → { i, pn, dp, idx } (posición 0 = X, 1 = Y dentro de su panel)
        (cfg.paneles || []).forEach((pn, i) => {
            const dp = this._datosPanel(pn, cfg);
            if (dp && ondasDe.get(pn.x) && ondasDe.get(pn.y) && !panelDe.has(pn.x) && !panelDe.has(pn.y)) { panelDe.set(pn.x, { i, pn, dp, idx: 0 }); panelDe.set(pn.y, { i, pn, dp, idx: 1 }); }
        });
        const potencia = (A, k) => { let M = [[1, 0], [0, 1]]; for (let j = 1; j < k; j++) M = [[A[0][0] * M[0][0] + A[0][1] * M[1][0], A[0][0] * M[0][1] + A[0][1] * M[1][1]], [A[1][0] * M[0][0] + A[1][1] * M[1][0], A[1][0] * M[0][1] + A[1][1] * M[1][1]]]; return M; };
        const rT1 = (a, b) => { const e = efectivas.get(par(a, b)); return e ? e.r : 0; };
        (cfg.paneles || []).forEach((pn, i) => {
            const u = panelDe.get(pn.x);
            if (!u || u.i !== i) return;
            const dp = u.dp, lx = ondasLista(pn.x, ondasDe.get(pn.x)), ly = ondasLista(pn.y, ondasDe.get(pn.y));
            for (let s = 1; s <= dp.K; s++) for (let t = 1; t <= s; t++) {
                const M = correlacionEntreOndas(dp.est, s, t), xs = lx[s - 1].nombre, xt = lx[t - 1].nombre, ys = ly[s - 1].nombre, yt = ly[t - 1].nombre;
                if (s === t) { fijarPanel(xs, ys, M[0][1]); continue; }
                fijarPanel(xs, xt, M[0][0]); fijarPanel(ys, yt, M[1][1]); fijarPanel(xs, yt, M[0][1]); fijarPanel(ys, xt, M[1][0]);
            }
            // variables que no se repiten: su relación con X e Y en T1 se propaga por la dinámica
            const exogenas = new Map();
            efectivas.forEach(c => [[pn.x, 0], [pn.y, 1]].forEach(([v, j]) => {
                if (c.a !== v && c.b !== v) return;
                const w = c.a === v ? c.b : c.a;
                if (w === pn.x || w === pn.y || ondasDe.has(w)) return;
                if (!exogenas.has(w)) exogenas.set(w, [0, 0]);
                exogenas.get(w)[j] = c.r;
            }));
            exogenas.forEach(([rx, ry], w) => { for (let k = 2; k <= dp.K; k++) { const v = propagarExogena(dp.est, rx, ry, k); fijarPanel(lx[k - 1].nombre, w, v[0]); fijarPanel(ly[k - 1].nombre, w, v[1]); } });
            // (revisión de la fase E1) otras escalas repetidas: la relación de T1 se propaga por la dinámica de CADA una (A^(k−1) en un
            // panel, su atenuación si va sola), con innovaciones independientes después de T1: r(U_k, V_l) = [P_U(k)·C_T1·P_V(l)ᵀ].
            // Para dos escalas sueltas es la regla genérica de siempre; antes, la genérica trataba las ondas de X como un AR(1) simple
            // (incoherente con la dinámica) y perdía el efecto cruzado: con V ligada a X, r(V₁, Y₂) = c·r(X₁, V₁) salía 0
            const miembros = [pn.x, pn.y], listaU = [lx, ly];
            ondasDe.forEach((ov, v) => {
                if (miembros.includes(v)) return;
                const w = panelDe.get(v);
                if (w && (w.i < i || v !== w.pn.x)) return;   // otro panel: una sola vez, desde el de menor índice y por su X
                const miembrosV = w ? [w.pn.x, w.pn.y] : [v], C = miembros.map(m => miembrosV.map(mv => rT1(m, mv)));
                if (C.every(f => f.every(x => x === 0))) return;
                miembrosV.forEach((mv, jv) => ondasLista(mv, ondasDe.get(mv)).forEach(b => {
                    const q = w ? potencia(w.dp.est.A, b.onda)[jv] : [ov.aten(b.onda)];
                    for (let k = 1; k <= dp.K; k++) {
                        const P = potencia(dp.est.A, k);
                        for (let iu = 0; iu < 2; iu++) {
                            let r = 0;
                            for (let a = 0; a < 2; a++) for (let bb = 0; bb < q.length; bb++) r += P[iu][a] * C[a][bb] * q[bb];
                            fijarPanel(listaU[iu][k - 1].nombre, b.nombre, r);
                        }
                    }
                }));
            });
        });
        // (C7) Informantes: un clon de la escala por informante, con sufijo propio,
        // correlación r con la base (concordancia), sesgo d·σ en la media, las mismas
        // correlaciones con las demás variables atenuadas por r y las mismas
        // diferencias por grupo. Solo sobre la onda 1.
        (cfg.concordancias || []).filter(c => c.tipo === 'informante').forEach(c => {
            const p = (cfg.pruebas || []).find(x => x.nombre === c.variable && !x.sufijo && x.tipo !== 'general');
            if (!p || !(c.r > 0 && c.r < 0.99)) return;
            const sufijo = `_${this._slugSufijo(c.etiqueta)}`;
            if (nueva.pruebas.some(x => x.sufijo === sufijo && x.base === p)) return;
            const clon = Object.assign({}, p, { nombre: `${p.nombre} (${c.etiqueta})`, sufijo, base: p, informante: c.etiqueta, media: p.media + p.desviacion * (c.sesgo || 0) });
            if (p.formaTotal) { clon.formaTotal = this._formaBetaBinomial(p.numItems, clon.media - p.numItems * p.minimo, p.desviacion); clon.formaTotal.minimo = p.minimo; }
            this._desplazarDificultades(clon, p);
            const iBase = nueva.pruebas.indexOf(p);
            nueva.pruebas.splice(iBase >= 0 ? iBase + 1 : nueva.pruebas.length, 0, clon);
            nueva.correlaciones.unshift({ a: p.nombre, b: clon.nombre, r: c.r, origen: 'repetidas' });
            efectivas.forEach(e => {
                if (e.a !== p.nombre && e.b !== p.nombre) return;
                const otro = e.a === p.nombre ? e.b : e.a;
                nueva.correlaciones.push({ a: clon.nombre, b: otro, r: e.r * c.r, origen: 'repetidas' });
            });
            (cfg.diferenciasGrupo || []).forEach(d => { if (d.cuantitativa === p.nombre) nueva.diferenciasGrupo.push(Object.assign({}, d, { cuantitativa: clon.nombre })); });
        });
        // Diferencias por grupo: las de la base en cada onda + cambio diferencial.
        // La d es MARGINAL (d_k = Δ_k/DE agrupada), así que el desplazamiento
        // entre grupos vale Δ = d·σ/√(1 + d²·V); para que el grupo 1 cambie
        // (c₁ − c₀)·σ MÁS que el grupo 0, se suma en amplitud y se vuelve a d:
        //   amp_k = amp_1 + (c₁ − c₀)·frac ;  d_k = amp_k/√(1 − amp_k²·V).
        // Sumar directamente las d (como en una primera versión) dejaba la
        // interacción corta (−0.78 salía −0.64).
        ondasDe.forEach(({ clones, agrup, c0, c1, K }, nombre) => {
            (cfg.diferenciasGrupo || []).forEach(d => {
                // (C4) se copian todos los campos: una interacción o una CCI de la base
                // valen igual en cada onda (antes se copiaban como una d simple)
                if (d.cuantitativa === nombre) clones.forEach(cl => nueva.diferenciasGrupo.push(Object.assign({}, d, { cuantitativa: cl.nombre })));
            });
            if (agrup && c1 !== c0) {
                const V = this._varianzaCodigo(agrup) || 0;
                const base = (cfg.diferenciasGrupo || []).find(x => x.cuantitativa === nombre && x.agrupacion === agrup.categoria && (!x.tipo || x.tipo === 'd'));
                const d1 = base ? base.d : 0;
                const amp1 = d1 / Math.sqrt(1 + d1 * d1 * V);
                clones.forEach(cl => {
                    // en DE de T1: si la onda tiene otra DE (crecimiento), se convierte a la suya
                    const extraAmp = (c1 - c0) * (cl.onda - 1) / (K - 1) * (cl.desviacion > 0 && cl.base ? cl.base.desviacion / cl.desviacion : 1);
                    const ampK = amp1 + extraAmp;
                    const dK = ampK / Math.sqrt(Math.max(0.05, 1 - ampK * ampK * V));
                    const previa = nueva.diferenciasGrupo.find(x => x.cuantitativa === cl.nombre && x.agrupacion === agrup.categoria && (!x.tipo || x.tipo === 'd'));
                    // extraAmp queda anotado: si la base hereda una d de su General
                    // por esta misma agrupación, prepararDiferenciasGrupo la recompone
                    if (previa) { previa.d = dK; previa.extraAmp = extraAmp; }
                    else nueva.diferenciasGrupo.push({ cuantitativa: cl.nombre, agrupacion: agrup.categoria, d: dK, extraAmp });
                });
            }
        });
        return nueva;
    },

    obtenerConfiguracion() {
        return this.configuracion;
    },
};
