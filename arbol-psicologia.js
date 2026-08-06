// ========================================
// ÁRBOL DE ÁREAS DE INVESTIGACIÓN EN PSICOLOGÍA — módulo del Explorador.
// ~500 temas curados en Área → Subcategoría → Tema, con FILTRO instantáneo.
// RENDIMIENTO MÁXIMO por diseño:
//  · Datos estáticos locales (cero red; ~35 KB que gzip deja en ~9 KB).
//  · Render SOLO del nivel visible: nunca hay más de ~60 botones en el DOM.
//  · UNA única delegación de eventos para todo el árbol (memoria O(1)).
//  · Filtro sobre un índice plano pre-normalizado (500 comparaciones < 1 ms),
//    con debounce de 150 ms para no renderizar en cada pulsación.
//  · Estética con CSS puro: transiciones solo de color/fondo (sin reflows).
// ========================================
const ArbolPsicologia = {
    DATOS: {
        'Clínica y salud mental': {
            'Ansiedad y estrés': ['ansiedad en universitarios','ansiedad social juvenil','ataques de pánico','estrés académico','estrés postraumático','ansiedad por incertidumbre','preocupación excesiva','fobias específicas'],
            'Depresión y ánimo': ['depresión adolescente','depresión y soledad','anhedonia juvenil','distimia en adultos','depresión posparto','desesperanza y futuro','tristeza persistente escolar'],
            'Suicidio y autolesión': ['ideación suicida universitaria','conducta autolesiva adolescente','prevención del suicidio escolar','señales de alerta suicida','sobrevivientes de suicidio','autolesión y redes sociales'],
            'Adicciones a sustancias': ['consumo de alcohol en universitarios','tabaquismo juvenil','vapeo adolescente','marihuana y motivación','policonsumo juvenil','recaída en adicciones','familia y consumo de drogas'],
            'Adicciones comportamentales': ['adicción a redes sociales','videojuegos problemáticos','apuestas en línea','adicción al celular','compras compulsivas','pornografía problemática','apuestas deportivas juveniles'],
            'Conducta alimentaria y cuerpo': ['imagen corporal y redes','insatisfacción corporal adolescente','conducta alimentaria de riesgo','atracones y emociones','dieta crónica juvenil','musculatura y dismorfia'],
            'Trauma y adversidad': ['experiencias adversas en la infancia','abuso sexual infantil secuelas','violencia y trauma comunitario','resiliencia postraumática','duelo complicado','crecimiento postraumático'],
            'Obsesiones y control': ['pensamientos intrusivos','perfeccionismo clínico','acumulación compulsiva','rituales de comprobación','tricotilomanía','rumiación y control'],
            'Sueño': ['insomnio universitario','higiene del sueño juvenil','pesadillas y ansiedad','uso del celular nocturno','somnolencia diurna escolar','cronotipo y rendimiento'],
            'Psicoterapia y ayuda': ['abandono de la terapia','alianza terapéutica','terapia en línea eficacia percibida','barreras para pedir ayuda','autoayuda con aplicaciones','preferencias de tratamiento'],
            'Emociones difíciles': ['vergüenza y evitación','culpa y reparación','ira al conducir','frustración y pantallas','celos entre amigos','soledad no deseada juvenil','apatía y desmotivación','sensibilidad al rechazo'],
            'Psicosis y espectro grave': ['primer episodio psicótico','pródromos en jóvenes','alucinaciones y angustia','adherencia en esquizofrenia','familia y psicosis','recuperación funcional','psicosis y consumo de cannabis','voces y afrontamiento'],
            'Bipolaridad y regulación del ánimo': ['detección temprana de bipolaridad','manía y decisiones de riesgo','eutimia y rutinas','ciclado y sueño','bipolaridad en universitarios','creatividad y ánimo elevado','estacionalidad del ánimo'],
            'Personalidad': ['rasgos límite en jóvenes','perfeccionismo desadaptativo','narcisismo y redes sociales','dependencia emocional','evitación experiencial','rigidez y cambio vital','impulsividad rasgo','personalidad y estilo de apego adulto'],
            'Infantojuvenil clínica': ['ansiedad por separación','mutismo selectivo','rabietas intensas y crianza','terrores nocturnos','ansiedad escolar y ausentismo','tics y estrés infantil','duelo en la infancia','somatización en niños'],
            'Disociación y despersonalización': ['despersonalización en jóvenes','desrealización y pantallas','disociación tras trauma','lagunas de memoria y estrés','ensoñación excesiva'],
            'Diagnóstico y evaluación': ['autodiagnóstico por redes sociales','sobrediagnóstico percibido','etiquetas diagnósticas e identidad','cribado en atención primaria','evaluación en línea validez','diagnóstico tardío en adultas'],
            'Tratamiento farmacológico vivido': ['actitudes hacia antidepresivos','adherencia a psicofármacos','efectos secundarios y abandono','automedicación ansiolítica','retirada de antidepresivos','ansiolíticos en universitarios'],
            'Crisis y emergencias': ['primeros auxilios psicológicos','salud mental tras desastres','líneas de ayuda uso y confianza','crisis en urgencias hospitalarias','contención familiar en crisis','después del intento suicida'],
            'Estigma y búsqueda de ayuda': ['autoestigma y terapia','hablar de salud mental en familia','salud mental masculina y silencio','revelación del diagnóstico','estigma en el trabajo','campañas antiestigma eficacia percibida']
        },
        'Educativa': {
            'Aprendizaje y rendimiento': ['procrastinación académica','motivación escolar','hábitos de estudio y rendimiento','autoeficacia académica','metas de logro estudiantil','autorregulación del aprendizaje','mentalidad de crecimiento','aprendizaje autodirigido'],
            'Convivencia escolar': ['acoso escolar','ciberacoso adolescente','clima del aula','violencia escolar','exclusión entre pares','espectadores del acoso','convivencia y disciplina positiva'],
            'Tecnología educativa': ['inteligencia artificial en el aula','distracción digital estudiantil','educación virtual y aprendizaje','celular en clase','gamificación educativa','tutoría con chatbots','plagio con inteligencia artificial'],
            'Bienestar estudiantil': ['ansiedad ante exámenes','burnout académico','sentido de pertenencia escolar','soledad universitaria','sueño y rendimiento escolar','transición a la universidad'],
            'Docentes': ['burnout docente','autoeficacia del profesor','violencia hacia docentes','bienestar del profesorado','formación socioemocional docente'],
            'Inclusión y diversidad': ['inclusión de discapacidad en aula','altas capacidades y ajuste','educación intercultural','barreras de aprendizaje','apoyo a estudiantes migrantes'],
            'Orientación vocacional': ['indecisión vocacional','elección de carrera y familia','expectativas laborales juveniles','reorientación vocacional universitaria','vocación y salario percibido'],
            'Lectura y lenguaje': ['comprensión lectora adolescente','hábito lector y pantallas','escritura académica ansiedad','bilingüismo escolar','vocabulario y contexto socioeconómico'],
            'Evaluación educativa': ['ansiedad ante evaluación oral','retroalimentación y motivación','autoevaluación estudiantil','notas y autoconcepto','copia y deshonestidad académica'],
            'Matemáticas y ciencia': ['ansiedad matemática','actitudes hacia la ciencia','vocaciones científicas femeninas','razonamiento estadístico estudiantil','curiosidad científica infantil','miedo al error en matemáticas','divulgación y comprensión pública','laboratorio y motivación']
        },
        'Organizacional y del trabajo': {
            'Bienestar laboral': ['burnout profesional','tecnoestrés laboral','teletrabajo y salud mental','conciliación trabajo-familia','desconexión digital laboral','engagement laboral','aburrimiento laboral'],
            'Clima y liderazgo': ['liderazgo y compromiso laboral','clima organizacional','liderazgo tóxico','confianza en el jefe','liderazgo femenino','justicia organizacional'],
            'Riesgos psicosociales': ['acoso laboral','inseguridad laboral','carga mental de trabajo','violencia en el trabajo','turnos nocturnos y salud','precariedad laboral juvenil'],
            'Talento y carrera': ['rotación laboral juvenil','renuncia silenciosa','empleabilidad de egresados','satisfacción laboral','desarrollo de carrera','emprendimiento y personalidad'],
            'Nuevas formas de trabajo': ['trabajo en plataformas digitales','inteligencia artificial y empleo','automatización y ansiedad laboral','trabajo híbrido productividad','nómadas digitales bienestar'],
            'Selección y evaluación': ['entrevistas y sesgos','evaluación por competencias','pruebas psicométricas laborales','marca personal y contratación','edad y discriminación en selección'],
            'Equipos y colaboración': ['seguridad psicológica en equipos','conflicto intergeneracional laboral','reuniones y fatiga','cohesión en equipos remotos','ostracismo laboral'],
            'Emprendimiento': ['miedo al fracaso emprendedor','estrés del autónomo','emprendimiento juvenil motivos','abandono de emprendimientos','emprendimiento social propósito','conciliación del emprendedor','financiamiento y ansiedad','emprendimiento femenino barreras']
        },
        'Social y comunitaria': {
            'Redes sociales y tecnología': ['comparación social en redes','desinformación y creencias','nomofobia','bienestar digital','miedo a quedarse fuera','autopresentación en redes','influencers y jóvenes','discurso de odio en línea'],
            'Violencia y convivencia': ['violencia de pareja','violencia de género juvenil','percepción de inseguridad','acoso callejero','normalización de la violencia','masculinidades y violencia'],
            'Migración y cultura': ['migración y salud mental','aculturación de migrantes','discriminación percibida','xenofobia y contacto','identidad bicultural','retorno migratorio'],
            'Participación y comunidad': ['sentido de comunidad','participación ciudadana juvenil','voluntariado y bienestar','capital social barrial','acción colectiva juvenil'],
            'Actitudes y prejuicio': ['prejuicio hacia minorías','estigma de la salud mental','actitudes hacia la diversidad sexual','edadismo','estereotipos de género infantiles'],
            'Ambiente y conducta': ['ecoansiedad juvenil','conducta proambiental','apego al lugar','percepción del cambio climático','consumo responsable'],
            'Pareja y relaciones': ['aplicaciones de citas','celos y redes sociales','ruptura y bienestar','comunicación en pareja joven','infidelidad percepción juvenil','convivencia prematrimonial'],
            'Comunicación y persuasión': ['teorías conspirativas adhesión','polarización afectiva','alfabetización mediática','rumores en crisis','publicidad emocional'],
            'Voluntariado y ayuda': ['conducta prosocial juvenil','donación de sangre motivos','ayuda al extraño','altruismo y anonimato','fatiga por compasión','solidaridad en desastres','microdonaciones digitales','cooperación vecinal'],
            'Identidad y grupos': ['identidad nacional juvenil','pertenencia a tribus urbanas','identidad regional y orgullo','hinchadas y pertenencia','identidad generacional','doble identidad rural-urbana','grupos en línea e identidad','símbolos y cohesión grupal'],
            'Normas y conformidad': ['conformidad en redes sociales','presión normativa y consumo','normas de propina','filas y respeto de turnos','desobediencia civil percepción','normas de género en el hogar','silencio ante lo indebido','honestidad y contexto'],
            'Conducta colectiva y protesta': ['motivaciones para protestar','eficacia colectiva percibida','emociones en movilizaciones','activismo digital','desgaste del activista','protesta y estigmatización','arte y protesta social','participación tras la protesta'],
            'Vivienda y ciudad': ['hacinamiento y convivencia','espacios públicos y encuentro','ruido urbano y estrés','transporte público y bienestar','gentrificación percibida','vivienda alquilada y arraigo','vecindarios y confianza','ciudades caminables y ánimo'],
            'Género y roles': ['corresponsabilidad doméstica','techo de cristal percibido','paternidad activa','estereotipos de género en juguetes','mujeres en ciencia barreras','micromachismos cotidianos','roles de género en publicidad','carga mental femenina'],
            'Relaciones intergrupales': ['contacto intergrupal y prejuicio','amistades interculturales','equipos deportivos y integración','humor y fronteras grupales','narrativas del nosotros-ellos','cooperación entre barrios rivales','memoria histórica y reconciliación'],
            'Confianza institucional': ['confianza en la prensa','confianza en la ciencia','desafección política juvenil','corrupción percibida y apatía','confianza en jueces','participación electoral joven','instituciones y esperanza social']
        },
        'Desarrollo y familia': {
            'Primera infancia': ['apego infantil','uso de pantallas en niños','juego y desarrollo','regulación emocional temprana','lenguaje y crianza','sueño infantil'],
            'Niñez': ['habilidades socioemocionales escolares','autonomía infantil','miedos infantiles','amistad en la niñez','responsabilidad y tareas domésticas'],
            'Adolescencia': ['identidad adolescente','presión de grupo','autoestima adolescente','toma de riesgos juvenil','primera relación de pareja','autonomía y conflicto familiar'],
            'Crianza y familia': ['estilos de crianza','comunicación familiar','coparentalidad tras divorcio','familias monoparentales y ajuste','abuelos cuidadores','crianza y pantallas'],
            'Adultez y vejez': ['soledad en adultos mayores','envejecimiento activo','cuidadores de dependientes','jubilación y propósito','brecha digital en mayores','viudez y adaptación'],
            'Hermanos y fratría': ['rivalidad entre hermanos','hermanos de personas con discapacidad','orden de nacimiento y personalidad','apoyo fraterno adulto'],
            'Transiciones vitales': ['nido vacío','paternidad primeriza','mudanza y adaptación juvenil','emancipación tardía','retorno al hogar parental'],
            'Mascotas y vínculo': ['mascotas y soledad','duelo por mascota','perros y actividad física','mascotas en la infancia','vínculo humano-animal en mayores','mascotas y ansiedad universitaria','adopción animal motivos','gatos y bienestar']
        },
        'Neuropsicología y cognición': {
            'Funciones cognitivas': ['memoria de trabajo y aprendizaje','atención y multitarea digital','funciones ejecutivas infantiles','velocidad de procesamiento','toma de decisiones y fatiga','memoria prospectiva'],
            'Neurodesarrollo': ['TDAH escolar','autismo e inclusión educativa','dificultades de aprendizaje','dislexia y autoestima','diagnóstico tardío en mujeres','discalculia'],
            'Deterioro y rehabilitación': ['deterioro cognitivo leve','estimulación cognitiva en mayores','reserva cognitiva','rehabilitación tras ictus','demencia y cuidadores'],
            'Cognición y tecnología': ['memoria y buscadores web','descarga cognitiva en inteligencia artificial','lectura digital versus papel','videojuegos y atención','mapas mentales y GPS'],
            'Lenguaje y comunicación': ['desarrollo del lenguaje y pantallas','tartamudez y ansiedad social','afasia y familia','comunicación aumentativa'],
            'Creatividad y pensamiento': ['creatividad y aburrimiento','pensamiento crítico universitario','insight y resolución de problemas','creatividad e inteligencia artificial'],
            'Música y cognición': ['música y concentración','entrenamiento musical y memoria','música y regulación emocional','preferencias musicales y personalidad','música en el ejercicio','canto coral y bienestar','música y sueño','bandas sonoras y emoción'],
            'Memoria y olvido': ['falsos recuerdos','memoria autobiográfica y redes sociales','olvido intencional','memoria de contraseñas','efecto de la fotografía en el recuerdo','memoria y emoción','testigos y sugestión','repaso espaciado eficacia'],
            'Percepción y atención sostenida': ['ceguera por desatención','atención sostenida en clases largas','fatiga atencional digital','percepción del tiempo en espera','ruido y concentración','ilusiones perceptivas cotidianas','atención plena y errores','señales de tránsito y percepción'],
            'Emoción y cerebro': ['regulación emocional y corteza prefrontal','estrés crónico y memoria','miedo condicionado cotidiano','asco moral','interocepción y ansiedad','risa y vínculo social','llanto y alivio emocional','emoción y toma de riesgos'],
            'Sueño y cognición': ['privación de sueño y atención','siesta y consolidación de memoria','soñar y resolución de problemas','deuda de sueño universitaria','cronotipo y horarios escolares','sueño y aprendizaje motor','microsueños al conducir','sueño irregular y ánimo'],
            'Neurociencia social': ['empatía y dolor ajeno','sincronía en conversaciones','contagio emocional en grupos','mirada y confianza','cerebro adolescente y recompensa social','exclusión social y dolor','imitación y aprendizaje social','oxitocina y cooperación percibida'],
            'Cognición numérica y tiempo': ['sentido numérico infantil','estimación de cantidades','procrastinación y percepción temporal','planificación del tiempo estudiantil','números grandes y decisiones','ansiedad y percepción del reloj'],
            'Neuropsicología del deporte': ['conmoción cerebral en deporte juvenil','cabeceos en fútbol formativo','tiempo de reacción y entrenamiento','fatiga mental y precisión','doble tarea en atletas','retorno al juego tras conmoción']
        },
        'Salud y comportamiento': {
            'Conductas de salud': ['adherencia al tratamiento','actividad física y bienestar','calidad del sueño universitario','sedentarismo juvenil','alimentación emocional','autocuidado en jóvenes'],
            'Enfermedad crónica': ['afrontamiento del cáncer','diabetes y ajuste psicológico','dolor crónico y depresión','fibromialgia y estigma','adherencia en hipertensión','enfermedad rara y familia'],
            'Salud sexual y reproductiva': ['educación sexual adolescente','embarazo adolescente','salud mental perinatal','infertilidad y pareja','anticoncepción y decisión','menopausia y bienestar'],
            'Sistema de salud': ['burnout en personal sanitario','comunicación médico-paciente','miedo a consultar','telemedicina aceptación','listas de espera y ansiedad'],
            'Psiconeuroinmunología': ['estrés y sistema inmune','sueño e inflamación','soledad y salud física','mindfulness y cortisol'],
            'Conducta y prevención': ['vacunación y confianza','autoexamen y detección temprana','protección solar juvenil','conducción y riesgo','chequeos preventivos evitación'],
            'Dolor y cuerpo': ['catastrofización del dolor','dolor menstrual y vida académica','migraña y estrés','kinesiofobia','dolor lumbar y sedentarismo','placebo y expectativas','dolor crónico juvenil','autocompasión y dolor']
        },
        'Forense y jurídica': {
            'Conducta antisocial': ['agresividad juvenil','reincidencia delictiva','consumo de drogas y delito','pandillas juveniles','impulsividad y delito','psicopatía juvenil'],
            'Víctimas y proceso': ['victimización y trauma','testimonio infantil','violencia intrafamiliar denunciada','revictimización institucional','memoria de testigos'],
            'Sistema penitenciario': ['salud mental en prisión','reinserción social','familias de internos','educación en cárceles'],
            'Ciberdelito': ['sextorsión adolescente','grooming en línea','fraude digital a mayores','ciberacoso laboral'],
            'Justicia y percepción': ['confianza en la policía','percepción de impunidad','justicia restaurativa','jurados y sesgos','denuncia y miedo a represalias'],
            'Consumo problemático y ley': ['conducción bajo alcohol jóvenes','menores y venta de alcohol','apuestas ilegales juveniles','normativa de vapeo percepción','drogas sintéticas percepción de riesgo','fiestas y policonsumo','ley seca y conducta','sanciones y disuasión percibida']
        },
        'Deportiva y ejercicio': {
            'Rendimiento': ['ansiedad precompetitiva','motivación deportiva','concentración y flow','autoconfianza del atleta','presión de resultados juvenil'],
            'Bienestar del atleta': ['burnout deportivo','lesión y salud mental','retiro deportivo','identidad del atleta','trastornos alimentarios en deporte'],
            'Ejercicio y salud mental': ['ejercicio y depresión','ejercicio y ansiedad','adherencia al ejercicio','deporte y autoestima juvenil','naturaleza y actividad física'],
            'Contexto deportivo': ['padres en el deporte infantil','violencia en el deporte','abuso en el deporte formativo','esports y salud'],
            'Cuerpo y movimiento': ['imagen corporal en gimnasios','vigorexia','danza y bienestar emocional','yoga y ansiedad','ejercicio en la vejez'],
            'Aire libre': ['senderismo y estado de ánimo','deporte urbano juvenil','ciclismo y estrés','parques y actividad infantil','ejercicio con calor extremo','running y comunidad','deporte y contacto con naturaleza','playas y bienestar']
        },
        'Positiva y bienestar': {
            'Fortalezas y virtudes': ['gratitud y bienestar','optimismo aprendido','autocompasión','perdón y salud mental','humor y afrontamiento'],
            'Sentido y propósito': ['propósito de vida juvenil','sentido del trabajo','espiritualidad y bienestar','valores y decisiones vitales'],
            'Prácticas de bienestar': ['mindfulness en estudiantes','diario de emociones','desconexión digital voluntaria','contacto con la naturaleza','ocio y bienestar'],
            'Relaciones positivas': ['amistad en la adultez','soledad elegida versus impuesta','apoyo social percibido','gratitud en pareja'],
            'Emociones cotidianas': ['nostalgia y bienestar','asombro y naturaleza','aburrimiento y creatividad','envidia en redes sociales','alegría compartida'],
            'Hábitos y cambio': ['formación de hábitos saludables','propósitos de año nuevo abandono','microhábitos eficacia','recompensas y constancia','apps de hábitos adherencia','identidad y cambio de hábito','recaídas y autocompasión','rachas y motivación']
        },
        'Ciberpsicología': {
            'Inteligencia artificial y personas': ['confianza en la inteligencia artificial','compañeros virtuales y soledad','chatbots de apoyo emocional','ansiedad por inteligencia artificial','dependencia de asistentes virtuales'],
            'Identidad digital': ['identidad en el metaverso','avatares y autoconcepto','anonimato y desinhibición','huella digital y reputación'],
            'Riesgos en línea': ['sexting adolescente','retos virales peligrosos','estafas románticas','exposición a contenido dañino','apuestas encubiertas en videojuegos'],
            'Usos y hábitos': ['doomscrolling y ánimo','multitarea con pantallas','streaming y sueño','detox digital efectividad'],
            'Comunidades en línea': ['pertenencia en comunidades digitales','fandoms y identidad','foros de apoyo mutuo','moderación y clima de comunidad'],
            'Juego digital': ['videojuegos y socialización','streamers y parasocialidad','compras dentro del juego','juego cooperativo y familia']
        },
        'Económica y del consumidor': {
            'Decisiones económicas': ['conducta financiera juvenil','endeudamiento y estrés','compra impulsiva en línea','ahorro y autocontrol','educación financiera y conducta'],
            'Consumo y bienestar': ['materialismo y felicidad','consumo por comparación social','minimalismo y bienestar','publicidad y autoestima adolescente'],
            'Trabajo y dinero': ['inseguridad económica y salud mental','pobreza y desarrollo infantil','desigualdad percibida','apoyo económico familiar a jóvenes'],
            'Decisión y riesgo': ['aversión a la pérdida cotidiana','criptomonedas y jóvenes','loterías y esperanza','sesgo del presente y ahorro'],
            'Turismo y ocio': ['viaje y bienestar subjetivo','turismo y redes sociales','ocio nocturno juvenil','vacaciones y desconexión laboral']
        }
    },
    _sel: { area: null, sub: null },
    _indice: null, // [{area, sub, tema, norm}] pre-construido una vez
    _debounce: null,
    montar() {
        const slot = document.getElementById('seccionExplorar');
        if (!slot || document.getElementById('arbolPsico')) return;
        this._inyectarEstilos();
        // Índice plano para el filtro (una sola vez, ~500 entradas).
        const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        this._indice = [];
        for (const [area, subs] of Object.entries(this.DATOS))
            for (const [sub, temas] of Object.entries(subs))
                for (const tema of temas)
                    this._indice.push({ area, sub, tema, norm: norm(area + ' ' + sub + ' ' + tema) });
        const total = this._indice.length;
        const cont = document.createElement('div');
        cont.className = 'card';
        cont.id = 'arbolPsico';
        cont.innerHTML = `
          <h3 class="card-title">🌳 Árbol de áreas de investigación <span class="arb-total">${total} temas</span></h3>
          <p class="help-text" style="margin:0 0 0.6rem;">Navega de lo general a lo específico — o escribe en el filtro y encuentra tu tema al instante. Un clic en cualquier tema lo manda directo al medidor de brechas.</p>
          <input type="text" id="arbolFiltro" class="input" placeholder="🔍 Filtrar los ${total} temas… (Ej: sueño, redes, docentes)" autocomplete="off" style="margin-bottom:0.7rem;">
          <div id="arbolCols" class="arb-cols"></div>`;
        slot.insertBefore(cont, slot.firstChild);
        // UNA delegación para todo (navegación, filtro y resultados).
        document.getElementById('arbolCols').addEventListener('click', (e) => {
            const b = e.target.closest('button[data-tipo]');
            if (!b) return;
            const { tipo, valor } = b.dataset;
            if (tipo === 'area') this._sel = { area: valor, sub: null };
            else if (tipo === 'sub') this._sel.sub = valor;
            else if (tipo === 'tema') { this._elegirTema(valor); return; }
            this._render();
        });
        document.getElementById('arbolFiltro').addEventListener('input', (e) => {
            clearTimeout(this._debounce);
            this._debounce = setTimeout(() => this._render(e.target.value), 150);
        });
        this._render();
    },
    _elegirTema(valor) {
        const caja = document.getElementById('expTema');
        if (caja) { caja.value = valor; if (caja.scrollIntoView) caja.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        if (document.getElementById('expBuscar') && typeof Explorar !== 'undefined') Explorar._onExplorar();
    },
    _inyectarEstilos() {
        if (document.getElementById('arbolEstilos')) return;
        const st = document.createElement('style');
        st.id = 'arbolEstilos';
        st.textContent = `
          #arbolPsico .arb-total{font-size:0.68em;font-weight:600;color:#2E5BBA;background:#e8eefb;border-radius:999px;padding:0.15em 0.7em;vertical-align:middle;margin-left:0.4em;}
          #arbolPsico .arb-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:0.7rem;}
          #arbolPsico .arb-col{border:1px solid var(--color-border,#e3e6ee);border-radius:0.7rem;background:#fbfcff;overflow:hidden;}
          #arbolPsico .arb-cab{font-weight:600;font-size:0.82em;letter-spacing:0.03em;color:#fff;background:linear-gradient(135deg,#2E5BBA,#4a74d0);padding:0.45rem 0.7rem;}
          #arbolPsico .arb-lista{display:flex;flex-direction:column;gap:0.15rem;max-height:16rem;overflow:auto;padding:0.45rem;scrollbar-width:thin;}
          #arbolPsico .arb-item{text-align:left;padding:0.38rem 0.6rem;border-radius:0.45rem;border:none;border-left:3px solid transparent;background:transparent;cursor:pointer;font-size:0.88em;line-height:1.3;color:#2a2f3a;transition:background-color .12s,color .12s,border-color .12s;}
          #arbolPsico .arb-item:hover{background:#eef3fd;color:#2E5BBA;}
          #arbolPsico .arb-item.act{background:#e8eefb;color:#2E5BBA;border-left-color:#2E5BBA;font-weight:600;}
          #arbolPsico .arb-item .arb-n{float:right;font-size:0.78em;color:#8a93a5;font-weight:400;}
          #arbolPsico .arb-tema::before{content:'🔎 ';opacity:0.7;}
          #arbolPsico .arb-ruta{display:block;font-size:0.74em;color:#8a93a5;margin-top:0.1rem;}
          #arbolPsico .arb-vacio{padding:0.8rem;color:#8a93a5;font-size:0.88em;}`;
        document.head.appendChild(st);
    },
    _render(filtro = '') {
        const cols = document.getElementById('arbolCols');
        if (!cols) return;
        const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
        const f = filtro.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        // MODO FILTRO: columna única de resultados (máx 60 en el DOM).
        if (f.length >= 2) {
            const hits = this._indice.filter(x => x.norm.includes(f));
            const vis = hits.slice(0, 60);
            cols.innerHTML = `<div class="arb-col" style="grid-column:1/-1;">
              <div class="arb-cab">Resultados del filtro — ${hits.length} tema(s)${hits.length > 60 ? ' (mostrando 60; afina la búsqueda)' : ''}</div>
              <div class="arb-lista">${vis.length ? vis.map(x =>
                `<button type="button" class="arb-item arb-tema" data-tipo="tema" data-valor="${esc(x.tema)}">${esc(x.tema)}<span class="arb-ruta">${esc(x.area)} › ${esc(x.sub)}</span></button>`).join('')
                : '<div class="arb-vacio">Sin coincidencias. Prueba con otra palabra (Ej: «sueño», «pareja», «docente»).</div>'}</div></div>`;
            return;
        }
        // MODO NAVEGACIÓN: 3 columnas, solo lo visible.
        const col = (titulo, items, tipo, activo, cuenta) => `
          <div class="arb-col"><div class="arb-cab">${titulo}</div><div class="arb-lista">
            ${items.map(it => `<button type="button" class="arb-item ${tipo === 'tema' ? 'arb-tema' : ''}${it === activo ? ' act' : ''}" data-tipo="${tipo}" data-valor="${esc(it)}">${esc(it)}${cuenta ? `<span class="arb-n">${cuenta(it)}</span>` : ''}</button>`).join('')}
          </div></div>`;
        const nArea = a => Object.values(this.DATOS[a]).reduce((s, t) => s + t.length, 0);
        let html = col('1 · Área', Object.keys(this.DATOS), 'area', this._sel.area, nArea);
        if (this._sel.area) html += col('2 · Subcategoría', Object.keys(this.DATOS[this._sel.area]), 'sub', this._sel.sub, s => this.DATOS[this._sel.area][s].length);
        if (this._sel.area && this._sel.sub) html += col('3 · Tema — clic = explorar brechas', this.DATOS[this._sel.area][this._sel.sub], 'tema', null, null);
        cols.innerHTML = html;
    }
};
if (typeof window !== 'undefined') {
    window.ArbolPsicologia = ArbolPsicologia;
    const iniciar = () => { ArbolPsicologia.montar(); };
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => setTimeout(iniciar, 0));
    else setTimeout(iniciar, 0);
}
