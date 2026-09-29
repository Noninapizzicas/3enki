---
name: modelo-303
description: >
  Skill FULL del módulo REFLEJO `modelo-303` de la vertical contabilidad de Enki.
  CONSTRUYE el modelo 303 desde la liquidación rellenando la ESTRUCTURA declarable —
  el sistema PREPARA el borrador y NO lo presenta ni lo firma (eso es del asesor);
  sin estructura declarada devuelve `casillas:null`, sin inventar casillas. Úsala para
  operar, depurar o extender el reflejo, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites construir el modelo 303 de un periodo (RPC
    modelo-303.construir.request).
  - Cuando depures por qué el modelo sale `construido:false` (sin liquidación), o por qué
    `casillas` es `null` (`estructura_declarada:false`), o por qué falta `project_id`
    (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del modelo (la estructura es declarable, no se inventan casillas, el
    sistema prepara y el asesor firma).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo modelo-303.
tags: [enki, modulo, reflejo, contabilidad, modelo-303]
---

# modelo-303 — REFLEJO STATELESS del modelo 303

## Qué hace el módulo

`modelo-303` es un **REFLEJO STATELESS** (D2, hoja del plan): **CONSTRUYE el modelo
303** (autoliquidación periódica del régimen IVA/IGIC/IPSI) **DESDE la liquidación**
(D1). **Determinista**: misma liquidación + misma estructura declarada → mismo modelo.
**NO liquida** (eso es D1) y **NO recalcula asientos**.

**LA LEY ENTRA COMO DATO** (invariante 5): la **ESTRUCTURA** del modelo (qué casillas
tiene y cómo se llaman) es **DECLARABLE** (`estructura`, `ParametroDeclarable`) y el
**FORMATO** también (`formato`, [ABIERTO]). Este módulo **NO cablea números de casilla,
ni tipos, ni plazos, ni ejercicios** — solo **RELLENA** la estructura que el
negocio/asesor declara con los importes del libro.

- Con `estructura` declarada → `casillas:[{casilla, etiqueta, valor, campo}]` rellenadas
  por `campo` (campos soportados: `total_devengado`, `total_soportado`, `cuota`,
  `signo`, y `devengado.<tipo>` / `soportado.<tipo>`).
- Sin `estructura` declarada → `casillas:null`, `estructura_declarada:false` con el
  **BORRADOR** de datos del libro para que el asesor decida el encaje — **jamás se
  inventan casillas ni denominaciones legales** (un campo ausente → `valor:null`, no
  `0`).

La liquidación llega por **dos vías**, ninguna es un `require` cruzado: declarada en la
petición (`liquidacion`) o pedida a `liquidacion-iva` **POR EVENTO** (RPC
`liquidacion-iva.calcular.request`). Sin ninguna **NO** se construye con importes
inventados (`construido:false`, motivo declarado, invariante 7).

**El sistema PREPARA; el ASESOR presenta y firma** — el modelo viaja con
`presentado:false`, `firmado:false`, `preparado_para_asesor:true`. Sin `PosPersistencia`
ni `project.activated`: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `modelo-303.construir.request` | `onConstruirRequest` | RPC reflejo (construccion determinista): {project_id, ejercicio?, periodo?, regimen?, territorio?, tipos?, liquidacion?, estructura?, formato?} → {modelo, construido, origen_liquidacion}. Rellena la estructura DECLARABLE (casillas) con los importes de la liquidacion (pedida a liquidacion-iva POR EVENTO o declarada en la peticion); sin estructura declarada entrega el borrador con casillas:null y estructura_declarada:false (no se inventan casillas). Sin liquidacion → construido:false con motivo (no se construye con importes inventados). El modelo viaja con presentado:false y firmado:false. Responde por modelo-303.construir.response; fallo (project_id ausente) → modelo-303.construir.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `modelo-303.construir.response` | Respuesta RPC correlada de modelo-303.construir.request → {request_id, status:200, data:{modelo, construido, origen_liquidacion}}. Emitida por el helper _atender. |
| `modelo-303.construir.failed` | Par de fallo determinista (D2): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de modelo-303.construir.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `modelo-303.construir.failed` cierra el círculo de
> `modelo-303.construir.request` cuando `_construir` devuelve status ≠ 200
> (`project_id` ausente).

> Nota: no figura en `module.json` pero lo **pide** `index.js` en `_liquidacion`: la RPC
> saliente `liquidacion-iva.calcular.request` con `{project_id, ejercicio, periodo,
> regimen, territorio, tipos}` y `timeout_ms:5000`. Es una dependencia (DEP) por evento,
> no un evento emitido.

## Reglas de negocio

1. **Fallo determinista**: `_construir` toma `input.project_id || this.project_id`;
   ausente → `400 INVALID_INPUT` (`field:'project_id'`).
2. **La liquidación se declara o se pide, nunca se inventa**: `_liquidacion(pid, input)`
   usa `input.liquidacion` si es objeto (`origen:'declarada_en_peticion'`); si no, pide
   `liquidacion-iva.calcular.request` por evento (`origen:'liquidacion-iva'`); si no
   responde → `{liquidacion:null, origen:null}`.
3. **Sin liquidación NO se construye (invariante 7)**: `200` con `modelo:null`,
   `construido:false` y
   `motivo:'no hay liquidacion disponible: el modelo no se construye con importes inventados'`.
   **No se construye un modelo con importes inventados.**
4. **La estructura es DECLARABLE**: `_estructura(raw)` acepta `[{casilla, campo, etiqueta?}]`;
   filtra los que no traigan `casilla` ni `campo`; normaliza a String; `etiqueta` a
   String o `null`. Sin array o vacío → `null` (`estructura_declarada:false`). **No se
   cablean casillas ni denominaciones legales.**
5. **Relleno campo a campo, campo ausente → `null`**: `_valorDe(liquidacion, campo)`
   resuelve `total_devengado` / `total_soportado` / `cuota` / `signo` (con `?? null`), y
   `devengado.<tipo>` / `soportado.<tipo>` buscando la línea del `detalle` por tipo; si
   el tipo no está presente → `null` (**no `0`**). Cualquier otro campo → `null`.
6. **El BORRADOR con los datos del libro SIEMPRE viaja**: `modelo.datos =
   {total_devengado, total_soportado, cuota, signo}` — el asesor decide el encaje
   aunque no haya estructura declarada.
7. **El formato es declarable ([ABIERTO])**: `formato = input.formato ?? null`; se copia
   al modelo tal cual, sin validarlo contra ningún formato legal.
8. **El sistema NO presenta ni firma**: el modelo declara `presentado:false`,
   `firmado:false`, `preparado_para_asesor:true`. **No lo asume: lo declara.**
9. **El modelo es determinista y completo**: `{modelo:'303', ejercicio, periodo,
   regimen, territorio, formato, estructura_declarada, casillas, datos, presentado,
   firmado, preparado_para_asesor}`. `regimen`/`territorio` se copian de la liquidación o
   quedan `null`.
10. **Etiquetas**: `ejercicio`, `periodo` (String) se propagan del input o quedan `null`.
11. **Sin estado persistente**: sin `PosPersistencia`, sin `onProjectActivated`.
12. **HTTP exacto**: éxito `200` (con `construido` true o false); `project_id` ausente →
    `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `modelo-303.construir.response`.

### 1. `construir` — con estructura declarada

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "periodo": "2026-3T",
  "regimen": "IVA",
  "estructura": [
    { "casilla": "01", "campo": "total_devengado", "etiqueta": "Base a tipo general (declarable)" },
    { "casilla": "28", "campo": "total_soportado" },
    { "casilla": "46", "campo": "cuota" },
    { "casilla": "65", "campo": "signo" }
  ],
  "formato": "borrador-asesor",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "periodo": "2026-3T",
  "construido": true,
  "origen_liquidacion": "liquidacion-iva",
  "modelo": {
    "modelo": "303",
    "ejercicio": "2026",
    "periodo": "2026-3T",
    "regimen": "IVA",
    "territorio": "comun",
    "formato": "borrador-asesor",
    "estructura_declarada": true,
    "casillas": [
      { "casilla": "01", "etiqueta": "Base a tipo general (declarable)", "valor": 210, "campo": "total_devengado" },
      { "casilla": "28", "etiqueta": null, "valor": 100, "campo": "total_soportado" },
      { "casilla": "46", "etiqueta": null, "valor": 110, "campo": "cuota" },
      { "casilla": "65", "etiqueta": null, "valor": "A_INGRESAR", "campo": "signo" }
    ],
    "datos": { "total_devengado": 210, "total_soportado": 100, "cuota": 110, "signo": "A_INGRESAR" },
    "presentado": false,
    "firmado": false,
    "preparado_para_asesor": true
  }
}
```

Sin `estructura` → `estructura_declarada:false` y `casillas:null`, con el borrador
`datos` intacto. Un `campo` cuyo tipo no esté en la liquidación → `valor:null` (no `0`).

### 2. Sin liquidación — no se construye

Sin `liquidacion` y con `liquidacion-iva` sin responder → `200` con:

```json
{ "modelo": null, "construido": false, "motivo": "no hay liquidacion disponible: el modelo no se construye con importes inventados" }
```

### 3. Fallo — falta `project_id`

```json
{ "periodo": "2026-3T" }
```

Respuesta `400` + `modelo-303.construir.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/modelo-303.test.js`. Cubre:

- `construir` con `estructura` declarada → `200 construido:true` y `casillas` rellenadas
  por `campo`, con `presentado:false` y `firmado:false`.
- Sin `estructura` → `casillas:null`, `estructura_declarada:false` y el borrador `datos`
  presente (**no se inventan casillas**).
- Sin `liquidacion` y sin respuesta de `liquidacion-iva` → `construido:false` con motivo
  (**no se construye con importes inventados**).
- Campo `devengado.<tipo>` con el tipo ausente → `valor:null` (no `0`).
- Liquidación declarada en la petición → `origen_liquidacion:'declarada_en_peticion'`.
- `construir` sin `project_id` → `400 INVALID_INPUT` + `modelo-303.construir.failed`.
- `toolConstruir` devuelve la misma proyección que `_construir`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `Modelo303 extends ModuloHibridoReflejo`; `name = 'modelo-303'`,
  `version = 'reflejo-0.1.0'`. **Sin store**: reflejo puro, sin `PosPersistencia`, sin
  `onProjectActivated`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-fiscal/modelo-303/`).
- `onConstruirRequest` usa `this._atender(e, 'construir', 'modelo-303.construir.response',
  async (d) => {...})` y dentro publica `modelo-303.construir.failed` si `status !== 200`.
- Proyección `_construir(input)` (`async`, porque puede pedir la liquidación por evento);
  helpers `_liquidacion`, `_estructura`, `_valorDe`. Tool `toolConstruir`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `liquidacion-iva.calcular.request` (D1) por evento; lo LEE el asesor / el
  canal de borradores.
- **LA LEY COMO DATO**: la estructura y el formato del modelo son **declarables**;
  el módulo **PREPARA** el modelo rellenando lo declarado con los importes del libro —
  **el sistema no presenta y no firma; el asesor presenta y firma**.
