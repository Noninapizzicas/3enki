# PASADA 1 · Prisma global del SUJETO "Nichos Autónomos"

> Sistema esquematizado: **Nichos Autónomos** — herramienta autónoma que detecta
> el nicho → valida la solución → monta el modelo de negocio → opera hasta
> cobrar, generando ingresos al dueño. Medida maestra: **salud financiera por
> proyecto**.

---

## Prisma de los 5 huecos (ronda 1)

### 1 · IDENTIDAD — ¿qué es exactamente el sujeto?
Una **cadena end-to-end automatizada** de negocio digital, cuyo valor NO es la
idea sino la ejecución completa: recibe una semilla (palabra/idea), la convierte
en un proyecto de negocio real montado, operado y cobrando. No se detiene en
ideas ni en nichos "detectados": exige llegar a caja. La autonomía hace el
trabajo; la supervisión del dueño (canal elegido, Telegram) mantiene el control:
recibe pulso, casos a decidir, alertas.

### 2 · RESTRICCIONES — ¿qué limita al sistema?
- La **validación (F2)** es el cuello: filtra qué nichos merecen construcción/cobro,
  y su umbral depende de datos NO declarados (demanda 1er orden, disposición a
  pagar, regla 50-300 €/semana) → sin dato, el filtro no corta ni deja pasar con
  criterio.
- La **construcción (F3)** declara un freno explícito: "si Enki no sabe, presenta
  nicho+problema+dudas al admin y se valora" → dependencia humana que puede
  atascar la cadena.
- Supervisión por canal único → si el canal falla, no hay alerta ni decisión.
- Cada nicho elige **encontrar o construir** (nodo de decisión por oportunidad):
  el sistema debe DECIDIR con riesgo declarado, no siempre el camino fácil.

### 3 · CONTRATO — ¿qué intercambia / compromete?
- CON el dueño: transforma semilla → ingreso real a caja; a cambio recibe supervisión,
  semillas, casos a decidir. El dueño PERCIBE todo lo generado (A y B suman).
- CON el cliente final (según nicho): entrega una solución/servicio por la que ese
  cliente paga (empresas o suscripciones, según lo oportuno).
- CON los proveedores de fuentes/datos: consume datos/servicios externos para
  detectar demanda; si falta un recurso, se crea.
- Interno hacia el negocio: debe devolver **cuadro de salud financiera por proyecto**
  (cuántos generan, cuáles sangran, flujo real a caja).

### 4 · NO-OBJETIVOS — ¿qué NO quiere ser?
- NO un buscador de ideas que se detenga en la lista (eso es el anticontrato: el
  filo es "no me detengo en ideas").
- NO un generador de propuestas sin cobro ni caja.
- NO un proyecto "por sensación": el indicador es financiero y se sigue por
  proyecto, no por intuición.
- NO un contenedor tecnológico: el sujeto es el negocio, no un stack.

### 5 · PREGUNTAS ABIERTAS (ley de cero supuestos — nada se estima)
- ¿Cuál es el **umbral exacto de validación** (demanda mínimo demostrable y
  disposición a pagar concreta por tipo de nicho)? NO declarado.
- ¿Qué define "demanda de 1er orden"? ¿Qué fuente la demuestra? ¿Quién es
  autoridad para afirmarla? (fuentes proveedoras no enumeradas).
- **Salud financiera**: ¿qué KPI define "genera" vs "sangra"? ¿coste fijo por
  proyecto frente a ingreso? ¿cuándo se corta un proyecto sangrante?
- **Modelo de cobro real**: ¿plataformas/procesadores por nicho? NO declarados.
- ¿Cada cuánto el dueño recibe **pulso** y qué casos exigen su decisión sí o sí?

---

## ESLABÓN LIMITANTE (cuello de botella del flujo) — identificación TÚ

Del flujo declarado (semilla → F1 buscador → **F2 validación** → F3 construcción →
F4 operación/cobro → F5 autonomía), el cuello de botella es **F2 · VALIDACIÓN**:
*el paso cuya capacidad y criterio restringen a todo el conjunto*. El buscador
produce nichos baratos y abundantes; la construcción y operación son caras. La
validación es el embudo que decide qué nichos entran al tramo caro — y su calidad
determina directamente la medida maestra (cuántos proyectos generan vs cuántos
sangran). Su dato (demanda + disposición a pagar + umbral) está NO declarado y
atado a experiencia no automatizada → en el estado declarado, la validación no
puede operar en autonomía. **FRENO → EMPUJON**: el freno es "validar exige juicio
que aún no se ha codificado". Sus empujones (piezas que abren el cuello) se listan
en pasada-2-validador-estudio (batch de validación en paralelo, reglas aprendidas,
umbral por defecto declarable, corte temprano de sangrantes).

---

## SUB-PRODUCTOS que salen de la ronda 1 (cada uno → su pasada-2)
1. `semilla-buscador` — puerto que recibe palabra/idea del dueño y arranca.
2. `buscador-nichos` — F1: demanda-primero, limitable, reglas aprendidas.
3. `validador-estudio` — F2: estudio de mercado + disposición a pagar (ESLABÓN).
4. `constructor` — F3: crear la solución, puente humano si Enki no sabe + "se crea" si falta.
5. `operador-cobro` — F4: competencia, reunión con admin, operar hasta cobrar.
6. `monitor-salud-financiera` — la medida maestra por proyecto (corte de sangrantes).
7. `canal-supervision` — Telegram/canal elegido: pulso, casos a decidir, alertas.

(Nodo decisorio `encontrar-o-construir` se trata dentro de validador-estudio y constructor — es la bifurcación que liga F2 con F3.)
