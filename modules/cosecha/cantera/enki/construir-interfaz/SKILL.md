---
name: construir-interfaz
description: "FASE 7 del proceso de proyecto: materializa la interfaz de un módulo cuya interfaz fue decidida (FASE 6) y declarada en el blueprint (FASE 6½). Genera el ENVOLTORIO MÍNIMO del frontend de Enki — trío manifest.json + index.ts + <Slug>Panel.svelte (~10 líneas) que importa el blueprint del módulo y entrega <BlueprintForm blueprint moduleId />. El generador schema→UI (BlueprintForm, 4 zonas) renderiza el panel desde la sección ui.* del blueprint; sin store a mano, sin panel artesanal. La decisión F6 (workspace_module · chat_tool · inline_render · system_panel · ninguna) dicta la zona y el contenido."
when-to-use: "Entra encadenada por proceso-negocio tras negocio.interfaz_esquematizada (FASE 7 por pieza) o a mano para construir/reconstruir la interfaz de un módulo: dado el blueprint con ui.* declarada (o default del generador verificado en F6½), generar el envoltorio mínimo que el loader autodescubre. Ante una interfaz rota o inexistente (módulo tipado sin panel en frontend), aplicarla para generar la superficie real. Si ui_decision.necesita=false → NO construir, cerrar fase directo."
fuente: enki
dominio: ui
lente_dominio: frontend
lente_tarea: construir-interfaz
tags: [fase7, interfaz, ui, svelte, envoltorio, blueprint, blueprintform, generador, manifest, workspace_module, system_panel, chat_tool, inline_render, operativo]
---

# Construir Interfaz — FASE 7 del proceso de proyecto

> El eslabón final de la cadena: F0 identidad → F1/2 esquematizar → F3 planificar →
> F4 construir → F5 skills → F6 decidir interfaz → F6½ declarar ui.* →
> **F7 envoltorio mínimo**. El generador schema→UI (BlueprintForm, 4 zonas —
> build verde, PR #266) renderiza el panel desde el blueprint; la F7 solo lo
> ENVUELVE para que el loader lo autodescubra.
>
> Código: fase 7 de proceso · habilita `negocio.interfaz_construida`.

---

## 1 · El problema que resuelve

La FASE 6 decide el tipo de superficie (`workspace_module` · `chat_tool` ·
`inline_render` · `system_panel` · ninguna) y la FASE 6½ la declara en el
blueprint del módulo (sección `ui.*`: operaciones a exponer, datos a mostrar)
o verifica que el generador con defaults la cubre. La FASE 7 materializa el
trío real del frontend:

```
frontend/src/lib/modules/<slug>/
├── manifest.json           → autodescubrimiento (id, zone, icon, label, order, routes)
├── index.ts                → UIModule (manifest + PanelComponent)
└── <Slug>Panel.svelte      → ENVOLTORIO (~10 líneas): importa el blueprint y entrega
                              <BlueprintForm blueprint={blueprint} moduleId="<slug>" />
```

**Qué NO se genera ya**: el store MQTT (`mqtt-store-<slug>.ts` + suscripciones
manuales) y el panel artesanal de 400 líneas (vistas, botones, CSS del frame).
BlueprintForm hace `mqttRequest` directo por operación y renderiza las 4 zonas
(formulario/acciones/estados vivos/datos) desde el blueprint. El envoltorio es
la ÚNICA pieza a mano — y es mecánica.

## 1b · El sujeto NO se pregunta — el blueprint se lee

```
entrada = <slug>.blueprint.json del módulo (FASE 6½)
          → sección ui.* declarada (ui.ops · ui.datos) O default del generador verificado
entrada complementaria = module.json del módulo (ui_handlers tipados de la FASE 6)
```

**REGLA DIRECTIVA**: lee el blueprint ANTES de generar nada. Si la FASE 6½ no
dejó ni `ui.*` ni `modo: default_generador` → la fase NO puede ejecutarse:
avisa que falta la FASE 6½. Nada fuera de lo declarado.

## 2 · El mapeo FASE 6 → FASE 7 (la zona dicta el manifest)

| Decisión F6 (type) | Zona UI real | Contenido del panel |
|---|---|---|
| `workspace_module` | `work-bar` | Área de trabajo: el generador renderiza el CRUD/flujo del dominio |
| `system_panel` | `system-bar` | Gestión: estado, acciones bajo demanda, métricas |
| `chat_tool` | `chat-tools` | Operación puntual: botón/acción que llama al tool |
| `inline_render` | (sin botón; se renderiza en el chat) | Componente que aparece en el flujo |
| `ui_decision.necesita=false` | — | **NO construir** — cerrar fase directo |

## 2b · LOS ESTÁNDARES — la F7 construye CONFORME a ellos (obligatorio)

La F7 NO inventa estilo: genera cada pieza según el estándar que ya existe en
el repo. Antes de generar NADA, carga y sigue estas fuentes:

| Pieza | Estándar obligatorio | Dónde vive |
|---|---|---|
| ENVOLTORIO (trío manifest.json + index.ts + Panel.svelte) | **Caso vivo `interfaz-dinamico` (el dogfood del generador — patrón exacto a copiar)** | `frontend/src/lib/modules/interfaz-dinamico/` |
| Componente generador | `BlueprintForm` (4 zonas: formulario/acciones/estados vivos/datos) | `frontend/src/lib/components/blueprint-form/BlueprintForm.svelte` |
| Derivación de zonas | `blueprint-zones.ts` (determinista, sin LLM — deriveZones desde ui.*/contrato/eventos) | `frontend/src/lib/components/blueprint-form/blueprint-zones.ts` |
| Zonas del frame | Contrato `frontend.contract` (tipos canónicos ↔ zonas UI) | `arquitectura/decisiones/_contratos/frontend.contract.json` |
| **RUTAS WEB del manifest** (`routes`) | **Patrón de direcciones web del frame**: deep-links reales de `frontend/src/routes/` (scopeados `/[project_id]/<pagina>` o planos `/chat`) donde el módulo es visible | `frontend/src/routes/` + `PAGE_CATALOG` en `frontend/src/lib/ui-core/project-pages.ts` |
| Llamadas al backend | `mqttRequest(dominio, accion, { project_id })` — lo hace BlueprintForm internamente, el envoltorio NO llama | `frontend/src/lib/ui-core/mqtt-request.ts` |

**Regla de RUTAS WEB**: el campo `routes` del manifest.json (cuándo el botón
del módulo es visible) usa SOLO direcciones web que YA existen en el frame —
deep-links de `frontend/src/routes/` (p.ej. `/comandero`, `/carta-digital`,
`/facturas`) o páginas del `PAGE_CATALOG`. NUNCA se inventa una URL nueva: si
el módulo vive en una página que no existe, esa página se crea aparte siguiendo
el patrón `/[project_id]/<pagina>/` — no se inventa dentro del manifest.

**Regla**: si la pieza que vas a generar tiene un estándar en esa tabla, lo
sigues TAL CUAL. Nada de "mejorar" el patrón, nada de variantes propias, nada
de estilos inventados. El estándar manda; el blueprint (F6½) manda sobre el
CONTENIDO; el estándar manda sobre la FORMA de cada archivo.

### 2c · EXCEPCIÓN DOCUMENTADA — el trío de la F7 es MULTI-ARCHIVO

El patrón del repo es UN entregable = UN path (como esquema.md, plan-construccion.md,
SKILL.md). La F7 es la **única excepción declarada**: un módulo del frontend ES
3 archivos físicos inseparables (manifest.json + index.ts + <Slug>Panel.svelte).
No se puede aplanar en uno — el loader `import.meta.glob` necesita manifest.json,
el frame necesita index.ts, Svelte necesita el .svelte.

Por eso el pipeline de la F7 declara `dir` + `archivos[]` (el motor lo soporta
como excepción multi-archivo, con veredicto `multi_archivo` del JEFE). Cualquier
fase FUTURA que genere N archivos debe justificar la excepción como esta: el
artefacto ES múltiple por naturaleza, no por comodidad.

## 3 · EL MANDATO — el envoltorio mínimo, mecánico

1. **Lee el blueprint** `<slug>.blueprint.json` (FASE 6½): sección `ui.*`
   (`ui.ops` · `ui.datos`) o `modo: default_generador` verificado. **Si no hay
   ni lo uno ni lo otro → no construyas: avisa que falta la FASE 6½** (el gate
   del orquestador la exige).
2. **Lee** el `module.json` del módulo (ui_handlers tipados de la FASE 6) como
   complemento — el type decide la zona del manifest.
3. **Si `ui_decision.necesita=false`** → no hay nada que construir: cierra la
   fase con `proceso-negocio.completar_fase { fase: 'interfaz_construida' }`.
4. **Genera el ENVOLTORIO** en `frontend/src/lib/modules/<slug>/` copiando el
   patrón de `interfaz-dinamico/` (el dogfood) TAL CUAL:
   - `manifest.json`: id = slug, name = slug, version, zone según el mapeo
     (2), order, icon, label = label del módulo, routes = deep-links reales
     del frame. NUNCA URL inventada.
   - `index.ts`: UIModule con manifest + PanelComponent (el import del .svelte).
   - `<Slug>Panel.svelte` (~10 líneas, naming exacto: el slug en camelCase —
     cada palabra del kebab capitalizada y unida (ej: 'interfaz-dinamico' →
     'InterfazDinamicoPanel.svelte'; la capitalización solo de la 1ª letra
     rompe los slugs multi-palabra)):
     ```svelte
     <script lang="ts">
       import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
       import blueprint from './<slug>.blueprint.json';
     </script>
     <BlueprintForm blueprint={blueprint} moduleId="<slug>" />
     ```
     Si la F6½ dejó anexo para la **zona 5 (custom slot)** — el caso raro no
     derivable (ficha formateada, filtros, flujo especial) — se añade dentro
     del envoltorio con `<svelte:fragment slot="custom">…</svelte:fragment>`.
     El 90% sale del dinámico; lo custom se añade SIN reescribir el panel.
5. **NO generes store MQTT** (`frontend/src/lib/stores/<dominio>.ts`): el
   BlueprintForm hace `mqttRequest(moduleId, op, { project_id })` directo por
   operación y suscribe a los eventos que el blueprint declara. El store a mano
   es deuda del mundo artesanal.
6. **Verifica** que el loader lo autodescubre: el patrón es
   `import.meta.glob('./*/manifest.json')` — el archivo en la carpeta correcta
   es suficiente, no hay registro manual que tocar.
7. **Permisos**: los archivos generados en `frontend/` deben ser legibles por
   www-data (el build corre como www-data): `chmod 644` archivos / `755`
   directorios (o `chown www-data:www-data`). El sandbox crea 600 por defecto
   y eso rompe el build — la lección del interfaz-dinamico.
8. Cierra la fase: `proceso-negocio.completar_fase { fase: 'interfaz_construida',
   resumen: { modulos: ["<slug>"], archivos: ["manifest.json","index.ts","<Slug>Panel.svelte"] } }`.

**NO pares a mitad**: un módulo con interfaz decidida sin envoltorio es deuda.
**NO generes mockups**: BlueprintForm llama al tool real del module.json vía
mqttRequest. **NO toques el registro manual** (panels.ts es legacy; el loader
autodescubre). **NO construyas si F6 dijo sin interfaz**. **NO improvises fuera
del blueprint** — lo que no está declarado en ui.* es pregunta abierta, no
invención. **NO escribas el store a mano** — el generador lo hace.

## 4 · Caso testigo — interfaz-dinamico (el dogfood del generador)

`frontend/src/lib/modules/interfaz-dinamico/` es el patrón vivo a copiar:
- `manifest.json`: { id, name, zone: 'work-bar', order, routes, icon, label }
- `index.ts`: UIModule con manifest + PanelComponent (13 líneas)
- `InterfazDinamicoPanel.svelte`: envoltorio mínimo (~13 líneas) que importa
  el blueprint y entrega `<BlueprintForm blueprint moduleId="interfaz" />`
- El blueprint `interfaz.blueprint.json` (fuera del trío, en el módulo backend)
  lleva la sección `ui.*` — el input del generador. El build verde (21s, PR #266)
  y el panel "Radar-auto" en producción son la prueba de que el gate acepta
  este entregable como F7 completa.

La cadena de referencia completa (F6 → F6½ → F7 con el generador) está en
`modules/cosecha/cantera/enki/fases-interfaz-f6-f7.md`.

## 5 · Verificación

- El blueprint del módulo tiene `ui.*` o `modo: default_generador` (F6½ hecha).
- Trío generado en `frontend/src/lib/modules/<slug>/`: manifest.json + index.ts
  + <Slug>Panel.svelte (envoltorio, no panel artesanal).
- El Panel.svelte contiene `<BlueprintForm` y `moduleId="<slug>"` — y NO
  contiene store manual (cero `$lib/stores/` importado).
- Permisos: archivos 644 (o 664), dirs 755 — legibles por www-data.
- Build del frontend pasa: `sudo -u www-data npm run build` → '✔ done'.
- El gate del proceso acepta el envoltorio como F7 completa (el dogfood
  interfaz-dinamico lo demostró).
- Señal de fase enviada: `proceso-negocio.completar_fase { fase: 'interfaz_construida' }` → 200 (no 409).

## 6 · Errores a evitar

- **Construir el panel artesanal (vistas + CSS + 400 líneas) cuando el
  envoltorio basta** — el generador renderiza desde el blueprint; el panel a
  mano es deuda.
- **Escribir el store MQTT a mano** — BlueprintForm hace mqttRequest directo;
  el store del mundo artesanal ya no se genera.
- **Generar el trío sin pasar por F6½** — sin ui.* (o default verificado), el
  generador no sabe qué exponer; el gate lo exige.
- **Obligar a migrar módulos con panel manual ya construido** — los que YA
  tienen trío artesanal quedan como están; el envoltorio es el camino para los
  NUEVOS (o para replantear una interfaz mala).
- **Inventar URL en `routes`** — solo deep-links reales del frame; si la página
  no existe, se crea aparte, no se inventa en el manifest.
- **Dejar permisos 600** — www-data corre el build; 644/755 o chown
  www-data:www-data, o el build cae (lección interfaz-dinamico, 2026-08).
- **NO construyas si F6 dijo sin interfaz** — cerrar fase directo.
