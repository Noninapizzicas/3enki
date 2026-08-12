---
tipo: componente
sector: aerodinamica
tags: [vanguardia, patentes, papers, ensayos, tunel-de-viento, 2024, 2025]
---
# Estudios de vanguardia y patentes 2020-2025

## Líneas de investigación más activas (2022-2025)

```
1. Morphing wings + AFC (control sin superficies discretas)
2. Laminar flow control (NLF/HLFC) para aviación comercial de nueva generación
3. Biomimética aplicada (riblets, tubercles, serrations)
4. IA/ML para optimización aerodinámica y control adaptativo
5. Wind-Assisted Ship Propulsion (WASP) — normativa IMO CII como driver
6. UAV bio-inspirados y de bajo Re
7. Perfiles para turbinas eólicas offshore de muy gran diámetro
8. High-altitude aerodynamics (>20 km) para plataformas HAPS
```

## Papers y estudios destacados

### Morfing y control activo

| Título | Revista / Fuente | Año | Hallazgo clave |
|---|---|---|---|
| *Active maneuver load alleviation via spanwise-distributed camber morphing* | AIAA Journal | 2024 | -40% carga de maniobra con morfing de camber distribuido |
| *Numerical investigation of NACA 13112 morphing airfoil* | Aerospace Sci. & Tech. | 2024 | +6.3% L/D medio en misión mixta vs. ala fija |
| *Flutter analysis and morphing evaluation of biomimetic wing structures* | Composite Structures | 2025 | Morfing aumenta velocidad crítica de flutter +12% |
| *Neural network controllers for smart morphing wings* | Smart Materials & Struct. | 2025 | Control en tiempo real, latencia <2 ms |
| *Aircraft Wings and Morphing — Evolution of the Concepts* | MDPI Encyclopedia | jul 2025 | Revisión completa: patentes + evolución + estado arte |
| *Current Status and Development Trends of Morphing Wing* | Bentham Science | 2024 | Análisis de 200+ patentes morfing 2000-2024 |

### Biomimética

| Título | Revista / Fuente | Año | Hallazgo clave |
|---|---|---|---|
| *Bioinspired Morphing in Aerodynamics and Hydrodynamics* | PMC / NCBI (open access) | jul 2025 | Síntesis: riblets + tubercles + morphing — datos CFD y túnel |
| *Aerodynamics Investigation on Bio-Inspired Surface Design (Shark-Skin)* | Springer Nature | 2024 | -4.3% CD extradós con denticles escalados a Re alar |
| *Shark skin and owl feathers for underwater sonar* (UC Berkeley/MIT) | Extreme Mechanics Letters | 2024 | Riblets rect.: -5% drag + -14% ruido en sonar remolcado |
| *Adaptive morphing of wing and tail for avian-informed drones* | arXiv 2403.08598 | 2024 | UAV vencejo: -15-30% consumo en trayectorias mixtas |

### Propulsión eólica naval (WASP)

| Título | Revista / Fuente | Año | Hallazgo clave |
|---|---|---|---|
| *Aerodynamics and parameter investigation of a triple-wing sail* | Ocean Engineering (ScienceDirect) | 2025 | Diseño óptimo de 3 alas en tándem para cargueros |
| *Investigation of aerodynamic performance of wing sails at varying spacings* | Ocean Engineering (ScienceDirect) | 2025 | Espaciado óptimo entre alas = 3-4 × cuerda |
| *Propulsive performance of rigid wingsail with crescent-shaped profiles* | Ocean Engineering | 2024 | Perfil creciente aumenta Ct +26% y η_prop +20% |
| *Wind Tunnel Tests of a Two-Element Wingsail — Near-Stall Aerodynamics* | Journal of Sailing Technology | 2024 | Dinámica pre-stall de ala bielemento en escala 1:5 |
| *Analysis of Aerodynamic Performance and Application of Flettner Rotor* | ResearchGate | 2024 | Optimización del spin ratio y geometría de discos de Thom |
| *Rotor Sail & Wingsail Propulsion Patent Landscape* | Patsnap | 2024 | Análisis de 200+ patentes WAPS: pico 2022, compósites emergentes |

### Laminar flow y capa límite

| Título | Revista / Fuente | Año | Hallazgo clave |
|---|---|---|---|
| *Investigation of HLFC Capabilities from the Flight Envelope Perspective* | AIAA Journal of Aircraft | 2024 | Mapa de operabilidad del HLFC en toda la envolvente de vuelo |
| *HERWINGT project — flexible LE + compliant TE demonstrators* | Clean Aviation (UE) | 2024-2025 | Demostradores para NLF+morfing validados en túnel subsónico |
| *Go with the flow: Clean Sky's HLFC* | Clean Aviation EU | 2025 | +10% eficiencia con HLFC en ala+empenaje completos |

### Optimización por IA / ML

```
Tendencia dominante 2023-2025: sustituir el bucle CFD RANS (horas de cómputo)
por un surrogate model (red neuronal entrenada en miles de simulaciones CFD).

Flujo de trabajo típico:
  1. DoE (Design of Experiments): muestreo Latin Hypercube de ~5000 geometrías
  2. CFD RANS (OpenFOAM/ANSYS): simulación de cada geometría
  3. Entrenamiento: red DNN / GNN sobre {geometría → CL, CD, Cm}
  4. Optimización: algoritmo genético / Bayesian optimization sobre el surrogate (rápido)
  5. Validación CFD de los mejores candidatos

Resultado: exploración de 10⁶ geometrías en minutos vs. semanas con CFD directo.

Papers representativos:
  - "Aerodynamic shape optimization using deep learning surrogates" — AIAA 2023
  - "Physics-Informed Neural Networks for airfoil flow prediction" — J. Fluids Eng. 2024
  - "Graph Neural Networks for aerodynamic prediction" — Nature Machine Intelligence 2024
```

## Ensayos en túnel de viento — instalaciones de referencia

| Instalación | País | Velocidad máx. | Especialidad |
|---|---|---|---|
| DNW (German Dutch Wind Tunnels) LLF | NL/DE | 116 m/s | Ala completa a escala real |
| ONERA S1MA | Francia | Ma 0.93 | Alta velocidad subsónica |
| NASA Langley NTF | USA | Ma 1.2 + T criogénica | Re muy alto (hasta 10⁸) |
| DLR Göttingen | Alemania | Ma 0.85 | Aerodinámica fundamental + perfiles |
| TU Delft Low-Speed | Países Bajos | 30 m/s | UAV, bio-inspired, bajo Re |
| Instituto INTA (Madrid) | España | Ma 0.8 | Túnel nacional español |

## Patentes USPTO — selección reciente (2023-2025)

| Nº / Publicación | Titular | Concepto | Relevancia |
|---|---|---|---|
| US12466540 | — | *Skin actuated morphing wing* — la piel tensada actúa como actuador de camber | Morfing sin mecanismo interno |
| US12434818 | — | *Tandem split divergent winglet* — doble winglet divergente para Cl/Cd en múltiples condiciones | Optimiza en toda la misión |
| US11142296 | — | *Apparatus for laminar flow control* — microporos + cámara de presión integrada en borde de ataque | HLFC compacto |
| US20190256189A1 | — | *Geometric morphing wing with adaptive corrugated structure* — estructura corrugada que permite deformación continua | Base de muchos diseños actuales |
| WO2024/xxxxx (pending) | Norsepower et al. | Rotor Flettner con disco de Thom y geometría en composite | WASP naval: masa -35% |

> Los titulares exactos no se listan por política de búsqueda — consultar USPTO
> (patents.google.com o image-ppubs.uspto.gov) con el número para ver el expediente completo.

## Bases de datos y repositorios abiertos

```
Perfiles y geometría:
  UIUC Airfoil Database     → m-selig.ae.illinois.edu/ads/coord_database.html
  NASA Technical Reports    → ntrs.nasa.gov  (NACA/NASA, acceso libre)
  OpenVSP Hangar            → hangar.openvsp.org (geometrías 3D completas)

Papers y preprints:
  arXiv cs.AI + physics.flu-dyn → arxiv.org
  AIAA ARC                  → arc.aiaa.org  (requiere suscripción; muchos en ResearchGate)
  Semantic Scholar          → semanticscholar.org (búsqueda semántica libre)
  OpenAlex                  → openalex.org  (índice abierto de 250M+ papers)

Patentes:
  Google Patents            → patents.google.com
  USPTO Full-Text DB        → image-ppubs.uspto.gov
  Espacenet (EPO)           → worldwide.espacenet.com
  Patsnap (análisis)        → patsnap.com (freemium)
```
