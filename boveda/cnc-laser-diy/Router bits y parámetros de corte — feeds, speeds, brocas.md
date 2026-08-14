---
tipo: tecnica
sector: cnc-laser-diy
tags: [router-bits, feeds-speeds, cnc, fresado, brocas, upcut, downcut, compression]
---
# Router bits y parámetros de corte — feeds, speeds, brocas

> En láser el material determina la potencia; en CNC, la fresa determina casi todo lo demás — elegir el diente equivocado arruina un acabado que la máquina más cara del mundo no puede corregir después.

---

## Tipos de fresa y cuándo usar cada una

```
UPCUT (espiral hacia arriba)
  → El caballo de batalla — cubre el 80% del trabajo general de CNC
  → Evacúa viruta hacia arriba (fuera de la ranura), corte limpio en la CARA INFERIOR
  → Uso: desbaste general, pockets profundos, cuando el reverso importa más que la cara
    visible (ej. la cara que queda oculta en un ensamblaje)
  → Contra: puede levantar/astillar fibra en la cara SUPERIOR de maderas laminadas

DOWNCUT (espiral hacia abajo)
  → Empuja viruta hacia abajo, corte limpio en la CARA SUPERIOR
  → Uso: ranuras poco profundas, rebajes, cuando la cara visible es la de arriba (letreros,
    tapas, superficie que se ve en el producto final)
  → Contra: peor evacuación de viruta en corte profundo — puede recalentar la fresa

COMPRESSION (compresión — combina up+down en la misma fresa)
  → La mitad inferior corta upcut, la mitad superior downcut — comprime la fibra desde
    ambos lados hacia el centro
  → Uso: EL rey del contrachapado y melamina — corte limpio en AMBAS caras a la vez,
    imprescindible cuando el corte atraviesa el material completo (through-cut) y las
    dos caras son visibles
  → Contra: más cara que upcut/downcut simples, requiere profundidad de pasada correcta
    para que ambas zonas (up/down) trabajen dentro del material

STRAIGHT (recta, sin espiral)
  → Corte limpio en ranuras rectas, menos agresiva que las espirales
  → Uso: mortajas, ranuras de precisión donde no se necesita evacuación agresiva

BALLNOSE (punta esférica)
  → Uso: relieve 3D, superficies curvas, tallado orgánico — el perfil redondeado de la
    punta es lo que permite generar curvas suaves en un modelo 3D mecanizado

V-BIT (fresa en V, ángulos 30°/60°/90°)
  → Uso: grabado de texto y detalle fino, chamfer (biselado de bordes)
  → 60° para detalle fino y líneas estrechas (texto pequeño, ilustraciones detalladas)
  → 90° para texto más grueso y relleno amplio (letreros, señalética de trazo grueso)

SINGLE FLUTE vs DOUBLE FLUTE
  → Single flute (1 diente): mejor evacuación de viruta, ideal para plásticos y aluminio
    (menos fricción/calor acumulado) y velocidades de avance más altas en madera blanda
  → Double flute (2 dientes): mejor acabado superficial en madera a velocidad moderada,
    más resistente en materiales duros gracias al doble filo de corte
```

---

## Parámetros de corte por material — punto de partida

```
CONTRACHAPADO / MADERA BLANDA (fresa 1/8", 3.175mm, 2 flute upcut)
  RPM: 16.000-18.000 · Feedrate: 1.500-2.500mm/min · DOC (profundidad por pasada): 3-4mm

MDF (fresa 1/4", 6.35mm, single flute)
  RPM: 14.000-16.000 · Feedrate: 1.200-2.000mm/min · DOC: 2-3mm
  Genera mucho polvo fino — extracción/aspiración recomendada

ALUMINIO 6061 (fresa 1/8", single flute, recubrimiento especial aluminio)
  RPM: 10.000-14.000 (más bajo que en madera, contraintuitivo pero correcto)
  Feedrate: 400-800mm/min · DOC: 0,3-0,5mm (pasadas mucho más finas que en madera)
  Refrigerante/lubricante recomendado (WD-40 o líquido de corte específico) — el aluminio
  genera calor que puede soldarse a la fresa (built-up edge) sin lubricación adecuada

HDPE (polietileno de alta densidad)
  RPM: 16.000-18.000 · Feedrate: 2.000-3.000mm/min · DOC: 3-5mm
  Fresa afilada imprescindible — el HDPE "derrite" con fresa desgastada en vez de cortar

ACRÍLICO (fresado, no láser)
  RPM: 16.000-18.000 · Feedrate: 800-1.500mm/min (más lento que madera para evitar fisuras)
  Fresa de una sola espiral específica para plástico — reduce el riesgo de agrietado
```

> Estos valores son PUNTO DE PARTIDA genérico — la combinación real depende de la rigidez
> de tu máquina concreta (un LowRider 3 no admite los mismos parámetros agresivos que un
> PrintNC), el estado de afilado de la fresa y la sujeción del material. Siempre validar
> con un corte de prueba antes de la pieza final, igual que el Material Test en láser.

---

## Errores comunes

```
→ Usar upcut en la cara visible de un tablero laminado — levanta astillas justo donde
  más se nota. Si la cara buena queda arriba, usar downcut o compression.
→ Feedrate demasiado bajo "para ir seguro" — paradójicamente genera MÁS calor (la fresa
  frota en vez de cortar), acorta su vida y quema el material. Feed y velocidad van
  emparejados, no basta con bajar uno sin ajustar el otro.
→ Mecanizar aluminio con RPM de madera — genera calor excesivo, suelda viruta a la fresa
  (built-up edge), acaba rompiendo el filo prematuramente.
→ No limpiar la ranura de viruta acumulada en pasadas profundas — la viruta atrapada
  recalienta la fresa y empeora el acabado en cada pasada sucesiva.
→ Comprar fresas genéricas sin recubrimiento para aluminio — el recubrimiento (TiAlN u
  otro) es lo que evita que el aluminio se pegue al filo; sin él, la fresa dura muy poco.
```

## Novedades 2025-2026

```
→ Los fabricantes de fresas orientados a maker (Amana Tool, Whiteside, Onsrud en gama
  profesional; marcas genéricas en Amazon/AliExpress para hobby) siguen ampliando
  catálogo de compression bits de diámetro pequeño (1/8") accesible a CNC de escritorio,
  antes limitado casi en exclusiva a diámetros de 1/4" de uso industrial.
```

→ Máquina y husillo sobre los que montar estas fresas: [[Fresadoras CNC — escritorio y DIY (Shapeoko, Onefinity, LowRider3, MPCNC)]]
→ El software que traduce el diseño a estos parámetros: [[Software CAM y control CNC — VCarve, Fusion 360, CAMotics, GRBL]]
→ Proyectos donde aplicar cada tipo de fresa: [[Proyectos CNC — relieves, letras, moldes, jigs]]
