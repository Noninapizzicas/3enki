# Esquema — Módulo "marketing-content" (Contenido de marketing)

## Árbol completo

```
marketing-content
│
├── [IDENTIDAD] — ¿Qué es el contenido?
│   ├── SPAWN  Catálogo de piezas
│   │   ├── ATÓMICO  Título ································ reflejo
│   │   ├── ATÓMICO  Formato ······························· reflejo
│   │   ├── ATÓMICO  Canal destino ························· reflejo
│   │   ├── ATÓMICO  Etapa funnel ·························· reflejo
│   │   ├── ATÓMICO  Estado ································ reflejo
│   │   ├── ATÓMICO  Madre ID ······························ reflejo
│   │   ├── ATÓMICO  Descripción ··························· reflejo
│   │   └── ATÓMICO  Fecha creación ························ reflejo
│   │
│   └── SPAWN  Reutilización
│       ├── ATÓMICO  Pieza madre (referencia) ··············· reflejo
│       ├── ATÓMICO  Plan de fragmentación ·················· micro-agente
│       └── ATÓMICO  Piezas generadas ······················ reflejo
│
├── [RESTRICCIONES] — ¿Qué limita el contenido?
│   ├── REF     Canales activos ···························· → marketing-channels
│   ├── REF     Calendario ································· → marketing-calendar
│   ├── REF     Audiencia ·································· → marketing-audience
│   ├── REF     Estrategia ································· → marketing-strategy
│   └── REF     Funnel ····································· → marketing-funnel
│
├── [CONTRATO] — ¿Qué promete el módulo?
│   ├── ATÓMICO  Pieza trazable ···························· custodio
│   ├── ATÓMICO  Hijas vinculadas ·························· reflejo
│   └── ATÓMICO  Ciclo respetado ··························· reflejo
│
├── [NO-OBJETIVOS] — ¿Qué NO es el módulo?
│   ├── ATÓMICO  No redacta contenido ······················ (frontera → redactor, skills)
│   ├── ATÓMICO  No publica ································ (frontera → publicador)
│   └── ATÓMICO  No mide rendimiento ······················· (frontera → marketing-analytics)
│
└── [PREGUNTAS_ABIERTAS] — [ABIERTO]
    ├── ¿Etiquetas/tags por pieza?
    ├── ¿Versiones de una misma pieza?
    └── ¿Límite de profundidad madre→hija?
```

## Dependencias externas

| Módulo externo | Qué aporta | Cómo se consume |
|---|---|---|
| marketing-channels | Canales activos | El contenido se publica en canales que existen |
| marketing-calendar | Fechas planificadas | La publicación tiene fecha en el calendario |
| marketing-audience | Segmentos | El contenido se dirige a audiencias definidas |
| marketing-strategy | Objetivos | Orienta qué contenido producir |
| marketing-funnel | Etapas | Cada pieza sirve a una etapa del funnel |

## Eventos del módulo (contrato del bus)

| Evento | Dirección | Payload |
|---|---|---|
| `project.activated` | ESCUCHA | `{ project_id }` — restaurar contenido |
| `marketing.content.get.request` | ESCUCHA | `{ project_id, filtros? }` |
| `marketing.content.get.response` | EMITE | `{ project_id, piezas[], resumen }` |
| `marketing.content.update.request` | ESCUCHA | `{ project_id, piezas? }` |
| `marketing.content.update.response` | EMITE | `{ project_id, campos_actualizados[] }` |
| `marketing.content.actualizado` | EMITE | `{ project_id, campos_actualizados[] }` |
| `marketing.content.fragmentar.request` | ESCUCHA (blueprint) | `{ project_id, pieza_id, canales_destino? }` |

## Store (contrato del dato)

```json
{
  "esquema": "marketing-content-v1",
  "piezas": []
}
```

Cada pieza:

```json
{
  "id": "uuid",
  "titulo": "Guía SEO para principiantes",
  "formato": "articulo",
  "canal_id": "uuid-canal",
  "etapa_funnel": "awareness",
  "estado": "borrador",
  "madre_id": null,
  "descripcion": "Guía introductoria sobre posicionamiento orgánico",
  "creado": "2026-02-15T10:00:00Z"
}
```

## Reparto de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 12 | Título, Formato, Canal destino, Etapa funnel, Estado, Madre ID, Descripción, Fecha creación, Pieza madre (ref), Piezas generadas, Hijas vinculadas, Ciclo respetado |
| **custodio** | 1 | Pieza trazable |
| **micro-agente** | 1 | Plan de fragmentación |

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas hasta el suelo | 2 |
| Piezas totales | 19 |
| ATÓMICAS con forma | 14 |
| REF | 5 (marketing-channels, marketing-calendar, marketing-audience, marketing-strategy, marketing-funnel) |
| SPAWN residual | 0 |
| [ABIERTO] | 1 (3 preguntas) |

## Lectura del esquema

**marketing-content es un catálogo con ciclo de vida.** 86% reflejo, 7% custodio, 7% micro-agente. El reflejo gestiona el inventario de piezas y su estado. El custodio vigila la completitud. El micro-agente genera el plan de fragmentación cuando se pide reutilizar una pieza madre (qué formatos × canales). Módulo híbrido: reflejo dominante + blueprint para fragmentación.
