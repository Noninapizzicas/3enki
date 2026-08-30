# Esquema — Módulo "marketing-calendar" (Calendario editorial de marketing)

## Árbol completo

```
marketing-calendar
│
├── [IDENTIDAD] — ¿Qué es el calendario?
│   ├── SPAWN  Planificación
│   │   ├── ATÓMICO  Título ································ reflejo
│   │   ├── ATÓMICO  Tipo de acción ························ reflejo
│   │   ├── ATÓMICO  Canal destino ························· reflejo
│   │   ├── ATÓMICO  Fecha programada ······················ reflejo
│   │   ├── ATÓMICO  Responsable ··························· reflejo
│   │   ├── ATÓMICO  Estado ································ reflejo
│   │   └── ATÓMICO  Notas ································· reflejo
│   │
│   ├── SPAWN  Estacionalidad
│   │   ├── ATÓMICO  Nombre del evento ····················· reflejo
│   │   ├── ATÓMICO  Tipo de marca ························· reflejo
│   │   ├── ATÓMICO  Periodo ······························· reflejo
│   │   ├── ATÓMICO  Recurrencia ··························· reflejo
│   │   └── ATÓMICO  Impacto ······························· reflejo
│   │
│   └── SPAWN  Cadencia
│       ├── ATÓMICO  Canal ································· reflejo
│       ├── ATÓMICO  Frecuencia ···························· reflejo
│       ├── ATÓMICO  Unidad temporal ······················· reflejo
│       └── ATÓMICO  Activa ································ reflejo
│
├── [RESTRICCIONES] — ¿Qué limita el calendario?
│   ├── REF     Canales activos ···························· → marketing-channels
│   ├── REF     Presupuesto ································ → marketing-budget
│   ├── REF     Estrategia ································· → marketing-strategy
│   └── REF     Audiencia ·································· → marketing-audience
│
├── [CONTRATO] — ¿Qué promete el módulo?
│   ├── ATÓMICO  Agenda completa ··························· custodio
│   ├── ATÓMICO  Sin huecos ································ custodio
│   └── ATÓMICO  Visibilidad temporal ······················ reflejo
│
├── [NO-OBJETIVOS] — ¿Qué NO es el módulo?
│   ├── ATÓMICO  No produce contenido ······················ (frontera → marketing-content)
│   ├── ATÓMICO  No ejecuta campañas ······················· (frontera → marketing-campaigns)
│   └── ATÓMICO  No mide resultados ························ (frontera → marketing-analytics)
│
└── [PREGUNTAS_ABIERTAS] — [ABIERTO]
    ├── ¿Granularidad mínima: día, hora, franja?
    ├── ¿Recurrencia automática?
    ├── ¿Notificación de conflicto de fechas?
    └── ¿Vista semanal/mensual/trimestral?
```

## Dependencias externas

| Módulo externo | Qué aporta | Cómo se consume |
|---|---|---|
| marketing-channels | Canales activos | Solo se planifica en canales que existen |
| marketing-budget | Presupuesto | La planificación consume partidas del presupuesto |
| marketing-strategy | Objetivos | Los objetivos dictan prioridades del calendario |
| marketing-audience | Segmentos | El contenido se dirige a audiencias definidas |

## Eventos del módulo (contrato del bus)

| Evento | Dirección | Payload |
|---|---|---|
| `project.activated` | ESCUCHA | `{ project_id }` — restaurar calendario |
| `marketing.calendar.get.request` | ESCUCHA | `{ project_id, rango? }` |
| `marketing.calendar.get.response` | EMITE | `{ project_id, entradas[], marcas[], cadencias[], resumen }` |
| `marketing.calendar.update.request` | ESCUCHA | `{ project_id, entradas?, marcas?, cadencias? }` |
| `marketing.calendar.update.response` | EMITE | `{ project_id, campos_actualizados[] }` |
| `marketing.calendar.actualizado` | EMITE | `{ project_id, campos_actualizados[] }` |

## Store (contrato del dato)

```json
{
  "esquema": "marketing-calendar-v1",
  "entradas": [],
  "marcas": [],
  "cadencias": []
}
```

Cada entrada:

```json
{
  "id": "uuid",
  "titulo": "Newsletter febrero",
  "tipo": "publicacion",
  "canal_id": "uuid-canal",
  "fecha": "2026-02-15",
  "responsable": "equipo-contenido",
  "estado": "programado",
  "notas": ""
}
```

Cada marca estacional:

```json
{
  "id": "uuid",
  "nombre": "Black Friday",
  "tipo": "festividad",
  "periodo": { "inicio": "2026-11-25", "fin": "2026-11-29" },
  "recurrencia": "anual",
  "impacto": "alto"
}
```

Cada cadencia:

```json
{
  "id": "uuid",
  "canal_id": "uuid-canal",
  "frecuencia": 2,
  "unidad": "semanal",
  "activa": true
}
```

## Reparto de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 17 | Título, Tipo de acción, Canal destino, Fecha programada, Responsable, Estado, Notas, Nombre del evento, Tipo de marca, Periodo, Recurrencia, Impacto, Canal, Frecuencia, Unidad temporal, Activa, Visibilidad temporal |
| **custodio** | 2 | Agenda completa, Sin huecos |

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas hasta el suelo | 2 |
| Piezas totales | 23 |
| ATÓMICAS con forma | 19 |
| REF | 4 (marketing-channels, marketing-budget, marketing-strategy, marketing-audience) |
| SPAWN residual | 0 |
| [ABIERTO] | 1 (4 preguntas) |

## Lectura del esquema

**marketing-calendar es agenda pura.** 89% reflejo, 11% custodio. El reflejo declara el plan (qué, cuándo, dónde, quién); el custodio vigila la completitud (toda entrada completa) y la coherencia (cadencia comprometida tiene entradas que la cubren). Sin fuzzy, sin blueprint, sin conversor. El calendario organiza el tiempo del marketing — no produce, no ejecuta, no mide.
