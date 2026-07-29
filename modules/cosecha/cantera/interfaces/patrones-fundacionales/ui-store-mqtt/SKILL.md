---
name: ui-store-mqtt
description: >-
  Patrón FUNDACIONAL para crear stores MQTT en el frontend de Enki.
  Cada store es un puente que REFLEJA el estado del backend: pide datos
  via mqttRequest, los refleja en un writable, y se suscribe a eventos
  para mantenerse sincronizado en tiempo real.
fuente: 3enki
dominio: interfaces
tags: [store, mqtt, svelte, patron, frontend, reflejo, cupula-interfaces]
---

# Patrón · Store MQTT

> El store MQTT es el **module.json del frontend**. Cada store es un puente
> que refleja el estado del backend. No calcula, no persiste — solo refleja.

## Anatomía de un Store

```typescript
// stores/midominio.ts
import { writable, derived, get } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core';

// ── 1. TIPOS ── (reflejan el contrato del backend)
export interface MiItem {
  id: string;
  nombre: string;
}

interface MiState {
  items: MiItem[];
  selected: MiItem | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

const initialState: MiState = {
  items: [], selected: null,
  loading: false, saving: false, error: null
};

// ── 2. STORE (writable) ── sólo este archivo escribe
export const miStore = writable<MiState>(initialState);

// ── 3. DERIVADOS (readonly para componentes) ──
export const miItems   = derived(miStore, $s => $s.items);
export const miLoading = derived(miStore, $s => $s.loading);
export const miError   = derived(miStore, $s => $s.error);
export const miCount   = derived(miStore, $s => $s.items.length);

// ── 4. ACCIONES (reflejan, no calculan) ──
export async function loadItems(projectId: string): Promise<void> {
  miStore.update(s => ({ ...s, loading: true, error: null }));
  try {
    const res = await mqttRequest('midominio', 'list', { project_id: projectId });
    const items = (res?.data as any)?.items || [];
    miStore.update(s => ({ ...s, items, loading: false }));
  } catch (err: any) {
    miStore.update(s => ({ ...s, loading: false, error: err.message }));
  }
}

export async function createItem(
  projectId: string, nombre: string, extras: Record<string, any> = {}
): Promise<{ success: boolean; error?: string }> {
  // ... patrón: saving=true → mqttRequest → saving=false + refresh
}

// ── 5. SUSCRIPCIONES TIEMPO REAL ──
export function initMiSubscriptions(projectId: string): () => void {
  const cleanups: (() => void)[] = [];
  for (const ev of ['midominio.creado', 'midominio.eliminado']) {
    cleanups.push(mqttSubscribe(ev, () => loadItems(projectId)));
  }
  loadItems(projectId);
  return () => cleanups.forEach(fn => fn());
}

// ── 6. RESET ──
export function resetStore(): void {
  miStore.set(initialState);
}
```

## Reglas del patrón

| Regla | Por qué |
|-------|---------|
| 1 writable + N derivados | Solo el store escribe; componentes leen derivados |
| Acciones retornan `{success, error}` | El componente sabe si falló |
| `loading` + `error` en state | Todo store muestra su estado |
| Suscripciones por evento | Coherencia multi-superficie (2 pestañas = mismos datos) |
| Reset al salir | Evita datos stale entre pantallas |
| Reflejo puro | Backend manda estado completo en cada respuesta |

## Ciclo de vida

```
Mount → loadItems() → initSubscriptions()
        ↓                ↓
   pide datos        escucha eventos
        ↓                ↓
   refleja en        otro cambia → re-refleja
   writable
```

## Dónde usarlo

Copia este patrón para: cuentas, comandero, cocina, facturas, dispositivos,
y cualquier dominio nuevo que necesite UI.
