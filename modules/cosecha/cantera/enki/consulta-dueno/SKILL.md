---
name: consulta-dueno
description: >
  Skill FULL del módulo PUENTE `consulta-dueno` de la vertical contabilidad de Enki (Q1+Q3+Q4,
  hoja del plan). LA PUERTA PULL: el dueño pregunta cuando quiere y el sistema contesta, SIN
  cadencia impuesta (≠ el cuadro del jefe J8, que SÍ impone cadencia y agregación). Tres
  clases en una parcela: Q1 `_responder(pregunta)` — resuelve la consulta por EVENTO del
  calculador de la operación; Q3 `_sellarCobertura` — sello de completitud FUERA de ciclo,
  para saber si falta cobertura ANTES de decidir; Q4 `_derivarEstado` — marca
  EN_CURSO/REVISADO/FIRMADO del punto en que está lo que el dueño ve. LA MÉTRICA ÚNICA SIGUE
  SIENDO UNA: el sello LEE `completitud-cobertura` (A12) y no la recalcula; la marca deriva
  de la traza (B4) y la firma (L3). EL PUENTE NO JUZGA: la traducción de la pregunta es del
  micro-agente `puente-lenguaje-dueno` (Q2); sin consulta estructurada → 422
  PREGUNTA_NO_TRADUCIDA, y jamás se interpreta a ciegas. Stateless. Úsala para operar,
  depurar o extender el puente.
when-to-use: >
  - Cuando el dueño consulte bajo demanda (RPC contabilidad.consulta.responder.request) y
    haya que resolver la operación (margen/tablero, resultado/balance, caja/previsión,
    cobertura, cuadro, desviación).
  - Cuando depures por qué no contesta (422 PREGUNTA_NO_TRADUCIDA si el texto no llega
    traducido, 422 OPERACION_NO_CONSULTABLE si la operación está fuera del catálogo, 503
    DEPENDENCIA_NO_DISPONIBLE si el calculador no responde, 400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la diferencia
    pull/push frente al cuadro del jefe, y el sello de cobertura y la marca borrador.
  - Cuando vayas a escribir/ampliar el test unitario del puente consulta-dueno.
tags: [enki, modulo, puente, contabilidad, consulta-dueno, pull, sin-cadencia]
---

# consulta-dueno — PUENTE · la puerta PULL del dueño sobre la contabilidad

## Qué hace el módulo

`consulta-dueno` es un **PUENTE STATELESS** (Q1 + Q3 + Q4, hoja del plan): **LA PUERTA
*PULL*** — el dueño pregunta cuando quiere y el sistema contesta. **Sin cadencia impuesta**
(≠ el cuadro del jefe J8, que SÍ impone cadencia y agregación). Desde donde consulta es
**DECLARABLE** (canal = puerto).

Tres clases en una parcela:

- **Q1 ConsultaCuentasBajoDemanda** — `_responder(pregunta)` → ResultadoCalculo;
  `_sinCadencia()` → Bool (el dueño pregunta cuando quiere).
- **Q3 SelloCobertura** — `_sellarCobertura(resultado)` → con sello: marca de **completitud**
  de lo consultado, **FUERA de ciclo**, para que el dueño sepa **si falta cobertura ANTES de
  decidir**.
- **Q4 MarcaBorradorValidado** — `_derivarEstado(periodo)` → **`EN_CURSO | REVISADO |
  FIRMADO`**: sello del punto en que está lo que el dueño ve, para **no decidir sobre un
  borrador vivo como si fuera definitivo**.

**LA MÉTRICA ÚNICA SIGUE SIENDO UNA**: el sello (Q3) **LEE** `completitud-cobertura` (**A12**)
por EVENTO `contabilidad.cobertura.calcular.request` — **NO recalcula** «lo que falta»
(`es_metrica_unica:true`, `recalculada_aqui:false`). La marca (Q4) deriva de la traza (**B4**,
`contabilidad.traza.consultar.request`) y de la firma (**L3**,
`contabilidad.firma.delta.request`) por EVENTO.

**EL PUENTE NO JUZGA**: la traducción de la pregunta en lenguaje natural es del micro-agente
`puente-lenguaje-dueno` (**Q2**). Aquí `responder` acepta la consulta **ya estructurada**
(`consulta:{operacion,...}`) o un `resultado_calculo` **ya calculado**; si solo llega texto
sin traducir, se declara **`422 PREGUNTA_NO_TRADUCIDA`** y **NUNCA se interpreta a ciegas**.

Es **stateless**: sin PosPersistencia ni `project.activated` — no guarda estado; reacciona a
una pregunta y contesta. La composición rica se delega en `informe-rico` (**K3**) por EVENTO.
Dependencia entre módulos **por EVENTO, nunca por `require` cruzado**. Las salidas son
**revisables** (`vista-revisable`, L2).

> **NO REUTILIZA**: la cara *pull* del dueño sobre la contabilidad no existe en el inventario.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.consulta.responder.request` | `onResponderRequest` | RPC puente (Q1/Q3/Q4): {project_id, consulta:{operacion, periodo?, dimension?, parametros?}\|resultado_calculo?\|cifra?, periodo?, alcance?, estado?, cobertura?, con_informe?} → {project_id, operacion, calculador, resultado_calculo, sello_cobertura:{sellado, sello:'COMPLETO'\|'INCOMPLETO', aviso, cobertura, fuera_de_ciclo:true, es_metrica_unica:true, recalculada_aqui:false}, marca:{estado:'EN_CURSO'\|'REVISADO'\|'FIRMADO', periodo, fuente, borrador_vivo, el_sistema_no_firma:true}, informe, sin_cadencia:true, canal_declarable:true, revisable:true, dependencias_no_disponibles}. El dueno pregunta cuando quiere (SIN cadencia). Si el resultado no viene ya calculado, se deriva por EVENTO del calculador de la operacion (margen/tablero, resultado/balance, caja/prevision, cobertura, cuadro, desviacion). Consulta NO estructurada (texto) → 422 PREGUNTA_NO_TRADUCIDA (la traduccion es de Q2); operacion desconocida → 422 OPERACION_NO_CONSULTABLE; calculador sin responder → 503 DEPENDENCIA_NO_DISPONIBLE. El sello (Q3) LEE la metrica unica (A12); la marca (Q4) deriva de traza (B4) y firma (L3). Exito publica contabilidad.consulta_respondida y responde por contabilidad.consulta.responder.response; error → contabilidad.consulta.responder.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.consulta_respondida` | Fire-and-forget (Q1/Q3/Q4): el sistema contesto la consulta del dueno → {project_id, operacion, calculador, resultado_calculo, sello_cobertura, marca, informe, sin_cadencia:true, revisable:true, dependencias_no_disponibles}. La respuesta lleva SELLO DE COBERTURA (leido de la metrica unica A12) y MARCA borrador/revisado/firmado (derivada de B4+L3). Determinista; jamas una cifra inventada. |
| `contabilidad.consulta.responder.failed` | Par de fallo determinista: responder sin project_id (400), con consulta NO estructurada (422 PREGUNTA_NO_TRADUCIDA: la traduccion de lenguaje natural es de Q2), con operacion fuera del catalogo consultable (422 OPERACION_NO_CONSULTABLE) o con el calculador de la operacion sin responder (503 DEPENDENCIA_NO_DISPONIBLE: el sistema no inventa la cifra). Cierra el circulo de contabilidad.consulta.responder.request. |
| `contabilidad.consulta_respondida.failed` | Par de fallo del evento de dominio contabilidad.consulta_respondida: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.consulta.responder.failed` cierra `contabilidad.consulta.responder.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.consulta.responder.response` (el par response del RPC); **NO está declarada
> en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el par
> de fallo real es `<op>.failed`) — `contabilidad.consulta_respondida.failed` es el par de
> fallo del evento de DOMINIO; el puente solo publica el par `*.failed` de su RPC.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.margen.calcular.request` / `contabilidad.tablero.cruzar.request`
> (margen-analitico), `contabilidad.estado.resultado.request` /
> `contabilidad.estado.balance.request` (estados-contables),
> `contabilidad.tesoreria.saldo.request` / `contabilidad.tesoreria.prevision.request`
> (saldo-tesoreria), `contabilidad.cobertura.calcular.request` (completitud-cobertura),
> `contabilidad.cuadro_mando.agregar.request` (cuadro-mando-contable),
> `contabilidad.desviacion.calcular.request` (presupuesto), `contabilidad.firma.delta.request`
> (flujo-firma), `contabilidad.traza.consultar.request` (traza-asiento) y
> `contabilidad.informe.componer.request` (informe-rico, si `con_informe:true`): dependencias
> por EVENTO no declaradas como publishers.

## Reglas de negocio

1. **LA PUERTA ES *PULL* (sin cadencia)**: la respuesta declara `sin_cadencia:true` y
   `_sinCadencia()` devuelve `{ sin_cadencia:true, impone_cadencia:false, distinto_de:
   'cuadro-mando-contable (J8), que SI impone cadencia y agregacion',
   canal_consulta_declarable:true }`. **El dueño pregunta cuando quiere.**
2. **EL PUENTE NO JUZGA (no interpreta lenguaje natural)**: si no hay `resultado_calculo` y la
   `consulta` no trae `operacion`, se devuelve **`422 PREGUNTA_NO_TRADUCIDA`** con `{ recibe:
   ['consulta:{operacion,...}', 'resultado_calculo'], traductor:'puente-lenguaje-dueno (Q2)',
   operaciones_posibles }`. **Nunca se interpreta a ciegas.**
3. **El CATÁLOGO de operaciones consultables** (`OPERACIONES`) mapea operación → `{evento,
   calculador}`: `margen`/`tablero` → `margen-analitico`; `resultado`/`balance` →
   `estados-contables`; `caja`/`prevision` → `saldo-tesoreria`; `cobertura` →
   `completitud-cobertura`; `cuadro` → `cuadro-mando-contable`; `desviacion` → `presupuesto`.
   La operación se normaliza a minúsculas; fuera del catálogo → **`422
   OPERACION_NO_CONSULTABLE`** con `operaciones_posibles`.
4. **El resultado se PIDE por EVENTO (jamás se calcula aquí)**: `_rpc` al `evento` del
   calculador con `{project_id, periodo, dimension, ...consulta.parametros}` (timeout
   5000ms). Si no responde → **`503 DEPENDENCIA_NO_DISPONIBLE`** con `{ dependencia:
   <calculador>, operacion, accion:'NO_RESPONDER_INVENTANDO' }`: *«el dueno pregunta pero el
   sistema no inventa la cifra»*.
5. **Resultado ya calculado o declarado**: si el payload trae `resultado_calculo`/`cifra`/
   `resultado`, **no se llama a ningún calculador** (el puente solo lo presenta).
6. **Q3 — EL SELLO DE COBERTURA (la métrica única)**: `_sellarCobertura` — cobertura del
   payload o `_rpc` a `contabilidad.cobertura.calcular.request` (A12, timeout 4000ms); si no
   está → `{sellado:false, sello:'COBERTURA_NO_DISPONIBLE', cobertura:null, fuera_de_ciclo:
   true, es_metrica_unica:true}`. Con cobertura: `completa = (huecos === 0) || senal ===
   'COMPLETA'` → `sello:'COMPLETO'` o **`'INCOMPLETO'`** con `aviso:'falta cobertura: el
   resultado puede estar incompleto'`. Lleva `fuera_de_ciclo:true`, `es_metrica_unica:true` y
   **`recalculada_aqui:false`**. *Dice si falta cobertura ANTES de que el dueño decida.*
7. **Q4 — LA MARCA (borrador/revisado/firmado)**: `_derivarEstado` — si el payload declara
   `estado` en `{EN_CURSO, REVISADO, FIRMADO}` → `fuente:'PAYLOAD'`. Si no: **L3** (`_rpc` a
   `contabilidad.firma.delta.request`, timeout 4000ms) → si `ultima_firma` existe →
   **`FIRMADO`** (`fuente:'L3_flujo-firma'`); si `delta.total_cambios === 0` y
   `desde_ultima_firma` → **`REVISADO`** (hubo visto bueno y nada cambió); si no, se consulta
   **B4** (`contabilidad.traza.consultar.request`) y se devuelve **`EN_CURSO`**
   (`fuente:'DERIVADO'`). La marca lleva `borrador_vivo:(estado === 'EN_CURSO')`,
   `decidir_sobre_borrador:false`, `el_sistema_no_firma:true` y la nota *«marca del punto en
   que esta lo que el dueno ve: no decidir sobre un borrador vivo como si fuera definitivo»*.
8. **Composición rica OPT-IN**: solo si `con_informe === true` se hace `_rpc` a
   `contabilidad.informe.componer.request` (K3, timeout 5000ms) con la cobertura ya sellada y
   `con_estado:false`; si falla → push `'informe-rico'` a `dependencias_no_disponibles` y
   `informe:null`.
9. **Contrato TOLERANTE (cobertura/marca/informe)**: que A12, L3, B4 o K3 no respondan **no
   es fallo**: el hueco se declara en `dependencias_no_disponibles` y ese campo sale con su
   valor de «no disponible». **Solo faltar `project_id`, la consulta no estructurada, la
   operación desconocida y el calculador mudo son fallo.**
10. **La salida es REVISABLE**: toda respuesta declara `revisable:true` y
    `vista_revisable_en:'vista-revisable (L2)'`.
11. **DETERMINISMO**: mismo input → mismo output; la respuesta lleva `determinista:true`.
12. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`.
    Shape: `{ status:400, error:{ code:'INVALID_INPUT', message:'project_id requerido',
    details:{ field:'project_id' } } }`.
13. **HTTP exacto**: éxito `200`; payload inválido → `400`; consulta no traducida u operación
    no consultable → `422`; calculador no disponible → `503`; excepción en `_atender` → `500
    UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC que responde en `contabilidad.consulta.responder.response`.

### 1. `responder` — consulta estructurada (pull) con calculador por EVENTO

```json
{
  "project_id": "e57a318a-...",
  "consulta": { "operacion": "margen", "periodo": "2026-09", "dimension": "CENTRO-NORTE" },
  "correlation_id": "abc-123"
}
```

Respuesta `200` (recortada):

```json
{
  "project_id": "e57a318a-...",
  "operacion": "margen",
  "calculador": "margen-analitico",
  "resultado_calculo": { "project_id": "e57a318a-...", "dimension": "CENTRO-NORTE", "margen": { "ingreso": 2000, "coste_imputado": 1320, "margen": 680, "margen_pct": 0.34 } },
  "sello_cobertura": { "sellado": true, "sello": "COMPLETO", "aviso": null, "cobertura": { "tasa": 1, "huecos": 0, "senal": "COMPLETA" }, "fuera_de_ciclo": true, "es_metrica_unica": true, "recalculada_aqui": false },
  "marca": { "estado": "EN_CURSO", "periodo": "2026-09", "fuente": "DERIVADO", "borrador_vivo": true, "decidir_sobre_borrador": false, "el_sistema_no_firma": true, "determinista": true },
  "informe": null,
  "sin_cadencia": true,
  "canal_declarable": true,
  "revisable": true,
  "vista_revisable_en": "vista-revisable (L2)",
  "dependencias_no_disponibles": [],
  "determinista": true,
  "nota": "puerta PULL: el dueno pregunta cuando quiere; la respuesta lleva sello de cobertura y marca borrador/revisado/firmado"
}
```

Emite `contabilidad.consulta_respondida` (res.data + `correlation_id`).

### 2. `responder` — resultado ya calculado (no toca calculadores) + informe rico

```json
{
  "project_id": "e57a318a-...",
  "resultado_calculo": { "total": 12450.5, "n_cuentas": 3 },
  "periodo": "2026-09",
  "con_informe": true
}
```

→ `200` con `calculador:null` y, si K3 responde, `informe` compuesto (con `con_estado:false`).

### 3. `responder` — marca `FIRMADO` derivada de L3, cobertura `INCOMPLETO`

Con `alcance` declarado y L3 devolviendo `ultima_firma` → `marca.estado:'FIRMADO'`
(`fuente:'L3_flujo-firma'`); con cobertura `huecos > 0` → `sello:'INCOMPLETO'` y
`aviso:'falta cobertura: el resultado puede estar incompleto'`.

### 4. Fallo — texto sin traducir → 422 (nunca a ciegas)

```json
{ "project_id": "e57a318a-...", "pregunta": "¿me da la vida este mes?" }
```

(sin `consulta.operacion` ni `resultado_calculo`) → Respuesta `422` +
`contabilidad.consulta.responder.failed`:

```json
{ "status": 422, "error": { "code": "PREGUNTA_NO_TRADUCIDA", "message": "la consulta no llega estructurada: la traduccion de la pregunta es de puente-lenguaje-dueno (Q2)", "details": { "recibe": ["consulta:{operacion,...}", "resultado_calculo"], "traductor": "puente-lenguaje-dueno (Q2)", "operaciones_posibles": ["margen", "tablero", "resultado", "balance", "caja", "prevision", "cobertura", "cuadro", "desviacion"] } } }
```

### 5. Fallo — operación fuera del catálogo → 422

```json
{ "project_id": "e57a318a-...", "consulta": { "operacion": "impuestos" } }
```

→ `422 OPERACION_NO_CONSULTABLE` con `operaciones_posibles`.

### 6. Fallo — el calculador no responde → 503 (no se inventa la cifra)

```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "estados-contables no respondio: el dueno pregunta pero el sistema no inventa la cifra", "details": { "dependencia": "estados-contables", "operacion": "resultado", "accion": "NO_RESPONDER_INVENTANDO" } } }
```

### 7. Fallo — payload inválido

Sin `project_id` → `400 INVALID_INPUT project_id` + `contabilidad.consulta.responder.failed`.

### 8. Tools (sin RPC en module.json)

`toolResponder` → `_responder`; `toolSinCadencia` → `_sinCadencia`.

## Tests

El test vive en `tests/unit/consulta-dueno.test.js`. Cubre:

- `responder` con `consulta:{operacion:'margen'}` → `200`, `calculador:'margen-analitico'`,
  `resultado_calculo` presente, `sin_cadencia:true`; emite `contabilidad.consulta_respondida`.
- `resultado_calculo` ya calculado → **cero** llamadas a calculadores.
- **Q3 — sello de cobertura LEÍDO de A12**: `sello:'COMPLETO'` con `huecos:0`;
  `sello:'INCOMPLETO'` con `huecos > 0` y su `aviso`; `COBERTURA_NO_DISPONIBLE` si A12 no
  responde; siempre `es_metrica_unica:true`, `recalculada_aqui:false`, `fuera_de_ciclo:true`.
- **Q4 — marca**: `estado` declarado en payload → `fuente:'PAYLOAD'`; L3 con `ultima_firma`
  → `FIRMADO`; L3 con `total_cambios:0` → `REVISADO`; nada → `EN_CURSO` (`borrador_vivo:true`,
  `decidir_sobre_borrador:false`).
- **Consulta NO estructurada** → `422 PREGUNTA_NO_TRADUCIDA` (la traducción es de Q2);
  operación fuera del catálogo → `422 OPERACION_NO_CONSULTABLE`.
- **Dependencia tolerante**: el calculador mudo → `503 DEPENDENCIA_NO_DISPONIBLE`
  (`NO_RESPONDER_INVENTANDO`); A12/L3/B4/K3 mudos → huecos declarados, respuesta **200**.
- `con_informe:true` y K3 mudo → `informe:null` y `'informe-rico'` en
  `dependencias_no_disponibles`.
- Sin `project_id` → `400 INVALID_INPUT` + `contabilidad.consulta.responder.failed`.
- El puente es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/consulta-dueno
node --test tests/unit/consulta-dueno.test.js
```

## Notas de implementación

- Clase `ConsultaDueno extends ModuloHibridoReflejo`; `name = 'consulta-dueno'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (puente stateless: nada que persistir).
- Constantes: `OPERACIONES` (mapa de 9 operaciones → `{evento, calculador}`), `ESTADOS` (Set
  `EN_CURSO`, `REVISADO`, `FIRMADO`).
- El único handler `onResponderRequest` delega en `_atender(e, 'responder',
  'contabilidad.consulta.responder.response', fn)`; publica el evento de dominio si `status
  === 200` y el par `*.failed` si no.
- Proyecciones: `_responder` (async), `_sinCadencia`, `_sellarCobertura` (async, EVENTO A12),
  `_derivarEstado` (async, EVENTO L3 + B4), `_marca`. `_rpc`/`_invalid`/`_errorResponse`/
  `_round` vienen de la base.
- Tools: `toolResponder`, `toolSinCadencia`.
- DEP hacia delante: `contabilidad.consulta_respondida` lo consume la cara de consulta/entrega
  del dueño; las salidas son revisables en `vista-revisable` (L2). DEP hacia atrás por EVENTO:
  los nueve calculadores del catálogo (margen-analitico, estados-contables, saldo-tesoreria,
  completitud-cobertura, cuadro-mando-contable, presupuesto), más `flujo-firma` (L3),
  `traza-asiento` (B4) e `informe-rico` (K3).
