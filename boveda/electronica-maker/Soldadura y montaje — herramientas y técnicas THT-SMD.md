---
tipo: componente
sector: electronica-maker
tags: [soldadura, estano, tht, smd, reflow, jbc, hakko, pinecil]
---
# Soldadura y montaje — herramientas y técnicas THT-SMD

> Soldar bien es un músculo, no un conocimiento — se aprende con la punta caliente en la mano, y la diferencia entre una unión fría (que falla meses después) y una unión perfecta (que dura décadas) está en la temperatura, el tiempo de contacto y la limpieza, no en el precio del soldador.

---

## Estaciones de soldadura — de entrada a profesional

```
NIVEL ENTRADA (25-50€)
  Soldador básico regulable (tipo Yihua 936 clon) — control de temperatura analógico
  Precio: 20-35€ · suficiente para THT ocasional, no ideal para SMD fino

Pinecil (Pine64) — soldador portátil USB-C PD, código abierto, muy recomendado
  Precio: 25-30€ (sin fuente) · necesita fuente USB-C PD de 65W+ para rendimiento pleno
  Ventaja: calienta en segundos, firmware open-source, tamaño de bolígrafo grueso

NIVEL INTERMEDIO (60-150€)
  X-Tronic 5040-XR3 — estación completa con soldador + desoldador de aire caliente
  Precio: 80-120€ · uso: quien empieza a hacer SMD y necesita retirar componentes

Hakko FX888D — el favorito de makers serios, control PID preciso, muy fiable
  Precio: 100-140€ · uso: soldadura diaria/semanal, THT y SMD de tamaño normal (0805+)

NIVEL PROFESIONAL (150-400€+)
  JBC CD-2SBE / T245 — el estándar de la industria electrónica profesional
  Precio: 200-350€ · calentamiento en 2 segundos, puntas de recambio de altísima calidad
  Weller WHS40 / WE1010 — alternativa profesional consolidada
  Precio: 150-250€
```

---

## Estaño y fundente

```
Estaño con plomo (Sn60Pb40) — funde a menor temperatura (183°C), más fácil para principiante
  Precio: 8-15€/100g · uso: hobby personal (no apto para producto que se vende a terceros
  en la UE, restringido por RoHS salvo excepciones)

Estaño sin plomo (SAC305, Sn96.5Ag3Cu0.5) — funde más alto (217-220°C), obligatorio en
  producto comercial europeo por normativa RoHS
  Precio: 12-20€/100g · más difícil de trabajar para un principiante (necesita más calor
  y algo más de práctica para uniones limpias)

Fundente (flux) — imprescindible para SMD y reparaciones
  Flux en gel/pluma: 4-8€ · limpia óxidos, mejora el mojado del estaño, evita puentes
  Limpiar residuos con isopropanol (IPA) al 90%+ tras soldar SMD
```

---

## Técnica THT (Through-Hole) — componentes con patas

```
1. Preparar: fijar la placa (tercera mano o soporte), limpiar puntas del soldador
2. Insertar el componente, doblar patas ligeramente para que no se caiga
3. Calentar la unión (pad + pata) 1-2 segundos ANTES de aportar estaño
4. Aportar estaño al punto de unión (no al soldador) — 1-2 segundos más
5. Retirar estaño, luego soldador, dejar enfriar sin mover 2-3 segundos
6. Cortar sobrante de pata con alicates de corte

Temperatura recomendada: 320-350°C (con plomo) · 350-380°C (sin plomo)
Señal de unión buena: cono brillante, forma de "volcán" suave, sin bultos
```

---

## Técnica SMD (Surface Mount) — componentes de superficie

```
Método soldador fino (para 0805, 0603, algunos 0402)
  1. Aplicar una gota de estaño en UNO de los pads
  2. Sujetar el componente con pinzas, calentar ese pad para fijarlo
  3. Soldar el resto de pads con normalidad

Método pasta + reflow (para SMD masivo, QFN, BGA)
  1. Aplicar pasta de soldadura con plantilla (stencil) o jeringa
  2. Colocar componentes con pinzas (o pick and place)
  3. Reflow en horno (perfil de temperatura: precalentar → soak → reflow → enfriar)

Reflow casero con freidora de aire / horno tostador modificado
  Precio conversión: 40-80€ (freidora de aire + controlador PID externo tipo Inkbird)
  Perfil típico SAC305: precalentar a 150°C (60-90s) → subir a 217°C (pico 245°C, 30-60s)
  → enfriar gradual. Suficiente para placas maker de hasta 2 capas con SMD estándar.
```

---

## Herramientas complementarias imprescindibles

```
Multímetro digital — continuidad, voltaje, resistencia, algunos con capacímetro
  Básico: 10-20€ (Aneng) · profesional: 40-100€ (Fluke 101/115)

Tercera mano con lupa — sujeta la placa mientras sueldas
  Precio: 8-20€

Extractor de estaño (pera/bomba de succión) y trenza desoldadora
  Precio: 3-6€ ambos · imprescindibles para corregir errores y reciclar componentes

Estación de aire caliente (hot air) — para retirar/soldar SMD y QFN sin soldador
  Integrada en estaciones tipo X-Tronic o como unidad aparte (858D, 30-50€)

Alcohol isopropílico (IPA) 90%+ y cepillo antiestático — limpieza de flux tras soldar
```

---

## Errores comunes

```
1. Soldadura fría (unión mate, granulosa) por temperatura insuficiente o movimiento
   durante el enfriado → falla eléctricamente semanas/meses después, difícil de diagnosticar
   Solución: re-soldar con más temperatura, no tocar la unión hasta que esté fría

2. Exceso de estaño "por si acaso" → oculta el estado real de la unión, riesgo de
   puentes entre pads cercanos, especialmente en SMD
   Regla: menos estaño del que parece necesario suele ser lo correcto

3. Calentar demasiado tiempo un componente sensible (LED, IC) → daño térmico
   permanente. Límite general: no más de 3-4 segundos de contacto continuo en un pin

4. No limpiar la punta del soldador entre uniones → punta oxidada que no transfiere
   calor bien, soldaduras de mala calidad. Usar esponja húmeda o "brass wool" a menudo

5. Trabajar sin ventilación con estaño con plomo o sin fundente adecuado
   → los humos de flux/plomo son tóxicos por inhalación repetida. Ventilación o
   extractor de humos de soldadura es obligatorio para uso frecuente, no opcional

6. Ajustar mal la corriente de una freidora de aire para reflow casero → sobrecalienta
   y quema componentes, o se queda corta y no llega a fundir el estaño sin plomo (217°C)
```

---

## Novedades 2025-2026

```
→ El Pinecil (v2) sigue ganando terreno como soldador de bolsillo open-source de
  referencia en la comunidad maker, gracias a firmware personalizable y precio agresivo
  frente a soldadores de marca cerrados con USB-C PD equivalente.
→ Los controladores PID externos tipo Inkbird para convertir freidoras de aire en
  hornos de reflow caseros se han estandarizado como la vía low-cost más repetida en
  tutoriales y comunidades para pasar de THT a SMD sin comprar un horno de reflow
  comercial (300€+).
```

→ Diseñar la placa antes de soldarla: [[Diseño de PCB — flujo KiCad]]
→ Verificar la soldadura tras montar: [[Test y verificación — sigrok y herramientas]]
