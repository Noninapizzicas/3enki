---
tipo: moc
sector: trading-algoritmico
tags: [moc, trading-algoritmico, quant, python, rust, backtesting, machine-learning, reinforcement-learning, mql5, criptomonedas]
---
# Trading Algorítmico

> Conocimiento **educativo y técnico** (motores, código, matemáticas, infraestructura), no asesoramiento financiero. Automatizar una estrategia mala solo la hace perder dinero más rápido — antes de codificar, lee [[00 - Trading (MOC)|el sector Trading]] para los fundamentos de mercado, riesgo y psicología que todo algoritmo hereda de su diseñador.

---

## La escalera — de mirar un backtest a correr en producción

```
NIVEL 0 — Curioso (0€, cero infraestructura)
  Pine Script en TradingView Strategy Tester sobre gráficos gratuitos
  Paper trading en Alpaca o Interactive Brokers (cuenta demo, dinero ficticio)
  Objetivo: entender que un backtest bonito no es un sistema — es una hipótesis

NIVEL 1 — Bot retail (5-15 €/mes)
  Un EA en MQL5 corriendo en MetaTrader 5 sobre VPS barato, o freqtrade en modo dry-run
  Datos gratuitos (Yahoo Finance, ccxt, broker feed) · sin capital real todavía
  Objetivo: primer sistema 24/7 sin supervisión manual — y ver por qué falla en real

NIVEL 2 — Cuant amateur (Python, ~20-50 €/mes)
  Estrategias propias en Python: pandas + backtrader o vectorbt · broker paper API (Alpaca/IBKR)
  Walk-forward básico, primeras métricas serias (Sharpe, drawdown, profit factor)
  Objetivo: dejar de creer en el backtest — validar out-of-sample antes de arriesgar

NIVEL 3 — Cuant serio (100-500 €/mes)
  NautilusTrader o QuantConnect LEAN en producción · datos tick-level (Polygon/Massive, Databento)
  Primeros modelos ML/RL, factor models (Fama-French), gestión de portfolio multi-estrategia
  Objetivo: sistema que sobrevive el salto de backtest a live sin perder el edge

NIVEL 4 — Institucional / HFT (1000+ €/mes, infraestructura dedicada)
  Rust para el hot path, colocation cerca del matching engine, cumplimiento RTS 6/MiFID II
  Multi-estrategia con capital allocation dinámico, monitorización 24/7, kill-switches regulatorios
  Objetivo: latencia como ventaja competitiva, no como detalle técnico
```

---

## Mapa del sector (15 notas)

| nota | qué cubre |
|---|---|
| [[Motores de backtesting y ejecución — NautilusTrader, Backtrader, Zipline, LEAN\|Motores de backtesting]] | Los 4 grandes motores Python: arquitectura, rendimiento, cuándo usar cada uno |
| [[Robots de trading retail — MetaTrader 5 EAs y Pine Script\|Robots retail — MT5 y Pine Script]] | EAs en MQL5, estrategias Pine Script en TradingView, instalación y limitaciones |
| [[Bots cripto open source — freqtrade, Hummingbot, Jesse\|Bots cripto open source]] | Los 3 bots cripto de referencia: señales, market making, backtesting sin look-ahead |
| [[Estrategias cuantitativas — mean reversion, momentum, arbitraje estadístico, market making\|Estrategias cuantitativas]] | Las 4 familias de estrategias quant, su lógica matemática y cuándo funcionan |
| [[Machine learning y reinforcement learning aplicado a trading\|ML y RL en trading]] | RL para ejecución y market making, modelos supervisados, agentes multi-LLM |
| [[LLMs y transformers — series temporales y análisis de mercado\|LLMs y transformers en mercados]] | Foundation models de series temporales, LLMs como analistas, sesgos y límites |
| [[Métricas y fórmulas de riesgo — Sharpe, Sortino, Kelly, Fama-French, drawdown\|Métricas y fórmulas]] | El lenguaje matemático común: todas las fórmulas con ejemplo numérico |
| [[Stack tecnológico — Python científico y Rust para baja latencia\|Stack tecnológico]] | pandas/numpy/scipy, TA-Lib, y por qué Rust entra en el hot path |
| [[Brokers y APIs de ejecución — Interactive Brokers, Alpaca, Binance\|Brokers y APIs]] | Los 3 brokers/exchanges de referencia para algo trading, comisiones y límites de API |
| [[Datos de mercado y datos alternativos — Polygon, Databento, sentiment, on-chain\|Datos de mercado]] | Proveedores tick-level, datos gratuitos vs pago, sentiment y on-chain |
| [[Infraestructura — VPS, colocation y latencia\|Infraestructura y latencia]] | Dónde correr el bot, de un VPS de 4€ a colocation institucional |
| [[Validación y errores comunes — overfitting, look-ahead bias, walk-forward\|Validación y errores comunes]] | El 82% de estrategias que fallan en live — por qué, y cómo no ser parte de esa cifra |
| [[Normativa — MiFID II, RTS 6 y CNMV\|Normativa]] | RTS 6, pre-trade controls, cuándo aplica y qué exige la CNMV en España |
| [[Proyectos guiados — de la idea al bot en producción\|Proyectos guiados]] | 4 proyectos completos paso a paso, de RSI+EMA a pairs trading |
| [[Fuentes, libros y comunidades — arXiv, GitHub, Discord, Reddit\|Fuentes y comunidades]] | Libros de referencia, papers, repos activos, dónde seguir el sector cada semana |

---

## Últimas noticias y avances del sector

> Investigación de agosto 2026 — el sector se mueve rápido, esto es una foto, no un dogma.

```
NOVEDAD 1 (mayo 2026): NautilusTrader añadió soporte de futuros continuos para barras agregadas
  y un método purge_instrument para limpiar caché en runtime — consolidándose como el motor
  Rust+Python de referencia para el salto backtest→live sin reescribir código.

NOVEDAD 2 (2025-2026): la frontera en ML pasó de RL puro a agentes LLM-aumentados — modelos de
  lenguaje como generadores de factores, módulos de memoria o backbone de política junto a RL
  clásico. Frameworks como ATLAS (multi-agente con optimización dinámica de prompts) y 3S-Trader
  (scoring y selección de estrategia multi-LLM) marcan esta transición 2024→2026.

NOVEDAD 3 (octubre 2025): Polygon.io se rebautizó como "Massive" con una reestructuración completa
  de precios — sigue siendo la opción generalista para equities/crypto, mientras Databento se
  consolida como el estándar institucional para datos tick-level de futuros (CME, CBOT, NYMEX) con
  facturación por consumo real.

NOVEDAD 4 (febrero 2026): ESMA publicó un nuevo Supervisory Briefing sobre algorithmic trading bajo
  MiFID II — reconoce por primera vez la integración de IA en los sistemas algorítmicos y recomienda
  a las firmas y reguladores nacionales considerarla explícitamente en sus marcos de cumplimiento,
  aunque RTS 6 en sí no menciona IA de forma directa.

NOVEDAD 5 (2025-2026): foundation models de series temporales (TimesFM de Google, Chronos/Bolt de
  Amazon, MOIRAI entrenado sobre 27B+ observaciones) empiezan a usarse como base de pronóstico
  financiero pre-entrenado, desplazando en investigación a ARIMA/Prophet clásicos — aunque su
  aplicación a mercados reales sigue siendo objeto de escrutinio por el ruido y no-estacionariedad
  específicos de precios financieros.
```
