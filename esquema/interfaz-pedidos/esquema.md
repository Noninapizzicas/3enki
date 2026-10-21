# Esquema — Interfaz de operación de pedidos

## Árbol completo

```
Interfaz de operación de pedidos
│
├── [IDENTIDAD]
│   ├── SPAWN  Ciclo de vida del pedido
│   │   ├── ATÓMICO  Estado (reflejo)
│   │   ├── ATÓMICO  Transición (reflejo)
│   │   ├── ATÓMICO  Estado terminal (reflejo)
│   │   └── ATÓMICO  Estado compuesto (reflejo)
│   ├── SPAWN  Operaciones
│   │   ├── ATÓMICO  Op. de creación (conversor) — puerto: ejecutar(comando)
│   │   ├── ATÓMICO  Op. de composición (conversor) — puerto: ejecutar(comando)
│   │   ├── ATÓMICO  Op. de transición (conversor) — puerto: ejecutar(comando)
│   │   └── ATÓMICO  Op. de consulta (conversor) — puerto: consultar(criterio)
│   ├── SPAWN  Visibilidad
│   │   ├── ATÓMICO  Lista de pedidos (reflejo) — puerto: consultar(criterio)
│   │   ├── ATÓMICO  Detalle de pedido (reflejo) — puerto: consultar(id)
│   │   ├── ATÓMICO  Eventos en vivo (puente) — puerto: observar(señal)
│   │   └── ATÓMICO  Indicadores de estado (reflejo)
│   └── SPAWN  Contexto operativo
│       ├── ATÓMICO  Proyecto implícito (reflejo) — puerto: contexto()
│       └── ATÓMICO  Inyección de contexto (reflejo)
│
├── [RESTRICCIONES]
│   ├── ATÓMICO  Grafo de estados (reflejo)
│   ├── SPAWN  Dependencias entre operaciones
│   │   ├── ATÓMICO  Cadena de ids (reflejo)
│   │   ├── REF      Prerequisito de estado → Grafo de estados
│   │   └── REF      Datos de otra entidad → Entidades referenciadas
│   ├── SPAWN  Entidades referenciadas
│   │   ├── ATÓMICO  Selector de entidad (puente) — puerto: consultar(dominio, criterio)
│   │   └── ATÓMICO  Resolución de referencia (conversor) — puerto: consultar(dominio, id)
│   └── ATÓMICO  Guardas de transición (reflejo)
│
├── [CONTRATO]
│   ├── SPAWN  Feedback de operación
│   │   ├── ATÓMICO  Resultado exitoso (reflejo)
│   │   ├── ATÓMICO  Resultado fallido (reflejo)
│   │   └── REF      Propagación al contexto → Reflejo de estado en vivo
│   ├── SPAWN  Reflejo de estado en vivo
│   │   ├── ATÓMICO  Suscripción a eventos (puente) — puerto: observar(señal)
│   │   ├── ATÓMICO  Reconciliación (conversor)
│   │   └── ATÓMICO  Indicador de frescura (reflejo)
│   └── SPAWN  Guía de flujo
│       ├── ATÓMICO  Agrupación por fase (reflejo)
│       ├── ATÓMICO  Acción primaria (micro-agente)
│       └── ATÓMICO  Flujo encadenado (micro-agente)
│
├── [NO-OBJETIVOS]
│   ├── ATÓMICO  Operador vs Cliente (reflejo)
│   └── ATÓMICO  Control vs Análisis (reflejo)
│
└── [PREGUNTAS_ABIERTAS] — [ABIERTO]
```

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas hasta el suelo | 2 |
| Piezas totales | 29 |
| ATÓMICAS (con disección) | 25 |
| REF (deduplicadas) | 3 |
| [ABIERTO] | 1 (PREGUNTAS_ABIERTAS) |
| SPAWN (convergió) | 0 |

## Reparto de formas

| Forma | Cantidad | % |
|---|---|---|
| reflejo | 19 | 66% |
| conversor | 6 | 21% |
| puente | 3 | 10% |
| micro-agente | 2 | 7% |
| custodio | 0 | 0% |

## Puertos abiertos (5)

| Puerto | Adaptador Enki |
|---|---|
| `ejecutar(comando)` | mqttRequest(dominio, accion, payload) |
| `consultar(criterio)` | mqttRequest(dominio, accion, filtros) |
| `consultar(id)` | mqttRequest(dominio, 'get', { id }) |
| `observar(señal)` | subscribe(evento, callback) |
| `contexto()` | activeProjectId (store) |

## Lo que el blueprint actual CUBRE vs lo que FALTA

| Pieza | Blueprint actual | Falta |
|---|---|---|
| Estado, Transición, Grafo de estados | — | **toda la sección** — el blueprint no tiene `estados` |
| Op. creación/composición/transición/consulta | formulario + acciones (zona 1-2) | sin clasificar por tipo |
| Lista de pedidos | datos (zona 4) | ok |
| Detalle de pedido | — | **no existe** vista de detalle |
| Eventos en vivo | estadosVivos (zona 3) | ok |
| Indicadores de estado | — | **no existe** mapping estado→visual |
| Proyecto implícito + Inyección | inyección de project_id | ok (fix PR #384) |
| Cadena de ids | — | **no existe** enlace output→input entre ops |
| Selector de entidad | tipo 'ref' en args | ok |
| Resolución de referencia | ref_label en args | ok |
| Guardas de transición | — | **no existe** |
| Feedback (éxito/fallo) | ResultView componente | ok (básico) |
| Suscripción + Reconciliación | refresh_on en datos | ok (parcial — solo recarga tabla) |
| Agrupación por fase | — | **no existe** |
| Acción primaria | — | **no existe** |
| Flujo encadenado | — | **no existe** |

**Resumen: 8 piezas cubiertas, 7 piezas faltan.**
