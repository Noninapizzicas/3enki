---
name: cola-impresion
description: Skill FULL del módulo cola-impresion (CUSTODIO) del proyecto 3D — la cola de impresión del taller (SPARKX i7, una pieza a la vez). Ordena lo aprobado con un motor de ordenación por variables (material, urgencia, tamaño, tiempo) que se ajusta con el uso. Úsala para operar, depurar o extender la cola de impresión: entrar piezas, extraer la siguiente, reordenar, consultar longitud, y entender el contrato de eventos y las reglas de negocio.
when-to-use: Cuando necesites meter una pieza aprobada en la cola (cola.entrar), extraer la siguiente a imprimir (cola.siguiente), reordenar la cola (cola.reordenar), consultar su longitud (cola.longitud), o entender/depurar el motor de ordenación _ordenar, los estados de los items, el contrato de eventos (subscribes/publishes) o las invariantes del CUSTODIO de la cola de impresión 3D.
tags: [enki, modulo, custodia, cola-impresion, impresion-3d, proyecto-3d, reflejo, pos-persistencia, motor-ordenacion]
---

# cola-impresion — CUSTODIO de la cola de impresión 3D

## Qué hace el módulo

`cola-impresion` es el **CUSTODIO (reflejo JS)** de la cola de impresión del taller
personal de impresión 3D (impresora SPARKX i7, **una pieza a la vez**). Es el
**single-writer** de su store por proyecto vía `PosPersistencia`.

**La cola NO es FIFO simple.** Un **motor de ordenación** (`_ordenar`, proyección
interna `_op`) puntúa cada pieza pendiente con variables — `material` · `urgencia` ·
`tamaño` · `tiempo` — y las variables se **ajustan con el uso**: al extraer una pieza,
su material pasa a ser el "cargado" y gana prioridad (evita cambios de filamento).

**La cola NUNCA decide qué imprimir** (invariante 6 del plan): solo ordena lo
aprobado. El dueño aporta todo el juicio (qué imprimir, qué material, cuándo
aprobar). El sistema es 100% determinista (0 piezas fuzzy).

### Rol en el sistema
- **CUSTODIO** (CLASE con estado → CUSTODIO). No es un puente (no transporta), no
  es un orquestador (no compone la cadena — eso es `ciclo-impresion`).
- Lee el catálogo por RPC (`catalogo.obtener.request`) para validar que el modelo
  existe antes de entrar una pieza.
- Depende de `filesystem` (`fs.*.request`) para su store.
- Lo consume `ciclo-impresion` (extrae la siguiente pieza) y el dueño (reordena).

## Contrato de eventos (module.json real)

### Subscribes (RPC request/response)
| Evento | Handler | Descripción |
|---|---|---|
| `cola.entrar.request` | `onEntrarRequest` | Mete una pieza aprobada (valida catálogo + no duplicado). Emite `cola.entrada` o `cola.entrar.failed`. |
| `cola.siguiente.request` | `onSiguienteRequest` | Extrae la siguiente pieza según el motor de ordenación. Emite `cola.extraccion` o `cola.vacia`. |
| `cola.reordenar.request` | `onReordenarRequest` | Sube/baja una pieza pendiente a una posición. Emite `cola.reordenada`. |
| `cola.longitud.request` | `onLongitudRequest` | Longitud de la cola (pendientes + total). |
| `project.activated` | `onProjectActivated` | Restaura el estado persistido de la cola del proyecto. |

### Publishes (fire-and-forget)
| Evento | Descripción |
|---|---|
| `cola.entrada` | Pieza aprobada metida en la cola. Lleva `project_id` top-level + `correlation_id`. |
| `cola.extraccion` | Pieza extraída como siguiente a imprimir. Lleva `project_id` + `correlation_id`. |
| `cola.reordenada` | Cola reordenada (una pieza subida/bajada). Lleva `project_id` + `correlation_id`. |
| `cola.vacia` | No hay piezas pendientes al pedir la siguiente. Lleva `project_id` + `correlation_id`. |
| `cola.entrar.failed` | **Par canónico** de `cola.entrar.request`. Lleva `project_id` + `correlation_id`. |

> **Regla de cierre de círculo**: todo flujo cierra su círculo con un par de
> resultado canónico (`*.failed` / `ok:false`). Nadie da por hecho un envío sin
> `ok:true` explícito del proveedor (honestidad M11).

## Cómo se usa (RPCs)

Todos los handlers delegan a `_atender(e, op, responseTopic, fn)` — una línea cada uno.

### `cola.entrar.request` — meter una pieza aprobada
```json
{
  "project_id": "proj-1",
  "modelo_id": "m1",
  "nombre": "Soporte de llaves",
  "material": "PLA",
  "urgencia": 3,
  "tamano": 1200,
  "item_id": "opcional"
}
```
- **201** → guarda el item (`estado: 'pendiente'`) y emite `cola.entrada`.
- **400 INVALID_INPUT** → falta `project_id`, `modelo_id` o `nombre`.
- **409 ALREADY_EXISTS** → el `modelo_id` ya está pendiente en la misma cola (no duplica).
- **404 RESOURCE_NOT_FOUND** → el modelo no existe en el catálogo (RPC best-effort:
  si el catálogo no responde, no bloquea la entrada — la cola solo ordena lo aprobado).

### `cola.siguiente.request` — extraer la siguiente a imprimir
```json
{ "project_id": "proj-1" }
```
- **200 `vacia: true`** → no hay pendientes; emite `cola.vacia`.
- **200 `vacia: false`** → extrae la de mayor score del motor `_ordenar`, la pasa a
  `estado: 'imprimiendo'`, ajusta `materialCargado` y emite `cola.extraccion`.

### `cola.reordenar.request` — subir/bajar una pendiente
```json
{ "project_id": "proj-1", "item_id": "uuid", "pos": 1 }
```
- **200** → reordena (1-based) y emite `cola.reordenada`.
- **404 RESOURCE_NOT_FOUND** → el item no existe o no está pendiente.
- **409 CONFLICT_STATE** → solo se reordena una pieza `pendiente` (no `imprimiendo`/`hecho`).

### `cola.longitud.request` — consultar longitud
```json
{ "project_id": "proj-1" }
```
- **200** → `{ pendientes, total }`.

## Reglas de negocio

### Estados de un item
`pendiente` → `imprimiendo` → `hecho` → `retirada` (constante `ESTADOS`).

### Motor de ordenación `_ordenar` (proyección interna `_op`, pieza 2.1)
Puntúa cada pieza pendiente y devuelve la lista ordenada (mayor score primero):

| Variable | Peso default | Cómo puntúa |
|---|---|---|
| `material` | 3 | Coincidir con el material cargado → bonus (evita cambio de filamento). |
| `urgencia` | 2 | 1..5, mayor → más score. |
| `tamaño` | 1 | Piezas pequeñas primero (encadenar rápido). `0` (desconocido) → neutro. |
| `tiempo` | 1 | Antigüedad en cola (más espera → más score), en horas. |

**Ajuste con el uso**: al extraer una pieza, su material pasa a ser el `materialCargado`
del store y gana prioridad en la siguiente extracción. Los pesos (`PESOS_DEFAULT`) y el
material cargado se ajustan dinámicamente y se persisten por proyecto.

### Encadenar la siguiente
`ciclo-impresion` llama a `cola.siguiente` para encadenar la siguiente pieza. La cola
solo entrega la pieza; el ciclo decide cuándo (no arranca la siguiente hasta que la
anterior termina o falla/pausa y el dueño confirma la retirada — invariante 1).

### Invariantes que cumple
- **Un solo escritor por store** — la cola es la única que escribe en su store (invariante 2).
- **La cola nunca decide qué imprimir** — solo ordena lo aprobado (invariante 6).
- **Dato ausente nombrado, nunca inventado** — `material: 'desconocido'`, `tamano: 0` (invariante 5).

## Configuración (module.json)
```json
"config": {
  "persistence": {
    "scope": "project",
    "type": "pos-persistencia",
    "data_path": "impresion-3d/cola",
    "pattern": "json-file-per-project",
    "concurrency": "single-writer"
  }
}
```
- Store: `cola-impresion.json` por proyecto, snapshot `{ project_id, materialCargado, pesos, items }`.
- Observabilidad: contadores `cola-impresion.entrada/extraccion/reordenada/vacia.total`,
  `cola-impresion.errors`; gauge `cola-impresion.pendientes.count`.

## Verificación (test unitario)

Suite: `modules/cola-impresion/tests/unit/cola-impresion__entrar.test.js`
Ejecutar: `node modules/cola-impresion/tests/unit/cola-impresion__entrar.test.js`

Cubre (sin bus ni fs, proyecciones directas con `eventBus`/`_rpc` stub):
- `_entrar`: pieza bien formada → 201 + guarda + emite `cola.entrada`; sin nombre →
  INVALID_INPUT; sin `project_id` → INVALID_INPUT; modelo duplicado pendiente →
  ALREADY_EXISTS (409) y NO duplica; modelo inexistente en catálogo → 404.
- `_siguiente`: cola vacía → `cola.vacia`; con pendientes → extrae la de mayor score,
  la pasa a `imprimiendo` y ajusta `materialCargado`.
- `_ordenar`: material cargado gana prioridad (evita cambio de filamento).
- `_reordenar`: sube una pendiente a la posición 1; pieza no pendiente → CONFLICT_STATE (409).
- `_longitud`: cuenta pendientes y total.

## Pitfalls
- **No es FIFO**: no asumas que la primera en entrar es la primera en salir; el motor
  `_ordenar` decide por score.
- **Duplicado por `modelo_id` pendiente**: no se puede meter dos veces el mismo modelo
  mientras esté pendiente (409). Una vez extraído (`imprimiendo`/`hecho`/`retirada`) ya
  no bloquea.
- **`_rpc` best-effort**: si el catálogo no responde, la entrada NO se bloquea (solo
  falla con 404 si el catálogo responde explícitamente 404).
- **Reordenar solo pendientes**: intentar reordenar una pieza en `imprimiendo` da 409.
- **Permisos**: los archivos del módulo en `/opt/enki/modules/cola-impresion/` son
  `www-data` con 600 — leerlos requiere `sudo`.
