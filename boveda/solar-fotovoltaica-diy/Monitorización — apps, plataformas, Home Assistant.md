---
tipo: herramienta
sector: solar-fotovoltaica-diy
tags: [monitorizacion, SolarEdge, FroniusSolarWeb, HomeAssistant, apps]
---
# Monitorización — apps, plataformas, Home Assistant

> Una instalación sin monitorización es una caja negra — el fallo de un solo microinversor puede pasar meses sin detectarse si nadie mira los números.

---

## Apps de fabricante — la primera capa

```
HUAWEI FusionSolar: monitorización en tiempo real, gestión de batería LUNA2000
  integrada, alertas de fallo por notificación push — valorada como la más
  pulida visualmente del mercado 2026

FRONIUS SOLAR.WEB: plataforma web + app móvil, histórico de producción por
  inversor, muy usada por instaladores profesionales para soporte remoto,
  API abierta bien documentada (SolarAPI v0/v1) para integraciones de terceros

SOLAREDGE: monitorización panel a panel cuando se usan optimizadores de la
  propia marca, detección de degradación individual muy granular

ENPHASE Enlighten: monitorización microinversor a microinversor — el nivel
  más fino de detalle posible, cada panel reporta su producción individual

GROWATT ShinePhone / DEYE app: monitorización básica pero funcional, integrada
  en el inversor sin coste adicional
```

---

## Integración con Home Assistant

```
POR QUÉ INTEGRAR: sacar los datos del "silo" propietario del fabricante y
  cruzarlos con el resto de la casa — activar electrodomésticos cuando hay
  excedente de producción, cargar el coche eléctrico solo con sol sobrante,
  dashboards unificados con consumo+producción+batería en una sola pantalla

INTEGRACIONES OFICIALES DISPONIBLES:
  SolarEdge: integración oficial en Home Assistant — sensores de potencia
  actual, energía del día, energía total, y estado de batería si existe
  Fronius: integración oficial que interroga el datalogger/Datamanager
  vía SolarAPI JSON — soporta v0 y v1
  Alternativa Fronius: integración de la nube Solar.web cuando el sistema
  Home Assistant no está en la misma red que el inversor

CASO DE USO TÍPICO: automatización que enciende el calentador de agua o
  carga el coche eléctrico automáticamente cuando la producción supera el
  consumo base de la vivienda por un margen definido — "usar el excedente
  antes de verterlo a red" es la automatización más rentable de todas

Ver también: [[../domotica-iot/00 - Domótica e IoT (MOC)|Domótica e IoT]] —
Home Assistant como hub central, patrones MQTT aplicables a monitorización solar
```

---

## Monitorización DIY con ESP32

```
CUÁNDO TIENE SENTIDO: cuando el inversor no ofrece API accesible, o se quiere
  monitorizar un punto adicional que el fabricante no cubre (por ejemplo,
  consumo de un circuito específico, no solo producción/consumo total)

COMPONENTES TÍPICOS: ESP32 + sensor de corriente no invasivo (pinza tipo SCT-013)
  + reporte por MQTT al broker local — mismo patrón que cualquier proyecto de
  domótica IoT, aplicado a energía

Ver [[../electronica-maker/00 - Electrónica Maker (MOC)|Electrónica Maker]]
para el detalle de sensores y programación ESP32
```

---

## Qué vigilar en la monitorización — señales de alerta

```
CAÍDA BRUSCA DE PRODUCCIÓN de un panel/string concreto frente al resto:
  → posible avería del microinversor/optimizador, panel sucio localizado,
  sombra nueva (rama crecida, obra vecina) o conector suelto

PRODUCCIÓN GENERAL POR DEBAJO DEL HISTÓRICO PARA LA MISMA ÉPOCA:
  → degradación normal esperada (≈0,4-0,5%/año en paneles modernos) si es
  gradual y uniforme; investigar si es brusca o superior a lo esperado

INVERSOR SIN COMUNICACIÓN / DATOS AUSENTES en la plataforma:
  → primer síntoma habitual de fallo de WiFi/conectividad del inversor, no
  necesariamente de fallo de producción — revisar conexión antes de asumir avería

ALERTAS DE TEMPERATURA ELEVADA del inversor:
  → revisar ventilación del emplazamiento, especialmente en inversores
  ubicados en exterior sin sombra directa en verano
```

---

## Errores comunes en monitorización

```
★★★★☆ No revisar la app nunca tras la instalación — perder meses de producción
  perdida por un fallo silencioso sin notarlo
★★★☆☆ Confiar solo en el resumen mensual sin mirar el detalle diario/horario
  — un fallo puntual de pocos días se diluye en la media mensual
★★★☆☆ No configurar alertas push cuando la plataforma las ofrece — depender
  de mirar la app manualmente en vez de que el sistema avise activamente
```

---

## Novedades 2025-2026

```
→ Las integraciones oficiales de Home Assistant para SolarEdge y Fronius siguen
  ampliando el número de sensores disponibles (SOC de batería, potencia
  instantánea, energía acumulada), reduciendo la necesidad de soluciones DIY
  con ESP32 salvo para casos muy específicos
→ Crecen las automatizaciones de "carga inteligente" (coche eléctrico,
  termo eléctrico) condicionadas al excedente de producción solar en tiempo
  real, como capa de valor añadido sobre la monitorización pura
```
