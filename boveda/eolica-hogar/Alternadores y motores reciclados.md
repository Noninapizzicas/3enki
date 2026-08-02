---
tipo: componente
sector: eolica-hogar
tags: [alternador, motor, reciclado, diy]
---
# Alternadores y motores reciclados

Alternativas al PMG casero: reutilizar motores existentes como generadores.

## Motor de cinta de correr

- **Ventajas**: bajo coste (gratis/chatarra), alto par, DC permanente, disponible
- **Desventajas**: cogging notable sin carga (resistencia al giro dificulta arranque), diseñado para RPM altas (3000+), necesita multiplicación por correa o engranaje
- **Veredicto**: funciona para proyectos educativos y turbinas de baja potencia (<200 W). No recomendado para instalaciones serias — el cogging mata la producción a bajo viento.

## Alternador de coche

- **Ventajas**: robusto, barato, fácil de encontrar
- **Desventajas**: diseñado para 1500-6000 RPM (una turbina doméstica gira a 150-500 RPM → necesita multiplicación 5:1 a 10:1 por poleas), tiene bobinado de campo (no PM → necesita excitación), regulador integrado que hay que puentear
- **Veredicto**: NO recomendado. La multiplicación por poleas introduce pérdidas por fricción (15-30%), ruido, mantenimiento de correas. La eficiencia total del sistema es muy baja.

## Motor paso a paso (stepper)

- **Ventajas**: PM inherentes, muchos polos → genera voltaje a RPM bajas
- **Desventajas**: potencia muy baja (1-10 W), alto cogging
- **Veredicto**: solo para micro-proyectos educativos (cargar un teléfono, encender LEDs)

## Consensus DIY

Los alternadores PM **diseñados ex profeso** (ver [[Generador PMG — flujo axial]]) superan a todos los motores reciclados en rendimiento a bajas RPM. El coste adicional de construir un PMG casero (imanes + cobre + resina ≈ 100-300 EUR) se amortiza rápidamente en mayor producción.

La excepción: si ya tienes un motor PM de baja RPM (motor de lavadora de carga frontal con inverter, motor de bicicleta eléctrica hub) → puede funcionar como generador con eficiencia razonable. Pero estos motores cuestan casi lo mismo que construir un PMG ad hoc.
