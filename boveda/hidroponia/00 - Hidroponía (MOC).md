---
tipo: moc
sector: hidroponia
tags: [hidroponia, NFT, DWC, Kratky, aeropónico, nutrientes, LED, ESP32, MOC]
---
# Hidroponía (MOC)

Cultivar **sin suelo** — la raíz en solución nutritiva controlada. Sin microbioma que gestionar, sin plagas del suelo, sin lluvia, sin temporadas. Control total a cambio de atención constante a EC, pH y oxigenación.

## Mapa del sector

| Nota | Qué cubre |
|---|---|
| [[hidroponia/Sistemas hidropónicos — NFT, DWC, Kratky, aeropónico\|Sistemas]] | NFT, DWC, Kratky pasivo, ebb&flow, aeropónico, wick — comparativa y cuándo usar cada uno |
| [[hidroponia/Nutrientes en hidroponía — EC, pH, macros y micros\|Nutrientes]] | Macros (N-P-K-Ca-Mg-S), micros, EC (conductividad), pH objetivo, mezclas caseras |
| [[hidroponia/Iluminación — LED grow lights, PPFD, DLI, espectro\|Iluminación]] | Espectro PAR, PPFD, DLI, fotoperíodo, tipos de LED, tabla cultivos-PPFD |
| [[hidroponia/Sustratos en hidroponía — rockwool, coco, perlita, arcilla\|Sustratos]] | Lana de roca, fibra de coco, perlita, arcilla expandida, espuma de poliuretano |
| [[hidroponia/Terraza y espacio reducido — Kratky en jarra, rack vertical\|Terraza y espacio reducido]] | Kratky en jarra, rack vertical de NFT, ZipGrow, IKEA Skadis hack, huerto de ventana |
| [[hidroponia/Automatización DIY — ESP32, sensores EC-pH, MQTT\|Automatización DIY]] | ESP32 + sensores analógicos de EC/pH/temperatura, dosificadores peristálticos, MQTT |
| [[hidroponia/Cultivos recomendados — lechugas, fresas, tomates, aromáticas\|Cultivos recomendados]] | Tabla por sistema, tiempos, densidad, semanas hasta cosecha |
| [[hidroponia/Fuentes — hidroponía\|Fuentes]] | Libros, canales, comunidades, tiendas de insumos hidropónicos (España/EU) |

## La lógica del sistema

```
DIFERENCIA FUNDAMENTAL CON EL SUELO:
  Suelo:        el microbioma mineraliza los nutrientes → la planta toma lo que puede
  Hidroponía:   el cultivador aporta los nutrientes DIRECTAMENTE en forma iónica
                la planta los absorbe de la solución sin intermediarios

  Ventajas:
    → Crecimiento 30-50% más rápido (nutrientes siempre disponibles, sin búsqueda de raíz)
    → Control total (EC, pH, temperatura de raíz, luz)
    → Sin plagas del suelo (Fusarium, nemátodos, Pythium del suelo)
    → Uso de agua 90% menor vs riego por inundación convencional
    → Producción todo el año (en interior con luz artificial)

  Desventajas:
    → Fallo de energía = muerte de las plantas en horas (en sistemas activos)
    → Requiere monitoreo diario de EC y pH
    → Inversión inicial mayor
    → Curva de aprendizaje en nutrición
    → El sabor puede ser inferior al suelo si la receta nutricional es desequilibrada
```

## Parámetros de control — los tres que importan

```
EC (Electrical Conductivity) — concentración total de nutrientes en la solución:
  Unidades: mS/cm (milisiemens/cm) o EC en escala 0-5
  Agua pura: EC ≈ 0 mS/cm
  Solución nutritiva básica: EC 1.0-2.5 mS/cm (según cultivo y fase)
  
  EC BAJA (< 1.0): la planta tiene hambre → crecimiento lento, hojas pálidas
  EC ALTA (> 3.0): estrés osmótico → hojas rizadas, puntas marrones, marchitamiento

pH — determina la disponibilidad de los nutrientes:
  Rango óptimo en hidroponía: 5.5 - 6.5
    < 5.5: Fe, Mn, B se vuelven tóxicos (sobredosis); Ca y Mg precipitan
    > 6.5: Fe, Mn, Zn se bloquean (deficiencia aunque estén presentes)
    
  El pH SUBE cuando las plantas absorben nutrientes (normal)
  El pH BAJA cuando hay algas (producen ácido) o en agua sin tampón

DO (Dissolved Oxygen) — el oxígeno en el agua que respiran las raíces:
  Óptimo: > 6 mg/L (el oxígeno disminuye al subir la temperatura del agua)
  T° agua < 20°C → DO mayor · T° agua > 25°C → DO menor + riesgo Pythium
  → mantener el depósito fresco (enfriar o proteger del calor) + airear con bomba
```

## Compatibilidad con otros sectores

- [[agricultura-natural/00 - Agricultura natural (MOC)|Agricultura natural]] — el contrapunto del suelo vivo; comparten el conocimiento de nutrientes
- [[domotica-iot/00 - Domótica e IoT (MOC)|Domótica e IoT]] — Home Assistant + MQTT para automatizar EC/pH/riego hidropónico
- [[electronica-maker/00 - Electrónica Maker (MOC)|Electrónica Maker]] — PCB para el controlador de hidroponía, sensores analógicos
- [[cultivo-melena-leon/00 - Cultivo de melena de león (MOC)|Cultivo de setas]] — también requiere control de ambiente (humedad, CO₂, temperatura)
