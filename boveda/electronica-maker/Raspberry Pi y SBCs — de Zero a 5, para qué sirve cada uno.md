---
tipo: componente
sector: electronica-maker
tags: [raspberry-pi, sbc, orange-pi, radxa, linux-embebido]
---
# Raspberry Pi y SBCs — de Zero a 5, para qué sirve cada uno

> Un microcontrolador ejecuta un programa; un SBC (Single Board Computer) ejecuta un sistema operativo completo — la diferencia decide si tu proyecto necesita Linux, una cámara con procesado pesado o simplemente un GPIO que se despierte cada 10 minutos.

---

## Microcontrolador vs SBC — cuándo cada uno

```
MICROCONTROLADOR (ESP32, RP2040...)
  → Arranca en milisegundos, consumo en reposo de microamperios
  → Un solo programa corriendo (bare metal o FreeRTOS)
  → Ideal para: sensores con batería, control en tiempo real, siempre encendido

SBC (Raspberry Pi y similares)
  → Arranca un SO completo (Linux) en 10-30 segundos, consumo en reposo de cientos de mA
  → Multitarea real, red completa, USB, HDMI, cámara CSI
  → Ideal para: hub central (Home Assistant), servidor de archivos, visión por
    computador con IA, cualquier cosa que necesite un SO de verdad
```

---

## Catálogo Raspberry Pi (2026)

```
MODELO            CPU                    RAM        PRECIO 2026 (España)  USO TÍPICO
Pi Zero 2 W         Cortex-A53 quad 1GHz   512MB      15-18€                Proyecto embebido con WiFi, cámara ligera
Pi 4 Model B        Cortex-A72 quad 1.8GHz 2/4/8GB    45-85€ (según RAM)    Servidor casero, retro-gaming, NAS ligero
Pi 5                Cortex-A76 quad 2.4GHz 4/8/16GB   60-115€ (según RAM)   Hub domótica, desarrollo, IA ligera (con HAT NPU)
Pi 5 + AI HAT+      Pi 5 + NPU Hailo-8     -          +70-140€ (el HAT)     Visión por computador en tiempo real
Compute Module 5    Cortex-A76, sin conectores  -     45€+ (módulo)         Producto integrado, placa base a medida
Pi Pico / Pico 2    ver nota de microcontroladores  -  4-9€                 (no es SBC, es microcontrolador — confusión habitual)
```

La Pi 5 duplica el rendimiento de CPU de la Pi 4 y añade PCIe nativo (para NVMe vía HAT), lo que la hace viable como mini-servidor real (Home Assistant + bases de datos + varios contenedores Docker sin sudar).

---

## Alternativas al Raspberry Pi

```
Orange Pi 5 / 5 Plus (Rockchip RK3588S)
  → Más núcleos y RAM por el mismo precio que una Pi 5, NPU integrada
  → Contra: soporte de software y comunidad muy inferior, drivers menos maduros

Radxa Rock 5 (RK3588)
  → Similar prestación a Orange Pi, mejor documentación que la mayoría de clones chinos

Banana Pi
  → Nicho, foco en almacenamiento (SATA nativo en algunos modelos)

Libre Computer (Le Potato, etc.)
  → Compatibilidad de pinout con Raspberry Pi, precio agresivo

CRITERIO: si el proyecto depende de HATs, cámaras oficiales o tutoriales abundantes en
español, la Raspberry Pi oficial sigue siendo la apuesta segura pese a costar más — el
ecosistema (Raspberry Pi OS, documentación, foros) vale ese sobreprecio para la mayoría
de proyectos maker.
```

---

## Casos de uso reales por modelo

```
Pi Zero 2 W → cámara de vigilancia con motion, radio por internet, terminal de
              domótica minimalista, proyecto que se esconde dentro de una caja pequeña

Pi 4 (4GB)  → Home Assistant OS, Pi-hole + Wireguard, servidor Jellyfin ligero,
              retro-consola (RetroPie), impresora 3D headless con OctoPrint

Pi 5 (8GB)  → hub de domótica con Zigbee2MQTT + Home Assistant + Node-RED en Docker,
              NAS con NVMe vía HAT, estación de desarrollo para compilar firmware ESP32

Pi 5 + AI HAT+ → detección de objetos/personas en tiempo real para cámaras de
                  seguridad locales, sin depender de la nube (Frigate NVR)
```

---

## Sistemas operativos y software

```
Raspberry Pi OS (basado en Debian) — el oficial, mejor soporte de hardware
Home Assistant OS — imagen dedicada, arranca directo en el hub de domótica
DietPi — Debian minimalista, arranca más rápido, menos overhead
Ubuntu Server (ARM64) — para quien ya vive en el ecosistema Ubuntu
Raspberry Pi Imager — la herramienta oficial para grabar cualquiera de estas en la SD/SSD
```

---

## Errores comunes

```
1. Alimentar una Pi 4/5 con un cargador de móvil genérico
   → la Pi 4 necesita 5V/3A reales por USB-C, la Pi 5 recomienda el oficial de 5V/5A (25W)
   → síntoma típico: el rayo amarillo en pantalla (undervoltage), reinicios bajo carga

2. Usar tarjetas SD baratas para uso intensivo (base de datos, logs)
   → desgaste rápido, corrupción del sistema de ficheros
   → solución: SSD por USB3/NVMe para cualquier uso "de servidor" serio

3. Confundir el propósito: intentar hacer tiempo real estricto (control de motor a
   microsegundos) en un SBC con Linux
   → Linux no es RTOS — para control de tiempo real usar un microcontrolador dedicado
     y dejar que el SBC coordine a nivel más alto

4. No poner disipador/ventilador en Pi 4/5 bajo carga sostenida
   → throttling térmico silencioso que baja el rendimiento sin avisar
```

---

## Novedades 2025-2026

```
→ El AI HAT+ de Raspberry Pi (NPU Hailo-8, hasta 26 TOPS) consolida la Pi 5 como
  plataforma de visión por computador local sin depender de GPU externa ni de la nube.
→ El Compute Module 5 abre la vía a producto integrado a escala pequeña-mediana para
  makers que dan el salto de prototipo a serie corta con placa base propia.
→ Precios de memoria RAM al alza por la demanda de chips de IA en centros de datos
  presionan ligeramente el precio de los modelos de 8GB/16GB — comprar con margen si
  el proyecto necesita RAM alta.
```

→ Software de hub domótico sobre estos equipos: [[../domotica-iot/Home Assistant — el hub open-source]]
→ Comparar con microcontroladores puros: [[Microcontroladores — Arduino, ESP32, RP2040 y RP2350]]
