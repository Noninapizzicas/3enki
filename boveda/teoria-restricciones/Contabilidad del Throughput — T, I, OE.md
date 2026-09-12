---
tipo: componente
sector: teoria-restricciones
tags: [toc, throughput-accounting, contabilidad, finanzas, decisiones]
---
# Contabilidad del Throughput — T, I, OE

> El coste unitario de un producto es una ficción contable que depende de cuántas unidades decidas
> repartir los costes fijos entre. Tres números simples y verificables bastan para decidir mejor.

---

## Las tres medidas fundamentales

```
THROUGHPUT (T) — "el dinero que entra"
  T = Ventas − Costes Totalmente Variables (TVC)
  TVC = materiales, componentes, comisiones directamente ligadas a la unidad
  vendida. NO incluye mano de obra directa (se considera coste fijo a corto
  plazo salvo que sea estrictamente variable por unidad, ej. subcontratación
  por pieza) ni gastos de estructura.
  → Solo cuenta si el producto/servicio se VENDE. Producir para almacén no
    genera Throughput, aunque "aumente el inventario" en el balance contable.

INVENTARIO / INVERSIÓN (I) — "el dinero atrapado dentro"
  Todo el dinero invertido en comprar cosas que el sistema pretende vender:
  materias primas, WIP, producto terminado, y también activos fijos
  (máquinas, edificios) bajo la óptica TOC. Se busca MINIMIZAR I sin dañar T.

GASTO OPERATIVO (OE) — "el dinero que sale para convertir I en T"
  Todo el dinero gastado en operar el sistema con independencia del volumen
  vendido: salarios, alquileres, energía, depreciación, administración.
  Es esencialmente fijo a corto plazo (no varía unidad a unidad).

DERIVADAS
  Beneficio Neto (NP) = T − OE
  ROI = (T − OE) / I
  Productividad = T / OE
  Rotación de inventario = T / I
```

---

## Por qué reemplaza al coste unitario tradicional

```
PROBLEMA DEL COSTE UNITARIO CLÁSICO (full costing / absorción)
  → Reparte costes fijos (OE) entre unidades producidas usando una tasa de
    absorción arbitraria (horas-máquina, horas-hombre). Esa tasa CAMBIA
    según el volumen de producción del periodo — el mismo producto "cuesta"
    distinto según cuánto más se produzca a su alrededor, sin que nada
    real haya cambiado en el proceso.
  → Incentiva producir para "absorber costes fijos" aunque no haya venta
    real → genera inventario que no es Throughput, solo Inversión atrapada
    disfrazada de beneficio contable en el corto plazo.
  → Puede llevar a discontinuar productos "no rentables" según coste
    absorbido que en realidad SÍ contribuyen positivamente al Throughput
    total del sistema — decisión que empeora el resultado real.

DECISIÓN DE MIX DE PRODUCTO: EL CASO CLÁSICO
  → Contabilidad de costes: prioriza el producto con MAYOR margen unitario
    (Precio − Coste Absorbido).
  → Throughput Accounting: prioriza el producto con MAYOR "Throughput por
    unidad de tiempo en la RESTRICCIÓN" (T / minuto de recurso restrictivo).
  → Un caso de estudio 2024 en una pyme metalúrgica brasileña confirmó que
    el mix óptimo según T/minuto-restricción difería sustancialmente del
    mix recomendado por coste unitario clásico — la empresa habría
    priorizado el producto equivocado usando el método tradicional.
```

---

## Fórmula de decisión de mix (paso a paso)

```
1. Identificar la restricción del sistema (ver [[Los 5 pasos de focalización — POOGI y tipos de restricción]]).
2. Para cada producto candidato:
     T_unitario = Precio venta − Coste totalmente variable
     T_por_minuto_restriccion = T_unitario / minutos que consume en la restricción
3. Ordenar productos de MAYOR a MENOR T_por_minuto_restriccion.
4. Asignar la capacidad de la restricción empezando por el producto de
   mayor ratio, hasta agotar demanda de ese producto o capacidad disponible.
5. Continuar bajando en el ranking hasta agotar la capacidad de la restricción.

EJEMPLO NUMÉRICO
  Producto A: precio 100€, TVC 40€ → T=60€. Consume 10 min de restricción.
    → T/min = 6€/min
  Producto B: precio 80€, TVC 20€ → T=60€. Consume 20 min de restricción.
    → T/min = 3€/min
  Aunque A y B tienen el MISMO throughput unitario (60€), A es el doble de
  rentable por minuto de restricción → se prioriza A. El coste unitario
  clásico, si reparte OE por horas-máquina de forma distinta, podría
  incluso mostrar a B como "más rentable" — error de decisión clásico.
```

---

## Throughput Accounting frente a EBITDA / margen de contribución clásico

```
MARGEN DE CONTRIBUCIÓN CLÁSICO
  → Similar en espíritu a T, pero suele incluir mano de obra directa como
    variable incluso cuando no lo es realmente a corto plazo (no se puede
    "despedir por hora" a un operario fijo). TOC es más estricto: solo
    material y coste estrictamente variable por unidad entra en TVC.

DIFERENCIA CLAVE DE ENFOQUE
  → La contabilidad financiera mira hacia atrás (qué pasó el trimestre
    pasado). Throughput Accounting es una herramienta de DECISIÓN hacia
    delante (¿qué producto fabricar/vender ahora con la capacidad
    disponible?) — no sustituye la contabilidad financiera regulatoria,
    la complementa como capa de decisión operativa diaria.
```

---

## Errores comunes

```
→ Incluir mano de obra directa fija en el TVC "porque siempre se ha hecho
  así" en contabilidad de costes — infla el TVC y distorsiona el ranking
  de productos por T/minuto-restricción.
→ Usar Throughput Accounting para decisiones de LARGO plazo sin revisar si
  el OE es realmente fijo en ese horizonte (a 3-5 años, casi todo se
  vuelve variable — hay que ampliar plantilla, capacidad, etc.).
→ Ignorar el coste de OPORTUNIDAD de la restricción: aceptar un pedido
  puntual con T/minuto-restricción bajo porque "algo es mejor que nada",
  cuando desplaza capacidad de un pedido con T/minuto-restricción alto.
→ Reportar T, I, OE solo a nivel de toda la empresa sin desglosar por
  línea de producto o restricción local — pierde la capacidad de decisión
  que es la razón de ser de esta contabilidad.
```

## Novedades 2024-2026

```
→ Throughput Accounting se está integrando en dashboards de Business
  Intelligence (Power BI, Tableau) como capa complementaria al P&L
  tradicional en pymes industriales, permitiendo recalcular T/minuto-
  restricción en tiempo real cuando cambia el mix de pedidos entrantes.
→ Casos de estudio 2024-2025 en pymes de manufactura confirman de forma
  reiterada la brecha entre decisión "óptima" por coste absorbido y por
  Throughput — la literatura reciente insiste en formar a controllers
  financieros en esta lógica, no solo a operaciones.
```

Ver: [[Drum-Buffer-Rope — programación de producción y buffers]] · [[Métricas y palancas TOC — throughput, buffer penetration, OEE]].
