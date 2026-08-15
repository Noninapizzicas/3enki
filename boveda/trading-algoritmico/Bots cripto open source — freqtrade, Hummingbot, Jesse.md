---
tipo: componente
sector: trading-algoritmico
tags: [freqtrade, hummingbot, jesse, cripto, market-making, open-source]
---
# Bots cripto open source — freqtrade, Hummingbot, Jesse

> El mercado cripto 24/7 sin horario de apertura es el terreno natural del bot — aquí no hay overnight gap que gestionar, solo la máquina corriendo sin parar. Por eso el ecosistema open source cripto es el más maduro de todo el trading algorítmico retail.

---

## Los 3 bots de referencia

```
FREQTRADE (Python, GPL-3.0)
  ESTRELLAS     → 25.000+ en GitHub — el más popular con diferencia
  VERSIÓN       → 2026.3 (versionado por año.mes, releases frecuentes)
  QUÉ HACE BIEN → trading direccional signal-driven (spot y futuros), backtesting robusto,
                  FreqAI (módulo de optimización ML integrado), hyperopt para tuning de params
  EXCHANGES     → 30+ soportados vía ccxt (Binance, Kraken, OKX, Bybit, etc.)
  CUÁNDO USARLO → quieres una estrategia direccional (comprar barato, vender caro) con
                  backtesting serio y no te importa programar en Python

HUMMINGBOT (Python + Cython, Apache 2.0)
  ESTRELLAS     → 6.000+ en GitHub
  VERSIÓN       → 2.13 (marzo 2026)
  QUÉ HACE BIEN → MARKET MAKING — provee liquidez en el libro de órdenes y captura el spread
                  bid-ask, la única alternativa open source seria a Freqtrade con profundidad
                  comparable en su nicho específico
  EXCHANGES     → 50+ conectores, soporta tanto CEX como DEX (a diferencia de Freqtrade/Jesse)
  CUÁNDO USARLO → tu estrategia es proveer liquidez, no predecir dirección — arbitraje entre
                  exchanges, market making puro, estrategias de grid

JESSE (Python, MIT)
  ESTRELLAS     → 5.000+ en GitHub
  QUÉ HACE BIEN → backtesting con CERO look-ahead bias garantizado por diseño del framework,
                  JesseGPT como asistente integrado, pipeline ML nativo
  CUÁNDO USARLO → priorizas la fiabilidad matemática del backtest por encima de todo — menos
                  popular pero con fama de ser el más "honesto" en resultados de simulación
```

## Otras herramientas del ecosistema cripto

```
ccxt              → librería Python/JS/PHP que unifica la API de 100+ exchanges cripto bajo
                    una interfaz común — la base sobre la que se construyen Freqtrade y otros
vectorbt          → screening vectorizado ultrarrápido de miles de combinaciones de parámetros
                    antes de validar en un motor evento-a-evento
                    (ver [[Motores de backtesting y ejecución — NautilusTrader, Backtrader, Zipline, LEAN]])
Passivbot         → bot de grid/DCA especializado en futuros perpetuos, alternativa a
                    Hummingbot para estrategias de rango
OctoBot           → interfaz visual (bloques de condición-acción) para no programadores,
                    auto-trading en OKX/Binance con backtesting incorporado, actualizado
                    activamente (última actualización relevante: agosto 2026)
```

---

## Comparativa

```
                  ESTRELLAS   FOCO              PROGRAMACIÓN   BACKTESTING
Freqtrade         25.000+     direccional       Python         hyperopt + FreqAI
Hummingbot        6.000+      market making      Python/Cython  conector-based
Jesse             5.000+      precisión          Python         zero look-ahead
OctoBot           menor       no-code            visual         incorporado
```

## Errores comunes

```
→ Correr en modo "live" desde el primer día sin pasar por "dry-run" (paper trading) — los 3
  frameworks soportan modo simulado con feed real, úsalo semanas antes de arriesgar capital.
→ Copiar una estrategia de la comunidad de Freqtrade sin re-optimizar hyperopt sobre tu propio
  rango de fechas y par — lo que funcionó en el bull run 2023-2024 no garantiza nada en 2026.
→ Usar Hummingbot para market making sin entender inventory risk — si el precio se mueve
  fuerte en una dirección, terminas con inventario desequilibrado y pérdida direccional no
  deseada (el market maker que no gestiona riesgo de inventario deja de ser market maker).
→ Ignorar comisiones maker/taker reales del exchange en el backtest — en cripto las tarifas
  maker/taker (ej. 0.10%/0.15% en la mayoría de exchanges) erosionan estrategias de alta
  frecuencia de forma significativa si no se modelan desde el inicio.
```

---

## Novedades 2025-2026

```
→ Freqtrade sigue siendo el bot cripto open source más activo, con FreqAI consolidado como
  su diferenciador frente a Hummingbot/Jesse para quien quiere ML sin salir del framework.
→ Hummingbot 2.13 (marzo 2026) amplía conectores DEX — la línea entre CEX y DEX market
  making se difumina, relevante con el crecimiento de perpetuos on-chain.
→ Crecimiento de generadores no-code (OctoBot y similares) como puente para quien viene de
  TradingView/Pine Script y quiere dar el salto a ejecución automática sin programar Python.
```
