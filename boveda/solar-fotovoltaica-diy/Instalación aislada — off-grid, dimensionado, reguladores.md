---
tipo: tecnica
sector: solar-fotovoltaica-diy
tags: [off-grid, aislada, MPPT, PWM, dimensionado, generador-respaldo]
---
# Instalación aislada — off-grid, dimensionado, reguladores

> Sin red de respaldo, cada error de cálculo se paga en las noches sin luz de febrero — el off-grid es el nivel donde el dimensionado deja de ser una optimización de ahorro y pasa a ser una cuestión de que el sistema funcione, punto.

---

## Arquitectura del sistema aislado

```
COMPONENTES:
  Paneles solares → REGULADOR DE CARGA (MPPT o PWM) → Banco de baterías →
  Inversor off-grid → consumo AC de la vivienda/cabaña
  [Opcional] Generador de respaldo (diésel/gasolina) para días de baja producción

FLUJO DIARIO:
  Día con sol: paneles generan → cubren el consumo directo → el sobrante carga
  la batería a través del regulador
  Noche / día nublado: la batería alimenta el inversor, que convierte a AC para
  la vivienda — sin batería suficiente, no hay energía disponible, punto final
```

---

## Regulador de carga — MPPT vs PWM

```
PWM (Pulse Width Modulation) — el básico
  Cómo funciona: conecta directamente el panel a la batería, "recortando" el
  voltaje sobrante — el panel trabaja forzado a la tensión de la batería
  Eficiencia: pierde hasta un 30% del potencial del panel en muchas condiciones
  Coste: el más barato del mercado
  Cuándo usarlo: sistemas muy pequeños (caravana, cabaña de fin de semana) donde
  la simplicidad y el coste mínimo pesan más que la eficiencia

MPPT (Maximum Power Point Tracker) — el recomendado para cualquier sistema serio
  Cómo funciona: busca constantemente el punto óptimo de trabajo del panel
  (combinación voltaje×corriente de máxima potencia) y adapta la conversión a
  la tensión que necesita la batería
  Eficiencia: extrae ≈30% más energía que un PWM equivalente en las mismas condiciones
  Coste: mayor, pero se amortiza rápido en cualquier instalación >500W
  Cuándo usarlo: por defecto en cualquier instalación off-grid seria — la
  diferencia de coste inicial se recupera en meses de mayor producción útil

DIMENSIONADO DEL REGULADOR: la corriente máxima del regulador debe superar la
  corriente de cortocircuito (Isc) total de los paneles conectados, con margen
  de seguridad del 25% sobre el valor nominal (norma habitual del sector)
```

---

## Dimensionado del sistema — la parte que no admite errores

```
PASO 1 — CALCULAR EL CONSUMO DIARIO (Wh/día)
  Sumar potencia × horas de uso de cada equipo que va a alimentarse
  Ejemplo cabaña básica: nevera 60W×24h + luces LED 40W×5h + bomba agua 200W×1h
  + electrónica varia 50W×6h ≈ 1.740 Wh/día — y esto es SIN margen de seguridad

PASO 2 — APLICAR MARGEN DE SEGURIDAD
  Multiplicar el consumo calculado ×1,3 (imprevistos, pérdidas del sistema,
  días de mayor uso) — sobre el ejemplo: ≈2.260 Wh/día objetivo real

PASO 3 — DIMENSIONAR PANELES según HSP del peor mes (NO el mejor)
  Potencia paneles (Wp) = consumo diario (Wh) / HSP del mes más desfavorable
  (diciembre-enero en la Península, no julio) / eficiencia del sistema (≈0,75-0,8)
  Ejemplo con HSP invierno de 2,5h en zona norte: 2.260 / 2,5 / 0,77 ≈ 1.175 Wp
  → mínimo 3 paneles de 400W, mejor sobredimensionar a 4-5 paneles

PASO 4 — DIMENSIONAR EL BANCO DE BATERÍAS según días de autonomía deseados
  Capacidad (Wh) = consumo diario × días de autonomía / DoD máximo (0,8 en LiFePO4)
  Ejemplo con 3 días de autonomía: 2.260 × 3 / 0,8 ≈ 8.475 Wh ≈ 8,5 kWh de batería
  (ver detalle en [[Baterías y almacenamiento — LiFePO4, BMS, sodio-ion]])

EL ERROR MÁS CARO DE TODOS: dimensionar con el HSP de verano en vez de invierno
  — el sistema funciona perfecto en julio y se queda a oscuras en enero, justo
  cuando más se necesita la calefacción/iluminación
```

---

## Generador de respaldo

```
CUÁNDO AÑADIRLO:
  Cuando el coste de sobredimensionar baterías/paneles para cubrir el peor caso
  absoluto (varios días nublados seguidos en invierno) supera el coste de tener
  un generador que arranque solo en esas ocasiones puntuales

TIPO:
  Diésel: mayor autonomía por litro, más caro de compra, habitual en instalación
  permanente rural
  Gasolina: más barato de compra, menor vida útil del motor, habitual en uso
  ocasional/portátil

INTEGRACIÓN CON EL SISTEMA:
  Los inversores off-grid de gama media/alta permiten entrada de generador AC
  que carga la batería directamente o alimenta la vivienda mientras recarga —
  verificar esta función ANTES de comprar el inversor si el proyecto contempla
  generador de respaldo desde el diseño inicial
```

---

## Casos de uso típicos

```
CABAÑA/CASA RURAL SIN ACCESO A RED:
  Sistema típico: 2-4 kWp paneles, regulador MPPT, 8-15 kWh batería LiFePO4,
  inversor off-grid 3-5 kW, generador diésel de respaldo opcional
  Coste orientativo: 6.000-15.000€ según autonomía y calidad de componentes

CARAVANA / AUTOCARAVANA:
  Sistema típico: 300-800Wp paneles flexibles/rígidos en techo, regulador MPPT
  pequeño, 2-5 kWh batería LiFePO4 (peso crítico aquí), inversor 1-2 kW
  Restricción clave: peso y espacio — cada kg y cm cuentan en un vehículo

FINCA CON RIEGO/BOMBEO:
  Sistema orientado a bombeo directo (a veces sin batería, bombeando solo con
  sol disponible) o con batería pequeña para cubrir arranques puntuales
  Puede combinarse con [[Sistemas de anclaje y estructura — cubierta, suelo, fachada, balcón|anclaje flotante FPV]]
  sobre la propia balsa de riego
```

---

## Errores comunes en off-grid

```
★★★★★ Dimensionar con el HSP de verano en lugar del mes más desfavorable del año
  — el error nº1, sistema que falla justo quien más lo necesita (invierno)
★★★★☆ Subestimar el consumo real incluyendo picos de arranque (compresores de
  nevera, bombas) — el inversor debe soportar el pico, no solo el consumo medio
★★★★☆ Usar regulador PWM en sistema de más de 500W por ahorrar en la compra
  inicial — la pérdida de eficiencia acumulada supera el ahorro en pocos meses
★★★☆☆ No prever margen de crecimiento del consumo (se añaden equipos con el
  tiempo) — dimensionar exactamente al límite actual sin colchón de expansión
★★★☆☆ Cableado subdimensionado entre paneles/batería/inversor — caída de tensión
  que reduce la eficiencia real del sistema por debajo del cálculo teórico
```

---

## Novedades 2025-2026

```
→ Los reguladores MPPT bajan de precio y se generalizan incluso en kits pequeños
  (caravana, balcón) donde antes solo se veía PWM por coste
→ Inversores off-grid con gestión de generador cada vez más estandarizada de
  serie (arranque automático por bajo SOC), reduciendo la necesidad de
  automatismos externos caseros
```
