---
tipo: tecnologia
sector: eolica-hogar
tags: [vawt, vertical, turbina, savonius, darrieus]
---
# Turbina VAWT — eje vertical

Rotor gira alrededor de un eje vertical — omnidireccional, sin yaw, generador en la base.

## Subtipos

### Savonius (arrastre)
- **Cp**: 0.10–0.18, TSR 0.8–1.2
- **Autoarranca**: sí (par alto a baja velocidad)
- Robusto, tolera turbulencia, bajo ruido
- Ideal para: entornos urbanos turbulentos, bombeo, aplicaciones de baja potencia
- Construcción simple (dos semicilindros desfasados)

### Darrieus (sustentación)
- **Cp**: 0.25–0.42 (hasta 0.484 a TSR ~2.5 en estudios recientes)
- **NO autoarranca** — necesita motor de arranque o empuje externo
- Curva de potencia estrecha — sensible a TSR
- Variantes: troposkien (catenaria), H-rotor/Giromill (palas rectas verticales)

### Híbrido Savonius + Darrieus
- Combina autoarranque del Savonius con eficiencia del Darrieus
- Configuración dual-shaft: Savonius interior arranca el sistema, Darrieus exterior toma el relevo a TSR alto — evita que la vorticidad del Savonius penalice al Darrieus
- **Mejora +64%** sobre Darrieus solo a TSR 1.4; Cp 0.414 a TSR 2.5 con arranque garantizado
- Arranca desde 4.4 m/s

## VAWT vs HAWT a escala hogar

| Criterio | VAWT | HAWT |
|---|---|---|
| Eficiencia pico | 0.25–0.42 | 0.35–0.45 |
| Turbulencia | tolera bien | sensible |
| Orientación | omnidireccional | necesita yaw |
| Ruido | menor | mayor (punta de pala) |
| Mantenimiento | generador en base (accesible) | en altura (difícil) |
| Producción anual | menor (menor Cp) | mayor |
| Mejor para | urbano, tejado, estética | rural, torre alta, viento limpio |

## Productos VAWT comerciales

Menos oferta comercial que HAWT. Marcas: Aeolos, Helix Wind (cerrada), Hi-Q (H-rotor). Muchos proyectos chinos de calidad variable. La mayoría de instalaciones domésticas exitosas a escala mundial son HAWT.

⚠️ **A verificar**: muchos fabricantes VAWT publican Cp y AEP optimistas que no se replican en mediciones independientes. Preferir datos de estudios académicos sobre datos de marketing.

Ver [[Selector de turbina]] para la regla de decisión.
