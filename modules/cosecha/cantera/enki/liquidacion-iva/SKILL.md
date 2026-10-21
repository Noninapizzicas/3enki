---
name: liquidacion-iva
description: >-
  Skill FULL del módulo REFLEJO STATELESS `liquidacion-iva` de la vertical contabilidad (Enki).
  Calcula la LIQUIDACIÓN de IVA (devengado − soportado) por DEVENGADO, derivada del libro. **Los
  tipos son DATO — nunca cableados**; lo inclasificable se declara abierto. Los saldos se declaran
  o se piden best-effort a `mayor-balanza` (B). El lado (477 devengado / 472 soportado) se declara o
  se infiere por prefijo PGC. Escucha `contabilidad.asiento_asentado` y `contabilidad.ejercicio_cerrado`.
  Sin store propio. La op `calcular` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites calcular la liquidación de IVA de un periodo (RPC liquidacion-iva.calcular.request).
  - Cuando depures por qué hay `a_compensar`, por qué hay líneas sin tipo (`abierto.tipo`) o cuentas
    no clasificables (`abierto.clasificacion`).
  - Cuando quieras entender la LEY COMO DATO (tipos declarables) y la separación caja/devengo.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, fiscal, iva, devengo, ley-como-dato]
---

# liquidacion-iva — REFLEJO STATELESS de la liquidación de IVA

## Qué hace el módulo

`liquidacion-iva` es un **REFLEJO STATELESS** (D1, hoja del plan) de la vertical **contabilidad**,
eje **fiscal**. Calcula la **liquidación de IVA** por el criterio de **DEVENGO**:

```
devengado  = cuotas de IVA repercutido (lado 477)
soportado  = cuotas de IVA deducible   (lado 472)
resultado  = devengado − soportado     → a_ingresar (>0) o a_compensar (<0)
```

Los **saldos** se declaran o se piden best-effort a `mayor-balanza` (B). El **lado** de cada cuenta
se declara (`lado`/`naturaleza`/`tipo`) o se infiere por **prefijo PGC** (`477` devengado, `472`
soportado).

> **LA LEY COMO DATO**: los **tipos de IVA son DATO** — declarados por línea o por la petición
> (`tipos.devengado` / `tipos.soportado`). **Nunca** están cableados (`tipos_cableados:false`).
> Si falta el tipo, la **cuota se computa** pero el **tipo queda sin desglosar** (abierto).

**Honestidad (invariante 13):** sin saldos → `abierto.fuente` (no se inventa); cuentas de IVA sin
naturaleza ni prefijo reconocible → **no se suman** y se declaran (`abierto.clasificacion`).

**No persiste** (STATELESS); observa asientos (tope 1000) y cierres (tope 100). La op `calcular` es
**PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `liquidacion-iva.calcular.request` | `onCalcularRequest` | RPC reflejo (PREGUNTA): `{project_id, saldos?\|lineas?, tipos?:{devengado,soportado}, fecha?, ejercicio?}` → `{devengado, soportado, resultado, a_ingresar, a_compensar, por_tipo, detalle, abierto}`. Delega en `_atender` → `_calcular`. Si `status ≠ 200` publica `.failed`. Responde por `liquidacion-iva.calcular.response`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (escritor-diario B2): el libro cambió → se observa el asiento (tope 1000). |
| `contabilidad.ejercicio_cerrado` | `onEjercicioCerrado` | Fire-and-forget (cierre-ejercicio C4): cerró el ejercicio → se observa el cierre (tope 100) si `estado === 'cerrado'`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `liquidacion-iva.calcular.response` | Respuesta RPC correlada de la op `calcular`. |
| `liquidacion-iva.calcular.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |

> **NO publica un hecho de dominio**: reflejo de cálculo. No escribe estado.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `calcular` | **PREGUNTA** | `{project_id, saldos?\|lineas?:[{cuenta, saldo?\|debe?\|haber?, base_imponible?, cuota?, tipo_iva?\|tipo_impositivo?\|tipo_declarado?, lado?\|naturaleza?\|tipo?}], tipos?:{devengado,soportado}, fecha?, ejercicio?}` | `{project_id, tipo, fuente, criterio:'devengo', devengado, soportado, resultado, a_ingresar, a_compensar, por_tipo, detalle, determinista, tipos_cableados:false, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Origen de saldos** (`_saldosDe`): input `saldos`/`lineas` → o RPC `mayor-balanza.saldos.request`
   (timeout 800 ms). `fuente` ∈ `{'declarado','mayor-balanza',null}`.
2. **Lado por declaración o prefijo** (`_lado`): declarado (`lado`/`naturaleza`/`tipo` con
   `deveng|repercut|salid` → devengado; `soport|deducib|entrad` → soportado) o por prefijo PGC
   (`477…` → devengado, `472…` → soportado). Sin lado y sin prefijo → **no clasificable**.
3. **Cuentas de IVA no clasificables** (`_esIva`): si la cuenta parece de IVA (`472`/`477`/`4700…`
   o `tipo`/`naturaleza` con «iva») pero no tiene lado → **no se suman** y se declaran.
4. **La cuota** = `|cuota|` declarada o `|saldo|`; la **base** se suma si se declara.
5. **El tipo es DATO** (`_tipo`): por línea (`tipo_iva`/`tipo_impositivo`/`tipo_declarado`) o por
   petición (`tipos.devengado`/`tipos.soportado`). Sin tipo → la línea cae en `(sin_tipo)` y se declara.
6. **Criterio devengo**: `criterio:'devengo'` (C3 separa caja/devengo).
7. **Resultado**: `a_ingresar = max(resultado, 0)`; `a_compensar = max(-resultado, 0)`.
8. **La ley no va cableada**: `tipos_cableados:false`; sin tipo declarado la cuota se computa pero el
   tipo queda abierto.
9. **`_round`** a 2 decimales.

## Cómo se usa (RPC)

### Calcular con saldos declarados

```json
{
  "project_id": "e57a318a-...",
  "saldos": [
    { "cuenta": "477", "cuota": 2100, "base_imponible": 10000, "tipo_iva": 21 },
    { "cuenta": "472", "cuota": 840, "base_imponible": 4000, "tipo_iva": 21 }
  ],
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "liquidacion-iva",
  "fuente": "declarado",
  "criterio": "devengo",
  "devengado": 2100,
  "soportado": 840,
  "resultado": 1260,
  "a_ingresar": 1260,
  "a_compensar": 0,
  "por_tipo": [ { "tipo": 21, "base": 14000, "cuota": 2940, "lado": "soportado" } ],
  "detalle": [ { "cuenta": "477", "lado": "devengado", "tipo": 21, "base_imponible": 10000, "cuota": 2100 }, { "cuenta": "472", "lado": "soportado", "tipo": 21, "base_imponible": 4000, "cuota": 840 } ],
  "determinista": true,
  "tipos_cableados": false,
  "abierto": { "fuente": null, "tipo": null, "clasificacion": null }
}
```

### Sin saldos — se declara

```json
{ "project_id": "e57a318a-..." }
```
→ `abierto.fuente = "no se recibieron saldos (ni declarados ni de mayor-balanza): la liquidacion no se inventa"`.

### Líneas sin tipo

→ `(sin_tipo)` en `por_tipo` y `abierto.tipo` con el número de líneas afectadas.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `liquidacion-iva.calcular.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_calcular`. |
| (no es error) | 200 | Sin saldos o sin tipo → se calcula lo posible y se declara el hueco. |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.asiento_asentado` (B2), `contabilidad.ejercicio_cerrado` (C4).
- **Llama por RPC (best-effort, 800 ms)**: `mayor-balanza.saldos.request` (B).
- **Le alimentan**: `modelo-303` (D2) y `modelo-390` (D3) piden `liquidacion-iva.calcular.request`.

## Verificación

1. Fichero: `modules/contabilidad-fiscal/liquidacion-iva/`.
2. Eventos reales: subscribes `liquidacion-iva.calcular.request`, `contabilidad.asiento_asentado`,
   `contabilidad.ejercicio_cerrado`; publishes `liquidacion-iva.calcular.response`, `.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-fiscal/liquidacion-iva/index.js
   # → liquidacion-iva.calcular.failed → mayor-balanza.saldos.request
   ```
4. **Ley como dato**: no hay tipos de IVA cableados; salen del input/línea.
5. Test unitario (si existe): devengado−soportado; a_compensar; prefijo PGC 477/472; sin tipo → abierto;
   no clasificables → no se suman; sin saldos → abierto.
