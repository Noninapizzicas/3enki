import { writable, derived } from 'svelte/store';

// Types
export interface ModuleInfo {
  name: string;
  version: string;
  description: string;
  status: 'loaded' | 'error' | 'disabled';
  ui?: {
    enabled: boolean;
    title: string;
    icon?: string;
    views?: Record<string, unknown>;
  };
  provides?: {
    events?: string[];
    apis?: Array<{
      method: string;
      path: string;
      name: string;
    }>;
  };
}

export interface ModulesState {
  items: ModuleInfo[];
  loading: boolean;
  error: string | null;
}

// Store
export const modulesState = writable<ModulesState>({
  items: [],
  loading: false,
  error: null
});

// Derived stores
export const modules = derived(modulesState, ($state) => $state.items);
export const modulesLoading = derived(modulesState, ($state) => $state.loading);
export const modulesError = derived(modulesState, ($state) => $state.error);

// Current selected module
export const currentModule = writable<string | null>(null);

// Derived: current module details
export const currentModuleInfo = derived(
  [modulesState, currentModule],
  ([$state, $current]) => {
    if (!$current) return null;
    return $state.items.find(m => m.name === $current) || null;
  }
);

// Derived: modules with UI enabled
export const uiModules = derived(modulesState, ($state) =>
  $state.items.filter(m => m.ui?.enabled)
);

/**
 * Fetch modules from Event-Core API
 */
export async function loadModules(baseUrl: string = '') {
  modulesState.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await fetch(`${baseUrl}/modules`);

    if (!response.ok) {
      throw new Error(`Failed to fetch modules: ${response.statusText}`);
    }

    const data = await response.json();
    const items: ModuleInfo[] = Array.isArray(data) ? data : data.modules || [];

    modulesState.update(s => ({
      ...s,
      items,
      loading: false
    }));

    return items;
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    modulesState.update(s => ({ ...s, loading: false, error }));
    return [];
  }
}

/**
 * Fetch single module details
 */
export async function loadModule(name: string, baseUrl: string = '') {
  try {
    const response = await fetch(`${baseUrl}/modules/${name}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch module: ${response.statusText}`);
    }

    const module: ModuleInfo = await response.json();

    // Update in store
    modulesState.update(s => ({
      ...s,
      items: s.items.map(m => m.name === name ? module : m)
    }));

    return module;
  } catch (err) {
    console.error(`[Modules] Failed to load ${name}:`, err);
    return null;
  }
}

/**
 * Call module API endpoint
 */
export async function callModuleApi<T = unknown>(
  moduleName: string,
  path: string,
  options: RequestInit = {},
  baseUrl: string = ''
): Promise<T> {
  const url = `${baseUrl}/modules/${moduleName}/api${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.statusText}`);
  }

  return response.json();
}
