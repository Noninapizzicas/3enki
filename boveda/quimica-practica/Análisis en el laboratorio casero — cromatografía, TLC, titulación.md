---
tipo: componente
sector: quimica-practica
tags: [cromatografia, TLC, titulacion, analisis, espectroscopia, laboratorio]
---
# Análisis en el laboratorio casero — cromatografía, TLC, titulación

## Cromatografía en papel — separar colores

```
PRINCIPIO: competencia entre la fase estacionaria (papel = celulosa polar) y el disolvente
  (fase móvil) que arrastra los componentes a velocidades distintas según su afinidad.

  Rf = distancia recorrida por el compuesto / distancia recorrida por el disolvente

  Rf alto → compuesto más afín al disolvente (más apolar si el solvente es apolar)
  Rf bajo → compuesto más retenido por el papel (más polar)
  Rf es característico del compuesto en ese sistema papel/disolvente

EXPERIMENTO 1 — separar la tinta de rotuladores:
  Papel de filtro (o papel de café) → trazar punto de rotulador 1cm del borde
  Disolvente: agua sola (polar) o agua+sal (50ml agua + 1g NaCl)
  Cromatógrafo: vaso alto, disolvente 0.5cm → papel en contacto pero el punto por encima
  Tiempo: 15-30 min → el disolvente asciende arrastrando los componentes del tinte
  
  RESULTADO TÍPICO:
  Rotulador negro Crayola: 3-4 bandas de color (el negro = mezcla de azul, rojo, amarillo)
  Rotulador azul Bic: 2 bandas (un azul que corre más + uno más retenido)
  Rotuladores permanentes: no migran con agua → usar etanol como disolvente

EXPERIMENTO 2 — separar clorofila de hojas verdes:
  Disolvente: mezcla acetona 9 : hexano 1 (o solo gasolina de mechero)
  Extraer: mortero → hoja + arena + acetona → filtrar → el extracto verde es la muestra
  Sistema: papel cromatográfico o papel de filtro grueso
  
  RESULTADO:
  Clorofila a: verde-azul (Rf ≈ 0.85 con hexano:acetona 9:1)
  Clorofila b: verde-amarillo (Rf ≈ 0.65)
  Xantofila: amarillo (Rf ≈ 0.45)
  β-caroteno: naranja brillante (Rf ≈ 0.98 — muy apolar, corre con el disolvente)
  La separación revela por qué las hojas se vuelven amarillo-naranja en otoño
  (la clorofila se degrada → quedan los carotenoides)
```

---

## TLC — cromatografía en capa fina

```
FASE ESTACIONARIA: placa de aluminio/vidrio recubierta de SiO₂ (sílice, polar) o Al₂O₃
  Compras: láminas TLC en silice (Merck, Macherey-Nagel) — 20-50€ por 25 láminas 20x20cm
  Alternativa económica: cortar en tiras 1×5cm → reduce el coste
  O DIY: pintar silice en gel + yeso sobre aluminio → funcional pero menos reproducible

PROCESO ESTÁNDAR:
  1. Preparar el eluyente (disolvente o mezcla) en el cubeto de TLC
    Ejemplos: hexano puro (apolares), acetato de etilo:hexano 1:3 (polaridad media)
    El cubeto debe tener atmósfera saturada → papel de filtro en las paredes mojado con el eluyente
  2. Aplicar muestra: capilar de vidrio → punto de 1mm a 1cm del borde inferior
  3. Introducir la placa → el disolvente sube por capilaridad (no sobrepasar la línea de muestra)
  4. Sacar cuando el frente llegue a 1cm del borde superior → marcar el frente
  5. REVELAR: los compuestos pueden ser incoloros → necesitan revelado

MÉTODOS DE REVELADO:
  UV 254nm: si la placa tiene indicador fluorescente → los compuestos apagan la fluorescencia
    (lámpara UV económica: 5-10€ en Amazon para 254+365nm)
  Yodo: colocar la placa en cámara con cristales de I₂ → manchas marrones en 1-3 min
  KMnO₄ (spray): 3g KMnO₄ + 20g K₂CO₃ + 5ml NaOH 5% en 300ml agua → calentar la placa
  Ninhidrina (aminoácidos): 0.5g en 100ml etanol → calentar → rosa-violeta para AA primarios
  Sulfúrico al 10% en etanol: calentar → carboniza → manchas negras (para todo, destructivo)

APLICACIONES PRÁCTICAS:
  Verificar pureza de un AE (aceite esencial):
    Muestra + hexano como eluyente → comparar patrón de manchas con referencia
  Controlar la saponificación de un jabón:
    Muestra disuelta en EtOH + placa + eluyente apolar → si aparece mancha de grasa: jabón incompleto
  Identificar adulterantes en aceite de oliva:
    AO virgen vs mezcla con aceites de semillas → patrón de carotenoides diferente
```

---

## Espectroscopia visible con DVD — el espectroscopio casero

```
PRINCIPIO: un DVD actúa como red de difracción (surcos a 1500 líneas/mm)
  La luz blanca se difracta → se separa en sus longitudes de onda → espectro visible

CONSTRUCCIÓN:
  Caja de cartón negro 20×10×5cm
  Rendija de entrada: 2 hojas de papel de aluminio separadas 0.5mm
  DVD roto: cortar trozo 4×4cm, pelar la cara reflectante (la película metálica superior)
    → queda la capa de policarbonato con las pistas → actúa como rejilla de difracción
  Montar el DVD a 45° respecto a la rendija → el ojo mira por una ventana lateral
  Resultado: espectro de color visible 380-700nm

EXPERIMENTOS:
  LUZ SOLAR (filtrada por papel pergamino): espectro continuo → rojo-naranja-amarillo-verde-azul-violeta
  LUZ DE SODIO (lámpara de vapor de sodio, farola naranja): solo 2 líneas → doublete D del sodio (589nm)
  LUZ DE NEÓN (rótulo de neón o tubo): líneas características del neón → naranja, rojo, amarillo
  LLAMA CON SALES: Na → amarillo intenso (589nm), Cu → verde (510-515nm), K → violeta (766nm)
  CLOROFILA EN ETANOL: ver la banda de absorción del rojo (660nm) → la solución aparece oscura ahí

MEJORA: cámara de móvil en la ventana → fotografiar y medir los picos con ImageJ (calibrar con 589nm del Na)
```

---

## Análisis de llama — identificación de cationes

```
TÉCNICA: los cationes en llama se excitan → emiten a longitudes de onda características

PROCEDIMIENTO:
  Alambre de platino o nicromo → calcinar hasta que no dé color a la llama (limpio)
  Mojar en HCl concentrado → recoger un poco de la muestra sólida/solución
  Introducir en la llama oxidante (azul) del mechero Bunsen o soplete doméstico

COLORES:
  Na⁺  → AMARILLO intenso (589nm) — incluso trazas son detectables (el Na es omnipresente)
  K⁺   → VIOLETA lila (766nm) — ver a través de un vidrio azul de cobalto (filtra el Na)
  Li⁺  → ROJO escarlata (671nm)
  Ca²⁺ → NARANJA-ROJO ladrillo (622nm)
  Sr²⁺ → ROJO carmesí (460nm)  (el mismo de los fuegos artificiales rojos)
  Ba²⁺ → VERDE manzana (513nm)  (fuegos artificiales verdes)
  Cu²⁺ → VERDE-AZUL (510nm)
  Fe   → NARANJA (líneas del hierro — no tan característico)

FUEGOS ARTIFICIALES — la química detrás:
  Rojo:    SrCO₃ o SrCl₂
  Verde:   BaCl₂ o BaNO₃
  Amarillo: NaNO₃ o Na₂C₂O₄
  Azul:    CuCO₃ (el más difícil — el Cu se oxida y pierde el color a alta temperatura)
  Blanco:  Mg o Al en polvo (emisión de cuerpo negro + líneas)
  Dorado:  Carbón de hierro o titanio
```

---

## Titulación — cuantificar lo invisible

```
PRINCIPIO: añadir un reactivo de concentración conocida (valorante) a la muestra hasta
  que se consuma exactamente el analito → el punto final se detecta con indicador o pHmetro

  C_analito × V_analito = C_valorante × V_valorante × (estequiometría)

TITULACIÓN ÁCIDO-BASE — acidez del vinagre:
  ANALITO: vinagre (CH₃COOH, concentración desconocida)
  VALORANTE: NaOH 0.1M preparado y estandarizado
  INDICADOR: fenolftaleína (incoloro en ácido, rosa en básico, viraje en pH 8.2-10)

  ESTANDARIZACIÓN DEL NaOH (primero verificar su concentración real):
  El NaOH absorbe CO₂ del aire → concentración deriva
  Patrón primario: biftalato potásico KHC₈H₄O₄ (PM=204.22) en farmacia/droguería
  Disolver masa exacta (pesada en balanza 0.01g) → titular con el NaOH
  C_NaOH = (masa_KHP / PM_KHP) / V_NaOH

  TITULACIÓN DEL VINAGRE:
  10ml de vinagre + 3 gotas de fenolftaleína en Erlenmeyer
  Añadir NaOH desde bureta en gotas → agitar → continuar hasta que la solución se vuelva
  rosa persistente (no desaparece en 30s) = punto de equivalencia
  Calcular: % acético = (C_NaOH × V_NaOH × 60.05) / (V_vinagre × 10 × ρ_vinagre) × 100
  Vinagre comercial español: 5-7% → verificar con la etiqueta

TITULACIÓN COMPLEJOMÉTRICA — dureza del agua:
  ANALITO: Ca²⁺ + Mg²⁺ en agua
  VALORANTE: EDTA 0.01M (ácido etilendiaminotetraacético)
  INDICADOR: negro de eriocromo T (NET) → rojo con Ca²⁺ y Mg²⁺, azul al finalizar la titulación
  pH: tampón amoníaco pH 10 para que el indicador funcione

  PROCEDIMIENTO:
  50ml de agua → añadir 1ml tampón NH₃ pH 10 → 5 gotas de NET → rojo-violeta
  Añadir EDTA desde bureta → agitar → en el punto final: viraje de rojo a azul puro
  Dureza total (°dH) = (C_EDTA × V_EDTA × 5607) / V_muestra

  Ejemplo: agua de Madrid ≈ 11-14°dH
```

---

## Refractometría — medir sin reactivos

```
PRINCIPIO: el índice de refracción n de una solución aumenta con la concentración del soluto
  n = c / v  (velocidad de la luz en vacío / en el medio)

REFRACTÓMETRO MANUAL (Brix):
  Coste: 5-15€ en AliExpress o tiendas agrícolas
  Escala Brix (°Bx): 1°Bx = 1g de sacarosa por 100g de solución
  Rango típico: 0-80°Bx

USOS PRÁCTICOS:
  Mosto de vino: 22-25°Bx → potencial alcohólico ≈ Bx × 0.55 = 12-14% ABV
  Mermelada: 65-68°Bx al final de la cocción → punto de gelificación correcto
  Hidromiel (antes): 28-35°Bx → potencial 15-19% ABV
  Jarabe de azúcar: 50% en peso ≈ 48°Bx
  Leche: 8.5-9°Bx → detectar adulteración con agua (baja el Bx)
  Anticongelante: tabla Bx→punto de congelación → protección hasta −20°C
  
CALIBRACIÓN:
  Agua destilada → debe leer 0°Bx (0.0% sacarosa → n=1.333)
  Si no lee 0: ajustar el tornillo de calibración con el destornillador incluido
  La temperatura afecta la lectura → los modelos de precisión tienen ATC (compensación automática)
```

---

## Tabla — qué técnica para qué pregunta

| Pregunta | Técnica | Coste del equipamiento |
|---|---|---|
| ¿Qué colores tiene esta tinta? | Cromatografía papel | 0€ |
| ¿Qué pigmentos tiene esta hoja? | Cromatografía papel + acetona | 1€ |
| ¿Es puro este AE? | TLC | 20-50€ (placas) |
| ¿Qué sales hay en esta llama? | Test de llama | 0€ |
| ¿Qué espectro emite esta lámpara? | Espectroscopio DVD | 0€ |
| ¿Cuánto ácido acético tiene este vinagre? | Titulación | 10-20€ |
| ¿Cuánta dureza tiene el agua? | Titulación EDTA | 10-20€ |
| ¿Qué concentración tiene este jarabe? | Refractómetro | 5-15€ |
| ¿Cuál es el pH exacto? | pH-metro digital | 20-40€ |
| ¿Cuántos sólidos disueltos? | TDS-metro | 5-15€ |
