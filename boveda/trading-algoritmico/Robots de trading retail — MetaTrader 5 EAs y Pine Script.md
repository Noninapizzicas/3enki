---
tipo: componente
sector: trading-algoritmico
tags: [mql5, metatrader, pine-script, tradingview, robots, forex]
---
# Robots de trading retail — MT5 EAs y Pine Script

> La puerta de entrada de la mayoría de traders retail a la automatización — y también donde más dinero se pierde por copiar EAs de foros sin entender qué hacen. Un EA gratuito de un canal de Telegram no es un edge, es una promesa sin backtesting propio.

---

## Expert Advisors (MT5, lenguaje MQL5)

```
QUÉ ES        → software que automatiza trading según reglas pre-programadas en MQL5
                (sintaxis similar a C++), corre embebido dentro del terminal MetaTrader 5
FUNCIONAMIENTO → analiza feed de precios en tiempo real e histórico, evalúa indicadores
                (RSI, MACD, medias móviles) o patrones de price action, ejecuta órdenes
                cuando se cumplen las condiciones programadas
FORMATO       → .mq5 (código fuente) se compila a .ex5 (ejecutable) — los EAs de pago suelen
                distribuirse solo en .ex5 (código cerrado)

INSTALACIÓN (5 pasos)
  1. Descargar el .ex5/.mq5 (MQL5 Market oficial o fuente de confianza)
  2. MT5 → File → Open Data Folder → MQL5 → Experts → pegar el archivo
  3. Reiniciar MT5 (o clic derecho → Refresh en el Navigator)
  4. Arrastrar el EA desde el Navigator al gráfico del par deseado
  5. Activar el botón "AutoTrading" en la barra superior — sin esto el EA no ejecuta nada
```

## Dónde conseguir EAs

```
MQL5 MARKET (marketplace oficial)                → gratuitos y de pago, revisión de MetaQuotes
  https://www.mql5.com/en/market/mt5
MQL5 SIGNALS                                      → copy trading de estrategias verificadas
DESARROLLO PROPIO                                 → MetaEditor incluido en MT5, lenguaje MQL5
                                                     documentación oficial completa en mql5.com
STRATEGY QUANT / EA STUDIO                        → generadores visuales de EAs sin programar,
                                                     usados en comunidades españolas de trading
                                                     algorítmico (ej. Quantified Models)
```

## Errores comunes con EAs

```
→ Instalar un EA "milagro" de foro sin ver su código ni backtestear en el propio histórico —
  la mayoría de EAs virales están sobreoptimizados sobre un periodo concreto (curve-fitting).
→ No activar el AutoTrading y pensar que el EA "no funciona" — es el error de instalación
  más reportado en comunidades de soporte.
→ Backtestear en el Strategy Tester de MT5 con datos de mala calidad (modo "solo precio de
  cierre") — usar siempre modo "Every tick based on real ticks" para resultados fiables.
→ Dejar el EA corriendo en cuenta real sin VPS — un corte de conexión de tu portátil deja
  posiciones abiertas sin gestión de riesgo activa.
```

---

## Pine Script (TradingView)

```
QUÉ ES        → lenguaje de scripting propio de TradingView para indicadores, estrategias
                y alertas, sintaxis declarativa orientada a series temporales de precio
BIBLIOTECA    → más de 100.000 scripts publicados en la librería pública de TradingView,
                un puñado acumula miles de "likes" y aparece en tutoriales de YouTube
ESTRATEGIAS POPULARES 2025-2026
  → UT Bot           — fuerte en mercados tendenciales, débil en rango (279 trades en BTC
                        lateral 2025, mayoría stopped out rápido — cuidado con el hype)
  → MACD + SMA 200   — filtro de tendencia clásico combinado con cruce de momentum
  → Chandelier Exit  → gestión de salida basada en ATR
  → Heikin Ashi Trend, SSL Channel → suavizado de velas para reducir ruido visual

DE SEÑAL A EJECUCIÓN AUTOMÁTICA
  Pine Script por sí solo NO ejecuta órdenes reales — genera alertas. Para automatizar:
  TradingView Alert → webhook → bot conector (WunderTrading, OctoBot, Make/Zapier/n8n) →
  API del exchange/broker → orden real ejecutada
```

## Errores comunes con Pine Script

```
→ Confundir "repintado" (repainting) — algunos indicadores recalculan valores pasados con
  información futura, dando backtests falsamente perfectos. Verificar siempre con
  barmerge.lookahead_off y confirmar en gráfico en tiempo real, no solo en histórico.
→ Publicar/copiar una estrategia con % de acierto altísimo en el Strategy Tester de
  TradingView sin considerar comisiones ni slippage — el tester por defecto usa fills
  optimistas, hay que configurar comisión y slippage realistas manualmente.
→ Depender de un webhook único sin reintentos — si TradingView no puede entregar la alerta
  (raro pero ocurre) o el bot conector cae, la operación simplemente no se ejecuta y no hay
  alerta de fallo por defecto.
```

---

## Novedades 2025-2026

```
→ Auge de conectores no-code entre TradingView y exchanges: WunderTrading, OctoBot y flujos
  vía n8n/Make permiten pasar de señal Pine Script a orden real sin escribir un bot propio.
→ Generadores visuales de EAs (Strategy Quant, EA Studio) ganan tracción en comunidades
  hispanohablantes como alternativa a programar MQL5 desde cero — con el riesgo de generar
  miles de variantes sobreoptimizadas si no se valida fuera de muestra.
```
