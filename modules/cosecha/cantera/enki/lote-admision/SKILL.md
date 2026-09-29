---
name: lote-admision
description: >
  Skill FULL del módulo REFLEJO `lote-admision` de la vertical contabilidad de Enki.
  DESACOPLE DEL CUELLO: parte una entrada de N hechos en LOTES de tamaño declarable
  (cada uno con su hecho_id estable) para admitirlos EN PARALELO — de forma
  determinista (misma entrada → exactamente los mismos lotes, ids y orden).
  Úsala para operar, depurar o extender el reflejo, o para entender su contrato de
  eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites repartir N hechos en lotes paralelizables (RPC
    lote-admision.admitir.request).
  - Cuando depures por qué no hay reparto (400 INVALID_INPUT si falta project_id, los
    hechos, o un item de hecho es inválido).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de determinismo (misma entrada → mismos lotes, nada se pierde).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo lote-admision.
tags: [enki, modulo, reflejo, contabilidad, lote-admision]
---

# lote-admision — REFLEJO STATELESS del desacople del cuello

## Qué hace el módulo

`lote-admision` es un **REFLEJO STATELESS** (A9, hoja del plan): **DESACOPLE DEL
CUELLO**. La admisión de hechos no se serializa: parte una entrada de **N hechos** en
**LOTES** de tamaño **declarable** (`tamano_lote`), cada uno con su `hecho_id` estable,
para admitirlos **EN PARALELO**.

Invariantes:
- **DETERMINISTA**: misma entrada + mismo tamaño → **EXACTAMENTE** los mismos lotes,
  con los mismos ids y el mismo orden. Cero azar, cero reloj, cero estado.
- **`hecho_id` ESTABLE**: sello (sha1) de `project_id|posicion|clave natural`;
  reprocesar la misma entrada da los mismos ids.
- **Nada se pierde ni se inventa**: la unión de los lotes es **exactamente** la entrada
  (`cubre_entrada:true`).
- **Tamaño no declarado o inválido → 1** (sin lote no hay desacople); se declara
  `tamano_declarado:false`.
- **Sin evento de dominio propio**: su valor **ES** el reparto, y el contrato cierra con
  su par `*.failed`. Sin `PosPersistencia` y sin `project.activated`: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `lote-admision.admitir.request` | `onAdmitirRequest` | RPC reflejo (puro): {project_id, hechos:[...]\|hecho, tamano_lote?} → {total_hechos, tamano, tamano_declarado, total_lotes, lotes:[{lote_id, tamano, items:[{pos, hecho_id, clave, hecho, en_abierto}]}], cubre_entrada}. Reparto determinista de la entrada en lotes paralelizables; tamano no declarado → 1. Responde por lote-admision.admitir.response; hechos ausentes o item invalido → lote-admision.admitir.failed. |
| `contabilidad.hecho_normalizado` | `onHechoNormalizado` | Fire-and-forget (A9): normalizador-hecho (A2) publica un hecho en forma asentable → {project_id, hecho, clave_natural, correlation_id}. Misma proyeccion que el RPC: admite el hecho como lote de uno con su hecho_id estable; hecho invalido → lote-admision.admitir.failed. Cierra el circulo del flujo de entrada. |

### Publishes

| Evento | Descripción |
|---|---|
| `lote-admision.admitir.response` | Respuesta RPC correlada de lote-admision.admitir.request → {request_id, status:200, data:{total_hechos, tamano, tamano_declarado, total_lotes, lotes, cubre_entrada}}. Emitida por el helper _atender. |
| `lote-admision.admitir.failed` | Par de fallo determinista (A9): project_id ausente, hechos ausentes o item de hecho invalido → {status, error:{code, message, details?}}. Cierra el circulo de lote-admision.admitir.request y de contabilidad.hecho_normalizado. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `lote-admision.admitir.failed` cierra el círculo de
> `lote-admision.admitir.request` (por `onAdmitirRequest` cuando `_admitir` devuelve
> status ≠ 200) **y** de `contabilidad.hecho_normalizado`, porque ambos usan la misma
> proyección `_admitir`.

> Nota: el módulo **no** publica ningún `contabilidad.*` propio: el reparto no genera
> evento de dominio — su valor ES la respuesta. El único par de fallo es
> `lote-admision.admitir.failed`.

## Reglas de negocio

1. **La entrada: lista o hecho suelto**: `hechos = input.hechos` si es array; si no,
   `[input.hecho]` si `hecho` es objeto; si no → `400 INVALID_INPUT`
   (`field:'hechos'`).
2. **Ningún item inválido**: si algún elemento no es objeto →
   `400 INVALID_INPUT` (`field:'hechos[i]'`). El reparto no procesa basura a medias.
3. **Tamaño DECLARABLE**: `tamano_declarado = Number.isInteger(input.tamano_lote) &&
   input.tamano_lote > 0`; `tamano = tamano_declarado ? input.tamano_lote : 1`. Sin
   declarar (o inválido) → lote de uno y `tamano_declarado:false`.
4. **Corte determinista en rebanadas**: `total_lotes = Math.ceil(hechos.length /
   tamano)`; cada lote es `hechos.slice(i*tamano, (i+1)*tamano)`, con `indice:i`.
5. **`pos` global**: la posición de un item es `i*tamano + j` (índice en la entrada
   completa), no la del lote.
6. **`hecho_id` ESTABLE**: `_sello('<project_id>|<pos>|<clave||"">')` (sha1, primeros 16
   hex). `clave` es `hecho.clave_natural` si la trae, si no `null` (no se inventa).
7. **`lote_id` determinista**: `_sello('<project_id>|lote|<i>|<tamano>')`. Misma
   entrada + mismo tamaño → mismos `lote_id`.
8. **`en_abierto` sin estimar**: `hecho.abierto` si es array (normalizado a String); si
   no, `[]`. Nada se rellena.
9. **`cubre_entrada`**: `suma(items de todos los lotes) === hechos.length`. La unión de
   los lotes ES la entrada: nada se pierde ni se duplica.
10. **Entrada vacía no es error**: `hechos:[]` es un array válido → `total_lotes:0`,
    `lotes:[]`, `cubre_entrada:true`.
11. **Fire-and-forget del flujo**: `onHechoNormalizado` admite `d.hecho` como lote de
    uno (`hechos:[d.hecho]`), propagando `tamano_lote`/`correlation_id`; sin
    `project_id` devuelve `null`.
12. **Puro**: no persiste, no recuerda, no usa reloj ni azar. `_sello` es sha1 puro.
13. **Validaciones deterministas**: `project_id` ausente → `400 INVALID_INPUT`
    (`field:'project_id'`), con fallback `input.project_id || this.project_id`.
14. **HTTP exacto**: éxito `200`; `project_id`/hechos/item inválidos → `400`; excepción
    en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `lote-admision.admitir.response`.

### 1. `admitir` — repartir la entrada en lotes

```json
{
  "project_id": "e57a318a-...",
  "hechos": [
    { "clave_natural": "pz|VENTA|0001", "importe": 121, "abierto": ["concepto"] },
    { "clave_natural": "pz|VENTA|0002", "importe": 88 },
    { "clave_natural": "pz|VENTA|0003", "importe": 15 }
  ],
  "tamano_lote": 2,
  "correlation_id": "abc-123"
}
```

Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "total_hechos": 3,
  "tamano": 2,
  "tamano_declarado": true,
  "total_lotes": 2,
  "lotes": [
    {
      "indice": 0, "lote_id": "a1b2c3d4e5f60718", "tamano": 2,
      "items": [
        { "pos": 0, "hecho_id": "…", "clave": "pz|VENTA|0001", "hecho": { "clave_natural": "pz|VENTA|0001", "importe": 121, "abierto": ["concepto"] }, "en_abierto": ["concepto"] },
        { "pos": 1, "hecho_id": "…", "clave": "pz|VENTA|0002", "hecho": { "…": "…" }, "en_abierto": [] }
      ]
    },
    {
      "indice": 1, "lote_id": "…", "tamano": 1,
      "items": [ { "pos": 2, "hecho_id": "…", "clave": "pz|VENTA|0003", "hecho": { "…": "…" }, "en_abierto": [] } ]
    }
  ],
  "cubre_entrada": true
}
```

Sin `tamano_lote` → `tamano:1`, `tamano_declarado:false`, un lote por hecho.

### 2. Fire-and-forget — reacción a `contabilidad.hecho_normalizado`

`onHechoNormalizado` admite `d.hecho` como `hechos:[d.hecho]` (lote de uno) con su
`hecho_id` estable. Sin `project_id` devuelve `null`.

### 3. Fallo — item de hecho inválido

```json
{ "project_id": "e57a318a-...", "hechos": [ { "ok": 1 }, null ] }
```

Respuesta `400` + `lote-admision.admitir.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "hechos[i] requerido", "details": { "field": "hechos[i]" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/lote-admision.test.js`. Cubre:

- `admitir` con `tamano_lote:2` y 3 hechos → `total_lotes:2`,
  `tamano_declarado:true`, `cubre_entrada:true`, `pos` global correcto.
- **Determinismo**: dos llamadas con la misma entrada → los mismos `lote_id` y
  `hecho_id`.
- Sin `tamano_lote` (o inválido: 0, negativo, decimal) → `tamano:1`,
  `tamano_declarado:false`.
- `hechos` ausentes (ni array ni hecho) → `400 INVALID_INPUT` (`field:'hechos'`); un
  item `null` → `400` (`field:'hechos[i]'`).
- `hecho` suelto (no array) → se admite como un solo hecho.
- `hechos:[]` → `total_lotes:0`, `cubre_entrada:true`.
- `onHechoNormalizado` admite el hecho como lote de uno; sin `project_id` → `null`.
- `toolAdmitir` devuelve la misma proyección que `_admitir`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `LoteAdmision extends ModuloHibridoReflejo`; `name = 'lote-admision'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin
  `onProjectActivated` (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/lote-admision/`).
- `onAdmitirRequest` usa `this._atender(e, 'admitir',
  'lote-admision.admitir.response', async (d) => {...})` y publica el par `failed` si
  `status !== 200`. `onHechoNormalizado` **no** usa `_atender`: llama directamente a
  `_admitir` y sale antes si falta `project_id`.
- Proyección única `_admitir(input)` → `{status, data}`; helpers `_claveDe(h)`,
  `_enAbierto(h)`, `_sello(semilla)` (sha1, primeros 16 hex). Tool directa
  `toolAdmitir`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo dispara `contabilidad.hecho_normalizado` (emitido por `normalizador-hecho`
  A2); desacopla el cuello de la admisión de hechos (A9).
