---
tipo: general
sector: trading-algoritmico
tags: [normativa, mifid2, rts6, cnmv, regulacion]
---
# Normativa — MiFID II, RTS 6 y CNMV

> El trading algorítmico personal con capital propio en la práctica no dispara la maquinaria regulatoria completa de RTS 6 — pero entender dónde está la línea es lo que separa a quien automatiza responsablemente de quien un día recibe una carta de la CNMV que no esperaba.

---

## MiFID II y RTS 6 — el marco europeo

```
QUÉ ES RTS 6      → Reglamento Delegado (UE) 2017/589 de la Comisión Europea — especifica
                    los requisitos organizativos para EMPRESAS DE SERVICIOS DE INVERSIÓN que
                    hacen trading algorítmico, complementando MiFID II
A QUIÉN APLICA    → firmas de inversión reguladas (brokers, gestoras, bancos) que ejecutan
                    algorithmic trading como actividad profesional — NO al trader individual
                    con cuenta propia que automatiza su propia estrategia con capital propio
                    (aunque el broker que usas SÍ está sujeto si él mismo aplica algoritmos)
```

## Requisitos clave de RTS 6 (para quien opera como firma regulada)

```
PRE-TRADE CONTROLS (Art. 15)     → collares de precio, valores/volúmenes máximos de orden,
                                  límites máximos de mensajes, throttles de ejecución
                                  automática repetida
HARD BLOCKS vs SOFT BLOCKS       → hard blocks (bloqueo automático de órdenes no conformes)
                                  son OBLIGATORIOS, soft blocks (alerta antes de enviar)
                                  fuertemente recomendados pero no obligatorios
CANCELACIÓN AUTOMÁTICA (Art. 15.5) → la firma debe bloquear/cancelar automáticamente órdenes
                                  de un trader del que se detecta que no tiene permiso para
                                  operar ese instrumento concreto
KILL-SWITCH                      → capacidad de detener inmediatamente toda actividad
                                  algorítmica ante anomalía detectada
```

## Novedad regulatoria clave — Supervisory Briefing ESMA (febrero 2026)

```
QUÉ CAMBIA    → ESMA publicó (26 febrero 2026) un nuevo Supervisory Briefing sobre
                algorithmic trading bajo MiFID II — orientación tanto a reguladores
                nacionales (CNMV en España) como a firmas de inversión
NOVEDAD IA    → ni MiFID II ni RTS 6 mencionan explícitamente inteligencia artificial, pero
                ESMA reconoce su integración creciente en sistemas algorítmicos y recomienda
                a firmas y autoridades nacionales considerarla EXPLÍCITAMENTE en sus marcos
                de cumplimiento — la exigencia de "modelos transparentes, revisables y
                verificables" para plataformas que usan IA/algoritmos empieza a aplicarse
                de forma más estricta desde este briefing
```

## CNMV — el regulador español

```
ROL           → la CNMV supervisa a las empresas de servicios de inversión españolas y a
                las extranjeras que operan en España (por registro/pasaporte europeo)
BROKERS Y CNMV → Interactive Brokers no está regulado DIRECTAMENTE por la CNMV, pero está
                registrado como empresa de servicios de inversión extranjera (regulada por
                el Banco Central de Irlanda con pasaporte MiFID II) · Alpaca Europe A.V. SÍ
                está autorizada y registrada DIRECTAMENTE en CNMV, cumpliendo MiFID II
REGULACIÓN 2025 → refuerzo de la protección al inversor en las nuevas regulaciones de
                brokers en España durante 2025, con mayor exigencia de transparencia
EXIGENCIA CLAVE → la CNMV requiere que cualquier plataforma que use IA o trading
                algorítmico opere con modelos transparentes, revisables y verificables —
                esto aplica principalmente a las FIRMAS reguladas, no al trader retail
                individual, pero condiciona qué brokers puedes usar legalmente desde España
```

## Qué aplica realmente al trader individual/quant independiente

```
NO TE APLICA DIRECTAMENTE RTS 6 si operas con capital propio a través de un broker regulado
  — la responsabilidad regulatoria de los pre-trade controls recae en el BROKER, no en ti
SÍ TE AFECTA INDIRECTAMENTE
  → el broker que elijas debe estar correctamente regulado (CNMV directo o pasaporte MiFID II)
  → si tu volumen/actividad cruza el umbral de "actividad profesional habitual" las
    autoridades fiscales y regulatorias españolas pueden reclasificar tu actividad
  → declarar fiscalmente las ganancias de trading algorítmico sigue el mismo régimen que el
    trading manual — ver [[00 - Trading (MOC)|el sector Trading general]] para fundamentos
    fiscales y de mercado que no son específicos de la automatización
```

---

## Errores comunes

```
→ Asumir que operar de forma automatizada te exime de las mismas obligaciones fiscales que
  el trading manual — la automatización no cambia el tratamiento fiscal de las ganancias.
→ Elegir un broker sin verificar su estatus regulatorio real en España (registro CNMV
  directo vs pasaporte europeo) — ambos son legales, pero implican vías de reclamación
  distintas en caso de disputa.
→ No informarse sobre los límites entre "trader individual" y "actividad profesional
  habitual" al escalar el volumen de un bot — el umbral no es un número único y fijo, sino
  una valoración caso por caso de frecuencia, volumen e intención.
```

---

## Novedades 2025-2026

```
NOVEDAD (26 febrero 2026): ESMA publica nuevo Supervisory Briefing sobre algorithmic
  trading bajo MiFID II, incorporando por primera vez recomendaciones explícitas sobre IA
  dentro de sistemas algorítmicos — relevante para cualquier bróker europeo que integre
  modelos de ML/LLM en su infraestructura de ejecución.
NOVEDAD (2025): refuerzo de la regulación de brokers operando en España con mayor exigencia
  de protección al inversor — revisar el estatus regulatorio de cualquier broker antes de
  confiarle capital para trading algorítmico.
```
