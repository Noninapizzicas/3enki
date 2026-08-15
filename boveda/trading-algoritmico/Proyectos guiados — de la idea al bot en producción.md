---
tipo: proyecto
sector: trading-algoritmico
tags: [proyectos, tutorial, backtest, ejemplo]
---
# Proyectos guiados — de la idea al bot en producción

> Cuatro proyectos ordenados por dificultad creciente, cada uno construido sobre el anterior. El objetivo no es "tener un bot" — es entender cada capa (dato, señal, ejecución, validación) lo bastante bien como para depurarla cuando falle en real.

---

## Proyecto 1 — Bot RSI + EMA sobre cripto (Binance, dry-run)

```
DIFICULTAD    → ★★☆☆☆
OBJETIVO      → primer sistema end-to-end: dato → señal → orden simulada
STACK         → Python + ccxt (datos Binance) + pandas-ta (indicadores) + freqtrade (motor)
PASOS
  1. Instalar freqtrade en modo dry-run (docker o venv, ver documentación oficial)
  2. Definir estrategia: entrada cuando RSI(14) < 30 Y precio > EMA(200) (filtro de
     tendencia alcista de fondo — no comprar caídas en tendencia bajista)
  3. Salida: RSI(14) > 70 O stop loss fijo del 2% O take profit del 4% (ratio 2:1)
  4. Backtest con freqtrade sobre 6-12 meses de histórico del par elegido (ej. BTC/USDT)
  5. Revisar métricas: win rate, profit factor, max drawdown
     (ver [[Métricas y fórmulas de riesgo — Sharpe, Sortino, Kelly, Fama-French, drawdown]])
  6. Correr en dry-run 2-4 semanas con feed real ANTES de considerar capital real
APRENDIZAJE CLAVE → un win rate del 45% con ratio 2:1 es rentable; un win rate del 70% con
                ratio 1:2 no lo es — practicar el cálculo de esperanza matemática real
```

## Proyecto 2 — Pairs trading con cointegración (acciones, Python puro)

```
DIFICULTAD    → ★★★★☆
OBJETIVO      → primera estrategia de arbitraje estadístico real, con rigor estadístico
STACK         → pandas + statsmodels (test de cointegración) + backtrader o vectorbt
PASOS
  1. Seleccionar universo candidato de pares del mismo sector (ej. dos petroleras, dos
     bancos comparables) — datos vía yfinance para prototipar
  2. Test de cointegración Engle-Granger sobre cada par candidato — descartar los que NO
     cointegran (p-value > 0.05), aunque "parezcan" correlacionados a simple vista
  3. Calcular el spread (z-score de la diferencia de precios normalizada) y definir
     umbrales de entrada (ej. z-score > 2 → short el caro, long el barato) y salida
     (z-score vuelve a 0)
  4. Backtestear con costes de transacción DUPLICADOS (dos patas por operación)
  5. Validar con walk-forward — el par que cointegra en 2023 puede dejar de hacerlo en 2026
     (ver [[Validación y errores comunes — overfitting, look-ahead bias, walk-forward]])
APRENDIZAJE CLAVE → la diferencia entre correlación y cointegración no es académica — es la
                línea entre una estrategia que funciona y una que se rompe en el peor momento
```

## Proyecto 3 — Motor de producción con NautilusTrader (paper trading real)

```
DIFICULTAD    → ★★★★☆
OBJETIVO      → migrar una estrategia validada a un motor de producción con paridad
                backtest↔live, conectado a un broker/exchange real en modo paper
STACK         → NautilusTrader + Alpaca (paper trading account) o Binance testnet
PASOS
  1. Portar la lógica del Proyecto 1 o 2 a la arquitectura de Strategy de NautilusTrader
     (documentación oficial cubre el patrón Actor/Strategy)
  2. Conectar el adaptador de datos correspondiente (Binance, IBKR, o el que soporte tu
     broker elegido
     — ver [[Brokers y APIs de ejecución — Interactive Brokers, Alpaca, Binance]])
  3. Correr backtest sobre el MISMO motor que usarás en vivo — verificar que los resultados
     son coherentes con el backtest previo en Backtrader/freqtrade (si difieren mucho,
     investigar por qué — normalmente es modelado de fills más realista)
  4. Desplegar en modo paper trading conectado a la cuenta real del broker en modo demo
  5. Monitorizar 4-8 semanas antes de considerar capital real, con alertas configuradas
     (ver [[Infraestructura — VPS, colocation y latencia]] para el checklist operativo)
APRENDIZAJE CLAVE → la brecha entre "funciona en backtest" y "funciona en paper trading con
                feed real" es donde se descubren la mayoría de bugs de ejecución
```

## Proyecto 4 — Señal LLM + estrategia clásica combinada

```
DIFICULTAD    → ★★★★★
OBJETIVO      → añadir una señal de sentiment/análisis de texto vía LLM como FILTRO
                adicional sobre una estrategia cuantitativa clásica ya validada
STACK         → estrategia base (Proyecto 1 o 2) + API de LLM (para scoring de sentiment
                sobre noticias/headlines) + pandas para combinar señales
PASOS
  1. Recopilar histórico de noticias/headlines del activo o sector con TIMESTAMP preciso
     (point-in-time, sin look-ahead — ver la nota de validación)
  2. Generar score de sentiment por headline vía LLM (prompt estructurado: "puntúa de -1 a
     1 el impacto de esta noticia sobre el precio a corto plazo")
  3. Combinar: la señal técnica clásica solo se ejecuta SI el sentiment score no es
     fuertemente contrario (ej. no comprar señal técnica alcista si sentiment < -0.5)
  4. Backtestear la versión CON filtro LLM vs SIN filtro — comparar Sharpe, drawdown, y
     sobre todo el número de "falsas señales" evitadas
  5. Validar que el filtro LLM no introduce look-ahead (la noticia debe tener timestamp
     ANTERIOR al momento de decisión simulado, sin excepción)
APRENDIZAJE CLAVE → un LLM añade valor como FILTRO de una señal ya con edge, no como
                generador de señal desde cero sobre ruido
                — ver [[LLMs y transformers — series temporales y análisis de mercado]] para el estado del arte
```

---

## Progresión recomendada

```
Proyecto 1 (RSI+EMA cripto)  → 1-2 semanas · aprende el ciclo dato-señal-orden
Proyecto 2 (pairs trading)    → 2-4 semanas · aprende estadística real (cointegración)
Proyecto 3 (NautilusTrader)   → 4-8 semanas · aprende producción, paridad backtest/live
Proyecto 4 (LLM + clásica)     → abierto · aprende a combinar paradigmas sin romper rigor
```

## Errores comunes en todos los proyectos

```
→ Saltar directamente al Proyecto 3 o 4 sin dominar el 1 y 2 — la complejidad de
  NautilusTrader o de combinar señales LLM sin base estadística sólida genera bugs
  invisibles que un backtest bonito esconde perfectamente.
→ No documentar cada decisión de diseño (por qué ese umbral de RSI, por qué ese stop) — sin
  un diario de decisiones es imposible depurar por qué una estrategia dejó de funcionar.
→ Considerar "terminado" un proyecto tras el backtest — ninguno de estos 4 proyectos está
  completo sin al menos 4 semanas de paper/dry-run con feed real antes de arriesgar capital.
```
