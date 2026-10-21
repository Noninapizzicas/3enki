---
tipo: tecnica
sector: impresion-3d
tags: [moldes, silicona, fundicion, cera-perdida, resina-epoxi, produccion-serie, jabones, joyeria]
---
# Moldes y fundición — de la impresión a la producción en serie

> Aquí es donde la impresora deja de ser el producto final y se convierte en la primera máquina de una cadena de producción — un master impreso una vez puede generar cientos de piezas coladas sin volver a tocar el slicer.

---

## El workflow completo — de la idea a la producción en serie

```
1. DISEÑO CAD del objeto final (o del negativo, según técnica — ver más abajo)
2. IMPRESIÓN DEL MASTER (la pieza maestra) — normalmente resina (mejor superficie) o
   PETG/ABS (más barato, aceptable si se lija bien después)
3. PREPARACIÓN DEL MASTER — lijado fino + sellado de porosidad (ver postprocesado) para
   que la silicona no reproduzca las líneas de capa de la impresión
4. FABRICACIÓN DEL MOLDE — se rodea el master con silicona líquida que cura y captura
   la forma en negativo
5. EXTRACCIÓN DEL MASTER — se retira el master del molde de silicona ya curado
6. COLADA/PRODUCCIÓN — se vierte el material final (resina epoxi, cera, jabón, yeso...)
   dentro del molde de silicona, tantas veces como se necesite
7. DESMOLDEO Y ACABADO de cada pieza producida
```

---

## Diseño del master — reglas específicas para moldeo

```
ÁNGULOS DE DESMOLDEO (draft angle): toda cara del master debe tener una ligera inclinación
  (1-3° mínimo, más en piezas altas/complejas) respecto a la dirección de extracción del
  molde — una cara perfectamente vertical se agarra a la silicona y dificulta desmoldear
  sin rasgar el molde en piezas repetidas

LÍNEA DE PARTICIÓN (parting line): el plano donde el molde se divide en dos o más partes
  para poder extraer la pieza — diseñar el master pensando en DÓNDE va a estar esa línea
  (idealmente en un borde poco visible o funcional del objeto final)

BEBEDERO (sprue/gate): el canal por donde se vierte el material líquido dentro del molde
  cerrado — debe ir en el punto más alto para que el material fluya por gravedad y
  desplace el aire hacia abajo y los lados, no lo atrape

MAZAROTA (riser/vent): un canal o cavidad adicional que actúa de reserva de material y vía
  de escape de aire/gases durante el llenado — evita burbujas atrapadas y rechupes
  (huecos internos por contracción del material al curar/solidificar)

MOLDES DE UNA PIEZA (open mold) vs DOS O MÁS PIEZAS (multi-part mold):
  → Una pieza: más simple, solo sirve para geometrías sin contrasocavados (undercuts)
  → Multi-parte: necesaria cuando la geometría tiene entrantes que impedirían desmoldear
    en una sola pieza — el master se rodea de arcilla/plastilina hasta la línea de
    partición, se cuela la mitad 1, se retira la arcilla, se cuela la mitad 2 sobre la 1
```

---

## Materiales para el molde

```
SILICONA DE PLATINO (curado por catálisis de platino, tipo Smooth-On, BJB)
  Marcas de referencia: Smooth-On (Mold Star, OOMOO), BJB Enterprises
  Ventaja: sin subproducto de curado (a diferencia de la silicona de curado por estaño),
  mayor vida útil del molde, mejor reproducción de detalle fino
  Precio orientativo: 40-90€/kg según dureza Shore y marca — un molde mediano de joyería
  o miniatura suele consumir 0,3-1kg de silicona
  Dureza (Shore A): 10-20A para piezas con contrasocavados suaves (más flexible, extrae
  fácil), 30-40A para moldes más rígidos y de mayor durabilidad en producción repetida

SILICONA DE CONDENSACIÓN (curado por estaño, más barata)
  Más económica pero con mayor contracción al curar y vida útil más corta que la de platino
  — aceptable para prototipo de molde único, no para producción en serie sostenida

PETG/ABS IMPRESOS DIRECTAMENTE COMO MOLDE (sin silicona intermedia)
  Para piezas simples sin contrasocavados y tiradas cortas (jabones, velas de forma sencilla)
  se puede imprimir directamente el molde negativo en PETG (más barato de reproducir que
  hacer un master+silicona) — funciona pero sin la flexibilidad de desmoldeo de la silicona
  ABS es más resistente térmicamente que PETG si el material colado se vierte caliente
  (cera, por ejemplo) — PETG puede deformar con calor sostenido cerca de su Tg

RESINA IMPRESA DIRECTAMENTE COMO MOLDE: existen resinas específicas (ver catálogo Liqcreate
  y similares) formuladas para tolerar el contacto con silicona/cera repetidamente sin
  degradarse — opción intermedia entre imprimir en FDM y hacer un molde de silicona completo
```

---

## Fundición de cera perdida (investment casting) con master impreso

```
PROCESO: 1) imprimir el master (habitualmente en resina "castable", formulada para
  quemarse limpiamente sin dejar residuo/ceniza) → 2) recubrir el master con material
  refractario (revestimiento cerámico) formando un molde sólido → 3) quemar el master en
  horno (se evapora/consume, de ahí "cera perdida") dejando una cavidad hueca exacta →
  4) verter metal fundido (aluminio, bronce, plata) en la cavidad → 5) romper el
  revestimiento cerámico y extraer la pieza metálica final

VARIANTE ALTERNATIVA (más maker/casera): imprimir master en ABS/PLA → hacer molde de
  silicona del master → colar CERA (no metal) dentro del molde de silicona → usar esa
  pieza de cera como "master perdido" en el proceso de fundición tradicional de cera
  perdida en metal — permite reproducir múltiples masters de cera desde un único master
  impreso, reduciendo el número de veces que hay que reimprimir

APLICACIÓN TÍPICA: joyería (anillos, colgantes en plata/oro), piezas ornamentales en
  bronce, reproducción de piezas metálicas de repuesto discontinuadas
```

---

## Colada de resina epoxi en molde de silicona

```
MATERIALES: resina epoxi de colada (distinta de la resina fotopolimérica de impresoras
  MSLA — esta cura por reacción química de dos componentes, no por luz UV), pigmentos,
  cargas (polvo de metal, mica) para efectos visuales
PROCESO: mezclar resina+endurecedor en proporción exacta del fabricante → verter en el
  molde de silicona → desgasificar (cámara de vacío o dar golpecitos para sacar burbujas)
  → curar (horas a temperatura ambiente, o acelerar en horno de curado a baja temperatura)
  → desmoldear
APLICACIÓN: joyería en resina, piezas decorativas, repuestos funcionales de baja carga
  mecánica, encapsulado de objetos (flores, insertos electrónicos decorativos)
```

---

## Vaciado en yeso

```
MATERIALES: yeso cerámico o dental (más resistente y detallado que el yeso de obra)
PROCESO: similar a la colada de resina — se vierte el yeso líquido en el molde de silicona,
  cura por reacción química con el agua, se desmoldea
APLICACIÓN: prototipos rápidos y baratos, piezas decorativas, moldes maestros intermedios
  para procesos de fundición en arena (el positivo de yeso se usa para hacer el molde de
  arena final en fundición tradicional de metal a mayor escala)
```

---

## Tolerancias y juego específico de moldes

```
SHRINKAGE DEL MASTER IMPRESO: heredado de la nota de materiales — PLA 0,2-0,5%, ABS
  0,5-1,5%, resina 2-4% — hay que compensarlo en el CAD del master ANTES de imprimir,
  no después, porque afecta directamente a la dimensión final de cada pieza producida
CONTRACCIÓN DE LA SILICONA AL CURAR: típicamente <0,5% en siliconas de platino de calidad
  — pequeña pero acumulable si se necesita precisión dimensional alta en la pieza final
CONTRACCIÓN DEL MATERIAL DE COLADA: la cera se contrae notablemente al enfriar (varía
  según tipo, 1-3% habitual), la resina epoxi contrae poco (<1%), el yeso prácticamente
  nada — cada eslabón de la cadena master→molde→colada suma su propio error dimensional
JUEGO DE ENSAMBLAJE EN PIEZAS PRODUCIDAS EN MOLDE: 0,1-0,2mm típico, igual que en
  impresión directa — pero aquí se añade la incertidumbre acumulada de cada contracción
  de la cadena, así que en piezas de precisión conviene sobredimensionar el master un
  poco más que en una pieza impresa directamente para uso único
```

---

## Aplicaciones prácticas por sector

```
JABONES Y VELAS: molde de silicona directo desde master impreso (PLA/resina), sin
  necesidad de fundición metálica — el caso de entrada más simple y barato del workflow
RESINA/JOYERÍA: master en resina de alto detalle → molde de silicona de platino →
  colada de resina epoxi pigmentada o cera perdida en plata para pieza final metálica
PIEZAS DE REPUESTO: útil cuando se necesita producir varias unidades de una pieza
  descatalogada — más barato en tiradas de 10-50 unidades que imprimir cada una en FDM/resina
  si el material final necesita propiedades que el filamento no da (por ejemplo, metal)
ÚTILES DE TALLER: moldes para piezas de goma/silicona funcionales (topes, juntas
  personalizadas) que no tiene sentido imprimir directamente por su naturaleza elástica
```

---

## Errores comunes en moldes

```
★★★★★ Olvidar el ángulo de desmoldeo en caras verticales del master — el molde se
  desgarra al intentar extraer la primera pieza colada, inutilizando el molde entero
★★★★☆ No sellar la porosidad de un master impreso en FDM antes de silicona — la silicona
  se mete en las micro-líneas de capa y reproduce esa textura en cada pieza colada
★★★★☆ Usar silicona de condensación (barata) para una tirada larga esperando la
  durabilidad de una de platino — el molde se degrada mucho antes de lo esperado
★★★☆☆ No calcular bebedero ni mazarota en moldes cerrados de piezas medianas/grandes —
  aparecen burbujas atrapadas y rechupes que arruinan el acabado de cada pieza colada
★★★☆☆ No compensar el shrinkage acumulado de toda la cadena (master→silicona→colada) en
  piezas que necesitan encajar con algo externo ya fabricado
```

---

## Novedades 2025-2026

```
→ Catálogo de resinas de impresión directa específicas para tolerar contacto repetido
  con silicona/cera (Liqcreate y similares) crece como alternativa intermedia entre
  imprimir el molde en FDM y hacer un molde de silicona completo desde un master
→ Resinas "castable" (formuladas para quemado limpio en fundición a la cera perdida)
  se afinan en composición para dejar menos ceniza residual, mejorando el acabado final
  de piezas de joyería en metal fundido desde master impreso
→ El abaratamiento generalizado de impresoras de resina de alta resolución (Elegoo Saturn
  4 Ultra, ver [[Máquinas de resina — MSLA, DLP y Formlabs]]) pone masters de detalle fino
  al alcance de talleres pequeños que antes dependían de mecanizado o modelado manual
```
