---
name: puerto-fuente-datos
description: >
  Skill FULL del módulo PUENTE (stateless) `puerto-fuente-datos` de la vertical
  nichos (Radar de Nichos). Es el puerto abierto hacia las fuentes de datos de
  validación/búsqueda (buscadores, APIs, scraping, comunidades): declara/conecta y
  reemplaza fuentes de forma AGNÓSTICA al vendor (cada fuente se registra y se puede
  sustituir por evento, sin acoplarse a una API concreta), consulta datos de un nicho
  y emite el resultado con su par de fallo. Úsala para operar, depurar o extender el
  puente, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites consultar datos de un nicho hacia una fuente (RPC nichos.fuente.consultar.request),
    conectar una fuente de la whitelist o sustituir una fuente por otra.
  - Cuando depures por qué una fuente no se autoriza (403), no está conectada (404),
    o por qué la consulta no pudo completarse (paquete de fallo).
  - Cuando quieras entender el patrón de PUERTO (whitelist de puertos reemplazables por
    evento, sin vendor acoplado) y su contrato de eventos.
  - Cuando vayas a escribir/ampliar el test unitario del puente.
tags: [enki, modulo, puente, stateless, nichos, radar, fuente-datos, proyecto-3d]
---

# puerto-fuente-datos — PUENTE (stateless) de las fuentes de datos del Radar

## Qué hace el módulo

`puerto-fuente-datos` es un **PUENTE STATELESS** (J1): cero persistencia, solo enruta.
Es el puerto abierto hacia las fuentes de datos de validación/búsqueda (buscadores, APIs,
scraping, comunidades). Declara y normaliza el acceso a distintas fuentes de forma
**AGNÓSTICA al vendor** — cada fuente se registra y se puede sustituir por evento, sin
acoplarse a una API concreta.

Cuatro proyecciones puras:

- `_autorizar`: valida que la fuente esté en la whitelist autorizada por el dueño.
- `_conectar`: declara/conecta una fuente (swap sin acople; publica `conectada`).
- `_reemplazar`: sustituye una fuente conectada por otra declarada (publica `reemplazada`).
- `_consultar`: enruta el pedido de datos de un nicho hacia la fuente activa →
  `DatasetBruto + Rate + Coste`.

Sin store, sin red, sin custodio: cada op entra objeto y sale objeto; el código enruta
peticiones y **NO asume un vendor concreto**. El registro de fuentes vive solo en memoria
(`this.fuentes`), así que es efímero entre arranques — es un puerto, no una base de datos.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.fuente.consultar.request` | `onConsultarRequest` | RPC puro: {nicho, fuente?, pagina?} → DatasetBruto + Rate + Coste. Enruta hacia la fuente activa conectada (agnóstico al vendor); si no hay fuente conectada o la pedida no está conectada → par determinista `nichos.fuente.consultar.failed`. Éxito → responde por `nichos.fuente.consultar.response`. |
| `nichos.fuente.conectar.request` | `onConectarRequest` | RPC puro: {fuente, config?} → ok. Declara y CONECTA una fuente de la whitelist autorizada por el dueño, con swap sin acople a vendor. Éxito → publica `nichos.fuente.conectada` y responde por `nichos.fuente.conectar.response`; fuente no autorizada → error 403. |
| `nichos.fuente.reemplazar.request` | `onReemplazarRequest` | RPC puro: {fuente, por, config?} → ok. Sustituye una fuente conectada por otra declarada (puerto reemplazable por evento, sin vendor acoplado). Éxito → publica `nichos.fuente.reemplazada` y responde por `nichos.fuente.reemplazar.response`; fuente origen no conectada → error 404. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.fuente.conectada` | Fire-and-forget (J1): una fuente fue conectada/declarada → {fuente, conectada:true, reemplaza, config}. La consumen gestion-limites-fuente (J3), coste-fuente (J4) y el pipeline-por-nicho (L1). |
| `nichos.fuente.reemplazada` | Fire-and-forget (J1): una fuente conectada fue sustituida por otra → {de, a, reemplazada:true, config}. La consumen gestion-limites-fuente (J3), coste-fuente (J4) y el pipeline-por-nicho (L1). |
| `nichos.fuente.consultar.failed` | Par de fallo determinista (J1): la consulta de datos a una fuente no pudo completarse → {status, error:{code:'FUENTE_NO_CONECTADA'|'INVALID_INPUT', message}}. Cierra el círculo de nichos.fuente.consultar.request. |

> **Regla de cierre de círculo**: el par de fallo canónico es `nichos.fuente.consultar.failed`,
> emitido solo en `onConsultarRequest` cuando `_consultar` devuelve un status distinto de 200.
> Los handlers `conectar`/`reemplazar` NO emiten un par `*.failed` propio: si fallan solo
> responden el error por su `.response` (los códigos de error van en el body del response).

## Reglas de negocio

1. **Whitelist de PUERTOS, no de APIs (agnóstico a vendor)**: `_autorizar` acepta solo
   `buscador | api | scraping | comunidad`. Cada entrada es un puerto reemplazable por evento,
   NO un proveedor concreto. Fuera de la whitelist → `403 PERMISSION_DENIED` con mensaje
   `"la fuente 'X' no esta en la whitelist autorizada por el duenyo"`.
2. **Fuente requerida**: `_autorizar`/`_conectar` devuelven `400 INVALID_INPUT` (`'fuente requerida'`)
   si `fuente` no es un string no vacío; `_reemplazar` devuelve `400 'fuente y destino requeridos'`
   si falta `fuente` o `por`; `_consultar` devuelve `400 INVALID_INPUT` (`'nicho requerido'`) sin `nicho`.
3. **Conectar = swap sin acople**: `_conectar` marca `estado: 'conectada'`, `reemplaza: previa`
   (true si ya existía) y `conectada_en` ISO. Re-conectar la misma fuente la actualiza.
4. **Reemplazar exige origen conectado**: `_reemplazar` borra la fuente origen y registra `por`
   con `reemplazada: fuente`. Si el origen no está conectado → `404 RESOURCE_NOT_FOUND`
   (`"la fuente 'X' no esta conectada"`).
5. **Consultar enruta a la fuente activa**: `_consultar` usa `fuente` si viene, o la primera
   de `this.fuentes`. Sin ninguna fuente → `404 RESOURCE_NOT_FOUND`
   (`'no hay fuente conectada; conecta una antes (nichos.fuente.conectar.request)'`); con `fuente`
   pedida no conectada → `404 RESOURCE_NOT_FOUND` (`"la fuente 'X' no esta conectada"`).
6. **Respuesta de consulta (transmisión, no interpretación)**: el puente devuelve
   `{ nicho, fuente, proveedor_tipo, dataset_bruto:{items:[], pagina, semilla}, rate:{por_minuto:10, usados_pagina}, coste:{creditos:1, moneda:'creditos'} }`.
   El puente NO asume el formato del vendor — solo transmite resultado/rate/coste.
7. **Estado en memoria, sin persistencia**: `this.fuentes` es un `Map` en RAM. No hay
   PosPersistencia ni `project.activated`: el registro de fuentes es efímero por instancia.

## Cómo se usa (RPCs)

RPCs request/response que responden en `*.response`. Conectar → `nichos.fuente.conectar.request`,
reemplazar → `nichos.fuente.reemplazar.request`, consultar → `nichos.fuente.consultar.request`.

### 1. `conectar` — declarar y conectar una fuente de la whitelist

```json
{ "fuente": "buscador", "config": { "tipo": "google" } }
```
Respuesta `200`:
```json
{ "fuente": "buscador", "conectada": true, "reemplaza": false, "config": { "id": "buscador", "tipo": "google", "estado": "conectada", "reemplaza": false, "conectada_en": "..." } }
```
Emite `nichos.fuente.conectada` con el mismo `data`.

### 2. `reemplazar` — sustituir una fuente conectada por otra declarada

```json
{ "fuente": "buscador", "por": "api", "config": { "tipo": "serpapi" } }
```
Respuesta `200`:
```json
{ "de": "buscador", "a": "api", "reemplazada": true, "config": { "id": "api", "tipo": "serpapi", "estado": "conectada", "reemplazada": "buscador", "conectada_en": "..." } }
```
Emite `nichos.fuente.reemplazada`.

### 3. `consultar` — pedir datos de un nicho a la fuente activa

```json
{ "nicho": "salsa picante para restaurantes", "pagina": 1 }
```
Respuesta `200`:
```json
{
  "nicho": "salsa picante para restaurantes",
  "fuente": "buscador",
  "proveedor_tipo": "generica",
  "dataset_bruto": { "items": [], "pagina": 1, "semilla": "salsa picante para restaurantes" },
  "rate": { "por_minuto": 10, "usados_pagina": 1 },
  "coste": { "creditos": 1, "moneda": "creditos" }
}
```
Responde por `nichos.fuente.consultar.response`; sin evento de dominio en éxito (solo transmisión).

### Fallos típicos

- Fuente fuera de whitelist → `403` `{ status:403, error:{ code:'PERMISSION_DENIED', message:"la fuente 'X' no esta en la whitelist autorizada por el duenyo" } }`.
- Sin fuente conectada al consultar → `404` `{ status:404, error:{ code:'RESOURCE_NOT_FOUND', message:'no hay fuente conectada; conecta una antes (nichos.fuente.conectar.request)' } }` + `nichos.fuente.consultar.failed`.
- Fuente pedida no conectada → `404` + `nichos.fuente.consultar.failed`.

## Tests

El test vive en `tests/unit/puerto-fuente-datos.test.js`. Cubre:

- `conectar` autoriza y conecta una fuente de la whitelist (`200`) y publica `nichos.fuente.conectada`;
  fuera de whitelist → `403 PERMISSION_DENIED`; sin fuente → `400 INVALID_INPUT`.
- `reemplazar` sustituye una fuente conectada (`200`) y publica `nichos.fuente.reemplazada`;
  origen no conectado → `404`.
- `consultar` enruta hacia la fuente activa → `200` con DatasetBruto + Rate + Coste;
  sin fuente conectada → `404` + `nichos.fuente.consultar.failed`; sin `nicho` → `400`.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/puerto-fuente-datos
node tests/unit/puerto-fuente-datos.test.js
```

## Notas de implementación

- Clase `PuertoFuenteDatos extends ModuloHibridoReflejo`; `name = 'puerto-fuente-datos'`,
  `version = 'reflejo-0.1.0'`. Sin PosPersistencia ni `project.activated` (stateless).
- Estado en memoria: `this.fuentes = new Map()` (fuente → {id, tipo, estado, reemplaza/reemplazada, conectada_en}).
- Handlers RPC delegan en `_atender(e, accion, 'nichos.fuente.<accion>.response', fn)`.
- `onConsultarRequest` publica `nichos.fuente.consultar.failed` si `status !== 200`;
  `onConectarRequest`/`onReemplazarRequest` publican `conectada`/`reemplazada` solo con `status === 200`.
- `_autorizar`/`_conectar`/`_reemplazar`/`_consultar` son proyecciones puras (sin IO).
- DEP hacia delante: los consumen `gestion-limites-fuente` (J3), `coste-fuente` (J4) y
  `pipeline-por-nicho` (L1) vía `nichos.fuente.conectada`/`reemplazada`.
