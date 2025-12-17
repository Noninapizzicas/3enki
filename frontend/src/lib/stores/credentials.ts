/**
 * Credentials Store - Gestión de credenciales
 *
 * Gestiona:
 * - Lista de credenciales
 * - Credencial en edición
 * - Estado de carga/error
 * - CRUD operations
 */

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

// ============================================================================
// TYPES
// ============================================================================

export interface Credential {
  key: string;
  provider: string;
  providerName: string;
  providerIcon: string;
  level: 'GLOBAL' | 'PROJECT' | 'CLIENT' | 'CUSTOM';
  identifier: string | null;
  preview: string;
}

export interface ProviderOption {
  id: string;
  name: string;
  icon: string;
}

export interface LevelOption {
  id: string;
  name: string;
  icon: string;
  requiresIdentifier: boolean;
}

export interface CredentialsState {
  credentials: Credential[];
  providers: ProviderOption[];
  levels: LevelOption[];
  stats: {
    total: number;
    byLevel: Record<string, number>;
  };
  loading: boolean;
  error: string | null;
}

// ============================================================================
// STORE
// ============================================================================

const initialState: CredentialsState = {
  credentials: [],
  providers: [],
  levels: [],
  stats: { total: 0, byLevel: {} },
  loading: false,
  error: null
};

export const credentialsStore = writable<CredentialsState>(initialState);

// Credential being edited
export const editingCredential = writable<Credential | null>(null);

// ============================================================================
// API HELPERS
// ============================================================================

function getApiBase(): string {
  if (!browser) return '';
  return `http://${window.location.hostname}:3000/modules/credential-manager/api`;
}

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Fetch UI state (providers, levels, credentials)
 */
export async function fetchCredentials(): Promise<void> {
  credentialsStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const res = await fetch(`${getApiBase()}/ui/state`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    if (data.success) {
      // Flatten credentials from all levels
      const allCredentials: Credential[] = [
        ...(data.credentials.GLOBAL || []),
        ...(data.credentials.PROJECT || []),
        ...(data.credentials.CLIENT || []),
        ...(data.credentials.CUSTOM || [])
      ];

      credentialsStore.update(s => ({
        ...s,
        credentials: allCredentials,
        providers: data.providers || [],
        levels: data.levels || [],
        stats: data.stats || { total: 0, byLevel: {} },
        loading: false
      }));
    } else {
      throw new Error(data.error || 'Error loading credentials');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error loading credentials';
    credentialsStore.update(s => ({ ...s, loading: false, error: message }));
  }
}

/**
 * Test a credential before saving
 */
export async function testCredential(provider: string, apiKey: string): Promise<{ valid: boolean; message: string }> {
  try {
    const res = await fetch(`${getApiBase()}/ui/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, api_key: apiKey })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    return {
      valid: data.valid || false,
      message: data.message || (data.valid ? 'Valid' : 'Invalid')
    };
  } catch (err) {
    return { valid: false, message: 'Connection error' };
  }
}

/**
 * Save a new credential
 */
export async function saveCredential(
  provider: string,
  level: string,
  identifier: string | null,
  apiKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${getApiBase()}/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        level,
        identifier: identifier || null,
        api_key: apiKey
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    if (data.success) {
      await fetchCredentials(); // Refresh list
      return { success: true };
    } else {
      return { success: false, error: data.error || 'Failed to save' };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection error';
    return { success: false, error: message };
  }
}

/**
 * Update an existing credential
 */
export async function updateCredential(key: string, apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${getApiBase()}/credentials/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    if (data.success) {
      await fetchCredentials(); // Refresh list
      return { success: true };
    } else {
      return { success: false, error: data.error || 'Failed to update' };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection error';
    return { success: false, error: message };
  }
}

/**
 * Delete a credential
 */
export async function deleteCredential(key: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${getApiBase()}/credentials/${encodeURIComponent(key)}`, {
      method: 'DELETE'
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    if (data.success) {
      await fetchCredentials(); // Refresh list
      return { success: true };
    } else {
      return { success: false, error: data.error || 'Failed to delete' };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection error';
    return { success: false, error: message };
  }
}

/**
 * Set credential for editing
 */
export function setEditingCredential(credential: Credential | null): void {
  editingCredential.set(credential);
}

/**
 * Clear editing state
 */
export function clearEditingCredential(): void {
  editingCredential.set(null);
}

// ============================================================================
// DERIVED STORES
// ============================================================================

export const globalCredentials = derived(credentialsStore, $s =>
  $s.credentials.filter(c => c.level === 'GLOBAL')
);

export const projectCredentials = derived(credentialsStore, $s =>
  $s.credentials.filter(c => c.level === 'PROJECT')
);

export const clientCredentials = derived(credentialsStore, $s =>
  $s.credentials.filter(c => c.level === 'CLIENT')
);

export const customCredentials = derived(credentialsStore, $s =>
  $s.credentials.filter(c => c.level === 'CUSTOM')
);

export const isLoading = derived(credentialsStore, $s => $s.loading);
export const hasError = derived(credentialsStore, $s => $s.error !== null);
export const credentialError = derived(credentialsStore, $s => $s.error);
export const credentialCount = derived(credentialsStore, $s => $s.stats.total);
