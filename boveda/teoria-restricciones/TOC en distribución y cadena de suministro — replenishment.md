---
tipo: componente
sector: teoria-restricciones
tags: [toc, distribucion, supply-chain, replenishment, ddmrp]
---
# TOC en distribución y cadena de suministro — replenishment

> El error de la cadena de suministro tradicional es fabricar según un pronóstico y luego rezar.
> TOC invierte la lógica: mantener buffers cerca del cliente y reponer según lo que REALMENTE se
> consume, no según lo que se predijo hace tres meses.

---

## El problema con el forecast tradicional

```
LA CADENA DE SUMINISTRO "EMPUJADA" (push, basada en pronóstico)
  → Cada eslabón (fábrica, almacén regional, tienda) pronostica su propia
    demanda y pide en consecuencia. El error de pronóstico se AMPLIFICA
    aguas arriba (efecto látigo / bullwhip effect) — pequeñas variaciones
    en demanda de tienda se convierten en oscilaciones enormes en pedidos
    a fábrica.
  → Resultado típico: roturas de stock en producto de alta rotación
    conviviendo con exceso de inventario en producto de baja rotación —
    ambos problemas simultáneos, en el mismo almacén, el mismo día.
```

---

## El modelo TOC de reposición (Replenishment / Pull)

```
PRINCIPIO CENTRAL: mantener stock cerca del punto de consumo, reponer
  RÁPIDO según lo que se vende, no según lo que se predijo.

MECÁNICA
  → Cada punto de la cadena (tienda, almacén regional, fábrica) mantiene
    un BUFFER de stock dimensionado según su consumo histórico real y su
    tiempo de reposición (lead time) — no según un pronóstico de demanda
    futura incierto.
  → Cuando se consume una unidad, se dispara una orden de reposición hacia
    el eslabón anterior EN LA MISMA PROPORCIÓN — el pedido "tira" desde
    el consumo real (pull), no se "empuja" desde un plan de producción.
  → La fábrica repone solo lo que los almacenes regionales han enviado; los
    almacenes regionales piden solo lo que las tiendas han vendido. La
    señal de consumo real viaja hacia atrás en la cadena mucho más rápido
    que un ciclo de forecast trimestral.

VENTAJA CLAVE: inventario TOTAL de la cadena baja mientras el nivel de
  servicio (disponibilidad) SUBE — parece contraintuitivo porque la
  intuición dice "más stock = mejor servicio", pero al concentrar el
  buffer donde realmente hace falta (cerca del consumo, dimensionado por
  datos reales) se elimina el exceso allí donde no ayuda.
```

---

## Make-to-Availability (MTA)

```
DEFINICIÓN
  Variante de S-DBR aplicada a producto de catálogo/stock: en vez de
  fabricar contra pedido o contra pronóstico, se fabrica para MANTENER un
  nivel de buffer de producto terminado siempre disponible — el "tambor"
  de fábrica es el nivel de buffer de cada SKU, no una fecha de pedido
  individual.

CUÁNDO APLICA
  → Productos de alta rotación y previsibilidad razonable, donde el coste
    de rotura de stock (venta perdida, cliente insatisfecho) supera
    claramente el coste de mantener un buffer razonable de producto
    terminado. Distribución, retail, repuestos, gran consumo.

GESTIÓN DEL BUFFER DE STOCK (colores, igual lógica que DBR)
  ROJO (buffer muy consumido) → priorizar reposición de ese SKU sobre otros.
  VERDE (buffer casi lleno de forma sostenida) → señal de que el buffer es
    demasiado grande para el consumo real → candidato a REDUCIR tamaño,
    liberando capital de trabajo sin dañar servicio.
  Este ajuste dinámico (subir/bajar tamaño de buffer según comportamiento
  real) es el corazón de la mejora continua en distribución TOC.
```

---

## DDMRP — la evolución formalizada del replenishment TOC

```
QUÉ ES
  Demand Driven MRP (Ptak & Smith, 2011) formaliza y extiende la lógica
  de reposición TOC en un método con 5 componentes: posicionamiento
  estratégico de buffers de desacoplamiento, perfiles y niveles de buffer
  dinámicos, ajustes de demanda, planificación demand-driven y ejecución
  visible (alertas de buffer).

RELACIÓN CON TOC CLÁSICO
  → DDMRP es, en esencia, replenishment TOC + reglas formales de
    dimensionado y ajuste de buffers, pensado para integrarse en un ERP
    (a diferencia del enfoque más artesanal del replenishment TOC original).
  → Adopción 2024-2026: cada vez más ERPs de nivel 1 y 2 (SAP S/4HANA,
    Infor CloudSuite, Oracle Cloud SCM) ofrecen módulos DDMRP nativos o
    certificados, reduciendo la dependencia de add-ons de terceros que
    dominaba el mercado hasta hace pocos años.
  → Certificación: Demand Driven Institute ofrece las credenciales
    CDDP (Certified Demand Driven Planner) y CDDL (Leader) — referencia
    de facto para practicantes de DDMRP a nivel internacional.
```

---

## Dimensionado de buffers de distribución (procedimiento)

```
1. Calcular consumo diario medio (ADU) de cada SKU en cada punto de la
   cadena, con datos de los últimos 3-6 meses (ajustado a estacionalidad
   si aplica).
2. Calcular el lead time de reposición desde el eslabón anterior.
3. Buffer inicial ≈ ADU × Lead Time × factor de variabilidad (típicamente
   1.5-2x para productos de variabilidad media-alta, ajustable).
4. Dividir el buffer en 3 zonas (rojo/amarillo/verde) igual que en DBR.
5. Revisar mensualmente: SKUs que pasan mucho tiempo en rojo → subir
   buffer; SKUs que casi nunca bajan de verde → bajar buffer. Esta
   revisión periódica ES la mejora continua del sistema de distribución.
```

---

## Errores comunes

```
→ Dimensionar el buffer una sola vez "al implementar" y no revisarlo
  nunca más — la demanda y los lead times cambian, el buffer debe
  respirar con ellos.
→ Seguir pronosticando demanda a nivel de tienda individual mientras se
  intenta implementar replenishment — son dos filosofías incompatibles;
  el replenishment sustituye al pronóstico local, no lo complementa.
→ Aplicar MTA a productos de baja rotación y alta variabilidad (donde
  make-to-order tiene más sentido) — el buffer se vuelve enorme e
  ineficiente para ese tipo de producto.
→ Ignorar el lead time de TRANSPORTE al calcular el buffer — subestimarlo
  es la causa más común de roturas de stock en cadenas con proveedores
  internacionales.
```

## Novedades 2024-2026

```
→ DDMRP gana tracción como estándar de facto en manufactura discreta y
  distribución mid-market (2024-2025) — más integraciones nativas en
  ERPs de nivel 1-2 reducen la barrera de entrada frente a hace 5 años,
  cuando requería casi siempre software especializado de terceros.
→ Convergencia con IA de demanda: algunos proveedores DDMRP (2025-2026)
  incorporan ajuste de perfil de buffer asistido por modelos predictivos,
  mantiniendo la lógica pull de fondo pero afinando el dimensionado con
  señales adicionales (clima, eventos, redes sociales) sin volver al
  forecast puro como motor de decisión.
```

Ver: [[Drum-Buffer-Rope — programación de producción y buffers]] · [[../comercio/00 - Comercio (MOC)|Comercio]] (márgenes y rotación).
