---
tipo: tecnica
sector: trading-algoritmico
tags: [machine-learning, reinforcement-learning, deep-learning, agentes, trading]
---
# Machine learning y reinforcement learning aplicado a trading

> El RL en trading no aprende "cuándo comprar" como una regla fija — aprende una política que se adapta al estado del mercado. Eso es su fuerza y su peligro: la misma flexibilidad que le permite generalizar es la que le permite memorizar ruido histórico si no se controla con rigor.

---

## Reinforcement learning (RL)

```
FORMULACIÓN   → el trading se modela como MDP (Markov Decision Process): estado (precio,
                indicadores, posición actual) → acción (comprar/vender/mantener, tamaño) →
                recompensa (P&L ajustado por riesgo) → nuevo estado
ALGORITMOS TÍPICOS → DQN (Deep Q-Network), PPO (Proximal Policy Optimization), A3C, y en 2025
                variantes con xLSTM para capturar dependencias temporales largas
APLICACIONES DONDE MEJOR FUNCIONA (datos 2025)
  → market making        → Sharpe ratio subió de 0.35 (2020) a 0.52 (2025) en estudios
                            comparativos — la aplicación con mayor mejora medida
  → cripto trading        → mejoras rápidas desde 2022, impulsadas por maduración del
                            mercado y mejores algoritmos
  → ESG investing          → área de alto crecimiento, mejoras aceleradas desde 2023
DESAFÍO CENTRAL → el diseño de la recompensa (reward shaping), el modelado de costes de
                transacción y la robustez fuera de muestra importan MÁS que la capacidad
                bruta del modelo — un RL con reward mal diseñado aprende a explotar el
                simulador, no el mercado
```

## Multi-Agent RL (MARL)

```
QUÉ APORTA    → captura dinámicas competitivas y cooperativas entre participantes del
                mercado — ideal para provisión de liquidez, market making y optimización
                de portfolio donde el resultado depende de las acciones de OTROS agentes
TÉCNICAS 2025-2026 → graph attention networks, aprendizaje sensible a sentimiento, diseño
                de recompensa game-theoretic
```

## LLM-augmented agents (la frontera 2024-2026)

```
QUÉ ES        → la evolución más reciente: LLMs como componentes de primera clase dentro
                del agente de trading — no reemplazan al RL, lo complementan
ROLES DEL LLM → generador de factores (propone features nuevas a partir de noticias/texto),
                módulo de memoria (contexto de largo plazo sobre el mercado), backbone de
                política, generador de señales de sentimiento
FRAMEWORKS 2025 → ATLAS (sistema de trading adaptativo con optimización dinámica de prompts
                y coordinación multi-agente), 3S-Trader (framework multi-LLM para scoring,
                estrategia y selección de acciones en optimización de portfolio)
DESAFÍO       → drift de conocimiento del LLM, coste de inferencia en tiempo real, y el
                riesgo de que el LLM "alucine" una relación causal que no existe en los datos
```

## Modelos supervisados clásicos (siguen vivos)

```
GRADIENT BOOSTING (XGBoost, LightGBM) → siguen siendo el caballo de batalla para predicción
                de dirección/volatilidad a corto plazo — más robustos y explicables que deep
                learning con datasets financieros de tamaño moderado
EXTREME LEARNING MACHINES (ELM) → investigación 2025 (arXiv 2505.09551) muestra eficiencia
                computacional alta sin entrenamiento iterativo por gradiente — relevante para
                tareas sensibles al tiempo donde reentrenar constantemente es costoso
```

## Sesgos y riesgo de datos que hay que anticipar SIEMPRE

```
→ Datos financieros son NO estacionarios — un modelo entrenado en régimen de baja
  volatilidad falla en régimen de alta volatilidad sin reentrenamiento/adaptación continua
→ Look-ahead bias en features — normalizar con estadísticas calculadas sobre TODO el
  histórico (incluyendo el futuro) es el error #1 en pipelines de ML financiero
→ Ratio señal/ruido extremadamente bajo comparado con visión/NLP — un modelo que "aprende"
  con precisión alta sobre training data casi seguro está memorizando ruido
```

---

## Novedades 2025-2026

```
→ La frontera 2024-2026 se mueve de RL puro a agentes LLM-aumentados — el LLM actúa como
  generador de factores, módulo de memoria o backbone de política junto al RL clásico
  (fuente: revisión sistemática arXiv 2512.10913, dic. 2025).
→ Estudio de mercado 2025-2026 confirma mejora sostenida de Sharpe en market making vía RL
  (0.35→0.52 entre 2020-2025) y aceleración de resultados en cripto tras 2022.
→ Framework sentiment-aware RL (2026) combina knowledge distillation para drift gradual y
  curriculum learning para shocks bruscos de mercado — abordando el problema de
  no-estacionariedad de forma más estructurada que el reentrenamiento periódico simple.
→ TradeMaster (TradeMaster-NTU en GitHub) se consolida como plataforma de investigación
  abierta de referencia para workflows de trading basados en RL.
```

## Errores comunes

```
→ Entrenar y validar sobre el mismo periodo de mercado (mismo régimen) — la falsa sensación
  de robustez que da un backtest sin separación temporal estricta walk-forward.
→ Recompensa de RL = P&L bruto sin ajustar por riesgo — el agente aprende a tomar posiciones
  de alto riesgo/alta varianza porque maximiza retorno esperado sin penalizar drawdown.
→ Ignorar coste de inferencia en producción de modelos LLM-augmented — un modelo que tarda
  segundos en generar una señal es inútil para estrategias de frecuencia media-alta.
→ Publicar resultados de RL sin walk-forward out-of-sample
  — ver [[Validación y errores comunes — overfitting, look-ahead bias, walk-forward]] para el protocolo correcto.
```
