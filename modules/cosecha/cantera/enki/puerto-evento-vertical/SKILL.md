---
name: puerto-evento-vertical
description: >
  Skill FULL del módulo PUENTE STATELESS `puerto-evento-vertical` de la vertical
  contabilidad de Enki (A1, hoja del plan). PUERTA de los hechos ya emitidos por las
  verticales (VENTA, COBRO, PAGO, COMPRA, CONSUMO, CIERRE_JORNADA, RECTIFICATIVO).
  Contabilidad LEE, NO IMPONE: la fuente manda en formato, granularidad y ritmo. El
  puerto valida SOLO la forma mínima de entrada (que el hecho sea direccionable), nunca
  el contenido. El mínimo por vertical llega por EVENTO desde contrato-hecho-minimo y se
  cachea en memoria; el puerto es REEMPLAZABLE por fuente. Sin estado. Úsala para
  operar, depurar o extender el puente, o para entender su contrato de eventos.
when-to-use: >
  - Cuando necesites admitir un hecho de una vertical por la puerta
    (RPC contabilidad.hecho.admitir.request).
  - Cuando depures por qué un hecho no se admite (INVALID_INPUT si no tiene project_id,
    vertical o carga) o por qué sale con faltantes/incompleto.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la validación
    de forma mínima (no de contenido) y la declaración de hueco a A15.
  - Cuando vayas a escribir/ampliar el test unitario del puente puerto-evento-vertical.
tags: [enki, modulo, puente, stateless, contabilidad, puerto-evento-vertical, admision]
---

# puerto-evento-vertical — PUENTE de la puerta de hechos de verticales

## Qué hace el módulo

`puerto-evento-vertical` es un **PUENTE STATELESS** (A1, hoja del plan): la **puerta** por
la que entran los hechos ya emitidos por las verticales productoras (VENTA, COBRO, PAGO,
COMPRA, CONSUMO, CIERRE_JORNADA, RECTIFICATIVO). El principio rector es que
**contabilidad LEE, NO IMPONE**: la fuente manda en formato, granularidad y ritmo; el
puerto valida **SOLO la forma mínima de entrada** (que el hecho sea direccionable),
**nunca el contenido** — juzgar el contenido es del normalizador / la contrapartida.

El **mínimo exigible** de cada vertical le llega al puente **por EVENTO** desde
`contrato-hecho-minimo` (evento `contabilidad.contrato_declarado`) y se **cachea en
memoria**. Esa es la regla dura de la plataforma: **dependencia entre módulos por
EVENTO, NUNCA `require` cruzado**. Si el mínimo calcula `faltantes`, son **ADVERTENCIA,
no bloqueo**: el hecho se admite igual (`admitido:true`) y `incompleto:true` — su destino
será `cola-revision`, no un rechazo.

El puerto es **REEMPLAZABLE por fuente** (`_reconectar`). Y si **no hay fuente** para un
hecho esperado, **se DECLARA el hueco** (`_declararHueco`, señal a A15
`declaracion-fuente-faltante`), **JAMÁS se fuerza a la fuente a producirlo**.

Es stateless: sin PosPersistencia. `project.activated` solo registra el proyecto activo
(sienta contexto); no hay nada que persistir.

> **NO REUTILIZA**: ningún módulo del inventario recibe hechos heterogéneos de otras
> verticales; un adaptador por fuente se pone en el sitio de despliegue.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.hecho.admitir.request` | `onAdmitirRequest` | RPC puente: {project_id, hecho:{vertical, payload\|datos}} → {project_id, vertical, admitido, faltantes, incompleto}. Valida SOLO la forma minima de entrada (direccionable), no el contenido; si el minimo de la vertical fue declarado, calcula faltantes como ADVERTENCIA (no bloquea: incompleto → cola-revision). Publica contabilidad.hecho_admitido y responde por contabilidad.hecho.admitir.response; si el payload es invalido → contabilidad.hecho.admitir.failed. |
| `contabilidad.contrato_declarado` | `onContratoDeclarado` | Fire-and-forget (A11 → A1): contrato-hecho-minimo declaro el minimo de una vertical → {project_id, vertical, campos}. El puente lo cachea en memoria (dependencia por EVENTO, sin require cruzado) para aplicarlo a los hechos entrantes. No impone: solo sabe que se espera. |
| `project.activated` | `onProjectActivated` | Puente stateless: registra el proyecto activo (sin estado que persistir). El hecho trae su project_id; este handler sienta el contexto del puerto. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.hecho_admitido` | Fire-and-forget (A1): un hecho de vertical paso la puerta con forma minima valida → {project_id, vertical, admitido:true, faltantes, incompleto}. Lo consume normalizador-hecho (A2) como entrada de la cadena de admision; el rastro lo anota historial-proceso-contable (P2). |
| `contabilidad.hecho.admitir.failed` | Par de fallo determinista: hecho no direccionable (sin project_id, sin vertical o sin carga). Cierra el circulo de contabilidad.hecho.admitir.request. |
| `contabilidad.hecho_admitido.failed` | Par de fallo del evento de dominio contabilidad.hecho_admitido: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.hecho.admitir.failed` cierra el círculo de
> `contabilidad.hecho.admitir.request` cuando `_admitir` devuelve status ≠ 200.

> Nota: no está en module.json pero sí lo emite index.js en `onAdmitirRequest` — el par
> de fallo `contabilidad.hecho.admitir.failed` se publica dentro del handler cuando
> `res.status !== 200`, además de la response de `_atender`.
>
> Nota: `_reconectar` y `_declararHueco` existen como proyecciones puras + Tools
> (`toolReconectar`/`toolDeclararHueco`) pero **NO tienen evento RPC en `module.json`**:
> se invocan como tools / desde el sitio de despliegue, no por RPC suscrita al bus.

## Reglas de negocio

1. **Valida SOLO la forma mínima (direccionable), NO el contenido**: `_admitir` exige
   `hecho` objeto, `hecho.vertical` no vacío y **alguna carga**
   (`hecho.payload !== undefined || hecho.datos !== undefined || hecho.importe !== undefined`).
   El contenido del payload no se juzga aquí.
2. **Validaciones de payload deterministas**: falta `project_id` (ni en el input ni en el
   contexto del proyecto activo) → `400 project_id`; `hecho` ausente/no objeto → `400 hecho`;
   sin `hecho.vertical` → `400 hecho.vertical`; sin carga → `400 hecho.payload`. Shape
   `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
3. **Los faltantes son ADVERTENCIA, no bloqueo**: si la vertical tiene mínimo cacheado,
   `_admitir` calcula `faltantes` (campos `undefined`/`null`/`''` en la carga) y devuelve
   `admitido:true` con `incompleto:true` si hay alguno. **Contabilidad LEE, no impone**:
   lo incompleto sigue su camino → `cola-revision`. Invariante **Cero estimación**: el
   puerto **no rellena** los faltantes.
4. **Dependencia por EVENTO, nunca `require` cruzado**: el mínimo llega por
   `contabilidad.contrato_declarado` (de `contrato-hecho-minimo`) y se guarda en el cache
   en memoria `this._minimos` (vertical → `[campos]`).
5. **El puerto es REEMPLAZABLE por fuente**: `_reconectar({fuente, adaptador})` registra
   el estado del puerto por fuente en `this._puertos` (`conectado:true`,
   `reconectado_en`). La fuente manda; el puerto se adapta.
6. **Si falta fuente, se DECLARA el hueco — NUNCA se fuerza**: `_declararHueco` devuelve
   `{ hueco, accion:'DECLARAR_HUECO_A15'|'NINGUNA', forzado:false }`. `forzado` es siempre
   `false`: **jamás se fuerza a la fuente a producir el hecho** (señal a A15
   `declaracion-fuente-faltante`).
7. **`contrato_aplicado`**: la respuesta informa si se aplicó un mínimo (`minimo.length > 0`),
   de modo que se distingue "sin contrato declarado" de "contrato cumplido".
8. **HTTP exacto**: éxito `200`; payload inválido → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

La RPC responde en `contabilidad.hecho.admitir.response`.

### 1. `admitir` — admitir un hecho de vertical (valida forma mínima)

```json
{
  "project_id": "e57a318a-...",
  "hecho": {
    "vertical": "COMPRA",
    "payload": { "proveedor": "ACME SL", "nif": "B12345678", "total": 121 }
  },
  "correlation_id": "abc-123"
}
```
Respuesta `200` (hay mínimo declarado y faltan `base` e `iva`: se admite igual):
```json
{
  "project_id": "e57a318a-...",
  "vertical": "COMPRA",
  "admitido": true,
  "faltantes": ["base", "iva"],
  "incompleto": true,
  "contrato_aplicado": true
}
```
Emite `contabilidad.hecho_admitido` (res.data + correlation_id):
```json
{ "project_id": "e57a318a-...", "vertical": "COMPRA", "admitido": true, "faltantes": ["base", "iva"], "incompleto": true, "correlation_id": "abc-123" }
```

### 2. Fire-and-forget `contabilidad.contrato_declarado` — cachear el mínimo (no es RPC)

```json
{ "project_id": "e57a318a-...", "vertical": "COMPRA", "campos": ["proveedor", "nif", "base", "iva", "total", "fecha"] }
```
Respuesta interna `200`:
```json
{ "vertical": "COMPRA", "campos": ["proveedor", "nif", "base", "iva", "total", "fecha"] }
```
Si el evento no trae `vertical` → devuelve `null` y no cachea nada.

### 3. Tools (sin RPC en module.json): reconectar y declarar hueco

`_reconectar` / `toolReconectar`:
```json
{ "fuente": "POS_PIZZEPOS", "adaptador": "adaptador-pos" }
```
→ `{ "project_id": null, "puerto": { "fuente": "POS_PIZZEPOS", "adaptador": "adaptador-pos", "conectado": true, "reconectado_en": "2026-09-28T..." } }`

`_declararHueco` / `toolDeclararHueco`:
```json
{ "project_id": "e57a318a-...", "fuente": "VERTICAL_X", "vertical": "PAGO" }
```
→ `{ "project_id": "e57a318a-...", "fuente": "VERTICAL_X", "vertical": "PAGO", "hueco": true, "accion": "DECLARAR_HUECO_A15", "forzado": false }`
(si la fuente ya está conectada → `hueco:false, accion:'NINGUNA'`; sin `vertical` → `400 INVALID_INPUT vertical`).

### Fallo — hecho no direccionable

```json
{ "project_id": "e57a318a-...", "hecho": { "datos": { "x": 1 } } }
```
Respuesta `400` + `contabilidad.hecho.admitir.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "hecho.vertical requerido", "details": { "field": "hecho.vertical" } } }
```

## Tests

El test vive en `tests/unit/puerto-evento-vertical.test.js`. Cubre:

- `admitir` con hecho direccionable (vertical + payload) → `200 {admitido:true}` y emite
  `contabilidad.hecho_admitido`.
- Tras recibir `contabilidad.contrato_declarado`, `admitir` calcula `faltantes` como
  advertencia (`incompleto:true`) **sin bloquear**.
- `admitir` sin `project_id`/`vertical`/carga → `400 INVALID_INPUT` +
  `contabilidad.hecho.admitir.failed`.
- `project.activated` registra el proyecto activo (stateless, sin persistir).
- `_reconectar` registra el puerto; `_declararHueco` devuelve `hueco:true` si no hay
  puerto, y `forzado:false` siempre.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/puerto-evento-vertical
node --test tests/unit/puerto-evento-vertical.test.js
```

## Notas de implementación

- Clase `PuertoEventoVertical extends ModuloHibridoReflejo`; `name =
  'puerto-evento-vertical'`, `version = 'reflejo-0.1.0'`. **PUENTE stateless**: solo
  cache en memoria `this._minimos` (vertical → `[campos]`) y `this._puertos`
  (fuente → estado del puerto), más `this.project_id`. Nada que persistir.
- `onAdmitirRequest` delega en `_atender(e, 'admitir',
  'contabilidad.hecho.admitir.response', fn)`; emite el evento de dominio o el par
  determinista dentro de la proyección, propagando `correlation_id`.
- `onContratoDeclarado` es fire-and-forget: cachea el mínimo y loguea
  `${this.name}.contrato_cacheado`. `onProjectActivated` registra el `project_id`.
- Proyecciones puras: `_admitir` (validación de forma mínima), `_reconectar`
  (puerto reemplazable) y `_declararHueco` (señal a A15, `forzado:false`).
  `_invalid`/`_errorResponse` vienen de `modulo-hibrido-reflejo`.
- Tools: `toolAdmitir` → `_admitir`, `toolReconectar` → `_reconectar`,
  `toolDeclararHueco` → `_declararHueco`.
- DEP hacia delante: lo consume `normalizador-hecho` (A2) como entrada de la cadena;
  el rastro lo anota `historial-proceso-contable` (P2); el hueco alimenta A15
  `declaracion-fuente-faltante`.
