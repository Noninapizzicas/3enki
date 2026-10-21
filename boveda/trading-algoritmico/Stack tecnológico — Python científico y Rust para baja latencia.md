---
tipo: herramienta
sector: trading-algoritmico
tags: [python, rust, pandas, numpy, stack, hft]
---
# Stack tecnológico — Python científico y Rust

> Python para pensar, Rust para ejecutar. La mayoría de estrategias nunca necesitan Rust — pero cuando la latencia importa (market making, HFT), es la diferencia entre capturar el spread o ser tú quien lo paga.

---

## El stack Python estándar

```
PANDAS          → columna vertebral — manipulación de series temporales, limpieza de datos,
                  resampling de OHLCV, la estructura DataFrame es el lenguaje común del sector
NUMPY           → álgebra lineal y matemática matricial de bajo nivel — cálculos vectorizados
                  sobre arrays de precios órdenes de magnitud más rápidos que loops puros
SCIPY           → estadística (tests ADF, cointegración Johansen), optimización (Kelly,
                  asignación de portfolio mean-variance de Markowitz)
TA-LIB / pandas-ta → librerías de indicadores técnicos precalculados (RSI, MACD, Bollinger,
                  ATR...) — TA-Lib requiere compilación C, pandas-ta es Python puro (más
                  fácil de instalar, algo más lento)
statsmodels     → tests estadísticos formales (ADF, Engle-Granger, Johansen) necesarios para
                  validar mean reversion y cointegración antes de tradear un par
scikit-learn    → modelos supervisados clásicos (Random Forest, XGBoost vía wrapper, SVM)
                  para clasificación/regresión de dirección o volatilidad
PyTorch / JAX   → deep learning y RL — PyTorch domina en investigación, JAX gana tracción en
                  2025-2026 para entrenamiento de foundation models de series temporales
ccxt            → API unificada para 100+ exchanges cripto (spot, futuros, órdenes, websockets)
```

## Instalación de un entorno base (referencia rápida)

```
python -m venv venv && source venv/bin/activate
pip install pandas numpy scipy statsmodels scikit-learn pandas-ta ccxt
pip install backtrader vectorbt          # motores de backtesting
pip install nautilus-trader              # motor de producción (requiere Rust toolchain
                                          # instalado si compilas desde fuente; wheels
                                          # precompilados disponibles para plataformas comunes)
```

## Cuándo entra Rust

```
POR QUÉ RUST    → memory-safety sin garbage collector, rendimiento comparable a C/C++,
                  concurrencia segura por diseño (el "fearless concurrency" del borrow checker)
                  — crítico quando cada microsegundo de latencia es dinero real
DÓNDE SE USA HOY
  → NautilusTrader → núcleo del motor de eventos en Rust, estrategia sigue en Python
  → bots HFT cripto → varios proyectos GitHub 2025-2026 en Rust puro para exchanges cripto
                  con ejecución sub-segundo, gestión de riesgo avanzada
  → hftbacktest    → librería Python+Rust para backtesting realista de market making con
                  colas de órdenes (queue position) y latencia modelada explícitamente
CUÁNDO NO HACE FALTA → cualquier estrategia con horizonte de minutos u horas — la latencia
                  de red del broker/exchange (decenas-cientos de ms) domina sobre cualquier
                  microoptimización de tu código; Python es más que suficiente
```

## Rust vs Python — cuándo cambiar

```
                        PYTHON            RUST
Prototipado rápido      ★★★★★             ★★☆☆☆
Ecosistema ML/quant      ★★★★★             ★★☆☆☆ (creciendo)
Latencia de ejecución    ★★☆☆☆             ★★★★★
Curva de aprendizaje     ★★★★★ (fácil)     ★★☆☆☆ (empinada, borrow checker)
Caso de uso              investigación,     hot path de ejecución, market making,
                        backtesting,       procesamiento de order book en tiempo real
                        estrategias
                        <100 trades/día
```

---

## Novedades 2025-2026

```
→ Wheels precompilados de NautilusTrader reducen la fricción de instalación de Rust para
  usuarios que solo quieren usar Python — ya no hace falta compilar el toolchain Rust
  manualmente en la mayoría de plataformas.
→ Crecimiento de proyectos híbridos Python+Rust vía PyO3 (bindings) como patrón estándar:
  prototipar en Python, mover el hot path identificado por profiling a Rust sin reescribir
  todo el sistema — el mismo patrón que usa NautilusTrader internamente.
→ JAX gana terreno frente a PyTorch específicamente para entrenar foundation models de
  series temporales a gran escala (TimesFM, Chronos) por su compilación XLA y paralelización
  eficiente en TPU/GPU.
```

## Errores comunes

```
→ Optimizar en Rust prematuramente sin haber hecho profiling — la mayoría de "lentitud" en
  estrategias Python viene de I/O (llamadas API, lectura de disco), no de cómputo puro; Rust
  no arregla eso.
→ Instalar TA-Lib sin las dependencias del sistema (librería C subyacente) — es el error de
  instalación más común reportado en foros, usar pandas-ta si da problemas de compilación.
→ Mezclar versiones de pandas incompatibles entre motores de backtesting (algunos fijan
  versiones antiguas de pandas por deuda técnica) — usar entornos virtuales AISLADOS por
  proyecto, nunca un único entorno global para todo.
```
