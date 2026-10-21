# Esquema — Módulo "marketing-budget" (Presupuesto de Marketing por Proyecto)

## Árbol completo

```
marketing-budget
│
├── [IDENTIDAD] — ¿Qué es el presupuesto?
│   ├── ATÓMICO  Presupuesto total ······················ reflejo
│   │
│   ├── SPAWN  Asignación por partida
│   │   ├── ATÓMICO  Nombre de partida ·················· reflejo
│   │   ├── ATÓMICO  Tipo de partida ···················· reflejo
│   │   ├── ATÓMICO  Referencia ························· reflejo
│   │   ├── ATÓMICO  Importe asignado ··················· reflejo
│   │   ├── ATÓMICO  Periodo ···························· reflejo
│   │   └── ATÓMICO  Estado ····························· reflejo
│   │
│   ├── SPAWN  Registro de gastos
│   │   ├── ATÓMICO  Gasto ······························ custodio
│   │   ├── ATÓMICO  Concepto ··························· reflejo
│   │   └── ATÓMICO  Fuente ····························· reflejo
│   │
│   └── ATÓMICO  Control presupuestario ················· custodio
│
├── [RESTRICCIONES] — ¿Qué limita el presupuesto?
│   ├── REF     Recursos del proyecto ··················· → project-profile
│   ├── REF     Canales activos ························· → marketing-channels
│   └── REF     Estrategia ····························· → marketing-strategy
│
├── [CONTRATO] — ¿Qué promete el módulo?
│   ├── ATÓMICO  Techo respetado ························ reflejo
│   ├── ATÓMICO  Gasto trazable ························· reflejo
│   └── ATÓMICO  Alerta de desvío ······················· custodio
│
├── [NO-OBJETIVOS] — ¿Qué NO es el módulo?
│   ├── ATÓMICO  No ejecuta pagos ······················· (frontera → sistemas externos)
│   ├── ATÓMICO  No mide ROI ···························· (frontera → marketing-analytics)
│   └── ATÓMICO  No gestiona facturas ··················· (frontera → facturas)
│
└── [PREGUNTAS_ABIERTAS] — [ABIERTO]
    ├── ¿Periodo: mensual, trimestral, anual?
    ├── ¿Se reasigna lo no gastado?
    ├── ¿Categorías fijas o libres?
    └── ¿Incluye costes internos?
```

## Dependencias externas

| Módulo externo | Qué aporta | Cómo se consume |
|---|---|---|
| project-profile | Recursos generales del proyecto | Techo máximo del presupuesto |
| marketing-channels | Canales activos | Solo se asigna a canales que existen |
| marketing-strategy | Objetivos y prioridades | Orienta la distribución |

## Eventos del módulo (contrato del bus)

| Evento | Dirección | Payload |
|---|---|---|
| `project.activated` | ESCUCHA | `{ project_id }` — restaurar presupuesto |
| `marketing.budget.get.request` | ESCUCHA | `{ project_id }` |
| `marketing.budget.get.response` | EMITE | `{ project_id, presupuesto, partidas[], gastos[], control }` |
| `marketing.budget.update.request` | ESCUCHA | `{ project_id, presupuesto?, partidas?, gastos? }` |
| `marketing.budget.update.response` | EMITE | `{ project_id, campos_actualizados[] }` |
| `marketing.budget.actualizado` | EMITE | `{ project_id, campos_actualizados[] }` |
| `marketing.budget.alerta` | EMITE | `{ project_id, partida_id, asignado, gastado }` — cuando gasto > asignado |

## Store (contrato del dato)

```json
{
  "esquema": "marketing-budget-v1",
  "presupuesto": { "cantidad": null, "moneda": "EUR", "periodo": { "inicio": null, "fin": null } },
  "partidas": [],
  "gastos": []
}
```

Cada partida:

```json
{
  "id": "uuid",
  "nombre": "Google Ads",
  "tipo": "canal",
  "referencia": "uuid-canal",
  "importe": { "cantidad": 500, "moneda": "EUR" },
  "periodo": { "inicio": "2026-01-01", "fin": "2026-03-31" },
  "estado": "activo"
}
```

Cada gasto:

```json
{
  "id": "uuid",
  "partida_id": "uuid",
  "fecha": "2026-02-15T10:00:00Z",
  "importe": { "cantidad": 120, "moneda": "EUR" },
  "concepto": "Campaña febrero semana 3",
  "fuente": "manual"
}
```

## Reparto de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 11 | Nombre, Tipo, Referencia, Importe asignado, Periodo, Estado, Concepto, Fuente, Presupuesto total, Techo respetado, Gasto trazable |
| **custodio** | 3 | Gasto, Control presupuestario, Alerta de desvío |

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas hasta el suelo | 2 |
| Piezas totales | 17 |
| ATÓMICAS con forma | 14 |
| REF | 3 (project-profile, marketing-channels, marketing-strategy) |
| SPAWN residual | 0 |
| [ABIERTO] | 1 (4 preguntas) |

## Lectura del esquema

**marketing-budget es contabilidad pura.** 79% reflejo, 21% custodio. El reflejo declara el plan (cuánto y a dónde); el custodio vigila la ejecución (libro de gastos inmutable + semáforo de desvío). Sin fuzzy, sin blueprint, sin conversor. La aritmética lo resuelve todo: sum(asignaciones) <= total, sum(gastos_partida) vs asignado_partida.
