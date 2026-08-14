---
tipo: tecnica
sector: carpinteria-metalica
tags: [planos, chapa, despliegue, tolerancias, diseno-tecnico]
---
# Planos técnicos — vistas, despliegue de chapa, tolerancias de plegado

> Un plano mal desarrollado se descubre cuando ya has cortado la chapa: leer y dibujar el despliegue correctamente es la diferencia entre una pieza que encaja a la primera y una que sobra 3mm en cada doblez.

---

## Vistas básicas de un plano de taller

```
VISTA FRONTAL, SUPERIOR Y LATERAL — el mínimo para definir cualquier pieza sin ambigüedad
VISTA EN SECCIÓN (corte) — cuando hay geometría interna que las vistas exteriores no muestran
  (nervios, refuerzos, huecos ocultos)
VISTA DESPLEGADA — para piezas de chapa doblada: muestra la pieza "aplanada" antes del plegado,
  con las líneas de doblez marcadas — la vista imprescindible para cortar la chapa en bruto

SÍMBOLOS HABITUALES EN UN PLANO DE CHAPA:
  → línea de plegado: línea discontinua con indicación de ángulo y sentido (hacia arriba/abajo)
  → símbolo de soldadura: flecha + símbolo normalizado indicando tipo de cordón y lado
  → símbolo de acabado superficial: rugosidad, si aplica
  → cotas de agujero: diámetro (Ø) y posición desde referencia clara (no acumulada punto a punto)
```

## El despliegue de chapa — la pieza plana antes de doblar

```
POR QUÉ IMPORTA: cuando la chapa se dobla, el material no se comprime ni se estira de forma
  uniforme — el eje neutro (la "capa" del material que ni se estira ni se comprime) se desplaza
  hacia el interior de la curva, y calcular mal ese desplazamiento hace que la pieza final salga
  más larga o más corta de lo previsto

FACTOR K: relación entre la posición del eje neutro y el espesor total de la chapa
  Rango habitual: 0,3-0,5 según material, ángulo y radio de plegado
  K más bajo (≈0,3): materiales blandos, radios de plegado grandes
  K más alto (≈0,5): materiales duros, radios de plegado ajustados

TOLERANCIA DE PLEGADO (Bend Allowance, BA): longitud adicional de material que hay que sumar al
  desarrollo plano para que la pieza doblada tenga las dimensiones exteriores exactas deseadas
  → en la práctica del taller pequeño, sin calculadora de plegado profesional: hacer una probeta de
  prueba en el mismo material y espesor, medir el resultado real y ajustar la próxima vez — más
  fiable que una fórmula aplicada sin verificar en la máquina real que se va a usar

RADIO MÍNIMO DE PLEGADO: por debajo de cierto radio (dependiente del espesor y del material) el
  metal se agrieta en el exterior de la curva — regla práctica de taller: radio mínimo ≈ el espesor
  del material para acero dulce; mayor margen en aceros de alta resistencia
```

## Herramientas para dibujar y desarrollar planos de chapa

```
FREECAD SHEETMETAL (gratuito, open source) — genera automáticamente el desarrollo plano a partir
  de una pieza 3D doblada, exporta a DXF para corte con plasma o láser
  → guía completa y flujo con nesting: [[../metalurgia-diy/Chapa — diseño y desarrollo plano|Chapa — diseño y desarrollo plano (Metalurgia DIY)]]

A MANO (nivel 0-1): regla, escuadra, calculadora, y la probeta de prueba mencionada arriba — sigue
  siendo el método más honesto para quien no diseña en 3D y trabaja piezas simples y repetitivas

SKETCHUP / FREECAD PARA PIEZAS 3D SIN CHAPA DOBLADA (estructuras de perfil y tubo, no chapa plegada):
  suficiente con dibujo en 3D simple y lista de cortes — no hace falta el módulo de chapa si no hay
  plegado implicado
```

---

## Cómo dibujar un plano de taller útil (aunque sea a mano)

```
1. VISTA GENERAL ACOTADA de la pieza terminada — medidas exteriores, sin ambigüedad
2. LISTA DE CORTE (despiece): cada barra/pletina/tubo con su longitud exacta y cantidad —
   evita comprar de más o quedarse corto de material
3. VISTA DESPLEGADA (si hay chapa a doblar) con líneas de plegado y ángulo indicado
4. NOTAS DE PROCESO: qué se suelda, qué se atornilla, qué acabado lleva cada zona — evita decisiones
   improvisadas a mitad de proyecto que luego cuesta deshacer
```

---

## Errores comunes

```
1. NO SUMAR LA TOLERANCIA DE PLEGADO AL DESARROLLO PLANO — la pieza sale sistemáticamente más corta
   de lo esperado en piezas con varios dobleces
2. ACOTAR DESDE PUNTOS ACUMULADOS EN VEZ DE UNA REFERENCIA COMÚN — el error de cada cota se suma al
   siguiente, y al final del despiece la pieza no cierra
3. IGNORAR EL RADIO MÍNIMO DE PLEGADO PARA EL ESPESOR ELEGIDO — grietas en el doblez que obligan a
   rehacer la pieza
4. DISEÑAR SIN VERIFICAR LA CAPACIDAD REAL DE LA HERRAMIENTA DISPONIBLE — un plano perfecto en CAD
   que exige una plegadora de 3m cuando en el taller solo hay una de 1m es papel mojado
```

---

## Novedades 2025-2026

```
→ FreeCAD SheetMetal sigue madurando como alternativa gratuita real a software de pago (SolidWorks
  Sheet Metal) para el maker que necesita exportar DXF con desarrollo plano correcto
→ Más servicios de corte a medida por plasma/láser en España aceptan directamente archivo DXF subido
  por el cliente, acelerando el paso de "diseño en casa" a "pieza cortada" sin pasar por presupuesto
  manual previo
```

---

## Ver también

→ Diseño avanzado de chapa y nesting: [[../metalurgia-diy/Chapa — diseño y desarrollo plano|Chapa — diseño y desarrollo plano (Metalurgia DIY)]]
→ Física del doblado en taller: [[Doblado y conformado — pletina, tubo, chapa, matrices]]
→ Corte de la pieza ya desarrollada: [[Corte de metal — radial, plasma portátil, oxicorte, sierra de cinta]]
