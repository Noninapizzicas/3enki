---
name: informe-rico
description: >
  Skill FULL del módulo REFLEJO `informe-rico` de la vertical contabilidad de Enki (K3, hoja
  del plan). EL NÚCLEO DEL INFORME RICO: cifra YA calculada + contexto DECLARADO (periodo,
  origen, comparativa, cobertura, estado del periodo). No un número pelado — el requisito del
  dueño («información rica») materializado en su núcleo MECÁNICO. INVARIANTE DE COMPOSICIÓN:
  aquí SOLO se COMPONE (cifra + contexto); la NARRACIÓN y el «QUÉ HACER» viven en sus
  satélites (`informe-accionable`, R2/R3): el informe sale con `narracion:null` y
  `que_hacer:null` apuntando a ellos. LA MÉTRICA ÚNICA SIGUE SIENDO UNA: si muestra
  cobertura, LEE `completitud-cobertura` (A12) por EVENTO — no la recalcula
  (`es_metrica_unica:true`, `recalculada_aqui:false`). Lo que no responde SE DECLARA en
  `dependencias_no_disponibles` y jamás se rellena con contexto inventado (contrato
  TOLERANTE). Determinista, stateless. Úsala para operar, depurar o extender el reflejo, o
  para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites componer el informe rico de una cifra (RPC
    contabilidad.informe.componer.request): cifra + periodo/origen/comparativa/cobertura/estado.
  - Cuando depures por qué falta el contexto (se declara en `dependencias_no_disponibles`:
    'presupuesto', 'completitud-cobertura', 'cierre-ejercicio') o por qué falta la cifra (400
    INVALID_INPUT cifra).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el invariante de
    COMPOSICIÓN (composición ≠ juicio) y por qué la cobertura se LEE y no se recalcula.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo informe-rico.
tags: [enki, modulo, reflejo, contabilidad, informe-rico, composicion, metrica-unica]
---

# informe-rico — REFLEJO · el núcleo del informe rico (compone, no juzga)

## Qué hace el módulo

`informe-rico` es un **REFLEJO STATELESS** (K3, hoja del plan): **EL NÚCLEO DEL INFORME
RICO** — **cifra YA calculada + contexto DECLARADO** (periodo, origen, comparativas,
cobertura, estado del periodo). **No un número pelado**: el requisito del dueño
(*«información rica»*) materializado en su núcleo **MECÁNICO**.

**INVARIANTE DE COMPOSICIÓN**: este módulo **COMPONE** (cifra + contexto) y **JAMÁS mete
juicio dentro del reflejo**. La **NARRACIÓN** (*«esto es lo que te ha pasado»*) es del
satélite `informe-accionable` (**R3**) y el **«QUÉ HACER»** también (**R2**). El informe sale
con **`narracion:null`** y **`que_hacer:null`**, y apunta a sus satélites
(`narracion_en:'informe-accionable (R3)'`, `que_hacer_en:'informe-accionable (R2)'`). **Nada
de recomendaciones, nada de prosa generada.**

**LA MÉTRICA ÚNICA SIGUE SIENDO UNA**: si el informe muestra **cobertura**, **LEE**
`completitud-cobertura` (**A12**) por EVENTO `contabilidad.cobertura.calcular.request` — **no
la recalcula** (`cobertura.es_metrica_unica:true`, `recalculada_aqui:false`). La
**comparativa** la aporta `presupuesto` (J4/J9) por EVENTO
`contabilidad.periodos.comparar.request`; el **estado del periodo** lo aporta
`cierre-ejercicio` (**C4**) por EVENTO `contabilidad.cierre.estado.request`.

Todo el contexto puede venir **ya DECLARADO en el payload** (`periodo`/`origen`/
`comparativa`/`cobertura`/`estado_periodo`), y entonces **no se toca la dependencia**.

**DETERMINISTA**: *misma cifra + mismo contexto → mismo informe* (un test lo afirma). Es
**stateless**: sin PosPersistencia ni `project.activated`. Dependencia entre módulos **por
EVENTO, nunca por `require` cruzado**. Contrato **TOLERANTE**: lo que no responde **SE
DECLARA** (`dependencias_no_disponibles`) y **jamás se rellena con un contexto inventado**.

> **NO REUTILIZA**: el núcleo de informe rico se sirve en idiomas distintos (dueño Q2 /
> cliente R3); no existe en el inventario.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.informe.componer.request` | `onComponerRequest` | RPC reflejo (K3): {project_id, cifra:{valor\|total\|resultado\|margen, etiqueta?, unidad?}, periodo?, origen?, comparativa?, cobertura?, estado_periodo?, tipo_comparacion?, con_comparativa?, con_cobertura?, con_estado?} → {project_id, informe:{cifra:{valor,etiqueta,unidad,detalle}, contexto:{periodo, origen, comparativa:{tipo,a,b,delta,delta_pct}, cobertura:{tasa,esperados,recibidos,huecos,senal,es_metrica_unica:true,recalculada_aqui:false}, estado_periodo:{estado,detalle}}, compuesto:true, composicion_mecanica:true, narracion:null, que_hacer:null, narracion_en:'informe-accionable (R3)', que_hacer_en:'informe-accionable (R2)'}, numero_pelado:false, dependencias_no_disponibles}. COMPONE cifra + contexto por EVENTO (comparativa de J4/J9, cobertura de A12 — LA METRICA UNICA, jamás recalculada aquí —, estado de C4); lo declarado en el payload no toca la dependencia. No narra ni recomienda (eso es del satelite). Exito publica contabilidad.informe_compuesto y responde por contabilidad.informe.componer.response; error → contabilidad.informe.componer.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.informe_compuesto` | Fire-and-forget (K3): el nucleo de informe rico quedo COMPUESTO (cifra + contexto mecanico) → {project_id, informe:{cifra, contexto:{periodo, origen, comparativa, cobertura, estado_periodo}, compuesto:true, narracion:null, que_hacer:null}, numero_pelado:false, dependencias_no_disponibles}. Lo consumen el traductor del dueno (Q2), el informe accionable (R2/R3) y la cara de consulta/entrega. Determinista; composicion sin juicio. |
| `contabilidad.informe.componer.failed` | Par de fallo determinista: componer sin project_id o sin cifra (400). Cierra el circulo de contabilidad.informe.componer.request. (La ausencia de una dependencia de contexto no es fallo: se declara en dependencias_no_disponibles y ese contexto sale null.) |
| `contabilidad.informe_compuesto.failed` | Par de fallo del evento de dominio contabilidad.informe_compuesto: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.informe.componer.failed` cierra `contabilidad.informe.componer.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.informe.componer.response` (el par response del RPC); **NO está declarada en
> `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el par
> de fallo real es `<op>.failed`) — `contabilidad.informe_compuesto.failed` es el par de
> fallo del evento de DOMINIO; el reflejo solo publica el par `*.failed` de su RPC.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.periodos.comparar.request` (presupuesto J4/J9),
> `contabilidad.cobertura.calcular.request` (completitud-cobertura A12 — la métrica única) y
> `contabilidad.cierre.estado.request` (cierre-ejercicio C4): dependencias por EVENTO no
> declaradas como publishers.

## Reglas de negocio

1. **COMPONE, NO JUZGA (invariante de composición)**: la respuesta del informe lleva
   `compuesto:true`, `composicion_mecanica:true`, **`narracion:null`**, **`que_hacer:null`**,
   `narracion_en:'informe-accionable (R3)'` y `que_hacer_en:'informe-accionable (R2)'`. La
   `nota` lo dice: *«COMPONE cifra + contexto (mecanico); el juicio (narracion y que-hacer)
   vive en el satelite informe-accionable»*.
2. **La CIFRA se LEE, no se recalcula**: `_valorDeCifra(cifra)` toma, por orden, `cifra.valor`
   → `cifra.total` → `cifra.resultado` → `cifra.margen.margen` (si `margen` es objeto) →
   `cifra.margen`; si nada, `null`. La etiqueta es `cifra.etiqueta ?? cifra.concepto ??
   cifra.tipo`, la unidad `cifra.unidad ?? cifra.moneda ?? 'EUR'`; el objeto crudo va en
   `cifra.detalle`.
3. **`numero_pelado:false`**: toda respuesta lo declara — el informe **nunca** es un número
   suelto. `CAMPOS_CONTEXTO = ['periodo', 'origen', 'comparativa', 'cobertura',
   'estado_periodo']` son los campos **declarables**, y viajan en
   `contexto.campos_declarables`.
4. **CONTEXTO por EVENTO (con banderas de control)**:
   - **comparativa** → si no viene en payload y `con_comparativa !== false`, `_rpc` a
     `contabilidad.periodos.comparar.request` (tipo `input.tipo_comparacion ??
     'REAL_VS_PRESUPUESTO'`, `periodo`); si falla → `dependencias_no_disponibles.push('presupuesto')`.
   - **cobertura (LA MÉTRICA ÚNICA)** → si no viene en payload y `con_cobertura !== false`,
     `_rpc` a `contabilidad.cobertura.calcular.request`; si falla → push
     `'completitud-cobertura'`.
   - **estado del periodo** → **solo si `con_estado === true`** (bandera **opt-in**,
     default off) y no viene en payload, `_rpc` a `contabilidad.cierre.estado.request`; si
     falla → push `'cierre-ejercicio'`.
5. **LA COBERTURA ES LA MÉTRICA ÚNICA**: cuando hay cobertura, el informe la muestra como
   `{tasa, esperados, recibidos, huecos, senal, es_metrica_unica:true, recalculada_aqui:false}`.
   **No se recalcula aquí**: se LEE de A12. Cualquier módulo que muestre cobertura (este,
   `consulta-dueno` Q3, `informe-accionable` R2) **lee la misma métrica**.
6. **El periodo**: `input.periodo ?? cifra.periodo ?? null` (el payload manda; la cifra como
   respaldo).
7. **Contrato TOLERANTE**: una dependencia de contexto que no responde **no es fallo**: su
   hueco se declara en `dependencias_no_disponibles` y ese campo sale `null`. **Jamás se
   rellena con un contexto inventado.** Solo faltar `project_id` o `cifra` es `400`.
8. **DETERMINISMO**: misma cifra + mismo contexto → mismo informe, bit a bit; la respuesta
   lleva `determinista:true` y un test unitario lo afirma.
9. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
   `cifra` ausente o no objeto → `400 INVALID_INPUT cifra`. Shape: `{ status:400, error:{
   code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
10. **HTTP exacto**: éxito `200` (también con contexto ausente declarado); payload inválido →
    `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC que responde en `contabilidad.informe.componer.response`.

### 1. `componer` — cifra + contexto por EVENTO

```json
{
  "project_id": "e57a318a-...",
  "cifra": { "valor": 26800, "etiqueta": "resultado del periodo", "unidad": "EUR", "desviacion": { "desviacion": 1800, "excede": true, "umbral": 1500 } },
  "periodo": "2026-09",
  "origen": "consulta-dueno (Q1)",
  "correlation_id": "abc-123"
}
```

Respuesta `200` (recortada):

```json
{
  "project_id": "e57a318a-...",
  "informe": {
    "cifra": { "valor": 26800, "etiqueta": "resultado del periodo", "unidad": "EUR", "detalle": { "...": "la cifra tal cual llego" } },
    "contexto": {
      "periodo": "2026-09",
      "origen": "consulta-dueno (Q1)",
      "comparativa": { "tipo": "REAL_VS_PRESUPUESTO", "a": 26800, "b": 25000, "delta": 1800, "delta_pct": 0.072 },
      "cobertura": { "tasa": 1, "esperados": 120, "recibidos": 120, "huecos": 0, "senal": "COMPLETA", "es_metrica_unica": true, "recalculada_aqui": false },
      "estado_periodo": null,
      "campos_declarables": ["periodo", "origen", "comparativa", "cobertura", "estado_periodo"]
    },
    "compuesto": true,
    "composicion_mecanica": true,
    "narracion": null,
    "que_hacer": null,
    "narracion_en": "informe-accionable (R3)",
    "que_hacer_en": "informe-accionable (R2)",
    "determinista": true
  },
  "numero_pelado": false,
  "dependencias_no_disponibles": [],
  "nota": "COMPONE cifra + contexto (mecanico); el juicio (narracion y que-hacer) vive en el satelite informe-accionable"
}
```

Emite `contabilidad.informe_compuesto` (res.data + `correlation_id`).

### 2. `componer` — contexto ya declarado (no toca dependencias)

```json
{
  "project_id": "e57a318a-...",
  "cifra": { "total": 12450.5, "etiqueta": "caja", "unidad": "EUR" },
  "periodo": "2026-09",
  "comparativa": { "tipo": "MES_VS_MES", "a": 12450.5, "b": 11000, "delta": 1450.5, "delta_pct": 0.1319 },
  "cobertura": { "tasa": 1, "huecos": 0, "senal": "COMPLETA" },
  "con_comparativa": false,
  "con_cobertura": false
}
```

→ `200` con `dependencias_no_disponibles:[]` y **cero** `_rpc`.

### 3. `componer` — estado del periodo (opt-in con `con_estado:true`)

```json
{ "project_id": "e57a318a-...", "cifra": { "valor": 26800 }, "periodo": "2026-09", "con_estado": true }
```

→ el `_rpc` a `contabilidad.cierre.estado.request` (C4) alimenta
`contexto.estado_periodo.estado` vía `_estadoDe` (`ultimo_nivel2`/`cierre_del_periodo`/
`cierre` → su `estado`; o `n_cierres > 0 ? 'CON_CIERRES' : 'ABIERTO'`; o `estado ?? 'ABIERTO'`).

### 4. Fallo — contexto ausente (NO es fallo del informe) → 200 con dependencia declarada

Con A12 y J4/J9 mudos y ninguna cobertura/comparativa en payload:

```json
{ "status": 200, "data": { "informe": { "contexto": { "comparativa": null, "cobertura": null }, "...": "..." }, "dependencias_no_disponibles": ["presupuesto", "completitud-cobertura"] } }
```

### 5. Fallo — payload inválido

```json
{ "project_id": "e57a318a-..." }
```

(sin `cifra`) → Respuesta `400` + `contabilidad.informe.componer.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "cifra requerido", "details": { "field": "cifra" } } }
```

### 6. Tools (sin RPC en module.json)

`toolComponer` → `_componer`.

## Tests

El test vive en `tests/unit/informe-rico.test.js`. Cubre:

- `componer` con cifra + contexto en payload → `200`, `informe.compuesto:true`,
  `composicion_mecanica:true`, **`narracion:null`**, **`que_hacer:null`**,
  `numero_pelado:false`; emite `contabilidad.informe_compuesto`.
- **LA MÉTRICA ÚNICA**: con cobertura leída de A12, `cobertura.es_metrica_unica:true` y
  `recalculada_aqui:false` (no se recalcula aquí).
- **Payload manda**: con `comparativa`/`cobertura` en payload y `con_comparativa:false`/
  `con_cobertura:false` → **cero** `_rpc`.
- Contexto por EVENTO: sin comparativa/cobertura en payload → `_rpc` a J4/J9 y a A12; con
  `con_estado:true` → `_rpc` a C4.
- **Tolerante**: A12/J4 mudos → su hueco en `dependencias_no_disponibles` (`'presupuesto'`,
  `'completitud-cobertura'`), la respuesta **sigue** siendo `200` y el contexto sale `null`.
- **Determinismo**: la MISMA cifra + contexto devuelve EXACTAMENTE el MISMO informe.
- Sin `project_id`/`cifra` → `400 INVALID_INPUT` + `contabilidad.informe.componer.failed`.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/informe-rico
node --test tests/unit/informe-rico.test.js
```

## Notas de implementación

- Clase `InformeRico extends ModuloHibridoReflejo`; `name = 'informe-rico'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (reflejo stateless: nada que persistir).
- Constante: `CAMPOS_CONTEXTO = ['periodo', 'origen', 'comparativa', 'cobertura',
  'estado_periodo']`.
- El único handler `onComponerRequest` delega en `_atender(e, 'componer',
  'contabilidad.informe.componer.response', fn)`; publica el evento de dominio si
  `status === 200` y el par `*.failed` si no.
- Proyección pura: `_componer` (async, hasta tres `_rpc` según banderas) + helpers
  `_valorDeCifra`, `_estadoDe`. `_rpc`/`_invalid`/`_errorResponse`/`_round` vienen de la base.
- Tools: `toolComponer`.
- DEP hacia delante: `contabilidad.informe_compuesto` lo consumen `puente-lenguaje-dueno`
  (Q2), `informe-accionable` (R2/R3) y la cara de consulta/entrega (`consulta-dueno`, Q1, con
  `con_informe:true`). DEP hacia atrás por EVENTO: `presupuesto` (J4/J9, comparativa),
  `completitud-cobertura` (A12 — la métrica única) y `cierre-ejercicio` (C4, estado).
