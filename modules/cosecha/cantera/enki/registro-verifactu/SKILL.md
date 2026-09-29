---
name: registro-verifactu
description: >
  Skill FULL del módulo CUSTODIO `registro-verifactu` de la vertical contabilidad de Enki.
  LA CADENA INALTERABLE DE LA FACTURACIÓN (RD 1007/2023): cada registro de alta se
  ENCADENA al anterior por la HUELLA (hash) del registro PREVIO — un registro = un eslabón,
  APPEND-ONLY, NO se borra y NO se reescribe NUNCA. Es la invariante del asiento aplicada a
  Verifactu; el sistema GENERA y REGISTRA, NO firma y NO presenta. El algoritmo y los campos
  de la huella son declarables. Úsala para operar, depurar o extender el custodio, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites encadenar un registro de facturación (RPC
    registro-verifactu.encadenar.request) o cuando la cadena se alimente sola por el evento
    `contabilidad.factura_emitida`.
  - Cuando depures por qué un eslabón no se apila (403 PERMISSION_DENIED si el rol no es
    ENCADENADOR_VERIFACTU, 400 INVALID_INPUT si falta registro/clave, 422
    ALGORITMO_NO_DECLARABLE) o por qué `encadenada:false` (`repetida:true`).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del custodio (huella del anterior, append-only, nunca borra ni reescribe, la ley entra
    como dato, no firma ni presenta).
  - Cuando vayas a escribir/ampliar el test unitario del custodio registro-verifactu.
tags: [enki, modulo, custodio, contabilidad, registro-verifactu]
---

# registro-verifactu — CUSTODIO CON PERSISTENCIA de la cadena inalterable

## Qué hace el módulo

`registro-verifactu` es un **CUSTODIO CON PERSISTENCIA** (D8, hoja del plan): **LA
HUELLA/CADENA INALTERABLE DE LA FACTURACIÓN** (RD 1007/2023). Cada registro de alta de
factura se **ENCADENA al anterior**: el registro lleva la **HUELLA (hash) del registro
ANTERIOR** (`huella_anterior`) y su propia `huella = hash(algoritmo; huella_anterior +
contenido canónico)`, de modo que **la cadena entera es verificable** y **ningún eslabón
puede alterarse sin romperla**.

Es **LA INVARIANTE DEL ASIENTO APLICADA A VERIFACTU**: **APPEND-ONLY**. Un registro = un
eslabón. **NO se borra y NO se reescribe NUNCA.** Este módulo **no expone ninguna operación
de borrado ni de edición**: solo `encadenar` (apilar) y lectura. El eslabón previo es
**inmutable por construcción**.

El sistema **GENERA y REGISTRA**; **NO firma y NO presenta**. La firma es del asesor/flujo
de firma; la presentación a la administración es del asesor. Aquí solo se encadena:
`firmado:false` y `presentado:false` viajan declarados en cada eslabón.

**LA LEY ENTRA COMO DATO** (invariante 5): el **ALGORITMO** de huella es **DECLARABLE**
(`algoritmo`, admitidos `sha256`/`sha384`/`sha512`, default `sha256` — un algoritmo del
estándar, **no una constante legal** de Verifactu) y los **CAMPOS** que entran en la huella
son **DECLARABLES** (`campos_huella`; sin declarar, entra **TODO** el contenido). No se
cablea ningún formato, versión, serie de plazos ni campo obligatorio de un esquema normativo
concreto. El registro de entrada llega **TAL CUAL lo declare el emisor**. El primer eslabón
arranca de la huella origen **DECLARADA** (`huella_origen`) o `null`, **nunca de una constante**.

**UN SOLO ESCRITOR**: el encadenador (rol `ENCADENADOR_VERIFACTU`). Cualquier otro rol es
rechazado (`403`). Recibe el alta por **DOS vías, ninguna `require` cruzado**: RPC
`registro-verifactu.encadenar.request` o **fire-and-forget** `contabilidad.factura_emitida`
(publicado por `emision-factura-venta` O1).

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/registro-verifactu/registro-verifactu.json`), restaura en `project.activated`
y vuelca en `onUnload`. Proyección `_encadenar`. Publica `contabilidad.huella_encadenada`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `registro-verifactu.encadenar.request` | `onEncadenarRequest` | RPC custodio (escritura, UN escritor): {project_id, rol, registro\|factura, clave?, algoritmo?, campos_huella?, huella_origen?} → {eslabon:{numero, clave, contenido, huella, huella_anterior, algoritmo, campos_huella, firmado:false, presentado:false, inmutable:true, append_only:true}, encadenada, repetida, longitud_cadena}. GUARD de rol: solo ENCADENADOR_VERIFACTU (403 si otro). La cadena se apila con la HUELLA DEL REGISTRO ANTERIOR; APPEND-ONLY (nunca se borra ni se reescribe). Clave ya encadenada → encadenada:false, repetida:true (no se duplica ni reescribe). Algoritmo no admitido → 422 ALGORITMO_NO_DECLARABLE. Exito → publica contabilidad.huella_encadenada y responde por registro-verifactu.encadenar.response; fallo → registro-verifactu.encadenar.failed. |
| `contabilidad.factura_emitida` | `onFacturaEmitida` | Fire-and-forget (D8): lo publica emision-factura-venta (O1) al emitir su factura → se encadena el eslabon automaticamente (append-only) con la huella del anterior y se publica contabilidad.huella_encadenada. |
| `project.activated` | `onProjectActivated` | Ciclo de vida: restaura la cadena persistida del proyecto activado via PosPersistencia.restaurar(project_id). El custodio persiste, por eso se suscribe obligatoriamente a la activacion. |

### Publishes

| Evento | Descripción |
|---|---|
| `registro-verifactu.encadenar.response` | Respuesta RPC correlada de registro-verifactu.encadenar.request → {request_id, status:200, data:{eslabon, encadenada, repetida, longitud_cadena}}. Emitida por el helper _atender. |
| `registro-verifactu.encadenar.failed` | Par de fallo determinista (D8): rol no autorizado (403), registro/clave ausente (400) o algoritmo no admitido (422) → {status, error:{code, message, details?}}. Cierra el circulo de registro-verifactu.encadenar.request. |
| `contabilidad.huella_encadenada` | Fire-and-forget (D8): un eslabon quedo apilado en la cadena inalterable → {project_id, eslabon, clave, huella, huella_anterior, encadenada, repetida, correlation_id}. Da a conocer que la factura quedo encadenada (huella del anterior). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `registro-verifactu.encadenar.failed` cierra el círculo de
> `registro-verifactu.encadenar.request` cuando `_encadenar` devuelve status ≠ 200
> (`400`/`403`/`422`).

> Nota de honestidad (cruce con `index.js`): el payload de `contabilidad.huella_encadenada`
> lleva `eslabon: res.data.eslabon.numero` (**el NÚMERO del eslabón**, no el objeto
> completo), junto con `clave`, `huella` y `huella_anterior`.

> Nota de honestidad (cruce con `index.js`): la rama **idempotente** (`encadenada:false,
> repetida:true`) devuelve **`200`** → **SÍ** publica `contabilidad.huella_encadenada` (con
> `encadenada:false`); no hay reescritura ni duplicación del eslabón.

> Nota de honestidad (cruce con `index.js`): `onFacturaEmitida` **no** usa `_atender`:
> llama directamente a `_encadenar({project_id, rol: ROL_ESCRITOR, factura: d.factura ||
> {serie, numero, clave}, clave: d.clave, correlation_id})`. Si no hay `project_id` devuelve
> `null` **sin escribir**; si `_encadenar` no da `200`, publica
> `registro-verifactu.encadenar.failed` (mismo par que la vía RPC).

> Nota: el módulo expone `cadena(pid)` como **lectura directa** para otras hojas del mismo
> proceso (no muta) — no es un evento del bus, no figura en `module.json`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente → `400
   INVALID_INPUT` (`field:'project_id'`).
2. **GUARD de escritor**: `input.rol !== 'ENCADENADOR_VERIFACTU'` → `403 PERMISSION_DENIED`
   con `{rol_esperado, rol_recibido}`.
3. **El registro es obligatorio y debe ser objeto**: `input.registro || input.factura`; si no
   → `400 INVALID_INPUT` (`field:'registro'`).
4. **La clave (identidad del eslabón) con fallback**:
   `input.clave ?? registro.clave ?? (registro.serie && registro.numero ? '<serie>/<numero>' : null)`;
   sin clave → `400 INVALID_INPUT` (`field:'clave'`).
5. **IDEMPOTENCIA sin reescribir**: si la clave ya está en el índice → `200
   {eslabon:<existente>, encadenada:false, repetida:true, motivo:'la clave ya esta
   encadenada: no se reescribe ni se duplica el eslabon'}`. Devolver el eslabón existente
   **NO** reescribe nada: la cadena queda intacta (un registro = un eslabón).
6. **El algoritmo es DECLARABLE (del estándar)**: `String(input.algoritmo).toLowerCase()` o
   default `sha256`; si no está en `{sha256, sha384, sha512}` → `422 ALGORITMO_NO_DECLARABLE`
   con `{algoritmo, admitidos}`. **No se cablea ningún formato legal.**
7. **Los campos de la huella son DECLARABLES**: `campos_huella` (array de strings) o `null`;
   sin declarar, **TODO** el contenido del registro entra en la huella (nada se omite por una
   lista cableada).
8. **LA INVARIANTE — huella del registro ANTERIOR**: `huella_anterior = ultimo.huella`; si
   la cadena está vacía, `huella_anterior = input.huella_origen ?? null` (**nunca una constante**).
9. **La huella se calcula sobre material estable**: `_huella(registro, huella_anterior,
   algoritmo, campos)` = `crypto.createHash(algoritmo).update(JSON.stringify({huella_anterior,
   contenido: _estable(contenido)}), 'utf-8').digest('hex')`, donde `_estable` **ordena las
   claves** para que la misma entrada dé la misma huella; con `campos` declarados, `contenido`
   se recorta a esos campos (ausente → `null`).
10. **El eslabón es un hecho completo e inmutable**: `{numero, clave, contenido, huella_anterior,
    huella, algoritmo, campos_huella, firmado:false, presentado:false, generado_por,
    generado_en, inmutable:true, append_only:true}`. El contenido entra **tal cual lo declara
    el emisor** (no se completa ni se estima).
11. **APPEND-ONLY**: el eslabón se **apila** en `c.eslabones` y se indexa en `c.indice` por
    clave. **NO se borra y NO se reescribe NUNCA.**
12. **El número es la posición**: `numero = c.eslabones.length + 1`; la respuesta añade
    `longitud_cadena`.
13. **El sistema NO firma ni presenta**: cada eslabón lleva `firmado:false`, `presentado:false`.
14. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)`; `project.activated` →
    `restaurar(project_id)` (reconstruye `eslabones` + `indice`); `onUnload` → `flush()` +
    `detener()`.
15. **HTTP exacto**: éxito `200` (encadenada o repetida); `project_id`/`registro`/`clave`
    inválidos → `400`; rol ajeno → `403`; algoritmo no admitido → `422`; excepción en
    `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `registro-verifactu.encadenar.response` y emite `contabilidad.huella_encadenada`.

### 1. `encadenar` — apilar un eslabón con la huella del anterior

```json
{
  "project_id": "e57a318a-...",
  "rol": "ENCADENADOR_VERIFACTU",
  "registro": { "serie": "A", "numero": "1", "base": 1000, "total": 1210 },
  "algoritmo": "sha256",
  "huella_origen": "HUELLA-INICIAL-DECLARADA",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "eslabon": {
    "numero": 1,
    "clave": "A/1",
    "contenido": { "serie": "A", "numero": "1", "base": 1000, "total": 1210 },
    "huella_anterior": "HUELLA-INICIAL-DECLARADA",
    "huella": "3f2a...e91c",
    "algoritmo": "sha256",
    "campos_huella": null,
    "firmado": false,
    "presentado": false,
    "generado_por": "ENCADENADOR_VERIFACTU",
    "generado_en": "2026-09-25T...",
    "inmutable": true,
    "append_only": true
  },
  "encadenada": true,
  "repetida": false,
  "longitud_cadena": 1
}
```

Emite `contabilidad.huella_encadenada`:

```json
{ "project_id": "e57a318a-...", "eslabon": 1, "clave": "A/1", "huella": "3f2a...e91c", "huella_anterior": "HUELLA-INICIAL-DECLARADA", "encadenada": true, "repetida": false, "correlation_id": "abc-123" }
```

### 2. `encadenar` — misma clave (idempotente, no reescribe)

Misma `clave` (`A/1`) → Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "eslabon": { "numero": 1, "...": "..." }, "encadenada": false, "repetida": true, "motivo": "la clave ya esta encadenada: no se reescribe ni se duplica el eslabon" }
```

La cadena **no** crece, el eslabón previo **no** cambia.

### 3. Fire-and-forget — `contabilidad.factura_emitida` (de O1)

`onFacturaEmitida` toma `d.project_id` (sin él → `null`), arma el registro con
`d.factura` o `{serie, numero, clave}` y **apila** el eslabón con la huella del anterior,
publicando `contabilidad.huella_encadenada` (o `registro-verifactu.encadenar.failed` si falla).

### 4. Fallo — rol no autorizado

```json
{ "project_id": "e57a318a-...", "rol": "OTRO_ROL", "registro": { "serie": "A", "numero": "2" } }
```

Respuesta `403` + `registro-verifactu.encadenar.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el encadenador (ENCADENADOR_VERIFACTU) escribe en la cadena inalterable", "details": { "rol_esperado": "ENCADENADOR_VERIFACTU", "rol_recibido": "OTRO_ROL" } } }
```

### 5. Fallo — algoritmo no admitido

```json
{ "project_id": "e57a318a-...", "rol": "ENCADENADOR_VERIFACTU", "registro": { "serie": "A", "numero": "3" }, "algoritmo": "md5" }
```

Respuesta `422` + `registro-verifactu.encadenar.failed`:

```json
{ "status": 422, "error": { "code": "ALGORITMO_NO_DECLARABLE", "message": "algoritmo de huella no admitido", "details": { "algoritmo": "md5", "admitidos": ["sha256", "sha384", "sha512"] } } }
```

## Tests

El test unitario vive en `tests/unit/registro-verifactu.test.js`. Cubre:

- Primer `encadenar` → eslabón `numero:1`, `huella_anterior` = `huella_origen` declarada
  (o `null`), `encadenada:true`; emite `contabilidad.huella_encadenada`.
- Segundo `encadenar` → `numero:2` y `huella_anterior` **= huella del eslabón 1** (la
  cadena se verifica eslabón a eslabón).
- Misma clave → `200 {encadenada:false, repetida:true}` sin reescribir ni duplicar.
- **Append-only**: el eslabón previo permanece idéntico tras apilar el siguiente.
- Rol distinto de `ENCADENADOR_VERIFACTU` → `403 PERMISSION_DENIED`.
- `registro` ausente → `400` (`field:'registro'`); sin clave determinable → `400`
  (`field:'clave'`); `project_id` ausente → `400`.
- `algoritmo` no admitido → `422 ALGORITMO_NO_DECLARABLE`; `campos_huella` declarados recortan
  el material; `_estable` garantiza la misma huella con claves en distinto orden.
- `onFacturaEmitida` encadena automáticamente y publica `contabilidad.huella_encadenada`;
  sin `project_id` → `null`.
- `project.activated` restaura eslabones + índice; `cadena(pid)` lee sin mutar.
- `toolEncadenar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `RegistroVerifactu extends ModuloHibridoReflejo`; `name = 'registro-verifactu'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._cadenas` (`Map<project_id, {esquema,
  eslabones:[append-only], indice: Map<clave, pos>}>`).
- Constantes: `ROL_ESCRITOR = 'ENCADENADOR_VERIFACTU'`, `ALGORITMOS =
  new Set(['sha256','sha384','sha512'])`, `ALGORITMO_POR_DEFECTO = 'sha256'`. Requiere
  `crypto` de Node.
- **PosPersistencia**: `_persist = new PosPersistencia({modulo, file:
  'registro-verifactu.json', dir: '/contabilidad/registro-verifactu', snapshot, hidratar})`
  desde `modules/contabilidad-fiscal/registro-verifactu/` (DOS niveles →
  `../../_shared/pos-persistencia`). `onProjectActivated` → `restaurar(project_id)`;
  `onUnload` → `flush()` + `detener()`; cada escritura `marcarDirty(pid)`.
- `onEncadenarRequest` usa `this._atender(e, 'encadenar',
  'registro-verifactu.encadenar.response', async (d) => {...})`; dentro hace el cierre de
  círculo. `onFacturaEmitida` **no** usa `_atender` (llama a `_encadenar` directamente).
- Proyección `_encadenar(input)` (síncrona); helpers `_huella`, `_estable`, `_obtenerOCrear`;
  lectura directa `cadena(pid)`. Tool `toolEncadenar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo alimenta `emision-factura-venta` (O1) vía `contabilidad.factura_emitida`. **Nota de
  invariante**: aquí está la invariante del asiento (append-only, inmutabilidad, un solo
  escritor) aplicada a la facturación.
