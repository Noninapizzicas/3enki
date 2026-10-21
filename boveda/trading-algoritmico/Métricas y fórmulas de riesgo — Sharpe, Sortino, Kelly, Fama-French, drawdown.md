---
tipo: general
sector: trading-algoritmico
tags: [formulas, sharpe, sortino, kelly, fama-french, drawdown, alpha, beta]
---
# Métricas y fórmulas de riesgo

> El lenguaje común que permite comparar una estrategia de momentum en acciones con un bot de market making en cripto — sin estas fórmulas, "funciona bien" es una opinión; con ellas, es un número verificable.

---

## Las fórmulas centrales

```
SHARPE RATIO
  fórmula:      SR = (R_p − R_f) / σ_p
  R_p = retorno de la cartera · R_f = tasa libre de riesgo · σ_p = desviación estándar TOTAL
  interpretación: exceso de retorno por unidad de riesgo total (bueno y malo mezclado)
  ejemplo:      retorno anual 15%, libre de riesgo 3%, volatilidad 12% → SR = (0.15-0.03)/0.12 = 1.0
  referencia:   SR < 1 mediocre · 1-2 bueno · >2 excelente (y sospechoso de overfitting si
                es sobre backtest sin validar en real)

SORTINO RATIO
  fórmula:      Sortino = (R_p − R_f) / σ_downside
  σ_downside = desviación estándar SOLO de los retornos negativos (downside deviation)
  interpretación: como Sharpe pero no penaliza la volatilidad "buena" (subidas fuertes)
  cuándo preferirlo: estrategias con distribución de retornos asimétrica (ej. estrategias
                de opciones, momentum con colas gordas positivas)

MAX DRAWDOWN (MDD)
  fórmula:      MDD = (Valor_pico − Valor_valle) / Valor_pico
  interpretación: la mayor caída porcentual desde un máximo histórico de la curva de equity
  ejemplo:      cartera sube a 100.000€, cae a 78.000€ antes de nuevo máximo → MDD = 22%
  uso práctico: define el capital psicológico y de riesgo que necesitas para sobrevivir la
                peor racha histórica del sistema SIN capitular

KELLY CRITERION
  fórmula:      f* = W − (1−W)/R
  W = win rate (decimal) · R = ratio beneficio medio/pérdida media (payoff ratio)
  interpretación: fracción ÓPTIMA del capital a arriesgar por operación para maximizar
                crecimiento geométrico a largo plazo
  ejemplo:      win rate 55%, payoff ratio 1.5 → f* = 0.55 − 0.45/1.5 = 0.25 (25% del capital)
  USO REAL:     Kelly completo es DEMASIADO agresivo en la práctica (asume estimaciones
                perfectas de W y R) — el estándar de la industria es usar ½ Kelly o ¼ Kelly
                para amortiguar el error de estimación

FAMA-FRENCH FACTOR MODELS
  3 factores (1993): Mercado (exceso sobre libre de riesgo) + SMB (small minus big, tamaño)
                + HML (high minus low, value vs growth)
  5 factores (2015): añade RMW (profitability) + CMA (investment/conservadurismo inversor)
  6 factores (2018): añade factor de MOMENTUM (UMD, up minus down)
  fórmula general:   R_i − R_f = α + β_1·MKT + β_2·SMB + β_3·HML + ... + ε
  uso:          descompone el retorno de una estrategia en exposición a factores conocidos
                (beta) vs habilidad genuina no explicada por ellos (ALPHA, el objetivo real
                de todo gestor cuantitativo)
  dato de referencia: el modelo de 6 factores de Fama-French (2018) alcanza un Sharpe ratio
                anualizado de ~1.2 — aproximadamente el TRIPLE del Sharpe del mercado
                estadounidense general, útil como vara de medir realista para tu propio SR

ALPHA Y BETA
  beta (β):     sensibilidad de tu estrategia al movimiento del mercado — β=1 se mueve igual
                que el mercado, β=0 es neutral a mercado (market-neutral)
  alpha (α):    el retorno que tu estrategia genera POR ENCIMA de lo explicado por su beta y
                exposición a factores conocidos — es lo único que justifica pagar por gestión
                activa/desarrollo de un sistema en vez de comprar un índice pasivo

WIN RATE × PAYOFF RATIO
  esperanza:    E = (WinRate × ganancia_media) − (LossRate × pérdida_media)
  regla clave:  un win rate del 40-50% es perfectamente viable SI el ratio beneficio:riesgo
                es ≥2:1 — el win rate solo, sin el payoff ratio, no dice nada sobre si el
                sistema es rentable
```

---

## Tabla de referencia rápida

```
MÉTRICA         RANGO POBRE   RANGO ACEPTABLE   RANGO EXCELENTE   SOSPECHOSO
Sharpe           <0.5          1.0-1.5           >2.0              >3.0 en backtest
Sortino          <0.7          1.5-2.5           >3.0              >4.0 en backtest
Max Drawdown     >40%          15-25%            <10%              <5% con retorno alto
Kelly (f*)       úsalo tal cual = ruina probable  → aplica ¼-½ Kelly SIEMPRE en producción
```

## Errores comunes

```
→ Reportar Sharpe ratio anualizado calculado sobre pocos meses de datos — la varianza de la
  estimación con muestra pequeña hace que el número sea prácticamente ruido estadístico.
→ Usar Kelly completo (f*) tal cual en producción — con estimaciones imperfectas de W y R
  (siempre lo son), Kelly completo lleva a apuestas excesivas y riesgo de ruina real.
→ Comparar Sharpe de estrategias con distinta frecuencia de rebalanceo sin anualizar
  correctamente (Sharpe_anual = Sharpe_periodo × √periodos_por_año).
→ No descomponer el retorno en factores Fama-French antes de afirmar que tienes "alpha" —
  buena parte de lo que parece habilidad es simplemente exposición no reconocida a factores
  conocidos (ej. tu "genial" estrategia long-only en 2024-2025 puede ser solo beta de mercado).
```

---

Estas fórmulas complementan (no duplican) las de [[Fórmulas|el sector Trading general]] — allí están las versiones orientadas a gestión de riesgo manual (position sizing, R-múltiplo); aquí están orientadas a evaluación cuantitativa de sistemas y factor investing.
