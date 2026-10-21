---
tipo: proyecto
sector: solar-fotovoltaica-diy
tags: [proyectos, kit-balcon, tejado, off-grid, presupuesto-real]
---
# Proyectos paso a paso — kit balcón, tejado, cabaña aislada

> Tres proyectos reales que cubren los tres niveles de entrada al sector — de la tarde de un sábado a la obra de un fin de semana largo.

---

## Proyecto 1 — Kit balcón 800W (nivel 0, sin trámite)

```
OBJETIVO: reducir factura eléctrica de un piso sin obra ni papeleo
TIEMPO: 2-3 horas de montaje

MATERIALES:
  2× paneles 400-410W                                    → 300-400€
  1× microinversor 800W (certificado VDE-AR-N 4105)      → 150-220€
  Soporte de barandilla ajustable                        → 60-100€
  Cable con conector Schuko/Wieland homologado            → 30-50€
  Conectores MC4 y cableado DC                            → incluido en kit
  TOTAL ORIENTATIVO: 600-800€

PASOS:
  1. Verificar orientación del balcón (sur/sureste/suroeste ideal)
  2. Montar soporte en barandilla siguiendo instrucciones del fabricante
  3. Fijar paneles al soporte
  4. Conectar paneles al microinversor (DC, conectores MC4)
  5. Conectar microinversor a enchufe dedicado de pared (no regleta)
  6. Verificar producción en la app del fabricante el primer día soleado

RESULTADO ESPERADO: 100-180€/año de ahorro, amortización en 4-7 años

Ver detalle normativo completo en [[Kit balcón — plug and play, normativa, montaje]]
```

---

## Proyecto 2 — Instalación de tejado 4kWp conectada a red sin batería (nivel 1)

```
OBJETIVO: cubrir gran parte del consumo diurno de una vivienda unifamiliar
TIEMPO: 1-2 días de instalación (recomendado con instalador autorizado REBT
  para la parte eléctrica y legalización, aunque la parte mecánica de anclaje
  puede ser DIY con supervisión)

MATERIALES:
  9× paneles TOPCon 450W (4,05 kWp)                       → 1.200-1.800€
  1× inversor string 4-5kW (Growatt o similar gama media) → 800-1.200€
  Estructura de anclaje para teja/chapa (según tejado)     → 350-600€
    (ver [[Sistemas de anclaje y estructura — cubierta, suelo, fachada, balcón]]
    para elegir según tipo de cubierta concreto)
  Protecciones (diferencial tipo B, fusibles gPV, SPD)     → 300-500€
  Cableado, canalización, caja de conexiones               → 200-350€
  Mano de obra instalador autorizado + boletín REBT        → 800-1.500€
  TOTAL ORIENTATIVO: 4.000-6.000€ (dentro del rango 1.000-1.500€/kWp de 2026)

PASOS:
  1. Estudio de sombras y dimensionado (ver [[Dimensionado del sistema — consumo, HSP, inclinación, sombras]])
  2. Elegir y presupuestar sistema de anclaje según tipo de cubierta
  3. Contratar instalador autorizado REBT (obligatorio por encima del umbral
  de kit balcón) para la parte eléctrica y el boletín
  4. Montaje de estructura y paneles
  5. Cableado DC, instalación de inversor, protecciones CC/CA
  6. Trámites: alta como autoconsumidor, legalización, RAAC si aplica
  (ver [[Autoconsumo conectado a red — RD 244-2019, trámites España]])
  7. Puesta en marcha y verificación de monitorización

RESULTADO ESPERADO: cobertura del 30-40% del consumo total (sin batería),
  amortización típica 6-9 años según tarifa y patrón de consumo
```

---

## Proyecto 3 — Cabaña aislada off-grid (nivel 3)

```
OBJETIVO: vivienda rural sin acceso a red, autonomía energética completa
TIEMPO: fin de semana largo (3-4 días) para la parte de instalación, más
  el tiempo previo de dimensionado cuidadoso (crítico en este proyecto)

MATERIALES (ejemplo para consumo diario ≈2.260 Wh, 3 días de autonomía —
  ver desarrollo completo del cálculo en
  [[Instalación aislada — off-grid, dimensionado, reguladores]]):
  4× paneles 400W (1.600Wp, sobredimensionado sobre el mínimo calculado)  → 500-700€
  1× regulador MPPT dimensionado a la Isc total de los paneles           → 150-300€
  Banco de batería LiFePO4 ≈8,5kWh (comercial o DIY con celdas EVE)      → 3.000-6.000€
  1× inversor off-grid 3kW con entrada de generador                     → 500-900€
  Estructura de suelo (hincado o tornillo de tierra)                     → 300-600€
  Cableado dimensionado para minimizar caída de tensión                  → 200-400€
  Generador de respaldo (opcional, diésel pequeño)                       → 600-1.200€
  TOTAL ORIENTATIVO: 6.000-10.000€ sin generador, 7.000-11.000€ con generador

PASOS:
  1. Calcular consumo diario real con margen (paso crítico, no atajar)
  2. Dimensionar por el HSP del MES MÁS DESFAVORABLE, no la media anual
  3. Elegir sistema de anclaje de suelo según terreno (hincado vs tornillo
  vs zapata — ver nota de anclajes)
  4. Montar estructura y paneles
  5. Instalar regulador MPPT y conectar banco de baterías
  6. Instalar inversor off-grid, configurar corte de bajo SOC
  7. Integrar generador de respaldo si el proyecto lo incluye
  8. Prueba de varios días completos antes de depender del sistema al 100%

RESULTADO ESPERADO: autonomía energética completa si el dimensionado es
  correcto — el margen de error aceptable en este proyecto es mucho menor
  que en los dos anteriores, porque no existe red de respaldo
```

---

## Errores comunes transversales a los tres proyectos

```
★★★★★ Empezar a comprar componentes antes de terminar el dimensionado completo
  — desajustes de compatibilidad (tensión, corriente, protocolo) que obligan
  a devolver material o comprar adaptadores
★★★★☆ Subestimar el coste de la parte "invisible" (protecciones, cableado,
  mano de obra, trámites) frente al coste vistoso de paneles e inversor
★★★☆☆ No presupuestar el sistema de anclaje como partida propia — asumir que
  "va incluido" cuando muchos presupuestos lo cotizan aparte
```
