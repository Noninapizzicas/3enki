---
name: cambio-desde-ultima-revision
description: >
  Skill FULL del módulo REFLEJO `cambio-desde-ultima-revision` de la vertical contabilidad de Enki.
  EL DELTA DESDE EL ÚLTIMO VISTO BUENO del asesor: asientos nuevos, ajustes y reglas cambiadas
  desde la última revisión, para que el asesor revise SOLO LO NUEVO. Determinista, sin estado.
  Úsala para operar, depurar o extender el reflejo, o para entender su contrato de eventos y
  sus reglas de negocio.
when-to-use: >
  - Cuando necesites el delta de revisión desde el último visto bueno (RPC
    cambio-desde-ultima-revision.delta.request).
  - Cuando depures por qué el delta sale `disponible:false` (no hay corte conocido: ni `desde`
    declarado ni `flujo-firma` L3 responde; 400 INVALID_INPUT si falta project_id) o por qué
    `sin_fecha`/`abierto.reglas` van poblados en vez de estimarse.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del delta (determinista, el sistema NO firma ni ratifica, dato ausente = desconocido).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo cambio-desde-ultima-revision.
tags: [enki, modulo, reflejo, contabilidad, cambio-desde-ultima-revision]
---

# cambio-desde-ultima-revision — REFLEJO STATELESS del delta de revisión

## Qué hace el módulo

`cambio-desde-ultima-revision` es un **REFLEJO STATELESS** (L9, hoja del plan): **EL DELTA
DESDE EL ÚLTIMO VISTO BUENO. Para que el asesor revise SOLO LO NUEVO.** Derivado determinista:
**asientos nuevos**, **ajustes** (los que rectifican) y **reglas cambiadas** desde la última
revisión del asesor. El asesor no re-revisa el volumen entero: revisa la **DIFERENCIA**.

Atributos del diseño: `firma:FlujoFirma`. Métodos: `delta():Delta`.

**DE DÓNDE SALE EL «DESDE»** (el corte del delta):

1. **`flujo-firma` (L3) POR EVENTO** (`flujo-firma.estado.request`): la última firma del ámbito
   da `revisado_en`. Si L3 responde que **NO hay firma**, se declara `sin_revision_previa:true`
   (un **HECHO declarado** por el custodio de la firma, no una suposición) y entonces **todo el
   material** está sin revisar.
2. **`desde` DECLARADO** en la petición.
3. Si **ni L3 responde ni se declara `desde`** → NO hay «última revisión»: el delta se declara
   **NO DISPONIBLE** (`disponible:false`, `abierto.desde`). **Nada se estima.**

Invariantes:

- **DETERMINISTA**: mismos asientos + misma última revisión + mismas reglas → mismo delta.
- **Dato ausente = desconocido**: un asiento **SIN fecha** no se puede ordenar contra el corte y
  va **aparte** en `sin_fecha` (no se asume ni nuevo ni viejo); sin los **DOS conjuntos** de
  reglas declarados no hay diff de reglas (`abierto.reglas`).
- **NO escribe, NO persiste, NO muta y NO decide**: el delta es un **DERIVADO**. Revisar es del
  asesor; **el sistema NO firma ni da el visto bueno** (`firma_del_sistema:false`) — eso es de
  L3 (`flujo-firma`).
- Los asientos se reciben **declarados** o se **PIDEN** al diario (`escritor-diario` B2) POR EVENTO.
- **Es BAJO DEMANDA y stateless**: las señales `contabilidad.firma_registrada` (L3),
  `contabilidad.asiento_registrado` (B2) y `contabilidad.asiento_ajuste_recibido` (B5) solo se
  **loguean** — NO acumula ni lanza deltas proactivos.
- **Sin `PosPersistencia` y sin `project.activated`**: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `cambio-desde-ultima-revision.delta.request` | `onDeltaRequest` | RPC reflejo (delta puro, determinista): {project_id, ambito?, desde?, asientos?\|libro?, periodo?, reglas_actuales?\|reglas?, reglas_previas?} → {project_id, tipo:'cambio-desde-ultima-revision', disponible, desde, fuente_desde, sin_revision_previa, asientos_nuevos:[{numero, clave_natural, fecha, concepto, tipo, rectifica_a, importe}], ajustes, reglas_cambiadas:[{tipo_cambio:'nueva'\|'modificada'\|'retirada', regla, anterior}], sin_fecha, num_asientos_nuevos, num_ajustes, num_reglas_cambiadas, importe_delta, requiere_revision, revisar, firma_del_sistema:false, abierto}. El corte `desde` se declara o se PIDE a flujo-firma (L3) POR EVENTO; sin corte conocido el delta va disponible:false. Exito → publica contabilidad.delta_revision y responde por cambio-desde-ultima-revision.delta.response; project_id ausente → cambio-desde-ultima-revision.delta.failed. |
| `contabilidad.firma_registrada` | `onFirmaRegistrada` | Fire-and-forget (L3 → L9): el asesor dio su visto bueno → se deja constancia en el log de que el corte del delta se ha movido. El delta es BAJO DEMANDA y el reflejo es stateless: NO acumula ni lanza deltas proactivos. Tolerante: sin project_id se ignora. |
| `contabilidad.asiento_registrado` | `onAsientoRegistrado` | Fire-and-forget (B2 → L9): un asiento quedo registrado → material nuevo que entrara en el proximo delta. Solo se loguea; el reflejo es stateless y no acumula. Tolerante: sin project_id se ignora. |
| `contabilidad.asiento_ajuste_recibido` | `onAsientoAjusteRecibido` | Fire-and-forget (B5 → L9): un ajuste entro al libro → cambio que el asesor debe ver en su delta. Solo se loguea; el reflejo es stateless y no acumula. Tolerante: sin project_id se ignora. |

### Publishes

| Evento | Descripción |
|---|---|
| `cambio-desde-ultima-revision.delta.response` | Respuesta RPC correlada de cambio-desde-ultima-revision.delta.request → {request_id, status:200, data:{disponible, desde, fuente_desde, sin_revision_previa, asientos_nuevos, ajustes, reglas_cambiadas, sin_fecha, num_*, importe_delta, requiere_revision, revisar, firma_del_sistema:false, abierto}}. Emitida por el helper _atender. |
| `cambio-desde-ultima-revision.delta.failed` | Par de fallo determinista (L9): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de cambio-desde-ultima-revision.delta.request. |
| `contabilidad.delta_revision` | Fire-and-forget (L9): hubo delta desde el ultimo visto bueno → {project_id, desde, fuente_desde, sin_revision_previa, num_asientos_nuevos, num_ajustes, num_reglas_cambiadas, importe_delta, requiere_revision, abierto, correlation_id}. Lo LEEN la vista revisable (L2) y la capa de avisos (K2) para poner el ojo solo en lo nuevo. NO es una revision ni una firma: el sistema no ratifica nada. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `cambio-desde-ultima-revision.delta.failed` cierra el círculo de
> `cambio-desde-ultima-revision.delta.request` cuando `_delta` devuelve status ≠ 200
> (`400 INVALID_INPUT` por `project_id` ausente).

> Nota: `onFirmaRegistrada`, `onAsientoRegistrado` y `onAsientoAjusteRecibido` **no** usan
> `_atender`: delegan en `_senal(evento, e)`, que **solo registra un `logger.info`** y devuelve
> `null`. **No guardan nada** (L9 es stateless), no publican evento de dominio y no tienen par
> `failed` (no son peticiones). Sin `project_id` → `null`.

## Reglas de negocio

1. **El CORTE se declara o se pide a L3**: `input.desde` no vacío → `_fecha(desde)`,
   `fuente_desde:'declarada'`. Si no, `_rpc('flujo-firma.estado.request', {project_id, ambito},
   {timeout_ms:4000})`; con `revisado === true || estado === 'FIRMADA'` y `firma` →
   `desde = firma.revisado_en`, `fuente_desde:'flujo-firma'`. Si la firma vigente no declara
   `revisado_en` → `abierto.desde` («la firma vigente no declara revisado_en»).
2. **`sin_revision_previa` es un HECHO, no una suposición**: si L3 responde
   `estado ∈ {SIN_SOLICITUD, PENDIENTE}` o `revisado === false` → `sin_revision_previa:true`,
   `desde:null` y `revisar:'todo (no hay revision previa declarada)'`. **Jamás se inventa un
   visto bueno.**
3. **Sin corte y sin `sin_revision_previa`** → `delta` **no derivable**: `disponible:false`,
   `revisar:'solo lo nuevo (delta no derivable)'`, `abierto.desde` declarado. **No se estima.**
4. **Los ASIENTOS se declaran o se piden a B2**: `input.asientos`/`input.libro` (array o
   `{asientos:[]}`) → `fuente:'declarados'`; si no, `_rpc('escritor-diario.asientos.request',
   {project_id, periodo})`. Sin materiales → `disponible:false`, `abierto.asientos` declarado.
5. **Los asientos SIN fecha van aparte**: `_fechaDe(a)` = `a.fecha ?? a.fecha_asiento`; sin fecha
   válida → a `sin_fecha` y **NO se ordena contra el corte** (no se asume ni nuevo ni viejo).
6. **Con `sin_revision_previa:true`, TODO está sin revisar**: no se filtra por fecha — el asesor
   nunca dio el visto bueno, así que el material entero entra en `asientos_nuevos`.
7. **Los AJUSTES son los asientos nuevos que rectifican**: `nuevos.filter(a => a.rectifica_a
   !== null || String(a.tipo) === 'asiento-ajuste')` (**append-only**: no borran el original).
8. **El DIFF de reglas exige los DOS conjuntos declarados**: `reglas_actuales`/`reglas` y
   `reglas_previas`. Sin ambos → `reglas_cambiadas:[]` y `abierto.reglas` (no se supone que
   cambió). La identidad de regla es `id → clave → nombre`; tipos de cambio: `nueva`,
   `modificada` (si `JSON.stringify` difiere) y `retirada` (en previas pero no en actuales).
9. **`importe_delta`**: la suma de los importes de `asientos_nuevos`; cada importe es el
   **declarado** (`importe`/`total`/`suma_debe`, o el mayor apunte) — **NO se recalcula el asiento**.
   Sin ningún importe → `null`.
10. **`requiere_revision` = `nuevos.length > 0 || reglas.cambiadas.length > 0`**. El delta **DICE**
    si hay algo que revisar; **no revisa ni aprueba** (`firma_del_sistema:false`,
    `revisa:'asesor (L3 flujo-firma)'`).
11. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`).
12. **HTTP exacto**: éxito `200` (también con `disponible:false`); `project_id` ausente → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `cambio-desde-ultima-revision.delta.response`. Con éxito publica
`contabilidad.delta_revision` (consumido por la vista revisable L2 y la capa de avisos K2).

### 1. `delta` — corte declarado + asientos declarados

```json
{
  "project_id": "e57a318a-...",
  "desde": "2026-09-01",
  "asientos": [
    { "numero": 10, "fecha": "2026-09-02", "concepto": "venta", "importe": 121.5, "tipo": "venta" },
    { "numero": 11, "fecha": "2026-09-03", "concepto": "ajuste", "importe": 30, "tipo": "asiento-ajuste", "rectifica_a": 10 },
    { "numero": 12, "concepto": "sin fecha", "importe": 5 }
  ],
  "reglas_actuales": [ { "id": "R1", "patron": "411→410" }, { "id": "R2", "patron": "nueva" } ],
  "reglas_previas":  [ { "id": "R1", "patron": "411→400" } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200` (resumen): `disponible:true`, `desde:'2026-09-01'`,
`fuente_desde:'declarada'`, `asientos_nuevos:[#10,#11]` (ambos con fecha > corte),
`ajustes:[#11]` (rectifica a 10), `reglas_cambiadas:[{tipo_cambio:'modificada', regla:R1},
{tipo_cambio:'nueva', regla:R2}]`, `sin_fecha:[#12]`, `num_asientos_nuevos:2`, `num_ajustes:1`,
`num_reglas_cambiadas:2`, `requiere_revision:true`, `revisar:'solo lo nuevo'`,
`firma_del_sistema:false`, `abierto:{desde:null, reglas:null, asientos_sin_fecha:'hay 1
asiento(s) sin fecha...'}`.

### 2. `delta` — sin corte conocido → `[ABIERTO]`

Sin `desde` y con `flujo-firma` (L3) que no responde, con asientos declarados:
`disponible:false`, `revisar:'solo lo nuevo (delta no derivable)'`, `abierto.desde:'no se
declaro `desde` y flujo-firma (L3) no respondio: no se conoce el ultimo visto bueno'`.
**Nada se estima.**

### 3. `delta` — L3 declara que NO hay firma → todo sin revisar

Con `flujo-firma` respondiendo `estado:'SIN_SOLICITUD'` → `sin_revision_previa:true`,
`revisar:'todo (no hay revision previa declarada)'` y **todos** los asientos con fecha en
`asientos_nuevos`.

### 4. `delta` — sin reglas previas → diff de reglas `[ABIERTO]`

Con `reglas_actuales` pero sin `reglas_previas` → `reglas_cambiadas:[]` y
`abierto.reglas:'no se declararon las reglas actuales Y las de la ultima revision: sin los dos
conjuntos no hay diff de reglas (no se supone que cambio)'`.

### 5. Fire-and-forget — señales L3/B2/B5

`onFirmaRegistrada` (`contabilidad.firma_registrada`), `onAsientoRegistrado`
(`contabilidad.asiento_registrado`) y `onAsientoAjusteRecibido`
(`contabilidad.asiento_ajuste_recibido`) llaman a `_senal(evento, e)`, que **solo loguea** y
devuelve `null`. Sin `project_id` → `null`.

### 6. Fallo — falta `project_id`

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/cambio-desde-ultima-revision.test.js`. Cubre:

- `delta` con `desde` declarado + asientos → `200 disponible:true`, `asientos_nuevos` solo los
  posteriores al corte, `sin_fecha` aparte, `firma_del_sistema:false`.
- **Los ajustes** (con `rectifica_a` o `tipo:'asiento-ajuste'`) se listan aparte en `ajustes`
  (append-only: no borran el original).
- Corte pedido **por evento** a `flujo-firma` (L3) → `fuente_desde:'flujo-firma'` y
  `desde = firma.revisado_en`.
- L3 responde `SIN_SOLICITUD` → `sin_revision_previa:true` y **todo** el material sin revisar.
- Sin `desde` y L3 no responde → `disponible:false` + `abierto.desde` (**no se estima**).
- Sin `reglas_previas` → `reglas_cambiadas:[]` + `abierto.reglas` (**no se supone que cambió**).
- Diff de reglas: `nueva` / `modificada` / `retirada`.
- Asiento sin fecha → `sin_fecha` (no se ordena contra el corte).
- **Determinismo**: mismas entradas → mismo delta.
- `onFirmaRegistrada` / `onAsientoRegistrado` / `onAsientoAjusteRecibido` devuelven `null` y no
  mutan; sin `project_id` → `null`.
- `project_id` ausente → `400 INVALID_INPUT` + `cambio-desde-ultima-revision.delta.failed`.
- `toolDelta` devuelve la misma proyección que `_delta`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `CambioDesdeUltimaRevision extends ModuloHibridoReflejo`; `name =
  'cambio-desde-ultima-revision'`, `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store,
  sin `onProjectActivated` (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/cambio-desde-ultima-revision/`; es de la vertical **libro**).
- `onDeltaRequest` usa `this._atender(e, 'delta', 'cambio-desde-ultima-revision.delta.response',
  async (d) => {...})`: con `status === 200` publica `contabilidad.delta_revision`; en caso
  contrario publica `cambio-desde-ultima-revision.delta.failed`.
- Proyección `_delta(input)` (`async`: pide corte a L3 y asientos a B2 por evento); helpers
  `_ultimaRevision`, `_asientos`, `_reglasCambiadas`, `_resumen`, `_sumarImportes`, `_importe`,
  `_fechaDe`. Tool `toolDelta`.
- `_invalid` / `_rpc` / `_round` / `_num` / `_fecha` vienen de `modulo-hibrido-reflejo`.
- **DEP**: pide a `flujo-firma.estado.request` (L3) y `escritor-diario.asientos.request` (B2)
  **por EVENTO** (best-effort); observa `contabilidad.firma_registrada` (L3),
  `contabilidad.asiento_registrado` (B2) y `contabilidad.asiento_ajuste_recibido` (B5) como
  señales tolerantes.
- **EL SISTEMA NO DECIDE NI RATIFICA**: el delta es un DERIVADO; `firma_del_sistema:false` y
  `revisa:'asesor (L3 flujo-firma)'`. Revisar y firmar es del asesor (L3).
- **DATO AUSENTE = DESCONOCIDO**: sin corte conocido → `disponible:false`; sin fecha → `sin_fecha`;
  sin los dos conjuntos de reglas → `abierto.reglas`. Nada se estima.
