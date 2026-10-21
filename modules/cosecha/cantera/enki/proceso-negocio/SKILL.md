---
name: proceso-negocio
description: >-
  Orquestador del proceso de un proyecto: encadena las skills de fase por
  eventos (project.created → identidad-negocio · negocio.identificado →
  esquematizar-negocio · negocio.esquematizado → planificar-construcción → ...).
  Tool completar_fase para que el LLM cierre fases. Empuja via conserje.empujon.
fuente: enki
dominio: sistema
tags: [enki, proceso, orquestador, fases, proyecto, pipeline, gate, verificacion]
---

# Enki · proceso-negocio

> **Qué es.** El ORQUESTADOR de fases de un proyecto. Encadena las skills del
> proceso (F0→F8) por eventos, usando el mecanismo REAL de Enki: empujón del
> conserje (pendientes + conserje.empujon) → el nervio lo surfacea en el chat
> → el LLM ejecuta la skill sugerida.
>
> Tipo: **Reflejo híbrido** (ModuloHibridoReflejo, v0.1.0)
>
> Código: `modules/proceso-negocio/index.js` · v`0.1.0`
>
> **Principio arquitectónico**: cada módulo es una parcela pequeña que hace SU
> trabajo bien hecho y punto — funciona por eventos, desacoplado. La
> reutilización y la potencia vienen de ahí.

---

## 1 · LÓGICA

### Arquitectura

El módulo `proceso-negocio` es un **orquestador event-driven** que NO ejecuta
trabajo directo: escucha eventos de ciclo de proyecto y empuja la skill que
toca a continuación. El flujo completo:

```
evento externo       → orquestador → empujón (conserje.empujon) → nervio → chat → LLM ejecuta skill
skill termina        → completar_fase → orquestador verifica entregable → empuja siguiente
sin entregable       → 409 FASE_INCOMPLETA → el proceso se DETIENE hasta que exista
```

**Cero cambios en el nervio, cero en las skills**: solo el MAPA_PROCESO del
orquestador define qué sigue.

### El MAPA_PROCESO (espinazo del orquestador)

| Evento (fase completada) | Skill siguiente | Fase |
|---|---|---|
| `project.created` | `identidad-negocio` | F0 — dar identidad al negocio |
| `negocio.identificado` | `esquematizar-negocio` | F2 — prisma de 5 huecos hasta seca |
| `negocio.esquematizado` | `planificar-construccion` | F3 · PLASMA — diseño OOP |
| `negocio.planificado` | `construir-modulos` | F3b · ADAPTADOR — traducir a Enki |
| `negocio.adaptado` | `construir-modulos` | F4 — construir UNA hoja del plan |
| `negocio.construido` | `escribir-skills` | F5 — skill FULL del módulo |
| `negocio.skills` | `decidir-interfaz` | F6 — decidir interfaz (script determinista) |
| `negocio.interfaz` | `esquematizar-interfaz` | F6½ — spec de interfaz |
| `negocio.interfaz_esquematizada` | `construir-interfaz` | F7 — construir interfaz operativa |
| `negocio.interfaz_construida` | `construir-modulos` | Siguiente hoja del plan |
| `negocio.verificado` | `null` (FIN) | F8 — verificación final en vivo |
| `negocio.completado` | `null` (FIN) | Completo (sin verificación final) |

### Ciclo por pieza (módulo-por-módulo)

Cuando existe un plan de construcción (`esquemas/plan-construccion.md`), el
orquestador NO usa el mapa lineal: recorre las hojas del plan EN ORDEN y actúa
sobre la PRIMERA hoja incompleta — esa hoja recorre TODAS sus fases
(construir → skill → interfaz → esquematizar interfaz → interfaz operativa)
ANTES de que empiece la siguiente. Decisión determinista del sistema, no del LLM.

### Gate de entregable (el sistema verifica, el LLM no decide)

Cada fase declara su entregable verificable. Sin entregable → `409 FASE_INCOMPLETA`:

| Fase | Entregable | Tipo de verificación |
|---|---|---|
| `esquematizado` | `esquemas/` con esquema.md + pasadas + disección | fs.list del proyecto |
| `diseccionado` | `esquemas/` con esquema.md + disección | fs.list del proyecto |
| `planificado` | `esquemas/diseno-oop.md` | fs.list del proyecto |
| `adaptado` | `esquemas/plan-construccion.md` (con espina) | fs.list del proyecto |
| `construido` | `modules/<slug>/index.js + module.json` en disco + repo | **Sistema** (fs real + git ls-files) |
| `skills` | `cosecha/cantera/enki/<slug>/SKILL.md` en disco + repo | **Sistema** (fs real + git ls-files) |
| `interfaz` | `module.json` con ui_handlers tipados o ui_decision.necesita=false | **Sistema** + git ls-files |
| `interfaz_esquematizada` | `<slug>.blueprint.json` con sección `ui` | **Sistema** + git ls-files |
| `interfaz_construida` | `frontend/src/lib/modules/<slug>/` con trío + blueprint | **Sistema** + git ls-files |
| `verificado` | TODAS las hojas del plan completas en disco | Sistema (progreso REAL) |
| `completado` | Plan completo en disco | Sistema |

### Idempotencia

Un mapa `this._emitidos` con clave `${project_id}::${eventoNombre}` → timestamp.
Un empujón por proyecto+fase, nunca spam. Llamar `completar_fase` dos veces
para la misma fase es seguro (no re-emite).

### Persistencia

Cada fase completada escribe su registro JSON determinista en el storage del
proyecto: `<proyecto>/proceso-negocio/<archivo>.json`. Archivos por fase:

| Evento | Archivo |
|---|---|
| `project.created` | `fase0-identidad-negocio.json` |
| `negocio.esquematizado` | `fase2-pasada-N.json` (múltiples) |
| `negocio.planificado` | `fase3-planificar-construccion.json` |
| `negocio.adaptado` | `fase3b-adaptador.json` |
| `negocio.construido` | `fase4-construir-modulos.json` |
| `negocio.skills` | `fase5-escribir-skills.json` |
| `negocio.interfaz` | `fase6-decidir-interfaz.json` |
| `negocio.interfaz_esquematizada` | `fase6h-esquematizar-interfaz.json` |
| `negocio.interfaz_construida` | `fase7-construir-interfaz.json` |
| `negocio.verificado` | `fase8-verificar-en-vivo.json` |
| `negocio.completado` | `fase-completado.json` |

F2 además escribe un cierre: `fase2-cierre-diseccion.json` con el contenido de
la disección.

---

## 2 · TOOLS

### `proceso-negocio.completar_fase`

Cierra una fase de skill del proceso de proyecto y encadena la siguiente. La
llaman las skills de fase (identidad-negocio, esquematizar-negocio,
planificar-construcción, construir-modulos, escribir-skills, decidir-interfaz,
esquematizar-interfaz, construir-interfaz, verificar-en-vivo) al terminar su
trabajo.

**Request:**

```json
{
  "project_id": "the-pirate",
  "fase": "esquematizado",
  "resumen": {
    "modulos": ["recetas"],
    "piezas": 12,
    "formas": ["custodio", "proyector"]
  }
}
```

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `project_id` | string | sí | ID del proyecto |
| `fase` | string | sí | Fase completada: `esquematizado`, `planificado`, `adaptado`, `construido`, `skills`, `interfaz`, `interfaz_esquematizada`, `interfaz_construida`, `verificado`, `completado` |
| `resumen` | object | no | Resumen de lo completado. Para `construido` usar `{ modulos: ["<slug>"] }`. Para `skills` usar `{ skills: ["<slug>"] }` |

**Response (200 — éxito):**

```json
{
  "status": 200,
  "data": {
    "project_id": "the-pirate",
    "fase_completada": "negocio.esquematizado",
    "siguiente": "planificar-construccion",
    "entregable": {
      "ok": true,
      "verificados": ["el árbol maestro", "ronda 1 del prisma", "ronda 2 (prisma recursivo)", "la disección punto a punto (FORMA de cada hoja)"]
    },
    "progreso": {
      "project_id": "the-pirate",
      "total": 5,
      "construidos": 0,
      "con_skill": 0,
      "con_interfaz": 0,
      "con_interfaz_esquematizada": 0,
      "con_interfaz_construida": 0,
      "faltan_por_construir": 5,
      "faltan_por_skill": 0,
      "faltan_por_interfaz": 0,
      "faltan_por_interfaz_esquematizada": 0,
      "faltan_por_interfaz_construida": 0,
      "slugs": ["recetas", "opciones", "carta-digital", "inventario", "pedidos"],
      "hojas": [
        { "slug": "recetas", "construido": false, "con_skill": false, "con_interfaz": false, "con_interfaz_esquematizada": false, "con_interfaz_construida": false }
      ]
    },
    "fin": false
  }
}
```

**Errores:**

| Código | HTTP | Significado |
|---|---|---|
| `INVALID_INPUT` | 422 | Falta `project_id` o `fase` |
| `FASE_NO_MAPEADA` | 400 | La fase no existe en el MAPA_PROCESO |
| `FASE_INCOMPLETA` | 409 | El entregable de la fase no existe en disco |

**FASE_INCOMPLETA (409) — ejemplo:**

```json
{
  "status": 409,
  "data": {
    "error": "FASE_INCOMPLETA",
    "message": "El esquema del negocio no está completo: se espera <proyecto>/esquemas/ con esquema.md (árbol maestro), las pasadas del prisma (hasta seca) Y la disección (cada hoja atómica con su FORMA). Haz el trabajo primero.",
    "fase": "esquematizado",
    "esperado": ["el árbol maestro", "ronda 1 del prisma", "ronda 2 (prisma recursivo)", "la disección punto a punto (FORMA de cada hoja)"]
  }
}
```

### `proceso-negocio.estado`

Consulta el estado del proceso para un proyecto: si hay un empujón pendiente y
qué fases se han emitido ya.

**Request:**

```json
{
  "project_id": "the-pirate"
}
```

**Response:**

```json
{
  "status": 200,
  "data": {
    "project_id": "the-pirate",
    "pendiente": {
      "tipo": "proceso",
      "recurso": "planificar-construccion",
      "mensaje": "[PRINCIPIO] Cada módulo es una parcela pequeña... FASE 3: diseñar el SISTEMA en PSEUDOCÓDIGO OOP...",
      "accion_sugerida": "cosecha.obtener:planificar-construccion",
      "fase": "negocio.esquematizado",
      "project_id": "the-pirate",
      "lee": ["proceso-negocio/fase2-cierre-diseccion.json"],
      "escribe": "proceso-negocio/fase3-planificar-construccion.json"
    },
    "emitidas": [
      "the-pirate::project.created",
      "the-pirate::negocio.identificado",
      "the-pirate::negocio.esquematizado"
    ]
  }
}
```

---

## 3 · EVENTOS

### Publica

| Evento | Descripción |
|---|---|
| `conserje.empujon` | Reutiliza el canal del conserje: `{ project_id, tipo:'proceso', recurso:<skill>, mensaje, accion_sugerida:'cosecha.obtener:<skill>', fase }` — el nervio lo surfacea en el chat y el LLM ejecuta la skill. |

Payload del empujón:

```json
{
  "tipo": "proceso",
  "recurso": "planificar-construccion",
  "mensaje": "[PRINCIPIO] ... FASE 3: diseñar el SISTEMA en PSEUDOCÓDIGO OOP — lee proceso-negocio/fase2-cierre-diseccion.json, diseña entidades/clases/flujos/contratos...",
  "accion_sugerida": "cosecha.obtener:planificar-construccion",
  "fase": "negocio.esquematizado",
  "project_id": "the-pirate",
  "lee": ["proceso-negocio/fase2-cierre-diseccion.json"],
  "escribe": "proceso-negocio/fase3-planificar-construccion.json",
  "correlation_id": "uuid",
  "timestamp": "2026-08-25T19:00:00.000Z"
}
```

### Escucha

| Evento | Handler | Descripción |
|---|---|---|
| `project.created` | `onProjectCreated` | Un proyecto nace → FASE 0: empuja `identidad-negocio` |
| `negocio.identificado` | `onNegocioIdentificado` | Identidad declarada → FASE 2: empuja `esquematizar-negocio` |
| `proceso-negocio.completar_fase.request` | `onCompletarFaseRequest` | El LLM cierra una fase → orquestador registra y empuja la siguiente |

---

## 4 · FLUJO TÍPICO

### Inicio del proceso (F0→F2)

```
Usuario crea proyecto
  → project.created (evento)
  → proceso-negocio.onProjectCreated()
  → _encadenar('project.created')
  → MAPA_PROCESO['project.created'] = { skill: 'identidad-negocio' }
  → _empujar(): pendientes.set + conserje.empujon
  → nervio surfacea en el chat: "FASE 0: dar identidad al negocio..."
  → LLM ejecuta identidad-negocio (cosecha.obtener)
  → skill termina → project-profile emite negocio.identificado
  → proceso-negocio.onNegocioIdentificado()
  → _encadenar('negocio.identificado')
  → MAPA_PROCESO['negocio.identificado'] = { skill: 'esquematizar-negocio' }
  → _empujar(): "FASE 2: esquematizar el negocio..."
  → LLM ejecuta esquematizar-negocio
```

### Ciclo por pieza (F4→F7, con plan)

```
Cuando existe esquemas/plan-construccion.md:
  → _decidirSiguiente() recorre hojas EN ORDEN
  → primera hoja sin módulo → F4 construir-modulos
  → LLM construye modules/<slug>/ + llama completar_fase { fase: "construido", resumen: { modulos: ["recetas"] } }
  → gate verifica: modules/recetas/index.js existe, API real, commiteado
  → OK → empuja siguiente: escribir-skills
  → LLM escribe skill + completar_fase { fase: "skills" }
  → gate verifica: cantera tiene SKILL.md
  → OK → empuja decidir-interfaz
  → ... hasta que la hoja está completa (módulo + skill + interfaz decidida + spec + operativa)
  → pasa a la SIGUIENTE hoja del plan
  → todas completas → F8 verificar-en-vivo
```

### Terminación (F8 → completado)

```
Todas las hojas completas
  → _decidirSiguiente() devuelve { skill: 'verificar-en-vivo' }
  → F8 verifica cada hoja EN DISCO
  → completar_fase { fase: "verificado" }
  → gate verifica: progreso.total === hojas completas
  → OK → skill: null, mensaje: "COMPLETO Y VERIFICADO"
```

---

## 5 · ERRORES CONOCIDOS Y PITFALLS

### El LLM hace lo que quiere → gates de entregable son obligatorios

Visto en vivo: la skill fase 2 preguntó *"¿la activo como lente o la aplico ya?"*
en vez de ejecutar. El gate del orquestador protege contra esto: sin entregable
en disco → `409 FASE_INCOMPLETA` → el proceso no avanza.

**Regla**: la skill es el know-how (directiva, mecánica), pero el gate es del
sistema. El proceso avanza solo cuando el trabajo EXISTE en disco.

### El módulo en disco puede NO cargar por 2 causas

1. **Manifest inválido**: falta `name`, `version` (semver `\d+.\d+.\d+`) o
   `description` → `module.load.failed { error: "Invalid manifest" }`.
2. **Fuera de allowlist**: `config.modules.enabled` no contiene el módulo →
   no carga y no da error visible.

El gate de `construido` verifica la API real (require `_shared/modulo-hibrido-reflejo`,
_atender con 4 args, this.name/version) pero NO puede detectar estas 2 causas.

### El deploy (rsync --delete) borra lo no commiteado

El gate verifica con `git ls-files` que el módulo/skill esté en el repo de
desarrollo (`~/3enki/`). Si existe en disco pero no está commiteado → el gate
lo rechaza: *"el siguiente deploy (rsync --delete) lo borrará"*. Lección
verificada 2 veces en vivo (15 módulos generados y barridos).

### Vocabulario del patrón - filtro de hojas fantasma

El extractor de hojas del plan filtra palabras del `VOCABULARIO_DEL_PATRON`
(`event-driven`, `micro-servicio`, `base-module`, `kebab-case`, etc.) que
aparecen en el texto del plano pero NO son hojas reales a construir. Sin este
filtro, `faltan_por_construir` jamás baja a 0 y el proceso nunca llega a
completado.

### Completado sin plan → rechazado

`completar_fase { fase: "completado" }` sin plan en disco devuelve `409`:
*"No hay plan de construcción (esquemas/plan-construccion.md): no hay nada que
declarar completado. Cierra antes la FASE 3b (adaptador)."*

### Principio arquitectónico antepuesto

Cada empujón del orquestador incluye el principio arquitectónico como prefijo
del mensaje:

> [PRINCIPIO] Cada módulo es una parcela pequeña que hace SU trabajo bien hecho
> y punto — funciona por eventos, desacoplado. La reutilización y la potencia
> vienen de ahí. El ensamblaje se hace DESPUÉS, según necesidades, conectando
> eventos. No compliques la parcela pensando en el ensamblaje.
>
> [FRENOS → EMPUJONES] Cuando encuentres un freno (restricción, bloqueo, límite
> que corta), NO lo aceptes como muro. Pregunta: ¿qué estado deseado protege?
> Si protege algo real → conviértelo en su empujón (la acción construible que
> abre ese estado — una pieza, un flujo alternativo, una capacidad). Si no
> protege nada nombrable → se disuelve (era inercia, no restricción).

---

## 6 · DEPENDENCIAS

- `ModuloHibridoReflejo` — clase base del reflejo (`../_shared/modulo-hibrido-reflejo`)
- `extraerEspina` — extrae el bloque ````json enki-plan```` del plano (`../_shared/motor/verificador`)
- `conserje.empujon` — canal de empujón que el nervio surfacea en el chat
- `fs.list.request` / `fs.read.request` / `fs.write.request` — RPCs de filesystem del proyecto
- `project-profile` — emite `negocio.identificado` (trigger de FASE 2)

Sin dependencias npm externas.
