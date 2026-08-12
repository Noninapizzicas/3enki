---
name: enki-frontend-modulos
description: >-
  Estructura y patrones de los MÓDULOS UI del frontend de Enki (SvelteKit).
  Cómo el loader autodescubre módulos (manifest.json + index.ts vía
  import.meta.glob), el contrato UIModule/PanelComponent, el wrapper para
  paneles con props propias, el pitfall del store "activa" que nadie fija,
  y cómo verificar builds (strings visibles, no nombres minificados).
  Úsala antes de añadir cualquier componente/panel/módulo nuevo al frontend,
  o cuando la UI "no aparece" aunque el código esté desplegado.
when-to-use: >-
  El usuario dice "la UI no salta", "el panel no aparece", "el marco no se ve";
  antes de añadir un módulo/panel nuevo al frontend de Enki; cuando un
  componente compila pero no renderiza; cuando el build no incluye un archivo
  nuevo. Complementa a enki-arquitectura (backend) con la capa FRONTEND.
tags: [enki, frontend, svelte, sveltekit, modulos-ui, lazy-registry, build]
---

# Enki Frontend — estructura de los módulos UI

> El frontend de Enki es SvelteKit en `/frontend/`. Tiene un sistema de
> módulos UI con **autodescubrimiento** (igual que el backend con module.json
> + index.js). Un componente suelto en `src/lib/modules/` SIN manifest + index
> NO existe para el sistema — es el error que Paco intuía ("el frontend está
> poco documentado").

## 1. El autodescubrimiento: TODO módulo UI necesita manifest.json + index.ts

`frontend/src/lib/modules/loader.ts` escanea con `import.meta.glob`:

```ts
const manifests = import.meta.glob('./*/manifest.json', { eager: true, import: 'default' });
const moduleLoaders = import.meta.glob('./*/index.ts');   // lazy
```

**Consecuencia**: un módulo en `src/lib/modules/<nombre>/` que solo tenga
`.svelte` (sin `manifest.json` ni `index.ts`) **no se registra** — el loader
no lo conoce, el panel/loader que apunte a él falla silenciosamente, y el
sistema UI no puede montarlo. El `AgenteMarco.svelte` inyectado directo en
ChatArea funcionaba por el parche, pero el módulo no existía como entidad.

**Regla**: cualquier módulo UI nuevo = `manifest.json` + `index.ts` +
componentes. Los campos del manifest: `id`, `name`, `version`, `zone`
(`work-bar` | `system-bar` | `chat-config` | `chat-tools`), `order`, `icon`,
`label`, `universal?` (sobrevive al gate de page-set vacío).

## 2. El contrato UIModule y el wrapper de panel

`index.ts` exporta un `UIModule`:

```ts
export const miModulo: UIModule = {
  manifest: { id, name, version, zone, button: {...}, panels: [{ id, title, size }] },
  PanelComponent: MiPanel
};
```

**El contrato del sistema**: `PanelComponent` debe ser
`ComponentType<SvelteComponent<{ panelId: string }>>` — el sistema monta los
paneles pasándoles `panelId`. Si tu componente tiene props PROPIAS (ej.
`requestId` para una ruta), **no encaja en el tipo** → crea un wrapper delgado:

```svelte
<!-- MiPanelWrapper.svelte — el único prop es panelId (el contrato) -->
<script lang="ts">
  import MiComponente from './MiComponente.svelte';
  export let panelId: string;
</script>
<div data-mi-panel={panelId}><MiComponente /></div>
```

Errores de tipos típicos: `Type ... is not assignable to type
'ComponentType<SvelteComponent<{ panelId: string }>>'` → es el contrato del
panel, usa el wrapper. `panelId` sin usar → Svelte avisa; refiérelo en un
`data-*` del template.

## 3. El pitfall del store "activa que nadie fija" (UI que no renderiza)

**Síntoma**: el store recibe datos por MQTT (el map se llena) pero el
componente sin props no renderiza NADA. **Causa**: el handler acumula en un
`Map` pero nunca actualiza el selector derivado (`activaId` / `selected` /
`current*`) del que dependen los componentes pasivos.

Caso real: `agent_progress` hacía `ejecuciones.set(request_id, {...})` pero
`ejecucionActivaId` quedaba `null` para siempre → `getEjecucion(null)` →
`undefined` → `{#if}` false. La ruta con prop funcionaba; el componente sin
prop dependía de la activa que nadie fijaba.

**Regla**: el handler que RECIBE los datos fija el selector
(`abrirEjecucion(data.request_id)` — "la que progresa ES la activa").
**Nunca seleccionar con `''`** (apuntaba a una ejecución inexistente y
auto-saboteaba el componente). svelte-check NO detecta este bug (lógico, no
de tipos) — prueba en vivo disparando el evento del backend.

Detalle completo: `references/caso-agente-progreso.md`.

## 4. Builds y verificación (el "no aparece" más común)

- **`npm run build` usa el `.svelte-kit` existente** — un archivo FUENTE nuevo
  puede no entrar en el build aunque el fuente esté en `src/` y el build sea
  posterior. Fix: `rm -rf .svelte-kit node_modules/.vite && npm run build`
  (fuerza a SvelteKit a re-sincronizar). En prod (www-data, sudo): idem con
  sudo + `systemctl restart enki-frontend`.
- **El deploy (`vps-setup.sh`) reconstruye el frontend pero el rsync y el
  build corren en el mismo script** — el build puede ejecutarse con el árbol
  a medias. Verificar SIEMPRE el resultado en el bundle, no asumir.
- **Verificar por STRINGS VISIBLES, no por nombres de componente**: el build
  minifica los nombres de clase/componente (`AgenteMarco` no aparece como
  tal), pero los textos de UI sí (`'Esperando al agente'`). `grep -rl "texto
  visible" build/` es la verificación fiable; `grep AgenteMarco` da falsos
  negativos.
- **El chat LLM de Enki NO ve `/opt/enki/modules/`** (su filesystem está
  scopeado al storage del proyecto) — cuando diga "no construyó nada" y el
  gate/fs directo sí ve el módulo, el sistema manda (lección verificada dos
  veces: fase 4 de "b" y "c").

## Verificación rápida

```bash
# ¿El módulo UI está en el build (texto visible, no nombre de clase)?
grep -rl "texto visible del componente" /opt/enki/frontend/build/ | head -1
# ¿El loader lo descubriría? (ambos deben existir)
ls /opt/enki/frontend/src/lib/modules/<modulo>/{manifest.json,index.ts}
# ¿El build está fresco respecto al fuente?
stat -c '%y' /opt/enki/frontend/build/server/index.js /opt/enki/frontend/src/lib/modules/<modulo>/index.ts
# Rebuild forzado (prod, necesita sudo):
cd /opt/enki/frontend && sudo rm -rf .svelte-kit node_modules/.vite && sudo npm run build && sudo systemctl restart enki-frontend
```
