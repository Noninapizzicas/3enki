---
tipo: componente
sector: electromecanica-ondas
tags: [fuentes, referencias, libros, comunidades, electromagnetismo, motores, antenas, SDR]
---
# Fuentes — electromecánica y ondas

## Libros de referencia

### Electromagnetismo y campos

| Título | Autor(es) | Nivel | Énfasis |
|---|---|---|---|
| *Introduction to Electrodynamics* (4ª ed., 2013) | Griffiths, D.J. | Universitario | El texto canónico en inglés. Sólido en ondas y potencial vectorial |
| *Electromagnetics* (2ª ed.) | Hayt & Buck | Técnico | Más aplicado, buen tratamiento de líneas de transmisión |
| *Física* Vol. 2 | Serway & Jewett | Bachillerato/1º Uni | Introducción sólida a E&M antes de Griffiths |
| *Classical Electrodynamics* (3ª ed.) | Jackson, J.D. | Máster/Doctorado | El referente matemático riguroso — no para principiantes |

### Motores y accionamientos

| Título | Autor(es) | Nivel | Énfasis |
|---|---|---|---|
| *Electric Machinery Fundamentals* (5ª ed., 2011) | Chapman, S.J. | Universitario | El estándar anglosajón en máquinas eléctricas (motores AC/DC, transformadores) |
| *Máquinas Eléctricas* (7ª ed.) | Fraile Mora, J. | Universitario (ES) | Referente en español, muy usado en Escuelas Técnicas de España |
| *Brushless Permanent Magnet Motor Design* (2ª ed.) | Hanselman, D. | Avanzado | BLDC/PMSM en detalle: devanados, par, ondulación |
| *Wind Turbine Recipe Book* (2013) | Piggott, H. | Maker/Práctico | Manual completo de PMG axial DIY — libre online en windempowerment.org |

### Antenas y RF

| Título | Autor(es) | Nivel | Énfasis |
|---|---|---|---|
| *Antenna Theory: Analysis and Design* (3ª ed., 2005) | Balanis, C.A. | Universitario | El referente en teoría de antenas — dipolo, Yagi, array, apertura |
| *The ARRL Antenna Book* (25ª ed., 2024) | ARRL | Práctico | Construcción real para radioaficionados — la biblia práctica |
| *HF Antenna Collection* | Cebik, L.B. (W4RNL) | Avanzado | Colección de diseños modelados en NEC2 — libre en antennex.com |
| *Practical Antenna Handbook* (5ª ed.) | Carr, J.J. | Técnico-práctico | SDR, antenas wideband, VHF/UHF |

### SDR y señales

| Título | Autor(es) | Nivel | Énfasis |
|---|---|---|---|
| *Software Defined Radio for Engineers* (2018) | Travis Collins et al. | Universitario | Libre en ADI — arquitectura SDR, modulaciones, GNU Radio |
| *The Hobbyist's Guide to the RTL-SDR* | Carl Laufer | Maker | Guía práctica para RTL-SDR — todos los proyectos populares |
| *GNU Radio Tutorials* | GNU Radio Foundation | Intermedio | wiki.gnuradio.org — tutoriales oficiales progresivos |

---

## Revistas y publicaciones académicas

| Publicación | Área | Acceso |
|---|---|---|
| *IEEE Transactions on Magnetics* | Imanes, motores, materiales magnéticos | IEEE Xplore (pago, preview libre) |
| *IEEE Transactions on Industrial Electronics* | Drives, control, power electronics | IEEE Xplore |
| *IEEE Antennas and Propagation Magazine* | Antenas, diseño, revisiones | IEEE Xplore |
| *IET Electric Power Applications* | Máquinas eléctricas, accionamientos | IET Digital Library |
| *Progress In Electromagnetics Research (PIER)* | EM, antenas, metamateriales | Libre en piers.org |
| *arXiv (cs.NI, eess.SP, physics.app-ph)* | Prepublicaciones — resultados antes de peer review | Libre en arxiv.org |

---

## Comunidades y foros

### Radioafición y antenas

```
URE (Unión de Radioaficionados Españoles) — ure.es
  La organización nacional española. Exámenes para licencia HAREC y clase B.
  Publicación: "URE" (revista bimestral) con proyectos de antenas y electrónica

ARRL (American Radio Relay League) — arrl.org
  La referente mundial en radioafición. Biblioteca de proyectos, software (NEC2, etc.)
  QST magazine — la publicación mensual más leída en radioafición

eHam.net — foro muy activo en inglés para todo lo relacionado con antenas y equipos
QRZ.com — base de datos de indicativos + foro técnico + clasificados
```

### SDR y recepción

```
rtl-sdr.com — el blog de referencia para proyectos RTL-SDR (Karl Laufer)
  Tutoriales, últimas noticias de hardware, proyectos, comparativas de hardware

r/SDR (Reddit) — comunidad activa, buenas discusiones técnicas
r/amateurradio — radioafición en Reddit, mezcla de HF, SDR y homebrew

airspy.com/community — foro oficial de Airspy (R2, HF+) — usuarios avanzados
sdrplay.com/community — foro oficial de SDRplay (RSPdx)
```

### Motores y accionamientos maker

```
endless-sphere.com — la mayor comunidad de e-bikes y motores eléctricos DIY
  Foros: "motor technology", "battery tech", "controllers" — muy técnico

rcgroups.com — drones y RC, excelente para BLDC, ESC y firmware VESC
  Subforo "Power systems" — KV, células Li, motores outrunner

4hv.org — la comunidad de alta tensión más técnica en inglés
  Tesla coils, Van de Graaff, marx generators — diseños de primera mano

electro-tech-online.com — electrónica general con sección de motores y control
```

### PMG y energía renovable

```
windempowerment.org — talleres Piggott, documentación técnica, red de constructores
scoraigwind.co.uk — blog de Hugh Piggott (el creador del método) — activo y técnico
fieldlines.com — foro de energía alternativa, muy activo en años 2000-2015
  El archivo histórico contiene decenas de PMG DIY documentados con fotos y medidas
```

---

## Herramientas y software (todos gratuitos)

| Herramienta | URL | Uso |
|---|---|---|
| LTspice | ltspice.analog.com | Simulación de circuitos |
| FEMM 4.2 | femm.info | FEM magnético/electrostático 2D |
| OpenEMS | openems.de | FDTD electromagnético 3D |
| KiCad 8 | kicad.org | PCB + esquemáticos |
| XFOIL | web.mit.edu/drela/Public/web/xfoil | Perfiles aerodinámicos (2D) |
| 4NEC2 | nec2.org | Antenas de hilo (NEC2, Windows) |
| MMANA-GAL | mmana-gal.org | Antenas NEC2 (interfaz amigable) |
| SDR++ | sdrpp.org | Receptor SDR multiplataforma |
| SatDump | satdump.org | Decodificador satélites meteorológicos |
| rtl_433 | github.com/merbanan/rtl_433 | Decodificador ISM 433/868 MHz |
| dump1090-fa | github.com/flightaware/dump1090 | ADS-B aviones |
| GNU Radio | gnuradio.org | SDR visual, bloques de procesado |
| QBlade | qblade.org | Turbinas eólicas (BEM + VAWT) |
| OpenFOAM | openfoam.com | CFD general (fluidos) |

---

## Bases de datos y catálogos de componentes

```
Imanes:
  supermagnete.es / supermagnete.de — catálogo grande, envío rápido, datos técnicos completos
  e-magnets-uk.com — referente en Reino Unido con excelente documentación
  Magnets4Energy (AliExpress) — gama NdFeB N35-N52 con temperaturas, más barato pero sin garantía de grado

Motores brushless:
  T-Motor (tmotor.com) — calidad industrial, hoja de datos detallada
  KDE Direct (kdedirect.com) — UAV/drones profesionales, datos KV verificados
  AliExpress: buscar "outrunner BLDC" con filtro 4/5 estrellas + verificar KV contra la fórmula

ESC / controllers:
  VESC Project (vesc-project.com) — firmware VESC, hardware de referencia, community designs
  ODrive (odriverobotics.com) — control servo de precisión, encoder, FOC de alta calidad

Wire / coils:
  Elektrisola — fabricante de hilo esmaltado, datos técnicos hasta 0.01mm AWG 56
  Farnell / RS Components — distribuidores con hoja de datos de todos los productos

RTL-SDR:
  rtl-sdr.com/store — el mejor RTL-SDR v4 directo del creador del proyecto
  Nooelec (nooelec.com) — alternativa con LNAs y accesorios de calidad
```

---

## Normativa y estándares

```
Antenas y RF (España/Europa):
  BOE: CNAF (Cuadro Nacional de Atribución de Frecuencias) — las bandas asignadas por uso
  ETSI EN 300 220: dispositivos de corto alcance (ISM, PMR446)
  ETSI EN 302 537: estaciones de radioaficionado
  UIT-R (Unión Internacional de Telecomunicaciones, sector radio) — tratados internacionales

Motores y seguridad eléctrica:
  IEC 60034: máquinas eléctricas rotativas (clasificaciones de eficiencia IE1-IE4)
  EN 60529 (IP code): grado de protección de carcasas (IP54, IP65, etc.)
  UL/CE para inversores y sistemas fotovoltaicos (si se conecta a red)

Aerogeneradores pequeños:
  IEC 61400-2: diseño de turbinas eólicas de pequeña potencia (<200 kW)
  IEC 61400-12: medición de curvas de potencia (anemómetro de referencia)
```
