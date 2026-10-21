---
name: partida-conciliatoria
description: >-
  Skill FULL del módulo REFLEJO STATELESS `partida-conciliatoria` de la vertical
  contabilidad (Enki). Partidas en TRÁNSITO que EXPLICAN el desfase banco↔contable.
  El desfase se EXPLICA, no se esconde. No calcula el saldo contable: lo sube por
  EVENTO a saldo-tesoreria y lo compara con el saldo bancario declarado. El desfase
  que no cubre una partida declarada NO se reparte en una partida inventada: queda
  en no_explicado. No escribe, no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites explicar el desfase banco↔contable con partidas en tránsito
    (RPC partida-conciliatoria.desfase.request).
  - Cuando depures un no_explicado (desfase sin partida declarada) o un 400
    INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y el
    significado de explica_desfase.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, libro, conciliacion, banco, partidas-transito, determinista]
---

# partida-conciliatoria — REFLEJO STATELESS de las partidas en tránsito

## Qué hace el módulo

`partida-conciliatoria` es un **REFLEJO STATELESS** (E9, hoja del plan):
**partidas en TRÁNSITO** que **EXPLICAN** el desfase **banco↔contable**. El desfase
**se EXPLICA, no se esconde**.

**NO calcula el saldo contable**: lo **SUBE por EVENTO** a
`saldo-tesoreria.calcular.request` (E3) y lo compara con el **saldo bancario
declarado**. **Honestidad (invariante 13)**: el desfase que **NO cubre una partida
declarada NO se reparte en una partida inventada** — queda declarado en
`no_explicado`; `explica_desfase` significa que las partidas **EXPLICAN** la
diferencia, **no que sea 0**.

No escribe, no persiste. Su op es **CLASE PREGUNTA** → va por el bus, sin panel.
Publica `partida-conciliatoria.desfase.response` y su par `.failed`. Escucha
`contabilidad.asiento_asentado` (B2 `escritor-diario`).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `partida-conciliatoria.desfase.request` | `onDesfaseRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, saldo_banco, saldo_contable?, cuenta?, partidas[{concepto,tipo,importe,signo?,fecha?}], fecha?, ejercicio?}` → `{project_id, saldo_banco, saldo_contable, desfase, partidas[], desfase_explicado, no_explicado, explica_desfase, abierto}`. Descompone el desfase en partidas en tránsito; lo no explicado se declara. Responde por `partida-conciliatoria.desfase.response`. Payload inválido → `partida-conciliatoria.desfase.failed`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (B2 escritor-diario): un asiento quedó en el libro. Se observa (ventana acotada); no se recalcula ni se escribe. |

### Publishes

| Evento | Descripción |
|---|---|
| `partida-conciliatoria.desfase.response` | Respuesta RPC correlada de la op `desfase` (una sola cara: el bus). |
| `partida-conciliatoria.desfase.failed` | Par de fallo determinista: falta `project_id` o `saldo_banco` → `{status, code, message}`. Cierra el círculo de `desfase.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `desfase` | **PREGUNTA** (bus) | `{project_id, saldo_banco, saldo_contable?, cuenta?, partidas[], fecha?, ejercicio?}` | `{project_id, saldo_banco, saldo_contable, desfase, partidas[], desfase_explicado, no_explicado, explica_desfase, abierto}` | `400 INVALID_INPUT` (`project_id`, `saldo_banco`) |

Tool expuesta: `partida-conciliatoria.desfase` (`toolDesfase` → `_desfase`).

## Reglas de negocio

1. **El desfase se explica, no se esconde**: `desfase = saldo_banco −
   saldo_contable`; las partidas en tránsito lo descomponen (`_signo` aplica la
   polaridad).
2. **Lo no explicado se declara**: `no_explicado` = desfase no cubierto por partidas
   declaradas. **NO se inventa una partida** para cuadrarlo.
3. **`explica_desfase`**: las partidas EXPLICAN la diferencia; **no significa que el
   desfase sea 0**.
4. **Saldo contable por EVENTO**: si no viene declarado, se sube
   `saldo-tesoreria.calcular.request` (E3); si no se obtiene →
   `abierto.saldo_contable = 'no se obtuvo el saldo contable ...: el desfase no se
   inventa'`.
5. **Sin `saldo_banco`** → `400 INVALID_INPUT saldo_banco`.
6. **No escribe, no persiste**: reflejo derivador.
7. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `desfase` — descomponer la diferencia

```json
{
  "project_id": "e57a318a-...",
  "saldo_banco": 12000.0,
  "saldo_contable": 11500.0,
  "partidas": [ { "concepto": "cheque no cobrado", "tipo": "TRANSITO", "importe": 400, "signo": -1 }, { "concepto": "comision pendiente", "tipo": "TRANSITO", "importe": 100, "signo": 1 } ],
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "saldo_banco": 12000.0, "saldo_contable": 11500.0, "desfase": 500.0, "partidas": [ { "concepto": "cheque no cobrado", "importe": 400 }, { "concepto": "comision pendiente", "importe": 100 } ], "desfase_explicado": 500.0, "no_explicado": 0.0, "explica_desfase": true, "abierto": { "no_explicado": null } }
```
Si el desfase no se cubre → `no_explicado > 0` declarado.

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `saldo_banco` — falta el campo.
- `no_explicado > 0` — desfase sin partida declarada (se declara, no se reparte en
  una partida inventada).
- `200 {abierto.saldo_contable}` — no se obtuvo el saldo contable: el desfase no se
  inventa.
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.asiento_asentado` (B2 `escritor-diario`).
  Sube best-effort `saldo-tesoreria.calcular.request` (E3).
- **Hacia delante (lo consumen)**: `conciliacion-bancaria`, `informe-conciliacion`,
  `prevision-caja`.
- No escribe: derivador puro.

## Verificación

- **Fichero**: `modules/contabilidad-libro/partida-conciliatoria/` (clase
  `PartidaConciliatoria extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "asiento_asentado" module.json index.js`.
- **Test unitario**: desfase cubierto por partidas → `no_explicado:0`; desfase no
  cubierto → `no_explicado > 0`; sin `saldo_banco` → `400 INVALID_INPUT`.

## Notas de implementación

- Stateless: sin `PosPersistencia`; ventana observada en memoria.
- Helpers: `_desfase`, `_signo`, `_num`, `toolDesfase`.
