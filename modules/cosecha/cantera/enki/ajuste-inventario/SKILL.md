---
name: ajuste-inventario
description: >-
  Skill FULL del módulo REFLEJO STATELESS `ajuste-inventario` de la vertical
  contabilidad (Enki). REGULARIZA la merma/rotura con ASIENTO Y AVISO. Calcula la
  DIFERENCIA de inventario: diferencia = cantidad_teórica − cantidad_real
  (merma/rotura si >0). Determinista. Sube el asiento a escritor-diario (B2) si las
  cuentas son declarables y el aviso a motor-avisos (K2) si supera el umbral. No
  duplica inventario ni valor. Invariante: dato ausente = desconocido (abierto). No
  escribe el diario (lo sube); no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites calcular la diferencia de inventario (merma/rotura) de un
    recuento (RPC ajuste-inventario.diferencia.request).
  - Cuando depures una diferencia abierta (faltan cantidad teórica/real) o por qué no
    sube el aviso.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y la
    subida del asiento/aviso.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, analitica, inventario, merma, regularizacion, determinista]
---

# ajuste-inventario — REFLEJO STATELESS de la regularización de mermas

## Qué hace el módulo

`ajuste-inventario` es un **REFLEJO STATELESS** (H3, hoja del plan): **REGULARIZA**
la **merma/rotura** con **ASIENTO Y AVISO**. Calcula la **DIFERENCIA** de
inventario: `diferencia = cantidad_teorica − cantidad_real` (**merma/rotura si
>0**). **DETERMINISTA**: mismas cifras → misma diferencia.

La diferencia **SUBE el asiento** a `escritor-diario` B2 (si las cuentas son
declarables) y **SUBE un aviso** a `motor-avisos` K2 (si supera el umbral
declarado). **NO duplica el inventario** (infra reutilizada) ni el valor
(`valoracion-existencia` H1): solo **DERIVA** la diferencia de lo declarado.

**Invariante**: dato ausente = desconocido (sin cantidad teórica o real →
**ABIERTO**). Escucha `contabilidad.hecho_recibido` (`puerto-evento-vertical` A1) —
ese emisor **YA existe** → **sí se declara**. Su op es **CLASE PREGUNTA** → sin
`ui_handler`. STATELESS: sin PosPersistencia.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `ajuste-inventario.diferencia.request` | `onDiferenciaRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, articulo?, cantidad_teorica, cantidad_real, coste_unitario?, cuentas?, umbral?}` → `{project_id, ajuste, diferencia, merma, sobrante, valor, asiento_propuesto, aviso_subido, abierto}`. Calcula la diferencia (determinista) y sube el asiento a `escritor-diario` y el aviso a `motor-avisos`. Responde por `ajuste-inventario.diferencia.response`; payload inválido → `ajuste-inventario.diferencia.failed`. |
| `contabilidad.hecho_recibido` | `onHechoRecibido` | Señal (fire-and-forget) de `puerto-evento-vertical` A1: un hecho con recuento de inventario entró → se deriva la diferencia y se regulariza. Solo si el hecho declara inventario/recuento (no se inventa la merma). |

### Publishes

| Evento | Descripción |
|---|---|
| `escritor-diario.asentar.request` | Subida (REQUEST por EVENTO) a B2: el asiento de regularización (solo si las cuentas declaradas cuadran). AjusteInventario NO escribe el diario; le sube el asiento. |
| `motor-avisos.producir.request` | Subida (REQUEST por EVENTO) a K2: el aviso de la merma/rotura relevante (si supera el umbral declarado). |
| `ajuste-inventario.diferencia.response` | Respuesta RPC correlada de la op `diferencia` (una sola cara: el bus). |
| `ajuste-inventario.diferencia.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `diferencia.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `diferencia` | **PREGUNTA** (bus, sin panel) | `{project_id, articulo?, cantidad_teorica, cantidad_real, coste_unitario?, cuentas?, umbral?}` | `{project_id, ajuste, diferencia, merma, sobrante, valor, asiento_propuesto, aviso_subido, abierto}` | `400 INVALID_INPUT project_id` |

Tool expuesta: `ajuste-inventario.diferencia` (`toolDiferencia` → `_diferencia`).

## Reglas de negocio

1. **Diferencia determinista**: `diferencia = cantidad_teorica − cantidad_real`;
   `merma` si >0, `sobrante` si <0. Mismas cifras → misma diferencia.
2. **Faltan cantidades no se estima**: si falta la cantidad teórica o la real →
   `abierto.diferencia = 'faltan cantidad teorica y/o real: la merma no se estima'`.
3. **Asiento por EVENTO**: sube `escritor-diario.asentar.request` (B2) **solo si las
   cuentas declaradas cuadran** (`_asiento`/`_regularizar`). No escribe el diario.
4. **Aviso por EVENTO**: sube `motor-avisos.producir.request` (K2) **solo si la
   merma supera el umbral declarado** (`aviso_subido`).
5. **No duplica inventario ni valor**: solo deriva de lo declarado.
6. **Sin `project_id`** → `400 INVALID_INPUT` + `.failed`.
7. **No escribe, no persiste**: reflejo derivador.
8. **HTTP exacto**: éxito `200`; falta `project_id` → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `diferencia` — regularizar una merma

```json
{
  "project_id": "e57a318a-...",
  "articulo": "ART-1",
  "cantidad_teorica": 100,
  "cantidad_real": 95,
  "coste_unitario": 2.5,
  "cuentas": { "gasto": "610", "existencias": "300" },
  "umbral": 10,
  "correlation_id": "abc-123"
}
```
Respuesta `200` (sube asiento a B2 y aviso a K2 si procede):
```json
{ "project_id": "e57a318a-...", "ajuste": { "articulo": "ART-1" }, "diferencia": 5, "merma": true, "sobrante": false, "valor": 12.5, "asiento_propuesto": { "lineas": [ ... ] }, "aviso_subido": false, "abierto": { "diferencia": null, "articulo": null } }
```
Sin cantidades → `abierto.diferencia` declarado (no se estima).

## Errores y qué significan

- `400 INVALID_INPUT project_id` — falta el proyecto.
- `200 {abierto.diferencia}` — faltan cantidades: la merma no se estima.
- `200 {abierto.articulo}` — no se declara artículo.
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.hecho_recibido` (A1
  `puerto-evento-vertical`).
- **Hacia delante (sube por evento)**: `escritor-diario.asentar.request` (B2) el
  asiento; `motor-avisos.producir.request` (K2) el aviso.
- No escribe el diario ni persiste: derivador.

## Verificación

- **Fichero**: `modules/contabilidad-analitica/ajuste-inventario/` (clase
  `AjusteInventario extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "hecho_recibido" module.json index.js` y confirmar
  `escritor-diario.asentar.request` / `motor-avisos.producir.request` en `index.js`.
- **Test unitario**: teórica 100, real 95 → `diferencia:5`, `merma:true`; sin
  cantidades → `abierto.diferencia`; sube aviso solo si supera el umbral.

## Notas de implementación

- Stateless: sin `PosPersistencia`.
- Helpers: `_diferencia`, `_asiento`, `_regularizar`, `_num`, `toolDiferencia`.
