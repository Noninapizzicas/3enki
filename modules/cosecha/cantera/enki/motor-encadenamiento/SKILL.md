---
name: motor-encadenamiento
description: >
  Skill FULL del módulo REFLEJO `motor-encadenamiento` del proyecto 3D (taller de
  impresión 3D, una impresora SPARKX i7 que encadena piezas; moneda STL/3MF→GCODE). Al
  terminar una impresión marca la tarea terminada en la cola, ELIGE la siguiente
  (cabecera YA preparada en la cúpula) y la encadena disparando `ciclo-impresion.iniciar.request`;
  si nada listo emite `cola_vacia`. Úsala para operar, depurar o extender el motor de
  encadenamiento, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites encadenar la siguiente pieza tras terminar una impresión 3D.
  - Cuando depures por qué no se encadena la siguiente, por qué queda la impresora
    ociosa (cola_vacia) o por qué el siguiente no es la cabecera preparada esperada.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las reglas
    de negocio del encadenador (CERO juicio: no decide SI imprimir).
  - Cuando vayas a escribir/ampliar el test unitario del motor de encadenamiento.
tags: [enki, modulo, reflejo, impresora-3d, motor-encadenamiento, encadenar, cola, proyecto-3d]
---
# motor-encadenamiento — REFLEJO que ENCADENA la siguiente pieza

## Qué hace el módulo

`motor-encadenamiento` es un **REFLEJO puro** (sin store propio, sin persistencia):
al terminar una impresión (se dispara `motor-encadenamiento.al_terminar.request` tras
consumir `pieza.imprimida`), el motor:

1. **marca la tarea terminada** en la cola (delega por RPC `cola.terminada.request`,
   best-effort; la cola libera la impresora);
2. **ELIGE la siguiente** de la cola (`cola.siguiente.request`: cabecera **YA preparada**
   en la cúpula, una sola impresora) — o la recibe del llamante vía `input.siguiente`;
3. **la encadena** disparando `ciclo-impresion.iniciar.request` (RPC declarado; el
   ciclo-impresion se construyó en la tanda 4);
4. si **no hay nada listo** emite `cola_vacia` (impresora ociosa).

**CERO juicio**: este motor no decide SI imprimir (eso vive en el ciclo-impresion);
solo encadena la cabecera lista que la cola ofrece.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `motor-encadenamiento.al_terminar.request` | `onAlTerminarRequest` | Al terminar una impresión, elige la siguiente de la cola y dispara el ciclo; si nada listo emite `cola_vacia`. |

### Publishes

| Evento | Descripción |
|---|---|
| `motor-encadenamiento.al_terminar.response` | Respuesta correlada: siguiente encadenada (o cola_vacia). |
| `cola_vacia` | Impresora ociosa: nada listo para encadenar. |
| `motor-encadenamiento.al_terminar.failed` | Par de fallo: no se pudo encadenar la siguiente. |

> **Regla de cierre de círculo**: todo flujo responde en `*.response`; ante error
> emite el par de fallo `motor-encadenamiento.al_terminar.failed`. La encadenación
> dispara el ciclo como RPC declarado.

## Reglas de negocio

1. **Encadena SOLO la cabecera lista**: la siguiente debe tener `gcode_listo` (`true`)
   y la impresora libre (una sola impresora); la cola es quien la ofrece
   (`cola.siguiente.request`).
2. **CERO juicio**: no decide SI imprimir (eso es el ciclo-impresion); solo encadena la
   siguiente que la cola da. Encadena `tarea_id`/`modelo_id`/`archivo_id` de la pieza y
   mantiene `correlation_id`.
3. **Marcar terminada antes de encadenar**: delega `cola.terminada.request` (best-effort;
   si falla, el fallo real pasa por `cola.terminada.failed`); la cola libera la impresora.
4. **Si NULO → `cola_vacia`**: si no hay siguiente lista, emite `cola_vacia` (impresora
   ociosa) y responde `{ encadenada: false, cola_vacia: true }`.
5. **RPC declarado al ciclo**: `ciclo-impresion.iniciar.request` se dispara como RPC
   declarado; el ciclo-impresion se construyó en la tanda 4. Reflejo puro: no muta el
   store de la cola directamente (delega por evento/RPC).

## Uso / cómo invocarlo

El consumidor típico es `ciclo-impresion` (en `_manejarTerminada` y en
`_encadenarSiguiente` tras resolver un fallo). RPC request/response:

### 1. `al_terminar` — encadenar la siguiente tras terminar una impresión

```json
{
  "project_id": "e57a318a-...",
  "tarea_id": "tarea_abc",
  "siguiente": { "id": "tarea_def", "modelo_id": "mod_...", "archivo_id": "arch_..." }
}
```
Respuesta `200` (hay siguiente):
```json
{ "encadenada": true, "pieza": { "project_id": "...", "tarea_id": "...", "modelo_id": "...", "archivo_id": "..." } }
```
Respuesta `200` (nada listo): `{ "encadenada": false, "cola_vacia": true }` + emite `cola_vacia`.

## Tests

El test vive en `tests/unit/motor-encadenamiento.test.js`. Cubre (del código real):

- `al_terminar` con siguiente → marca terminada (delega `cola.terminada.request`),
  encadena (dispara el ciclo) y responde `encadenada: true`.
- `al_terminar` sin siguiente → responde `{ encadenada: false, cola_vacia: true }` y
  emite `cola_vacia`.
- `al_terminar` sin `project_id` → `400 INVALID_INPUT`.
- Normaliza la respuesta del RPC `cola.siguiente` (envuelta `{ data: { siguiente } }`,
  `{ siguiente }` o `null`).

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/motor-encadenamiento
node tests/unit/motor-encadenamiento.test.js
# esperado: motor-encadenamiento: N/N OK
```

## Notas de implementación

- Clase `MotorEncadenamientoReflejo extends ModuloHibridoReflejo`; `name =
  'motor-encadenamiento'`, `version = 'reflejo-0.1.0'`; FASE 4 TANDA 3.
- Sin store ni persistencia: es un reflejo puro.
- `_alTerminar` compone por RPC (nunca import): `cola.terminada.request`,
  `cola.siguiente.request` y `ciclo-impresion.iniciar.request`.
- Dependencias (module.json): `cola`, `ciclo-impresion`, `cupula-gcode`.
