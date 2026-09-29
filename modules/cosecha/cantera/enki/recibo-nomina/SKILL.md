---
name: recibo-nomina
description: >
  Skill FULL del módulo REFLEJO `recibo-nomina` de la vertical contabilidad de Enki.
  ADMITE y DA FORMA ASENTABLE al hecho de nómina que ya entró por la frontera (puerto-nomina):
  copia los importes que el sistema externo ya calculó, organiza los conceptos tal cual y declara
  si cuadran — NO calcula la nómina ni toca sus importes. Sin estado. Úsala para operar, depurar
  o extender el reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites dar forma asentable a un recibo de nómina (RPC
    recibo-nomina.dar_forma.request).
  - Cuando depures por qué se rechaza la entrada (400 INVALID_INPUT si falta project_id o nómina),
    por qué `cuadra:false`, o por qué un importe aparece `null` en `faltantes`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    reflejo (no calcula la nómina, importes copiados, conceptos declarables, el descuadre se declara).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo recibo-nomina.
tags: [enki, modulo, reflejo, contabilidad, recibo-nomina]
---

# recibo-nomina — REFLEJO de la forma asentable del recibo

## Qué hace el módulo

`recibo-nomina` es un **REFLEJO STATELESS** (G1, hoja del plan): **ADMITE** y **DA FORMA
ASENTABLE** al **HECHO DE NÓMINA** que ya entró por la frontera (`puerto-nomina` G4). El diseño lo
dice literal: `dar_forma(entrada):HechoNomina` — admite el hecho lo mismo si llega como **HECHO**
que si llega como **DOCUMENTO** (el PDF/registro del recibo). **MECÁNICO, CERO JUICIO.**

**ESTE MÓDULO NO CALCULA LA NÓMINA**: el bruto, la retención, la cotización del trabajador y el
neto llegan **ya calculados** por el sistema de personal. Aquí **NO** se derivan, **NO** se retocan
y **NO** se estiman: se **COPIAN** tal cual y se declaran abiertos los que no vengan. Lo que hace es
**REFLEJARLA contablemente**: dar al hecho una forma estable (`forma_asentable`) que el asiento
pueda consumir, con `destino:'asiento-personal'` (G3).

**LOS CONCEPTOS SON DECLARABLES**: el recibo organiza los conceptos **TAL CUAL** llegan; no hay
ningún catálogo de conceptos, tipos ni bases cableado.

Invariante: **dato ausente = desconocido** — un importe que no llega queda `null` y se declara en
`faltantes`. La consistencia de lo declarado (`cuadra`/`descuadre`: bruto − retención − cotización
= neto) se **DECLARA** sobre los importes tal cual vinieron, **no se corrige** (la nómina no se toca
aquí y su resolución es del humano).

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_dar_forma`.
Cierra el círculo de error con `recibo-nomina.dar_forma.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `recibo-nomina.dar_forma.request` | `onDarFormaRequest` | RPC reflejo (mecanico, cero juicio, determinista): {project_id, nomina\|hecho\|documento, clave_natural?, id_recibo?} → {project_id, recibo:{id_recibo, clave_natural, clase_entrada:'hecho'\|'documento', origen, empleado, periodo, fecha, bruto, retencion, cotizacion_trabajador, neto, moneda, conceptos, forma_asentable:true, calculada_aqui:false, calculo_delegado_a:'sistema-de-nomina-externo', cuadra, descuadre, faltantes, abierto}, destino:'asiento-personal'}. Los importes se COPIAN de la fuente (nunca se calculan) y lo ausente queda null y se declara en `faltantes`. Exito → publica contabilidad.nomina_formada y responde por recibo-nomina.dar_forma.response; project_id o nomina ausente → recibo-nomina.dar_forma.failed. |
| `contabilidad.nomina_recibida` | `onNominaRecibida` | Fire-and-forget: el hecho de nomina entro por el puerto (puerto-nomina G4) → se le da forma asentable (misma proyeccion `_dar_forma`) y se publica contabilidad.nomina_formada. Si la entrada no trae nomina, publica recibo-nomina.dar_forma.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `recibo-nomina.dar_forma.response` | Respuesta RPC correlada de recibo-nomina.dar_forma.request → {request_id, status:200, data:{recibo, destino:'asiento-personal'}}. Emitida por el helper _atender. |
| `recibo-nomina.dar_forma.failed` | Par de fallo determinista (G1): project_id o nomina ausente → {status, error:{code, message, details?}}. Cierra el circulo de recibo-nomina.dar_forma.request. |
| `contabilidad.nomina_formada` | Fire-and-forget (G1): el recibo de nomina quedo con forma asentable (los importes del sistema externo copiados, sin calcular aqui) → {project_id, id_recibo, clave_natural, periodo, empleado, neto, cuadra, faltantes, correlation_id}. Lo LEEN asiento-personal (G3) y la cadena de personal (obligacion-seguridad-social G2, lineas-nomina G6, pagos-a-cuenta G8). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `recibo-nomina.dar_forma.failed` cierra el círculo de `recibo-nomina.dar_forma.request` (y
> sirve de par declarado para la entrada fire-and-forget `contabilidad.nomina_recibida`, cuando
> `_dar_forma` devuelve status ≠ 200: `project_id` o nómina ausente).

> Nota de honestidad (cruce con `index.js`): `onDarFormaRequest` publica `contabilidad.nomina_formada`
> **si `_dar_forma` devuelve `200`**; la rama `else` publica `recibo-nomina.dar_forma.failed`.
> `onNominaRecibida` (`contabilidad.nomina_recibida`) **no** usa `_atender` y publica
> `contabilidad.nomina_formada` o el par `failed` según el resultado.

> Nota: el módulo expone `toolDarForma(params)` como **tool directa** (misma proyección
> `_dar_forma`) — no es un evento del bus, no figura en `module.json`. Tampoco figuran
> `_copiaImporte`, `_conceptos`, `_clave` ni `_emitirFormada` (utilidades internas).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
2. **La entrada admite HECHO o DOCUMENTO**: `input.nomina ?? input.hecho ?? input.documento`; si no
   es objeto → `400 INVALID_INPUT` (`field:'nomina'`).
3. **`clase_entrada` se deriva**: `'documento'` **solo** si viene por `input.documento` y **no** por
   `input.nomina`/`input.hecho`; en cualquier otro caso `'hecho'`.
4. **LOS IMPORTES SE COPIAN** (`_copiaImporte`): `bruto`, `retencion`, `cotizacion_trabajador` (de
   `entrada.cotizacion_trabajador` o `entrada.cotizacion`) y `neto`. Si un valor falta o no es
   numérico → `null` y se **apila en `faltantes`**. **Nunca se calcula la nómina.**
5. **`empleado` y `periodo`**: `String(...)` si vienen; ausente → `null` y entra en `faltantes`.
6. **Los CONCEPTOS se organizan TAL CUAL** (`_conceptos`): array → cada objeto se copia (`{...c}`),
   cada escalar se envuelve como `{concepto: c, importe: null}`; no array → `[]`. **Ningún catálogo
   cableado.**
7. **La clave natural NO se inventa**: `input.clave_natural` → `entrada.clave_natural` → derivada
   del molde `empleado|periodo` (con `-` en los huecos); sin ambos → `null`.
8. **`id_recibo`**: `input.id_recibo` si viene; si no `nomina:<clave_natural>`; sin clave → `null`.
9. **LA CONSISTENCIA SE DECLARA, NO SE CORRIGE**: si los cuatro importes están completos,
   `cuadra = (_round(bruto − retencion − cotizacion_trabajador, 2) === _round(neto, 2))` y
   `descuadre = _round(bruto − retencion − cotizacion_trabajador − neto, 2)`; si falta alguno →
   `cuadra:null` y `descuadre:null`. **La nómina no se toca aquí**; el descuadre es del humano.
10. **El recibo es la forma asentable**: `forma_asentable:true`, `calculada_aqui:false`,
    `calculo_delegado_a:'sistema-de-nomina-externo'`, `abierto:(faltantes.length > 0)`,
    `formado_en` sellado con `new Date().toISOString()`.
11. **El DESTINO se declara**: `data.destino = 'asiento-personal'` (G3 construye el asiento). **El
    reflejo da la forma; el asiento lo hace G3.**
12. **NO escribe, NO persiste, NO muta**: stateless puro. Sin `PosPersistencia`, sin
    `onProjectActivated`.
13. **HTTP exacto**: éxito `200`; `project_id` o nómina ausentes → `400`; excepción en `_atender` →
    `500 UNKNOWN_ERROR` (solo en la vía RPC).

## Cómo se usa (RPCs)

Responde en `recibo-nomina.dar_forma.response` y emite `contabilidad.nomina_formada`; el error
cierra con `recibo-nomina.dar_forma.failed`.

### 1. `dar_forma` — el hecho de nómina llega del sistema externo

```json
{
  "project_id": "e57a318a-...",
  "nomina": { "origen": "programa-personal", "empleado": "E-014", "periodo": "2026-09", "fecha": "2026-09-30", "bruto": 2100, "retencion": 210, "cotizacion_trabajador": 133, "neto": 1757, "moneda": "EUR", "conceptos": [ { "concepto": "salario base", "importe": 2100 } ] },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "recibo": { "id_recibo": "nomina:E-014|2026-09", "clave_natural": "E-014|2026-09", "clase_entrada": "hecho", "origen": "programa-personal", "empleado": "E-014", "periodo": "2026-09", "fecha": "2026-09-30", "bruto": 2100, "retencion": 210, "cotizacion_trabajador": 133, "neto": 1757, "moneda": "EUR", "conceptos": [ { "concepto": "salario base", "importe": 2100 } ], "forma_asentable": true, "calculada_aqui": false, "calculo_delegado_a": "sistema-de-nomina-externo", "cuadra": true, "descuadre": 0, "faltantes": [], "abierto": false, "formado_en": "2026-09-25T..." },
  "destino": "asiento-personal"
}
```

Emite `contabilidad.nomina_formada` (lo LEEN asiento-personal G3 y la cadena de personal G2/G6/G8):

```json
{ "project_id": "e57a318a-...", "id_recibo": "nomina:E-014|2026-09", "clave_natural": "E-014|2026-09", "periodo": "2026-09", "empleado": "E-014", "neto": 1757, "cuadra": true, "faltantes": [], "correlation_id": "abc-123" }
```

### 2. `dar_forma` — entrada como DOCUMENTO y con descuadre

Sin `input.nomina`/`input.hecho`, con `input.documento` → `clase_entrada:'documento'`. Si
`bruto − retencion − cotizacion_trabajador ≠ neto` → `cuadra:false` y `descuadre` con la diferencia.
**Se declara; no se ajusta nada.**

### 3. `dar_forma` — importes que no vienen (nada se estima)

Sin `neto` ni `retencion` → `neto:null`, `retencion:null`, `faltantes:["retencion","neto"]`,
`cuadra:null`, `descuadre:null`, `abierto:true`. **Los importes no se completan.**

### 4. Fire-and-forget — reacción a `contabilidad.nomina_recibida`

`onNominaRecibida` toma `e.data || e`, da forma por la misma `_dar_forma` y publica
`contabilidad.nomina_formada`; si la entrada no trae nómina, publica `recibo-nomina.dar_forma.failed`.

### 5. Fallo — falta `project_id` o la nómina

Respuesta `400` + `recibo-nomina.dar_forma.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/recibo-nomina.test.js`. Cubre:

- `dar_forma` con hecho completo → `200`, `forma_asentable:true`, `cuadra:true`, `destino:'asiento-personal'`
  y emite `contabilidad.nomina_formada`.
- Los importes se **COPIAN** tal cual de la fuente (**no se calculan**).
- Entrada por `documento` → `clase_entrada:'documento'`; por `nomina`/`hecho` → `'hecho'`.
- Descuadre → `cuadra:false` y `descuadre` declarado (**no se corrige**).
- Un importe ausente queda `null` y en `faltantes`; `cuadra:null`, `abierto:true` (**no se estima**).
- Los conceptos viajan tal cual (`conceptos`); **cero catálogo cableado**.
- `onNominaRecibida` da forma por la misma proyección; sin nómina → par `failed`.
- `project_id` o nómina ausentes → `400 INVALID_INPUT` + `.dar_forma.failed`.
- `toolDarForma` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ReciboNomina extends ModuloHibridoReflejo`; `name = 'recibo-nomina'`, `version =
  'reflejo-0.1.0'`. Sin store, sin `PosPersistencia`, sin `onProjectActivated` (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-fiscal/recibo-nomina/`).
- `onDarFormaRequest` usa `this._atender(e, 'dar_forma', 'recibo-nomina.dar_forma.response',
  async (d) => {...})` con cierre de círculo; `onNominaRecibida` **no** usa `_atender`.
- Proyección `_dar_forma(input)` (**síncrona**); helpers `_copiaImporte`, `_conceptos`, `_clave` y
  `_emitirFormada(res, d)` (el evento de dominio). Tool `toolDarForma`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo alimenta `contabilidad.nomina_recibida` (`puerto-nomina` G4); lo LEEN `asiento-personal`
  (G3) y la cadena de personal (G2, G6, G8) vía `contabilidad.nomina_formada`.
- **NO CALCULA LA NÓMINA**: los importes se **COPIAN** del sistema externo; los conceptos se
  organizan tal cual (nada cableado). Lo que hace es **REFLEJAR** contablemente: **da forma
  asentable**, y si lo declarado no cuadra, **lo declara** sin tocar la nómina.

