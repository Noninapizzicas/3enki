---
name: puerto-nomina
description: >
  Skill FULL del módulo PUENTE `puerto-nomina` de la vertical contabilidad de Enki.
  LA FRONTERA CON EL SISTEMA DE NÓMINAS EXTERNO: por aquí ENTRA el hecho de nómina de fuera
  (lo que calculó el programa de personal o la gestoría). Contabilidad se ADAPTA: no impone
  formato, no exige catálogo de conceptos y NO calcula nada — RECIBE. Origen, conceptos, tipos y
  bases son declarables. Sin estado. Úsala para operar, depurar o extender el puente, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites dar entrada a una nómina externa (RPC puerto-nomina.recibir.request).
  - Cuando depures por qué se rechaza la entrada (400 ORIGEN_NO_DECLARADO si falta el origen, 400
    INVALID_INPUT si falta la nómina) o por qué un campo aparece `null` y en `faltantes`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    puente (origen declarable, conceptos tal cual, no calcula la nómina, dato ausente = desconocido).
  - Cuando vayas a escribir/ampliar el test unitario del puente puerto-nomina.
tags: [enki, modulo, puente, contabilidad, puerto-nomina]
---

# puerto-nomina — PUENTE STATELESS de la frontera de nómina

## Qué hace el módulo

`puerto-nomina` es un **PUENTE STATELESS** (G4, hoja del plan): **LA FRONTERA CON EL SISTEMA DE
NÓMINAS EXTERNO**. Por aquí **ENTRA** el dato de nómina de fuera: la nómina que ha calculado el
programa de personal (o la gestoría), o el hecho que el sistema externo publica. Contabilidad se
**ADAPTA**: **NO impone formato, NO exige un catálogo de conceptos y NO calcula nada — RECIBE.**

**ORIGEN DECLARABLE** (atributo del diseño): qué sistema/canal entrega la nómina lo **DECLARA** el
negocio (`origen`); si el origen no existe todavía, **se CREA el puerto** para él. Sin `origen`
declarado **NO se adivina** de dónde viene el dato (`400 ORIGEN_NO_DECLARADO`) y nada se cablea:
ningún proveedor, ningún formato, ningún concepto tipo.

**LOS CONCEPTOS, TIPOS Y BASES SON DECLARABLES**: el puerto **NO normaliza** un concepto a un
catálogo fijo ni conoce ninguna tabla legal; **transporta los conceptos TAL CUAL llegan** y declara
en `faltantes` los campos que la propia fuente declaró como mínimos y no vinieron.

**ESTE MÓDULO NO CALCULA LA NÓMINA** (`calculado_aqui:false`,
`calculo_delegado_a:'sistema-de-nomina-externo'`): no deriva bruto, ni retención, ni cotización, ni
neto — eso es del sistema externo; aquí solo se **RECIBE** el hecho y se le da entrada al bus.

Invariante: **dato ausente = desconocido** (se declara en `faltantes`), **jamás se estima ni se
completa**. **La fuente manda.**

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección `_recibir`. Cierra el
círculo de error con `puerto-nomina.recibir.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `puerto-nomina.recibir.request` | `onRecibirRequest` | RPC puente (frontera, stateless): {project_id?, origen, canal?, nomina\|hecho\|entrada, campos_minimos?, clave_natural?, origenes_declarables?} → {project_id, origen, canal, contrato:'declarado'\|'no_declarado', minimos_faltantes, nomina:{clave_natural, empleado, periodo, bruto, retencion, cotizacion_trabajador, neto, conceptos, metadatos, faltantes, abierto, calculado_aqui:false, calculo_delegado_a:'sistema-de-nomina-externo'}}. El origen es declarable — sin el → ORIGEN_NO_DECLARADO (se dice que hay que declararlo; si el origen no existe, se crea). Los conceptos/tipos/bases viajan tal cual los entrega la fuente (cero catalogo cableado) y los importes se COPIAN, nunca se calculan. Exito → publica contabilidad.nomina_recibida y responde por puerto-nomina.recibir.response; nomina ausente → puerto-nomina.recibir.failed. |
| `nomina.recibida` | `onNominaRecibida` | Fire-and-forget: el sistema de personal ya emitio su nomina en su bus → se le da entrada al puerto (misma proyeccion `_recibir`; origen declarado en el payload). Exito → publica contabilidad.nomina_recibida; no recibe entrada → puerto-nomina.recibir.failed. |
| `nomina.emitida` | `onNominaEmitida` | Fire-and-forget: la nomina quedo emitida por el sistema de personal → se le da entrada al puerto (misma proyeccion `_recibir`). Exito → publica contabilidad.nomina_recibida; no recibe entrada → puerto-nomina.recibir.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `puerto-nomina.recibir.response` | Respuesta RPC correlada de puerto-nomina.recibir.request → {request_id, status:200, data:{origen, canal, contrato, minimos_faltantes, nomina}}. Emitida por el helper _atender. |
| `puerto-nomina.recibir.failed` | Par de fallo determinista (G4): origen no declarado (400 ORIGEN_NO_DECLARADO, con origenes_declarables) o nomina ausente → {status, error:{code, message, details?}}. Cierra el circulo de puerto-nomina.recibir.request. |
| `contabilidad.nomina_recibida` | Fire-and-forget (G4): el hecho de nomina entro al sistema por la frontera → {project_id, origen, canal, nomina, clave_natural, faltantes, correlation_id}. Lo LEEN recibo-nomina (G1, le da forma asentable) y el resto del grupo de personal. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `puerto-nomina.recibir.failed` cierra el círculo de `puerto-nomina.recibir.request` (y sirve
> de par declarado para las dos entradas fire-and-forget, cuando `_recibir` devuelve status ≠ 200:
> origen ausente `400 ORIGEN_NO_DECLARADO` o nómina ausente `400 INVALID_INPUT`).

> Nota de honestidad (cruce con `index.js`): las tres entradas (`onRecibirRequest`,
> `onNominaRecibida`, `onNominaEmitida`) publican `puerto-nomina.recibir.failed` si `_recibir`
> devuelve ≠ 200, y `contabilidad.nomina_recibida` si devuelve `200`. En la RPC, el camino de éxito
> lo cierra además `_atender` con `puerto-nomina.recibir.response`. Las dos fire-and-forget **no**
> usan `_atender` y devuelven el resultado como acuse.

> Nota: el módulo expone `toolRecibir(params)` como **tool directa** (misma proyección `_recibir`)
> — no es un evento del bus, no figura en `module.json`. Tampoco figuran `_clave`, `_origenes`,
> `_num` ni `_emitirRecibida` (utilidades internas).

## Reglas de negocio

1. **El ORIGEN es DECLARABLE y obligatorio**: `origen = input.origen ?? input.sistema` (trim).
   Vacío → `400 ORIGEN_NO_DECLARADO` con
   `message:'hay que declarar el origen del dato de nomina (que sistema/canal lo entrega); si el
   origen no existe, se crea el puerto para el'` y `details:{origenes_declarables}`.
   `_origenes(input)` devuelve `input.origenes_declarables` (array de strings no vacíos) o `[]` — el
   módulo **no conoce** ningún sistema de memoria.
2. **La NÓMINA se acepta TAL CUAL**: `input.nomina ?? input.hecho ?? input.entrada`; ausente →
   `400 INVALID_INPUT` (`field:'nomina'`). Si no es objeto, se envuelve como `{documento: externo}`.
3. **`project_id` es OPCIONAL**: `input.project_id || this.project_id || null`. La frontera **no
   exige** `project_id` (no es un camino de fallo).
4. **El molde del sobre** (`CAMPOS_NOMINA`): `['empleado', 'periodo', 'bruto', 'retencion',
   'cotizacion_trabajador', 'neto', 'conceptos', 'moneda']` — solo **nombres**, no valores. Cada
   campo que no viene (`undefined`/`null`/`''`) queda `null` y se **apila en `faltantes`**.
5. **Los importes se COPIAN, nunca se calculan**: `bruto`, `retencion`, `cotizacion_trabajador` y
   `neto` se normalizan con `_num`; si no son finitos → `null` y también entran en `faltantes`.
   **El puerto no deriva bruto, retención, cotización ni neto.**
6. **Los CONCEPTOS viajan declarados tal cual**: `fuente.conceptos` array → cada elemento objeto se
   copia (`{...c}`) o se envuelve como `{concepto: c}`; sin array → `[]` (o `valores.conceptos` si
   venía). **Ningún catálogo cableado de conceptos/tipos/bases.**
7. **Mínimos declarados por la fuente** (`campos_minimos`): si la fuente los declara, se verifican y
   los ausentes van a `minimos_faltantes`; si no los declara, **no se le exige nada**
   (`contrato:'no_declarado'`). `contrato` es `'declarado'` o `'no_declarado'` según vengan o no.
8. **La clave natural NO se inventa**: `input.clave_natural` si viene; si no `fuente.clave`; si no
   se **deriva** del molde `empleado|periodo` (con `-` en los huecos); sin ambos → `null`.
9. **Los campos extra se conservan** en `metadatos` (todo lo que no está en `CAMPOS_NOMINA`) — **no
   se pierde nada** de lo que la fuente entregó.
10. **La respuesta de la nómina** lleva `{origen, canal, clave_natural, ...valores, conceptos,
    metadatos, faltantes, abierto: faltantes, calculado_aqui:false,
    calculo_delegado_a:'sistema-de-nomina-externo', recibido_en}`. `abierto` es el array
    `faltantes` (no un booleano). `recibido_en` se sella con `new Date().toISOString()`.
11. **NO escribe, NO persiste, NO muta**: stateless puro. Sin `PosPersistencia`, sin
    `onProjectActivated`.
12. **HTTP exacto**: éxito `200`; origen ausente → `400 ORIGEN_NO_DECLARADO`; nómina ausente →
    `400 INVALID_INPUT`; excepción en `_atender` → `500 UNKNOWN_ERROR` (solo en la vía RPC).

## Cómo se usa (RPCs)

Responde en `puerto-nomina.recibir.response` y emite `contabilidad.nomina_recibida`; el error cierra
con `puerto-nomina.recibir.failed`.

### 1. `recibir` — la fuente entrega la nómina

```json
{
  "project_id": "e57a318a-...",
  "origen": "programa-personal",
  "canal": "api",
  "nomina": { "empleado": "E-014", "periodo": "2026-09", "bruto": 2100, "retencion": 210, "cotizacion_trabajador": 133, "neto": 1757, "moneda": "EUR", "conceptos": [ { "concepto": "salario base", "importe": 2100 } ] },
  "campos_minimos": ["empleado", "periodo", "neto"],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...", "origen": "programa-personal", "canal": "api",
  "contrato": "declarado", "minimos_faltantes": [],
  "nomina": { "origen": "programa-personal", "canal": "api", "clave_natural": "E-014|2026-09", "empleado": "E-014", "periodo": "2026-09", "bruto": 2100, "retencion": 210, "cotizacion_trabajador": 133, "neto": 1757, "conceptos": [ { "concepto": "salario base", "importe": 2100 } ], "moneda": "EUR", "metadatos": {}, "faltantes": [], "abierto": [], "calculado_aqui": false, "calculo_delegado_a": "sistema-de-nomina-externo", "recibido_en": "2026-09-25T..." }
}
```

Emite `contabilidad.nomina_recibida` (lo LEE recibo-nomina G1 y el resto del grupo de personal):

```json
{ "project_id": "e57a318a-...", "origen": "programa-personal", "canal": "api", "nomina": { "...": "..." }, "clave_natural": "E-014|2026-09", "faltantes": [], "correlation_id": "abc-123" }
```

### 2. `recibir` — la fuente incompleta (nada se estima)

Sin `bruto` ni `moneda` en la fuente → `nomina.bruto:null`, `nomina.moneda:null`,
`faltantes:["bruto","moneda"]` y `abierto:["bruto","moneda"]`. Los campos extra viajan en
`metadatos`. **No se completa ningún importe.**

### 3. Fire-and-forget — el sistema externo ya emitió su nómina

`onNominaRecibida` / `onNominaEmitida` toman `e.data || e`, llaman a la misma `_recibir` y emiten
`contabilidad.nomina_recibida` (o `puerto-nomina.recibir.failed` si no hay entrada).

### 4. Fallo — origen no declarado

Respuesta `400` + `puerto-nomina.recibir.failed`:

```json
{ "status": 400, "error": { "code": "ORIGEN_NO_DECLARADO", "message": "hay que declarar el origen del dato de nomina (que sistema/canal lo entrega); si el origen no existe, se crea el puerto para el", "details": { "origenes_declarables": [] } } }
```

### 5. Fallo — falta la nómina

Respuesta `400 INVALID_INPUT` con `{field:'nomina'}` + el par `failed`.

## Tests

El test unitario de la vertical vive en `tests/unit/puerto-nomina.test.js`. Cubre:

- `recibir` con origen + nómina → `200`, los importes **copiados** tal cual y emite
  `contabilidad.nomina_recibida`.
- Sin origen → `400 ORIGEN_NO_DECLARADO` (con `origenes_declarables`) + `.recibir.failed`.
- Sin nómina → `400 INVALID_INPUT` (`field:'nomina'`) + `.recibir.failed`.
- Un campo ausente queda `null` y aparece en `faltantes`/`abierto` (**no se estima**).
- `campos_minimos` declarados → los ausentes van a `minimos_faltantes`; sin declararlos →
  `contrato:'no_declarado'` y no se exige nada.
- Los conceptos y los campos extra viajan **tal cual** (`conceptos`, `metadatos`); **cero catálogo
  cableado**.
- `calculado_aqui:false` y `calculo_delegado_a:'sistema-de-nomina-externo'` siempre.
- `onNominaRecibida` / `onNominaEmitida` dan entrada por la misma proyección; sin entrada → par
  `failed`.
- `toolRecibir` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `PuertoNomina extends ModuloHibridoReflejo`; `name = 'puerto-nomina'`, `version =
  'reflejo-0.1.0'`. Sin store, sin `PosPersistencia`, sin `onProjectActivated` (PUENTE stateless).
- Constante `CAMPOS_NOMINA = ['empleado', 'periodo', 'bruto', 'retencion', 'cotizacion_trabajador',
  'neto', 'conceptos', 'moneda']` (solo nombres del sobre).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-fiscal/puerto-nomina/`).
- `onRecibirRequest` usa `this._atender(e, 'recibir', 'puerto-nomina.recibir.response', async (d)
  => {...})` con cierre de círculo; `onNominaRecibida` / `onNominaEmitida` **no** usan `_atender`.
- Proyección `_recibir(input)` (**síncrona**); helpers `_clave`, `_origenes`, `_num` y
  `_emitirRecibida(res, d)` (el evento de dominio). Tool `toolRecibir`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo LEEN `recibo-nomina` (G1) y el resto del grupo de personal vía
  `contabilidad.nomina_recibida`.
- **PARÁMETRO COMO DATO**: el origen, el canal, los conceptos, sus tipos y sus bases son
  **declarables**; el código **no cablea** ningún proveedor, ni formato, ni catálogo de conceptos,
  ni tabla legal. **La fuente manda**: el puente **RECIBE**, no calcula la nómina (eso es del
  sistema externo).
