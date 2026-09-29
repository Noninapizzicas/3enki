---
name: modelo-390
description: >
  Skill FULL del módulo REFLEJO `modelo-390` de la vertical contabilidad de Enki.
  CONSTRUYE el resumen ANUAL (modelo 390) desde las liquidaciones del ejercicio
  rellenando la ESTRUCTURA declarable — el sistema PREPARA el anualizado y NO lo
  presenta ni lo firma; sin estructura declarada devuelve `casillas:null`, sin inventar
  casillas ni periodos. Úsala para operar, depurar o extender el reflejo, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites construir el resumen anual 390 de un ejercicio (RPC
    modelo-390.construir.request).
  - Cuando depures por qué el modelo sale `construido:false` (sin liquidaciones ni
    periodos declarados), o por qué `casillas` es `null`
    (`estructura_declarada:false`), o por qué falta `project_id` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del resumen anual (la estructura y los periodos son declarables, no se
    inventan casillas, el sistema prepara y el asesor firma).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo modelo-390.
tags: [enki, modulo, reflejo, contabilidad, modelo-390]
---

# modelo-390 — REFLEJO STATELESS del resumen anual

## Qué hace el módulo

`modelo-390` es un **REFLEJO STATELESS** (D3, hoja del plan): **CONSTRUYE el resumen
ANUAL (modelo 390) desde las LIQUIDACIONES del ejercicio** (D1), una por periodo
declarado. **Determinista**: mismas liquidaciones + misma estructura declarada → mismo
resumen anual. **NO liquida** y **NO recalcula asientos**.

**LA LEY ENTRA COMO DATO** (invariante 5): la **ESTRUCTURA** del resumen (casillas y su
denominación) es **DECLARABLE** (`estructura`, `ParametroDeclarable`), el **FORMATO**
también (`formato`, [ABIERTO]), y los **PERIODOS** del ejercicio son
`ParametroDeclarable` — el módulo **NO cablea cuántos periodos tiene un ejercicio
(mensual/trimestral es dato del negocio), ni números de casilla, ni plazos, ni
ejercicios concretos**.

- Con `estructura` declarada → `casillas:[{casilla, etiqueta, valor, campo}]` rellenadas
  por `campo` (`total_devengado`, `total_soportado`, `cuota`, y `devengado.<tipo>` /
  `soportado.<tipo>`).
- Sin `estructura` → `casillas:null`, `estructura_declarada:false` con el **ANUALIZADO**
  por concepto para que el asesor decida el encaje — **jamás se inventan casillas ni
  denominaciones legales** (tipo ausente → `null`, no `0`).

El **anualizado es determinista**: se acumulan los conceptos del libro de cada
liquidación (`total_devengado`, `total_soportado`, `cuota` y desglose por tipo
**DECLARADO**). Las liquidaciones llegan por **dos vías**, ninguna es un `require`
cruzado: declaradas en la petición (`liquidaciones`) o pedidas a `liquidacion-iva`
**POR EVENTO**, una por cada periodo **DECLARADO** en `periodos`; sin ninguna **NO** se
construye con importes inventados (`construido:false`, motivo, invariante 7).

**El sistema PREPARA; el ASESOR presenta y firma** — el modelo viaja con
`presentado:false`, `firmado:false`, `preparado_para_asesor:true`. Sin `PosPersistencia`
ni `project.activated`: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `modelo-390.construir.request` | `onConstruirRequest` | RPC reflejo (construccion determinista): {project_id, ejercicio?, regimen?, territorio?, tipos?, liquidaciones?, periodos?, estructura?, formato?} → {modelo, construido, origen_liquidaciones, periodos_pedidos}. Anualiza los conceptos del libro de las liquidaciones (declaradas o pedidas a liquidacion-iva POR EVENTO, una por periodo DECLARADO) y rellena la estructura DECLARABLE (casillas); sin estructura declarada entrega el anualizado con casillas:null y estructura_declarada:false (no se inventan casillas ni periodos). Sin liquidaciones → construido:false con motivo. El modelo viaja con presentado:false y firmado:false. Responde por modelo-390.construir.response; fallo (project_id ausente) → modelo-390.construir.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `modelo-390.construir.response` | Respuesta RPC correlada de modelo-390.construir.request → {request_id, status:200, data:{modelo, construido, origen_liquidaciones, periodos_pedidos}}. Emitida por el helper _atender. |
| `modelo-390.construir.failed` | Par de fallo determinista (D3): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de modelo-390.construir.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `modelo-390.construir.failed` cierra el círculo de
> `modelo-390.construir.request` cuando `_construir` devuelve status ≠ 200
> (`project_id` ausente).

> Nota: no figura en `module.json` pero lo **pide** `index.js` en `_liquidaciones`: la
> RPC saliente `liquidacion-iva.calcular.request` (una por cada periodo DECLARADO) con
> `{project_id, ejercicio, periodo, regimen, territorio, tipos}` y `timeout_ms:5000`. Es
> una dependencia (DEP) por evento, no un evento emitido.

## Reglas de negocio

1. **Fallo determinista**: `_construir` toma `input.project_id || this.project_id`;
   ausente → `400 INVALID_INPUT` (`field:'project_id'`).
2. **Las liquidaciones se declaran o se piden, nunca se inventan**:
   `_liquidaciones(pid, input)` usa `input.liquidaciones` (array no vacío) si llega
   (`origen:'declaradas_en_peticion'`); si no, exige `input.periodos` (array no vacío) y
   pide a `liquidacion-iva.calcular.request` **una por periodo**
   (`origen:'liquidacion-iva'`, `periodos_pedidos:periodos`). **Sin periodos declarados
   no se inventan periodos**: devuelve vacío.
3. **Sin liquidaciones NO se construye (invariante 7)**: `200` con `modelo:null`,
   `construido:false` y
   `motivo:'no hay liquidaciones del ejercicio: el resumen anual no se construye con importes inventados'`.
4. **El ANUALIZADO es determinista**: `total_devengado = round(Σ l.total_devengado, 2)`,
   `total_soportado = round(Σ l.total_soportado, 2)`,
   `cuota = round(total_devengado − total_soportado, 2)`. Los importes **SON** los de las
   liquidaciones; el sistema **no estima** ninguno.
5. **El desglose anual es por tipo DECLARADO**: `porTipo = {devengado:{}, soportado:{}}`;
   se acumula `it.cuota` por `it.tipo`, y el tipo ausente se agrupa como
   `'SIN_TIPO_DECLARADO'` (**el tipo sigue siendo dato, no constante**).
6. **La estructura es DECLARABLE**: `_estructura(raw)` acepta `[{casilla, campo, etiqueta?}]`;
   filtra los que no traigan `casilla` ni `campo`; normaliza a String; `etiqueta` a
   String o `null`. Sin array o vacío → `null` (`estructura_declarada:false`).
7. **Relleno campo a campo, campo ausente → `null`**: `_valorDe(anual, porTipo, campo)`
   resuelve `total_devengado` / `total_soportado` / `cuota`, y `devengado.<tipo>` /
   `soportado.<tipo>` buscando en `porTipo`; si el tipo no está presente → `null`
   (**no `0`**). Cualquier otro campo → `null`.
8. **El ANUALIZADO con los datos del libro SIEMPRE viaja**: `modelo.datos =
   {total_devengado, total_soportado, cuota, signo, por_tipo}` — el asesor decide el
   encaje aunque no haya estructura declarada. El `signo` del anual:
   `> 0` → `'A_INGRESAR'`; `< 0` → `'A_COMPENSAR_O_DEVOLVER'`; `0` → `'NULA'`.
9. **Se declaran los periodos incluidos**: `modelo.periodos_incluidos` (los `periodo` de
   cada liquidación) y `num_liquidaciones`. `regimen`/`territorio` se copian de la
   primera liquidación o quedan `null`.
10. **El formato es declarable ([ABIERTO])**: `formato = input.formato ?? null`; se copia
    al modelo tal cual, sin validarlo contra ningún formato legal.
11. **El sistema NO presenta ni firma**: el modelo declara `presentado:false`,
    `firmado:false`, `preparado_para_asesor:true`. **No lo asume: lo declara.**
12. **Sin estado persistente**: sin `PosPersistencia`, sin `onProjectActivated`.
13. **HTTP exacto**: éxito `200` (con `construido` true o false); `project_id` ausente →
    `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `modelo-390.construir.response`.

### 1. `construir` — con periodos declarados y estructura declarada

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "regimen": "IVA",
  "periodos": ["2026-1T", "2026-2T", "2026-3T", "2026-4T"],
  "estructura": [
    { "casilla": "01", "campo": "total_devengado" },
    { "casilla": "28", "campo": "total_soportado" },
    { "casilla": "46", "campo": "cuota" },
    { "casilla": "21", "campo": "devengado.0.21", "etiqueta": "Base a tipo general (declarable)" }
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
  "construido": true,
  "origen_liquidaciones": "liquidacion-iva",
  "periodos_pedidos": ["2026-1T", "2026-2T", "2026-3T", "2026-4T"],
  "modelo": {
    "modelo": "390",
    "ejercicio": "2026",
    "regimen": "IVA",
    "territorio": "comun",
    "formato": "borrador-asesor",
    "periodos_incluidos": ["2026-1T", "2026-2T", "2026-3T", "2026-4T"],
    "num_liquidaciones": 4,
    "estructura_declarada": true,
    "casillas": [
      { "casilla": "01", "etiqueta": null, "valor": 840, "campo": "total_devengado" },
      { "casilla": "28", "etiqueta": null, "valor": 400, "campo": "total_soportado" },
      { "casilla": "46", "etiqueta": null, "valor": 440, "campo": "cuota" },
      { "casilla": "21", "etiqueta": "Base a tipo general (declarable)", "valor": 840, "campo": "devengado.0.21" }
    ],
    "datos": {
      "total_devengado": 840, "total_soportado": 400, "cuota": 440, "signo": "A_INGRESAR",
      "por_tipo": { "devengado": { "0.21": 840 }, "soportado": { "0.1": 400 } }
    },
    "presentado": false,
    "firmado": false,
    "preparado_para_asesor": true
  }
}
```

Sin `estructura` → `estructura_declarada:false`, `casillas:null` y el `datos` anualizado
(`por_tipo` incluido) intacto. Un `campo` cuyo tipo no esté en el anual → `valor:null`.

### 2. Sin liquidaciones ni periodos — no se construye

```json
{ "project_id": "e57a318a-...", "ejercicio": "2026" }
```

Sin `liquidaciones` ni `periodos`, o si `liquidacion-iva` no responde → `200` con:

```json
{ "modelo": null, "construido": false, "motivo": "no hay liquidaciones del ejercicio: el resumen anual no se construye con importes inventados" }
```

**No se inventan periodos ni importes.**

### 3. Fallo — falta `project_id`

```json
{ "ejercicio": "2026", "periodos": ["2026-1T"] }
```

Respuesta `400` + `modelo-390.construir.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/modelo-390.test.js`. Cubre:

- `construir` con `periodos` declarados y `estructura` declarada → `200 construido:true`,
  `casillas` rellenadas, anualizado por concepto y `presentado:false`/`firmado:false`.
- `liquidaciones` declaradas en la petición → `origen_liquidaciones:'declaradas_en_peticion'`.
- Sin `estructura` → `casillas:null`, `estructura_declarada:false` y el `datos` anualizado
  (**no se inventan casillas**).
- Sin `liquidaciones` ni `periodos` → `construido:false` con motivo (**no se construye
  con importes inventados**).
- Campo `devengado.<tipo>` con el tipo ausente → `valor:null` (no `0`).
- Signo del anual (`A_INGRESAR` / `A_COMPENSAR_O_DEVOLVER` / `NULA`) según la cuota.
- `construir` sin `project_id` → `400 INVALID_INPUT` + `modelo-390.construir.failed`.
- `toolConstruir` devuelve la misma proyección que `_construir`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `Modelo390 extends ModuloHibridoReflejo`; `name = 'modelo-390'`,
  `version = 'reflejo-0.1.0'`. **Sin store**: reflejo puro, sin `PosPersistencia`, sin
  `onProjectActivated`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-fiscal/modelo-390/`).
- `onConstruirRequest` usa `this._atender(e, 'construir', 'modelo-390.construir.response',
  async (d) => {...})` y dentro publica `modelo-390.construir.failed` si `status !== 200`.
- Proyección `_construir(input)` (`async`, porque pide una liquidación por periodo);
  helpers `_liquidaciones`, `_estructura`, `_valorDe`, `_num`. Tool `toolConstruir`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `liquidacion-iva.calcular.request` (D1) por evento, una por periodo declarado;
  lo LEE el asesor / el canal de borradores.
- **LA LEY COMO DATO**: la estructura, el formato y los periodos del ejercicio son
  **declarables**; el módulo **PREPARA** el resumen anual — **el sistema no presenta y no
  firma; el asesor presenta y firma**.
