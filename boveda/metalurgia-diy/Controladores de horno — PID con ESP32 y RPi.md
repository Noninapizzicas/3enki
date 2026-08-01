---
tipo: referencia
sector: metalurgia-diy
tags: [horno, kiln, pid, esp32, raspberry-pi, termopar, temperatura]
---
# Controladores de horno — PID con ESP32 y RPi

Controlar la temperatura de un horno (cerámica, tratamiento térmico, forja, fundición) con un microcontrolador y algoritmo PID.

## Proyectos open-source

### kiln-controller (jbruce12000) — Raspberry Pi

- Interfaz web con perfiles de cocción programables
- PID con autotuning
- Termopar tipo K con MAX31855/MAX31856
- Histórico de cocciones con gráficas
- Relé de estado sólido (SSR) para control del elemento calefactor

### PIDKiln (Saur0o0n) — ESP32

- ESP32 + MAX31855 (termopar tipo K)
- Interfaz web + pantalla OLED
- Perfiles de cocción con rampas y mesetas
- PID con parámetros ajustables
- Más barato que la versión RPi (~$15 en componentes)

### esp32-kiln-controller (pllagunos) — ESP32

- Pantalla TFT táctil
- Servidor web integrado
- Logging a InfluxDB + visualización en Grafana
- Alertas por temperatura

## Esquema típico

```
Termopar → MAX31855 → ESP32/RPi → SSR → Resistencia del horno
                         ↓
                    Pantalla/Web
```

### Componentes

| Componente | Función | Coste |
|---|---|---|
| **Termopar tipo K** | Sensor de temperatura (hasta 1.300°C) | $5–$15 |
| **MAX31855/MAX31856** | Amplificador de termopar → SPI digital | $3–$10 |
| **SSR (40A)** | Relé de estado sólido para conmutar la resistencia | $8–$15 |
| **ESP32 / RPi** | Controlador con PID | $5–$35 |
| **Disipador para SSR** | El SSR genera calor al conmutar | $3–$5 |

## Algoritmo PID

```
error = setpoint - temperatura_actual
P = Kp × error
I = Ki × ∫error dt
D = Kd × d(error)/dt
salida = P + I + D  →  duty cycle del SSR (0–100%)
```

Parámetros típicos para horno cerámico:
- **Kp**: 10–50 (respuesta proporcional)
- **Ki**: 0.01–0.1 (elimina error estacionario)
- **Kd**: 50–200 (frena el overshoot)

Autotuning: el método Ziegler-Nichols o el relay method determinan Kp/Ki/Kd automáticamente.

## Perfiles de cocción

Un perfil define rampas (°C/hora) y mesetas (mantener temperatura durante X tiempo):

```
Ejemplo — bizcocho cerámico:
  0°C → 600°C @ 100°C/h  (6h)
  600°C: mantener 30 min  (evaporar humedad residual)
  600°C → 1.000°C @ 150°C/h  (2.7h)
  1.000°C: mantener 15 min  (madurar)
  Enfriamiento natural (no forzar)
```

## Seguridad

- **Termopar de respaldo**: si el principal falla, el PID sigue calentando sin control → segundo sensor + watchdog
- **Temperatura máxima hardware**: fusible térmico o contactor que corta la alimentación si se supera un límite absoluto
- **SSR**: usar con disipador. Sin disipador, el SSR falla en cortocircuito (horno sigue calentando)
- **Ventilación**: los humos de cerámica/metal son tóxicos. Campana extractora

→ Soldadura (otra forma de unir metal): [[Soldadura — procesos y elección]]
