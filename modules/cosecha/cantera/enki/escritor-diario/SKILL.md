---
name: escritor-diario
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `escritor-diario` de la
  vertical contabilidad (Enki). ES EL LIBRO: single-writer por parcela, el único
  que apila asientos en el diario. Su cerrojo es la PARTIDA DOBLE (debe == haber;
  si no cuadra se RECHAZA, no se inventa el descuadre) y es APPEND-ONLY e
  IDEMPOTENTE por huella. Persiste por proyecto vía PosPersistencia y, al asentar,
  publica el HECHO `contabilidad.asiento_asentado` que alimenta a todo el resto
  del dominio (mayor-balanza, traza-asiento, balance, informes).
when-to-use: >-
  - Cuando necesites asentar un asiento en el libro (RPC escritor-diario.asentar.request).
  - Cuando depures por qué un asiento se rechaza (422 PARTIDA_DOBLE_ROTA, 409
    CONFLICT_STATE por ejercicio cerrado, 400 INVALID_INPUT) o no se emite
    contabilidad.asiento_asentado.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    reglas de negocio (partida doble, append-only, idempotencia por huella).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, libro, diario, partida-doble, append-only, single-writer]
---

# escritor-diario — CUSTODIO CON PERSISTENCIA del libro (el diario)

## Qué hace el módulo

`escritor-diario` es un **CUSTODIO CON PERSISTENCIA** (B2, hoja del plan): el
dueño del **diario** por proyecto. Es el **single-writer del libro**: nadie más
escribe el diario. La corrección del asesor entra por `asiento-ajuste` (B5), el
hecho rectificado por `hecho-rectificativo` (A13) y el hecho de la operación por
`puerto-evento-vertical` (A1) → `normalizador-hecho` (A2); **todos ellos llegan
como EVENTO** y este módulo es el ÚNICO que apila en el diario.

Su cerrojo es **LA PARTIDA DOBLE**: un asiento SOLO entra si `suma(DEBE) ==
suma(HABER)`. Si no cuadra **NO se inventa el descuadre**: se **RECHAZA**
(`422 PARTIDA_DOBLE_ROTA`, con las dos sumas y la diferencia declaradas). Un
libro que "arregla" solo los asientos descuadrados es un libro que miente.

Es **APPEND-ONLY** (cada asiento se apila con su secuencia y su huella; NADA se
borra, NADA se sobrescribe — corregir = AÑADIR otro asiento) e **IDEMPOTENTE por
huella** (el mismo asiento, por la semántica *at-least-once* del bus, no se apila
dos veces). Si el ejercicio está cerrado, no se asienta. Es la clase **ORDEN**:
su RPC lleva `ui_handler` (`system_panel`, `lateral_derecha`). Persiste por
proyecto vía **PosPersistencia** (storage `/contabilidad/escritor-diario`),
restaura en `project.activated` y vuelca en `onUnload`. **R2: al asentar publica
el HECHO `contabilidad.asiento_asentado`** — sin ese hecho el libro sería
invisible para todo el resto del dominio.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `escritor-diario.asentar.request` | `onAsentarRequest` | RPC custodio (ORDEN, panel): `{project_id, asiento{lineas:[{cuenta,debe,haber}], fecha?, concepto?, clave?}, origen?}` → `{project_id, asiento, asentado, total, append_only, abierto}`. Guarda de PARTIDA DOBLE: `debe != haber` → `422 PARTIDA_DOBLE_ROTA`. Ejercicio cerrado → `409`. Publica `contabilidad.asiento_asentado` (R2) y responde por `escritor-diario.asentar.response`. Payload inválido o descuadre → `escritor-diario.asentar.failed`. |
| `contabilidad.hecho_recibido` | `onHechoRecibido` | Fire-and-forget (A1/A2): llegó un hecho de la operación ya normalizado. Si el hecho **declara su asiento propuesto**, se asienta por la misma guarda de partida doble y se anuncia `contabilidad.asiento_asentado`; si no lo trae, **NO se inventa un apunte** (no se asienta). |
| `contabilidad.ajuste_entrado` | `onAjusteEntrado` | Fire-and-forget (B5 asiento-ajuste): la corrección del asesor entró por su camino. Si el ajuste declara su asiento, se asienta (marcado `ajuste:true`) por la misma guarda; no borra nada. |
| `contabilidad.hecho_rectificado` | `onHechoRectificado` | Fire-and-forget (A13 hecho-rectificativo): un hecho posterior corrige/anula uno anterior SIN borrarlo. Si trae asiento, se apila (marcado `rectificativo:true`); el original queda intacto (append-only). |
| `project.activated` | `onProjectActivated` | Restaura el diario del proyecto activado desde el storage (PosPersistencia). Emitido por el core. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.asiento_asentado` | Fire-and-forget (B2): un asiento quedó en el libro → `{project_id, asiento, numero, total}`. Alimenta a mayor-balanza, traza-asiento, balance-situacion, cuenta-resultados, liquidacion-iva, control-calidad-muestreo, expediente-documental, informe-accionable y demás derivados. |
| `escritor-diario.asentar.response` | Respuesta RPC correlada de la op `asentar`. |
| `escritor-diario.asentar.failed` | Par de fallo determinista: falta `project_id`/`asiento`/`lineas`, la partida doble no cuadra (422 PARTIDA_DOBLE_ROTA) o el ejercicio está cerrado (409) → `{status, code, message}`. Cierra el círculo de `asentar.request`. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `escritor-diario.asentar.failed` cierra el círculo de
> `escritor-diario.asentar.request` cuando `_asentar` devuelve status ≠ 200.

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `asentar` | **ORDEN** (panel) | `{project_id, asiento{lineas:[{cuenta,debe,haber}], fecha?, concepto?, clave?}, origen?}` | `{project_id, asiento, asentado, duplicado, total, append_only, abierto}` | `400 INVALID_INPUT` (`project_id`, `asiento`, `asiento.lineas`); `409 CONFLICT_STATE` (cerrado); `422 PARTIDA_DOBLE_ROTA` (descuadre) |

La proyección interna es `_asentar(input) -> {status, data}`. Tools expuestas:
`escritor-diario.asentar` (`toolAsentar` → `_asentar`). También hay lecturas
directas de proceso: `asientosDe(pid)` (solo lectura) y `cerrarEjercicio(pid)`
(marca el diario como cerrado; lo decide quien cierra, aquí solo se refleja).

## Reglas de negocio

1. **Partida doble (cerrojo)**: se calculan `suma_debe` y `suma_haber` (redondeo
   a 2). Si `|debe − haber| > EPSILON` (`EPSILON = 0.005`, tolerancia de céntimos
   de redondeo, no descuadre real) → `422 PARTIDA_DOBLE_ROTA` con
   `{project_id, suma_debe, suma_haber, diferencia, lineas, rechazado:true}`. **No
   se inventa el descuadre, no se fuerza.**
2. **Ejercicio cerrado**: si `diario.cerrado === true` → `409 CONFLICT_STATE`
   (`'el ejercicio esta cerrado: no se asienta (se reabre por su propio camino,
   no aqui)'`).
3. **APPEND-ONLY**: cada asiento se apila con `numero`/`secuencia` (n+1), `id`
   `${pid}-a${n+1}`, `huella`, `fecha`, `concepto`, `lineas`, sumas, `origen`,
   `ajuste`, `rectificativo`, `en`. Nunca se sobrescribe ni se borra.
4. **IDEMPOTENTE por huella**: `huella = sha1(clave|fecha|lineas).slice(0,16)`.
   Si la huella ya está en `diario.huellas` (y no viene `permitir_duplicado`) →
   `200 {asentado:false, duplicado:true, motivo:'...no se duplica (append-only)'}`.
   No lanza error: declara el duplicado.
5. **Sin líneas o sin asiento no se asienta**: `asiento` ausente o no objeto →
   `400 INVALID_INPUT asiento`; `lineas` vacías → `400 INVALID_INPUT
   asiento.lineas`. **Dato ausente = desconocido**, no se rellena.
6. **Handlers de dominio NO fabrican apuntes**: `onHechoRecibido`,
   `onAjusteEntrado`, `onHechoRectificado` solo asientan si el evento trae
   `asiento` declarado (`d.asiento || d.hecho.asiento`, etc.); si no, retornan sin
   hacer nada. No publican `.response` (no son RPC); sí publican
   `contabilidad.asiento_asentado` en éxito o `escritor-diario.asentar.failed` en
   fallo (vía `_reaccionAResultado`).
7. **HTTP exacto**: éxito `200`; campos inválidos → `400`; cerrado → `409`;
   descuadre → `422`; excepción no capturada en `_atender` → `500 UNKNOWN_ERROR`.
8. **`abierto`**: el asiento declara sus huecos honestamente — sin `concepto` o
   sin `origen` no se inventan, se apilan como hueco declarado.

## Cómo se usa (RPC)

### 1. `asentar` — meter un asiento cuadrado

```json
{
  "project_id": "e57a318a-...",
  "asiento": {
    "fecha": "2026-09-25",
    "concepto": "Compra de material",
    "clave": "factura-A1",
    "lineas": [
      { "cuenta": "600", "debe": 100.0, "haber": 0 },
      { "cuenta": "400", "debe": 0, "haber": 100.0 }
    ]
  },
  "origen": "factura-compra",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "asiento": { "numero": 1, "id": "e57a318a-...-a1", "huella": "3f2a...", "suma_debe": 100.0, "suma_haber": 100.0, "ajuste": false, "rectificativo": false }, "asentado": true, "duplicado": false, "total": 1, "append_only": true, "abierto": { "concepto": null, "origen": null } }
```
Emite `contabilidad.asiento_asentado`:
```json
{ "project_id": "e57a318a-...", "asiento": { "numero": 1, ... }, "numero": 1, "total": 1, "correlation_id": "abc-123" }
```

### 2. Fallo — partida doble rota

```json
{ "project_id": "e57a318a-...", "asiento": { "lineas": [ { "cuenta": "600", "debe": 100 }, { "cuenta": "400", "haber": 90 } ] } }
```
Respuesta `422` + `escritor-diario.asentar.failed`:
```json
{ "status": 422, "code": "PARTIDA_DOBLE_ROTA", "message": "la suma del DEBE no cuadra con la del HABER: el asiento se RECHAZA (no se inventa el descuadre)", "details": { "suma_debe": 100, "suma_haber": 90, "diferencia": 10, "rechazado": true } }
```

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `asiento` / `asiento.lineas` — falta el campo.
- `409 CONFLICT_STATE` — el ejercicio está cerrado; se reabre por su propio camino.
- `422 PARTIDA_DOBLE_ROTA` — descuadre; trae `suma_debe`, `suma_haber`, `diferencia`.
- `200 {asentado:false, duplicado:true}` — idempotencia: la misma huella ya estaba.
- `500 UNKNOWN_ERROR` — excepción no prevista en la proyección.

## Relación con otras piezas (por EVENTO, nunca import)

- **Depende hacia atrás (escucha)**: `contabilidad.hecho_recibido` (A1/A2
  puerto-evento-vertical / normalizador-hecho), `contabilidad.ajuste_entrado`
  (B5 asiento-ajuste), `contabilidad.hecho_rectificado` (A13 hecho-rectificativo).
- **Depende hacia delante (publica)**: `contabilidad.asiento_asentado` lo
  consumen `mayor-balanza` (B3), `traza-asiento` (B4), `balance-situacion` (C1),
  `cuenta-resultados` (C2), `liquidacion-iva`, `control-calidad-muestreo` (L8),
  `expediente-documental`, `informe-accionable`, `cambio-desde-ultima-revision`
  (L9), `balance`/`retenciones`/etc.
- Es el **single-writer del libro**: ningún otro módulo escribe; todos le suben
  asiento por EVENTO (`escritor-diario.asentar.request`).

## Verificación

- **Fichero**: `modules/contabilidad-libro/escritor-diario/` (`module.json` +
  `index.js`; clase `EscritorDiario extends ModuloHibridoReflejo`, `version
  'reflejo-0.1.0'`).
- **Eventos**: confirmar con `grep -F "asiento_asentado" module.json index.js` y
  `grep -F "PARTIDA_DOBLE_ROTA" index.js` que los strings coinciden.
- **Test unitario**: un caso cuadrado asienta y emite
  `contabilidad.asiento_asentado`; un caso descuadrado da `422 PARTIDA_DOBLE_ROTA`
  + `escritor-diario.asentar.failed`; repetir el mismo asiento devuelve
  `duplicado:true`; con el ejercicio cerrado da `409`.
- **Persistencia**: `project.activated` restaura; `onUnload` vuelca.

## Notas de implementación

- Store en memoria: `this._diarios` (Map `project_id` → `{esquema, cerrado,
  asientos:[], huellas:Set}`).
- **PosPersistencia**: `file: 'escritor-diario.json'`, `dir:
  '/contabilidad/escritor-diario'`; el snapshot guarda `{project_id, esquema,
  cerrado, asientos}`; `hidratar` reconstruye también el `Set` de huellas.
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` +
  `detener()`. Cada asiento marca `marcarDirty(pid)`.
- `on<Op>Request` delega en `_atender(e, 'asentar', 'escritor-diario.asentar.response', ...)`;
  `_reaccionAResultado` centraliza el anuncio del hecho o el par `.failed`.
- Helpers: `_lineas` (normaliza a `{cuenta, debe, haber}` con números),
  `_sumas`, `_huella` (sha1), `_obtenerOCrear`, `_num`, `_round`.
- `_invalid`/`_errorResponse` vienen de `modulo-hibrido-reflejo` / `base-module`
  (`_errorResponse` devuelve `{status, error:{code, message, details?}}`).
