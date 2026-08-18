---
name: construir-interfaz
description: "FASE 7 del proceso de proyecto: construye la interfaz OPERATIVA de un módulo cuya interfaz ya fue decidida (FASE 6). Genera el trío real del frontend de Enki — store MQTT (refleja el backend), Panel Svelte (vista + operaciones vía mqttRequest), UIModule (manifest.json + index.ts, autodescubierto por el loader) — conectado al bus, no mockups. La decisión F6 (workspace_module · chat_tool · inline_render · system_panel · ninguna) dicta la zona y el contenido."
when-to-use: "Entra encadenada por proceso-negocio tras negocio.interfaz (FASE 7 por pieza) o a mano para construir/reconstruir la interfaz de un módulo: dado module.json con ui_handlers tipados (o ui_decision.necesita=false → NO construir, cerrar fase directo), generar los archivos frontend que operan ese módulo. Ante una interfaz rota o inexistente (módulo tipado sin panel en frontend), aplicarla para generar la superficie real."
fuente: enki
dominio: ui
lente_dominio: frontend
lente_tarea: construir-interfaz
tags: [fase7, interfaz, ui, svelte, store, mqtt, panel, workspace_module, system_panel, chat_tool, inline_render, operativo]
---

# Construir Interfaz — FASE 7 del proceso de proyecto

> El eslabón que faltaba: F0 identidad → F1/2 esquematizar → F3 planificar →
> F4 construir → F5 skills → F6 decidir interfaz → **F7 construir la interfaz
> operativa**. La decisión de la FASE 6 se convierte en código real del
> frontend — un panel que opera el módulo por el bus, no un mockup.
>
> Código: fase 7 de proceso · habilita `negocio.interfaz_construida`.

---

## 1 · El problema que resuelve

La FASE 6 decide el tipo de superficie (`workspace_module` · `chat_tool` ·
`inline_render` · `system_panel` · ninguna) y la FASE 6½ la esquematiza (prisma
de 5 huecos → la SPEC: vistas, operaciones, datos, eventos, zona). La FASE 7
**CONSUME esa spec** y genera los archivos reales del frontend:

```
frontend/src/lib/modules/<slug>/
├── manifest.json      → autodescubrimiento (id, zone, icon, label, order)
├── index.ts           → UIModule (manifest + PanelComponent)
├── <Slug>Panel.svelte → la vista: lista + operaciones vía mqttRequest
└── (store)            → frontend/src/lib/stores/<dominio>.ts — refleja el backend
```

**Lección en vivo (error grave corregido)**: intentamos construir la interfaz
directo tras la F6, sin esquematizar — el generador habría improvisado un panel
sin anatomía. La FASE 6½ nació de eso: sin `esquemas/interfaz-<slug>/esquema.md`
(la spec) NO se construye. El gate del orquestador lo exige.

## 1b · El sujeto NO se pregunta — la SPEC se lee

```
esquema.md de la interfaz = esquemas/interfaz-<slug>/esquema.md (FASE 6½)
entrada complementaria = module.json del módulo (ui_handlers tipados + tools)
```

**REGLA DIRECTIVA**: lee la spec ANTES de generar nada. Cada pieza del esquema
(vista · operación · dato · evento) → su archivo. Nada fuera de la spec. Si la
spec no existe → la fase NO puede ejecutarse: avisa que falta la FASE 6½.

## 2 · El mapeo FASE 6 → FASE 7 (la zona dicta el contenido)

| Decisión F6 (type) | Zona UI real | Contenido del panel |
|---|---|---|
| `workspace_module` | `work-bar` | Área de trabajo: lista + CRUD/flujo del dominio |
| `system_panel` | `system-bar` | Gestión: estado, acciones bajo demanda, métricas |
| `chat_tool` | `chat-tools` | Operación puntual: botón/acción que llama al tool |
| `inline_render` | (sin botón; se renderiza en el chat) | Componente que aparece en el flujo |
| `ui_decision.necesita=false` | — | **NO construir** — cerrar fase directo |

## 2b · LOS ESTÁNDARES — la F7 construye CONFORME a ellos (obligatorio)

La F7 NO inventa estilo: genera cada pieza según el estándar que ya existe en
el repo. Antes de generar NADA, carga y sigue estas fuentes:

| Pieza | Estándar obligatorio | Dónde vive |
|---|---|---|
| Store MQTT | Skill `ui-store-mqtt` (patrón fundacional: 1 writable + derivados + acciones que reflejan + suscripciones + reset) | `modules/cosecha/cantera/interfaces/patrones-fundacionales/ui-store-mqtt/` |
| Trío del módulo (manifest.json + index.ts + Panel.svelte) | Caso vivo `contenido` (el patrón real que el loader autodescubre) | `frontend/src/lib/modules/contenido/` |
| Zonas del frame | Contrato `frontend.contract` (tipos canónicos ↔ zonas UI) | `arquitectura/decisiones/_contratos/frontend.contract.json` |
| **RUTAS WEB del manifest** (`routes`) | **Patrón de direcciones web del frame**: deep-links reales de `frontend/src/routes/` (scopeados `/[project_id]/<pagina>` o planos `/chat`) donde el módulo es visible | `frontend/src/routes/` + `PAGE_CATALOG` en `frontend/src/lib/ui-core/project-pages.ts` |
| Lenguaje visual | CSS del frame (variables `var(--color-*)`, paneles existentes) | `frontend/src/lib/` (componentes vivos) |
| Llamadas al backend | `mqttRequest(dominio, accion, { project_id })` | `frontend/src/lib/ui-core/mqtt-request.ts` |

**Regla de RUTAS WEB**: el campo `routes` del manifest.json (cuándo el botón del
módulo es visible) usa SOLO direcciones web que YA existen en el frame —
deep-links de `frontend/src/routes/` (p.ej. `/comandero`, `/carta-digital`,
`/facturas`) o páginas del `PAGE_CATALOG`. NUNCA se inventa una URL nueva: si el
módulo vive en una página que no existe, esa página se crea aparte siguiendo el
patrón `/[project_id]/<pagina>/` — no se inventa dentro del manifest.

**Regla**: si la pieza que vas a generar tiene un estándar en esa tabla, lo
sigues TAL CUAL. Nada de "mejorar" el patrón, nada de variantes propias, nada
de estilos inventados. El estándar manda; la spec (F6½) manda sobre el CONTENIDO;
el estándar manda sobre la FORMA de cada archivo.

### 2c · EXCEPCIÓN DOCUMENTADA — el trío de la F7 es MULTI-ARCHIVO

El patrón del repo es UN entregable = UN path (como esquema.md, plan-construccion.md,
SKILL.md). La F7 es la **única excepción declarada**: un panel operativo del
frontend ES 3-4 archivos físicos inseparables (manifest.json + index.ts +
<Slug>Panel.svelte + store). No se puede aplanar en uno — el loader
`import.meta.glob` necesita manifest.json, el frame necesita index.ts, Svelte
necesita el .svelte.

Por eso el pipeline de la F7 declara `dir` + `archivos[]` (el motor lo soporta
como excepción multi-archivo, con veredicto `multi_archivo` del JEFE). Cualquier
fase FUTURA que genere N archivos debe justificar la excepción como esta: el
artefacto ES múltiple por naturaleza, no por comodidad.

## 3 · EL MANDATO — el trío operativo, mecánico

1. **Lee la SPEC** `esquemas/interfaz-<slug>.md` (FASE 6½, UN archivo): vistas,
   operaciones del module.json, datos, eventos, zona/tipo. **Si no existe → no
   construyas: avisa que falta la FASE 6½** (el gate del orquestador la exige).
2. **Lee** el `module.json` del módulo (ui_handlers tipados de la FASE 6) como
   complemento — tools para los nombres exactos de operación.
3. **Si `ui_decision.necesita=false`** → no hay nada que construir: cierra la
   fase con `proceso-negocio.completar_fase { fase: 'interfaz_construida' }`.
4. **Genera el STORE MQTT** en `frontend/src/lib/stores/<dominio>.ts`
   siguiendo el patrón fundacional `ui-store-mqtt`:
   - `writable` de estado (items, selected, loading, saving, error)
   - derivados readonly para el componente
   - acciones que llaman `mqttRequest(dominio, accion, { project_id })` y
     reflejan la respuesta en el writable (retornan `{success, error}`)
   - suscripciones a los eventos de la SPEC (initSubscriptions)
   - reset al salir
5. **Genera el PANEL SVELTE** `<slug>/<Slug>Panel.svelte` (naming exacto:
   el slug en camelCase — cada palabra del kebab capitalizada y unida (ej:
   'interfaz-dinamico' → 'InterfazDinamicoPanel.svelte', 'device-health' →
   'DeviceHealthPanel.svelte'; la capitalización solo de la 1ª letra rompe
   los slugs multi-palabra):
   - `onMount` → load + initSubscriptions · `onDestroy` → cleanup
   - CADA VISTA de la spec → su sección en el panel (lista, detalle, stats, flujo)
   - CADA operación de la spec → su botón que llama a la acción del store
   - estados loading/error visibles
   - mismo lenguaje visual que los paneles existentes (variables CSS del frame)
6. **Genera el UIMODULE**: `manifest.json` (id, name, version, zone según el
   mapeo, order, icon, label) + `index.ts` (UIModule con manifest + PanelComponent).
   **El manifest.json lleva `routes`** — las direcciones web del frame donde el
   módulo es visible (deep-links reales de `frontend/src/routes/`: `/comandero`,
   `/carta-digital`, `/facturas`… o páginas del PAGE_CATALOG). NUNCA URL inventada.
7. **Verifica** que el loader lo autodescubre: el patrón es
   `import.meta.glob('./*/manifest.json')` — el archivo en la carpeta correcta
   es suficiente, no hay registro manual que tocar.
8. Cierra la fase: `proceso-negocio.completar_fase { fase: 'interfaz_construida', resumen: { modulos: ["<slug>"], archivos: [...] } }`.

**NO pares a mitad**: un módulo con interfaz decidida sin panel es deuda.
**NO generes mockups**: cada operación del panel llama al tool real del
module.json vía mqttRequest. **NO toques el registro manual** (panels.ts es
legacy; el loader autodescubre). **NO construyas si F6 dijo sin interfaz**.
**NO improvises fuera de la spec** — cada pieza del esquema F6½ → su archivo;
lo que no está en la spec es pregunta abierta, no invención.
## 4 · Caso testigo — contenido (el trío real que ya existe)

`frontend/src/lib/modules/contenido/` es el patrón vivo a imitar:
- `manifest.json`: { id, name, zone: 'work-bar', order, routes, icon, label }
- `index.ts`: UIModule con manifest (button → action panel) + PanelComponent
- `ContenidoPanel.svelte`: onMount carga + suscribe, botones llaman a las
  acciones del store, estados busy/error, CSS con variables del frame
- store `frontend/src/lib/stores/contenido.ts`: mqttRequest + suscripciones

La skill `ui-store-mqtt` (patrones-fundacionales) documenta el store con el
esqueleto exacto: 1 writable + N derivados + acciones que reflejan + suscripciones.

## 5 · Verificación

- El módulo tiene sus 4 archivos en `frontend/src/lib/modules/<slug>/` (manifest.json, index.ts, Panel.svelte) y su store en `frontend/src/lib/stores/`.
- Cada operación del panel corresponde a un tool REAL del module.json (grep de names).
- `manifest.json.zone` coincide con el mapeo F6→F7 (workspace_module→work-bar, system_panel→system-bar, chat_tool→chat-tools).
- El frontend BUILDEA (npm run build) — el panel no rompe el frame.
- Si F6 dijo `necesita=false`: fase cerrada sin archivos generados.
- Señal enviada: `proceso-negocio.completar_fase { fase: 'interfaz_construida' }` → 200.

## 6 · Errores a evitar

- **Construir sin FASE 6** — sin ui_handlers tipados no hay zona que mapear; la F6 primero.
- **Mockups en vez de operación** — el panel debe llamar a los tools reales (mqttRequest), no mostrar datos falsos.
- **Zona equivocada** — workspace_module NO va a system-bar; el mapeo es fijo.
- **Tocar panels.ts o definitions.ts** — el loader autodescubre por manifest.json; registro manual = drift.
- **Construir cuando F6 dijo sin interfaz** — ui_decision.necesita=false es la orden de no construir.
- **Olvidar el store** — el panel sin store MQTT es una vista muerta; el reflejo del backend es la mitad del trío.
