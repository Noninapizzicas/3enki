---
name: informe-rico
description: >
  Skill FULL del módulo REFLEJO `informe-rico` de la vertical contabilidad de Enki.
  COMPONE cifra + contexto: toma una CIFRA ya calculada y la viste con el CONTEXTO
  DECLARADO (periodo, fechas, unidad, moneda, origen, comparativa, dimensión, sociedad,
  notas). Aquí SOLO la composición — la narración y el «qué hacer» son de sus satélites
  (informe-accionable K14, narrador-estados K15, puente-lenguaje-dueno). Determinista y sin
  estado. Úsala para operar, depurar o extender el reflejo, o para entender su contrato de
  eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites componer el informe de una cifra ya calculada (RPC
    informe-rico.componer.request).
  - Cuando depures por qué `emitido:false` (falta la cifra y su fuente no respondió, o falta
    el periodo), o por qué `narracion`/`que_hacer` salen null (delegan en sus satélites).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del reflejo (compone, no narra; dato ausente = desconocido; determinista).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo informe-rico.
tags: [enki, modulo, reflejo, contabilidad, informe-rico]
---

# informe-rico — REFLEJO STATELESS de la composición cifra + contexto

## Qué hace el módulo

`informe-rico` es un **REFLEJO STATELESS** (K3, hoja del plan): **COMPONE cifra + contexto**.
Toma una **CIFRA ya calculada** por otra pieza y la viste con el **CONTEXTO DECLARADO**: el
periodo, las fechas, la unidad, la moneda, el origen, la comparativa, la dimensión, la
sociedad y las notas. **Mecánico y determinista.**

**AQUÍ SOLO LA COMPOSICIÓN.** La **narración** fuzzy (escribir el párrafo que lo explica), el
**«qué hacer»** y el lenguaje del dueño **NO viven aquí**: son satélites posteriores
(`informe-accionable` K14, `narrador-estados` K15, `puente-lenguaje-dueno`, oleada 14). Este
reflejo **NO interpreta, NO recomienda y NO decide** — ordena lo que ya le dan.

Invariantes:

- **DETERMINISTA**: misma cifra + mismo contexto → mismo informe (una sola respuesta
  correcta).
- **Dato ausente = desconocido**: sin cifra **NO se compone un informe con un 0**; se declara
  `emitido:false` con lo que falta (`faltan`). La cifra **NO se recalcula aquí**: se recibe
  declarada (objeto o escalar) o se **PIDE** a su fuente **POR EVENTO**
  (`informe-conciliacion` E10, best-effort).
- **LEY/PARÁMETRO COMO DATO**: periodo, unidad, comparativa y notas son **declarables**; cero
  plantillas de informe cableadas.
- **NO escribe, NO persiste, NO muta**: el informe es un **DERIVADO en memoria**.
- **Sin `PosPersistencia` y sin `project.activated`**: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `informe-rico.componer.request` | `onComponerRequest` | RPC reflejo (composicion pura, determinista): {project_id, cifra?\|informe?, periodo?, fecha_desde?, fecha_hasta?, unidad?, moneda?, origen?, comparativa?, dimension?, sociedad?, notas?, cuenta?} → {project_id, tipo:'informe-rico', emitido, informe:{cifra, contexto, narracion:null, narracion_por, que_hacer:null} \| null, cifra, fuente_cifra, cifra_disponible, contexto, compone:['cifra','contexto'], delega_a:{narracion, que_hacer}, faltan, abierto:{cifra, periodo, narracion, que_hacer}}. La cifra se recibe declarada (objeto o escalar) o se PIDE a informe-conciliacion (E10) POR EVENTO; NO se recalcula aqui. Sin cifra NO se compone un informe con un 0 (emitido:false y faltan). Responde por informe-rico.componer.response; project_id ausente → informe-rico.componer.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `informe-rico.componer.response` | Respuesta RPC correlada de informe-rico.componer.request → {request_id, status:200, data:{emitido, informe, cifra, fuente_cifra, cifra_disponible, contexto, compone, delega_a, faltan, abierto}}. Emitida por el helper _atender. |
| `informe-rico.componer.failed` | Par de fallo determinista (K3): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de informe-rico.componer.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `informe-rico.componer.failed` cierra el círculo de
> `informe-rico.componer.request` cuando `_componer` devuelve status ≠ 200 (`400`,
> `project_id` ausente). No hay ningún fire-and-forget: este reflejo solo tiene un RPC.

## Reglas de negocio

1. **La CIFRA se recibe declarada, NUNCA se recalcula**: `_cifra` la toma de tres fuentes en
   orden: (a) `input.cifra` **objeto** → `{fuente:'declarado', disponible:true}`; (b)
   `input.cifra` **escalar** → se viste `{valor, valor_declarado}` (con `disponible` según si
   `_numero` lo acepta); (c) **sin cifra declarada** → se **PIDE POR EVENTO** a
   `informe-conciliacion.componer.request` (`{project_id, periodo, cuenta}`,
   `timeout_ms:4000`); solo cuenta si `data.emitido === true`.
2. **Sin cifra no hay informe con un 0**: si nada la aporta → `disponible:false`,
   `informe:null`, `emitido:false`, `faltan:['cifra']`.
3. **El CONTEXTO es todo dato DECLARADO**: `{periodo, fecha_desde, fecha_hasta, unidad,
   moneda, origen, comparativa, dimension, sociedad, notas}`. `origen` cae a la `fuente` que
   respondió si no se declara; `comparativa` se conserva tal cual (cualquier tipo);
   `notas` siempre array de strings (`[]` por defecto). **Nada se deduce de la cifra.**
4. **El periodo también falta si no se declara**: `contexto.periodo === null` →
   `faltan` incluye `'periodo'` **aunque** la cifra esté disponible.
5. **La composición es MECÁNICA**: el `informe` sale con `narracion:null` y `que_hacer:null`,
   `narracion_por:'satelites (informe-accionable, narrador-estados,
   puente-lenguaje-dueno)'` y `compuesto_en` (ISO). **Ni una palabra de narración.**
6. **Delega explícitamente**: `delega_a.narracion = 'narrador-estados (K15) /
   puente-lenguaje-dueno (oleada 14)'`; `delega_a.que_hacer = 'informe-accionable (K14)'`.
7. **`compone` declara el contrato**: `['cifra', 'contexto']` — **solo** esos dos elementos.
8. **`abierto`: qué falta se declara**: `cifra` (no llega y su fuente no respondió — **NO se
   compone un informe con un 0**), `periodo` (no declarado), y siempre la nota de que
   `narracion` y `que_hacer` **NO viven aquí** (los componen los satélites fuzzy).
9. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
10. **Puro**: no escribe, no persiste, no muta, sin reloj salvo el sello `compuesto_en`, sin
    azar.
11. **HTTP exacto**: éxito `200` (con `emitido` true **o** false); `project_id` ausente →
    `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `informe-rico.componer.response`. **No emite evento de dominio.**

### 1. `componer` — cifra declarada (objeto) + contexto

```json
{
  "project_id": "e57a318a-...",
  "cifra": { "valor": 1210.5, "moneda": "EUR" },
  "periodo": "2026-09",
  "fecha_desde": "2026-09-01",
  "fecha_hasta": "2026-09-30",
  "unidad": "EUR",
  "origen": "informe-conciliacion",
  "comparativa": { "periodo": "2026-08", "valor": 1100.0 },
  "notas": ["cierre provisional"],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "tipo": "informe-rico",
  "emitido": true,
  "informe": {
    "cifra": { "valor": 1210.5, "moneda": "EUR" },
    "contexto": { "periodo": "2026-09", "fecha_desde": "2026-09-01", "fecha_hasta": "2026-09-30", "unidad": "EUR", "moneda": null, "origen": "informe-conciliacion", "comparativa": { "periodo": "2026-08", "valor": 1100.0 }, "dimension": null, "sociedad": null, "notas": ["cierre provisional"] },
    "narracion": null,
    "narracion_por": "satelites (informe-accionable, narrador-estados, puente-lenguaje-dueno)",
    "que_hacer": null,
    "compuesto_en": "2026-09-30T...:00.000Z"
  },
  "cifra": { "valor": 1210.5, "moneda": "EUR" },
  "fuente_cifra": "informe-conciliacion",
  "cifra_disponible": true,
  "contexto": { "...": "..." },
  "compone": ["cifra", "contexto"],
  "delega_a": {
    "narracion": "narrador-estados (K15) / puente-lenguaje-dueno (oleada 14)",
    "que_hacer": "informe-accionable (K14)"
  },
  "faltan": [],
  "abierto": {
    "cifra": null,
    "periodo": null,
    "narracion": "la narracion NO vive aqui: la componen los satelites fuzzy (K14/K15)",
    "que_hacer": "el \"que hacer\" NO vive aqui: lo compone informe-accionable (K14)"
  }
}
```

### 2. `componer` — cifra escalar declarada

```json
{ "project_id": "e57a318a-...", "cifra": 350.25, "periodo": "2026-09" }
```

Respuesta `200`: la cifra se viste `{valor:350.25, valor_declarado:true}`, `disponible:true`.
Un escalar no numérico (p. ej. `"abc"`) → `valor:null`, `valor_declarado:false`,
`disponible:false` → `emitido:false`, `faltan:['cifra']`.

### 3. `componer` — sin cifra y la fuente (E10) no responde

```json
{ "project_id": "e57a318a-...", "periodo": "2026-09" }
```

Respuesta `200`: `emitido:false`, `informe:null`, `cifra:null`, `cifra_disponible:false`,
`faltan:['cifra']`, **no** se compone un informe con un 0.

### 4. Fallo — falta `project_id`

```json
{ "cifra": { "valor": 10 } }
```

Respuesta `400` + `informe-rico.componer.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/informe-rico.test.js`. Cubre:

- `componer` con cifra objeto + contexto → `200 emitido:true`, `informe` con `narracion:null`
  y `que_hacer:null`, `compone:['cifra','contexto']`, `delega_a` declarado.
- Cifra **escalar** → se viste `{valor, valor_declarado}`; no numérica → `disponible:false`.
- **Sin cifra y fuente (E10) sin responder** → `emitido:false`, `informe:null`,
  `faltan:['cifra']` (**no se compone un informe con un 0**).
- Cifra pedida **por evento** a `informe-conciliacion` (E10): con `emitido:true` →
  `cifra_disponible:true`, `fuente_cifra:'informe-conciliacion'`.
- Falta el `periodo` → `faltan` incluye `'periodo'` **aunque** haya cifra.
- **Determinismo**: misma cifra + mismo contexto → mismo informe.
- `project_id` ausente → `400 INVALID_INPUT` + `informe-rico.componer.failed`.
- `toolComponer` devuelve la misma proyección que `_componer`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `InformeRico extends ModuloHibridoReflejo`; `name = 'informe-rico'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/informe-rico/`; es de la vertical **analítica**).
- `onComponerRequest` usa `this._atender(e, 'componer', 'informe-rico.componer.response',
  async (d) => {...})` y publica el par `failed` si `status !== 200`. Es el **único** canal
  del módulo (no hay fire-and-forget).
- Proyección `_componer(input)` (`async`: puede pedir la cifra por evento) → `{status, data}`;
  helpers `_cifra`, `_numero`. Tool `toolComponer`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide la cifra a `informe-conciliacion.componer.request` (E10) **por evento**
  (best-effort); sus satélites (`informe-accionable` K14, `narrador-estados` K15,
  `puente-lenguaje-dueno`) consumen esta composición para narrarla.
- **PARÁMETRO COMO DATO**: periodo, unidad, comparativa y notas son declarables; cero
  plantillas cableadas.
- **COMPONE, NO NARRA, NO DECIDE**: `narracion` y `que_hacer` salen `null` **a propósito**.
