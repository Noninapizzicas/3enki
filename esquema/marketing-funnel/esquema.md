# Esquema — Módulo "marketing-funnel" (Embudo de marketing)

## Árbol completo

```
marketing-funnel
│
├── [IDENTIDAD] — ¿Qué es el funnel?
│   ├── SPAWN  Etapas
│   │   ├── ATÓMICO  Nombre ································ reflejo
│   │   ├── ATÓMICO  Orden ································· reflejo
│   │   ├── ATÓMICO  Descripción ··························· reflejo
│   │   ├── ATÓMICO  Métrica principal ····················· reflejo
│   │   ├── ATÓMICO  Acciones ······························ reflejo
│   │   └── ATÓMICO  Volumen actual ························ reflejo
│   │
│   └── SPAWN  Flujo
│       ├── ATÓMICO  Etapa origen ·························· reflejo
│       ├── ATÓMICO  Etapa destino ························· reflejo
│       ├── ATÓMICO  Tasa ·································· reflejo
│       └── ATÓMICO  Registros ····························· custodio
│
├── [RESTRICCIONES] — ¿Qué limita el funnel?
│   ├── REF     Audiencia ·································· → marketing-audience
│   ├── REF     Canales ···································· → marketing-channels
│   ├── REF     Contenido ·································· → marketing-content
│   └── REF     Analytics ·································· → marketing-analytics
│
├── [CONTRATO] — ¿Qué promete el módulo?
│   ├── ATÓMICO  Etapa definida ···························· custodio
│   ├── ATÓMICO  Flujo medido ······························ reflejo
│   └── ATÓMICO  Cuello de botella visible ················· conversor
│
├── [NO-OBJETIVOS] — ¿Qué NO es el módulo?
│   ├── ATÓMICO  No ejecuta acciones ······················· (frontera → marketing-campaigns)
│   ├── ATÓMICO  No captura leads ·························· (frontera → puertos de datos)
│   └── ATÓMICO  No decide el mensaje ······················ (frontera → marketing-content)
│
└── [PREGUNTAS_ABIERTAS] — [ABIERTO]
    ├── ¿Etapas fijas o personalizables?
    ├── ¿Funnel único o múltiples?
    └── ¿Granularidad temporal?
```

## Dependencias externas

| Módulo externo | Qué aporta | Cómo se consume |
|---|---|---|
| marketing-audience | Segmentos | Entran por la boca del embudo |
| marketing-channels | Canales | Las acciones se ejecutan en canales |
| marketing-content | Piezas | El contenido sirve a etapas del funnel |
| marketing-analytics | Métricas | Alimentan las tasas de conversión |

## Eventos del módulo (contrato del bus)

| Evento | Dirección | Payload |
|---|---|---|
| `project.activated` | ESCUCHA | `{ project_id }` — restaurar funnel |
| `marketing.funnel.get.request` | ESCUCHA | `{ project_id }` |
| `marketing.funnel.get.response` | EMITE | `{ project_id, etapas[], flujos[], cuello_de_botella, resumen }` |
| `marketing.funnel.update.request` | ESCUCHA | `{ project_id, etapas?, flujos? }` |
| `marketing.funnel.update.response` | EMITE | `{ project_id, campos_actualizados[] }` |
| `marketing.funnel.actualizado` | EMITE | `{ project_id, campos_actualizados[] }` |

## Store (contrato del dato)

```json
{
  "esquema": "marketing-funnel-v1",
  "etapas": [],
  "flujos": []
}
```

Cada etapa:

```json
{
  "id": "uuid",
  "nombre": "Awareness",
  "orden": 1,
  "descripcion": "El proyecto es visible para la audiencia",
  "metrica_principal": "alcance",
  "acciones": ["SEO", "Redes sociales", "Publicidad"],
  "volumen": null
}
```

Cada flujo:

```json
{
  "id": "uuid",
  "etapa_origen_id": "uuid-awareness",
  "etapa_destino_id": "uuid-consideration",
  "tasa": 12.5,
  "registros": [
    { "fecha": "2026-02-01", "tasa": 12.5, "volumen_origen": 1000, "volumen_destino": 125 }
  ]
}
```

## Reparto de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 10 | Nombre, Orden, Descripción, Métrica principal, Acciones, Volumen actual, Etapa origen, Etapa destino, Tasa, Flujo medido |
| **custodio** | 2 | Registros, Etapa definida |
| **conversor** | 1 | Cuello de botella visible |

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas hasta el suelo | 2 |
| Piezas totales | 17 |
| ATÓMICAS con forma | 13 |
| REF | 4 (marketing-audience, marketing-channels, marketing-content, marketing-analytics) |
| SPAWN residual | 0 |
| [ABIERTO] | 1 (3 preguntas) |

## Lectura del esquema

**marketing-funnel es un modelo declarativo del embudo.** 77% reflejo, 15% custodio, 8% conversor. El reflejo define las etapas y sus atributos. El custodio vigila la inmutabilidad de los registros de flujo. El conversor (cuello de botella) se implementa como función JS pura. Sin micro-agente, sin blueprint.
