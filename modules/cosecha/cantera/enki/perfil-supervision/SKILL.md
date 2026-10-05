---
name: perfil-supervision
description: >-
  CUSTODIO del vertical NICHOS (bloque H · interlocutor dueño): ranura única
  autorizada que guarda el perfil de supervisión del dueño (cadencia_pulso,
  decide_siempre, umbral_nitidez_semilla, canales_elegidos,
  techo_perdida_proyecto, cadencia_cuadro) con inmutabilidad por versión. El
  dueño declara por el canal (único escritor); lectores libres por RPC. Carga
  este módulo cuando escalones-mensaje, puerto-canal, gate-decision-operar,
  alerta-sangria, paquetador-decision o normalizador-semilla necesiten leer la
  cadencia, los umbrales o los canales elegidos del dueño antes de actuar.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: custodio
tags: [nichos, custodio, perfil, supervision, cadencia, canales, bloque-h, pos-persistencia, bus, mqtt]
---

# nichos · perfil-supervision

> **Qué es.** CUSTODIO único (bloque H interlocutor dueño) del perfil de
> supervisión del vertical NICHOS. Snapshot inmutable por versión con los seis
> campos que gobiernan cadencia, escalones, umbrales y canales de interlocución
> con el dueño.
>
> Código: `modules/nichos/perfil-supervision/index.js`. La verdad viva es el
> código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **CUSTODIO** (único escritor, estado persistido).
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/perfil-supervision.json`.
- Autor autorizado: `dueño` (regla F3: *"un solo escritor por el canal"*).
  K3 (ajustador-umbrales) NO toca este perfil; aquí solo manda el dueño porque
  gobierna la cadencia y la cara del sistema.
- Esqueleto por defecto: todo campo nace `ABIERTO` (salvo `decide_siempre` que
  nace `[]` por tipo) — el consumidor decide qué hacer con un ABIERTO.

## Campos del perfil

| Campo | Tipo | Semántica |
|---|---|---|
| `cadencia_pulso` | `Cadencia \| 'ABIERTO'` | con qué frecuencia el dueño quiere pulsos de avance (diario, semanal, …) |
| `decide_siempre` | `Array<TipoDecision>` | tipos que SIEMPRE suben al dueño (ej.: GATE_OPERAR, PUENTE_HUMANO, ALERTA_SANGRIA) |
| `umbral_nitidez_semilla` | `Decimal \| 'ABIERTO'` | debajo del cual el normalizador-semilla abre `SolicitudDecision` en vez de autoexpandir |
| `canales_elegidos` | `Array<NombrePuerto> \| 'ABIERTO'` | puertos de canal por los que el dueño quiere ser alcanzado |
| `techo_perdida_proyecto` | `Dinero \| 'ABIERTO'` | techo de pérdida acumulada por proyecto antes de alerta-sangria |
| `cadencia_cuadro` | `Cadencia \| 'ABIERTO'` | con qué frecuencia recalcular/entregar el cuadro de salud |

## Eventos que atiende (request → response)

| Evento | Handler | Qué devuelve |
|---|---|---|
| `nichos.perfil.supervision.leer.request` | `onLeerRequest` | `{status:200, data:{perfil_supervision:{version, perfil, por_autor}}}` |
| `nichos.perfil.supervision.declarar.request` | `onDeclararRequest` | `{status:200, data:{nueva_version, perfil_supervision}}` o `{status:403, error:{code:'PERMISSION_DENIED'}}` |

### Payload de `.declarar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "por_autor": "dueño",
  "cambio": {
    "cadencia_pulso": "diario",
    "decide_siempre": ["GATE_OPERAR", "PUENTE_HUMANO", "ALERTA_SANGRIA"],
    "umbral_nitidez_semilla": 0.6,
    "canales_elegidos": ["telegram"],
    "techo_perdida_proyecto": 100,
    "cadencia_cuadro": "semanal"
  }
}
```

Campos del `cambio` no incluidos → se conservan del snapshot anterior. Campos
fuera del esquema → 400 `INVALID_INPUT`.

## Señales que escucha (fire-and-forget)

- `project.activated` → `onProjectActivated` — restaura el perfil persistido
  desde `/prisma/pos/nichos/perfil-supervision.json`.

## Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.perfil.supervision.declarado` | tras aplicar una declaración válida | `{project_id, version, por_autor, timestamp}` |
| `nichos.perfil.supervision.declarado.failed` | rechazo por autor no autorizado o cambio inválido | `{project_id, code, message, timestamp}` |

## Invariantes

- **Único escritor**: solo `por_autor === 'dueño'` muta el store.
- **Inmutabilidad por versión**: cada declaración crea un snapshot nuevo
  (`version++`); el historial queda en `por_autor[]`.
- **ABIERTO explícito**: la ausencia de un valor se nombra como `'ABIERTO'`.
- **Degradación honesta**: sin `project_id` el store queda en memoria.

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `project_id`/`por_autor`/`cambio`, o `cambio` trae campos fuera del esquema |
| 403 | `PERMISSION_DENIED` | `por_autor` no es `'dueño'` |

## Integración (patrón RPC del bus)

```javascript
// LEER (escalones-mensaje antes de clasificar escalón)
const r = await bus.publishAndWait('nichos.perfil.supervision.leer.request', { project_id });
const p = r.data.perfil_supervision.perfil;
if (p.decide_siempre.includes('ALERTA_SANGRIA')) escalon = 'DECISION';

// DECLARAR (dueño cambia a modo silencioso)
await bus.publishAndWait('nichos.perfil.supervision.declarar.request', {
  project_id, por_autor: 'dueño',
  cambio: { cadencia_pulso: 'semanal', decide_siempre: ['GATE_OPERAR'] }
});
```

## Dónde encaja en el vertical NICHOS

- **Bloque H — interlocutor dueño**: su mando a distancia sobre todo lo que
  llega al dueño (ritmo, qué le despierta y qué no, por qué canal).
- Lectores habituales: `nichos-escalones-mensaje` (G2) para clasificar
  PULSO/ALERTA/DECISION/SILENCIO; `nichos-puerto-canal` (G1) para elegir
  canal; `nichos-gate-decision-operar` (E2) y `nichos-alerta-sangria` (F4)
  para saber si suben siempre; `nichos-paquetador-decision` (H1) para elegir
  tono/longitud; `nichos-normalizador-semilla` (A2) para el corte de nitidez.
- No depende de otro módulo del vertical para arrancar (solo
  `project.activated` del core). Es raíz del grafo del bloque H.
