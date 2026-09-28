---
name: panel-proceso-contable
description: >
  Skill FULL del módulo REFLEJO `panel-proceso-contable` de la vertical contabilidad
  de Enki (P1+P4, hoja del plan). EL LATIDO DEL PROCESO DE ADMISIÓN: qué ENTRA, qué SE
  PROCESA, qué ESTÁ EN COLA y qué FALLA — el "display" del proceso de entrada, no del
  asiento. Agrega de forma DETERMINISTA (misma foto → mismo panel) las TRES fuentes
  por EVENTO (cola-revision A8.1, historial-proceso-contable P2, completitud-cobertura
  A12) y expone la TASA que prueba la promesa "sin una persona digitando" (P4), que NO
  recalcula: es VISTA de la métrica única A12. Contrato TOLERANTE: la fuente que no
  responde se declara y NUNCA se rellena. Sin estado. Úsala para operar, depurar o
  extender el reflejo.
when-to-use: >
  - Cuando necesites el latido del proceso contable de un proyecto
    (RPC contabilidad.panel.latido.request) con sus cuatro bloques y la tasa de
    cobertura.
  - Cuando depures por qué el panel sale incompleto (fuentes_no_disponibles) o por qué
    la tasa es null (cobertura no disponible — no se estima).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la
    agregación determinista y por qué la tasa es vista, no recálculo.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo panel-proceso-contable.
tags: [enki, modulo, reflejo, contabilidad, panel-proceso-contable, latido, panel]
---

# panel-proceso-contable — REFLEJO del latido del proceso de admisión

## Qué hace el módulo

`panel-proceso-contable` es un **REFLEJO STATELESS** (P1+P4, hoja del plan): **el
LATIDO DEL PROCESO DE ADMISIÓN** — *qué ENTRA, qué SE PROCESA, qué ESTÁ EN COLA y qué
FALLA*. Es el **"display" del proceso de entrada, no del asiento**.

La agregación es **DETERMINISTA**: la misma foto de las fuentes → el mismo panel (un
test lo afirma). Lee **tres fuentes por EVENTO** (RPC request/response del bus, nunca
por `require` cruzado):

- **cola-revision (A8.1)** → `contabilidad.excepcion.siguiente.request` (dos veces: cola
  `ASESOR` y cola `DUENO`).
- **historial-proceso-contable (P2)** → `contabilidad.historial.consultar.request`.
- **completitud-cobertura (A12)** → `contabilidad.cobertura.calcular.request`.

Expone además la **TASA** que **PRUEBA la promesa "sin una persona digitando"** (P4):
la proporción de lo que entra sin intervención frente a lo que cae a cola. **La tasa NO
se recalcula aquí**: P4 es **VISTA** de la **métrica única de cobertura (A12)**, y el
panel la **LEE** (`recalcula:false`, `es_vista_de_metrica_unica:true`).

Es **stateless**: sin PosPersistencia ni `project.activated`. **Contrato TOLERANTE**:
si una fuente no responde, el panel la marca en `fuentes_no_disponibles` y **NUNCA
fabrica sus cifras** (nada de basura por relleno); la tasa queda `null` con
`disponible:false` en vez de estimarse.

> **NO REUTILIZA**: no existe panel de proceso contable; es el "display" de la entrada.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.panel.latido.request` | `onLatidoRequest` | RPC reflejo: {project_id} → {project_id, queEntra:{hechos_admitidos,total_anotado}, queSeProcesa:{excepciones_resueltas,tasa_cobertura}, queEstaEnCola:{ASESOR,DUENO,total_pendiente,nunca_bloquea}, queFalla:{huecos,senal_cobertura}, tasa_cobertura:{tasa,fuente,es_vista_de_metrica_unica,recalcula:false,...}, fuentes, fuentes_no_disponibles}. Agrega el latido leyendo las TRES fuentes por EVENTO (cola-revision A8.1, historial-proceso-contable P2, completitud-cobertura A12). Contrato TOLERANTE: la fuente que no responde se declara en fuentes_no_disponibles y NO se rellena. Publica contabilidad.panel_latido y responde por contabilidad.panel.latido.response; si falta project_id → contabilidad.panel.latido.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.panel_latido` | Fire-and-forget (P1): el latido del proceso contable quedo calculado → {project_id, queEntra, queSeProcesa, queEstaEnCola, queFalla, tasa_cobertura, fuentes, fuentes_no_disponibles}. Es el display del proceso de admision: lo que entra, lo que se procesa sola, lo que espera en cola y lo que falla. |
| `contabilidad.panel.latido.failed` | Par de fallo determinista: latido sin project_id (400). Cierra el circulo de contabilidad.panel.latido.request. |
| `contabilidad.panel_latido.failed` | Par de fallo del evento de dominio contabilidad.panel_latido: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.panel.latido.failed` cierra `contabilidad.panel.latido.request`
> (se emite en la rama de fallo de `onLatidoRequest`).

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.panel.latido.response` (el par response del RPC); **NO está declarada en
> `publishes`**.

> Nota: **`contabilidad.panel_latido.failed` está declarada en `publishes` pero no se
> emite en `index.js`** — el reflejo solo publica el par de fallo de su RPC.

> Nota: no está en module.json pero sí lo emite index.js en **`_leerFuentes`** — el
> módulo publica por `_rpc` `contabilidad.excepcion.siguiente.request`,
> `contabilidad.historial.consultar.request` y `contabilidad.cobertura.calcular.request`
> (dependencias por EVENTO, no declaradas como publishers).

## Reglas de negocio

1. **Agregación determinista**: misma foto de las fuentes → mismo panel
   (`determinista:true`, `display_del_proceso:true`). No hay relojes ni azar en el
   cálculo.
2. **Contrato TOLERANTE (nunca rellena)**: por cada fuente cuya respuesta **no** sea
   `status === 200` se añade su nombre a `fuentes_no_disponibles` (`'cola-revision'`,
   `'historial-proceso-contable'`, `'completitud-cobertura'`). Las cifras de esa fuente
   quedan `null` con `disponible:false`; **jamás** se estiman.
3. **La tasa es VISTA, no recálculo (P4)**: `_tasaCobertura` devuelve
   `{ tasa, fuente:'completitud-cobertura', es_vista_de_metrica_unica:true,
   recalcula:false, promesa:'sin una persona digitando', disponible, nota }`. Si la
   cobertura **no** está disponible, `tasa:null` y
   `nota:'cobertura no disponible: la tasa NO se estima'`. Si hay `sin_actividad` →
   `tasa:0`.
4. **queEntra** = `{ hechos_admitidos, total_anotado }` del historial: `admitidos` =
   entradas con `tipo === 'HECHO_ADMITIDO'`; `total` = `d.total` (o longitud de
   `entradas`).
5. **queSeProcesa** = `{ excepciones_resueltas, tasa_cobertura }`: `resueltas` =
   entradas con `tipo === 'EXCEPCION_RESUELTA'`; `tasa_cobertura` = la tasa leída.
6. **queEstaEnCola (nunca bloquea)**: `{ ASESOR, DUENO, total_pendiente, nunca_bloquea:true }`.
   Por cola, `pendiente = d.vacia === false` (y `vacia = d.vacia === true`); si la cola
   no está disponible → `{ pendiente:null, vacia:null, disponible:false }`.
   `total_pendiente` = suma de colas con `pendiente === true` (0 o 1 por cola).
7. **queFalla** = `{ huecos, senal_cobertura }` leídos de la cobertura (A12) — lo
   esperado que no llegó.
8. **Validación determinista**: falta `project_id` → **`400 INVALID_INPUT
   project_id`** con `{ status:400, error:{ code:'INVALID_INPUT', message:'project_id
   requerido', details:{ field:'project_id' } } }`.
9. **HTTP exacto**: éxito `200`; payload inválido → `400`; excepción en `_atender` →
   `500 UNKNOWN_ERROR`. La no disponibilidad de una fuente **no** es error del panel:
   se declara en `fuentes_no_disponibles` y el latido sigue `200`.

## Cómo se usa (RPCs)

RPC que responde en `contabilidad.panel.latido.response`.

### 1. `latido` — la foto del proceso de admisión

```json
{ "project_id": "e57a318a-...", "correlation_id": "abc-123" }
```
Respuesta `200` (con las tres fuentes vivas):
```json
{
  "project_id": "e57a318a-...",
  "queEntra": { "hechos_admitidos": 12, "total_anotado": 30 },
  "queSeProcesa": { "excepciones_resueltas": 5, "tasa_cobertura": 0.92 },
  "queEstaEnCola": { "ASESOR": true, "DUENO": false, "total_pendiente": 1, "nunca_bloquea": true },
  "queFalla": { "huecos": 2, "senal_cobertura": "..." },
  "tasa_cobertura": { "tasa": 0.92, "fuente": "completitud-cobertura", "es_vista_de_metrica_unica": true, "recalcula": false, "esperados": 50, "recibidos": 46, "colas_ocupadas": 1, "sin_actividad": false, "promesa": "sin una persona digitando", "disponible": true, "nota": "P4 es VISTA de la metrica unica A12; no la recalcula" },
  "fuentes": { "colas": { "ASESOR": { "pendiente": true, "vacia": false, "excepcion": { "...": "..." }, "disponible": true }, "DUENO": { "pendiente": false, "vacia": true, "excepcion": null, "disponible": true }, "colas": ["ASESOR", "DUENO"] }, "historial": { "total": 30, "admitidos": 12, "resueltas": 5, "disponible": true }, "cobertura": { "esperados": 50, "recibidos": 46, "huecos": 2, "tasa": 0.92, "senal": "...", "sin_actividad": false, "disponible": true } },
  "fuentes_no_disponibles": [],
  "determinista": true,
  "display_del_proceso": true
}
```
Emite `contabilidad.panel_latido` (res.data + `correlation_id`).

### 2. `latido` — una fuente no responde (TOLERANTE, tasa no estimada)

Si `completitud-cobertura` no responde:
```json
{ "project_id": "e57a318a-...", "queEntra": { "...": "..." }, "tasa_cobertura": { "tasa": null, "disponible": false, "recalcula": false, "nota": "cobertura no disponible: la tasa NO se estima", "...": "..." }, "fuentes_no_disponibles": ["completitud-cobertura"], "...": "..." }
```
El latido sigue `200`; la fuente ausente se **declara**, no se rellena.

### 3. Fallo — payload inválido

Sin `project_id` → `400 INVALID_INPUT` + `contabilidad.panel.latido.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

### 4. Tools (sin RPC en module.json)

`toolLatido` → `_latido`; `toolTasaCobertura` → `_tasaCobertura`.

## Tests

El test vive en `tests/unit/panel-proceso-contable.test.js`. Cubre:

- `latido` con las tres fuentes vivas → `200` con los cuatro bloques (`queEntra`,
  `queSeProcesa`, `queEstaEnCola`, `queFalla`), `fuentes_no_disponibles:[]` y emite
  `contabilidad.panel_latido`.
- **Determinismo**: la MISMA foto de fuentes → el MISMO panel.
- **Contrato tolerante**: si `cola-revision` / `historial-proceso-contable` /
  `completitud-cobertura` no responde → la fuente aparece en `fuentes_no_disponibles`
  y sus cifras quedan `null` (nunca rellenas); la tasa queda `null`/`disponible:false`.
- `queEstaEnCola` refleja `pendiente` por cola (`vacia === false`) y `nunca_bloquea:true`.
- `_tasaCobertura`: `recalcula:false`, `es_vista_de_metrica_unica:true`, `sin_actividad`
  → `tasa:0`.
- Sin `project_id` → `400 INVALID_INPUT` + `contabilidad.panel.latido.failed`.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/panel-proceso-contable
node --test tests/unit/panel-proceso-contable.test.js
```

## Notas de implementación

- Clase `PanelProcesoContable extends ModuloHibridoReflejo`; `name =
  'panel-proceso-contable'`, `version = 'reflejo-0.1.0'`. **Sin store** (reflejo
  stateless: nada que persistir).
- Constantes: `COLAS = ['ASESOR', 'DUENO']`, `TIPO_EXCEPCION_RESUELTA =
  'EXCEPCION_RESUELTA'`, `TIPO_HECHO_ADMITIDO = 'HECHO_ADMITIDO'`.
- `onLatidoRequest` delega en `_atender(e, 'latido', 'contabilidad.panel.latido.response',
  fn)`; en éxito publica `contabilidad.panel_latido`, en fallo
  `contabilidad.panel.latido.failed`.
- `_leerFuentes` hace las **cuatro** lecturas en paralelo con `Promise.all` (`_rpc`
  con `timeout_ms:4000`): dos `contabilidad.excepcion.siguiente.request` (ASESOR y
  DUENO), `contabilidad.historial.consultar.request`,
  `contabilidad.cobertura.calcular.request`.
- Proyecciones puras: `_latido` (`{status, data}`) + helpers `_colas`, `_historial`,
  `_cobertura`, `_tasaCobertura`. `_invalid` viene de la base.
- Tools: `toolLatido`, `toolTasaCobertura`.
- DEP hacia delante: P4 es la vista de la métrica única A12 (`completitud-cobertura`).
  DEP hacia atrás por evento: A8.1 `cola-revision`, P2 `historial-proceso-contable`,
  A12 `completitud-cobertura`.
