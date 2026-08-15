---
tipo: fuentes
sector: trading-algoritmico
tags: [libros, comunidades, arxiv, github, discord, reddit]
---
# Fuentes, libros y comunidades

> El trading algorítmico se mueve tan rápido que un libro de 2019 sigue siendo la base correcta (los fundamentos no caducan) pero un blog de hace 6 meses ya puede estar hablando de un motor descontinuado — combinar ambas fuentes es la única forma de no quedarse ni desactualizado ni sin base.

---

## Libros de referencia (los fundamentos no caducan)

```
"QUANTITATIVE TRADING: How to Build Your Own Algorithmic Trading Business" — Ernest P. Chan
  → EL punto de entrada recomendado — explica el proceso completo de idea a operación sin
    exigir nivel matemático extremo, ideal para quien viene de trading manual
"ALGORITHMIC TRADING: Winning Strategies and Their Rationale" — Ernest P. Chan
  → más práctico en estrategias e ideas concretas, segundo libro tras el anterior
"ADVANCES IN FINANCIAL MACHINE LEARNING" — Marcos López de Prado
  → avanzado y exigente — estructuración de datos financieros, ML aplicado, y cómo EVITAR
    los errores más comunes de backtesting con ejemplos de código; leer DESPUÉS de tener
    una base sólida, no como primer libro
"ADVANCES IN ACTIVE PORTFOLIO MANAGEMENT" — Grinold & Kahn
  → referencia clásica de factor investing y construcción de portfolio cuantitativo
```

## Papers y arXiv — dónde seguir la investigación

```
arXiv q-fin (Quantitative Finance)  → https://arxiv.org/list/q-fin/recent — categoría
                                      completa, actualización constante, subcategorías:
                                      q-fin.CP (computational), q-fin.TR (trading), q-fin.PM
                                      (portfolio management), q-fin.ST (statistical finance)
PAPERS CLAVE 2025 IDENTIFICADOS EN ESTA INVESTIGACIÓN
  → "Reinforcement Learning in Financial Decision Making" (arXiv 2512.10913) — revisión
    sistemática de rendimiento, desafíos y estrategias de implementación
  → "PLUTUS" (arXiv 2505.14050) — framework open source enfocado en reproducibilidad
  → "Large Language Models for Time Series: Application for Single Stocks and Statistical
    Arbitrage" (arXiv 2412.09394)
  → "News-Aware Direct Reinforcement Trading" (arXiv 2510.19173)
CÓMO SEGUIRLO → suscripción RSS del feed de arXiv q-fin, o alertas por keyword en Google
                Scholar para "algorithmic trading", "reinforcement learning finance"
```

## Repositorios GitHub activos (2025-2026)

```
awesome-quant (wilsonfreitas)     → lista curada masiva de librerías/recursos para quants —
                                    el punto de partida para descubrir herramientas nuevas
best-of-algorithmic-trading        → ranking curado de bots/frameworks de trading algorítmico
                                    open source, mantenido activamente
TradeMaster (TradeMaster-NTU)      → plataforma de investigación open source para workflows
                                    de trading basados en reinforcement learning
awesome-systematic-trading         → recursos de trading sistemático, papers y código
QuantLib                           → librería C++ (con bindings Python) para valoración de
                                    instrumentos financieros — referencia para derivados
```

## Comunidades — España e internacional

```
RANKIA (foros)                     → comunidad hispanohablante de inversión con hilos
                                     activos específicos de trading algorítmico
GARCÍA-FERREIRA (Discord)          → comunidad en español dedicada específicamente a trading
                                     algorítmico y machine learning aplicado a mercados
QUANTIFIED MODELS                  → comunidad española con formadores especializados en
                                     Strategy Quant y generación de EAs, más de 15 años de
                                     experiencia del equipo formador
r/algotrading (Reddit)             → la comunidad internacional de referencia en inglés,
                                     alto volumen de discusión técnica diaria
QuantConnect Forum                 → foro oficial de la comunidad LEAN/QuantConnect, muy
                                     activo en dudas técnicas de implementación
NautilusTrader Discord/GitHub Discussions → comunidad técnica del motor, activa para
                                     soporte de implementación y roadmap del proyecto
```

## Cursos y formación en español

```
"Curso de Trading Algorítmico con Python" (The Hub Trader)
"Trading Cuantitativo en Python: Ingeniería Financiera e IA" (Udemy)
Repositorio GitHub complementario: AxelMunguiaQuintero/Trading-Cuantitativo-en-Python
  → curso completo con ingeniería financiera + IA implementado en Python, gratuito en GitHub
```

## Cómo mantenerse al día (rutina recomendada)

```
SEMANAL   → revisar r/algotrading + Discord de NautilusTrader/comunidad elegida para
            novedades de motores y bugs conocidos
MENSUAL   → barrido de arXiv q-fin por keyword de tu especialización (RL, LLM, factor
            investing...) — no hace falta leer todo, sí detectar tendencias emergentes
TRIMESTRAL → revisar changelog de los motores/librerías clave que uses (NautilusTrader,
            freqtrade, ccxt) — las APIs cambian y romper compatibilidad silenciosamente es
            habitual en el ecosistema open source de rápido movimiento
```

---

## Novedades 2025-2026

```
→ El ecosistema GitHub de trading algorítmico sigue extremadamente activo hasta agosto
  2026 — proyectos como best-of-algorithmic-trading actualizan su ranking con frecuencia,
  reflejando la velocidad de cambio del sector frente a documentación estática tradicional.
→ Crecimiento de comunidades españolas específicas de algo trading + ML (García-Ferreira,
  Quantified Models) frente a la oferta anterior centrada casi exclusivamente en trading
  manual/discrecional en español.
```
