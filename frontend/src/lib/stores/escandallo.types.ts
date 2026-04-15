/**
 * TIPOS TYPESCRIPT - ESCANDALLO v2
 *
 * Tipos compartidos para cálculo de costes simples
 */

// ==========================================
// ESCANDALLO (cálculo)
// ==========================================

export interface Escandallo {
  id: string;
  receta_id: string;
  proyecto_id: string;

  coste_total: number; // € totales
  coste_porcion: number; // € por porción

  precio_mercado_snapshot?: Record<string, number | null>; // {nombre: precio_kg}
  precio_snapshot_fecha?: number; // timestamp

  notas?: string; // "Falta precio: azúcar, sal"

  calculado_at: number; // timestamp
  created_at: number;
  updated_at: number;

  alertas_sin_leer?: number; // count
  max_cambio_porcentaje?: number; // mayor cambio detectado
}

export interface EscandalloCalculation {
  coste_total: number;
  coste_porcion: number;
  notas: string | null;
  snapshot: string; // JSON stringified
  snapshot_fecha: number;
}

// ==========================================
// ALERTA
// ==========================================

export interface EscandalloAlert {
  id: string;
  escandallo_id: string;
  proyecto_id: string;

  tipo_alerta: 'precio_subio' | 'precio_bajo' | 'falta_precio';
  ingrediente_nombre: string;

  precio_anterior?: number;
  precio_nuevo?: number;
  porcentaje_cambio?: number; // 15.5 = +15.5%

  detectada_at: number;
  leida: boolean;
  leida_at?: number;

  created_at: number;
}

// ==========================================
// BÚSQUEDA
// ==========================================

export interface CriterioEscandallo {
  proyecto_id: string;

  coste_min?: number; // rango en €
  coste_max?: number;

  sin_precio?: boolean; // ingredientes sin precio mercado
  con_alerta?: boolean; // tiene alertas sin leer
  esta_semana?: boolean; // calculado en últimos 7 días

  limit?: number;
}

export interface ResultadoEscandallo {
  escandallos: Escandallo[];
  total: number;
  limit?: number;
}

// ==========================================
// STORE STATE
// ==========================================

export interface EscandalloState {
  proyecto_id: string | null;
  escandallos: Map<string, Escandallo>; // receta_id -> escandallo
  alertas: EscandalloAlert[];
  loading: boolean;
  error: string | null;
}

// ==========================================
// API PAYLOAD
// ==========================================

export interface CalcularEscandalloRequest {
  proyecto_id: string;
  receta_id: string;
  precios_mercado: Record<string, number>; // {nombre_ingrediente: precio_kg}
}

export interface CalcularEscandalloResponse {
  success: boolean;
  escandallo_id: string;
  coste_total: number;
  coste_porcion: number;
  notas?: string;
  timestamp: number;
}
