---
name: canal-distribucion
description: >
  Skill FULL del módulo PUENTE (stateless) `canal-distribucion` de la vertical nichos
  (Radar de Nichos). Lleva la SOLUCIÓN construida al pagador del nicho por su canal de
  entrega declarado (del perfil de cobro/entrega I1). Stateless: sin store, sin persistencia,
  cada op entra objeto y sale objeto. El canal declarado es un PUERTO ABIERTO — agnóstico al
  proveedor: nunca se acopla a una plataforma de entrega concreta; el canal se declara y puede
  sustituirse por evento. Úsala para operar, depurar o extender el puente, o para entender su
  contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites enrutar la solución hacia el pagador del nicho por su canal
    (RPC nichos.entrega.enviar.request).
  - Cuando depures por qué una entrega se rechaza (INVALID_INPUT en sin canal, sin solución,
    sin pagador o sin proyecto) o no se emite nichos.entrega.enviada.
  - Cuando quieras entender la proyección pura _emitirEntrega y el contrato de eventos del
    puente stateless (canal abierto, agnóstico al proveedor).
  - Cuando vayas a escribir/ampliar el test unitario del módulo.
tags: [enki, modulo, puente, stateless, nichos, radar, distribucion, entrega, proyecto-3d]
---

# canal-distribucion — PUENTE (stateless) de la entrega de la solución al pagador

## Qué hace el módulo

`canal-distribucion` es un **PUENTE STATELESS** (E4): lleva la **SOLUCIÓN construida** al
**pagador del nicho** por su **canal de entrega declarado** (del perfil de cobro/entrega I1).
Stateless: sin store, sin persistencia, cada op entra objeto y sale objeto. El canal declarado es
un **puerto ABIERTO — agnóstico al proveedor**: nunca se acopla a una plataforma de entrega
concreta; el canal se declara y puede sustituirse por evento.

Una proyección pura (`_emitirEntrega(project_id, solucion, canal, pagador)`): valida la célula y
enruta la entrega hacia el canal del pagador. Publica `nichos.entrega.enviada` (éxito) y su par
determinista `nichos.entrega.enviar.failed` (sin canal, sin solución o sin pagador).

> **Nota de forma**: aunque es stateless (puente), su `module.json` declara `project.activated` como
> subscribe (y `onProjectActivated` existe) — pero SOLO registra el `project_id` activo en memoria
> (contexto), sin persistencia ni restauración. No es un custodio; no hay PosPersistencia.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.entrega.enviar.request` | `onEnviarRequest` | RPC puro: {project_id, solucion, canal, pagador} → {project_id, entrega:{proyecto, pagador, canal, solucion_id, entregada, entregado_en}, enviada:true}. Enruta la solución hacia el canal del pagador (del perfil de cobro/entrega I1). Sin canal, sin solución o sin pagador → `nichos.entrega.enviar.failed`. Éxito → publica `nichos.entrega.enviada` y responde por `nichos.entrega.enviar.response`. |
| `project.activated` | `onProjectActivated` | Puente sin estado: registra el `project_id` activo para scope del contexto; no persiste nada. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.entrega.enviada` | Fire-and-forget (E4): la solución fue entregada al pagador por su canal → {project_id, entrega:{pagador, canal, solucion_id, entregada, entregado_en}, enviada:true}. Lo consumen el pipeline-por-nicho (L1) y registro-cobros/confirmacion-valor. |
| `nichos.entrega.enviar.failed` | Par de fallo determinista (E4): entrega rechazada (sin canal, sin solución o sin pagador) → {status, code, message, data}. Cierra el círculo de `nichos.entrega.enviar.request`. |

> **Regla de cierre de círculo**: el par `nichos.entrega.enviar.failed` cierra el círculo de
> `nichos.entrega.enviar.request`. En éxito `onEnviarRequest` propaga el fire-and-forget de dominio
> `nichos.entrega.enviada` (con `correlation_id` del request) además de la `.response`.

> **Nota: los eventos de dominio que emite index.js en `onEnviarRequest` (nichos.entrega.enviada,
> nichos.entrega.enviar.failed) coinciden exactamente con los publicados en module.json** — no hay
> sub-declaración en este módulo.

## Reglas de negocio

1. **Canal de entrega obligatorio → `400 INVALID_INPUT`**: si `canal` falta o no es string con
   trim no vacío → `{ status:400, code:'INVALID_INPUT', mensaje:'canal de entrega requerido (decláralo en el perfil de cobro/entrega I1)', data:{} }`
   + `nichos.entrega.enviar.failed`. El canal se declara en el perfil I1 y el puente lo enruta.
2. **Solución obligatoria (objeto)**: `solucion` debe ser objeto; si falta → `_invalid('solucion')`
   + failed.
3. **Pagador obligatorio (string no-vacío)**: `pagador` debe ser string con trim no vacío; si no →
   `_invalid('pagador')` + failed.
4. **`project_id` obligatorio**: si no viene y no hay contexto activo → `_invalid('project_id')`
   + failed.
5. **Entrega con identidad y sello**: `_emitirEntrega` construye la entrega con `proyecto`,
   `pagador` (trim), `canal` (trim), `solucion_id` (de `solucion.id || solucion.slug` o fallback
   `${project_id}-sol`), `entregada:true` y `entregado_en` ISO. Marcada `enviada:true` en la data.
6. **Canal abierto, agnóstico al proveedor**: el canal se declara y puede sustituirse por evento;
   el puente nunca se acopla a una plataforma de entrega concreta (no hay elenco cerrado de canales).
7. **Puente sin estado**: `project_id` del request tiene preferencia sobre el contexto
   (`this.project_id`); no hay store ni PosPersistencia. `project.activated` solo registra el
   proyecto activo en memoria.
8. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.entrega.enviar.response`:

### 1. `enviar` — enrutar la solución al pagador por su canal

```json
{
  "project_id": "e57a318a-...",
  "solucion": { "id": "sol-n1", "nombre": "Landing nicho" },
  "canal": "email",
  "pagador": "cliente a",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "entrega": {
    "proyecto": "e57a318a-...",
    "pagador": "cliente a",
    "canal": "email",
    "solucion_id": "sol-n1",
    "entregada": true,
    "entregado_en": "2026-09-25T10:00:00.000Z"
  },
  "enviada": true
}
```
Emite `nichos.entrega.enviada` (fire-and-forget para pipeline-por-nicho L1 / registro-cobros /
confirmacion-valor):
```json
{ "project_id": "e57a318a-...", "entrega": { "pagador": "cliente a", "canal": "email", "solucion_id": "sol-n1", "entregada": true, "entregado_en": "..." }, "enviada": true, "correlation_id": "abc-123" }
```

### Fallos típicos

- Sin canal → `400` + `nichos.entrega.enviar.failed` (`INVALID_INPUT`, "canal de entrega requerido...").
- Sin solución → `400` + failed (`INVALID_INPUT`, field `solucion`).
- Sin pagador → `400` + failed (`INVALID_INPUT`, field `pagador`).
- Sin `project_id` ni contexto → `400` + failed (`INVALID_INPUT`, field `project_id`).

## Tests

El test vive en `tests/unit/nichos__canal-distribucion.test.js`. Cubre:

- `enviar` con solución/canal/pagador → `200`, construcción de la entrega (`pagador`, `canal`,
  `solucion_id`, `entregada`), publica `nichos.entrega.enviada` + `.response` correlado con `request_id`.
- Sin canal → `400 INVALID_INPUT` + `nichos.entrega.enviar.failed`.
- Sin solución → `400 INVALID_INPUT`.
- Sin pagador → `400 INVALID_INPUT`.
- `project.activated` registra el `project_id`; sin `project_id` explícito usa el contexto.
- Manifest: subscribes (`enviar.request` + `project.activated`) ↔ handlers y publishes
  (`enviada` + `enviar.failed`) exactos de la hoja E4.

Para ejecutarlo (test central del repo):

```bash
cd /home/admin/3enki
node tests/unit/nichos__canal-distribucion.test.js
```

## Notas de implementación

- Clase `CanalDistribucion extends ModuloHibridoReflejo`; `name = 'canal-distribucion'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless); `this.project_id` en memoria.
- `onEnviarRequest` delega en `_atender(e, 'enviar', 'nichos.entrega.enviar.response', fn)`;
  con `status === 200` publica `nichos.entrega.enviada`; si no, `nichos.entrega.enviar.failed`
  (propaga `correlation_id`).
- `onProjectActivated` es reflejo de contexto: registra `this.project_id` (no persiste).
- Proyección pura: `_emitirEntrega` (valida célula + enruta). Sin constants de elenco cerrado:
  el canal es un puerto abierto.
- Tool: `toolEmitir` → `_emitirEntrega`.
- El canal se declara en el perfil de cobro/entrega (I1) y el puente lo enruta; nunca se acopla a
  una plataforma concreta.
- DEP hacia delante: lo consumen pipeline-por-nicho (L1) y registro-cobros/confirmacion-valor.
