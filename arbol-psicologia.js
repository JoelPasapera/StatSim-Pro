// ========================================
// ÁRBOL DE CATEGORÍAS DE INVESTIGACIÓN EN PSICOLOGÍA — módulo del Explorador.
// Navegación interactiva Área → Subcategoría → Tema, en tres columnas.
// RENDIMIENTO PRIMERO: datos estáticos locales (cero red), render solo del
// nivel visible, UNA sola delegación de eventos, sin librerías.
// Al elegir un tema: se envía como semilla al Explorador de brechas.
// ========================================
const ArbolPsicologia = {
    DATOS: {
        'Clínica y salud mental': {
            'Trastornos emocionales': ['ansiedad en jóvenes', 'depresión y soledad', 'estrés postraumático', 'regulación emocional'],
            'Adicciones': ['adicción a redes sociales', 'apuestas en línea', 'consumo de alcohol en universitarios', 'videojuegos problemáticos'],
            'Conducta alimentaria y cuerpo': ['imagen corporal y redes', 'insatisfacción corporal adolescente', 'conducta alimentaria de riesgo'],
            'Suicidio y autolesión': ['conducta autolesiva adolescente', 'ideación suicida universitaria', 'prevención del suicidio escolar']
        },
        'Educativa': {
            'Aprendizaje y rendimiento': ['procrastinación académica', 'motivación escolar', 'hábitos de estudio y rendimiento', 'autoeficacia académica'],
            'Convivencia escolar': ['acoso escolar', 'ciberacoso adolescente', 'clima del aula', 'violencia escolar'],
            'Tecnología educativa': ['inteligencia artificial en el aula', 'distracción digital estudiantil', 'educación virtual y aprendizaje'],
            'Bienestar estudiantil': ['ansiedad ante exámenes', 'burnout académico', 'sentido de pertenencia escolar']
        },
        'Organizacional y del trabajo': {
            'Bienestar laboral': ['burnout profesional', 'tecnoestrés laboral', 'teletrabajo y salud mental', 'conciliación trabajo-familia'],
            'Clima y liderazgo': ['liderazgo y compromiso laboral', 'clima organizacional', 'satisfacción laboral'],
            'Riesgos psicosociales': ['acoso laboral', 'inseguridad laboral', 'carga mental de trabajo']
        },
        'Social y comunitaria': {
            'Redes sociales y tecnología': ['comparación social en redes', 'desinformación y creencias', 'nomofobia', 'bienestar digital'],
            'Violencia y convivencia': ['violencia de pareja', 'violencia de género juvenil', 'percepción de inseguridad'],
            'Migración y cultura': ['migración y salud mental', 'aculturación de migrantes', 'discriminación percibida'],
            'Participación y comunidad': ['sentido de comunidad', 'participación ciudadana juvenil', 'voluntariado y bienestar']
        },
        'Desarrollo y familia': {
            'Infancia': ['crianza y desarrollo socioemocional', 'apego infantil', 'uso de pantallas en niños'],
            'Adolescencia': ['identidad adolescente', 'presión de grupo', 'autoestima adolescente'],
            'Familia': ['estilos de crianza', 'comunicación familiar', 'familias monoparentales y ajuste'],
            'Adultez y vejez': ['soledad en adultos mayores', 'envejecimiento activo', 'cuidadores de dependientes']
        },
        'Neuropsicología y cognición': {
            'Funciones cognitivas': ['memoria de trabajo y aprendizaje', 'atención y multitarea digital', 'funciones ejecutivas infantiles'],
            'Neurodesarrollo': ['TDAH escolar', 'autismo e inclusión educativa', 'dificultades de aprendizaje'],
            'Deterioro y rehabilitación': ['deterioro cognitivo leve', 'estimulación cognitiva en mayores']
        },
        'Salud y comportamiento': {
            'Conductas de salud': ['adherencia al tratamiento', 'actividad física y bienestar', 'calidad del sueño universitario'],
            'Enfermedad crónica': ['afrontamiento del cáncer', 'diabetes y ajuste psicológico', 'dolor crónico y depresión'],
            'Salud sexual y reproductiva': ['educación sexual adolescente', 'embarazo adolescente', 'salud mental perinatal']
        },
        'Forense y jurídica': {
            'Conducta antisocial': ['agresividad juvenil', 'reincidencia delictiva', 'consumo de drogas y delito'],
            'Víctimas y proceso': ['victimización y trauma', 'testimonio infantil', 'violencia intrafamiliar denunciada']
        }
    },
    _sel: { area: null, sub: null },
    montar() {
        const slot = document.getElementById('seccionExplorar');
        if (!slot || document.getElementById('arbolPsico')) return;
        const cont = document.createElement('div');
        cont.className = 'card';
        cont.id = 'arbolPsico';
        cont.innerHTML = `
          <h3 class="card-title">🌳 Árbol de áreas de investigación</h3>
          <p class="help-text" style="margin:0 0 0.7rem;">Navega de lo general a lo específico: elige un área, una subcategoría y un tema — y mándalo directo al medidor de brechas.</p>
          <div id="arbolCols" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr)); gap:0.7rem;"></div>`;
        slot.insertBefore(cont, slot.firstChild);
        // UNA delegación para todo el árbol (rendimiento y simplicidad).
        document.getElementById('arbolCols').addEventListener('click', (e) => {
            const b = e.target.closest('button[data-tipo]');
            if (!b) return;
            const { tipo, valor } = b.dataset;
            if (tipo === 'area') { this._sel = { area: valor, sub: null }; }
            else if (tipo === 'sub') { this._sel.sub = valor; }
            else if (tipo === 'tema') {
                const caja = document.getElementById('expTema');
                if (caja) { caja.value = valor; if (caja.scrollIntoView) caja.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
                const ir = document.getElementById('expBuscar');
                if (ir && typeof Explorar !== 'undefined') Explorar._onExplorar();
                return;
            }
            this._render();
        });
        this._render();
    },
    _render() {
        const cols = document.getElementById('arbolCols');
        if (!cols) return;
        const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
        const col = (titulo, items, tipo, activo) => `
          <div style="border:1px solid var(--color-border,#e3e3e3); border-radius:0.6rem; padding:0.6rem; background:#fafbfe;">
            <div style="font-weight:600; font-size:0.9em; margin:0 0 0.45rem; color:#2E5BBA;">${titulo}</div>
            <div style="display:flex; flex-direction:column; gap:0.3rem; max-height:15rem; overflow:auto;">
              ${items.map(it => `<button type="button" data-tipo="${tipo}" data-valor="${esc(it)}"
                 style="text-align:left; padding:0.35rem 0.6rem; border-radius:0.45rem; border:1px solid ${it === activo ? '#2E5BBA' : 'transparent'};
                 background:${it === activo ? '#e8eefb' : 'transparent'}; cursor:pointer; font-size:0.88em; line-height:1.25;">
                 ${tipo === 'tema' ? '🔎 ' : ''}${esc(it)}</button>`).join('')}
            </div>
          </div>`;
        let html = col('1 · Área', Object.keys(this.DATOS), 'area', this._sel.area);
        if (this._sel.area) html += col('2 · Subcategoría', Object.keys(this.DATOS[this._sel.area]), 'sub', this._sel.sub);
        if (this._sel.area && this._sel.sub) html += col('3 · Tema (clic = explorar brechas)', this.DATOS[this._sel.area][this._sel.sub], 'tema', null);
        cols.innerHTML = html;
    }
};
if (typeof window !== 'undefined') {
    window.ArbolPsicologia = ArbolPsicologia;
    const iniciar = () => { ArbolPsicologia.montar(); };
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => setTimeout(iniciar, 0));
    else setTimeout(iniciar, 0); // tras el montaje del Explorador
}
