---
tipo: componente
sector: trading-algoritmico
tags: [motores, backtesting, nautilustrader, backtrader, zipline, quantconnect, python, rust]
---
# Motores de backtesting y ejecución

> No son intercambiables: cada motor encarna una opinión distinta sobre qué es backtestear — array-matemática, simulación evento a evento, o investigación factorial de universo dinámico. Elegir mal el motor cuesta meses reescribiendo cuando llega el momento de ir a producción.

---

## Los 4 motores de referencia

```
NAUTILUSTRADER (Python + Rust, código abierto AGPL/MIT dual)
  QUÉ ES        → motor de eventos con núcleo en Rust, estrategia en Python, backtesting
                  determinista con el MISMO motor que corre en vivo (paridad backtest↔live)
  RENDIMIENTO   → latencia sub-microsegundo en el core Rust, el más realista en fills sobre
                  small caps y libros de órdenes finos (el único que da un fill price fiable)
  ACTIVOS       → multi-asset: acciones, futuros, forex, cripto, opciones
  NOVEDAD 2026  → release del 18 mayo 2026: soporte de futuros continuos para barras agregadas
                  + purge_instrument para limpiar caché de instrumentos no usados en runtime
  CURVA         → alta — pero "paga la matrícula una vez y la ahorras muchas veces" según
                  quienes ya hicieron el salto a paper/live trading
  CUÁNDO USARLO → vas en serio con ir a producción, quieres el mismo código en backtest y live

BACKTRADER (Python puro, BSD)
  QUÉ ES        → librería pura Python, clase Strategy con método next(), CSV in → resultado out
  RENDIMIENTO   → intermedio en ergonomía y realismo — ni el más rápido ni el más lento
  VENTAJA       → el camino más corto de idea a backtest: menos de 50 líneas para un sistema
                  funcionando; soporta live trading (IBKR, Oanda) sin reescribir
  RIESGO 2026   → mantenimiento del proyecto original congelado — usar el fork backtrader2
                  o backtesting.py si se necesita desarrollo activo; deriva de dependencias
  CUÁNDO USARLO → day/swing trading discreto llevado a algo, aprendizaje de Python, prototipo rápido

ZIPLINE-RELOADED (Python, Apache 2.0, fork mantenido del Zipline original de Quantopian)
  QUÉ ES        → motor con Pipeline API para selección de universo dinámico — cross-sectional
                  factor research sobre renta variable
  LIMITACIÓN    → solo equities, sin live trading nativo — es herramienta de INVESTIGACIÓN,
                  no de despliegue
  CUÁNDO USARLO → factor investing sobre universo amplio de acciones US (long/short equity),
                  el único diseñado específicamente para ese problema

QUANTCONNECT / LEAN ENGINE (C#/Python, Apache 2.0 + SaaS gestionado)
  QUÉ ES        → plataforma todo-en-uno: investigación + backtest + despliegue gestionado,
                  motor LEAN open source, infraestructura en la nube de QuantConnect
  COBERTURA     → la más amplia de activos "out of the box": acciones, futuros, forex, cripto,
                  opciones, CFDs — con datos incluidos en el plan de pago
  CUÁNDO USARLO → quieres empezar YA sin montar infraestructura propia, multi-asset desde el día 1
```

---

## Precios QuantConnect (2026)

```
FREE              → 0€/mes · backtesting ilimitado todos los activos · notebook de investigación
                     soporte comunitario · SIN despliegue en vivo
ORGANIZATION       → 20 $/mes
PROFESSIONAL        → 40 $/mes
RESEARCHER          → 60 $/mes
NODOS DE CÓMPUTO (add-on obligatorio para backtests/live serios)
  backtesting     → 14-96 $/mes según CPU/RAM
  live trading    → 24 $/mes (L-MICRO) hasta 1000 $/mes (nodo con GPU)
  research (GPU)  → 400 $/mes
SOPORTE             → Bronze 72 $/mes (4 tickets) hasta Gold 288 $/mes (16 tickets + teléfono)
```

NautilusTrader, Backtrader y Zipline-reloaded son 100% gratuitos (código abierto) — el coste está en tu propia infraestructura de datos y ejecución, no en licencia.

---

## Tabla comparativa rápida

```
                  REALISMO   VELOCIDAD   LIVE TRADING   CURVA   COBERTURA ACTIVOS
NautilusTrader    ★★★★★      ★★★★☆       nativa Rust    alta    multi-asset
Backtrader        ★★★☆☆      ★★★☆☆       vía brokers    media   equities/forex/futuros
Zipline-reloaded  ★★★★☆      ★★★☆☆       NO nativa      media   solo equities
QuantConnect LEAN ★★★★☆      ★★★★☆       gestionada     media   la más amplia
vectorbt          ★★☆☆☆      ★★★★★       NO             media   equities/cripto (vectorizado)
```

vectorbt no es un motor de simulación evento-a-evento sino de array-matemática vectorizada — piensa el backtest como un problema de NumPy/pandas puro. Es el más rápido para barrer miles de combinaciones de parámetros, pero el menos realista en fills y slippage. Útil como criba inicial antes de validar en NautilusTrader/Backtrader.

---

## Novedades 2025-2026

```
→ NautilusTrader consolida su posición como "el motor que sobrevive el salto a producción" —
  la comunidad quant coincide en que backtrader/zipline son mejores para aprender y prototipar,
  pero NautilusTrader es la apuesta cuando el objetivo final es correr en real.
→ Zipline original (Quantopian) sigue sin mantenimiento activo desde el cierre de Quantopian
  en 2020 — usar siempre el fork zipline-reloaded, no el repo original.
→ Crecimiento de motores de nicho para cripto: Hummingbot (market making), freqtrade y Jesse
  (ver [[Bots cripto open source — freqtrade, Hummingbot, Jesse]]) cubren el hueco que estos
  4 motores generalistas no atienden bien — exchanges cripto y estrategias 24/7.
```

---

## Errores comunes al elegir motor

```
→ Empezar por NautilusTrader sin saber Python bien — la curva de aprendizaje se suma a la
  curva del lenguaje y el abandono es alto. Empieza con Backtrader o vectorbt.
→ Backtestear en vectorbt y asumir que el resultado se replica en producción — vectorbt no
  modela slippage/fills realistas, solo sirve para búsqueda de hiperparámetros.
→ Elegir Zipline para trading en vivo — no tiene despliegue nativo, es una trampa habitual
  de quien viene de tutoriales antiguos de la era Quantopian (cerrada desde 2020).
→ Subestimar el coste de nodos de cómputo en QuantConnect — el plan base "barato" (20-40$/mes)
  no incluye los nodos, que son obligatorios para correr backtests/live serios.
```
