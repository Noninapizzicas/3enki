---
tipo: componente
sector: electronica-maker
tags: [actuadores, motores, servos, reles, l298n, a4988, mosfet]
---
# Actuadores — motores, servos, relés y control de potencia

> El sensor le dice al microcontrolador qué está pasando; el actuador es lo que hace que algo pase en el mundo real — y casi siempre necesita más corriente de la que un GPIO puede entregar por sí solo, así que el driver intermedio no es opcional, es la pieza que decide si el proyecto sobrevive al primer encendido.

---

## Regla de oro: nunca conectes un motor/relé directo a un GPIO

```
Un GPIO de ESP32/Arduino entrega 20-40mA máximo por pin — un motor DC pequeño ya
pide 100-500mA, un servo puede picos de 1A+, un relé de 5V puede pedir 70-150mA
solo para la bobina.

→ SIEMPRE un driver o transistor/MOSFET entre el GPIO y la carga.
→ El GPIO controla la SEÑAL, el driver conmuta la POTENCIA real.
```

---

## Motores DC y sus drivers

```
L298N (puente H dual) — el clásico, robusto, algo ineficiente
  Corriente: hasta 2A por canal (con disipador) · voltaje motor: 5-35V
  Precio: 2-4€ · uso: robots pequeños, 2 motores DC con control de dirección y velocidad
  Contra: cae ~2V en el propio chip (ineficiente con baterías bajas)

TB6612FNG — alternativa moderna al L298N, más eficiente
  Corriente: 1.2A continuo por canal · menor caída de tensión que L298N
  Precio: 3-5€ · uso: robots con batería donde cada voltio cuenta

DRV8833 — puente H dual compacto, bueno para motores pequeños
  Precio: 2-4€ · uso: micro-robots, proyectos con espacio reducido

MOSFET simple (IRLZ44N, IRF520) + diodo flyback — para un motor en un solo sentido
  Precio: <1€ el MOSFET · uso: ventilador, bomba de agua, motor que solo gira en un sentido
```

---

## Motores paso a paso (steppers) y sus drivers

```
28BYJ-48 + ULN2003 — el kit de entrada, unipolar, ya viene con driver
  Precio: 2-3€ el par · par bajo, pero perfecto para aprender control de pasos

NEMA 17 + A4988 — el estándar de impresoras 3D/CNC, bipolar
  A4988: microstepping hasta 1/16, hasta 2A por bobina (con disipador), regula
  corriente con un potenciómetro (¡fácil de quemar el motor si no se ajusta bien!)
  Precio: NEMA17 8-15€ · A4988 2-4€ · uso: CNC casera, impresora 3D, posicionamiento preciso

NEMA 17 + TMC2208/TMC2209 — el upgrade silencioso
  Microstepping hasta 1/256, control por UART opcional, MUCHO más silencioso que A4988
  Precio: driver 4-8€ · uso: cuando el ruido del motor es un problema (impresoras 3D modernas)
```

---

## Servos

```
SG90 (micro servo, 9g) — el más común en proyectos maker
  Par: ~1.8kg/cm · rango: 180° (algunos 360° modificados) · voltaje: 4.8-6V
  Precio: 1.5-3€ · uso: brazos robóticos pequeños, cierres, indicadores

MG90S — versión con engranajes metálicos del SG90, más durable
  Precio: 3-5€ · uso: cuando el SG90 se desgasta rápido por uso intensivo

Servo de rotación continua (FS90R y similares) — se comporta como motor DC con control PWM
  Precio: 4-7€ · uso: ruedas de robots simples sin necesitar driver de motor aparte

IMPORTANTE: los servos NO se controlan con un GPIO digital simple, necesitan una
señal PWM específica (pulso de 1-2ms cada 20ms) — casi todos los microcontroladores
tienen librería dedicada (Servo.h en Arduino, ledc en ESP32).
```

---

## Relés y control de cargas AC/DC de potencia

```
Módulo relé 1/2/4/8 canales (5V, con optoacoplador) — el estándar para controlar
enchufes, bombillas, electroválvulas desde un microcontrolador
  Precio: 1-2€ (1 canal) a 5-8€ (8 canales) · corriente: 10A a 250VAC típico
  ⚠ TRABAJAR CON 220V REQUIERE PRECAUCIÓN REAL: aislamiento, caja no conductora,
    nunca tocar con el circuito conectado a red — si hay dudas, usar un enchufe
    inteligente comercial (Shelly, Sonoff) en vez de un relé desnudo

SSR (relé de estado sólido) — sin partes mecánicas, conmutación silenciosa
  Precio: 4-10€ · uso: control de resistencias calefactoras, cargas que conmutan
  muy a menudo (un relé mecánico se desgasta con ciclos frecuentes, el SSR no)

MOSFET de potencia (para cargas DC de alta corriente, LEDs de tira, bombas 12V)
  IRLZ44N, IRF3205 (logic-level, conmutan bien con 3.3-5V de GPIO)
  Precio: <1€ · uso: tiras LED WS2812/5050, bombas de acuario, ventiladores 12V
```

---

## Solenoides y electroválvulas

```
Electroválvula 12V (riego, dosificación de líquidos)
  Precio: 5-15€ · corriente: 300-500mA · necesita MOSFET o relé, no GPIO directo
  uso: riego automatizado, dosificación de nutrientes en hidroponía

Cerradura solenoide 12V — apertura eléctrica de puertas/cerraduras
  Precio: 8-20€ · uso: control de acceso DIY, cerradura BLE/WiFi
```

---

## Tabla resumen — qué driver para qué carga

```
CARGA                        DRIVER RECOMENDADO         CORRIENTE TÍPICA
LED individual                Resistencia + GPIO directo  <20mA
Tira LED (WS2812, 5050)       MOSFET o driver dedicado     hasta varios A (según metros)
Motor DC pequeño (juguete)    L298N / TB6612FNG            100-500mA
Motor paso a paso NEMA17      A4988 / TMC2208               hasta 2A/bobina
Servo estándar (SG90)         PWM directo (con fuente aparte) hasta 500mA pico
Relé de 5V                    Transistor NPN + diodo, o módulo con optoacoplador  70-150mA bobina
Electroválvula 12V            MOSFET logic-level             300-500mA
Carga 220V (bombilla, enchufe) Módulo relé aislado o SSR      según carga, revisar amperaje
```

---

## Errores comunes

```
1. Ajustar mal la corriente del A4988 (potenciómetro) → motor NEMA17 se recalienta
   y puede quemarse en minutos. Medir con multímetro el voltaje de referencia (Vref)
   según la fórmula del driver antes de dar corriente al motor.

2. Olvidar el diodo flyback en cargas inductivas (motores, relés, solenoides)
   controladas por transistor/MOSFET → picos de voltaje inverso que dañan el driver
   al desconectar. Los módulos comerciales ya lo incluyen, un MOSFET suelto no.

3. Alimentar el driver de motor con la misma fuente que el microcontrolador sin
   aislamiento → ruido eléctrico que resetea el microcontrolador al arrancar el motor.
   Separar las tierras con cuidado o usar una fuente dedicada para motores.

4. Confundir servo estándar con servo de rotación continua al programar ángulos
   → el servo de rotación continua interpreta el "ángulo" como velocidad, no posición.

5. Manipular 220V sin conocimiento real de electricidad → riesgo de electrocución
   y de incendio. Si el proyecto necesita controlar la red eléctrica de la vivienda,
   valorar seriamente un enchufe/relé inteligente certificado en vez de un módulo DIY.
```

---

## Novedades 2025-2026

```
→ Los drivers TMC2208/TMC2209 (steppers silenciosos) bajan de precio y se vuelven la
  opción por defecto frente al A4988 en proyectos nuevos de impresión 3D/CNC casera,
  gracias al StealthChop (microstepping silencioso) y a la protección térmica integrada.
→ Los enchufes inteligentes con firmware abierto (Shelly, Sonoff reflasheados con
  Tasmota/ESPHome) siguen siendo la vía recomendada para cargas de 220V frente a
  módulos de relé DIY sueltos, por el aislamiento certificado de fábrica.
```

→ Cómo alimentar estos actuadores: [[Alimentación — reguladores, baterías LiPo y USB-C PD]]
→ Proyectos que los usan: [[Proyectos maker — domótica, IoT y automatización casera]]
