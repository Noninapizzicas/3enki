# Esquema — Módulo "marketing-relations" (Relación con la audiencia)

## Árbol completo

```
marketing-relations
│
├── [IDENTIDAD] — ¿Qué es la relación?
│   ├── SPAWN  Suscriptores
│   │   ├── ATÓMICO  Nombre/Contacto ·························· reflejo
│   │   ├── ATÓMICO  Canal preferido ·························· reflejo
│   │   ├── ATÓMICO  Segmentos ································ reflejo
│   │   ├── ATÓMICO  Consentimiento ··························· custodio
│   │   ├── ATÓMICO  Preferencias ····························· reflejo
│   │   └── ATÓMICO  Estado ··································· reflejo
│   │
│   └── SPAWN  Interacciones
│       ├── ATÓMICO  Tipo ····································· reflejo
│       ├── ATÓMICO  Canal ···································· reflejo
│       ├── ATÓMICO  Pieza ···································· reflejo
│       ├── ATÓMICO  Fecha ···································· reflejo
│       ├── ATÓMICO  Resultado ································ reflejo
│       └── ATÓMICO  Datos ···································· reflejo
│
├── [RESTRICCIONES] — ¿Qué limita la relación?
│   ├── REF     Audiencia ····································· → marketing-audience
│   ├── REF     Canales ······································· → marketing-channels
│   ├── REF     Contenido ····································· → marketing-content
│   └── REF     Automatización ································ → marketing-automation
│
├── [CONTRATO] — ¿Qué promete el módulo?
│   ├── ATÓMICO  Consentimiento explícito ····················· custodio
│   ├── ATÓMICO  Preferencias respetadas ······················ reflejo
│   └── ATÓMICO  Historial inmutable ·························· custodio
│
├── [NO-OBJETIVOS] — ¿Qué NO es el módulo?
│   ├── ATÓMICO  No produce contenido ························· (frontera → marketing-content)
│   ├── ATÓMICO  No ejecuta envío ····························· (frontera → puertos de envío)
│   ├── ATÓMICO  No segmenta la audiencia ····················· (frontera → marketing-audience)
│   └── ATÓMICO  No decide la frecuencia global ··············· (frontera → marketing-calendar)
│
└── [PREGUNTAS_ABIERTAS] — [ABIERTO]
    ├── ¿Gestión de bounces y quejas?
    ├── ¿Score de engagement por suscriptor?
    └── ¿Preferencias de idioma?
```

## Dependencias externas

| Módulo externo | Qué aporta | Cómo se consume |
|---|---|---|
| marketing-audience | Segmentos | Los suscriptores pertenecen a segmentos |
| marketing-channels | Canales | Las comunicaciones se envían por canales |
| marketing-content | Piezas | Las interacciones usan piezas de contenido |
| marketing-automation | Flujos | Los flujos automáticos disparan comunicaciones |

## Eventos del módulo (contrato del bus)

| Evento | Dirección | Payload |
|---|---|---|
| `project.activated` | ESCUCHA | `{ project_id }` — restaurar suscriptores e interacciones |
| `marketing.relations.get.request` | ESCUCHA | `{ project_id, filtros? }` |
| `marketing.relations.get.response` | EMITE | `{ project_id, suscriptores[], interacciones[], resumen }` |
| `marketing.relations.update.request` | ESCUCHA | `{ project_id, suscriptores?, interacciones? }` |
| `marketing.relations.update.response` | EMITE | `{ project_id, campos_actualizados[] }` |
| `marketing.relations.actualizado` | EMITE | `{ project_id, campos_actualizados[] }` |

## Store (contrato del dato)

```json
{
  "esquema": "marketing-relations-v1",
  "suscriptores": [],
  "interacciones": []
}
```

Cada suscriptor:

```json
{
  "id": "uuid",
  "nombre": "Ana García",
  "contacto": { "email": "ana@ejemplo.com" },
  "canal_preferido": "email",
  "segmentos_ids": ["uuid"],
  "consentimiento": { "fecha": "2024-01-15T10:00:00Z", "origen": "formulario_web", "tipo": "opt_in" },
  "preferencias": { "frecuencia": "semanal", "temas": ["novedades", "ofertas"], "idioma": "es" },
  "estado": "activo"
}
```

Cada interacción:

```json
{
  "id": "uuid",
  "suscriptor_id": "uuid",
  "tipo": "envio",
  "canal_id": "uuid",
  "pieza_id": "uuid",
  "fecha": "2024-01-20T14:30:00Z",
  "resultado": "abierto",
  "datos": {}
}
```

## Reparto de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 12 | Nombre/Contacto, Canal preferido, Segmentos, Preferencias, Estado, Tipo, Canal, Pieza, Fecha, Resultado, Datos, Preferencias respetadas |
| **custodio** | 3 | Consentimiento, Consentimiento explícito, Historial inmutable |

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas hasta el suelo | 2 |
| Piezas totales | 19 |
| ATÓMICAS con forma | 15 |
| REF | 4 (marketing-audience, marketing-channels, marketing-content, marketing-automation) |
| SPAWN residual | 0 |
| [ABIERTO] | 1 (3 preguntas) |

## Lectura del esquema

**marketing-relations es reflejo puro con custodia de consentimiento e historial.** 80% reflejo, 20% custodio. CRUD de suscriptores + append-only de interacciones + state machine determinista. El custodio vigila el consentimiento inmutable y el historial que solo crece. Sin fuzzy, sin blueprint. La relación registra, no interpreta.
