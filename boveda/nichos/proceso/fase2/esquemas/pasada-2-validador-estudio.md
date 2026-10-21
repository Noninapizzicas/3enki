# PASADA 2 · PUNTO: `validador-estudio` (F2 — EL ESLABÓN LIMITANTE)

> El corazón del esquema. Este punto es el cuello de botella del flujo declarado:
> decide qué nichos entran al tramo caro (construcción+operación). Su capacidad y
> su criterio rigen cuántos proyectos generan vs cuántos sangran.

---

## Prisma de los 5 huecos sobre el validador

### 1 · IDENTIDAD — ¿qué es la validación aquí?
El **embudo decisor** entre el buscador (abundante, barato) y la construcción
(cara, de valor). Su trabajo: demostrar demanda real de 1er orden + disposición a
pagar antes de comprometer recursos. Autónomo: debe validar sin supervisión
continua, con un umbral de calidad que corte temprano lo no viable. Incluye el
nodo decisorio **encontrar-o-construir**: para cada oportunidad decide si hay
camino rápido a caja (encontrar = demanda demostrable) o se crea la necesidad
(construir = riesgo alto, más margen).

### 2 · RESTRICCIONES — ¿qué le limita?
- **FRENO**: umbral de viabilidad depende de "experiencia" y de datos NO declarados
  (demanda mínimo, disposición a pagar concreta). → **EMPUJON**: regla de umbral
  DECLARABLE por el dueño (inicia con 50-300 €/semana del F1, refinable por reglas
  aprendidas de datos reales), y un **batch de validación** que prueba N nichos en
  paralelo para subir el throughput del cuello.
- **FRENO**: "quién demuestra la demanda" no está definido → autoridad de fuentes
  sin enumerar. → **EMPUJON**: puerto de proveedores de datos donde cada fuente se
  declara (ver pasada proveedor); si no existe fuente, se crea (invariante).
- **FRENO**: validar exige juicio (amortizar "¿esto pagará?") no codificado →
  **EMPUJON**: micro-agente fuzzy que emite el veredicto de viabilidad con el dato
  hidratado por reflejos; el corte duro es el reflejo.
- **FRENO**: estudiar mercado manualmente es lento → atasca el cuello.
  **EMPUJON**: estudio de mercado AUTOMATIZADO (demanda 1er orden + disposición a
  pagar) como pieza propia, con fuentes declaradas.

### 3 · CONTRATO — ¿qué intercambia?
- Recibe: lista de candidatos del buscador.
- Produce/emite: **veredicto por nicho** (viable / no viable / puente-humano a
  decidir), el modelo de negocio preliminar y el camino (encontrar|construir).
- A cambio el conjunto gana: evita sangrar en construcción inútil (protege la
  salud financiera, la medida maestra).

### 4 · NO-OBJETIVOS — ¿qué NO hace?
- NO decide el nicho (eso lo hace el buscador); NO construye (eso es F3); NO cobra
  (eso es F4). Su alcance es **solo** el veredicto de viabilidad + modelo preliminar.
- NO se detiene en "parecer viable": debe demostrar con datos o marcar puente-humano.

### 5 · PREGUNTAS ABIERTAS (cero supuestos)
- ¿Cuál es el **mínimo de demanda demostrable y la disposición a pagar concreta**
  que el dueño exige para "viable"? (no declarado — el guion de la conversación siguiente).
- ¿Qué **fuentes autorizan** "demanda de 1er orden" (buscadores, comunidades,
  scraping, APIs)? (no enumeradas en F0).
- ¿Alcanza el umbral 50-300 €/semana de F1, o cada tipo de nicho exige otro?
- ¿Cuántos nichos en paralelo valida el batch en la primera corrida?

---

## FRENOS → EMPUJONES consolidados del eslabón (las piezas que lo ABREN)
1. **estudio-demanda** (reflejo + micro-agente): mide demanda de 1er orden y disposición a pagar con fuentes declaradas.
2. **reglas-aprendidas**: el umbral se refina con los resultados reales de proyectos previos (bucles de aprendizaje — F1 ya lo declaró).
3. **corte-temprano-sangria**: veredicto negativo → no pasa a construcción, ahorra coste (protege el cuadro de salud).
4. **umbral-declarable**: el dueño fija/ajusta el umbral por tipo de nicho; nada se asume (ley de cero supuestos).
5. **batch-validacion** en paralelo para subir throughput del cuello (desacople: no validar uno a uno en serie).

## Lo que sale de ESTE punto (hojas)
- `estudio-demanda` (pieza)
- `criterio-viabilidad` (regla umbral — declarable, aprendida)
- `veredicto-viabilidad` (micro-agente) → hoja atómica → disección
- `camino-encontrar-construir` (decisión por oportunidad) → pasa al constructor
- `batch-validacion` (capacidad de desacople del cuello)
