# Esquema — Módulo "marketing-campaigns" (Campañas de marketing)

## Árbol completo

```
marketing-campaigns
│
├── [IDENTIDAD] — ¿Qué es una campaña?
│   ├── SPAWN  Briefing
│   │   ├── ATÓMICO  Nombre ································ reflejo
│   │   ├── ATÓMICO  Objetivo ······························ reflejo
│   │   ├── ATÓMICO  Audiencia ····························· reflejo
│   │   ├── ATÓMICO  Canales ······························· reflejo
│   │   ├── ATÓMICO  Presupuesto ··························· reflejo
│   │   ├── ATÓMICO  Periodo ······························· reflejo
│   │   ├── ATÓMICO  KPIs ·································· reflejo
│   │   └── ATÓMICO  Estado ································ reflejo
│   │
│   ├── ATÓMICO  Assets ···································· reflejo
│   ├── ATÓMICO  Lanzamiento ······························· reflejo
│   └── ATÓMICO  Cierre ···································· micro-agente
│
├── [RESTRICCIONES] — ¿Qué limita las campañas?
│   ├── REF     Contenido ·································· → marketing-content
│   ├── REF     Canales ···································· → marketing-channels
│   ├── REF     Presupuesto ································ → marketing-budget
│   ├── REF     Audiencia ·································· → marketing-audience
│   ├── REF     Calendario ································· → marketing-calendar
│   └── REF     Analytics ·································· → marketing-analytics
│
├── [CONTRATO] — ¿Qué promete el módulo?
│   ├── ATÓMICO  Briefing completo ························· custodio
│   ├── ATÓMICO  Ciclo cerrado ····························· reflejo
│   └── ATÓMICO  Assets trazables ·························· reflejo
│
├── [NO-OBJETIVOS] — ¿Qué NO es el módulo?
│   ├── ATÓMICO  No produce contenido ······················ (frontera → marketing-content)
│   ├── ATÓMICO  No mide ··································· (frontera → marketing-analytics)
│   └── ATÓMICO  No automatiza ····························· (frontera → marketing-automation)
│
└── [PREGUNTAS_ABIERTAS] — [ABIERTO]
    ├── ¿Campañas recurrentes?
    ├── ¿Plantillas reutilizables?
    └── ¿Aprobación antes de lanzar?
```

## Dependencias externas

| Módulo externo | Qué aporta | Cómo se consume |
|---|---|---|
| marketing-content | Assets | Las piezas de la campaña |
| marketing-channels | Canales | Dónde se ejecuta |
| marketing-budget | Presupuesto | Cuánto se invierte |
| marketing-audience | Segmentos | A quién se dirige |
| marketing-calendar | Fechas | Cuándo se ejecuta |
| marketing-analytics | Métricas | Cómo se mide |

## Eventos del módulo (contrato del bus)

| Evento | Dirección | Payload |
|---|---|---|
| `project.activated` | ESCUCHA | `{ project_id }` — restaurar campañas |
| `marketing.campaigns.get.request` | ESCUCHA | `{ project_id, filtros? }` |
| `marketing.campaigns.get.response` | EMITE | `{ project_id, campañas[], resumen }` |
| `marketing.campaigns.update.request` | ESCUCHA | `{ project_id, campañas? }` |
| `marketing.campaigns.update.response` | EMITE | `{ project_id, campos_actualizados[] }` |
| `marketing.campaigns.actualizado` | EMITE | `{ project_id, campos_actualizados[] }` |
| `marketing.campaigns.cerrar.request` | ESCUCHA (blueprint) | `{ project_id, campaña_id }` |

## Store (contrato del dato)

```json
{
  "esquema": "marketing-campaigns-v1",
  "campañas": []
}
```

Cada campaña:

```json
{
  "id": "uuid",
  "nombre": "Lanzamiento verano 2026",
  "objetivo": { "texto": "100 leads en 2 semanas", "metrica": "leads", "valor_objetivo": 100 },
  "audiencia_id": "uuid-segmento",
  "canales_ids": ["uuid-canal-1", "uuid-canal-2"],
  "presupuesto": { "cantidad": 2000, "moneda": "EUR" },
  "periodo": { "inicio": "2026-06-01", "fin": "2026-06-14" },
  "kpis": [{ "metrica": "leads", "objetivo_valor": 100 }],
  "assets_ids": ["uuid-pieza-1"],
  "estado": "activa",
  "cierre": null
}
```

## Reparto de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 12 | Nombre, Objetivo, Audiencia, Canales, Presupuesto, Periodo, KPIs, Estado, Assets, Lanzamiento, Ciclo cerrado, Assets trazables |
| **custodio** | 1 | Briefing completo |
| **micro-agente** | 1 | Cierre |

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas hasta el suelo | 2 |
| Piezas totales | 20 |
| ATÓMICAS con forma | 14 |
| REF | 6 (marketing-content, marketing-channels, marketing-budget, marketing-audience, marketing-calendar, marketing-analytics) |
| SPAWN residual | 0 |
| [ABIERTO] | 1 (3 preguntas) |

## Lectura del esquema

**marketing-campaigns es orquestación con veredicto.** 86% reflejo, 7% custodio, 7% micro-agente. El reflejo gestiona el briefing y la máquina de estados (borrador → aprobado → activa → cerrada → cancelada). El custodio vigila la completitud. El micro-agente evalúa al cerrar (¿funcionó? ¿qué se repite?).
