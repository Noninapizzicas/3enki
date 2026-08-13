---
tipo: componente
sector: electronica-maker
tags: [alimentacion, lipo, usb-c, pd, reguladores, tp4056, buck-converter]
---
# Alimentación — reguladores, baterías LiPo y USB-C PD

> La mayoría de proyectos maker que "fallan de forma random" en realidad tienen un problema de alimentación mal resuelto — un regulador insuficiente, una batería que no aguanta el pico de corriente del WiFi, un cable USB demasiado fino. Resolver la alimentación bien de entrada ahorra semanas de depuración fantasma.

---

## Reguladores de voltaje — lineal vs conmutado

```
REGULADOR LINEAL (LDO — Low Dropout, tipo AMS1117, LM7805)
  Funcionamiento: disipa el exceso de voltaje en forma de calor
  Eficiencia: baja si la caída de voltaje es grande (5V→3.3V con 500mA = calor real)
  Ventaja: simple, barato (<0.5€), sin ruido eléctrico (bueno para señales analógicas)
  Precio: AMS1117 3.3V, módulo con capacitores: 0.3-1€

REGULADOR CONMUTADO (buck converter, tipo MP1584, LM2596)
  Funcionamiento: conmuta a alta frecuencia, mucho más eficiente (85-95%)
  Ventaja: apenas genera calor, ideal para bajar de 12V/9V a 5V/3.3V con corriente alta
  Contra: algo de ruido de conmutación (rizado), puede interferir con señales analógicas sensibles
  Precio: módulo MP1584 ajustable: 1-2€

CUÁNDO CADA UNO:
  → LDO: cuando la diferencia de voltaje es pequeña (5V→3.3V) y la corriente es baja
  → Buck: cuando la diferencia es grande (12V→5V) o la corriente es alta (>500mA) —
    con LDO ahí se calentaría muchísimo y desperdiciaría energía de la batería
```

---

## Baterías LiPo — la opción estándar en proyectos portátiles

```
VOLTAJE NOMINAL: 3.7V por celda (rango real: 3.0V descargada a 4.2V cargada)
CAPACIDADES HABITUALES EN MAKER: 500mAh, 1000mAh, 2000mAh, 3000mAh+
  Precio orientativo 2026: 1000mAh ≈ 6-9€, 2000mAh ≈ 9-14€ (con conector JST-PH 2.0)

⚠ SEGURIDAD: las LiPo pueden hincharse o incendiarse si se sobrecargan, se
  cortocircuitan o se perforan. Nunca cargar sin circuito de protección (BMS),
  nunca dejar cargando sin supervisión las primeras veces, almacenar a ~50-60%
  de carga si no se van a usar en semanas.

TP4056 — el módulo de carga LiPo omnipresente
  Función: carga la LiPo desde USB (micro-USB o USB-C según versión) a 1A típico
  Con protección (DW01A + FS8205A): corta si hay sobrecarga, sobredescarga o
  cortocircuito — usar SIEMPRE la versión "con protección", nunca la pelada
  Precio: 0.5-1.5€ · versión USB-C: 1-2€

Módulos con boost integrado (DFRobot DFR0208 y similares)
  Cargan la LiPo Y elevan la salida a 5V estable para alimentar el proyecto
  directamente — útil cuando el microcontrolador necesita 5V fijos
  Precio: 4-8€
```

---

## USB-C Power Delivery (PD) — más allá de los 5V estándar

```
USB-C sin PD: entrega 5V a 0.5-3A según el puerto (igual que micro-USB, solo
  cambia el conector físico)

USB-C CON PD: el dispositivo negocia con el cargador voltajes de 5V, 9V, 12V,
  15V, 20V — necesario para soldadores tipo Pinecil (65W+ para rendimiento pleno)
  y para cargar baterías grandes rápido

TRIGGER PD (módulos tipo ZY12PDN): fuerzan un voltaje PD concreto (9V, 12V, 20V)
  desde cualquier cargador USB-C PD estándar, útil para alimentar proyectos que
  necesitan más de 5V sin fuente de pared dedicada
  Precio: 2-4€

USO EN PROYECTOS: alimentar el Pinecil, cargar packs de baterías grandes,
  dar 12-20V a un proyecto sin necesitar transformador de pared propio
```

---

## Cálculo de consumo — la cuenta que evita sorpresas

```
FÓRMULA BÁSICA: autonomía (horas) ≈ capacidad batería (mAh) / consumo medio (mA)

EJEMPLO REAL — ESP32 con sensor BME280, despertando cada 5 minutos:
  Consumo en deep sleep: ~10-20µA (0.01-0.02mA)
  Consumo despierto + WiFi transmitiendo: ~150-250mA durante ~2-3 segundos
  Consumo medio aproximado: ~(250mA × 3s + 0.02mA × 297s) / 300s ≈ 2.5mA promedio
  Con batería de 2000mAh: 2000/2.5 ≈ 800 horas ≈ 33 días de autonomía

LECCIÓN: el deep sleep entre lecturas es lo que hace viable un proyecto con
  batería — un ESP32 despierto todo el rato con WiFi activo agota una LiPo de
  2000mAh en menos de 10 horas.
```

---

## Fuentes de pared y adaptadores

```
Fuente USB genérica de 5V/1-2A: 3-8€ · suficiente para la mayoría de microcontroladores solos
Fuente USB-C PD 65W (para Pinecil y cargas rápidas): 15-25€
Fuente de mesa regulable de laboratorio (0-30V, 0-5A): 30-80€ (modelos económicos
  tipo Wanptek/Ruideng) — imprescindible para probar circuitos antes de fiarse
  de la batería final, permite ver el consumo real en tiempo real
```

---

## Errores comunes

```
1. Alimentar un ESP32 por un puerto USB de PC o hub barato sin capacidad de pico
   → brownouts/reinicios al activar WiFi (pico instantáneo de hasta 500-800mA)
   Solución: fuente/cable de calidad probada, capacitor de 100-470µF cerca del regulador

2. Usar una TP4056 sin protección (sin DW01A) "porque es más barata"
   → riesgo real de sobrecarga/sobredescarga de la LiPo, más caro a la larga
     (batería dañada o peor)

3. Elegir LDO para bajar de 12V a 5V con corriente alta
   → el regulador se calienta muchísimo y desperdicia gran parte de la energía
     en forma de calor — usar buck converter en ese salto de voltaje

4. No calcular el consumo antes de elegir tamaño de batería
   → proyecto "portátil" que dura 3 horas quedándose corto, o batería
     sobredimensionada innecesaria que encarece y pesa el proyecto

5. Cortocircuitar accidentalmente una LiPo al cablear sin comprobar polaridad
   → riesgo de incendio real, no solo de "se rompe el componente". Comprobar
     siempre polaridad con multímetro antes de conectar la batería por primera vez

6. Dejar una LiPo cargando sin supervisión las primeras veces con un módulo nuevo
   → hasta confirmar que el módulo de carga funciona bien, cargar siempre
     vigilando y sobre superficie no inflamable
```

---

## Novedades 2025-2026

```
→ Los módulos de carga LiPo con monitor I2C (tipo DFRobot DFR0563) se popularizan
  frente al TP4056 clásico, porque permiten leer el porcentaje de batería real
  por software en vez de depender solo de un LED indicador binario.
→ USB-C PD se convierte en el estándar por defecto también para cargar packs de
  baterías de proyectos maker medianos, reduciendo la dependencia de fuentes de
  pared propietarias con conector barril.
```

→ Actuadores que consumen más corriente de la esperada: [[Actuadores — motores, servos, relés y control de potencia]]
→ Microcontroladores y su consumo típico: [[Microcontroladores — Arduino, ESP32, RP2040 y RP2350]]
