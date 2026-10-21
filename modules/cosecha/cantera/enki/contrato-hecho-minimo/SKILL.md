---
name: contrato-hecho-minimo
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `contrato-hecho-minimo` de la vertical
  contabilidad (Enki). Parcela DECLARABLE del MÍNIMO exigible a un hecho por vertical: la cara
  vista desde la fuente. UN escritor. `exigir` (PREGUNTA) contrasta un hecho contra el contrato
  declarado, no escribe, no anuncia; `declarar` (ORDEN/ESCRITURA) fija el contrato de una vertical
  y anuncia contabilidad.contrato_hecho_declarado. SIN contrato declarado: `verificable:false` y
  `conforme:null` (no se da por cumplido por silencio). No se pisa en silencio: re-declarar
  appendea al historial. Persiste por proyecto vía PosPersistencia.
when-to-use: >-
  - Cuando necesites declarar el contrato de hecho mínimo de una vertical, o contrastar un hecho
    contra él (RPC contrato-hecho-minimo.declarar.request / .exigir.request).
  - Cuando depures por qué `exigir` devuelve `verificable:false, conforme:null` (sin contrato).
  - Cuando quieras entender su contrato de eventos y su hecho contabilidad.contrato_hecho_declarado.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, entrada, contrato, minimo, vertical]
---

# contrato-hecho-minimo — CUSTODIO del mínimo exigible a un hecho

## Qué hace el módulo

`contrato-hecho-minimo` es un **CUSTODIO CON PERSISTENCIA** (A11, hoja del plan). Es la parcela
**DECLARABLE** del **MÍNIMO exigible**: la cara vista desde la **FUENTE**. UN escritor. Responde
a la pregunta "¿qué campos mínimos debe traer un hecho de esta vertical?" — y la respuesta la
**DECLARA** el JEFE/asesor; el módulo **NO inventa un mínimo cableado**.

Invariantes:
- `exigir` es PREGUNTA: contrasta un hecho contra el contrato declarado. No escribe → no anuncia
  hecho.
- `declarar` es ORDEN/ESCRITURA: fija el contrato de una vertical → **anuncia el HECHO**.
- **SIN contrato declarado**: `verificable:false` y `conforme:null` (no `true`). Un mínimo que no
  consta **NO se da por cumplido por silencio** (dato ausente = desconocido).
- No se pisa en silencio: re-declarar **APPENDEA** al historial.

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/contrato-hecho-minimo`,
archivo `contrato-hecho-minimo.json`), restaura en `project.activated` y vuelca en `onUnload`.

**Dos caras:** `exigir` es **PREGUNTA** (bus); `declarar` es **ORDEN** (`system_panel`).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `contrato-hecho-minimo.exigir.request` | `onExigirRequest` | RPC custodio (**PREGUNTA**, por el bus): `{project_id, vertical, hecho}` → `{project_id, vertical, conforme, verificable, campos_exigidos, faltantes, abierto}`. Contrasta el hecho contra el contrato declarado; sin contrato → `verificable:false, conforme:null`. Responde por `.exigir.response`. |
| `contrato-hecho-minimo.declarar.request` | `onDeclararRequest` | RPC custodio (**ORDEN**, panel): `{project_id, vertical, campos_exigidos, descripcion?}` → `{project_id, contrato, declarado}`. Declara (UN escritor) el contrato de una vertical. Publica `contabilidad.contrato_hecho_declarado`. Responde por `.declarar.response`. |
| `project.activated` | `onProjectActivated` | Restaura los contratos de hecho mínimo del proyecto activado desde el storage. |

> **Sí sube** (no publica) `cola-declaraciones-criterio.fijar.request` de forma **best-effort**
> cuando falta el contrato, sin suplantar al JEFE (ver `_subirPeticionCriterio`).

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.contrato_hecho_declarado` | Fire-and-forget (A11): quedó declarado el mínimo exigible de una vertical → `{project_id, vertical, contrato, declarado:true}`. Lo consume `puerto-evento-vertical` (para contrastar lo que admite). |
| `contrato-hecho-minimo.exigir.response` | Respuesta RPC correlada de la op `exigir`. |
| `contrato-hecho-minimo.exigir.failed` | Fallo determinista: falta `project_id`, `vertical` o `hecho`. |
| `contrato-hecho-minimo.declarar.response` | Respuesta RPC correlada de la op `declarar`. |
| `contrato-hecho-minimo.declarar.failed` | Fallo determinista: falta `project_id`, `vertical` o `campos_exigidos`. |

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `exigir` | **PREGUNTA** (bus) | `{project_id, vertical, hecho}` | `{project_id, vertical, conforme, verificable, campos_exigidos, faltantes, contrato?, abierto}` | 400 `INVALID_INPUT` (`project_id`/`vertical`/`hecho`) |
| `declarar` | **ORDEN** (panel) | `{project_id, vertical, campos_exigidos, descripcion?}` | `{project_id, contrato, declarado:true}` | 400 `INVALID_INPUT` (`project_id`/`vertical`/`campos_exigidos`) |

## Reglas de negocio (lo que el código IMPONE)

1. **`_exigir`**: sin `project_id` → `_invalid('project_id')`; sin `vertical` →
   `_invalid('vertical')`; sin `hecho` objeto → `_invalid('hecho')`.
2. **Sin contrato** → `conforme:null, verificable:false, campos_exigidos:[], faltantes:[]`,
   `abierto.contrato` declarado. Y el handler sube petición best-effort a la cola de criterios.
3. **Con contrato** → `faltantes` = campos exigidos cuyo valor en el hecho es `undefined/null/''`;
   `conforme = (faltantes.length === 0)`; `verificable:true`.
4. **`_declarar`**: sin `campos_exigidos` no vacío → `_invalid('campos_exigidos')`; el array se
   normaliza a strings no vacíos.
5. **No se pisa en silencio**: cada declaración hace `push` a `contrato.historial` con
   `{campos_exigidos, en}`; `declarado_en` se refresca. `descripcion` se conserva si no viene.
6. **`_subirPeticionCriterio(pid, vertical)`**: `_rpc('cola-declaraciones-criterio.fijar.request',
   {project_id, clave:'contrato_hecho_minimo:'+vertical, origen:'contrato-hecho-minimo'},
   {timeout_ms:2000})` en try/catch. Lectura directa `contratoDe(pid, vertical)`.

## Cómo se usa (RPCs)

### 1. Declarar el contrato

```json
{ "project_id": "e57a318a-...", "vertical": "pizzepos", "campos_exigidos": ["tipo","importe","fecha"], "descripcion": "mínimo de un hecho de venta", "correlation_id": "abc-11" }
```
Respuesta `200` + `contabilidad.contrato_hecho_declarado`:
```json
{ "project_id": "e57a318a-...", "contrato": { "vertical": "pizzepos", "campos_exigidos": ["tipo","importe","fecha"], "descripcion": "mínimo de un hecho de venta", "declarado_en": "2026-10-01T...", "historial": [ { "campos_exigidos": ["tipo","importe","fecha"], "en": "2026-10-01T..." } ] }, "declarado": true }
```

### 2. Contrastar un hecho (conforme)

```json
{ "project_id": "e57a318a-...", "vertical": "pizzepos", "hecho": { "tipo": "venta", "importe": 42, "fecha": "2026-10-01" } }
```
Respuesta `200`: `{conforme:true, verificable:true, campos_exigidos:[...], faltantes:[], contrato:{...}, abierto:null}`.

### 3. Sin contrato → [ABIERTO]

```json
{ "project_id": "e57a318a-...", "vertical": "otra", "hecho": { "x": 1 } }
```
Respuesta `200`: `{conforme:null, verificable:false, abierto:{contrato:'no se declaró el contrato...'}}`.

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`/`vertical`/`hecho`/`campos_exigidos`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; sube best-effort a `cola-declaraciones-criterio`).
- **Quién la consume:** `puerto-evento-vertical` (A1) lee `contabilidad.contrato_hecho_declarado`
  para contrastar lo que admite.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-entrada/contrato-hecho-minimo/module.json` + `index.js`.
2. Smoke: `declarar` → 200 + `contabilidad.contrato_hecho_declarado`.
3. `exigir` con contrato → `conforme` según faltantes; sin contrato → `verificable:false`.
4. Re-declarar → historial crece.
5. Gate `scripts/validate-hibridos.js`.

## Notas de implementación

- Clase `ContratoHechoMinimo extends ModuloHibridoReflejo`; `name = 'contrato-hecho-minimo'`,
  `version = 'reflejo-0.1.0'`. Store `this._contratos` (Map `pid → {esquema, contratos:
  Map<vertical, Contrato>}`).
- **PosPersistencia**: `file:'contrato-hecho-minimo.json'`,
  `dir:'/contabilidad/contrato-hecho-minimo'`.
- Proyecciones `_exigir`/`_declarar`; lectura `contratoDe(pid, vertical)`; helper
  `_subirPeticionCriterio`; tools `toolExigir`/`toolDeclarar`.
