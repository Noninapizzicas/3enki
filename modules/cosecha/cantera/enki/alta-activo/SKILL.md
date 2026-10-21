---
name: alta-activo
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `alta-activo` de la vertical
  contabilidad (Enki). Parcela del INMOVILIZADO: UN escritor. Da de ALTA un activo
  y apila su ficha (append-only); la valoración es reflejo hidratador (se ANOTA lo
  declarado, no se recalcula). El cerrojo: la identidad es el activo_id/codigo; sin
  ella no se da de alta. Anuncia contabilidad.activo_alta y delega por EVENTO a
  escritor-diario, plan-amortizacion y expediente-documental.
when-to-use: >-
  - Cuando necesites dar de alta un activo del inmovilizado (RPC
    alta-activo.registrar.request).
  - Cuando depures un 400 INVALID_INPUT (sin identidad del activo) o que no se emita
    contabilidad.activo_alta.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y la
    delegación a los custodios ajenos.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, analitica, inmovilizado, activo, append-only, single-writer]
---

# alta-activo — CUSTODIO CON PERSISTENCIA del inmovilizado

## Qué hace el módulo

`alta-activo` es un **CUSTODIO CON PERSISTENCIA** (F1, hoja del plan): la parcela
del **INMOVILIZADO**. Es **UN escritor**. Aquí se da de **ALTA** un activo y se
**apila su ficha** (append-only, no se pisa en silencio). La **valoración** es
reflejo hidratador: se **ANOTA lo declarado**, **no se recalcula**.

**EL CERROJO**: la **identidad** es el `activo_id`/`codigo` declarado; **sin ella
NO se da de alta**. **R2**: `registrar` **ESCRIBE** → anuncia el HECHO
`contabilidad.activo_alta`. Además, por EVENTO (best-effort), **SUBE a los
custodios ajenos sin escribirlos**: el asiento del alta a
`escritor-diario.asentar.request`, la cuota a
`plan-amortizacion.cuota_del_periodo.request` y el documento fuente a
`expediente-documental.archivar.request`.

Su op es **CLASE ORDEN** → **SÍ lleva `ui_handler`** (`system_panel`,
`lateral_derecha`). Persiste por proyecto vía **PosPersistencia**
(`_shared/pos-persistencia`, storage `/contabilidad/alta-activo`), restaura en
`project.activated` y vuelca en `onUnload`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `alta-activo.registrar.request` | `onRegistrarRequest` | RPC custodio (ORDEN, panel): `{project_id, activo{activo_id\|codigo, descripcion?, cuenta?, valor?, fecha_alta?, vida_util?, metodo_amortizacion?, documento?}}` → `{project_id, activo, registrado, total, append_only}`. Da de alta/actualiza (append-only) un activo; sin identidad → `INVALID_INPUT`. Publica `contabilidad.activo_alta` (R2) y responde por `alta-activo.registrar.response`. Payload inválido → `alta-activo.registrar.failed`. |
| `project.activated` | `onProjectActivated` | Restaura el inmovilizado del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.activo_alta` | Fire-and-forget (F1): quedó dado de alta un activo → `{project_id, activo_id, activo, valor, alta}`. Lo consumen amortización, informes y expediente. |
| `alta-activo.registrar.response` | Respuesta RPC correlada de la op `registrar`. |
| `alta-activo.registrar.failed` | Par de fallo determinista: falta `project_id` o la identidad del activo → `{status, code, message}`. Cierra el círculo de `registrar.request`. |

> Además, por EVENTO (best-effort), sube a `escritor-diario.asentar.request`,
> `plan-amortizacion.cuota_del_periodo.request` y
> `expediente-documental.archivar.request` (no son `publishes` declarados: son
> subidas a otros custodios).

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `registrar` | **ORDEN** (panel) | `{project_id, activo{activo_id\|codigo, descripcion?, cuenta?, valor?, fecha_alta?, vida_util?, metodo_amortizacion?, documento?}}` | `{project_id, activo, registrado, total, append_only}` | `400 INVALID_INPUT` (`project_id`, `activo`, `activo_id`) |

Tool expuesta: `alta-activo.registrar` (`toolRegistrar` → `_registrar`). Lectura de
proceso: `activoDe(...)`.

## Reglas de negocio

1. **Cerrojo de identidad**: sin `activo_id`/`codigo` → `400 INVALID_INPUT
   activo_id` (`// sin identidad no hay activo`). No se inventa la identidad.
2. **APPEND-ONLY**: la ficha del activo se apila; no se pisa en silencio.
3. **Valoración hidratadora**: se ANOTA lo declarado (`valor`, `vida_util`,
   `metodo_amortizacion`), **no se recalcula**.
4. **UN escritor**: la parcela la encadena el custodio.
5. **R2 — anuncia el hecho**: publica `contabilidad.activo_alta`.
6. **Delegación por EVENTO (best-effort)**: sube el asiento a B2, la cuota a
   `plan-amortizacion` (F2) y el documento a `expediente-documental`. No escribe
   esas parcelas.
7. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `registrar` — alta de un activo

```json
{
  "project_id": "e57a318a-...",
  "activo": { "activo_id": "A-1", "descripcion": "Furgoneta", "cuenta": "218", "valor": 30000, "fecha_alta": "2026-09-01", "vida_util": 6, "metodo_amortizacion": "lineal", "documento": "FAC-COMPRA-1" },
  "correlation_id": "abc-123"
}
```
Respuesta `200` (y se publica `contabilidad.activo_alta` + subidas best-effort):
```json
{ "project_id": "e57a318a-...", "activo": { "activo_id": "A-1", "descripcion": "Furgoneta", "valor": 30000 }, "registrado": true, "total": 1, "append_only": true }
```

### Fallo — sin identidad

```json
{ "project_id": "e57a318a-...", "activo": { "descripcion": "sin codigo" } }
```
Respuesta `400` + `alta-activo.registrar.failed`:
```json
{ "status": 400, "code": "INVALID_INPUT", "message": "activo_id requerido", "details": { "field": "activo_id" } }
```

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `activo` / `activo_id` — falta el campo; sin
  identidad no hay activo.
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia delante (publica el hecho)**: `contabilidad.activo_alta` lo consumen
  `baja-activo` (F3), `valor-neto-contable` (F4), `plan-amortizacion` (F2) e
  informes.
- **Sube por EVENTO (best-effort)**: `escritor-diario.asentar.request` (B2),
  `plan-amortizacion.cuota_del_periodo.request` (F2),
  `expediente-documental.archivar.request`.
- **Hacia atrás (restaura)**: `project.activated`.
- No importa a nadie.

## Verificación

- **Fichero**: `modules/contabilidad-analitica/alta-activo/` (clase `AltaActivo
  extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "activo_alta" module.json index.js` y confirmar
  `escritor-diario.asentar.request` / `plan-amortizacion.cuota_del_periodo.request`
  en `index.js`.
- **Test unitario**: `registrar` con identidad → `200` + `contabilidad.activo_alta`;
  sin identidad → `400 INVALID_INPUT`; re-registrar append; `project.activated`
  restaura.

## Notas de implementación

- **PosPersistencia** (`file: 'alta-activo.json'`, `dir: '/contabilidad/alta-activo'`);
  restaura en `onProjectActivated`, vuelca en `onUnload`.
- Helpers: `_registrar`, `_delegarAlta`, `_obtenerOCrear`, `activoDe`, `_num`,
  `toolRegistrar`.
