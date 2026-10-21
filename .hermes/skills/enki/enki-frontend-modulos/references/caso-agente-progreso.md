# Caso real: el marco del agente que "no saltaba" (agosto 2026)

## Síntoma (Paco)
"Con el agente no salta su UI" — al lanzar un agente desde el chat, no aparecía
el marco/desplegable de progreso. Antes había pedido exactamente eso: "con que
se que como marco o desplegable y se actualice con la información que devuelva
el agente".

## El diagnóstico en capas (orden real del debug)

1. **Primera sospecha: el build.** `grep -rl AgenteMarco /opt/enki/frontend/build/`
   → NO. Pero `grep -rl "Esperando al agente"` (texto visible del componente)
   → SÍ. **Falso negativo del grep por minificación** — el componente SÍ estaba
   compilado. Lección: verificar por strings visibles, nunca por nombre de clase.

2. **Segunda sospecha: el puente backend.** ¿chat-io publica
   `conversation/{id}/agent_progress`? Verificado: `_publishAgentTopic` existe
   y publica el topic correcto. El backend estaba bien (framework →
   `agent.execute.progress` → chat-io → MQTT).

3. **El error REAL: el store.** `agente-progreso.ts`:
   - `agent_progress` → `ejecuciones.set(request_id, {...})` ✓ acumula
   - PERO **nunca llamaba `abrirEjecucion(request_id)`** → `ejecucionActivaId`
     quedaba `null` para siempre
   - `AgenteMarco` (sin prop) leía `getEjecucion($ejecucionActivaId)` → null
     → undefined → `{#if ejecucion}` false → **no renderizaba NADA**
   - Agravante: el `onMount` hacía `abrirEjecucion('')` cuando no había activa
     → apuntaba a una ejecución INEXISTENTE (string vacío) → auto-sabotaje
     permanente.

## El fix (2 líneas + limpieza)

```ts
// store agente-progreso.ts — en el handler de agent_progress:
abrirEjecucion(data.request_id);   // la ejecución que progresa ES la activa

// AgenteMarco.svelte — fuera el auto-sabotaje del onMount:
// (eliminado: if (!get(ejecucionActivaId)) abrirEjecucion(''))
```

## El hallazgo estructural (el que Paco intuyó)

Tras el fix lógico, Paco dijo: "analiza la estructura de los módulos ui".
Y tenía razón — el error de fondo era de PATRÓN:

- El frontend autodescubre módulos: `modules/loader.ts` con
  `import.meta.glob('./*/manifest.json')` + `import.meta.glob('./*/index.ts')`
- `agente-progreso/` solo tenía `.svelte` — **sin manifest.json ni index.ts**
  → el loader NO lo registraba → el sistema UI no lo conocía como entidad
  → el panel `'agente'` de `panels.ts` apuntaba a un loader inexistente
- El `AgenteMarco` directo en ChatArea funcionaba solo por el parche

## El fix estructural

1. `manifest.json` (id `agente-progreso`, zone `system-bar`, icon 🗺️)
2. `index.ts` (`UIModule` con `PanelComponent` + botón + panel)
3. `AgenteProgresoPanel.svelte` — wrapper de panel: el sistema exige
   `ComponentType<SvelteComponent<{panelId: string}>>`; AgenteProgreso tiene
   `requestId` (prop de ruta) → el wrapper adapta el contrato
   (`export let panelId: string;` + `<div data-agente-panel={panelId}>`).

## Errores de tipos encontrados (Svelte 5 / svelte-check)

```
Type '__sveltets_2_IsomorphicComponent<{ requestId?: ... }>' is not assignable
to type 'ComponentType<SvelteComponent<{ panelId: string }>>'
```
→ el PanelComponent debe tener SOLO `panelId` como prop; props propias
(`requestId`) rompen la asignación. Solución: wrapper delgado.

```
Warn: Component has unused export property 'panelId'
```
→ `export let panelId: string` sin usar en el template → warning. Referéncialo
en un `data-*` o úsalo.

## Notas de verificación final

- svelte-check: 0 errores en el módulo (pero el bug del store NO lo detecta —
  es lógico, no de tipos)
- `npm run build` local limpio (18.7s)
- `grep -rl agente-progreso build/client/` → SÍ (el glob lo descubrió)
- El servicio de prod sirve `node build/index.js` — un build nuevo necesita
  restart del servicio para servirse
