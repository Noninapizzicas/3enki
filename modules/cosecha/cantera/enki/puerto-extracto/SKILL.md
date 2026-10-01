---
name: puerto-extracto
description: >-
  Skill FULL del módulo CONVERSOR `puerto-extracto` de la vertical contabilidad (Enki). Es la
  FRONTERA de canal/formato del extracto bancario. **El banco entra como DATO (canal/banco+mapeo)**:
  traduce y devuelve, **no concilia ni escribe**. Si hay movimientos interpretables, los encadena a
  `conciliacion-bancaria` (E1) por EVENTO. Sin store propio. La op `entrar` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites traducir un extracto bancario a movimientos canónicos declarando banco/formato+mapeo
    (RPC puerto-extracto.entrar.request).
  - Cuando depures `FORMATO_NO_DECLARADO` (400) o `FORMATO_NO_DECLARABLE` (422) y qué esquemas declarar.
  - Cuando quieras entender su contrato de eventos y su encadenado con conciliacion-bancaria (E1).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, conversor, reflejo, stateless, contabilidad, libro, extracto, bancos]
---

# puerto-extracto — CONVERSOR de la frontera del extracto bancario

## Qué hace el módulo

`puerto-extracto` es un **CONVERSOR (REFLEJO STATELESS)** (E2, hoja del plan) de la vertical
**contabilidad**, eje **libro**. Es la **frontera de canal/formato del extracto bancario**:

> **El banco entra como DATO** (`banco`/`formato` + `mapeo`). El puerto **traduce** el extracto externo
> a **movimientos canónicos** y **devuelve**; **no concilia ni escribe**.

Traduce los **campos canónicos** del movimiento (`CAMPOS_MOVIMIENTO`: `fecha, concepto, importe,
saldo, referencia, divisa`) aplicando el **mapeo declarado** (`campo canónico → clave externa`), y la
lista de movimientos (`mapeo.movimientos`, por defecto `movimientos`).

Si hay movimientos interpretables, **encadena por EVENTO a `conciliacion-bancaria.cruzar.request`**
(E1), que es quien **cruza**. `conciliado:false`.

La op `entrar` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `puerto-extracto.entrar.request` | `onEntrarRequest` | RPC conversor (PREGUNTA): `{project_id, banco?, formato?, extracto?\|externo?, mapeo?, esquemas_declarables?}` → `{banco, formato, direccion:'entrar', movimientos, total, adaptador_declarado, conciliado:false, abierto}`. Delega en `_atender` → `_entrar`. Si `status ≠ 200` publica `.failed`; **si OK**, `_encadenar` publica `conciliacion-bancaria.cruzar.request`. Responde por `puerto-extracto.entrar.response`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `puerto-extracto.entrar.response` | Respuesta RPC correlada de la op `entrar`. |
| `puerto-extracto.entrar.failed` | Par de fallo determinista: formato no declarado (400), formato no declarable (422), o falta extracto/movimientos. |
| `conciliacion-bancaria.cruzar.request` | **Si hay movimientos**: se encadena a E1 (que cruza). Sin movimientos NO se fabrica. |

> **NO publica un hecho de dominio**: es una frontera (traduce). Su salida externa es el encadenado a
> conciliación, por EVENTO. **No concilia ni escribe.**

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `entrar` | **PREGUNTA** | `{project_id?, banco?, formato?, extracto?\|externo?, mapeo?, esquemas_declarables?}` | `{project_id, banco, formato, direccion:'entrar', movimientos:[{6 campos}], total, adaptador_declarado, conciliado:false, abierto:[faltantes]}` | `400 FORMATO_NO_DECLARADO` (sin banco/formato) o `INVALID_INPUT extracto`/`extracto.movimientos`; `422 FORMATO_NO_DECLARABLE`; `500`. |

## Reglas de negocio

1. **Formato/canal obligatorio**: `formato` → o el `banco` declarado. Sin ninguno →
   `400 FORMATO_NO_DECLARADO` con `{esquemas_declarables}`.
2. **Extracto obligatorio**: `extracto`/`externo` ausente o no-objeto → `400 INVALID_INPUT extracto`.
3. **Mapeo declarable** (`_mapeoDe`): `input.mapeo` → o si el formato es **canónico** (`canonico`/`enki`)
   o está en `esquemas_declarables` → **mapeo identidad** (incluye `movimientos:'movimientos'`).
   Sin ninguno → `422 FORMATO_NO_DECLARABLE`.
4. **Lista de movimientos**: el extracto puede ser un array, o un objeto con `mapeo.movimientos`
   (por defecto `movimientos`). Sin lista → `400 INVALID_INPUT extracto.movimientos`.
5. **Traducción de movimientos** (`CAMPOS_MOVIMIENTO`): cada campo toma `m[mapeo[campo] ?? campo]`;
   ausente/vacío → `null` y se acumula en `abierto` (lista de faltantes). El **importe se normaliza a
   número solo si viene** (no se estima); la divisa se conserva.
6. **No concilia**: `conciliado:false`; el puerto cruza FORMATO, no CONTENIDO.
7. **Encadenado** (`_encadenar`): si hay movimientos, publica `conciliacion-bancaria.cruzar.request`
   (best-effort). Sin movimientos **no se fabrica**.
8. **HTTP exacto**: éxito `200`; formato no declarado → `400`; no declarable → `422`; excepción → `500`.

## Cómo se usa (RPC)

### Traducir un extracto con mapa

```json
{
  "project_id": "e57a318a-...",
  "banco": "bbva",
  "mapeo": { "fecha": "fecha_valor", "concepto": "descripcion", "importe": "importe", "referencia": "ref", "movimientos": "apuntes" },
  "extracto": { "apuntes": [ { "fecha_valor": "2026-09-15", "descripcion": "TRANSF", "importe": -1000, "ref": "F-001" } ] },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "banco": "bbva",
  "formato": "bbva",
  "direccion": "entrar",
  "movimientos": [ { "fecha": "2026-09-15", "concepto": "TRANSF", "importe": -1000, "saldo": null, "referencia": "F-001", "divisa": null } ],
  "total": 1,
  "adaptador_declarado": true,
  "conciliado": false,
  "abierto": ["saldo","divisa"]
}
```
Publica `conciliacion-bancaria.cruzar.request`.

### Formato canónico (identidad)

```json
{ "formato": "canonico", "extracto": { "movimientos": [ { "fecha": "2026-09-15", "importe": -1000 } ] } }
```

### Formato no declarable — 422

```json
{ "banco": "raro", "extracto": { "movimientos": [] } }
```
→ `422 FORMATO_NO_DECLARABLE` con `{banco, formato, esquemas_declarables}`.

### Sin formato — 400

→ `400 FORMATO_NO_DECLARADO` con `{esquemas_declarables}`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `FORMATO_NO_DECLARADO` | 400 | No se declaró ni `banco` ni `formato`. |
| `FORMATO_NO_DECLARABLE` | 422 | Se declaró formato pero sin `mapeo` ni esquema declarado. |
| `INVALID_INPUT` | 400 | Falta `extracto` o su lista de movimientos. |
| `UNKNOWN_ERROR` | 500 | Excepción no controlada. |

## Relación con otras piezas (deps por EVENTO)

- **Sube a**: `conciliacion-bancaria.cruzar.request` (E1).
- **Cierra el flujo**: E2 traduce → E1 cruza → E9 explica el desfase → E10 compone el informe.

## Verificación

1. Fichero: `modules/contabilidad-libro/puerto-extracto/`.
2. Eventos reales: subscribes `puerto-extracto.entrar.request`; publishes `puerto-extracto.entrar.response`,
   `.failed`, `conciliacion-bancaria.cruzar.request`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'" modules/contabilidad-libro/puerto-extracto/index.js
   # → puerto-extracto.entrar.failed / conciliacion-bancaria.cruzar.request
   ```
4. Test unitario (si existe): mapeo → movimientos canónicos; canónico → identidad; sin formato → 400;
   sin mapeo → 422; encadena si hay movimientos; importe normalizado solo si viene.
