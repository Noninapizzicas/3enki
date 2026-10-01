---
name: coste-indirecto
description: >-
  Skill FULL del módulo REFLEJO STATELESS `coste-indirecto` de la vertical
  contabilidad (Enki). Aplica el REPARTO DECLARADO de los gastos NO directos. EL
  CERROJO: NO se reparte con un criterio inventado — el reparto (base + pesos por
  destino) se DECLARA; si no viene, se sube el hueco a
  cola-declaraciones-criterio.fijar.request y el resultado queda repartido:false
  con abierto (no hay 50/50 por defecto). Determinista. No escribe, no persiste.
when-to-use: >-
  - Cuando necesites repartir un gasto indirecto por destinos declarados (RPC
    coste-indirecto.repartir.request).
  - Cuando depures un repartido:false (sin reparto declarado → hueco subido a K9) o
    un 400 INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y el
    reparto proporcional con resto al mayor.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, analitica, coste-indirecto, reparto, criterio-declarado, determinista]
---

# coste-indirecto — REFLEJO STATELESS del reparto de gastos indirectos

## Qué hace el módulo

`coste-indirecto` es un **REFLEJO STATELESS** (J5, hoja del plan): aplica el
**REPARTO DECLARADO** de los gastos **NO directos** (los que no se imputan a un
solo destino). **EL CERROJO**: **NO se reparte con un criterio inventado** — el
reparto (base + pesos por destino) **se DECLARA**. Si no viene, se **SUBE el hueco**
a `cola-declaraciones-criterio.fijar.request` (K9, best-effort) y el resultado queda
`repartido:false` con `abierto`. **NO hay 50/50 por defecto**: dato ausente =
desconocido.

Es **determinista**: reparto proporcional a la base declarada, con el **resto del
redondeo al destino de mayor importe** (`_cuadrarResto`). No escribe, no persiste.
Su op es **CLASE PREGUNTA** → va por el bus, sin panel. Publica
`coste-indirecto.repartir.response` y su par `.failed`. Escucha
`contabilidad.asiento_asentado` (B2) y `contabilidad.criterio_fijado` (K9).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `coste-indirecto.repartir.request` | `onRepartirRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, importe, reparto?{destinos:[{destino,base}]}}` → `{project_id, importe, imputaciones, imputado, repartido, determinista, abierto}`. Reparte proporcional a la base declarada; sin reparto declarado NO se inventa (`repartido:false`). Responde por `coste-indirecto.repartir.response`. Payload inválido → `coste-indirecto.repartir.failed`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (B2 escritor-diario): un asiento quedó en el libro. Se observa (ventana acotada); no se escribe. |
| `contabilidad.criterio_fijado` | `onCriterioFijado` | Fire-and-forget (K9 cola-declaraciones-criterio): el jefe fijó un criterio (p.ej. el reparto). Se registra para aplicar el reparto declarado sin inventarlo. |

### Publishes

| Evento | Descripción |
|---|---|
| `coste-indirecto.repartir.response` | Respuesta RPC correlada de la op `repartir` (una sola cara: el bus). |
| `coste-indirecto.repartir.failed` | Par de fallo determinista: falta `project_id` o `importe` → `{status, code, message}`. Cierra el círculo de `repartir.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `repartir` | **PREGUNTA** (bus) | `{project_id, importe, reparto?{destinos:[{destino,base}]}}` | `{project_id, importe, imputaciones, imputado, repartido, determinista, abierto}` | `400 INVALID_INPUT` (`project_id`, `importe`) |

Tool expuesta: `coste-indirecto.repartir` (`toolRepartir` → `_repartir`).

## Reglas de negocio

1. **Sin reparto no se inventa**: si no viene un `reparto` con destinos de base/peso
   > 0 → `repartido:false`, `imputado:0`, `abierto.reparto` declarado. Y se **sube el
   hueco** a `cola-declaraciones-criterio.fijar.request` (K9) con rol `JEFE_CRITERIO`.
2. **Reparto proporcional a la base**: cada destino recibe `importe * base_i /
   Σbases`; el **resto del redondeo va al destino de mayor importe** (`_cuadrarResto`).
3. **Destinos declarados sin base/peso > 0** → `abierto.reparto = 'el reparto
   declarado no trae destinos con base/peso > 0: no se reparte'`.
4. **Criterio fijado por K9**: `onCriterioFijado` registra el reparto declarado
   (`_repartoDe`) para aplicarlo sin inventarlo.
5. **Sin `importe`** → `400 INVALID_INPUT importe`; sin `project_id` → `400`.
6. **No escribe, no persiste**: reflejo derivador.
7. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `repartir` — gasto indirecto entre destinos

```json
{
  "project_id": "e57a318a-...",
  "importe": 1000.0,
  "reparto": { "destinos": [ { "destino": "centro-A", "base": 600 }, { "destino": "centro-B", "base": 400 } ] },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "importe": 1000.0, "imputaciones": [ { "destino": "centro-A", "importe": 600.0 }, { "destino": "centro-B", "importe": 400.0 } ], "imputado": 1000.0, "repartido": true, "determinista": true, "abierto": { "reparto": null } }
```
Sin reparto declarado → `repartido:false`, `abierto.reparto` y hueco subido a K9.

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `importe` — falta el campo.
- `200 {repartido:false, abierto.reparto}` — sin reparto declarado no se inventa
  (comportamiento honesto).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.asiento_asentado` (B2),
  `contabilidad.criterio_fijado` (K9). Sube best-effort
  `cola-declaraciones-criterio.fijar.request` (K9) el hueco del criterio.
- **Hacia delante (lo consumen)**: `margen-analitico` (J2) sube
  `coste-indirecto.repartir.request` para imputar los indirectos.
- No escribe: derivador puro.

## Verificación

- **Fichero**: `modules/contabilidad-analitica/coste-indirecto/` (clase
  `CosteIndirecto extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "criterio_fijado" module.json index.js` y
  `grep -F "JEFE_CRITERIO" index.js`.
- **Test unitario**: reparto 60/40 → imputaciones proporcionales y `imputado` ==
  `importe`; sin reparto → `repartido:false` + hueco subido; `onCriterioFijado`
  registra el criterio.

## Notas de implementación

- Stateless: sin `PosPersistencia`; `this._criterios` (Map `project_id` → Map
  `clave` → valor declarado) y ventana `this._vistos`.
- Helpers: `_repartir`, `_repartoDe`, `_destinos`, `_cuadrarResto`, `_subirHueco`,
  `_num`, `toolRepartir`.
