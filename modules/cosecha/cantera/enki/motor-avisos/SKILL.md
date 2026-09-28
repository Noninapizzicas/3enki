---
name: motor-avisos
description: >
  Skill FULL del módulo PUENTE `motor-avisos` de la vertical contabilidad de Enki (K2,
  hoja del plan). LA PIEZA QUE DESBLOQUEA: PRODUCE el aviso a partir de señales REALES —
  nunca de pantalla muda — y lo enruta a quien tiene la silla. Atiende el RPC
  contabilidad.aviso.solicitar.request y responde EXACTAMENTE por
  contabilidad.aviso.solicitar.response (con el MISMO request_id que emite _atender), que
  es el discriminante que comprueban los consumidores que hoy publican 503
  DEPENDENCIA_NO_DISPONIBLE (aviso-revision A8.2, declaracion-fuente-faltante A15, y vía
  completitud-cobertura C6): al estar este módulo vivo, los tres DEJAN de publicar su
  contrato tolerante. Acepta `destinatario` o `cola_destino` indistintamente y los deriva
  el uno del otro. QUÉ avisos, A QUIÉN y POR QUÉ CANAL es DECLARABLE (K6): el catálogo
  vive en memoria del propio puente, arranca con un catálogo BASE declarable y el
  declarante (DUENO/ASESOR, único rol) lo amplía o lo sobreescribe con
  contabilidad.aviso.catalogo.declarar.request — ley_cableada:false. Stateless: SIN
  PosPersistencia y SIN project.activated. Úsala para operar, depurar o extender el
  puente, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando un consumidor necesite el aviso (RPC contabilidad.aviso.solicitar.request) o el
    declarante amplíe el catálogo (RPC contabilidad.aviso.catalogo.declarar.request).
  - Cuando depures por qué un consumidor tolerante sigue publicando 503 (si este módulo está
    vivo, recibe 200 por .response), o por qué se rechaza el aviso (400 INVALID_INPUT si falta
    project_id/tipo) o la declaración de catálogo (403 PERMISSION_DENIED si el rol no es
    DUENO/ASESOR, 422 DESTINATARIO_NO_VALIDO si el destinatario sale del catálogo, 400
    INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el catálogo BASE
    declarable (K6) y por qué ningún aviso nace de pantalla muda.
  - Cuando vayas a escribir/ampliar el test unitario del puente motor-avisos.
tags: [enki, modulo, puente, contabilidad, motor-avisos, avisos, declarable]
---

# motor-avisos — PUENTE que PRODUCE el aviso y lo enruta

## Qué hace el módulo

`motor-avisos` es un **PUENTE STATELESS** (K2, hoja del plan): **LA PIEZA CLAVE DEL GRUPO**.
PRODUCE el aviso a partir de **señales REALES** — **nunca de pantalla muda** — y lo **enruta
a quien tiene la silla**. Recibe señales de A8.2 (`aviso-revision`), C6 (`aviso-cuadre`), D6
(`calendario-fiscal`), E5, J4, A15 (`declaracion-fuente-faltante`) y R1, y las convierte en
**avisos enrutados**.

**ESTE MODULO ATIENDE EL RPC `contabilidad.aviso.solicitar.request`** — la petición que
**DESBLOQUEA** a los consumidores. Los que hoy publican **503 DEPENDENCIA_NO_DISPONIBLE**
(aviso-revision A8.2, declaracion-fuente-faltante A15, y vía completitud-cobertura C6) piden
el aviso con `{project_id, origen, tipo, motivo, destinatario, cola_destino, prioridad,
contexto, correlation_id}` y esperan **`status === 200`**. Aquí se les responde
**EXACTAMENTE** por `contabilidad.aviso.solicitar.response` (lo emite `_atender` con el mismo
`request_id`): **al estar este módulo vivo, los tres DEJAN de publicar su contrato
tolerante**. El contrato **encaja** con lo que ellos ya piden: se acepta **`destinatario` o
`cola_destino` indistintamente** y se **derivan el uno del otro** (A8.2 usa ambos con el
mismo valor).

**QUE AVISOS, A QUIEN Y POR QUE CANAL es DECLARABLE (K6)**: el catálogo vive en memoria del
propio puente y arranca con un **catálogo BASE declarable** (`CATALOGO_BASE`:
`AVISO_REVISION`→ASESOR, `HUECO_COBERTURA`→DUENO, `AVISO_CUADRE`→ASESOR, `AVISO_PLAZO`→ASESOR,
`AVISO_DESVIACION`→DUENO, `AVISO_AMORTIZACION`→ASESOR, `AVISO_RECTIFICACION`→ASESOR,
`AVISO_OBLIGACION`→ASESOR, `AVISO_CIERRE`→ASESOR, `AVISO_SANGRIA`→DUENO, `AVISO_ACUSE`→ASESOR);
el **declarante (DUENO/ASESOR, único rol)** lo amplía o lo sobreescribe con
`contabilidad.aviso.catalogo.declarar.request` — **`ley_cableada:false`**.

Es **stateless**: **SIN PosPersistencia y SIN `project.activated`** — no guarda estado;
reacciona a un evento y sigue; el catálogo es **configuración del adaptador**, no parcela
persistente. La dependencia con `cola-declaraciones-criterio` (K9) es **por EVENTO, NUNCA
por `require` cruzado**. **K2 solo PRODUCE y ENRUTA**; `R1 (aviso-al-negocio)` **ENTREGA y
CONFIRMA** — si la entrega no se puede confirmar, el aviso no consta como recibido.

> **NO REUTILIZA**: no existe motor de avisos contables en el inventario.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.aviso.solicitar.request` | `onSolicitarRequest` | RPC PUENTE — LA PETICION QUE DESBLOQUEA A LOS CONSUMIDORES: {project_id, origen, tipo, motivo?, destinatario?, cola_destino?, prioridad?, marca?, contexto?, correlation_id?} → {project_id, aviso:{id, tipo, origen, motivo, texto, familia, destinatario, cola_destino, prioridad, canal, senal_real:true, pantalla_muda:false}, producido:true, enrutado:true, dependencia_disponible:true}. Contrato EXACTO con el que ya llaman aviso-revision (A8.2: origen 'A8.2_AVISO_REVISION', tipo 'AVISO_REVISION', destinatario/cola_destino ASESOR\|DUENO, prioridad, contexto) y declaracion-fuente-faltante (A15: origen 'A15_DECLARACION_FUENTE_FALTANTE', tipo 'HUECO_COBERTURA', marca 'ABIERTO', destinatario 'DUENO', contexto). PRODUCE el aviso (catalogo declarable K6), lo ENRUTA publicando contabilidad.aviso.enrutar.request y publica contabilidad.aviso_producido; responde por contabilidad.aviso.solicitar.response con status 200 (deja de haber 503 DEPENDENCIA_NO_DISPONIBLE). Si falta project_id o tipo → contabilidad.aviso.solicitar.failed. |
| `contabilidad.aviso.catalogo.declarar.request` | `onDeclararRequest` | RPC PUENTE: {project_id, rol:'DUENO'\|'ASESOR', tipo, destinatario?, canal?, descripcion?, familia?} → {project_id, tipo, entrada:{tipo, destinatario, canal, familia, declarado:true, declarado_por}, creado, ley_cableada:false}. K6: QUE avisos, a QUIEN y por que CANAL es DECLARABLE — el declarante amplia o sobreescribe el catalogo BASE. Cerrojo: rol fuera de DUENO/ASESOR → 403 PERMISSION_DENIED; destinatario fuera de ASESOR\|DUENO → 422 DESTINATARIO_NO_VALIDO. Responde por contabilidad.aviso.catalogo.declarar.response; error → contabilidad.aviso.catalogo.declarar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.aviso_producido` | Fire-and-forget (K2): el aviso quedo PRODUCIDO a partir de una senal REAL → {project_id, aviso:{id, tipo, origen, motivo, texto, familia, destinatario, cola_destino, prioridad, canal, contexto, senal_real:true, pantalla_muda:false, catalogo_declarable:true}, producido:true, enrutado:true}. Nunca nace de pantalla muda. |
| `contabilidad.aviso.enrutar.request` | Salida hacia la ENTREGA (R1, aviso-al-negocio): {project_id, aviso, aviso_id, destinatario:'ASESOR'\|'DUENO', cola_destino, canal, prioridad, enrutado:true}. K2 solo PRODUCE y ENRUTA; R1 ENTREGA y CONFIRMA — si la entrega no se puede confirmar, el aviso no consta como recibido. |
| `contabilidad.aviso.solicitar.failed` | Par de fallo determinista: solicitar sin project_id o sin tipo. Cierra el circulo de contabilidad.aviso.solicitar.request. OJO: cuando este modulo esta vivo los consumidores (A8.2, A15) YA NO lo reciben — reciben el 200 por contabilidad.aviso.solicitar.response. |
| `contabilidad.aviso.catalogo.declarar.failed` | Par de fallo determinista: declarar sin project_id/tipo, con rol fuera de DUENO/ASESOR (403 PERMISSION_DENIED) o con destinatario no declarable (422 DESTINATARIO_NO_VALIDO). Cierra el circulo de contabilidad.aviso.catalogo.declarar.request. |
| `contabilidad.aviso_producido.failed` | Par de fallo del evento de dominio contabilidad.aviso_producido: la emision del hecho de dominio no se completo. |
| `contabilidad.aviso.enrutar.failed` | Par de fallo del enrutado: el aviso no tiene destinatario valido al que enrutar. NO se declara entregado lo que no se pudo enrutar. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.aviso.solicitar.failed` cierra `contabilidad.aviso.solicitar.request`;
> `contabilidad.aviso.catalogo.declarar.failed` cierra
> `contabilidad.aviso.catalogo.declarar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.aviso.solicitar.response` y `contabilidad.aviso.catalogo.declarar.response`
> (los pares response de los RPC); **NO están declaradas en `publishes`**. Además
> `onSolicitarRequest` publica **en éxito** `contabilidad.aviso.enrutar.request` (o
> `contabilidad.aviso.enrutar.failed`) y `contabilidad.aviso_producido`.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el
> par de fallo real es `<op>.failed`) — `contabilidad.aviso_producido.failed` y
> `contabilidad.aviso.enrutar.failed` son los pares de los eventos de DOMINIO/enrutado.
> `contabilidad.aviso.enrutar.failed` **sí** se emite cuando `_enrutar` devuelve `null`
> (aviso sin destinatario válido); `contabilidad.aviso_producido.failed` solo lo declara el
> `module.json` (el puente no lo publica desde ningún handler).

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc` no
> usa `_rpc`; el enrutado sale como **evento publicado**
> (`contabilidad.aviso.enrutar.request`), no como request/response.

## Reglas de negocio

1. **Ningún aviso nace de pantalla muda (invariante)**: todo aviso producido lleva
   `senal_real:true`, `pantalla_muda:false`, `catalogo_declarable:true`. La respuesta declara
   `no_es_pantalla_muda:true` y `dependencia_disponible:true`.
2. **El destinatario se acepta en cualquiera de las dos formas**: `_producir` lee
   `destinatario || cola_destino` (normalizado a mayúsculas) y `cola_destino || destinatario`;
   si no es válido, cae al `destinatario` del catálogo o al `DESTINATARIO_DEFECTO`
   (`'ASESOR'`). `cola_destino` se deriva del destinatario si no viene válido. Sillas
   válidas: **`ASESOR`, `DUENO`**.
3. **Prioridad declarable**: `prioridad` en `{BAJA, NORMAL, ALTA, URGENTE}`; si no viene
   válida, `ambiguedad_alta ? 'ALTA' : 'NORMAL'`.
4. **Canal**: el del catálogo (`def.canal`) o el declarado (`'PANEL'` por defecto).
5. **El aviso lleva su traza**: `id = '<pid>-K2-<secuencia>'` (secuencia propia del puente),
   `tipo`, `origen`, `motivo` (payload o `def.descripcion`), `texto` (`def.descripcion ||
   s.motivo || tipo`), `familia` (`def.familia` o `'GENERAL'`), `destinatario`,
   `cola_destino`, `prioridad`, `canal`, `contexto`, `marca`, `tipo_declarado` (si el tipo
   fue declarado con K6), `producido_en`, `correlation_id`.
6. **CATALOGO BASE declarable (K6)**: `CATALOGO_BASE` es el arranque, **no la ley**. El
   declarante lo amplía o sobreescribe: `_declararCatalogo` guarda
   `{tipo, destinatario, canal, descripcion, familia, declarado:true, declarado_por,
   declarado_en}`. **No hay catálogo cableado como ley** (`ley_cableada:false`).
7. **Un solo declarante (K6)**: `ROLES_DECLARANTES = {DUENO, ASESOR}`. Otro rol → **`403
   PERMISSION_DENIED`** (`rol_esperado:[...]`, `rol_recibido`). Destinatario fuera de
   `{ASESOR, DUENO}` → **`422 DESTINATARIO_NO_VALIDO`** (`destinatarios_posibles`).
8. **Se PRODUCE y se ENRUTA**: `onSolicitarRequest` — si `_solicitar` da `200`, `_enrutar`
   compone la salida hacia R1 (`entregado_por:'R1 (aviso-al-negocio)'`, `enrutado:true`); si
   `_enrutar` devuelve `null` (sin destinatario válido) → publica
   `contabilidad.aviso.enrutar.failed` (`422 PRECONDITION_FAILED`). Después publica
   `contabilidad.aviso_producido`. **NO se declara entregado lo que no se pudo enrutar.**
9. **Contrato de fallo del RPC**: si `_solicitar` da `status !== 200` (falta `project_id` o
   `tipo`) → publica `contabilidad.aviso.solicitar.failed` con `{status, error,
   correlation_id}` **y aun así** `_atender` emite el `.response`. El consumidor ve el 200
   cuando la dependencia está viva.
10. **`_solicitar` es la puerta que desbloquea**: acepta el payload EXACTO de A8.2 y A15;
    exige `project_id` (`400 INVALID_INPUT project_id`) y `tipo` (`400 INVALID_INPUT tipo`).
    La respuesta incluye `producido:true`, `enrutado:true`, `dependencia:'motor-avisos'`,
    `dependencia_disponible:true`, `no_es_pantalla_muda:true`.
11. **El puente es stateless**: sin store, sin PosPersistencia, sin `project.activated`. El
    único estado es el catálogo en memoria (`this._catalogo`, Map) y la `this._secuencia`.
12. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
    sin `tipo` → `400 INVALID_INPUT tipo`. Shape: `{status:400, error:{code:'INVALID_INPUT',
    message:'<campo> requerido', details:{field:<campo>}}}`.
13. **HTTP exacto**: aviso producido → `200`; payload inválido → `400`; rol no declarante =
    `403`; destinatario no declarable = `422`; no usa `_atender` para decidir el aviso (solo
    para el RPC); excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.aviso.solicitar.response` y
`contabilidad.aviso.catalogo.declarar.response`.

### 1. `solicitar` — la petición que DESBLOQUEA (payload de A8.2)

```json
{
  "project_id": "e57a318a-...",
  "origen": "A8.2_AVISO_REVISION",
  "tipo": "AVISO_REVISION",
  "motivo": "SIN_COBERTURA",
  "destinatario": "ASESOR",
  "cola_destino": "ASESOR",
  "prioridad": "ALTA",
  "contexto": { "excepcion_id": "e57a318a-...-A8.1-007", "naturaleza": "CONTABLE", "vertical": "COMPRA" },
  "correlation_id": "abc-123"
}
```

Respuesta `200` (por `.response` con el MISMO request_id):

```json
{
  "project_id": "e57a318a-...",
  "aviso": { "id": "e57a318a-...-K2-1", "project_id": "e57a318a-...", "tipo": "AVISO_REVISION", "origen": "A8.2_AVISO_REVISION", "motivo": "SIN_COBERTURA", "texto": "esto necesita revision", "familia": "EXCEPCION", "destinatario": "ASESOR", "cola_destino": "ASESOR", "prioridad": "ALTA", "canal": "PANEL", "contexto": { "...": "..." }, "senal_real": true, "pantalla_muda": false, "catalogo_declarable": true, "tipo_declarado": false },
  "producido": true,
  "enrutado": true,
  "dependencia": "motor-avisos",
  "dependencia_disponible": true,
  "no_es_pantalla_muda": true
}
```

Emite `contabilidad.aviso.enrutar.request` (salida hacia R1) y `contabilidad.aviso_producido`.

### 2. `solicitar` — payload de A15 (hueco de cobertura)

```json
{ "project_id": "e57a318a-...", "origen": "A15_DECLARACION_FUENTE_FALTANTE", "tipo": "HUECO_COBERTURA", "marca": "ABIERTO", "destinatario": "DUENO", "contexto": { "vertical": "VENTA", "unidad": "2026-09" } }
```

→ `200` con `aviso.destinatario:'DUENO'`, `familia:'COBERTURA'`, `texto:'falta una fuente: el
hueco queda declarado'`.

### 3. `declarar` — el declarante amplía el catálogo (K6)

```json
{ "project_id": "e57a318a-...", "rol": "ASESOR", "tipo": "AVISO_CUSTOM", "destinatario": "DUENO", "canal": "EMAIL", "descripcion": "revisar el cierre", "familia": "CIERRE" }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "tipo": "AVISO_CUSTOM", "entrada": { "tipo": "AVISO_CUSTOM", "destinatario": "DUENO", "canal": "EMAIL", "descripcion": "revisar el cierre", "familia": "CIERRE", "declarado": true, "declarado_por": "ASESOR", "declarado_en": "..." }, "creado": true, "catalogo_declarable": true, "ley_cableada": false, "n_tipos": 12 }
```

### 4. Fallo — solicitar sin `tipo` → 400

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `400 INVALID_INPUT tipo` + `contabilidad.aviso.solicitar.failed`.

### 5. Fallo — rol no declarante → 403

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "tipo": "AVISO_CUSTOM" }
```

Respuesta `403` + `contabilidad.aviso.catalogo.declarar.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "el catalogo de avisos (K6) lo declara DUENO o ASESOR", "details": { "rol_esperado": ["DUENO", "ASESOR"], "rol_recibido": "OPERADOR" } } }
```

### 6. Fallo — destinatario no declarable → 422

```json
{ "project_id": "e57a318a-...", "rol": "DUENO", "tipo": "AVISO_CUSTOM", "destinatario": "CLIENTE" }
```

→ `422 DESTINATARIO_NO_VALIDO` (`destinatarios_posibles:['ASESOR','DUENO']`).

### 7. Tools (sin RPC en module.json)

`toolSolicitar` → `_solicitar`; `toolProducir` → `_producir`; `toolEnrutar` → `_enrutar`;
`toolDeclararCatalogo` → `_declararCatalogo`; `toolCatalogo` → `_catalogoActual`.

## Tests

El test viviría en `tests/unit/motor-avisos.test.js`. Cubre:

- `solicitar` con el payload EXACTO de A8.2 → `200` por `.response`,
  `dependencia_disponible:true`, `aviso.destinatario:'ASESOR'`, `senal_real:true`,
  `pantalla_muda:false`; emite `contabilidad.aviso.enrutar.request` y
  `contabilidad.aviso_producido`.
- `solicitar` con el payload de A15 → `200`, `aviso.familia:'COBERTURA'`,
  `destinatario:'DUENO'`.
- **Discriminante**: el consumidor que publicaba 503 al no haber K2 → ahora recibe `200` por
  `contabilidad.aviso.solicitar.response` (no `*.failed`).
- **Derivación destinatario/cola_destino**: llega solo `cola_destino` → se deriva
  `destinatario` y viceversa.
- `declarar` con `rol:'ASESOR'` → `200`, `entrada.declarado:true`, `ley_cableada:false`;
  `creado` según exista.
- **Declarante único**: rol fuera de DUENO/ASESOR → `403 PERMISSION_DENIED`.
- **Destinatario no válido** al declarar → `422 DESTINATARIO_NO_VALIDO`.
- Sin `project_id`/`tipo` → `400 INVALID_INPUT` + `contabilidad.aviso.solicitar.failed`.
- El puente es **stateless**: sin `project.activated` ni persistencia.
- `CATALOGO_BASE` arranca con sus 11 tipos y puede ser sobreescrito por el declarante.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/motor-avisos
node --test tests/unit/motor-avisos.test.js
```

## Notas de implementación

- Clase `MotorAvisos extends ModuloHibridoReflejo`; `name = 'motor-avisos'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (puente stateless: no hay `this._store` ni
  PosPersistencia ni `project.activated`). Usa `require('crypto')` (declarado, no usado en
  el camino actual).
- Constantes: `DESTINATARIOS = Set('ASESOR','DUENO')`, `COLAS = Set('ASESOR','DUENO')`,
  `ROLES_DECLARANTES = Set('DUENO','ASESOR')`, `PRIORIDADES = Set('BAJA','NORMAL','ALTA',
  'URGENTE')`, `CATALOGO_BASE` (11 tipos), `DESTINATARIO_DEFECTO = 'ASESOR'`. Estado interno:
  `this._catalogo` (Map) y `this._secuencia`.
- `onSolicitarRequest`/`onDeclararRequest` delegan en `_atender(e, '<op>',
  'contabilidad.aviso.<op>.response', fn)`; el primero publica en fallo
  `contabilidad.aviso.solicitar.failed`, y en éxito `contabilidad.aviso.enrutar.request` (o
  `contabilidad.aviso.enrutar.failed`) + `contabilidad.aviso_producido`. El segundo publica en
  fallo `contabilidad.aviso.catalogo.declarar.failed`.
- Proyecciones puras: `_solicitar`, `_producir`, `_enrutar`, `_declararCatalogo`,
  `_catalogoActual`. `_atender`, `_invalid` y `_errorResponse` vienen de la base.
- Tools: `toolSolicitar`, `toolProducir`, `toolEnrutar`, `toolDeclararCatalogo`,
  `toolCatalogo`.
- DEP hacia delante: `contabilidad.aviso.enrutar.request` lo consume R1
  (`aviso-al-negocio`, que ENTREGA y CONFIRMA); `contabilidad.aviso_producido` traza el
  aviso. DEP hacia atrás: los consumidores (A8.2 aviso-revision, A15
  declaracion-fuente-faltante, C6 aviso-cuadre, D6 calendario-fiscal, E5, J4) piden el aviso
  por `contabilidad.aviso.solicitar.request`; `cola-declaraciones-criterio` (K9) por EVENTO.
