---
name: flujo-firma
description: >
  Skill FULL del módulo CUSTODIO `flujo-firma` de la vertical contabilidad de Enki
  (L3/L9, hoja del plan). EL CIRCUITO DE FIRMA ES DEL ASESOR: el sistema ARMA y ENTREGA
  la marca (solicitar → expediente PENDIENTE), pero NO firma y NO decide — solo REGISTRA
  la marca que pone el asesor (el_sistema_no_firma:true, sistema_solo_registra:true). UN
  SOLO ESCRITOR de la parcela: el ASESOR (otro rol → 409 ERROR_DOS_ESCRITORES). El nivel
  de firma (PERIODO / ESTADO / DOCUMENTO) es DECLARABLE. INVARIANTE DURA: VENCE SIN FIRMA
  → EXPIRA Y SE RE-PREGUNTA; JAMÁS SE ASUME (409 ERROR_FIRMA_EXPIRADA, acción
  RE_SOLICITAR, asumida:false). Y el DELTA (L9): lo que cambió desde el último visto
  bueno para que el asesor revise SOLO eso. Persiste por proyecto vía PosPersistencia.
  Úsala para operar, depurar o extender el custodio, o para entender su contrato.
when-to-use: >
  - Cuando necesites registrar la marca/firma del asesor (RPC
    contabilidad.firma.marcar.request) o calcular el delta desde su último visto bueno
    (contabilidad.firma.delta.request).
  - Cuando depures por qué se rechaza (409 ERROR_DOS_ESCRITORES si el rol no es ASESOR,
    409 ERROR_FIRMA_EXPIRADA si venció sin firma o la solicitud expiró, 400 INVALID_INPUT
    si falta alcance/project_id).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la invariante
    «vence sin firma → expira y se re-pregunta» y el delta por evento.
  - Cuando vayas a escribir/ampliar el test unitario del custodio flujo-firma.
tags: [enki, modulo, custodio, persistencia, contabilidad, flujo-firma, asesor, expira]
---

# flujo-firma — CUSTODIO del circuito de firma (del asesor)

## Qué hace el módulo

`flujo-firma` es un **CUSTODIO CON PERSISTENCIA** (L3/L9, hoja del plan): **EL CIRCUITO DE
FIRMA ES DEL ASESOR**. El sistema **ARMA y ENTREGA** la marca (solicitar → expediente
PENDIENTE), pero **NO firma y NO decide** — **solo REGISTRA** la marca que pone el asesor
(`el_sistema_no_firma:true`, `sistema_solo_registra:true`).

**UN SOLO ESCRITOR** de la parcela: el rol autorizado es **`ASESOR`** (`ROL_ASESOR`);
cualquier otro rol → **`409 ERROR_DOS_ESCRITORES`** (*dos escritores sobre el visto bueno =
la firma deja de significar algo*). El **nivel de firma** (`PERIODO` / `ESTADO` /
`DOCUMENTO`) es **DECLARABLE**.

**INVARIANTE DURA**: **vence sin firma → EXPIRA y se re-pregunta; JAMÁS se asume.** Una
solicitud **expirada**, o una marca/firma sobre un alcance cuya `fecha_limite` ya pasó, se
rechaza con **`409 ERROR_FIRMA_EXPIRADA`** (`accion:'RE_SOLICITAR'`, `asumida:false`) — el
sistema **nunca asume el visto bueno por silencio**.

Y el **DELTA (L9)**: `_calcularDelta(desdeUltimaFirma)` devuelve
`{asientos_nuevos, ajustes, reglas_cambiadas, total_cambios}` para que el asesor revise
**solo lo que cambió** desde su último visto bueno. Las fuentes (`escritor-diario` B2,
`asiento-ajuste` B5, `regla-contrapartida` A6.2 / `regla-movimiento-bancario` E8) se **LEEN
por EVENTO** — **NUNCA por `require` cruzado** — y lo que no responde **se DECLARA** en
`dependencias_no_disponibles` (no se inventa el cambio).

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/flujo-firma/flujo-firma.json`), restaura en `project.activated` y vuelca en
`onUnload`. **Fire-and-forget**: no consume fuentes por evento; su delta las **LEE**.

> **NO REUTILIZA**: no existe flujo de firma del asesor en el inventario.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.firma.marcar.request` | `onMarcarRequest` | RPC custodio: {project_id, rol:'ASESOR', op?:'REVISADO'\|'FIRMA', alcance?, nivel?:'PERIODO'\|'ESTADO'\|'DOCUMENTO', periodo?, estado?, documento?, fecha_limite?} → {project_id, marca o marca_firma:{alcance, nivel, firmado_en, hash_alcance}, el_sistema_no_firma:true, sistema_solo_registra:true}. El ASESOR marca/firma; el sistema solo REGISTRA. Cerrojos: rol distinto de ASESOR → 409 ERROR_DOS_ESCRITORES; alcance cuya fecha_limite vencio o solicitud EXPIRADA → 409 ERROR_FIRMA_EXPIRADA (se re-pregunta, jamas se asume). Exito publica contabilidad.firma_registrada y responde por contabilidad.firma.marcar.response; error → contabilidad.firma.marcar.failed. |
| `contabilidad.firma.delta.request` | `onDeltaRequest` | RPC custodio: {project_id, alcance?, desde?, asientos?, ajustes?, reglas?} → {project_id, alcance, desde_ultima_firma, ultima_firma, delta:{asientos_nuevos, ajustes, reglas_cambiadas, total_cambios}, dependencias_no_disponibles}. Delta entre revisiones (L9): le da al asesor SOLO lo que cambio desde su ultimo visto bueno. Lee las fuentes por EVENTO (contabilidad.diario.leer.request, contabilidad.ajuste.leer.request, contabilidad.regla_movimiento.leer.request); lo que no responde se DECLARA. Exito publica contabilidad.delta_revision_calculado y responde por contabilidad.firma.delta.response; error → contabilidad.firma.delta.failed. |
| `project.activated` | `onProjectActivated` | Restaura del storage (PosPersistencia) las firmas, marcas y solicitudes del proyecto activado: el circuito de firma es POR PROYECTO y append-only. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.firma_registrada` | Fire-and-forget (L3): el ASESOR puso su marca (revisado/firma) y el sistema la REGISTRO → {project_id, marca\|marca_firma:{alcance, nivel, firmado_en, hash_alcance}, el_sistema_no_firma:true}. Lo consume aviso-revision (A8.2) y la cara de firma del asesor. |
| `contabilidad.delta_revision_calculado` | Fire-and-forget (L9): el delta desde la ultima firma quedo calculado → {project_id, alcance, desde_ultima_firma, delta:{asientos_nuevos, ajustes, reglas_cambiadas, total_cambios}}. Da al asesor solo lo que cambio desde su ultimo visto bueno. |
| `contabilidad.firma.marcar.failed` | Par de fallo determinista: marcar/firmar sin project_id/alcance, con rol != ASESOR (409 ERROR_DOS_ESCRITORES) o con fecha_limite vencida (409 ERROR_FIRMA_EXPIRADA). Cierra el circulo de contabilidad.firma.marcar.request. |
| `contabilidad.firma.delta.failed` | Par de fallo determinista: delta sin project_id. Cierra el circulo de contabilidad.firma.delta.request. |
| `contabilidad.firma_registrada.failed` | Par de fallo del evento de dominio contabilidad.firma_registrada: la emision del hecho de dominio no se completo. |
| `contabilidad.delta_revision_calculado.failed` | Par de fallo del evento de dominio contabilidad.delta_revision_calculado: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.firma.marcar.failed` cierra `contabilidad.firma.marcar.request`;
> `contabilidad.firma.delta.failed` cierra `contabilidad.firma.delta.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.firma.marcar.response` y `contabilidad.firma.delta.response` (los pares
> response de los RPC); **NO están declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el
> par de fallo real es `<op>.failed`) — `contabilidad.firma_registrada.failed` y
> `contabilidad.delta_revision_calculado.failed` son los pares de fallo de los eventos de
> DOMINIO; el custodio solo publica los pares `*.failed` de sus RPC.

> Nota de sub-declaración: `_solicitar` (arma el expediente de firma, PENDIENTE) **NO está
> expuesto por ningún RPC** — solo como tool `toolSolicitar`. Como la EXPIRACIÓN
> (`409 ERROR_FIRMA_EXPIRADA`) se apoya en `d.solicitudes[alcance]`, sin una solicitud
> previa la expiración solo se dispara si el payload trae `fecha_limite` vencida.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.diario.leer.request` (escritor-diario B2),
> `contabilidad.ajuste.leer.request` (asiento-ajuste B5) y
> `contabilidad.regla_movimiento.leer.request` (A6.2/E8); dependencias por EVENTO no
> declaradas como publishers.

## Reglas de negocio

1. **EL SISTEMA NO FIRMA (L3)**: toda respuesta de `marcar` declara `el_sistema_no_firma:true`
   y `sistema_solo_registra:true`. El sistema **arma, entrega y registra**; el acto de
   firma es del asesor. El guard `_verificarEscritorUnico` exige `rol === 'ASESOR'`
   (normalizado a mayúsculas).
2. **El mensaje del guard lo dice**: `'el circuito de firma tiene UN escritor: solo el
   ASESOR marca y firma; el sistema NO firma'` con `{ escritor_vigente:'ASESOR',
   rol_intentado, simbolico:'ERROR_DOS_ESCRITORES', el_sistema_no_firma:true }`.
3. **Dos actos, un circuito**: `_procesarMarca` lee `op` (por defecto `'FIRMA'`); si es
   `'REVISADO'` o `'MARCAR_REVISADO'` → `_marcarRevisado`; cualquier otro → `_firmar`.
4. **El alcance es DECLARABLE y se deriva del nivel**: `_alcanceDe` usa `alcance`/
   `id_alcance` si vienen; si no, compone `PERIODO:<periodo>` / `ESTADO:<estado>` /
   `DOCUMENTO:<documento>` según el `nivel` (`_nivelDe`, por defecto `PERIODO`). Un nivel
   fuera de `{PERIODO, ESTADO, DOCUMENTO}` → `null`. Sin alcance → `400 INVALID_INPUT
   alcance`.
5. **EXPIRACIÓN (invariante dura)**: `_estaExpirada` — si la solicitud ya está `EXPIRADA`
   → `409 ERROR_FIRMA_EXPIRADA`; si `fecha_limite` (la del payload o la de la solicitud)
   es anterior a hoy (corte por `YYYY-MM-DD`) → marca la solicitud como `EXPIRADA`, deja
   `expirada_en` y devuelve `409 ERROR_FIRMA_EXPIRADA` con `{ alcance, fecha_limite,
   estado:'EXPIRADA', accion:'RE_SOLICITAR', asumida:false }`. **El sistema nunca asume el
   visto bueno por silencio.**
6. **La marca de revisado**: `_marcarRevisado` crea `{ tipo:'REVISADO', alcance, nivel,
   periodo, estado, documento, rol:'ASESOR', quien, cuando, secuencia, fecha_limite,
   el_sistema_no_firma:true, borrable:false }`, la empuja a `d.marcas` y la guarda en
   `d.firmas[alcance]`. Responde `{ marca:{ tipo:'REVISADO', alcance, nivel, cuando },
   registrado_por_sistema:true, el_sistema_no_firma:true, n_marcas }`.
7. **La firma (marca de firma)**: `_firmar` crea `{ alcance, nivel, rol_firmante:'ASESOR',
   firmante, firmado_en, secuencia, hash_alcance, el_sistema_no_firma:true,
   sistema_solo_registra:true, borrable:false }`; `hash_alcance` = hash determinista de
   `${pid}|${alcance}|${ahora}` (helper `_hash`, base-31 → hex `f<...>`). Actualiza
   `d.ultima_firma[alcance]` (la referencia para el delta). Responde `{ marca_firma,
   nivel_declarable, n_marcas, ... }`.
8. **Secuencia monótona y append-only**: `d.marcas` solo crece (`secuencia = length + 1`);
   las marcas son `borrable:false`. La secuencia es la prueba de orden temporal.
9. **El DELTA (L9)**: `_calcularDelta` — alcance (payload o `_alcanceDe`); `desde` =
   `input.desde` o `ultima_firma.firmado_en`. Lee las tres fuentes por EVENTO si no vienen
   en payload (`asientos`/`diario`, `ajustes`, `reglas`/`reglas_cambiadas`); lo que no
   responde se añade a `dependencias_no_disponibles` (`'escritor-diario'`,
   `'asiento-ajuste'`, `'regla-contrapartida/regla-movimiento-bancario'`). Filtra cada
   fuente por fecha (`asentado_en`/`actualizado_en`/`fecha`; reglas por `declarado_en`):
   solo lo **posterior o igual** a `desde`. Devuelve `delta:{ asientos_nuevos, ajustes,
   reglas_cambiadas, total_cambios, n_* }`.
10. **Lo que no responde SE DECLARA**: `dependencias_no_disponibles` aparece en el `data`
    del delta. **No se inventa el cambio.**
11. **La firma es POR PROYECTO**: `store[pid]` con `{ esquema:'contabilidad-flujo-firma-v1',
    firmas, marcas, ultima_firma, solicitudes, escritor:'ASESOR' }`. Sin restaurar
    (`project.activated`) la secuencia y el delta no se pueden garantizar.
12. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
    sin alcance → `400 INVALID_INPUT alcance`. Shape: `{ status:400, error:{
    code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
13. **HTTP exacto**: éxito `200`; payload inválido → `400`; segundo escritor → `409`;
    firma expirada → `409`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.firma.marcar.response` y
`contabilidad.firma.delta.response`.

### 1. `marcar` — el ASESOR firma; el sistema REGISTRA

```json
{
  "project_id": "e57a318a-...",
  "rol": "ASESOR",
  "op": "FIRMA",
  "nivel": "PERIODO",
  "periodo": "2026-09",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "op": "firmar",
  "marca_firma": { "alcance": "PERIODO:2026-09", "nivel": "PERIODO", "periodo": "2026-09", "estado": null, "documento": null, "rol_firmante": "ASESOR", "firmante": "ASESOR", "firmado_en": "2026-09-30T09:00:00.000Z", "secuencia": 1, "hash_alcance": "f1a2b3c4", "el_sistema_no_firma": true, "sistema_solo_registra": true, "borrable": false },
  "el_sistema_no_firma": true,
  "sistema_solo_registra": true,
  "nivel_declarable": "PERIODO",
  "n_marcas": 1
}
```

Emite `contabilidad.firma_registrada` (res.data + `correlation_id`).

### 2. `marcar` — marca de REVISADO (sin firmar)

```json
{ "project_id": "e57a318a-...", "rol": "ASESOR", "op": "REVISADO", "nivel": "DOCUMENTO", "documento": "FAC-2026-0001" }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "op": "marcar", "marca": { "tipo": "REVISADO", "alcance": "DOCUMENTO:FAC-2026-0001", "nivel": "DOCUMENTO", "cuando": "..." }, "registrado_por_sistema": true, "el_sistema_no_firma": true, "n_marcas": 1 }
```

### 3. `delta` — lo que cambió desde el último visto bueno

```json
{
  "project_id": "e57a318a-...",
  "alcance": "PERIODO:2026-09",
  "desde": "2026-09-15T00:00:00.000Z",
  "asientos": [ { "id": "A9", "asentado_en": "2026-09-20T10:00:00.000Z" } ],
  "ajustes": [],
  "reglas": [ { "id": "R1", "declarado_en": "2026-09-18T10:00:00.000Z" } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "alcance": "PERIODO:2026-09",
  "desde_ultima_firma": "2026-09-15T00:00:00.000Z",
  "ultima_firma": { "alcance": "PERIODO:2026-09", "firmado_en": "2026-09-15T00:00:00.000Z", "hash_alcance": "...", "secuencia": 1, "nivel": "PERIODO" },
  "delta": { "asientos_nuevos": [ { "id": "A9", "asentado_en": "2026-09-20T10:00:00.000Z" } ], "n_asientos_nuevos": 1, "ajustes": [], "n_ajustes": 0, "reglas_cambiadas": [ { "id": "R1", "declarado_en": "2026-09-18T10:00:00.000Z" } ], "n_reglas_cambiadas": 1, "total_cambios": 2 },
  "dependencias_no_disponibles": [],
  "determinista": true,
  "nota": "el delta da al asesor SOLO lo que cambio desde su ultimo visto bueno"
}
```

Emite `contabilidad.delta_revision_calculado` (res.data + `correlation_id`).

### 4. Fallo — rol no ASESOR → 409

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "periodo": "2026-09" }
```

Respuesta `409` + `contabilidad.firma.marcar.failed`:

```json
{ "status": 409, "error": { "code": "ERROR_DOS_ESCRITORES", "message": "el circuito de firma tiene UN escritor: solo el ASESOR marca y firma; el sistema NO firma", "details": { "escritor_vigente": "ASESOR", "rol_intentado": "OPERADOR", "simbolico": "ERROR_DOS_ESCRITORES", "el_sistema_no_firma": true } } }
```

### 5. Fallo — vence sin firma → EXPIRA (no se asume)

```json
{ "project_id": "e57a318a-...", "rol": "ASESOR", "nivel": "PERIODO", "periodo": "2026-08", "fecha_limite": "2026-08-31" }
```

(la fecha ya pasó) → Respuesta `409` + `contabilidad.firma.marcar.failed`:

```json
{ "status": 409, "error": { "code": "ERROR_FIRMA_EXPIRADA", "message": "la firma del alcance PERIODO:2026-08 vencio sin respuesta: EXPIRA y se re-pregunta", "details": { "alcance": "PERIODO:2026-08", "fecha_limite": "2026-08-31", "estado": "EXPIRADA", "accion": "RE_SOLICITAR", "asumida": false } } }
```

### 6. Fallo — payload inválido

```json
{ "project_id": "e57a318a-...", "rol": "ASESOR" }
```

→ `400 INVALID_INPUT alcance` + `contabilidad.firma.marcar.failed`.

### 7. Tools (sin RPC en module.json)

`toolMarcarRevisado` → `_marcarRevisado`; `toolFirmar` → `_firmar`; `toolSolicitar` →
`_solicitar`; `toolCalcularDelta` → `_calcularDelta`.

## Tests

El test viviría en `tests/unit/flujo-firma.test.js`. Cubre:

- `marcar` con `rol:'ASESOR'` → `200`, `el_sistema_no_firma:true`,
  `sistema_solo_registra:true`, `marca_firma.hash_alcance` presente; emite
  `contabilidad.firma_registrada`.
- `op:'REVISADO'` → marca de revisado (no firma).
- **Single-writer**: rol distinto de `ASESOR` → `409 ERROR_DOS_ESCRITORES`.
- **EXPIRACIÓN**: marca sobre un alcance con `fecha_limite` vencida → `409
  ERROR_FIRMA_EXPIRADA` con `accion:'RE_SOLICITAR'`, `asumida:false`; la solicitud queda
  `EXPIRADA`.
- `delta` con `desde` explícito → filtra asientos/ajustes/reglas posteriores; emite
  `contabilidad.delta_revision_calculado`.
- **Dependencia tolerante**: sin fuentes en el payload y el bus mudo →
  `dependencias_no_disponibles:['escritor-diario','asiento-ajuste','regla-contrapartida/regla-movimiento-bancario']`,
  sin inventar cambios.
- Sin `project_id`/`alcance` → `400 INVALID_INPUT` + par `*.failed`.
- `project.activated` restaura firmas/marcas/solicitudes vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/flujo-firma
node --test tests/unit/flujo-firma.test.js
```

## Notas de implementación

- Clase `FlujoFirma extends ModuloHibridoReflejo`; `name = 'flujo-firma'`,
  `version = 'reflejo-0.1.0'` (aunque es **custodio**: conserva el versionado reflejo, es
  el patrón real de la vertical). Store en memoria `this._store` (Map project_id →
  `{ esquema:'contabilidad-flujo-firma-v1', firmas:{}, marcas:[], ultima_firma:{},
  solicitudes:{}, escritor:'ASESOR' }`).
- Constantes: `ROL_ASESOR = 'ASESOR'`, `CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES'`,
  `CODE_FIRMA_EXPIRADA = 'ERROR_FIRMA_EXPIRADA'`, `NIVELES = {PERIODO, ESTADO,
  DOCUMENTO}`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file: 'flujo-firma.json',
  dir: '/contabilidad/flujo-firma', snapshot, hidratar })`. `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Cada mutación marca
  `marcarDirty(pid)`.
- `onMarcarRequest`/`onDeltaRequest` delegan en `_atender(e, '<op>', 'contabilidad.firma.<op>.response',
  fn)`; publican el evento de dominio si `status === 200` y el par `*.failed` si no.
- Proyecciones puras: `_marcarRevisado`, `_firmar`, `_solicitar`, `_calcularDelta` (async),
  `_estaExpirada`, `_verificarEscritorUnico`, `_nivelDe`, `_alcanceDe`, `_hash`
  (+ `_obtenerOCrear`). `_rpc`, `_invalid`, `_errorResponse` vienen de la base.
- Tools: `toolMarcarRevisado`, `toolFirmar`, `toolSolicitar`, `toolCalcularDelta`.
- DEP hacia delante: `contabilidad.firma_registrada` lo consume `aviso-revision` (A8.2) y
  la cara de firma del asesor. DEP hacia atrás por evento: `escritor-diario` (B2),
  `asiento-ajuste` (B5) y `regla-contrapartida` (A6.2) / `regla-movimiento-bancario` (E8).
