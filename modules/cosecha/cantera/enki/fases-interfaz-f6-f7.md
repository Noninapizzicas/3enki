# Cadena de interfaz con el generador schema→UI — F6 → F6½ → F7

> Documento de referencia de la cadena adaptada (2026-08). El generador
> (BlueprintForm, 4 zonas — build verde, PR #266) renderiza CUALQUIER módulo
> desde su blueprint con la sección `ui.*`. El panel artesanal deja de ser el
> camino: la cadena ahora produce **declaración** (ui.*) + **envoltorio mínimo**.
> Skills que la implementan: `decidir-interfaz` (F6) · `esquematizar-interfaz`
> (F6½) · `construir-interfaz` (F7).

---

## 1 · El mapa de la cadena (entregables, no fases rituales)

| Fase | Pregunta | Entregable | Coste |
|---|---|---|---|
| **F6** decidir-interfaz | ¿El módulo necesita interfaz? ¿qué tipo? | `ui_handlers` tipados en module.json (type + zone canónicos) | Decisión por ROL — y ahora decir SÍ es BARATO (el generador construye) |
| **F6½** esquematizar-interfaz | ¿Qué expone el módulo a la pantalla? | Sección `ui.*` EN el blueprint (`ui.ops` + `ui.datos`) — o salto de fase si el generador con defaults cubre | Declaración, no diseño |
| **F7** construir-interfaz | ¿Cómo se materializa? | **Envoltorio mínimo**: manifest.json + index.ts + `<Slug>Panel.svelte` (~10 líneas con `<BlueprintForm blueprint moduleId />`) | Mecánico — copiar el dogfood |

**Regla del dueño**: los módulos que YA tienen panel manual construido quedan
como están (no se migran). El envoltorio es el camino para los NUEVOS — o para
replantear una interfaz mala.

## 2 · F6 — decidir-interfaz (sin cambios de forma, con el coste resuelto)

El script `decidir-interfaz.js` decide por señales (tools de lectura/escritura →
SÍ; puente interno/observador → NO); el LLM razona el rol. **Lo nuevo**: la
nota en la skill — decidir SÍ ya no compromete a un panel artesanal, compromete
a declarar `ui.*` (F6½) y al envoltorio (F7). La decisión se toma por ROL, no
por miedo al coste.

Los 4 tipos canónicos siguen igual: `workspace_module` (work-bar) ·
`system_panel` (system-bar) · `chat_tool` (chat-tools) · `inline_render`
(área del chat). La zona dicta el manifest en F7.

## 3 · F6½ — esquematizar-interfaz (EL CAMBIO: spec .md → ui.* en blueprint)

**Antes**: prisma de 5 huecos + disección → SPEC en `esquemas/interfaz-<slug>.md`
(artefacto aparte) → F7 construía el panel a mano desde esa spec.

**Ahora**:

```
1. Lee el blueprint: transporte.rpc · operaciones · eventos_que_escucho · transporte.salida
2. ¿El generador con defaults cubre?   (args simples: string→input, int→number,
   enum→select, bool→checkbox, json→textarea, kv→clave/valor; eventos visibles;
   salidas tabulables)
   ├─ SÍ  → fase en modo default_generador. CERO spec. Se cierra.
   └─ NO  → escribe la sección ui.* EN el blueprint (no en un .md aparte):
            ui.ops   → operaciones a exponer (omitir/etiqueta/zona formulario|acciones)
            ui.datos → lecturas a mostrar en tablas (Z4), con refresh_on
            (opcional ui.etiquetas / ui.zonas)
3. Caso raro (args no derivables, lógica que el generador no cubre):
   prisma + disección SOLO sobre esa parte → anexo breve para la zona 5
   (custom slot) de F7. El resto sigue siendo ui.*.
```

**Qué NO se declara**: lo que el generador deriva solo — Z1 formulario desde
operaciones con args, Z2 acciones desde ops sin args, Z3 estados vivos desde
eventos_que_escucho, Z4 datos desde transporte.salida/ui.datos. Declararlo es
ruido.

## 4 · F7 — construir-interfaz (EL CAMBIO: panel artesanal → envoltorio)

**Antes**: store MQTT (`mqtt-store-<slug>.ts` + suscripciones) + panel Svelte de
400 líneas (vistas + operaciones + CSS del frame) + manifest.

**Ahora** — el trío mínimo, copiando `frontend/src/lib/modules/interfaz-dinamico/`
(el dogfood) TAL CUAL:

```
frontend/src/lib/modules/<slug>/
├── manifest.json       → { id, name, zone (del tipo F6), order, icon, label,
│                          routes (deep-links REALES del frame, nunca URL inventada) }
├── index.ts            → UIModule (manifest + PanelComponent)
└── <Slug>Panel.svelte  → envoltorio:
    <script lang="ts">
      import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
      import blueprint from './<slug>.blueprint.json';
    </script>
    <BlueprintForm blueprint={blueprint} moduleId="<slug>" />
```

- **SIN store**: BlueprintForm hace `mqttRequest(moduleId, op, { project_id })`
  directo y suscribe a los eventos que el blueprint declara.
- **Zona 5 (custom slot)**: el caso raro no derivable (ficha formateada,
  filtros, flujo especial) se añade con `<svelte:fragment slot="custom">…`
  DENTRO del envoltorio — sin reescribir el panel.
- **Permisos**: 644 archivos / 755 dirs (o chown www-data:www-data) — www-data
  corre el build; 600 rompe el build (lección interfaz-dinamico, 2026-08).
- **Verificación**: build del frontend (`sudo -u www-data npm run build` →
  '✔ done') + gate del proceso acepta el envoltorio como F7 completa.

## 5 · El patrón de referencia (dogfood)

`frontend/src/lib/modules/interfaz-dinamico/` — el envoltorio vivo que el
loader autodescubre y que el build verde sirve en producción (panel
"Radar-auto"). Su blueprint (`interfaz.blueprint.json`, en el módulo backend)
lleva la sección `ui.*` — el input del generador. Copiar este trío es la F7.

## 6 · Cadena de verificación en vivo

Para probar la cadena con un módulo real:

1. F6 sobre el módulo → type + zone en ui_handlers.
2. F6½ → ui.* en el blueprint (o default_generador) → completar_fase 200.
3. F7 → envoltorio en `frontend/src/lib/modules/<slug>/` → build verde →
   completar_fase 200 (el gate acepta el envoltorio).
4. El loader autodescubre el trío; el panel generado cubre las 4 zonas.

## 7 · Errores de la cadena (lo que el proceso ya no pide)

- Spec .md aparte cuando el blueprint basta (solo caso raro → anexo zona 5).
- Panel artesanal / store MQTT a mano — deuda del mundo viejo.
- Migrar módulos con panel manual ya construido — quedan como están.
- Saltar F6½ → el generador no sabe qué exponer; el gate lo exige.
- Permisos 600 en frontend/ — el build cae.
