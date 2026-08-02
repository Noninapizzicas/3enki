---
tipo: componente
sector: eolica-hogar
tags: [torre, montaje, estructura, instalacion]
---
# Torres y montaje

## Regla de oro de altura

**El buje debe estar ≥10 m por encima de cualquier obstáculo en 150 m de radio.** Cada metro extra de torre vale más que un perfil de pala mejor — v³ domina todo (ver [[Ecuación de potencia y Betz]]).

## Cizalladura vertical

```
v(h2) = v(h1) × (h2/h1)^α

α por terreno:
  mar abierto / llanura sin obstáculos: 0.10–0.14
  campo con setos / suburbano bajo:     0.20–0.25
  suburbano / árboles dispersos:        0.25–0.30
  urbano / bosque denso:                0.30–0.40
```

Ejemplo: v a 10m = 4 m/s, α = 0.25 → v a 18m = 4 × (18/10)^0.25 = **4.6 m/s** → potencia +50%.

## Tipos de torre

### Atirantada (guyed)
- La más barata y fácil de construir
- Tubo central (acero galvanizado Ø 50-100 mm) con 3-4 juegos de vientos (cables de acero) anclados al suelo
- Radio de vientos = 0.5–0.75× altura de torre
- Necesita espacio en planta (torre de 12m → vientos a 6-9m del pie)
- **Tilt-up**: base articulada para izar/arriar con cabrestante → mantenimiento sin escalar

### Monopolo (autoportante)
- Sin vientos, huella mínima
- Más cara (tubo cónico grueso o celosía)
- Disponible hasta ~18 m en versión comercial
- Versiones hidráulicas permiten izar/bajar de forma segura

### Celosía (lattice)
- Mayor resistencia al viento por peso
- Más compleja de fabricar, estéticamente más intrusiva
- Usada en instalaciones grandes (>5 kW)

### Montaje en tejado
- Altura limitada (1-3 m sobre el tejado)
- **Vibración**: transmite vibraciones a la estructura del edificio (ruido, fatiga)
- Necesita aislamiento antivibratorio (silentblocks, base amortiguada)
- Turbulencia intensa sobre tejados → rendimiento pobre
- Solo viable para micro-turbinas (<500 W) o VAWT

## Cimentación

- Anclajes de vientos: dados de hormigón enterrados (mínimo 0.5 × 0.5 × 0.5 m por ancla) o anclas helicoidales (sin excavación, atornilladas)
- Base de torre: zapata de hormigón dimensionada para el momento de vuelco (peso × altura × velocidad de viento máxima de diseño)
- **Nunca** subestimar la cimentación — el fallo más peligroso de una instalación eólica es el vuelco de torre

## Protección contra rayos

- Pararrayos en punta de pala + conductor de bajada por el interior de la torre → pica de tierra
- Resistencia total punta→tierra < 1 Ω (medir con telurómetro)
- Obligatorio en torres >6 m o zonas con actividad de rayos
