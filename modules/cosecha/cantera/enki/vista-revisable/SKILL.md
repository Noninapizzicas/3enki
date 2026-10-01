---
name: vista-revisable
description: >-
  Skill FULL del módulo REFLEJO STATELESS `vista-revisable` de la vertical
  contabilidad (Enki). Muestra cada asiento/cálculo CON su ORIGEN: composición
  determinista de la traza. NO es caja negra (caja_negra:false): cada línea va
  junto a los componentes que la explican (traza, documento, regla, fuente,
  criterio, hecho, tercero); lo sin origen NO se oculta → se declara sin_origen en
  abierto. No escribe, no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites explicar un asiento/cálculo con su origen (RPC
    vista-revisable.explicar.request).
  - Cuando depures una vista con explicable:false (líneas sin origen declaradas) o
    un 400 INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y los
    componentes de origen.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, libro, trazabilidad, explicabilidad, sin-caja-negra]
---

# vista-revisable — REFLEJO STATELESS de la vista explicable

## Qué hace el módulo

`vista-revisable` es un **REFLEJO STATELESS** (L2, hoja del plan): muestra cada
asiento/cálculo **CON su ORIGEN** — composición determinista de la traza.
**NO es caja negra** (`caja_negra:false`): cada línea se muestra junto a los
componentes que la explican (**traza** B4, **documento** L7, **regla**, **fuente**,
**criterio**, **hecho**, **tercero**); lo que **NO tiene origen NO se oculta** → se
declara `sin_origen` en `abierto` (`explicable:false`).

Sube por EVENTO (best-effort) a `traza-asiento.registrar.request` y
`mayor-balanza.saldos.request` para traer el origen cuando no viene declarado;
**NUNCA escribe ni muta el libro**. No persiste. Su op es **CLASE PREGUNTA** → va
por el bus, sin panel. Publica `vista-revisable.explicar.response` y su par
`.failed`. Escucha `contabilidad.asiento_asentado` (B2 `escritor-diario`).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `vista-revisable.explicar.request` | `onExplicarRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, asiento\|calculo, traza?, origen?, titulo?}` → `{project_id, lineas, origen, explicable, caja_negra, abierto}`. Compone cada línea con sus componentes de origen; lo sin origen se declara, no se oculta. Responde por `vista-revisable.explicar.response`. Payload inválido → `vista-revisable.explicar.failed`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (B2 escritor-diario): un asiento quedó en el libro. Se recuerda (ventana acotada) por si hay que explicarlo; no se escribe. |

### Publishes

| Evento | Descripción |
|---|---|
| `vista-revisable.explicar.response` | Respuesta RPC correlada de la op `explicar` (una sola cara: el bus). |
| `vista-revisable.explicar.failed` | Par de fallo determinista: falta `project_id` o `asiento` → `{status, code, message}`. Cierra el círculo de `explicar.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `explicar` | **PREGUNTA** (bus) | `{project_id, asiento\|calculo, traza?, origen?, titulo?}` | `{project_id, lineas, origen, explicable, caja_negra, abierto}` | `400 INVALID_INPUT` (`project_id`, `asiento`) |

Tool expuesta: `vista-revisable.explicar` (`toolExplicar` → `_explicar`).

## Reglas de negocio

1. **Componentes de origen (const `ORIGENES`)**: `['traza', 'documento',
   'documento_id', 'referencia', 'regla', 'fuente', 'criterio', 'hecho', 'tercero']`.
   Cada línea se explica por ellos (`_componentes`).
2. **No caja negra**: `caja_negra:false` siempre. Lo que no tiene origen se declara
   `sin_origen` → `explicable:false` (no se oculta).
3. **Trae el origen por EVENTO si falta**: sube best-effort a
   `traza-asiento.registrar.request` (B4) y `mayor-balanza.saldos.request` (B3).
4. **Nunca escribe ni muta el libro**: es solo lectura/explicación.
5. **Sin `asiento`/`calculo`** → `400 INVALID_INPUT asiento`; sin `project_id` →
   `400`.
6. **No persiste**: sin `PosPersistencia`.
7. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `explicar` — cada línea con su origen

```json
{
  "project_id": "e57a318a-...",
  "asiento": { "numero": 5, "lineas": [ { "cuenta": "600", "debe": 120 }, { "cuenta": "400", "haber": 120 } ], "documento_id": "FAC-1", "regla": "compra-material" },
  "titulo": "Compra de material",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "lineas": [ { "cuenta": "600", "debe": 120, "origen": { "documento_id": "FAC-1", "regla": "compra-material" } }, { "cuenta": "400", "haber": 120, "origen": { "documento_id": "FAC-1" } } ], "origen": { "documento_id": "FAC-1", "regla": "compra-material" }, "explicable": true, "caja_negra": false, "abierto": { "sin_origen": null } }
```
Línea sin origen → `explicable:false` y `abierto.sin_origen` declarado.

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `asiento` — falta el campo.
- `200 {explicable:false, abierto.sin_origen}` — hay líneas sin origen (declarado, no
  oculto).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.asiento_asentado` (B2 `escritor-diario`).
  Sube best-effort `traza-asiento.registrar.request` (B4) y
  `mayor-balanza.saldos.request` (B3).
- **Hacia delante (lo consumen)**: la revisión del asesor, `informe-accionable` (R2).
- No escribe: explicador puro.

## Verificación

- **Fichero**: `modules/contabilidad-libro/vista-revisable/` (clase `VistaRevisable
  extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "explicar.request" module.json` y
  `grep -F "ORIGENES" index.js`.
- **Test unitario**: asiento con documento/regla → `explicable:true`,
  `caja_negra:false`; línea sin origen → `explicable:false` + `abierto.sin_origen`;
  sin `asiento` → `400 INVALID_INPUT`.

## Notas de implementación

- Stateless: sin `PosPersistencia`; ventana observada en memoria.
- Helpers: `_explicar`, `_origenDe`, `_lineasDe`, `_componentes`, `_num`,
  `toolExplicar`.
