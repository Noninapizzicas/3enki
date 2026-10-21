---
name: plan-amortizacion
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `plan-amortizacion` de la
  vertical contabilidad (Enki). Genera la CUOTA de amortización cuando toca; el
  método y el coeficiente son DATO declarable, no constante cableada. UN escritor
  de la parcela. cuota_del_periodo es PREGUNTA (deriva); generar_cuota es ORDEN:
  apila la cuota (append-only) y anuncia contabilidad.cuota_amortizacion_generada.
  Sin base o vida útil no se inventa el importe (422 CUOTA_NO_DETERMINABLE).
when-to-use: >-
  - Cuando necesites derivar o generar la cuota de amortización de un activo (RPC
    plan-amortizacion.cuota_del_periodo.request / plan-amortizacion.generar_cuota.request).
  - Cuando depures por qué no se determina la cuota (422 CUOTA_NO_DETERMINABLE,
    400 INVALID_INPUT) o no se emite contabilidad.cuota_amortizacion_generada.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y los
    métodos lineal/constante/porcentaje_fijo.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, analitica, amortizacion, inmovilizado, append-only]
---

# plan-amortizacion — CUSTODIO CON PERSISTENCIA del plan de amortización

## Qué hace el módulo

`plan-amortizacion` es un **CUSTODIO CON PERSISTENCIA** (F2, hoja del plan):
genera la **CUOTA de amortización** cuando toca (dispara en el **cierre**). El
**MÉTODO** y el **COEFICIENTE** son **DATO** (declarables), **no constantes
cableadas**. Es **UN escritor** de la parcela (método `_encadenar`).

Tiene dos ops: `cuota_del_periodo` es **PREGUNTA** (deriva la cuota, no escribe);
`generar_cuota` es **ORDEN**: apila la cuota (**APPEND-ONLY**, nada se borra) y
**ANUNCIA** el HECHO `contabilidad.cuota_amortizacion_generada` (R2: lo consumen
`baja-activo` y `valor-neto-contable`). **Dato ausente = desconocido**: sin base o
vida útil **no se inventa el importe** (`422 CUOTA_NO_DETERMINABLE`).

`generar_cuota` es **CLASE ORDEN** → **SÍ lleva `ui_handler`**
(`workspace_module`, `barra_modulos`: el asesor trabaja aquí). Persiste por
proyecto vía **PosPersistencia** (`_shared/pos-persistencia`, storage
`/contabilidad/plan-amortizacion`), restaura en `project.activated` y vuelca en
`onUnload`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `plan-amortizacion.cuota_del_periodo.request` | `onCuotaDelPeriodoRequest` | RPC custodio (PREGUNTA, por el bus): `{project_id, activo_id?, periodo?}` → `{project_id, activo_id, periodo, cuota, metodo, calculada}`. Deriva la cuota del periodo sin escribir; si falta base/vida útil, `cuota:null` y `abierto` declarado. Responde por `plan-amortizacion.cuota_del_periodo.response`. |
| `plan-amortizacion.generar_cuota.request` | `onGenerarCuotaRequest` | RPC custodio (ORDEN, panel): `{project_id, activo\|activo_id, periodo?, asiento?}` → `{project_id, cuota, generada, total, append_only}`. Registra el plan si viene, calcula la cuota del periodo y la APILA (append-only). Sin base/vida útil → `422 CUOTA_NO_DETERMINABLE`. Publica `contabilidad.cuota_amortizacion_generada` (R2) y responde por `plan-amortizacion.generar_cuota.response`. Payload inválido → `plan-amortizacion.generar_cuota.failed`. |
| `project.activated` | `onProjectActivated` | Restaura los planes y las cuotas del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.cuota_amortizacion_generada` | Fire-and-forget (F2): se generó la cuota de amortización de un activo en un periodo → `{project_id, activo_id, periodo, cuota, total}`. Lo consumen `baja-activo` y `valor-neto-contable`. |
| `plan-amortizacion.cuota_del_periodo.response` | Respuesta RPC correlada de la op `cuota_del_periodo` (PREGUNTA). |
| `plan-amortizacion.cuota_del_periodo.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `cuota_del_periodo.request`. |
| `plan-amortizacion.generar_cuota.response` | Respuesta RPC correlada de la op `generar_cuota` (ORDEN). |
| `plan-amortizacion.generar_cuota.failed` | Par de fallo determinista: falta `project_id`/`activo` o la cuota no es determinable (`422`) → `{status, code, message}`. Cierra el círculo de `generar_cuota.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `cuota_del_periodo` | **PREGUNTA** (bus) | `{project_id, activo_id?, periodo?}` | `{project_id, activo_id, periodo, cuota, metodo, calculada}` | `400 INVALID_INPUT project_id` |
| `generar_cuota` | **ORDEN** (panel) | `{project_id, activo\|activo_id, periodo?, asiento?}` | `{project_id, cuota, generada, total, append_only}` | `400 INVALID_INPUT` (`project_id`, `activo`); `422 CUOTA_NO_DETERMINABLE` |

Tools expuestas: `plan-amortizacion.cuota_del_periodo` (`toolCuotaDelPeriodo`) y
`plan-amortizacion.generar_cuota` (`toolGenerarCuota`).

## Reglas de negocio

1. **Métodos cerrados (const `METODOS`)**: `['lineal', 'constante',
   'porcentaje_fijo']`. El método es DATO declarable, no una constante de negocio.
2. **Sin base/vida útil no se inventa**: `generar_cuota` sin plan determinable →
   `422 CUOTA_NO_DETERMINABLE` con `{project_id, activo_id, abierto, metodo}`. La
   cuota **no se estima**.
3. **`porcentaje_fijo` sin coeficiente**: `_calcular` devuelve `cuota:null` con
   `abierto.coeficiente = 'metodo porcentaje_fijo sin coeficiente declarado'`.
4. **APPEND-ONLY**: cada cuota generada se apila; nada se borra ni se sobrescribe.
5. **UN escritor**: la parcela la encadena `_encadenar` (single-writer).
6. **R2 — anuncia el hecho**: `generar_cuota` publica
   `contabilidad.cuota_amortizacion_generada`.
7. **`cuota_del_periodo` no muta**: deriva y responde; sin plan → `abierto.activo`.
8. **HTTP exacto**: éxito `200`; campos inválidos → `400`; no determinable → `422`;
   excepción → `500`.

## Cómo se usa (RPC)

### `generar_cuota` — apilar la cuota del periodo (ORDEN)

```json
{
  "project_id": "e57a318a-...",
  "activo": { "activo_id": "A-1", "metodo": "lineal" },
  "periodo": "2026-09",
  "correlation_id": "abc-123"
}
```
Respuesta `200` (y se publica `contabilidad.cuota_amortizacion_generada`):
```json
{ "project_id": "e57a318a-...", "cuota": { "activo_id": "A-1", "periodo": "2026-09", "cuota": 833.33, "metodo": "lineal" }, "generada": true, "total": 1, "append_only": true, "abierto": { "cuota": null } }
```

### `cuota_del_periodo` — derivar sin escribir (PREGUNTA)

```json
{ "project_id": "e57a318a-...", "activo_id": "A-1", "periodo": "2026-09" }
```
Respuesta `200`: `{ "activo_id": "A-1", "periodo": "2026-09", "cuota": 833.33, "metodo": "lineal", "calculada": true }`.

### Fallo — cuota no determinable

```json
{ "project_id": "e57a318a-...", "activo": { "activo_id": "A-2" } }
```
Respuesta `422` + `plan-amortizacion.generar_cuota.failed`:
```json
{ "status": 422, "code": "CUOTA_NO_DETERMINABLE", "message": "...", "details": { "activo_id": "A-2", "metodo": "lineal", "abierto": { "base": "..." } } }
```

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `activo` — falta el campo.
- `422 CUOTA_NO_DETERMINABLE` — sin base o vida útil; no se inventa el importe.
- `200 {cuota:null, abierto}` — cuota no derivable (honestidad).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia delante (publica el hecho)**: `contabilidad.cuota_amortizacion_generada`
  lo consumen `baja-activo` (F3) y `valor-neto-contable` (F4).
- **Hacia atrás (restaura)**: `project.activated`. Suben a este módulo
  (`cuota_del_periodo.request`) `alta-activo` (F1) y otros derivados.
- No importa a nadie: publica y sube.

## Verificación

- **Fichero**: `modules/contabilidad-analitica/plan-amortizacion/` (clase
  `PlanAmortizacion extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "cuota_amortizacion_generada" module.json index.js` y
  `grep -F "CUOTA_NO_DETERMINABLE" index.js`.
- **Test unitario**: `generar_cuota` con plan válido → `200` + hecho; sin base →
  `422 CUOTA_NO_DETERMINABLE`; `cuota_del_periodo` no muta; `project.activated`
  restaura.

## Notas de implementación

- Store en memoria de planes y cuotas por proyecto; **PosPersistencia**
  (`file: 'plan-amortizacion.json'`, `dir: '/contabilidad/plan-amortizacion'`).
- `_encadenar` da el single-writer. Helpers: `_cuota_del_periodo`, `_generar_cuota`,
  `_calcular`, `_registrarSiViene`, `_planDe`, `_acumulado`, `_obtenerOCrear`.
- `_invalid`/`_errorResponse` de `modulo-hibrido-reflejo` / `base-module`.
