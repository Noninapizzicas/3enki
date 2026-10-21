---
name: confirmacion-valor
description: >-
  CUSTODIO del vertical NICHOS: store append-only de feedback por proyecto.
  Ingiere feedback crudo (por RPC o automaticamente desde el canal via F7b)
  y lo consulta como cronologia. Persistido con PosPersistencia en
  /prisma/pos/nichos/confirmacion-valor.json. Carga este modulo cuando
  necesites registrar feedback de validacion sobre un nicho o consultar
  la cronologia de feedback acumulado de un proyecto.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: custodio
tags: [nichos, custodio, feedback, confirmacion-valor, pos-persistencia, bus, mqtt, f7b]
---

# nichos - confirmacion-valor

> **Que es.** CUSTODIO del vertical NICHOS que acumula feedback de validacion
> en un store append-only por proyecto. Cada entrada registra el feedback crudo,
> la fuente y el instante. La cronologia sirve para medir si la propuesta de
> valor del nicho conecta con el publico.
>
> Codigo: `modules/nichos/confirmacion-valor/index.js`. La verdad viva es
> el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **CUSTODIO** (estado persistido, append-only).
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/confirmacion-valor.json` dentro del storage del proyecto.
- Estructura: `{ entradas: [ {id, feedback_crudo, fuente, at} ] }`.

## Eventos que atiende (request - response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.feedback.ingerir.request` | `onIngerirRequest` | `{status:200, data:{entrada_feedback:{id, feedback_crudo, fuente, at}}}` |
| `nichos.feedback.consultar.request` | `onConsultarRequest` | `{status:200, data:{entradas:[...]}}` |

### Payload de `.ingerir.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "feedback_crudo": "El producto me parece interesante pero el precio es alto",
  "fuente": "whatsapp"
}
```

### Payload de `.consultar.request`

```json
{
  "request_id": "uuid",
  "proyecto": "prj_xxx"
}
```

## Senales que escucha (fire-and-forget)

- `nichos.canal.mensaje.recibido` -> `onMensajeRecibido` — F7b: al llegar un
  mensaje del canal, lo ingiere como feedback automaticamente con fuente `canal`.
- `project.activated` -> `onProjectActivated` — restaura las entradas de feedback
  del proyecto desde PosPersistencia.

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.feedback.ingerido` | tras ingerir una entrada | `{id_proyecto, entrada_ref, timestamp}` |
| `nichos.feedback.ingerido.failed` | payload invalido | `{id_proyecto, code, message, timestamp}` |

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `project_id` o `feedback_crudo` (ingerir), falta `proyecto` (consultar) |

## Invariantes

- **Append-only**: las entradas solo se anaden, nunca se modifican ni eliminan.
- **Degradacion honesta**: sin `project_id`, el store queda solo en memoria
  (PosPersistencia no persiste).

## Integracion (patron RPC del bus)

```javascript
// INGERIR
const resp = await bus.publishAndWait('nichos.feedback.ingerir.request', {
  project_id,
  feedback_crudo: 'Me interesa pero necesito mas informacion',
  fuente: 'email'
});
const { entrada_feedback } = resp.data;

// CONSULTAR
const resp2 = await bus.publishAndWait('nichos.feedback.consultar.request', {
  proyecto: project_id
});
const { entradas } = resp2.data;
```

## Donde encaja en el vertical NICHOS

- **Validacion de propuesta de valor**: acumula las senales del mercado que
  confirman o desmienten la propuesta de valor del nicho. El cuadro de salud
  y el jefe (bloque K) leen la cronologia para decidir si pivotar o persistir.
- **F7b auto-ingestion**: al suscribirse a `nichos.canal.mensaje.recibido`,
  captura automaticamente las respuestas del publico como feedback sin
  intervencion manual del dueno.
