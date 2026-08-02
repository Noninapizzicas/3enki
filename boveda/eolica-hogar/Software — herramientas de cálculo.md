---
tipo: herramienta
sector: eolica-hogar
tags: [software, open-source, simulacion, calculo]
---
# Software — herramientas de cálculo

## Diseño de pala y aerodinámica

| Herramienta | Lenguaje | Licencia | Uso |
|---|---|---|---|
| **QBlade** | C++ (Qt GUI) | GPL | Diseño de pala + simulación aero-servo-hidro-elástica. Similar a OpenFAST pero con GUI interactiva. qblade.org |
| **OpenFAST** | Fortran | Apache 2.0 | Simulación dinámica completa de turbina/parque (NREL). Incluye offshore flotante. github.com/OpenFAST |
| **CCBlade.jl** | Julia | MIT | Análisis BEM programático. Validado contra OpenFAST para turbinas de 3.4 MW |
| **XFLR5** | C++ (GUI) | GPL | Análisis de perfil y ala 3D, basado en XFoil. Ideal para comparar perfiles a diferentes Re |
| **XFoil** | Fortran | MIT | Motor de análisis de perfil (Cl, Cd, Cm vs alfa a un Re dado). Línea de comandos |
| **FreeCAD** | Python/C++ | LGPL | Diseño mecánico 3D — modelar palas, buje, torre, generador |

## Recurso eólico

| Herramienta | Lenguaje | Licencia | Uso |
|---|---|---|---|
| **windpowerlib** | Python | MIT | Modelar salida de turbinas y parques. Curvas de potencia, shear, wake |
| **windrose** | Python | BSD | Rosa de vientos (frecuencia y energía), ajuste Weibull. `pip install windrose` |
| **brightwind** | Python | MIT | Análisis completo de recurso: shear, Weibull, MCP (measure-correlate-predict) |
| **atlite** | Python | MIT | Conversión de datos meteorológicos (ERA5) a series de potencia renovable |

## APIs de datos

| Servicio | Auth | Datos eólicos | URL |
|---|---|---|---|
| **Open-Meteo** | ninguna | wind_speed 10m/80m/120m, direction, gusts, horario | api.open-meteo.com |
| **ERA5 (ECMWF)** | registro CDS | viento a múltiples alturas, desde 1940, 0.25° | cds.climate.copernicus.eu |
| **Global Wind Atlas** | ninguna | mapas de viento 10-200m, resolución ~250m | globalwindatlas.info |
| **IDAE Atlas Eólico** | ninguna | mapas España, resolución 100m, 30/60/80/100m | idae.es/atlas-eolico |

## Calculadoras web

- **NovaSolver BEM**: calculadora online — inputs: v_viento, radio rotor, TSR → outputs: distribución de cuerda y twist
- **WindyNation Wire Sizing**: calculadora de sección de cable para eólica (caída de tensión)

## Ecosistema GitHub

Búsqueda recomendada: `github.com/topics/wind-energy`, `github.com/topics/wind-turbine`, `github.com/topics/BEM`.

Proyecto **Code4WindEnergy**: listado colaborativo de herramientas open source para eólica (~40 proyectos catalogados).

⚠️ **A verificar**: la URL exacta de Code4WindEnergy no se confirmó en la investigación — buscar directamente en GitHub.
