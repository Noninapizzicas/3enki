/**
 * Viabilidad Store - MQTT Request/Response
 *
 * Estudio de viabilidad de negocio.
 */

import { writable, derived } from 'svelte/store';
import {
  mqttRequest,
  MqttTimeoutError,
  MqttRequestError
} from '$lib/ui-core/mqtt-request';

// =============================================================================
// TYPES
// =============================================================================

export interface Escenario {
  nombre: string;
  parametros: {
    gastos_fijos_mensuales: number;
    comensales_dia: number;
    ticket_medio: number;
    food_cost_porcentaje: number;
    dias_operacion_mes: number;
  };
  ingresos: { dia: number; mes: number; anual: number };
  gastos: { fijos_mes: number; materia_prima_mes: number; total_mes: number };
  beneficio: { dia: number; mes: number; anual: number; es_rentable: boolean };
  punto_equilibrio: {
    comensales_dia: number;
    comensales_mes: number;
    margen_sobre_equilibrio: number;
    porcentaje_ocupacion_necesaria: number;
  };
}

export interface Estudio {
  negocio: { nombre: string; tipo: string };
  fecha: string;
  recetas_analizadas: number;
  food_cost_medio: number;
  ticket_medio: number;
  escenarios: {
    principal: Escenario;
    conservador: Escenario;
    optimista: Escenario;
  };
  recetas: any[] | null;
  conclusiones: string[];
}

export interface ProyeccionMes {
  mes: number;
  comensales_dia: number;
  ingresos: number;
  gastos_totales: number;
  beneficio: number;
  acumulado: number;
  rentable: boolean;
}

export interface Proyeccion {
  parametros: any;
  proyeccion: ProyeccionMes[];
  resumen: {
    beneficio_total_periodo: number;
    beneficio_medio_mensual: number;
    primer_mes_rentable: number | null;
    mes_recuperacion_inversion: number | null;
    acumulado_final: number;
    roi?: number;
    roi_mensaje?: string;
  };
}

export interface NegocioConfig {
  nombre_negocio?: string;
  tipo_negocio?: string;
  gastos_fijos_mensuales?: number;
  dias_operacion_mes?: number;
  comensales_dia_estimados?: number;
  ticket_medio?: number;
  food_cost_objetivo?: number;
  inversion_inicial?: number;
  notas?: string;
}

export interface ViabilidadState {
  estudio: Estudio | null;
  proyeccion: Proyeccion | null;
  config: NegocioConfig;
  loading: boolean;
  error: string | null;
  activeView: 'estudio' | 'proyeccion' | 'config';
}

// =============================================================================
// STORE
// =============================================================================

const initialState: ViabilidadState = {
  estudio: null,
  proyeccion: null,
  config: {},
  loading: false,
  error: null,
  activeView: 'estudio'
};

export const viabilidadStore = writable<ViabilidadState>(initialState);

// =============================================================================
// ACTIONS
// =============================================================================

export async function loadEstudio(params: Record<string, any>): Promise<void> {
  viabilidadStore.update(s => ({ ...s, loading: true, error: null }));
  try {
    const response = await mqttRequest<Estudio>('viabilidad', 'estudio', params, { timeout: 15000 });
    viabilidadStore.update(s => ({
      ...s,
      estudio: response.data,
      loading: false,
      activeView: 'estudio'
    }));
  } catch (error) {
    viabilidadStore.update(s => ({ ...s, loading: false, error: getErrorMessage(error) }));
  }
}

export async function loadConfig(): Promise<void> {
  try {
    const response = await mqttRequest<NegocioConfig>('viabilidad', 'config', { action: 'get' });
    viabilidadStore.update(s => ({ ...s, config: response.data || {} }));
  } catch (error) {
    console.error('[Viabilidad] Config load failed:', getErrorMessage(error));
  }
}

export function setActiveView(view: ViabilidadState['activeView']): void {
  viabilidadStore.update(s => ({ ...s, activeView: view }));
}

export function clearError(): void {
  viabilidadStore.update(s => ({ ...s, error: null }));
}

// =============================================================================
// SUBSCRIPTIONS
// =============================================================================

export function initViabilidadSubscriptions(): () => void {
  loadConfig();
  return () => {};
}

// =============================================================================
// HELPERS
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof MqttTimeoutError) return 'Timeout - el servidor no respondió';
  if (error instanceof MqttRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Error desconocido';
}

// =============================================================================
// DERIVED
// =============================================================================

export const viabilidadEstudio = derived(viabilidadStore, $s => $s.estudio);
export const viabilidadProyeccion = derived(viabilidadStore, $s => $s.proyeccion);
export const viabilidadConfig = derived(viabilidadStore, $s => $s.config);
export const viabilidadLoading = derived(viabilidadStore, $s => $s.loading);
export const viabilidadError = derived(viabilidadStore, $s => $s.error);
