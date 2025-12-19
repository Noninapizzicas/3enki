/**
 * Projects Store - MQTT Event-Driven
 *
 * Comunicación 100% via MQTT con topics transformados por EventBus:
 * - Solicita estado: publish('core/*/events/project/state/request')
 * - Recibe estado: subscribe('core/*/events/project/state')
 * - Acciones: publish('core/*/events/project/create|update|delete|activate')
 *
 * Los topics usan el patrón 'core/*/events/{domain}/{action}' que el
 * EventBus del backend entiende y transforma correctamente.
 *
 * NO usa endpoints REST para datos UI.
 */

import { writable, derived } from 'svelte/store';
import { subscribe as mqttSubscribe, publish } from '$lib/ui-core/mqtt';

// =============================================================================
// TYPES
// =============================================================================

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  workspaceType: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectsState {
  projects: Project[];
  activeProjectId: string | null;
  count: number;
  loading: boolean;
  error: string | null;
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: ProjectsState = {
  projects: [],
  activeProjectId: null,
  count: 0,
  loading: false,
  error: null
};

// =============================================================================
// STORE
// =============================================================================

export const projectsStore = writable<ProjectsState>(initialState);

// =============================================================================
// MQTT SUBSCRIPTIONS
// =============================================================================

let unsubscribeState: (() => void) | null = null;

/**
 * Inicializa suscripciones MQTT para proyectos
 * Llamar una vez al montar el componente principal
 *
 * NOTA: No necesita esperar conexión MQTT porque mqtt.ts
 * encola mensajes automáticamente y los envía al conectar.
 */
export function initProjectsSubscriptions(): () => void {
  // Recibir estado completo via topic transformado por EventBus
  // Backend publica a: core/*/events/project/state
  unsubscribeState = mqttSubscribe('core/*/events/project/state', (_topic, payload) => {
    // EventBus envía un envelope, los datos están en payload.data
    const envelope = payload as { data?: unknown } | null;
    const data = (envelope?.data || payload) as {
      projects: Project[];
      activeProjectId: string | null;
      count: number;
    };

    console.log('[Projects] State received:', data.count || 0, 'projects');

    projectsStore.update(s => ({
      ...s,
      projects: data.projects || [],
      activeProjectId: data.activeProjectId || null,
      count: data.count || 0,
      loading: false,
      error: null
    }));
  });

  // Solicitar estado inicial
  // (si MQTT no está conectado, el mensaje se encola automáticamente)
  requestProjectsState();

  // Retornar cleanup
  return () => {
    unsubscribeState?.();
  };
}

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Solicita el estado actual via MQTT
 * Publica a: core/*/events/project/state/request
 */
export function requestProjectsState(): void {
  projectsStore.update(s => ({ ...s, loading: true }));
  publish('core/*/events/project/state/request', {});
}

/**
 * Crea un nuevo proyecto
 * Publica a: core/*/events/project/create
 */
export function createProject(
  name: string,
  description: string = '',
  color: string = 'blue',
  icon: string = '📁',
  workspaceType: string = 'general'
): void {
  publish('core/*/events/project/create', {
    name,
    description,
    color,
    icon,
    workspaceType
  });
}

/**
 * Actualiza un proyecto existente
 * Publica a: core/*/events/project/update
 */
export function updateProject(
  id: string,
  updates: {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
    workspaceType?: string;
  }
): void {
  publish('core/*/events/project/update', {
    id,
    ...updates
  });
}

/**
 * Elimina un proyecto
 * Publica a: core/*/events/project/delete
 */
export function deleteProject(id: string): void {
  publish('core/*/events/project/delete', { id });
}

/**
 * Activa un proyecto
 * Publica a: core/*/events/project/activate
 */
export function activateProject(id: string): void {
  publish('core/*/events/project/activate', { id });
}

// =============================================================================
// DERIVED STORES
// =============================================================================

/** Lista de proyectos */
export const projectsList = derived(projectsStore, $s => $s.projects);

/** ID del proyecto activo */
export const activeProjectId = derived(projectsStore, $s => $s.activeProjectId);

/** Proyecto activo */
export const activeProjectData = derived(projectsStore, $s =>
  $s.projects.find(p => p.id === $s.activeProjectId) || null
);

/** Estado de carga */
export const projectsLoading = derived(projectsStore, $s => $s.loading);

/** Error actual */
export const projectsError = derived(projectsStore, $s => $s.error);

/** Total de proyectos */
export const projectsCount = derived(projectsStore, $s => $s.count);

/** Tiene proyectos */
export const hasProjects = derived(projectsStore, $s => $s.projects.length > 0);
