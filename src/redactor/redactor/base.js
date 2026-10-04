// redactor/redactor/base.js — RedactorTeorico: helpers compartidos por los módulos de RedactorTeorico.
// Origen: redactor/redactor.js (Fase 6: partición por responsabilidad, sin cambios de comportamiento).

import { CLAVES, estado } from '../../shared/estado.js';

// redactor/redactor.js — Redactor del marco teórico.
// Origen: redactor-teorico.js (Fase 4), sin cambios de comportamiento; dependencias explícitas.


// Fuentes del Buscador: servicio publicado en el estado compartido (el Redactor no importa al Buscador)
const fuentesBuscador = () => estado.get(CLAVES.FUENTES_BUSCADOR) || null;

// ========================================
// REDACTOR DEL MARCO TEÓRICO (borrador asistido por IA) — Sesión A.
// La IA redacta un borrador sustentado ÚNICAMENTE en las fuentes de la matriz
// de revisión (respetando el filtro de relevancia). Anti-alucinación: solo puede
// citar las fuentes reales, con citas cortas ya construidas por la app, y las
// citas textuales solo pueden salir de los resúmenes.
//
// REDACCIÓN: vía Worker de GEMINI (proveedor dedicado del redactor), con el
// contrato de SÍNTESIS CIENTÍFICA (por ejes temáticos, no autor por autor).
//
// IMPORTANTE (honestidad académica): el resultado es un BORRADOR de trabajo.
// El investigador debe verificar cada cita contra la fuente original, corregir
// y reescribir con su propia voz antes de usarlo en la tesis.
// ========================================

export { fuentesBuscador };
