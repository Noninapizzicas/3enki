---
tipo: componente
sector: eolica-hogar
tags: [bateria, almacenamiento, lifepo4, plomo]
---
# Baterías y almacenamiento

## Voltaje del sistema

| V nominal | Uso típico | Ventaja |
|---|---|---|
| 12 V | Micro-turbinas <500 W, caravanas, barcos | Compatible con accesorios 12V |
| 24 V | Sistemas 1-3 kW | Buen equilibrio corriente/cable |
| 48 V | Sistemas >3 kW, grid-tie | Menos corriente → cables más finos, menos pérdidas |

Regla: **48V siempre que el inversor lo acepte** — reduce corriente a la mitad vs 24V (misma potencia, mismo cable = mitad de pérdidas por calor).

## LiFePO4 vs Plomo-ácido

| Parámetro | LiFePO4 | Plomo-ácido (AGM/GEL) |
|---|---|---|
| DoD utilizable | 80-90% | 50% (sin dañar) |
| Ciclos de vida | 3000-5000 | 300-800 |
| Coste por ciclo | 0.06-0.10 €/kWh | 0.13-0.20 €/kWh |
| Peso (por kWh) | ~7 kg | ~25 kg |
| Carga rápida | sí (1C) | no (C/5 máx) |
| Temp. operación | -20 a +60 °C | -20 a +50 °C |
| Coste inicial | 3-5× mayor | bajo |
| Auto-descarga | <3%/mes | 3-10%/mes |

**Veredicto**: LiFePO4 es más caro de entrada pero mucho más barato en coste/ciclo y coste/kWh almacenado a lo largo de su vida. Para instalaciones nuevas, LiFePO4.

## Dimensionamiento

```
Capacidad [Ah] = (Consumo diario [Wh] × Días de autonomía) / (V_sistema × DoD)

Ejemplo: consumo 5 kWh/día, 2 días autonomía, 48V, DoD 80% (LiFePO4):
  C = (5000 × 2) / (48 × 0.80) = 260 Ah → banco de 48V/260Ah (12.5 kWh)
```

## Cableado

- Objetivo: **<2% de caída de tensión** en el tramo turbina→controlador.
- A 12V y 30A, un cable de 10 m necesita sección ≥10 mm² (AWG 8).
- A 48V y 30A, el mismo tramo solo necesita ≥4 mm² (AWG 12).
- Cable de soldadura recomendado para tramos batería→controlador por su flexibilidad en frío.

Ver [[Conexión a red e inversores]] para sistemas grid-tie.
