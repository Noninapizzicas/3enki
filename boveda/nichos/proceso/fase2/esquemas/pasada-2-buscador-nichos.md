# PASADA 2 · PUNTO: `buscador-nichos` (F1 — detección)

> F1: la fase que produce los candidatos desde la semilla. Es la "mina" del
> embudo: abundante y barato, alimenta al cuello de botella (validación).

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD
Motor de **detección demanda-primero**: desde la semilla normalizada explora
territorio (sectores, comunidades, búsquedas, scraping, APIs) en busca de nichos
donde exista demanda real demostrable. Sin límites previos (explora amplio) pero
**limitable**: aplica reglas de exclusión que **aprende** de corridas previas
(qué territorios ya dieron falsos positivos). El primer nicho concreto emerge del
propio motor, no se declara de antemano.

### 2 · RESTRICCIONES
- **FRENO**: amplitud sin límites = ruido y coste de búsqueda. → **EMPUJON**:
  reglas de exclusión aprendidas (reflejo + micro-agente): el buscador se afina
  solo con el historial de lo que no dio fruto.
- **FRENO**: "limitabilidad" no tiene regla por defecto. → **EMPUJON**: perfil de
  límite declarable por el dueño; nada se asume.
- **FRENO**: depender de muchas fuentes dispersas sin contrato. → **EMPUJON**: el
  puerto de proveedores de fuentes (pasada proveedor): cada fuente es un canal
  declarado y reemplazable.
- **FRENO**: si no encuentra nada, ¿muere? → **EMPUJON**: invariante "donde hay un
  freno hay una oportunidad / si no existe se crea" → ante un territorio vacío, el
  buscador no da cero: genera la hipótesis de **crear** la necesidad (pasa el nodo
  encontrar-o-construir al validador).

### 3 · CONTRATO
Recibe `buscar(seed)`. Emite: lista de **candidatos** (nicho potencial + evidencia
inicial de demanda + territorio) → al validador. A cambio del conjunto: una mina
poblada sin inflar el coste (reglas de exclusión).

### 4 · NO-OBJETIVOS
NO valida (no demuestra 1er orden/disposición a pagar — eso es F2); NO construye
ni cobra. Su salida son CANDIDATOS, nunca proyectos aprobados.

### 5 · PREGUNTAS ABIERTAS
- ¿Qué define un candidato "con suficiente señal" para ir a validación?
- ¿Cuántos candidatos por semilla produce el límite por defecto?
- ¿Qué fuentes exactas de detección (buscador público, APIs, scraping) autoriza el
  dueño como punto de partida?

---

## Lo que sale (hojas / piezas)
- `sondeo-territorio` (reflejo + micro-agente — explora fuentes por demanda) → hoja
- `reglas-exclusion-aprendidas` (micro-agente — refina el buscador) → hoja
- `perfil-limite-busqueda` (reflejo — límite declarable) → hoja
- lista de candidatos por semilla (evento de salida → validador)
