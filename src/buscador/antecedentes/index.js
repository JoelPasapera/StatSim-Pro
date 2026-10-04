// buscador/antecedentes/index.js — Antecedentes: entrada: propiedades y estado del objeto, composición de sus módulos y montaje.
// Origen: buscador/antecedentes.js (Fase 6: partición por responsabilidad, sin cambios de comportamiento).

import { asegurarExcelJS } from './base.js';
import { metodosAntecedentesConsultas } from './consultas.js';
import { metodosAntecedentesExportacion } from './exportacion.js';
import { metodosAntecedentesFuentesAbiertas } from './fuentesAbiertas.js';
import { metodosAntecedentesInterfaz } from './interfaz.js';
import { metodosAntecedentesBusqueda } from './busqueda.js';
import { metodosAntecedentesResultados } from './resultados.js';
import { metodosAntecedentesMetadatos } from './metadatos.js';
import { metodosAntecedentesSeleccion } from './seleccion.js';

const Antecedentes = {

    CONFIG: {
        POR_FUENTE: 25,
        UNPAYWALL_EMAIL: 'statsim.research@gmail.com', // Unpaywall rechaza dominios inexistentes/de prueba (422)
        MAILTO: '',
        SINONIMOS: {
            'inteligencia cognitiva': ['cognitive ability', 'intelligence', 'capacidad cognitiva', 'habilidades cognitivas'],
            'inteligencia emocional': ['emotional intelligence', 'competencias emocionales'],
            'autoestima': ['self-esteem'], 'ansiedad': ['anxiety'], 'depresion': ['depression'],
            'estres academico': ['academic stress'], 'rendimiento academico': ['academic performance', 'academic achievement'],
            'memoria de trabajo': ['working memory'], 'funciones ejecutivas': ['executive functions'],
            'bienestar psicologico': ['psychological well-being'], 'motivacion': ['motivation'],
            'agresividad': ['aggression'], 'habilidades sociales': ['social skills'],
            'adiccion a redes sociales': ['social media addiction', 'problematic internet use']
        }
    },


    _seleccion: new Map(),

    _obras: [],


    // ---------- traducción (MyMemory: gratis, con CORS, sin API key) ----------

    // Traduce 'texto' de 'desde' a 'hacia'. Devuelve el texto traducido, o el
    // original si la API falla (degradación elegante: nunca rompe la búsqueda).
    // ---- Idiomas de búsqueda (chips) + presupuesto de consultas ----
    _IDIOMAS: [
        ['es', 'español'], ['en', 'inglés'], ['pt', 'portugués'],
        ['fr', 'francés'], ['de', 'alemán'], ['zh-CN', 'chino']
    ],

    // Máximo de BÚSQUEDAS de la intensiva (variantes × idiomas) — no de
    // artículos: protege de esperas largas y de los rate-limits de las
    // fuentes. Configurable en la interfaz (10-200).
    _PRESUPUESTO_CONSULTAS: 60,

    // Traducción con caché de sesión: la misma frase al mismo idioma no se
    // retraduce (ahorra red y respeta el límite diario de MyMemory).
    _cacheTraducciones: {},


    // ------------------------------------------------------------------
    // DIRECTO PRIMERO, PROXY DE RESCATE: los endpoints de la OMS (IRIS) y la
    // ONU (Biblioteca Digital) son oficiales y públicos, pero eso no implica
    // que sus servidores envíen cabeceras CORS: sin ellas, el NAVEGADOR bloquea
    // la lectura aunque el endpoint responda bien. Estrategia óptima:
    //   1) intentar la petición directa (si hay CORS: rápida y sin límites);
    //   2) si el navegador la bloquea, rescatar vía ProxiesCORS.carrera
    //      (paralela, con salud y cuarentena — el módulo del proyecto);
    //   3) cachear por URL en la sesión: la búsqueda intensiva repite
    //      consultas entre variantes y así no gastamos peticiones de más.
    // ------------------------------------------------------------------
    _cacheJSON: new Map(),


    // ------------------------------------------------------------------
    // PROTOCOLO DE BÚSQUEDA (ficha técnica de la revisión · Mejora 1).
    // Envuelve cada tarea de fuente: registra la ecuación literal despachada
    // y, al resolver, anota el nº de resultados. Si la fuente FALLÓ, el
    // conteo queda vacío («—») y el total se marca como mínimo: un fallo
    // no es un cero. Inofensivo si protocolo-busqueda.js no está cargado.
    _protocoloNota: '',


    // ---- Excel (.xlsx) con formato: Times New Roman 12, ajuste de texto,
    // alineación (vertical centro, horizontal izquierda) y anchos fijos por
    // columna (px medidos por el usuario, convertidos a unidades de Excel).
    // Construcción separada de la descarga para poder verificarla en tests.
    _ANCHOS_PX_MATRIZ: {
        'Relevancia': 124, 'Título': 165, 'Autor': 95, 'Año': 50, 'Contexto (País)': 100,
        'Objetivos': 334, 'Muestra': 96, 'Instrumentos': 130, 'Resultados': 920,
        'Conclusiones': 140, 'Revista': 110, 'Cuartil': 80, 'Indexación': 112,
        'Referencia (APA)': 450, 'Link/DOI': 120
    },
};

// Composición explícita: cada módulo aporta una responsabilidad.
Object.assign(Antecedentes, metodosAntecedentesConsultas, metodosAntecedentesFuentesAbiertas, metodosAntecedentesMetadatos, metodosAntecedentesInterfaz, metodosAntecedentesSeleccion, metodosAntecedentesExportacion, metodosAntecedentesBusqueda, metodosAntecedentesResultados);

if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => Antecedentes.montar());
    } else {
        queueMicrotask(() => Antecedentes.montar());   // (F5) tras evaluar todo el grafo de módulos (hay ciclos)
    }
}

export { Antecedentes, asegurarExcelJS };
