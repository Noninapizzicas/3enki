---
name: variacion-stock-valorada
description: >-
  Skill FULL del módulo REFLEJO STATELESS `variacion-stock-valorada` de la
  vertical contabilidad (Enki). Entrada por COMPRA / salida por CONSUMO,
  VALORADAS y deterministas. NO duplica el inventario ni el valor (eso es
  valoracion-existencia H1, al que sube por EVENTO para pedir el valor unitario).
  Entrada SUMA, salida RESTA (la polaridad la decide el tipo declarado). Sin
  cantidad o valor unitario la variación queda sin valorar (abierto). No escribe,
  no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites derivar la variación de stock valorada de un movimiento (RPC
    variacion-stock-valorada.variacion.request).
  - Cuando depures una variación sin valorar (valor:null, abierto) o un 400
    INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y la
    polaridad por tipo.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, analitica, stock, valoracion, inventario, determinista]
---

# variacion-stock-valorada — REFLEJO STATELESS de la variación de stock valorada

## Qué hace el módulo

`variacion-stock-valorada` es un **REFLEJO STATELESS** (H4, hoja del plan):
deriva la **variación de stock valorada** de un movimiento — entrada por **COMPRA**
/ salida por **CONSUMO**, **VALORADAS**. Es **determinista**.

**NO duplica** el inventario (infra `inventario`) ni el valor (eso es
`valoracion-existencia` H1, al que **SUBE por EVENTO** para pedir el valor
unitario). Deriva la variación del movimiento: **entrada SUMA, salida RESTA** (la
polaridad la decide el tipo declarado). **Dato ausente = desconocido**: sin
cantidad o sin valor unitario la variación queda sin valorar (`valor:null`,
`abierto`).

Escucha `contabilidad.hecho_recibido` (A1 `puerto-evento-vertical`) y deriva la
variación; **NO escribe el diario** (B2) — solo sube el asiento si el hecho **YA lo
declara**. No escribe, no persiste (su acumulado es un **DERIVADO** en memoria). Su
op es **CLASE PREGUNTA** → va por el bus, sin panel. Publica
`variacion-stock-valorada.variacion.response` y su par `.failed`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `variacion-stock-valorada.variacion.request` | `onVariacionRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, movimiento\|hecho, tipo?, cantidad?, valor_unitario?, metodo?}` → `{project_id, variacion:{articulo, tipo, cantidad, valor_unitario, valor, signo, fuente_valor}, valorada, abierto}`. Deriva la variación valorada; sin cantidad/valor unitario → `valorada:false` y abierto. Sube a `valoracion-existencia` para pedir el valor. Responde por `variacion-stock-valorada.variacion.response`. |
| `contabilidad.hecho_recibido` | `onHechoRecibido` | Fire-and-forget (lo emite `puerto-evento-vertical` A1): llegó un hecho de la operación → se deriva su variación valorada y se acumula el derivado; si el hecho ya declara su asiento, se sube a `escritor-diario`. No responde (no es RPC). |

### Publishes

| Evento | Descripción |
|---|---|
| `variacion-stock-valorada.variacion.response` | Respuesta RPC correlada de la op `variacion` (una sola cara: el bus). |
| `variacion-stock-valorada.variacion.failed` | Par de fallo determinista: falta `project_id` o el movimiento declarado es inválido → `{status, code, message}`. Cierra el círculo de `variacion.request`. |

> Además sube, en la derivación, a `valoracion-existencia` (H1) para pedir el valor
> unitario cuando no viene declarado, y a `escritor-diario.asentar.request` si el
> hecho ya trae asiento.

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `variacion` | **PREGUNTA** (bus) | `{project_id, movimiento\|hecho, tipo?, cantidad?, valor_unitario?, metodo?}` | `{project_id, variacion:{articulo, tipo, cantidad, valor_unitario, valor, signo, fuente_valor}, valorada, abierto}` | `400 INVALID_INPUT` (`project_id`, `movimiento`) |

Tool expuesta: `variacion-stock-valorada.variacion` (`toolVariacion` →
`_variacion`).

## Reglas de negocio

1. **Polaridad por tipo**: entrada (COMPRA) **SUMA**; salida (CONSUMO) **RESTA**.
   El campo `signo` lo declara.
2. **Sin cantidad no se estima**: `_abierto(...)` con
   `'el movimiento no declara cantidad: no se estima la variacion'`.
3. **Sin valor unitario la variación queda sin valorar**: `valor:null` con
   `'no hay valor unitario (ni declarado ni de valoracion-existencia): la variacion
   queda sin valorar'`. Se sube a `valoracion-existencia` para pedirlo.
4. **No duplica inventario ni valor**: el acumulado de variación es un DERIVADO en
   memoria; no escribe el diario.
5. **No escribe el diario**: si el hecho YA declara su asiento, se lo sube a B2;
   si no, no se inventa.
6. **Sin `movimiento`/`hecho`** → `400 INVALID_INPUT movimiento`.
7. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `variacion` — valorar una entrada/salida

```json
{
  "project_id": "e57a318a-...",
  "movimiento": { "articulo": "ART-1", "tipo": "COMPRA", "cantidad": 10 },
  "valor_unitario": 2.5,
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "variacion": { "articulo": "ART-1", "tipo": "COMPRA", "cantidad": 10, "valor_unitario": 2.5, "valor": 25.0, "signo": 1, "fuente_valor": "declarado" }, "valorada": true, "abierto": { "valor": null, "articulo": null } }
```
Sin valor unitario → `valorada:false`, `valor:null` y `abierto.valor` explicando el
hueco.

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `movimiento` — falta el campo.
- `200 {valorada:false, abierto.valor}` — sin valor unitario no se valora (honesto).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.hecho_recibido` (A1
  `puerto-evento-vertical`).
- **Sube por EVENTO**: a `valoracion-existencia` (H1) para pedir el valor unitario;
  a `escritor-diario` (B2) el asiento si el hecho lo declara.
- No duplica inventario ni valor: es derivador.

## Verificación

- **Fichero**: `modules/contabilidad-analitica/variacion-stock-valorada/` (clase
  `VariacionStockValorada extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "variacion.request" module.json` y
  `grep -F "hecho_recibido" module.json`.
- **Test unitario**: COMPRA con cantidad y valor → `signo:1`, `valorada:true`;
  CONSUMO → signo negativo; sin cantidad → `_abierto`; sin valor unitario →
  `valorada:false`.

## Notas de implementación

- Stateless: sin `PosPersistencia`; acumulado en memoria.
- `onVariacionRequest` delega en `_atender(...)`; si status ≠ 200 publica
  `variacion-stock-valorada.variacion.failed`.
- Helpers: `_variacion`, `_abierto`, `_encolar`, `_acumular`, `_tipo`, `_num`,
  `toolVariacion`.
