---
name: puerto-documento
description: >-
  Skill FULL del módulo CONVERSOR `puerto-documento` de la vertical contabilidad (Enki). Es la
  FRONTERA de las formas declarables del documento. **La forma entra como DATO (formato+mapeo)**:
  traduce la forma externa a la canónica y devuelve, **no interpreta ni escribe**. Si el documento
  trae algo interpretable, encadena a `extraccion-dato` (A4.1). Sin store propio. La op `entrar` es
  PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites traducir un documento externo a la forma canónica declarando formato+mapeo
    (RPC puerto-documento.entrar.request).
  - Cuando depures `FORMATO_NO_DECLARADO` (400) o `FORMATO_NO_DECLARABLE` (422) y qué esquemas declarar.
  - Cuando quieras entender su contrato de eventos y su encadenado con extraccion-dato (A4.1).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, conversor, reflejo, stateless, contabilidad, entrada, puerto, documento]
---

# puerto-documento — CONVERSOR de la frontera del documento

## Qué hace el módulo

`puerto-documento` es un **CONVERSOR (REFLEJO STATELESS)** (A4.2, hoja del plan) de la vertical
**contabilidad**, eje **entrada**. Es la **frontera de las formas declarables del documento**:

> **La forma entra como DATO** (`formato` + `mapeo`). El puerto **traduce** la forma externa a la
> canónica y **devuelve**; **no interpreta ni escribe**.

Traduce los **campos canónicos** (`CAMPOS_DOCUMENTO`: `tipo, contenido, file_path, mime, origen,
fecha, importe_total, tercero`) aplicando el **mapeo declarado** (`campo canónico → clave externa`).
Los campos externos extra se conservan bajo `metadatos` (**no se pierde nada**).

Si el documento trae algo interpretable, **encadena por EVENTO a `extraccion-dato` (A4.1)**, que es
quien lo vuelve DATO. `contenido_interpretado:false`.

La op `entrar` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `puerto-documento.entrar.request` | `onEntrarRequest` | RPC conversor (PREGUNTA): `{project_id, formato, documento?\|externo?, mapeo?, esquemas_declarables?}` → `{formato, direccion:'entrar', documento, adaptador_declarado, contenido_interpretado:false, abierto}`. Delega en `_atender` → `_entrar`. Si `status ≠ 200` publica `.failed`; **si OK**, `_encadenar` publica `extraccion-dato.juzgar.request`. Responde por `puerto-documento.entrar.response`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `puerto-documento.entrar.response` | Respuesta RPC correlada de la op `entrar`. |
| `puerto-documento.entrar.failed` | Par de fallo determinista: formato no declarado (400), formato no declarable (422), o falta documento. |
| `extraccion-dato.juzgar.request` | **Si el documento trae algo interpretable** (`tipo`/`contenido`/`file_path`/`mime`): se encadena a A4.1. Sin documento NO se fabrica. |

> **NO publica un hecho de dominio**: es una frontera (traduce). Su salida externa es el encadenado
> a extracción, por EVENTO. **No interpreta ni escribe.**

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `entrar` | **PREGUNTA** | `{project_id?, formato, documento?\|externo?, mapeo?, esquemas_declarables?}` | `{project_id, formato, direccion:'entrar', documento:{8 campos + metadatos}, adaptador_declarado, contenido_interpretado:false, abierto:[faltantes]}` | `400 FORMATO_NO_DECLARADO` (sin formato) o `INVALID_INPUT documento`; `422 FORMATO_NO_DECLARABLE` (sin mapeo ni esquema); `500`. |

## Reglas de negocio

1. **Formato obligatorio**: sin `formato` → `400 FORMATO_NO_DECLARADO` con
   `{esquemas_declarables}` (la lista de formatos declarables que trajo el input).
2. **Documento obligatorio**: `documento`/`externo` ausente o no-objeto → `400 INVALID_INPUT documento`.
3. **Mapeo declarable** (`_mapeoDe`): `input.mapeo` → o si el formato es **canónico** (`canonico`/`enki`)
   o está en `esquemas_declarables` → **mapeo identidad**. Sin ninguno → `422 FORMATO_NO_DECLARABLE`.
4. **Traducción de campos** (`CAMPOS_DOCUMENTO`): cada campo canónico toma `externo[mapeo[campo] ?? campo]`;
   ausente/vacío → `null` y entra en `abierto` (lista de faltantes).
5. **Metadatos**: los campos externos no mapeados se conservan bajo `documento.metadatos`.
6. **No interpreta**: `contenido_interpretado:false`; el puerto cruza FORMA, no CONTENIDO.
7. **Encadenado** (`_encadenar`): si hay algo interpretable (`tipo`/`contenido`/`file_path`/`mime`) se
   publica `extraccion-dato.juzgar.request` (best-effort). Sin documento **no se fabrica**.
8. **HTTP exacto**: éxito `200`; formato no declarado → `400`; no declarable → `422`; excepción → `500`.

## Cómo se usa (RPC)

### Traducir un documento externo con mapeo

```json
{
  "project_id": "e57a318a-...",
  "formato": "proveedor_x",
  "documento": { "tipo_doc": "factura", "contenido_b64": "…", "total": 1210, "proveedor": "ACME" },
  "mapeo": { "tipo": "tipo_doc", "contenido": "contenido_b64", "importe_total": "total", "tercero": "proveedor" },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "formato": "proveedor_x",
  "direccion": "entrar",
  "documento": {
    "tipo": "factura", "contenido": "…", "file_path": null, "mime": null,
    "origen": null, "fecha": null, "importe_total": 1210, "tercero": "ACME",
    "metadatos": {}
  },
  "adaptador_declarado": true,
  "contenido_interpretado": false,
  "abierto": ["file_path","mime","origen","fecha"]
}
```
Publica `extraccion-dato.juzgar.request`.

### Formato canónico (mapeo identidad)

```json
{ "formato": "canonico", "documento": { "tipo": "factura", "mime": "application/pdf" } }
```
→ no hace falta `mapeo` (identidad).

### Formato no declarable — 422

```json
{ "formato": "desconocido", "documento": { "x": 1 } }
```
→ `422 FORMATO_NO_DECLARABLE` con `{formato, esquemas_declarables}`.

### Sin formato — 400

→ `400 FORMATO_NO_DECLARADO` con `{esquemas_declarables}`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `FORMATO_NO_DECLARADO` | 400 | No se declaró `formato`. |
| `FORMATO_NO_DECLARABLE` | 422 | Se declaró formato pero sin `mapeo` ni esquema declarado. |
| `INVALID_INPUT` | 400 | Falta `documento` (o no es objeto). |
| `UNKNOWN_ERROR` | 500 | Excepción no controlada. |

## Relación con otras piezas (deps por EVENTO)

- **Sube a**: `extraccion-dato.juzgar.request` (A4.1).
- **Le alimentan**: `captura-documento` (A3) publica `puerto-documento.entrar.request` cuando el
  documento declara formato.

## Verificación

1. Fichero: `modules/contabilidad-entrada/puerto-documento/`.
2. Eventos reales: subscribes `puerto-documento.entrar.request`; publishes `puerto-documento.entrar.response`,
   `.failed` (+ `extraccion-dato.juzgar.request`).
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'" modules/contabilidad-entrada/puerto-documento/index.js
   # → puerto-documento.entrar.failed / extraccion-dato.juzgar.request
   ```
4. Test unitario (si existe): mapeo → traduce campos; canónico → identidad; sin formato → 400;
   sin mapeo → 422; encadena si interpretable; sin documento → 400.
