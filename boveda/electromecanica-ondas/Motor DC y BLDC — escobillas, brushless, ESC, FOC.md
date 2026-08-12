---
tipo: componente
sector: electromecanica-ondas
tags: [motor-DC, BLDC, brushless, ESC, FOC, KV, drones, CNC]
---
# Motor DC y BLDC — escobillas, brushless, ESC, FOC

## Motor DC de escobillas (Brushed DC)

### Principio de funcionamiento

```
CAMPO (estátor): imanes permanentes o bobinas de campo → campo B fijo
ARMADURA (rotor): bobinas → corriente I → fuerza de Lorentz → par

Par = K_t × I        [N·m]
FEM = K_e × ω        [V]
  K_t = constante de par   [N·m/A]
  K_e = constante de FEM   [V·s/rad]
  En unidades coherentes: K_t = K_e (mismo valor numérico)

Velocidad en vacío:  ω₀ = V / K_e
Par de arranque:     T_arr = V × K_t / R_armadura
Potencia mecánica:   P = T × ω = (V - I×R) × I
```

**El conmutador:** segmentos de cobre en el eje + escobillas de grafito estáticas → cambian
la dirección de la corriente en cada bobina de la armadura para mantener siempre el torque
en el mismo sentido. Es el punto débil: desgaste, chispa, suciedad, límite de velocidad.

### Control de velocidad (PWM)

```
V_efectiva = V_supply × D        D = duty cycle (0-1)

Puente H (H-bridge):
  4 transistores (MOSFET o BJT) → permite invertir la polaridad → control bidireccional
  Chips populares: L298N (2A, barato), DRV8833, TB6612FNG (3A, eficiente)

Frenado:
  Corte (coast): Q1=Q2=Q3=Q4=OFF → motor gira por inercia
  Freno dinámico: Q1=Q4=OFF, Q2=Q3=ON → cortocircuito de armadura → frena rápido
  Freno regenerativo: energía cinética → batería (requiere control activo)
```

### Cuándo usarlo (2025)

```
✓ Aplicaciones simples de velocidad variable (taladros, mezcladores, juguetes)
✓ Control de posición con encoder (impresoras antiguas, plotters)
✓ Cuando el coste es prioritario sobre la eficiencia
✗ Velocidades muy altas (>10000 RPM → desgaste de escobillas acelerado)
✗ Ambientes sucios o húmedos (escobillas se bloquean)
✗ Cuando se necesita larga vida sin mantenimiento
```

## Motor BLDC (Brushless DC)

El motor BLDC invierte la arquitectura: los imanes van en el rotor, el bobinado en el estátor.
Sin escobillas → sin desgaste mecánico → vida útil 10× mayor.

### Tipos de construcción

```
INRUNNER (rotor interior):
  Imanes en el interior, estátor fuera.
  Alta velocidad, par bajo → requiere reducción (drones de carreras, aviones RC)
  KV típico: 1000-10000 RPM/V

OUTRUNNER (rotor exterior):
  Estátor fijo en el eje, carcasa exterior con imanes gira.
  Baja velocidad, par alto → acoplamiento directo (drones multirotor, turbinas)
  KV típico: 100-1500 RPM/V

  El PMG de flujo axial de Hugh Piggott es un outrunner de núcleo de aire.
```

### KV — la constante de velocidad

```
KV = RPM / V   (en vacío, sin carga)

Motor 1000 KV a 12V → 12000 RPM en vacío
Motor 100 KV a 48V  →  4800 RPM en vacío

Par ≈ 1/KV (a igual potencia, KV bajo → más par, menos velocidad)

Equivalencia con K_e:
  K_e [V·s/rad] = 60 / (2π × KV)
  KV = 9.549 / K_e
```

### Configuraciones de polos y ranuras (poles & slots)

```
Notación: 12N14P = 12 ranuras (slots) en el estátor, 14 polos (imanes) en el rotor

Combinaciones comunes:
  12N14P → alta eficiencia, bajo cogging (multipropósito)
  9N12P  → menor cogging, par más suave (PMG eólico Piggott)
  6N4P   → simple, cogging alto (motores pequeños económicos)
  18N16P → alto par, bajo ruido (e-bikes, bombas)

Cogging torque: retención mecánica por alineación imán-ranura → vibración a baja velocidad
Reducción: más polos/ranuras, inclinación (skew) del rotor o estátor
```

## ESC — Electronic Speed Controller

El BLDC requiere conmutar las 3 fases electrónicamente en el orden correcto.

```
CONMUTACIÓN TRAPEZOIDAL (6-step / bloque):
  Secuencia fija de 6 estados → simple, rápida, pero ruido y torque ondulante
  Requiere sensores Hall o sensorless (BEMF zero-crossing)
  Uso: drones FPV, ventiladores, herramientas eléctricas

CONMUTACIÓN SINUSOIDAL:
  Corrientes en las 3 fases son sinusoidales → par más suave, menos ruido
  Requiere encoder o resolver, o estimación de ángulo de rotor
  Uso: e-bikes, electrodomésticos, HVAC

FOC (Field Oriented Control) — Control Vectorial:
  El estado del arte para máximo rendimiento.
  Descompone la corriente en componente de par (Iq) y de flujo (Id)
  → Maximiza el par por amperio → mínimas pérdidas
  → Requiere: encoder incremental o absoluto de alta resolución + MCU rápida
  Uso: servo-drives industriales, e-bikes de competición, CNC de precisión

Chips ESC populares para maker:
  VESC (open-source, Benjamin Vedder): el referente DIY — configurable, potente, CAN bus
  ODrive: open-source, encoders de alta resolución, FOC nativo
  SimpleFOC (Arduino/ESP32): librería FOC para maker, cualquier motor BLDC
  Hobbywing / T-Motor: ESC comercial para drones y aviones RC
```

### Sensorless BLDC — arranque y BEMF

```
Sin sensores Hall → el ESC detecta la posición del rotor por la BEMF (fuerza contra-electromotriz)
que generan las bobinas NO activas.

Zero-crossing detection:
  Cuando la BEMF de la fase inactiva cruza V/2 → 30° después, conmutar
  Problema a baja velocidad: BEMF muy pequeña → detección difícil
  Solución: arranque en lazo abierto con aceleración rampa → luego BEMF

Uso: drones (arranque rápido desde parado en el aire), ventiladores industriales.
```

## Tabla comparativa motor brushed vs BLDC

| Parámetro | Brushed DC | BLDC Sensorless | BLDC + FOC |
|---|---|---|---|
| Coste | Bajo | Medio | Alto |
| Eficiencia típica | 75-85% | 85-92% | 92-97% |
| Vida útil | 500-2000 h | 20000+ h | 20000+ h |
| Control de velocidad | PWM simple | ESC + 6-step | ESC + FOC |
| Par a baja velocidad | Bueno | Regular (cogging) | Excelente |
| Ruido / vibración | Bajo-medio | Medio (6-step) | Muy bajo |
| Mantenimiento | Escobillas cada 500h | Ninguno | Ninguno |
| Aplicación maker | Robots simples, taladros | Drones, CNC, e-bike | Servo-CNC, EV |

## BLDC en CNC y robótica maker

```
Configuración típica eje CNC:
  Motor BLDC outrunner + encoder magnético AS5047P (14 bit) + ODrive/VESC
  → Servo-drive de posición con resolución 0.02°
  → Par de mantenimiento sin calor (corriente Iq=0 cuando parado)
  → Respuesta de velocidad: ancho de banda > 1 kHz

vs. Motor paso a paso:
  Stepper: sin encoder, par fijo a baja velocidad, ruido, pierde pasos a alta velocidad
  BLDC+encoder: más caro, más complejo, pero sin pérdida de pasos y mejor eficiencia
```
