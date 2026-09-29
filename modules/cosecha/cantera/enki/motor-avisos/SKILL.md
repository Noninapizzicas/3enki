---
name: motor-avisos
description: >
  Skill FULL del módulo PUENTE `motor-avisos` de la vertical contabilidad de Enki.
  LA PIEZA QUE DESBLOQUEA: el canal de avisos — recoge las SEÑALES que ya emiten las
  piezas del sistema (revisión, cuadre, vencimientos, desviación, fuente faltante) y las
  convierte en un Aviso canónico con su tipo, su asunto, su motivo, su destino y su canal.
  PRODUCE; no entrega (eso es aviso-negocio R1) y no decide (eso es catalogo-avisos K6).
  Úsala para operar, depurar o extender el puente, o para entender su contrato de eventos
  y sus reglas de negocio.
when-to-use: >
  - Cuando necesites producir un aviso a partir de una señal (RPC
    motor-avisos.producir.request).
  - Cuando depures por qué no hay aviso (400 SENAL_NO_IDENTIFICABLE si la señal no declara
    su naturaleza; 400 INVALID_INPUT si falta project_id) o por qué el destino/canal salen
    null (no declarados y el catálogo K6 no respondió).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y el ENCAJE con
    las 6 señales de dominio que cierran el círculo de los módulos tolerantes.
  - Cuando vayas a escribir/ampliar el test unitario del puente motor-avisos.
tags: [enki, modulo, puente, contabilidad, motor-avisos]
---

# motor-avisos — PUENTE STATELESS del canal de avisos

## Qué hace el módulo

`motor-avisos` es un **PUENTE STATELESS** (K2, hoja del plan): **LA PIEZA QUE DESBLOQUEA**.
**PRODUCE el aviso** (requisito 4 del dueño). Recoge las **SEÑALES** que ya emiten las
piezas del sistema y las convierte en un **Aviso canónico** con su **tipo**, su **asunto**,
su **motivo**, su **destino** y su **canal**.

**PRODUCE; NO ENTREGA Y NO DECIDE.** El motor es el **CANAL DE AVISOS**, no el mensajero:

- **NO habla con ningún canal** (telegram, email, push): la **ENTREGA + CONFIRMA** es de
  `aviso-negocio` (R1). Aquí solo se produce el aviso y se publica
  `contabilidad.aviso_producido`.
- **NO decide QUÉ avisos existen, A QUIÉN van ni POR QUÉ canal**: eso es el **CATÁLOGO**
  (`catalogo-avisos` K6), que se consulta **POR EVENTO**
  (`catalogo-avisos.resolver.request`, best-effort). Sin catálogo **NO se inventa la
  política**: se produce con lo que la señal ya traía declarado y se marca
  `catalogo_disponible:false`.
- **NO inventa DESTINO**: es `ParametroDeclarable` (**[ABIERTO] Q70** quién actúa). Si ni la
  señal ni el catálogo lo traen → `destino:null`, `destino_declarado:false`. **Jamás se
  asume a quién avisar.**

### El ENCAJE con los 3 módulos tolerantes (cierre del círculo)

`motor-avisos` es el **consumidor** de las señales fire-and-forget de los módulos que
«avisan sin decidir». Su mapa `SENALES` fija la **IDENTIDAD** de cada señal (qué tipo/asunto
le corresponde) — **no** un criterio de negocio:

| Señal (evento de dominio) | Emisor | tipo | asunto |
|---|---|---|---|
| `contabilidad.aviso_revision` | `aviso-revision` (A8.2) | `revision` | `revision` |
| `contabilidad.aviso_cuadre` | `aviso-cuadre` (C6) | `cuadre` | `cuadre` |
| `contabilidad.vencimiento_fiscal` | `calendario-fiscal` (D6) | `vencimiento` | `vencimiento_fiscal` |
| `contabilidad.vencimiento_proximo` | `prevision-caja` / `vencimiento-pago` (E5/N8) | `vencimiento` | `vencimiento` |
| `contabilidad.desviacion` | `desviacion` (J4) | `desviacion` | `desviacion` |
| `contabilidad.fuente_faltante` | `declaracion-fuente-faltante` (A15) | `fuente_faltante` | `fuente_faltante` |

Los **3 módulos tolerantes** — `aviso-revision`, `aviso-cuadre` y
`declaracion-fuente-faltante` — empujan su señal y **cierran su propio círculo** con su par
`*.failed`. `motor-avisos` **cierra el círculo del canal**: convierte esas 3 señales (más
las de vencimiento y desviación) en **Aviso** y emite `contabilidad.aviso_producido`, que
consume `aviso-negocio` (R1) para **entregar y confirmar**.

Invariantes:

- Una señal **sin naturaleza identificable NO es un aviso**: se declara y cierra el círculo
  con el par `.failed` (**nada se estima**).
- **DETERMINISTA**: misma señal + mismo catálogo declarado → mismo aviso.
- **LEY/PARÁMETRO COMO DATO**: tipos, destinos y canales **declarables**; cero catálogo
  cableado (el mapa `SENALES` solo fija la **identidad** de cada señal).
- **Sin estado de dominio**: no recuerda avisos, no los cuenta, no los re-emite. Un puente.
- **Sin `PosPersistencia` y sin `project.activated`**: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `motor-avisos.producir.request` | `onProducirRequest` | RPC puente: {project_id, evento\|senal\|tipo, asunto?, motivo?, destino?, canal?, vertical?, periodo?, ejercicio?, detalle?, catalogo?} → {project_id, aviso:{id, tipo, asunto, senal, motivo, detalle, destino, destino_declarado, canal, canal_declarado, requiere_revision:true, entregado:false, entregado_por:'aviso-negocio(R1)', producido_en}, aviso_id, catalogo_disponible, fuente_catalogo, abierto:{destino, canal, motivo, catalogo}}. Resuelve la politica (que aviso, a quien, por que canal) en el catalogo-avisos (K6) POR EVENTO, best-effort; sin catalogo produce con lo declarado. Sin naturaleza identificable → 400 SENAL_NO_IDENTIFICABLE. Exito → publica contabilidad.aviso_producido y responde por motor-avisos.producir.response; fallo → motor-avisos.producir.failed. |
| `contabilidad.aviso_revision` | `onAvisoRevision` | Fire-and-forget (A8.2 → K2): aviso-revision empujo que algo necesita revision (con su motivo y su cola de destino) → se convierte en Aviso tipo 'revision' y se publica contabilidad.aviso_producido. Tolerante: una señal sin project_id se ignora. |
| `contabilidad.aviso_cuadre` | `onAvisoCuadre` | Fire-and-forget (C6 → K2): aviso-cuadre empujo que LA metrica unica de cobertura no esta completa → se convierte en Aviso tipo 'cuadre'. Tolerante: sin project_id se ignora. |
| `contabilidad.vencimiento_fiscal` | `onVencimientoFiscal` | Fire-and-forget (D6 → K2): calendario-fiscal publico un vencimiento fiscal dentro de la ventana declarada → se convierte en Aviso tipo 'vencimiento' con asunto 'vencimiento_fiscal'. Tolerante: sin project_id se ignora. |
| `contabilidad.vencimiento_proximo` | `onVencimientoProximo` | Fire-and-forget (E5/N8 → K2): prevision-caja o vencimiento-pago publicaron un vencimiento de pago proximo → se convierte en Aviso tipo 'vencimiento'. Tolerante: sin project_id se ignora. |
| `contabilidad.desviacion` | `onDesviacion` | Fire-and-forget (J4 → K2): desviacion publico que el real se salio del UMBRAL DECLARADO → se convierte en Aviso tipo 'desviacion'. Tolerante: sin project_id se ignora (y desviacion no emite si no hay umbral declarado). |
| `contabilidad.fuente_faltante` | `onFuenteFaltante` | Fire-and-forget (A15 → K2): declaracion-fuente-faltante publico que una vertical no entrega un hecho necesario → se convierte en Aviso tipo 'fuente_faltante'. Tolerante: sin project_id se ignora. |

### Publishes

| Evento | Descripción |
|---|---|
| `motor-avisos.producir.response` | Respuesta RPC correlada de motor-avisos.producir.request → {request_id, status:200, data:{aviso, aviso_id, catalogo_disponible, fuente_catalogo, abierto}}. Emitida por el helper _atender. |
| `motor-avisos.producir.failed` | Par de fallo determinista (K2): project_id ausente (400) o señal sin naturaleza identificable (400 SENAL_NO_IDENTIFICABLE) → {status, error:{code, message, details?}}. Cierra el circulo de motor-avisos.producir.request y de las 6 señales fire-and-forget. |
| `contabilidad.aviso_producido` | Fire-and-forget (K2): un Aviso quedo PRODUCIDO (no entregado: la entrega es R1) → {project_id, aviso, aviso_id, tipo, asunto, destino, canal, catalogo_disponible, correlation_id}. Lo consume aviso-negocio (R1), que lo ENTREGA y CONFIRMA. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `motor-avisos.producir.failed` cierra el círculo de
> `motor-avisos.producir.request` **y** de las 6 señales fire-and-forget, porque
> `onProducirRequest` y `_senal` comparten la misma proyección `_producir` y ambas
> publican el par de fallo cuando `_producir` devuelve status ≠ 200.

> Nota: los fire-and-forget `onAvisoRevision` … `onFuenteFaltante` **no** usan `_atender`:
> llaman a `_senal(evento, e)`, que delega en `_producir` y publica
> `contabilidad.aviso_producido` o `motor-avisos.producir.failed`. Si la señal llega **sin
> `project_id`**, `_senal` devuelve `null` **sin publicar nada** (se ignora).

## Reglas de negocio

1. **La naturaleza de la señal manda**: `_producir` toma `input.evento` o, en su defecto,
   `input.senal`. Si el evento está en el mapa `SENALES`, de ahí salen `tipo` y `asunto`.
2. **Sin identidad, el tipo/asunto deben venir declarados**: si `input.tipo`/`input.asunto`
   los trae, se usan; si no, y el evento no está en `SENALES` → **tipo vacío** →
   `400 SENAL_NO_IDENTIFICABLE` (`details:{evento_declarado}`). **El motor no inventa de
   qué avisa.**
3. **El motivo es el «porqué» declarado por la señal**: `input.motivo`, o
   `input.aviso.motivo`; si no viene, queda `null` **y se declara** en `abierto.motivo`. No
   se inventa un motivo.
4. **El catálogo (K6) resuelve la política, POR EVENTO y best-effort**: si `input.catalogo`
   es objeto → `origen:'declarado'`; si no, se hace
   `_rpc('catalogo-avisos.resolver.request', {project_id, tipo, evento}, {timeout_ms:4000})`
   y su respuesta (preferentemente bajo `data.aviso`) se usa con `origen:'catalogo-avisos'`.
   Sin respuesta → `null`. **Sin catálogo no se inventa la política.**
5. **El destino es declarable — señal > catálogo > null**: si `input.destino`,
   `input.aviso.destino` o `catalogo.destino` traen un valor no vacío → se usa (recortado);
   si no → `destino:null`, `destino_declarado:false`. **Jamás se asume a quién avisar.**
6. **El canal también es declarable**: `input.canal` o `catalogo.canal`; sin declarar →
   `canal:null`, `canal_declarado:false`. **El motor NO habla con canales** (eso es R1).
7. **El aviso es completo y trazable**: `{id:'aviso_<pid>_<iso>_<tipo>', tipo, asunto,
   senal (el evento ORIGINAL), motivo, detalle (objeto o null), vertical, ejercicio,
   periodo, destino, destino_declarado, canal, canal_declarado, requiere_revision:true,
   entregado:false, entregado_por:'aviso-negocio(R1)', producido_en}`.
   `detalle` no-objeto → `null`; `vertical` cae al del catálogo si no se declara.
8. **`id` determinista por prefijo**: `aviso_<project_id>_<producido_en ISO>_<tipo>`.
9. **El aviso ES producido, no entregado**: `entregado:false` y
   `entregado_por:'aviso-negocio(R1)'` **siempre** — el motor no entrega.
10. **`abierto`: qué falta se declara**: `destino` (no declarado, [ABIERTO] Q70), `canal`
    (no en señal ni catálogo), `motivo` (la señal no lo declaró) y `catalogo` (K6 no
    respondió). **Nada se rellena por suposición.**
11. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`).
12. **Puro y sin estado**: no persiste, no recuerda avisos. `producido_en` se sella con
    `new Date().toISOString()`.
13. **HTTP exacto**: éxito `200`; `project_id` ausente → `400 INVALID_INPUT`; señal sin
    naturaleza → `400 SENAL_NO_IDENTIFICABLE`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `motor-avisos.producir.response` y emite `contabilidad.aviso_producido`.

### 1. `producir` — desde una señal de dominio declarada por su evento

```json
{
  "project_id": "e57a318a-...",
  "evento": "contabilidad.aviso_revision",
  "motivo": "contrapartida sin regla que cubra el proveedor",
  "destino": "ASESOR",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "aviso": {
    "id": "aviso_e57a318a-..._2026-09-25T...:00.000Z_revision",
    "tipo": "revision",
    "asunto": "revision",
    "senal": "contabilidad.aviso_revision",
    "motivo": "contrapartida sin regla que cubra el proveedor",
    "detalle": null,
    "vertical": null,
    "ejercicio": null,
    "periodo": null,
    "destino": "ASESOR",
    "destino_declarado": true,
    "canal": null,
    "canal_declarado": false,
    "requiere_revision": true,
    "entregado": false,
    "entregado_por": "aviso-negocio(R1)",
    "producido_en": "2026-09-25T...:00.000Z"
  },
  "aviso_id": "aviso_e57a318a-..._2026-09-25T...:00.000Z_revision",
  "catalogo_disponible": false,
  "fuente_catalogo": null,
  "abierto": {
    "destino": null,
    "canal": "el canal no esta declarado en la señal ni en el catalogo (K6)",
    "motivo": null,
    "catalogo": "catalogo-avisos (K6) no respondio: la politica de avisos no se inventa"
  }
}
```

Emite `contabilidad.aviso_producido`:

```json
{ "project_id": "e57a318a-...", "aviso": { "...": "..." }, "aviso_id": "aviso_...", "tipo": "revision", "asunto": "revision", "destino": "ASESOR", "canal": null, "catalogo_disponible": false, "correlation_id": "abc-123" }
```

Lo consume `aviso-negocio` (R1).

### 2. `producir` — señal sin identidad conocida, con tipo/asunto declarados

```json
{ "project_id": "e57a318a-...", "evento": "contabilidad.otra_cosa", "tipo": "inventario", "asunto": "stock_bajo" }
```

Respuesta `200`: el aviso se produce con `tipo:'inventario'`, `asunto:'stock_bajo'`,
`senal:'contabilidad.otra_cosa'`.

### 3. Fallo — señal sin naturaleza identificable

```json
{ "project_id": "e57a318a-...", "evento": "contabilidad.otra_cosa" }
```

Respuesta `400` + `motor-avisos.producir.failed`:

```json
{ "status": 400, "error": { "code": "SENAL_NO_IDENTIFICABLE", "message": "la señal no declara su naturaleza (tipo/asunto): el motor no inventa de que avisa", "details": { "evento_declarado": "contabilidad.otra_cosa" } } }
```

### 4. Fire-and-forget — las 6 señales de dominio

`onAvisoRevision`, `onAvisoCuadre`, `onVencimientoFiscal`, `onVencimientoProximo`,
`onDesviacion` y `onFuenteFaltante` toman `e.data || e`; sin `project_id` → `null` (se
ignoran). Con `project_id`, cada una llama a `_senal(<su evento>, e)` y publica
`contabilidad.aviso_producido` (o el par `failed`). Así **cierran su círculo** los 3
módulos tolerantes (`aviso-revision`, `aviso-cuadre`, `declaracion-fuente-faltante`) más
los de vencimiento y desviación.

### 5. Fallo — falta `project_id`

Respuesta `400` + `motor-avisos.producir.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/motor-avisos.test.js`. Cubre:

- `producir` con `evento:'contabilidad.aviso_revision'` → `200`, aviso con
  `tipo:'revision'`, `asunto:'revision'`, `requiere_revision:true`, `entregado:false`,
  `entregado_por:'aviso-negocio(R1)'` y emite `contabilidad.aviso_producido`.
- Evento fuera de `SENALES` **con** `tipo`/`asunto` declarados → aviso producido.
- Evento fuera de `SENALES` **sin** `tipo` → `400 SENAL_NO_IDENTIFICABLE` +
  `motor-avisos.producir.failed`.
- Destino/canal declarados → `destino_declarado:true` / `canal_declarado:true`; ausentes →
  `null` + `abierto` (no se inventa).
- Catálogo declarado en la petición → `catalogo_disponible:true`, `fuente_catalogo:'declarado'`;
  catálogo resuelto por evento (K6) → `fuente_catalogo:'catalogo-avisos'`.
- **ENCaje con los 3 tolerantes**: `onAvisoRevision`, `onAvisoCuadre` y
  `onFuenteFaltante` con `project_id` → emiten `contabilidad.aviso_producido` con su tipo;
  sin `project_id` → `null` sin publicar.
- `project_id` ausente → `400 INVALID_INPUT` + `motor-avisos.producir.failed`.
- `toolProducir` devuelve la misma proyección que `_producir`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `MotorAvisos extends ModuloHibridoReflejo`; `name = 'motor-avisos'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (PUENTE stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/motor-avisos/`; es de la vertical **analítica**).
- Constante `SENALES` (mapa `evento → {tipo, asunto}`) que fija la **identidad** de cada
  señal — **no** un criterio de negocio.
- `onProducirRequest` usa `this._atender(e, 'producir', 'motor-avisos.producir.response',
  async (d) => {...})` y hace el cierre de círculo: en `200` llama a
  `_emitirProducido`, si no publica `motor-avisos.producir.failed`. Los 6 handlers de señal
  **no** usan `_atender`: llaman a `_senal(evento, e)`.
- Proyección única `_producir(input)` (`async`: consulta el catálogo por evento) →
  `{status, data}`; helpers `_senal`, `_emitirProducido`, `_catalogo`, `_declarado`. Tool
  `toolProducir`.
- DEP: consulta `catalogo-avisos.resolver.request` (K6) **por evento** (best-effort, **no**
  es un subscribe: es una petición que el módulo ENVÍA); consume las 6 señales de dominio
  (A8.2, C6, D6, E5/N8, J4, A15); lo consume `aviso-negocio` (R1) vía
  `contabilidad.aviso_producido` para ENTREGAR y CONFIRMAR.
- **LA LEY COMO DATO**: tipos, destinos y canales son declarables; cero catálogo cableado.
- **PRODUCE, NO ENTREGA, NO DECIDE**: el aviso sale con `entregado:false` y
  `destino`/`canal` `null` si nadie los declaró.
