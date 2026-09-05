# Pasada 1 · Prisma de 5 huecos con lente CLIENTE — la web de consumo

> Sujeto: la cara de CONSUMO del despacho de pan — el recorrido del cliente final
> (descubrir → elegir → comprar → pagar → recoger → repetir) que convierta y fidelice.
> Alimento: FASE 0 (identidad) + FM0 (marketing) + FM1 (qué construir).

## IDENTIDAD — ¿Qué ELIGE el cliente aquí?
- El cliente elige **su pan semanal**: qué pan/repostería, cuánto, y cuándo lo recoge.
- Elige **repetir** su pedido en un click (cuenta recurrente).
- Elige **cuándo pagar** (adelantado o al recoger) — el freno "pagar por adelantado" se convierte en flexibilidad.

## RESTRICCIONES — ¿Qué ya está decidido por el negocio?
- **Precio**: lo fija el backend (señal > precio); la web solo muestra.
- **Catálogo**: lo que el obrador puede hornear (no infinito).
- **Franjas de tanda**: HOY / MAÑANA / PASADO MAÑANA (cero inputs de fecha).
- **Pago anticipado**: solo se hornea lo pagado (cero merma).
- **Diseño para mayores**: cero campos de texto libres, selector + cantidad + botón grande.

## CONTRATO — ¿Qué necesita VER para decidir y qué SEÑAL confirma?
- Ver el **catálogo** con gramaje y precio (para decidir).
- Ver el **diferenciador** arriba (qué hace distinto este negocio).
- **Señal de confirmación**: tras pedir/pagar, la vista espera "pedido confirmado" (nunca recarga).
- **Señal de recogida**: "listo para recoger" (ancla por nombre, sin código).

## NO-OBJETIVOS — ¿Qué caras NO son del cliente?
- **Jefe/POS**: gestión de cuentas recurrentes, dashboard de métricas, configuración de precios.
- **Sistema**: administración, infraestructura.
- **Operación**: cocina, atención interna.
- La web del cliente NO muestra estas caras.

## PREGUNTAS_ABIERTAS — ¿Qué decisión de negocio falta y bloquea la conversión?
- **Q1. Catálogo inicial**: ¿qué panes/repostería concretos arrancan? (base de todo).
- **Q2. Franjas de tanda**: ¿cuántas franjas al día? ¿a qué hora se hornea?
- **Q3. Domicilio**: ¿se confirma la ruta 13:00? (condiciona si la web ofrece entrega o solo recogida).
- **Q4. Métodos de pago**: ¿link de pago, transferencia, tarjeta?

## SUB-PRODUCTOS (puntos que salen — pasan a pasada-2)
1. **Hero-promesa** (qué es + diferenciador en una vista).
2. **Catálogo** (tarjetas de producto seleccionables).
3. **Selector de opciones** (cantidad, franja, recurrencia).
4. **Flujo de pedido** (carrito → pago → confirmación).
5. **Señal de confirmación** (pedido confirmado, listo para recoger).
6. **Reenganche** (recordatorio semanal, aviso, oferta recurrente).
