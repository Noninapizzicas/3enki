---
name: piel-del-sistema
description: "Genera la interfaz viva de un proyecto — la PIEL del sistema. Cada componente se genera desde los datos reales del proyecto (cúpulas), la estructura se calcula con un reflejo determinista (spec-maker.js), y las operaciones llaman a eventos del bus en vivo. El agente solo pone estética y tono sobre un esqueleto que no puede modificar. Si el entorno lo permite, la UI opera el backend real en lugar de mostrar mocks."
---

# Piel del Sistema

> La UI no se genera y se olvida. La UI es la PIEL de un sistema vivo.
> El esqueleto lo calcula un reflejo; el agente solo lo viste.

Esta skill toma el concepto de **interfaz viva** y lo construye con reflejos propios: `spec-maker.js` para el UI-SPEC (sin copiar código de uiwebv2), `recolectar-anatomia.js` para las cúpulas, y `publicar-piel.js` para la persistencia.

## El reparto de formas

```
┌──────────────────────────────────────────────────────────┐
│  REFLEJO  (determinista, testeable, puro)                │
│  ┌────────────────────────────────────────────────────┐  │
│  │  1. recolectar-anatomia.js                         │  │
│  │     cúpulas → anatomía JSON                        │  │
│  │     (o fallback: escanea archivos)                 │  │
│  │                                                     │  │
│  │  2. spec-maker.js  (propio, no copiado)               │  │
│  │     anatomía → UI-SPEC { marca, nav, secciones }    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  AGENTE  (fuzzy, solo estética y tono)                   │
│  ┌────────────────────────────────────────────────────┐  │
│  │  UI-SPEC + inputs → HTML                           │  │
│  │  · Pinta las secciones TAL CUAL (no decide cuáles)  │  │
│  │  · Tiñe CSS con la marca                            │  │
│  │  · Redacta con el tono de la audiencia              │  │
│  │  · Si hay acceso al bus → operaciones reales        │  │
│  │  · Si no → formularios mock                         │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  REFLEJO  (determinista)                                 │
│  ┌────────────────────────────────────────────────────┐  │
│  │  3. publicar-piel.js                               │  │
│  │     HTML → www/index.html (vía fs.write o deploy)  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

El reflejo (`spec-maker.js`) se adopta como propio — escrito desde cero para esta skill.

## Inputs

| Input | Requerido | Cómo se obtiene |
|---|---|---|
| Proyecto | Sí | `project_id` — de él sale la anatomía vía cúpulas |
| Marca | No | De `cupulas.vista_proyecto` o fallback: defaults neutros |
| UX | No | Default: WCAG AA, mobile-first, densidad media |
| Audiencia | No | Default: técnico medio, escritorio+móvil |

A más inputs, más matizada la piel. La estructura no depende de ellos — siempre sale del reflejo.

## Proceso

### Fase 1 — REFLEJO: recolectar anatomía

Dos caminos, en orden de prioridad:

**Camino A (Enki vivo):** Ejecuta `recolectar-anatomia.js` que:
1. Llama a `cupulas.vista_proyecto` → identidad, marca, dominios
2. Llama a `buscar_capacidad` + `detalle_capacidad` → capacidades del bus
3. Llama a `cupulas.listar_cupulas` → inventario
4. Produce JSON `anatomia.json`

**Camino B (fallback universal):** Lee `package.json`, `README.md`, estructura de directorios. Detecta tipo de proyecto, endpoints, rutas. Produce el mismo JSON con datos del filesystem.

```json
{
  "identidad": { "name": "...", "tipo": "...", "marca": { "colores": {}, "fuentes": "", "logo": null } },
  "dominios":  [ { "clave": "ventas", "titulo": "Ventas", "resumen": "", "muestra": { } } ],
  "capacidades": [ { "name": "carrito.add_item", "tipo": "rpc", "descripcion": "", "request_shape": { } } ],
  "cupulas":   [ { "id": "proyecto", "tipo": "vista", "notas_count": 1 } ]
}
```

### Fase 2 — REFLEJO: anatomía → UI-SPEC

```bash
cat anatomia.json | node .claude/skills/piel-del-sistema/references/spec-maker.js
```

O desde código: `makeSpec(anatomia)`. El UI-SPEC es estable: mismo proyecto → misma estructura, run tras run. **Aquí no entra el agente.**

### Fase 3 — AGENTE: UI-SPEC → HTML (solo piel)

El agente recibe el UI-SPEC + inputs de marca/UX/audiencia y produce **un** `index.html`:

- Recorre `spec.nav` y `spec.secciones` **tal cual** — ni una sección más, ni una menos, en ese orden exacto
- Cada sección `datos` pinta su `muestra`; cada `operaciones` lista las operaciones con sus campos
- **Si hay acceso al bus**, cada operación se convierte en un botón que llama a `rpc(dominio, accion, payload)`. El resultado se muestra en la misma UI sin recargar.
- **Si no hay bus**, las operaciones se muestran como formularios mock con los campos reales
- Tiñe el CSS con `spec.marca.colores` (variables CSS, tema claro/oscuro)
- Redacta descripciones con el tono de la audiencia

Reglas que el agente no puede violar:
- HTML semántico con roles ARIA
- Sin CDN, sin Google Fonts, sin imágenes externas. Logo SVG inline.
- Sin backend propio — si hay bus, llama a eventos; si no, mock
- **No inventa secciones, no las reordena, no las renombra**
- Si algo falta → se corrige el reflejo, no se improvisa

### Fase 4 — REFLEJO: publicar

Tres caminos, en orden de prioridad:

1. **`publicar-piel.js`** → escribe `www/index.html` vía `fs.write` RPC si el bus responde
2. **`publicar-html`** (skill en cantera) → si el agente tiene acceso
3. **Devolver el HTML como string** → que el usuario lo guarde donde corresponda

El índice siempre en minúscula `index.html` (Caddy es case-sensitive).

## Lo que no hace (y no debe hacer)

- El agente no recolecta la anatomía — la recolecta el script reflejo
- El agente no genera el UI-SPEC — lo genera `spec-maker.js`
- El agente no persiste el HTML — lo persiste `publicar-piel.js` o el runner
- El agente solo **viste** el esqueleto que recibe

## Formas del esquema

| Forma | Qué | Cómo |
|---|---|---|
| REFLEJO | recolectar-anatomia.js | Script que consulta cúpulas |
| REFLEJO | spec-maker.js | Función pura, propia (no copiada de uiwebv2) |
| MICRO-AGENTE | UI-SPEC → HTML | LLM: solo estética y tono |
| REFLEJO | publicar-piel.js | Script que persiste vía fs.write |
