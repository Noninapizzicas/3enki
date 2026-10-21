---
tipo: componente
sector: quimica-practica
tags: [polimeros, epoxi, bioplastico, almidon, PLA, resina, plastico]
---
# Polímeros y bioplásticos — epoxi, almidón, biorresinas

## Qué es un polímero

```
POLÍMERO = molécula de cadena larga formada por la unión repetida de monómeros

  n × (CH₂=CH₂)  →  [−CH₂−CH₂−]_n   (polietileno, PE)

PARÁMETROS CLAVE:
  Grado de polimerización (DP): número de monómeros por cadena
  Masa molar promedio: 10.000 - 10.000.000 g/mol según el polímero
  Tg (temperatura de transición vítrea): por debajo = frágil, por encima = flexible
  Tm (temperatura de fusión): cristalinos termoplásticos (PLA, nylon)

CLASIFICACIÓN:
  Termoplástico: se funde → moldea → solidifica al enfriar (reversible) — PLA, PET, ABS, HDPE
  Termoestable: reacciona en molde y ya no funde (irreversible) — epoxi, poliéster, fenol-formol
  Elastómero: red reticulada elástica — caucho natural, silicona, neopreno
```

---

## Resina epoxi — el material de referencia DIY

```
QUÍMICA:
  Resina epoxi = prepolímero con grupos epóxido (oxirano) en los extremos
  Endurecedor = amina primaria/secundaria o anhídrido → abre los grupos epóxido → red 3D

  R-CH−CH₂  +  H₂N-R' → R-CH(OH)-CH₂-NH-R' (la amina abre el epóxido → enlace covalente)
      O

  Ratio estequiométrico: depende del número de grupos epóxido (EEW) y amina (AHEW)
  EEW de la resina + AHEW del endurecedor → mezcla 1:1 o 2:1 según el sistema (leer ficha técnica)

TIPOS COMERCIALES:
  Laminación (fibra de vidrio/carbono): bajo contenido en burbujas, baja viscosidad
    West System 105/207, Resoltech 1050, SP Systems
  Vaciado (encapsulados, joyas): baja exotermia, lenta → no genera calor que deforma el molde
    Epodex, Resinpro Clear Coat, ArtResin
  Estructural (pegado, relleno): alta resistencia mecánica → Araldite 2011, Loctite EA9466
  UV (curado rápido en segundos): solo para capas finas (<3mm) → 405nm LED UV lamp

CONTROL DE LA MEZCLA:
  Medir en PESO, no en volumen (diferente densidad resina/endurecedor)
  Mezclar 3-5 min a fondo, raspar las paredes del recipiente
  Desgasificar: campana de vacío o calor suave (pistola de calor a 30°C → burbujas suben)
  Pot life: el tiempo antes de que la mezcla empiece a curar (5 min a 24h según tipo)
  Full cure: 24-72h a temperatura ambiente; 60°C post-cure = propiedades mecánicas máximas

EXOTERMIA:
  La polimerización es exotérmica: una masa grande puede llegar a 200°C y quemarse
  Para capas > 5mm de vaciado: curar en dos pasadas o usar resina de baja exotermia
  Síntoma: la mezcla se vuelve rígida antes de tiempo y queda amarillada → batch quemado
```

### Laminación con fibra de vidrio

```
TEJIDOS:
  Tejido de vidrio (E-glass): 200-600 g/m² → resistencia de tracción, bajo coste
  Tejido de carbono: 200-600 g/m² → módulo elástico alto, muy ligero, caro
  Tejido de kevlar: muy resistente al impacto, difícil de cortar, amarillo

PROCESO (infusión o laminación manual):
  1. Molde encerado (cera desmoldeante o Teflon release)
  2. Primer capa: resina + rodillo → saturar el tejido (relación resina:tejido ≈ 40:60 en peso)
  3. Segunda capa de tejido → más resina → más tejido (1-4 capas según espesor)
  4. Bolsa de vacío (60-80 mbar): compacta y extrae el exceso de resina → mejor ratio fibra/matriz
  5. Curar 24h + post-cure 60°C/4h → resistencia máxima

RATIO FIBRA/MATRIZ (FVF):
  Manual sin vacío: ~35% fibra (no óptimo)
  Con bolsa de vacío: ~50-55% fibra
  Prepreg + autoclave (industria aeronáutica): 60-65% fibra → máxima resistencia
```

---

## Bioplásticos de almidón — DIY inmediato

```
QUÍMICA:
  Almidón = polisacárido: amilosa (cadena lineal) + amilopectina (ramificada)
  Con agua caliente: gelatinización → gel viscoso
  Con glicerol: plastificante → el gel queda flexible al secar
  Con vinagre (ácido acético): rompe cadenas largas → más transparente

BIOPLÁSTICO BÁSICO (fórmula 1 — flexible):
  Almidón de maíz: 1 cucharada (10g)
  Agua: 4 cucharadas (60ml)
  Glicerina: 1 cucharada (10g)    → plastificante (más glicerina = más flexible)
  Vinagre blanco: 1 cucharadita (5ml)
  
  PROCESO:
  Mezclar en frío → calentar a fuego medio, remover constantemente
  A 60-70°C: la mezcla se vuelve transparente y gelatinosa (gelatinización)
  Verter en molde plano (papel de horno) → secar 24-48h a temperatura ambiente o 60°C/2h en horno
  Grosor objetivo: < 2mm → más grueso = más tiempo de secado y mayor riesgo de grietas

PROPIEDADES:
  Resistencia a tracción: 2-10 MPa (PE commercial: 15-30 MPa → menor, pero biodegradable)
  Biodegradación: compostaje en 1-3 meses (vs PE: 400-1000 años)
  Limitación: absorbe humedad → no apto para exteriores ni líquidos sin recubrimiento

VARIANTES:
  Con cáscaras de naranja trituradas (celulosa): refuerzo natural → más resistente
  Con agar-agar (2g por 100ml): bioplástico más transparente y fuerte
  Con almidón de patata: más elástico que el de maíz
  Con algas (alginato sódico + CaCl₂): gelificación en frío, transparente, comestible

BIOPLÁSTICO DURO (fórmula 2 — rígido):
  Almidón: 30g + agua: 60ml + sin glicerina (la ausencia de plastificante = rigidez)
  Añadir: gelatina en polvo 5g (proteína → mejora resistencia)
  Calentar, verter fino, prensar entre dos planchas → lámina rígida de 1mm
```

---

## PLA — el polímero de referencia maker (síntesis vs uso)

```
SÍNTESIS INDUSTRIAL (no DIY pero relevante entenderla):
  Glucosa (maíz, caña) → fermentación → ácido láctico → polimerización por condensación
  → PLA (ácido poliláctico) → pellets → filamento de impresión 3D

PROPIEDADES:
  Tg: 55-60°C (se deforma en coche en verano → punto débil en exteriores)
  Tm: 155-175°C → impresión a 190-220°C en impresoras 3D
  Módulo: 3.5 GPa (rígido), resistencia a tracción: 50-70 MPa
  Biodegradable: solo en compostaje industrial a > 58°C → no se biodegrada en compostera doméstica ni en el mar

VARIEDADES maker:
  PLA+ : más resistente y menos frágil (añaden PETG o aditivos de impacto)
  PLA-CF (fibra de carbono): módulo alto, superficie mate, impresión más difícil
  PLA-Silk: acabado brillante, menos resistencia mecánica (estético)
  PLA-Wood: fibras de madera + PLA → acabado visual madera, lijable
```

---

## Silicona — el elastómero más versátil

```
QUÍMICA: silicona = polímero de siloxano [-Si(R)₂-O-]_n
  Dos tipos de curado:
  Condensación (Tipo A): catalizador de estaño, libera alcohol → cura lenta, olor a vinagre
    Platino puede inhibirse (contaminación por aminas, azufre, látex)
  Adición (Tipo B, platinum cure): sin subproductos, cura precisa, no libera nada
    El estándar de moldes de alta definición → reproducción hasta 0.1µm de detalle

COMPRA: Silicona de platino en kits (componente A + B, ratio 1:1 o 1:10 según fabricante)
  Smooth-On Dragon Skin, EcoFlex, Mold Star → los nombres de referencia en el sector
  Alternativa económica: siliconas de platino chinas (AliExpress) — calidad variable

APLICACIONES:
  Moldes de jabón, chocolate, resina (curado de platino — no inhibe con resinas epoxi)
  Prótesis y suavizadores (EcoFlex 00-30 → dureza 00-30 Shore A, muy blando)
  Partes con forma compleja: colada directa sobre el objeto + desmolde

TEST DE INHIBICIÓN (por platino):
  Antes de verter la silicona sobre el objeto → probar en una zona pequeña
  Si cura: seguir. Si queda pegajosa: inhibición → limpiar con acetona, sellar con laca, probar de nuevo
  Los inhibidores comunes: látex, sulfuro, algunas maderas (nogal, cedro), aminas
```

---

## Resina de poliéster — para grandes superficies

```
QUÍMICA: poliéster insaturado + estireno + MEKP (peróxido de metil etil cetona) → catalizador
  El estireno actúa como diluyente reactivo y se polimeriza en la red
  ⚠ ESTIRENO: VOC tóxico, olor fuerte → solo exterior o con extracción potente

USO COMÚN: cascos de barcos, depósitos, reparaciones de carrocería
  Más barato que el epoxi, más adecuado para grandes volúmenes
  Menor adherencia y resistencia al agua que el epoxi → no para estructuras de alta exigencia

RATIO DE CATALIZADOR (MEKP):
  1-2% sobre el peso de resina → pot life 20-40 min
  3-4%: pot life más corto (10 min) → útil en frío
  0.5%: curado muy lento → no recomendado (puede quedar "forever wet")

COMPARATIVA RÁPIDA:
  Epoxi    → mejor adherencia, sin VOC de estireno, más caro, para estructuras
  Poliéster → más barato, necesita ventilación, para superficies grandes no estructurales
  Vinilester → intermedio, muy buena resistencia química → depósitos, tuberías
```
