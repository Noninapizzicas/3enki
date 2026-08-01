---
tipo: referencia
sector: carpinteria-cnc
tags: [madera, materiales, tableros, contrachapado, mdf, propiedades]
---
# Materiales — maderas y tableros

Propiedades de las maderas y tableros más usados en carpintería CNC.

## Maderas macizas

| Madera | Densidad (kg/m³) | Dureza (Janka N) | Nota |
|---|---|---|---|
| **Pino** | 350–550 | 1.800 | Blanda, barata, fácil de fresar. Nudos problemáticos |
| **Abeto** | 350–450 | 1.500 | Similar al pino, más uniforme |
| **Haya** | 680–720 | 5.800 | Dura, grano fino, excelente para muebles |
| **Roble** | 600–900 | 5.400–6.000 | Muy dura, taninos (corroe acero). Noble |
| **Nogal** | 550–650 | 4.500 | Grano fino, color oscuro, cara |
| **Cerezo** | 500–600 | 4.200 | Grano fino, oscurece con el tiempo |
| **Arce** | 650–750 | 6.400 | Muy dura, grano cerrado |
| **Fresno** | 650–700 | 5.900 | Flexible, buena para mangos de herramienta |
| **Teca** | 600–700 | 4.700 | Resistente al agua (exterior, barcos) |

## Tableros

| Tablero | Espesor típico | Ventaja | Limitación |
|---|---|---|---|
| **Contrachapado (plywood)** | 3–25 mm | Fuerte, estable, bordes limpios | Capas visibles en cantos |
| **Contrachapado báltico** | 3–24 mm | Alta calidad, abedul, capas delgadas | Caro |
| **MDF** | 3–25 mm | Superficie lisa, sin grano, barato | Polvo tóxico al fresar, débil en tornillos |
| **HDF** | 3–6 mm | MDF más denso, fondos de cajón | Delgado, no estructural |
| **OSB** | 9–22 mm | Barato, estructural | Superficie irregular, no estético |
| **Aglomerado** | 10–25 mm | Muy barato | Débil, se deshace con humedad |
| **Tablero macizo encolado** | 18–40 mm | Madera real, estable, belleza | Caro, se mueve con humedad |

## Parámetros de fresado por material

| Material | RPM | Avance (mm/min) | Prof. pasada | Fresa recomendada |
|---|---|---|---|---|
| Pino | 18.000 | 2.000–3.000 | 4–6 mm | Espiral 1 filo upcut |
| Contrachapado | 16.000 | 1.500–2.500 | 3–5 mm | Espiral 2 filos downcut (evita astillado) |
| MDF | 18.000 | 2.000–3.000 | 3–5 mm | Espiral 1 filo (evacua polvo) |
| Haya/Roble | 14.000 | 1.000–1.500 | 2–3 mm | Espiral 2 filos, carburo |
| Acrílico | 12.000 | 800–1.200 | 2–3 mm | Espiral 1 filo O-flute |

## Humedad y movimiento

La madera maciza se mueve con la humedad (se hincha y contrae perpendicular a la veta). Reglas:

- Trabajar madera con ≤12% de humedad (higrómetro de pines)
- Los tableros (contrachapado, MDF) son dimensionalmente estables
- En muebles de madera maciza, dejar holgura en ensambles perpendiculares a la veta

## Base de datos de densidades

El dataset **wood-density-Cirad** (ghislainv, GitHub) contiene datos de 4.022 árboles, 872 especies, 63 países en formato CSV.

→ Ensambles para estas maderas: [[Ensambles CNC — finger joints y más]]
→ Principios de fresado: [[Principio — fresado CNC en madera]]
