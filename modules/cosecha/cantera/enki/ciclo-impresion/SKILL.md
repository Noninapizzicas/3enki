---
name: ciclo-impresion
description: >
  Skill FULL del módulo REFLEJO / ORQUESTADOR `ciclo-impresion` del proyecto 3D (taller
  de impresión 3D, una impresora SPARKX i7 que encadena piezas; moneda STL/3MF→GCODE).
  Es el DUEÑO de la máquina de estados del ciclo (LIBRE→PREPARANDO→IMPRIMIENDO→TERMINADA
  | FALLIDA | CANCELADA): inicia por adaptador-impresora, observa estados, confirma
  transiciones, avisa al terminar/fallar y encadena. Úsala para operar, depurar o
  extender el ciclo de impresión, o para entender su contrato de eventos y sus reglas.
when-to-use: >
  - Cuando necesites iniciar, pausar, reanudar o abortar una impresión 3D.
  - Cuando depures por qué un ciclo no arranca, queda bloqueado en un estado o no
    registra/descuenta/encadena al terminar.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y la máquina
    de estados del ciclo de impresión (CERO juicio automático).
  - Cuando vayas a escribir/ampliar el test unitario del orquestador del ciclo.
tags: [enki, modulo, reflejo, orquestador, impresora-3d, ciclo-impresion, maquina-de-estados, proyecto-3d]
---
# ciclo-impresion — REFLEJO / ORQUESTADOR del ciclo de impresión 3D

## Qué hace el módulo

`ciclo-impresion` es un **REFLEJO / ORQUESTADOR** y el **DUEÑO de la máquina de estados**
del ciclo de impresión. Compone por **RPC (nunca import)**: `adaptador-impresora`
(`subir_gcode` / `iniciar_impresion`), `historial.registrar`, `filamento.descontar`,
`motor-encadenamiento.al_terminar`, `manejo-fallo.manejar` y `adaptador-avisos`
(fire-and-forget `aviso.solicitar`).

Máquina de estados determinista (una sola impresora → nunca dos en IMPRIMIENDO; estado
ilegal imposible vía `_aplicarTransicion`):

```
LIBRE --iniciar--> PREPARANDO --subida_ok--> IMPRIMIENDO
IMPRIMIENDO --pausar--> PAUSADO --reanudar--> IMPRIMIENDO
IMPRIMIENDO --completado--> TERMINADA  -> historial + filamento.descontar + encadena
IMPRIMIENDO --fallo--> FALLIDA        -> manejo-fallo (siempre avisa)
IMPRIMIENDO --abortar--> CANCELADA    -> historial CANCELADA
FALLIDA --reintentar|saltar aprobado--> LIBRE (el dueño decide)
```

**Invariantes**: TERMINADA SIEMPRE registra (historial) + descuenta (filamento, solo si
hubo dato medido) + encadena. FALLO SIEMPRE avisa y delega en `manejo-fallo`. **CERO
juicio**: reintento/salto/especulación van por `adaptador-confirmacion` (el dueño decide).

El estado vive **EN MEMORIA** (sin PosPersistencia): si el proceso cae el ciclo se
reanuda desde LIBRE; el estado real lo reporta el adaptador externo. Encola/imprime
siempre piezas con **GCODE listo** (moneda real).

## Flujo típico

Caso real: **encolar → iniciar el ciclo → imprimir → terminar → registra/descuenta/encadena** (y el fallo siempre avisa).

1. `motor-encadenamiento` dispara `ciclo-impresion.iniciar.request` con `{ project_id, tarea_id, modelo_id, archivo_id }`.
2. `_iniciar` valida (ciclo no-LIBRE → `409 CONFLICT_STATE`; sin gcode → `abortarCiclo` `sin_gcode_listo`): obtiene el gcode (`cupula-gcode.obtener` si solo llega `archivo_id`), lo **sube** (`adaptador-impresora.subir_gcode`), **inicia** (`adaptador-impresora.iniciar_impresion`), marca la tarea en `cola.imprimiendo` y transiciona `LIBRE→PREPARANDO→IMPRIMIENDO` (publica `impresion.iniciada`).
3. Durante la impresión, `onEstadoCrudo` observa el estado físico (`adaptador-impresora.estado_crudo`): `completado → _manejarTerminada`, `fallo → _manejarFallo`, `pausado → PAUSADO`.
4. `_manejarTerminada`: `IMPRIMIENDO→TERMINADA`, registra en `historial.registrar` (`OK`), descuenta `filamento.descontar` solo con gramo medido, llama `motor-encadenamiento.al_terminar` y publica `impresion.finalizada`.
5. `_manejarFallo`: `IMPRIMIENDO→FALLIDA`, publica `impresion.fallida` y delega SIEMPRE en `manejo-fallo.manejar`.
6. El dueño resuelve por `adaptador-confirmacion.confirmacion_recibida` (`reanudar_ciclo`/`pieza_retirada`): `FALLIDA→LIBRE` (publica `ciclo-impresion.resuelto` y encadena si `reanudar_ciclo`). Abortar (`abortar`) → `CANCELADA` + `ciclo_abortado`.

Invariante: TERMINADA siempre registra + descuenta (con dato) + encadena; FALLO siempre avisa y delega en manejo-fallo.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response + observación + confirmación)

| Evento | Handler | Descripción |
|---|---|---|
| `ciclo-impresion.iniciar.request` | `onIniciarRequest` | Inicia el ciclo de una pieza con GCODE listo: obtiene gcode, sube a la impresora e inicia la impresión (LIBRE→PREPARANDO→IMPRIMIENDO). |
| `ciclo-impresion.pausar.request` | `onPausarRequest` | Pausa la impresión actual (IMPRIMIENDO→PAUSADO). |
| `ciclo-impresion.reanudar.request` | `onReanudarRequest` | Reanuda la impresión pausada (PAUSADO→IMPRIMIENDO). |
| `ciclo-impresion.abortar.request` | `onAbortarRequest` | Aborta la impresión por decisión del trabajador (→CANCELADA; registra historial CANCELADA). |
| `adaptador-impresora.estado_crudo` | `onEstadoCrudo` | (observación, fire-and-forget) solo vigila IMPRIMIENDO: completado→TERMINADA, fallo→FALLIDA, pausado→PAUSADO. |
| `adaptador-confirmacion.confirmacion_recibida` | `onConfirmacionRecibida` | (confirmación del dueño) solo cierra ciclos en FALLIDA con tipo `reanudar_ciclo`/`pieza_retirada` → LIBRE (+ encadena si `reanudar_ciclo`). |

> Nota: `onEstadoCrudo` y `onConfirmacionRecibida` son fire-and-forget (no RPC) que el
> módulo publica/vigila en runtime; no son `.request`, sino eventos que el ciclo lee para
> transicionar la máquina.

### Publishes

| Evento | Descripción |
|---|---|
| `ciclo-impresion.iniciar.response` | Respuesta correlada: impresión iniciada (o fallo). |
| `ciclo-impresion.pausar.response` | Respuesta correlada: impresión pausada. |
| `ciclo-impresion.reanudar.response` | Respuesta correlada: impresión reanudada. |
| `ciclo-impresion.abortar.response` | Respuesta correlada: impresión abortada. |
| `impresion.iniciada` | La pieza pasa a IMPRIMIENDO (aviso de inicio). |
| `impresion.registrada` | Re-emite cuando termina y registra en historial. |
| `impresion.fallida` | Fallo físico → siempre avisa y delega en manejo-fallo. |
| `impresion.finalizada` | La pieza termina OK y se encadena la siguiente. |
| `ciclo_abortado` | Aborto por el trabajador (historial CANCELADA). |
| `ciclo-impresion.resuelto` | El dueño resuelve un fallo (emite en `onConfirmacionRecibida`). |
| `ciclo-impresion.iniciar.failed` | Par de fallo: no se pudo iniciar el ciclo. |
| `ciclo-impresion.abortar.failed` | Par de fallo: no se pudo abortar el ciclo. |

> Nota: `ciclo-impresion.resuelto` no está en el `module.json` pero sí lo emite el
> `index.js` en `onConfirmacionRecibida` (resolución de fallo por el dueño).

> **Regla de cierre de círculo**: todo flujo cierra su círculo con su par de fallo
> canónico. Contrato TOLERANTE: si un RPC falla → CANCELADA/aborto + par de fallo,
> nunca basura.

## Reglas de negocio

1. **Máquina de estados determinista**: transiciones solo según `TRANSICIONES`; un
   evento ilegal desde el estado actual lanza 'transición ilegal' (garantiza una pieza a
   la vez y estados imposibles).
2. **Una sola impresora**: si hay un ciclo activo (no LIBRE/FALLIDA/CANCELADA), `iniciar`
   → `409 CONFLICT_STATE` (abortar primero).
3. **MONEDA REAL — solo piezas con GCODE listo**: `iniciar` exige `gcode`/
   `gcode_contenido`/`archivo_id`; obtiene el gcode por `cupula-gcode.obtener.request`
   si solo llega `archivo_id`. Sin gcode → aborta (`sin_gcode_listo`).
4. **TERMINADA SIEMPRE registra + descuenta + encadena** (invariante del plano):
   `_manejarTerminada` → `historial.registrar` (`resultado: 'OK'`), `filamento.descontar`
   SOLO si hubo `gramos` medido (`filament_used_mm * 0.001`), y
   `motor-encadenamiento.al_terminar`.
5. **FALLO SIEMPRE avisa y delega en manejo-fallo**: `_manejarFallo` publica
   `impresion.fallida` y llama `manejo-fallo.manejar.request`.
6. **CERO juicio**: el reintento/salto tras un fallo es decisión del dueño por
   `adaptador-confirmacion`; el ciclo solo pasa a LIBRE cuando llega
   `confirmacion_recibida` (`reanudar_ciclo` → encadena).
7. **Estado en memoria**: sin PosPersistencia; al reiniciar el ciclo arranca desde LIBRE
   (el estado real lo reporta el adaptador externo).

## Uso / cómo invocarlo

Los consumidores típicos son `motor-encadenamiento` (dispara `iniciar`),
`panel-trabajador` (control pausar/abortar/reanudar) y el adaptador de la impresora (push
de estado). RPCs request/response:

### 1. `iniciar` — iniciar el ciclo de una pieza con GCODE listo

```json
{
  "project_id": "e57a318a-...",
  "tarea_id": "tarea_abc",
  "modelo_id": "mod_soporte",
  "archivo_id": "arch_soporte_1",
  "material": "PETG"
}
```
Respuesta `200`: `{ "estado": "IMPRIMIENDO", "pieza": {...}, "iniciada": true }` ·
`409 CONFLICT_STATE` si ya hay ciclo activo · `400` sin gcode/archivo.

### 2. `pausar` / `reanudar`

```json
{ "project_id": "e57a318a-..." }
```
`200` con `{ "estado": "PAUSADO"|"IMPRIMIENDO" }` · `409` sin ciclo activo o transición ilegal.

### 3. `abortar`

```json
{ "project_id": "e57a318a-...", "motivo": "atascado" }
```
`200`: `{ "estado": "CANCELADA", "motivo }` + emite `ciclo_abortado`.

## Tests

El test vive en `tests/unit/ciclo-impresion.test.js`. Cubre (del código real):

- `iniciar` completa la secuencia LIBRE→PREPARANDO→IMPRIMIENDO (obtiene gcode, sube,
  inicia, marca IMPRIMIENDO en cola) y emite `impresion.iniciada`.
- `iniciar` con ciclo no-LIBRE → `409 CONFLICT_STATE`.
- `pausar`/`reanudar` transicionan PAUSADO; transición ilegal → `409 ESTADO_ILEGAL`.
- `abortar` → CANCELADA + `ciclo_abortado`; abortar sin ciclo → `409`.
- `onEstadoCrudo` completado → `_manejarTerminada` (registra historial, descuenta
  filamento con gramos, encadena, emite `impresion.finalizada`).
- `onEstadoCrudo` fallo → `_manejarFallo` (emite `impresion.fallida`, delega en
  `manejo-fallo.manejar`).
- `onConfirmacionRecibida` resuelve FALLIDA → LIBRE (+ encadena si `reanudar_ciclo`).

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/ciclo-impresion
node tests/unit/ciclo-impresion.test.js
# esperado: ciclo-impresion: N/N OK
```

## Notas de implementación

- Clase `CicloImpresionReflejo extends ModuloHibridoReflejo`; `name = 'ciclo-impresion'`,
  `version = 'reflejo-0.1.0'`; FASE 4 TANDA 4 (última).
- Estado en `this._ciclos` (`Map` pid → `{ estado, pieza, gcode, error, esperando,
  reintentos }`), EN MEMORIA (sin PosPersistencia; `onUnload` no persiste).
- `TRANSICIONES` define los eventos legales; `_aplicarTransicion` lanza 'transición ilegal'
  si el evento no es legal desde el estado actual.
- `_atender` delega los 4 RPCs; `onEstadoCrudo` y `onConfirmacionRecibida` son
  fire-and-forget no declarados como `.request`.
- `_round` redondea a 2 decimales; conversión mm→g aproximada en `_manejarTerminada`.
- Dependencias (module.json): `adaptador-impresora`, `historial`, `filamento`,
  `manejo-fallo`, `motor-encadenamiento`, `adaptador-avisos`.
