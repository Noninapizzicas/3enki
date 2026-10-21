# Esquema — Módulo "marketing-analytics" (Medición de marketing)

## Árbol completo

```
marketing-analytics
│
├── [IDENTIDAD] — ¿Qué es la medición?
│   ├── SPAWN  Métricas
│   │   ├── ATÓMICO  Nombre ································ reflejo
│   │   ├── ATÓMICO  Tipo ·································· reflejo
│   │   ├── ATÓMICO  Fuente ································ reflejo
│   │   ├── ATÓMICO  Canal asociado ························ reflejo
│   │   └── ATÓMICO  Registros ····························· custodio
│   │
│   ├── SPAWN  Atribución
│   │   ├── ATÓMICO  Modelo ································ reflejo
│   │   ├── ATÓMICO  Resultado ····························· reflejo
│   │   ├── ATÓMICO  Acciones candidatas ··················· reflejo
│   │   └── ATÓMICO  Distribución ·························· micro-agente
│   │
│   ├── ATÓMICO  Reporting ································· conversor
│   │
│   └── SPAWN  Experimentación
│       ├── ATÓMICO  Hipótesis ······························ reflejo
│       ├── ATÓMICO  Variantes ······························ reflejo
│       ├── ATÓMICO  Métrica objetivo ······················ reflejo
│       ├── ATÓMICO  Datos ································· custodio
│       ├── ATÓMICO  Veredicto ······························ micro-agente
│       └── ATÓMICO  Estado ································ reflejo
│
├── [RESTRICCIONES] — ¿Qué limita la medición?
│   ├── REF     Canales ···································· → marketing-channels
│   ├── REF     Campañas ··································· → marketing-campaigns
│   ├── REF     Presupuesto ································ → marketing-budget
│   └── REF     Contenido ·································· → marketing-content
│
├── [CONTRATO] — ¿Qué promete el módulo?
│   ├── ATÓMICO  Métrica trazable ·························· custodio
│   ├── ATÓMICO  Dato inmutable ···························· reflejo
│   └── ATÓMICO  Experimento cerrado ······················· reflejo
│
├── [NO-OBJETIVOS] — ¿Qué NO es el módulo?
│   ├── ATÓMICO  No ejecuta acciones ······················· (frontera → marketing-campaigns)
│   ├── ATÓMICO  No captura datos del usuario ··············· (frontera → puertos de datos)
│   └── ATÓMICO  No decide estrategia ······················ (frontera → marketing-strategy)
│
└── [PREGUNTAS_ABIERTAS] — [ABIERTO]
    ├── ¿Fuentes de datos: manuales, importadas, API?
    ├── ¿Frecuencia de actualización?
    └── ¿Significancia estadística para experimentos?
```

## Dependencias externas

| Módulo externo | Qué aporta | Cómo se consume |
|---|---|---|
| marketing-channels | Canales activos | Las métricas vienen de canales |
| marketing-campaigns | Acciones | La atribución conecta acciones con resultados |
| marketing-budget | Gasto | El ROI cruza gasto con resultado |
| marketing-content | Piezas | Lo que se mide son piezas de contenido |

## Eventos del módulo (contrato del bus)

| Evento | Dirección | Payload |
|---|---|---|
| `project.activated` | ESCUCHA | `{ project_id }` — restaurar analytics |
| `marketing.analytics.get.request` | ESCUCHA | `{ project_id, filtros? }` |
| `marketing.analytics.get.response` | EMITE | `{ project_id, metricas[], experimentos[], resumen }` |
| `marketing.analytics.update.request` | ESCUCHA | `{ project_id, metricas?, experimentos? }` |
| `marketing.analytics.update.response` | EMITE | `{ project_id, campos_actualizados[] }` |
| `marketing.analytics.actualizado` | EMITE | `{ project_id, campos_actualizados[] }` |
| `marketing.analytics.atribuir.request` | ESCUCHA (blueprint) | `{ project_id, resultado, modelo? }` |
| `marketing.analytics.veredicto.request` | ESCUCHA (blueprint) | `{ project_id, experimento_id }` |

## Store (contrato del dato)

```json
{
  "esquema": "marketing-analytics-v1",
  "metricas": [],
  "experimentos": []
}
```

Cada métrica:

```json
{
  "id": "uuid",
  "nombre": "Tasa de conversión",
  "tipo": "conversiones",
  "fuente": "manual",
  "canal_id": "uuid-canal",
  "registros": [
    { "fecha": "2026-02-15", "valor": 3.2 }
  ]
}
```

Cada experimento:

```json
{
  "id": "uuid",
  "hipotesis": "Cambiar CTA a rojo aumenta clicks un 15%",
  "variantes": [
    { "nombre": "control", "descripcion": "CTA azul actual" },
    { "nombre": "variante_a", "descripcion": "CTA rojo" }
  ],
  "metrica_id": "uuid-metrica",
  "datos": [
    { "variante": "control", "valor": 120 },
    { "variante": "variante_a", "valor": 145 }
  ],
  "veredicto": null,
  "estado": "activo"
}
```

## Reparto de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 12 | Nombre, Tipo, Fuente, Canal asociado, Modelo, Resultado, Acciones candidatas, Hipótesis, Variantes, Métrica objetivo, Estado, Dato inmutable, Experimento cerrado |
| **custodio** | 3 | Registros, Datos, Métrica trazable |
| **micro-agente** | 2 | Distribución (atribución), Veredicto (experimentación) |
| **conversor** | 1 | Reporting |

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas hasta el suelo | 2 |
| Piezas totales | 22 |
| ATÓMICAS con forma | 18 |
| REF | 4 (marketing-channels, marketing-campaigns, marketing-budget, marketing-content) |
| SPAWN residual | 0 |
| [ABIERTO] | 1 (3 preguntas) |

## Lectura del esquema

**marketing-analytics es el módulo más híbrido.** 67% reflejo, 17% custodio, 11% micro-agente, 6% conversor. El reflejo gestiona catálogo y definiciones. El custodio vigila la inmutabilidad de registros y datos. El micro-agente interpreta (atribución de crédito entre acciones y veredicto de experimentos). El conversor transforma datos en reporting legible. Cuatro formas vivas en un solo módulo.
