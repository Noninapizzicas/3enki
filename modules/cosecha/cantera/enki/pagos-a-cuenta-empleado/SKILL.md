---
name: pagos-a-cuenta-empleado
description: >-
  Skill FULL del módulo REFLEJO STATELESS `pagos-a-cuenta-empleado` de la vertical contabilidad
  (Enki). ANTICIPOS/ADELANTOS y su IMPACTO en el neto y el IRPF. No todo es sueldo fijo: un pago a
  cuenta adelantado REDUCE el neto a percibir hoy (`neto_a_percibir = base − retencion −
  anticipos`), pero NO borra la base del IRPF — la retención se calcula sobre el DEVENGO, no sobre
  lo percibido (`anticipo_afecta_irpf:false`, `impacto_irpf:0`). Mecánico y DETERMINISTA. Dato
  ausente = desconocido: sin base/retención el impacto es PARCIAL (`impacto_completo:false`); un
  anticipo sin importe no se estima con 0. NO escribe. RPC `impacto` es CLASE PREGUNTA.
when-to-use: >-
  - Cuando necesites calcular el impacto de anticipos en el neto y el IRPF
    (RPC pagos-a-cuenta-empleado.impacto.request).
  - Cuando depures por qué `impacto_completo:false` (faltan base/retención) o por qué se rechaza
    (400 INVALID_INPUT si no hay anticipos: es la materia de la hoja).
  - Cuando quieras entender su contrato de eventos: es reflejo puro, no publica hecho.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, fiscal, nomina, anticipos, irpf]
---

# pagos-a-cuenta-empleado — REFLEJO del impacto de los anticipos

## Qué hace el módulo

`pagos-a-cuenta-empleado` es un **REFLEJO STATELESS** (G8, hoja del plan). Trata los
**ANTICIPOS/ADELANTOS** y su **IMPACTO** en el neto y en el IRPF. No todo es sueldo fijo: un pago
a cuenta adelantado reduce lo que se paga hoy, pero **NO borra la base del IRPF** (el devengo
manda). Esta hoja calcula ese impacto de forma **DETERMINISTA**.

- **pago a cuenta (anticipo)** → reduce el **NETO a percibir**.
- **la RETENCIÓN de IRPF** → se calcula sobre la **base de devengo**, NO sobre el neto tras el
  anticipo (el anticipo no es un menor devengo): **anticipar NO baja el IRPF**.

Es **mecánico**: los importes (`bruto`, `retencion`, `anticipos`) llegan **DECLARADOS**; aquí solo
se recomponen. Cero decisiones.

Invariantes:
- **DETERMINISTA**: mismos importes → mismo impacto.
- **Dato ausente = desconocido**: sin base/retención/anticipos declarados el impacto es PARCIAL y
  se declara (`impacto_completo:false`); nada se estima con un cero silencioso.
- **NO escribe, NO persiste.**

RPC **PREGUNTA** → sin panel.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `pagos-a-cuenta-empleado.impacto.request` | `onImpactoRequest` | RPC reflejo (**PREGUNTA**, por el bus): `{project_id, anticipos\|pagos_a_cuenta, base\|bruto?, retencion?}` → `{project_id, anticipos[], total_anticipos, base_devengo, neto_sin_anticipos, neto_a_percibir, impacto_neto, irpf, impacto_irpf, anticipo_afecta_irpf, impacto_completo, abierto}`. Calcula el impacto del anticipo sobre el neto (reduce) y el IRPF (no afecta). Responde por `.impacto.response`; sin anticipos → `.impacto.failed`. |

> **Nota de deriva (R3):** el plan declara escucha de `contabilidad.nomina_recibida`, pero el
> `module.json` real **solo** declara el `impacto.request`. Ningún módulo del repo lo emite aún
> (`puerto-nomina` G4, grupo posterior).

### Publishes

| Evento | Cuándo |
|---|---|
| `pagos-a-cuenta-empleado.impacto.response` | Respuesta RPC correlada de la op `impacto`. |
| `pagos-a-cuenta-empleado.impacto.failed` | Fallo determinista: falta `project_id` o `anticipos`. |

> **No publica hecho de dominio** (R2).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `impacto` | **PREGUNTA** (bus) | `{project_id, anticipos\|pagos_a_cuenta\|pagos\|anticipo, base?\|bruto?, retencion?\|irpf?, nomina?}` | `{project_id, tipo, anticipos, num_anticipos, total_anticipos, base_devengo, retencion, neto_sin_anticipos, neto_a_percibir, impacto_neto, irpf, retencion_declarada, impacto_irpf, irpf_sobre_base_devengo, anticipo_afecta_irpf:false, impacto_completo, determinista:true, abierto}` | 400 `INVALID_INPUT` (`project_id`/`anticipos`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Anticipos = materia obligatoria**: `_anticipos` acepta `anticipos`/`pagos_a_cuenta`/`pagos`
  (array u objeto único), o un anticipo suelto (`input.anticipo` o el propio `input` si trae
  `importe`). **Sin ningún anticipo válido → `_invalid('anticipos')`** (400).
2. **Un anticipo sin importe se descarta** (`_num` null) — no se estima con 0. Cada anticipo se
   normaliza a `{concepto, fecha, importe, reembolsable}`.
3. **`total_anticipos`** = suma de importes, redondeada a 2.
4. **`base`**: de `base`/`bruto`/`nomina.bruto`. **`retencion`**: de `retencion`/`irpf`/
   `nomina.retencion`. `_num`; ausente → `null`.
5. **`neto_sin_anticipos`** = `base − retencion` **solo si ambos** no son null; si no → `null`.
6. **`neto_a_percibir`** = `neto_sin_anticipos − total_anticipos` (o `null`).
7. **`impacto_neto`** = `neto_a_percibir − neto_sin_anticipos` (negativo: reduce).
8. **`irpf` = `retencion`** (no se recalcula): `impacto_irpf = retencion!==null ? 0 : null`,
   `irpf_sobre_base_devengo = retencion!==null`, `anticipo_afecta_irpf:false`.
9. **`impacto_completo`** = `base !== null && retencion !== null`; `abierto.terminos` declarado si no.

## Cómo se usa (RPC)

### Calcular el impacto

```json
{
  "project_id": "e57a318a-...",
  "base": 2000, "retencion": 300,
  "anticipos": [ { "concepto": "adelanto verano", "importe": 400, "reembolsable": true } ]
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...", "tipo": "pagos-a-cuenta-empleado",
  "anticipos": [ { "concepto": "adelanto verano", "fecha": null, "importe": 400, "reembolsable": true } ],
  "num_anticipos": 1, "total_anticipos": 400,
  "base_devengo": 2000, "retencion": 300,
  "neto_sin_anticipos": 1700, "neto_a_percibir": 1300, "impacto_neto": -400,
  "irpf": 300, "retencion_declarada": 300, "impacto_irpf": 0, "irpf_sobre_base_devengo": true,
  "anticipo_afecta_irpf": false, "impacto_completo": true, "determinista": true, "abierto": { "terminos": null }
}
```

### Sin base/retención → impacto parcial

Sin `base`/`retencion` → `neto_a_percibir:null`, `impacto_neto:null`, `impacto_completo:false`,
`abierto.terminos` declarado. (Los anticipos siguen calculándose.)

### Fallo — sin anticipos

```json
{ "project_id": "e57a318a-...", "base": 2000, "retencion": 300 }
```
Respuesta `400` + `pagos-a-cuenta-empleado.impacto.failed` (`INVALID_INPUT`, field `anticipos`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`) | falta `project_id`. |
| `400 INVALID_INPUT` (`anticipos`) | no hay ningún anticipo válido declarado. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; el plan dice `recibo-nomina`, y su materia es el recibo G1).
- **Quién la usa:** la cadena de nómina (explicación del neto, conciliación de anticipos).
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-fiscal/pagos-a-cuenta-empleado/module.json` + `index.js`.
2. Smoke: `impacto` con base+retención+anticipo → `neto_a_percibir` reducido, `impacto_irpf:0`.
3. Sin anticipos → 400 + `.impacto.failed`.
4. Sin base/retención → `impacto_completo:false`, `abierto.terminos`.
5. `grep -E '"event"' module.json`.

## Notas de implementación

- Clase `PagosACuentaEmpleado extends ModuloHibridoReflejo`; `name = 'pagos-a-cuenta-empleado'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless).
- `onImpactoRequest` delega en `_atender`; publica `.impacto.failed` si status ≠ 200. Proyección
  `_impacto`; helpers `_anticipos`, `_num`; tool `toolImpacto`.
