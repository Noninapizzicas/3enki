---
name: frontera-ficha-producto
description: >-
  Skill FULL del módulo CONVERSOR STATELESS `frontera-ficha-producto` de la vertical
  contabilidad (Enki). La ÚNICA puerta ficha-de-producto → DATO CONTABLE: cruza la ficha del
  negocio y la devuelve con la FORMA INTERNA del coste contable (CosteInterno). Cruza FORMATO,
  no valora, no decide, no calcula márgenes (los importes se COPIAN). La forma de la ficha es
  DECLARABLE (`forma`: campos+requeridos+clave_natural); sin forma, identidad por nombre interno.
  El puerto es declarable (si falta, se crea). Dato ausente = desconocido. NO escribe, NO persiste.
when-to-use: >-
  - Cuando necesites cruzar la ficha de producto del negocio a la forma interna del coste
    contable (RPC frontera-ficha-producto.entrar.request).
  - Cuando depures por qué el coste sale con campos `null` (dato ausente → `faltantes`/`abierto`),
    o cómo se resuelve la `clave_natural`.
  - Cuando quieras entender su contrato de eventos: es conversor puro, no publica hecho de dominio.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, conversor, stateless, contabilidad, analitica, coste, ficha-producto, puerto]
---

# frontera-ficha-producto — CONVERSOR de la ficha al coste interno

## Qué hace el módulo

`frontera-ficha-producto` es un **CONVERSOR STATELESS** (H2, hoja del plan). Es **la única
puerta** por la que entra la ficha de producto de un negocio (la de su vertical/proveedor) y
sale con la **forma interna del coste contable** (`CosteInterno`). El diseño lo dice literal:
`entrar(ficha):CosteInterno`, con `forma:ParametroDeclarable`.

**Cruza el FORMATO, no decide el contenido ni la valoración**: el módulo **no valora** el
producto, **no calcula márgenes**, **no decide el coste** — **transporta** lo que la ficha
declara, con la forma que el negocio **DECLARA** (`forma`: por campo interno, su ruta en la
ficha + `requeridos` + `clave_natural`). Sin `forma` declarada, la regla es **identidad por
nombre interno** y se declara así (`forma_declarada:false`).

**Dato ausente = desconocido**: el campo que no llega ni se declara queda `null` y se lista en
`faltantes` ([ABIERTO], nada se estima).

Es el **puerto declarable** del coste de cada negocio: si falta, se **crea** la frontera para
él (`puerto.frontera` declara su nombre); el mismo módulo sirve a todos los negocios sin
conocer ninguno de memoria. **NO escribe, NO persiste.**

Su RPC `entrar` es **CLASE PREGUNTA** → sin `ui_handlers`; su cara es el bus.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `frontera-ficha-producto.entrar.request` | `onEntrarRequest` | RPC conversor (**PREGUNTA**, por el bus): `{project_id, ficha\|producto\|crudo, forma?, vertical?, clave_natural?}` → `{project_id, vertical, puerto, coste{...forma_interna, faltantes}, forma_declarada, faltantes, abierto}`. Cruza la ficha a la forma interna del coste. Dato ausente = desconocido (se declara en `faltantes`). Responde por `.entrar.response`; ficha inválida → `.entrar.failed`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `frontera-ficha-producto.entrar.response` | Respuesta RPC correlada de la op `entrar`. |
| `frontera-ficha-producto.entrar.failed` | Fallo determinista: falta la ficha o es inválida → `{status, code, message}`. |

> **No publica hecho de dominio**: conversor puro (no escribe) → no hay `contabilidad.*` que
> anunciar (R2). El handler publica `.entrar.failed` solo si `status !== 200`.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `entrar` | **PREGUNTA** (bus) | `{project_id, ficha\|producto\|crudo, forma?, vertical?, clave_natural?, puerto?}` | `{project_id, vertical, origen_ficha, puerto, coste, forma_declarada, requeridos_faltantes, decide:false, valora:false, cruza_formato:true, faltantes, abierto}` | 400 `INVALID_INPUT` (`ficha`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Ficha obligatoria**: `input.ficha` (o `producto`/`crudo` objeto). Si no es objeto →
   `_invalid('ficha')` (400).
2. **Ficha envuelta o plana**: si `ficha.payload` es objeto se usa como origen
   (`origen_ficha = ficha.payload`); la `vertical` sale del sobre o de `input.vertical`.
3. **Campos internos del coste** (`CAMPOS_COSTE`): `clave_natural, producto, referencia,
   unidad, coste_unitario, cantidad, coste_total, moneda, proveedor, fecha, vertical, atributos`.
4. **Forma declarable**: `{campos:{interno: ruta}, requeridos:[...], clave_natural: ruta}`.
   La ruta admite notación `'a.b'` (`_leerRuta`). Sin forma → ruta = nombre del campo.
5. **Importes se COPIAN** (`_esImporte`: `coste_unitario`, `coste_total`, `cantidad`): se
   convierten a número (`_num`) pero **no se derivan** del precio ni de ningún margen. Si no
   son numéricos → `null` y a `faltantes`.
6. **`faltantes`**: campos canónicos ausentes. `vertical` y `clave_natural` se resuelven aparte
   (se añaden/retiran de la lista según se resuelvan).
7. **`clave_natural`**: de `input.clave_natural`, o del campo existente, o de la ruta
   declarada en la forma, o derivada del molde `_clave` = `referencia|producto|vertical`
   (solo los no vacíos). No se inventa identidad.
8. **Atributos**: los campos extra de la ficha se conservan bajo `coste.atributos` (no se
   pierde nada) si no vienen ya.
9. **Puerto declarable**: `puerto = {frontera: input.puerto || 'frontera:'+vertical || 'frontera:ficha-producto', creado: input.puerto==null, declarable:true}`.
10. **`coste.forma_interna:true, valorado_aqui:false, calculado_ahere:false`** + `decide:false`,
    `valora:false`, `cruza_formato:true`. `requeridos_faltantes` lista los `requeridos`
    declarados que falten.

## Cómo se usa (RPC)

### Petición con forma declarada

```json
{
  "project_id": "e57a318a-...",
  "vertical": "impresion-3d",
  "ficha": { "payload": { "ref": "FIL-PLA-1", "nombre": "PLA 1kg", "precio": 19.9 }, "vertical": "impresion-3d" },
  "forma": { "campos": { "referencia": "ref", "producto": "nombre", "coste_unitario": "precio" }, "requeridos": ["referencia"], "clave_natural": "ref" }
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...", "vertical": "impresion-3d", "origen_ficha": "ficha",
  "puerto": { "frontera": "frontera:impresion-3d", "creado": true, "declarable": true },
  "coste": { "clave_natural": "FIL-PLA-1", "producto": "PLA 1kg", "referencia": "FIL-PLA-1", "unidad": null, "coste_unitario": 19.9, "cantidad": null, "coste_total": null, "moneda": null, "proveedor": null, "fecha": null, "vertical": "impresion-3d", "atributos": {}, "forma_interna": true, "valorado_aqui": false, "calculado_aqui": false, "faltantes": ["unidad","cantidad","coste_total","moneda","proveedor","fecha"] },
  "forma_declarada": true, "requeridos_faltantes": [], "decide": false, "valora": false, "cruza_formato": true,
  "faltantes": ["unidad","cantidad","coste_total","moneda","proveedor","fecha"], "abierto": true
}
```

### Sin forma → identidad por nombre interno

```json
{ "project_id": "e57a318a-...", "ficha": { "producto": "PLA 1kg", "referencia": "FIL-PLA-1", "coste_unitario": "19.9" } }
```
Respuesta `200` con `forma_declarada:false` y `coste.coste_unitario:19.9` (copiado).

### Fallo — ficha inválida

```json
{ "project_id": "e57a318a-...", "ficha": "texto" }
```
Respuesta `400` + `frontera-ficha-producto.entrar.failed` (`INVALID_INPUT`, field `ficha`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`ficha`) | no viene una ficha/producto/crudo en objeto. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; nadie). Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` +
  `project-manager`.
- **De quién depende:** ninguna. La ficha del negocio llega declarada en la petición (de su
  vertical).
- **Quién la usa:** el dato contable del coste (el coste interno que alimenta la valoración de
  existencias, `valoracion-existencia` J3).
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-analitica/frontera-ficha-producto/module.json` + `index.js`.
2. Smoke: `entrar` con ficha válida → 200, `coste.forma_interna:true`, importes copiados.
3. Sin forma → `forma_declarada:false`, identidad por nombre interno.
4. Ficha inválida → `.entrar.failed`.
5. Comprobar eventos reales: `grep -E '"event"' module.json`.

## Notas de implementación

- Clase `FronteraFichaProducto extends ModuloHibridoReflejo`; `name = 'frontera-ficha-producto'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless).
- `onEntrarRequest` delega en `_atender(e,'entrar','frontera-ficha-producto.entrar.response', ...)`
  y publica `.entrar.failed` si `status !== 200`.
- Proyección `_entrar`; helpers `_esImporte`, `_leerRuta`, `_clave`, `_num`; tool `toolEntrar`.
  `_invalid`/`_errorResponse` de `modulo-hibrido-reflejo`.
