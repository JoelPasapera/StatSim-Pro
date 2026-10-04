// redactor/redactor/index.js — RedactorTeorico: entrada: propiedades y estado del objeto, composición de sus módulos y montaje.
// Origen: redactor/redactor.js (Fase 6: partición por responsabilidad, sin cambios de comportamiento).

import { metodosRedactorTeoricoExportacion } from './exportacion.js';
import { metodosRedactorTeoricoFuentes } from './fuentes.js';
import { metodosRedactorTeoricoInterfaz } from './interfaz.js';
import { metodosRedactorTeoricoPlan } from './plan.js';
import { metodosRedactorTeoricoRedaccion } from './redaccion.js';
import { metodosRedactorTeoricoCalidad } from './calidad.js';
import { metodosRedactorTeoricoCosido } from './cosido.js';
import { EVENTOS, bus } from '../../shared/eventos.js';

const RedactorTeorico = {
    _VERSION: 'F7-coherencia',

    _textos: {}, // secciones redactadas: { clave: { titulo, texto, fuentesUsadas } },

    // ============================================================
    // IMPORTAR una matriz exportada (Excel .xlsx · CSV ; · CSV ,)
    // ============================================================
    _fuentesImportadas: null,

    _nombreImportado: '',

    // Reconstruye la cita corta APA a partir de la lista de autores reales.
    // ============ F2.6: SANEADOR DE AUTORES Y CITAS (fixtures reales) ============
    // Palabras y frases de REVISTA que jamás son un autor (lista viva: casos reales del jurado).
    _PALABRAS_REVISTA: /^(research|intelligence|frontiers?|journal(s)?|revista(s)?|review(s)?|ciencias?|sciences?|magazine|mag|kosmos|psiquemag|editorial|proceedings|press|universidad|university|latam|redacción|redaccion|autor(es)?|author(s)?|anonymous|anónimo|anonimo|admin|online|education|educación|educacion|psychology|psicología|psicologia|neurociencias?|neuropsicolog[a-záéíóúüñ]*|psicopedagog[a-záéíóúüñ]*|pedagog[a-záéíóúüñ]*|sociolog[a-záéíóúüñ]*|antropolog[a-záéíóúüñ]*|medicina|enfermer[a-záéíóúüñ]*|salud|tecnolog[a-záéíóúüñ]*|innovaci[a-záéíóúüñ]*|investigaci[a-záéíóúüñ]*|docencia|educativ[a-záéíóúüñ]*|académic[a-záéíóúüñ]*|academic[a-záéíóúüñ]*|universitari[a-záéíóúüñ]*|científic[a-záéíóúüñ]*|cientific[a-záéíóúüñ]*|multidisciplinar[a-záéíóúüñ]*|interdisciplinar[a-záéíóúüñ]*|iberoamerican[a-záéíóúüñ]*|latinoamerican[a-záéíóúüñ]*|horizontes?|scielo|redalyc|dialnet|scopus|elsevier|springer|wiley|mdpi|heliyon|plos)$/i,

    _FRASES_REVISTA: /^(ciencia latina|frontiers in\b.*|revista\b.*|journal of\b.*|international journal\b.*|res non verba.*)$/i,

    // Nombres de pila frecuentes (es/en): si encabezan un token multi-palabra sin coma, se descartan
    // para citar por el APELLIDO (el jurado no perdona un «(Oscar Magna et al., 2025)»).
    _NOMBRES_PILA: /^(oscar|óscar|maría|maria|josé|jose|juan|luis|carlos|ana|pedro|jorge|miguel|david|daniel|laura|paola|diego|pablo|sergio|andrés|andres|felipe|ricardo|roberto|fernando|francisco|javier|antonio|manuel|alejandro|cristian|christian|gabriel|gabriela|camila|valeria|sofía|sofia|lucía|lucia|elena|marta|rosa|carmen|julia|sara|john|michael|james|robert|william|mary|jennifer|linda|richard|thomas|charles|susan|jessica|karen|kevin|brian|mark|paul|steven|george|edward|peter|ryan)$/i,

    _PARTICULAS_AP: /^(de|del|der|den|da|das|dos|di|du|la|las|los|le|van|von|ter|ten|mac|mc|san|santa)$/i,

    // ExcelJS BAJO DEMANDA: el index.html la carga, pero si ese <script> falló
    // (CDN caído, bloqueador de anuncios, red inestable) la librería queda
    // muerta toda la sesión. Aquí el redactor se cura solo: la inyecta él
    // mismo, con CDN de respaldo, en vez de rendirse con "recarga la página".
    _EXCELJS_URLS: [
        'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
        'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'
    ],

    _cargaExcelJS: null,

    // ============================================================
    // DOCUMENTO COMPLETO: plan, orquestación y Word APA
    // ============================================================
    _documento: null, // { secciones: [{titulo, texto}], fuentes, citadas },

    // Enfriamiento entre lotes del mismo canal. Con Gemini el cuello suele ser
    // el límite de peticiones/minuto del tier gratuito (no los tokens): 15 s por
    // canal es prudente. Si vieras errores de cuota (429), súbelo; el failover
    // del Worker entre claves también amortigua los picos. (0 en tests.)
    // Respiro entre llamadas del MISMO canal. Antes 15000: herencia de cuando los
    // canales compartían claves a ciegas. Hoy keyHint da canal↔clave 1:1 en el
    // Worker, así que una clave recibe ~1.5 llamadas/min (≪ 10 RPM del free tier):
    // basta un margen corto anti-ráfaga para respuestas que vuelven en 1-2 s.
    _ENFRIAMIENTO_MS: 4000,

    // Tope de secciones simultáneas (independiente del nº de claves): evita
    // que muchas llamadas pesadas golpeen Gemini a la vez. 4 = rápido sin ahogar.
    // Techo de canales paralelos. El real es min(claves, tareas, este techo):
    // con 10 claves → 10 en vuelo (17 partes ≈ 2 tandas ≈ 70-90 s en vez de 3 min).
    // 24 acompaña el plan de crecer a 30-40 claves (RL_IP del Worker: 120/min);
    // ojo: el paralelismo REAL lo acota el nº de PARTES (con 239 fuentes ≈ 17).
    _MAX_CANALES_REDACCION: 24,

    _STAGGER_MS: 300, // escalonado de arranque entre canales (no golpear el Worker en el mismo ms),

    // ============ F2.4: AUTOGUARDADO · un cierre de pestaña no quema 6.000 palabras ============
    _CLAVE_GUARDADO: 'statsim_redactor_ultimo',

    // La mina del jurado: una sección adopta Bar-On para el instrumento y otra
    // adopta Salovey-Mayer para EL MISMO. Se detecta y se grita en el panel;
    // la reescritura coherente es trabajo de la F3.
    _FAMILIAS_RE: /(Bar-?On|Salovey y Mayer|Mayer y Salovey|Goleman|Boyatzis|Wechsler|Cattell|CHC|Gardner|Sternberg)/gi,
};

// Composición explícita: cada módulo aporta una responsabilidad.
Object.assign(RedactorTeorico, metodosRedactorTeoricoInterfaz, metodosRedactorTeoricoFuentes, metodosRedactorTeoricoPlan, metodosRedactorTeoricoRedaccion, metodosRedactorTeoricoExportacion, metodosRedactorTeoricoCalidad, metodosRedactorTeoricoCosido);

bus.on(EVENTOS.FUENTES_CAMBIADAS, () => { if (typeof RedactorTeorico.actualizarInfoFuentes === 'function') RedactorTeorico.actualizarInfoFuentes(); });
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => RedactorTeorico.montar());
    } else {
        queueMicrotask(() => RedactorTeorico.montar());   // (F5) tras evaluar todo el grafo de módulos (hay ciclos)
    }
}

export { RedactorTeorico };
