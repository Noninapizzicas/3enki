# Esquema — Interfaz de pedidos (dos vías)

## Árbol completo

```
Interfaz de pedidos
│
├── [IDENTIDAD]
│   ├── SPAWN  Vía Operativa (crear/editar)
│   │   ├── ATÓMICO  Iniciar pedido (conversor) — puerto: ejecutar(comando)
│   │   ├── SPAWN    Componer pedido
│   │   │   ├── ATÓMICO  Añadir item (conversor) — puerto: ejecutar(comando)
│   │   │   ├── ATÓMICO  Modificar item (conversor) — puerto: ejecutar(comando)
│   │   │   ├── ATÓMICO  Quitar item (conversor) — puerto: ejecutar(comando)
│   │   │   ├── ATÓMICO  Selector de producto (puente) — puerto: consultar(dominio, criterio)
│   │   │   └── ATÓMICO  Selector de variaciones (puente) — puerto: consultar(dominio, id)
│   │   ├── ATÓMICO  Confirmar pedido (conversor) — puerto: ejecutar(comando)
│   │   ├── ATÓMICO  Enviar a cocina (conversor) — puerto: ejecutar(comando)
│   │   ├── ATÓMICO  Cancelar (conversor) — puerto: ejecutar(comando)
│   │   ├── ATÓMICO  Validación de composición (reflejo)
│   │   ├── ATÓMICO  Total en vivo (reflejo)
│   │   └── ATÓMICO  Resolución de producto (puente) — puerto: consultar(dominio, criterio)
│   │
│   ├── SPAWN  Vía de Consulta (ver/seguir)
│   │   ├── ATÓMICO  Lista de pedidos (reflejo) — puerto: consultar(criterio)
│   │   ├── SPAWN    Detalle de pedido
│   │   │   ├── ATÓMICO  Cabecera (reflejo) — puerto: consultar(id)
│   │   │   ├── ATÓMICO  Lista de items (reflejo) — puerto: consultar(id)
│   │   │   ├── ATÓMICO  Total (reflejo)
│   │   │   ├── ATÓMICO  Barra de estado (reflejo)
│   │   │   ├── ATÓMICO  Acciones contextuales (micro-agente)
│   │   │   └── ATÓMICO  Resolución de nombre (puente) — puerto: consultar(dominio, id)
│   │   ├── ATÓMICO  Seguimiento en vivo (puente) — puerto: observar(señal)
│   │   ├── ATÓMICO  Filtro por actor (reflejo)
│   │   ├── ATÓMICO  Cadena lista→detalle (reflejo)
│   │   ├── ATÓMICO  Indicador de frescura (reflejo)
│   │   └── ATÓMICO  Reconciliación (conversor)
│   │
│   └── SPAWN  Pedido como entidad
│       ├── ATÓMICO  Ciclo de vida (reflejo)
│       ├── SPAWN    Composición
│       │   ├── ATÓMICO  Item (reflejo)
│       │   └── ATÓMICO  Orden de items (reflejo)
│       ├── ATÓMICO  Metadatos (reflejo)
│       ├── ATÓMICO  Contexto implícito (reflejo)
│       ├── ATÓMICO  Referencia cruzada (puente) — puerto: consultar(dominio, id)
│       └── ATÓMICO  Señal de transición (puente) — puerto: señalar(evento)
│
├── [RESTRICCIONES]
│   ├── ATÓMICO  Guardas de transición (reflejo)
│   ├── SPAWN    Superficie por actor
│   │   ├── ATÓMICO  Vista cliente (reflejo)
│   │   ├── ATÓMICO  Vista trabajador (reflejo)
│   │   └── ATÓMICO  Vista jefe (reflejo)
│   └── ATÓMICO  Conflicto de edición (micro-agente)
│
├── [CONTRATO]
│   ├── ATÓMICO  Feedback de operación (reflejo)
│   ├── ATÓMICO  Reflejo en vivo (puente) — puerto: observar(señal)
│   └── ATÓMICO  Coherencia cross-vía (reflejo)
│
├── [NO-OBJETIVOS]
│   ├── ATÓMICO  Operación vs Producción (puente) — puerto: señalar(evento)
│   └── ATÓMICO  Consulta vs Analítica (reflejo)
│
└── [PREGUNTAS_ABIERTAS] — [ABIERTO]
    - ¿El cliente puede cancelar un pedido ya creado?
    - ¿El jefe puede editar pedidos ajenos?
    - ¿Pedidos huérfanos (solo del cliente)?
    - ¿El trabajador crea pedidos "para" un cliente?
    - ¿Pedido reabierto tras completado?
    - ¿El jefe actúa desde la consulta?
```

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas hasta el suelo | 3 |
| Piezas totales | 41 |
| ATÓMICAS (con disección) | 41 |
| REF (deduplicadas) | 5 |
| [ABIERTO] | 1 (PREGUNTAS_ABIERTAS, 6 preguntas) |
| SPAWN (convergió) | 0 |

## Reparto de formas

| Forma | Cantidad | % |
|---|---|---|
| reflejo | 23 | 56% |
| puente | 9 | 22% |
| conversor | 7 | 17% |
| micro-agente | 2 | 5% |
| custodio | 0 | 0% |

## Puertos abiertos (5)

| Puerto | Adaptador Enki |
|---|---|
| `ejecutar(comando)` | mqttRequest(dominio, accion, payload) |
| `consultar(criterio)` | mqttRequest(dominio, 'list', filtros) |
| `consultar(id)` | mqttRequest(dominio, 'get', { id }) |
| `observar(señal)` | subscribe(evento, callback) |
| `señalar(evento)` | publish(evento, payload) |

## Cobertura: blueprint v2 vs esquema v2

| Pieza | Blueprint v2 | Estado |
|---|---|---|
| **VÍA OPERATIVA** | | |
| Iniciar pedido | formulario: create | OK |
| Componer: Añadir/Modificar/Quitar | formulario: add-item, update-item, delete-item | OK |
| Selector de producto | tipo ref en args | OK |
| Selector de variaciones | — | **FALTA** |
| Confirmar pedido | — (no hay op separada) | **FALTA** |
| Enviar a cocina | formulario: send-kitchen | OK |
| Cancelar | formulario: cancel | OK |
| Validación de composición | guardas (sensible_estado) | PARCIAL |
| Total en vivo | formulario: total | OK |
| Resolución de producto | ref_label en args | OK |
| **VÍA DE CONSULTA** | | |
| Lista de pedidos | datos: list | OK |
| Detalle: Cabecera | — | **FALTA** |
| Detalle: Lista de items | — | **FALTA** |
| Detalle: Total | — | **FALTA** |
| Detalle: Barra de estado | estados (zona 0) | PARCIAL (global, no por pedido) |
| Detalle: Acciones contextuales | — | **FALTA** |
| Detalle: Resolución de nombre | — | **FALTA** |
| Seguimiento en vivo | estadosVivos (zona 3) | OK |
| Filtro por actor | — | **FALTA** |
| Cadena lista→detalle | — | **FALTA** |
| Reconciliación | refresh_on en datos | OK |
| **PEDIDO ENTIDAD** | | |
| Ciclo de vida | estados (zona 0) | OK |
| Composición (Item, Orden) | — (solo visible en detalle) | **FALTA** |
| Contexto implícito | project_id inyectado | OK |
| Referencia cruzada | tipo ref en args | OK |
| Señal de transición | estadosVivos (zona 3) | OK |
| **RESTRICCIONES** | | |
| Guardas de transición | guardas (zona guarda-badge) | OK |
| Vista cliente/trabajador/jefe | — | **FALTA** |
| Conflicto de edición | — | **FALTA** (micro-agente, no mecánico) |
| **CONTRATO** | | |
| Feedback de operación | ResultView | OK |
| Reflejo en vivo | subscribe + refresh_on | OK |
| Coherencia cross-vía | — (emerge del reflejo) | OK (implícito) |

**Resumen: 17 cubiertas, 11 faltan, 2 parciales.**

Las 11 que faltan se agrupan en 3 bloques de trabajo:
1. **Detalle de pedido** (6 piezas) — la vista drill-down completa
2. **Superficie por actor** (3 piezas) — vistas diferenciadas cliente/trabajador/jefe
3. **Cadena lista→detalle + Selector de variaciones** (2 piezas) — navegación y selectores
