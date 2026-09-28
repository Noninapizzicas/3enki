# PASADA 2 · PUNTO: `inmovilizado` (altas · amortizaciones · bajas)

> Bloque hoy inexistente en el sistema. Es el caso más claro de **hecho recurrente generado por
> el tiempo**: la amortización no la emite ningún negocio → la emite **el propio tiempo**, y el
> sistema debe saber producirlo sin que nadie lo digite.

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD — ¿qué es el inmovilizado?
El registro de los **bienes duraderos** (máquinas, mobiliario, vehículos, software) y su ciclo:
**alta** (adquisición valorada), **amortización** (cuota periódica que reparte el coste) y
**baja** (venta/desecho con su resultado). Es la parte de la contabilidad donde el **tiempo**
genera asientos.

### 2 · RESTRICCIONES — ¿qué le limita?
- **FRENO**: la amortización ocurre **por paso del tiempo**, no por un evento del negocio.
  **EMPUJÓN**: **plan-amortizacion** (CUSTODIO que genera la cuota cuando toca) +
  **cierre** como disparador natural.
- **FRENO**: el método/coeficiente de amortización no está declarado. **EMPUJÓN**:
  **parametros-amortizacion** (declarables; base en tabla legal o criterio del asesor) —
  el **valor exacto es [ABIERTO]**.
- **FRENO**: la baja de un bien genera resultado (pérdida/beneficio) que hay que imputar.
  **EMPUJÓN**: **baja-activo** (calcula el resultado y lo imputa).
- **FRENO**: un bien puede estar **en construcción / no listo** → no amortiza hasta su puesta
  en marcha. **EMPUJÓN**: `estado-activo` **[ABIERTO]** (¿declara el negocio cuándo entra en servicio?).

### 3 · CONTRATO — ¿qué intercambia?
- **Recibe:** el alta puede llegar por evento de compra o por documento (REF `entrada-hechos`).
- **Produce:** cuota de amortización → asiento (núcleo) + valor neto contable → balance.
- **A cambio el conjunto gana:** la **imputación temporal del coste** de los bienes duraderos.

### 4 · NO-OBJETIVOS — ¿qué NO hace?
- NO decide el método por su cuenta (lo declara el negocio/asesor). NO inventa coeficientes.
- NO inventaría bienes físicamente (no es un sistema de activos físicos; eso es inventario de
  existencias, otro punto).

### 5 · PREGUNTAS ABIERTAS (cero supuestos)
- ¿Qué **métodos/coeficientes** de amortización admite el producto? NO declarado.
- ¿Quién y cómo da de **alta** un bien (evento de compra, documento, alta manual)? NO declarado.
- ¿La baja la declara el negocio o la deduce el sistema? NO declarado.

---

## FRENOS → EMPUJONES consolidados
1. **alta-activo** — registra y valora la adquisición del bien.
2. **plan-amortizacion** — genera la cuota periódica cuando toca (CUSTODIO; dispara en el cierre).
3. **baja-activo** — retira el bien y calcula el resultado de la baja.
4. **parametros-amortizacion** — método/coeficiente declarable (**[ABIERTO]** sin ellos, nada se estima).
5. **valor-neto-contable** — coste − amortización acumulada (al balance).

## Lo que sale de ESTE punto
- `alta-activo` — hoja atómica → disección
- `plan-amortizacion` — hoja atómica → disección
- `baja-activo` — hoja atómica → disección
- `valor-neto-contable` — hoja atómica → disección
- `parametros-amortizacion` — **[ABIERTO]** (métodos/coeficientes que declara el negocio)

> Punto **SECO**.
