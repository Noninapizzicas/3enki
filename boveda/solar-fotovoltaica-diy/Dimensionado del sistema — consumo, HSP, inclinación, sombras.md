---
tipo: tecnica
sector: solar-fotovoltaica-diy
tags: [dimensionado, HSP, inclinacion, sombras, consumo, calculo]
---
# Dimensionado del sistema — consumo, HSP, inclinación, sombras

> Sobredimensionar cuesta dinero de más; subdimensionar cuesta expectativas rotas — el dimensionado correcto es el único paso del proyecto que no admite atajos ni "ya se verá".

---

## Paso 1 — el consumo, no la producción, es el punto de partida

```
ERROR DE PARTIDA HABITUAL: dimensionar por "cuánto tejado tengo" en vez de
  "cuánto consumo realmente" — sobredimensiona el gasto sin mejorar el ahorro real

CÓMO CALCULAR EL CONSUMO REAL:
  1. Revisar facturas de los últimos 12 meses (kWh/mes, no solo el importe en €)
  2. Identificar el patrón horario si el contador es telegestionado (curva de
  carga disponible en la app de la distribuidora o comercializadora)
  3. Distinguir consumo DIURNO (el que puede cubrir el sistema sin batería) de
  consumo NOCTURNO (solo cubierto con batería o compensación de excedentes)

REGLA PRÁCTICA SIN BATERÍA: dimensionar para cubrir el consumo diurno medio,
  NO el consumo total — el exceso de producción respecto al consumo diurno se
  vierte a red y solo se recupera vía compensación simplificada, con menor
  rentabilidad que el autoconsumo directo
```

---

## Paso 2 — horas sol pico (HSP) por provincia

```
QUÉ ES: la irradiación diaria real convertida a un número de "horas equivalentes"
  a 1.000 W/m² — permite el cálculo simple: producción (kWh/día) ≈ potencia
  instalada (kWp) × HSP × rendimiento del sistema (0,75-0,85 típico)

DATOS DE REFERENCIA:
  Sur (Andalucía, Murcia): HSP media anual >5h/día — la mejor zona de España
  Centro/Levante: HSP media 4-4,5h/día
  Norte (cornisa cantábrica): HSP media más baja, aunque Huelva (>3.500h de sol
  al año) contrasta con Bilbao (1.694h de sol al año) como extremos del país

USO CORRECTO DEL DATO: para dimensionado conectado a red, usar la media anual;
  para dimensionado OFF-GRID, usar el HSP del MES MÁS DESFAVORABLE (diciembre-enero),
  nunca la media anual — ver detalle en [[Instalación aislada — off-grid, dimensionado, reguladores]]
```

---

## Paso 3 — inclinación y orientación óptimas

```
INCLINACIÓN FIJA RECOMENDADA:
  Península: 30-40° respecto a la horizontal
  Canarias: 25-30° (menor latitud, sol más alto todo el año)

ORIENTACIÓN:
  Sur puro: el óptimo teórico de producción anual total
  Sureste/Suroeste: pérdida marginal (<5%) frente a sur puro, a menudo la
  única opción real según la geometría de la cubierta
  Este-Oeste (dos vertientes): menor pico de producción pero curva más plana
  a lo largo del día — interesante si el consumo se reparte mañana/tarde

IMPACTO DE UNA MALA ORIENTACIÓN: paneles claramente mal orientados pueden
  captar entre un 25% y un 30% menos de energía que una instalación bien orientada
  — este es el margen de error que separa un proyecto rentable de uno mediocre
```

---

## Paso 4 — análisis de sombras

```
POR QUÉ IMPORTA MÁS DE LO QUE PARECE:
  Una sombra parcial puede reducir a CERO la producción de un panel completo si
  corta una fila entera de células — el efecto no es proporcional al área sombreada

FUENTES HABITUALES DE SOMBRA: chimeneas, antenas, árboles cercanos (variable
  estacional), edificios vecinos, otra fila de paneles mal espaciada

MITIGACIÓN SEGÚN EL CASO:
  Sombra puntual conocida y fija: usar microinversor u optimizador en esa zona
  concreta del tejado (ver [[Inversores — string, microinversores, híbridos]])
  Sombra estacional (árbol caducifolio): valorar poda o aceptar la pérdida
  temporal si es menor y limitada a pocos meses
  Sombra entre filas propias: respetar distancia mínima entre filas según
  el ángulo solar más bajo del invierno para tu latitud (evita autosombreado)

HERRAMIENTAS DE ANÁLISIS: la mayoría de instaladores usan software con
  proyección solar 3D del emplazamiento (curva solar anual) antes de presupuestar
  — pedir siempre este análisis en el presupuesto, no confiar en una estimación visual
```

---

## Fórmula resumen de dimensionado (conectado a red, sin batería)

```
Potencia a instalar (kWp) ≈ consumo diurno medio diario (kWh) / HSP media de
  la zona / rendimiento del sistema (0,8 aprox.)

Ejemplo: vivienda con consumo diurno medio de 8 kWh/día en zona con HSP 4,5h:
  8 / 4,5 / 0,8 ≈ 2,2 kWp — instalación de 5-6 paneles de 400-450W

Este cálculo es un PUNTO DE PARTIDA — el dimensionado definitivo debe ajustarse
con la curva de consumo horaria real, el análisis de sombras del emplazamiento
concreto, y el presupuesto disponible.
```

---

## Errores comunes en dimensionado

```
★★★★★ Dimensionar por superficie de tejado disponible en vez de por consumo real
  — sobreinversión sin mejora proporcional de ahorro
★★★★☆ Usar la HSP media anual para un proyecto off-grid — el sistema falla en
  el mes peor si no se dimensiona por el peor caso
★★★★☆ No pedir el estudio de sombras 3D al presupuestar — aceptar una estimación
  visual del instalador sin verificación técnica
★★★☆☆ Ignorar el consumo nocturno al decidir si añadir batería — comparar el
  coste de la batería contra el ahorro real de cubrir ese consumo nocturno,
  no contra el ahorro total del sistema
```

---

## Novedades 2025-2026

```
→ Las apps de las distribuidoras (curva de consumo horaria vía contador
  telegestionado) son cada vez más accesibles al usuario final, facilitando un
  dimensionado basado en datos reales en lugar de estimaciones de factura media
→ El software de análisis de sombras 3D se democratiza — cada vez más
  instaladores lo incluyen de serie en el presupuesto sin coste adicional
```
