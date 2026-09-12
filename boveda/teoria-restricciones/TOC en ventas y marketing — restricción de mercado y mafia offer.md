---
tipo: componente
sector: teoria-restricciones
tags: [toc, ventas, marketing, mafia-offer, restriccion-de-mercado]
---
# TOC en ventas y marketing — restricción de mercado y mafia offer

> Cuando la fábrica tiene capacidad de sobra y aun así el negocio no crece, seguir mejorando la
> fábrica es esfuerzo tirado a la basura. La restricción vive en la calle, no en la planta.

---

## Diagnosticar la restricción de mercado

```
SEÑAL DE ALARMA: ningún recurso interno tiene carga sostenida cerca del
  100% de su capacidad (ver procedimiento de diagnóstico en
  [[Los 5 pasos de focalización — POOGI y tipos de restricción]]), pero la
  empresa no crece en Throughput.
  → La restricción NO está en producción, ni en operaciones, ni en
    logística interna. Está en la capacidad de GENERAR Y CERRAR demanda.

CONSECUENCIA DIRECTA PARA LA PROGRAMACIÓN
  → El "tambor" del sistema deja de ser una máquina y pasa a ser el ritmo
    de VENTAS comprometidas — exactamente la lógica de S-DBR (ver
    [[Drum-Buffer-Rope — programación de producción y buffers]]).
  → Cualquier inversión en "elevar" capacidad de producción en este
    escenario es un error de secuencia de los 5 pasos: se está elevando
    algo que no es la restricción.
```

---

## La "Mafia Offer" — oferta que no se puede rechazar

```
CONCEPTO (Goldratt, desarrollado en seminarios de Estrategia y Táctica)
  Una oferta comercial diseñada para que el CLIENTE la vea como un valor
  tan claro y tan superior a las alternativas que "sería una locura
  rechazarla" — sin que necesariamente implique bajar precio. El objetivo
  es resolver un problema real, doloroso y no resuelto del cliente, no
  competir en precio o en características incrementales.

CRITERIOS DE UNA MAFIA OFFER SEGÚN EL MARCO TOC
  1. Resuelve un UDE (efecto indeseable) REAL y significativo del cliente,
     no un "nice to have".
  2. Es difícil de replicar rápido por la competencia — se apoya en una
     capacidad interna genuina de la empresa (su restricción bien
     explotada), no solo en marketing.
  3. El cliente puede verificar el valor de forma tangible y creíble
     ANTES de comprometerse del todo (garantías, pilotos, resultados
     medibles) — reduce su percepción de riesgo, que suele ser la
     verdadera restricción de la decisión de compra, más que el precio.
  4. Es rentable para la empresa incluso con condiciones agresivas para el
     cliente, PORQUE se calcula con Throughput Accounting (T/minuto de
     restricción), no con margen unitario clásico — lo que parece "regalar
     margen" a menudo no lo es cuando se mide correctamente.

DIFERENCIA CON UNA PROMOCIÓN DE DESCUENTO CONVENCIONAL
  Un descuento compite en la misma dimensión que la competencia (precio) y
  es trivialmente replicable. Una mafia offer cambia la DIMENSIÓN de la
  comparación (velocidad de entrega garantizada, riesgo cero para el
  cliente, disponibilidad asegurada) apoyándose en una ventaja operativa
  real (buffers bien gestionados, DBR, replenishment) que un competidor
  sin esa disciplina operativa no puede igualar de la noche a la mañana.
```

---

## Ejemplo de aplicación — diferenciación por fiabilidad de entrega

```
ESCENARIO: fabricante mid-market compitiendo por precio en un mercado
  saturado, márgenes cada vez más finos.
LÓGICA TOC APLICADA
  1. Diagnóstico: la restricción real es de mercado, no de capacidad
     (planta con holgura). Toda la industria compite por precio porque
     nadie ha identificado otra dimensión de valor.
  2. Palanca: la empresa implementa DBR/S-DBR internamente y reduce su
     variabilidad de lead time — puede comprometer fechas de entrega con
     mucha más fiabilidad que la competencia, que sigue con MRP
     tradicional y variabilidad alta.
  3. Mafia offer: garantía de entrega en X días con penalización económica
     real si se incumple — algo que la competencia, sin la disciplina de
     buffer management, no puede replicar sin asumir un riesgo que no
     controla.
  4. Resultado esperado (patrón repetido en casos publicados por Goldratt
     Consulting): la empresa deja de competir en precio y capta cuota de
     mercado de clientes para quienes la fiabilidad de entrega es crítica
     (industria, distribución, sectores con penalización por rotura de
     stock aguas abajo).
```

---

## El UDE del cliente como punto de partida del proceso comercial

```
→ Antes de diseñar una oferta, se construye una mini Nube de Evaporación
  o lista de UDE desde la perspectiva del CLIENTE, no de la empresa
  vendedora: ¿qué le frustra sistemáticamente al comprar en esta
  categoría? (plazos inciertos, mínimos de pedido rígidos, falta de
  soporte post-venta, opacidad de precios).
→ La oferta se diseña para resolver ese UDE de forma verificable — la
  fuerza de ventas deja de "vender características del producto" y pasa a
  "vender la eliminación de un dolor concreto y nombrado".
```

---

## Errores comunes

```
→ Intentar aplicar "mafia offer" como truco de copywriting sin haber
  resuelto de verdad el UDE del cliente detrás — se detecta rápido y
  daña la credibilidad de la marca más que una oferta mediocre pero honesta.
→ Calcular la rentabilidad de la oferta con margen unitario clásico en vez
  de Throughput por minuto de restricción — puede llevar a rechazar
  ofertas agresivas que en realidad son muy rentables, o aceptar ofertas
  que parecen rentables y no lo son.
→ Lanzar una oferta de fiabilidad de entrega sin haber implementado antes
  la disciplina operativa (DBR, buffers) que la sostiene — la oferta se
  convierte en una promesa que la operación no puede cumplir, y el daño
  reputacional es peor que no haber ofrecido nada.
→ Confundir "restricción de mercado" con "problema de precio" — casi
  siempre la restricción real es de PERCEPCIÓN DE VALOR o de RIESGO
  percibido por el cliente, no de precio absoluto.
```

## Novedades 2024-2026

```
→ La lógica de "mafia offer" se está aplicando de forma explícita en
  SaaS B2B (2024-2025): garantías de resultado medible ("no ves esta
  métrica mejorar en 90 días, no pagas") en vez de trials genéricos,
  apoyadas en la capacidad operativa real de onboarding y soporte del
  proveedor — traslado directo del concepto industrial de Goldratt al
  terreno de software.
→ Conexión creciente con estrategias de pricing basado en valor (value-
  based pricing) en literatura de gestión reciente, usando Throughput
  Accounting como base de cálculo de rentabilidad real de las ofertas.
```

Ver: [[Contabilidad del Throughput — T, I, OE]] · [[Estrategia y Táctica — Viable Vision y árboles S&T]] · [[../comercio/00 - Comercio (MOC)|Comercio]].
