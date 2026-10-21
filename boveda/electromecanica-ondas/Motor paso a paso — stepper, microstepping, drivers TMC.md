---
tipo: componente
sector: electromecanica-ondas
tags: [stepper, paso-a-paso, microstepping, TMC2209, A4988, CNC, 3D-printing]
---
# Motor paso a paso — stepper, microstepping, drivers TMC

## Principio de funcionamiento

```
Un motor paso a paso mueve el rotor en incrementos discretos (pasos) al cambiar la
secuencia de energización de las bobinas del estátor.

Tipos de rotor:
  VR (Variable Reluctance): sin imanes, rotor de acero dentado — el más antiguo
  PM (Permanent Magnet): rotor con imanes → par de detención (detent torque)
  HB (Hybrid): combina VR + PM → el dominante en CNC/impresoras 3D

Paso estándar NEMA 17 (el más común):
  200 pasos/vuelta → 1.8°/paso   (full step)
  400 pasos/vuelta → 0.9°/paso   (variante de precisión)
```

## Construcción bipolar vs unipolar

```
BIPOLAR (2 bobinas, 4 hilos — el dominante):
  Cada bobina se energiza en ambas polaridades (+/-)
  Requiere puente H por bobina → driver más complejo pero par más alto
  Corriente de bobina = corriente del driver
  Identificación: 4 hilos (A+, A-, B+, B-)

UNIPOLAR (2 bobinas con toma central, 6 u 8 hilos):
  Solo necesita transistores de un solo sentido → driver más simple (vintage)
  Par ~30% menor que bipolar con mismo hilo
  8 hilos = puede reconfigurarse como bipolar paralelo o serie
```

## Secuencia de pasos (bipolar)

```
FULL STEP (1 fase):
  Paso   A+  A-  B+  B-
  1      ON  OFF OFF OFF
  2      OFF OFF ON  OFF
  3      OFF ON  OFF OFF
  4      OFF OFF OFF ON

FULL STEP (2 fases — más par):
  Paso   A+  A-  B+  B-
  1      ON  OFF ON  OFF
  2      OFF ON  ON  OFF
  3      OFF ON  OFF ON
  4      ON  OFF OFF ON

HALF STEP (entrepaso — doble resolución, par variable):
  Alterna entre 1 y 2 fases activas → 400 pasos/vuelta en NEMA 17
```

## Microstepping

```
El driver modula la corriente en cada bobina con una forma sinusoidal discreta:
  I_A = I_max · cos(θ)
  I_B = I_max · sin(θ)

  → El rotor se detiene entre posiciones de full step
  → Movimiento más suave, menos vibración, menos ruido

Divisores estándar:
  1/2   → 400  pasos/vuelta
  1/4   → 800  pasos/vuelta
  1/8   → 1600 pasos/vuelta   ← estándar impresoras 3D
  1/16  → 3200 pasos/vuelta   ← estándar CNC Grbl
  1/32  → 6400 pasos/vuelta
  1/256 → 51200 pasos/vuelta  (TMC5160, TMC2240 — casi silencioso)

Importante: el microstepping mejora la suavidad pero NO mejora la precisión real
de posición (el rotor oscila ±1 paso completo cuando hay carga — el paso "micro" es elástico).
Para precisión real → encoder de cierre de lazo.
```

## Drivers — evolución generacional

### A4988 (Allegro) — el clásico

```
Corriente: hasta 2 A por fase (con disipador)
Microstepping: 1/1, 1/2, 1/4, 1/8, 1/16
Protecciones: sobretemperatura, sobrecorriente
Coste: < 1€ (clone chino), 3-5€ (original)
Modo de decaimiento: fijo (full/slow decay) — causa ruido a velocidades intermedias

Ajuste de corriente: trimmer → V_ref → I = V_ref / (8 × R_sense)
```

### DRV8825 (TI) — más corriente

```
Corriente: hasta 2.5 A por fase
Microstepping: hasta 1/32
Voltaje: 8.2-45 V (vs 8-35 V del A4988)
Coste: 2-6€
Nota: paso mínimo diferente al A4988 — ajustar ENABLE delay en firmware
```

### TMC2208 / TMC2209 (Trinamic) — la revolución silenciosa

```
El salto generacional. Modos de operación:

StealthChop2:
  Control de corriente por predicción (PWM sincronizado con el perfil de movimiento)
  → Casi silencioso a velocidades bajas y medias
  → Disipación de calor uniforme

SpreadCycle:
  Control clásico de decaimiento mixto → más ruido pero mejor rendimiento a alta velocidad

CoolStep:
  Reduce la corriente automáticamente cuando el par necesario es bajo → ahorra calor

StallGuard2 / StallGuard4:
  Detecta la carga en el motor por el patrón de corriente → puede detectar el tope mecánico
  → Homing sin interruptor de límite en impresoras 3D (Trinamic sensorless homing)

TMC2209 vs TMC2208:
  TMC2209: añade UART bidireccional + StallGuard → el estándar actual en impresoras 3D
  Corriente: 2 A RMS (2.8 A pico)
  Microstepping: hasta 1/256 interpolado

Coste: 5-12€ (original), 2-5€ (clone)
```

### TMC5160 / TMC2240 — alta potencia

```
TMC5160:
  Corriente: hasta 4.45 A RMS con MOSFETs externos → motores grandes de CNC
  Tensión: hasta 60 V
  SPI configurable → integrable en sistemas industriales

TMC2240:
  Corriente: 3 A RMS integrado
  El TMC más moderno (2022): ADC de corriente más preciso → mejor StallGuard
```

## Par vs velocidad — la curva que importa

```
      Par
       │╲
       │  ╲  Pull-out torque (máximo par dinámico)
       │    ╲
       │      ╲──────────────╮  Pull-in torque (arranque sin pérdida de paso)
       │                     │
       └─────────────────────┴──→ Velocidad (pasos/s)

Zona de trabajo:
  Por debajo de la curva pull-out: el motor sigue los pulsos sin perder pasos
  Por encima: el motor pierde pasos o para

Parámetros que elevan la curva:
  ✓ Mayor tensión de alimentación (más dV/dt → más corriente a alta velocidad)
  ✓ Reducción de inductancia (menor Lbobina → más ancho de banda de corriente)
  ✓ Driver con control de corriente activo (TMC >> A4988 a alta velocidad)
  ✓ Rampa de aceleración suave (accel/decel configurado en firmware)
```

## Resonancia mecánica — el enemigo oculto

```
Los motores paso a paso tienen una frecuencia de resonancia natural (típico: 50-200 Hz).
A esa frecuencia, la vibración se amplifica → ruido, pérdida de pasos, degradación mecánica.

Solución:
  1. Evitar operar continuamente en esa banda de frecuencia
  2. Microstepping (reduce la excitación en esa frecuencia)
  3. Amortiguación mecánica (damper de viscosa en el eje)
  4. TMC SpreadCycle o StealthChop (reducen la excitación resonante)

Detectar la resonancia: escuchar el motor mientras se acelera desde 0 — hay un punto
donde resuena antes de estabilizarse a velocidades mayores.
```

## Dimensionado para CNC / impresora 3D

```
Par necesario = F_carga × radio_polea × factor_seguridad (×2)

F_carga = masa × aceleración + fricción

Ejemplo eje X impresora 3D:
  Masa del cabezal: 300 g = 0.3 kg
  Aceleración: 2000 mm/s² = 2 m/s²
  F_inercia = 0.3 × 2 = 0.6 N
  Polea GT2 radio: 6 mm = 0.006 m
  Par_min = 0.6 × 0.006 × 2 = 7.2 mN·m

  NEMA 17 típico (42Ncm = 0.42 N·m) → margen ×58 → más que suficiente.
  El NEMA 17 es sobredimensionado para impresión 3D; el límite suele ser la velocidad, no el par.

Tamaños NEMA estándar:
  NEMA 8  → 20×20 mm — miniatura, bajo par, poca masa
  NEMA 11 → 28×28 mm — impresoras de resina, robots pequeños
  NEMA 17 → 42×42 mm — estándar impresoras FDM, CNC pequeño (el 90% del mercado maker)
  NEMA 23 → 57×57 mm — CNC de madera, eje Z pesado, plasma
  NEMA 34 → 86×86 mm — fresadora de metal, router CNC profesional
```

## Firmware y configuración

```
Marlin / Klipper (impresoras 3D):
  steps_per_mm = (pasos/vuelta × microstepping) / (paso_tornillo_o_paso_correa)
  Para GT2 + polea 20 dientes + 1/16 step:
    steps_per_mm = (200 × 16) / (20 × 2mm) = 80 pasos/mm

Grbl (CNC):
  $100, $101, $102 = steps/mm para X, Y, Z
  $110-$112 = velocidad máxima [mm/min]
  $120-$122 = aceleración [mm/s²]

TMC2209 via UART (Klipper):
  [tmc2209 stepper_x]
  uart_pin: PC4
  run_current: 0.800       # A RMS
  stealthchop_threshold: 999999  # siempre silencioso
```
