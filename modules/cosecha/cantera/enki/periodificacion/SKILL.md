---
name: periodificacion
description: >-
  Skill FULL del módulo REFLEJO STATELESS `periodificacion` de la vertical contabilidad (Enki).
  Imputa cada hecho a su PERIODO con el criterio DECLARADO; CONSERVA fecha operación y fecha
  valor. No estima el periodo: lo deriva del hecho y del criterio declarado (`por`:
  fecha_operacion por defecto o fecha_valor; `mes_corte`: 1..12, por defecto 12 = año natural;
  `granularidad`: mensual/anual). Sin la fecha que gobierna el periodo → `periodo:null` (dato
  ausente = desconocido), no un periodo inventado. Se conservan SIEMPRE ambas fechas. Sin estado.
  RPC PREGUNTA. Cuando falta el criterio, sube petición best-effort a cola-declaraciones-criterio.
when-to-use: >-
  - Cuando necesites imputar un hecho a su periodo conservando fecha operación y fecha valor
    (RPC periodificacion.imputar.request).
  - Cuando depures por qué `periodo:null` (falta la fecha que gobierna) o cómo se calcula el
    ejercicio con `mes_corte`.
  - Cuando quieras entender su contrato de eventos: es reflejo puro, no publica hecho.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, libro, periodo, ejercicio, imputacion]
---

# periodificacion — REFLEJO que imputa el hecho a su periodo

## Qué hace el módulo

`periodificacion` es un **REFLEJO STATELESS** (C3, hoja del plan). Imputa cada hecho a su
**PERIODO** con el criterio **DECLARADO**; **CONSERVA** fecha operación y fecha valor. No estima
el periodo: lo deriva del hecho y del criterio declarado. Sin criterio, el hecho NO se imputa a un
periodo inventado: queda `periodo:null` y se declara ABIERTO.

Invariantes:
- **El CRITERIO de imputación es DECLARABLE**: `fecha_operacion` (por defecto — el día en que
  ocurrió), `fecha_valor`, o un `criterio` con `mes_corte` (mes de cierre, p.ej. 12 = año natural).
  No se cablea un criterio de negocio: entra como dato.
- **Se CONSERVAN SIEMPRE ambas fechas** (`fecha_operacion` y `fecha_valor`): no se pierde ninguna.
- **Sin la fecha que gobierna** → `periodo:null` (dato ausente = desconocido), no un periodo por
  defecto.
- El periodo se expresa como `AAAA-MM` (o `AAAA` con `granularidad:'anual'`), ajustado al `mes_corte`.

**Cuando falta el criterio declarado**, sube una petición best-effort a
`cola-declaraciones-criterio.fijar.request` (sin suplantar al JEFE). RPC **PREGUNTA** → sin panel.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `periodificacion.imputar.request` | `onImputarRequest` | RPC reflejo (**PREGUNTA**, por el bus): `{project_id?, hecho, criterio?, por?, mes_corte?, granularidad?}` → `{project_id, fecha_operacion, fecha_valor, periodo, por, granularidad, mes_corte, criterio_declarado, abierto}`. Deriva el periodo con el criterio declarado; sin la fecha que gobierna → `periodo:null`. Sin hecho → `INVALID_INPUT`. Responde por `.imputar.response`. |

> Nota de deriva (R3): el plan no declara escucha de dominio más allá del RPC. **Sí sube** (no
> publica) `cola-declaraciones-criterio.fijar.request` cuando falta el criterio.

### Publishes

| Evento | Cuándo |
|---|---|
| `periodificacion.imputar.response` | Respuesta RPC correlada de la op `imputar`. |
| `periodificacion.imputar.failed` | Fallo determinista: falta el hecho. |

> **No publica hecho de dominio** (R2, `ui_handlers: []`).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `imputar` | **PREGUNTA** (bus) | `{project_id?, hecho\|elemento, criterio?, por?, mes_corte?, granularidad?, fecha_operacion?, fecha_valor?}` | `{project_id, fecha_operacion, fecha_valor, periodo, por, granularidad, mes_corte, criterio_declarado, abierto}` | 400 `INVALID_INPUT` (`hecho`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Hecho obligatorio**: `hecho`/`elemento` objeto → si no, `_invalid('hecho')`.
2. **Fechas**: `fecha_operacion` de `input.fecha_operacion` o `hecho.fecha_operacion` o
   `hecho.fecha`; `fecha_valor` de `input.fecha_valor` o `hecho.fecha_valor`. Se convierten a ISO.
3. **`por`** (`_por`): `'valor'` si `input.por`/`criterio.por` es `valor` (case-insensitive); si no,
   `'operacion'` (default).
4. **`granularidad`**: `'mensual'` por defecto; `'anual'` cambia el formato del periodo.
5. **`mes_corte`** (`_mesCorte`): entero 1..12; ausente/inválido → 12 (año natural).
6. **`fecha_gobierna`** = `fecha_valor` si `por='valor'`, si no `fecha_operacion`. **Sin ella** →
   `periodo:null` y `abierto.periodo` declarado.
7. **`_periodo`**: `anioEjercicio = m >= mesCorte ? y : y-1`; devuelve `AAAA-MM` (o `AAAA` anual).
   Ojo: el formato mensual usa el año natural `y`, el anual usa `anioEjercicio`.
8. **`abierto.criterio`** declarado si no vino `criterio` (se imputa por operación);
   **`abierto.fecha_valor`** declarado si el hecho no trae fecha valor.
9. **`_subirPeticionCriterio(pid)`**: `_rpc('cola-declaraciones-criterio.fijar.request',
   {project_id, clave:'periodo', origen:'periodificacion'}, {timeout_ms:2000})` en try/catch.

## Cómo se usa (RPC)

### Imputar un hecho

```json
{ "project_id": "e57a318a-...", "hecho": { "fecha": "2026-10-01", "fecha_valor": "2026-10-03" }, "por": "operacion", "mes_corte": 12 }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "fecha_operacion": "2026-10-01T00:00:00.000Z", "fecha_valor": "2026-10-03T00:00:00.000Z", "periodo": "2026-10", "por": "operacion", "granularidad": "mensual", "mes_corte": 12, "criterio_declarado": false, "abierto": { "criterio": "no se declaró `criterio`: se imputa por fecha de operación", "fecha_valor": null } }
```

### Sin la fecha que gobierna → [ABIERTO]

```json
{ "project_id": "e57a318a-...", "hecho": { "x": 1 }, "por": "valor" }
```
Respuesta `200`: `{periodo:null, abierto:{periodo:'no hay fecha de valor: el periodo no se estima'}}`.

### Año natural desplazado (mes_corte=7)

Un hecho de marzo con `mes_corte:7` → su ejercicio es el año anterior; con `granularidad:'anual'`
devuelve `2025`.

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`hecho`) | no viene hecho objeto. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; sube best-effort a `cola-declaraciones-criterio`).
- **Quién la usa:** la cadena del libro (escritor-diario, cierre, comparador-periodos).
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-libro/periodificacion/module.json` + `index.js`.
2. Smoke: `imputar` con fecha → `periodo:'2026-10'`; ambas fechas conservadas.
3. `por:'valor'` sin fecha valor → `periodo:null`.
4. `granularidad:'anual'` + `mes_corte:7` → ajuste de ejercicio.
5. Sin `hecho` → 400 + `.imputar.failed`.
6. `grep -E '"event"' module.json`.

## Notas de implementación

- Clase `Periodificacion extends ModuloHibridoReflejo`; `name = 'periodificacion'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless).
- `onImputarRequest` delega en `_atender`; publica `.imputar.failed` si status ≠ 200; puede subir
  la petición de criterio. Helpers `_por`, `_mesCorte`, `_periodo`, `_fecha`,
  `_subirPeticionCriterio`; tool `toolImputar`.
