// ========================================
// GENERADOR DE BASE DE DATOS SIMULADA
// ========================================

// Tope superior del tamaño muestral para evitar congelar el navegador.
const TAMANO_MUESTRAL_MAXIMO = 100000;

// σ de la forma «asimétrica» de las ESCALAS: log-normal estandarizada que
// transformarFormaZ aplica al driver normal. FUENTE ÚNICA: la corrección de
// correlación intermedia (_rhoIntermedia) debe usar exactamente este valor.
const SIGMA_FORMA_ASIMETRICA = 0.6;

// (B5) Heterogeneidad de los ítems de cada escala. Cada nivel fija:
//  · medias: amplitud de las medias de ítem como fracción del espacio libre
//    (Likert: distancia de la media de ítem al tope más cercano; continua:
//    la DE de un ítem), repartidas en escalera y barajadas por la semilla;
//  · cargas: dispersión de los pesos con que cada ítem participa del total
//    (1 ± cargas), es decir, cargas factoriales desiguales (modelo congenérico);
//  · cruzadas / proporcionCruzadas: carga cruzada estandarizada que reciben
//    algunos ítems (esa proporción de los de la escala) desde OTRA dimensión
//    del mismo test.
// «ninguna» reproduce el comportamiento anterior: ítems paralelos (en modo ω
// se mantiene el modelo congenérico de siempre, con dispersión 0.45).
// (B8) Estilos de respuesta: intensidad por persona (× U(0.7, 1.3)).
//  · aquiescencia: puntos que se suman a la respuesta BRUTA de cada ítem (los
//    invertidos se guardan reflejados, así que el sesgo va en la misma dirección
//    en todos y, tras recodificar, empuja en contra a los invertidos: es lo que
//    la delata en un análisis real);
//  · extrema: probabilidad de que cada respuesta salte al extremo de su lado
//    (y, si está justo en el punto medio, a un extremo cualquiera). Un factor
//    multiplicativo v' = m + s·(v − m) dejaba sin efecto las escalas de 4
//    puntos con intensidad leve o moderada; el salto probabilístico no.
const ESTILOS_RESPUESTA = {
    leve:     { aquiescencia: 0.6, extrema: 0.30 },
    moderada: { aquiescencia: 1.0, extrema: 0.50 },
    alta:     { aquiescencia: 1.5, extrema: 0.75 }
};
const PERFILES_HETEROGENEIDAD = {
    ninguna:  { medias: 0,   cargas: 0,   cruzadas: 0,    proporcionCruzadas: 0 },
    leve:     { medias: 0.3, cargas: 0.3, cruzadas: 0.15, proporcionCruzadas: 0.20 },
    moderada: { medias: 0.5, cargas: 0.5, cruzadas: 0.25, proporcionCruzadas: 0.25 },
    alta:     { medias: 0.7, cargas: 0.7, cruzadas: 0.35, proporcionCruzadas: 0.34 }
};

// ========================================
// REGLAS DE COHERENCIA (fuente única)
// Las usan la guía en vivo de la interfaz (guia-coherencia.js) y el respaldo
// de validación del generador. Si una regla cambia, se cambia SOLO aquí.
// ========================================
const ReglasCoherencia = {
    // Rango permitido de la Media de un puntaje que es suma de k ítems en [min, max]
    rangoMedia(k, min, max) {
        return { minimo: Math.ceil(k * min), maximo: Math.floor(k * max) };
    },

    // DE máxima sin recorte: la distribución (±3·DE) debe caber hasta el tope más cercano
    deMaxima(media, totalMin, totalMax) {
        return Math.min(media - totalMin, totalMax - media) / 3;
    },

    // DE mínima recomendada para que un total ENTERO no salga "escalonado" y pueda
    // pasar la prueba de normalidad. Calibrada empíricamente: ≈ 1.1·√N.
    deMinimaNormal(n) {
        return (Number.isFinite(n) && n >= 2) ? Math.ceil(1.1 * Math.sqrt(n)) : 0;
    }
};
if (typeof window !== 'undefined') {
    window.ReglasCoherencia = ReglasCoherencia;
}

class GeneradorDatos {
    constructor() {
        this.datosGenerados = null;
        this.configuracion = {
            tamanoMuestra: 100,
            semilla: null,
            pruebas: [],
            sociodemograficos: []
        };
        // Fuente de números aleatorios (reemplazable por un PRNG sembrado)
        this.aleatorio = Math.random;
    }

    // ========================================
    // ALEATORIEDAD (REPRODUCIBLE CON SEMILLA)
    // ========================================

    // Inicializa la fuente de aleatoriedad. Con una semilla numérica usa un
    // PRNG determinista (Mulberry32): la misma semilla produce el mismo
    // conjunto de datos. Sin semilla, usa Math.random.
    inicializarAleatorio(semilla) {
        if (semilla === null || semilla === undefined || isNaN(semilla)) {
            this.aleatorio = Math.random;
            return;
        }

        let estado = Math.trunc(semilla) >>> 0;
        this.aleatorio = function () {
            estado = (estado + 0x6D2B79F5) >>> 0;
            let t = estado;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

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
        // (B6) Modelos estructurales: mediación y moderación desde coeficientes
        this.configuracion.modelos = this.recolectarModelos();
        // (B7) Medidas repetidas: ondas T2… con estabilidad y d de cambio
        this.configuracion.medidasRepetidas = this.recolectarMedidasRepetidas();

        return this.configuracion;
    }

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
    }
    _esNombreGeneral(nombre) {
        return (this.configuracion.gruposPruebas || []).some(g => g.escalas.length >= 2 && this.nombreGeneral(g) === nombre);
    }
    _validarModelos(errores, advertencias) {
        const cfg = this.configuracion;
        const modelos = cfg.modelos || [];
        if (!modelos.length) return;
        const nombres = this._nombresCorrelacionables();
        const tablaIII = new Set((cfg.correlaciones || []).map(c => (c.a < c.b ? `${c.a}|${c.b}` : `${c.b}|${c.a}`)));
        const par = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
        const criteriosModeracion = new Set();
        const gruposMediacion = new Map();
        // Registro de parejas fijadas por algún modelo: dos modelos no pueden fijar
        // la misma pareja con valores distintos (p. ej. X→M→Y y una moderación
        // cuyo criterio sea X con M como predictora).
        const fijadas = new Map();
        const fijarPareja = (p, valor, etiqueta) => {
            if (!fijadas.has(p)) { fijadas.set(p, { valor, etiqueta }); return; }
            const previo = fijadas.get(p);
            if (Math.abs(previo.valor - valor) > 1e-9 && previo.etiqueta !== etiqueta) {
                errores.push(`Conflicto entre modelos: la correlación ${p.replace('|', ' ↔ ')} la fija «${previo.etiqueta}» en ${previo.valor.toFixed(2)} y «${etiqueta}» en ${valor.toFixed(2)}`);
            }
        };
        this._correlacionesImplicadasPorMediacion().forEach(c => {
            fijarPareja(par(c.a, c.b), c.r, `mediación sobre ${c.a}/${c.b}`);
            // con mediadores paralelos, r(X,Y) = c′ + Σ ai·bi puede desbordarse aunque cada fila sea válida
            if (Math.abs(c.r) >= 0.99) errores.push(`Mediación: los coeficientes implican r(${c.a}, ${c.b}) = ${c.r.toFixed(2)}, imposible; reduce los coeficientes`);
        });
        // Moderación sobre dimensiones de un test con puntaje general: las
        // correlaciones pedidas sobre ese General se reparten entre sus
        // dimensiones y pueden chocar con las que fija el modelo.
        const dimsDeGeneral = new Map();
        (cfg.gruposPruebas || []).forEach(g => { if (g.escalas.length >= 2) g.escalas.forEach(s => { const p = (cfg.pruebas || []).find(x => x.nombreCorto === s); if (p) dimsDeGeneral.set(p.nombre, this.nombreGeneral(g)); }); });
        const generalesConCorrelacion = new Set();
        (cfg.correlaciones || []).concat(this._correlacionesImplicadasPorMediacion()).forEach(c => { [c.a, c.b].forEach(v => { if (this._esNombreGeneral(v)) generalesConCorrelacion.add(v); }); });
        modelos.filter(md => md.tipo === 'moderacion').forEach(md => {
            [md.x, md.m, md.y].forEach(v => {
                const gen = dimsDeGeneral.get(v);
                if (gen && generalesConCorrelacion.has(gen)) advertencias.push(`Moderación ${md.x} × ${md.m} → ${md.y}: «${v}» es dimensión de «${gen}», que tiene correlaciones pedidas; el reparto entre dimensiones puede no cumplirse exactamente`);
            });
            // Si el criterio y X (o W) difieren por el MISMO grupo, la regresión sin
            // ese grupo como covariable confunde los β (como con datos reales).
            const agrupacionesDe = nombre => {
                const s = new Set();
                (cfg.diferenciasGrupo || []).forEach(dif => {
                    if (dif.cuantitativa === nombre) s.add(dif.agrupacion);
                    const gen = dimsDeGeneral.get(nombre);
                    if (gen && dif.cuantitativa === gen) s.add(dif.agrupacion);
                });
                return s;
            };
            const deY = agrupacionesDe(md.y);
            [md.x, md.m].forEach(v => {
                const comunes = [...agrupacionesDe(v)].filter(a => deY.has(a));
                if (comunes.length) advertencias.push(`Moderación ${md.x} × ${md.m} → ${md.y}: «${md.y}» y «${v}» difieren por el mismo grupo (${comunes.join(', ')}); los β de una regresión que no incluya ese grupo se verán confundidos por él`);
            });
        });
        modelos.filter(md => md.tipo === 'moderacion').forEach(md => {
            const rXW = (cfg.correlaciones || []).find(c => par(c.a, c.b) === par(md.x, md.m));
            const rho = rXW ? rXW.r : 0;
            const etiqueta = `Moderación ${md.x} × ${md.m} → ${md.y}`;
            fijarPareja(par(md.x, md.y), md.c1 + md.c2 * rho, etiqueta);
            fijarPareja(par(md.m, md.y), md.c2 + md.c1 * rho, etiqueta);
        });
        modelos.forEach((md, k) => {
            const etiqueta = md.tipo === 'moderacion' ? `Moderación ${md.x} × ${md.m} → ${md.y}` : `Mediación ${md.x} → ${md.m} → ${md.y}`;
            [md.x, md.m, md.y].forEach(v => { if (!nombres.has(v)) errores.push(`${etiqueta}: la variable «${v}» no existe entre las cuantitativas del estudio`); });
            if (md.x === md.m || md.x === md.y || md.m === md.y) errores.push(`${etiqueta}: las tres variables deben ser distintas`);
            if ([md.c1, md.c2, md.c3].some(c => Math.abs(c) >= 1)) errores.push(`${etiqueta}: los coeficientes estandarizados deben estar entre −1 y 1`);
            if (md.tipo === 'mediacion') {
                const rXY = md.c3 + md.c1 * md.c2, rMY = md.c2 + md.c1 * md.c3;
                if (Math.abs(rXY) >= 0.99 || Math.abs(rMY) >= 0.99) {
                    errores.push(`${etiqueta}: los coeficientes implican correlaciones imposibles (r(X,Y) = ${rXY.toFixed(2)}, r(M,Y) = ${rMY.toFixed(2)}); reduce a, b o c′`);
                }
                const clave = par(md.x, md.y);
                if (gruposMediacion.has(clave) && gruposMediacion.get(clave) !== md.c3) {
                    advertencias.push(`${etiqueta}: mediadores paralelos con distinto c′; se usa el del primer modelo (${gruposMediacion.get(clave)})`);
                }
                if (!gruposMediacion.has(clave)) gruposMediacion.set(clave, md.c3);
                [par(md.x, md.m), par(md.m, md.y), par(md.x, md.y)].forEach(p => {
                    if (tablaIII.has(p)) advertencias.push(`${etiqueta}: la correlación ${p.replace('|', ' ↔ ')} de la tabla III se sustituye por la que implican los coeficientes`);
                });
            } else {
                [md.x, md.m, md.y].forEach(v => { if (this._esNombreGeneral(v)) errores.push(`${etiqueta}: un puntaje general derivado no puede entrar en una moderación (usa sus dimensiones)`); });
                if (criteriosModeracion.has(md.y)) errores.push(`${etiqueta}: «${md.y}» ya es criterio de otra moderación (una variable solo puede serlo de una)`);
                criteriosModeracion.add(md.y);
                // R² con la correlación X–W que pida la tabla III (o 0 si no la hay)
                const rXW = (cfg.correlaciones || []).find(c => par(c.a, c.b) === par(md.x, md.m));
                const rho = rXW ? rXW.r : 0;
                const r2 = md.c1 * md.c1 + md.c2 * md.c2 + 2 * md.c1 * md.c2 * rho + md.c3 * md.c3 * (1 + rho * rho);
                if (r2 >= 0.98) errores.push(`${etiqueta}: los coeficientes explican el ${(r2 * 100).toFixed(0)} % de la varianza de «${md.y}» (máximo 98 %); reduce β₁, β₂ o β₃`);
                // con diferencias por grupo en Y, los β viven en su varianza INTRA (σ·s): R²/s² también debe caber
                let entre = 0;
                (cfg.diferenciasGrupo || []).filter(d => d.cuantitativa === md.y).forEach(d => {
                    const ag = (cfg.sociodemograficos || []).find(x => x.categoria === d.agrupacion);
                    const V = this._varianzaCodigo(ag); if (V === null) return;
                    const amp = d.d / Math.sqrt(1 + d.d * d.d * V); entre += amp * amp * V;
                });
                const s2 = Math.max(0.04, 1 - entre);
                if (r2 < 0.98 && r2 / s2 >= 0.98) errores.push(`${etiqueta}: con las diferencias por grupo de «${md.y}», los coeficientes explican el ${(100 * r2 / s2).toFixed(0)} % de su varianza intra-grupo (máximo 98 %); reduce los β o la d`);
                [par(md.x, md.y), par(md.m, md.y)].forEach(p => {
                    if (tablaIII.has(p)) advertencias.push(`${etiqueta}: la correlación ${p.replace('|', ' ↔ ')} de la tabla III se sustituye por la que implican los coeficientes`);
                });
            }
        });
    }
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
            const tipo = selects[0].value === 'moderacion' ? 'moderacion' : 'mediacion';
            const x = selects[1].value, m = selects[2].value, y = selects[3].value;
            const c1 = parseFloat(inputs[0].value), c2 = parseFloat(inputs[1].value), c3 = parseFloat(inputs[2].value);
            if (!x || !m || !y) return;
            if ([c1, c2, c3].some(c => isNaN(c))) {
                throw new Error(`Modelo ${tipo === 'moderacion' ? 'de moderación' : 'de mediación'} (${x} · ${m} · ${y}): faltan coeficientes`);
            }
            modelos.push({ tipo, x, m, y, c1, c2, c3 });
        });
        return modelos;
    }
    // (B7) Tabla de medidas repetidas: selects [variable, agrupación] e inputs
    // [ondas, estabilidad, cambio, cambioGrupo].
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
            salida.push({ variable, ondas: isNaN(ondas) ? 2 : ondas, estabilidad, cambio: isNaN(cambio) ? 0 : cambio, agrupacion: agrupacion || '', cambioGrupo: isNaN(cambioGrupo) ? null : cambioGrupo });
        });
        return salida;
    }
    _validarMedidasRepetidas(errores, advertencias) {
        const cfg = this.configuracion;
        const lista = cfg.medidasRepetidas || [];
        if (!lista.length) return;
        const vistas = new Set();
        lista.forEach(mr => {
            const etiqueta = `Medida repetida «${mr.variable}»`;
            const p = (cfg.pruebas || []).find(x => x.nombre === mr.variable && !x.sufijo);
            if (!p || p.tipo === 'general') { errores.push(`${etiqueta}: solo puede repetirse una escala de tipo dimensión de la tabla I`); return; }
            if (mr.agrupacion && (cfg.modelos || []).some(md => md.tipo === 'moderacion' && md.y === mr.variable)) {
                advertencias.push(`${etiqueta}: es criterio de una moderación; el cambio por grupo de sus ondas hereda el azar de las medias de grupo de T1 (usa el cambio global o quita la moderación)`);
            }
            if (vistas.has(mr.variable)) errores.push(`${etiqueta}: aparece dos veces; manda la primera fila`);
            vistas.add(mr.variable);
            if (!(mr.ondas >= 2 && mr.ondas <= 4)) errores.push(`${etiqueta}: el número de ondas debe estar entre 2 y 4`);
            if (!(mr.estabilidad > -1 && mr.estabilidad < 1)) errores.push(`${etiqueta}: la estabilidad debe estar entre −1 y 1`);
            if (mr.estabilidad < 0.3) advertencias.push(`${etiqueta}: una estabilidad test-retest de ${mr.estabilidad} es inusualmente baja para una misma escala`);
            if (Math.abs(mr.cambio) > 3) errores.push(`${etiqueta}: la d de cambio (${mr.cambio}) no es plausible`);
            if (mr.agrupacion) {
                const s = (cfg.sociodemograficos || []).find(x => x.categoria === mr.agrupacion);
                if (!s || s.distribucion !== 'binaria') errores.push(`${etiqueta}: la agrupación del cambio debe ser una variable BINARIA (0 = control, 1 = experimental)`);
                if (mr.cambioGrupo === null || !isFinite(mr.cambioGrupo)) errores.push(`${etiqueta}: indica la d de cambio del grupo 1 (o quita la agrupación)`);
                else if (Math.abs(mr.cambioGrupo) > 3) errores.push(`${etiqueta}: la d de cambio del grupo 1 (${mr.cambioGrupo}) no es plausible`);
            }
            // Media/DE de las ondas siguientes dentro del rango Likert
            if (p.minimo !== null && p.maximo !== null) {
                const c = Math.max(Math.abs(mr.cambio || 0), Math.abs(mr.cambioGrupo || 0));
                const mediaMax = p.media + p.desviacion * c;
                const tope = p.numItems * p.maximo, suelo = p.numItems * p.minimo;
                if (mediaMax + 2 * p.desviacion > tope || p.media - p.desviacion * c - 2 * p.desviacion < suelo) {
                    advertencias.push(`${etiqueta}: con una d de cambio de ${c} la media de la última onda se acerca al tope del rango Likert; el recorte deformará la distribución`);
                }
            }
        });
    }
    recolectarDiferenciasGrupo() {
        const diferencias = [];
        const filas = document.querySelectorAll('#bodyDiferencias .fila-diferencia');

        filas.forEach(fila => {
            const selects = fila.querySelectorAll('select');
            const inputD = fila.querySelector('input');
            if (selects.length < 2 || !inputD) return;

            const cuantitativa = selects[0].value;
            const agrupacion = selects[1].value;
            const d = parseFloat(inputD.value);

            if (cuantitativa && agrupacion && cuantitativa !== agrupacion && !isNaN(d)) {
                diferencias.push({ cuantitativa: cuantitativa, agrupacion: agrupacion, d: d });
            }
        });

        return diferencias;
    }

    // Lee las correlaciones objetivo de la tabla (pares de variables + r).
    recolectarCorrelaciones() {
        const correlaciones = [];
        const filas = document.querySelectorAll('#bodyCorrelaciones .fila-correlacion');

        filas.forEach(fila => {
            const selects = fila.querySelectorAll('select');
            const inputR = fila.querySelector('input');
            if (selects.length < 2 || !inputR) return;

            const a = selects[0].value;
            const b = selects[1].value;
            const r = parseFloat(inputR.value);

            if (a && b && a !== b && !isNaN(r)) {
                if (r <= -1 || r >= 1) {
                    throw new Error(`Correlación entre "${a}" y "${b}": r debe estar entre -1 y 1`);
                }
                correlaciones.push({ a: a, b: b, r: r });
            }
        });

        return correlaciones;
    }

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
    }

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
                    alfa: !isNaN(alfa) ? alfa : 0
                });
            }
        });

        return pruebas;
    }

    // Nombre de columna de una escala según su tipo (FUENTE ÚNICA):
    // dimensión → Dimension_<sigla>; general → General_<sigla>.
    // El prefijo codifica el tipo para que una base exportada conserve su
    // estructura y el analizador pueda reconstruirla desde el CSV.
    columnaDeEscala(escala) {
        return `${escala.tipo === 'general' ? 'General' : 'Dimension'}_${this._claveEscala(escala)}`;
    }
    // (B7) Para una onda T2…, la carga cruzada mira a la MISMA onda de la otra
    // dimensión si existe; si no, a su onda 1. Misma regla en el pase 2, en la
    // α teórica y en la simulación de calibración.
    _siglaOnda(prueba, sigla) {
        if (!prueba.sufijo) return sigla;
        const k = sigla + prueba.sufijo;
        return (this.configuracion.pruebas || []).some(p => this._claveEscala(p) === k) ? k : sigla;
    }
    // (B7) Clave única de una escala: sigla + sufijo de onda («PE», «PE_T2»).
    // Las ondas T2… de una medida repetida son clones de la escala base con
    // `sufijo` y `base`; la onda 1 conserva los nombres de siempre.
    _claveEscala(escala) { return `${escala.nombreCorto}${escala.sufijo || ''}`; }

    // Diccionario de etiquetas humanas para las columnas generadas (estilo
    // "variable labels" de SPSS): Total_IC → "Inteligencia Cognitiva".
    obtenerEtiquetas() {
        const mapa = {};
        const escalas = (this.configuracion && this.configuracion.pruebas) || [];
        escalas.forEach(e => {
            const suf = e.sufijo || '';
            if ((e.invertidos || 0) > 0) for (let j = e.numItems - e.invertidos + 1; j <= e.numItems; j++) mapa[`${e.nombreCorto}${j}${suf}`] = `${e.nombre} — ítem ${j} (INVERTIDO: recodificar)`;
            mapa[this.columnaDeEscala(e)] = e.nombre;
            mapa[`PC_${this._claveEscala(e)}`] = `Percentil — ${e.nombre}`;
        });
        // (B8) columnas auxiliares de las imperfecciones
        mapa['Respuesta_descuidada'] = 'Marcador: 1 = respondiente descuidado (línea recta o al azar)';
        mapa['Estilo_respuesta'] = 'Marcador de estilo de respuesta: 0 = ninguno, 1 = aquiescente, 2 = extremo';
        mapa['Tiempo_respuesta_seg'] = 'Tiempo total de respuesta al cuestionario (segundos)';
        this._controlesEsperados().forEach(c => { mapa[c.columna] = `Ítem de control ${c.indice}: instrucción «marque ${c.correcta}» (rango ${c.minimo}–${c.maximo})`; });
        (this.configuracion && this.configuracion.gruposPruebas || []).forEach(g => {
            if (g.escalas.length >= 2) {
                const etiqueta = g.variable ? `${g.variable} — ${g.nombre}` : `Puntaje general — ${g.nombre}`;
                mapa[`General_${g.sigla}`] = etiqueta;
                mapa[`PC_${g.sigla}`] = `Percentil — ${etiqueta}`;
            }
        });
        return mapa;
    }

    // Estructura de pruebas para el análisis por dimensiones:
    // [{ prueba, columnaGeneral, etiquetaGeneral, dimensiones: [{columna, etiqueta}] }]
    obtenerEstructuraEscalas() {
        const escalas = (this.configuracion && this.configuracion.pruebas) || [];
        const porPrueba = new Map();
        escalas.forEach(e => {
            if (!e.prueba || e.sufijo) return;   // las ondas T2… no son dimensiones nuevas del test
            if (!porPrueba.has(e.prueba)) porPrueba.set(e.prueba, { general: null, dimensiones: [] });
            const grupo = porPrueba.get(e.prueba);
            if (e.tipo === 'general') grupo.general = e;
            else grupo.dimensiones.push(e);
        });
        const estructura = [];
        porPrueba.forEach((grupo, nombrePrueba) => {
            if (!grupo.general || grupo.dimensiones.length === 0) return;
            estructura.push({
                prueba: nombrePrueba,
                columnaGeneral: this.columnaDeEscala(grupo.general),
                etiquetaGeneral: grupo.general.nombre,
                dimensiones: grupo.dimensiones.map(d => ({
                    columna: this.columnaDeEscala(d),
                    etiqueta: d.nombre
                }))
            });
        });
        return estructura;
    }

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
    }

    recolectarSociodemograficos() {
        const socio = [];
        const nombresCortosUsados = new Set();
        const filas = document.querySelectorAll('#bodySocio .fila-socio');

        filas.forEach((fila, index) => {
            const inputs = fila.querySelectorAll('input');
            const selectDist = fila.querySelector('select');
            const distribucion = selectDist ? selectDist.value : 'normal';
            const categoria = inputs[0].value.trim();
            const promedio = parseFloat(inputs[1].value);
            const desviacion = parseFloat(inputs[2].value);
            const minimo = parseFloat(inputs[3].value);
            const maximo = parseFloat(inputs[4].value);
            const decimales = parseInt(inputs[5].value);

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
                    decimales: numDecimales
                });
            }
        });

        return socio;
    }

    generarNombreCorto(nombre) {
        // Genera un nombre corto a partir del nombre completo
        // Toma las iniciales y números
        let corto = nombre
            .replace(/[^a-zA-Z0-9\s]/g, '') // Eliminar caracteres especiales
            .split(/\s+/) // Separar por espacios
            .map(palabra => palabra.charAt(0).toUpperCase()) // Primera letra
            .join('');

        return corto.substring(0, 10); // Máximo 10 caracteres
    }

    // Devuelve un nombre corto único respecto a `usados`, agregando un sufijo
    // numérico si hay colisión. Evita que dos pruebas/variables con iniciales
    // iguales generen el mismo prefijo de columna y se sobrescriban entre sí.
    generarNombreCortoUnico(nombre, usados) {
        let base = this.generarNombreCorto(nombre);
        if (!base) base = 'V'; // Respaldo si el nombre no tiene caracteres alfanuméricos

        let corto = base;
        let sufijo = 2;
        while (usados.has(corto)) {
            corto = `${base}_${sufijo}`;
            sufijo++;
        }

        usados.add(corto);
        return corto;
    }

    // ========================================
    // GENERACIÓN DE DATOS ALEATORIOS
    // ========================================

    /**
     * Genera la base completa y la devuelve como BaseColumnar (base-columnar.js):
     * una columna = un arreglo tipado. `alProgresar(fraccion, etapa)` es
     * opcional: lo usa el Web Worker para informar a la interfaz.
     */
    generarBaseDatos(alProgresar = null) {
        if (typeof BaseColumnar === 'undefined') {
            throw new Error('Falta base-columnar.js: añade <script src="base-columnar.js"> antes de generador-datos.js en index.html');
        }
        const avisar = (fraccion, etapa) => { if (typeof alProgresar === 'function') alProgresar(fraccion, etapa); };

        // Inicializar la fuente de aleatoriedad (sembrada si hay semilla)
        this.inicializarAleatorio(this.configuracion.semilla);

        // (B7) Medidas repetidas: cada onda T2… es un clon de su escala base con
        // media desplazada, estabilidad como correlación y las mismas diferencias
        // por grupo (más el cambio diferencial). La configuración queda
        // EXPANDIDA para todo lo que sigue (columnas, informe, etiquetas).
        this.configuracion = this._expandirConfiguracion(this.configuracion);

        // Estado de la generación anterior: nada debe sobrevivir (el panel de
        // diagnóstico lee estos campos y no debe mostrar avisos de otra base).
        this.diagnosticoCorrelaciones = null;
        this.correlVariables = [];
        this.correlR = null;
        this.correlRIntermedia = null;
        this.correlL = [];
        this.driversOrtogonalizados = false;
        this.driversEnValor = new Set();
        this.datosGenerados = null;
        avisar(0.02, 'Preparando la configuración');

        // (A1) Diferencias por grupo: traduce la tabla a diferencias efectivas
        // por variable y calcula la DE intra-grupo de cada una. Va ANTES de las
        // correlaciones, que se compensan por la varianza entre grupos.
        this.prepararDiferenciasGrupo();

        // Preparar la estructura de correlación si la hay: tabla III no vacía,
        // relleno intra-test (tests con ≥ 2 dimensiones) o diferencias por
        // grupo en modo exacto. Antes solo se preparaba con la tabla III no
        // vacía, y con ella vacía las dimensiones de un mismo test salían
        // independientes pese al r del cuadro «Pruebas del estudio» (A4).
        const hayCorrelaciones = this._hayEstructuraDeCorrelacion();
        if (hayCorrelaciones) {
            this.prepararCorrelaciones();
            // (B6) el criterio de una moderación lleva forma normal en ambos modos
            (this.modelosModeracion || []).forEach(md => { const v = this.correlVariables[md.iY]; if (v) this.driversEnValor.add(v.tipo + ':' + v.clave); });
        }
        avisar(0.06, 'Estructura de correlación lista');

        // (B5) Perfil de ítems de cada escala (medias, pesos, cargas cruzadas),
        // derivado de la semilla UNA vez: lo usan la calibración de la
        // fiabilidad y la generación, que así reparten igual.
        this.perfilesItems = this._perfilesDeItems();

        const n = this.configuracion.tamanoMuestra;
        const pruebas = this.configuracion.pruebas;
        const socios = this.configuracion.sociodemograficos;
        const grupos = (this.configuracion.gruposPruebas || []).filter(g => g.escalas.length >= 2);
        const discretos = socios.filter(s => this._esSocioDiscreto(s));
        const continuos = socios.filter(s => !this._esSocioDiscreto(s));

        // ---- Columnas, en el orden del CSV: ID, sociodemográficos (orden de la
        // tabla), TODOS los ítems, totales de las dimensiones, generales, y al
        // final el puntaje GENERAL derivado de cada test. Las imperfecciones y
        // los percentiles añaden las suyas después.
        this._comprobarNombresDeColumna();
        const base = new BaseColumnar(n);
        const colID = base.agregar('ID', true);
        for (let i = 0; i < n; i++) colID.datos[i] = i + 1;
        const colSocio = new Map();
        socios.forEach(s => colSocio.set(s.categoria, base.agregar(s.categoria, this._esSocioDiscreto(s))));
        const colItems = new Map();   // prueba → [columnas de sus ítems]
        pruebas.forEach(p => {
            if (p.tipo === 'general') { colItems.set(p, []); return; }
            const likert = p.minimo !== null && p.maximo !== null;
            colItems.set(p, this._itemsDe(p).map(nombre => base.agregar(nombre, likert)));
        });
        const colTotal = new Map();
        pruebas.forEach(p => { if (p.tipo !== 'general') colTotal.set(p, base.agregar(this.columnaDeEscala(p), false)); });
        pruebas.forEach(p => { if (p.tipo === 'general') colTotal.set(p, base.agregar(this.columnaDeEscala(p), false)); });
        const colGeneral = new Map();
        grupos.forEach(g => {
            const dims = g.escalas.map(sigla => base.columna(`Dimension_${sigla}`)).filter(Boolean);
            if (dims.length === g.escalas.length) colGeneral.set(g, { columna: base.agregar(`General_${g.sigla}`, true), dims });
        });

        // PASE 1 — variables DISCRETAS (binaria, categórica, conteo) de todos los
        // participantes: son las que agrupan y no reciben desplazamiento.
        discretos.forEach(s => {
            const col = colSocio.get(s.categoria);
            for (let i = 0; i < n; i++) col.datos[i] = this.generarValorSociodemografico(s, null);
        });
        avisar(0.10, 'Sociodemográficos de agrupación');

        // Matriz de drivers con correlación muestral EXACTA (si procede). En
        // modo exacto los drivers se hacen además ORTOGONALES a los códigos de
        // grupo, así las medias de grupo del driver son exactamente 0 y la d
        // obtenida no fluctúa por el muestreo (igual que la r).
        const exactas = hayCorrelaciones && this.configuracion.correlacionesExactas !== false;
        if (exactas) avisar(0.12, 'Calibrando correlaciones exactas');
        const funcionesValor = exactas ? this._funcionesDeValor(base) : null;
        const matrizDrivers = exactas ? this.generarMatrizDrivers(n, this._matrizCodigosGrupo(base), funcionesValor) : null;
        avisar(0.32, 'Calibrando la fiabilidad');
        // Fiabilidad autocalibrada: una vez por escala (no por participante).
        const indiceFiab = this.configuracion.indiceFiabilidad || 'alfa';
        const objetivoInterno = new Map();
        pruebas.forEach(p => objetivoInterno.set(p, this.calibrarFiabilidad(p, indiceFiab)));
        avisar(0.36, 'Generando participantes');

        // Desplazamientos por grupo de cada variable continua (A1), por
        // participante, leídos de las columnas de agrupación ya generadas.
        // En modo exacto se reutilizan los desplazamientos que dejó calibrados
        // el punto fijo (mismos arreglos que usaron las funciones de valor).
        const despCalibrado = new Map();
        if (funcionesValor) funcionesValor.forEach(f => { if (f.desp && f.nombre) despCalibrado.set(f.nombre, f.desp); });
        const despSocio = new Map();
        continuos.forEach(s => despSocio.set(s, despCalibrado.get(s.categoria) || this._desplazamientosDe(base, s.categoria, this._deEfectiva(s))));
        const despPrueba = new Map();
        pruebas.forEach(p => despPrueba.set(p, despCalibrado.get(p.nombre) || this._desplazamientosDe(base, p.nombre, p.desviacion)));
        const factorDEPrueba = new Map();
        pruebas.forEach(p => factorDEPrueba.set(p, this._factorDE(p.nombre)));

        // PASE 2 — sociodemográficos CONTINUOS y pruebas de cada participante
        const pasoAviso = Math.max(1, Math.floor(n / 25));
        for (let i = 0; i < n; i++) {
            if (i % pasoAviso === 0) avisar(0.36 + 0.50 * (i / n), 'Generando participantes');

            // Valores normales correlacionados (driver) por variable, si aplica
            const drivers = matrizDrivers ? this._driversDeFila(matrizDrivers[i])
                : (hayCorrelaciones ? this.generarVectorCorrelacionado() : {});

            // Continuos: DE intra-grupo y desplazamiento por grupo aplicados al
            // valor continuo, ANTES de recortar y redondear (A1).
            continuos.forEach(socio => {
                const clave = 'socio:' + socio.categoriaCorta;
                const driver = drivers[clave];
                colSocio.get(socio.categoria).datos[i] = this.generarValorSociodemografico(
                    socio, driver !== undefined ? driver : null,
                    despSocio.get(socio)[i],
                    this._factorDE(socio.categoria),
                    !!(this.driversEnValor && this.driversEnValor.has(clave))
                );
            });

            // Pruebas. Primero el TOTAL continuo de todas (las cargas cruzadas
            // de una dimensión necesitan el z de las otras del mismo test) y
            // después el reparto de cada total en ítems.
            const basesPrueba = new Array(pruebas.length), totalesPrueba = new Array(pruebas.length);
            const zDim = {};
            pruebas.forEach((prueba, idx) => {
                const claveEscala = 'escala:' + this._claveEscala(prueba);
                const driverEscala = drivers[claveEscala];
                const formaYaAplicada = !!(this.driversEnValor && this.driversEnValor.has(claveEscala));
                const baseZ = driverEscala !== undefined ? driverEscala : this.generarNormalEstandar();
                const total = this._totalObjetivo(prueba.media, prueba.desviacion * factorDEPrueba.get(prueba), baseZ,
                    formaYaAplicada ? 'normal' : prueba.distribucion, despPrueba.get(prueba)[i]);
                basesPrueba[idx] = baseZ;
                totalesPrueba[idx] = total;
                zDim[this._claveEscala(prueba)] = prueba.desviacion > 0 ? (total - prueba.media) / prueba.desviacion : 0;
            });
            pruebas.forEach((prueba, idx) => {
                const perfil = this.perfilesItems.get(prueba) || null;
                // (B7) las cargas cruzadas de una onda T2… miran a la misma onda de la
                // otra dimensión si existe; si no, a su onda 1
                let zOtras = zDim;
                if (prueba.sufijo && perfil && perfil.cruzadas.length) {
                    zOtras = {};
                    perfil.cruzadas.forEach(c => { zOtras[c.sigla] = zDim[this._siglaOnda(prueba, c.sigla)]; });
                }
                const puntajes = this._repartirEnItems(
                    prueba.numItems,
                    totalesPrueba[idx],
                    prueba.media,
                    prueba.desviacion * factorDEPrueba.get(prueba),
                    prueba.minimo,
                    prueba.maximo,
                    objetivoInterno.has(prueba) ? objetivoInterno.get(prueba) : prueba.alfa,
                    perfil,
                    zOtras,
                    basesPrueba[idx]
                );
                // Ítems (la Escala general es una sola columna de datos: no
                // tiene ítems, solo su Total_)
                const cols = colItems.get(prueba);
                for (let idx = 0; idx < cols.length; idx++) {
                    const puntaje = puntajes.items[idx];
                    // Ítem invertido → se guarda reflejado (respuesta bruta, sin recodificar)
                    cols[idx].datos[i] = this._esInvertido(prueba, idx + 1) ? this._reflejar(prueba, puntaje) : puntaje;
                }
                colTotal.get(prueba).datos[i] = puntajes.total;
            });

            // Las diferencias por grupo ya van dentro de cada total (A1): no hay
            // nada que desplazar después de generar.

            // Puntaje GENERAL del test: promedio de sus dimensiones, redondeado
            // a entero (decisión del dueño). Con una sola dimensión no se emite:
            // sería una copia exacta de esa columna.
            colGeneral.forEach(({ columna, dims }) => {
                let suma = 0;
                for (let k = 0; k < dims.length; k++) suma += dims[k].datos[i];
                columna.datos[i] = Math.round(suma / dims.length);
            });
        }

        // Imperfecciones realistas (si se pidieron), antes de los percentiles.
        avisar(0.88, 'Aplicando imperfecciones realistas');
        this.resumenImperfecciones = this.aplicarImperfecciones(base);

        // PERCENTILES (post-proceso, OPCIONAL): posición relativa (0-100) de cada
        // persona dentro de la muestra generada, para el puntaje directo de cada
        // escala. Rango medio: PC = (inferiores + 0.5·empates) / N · 100.
        if (this.configuracion.generarPercentiles) {
            avisar(0.94, 'Calculando percentiles');
            const columnasPercentil = [];
            // mismo orden que los totales: primero dimensiones, luego generales
            pruebas.forEach(e => { if (e.tipo !== 'general') columnasPercentil.push({ sigla: this._claveEscala(e), col: this.columnaDeEscala(e) }); });
            pruebas.forEach(e => { if (e.tipo === 'general') columnasPercentil.push({ sigla: this._claveEscala(e), col: this.columnaDeEscala(e) }); });
            grupos.forEach(g => { if (base.tiene(`General_${g.sigla}`)) columnasPercentil.push({ sigla: g.sigla, col: `General_${g.sigla}` }); });
            columnasPercentil.forEach(({ sigla, col }) => {
                if (!base.tiene(col)) return;
                const origen = base.columna(col).datos;
                const valores = base.finitos(col).sort();          // orden numérico (arreglo tipado)
                const m = valores.length;
                const destino = base.agregar(`PC_${sigla}`, false).datos;
                for (let i = 0; i < n; i++) {
                    const v = origen[i];
                    if (!(v === v) || m === 0) { destino[i] = NaN; continue; }
                    // búsqueda binaria de límites inferior y superior
                    let lo = 0, hi = m;
                    while (lo < hi) { const mid = (lo + hi) >> 1; if (valores[mid] < v) lo = mid + 1; else hi = mid; }
                    const inferiores = lo;
                    lo = 0; hi = m;
                    while (lo < hi) { const mid = (lo + hi) >> 1; if (valores[mid] <= v) lo = mid + 1; else hi = mid; }
                    const empates = lo - inferiores;
                    destino[i] = Math.round(((inferiores + 0.5 * empates) / m) * 1000) / 10;
                }
            });
        }

        avisar(0.96, 'Base generada');
        this.datosGenerados = base;
        return base;
    }

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
        (cfg.gruposPruebas || []).forEach(g => { if (g.escalas.length >= 2) registrar(`General_${g.sigla}`, `el puntaje general del test «${g.nombre}»`); });
    }

    // Desplazamientos por grupo de una variable para TODOS los participantes
    // (Float64Array), leyendo los códigos de las columnas de agrupación.
    _desplazamientosDe(base, nombre, sigmaTotal) {
        return this._partesDesplazamiento(base, nombre, sigmaTotal).desp;
    }
    // Desplazamientos por grupo de una variable con sus PARTES (una por
    // agrupación): { desp, partes: [{ agrup, d, amplitud, c, codigos }], recalcular }.
    // `amplitud` está en unidades de σ y es ajustable: la calibración exacta la
    // corrige hasta que la d MARGINAL observada sea la pedida (con varias
    // agrupaciones, la correlación muestral entre los códigos confunde las d
    // marginales: con n = 400 y tres agrupaciones, 0.53 salía 0.29 o 0.75).
    _partesDesplazamiento(base, nombre, sigmaTotal) {
        const n = base.n;
        const desp = new Float64Array(n);
        const partes = [];
        const lista = this.diferenciasEfectivas ? this.diferenciasEfectivas.get(nombre) : undefined;
        if (lista && lista.length && sigmaTotal > 0) {
            lista.forEach(e => {
                const codigos = base.columna(e.agrup.categoria).datos;
                const c = new Float64Array(n);
                for (let i = 0; i < n; i++) c[i] = this._codigoCentrado(e.agrup, codigos[i]);
                partes.push({ agrup: e.agrup, d: e.d, amplitud: e.amplitud, c, codigos });
            });
        }
        const recalcular = () => {
            desp.fill(0);
            partes.forEach(p => { const a = p.amplitud * sigmaTotal; for (let i = 0; i < n; i++) desp[i] += a * p.c[i]; });
        };
        recalcular();
        return { desp, partes, recalcular };
    }
    // d marginal observada (pendiente sobre el código / DE agrupada dentro de
    // los grupos de ESA agrupación), como la calcula el informe.
    _dMarginal(valores, codigos) {
        const n = valores.length;
        const porGrupo = new Map();
        for (let i = 0; i < n; i++) { const v = valores[i]; if (!(v === v)) continue; const g = codigos[i]; if (!porGrupo.has(g)) porGrupo.set(g, []); porGrupo.get(g).push(v); }
        if (porGrupo.size < 2) return null;
        let ssIntra = 0, gl = 0;
        porGrupo.forEach(vals => { const mg = vals.reduce((a, b) => a + b, 0) / vals.length; vals.forEach(v => { ssIntra += (v - mg) ** 2; }); gl += vals.length - 1; });
        const deIntra = Math.sqrt(ssIntra / Math.max(1, gl));
        let mc = 0, mv = 0, k = 0;
        for (let i = 0; i < n; i++) { if (valores[i] === valores[i]) { mc += codigos[i]; mv += valores[i]; k++; } }
        mc /= k; mv /= k;
        let sxy = 0, sxx = 0;
        for (let i = 0; i < n; i++) { if (valores[i] === valores[i]) { sxy += (codigos[i] - mc) * (valores[i] - mv); sxx += (codigos[i] - mc) ** 2; } }
        return (sxx > 0 && deIntra > 0) ? (sxy / sxx) / deIntra : null;
    }

    // ============ AUTOCALIBRACIÓN DE LA FIABILIDAD ============
    // El redondeo de los ítems Likert desplaza la fiabilidad OBSERVADA respecto
    // de la pedida (p. ej. 0.70 salía 0.76). Aquí se busca por bisección el
    // valor interno que hace que el índice observado ≈ el objetivo del usuario.
    _indiceObservado(cols, indice) {
        const k = cols.length, n = cols[0].length;
        if (k < 2 || n < 3) return null;
        const media = c => c.reduce((a, b) => a + b, 0) / n;
        const varianza = c => { const m = media(c); return c.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1); };
        const total = new Array(n).fill(0);
        for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) total[i] += cols[j][i];
        const vT = varianza(total);
        if (!(vT > 0)) return null;
        const vars = cols.map(varianza);
        if (indice === 'omega' && k >= 3) {
            // Ejes principales iterados (1 factor) sobre R y métrica de covarianzas:
            // réplica compacta del estimador de fiabilidad.js, para calibrar
            // contra el MISMO número que verá el usuario en el Analizador.
            const des = vars.map(v => Math.sqrt(v) || 1e-9);
            const R = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => {
                const ma = media(cols[a]), mb = media(cols[b]);
                let s = 0;
                for (let i = 0; i < n; i++) s += (cols[a][i] - ma) * (cols[b][i] - mb);
                return (s / (n - 1)) / (des[a] * des[b]);
            }));
            let h2 = R.map((fila, i) => Math.max(...fila.map((r, j) => i === j ? 0 : Math.abs(r))));
            let cargas = null;
            for (let iter = 0; iter < 25; iter++) {
                const Rr = R.map((fila, i) => fila.map((r, j) => i === j ? h2[i] : r));
                let v = new Array(k).fill(1 / Math.sqrt(k)), lam = 0;
                for (let p = 0; p < 40; p++) {
                    const w = Rr.map(fila => fila.reduce((s, r, j) => s + r * v[j], 0));
                    const norma = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
                    if (!(norma > 0)) return null;
                    v = w.map(x => x / norma); lam = norma;
                }
                if (!(lam > 0)) return null;
                const signo = v.reduce((s, x) => s + x, 0) >= 0 ? 1 : -1;
                const nuevas = v.map(x => Math.sqrt(lam) * x * signo);
                const cambio = Math.max(...nuevas.map((c, i) => Math.abs(c * c - h2[i])));
                h2 = nuevas.map(c => Math.min(c * c, 0.999));
                cargas = nuevas;
                if (cambio < 1e-6) break;
            }
            if (!cargas) return null;
            const lCov = cargas.map((l, i) => Math.max(l, 0) * des[i]);
            const thCov = cargas.map((l, i) => (1 - Math.min(l * l, 0.999)) * vars[i]);
            const sl = lCov.reduce((s, x) => s + x, 0);
            const st = thCov.reduce((s, x) => s + x, 0);
            return (sl * sl) / ((sl * sl) + st);
        }
        const sumaVar = vars.reduce((a, b) => a + b, 0);
        return (k / (k - 1)) * (1 - sumaVar / vT);
    }
    _simularIndice(prueba, objetivoInterno, indice, nSim = 400) {
        const k = prueba.numItems;
        const cols = Array.from({ length: k }, () => new Array(nSim));
        // Se simula con la misma DE intra-grupo y el mismo desplazamiento por
        // grupo (códigos sorteados) que tendrá la base: la varianza entre grupos
        // se reparte por igual entre los ítems y sube la fiabilidad observada.
        const deIntra = prueba.desviacion * this._factorDE(prueba.nombre);
        // (B5) Mismo perfil de ítems que tendrá la base; las otras dimensiones
        // (cargas cruzadas) se simulan con su correlación objetivo con esta.
        const perfil = this.perfilesItems ? (this.perfilesItems.get(prueba) || null) : null;
        const zOtras = (perfil && perfil.cruzadas.length) ? this._zOtrasSimuladas(prueba, perfil) : null;
        for (let i = 0; i < nSim; i++) {
            const p = this.generarPuntajesPrueba(k, prueba.media, deIntra, prueba.minimo,
                prueba.maximo, objetivoInterno, null, prueba.distribucion, indice,
                this._desplazamientoAleatorio(prueba.nombre, prueba.desviacion), perfil, zOtras);
            for (let j = 0; j < k; j++) cols[j][i] = p.items[j];
        }
        return this._indiceObservado(cols, indice);
    }
    // Función (base → {sigla: z}) que simula el z de las otras dimensiones de un
    // test a partir del de esta, con la correlación OBJETIVO entre ambas (la de
    // la matriz preparada si existe; si no, el r intra-test del cuadro).
    _zOtrasSimuladas(prueba, perfil) {
        const siglas = [...new Set(perfil.cruzadas.map(c => c.sigla))];
        const rCon = {};
        siglas.forEach(sigla => {
            let r = null;
            if (this.correlR && this.correlVariables && this.correlVariables.length) {
                const ia = this.correlVariables.findIndex(v => v.tipo === 'escala' && v.clave === this._claveEscala(prueba));
                const ib = this.correlVariables.findIndex(v => v.tipo === 'escala' && v.clave === this._siglaOnda(prueba, sigla));
                if (ia >= 0 && ib >= 0) r = this.correlR[ia][ib];
            }
            if (r === null) {
                const g = (this.configuracion.gruposPruebas || []).find(x => x.escalas.includes(prueba.nombreCorto));
                r = g && g.rIntra !== undefined ? g.rIntra : 0.40;
            }
            rCon[sigla] = Math.max(-0.99, Math.min(0.99, r));
        });
        return (base) => {
            const z = {};
            siglas.forEach(sigla => { const r = rCon[sigla]; z[sigla] = r * base + Math.sqrt(1 - r * r) * this.generarNormalEstandar(); });
            return z;
        };
    }
    calibrarFiabilidad(prueba, indice) {
        const objetivo = prueba.alfa;
        if (!(objetivo > 0 && objetivo < 1) || prueba.numItems < 2) return objetivo;
        const perfil = this.perfilesItems ? (this.perfilesItems.get(prueba) || null) : null;
        const continua = (prueba.minimo === null || prueba.maximo === null);
        if (continua && indice !== 'omega') {
            // Sin redondeo, el α del modelo de reparto tiene FÓRMULA CERRADA (ver
            // _alfaTeorica): se resuelve por bisección sobre la fórmula, sin
            // simular. Así la calibración no añade ruido de muestreo, que con
            // totales asimétricos (colas largas) llegaba a ±0.1 en el α observado.
            let lo = 0.01, hi = 0.985;
            for (let it = 0; it < 40; it++) {
                const mid = (lo + hi) / 2;
                if (this._alfaTeorica(prueba, mid, perfil) < objetivo) lo = mid; else hi = mid;
            }
            return (lo + hi) / 2;
        }
        // Likert (redondeo) u ω: se simula. Con forma asimétrica se simulan más
        // casos, porque la varianza muestral de un total con cola larga es ruidosa.
        const nSim = prueba.distribucion === 'asimetrica' ? 1000 : 400;
        let lo = 0.01, hi = 0.985;
        for (let it = 0; it < 12; it++) {
            const mid = (lo + hi) / 2;
            const obs = this._simularIndice(prueba, mid, indice, nSim);
            if (obs === null || !isFinite(obs)) break;
            if (obs < objetivo) lo = mid; else hi = mid;
        }
        return Math.max(0.01, Math.min(0.985, (lo + hi) / 2));
    }
    // Correlación OBJETIVO entre dos escalas del estudio (por sigla): la de la
    // matriz preparada si existe; si no, el r intra-test del cuadro (mismo
    // test) o 0 (tests distintos). Entre una escala y sí misma, 1.
    _rObjetivoEntre(siglaA, siglaB) {
        if (siglaA === siglaB) return 1;
        if (this.correlR && this.correlVariables && this.correlVariables.length) {
            const ia = this.correlVariables.findIndex(v => v.tipo === 'escala' && v.clave === siglaA);
            const ib = this.correlVariables.findIndex(v => v.tipo === 'escala' && v.clave === siglaB);
            if (ia >= 0 && ib >= 0) return this.correlR[ia][ib];
        }
        const g = (this.configuracion.gruposPruebas || []).find(x => x.escalas.includes(siglaA) && x.escalas.includes(siglaB));
        return g ? (g.rIntra === undefined ? 0.40 : g.rIntra) : 0;
    }
    // α de Cronbach TEÓRICO del modelo de reparto (_repartirEnItems) sin redondeo:
    //   ítem_i = μ_i + w_i·D + s·u_i + cruz_i,  D = T − M con Var(D) = σ² (toda la base),
    //   Var(u_i) = (1 − λ²)(1 − 1/k),  cruz_i = σ_ítem·Σ_e a_ie·z_e con a_ie = c_e·(1[ítem_e = i] − 1/k).
    //   α = k/(k−1)·(1 − Σ_i Var(ítem_i)/σ²), con Var(T) = σ² porque Σ ítems = T.
    _alfaTeorica(prueba, objetivoInterno, perfil) {
        const k = prueba.numItems, sigma = prueba.desviacion, sw = sigma * this._factorDE(prueba.nombre);
        let lambda = 0;
        if (objetivoInterno > 0 && objetivoInterno < 1 && k >= 2) {
            const rMedia = objetivoInterno / (k - objetivoInterno * (k - 1));
            lambda = Math.sqrt(Math.max(0, Math.min(0.999, rMedia)));
        }
        const s = sw / Math.sqrt(k * (1 + (k - 1) * lambda * lambda)), u2 = 1 - lambda * lambda;
        const varRuido = s * s * u2 * (1 - 1 / k);
        const sigmaItem = Math.sqrt((sw * sw) / (k * k) + varRuido);
        const cruz = perfil ? perfil.cruzadas : [];
        // correlaciones objetivo entre las dimensiones que aportan cargas cruzadas, y con esta
        const rAB = cruz.map(e => this._rObjetivoEntre(this._claveEscala(prueba), this._siglaOnda(prueba, e.sigla)));
        const rBB = cruz.map(e => cruz.map(f => this._rObjetivoEntre(e.sigla, f.sigla)));
        let sumaVar = 0;
        for (let i = 0; i < k; i++) {
            const w = perfil ? perfil.peso[i] : 1 / k;
            let varCruz = 0, covCruzD = 0;
            if (cruz.length) {
                const a = cruz.map(e => e.c * ((e.item === i ? 1 : 0) - 1 / k));
                for (let e = 0; e < cruz.length; e++) {
                    covCruzD += a[e] * rAB[e];
                    for (let f = 0; f < cruz.length; f++) varCruz += a[e] * a[f] * rBB[e][f];
                }
            }
            sumaVar += w * w * sigma * sigma + varRuido + sigmaItem * sigmaItem * varCruz + 2 * w * sigma * sigmaItem * covCruzD;
        }
        return (k / (k - 1)) * (1 - sumaVar / (sigma * sigma));
    }

    generarPuntajesPrueba(numItems, mediaTotal, desviacionTotal, minItem = null, maxItem = null, alfaObjetivo = 0, factor = null, distribucion = 'normal', indiceFiabilidad = 'alfa', desplazamiento = 0, perfil = null, zOtras = null) {
        // ENFOQUE "TOTAL AUTORITATIVO":
        // El puntaje TOTAL es la cantidad que importa para los análisis (es lo
        // que se correlaciona y se somete a la prueba de normalidad), así que se
        // genera DIRECTAMENTE con la forma elegida y con la Media (M) y la DE
        // exactas. Los ítems se derivan luego del total. Así:
        //   · "normal" produce un total realmente normal en cualquier configuración;
        //   · el selector de forma (uniforme/asimétrica) controla DE VERDAD la
        //     forma del total (sin que el teorema del límite central lo borre);
        //   · la correlación objetivo entre escalas funciona aunque α = 0
        //     (el total se gobierna por el "driver" correlacionado).
        // (1) TOTAL autoritativo con la forma pedida. Si llega un driver de
        // correlación se usa como base estandarizada; si no, una normal nueva.
        const base = factor !== null ? factor : this.generarNormalEstandar();
        // El desplazamiento por grupo (A1) entra aquí, en el total CONTINUO:
        // el reparto entero en ítems ya lo incorpora y el redondeo por persona
        // se promedia en vez de acumularse como sesgo.
        const totalObjetivo = this._totalObjetivo(mediaTotal, desviacionTotal, base, distribucion, desplazamiento);
        // (2) Reparto del total en ítems (indiceFiabilidad se conserva por
        // compatibilidad de la firma: el modelo congenérico del modo ω vive ahora
        // en el perfil de ítems, ver _perfilesDeItems).
        return this._repartirEnItems(numItems, totalObjetivo, mediaTotal, desviacionTotal, minItem, maxItem, alfaObjetivo, perfil, zOtras, base);
    }

    /**
     * Reparte un total ya generado en k ítems. Modelo (B5):
     *     ítem_i = M/k + δ_i + w_i·(T − M) + ruido_i + cruz_i
     *  · δ_i: desplazamiento de la media del ítem (Σδ = 0)  → ítems «fáciles/difíciles»;
     *  · w_i: peso del ítem en el total (Σw = 1)            → cargas desiguales;
     *  · ruido_i: desviaciones centradas (Σ = 0) cuya escala gobierna la
     *    fiabilidad (λ se calibra para que α/ω observado sea el pedido);
     *  · cruz_i: carga cruzada desde otra dimensión del mismo test, centrada
     *    (Σ = 0) para que el total no cambie.
     * Con perfil nulo (o de nivel «ninguna») los ítems son paralelos: δ = 0 y
     * w = 1/k, como antes. La suma de los ítems es SIEMPRE el total.
     */
    _repartirEnItems(numItems, totalObjetivo, mediaTotal, desviacionTotal, minItem, maxItem, alfaObjetivo, perfil, zOtras, base) {
        const k = numItems;
        const modoLikert = (minItem !== null && maxItem !== null);

        // Estructura inter-ítem para que el α de Cronbach observado se acerque al
        // objetivo: λ es la carga factorial (Spearman-Brown invertida); su único
        // efecto es fijar la escala del ruido de ítem (a mayor λ, menos ruido).
        let lambda = 0;
        if (alfaObjetivo > 0 && alfaObjetivo < 1 && k >= 2) {
            const rMedia = alfaObjetivo / (k - alfaObjetivo * (k - 1));
            lambda = Math.sqrt(Math.max(0, Math.min(0.999, rMedia)));
        }
        const desviacionPorItem = desviacionTotal / Math.sqrt(k * (1 + (k - 1) * lambda * lambda));
        const unicidad = Math.sqrt(1 - lambda * lambda);

        // Desviaciones de ítem centradas a suma 0: ruido idiosincrático. (Un
        // factor común sumado por igual a todos los ítems se cancela al centrar,
        // así que no se genera.) No afectan al nivel del total.
        const g = new Array(k);
        let gSuma = 0;
        for (let i = 0; i < k; i++) { g[i] = unicidad * this.generarNormalEstandar(); gSuma += g[i]; }
        const gMedia = gSuma / k;

        // Perfil de ítems (B5)
        const delta = perfil ? perfil.delta : null;
        const peso = perfil ? perfil.peso : null;
        let cruz = null;
        if (perfil && perfil.cruzadas.length && zOtras) {
            const z = typeof zOtras === 'function' ? zOtras(base) : zOtras;
            // DE del ítem sin el término cruzado: la carga cruzada c se expresa en
            // unidades estandarizadas del ítem (≈ carga secundaria c en el AFE).
            const sigmaItem = Math.sqrt((desviacionTotal * desviacionTotal) / (k * k) + desviacionPorItem * desviacionPorItem * unicidad * unicidad * (1 - 1 / k));
            cruz = new Float64Array(k);
            let suma = 0;
            perfil.cruzadas.forEach(({ item, sigla, c }) => {
                const zb = z[sigla];
                if (typeof zb === 'number' && isFinite(zb)) { cruz[item] += c * sigmaItem * zb; suma += c * sigmaItem * zb; }
            });
            const media = suma / k;
            for (let i = 0; i < k; i++) cruz[i] -= media;    // suma 0: el total no cambia
        }
        const mediaItem = mediaTotal / k, desvioTotal = totalObjetivo - mediaTotal;
        const cuota = i => mediaItem + (delta ? delta[i] : 0) + (peso ? peso[i] : 1 / k) * desvioTotal;

        if (!modoLikert) {
            // MEDIDA CONTINUA: ítem = cuota + desviación centrada → la suma es
            // EXACTAMENTE el total objetivo (forma y M/DE intactas). 2 decimales.
            const items = new Array(k);
            for (let i = 0; i < k; i++) {
                items[i] = Math.round((cuota(i) + desviacionPorItem * (g[i] - gMedia) + (cruz ? cruz[i] : 0)) * 100) / 100;
            }
            const total = Math.round(items.reduce((a, b) => a + b, 0) * 100) / 100;
            return { items: items, total: total, factorUtilizado: base };
        }

        // ESCALA LIKERT (rango fijado): el total se acota al rango ALCANZABLE
        // [k·mín, k·máx] (solo afecta a la cola extrema, poco frecuente) y se
        // reparte en ítems ENTEROS dentro de [mín, máx]. El grueso del total
        // conserva la forma normal.
        const totalEntero = this._totalEnteroLikert(k, minItem, maxItem, totalObjetivo);

        // Dispersión por ítem: nunca por debajo de ~media unidad Likert, para que
        // los ítems SIEMPRE varíen (evita que un total entero exacto colapse en
        // ítems idénticos). No afecta al total: la suma se reajusta luego al total
        // autoritativo, así que esta dispersión solo reparte los ítems alrededor
        // de su media (su efecto es sobre el α de Cronbach observado, no sobre M/DE).
        const dispersionItem = Math.max(desviacionPorItem, 0.6);
        const items = new Array(k);
        for (let i = 0; i < k; i++) {
            let v = Math.round(cuota(i) + dispersionItem * (g[i] - gMedia) + (cruz ? cruz[i] : 0));
            v = Math.max(minItem, Math.min(maxItem, v));
            items[i] = v;
        }
        // ...y se ajusta la suma exactamente al total autoritativo moviendo ±1 en
        // ítems que sigan dentro del rango (preserva el total normal observado).
        let diff = totalEntero - items.reduce((a, b) => a + b, 0);
        let guard = 0;
        const limite = k * (maxItem - minItem) + k * 4 + 50;
        while (diff !== 0 && guard < limite) {
            const idx = Math.floor(this.aleatorio() * k);
            const paso = diff > 0 ? 1 : -1;
            const nuevo = items[idx] + paso;
            if (nuevo >= minItem && nuevo <= maxItem) { items[idx] = nuevo; diff -= paso; }
            guard++;
        }
        const total = items.reduce((a, b) => a + b, 0);
        return { items: items, total: total, factorUtilizado: base };
    }

    // ============ PERFILES DE ÍTEMS (B5) ============
    // Un perfil por escala, derivado de la semilla: {delta, peso, cruzadas}.
    //  · delta[i] (Σ = 0): medias de ítem en escalera dentro del espacio libre
    //    (Likert) o de una DE de ítem (continua), barajadas;
    //  · peso[i] (Σ = 1): 1 ± cargas en escalera, barajados y normalizados;
    //  · cruzadas: [{item, sigla, c}] para una proporción de los ítems, cada uno
    //    con OTRA dimensión del mismo test elegida al azar.
    _perfilesDeItems() {
        const cfg = this.configuracion;
        const nivel = PERFILES_HETEROGENEIDAD[cfg.heterogeneidadItems] || PERFILES_HETEROGENEIDAD.ninguna;
        const indice = cfg.indiceFiabilidad || 'alfa';
        const grupos = cfg.gruposPruebas || [];
        const perfiles = new Map();
        (cfg.pruebas || []).forEach(p => {
            // (B7) una onda T2… usa el MISMO instrumento: mismo perfil que su base
            if (p.base && perfiles.has(p.base)) { perfiles.set(p, perfiles.get(p.base)); return; }
            const k = p.numItems;
            const perfil = { delta: new Float64Array(k), peso: new Float64Array(k).fill(k > 0 ? 1 / k : 0), cruzadas: [] };
            if (k >= 2) {
                const escalera = i => 2 * i / (k - 1) - 1;                 // −1 … +1, Σ = 0
                // Medias: espacio libre hasta el tope más cercano (Likert) o una DE de ítem (continua)
                const likert = p.minimo !== null && p.maximo !== null;
                const mediaItem = p.media / k;
                const espacio = likert ? Math.max(0, Math.min(mediaItem - p.minimo, p.maximo - mediaItem)) : p.desviacion / Math.sqrt(k);
                if (nivel.medias > 0 && espacio > 0) {
                    const orden = this._muestraSinReemplazo(k, k);
                    for (let i = 0; i < k; i++) perfil.delta[i] = nivel.medias * espacio * escalera(orden[i]);
                }
                // Cargas: en modo ω sin heterogeneidad se conserva el modelo congenérico de siempre (0.45)
                const dispersion = Math.min(0.9, nivel.cargas > 0 ? nivel.cargas : ((indice === 'omega' && k >= 3) ? 0.45 : 0));
                if (dispersion > 0) {
                    const orden = this._muestraSinReemplazo(k, k);
                    let suma = 0;
                    for (let i = 0; i < k; i++) { perfil.peso[i] = 1 + dispersion * escalera(orden[i]); suma += perfil.peso[i]; }
                    for (let i = 0; i < k; i++) perfil.peso[i] /= suma;
                }
                // Cargas cruzadas: solo si el test tiene otra dimensión
                const g = grupos.find(x => x.escalas.includes(p.nombreCorto));
                const otras = g ? g.escalas.filter(s => s !== p.nombreCorto) : [];
                if (nivel.cruzadas > 0 && otras.length) {
                    const m = Math.max(1, Math.round(nivel.proporcionCruzadas * k));
                    const elegidos = this._muestraSinReemplazo(k, Math.min(m, k));
                    elegidos.forEach(item => perfil.cruzadas.push({ item, sigla: otras[Math.floor(this.aleatorio() * otras.length)], c: nivel.cruzadas }));
                }
            }
            perfiles.set(p, perfil);
        });
        return perfiles;
    }

    // Valor normal estándar N(0,1) por el método de Box-Muller.
    generarNormalEstandar() {
        let u1 = this.aleatorio();
        let u2 = this.aleatorio();
        while (u1 === 0) u1 = this.aleatorio(); // Evitar log(0)
        return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    }

    // Función de error (Abramowitz & Stegun 7.1.26), error < 1.5e-7.
    erf(x) {
        const signo = x < 0 ? -1 : 1;
        x = Math.abs(x);
        const t = 1 / (1 + 0.3275911 * x);
        const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
        return signo * y;
    }

    // CDF de la normal estándar Φ(z).
    normalCDF(z) {
        return 0.5 * (1 + this.erf(z / Math.SQRT2));
    }

    // Transforma un z ~ N(0,1) en otra forma de distribución, devolviendo SIEMPRE
    // un valor estandarizado (media 0, varianza 1). Así el puntaje total conserva
    // la Media (M) y la DE objetivo, cambiando solo la FORMA de la distribución.
    // Es monótona, de modo que la estructura de correlación (factor latente F y
    // correlaciones objetivo) se preserva por orden de rango.
    transformarFormaZ(z, distribucion) {
        switch (distribucion) {
            case 'uniforme': {
                // z normal -> uniforme(0,1) por la CDF -> uniforme estandarizada.
                // U(0,1) tiene media 0.5 y varianza 1/12.
                const u = this.normalCDF(z);
                return (u - 0.5) * Math.sqrt(12);
            }
            case 'asimetrica': {
                // Log-normal estandarizada (sesgo positivo). sigma controla el sesgo.
                const sigma = SIGMA_FORMA_ASIMETRICA;
                const x = Math.exp(sigma * z);
                const mediaX = Math.exp((sigma * sigma) / 2);
                const varX = (Math.exp(sigma * sigma) - 1) * Math.exp(sigma * sigma);
                return (x - mediaX) / Math.sqrt(varX);
            }
            case 'normal':
            default:
                return z; // Identidad: comportamiento original intacto.
        }
    }

    generarValorNormal(media, desviacion, z = null) {
        // z permite inyectar un valor normal estándar "driver" (correlaciones).
        const normal = z !== null ? z : this.generarNormalEstandar();
        return media + desviacion * normal;
    }

    // Valor uniforme continuo en [min, max].
    generarUniforme(min, max) {
        return min + this.aleatorio() * (max - min);
    }

    // Valor log-normal (asimetría positiva) calibrado para que su media y su
    // desviación estándar sean aproximadamente las pedidas. Requiere media > 0.
    generarAsimetrico(media, desviacion, z = null) {
        const m = Math.max(1e-6, media);
        const sigma2 = Math.log(1 + (desviacion * desviacion) / (m * m));
        const sigma = Math.sqrt(sigma2);
        const mu = Math.log(m) - sigma2 / 2;
        const normal = z !== null ? z : this.generarNormalEstandar();
        return Math.exp(mu + sigma * normal);
    }

    // Valor de una distribución de Poisson con media lambda (algoritmo de Knuth).
    generarPoisson(lambda) {
        if (lambda <= 0) return 0;
        const limite = Math.exp(-lambda);
        let k = 0;
        let producto = 1;
        do {
            k++;
            producto *= this.aleatorio();
        } while (producto > limite);
        return k - 1;
    }

    // Valor binario (Bernoulli): 1 con probabilidad `proporcion`, 0 si no.
    generarBinaria(proporcion) {
        return this.aleatorio() < proporcion ? 1 : 0;
    }

    // Categoría entera equiprobable en [min, max].
    generarCategoria(min, max) {
        const k = Math.floor(max - min + 1);
        return min + Math.floor(this.aleatorio() * k);
    }

    // Genera un valor para una variable sociodemográfica según su distribución.
    // `normalEstandar` permite inyectar un valor normal "driver" (correlaciones)
    // en las distribuciones normal y asimétrica.
    generarValorSociodemografico(socio, normalEstandar = null, desplazamiento = 0, factorDE = 1, formaAplicada = false) {
        const dist = socio.distribucion || 'normal';

        // Tipos discretos → enteros (sin redondeo decimal)
        if (dist === 'categorica') {
            return this.generarCategoria(socio.minimo, socio.maximo);
        }
        if (dist === 'binaria') {
            return this.generarBinaria(socio.promedio);
        }
        if (dist === 'conteo') {
            return this.generarPoisson(socio.promedio);
        }

        // Tipos continuos → clamp al rango + redondeo según decimales
        return this._valorContinuoSocio(socio, normalEstandar, desplazamiento, factorDE, formaAplicada);
    }

    // ============ FUNCIONES DE VALOR (fuente única) ============
    // Cómo se convierte un driver normal z en el valor FINAL de una variable.
    // Las usan la generación y la calibración de correlaciones exactas, que
    // mide las correlaciones sobre estos mismos valores: si cambia una, cambia
    // en los dos sitios a la vez.

    // Total CONTINUO objetivo de una escala: Media + DE·forma(z) + desplazamiento.
    _totalObjetivo(mediaTotal, desviacionTotal, base, distribucion, desplazamiento) {
        return mediaTotal + desviacionTotal * this.transformarFormaZ(base, distribucion) + desplazamiento;
    }
    // Total ENTERO de una escala Likert: recorte al rango alcanzable [k·mín, k·máx]
    // (solo afecta a la cola extrema) y redondeo.
    _totalEnteroLikert(k, minItem, maxItem, totalObjetivo) {
        return Math.round(Math.max(k * minItem, Math.min(k * maxItem, totalObjetivo)));
    }
    // Total FINAL de una escala a partir de su driver (Likert → entero acotado).
    _totalDesdeDriver(prueba, z, desplazamiento, factorDE, formaAplicada = false) {
        const t = this._totalObjetivo(prueba.media, prueba.desviacion * factorDE, z, formaAplicada ? 'normal' : prueba.distribucion, desplazamiento);
        return (prueba.minimo !== null && prueba.maximo !== null) ? this._totalEnteroLikert(prueba.numItems, prueba.minimo, prueba.maximo, t) : t;
    }
    // Valor FINAL de un sociodemográfico continuo (normal, asimétrico, uniforme):
    // driver → valor + desplazamiento por grupo (A1, antes de recortar y
    // redondear: redondear después sesgaba la d) → recorte → decimales.
    _valorContinuoSocio(socio, normalEstandar, desplazamiento = 0, factorDE = 1, formaAplicada = false) {
        const dist = formaAplicada ? 'normal' : (socio.distribucion || 'normal');
        let valor;
        if (dist === 'uniforme') {
            valor = this.generarUniforme(socio.minimo, socio.maximo);
        } else if (dist === 'asimetrica') {
            valor = this.generarAsimetrico(socio.promedio, socio.desviacion * factorDE, normalEstandar);
        } else {
            valor = this.generarValorNormal(socio.promedio, socio.desviacion * factorDE, normalEstandar);
        }
        valor += desplazamiento;
        if (socio.minimo !== null && socio.maximo !== null) {
            valor = Math.max(socio.minimo, Math.min(socio.maximo, valor));
        }
        const factor = Math.pow(10, socio.decimales);
        return Math.round(valor * factor) / factor;
    }

    // ========================================
    // CORRELACIONES OBJETIVO (CHOLESKY)
    // ========================================

    // Descomposición de Cholesky (L·Lᵀ = A) de una matriz simétrica. Si la
    // matriz no es definida positiva (correlaciones inconsistentes), los
    // elementos diagonales se acotan a un mínimo para no producir NaN.
    descomposicionCholesky(A) {
        const n = A.length;
        const L = Array.from({ length: n }, () => new Array(n).fill(0));
        let noDefinidaPositiva = false;

        for (let i = 0; i < n; i++) {
            for (let j = 0; j <= i; j++) {
                let suma = 0;
                for (let k = 0; k < j; k++) suma += L[i][k] * L[j][k];

                if (i === j) {
                    const d = A[i][i] - suma;
                    if (d <= 0) noDefinidaPositiva = true;
                    if (d < 1e-9) this.matrizForzada = true;   // pedido imposible: se fuerza
                    L[i][j] = Math.sqrt(Math.max(d, 1e-9));
                } else {
                    L[i][j] = (A[i][j] - suma) / (L[j][j] || 1e-9);
                }
            }
        }

        this.matrizNoDefinidaPositiva = noDefinidaPositiva;
        return L;
    }

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
    }

    // ============ AUTOTEST INTERNO ============
    // Verificación en segundos, sin tocar la interfaz. Desde la consola:
    //     GeneradorDatos.autotest()
    // Cada línea comprueba una propiedad que se rompió alguna vez y ya no debe
    // romperse: correlaciones exactas, fiabilidad autocalibrada, General derivado,
    // relleno intra-test, reparto sobre el General, matrices imposibles,
    // ítems invertidos, valores perdidos y exportación limpia.
    static autotest(opciones = {}) {
        const n = opciones.n || 300, res = [];
        const ok = (nombre, cond, detalle = '') => { res.push({ nombre, ok: !!cond, detalle }); };
        const esNum = v => typeof v === 'number' && isFinite(v);
        const corr = (x, y) => { const pares = x.map((v, i) => [v, y[i]]).filter(q => esNum(q[0]) && esNum(q[1])); const a = pares.map(q => q[0]), b = pares.map(q => q[1]);
            const m = a.length, ma = a.reduce((s, v) => s + v, 0) / m, mb = b.reduce((s, v) => s + v, 0) / m; let sab = 0, saa = 0, sbb = 0;
            for (let i = 0; i < m; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; } return sab / Math.sqrt(saa * sbb); };
        const escala = (nombre, corto, prueba, k, media, de, alfa, extra = {}) => ({ nombre, nombreCorto: corto, prueba, tipo: 'dimension', numItems: k, media, desviacion: de, minimo: 1, maximo: 5, alfa, distribucion: 'normal', invertidos: 0, ...extra });
        const cfgBase = (extra = {}) => ({ tamanoMuestra: n, semilla: 2026, generarPercentiles: true, correlacionesExactas: true, indiceFiabilidad: 'alfa',
            variablesPorTest: { 'EQ-i': { variable: 'Inteligencia emocional', rIntra: 0.40 } },
            pruebas: [escala('Percepción', 'PE', 'EQ-i', 8, 24, 4, 0.80), escala('Comprensión', 'CE', 'EQ-i', 8, 24, 4, 0.85), escala('Regulación', 'RE', 'EQ-i', 8, 24, 4, 0.75),
                      escala('Estrés', 'ST', 'PSS', 10, 20, 6, 0.80, { minimo: 0, maximo: 4 })],
            sociodemograficos: [{ categoria: 'Edad', categoriaCorta: 'Edad', distribucion: 'normal', promedio: 16, desviacion: 1.5, minimo: 12, maximo: 20, decimales: 0 }],
            correlaciones: [], diferenciasGrupo: [], gruposPruebas: [], realismo: { pctPerdidos: 0, pctDescuidados: 0, pctDigitacion: 0 }, ...extra });
        const generar = cfg => { const g = new GeneradorDatos(); g.configuracion = JSON.parse(JSON.stringify(cfg)); g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas); return { g, d: g.generarBaseDatos().aObjetos() }; };
        const col = (d, k) => d.map(x => x[k]);
        try {
            // 1-2) correlación exacta + fiabilidad calibrada
            const { g: g1, d: d1 } = generar(cfgBase({ correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.40 }, { a: 'Inteligencia emocional — EQ-i', b: 'Estrés', r: -0.30 }] }));
            const rPE = corr(col(d1, 'Dimension_PE'), col(d1, 'Dimension_ST'));
            ok('correlación exacta pedida −0.40', Math.abs(rPE + 0.40) < 0.012, rPE.toFixed(3));
            const gCol = Object.keys(d1[0]).find(k => k.startsWith('General_'));
            const rG = corr(col(d1, gCol), col(d1, 'Dimension_ST'));
            ok('correlación sobre el General derivado −0.30', Math.abs(rG + 0.30) < 0.02, rG.toFixed(3));
            const rIn = corr(col(d1, 'Dimension_CE'), col(d1, 'Dimension_RE'));
            ok('relleno intra-test 0.40', Math.abs(rIn - 0.40) < 0.02, rIn.toFixed(3));
            const inf = g1.informePedidoObtenido(d1);
            const fiab = inf.filter(f => f.tipo === 'α');
            ok('fiabilidad autocalibrada (α) dentro de ±0.04 (≈2 EE)', fiab.length >= 3 && fiab.every(f => f.ok), fiab.map(f => `${f.pedido}→${f.obtenido}`).join(' '));
            ok('General = promedio ENTERO de las dimensiones', d1.every(x => !esNum(x[gCol]) || x[gCol] === Math.round((x.Dimension_PE + x.Dimension_CE + x.Dimension_RE) / 3)));
            // 3) matriz imposible detectada y corregida
            const { g: g2 } = generar(cfgBase({ correlaciones: [{ a: 'Percepción', b: 'Comprensión', r: 0.95 }, { a: 'Comprensión', b: 'Regulación', r: 0.95 }, { a: 'Percepción', b: 'Regulación', r: -0.90 }] }));
            ok('matriz imposible detectada, con tríada y matriz válida', g2.diagnosticoCorrelaciones.imposible && g2.diagnosticoCorrelaciones.triadas.length === 1 && g2._esDefinidaPositiva(g2.diagnosticoCorrelaciones.R));
            // 4) ítems invertidos: reflejados en bruto, total correcto tras recodificar
            const cfgInv = cfgBase(); cfgInv.pruebas[0].invertidos = 3; cfgInv.pruebas[0].media = 30;   // media de ítem 3.75: la reflexión desplaza la suma
            const { g: g3, d: d3 } = generar(cfgInv);
            const p0 = g3.configuracion.pruebas[0];
            const sumaRecod = x => { let s = 0; for (let j = 1; j <= 8; j++) s += g3._recodificar(p0, j, x[`PE${j}`]); return s; };
            ok('ítems invertidos: total = suma de ítems RECODIFICADOS', d3.every(x => Math.abs(sumaRecod(x) - x.Dimension_PE) < 0.01));
            const sumaBruta = x => { let s = 0; for (let j = 1; j <= 8; j++) s += x[`PE${j}`]; return s; };
            ok('ítems invertidos: la suma BRUTA no coincide (hay que recodificar)', d3.filter(x => Math.abs(sumaBruta(x) - x.Dimension_PE) > 0.5).length > d3.length * 0.8);
            const rInv = corr(col(d3, 'PE1'), col(d3, 'PE8'));
            ok('ítem invertido correlaciona NEGATIVO en bruto con uno directo', rInv < -0.05, rInv.toFixed(3));
            // 5) valores perdidos: regla del 80 % y exportación limpia
            const { g: g4, d: d4 } = generar(cfgBase({ realismo: { pctPerdidos: 8, mecanismoPerdidos: 'MCAR', pctDescuidados: 0, pctDigitacion: 0 } }));
            const faltan = x => { let f = 0; for (let j = 1; j <= 8; j++) if (!esNum(x[`PE${j}`])) f++; return f; };
            ok('regla del 80 %: total vacío solo si faltan >20 % de los ítems', d4.every(x => (faltan(x) >= 2) === !esNum(x.Dimension_PE)));
            ok('exportación: perdidos como celda vacía, nunca NaN', !/NaN/.test(g4.exportarCSV(',')));
            ok('exportación en formato español (;): perdidos vacíos, decimales con coma', !/NaN/.test(g4.exportarCSV(';')) && /;\d+,\d/.test(g4.exportarCSV(';')));
            ok('percentil vacío cuando el total falta', d4.filter(x => !esNum(x.Dimension_PE)).every(x => !esNum(x.PC_PE)));
            // 6) (A1) d por grupo sin sesgo de redondeo, con Media y DE totales intactas
            const cfgDif = cfgBase({ sociodemograficos: [{ categoria: 'Sexo', categoriaCorta: 'Sexo', distribucion: 'binaria', promedio: 0.5, desviacion: 0, minimo: null, maximo: null, decimales: 0 }],
                diferenciasGrupo: [{ cuantitativa: 'Estrés', agrupacion: 'Sexo', d: 0.8 }] });
            const { g: g5, d: d5 } = generar(cfgDif);
            const inf5 = g5.informePedidoObtenido(d5);
            const fd = inf5.find(f => f.tipo === 'd'), fDE = inf5.find(f => f.tipo === 'DE' && f.variable === 'Estrés');
            ok('(A1) d por grupo pedida 0.8 → obtenida', !!fd && Math.abs(parseFloat(fd.obtenido) - 0.8) <= 0.06, fd && fd.obtenido);
            ok('(A1) DE total de la escala con diferencias sigue siendo la pedida', !!fDE && Math.abs(parseFloat(fDE.obtenido) - 6) <= 0.3, fDE && fDE.obtenido);
            // 7) (A2) correlación exacta con forma asimétrica
            const cfgAs = cfgBase({ correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.40 }] });
            cfgAs.pruebas[0].distribucion = 'asimetrica'; cfgAs.pruebas[3].distribucion = 'asimetrica';
            const { d: d6 } = generar(cfgAs);
            const rAs = corr(col(d6, 'Dimension_PE'), col(d6, 'Dimension_ST'));
            ok('(A2) r −0.40 exacta entre dos escalas asimétricas', Math.abs(rAs + 0.40) < 0.02, rAs.toFixed(3));
            // 8) (A4) relleno intra-test con la tabla III vacía
            const { d: d7 } = generar(cfgBase({ correlaciones: [] }));
            const rIntraVacia = corr(col(d7, 'Dimension_CE'), col(d7, 'Dimension_RE'));
            ok('(A4) relleno intra-test 0.40 sin tabla III', Math.abs(rIntraVacia - 0.40) < 0.02, rIntraVacia.toFixed(3));
            // 10) sociodemográfico cuyo nombre corto NO coincide con su nombre: la columna
            //     se llama como la categoría; el informe (r, d) y el MAR deben encontrarla
            const cfgSoc = cfgBase({ sociodemograficos: [{ categoria: 'Edad del participante', categoriaCorta: 'EDP', distribucion: 'normal', promedio: 16, desviacion: 1.5, minimo: 12, maximo: 20, decimales: 0 },
                { categoria: 'Sexo del participante', categoriaCorta: 'SDP', distribucion: 'binaria', promedio: 0.5, desviacion: 0, minimo: null, maximo: null, decimales: 0 }],
                correlaciones: [{ a: 'Edad del participante', b: 'Estrés', r: 0.30 }], diferenciasGrupo: [{ cuantitativa: 'Edad del participante', agrupacion: 'Sexo del participante', d: 0.5 }],
                realismo: { pctPerdidos: 10, mecanismoPerdidos: 'MAR', pctDescuidados: 0, pctDigitacion: 0 } });
            const { g9, d9 } = (() => { const r = generar(cfgSoc); return { g9: r.g, d9: r.d }; })();
            const inf9 = g9.informePedidoObtenido(d9);
            ok('informe: r con sociodemográfico de nombre largo aparece y se cumple', inf9.some(f => f.tipo === 'r' && f.variable.startsWith('Edad del participante') && f.ok), (inf9.find(f => f.tipo === 'r') || {}).obtenido);
            ok('informe: d con sociodemográfico de nombre largo aparece', inf9.some(f => f.tipo === 'd' && f.variable === 'Edad del participante por Sexo del participante'));
            const faltanPE = x => { let f = 0; for (let j = 1; j <= 8; j++) if (!esNum(x[`PE${j}`])) f++; return f; };
            const ordenados = d9.slice().sort((a, b) => a['Edad del participante'] - b['Edad del participante']);
            const mitad = ordenados.length >> 1;
            const bajos = ordenados.slice(0, mitad).reduce((s, x) => s + faltanPE(x), 0), altos = ordenados.slice(mitad).reduce((s, x) => s + faltanPE(x), 0);
            ok('MAR: los perdidos se concentran en quienes puntúan bajo en la referencia', bajos > altos * 1.3, `${bajos} vs ${altos}`);
            // 11) correlación de un General con una de sus propias dimensiones (parte–todo):
            //     si no es alcanzable se avisa con la implicada; si lo es, se cumple
            const { g: g10, d: d10 } = generar(cfgBase({ correlaciones: [{ a: 'Inteligencia emocional — EQ-i', b: 'Percepción', r: 0.10 }] }));
            const lim10 = (g10.diagnosticoCorrelaciones.limitadas || []).find(l => l.a === 'Inteligencia emocional — EQ-i');
            const r10 = g10.informePedidoObtenido(d10).find(f => f.tipo === 'r');
            ok('General ↔ propia dimensión inalcanzable → aviso con el valor implicado (= el medido)', !!lim10 && !!r10 && Math.abs(lim10.alcanzable - parseFloat(r10.obtenido)) < 0.03, lim10 && r10 && `${lim10.alcanzable.toFixed(3)} vs ${r10.obtenido}`);
            const { g: g11, d: d11 } = generar(cfgBase({ correlaciones: [{ a: 'Inteligencia emocional — EQ-i', b: 'Percepción', r: 0.80 }] }));
            const r11 = g11.informePedidoObtenido(d11).find(f => f.tipo === 'r');
            ok('General ↔ propia dimensión alcanzable → se cumple', !!r11 && r11.ok, r11 && r11.obtenido);
            // 12) d sobre el General y d explícita sobre una de sus dimensiones, misma agrupación
            const cfg12 = cfgBase({ sociodemograficos: [{ categoria: 'Sexo', categoriaCorta: 'Sexo', distribucion: 'binaria', promedio: 0.5, desviacion: 0, minimo: null, maximo: null, decimales: 0 }],
                diferenciasGrupo: [{ cuantitativa: 'Inteligencia emocional — EQ-i', agrupacion: 'Sexo', d: -0.6 }, { cuantitativa: 'Percepción', agrupacion: 'Sexo', d: 0.5 }] });
            const { g: g12, d: d12 } = generar(cfg12);
            const dd12 = g12.informePedidoObtenido(d12).filter(f => f.tipo === 'd');
            ok('d del General y d de su dimensión, misma agrupación, ambas cumplidas', dd12.length === 2 && dd12.every(f => f.ok), dd12.map(f => `${f.pedido}→${f.obtenido}`).join(' '));
            // 13) d exacta también con forma asimétrica (driver en espacio de valor)
            const cfg13 = cfgBase({ sociodemograficos: [{ categoria: 'Sexo', categoriaCorta: 'Sexo', distribucion: 'binaria', promedio: 0.5, desviacion: 0, minimo: null, maximo: null, decimales: 0 }],
                correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.40 }], diferenciasGrupo: [{ cuantitativa: 'Percepción', agrupacion: 'Sexo', d: -1.1 }] });
            cfg13.pruebas[0].distribucion = 'asimetrica';   // continua: sin recorte Likert (el recorte atenúa la DE y con ella la d; limitación conocida)
            const { g: g13, d: d13 } = generar(cfg13);
            const inf13 = g13.informePedidoObtenido(d13);
            const d13d = inf13.find(f => f.tipo === 'd'), r13 = inf13.find(f => f.tipo === 'r');
            ok('d exacta con escala asimétrica (y su r intacta)', !!d13d && d13d.ok && !!r13 && r13.ok, `${d13d && d13d.obtenido} · r ${r13 && r13.obtenido}`);
            // 14) (B5) heterogeneidad de ítems: medias y cargas dispersas, cargas cruzadas,
            //     con α, Media, DE y r intactos; con «ninguna», ítems paralelos como antes
            const itemTotal = (d, p, j, colTotal) => corr(col(d, `${p}${j}`), col(d, colTotal));
            const mediasItems = (d, p, k) => Array.from({ length: k }, (_, j) => { const v = col(d, `${p}${j + 1}`); return v.reduce((a, b) => a + b, 0) / v.length; });
            const cfgHet = cfgBase({ tamanoMuestra: 1500, heterogeneidadItems: 'alta', correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.40 }] });
            cfgHet.pruebas[3].minimo = 1; cfgHet.pruebas[3].maximo = 5; cfgHet.pruebas[3].media = 30; cfgHet.pruebas[3].desviacion = 6;
            const { g: g14, d: d14 } = generar(cfgHet);
            const inf14 = g14.informePedidoObtenido(d14);
            const mST = mediasItems(d14, 'ST', 10), rST = Array.from({ length: 10 }, (_, j) => itemTotal(d14, 'ST', j + 1, 'Dimension_ST'));
            ok('(B5) «alta»: medias de ítem dispersas (ítems fáciles y difíciles)', Math.max(...mST) - Math.min(...mST) > 0.6, (Math.max(...mST) - Math.min(...mST)).toFixed(2));
            ok('(B5) «alta»: correlaciones ítem-total desiguales (cargas desiguales)', Math.max(...rST) - Math.min(...rST) > 0.12, (Math.max(...rST) - Math.min(...rST)).toFixed(3));
            ok('(B5) «alta»: α, Media, DE y r siguen siendo los pedidos', inf14.filter(f => ['α', 'Media', 'DE', 'r'].includes(f.tipo)).every(f => f.ok), inf14.filter(f => !f.ok).map(f => `${f.tipo} ${f.variable} ${f.obtenido}`).join('; '));
            const perfilPE = g14.perfilesItems.get(g14.configuracion.pruebas[0]);
            const cruzados = perfilPE.cruzadas.map(c => c.item), noCruzados = Array.from({ length: 8 }, (_, j) => j).filter(j => !cruzados.includes(j));
            const rCruz = cruzados.map(j => itemTotal(d14, 'PE', j + 1, `Dimension_${perfilPE.cruzadas.find(c => c.item === j).sigla}`));
            const rNo = noCruzados.map(j => { const s = perfilPE.cruzadas[0].sigla; return itemTotal(d14, 'PE', j + 1, `Dimension_${s}`); });
            const prom = a => a.reduce((x, y) => x + y, 0) / a.length;
            ok('(B5) «alta»: los ítems con carga cruzada correlacionan más con la otra dimensión', cruzados.length > 0 && prom(rCruz) - prom(rNo) > 0.08, `${prom(rCruz).toFixed(3)} vs ${prom(rNo).toFixed(3)}`);
            const { d: d15 } = generar(cfgBase({ tamanoMuestra: 1500, heterogeneidadItems: 'ninguna' }));
            const mPE = mediasItems(d15, 'PE', 8);
            ok('(B5) «ninguna»: ítems paralelos (medias iguales)', Math.max(...mPE) - Math.min(...mPE) < 0.25, (Math.max(...mPE) - Math.min(...mPE)).toFixed(2));
            // 15) nombres de columna duplicados: error claro en vez de sobrescritura silenciosa
            let mensajeDup = '';
            try { generar(cfgBase({ sociodemograficos: [{ categoria: 'PE1', categoriaCorta: 'X', distribucion: 'binaria', promedio: 0.5, desviacion: 1, minimo: null, maximo: null, decimales: 0 }] })); }
            catch (e) { mensajeDup = e.message; }
            ok('columna duplicada («PE1» como sociodemográfico y como ítem) → error que la nombra', /PE1/.test(mensajeDup) && /sociodemográfica/.test(mensajeDup), mensajeDup.slice(0, 60));
            // 16) (B6) mediación X → M → Y: a, b, c′ e indirecto exactos; y moderación con interacción
            const cfgMed = cfgBase({ tamanoMuestra: 1500, correlaciones: [{ a: 'Comprensión', b: 'Estrés', r: 0.15 }],
                modelos: [{ tipo: 'mediacion', x: 'Percepción', m: 'Regulación', y: 'Estrés', c1: 0.5, c2: -0.4, c3: -0.2 }] });
            const { g: g16, d: d16 } = generar(cfgMed);
            const inf16 = g16.informePedidoObtenido(d16);
            const coef = (tipo, patron) => inf16.find(f => f.tipo === tipo && (!patron || f.variable.includes(patron)));
            ok('(B6) mediación: a, b, c′ e indirecto obtenidos = pedidos', ['a', 'b', 'c′', 'a·b'].every(t => coef(t) && coef(t).ok), ['a', 'b', 'c′', 'a·b'].map(t => `${t}=${coef(t) && coef(t).obtenido}`).join(' '));
            ok('(B6) mediación: la r de la tabla III con otra variable sigue exacta', inf16.filter(f => f.tipo === 'r').every(f => f.ok), inf16.filter(f => f.tipo === 'r').map(f => f.obtenido).join(' '));
            const cfgMod = cfgBase({ tamanoMuestra: 2000, correlaciones: [{ a: 'Percepción', b: 'Comprensión', r: 0.30 }, { a: 'Estrés', b: 'Regulación', r: -0.35 }],
                modelos: [{ tipo: 'moderacion', x: 'Percepción', m: 'Comprensión', y: 'Estrés', c1: -0.30, c2: 0.20, c3: 0.25 }] });
            const { g: g17, d: d17 } = generar(cfgMod);
            const inf17 = g17.informePedidoObtenido(d17);
            const beta = t => inf17.find(f => f.tipo === t);
            ok('(B6) moderación: β₁, β₂ y β₃ (interacción) obtenidos = pedidos', ['β₁', 'β₂', 'β₃'].every(t => beta(t) && beta(t).ok), ['β₁', 'β₂', 'β₃'].map(t => `${t}=${beta(t) && beta(t).obtenido}`).join(' '));
            ok('(B6) moderación: Y conserva Media/DE y su r con una tercera variable', inf17.filter(f => (f.tipo === 'Media' || f.tipo === 'DE') && f.variable === 'Estrés').every(f => f.ok) && inf17.filter(f => f.tipo === 'r' && f.variable.includes('Regulación')).every(f => f.ok), inf17.filter(f => f.tipo === 'r').map(f => `${f.variable} ${f.obtenido}`).join('; '));
            // 17) (B7) medidas repetidas: estabilidad exacta, cambio global y por grupo, columnas y etiquetas
            const cfgRep = cfgBase({ tamanoMuestra: 1200, sociodemograficos: [{ categoria: 'Grupo', categoriaCorta: 'Gr', distribucion: 'binaria', promedio: 0.5, desviacion: 1, minimo: null, maximo: null, decimales: 0 }],
                correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.40 }], diferenciasGrupo: [{ cuantitativa: 'Estrés', agrupacion: 'Grupo', d: 0.3 }],
                medidasRepetidas: [{ variable: 'Estrés', ondas: 3, estabilidad: 0.7, cambio: -0.2, agrupacion: 'Grupo', cambioGrupo: -0.8 }, { variable: 'Percepción', ondas: 2, estabilidad: 0.6, cambio: 0.5, agrupacion: '', cambioGrupo: null }] });
            const { g: g18, d: d18 } = generar(cfgRep);
            const inf18 = g18.informePedidoObtenido(d18);
            const cols18 = Object.keys(d18[0]);
            ok('(B7) columnas de las ondas: ítems, total y percentil con sufijo _T2/_T3', ['ST1_T2', 'ST10_T3', 'Dimension_ST_T2', 'Dimension_ST_T3', 'PC_ST_T3', 'PE8_T2', 'Dimension_PE_T2'].every(c => cols18.includes(c)) && !cols18.includes('General_E_T2'), cols18.filter(c => /_T[23]$/.test(c)).length + ' columnas de onda');
            const rtt = inf18.filter(f => f.tipo === 'r_tt');
            ok('(B7) estabilidad T1→T2 y T1→T3 (AR(1)) exactas', rtt.length === 3 && rtt.every(f => f.ok), rtt.map(f => `${f.pedido}→${f.obtenido}`).join(' '));
            const camb = inf18.filter(f => f.tipo === 'd cambio' || f.tipo === 'interacción');
            ok('(B7) cambio global (Percepción) y por grupo (Estrés) e interacción tiempo × grupo', camb.length >= 5 && camb.every(f => f.ok), camb.map(f => `${f.pedido}→${f.obtenido}`).join(' '));
            ok('(B7) la r de la onda 2 con otra variable queda atenuada por la estabilidad', (() => { const r = corr(col(d18, 'Dimension_ST_T2'), col(d18, 'Dimension_PE')); return Math.abs(r - (-0.40 * 0.7)) < 0.03; })(), corr(col(d18, 'Dimension_ST_T2'), col(d18, 'Dimension_PE')).toFixed(3));
            ok('(B7) α de la onda 2 es el pedido y sus etiquetas existen', inf18.filter(f => f.tipo === 'α' && /\(T2\)/.test(f.variable)).every(f => f.ok) && !!g18.obtenerEtiquetas()['Dimension_ST_T2'], g18.obtenerEtiquetas()['Dimension_ST_T3']);
            // 18) (B8) estilos de respuesta, ítems de control y tiempo de respuesta
            const cfgB8 = cfgBase({ tamanoMuestra: 1000, realismo: { pctPerdidos: 0, pctDescuidados: 10, tipoDescuidado: 'mixto', marcarDescuidados: true, pctDigitacion: 0, pctAquiescencia: 20, pctExtrema: 20, intensidadEstilos: 'alta', tiempoMinutos: 12, itemsControl: 2 } });
            cfgB8.pruebas[2].invertidos = 4;   // Estrés (Likert 0–4) con ítems invertidos: la aquiescencia debe delatarse
            const { g: g19, d: d19 } = generar(cfgB8);
            const cols19 = Object.keys(d19[0]);
            ok('(B8) columnas: marcadores, Control_1/2 y Tiempo_respuesta_seg', ['Respuesta_descuidada', 'Estilo_respuesta', 'Control_1', 'Control_2', 'Tiempo_respuesta_seg'].every(c => cols19.includes(c)), cols19.slice(-6).join(','));
            const marcaE = col(d19, 'Estilo_respuesta'), marcaD = col(d19, 'Respuesta_descuidada');
            const nAq = marcaE.filter(v => v === 1).length, nEx = marcaE.filter(v => v === 2).length, nDs = marcaD.filter(v => v === 1).length;
            ok('(B8) 20 % aquiescentes, 20 % extremos y 10 % descuidados, sin solaparse', nAq === 200 && nEx === 200 && nDs === 100 && marcaE.every((v, i) => !(v && marcaD[i])), `${nAq} ${nEx} ${nDs}`);
            // aquiescencia: en los ítems INVERTIDOS de Estrés, la respuesta bruta media sube en los aquiescentes; en los extremos, más 0 y 4
            const brutaInv = quien => { let s = 0, c = 0; d19.forEach((f, i) => { if (quien(i)) for (let j = 7; j <= 10; j++) { s += f[`ST${j}`]; c++; } }); return s / c; };
            const mediaInvAq = brutaInv(i => marcaE[i] === 1), mediaInvNo = brutaInv(i => marcaE[i] === 0 && !marcaD[i]);
            ok('(B8) aquiescencia: sube la respuesta BRUTA de los ítems invertidos (≈ +1 punto)', mediaInvAq - mediaInvNo > 0.6, `${mediaInvAq.toFixed(2)} vs ${mediaInvNo.toFixed(2)}`);
            const pExtremos = quien => { let e = 0, c = 0; d19.forEach((f, i) => { if (quien(i)) for (let j = 1; j <= 10; j++) { const v = f[`ST${j}`]; if (v === 0 || v === 4) e++; c++; } }); return e / c; };
            ok('(B8) respuesta extrema: más respuestas en los extremos del rango', pExtremos(i => marcaE[i] === 2) > pExtremos(i => marcaE[i] === 0 && !marcaD[i]) + 0.2, `${pExtremos(i => marcaE[i] === 2).toFixed(2)} vs ${pExtremos(i => marcaE[i] === 0 && !marcaD[i]).toFixed(2)}`);
            const correctas = g19.controlesGenerados.map(x => x.correcta);
            const fallos = quien => { let f = 0, c = 0; d19.forEach((fila, i) => { if (quien(i)) { c++; if (fila.Control_1 !== correctas[0] || fila.Control_2 !== correctas[1]) f++; } }); return f / c; };
            ok('(B8) ítems de control: los descuidados fallan casi siempre y los atentos casi nunca', fallos(i => marcaD[i] === 1) > 0.7 && fallos(i => marcaD[i] === 0) < 0.12, `${fallos(i => marcaD[i] === 1).toFixed(2)} vs ${fallos(i => marcaD[i] === 0).toFixed(2)}`);
            const medianaT = quien => { const v = d19.filter((f, i) => quien(i)).map(f => f.Tiempo_respuesta_seg).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
            ok('(B8) tiempo: mediana ≈ 12 min en atentos y los descuidados tardan menos de la mitad', Math.abs(medianaT(i => marcaD[i] === 0 && !marcaE[i]) - 720) < 90 && medianaT(i => marcaD[i] === 1) < 0.6 * 720, `${medianaT(i => marcaD[i] === 0 && !marcaE[i])} vs ${medianaT(i => marcaD[i] === 1)} s`);
            ok('(B8) sin estilos ni controles, la base sale como antes', !Object.keys(generar(cfgBase({ tamanoMuestra: 100 })).d[0]).some(c => /^(Control_|Tiempo_|Estilo_)/.test(c)), '');
            // 9) (A3) muestra sin reemplazo uniforme (la fila 1 ya no sale favorecida)
            const g8 = new GeneradorDatos(); let vecesFila0 = 0; const reps = 1500;
            for (let s = 1; s <= reps; s++) { g8.inicializarAleatorio(s); if (g8._muestraSinReemplazo(60, 6).includes(0)) vecesFila0++; }
            ok('(A3) muestra sin reemplazo: fila 1 elegida ≈ 10 %', Math.abs(vecesFila0 / reps - 0.10) < 0.03, (vecesFila0 / reps).toFixed(3));
        } catch (e) {
            ok('el autotest no lanza excepciones', false, e && e.message);
        }
        const verdes = res.filter(r => r.ok).length;
        const resumen = `${verdes}/${res.length} en verde`;
        if (typeof console !== 'undefined') {
            res.forEach(r => console[r.ok ? 'log' : 'error'](`${r.ok ? '✓' : '✗'} ${r.nombre}${r.detalle ? ' · ' + r.detalle : ''}`));
            console.log(`[GeneradorDatos.autotest] ${resumen}`);
        }
        return { resumen, resultados: res };
    }

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
    _esInvertido(p, idx1) { return (p.invertidos || 0) > 0 && idx1 > p.numItems - (p.invertidos || 0); }
    // Muestra SIN reemplazo de k índices de [0, n): Fisher–Yates parcial, O(k).
    // Sustituye a sort(() => aleatorio() − 0.5), que no baraja uniformemente:
    // con n = 200 y k = 20 la fila 1 salía elegida el 25 % de las veces y la
    // 187 el 6 % (lo esperado es 10 % para todas), así que los descuidados se
    // concentraban en los primeros ID.
    _muestraSinReemplazo(n, k) {
        const idx = new Int32Array(n);
        for (let i = 0; i < n; i++) idx[i] = i;
        const tope = Math.max(0, Math.min(k, n));
        for (let j = 0; j < tope; j++) {
            const r = j + Math.floor(this.aleatorio() * (n - j));
            const t = idx[j]; idx[j] = idx[r]; idx[r] = t;
        }
        return idx.subarray(0, tope);
    }
    _reflejar(p, v) {
        if (!(typeof v === 'number' && isFinite(v))) return v;
        const centro2 = (isFinite(p.minimo) && isFinite(p.maximo)) ? (p.minimo + p.maximo) : 2 * (p.media / p.numItems);
        return Math.round((centro2 - v) * 100) / 100;
    }
    _recodificar(p, idx1, v) { return this._esInvertido(p, idx1) ? this._reflejar(p, v) : v; }
    _itemsDe(p) { const out = []; const suf = p.sufijo || ''; for (let j = 1; j <= p.numItems; j++) out.push(`${p.nombreCorto}${j}${suf}`); return out; }
    // Recalcula, para la fila i, los totales de las escalas (regla del 80 %) y
    // los puntajes generales derivados tras alterar sus ítems.
    _recalcularTotales(base, i, grupos) {
        const cfg = this.configuracion;
        (cfg.pruebas || []).forEach(p => {
            if (p.numItems < 1) return;
            const items = [];
            this._itemsDe(p).forEach((k, j) => {
                const v = this._recodificar(p, j + 1, base.columna(k).datos[i]);
                if (typeof v === 'number' && isFinite(v)) items.push(v);
            });
            const col = base.columna(this.columnaDeEscala(p)).datos;
            if (items.length === 0) { col[i] = NaN; return; }
            if (items.length < p.numItems) {
                if (items.length < 0.8 * p.numItems) { col[i] = NaN; return; }
                const prorrateo = items.reduce((s, v) => s + v, 0) / items.length * p.numItems;   // regla del 80 %
                col[i] = Math.round(prorrateo * 100) / 100;
            } else {
                col[i] = Math.round(items.reduce((s, v) => s + v, 0) * 100) / 100;
            }
        });
        (grupos || []).forEach(g => {
            if (g.escalas.length < 2) return;
            const general = base.columna(`General_${g.sigla}`);
            if (!general) return;
            let suma = 0, completo = true;
            g.escalas.forEach(s => { const v = base.columna(`Dimension_${s}`).datos[i]; if (v === v) suma += v; else completo = false; });
            general.datos[i] = completo ? Math.round(suma / g.escalas.length) : NaN;
        });
    }
    aplicarImperfecciones(base) {
        const r = this.configuracion.realismo || {};
        const cfg = this.configuracion, grupos = cfg.gruposPruebas || [];
        const n = base.n;
        this.controlesGenerados = [];
        const vacio = { perdidos: 0, descuidados: 0, digitacion: 0, aquiescentes: 0, extremos: 0, controles: 0, fallosControl: 0, tiempo: false };
        if (!n || !(r.pctPerdidos > 0 || r.pctDescuidados > 0 || r.pctDigitacion > 0 || r.pctAquiescencia > 0 || r.pctExtrema > 0 || r.tiempoMinutos > 0 || r.itemsControl > 0)) return vacio;
        const pruebasConItems = (cfg.pruebas || []).filter(p => p.numItems >= 2);
        const columnasItems = p => this._itemsDe(p).map(k => base.columna(k).datos);
        const tocados = new Set();
        let nPerdidos = 0, nDescuidados = 0, nDigitacion = 0;
        // Quién es descuidado se decide primero: los estilos de respuesta se
        // reparten entre los demás, y tiempo e ítems de control dependen de ello.
        const esDescuidado = new Uint8Array(n);
        const tipoDescuidado = new Array(n).fill(null), valorLinea = new Map();
        const kDesc = (r.pctDescuidados > 0 && pruebasConItems.length) ? Math.round(n * r.pctDescuidados / 100) : 0;
        const ordenDesc = kDesc > 0 ? this._muestraSinReemplazo(n, kDesc) : [];
        ordenDesc.forEach(i => { esDescuidado[i] = 1; let tipo = r.tipoDescuidado; if (tipo === 'mixto') tipo = this.aleatorio() < 0.5 ? 'linea' : 'aleatorio'; tipoDescuidado[i] = tipo; });
        // columnas marcadoras en orden fijo: Respuesta_descuidada, Estilo_respuesta
        const marcador = (kDesc > 0 && r.marcarDescuidados) ? base.agregar('Respuesta_descuidada', true).datos : null;
        // --- (B8) Estilos de respuesta: aquiescencia y respuesta extrema ---
        const estilos = this._aplicarEstilosRespuesta(base, pruebasConItems, esDescuidado, tocados);
        // --- Respuestas descuidadas ---
        if (kDesc > 0) {
            ordenDesc.forEach(i => {
                const tipo = tipoDescuidado[i];
                pruebasConItems.forEach(p => {
                    const min = isFinite(p.minimo) ? p.minimo : Math.floor(p.media / p.numItems - p.desviacion);
                    const max = isFinite(p.maximo) ? p.maximo : Math.ceil(p.media / p.numItems + p.desviacion);
                    const fijo = min + Math.floor(this.aleatorio() * (max - min + 1));
                    if (tipo === 'linea' && !valorLinea.has(i)) valorLinea.set(i, fijo);
                    columnasItems(p).forEach(col => {
                        col[i] = tipo === 'linea' ? fijo : (min + Math.floor(this.aleatorio() * (max - min + 1)));
                    });
                });
                if (marcador) marcador[i] = 1;
                tocados.add(i); nDescuidados++;
            });
        }
        // --- Errores de digitación (atípicos) ---
        if (r.pctDigitacion > 0 && pruebasConItems.length) {
            const k = Math.round(n * r.pctDigitacion / 100);
            for (let c = 0; c < k; c++) {
                const i = Math.floor(this.aleatorio() * n);
                const p = pruebasConItems[Math.floor(this.aleatorio() * pruebasConItems.length)];
                const cols = columnasItems(p), col = cols[Math.floor(this.aleatorio() * cols.length)];
                const max = isFinite(p.maximo) ? p.maximo : Math.ceil(p.media / p.numItems + 2 * p.desviacion);
                const v = col[i];
                // dígito repetido («44» por «4») o un cero de más («50» por «5»)
                col[i] = (isFinite(v) && this.aleatorio() < 0.5) ? Number(String(Math.round(v)) + String(Math.round(v))) : max * 10;
                tocados.add(i); nDigitacion++;
            }
        }
        // --- Valores perdidos ---
        if (r.pctPerdidos > 0 && pruebasConItems.length) {
            const p0 = r.pctPerdidos / 100;
            // MAR: referencia observada = primer sociodemográfico numérico o, si no hay, el primer total
            let ref = null;
            const socioNum = (cfg.sociodemograficos || []).find(s => s.distribucion === 'normal' || s.distribucion === 'asimetrica');
            if (socioNum) ref = socioNum.categoria;   // la columna se llama como la categoría (no como su nombre corto)
            else if (cfg.pruebas && cfg.pruebas.length) ref = this.columnaDeEscala(cfg.pruebas[0]);
            let rangos = null;
            if (r.mecanismoPerdidos === 'MAR' && ref && base.tiene(ref)) {
                const datosRef = base.columna(ref).datos;
                const vals = [];
                for (let i = 0; i < n; i++) if (isFinite(datosRef[i])) vals.push([datosRef[i], i]);
                vals.sort((a, b) => a[0] - b[0]);
                rangos = new Float64Array(n).fill(0.5);
                vals.forEach(([, i], pos) => { rangos[i] = vals.length > 1 ? pos / (vals.length - 1) : 0.5; });
            }
            const columnasPorPrueba = pruebasConItems.map(columnasItems);
            for (let i = 0; i < n; i++) {
                // MAR: quienes puntúan bajo en la referencia pierden hasta el doble; los altos casi nada
                const pi = rangos ? Math.max(0, Math.min(1, p0 * (1.8 - 1.6 * rangos[i]))) : p0;
                columnasPorPrueba.forEach(cols => cols.forEach(col => {
                    if (this.aleatorio() < pi) { col[i] = NaN; nPerdidos++; tocados.add(i); }
                }));
            }
        }
        tocados.forEach(i => this._recalcularTotales(base, i, grupos));
        // --- (B8) Ítems de control y tiempo de respuesta (tras saber quién es descuidado) ---
        const control = this._generarItemsControl(base, esDescuidado, tipoDescuidado, valorLinea);
        const tiempo = this._generarTiempoRespuesta(base, esDescuidado, estilos.marcaPersona);
        return { perdidos: nPerdidos, descuidados: nDescuidados, digitacion: nDigitacion, aquiescentes: estilos.aquiescentes, extremos: estilos.extremos, controles: control.columnas, fallosControl: control.fallos, tiempo };
    }
    // (B8) Estilos de respuesta sobre las escalas Likert. Se reparten entre las
    // personas NO descuidadas, sin solaparse (una persona tiene a lo sumo un
    // estilo). La intensidad de cada persona es la del preset × U(0.7, 1.3).
    //  · Aquiescencia: suma «a» puntos a la respuesta bruta de cada ítem (la
    //    parte fraccionaria, con esa probabilidad) y recorta al máximo.
    //  · Extrema: cada respuesta salta al extremo de su lado con probabilidad q
    //    (en el punto medio exacto, a un extremo al azar con probabilidad q/2).
    // Devuelve el marcador por persona (0 ninguno, 1 aquiescente, 2 extremo).
    _aplicarEstilosRespuesta(base, pruebasConItems, esDescuidado, tocados) {
        const r = this.configuracion.realismo || {};
        const n = base.n;
        const marcaPersona = new Uint8Array(n);
        const salida = { aquiescentes: 0, extremos: 0, marcaPersona };
        const pctA = r.pctAquiescencia || 0, pctE = r.pctExtrema || 0;
        if (!(pctA > 0 || pctE > 0)) return salida;
        const likert = pruebasConItems.filter(p => p.minimo !== null && p.maximo !== null && isFinite(p.minimo) && isFinite(p.maximo));
        if (!likert.length) return salida;
        const preset = ESTILOS_RESPUESTA[r.intensidadEstilos] || ESTILOS_RESPUESTA.moderada;
        const candidatos = [];
        for (let i = 0; i < n; i++) if (!esDescuidado[i]) candidatos.push(i);
        const nA = Math.min(candidatos.length, Math.round(n * pctA / 100));
        const nE = Math.min(candidatos.length - nA, Math.round(n * pctE / 100));
        const orden = this._muestraSinReemplazo(candidatos.length, nA + nE).map(k => candidatos[k]);
        const columnas = likert.map(p => ({ p, cols: this._itemsDe(p).map(k => base.columna(k).datos) }));
        for (let idx = 0; idx < orden.length; idx++) {
            const i = orden[idx];
            const factor = 0.7 + 0.6 * this.aleatorio();
            if (idx < nA) {
                const a = preset.aquiescencia * factor, entero = Math.floor(a), frac = a - entero;
                columnas.forEach(({ p, cols }) => cols.forEach(col => {
                    const v = col[i];
                    if (!(v === v)) return;
                    const salto = entero + (this.aleatorio() < frac ? 1 : 0);
                    col[i] = Math.min(p.maximo, v + salto);
                }));
                marcaPersona[i] = 1; salida.aquiescentes++;
            } else {
                const q = Math.min(0.98, preset.extrema * factor);
                columnas.forEach(({ p, cols }) => {
                    const m = (p.minimo + p.maximo) / 2;
                    cols.forEach(col => {
                        const v = col[i];
                        if (!(v === v)) return;
                        if (v === m) { if (this.aleatorio() < q / 2) col[i] = this.aleatorio() < 0.5 ? p.minimo : p.maximo; }
                        else if (this.aleatorio() < q) col[i] = v < m ? p.minimo : p.maximo;
                    });
                });
                marcaPersona[i] = 2; salida.extremos++;
            }
            tocados.add(i);
        }
        if (r.marcarDescuidados) {
            const col = base.agregar('Estilo_respuesta', true).datos;
            for (let i = 0; i < n; i++) col[i] = marcaPersona[i];
        }
        return salida;
    }
    // (B8) Ítems de control («marque X»): columnas Control_1…k con el rango de
    // las escalas Likert (por turno). La respuesta correcta es el máximo del
    // rango. Atentos: aciertan con probabilidad 0.97; descuidados en línea
    // recta responden su valor fijo; descuidados al azar, un valor uniforme.
    // Ítems de control que corresponden a la configuración: columna, número,
    // respuesta correcta y rango. Se deriva de la configuración (no del estado
    // de la generación) para que las etiquetas valgan también en el hilo
    // principal cuando la base la generó el Worker.
    _controlesEsperados() {
        const cfg = this.configuracion || {}, r = cfg.realismo || {};
        const k = Math.max(0, Math.min(3, Math.round(r.itemsControl || 0)));
        if (!k) return [];
        const likert = (cfg.pruebas || []).filter(p => p.numItems >= 2 && p.minimo !== null && p.maximo !== null && isFinite(p.minimo) && isFinite(p.maximo) && !p.sufijo);
        if (!likert.length) return [];
        const salida = [];
        for (let c = 1; c <= k; c++) {
            const p = likert[(c - 1) % likert.length];
            salida.push({ columna: `Control_${c}`, indice: c, correcta: p.maximo, minimo: p.minimo, maximo: p.maximo });
        }
        return salida;
    }
    _generarItemsControl(base, esDescuidado, tipoDescuidado, valorLinea) {
        const salida = { columnas: 0, fallos: 0 };
        const esperados = this._controlesEsperados();
        if (!esperados.length) return salida;
        const n = base.n;
        esperados.forEach(ctrl => {
            const min = ctrl.minimo, max = ctrl.maximo, ancho = max - min + 1;
            const col = base.agregar(ctrl.columna, true).datos;
            for (let i = 0; i < n; i++) {
                let v;
                if (esDescuidado[i]) {
                    v = (tipoDescuidado[i] === 'linea' && valorLinea.has(i)) ? Math.max(min, Math.min(max, valorLinea.get(i))) : min + Math.floor(this.aleatorio() * ancho);
                } else if (this.aleatorio() < 0.97 || ancho < 2) {
                    v = max;
                } else {
                    v = min + Math.floor(this.aleatorio() * (ancho - 1));   // cualquier valor distinto del correcto
                }
                col[i] = v;
                if (v !== max) salida.fallos++;
            }
            this.controlesGenerados.push(ctrl);
            salida.columnas++;
        });
        return salida;
    }
    // (B8) Tiempo total de respuesta (segundos): log-normal alrededor de la
    // mediana pedida (σ_log = 0.35); los descuidados tardan ×U(0.25, 0.55) y
    // quienes tienen un estilo de respuesta ×U(0.8, 1.0). Mínimo 30 s.
    _generarTiempoRespuesta(base, esDescuidado, marcaPersona) {
        const r = this.configuracion.realismo || {};
        const mediana = (r.tiempoMinutos || 0) * 60;
        if (!(mediana > 0)) return false;
        const n = base.n;
        const col = base.agregar('Tiempo_respuesta_seg', true).datos;
        for (let i = 0; i < n; i++) {
            let t = mediana * Math.exp(0.35 * this.generarNormalEstandar());
            if (esDescuidado[i]) t *= 0.25 + 0.30 * this.aleatorio();
            else if (marcaPersona && marcaPersona[i]) t *= 0.8 + 0.2 * this.aleatorio();
            col[i] = Math.max(30, Math.round(t));
        }
        return true;
    }
    _esDefinidaPositiva(R) {
        const n = R.length, L = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
            let s = 0;
            for (let k = 0; k < j; k++) s += L[i][k] * L[j][k];
            if (i === j) { const d = R[i][i] - s; if (d <= 1e-10) return false; L[i][i] = Math.sqrt(d); }
            else L[i][j] = (R[i][j] - s) / L[j][j];
        }
        return true;
    }
    _triadasIncompatibles(R, nombres) {
        const out = [], n = R.length;
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
            const a = R[i][j], b = R[i][k], c = R[j][k];
            if (!a || !b || !c) continue;
            const det = 1 + 2 * a * b * c - a * a - b * b - c * c;
            if (det < -1e-9) out.push({ variables: [nombres[i], nombres[j], nombres[k]], correlaciones: [a, b, c], det });
        }
        return out;
    }
    // Autovalores/autovectores de una matriz simétrica (Jacobi cíclico).
    _jacobi(A) {
        const n = A.length, M = A.map(f => f.slice()), V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
        for (let sweep = 0; sweep < 60; sweep++) {
            let off = 0;
            for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += M[p][q] * M[p][q];
            if (off < 1e-14) break;
            for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
                if (Math.abs(M[p][q]) < 1e-14) continue;
                const theta = (M[q][q] - M[p][p]) / (2 * M[p][q]);
                const tt = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
                const c = 1 / Math.sqrt(tt * tt + 1), s = tt * c;
                for (let k = 0; k < n; k++) { const mkp = M[k][p], mkq = M[k][q]; M[k][p] = c * mkp - s * mkq; M[k][q] = s * mkp + c * mkq; }
                for (let k = 0; k < n; k++) { const mpk = M[p][k], mqk = M[q][k]; M[p][k] = c * mpk - s * mqk; M[q][k] = s * mpk + c * mqk; }
                for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
            }
        }
        return { valores: M.map((f, i) => f[i]), vectores: V };
    }
    _matrizValidaMasCercana(R) {
        const n = R.length, { valores, vectores } = this._jacobi(R);
        const piso = 1e-3;
        const S = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            let s = 0;
            for (let k = 0; k < n; k++) s += vectores[i][k] * Math.max(valores[k], piso) * vectores[j][k];
            S[i][j] = s;
        }
        const d = S.map((f, i) => Math.sqrt(f[i]));
        return S.map((f, i) => f.map((x, j) => (i === j ? 1 : x / (d[i] * d[j]))));
    }
    diagnosticarMatriz(R, nombres) {
        if (this._esDefinidaPositiva(R)) return { imposible: false, triadas: [], ajustes: [], R };
        const triadas = this._triadasIncompatibles(R, nombres);
        const Rv = this._matrizValidaMasCercana(R);
        const ajustes = [];
        for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++)
            if (Math.abs(Rv[i][j] - R[i][j]) > 0.005) ajustes.push({ a: nombres[i], b: nombres[j], pedido: R[i][j], ajustado: Rv[i][j] });
        ajustes.sort((x, y) => Math.abs(y.ajustado - y.pedido) - Math.abs(x.ajustado - x.pedido));
        return { imposible: true, triadas, ajustes, R: Rv };
    }

    // ============ INFORME PEDIDO vs OBTENIDO ============
    // Cierra el ciclo «lo que se pide es lo que se entrega»: mide en la base
    // generada cada parámetro solicitado y lo pone al lado del valor real.
    _corr(x, y) {
        const n = x.length; let mx = 0, my = 0;
        for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
        mx /= n; my /= n;
        let sxy = 0, sxx = 0, syy = 0;
        for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
        return (sxx > 0 && syy > 0) ? sxy / Math.sqrt(sxx * syy) : NaN;
    }
    informePedidoObtenido(datos) {
        const filas = [];
        if (!datos || !datos.length) return filas;
        // Acepta la base columnar o, por compatibilidad, un arreglo de filas-objeto.
        const base = (typeof BaseColumnar !== 'undefined' && datos instanceof BaseColumnar) ? datos : BaseColumnar.desdeObjetos(datos);
        const n = base.n;
        const cfg = this.configuracion;
        const col = k => (base.tiene(k) ? Array.from(base.finitos(k)) : []);
        const num = (v, dec = 2) => (isFinite(v) ? Number(v).toFixed(dec) : '—');
        // Columna de cada variable correlacionable (dimensión, general derivado o socio)
        const grupos = cfg.gruposPruebas || [];
        const columnaDe = nombre => {
            const p = (cfg.pruebas || []).find(x => x.nombre === nombre);
            if (p) return this.columnaDeEscala(p);
            const g = grupos.find(x => this.nombreGeneral(x) === nombre && x.escalas.length >= 2);
            if (g) return `General_${g.sigla}`;
            const s = (cfg.sociodemograficos || []).find(x => x.categoria === nombre);
            return s ? s.categoria : null;   // la columna de un sociodemográfico se llama como su categoría
        };
        // 1) Media y DE de cada escala
        (cfg.pruebas || []).forEach(p => {
            const v = col(this.columnaDeEscala(p));
            if (v.length < 3) return;
            const m = v.reduce((a, b) => a + b, 0) / v.length;
            const de = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
            filas.push({ tipo: 'Media', variable: p.nombre, pedido: num(p.media), obtenido: num(m), ok: Math.abs(m - p.media) <= Math.max(0.5, 0.1 * p.desviacion) });
            filas.push({ tipo: 'DE', variable: p.nombre, pedido: num(p.desviacion), obtenido: num(de), ok: Math.abs(de - p.desviacion) <= Math.max(0.3, 0.15 * p.desviacion) });
        });
        // 2) Fiabilidad de cada escala con objetivo (α u ω, según el índice elegido)
        const indice = cfg.indiceFiabilidad || 'alfa';
        (cfg.pruebas || []).forEach(p => {
            if (!(p.alfa > 0 && p.alfa < 1) || p.numItems < 2) return;
            const cols = [];
            // Solo casos con todos los ítems presentes, y RECODIFICANDO los invertidos
            const columnasItems = this._itemsDe(p).map(k => base.columna(k)).filter(Boolean);
            if (columnasItems.length !== p.numItems) return;
            const completos = [];
            for (let i = 0; i < n; i++) if (columnasItems.every(c => isFinite(c.datos[i]))) completos.push(i);
            if (completos.length < 10) return;
            for (let j = 1; j <= p.numItems; j++) cols.push(completos.map(i => this._recodificar(p, j, columnasItems[j - 1].datos[i])));
            if (cols.length < 2) return;
            const obs = this._indiceObservado(cols, indice);
            if (obs === null || !isFinite(obs)) return;
            filas.push({ tipo: indice === 'omega' ? 'ω' : 'α', variable: p.nombre, pedido: num(p.alfa), obtenido: num(obs, 3), ok: Math.abs(obs - p.alfa) <= 0.04 });   // ±0.04 ≈ 2 EE de α con n≈300
        });
        // 3) Correlaciones objetivo (incluidas las de generales derivados; las
        //    parejas que fija un modelo estructural se informan en 5 y las de
        //    medidas repetidas en 6)
        const fijadasPorModelos = this._paresFijadosPorModelos();
        (cfg.correlaciones || []).forEach(({ a, b, r, origen }) => {
            if (origen === 'repetidas') return;
            if (fijadasPorModelos.has(a < b ? `${a}|${b}` : `${b}|${a}`)) return;
            const ca = columnaDe(a), cb = columnaDe(b);
            if (!ca || !cb || !base.tiene(ca) || !base.tiene(cb)) return;
            const x = base.columna(ca).datos, y = base.columna(cb).datos;
            const u = [], w = [];
            for (let i = 0; i < n; i++) if (isFinite(x[i]) && isFinite(y[i])) { u.push(x[i]); w.push(y[i]); }
            if (u.length < 3) return;
            const obs = this._corr(u, w);
            filas.push({ tipo: 'r', variable: `${a} ↔ ${b}`, pedido: num(r), obtenido: num(obs, 3), ok: Math.abs(obs - r) <= 0.03 });
        });
        // 4) Diferencias por grupo (d de Cohen): cambio de la media por unidad de
        //    código (pendiente), dividido por la DE intra-grupo agrupada. En modo
        //    exacto no fluctúa; si no, la tolerancia es 2 EE de la d.
        // La d solo es exacta si los drivers se ortogonalizaron a los grupos
        // (modo exacto y n suficiente); si no, fluctúa como en una muestra real.
        const exactas = cfg.correlacionesExactas !== false && this.driversOrtogonalizados === true;
        (cfg.diferenciasGrupo || []).forEach(difPedida => {
            // (B7) en una onda T2… con cambio diferencial, la d efectiva se recompone
            // con la heredada del General: se informa esa, no la de la expansión
            const efectiva = difPedida.extraAmp !== undefined && this.diferenciasEfectivas
                ? (this.diferenciasEfectivas.get(difPedida.cuantitativa) || []).find(e => e.agrup && e.agrup.categoria === difPedida.agrupacion) : null;
            const dif = efectiva ? Object.assign({}, difPedida, { d: efectiva.d }) : difPedida;
            const agrup = (cfg.sociodemograficos || []).find(s => s.categoria === dif.agrupacion);
            const cv = columnaDe(dif.cuantitativa);
            if (!agrup || !cv || !(typeof dif.d === 'number' && isFinite(dif.d)) || !base.tiene(agrup.categoria) || !base.tiene(cv)) return;
            const cg = base.columna(agrup.categoria).datos, cvv = base.columna(cv).datos;
            const pares = [];
            for (let i = 0; i < n; i++) if (isFinite(cg[i]) && isFinite(cvv[i])) pares.push([cg[i], cvv[i]]);
            if (pares.length < 6) return;
            const porGrupo = new Map();
            pares.forEach(([g, v]) => { if (!porGrupo.has(g)) porGrupo.set(g, []); porGrupo.get(g).push(v); });
            if (porGrupo.size < 2) {
                filas.push({ tipo: 'd', variable: `${dif.cuantitativa} por ${dif.agrupacion}`, pedido: num(dif.d), obtenido: 'un solo grupo en la muestra', ok: false });
                return;
            }
            let ssIntra = 0, gl = 0;
            porGrupo.forEach(vals => {
                const mg = vals.reduce((a, b) => a + b, 0) / vals.length;
                vals.forEach(v => { ssIntra += (v - mg) ** 2; });
                gl += vals.length - 1;
            });
            const deIntra = Math.sqrt(ssIntra / Math.max(1, gl));
            const codigos = pares.map(q => q[0]), valores = pares.map(q => q[1]);
            const mc = codigos.reduce((a, b) => a + b, 0) / codigos.length, mv = valores.reduce((a, b) => a + b, 0) / valores.length;
            let sxy = 0, sxx = 0;
            for (let i = 0; i < codigos.length; i++) { sxy += (codigos[i] - mc) * (valores[i] - mv); sxx += (codigos[i] - mc) ** 2; }
            if (!(sxx > 0) || !(deIntra > 0)) return;
            const obs = (sxy / sxx) / deIntra;
            const ee = 1 / Math.sqrt(sxx);   // ≈ √(1/n₀ + 1/n₁) en una binaria
            // En modo exacto solo queda el ruido del redondeo de la variable (Likert:
            // enteros; continua: 2 decimales; socio: sus decimales), DE = unidad/√12.
            const p = (cfg.pruebas || []).find(x => x.nombre === dif.cuantitativa);
            const s = (cfg.sociodemograficos || []).find(x => x.categoria === dif.cuantitativa);
            const unidad = p ? ((p.minimo !== null && p.maximo !== null) ? 1 : 0.01) : (s ? Math.pow(10, -(s.decimales || 0)) : 1);
            const eeRedondeo = (unidad / Math.sqrt(12)) / Math.sqrt(sxx) / deIntra;
            // El redondeo también INFLA la DE intra-grupo (corrección de Sheppard,
            // +unidad²/12 de varianza) y deflacta la d observada en ≈ d·unidad²/(24·DE²):
            // solo pesa en escalas muy cortas (DE de un punto o dos).
            const sesgoRedondeo = Math.abs(dif.d) * unidad * unidad / (24 * deIntra * deIntra);
            // Con algún grupo de menos de 5 personas la d no puede ser exacta ni
            // en modo exacto (medias de grupo dominadas por dos o tres casos y
            // confundidas con las otras agrupaciones): tolerancia muestral.
            let minGrupo = Infinity;
            porGrupo.forEach(vals => { if (vals.length < minGrupo) minGrupo = vals.length; });
            const tolerancia = (exactas && minGrupo >= 5) ? Math.max(0.06, 2 * eeRedondeo) + sesgoRedondeo : Math.max(0.06, 2 * ee);
            const limitada = (this.diferenciasLimitadas || []).some(l => l.variable === dif.cuantitativa && l.agrupacion === dif.agrupacion);
            const etiqueta = `${dif.cuantitativa} por ${dif.agrupacion}` + (limitada ? ' (no alcanzable con las d de sus dimensiones)' : '');
            filas.push({ tipo: 'd', variable: etiqueta, pedido: num(dif.d), obtenido: num(obs), ok: !limitada && Math.abs(obs - dif.d) <= tolerancia });
        });
        // 5) (B6) Modelos estructurales: coeficientes estandarizados obtenidos por
        //    regresión sobre los casos completos (X y W estandarizados en la
        //    muestra; el producto X·W se forma con los valores estandarizados).
        this._informeModelos(base, filas, columnaDe, num);
        // 6) (B7) Medidas repetidas: estabilidad y cambio (global o por grupo)
        this._informeRepetidas(base, filas, num);
        return filas;
    }
    _informeRepetidas(base, filas, num) {
        const cfg = this.configuracion, lista = cfg.medidasRepetidas || [];
        if (!lista.length) return;
        const n = base.n, exactas = cfg.correlacionesExactas !== false;
        const tolR = exactas ? 0.03 : Math.max(0.03, 2 / Math.sqrt(Math.max(4, n)));
        const tolD = exactas ? 0.06 : Math.max(0.06, 2 / Math.sqrt(Math.max(4, n)));
        const vistas = new Set();
        lista.forEach(mr => {
            if (vistas.has(mr.variable)) return;
            vistas.add(mr.variable);
            const p = (cfg.pruebas || []).find(x => x.nombre === mr.variable && !x.sufijo);
            if (!p) return;
            const clones = (cfg.pruebas || []).filter(x => x.base === p);
            if (!clones.length) return;
            const K = clones[clones.length - 1].onda;
            const t1 = base.columna(this.columnaDeEscala(p));
            if (!t1) return;
            const agrup = mr.agrupacion ? (cfg.sociodemograficos || []).find(s => s.categoria === mr.agrupacion && s.distribucion === 'binaria') : null;
            const codigos = agrup && base.tiene(agrup.categoria) ? base.columna(agrup.categoria).datos : null;
            const stab = Math.max(-0.99, Math.min(0.99, mr.estabilidad));
            const desv = arr => { const m = arr.reduce((s, v) => s + v, 0) / arr.length; return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, arr.length - 1)); };
            // En modo exacto solo queda el ruido del redondeo de los dos totales
            // (Likert: enteros; continua: 2 decimales): varianza 2·unidad²/12.
            const unidad = (p.minimo !== null && p.maximo !== null) ? 1 : 0.01;
            const eeRedondeo = (nk, sd1) => unidad * Math.sqrt(2 / 12) / Math.sqrt(Math.max(1, nk)) / (sd1 || 1);
            clones.forEach(cl => {
                const tk = base.columna(this.columnaDeEscala(cl));
                if (!tk) return;
                const frac = (cl.onda - 1) / (K - 1);
                const x = [], y = [], g = [];
                for (let i = 0; i < n; i++) if (isFinite(t1.datos[i]) && isFinite(tk.datos[i])) { x.push(t1.datos[i]); y.push(tk.datos[i]); if (codigos) g.push(codigos[i]); }
                if (x.length < 10) return;
                const rObs = this._corr(x, y), rPed = Math.pow(stab, cl.onda - 1);
                const etiqueta = `${mr.variable}: T1 → T${cl.onda}`;
                filas.push({ tipo: 'r_tt', variable: `${etiqueta} estabilidad`, pedido: num(rPed, 3), obtenido: num(rObs, 3), ok: Math.abs(rObs - rPed) <= tolR });
                const sd1 = desv(x) || 1;
                if (!codigos) {
                    const dObs = (y.reduce((s, v) => s + v, 0) - x.reduce((s, v) => s + v, 0)) / x.length / sd1;
                    const dPed = (mr.cambio || 0) * frac;
                    filas.push({ tipo: 'd cambio', variable: `${etiqueta} cambio (media T${cl.onda} − media T1, en DE de T1)`, pedido: num(dPed), obtenido: num(dObs), ok: Math.abs(dObs - dPed) <= Math.max(tolD, exactas ? 2 * eeRedondeo(x.length, sd1) : tolD) });
                } else {
                    const porGrupo = [0, 1].map(codigo => { const dx = [], dy = []; for (let i = 0; i < x.length; i++) if (g[i] === codigo) { dx.push(x[i]); dy.push(y[i]); } return { n: dx.length, cambio: dx.length ? (dy.reduce((s, v) => s + v, 0) - dx.reduce((s, v) => s + v, 0)) / dx.length / sd1 : NaN }; });
                    const c0 = (mr.cambio || 0) * frac, c1 = (isFinite(mr.cambioGrupo) && mr.cambioGrupo !== null ? mr.cambioGrupo : (mr.cambio || 0)) * frac;
                    const tolG = k => Math.max(tolD, exactas ? 2 * eeRedondeo(porGrupo[k].n, sd1) : 2 / Math.sqrt(Math.max(4, porGrupo[k].n)));
                    if (porGrupo[0].n >= 5) filas.push({ tipo: 'd cambio', variable: `${etiqueta} cambio en ${mr.agrupacion} = 0`, pedido: num(c0), obtenido: num(porGrupo[0].cambio), ok: Math.abs(porGrupo[0].cambio - c0) <= tolG(0) });
                    if (porGrupo[1].n >= 5) filas.push({ tipo: 'd cambio', variable: `${etiqueta} cambio en ${mr.agrupacion} = 1`, pedido: num(c1), obtenido: num(porGrupo[1].cambio), ok: Math.abs(porGrupo[1].cambio - c1) <= tolG(1) });
                    if (porGrupo[0].n >= 5 && porGrupo[1].n >= 5) {
                        const inter = porGrupo[1].cambio - porGrupo[0].cambio;
                        filas.push({ tipo: 'interacción', variable: `${etiqueta} tiempo × ${mr.agrupacion} (diferencia de cambios)`, pedido: num(c1 - c0), obtenido: num(inter), ok: Math.abs(inter - (c1 - c0)) <= Math.max(tolG(0), tolG(1)) });
                    }
                }
            });
        });
    }
    _informeModelos(base, filas, columnaDe, num) {
        const cfg = this.configuracion, modelos = cfg.modelos || [];
        if (!modelos.length) return;
        const n = base.n;
        const exactas = cfg.correlacionesExactas !== false;
        const tol = exactas ? 0.03 : Math.max(0.03, 2 / Math.sqrt(Math.max(4, n)));
        const columna = nombre => { const c = columnaDe(nombre); return c && base.tiene(c) ? base.columna(c).datos : null; };
        const par = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
        // Mediación: por par (X,Y), regresión de Y sobre X y TODOS sus mediadores
        const grupos = new Map();
        modelos.filter(md => md.tipo === 'mediacion').forEach(md => {
            const clave = par(md.x, md.y);
            if (!grupos.has(clave)) grupos.set(clave, { x: md.x, y: md.y, cprima: md.c3, mediadores: [] });
            const g = grupos.get(clave);
            if (!g.mediadores.some(q => q.m === md.m)) g.mediadores.push({ m: md.m, a: md.c1, b: md.c2 });
        });
        grupos.forEach(g => {
            const cols = [columna(g.x)].concat(g.mediadores.map(q => columna(q.m))).concat([columna(g.y)]);
            if (cols.some(c => !c)) return;
            const completos = [];
            for (let i = 0; i < n; i++) if (cols.every(c => isFinite(c[i]))) completos.push(i);
            if (completos.length < 10) return;
            const tomar = c => completos.map(i => c[i]);
            const X = tomar(cols[0]), Y = tomar(cols[cols.length - 1]), Ms = g.mediadores.map((q, k) => tomar(cols[k + 1]));
            const betasY = this._betasEstandarizadas(Y, [X].concat(Ms));   // [c′, b1, b2, …]
            if (!betasY) return;
            const etiqueta = `Mediación ${g.x} → ${g.mediadores.map(q => q.m).join(' / ')} → ${g.y}`;
            g.mediadores.forEach((q, k) => {
                const aObs = this._corr(X, Ms[k]), bObs = betasY[k + 1];
                filas.push({ tipo: 'a', variable: `${etiqueta}: a (${g.x} → ${q.m})`, pedido: num(q.a), obtenido: num(aObs, 3), ok: Math.abs(aObs - q.a) <= tol });
                filas.push({ tipo: 'b', variable: `${etiqueta}: b (${q.m} → ${g.y}, con ${g.x})`, pedido: num(q.b), obtenido: num(bObs, 3), ok: Math.abs(bObs - q.b) <= tol });
                filas.push({ tipo: 'a·b', variable: `${etiqueta}: efecto indirecto vía ${q.m}`, pedido: num(q.a * q.b, 3), obtenido: num(aObs * bObs, 3), ok: Math.abs(aObs * bObs - q.a * q.b) <= tol });
            });
            filas.push({ tipo: 'c′', variable: `${etiqueta}: c′ (${g.x} → ${g.y} directo)`, pedido: num(g.cprima), obtenido: num(betasY[0], 3), ok: Math.abs(betasY[0] - g.cprima) <= tol });
        });
        // Moderación: regresión de Y (estandarizada) sobre z_X, z_W y z_X·z_W
        modelos.filter(md => md.tipo === 'moderacion').forEach(md => {
            const cx = columna(md.x), cw = columna(md.m), cy = columna(md.y);
            if (!cx || !cw || !cy) return;
            const completos = [];
            for (let i = 0; i < n; i++) if (isFinite(cx[i]) && isFinite(cw[i]) && isFinite(cy[i])) completos.push(i);
            if (completos.length < 10) return;
            const est = arr => { const mu = arr.reduce((s, v) => s + v, 0) / arr.length; const sd = Math.sqrt(arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length) || 1; return arr.map(v => (v - mu) / sd); };
            const zx = est(completos.map(i => cx[i])), zw = est(completos.map(i => cw[i])), y = completos.map(i => cy[i]);
            const betas = this._betasEstandarizadas(y, [zx, zw, zx.map((v, i) => v * zw[i])], false);
            if (!betas) return;
            const etiqueta = `Moderación ${md.x} × ${md.m} → ${md.y}`;
            // Con diferencias por grupo en Y, el desplazamiento de grupo se confunde
            // por azar con los predictores (∝ 1/√n): tolerancia muestral.
            const conGrupos = !!(this.diferenciasEfectivas && (this.diferenciasEfectivas.get(md.y) || []).length);
            const tolM = conGrupos ? Math.max(tol, 2 / Math.sqrt(Math.max(4, completos.length))) : tol;
            filas.push({ tipo: 'β₁', variable: `${etiqueta}: β₁ (${md.x})`, pedido: num(md.c1), obtenido: num(betas[0], 3), ok: Math.abs(betas[0] - md.c1) <= tolM });
            filas.push({ tipo: 'β₂', variable: `${etiqueta}: β₂ (${md.m})`, pedido: num(md.c2), obtenido: num(betas[1], 3), ok: Math.abs(betas[1] - md.c2) <= tolM });
            filas.push({ tipo: 'β₃', variable: `${etiqueta}: β₃ (${md.x} × ${md.m})`, pedido: num(md.c3), obtenido: num(betas[2], 3), ok: Math.abs(betas[2] - md.c3) <= tolM });
        });
    }
    // Coeficientes de regresión de y sobre los predictores, con y estandarizada
    // y (si estandarizarX) cada predictor estandarizado; si no, los predictores
    // entran tal cual (para el producto z_X·z_W). Mínimos cuadrados por
    // eliminación gaussiana (p pequeño). null si el sistema es singular.
    _betasEstandarizadas(y, predictores, estandarizarX = true) {
        const n = y.length, p = predictores.length;
        if (n < p + 3) return null;
        const est = arr => { const mu = arr.reduce((s, v) => s + v, 0) / n; const sd = Math.sqrt(arr.reduce((s, v) => s + (v - mu) ** 2, 0) / n); return sd > 0 ? arr.map(v => (v - mu) / sd) : null; };
        const yz = est(y);
        if (!yz) return null;
        const Xs = [];
        for (let j = 0; j < p; j++) {
            const c = estandarizarX ? est(predictores[j]) : (() => { const mu = predictores[j].reduce((s, v) => s + v, 0) / n; return predictores[j].map(v => v - mu); })();
            if (!c) return null;
            Xs.push(c);
        }
        // Ecuaciones normales A·β = g (todo centrado: sin intercepto)
        const A = Array.from({ length: p }, () => new Array(p + 1).fill(0));
        for (let j = 0; j < p; j++) {
            for (let k = j; k < p; k++) { let s = 0; for (let i = 0; i < n; i++) s += Xs[j][i] * Xs[k][i]; A[j][k] = s / n; A[k][j] = s / n; }
            let s = 0; for (let i = 0; i < n; i++) s += Xs[j][i] * yz[i]; A[j][p] = s / n;
        }
        for (let col = 0; col < p; col++) {
            let piv = col;
            for (let r = col + 1; r < p; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
            if (Math.abs(A[piv][col]) < 1e-12) return null;
            if (piv !== col) { const t = A[piv]; A[piv] = A[col]; A[col] = t; }
            for (let r = 0; r < p; r++) {
                if (r === col) continue;
                const f = A[r][col] / A[col][col];
                for (let c = col; c <= p; c++) A[r][c] -= f * A[col][c];
            }
        }
        return A.map((f, j) => f[p] / f[j]);
    }

    prepararCorrelaciones() {
        const variables = [];

        this.configuracion.pruebas.forEach(prueba => {
            variables.push({ tipo: 'escala', clave: this._claveEscala(prueba), nombre: prueba.nombre });
        });

        this.configuracion.sociodemograficos.forEach(socio => {
            if (socio.distribucion === 'normal' || socio.distribucion === 'asimetrica') {
                variables.push({ tipo: 'socio', clave: socio.categoriaCorta, nombre: socio.categoria });
            }
        });

        const indicePorNombre = {};
        variables.forEach((v, i) => { indicePorNombre[v.nombre] = i; });

        const m = variables.length;
        const R = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? 1 : 0)));

        const grupos = this.configuracion.gruposPruebas || [];
        const porSigla = {};
        this.configuracion.pruebas.forEach(p => { if (!p.sufijo) porSigla[p.nombreCorto] = p; });
        const explicitas = new Set();
        const fijar = (i, j, r, explicita) => {
            if (i === undefined || j === undefined || i === j) return;
            const k = i < j ? `${i}|${j}` : `${j}|${i}`;
            if (explicitas.has(k)) return;
            if (explicita) explicitas.add(k);
            const rF = Math.max(-0.99, Math.min(0.99, r));
            R[i][j] = rF; R[j][i] = rF;
        };
        const infoGeneral = {};
        grupos.forEach(g => {
            if (g.escalas.length < 2) return;
            const idx = g.escalas.map(s => indicePorNombre[(porSigla[s] || {}).nombre]).filter(i => i !== undefined);
            if (idx.length < 2) return;
            const de = idx.map(i => (porSigla[variables[i].clave] || {}).desviacion || 1);
            infoGeneral[this.nombreGeneral(g)] = { idx, de, rIntra: (g.rIntra === undefined ? 0.40 : g.rIntra) };
        });
        // (B6) Las correlaciones que IMPLICAN los modelos de mediación van
        // delante de la tabla III: mandan sobre cualquier pareja repetida.
        const correlacionesEfectivas = this._correlacionesImplicadasPorMediacion().concat(this.configuracion.correlaciones || []);
        this.correlacionesEfectivas = correlacionesEfectivas;
        correlacionesEfectivas.forEach(({ a, b, r }) => {
            const i = indicePorNombre[a], j = indicePorNombre[b];
            if (i !== undefined && j !== undefined) fijar(i, j, r, true);
        });
        Object.values(infoGeneral).forEach(info => {
            for (let a = 0; a < info.idx.length; a++) for (let b = a + 1; b < info.idx.length; b++)
                fijar(info.idx[a], info.idx[b], info.rIntra, false);
        });
        const varianzaG = info => {
            let v = 0;
            for (let a = 0; a < info.idx.length; a++) for (let b = 0; b < info.idx.length; b++)
                v += info.de[a] * info.de[b] * (a === b ? 1 : R[info.idx[a]][info.idx[b]]);
            return v;
        };
        const sumaDE = info => info.de.reduce((s, x) => s + x, 0);
        // Reparto exacto: corr(G,Y) = Σ DE_i·r_iY / √Var(G). Las parejas ya
        // fijadas explícitamente se DESCUENTAN y el resto se reparte entre las
        // dimensiones libres, de modo que el objetivo sobre el General se cumpla.
        const esExplicita = (i, j) => explicitas.has(i < j ? `${i}|${j}` : `${j}|${i}`);
        const repartir = (pares, objetivoCov) => {
            // pares: [{i, j, peso}] ; objetivoCov = Σ peso·r_ij deseado
            let fijado = 0, pesoLibre = 0;
            pares.forEach(p => {
                if (p.i === p.j) fijado += p.peso;                                   // General ↔ su propia dimensión: r(D, D) = 1
                else if (esExplicita(p.i, p.j)) fijado += p.peso * R[p.i][p.j];
                else pesoLibre += p.peso;
            });
            if (pesoLibre <= 0) return;
            const rho = (objetivoCov - fijado) / pesoLibre;
            pares.forEach(p => { if (!esExplicita(p.i, p.j)) fijar(p.i, p.j, rho, false); });
        };
        correlacionesEfectivas.forEach(({ a, b, r }) => {
            const gA = infoGeneral[a], gB = infoGeneral[b];
            const iA = indicePorNombre[a], iB = indicePorNombre[b];
            const rF = Math.max(-0.99, Math.min(0.99, r));
            if (gA && gB && a !== b) {
                const pares = [];
                gA.idx.forEach((i, ai) => gB.idx.forEach((j, bj) => pares.push({ i, j, peso: gA.de[ai] * gB.de[bj] })));
                repartir(pares, rF * Math.sqrt(varianzaG(gA) * varianzaG(gB)));
            } else if (gA && iB !== undefined) {
                repartir(gA.idx.map((i, ai) => ({ i, j: iB, peso: gA.de[ai] })), rF * Math.sqrt(varianzaG(gA)));
            } else if (gB && iA !== undefined) {
                repartir(gB.idx.map((j, bj) => ({ i: iA, j, peso: gB.de[bj] })), rF * Math.sqrt(varianzaG(gB)));
            }
        });
        // (B6) Moderación: Y = β₁X + β₂W + β₃·X·W + e. Sus correlaciones con X y W
        // las FIJAN los coeficientes: r(X,Y) = β₁ + β₂·ρ, r(W,Y) = β₂ + β₁·ρ, con
        // ρ = r(X,W) tal como quedó en la matriz (tabla III, relleno intra-test o 0).
        this.modelosModeracion = [];
        (this.configuracion.modelos || []).filter(md => md.tipo === 'moderacion').forEach(md => {
            const iX = indicePorNombre[md.x], iW = indicePorNombre[md.m], iY = indicePorNombre[md.y];
            if (iX === undefined || iW === undefined || iY === undefined || new Set([iX, iW, iY]).size < 3) return;
            const rho = R[iX][iW];
            const r2 = md.c1 * md.c1 + md.c2 * md.c2 + 2 * md.c1 * md.c2 * rho + md.c3 * md.c3 * (1 + rho * rho);
            if (!(r2 < 0.98)) return;   // la validación ya lo habrá rechazado
            const rXY = Math.max(-0.99, Math.min(0.99, md.c1 + md.c2 * rho)), rWY = Math.max(-0.99, Math.min(0.99, md.c2 + md.c1 * rho));
            R[iX][iY] = R[iY][iX] = rXY;
            R[iW][iY] = R[iY][iW] = rWY;
            // Modo NO exacto: la composición por fila usa los drivers ya con su
            // FORMA (lo que verá el analista, salvo recorte y redondeo); la
            // varianza del producto x̃·w̃ se estima por simulación porque con
            // formas no normales no vale 1 + ρ².
            const forma = (indice) => {
                const v = variables[indice];
                if (v.tipo === 'escala') { const p = this.configuracion.pruebas.find(x => this._claveEscala(x) === v.clave); const dist = p ? p.distribucion : 'normal'; return z => this.transformarFormaZ(z, dist); }
                const s = this.configuracion.sociodemograficos.find(x => x.categoriaCorta === v.clave);
                return z => this._formaSocioEstandar(s, z, this._factorDE(s.categoria));
            };
            const tx = forma(iX), tw = forma(iW);
            let sumaP = 0, sumaP2 = 0;
            const nSim = 3000;
            for (let k = 0; k < nSim; k++) {
                const z1 = this.generarNormalEstandar(), z2 = rho * z1 + Math.sqrt(1 - rho * rho) * this.generarNormalEstandar();
                const pr = tx(z1) * tw(z2); sumaP += pr; sumaP2 += pr * pr;
            }
            const mediaP = sumaP / nSim, varProducto = Math.max(0.05, sumaP2 / nSim - mediaP * mediaP);
            const r2Forma = md.c1 * md.c1 + md.c2 * md.c2 + 2 * md.c1 * md.c2 * mediaP + md.c3 * md.c3 * varProducto;
            this.modelosModeracion.push({ iX, iW, iY, b1: md.c1, b2: md.c2, b3: md.c3, rho, r2, x: md.x, w: md.m, y: md.y, tx, tw, mediaProducto: mediaP, r2Forma: Math.min(0.98, r2Forma) });
        });
        this.matrizForzada = false;
        this.correlVariables = variables;
        this.diagnosticoCorrelaciones = m > 0 ? this.diagnosticarMatriz(R, variables.map(v => v.nombre)) : { imposible: false, triadas: [], ajustes: [], R };
        this.correlR = this.diagnosticoCorrelaciones.R;
        // Las correlaciones pedidas sobre un General derivado no se factorizan:
        // se reparten entre sus dimensiones. Si el reparto no puede alcanzarlas
        // (p. ej. General ↔ una de sus propias dimensiones, cuya correlación
        // parte–todo viene casi fijada por la estructura), se informa la
        // implicada por la matriz final.
        const limitadasGeneral = [];
        const Rf = this.correlR;
        const covG = (info, j) => { let s = 0; info.idx.forEach((i, ai) => { s += info.de[ai] * (i === j ? 1 : Rf[i][j]); }); return s; };
        const varG = info => { let v = 0; info.idx.forEach((i, ai) => info.idx.forEach((j, bj) => { v += info.de[ai] * info.de[bj] * (i === j ? 1 : Rf[i][j]); })); return v; };
        correlacionesEfectivas.forEach(({ a, b, r }) => {
            const gA = infoGeneral[a], gB = infoGeneral[b];
            if (!gA && !gB) return;
            let implicada = null;
            if (gA && gB && a !== b) { let c = 0; gA.idx.forEach((i, ai) => gB.idx.forEach((j, bj) => { c += gA.de[ai] * gB.de[bj] * (i === j ? 1 : Rf[i][j]); })); implicada = c / Math.sqrt(varG(gA) * varG(gB)); }
            else if (gA && indicePorNombre[b] !== undefined) implicada = covG(gA, indicePorNombre[b]) / Math.sqrt(varG(gA));
            else if (gB && indicePorNombre[a] !== undefined) implicada = covG(gB, indicePorNombre[a]) / Math.sqrt(varG(gB));
            if (implicada !== null && isFinite(implicada) && Math.abs(implicada - r) > 0.01) limitadasGeneral.push({ a, b, pedido: r, alcanzable: implicada });
        });
        // Lo que se factoriza NO es la matriz pedida sino la INTERMEDIA: la que,
        // tras la DE intra-grupo, la covarianza entre grupos (A1) y las formas
        // no normales (A2), produce en la base exactamente la r pedida.
        const inter = this._matrizIntermedia(this.correlR, variables);
        this.correlRIntermedia = inter.R;
        this.diagnosticoCorrelaciones.limitadas = limitadasGeneral.concat(inter.limitadas);
        this.diagnosticoCorrelaciones.intermediaAjustada = inter.ajustada;
        this.correlL = m > 0 ? this.descomposicionCholesky(this.correlRIntermedia) : [];
        if (inter.ajustada) console.warn('[Generador] La matriz intermedia no era definida positiva: se usó la válida más cercana.');
        if (this.diagnosticoCorrelaciones.imposible) console.warn('[Generador] Correlaciones incompatibles: se usó la matriz válida más cercana.', this.diagnosticoCorrelaciones);
    }

    // ============ DIFERENCIAS POR GRUPO (d de Cohen) ============
    // Cada fila de la tabla pide que dos grupos adyacentes de la variable de
    // agrupación difieran d·σ_intra en la variable cuantitativa. Contrato:
    //  · la Media y la DE pedidas son las de TODA la base; cada d es la MARGINAL
    //    de su agrupación (la de la prueba t/ANOVA), con amplitud
    //    Δ_k = d_k·σ/√(1 + d_k²·Var(c_k)) y ruido intra σ·√(1 − Σ_k amp_k²·Var(c_k));
    //    el desplazamiento de cada persona es Σ_k Δ_k·(código − media del código), de media 0;
    //  · el desplazamiento se aplica al valor CONTINUO (total objetivo de la
    //    escala o valor del sociodemográfico), ANTES de recortar y redondear.
    //    Antes se sumaba después y se redondeaba a entero POR PERSONA: como el
    //    entero era el mismo para todo el grupo, no se promediaba, era sesgo
    //    (con DE = 6: d = 0.8 salía 0.65 y d = 1.2 salía 1.31);
    //  · una d sobre el puntaje GENERAL derivado se traduce a la d por
    //    dimensión que hace que la d medida sobre el General sea la pedida;
    //  · las correlaciones pedidas siguen siendo las de toda la base:
    //    _matrizIntermedia descuenta la varianza y la covarianza entre grupos.
    prepararDiferenciasGrupo() {
        const cfg = this.configuracion;
        const efectivas = new Map();   // nombre de variable → [{ agrup, d, origen }]
        const anadir = (nombre, agrup, d, origen, extraAmp) => {
            if (!efectivas.has(nombre)) efectivas.set(nombre, []);
            const entrada = { agrup, d, origen };
            if (extraAmp !== undefined) entrada.extraAmp = extraAmp;
            efectivas.get(nombre).push(entrada);
        };
        const grupos = cfg.gruposPruebas || [];
        const porSigla = {};
        (cfg.pruebas || []).forEach(p => { if (!p.sufijo) porSigla[p.nombreCorto] = p; });   // (B7) las ondas T2… no son dimensiones del General
        const vistas = new Set();          // (variable, agrupación) repetida: manda la primera fila, como en las correlaciones
        const sobreGeneral = [];
        (cfg.diferenciasGrupo || []).forEach(dif => {
            const agrup = (cfg.sociodemograficos || []).find(s => s.categoria === dif.agrupacion);
            const varC = this._varianzaCodigo(agrup);
            if (varC === null || !(typeof dif.d === 'number' && isFinite(dif.d)) || dif.d === 0) return;
            const clave = `${dif.cuantitativa}|${dif.agrupacion}`;
            if (vistas.has(clave)) return;
            vistas.add(clave);
            const esEscala = (cfg.pruebas || []).some(p => p.nombre === dif.cuantitativa);
            const esSocio = (cfg.sociodemograficos || []).some(s => s.categoria === dif.cuantitativa && !this._esSocioDiscreto(s));
            if (esEscala || esSocio) { anadir(dif.cuantitativa, agrup, dif.d, 'explicita', dif.extraAmp); return; }
            const g = grupos.find(x => x.escalas.length >= 2 && this.nombreGeneral(x) === dif.cuantitativa);
            if (!g) return;
            const dims = g.escalas.map(s => porSigla[s]).filter(Boolean);
            if (dims.length >= 2) sobreGeneral.push({ g, dims, agrup, varC, d: dif.d, nombre: dif.cuantitativa });
        });
        // Puntaje GENERAL derivado (promedio de K dimensiones): la d pedida se
        // traslada a las dimensiones LIBRES (sin d explícita en esa agrupación),
        // con la misma d para todas ellas, de modo que la d medida sobre el
        // General sea la pedida. Es una raíz escalar (Δ_G/σ_G,intra = d) que se
        // resuelve por bisección; con varias agrupaciones sobre el mismo General
        // se repite el reparto hasta estabilizarse.
        // CONTRATO (d MARGINAL): cada d es la que medirá la prueba t/ANOVA de ESA
        // agrupación, es decir, con la DE agrupada dentro de sus grupos, que
        // incluye la varianza que aportan las OTRAS agrupaciones. Con la DE total
        // fija, la amplitud del desplazamiento de la agrupación k resulta
        // independiente de las demás: Δ_k = d_k·σ/√(1 + d_k²·Var(c_k)) (en unidades
        // de σ, amp_k = d_k/√(1 + d_k²·V_k)), y la DE del ruido intra queda
        // σ·√(1 − Σ_k amp_k²·V_k). Con una sola agrupación coincide con la fórmula
        // anterior; con varias, la anterior subestimaba cada d (1.17 salía 1.03).
        const varianzaCodigo = agrup => this._varianzaCodigo(agrup) || 0;
        const amplitud = e => e.d / Math.sqrt(1 + e.d * e.d * varianzaCodigo(e.agrup));
        const factorIntra = nombre => {
            let entre = 0;
            (efectivas.get(nombre) || []).forEach(e => { const a = amplitud(e); entre += a * a * varianzaCodigo(e.agrup); });
            // Si las diferencias pedidas se llevan toda la varianza no hay ruido
            // intra posible: se deja un mínimo (el informe delatará las d).
            return Math.sqrt(Math.max(0.04, 1 - entre));
        };
        const dGeneral = (req) => {
            // d marginal observada sobre el General con las diferencias efectivas
            // actuales: Δ_G,k = (1/K)·Σ_i amp_ik·σ_i ; DE agrupada de esa
            // agrupación = √(σ_G² − Δ_G,k²·Var(c_k))
            const K = req.dims.length;
            const sigmaG = this._factorGeneral(req.g, req.dims) * req.dims.reduce((s, p) => s + p.desviacion, 0) / K;
            let deltaG = 0;
            req.dims.forEach(p => {
                (efectivas.get(p.nombre) || []).forEach(e => { if (e.agrup === req.agrup) deltaG += amplitud(e) * p.desviacion / K; });
            });
            const intra = Math.sqrt(Math.max(1e-12, sigmaG * sigmaG - deltaG * deltaG * varianzaCodigo(req.agrup)));
            return deltaG / intra;
        };
        this.diferenciasLimitadas = [];
        for (let ronda = 0; ronda < (sobreGeneral.length > 1 ? 4 : 1); ronda++) {
            sobreGeneral.forEach(req => {
                const libres = req.dims.filter(p => !(efectivas.get(p.nombre) || []).some(e => e.agrup === req.agrup && e.origen === 'explicita'));
                // quitar lo repartido en rondas anteriores para este General y agrupación
                req.dims.forEach(p => { if (efectivas.has(p.nombre)) efectivas.set(p.nombre, efectivas.get(p.nombre).filter(e => !(e.origen === req.nombre && e.agrup === req.agrup))); });
                if (!libres.length) {
                    if (ronda === 0) this.diferenciasLimitadas.push({ variable: req.nombre, agrupacion: req.agrup.categoria, pedido: req.d, alcanzable: dGeneral(req) });
                    return;
                }
                const probar = dLibre => { libres.forEach(p => anadir(p.nombre, req.agrup, dLibre, req.nombre)); const v = dGeneral(req); libres.forEach(p => efectivas.set(p.nombre, efectivas.get(p.nombre).filter(e => !(e.origen === req.nombre && e.agrup === req.agrup)))); return v; };
                // Rango de búsqueda ±3 (una d mayor no es plausible en psicología).
                // Si ni así se alcanza (las d explícitas de otras dimensiones tiran
                // en contra, y el desplazamiento absoluto d·σ·s está acotado porque
                // la DE total se mantiene), NO se fuerza nada: el General queda como
                // lo dejan sus dimensiones y se informa.
                let lo = -3, hi = 3;
                if (probar(lo) > req.d || probar(hi) < req.d) {
                    if (ronda === 0) this.diferenciasLimitadas.push({ variable: req.nombre, agrupacion: req.agrup.categoria, pedido: req.d, alcanzable: dGeneral(req) });
                    return;
                }
                for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (probar(mid) < req.d) lo = mid; else hi = mid; }
                libres.forEach(p => anadir(p.nombre, req.agrup, (lo + hi) / 2, req.nombre));
            });
        }
        // (B7) Las ondas T2… heredan las d que el General derivado trasladó a su
        // dimensión base (el General se forma solo con la onda 1, pero la
        // diferencia de grupo del rasgo debe persistir en las ondas siguientes).
        // Si la onda ya lleva un cambio diferencial por esa agrupación, se
        // recompone en amplitud: amp = amp(d heredada) + extraAmp.
        (cfg.pruebas || []).forEach(p => {
            if (!p.base) return;
            (efectivas.get(p.base.nombre) || []).filter(e => e.origen !== 'explicita').forEach(e => {
                const propia = (efectivas.get(p.nombre) || []).find(x => x.agrup === e.agrup);
                if (!propia) { anadir(p.nombre, e.agrup, e.d, e.origen); return; }
                if (propia.extraAmp !== undefined) {
                    const V = this._varianzaCodigo(e.agrup) || 0;
                    const amp = e.d / Math.sqrt(1 + e.d * e.d * V) + propia.extraAmp;
                    propia.d = amp / Math.sqrt(Math.max(0.05, 1 - amp * amp * V));
                }
            });
        });
        const factores = new Map();
        efectivas.forEach((lista, nombre) => {
            lista.forEach(e => { e.amplitud = amplitud(e); });   // en unidades de σ de la variable
            factores.set(nombre, factorIntra(nombre));
        });
        this.diferenciasEfectivas = efectivas;
        this.factoresDEIntra = factores;
    }
    _esSocioDiscreto(socio) {
        const d = socio.distribucion || 'normal';
        return d === 'binaria' || d === 'categorica' || d === 'conteo';
    }
    // Varianza del código de una variable de agrupación: binaria p(1 − p);
    // categórica equiprobable con K niveles (K² − 1)/12. null si no agrupa.
    _varianzaCodigo(agrup) {
        if (!agrup) return null;
        if (agrup.distribucion === 'binaria') {
            const p = agrup.promedio;
            return (p > 0 && p < 1) ? p * (1 - p) : 0;
        }
        if (agrup.distribucion === 'categorica') {
            const K = Math.floor(agrup.maximo - agrup.minimo + 1);
            return K >= 1 ? (K * K - 1) / 12 : 0;
        }
        return null;
    }
    // Código centrado en su MEDIA (binaria: código − p; categórica: código −
    // (mín + máx)/2), para que el desplazamiento tenga media 0 y la Media de la
    // variable en toda la base siga siendo la pedida.
    _codigoCentrado(agrup, codigo) {
        if (!(typeof codigo === 'number' && isFinite(codigo))) return 0;
        if (agrup.distribucion === 'binaria') return codigo - agrup.promedio;
        if (agrup.distribucion === 'categorica') return codigo - (agrup.minimo + agrup.maximo) / 2;
        return 0;
    }
    // σ_G/(Σσ_i/K) del General de un test con las correlaciones OBJETIVO entre
    // sus dimensiones (parejas explícitas de la tabla III o, si no, el r intra).
    _factorGeneral(g, dims) {
        const K = dims.length;
        if (K < 2) return 1;
        const rIntra = g.rIntra === undefined ? 0.40 : g.rIntra;
        // Mismas correlaciones que quedarán en la matriz: las implicadas por los
        // modelos (mediación y moderación) mandan sobre la tabla III (B6)
        const explicitas = this._correlacionesImplicadasPorModelos().concat(this.configuracion.correlaciones || []);
        let v = 0, suma = 0;
        for (let a = 0; a < K; a++) {
            suma += dims[a].desviacion;
            for (let b = 0; b < K; b++) {
                let r = 1;
                if (a !== b) {
                    const e = explicitas.find(c => (c.a === dims[a].nombre && c.b === dims[b].nombre) || (c.a === dims[b].nombre && c.b === dims[a].nombre));
                    r = e ? Math.max(-0.99, Math.min(0.99, e.r)) : rIntra;
                }
                v += dims[a].desviacion * dims[b].desviacion * r;
            }
        }
        return suma > 0 ? Math.sqrt(Math.max(v, 1e-12)) / suma : 1;
    }
    // Factor DE intra-grupo / DE total de una variable (1 si no tiene diferencias).
    _factorDE(nombre) {
        const f = this.factoresDEIntra ? this.factoresDEIntra.get(nombre) : undefined;
        return f === undefined ? 1 : f;
    }
    // DE de un sociodemográfico como variable cuantitativa: la pedida o, para la
    // uniforme continua (que no la tiene), (máx − mín)/√12.
    _deEfectiva(socio) {
        if (typeof socio.desviacion === 'number' && isFinite(socio.desviacion) && socio.desviacion > 0) return socio.desviacion;
        if (socio.distribucion === 'uniforme' && isFinite(socio.minimo) && isFinite(socio.maximo)) return (socio.maximo - socio.minimo) / Math.sqrt(12);
        return 0;
    }
    // Igual, pero sorteando los códigos de grupo: para calibrar la fiabilidad
    // con la misma estructura entre grupos que tendrá la base.
    _desplazamientoAleatorio(nombre, sigmaTotal) {
        const lista = this.diferenciasEfectivas ? this.diferenciasEfectivas.get(nombre) : undefined;
        if (!lista || !lista.length || !(sigmaTotal > 0)) return 0;
        let total = 0;
        lista.forEach(e => {
            const codigo = e.agrup.distribucion === 'binaria' ? this.generarBinaria(e.agrup.promedio)
                : this.generarCategoria(e.agrup.minimo, e.agrup.maximo);
            total += e.amplitud * sigmaTotal * this._codigoCentrado(e.agrup, codigo);
        });
        return total;
    }
    // Columnas de diseño de los grupos con diferencias (binaria: una columna;
    // categórica: una columna indicadora por nivel salvo el primero), para
    // hacer los drivers ortogonales a ellas en modo exacto.
    _matrizCodigosGrupo(base) {
        const usados = new Map();
        if (this.diferenciasEfectivas) this.diferenciasEfectivas.forEach(lista => lista.forEach(e => usados.set(e.agrup.categoria, e.agrup)));
        const columnas = [];
        usados.forEach(agrup => {
            const valores = Array.from(base.columna(agrup.categoria).datos);
            if (agrup.distribucion === 'binaria') columnas.push(valores.map(v => (v === 1 ? 1 : 0)));
            else if (agrup.distribucion === 'categorica') {
                for (let nivel = agrup.minimo + 1; nivel <= agrup.maximo; nivel++) columnas.push(valores.map(v => (v === nivel ? 1 : 0)));
            }
        });
        // Solo columnas con varianza (un nivel ausente en la muestra sería una
        // columna nula y haría singular XᵀX).
        return columnas.filter(c => { const s = c.reduce((a, b) => a + b, 0); return s > 0 && s < c.length; });
    }
    // Residualiza cada columna de Z (n × m) contra [1 | X] por mínimos cuadrados:
    // Z ← Z − X·(XᵀX)⁻¹·XᵀZ. Deja las medias de grupo de cada driver en 0 exacto.
    _ortogonalizarContraCodigos(Z, X) {
        const n = Z.length, m = Z[0].length, q = X.length + 1;
        if (X.length === 0 || n <= q + m + 2) return Z;
        this.driversOrtogonalizados = true;
        const col = j => (j === 0 ? null : X[j - 1]);
        const G = Array.from({ length: q }, () => new Array(q).fill(0));
        for (let a = 0; a < q; a++) for (let b = a; b < q; b++) {
            let s = 0;
            const ca = col(a), cb = col(b);
            for (let i = 0; i < n; i++) s += (ca ? ca[i] : 1) * (cb ? cb[i] : 1);
            G[a][b] = G[b][a] = s;
        }
        const L = this.descomposicionCholesky(G), Linv = this._inversaTriangularInferior(L);
        const Ginv = Array.from({ length: q }, (_, a) => Array.from({ length: q }, (_, b) => {
            let s = 0; for (let k = 0; k < q; k++) s += Linv[k][a] * Linv[k][b]; return s;
        }));
        for (let j = 0; j < m; j++) {
            const xtz = new Array(q).fill(0);
            for (let a = 0; a < q; a++) { const ca = col(a); let s = 0; for (let i = 0; i < n; i++) s += (ca ? ca[i] : 1) * Z[i][j]; xtz[a] = s; }
            const beta = new Array(q).fill(0);
            for (let a = 0; a < q; a++) { let s = 0; for (let k = 0; k < q; k++) s += Ginv[a][k] * xtz[k]; beta[a] = s; }
            for (let i = 0; i < n; i++) { let s = beta[0]; for (let a = 1; a < q; a++) s += X[a - 1][i] * beta[a]; Z[i][j] -= s; }
        }
        return Z;
    }
    // Hay estructura de correlación que preparar si: tabla III no vacía, algún
    // test con ≥ 2 dimensiones y r intra ≠ 0, o diferencias por grupo en modo
    // exacto (para que los drivers existan y se ortogonalicen a los grupos).
    _hayEstructuraDeCorrelacion() {
        const cfg = this.configuracion;
        if ((cfg.correlaciones || []).length > 0) return true;
        if ((cfg.modelos || []).length > 0) return true;
        if ((cfg.gruposPruebas || []).some(g => g.escalas.length >= 2 && (g.rIntra === undefined ? 0.40 : g.rIntra) !== 0)) return true;
        return cfg.correlacionesExactas !== false && !!this.diferenciasEfectivas && this.diferenciasEfectivas.size > 0;
    }

    // ============ MEDIDAS REPETIDAS (B7) ============
    // Ondas T2…TK de una escala. Contrato:
    //  · la onda 1 es la escala tal cual (mismos nombres de columna);
    //  · la onda k es un CLON (mismos ítems, α, forma, perfil de ítems) con
    //    sufijo «_Tk» en ítems, total y percentil, y media
    //    M + σ·[(1 − p₁)·c₀ + p₁·c₁]·(k − 1)/(K − 1), con c₀ la d de cambio
    //    (global o del grupo 0) y c₁ la del grupo 1 (p₁ = proporción de unos);
    //  · estabilidad AR(1): r(Tj, Tk) = estabilidad^|j − k|, exacta en modo exacto;
    //  · las correlaciones de la base con otras variables (tabla III, modelos e
    //    intra-test) se propagan a cada onda atenuadas por estabilidad^(k − 1);
    //  · las diferencias por grupo de la base se mantienen en cada onda, y el
    //    cambio diferencial por grupo entra como d adicional (c₁ − c₀)·frac;
    //  · los puntajes generales derivados y los modelos usan solo la onda 1.
    _expandirConfiguracion(cfg) {
        const lista = (cfg && cfg.medidasRepetidas) || [];
        if (!lista.length || (cfg.pruebas || []).some(p => p.sufijo)) return cfg;
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
                clones.push(clon);
                nueva.pruebas.push(clon);
            }
            ondasDe.set(p.nombre, { mr, clones, stab: Math.max(-0.99, Math.min(0.99, mr.estabilidad)), agrup, c0, c1, K });
        });
        // Correlaciones efectivas de la configuración base: implicadas por
        // mediación, tabla III y relleno intra-test (manda la primera aparición).
        const par = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
        const efectivas = new Map();
        const anotar = (a, b, r) => { const k = par(a, b); if (!efectivas.has(k)) efectivas.set(k, { a, b, r }); };
        const guardado = this.configuracion;
        this.configuracion = cfg;
        try { this._correlacionesImplicadasPorModelos().forEach(c => anotar(c.a, c.b, c.r)); } finally { this.configuracion = guardado; }
        (cfg.correlaciones || []).forEach(c => anotar(c.a, c.b, c.r));
        (cfg.gruposPruebas || []).forEach(g => {
            if (g.escalas.length < 2) return;
            const rIntra = g.rIntra === undefined ? 0.40 : g.rIntra;
            const nombres = g.escalas.map(s => ((cfg.pruebas || []).find(p => p.nombreCorto === s && !p.sufijo) || {}).nombre).filter(Boolean);
            for (let i = 0; i < nombres.length; i++) for (let j = i + 1; j < nombres.length; j++) anotar(nombres[i], nombres[j], rIntra);
        });
        ondasDe.forEach(({ clones, stab }, nombre) => {
            // estabilidad entre ondas (AR(1)); van DELANTE para que manden
            const ondas = [{ nombre, onda: 1 }].concat(clones.map(c => ({ nombre: c.nombre, onda: c.onda })));
            for (let i = 0; i < ondas.length; i++) for (let j = i + 1; j < ondas.length; j++) {
                nueva.correlaciones.unshift({ a: ondas[i].nombre, b: ondas[j].nombre, r: Math.pow(stab, ondas[j].onda - ondas[i].onda), origen: 'repetidas' });
            }
            // correlaciones de la base con las demás variables, atenuadas por onda
            efectivas.forEach(c => {
                if (c.a !== nombre && c.b !== nombre) return;
                const otro = c.a === nombre ? c.b : c.a;
                const otroRep = ondasDe.get(otro);
                clones.forEach(cl => {
                    nueva.correlaciones.push({ a: cl.nombre, b: otro, r: c.r * Math.pow(stab, cl.onda - 1), origen: 'repetidas' });
                });
                // el otro también es repetido: onda × onda con atenuación de ambos
                // lados, añadido una sola vez (desde el nombre menor)
                if (otroRep && otro > nombre) {
                    clones.forEach(cl => otroRep.clones.forEach(ol => {
                        nueva.correlaciones.push({ a: cl.nombre, b: ol.nombre, r: c.r * Math.pow(stab, cl.onda - 1) * Math.pow(otroRep.stab, ol.onda - 1), origen: 'repetidas' });
                    }));
                }
            });
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
                if (d.cuantitativa === nombre) clones.forEach(cl => nueva.diferenciasGrupo.push({ cuantitativa: cl.nombre, agrupacion: d.agrupacion, d: d.d }));
            });
            if (agrup && c1 !== c0) {
                const V = this._varianzaCodigo(agrup) || 0;
                const base = (cfg.diferenciasGrupo || []).find(x => x.cuantitativa === nombre && x.agrupacion === agrup.categoria);
                const d1 = base ? base.d : 0;
                const amp1 = d1 / Math.sqrt(1 + d1 * d1 * V);
                clones.forEach(cl => {
                    const extraAmp = (c1 - c0) * (cl.onda - 1) / (K - 1);
                    const ampK = amp1 + extraAmp;
                    const dK = ampK / Math.sqrt(Math.max(0.05, 1 - ampK * ampK * V));
                    const previa = nueva.diferenciasGrupo.find(x => x.cuantitativa === cl.nombre && x.agrupacion === agrup.categoria);
                    // extraAmp queda anotado: si la base hereda una d de su General
                    // por esta misma agrupación, prepararDiferenciasGrupo la recompone
                    if (previa) { previa.d = dK; previa.extraAmp = extraAmp; }
                    else nueva.diferenciasGrupo.push({ cuantitativa: cl.nombre, agrupacion: agrup.categoria, d: dK, extraAmp });
                });
            }
        });
        return nueva;
    }

    // ============ MODELOS ESTRUCTURALES (B6) ============
    // MEDIACIÓN X → M → Y con coeficientes estandarizados a (X→M), b (M→Y|X) y
    // c′ (X→Y|M). Es un modelo lineal: equivale exactamente a una matriz de
    // correlaciones, así que se traduce a correlaciones y el resto del motor
    // (exactitud, formas, grupos) la trata como a las de la tabla III:
    //   r(X,M) = a · r(X,Y) = c′ + a·b · r(M,Y) = b + a·c′
    // Con varios mediadores sobre el mismo par (X,Y) — mediación paralela — se
    // suponen residuos incorrelados: r(Mi,Mj) = ai·aj (salvo pareja explícita),
    // r(Mi,Y) = bi + ai·c′ + Σ_{j≠i} bj·r(Mi,Mj), r(X,Y) = c′ + Σ ai·bi.
    _correlacionesImplicadasPorMediacion() {
        const cfg = this.configuracion, salida = [];
        const par = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
        const explicitas = new Map((cfg.correlaciones || []).map(c => [par(c.a, c.b), c.r]));
        const grupos = new Map();   // par(X,Y) → { x, y, cprima, mediadores: [{m, a, b}] }
        (cfg.modelos || []).filter(md => md.tipo === 'mediacion').forEach(md => {
            if (new Set([md.x, md.m, md.y]).size < 3) return;
            const clave = par(md.x, md.y);
            if (!grupos.has(clave)) grupos.set(clave, { x: md.x, y: md.y, cprima: md.c3, mediadores: [] });
            const g = grupos.get(clave);
            if (g.mediadores.some(q => q.m === md.m)) return;   // mediador repetido: manda el primero
            g.mediadores.push({ m: md.m, a: md.c1, b: md.c2 });
        });
        grupos.forEach(g => {
            const rMM = (i, j) => { const k = par(g.mediadores[i].m, g.mediadores[j].m); return explicitas.has(k) ? explicitas.get(k) : g.mediadores[i].a * g.mediadores[j].a; };
            g.mediadores.forEach((q, i) => {
                salida.push({ a: g.x, b: q.m, r: q.a, origen: 'mediación' });
                let rMY = q.b + q.a * g.cprima;
                g.mediadores.forEach((p, j) => { if (j !== i) rMY += p.b * rMM(i, j); });
                salida.push({ a: q.m, b: g.y, r: rMY, origen: 'mediación' });
                for (let j = i + 1; j < g.mediadores.length; j++) {
                    const k = par(q.m, g.mediadores[j].m);
                    if (!explicitas.has(k)) salida.push({ a: q.m, b: g.mediadores[j].m, r: rMM(i, j), origen: 'mediación' });
                }
            });
            salida.push({ a: g.x, b: g.y, r: g.cprima + g.mediadores.reduce((s, q) => s + q.a * q.b, 0), origen: 'mediación' });
        });
        return salida;
    }
    // Correlaciones implicadas por TODOS los modelos: las de mediación más las
    // que fija una moderación (r(X,Y) = β₁ + β₂ρ, r(W,Y) = β₂ + β₁ρ, con ρ el
    // r(X,W) de la tabla III, el intra-test si comparten test, o 0). Es lo que
    // usan la DE del General (_factorGeneral) y la expansión de ondas.
    _correlacionesImplicadasPorModelos() {
        const cfg = this.configuracion;
        const salida = this._correlacionesImplicadasPorMediacion();
        const par = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
        const explicitas = new Map((cfg.correlaciones || []).map(c => [par(c.a, c.b), c.r]));
        const rEntre = (a, b) => {
            const k = par(a, b);
            if (explicitas.has(k)) return explicitas.get(k);
            const imp = salida.find(c => par(c.a, c.b) === k);
            if (imp) return imp.r;
            const pa = (cfg.pruebas || []).find(p => p.nombre === a && !p.sufijo), pb = (cfg.pruebas || []).find(p => p.nombre === b && !p.sufijo);
            if (pa && pb && pa.prueba && pa.prueba === pb.prueba) { const g = (cfg.gruposPruebas || []).find(x => x.nombre === pa.prueba); return g && g.rIntra !== undefined ? g.rIntra : 0.40; }
            return 0;
        };
        (cfg.modelos || []).filter(md => md.tipo === 'moderacion').forEach(md => {
            if (new Set([md.x, md.m, md.y]).size < 3) return;
            const rho = rEntre(md.x, md.m);
            salida.push({ a: md.x, b: md.y, r: Math.max(-0.99, Math.min(0.99, md.c1 + md.c2 * rho)), origen: 'moderación' });
            salida.push({ a: md.m, b: md.y, r: Math.max(-0.99, Math.min(0.99, md.c2 + md.c1 * rho)), origen: 'moderación' });
        });
        return salida;
    }
    // Pares fijados por algún modelo (la tabla III no manda sobre ellos).
    _paresFijadosPorModelos() {
        const par = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
        const pares = new Set();
        this._correlacionesImplicadasPorMediacion().forEach(c => pares.add(par(c.a, c.b)));
        (this.configuracion.modelos || []).filter(md => md.tipo === 'moderacion').forEach(md => { pares.add(par(md.x, md.y)); pares.add(par(md.m, md.y)); });
        return pares;
    }
    // MODERACIÓN: el driver de Y se compone en el espacio normal de los drivers,
    //   z_Y = β₁·z_X + β₂·z_W + β₃·(z_X·z_W − ρ) + √(1 − R²)·e_Y,
    // con R² = β₁² + β₂² + 2β₁β₂ρ + β₃²(1 + ρ²), de modo que Var(z_Y) = 1 y el
    // término de interacción queda incorrelado con X y W (normales centradas).
    // e_Y es el driver «propio» de Y que sale del Cholesky: en la matriz
    // intermedia la fila de Y es la de ESE residuo (ver _aResidualModeracion).
    _aplicarModeracion(fila) {
        const modelos = this.modelosModeracion;
        if (!modelos || !modelos.length) return fila;
        for (let k = 0; k < modelos.length; k++) {
            const md = modelos[k];
            const zx = md.tx ? md.tx(fila[md.iX]) : fila[md.iX], zw = md.tw ? md.tw(fila[md.iW]) : fila[md.iW];
            const s = this._factorDE(md.y) || 1;   // criterio con grupos: β sobre la parte intra (ver _componerCriterio)
            const b1 = md.b1 / s, b2 = md.b2 / s, b3 = md.b3 / s;
            const r2 = Math.min(0.98, (md.r2Forma !== undefined ? md.r2Forma : md.r2) / (s * s)), mediaP = md.mediaProducto !== undefined ? md.mediaProducto : md.rho;
            fila[md.iY] = b1 * zx + b2 * zw + b3 * (zx * zw - mediaP) + Math.sqrt(Math.max(0, 1 - r2)) * fila[md.iY];
        }
        return fila;
    }
    // Residualiza `col` contra las columnas X (con intercepto) por mínimos
    // cuadrados; sin efectos secundarios. Devuelve un Float64Array nuevo.
    _residualizarColumna(col, columnasX) {
        const n = col.length, q = columnasX.length + 1;
        const x = j => (j === 0 ? null : columnasX[j - 1]);
        const G = Array.from({ length: q }, () => new Array(q).fill(0)), g = new Array(q).fill(0);
        for (let a = 0; a < q; a++) {
            const ca = x(a);
            for (let b = a; b < q; b++) { const cb = x(b); let s = 0; for (let i = 0; i < n; i++) s += (ca ? ca[i] : 1) * (cb ? cb[i] : 1); G[a][b] = G[b][a] = s; }
            let s = 0; for (let i = 0; i < n; i++) s += (ca ? ca[i] : 1) * col[i]; g[a] = s;
        }
        const L = this.descomposicionCholesky(G), Linv = this._inversaTriangularInferior(L);
        const beta = new Array(q).fill(0);
        for (let a = 0; a < q; a++) { let s = 0; for (let k = 0; k < q; k++) { let gik = 0; for (let r = 0; r < q; r++) gik += Linv[r][a] * Linv[r][k]; s += gik * g[k]; } beta[a] = s; }
        const out = new Float64Array(n);
        for (let i = 0; i < n; i++) { let s = beta[0]; for (let a = 1; a < q; a++) s += columnasX[a - 1][i] * beta[a]; out[i] = col[i] - s; }
        return out;
    }
    // Pasa la fila/columna de cada criterio de moderación de la matriz OBJETIVO
    // (Pearson entre variables finales) al espacio de su residuo e_Y:
    //   r(e_Y, V) = (r(Y,V) − β₁·r(X,V) − β₂·r(W,V)) / √(1 − R²),  r(e_Y, X) = r(e_Y, W) = 0.
    _aResidualModeracion(R) {
        const modelos = this.modelosModeracion;
        if (!modelos || !modelos.length) return R;
        const S = R.map(f => f.slice());
        const m = S.length;
        modelos.forEach(md => {
            const escala = 1 / Math.sqrt(Math.max(1e-6, 1 - md.r2));
            for (let v = 0; v < m; v++) {
                if (v === md.iY) continue;
                const r = (v === md.iX || v === md.iW) ? 0 : Math.max(-0.99, Math.min(0.99, (S[md.iY][v] - md.b1 * S[md.iX][v] - md.b2 * S[md.iW][v]) * escala));
                S[md.iY][v] = S[v][md.iY] = r;
            }
        });
        return S;
    }

    // ============ CORRELACIÓN INTERMEDIA (Vale–Maurelli + grupos) ============
    // La r pedida es de Pearson sobre las variables FINALES de toda la base. El
    // driver es normal y solo gobierna la parte intra-grupo, y las formas
    // «asimétrica» (log-normal) y «uniforme» lo transforman de manera monótona
    // pero no lineal, lo que atenúa la r de Pearson (0.60 salía 0.56 entre dos
    // asimétricas). Para cada pareja: (1) se descuenta la varianza y la
    // covarianza entre grupos, r_ij = s_i·s_j·ρ_ij + b_ij; (2) se invierte la
    // forma, ρ* = T⁻¹(ρ_ij). Es la matriz de ρ* la que se factoriza.
    _formaMarginal(variable) {
        if (variable.tipo === 'escala') {
            const p = (this.configuracion.pruebas || []).find(x => this._claveEscala(x) === variable.clave);
            const dist = p ? p.distribucion : 'normal';
            if (dist === 'asimetrica') return { forma: 'lognormal', orden: 2, sigma: SIGMA_FORMA_ASIMETRICA };
            if (dist === 'uniforme') return { forma: 'uniforme', orden: 1, sigma: 0 };
            return { forma: 'normal', orden: 0, sigma: 0 };
        }
        const s = (this.configuracion.sociodemograficos || []).find(x => x.categoriaCorta === variable.clave);
        if (s && s.distribucion === 'asimetrica') {
            // misma σ que generarAsimetrico con la DE intra-grupo: σ² = ln(1 + DE²/M²)
            const m = Math.max(1e-6, s.promedio), de = s.desviacion * this._factorDE(s.categoria);
            return { forma: 'lognormal', orden: 2, sigma: Math.sqrt(Math.log(1 + (de * de) / (m * m))) };
        }
        return { forma: 'normal', orden: 0, sigma: 0 };
    }
    // Pearson entre T_a(Z₁) y T_b(Z₂) cuando corr(Z₁, Z₂) = ρ, para las formas del
    // generador (normal: z; uniforme: Φ(z); log-normal: e^{σz}). Todas cerradas
    // (lema de Stein e inclinación exponencial):
    //   N–N: ρ · U–U: (6/π)·asen(ρ/2) · N–U: ρ·√(3/π) · N–LN: ρ·σ/√(e^{σ²}−1)
    //   U–LN: (Φ(ρσ/√2) − ½)·√12/√(e^{σ²}−1) · LN–LN: (e^{σₐσᵦρ} − 1)/√((e^{σₐ²}−1)(e^{σᵦ²}−1))
    _rTransformada(fa, fb, rho) {
        const [x, y] = fa.orden <= fb.orden ? [fa, fb] : [fb, fa];
        switch (x.forma + '-' + y.forma) {
            case 'normal-normal': return rho;
            case 'normal-uniforme': return rho * Math.sqrt(3 / Math.PI);
            case 'uniforme-uniforme': return (6 / Math.PI) * Math.asin(rho / 2);
            case 'normal-lognormal': return rho * y.sigma / Math.sqrt(Math.expm1(y.sigma * y.sigma));
            case 'uniforme-lognormal': return (this.normalCDF(rho * y.sigma / Math.SQRT2) - 0.5) * Math.sqrt(12) / Math.sqrt(Math.expm1(y.sigma * y.sigma));
            case 'lognormal-lognormal': return Math.expm1(x.sigma * y.sigma * rho) / Math.sqrt(Math.expm1(x.sigma * x.sigma) * Math.expm1(y.sigma * y.sigma));
        }
        return rho;
    }
    // Inversa de la anterior: ρ del espacio normal que produce la Pearson r. Si
    // r no es alcanzable con esas formas, se acota a ±0.99 y se marca.
    _rhoIntermedia(fa, fb, r) {
        const [x, y] = fa.orden <= fb.orden ? [fa, fb] : [fb, fa];
        const tope = 0.99;
        let rho;
        switch (x.forma + '-' + y.forma) {
            case 'normal-normal': rho = r; break;
            case 'normal-uniforme': rho = r * Math.sqrt(Math.PI / 3); break;
            case 'uniforme-uniforme': rho = 2 * Math.sin(Math.PI * Math.max(-1, Math.min(1, r)) / 6); break;
            case 'normal-lognormal': rho = r * Math.sqrt(Math.expm1(y.sigma * y.sigma)) / y.sigma; break;
            case 'uniforme-lognormal': {
                const p = 0.5 + r * Math.sqrt(Math.expm1(y.sigma * y.sigma) / 12);
                rho = (p > 0 && p < 1) ? Math.SQRT2 * this.normalInversa(p) / y.sigma : (r > 0 ? Infinity : -Infinity);
                break;
            }
            case 'lognormal-lognormal': {
                const arg = 1 + r * Math.sqrt(Math.expm1(x.sigma * x.sigma) * Math.expm1(y.sigma * y.sigma));
                rho = arg > 0 ? Math.log(arg) / (x.sigma * y.sigma) : -Infinity;
                break;
            }
            default: rho = r;
        }
        if (!isFinite(rho)) rho = rho > 0 ? Infinity : -Infinity;
        const limitada = !(Math.abs(rho) <= tope);
        return { rho: Math.max(-tope, Math.min(tope, rho)), limitada };
    }
    // Inversa de la normal estándar Φ⁻¹(p): algoritmo de Acklam (error relativo
    // < 1.2·10⁻⁹ en todo el dominio).
    normalInversa(p) {
        if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
        const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
        const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
        const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
        const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
        const pBajo = 0.02425;
        if (p < pBajo) {
            const q = Math.sqrt(-2 * Math.log(p));
            return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
        }
        if (p > 1 - pBajo) {
            const q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
        }
        const q = p - 0.5, r = q * q;
        return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    _matrizIntermedia(Robjetivo, variables) {
        // (B6) criterios de moderación: su fila pasa al espacio del residuo e_Y
        const R = this._aResidualModeracion(Robjetivo);
        const m = R.length, limitadas = [];
        const formas = variables.map(v => this._formaMarginal(v));
        const nombres = variables.map(v => v.nombre);
        const s = nombres.map(nm => this._factorDE(nm));
        const lista = nm => (this.diferenciasEfectivas && this.diferenciasEfectivas.get(nm)) || [];
        const Rint = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? 1 : 0)));
        for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) {
            const r = R[i][j];
            // covarianza entre grupos compartida (misma agrupación en ambas
            // variables): Σ_k amp_ik·amp_jk·Var(c_k), en unidades de σ_i·σ_j
            let b = 0;
            lista(nombres[i]).forEach(ei => lista(nombres[j]).forEach(ej => {
                if (ei.agrup === ej.agrup) b += ei.amplitud * ej.amplitud * this._varianzaCodigo(ei.agrup);
            }));
            const rhoIntra = (r - b) / (s[i] * s[j]);
            const inv = this._rhoIntermedia(formas[i], formas[j], rhoIntra);
            if (inv.limitada) {
                const alcanzable = s[i] * s[j] * this._rTransformada(formas[i], formas[j], inv.rho) + b;
                limitadas.push({ a: nombres[i], b: nombres[j], pedido: r, alcanzable });
            }
            Rint[i][j] = Rint[j][i] = inv.rho;
        }
        // La intermedia puede dejar de ser definida positiva aunque la pedida lo
        // fuera: se sustituye por la válida más cercana y se deja constancia.
        const ajustada = m > 0 && !this._esDefinidaPositiva(Rint);
        return { R: ajustada ? this._matrizValidaMasCercana(Rint) : Rint, limitadas, ajustada };
    }

    // Genera el vector de valores normales correlacionados (uno por variable
    // correlacionable) para un participante: y = L·z con z ~ N(0,1) i.i.d.
    // ================== CORRELACIONES EXACTAS EN LA MUESTRA ==================
    // Sin esto, la correlación OBSERVADA fluctúa alrededor de la pedida por el
    // error de muestreo (con n = 250 y r = 0.40, ±0.05 es lo normal). Aquí se
    // genera la matriz de drivers de TODA la muestra y se «blanquea»:
    //   1. estandarizar columnas → media 0, DE 1
    //   2. Cholesky de la correlación MUESTRAL C = S·Sᵀ  →  W = Z·(S⁻¹)ᵀ
    //      (W queda con correlación muestral EXACTAMENTE identidad)
    //   3. Z* = W·Lᵀ con L = Cholesky de la matriz OBJETIVO
    // Resultado: la correlación muestral de los drivers es exactamente la pedida.
    _estandarizarColumnas(Z) {
        const n = Z.length, m = Z[0].length;
        for (let j = 0; j < m; j++) {
            let s = 0; for (let i = 0; i < n; i++) s += Z[i][j];
            const media = s / n;
            let v = 0; for (let i = 0; i < n; i++) v += (Z[i][j] - media) ** 2;
            const de = Math.sqrt(v / n) || 1e-9;
            for (let i = 0; i < n; i++) Z[i][j] = (Z[i][j] - media) / de;
        }
        return Z;
    }
    _correlacionMuestral(Z) {
        const n = Z.length, m = Z[0].length;
        const C = Array.from({ length: m }, () => new Array(m).fill(0));
        for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) {
            let s = 0; for (let i = 0; i < n; i++) s += Z[i][a] * Z[i][b];
            C[a][b] = s / n;
        }
        return C;
    }
    _inversaTriangularInferior(S) {
        const m = S.length;
        const inv = Array.from({ length: m }, () => new Array(m).fill(0));
        for (let i = 0; i < m; i++) {
            inv[i][i] = 1 / (S[i][i] || 1e-9);
            for (let j = 0; j < i; j++) {
                let s = 0;
                for (let k = j; k < i; k++) s += S[i][k] * inv[k][j];
                inv[i][j] = -s / (S[i][i] || 1e-9);
            }
        }
        return inv;
    }
    generarMatrizDrivers(n, codigosGrupo = [], funcionesValor = null) {
        const m = this.correlVariables.length;
        if (!m || n < 3) return null;
        let Z = Array.from({ length: n }, () => Array.from({ length: m }, () => this.generarNormalEstandar()));
        // Modo exacto + diferencias por grupo: drivers ortogonales a los códigos
        // (medias de grupo del driver = 0 exacto → la d obtenida es la pedida).
        this._ortogonalizarContraCodigos(Z, codigosGrupo);
        this._estandarizarColumnas(Z);
        const S = this.descomposicionCholesky(this._correlacionMuestral(Z));
        const Sinv = this._inversaTriangularInferior(S);
        // W = Z·(S⁻¹)ᵀ: columnas de media 0, DE 1 y correlación muestral identidad
        const W = new Array(n);
        for (let i = 0; i < n; i++) {
            const w = new Array(m).fill(0);
            for (let a = 0; a < m; a++) { let s = 0; for (let k = 0; k <= a; k++) s += Z[i][k] * Sinv[a][k]; w[a] = s; }
            W[i] = w;
        }
        // L: factor de la matriz intermedia. Con funciones de valor se calibra
        // sobre las variables FINALES (formas, recortes, grupos) para que la
        // Pearson de la base sea exactamente la pedida.
        const L = funcionesValor ? this._calibrarCorrelacionesExactas(W, funcionesValor, codigosGrupo) : this.correlL;
        // Z* = W·Lᵀ, por columnas…
        const Zcols = Array.from({ length: m }, () => new Float64Array(n));
        for (let i = 0; i < n; i++) {
            const w = W[i];
            for (let a = 0; a < m; a++) { let s = 0; for (let k = 0; k <= a; k++) s += L[a][k] * w[k]; Zcols[a][i] = s; }
        }
        // …espacio de valor para las variables con grupos y driver compuesto de
        // los criterios de moderación (mismo pipeline que usa la calibración)
        this.driversEnValor = new Set();
        if (funcionesValor) {
            this._prepararColumnasDeDrivers(Zcols, funcionesValor, codigosGrupo);
            funcionesValor.forEach((f, a) => { if (f.enValor || f.esCriterio) this.driversEnValor.add(this.correlVariables[a].tipo + ':' + this.correlVariables[a].clave); });
        }
        const salida = new Array(n);
        for (let i = 0; i < n; i++) { const y = new Array(m); for (let a = 0; a < m; a++) y[a] = Zcols[a][i]; salida[i] = y; }
        return salida;
    }
    // Pipeline por columnas sobre los drivers mezclados (modo exacto):
    //  1) variables con diferencias por grupo → ESPACIO DE VALOR (forma aplicada,
    //     medias de grupo igualadas, DE intra 1); igualar medias en z no basta con
    //     formas no normales (las medias de grupo de e^{σz} no son iguales aunque
    //     las de z lo sean) y la d dejaba de ser exacta;
    //  2) (B6) criterios de moderación: driver compuesto a partir de los VALORES
    //     FINALES estandarizados de X y W, en orden de modelo;
    //  3) criterios que además tienen diferencias por grupo → igualar medias.
    _prepararColumnasDeDrivers(Zcols, funciones, codigos) {
        const n = Zcols[0].length;
        const criterios = new Set((this.modelosModeracion || []).map(md => md.iY));
        funciones.forEach((f, a) => {
            if (!f.enValor || criterios.has(a)) return;
            Zcols[a] = this._igualarPorGrupos(Float64Array.from(Zcols[a], z => f.transformar(z)), codigos);
        });
        (this.modelosModeracion || []).forEach(md => {
            const xFinal = new Float64Array(n), wFinal = new Float64Array(n);
            for (let i = 0; i < n; i++) { xFinal[i] = funciones[md.iX].valor(i, Zcols[md.iX][i]); wFinal[i] = funciones[md.iW].valor(i, Zcols[md.iW][i]); }
            // Sin igualar medias por grupo aquí: residualizar z_Y contra los grupos
            // recortaba la parte de X·W correlacionada con ellos y sesgaba β₃; la
            // d marginal de Y la clava igualmente la calibración de amplitudes.
            Zcols[md.iY] = this._componerCriterio(md, xFinal, wFinal, Zcols[md.iY]);
        });
        return Zcols;
    }
    // Driver del criterio de una moderación, EXACTO para quien analice la base:
    //   z_Y = β₁·x̃ + β₂·w̃ + β₃·(x̃·w̃ − media) + c·ẽ
    // con x̃, w̃ los valores finales de X y W estandarizados en la muestra (lo
    // mismo que hará el analista), ẽ el residuo propio de Y hecho ortogonal a
    // x̃, w̃ y al producto, y c tal que Var(z_Y) = 1. Así la regresión de Y
    // estandarizada sobre x̃, w̃ y x̃·w̃ devuelve exactamente β₁, β₂ y β₃; con
    // el producto de los drivers normales, β₁ fluctuaba ±0.15 con n = 100
    // porque el tercer momento muestral Σx̃²w̃ no es cero.
    _componerCriterio(md, xFinal, wFinal, e) {
        const n = e.length;
        // Si el criterio tiene diferencias por grupo, el analista estandariza Y
        // por su DE TOTAL, pero la parte compuesta vive en la DE intra (σ·s): los
        // coeficientes que verá quedan multiplicados por s. Se compensa aquí.
        const s = this._factorDE(md.y) || 1;
        md = Object.assign({}, md, { b1: md.b1 / s, b2: md.b2 / s, b3: md.b3 / s });
        const est = col => { let mu = 0; for (let i = 0; i < n; i++) mu += col[i]; mu /= n; let v = 0; for (let i = 0; i < n; i++) v += (col[i] - mu) ** 2; const sd = Math.sqrt(v / n); return sd > 1e-9 ? Float64Array.from(col, x => (x - mu) / sd) : null; };
        const zx = est(xFinal), zw = est(wFinal);
        if (!zx || !zw || n < 8) return e;   // X o W sin varianza (caso degenerado): Y queda con su driver propio
        const p = new Float64Array(n);
        let mp = 0; for (let i = 0; i < n; i++) { p[i] = zx[i] * zw[i]; mp += p[i]; }
        mp /= n; for (let i = 0; i < n; i++) p[i] -= mp;
        const er = this._residualizarColumna(e, [zx, zw, p]);
        const estructural = new Float64Array(n);
        let ms = 0; for (let i = 0; i < n; i++) { estructural[i] = md.b1 * zx[i] + md.b2 * zw[i] + md.b3 * p[i]; ms += estructural[i]; }
        ms /= n;
        let vs = 0, ve = 0; for (let i = 0; i < n; i++) { vs += (estructural[i] - ms) ** 2; ve += er[i] * er[i]; }
        vs /= n; ve /= n;
        // varianza estructural muestral > 1: se rebaja el residuo a 0 (caso límite; la validación acota R² < 0.98)
        const c = (ve > 0 && vs < 1) ? Math.sqrt((1 - vs) / ve) : 0;
        const escala = vs >= 1 ? 1 / Math.sqrt(vs) : 1;
        const out = new Float64Array(n);
        for (let i = 0; i < n; i++) out[i] = (estructural[i] - ms) * escala + c * er[i];
        return out;
    }
    // Funciones de valor de cada variable correlacionable, en el orden de
    // Funciones de valor de cada variable correlacionable, en el orden de
    // correlVariables: (i, z) → valor final del participante i con driver z.
    // Incluyen su desplazamiento por grupo (calculado con los códigos ya
    // generados en el pase 1) y su DE intra-grupo.
    _funcionesDeValor(base) {
        const cfg = this.configuracion;
        const conDif = nombre => !!(this.diferenciasEfectivas && (this.diferenciasEfectivas.get(nombre) || []).length);
        const criterios = new Set((this.modelosModeracion || []).map(md => md.iY));
        return this.correlVariables.map((v, a) => {
            // (B6) el criterio de una moderación llega con su driver compuesto y
            // forma normal: el modelo Y = β₁X + β₂W + β₃XW + e define su distribución
            const esCriterio = criterios.has(a);
            if (v.tipo === 'escala') {
                const p = cfg.pruebas.find(x => this._claveEscala(x) === v.clave);
                const f = this._factorDE(p.nombre);
                const partes = this._partesDesplazamiento(base, p.nombre, p.desviacion);
                const desp = partes.desp;
                // Con diferencias por grupo el driver llega ya EN ESPACIO DE VALOR
                // (forma aplicada, medias de grupo igualadas, DE 1): la forma no
                // se vuelve a aplicar.
                const enValor = conDif(p.nombre);
                return { enValor, esCriterio, desp, partes: partes.partes, recalcularDesp: partes.recalcular, nombre: p.nombre,
                    transformar: z => (esCriterio ? z : this.transformarFormaZ(z, p.distribucion)),
                    valor: (i, base) => this._totalDesdeDriver(p, base, desp[i], f, enValor || esCriterio) };
            }
            const s = cfg.sociodemograficos.find(x => x.categoriaCorta === v.clave);
            const f = this._factorDE(s.categoria);
            const partes = this._partesDesplazamiento(base, s.categoria, this._deEfectiva(s));
            const desp = partes.desp;
            const enValor = conDif(s.categoria);
            return { enValor, esCriterio, desp, partes: partes.partes, recalcularDesp: partes.recalcular, nombre: s.categoria,
                transformar: z => (esCriterio ? z : this._formaSocioEstandar(s, z, f)),
                valor: (i, base) => this._valorContinuoSocio(s, base, desp[i], f, enValor || esCriterio) };
        });
    }
    // Forma estandarizada (media 0, DE 1) de un sociodemográfico continuo a
    // partir de su driver: para el asimétrico, la log-normal de generarAsimetrico
    // llevada a media 0 y DE 1; para el normal, el propio z.
    _formaSocioEstandar(socio, z, factorDE) {
        if (socio.distribucion === 'asimetrica') {
            const de = socio.desviacion * factorDE;
            return de > 0 ? (this.generarAsimetrico(socio.promedio, de, z) - socio.promedio) / de : z;
        }
        return z;
    }
    // Residualiza una columna contra [1 | X] (medias de grupo exactamente 0 en
    // cada nivel) y la lleva a DE intra-grupo AGRUPADA 1 (grados de libertad
    // n − q, como la DE agrupada de la d de Cohen; con n = 30 y 3 grupos, usar
    // n en vez de n − 3 sesgaba la d obtenida un 5 %). Devuelve la columna.
    _igualarPorGrupos(col, X) {
        const n = col.length, q = X.length + 1;
        const Z = Array.from(col, v => [v]);
        const aplicado = this._ortogonalizarContraCodigos(Z, X) && this.driversOrtogonalizados;
        let s = 0; for (let i = 0; i < n; i++) s += Z[i][0];
        const media = s / n;
        let v = 0; for (let i = 0; i < n; i++) v += (Z[i][0] - media) ** 2;
        const de = Math.sqrt(v / Math.max(1, aplicado ? n - q : n - 1)) || 1e-9;
        const out = new Float64Array(n);
        for (let i = 0; i < n; i++) out[i] = (Z[i][0] - media) / de;
        return out;
    }
    // ============ CALIBRACIÓN DE CORRELACIONES EXACTAS ============
    // El blanqueo hace exacta la correlación de los DRIVERS, pero la r pedida es
    // la de Pearson entre las variables FINALES, y entre driver y valor hay
    // transformaciones no lineales (forma asimétrica o uniforme, recorte Likert,
    // redondeo) y la varianza entre grupos. Punto fijo sobre la matriz
    // intermedia: se parte de la de forma cerrada, se generan los valores con
    // la candidata, se mide su Pearson y se corrige la candidata con el error,
    // hasta que la Pearson medida coincide con la pedida (o 12 iteraciones).
    _calibrarCorrelacionesExactas(W, funciones, codigos) {
        const n = W.length, m = funciones.length, R = this.correlR;
        let Rt = this.correlRIntermedia.map(f => f.slice());
        let L = this.descomposicionCholesky(Rt);
        const X = Array.from({ length: m }, () => new Float64Array(n));
        const medias = new Float64Array(m), des = new Float64Array(m);
        // Se conserva la mejor candidata: con valores redondeados (Likert,
        // decimales) la Pearson muestral cambia a saltos y el punto fijo puede
        // oscilar alrededor del objetivo en vez de clavarlo.
        const mejor = { error: Infinity, errorR: Infinity, L, Rt, C: null };
        let sinMejora = 0, proyectada = false, iteraciones = 0;
        const Zmix = Array.from({ length: m }, () => new Float64Array(n));
        // (B6) parejas criterio–X y criterio–W de una moderación: r(e_Y, X) = r(e_Y, W) = 0
        // se mantienen; su Pearson final la determinan β₁, β₂, β₃ (y el tercer
        // momento muestral), no la calibración.
        const fijosPorBeta = new Set();
        (this.modelosModeracion || []).forEach(md => { [[md.iY, md.iX], [md.iY, md.iW]].forEach(([a, b]) => fijosPorBeta.add(a < b ? `${a}|${b}` : `${b}|${a}`)); });
        for (let it = 0; it < 16; it++) {
            iteraciones = it + 1;
            // drivers mezclados de todas las variables (Z* = W·Lᵀ)…
            for (let a = 0; a < m; a++) for (let i = 0; i < n; i++) { const w = W[i]; let s = 0; for (let k = 0; k <= a; k++) s += L[a][k] * w[k]; Zmix[a][i] = s; }
            // …espacio de valor y criterios de moderación (mismo pipeline que la generación)…
            const cols = this._prepararColumnasDeDrivers(Zmix.map(c => c), funciones, codigos);
            // …y los valores finales de cada variable
            for (let a = 0; a < m; a++) for (let i = 0; i < n; i++) X[a][i] = funciones[a].valor(i, cols[a][i]);
            for (let a = 0; a < m; a++) {
                let s = 0; for (let i = 0; i < n; i++) s += X[a][i];
                medias[a] = s / n;
                let v = 0; for (let i = 0; i < n; i++) v += (X[a][i] - medias[a]) ** 2;
                des[a] = Math.sqrt(v / n) || 1e-9;
            }
            const C = Array.from({ length: m }, () => new Float64Array(m));
            let maxError = 0, maxErrorR = 0;
            for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) {
                let s = 0; for (let i = 0; i < n; i++) s += (X[a][i] - medias[a]) * (X[b][i] - medias[b]);
                C[a][b] = C[b][a] = s / n / (des[a] * des[b]);
                if (fijosPorBeta.has(`${a}|${b}`)) continue;   // (B6) los fijan los coeficientes
                maxErrorR = Math.max(maxErrorR, Math.abs(R[a][b] - C[a][b]));
            }
            maxError = maxErrorR;
            // (A1, exacto) d MARGINALES: error de cada (variable, agrupación) con las
            // amplitudes actuales; cuenta en el mismo criterio de convergencia.
            const erroresD = [];
            funciones.forEach((f, a) => (f.partes || []).forEach(p => {
                const obs = this._dMarginal(X[a], p.codigos);
                if (obs === null) return;
                erroresD.push({ f, p, obs });
                maxError = Math.max(maxError, Math.abs(p.d - obs));
            }));
            if (maxError < mejor.error) {
                mejor.error = maxError; mejor.errorR = maxErrorR; mejor.L = L; mejor.Rt = Rt; mejor.C = C; sinMejora = 0;
                mejor.amplitudes = funciones.map(f => (f.partes || []).map(p => p.amplitud));
            } else if (++sinMejora >= 4) break;
            if (maxError < 5e-4) break;
            // Paso completo al principio; amortiguado después, porque con valores
            // redondeados (edad entera, Likert) la Pearson muestral responde a
            // saltos y el paso completo oscila alrededor del objetivo.
            const paso = it < 2 ? 1 : 0.6;
            // amplitudes: corrección proporcional d/d_obs (acotada), amortiguada
            const tocadas = new Set();
            erroresD.forEach(({ f, p, obs }) => {
                if (p.d === 0) return;
                const factor = (obs * p.d > 0 && Math.abs(obs) > 0.02) ? Math.max(0.5, Math.min(2, p.d / obs)) : 1.25;
                p.amplitud += paso * (p.amplitud * factor - p.amplitud);
                tocadas.add(f);
            });
            tocadas.forEach(f => f.recalcularDesp());
            const Rn = Rt.map(f => f.slice());
            for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) {
                if (fijosPorBeta.has(`${a}|${b}`)) continue;
                Rn[a][b] = Rn[b][a] = Math.max(-0.995, Math.min(0.995, Rt[a][b] + paso * (R[a][b] - C[a][b])));
            }
            // Si la candidata deja de ser definida positiva, la combinación
            // pedida no es alcanzable con estas formas: se proyecta a la válida
            // más cercana y el punto fijo se queda en la mejor aproximación.
            if (this._esDefinidaPositiva(Rn)) Rt = Rn; else { Rt = this._matrizValidaMasCercana(Rn); proyectada = true; }
            L = this.descomposicionCholesky(Rt);
        }
        this.correlRIntermedia = mejor.Rt;
        // restaurar las amplitudes de la mejor candidata
        if (mejor.amplitudes) funciones.forEach((f, a) => { (f.partes || []).forEach((p, k) => { p.amplitud = mejor.amplitudes[a][k]; }); if (f.recalcularDesp) f.recalcularDesp(); });
        // Constancia para el panel de diagnóstico: si no convergió, alguna r
        // pedida no es alcanzable con las formas/recortes/grupos configurados.
        // Las parejas ya marcadas como limitadas reciben el valor MEDIDO como
        // «alcanzable» (más fiel que la cota de forma cerrada: el recorte
        // Likert también cuenta).
        // «Convergió» a efectos del aviso: error máximo < 0.01 (por debajo de la
        // tolerancia del informe, 0.03, y del efecto del redondeo a enteros).
        // El aviso del panel se refiere a las CORRELACIONES (las d tienen su
        // propia fila en el informe, con tolerancia muestral si el grupo es pequeño).
        this.diagnosticoCorrelaciones.calibracion = { convergio: mejor.errorR < 0.01, error: mejor.errorR, errorTotal: mejor.error, iteraciones, proyectada };
        if (mejor.C) {
            const indice = {};
            this.correlVariables.forEach((v, i) => { indice[v.nombre] = i; });
            (this.diagnosticoCorrelaciones.limitadas || []).forEach(l => {
                const a = indice[l.a], b = indice[l.b];
                if (a !== undefined && b !== undefined) l.alcanzable = mejor.C[a][b];
            });
        }
        return mejor.L;
    }
    _driversDeFila(fila) {
        const drivers = {};
        this.correlVariables.forEach((v, i) => { drivers[v.tipo + ':' + v.clave] = fila[i]; });
        return drivers;
    }
    generarVectorCorrelacionado() {
        const m = this.correlVariables.length;
        const z = [];
        for (let i = 0; i < m; i++) z.push(this.generarNormalEstandar());

        const fila = new Array(m).fill(0);
        for (let i = 0; i < m; i++) {
            let y = 0;
            for (let k = 0; k <= i; k++) y += this.correlL[i][k] * z[k];
            fila[i] = y;
        }
        this._aplicarModeracion(fila);   // (B6)
        const drivers = {};
        for (let i = 0; i < m; i++) drivers[this.correlVariables[i].tipo + ':' + this.correlVariables[i].clave] = fila[i];
        return drivers;
    }

    // ========================================
    // EXPORTACIÓN A CSV
    // ========================================

    // Exporta la base como CSV. sep=',' → internacional (decimales con punto).
    // sep=';' → Excel en español (decimales con COMA, abre en columnas directo).
    exportarCSV(sep = ',') {
        const base = this.datosGenerados;
        if (!base || base.length === 0) {
            throw new Error('No hay datos generados para exportar');
        }
        const escapar = (valor) => {
            let v = String(valor ?? '');
            // Escapar si contiene el separador, comillas o saltos de línea.
            if (v.includes(sep) || v.includes('"') || v.includes('\n')) {
                v = `"${v.replace(/"/g, '""')}"`;
            }
            return v;
        };
        // Número → texto: perdido (NaN) → celda vacía; en formato español los
        // decimales van con coma (3,14). Los enteros no cambian.
        const espanol = sep === ';';
        const texto = v => {
            if (!(v === v)) return '';                       // NaN → celda vacía
            const s = String(v);
            return (espanol && !Number.isInteger(v)) ? s.replace('.', ',') : s;
        };
        const columnas = base.columnas.map(c => c.datos);
        const lineas = new Array(base.n + 1);
        lineas[0] = base.columnas.map(c => escapar(c.nombre)).join(sep);
        const partes = new Array(columnas.length);
        for (let i = 0; i < base.n; i++) {
            for (let c = 0; c < columnas.length; c++) partes[c] = texto(columnas[c][i]);
            lineas[i + 1] = partes.join(sep);
        }
        return lineas.join('\n') + '\n';
    }

    descargarCSV(nombreArchivo = 'base_datos_simulada.csv', sep = ',') {
        const csv = this.exportarCSV(sep);
        // BOM UTF-8: sin él, Excel muestra caracteres rotos en tildes/eñes.
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', nombreArchivo);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    }

    // ========================================
    // UTILIDADES
    // ========================================

    /**
     * Datos generados como arreglo de filas-objeto (lo que esperan el
     * Analizador y los gráficos). Se materializa desde la base columnar la
     * primera vez y queda en caché. Para leer por columnas sin ese coste,
     * usar `obtenerBase()`.
     */
    obtenerDatosGenerados() {
        return this.datosGenerados ? this.datosGenerados.aObjetos() : null;
    }

    obtenerBase() {
        return this.datosGenerados;
    }

    obtenerConfiguracion() {
        return this.configuracion;
    }

    limpiarDatos() {
        this.datosGenerados = null;
        this.configuracion = {
            tamanoMuestra: 100,
            semilla: null,
            pruebas: [],
            sociodemograficos: []
        };
    }

    // ========================================
    // VALIDACIONES
    // ========================================

    validarConfiguracion() {
        const errores = [];
        const advertencias = [];

        // Validar tamaño muestral
        if (this.configuracion.tamanoMuestra < 30) {
            advertencias.push('Tamaño muestral < 30: Los análisis estadísticos pueden tener bajo poder');
        }

        if (this.configuracion.tamanoMuestra > 10000) {
            advertencias.push('Tamaño muestral muy grande: Puede ser poco realista');
        }

        // Ya no se exige una fila «General»: el puntaje general de cada test se
        // deriva automáticamente como PROMEDIO de sus dimensiones.

        // Validar pruebas
        this.configuracion.pruebas.forEach(prueba => {
            // Validar que la media sea positiva
            if (prueba.media < 0) {
                errores.push(`Escala "${prueba.nombre}": La media no puede ser negativa`);
            }

            // FACTIBILIDAD DEL TOTAL (debe coincidir con las pistas en vivo):
            //  · La MEDIA solo puede caer en [k·Mín, k·Máx] (rango de la suma).
            //  · La DE máxima depende de la MEDIA: margen al tope más cercano / 3
            //    (para que quepan ±3 DE sin recortar la campana).
            if (prueba.minimo !== null && prueba.maximo !== null) {
                const k = prueba.numItems;
                const totalMin = k * prueba.minimo;
                const totalMax = k * prueba.maximo;
                const de = prueba.desviacion;

                if (prueba.media < totalMin || prueba.media > totalMax) {
                    // Imposible: la media cae fuera del rango que puede tomar la suma.
                    errores.push(
                        `Escala "${prueba.nombre}": la Media ${prueba.media} es IMPOSIBLE. ` +
                        `Con ${k} ítems de ${prueba.minimo} a ${prueba.maximo} el total solo puede ir de ${totalMin} a ${totalMax}. ` +
                        `Usa una Media dentro de ese rango (cerca del centro es lo más seguro), o cambia el Mín/Máx por ítem.`
                    );
                } else {
                    // La DE máxima la fija la distancia de la Media al tope más cercano.
                    const deMax = ReglasCoherencia.deMaxima(prueba.media, totalMin, totalMax);
                    // Mínimo anti-escalera: SOLO aplica si se busca distribución
                    // normal; con Uniforme/Asimétrica la "escalera" es irrelevante
                    // porque de todos modos no se busca pasar normalidad.
                    const buscaNormal = prueba.distribucion === 'normal';
                    const N = this.configuracion.tamanoMuestra;
                    const deSuave = buscaNormal ? ReglasCoherencia.deMinimaNormal(N) : 0;
                    const centro = Math.round((totalMin + totalMax) / 2);

                    if (de > deMax) {
                        advertencias.push(
                            `Escala "${prueba.nombre}": la DE ${de} es demasiado grande para una Media de ${prueba.media} ` +
                            `(máximo ≈ ${(Math.floor(deMax * 100) / 100)}). El total se recortará contra el tope más cercano, ` +
                            `la DE real bajará y la forma de la distribución se distorsionará. ` +
                            `Reduce la DE, acerca la Media al centro (~${centro}) o amplía el Mín/Máx por ítem.`
                        );
                    } else if (buscaNormal && deSuave > deMax) {
                        advertencias.push(
                            `Escala "${prueba.nombre}": con N=${N}, el rango por ítem [${prueba.minimo}, ${prueba.maximo}] es demasiado estrecho ` +
                            `para un total normal (haría falta DE ≈ ${deSuave}, pero el máximo con esta Media es ${(Math.floor(deMax * 100) / 100)}). ` +
                            `Amplía el Máx por ítem o reduce N.`
                        );
                    } else if (buscaNormal && de < deSuave) {
                        advertencias.push(
                            `Escala "${prueba.nombre}": la DE ${de} es muy pequeña para N=${N}; el total entero saldrá "escalonado" ` +
                            `y probablemente NO pasará la prueba de normalidad. Usa una DE de al menos ≈ ${deSuave}.`
                        );
                    }
                    // Fiabilidad alcanzable: repartida entre k ítems enteros, una DE
                    // total pequeña deja a cada ítem sin apenas variación entre personas
                    // (el generador impone media unidad de dispersión por ítem), y el α/ω
                    // observado se hunde por mucho que se pida.
                    if (prueba.alfa > 0 && de / prueba.numItems < 0.5) {
                        advertencias.push(
                            `Escala "${prueba.nombre}": la DE ${de} repartida entre ${prueba.numItems} ítems deja menos de medio punto por ítem ` +
                            `(${(Math.round(de / prueba.numItems * 100) / 100)}): los ítems apenas variarán entre personas y la fiabilidad pedida ` +
                            `(${prueba.alfa}) no será alcanzable. Sube la DE (≈ ${Math.ceil(prueba.numItems * 0.6)} o más) o usa menos ítems.`
                        );
                    }
                }
            }
        });

        // (B8) Estilos de respuesta e ítems de control necesitan escalas Likert
        {
            const r = this.configuracion.realismo || {};
            const hayLikert = (this.configuracion.pruebas || []).some(p => p.numItems >= 2 && p.minimo !== null && p.maximo !== null && isFinite(p.minimo) && isFinite(p.maximo));
            if (!hayLikert && (r.pctAquiescencia > 0 || r.pctExtrema > 0)) advertencias.push('Estilos de respuesta: solo actúan sobre escalas Likert (con mínimo y máximo por ítem); ninguna escala los tiene, así que no se aplicarán');
            if (!hayLikert && r.itemsControl > 0) advertencias.push('Ítems de control: toman el rango de una escala Likert; sin escalas Likert no se generan');
            if ((r.pctAquiescencia || 0) + (r.pctExtrema || 0) + (r.pctDescuidados || 0) > 60) advertencias.push('Más del 60 % de la muestra con algún estilo de respuesta o descuido: la base se alejará mucho de lo pedido');
            if (r.tiempoMinutos > 0 && r.tiempoMinutos < 2) advertencias.push('Tiempo de respuesta: con una mediana menor de 2 minutos, el mínimo de 30 s aplana la distribución y los descuidados dejan de distinguirse');
        }
        // (B6) Modelos estructurales
        this._validarModelos(errores, advertencias);
        // (B7) Medidas repetidas
        this._validarMedidasRepetidas(errores, advertencias);

        // Validar sociodemográficos
        this.configuracion.sociodemograficos.forEach(socio => {
            // Validar desviación razonable
            if (socio.desviacion > Math.abs(socio.promedio) * 2) {
                advertencias.push(
                    `Variable "${socio.categoria}": Desviación estándar muy alta (${socio.desviacion}) comparada con la media (${socio.promedio})`
                );
            }
            
            // Validar coherencia de límites con la media
            if (socio.minimo !== null && socio.maximo !== null) {
                if (socio.promedio < socio.minimo || socio.promedio > socio.maximo) {
                    advertencias.push(
                        `Variable "${socio.categoria}": La media (${socio.promedio}) está fuera del rango [${socio.minimo}, ${socio.maximo}]`
                    );
                }
                
                // Validar que el rango sea razonable para la desviación
                const rango = socio.maximo - socio.minimo;
                if (socio.desviacion > rango / 2) {
                    advertencias.push(
                        `Variable "${socio.categoria}": La desviación estándar (${socio.desviacion}) es muy alta para el rango [${socio.minimo}, ${socio.maximo}]`
                    );
                }
            }
        });

        return { errores, advertencias };
    }

    // ========================================
    // ESTADÍSTICAS DESCRIPTIVAS RÁPIDAS
    // ========================================

    calcularEstadisticas(columna) {
        if (!this.datosGenerados) return null;

        const valores = this.datosGenerados
            .map(fila => fila[columna])
            .filter(v => v !== null && v !== undefined && !isNaN(v));

        if (valores.length === 0) return null;

        valores.sort((a, b) => a - b);

        const n = valores.length;
        const suma = valores.reduce((a, b) => a + b, 0);
        const media = suma / n;
        
        const varianza = valores
            .map(v => Math.pow(v - media, 2))
            .reduce((a, b) => a + b, 0) / n;
        
        const desviacion = Math.sqrt(varianza);
        
        const min = valores[0];
        const max = valores[n - 1];
        
        const mediana = n % 2 === 0
            ? (valores[n / 2 - 1] + valores[n / 2]) / 2
            : valores[Math.floor(n / 2)];

        return {
            n: n,
            media: media,
            desviacion: desviacion,
            min: min,
            max: max,
            mediana: mediana
        };
    }
}

// ========================================
// INSTANCIA GLOBAL
// ========================================
const generadorDatos = new GeneradorDatos();
