---
name: normalizador-hecho
description: >
  Skill FULL del módulo CONVERSOR `normalizador-hecho` de la vertical contabilidad
  de Enki (A2 + A4.3, hoja del plan). La ÚNICA puerta de FORMATO del hecho:
  homogeneiza el hecho CRUDO de cualquier fuente (vertical, documento, factura) a
  forma asentable, mapeando campos de la fuente a campos internos. Lo que FALTA no
  se rellena: se marca como campo ausente → excepción a cola-revision o pregunta
  (dato ausente = desconocido). Además controla el CUADRE del documento (A4.3): suma
  de bases + suma de impuestos = total, con tolerancia DECLARABLE (0.01 por defecto);
  si no cuadra → excepción a cola-revision, JAMÁS se asienta "casi cuadrado". Es
  stateless: sin PosPersistencia ni project.activated — entra objeto, sale objeto.
  Úsala para operar, depurar o extender el conversor, o para entender su contrato de
  eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites normalizar un hecho crudo a forma asentable
    (RPC contabilidad.hecho.normalizar.request).
  - Cuando depures por qué un hecho se rechaza (400 INVALID_INPUT si falta
    project_id/hecho_crudo/vertical), por qué el cuadre no aplica (422
    PRECONDITION_FAILED si faltan líneas/total) o por qué se emite
    contabilidad.documento_descuadrado.
  - Cuando quieras entender el consumo por EVENTO de hecho_admitido (A1) y
    factura.procesada (facturas), y por qué lo que falta NO se rellena.
  - Cuando vayas a escribir/ampliar el test unitario del conversor normalizador-hecho.
tags: [enki, modulo, conversor, contabilidad, normalizador-hecho, formato, cuadre]
---

# normalizador-hecho — CONVERSOR y única puerta de formato del hecho

## Qué hace el módulo

`normalizador-hecho` es un **CONVERSOR STATELESS** (A2 + A4.3, hoja del plan): la
**ÚNICA puerta de FORMATO del hecho** (invariante 10 del dominio). Su trabajo es
**homogeneizar** el hecho **CRUDO** que llega de **cualquier fuente** (una vertical,
un documento, una factura ya procesada por `facturas`) a la **forma asentable** de
contabilidad, mapeando los campos de la fuente a los campos internos del molde de
Hecho.

La invariante dura es **lo que FALTA no se rellena** (invariante 7: *dato ausente =
desconocido*): los campos exigidos que no vengan se **marcan** como faltantes y el
hecho se devuelve con `incompleto:true` → su destino es una **excepción** a
`cola-revision` o una **pregunta**, nunca un invento.

Además controla el **CUADRE del documento** (A4.3): comprueba que
**Σ bases + Σ impuestos = total**, con una **tolerancia DECLARABLE** (0.01 por
defecto, `[ABIERTO]` como parámetro). Si el documento **no cuadra** publica
`contabilidad.documento_descuadrado`; **jamás se asienta "casi cuadrado"**.

Es **stateless** — sin PosPersistencia ni `project.activated`: **entra objeto, sale
objeto**. Su dependencia con `puerto-evento-vertical` (A1), `contrato-hecho-minimo`
(A11), `facturas` y `lote-admision` es **por EVENTO, nunca por `require` cruzado**.

> **NO REUTILIZA**: `facturas` entrega el **dato extraído**, no la forma asentable de
> contabilidad (contrato A11 + clave natural A14); el **cuadre determinista** del
> documento es propio de este módulo.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response y consumos por evento)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.hecho.normalizar.request` | `onNormalizarRequest` | RPC conversor: {project_id, hecho_crudo:{vertical, payload\|datos, ...}, mapa?, tolerancia?} → {project_id, vertical, hecho:{...estado:'NORMALIZADO'}, faltantes, incompleto}. UNICA puerta de formato: homogeneiza a forma asentable y detecta faltantes (lo que falta NO se rellena). Si el hecho cuadra (suma bases + impuestos = total, tolerancia declarable) publica contabilidad.hecho_normalizado; si no cuadra publica contabilidad.documento_descuadrado; responde por contabilidad.hecho.normalizar.response; si el payload es invalido → contabilidad.hecho.normalizar.failed. |
| `contabilidad.hecho_admitido` | `onHechoAdmitido` | Fire-and-forget (A1 → A2): puerto-evento-vertical admitio un hecho de vertical → {project_id, vertical, hecho\|...}. El normalizador lo homogeneiza a forma asentable (dependencia por EVENTO, sin require cruzado) y publica contabilidad.hecho_normalizado (o su par de fallo). Lo que falte va a excepcion, no se rellena. |
| `factura.procesada` | `onFacturaProcesada` | Fire-and-forget (facturas → A2): el modulo `facturas` proceso una factura (dato extraido) → {project_id, factura\|datos}. Aqui se convierte en forma asentable de contabilidad (clave natural A14 + contrato A11) y se publica contabilidad.hecho_normalizado. Dependencia por EVENTO, sin require cruzado. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.hecho_normalizado` | Fire-and-forget (A2): un hecho quedo homogeneizado a forma asentable (y, si procedia, cuadrado) → {project_id, vertical, hecho, faltantes, incompleto, cuadre}. Lo consume la cadena de asiento (B2) y el rastro de historial-proceso-contable (P2). |
| `contabilidad.documento_descuadrado` | Fire-and-forget (A4.3): el documento NO cuadra (suma bases + suma impuestos != total, fuera de la tolerancia declarada) → {project_id, vertical, descuadre, faltantes, detalle}. Jamas se asienta 'casi cuadrado': va a excepcion a cola-revision (A8.1). |
| `contabilidad.hecho.normalizar.failed` | Par de fallo determinista: hecho crudo invalido (sin project_id, sin vertical o sin carga) → {status, error}. Cierra el circulo de contabilidad.hecho.normalizar.request (y de los consumos por evento hecho_admitido / factura.procesada). |
| `contabilidad.hecho_normalizado.failed` | Par de fallo del evento de dominio contabilidad.hecho_normalizado: la emision del hecho de dominio no se completo. |
| `contabilidad.documento_descuadrado.failed` | Par de fallo del evento de dominio contabilidad.documento_descuadrado: la emision de la senal de descuadre no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.hecho.normalizar.failed` cierra el círculo de
> `contabilidad.hecho.normalizar.request` (y de los consumos por evento
> `contabilidad.hecho_admitido` / `factura.procesada`, que publican el mismo par).

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.hecho.normalizar.response` (el par response del RPC) en
> `onNormalizarRequest`; no está declarada en `publishes`. Además `onHechoAdmitido` y
> `onFacturaProcesada` (consumos fire-and-forget) publican `contabilidad.hecho_normalizado`
> o `contabilidad.hecho.normalizar.failed` directamente, sin response.

## Reglas de negocio

1. **Única puerta de formato**: `_homogeneizar` es el **solo** camino por el que un
   hecho crudo se convierte en forma asentable. El mapeo base copia los
   `CAMPOS_INTERNOS` (`vertical`, `clase_hecho`, `fecha_operacion`, `fecha_valor`,
   `tercero`, `lineas`, `impuestos`, `forma_pago`, `documento_origen`, `moneda`)
   presentes en el crudo; el `mapa` declarado `{campoFuente: campoInterno}` añade o
   sobreescribe destinos. Además rellena `fuente`, `clave_natural` y `documento_origen`.
2. **Lo que falta NO se rellena (Cero estimación)**: `_detectarFaltantes` marca todo
   campo exigido cuyo valor sea `undefined`, `null` o `''`. Por defecto los exigidos
   son `['vertical','fecha_operacion']` (o el array `exigidos` si se aporta). Si hay
   faltantes → `incompleto:true` y `nota:'lo que falta NO se rellena: va a excepcion/pregunta'`.
   El hecho **no se completa**: su destino es `cola-revision` / pregunta.
3. **Cuadre determinista del documento (A4.3)**: `_cuadrarDocumento` calcula
   `Σ bases` (de `hecho.lineas`, campo `base ?? importe ?? precio`) + `Σ impuestos`
   (de `hecho.impuestos`, campo `cuota ?? importe`) y lo compara con `hecho.total`,
   redondeando a 2 decimales (`_round`). `cuadrado = |descuadre| <= tolerancia`.
4. **Tolerancia DECLARABLE**: `tolerancia` llega por payload; si no es un número
   finito `>= 0` se usa `TOLERANCIA_DEFECTO = 0.01`. **La ley entra como DATO**
   (parámetro declarable, `[ABIERTO]`), no cableada.
5. **Precondición del cuadre**: si el hecho no trae `lineas` (no array) o `total` no
   es finito → `422 PRECONDITION_FAILED` con
   `{ tiene_lineas:false, total:false }` y **no** se emite ni hecho_normalizado ni
   documento_descuadrado.
6. **Nunca "casi cuadrado"**: si `cuadrado === false` se publica
   `contabilidad.documento_descuadrado` (con `senal:'excepcion_a_cola_revision'`), no
   se emite `contabilidad.hecho_normalizado`. Si cuadra (o el cuadre no es aplicable),
   se emite `contabilidad.hecho_normalizado` con `cuadre` (o `cuadre:null`).
7. **Validaciones deterministas de entrada**: falta `project_id` → `400 INVALID_INPUT
   project_id`; `hecho_crudo` ausente/no objeto → `400 INVALID_INPUT hecho_crudo`;
   sin `vertical` (ni en el crudo ni en el payload) → `400 INVALID_INPUT
   hecho_crudo.vertical`. Shape: `{ status:400, error:{ code:'INVALID_INPUT',
   message:'<campo> requerido', details:{ field:<campo> } } }`.
8. **Los consumos fire-and-forget son tolerantes**: `onHechoAdmitido` y
   `onFacturaProcesada` **retornan `null` sin publicar nada** si no hay `project_id`;
   `onFacturaProcesada` asume `vertical:'COMPRA'` si no viene. Emiten dominio o par
   determinista según el `status` de `_homogeneizar`.
9. **HTTP exacto**: éxito `200`; payload inválido → `400`; cuadre sin líneas/total →
   `422`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

El único RPC responde en `contabilidad.hecho.normalizar.response`; los consumos por
evento (`contabilidad.hecho_admitido`, `factura.procesada`) publican directamente.

### 1. `normalizar` — homogeneizar un hecho crudo (y cuadrarlo)

```json
{
  "project_id": "e57a318a-...",
  "hecho_crudo": {
    "vertical": "COMPRA",
    "datos": {
      "fecha_operacion": "2026-09-01",
      "lineas": [{ "base": 100 }],
      "impuestos": [{ "cuota": 21 }],
      "total": 121
    }
  },
  "tolerancia": 0.01,
  "correlation_id": "abc-123"
}
```
Respuesta `200` (cuadra: 100 + 21 = 121):
```json
{
  "project_id": "e57a318a-...",
  "vertical": "COMPRA",
  "hecho": { "vertical": "COMPRA", "fecha_operacion": "2026-09-01", "lineas": [{ "base": 100 }], "impuestos": [{ "cuota": 21 }], "total": 121, "fuente": null, "clave_natural": null, "estado": "NORMALIZADO" },
  "faltantes": [],
  "incompleto": false,
  "nota": null
}
```
Emite `contabilidad.hecho_normalizado`:
```json
{ "project_id": "e57a318a-...", "vertical": "COMPRA", "hecho": { "...": "..." }, "faltantes": [], "incompleto": false, "cuadre": { "cuadrado": true, "suma_bases": 100, "suma_impuestos": 21, "esperado": 121, "total": 121, "descuadre": 0, "tolerancia": 0.01, "resultado": "CUADRADO", "senal": null }, "correlation_id": "abc-123" }
```

### 2. `normalizar` — documento que NO cuadra

Con `total: 120` (esperado 121, descuadre 1 > 0.01) la respuesta sigue siendo `200`
pero se emite `contabilidad.documento_descuadrado`:
```json
{ "project_id": "e57a318a-...", "vertical": "COMPRA", "descuadre": 1, "faltantes": [], "detalle": { "cuadrado": false, "suma_bases": 100, "suma_impuestos": 21, "esperado": 121, "total": 120, "descuadre": 1, "tolerancia": 0.01, "resultado": "DESCUADRE", "senal": "excepcion_a_cola_revision" } }
```

### 3. `normalizar` — hecho incompleto (lo que falta NO se rellena)

```json
{ "project_id": "e57a318a-...", "hecho_crudo": { "vertical": "VENTA", "datos": { "lineas": [{ "base": 50 }], "impuestos": [], "total": 50 } } }
```
Respuesta `200` con `faltantes:["fecha_operacion"]`, `incompleto:true` y
`nota:'lo que falta NO se rellena: va a excepcion/pregunta'`.

### 4. Consumo por evento — `contabilidad.hecho_admitido` / `factura.procesada`

`onHechoAdmitido` toma `d.hecho || d` como crudo; `onFacturaProcesada` toma
`d.factura || d.datos || d` (con `vertical:'COMPRA'` por defecto). En ambos casos
publica `contabilidad.hecho_normalizado` (éxito) o `contabilidad.hecho.normalizar.failed`
(con `status != 200`). Sin `project_id` no publican nada.

### Fallo — payload inválido

```json
{ "hecho_crudo": { "vertical": "COMPRA" } }
```
Respuesta `400` + `contabilidad.hecho.normalizar.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test vive en `tests/unit/normalizador-hecho.test.js`. Cubre:

- `normalizar` con hecho completo y cuadrado → `200`, `faltantes:[]`,
  `incompleto:false`, y emite `contabilidad.hecho_normalizado` con `cuadre.cuadrado:true`.
- **No se asienta "casi cuadrado"**: hecho con `total` desviado > tolerancia → emite
  `contabilidad.documento_descuadrado` (no `hecho_normalizado`).
- Tolerancia declarable: el mismo descuadre con `tolerancia` amplia → `cuadrado:true`.
- Hecho sin `fecha_operacion` → `faltantes:["fecha_operacion"]`, `incompleto:true`, sin rellenar.
- Cuadre sin `lineas`/`total` → `422 PRECONDITION_FAILED`.
- `normalizar` sin `project_id`/`hecho_crudo`/`vertical` → `400 INVALID_INPUT` + `contabilidad.hecho.normalizar.failed`.
- `onHechoAdmitido` y `onFacturaProcesada` publican dominio o par de fallo; sin
  `project_id` no publican.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/normalizador-hecho
node --test tests/unit/normalizador-hecho.test.js
```

## Notas de implementación

- Clase `NormalizadorHecho extends ModuloHibridoReflejo`; `name =
  'normalizador-hecho'`, `version = 'reflejo-0.1.0'`. **Sin store** (conversor
  stateless: no hay `this._store` ni PosPersistencia ni `project.activated`).
- Constantes: `CAMPOS_INTERNOS` (los 10 campos del molde de Hecho) y
  `TOLERANCIA_DEFECTO = 0.01`.
- `onNormalizarRequest` delega en `_atender(e, 'normalizar',
  'contabilidad.hecho.normalizar.response', fn)`; la proyección `_homogeneizar` se
  sigue de `_cuadrarDocumento` y se decide qué evento de dominio emitir dentro del
  handler. `onHechoAdmitido` / `onFacturaProcesada` son handlers fire-and-forget
  propios (no usan `_atender`).
- Proyecciones puras: `_homogeneizar`, `_mapear`, `_detectarFaltantes`,
  `_cuadrarDocumento`. `_invalid` (→ 400 INVALID_INPUT `{field}`) y `_errorResponse`
  vienen de `modulo-hibrido-reflejo` / `base-module`; `_round(x,2)` de la base.
- Tools: `toolHomogeneizar`, `toolMapear`, `toolDetectarFaltantes`, `toolCuadrarDocumento`.
- DEP hacia delante: lo consumen la cadena de asiento (B2), `cola-revision` (A8.1) y
  el rastro de `historial-proceso-contable` (P2). Dependencia **por evento** con
  `puerto-evento-vertical` (A1), `contrato-hecho-minimo` (A11), `facturas` y `lote-admision`.
