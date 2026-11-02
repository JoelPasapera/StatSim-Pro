// analizador/index.js — entrada de la sección Analizador (Fase 3): módulos ES en src/analizador/.
// (F5) sin puentes: los módulos se importan entre sí; este índice reexporta la API de la sección.
import { montarAnalizador as montarUI } from './ui/index.js';
import { bus, EVENTOS } from '../shared/eventos.js';
import { montarValidezContenido, montarAFE, montarConcordancia, montarInvarianza } from './psicometria/index.js';
import { montarDiagnosticoForma } from './relaciones/diagnostico-forma-ui.js';
import { montarRelacionadas } from './relacionadas/relacionadas-ui.js';
import { montarParcial } from './relaciones/correlacion-parcial-ui.js';
import { montarMediacion } from './relaciones/mediacion-ui.js';
import { montarDepuracion } from './depuracion/depuracion-ui.js';
import { montarPerdidos } from './perdidos/perdidos-ui.js';
import { montarBaremos } from './psicometria/baremos-ui.js';
import { montarPotencia } from './potencia/potencia-ui.js';
import { montarROC } from './roc/roc-ui.js';
import { montarTRI } from './tri/tri-ui.js';
import { montarMultinivel } from './multinivel/multinivel-ui.js';
import { activarCopiaSintaxis } from './informe/sintaxis-copiar.js';
import * as Psicometria from './psicometria/index.js';
import { AnalizadorEstadistico } from './estadistica.js';
import { Fiabilidad } from './fiabilidad.js';
import { RegresionMultiple } from './regresion.js';
import { SEM } from './sem-motor.js';
import { SEMUI } from './sem-ui.js';
import { ComparacionGrupos } from './comparacion-grupos.js';
import { CribaCorrelaciones } from './criba-correlaciones.js';
import { CribaSociodemografica } from './criba-sociodemografica.js';
import { AnalisisDimensiones } from './analisis-dimensiones.js';
import { MatrizConsistencia } from './matriz-consistencia.js';
import { InterpretacionesEstadisticas } from './interpretaciones.js';
import { ScientificCharts, ScientificChartsBuilder } from './graficas.js';
import { AnalisisGraficos } from './analisis-graficos.js';
import { ExportadorWord } from './exportador-word.js';
import { EtiquetasVariables } from '../shared/etiquetas-variables.js';

// El Simulador avisa por el bus cuando hay una base nueva: se refrescan los desplegables que dependen de ella.
export function montarAnalizador() {
    montarUI();
    montarValidezContenido();   // (2026.10.04) tarjeta 3: validez de contenido por juicio de expertos
    montarAFE();                // (2026.10.11) tarjeta 4: análisis factorial exploratorio
    montarConcordancia();       // (2026.10.16) tarjeta 5: concordancia entre evaluadores (κ y CCI)
    montarInvarianza();         // (2026.10.19) tarjeta 6: invarianza de medición (AFC multigrupo)
    montarDiagnosticoForma();   // (2026.10.28) tarjeta 7: diagnóstico de la forma de una relación
    montarRelacionadas();       // (2027.01.17) tarjeta 8: medidas repetidas y muestras relacionadas
    montarParcial();            // (2027.01.17) tarjeta 9: correlación parcial y semiparcial
    montarMediacion();          // (2027.01.17) tarjeta 10: mediación y moderación (modelos de PROCESS)
    montarDepuracion();         // (2027.01.18) antes de analizar: la depuración de la base
    montarPerdidos();           // (2027.01.18) antes de analizar: los datos perdidos (Little, EM e imputación múltiple)
    montarBaremos();            // (2027.01.18) tarjeta 11: baremos (normas de interpretación)
    montarROC();                // (2027.01.18) tarjeta 12: validez de criterio (curva ROC)
    montarPotencia();           // (2027.01.18) tarjeta 13: potencia y tamaño de muestra
    montarTRI();                // (2027.01.19) tarjeta 14: teoría de respuesta al ítem y DIF
    montarMultinivel();         // (2027.01.19) tarjeta 15: modelos multinivel (intercepto aleatorio)
    activarCopiaSintaxis();     // (2027.01.19) los botones «Copiar» de la sintaxis equivalente en R y SPSS de las tarjetas
    bus.on(EVENTOS.BASE_GENERADA, () => { try { ComparacionGrupos.actualizarSelects(); RegresionMultiple.actualizarSelects(); } catch (e) { console.error('[Analizador] al recibir la base:', e); } });
}
export { Psicometria, AnalizadorEstadistico, Fiabilidad, RegresionMultiple, SEM, SEMUI, ComparacionGrupos, CribaCorrelaciones, CribaSociodemografica, AnalisisDimensiones, MatrizConsistencia, InterpretacionesEstadisticas, ScientificCharts, ScientificChartsBuilder, AnalisisGraficos, ExportadorWord, EtiquetasVariables };
