/**
 * Workspace Store - Contexto de trabajo
 *
 * Gestiona:
 * - Proyecto activo
 * - Provider/modelo activo
 * - Prompt activo
 * - Estado de credenciales
 * - Workspace derivado del proyecto
 */

import { writable, derived, get } from 'svelte/store';
import { publish, subscribe } from '$lib/ui-core';
import type { Project, Provider, Prompt, CredentialStatus, WorkspacesMap } from '$lib/ui-core';

// ============================================================================
// WORKSPACES CONFIGURACIÓN
// ============================================================================

export const WORKSPACES: WorkspacesMap = {
  'pos-pizzeria': {
    modules: ['menu-generator', 'productos', 'ventas', 'stats'],
    icon: '🍕'
  },
  'desarrollo': {
    modules: ['build', 'test', 'deploy', 'git'],
    icon: '💻'
  },
  'general': {
    modules: ['notas', 'tareas'],
    icon: '📋'
  }
};

// ============================================================================
// STORES
// ============================================================================

export const activeProject = writable<Project | null>(null);
export const activeProvider = writable<Provider | null>(null);
export const activeModel = writable<string | null>(null);
export const activePrompt = writable<Prompt | null>(null);
export const credentialStatus = writable<CredentialStatus>({
  valid: false,
  providers: []
});

// ============================================================================
// STORES DERIVADOS
// ============================================================================

/**
 * Workspace activo (derivado del proyecto)
 */
export const activeWorkspace = derived(activeProject, ($project) => {
  return $project?.workspaceType || 'general';
});

/**
 * Configuración del workspace activo
 */
export const workspaceConfig = derived(activeWorkspace, ($workspace) => {
  return WORKSPACES[$workspace] || WORKSPACES['general'];
});

/**
 * ¿Tiene proyecto activo?
 */
export const hasProject = derived(activeProject, ($project) => $project !== null);

/**
 * ¿Tiene provider configurado?
 */
export const hasProvider = derived(activeProvider, ($provider) => $provider !== null);

/**
 * ¿Credenciales válidas?
 */
export const hasValidCredentials = derived(credentialStatus, ($status) => $status.valid);

// ============================================================================
// ACCIONES
// ============================================================================

/**
 * Seleccionar proyecto
 */
export function selectProject(project: Project): void {
  activeProject.set(project);
  publish('project/activate', { projectId: project.id });
}

/**
 * Limpiar proyecto activo
 */
export function clearProject(): void {
  activeProject.set(null);
}

/**
 * Seleccionar provider y modelo
 */
export function selectProvider(provider: Provider, model: string): void {
  activeProvider.set(provider);
  activeModel.set(model);
  publish('provider/selected', {
    providerId: provider.id,
    modelId: model
  });
}

/**
 * Limpiar provider
 */
export function clearProvider(): void {
  activeProvider.set(null);
  activeModel.set(null);
}

/**
 * Seleccionar prompt
 */
export function selectPrompt(prompt: Prompt): void {
  activePrompt.set(prompt);
  publish('prompt/selected', { promptId: prompt.id });
}

/**
 * Limpiar prompt
 */
export function clearPrompt(): void {
  activePrompt.set(null);
}

// ============================================================================
// SUSCRIPCIONES MQTT
// ============================================================================

/**
 * Inicializar suscripciones MQTT
 * Llamar al montar la app
 */
export function initWorkspaceSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  // Proyecto activado
  unsubs.push(subscribe('project/activated', (_, payload) => {
    const data = payload as { project: Project };
    activeProject.set(data.project);
  }));

  // Estado del provider
  unsubs.push(subscribe('provider/state', (_, payload) => {
    const data = payload as { provider: Provider; model: string };
    activeProvider.set(data.provider);
    activeModel.set(data.model);
  }));

  // Credenciales resueltas
  unsubs.push(subscribe('credential/resolved', (_, payload) => {
    const data = payload as CredentialStatus;
    credentialStatus.set(data);
  }));

  // Retornar cleanup
  return () => {
    unsubs.forEach(fn => fn());
  };
}

// ============================================================================
// GETTERS
// ============================================================================

export function getActiveProject(): Project | null {
  return get(activeProject);
}

export function getActiveProvider(): Provider | null {
  return get(activeProvider);
}

export function getActiveModel(): string | null {
  return get(activeModel);
}
