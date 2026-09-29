---
name: puerto-evento-vertical
description: >
  Skill FULL del módulo PUENTE `puerto-evento-vertical` de la vertical contabilidad
  de Enki. Abre el puerto por el que cada VERTICAL manda sus hechos ya emitidos;
  contabilidad se ADAPTA, no impone formato ni obliga a emitir: acepta el hecho
  crudo TAL CUAL y lo envuelve en el sobre estable `HechoCrudo` verificando solo
  el minimo que la propia vertical declare. Úsala para operar, depurar o extender
  el puente, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando una vertical necesite entregar un hecho por el puerto
    (RPC puerto-evento-vertical.recibir.request) o ya lo haya emitido
    (fire-and-forget vertical.hecho.emitido).
  - Cuando depures por qué un hecho no entra (400 INVALID_INPUT si falta
    `vertical` o `tipo`).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y la
    invariante "la vertical manda" (no se impone formato; lo ausente se declara).
  - Cuando vayas a escribir/ampliar el test unitario del puente puerto-evento-vertical.
tags: [enki, modulo, puente, contabilidad, puerto-evento-vertical]
---

# puerto-evento-vertical — PUENTE STATELESS de la contabilidad

## Qué hace el módulo

`puerto-evento-vertical` es un **PUENTE STATELESS** (A1, hoja del plan): abre el
puerto por el que cada **VERTICAL** manda sus hechos ya emitidos. Contabilidad se
**ADAPTA**: no impone formato ni obliga a emitir. Acepta el hecho crudo **tal como
la vertical lo publica** y lo envuelve en un sobre estable `HechoCrudo`
(`{vertical, tipo, clave_natural, payload, faltantes, emitido_en, recibido_en}`) que
el resto de la entrada puede consumir.

Es el **eslabon limitante de la entrada**. Si la vertical declara su minimo
(`campos_minimos`), se verifica ese minimo, nunca uno cableado. En exito publica el
fire-and-forget `contabilidad.hecho_crudo` (lo consume `normalizador-hecho` A2, la
unica puerta de formato); en error, su par `puerto-evento-vertical.recibir.failed`.
Sin PosPersistencia y sin `project.activated`: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `puerto-evento-vertical.recibir.request` | `onRecibirRequest` | RPC puente: {project_id, vertical, tipo, payload, clave_natural?, campos_minimos?} → {crudo:{vertical, tipo, clave_natural, payload, faltantes, emitido_en, recibido_en}, contrato, faltantes}. Envuelve el hecho crudo que manda la vertical sin imponerle formato; verifica solo el minimo declarado por la propia vertical. Exito → publica contabilidad.hecho_crudo y responde por puerto-evento-vertical.recibir.response; vertical/tipo ausentes → puerto-evento-vertical.recibir.failed. |
| `vertical.hecho.emitido` | `onHechoEmitido` | Fire-and-forget (A1): una vertical publica su hecho ya emitido en su propio bus → {project_id, vertical, tipo, payload, clave_natural?, campos_minimos?}. Misma proyeccion que el RPC: envuelve el crudo y publica contabilidad.hecho_crudo; si el payload es invalido, puerto-evento-vertical.recibir.failed. Cierra el circulo del flujo de entrada. |

### Publishes

| Evento | Descripción |
|---|---|
| `puerto-evento-vertical.recibir.response` | Respuesta RPC correlada de puerto-evento-vertical.recibir.request → {request_id, status:200, data:{crudo, contrato, faltantes}}. Emitida por el helper _atender. |
| `puerto-evento-vertical.recibir.failed` | Par de fallo determinista (A1): la vertical no aporta vertical/tipo o el payload es invalido → {status, error:{code, message, details?}}. Cierra el circulo de puerto-evento-vertical.recibir.request y de vertical.hecho.emitido. |
| `contabilidad.hecho_crudo` | Fire-and-forget (A1): un hecho crudo entro por el puerto desde una vertical → {project_id, crudo:{vertical, tipo, clave_natural, payload, faltantes}, vertical, tipo, clave_natural, correlation_id}. Lo consume normalizador-hecho (A2), la unica puerta de formato. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `puerto-evento-vertical.recibir.failed` cierra el círculo de
> `puerto-evento-vertical.recibir.request` **y** de `vertical.hecho.emitido`, porque
> `onRecibirRequest` y `onHechoEmitido` usan la misma proyeccion `_recibir`.

> Nota: `onHechoEmitido` recibe el evento por `e.data || e` y publica
> `contabilidad.hecho_crudo` / `puerto-evento-vertical.recibir.failed` igual que el RPC
> (pero sin publicar response, al no ser un RPC).

## Reglas de negocio

1. **La vertical manda**: el `payload` se acepta TAL CUAL (si no es objeto, se
   normaliza a `{}`); no se impone forma ni se completa nada. La unica puerta de
   formato es `normalizador-hecho` (A2).
2. **Identidad del hecho obligatoria**: sin `vertical` → `400 INVALID_INPUT`
   (`field:'vertical'`); sin `tipo` → `400 INVALID_INPUT` (`field:'tipo'`). Uno u
   otro ausente rompe el sobre.
3. **Minimo DECLARADO por la fuente**: si la vertical aporta `campos_minimos` (array),
   `contrato:'declarado'` y `faltantes` son los campos del payload ausentes en ese
   minimo; sin declararlo, `contrato:'no_declarado'` y `faltantes:[]`. El puerto no
   exige un minimo propio.
4. **Dato ausente = desconocido (cero estimacion)**: lo que no llega se declara en
   `faltantes`; jamas se estima ni se completa.
5. **Sobre estable `HechoCrudo`**: `{vertical, tipo, clave_natural, payload, faltantes,
   emitido_en, recibido_en}`. `recibido_en` se sella con `new Date().toISOString()`;
   `emitido_en` respeta el que traiga la vertical o sella el actual.
6. **`clave_natural` declarable**: se toma del input o queda `null`; no se inventa.
7. **`project_id` con fallback**: `input.project_id || this.project_id || null`.
8. **HTTP exacto**: éxito `200`; `vertical`/`tipo` ausentes → `400`; excepción en
   `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `puerto-evento-vertical.recibir.response` y emite `contabilidad.hecho_crudo`.

### 1. `recibir` (RPC) — la vertical entrega un hecho por el puerto

```json
{
  "project_id": "e57a318a-...",
  "vertical": "pizzepos",
  "tipo": "venta",
  "payload": { "fecha": "2026-09-01", "importe": 121, "moneda": "EUR" },
  "clave_natural": "pizzepos:venta:2026-09-01:0001",
  "campos_minimos": ["fecha", "importe"],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "contrato": "declarado",
  "faltantes": [],
  "crudo": {
    "vertical": "pizzepos", "tipo": "venta", "clave_natural": "pizzepos:venta:2026-09-01:0001",
    "payload": { "fecha": "2026-09-01", "importe": 121, "moneda": "EUR" },
    "faltantes": [], "emitido_en": "2026-09-01T10:00:00.000Z", "recibido_en": "2026-09-01T10:00:00.100Z"
  }
}
```
Emite `contabilidad.hecho_crudo`:
```json
{ "project_id": "e57a318a-...", "crudo": { "...": "..." }, "vertical": "pizzepos", "tipo": "venta", "clave_natural": "pizzepos:venta:2026-09-01:0001", "correlation_id": "abc-123" }
```

### 2. Fire-and-forget — la vertical ya emitio en su propio bus

Payload de `vertical.hecho.emitido`:
```json
{ "project_id": "e57a318a-...", "vertical": "pizzepos", "tipo": "venta", "payload": { "importe": 121 } }
```
Misma proyeccion: publica `contabilidad.hecho_crudo` (no responde).

### 3. Fallo — falta vertical o tipo

```json
{ "project_id": "e57a318a-...", "tipo": "venta", "payload": {} }
```
Respuesta `400` + `puerto-evento-vertical.recibir.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "vertical requerido", "details": { "field": "vertical" } } }
```

## Tests

El test vive en `tests/unit/puerto-evento-vertical.test.js`. Cubre:

- `recibir` con vertical+tipo+minimo declarado completo → `200 contrato:'declarado'`,
  `faltantes:[]`, sobre `crudo` con sellos de tiempo, y emite `contabilidad.hecho_crudo`.
- `recibir` sin `campos_minimos` → `contrato:'no_declarado'`.
- `recibir` sin `vertical` o sin `tipo` → `400 INVALID_INPUT` +
  `puerto-evento-vertical.recibir.failed`.
- `onHechoEmitido` (fire-and-forget) envuelve el crudo y publica `contabilidad.hecho_crudo`;
  con payload invalido publica el par de fallo.
- `payload` no objeto → se normaliza a `{}` (no revienta).
- `toolRecibir` devuelve la misma proyeccion que `_recibir`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `PuertoEventoVertical extends ModuloHibridoReflejo`; `name =
  'puerto-evento-vertical'`, `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin
  store, sin `onProjectActivated` (PUENTE stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/puerto-evento-vertical/`).
- `onRecibirRequest` usa `this._atender(e, 'recibir',
  'puerto-evento-vertical.recibir.response', async (d) => {...})` y dentro hace el
  cierre de circulo. `onHechoEmitido` NO usa `_atender` (no hay response): llama
  directamente a `_recibir` y publica el evento de dominio o el par de fallo.
- Proyeccion unica `_recibir(input)` → `{status, data}`; construye el sobre `crudo`.
  Tool directa `toolRecibir`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP hacia delante: lo consume `normalizador-hecho` (A2) via `contabilidad.hecho_crudo`.
