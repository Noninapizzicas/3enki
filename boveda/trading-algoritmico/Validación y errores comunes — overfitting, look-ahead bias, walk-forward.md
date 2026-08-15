---
tipo: tecnica
sector: trading-algoritmico
tags: [validacion, overfitting, look-ahead-bias, walk-forward, backtesting]
---
# Validación y errores comunes

> El dato que más debería asustar a cualquiera que empieza en esto: aproximadamente el 82% de las estrategias que muestran rentabilidad extraordinaria en simulación histórica fracasan al desplegarse en mercado real. Esta nota es la diferencia entre estar en ese 82% o en el 18% restante.

---

## Las 7 categorías de error (mapa completo)

```
1. OVERFITTING (curve-fitting)     → ajustar parámetros hasta que la curva de equity
                                     histórica se ve bonita — el error #1, con diferencia
2. LOOK-AHEAD BIAS                 → usar información que no estaba disponible en el
                                     momento simulado de la decisión
3. IGNORAR COSTES DE TRANSACCIÓN   → comisiones, spread y slippage omitidos o mal modelados
4. GESTIÓN DE RIESGO DÉBIL          → sin stop loss sistemático, sin límite de exposición
5. FALLOS DE CALIDAD DE DATOS       → splits mal ajustados, huecos, timestamps incorrectos
6. FORWARD-TESTING INADECUADO       → saltar directo de backtest a capital real sin paper
7. FALLOS OPERACIONALES             → desconexiones, bugs de ejecución, race conditions
```

---

## Overfitting — el enemigo principal

```
SÍNTOMA       → backtest con Sharpe >3, drawdown <5%, win rate >70% — números que ningún
                fondo cuantitativo institucional real sostiene de forma consistente
CAUSA         → optimizar demasiados parámetros libres sobre una única ventana histórica
                fija hasta que el sistema memoriza ruido específico de ese periodo concreto
                en vez de capturar una ineficiencia real y persistente
SOLUCIÓN      → menos parámetros libres (reglas simples generalizan mejor), walk-forward
                obligatorio, validar la MISMA estrategia sobre activos/mercados distintos a
                los usados para diseñarla (robustez cruzada)
```

## Look-ahead bias

```
FORMAS MÁS COMUNES
  → normalizar/escalar features con estadísticas (media, std) calculadas sobre TODO el
    dataset (incluyendo el "futuro" respecto al punto simulado)
  → usar precio de cierre del día para decidir una entrada que en la práctica se ejecutaría
    con datos posteriores al cierre (ej. noticias publicadas después de cierre de sesión)
  → indicadores que "repintan" (repainting) en plataformas como TradingView — recalculan
    valores pasados con información que no existía en tiempo real
SOLUCIÓN      → point-in-time data (solo información disponible EN el momento t), separar
                estrictamente fit/transform en pipelines de features, verificar en gráfico
                en tiempo real que el indicador no cambia valores ya "cerrados"
```

## Walk-forward validation — el protocolo correcto

```
QUÉ ES        → en vez de un único split train/test, se desliza una ventana por el
                histórico: se optimiza sobre un tramo (in-sample), se valida sobre el
                siguiente tramo NO visto (out-of-sample), y se repite avanzando la ventana
ESQUEMA
  [--- IN-SAMPLE 1 ---][OUT 1]
        [--- IN-SAMPLE 2 ---][OUT 2]
              [--- IN-SAMPLE 3 ---][OUT 3]
  → el resultado agregado de todos los tramos OUT es la métrica real de la estrategia,
    NUNCA el resultado sobre el tramo IN-SAMPLE optimizado
POR QUÉ FUNCIONA → obliga a que la estrategia demuestre robustez repetida en condiciones
                nunca vistas durante la optimización, en vez de un único golpe de suerte
                estadístico sobre un periodo fijo
```

## Checklist de validación antes de arriesgar capital real

```
□ ¿La estrategia usa SOLO información disponible en el momento t de cada decisión?
□ ¿Se ha validado con walk-forward, no solo train/test simple?
□ ¿Se han incluido comisiones, spread Y slippage realistas (no cero, no optimistas)?
□ ¿El número de parámetros libres es razonable (idealmente <5) respecto al tamaño del dataset?
□ ¿Se ha probado en al menos un régimen de mercado distinto (bull, bear, lateral)?
□ ¿Se ha corrido en paper trading / dry-run semanas antes de capital real?
□ ¿Existe un kill-switch y monitorización de caída del proceso?
□ ¿El Sharpe/drawdown del backtest es razonable (no sospechosamente perfecto)?
```

---

## Errores comunes (los más citados en la industria)

```
→ Backtestear sobre un único activo/periodo y generalizar la conclusión — un sistema que
  funciona en AAPL 2020-2023 puede no funcionar en absoluto en un activo distinto o periodo
  distinto; robustez cruzada es obligatoria antes de confiar en el resultado.
→ Reoptimizar el sistema cada vez que falla en real ("curve-fitting en producción") — cada
  reoptimización sobre datos recientes que fallaron es, de nuevo, overfitting disfrazado de
  mejora continua.
→ No separar el capital de testing del capital de producción — mezclar operaciones de
  prueba con operaciones reales hace imposible auditar el rendimiento real del sistema.
→ Confiar en un solo backtest sin Monte Carlo / bootstrap de la secuencia de trades — la
  MISMA secuencia de trades en distinto orden puede dar drawdowns muy distintos; simular
  reordenamientos da una vista más realista del rango de resultados posibles.
```

---

## Novedades 2025-2026

```
→ Investigación reciente (2025) explora backtesting con GANs (redes generativas
  adversariales) para generar escenarios de mercado sintéticos adicionales y evitar
  overfitting sobre la única realización histórica disponible — un enfoque emergente más
  allá del walk-forward clásico.
→ PLUTUS (arXiv 2505.14050, mayo 2025) es un framework open source que aborda directamente
  las barreras de reproducibilidad y validación rigurosa en algorithmic trading — parte de
  una tendencia 2025 hacia estandarizar protocolos de validación en la comunidad open source.
```
