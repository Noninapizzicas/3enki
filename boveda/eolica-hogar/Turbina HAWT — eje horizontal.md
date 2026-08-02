---
tipo: tecnologia
sector: eolica-hogar
tags: [hawt, horizontal, turbina]
---
# Turbina HAWT — eje horizontal

El diseño dominante en eólica a todas las escalas. Rotor a barlovento (upwind) con veleta/timón de cola, o a sotavento (downwind, auto-orientable).

## Características

| Parámetro | Valor típico (hogar) |
|---|---|
| Palas | 3 (óptimo energía/vibración) |
| Diámetro rotor | 1.5–7 m |
| Cp | 0.35–0.45 |
| TSR | 6–8 |
| Cut-in | 2.5–4 m/s |
| Potencia nominal | 400 W – 10 kW |
| RPM nominales | 150–500 |

## Ventajas
- **Mayor eficiencia** que VAWT (Cp hasta 0.45)
- Tecnología madura, muchos fabricantes y guías DIY
- Mejor relación potencia/tamaño
- Se beneficia directamente de la altura de torre

## Desventajas
- Necesita **orientación al viento** (veleta o motor de yaw)
- Sensible a turbulencia — necesita flujo laminar (ubicación expuesta)
- Cargas de fatiga en el buje por giro de orientación (yaw)
- Ruido de punta de pala a alta velocidad

## Variantes a escala hogar

**2 palas**: más baratas, TSR alto (8–12), más ruido y vibración, necesitan hub basculante (teetering hub). Ej: Bergey Excel.

**3 palas**: estándar — equilibrio vibración/coste/eficiencia. Ej: Primus AIR, Bornay, Hugh Piggott.

**Multi-pala (>6)**: TSR bajo (~1), alto par de arranque, ideal para bombeo mecánico, NO para generación eléctrica (RPM insuficientes para el generador).

## Protección contra sobreviento

- **Furling** (virado lateral): cola articulada que gira el rotor fuera del viento a v > rated. Pasivo, fiable, el más común en mini-eólica. El rotor se inclina o gira lateralmente.
- **Freno eléctrico**: cortocircuito de las fases del generador → el rotor frena por par resistente.
- **Freno mecánico**: disco o zapata en el eje. Backup, no protección primaria.
- **Pitch activo**: palas giratorias. Raro en mini-eólica (complejidad/coste).

Ver [[Generador PMG — flujo axial]] para el generador típico de HAWT DIY.
