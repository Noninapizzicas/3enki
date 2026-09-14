---
name: panel-trabajador
description: >
  Skill FULL del módulo REFLEJO `panel-trabajador` del proyecto 3D (taller de impresión
  3D, una impresora SPARKX i7 que encadena piezas; moneda STL/3MF→GCODE). Es la cara
  OPERATIVA del trabajador (rol HOY): expone estado en vivo (pieza, progreso, fase),
  próximo a encadenar, eventos, pendientes de confirmación y cola+filamento, además de
  ACTIONS HOY (pausar/abortar/reanudar/reintentar/saltar/cambio bobina/confirmar) que
  DELEGAN. Úsala para operar, depurar o extender el panel del trabajador, o para
  entender su contrato de eventos y sus reglas.
when-to-use: >
  - Cuando el trabajador necesite ver el estado en vivo del taller y ejecutar
    acciones HOY (pausar, abortar, reanudar, reintentar, saltar, cambio de bobina,
    confirmar una decisión pendiente).
  - Cuando depures por qué no se repinta el estado, por qué un comando no delega o por
    qué un dato viene como 'desconocido'.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las reglas
    del panel del trabajador (rol HOY, sin gesto de jefe).
  - Cuando vayas a escribir/ampliar el test unitario del panel del trabajador.
tags: [enki, modulo, reflejo, impresora-3d, panel-trabajador, rol-hoy, operativo, proyecto-3d]
---
# panel-trabajador — REFLEJO del rol HOY (cara operativa del trabajador)

## Qué hace el módulo

`panel-trabajador` es un **REFLEJO puro** (sin store propio, sin persistencia) y la cara
**OPERATIVA del trabajador** (rol HOY). Expone:

- **`_estadoVivo`**: pieza actual + progreso + fase del ciclo, cruzando `ciclo-impresion`,
  `cola` y `filamento` por RPC (best-effort; huecos → `desconocido`, nunca inventado).
- **`_proximoAEncadenar`**: la siguiente pieza lista (`cola.siguiente`).
- **`_eventosRecientes`**: últimos registros (`historial.recientes`).
- **`_pendientesConfirmacion`**: confirmaciones que esperan decisión del dueño.
- **`_control`**: comandos HOY que **DELEGAN**:
  `pausar`/`abortar`/`reanudar` → `ciclo-impresion`;
  `reintentar`/`saltar` → `manejo-fallo`;
  `cambio_bobina` → `filamento.cambiar`;
  `confirmar` → `adaptador-confirmacion.confirmar`.

**NADA de decisión futura** (eso es `panel-jefe`). Sin gesto de jefe: no aprueba
propuestas, no marca urgencia futura. **CERO juicio**: cada comando delega por RPC; la
confirmación espera la respuesta del dueño.

## Flujo típico

Caso real: **el trabajador ve el estado en vivo → identifica la pieza o el problema → ejecuta una acción HOY que delega**.

1. El trabajador abre su panel y pide `panel-trabajador.estado_vivo.request` → `_estadoVivo` cruza por RPC (`ciclo-impresion.estado`, `cola.siguiente`, `filamento.evaluar`, `historial.recientes`) y devuelve `{ fase, pieza, cola, filamento, eventos, timestamp }` (huecos → `desconocido`).
2. Pide la siguiente pieza (`proximo_encadenar` → `cola.siguiente`), los últimos eventos (`eventos` → `historial.recientes`) o las decisiones pendientes (`pendientes` → detecta ciclo FALLIDA/esperando).
3. Para actuar, llama `panel-trabajador.control.request` con `{ accion }`. `_control` mapea la acción a su RPC de dominio y delega:
   - `pausar`/`reanudar`/`abortar` → `ciclo-impresion.(pausar|reanudar|abortar).request`;
   - `reintentar`/`saltar` → `manejo-fallo.manejar.request` (con la política);
   - `cambio_bobina` → `filamento.cambiar.request`;
   - `confirmar` → `adaptador-confirmacion.confirmar.request`.
4. Cada delegación responde `{ accion, resultado, delegado_en }`; si la delegación falla → `502` + `panel-trabajador.control.failed`.

El panel es reflejo puro (no muta); cada comando cierra su círculo en `panel-trabajador.<accion>.response`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `panel-trabajador.estado_vivo.request` | `onEstadoVivoRequest` | Estado en vivo: pieza actual + progreso + fase del ciclo (cruzando ciclo, cola, filamento por RPC). |
| `panel-trabajador.proximo_encadenar.request` | `onProximoEncadenarRequest` | Próxima pieza lista para encadenar (cola.siguiente). |
| `panel-trabajador.eventos.request` | `onEventosRequest` | Últimos eventos del taller (historial.recientes). |
| `panel-trabajador.pendientes.request` | `onPendientesRequest` | Confirmaciones pendientes de decisión del dueño. |
| `panel-trabajador.control.request` | `onControlRequest` | Comandos de control HOY (pausar/abortar/reanudar/reintentar/saltar/cambio bobina/confirmar) que DELEGAN en ciclo/filamento/manejo-fallo. |

### Publishes

| Evento | Descripción |
|---|---|
| `panel-trabajador.estado_vivo.response` | Respuesta correlada: estado en vivo del taller. |
| `panel-trabajador.control.failed` | Par de fallo: el comando de control no se pudo ejecutar. |

> Nota: los demás `.response` (`proximo_encadenar`, `eventos`, `pendientes`, `control`)
> se devuelven por response correlada; `module.json` declara explícitamente
> `estado_vivo.response` y `panel-trabajador.control.failed`. En runtime `_control`
> también emite `panel-trabajador.<op>.failed` genérico ante delegación fallida.

> **Regla de cierre de círculo**: todo comando de control cierra su círculo con su par
> de fallo (`panel-trabajador.control.failed`); el resultado de cada delegación se
> responde con `{ accion, resultado, delegado_en }`.

## Reglas de negocio

1. **Cara operativa del rol HOY**: solo acciones HOY; nada de decisión futura, sin gesto
   de jefe (no aprueba propuestas, no marca urgencia futura).
2. **CERO juicio — cada comando delega por RPC**: `_control` mapea la acción a su
   módulo de dominio y ejecuta via `_rpc(topic, payload)`. Si la delegación falla →
   `502 DELEGACON_*` + `panel-trabajador.control.failed`.
3. **Acciones HOY permitidas** (`ACCIONES`): `pausar`, `abortar`, `reanudar`,
   `reintentar`, `saltar`, `cambio_bobina`, `confirmar`. Acción desconocida → `400`.
4. **Lectura best-effort, dato ausente → 'desconocido'** (nunca inventado): `_estadoVivo`
   cruza ciclo/cola/filamento/eventos por Promise.all; si un RPC no responde 200 → hueco
   `desconocido`/`[]`.
5. **Confirmación espera al dueño**: `_pendientesConfirmacion` reporta las decisiones
   pendientes (ciclo en FALLIDA o esperando); `confirmar` delega en
   `adaptador-confirmacion.confirmar` y espera la respuesta del dueño.
6. **Reflejo puro**: sin store propio, sin persistencia; solo proyecta (lee por RPC) y
   delega comandos.

## Uso / cómo invocarlo

Consumidos por la UI del puesto de trabajador. RPCs request/response:

### 1. `estado_vivo` — estado en vivo del taller

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`: `{ fase, pieza, cola, filamento, eventos, timestamp }` (campos faltantes → `desconocido`).

### 2. `proximo_encadenar` / `eventos` / `pendientes`

```json
{ "project_id": "e57a318a-...", "n": 5 }
```
`proximo_encadenar` → `{ siguiente, razon }` · `eventos` → `{ registros, total }` ·
`pendientes` → `{ pendientes, total }`.

### 3. `control` — comando HOY que delega

```json
{
  "project_id": "e57a318a-...",
  "accion": "abortar",
  "motivo": "atascado",
  "tarea_id": "tarea_abc"
}
```
Respuesta `200`: `{ accion, resultado, delegado_en: "ciclo-impresion.abortar.request" }` ·
`400` accion inválida · `502 DELEGACION_*` si falla.

## Tests

El test vive en `tests/unit/panel-trabajador.test.js`. Cubre (del código real):

- `estado_vivo` cruza ciclo+cola+filamento+eventos por RPC (best-effort).
- `proximo_encadenar` devuelve la siguiente (cola.siguiente).
- `eventos` devuelve últimos registros (historial.recientes).
- `pendientes` detecta ciclo FALLIDA/esperando.
- `control` mapea cada acción a su RPC de dominio y delega (`delegado_en`).
- `control` con acción desconocida → `400 INVALID_INPUT`.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/panel-trabajador
node tests/unit/panel-trabajador.test.js
# esperado: panel-trabajador: N/N OK
```

## Notas de implementación

- Clase `PanelTrabajadorReflejo extends ModuloHibridoReflejo`; `name =
  'panel-trabajador'`, `version = 'reflejo-0.1.0'`; FASE 4 TANDA 4 (última).
- Sin store ni persistencia; solo proyección de lectura por RPC (`_rpc`) y delegación de
  comandos (`_control`).
- `ACCIONES` es la whitelist de acciones HOY permitidas.
- Handlers RPC de una línea que delegan en `_atender(e, accion, 'panel-trabajador.<accion>.response', fn)`.
- Dependencias (module.json): `ciclo-impresion`, `cola`, `filamento`, `cupula-gcode`,
  `manejo-fallo`, `historial`.
