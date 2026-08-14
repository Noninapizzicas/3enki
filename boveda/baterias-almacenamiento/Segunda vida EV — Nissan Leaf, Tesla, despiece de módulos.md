---
tipo: componente
sector: baterias-almacenamiento
tags: [segunda-vida, nissan-leaf, tesla, modulos, ev, second-life]
---
# Segunda vida EV — Nissan Leaf, Tesla, despiece de módulos

> Una batería de coche eléctrico "agotada" para la autonomía de conducción sigue teniendo, en la mayoría de los casos, el 70-80% de su capacidad original — suficiente para dar 10 años más de servicio parado en un garaje, donde el peso y el volumen ya no importan.

---

## Por qué la segunda vida tiene sentido económico y técnico

```
UNA BATERÍA DE COCHE SE RETIRA cuando su capacidad cae por debajo de un
  umbral que ya no es aceptable para uso automotriz (habitualmente 70-80%
  de la capacidad original) — pero en una aplicación ESTACIONARIA, donde
  no importa el peso ni el espacio, ese mismo módulo sigue siendo útil
  durante años más

VENTAJA FRENTE A CELDA NUEVA: coste por kWh muy inferior al de un banco
  LiFePO4 nuevo, con la contrapartida de mayor incertidumbre sobre el
  estado real, necesidad de adaptar voltajes y, en química NMC (Leaf,
  Tesla más antiguos), menor vida útil residual que el LiFePO4 nuevo
```

---

## Nissan Leaf — el origen más citado en la comunidad DIY europea

```
GENERACIÓN 1 (2010-2017, batería 24/30 kWh, química NMC/manganeso)
  Módulo individual: 2 celdas en serie, capacidad nominal ~64Ah por celda
  Configuración típica de dos módulos: 128Ah, 28,1 kWh a 220V nominal, o
  14 kWh a 110V — según cómo se agrupen los módulos en serie/paralelo
  Voltaje del pack completo original: ~360-403V (96 celdas en serie)

GENERACIÓN 2 (2017+, batería 40/62 kWh, química mejorada)
  Módulos de mayor capacidad y densidad, más citados en 2025-2026 como
  origen de módulos de segunda vida a medida que este parque envejece

DÓNDE CONSEGUIR MÓDULOS EN ESPAÑA/EUROPA:
  evshop.eu — venta de módulos Nissan Leaf Gen 2 (24kWh) sueltos, con
  especificaciones publicadas, opción habitual para proyecto DIY europeo
  Desguaces especializados en VE y comunidades de talleres de retrofit
  (empresas que actualizan baterías de Leaf ofrecen a veces las retiradas)
  Retrofit comercial de Leaf: empresas ofrecen sustituir la batería
  original por una de mayor capacidad (40-70 kWh) desde ~7.400-8.900€ —
  la batería retirada del cliente puede convertirse en banco doméstico,
  con precios de referencia de mercado desde ~5.000€ para un pack de
  18kWh ya integrado con inversor (oferta comercial, no DIY puro)

RIESGO A CONSIDERAR: química NMC de estos módulos tiene menor umbral de
  seguridad térmica que LiFePO4 — ver [[Seguridad — thermal runaway, almacenamiento, extinción de incendios]]
  y requiere BMS y gestión térmica más cuidadosa que un banco LiFePO4 nuevo
```

---

## Tesla — celdas 21700 y módulos de alto voltaje

```
MODEL 3/Y (celda 21700, Panasonic/Tesla, química NCA)
  Estructura interna: "bricks" de 46 celdas 21700 en paralelo, varios
  bricks conectados en serie forman el módulo — mayor complejidad de
  despiece que el formato prismático de Leaf
  Voltaje de módulo: varía según posición en el pack, habitualmente en
  el rango de decenas de voltios por módulo — requiere documentación
  específica del modelo/año antes de manipular

MODEL S/X (formato más antiguo, también celda cilíndrica pequeña)
  Comunidad activa en foros internacionales (secondlifestorage.com) con
  proyectos documentados de powerwall casero a partir de estos módulos

COMPLEJIDAD DE DESPIECE: significativamente mayor que Leaf — el formato
  "brick" de celdas pequeñas en paralelo exige más trabajo de separación
  y verificación individual, y el pack completo trabaja a alta tensión
  (300-400V+), lo que eleva el riesgo eléctrico del despiece considerablemente
  → Recomendado solo para quien ya tiene experiencia previa con voltajes
  de ese orden, o comprando módulos ya despiezados y verificados a un
  proveedor especializado, no despiezando el pack completo en casa
```

---

## Otros orígenes de segunda vida

```
KIA/HYUNDAI (e-Niro, Kona, Ioniq) — módulos prismáticos de gran capacidad,
  cada vez más presentes en el mercado de segunda mano europeo a medida
  que este parque envejece
BYD (Blade, formato celda-a-pack) — sin módulo intermedio tradicional,
  despiece distinto y más reciente en el mercado de segunda vida europeo
BMW i3 — módulos pequeños y bien documentados en la comunidad DIY,
  formato manejable para proyectos de menor escala
```

---

## Proceso de evaluación de un módulo de segunda vida

```
1. VOLTAJE EN REPOSO: medir con multímetro, comparar con la especificación
   del fabricante para ese modelo — una desviación grande indica celdas
   internas dañadas o muy desequilibradas

2. RESISTENCIA INTERNA: si el módulo tiene acceso a celdas individuales,
   testear con equipo adecuado — resistencia anormalmente alta indica
   degradación avanzada

3. INSPECCIÓN VISUAL: hinchazón, corrosión en terminales, signos de fuga
   de electrolito — cualquiera de estos es motivo de descarte inmediato

4. TEST DE CAPACIDAD BAJO CARGA CONTROLADA: ciclo completo de carga/
   descarga con equipo capaz de manejar la corriente del módulo, midiendo
   capacidad real extraída frente a la nominal de fábrica

5. VERIFICACIÓN DE HISTORIAL SI ES POSIBLE: kilometraje del vehículo de
   origen, año, si el pack sufrió algún incidente (choque, sumersión) —
   proveedores serios de módulos documentan esto
```

---

## Errores comunes en proyectos de segunda vida

```
★★★★★ Despiezar un pack completo de alta tensión (300V+) sin experiencia
  ni aislamiento eléctrico adecuado — el riesgo de electrocución con
  packs de VE es real y ha causado accidentes graves documentados en la
  comunidad internacional; empezar siempre con módulos ya despiezados
  de proveedor especializado si no se tiene experiencia previa
★★★★☆ Mezclar módulos de distinto origen/año/estado en el mismo banco sin
  evaluarlos individualmente primero — el desequilibrio entre módulos de
  distinta salud reduce la capacidad útil de todo el conjunto
★★★★☆ Ignorar que módulos NMC (Leaf, Tesla más antiguos) tienen mayor
  riesgo térmico que LiFePO4 nuevo — dimensionar la gestión térmica y el
  BMS acorde a esa química, no como si fuera LiFePO4
★★★☆☆ No verificar compatibilidad de voltaje del banco resultante con el
  inversor previsto antes de comprar los módulos — la configuración
  serie/paralelo de módulos de coche no siempre encaja limpiamente en
  los rangos de voltaje estándar de inversores híbridos residenciales
```

---

## Novedades 2025-2026

```
→ Nissan ha lanzado un producto comercial propio de segunda vida: un
  generador portátil de 14,4kg con dos módulos de Leaf de 1ª generación
  reutilizados, señal de que los propios fabricantes empiezan a formalizar
  el mercado de segunda vida en vez de dejarlo solo a la comunidad DIY.
→ Empresas de retrofit de batería de Leaf (sustitución por packs de mayor
  capacidad) generan un flujo creciente de baterías originales retiradas
  disponibles para reutilización doméstica en el mercado europeo.
→ El parque de VE con química LFP (BYD Blade, Tesla RWD con celdas CATL)
  empieza a generar sus primeros módulos de segunda vida con mejor perfil
  de seguridad térmica que la generación NMC anterior — tendencia a vigilar
  de cara a 2027-2028 según envejezca ese parque.
```

---

→ Diseño del banco doméstico con estos módulos: [[PowerWall DIY — diseño de sistema doméstico de almacenamiento]]
→ Seguridad específica de química NMC recuperada: [[Seguridad — thermal runaway, almacenamiento, extinción de incendios]]
→ BMS adecuado para módulos desiguales: [[BMS — selección, cableado y protecciones]]
