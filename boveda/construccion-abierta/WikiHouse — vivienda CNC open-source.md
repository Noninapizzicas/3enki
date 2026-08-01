---
tipo: referencia
sector: construccion-abierta
tags: [wikihouse, vivienda, cnc, open-source, plywood, construccion]
---
# WikiHouse — vivienda CNC open-source

Sistema constructivo open-source: diseñar viviendas en software libre, cortar las piezas en CNC de madera, ensamblar sin herramientas especializadas.

## El concepto

WikiHouse propone que cualquiera pueda **descargar el diseño de una casa**, cortar las piezas en una fresadora CNC de tablero (plywood) y ensamblarlas como un mueble grande. Sin tornillos estructurales, sin grúa, sin mano de obra especializada.

## Sistema Skylark (generación actual)

| Aspecto | Detalle |
|---|---|
| **Material** | Plywood estructural 18 mm (típico: abedul o pino) |
| **Corte** | CNC router (Maslow, ShopBot, o cualquier mesa 4×8 ft) |
| **Ensamble** | Uniones finger-joint sin adhesivo estructural, pasadores |
| **Estructura** | Marcos tipo portal (portal frames) |
| **Aislamiento** | Celulosa insuflada, lana mineral, o similares |
| **Cimentación** | Pilotes roscados o losa ligera |
| **Plazo** | Estructura en 1–2 semanas (2–4 personas) |

## Piezas clave del ecosistema

### WikiHouse Software

- **ModelUp**: herramienta web para configurar la vivienda (dimensiones, ventanas, puertas)
- Exporta archivos de corte CNC (DXF/SVG)
- Basado en Grasshopper/Rhino internamente

### Bloques Wren (generación anterior)

- Sistema de bloques CNC apilables (tipo LEGO estructural)
- Cada bloque ~1.2 m, cortado en plywood
- Descontinuado en favor de Skylark pero documentación disponible

## Datos de coste

| Concepto | Rango |
|---|---|
| Material estructura (plywood) | $80–$150/m² |
| Aislamiento + acabados | $100–$200/m² |
| Instalaciones (fontanería, electricidad) | $50–$100/m² |
| **Total estimado** | **$230–$450/m²** |
| Vivienda convencional (referencia) | $800–$2.000/m² |

El ahorro principal está en mano de obra (auto-construcción) y ausencia de maquinaria pesada.

## Limitaciones

- **Normativa**: requiere ingeniería estructural firmada en la mayoría de jurisdicciones
- **Humedad**: plywood requiere protección exterior rigurosa (revestimiento ventilado)
- **Incendio**: madera sin tratar = combustible. Tratamiento ignífugo + sprinklers según normativa
- **Escala**: optimizado para 1–3 plantas. Edificios altos requieren otros sistemas
- **CNC grande**: necesitas una mesa de al menos 1220×2440 mm (4×8 ft)

## Proyectos relacionados

| Proyecto | Enfoque |
|---|---|
| **OpenStructures** | Grid modular abierto para componentes constructivos |
| **Open Building Institute** | Módulos constructivos open-source con ecosistema completo |
| **Paperhouses** | Planos de vivienda en Creative Commons |
| **FarmHack** | Herramientas agrícolas open-source (incluye construcciones) |

→ Fresado CNC para cortar piezas: ver sector [[carpinteria-cnc/Máquinas — Maslow, MPCNC, PrintNC]]
→ Ensambles CNC: [[carpinteria-cnc/Ensambles CNC — finger joints y más]]
→ Materiales: [[Materiales de construcción — comparativa maker]]
