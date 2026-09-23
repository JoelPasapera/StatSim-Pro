// ============================================================================
// generador-validacion.js — validarConfiguracion y todas las reglas de validación
// Métodos de GeneradorDatos añadidos al prototipo (misma semántica que en la clase).
// ============================================================================
Object.assign(GeneradorDatos.prototype, {
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

        // (Revisión transversal, F-7) tope duro: por encima de 1 000 000 de filas la
        // memoria del navegador no alcanza (con 90 columnas son 400 MB de datos) y la
        // generación se caía sin aviso; entre 200 000 y 1 000 000 se avisa del coste
        if (!(this.configuracion.tamanoMuestra >= 2)) errores.push('El tamaño muestral debe ser al menos 2');
        else if (this.configuracion.tamanoMuestra > 1000000) errores.push(`Tamaño muestral ${this.configuracion.tamanoMuestra}: el máximo es 1 000 000 de filas (la memoria del navegador no da para más)`);
        else if (this.configuracion.tamanoMuestra > 200000) advertencias.push(`Tamaño muestral ${this.configuracion.tamanoMuestra}: la generación tardará varios segundos y el CSV pesará más de 25 MB`);
        else if (this.configuracion.tamanoMuestra > 10000) advertencias.push('Tamaño muestral muy grande: puede ser poco realista para una tesis');

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
                if (this._esDicotomica(prueba)) return;   // (C5) tienen sus propias reglas

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
            const hayLikert = (this.configuracion.pruebas || []).some(p => p.numItems >= 2 && p.minimo !== null && p.maximo !== null && isFinite(p.minimo) && isFinite(p.maximo) && (p.maximo - p.minimo) >= 2);
            if (!hayLikert && (r.pctAquiescencia > 0 || r.pctExtrema > 0)) advertencias.push('Estilos de respuesta: solo actúan sobre escalas Likert (con mínimo y máximo por ítem); ninguna escala los tiene, así que no se aplicarán');
            if (!hayLikert && r.itemsControl > 0) advertencias.push('Ítems de control: toman el rango de una escala Likert; sin escalas Likert no se generan');
            if ((r.pctAquiescencia || 0) + (r.pctExtrema || 0) + (r.pctDescuidados || 0) > 60) advertencias.push('Más del 60 % de la muestra con algún estilo de respuesta o descuido: la base se alejará mucho de lo pedido');
            if (r.tiempoMinutos > 0 && r.tiempoMinutos < 2) advertencias.push('Tiempo de respuesta: con una mediana menor de 2 minutos, el mínimo de 30 s aplana la distribución y los descuidados dejan de distinguirse');
        }
        // (B6) Modelos estructurales
        this._validarModelos(errores, advertencias);
        // (B7) Medidas repetidas
        this._validarMedidasRepetidas(errores, advertencias);
        // (C4) Interacciones y anidamiento
        this._validarEfectosCompuestos(errores, advertencias);
        // (C1) Estructura factorial
        this._validarEstructuras(errores, advertencias);
        // (C2/C3) Desenlaces y puntos de corte
        this._validarDesenlacesYCortes(errores, advertencias);
        // (C7) Concordancia
        this._validarConcordancias(errores, advertencias);

        // (Revisión transversal, F4) comprobaciones básicas que solo hacía la interfaz al recolectar;
        // la validación debe bastar por sí sola (archivo maestro, Worker, uso desde código)
        this._validarBasicos(errores, advertencias);
        // (C5) escalas dicotómicas: Media/DE derivadas y reglas propias
        this._validarDicotomicas(errores, advertencias);
        // (B9) dependencias, fechas de nacimiento y referencia del MAR
        this._validarSociodemograficosB9(errores, advertencias);
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
    },

    _validarBasicos(errores, advertencias) {
        const cfg = this.configuracion;
        const pruebas = cfg.pruebas || [], socios = cfg.sociodemograficos || [];
        const nombresEscala = new Set();
        pruebas.forEach(p => {
            const et = `Escala «${p.nombre || '(sin nombre)'}»`;
            if (!p.nombre || !String(p.nombre).trim()) errores.push('Hay una escala sin nombre en la tabla I');
            if (nombresEscala.has(p.nombre)) errores.push(`${et}: hay dos escalas con el mismo nombre`);
            nombresEscala.add(p.nombre);
            if (!(p.numItems >= 1)) errores.push(`${et}: el número de ítems debe ser al menos 1`);
            if (!(p.desviacion > 0)) errores.push(`${et}: la DE debe ser mayor que 0`);
            if (p.alfa !== undefined && p.alfa !== null && p.alfa !== 0 && !(p.alfa > 0 && p.alfa < 1)) errores.push(`${et}: la fiabilidad objetivo debe estar entre 0 y 1 (tiene ${p.alfa})`);
            if ((p.invertidos || 0) > p.numItems) errores.push(`${et}: hay más ítems invertidos (${p.invertidos}) que ítems (${p.numItems})`);
            if (p.minimo !== null && p.maximo !== null && isFinite(p.minimo) && isFinite(p.maximo) && p.minimo >= p.maximo) errores.push(`${et}: el mínimo por ítem (${p.minimo}) debe ser menor que el máximo (${p.maximo})`);
            if (Array.isArray(p.dificultades) && p.dificultades.some(v => !(v >= 0 && v <= 1))) errores.push(`${et}: las dificultades son proporciones de acierto entre 0 y 1`);
        });
        const nombresSocio = new Set();
        socios.forEach(s => {
            const et = `Variable «${s.categoria || '(sin nombre)'}»`;
            if (!s.categoria || !String(s.categoria).trim()) errores.push('Hay una variable sociodemográfica sin nombre en la tabla II');
            if (nombresSocio.has(s.categoria)) errores.push(`${et}: hay dos sociodemográficas con el mismo nombre`);
            nombresSocio.add(s.categoria);
            if (nombresEscala.has(s.categoria)) errores.push(`${et}: se llama igual que una escala; cambia uno de los dos nombres`);
            if (s.distribucion === 'binaria' && !(s.promedio >= 0 && s.promedio <= 1)) errores.push(`${et}: en una binaria el promedio es la proporción de unos, entre 0 y 1 (tiene ${s.promedio})`);
            if (['normal', 'asimetrica', 'uniforme'].includes(s.distribucion)) {
                if (!(s.desviacion > 0)) errores.push(`${et}: la DE debe ser mayor que 0`);
                if (s.minimo !== null && s.maximo !== null && isFinite(s.minimo) && isFinite(s.maximo)) {
                    if (s.minimo >= s.maximo) errores.push(`${et}: el mínimo (${s.minimo}) debe ser menor que el máximo (${s.maximo})`);
                    else if (s.promedio < s.minimo || s.promedio > s.maximo) errores.push(`${et}: la media ${s.promedio} está fuera del rango ${s.minimo}–${s.maximo}`);
                }
            }
            if (s.distribucion === 'categorica' && !s.niveles && !(s.maximo > s.minimo)) errores.push(`${et}: una categórica necesita mín < máx (códigos 1…K)`);
            if (s.distribucion === 'conteo' && !(s.promedio > 0)) errores.push(`${et}: la media de un conteo debe ser mayor que 0`);
            else if (s.distribucion === 'conteo' && s.promedio > 1000) errores.push(`${et}: una media de ${s.promedio} eventos no es plausible (máximo 1000)`);
            if (s.dependeDe && s.fuerza > 0.95) advertencias.push(`${et}: la fuerza de la asociación se limita a 0.95`);
            if (s.niveles && s.niveles.some(x => !(x.proporcion > 0))) advertencias.push(`${et}: alguna categoría tiene proporción 0 y saldrá vacía`);
        });
        const nombres = this._nombresCorrelacionables();
        const par = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
        const vistas = new Map();
        (cfg.correlaciones || []).forEach(c => {
            const et = `Correlación ${c.a} ↔ ${c.b}`;
            if (!nombres.has(c.a) || !nombres.has(c.b)) { errores.push(`${et}: alguna de las dos variables no existe entre las cuantitativas`); return; }
            if (c.a === c.b) { errores.push(`${et}: una variable no se correlaciona consigo misma`); return; }
            if (!(Math.abs(c.r) < 1)) errores.push(`${et}: r debe estar entre −1 y 1 (tiene ${c.r})`);
            const k = par(c.a, c.b);
            if (vistas.has(k) && Math.abs(vistas.get(k) - c.r) > 1e-9) errores.push(`${et}: la pareja aparece dos veces con valores distintos (${vistas.get(k)} y ${c.r})`);
            vistas.set(k, c.r);
        });
        (cfg.diferenciasGrupo || []).forEach(d => {
            if (d.tipo && d.tipo !== 'd') return;
            const et = `Diferencia «${d.cuantitativa}» por ${d.agrupacion}`;
            if (!nombres.has(d.cuantitativa)) errores.push(`${et}: la variable cuantitativa no existe`);
            const A = socios.find(s => s.categoria === d.agrupacion);
            if (!A) errores.push(`${et}: la agrupación no existe entre las sociodemográficas`);
            else if (!(A.distribucion === 'binaria' || A.distribucion === 'categorica')) errores.push(`${et}: la agrupación debe ser binaria o categórica («${d.agrupacion}» es ${A.distribucion})`);
            else if (A.distribucion === 'binaria' && !(A.promedio > 0.005 && A.promedio < 0.995)) errores.push(`${et}: la binaria «${d.agrupacion}» tiene proporción ${A.promedio}: sin los dos grupos no hay diferencia posible`);
            if (!(Math.abs(d.d) <= 3)) errores.push(`${et}: una d de ${d.d} no es plausible (máximo 3)`);
        });
        (cfg.cortes || []).forEach(c => { for (let i = 1; i < c.cortes.length; i++) if (!(c.cortes[i] > c.cortes[i - 1])) errores.push(`Puntos de corte de «${c.variable}»: los cortes deben ir en orden creciente`); });
        const r = cfg.realismo || {};
        ['pctPerdidos', 'pctDescuidados', 'pctDigitacion', 'pctAquiescencia', 'pctExtrema'].forEach(k => { if (r[k] !== undefined && !(r[k] >= 0 && r[k] <= 100)) errores.push(`Imperfecciones: ${k} debe ser un porcentaje entre 0 y 100 (tiene ${r[k]})`); });
        if (r.mecanismoPerdidos && !['MCAR', 'MAR', 'MNAR'].includes(r.mecanismoPerdidos)) advertencias.push(`Imperfecciones: mecanismo de perdidos «${r.mecanismoPerdidos}» desconocido; se usará MCAR`);
        if (cfg.semilla !== null && cfg.semilla !== undefined && cfg.semilla !== '' && !isFinite(Number(cfg.semilla))) advertencias.push(`La semilla «${cfg.semilla}» no es un número: la base será aleatoria (no reproducible)`);
    },

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
        modelos.filter(md => md.tipo === 'moderacion' || md.tipo === 'curvilinea').forEach(md => {
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
        modelos.filter(md => md.tipo === 'curvilinea' && md.x !== md.y).forEach(md => fijarPareja(par(md.x, md.y), md.c1, `Curvilínea ${md.x} → ${md.y}`));
        modelos.forEach((md, k) => {
            // (C6) curvilínea: Y = β₁·X + β₂·X² (X estandarizada; X² centrada)
            if (md.tipo === 'curvilinea') {
                const et = `Curvilínea ${md.x} → ${md.y}`;
                [md.x, md.y].forEach(v => { if (!nombres.has(v)) errores.push(`${et}: la variable «${v}» no existe entre las cuantitativas del estudio`); });
                if (md.x === md.y) errores.push(`${et}: X e Y deben ser distintas`);
                [md.x, md.y].forEach(v => { if (this._esNombreGeneral(v)) errores.push(`${et}: un puntaje general derivado no puede entrar en una relación curvilínea (usa sus dimensiones)`); });
                if ([md.c1, md.c2].some(c => Math.abs(c) >= 1)) errores.push(`${et}: los coeficientes estandarizados deben estar entre −1 y 1`);
                if (Math.abs(md.c2) < 0.05) advertencias.push(`${et}: con β₂ = ${md.c2} la curvatura apenas se notará (0.15–0.35 es lo visible)`);
                if (criteriosModeracion.has(md.y)) errores.push(`${et}: «${md.y}» ya es criterio de otro modelo compuesto (una variable solo puede serlo de uno)`);
                criteriosModeracion.add(md.y);
                // Var(X²) = 2 con X normal; con otras formas se calcula (una uniforme la baja a 0.8, una asimétrica la sube mucho)
                const pX = (cfg.pruebas || []).find(p => p.nombre === md.x), sX = (cfg.sociodemograficos || []).find(s => s.categoria === md.x);
                const distX = pX ? pX.distribucion : (sX ? sX.distribucion : 'normal');
                const varX2 = this._varianzaCuadradoForma(distX);
                const r2 = md.c1 * md.c1 + md.c2 * md.c2 * varX2;
                if (r2 >= 0.98) errores.push(`${et}: los coeficientes explican el ${(r2 * 100).toFixed(0)} % de la varianza de «${md.y}» (máximo 98 %${distX !== 'normal' ? `; con X ${distX} la varianza de X² es ${varX2.toFixed(1)}` : ''}); reduce β₁ o β₂`);
                else if (distX === 'asimetrica') advertencias.push(`${et}: con X asimétrica, X y X² están correlacionadas: r(X,Y) se aparta de β₁ y el R² real es ${(r2 * 100).toFixed(0)} %`);
                if (tablaIII.has(par(md.x, md.y))) advertencias.push(`${et}: la correlación ${md.x} ↔ ${md.y} de la tabla III se sustituye por la que implica β₁`);
                return;
            }
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
    },

    // Varianza poblacional de x̃² para una forma dada (x̃ estandarizada); PRNG propio
    _varianzaCuadradoForma(distribucion) {
        if (!distribucion || distribucion === 'normal') return 2;
        let semilla = 0x2545F491 ^ (String(distribucion).length * 977);
        const u = () => { semilla = (semilla + 0x6D2B79F5) | 0; let x = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
        const normal = () => { const u1 = Math.max(1e-12, u()), u2 = u(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
        const nS = 6000; let s1 = 0, s2 = 0;
        for (let i = 0; i < nS; i++) { const x = this.transformarFormaZ(normal(), distribucion); const q = x * x; s1 += q; s2 += q * q; }
        const m = s1 / nS;
        return Math.max(0.1, s2 / nS - m * m);
    },

    _validarConcordancias(errores, advertencias) {
        const cfg = this.configuracion;
        const nombres = this._nombresCorrelacionables();
        const vistos = new Set(), juzgadas = new Set();
        (cfg.concordancias || []).forEach(c => {
            if (c.tipo !== 'informante') {
                if (juzgadas.has(c.variable)) errores.push(`Jueces de «${c.variable}»: la variable ya tiene jueces en otra fila (una sola fila de jueces por variable)`);
                juzgadas.add(c.variable);
            }
            if (c.tipo === 'informante') {
                const et = `Informante «${c.etiqueta}» de «${c.variable}»`;
                const p = (cfg.pruebas || []).find(x => x.nombre === c.variable && !x.sufijo && x.tipo !== 'general');
                if (!p) { errores.push(`${et}: solo se puede añadir un informante a una escala (dimensión) de la tabla I`); return; }
                const slug = this._slugSufijo(c.etiqueta);
                const clave = `${c.variable}|${slug}`;
                if (vistos.has(clave)) errores.push(`${et}: etiqueta repetida para la misma escala`);
                vistos.add(clave);
                if (/^T\d+$/i.test(slug)) errores.push(`${et}: la etiqueta «${c.etiqueta}» se confunde con una onda (T2, T3…); usa otra`);
                if (!c.etiqueta || !c.etiqueta.trim()) advertencias.push(`${et}: sin etiqueta se usará «informante 2»`);
                if (!(c.r > 0 && c.r < 0.99)) errores.push(`${et}: la concordancia r debe estar entre 0.01 y 0.98`);
                if (Math.abs(c.sesgo) > 2) errores.push(`${et}: un sesgo de ${c.sesgo} DE no es plausible`);
                if ((cfg.medidasRepetidas || []).some(m => m.variable === c.variable)) advertencias.push(`${et}: la escala también tiene ondas; el informante se genera solo para la onda 1`);
            } else if (c.tipo === 'jueces') {
                const et = `Jueces de «${c.variable}»`;
                if (!this._columnaCategoricaDe(c.variable)) errores.push(`${et}: los jueces categóricos necesitan una variable categórica: una escala con puntos de corte (tabla VIII), un sociodemográfico binario/categórico o un desenlace binario/ordinal`);
                if (!(c.jueces >= 2 && c.jueces <= 6)) errores.push(`${et}: entre 2 y 6 jueces`);
                if (!(c.kappa > 0 && c.kappa < 0.99)) errores.push(`${et}: el kappa debe estar entre 0.01 y 0.98`);
            } else {
                const et = `Jueces (puntuación) de «${c.variable}»`;
                const esCont = nombres.has(c.variable) && !this._esNombreGeneral(c.variable);
                if (!esCont) errores.push(`${et}: los jueces con puntuación necesitan una escala o una sociodemográfica continua (no un puntaje general)`);
                if (!(c.jueces >= 2 && c.jueces <= 6)) errores.push(`${et}: entre 2 y 6 jueces`);
                if (!(c.icc > 0.05 && c.icc < 0.99)) errores.push(`${et}: la CCI debe estar entre 0.05 y 0.98`);
            }
        });
    },

    _validarDesenlacesYCortes(errores, advertencias) {
        const cfg = this.configuracion;
        const nombres = this._nombresCorrelacionables();
        const columnas = new Set(['ID']);
        (cfg.sociodemograficos || []).forEach(s => columnas.add(s.categoria));
        (cfg.pruebas || []).forEach(p => { columnas.add(this.columnaDeEscala(p)); this._itemsDe(p).forEach(c => columnas.add(c)); });
        const vistos = new Set();
        (cfg.desenlaces || []).forEach(d => {
            const et = `Desenlace «${d.nombre}»`;
            if (vistos.has(d.nombre) || columnas.has(d.nombre) || nombres.has(d.nombre)) errores.push(`${et}: el nombre ya se usa en otra variable o columna; elige otro`);
            vistos.add(d.nombre);
            if (d.tipo === 'binario' && !(d.prevalencia > 0.02 && d.prevalencia < 0.98)) errores.push(`${et}: la prevalencia debe estar entre 2 % y 98 %`);
            if (d.tipo === 'conteo' && !(d.media > 0 && d.media < 200)) errores.push(`${et}: la media del conteo debe ser positiva (y razonable)`);
            if (!d.predictores.length) advertencias.push(`${et}: sin predictores, será una variable independiente de todo`);
            d.predictores.forEach(pr => {
                if (!nombres.has(pr.variable)) errores.push(`${et}: el predictor «${pr.variable}» no es una variable cuantitativa del estudio`);
                if (!(pr.efecto > 0.1 && pr.efecto < 10)) errores.push(`${et}: el efecto de «${pr.variable}» debe ser un OR/IRR entre 0.1 y 10 (por cada DE)`);
                else if (pr.efecto > 4 || pr.efecto < 0.25) advertencias.push(`${et}: un OR/IRR de ${pr.efecto} por DE es muy grande; la separación será casi perfecta`);
            });
            const repetidos = d.predictores.map(p => p.variable).filter((v, i, a) => a.indexOf(v) !== i);
            if (repetidos.length) errores.push(`${et}: el predictor «${repetidos[0]}» está repetido`);
        });
        const vistosC = new Set();
        (cfg.cortes || []).forEach(c => {
            const et = `Puntos de corte de «${c.variable}»`;
            if (!nombres.has(c.variable) || (cfg.sociodemograficos || []).some(s => s.categoria === c.variable)) errores.push(`${et}: solo se cortan escalas o puntajes generales`);
            if (vistosC.has(c.variable)) errores.push(`${et}: la variable aparece dos veces`);
            vistosC.add(c.variable);
            const p = (cfg.pruebas || []).find(x => x.nombre === c.variable);
            if (p && !c.porPercentil) {
                const min = p.minimo !== null && p.maximo !== null ? p.numItems * p.minimo : -Infinity, max = p.minimo !== null && p.maximo !== null ? p.numItems * p.maximo : Infinity;
                if (c.cortes.some(x => x <= min || x > max)) advertencias.push(`${et}: algún corte queda fuera del rango del total (${min}–${max}); esa categoría saldrá vacía`);
                if (Math.abs(c.cortes[0] - p.media) > 3 * p.desviacion && Math.abs(c.cortes[c.cortes.length - 1] - p.media) > 3 * p.desviacion) advertencias.push(`${et}: los cortes están muy lejos de la media (${p.media} ± ${p.desviacion}); casi todos caerán en la misma categoría`);
            }
        });
    },

    // (C4) Interacción A×B y anidamiento (ICC) en la tabla IV
    _validarEfectosCompuestos(errores, advertencias) {
        const cfg = this.configuracion;
        // Las diferencias por grupo pedidas sobre una misma variable no pueden llevarse
        // toda su varianza (Σ amp²·V ≥ 0.9): no quedaría varianza intra para nada más
        const porVariable = new Map();
        (cfg.diferenciasGrupo || []).forEach(dif => {
            if (dif.tipo && dif.tipo !== 'd' && dif.tipo !== 'interaccion') return;
            const A = (cfg.sociodemograficos || []).find(s => s.categoria === dif.agrupacion);
            if (!A || !isFinite(dif.d)) return;
            let V = this._varianzaCodigo(A);
            if (dif.tipo === 'interaccion') { const B = (cfg.sociodemograficos || []).find(s => s.categoria === dif.agrupacion2); V = V * (this._varianzaCodigo(B) || 0); }
            if (!(V > 0)) return;
            const amp = dif.d / Math.sqrt(1 + dif.d * dif.d * V);
            porVariable.set(dif.cuantitativa, (porVariable.get(dif.cuantitativa) || 0) + amp * amp * V);
        });
        (cfg.diferenciasGrupo || []).forEach(dif => { if (dif.tipo === 'icc') porVariable.set(dif.cuantitativa, (porVariable.get(dif.cuantitativa) || 0) + dif.d); });
        porVariable.forEach((entre, nombre) => {
            if (entre >= 0.9) errores.push(`«${nombre}»: las diferencias por grupo pedidas se llevan el ${Math.round(entre * 100)} % de su varianza (con una categórica de varios niveles la d es por unidad de código y crece deprisa); reduce las d o usa menos agrupaciones`);
            else if (entre >= 0.6) advertencias.push(`«${nombre}»: las diferencias por grupo pedidas explican el ${Math.round(entre * 100)} % de su varianza; queda poca variación dentro de los grupos`);
        });
        (cfg.diferenciasGrupo || []).forEach(dif => {
            if (!dif.tipo || dif.tipo === 'd') return;
            const esGeneral = this._esNombreGeneral(dif.cuantitativa);
            const A = (cfg.sociodemograficos || []).find(s => s.categoria === dif.agrupacion);
            if (dif.tipo === 'interaccion') {
                const et = `Interacción ${dif.agrupacion} × ${dif.agrupacion2 || '?'} sobre «${dif.cuantitativa}»`;
                const B = (cfg.sociodemograficos || []).find(s => s.categoria === dif.agrupacion2);
                if (!dif.agrupacion2) errores.push(`${et}: elige la segunda agrupación`);
                if (dif.agrupacion2 === dif.agrupacion) errores.push(`${et}: las dos agrupaciones deben ser distintas`);
                if (!A || A.distribucion !== 'binaria' || (B && B.distribucion !== 'binaria')) errores.push(`${et}: la interacción se define entre dos variables BINARIAS (diseño 2×2)`);
                if (esGeneral) errores.push(`${et}: la interacción se pide sobre una escala o continua, no sobre un puntaje general (pídela en sus dimensiones)`);
                if (Math.abs(dif.d) > 2) errores.push(`${et}: una d de interacción de ${dif.d} no es plausible`);
                if (A && B && A.dependeDe === B.categoria || B && A && B.dependeDe === A.categoria) advertencias.push(`${et}: las dos agrupaciones están asociadas entre sí; las celdas quedarán desbalanceadas`);
            } else if (dif.tipo === 'icc') {
                const et = `Anidamiento de «${dif.cuantitativa}» en ${dif.agrupacion}`;
                if (!A || A.distribucion !== 'categorica') errores.push(`${et}: la variable de anidamiento debe ser CATEGÓRICA (p. ej. Aula con 1…K)`);
                else { const K = this._nivelesDe(A).length; if (K < 3) errores.push(`${et}: hacen falta al menos 3 grupos (aulas, colegios…)`); else if (K < 8) advertencias.push(`${et}: con ${K} grupos la CCI estimada fluctuará bastante`); }
                if (!(dif.d > 0 && dif.d < 0.9)) errores.push(`${et}: la CCI debe estar entre 0.01 y 0.90 (lo habitual en educación es 0.05–0.30)`);
                if (esGeneral) errores.push(`${et}: el anidamiento se pide sobre una escala o continua, no sobre un puntaje general (pídelo en sus dimensiones)`);
            }
        });
    },

    _validarMedidasRepetidas(errores, advertencias) {
        const cfg = this.configuracion;
        const lista = cfg.medidasRepetidas || [];
        if (!lista.length) return;
        const vistas = new Set();
        lista.forEach(mr => {
            const etiqueta = `Medida repetida «${mr.variable}»`;
            const p = (cfg.pruebas || []).find(x => x.nombre === mr.variable && !x.sufijo);
            if (!p || p.tipo === 'general') { errores.push(`${etiqueta}: solo puede repetirse una escala de tipo dimensión de la tabla I`); return; }
            if (mr.modelo === 'crecimiento') {
                if (!(mr.dePendientes >= 0 && mr.dePendientes <= 1.5)) errores.push(`${etiqueta}: la DE de las pendientes debe estar entre 0 y 1.5 (en DE de T1)`);
                if (!(Math.abs(mr.rInterceptoPendiente) < 0.95)) errores.push(`${etiqueta}: la correlación intercepto–pendiente debe estar entre −0.95 y 0.95`);
                if (mr.ondas < 3) advertencias.push(`${etiqueta}: con solo dos ondas las pendientes individuales no se distinguen del error; el modelo de crecimiento luce con 3 o más`);
            }
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
    },

    _validarEstructuras(errores, advertencias) {
        const cfg = this.configuracion, lista = cfg.estructuras || [];
        if (!lista.length) return;
        const indice = cfg.indiceFiabilidad === 'omega' ? 'omega' : 'alfa';
        lista.forEach(est => {
            const dims = (cfg.pruebas || []).filter(p => p.prueba === est.prueba && !p.sufijo && p.tipo !== 'general' && p.numItems >= 2);
            if (!dims.length) { errores.push(`Estructura factorial: el test «${est.prueba}» no tiene dimensiones con ítems en la tabla I`); return; }
            const factores = est.factores || dims.map(d => d.nombre);
            const idxDe = nombre => factores.indexOf(nombre);
            const desajuste = est.desajuste || 'ninguno';
            if (!NIVELES_DESAJUSTE[desajuste]) errores.push(`Estructura factorial de «${est.prueba}»: nivel de desajuste desconocido (${desajuste})`);
            const conMetodo = !!(est.metodo && est.metodo.carga > 0);
            if (conMetodo && est.metodo.carga > 0.6) errores.push(`Estructura factorial de «${est.prueba}»: la carga del factor de método (${est.metodo.carga}) no puede superar 0.6`);
            if (conMetodo && !dims.some(d => (d.invertidos || 0) > 0 && d.invertidos < d.numItems)) advertencias.push(`Estructura factorial de «${est.prueba}»: el factor de método actúa sobre los ítems invertidos y ninguna dimensión tiene invertidos (y directos); no tendrá efecto`);
            const alfasImplicitos = [];
            dims.forEach(p => {
                const filas = est.cargas[p.nombre];
                if (!Array.isArray(filas)) { advertencias.push(`Estructura factorial de «${est.prueba}»: la dimensión «${p.nombre}» no tiene matriz; usará el perfil automático`); return; }
                if (filas.length !== p.numItems) { errores.push(`Estructura factorial de «${est.prueba}»: «${p.nombre}» tiene ${p.numItems} ítems y la matriz ${filas.length} filas; pulsa «Actualizar desde la tabla I»`); return; }
                const ip = idxDe(p.nombre);
                if (ip < 0) { errores.push(`Estructura factorial de «${est.prueba}»: la matriz no tiene columna para «${p.nombre}»`); return; }
                const propias = this._lambdasEfectivas(p, filas, ip);
                filas.forEach((fila, i) => {
                    const propia = +fila[ip] || 0;
                    if (!(propia >= 0.1 && propia <= 0.95)) errores.push(`Estructura factorial de «${est.prueba}»: la carga propia del ítem ${i + 1} de «${p.nombre}» debe estar entre 0.10 y 0.95 (tiene ${propia})`);
                    let comunalidad = propias[i] * propias[i];
                    fila.forEach((c, j) => {
                        if (j === ip) return;
                        const cr = +c || 0;
                        if (Math.abs(cr) > 0.6) errores.push(`Estructura factorial de «${est.prueba}»: la carga cruzada del ítem ${i + 1} de «${p.nombre}» sobre «${factores[j]}» (${cr}) no puede superar 0.6 en valor absoluto`);
                        else if (Math.abs(cr) >= propias[i] && Math.abs(cr) > 0) errores.push(`Estructura factorial de «${est.prueba}»: el ítem ${i + 1} de «${p.nombre}» carga más en «${factores[j]}» (${cr}) que en su propia dimensión (${propias[i].toFixed(2)})`);
                        comunalidad += cr * cr;
                    });
                    if (comunalidad > 0.95) errores.push(`Estructura factorial de «${est.prueba}»: la comunalidad del ítem ${i + 1} de «${p.nombre}» supera 0.95 (${comunalidad.toFixed(2)}); baja alguna carga`);
                });
                // DE de ítem implícita frente al rango Likert
                const likert = p.minimo !== null && p.maximo !== null;
                const sumaL = propias.reduce((s, l) => s + l, 0);
                const sigmaItem = p.desviacion / Math.max(1e-9, sumaL);
                if (likert && sigmaItem > (p.maximo - p.minimo) / 2) errores.push(`Estructura factorial de «${est.prueba}»: con esas cargas cada ítem de «${p.nombre}» necesitaría una DE de ${sigmaItem.toFixed(2)}, que no cabe en el rango ${p.minimo}–${p.maximo}; sube las cargas o baja la DE del total`);
                else if (likert && sigmaItem > (p.maximo - p.minimo) / 3) advertencias.push(`Estructura factorial de «${est.prueba}»: las cargas de «${p.nombre}» exigen ítems con DE ${sigmaItem.toFixed(2)} en un rango ${p.minimo}–${p.maximo}: el recorte deformará los extremos`);
                // el ruido propio del ítem debe poder absorber el redondeo a enteros (varianza 1/12)
                const mediaL = sumaL / Math.max(1, propias.length);
                const ruidoPropio = sigmaItem * sigmaItem * (1 - mediaL * mediaL);
                if (likert && ruidoPropio < 0.16) errores.push(`Estructura factorial de «${est.prueba}»: con DE ${p.desviacion} en ${p.numItems} ítems y cargas de ${mediaL.toFixed(2)}, el ruido propio de cada ítem de «${p.nombre}» (DE ${Math.sqrt(ruidoPropio).toFixed(2)}) es menor que el redondeo a enteros y las cargas no pueden cumplirse; sube la DE del total, baja las cargas o reduce los ítems`);
                else if (likert && ruidoPropio < 0.25) advertencias.push(`Estructura factorial de «${est.prueba}»: los ítems de «${p.nombre}» tienen poco ruido propio frente al redondeo a enteros; las cargas saldrán algo atenuadas`);
                const fi = this._fiabilidadImplicita(propias)[indice];
                alfasImplicitos.push({ p, fi });
                if ((est.modo || 'cargas') !== 'alfa' && p.alfa > 0 && p.alfa < 1 && Math.abs(fi - p.alfa) > 0.03) advertencias.push(`Estructura factorial de «${est.prueba}»: las cargas de «${p.nombre}» implican ${indice === 'omega' ? 'ω' : 'α'} = ${fi.toFixed(2)}, distinto del ${p.alfa} de la tabla I; mandan las cargas (o elige el modo «respetar el α»)`);
                if (p.numItems < 5 && desajuste !== 'ninguno') errores.push(`Estructura factorial de «${est.prueba}»: el desajuste necesita al menos 5 ítems por dimensión («${p.nombre}» tiene ${p.numItems}); elige «ninguno»`);
            });
            const r = cfg.realismo || {};
            if ((r.pctAquiescencia > 0 || r.pctExtrema > 0)) advertencias.push(`Estructura factorial de «${est.prueba}»: los estilos de respuesta añaden un factor de método propio que se sumará a la estructura pedida`);
        });
    },

    _validarSociodemograficosB9(errores, advertencias) {
        const cfg = this.configuracion, socios = cfg.sociodemograficos || [];
        const porNombre = new Map(socios.map(s => [s.categoria, s]));
        socios.forEach(s => {
            if (s.dependeDe) {
                const ref = porNombre.get(s.dependeDe);
                if (!ref) errores.push(`Variable «${s.categoria}»: depende de «${s.dependeDe}», que no existe`);
                else if (!this._esSocioDiscreto(s)) errores.push(`Variable «${s.categoria}»: solo una binaria o categórica puede depender de otra variable; para una continua usa la tabla IV (diferencias por grupo)`);
                else if (!(ref.distribucion === 'binaria' || ref.distribucion === 'categorica')) errores.push(`Variable «${s.categoria}»: solo puede depender de una binaria o categórica (para que una categoría dependa de una continua, plantéalo al revés: la continua difiere por grupo, tabla IV)`);
                else if (s.distribucion === 'conteo') errores.push(`Variable «${s.categoria}»: un conteo no puede depender de otra variable`);
                // ciclos
                let cur = ref, pasos = 0;
                while (cur && cur.dependeDe && pasos < 50) { if (cur.dependeDe === s.categoria) { errores.push(`Dependencia circular entre «${s.categoria}» y «${cur.categoria}»`); break; } cur = porNombre.get(cur.dependeDe); pasos++; }
                if (!(s.fuerza > 0)) advertencias.push(`Variable «${s.categoria}»: depende de «${s.dependeDe}» con fuerza 0, es decir, sin asociación`);
            }
            if (s.fechaNacimiento) {
                if (this._esSocioDiscreto(s)) errores.push(`Variable «${s.categoria}»: la fecha de nacimiento solo se deriva de una variable continua (edad en años)`);
                else if (s.promedio < 5 || s.promedio > 110) advertencias.push(`Variable «${s.categoria}»: se derivará una fecha de nacimiento suponiendo que es una edad en años (promedio ${s.promedio})`);
                if (s.fechaNacimiento === 'hoy' && cfg.semilla !== null && cfg.semilla !== undefined && cfg.semilla !== '') advertencias.push(`Variable «${s.categoria}»: la fecha de nacimiento se calcula a la fecha de HOY, así que la misma semilla dará fechas distintas otro día; usa «fecha:AAAA-MM-DD» para reproducibilidad`);
            }
        });
        const r = cfg.realismo || {};
        if (r.pctPerdidos > 0 && (r.mecanismoPerdidos === 'MAR') && r.referenciaMAR) {
            const existe = socios.some(s => s.categoria === r.referenciaMAR && (!this._esSocioDiscreto(s) || s.distribucion === 'conteo' || s.ordinal)) || (cfg.pruebas || []).some(p => p.nombre === r.referenciaMAR);
            if (!existe) errores.push(`Valores perdidos MAR: la variable de referencia «${r.referenciaMAR}» no es una variable numérica u ordinal del estudio`);
        }
    },

    _validarDicotomicas(errores, advertencias) {
        const cfg = this.configuracion;
        (cfg.pruebas || []).forEach(p => {
            if (!this._esDicotomica(p) || p.sufijo) return;
            const k = p.numItems, et = `Escala dicotómica «${p.nombre}»`;
            if (Array.isArray(p.dificultades)) {
                if (p.dificultades.length !== k) errores.push(`${et}: ${k} ítems necesitan ${k} dificultades (hay ${p.dificultades.length})`);
                else if (p.dificultades.some(v => v < 0.05 || v > 0.95)) advertencias.push(`${et}: alguna dificultad está fuera de 0.05–0.95; ítems tan fáciles o tan difíciles no discriminan`);
            }
            const pMedia = (p.media - k * p.minimo) / k;
            if (!(pMedia > 0.05 && pMedia < 0.95)) errores.push(`${et}: la Media ${p.media} implica una proporción media de aciertos de ${pMedia.toFixed(2)}; debe estar entre 0.05 y 0.95 (con ${k} ítems, Media entre ${(k * p.minimo + 0.05 * k).toFixed(1)} y ${(k * p.minimo + 0.95 * k).toFixed(1)})`);
            if (!(p.alfa > 0.2 && p.alfa < 0.97)) errores.push(`${et}: el KR-20 objetivo debe estar entre 0.20 y 0.97`);
            const imp = this._dicotomicaImplicita(p, cfg.heterogeneidadItems);
            // la varianza derivada debe caber en una suma de k aciertos: el total se muestrea
            // de una beta-binomial, cuya varianza máxima es k²·m(1 − m) (toda la masa en 0 y k)
            const mProp = (imp.media - k * p.minimo) / k;
            const sobredispersion = (imp.desviacion * imp.desviacion) / Math.max(1e-9, k * mProp * (1 - mProp));
            if (sobredispersion >= 0.8 * k) errores.push(`${et}: con Media ${imp.media.toFixed(2)} en ${k} ítems, el KR-20 ${p.alfa} exigiría una DE de ${imp.desviacion.toFixed(2)}, que solo se alcanza con casi todas las puntuaciones en 0 o en ${k}; baja el KR-20, acerca la Media a ${(k * p.minimo + k / 2).toFixed(1)} o añade ítems`);
            if (Math.abs((p.desviacionPedida !== undefined ? p.desviacionPedida : p.desviacion) - imp.desviacion) > 0.05) advertencias.push(`${et}: en ítems dicotómicos la DE la fijan las dificultades y el KR-20: se usará DE = ${imp.desviacion.toFixed(2)} (en vez de ${(p.desviacionPedida !== undefined ? p.desviacionPedida : p.desviacion)})`);
            if (Array.isArray(p.dificultades) && p.dificultades.length === k && Math.abs(imp.media - p.media) > 0.01 && p.desviacionPedida === undefined) advertencias.push(`${et}: la Media será la suma de las dificultades (${imp.media.toFixed(2)})`);
            if ((cfg.estructuras || []).some(e => e.cargas && e.cargas[p.nombre])) errores.push(`${et}: la estructura factorial no está disponible para ítems dicotómicos (sus correlaciones son tetracóricas); usa las dificultades y el KR-20`);
            if (p.distribucion !== 'normal') advertencias.push(`${et}: la forma «${p.distribucion}» se aplica al total; con pocos ítems la distribución de aciertos ya es discreta`);
        });
    },

});
