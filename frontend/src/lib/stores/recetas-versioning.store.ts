/**
 * Recetas Versioning Store
 *
 * Gestiona:
 * - Historial de versiones
 * - Comparación entre versiones
 * - Revert a versión anterior
 * - Timeline de cambios
 */

import { writable, derived } from 'svelte/store';
import type { RecetaCompleta, RecetaVersion, RecetaDiff } from './recetas-v2.types';

// ==========================================
// TIPOS DEL STORE
// ==========================================

export interface VersionHistoryItem {
  version: number;
  nombre: string;
  cambios_descripcion: string;
  cambiado_por: string;
  cambiado_at: number;
  snapshot: RecetaCompleta;
  cambios?: RecetaDiff[];
}

export interface VersioningState {
  receta_id: string | null;
  currentVersion: number;
  versions: VersionHistoryItem[];
  loading: boolean;
  error: string | null;
  selectedVersions: [number, number] | null; // Para comparación
}

// ==========================================
// STORE CREACIÓN
// ==========================================

function createVersioningStore() {
  const initialState: VersioningState = {
    receta_id: null,
    currentVersion: 1,
    versions: [],
    loading: false,
    error: null,
    selectedVersions: null
  };

  const { subscribe, set, update } = writable<VersioningState>(initialState);

  return {
    subscribe,

    /**
     * Carga historial de versiones para receta
     */
    async loadVersionHistory(projectId: string, recetaId: string) {
      update(s => ({ ...s, loading: true, error: null }));

      try {
        const response = await fetch(`/api/recetas/${projectId}/${recetaId}/history`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
          throw new Error(`Failed to load version history: ${response.statusText}`);
        }

        const data = await response.json();

        update(s => ({
          ...s,
          receta_id: recetaId,
          currentVersion: data.current_version || 1,
          versions: data.versions || [],
          loading: false
        }));
      } catch (error) {
        update(s => ({
          ...s,
          error: error instanceof Error ? error.message : 'Unknown error',
          loading: false
        }));
      }
    },

    /**
     * Obtiene versión específica
     */
    async getVersion(projectId: string, recetaId: string, version: number) {
      try {
        const response = await fetch(
          `/api/recetas/${projectId}/${recetaId}/versions/${version}`,
          { method: 'GET' }
        );

        if (!response.ok) {
          throw new Error(`Failed to load version ${version}`);
        }

        return await response.json() as VersionHistoryItem;
      } catch (error) {
        update(s => ({
          ...s,
          error: error instanceof Error ? error.message : 'Unknown error'
        }));
        return null;
      }
    },

    /**
     * Compara dos versiones
     */
    setSelectedVersions(v1: number, v2: number) {
      update(s => ({
        ...s,
        selectedVersions: [Math.min(v1, v2), Math.max(v1, v2)]
      }));
    },

    clearSelectedVersions() {
      update(s => ({
        ...s,
        selectedVersions: null
      }));
    },

    /**
     * Revierte a versión anterior
     */
    async revertToVersion(projectId: string, recetaId: string, targetVersion: number) {
      update(s => ({ ...s, loading: true, error: null }));

      try {
        const response = await fetch(
          `/api/recetas/${projectId}/${recetaId}/revert`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_version: targetVersion })
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to revert to version ${targetVersion}`);
        }

        // Recargar historial
        await this.loadVersionHistory(projectId, recetaId);
      } catch (error) {
        update(s => ({
          ...s,
          error: error instanceof Error ? error.message : 'Unknown error',
          loading: false
        }));
      }
    },

    /**
     * Limpia estado
     */
    reset() {
      set(initialState);
    },

    /**
     * Actualiza error manualmente
     */
    setError(error: string | null) {
      update(s => ({ ...s, error }));
    }
  };
}

export const versioningStore = createVersioningStore();

// ==========================================
// DERIVED STORES
// ==========================================

/**
 * Timeline de cambios (ordenado por fecha descendente)
 */
export const versionTimeline = derived(
  versioningStore,
  $store =>
    [...($store.versions || [])]
      .sort((a, b) => b.cambiado_at - a.cambiado_at)
      .map((v, idx) => ({
        ...v,
        isLatest: idx === 0,
        daysAgo: Math.floor((Date.now() - v.cambiado_at) / (1000 * 60 * 60 * 24))
      }))
);

/**
 * Versión actual (snapshot)
 */
export const currentVersionSnapshot = derived(
  versioningStore,
  $store => {
    if (!$store.versions.length) return null;
    const current = $store.versions.find(v => v.version === $store.currentVersion);
    return current?.snapshot || null;
  }
);

/**
 * Cambios recientes (últimas 5 versiones)
 */
export const recentChanges = derived(
  versionTimeline,
  $timeline => $timeline.slice(0, 5)
);

/**
 * Estadísticas de cambios
 */
export const changeStats = derived(
  versioningStore,
  $store => {
    const versions = $store.versions || [];

    const changeTypes: Record<string, number> = {};
    let totalVersions = versions.length;
    let daysOld = 0;

    for (const v of versions) {
      if (v.cambios) {
        for (const change of v.cambios) {
          changeTypes[change.campo] = (changeTypes[change.campo] || 0) + 1;
        }
      }
    }

    if (versions.length > 0) {
      const oldest = versions[versions.length - 1];
      daysOld = Math.floor((Date.now() - oldest.cambiado_at) / (1000 * 60 * 60 * 24));
    }

    return {
      totalVersions,
      daysOld,
      mostChangedFields: Object.entries(changeTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([field, count]) => ({ field, count })),
      avgChangesPerVersion: totalVersions > 0
        ? Object.values(changeTypes).reduce((a, b) => a + b, 0) / totalVersions
        : 0
    };
  }
);

/**
 * Diff entre dos versiones (para comparador)
 */
export const selectedVersionsDiff = derived(
  [versioningStore],
  ([$store]) => {
    if (!$store.selectedVersions) return null;

    const [v1Num, v2Num] = $store.selectedVersions;
    const v1 = $store.versions.find(v => v.version === v1Num);
    const v2 = $store.versions.find(v => v.version === v2Num);

    if (!v1 || !v2) return null;

    return {
      version1: {
        num: v1Num,
        snapshot: v1.snapshot,
        changedAt: v1.cambiado_at,
        changedBy: v1.cambiado_por,
        description: v1.cambios_descripcion
      },
      version2: {
        num: v2Num,
        snapshot: v2.snapshot,
        changedAt: v2.cambiado_at,
        changedBy: v2.cambiado_por,
        description: v2.cambios_descripcion
      },
      diffs: v2.cambios || []
    };
  }
);
