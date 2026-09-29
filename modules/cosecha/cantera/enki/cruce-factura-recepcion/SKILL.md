---
name: cruce-factura-recepcion
description: >
  Skill FULL del módulo REFLEJO `cruce-factura-recepcion` de la vertical contabilidad de Enki.
  EL COTEJO PEDIDO ↔ RECEPCIÓN ↔ FACTURA antes de asentar (3-way match), determinista, con
  tolerancias declarables (sin ellas la igualdad es exacta) y con las diferencias declaradas en vez
  de ajustadas solas. Sin estado. Úsala para operar, depurar o extender el reflejo, o para entender
  su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites cotejar los tres documentos del hecho de compra antes de asentar (RPC
    cruce-factura-recepcion.cotejar.request).
  - Cuando depures por qué `cuadra:null` con `completo:false` (falta un lado: no se asume) o por
    qué `tolerancias:null` (no declaradas: la igualdad es EXACTA).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    cotejo (determinista, diferencias declaradas, no ajusta ni asienta).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo cruce-factura-recepcion.
tags: [enki, modulo, reflejo, contabilidad, cruce-factura-recepcion]
---

# cruce-factura-recepcion — REFLEJO STATELESS del 3-way match

## Qué hace el módulo

`cruce-factura-recepcion` es un **REFLEJO STATELESS** (N5, hoja del plan): **EL COTEJO PEDIDO ↔
RECEPCIÓN ↔ FACTURA, ANTES DE ASENTAR. (3-way match.)** Determinista: se comparan los **TRES
documentos** del hecho de compra por sus **LÍNEAS**, y la salida dice, **línea a línea**, si cuadran
y en qué **NO** cuadran.

Atributos del diseño: `pedido`, `recepcion`, `factura`. Métodos: `cotejar():Resultado`.

**🔴 LAS DIFERENCIAS SE DECLARAN, NO SE AJUSTAN SOLAS.** Lo que no cuadra va a la cola de
excepciones como **DIFERENCIA DECLARADA** (`diferencias_a_cola:true`, `se_ajusta_automaticamente:
false`); este reflejo **NO modifica la factura**, **NO modifica la recepción** y **NO asienta nada**
(`asentado:false`, `antes_de_asentar:true`). Resolver la diferencia es un acto **humano/asesor**.

**🔴 LAS TOLERANCIAS Y CRITERIOS SON DECLARABLES, NO CABLEADOS.** No hay ninguna tolerancia escrita
aquí (ni 0, ni un %, ni céntimos): si el negocio declara `tolerancias` (`{cantidad?, importe?,
general?}`) se aplican; si **NO** las declara, la igualdad es **EXACTA** y se declara que no hay
tolerancia (`tolerancias:null`) — una tolerancia inventada dejaría pasar diferencias que el negocio
no autorizó.

**🔴 SI UNO DE LOS TRES LADOS NO LLEGA, NO SE ASUME.** Las tres vías son **DECLARADAS**; las que
falten se declaran en `lados_faltantes` y el cotejo queda `completo:false` con `cuadra:null` (ni
conforme ni descuadrado: **no se sabe**), `se_asume_lado_faltante:false` — no se rellena la recepción
con el pedido ni la factura con la recepción: **un 3-way match sin tres lados no es match**.

Invariantes:

- **DETERMINISTA**: mismos tres documentos + mismas tolerancias → mismo resultado. El emparejamiento
  de líneas es por la **clave DECLARADA** de cada item (`clave`/`clave_natural`/`referencia`/`sku`/
  `codigo`/`articulo`; sin clave → por índice).
- **Dato ausente = desconocido**: sin líneas que comparar no se coteja; un lado ausente se declara;
  un valor sin declarar **no se lee como 0**.
- **NO escribe, NO persiste, NO muta y NO decide**: **declara el cotejo**; no corrige ni aprueba.
- La dependencia `puerto-evento-vertical` (A1) es de **DOMINIO** (por **EVENTO**, nunca por import):
  de ahí vienen los documentos del hecho.
- **Sin `PosPersistencia` y sin `project.activated`**: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `cruce-factura-recepcion.cotejar.request` | `onCotejarRequest` | RPC reflejo (cotejo puro, determinista): {project_id, pedido, recepcion, factura, tolerancias?:{cantidad?, importe?, general?}} → {project_id, tipo:'cruce-factura-recepcion', cuadra, completo, lados:{pedido,recepcion,factura}, lados_faltantes, lineas:[{clave, cantidades, importes, cuadra, diferencias}], num_lineas, diferencias, num_diferencias, tolerancias, diferencias_a_cola, se_ajusta_automaticamente:false, asentado:false, antes_de_asentar:true, resuelve, abierto}. Con un lado ausente → completo:false y cuadra:null (no se asume el lado que falta). Sin tolerancias declaradas la igualdad es EXACTA. Descuadre o cotejo incompleto → publica contabilidad.cruce_descuadrado; responde por cruce-factura-recepcion.cotejar.response; project_id ausente → cruce-factura-recepcion.cotejar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `cruce-factura-recepcion.cotejar.response` | Respuesta RPC correlada de cruce-factura-recepcion.cotejar.request → {request_id, status:200, data:{cuadra, completo, lados, lados_faltantes, lineas, diferencias, tolerancias, diferencias_a_cola, se_ajusta_automaticamente:false, asentado:false, abierto}}. Emitida por el helper _atender. |
| `cruce-factura-recepcion.cotejar.failed` | Par de fallo determinista (N5): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de cruce-factura-recepcion.cotejar.request. OJO: un cotejo que descuadra NO es un fallo — es un cotejo hecho con diferencias declaradas (cuadra:false). |
| `contabilidad.cruce_descuadrado` | Fire-and-forget (N5): el cotejo NO cuadra (cuadra:false) o quedo incompleto por un lado ausente (completo:false) → {project_id, cuadra, completo, lados_faltantes, diferencias, tolerancias, resuelve, correlation_id}. Lo LEEN la cola de excepciones y el aviso al asesor: las diferencias se DECLARAN y van a cola, el reflejo NO las corrige. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `cruce-factura-recepcion.cotejar.failed` cierra el círculo de
> `cruce-factura-recepcion.cotejar.request` cuando `_cotejar` devuelve status ≠ 200
> (`400 INVALID_INPUT` por `project_id` ausente). **Un cotejo que descuadra NO es un fallo**:
> va en la response `200` con `cuadra:false` y publica `contabilidad.cruce_descuadrado`.

> Nota: `onCotejarRequest` publica `contabilidad.cruce_descuadrado` cuando
> `res.status === 200` y (`cuadra === false` **o** `completo === false`); con `status !== 200`
> publica `cruce-factura-recepcion.cotejar.failed`. La diferencia se **DECLARA**; la cola la lee.

## Reglas de negocio

1. **Los TRES LADOS**: `pedido` (`input.pedido`/`input.p`), `recepcion`
   (`input.recepcion`/`input.recepcionado`/`input.r`) y `factura` (`input.factura`/`input.f`),
   aceptados solo si son objetos (`_doc`). `lados = {pedido:Boolean, recepcion:Boolean, factura:
   Boolean}`; `lados_faltantes` = las claves `false`.
2. **LADO AUSENTE → `completo:false`, `cuadra:null`**: si `lados_faltantes.length > 0` → no hay
   match (ni conforme ni descuadrado: **no se sabe**), `lineas:[]`, `diferencias:[]`,
   `se_asume_lado_faltante:false`, `abierto.lados` («el cotejo NO se cierra y NADA se asume en su
   lugar»). **No se rellena un lado con otro.**
3. **LAS TOLERANCIAS son DECLARABLES** (`_tolerancias`): `input.tolerancias`/`input.tolerancia`.
   - `number` → `{general:n}`;
   - `objeto` → claves `cantidad`/`importe`/`general`/`precio` (las que declaren número);
   - **sin declarar** → `null` (igualdad **EXACTA**) y `abierto.tolerancias` («cero tolerancias
     cableadas»).
4. **LA MATERIA**: los items de cada lado (`_items`): `doc.items[]`, `doc.lineas[]` o `doc.líneas[]`;
   un documento sin líneas se trata como un **item único** (cotejo a nivel de documento).
5. **El EMPAREJAMIENTO es determinista**: `_claves` da la **UNIÓN** ordenada de las claves de los
   tres lados; `_claveDe(x, i)` = `clave → clave_natural → referencia → sku → codigo → articulo`;
   sin ninguna → `` `#${i}` `` (por índice). `_mapaPorClave` → si una clave se repite en un lado,
   gana la **PRIMERA** declarada (**no se suman líneas por su cuenta: eso sería ajustar**).
6. **Las CANTIDADES e IMPORTES** (`_cantidad`: `cantidad`/`qty`/`unidades`; `_importe`: `importe`/
   `total`/`precio`/`pvp`) se leen **declarados**; sin declarar → `null` (**no se lee como 0**).
7. **Las DIFERENCIAS de la línea** (se **DECLARAN**, no se corrigen):
   - línea que falta en un lado (`!a`/`!b`/`!c`) → `{campo:'pedido'|'recepcion'|'factura', motivo}`;
   - `cantidad` pedido ≠ recepción (si existen ambos) → diferencia;
   - `cantidad` recepción ≠ factura (si existen ambos) → diferencia;
   - `importe` factura ≠ pedido → diferencia;
   - `importe` factura ≠ recepción pero **sí** = pedido (si existen los tres) → diferencia
     específica («coincide con el pedido pero no con lo recibido»).
8. **El veredicto**: `cuadra = diferencias.length === 0`; `completo:true` solo con los tres lados.
   `lineas[i].cuadra = dif.length === 0`.
9. **LA IGUALDAD** (`_iguales`): con tolerancia declarada, `|a − b| <= |tol| + 1e-9`; sin tolerancia,
   `round(a,4) === round(b,4)` (**EXACTA**). `null === null` → `true`; uno `null` y el otro no →
   `false`. La tolerancia aplicable (`_toleranciaPara`) es la del campo, o la `general`, o `null`.
10. **LAS DIFERENCIAS VAN A COLA**: `diferencias_a_cola = !cuadra`; `se_ajusta_automaticamente:false`;
    `asentado:false`; `antes_de_asentar:true`; `resuelve:'asesor (las diferencias se declaran; no se
    ajustan solas)'`.
11. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`).
12. **HTTP exacto**: éxito `200` (también con `cuadra:false` o `completo:false`); `project_id`
    ausente → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `cruce-factura-recepcion.cotejar.response`. Con `cuadra:false` o `completo:false` publica
`contabilidad.cruce_descuadrado` (lo leen la cola de excepciones y el aviso al asesor).

### 1. `cotejar` — los tres lados cuadran (con tolerancia declarada)

```json
{
  "project_id": "e57a318a-...",
  "pedido":    { "items": [ { "clave": "A", "cantidad": 10, "importe": 100 } ] },
  "recepcion": { "items": [ { "clave": "A", "cantidad": 10, "importe": 100 } ] },
  "factura":   { "items": [ { "clave": "A", "cantidad": 10, "importe": 101 } ] },
  "tolerancias": { "importe": 2 },
  "correlation_id": "abc-123"
}
```

Respuesta `200`: `cuadra:true`, `completo:true`, `lados:{pedido:true,recepcion:true,factura:true}`,
`lados_faltantes:[]`, `lineas:[{clave:'A', cuadra:true, diferencias:[]}]`, `num_diferencias:0`,
`tolerancias:{importe:2}`, `diferencias_a_cola:false`, `se_ajusta_automaticamente:false`,
`asentado:false`, `antes_de_asentar:true`. **No publica `cruce_descuadrado`.**

### 2. `cotejar` — descuadre → diferencia declarada + a cola

Factura 205 vs pedido/recepción 200 sin tolerancia → `cuadra:false`,
`diferencias:[{linea:'A', campo:'importe', lados:['pedido','factura'], pedido:200, factura:205,
motivo:'el importe facturado no coincide con el pedido'}]`, `diferencias_a_cola:true`,
`se_ajusta_automaticamente:false` y **publica `contabilidad.cruce_descuadrado`**.

### 3. `cotejar` — sin tolerancias → igualdad EXACTA

Sin `tolerancias` → `tolerancias:null` y `abierto.tolerancias` («la igualdad es EXACTA (cero
tolerancias cableadas)»). Una diferencia de 1 céntimo **descuadra**.

### 4. `cotejar` — falta un lado → `completo:false`, `cuadra:null` (no se asume)

Sin `factura` → `lados:{pedido:true,recepcion:true,factura:false}`,
`lados_faltantes:['factura']`, `cuadra:null`, `completo:false`, `se_asume_lado_faltante:false` y
`abierto.lados` («faltan lados del 3-way match (factura): el cotejo NO se cierra y NADA se asume en
su lugar»). **Publica `contabilidad.cruce_descuadrado`.**

### 5. `cotejar` — línea que falta en un lado

Línea `B` en pedido/recepción pero no en factura → diferencia
`{campo:'factura', motivo:'la linea existe en pedido/recepcion pero NO esta facturada'}`.

### 6. Fallo — falta `project_id`

Respuesta `400` + `cruce-factura-recepcion.cotejar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/cruce-factura-recepcion.test.js`. Cubre:

- Tres lados que cuadran → `200 cuadra:true`, `completo:true`, **no** publica `cruce_descuadrado`.
- **Descuadre** → `cuadra:false`, diferencias por línea, `diferencias_a_cola:true`,
  `se_ajusta_automaticamente:false` y publica `contabilidad.cruce_descuadrado`.
- **Sin tolerancias** → igualdad EXACTA (`tolerancias:null`); con tolerancia declarada → se admite
  `|a−b| <= tol`.
- **Lado ausente** → `completo:false`, `cuadra:null` (**no se asume**), `se_asume_lado_faltante:false`.
- **Línea que falta en un lado** → diferencia con su `motivo`.
- Emparejamiento por **clave declarada**; sin clave → por índice (`#0`); clave repetida → gana la
  primera (**no se suman líneas**).
- Valor sin declarar → `null` (**no se lee como 0**).
- **Determinismo**: mismos tres documentos + mismas tolerancias → mismo resultado.
- `project_id` ausente → `400 INVALID_INPUT` + `cruce-factura-recepcion.cotejar.failed`.
- `toolCotejar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `CruceFacturaRecepcion extends ModuloHibridoReflejo`; `name = 'cruce-factura-recepcion'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/cruce-factura-recepcion/`; es de la vertical **entrada**).
- `onCotejarRequest` usa `this._atender(e, 'cotejar', 'cruce-factura-recepcion.cotejar.response',
  async (d) => {...})`: con `status === 200` y (`cuadra === false || completo === false`) publica
  `contabilidad.cruce_descuadrado`; con `status !== 200` publica
  `cruce-factura-recepcion.cotejar.failed`.
- Proyección `_cotejar(input)` (**sync**, cotejo puro); helpers `_doc`, `_items`, `_claves`,
  `_mapaPorClave`, `_claveDe`, `_cantidad`, `_importe`, `_iguales`, `_toleranciaPara`, `_tolerancias`,
  `_num`. Tool `toolCotejar`.
- `_invalid` / `_round` vienen de `modulo-hibrido-reflejo`.
- **DEP**: `puerto-evento-vertical` (A1) es de **DOMINIO** (por **EVENTO**, nunca por import): de ahí
  vienen los documentos del hecho. Lo que descuadra lo lee la **cola de excepciones**.
- **🔴 LAS DIFERENCIAS SE DECLARAN, NO SE AJUSTAN SOLAS**: `se_ajusta_automaticamente:false`,
  `asentado:false`, `antes_de_asentar:true`; el reflejo **NO modifica la factura, NO modifica la
  recepción y NO asienta nada**.
- **🔴 TOLERANCIAS DECLARABLES**: **cero tolerancias cableadas**; sin declararlas, la igualdad es
  **EXACTA**.
- **DATO AUSENTE = DESCONOCIDO**: un lado ausente → `completo:false`/`cuadra:null` (**no se asume**);
  un valor sin declarar no se lee como 0. **NO escribe, NO persiste, NO muta.**
