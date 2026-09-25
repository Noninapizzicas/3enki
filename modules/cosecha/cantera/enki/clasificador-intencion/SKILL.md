---
name: clasificador-intencion
description: >
  Skill FULL del módulo MICRO-AGENTE FUZZY `clasificador-intencion` de la vertical nichos
  (Radar de Nichos). Clasifica el mensaje que llega del canal del dueño (vía captura-semilla A1)
  en SEMILLA | DECISION | CONSULTA según el lenguaje y la ambigüedad. Es HÍBRIDO: una pasada
  fuzzy (LLM con guion-prompt self-contained) para el juicio de lengua natural + un fallback
  reflejo determinista por reglas si el LLM falla o no cumple el contrato. Sin store, sin
  persistencia: entra objeto, sale objeto. Publica nichos.intencion.clasificada y su par de fallo.
  Úsala para operar, depurar o extender el micro-agente, o para entender su contrato de eventos
  y sus reglas de negocio.
when-to-use: >
  - Cuando necesites clasificar la intención de un mensaje del dueño del canal
    (RPC nichos.intencion.clasificar.request).
  - Cuando depures por qué un mensaje se rechaza (MENSAJE_VACIO si está vacío, SIN_CLASIFICAR
    si no pudo clasificarse).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y el patrón híbrido
    fuzzy + fallback reflejo determinista.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente.
tags: [enki, modulo, micro-agente, fuzzy, reflect, nichos, radar, intencion, clasificar, proyecto-3d]
---

# clasificador-intencion — MICRO-AGENTE FUZZY que clasifica la intención del mensaje del dueño

## Qué hace el módulo

`clasificador-intencion` es un **MICRO-AGENTE FUZZY** (G3, hoja del plan): dado un **MENSAJE** que
llega del canal del dueño (que **captura-semilla (A1)** pudo aceptar como semilla o que llega por el
canal de supervisión), decide si es:

- **SEMILLA** — una palabra/idea para arrancar la búsqueda de un nicho nuevo;
- **DECISION** — una respuesta/veredicto del dueño a un gate o solicitud (APRUEBA, RECHAZA, dejo
  pasar, cobra/sangra, etc.);
- **CONSULTA** — una pregunta de estado/información sobre el pipeline o un nicho.

Es un **HÍBRIDO** (patrón real de estudio-demanda/normalizacion-semilla): `_clasificarFuzzy` hace
**1 llamada `llm.complete.request`** con guion-prompt self-contained + el mensaje → `{tipo, confianza}`;
si el LLM **falla o no cumple el contrato**, cae al **fallback reflejo determinista por reglas** de
marcadores de lengua (`_clasificarReflejo`). **SIEMPRE** devuelve `{tipo, confianza, senales}`;
**NUNCA inventa** — un mensaje vacío que no puede clasificarse → par de fallo honesto.

**Sin store ni persistencia.** Aunque es stateless, escucha **`project.activated`** para **solo
registrar el `project_id` activo** (scope del contexto). Publica `nichos.intencion.clasificada`
(→ captura-semilla A1 y canal-supervision G1) y su par determinista `nichos.intencion.clasificar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.intencion.clasificar.request` | `onClasificarRequest` | RPC híbrido: {project_id, mensaje} → intento {tipo: SEMILLA\|DECISION\|CONSULTA, confianza, senales}. Fuzzy vía `llm.complete.request` con guion; si el LLM falla o no cumple contrato, fallback reflejo por reglas (palabras/marcadores). Mensaje vacío o sin clasificar → error determinista (`nichos.intencion.clasificar.failed`). Éxito → publica `nichos.intencion.clasificada` y responde por `nichos.intencion.clasificar.response`. |
| `project.activated` | `onProjectActivated` | Micro-agente sin estado: registra el project_id activo para scope del contexto; no persiste nada. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.intencion.clasificada` | Fire-and-forget (G3): un mensaje del canal fue clasificado como SEMILLA\|DECISION\|CONSULTA → {project_id, mensaje, tipo, confianza, senales}. Lo consume captura-semilla (A1) y canal-supervision (G1) para enrutar la intención. |
| `nichos.intencion.clasificar.failed` | Par de fallo determinista: el mensaje llegó vacío/malformado o no pudo clasificarse → {status, code, mensaje}. Cierra el círculo de nichos.intencion.clasificar.request. |

> **Regla de cierre de círculo**: el par `nichos.intencion.clasificar.failed` cierra el círculo de
> `nichos.intencion.clasificar.request`. En éxito `onClasificarRequest` propaga el fire-and-forget de
> dominio `nichos.intencion.clasificada` (publicando `res.data` completo) además de la `.response`.

> **Nota: no está en module.json pero sí lo emite/usa index.js en `_clasificarFuzzy`** — el micro-agente
> invoca (`_rpc`) el RPC **`llm.complete.request`** (con `system: GUION_CLASIFICAR`, mensaje del usuario,
> `tools:[]`, `settings:{temperature:0.0}` y `timeout_ms:20000`) para la pasada fuzzy. Esto no se
> declara en `module.json` (que solo lista nichos.intencion.*) pero es parte esencial del contrato real.

## Reglas de negocio

1. **Mensaje obligatorio → `400 MENSAJE_VACIO`**: si `mensaje` falta, no es string, o tras `trim()`
   queda vacío → `{ status:400, code:'MENSAJE_VACIO', mensaje:'el mensaje esta vacio o no es un texto util', data:{ project_id } }`
   + `nichos.intencion.clasificar.failed`.
2. **Híbrido fuzzy→reflejo**: primero intenta `_clasificarFuzzy` (1 llamada `llm.complete.request`,
   temperatura 0.0, timeout 20s). Si el resultado no tiene `tipo` en `['SEMILLA','DECISION','CONSULTA']`
   (LLM falla, timeout, o no cumple contrato) → cae a `_clasificarReflejo` (reglas deterministas).
3. **Fallback reflejo por marcadores de lengua**: normaliza a minúsculas; un **signo de pregunta** o
   palabras interrogativas (`qué,que,cuál,como,cuando,donde,quien,por qué,porque`) ⇒ `CONSULTA`.
   Marcadores de decisión (`aprueb,rechaz,si,no,ok,vale,cobra,sangra,dejo,dejar,adelante,en caja,
   autoriz,visto bueno,permiso,listo,acepto`) pesan más que la pregunta si no hay marcador de consulta
   ⇒ `DECISION`. Si no hay marcador claro ⇒ **SEMILLA conservador**.
4. **NUNCA inventa (CERO resultados inventados)**: si ni el fuzzy ni el reflejo producen un `tipo`
   válido → `422 SIN_CLASIFICAR` `{ status:422, code:'SIN_CLASIFICAR', mensaje:'el mensaje no pudo
   clasificarse en una intencion valida', data:{ project_id } }` + failed. Un mensaje que no puede
   clasificarse no se fuerza a una categoría.
5. **Confianza por regla**: el reflejo asigna `confianza:0.8` si el tipo no es SEMILLA, `0.6` si es
   SEMILLA; y `senales:[{fuente:'reflejo', regla:'marcadores_de_lengua'}]`. El fuzzy asigna su
   `confianza` (default `0.8` si no viene) y `motivo`.
6. **Tipo normalizado en mayúsculas**: el payload de respuesta siempre entrega `tipo` en
   `['SEMILLA','DECISION','CONSULTA']` y `clasificado:true`.
7. **`project_id` con fallback al contexto**: si no viene `project_id` usado usa `this.project_id`
   (el proyecto activo registrado en `project.activated`).
8. **HTTP exacto**: éxito `200`; mensaje vacío → `400`; no clasificable → `422`;
   excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.intencion.clasificar.response`:

### 1. `clasificar` — clasificar la intención de un mensaje

```json
{
  "project_id": "e57a318a-...",
  "mensaje": "apruebo el paso al siguiente nicho",
  "correlation_id": "abc-123"
}
```
Respuesta `200` (vía fuzzy o reflejo):
```json
{
  "project_id": "e57a318a-...",
  "mensaje": "apruebo el paso al siguiente nicho",
  "tipo": "DECISION",
  "confianza": 0.8,
  "senales": [{ "fuente": "reflejo", "regla": "marcadores_de_lengua" }],
  "clasificado": true
}
```
Emite `nichos.intencion.clasificada`:
```json
{ "project_id": "e57a318a-...", "mensaje": "apruebo el paso al siguiente nicho", "tipo": "DECISION", "confianza": 0.8, "senales": [{ "fuente": "reflejo", "regla": "marcadores_de_lengua" }], "clasificado": true }
```

### Fallos típicos

- Mensaje vacío o no textual → `400` + `nichos.intencion.clasificar.failed` (`MENSAJE_VACIO`).
- Mensaje que ni fuzzy ni reflejo logran clasificar → `422` + failed (`SIN_CLASIFICAR`).

## Tests

El test vive en `tests/unit/nichos__clasificador-intencion.test.js`. Cubre:

- `clasificar` mensaje con marcador de decisión → `200` `{ tipo:'DECISION', confianza:0.8, clasificado:true }`,
  publica `nichos.intencion.clasificada` + `.response`.
- Mensaje con signo de pregunta / interrogativa → `CONSULTA`.
- Mensaje sin marcador claro → `SEMILLA` conservador (`confianza:0.6`).
- `_clasificarFuzzy` que falla (resp. LLM no cumple contrato, timeout) → cae al fallback reflejo.
- `_parseIntencion` tolera fences ```` ```json ```` y texto alrededor, y devuelve `null` si no hay `tipo`.
- Mensaje vacío → `400 MENSAJE_VACIO` + `nichos.intencion.clasificar.failed`.
- No clasificable → `422 SIN_CLASIFICAR` + failed.
- `project.activated` registra project_id sin persistir (fallback de contexto).
- Manifest: subscribes/publishes exactos de la hoja G3.

Para ejecutarlo (test central del repo):

```bash
cd /home/admin/3enki
node tests/unit/nichos__clasificador-intencion.test.js
```

## Notas de implementación

- Clase `ClasificadorIntencion extends ModuloHibridoReflejo`; `name = 'clasificador-intencion'`,
  `version = 'reflejo-0.1.0'`. **Sin store, sin PosPersistencia**. `this.project_id` = scope de contexto.
- `onClasificarRequest` delega en `_atender(e, 'clasificar', 'nichos.intencion.clasificar.response', fn)`
  y hace el fire-and-forget de dominio (`nichos.intencion.clasificada` con `res.data` en 200 o
  `nichos.intencion.clasificar.failed` si no).
- Proyecciones: `_clasificar` (orquesta híbrido), `_clasificarFuzzy` (1 llamada `llm.complete.request`
  vía `_rpc`, guion `GUION_CLASIFICAR` self-contained), `_parseIntencion` (extrae el JSON tolerando
  fences/texto), `_clasificarReflejo` (reglas deterministas de `MARCADORES_DECISION`/`MARCADORES_CONSULTA`).
- El guion-prompt `GUION_CLASIFICAR` exige responder SOLO con JSON `{"tipo":"SEMILLA|DECISION|CONSULTA",
  "confianza":0.0-1.0,"motivo":...}`.
- Tool: `toolClasificar` → `_clasificar`.
- DEP hacia delante: lo consumen captura-semilla (A1) y canal-supervision (G1). Origen del mensaje:
  canal del dueño.
