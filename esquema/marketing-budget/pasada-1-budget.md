# Pasada 1 — Módulo "marketing-budget" (Presupuesto de Marketing por Proyecto)

Sujeto: la gestión del presupuesto de marketing de un proyecto.
Método: prisma de 5 huecos sobre el sujeto crudo.

---

## [IDENTIDAD] — ¿Qué es el presupuesto de marketing?

El **libro contable del gasto en marketing del proyecto**. Dos ejes: la **asignación** (cuánto se destina a cada canal/campaña — el plan) y el **control** (cuánto se ha gastado realmente — el registro vivo). El módulo no ejecuta pagos ni compras — registra la intención y vigila la ejecución.

### Sub-productos

| # | Sub-producto | Tipo | Razón |
|---|---|---|---|
| 1 | **Presupuesto total** | ATÓMICO | El techo: cuánto dinero tiene el proyecto para marketing en un periodo. |
| 2 | **Asignación por partida** | SPAWN | El reparto: cuánto se destina a cada canal, campaña o categoría. |
| 3 | **Registro de gastos** | SPAWN | El libro de gastos reales: cada gasto con fecha, importe, partida. |
| 4 | **Control presupuestario** | ATÓMICO | La diferencia: asignado vs gastado por partida. El semáforo que dice si vamos bien. |

## [RESTRICCIONES] — ¿Qué limita el presupuesto?

| # | Restricción | Tipo | Razón |
|---|---|---|---|
| 1 | **Recursos del proyecto** | REF → project-profile | El presupuesto de marketing se subordina a los recursos generales del proyecto. |
| 2 | **Canales activos** | REF → marketing-channels | Solo se asigna presupuesto a canales que existen. |
| 3 | **Estrategia** | REF → marketing-strategy | La estrategia prioriza dónde poner el dinero. |

## [CONTRATO] — ¿Qué promete el módulo?

| # | Promesa | Tipo | Razón |
|---|---|---|---|
| 1 | **Techo respetado** | ATÓMICO | La suma de asignaciones no supera el presupuesto total. |
| 2 | **Gasto trazable** | ATÓMICO | Cada gasto tiene partida, fecha e importe. |
| 3 | **Alerta de desvío** | ATÓMICO | Cuando el gasto de una partida supera su asignación, hay señal visible. |

## [NO-OBJETIVOS] — ¿Qué NO es el módulo?

| # | Frontera | Tipo | Razón |
|---|---|---|---|
| 1 | **No ejecuta pagos** | frontera → sistemas de pago externos | El módulo registra; pagar es externo. |
| 2 | **No mide ROI** | frontera → marketing-analytics | El módulo sabe cuánto se gastó; el retorno es de analytics. |
| 3 | **No gestiona facturas** | frontera → facturas | Las facturas como documento son del módulo facturas. |

## [PREGUNTAS_ABIERTAS] — [ABIERTO]

- ¿Periodo del presupuesto: mensual, trimestral, anual?
- ¿Se reasigna automáticamente lo no gastado al siguiente periodo?
- ¿Hay categorías fijas de gasto o las define el dueño?
- ¿El presupuesto incluye costes internos (tiempo de equipo) o solo externos?
