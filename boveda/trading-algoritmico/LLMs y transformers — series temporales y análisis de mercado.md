---
tipo: tecnica
sector: trading-algoritmico
tags: [llm, transformers, series-temporales, foundation-models, nlp]
---
# LLMs y transformers en mercados

> Un transformer no sabe qué es el dinero — sabe encontrar patrones en secuencias. Aplicarlo a precios financieros funciona hasta que el mercado cambia de régimen de forma que ningún patrón del entrenamiento anticipaba, que es exactamente cuando más falta hace que funcione.

---

## Transformers para series temporales de precio

```
POR QUÉ TRANSFORMERS → capturan relaciones no lineales y dependencias de largo alcance mejor
                que ARIMA/modelos lineales clásicos — la atención permite "mirar" puntos
                lejanos de la serie sin la degradación de gradiente de RNN/LSTM clásicas
COMPARATIVA 2025 (estudio con SARIMAX, LSTM, Transformer sobre series financieras)
  → LSTM         → menor RMSE (mejor en error cuadrático medio)
  → Transformer  → mejor MAE (error absoluto medio) y MÁS estable bajo validación progresiva
DESAFÍOS TÉCNICOS ESPECÍFICOS DE FINANZAS
  → no-estacionariedad de los precios (la distribución cambia con el tiempo)
  → horizontes de entrada largos con restricción computacional real
  → necesidad de atención modificada + codificaciones posicionales específicas de la tarea
  → inclusión de señales externas (indicadores macro, tipos de interés) como contexto
```

## Foundation models de series temporales (2025-2026, la novedad más relevante)

```
TIMESFM (Google)     → transformer decoder-only pre-entrenado para forecasting general de
                        series temporales, aplicable (con matices) a series financieras
CHRONOS / CHRONOS-BOLT (Amazon) → tokeniza secuencias numéricas como si fueran lenguaje,
                        forecasting probabilístico (no solo punto estimado, sino distribución)
MOIRAI                → transformer universal entrenado sobre más de 27.000 millones de
                        observaciones — el más grande en escala de entrenamiento
ESTADO REAL           → prometedores en investigación, pero su aplicación directa a mercados
                        financieros reales sigue bajo escrutinio: el ruido y la
                        no-estacionariedad específicos de precios no son iguales a los de
                        series de demanda/clima/tráfico sobre las que se entrenaron
```

## LLMs como analistas (texto → señal)

```
GENERACIÓN DE INDICADORES ESTRUCTURADOS → marcos recientes convierten series numéricas +
                información textual (noticias, informes) en indicadores estructurados,
                mostrando mejora material de precisión frente a ARIMA/Prophet/Temporal
                Fusion Transformer en benchmarks específicos
CASOS DE USO REALES
  → resumen y scoring de sentimiento de noticias/informes de resultados en tiempo real
  → generación de factores nuevos a partir de texto no estructurado (10-K, transcripciones
    de earnings calls, redes sociales)
  → asistentes de investigación (no ejecutan trades, aceleran el análisis del quant humano)
LLM-AUGMENTED TRADING AGENTS → ver [[Machine learning y reinforcement learning aplicado a trading]]
                para ATLAS, 3S-Trader y la frontera de agentes multi-LLM 2025-2026
```

## Aplicación práctica — arbitraje estadístico con LLMs (2024-2025)

```
PAPER DE REFERENCIA → "Large Language Models for Time Series: an Application for Single
                Stocks and Statistical Arbitrage" (arXiv 2412.09394) — usa LLMs para generar
                pronósticos aplicados a estrategias de arbitraje estadístico sobre acciones
                individuales, un puente directo entre esta nota y
                [[Estrategias cuantitativas — mean reversion, momentum, arbitraje estadístico, market making]]
```

---

## Novedades 2025-2026

```
→ Time-Series Foundation Models en finanzas es ya un área de investigación activa con
  publicaciones dedicadas a corpus de pre-entrenamiento, arquitecturas y benchmarks
  financieros específicos con evaluación consciente del riesgo (paper ACM 2025).
→ LLM-driven forecasting de indicadores de redes financieras — investigación 2026 explora
  el uso de LLMs no solo para texto sino como motor de forecasting de indicadores de red
  (interconexión entre activos/instituciones).
→ El salto de "LLM lee noticias" a "LLM genera indicadores estructurados directamente
  consumibles por modelos downstream" es el cambio de paradigma más citado en 2025.
```

## Errores comunes

```
→ Usar un foundation model pre-entrenado en datos genéricos (no financieros) sin fine-tuning
  ni validación específica — el rendimiento en benchmarks generales no se traduce
  automáticamente a series de precios financieros.
→ Confiar en sentiment scoring de LLM como señal única sin combinar con precio/volumen —
  el sentimiento de mercado es un factor MÁS, no un oráculo por sí solo.
→ Ignorar el coste y latencia de inferencia de LLM en pipelines de baja frecuencia — válido
  para señales diarias/semanales, poco realista para frecuencias intradía altas.
→ No validar look-ahead — usar noticias con timestamp posterior al momento de decisión
  simulado es un error de data leakage extremadamente común en investigación con NLP.
```
