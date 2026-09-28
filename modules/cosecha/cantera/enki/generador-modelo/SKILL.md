---
name: generador-modelo
description: >
  Skill FULL del módulo PUENTE `generador-modelo` de la vertical contabilidad de Enki
  (D7, hoja del plan). EL SISTEMA PREPARA; EL ASESOR PRESENTA. Genera el documento del
  modelo fiscal (303/130/111/190...) desde las fuentes declarables (`liquidacion-iva`
  D1/D2/D3, `retenciones-is-irpf` D4/D5, estados-contables para resumen) y lo ENTREGA
  al programa del asesor por PUERTO de formato ABIERTO y DECLARABLE; aquí termina su
  responsabilidad: NO presenta, NO firma, NO envía a ninguna administración. EL MODELO
  Y EL EJERCICIO SON DECLARABLES (número de modelo, ejercicio y periodo = DATO, no
  constantes cableadas); sin modelo/ejercicio → 422 PRECONDITION_FAILED. Los valores se
  DERIVAN de las fuentes por EVENTO/payload (contrato TOLERANTE: si la fuente no
  responde → 503 DEPENDENCIA_NO_DISPONIBLE y NUNCA un modelo con cifras inventadas).
  Stateless: sin PosPersistencia ni project.activated. Úsala para operar, depurar o
  extender el puente, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites generar el documento de un modelo fiscal (RPC
    contabilidad.modelo.generar.request) desde las fuentes.
  - Cuando depures por qué no se genera (422 PRECONDITION_FAILED si faltan modelo o
    ejercicio, 503 DEPENDENCIA_NO_DISPONIBLE si la fuente no responde, 400 INVALID_INPUT
    si falta project_id) o por qué la entrega queda NO_DECLARADO (sin puerto declarado).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), por qué el
    modelo/ejercicio son datos y por qué el sistema prepara pero no presenta.
  - Cuando vayas a escribir/ampliar el test unitario del puente generador-modelo.
tags: [enki, modulo, puente, contabilidad, generador-modelo, fiscal, declarable]
---

# generador-modelo — PUENTE · genera el modelo fiscal y lo entrega por puerto

## Qué hace el módulo

`generador-modelo` es un **PUENTE STATELESS** (D7, hoja del plan): **EL SISTEMA PREPARA;
EL ASESOR PRESENTA**. Genera el **documento del modelo fiscal** (303/130/111/190…) a
partir de las **fuentes declarables** (`liquidacion-iva` D1/D2/D3, `retenciones-is-irpf`
D4/D5, `estados-contables` para resumen) y lo **ENTREGA** al **programa del asesor** por
**PUERTO de formato ABIERTO y DECLARABLE**. **Termina aquí la responsabilidad del
sistema**: **NO presenta, NO firma, NO envía** a ninguna administración — eso es del
asesor (declarable).

**EL MODELO Y EL EJERCICIO SON DECLARABLES**: el número de modelo, el ejercicio y el
periodo son **PARÁMETROS (dato)**, no constantes cableadas; **sin modelo/ejercicio →
`422 PRECONDITION_FAILED`**. Los valores del modelo se **DERIVAN** de las fuentes por
**EVENTO/payload**; contrato **TOLERANTE**: si la fuente **no responde**, se **declara**
y **NUNCA se emite un modelo con cifras inventadas**. Si **no hay puerto declarado**, se
responde **`NO_DECLARADO`** — **jamás se finge una presentación**.

Es **stateless**: **sin PosPersistencia ni `project.activated`** — cada op **entra
objeto, sale objeto**. El catálogo de puertos de salida vive **solo en memoria del
proceso** (`this._puertos`, un `Map`), no en disco: es el **registro de
programas/formatos puestos en el sitio**, no una parcela de dominio. La dependencia es
**por EVENTO, NUNCA por `require` cruzado**.

> **NO REUTILIZA**: la generación de modelos fiscales con puerto abierto **no existe**;
> hay que construirlo.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.modelo.generar.request` | `onGenerarRequest` | RPC puente (D7): {project_id, modelo:'303'\|'130'\|'111'\|'190'\|..., ejercicio\|periodo, puerto?, casillas?\|valores?, formato?, nif?, sociedad?} → {project_id, modelo, ejercicio, documento:{casillas, resumen, preparado_por_el_sistema:true, presentado:false, firmado:false}, fuente, entrega, entrega_declarada, prepara_no_presenta:true}. Genera el documento desde la fuente (liquidacion-iva / retenciones-is-irpf por EVENTO, o valores declarados) y lo entrega por PUERTO declarable. Modelo y ejercicio son DATO (sin ellos → 422); sin valores de fuente → 503 DEPENDENCIA_NO_DISPONIBLE; sin puerto → NO_DECLARADO (no se finge la presentacion). Exito publica contabilidad.modelo_generado y contabilidad.modelo_entregado; responde por contabilidad.modelo.generar.response; error → contabilidad.modelo.generar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.modelo_generado` | Fire-and-forget (D7): el documento del modelo fiscal quedo GENERADO (el sistema PREPARA) → {project_id, modelo, ejercicio, documento:{casillas, resumen, presentado:false, firmado:false, preparado_por_el_sistema:true}, fuente}. Lo consume estado-presentacion-fiscal (D12, obligacion → generada) y el asesor. Nunca un modelo con cifras inventadas. |
| `contabilidad.modelo_entregado` | Fire-and-forget (D7): el documento se ENTREGO al programa del asesor por PUERTO declarable → {project_id, modelo, ejercicio, entregado:true, puerto, formato, programa, presentado:false, firmado:false}. El sistema termina su responsabilidad aqui: NO presenta ni firma. |
| `contabilidad.modelo.generar.failed` | Par de fallo determinista: sin project_id (400), modelo/ejercicio no declarados (422 PRECONDITION_FAILED: entran como DATO), o fuente de valores no disponible (503 DEPENDENCIA_NO_DISPONIBLE: no se emite un modelo inventado). Cierra el circulo de contabilidad.modelo.generar.request. |
| `contabilidad.modelo_generado.failed` | Par de fallo del evento de dominio contabilidad.modelo_generado: la emision del hecho de dominio no se completo. |
| `contabilidad.modelo_entregado.failed` | Par de fallo: el puerto de salida NO esta declarado (NO_DECLARADO) o la entrega al programa del asesor no se confirmo — se DECLARA, no se finge la presentacion. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.modelo.generar.failed` cierra `contabilidad.modelo.generar.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.modelo.generar.response` (el par response del RPC); **NO está declarada
> en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical:
> el par de fallo real es `<op>.failed`) — `contabilidad.modelo_generado.failed` es el par
> del evento de **DOMINIO**; el puente solo publica el par `*.failed` de su RPC. En
> cambio `contabilidad.modelo_entregado.failed` **sí** se emite: en `onGenerarRequest`,
> cuando `_entregar` no termina en `200` (sin puerto → `NO_DECLARADO`), se publica como
> par del **enrutado/entrega** — no se finge la presentación.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.iva.liquidar.request`, `contabilidad.retenciones.calcular.request` y
> `contabilidad.estado.resultado.request` (dependencias por EVENTO hacia las fuentes, no
> declaradas como publishers).

## Reglas de negocio

1. **El sistema PREPARA; no presenta ni firma**: el documento generado lleva siempre
   `preparado_por_el_sistema:true`, **`presentado:false`** y **`firmado:false`**; la
   respuesta marca `prepara_no_presenta:true`. **Termina la responsabilidad aquí.**
2. **Modelo y ejercicio DECLARABLES (entran como DATO)**: `_generar` exige `modelo`
   (`modelo`/`numero_modelo`) → sin él **`422 PRECONDITION_FAILED`**
   (`modelos_conocidos`); y `ejercicio` (`ejercicio`/`periodo`) → sin él **`422`**
   (`no_declarado:true`). No hay constantes legales cableadas.
3. **Los valores se DERIVAN de las fuentes, nunca se inventan**: `_valoresDe` acepta
   `casillas`/`valores` declarados (fuente `'DECLARADAS'`); si no, según el modelo pide
   por **EVENTO** (timeout 4000ms):
   - modelos de `FUENTES.LIQUIDACION_IVA` (`303`,`390`,`390S`) → `contabilidad.iva.liquidar.request`;
   - modelos de `FUENTES.RETENCIONES` (`111`,`190`,`115`,`180`) → `contabilidad.retenciones.calcular.request`;
   - modelos de `FUENTES.RESUMEN` (`100`,`200`,`130`,`131`,`347`) → `contabilidad.estado.resultado.request`.
   Si la fuente **no responde** → `null` → **`503 DEPENDENCIA_NO_DISPONIBLE`**
   (`{dependencia:'liquidacion-iva|retenciones-is-irpf', accion:'NO_GENERAR_PUBLICAR_FALLO'}`).
4. **Puerto de salida DECLARABLE y ABIERTO**: `_entregar` usa `puerto`/`programa`
   declarado o, si hay uno solo en el catálogo, ese; si **no hay puerto** → respuesta
   `200` con `entregado:false`, `no_declarado:true`, `simbolico:'NO_DECLARADO'`,
   `puertos_disponibles` — **no se finge la entrega**. `_registrarPuerto` guarda
   `{nombre, formato, programa, adaptador}` en `this._puertos` (puerto abierto).
5. **La respuesta del RPC incluye la entrega**: `onGenerarRequest` devuelve
   `{...res.data, entrega: <data|null>, entrega_declarada: <bool>}`. En éxito publica
   `contabilidad.modelo_generado` y luego `contabilidad.modelo_entregado` (o
   `contabilidad.modelo_entregado.failed` si el puerto no está declarado).
6. **Validaciones deterministas de entrada**: falta `project_id` → `400 INVALID_INPUT
   project_id`; en `_entregar` sin `documento` → `400 INVALID_INPUT documento`; en
   `_registrarPuerto` sin `puerto` → `400 INVALID_INPUT puerto`, sin `formato` → `400
   INVALID_INPUT formato`. Shape: `{status:400, error:{code:'INVALID_INPUT',
   message:'<campo> requerido', details:{field:<campo>}}}`.
7. **HTTP exacto**: éxito `200`; payload inválido → `400`; modelo/ejercicio no declarados
   → `422`; fuente no disponible → `503`; excepción en `_atender` → `500
   UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

El único RPC responde en `contabilidad.modelo.generar.response`.

### 1. `generar` — modelo 303 desde la liquidación de IVA

```json
{
  "project_id": "e57a318a-...",
  "modelo": "303",
  "periodo": "2026-09",
  "puerto": "PROGRAMA_ASESOR",
  "nif": "B12345678",
  "correlation_id": "abc-123"
}
```

Con la liquidación (D1/D2/D3) respondiendo por EVENTO, respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "modelo": "303",
  "ejercicio": "2026-09",
  "documento": { "modelo": "303", "ejercicio": "2026-09", "periodo": "2026-09", "nif": "B12345678", "sociedad": null, "casillas": { "iva_devengado": 2100, "iva_deducible": 800, "resultado_liquidacion": 1300 }, "resumen": { "...": "..." }, "formato": "ABIERTO", "generado_en": "...", "preparado_por_el_sistema": true, "presentado": false, "firmado": false },
  "fuente": "liquidacion-iva",
  "prepara_no_presenta": true,
  "determinista": true,
  "entrega": { "project_id": "e57a318a-...", "modelo": "303", "ejercicio": "2026-09", "entregado": true, "puerto": "PROGRAMA_ASESOR", "formato": "XML", "programa": "ASESOR-X", "prepara_no_presenta": true, "presentado": false, "firmado": false, "entregado_en": "..." },
  "entrega_declarada": true
}
```

Emite `contabilidad.modelo_generado` y `contabilidad.modelo_entregado`.

### 2. `generar` — valores declarados (sin depender de la fuente)

Pasar `casillas` (o `valores`) en el payload → `fuente:'DECLARADAS'`, sin pedir EVENTO
a la fuente.

### 3. `generar` — sin puerto declarado → NO_DECLARADO

Sin `puerto` (ni catálogo) → la entrega queda `entregado:false`, `no_declarado:true`,
`simbolico:'NO_DECLARADO'`; se publica `contabilidad.modelo_entregado.failed`. **No se
finge la presentación.**

### 4. Fallo — modelo/ejercicio no declarados → 422

```json
{ "project_id": "e57a318a-..." }
```

→ `422 PRECONDITION_FAILED` (`modelos_conocidos`, `no_declarado:true`) +
`contabilidad.modelo.generar.failed`.

### 5. Fallo — fuente no disponible → 503

Modelo sin `casillas` declaradas y con la fuente (liquidación/retenciones/resultado)
sin responder → `503 DEPENDENCIA_NO_DISPONIBLE`
(`{modelo, dependencia:'liquidacion-iva|retenciones-is-irpf', accion:'NO_GENERAR_PUBLICAR_FALLO'}`).

### 6. Tools (sin RPC en module.json)

`toolGenerar` → `_generar`; `toolEntregar` → `_entregar`; `toolRegistrarPuerto`
→ `_registrarPuerto`.

## Tests

El test viviría en `tests/unit/generador-modelo.test.js`. Cubre:

- `generar` con `casillas` declaradas → `200`, documento con
  `preparado_por_el_sistema:true`, `presentado:false`, `firmado:false`; emite
  `contabilidad.modelo_generado` y `contabilidad.modelo_entregado`.
- **Modelo/ejercicio declarables**: sin `modelo` o sin `ejercicio` → `422
  PRECONDITION_FAILED`.
- **Valores derivados por fuente**: modelo 303 pide `contabilidad.iva.liquidar.request`;
  190 pide `contabilidad.retenciones.calcular.request`; sin respuesta → `503
  DEPENDENCIA_NO_DISPONIBLE` (**nunca un modelo inventado**).
- **Puerto declarable**: sin puerto → entrega `NO_DECLARADO` (no se finge); con
  `registrarPuerto` → entrega `200` con `formato`/`programa`.
- **El sistema no presenta ni firma**: el documento y la entrega llevan siempre
  `presentado:false`/`firmado:false`.
- Payload sin `project_id` → `400 INVALID_INPUT`.
- El puente es **stateless**: sin `project.activated` ni persistencia (el catálogo de
  puertos vive solo en memoria del proceso).

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/generador-modelo
node --test tests/unit/generador-modelo.test.js
```

## Notas de implementación

- Clase `GeneradorModelo extends ModuloHibridoReflejo`; `name = 'generador-modelo'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (puente stateless: no hay PosPersistencia
  ni `project.activated`). El único estado es el catálogo en memoria `this._puertos`
  (Map nombre → `{formato, programa, adaptador}`).
- Constante `FUENTES` (la LISTA orienta; el modelo es dato): `LIQUIDACION_IVA:
  ['303','390','390S']`, `RETENCIONES: ['111','190','115','180']`, `RESUMEN:
  ['100','200','130','131','347']`.
- `onGenerarRequest` delega en `_atender(e, 'generar', 'contabilidad.modelo.generar.response',
  fn)`: en fallo publica `contabilidad.modelo.generar.failed`; en éxito publica
  `contabilidad.modelo_generado`, y tras `_entregar` publica `contabilidad.modelo_entregado`
  (o `contabilidad.modelo_entregado.failed` si el puerto no está declarado).
- Proyecciones puras: `_generar` (async), `_entregar`, `_registrarPuerto` + helpers
  `_valoresDe` (async, EVENTO fuentes), `_casillasDesdeLiquidacion`,
  `_casillasDesdeRetenciones`. `_rpc`/`_invalid`/`_errorResponse` vienen de la base.
- Tools: `toolGenerar`, `toolEntregar`, `toolRegistrarPuerto`.
- DEP hacia delante: `contabilidad.modelo_generado` lo consume
  `estado-presentacion-fiscal` (D12, obligación → generada) y el asesor;
  `contabilidad.modelo_entregado` cierra la entrega. DEP hacia atrás por EVENTO:
  `liquidacion-iva` (D1/D2/D3), `retenciones-is-irpf` (D4/D5) y `estados-contables`
  (resumen).
