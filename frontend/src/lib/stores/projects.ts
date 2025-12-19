/**
 * Projects Store - MQTT Request/Response
 *
 * Comunicación via MQTT con patrón Request/Response:
 * - Requests garantizados con timeout y status codes
 * - Manejo de errores estructurado
 * - Async/await natural
 *
 * @see docs/architecture/mqtt-request-response.md
 */

import { writable, derived } from 'svelte/store';
import {
  mqttRequest,
  MqttTimeoutError,
  MqttRequestError,
  type UIResponse
} from '$lib/ui-core/mqtt-request';

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

interface ListResponse {
  projects: Project[];
  activeProjectId: string | null;
  count: number;
}

interface ProjectResponse {
  project: Project;
  created?: boolean;
  updated?: boolean;
}

interface DeleteResponse {
  deleted: boolean;
  id: string;
}

interface ActivateResponse {
  activated: boolean;
  activeProjectId: string;
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
// ACTIONS - Request/Response Pattern
// =============================================================================

/**
 * Carga la lista de proyectos
 * Usa mqttRequest para garantizar respuesta
 */
export async function loadProjects(): Promise<void> {
  projectsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<ListResponse>('project', 'list');

    projectsStore.update(s => ({
      ...s,
      projects: response.data.projects || [],
      activeProjectId: response.data.activeProjectId || null,
      count: response.data.count || 0,
      loading: false,
      error: null
    }));

    console.log('[Projects] Loaded:', response.data.count, 'projects');
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    projectsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Projects] Load failed:', errorMessage);
  }
}

/**
 * Crea un nuevo proyecto
 * Retorna el proyecto creado o throw error
 */
export async function createProject(
  name: string,
  description: string = '',
  color: string = 'blue',
  icon: string = '📁',
  workspaceType: string = 'general'
): Promise<Project> {
  projectsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<ProjectResponse>('project', 'create', {
      name,
      description,
      color,
      icon,
      workspaceType
    });

    // Recargar lista para tener estado actualizado
    await loadProjects();

    console.log('[Projects] Created:', response.data.project.name);
    return response.data.project;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    projectsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Projects] Create failed:', errorMessage);
    throw error;
  }
}

/**
 * Actualiza un proyecto existente
 * Retorna el proyecto actualizado o throw error
 */
export async function updateProject(
  id: string,
  updates: {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
    workspaceType?: string;
  }
): Promise<Project> {
  projectsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<ProjectResponse>('project', 'update', {
      id,
      ...updates
    });

    // Recargar lista para tener estado actualizado
    await loadProjects();

    console.log('[Projects] Updated:', id);
    return response.data.project;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    projectsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Projects] Update failed:', errorMessage);
    throw error;
  }
}

/**
 * Elimina un proyecto
 */
export async function deleteProject(id: string): Promise<void> {
  projectsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest<DeleteResponse>('project', 'delete', { id });

    // Recargar lista para tener estado actualizado
    await loadProjects();

    console.log('[Projects] Deleted:', id);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    projectsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Projects] Delete failed:', errorMessage);
    throw error;
  }
}

/**
 * Activa un proyecto
 */
export async function activateProject(id: string): Promise<void> {
  projectsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest<ActivateResponse>('project', 'activate', { id });

    // Actualizar estado local
    projectsStore.update(s => ({
      ...s,
      activeProjectId: id,
      loading: false,
      error: null
    }));

    console.log('[Projects] Activated:', id);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    projectsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Projects] Activate failed:', errorMessage);
    throw error;
  }
}

/**
 * Obtiene un proyecto por ID
 */
export async function getProject(id: string): Promise<Project> {
  try {
    const response = await mqttRequest<{ project: Project }>('project', 'get', { id });
    return response.data.project;
  } catch (error) {
    console.error('[Projects] Get failed:', getErrorMessage(error));
    throw error;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof MqttTimeoutError) {
    return 'Request timeout - server did not respond';
  }
  if (error instanceof MqttRequestError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Inicializa el store de proyectos
 * Carga la lista inicial
 */
export function initProjects(): () => void {
  // Cargar proyectos al inicializar
  loadProjects();

  // Retornar cleanup (no-op por ahora)
  return () => {};
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

// =============================================================================
// BACKWARD COMPATIBILITY
// =============================================================================

/**
 * @deprecated Use loadProjects() instead
 */
export const requestProjectsState = loadProjects;

/**
 * @deprecated Use initProjects() instead
 */
export const initProjectsSubscriptions = initProjects;
