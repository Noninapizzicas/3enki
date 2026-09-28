---
name: partida-no-identificada
description: >
  Skill FULL del módulo MICRO-AGENTE `partida-no-identificada` de la vertical contabilidad
  de Enki (E7, hoja del plan). EL JUICIO: el movimiento SIN contrapartida llega con
  DESCRIPCIÓN AMBIGUA → INTERPRETAR (comisión / interés / devolución / transferencia /
  impuesto). Una vez existe la regla (E8 regla-movimiento-bancario), la partida pasa a
  AUTOMÁTICO; lo NO reconocible → excepción a la cola de revisión (A8.1) — NUNCA se ignora
  el movimiento. Aquí PROPONE, no escribe el libro: la contrapartida reconocida se PUBLICA
  (contabilidad.partida_clasificada) y la desconocida se ENCOLA
  (contabilidad.excepcion.encolar.request). Mitad REFLEJO determinista (lee las reglas de E8
  por EVENTO, matching de patrón, grado de ambigüedad, clasificación por señales del texto)
  + mitad FUZZY en el cajón de blueprint (el LLM que interpreta la descripción cuando no hay
  regla). SI PERSISTE: su memoria de lo reconocido es APRENDIZAJE. Úsala para operar,
  depurar o extender el micro-agente, o para entender su contrato de eventos y sus reglas de
  negocio.
when-to-use: >
  - Cuando necesites interpretar una partida bancaria ambigua (RPC
    contabilidad.partida.reconocer.request) o entran movimientos sin cruzar (fire-and-forget
    contabilidad.movimiento_sin_cruzar de conciliacion-bancaria E1).
  - Cuando depures por qué una partida no se reconoce (409 SIN_REGLA → va a la cola A8.1,
    503 DEPENDENCIA_NO_DISPONIBLE si E8 no responde, 400 INVALID_INPUT) o por qué no se
    confirma el encolado (contabilidad.excepcion.encolar.failed).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), por qué el juicio
    vive aquí y no en el reflejo de conciliación, y por qué propone pero no decide.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente
    partida-no-identificada.
tags: [enki, modulo, micro-agente, persistencia, contabilidad, partida-no-identificada, juicio, fuzzy]
---

# partida-no-identificada — MICRO-AGENTE · el juicio de la partida bancaria ambigua

## Qué hace el módulo

`partida-no-identificada` es un **MICRO-AGENTE CON PERSISTENCIA** (E7, hoja del plan): **EL
JUICIO**. El movimiento **sin contrapartida** llega con **DESCRIPCIÓN AMBIGUA** →
**INTERPRETAR** (`COMISION` | `INTERES` | `DEVOLUCION` | `TRANSFERENCIA` | `IMPUESTO` |
`OTRO`). Una vez existe la **regla** (E8 `regla-movimiento-bancario`, custodio), la partida
pasa a **AUTOMÁTICO**; lo **NO reconocible** → **excepción a la cola de revisión (A8.1)** por
su puerta única; **NUNCA se ignora el movimiento**.

Aquí **PROPONE, no escribe el libro**: la contrapartida reconocida se **PUBLICA**
(`contabilidad.partida_clasificada`) y la desconocida se **ENCOLA**
(`contabilidad.excepcion.encolar.request`). **MICRO-AGENTE (patrón híbrido real)**: mitad
**REFLEJO determinista** (lectura de las reglas de E8 por EVENTO
`contabilidad.regla_movimiento.leer.request`, *matching* de patrón, grado de ambigüedad,
clasificación por señales del texto) + mitad **FUZZY** en el cajón de blueprint del módulo
(el LLM que interpreta la descripción cuando no hay regla; el gate
`scripts/validate-hibridos.js` exige que la op fuzzy **NO** vaya en
`module.json.subscribes`).

**SÍ PERSISTE**: su memoria de lo reconocido es **APRENDIZAJE** — evita re-interpretar el
mismo movimiento, es la **EVIDENCIA** de la regla que E8 aprende (*«esta comisión → esta
cuenta»*) y la base de la explicación; por eso lleva **PosPersistencia** + `project.activated`.
**NO escribe** el repositorio de reglas de E8 (custodio single-writer): solo **LEE** por
EVENTO y **PUBLICA la regla candidata** (`estado:'RATIFICACION_PENDIENTE'`, `actua:false`)
para que E8/desatasco la hidraten y L10 la ratifique. La contrapartida **SIEMPRE se propone**
(`propone_no_decide:true`): **no se inventa la cuenta**.

> **NO REUTILIZA**: la interpretación de partidas bancarias es propia; no existe en el
> inventario.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.partida.reconocer.request` | `onReconocerRequest` | RPC micro-agente: {project_id, movimiento:{descripcion, importe, fecha_valor, clave_natural, tercero}} → {project_id, clave_natural, tipo:'COMISION'\|'INTERES'\|'DEVOLUCION'\|'TRANSFERENCIA'\|'IMPUESTO'\|'OTRO', contrapartida, origen:'REGLA'\|'TEXTO', regla_id, confianza, ambiguedad, propone_no_decide:true, justificacion, regla_candidata?}. La regla de E8 manda (se lee por EVENTO); sin regla, el juicio clasifica por señales del texto. Lo NO reconocible → 409 SIN_REGLA: no se inventa la contrapartida y el movimiento va a la cola (A8.1) — NUNCA se ignora. Exito publica contabilidad.partida_clasificada y responde por contabilidad.partida.reconocer.response; si E8 no responde → 503 DEPENDENCIA_NO_DISPONIBLE; error → contabilidad.partida_clasificada.failed. |
| `contabilidad.movimiento_sin_cruzar` | `onMovimientoSinCruzar` | Fire-and-forget (E1 → E7): conciliacion-bancaria entrego los movimientos del extracto SIN contrapartida en el libro → {project_id, movimientos:[MovimientoBancario], n}. Se INTERPRETA cada partida (aqui vive el juicio): las reconocidas publican contabilidad.partida_clasificada; las desconocidas se ENCOLAN publicando contabilidad.excepcion.encolar.request (contabilidad.excepcion.encolar.failed si la cola no confirma). El movimiento nunca se ignora. |
| `project.activated` | `onProjectActivated` | Restaura la memoria del juicio (partidas reconocidas y encoladas) del proyecto activado desde el storage (PosPersistencia): es APRENDIZAJE por proyecto. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.partida_clasificada` | Fire-and-forget (E7): una partida bancaria quedo CLASIFICADA (por regla de E8 o interpretando el texto) → {project_id, clave_natural, tipo, contrapartida, cuenta, tercero, origen:'REGLA'\|'TEXTO', regla_id, confianza, ambiguedad, propone_no_decide:true, justificacion}. PROPONE, no decide: la contrapartida se asienta por el libro (B2) y el corte duro lo fija E8. |
| `contabilidad.excepcion.encolar.request` | Señal a la cola (E7 → A8.1): la partida NO reconocida se encola con motivo PARTIDA_NO_RECONOCIDA (naturaleza BANCARIA, cola ASESOR) → {project_id, cola:'ASESOR', excepcion:{id, naturaleza, motivo, ambiguedad, movimiento, no_inventa_cuenta:true}, encolada:true}. Lo consume cola-revision (A8.1) por su puerta unica. NO se ignora el movimiento. |
| `contabilidad.partida_clasificada.failed` | Par de fallo determinista: reconocer sin project_id/movimiento (400), partida no reconocible (409 SIN_REGLA, va a la cola) o regla-movimiento-bancario (E8) no disponible (503 DEPENDENCIA_NO_DISPONIBLE: no se interpreta a ciegas). Cierra el circulo de contabilidad.partida.reconocer.request. |
| `contabilidad.excepcion.encolar.failed` | Par de fallo del encolado: cola-revision (A8.1) no confirmo el encolado de la partida no identificada (503 DEPENDENCIA_NO_DISPONIBLE) — se DECLARA, no se asume encolado. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.partida_clasificada.failed` cierra `contabilidad.partida.reconocer.request` (y
> el juicio de cada movimiento de `contabilidad.movimiento_sin_cruzar`);
> `contabilidad.excepcion.encolar.failed` cierra el encolado cuando A8.1 no confirma.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.partida.reconocer.response` (el par response del RPC); **NO está declarada en
> `publishes`**.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.regla_movimiento.leer.request` (dependencia por EVENTO hacia
> regla-movimiento-bancario E8) y `contabilidad.excepcion.encolar.request` (dependencia por
> EVENTO hacia cola-revision A8.1); ambas son peticiones request/response que el micro-agente
> emite, no declaradas como publishers aparte de la señal de encolado ya listada.

> Nota: `onReconocerRequest` en fallo `409 SIN_REGLA` ejecuta `_encolar` (publica
> `contabilidad.excepcion.encolar.request` o `.failed`) **y** publica
> `contabilidad.partida_clasificada.failed`. No hay eventos de dominio declarados sin
> emitir: los dos pares `.failed` declarados se publican desde el handler y desde `_encolar`.

## Reglas de negocio

1. **La REGLA de E8 manda (el juicio determinista)**: `_reglasActivas` lee
   `contabilidad.regla_movimiento.leer.request` (timeout 4000ms) y filtra las reglas con
   `estado` `'DECLARADA'` o `'RATIFICADA'`. Si **E8 no responde** → **`503
   DEPENDENCIA_NO_DISPONIBLE`** con `{ dependencia:'regla-movimiento-bancario',
   accion:'NO_CLASIFICAR_PUBLICAR_FALLO', clave_natural }` (*no se interpreta a ciegas*).
2. **Matching determinista regla ↔ movimiento**: `_reglaQueCubre` casa la regla cuyo `patron`
   (objeto clave→valor) coincida **exactamente** con el movimiento (`every` sobre las claves).
   Con regla → clasificación `origen:'REGLA'`, `confianza:1`, `automatico:true`, `tipo` y
   `contrapartida` tomados de `regla.contrapartida`.
3. **Sin regla, se interpreta el TEXTO por señales**: `_clasificarTexto` normaliza
   `descripcion`/`concepto` a minúsculas y busca las `SENALES`:
   `COMISION` (comision/comisiones/mantenimiento/cuota), `INTERES` (interes/intereses/abono
   interes/liquidacion), `DEVOLUCION` (devolucion/devuelto/rechazo/impagado/devol.),
   `TRANSFERENCIA` (transferencia/transf/traspaso), `IMPUESTO` (impuesto/iva/aeat/agencia
   tributaria/retencion). Sin señal → `null`.
4. **Grado de AMBIGÜEDAD (determinista)**: `_gradoAmbiguedad` = `1 - presentes/6`, con seis
   señales: `descripcion`/`concepto`, `importe`, `fecha_valor`/`fecha`,
   `referencia`/`documento`, `contraparte`/`tercero`, `clave_natural`. `UMBRAL_AMBIGUEDAD =
   0.5` marca **ambigüedad ALTA**.
5. **Lo NO reconocible va a la COLA (nunca se inventa)**: si no hay tipo por texto (`!tipo`)
   **o** la ambigüedad es muy alta (`ambiguedad >= UMBRAL_AMBIGUEDAD * 2`) → **`409
   SIN_REGLA`** con `{ project_id, clave_natural, ambiguedad, ambiguedad_alta,
   senal:'excepcion_a_cola_revision', no_inventa_cuenta:true }`. El handler **encola** la
   excepción en A8.1 (`_encolar`) y publica `contabilidad.partida_clasificada.failed`. **El
   movimiento nunca se ignora.**
6. **PROPONE, no decide**: toda clasificación lleva **`propone_no_decide:true`**. La
   contrapartida se **propone** (`contrapartida:{ tipo, cuenta:null, tercero }`); **la cuenta
   NUNCA se inventa** (se queda `null` hasta que una regla la declare). El asiento lo fija el
   libro (B2) y el corte duro lo fija E8.
7. **La regla CANDIDATA se publica, no se escribe**: en clasificación por TEXTO,
   `_proponerRegla` produce `{ regla_id, repositorio:'regla-movimiento-bancario', patron:{
   descripcion_contiene, tipo }, contrapartida, estado:'RATIFICACION_PENDIENTE', actua:false,
   aportada_por:'PARTIDA_NO_IDENTIFICADA_E7', firma_del_sistema:false }`. **NO se escribe** el
   repositorio de E8; E8/desatasco la hidratan y L10 la ratifica.
8. **El encolado se DECLARA, no se asume**: `_encolar` construye la excepción
   `{ id, naturaleza:'BANCARIA', motivo:'PARTIDA_NO_RECONOCIDA', cola_destino:'ASESOR',
   ambiguedad, ambiguedad_alta, prioridad:'ALTA'|'NORMAL', movimiento, no_inventa_cuenta:true }`,
   la guarda en la memoria (APRENDIZAJE) y la envía a A8.1 por `_rpc`
   `contabilidad.excepcion.encolar.request` (timeout 4000ms). Si A8.1 **no confirma** (status
   != 200) → **`contabilidad.excepcion.encolar.failed`** con `DEPENDENCIA_NO_DISPONIBLE` y
   `{ cola, excepcion_id }` (*se DECLARA, no se asume encolado*); si confirma → publica
   `contabilidad.excepcion.encolar.request` con `encolada:true`.
9. **Fire-and-forget, un movimiento = un juicio**: `onMovimientoSinCruzar` recorre los
   `movimientos` y por cada uno llama a `_reconocer`; los clasificados publican
   `contabilidad.partida_clasificada`, los fallidos se encolan. Sin `project_id` o sin
   movimientos → retorna `null` sin publicar. Sin `movimiento`/`hecho` en el RPC → `400
   INVALID_INPUT movimiento`.
10. **La memoria es APRENDIZAJE**: `_guardarClasificacion` empuja cada clasificación a
    `d.reconocidas` (`{ clasificacion, reconocida_en }`); `_encolar` empuja cada excepción a
    `d.excepciones`. Es evidencia y base de la explicación (`justificacion` con `cifra`,
    `base`, `origen`, `confianza`, `ambiguedad`, `explicable:true`).
11. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
    `movimiento` ausente/no objeto → `400 INVALID_INPUT movimiento`. Shape: `{ status:400,
    error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
12. **HTTP exacto**: éxito `200`; payload inválido → `400`; no reconocible → `409 SIN_REGLA`
    (va a la cola); E8 no disponible → `503`; cola no confirma → `503` en
    `contabilidad.excepcion.encolar.failed`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC que responde en `contabilidad.partida.reconocer.response`.

### 1. `reconocer` — con regla de E8 que cubre el movimiento

```json
{
  "project_id": "e57a318a-...",
  "movimiento": { "descripcion": "COMISION MANTENIMIENTO", "importe": -12.5, "fecha_valor": "2026-09-20", "clave_natural": "2026-09-20|-12.5|COM-009", "tercero": "BANCO X" },
  "correlation_id": "abc-123"
}
```
(E8 declara la regla `patron:{descripcion:'COMISION MANTENIMIENTO'}` → `contrapartida:{cuenta:'626'}`)
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "clave_natural": "2026-09-20|-12.5|COM-009",
  "movimiento": { "descripcion": "COMISION MANTENIMIENTO", "importe": -12.5 },
  "tipo": "COMISION",
  "contrapartida": { "tipo": "COMISION", "cuenta": "626", "tercero": "BANCO X" },
  "cuenta": "626",
  "tercero": "BANCO X",
  "origen": "REGLA",
  "regla_id": "...-E8-comision",
  "confianza": 1,
  "ambiguedad": 0,
  "automatico": true,
  "propone_no_decide": true,
  "justificacion": { "cifra": "626", "base": "2026-09-20|-12.5|COM-009", "origen": "REGLA", "confianza": 1, "ambiguedad": 0, "explicable": true },
  "nota": "una regla de E8 ya cubre el movimiento"
}
```
Emite `contabilidad.partida_clasificada` (res.data + `correlation_id`).

### 2. `reconocer` — sin regla, interpreta el TEXTO (propone la cuenta en `null`)

```json
{ "project_id": "e57a318a-...", "movimiento": { "descripcion": "ABONO INTERESES", "importe": 3.2, "fecha_valor": "2026-09-30", "clave_natural": "2026-09-30|3.2|INT-1", "referencia": "INT-1", "tercero": "BANCO X" } }
```
Respuesta `200` (recortada):
```json
{
  "project_id": "e57a318a-...",
  "clave_natural": "2026-09-30|3.2|INT-1",
  "tipo": "INTERES",
  "contrapartida": { "tipo": "INTERES", "cuenta": null, "tercero": "BANCO X" },
  "cuenta": null,
  "origen": "TEXTO",
  "regla_id": null,
  "confianza": 1,
  "ambiguedad": 0,
  "automatico": false,
  "propone_no_decide": true,
  "regla_candidata": { "regla_id": "e57a318a-...-E7-2026-09-30|3.2|INT-1", "repositorio": "regla-movimiento-bancario", "patron": { "descripcion_contiene": "ABONO INTERESES", "tipo": "INTERES" }, "contrapartida": { "tipo": "INTERES", "cuenta": null, "tercero": "BANCO X" }, "estado": "RATIFICACION_PENDIENTE", "actua": false, "aportada_por": "PARTIDA_NO_IDENTIFICADA_E7", "firma_del_sistema": false },
  "nota": "interpretacion por señales del texto: la regla (E8) la hara automatica"
}
```

### 3. `reconocer` — lo NO reconocible → 409 SIN_REGLA (va a la cola)

```json
{ "project_id": "e57a318a-...", "movimiento": { "importe": -50, "clave_natural": "k-xyz" } }
```
Respuesta `409` + `contabilidad.partida_clasificada.failed` + `contabilidad.excepcion.encolar.request`
(la excepción se envía a A8.1):
```json
{ "status": 409, "error": { "code": "SIN_REGLA", "message": "el movimiento no se reconoce: no se inventa la contrapartida, va a la cola de revision", "details": { "project_id": "e57a318a-...", "clave_natural": "k-xyz", "ambiguedad": 0.67, "ambiguedad_alta": true, "senal": "excepcion_a_cola_revision", "no_inventa_cuenta": true } } }
```
La excepción encolada: `{ project_id, cola:'ASESOR', excepcion:{ id, naturaleza:'BANCARIA',
motivo:'PARTIDA_NO_RECONOCIDA', cola_destino:'ASESOR', ambiguedad, ambiguedad_alta:true,
prioridad:'ALTA', movimiento, no_inventa_cuenta:true }, encolada:true }`.

### 4. Fallo — E8 no responde → 503

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "regla-movimiento-bancario (E8) no respondio: no se interpreta a ciegas", "details": { "dependencia": "regla-movimiento-bancario", "accion": "NO_CLASIFICAR_PUBLICAR_FALLO", "clave_natural": "k-xyz" } } }
```

### 5. Fallo — la cola no confirma el encolado

Si A8.1 no confirma → `contabilidad.excepcion.encolar.failed`:
```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "cola-revision (A8.1) no confirmo el encolado de la partida no identificada", "details": { "cola": "ASESOR", "excepcion_id": "<id>" } }, "excepcion": { "...": "..." } }
```
*Se DECLARA, no se asume encolado.*

### 6. Entrada fire-and-forget — movimientos sin cruzar (E1 → E7)

Entra `contabilidad.movimiento_sin_cruzar` con `{ project_id, movimientos:[...], n }` → por
cada movimiento se juzga: los clasificados publican `contabilidad.partida_clasificada`, los
no reconocibles se encolan. Devuelve `{ status:200, data:{ project_id, n, resultados } }`.

### 7. Tools (sin RPC en module.json)

`toolReconocer` → `_reconocer`; `toolProponerContrapartida` → `_proponerContrapartida`;
`toolClasificarTexto` → `_clasificarTexto`.

## Tests

El test vive en `tests/unit/partida-no-identificada.test.js`. Cubre:

- `reconocer` con una regla de E8 que cubre el movimiento → `200`, `origen:'REGLA'`,
  `confianza:1`, `automatico:true`, `propone_no_decide:true`; emite
  `contabilidad.partida_clasificada`.
- **Sin regla, por señales del texto** → `origen:'TEXTO'`, `cuenta:null` (**no se inventa la
  cuenta**) y `regla_candidata` con `estado:'RATIFICACION_PENDIENTE'`/`actua:false`.
- **Lo no reconocible** → `409 SIN_REGLA` + `contabilidad.partida_clasificada.failed` +
  `contabilidad.excepcion.encolar.request` (excepción a la cola A8.1,
  `no_inventa_cuenta:true`).
- **Dependencia tolerante**: E8 no responde → `503 DEPENDENCIA_NO_DISPONIBLE`
  (`NO_CLASIFICAR_PUBLICAR_FALLO`).
- **La cola no confirma** → `contabilidad.excepcion.encolar.failed` (no se asume encolado).
- Fire-and-forget `contabilidad.movimiento_sin_cruzar` → juicio por cada movimiento; los no
  reconocibles se encolan (**nunca se ignoran**).
- Payload sin `project_id`/`movimiento` → `400 INVALID_INPUT`.
- **Persiste**: `project.activated` restaura la memoria (reconocidas/excepciones) vía
  PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/partida-no-identificada
node --test tests/unit/partida-no-identificada.test.js
```

## Notas de implementación

- Clase `PartidaNoIdentificada extends ModuloHibridoReflejo`; `name =
  'partida-no-identificada'`, `version = 'reflejo-0.1.0'`. Store en memoria `this._store`
  (Map project_id → `{ esquema:'contabilidad-partida-no-identificada-v1', reconocidas:[],
  excepciones:[] }`) — **es APRENDIZAJE del juicio**, no una parcela de dominio.
- Constantes: `TIPOS_PARTIDA = ['COMISION','INTERES','DEVOLUCION','TRANSFERENCIA','IMPUESTO',
  'OTRO']`, `NATURALEZA_EXCEPCION = 'BANCARIA'`, `COLA_DESTINO = 'ASESOR'`,
  `UMBRAL_AMBIGUEDAD = 0.5`, `SENALES` (comisión/interés/devolución/transferencia/impuesto).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'partida-no-identificada.json', dir: '/contabilidad/partida-no-identificada', snapshot,
  hidratar })`. `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` +
  `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onReconocerRequest` delega en `_atender(e, 'reconocer',
  'contabilidad.partida.reconocer.response', fn)`: en éxito publica
  `contabilidad.partida_clasificada`; en `SIN_REGLA` encola (`_encolar`) y publica
  `contabilidad.partida_clasificada.failed`; en otro fallo publica el par. `onMovimientoSinCruzar`
  es fire-and-forget (sin `_atender`) y publica por cada movimiento.
- Proyecciones puras: `_reconocer` (async: reglas E8 + texto + ambigüedad),
  `_proponerContrapartida`, `_clasificarTexto`, `_guardarClasificacion`, `_proponerRegla`,
  `_encolar` (async, EVENTO A8.1) + helpers `_reglasActivas` (async, EVENTO E8),
  `_reglaQueCubre`, `_gradoAmbiguedad`, `_obtenerOCrear`. `_rpc`/`_invalid`/`_errorResponse`
  vienen de la base.
- Tools: `toolReconocer`, `toolProponerContrapartida`, `toolClasificarTexto`.
- DEP hacia delante: `contabilidad.partida_clasificada` (propone, no decide) y
  `contabilidad.excepcion.encolar.request` (cola A8.1 `cola-revision`). DEP hacia atrás por
  evento: `conciliacion-bancaria` (E1) publica `contabilidad.movimiento_sin_cruzar`;
  `regla-movimiento-bancario` (E8) provee las reglas activas.
