---
name: baja-activo
description: >-
  Skill FULL del módulo REFLEJO STATELESS `baja-activo` de la vertical contabilidad
  (Enki). RETIRA el bien y CALCULA el resultado (pérdida/beneficio) de la baja y lo
  imputa. El asiento lo escribe B2 (escritor-diario): este reflejo NO toca el diario,
  le SUBE el asiento por EVENTO. valor_neto_contable = coste − amortización;
  resultado = valor_de_baja − VNC (pérdida si <0, beneficio si >0). Dato ausente =
  desconocido (abierto). No escribe, no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites calcular el resultado de la baja/venta de un activo (RPC
    baja-activo.calcular.request).
  - Cuando depures una baja abierta (sin coste o sin valor de baja) o un 400
    INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y la
    fórmula del resultado de la baja.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, analitica, inmovilizado, baja, resultado, determinista]
---

# baja-activo — REFLEJO STATELESS de la baja de activos

## Qué hace el módulo

`baja-activo` es un **REFLEJO STATELESS** (F3, hoja del plan): **RETIRA** el bien y
**CALCULA el resultado** (pérdida/beneficio) de la **baja** y lo imputa. **El
ASIENTO lo escribe B2** (`escritor-diario`): este reflejo **NO toca el diario** — le
**SUBE el asiento por EVENTO**.

**DERIVA**: `valor_neto_contable = coste − amortizacion_acumulada` (o lo sube por
EVENTO a `valor-neto-contable` F4); `resultado = valor_de_baja −
valor_neto_contable` (**pérdida si <0, beneficio si >0**). **DETERMINISTA**.

**Invariante**: dato ausente = desconocido (sin coste no hay valor neto; sin valor de
baja no hay resultado → **ABIERTO**). **NO calcula cada cuota** (eso es
`plan-amortizacion` F2); **NO escribe el diario** (eso es `escritor-diario` B2).
Escucha `contabilidad.activo_alta` (`alta-activo` F1) y
`contabilidad.cuota_amortizacion_generada` (`plan-amortizacion` F2) — ambos emisores
**YA existen** → **sí se declaran**. Su op es **CLASE PREGUNTA** → sin `ui_handler`.
STATELESS: sin PosPersistencia.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `baja-activo.calcular.request` | `onCalcularRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, activo?/activo_id?, coste?, valor_neto_contable?, amortizacion_acumulada?, valor_baja?/precio_venta?, cuentas?}` → `{project_id, baja, valor_neto_contable, resultado, perdida, beneficio, asiento_propuesto, abierto}`. Calcula el valor neto y el resultado de la baja (determinista); sube `escritor-diario.asentar.request` si el asiento es declarable. Responde por `baja-activo.calcular.response`; payload inválido → `baja-activo.calcular.failed`. |
| `contabilidad.activo_alta` | `onActivoAlta` | Señal (fire-and-forget) de `alta-activo` F1: se dio de alta un activo → se observa para las bajas (ventana acotada en memoria). |
| `contabilidad.cuota_amortizacion_generada` | `onCuotaAmortizacionGenerada` | Señal (fire-and-forget) de `plan-amortizacion` F2: se generó una cuota de amortización → se observa para el valor neto de la baja. |

### Publishes

| Evento | Descripción |
|---|---|
| `escritor-diario.asentar.request` | Subida (REQUEST por EVENTO) a B2: el asiento de la baja (solo si las cuentas declaradas cuadran). BajaActivo NO escribe el diario; le sube el asiento. |
| `baja-activo.calcular.response` | Respuesta RPC correlada de la op `calcular` (una sola cara: el bus). |
| `baja-activo.calcular.failed` | Par de fallo determinista: falta `project_id` o `activo` → `{status, code, message}`. Cierra el círculo de `calcular.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `calcular` | **PREGUNTA** (bus, sin panel) | `{project_id, activo?/activo_id?, coste?, valor_neto_contable?, amortizacion_acumulada?, valor_baja?/precio_venta?, cuentas?}` | `{project_id, baja, valor_neto_contable, resultado, perdida, beneficio, asiento_propuesto, abierto}` | `400 INVALID_INPUT` (`project_id`, `activo`) |

Tool expuesta: `baja-activo.calcular` (`toolCalcular` → `_calcular`).

## Reglas de negocio

1. **Valor neto**: `VNC = coste − amortizacion_acumulada` (o lo pide por EVENTO a
   `valor-neto-contable` F4).
2. **Resultado**: `resultado = valor_de_baja − VNC`; **pérdida si <0, beneficio si
   >0**.
3. **Sin coste** → `_abierto(...)` con `'el activo no declara coste: no se calcula el
   valor neto'`. **No se calcula.**
4. **Sin VNC** → abierto: `'no hay valor neto (ni declarado, ni de
   valor-neto-contable, ni amortizacion): la baja queda sin calcular'`.
5. **Sin valor de baja** → abierto: `'no hay valor de baja (venta/retirada): no se
   calcula el resultado'`.
6. **No escribe el diario**: **SUBE** `escritor-diario.asentar.request` (B2) solo si
   las cuentas declaradas cuadran.
7. **Sin `activo`** → `400 INVALID_INPUT activo`; sin `project_id` → `400`.
8. **DETERMINISTA**: mismos datos → mismo resultado.
9. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `calcular` — resultado de la baja

```json
{
  "project_id": "e57a318a-...",
  "activo_id": "A-1",
  "coste": 30000,
  "amortizacion_acumulada": 25000,
  "valor_baja": 8000,
  "cuentas": { "baja": "218", "resultado": "771" },
  "correlation_id": "abc-123"
}
```
Respuesta `200` (y sube `escritor-diario.asentar.request` si las cuentas cuadran):
```json
{ "project_id": "e57a318a-...", "baja": { "activo_id": "A-1" }, "valor_neto_contable": 5000, "resultado": 3000, "perdida": false, "beneficio": true, "asiento_propuesto": { "lineas": [ ... ] }, "abierto": { "resultado": null } }
```
Sin coste o sin valor de baja → resultado abierto (no se inventa).

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `activo` — falta el campo.
- `200 {abierto.resultado}` — sin coste o sin valor de baja: no se calcula.
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.activo_alta` (F1 `alta-activo`),
  `contabilidad.cuota_amortizacion_generada` (F2 `plan-amortizacion`). Sube
  best-effort `valor-neto-contable.calcular.request` (F4).
- **Hacia delante (sube por evento)**: `escritor-diario.asentar.request` (B2) el
  asiento de la baja — B2 es quien escribe.
- No escribe el diario, no persiste.

## Verificación

- **Fichero**: `modules/contabilidad-analitica/baja-activo/` (clase `BajaActivo
  extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "activo_alta" module.json index.js` y
  `grep -F "cuota_amortizacion_generada" module.json`.
- **Test unitario**: valor de baja > VNC → `beneficio:true`; < VNC →
  `perdida:true`; sin coste → abierto; sube `asentar.request` solo si las cuentas
  cuadran.

## Notas de implementación

- Stateless: sin `PosPersistencia`; ventana observada en memoria.
- Helpers: `_observar`, `_calcular`, `_abierto`, `_asiento`, `_num`, `toolCalcular`.
