# PASADA · INTERLOCUTOR: `proveedor` (de fuentes y datos / plataformas de cobro)

> Actor externo-relacional del mapa cerrado en F0. No único: son las FUENTES que
> alimentan la detección y la validación (buscadores, APIs, scraping, comunidades,
> plataformas de datos) y las PLATAFORMAS de cobro/distribución. F0: "trabaja con
> APIs, buscadores, scraping, análisis, más las fuentes externas; si falta un
> recurso, se crea".

---

## Prisma de los 5 huecos DESDE la silla del proveedor

### 1 · IDENTIDAD — ¿qué es el negocio PARA el proveedor?
Un **consumidor de su datos o de su plataforma**. Al proveedor le da igual qué
nicho: consume su recurso (búsqueda, API, dato, cobro, distribución) dentro del
flujo del sistema. El negocio compra acceso (gratis o de pago) a su recurso para
detectar/validar/cobrar.

### 2 · RESTRICCIONES — ¿qué le limita AL PROVEEDOR en la relación?
- **FRENO**: recursos externos cambian (APIs se cierran, límites de rate, tarifas,
  ToS). → **EMPUJON**: **puerto de fuente declarable y reemplazable** — ningún
  recurso es el cuello; si una fuente muere, se crea la alternativa (invariante).
- **FRENO**: cada fuente tiene su forma de datos/costo/límite distinta. →
  **EMPUJON**: **conversor de fuente** (una sola frontera de cruce de formatos a
  datos internos homogéneos — la pieza conversor del vocabulario).
- **FRENO**: abusar de una fuente (rate) la bloquea. → **EMPUJON**: gestión de
  límites/cola de consumo por fuente (reflejo) para no quemar un recurso.
- **FRENO**: costo por cada fuente no declarado → sangría oculta. → **EMPUJON**:
  coste de fuentes imputado por proyecto (cruza con imputacion-costes-proyecto →
  salud financiera).

### 3 · CONTRATO — qué intercambia con el negocio
- DA: datos/recursos (para detectar/validar demanda, en pasada proveedor de
  validación) y/o plataformas de cobro/distribución (para operar).
- RECIBE: el pago o uso según su tarifa (o su ToS si es gratuito); a cambio el
  negocio no abusa (cola, límites).

### 4 · NO-OBJETIVOS — qué NO quiere el proveedor
- NO quiere ser el único punto de fallo (el negocio debe tener alternativas).
- NO quiere consumo que viole su ToS o lo degrade (el negocio respeta límites).
- NO quiere integrarse a mano en cada cambio de formato (el negocio tiene su
  conversor y se adapta).

### 5 · PREGUNTAS ABIERTAS (cero supuestos)
- ¿Qué fuentes concretas de detección y de validación DE DEMANDA autoriza el dueño?
  (lista no enumerada en F0 — hueco guion).
- ¿Qué plataformas de cobro y distribución se declaran de partida?
- ¿Coste por fuente? (si es de pago) — a imputar por proyecto.
- ¿Qué pasa cuando una fuente no tiene datos para probar la demanda? (¿se crea la
  fuente? — invariante, ¿o se marca puente-humano?)

## PIEZAS que emergen SOLO desde el proveedor (se añaden al árbol)
- `puerto-fuente-datos` (reemplazable por EVENTO, no acoplado a un vendor).
- `conversor-fuente` (frontera de formatos → datos homogéneos).
- `gestion-limites-fuente` (cola/rate para no quemar recursos).
- `imputacion-coste-fuente` (coste por fuente → coste por proyecto → salud financiera).
