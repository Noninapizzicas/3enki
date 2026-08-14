---
tipo: componente
sector: baterias-almacenamiento
tags: [software, soc, soh, coulomb-counting, node-red, home-assistant, victron, mqtt, modbus]
---
# Software y monitorización — SOC, balanceadores, Node-RED, Home Assistant, Victron

> Un pack sin monitorización es una caja negra a la que le confías tu energía sin saber cuánta le queda ni cómo de sano está — la parte de software es la diferencia entre "gestionar" el banco y simplemente esperar que funcione.

---

## SOC (State of Charge) — cómo se calcula de verdad

```
MÉTODO 1 — VOLTAJE EN REPOSO (Open Circuit Voltage, OCV)
  Funcionamiento: correlaciona el voltaje de la celda en reposo (sin carga
  ni descarga activa) con un % de carga, usando la curva de descarga
  conocida de esa química
  Limitación: la curva de LiFePO4 es muy PLANA en el tramo central
  (3,25-3,35V puede representar del 20% al 80% de SOC) — poco preciso
  ahí, más útil en los extremos (cerca de vacío o lleno)

MÉTODO 2 — COULOMB COUNTING (integración de corriente)
  Funcionamiento: mide la corriente entrante/saliente con un shunt de
  precisión y la integra en el tiempo (Ah acumulados) para saber cuánta
  carga ha entrado o salido desde un punto de referencia conocido
  Ventaja: mucho más preciso que OCV en el tramo medio de carga
  Limitación: acumula error con el tiempo (deriva) si no se recalibra
  periódicamente contra un punto de referencia conocido (ej. carga completa)

MÉTODO 3 — MODELOS AVANZADOS (Kalman, redes neuronales)
  Combinan OCV + coulomb counting + modelo de la batería para corregir
  la deriva del coulomb counting en tiempo real — presente en BMS de
  gama alta y en la electrónica de VE, poco habitual en BMS DIY de coste
  contenido pero cada vez más presente en firmware de comunidad avanzado

EN LA PRÁCTICA: la mayoría de BMS DIY/comerciales combinan ambos métodos:
  coulomb counting como base, recalibrado por OCV cada vez que el pack
  llega a carga completa (donde el voltaje sí es un indicador fiable)
```

---

## SOH (State of Health) — la salud a largo plazo del pack

```
QUÉ MIDE: capacidad real disponible hoy frente a la capacidad nominal de
  fábrica, expresada en % — un pack al 85% SOH conserva el 85% de la
  capacidad que tenía nuevo

CÓMO SE ESTIMA: comparando la capacidad medida en un ciclo completo de
  carga/descarga controlado contra la capacidad nominal, o mediante
  resistencia interna (sube con la degradación) como indicador indirecto

POR QUÉ IMPORTA EN SEGUNDA VIDA: es el dato clave para decidir si un
  módulo de VE recuperado (ver [[Segunda vida EV — Nissan Leaf, Tesla, despiece de módulos]])
  merece la pena o está ya demasiado degradado para el proyecto previsto
```

---

## Integración con Home Assistant y Node-RED

```
VÍA MQTT (la más flexible, la recomendada por defecto):
  El BMS (o un puente intermedio, ej. ESP32 leyendo el BMS por UART/CAN
  y publicando por WiFi) publica voltaje, corriente, SOC, temperatura por
  celda a topics MQTT — Home Assistant los consume vía integración MQTT
  nativa, sin necesidad de polling activo

VÍA MODBUS (habitual en inversores híbridos tipo Victron, Growatt, Deye):
  El inversor expone sus registros Modbus TCP/RTU con los datos del
  banco de baterías conectado — Home Assistant los lee con la integración
  Modbus nativa o vía Node-RED como capa intermedia de procesamiento

NODE-RED COMO CAPA DE LÓGICA: útil cuando la automatización necesita
  reglas más complejas que un simple "si SOC < 25%, activa cargador" —
  ej. gestionar prioridad de carga entre banco doméstico y coche
  eléctrico según tarifa horaria y producción solar prevista

INTEGRACIONES DE COMUNIDAD DE REFERENCIA (2026):
  ha-victron-mqtt — integración moderna y modular para sistemas Victron,
  considerada más limpia que las configuraciones MQTT/Modbus manuales
  de generaciones anteriores
  diyBMS + ESPHome — el BMS open source de Stuart Pittaway expone sus
  datos directamente en formato compatible con Home Assistant vía
  ESPHome, sin capa intermedia adicional
```

---

## Automatizaciones típicas una vez integrado

```
→ Notificación si SOC cae por debajo de un umbral crítico (ej. 15%) sin
  que el sistema de carga esté activo
→ Alerta si la temperatura de cualquier celda supera un umbral de aviso
  (ej. 45°C) — señal temprana antes de llegar a un umbral de fuga térmica
→ Programación de carga en horas de tarifa eléctrica baja combinada con
  previsión de producción solar del día siguiente
→ Dashboard histórico de SOC/SOH para detectar degradación progresiva del
  pack a lo largo de meses, no solo el estado instantáneo
```

---

## Shunt de corriente — la pieza que hace posible el coulomb counting

```
QUÉ ES: resistencia de precisión muy baja (micro-ohmios) colocada en
  serie con el circuito principal — mide la caída de voltaje proporcional
  a la corriente que pasa, con mucha mayor precisión que un sensor de
  efecto Hall en la mayoría de aplicaciones de esta escala

VICTRON SMARTSHUNT — referencia comercial habitual en instalaciones
  híbridas, con Bluetooth propio y buena integración documentada en
  la comunidad Home Assistant/Node-RED
DIYBMS CURRENT SHUNT — versión open source del mismo concepto, integrable
  directamente vía ESPHome
```

---

## Errores comunes en la capa de software

```
★★★★☆ Confiar el SOC solo en voltaje (OCV) en un pack LiFePO4 — la curva
  plana en el tramo medio hace que el % mostrado sea poco fiable ahí;
  usar coulomb counting como método principal
★★★★☆ No recalibrar periódicamente el coulomb counting contra un punto
  de referencia conocido (carga completa) — el error acumulado deriva el
  % mostrado cada vez más lejos de la realidad con el tiempo
★★★☆☆ Montar automatizaciones de carga/descarga sin límites de seguridad
  redundantes al BMS — la automatización de software nunca debe ser la
  única protección contra sobrecarga o sobredescarga, el BMS sigue siendo
  la última línea de defensa
★★★☆☆ Elegir integración Modbus/MQTT sin verificar antes que el fabricante
  del inversor/BMS documenta o permite ese acceso — algunos sistemas
  cerrados restringen la lectura de datos a su propia app
```

---

## Novedades 2025-2026

```
→ La integración ha-victron-mqtt gana adopción en la comunidad como vía
  moderna y mantenida frente a las configuraciones manuales MQTT/Modbus
  de hace unos años, simplificando notablemente la puesta en marcha.
→ diyBMS (Stuart Pittaway) consolida su versión 4 sobre ESP32 con
  integración directa a ESPHome, reduciendo la fricción entre "tener un
  BMS DIY" y "verlo en un dashboard de Home Assistant".
→ Los modelos de estimación de SOC basados en aprendizaje automático
  (más allá del Kalman clásico) empiezan a aparecer en literatura técnica
  reciente, aunque de momento su aplicación práctica sigue concentrada en
  BMS de automoción/industria, no en el DIY doméstico.
```

---

→ Datos que expone el BMS a este software: [[BMS — selección, cableado y protecciones]]
→ La capa de domótica que consume estos datos: [[../domotica-iot/00 - Domótica e IoT (MOC)|Domótica e IoT]]
