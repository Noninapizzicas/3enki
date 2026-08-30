# Esquema — Módulo "marketing-audience" (Audiencia de Marketing por Proyecto)

## Árbol completo

```
marketing-audience
│
├── [IDENTIDAD] — ¿Qué es la audiencia?
│   ├── SPAWN  Segmentos
│   │   ├── ATÓMICO  Nombre ····························· reflejo
│   │   ├── ATÓMICO  Criterios demográficos ············· reflejo
│   │   ├── ATÓMICO  Necesidad principal ················ reflejo
│   │   ├── ATÓMICO  Comportamiento ····················· reflejo
│   │   ├── ATÓMICO  Tamaño estimado ···················· reflejo
│   │   ├── ATÓMICO  Prioridad ·························· reflejo
│   │   └── ATÓMICO  Estado ····························· reflejo
│   │
│   ├── SPAWN  Personas
│   │   ├── ATÓMICO  Nombre y perfil ···················· micro-agente
│   │   ├── ATÓMICO  Segmento vinculado ················· reflejo
│   │   ├── ATÓMICO  Necesidad ·························· micro-agente
│   │   ├── ATÓMICO  Barrera ···························· micro-agente
│   │   ├── ATÓMICO  Motivación ························· micro-agente
│   │   ├── ATÓMICO  Canal preferido ···················· reflejo
│   │   ├── ATÓMICO  Mensaje clave ······················ micro-agente
│   │   └── ATÓMICO  Origen ····························· reflejo
│   │
│   └── ATÓMICO  Mapa de audiencia ······················ reflejo
│
├── [RESTRICCIONES] — ¿Qué limita la audiencia?
│   ├── REF     Identidad del negocio ··················· → project-profile
│   ├── REF     Posicionamiento ························· → marketing-strategy
│   ├── ATÓMICO Datos disponibles ······················· reflejo
│   └── REF     Presencia en canales ···················· → marketing-channels
│
├── [CONTRATO] — ¿Qué promete el módulo?
│   ├── ATÓMICO  Segmentos completos ···················· reflejo
│   ├── ATÓMICO  Personas accionables ··················· reflejo
│   └── ATÓMICO  Trazabilidad ··························· reflejo
│
├── [NO-OBJETIVOS] — ¿Qué NO es el módulo?
│   ├── ATÓMICO  No es CRM ····························· (frontera → marca-cliente.clientes)
│   ├── ATÓMICO  No mide comportamiento ················ (frontera → marketing-analytics)
│   └── ATÓMICO  No decide el mensaje ·················· (frontera → marketing-content)
│
└── [PREGUNTAS_ABIERTAS] — [ABIERTO]
    ├── ¿Se auto-generan personas desde datos de clientes?
    ├── ¿Cuántos segmentos puede tener un proyecto?
    ├── ¿Las personas se validan contra datos reales?
    └── ¿Un segmento puede tener 0 personas?
```

## Dependencias externas (lo que este módulo CONSUME de otros)

| Módulo externo | Qué aporta | Cómo se consume |
|---|---|---|
| project-profile | Identidad del negocio (qué es, qué vende) | La audiencia se deriva de lo que el proyecto ofrece |
| marketing-strategy | Posicionamiento y objetivos | Determina a quién le habla el proyecto |
| marketing-channels | Canales disponibles | Filtra qué audiencia es alcanzable |
| marca-cliente | Clientes reales (datos de contacto) | Fuente de datos para validar segmentos y enriquecer personas |

## Eventos del módulo (contrato del bus)

| Evento | Dirección | Payload |
|---|---|---|
| `project.activated` | ESCUCHA | `{ project_id }` — restaurar audiencia del proyecto |
| `marketing.audience.get.request` | ESCUCHA | `{ project_id, tipo?: 'segmentos'\|'personas' }` |
| `marketing.audience.get.response` | EMITE | `{ project_id, segmentos[], personas[] }` |
| `marketing.audience.update.request` | ESCUCHA | `{ project_id, segmentos?, personas? }` |
| `marketing.audience.update.response` | EMITE | `{ project_id, segmentos?, personas?, campos_actualizados[] }` |
| `marketing.audience.generar-persona.request` | ESCUCHA | `{ project_id, segmento_id }` — blueprint: genera persona desde segmento |
| `marketing.audience.generar-persona.response` | EMITE | `{ project_id, persona }` |
| `marketing.audience.actualizada` | EMITE | `{ project_id, campos_actualizados[] }` — propiocepción + downstream |

## Store (contrato del dato)

```json
{
  "esquema": "marketing-audience-v1",
  "segmentos": [],
  "personas": [],
  "datos_disponibles": null
}
```

Donde cada segmento es:

```json
{
  "id": "uuid",
  "nombre": "Familias urbanas",
  "criterios": {
    "edad": "30-45",
    "genero": null,
    "ubicacion": "ciudades > 100k",
    "nivel_socioeconomico": "medio-alto"
  },
  "necesidad": "alimentación saludable y rápida para hijos",
  "comportamiento": {
    "frecuencia_compra": "semanal",
    "canales_usados": ["instagram", "web"],
    "sensibilidad_precio": "media"
  },
  "tamano_estimado": 15000,
  "prioridad": 1,
  "estado": "activo"
}
```

Y cada persona es:

```json
{
  "id": "uuid",
  "segmento_id": "uuid-del-segmento",
  "nombre": "María García",
  "perfil": "Madre de 2, 38 años, trabaja media jornada, vive en barrio residencial",
  "necesidad": "menú escolar sin gluten para su hijo celíaco",
  "barrera": "desconfianza en que un servicio externo entienda las restricciones alimentarias",
  "motivacion": "ver a su hijo comer con normalidad en el cole",
  "canal_preferido": "instagram",
  "mensaje_clave": "diseñado por nutricionistas que entienden cada restricción",
  "origen": "generada"
}
```

## Partición híbrida (reflejo + blueprint)

| Mitad | Responsabilidad | Piezas |
|---|---|---|
| **Reflejo** (index.js) | CRUD segmentos, CRUD manual personas, mapa, state machine, validaciones | 15 piezas reflejo |
| **Blueprint** (marketing-audience.blueprint.json) | Generar personas desde datos de segmento | 5 piezas micro-agente |

## Reparto de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 15 | Nombre, Criterios demográficos, Necesidad principal, Comportamiento, Tamaño estimado, Prioridad, Estado, Segmento vinculado, Canal preferido, Origen, Mapa de audiencia, Datos disponibles, Segmentos completos, Personas accionables, Trazabilidad |
| **micro-agente** | 5 | Nombre y perfil, Necesidad (persona), Barrera, Motivación, Mensaje clave |

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas hasta el suelo | 2 |
| Piezas totales | 23 |
| ATÓMICAS con forma (diseccionadas) | 20 |
| REF (consume de otros módulos) | 3 (project-profile, marketing-strategy, marketing-channels) |
| SPAWN residual | 0 (convergió en pasada 2) |
| [ABIERTO] | 1 (4 preguntas) |

## Lectura del esquema

**marketing-audience es el primer módulo híbrido del ecosistema marketing.** 75% reflejo, 25% micro-agente. La partición es limpia: los segmentos son catálogo puro (el dueño declara); las personas son síntesis (el LLM interpreta datos y genera narrativa accionable).

La clave del diseño es que las personas **también pueden escribirse a mano** (origen: 'manual') — el reflejo las almacena igual. El blueprint solo se invoca cuando el dueño pide generar una persona desde un segmento. Así el módulo funciona al 100% sin LLM (solo segmentos + personas manuales) y el blueprint es un acelerador, no una dependencia.
