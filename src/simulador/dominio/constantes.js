// simulador/dominio/constantes.js — constantes del generador (presets de estilos, desajuste y heterogeneidad).

export const TAMANO_MUESTRAL_MAXIMO = 100000;

export const SIGMA_FORMA_ASIMETRICA = 0.6;

export const ESTILOS_RESPUESTA = {
    leve:     { aquiescencia: 0.6, extrema: 0.30 },
    moderada: { aquiescencia: 1.0, extrema: 0.50 },
    alta:     { aquiescencia: 1.5, extrema: 0.75 }
};

export const NIVELES_DESAJUSTE = {
    ninguno:  { proporcion: 0,    rho: 0 },
    leve:     { proporcion: 0.30, rho: 0.20 },
    moderado: { proporcion: 0.50, rho: 0.35 },
    alto:     { proporcion: 0.80, rho: 0.50 }
};

export const PERFILES_HETEROGENEIDAD = {
    ninguna:  { medias: 0,   cargas: 0,   cruzadas: 0,    proporcionCruzadas: 0 },
    leve:     { medias: 0.3, cargas: 0.3, cruzadas: 0.15, proporcionCruzadas: 0.20 },
    moderada: { medias: 0.5, cargas: 0.5, cruzadas: 0.25, proporcionCruzadas: 0.25 },
    alta:     { medias: 0.7, cargas: 0.7, cruzadas: 0.35, proporcionCruzadas: 0.34 }
};
