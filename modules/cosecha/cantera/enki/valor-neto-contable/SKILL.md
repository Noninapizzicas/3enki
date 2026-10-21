---
name: valor-neto-contable
description: >-
  Skill FULL del módulo REFLEJO STATELESS `valor-neto-contable` de la vertical
  contabilidad (Enki). Valor neto contable del inmovilizado = COSTE − AMORTIZACIÓN
  ACUMULADA, determinista. No calcula las cuotas (eso es plan-amortizacion):
  recibe las cuotas/la amortización acumulada (declaradas, de cuotas, o subidas por
  EVENTO). Sin coste no se inventa el valor; sin fuente de amortización el VNC queda
  ABIERTO (no se asume 0); un VNC negativo se declara, no se corrige. No escribe, no
  persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites el valor neto contable de un activo (RPC
    valor-neto-contable.calcular.request).
  - Cuando depures un VNC abierto (sin coste o sin amortización) o un VNC negativo
    declarado.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y la
    fórmula coste − amortización.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, analitica, inmovilizado, vnc, amortizacion, determinista]
---

# valor-neto-contable — REFLEJO STATELESS del valor neto contable

## Qué hace el módulo

`valor-neto-contable` es un **REFLEJO STATELESS** (F4, hoja del plan): el **Valor
Neto Contable** del inmovilizado = **COSTE − AMORTIZACIÓN ACUMULADA**.
**Determinista**.

**NO calcula las cuotas** (eso es `plan-amortizacion`): **RECIBE** las cuotas / la
amortización acumulada (declaradas, de cuotas, o **subidas por EVENTO** a
`plan-amortizacion.cuota_del_periodo.request`); también observa el HECHO
`contabilidad.cuota_amortizacion_generada`.

**Honestidad (invariante 13)**: sin coste **NO se inventa el valor**; sin ninguna
fuente de amortización el VNC queda **ABIERTO** (**no se asume 0**); un VNC
**negativo no se corrige, se declara**. No escribe, no persiste. Su op es **CLASE
PREGUNTA** → va por el bus, sin panel. Publica `valor-neto-contable.calcular.response`
y su par `.failed`. Escucha `contabilidad.cuota_amortizacion_generada`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `valor-neto-contable.calcular.request` | `onCalcularRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, activo_id?, coste?, activo{coste,amortizacion_acumulada?,cuotas?}, amortizacion_acumulada?, cuotas?, periodo?}` → `{project_id, coste, amortizacion_acumulada, valor_neto_contable, fuente, formula, abierto}`. Resta la amortización acumulada al coste; sin coste o sin amortización → abierto. Responde por `valor-neto-contable.calcular.response`. Payload inválido → `valor-neto-contable.calcular.failed`. |
| `contabilidad.cuota_amortizacion_generada` | `onCuotaAmortizacionGenerada` | Fire-and-forget (B3 `plan-amortizacion`): se generó una cuota de amortización. Se observa (ventana acotada) como fuente de la amortización acumulada; no se recalcula ni se escribe. |

### Publishes

| Evento | Descripción |
|---|---|
| `valor-neto-contable.calcular.response` | Respuesta RPC correlada de la op `calcular` (una sola cara: el bus). |
| `valor-neto-contable.calcular.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `calcular.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `calcular` | **PREGUNTA** (bus) | `{project_id, activo_id?, coste?, activo{...}, amortizacion_acumulada?, cuotas?, periodo?}` | `{project_id, coste, amortizacion_acumulada, valor_neto_contable, fuente, formula, abierto}` | `400 INVALID_INPUT project_id` |

Tool expuesta: `valor-neto-contable.calcular` (`toolCalcular` → `_calcular`).

## Reglas de negocio

1. **Fórmula**: `VNC = coste − amortizacion_acumulada`. El campo `formula` lo
   declara; `fuente` indica de dónde salió la amortización.
2. **Sin coste** → `abierto.coste = 'el activo no declara coste: el valor neto
   contable no se inventa'`. **No se inventa el valor.**
3. **Sin amortización** → VNC **ABIERTO** (**NO se asume 0**).
4. **VNC negativo**: **no se corrige, se declara**.
5. **No calcula las cuotas**: las recibe o las sube por EVENTO a
   `plan-amortizacion.cuota_del_periodo.request`; también observa el hecho
   `contabilidad.cuota_amortizacion_generada`.
6. **Sin `project_id`** → `400 INVALID_INPUT` + `.failed`.
7. **No escribe, no persiste**: reflejo derivador.
8. **HTTP exacto**: éxito `200`; falta `project_id` → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `calcular` — coste, amortización y VNC

```json
{
  "project_id": "e57a318a-...",
  "activo_id": "A-1",
  "activo": { "coste": 30000, "amortizacion_acumulada": 5000 },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "coste": 30000, "amortizacion_acumulada": 5000, "valor_neto_contable": 25000, "fuente": "declarado", "formula": "coste - amortizacion_acumulada", "abierto": { "amortizacion": null, "valor_negativo": null } }
```
Sin amortización → `valor_neto_contable:null` con `abierto.amortizacion` (no se
asume 0). VNC negativo → `abierto.valor_negativo` declarado.

## Errores y qué significan

- `400 INVALID_INPUT project_id` — falta el proyecto.
- `200 {abierto.coste}` — sin coste no se inventa el valor.
- `200 {abierto.amortizacion}` — sin fuente de amortización el VNC queda abierto.
- `200 {abierto.valor_negativo}` — VNC negativo declarado (no corregido).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.cuota_amortizacion_generada` (B3
  `plan-amortizacion`). Sube best-effort `plan-amortizacion.cuota_del_periodo.request`
  (F2).
- **Hacia delante (lo consumen)**: `baja-activo` (F3) sube
  `valor-neto-contable` para el valor neto de la baja; los informes de inmovilizado.
- No escribe: derivador puro.

## Verificación

- **Fichero**: `modules/contabilidad-analitica/valor-neto-contable/` (clase
  `ValorNetoContable extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "cuota_amortizacion_generada" module.json index.js`.
- **Test unitario**: coste 30000 − amort 5000 → VNC 25000; sin coste →
  `abierto.coste`; sin amortización → VNC abierto (no 0); VNC negativo declarado.

## Notas de implementación

- Stateless: sin `PosPersistencia`; ventana observada en memoria.
- Helpers: `_calcular`, `_num`, `toolCalcular`.
