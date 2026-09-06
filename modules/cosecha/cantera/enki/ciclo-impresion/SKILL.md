---
name: ciclo-impresion
description: >
  Skill FULL del módulo `ciclo-impresion` (MICRO-AGENTE / ORQUESTADOR) del taller
  personal de impresión 3D (proyecto 3d, SPARKX i7, una pieza a la vez). Es el
  CORAZÓN del sistema y la ÚLTIMA hoja del plan: encadena el ciclo completo
  libre → propuesta → aprobación → imprimiendo → impreso → libre. Es el DUEÑO de
  la máquina de estados del ciclo (en memoria, no persiste). Orquesta por RPC
  (nunca import) cola-impresion, cupula-gcode, gestion-filamento,
  historial-impresiones, adaptador-impresora, adaptador-slicing, adaptador-avisos
  y adaptador-confirmacion. Contrato TOLERANTE: si un RPC falla, el ciclo pasa a
  ERROR y emite ciclo.abortado (nunca basura). Cuando termina una pieza encadena
  la siguiente automáticamente; el dueño retira la pieza y cambia filamento entre
  ciclos (no 100% autónomo).
when-to-use: >
  Usar cuando se trabaje sobre el módulo `ciclo-impresion` del proyecto 3d:
  construir, depurar, extender o verificar el orquestador del ciclo de impresión.
  También como referencia del contrato de eventos, la máquina de estados y las
  reglas de negocio del ciclo (una pieza a la vez, gcode reusable, determinismo
  total, la cola nunca decide qué imprimir, el ciclo no avanza sin gcode, el ciclo
  no presiona al dueño). Aplica a la FASE 5 (escribir-skills) y a cualquier
  operación posterior sobre este módulo.
tags: [enki, modulo, micro-agente, orquestador, impresion-3d, ciclo, maquina-de-estados, proyecto-3d, reflejo]
---

# ciclo-impresion — El ORQUESTADOR del ciclo de impresión 3D

## Qué hace el módulo

`ciclo-impresion` es un **MICRO-AGENTE / ORQUESTADOR** (no CUSTODIO, no PUENTE).
Es el **CORAZÓN del sistema** y la **última hoja del plan** (sección 6.12 de
`plan-construccion.md`). Encadena el ciclo completo:

```
libre → propuesta → aprobación → imprimiendo → impreso → libre
```

Es el **DUEÑO de la máquina de estados del ciclo** (en memoria, no persiste).
No decide qué imprimir (eso lo hace la cola, que solo ordena lo aprobado) ni
aporta juicio (el sistema es 100% determinista, 0 piezas fuzzy): solo ejecuta la
cadena, vigila el progreso, avisa y espera al dueño para las decisiones humanas
(aprobar, retirar, cambiar filamento, reanudar).

**Garantía central (invariante 11):** la impresora nunca queda idle por falta de
gcode — la `cupula-gcode` cachea el gcode por `(modelo, material)` o se slicera
antes de encadenar.

**No 100% autónomo:** cuando termina una pieza, encadena la siguiente
automáticamente, pero el dueño debe retirar la pieza y cambiar filamento entre
ciclos.

## Contrato de eventos (module.json real)

### Subscribes (6)

| Evento | Handler | Qué hace |
|---|---|---|
| `ciclo.iniciar.request` | `onIniciarRequest` | Arranca el ciclo: siguiente pieza de la cola → obtiene gcode → sube → inicia → observa. Emite `ciclo.iniciado` o `ciclo.abortado`/`ciclo.cola_vacia`. |
| `impresion.completada` | `onImpresionCompletada` | DUEÑO: transición `IMPRIMIENDO → ESPERANDO_RETIRADA`, registra en historial, decrementa filamento y avisa. Emite `ciclo.esperando_confirmacion`. |
| `impresion.error` | `onImpresionError` | DUEÑO: transición `IMPRIMIENDO → ERROR`. Emite `ciclo.abortado` y avisa del fallo. |
| `filamento.falta` | `onFilamentoFalta` | DUEÑO: transición `IMPRIMIENDO → PAUSADO_FALTA_FILAMENTO` y avisa de cambio de filamento. |
| `adaptador-confirmacion.confirmacion_recibida` | `onConfirmacionRecibida` | DUEÑO: interpreta la confirmación del dueño (`pieza_retirada`/`filamento_cambiado`/`reanudar_ciclo`) y aplica la transición. |
| `adaptador-impresora.estado_crudo` | `onEstadoCrudo` | DUEÑO: vigila el progreso (3.3) y detecta fin (3.4), error (3.5) o falta de filamento (3.6) del estado interpretado. |

### Publica (10)

| Evento | Descripción |
|---|---|
| `ciclo.iniciado` | El ciclo arrancó (una pieza comenzó a imprimirse). |
| `ciclo.completado` | El ciclo completo terminó (pieza impresa y retirada). |
| `ciclo.abortado` | El ciclo se abortó (error o RPC fallido). **Par de fallo canónico.** |
| `ciclo.cola_vacia` | No hay piezas pendientes al iniciar el ciclo. |
| `ciclo.esperando_confirmacion` | El ciclo espera una confirmación del dueño (retirar / cambiar filamento / reanudar). |
| `impresion.completada` | Una pieza terminó de imprimirse. La consume `historial-impresiones` y `adaptador-avisos`. |
| `impresion.error` | La impresión falló. La consume `adaptador-avisos`. |
| `filamento.falta` | Falta filamento durante la impresión. La consume `adaptador-avisos`. |
| `filamento.usado` | La impresora reportó filamento usado (mm). La consume `gestion-filamento` para decrementar el rollo activo. |
| `progreso.actualizado` | Progreso de la impresión actualizado. La consume `adaptador-avisos` e `historial-impresiones`. |

> Todos los eventos publicados llevan `project_id` top-level + `correlation_id`.

## Cómo se usa (RPCs)

El ciclo **orquesta por RPC (nunca import)**. RPCs que emite:

| RPC (request) | Proveedor | Uso |
|---|---|---|
| `cola.siguiente.request` | cola-impresion | Siguiente pieza de la cola (best-effort). |
| `cupula.buscar.request` | cupula-gcode | ¿Gcode cacheado por `(modelo, material)`? |
| `catalogo.obtener.request` | catalogo-modelos | Obtener el modelo (para su `.archivo3mf`). |
| `adaptador-slicing.slicear.request` | adaptador-slicing | Slicear si no hay gcode cacheado. |
| `cupula.almacenar.request` | cupula-gcode | Guardar el gcode slicado (reutilizar sin reslicear). |
| `adaptador-impresora.subir_gcode.request` | adaptador-impresora | Subir gcode a la impresora. |
| `adaptador-impresora.iniciar_impresion.request` | adaptador-impresora | Iniciar la impresión. |
| `adaptador-impresora.observar_estado.request` | adaptador-impresora | Abrir el stream de observación (push). |
| `adaptador-avisos.enviar.request` | adaptador-avisos | Pedir un aviso al dueño (best-effort, no bloquea). |

RPC que **recibe** (lo invoca `scheduler` o el dueño):

| RPC | Handler |
|---|---|
| `ciclo.iniciar.request` | `onIniciarRequest` → `_iniciar` |

## Reglas de negocio — máquina de estados

Estados canónicos (DUEÑO, en memoria): `IDLE`, `OBTENIENDO_GCODE`,
`SUBIENDO_GCODE`, `IMPRIMIENDO`, `ESPERANDO_RETIRADA`,
`PAUSADO_FALTA_FILAMENTO`, `ERROR`, `COLA_VACIA`.

```
IDLE ──ciclo.iniciar──▶ OBTENIENDO_GCODE
OBTENIENDO_GCODE ──gcode ok──▶ SUBIENDO_GCODE
OBTENIENDO_GCODE ──cola vacía──▶ COLA_VACIA
OBTENIENDO_GCODE ──sin .3mf / slicer falla──▶ ERROR
SUBIENDO_GCODE ──subida ok──▶ IMPRIMIENDO
SUBIENDO_GCODE ──subida falla──▶ ERROR
IMPRIMIENDO ──impresion.completada──▶ ESPERANDO_RETIRADA
IMPRIMIENDO ──filamento.falta──▶ PAUSADO_FALTA_FILAMENTO
IMPRIMIENDO ──impresion.error──▶ ERROR
ESPERANDO_RETIRADA ──confirmación pieza_retirada──▶ IDLE (encadena siguiente)
PAUSADO_FALTA_FILAMENTO ──confirmación filamento_cambiado──▶ IMPRIMIENDO
ERROR ──confirmación reanudar_ciclo──▶ IDLE
COLA_VACIA ──ciclo.iniciar (nueva pieza)──▶ OBTENIENDO_GCODE
```

**Transición ilegal → throw** (`transición ilegal: X --evento--> ?`). El handler
que la dispara captura el error y llama a `_abortar` (→ `ERROR` + `ciclo.abortado`).

### Flujo de `_iniciar` (el corazón)

1. **Guardas**: si ya está `IMPRIMIENDO`/`ESPERANDO_RETIRADA`/`PAUSADO_FALTA_FILAMENTO`/`SUBIENDO_GCODE`/`OBTENIENDO_GCODE` → `409 CONFLICT_STATE` (una pieza a la vez). `COLA_VACIA` sí permite re-iniciar.
2. **Siguiente pieza** (`cola.siguiente.request`). Si `vacia` → `COLA_VACIA` + `ciclo.cola_vacia` + aviso.
3. **Obtener gcode** (`_obtenerGcode`, 3.1): cúpula primero (reutilizar), slicer si no está cacheado. Sin `.3mf` o slicer falla → `_abortar` (invariante 7).
4. **Subir gcode** (`subir_gcode`). Requiere `ok:true` → si no, `_abortar`.
5. **Iniciar impresión** (`iniciar_impresion`). Requiere `ok:true` → si no, `_abortar`.
6. **Observar** (`observar_estado`): si el stream no abre, no bloquea (la impresora ya imprime) pero se avisa con `warn`.
7. Emite `ciclo.iniciado`.

### `_obtenerGcode` (3.1) — enrutamiento cúpula vs slicer

1. `cupula.buscar` por `(modelo_id, material)`. Si `encontrado` → reutiliza (no slicera).
2. Si no → `catalogo.obtener` para el `.archivo3mf`. Sin `.archivo3mf` → `ciclo.abortado` (motivo `sin_archivo_3mf`) y `null`.
3. `adaptador-slicing.slicear`. Si falla → `ciclo.abortado` (motivo `slicer_fallo`) y `null`.
4. Guarda en la cúpula (`cupula.almacenar`) con clave `modeloId::material` para reutilizar sin reslicear (invariante 3).

### Vigilancia y detecciones (desde `onEstadoCrudo`, solo en `IMPRIMIENDO`)

- **`_vigilarProgreso` (3.3)**: emite `progreso.actualizado` (progress, current_layer, total_layer) y `filamento.usado` (si `filament_used_mm > 0`).
- **`_detectarFin` (3.4)**: `estado === 'completado'` → `impresion.completada`.
- **`_detectarError` (3.5)**: `estado === 'fallo'` → `impresion.error` (`error_desconocido` si sin message).
- **`_detectarFaltaFilamento` (3.6)**: `filament_detected === false` → `filamento.falta`.

### Confirmaciones (`onConfirmacionRecibida`)

Tipos reconocidos: `pieza_retirada`, `filamento_cambiado`, `reanudar_ciclo`,
`modelo_aprobado`, `modelo_rechazado`. Un tipo **no reconocido** (`no_reconocida`)
**no transiciona** (pide aclaración, 12.2).

### Encadenar siguiente (`_encadenarSiguiente`)

Tras `pieza_retirada` (el ciclo ya está en `IDLE`), re-inicia con la siguiente.
Si la cola está vacía → `ciclo.completado` (impresora ociosa con causa).

## Orquestación de la cadena completa

El ciclo compone (por RPC, nunca import) a los demás módulos del sistema:

- **cola-impresion** — `siguiente` (extrae la pieza a imprimir).
- **cupula-gcode** — `buscar`/`almacenar` (caché de gcode por `(modelo, material)`).
- **catalogo-modelos** — `obtener` (para el `.archivo3mf`).
- **gestion-filamento** — decrementa vía `filamento.usado` (evento, no RPC).
- **historial-impresiones** — `registrar` (al completar).
- **adaptador-impresora** — `subir_gcode`/`iniciar_impresion`/`observar_estado`.
- **adaptador-slicing** — `slicear` (si no hay gcode cacheado).
- **adaptador-avisos** — `enviar` (avisos al dueño, best-effort).
- **adaptador-confirmacion** — recibe `confirmacion_recibida` (decisiones del dueño).

## Invariantes que este módulo garantiza

1. **Una pieza a la vez** — el ciclo es secuencial; no arranca la siguiente hasta que la anterior termina (o falla/pausa) y el dueño confirma la retirada.
3. **Gcode reusable** — se guarda por `(modelo, material)` y se reutiliza sin reslicear.
4. **Determinismo total** — 0 piezas fuzzy; el dueño aporta todo el juicio.
6. **La cola nunca decide qué imprimir** — solo ordena lo aprobado.
7. **El ciclo no avanza sin gcode** — si el slicer falla o no hay `.3mf`, se detiene y avisa.
8. **El ciclo no presiona al dueño** — espera la confirmación sin reimprimir ni recordatorios.
11. **La impresora nunca queda idle por falta de gcode** — la cúpula garantiza el siguiente gcode (o se slicera antes de encadenar).

## Verificación (test unitario)

Suite: `tests/unit/ciclo-impresion__iniciar.test.js`. Cubre:

- **Máquina de estados** (`_aplicarTransicion`): transiciones legales (IDLE→OBTENIENDO_GCODE, IMPRIMIENDO→ESPERANDO_RETIRADA, ESPERANDO_RETIRADA→IDLE, IMPRIMIENDO→PAUSADO_FALTA_FILAMENTO, PAUSADO→IMPRIMIENDO, ERROR→IDLE) y **ilegales → throw** (IDLE--impresion.completada, IMPRIMIENDO--ciclo.iniciar).
- **`_iniciar`**: cola vacía → `COLA_VACIA` + `ciclo.cola_vacia`; con pieza → `IMPRIMIENDO` + `ciclo.iniciado` (gcode de cúpula o slicer); sin `.3mf` → `CICLO_ABORTADO`; slicer falla → `CICLO_ABORTADO`; subida falla → `CICLO_ABORTADO`; ya imprimiendo → `409 CONFLICT_STATE`.
- **`_obtenerGcode`**: cúpula con gcode → reutiliza; sin `.3mf` → `null`.
- **Detecciones**: `_detectarFin` (completado → `impresion.completada`), `_detectarError` (fallo → `impresion.error` con `error_desconocido`), `_detectarFaltaFilamento` (filament_detected false → `filamento.falta`).
- **`_vigilarProgreso`**: emite `progreso.actualizado` + `filamento.usado`.
- **`onEstadoCrudo`**: en `IMPRIMIENDO` detecta; fuera de `IMPRIMIENDO` ignora.
- **`onConfirmacionRecibida`**: `pieza_retirada`→IDLE, `filamento_cambiado`→IMPRIMIENDO, `reanudar_ciclo`→IDLE, `no_reconocida`→no transiciona.
- **`_encadenarSiguiente`**: cola vacía → `ciclo.completado`; hay siguiente → re-inicia y emite `ciclo.iniciado`.

Ejecutar:

```bash
node /opt/enki/modules/ciclo-impresion/tests/unit/ciclo-impresion__iniciar.test.js
# Esperado: [ciclo-impresion__iniciar] OK 27/27
```

La suite usa stubs de `eventBus`/`_rpc` (sin bus ni fs): las proyecciones se
invocan directas. Verificación adicional: smoke de la cadena completa + gate
`validate-hibridos`.

## Pitfalls

- **No persiste estado**: la máquina de estados es runtime (`config.persistence.scope: runtime`, `in-memory`). Si el proceso cae, el ciclo se reanuda desde `IDLE` al reiniciar; el estado real de la impresora lo reporta `adaptador-impresora`.
- **`onEstadoCrudo` solo vigila en `IMPRIMIENDO`**: si el ciclo no está en ese estado, ignora el evento (no detecta nada).
- **Confirmación no reconocida no transiciona**: `no_reconocida` pide aclaración, nunca fuerza una transición.
- **`observar_estado` que no abre no bloquea**: la impresora ya imprime; solo se loguea `warn`.
- **Contrato tolerante**: cualquier RPC que falle o no devuelva `ok:true` → `_abortar` → `ERROR` + `ciclo.abortado`. Nunca se produce basura.
- **El ciclo no decide**: no reordena la cola ni aprueba modelos; eso lo hacen el dueño y `cola-impresion`.
