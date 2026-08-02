---
tipo: componente
sector: eolica-hogar
tags: [perfil, aerodinamica, naca, airfoil]
---
# Perfiles aerodinámicos — NACA y SG

## Perfiles usados en mini-eólica

| Perfil | Origen | Uso | Notas |
|---|---|---|---|
| NACA 4412 | Aeronáutico (NACA) | HAWT pequeñas, DIY | Cara plana inferior (fácil de fabricar en madera/fibra), buena sustentación a bajo Re |
| SG6043 | Giguere/Selig (Illinois) | SWT optimizado | Diseñado específicamente para Small Wind Turbines, alto Cl/Cd a Re 100k-500k |
| S822 | NREL | Raíz de pala | Mejor rendimiento sobre 10 m/s, más grueso (estructural) |
| S823 | NREL | Punta de pala | Más delgado, menor arrastre, combinado con S822 en diseños NREL |
| Clark Y | NACA (histórico) | DIY, educativo | Perfil plano inferior clásico, fácil de fabricar, Cp moderado |

## Número de Reynolds en mini-eólica

```
Re = (ρ × v × c) / μ

A escala hogar (cuerda 5-15 cm, v_punta 20-50 m/s):
  Re ≈ 50.000 – 500.000 (BAJO)
  
Esto importa: los perfiles aeronáuticos clásicos (NACA 23012, etc.)
están optimizados para Re > 1.000.000 y pierden rendimiento a Re bajo.
Los SG60xx y S8xx de NREL están optimizados para Re bajo = mini-eólica.
```

## Herramientas de análisis

- **XFLR5** (GUI, gratis): análisis de perfil y ala 3D, interfaz gráfica, basado en XFoil. Ideal para comparar perfiles a diferentes Re y ángulos de ataque.
- **XFoil** (línea de comandos, MIT): el motor de XFLR5, directo, rápido. Calcula Cl, Cd, Cm vs alfa para un perfil dado a un Re dado.
- **QBlade** (C++, gratis): integra análisis de perfil + BEM + simulación aero-servo completa. Importa perfiles .dat de la base de datos de Selig/UIUC.
- **Base de datos UIUC**: m-selig.ae.illinois.edu/ads/coord_database.html — coordenadas de ~1600 perfiles descargables (.dat).

## Método Hugh Piggott (tallado en madera)

No usa perfil NACA formal — el perfil se aproxima tallando con herramientas manuales (cepillo, formón) siguiendo plantillas de cartón. El resultado es un perfil plano-convexo similar a Clark Y/NACA 4412, con Cp suficiente para turbinas de 1-4 kW. La rugosidad de superficie de la madera afecta a Re bajo pero en la práctica la pérdida es aceptable (<10% vs perfil liso).
