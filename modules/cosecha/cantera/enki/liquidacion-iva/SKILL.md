---
name: liquidacion-iva
description: >
  Skill FULL del módulo REFLEJO `liquidacion-iva` de la vertical contabilidad de Enki
  (D1/D2/D3, hoja del plan). EL IMPUESTO INDIRECTO DERIVADO DEL LIBRO con los TIPOS
  DECLARADOS. NINGÚN TIPO CABLEADO: el sistema no asume 21/10/4 — los tipos y las cuentas
  de impuesto son DATOS declarables (D10/D11 en cola-declaraciones-criterio K9, por EVENTO
  contabilidad.criterio.leer.request) y el impuesto indirecto concreto tampoco se asume
  «IVA»: lo declara el perfil administrativo (D15, por EVENTO
  contabilidad.perfil.aplicables.request). Deriva devengado (repercutido) vs soportado
  (deducible) → cuota, y construye los modelos 303 (periódico) y 390 (anual). Sin TIPOS
  DECLARADOS no liquida → 422 TIPOS_NO_DECLARADOS (LA LEY NO SE CABLEA); sin libro → 503
  DEPENDENCIA_NO_DISPONIBLE; JAMÁS se inventa una cuota. Úsala para operar, depurar o
  extender el reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites liquidar el impuesto indirecto del periodo (RPC
    contabilidad.iva.liquidar.request), construir el modelo 303
    (contabilidad.modelo.303.request) o el 390 (contabilidad.modelo.390.request).
  - Cuando depures por qué no se liquida (422 TIPOS_NO_DECLARADOS si no hay tipos
    declarados, 503 DEPENDENCIA_NO_DISPONIBLE si no hay libro, 400 INVALID_INPUT si falta
    project_id).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), por qué ningún
    tipo está cableado y cómo el sistema PREPARA pero no presenta.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo liquidacion-iva.
tags: [enki, modulo, reflejo, contabilidad, liquidacion-iva, fiscal, declarable, determinista]
---

# liquidacion-iva — REFLEJO que deriva el impuesto indirecto del libro

## Qué hace el módulo

`liquidacion-iva` es un **REFLEJO STATELESS** (D1/D2/D3, hoja del plan): **EL IMPUESTO
INDIRECTO DERIVADO DEL LIBRO con los TIPOS DECLARADOS**. **NINGÚN TIPO CABLEADO**: el
sistema **no asume 21/10/4** — los tipos y las cuentas de impuesto son **DATOS
declarables** (D10/D11, `cola-declaraciones-criterio` K9, por **EVENTO**
`contabilidad.criterio.leer.request`) y el **impuesto indirecto concreto tampoco se asume
«IVA»**: se asume el que **declara el perfil administrativo** (D15, por **EVENTO**
`contabilidad.perfil.aplicables.request`).

Sobre el **libro** (por payload o **EVENTO** `contabilidad.diario.leer.request`, con
respaldo **EVENTO** `contabilidad.mayor.saldo.request`):

- **D1** `_devengado` → Importe (repercutido: `haber - debe` en las cuentas declaradas);
- **D1** `_soportado` → Importe (deducible: `debe - haber`);
- **D1** `_liquidar` → `Liquidacion { devengado, deducible, resultado, a_ingresar |
  a_compensar, por_tipo }`;
- **D2** `_construir303` → Modelo (autoliquidación periódica: **el sistema PREPARA,
  presentar es del asesor**);
- **D3** `_resumen390` → Modelo (resumen anual determinista).

Es **stateless**: sin PosPersistencia ni `project.activated` — cada op **entra objeto, sale
objeto**. El contrato es **TOLERANTE con el libro pero EXIGENTE en lo fiscal**: **SIN TIPOS
DECLARADOS no se liquida nada** → **`422 TIPOS_NO_DECLARADOS`** (*LA LEY NO SE CABLEA*);
sin libro → **`503 DEPENDENCIA_NO_DISPONIBLE`**; **JAMÁS se inventa una cuota**. Emite
`contabilidad.iva_liquidado` y `contabilidad.modelo_construido` en éxito, y sus pares
deterministas en fallo.

> **NO REUTILIZA**: IVA y modelos no existen en el inventario (verificado: 0 módulos). La
> ley entra como **DATO declarable**.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.iva.liquidar.request` | `onLiquidarRequest` | RPC reflejo: {project_id, periodo?, tipos?:{nombre:porcentaje}, cuentas?:{repercutido, deducible}, diario?, sociedad?, territorio?, impuesto_indirecto?} → {project_id, periodo, impuesto_indirecto, territorio, liquidacion:{devengado, deducible, soportado, resultado, a_ingresar, a_compensar, por_tipo}, tipos_declarados, fuente_tipos, n_asientos}. Deriva el impuesto indirecto del libro (payload o EVENTO contabilidad.diario.leer.request) con los tipos declarados (payload o EVENTO contabilidad.criterio.leer.request criterio D11) y el impuesto/territorio del perfil (EVENTO contabilidad.perfil.aplicables.request). SIN TIPOS DECLARADOS → 422 TIPOS_NO_DECLARADOS; sin libro → 503 DEPENDENCIA_NO_DISPONIBLE. Exito publica contabilidad.iva_liquidado y responde por contabilidad.iva.liquidar.response; error → contabilidad.iva.liquidar.failed. |
| `contabilidad.modelo.303.request` | `on303Request` | RPC reflejo: {project_id, periodo, tipos?, ejercicio?} → {project_id, modelo:'303', periodo, ejercicio, casillas:{devengado_repercutido, deducible_soportado, resultado, a_ingresar, a_compensar, por_tipo}, modelo_construido:true, presentado:false}. Construye la autoliquidacion periodica desde la liquidacion (D2). Exito publica contabilidad.modelo_construido y responde por contabilidad.modelo.303.response; error → contabilidad.modelo.303.failed. |
| `contabilidad.modelo.390.request` | `on390Request` | RPC reflejo: {project_id, ejercicio\|periodo, liquidaciones?, tipos?} → {project_id, modelo:'390', ejercicio, resumen:{devengado, deducible, resultado, a_ingresar, a_compensar}, n_liquidaciones, modelo_construido:true}. Resumen anual del impuesto indirecto (D3), determinista desde el libro/liquidaciones. Exito publica contabilidad.modelo_construido y responde por contabilidad.modelo.390.response; error → contabilidad.modelo.390.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.iva_liquidado` | Fire-and-forget (D1): el impuesto indirecto del periodo quedo liquidado desde el libro con los tipos declarados → {project_id, periodo, impuesto_indirecto, territorio, liquidacion:{devengado, deducible, resultado, a_ingresar, a_compensar, por_tipo}, tipos_declarados}. Lo consumen estado-presentacion-fiscal (D12) y motor-avisos (K2). |
| `contabilidad.modelo_construido` | Fire-and-forget (D2/D3): un modelo fiscal (303 periodico o 390 anual) quedo construido desde la liquidacion → {project_id, modelo, periodo\|ejercicio, casillas\|resumen, modelo_construido:true, presentado:false}. Lo consume generador-modelo (D7): el sistema PREPARA, presentar es del asesor. |
| `contabilidad.iva.liquidar.failed` | Par de fallo determinista: liquidar sin project_id, SIN TIPOS DECLARADOS (422 TIPOS_NO_DECLARADOS: la ley no se cablea) o sin libro (503 DEPENDENCIA_NO_DISPONIBLE). Cierra el circulo de contabilidad.iva.liquidar.request. |
| `contabilidad.modelo.303.failed` | Par de fallo determinista: construir el 303 sin project_id, sin tipos declarados o sin libro. Cierra el circulo de contabilidad.modelo.303.request. |
| `contabilidad.modelo.390.failed` | Par de fallo determinista: resumir el 390 sin project_id, sin tipos declarados o sin libro. Cierra el circulo de contabilidad.modelo.390.request. |
| `contabilidad.iva_liquidado.failed` | Par de fallo del evento de dominio contabilidad.iva_liquidado: la emision del hecho de dominio no se completo. |
| `contabilidad.modelo_construido.failed` | Par de fallo del evento de dominio contabilidad.modelo_construido: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.iva.liquidar.failed` cierra `contabilidad.iva.liquidar.request`;
> `contabilidad.modelo.303.failed` cierra `contabilidad.modelo.303.request`;
> `contabilidad.modelo.390.failed` cierra `contabilidad.modelo.390.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.iva.liquidar.response`, `contabilidad.modelo.303.response` y
> `contabilidad.modelo.390.response` (los pares response de los RPC); **NO están
> declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el
> par de fallo real es `<op>.failed`) — `contabilidad.iva_liquidado.failed` y
> `contabilidad.modelo_construido.failed` son los pares de fallo de los eventos de
> DOMINIO; el reflejo solo publica los pares `*.failed` de sus RPC.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.diario.leer.request` (escritor-diario B2, con respaldo
> `contabilidad.mayor.saldo.request` de mayor-balanza B3),
> `contabilidad.perfil.aplicables.request` (perfil-administrativo D15) y
> `contabilidad.criterio.leer.request` (cola-declaraciones-criterio D11); dependencias por
> EVENTO no declaradas como publishers.

## Reglas de negocio

1. **La ley NO se cablea (el cerrojo fiscal)**: `_liquidar` exige **tipos declarados**
   (payload `input.tipos` normalizado por `_normalizarTipos`, o EVENTO D11 con
   `criterio:'D11'`). Sin ellos → **`422 TIPOS_NO_DECLARADOS`** con
   `{ dependencia:'cola-declaraciones-criterio (D11)', accion:'DECLARAR_TIPOS',
   tipos_cableados:false }` y el mensaje *«los tipos del impuesto son DATOS DECLARABLES
   (D10/D11): sin tipos declarados no se liquida; el sistema no asume 21/10/4»*. **Jamás se
   inventa una cuota.**
2. **El impuesto concreto TAMPOCO se asume**: `_perfilDe` toma `territorio`/
   `impuesto_indirecto` del payload si vienen; si no, del EVENTO
   `contabilidad.perfil.aplicables.request` (D15). El `impuesto_indirecto` puede ser
   `IVA`/`IGIC`/`IPSI`; el reflejo **no elige**, recibe lo declarado.
3. **Cuentas declarables**: `_cuentasDe` usa `input.cuentas` o `parametros.cuentas` o
   `CUENTAS_POR_DEFECTO = { devengado:['477','472'], soportado:['472','477'],
   repercutido:['477'], deducible:['472'] }`. Normaliza cada cuenta a sus **3 primeros
   dígitos** (quita no-dígitos). **Son el valor declarable inicial, no una constante de la
   lógica.**
4. **Devengado (repercutido)**: `_devengado` recorre el libro en periodo y suma, en las
   cuentas de `repercutido`, `haber - debe`. Redondeado a céntimos.
5. **Soportado (deducible)**: `_soportado` suma, en las cuentas de `deducible`,
   `debe - haber`.
6. **Resultado y destino**: `resultado = devengado - soportado`; `a_ingresar = resultado >
   0 ? resultado : 0`; `a_compensar = resultado < 0 ? -resultado : 0`.
7. **Por tipo**: `_porTipo` acumula por cada apunte con `tipo_impuesto`/`tipo_iva`/`tipo`
   **declarado** (la clave debe existir en `tipos`); la `cuota = base * tipo / 100`
   redondeada. La `base` es `a.base` o, si no, `debe + haber`.
8. **El libro se LEE por EVENTO (TOLERANTE)**: `_libroDe` acepta `diario`/`asientos`/`libro`
   del payload (array o `{diario:[]}`); si no, pide `contabilidad.diario.leer.request` a
   `escritor-diario` (B2) y, si falla, `contabilidad.mayor.saldo.request` (B3). Si tampoco
   → `null` → **`503 DEPENDENCIA_NO_DISPONIBLE`** con
   `{ dependencia:'escritor-diario', accion:'NO_CALCULAR_PUBLICAR_FALLO' }`. **No se liquida
   el impuesto sin libro.**
9. **Filtro de periodo**: `_enPeriodo` acepta un asiento si no se declara periodo, o si
   `asiento.periodo === periodo`, o si `fecha_operacion`/`fecha` empieza por el periodo
   (corte por `YYYY-MM`).
10. **El 303 (D2) se construye DESDE la liquidación**: `_construir303` reutiliza
    `_liquidar` y compone `casillas` (`devengado_repercutido`, `deducible_soportado`,
    `resultado`, `a_ingresar`, `a_compensar`, `por_tipo`). `modelo_construido:true`,
    `presentado:false`, `presentar_es_del_asesor:true`: **el sistema PREPARA, no presenta**.
    **Ningún tipo ni plazo cableado.**
11. **El 390 (D3) resume el ejercicio**: sin `liquidaciones` en el payload, resume el
    ejercicio entero llamando a `_liquidar({ ...input, periodo: ejercicio })`. Suma
    `devengado`/`deducible` (acepta tanto `devengado` como `devengado_repercutido`, y
    `deducible`/`soportado`/`deducible_soportado`), calcula `resultado`, `a_ingresar`,
    `a_compensar`. `presentado:false`.
12. **Determinismo**: `derivado_del_libro:true`, `determinista:true`; toda op es una
    proyección **pura de lectura** (no muta). Nunca un 503 oculto: la `fuente_perfil` puede
    ser `'NO_DISPONIBLE'` sin bloquear la liquidación (el perfil no es exigible para
    calcular; los **tipos sí**).
13. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`.
    Shape: `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido',
    details:{ field:<campo> } } }`.
14. **HTTP exacto**: éxito `200`; payload inválido → `400`; sin tipos → `422`; sin libro →
    `503`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.iva.liquidar.response`,
`contabilidad.modelo.303.response` y `contabilidad.modelo.390.response`.

### 1. `liquidar` — impuesto indirecto del periodo

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "tipos": { "GENERAL": 21, "REDUCIDO": 10 },
  "diario": [
    { "periodo": "2026-09", "apuntes": [ { "cuenta": "430", "debe": 121, "haber": 0 }, { "cuenta": "700", "debe": 0, "haber": 100 }, { "cuenta": "477", "debe": 0, "haber": 21, "tipo_impuesto": "GENERAL", "base": 100 } ] },
    { "periodo": "2026-09", "apuntes": [ { "cuenta": "600", "debe": 50, "haber": 0 }, { "cuenta": "472", "debe": 5, "haber": 0, "tipo_impuesto": "REDUCIDO", "base": 50 }, { "cuenta": "400", "debe": 0, "haber": 55 } ] }
  ],
  "territorio": "COMUN",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "impuesto_indirecto": "IVA",
  "territorio": "COMUN",
  "liquidacion": { "devengado": 21, "deducible": 5, "soportado": 5, "resultado": 16, "a_ingresar": 16, "a_compensar": 0, "por_tipo": [ { "tipo": 21, "base": 100, "cuota": 21 }, { "tipo": 10, "base": 50, "cuota": 5 } ] },
  "tipos_declarados": { "GENERAL": 21, "REDUCIDO": 10 },
  "fuente_tipos": "PAYLOAD",
  "fuente_perfil": "PAYLOAD",
  "n_asientos": 2,
  "tipos_cableados": false,
  "derivado_del_libro": true,
  "determinista": true,
  "nota": "impuesto indirecto DERIVADO del libro con los tipos DECLARADOS: ningun tipo cableado; el impuesto concreto lo declara el perfil"
}
```

Emite `contabilidad.iva_liquidado` (res.data + `correlation_id`).

### 2. `303` — autoliquidación periódica (D2)

```json
{ "project_id": "e57a318a-...", "periodo": "2026-09", "tipos": { "GENERAL": 21, "REDUCIDO": 10 }, "ejercicio": "2026" }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "modelo": "303", "periodo": "2026-09", "ejercicio": "2026", "impuesto_indirecto": "IVA", "territorio": "COMUN", "casillas": { "devengado_repercutido": 21, "deducible_soportado": 5, "resultado": 16, "a_ingresar": 16, "a_compensar": 0, "por_tipo": [ { "tipo": 21, "base": 100, "cuota": 21 } ] }, "modelo_construido": true, "presentado": false, "presentar_es_del_asesor": true, "tipos_cableados": false, "nota": "autoliquidacion periodica construida desde la liquidacion: el sistema PREPARA, no presenta" }
```

Emite `contabilidad.modelo_construido` (res.data + `correlation_id`).

### 3. `390` — resumen anual (D3)

```json
{ "project_id": "e57a318a-...", "ejercicio": "2026", "tipos": { "GENERAL": 21 }, "liquidaciones": [ { "devengado": 21, "deducible": 5 }, { "devengado": 42, "deducible": 10 } ] }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "modelo": "390", "ejercicio": "2026", "impuesto_indirecto": null, "resumen": { "devengado": 63, "deducible": 15, "resultado": 48, "a_ingresar": 48, "a_compensar": 0 }, "n_liquidaciones": 2, "modelo_construido": true, "presentado": false, "determinista": true, "nota": "resumen anual del impuesto indirecto: determinista desde el libro/liquidaciones" }
```

### 4. Fallo — SIN TIPOS DECLARADOS → 422

```json
{ "project_id": "e57a318a-...", "periodo": "2026-09", "diario": [ { "apuntes": [] } ] }
```

Respuesta `422` + `contabilidad.iva.liquidar.failed`:

```json
{ "status": 422, "error": { "code": "TIPOS_NO_DECLARADOS", "message": "los tipos del impuesto son DATOS DECLARABLES (D10/D11): sin tipos declarados no se liquida; el sistema no asume 21/10/4", "details": { "dependencia": "cola-declaraciones-criterio (D11)", "accion": "DECLARAR_TIPOS", "tipos_cableados": false } } }
```

### 5. Fallo — sin libro → 503

```json
{ "project_id": "e57a318a-...", "periodo": "2026-09", "tipos": { "GENERAL": 21 } }
```

(no hay diario en payload y ni B2 ni B3 responden) → Respuesta `503` +
`contabilidad.iva.liquidar.failed`:

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "escritor-diario (B2) no respondio: no se liquida el impuesto sin libro", "details": { "dependencia": "escritor-diario", "accion": "NO_CALCULAR_PUBLICAR_FALLO" } } }
```

### 6. Fallo — payload inválido

```json
{ "periodo": "2026-09" }
```

Respuesta `400` + `contabilidad.iva.liquidar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

### 7. Tools (sin RPC en module.json)

`toolLiquidar` → `_liquidar`; `toolConstruir303` → `_construir303`; `toolResumen390` →
`_resumen390`.

## Tests

El test viviría en `tests/unit/liquidacion-iva.test.js`. Cubre:

- `liquidar` con tipos y libro en el payload → `200`, `devengado`/`deducible`/`resultado`
  correctos, `por_tipo` con las cuotas declaradas, `tipos_cableados:false`; emite
  `contabilidad.iva_liquidado`.
- **LA LEY NO SE CABLEA**: sin tipos (ni en payload ni por evento) → `422
  TIPOS_NO_DECLARADOS` (`accion:'DECLARAR_TIPOS'`), **nunca** una cuota inventada.
- **Dependencia tolerante**: sin libro en el payload y `escritor-diario` (B2) /
  `mayor-balanza` (B3) mudos → `503 DEPENDENCIA_NO_DISPONIBLE`
  (`NO_CALCULAR_PUBLICAR_FALLO`).
- `303` → `200`, `casillas` coherentes con la liquidación, `presentado:false`; emite
  `contabilidad.modelo_construido`.
- `390` con `liquidaciones` → resumen sumado; sin ellas → resume el ejercicio desde el
  libro.
- El impuesto indirecto es el que declara el perfil (`IVA`/`IGIC`/`IPSI`), no una constante.
- Sin `project_id` → `400 INVALID_INPUT` + par `*.failed`.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/liquidacion-iva
node --test tests/unit/liquidacion-iva.test.js
```

## Notas de implementación

- Clase `LiquidacionIVA extends ModuloHibridoReflejo`; `name = 'liquidacion-iva'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (reflejo stateless: nada que persistir).
- Constante: `CUENTAS_POR_DEFECTO = { devengado:['477','472'], soportado:['472','477'],
  repercutido:['477'], deducible:['472'] }` (declarables).
- `onLiquidarRequest`/`on303Request`/`on390Request` publican el evento de dominio si
  `status === 200` y el par `*.failed` si no. Todos delegan en `_atender(e, '<op>',
  'contabilidad.<...>.response', fn)`.
- Proyecciones puras: `_liquidar`, `_construir303`, `_resumen390` (async), `_devengado`,
  `_soportado`, `_porTipo`, `_normalizarTipos`, `_cuentasDe`, `_enPeriodo`, `_apuntesDe`;
  helpers de dependencia `_libroDe`, `_perfilDe`, `_parametrosDe`. `_rpc`, `_invalid`,
  `_errorResponse`, `_round` vienen de la base.
- Tools: `toolLiquidar`, `toolConstruir303`, `toolResumen390`.
- DEP hacia delante: `contabilidad.iva_liquidado` lo consumen `estado-presentacion-fiscal`
  (D12) y `motor-avisos` (K2); `contabilidad.modelo_construido` lo consume
  `generador-modelo` (D7). DEP hacia atrás por evento: `escritor-diario` (B2),
  `mayor-balanza` (B3), `perfil-administrativo` (D15) y `cola-declaraciones-criterio` (D10/D11).
