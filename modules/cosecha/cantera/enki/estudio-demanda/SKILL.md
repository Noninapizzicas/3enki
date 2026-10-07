---
name: estudio-demanda
description: >
  Skill FULL del módulo MICRO-AGENTE (fuzzy) `estudio-demanda` de la vertical nichos
  (Radar de Nichos). Es la PRIMERA pieza del ESLABÓN LIMITANTE del sistema (validación,
  embudo C): dado un candidato de nicho producido por sondeo-territorio (B1) y las fuentes
  declaradas, mide la demanda de 1er orden y la disposición a pagar, y produce un estudio
  de demanda ESTRUCTURADO para el veredicto-viabilidad (C3). Úsala para operar, depurar o
  extender la medición de demanda, o para entender su contrato de eventos y reglas de negocio.
when-to-use: >
  - Cuando necesites medir la demanda de un candidato de nicho (RPC nichos.estudio.medir.request).
  - Cuando depures por qué el estudio falla: candidato inválido (400 CANDIDATO_INVALIDO),
    sin datos de fuentes (422 SIN_DATOS) o juicio sin conclusión (502 SIN_CONCLUSION), o por
    qué cae al fallback reflejo de conclusión.
  - Cuando quieras entender el patrón híbrido reflexivo+fuzzy (reflejo de números declarados +
    llm.complete.request con guion-prompt self-contained) del eslabón limitante de validación.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente.
tags: [enki, modulo, micro-agente, fuzzy, nichos, radar, eslabon-limitante, validacion, demanda, proyecto-3d]
---

# estudio-demanda — MICRO-AGENTE (fuzzy) del ESLABÓN LIMITANTE del Radar

## Qué hace el módulo

`estudio-demanda` es la **primera pieza del ESLABÓN LIMITANTE** del sistema (validación,
embudo C). Recibe un **CANDIDATO de nicho** (producido por `sondeo-territorio`, B1) y las
**fuentes declaradas**, y produce un **ESTUDIO DE DEMANDA estructurado** — no texto suelto —
que alimenta al `veredicto-viabilidad` (C3) vía `nichos.estudio.medido`.

El estudio mide: la **demanda de 1er orden** (quiénes buscan y con qué fuerza) y la
**disposición a pagar** del mercado (rango en EUR), junto con señales concretas y una
conclusión de mercado. Es la célula de evidencia para decidir si el nicho es viable.

Dos mitades (patrón real de `normalizacion-semilla` + `sondeo-territorio`):

- **REFLEJO** (números declarados, determinista):
  - `_medirDemanda1erOrden` — convierte el volumen de señales troceado de las fuentes en
    métricas de 1er orden (`quienes_buscan`, `fuerza_demanda`, `volumen_busqueda`, `fuentes`).
  - `_medirDisposicionAPagar` — de la evidencia de precios en el barrido estima un rango de
    disposición a pagar (`rango_min_eur`/`rango_max_eur` + `precio_medio_eur` en EUR). Sin
    evidencia → cotas declaradas conservadoras (`PRECIO_COTA_BAJA=9`, `PRECIO_COTA_ALTA=200`).
- **FUZZY** (`_redactarConclusion`): una llamada headless a `llm.complete.request` con un
  guion-prompt self-contained (`GUION_CONCLUSION`) que redacta la conclusión de mercado de
  los números. Si el LLM falla → **fallback reflejo** `_redactarConclusionReflejo` por reglas.

**NUNCA inventa**: no fabrica demanda que las fuentes no apoyen. Si el candidato viene vacío o
no hay datos que apoyen la medición → para de fallo honesto (`nichos.estudio.medir.failed`).
Sin store, sin custodio: entra candidato, sale estudio de demanda estructurado.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.estudio.medir.request` | `onMedirRequest` | RPC híbrido: {project_id, candidato, fuentes?} → {candidato, demanda_1er_orden:{quienes_buscan, fuerza_demanda, volumen_busqueda, fuentes}, disposicion_pagar:{moneda, rango_min_eur, rango_max_eur, precio_medio_eur, evidencia}, conclusion_mercado, senales:[{senal, valor}], concluido}. Consulta las fuentes via nichos.fuente.consultar.request, mide demanda de 1er orden y disposición a pagar (reflejo, números declarados) y redacta la conclusión (fuzzy llm.complete.request con fallback reflejo que deriva el estudio de los números sin inventar). Candidato vacío o sin datos que apoyen la medición → error determinista nichos.estudio.medir.failed. Éxito → publica nichos.estudio.medido y responde por nichos.estudio.medir.response. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.estudio.medido` | Fire-and-forget (C1): el estudio de demanda de un candidato quedó medido → {project_id, candidato, demanda_1er_orden, disposicion_pagar, conclusion_mercado, senales, concluido}. Lo consumen veredicto-viabilidad (C3) y el pipeline-por-nicho (L1). |
| `nichos.estudio.medir.failed` | Par de fallo determinista (C1): el candidato llegó vacío o no hay datos de fuentes que apoyen la medición de demanda → {status, code, mensaje, data}. Cierra el círculo de nichos.estudio.medir.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico. Aquí el único
> par posible es `nichos.estudio.medir.failed`.

> **Nota: `project.activated` NO está en module.json ni como handler** en index.js — este
> micro-agente es stateless y no se subscribe a él (aunque conserva `project_id`).

> **Nota: no está en module.json pero sí lo emite index.js en `_consultarFuentes` (línea 119)**:
> el módulo hace una RPC externa `nichos.fuente.consultar.request` hacia el puente de fuentes
> para trocear el dataset de cada fuente declarada (timeout 15s, `.catch(() => null)`). Es una
> LECTURA de otro módulo, no un subscribe propio.

## Reglas de negocio

1. **NUNCA inventar demanda (honestidad)**: el estudio usa SOLO los datos que las fuentes
   devuelven. `_medirDemanda1erOrden` ancla la fuerza en volumen real (`fuerzas` en 0-1:
   `0.3 + 0.15*(fuentesConDatos-1) + 0.02*(volumen/10)`, tope `1`, o `0` sin datos). Las señales
   y la disposición a pagar se derivan de los números medidos, no se fabrican.
2. **Candidato inválido → `400 CANDIDATO_INVALIDO`** + `nichos.estudio.medir.failed` con
   `{ status: 400, code: 'CANDIDATO_INVALIDO', mensaje: 'el candidato es obligatorio para medir la demanda', project_id }`.
3. **Sin datos de fuentes → `422 SIN_DATOS`** + `nichos.estudio.medir.failed` con
   `{ status: 422, code: 'SIN_DATOS', mensaje: 'ninguna fuente devolvio datos que apoyen la medicion de demanda', project_id, candidato }`.
4. **Sin conclusión → `502 SIN_CONCLUSION`** + `nichos.estudio.medir.failed` con
   `{ status: 502, code: 'SIN_CONCLUSION', mensaje: 'el juicio no pudo redactar una conclusion de mercado', project_id, candidato }`.
   Avisa (502 = juicio LLM degradado), no inventa.
5. **Disposición a pagar declarada**: moneda `EUR`. Con evidencia → min/max reales observados;
   sin evidencia → cotas conservadoras declaradas (`9`..`200` EUR) marcadas en `evidencia` como
   "cotas declaradas conservadoras". `precio_medio_eur = round((min+max)/2, 2)`.
6. **Volumen de demanda con cota conservadora**: `PUNTOS_POR_SENAL = 100` tope de trozos
   agregado por fuente (`volumen += Math.min(trozos.length, 100)`).
7. **`llm.complete.request` es una llamada RPC externa headless** con `{ system: GUION_CONCLUSION,
   messages:[{role:'user', content: JSON.stringify({candidato, demanda_1er_orden, disposicion_pagar})}],
   tools:[], settings:{temperature:0.2} }`, `timeout_ms: 30000`, y `.catch(() => null)` (si el
   proveedor falla → fallback reflejo `_redactarConclusionReflejo`).
8. **Siempre datos estructurados, jamas texto suelto**: el estudio devuelve `demanda_1er_orden`,
   `disposicion_pagar`, `senales` y `conclusion_mercado`; `medido: true` en el 200.
9. **Sin estado (micro-agente stateless)**: `project_id` del request tiene preferencia sobre el
   de contexto; no hay PosPersistencia ni store.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.estudio.medir.response`:

### 1. `medir` — medir la demanda de un candidato

```json
{
  "project_id": "e57a318a-...",
  "candidato": {
    "producto": "salsa picante artesanal",
    "audiencia": "restaurantes de barrio",
    "territorio": "Madrid"
  },
  "fuentes": ["puerto", "google-trends"]
}
```
Respuesta `200`:
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "candidato": {
      "producto": "salsa picante artesanal",
      "audiencia": "restaurantes de barrio",
      "territorio": "Madrid"
    },
    "demanda_1er_orden": {
      "quienes_buscan": ["restaurantes de barrio"],
      "fuerza_demanda": 0.72,
      "volumen_busqueda": 84,
      "fuentes": ["puerto", "google-trends"]
    },
    "disposicion_pagar": {
      "moneda": "EUR",
      "rango_min_eur": 9,
      "rango_max_eur": 200,
      "precio_medio_eur": 104.5,
      "evidencia": "sin evidencia de precio concreta en las fuentes: cotas declaradas conservadoras"
    },
    "senales": [
      { "senal": "fuerza_demanda", "valor": 0.72, "unidad": "0-1" },
      { "senal": "volumen_busqueda", "valor": 84, "unidad": "trozos" },
      { "senal": "precio_medio_eur", "valor": 104.5, "unidad": "EUR" }
    ],
    "conclusion_mercado": "El mercado busca principalmente restaurantes de barrio. La demanda de 1er orden es alta (fuerza 0.72, volumen 84 señales) con una disposicion a pagar estimada entre 9 y 200 EUR, lo que sostiene la viabilidad del nicho.",
    "medido": true
  }
}
```
Emite `nichos.estudio.medido` con ese mismo `data` (fire-and-forget hacia veredicto-viabilidad C3).

### Fallo — candidato inválido

```json
{ "project_id": "e57a318a-...", "candidato": null }
```
Respuesta `400` + `nichos.estudio.medir.failed`:
```json
{ "status": 400, "code": "CANDIDATO_INVALIDO", "mensaje": "el candidato es obligatorio para medir la demanda", "project_id": "e57a318a-..." }
```

### Fallo — sin datos de fuentes

```json
{ "project_id": "e57a318a-...", "candidato": { "producto": "xyz" } }
```
Respuesta `422` + `nichos.estudio.medir.failed`:
```json
{ "status": 422, "code": "SIN_DATOS", "mensaje": "ninguna fuente devolvio datos que apoyen la medicion de demanda", "project_id": "e57a318a-...", "candidato": { "producto": "xyz" } }
```

### Fallo — juicio sin conclusión

Respuesta `502` + `nichos.estudio.medir.failed` (si ni el LLM ni el fallback reflejo redactan):
```json
{ "status": 502, "code": "SIN_CONCLUSION", "mensaje": "el juicio no pudo redactar una conclusion de mercado", "project_id": "e57a318a-...", "candidato": { } }
```

## Tests

El test vive en `tests/unit/estudio-demanda.test.js`. Cubre:

- `medir` con candidato válido y fuentes con datos → `200`, mide `demanda_1er_orden` y
  `disposicion_pagar`; emite `nichos.estudio.medido`.
- Candidato inválido → `400` + `nichos.estudio.medir.failed` (`CANDIDATO_INVALIDO`).
- Sin datos de fuentes → `422` + failed (`SIN_DATOS`).
- Si el LLM falla → cae al fallback reflejo `_redactarConclusionReflejo` (conclusión por reglas
  de los números, ≥1 párrafo).
- Si ni el LLM ni el fallback redactan → `502 SIN_CONCLUSION` + failed.
- `_precioSeguro` detecta señales de precio (EUR/€/$) y `_medirDisposicionAPagar` produce
  min/max/medio correctos con y sin evidencia de precio.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/estudio-demanda
node tests/unit/estudio-demanda.test.js
```

## Notas de implementación

- Clase `EstudioDemanda extends ModuloHibridoReflejo`; `name = 'estudio-demanda'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless).
- `onMedirRequest` delega en `_atender(e, 'medir', 'nichos.estudio.medir.response', fn)`
  y publica el fire-and-forget de dominio (`nichos.estudio.medido` si `status===200`, si no
  `nichos.estudio.medir.failed`).
- `_medir` orquesta: consulta fuentes (reflejo `_consultarFuentes` + `_parsearTrozos`) →
  mide 1er orden + disposición a pagar (reflejo) → concluye (fuzzy `_redactarConclusion` con
  fallback `_redactarConclusionReflejo`) → error honesto.
- `_consultarFuentes` hace 1 RPC `nichos.fuente.consultar.request` por fuente declarada (o
  `[null]` si no hay, → `FUENTE_DEFAULT='puerto'`), `timeout_ms: 15000`, `.catch(() => null)`;
  una fuente sin datos se registra con `error: 'FUENTE_NO_DATOS'` aunque no rompa el flujo.
- `_redactarConclusion` hace 1 llamada `llm.complete.request` headless (sin tools) con el
  `GUION_CONCLUSION` self-contained y `temperature: 0.2`, `timeout_ms: 30000`.
- `_parseConclusion` tolera fences ```` ```json ````, contenedores JSON (`{conclusion}`) y
  texto plano (el párrafo mismo) al extraer la conclusión.
- DEP hacia delante: su salida `nichos.estudio.medido` la consume `veredicto-viabilidad` (C3)
  y `pipeline-por-nicho` (L1).
