---
tipo: referencia
sector: metalurgia-diy
tags: [nesting, optimizacion, chapa, plasma, laser, corte]
---
# Nesting para metal

Aplicación de nesting (encaje de piezas) específica para corte de chapa metálica con plasma o láser.

## Diferencias vs nesting en madera

| Aspecto | Madera | Metal |
|---|---|---|
| **Kerf** | 3–6 mm (fresa) | 0.5–2 mm (láser) / 2–4 mm (plasma) |
| **Common line** | Poco útil (la fresa arranca material) | Muy útil (el láser/plasma corta sin ancho real) |
| **Deformación** | Mínima | Calor → deformación. Secuencia de corte importa |
| **Material** | Tableros rectangulares estándar | Chapas rectangulares o restos irregulares |
| **Coste material** | Bajo ($10–30/m²) | Alto ($50–200/m² en inox) |

## Herramientas

### Deepnest (1.1k stars)

La herramienta open-source más potente para metal por su **fusión de líneas comunes**: si dos piezas comparten un borde, el programa fusiona ese borde en un solo corte. Esto ahorra:

- Tiempo de corte (menos recorrido de antorcha)
- Material (menos kerf desperdiciado)
- Gas (menos encendidos de arco)

### SVGnest (2.4k stars)

Más simple, en navegador. Sin common-line pero más accesible.

### Alternativas comerciales

- **ProNest** (Hypertherm) — el estándar industrial
- **SigmaNEST** — nesting avanzado multi-máquina
- **NestFab** — integrado en Fusion 360

## Secuencia de corte

En metal, el orden de corte importa para minimizar deformación térmica:

1. **Agujeros interiores primero** — si se cortan después del perímetro, la pieza suelta se mueve
2. **De dentro a fuera** — empezar por los detalles pequeños
3. **Alternar zonas** — no cortar piezas adyacentes consecutivamente (da tiempo a enfriarse)
4. **Lead-in/lead-out** — la antorcha entra y sale por un punto fuera de la pieza (no marca el borde final)

## Parámetros de nesting para plasma

| Parámetro | Valor típico |
|---|---|
| Separación entre piezas | 5–10 mm (plasma) / 2–5 mm (láser) |
| Distancia al borde de chapa | 10–15 mm |
| Rotaciones | 4 u 8 (más = mejor aprovechamiento) |
| Common-line gap | 0 mm (corte compartido) |

→ Máquinas de corte: [[Plasma CNC — máquinas open-source]]
→ Nesting general: ver sector [[carpinteria-cnc/Nesting — SVGnest y Deepnest]]
