---
name: canal-supervision
description: >
  Skill FULL del módulo PUENTE `canal-supervision` de la vertical nichos (Radar
  de Nichos, proyecto 3D). Es el puerto abierto del canal de supervision (Telegram
  u otro, agnóstico al proveedor): declara y conecta canales supervisados,
  sustituye canales por evento (swap sin acople a una plataforma concreta) y
  enruta notificaciones/decisiones hacia el canal activo, emitiendo la entrega con
  su par de fallo. Sin persistencia: solo enruta/comunica con el exterior. Úsala
  para operar, depurar o extender el puente, o para entender su contrato de eventos
  y sus reglas de negocio.
when-to-use: >
  - Cuando necesites conectar, reemplazar o enviar notificaciones a un canal de
    supervision (RPC nichos.canal.conectar.request / reemplazar.request / enviar.request).
  - Cuando depures por qué un envío falla (CANAL_NO_CONECTADO / RESOURCE_NOT_FOUND
    si no hay canal, INVALID_INPUT sin titulo/cuerpo).
  - Cuando quieras entender el patrón de puerto reemplazable por evento
    (Telegram es una implementación, nunca el portador) y su contrato.
  - Cuando vayas a escribir/ampliar el test unitario del puente canal-supervision.
tags: [enki, modulo, puente, stateless, nichos, radar, supervision, canal, proyecto-3d]
---

# canal-supervision — PUENTE STATELESS del canal de supervision

## Qué hace el módulo

`canal-supervision` es un **PUENTE STATELESS** (G1, hoja del plan): el **puerto
abierto del canal de supervision** (Telegram u otro). Cero persistencia: solo
enruta la supervision hacia el canal del dueño. Aplicado la regla del plan —
**Telegram es UNA implementación del puerto, NUNCA el portador**; cada canal se
registra y puede sustituirse por evento (varios canales intercambiables) sin
acoplarse a una plataforma concreta.

Tres proyecciones puras (cada op entra objeto, sale objeto):

- **`_conectar`**: declara/conecta un canal supervisado → `ok` (swap sin acople;
  publica `nichos.canal.conectado`).
- **`_reemplazar`**: sustituye un canal conectado por otro declarado → `ok`
  (publica `nichos.canal.reemplazado`).
- **`_enviar`**: enruta una notificación/decisión hacia el canal activo → entrega
  (agnóstico al proveedor; publica `nichos.canal.enviado`; fallo → par determinista
  `nichos.canal.envio_fallido`).

Sin store persistente, sin custodio: mantiene el registro de canales conectados
**en memoria** (`this.canales`, Map). El puente comunica con el exterior (el canal),
no con un vendor concreto.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.canal.conectar.request` | `onConectarRequest` | RPC puro: {canal, config?} → ok. Declara y CONECTA un canal de supervision de la whitelist declarable (Telegram u otro), con swap sin acople a plataforma concreta. Éxito → publica `nichos.canal.conectado` y responde por `nichos.canal.conectar.response`; canal faltante → error 400. |
| `nichos.canal.reemplazar.request` | `onReemplazarRequest` | RPC puro: {canal, por, config?} → ok. Sustituye un canal de supervision conectado por otro declarado (puerto reemplazable por evento, sin vendor acoplado). Éxito → publica `nichos.canal.reemplazado` y responde por `nichos.canal.reemplazar.response`; canal origen no conectado → error 404. |
| `nichos.canal.enviar.request` | `onEnviarRequest` | RPC puro: {canal?, tipo?, titulo?, cuerpo?} → entrega. Enruta una notificacion/decision hacia el canal activo (agnostico al proveedor); si no hay canal conectado o el pedido no esta conectado → par determinista `nichos.canal.envio_fallido`. Éxito → publica `nichos.canal.enviado` y responde por `nichos.canal.enviar.response`. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.canal.conectado` | Fire-and-forget (G1): un canal de supervision fue conectado/declarado → {canal, conectado:true, reemplaza, tipo, config}. La consume perfil-supervision (H2) y el pipeline-por-nicho (L1). |
| `nichos.canal.reemplazado` | Fire-and-forget (G1): un canal conectado fue sustituido por otro → {de, a, reemplazado:true, tipo, config}. La consume perfil-supervision (H2) y el pipeline-por-nicho (L1). |
| `nichos.canal.enviado` | Fire-and-forget (G1): un mensaje fue entregado al canal activo → {canal, tipo, titulo, cuerpo, entregado:true, proveedor_tipo, escalon, enviado_en}. PULSO/ALERTA/DECISION de supervision hacia el dueño. |
| `nichos.canal.envio_fallido` | Par de fallo determinista (G1): el envio de una notificacion/decision hacia el canal no pudo completarse → {status, error:{code:'CANAL_NO_CONECTADO'\|'INVALID_INPUT', message}}. Cierra el círculo de `nichos.canal.enviar.request`. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `nichos.canal.envio_fallido` cierra `nichos.canal.enviar.request` cuando
> `_enviar` devuelve status ≠ 200 (sin canal conectado o canal inválido).

> **Nota de honestidad sobre `nichos.canal.envio_fallido`**: module.json promete el
> code `CANAL_NO_CONECTADO` en la descripción, pero index.js NO usa ese código. El
> fallo real de envío emite `RESOURCE_NOT_FOUND` tanto cuando no hay canal conectado
> como cuando el canal pedido no está conectado (ambos con status `404`). El
> `_errorResponse` de la base no produce nunca `CANAL_NO_CONECTADO`.

## Reglas de negocio

1. **Canal requerido → `400 INVALID_INPUT`**: `_conectar` exige `canal` string. Si
   falta → `{ status:400, code:'INVALID_INPUT', mensaje:'canal requerido' }`. No
   emite `conectado` (no hay flujo 200).
2. **Reemplazo exige origen y destino → `400 INVALID_INPUT`**: `_reemplazar`
   requiere `canal` y `por`; sin ellos →
   `{ status:400, code:'INVALID_INPUT', mensaje:'canal y destino requeridos' }`.
3. **Canal origen no conectado → `404 RESOURCE_NOT_FOUND`**: `_reemplazar` si
   `!this.canales.has(canal)` → `{ status:404, code:'RESOURCE_NOT_FOUND',
   mensaje:'el canal \'<canal>\' no esta conectado', canal }`.
4. **Mensaje sin titulo/cuerpo → `400 INVALID_INPUT`**: `_enviar` exige `titulo`
   o `cuerpo`; sin ambos → `{ status:400, code:'INVALID_INPUT', mensaje:'titulo o cuerpo del mensaje requerido' }`.
5. **Sin canal conectado → `404 RESOURCE_NOT_FOUND`**: `_enviar` sin `canal`
   explícito usa el primero de la lista (`[...this.canales.keys()][0]`); si no hay
   canal alguno → `{ status:404, code:'RESOURCE_NOT_FOUND', mensaje:'no hay canal de supervision conectado; conecta uno antes (nichos.canal.conectar.request)' }`.
   Si el `canal` pedido no está conectado → `404 RESOURCE_NOT_FOUND` con `mensaje:'el canal \'<canal>\' no esta conectado'`.
   Todos disparan `nichos.canal.envio_fallido`.
6. **Entrega agnóstica al proveedor**: `_enviar` NO asume el formato del vendor;
   solo transmite `{ canal, tipo, titulo, cuerpo, entregado:true, proveedor_tipo:
   activo.tipo, escalon:tipo, enviado_en }`. El `tipo` por defecto es
   `notificacion` y se reusa como `escalon`.
7. **Tipo de canal por config**: `_conectar`/`_reemplazar` usan
   `config.tipo || config.plataforma || 'telegram'` (Telegram es el default, no el
   obligatorio).
8. **HTTP exacto**: éxito `200`; `conectar` sin canal → `400`; `reemplazar` sin
   origen/destino → `400`, origen no conectado → `404`; `enviar` sin contenido → `400`,
   sin canal → `404`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responden en `nichos.canal.conectar.response`,
`nichos.canal.reemplazar.response` y `nichos.canal.enviar.response`:

### 1. `conectar` — declarar y conectar un canal

```json
{ "canal": "telegram-docente", "config": { "tipo": "telegram" } }
```
Respuesta `200`:
```json
{ "canal": "telegram-docente", "conectado": true, "reemplaza": false, "tipo": "telegram", "config": { "id": "telegram-docente", "tipo": "telegram", "estado": "conectado", "reemplaza": false, "conectado_en": "2026-09-25T..." } }
```
Emite `nichos.canal.conectado` con ese mismo `data`.

### 2. `reemplazar` — sustituir un canal por otro

```json
{ "canal": "telegram-docente", "por": "telegram-administracion", "config": { "tipo": "telegram" } }
```
Respuesta `200`:
```json
{ "de": "telegram-docente", "a": "telegram-administracion", "reemplazado": true, "tipo": "telegram", "config": { "id": "telegram-administracion", "tipo": "telegram", "estado": "conectado", "reemplazada": "telegram-docente", "conectado_en": "2026-09-25T..." } }
```
Emite `nichos.canal.reemplazado` con ese mismo `data`.

### 3. `enviar` — enrutar una notificación hacia el canal activo

```json
{ "canal": "telegram-administracion", "tipo": "ALERTA", "titulo": "Proyecto sangrando", "cuerpo": "Revisa el cuadro de salud" }
```
Respuesta `200`:
```json
{ "canal": "telegram-administracion", "tipo": "ALERTA", "titulo": "Proyecto sangrando", "cuerpo": "Revisa el cuadro de salud", "entregado": true, "proveedor_tipo": "telegram", "escalon": "ALERTA", "enviado_en": "2026-09-25T..." }
```
Emite `nichos.canal.enviado` con ese mismo `data`.

### Fallo — sin canal conectado

```json
{ "tipo": "ALERTA", "titulo": "Hola", "cuerpo": "..." }
```
Respuesta `404` + `nichos.canal.envio_fallido`:
```json
{ "status": 404, "code": "RESOURCE_NOT_FOUND", "mensaje": "no hay canal de supervision conectado; conecta uno antes (nichos.canal.conectar.request)" }
```

## Tests

El test vive en `tests/unit/canal-supervision.test.js`. Cubre:

- `conectar` → `200`, declara/conecta el canal en memoria y emite `nichos.canal.conectado`.
- `conectar` sin canal → `400 INVALID_INPUT`.
- `reemplazar` de un canal conectado → `200`, sustituye y emite `nichos.canal.reemplazado`.
- `reemplazar` con origen no conectado → `404 RESOURCE_NOT_FOUND`.
- `enviar` → `200`, entrega al canal activo (agnóstico al proveedor) y emite
  `nichos.canal.enviado`.
- `enviar` sin título/cuerpo → `400 INVALID_INPUT`; sin canal conectado → `404`
  + `nichos.canal.envio_fallido`.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/canal-supervision
node tests/unit/canal-supervision.test.js
```

## Notas de implementación

- Clase `CanalSupervision extends ModuloHibridoReflejo`; `name = 'canal-supervision'`,
  `version = 'reflejo-0.1.0'`. Sin PosPersistencia (stateless); registro de canales
  conectados en memoria `this.canales` (Map). No escucha `project.activated` (el
  puente es agnóstico al proyecto).
- `onConectarRequest`, `onReemplazarRequest` y `onEnviarRequest` delegan en
  `_atender(e, '<op>', '<op>.response', fn)`. `conectar`/`reemplazar` publican su
  evento de dominio solo en 200 (`nichos.canal.conectado` / `nichos.canal.reemplazado`);
  `enviar` publica `nichos.canal.enviado` en 200 o `nichos.canal.envio_fallido` si no.
- Proyecciones puras: `_conectar`, `_reemplazar`, `_enviar`.
- DEP hacia delante: la consumen perfil-supervision (H2) y pipeline-por-nicho (L1);
  lo usa puente-humano (D2) para enrutar solicitudes hacia el dueño.
