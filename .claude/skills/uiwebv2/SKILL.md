---
name: uiwebv2
description: "Genera la interfaz web de un proyecto (un index.html autocontenido) con el reparto de formas REAL: un reflejo determinista (anatomia-a-spec.js) convierte la anatomía del proyecto en un UI-SPEC estable, y el agente SOLO estiliza y narra sobre ese esqueleto — nunca inventa la estructura. Evolución de generar-ui-web; esa queda intacta."
---

# uiwebv2 — UI de proyecto con formas reales

Dado un proyecto, produce su interfaz web completa (un solo `index.html` autocontenido).
La diferencia con `generar-ui-web`: aquí la **estructura es determinista** (un reflejo la
calcula por reglas) y el agente **solo pone estética y tono**. No hay un monolito que lo
adivine todo.

> **Por qué v2.** v1 declaraba "13 reflejos + 2 micro-agentes" pero luego mandaba
> "un solo HTML que lo sabe todo junto" → el reparto de formas era decorativo y la UI
> salía no determinista e imposible de testear. v2 honra el reparto: el esqueleto se
> calcula (reflejo, testeable), la piel se genera (agente, fuzzy). Determinismo en JS,
> chispa fuzzy en el agente — la ley del ecosistema, aplicada de verdad.

## El reparto de FORMAS (la corrección central)

```
REFLEJO   anatomia-a-spec.js   (determinista · puro · testeable)
  anatomía del proyecto → UI-SPEC { marca, nav[], secciones[], operaciones[] }
  · secciones de DATOS   ← un dominio vivo de vista_proyecto = una sección (no las elige el LLM)
  · OPERACIONES          ← capacidades del bus (cupula-eventos), campos desde su request_shape
  · INVENTARIO           ← catálogo de listar_cupulas
  · nav                  ← DERIVADA de las secciones (regla, no invención)

MICRO-AGENTE   (fuzzy · lo único que el reflejo no puede)
  UI-SPEC → HTML : tiñe el CSS con la marca · redacta la narrativa con el tono de la audiencia
  NO decide qué secciones hay, ni el orden, ni las operaciones — eso ya viene resuelto.
```

## Inputs

| Input | Requerido | Descripción |
|---|---|---|
| Proyecto | Sí | `project_id` (o path). De él sale la anatomía vía cúpulas. |
| Marca | No | `{ colores, fuentes, logo(SVG inline) }`. Default: neutra (#f5f5f5/#333/#0066cc), `system-ui`, sin logo. |
| UX | No | Accesibilidad (AA/AAA), responsive (mobile/desktop-first), densidad (baja/media/alta). Default: AA, mobile-first, media. |
| Audiencia | No | Nivel técnico, dispositivo, contexto. Modula el TONO de la narrativa. Default: técnico medio, escritorio+móvil. |

A más inputs, más matizada la piel. La estructura no depende de ellos — siempre sale del reflejo.

## Proceso

### Fase 1 — RECOLECTAR la anatomía (el agente conduce las cúpulas)

Junta los outputs crudos, sin interpretarlos:

1. `cupulas.vista_proyecto.request { project_id }` → identidad (nombre, tipo, marca) + dominios vivos.
2. `cupula-eventos` `buscar_capacidad` (+ `detalle_capacidad` para el `request_shape`) → operaciones reales del bus.
3. `cupulas.listar_cupulas.request { project_id }` → inventario de cúpulas.
4. Fallback sin cúpulas: `package.json`, `README.md`, árbol de directorios.

Arma el objeto `anatomia`:

```json
{
  "identidad": { "name": "...", "tipo": "...", "marca": { "colores": {}, "fuentes": "", "logo": null } },
  "dominios":  [ { "clave": "ventas", "titulo": "Ventas", "resumen": "", "muestra": { } } ],
  "capacidades": [ { "name": "carrito.crear", "tipo": "rpc", "descripcion": "", "request_shape": { } } ],
  "cupulas":   [ { "id": "proyecto", "tipo": "vista", "notas_count": 1 } ]
}
```

### Fase 2 — REFLEJO: anatomía → UI-SPEC (determinista)

```bash
echo "$anatomia" | node .claude/skills/uiwebv2/anatomia-a-spec.js   # → UI-SPEC por stdout
```

O `require('./anatomia-a-spec').buildSpec(anatomia)`. El UI-SPEC es estable: mismo proyecto →
misma estructura, run tras run. Aquí NO hay agente.

### Fase 3 — MICRO-AGENTE: UI-SPEC → HTML (solo piel)

El agente recibe el UI-SPEC + los inputs de marca/UX/audiencia y produce **un** `index.html`:

- Recorre `spec.nav` y `spec.secciones` **tal cual** → menú lateral colapsable + secciones en ese orden.
- Cada sección `datos` pinta su `muestra`; cada `operaciones` lista `spec.operaciones` con sus `campos` (formulario mock).
- Tiñe el CSS con `spec.marca.colores` (CSS variable-driven, tema claro/oscuro automático).
- Redacta descripciones con el TONO de la audiencia.

Reglas (heredadas, siguen valiendo):
- HTML semántico con roles ARIA. Sin dependencias externas (ni CDN, ni fuentes remotas, ni imágenes externas). Logo como SVG inline.
- Sin backend: todo frontend. **Estructura y nombres = reales** (vienen del spec); solo las respuestas de ejecución son mock.
- El agente **no** reordena ni añade secciones que no estén en el spec. Si falta algo, se corrige el reflejo, no se improvisa en el HTML.

### Fase 4 — ENTREGAR

El agente devuelve el HTML como string. **La persistencia la hace el runner**, y el índice de
directorio servible **siempre en minúscula `index.html`** (Caddy sirve case-sensitive; un
`Index.html` existe pero da 404 en `/<ns>/<slug>/<dir>/`). Este es el único nombre que la skill fija.

## Formas del esquema (ahora reales, no decorativas)

```
REFLEJO (1)       anatomia-a-spec.js — anatomía → UI-SPEC (marca, nav, secciones, operaciones, campos)
MICRO-AGENTE (1)  UI-SPEC → HTML (estética + tono). Nada de estructura.
```

## Errores a evitar

- **No dejar que el agente invente la estructura** — secciones, orden, nav y operaciones salen del UI-SPEC. El agente solo estiliza y narra.
- **No inventar datos del proyecto** — nombres de dominios, operaciones y campos son reales (del spec). Solo las respuestas de ejecución son mock.
- **No cargar recursos externos** — ni CDN, ni Google Fonts, ni imágenes remotas. Logo SVG inline. Funciona sin red.
- **No escribir el índice en mayúscula** — siempre `index.html`.
