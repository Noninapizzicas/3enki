/**
 * Projects Store - MQTT Event-Driven
 *
 * Comunicación 100% via MQTT:
 * - Solicita estado: publish('project/state/request')
 * - Recibe estado: subscribe('project/state')
 * - Acciones: publish('project/create|update|delete|activate')
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
  // Recibir estado completo
  unsubscribeState = mqttSubscribe('project/state', (_topic, payload) => {
    const data = payload as {
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
 */
export function requestProjectsState(): void {
  projectsStore.update(s => ({ ...s, loading: true }));
  publish('project/state/request', {});
}

/**
 * Crea un nuevo proyecto
 */
export function createProject(
  name: string,
  description: string = '',
  color: string = 'blue',
  icon: string = '📁',
  workspaceType: string = 'general'
): void {
  publish('project/create', {
    name,
    description,
    color,
    icon,
    workspaceType
  });
}

/**
 * Actualiza un proyecto existente
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
  publish('project/update', {
    id,
    ...updates
  });
}

/**
 * Elimina un proyecto
 */
export function deleteProject(id: string): void {
  publish('project/delete', { id });
}

/**
 * Activa un proyecto
 */
export function activateProject(id: string): void {
  publish('project/activate', { id });
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
