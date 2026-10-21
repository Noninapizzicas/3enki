---
name: crear-agente
description: >-
  Crear agentes Enki (pipelines con identidad) — el contrato JSON completo
  (identidad, pasos fuzzy/reflejo, entregable con reglas JEFE, presupuesto),
  cuándo agente vs skill vs LLM de página, y el wizard scripts/crear-agente.js.
when-to-use: >-
  Cuando pidas "crea un agente", "nuevo agente en la cantera", "automatiza esto
  como agente", o al decidir si una tarea de proceso es agente o skill. También
  al editar/auditar un agente existente en modules/cosecha/cantera/enki/agentes/.
fuente: enki
dominio: metodo
tags: [enki, agentes, cantera, pipeline, crewai, delegate_task]
---

# Crear Agentes Enki

> Un agente Enki es un PIPELINE con identidad: pasos deterministas (reflejo) + el
> único paso no determinista (fuzzy/LLM), un entregable verificable y un presupuesto.
> Vive en la cúpula de agentes: `modules/cosecha/cantera/enki/agentes/<name>.json`
> con `_index.json` como catálogo.

## El contrato JSON (formato exacto)

```json
{
  "name": "slug-del-agente",
  "description": "Una línea: qué hace",

  "identidad": {
    "role": "Analista de X",
    "goal": "Qué busca conseguir",
    "backstory": "Eres un experto en... (contexto de experto)"
  },

  "pasos": [
    { "paso": "leer_datos",  "tipo": "reflejo", "op": "leer_modulo" },
    { "paso": "generar",     "tipo": "fuzzy",
      "instruccion": "Qué generar, formato, reglas. Sé específico.",
      "valida": { "tamano_min": 200 } },
    { "paso": "escribir",    "tipo": "reflejo", "op": "escribir" },
    { "paso": "commitar",    "tipo": "reflejo", "op": "commitar" }
  ],

  "entregable": {
    "tipo": "fs",
    "path": "cosecha/cantera/enki/<slug>/SKILL.md",
    "reglas": ["existe", "contenido_min", "en_repo"],
    "min_chars": 300
  },

  "presupuesto": {
    "generaciones_por_paso": 3,
    "max_tokens": 16000,
    "generacion_timeout_ms": 180000
  }
}
```

### Pasos

**`tipo: "reflejo"`** — determinista, SIN LLM. Operaciones del catálogo:

| op | qué hace |
|---|---|
| `escribir` | Escribe el entregable en disco |
| `commitar` | git add + commit + push del entregable |
| `leer_modulo` | Lee el código del módulo target (module.json + index.js) |
| `leer_plan` | Lee el plan de construcción (con `plan: "ruta"`) |
| `leer_rail` | Lee el rail de estados (tareas pendientes) |
| `verificar` | Verifica el entregable contra las reglas |
| `ejecutar_script` | Corre un comando (con `comando: "node scripts/x.js <slug>"`) |
| `personalizado` | Operación con nombre libre (definir `op`) |

**`tipo: "fuzzy"`** — el ÚNICO paso con LLM:
- `instruccion`: específica — qué generar, formato exacto, qué NO hacer
- `valida.tamano_min`: mínimo de chars de la salida
- El LLM solo GENERA contenido; todo lo demás es reflejo

### Entregable

- `tipo`: `fs` (archivos) | `juicio` (no verificable — se reporta honesto) | `evento` (señal en el bus) | `ninguno`
- Para `fs`: `path` (UN archivo) o `dir` + `archivos[]` (multi — SOLO F7 lo justifica)
- **Reglas del JEFE** (verificación mecánica en disco, el LLM no certifica su trabajo):
  `existe` · `contenido_min` (+ `min_chars`) · `en_repo` (commit real) ·
  `requires_resueltos` · `api_real` · `interfaz_operativa` · `interfaz_decidida`

### Presupuesto

- `generaciones_por_paso`: reintentos del paso fuzzy (3 default)
- `max_tokens`: tope de salida (16K default; 1K si es determinista puro)
- `generacion_timeout_ms`: timeout por generación

## Cuándo AGENTE vs skill vs LLM de página

| Situación | Elección |
|---|---|
| El humano está EN MEDIO de cada paso (entrevista, decisión) | **LLM de página** (el chat) — un agente autónomo no puede entrevistar |
| Bucle interno autónomo (ronda a ronda sin humano hasta el final) | **AGENTE** |
| Know-how que el chat necesita EN EL MOMENTO (conversacional) | **SKILL** en cantera + arsenal |

La regla: **agente = trabajo que corre solo hasta un entregable en disco.**
Si necesita hablar contigo a mitad, no es agente.

## El wizard (herramienta)

```bash
node scripts/crear-agente.js
# guía: nombre → descripción → identidad → pasos → entregable → presupuesto
# genera modules/cosecha/cantera/enki/agentes/<name>.json
```

A mano también vale — el wizard es ayuda, no requisito. Lo importante es el contrato.

## Registro en la cúpula

Tras crear el JSON, añadir la entrada a `agentes/_index.json`:

```json
{
  "name": "<name>",
  "description": "<una línea>",
  "archivo": "<name>.json",
  "tags": ["..."],
  "creado": "<YYYY-MM-DD>",
  "ejecuciones": 0,
  "ultima_ejecucion": null,
  "modulos_procesados": []
}
```

## Invocación

- Desde el chat de Enki: `invoke_agent("<name>", { task: "..." })`
- Desde Hermes (canal externo): leer el contrato con read_file y ejecutar con `delegate_task` — el JSON ES el prompt estructurado del sub-agente

## Verificación (JEFE)

El entregable se verifica EN DISCO, nunca por auto-reporte:
1. El paso `verificar` corre las `reglas` del entregable
2. Desde fuera: `ls -la <path>` + tamaño + `git log --oneline -1` (si lleva `en_repo`)
3. Si el agente reporta "escrito y verificado" pero el archivo no está → success falso; el disco manda

## Git: cada agente, su rama

El agente NO toca main directo y NO deja trabajo sin versionar. El contrato lleva bloque `"git"`:

```json
"git": {
  "modo": "rama-propia",
  "rama": "agente/<name>",
  "commit": true,
  "pr": true,
  "merge": "externo"
}
```

Flujo: partir de main limpio → trabajar en `agente/<name>` → commit convencional → push → abrir PR. El PR es la cola de revisión: quien firma mira el diff y mergea (o descarta). Si el trabajo sale mal → borrar la rama y punto — main nunca se mancha.

Invocación desde donde sea (chat de Enki, canal externo, cron): el agente siempre sigue el MISMO contrato, así que el resultado es igual de revisable venga de donde venga.

## La copia al FRONTEND va en el MISMO PR (no después del merge)

El blueprint vive en DOS sitios y la UI renderiza el del frontend, no el de modules/:

1. `modules/<vertical>/<slug>/<slug>.blueprint.json` — la fuente (disco)
2. `frontend/src/lib/modules/<slug>/<slug>.blueprint.json` — el que renderiza BlueprintForm

**Si solo se commitea el de modules/, la UI NO cambia** (pagado 29-ago con mise-en-place y marca-cliente: módulo ya en deploy con roles, UI sin cambios — la copia frontend seguía en 1.0.0).

Regla: el agente, ANTES de abrir el PR, copia el blueprint a su sitio frontend (`cp modules/.../x.blueprint.json frontend/src/lib/modules/<slug>/`) y commitea AMBOS en el mismo PR. Así el deploy — que compila el frontend desde el repo — ya trae la UI nueva al hacerse. El deploy del dueño hace `npm run build` + rsync; quien revisa solo firma el PR.

Checklist post-merge (el firmante): `git pull` en main + deploy — SIN tocar el frontend a mano. Si el PR ya trajo la copia, el deploy basta y la UI refleja el cambio al recargar.

## Errores a evitar

- **Entregable multi-archivo sin justificación** — el patrón es UN entregable = UN path (F7 es la única excepción: el trío frontend es físicamente inseparable)
- **Escribir con fs.write del agente** — el fs está scopeado al storage del proyecto; para modules/ usar productor (`productor.producir` / `productor.skill`) y exigir el 201 antes de afirmar éxito
- **Rail para procesos largos** — 1 en 1 por defecto contra `estados.*`; "a full" solo con mandato explícito del dueño
- **Fuzzy sin `valida`** — un paso fuzzy sin `tamano_min` puede devolver vacío y contar como éxito
- **Olvidar el _index.json** — el agente existe pero la cúpula no lo anuncia (no es descubrible)
- **Commits reales en smokes** — al probar, sobreescribir `_commitar` con `async () => ({commit:false})`

## Casos testigo (en la cúpula)

- `generar-skill` — lee módulo → genera SKILL.md → escribe → commita (el patrón completo)
- `generar-blueprint` — determinista puro (1 generación, 1K tokens, script interno)
- `f6-f7-completo` — pipeline de fases encadenadas
- `analizar-log` · `auditar-skills` — lectura/análisis sin escritura