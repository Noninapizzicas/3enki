# Esquema — Módulo "marketing-automation" (Automatización de marketing)

## Árbol completo

```
marketing-automation
│
├── [IDENTIDAD] — ¿Qué es la automatización?
│   └── SPAWN  Flujos
│       ├── ATÓMICO  Nombre ································ reflejo
│       ├── ATÓMICO  Trigger ······························· reflejo
│       ├── ATÓMICO  Pasos ································· reflejo
│       ├── ATÓMICO  Reglas ································ reflejo
│       ├── ATÓMICO  Estado ································ reflejo
│       └── ATÓMICO  Historial ····························· custodio
│
├── [RESTRICCIONES] — ¿Qué limita la automatización?
│   ├── REF     Canales ···································· → marketing-channels
│   ├── REF     Audiencia ·································· → marketing-audience
│   └── REF     Contenido ·································· → marketing-content
│
├── [CONTRATO] — ¿Qué promete el módulo?
│   ├── ATÓMICO  Flujo completo ···························· custodio
│   ├── ATÓMICO  Trigger definido ·························· reflejo
│   └── ATÓMICO  Ejecución trazable ························ reflejo
│
├── [NO-OBJETIVOS] — ¿Qué NO es el módulo?
│   ├── ATÓMICO  No produce contenido ······················ (frontera → marketing-content)
│   ├── ATÓMICO  No ejecuta envío físico ··················· (frontera → puertos de envío)
│   └── ATÓMICO  No decide qué automatizar ················· (frontera → marketing-strategy)
│
└── [PREGUNTAS_ABIERTAS] — [ABIERTO]
    ├── ¿Pasos complejos (bifurcación, wait, loops)?
    ├── ¿Límite de ejecuciones concurrentes?
    └── ¿Flujos inter-proyecto?
```

## Dependencias externas

| Módulo externo | Qué aporta | Cómo se consume |
|---|---|---|
| marketing-channels | Canales | Las acciones se ejecutan en canales |
| marketing-audience | Segmentos | Los flujos se dirigen a segmentos |
| marketing-content | Piezas | Los pasos usan piezas de contenido |

## Eventos del módulo (contrato del bus)

| Evento | Dirección | Payload |
|---|---|---|
| `project.activated` | ESCUCHA | `{ project_id }` — restaurar flujos |
| `marketing.automation.get.request` | ESCUCHA | `{ project_id, filtros? }` |
| `marketing.automation.get.response` | EMITE | `{ project_id, flujos[], resumen }` |
| `marketing.automation.update.request` | ESCUCHA | `{ project_id, flujos? }` |
| `marketing.automation.update.response` | EMITE | `{ project_id, campos_actualizados[] }` |
| `marketing.automation.actualizado` | EMITE | `{ project_id, campos_actualizados[] }` |

## Store (contrato del dato)

```json
{
  "esquema": "marketing-automation-v1",
  "flujos": []
}
```

Cada flujo:

```json
{
  "id": "uuid",
  "nombre": "Bienvenida nuevo suscriptor",
  "trigger": { "evento": "audiencia.nuevo_suscriptor", "condiciones": {} },
  "pasos": [
    { "tipo": "enviar", "config": { "canal_id": "uuid", "pieza_id": "uuid" } },
    { "tipo": "esperar", "config": { "dias": 3 } },
    { "tipo": "evaluar", "config": { "condicion": "abrió_email" } }
  ],
  "reglas": [],
  "estado": "activo",
  "historial": []
}
```

## Reparto de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 7 | Nombre, Trigger, Pasos, Reglas, Estado, Trigger definido, Ejecución trazable |
| **custodio** | 2 | Historial, Flujo completo |

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas hasta el suelo | 2 |
| Piezas totales | 12 |
| ATÓMICAS con forma | 9 |
| REF | 3 (marketing-channels, marketing-audience, marketing-content) |
| SPAWN residual | 0 |
| [ABIERTO] | 1 (3 preguntas) |

## Lectura del esquema

**marketing-automation es determinismo puro.** 78% reflejo, 22% custodio. Matching de eventos + grafos de pasos deterministas. El custodio vigila el historial inmutable y la completitud. Sin fuzzy, sin blueprint. La automatización ejecuta, no decide.
