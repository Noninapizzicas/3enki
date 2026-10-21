---
name: cierre-ejercicio
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `cierre-ejercicio` de la vertical
  contabilidad (Enki). EL CIERRE EN DOS NIVELES: `dia` cierra la CAJA, `mes` cierra la
  CONTABILIDAD. Un solo escritor (guard rol `CIERRE_EJERCICIO`; otro → 403). Idempotente por
  nivel+clave. Append-only de la historia (cerrar/reabrir). Persiste por proyecto vía
  PosPersistencia (`/contabilidad/cierre-ejercicio`), restaura en `project.activated` y
  vuelca en `onUnload`. Al cerrar/reabrir publica `contabilidad.ejercicio_cerrado`
  (`estado:'cerrado'|'reabierto'`). Cifras declaradas: sin ellas el periodo se cierra VACÍO (0),
  no se inventa. El asiento de cierre se pide por EVENTO a escritor-diario (B2). Ops `cerrar`
  y `reabrir` son ORDEN → con ui_handler.
when-to-use: >-
  - Cuando necesites cerrar la caja del día o la contabilidad del mes (RPC cierre-ejercicio.cerrar.request)
    o reabrir un periodo (cierre-ejercicio.reabrir.request).
  - Cuando depures por qué un cierre se rechaza (403 rol, 400 nivel/mes/día), por qué no vuelve
    a cerrar (ya cerrado → idempotente) o por qué no se pidió asiento.
  - Cuando quieras entender su contrato de eventos y su integración best-effort con
    plan-amortizacion y escritor-diario.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, libro, cierre, ejercicio, single-writer]
---

# cierre-ejercicio — CUSTODIO del cierre en dos niveles

## Qué hace el módulo

`cierre-ejercicio` es un **CUSTODIO CON PERSISTENCIA** (C4, hoja del plan) de la vertical
**contabilidad**, eje **libro**. Es **el cierre en DOS niveles** (decisión del dueño):

- **`dia`** → cierra la **CAJA** de ese día (`clave = YYYY-MM-DD`).
- **`mes`** → cierra la **CONTABILIDAD** de ese mes (`clave = YYYY-MM`).

Lleva el estado de cada periodo cerrado y **no inventa el resultado**: las cifras son
**declaradas**. Si no llegan, el periodo se cierra **VACÍO (0)** y se declara `abierto` —
no se estima el resultado.

**Invariantes que impone el código:**
- **UN SOLO ESCRITOR por parcela**: guard de rol `CIERRE_EJERCICIO`; otro → `403 PERMISSION_DENIED`.
- **IDEMPOTENTE por nivel+clave**: un periodo ya cerrado **no se vuelve a cerrar**
  (`ya_cerrado:true`), sin emitir hecho.
- **APPEND-ONLY de la historia**: cerrar apila `{op:'cerrar', ...}` y reabrir apila
  `{op:'reabrir', ...}`; **nada se borra**.
- **Dato ausente = desconocido**: sin cifras → cierre VACÍO (0) declarado.

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/cierre-ejercicio`),
restaura en `project.activated` y vuelca en `onUnload`. Ops `cerrar` y `reabrir` son **ORDEN**
→ `ui_handler` `workspace_module`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `cierre-ejercicio.cerrar.request` | `onCerrarRequest` | RPC custodio (ORDEN): `{project_id, rol, nivel:'dia'\|'mes', ejercicio?, mes?, dia?, fecha?, cifras…}` → `{project_id, nivel, clave, cerrado, resultado, amortizaciones, asiento, estado}`. Guard, idempotencia, pide amortización (mes) y asiento, y al cerrar publica `contabilidad.ejercicio_cerrado`. Si `status ≠ 200` publica `cierre-ejercicio.cerrar.failed`. Responde por `cierre-ejercicio.cerrar.response`. |
| `cierre-ejercicio.reabrir.request` | `onReabrirRequest` | RPC custodio (ORDEN): `{project_id, rol, nivel, ...}` → reabre un periodo cerrado. Marca `estado:'reabierto'` (append-only) y publica `contabilidad.ejercicio_cerrado` con `estado:'reabierto'`. Si `status ≠ 200` publica `cierre-ejercicio.reabrir.failed`. Responde por `cierre-ejercicio.reabrir.response`. |
| `project.activated` | `onProjectActivated` | Restaura los cierres del proyecto activado desde el storage. |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.ejercicio_cerrado` | Fire-and-forget (C4): al **cerrar** `{…, estado:'cerrado', resultado}`; al **reabrir** `{…, estado:'reabierto', motivo}`. El hecho que escucha `apertura-ejercicio` (C5) y demás. |
| `cierre-ejercicio.cerrar.response` / `.cerrar.failed` | Respuesta RPC + par de fallo determinista de la op `cerrar`. |
| `cierre-ejercicio.reabrir.response` / `.reabrir.failed` | Respuesta RPC + par de fallo determinista de la op `reabrir`. |

> **Sí publica un HECHO** (`contabilidad.ejercicio_cerrado`): el cambio de estado del periodo
> ES la escritura → R2 obliga a anunciarlo. El **asiento** de cierre NO se escribe aquí: se
> pide por RPC a `escritor-diario` (deps por EVENTO).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `cerrar` | **ORDEN** (ui_handler) | `{project_id, rol?, nivel:'dia'\|'mes', ejercicio?, mes?, dia?, fecha?, saldo_caja?/ingresos?/gastos?/resultado?, lineas?, amortizaciones?}` | `{project_id, nivel, clave, cerrado, ya_cerrado, resultado, amortizaciones, asiento, estado, append_only, niveles, abierto}` | `403 PERMISSION_DENIED`; `400 INVALID_INPUT` (falta `project_id`, `nivel` inválido, o falta `mes`/`dia`); `500`. |
| `reabrir` | **ORDEN** (ui_handler) | `{project_id, rol?, nivel, ejercicio?, mes?, dia?, fecha?, motivo?}` | `{project_id, nivel, clave, reabierto, motivo, aviso, append_only, abierto}` | `403`; `400 INVALID_INPUT` (falta `project_id` o `nivel` inválido); `500`. |

## Reglas de negocio

1. **Niveles cerrados**: `NIVELES = {'dia','mes'}`. Otro → `400 INVALID_INPUT` con el mensaje
   «nivel debe ser 'dia' o 'mes'». `mes` requiere `mes`; `dia` requiere `dia`.
2. **Clave derivada** (`_claves`): `dia` → `YYYY-MM-DD`; `mes` → `YYYY-MM`. Se deriva de
   `fecha` (o de `ejercicio`/`mes`/`dia`); el ejercicio por defecto es el año actual.
3. **Guard de un solo escritor**: si `rol` llega y ≠ `CIERRE_EJERCICIO` → `403` con `{rol_esperado, rol_recibido}`.
4. **Idempotencia por clave**: si el estado ya es `cerrado` → `200 cerrado:false, ya_cerrado:true`,
   con el `resultado` previo, sin emitir hecho.
5. **Cifras declaradas**:
   - `dia` usa `saldo_caja`/`saldo`/`importe` (resultado = saldo) y opcional `movimientos`.
   - `mes` usa `resultado`, o `ingresos - gastos`; recoge la **cuota de amortización** del periodo.
   - Sin cifras (`hay_cifras:false`) → cierre VACÍO y `abierto.cifras` lo declara.
6. **Amortización del mes (best-effort)**: si `input.amortizaciones` es array, se suma su `cuota`;
   si no, se pide por RPC `plan-amortizacion.cuota_del_periodo.request` (timeout 800 ms).
   `amortizaciones.fuente` ∈ `{'declarado','plan-amortizacion'}`.
7. **Asiento de cierre por EVENTO**: si hay cifras o `input.lineas`, se pide
   `escritor-diario.asentar.request` (timeout 1500 ms) con líneas de cuentas **declarables**
   (por defecto `570↔555` en día, `129↔120` en mes; sin reglas PGC ocultas). No se escribe el diario aquí.
8. **Reapertura explícita e irreversible salvo ajuste**: solo reabre lo que estaba `cerrado`;
   el cierre previo **no se borra** (append-only) y se deja `aviso` de ello.
9. **Append-only**: cada cierre/reapertura apila en `historia`; `updated_at` se actualiza.
10. **HTTP exacto**: éxito `200`; rol → `403`; input → `400`; excepción → `500`.

## Cómo se usa (RPC)

### Cerrar el MES

```json
{
  "project_id": "e57a318a-...",
  "rol": "CIERRE_EJERCICIO",
  "nivel": "mes",
  "ejercicio": "2026",
  "mes": "09",
  "resultado": 8400.5,
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "nivel": "mes",
  "clave": "2026-09",
  "cerrado": true,
  "ya_cerrado": false,
  "resultado": 8400.5,
  "amortizaciones": { "fuente": "plan-amortizacion", "cuotas": null, "total": 320.0 },
  "asiento": { "solicitado": true, "asentado": true, "status": 200, "numero": 42 },
  "estado": { "nivel": "mes", "ejercicio": "2026", "mes": "09", "estado": "cerrado", "resultado": 8400.5, "cifras": {…}, "cerrado_en": "..." },
  "append_only": true,
  "niveles": { "dia": null, "mes": "cerro la CONTABILIDAD de este mes" },
  "abierto": { "cifras": null, "asiento": null }
}
```
Emite `contabilidad.ejercicio_cerrado` (`estado:'cerrado'`).

### Cerrar el DÍA (caja)

```json
{ "project_id": "e57a318a-...", "rol": "CIERRE_EJERCICIO", "nivel": "dia", "fecha": "2026-09-30", "saldo_caja": 312.4 }
```
→ `clave:"2026-09-30"`, `resultado:312.4`, emite `contabilidad.ejercicio_cerrado`.

### Ya cerrado — idempotente

Repetir el mismo cierre → `200 cerrado:false, ya_cerrado:true`, **sin** hecho.

### Reabrir

```json
{ "project_id": "e57a318a-...", "rol": "CIERRE_EJERCICIO", "nivel": "mes", "ejercicio": "2026", "mes": "09", "motivo": "factura de septiembre sin registrar" }
```
→ `reabierto:true`, `aviso` append-only, emite `contabilidad.ejercicio_cerrado` con `estado:'reabierto'`.

### Fallo — nivel inválido o falta mes

`{ "nivel": "semana" }` → `400 INVALID_INPUT`; `{ "nivel": "mes" }` sin `mes` → `400 INVALID_INPUT mes`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `PERMISSION_DENIED` | 403 | `rol` ≠ `CIERRE_EJERCICIO`. |
| `INVALID_INPUT` | 400 | Falta `project_id`; `nivel` fuera de `{dia,mes}`; falta `mes` (nivel mes) o `dia` (nivel dia). |
| `UNKNOWN_ERROR` | 500 | Excepción no controlada. |

## Relación con otras piezas (deps por EVENTO)

- **Restaura con**: `project.activated` (core).
- **Llama por RPC (best-effort)**: `plan-amortizacion.cuota_del_periodo.request` (800 ms),
  `escritor-diario.asentar.request` (1500 ms).
- **Publica el hecho** que lee `apertura-ejercicio` (C5) y demás: `contabilidad.ejercicio_cerrado`.

## Verificación

1. Fichero: `modules/contabilidad-libro/cierre-ejercicio/`.
2. Eventos reales: subscribes `cierre-ejercicio.cerrar.request`, `cierre-ejercicio.reabrir.request`,
   `project.activated`; publishes `contabilidad.ejercicio_cerrado`, `cierre-ejercicio.cerrar.response`,
   `cierre-ejercicio.cerrar.failed`, `cierre-ejercicio.reabrir.response`, `cierre-ejercicio.reabrir.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-libro/cierre-ejercicio/index.js
   # → contabilidad.ejercicio_cerrado / cierre-ejercicio.cerrar.failed / cierre-ejercicio.reabrir.failed
   # → plan-amortizacion.cuota_del_periodo.request / escritor-diario.asentar.request
   ```
4. Persistencia: file `cierre-ejercicio.json`, dir `/contabilidad/cierre-ejercicio`, esquema
   `contabilidad-cierre-ejercicio-v1`.
5. Test unitario (si existe): cerrar mes/día → 200 + hecho; repetido → idempotente; reabrir → hecho
   `reabierto`; rol inválido → 403; nivel inválido → 400; `project.activated` restaura.
