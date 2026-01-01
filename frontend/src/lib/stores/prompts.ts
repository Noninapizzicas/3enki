/**
 * Prompts Store - MQTT Request/Response
 *
 * Comunicación via MQTT con patrón Request/Response:
 * - Prompts CRUD
 * - Presets management
 * - Composer state
 * - Analytics
 *
 * @see contexto/ui-generator.json
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

export interface PromptVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  required?: boolean;
  default?: unknown;
}

export interface Prompt {
  id: string;
  name: string;
  title: string;
  description: string;
  content: string;
  slot_type: SlotType;
  slot_icon: string;
  variables: PromptVariable[];
  tags: string[];
  level: 'GLOBAL' | 'PROJECT';
  level_icon: string;
  current_version: string;
  created_at: string;
  updated_at: string;
}

export type SlotType = 'system' | 'context' | 'prefix' | 'suffix' | 'format';

export interface SlotTypeInfo {
  id: SlotType;
  name: string;
  icon: string;
  count: number;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  slots?: Record<SlotType, string[]>;
  created_at: string;
  updated_at: string;
}

export interface ComposerSlot {
  id: string;
  name: string;
  title: string;
  content: string;
  variables: PromptVariable[];
}

export interface ComposerState {
  system: ComposerSlot[];
  context: ComposerSlot[];
  prefix: ComposerSlot[];
  suffix: ComposerSlot[];
  format: ComposerSlot[];
}

export interface PromptsStoreState {
  // Data
  prompts: Prompt[];
  promptsBySlot: Record<SlotType, Prompt[]>;
  slotTypes: SlotTypeInfo[];
  presets: Preset[];

  // Composer
  composer: ComposerState;
  composerVariables: Record<string, string>;

  // UI State
  selectedPromptId: string | null;
  selectedPresetId: string | null;
  activeTab: 'composer' | 'library' | 'editor' | 'presets' | 'analytics';

  // Stats
  stats: {
    total: number;
    by_slot: Record<SlotType, number>;
  };

  // Loading/Error
  loading: boolean;
  error: string | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const SLOT_TYPES: SlotType[] = ['system', 'context', 'prefix', 'suffix', 'format'];

export const SLOT_ICONS: Record<SlotType, string> = {
  system: '🧠',
  context: '📋',
  prefix: '⬆️',
  suffix: '⬇️',
  format: '📄'
};

export const SLOT_NAMES: Record<SlotType, string> = {
  system: 'System',
  context: 'Context',
  prefix: 'Prefix',
  suffix: 'Suffix',
  format: 'Format'
};

// =============================================================================
// INITIAL STATE
// =============================================================================

const emptyComposer: ComposerState = {
  system: [],
  context: [],
  prefix: [],
  suffix: [],
  format: []
};

const initialState: PromptsStoreState = {
  prompts: [],
  promptsBySlot: {
    system: [],
    context: [],
    prefix: [],
    suffix: [],
    format: []
  },
  slotTypes: SLOT_TYPES.map(id => ({
    id,
    name: SLOT_NAMES[id],
    icon: SLOT_ICONS[id],
    count: 0
  })),
  presets: [],
  composer: { ...emptyComposer },
  composerVariables: {},
  selectedPromptId: null,
  selectedPresetId: null,
  activeTab: 'composer',
  stats: {
    total: 0,
    by_slot: { system: 0, context: 0, prefix: 0, suffix: 0, format: 0 }
  },
  loading: false,
  error: null
};

// =============================================================================
// STORE
// =============================================================================

export const promptsStore = writable<PromptsStoreState>(initialState);

// =============================================================================
// ACTIONS - Prompts
// =============================================================================

/**
 * Carga la lista de prompts
 */
export async function loadPrompts(): Promise<void> {
  promptsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<{
      prompts: Prompt[];
      promptsBySlot: Record<SlotType, Prompt[]>;
      slotTypes: SlotTypeInfo[];
      stats: PromptsStoreState['stats'];
    }>('prompt', 'list');

    promptsStore.update(s => ({
      ...s,
      prompts: response.data.prompts || [],
      promptsBySlot: response.data.promptsBySlot || initialState.promptsBySlot,
      slotTypes: response.data.slotTypes || initialState.slotTypes,
      stats: response.data.stats || initialState.stats,
      loading: false,
      error: null
    }));

    console.log('[Prompts] Loaded:', response.data.stats?.total || 0, 'prompts');
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    promptsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Prompts] Load failed:', errorMessage);
  }
}

/**
 * Obtiene un prompt por ID
 */
export async function getPrompt(id: string): Promise<Prompt | null> {
  try {
    const response = await mqttRequest<{ prompt: Prompt }>('prompt', 'get', { id });
    return response.data.prompt;
  } catch (error) {
    console.error('[Prompts] Get failed:', getErrorMessage(error));
    return null;
  }
}

/**
 * Crea un nuevo prompt
 */
export async function createPrompt(data: {
  name: string;
  title?: string;
  description?: string;
  content: string;
  slot_type: SlotType;
  variables?: PromptVariable[];
  tags?: string[];
}): Promise<Prompt | null> {
  promptsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<{ prompt: Prompt }>('prompt', 'create', data);

    // Recargar lista
    await loadPrompts();

    console.log('[Prompts] Created:', response.data.prompt.id);
    return response.data.prompt;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    promptsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Prompts] Create failed:', errorMessage);
    return null;
  }
}

/**
 * Actualiza un prompt
 */
export async function updatePrompt(id: string, data: Partial<{
  title: string;
  description: string;
  content: string;
  slot_type: SlotType;
  variables: PromptVariable[];
  tags: string[];
}>): Promise<Prompt | null> {
  promptsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<{ prompt: Prompt }>('prompt', 'update', { id, ...data });

    // Recargar lista
    await loadPrompts();

    console.log('[Prompts] Updated:', id);
    return response.data.prompt;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    promptsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Prompts] Update failed:', errorMessage);
    return null;
  }
}

/**
 * Elimina un prompt
 */
export async function deletePrompt(id: string): Promise<boolean> {
  promptsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest<{ deleted: boolean }>('prompt', 'delete', { id });

    // Limpiar selección si era el prompt eliminado
    promptsStore.update(s => ({
      ...s,
      selectedPromptId: s.selectedPromptId === id ? null : s.selectedPromptId
    }));

    // Remover del composer si estaba
    removeFromComposer(id);

    // Recargar lista
    await loadPrompts();

    console.log('[Prompts] Deleted:', id);
    return true;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    promptsStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Prompts] Delete failed:', errorMessage);
    return false;
  }
}

/**
 * Obtiene las versiones de un prompt
 */
export async function getPromptVersions(id: string): Promise<{
  prompt_id: string;
  current_version: string;
  versions: Array<{
    version: string;
    content: string;
    variables: string;
    created_at: string;
    created_by: string;
  }>;
} | null> {
  try {
    const response = await mqttRequest<{
      prompt_id: string;
      current_version: string;
      versions: Array<{
        version: string;
        content: string;
        variables: string;
        created_at: string;
        created_by: string;
      }>;
    }>('prompt', 'versions', { id });
    return response.data;
  } catch (error) {
    console.error('[Prompts] Versions failed:', getErrorMessage(error));
    return null;
  }
}

// =============================================================================
// ACTIONS - Presets
// =============================================================================

/**
 * Carga la lista de presets
 */
export async function loadPresets(): Promise<void> {
  try {
    const response = await mqttRequest<{ presets: Preset[]; total: number }>('preset', 'list');

    promptsStore.update(s => ({
      ...s,
      presets: response.data.presets || []
    }));

    console.log('[Prompts] Presets loaded:', response.data.total);
  } catch (error) {
    console.error('[Prompts] Load presets failed:', getErrorMessage(error));
  }
}

/**
 * Crea un nuevo preset desde el estado actual del composer
 */
export async function createPreset(name: string, description?: string): Promise<Preset | null> {
  try {
    // Obtener IDs actuales del composer
    let currentComposer: ComposerState = emptyComposer;
    promptsStore.subscribe(s => { currentComposer = s.composer; })();

    const slots: Record<string, string[]> = {};
    for (const slotType of SLOT_TYPES) {
      const slotPrompts = currentComposer[slotType];
      if (slotPrompts.length > 0) {
        slots[slotType] = slotPrompts.map(p => p.id);
      }
    }

    const response = await mqttRequest<{ preset: Preset }>('preset', 'create', {
      name,
      description,
      slots
    });

    // Recargar presets
    await loadPresets();

    console.log('[Prompts] Preset created:', response.data.preset.id);
    return response.data.preset;
  } catch (error) {
    console.error('[Prompts] Create preset failed:', getErrorMessage(error));
    return null;
  }
}

/**
 * Aplica un preset al composer
 */
export async function applyPreset(id: string): Promise<boolean> {
  try {
    const response = await mqttRequest<{
      preset: { id: string; name: string };
      composerState: ComposerState;
    }>('preset', 'apply', { id });

    promptsStore.update(s => ({
      ...s,
      composer: response.data.composerState,
      selectedPresetId: id
    }));

    console.log('[Prompts] Preset applied:', response.data.preset.name);
    return true;
  } catch (error) {
    console.error('[Prompts] Apply preset failed:', getErrorMessage(error));
    return false;
  }
}

/**
 * Elimina un preset
 */
export async function deletePreset(id: string): Promise<boolean> {
  try {
    await mqttRequest<{ deleted: boolean }>('preset', 'delete', { id });

    // Limpiar selección si era el preset eliminado
    promptsStore.update(s => ({
      ...s,
      selectedPresetId: s.selectedPresetId === id ? null : s.selectedPresetId
    }));

    // Recargar presets
    await loadPresets();

    console.log('[Prompts] Preset deleted:', id);
    return true;
  } catch (error) {
    console.error('[Prompts] Delete preset failed:', getErrorMessage(error));
    return false;
  }
}

// =============================================================================
// ACTIONS - Composer
// =============================================================================

/**
 * Añade un prompt al composer en su slot correspondiente
 */
export function addToComposer(prompt: Prompt | ComposerSlot): void {
  const slot: ComposerSlot = {
    id: prompt.id,
    name: prompt.name,
    title: prompt.title,
    content: prompt.content,
    variables: prompt.variables
  };

  // Determinar slot_type
  const slotType = 'slot_type' in prompt ? prompt.slot_type : 'system';

  promptsStore.update(s => {
    // Evitar duplicados
    if (s.composer[slotType].some(p => p.id === slot.id)) {
      return s;
    }

    return {
      ...s,
      composer: {
        ...s.composer,
        [slotType]: [...s.composer[slotType], slot]
      }
    };
  });
}

/**
 * Remueve un prompt del composer
 */
export function removeFromComposer(promptId: string): void {
  promptsStore.update(s => {
    const newComposer = { ...s.composer };

    for (const slotType of SLOT_TYPES) {
      newComposer[slotType] = newComposer[slotType].filter(p => p.id !== promptId);
    }

    return { ...s, composer: newComposer };
  });
}

/**
 * Limpia todo el composer
 */
export function clearComposer(): void {
  promptsStore.update(s => ({
    ...s,
    composer: { ...emptyComposer },
    composerVariables: {},
    selectedPresetId: null
  }));
}

/**
 * Actualiza el valor de una variable del composer
 */
export function setComposerVariable(name: string, value: string): void {
  promptsStore.update(s => ({
    ...s,
    composerVariables: { ...s.composerVariables, [name]: value }
  }));
}

/**
 * Renderiza el prompt final desde el composer
 */
export async function renderComposer(): Promise<{
  parts: Array<{
    slot_type: SlotType;
    slot_icon: string;
    prompt_id: string;
    prompt_name: string;
    content: string;
  }>;
  finalPrompt: string;
  estimatedTokens: number;
  variables: string[];
} | null> {
  try {
    let currentState: PromptsStoreState = initialState;
    promptsStore.subscribe(s => { currentState = s; })();

    // Construir slots con IDs
    const slots: Record<string, string[]> = {};
    for (const slotType of SLOT_TYPES) {
      const slotPrompts = currentState.composer[slotType];
      if (slotPrompts.length > 0) {
        slots[slotType] = slotPrompts.map(p => p.id);
      }
    }

    const response = await mqttRequest<{
      parts: Array<{
        slot_type: SlotType;
        slot_icon: string;
        prompt_id: string;
        prompt_name: string;
        content: string;
      }>;
      finalPrompt: string;
      estimatedTokens: number;
      variables: string[];
      variablesProvided: Record<string, string>;
    }>('composer', 'render', {
      slots,
      variables: currentState.composerVariables
    });

    return response.data;
  } catch (error) {
    console.error('[Prompts] Render composer failed:', getErrorMessage(error));
    return null;
  }
}

/**
 * Aplica el prompt renderizado del composer a la conversación activa
 */
export async function applyComposerToChat(): Promise<boolean> {
  try {
    // Importar dinámicamente para evitar dependencia circular
    const { conversationsStore, updateConversation } = await import('./conversations');
    const { get } = await import('svelte/store');

    const convState = get(conversationsStore);
    if (!convState.activeConversationId) {
      console.warn('[Prompts] No active conversation to apply prompt');
      return false;
    }

    // Renderizar el composer
    const rendered = await renderComposer();
    if (!rendered || !rendered.finalPrompt) {
      console.warn('[Prompts] No prompt to apply');
      return false;
    }

    // Actualizar system_prompt de la conversación
    await updateConversation(convState.activeConversationId, {
      system_prompt: rendered.finalPrompt
    });

    console.log('[Prompts] Applied composer to chat:', rendered.estimatedTokens, 'tokens');
    return true;
  } catch (error) {
    console.error('[Prompts] Apply to chat failed:', getErrorMessage(error));
    return false;
  }
}

// =============================================================================
// ACTIONS - Analytics
// =============================================================================

/**
 * Obtiene analytics de prompts
 */
export async function getAnalytics(): Promise<{
  total_prompts: number;
  total_presets: number;
  topPrompts: Array<{
    prompt_id: string;
    prompt_name: string;
    slot_type: SlotType;
    slot_icon: string;
    usage_count: number;
    last_used: string;
  }>;
  bySlot: Record<SlotType, { count: number; total_usage: number }>;
} | null> {
  try {
    const response = await mqttRequest<{
      total_prompts: number;
      total_presets: number;
      topPrompts: Array<{
        prompt_id: string;
        prompt_name: string;
        slot_type: SlotType;
        slot_icon: string;
        usage_count: number;
        last_used: string;
      }>;
      bySlot: Record<SlotType, { count: number; total_usage: number }>;
    }>('prompt', 'analytics');

    return response.data;
  } catch (error) {
    console.error('[Prompts] Analytics failed:', getErrorMessage(error));
    return null;
  }
}

// =============================================================================
// UI STATE ACTIONS
// =============================================================================

/**
 * Selecciona un prompt
 */
export function selectPrompt(id: string | null): void {
  promptsStore.update(s => ({ ...s, selectedPromptId: id }));
}

/**
 * Cambia la tab activa
 */
export function setActiveTab(tab: PromptsStoreState['activeTab']): void {
  promptsStore.update(s => ({ ...s, activeTab: tab }));
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
 * Inicializa el store de prompts
 */
export function initPrompts(): () => void {
  // Cargar prompts y presets al inicializar
  loadPrompts();
  loadPresets();

  // Retornar cleanup
  return () => {};
}

// =============================================================================
// DERIVED STORES
// =============================================================================

/** Prompt seleccionado actual */
export const selectedPrompt = derived(
  promptsStore,
  $s => $s.prompts.find(p => p.id === $s.selectedPromptId) || null
);

/** Preset seleccionado actual */
export const selectedPreset = derived(
  promptsStore,
  $s => $s.presets.find(p => p.id === $s.selectedPresetId) || null
);

/** Prompts por slot type */
export const systemPrompts = derived(promptsStore, $s => $s.promptsBySlot.system);
export const contextPrompts = derived(promptsStore, $s => $s.promptsBySlot.context);
export const prefixPrompts = derived(promptsStore, $s => $s.promptsBySlot.prefix);
export const suffixPrompts = derived(promptsStore, $s => $s.promptsBySlot.suffix);
export const formatPrompts = derived(promptsStore, $s => $s.promptsBySlot.format);

/** Estado del composer */
export const composerState = derived(promptsStore, $s => $s.composer);
export const composerVariables = derived(promptsStore, $s => $s.composerVariables);

/** Variables detectadas en el composer */
export const detectedVariables = derived(promptsStore, $s => {
  const vars = new Set<string>();

  for (const slotType of SLOT_TYPES) {
    for (const prompt of $s.composer[slotType]) {
      if (prompt.variables) {
        prompt.variables.forEach(v => vars.add(v.name || String(v)));
      }
      // También detectar {{var}} en contenido
      const matches = prompt.content.match(/\{\{\s*(\w+)\s*\}\}/g);
      if (matches) {
        matches.forEach(m => {
          const varName = m.replace(/\{\{\s*|\s*\}\}/g, '');
          vars.add(varName);
        });
      }
    }
  }

  return Array.from(vars);
});

/** Composer vacío o no */
export const isComposerEmpty = derived(promptsStore, $s => {
  return SLOT_TYPES.every(type => $s.composer[type].length === 0);
});

/** Estado de carga */
export const isLoading = derived(promptsStore, $s => $s.loading);

/** Error actual */
export const promptsError = derived(promptsStore, $s => $s.error);

/** Total de prompts */
export const promptsCount = derived(promptsStore, $s => $s.stats.total);

/** Tab activa */
export const activeTab = derived(promptsStore, $s => $s.activeTab);
