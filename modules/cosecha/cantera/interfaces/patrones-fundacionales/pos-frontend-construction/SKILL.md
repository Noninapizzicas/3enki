---
name: pos-frontend-construction
description: >-
  Skill para CONSTRUIR la interfaz de un POS (Punto de Venta) sobre Enki.
  Cubre la arquitectura completa: frontend SvelteKit + stores MQTT + backend
  Enki (módulos pizzepos/prisma). Incluye patrones de reflejo, coherencia
  multi-superficie, stores, componentes, y el flujo cuenta→pedido→cobro.

  ÚSALA CUANDO estés creando, expandiendo o modificando cualquier pantalla
  de POS — comandero (TPV), cuentas activas, cocina, facturación, o cualquier
  nueva superficie de venta. SIRVE como blueprint para construir cualquier
  POS desde cero o añadir funcionalidades a uno existente.

  PERTENECE a la cúpula interfaces/patrones-fundacionales/ — gemela de los
  módulos backend. NO usar para crear skills Hermes ni herramientas de chat.
fuente: 3enki
dominio: comercio
tags: [pos, pizzepos, svelte, sveltekit, mqtt, frontend, ui, tpv, cupula-interfaces]
---

# POS Frontend Construction

> Blueprint completo para construir la interfaz de un POS (Punto de Venta)
> sobre Enki. Basado en el sistema pizzepos real: comandero, cuentas, cocina,
> cobros. El patrón sirve para CUALQUIER POS — pizzería, restaurante, retail,
> bar, kiosko.

---

## 0 · Filosofía

> **Reflejo, no cálculo.** La UI no tiene lógica de negocio. Cada store es un
> puente MQTT que pide datos al backend y los REFLEJA. El backend es la fuente
> de verdad de precios, carritos, cobros y estados.

```
UI (Svelte)
  → Store.action(mqttRequest) → Enki Backend
  → Backend procesa, responde con estado completo
  → Store.set(respuesta) → UI se actualiza (reflejo)
```

---

## 1 · Stack Tecnológico

| Capa | Tecnología | Por qué |
|------|-----------|---------|
| Framework | **Svelte 5** + SvelteKit 2 | Reactividad fina, sin virtual DOM, bundle pequeño |
| Adaptador | `@sveltejs/adapter-node` | Node server, fácil de integrar con Enki |
| Build | Vite 6 | Rápido, HMR instantáneo |
| Comunicación | **MQTT** via `mqtt.js` | Tiempo real nativo, request-response RPC |
| Tipado | TypeScript progresivo | Donde suma, sin dogma |
| Estilos | CSS custom properties inline | Temas intercambiables, sin Tailwind |
| Dependencias UI | Solo `mqtt`, `marked`, `highlight.js` | Mínimo, cero framework UI externo |

---

## 2 · Estructura de Archivos

```
frontend/
├── src/
│   ├── app.html
│   ├── routes/
│   │   ├── +layout.svelte              # Reset CSS global
│   │   ├── +page.svelte                # Home (redirect)
│   │   ├── [project_id]/
│   │   │   ├── +layout.svelte          # Layout de proyecto (carga datos, skin)
│   │   │   ├── +page.svelte            # Redirect a /chat
│   │   │   ├── pos/                    # POS universal (prisma)
│   │   │   ├── comandero/              # TPV: lista de cuentas
│   │   │   ├── comandero/[cuenta_id]/  # TPV: pedido de UNA cuenta
│   │   │   ├── cocina/                 # Display cocina
│   │   │   ├── facturas/               # Facturación
│   │   │   └── ...                     # Otras páginas del page-set
│   │   └── staff/
│   ├── lib/
│   │   ├── ui-core/                    # ♥ CORAZÓN: infraestructura compartida
│   │   │   ├── mqtt.ts                 # Cliente MQTT (conexión/pub/sub)
│   │   │   ├── mqtt-request.ts         # RPC request-response sobre MQTT
│   │   │   ├── registry.ts             # Registro modular de UI
│   │   │   ├── types.ts                # Tipos compartidos
│   │   │   ├── project-pages.ts        # Page-set por tipo de proyecto
│   │   │   └── ...
│   │   ├── stores/                     # ♥ Stores MQTT (UNO por dominio)
│   │   │   ├── comandero.ts
│   │   │   ├── cuentas.ts
│   │   │   ├── cocina.ts
│   │   │   ├── facturas.ts
│   │   │   ├── impresion.ts
│   │   │   └── ... (~1 por módulo backend)
│   │   ├── components/                 # Componentes Svelte
│   │   │   ├── base/                   # Botones, Badge, Toast, Markdown...
│   │   │   ├── layout/                 # Shell, WorkBar, Panel, PageNavStrip...
│   │   │   ├── comandero/              # TPV: CuentasScreen, CobroPanel...
│   │   │   ├── cocina/                 # CocinaScreen, PedidoCard...
│   │   │   └── [tu-dominio]/           # Tus nuevas pantallas
│   │   └── utils/
│   └── ...
```

---

## 3 · ui-core (infraestructura compartida)

### 3.1 MQTT client (`ui-core/mqtt.ts`)

El cliente MQTT es el bus de comunicación único. No hay REST, WebSocket ni
HTTP directo. Todo va por MQTT.

```typescript
// Conexión al broker Enki
import mqtt from 'mqtt';

const BROKER = 'ws://localhost:9001';  // MQTT over WebSocket
const client = mqtt.connect(BROKER, {
  clientId: `ui_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
});

// Publicar
export function publish(topic: string, payload: unknown): void {
  client.publish(topic, JSON.stringify(payload));
}

// Suscribir (retorna cleanup function)
export function subscribe(pattern: string, handler: (topic: string, payload: unknown) => void): () => void {
  client.subscribe(pattern);
  const wrapped = (t: string, buf: Buffer) => {
    try { handler(t, JSON.parse(buf.toString())); } catch {}
  };
  client.on('message', wrapped);
  return () => client.off('message', wrapped);
}

export const connected = client.connected;
```

### 3.2 Request-Response RPC (`ui-core/mqtt-request.ts`)

Patrón request-response sobre MQTT usando correlation_id:

```typescript
export class MqttRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function mqttRequest<T = any>(
  domain: string,       // ej: 'comandero', 'cuenta', 'carrito'
  action: string,       // ej: 'add-item', 'create', 'get'
  payload: Record<string, any> = {}
): Promise<{ status: number; data: T; error?: string }> {
  const correlation_id = crypto.randomUUID();
  const topic = `core/+/api/request/${domain}/${action}`;
  const responseTopic = `core/+/api/response/${correlation_id}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsub();
      reject(new Error(`RPC timeout: ${domain}.${action}`));
    }, 30000);

    const unsub = subscribe(responseTopic, (_, msg: any) => {
      clearTimeout(timeout);
      unsub();
      resolve(msg as any);
    });

    publish(topic, { ...payload, correlation_id });
  });
}
```

### 3.3 Project Pages (`ui-core/project-pages.ts`)

Las páginas del POS **emergen del tipo de proyecto**, no son una lista fija:

```typescript
// Catálogo de todas las páginas posibles
export const PAGE_CATALOG = {
  'comandero': { id: 'comandero', icon: '🧾', label: 'Comandero' },
  'cocina':    { id: 'cocina',    icon: '🍳', label: 'Cocina' },
  'facturas':  { id: 'facturas',  icon: '🧾', label: 'Facturas' },
  'pos':       { id: 'pos',       icon: '💶', label: 'POS' },
  // AÑADE AQUÍ tus nuevas páginas
  'mi-pagina': { id: 'mi-pagina', icon: '🌟', label: 'Mi Página' },
};

// Semilla por tipo de proyecto
const SEED_BY_TYPE = {
  pizzepos: ['comandero', 'cocina', 'facturas', 'recetas', ...],
  prisma:   [],     // Nace vacío — se llena en runtime
  retail:   ['pos', 'catalogo', 'clientes'],  // ← ejemplo para otro POS
};
```

---

## 4 · Patrón Store MQTT

### 4.1 Estructura canónica

CADA store sigue esta estructura:

```typescript
// stores/midominio.ts
import { writable, derived, get } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';
import { subscribe } from '$lib/ui-core';

// ── Tipos ──
export interface MiEntidad {
  id: string;
  nombre: string;
  // ...
}

interface MiState {
  items: MiEntidad[];
  loading: boolean;
  error: string | null;
}

const initialState: MiState = {
  items: [],
  loading: false,
  error: null
};

// ── Store ──
export const miStore = writable<MiState>(initialState);

// ── Derivados (readonly para componentes) ──
export const miItems = derived(miStore, $s => $s.items);
export const miLoading = derived(miStore, $s => $s.loading);
export const miCount   = derived(miStore, $s => $s.items.length);

// ── Acciones ──
export async function loadItems(projectId: string): Promise<void> {
  miStore.update(s => ({ ...s, loading: true, error: null }));
  try {
    const res = await mqttRequest('midominio', 'list', { project_id: projectId });
    const data = res?.data as any;
    miStore.update(s => ({
      ...s,
      items: data?.items || [],
      loading: false
    }));
  } catch (err: any) {
    miStore.update(s => ({
      ...s,
      loading: false,
      error: err.message || 'Error'
    }));
  }
}

export async function createItem(projectId: string, nombre: string): Promise<boolean> {
  try {
    await mqttRequest('midominio', 'create', { project_id: projectId, nombre });
    await loadItems(projectId);  // refrescar
    return true;
  } catch {
    return false;
  }
}

// ── Suscripciones tiempo real ──
export function initMiSubscriptions(projectId: string): () => void {
  const cleanups: (() => void)[] = [];

  cleanups.push(
    subscribe('midominio.creado', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (data?.project_id && data.project_id !== projectId) return;
      loadItems(projectId);  // recargar al recibir evento
    })
  );

  cleanups.push(
    subscribe('midominio.eliminado', (event: any) => {
      if (event?.project_id !== projectId) return;
      loadItems(projectId);
    })
  );

  return () => cleanups.forEach(fn => fn());
}

// ── Reset ──
export function resetStore(): void {
  miStore.set(initialState);
}
```

### 4.2 Exportación centralizada

```typescript
// stores/index.ts — exportar en stores/index.ts
export {
  miStore, miItems, miLoading, miCount,
  loadItems, createItem, initMiSubscriptions, resetStore
} from './midominio';
```

---

## 5 · Componentes Svelte — Patrones POS

### 5.1 Página (entry point)

```svelte
<!-- routes/[project_id]/midominio/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { activeProjectId } from '$lib/stores/projects';
  import MiScreen from '$lib/components/midominio/MiScreen.svelte';

  $: projectId = $activeProjectId || $page.params.project_id;

  function handleNavigate(path: string) {
    goto(`/${$page.params.project_id}${path}`);
  }
</script>

<MiScreen onNavigate={handleNavigate} {projectId} />
```

### 5.2 Pantalla principal

```svelte
<!-- components/midominio/MiScreen.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { connect, disconnect } from '$lib/ui-core';
  import {
    miItems, miLoading,
    loadItems, initMiSubscriptions, resetStore
  } from '$lib/stores/midominio';

  export let projectId: string = '';
  export let onNavigate: ((path: string) => void) | null = null;

  let cleanupSubs: (() => void) | null = null;

  onMount(() => {
    connect().then(() => {
      loadItems(projectId);
      cleanupSubs = initMiSubscriptions(projectId);
    });
  });

  onDestroy(() => {
    cleanupSubs?.();
    resetStore();
    disconnect();
  });
</script>

<div class="screen">
  <!-- tu UI aquí -->
  {#if $miLoading && $miItems.length === 0}
    <div class="empty">Cargando...</div>
  {:else if $miItems.length === 0}
    <div class="empty">Sin datos. Crea el primero.</div>
  {:else}
    {#each $miItems as item (item.id)}
      <div class="card">{item.nombre}</div>
    {/each}
  {/if}
</div>
```

### 5.3 Panel flotante (modal)

```svelte
<!-- components/midominio/MiPanel.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';

  export let visible: boolean = true;
  const dispatch = createEventDispatcher<{
    close: void;
    success: { id: string };
  }>();

  let loading = false;
  let error: string | null = null;

  async function handleSubmit() {
    loading = true;
    try {
      const res = await mqttRequest('midominio', 'accion', { ... });
      if (res?.status === 200) {
        dispatch('success', { id: res.data.id });
      }
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
</script>

{#if visible}
  <div class="overlay" on:click={() => dispatch('close')}>
    <div class="panel" on:click|stopPropagation>
      <!-- contenido del panel -->
      <button on:click={handleSubmit} disabled={loading}>
        {loading ? '⏳...' : 'Guardar'}
      </button>
      <button on:click={() => dispatch('close')}>Cerrar</button>
      {#if error}<div class="error">{error}</div>{/if}
    </div>
  </div>
{/if}
```

---

## 6 · Sistema de Navegación POS

El layout de proyecto (`[project_id]/+layout.svelte`) orquesta la navegación:

### 6.1 Detección de tipo de proyecto

```typescript
// El layout carga los datos del proyecto vía MQTT
const res = await mqttRequest('project', 'get', { id: project_id });
const features = project?.metadata?.features || [];
const isPizzepos = features.includes('pizzepos');

// Resuelve el page-set
const type = resolveType(project);     // 'pizzepos' | 'prisma' | 'retail'
const pages = resolvePages(project, type);  // ['comandero', 'cocina', ...]
```

### 6.2 Guard de ruta

```typescript
// Si navegas a una página que NO está en el page-set del proyecto,
// redirige automáticamente a /chat
$: if ($projectStore.resolved && currentPage && isNavPage(currentPage) &&
      !$projectStore.pages.includes(currentPage)) {
  goto(`/${project_id}/chat`, { replaceState: true });
}
```

### 6.3 PageNavStrip

Crea un componente `PageNavStrip.svelte` que itera sobre las páginas del proyecto:
```svelte
{#each pages as page}
  <a href="/{projectId}/{page.id}" class:active={$page.url.pathname.includes(page.id)}>
    {icon} {label}
  </a>
{/each}
```

---

## 7 · Skins / Temas

Cada tipo de proyecto puede tener su propia **piel** visual:

```typescript
// stores/mi-skin.ts
export function applyMiSkin(): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(MI_SKIN)) {
    root.style.setProperty(k, v);
  }
}

export function clearMiSkin(): void {
  root.removeAttribute('data-ui');
  applyTheme();
}

// En el layout de proyecto:
$: if ($projectStore.type === 'retail') applyMiSkin(); else clearMiSkin();
```

Las skins se definen como paletas de ~20 variables CSS:
```typescript
const MI_SKIN = {
  '--color-bg': '#0a0f0a',
  '--color-primary': '#f59e0b',
  '--color-primary-hover': '#d97706',
  // ... resto de variables
};
```

---

## 8 · Backend Módulos Enki

### 8.1 Estructura de un módulo POS

```
modules/[vertical]/[slug]/
├── module.json      # Contrato: eventos, tools, ui_handlers, config
├── index.js         # Lógica del módulo
├── prompt.json      # Prompt del AI-agent (si aplica)
└── context.json     # Contexto para el panel
```

### 8.2 Contrato module.json (template)

```json
{
  "name": "midominio",
  "version": "1.0.0",
  "description": "Descripción del módulo",
  "main": "index.js",
  "provides": {
    "events": [
      "midominio.creado",
      "midominio.eliminado",
      "midominio.actualizado"
    ]
  },
  "events": {
    "publishes": [
      { "event": "midominio.creado", "description": "Entidad creada" }
    ],
    "subscribes": [
      { "event": "otro.evento", "handler": "onOtroEvento", "description": "Reacciona a..." }
    ]
  },
  "ui_handlers": [
    { "domain": "midominio", "action": "list",   "handler": "handleList" },
    { "domain": "midominio", "action": "get",    "handler": "handleGet" },
    { "domain": "midominio", "action": "create", "handler": "handleCreate" }
  ],
  "tools": [
    {
      "name": "midominio.accion",
      "description": "Tool para el LLM",
      "parameters": { ... }
    }
  ]
}
```

### 8.3 Handler RPC (template)

```javascript
// Ejemplo de uiHandler
async handleList(payload, context) {
  const { project_id } = payload;
  try {
    const items = await this._storage.get(project_id);
    return { status: 200, data: { items } };
  } catch (err) {
    return { status: 500, error: 'Error al listar' };
  }
}

async handleCreate(payload, context) {
  const { project_id, nombre } = payload;
  if (!nombre) return { status: 400, error: 'nombre requerido' };

  const item = { id: crypto.randomUUID(), nombre, created_at: new Date().toISOString() };
  await this._storage.save(project_id, item);

  // Publicar evento para que la UI reaccione
  this.eventBus.publish('midominio.creado', {
    project_id,
    item_id: item.id,
    nombre
  });

  return { status: 201, data: item };
}
```

---

## 9 · Flujo POS Completo (referencia)

### Ciclo de vida de una venta

```
┌──────────┐   ┌───────────┐   ┌───────────┐   ┌──────────┐
│ CUENTA   │→  │ COMANDERO │→  │  COCINA   │→  │  COBRO   │
│ (abrir)  │   │(tomar ped)│   │(preparar) │   │ (cobrar) │
└──────────┘   └───────────┘   └───────────┘   └──────────┘
     ↓              ↓               ↓               ↓
  Cuenta:         Buffer:         Pedido:         Cobro:
  mesa_1          items temps     formal          efectivo
  llevar_2        sin enviar      seguimiento     7 métodos
  delivery_3      a cocina        estados         ticket
```

### Eventos que fluyen entre pantallas

| Evento | De | A | Qué transporta |
|--------|----|---|----------------|
| `cuenta.creada` | Backend | CuentasScreen | cuenta_id, tipo, nombre |
| `cuenta.actualizada` | Backend | CuentasScreen | cuenta_id, cambios |
| `cuenta.estado_cambiado` | Backend | CuentasScreen | cuenta_id, estado_nuevo |
| `comandero.item_agregado` | Backend | CuentasScreen, ComanderoScreen | cuenta_id, producto_id, nombre, cantidad, precio, pedido_total |
| `comandero.item_eliminado` | Backend | CuentasScreen, ComanderoScreen | cuenta_id, item_id, pedido_total |
| `comandero.item_actualizado` | Backend | CuentasScreen, ComanderoScreen | cuenta_id, item_id, cantidad_nueva, pedido_total |
| `pedido.enviado_cocina` | Backend | ComanderoScreen | cuenta_id |
| `cocina.item_preparando` | Cocina | CuentasScreen, ComanderoScreen, CocinaScreen | cuenta_id, item_id, nombre |
| `cocina.item_preparado` | Cocina | CuentasScreen, ComanderoScreen, CocinaScreen | cuenta_id, item_id, nombre |
| `cocina.pedido_listo` | Cocina | CuentasScreen | cuenta_id, pedido_id |
| `cobro.procesado` | Backend | CuentasScreen | cuenta_id |
| `cuenta.cerrada` | Backend | CuentasScreen | cuenta_id |

---

## 10 · Cómo expandir — Paso a Paso

### A. Nueva página POS

1. **Registrar en `project-pages.ts`** — añadir al `PAGE_CATALOG`
2. **Crear ruta** — `routes/[project_id]/mi-pagina/+page.svelte`
3. **Seed por tipo** — añadir al `SEED_BY_TYPE` correspondiente
4. **Crear store** — `stores/mi-pagina.ts` con el patrón MQTT
5. **Crear componentes** — en `components/mi-pagina/`

### B. Nueva acción en el comandero

1. Añadir botón en el array de `acciones` del `ComanderoScreen`
2. Crear handler en `handleAccionClick`
3. Si necesita UI, crear panel flotante
4. Conectar al backend vía `mqttRequest`

### C. Nuevo tipo de cuenta (canal)

1. Añadir tipo a `TipoCuenta` en `stores/cuentas.ts`
2. Añadir `color`, `icono`, `label`
3. Añadir al `TIPO_MAP`
4. Añadir botón en `CuentasScreen`
5. Backend: crear estrategia en `cuentas-canales/`

### D. Nuevo método de pago

1. Añadir a `metodosPago` en `CobroPanel.svelte`
2. Decidir auto-confirmar o confirmación externa
3. Backend: añadir método en módulo `cobros`

### E. Nueva skin para tipo de proyecto

1. Crear archivo de skin (ej: `stores/retail-skin.ts`)
2. En el layout de proyecto, detectar el tipo y aplicar la piel

---

## 11 · Verificación en Vivo

Siempre que construyas una pieza nueva de POS, verifica EN VIVO:

```
1. Abre la pantalla → ¿carga sin errores?
2. Crea una entidad → ¿responde el backend 200/201?
3. ¿El store refleja la respuesta correctamente?
4. ¿Los eventos fluyen a las otras pantallas?
5. ¿La coherencia multi-superficie funciona (abrir 2 pestañas)?
6. ¿El estado persiste tras recargar la página?
```

---

## 12 · Referencia rápida

```bash
# Crear store nuevo
cp stores/cuentas.ts stores/mi-store.ts  # y adaptar

# Crear componente pantalla
cp components/comandero/CuentasScreen.svelte components/mi-dominio/MiScreen.svelte

# Añadir ruta
mkdir -p routes/[project_id]/mi-pagina
# + crear +page.svelte (ver patrón en §5.1)

# Registrar en page-set (project-pages.ts)
# Registrar en store index (stores/index.ts)
# Registrar en component index (components/mi-dominio/index.ts)
```
