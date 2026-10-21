---
name: prevision-caja
description: >-
  Skill FULL del módulo REFLEJO STATELESS `prevision-caja` de la vertical contabilidad
  (Enki). PROYECTA entradas/salidas desde los COMPROMISOS con la POLÍTICA DECLARADA,
  periodo a periodo, aplicando el saldo inicial (declarado o subido best-effort a
  saldo-tesoreria). Determinista. Escucha `contabilidad.criterio_fijado` (política de caja)
  y `contabilidad.asiento_asentado`. Honestidad (invariante 13): sin compromisos no se
  inventa la previsión (`periodos:[]` y `abierto`); un compromiso sin fecha no se coloca en
  un periodo inventado (se lista en `abierto.compromisos_sin_fecha`); sin saldo inicial se
  proyecta desde 0 y se declara. Sin store propio. La op `proyectar` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites proyectar la caja de un proyecto desde sus compromisos y su política
    (RPC prevision-caja.proyectar.request).
  - Cuando depures por qué la previsión sale vacía (`periodos:[]` sin compromisos), sin
    saldo (`abierto.saldo_inicial`) o con compromisos sin fecha listados aparte.
  - Cuando quieras entender su contrato de eventos y su dependencia best-effort a saldo-tesoreria.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, libro, caja, tesoreria, proyeccion]
---

# prevision-caja — REFLEJO STATELESS que proyecta la caja

## Qué hace el módulo

`prevision-caja` es un **REFLEJO STATELESS** (E5, hoja del plan) de la vertical
**contabilidad**, eje **libro**. **Proyecta entradas y salidas** a partir de los
**compromisos** (facturas a cobrar/pagar) y de la **política de caja declarada**,
periodo a periodo, aplicando el **saldo inicial**.

No inventa el saldo inicial (eso es `saldo-tesoreria`) ni la política (eso es una
`declaracion de criterio`): **recibe** esas piezas y **proyecta**. La proyección es
determinista: mismo saldo + mismos compromisos + misma política → mismo resultado.

**Honestidad (invariante 13):**
- **Sin compromisos** → `periodos:[]` y `abierto.compromisos` lo declara. La previsión
  **no se inventa** (nada que proyectar).
- **Compromiso sin fecha** → **no se coloca** en un periodo inventado; se cuenta y se
  lista en `abierto.compromisos_sin_fecha` (p. ej. `"N compromiso(s) sin fecha: ..."`).
- **Sin saldo inicial** → se proyecta **desde 0** y se declara (`abierto.saldo_inicial`).
- **Sin política** → se proyecta sin ella y se declara (`abierto.politica`).

**No persiste**: mantiene memoria acotada (`this._obs`, con `politica`) y una ventana de
asientos (`this._vistos`, tope 1000). La op `proyectar` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `prevision-caja.proyectar.request` | `onProyectarRequest` | RPC reflejo (PREGUNTA): `{project_id, saldo_inicial?, compromisos:[{fecha, importe, tipo}], politica_caja?}` → `{project_id, periodos:[{periodo, entradas, salidas, saldo_inicio, saldo_fin}], saldo_final}`. Delega en `_atender` → `_proyectar`. Si `status ≠ 200` publica `.failed`. Responde por `prevision-caja.proyectar.response`. |
| `contabilidad.criterio_fijado` | `onCriterioFijado` | Fire-and-forget (cola-declaraciones-criterio): se fijó un criterio. Se observa la **política de caja** (`politica_caja` / `criterio` / `politica`) en memoria para proyectar sin que se declare en el input. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (escritor-diario B2): el libro cambió → se observa el asiento (ventana acotada). El reflejo no reescribe el libro; solo mira. |

### Publishes

| Evento | Cuándo |
|---|---|
| `prevision-caja.proyectar.response` | Respuesta RPC correlada de la op `proyectar` (una sola cara: el bus). |
| `prevision-caja.proyectar.failed` | Par de fallo determinista: falta `project_id` o entrada inválida → `{status, code, message}`. Cierra el círculo de `proyectar.request`. |

> **NO publica un hecho de dominio**: es un reflejo de cálculo. No escribe estado, luego
> no hay hecho que anunciar (R2 no aplica).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `proyectar` | **PREGUNTA** | `{project_id, saldo_inicial?\|saldo?, compromisos?:\|movimientos?:[{fecha, importe, tipo, signo?}], politica_caja?\|politica?, dias_pago?, dias_cobro?}` | `{project_id, tipo, saldo_inicial, fuente_saldo, politica, periodos:[{periodo, entradas, salidas, compromisos, saldo_inicio, saldo_fin}], saldo_final, total_entradas, total_salidas, determinista, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Agrupación por periodo (YYYY-MM)**: `_periodos` agrupa los compromisos por
   `String(fecha).slice(0,7)`. Ordena los periodos alfabéticamente (cronológico).
2. **Sin fecha no se coloca**: un compromiso con `fecha_proyectada`/`fecha`/`vencimiento`
   ausente **no** entra en ningún periodo; se cuenta y se declara en `abierto.compromisos_sin_fecha`.
3. **Clasificación entrada/salida**: es **entrada** si `tipo === 'entrada'` **o** `signo === '+'`
   **o** (`importe > 0` y `tipo !== 'salida'`); si no, **salida**. Los importes se acumulan en valor
   absoluto (`Math.abs(importe)`), redondeados a 2 decimales.
4. **Proyección determinista**: `acumulado` arranca en el saldo inicial (o `0` si no llegó) y por
   cada periodo `saldo_fin = saldo_inicio + entradas - salidas`. `saldo_inicio` de cada fila es el
   `saldo_fin` del periodo anterior.
5. **Saldo inicial best-effort**: si no viene declarado, se pide por RPC `saldo-tesoreria.calcular.request`
   (timeout 800 ms) tomando `saldo` o `importe`. `fuente_saldo` ∈ `{'declarado','saldo-tesoreria'}`.
6. **Política declarada, sin default oculto**: `_politica` toma `politica_caja` → `politica` →
   `{dias_pago, dias_cobro}` del input → la observada del evento. Si nada → `null`.
7. **Sin compromisos = ABIERTO**: si `compromisos` (o `movimientos`) no es array → `200` con
   `periodos:[]`, `senal_presente:false` y `abierto.compromisos`. No se proyecta nada inventado.
8. **`_num` estricto**: `undefined/null/''` → `null` (ausencia, no cero).

## Cómo se usa (RPC)

### Proyectar con saldo y compromisos

```json
{
  "project_id": "e57a318a-...",
  "saldo_inicial": 5000,
  "compromisos": [
    { "fecha": "2026-10-05", "importe": 2000, "tipo": "entrada" },
    { "fecha": "2026-10-20", "importe": 800, "tipo": "salida" },
    { "fecha": "2026-11-03", "importe": 1500, "tipo": "salida" }
  ],
  "politica_caja": { "dias_cobro": 30, "dias_pago": 60 },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "prevision-caja",
  "saldo_inicial": 5000,
  "fuente_saldo": "declarado",
  "politica": { "dias_cobro": 30, "dias_pago": 60 },
  "periodos": [
    { "periodo": "2026-10", "entradas": 2000, "salidas": 800, "compromisos": 2, "saldo_inicio": 5000, "saldo_fin": 6200 },
    { "periodo": "2026-11", "entradas": 0, "salidas": 1500, "compromisos": 1, "saldo_inicio": 6200, "saldo_fin": 4700 }
  ],
  "saldo_final": 4700,
  "total_entradas": 2000,
  "total_salidas": 2300,
  "determinista": true,
  "abierto": { "saldo_inicial": null, "politica": null, "compromisos_sin_fecha": null }
}
```

### Sin compromisos — ABIERTO

```json
{ "project_id": "e57a318a-...", "saldo_inicial": 5000 }
```
→ `periodos:[]`, `senal_presente:false`,
`abierto.compromisos = "no se declararon compromisos: la prevision no se inventa (nada que proyectar)"`.

### Compromiso sin fecha — se lista aparte

```json
{ "project_id": "e57a318a-...", "compromisos": [ { "importe": 300, "tipo": "salida" } ] }
```
→ `periodos:[]`, `abierto.compromisos_sin_fecha = "1 compromiso(s) sin fecha: no se colocan en un periodo inventado"`.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `prevision-caja.proyectar.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. Publica `prevision-caja.proyectar.failed`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_proyectar`. |
| (no es error) | 200 | Sin compromisos → ABIERTO; sin saldo → proyecta desde 0; sin política → proyecta sin ella. |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.criterio_fijado` (cola-declaraciones-criterio), `contabilidad.asiento_asentado` (B2).
- **Llama por RPC (best-effort, 800 ms)**: `saldo-tesoreria.calcular.request`.
- **Le alimentan (previsto)**: `vencimiento-pago` (N6) alimenta E5; `compromisos` vienen del input.

## Verificación

1. Fichero: `modules/contabilidad-libro/prevision-caja/`.
2. Eventos reales: subscribes `prevision-caja.proyectar.request`, `contabilidad.criterio_fijado`,
   `contabilidad.asiento_asentado`; publishes `prevision-caja.proyectar.response`, `.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-libro/prevision-caja/index.js
   # → prevision-caja.proyectar.failed  → saldo-tesoreria.calcular.request
   ```
4. Test unitario (si existe): proyectar con compromisos → periodos ordenados con saldo acumulado;
   sin compromisos → `periodos:[]`; compromiso sin fecha → listado aparte; sin `project_id` → 400 + failed.
