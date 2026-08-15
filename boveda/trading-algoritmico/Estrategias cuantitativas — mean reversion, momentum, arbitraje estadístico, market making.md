---
tipo: tecnica
sector: trading-algoritmico
tags: [estrategias, mean-reversion, momentum, arbitraje-estadistico, market-making, pairs-trading]
---
# Estrategias cuantitativas

> Cuatro familias, una sola pregunta detrás de todas: ¿el precio se aleja de algo a lo que tiende a volver, o se aleja de algo que va a seguir empujando? Mean reversion apuesta lo primero, momentum lo segundo — y saber cuál domina en cada horizonte temporal es el 80% del trabajo.

---

## Mean reversion (reversión a la media)

```
PRINCIPIO     → los precios tienden a volver a su media histórica tras desviarse — se
                identifica la desviación estadística y se apuesta a la convergencia
HORIZONTE     → captura reversiones de CORTO plazo (minutos a días)
SEÑALES TÍPICAS → Bandas de Bollinger (precio fuera de 2 desviaciones estándar), RSI extremo
                (<30 o >70), z-score de la serie sobre su media móvil
TEST ESTADÍSTICO → ADF (Augmented Dickey-Fuller) para confirmar estacionariedad de la serie
                antes de apostar por reversión — sin estacionariedad, no hay "media" a la
                que volver
DIFICULTAD    → ★★★☆☆ — fácil de programar, difícil de hacer robusto (falsos positivos en
                tendencias fuertes que "rompen" la reversión esperada)
RIESGO CLAVE  → "catching a falling knife" — comprar la caída asumiendo reversión cuando en
                realidad es el inicio de una tendencia bajista sostenida
```

## Momentum

```
PRINCIPIO     → activos con desempeño reciente fuerte tienden a continuar esa tendencia
HORIZONTE     → funciona mejor en horizontes MÁS LARGOS que mean reversion (semanas a meses)
SEÑALES TÍPICAS → medias móviles (cruce 50/200), ROC (rate of change), fuerza relativa entre
                activos de un universo (cross-sectional momentum)
COMPLEMENTARIEDAD → carteras quant serias combinan momentum + mean reversion: mean reversion
                captura reversiones de corto plazo, momentum captura tendencias de medio
                plazo — ambas señales pueden coexistir en distintos timeframes del mismo activo
DIFICULTAD    → ★★☆☆☆ para la versión simple (cruce de medias), ★★★★☆ para cross-sectional
                momentum con ranking de universo amplio
RIESGO CLAVE  → momentum crashes — reversiones violentas y rápidas tras rallies extendidos
                (ej. tras subidas parabólicas en cripto o short squeezes)
```

## Arbitraje estadístico (pairs trading)

```
PRINCIPIO     → se modela la relación histórica (spread, ratio) entre dos o más activos
                cointegrados; cuando el spread se desvía de la norma estadística, se apuesta
                a la convergencia (long el infravalorado, short el sobrevalorado)
REQUISITO MATEMÁTICO → cointegración (test de Engle-Granger o Johansen), NO simple correlación
                — dos series pueden correlacionar sin ser cointegradas, y eso rompe la
                estrategia en el momento menos oportuno
EJEMPLO CLÁSICO → pares de acciones del mismo sector (ej. Coca-Cola/Pepsi), o entre ETF y su
                cesta de componentes
DIFICULTAD    → ★★★★☆ — requiere estadística sólida (series temporales, cointegración) y
                gestión de dos patas simultáneas con costes de transacción duplicados
RIESGO CLAVE  → ruptura estructural de la relación (ej. adquisición, cambio regulatorio, cambio
                de modelo de negocio de una de las dos compañías) — el spread deja de revertir
```

## Market making

```
PRINCIPIO     → se colocan órdenes límite simultáneas de compra y venta alrededor del precio
                medio, capturando el spread bid-ask como beneficio — es esencialmente una
                estrategia de mean reversion de MUY corto plazo aplicada al propio spread
QUIÉN LO HACE → institucional (HFT) y retail vía Hummingbot
                (ver [[Bots cripto open source — freqtrade, Hummingbot, Jesse]])
RIESGO CLAVE  → inventory risk — si el precio se mueve fuerte en una dirección antes de que
                las órdenes se ejecuten balanceadas, el market maker queda con inventario
                desequilibrado y expuesto direccionalmente (deja de ser "neutral")
DIFICULTAD    → ★★★★★ — exige gestión de riesgo de inventario en tiempo real, latencia baja
                para no quedar "adverse selected" por flujo informado
```

---

## Tabla resumen

```
                    HORIZONTE       DIFICULTAD   REQUISITO ESTADÍSTICO CLAVE
Mean reversion      minutos-días    ★★★☆☆        estacionariedad (test ADF)
Momentum            semanas-meses   ★★☆☆☆-★★★★☆  persistencia de tendencia
Arbitraje estad.    días-semanas    ★★★★☆        cointegración (Engle-Granger/Johansen)
Market making       segundos        ★★★★★        gestión de inventory risk en tiempo real
```

## Errores comunes

```
→ Aplicar mean reversion a una serie NO estacionaria — sin test ADF previo, "la media a la
  que revierte" puede no existir realmente y la estrategia pierde sistemáticamente.
→ Confundir correlación con cointegración en pairs trading — dos activos correlacionados
  pueden divergir permanentemente; solo la cointegración garantiza reversión del spread.
→ Ignorar el régimen de mercado — una estrategia momentum entrenada en tendencia alcista
  sostenida (2023-2024) puede fallar catastróficamente en mercado lateral o bajista.
→ Subestimar costes de transacción en pairs trading — dos patas significan doble comisión y
  doble slippage, lo que puede convertir un edge teórico positivo en pérdida neta real.
```

---

## Novedades 2025-2026

```
→ Crecimiento de estrategias que combinan señales clásicas (momentum, mean reversion) con
  factores generados por LLMs como input adicional
  — ver [[Machine learning y reinforcement learning aplicado a trading]]
  y [[LLMs y transformers — series temporales y análisis de mercado]] para el estado del arte 2025-2026.
→ Investigación reciente (arXiv q-fin 2025) profundiza en risk-averse RL aplicado a mercados
  de futuros de materias primas (gas natural) con reward distribucional — un puente entre
  estrategias cuantitativas clásicas y RL moderno.
```
