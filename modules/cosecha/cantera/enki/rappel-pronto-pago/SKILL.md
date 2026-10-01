---
name: rappel-pronto-pago
description: >-
  Skill FULL del módulo REFLEJO STATELESS `rappel-pronto-pago` de la vertical
  contabilidad (Enki). Descuentos/rappels/anticipos que AJUSTAN EL COSTE REAL de la
  compra a lo realmente pagado; determinista. NO es un escritor mudo: tras calcular,
  SUBE por EVENTO escritor-diario.asentar.request (B2, single-writer) y
  cuenta-proveedor.saldo.request para leer el pendiente. Sin importe_base no se
  estima; sin cuentas no se inventa el apunte. No escribe, no persiste; su cara es
  el bus.
when-to-use: >-
  - Cuando necesites ajustar el coste real de una compra por rappel/descuento/
    anticipo (RPC rappel-pronto-pago.ajustar.request).
  - Cuando depures un 400 INVALID_INPUT importe_base o un ajuste sin cuentas
    declaradas (no se inventa el apunte).
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y por qué
    sube el asiento (no es mudo).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, entrada, rappel, pronto-pago, anticipos, coste-real, determinista]
---

# rappel-pronto-pago — REFLEJO STATELESS del ajuste de coste por rappels/anticipos

## Qué hace el módulo

`rappel-pronto-pago` es un **REFLEJO STATELESS** (N7, hoja del plan):
descuentos / **rappels** / **anticipos** que **AJUSTAN EL COSTE REAL** de la compra
a lo realmente pagado. **Determinista**.

**CRÍTICO — ESTA HOJA ERA UN ESCRITOR MUDO**: su `ajustar` calculaba el rappel y
**NO lo anunciaba**, y la cadena se cortaba. **Corregido (R2/plan N7)**: el ajuste
del coste **ESCRIBE** → la hoja **SUBE por EVENTO** `escritor-diario.asentar.request`
(B2, single-writer del libro) tras calcular; **no escribe el libro ella misma, lo
ANUNCIA**. Sube también `cuenta-proveedor.saldo.request` (N3) para leer el
pendiente.

**Honestidad (invariante 13)**: sin `importe_base` **NO se estima**; sin cuentas
declaradas **NO se inventa el apunte** (se declara); un ajuste negativo **se
declara, no se corrige**. No escribe, no persiste. Su op es **CLASE PREGUNTA** → va
por el bus, sin panel. Publica `rappel-pronto-pago.ajustar.response` y su par
`.failed`. Escucha `contabilidad.asiento_asentado` (B2 `escritor-diario`).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `rappel-pronto-pago.ajustar.request` | `onAjustarRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, tercero\|proveedor, importe_base, descuento?, pronto_pago_pct?, rappel_pct?, anticipos?, cuentas?, asiento?, fecha?}` → `{project_id, tercero, coste_base, ajustes[], ajuste_total, coste_real, saldo_proveedor, ajusta_coste, abierto}`. Calcula el ajuste del coste y, si ajusta (escribe), SUBE el asiento a `escritor-diario.asentar.request` (NO MUDO). Responde por `rappel-pronto-pago.ajustar.response`. Payload inválido → `rappel-pronto-pago.ajustar.failed`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (B2 escritor-diario): un asiento quedó en el libro. Se observa (ventana acotada); no se recalcula ni se escribe. |

### Publishes

| Evento | Descripción |
|---|---|
| `rappel-pronto-pago.ajustar.response` | Respuesta RPC correlada de la op `ajustar` (una sola cara: el bus). |
| `rappel-pronto-pago.ajustar.failed` | Par de fallo determinista: falta `project_id` o `importe_base` → `{status, code, message}`. Cierra el círculo de `ajustar.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `ajustar` | **PREGUNTA** (bus) | `{project_id, tercero\|proveedor, importe_base, descuento?, pronto_pago_pct?, rappel_pct?, anticipos?, cuentas?, asiento?, fecha?}` | `{project_id, tercero, coste_base, ajustes[], ajuste_total, coste_real, saldo_proveedor, ajusta_coste, abierto}` | `400 INVALID_INPUT` (`project_id`, `importe_base`) |

Tool expuesta: `rappel-pronto-pago.ajustar` (`toolAjustar` → `_ajustar`).

## Reglas de negocio

1. **Ajusta el coste real**: `coste_real = importe_base + ajustes` (rappel %, pronto
   pago %, descuento, anticipos). `ajuste_total` los resume.
2. **NO es mudo**: si `ajusta_coste` (escribe), **sube** `escritor-diario.asentar.request`
   (`_subirAsientoDelAjuste`/`_construirAsiento`). No escribe el libro: lo anuncia.
3. **Sin `importe_base` NO se estima** → `400 INVALID_INPUT importe_base`.
4. **Sin cuentas declaradas NO se inventa el apunte**: se declara (no se fabrica el
   asiento).
5. **Ajuste negativo**: se declara, **no se corrige**.
6. **Lee el pendiente por EVENTO**: sube `cuenta-proveedor.saldo.request` (N3);
   `saldo_proveedor` lo refleja.
7. **No escribe, no persiste**: reflejo derivador, salvo la subida del asiento.
8. **HTTP exacto**: éxito `200`; falta `importe_base` → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `ajustar` — coste real tras rappel/anticipo

```json
{
  "project_id": "e57a318a-...",
  "tercero": "PROV-A",
  "importe_base": 10000.0,
  "rappel_pct": 3,
  "pronto_pago_pct": 2,
  "anticipos": 500,
  "cuentas": { "gasto": "600", "proveedor": "400" },
  "correlation_id": "abc-123"
}
```
Respuesta `200` (y sube `escritor-diario.asentar.request` si ajusta con cuentas):
```json
{ "project_id": "e57a318a-...", "tercero": "PROV-A", "coste_base": 10000.0, "ajustes": [ { "tipo": "rappel", "importe": -300.0 }, { "tipo": "pronto_pago", "importe": -200.0 }, { "tipo": "anticipo", "importe": -500.0 } ], "ajuste_total": -1000.0, "coste_real": 9000.0, "saldo_proveedor": -9000.0, "ajusta_coste": true, "abierto": { "cuentas": null } }
```

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `importe_base` — falta el campo; sin importe base
  no se estima.
- `200 {abierto.cuentas}` — sin cuentas no se inventa el apunte.
- `ajuste_total < 0` — ajuste negativo declarado (no corregido).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.asiento_asentado` (B2 `escritor-diario`).
  Sube best-effort `cuenta-proveedor.saldo.request` (N3).
- **Hacia delante (sube por evento)**: `escritor-diario.asentar.request` (B2) el
  asiento del ajuste — B2 es quien escribe el libro.
- No escribe, no persiste.

## Verificación

- **Fichero**: `modules/contabilidad-entrada/rappel-pronto-pago/` (clase
  `RappelProntoPago extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "asiento_asentado" module.json index.js`.
- **Test unitario**: base 10000 con rappel+pp+anticipos → `coste_real` 9000 y asiento
  subido (no mudo); sin `importe_base` → `400 INVALID_INPUT`; sin cuentas → abierto.

## Notas de implementación

- Stateless: sin `PosPersistencia`; ventana observada en memoria.
- Helpers: `_ajustar`, `_subirAsientoDelAjuste`, `_construirAsiento`,
  `_saldoProveedor`, `_tercero`, `_num`, `toolAjustar`.
