---
tipo: herramienta
sector: trading-algoritmico
tags: [datos, polygon, databento, sentiment, on-chain, market-data]
---
# Datos de mercado y datos alternativos

> Un algoritmo perfecto con datos malos es peor que un algoritmo mediocre con datos limpios — el 90% de los "bugs" reportados en foros de backtesting son en realidad datos con huecos, splits mal ajustados o timestamps en zona horaria equivocada.

---

## Proveedores tick-level / institucionales

```
DATABENTO
  QUÉ ES        → API institucional-grade centrada en futuros con fidelidad tick, order book
                  profundo (L2/L3, market-by-order), venues que los quants realmente usan:
                  CME, CBOT, NYMEX, COMEX, más equities y opciones sobre futuros vía OPRA
  FACTURACIÓN   → por consumo real (símbolos, rango de fechas, schema solicitado) — no un
                  plan fijo, el gasto mensual depende de tu uso real
  CUÁNDO USARLO → estrategias sobre futuros/derivados donde el detalle del libro de órdenes
                  importa (market making, ejecución algorítmica sensible a microestructura)

POLYGON.IO / MASSIVE (rebrand octubre 2025)
  QUÉ ES        → API generalista de mercado — para workflows centrados en equities es más
                  que suficiente, cobertura amplia de acciones, opciones, forex y cripto
  REBRAND       → Polygon.io pasó a llamarse "Massive" el 30 de octubre de 2025, con
                  reestructuración completa de precios — revisar planes actualizados antes
                  de presupuestar, los precios "clásicos" de Polygon ya no aplican
  CUÁNDO USARLO → necesitas cobertura amplia multi-activo sin la complejidad/coste de
                  Databento, foco en equities/cripto más que en microestructura de futuros
```

## Datos gratuitos (nivel de entrada)

```
YAHOO FINANCE (vía yfinance)     → gratuito, OHLCV diario/intradía limitado, calidad variable
                                  y sujeto a cambios de API no anunciados — válido para
                                  aprendizaje y prototipado, NO para producción seria
ALPHA VANTAGE                    → free tier con límite de requests/día, fundamentales +
                                  técnicos, útil como fuente secundaria de validación
ccxt (cripto)                    → datos gratuitos vía API pública de cada exchange —
                                  suficiente calidad para la mayoría de estrategias cripto
                                  sin pagar un proveedor dedicado
IBKR / broker feed                → si ya tienes cuenta con datos de mercado activados, el
                                  propio feed del broker sirve como fuente gratuita razonable
```

## Datos alternativos — sentiment y on-chain (cripto)

```
GLASSNODE, CRYPTOQUANT           → métricas on-chain (flujos a exchanges, hodler behavior,
                                  MVRV, NUPL) — estándar de facto para análisis on-chain cripto
SANTIMENT                        → combina métricas on-chain con datos sociales para vista
                                  integral de actividad de mercado
LUNARCRUSH                       → popular específicamente para tendencias de Twitter/X y
                                  sentimiento de Reddit — Galaxy Score y social volume son
                                  métricas líderes del sector para sentiment cripto
MESSARI                          → fundamentales cripto enriquecidos con foco en datos
                                  regulatorios y transparencia
PERCEPTION                       → monitoriza 1000+ fuentes de medios con detección avanzada
                                  de narrativas emergentes (herramienta más reciente del stack)
TOKEN METRICS                    → combina condiciones de mercado, técnicos, sentiment y
                                  on-chain en un único score accionable
TENDENCIA 2025-2026 → los índices de sentiment mejorados incorporan cada vez más señales
                (sentimiento del mercado de opciones, funding rates de perpetuos) para dar
                una vista más matizada que el sentiment social puro
```

## Datos alternativos — mercados tradicionales

```
DATOS SATELITALES / IMAGEN       → tráfico de aparcamientos de retailers, actividad de
                                  puertos/almacenes — nicho institucional, coste elevado,
                                  poco accesible a nivel retail/quant independiente
SENTIMENT DE NOTICIAS            → APIs de NLP sobre feeds de noticias financieras
                                  (Bloomberg, Reuters vía proveedores especializados)
                                  ver también [[LLMs y transformers — series temporales y análisis de mercado]]
                                  para el enfoque LLM sobre este dato
```

---

## Tabla de decisión rápida

```
NECESITAS...                        USA...
Aprender / prototipar sin coste     yfinance, ccxt, Alpha Vantage free tier
Equities/cripto en producción       Polygon.io (Massive) — plan de pago
Futuros con microestructura seria   Databento — facturación por consumo
Sentiment cripto                     LunarCrush, Santiment
On-chain cripto                      Glassnode, CryptoQuant
Análisis de texto/noticias           LLM propio + feed de noticias, o Perception
```

## Errores comunes

```
→ Backtestear con datos ajustados por splits/dividendos de forma incorrecta o inconsistente
  entre proveedores — un split no ajustado genera un "salto" de precio falso que el
  algoritmo interpreta como señal real.
→ Mezclar zonas horarias entre fuentes de datos (UTC vs hora de mercado local) — causa
  desalineación sutil entre features y timestamps de ejecución, muy difícil de detectar.
→ Usar el free tier de un proveedor para producción real sin monitorizar los límites de
  rate — un bot que se queda sin requests a media sesión deja de operar sin aviso claro.
→ Confiar en sentiment score sin verificar la metodología del proveedor — dos proveedores
  pueden dar sentiment opuesto sobre el mismo activo el mismo día según su modelo interno.
```

---

## Novedades 2025-2026

```
→ Rebrand de Polygon.io a "Massive" (30 octubre 2025) con reestructuración de precios
  completa — cualquier comparativa de precios anterior a esa fecha está desactualizada.
→ Databento consolida su posición como estándar institucional para datos tick-level de
  futuros, con facturación por consumo cada vez más adoptada frente a planes fijos rígidos.
→ Índices de sentiment 2025-2026 incorporan señales del mercado de opciones y funding rates
  de perpetuos, superando el sentiment puramente social de generaciones anteriores.
```
