# Esquema — Módulo "marketing-strategy" (Estrategia de Marketing por Proyecto)

## Árbol completo

```
marketing-strategy
│
├── [IDENTIDAD] — ¿Qué es la estrategia?
│   ├── SPAWN  Posicionamiento
│   │   ├── ATÓMICO  Declaración ····················· reflejo
│   │   ├── ATÓMICO  Propuesta de valor ·············· reflejo
│   │   ├── ATÓMICO  Atributos deseados ·············· reflejo
│   │   ├── ATÓMICO  Territorio ······················ reflejo
│   │   ├── ATÓMICO  Credibilidad ···················· custodio
│   │   └── ATÓMICO  Consistencia ···················· custodio
│   │
│   ├── SPAWN  Objetivos
│   │   ├── ATÓMICO  Meta ···························· reflejo
│   │   ├── REF      Métrica ························· → marketing-analytics.métricas
│   │   ├── ATÓMICO  Target ·························· reflejo
│   │   ├── ATÓMICO  Horizonte ······················· reflejo
│   │   ├── ATÓMICO  Prioridad ······················· reflejo
│   │   ├── ATÓMICO  Alineación (obj→negocio) ········ reflejo
│   │   ├── ATÓMICO  Estado ·························· reflejo
│   │   └── ATÓMICO  Criterio de revisión ············ reflejo
│   │
│   └── ATÓMICO  Alineación negocio↔marketing ········ reflejo
│
├── [RESTRICCIONES] — ¿Qué limita la estrategia?
│   ├── ATÓMICO  Conocimiento disponible ············· reflejo
│   ├── REF      Coherencia con marca ················ → marca-cliente.voz
│   ├── REF      Recursos finitos ···················· → marketing-budget + project-profile.recursos
│   └── REF      Identidad del negocio ··············· → project-profile.identidad
│
├── [CONTRATO] — ¿Qué promete la estrategia?
│   ├── ATÓMICO  Dirección clara ····················· reflejo
│   ├── ATÓMICO  Priorización ························ reflejo
│   └── ATÓMICO  Revisabilidad ······················· custodio
│
├── [NO-OBJETIVOS] — ¿Qué NO es la estrategia?
│   ├── ATÓMICO  No es ejecución ····················· reflejo (frontera → marketing-campaigns, marketing-content)
│   ├── ATÓMICO  No es medición ······················ reflejo (frontera → marketing-analytics)
│   └── ATÓMICO  No es la marca ······················ reflejo (frontera → marca-cliente)
│
└── [PREGUNTAS_ABIERTAS] — [ABIERTO]
    ├── ¿Con qué frecuencia se revisa la estrategia?
    ├── ¿Quién aprueba la estrategia?
    ├── ¿Se versiona o se edita in-place?
    ├── ¿Hay estrategia por defecto para proyectos que no la declaran?
    └── ¿Cómo se valida que la audiencia percibe el posicionamiento deseado?
```

## Dependencias externas (lo que este módulo CONSUME de otros)

| Módulo externo | Qué aporta | Cómo se consume |
|---|---|---|
| project-profile | Identidad del negocio (qué es, qué vende) | La estrategia se ancla al propósito del proyecto |
| marca-cliente | Voz de marca (tono, valores) | La estrategia no contradice la voz |
| marketing-budget | Presupuesto disponible | La estrategia se adapta a los recursos |
| marketing-analytics | Catálogo de métricas (KPIs) | Los objetivos eligen su métrica de ahí |

## Eventos del módulo (contrato del bus)

| Evento | Dirección | Payload |
|---|---|---|
| `project.activated` | ESCUCHA | `{ project_id }` — restaurar estrategia del proyecto |
| `marketing.strategy.get.request` | ESCUCHA | `{ project_id }` |
| `marketing.strategy.get.response` | EMITE | `{ project_id, estrategia }` |
| `marketing.strategy.update.request` | ESCUCHA | `{ project_id, posicionamiento?, objetivos? }` |
| `marketing.strategy.update.response` | EMITE | `{ project_id, estrategia, campos_actualizados[] }` |
| `marketing.strategy.actualizada` | EMITE | `{ project_id, campos_actualizados[] }` — propiocepción + downstream |

## Store (contrato del dato)

```json
{
  "esquema": "marketing-strategy-v1",
  "posicionamiento": {
    "declaracion": null,
    "propuesta_valor": null,
    "atributos_deseados": [],
    "territorio": {
      "categoria": null,
      "vecinos": []
    },
    "credibilidad": {
      "evidencias": []
    },
    "consistencia": {
      "vigente_desde": null,
      "historial_giros": []
    }
  },
  "objetivos": [],
  "alineacion_negocio": [],
  "conocimiento_disponible": {
    "sabemos": [],
    "no_sabemos": []
  },
  "revisiones": {
    "proxima": null,
    "historial": []
  }
}
```

Donde cada objetivo es:

```json
{
  "id": "uuid",
  "meta": "aumentar tráfico web",
  "target": { "valor": 5000, "unidad": "visitas/mes", "direccion": "subir" },
  "horizonte": { "fecha": "2026-12-31", "tipo": "fijo" },
  "prioridad": 1,
  "alineacion": "propósito: visibilidad del negocio",
  "estado": "activo",
  "criterio_revision": {
    "umbral_alerta": 2500,
    "fecha_revision": "2026-10-15",
    "accion_si_falla": "revisar canales"
  }
}
```

## Reparto de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 18 | Declaración, Propuesta de valor, Atributos deseados, Territorio, Meta, Target, Horizonte, Prioridad, Alineación, Estado, Criterio de revisión, Alineación negocio↔marketing, Conocimiento disponible, Dirección clara, Priorización, No es ejecución, No es medición, No es la marca |
| **custodio** | 3 | Credibilidad, Consistencia, Revisabilidad |

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas hasta el suelo | 2 |
| Piezas totales | 26 |
| ATÓMICAS con forma (diseccionadas) | 21 |
| REF (consume de otros módulos) | 4 (marca-cliente.voz, marketing-budget, project-profile.identidad, marketing-analytics.métricas) |
| SPAWN residual | 0 (convergió en pasada 2) |
| [ABIERTO] | 1 (5 preguntas) |

## Lectura del esquema

**marketing-strategy es el módulo más determinista del ecosistema marketing.** 86% reflejo, 14% custodio, cero fuzzy. El módulo no interpreta ni sugiere — almacena las decisiones del dueño y valida que estén completas, alineadas y revisables. Su valor está en la DISCIPLINA, no en la inteligencia.

El posicionamiento es el ancla (6 piezas: declaración, propuesta, atributos, territorio, credibilidad, consistencia). Los objetivos son la brújula (7 piezas con máquina de estados). El resto son invariantes del módulo (alineación, dirección, priorización) y fronteras con vecinos.

Las 5 preguntas abiertas son política del dueño — se cierran en el onboarding, no en el código.
