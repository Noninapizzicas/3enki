---
name: cola-candidatos
description: >-
  CUSTODIO del vertical NICHOS: cola FIFO de candidatos por proyecto.
  Encola candidatos detectados (manual o automatico via
  nichos.candidato.detectado) y sirve lotes FIFO por RPC. Persistencia
  per-proyecto via PosPersistencia.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: custodio
tags: [nichos, custodio, cola, fifo, candidatos, pos-persistencia, bus, mqtt]
---

# nichos · cola-candidatos

> **Qué es.** CUSTODIO de la cola FIFO de candidatos del vertical NICHOS.
> Los candidatos se encolan manualmente por RPC o automaticamente al
> escuchar `nichos.candidato.detectado` (F7b). Se extraen en lotes FIFO
> (el primero encolado sale primero).
>
> Código: `modules/nichos/cola-candidatos/index.js`. La verdad viva es
> el código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **CUSTODIO** (estado persistido, cola FIFO).
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/cola-candidatos.json` dentro del storage del proyecto.
- Esqueleto por defecto: array vacío de items, version 0.

## Campos del store

| Campo | Tipo | Semántica |
|---|---|---|
| `version` | `Int` | contador monotónico de mutaciones |
| `items` | `Array<{id_nicho, payload, encolado_at}>` | cola FIFO de candidatos pendientes |
| `total_encolados` | `Int` | total histórico de candidatos encolados |

## Eventos que atiende (request → response)

| Evento | Handler | Qué devuelve |
|---|---|---|
| `nichos.cola.candidatos.encolar.request` | `onEncolarRequest` | `{status:200, data:{encolado:{id_nicho, posicion}}}` |
| `nichos.cola.candidatos.sacar.request` | `onSacarRequest` | `{status:200, data:{lote[]}}` |

### Payload de `.encolar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "candidato": {
    "id_nicho": "nicho_abc",
    "nombre": "keyword research tools",
    "score": 0.87
  }
}
```

### Payload de `.sacar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "n": 5
}
```

## Señales que escucha (fire-and-forget)

- `nichos.candidato.detectado` → `onCandidatoDetectado` — encola
  automáticamente el candidato detectado por el sondeador (F7b). Requiere
  `project_id` y `candidato` en el payload.
- `project.activated` → `onProjectActivated` — restaura el store
  persistido del proyecto desde `/prisma/pos/nichos/cola-candidatos.json`.

## Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.candidato.encolado` | tras encolar un candidato | `{project_id, id_nicho, posicion, timestamp}` |
| `nichos.candidato.encolado.failed` | encolado fallido (input inválido) | `{project_id, code, message, timestamp}` |

## Invariantes

- **FIFO estricto**: el primer candidato encolado es el primero en salir.
  `_sacar` extrae desde la cabeza del array con `splice(0, n)`.
- **Degradación honesta**: sin `project_id` el store queda sólo en memoria
  (PosPersistencia no persiste).

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `project_id` o `candidato` en encolar; falta `project_id` en sacar |

## Integración (patrón RPC del bus)

```javascript
// ENCOLAR
const resp = await bus.publishAndWait('nichos.cola.candidatos.encolar.request', {
  project_id,
  candidato: { id_nicho: 'nicho_abc', nombre: 'keyword tools', score: 0.9 }
});
// resp.data.encolado → { id_nicho, posicion }

// SACAR (lote de 3)
const resp2 = await bus.publishAndWait('nichos.cola.candidatos.sacar.request', {
  project_id,
  n: 3
});
// resp2.data.lote → [ { id_nicho, payload, encolado_at }, ... ]
```

## Dónde encaja en el vertical NICHOS

- **Cola de trabajo**: los candidatos detectados por el sondeador llegan
  aquí vía `nichos.candidato.detectado`. El planificador o el jefe los
  extrae con `.sacar.request` para procesarlos en orden.
- No depende de otro módulo del vertical para arrancar (sólo
  `project.activated` del core). Es raíz del grafo de construcción.
