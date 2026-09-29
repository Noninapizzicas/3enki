---
name: hecho-rectificativo
description: >
  Skill FULL del módulo PUENTE `hecho-rectificativo` de la vertical contabilidad
  de Enki. Conecta el hecho posterior que corrige/anula uno anterior por clave
  natural — el original NO se borra, la corrección SUMA (append-only); el enlace
  se declara, nunca se fabrica. Úsala para operar, depurar o extender el puente,
  o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites emparejar un hecho rectificativo con su original
    (RPC hecho-rectificativo.emparejar.request).
  - Cuando depures por qué una rectificación no empareja (400 INVALID_INPUT si el
    rectificativo falta o es inválido, o `emparejado:false` sin objetivo
    determinable).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del puente (el original no se muta, append-only, tipo derivado).
  - Cuando vayas a escribir/ampliar el test unitario del puente hecho-rectificativo.
tags: [enki, modulo, puente, contabilidad, hecho-rectificativo]
---

# hecho-rectificativo — PUENTE STATELESS de la corrección

## Qué hace el módulo

`hecho-rectificativo` es un **PUENTE STATELESS** (A13, hoja del plan): conecta el
hecho **POSTERIOR** que corrige/anula uno anterior **POR CLAVE NATURAL**.
**Invariante 3 — el original NO se borra; la corrección SUMA** (append-only). Este
puente **no muta** el asiento original: emite la **RECTIFICACIÓN** (un enlace
Hecho↔Hecho) que el libro apilará. Es uno de los cuatro planos de corrección
(B5·A13·O2·D14), ligados por mapa canónico; **TRES actos, no uno**.

La clave natural la da `clave-natural` (M3) **por evento** (nunca se cablea una
forma). Si no se puede determinar el objetivo (la clave a la que rectifica), **NO**
se inventa el enlace: se declara `emparejado:false` con su motivo. Un puente no
impone; no pisa lo manual.

El tipo `RECTIFICA` vs `ANULA` se **DERIVA** del hecho (o se declara); no se asume —
default honesto `RECTIFICA`. Sin PosPersistencia y sin `project.activated`: no es
custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `hecho-rectificativo.emparejar.request` | `onEmparejarRequest` | RPC puente: {project_id, rectificativo, original?, rectifica_a?, tipo?, motivo?} → {emparejado:true, enlace:{original_clave, rectificativo_clave, tipo:'RECTIFICA'\|'ANULA', borra_original:false, anade:true, append_only:true}, origen_clave, original_mutado:false}. Empareja por clave natural (clave-natural M3, por evento). Sin objetivo determinable → {emparejado:false, motivo} (no se inventa el enlace). Exito → publica contabilidad.hecho_rectificado y responde por hecho-rectificativo.emparejar.response; rectificativo ausente → hecho-rectificativo.emparejar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `hecho-rectificativo.emparejar.response` | Respuesta RPC correlada de hecho-rectificativo.emparejar.request → {request_id, status:200, data:{emparejado, enlace, origen_clave, original_mutado}}. Emitida por el helper _atender. |
| `hecho-rectificativo.emparejar.failed` | Par de fallo determinista (A13): rectificativo ausente/invalido → {status, error:{code, message, details?}}. Cierra el circulo de hecho-rectificativo.emparejar.request. |
| `contabilidad.hecho_rectificado` | Fire-and-forget (A13): una rectificacion quedo emparejada append-only → {project_id, enlace, rectificativo_clave, original_clave, tipo, correlation_id}. Lo consume escritor-diario (B2) para apilar el asiento rectificativo sin tocar el original. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `hecho-rectificativo.emparejar.failed` cierra el círculo de
> `hecho-rectificativo.emparejar.request` cuando `_emparejar` devuelve status ≠ 200
> (rectificativo ausente/inválido → `400`).

> Nota de honestidad (cruce con `index.js`): el caso **sin objetivo determinable**
> devuelve `200 {emparejado:false, motivo}` — **no** publica ninguna de las dos
> ramas (`contabilidad.hecho_rectificado` ni `emparejar.failed`), porque el handler
> solo publica el evento de dominio si `emparejado` es `true`, y solo el par de
> fallo si status ≠ 200. Es un "no emparejado declarado", ni éxito ni error.

> Nota: `_emparejar` acepta además los alias `input.rectificado` e `input.rect` como
> sinónimos de `input.rectificativo` (no figura en `module.json`; lo implementa
> `index.js` en `_emparejar`).

## Reglas de negocio

1. **El original no se muta, la corrección suma**: el enlace se construye con
   `borra_original:false`, `anade:true`, `append_only:true` **siempre**; y la
   respuesta declara `original_mutado:false`. Es un enlace Hecho↔Hecho, no un
   borrado.
2. **Sin objetivo determinable no hay enlace inventado**: si tras declarar/calcular
   el `objetivo` sigue vacío → `200 {emparejado:false, enlace:null, motivo:'no se
   pudo determinar el hecho original (clave natural no declarada ni disponible)'}`.
3. **Clave natural por evento (M3)**: la clave del rectificativo se toma de
   `rect.clave_natural` (`origen_clave:'declarada'`) o se pide a
   `clave-natural.calcular.request` **por evento** (`origen_clave:'clave-natural'`,
   `timeout_ms:4000`). No se cablea la forma de la clave.
4. **Objetivo en cascada**: el objetivo (a qué rectifica) se busca en orden:
   `input.rectifica_a` → `rect.rectifica_a` → `original.clave_natural`; si aún
   vacío y hay `original` (objeto), se calcula su clave vía
   `clave-natural.calcular.request`.
5. **Tipo derivado, default honesto**: `_tipo(raw)` normaliza a mayúsculas; solo
   `RECTIFICA` y `ANULA` (Set `TIPOS`) se aceptan; cualquier otro valor o ausente →
   `RECTIFICA`.
6. **El enlace es completo**: `{original_clave, rectificativo_clave, tipo,
   borra_original:false, anade:true, append_only:true, motivo, original:{clave_natural},
   rectificativo:{clave_natural}, emparejado_en}`. `emparejado_en` se sella con
   `new Date().toISOString()`.
7. **`motivo` opcional**: se toma de `input.motivo` o `rect.motivo`, normalizado a
   String o `null`.
8. **`project_id` tolerante**: `input.project_id || this.project_id || null`. El
   puente no lo exige (a diferencia de otros módulos): el guard de identidad es el
   rectificativo.
9. **Validación determinista**: `rectificativo` ausente o no objeto → `400
   INVALID_INPUT` (`field:'rectificativo'`).
10. **HTTP exacto**: éxito `200` (con `emparejado` true o false); rectificativo
    inválido → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `hecho-rectificativo.emparejar.response` y emite
`contabilidad.hecho_rectificado`.

### 1. `emparejar` con clave natural declarada en el rectificativo

```json
{
  "project_id": "e57a318a-...",
  "rectificativo": { "clave_natural": "pizzepos:venta:2026-09-01:R1", "tipo_rectificacion": "ANULA", "motivo": "anulada por devolucion" },
  "rectifica_a": "pizzepos:venta:2026-09-01:0001",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "emparejado": true,
  "enlace": {
    "original_clave": "pizzepos:venta:2026-09-01:0001",
    "rectificativo_clave": "pizzepos:venta:2026-09-01:R1",
    "tipo": "ANULA",
    "borra_original": false,
    "anade": true,
    "append_only": true,
    "motivo": "anulada por devolucion",
    "original": null,
    "rectificativo": { "clave_natural": "pizzepos:venta:2026-09-01:R1" },
    "emparejado_en": "2026-09-25T..."
  },
  "origen_clave": "declarada",
  "original_mutado": false
}
```
Emite `contabilidad.hecho_rectificado`:
```json
{ "project_id": "e57a318a-...", "enlace": { "...": "..." }, "rectificativo_clave": "pizzepos:venta:2026-09-01:R1", "original_clave": "pizzepos:venta:2026-09-01:0001", "tipo": "ANULA", "correlation_id": "abc-123" }
```

### 2. `emparejar` con `original` (se calcula la clave del original)

```json
{ "project_id": "e57a318a-...", "rectificativo": { "clave_natural": "R1" }, "original": { "vertical": "pizzepos", "tipo": "venta", "fecha": "2026-09-01", "numero": "0001" }, "tipo": "RECTIFICA" }
```
`_emparejar` pide a `clave-natural.calcular.request` la clave del original y
compone el enlace con `original:{clave_natural:<calculada>}`.

### 3. Sin objetivo — se declara, no se inventa

```json
{ "project_id": "e57a318a-...", "rectificativo": { "importe": -121 } }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "emparejado": false, "enlace": null, "motivo": "no se pudo determinar el hecho original (clave natural no declarada ni disponible)" }
```

### 4. Fallo — rectificativo inválido

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `400` + `hecho-rectificativo.emparejar.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "rectificativo requerido", "details": { "field": "rectificativo" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/hecho-rectificativo.test.js`.
Cubre:

- `emparejar` con clave declarada + `rectifica_a` → `200 emparejado:true`, enlace
  append-only (`borra_original:false`, `anade:true`, `append_only:true`) y emite
  `contabilidad.hecho_rectificado`.
- `emparejar` con `original` sin clave → calcula vía M3 (`origen_clave:'clave-natural'`).
- `emparejar` sin objetivo → `200 emparejado:false` (no emite evento ni failed).
- `tipo` inválido → se deriva a `RECTIFICA`; `tipo` declarado `ANULA` se respeta.
- `rectificativo` ausente/no objeto → `400 INVALID_INPUT` +
  `hecho-rectificativo.emparejar.failed`.
- `original_mutado:false` en toda respuesta emparejada.
- `toolEmparejar` devuelve la misma proyección que `_emparejar`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `HechoRectificativo extends ModuloHibridoReflejo`; `name =
  'hecho-rectificativo'`, `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin
  store, sin `onProjectActivated` (PUENTE stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/hecho-rectificativo/`).
- `onEmparejarRequest` usa `this._atender(e, 'emparejar',
  'hecho-rectificativo.emparejar.response', async (d) => {...})`; dentro hace el
  cierre de círculo: en `200 && emparejado` publica `contabilidad.hecho_rectificado`;
  si status ≠ 200 publica `hecho-rectificativo.emparejar.failed`.
- Proyección única `_emparejar(input)` (`async`, consulta M3 por evento) →
  `{status, data}`; helper `_tipo(raw)`. Tool directa `toolEmparejar`.
- `_invalid` / `_errorResponse` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `clave-natural.calcular.request` (M3) por evento; lo consume
  `escritor-diario` (B2) vía `contabilidad.hecho_rectificado`.
