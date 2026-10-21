# Esquema — Módulo "marketing-channels" (Canales de Marketing por Proyecto)

## Árbol completo

```
marketing-channels
│
├── [IDENTIDAD] — ¿Qué son los canales?
│   ├── SPAWN  Canales Propios
│   │   ├── ATÓMICO  Registro ··························· reflejo
│   │   ├── ATÓMICO  Estado operativo ··················· reflejo
│   │   ├── ATÓMICO  Activos vinculados ················· reflejo
│   │   ├── ATÓMICO  Frecuencia esperada ················ reflejo
│   │   └── ATÓMICO  Responsable ························ reflejo
│   │
│   ├── SPAWN  Canales Ganados
│   │   ├── ATÓMICO  Registro ··························· reflejo
│   │   ├── ATÓMICO  Estado de salud ···················· custodio
│   │   ├── ATÓMICO  Fuentes observadas ················· custodio
│   │   └── ATÓMICO  Frecuencia observada ··············· reflejo
│   │
│   ├── SPAWN  Canales Pagados
│   │   ├── ATÓMICO  Registro ··························· reflejo
│   │   ├── ATÓMICO  Estado operativo ··················· reflejo
│   │   ├── ATÓMICO  Presupuesto asignado ··············· reflejo
│   │   ├── ATÓMICO  ROI esperado ······················· reflejo
│   │   └── ATÓMICO  Plataforma/Cuenta ·················· reflejo
│   │
│   ├── SPAWN  Canales Compartidos
│   │   ├── ATÓMICO  Registro ··························· reflejo
│   │   ├── ATÓMICO  Estado de presencia ················ reflejo
│   │   ├── ATÓMICO  Audiencia en el canal ·············· custodio
│   │   └── ATÓMICO  Engagement declarado ··············· custodio
│   │
│   └── ATÓMICO  Mapa de Canales ························ reflejo
│
├── [RESTRICCIONES] — ¿Qué limita los canales?
│   ├── REF     Recursos finitos ························ → marketing-budget
│   ├── REF     Coherencia de marca ····················· → marca-cliente.voz
│   ├── ATÓMICO Capacidad operativa ····················· reflejo
│   └── REF     Audiencia alcanzable ···················· → marketing-audience
│
├── [CONTRATO] — ¿Qué promete el módulo?
│   ├── ATÓMICO  Inventario completo ···················· reflejo
│   ├── ATÓMICO  Estado vivo ···························· reflejo
│   └── ATÓMICO  Priorización ··························· reflejo
│
├── [NO-OBJETIVOS] — ¿Qué NO es el módulo?
│   ├── ATÓMICO  No ejecuta en el canal ················· (frontera → marketing-campaigns, publicador)
│   ├── ATÓMICO  No mide rendimiento ···················· (frontera → marketing-analytics)
│   └── ATÓMICO  No gestiona credenciales ··············· (frontera → credential-manager)
│
└── [PREGUNTAS_ABIERTAS] — [ABIERTO]
    ├── ¿Se auto-detectan canales desde presencia digital?
    ├── ¿Un canal puede pertenecer a más de una clasificación?
    ├── ¿Hay canales heredados del tipo de negocio?
    └── ¿La frecuencia es del canal o de la campaña?
```

## Dependencias externas (lo que este módulo CONSUME de otros)

| Módulo externo | Qué aporta | Cómo se consume |
|---|---|---|
| marca-cliente | Presencia digital (canales activos) | Semilla inicial de canales propios/compartidos |
| marketing-budget | Presupuesto disponible | Validar techo de asignación por canal pagado |
| marketing-audience | Segmentos de audiencia | Saber si la audiencia está en un canal |
| credential-manager | Credenciales de plataformas | Acceso a APIs de canales pagados/compartidos |
| marketing-strategy | Objetivos y posicionamiento | Priorizar canales según la estrategia |

## Eventos del módulo (contrato del bus)

| Evento | Dirección | Payload |
|---|---|---|
| `project.activated` | ESCUCHA | `{ project_id }` — restaurar canales del proyecto |
| `marketing.channels.get.request` | ESCUCHA | `{ project_id, clasificacion? }` |
| `marketing.channels.get.response` | EMITE | `{ project_id, canales[] }` |
| `marketing.channels.update.request` | ESCUCHA | `{ project_id, canales[] }` |
| `marketing.channels.update.response` | EMITE | `{ project_id, canales[], campos_actualizados[] }` |
| `marketing.channels.actualizado` | EMITE | `{ project_id, canal_id, campos_actualizados[] }` — propiocepción + downstream |

## Store (contrato del dato)

```json
{
  "esquema": "marketing-channels-v1",
  "canales": [],
  "capacidad_operativa": null,
  "prioridades": []
}
```

Donde cada canal es:

```json
{
  "id": "uuid",
  "nombre": "Instagram",
  "clasificacion": "compartido",
  "tipo": "red-social",
  "localizador": "@mi_proyecto",
  "fecha_alta": "2026-01-15",
  "estado": "activo",
  "responsable": null,
  "frecuencia": { "valor": "semanal", "origen": "declarada" },
  "presupuesto": null,
  "roi_esperado": null,
  "plataforma_cuenta": null,
  "activos_vinculados": [],
  "observaciones": {
    "salud": null,
    "fuentes": [],
    "audiencia": null,
    "engagement": null
  },
  "prioridad": 1
}
```

Los campos que no aplican a la clasificación quedan `null`:
- **propios**: usan responsable, activos_vinculados, frecuencia (declarada)
- **ganados**: usan observaciones.salud, observaciones.fuentes, frecuencia (observada)
- **pagados**: usan presupuesto, roi_esperado, plataforma_cuenta
- **compartidos**: usan observaciones.audiencia, observaciones.engagement

## Reparto de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 19 | Registro (×4), Estado operativo (×3), Activos vinculados, Frecuencia esperada, Responsable, Frecuencia observada, Presupuesto asignado, ROI esperado, Plataforma/Cuenta, Mapa de Canales, Capacidad operativa, Inventario completo, Estado vivo, Priorización |
| **custodio** | 4 | Estado de salud, Fuentes observadas, Audiencia en el canal, Engagement declarado |

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas hasta el suelo | 2 |
| Piezas totales | 26 |
| ATÓMICAS con forma (diseccionadas) | 23 |
| REF (consume de otros módulos) | 3 (marketing-budget, marca-cliente.voz, marketing-audience) |
| SPAWN residual | 0 (convergió en pasada 2) |
| [ABIERTO] | 1 (4 preguntas) |

## Lectura del esquema

**marketing-channels es un catálogo vivo con vigilancia selectiva.** 83% reflejo, 17% custodio, cero fuzzy. El módulo registra canales, valida sus estados y vigila 4 métricas que cambian con el tiempo (salud de ganados, fuentes ganadas, audiencia y engagement de compartidos).

El diseño unificado (un solo tipo `canal` con campos opcionales por clasificación) evita 4 stores separados. La clasificación (propio/ganado/pagado/compartido) determina qué campos son relevantes, pero el registro y el estado siguen la misma anatomía.

La state machine (en_setup → activo → pausado → retirado) aplica a propios, pagados y compartidos. Los ganados no tienen estado operable — tienen estado de salud (creciendo/estable/decayendo/desconocido) porque no se controlan, se observan.
