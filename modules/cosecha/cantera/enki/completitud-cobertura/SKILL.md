---
name: completitud-cobertura
description: >
  Skill FULL del módulo REFLEJO `completitud-cobertura` de la vertical contabilidad de
  Enki (A12, hoja del plan). EL ÚNICO CALCULADOR DE COBERTURA (conflicto 2 resuelto):
  esperados / recibidos / huecos / tasa. Mide qué llegó y qué NO llegó a la entrada.
  Q3 (sello de cobertura), P4 (tasa del proceso) y C6 (aviso al cierre) son VISTAS de
  ESTA métrica única; NUNCA la recalculan. Si no había nada esperado la tasa es 0 y no
  se finge un cuadre (SIN_ACTIVIDAD). Sin estado. Úsala para operar, depurar o extender
  el reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites LA métrica de cobertura de un proyecto/periodo
    (RPC contabilidad.cobertura.calcular.request) o solo los huecos
    (toolHuecos/_huecos).
  - Cuando llegue un anclaje de cierre por evento (contabilidad.anclaje_declarado de
    anclaje-cierre-vertical A14 → ESPERADO) o un hecho admitido
    (contabilidad.hecho_admitido de puerto-evento-vertical A1 → RECIBIDO).
  - Cuando depures por qué una cobertura sale SIN_ACTIVIDAD, HUECOS o COMPLETA, o por
    qué calcular sin project_id devuelve 400.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la decisión
    "una sola métrica" y por qué Q3/P4/C6 la LEEN y no la recalculan.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo completitud-cobertura.
tags: [enki, modulo, reflejo, contabilidad, completitud-cobertura, cobertura, metrica-unica]
---

# completitud-cobertura — REFLEJO de la métrica única de cobertura

## Qué hace el módulo

`completitud-cobertura` es un **REFLEJO STATELESS** (A12, hoja del plan): **EL ÚNICO
CALCULADOR DE COBERTURA** (conflicto 2 resuelto). Calcula **esperados / recibidos /
huecos / tasa**: **qué llegó y qué NO llegó a la entrada**.

Es **LA MÉTRICA ÚNICA por decisión del dueño**: **Q3** (sello de cobertura), **P4**
(tasa del proceso) y **C6** (aviso al cierre) son **VISTAS de ESTA métrica** —
**NUNCA la recalculan**; todas la **LEEN** de este único resultado. El campo
`es_metrica_unica:true` y la nota `'Q3, P4 y C6 son VISTAS de esta metrica unica; no
la recalculan'` lo dejan escrito.

El cálculo es **determinista** (mismas entradas → misma cobertura). **Si no había
nada esperado la tasa es `0` y el sistema NO finge un cuadre**: dice **`SIN_ACTIVIDAD`**;
si esperaba hechos y faltan → **`HUECOS`**; si todo llegó → **`COMPLETA`**.

Es **stateless**: sin PosPersistencia ni `project.activated` — los conjuntos de
esperados/recibidos viven **en memoria del propio reflejo**, alimentados **por
EVENTO** (`contabilidad.anclaje_declarado` de `anclaje-cierre-vertical` → ESPERADO;
`contabilidad.hecho_admitido` de `puerto-evento-vertical` → RECIBIDO), **nunca por
`require` cruzado**. La dependencia con `clave-natural` (M3) es por EVENTO cuando hay
que derivar la clave de un hecho que no la trae (contrato TOLERANTE). Emite
`contabilidad.cobertura_calculada` en éxito y su par determinista en fallo.

## Contrato de eventos (module.json real)

### Subscribes (RPC request/response + fire-and-forget)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.cobertura.calcular.request` | `onCalcularRequest` | RPC reflejo: {project_id, periodo?, esperados?, recibidos?} → {project_id, periodo, esperados, recibidos, huecos, tasa, detalle, senal:'COMPLETA'\|'HUECOS'\|'SIN_ACTIVIDAD'}. LA metrica unica de cobertura (A12), determinista. tasa = recibidos/esperados (0 si no habia nada esperado: sin actividad, no se finge cuadre). Publica contabilidad.cobertura_calculada y responde por contabilidad.cobertura.calcular.response; si falta project_id → contabilidad.cobertura.calcular.failed. |
| `contabilidad.anclaje_declarado` | `onAnclajeDeclarado` | Fire-and-forget (A14 → A12): anclaje-cierre-vertical declaro la unidad de cierre de una fuente → {project_id, vertical, definicion}. Esa fuente pasa a ser ESPERADA en la metrica de cobertura (dependencia por EVENTO, sin require cruzado). |
| `contabilidad.hecho_admitido` | `onHechoAdmitido` | Fire-and-forget (A1 → A12): puerto-evento-vertical admitio un hecho → {project_id, vertical, hecho, clave_natural}. Queda RECIBIDO en la metrica de cobertura. La clave del hecho se toma del payload (o se deriva del documento); la dependencia con clave-natural (M3) es por EVENTO. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.cobertura_calculada` | Fire-and-forget (A12): la cobertura de un periodo quedo calculada → {project_id, periodo, esperados, recibidos, huecos, tasa, detalle, senal}. LA metrica unica: lo consumen declaracion-fuente-faltante (A15) y aviso-cuadre (C6); Q3 y P4 son vistas suyas. |
| `contabilidad.cobertura.calcular.failed` | Par de fallo determinista: calcular sin project_id. Cierra el circulo de contabilidad.cobertura.calcular.request. |
| `contabilidad.cobertura_calculada.failed` | Par de fallo del evento de dominio contabilidad.cobertura_calculada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.cobertura.calcular.failed` cierra el círculo de
> `contabilidad.cobertura.calcular.request`.

> Nota: no está en module.json pero sí lo emite index.js — `onCalcularRequest`
> publica `contabilidad.cobertura_calculada` (éxito) /
> `contabilidad.cobertura.calcular.failed` (fallo) dentro del handler.

> Nota: `contabilidad.cobertura.calcular.response` la emite `_atender` y **NO está
> declarada en `publishes`**.

> Nota: **`contabilidad.cobertura_calculada.failed` está declarada en `publishes`
> pero no se emite en `index.js`** — el reflejo solo publica el par de fallo del RPC.

> Nota: **`_huecos` (tools `toolHuecos`) es una proyección + Tool pero NO tiene evento
> RPC en `module.json`**: se invoca como tool o desde el sitio de despliegue (alimenta
> A15, C6, Q3, P4 **leyendo** la métrica, sin recalcularla).

> Nota: los handlers `onAnclajeDeclarado` y `onHechoAdmitido` **devuelven una respuesta
> interna** (`{status:200, data:{...}}`) pero **NO publican ningún evento propio** —
> solo alimentan los conjuntos ESPERADO/RECIBIDO en memoria; sin `project_id` o sin
> vertical retornan `null`.

## Reglas de negocio

1. **UNA sola métrica de cobertura (conflicto 2 resuelto)**: este módulo es **el
   único** que calcula `esperados/recibidos/huecos/tasa`. **Q3, P4 y C6 son VISTAS**:
   la LEEN, **nunca la recalculan**. Toda pieza que necesite cobertura consulta aquí.
2. **Tasa determinista**: `tasa = nRecibidos / nEsperados`, con tope `Math.min(..., 1)`
   y redondeo a 4 decimales (`_round`). **Si `nEsperados === 0` → `tasa = 0`** y la
   señal es **`SIN_ACTIVIDAD`**: **no se finge un cuadre**.
3. **Tres señales**: `senal = 'SIN_ACTIVIDAD'` (nada esperado) · `'HUECOS'` (hay
   `huecos > 0`) · `'COMPLETA'` (todo llegó). Nunca se inventa un cuarto estado.
4. **Los huecos son `esperados − recibidos`**: `huecos = esperados.filter(c =>
   !recibidosSet.has(c))`. El `detalle` expone los tres conjuntos completos
   (`{esperados, recibidos, huecos}`), no solo los conteos.
5. **ESPERADO se alimenta por anclaje; RECIBIDO por admisión**: `onAnclajeDeclarado`
   añade una clave de cierre (`"<pid>:<vertical>:<unidad>"`) al set ESPERADO y registra
   la vertical en `_verticales` (fuentes que declaran cierre). `onHechoAdmitido` añade
   una clave de hecho al set RECIBIDO (`clave_natural` del payload, o derivada de
   `documento_origen`/`documento`, o `<pid>:<vertical>:<timestamp>` si nada).
6. **La entrada puede ampliar los conjuntos**: `_calcular` acepta `esperados` y
   `recibidos` explícitos en el payload y los **suma** a los conjuntos en memoria
   (por si el cálculo los trae ya resueltos o ampliados).
7. **`_huecos` LEE, no recalcula**: `_huecos` invoca `_calcular` y devuelve solo
   `{huecos, n_huecos, tasa, senal}` — es una **vista** de la métrica única.
8. **Dependencia por EVENTO con clave-natural (M3)**: cuando un hecho admitido no trae
   clave, se deriva del documento; no hay `require` cruzado. Contrato TOLERANTE: si no
   se puede resolver, no se asienta basura.
9. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`
   (única validación del cálculo). Shape: `{ status:400, error:{ code:'INVALID_INPUT',
   message:'project_id requerido', details:{ field:'project_id' } } }`.
10. **HTTP exacto**: éxito `200`; sin `project_id` → `400`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`. **Nunca** se devuelve un "cuadre" inventado.

## Cómo se usa (RPCs)

El RPC responde en `contabilidad.cobertura.calcular.response`.

### 1. `calcular` — LA métrica única de cobertura

```json
{ "project_id": "e57a318a-...", "periodo": "2026-09", "correlation_id": "abc-123" }
```
Respuesta `200` (había 3 esperados, 2 recibidos):
```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "esperados": 3,
  "recibidos": 2,
  "huecos": 1,
  "tasa": 0.6667,
  "detalle": { "esperados": ["e57a318a-...:COMPRA:FAC-1", "e57a318a-...:VENTA:FAC-2", "e57a318a-...:COBRO:FAC-3"], "recibidos": ["e57a318a-...:COMPRA:FAC-1", "e57a318a-...:VENTA:FAC-2"], "huecos": ["e57a318a-...:COBRO:FAC-3"] },
  "verticales_esperadas": ["COMPRA", "VENTA", "COBRO"],
  "sin_actividad": false,
  "senal": "HUECOS",
  "es_metrica_unica": true,
  "nota": "Q3, P4 y C6 son VISTAS de esta metrica unica; no la recalculan"
}
```
Emite `contabilidad.cobertura_calculada` (res.data + `correlation_id`).

### 2. `calcular` sin nada esperado → SIN_ACTIVIDAD (no se finge cuadre)

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "periodo": null, "esperados": 0, "recibidos": 0, "huecos": 0, "tasa": 0, "detalle": { "esperados": [], "recibidos": [], "huecos": [] }, "verticales_esperadas": [], "sin_actividad": true, "senal": "SIN_ACTIVIDAD", "es_metrica_unica": true, "nota": "Q3, P4 y C6 son VISTAS de esta metrica unica; no la recalculan" }
```

### 3. Entrada por evento — alimentar ESPERADO y RECIBIDO

`contabilidad.anclaje_declarado` (de A14): `{project_id, vertical:'COMPRA',
definicion:{unidad_cierre:'2026-09'}}` → añade `"<pid>:COMPRA:2026-09"` al set
ESPERADO y registra la vertical COMPRA.
`contabilidad.hecho_admitido` (de A1): `{project_id, vertical:'COMPRA',
hecho:{documento_origen:'FAC-1'}, clave_natural:'...'}` → añade la clave al set
RECIBIDO. Sin `project_id`/`vertical` → el handler retorna `null` sin alimentar.

### 4. Fallo — sin project_id

```json
{ "correlation_id": "abc-124" }
```
Respuesta `400` + `contabilidad.cobertura.calcular.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test vive en `tests/unit/completitud-cobertura.test.js`. Cubre:

- Alimentar ESPERADO con `contabilidad.anclaje_declarado` y RECIBIDO con
  `contabilidad.hecho_admitido`, luego `calcular` → conteos, `huecos`, `tasa` y
  `senal:'HUECOS'`; emite `contabilidad.cobertura_calculada`.
- **Determinismo**: dos `calcular` con el mismo estado → mismo resultado.
- Sin nada esperado → `tasa:0`, `senal:'SIN_ACTIVIDAD'`, `sin_actividad:true` (no se
  finge cuadre).
- Todo recibido → `senal:'COMPLETA'`, `huecos:0`.
- `calcular` con `esperados`/`recibidos` explícitos amplía los conjuntos.
- `_huecos`/`toolHuecos` devuelve la vista (`huecos`, `n_huecos`, `tasa`, `senal`)
  **sin recalcular**.
- `calcular` sin `project_id` → `400 INVALID_INPUT` + par de fallo.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/completitud-cobertura
node --test tests/unit/completitud-cobertura.test.js
```

## Notas de implementación

- Clase `CompletitudCobertura extends ModuloHibridoReflejo`; `name =
  'completitud-cobertura'`, `version = 'reflejo-0.1.0'`. **Sin store persistente**:
  conjuntos en memoria `this._esperados`, `this._recibidos`, `this._verticales` (Map
  `project_id` → `Set`).
- `onCalcularRequest` delega en
  `_atender(e, 'calcular', 'contabilidad.cobertura.calcular.response', fn)`;
  `onAnclajeDeclarado` y `onHechoAdmitido` son fire-and-forget (alimentan los sets;
  retornan respuesta interna, no publican evento propio).
- Proyecciones puras: `_calcular` (LA métrica única), `_huecos` (vista que lee
  `_calcular`) + helpers `_set`, `_claveDeCierre`, `_claveDeHecho`. `_invalid`/
  `_errorResponse`/`_round` vienen de la base.
- Tools: `toolCalcular` → `_calcular`, `toolHuecos` → `_huecos`.
- DEP hacia delante: `contabilidad.cobertura_calculada` lo consumen
  `declaracion-fuente-faltante` (A15) y `aviso-cuadre` (C6); Q3 y P4 son vistas suyas.
  DEP hacia atrás por evento: A14 `anclaje-cierre-vertical` (ESPERADO) y A1
  `puerto-evento-vertical` (RECIBIDO); M3 `clave-natural` (clave de un hecho).
