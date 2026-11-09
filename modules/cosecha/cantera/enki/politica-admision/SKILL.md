---
name: politica-admision
description: >-
  Usar cuando haya que declarar, redefinir o consultar la POLÍTICA de admisión
  de un proyecto (qué actos pide cada acto de entrada y en qué estados del hilo
  se admite), o cuando la puerta rechace todo con MOTIVO_POLITICA_NO_DECLARADA
  y haya que averiguar por qué. Skill FULL del módulo CUSTODIO
  `politica-admision` (P04) del proyecto sistema-de-conversaciones: contrato
  exacto del module.json, 404 honesto en vez de política por defecto, version
  incremental, payload literal para declarar y test de 11 pasos.
version: 0.1.0
autor: enki
tags: [enki, modulo, custodio, conversaciones, politica-admision, politica, admision, puerta, proyecto-sistema-de-conversaciones]
---

# politica-admision — CUSTODIO del DATO que la puerta consume

## Qué hace el módulo

Es el **único escritor** (PA1) de la **política de admisión** de un proyecto: el
dato que dice **qué actos pide cada acto de entrada** y **en qué estados del
hilo se admite**. La puerta (`puerta-admision`) es un **reflejo puro**: no
consulta almacenes, recibe la política **por valor** en el contexto. Sin ese
dato la puerta no puede decidir y rechaza **todo** con
`MOTIVO_POLITICA_NO_DECLARADA` (O12) — correcto, pero inútil: por eso existe
este módulo.

Por qué un módulo y no un fichero de config: la política **cambia** (se
redefine), tiene **emisor** (quién la declara) y **version** (cuántas veces se
redefinió), y su **ausencia es una señal** (404), no un valor por defecto. Un
dato con dueño y ciclo de vida es un custodio.

Almacén: **snapshot JSON por proyecto** en `/conversaciones/politica.json` vía
`PosPersistencia` (la misma carpeta que el ledger de llaves), restaurado en
`project.activated`. **NO es append-only**: una política es **vigente o no lo
es**, así que redefinir **sobreescribe** y **sube `version`** (la traza la deja
el hecho `politica.definida`, no un histórico de ficheros).

Invariantes: **PA1** único escritor · **PA2** sin `emisor` no hay declaración ·
**PA3** sin declaración no hay política por defecto (404 honesto) · **PA4**
`actosPorEntrada` obligatorio, no vacío, sólo `LEER`/`ESCRIBIR` · **O12** la
ausencia se declara, no se rellena · **I7** LEER ≠ ESCRIBIR.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `politica.definir.request` | `onPoliticaDefinirRequest` | Declara o **redefine** la política del proyecto. Payload: `{ request_id, project_id, actosPorEntrada, estadosQueAdmiten?, emisor, ahora? }`. `actosPorEntrada` OBLIGATORIO y no vacío, p. ej. `{ "ESCRIBIR": ["LEER","ESCRIBIR"], "LEER": ["LEER"] }`; sólo `LEER`/`ESCRIBIR` (LEER ≠ ESCRIBIR). `emisor` OBLIGATORIO. Redefinir SOBREESCRIBE (no es append-only) y sube `version`. |
| `politica.consultar.request` | `onPoliticaConsultarRequest` | Consulta la política vigente. Payload: `{ request_id, project_id }`. Devuelve **200** `{ politica }` o **404** `RESOURCE_NOT_FOUND` «El proyecto no ha declarado política de admisión» (nunca un default). |
| `project.activated` | `onProjectActivated` | Restaura la política persistida del proyecto desde `/conversaciones/politica.json`. |

### Publishes

| Evento | Descripción |
|---|---|
| `politica.definir.response` | Política declarada, correlada por `request_id`: **201** (primera declaración) o **200** (redefinición) con `data { politica, redefinida }`. En error: **400** `INVALID_INPUT` con `error.details { motivo, field }`. |
| `politica.definir.failed` | Error de dominio al declarar: `{ request_id, motivo: PAYLOAD_INVALIDO \| ACTOS_POR_ENTRADA_AUSENTE \| ACTO_INVALIDO \| ACTOS_VACIOS \| SIN_EMISOR \| ESTADOS_QUE_ADMITEN_INVALIDO, field }`. Nunca sustituye a un timeout. |
| `politica.consultar.response` | Política vigente correlada: **200** `{ politica }` o **404** `RESOURCE_NOT_FOUND` con `error.code`, `error.message`, `error.details`. |
| `politica.consultar.failed` | Fallo de la consulta: `{ request_id, motivo: PAYLOAD_INVALIDO, field }`. **Sólo payload inválido** (sin `project_id`). |
| `politica.definida` | Hecho publicado tras escribir el store: `{ project_id, version, redefinida, actosPorEntrada, estadosQueAdmiten, emisor, definidaEn }`. |

> Cruce con `index.js`: **todo lo emitido está declarado**. Las dos `.response`
> las publica `_atender`; `politica.definida` y los dos `.failed`, con
> `_publicarEvento`. No hay eventos sub-declarados.

> Nota de diseño (no es un evento, es una decisión): la **ausencia** de política
> se responde con un **404 en `politica.consultar.response`** y **no** con
> `politica.consultar.failed`. `.failed` queda para payloads inválidos — el mismo
> criterio que `gestor-llaves` (404 sin hecho vs 400 con `.failed`). Consecuencia:
> el coordinador propaga la causa literal `RESOURCE_NOT_FOUND` en vez de un
> genérico `FAILED`.

## Reglas de negocio

### La forma del dato

```jsonc
{
  "project_id": "sistema-de-conversaciones",
  "actosPorEntrada": { "ESCRIBIR": ["LEER", "ESCRIBIR"], "LEER": ["LEER"] },
  "estadosQueAdmiten": ["ABIERTA", "ACTIVA"],
  "actosPorEstado": { "ABIERTA": ["LEER", "ESCRIBIR"], "ACTIVA": ["LEER", "ESCRIBIR"] },
  "emisor": "dueno",
  "definidaEn": "2026-11-09T04:00:00.000Z",
  "version": 1
}
```

- **`actosPorEntrada`** (obligatorio): mapa `acto_de_entrada → actos que ESA
  entrada pide`. Escribir exige llave de `LEER` **y** de `ESCRIBIR`; leer exige
  sólo `LEER` (**I7**: LEER ≠ ESCRIBIR).
- **`estadosQueAdmiten`** (opcional): estados del hilo que admiten entrada. Si
  **no se declara**, el default es **`['ABIERTA','ACTIVA']`** — DOCUMENTADO aquí
  y en `module.json`/`context.json`, y la respuesta lo devuelve **explícito**
  (nunca queda implícito en la cabeza de nadie). Un estado no listado
  (`ARCHIVADA`, `CERRADA`) **no admite nada**: la puerta responde
  `MOTIVO_ESTADO_NO_ADMITE`.
- **`actosPorEstado`** (DERIVADO, no declarable): para cada estado de
  `estadosQueAdmiten`, la unión de actos pedibles por la política. Es la forma
  que `puerta-admision._permite` ya sabe leer; se calcula aquí para no tocar la
  puerta ni obligar a quien declara a escribir el mismo dato dos veces.
- **`version`**: entero que empieza en 1 y sube en cada redefinición del
  proyecto. Permite saber que la política cambió sin guardar historia.
- **`emisor`**: quién la declara. Sin emisor no hay declaración (PA2).

### Guardas de `_definir` (en este orden exacto)

1. `project_id` ausente → **400** `INVALID_INPUT`, `politica.definir.failed`
   `{ motivo: 'PAYLOAD_INVALIDO', field: 'project_id' }`.
2. `actosPorEntrada` ausente, no-objeto, array u **objeto vacío** → **400**
   `ACTOS_POR_ENTRADA_AUSENTE`. Sin entradas no hay política.
3. Acto de entrada fuera de `LEER|ESCRIBIR` (p. ej. `MENSAJE`) → **400**
   `ACTO_INVALIDO`, `field: 'actosPorEntrada.MENSAJE'` y el mensaje **nombra el
   acto ofensor**. Un nombre nuevo no es un acto nuevo: es un error de quien
   declara.
4. Valor no-array o array vacío → **400** `ACTOS_VACIOS`.
5. Acto dentro del array fuera de `LEER|ESCRIBIR` (p. ej. `BORRAR`) → **400**
   `ACTO_INVALIDO`.
6. El mismo acto de entrada declarado dos veces (distinta capitalización) →
   **400** `PAYLOAD_INVALIDO`: la declaración es ambigua y **no se elige por el
   declarante**.
7. `emisor` ausente o en blanco → **400** `SIN_EMISOR`.
8. `estadosQueAdmiten` presente pero no-array o vacío → **400**
   `ESTADOS_QUE_ADMITEN_INVALIDO`. Omitirlo **no** es un error: aplica el default.

**Ninguna guarda escribe**: un `.definir` rechazado deja el store **como
estaba** (el proyecto sigue sin política, o con la anterior).

### Consulta: el 404 es la respuesta honesta

`politica.consultar.request` de un proyecto **sin política declarada** devuelve
**404** `RESOURCE_NOT_FOUND`, mensaje literal **«El proyecto no ha declarado
política de admisión»**, `details { entity_type: 'politica_admision',
entity_id: <project_id>, motivo: 'POLITICA_NO_DECLARADA' }`. **Nunca** se
devuelve una política por defecto ni un «todo permitido» implícito: ese 404 es
la señal que el coordinador convierte en `politica_no_declarada` y que **corta
la cadena** antes de la puerta.

## Cómo se usa (RPCs)

### 1 · Declarar la política de un proyecto (el payload EXACTO)

```jsonc
// politica.definir.request
{
  "request_id": "req-pol-1",
  "project_id": "sistema-de-conversaciones",
  "actosPorEntrada": { "ESCRIBIR": ["LEER", "ESCRIBIR"], "LEER": ["LEER"] },
  "estadosQueAdmiten": ["ABIERTA", "ACTIVA"],
  "emisor": "dueno",
  "ahora": "2026-11-09T04:00:00.000Z"
}
```

```jsonc
// politica.definir.response  (201 primera vez; 200 al redefinir)
{
  "request_id": "req-pol-1",
  "status": 201,
  "data": {
    "politica": {
      "project_id": "sistema-de-conversaciones",
      "actosPorEntrada": { "ESCRIBIR": ["LEER", "ESCRIBIR"], "LEER": ["LEER"] },
      "estadosQueAdmiten": ["ABIERTA", "ACTIVA"],
      "actosPorEstado": { "ABIERTA": ["LEER", "ESCRIBIR"], "ACTIVA": ["LEER", "ESCRIBIR"] },
      "emisor": "dueno",
      "definidaEn": "2026-11-09T04:00:00.000Z",
      "version": 1
    },
    "redefinida": false
  }
}
```

Mínimo imprescindible (el resto son defaults declarados):

```jsonc
{ "request_id": "r1", "project_id": "bocaos",
  "actosPorEntrada": { "ESCRIBIR": ["LEER", "ESCRIBIR"] }, "emisor": "dueno" }
```

### 2 · Consultar la política vigente

```jsonc
// politica.consultar.request
{ "request_id": "req-pol-2", "project_id": "sistema-de-conversaciones" }

// politica.consultar.response — declarada
{ "request_id": "req-pol-2", "status": 200, "data": { "politica": { /* … */ } } }

// politica.consultar.response — NO declarada
{
  "request_id": "req-pol-2",
  "status": 404,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "El proyecto no ha declarado política de admisión",
    "details": { "kind": "domain", "entity_type": "politica_admision",
                 "entity_id": "sistema-de-conversaciones", "motivo": "POLITICA_NO_DECLARADA" }
  }
}
```

### 3 · Cómo la usa el camino de entrada (contexto, no RPC)

`coordinador-conversacion` resuelve la política **antes** de llamar a la puerta
(paso 2b): usa la que trae la entrada si existe; si no, la **cachea 60 s por
proyecto**; si no está en caché, pide `politica.consultar.request`. Con **404**,
**failed o timeout** la cadena **corta** con:

```jsonc
{ "status": 422, "error": { "code": "PRECONDITION_FAILED",
  "message": "entrada rechazada: politica_no_declarada",
  "details": { "kind": "domain", "motivo": "politica_no_declarada", "paso": "politica",
               "detalle": { "causa": "RESOURCE_NOT_FOUND", "project_id": "…" } } } }
```

y publica `conversacion.entrada_rechazada { motivo: 'politica_no_declarada',
paso: 'politica' }`. **No se llama a la puerta y el mensaje no llega al relay.**

## Tests

`tests/unit/politica-admision.test.js` — 11 casos:

1. definir → consultar devuelve **la misma** política, con `actosPorEstado`
   derivado y `politica.definida` publicado.
2. acto de entrada inválido (`MENSAJE`) → `politica.definir.failed`
   `ACTO_INVALIDO` + **nada se guardó** (consultar sigue 404).
3. acto inválido en el valor (`BORRAR`) → `ACTO_INVALIDO` nombrando el ofensor.
4. sin `emisor` → `SIN_EMISOR`.
5. `actosPorEntrada` ausente / `{}` / array → `ACTOS_POR_ENTRADA_AUSENTE`.
6. proyecto sin política → **404** `RESOURCE_NOT_FOUND` y **cero** `data`.
7. consultar sin `project_id` → **400** `INVALID_INPUT` (`PAYLOAD_INVALIDO`).
8. redefinir SOBREESCRIBE y sube `version` (una sola política vigente).
9. `estadosQueAdmiten` omitido ⇒ `['ABIERTA','ACTIVA']`; declarado ⇒ el del
   emisor (y `actosPorEstado` con sólo ese estado).
10. `estadosQueAdmiten` inválido (no-array / `[]`) → `ESTADOS_QUE_ADMITEN_INVALIDO`.
11. persistencia: snapshot en `/conversaciones/politica.json` + restauración en
    `project.activated` por otra instancia (simula reinicio).

```bash
node tests/unit/politica-admision.test.js       # 11/11
node tests/unit/admision-punta-a-punta.test.js  # 3/3 (costura con los 6 módulos reales)
node tests/unit/coordinador-conversacion.test.js # 9/9 (6 previos + política: corta / abre / caché)
```

## Notas de implementación

- Clase `PoliticaAdmision extends ModuloHibridoReflejo`, `name:
  'politica-admision'`, `version: 'reflejo-0.1.0'`.
- Store: `Map project_id → política` (`this.politicas`, una sola por proyecto).
  `PosPersistencia({ file: 'politica.json', dir: '/conversaciones', snapshot,
  hidratar })`; `onUnload` hace `flush()` + `detener()`.
- Handlers de una línea sobre `_atender(e, '<op>', '<modulo>.<op>.response',
  fn)`; los hechos y `.failed` con `_publicarEvento`.
- `_definir` valida **antes** de tocar el store (fail-closed); en éxito
  `marcarDirty(project_id)` y sólo entonces publica `politica.definida`.
- `_copia()` devuelve una copia profunda: lo que sale por el bus **no comparte
  referencias** con el store (mutar la respuesta no muta la política vigente).
- `_hidratar` es merge por proyecto y **no pisa** una política ya en memoria
  (la vigente en el proceso gana sobre el snapshot viejo).
- Defaults en constantes (`ESTADOS_POR_DEFECTO`) y motivos en `MOTIVOS`: los
  literales que documenta esta skill son los del código, no paráfrasis.
