---
tipo: tecnica
sector: impresion-3d
tags: [postprocesado, lijado, acetona, XTC-3D, pintura, curado, electrodeposicion]
---
# Postprocesado — lijado, química, pintura y acabados

> La pieza "sale bien de la impresora" y la pieza "está terminada" son dos cosas distintas — el postprocesado es donde se nota si alguien sabe lo que hace, no solo si sabe pulsar "imprimir".

---

## Postprocesado FDM — mecánico

```
LIJADO EN SECO: papel de grano progresivo (120 → 220 → 400 → 600) elimina líneas de capa
  visibles y prepara la superficie para imprimación/pintura — orden crítico, saltar grano
  deja marcas del grano anterior visibles bajo la pintura
LIJADO EN HÚMEDO (agua + papel de grano fino, 800-1500): acabado final tras la imprimación,
  reduce el polvo respirable frente al lijado en seco — recomendable con PLA/PETG
LIMADO Y CUCHILLA: para eliminar rebabas de soporte y líneas de costura (seam) antes de
  empezar el lijado — hacerlo siempre antes, no después, del lijado fino
```

---

## Postprocesado FDM — químico (solo materiales específicos)

```
VAPOR DE ACETONA — SOLO PARA ABS Y ASA (nunca PLA/PETG/TPU, no reacciona igual)
  Proceso: la pieza se expone a vapor de acetona en un recipiente cerrado (no sumergir
  directamente salvo técnica controlada) — la acetona disuelve ligeramente la superficie,
  fundiendo las líneas de capa entre sí y dejando un acabado brillante casi de inyección
  Riesgo: acetona es inflamable y sus vapores son tóxicos con exposición prolongada —
  hacerlo en espacio ventilado, nunca cerca de llama, con guantes y idealmente extracción
  Resultado: excelente para piezas decorativas ABS, pero reduce ligeramente precisión
  dimensional (la superficie "se funde" unas décimas de milímetro)

XTC-3D (Smooth-On) — recubrimiento epoxi de dos componentes
  Proceso: se aplica con pincel sobre la pieza limpia — penetra en las estrías de capa y
  crea una película de alto brillo y dureza al curar (unas horas a temperatura ambiente)
  Ventaja frente a acetona: funciona en CUALQUIER material FDM (PLA incluido), no solo ABS
  Precio orientativo: bote de ≈644g en torno a 30-45€ en tiendas especializadas España
  Uso típico: piezas que van a pintarse después (sella la porosidad y da base lisa) o
  piezas decorativas que se dejan con ese acabado brillante directamente
```

---

## Pintura y acabado final

```
PREPARACIÓN: imprimación en spray (filler primer) tras el lijado — rellena micro-poros
  residuales y da una superficie uniforme para que el color final se agarre parejo
APLICACIÓN: spray para superficies grandes/uniformes, pincel para detalle/miniaturas —
  varias capas finas dan mejor resultado que una capa gruesa (evita chorreo y grumos)
SELLADO FINAL: barniz mate/satinado/brillante según acabado deseado, protege la pintura
  del roce y de la luz UV si la pieza va a estar expuesta al exterior
```

---

## Electrodeposición de cobre y níquel (electroplating)

```
PRINCIPIO: la pieza impresa se recubre primero con una capa conductora (pintura de cobre
  conductiva o grafito conductivo) y luego se sumerge en un baño electrolítico donde una
  corriente deposita metal (cobre, después opcionalmente níquel) sobre esa capa conductora
RESULTADO: pieza con acabado y tacto metálico real, más resistente al desgaste superficial
  que la pieza de plástico desnuda — técnica popular en la comunidad de props y cosplay
COMPLEJIDAD: requiere fuente de alimentación DC, electrolito de sulfato de cobre, ánodo de
  cobre y control de tiempo/corriente — nivel de dificultad notablemente superior al resto
  de técnicas de esta nota, con manejo de químicos que exige precaución (guantes, ventilación)
```

---

## Postprocesado de resina — lavado y curado

```
LAVADO EN IPA (alcohol isopropílico, ≥90%): elimina la resina líquida sin curar que queda
  adherida a la superficie — 2 fases recomendadas (lavado sucio + aclarado en IPA más
  limpio) da mejor resultado que un único baño que se va contaminando con el uso
LAVADO EN AGUA (solo resinas water-washable): mismo principio, con agua en vez de IPA —
  el agua de lavado NO es apta para verter directamente al desagüe (ver nota de normativa)
CURADO UV FINAL: tras el lavado y secado, la pieza pasa por una cámara/estación de curado
  UV (los mismos 405nm de la impresión) durante minutos — completa la polimerización y
  estabiliza mecánicamente la pieza, que antes de esto sigue siendo relativamente frágil
  y puede seguir liberando compuestos
LIJADO/PULIDO EN RESINA CURADA: igual que en FDM, grano progresivo — la resina permite
  pulido a espejo con pastas abrasivas finas por su superficie ya de por sí muy lisa
```

---

## Tabla resumen — qué técnica para qué objetivo

```
OBJETIVO                          TÉCNICA RECOMENDADA
Eliminar líneas de capa (ABS)     Vapor de acetona
Eliminar líneas de capa (PLA/PETG) XTC-3D o lijado progresivo + imprimación
Preparar para pintura              Lijado + imprimación filler
Acabado metálico real              Electrodeposición (cobre/níquel)
Pieza de resina lista para uso     Lavado 2 fases + curado UV completo
Máximo brillo sin pintar           XTC-3D o pulido fino de resina
```

---

## Errores comunes de postprocesado

```
★★★★★ Usar acetona sobre PLA esperando el mismo efecto que en ABS — el PLA no reacciona
  igual, la pieza puede quedar dañada de forma irregular sin el acabado buscado
★★★★☆ Manipular piezas de resina "recién lavadas" sin guantes creyendo que ya están
  curadas — sin el curado UV final la pieza sigue siendo químicamente activa
★★★☆☆ Saltar granos de lija (pasar de 120 directo a 600) para ahorrar tiempo — deja
  marcas del grano grueso que la imprimación no oculta y se ven bajo la pintura final
★★★☆☆ No ventilar al trabajar con vapor de acetona o electrolito de electrodeposición —
  ambos procesos generan vapores/gases que requieren espacio ventilado, no un garaje cerrado
```

---

## Novedades 2025-2026

```
→ Las estaciones de lavado+curado automatizadas (incluidas ya en muchos kits de resina de
  gama media) reducen el error humano en tiempos de lavado/curado, mejorando consistencia
  del acabado final frente al método manual con cubo de IPA y lámpara UV casera
→ Crece la oferta de recubrimientos epoxi tipo XTC-3D de marcas alternativas a precio más
  competitivo, ampliando el acceso a este acabado más allá del producto Smooth-On original
```
