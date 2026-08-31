# PASADA 1 — prisma de 5 huecos con LENTE DE ROL JEFE sobre `mise-en-place`

> Sujeto correcto: **la capacidad del jefe de PLANIFICAR el servicio previo** —
> escalar las recetas al volumen del día, publicar el plan de producción (qué
> receta en qué franja con cuántas porciones) y consolidar la lista de compra.
> Ley de agnosticismo: cero tecnología de sistema ambiente.
> Fuente: modules/mise-en-place/index.js (reflejo-1.0.0/planificación, 1175
> líneas) + module.json (v1.0.0, 10 ui_handlers, RAÍZ, tier_4_dominio,
> subsistema-recetario).

## Hueco 1 — IDENTIDAD: ¿qué DECIDE el jefe aquí?

El jefe **PLANIFICA la producción previa al servicio**. No es un flujo de venta:
es la DECISIÓN del dueño de cuánto hay que producir y comprar para servir un
volumen concreto. Decide:

- **D1 — ESCALAR recetas** (`escalado.calcular`): multiplica cada cantidad de una
  receta por `factor = porciones_destino / porciones_origen` para el volumen del
  día. NO modifica la receta canónica — es una derivación transitoria para saber
  cuánto de cada ingrediente hará falta.
- **D2 — el PLAN de producción** (`plan.publicar`): qué recetas, en qué franja
  (desayuno/comida/merienda/cena/all_day) y con cuántas porciones, dentro de un
  horizonte (desde/hasta). Es la DECLARACIÓN que el resto de la producción lee.
- **D3 — la COMPRA** (`compra.calcular`): consolida la lista de compra agregando
  los ingredientes ya escalados a lo largo de un horizonte, agrupando por
  (ingrediente, unidad) con merma opcional.

El jefe decide el FUTURO de la producción ("cuánto se cocina y se compra para
mañana"); el POS/atención es la cara de UTILIZACIÓN (fuera).

## Hueco 2 — RESTRICCIONES: ¿qué NO depende de él?

- **El caller pasa los datos**: `escalado.calcular` y `compra.calcular` reciben
  `ingredientes` (la receta y sus cantidades) — el módulo NO lee cross-modulo. La
  UI debe obtener los ingredientes de la receta vía `recetas.*` (neutro)
  para escalarlos.
- **El escalado NO persiste la receta**: solo guarda el resultado en el store
  (histórico `escalados[]`); la receta canónica no se toca.
- **El plan nace `propuesto`**: la máquina de estados (propuesto → aprobado →
  en_ejecucion → cerrado) la gobierna el módulo; el jefe la avanza con
  `plan.aprobar/ejecutar/cerrar` (transiciones cerradas, CONFLICT_STATE si no
  toca).
- **`compra.calcular` NO guarda la compra como orden de compra**: consolida y
  persiste el dictamen (histórico `compras[]`), no compra nada.
- No decide: la atención/venta en el POS (utilización), ni las ventanas de
  maduración de masa (las lee de `masa`, no las declara aquí).

## Hueco 3 — CONTRATO: ¿qué VER antes de decidir y qué SEÑAL confirma?

- VER: `recetas.listar` (el recetario para el ref-select de receta), `planes.listar`
  (los planes ya publicados del proyecto). El dictamen del escalado/compra viene
  EN LA RESPUESTA del RPC (201 con los datos calculados).
- SEÑALES de confirmación (publishes reales de index.js):
  - `escalado.calcular` → **`produccion.escalado.calculado`**
  - `plan.publicar` → **`produccion.plan.publicado`**
  - `compra.calcular` → **`produccion.compra.calculada`**
  Cadena: reflejo (`_publicarEvento` L587-611) → eventBus core → MQTT → el
  frontend suscribe en dot notation. El plan también emite
  `produccion.plan.estado.avanzado` al aprobar/ejecutar/cerrar.

## Hueco 4 — NO-OBJETIVOS: ¿qué caras NO son del jefe?

- **NEUTRO (2 lecturas)**: `plan.obtener`, `planes.listar` — informan la
  DECISIÓN (ver planes vigentes), no declaran. `recetas.*` (listar/obtener)
  también neutro: alimenta el ref-select de receta.
- **SISTEMA**: `retroplanning.calcular` y `agrupar_tandas` son conversores puros
  del motor (cálculo, no declaración); `plan.aprobar/ejecutar/cerrar` son
  transiciones de la máquina que el jefe dispara pero no escriben reglas nuevas.
  Utilización (POS/venta) NO vive en este módulo.

## Hueco 5 — PREGUNTAS_ABIERTAS (decisiones SUYAS, se nombran, no se cierran)

- [ABIERTO] **El escalado como entrada del plan**: hoy `plan.publicar` recibe las
  `lineas` explicitadas por el caller; no hay un paso "promover este escalado al
  plan" en el contrato (la UI lo arma desde los escalados calculados).
- [ABIERTO] **Retroplanning/agrupación UI**: `retroplanning.calcular` y
  `agrupar_tandas` están en el contrato (rol jefe) pero no son la DECISIÓN
  primaria del panel de este ciclo; se anotan para una pasada posterior.
- [ABIERTO] **Merma en el escalado**: el escalado no aplica merma; la merma solo
  entra en `compra.calcular` por ingrediente — la UI decide si ofrecerla o
  usar 0.

Huecos de CONTRATO (faltan campos/señales), no de CAPTURA — se listan como
onboarding del dueño, no como defectos.
