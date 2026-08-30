# Esquema — Módulo "marketing-competitors" (Competencia de Marketing por Proyecto)

## Árbol completo

```
marketing-competitors
│
├── [IDENTIDAD] — ¿Qué es la competencia?
│   ├── SPAWN  Registro de competidores
│   │   ├── ATÓMICO  Nombre ····························· reflejo
│   │   ├── ATÓMICO  Tipo ······························· reflejo
│   │   ├── ATÓMICO  Descripción ························ reflejo
│   │   ├── ATÓMICO  Fortalezas ························· reflejo
│   │   ├── ATÓMICO  Debilidades ························ reflejo
│   │   ├── ATÓMICO  Canales activos ···················· reflejo
│   │   ├── ATÓMICO  URL / Localizador ·················· reflejo
│   │   └── ATÓMICO  Estado ····························· reflejo
│   │
│   ├── SPAWN  Monitorización
│   │   ├── ATÓMICO  Observación ························ custodio
│   │   ├── ATÓMICO  Tipo de señal ······················ reflejo
│   │   ├── ATÓMICO  Frecuencia de revisión ············· reflejo
│   │   └── ATÓMICO  Alerta de cambio ··················· custodio
│   │
│   ├── SPAWN  Benchmarking
│   │   ├── ATÓMICO  Dimensión ·························· reflejo
│   │   ├── ATÓMICO  Puntuación propia ·················· reflejo
│   │   ├── ATÓMICO  Puntuación competidor ·············· reflejo
│   │   └── ATÓMICO  Comparativa ························ conversor
│   │
│   ├── ATÓMICO  Diferenciación ························· reflejo
│   └── ATÓMICO  Mapa competitivo ······················· reflejo
│
├── [RESTRICCIONES] — ¿Qué limita la competencia?
│   ├── REF     Posicionamiento propio ·················· → marketing-strategy
│   ├── REF     Territorio ····························· → marketing-strategy.posicionamiento.territorio
│   ├── ATÓMICO Información accesible ··················· reflejo
│   └── REF     Canales donde competimos ················ → marketing-channels
│
├── [CONTRATO] — ¿Qué promete el módulo?
│   ├── ATÓMICO  Registro completo ······················ reflejo
│   ├── ATÓMICO  Vigilancia viva ························ reflejo
│   ├── ATÓMICO  Comparativa actualizable ··············· reflejo
│   └── ATÓMICO  Diferenciación trazable ················ reflejo
│
├── [NO-OBJETIVOS] — ¿Qué NO es el módulo?
│   ├── ATÓMICO  No investiga activamente ··············· (frontera → skills/herramientas externas)
│   ├── ATÓMICO  No define la estrategia ················ (frontera → marketing-strategy)
│   └── ATÓMICO  No mide nuestro rendimiento ············ (frontera → marketing-analytics)
│
└── [PREGUNTAS_ABIERTAS] — [ABIERTO]
    ├── ¿Directos e indirectos en el mismo registro?
    ├── ¿Se alimenta desde skills de investigación?
    ├── ¿Dimensiones de benchmarking fijas o libres?
    └── ¿Competidores aspiracionales?
```

## Dependencias externas (lo que este módulo CONSUME de otros)

| Módulo externo | Qué aporta | Cómo se consume |
|---|---|---|
| marketing-strategy | Posicionamiento y territorio | Ancla la diferenciación y define quién es competidor directo |
| marketing-channels | Canales activos del proyecto | Filtra en qué canales se observa la competencia |

## Eventos del módulo (contrato del bus)

| Evento | Dirección | Payload |
|---|---|---|
| `project.activated` | ESCUCHA | `{ project_id }` — restaurar competidores del proyecto |
| `marketing.competitors.get.request` | ESCUCHA | `{ project_id, competidor_id? }` |
| `marketing.competitors.get.response` | EMITE | `{ project_id, competidores[], dimensiones[], comparativa? }` |
| `marketing.competitors.update.request` | ESCUCHA | `{ project_id, competidores?, observaciones?, dimensiones?, puntuaciones? }` |
| `marketing.competitors.update.response` | EMITE | `{ project_id, campos_actualizados[] }` |
| `marketing.competitors.actualizado` | EMITE | `{ project_id, campos_actualizados[] }` — propiocepción + downstream |

## Store (contrato del dato)

```json
{
  "esquema": "marketing-competitors-v1",
  "competidores": [],
  "observaciones": [],
  "dimensiones": [],
  "puntuaciones": [],
  "diferenciacion": [],
  "info_accesible": null
}
```

Donde cada competidor es:

```json
{
  "id": "uuid",
  "nombre": "Competidor A",
  "tipo": "directo",
  "descripcion": "Pizzería artesanal en el mismo barrio",
  "fortalezas": ["ubicación céntrica", "precio bajo"],
  "debilidades": ["carta reducida", "sin delivery"],
  "canales_activos": ["instagram", "tienda-fisica"],
  "url": "https://competidora.com",
  "estado": "vigilado",
  "frecuencia_revision": "mensual"
}
```

Cada observación:

```json
{
  "id": "uuid",
  "competidor_id": "uuid",
  "fecha": "2026-03-15T10:00:00Z",
  "tipo_senal": "cambio_precio",
  "contenido": "Bajó el precio del menú del día de 12€ a 9.50€",
  "alerta": false
}
```

Cada dimensión de benchmarking:

```json
{
  "id": "uuid",
  "nombre": "Precio menú",
  "descripcion": "Precio medio del menú del día"
}
```

Cada puntuación:

```json
{
  "sujeto_id": "uuid-proyecto-o-competidor",
  "sujeto_tipo": "proyecto",
  "dimension_id": "uuid",
  "valor": 11.50,
  "fecha": "2026-03-01"
}
```

## Reparto de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 20 | Nombre, Tipo, Descripción, Fortalezas, Debilidades, Canales activos, URL, Estado, Tipo de señal, Frecuencia de revisión, Dimensión, Puntuación propia, Puntuación competidor, Diferenciación, Mapa competitivo, Información accesible, Registro completo, Vigilancia viva, Comparativa actualizable, Diferenciación trazable |
| **custodio** | 2 | Observación, Alerta de cambio |
| **conversor** | 1 | Comparativa |

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas hasta el suelo | 2 |
| Piezas totales | 26 |
| ATÓMICAS con forma (diseccionadas) | 23 |
| REF (consume de otros módulos) | 3 (marketing-strategy ×2, marketing-channels) |
| SPAWN residual | 0 (convergió en pasada 2) |
| [ABIERTO] | 1 (4 preguntas) |

## Lectura del esquema

**marketing-competitors es un catálogo con vigilancia y comparador integrado.** 87% reflejo, 9% custodio, 4% conversor. Sin fuzzy — el módulo registra lo que el dueño sabe, vigila lo que cambia y compara mecánicamente.

El conversor (benchmarking.comparativa) es una función pura que vive dentro del reflejo JS: dados los inputs (puntuaciones propias + ajenas × dimensiones), calcula posición relativa y diferencia. No necesita LLM ni blueprint.

Las observaciones (custodio) se ACUMULAN — no se reemplazan. Esto es lo que distingue monitorización de registro: el registro dice QUÉ es el competidor (estático), las observaciones dicen QUÉ HIZO (temporal).
