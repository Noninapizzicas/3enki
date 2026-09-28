---
name: acuse-presentacion
description: >
  Skill FULL del módulo PUENTE `acuse-presentacion` de la vertical contabilidad de Enki
  (D13, hoja del plan). EL SISTEMA NO PRESENTA. Aquí se RECIBE el justificante/acuse que
  la administración devuelve TRAS la presentación que hizo el ASESOR, y se LIGA a su
  modelo (estado-presentacion-fiscal D12) y a su asiento (escritor-diario B2): cierra el
  bucle hacia fuera. Sin acuse → obligación NO justificada → aviso; nunca se marca
  justificada sin justificante. El CANAL de recepción es DECLARABLE (MANUAL /
  DESCARGA_PROGRAMA / CORREO / API_ADMINISTRACION) y abierto (si falta → se CREA,
  `_conectarCanal`); sin canal declarado → 422 PRECONDITION_FAILED. Las credenciales van
  por credential-manager por EVENTO, jamás aquí. Stateless: sin PosPersistencia ni
  project.activated. La ligadura con D12 (avance a JUSTIFICADA) y con el libro es por
  EVENTO (contrato TOLERANTE: si no responden → se DECLARA y NUNCA se asume la obligación
  justificada o el acuse ligado). Úsala para operar, depurar o extender el puente, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites recibir/registrar el acuse de la presentación del asesor (RPC
    contabilidad.acuse.recibir.request) y ligarlo a su modelo y asiento.
  - Cuando depures por qué no se registra (422 PRECONDITION_FAILED si falta canal o
    modelo, 400 INVALID_INPUT si falta project_id/justificante) o por qué la obligación
    queda NO_CONFIRMADA (D12 no responde).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), por qué el
    sistema no presenta ni firma y por qué el canal de recepción es declarable y abierto.
  - Cuando vayas a escribir/ampliar el test unitario del puente acuse-presentacion.
tags: [enki, modulo, puente, contabilidad, acuse-presentacion, fiscal, declarable]
---

# acuse-presentacion — PUENTE · recibe y liga el acuse de la presentación del asesor

## Qué hace el módulo

`acuse-presentacion` es un **PUENTE STATELESS** (D13, hoja del plan): **EL SISTEMA NO
PRESENTA**. Aquí se **RECIBE** el **justificante/acuse** que la administración devuelve
**TRAS la presentación que hizo el ASESOR**, y se **LIGA** a su **modelo**
(`estado-presentacion-fiscal` D12) y a su **asiento** (`escritor-diario` B2): **cierra
el bucle hacia fuera**. **Sin acuse → la obligación queda NO justificada → aviso**
(nunca se marca justificada sin justificante).

El **CANAL de recepción** del acuse es **DECLARABLE** (`MANUAL` |
`DESCARGA_PROGRAMA` | `CORREO` | `API_ADMINISTRACION`) y **abierto**: si falta → **se
CREA** (`_conectarCanal`, invariante de puerto abierto); **sin canal declarado → `422
PRECONDITION_FAILED`**. Las **credenciales** van por `credential-manager` **por EVENTO,
jamás aquí**.

Es **stateless**: **sin PosPersistencia ni `project.activated`** — cada op **entra
objeto, sale objeto**. El catálogo de canales vive **solo en memoria del proceso**
(`this._canales`, un `Map`). La ligadura con D12 y con el libro es **por EVENTO**
(contrato **TOLERANTE**: si no responden, se **declara** la dependencia y **NUNCA se
asume que la obligación quedó justificada o que el acuse quedó ligado**). La dependencia
es **por EVENTO, NUNCA por `require` cruzado**.

> **NO REUTILIZA**: el retorno del acuse administrativo **no existe en el inventario**.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.acuse.recibir.request` | `onRecibirRequest` | RPC puente (D13): {project_id, justificante:{modelo, ejercicio, periodo, csv?, fecha?, clase?}, canal:'MANUAL'\|'DESCARGA_PROGRAMA'\|'CORREO'\|'API_ADMINISTRACION', modelo?, asiento?} → {project_id, acuse:{...presentado_por_el_asesor:true, presentado_por_el_sistema:false, firmado_por_el_sistema:false}, recibido, ligado, ligadura:{obligacion_justificada, asiento_ligado, estado:'JUSTIFICADA'}}. Recibe/registra el acuse de la presentacion del ASESOR y lo LIGA a su modelo (D12, por EVENTO) y a su asiento (B2). Sin canal declarado → 422; si D12 no confirma → se declara NO_CONFIRMADO (no se asume justificada). Exito publica contabilidad.acuse_ligado; responde por contabilidad.acuse.recibir.response; error → contabilidad.acuse.recibir.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.acuse_ligado` | Fire-and-forget (D13): el acuse quedo RECIBIDO y LIGADO a su modelo y a su asiento (obligacion → JUSTIFICADA) → {project_id, modelo, ejercicio, periodo, acuse, asiento, asiento_ligado, ligado:true, obligacion_justificada:true, estado:'JUSTIFICADA', cierra_el_bucle_hacia_fuera:true}. Consume el ciclo de presentacion (D12) y el cuadro de mando; el sistema NO presenta ni firma. |
| `contabilidad.acuse.recibir.failed` | Par de fallo determinista: sin project_id/justificante (400), acuse sin modelo declarado (422) o canal de recepcion no declarado (422 PRECONDITION_FAILED). Cierra el circulo de contabilidad.acuse.recibir.request. |
| `contabilidad.acuse_ligado.failed` | Par de fallo: la ligadura del acuse con estado-presentacion-fiscal (D12) no se confirmo — se DECLARA (NO_CONFIRMADO), no se asume que la obligacion quedo justificada. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.acuse.recibir.failed` cierra `contabilidad.acuse.recibir.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.acuse.recibir.response` (el par response del RPC); **NO está declarada en
> `publishes`**.

> Nota: declarado en module.json y **sí** emitido por index.js — `contabilidad.acuse_ligado`
> se publica en éxito de la ligadura; `contabilidad.acuse_ligado.failed` **sí** se emite
> cuando `_ligar` devuelve `status !== 200`. No hay eventos de dominio declarados sin
> emitir.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.obligacion.avanzar.request` (dependencia por EVENTO hacia
> `estado-presentacion-fiscal` D12) y `contabilidad.traza.consultar.request` (dependencia
> por EVENTO hacia el libro B2 / traza-asiento), no declaradas como publishers.

## Reglas de negocio

1. **El sistema NO presenta ni firma**: el acuse registrado lleva siempre
   `presentado_por_el_sistema:false`, `firmado_por_el_sistema:false` y
   `presentado_por_el_asesor:true`. El acuse es un hecho **RECIBIDO**, no emitido por el
   sistema.
2. **Canal de recepción DECLARABLE y ABIERTO**: `_canalDe` exige `canal`/`canal_acuse`.
   Sin canal → **`422 PRECONDITION_FAILED`** (`canales`, `no_declarado:true`). Si el
   canal no está en el catálogo, **se crea** (`_canales.set(...)`, puerto abierto).
   `CANALES = ['MANUAL','DESCARGA_PROGRAMA','CORREO','API_ADMINISTRACION']`.
3. **A qué modelo apunta se DECLARA, no se asume**: `_recibir` exige `modelo` (`modelo`/
   `numero_modelo`) o `justificante.modelo`. Sin modelo → **`422 PRECONDITION_FAILED`**
   (`no_declarado:true`). `_claseDe` normaliza la clase a `ACUSE` | `JUSTIFICANTE` |
   `REQUERIMIENTO` | `NOTIFICACION` (por defecto `ACUSE`).
4. **Ligadura con D12 — contrato TOLERANTE**: `_ligar` pide a `estado-presentacion-fiscal`
   (D12) `contabilidad.obligacion.avanzar.request` con `estado:'JUSTIFICADA'` (timeout
   4000ms). Si **D12 no responde** → se devuelve `200` pero con `ligado:false`,
   `obligacion_justificada:false`, `simbolico:'NO_CONFIRMADO'` y un `aviso`
   `{senal:'OBLIGACION_NO_JUSTIFICADA', motivo:'D12 ... no confirmo el avance'}` —
   **no se asume justificada**. En `onRecibirRequest`, ese retorno publica
   `contabilidad.acuse_ligado.failed`.
5. **Ligadura con el asiento (B2) por EVENTO**: si viene `asiento`/`asiento_id`/
   `clave_natural`, se consulta `contabilidad.traza.consultar.request` (timeout 4000ms);
   `asiento_ligado = (resp.status === 200)`.
6. **Cierra el bucle hacia fuera**: en éxito, la ligadura marca `ligado:true`,
   `obligacion_justificada:true`, `estado:'JUSTIFICADA'` y `cierra_el_bucle_hacia_fuera:true`;
   se publica `contabilidad.acuse_ligado`.
7. **La respuesta del RPC incluye la ligadura**: `onRecibirRequest` devuelve
   `{...res.data, ligadura: <data|null>, ligado: <bool>}`.
8. **Validaciones deterministas de entrada**: falta `project_id` → `400 INVALID_INPUT
   project_id`; `justificante` ausente/no objeto → `400 INVALID_INPUT justificante`;
   `_ligar` sin `acuse` → `400 INVALID_INPUT acuse`, sin `modelo` → `400 INVALID_INPUT
   modelo`; `_conectarCanal` sin `canal` → `400 INVALID_INPUT canal`. Shape:
   `{status:400, error:{code:'INVALID_INPUT', message:'<campo> requerido',
   details:{field:<campo>}}}`.
9. **HTTP exacto**: éxito `200`; payload inválido → `400`; canal/modelo no declarados →
   `422`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

El único RPC responde en `contabilidad.acuse.recibir.response`.

### 1. `recibir` — acuse con canal declarado, ligado a modelo y asiento

```json
{
  "project_id": "e57a318a-...",
  "justificante": { "modelo": "303", "ejercicio": "2026", "periodo": "2026-09", "csv": "CSV-9F2C", "fecha": "2026-10-20", "clase": "JUSTIFICANTE" },
  "canal": "DESCARGA_PROGRAMA",
  "asiento": { "clave_natural": "...:303:9f2c" },
  "correlation_id": "abc-123"
}
```

Con D12 confirmando el avance, respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "acuse": { "modelo": "303", "ejercicio": "2026", "periodo": "2026-09", "clase": "JUSTIFICANTE", "nif": null, "sociedad": null, "csv": "CSV-9F2C", "fecha_acuse": "2026-10-20", "canal": "DESCARGA_PROGRAMA", "recibido_en": "...", "presentado_por_el_sistema": false, "firmado_por_el_sistema": false, "presentado_por_el_asesor": true },
  "canal": "DESCARGA_PROGRAMA",
  "recibido": true,
  "ligado": true,
  "ligadura": { "project_id": "e57a318a-...", "modelo": "303", "ejercicio": "2026", "periodo": "2026-09", "acuse": { "...": "..." }, "asiento": { "clave_natural": "...:303:9f2c" }, "asiento_ligado": true, "ligado": true, "obligacion_justificada": true, "estado": "JUSTIFICADA", "cierra_el_bucle_hacia_fuera": true }
}
```

Emite `contabilidad.acuse_ligado` (ligadura.data + `correlation_id`).

### 2. `recibir` — D12 no confirma → NO_CONFIRMADO (no se asume justificada)

Si `estado-presentacion-fiscal` (D12) no responde → la ligadura queda
`ligado:false`, `obligacion_justificada:false`, `simbolico:'NO_CONFIRMADO'` con
`aviso:{senal:'OBLIGACION_NO_JUSTIFICADA'}`; se publica `contabilidad.acuse_ligado.failed`.

### 3. Fallo — canal no declarado → 422

```json
{ "project_id": "e57a318a-...", "justificante": { "modelo": "303" } }
```

→ `422 PRECONDITION_FAILED` (`canales`, `no_declarado:true`) +
`contabilidad.acuse.recibir.failed`.

### 4. Fallo — acuse sin modelo → 422

`justificante` sin `modelo` (ni en payload ni en el justificante) → `422
PRECONDITION_FAILED` (`no_declarado:true`): *se declara a qué modelo apunta, no se
asume*.

### 5. Fallo — payload inválido

Sin `project_id`/`justificante` → `400 INVALID_INPUT project_id`/`justificante` +
`contabilidad.acuse.recibir.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "justificante requerido", "details": { "field": "justificante" } } }
```

### 6. Tools (sin RPC en module.json)

`toolRecibir` → `_recibir`; `toolLigar` → `_ligar`; `toolConectarCanal` → `_conectarCanal`.

## Tests

El test viviría en `tests/unit/acuse-presentacion.test.js`. Cubre:

- `recibir` con canal declarado y D12 confirmando → `200`, `recibido:true`,
  `ligado:true`, `acuse.presentado_por_el_asesor:true`,
  `presentado_por_el_sistema:false`; emite `contabilidad.acuse_ligado`.
- **D12 no confirma** → `NO_CONFIRMADO` (`obligacion_justificada:false`) y
  `contabilidad.acuse_ligado.failed` (**no se asume justificada**).
- **Canal declarable y abierto**: sin canal → `422 PRECONDITION_FAILED`; canal nuevo →
  se crea (`conectarCanal`).
- **Modelo no asumido**: acuse sin modelo → `422`.
- **Ligadura con asiento (B2)** vía `contabilidad.traza.consultar.request`.
- Payload sin `project_id`/`justificante` → `400 INVALID_INPUT`.
- El puente es **stateless**: sin `project.activated` ni persistencia (el catálogo de
  canales vive solo en memoria del proceso).

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/acuse-presentacion
node --test tests/unit/acuse-presentacion.test.js
```

## Notas de implementación

- Clase `AcusePresentacion extends ModuloHibridoReflejo`; `name = 'acuse-presentacion'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (puente stateless: no hay PosPersistencia
  ni `project.activated`). El único estado es el catálogo en memoria `this._canales`
  (Map canal → `{canal, conectado, creado_en}`).
- Constantes: `CANALES = ['MANUAL','DESCARGA_PROGRAMA','CORREO','API_ADMINISTRACION']`
  (la LISTA orienta; el acuse es dato) y `CLASES = ['ACUSE','JUSTIFICANTE',
  'REQUERIMIENTO','NOTIFICACION']`.
- `onRecibirRequest` delega en `_atender(e, 'recibir', 'contabilidad.acuse.recibir.response',
  fn)`: en fallo publica `contabilidad.acuse.recibir.failed`; en éxito llama a `_ligar`
  (async) y publica `contabilidad.acuse_ligado` (éxito) o `contabilidad.acuse_ligado.failed`.
- Proyecciones puras: `_recibir`, `_ligar` (async, EVENTO D12 + EVENTO B2),
  `_conectarCanal` + helpers `_canalDe`, `_claseDe`. `_rpc`/`_invalid`/`_errorResponse`
  vienen de la base.
- Tools: `toolRecibir`, `toolLigar`, `toolConectarCanal`.
- DEP hacia delante: `contabilidad.acuse_ligado` lo consume el ciclo de presentación
  (D12) y el cuadro de mando; cierra el bucle hacia fuera. DEP hacia atrás por EVENTO:
  `estado-presentacion-fiscal` (D12) para avanzar la obligación a `JUSTIFICADA`;
  `escritor-diario` (B2, vía traza) para ligar el asiento. Las **credenciales** van por
  `credential-manager` por EVENTO, jamás aquí.
