---
tipo: herramienta
sector: trading-algoritmico
tags: [brokers, api, interactive-brokers, alpaca, binance, ejecucion]
---
# Brokers y APIs de ejecución

> El broker no es un detalle de implementación — es el límite de lo que tu algoritmo puede llegar a hacer. Una API con rate limits agresivos o sin websocket de datos en tiempo real condiciona la estrategia entera antes de escribir una línea de código.

---

## Interactive Brokers (IBKR)

```
QUÉ ES        → el broker institucional/retail de referencia global, acceso a prácticamente
                todos los mercados (acciones, futuros, forex, opciones, bonos) desde una API
API           → TWS API (Python, Java, C++) o ib_insync (wrapper Python más amigable,
                comunidad activa) — requiere TWS o IB Gateway corriendo como intermediario
                (no es REST puro, es un protocolo propio sobre socket)
COMISIONES 2025-2026 (referencia, tarifa "IBKR Pro")
  → acciones US   → 1,00$ mínimo, 0,0035$/acción (ej. 100 acciones a 25$ → 1,00$ comisión;
                    1000 acciones a 25$ → 5,00$)
  → futuros ES    → ~2,25$ por contrato todo incluido (ejecución + bolsa + regulatorio)
  → sin comisión de plataforma, sin cargos por ticket, sin mínimo de cuenta
REGULACIÓN ESPAÑA → no está regulado directamente por la CNMV, pero está registrado en ella
                como empresa de servicios de inversión extranjera — la entidad europea está
                regulada por el Banco Central de Irlanda con pasaporte europeo (MiFID II)
CUÁNDO USARLO → necesitas acceso multi-mercado real (futuros, opciones, mercados europeos),
                vas en serio con volumen y quieres las comisiones más bajas del sector
```

## Alpaca

```
QUÉ ES        → broker "developer-first" nacido para algo trading, API REST + websocket
                nativos, pensado desde el diseño para automatización (no para trading manual)
COMISIONES 2025-2026 → 0$ por operación en acciones US, ETFs y opciones · cripto con tarifa
                maker/taker 0,15%/0,25% · margen al 6,5% estándar (5% en nivel Alpaca Elite,
                saldo 100k$+)
PLANES DE DATOS
  → Free          → datos IEX en tiempo real vía websocket, REST con 15 min de delay,
                    200 requests/minuto
  → Algo Trader Plus → 99$/mes — datos SIP completos en tiempo real, opciones OPRA,
                    hasta 10.000 requests/minuto
EUROPA         → Alpaca Europe A.V. está autorizada, registrada en CNMV y cumple MiFID II —
                única entrada de las tres con presencia regulatoria directa en España
CUÁNDO USARLO → tu prioridad es integrar rápido vía API sin fricción de UI, presupuesto
                ajustado, foco en acciones US/cripto
```

## Binance API

```
QUÉ ES        → API REST + WebSocket del mayor exchange cripto por volumen — spot, futuros
                perpetuos, márgenes, staking, todo accesible programáticamente
LIBRERÍAS     → python-binance (wrapper oficial de la comunidad), ccxt (unificado con otros
                exchanges), websocket nativo para order book en tiempo real de baja latencia
COMISIONES    → spot: 0,10% maker/taker estándar (reducible con BNB o volumen) · futuros:
                0,02%/0,05% maker/taker estándar
LÍMITES DE API → rate limits por peso de request (weight-based), diferenciado por endpoint —
                crítico diseñar el bot respetando estos límites o el exchange banea la IP
                temporalmente
CUÁNDO USARLO → estrategias cripto, especialmente si necesitas profundidad de order book en
                tiempo real y el volumen que solo el mayor exchange puede ofrecer
```

---

## Comparativa

```
                  ACTIVOS              COMISIÓN ACCIONES   API NATIVA        CNMV ESPAÑA
Interactive Brokers  multi-mercado global  ~1$ mínimo          socket (TWS)      registrado (no directo)
Alpaca               US stocks/ETF/cripto  0$                  REST+WS nativo    Alpaca Europe SÍ
Binance               cripto                 N/A (spot 0,10%)   REST+WS nativo    N/A (regulación cripto)
```

## Errores comunes

```
→ Desarrollar contra la API de paper trading y asumir comportamiento idéntico en real — el
  simulador de fills de paper trading suele ser optimista, no modela slippage real de mercado.
→ No respetar rate limits de Binance — un bot mal diseñado que golpea el endpoint de order
  book demasiado rápido termina baneado temporalmente en el peor momento posible.
→ Usar TWS API de IBKR sin gestionar la reconexión — TWS/IB Gateway se desconecta
  periódicamente (reinicio diario obligatorio) y un bot sin lógica de reconexión pierde
  control de posiciones abiertas.
→ Subestimar el coste de margen (6,5% en Alpaca, variable en IBKR) al apalancar estrategias
  — el coste de financiación erosiona estrategias con edge pequeño por operación.
```

---

## Novedades 2025-2026

```
→ Alpaca Europe consolida su registro CNMV como la vía más directa de acceso regulado en
  España para algo trading vía API — relevante frente a IBKR (registro indirecto vía Irlanda).
→ Regulación de brokers en España se refuerza en 2025 con mayor protección al inversor,
  aumentando exigencias de transparencia sobre plataformas que usan IA/algoritmos.
```
