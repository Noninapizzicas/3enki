# PASADA 2 · PUNTO: `capa-fiscal` (IVA · IRPF/IS · retenciones · modelos · Verifactu · e-factura)

> El bloque que hoy es **CERO en el sistema verificado**: no existe ni IVA, ni Verifactu, ni
> factura electrónica. Es un **mundo**, no un módulo → buena parte de sus decisiones son
> **[ABIERTO]** y no se estiman.

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD — ¿qué es la capa fiscal?
El **derivador de obligaciones tributarias**: del libro sale qué IVA se devenga/soporta, qué
retenciones se practican, qué resultado se estima (IS/IRPF), y qué **modelos** (303/390, y los
demás) hay que presentar, con su **calendario**. El sistema **genera el modelo**; el **asesor lo
firma y presenta** (asesor se mantiene). Incluye la **factura electrónica** y el registro
**Verifactu** (huella/cadena inalterable de la facturación).

### 2 · RESTRICCIONES — ¿qué le limita?
- **FRENO**: hoy no existe nada fiscal → sin base declarada no se dimensiona. **EMPUJÓN**:
  **liquidacion-iva** como reflejo puro (devengado/soportado se derivan del libro) — empujón
  posible; el resto queda **[ABIERTO]**.
- **FRENO**: el calendario fiscal obliga a plazos → si no se avisa, se incumple. **EMPUJÓN**:
  **calendario-fiscal** (CUSTODIO: plazos declarables → dispara avisos vía el motor de avisos).
- **FRENO**: la salida al programa del asesor no es un canal existente. **EMPUJÓN**:
  **generador-modelo** (puerto de salida; el formato lo declara el asesor).
- **FRENO**: Verifactu/e-factura exigen **formato estructurado** y cadena inalterable. **EMPUJÓN**:
  **registro-verifactu** + **factura-electronica** — piezas construibles, pero su alcance es
  **[ABIERTO]** (`alcance_fiscal`).
- **FRENO**: sin bases/tipos declarados la liquidación mentiría (ley de cero supuestos). **EMPUJÓN**:
  **parametros-fiscales** declarables por el negocio/asesor.

### 3 · CONTRATO — ¿qué intercambia?
- **Recibe:** asientos y estados del núcleo/estados-cierre.
- **Produce:** liquidaciones, retenciones, modelos y registro Verifactu → los consume
  `revision-asesor`.
- **A cambio el conjunto gana:** la **dimensión fiscal** que hace "vendible" la contabilidad
  frente a un asesor.

### 4 · NO-OBJETIVOS — ¿qué NO hace?
- NO presenta el modelo (firma el asesor). NO digita datos fiscales. NO sustituye la asesoría
  fiscal (declara, no opina). NO inventa tipos ni bases: si faltan, `parametros-fiscales` [ABIERTO].

### 5 · PREGUNTAS ABIERTAS (cero supuestos)
- `alcance_fiscal` — ¿hasta dónde llega la capa fiscal? ¿qué modelos exactos (303/390/111/115/
  200…)? Es un mundo, no un módulo → **no se estima**.
- `recepcion_digital_facturas` — ¿Facturae / Verifactu / otro? ¿por qué canal?
- ¿Qué **bases y tipos** (IVA, retención IRPF) declara cada negocio? NO declarado.
- ¿El sistema **emite** facturas o sólo las **observa**? (el sujeto es observador → contradicción
  a resolver con el dueño)
- ¿Verifactu es obligatorio para todas las empresas del producto o sólo para algunas?

---

## FRENOS → EMPUJONES consolidados
1. **liquidacion-iva** — deriva IVA devengado/soportado del libro (reflejo).
2. **modelo-303 / modelo-390** — construyen el modelo desde la liquidación (reflejos).
3. **retenciones** — retenciones practicadas/soportadas (reflejo).
4. **estimacion-is-irpf** — estimación del resultado fiscal (reflejo; base declarada).
5. **calendario-fiscal** — plazos declarables → aviso proactivo (CUSTODIO).
6. **generador-modelo** — salida al programa del asesor (PUENTE).
7. **registro-verifactu** — huella/cadena inalterable de la facturación (CUSTODIO).
8. **factura-electronica** — formato estructurado (CONVERSOR).
9. **parametros-fiscales** — bases/tipos declarables (**[ABIERTO]** sin ellos, nada se estima).

## Lo que sale de ESTE punto
- `liquidacion-iva` — hoja atómica → disección
- `generador-modelo` — hoja atómica (puerto de salida) → disección
- `calendario-fiscal` — hoja atómica → disección
- `retenciones` — hoja atómica → disección
- `estimacion-is-irpf` — hoja atómica → disección
- `registro-verifactu` — hoja atómica (*alcance [ABIERTO]*) → disección
- `factura-electronica` — hoja atómica (*alcance [ABIERTO]*) → disección
- `alcance-fiscal` — **[ABIERTO]** (pregunta de F0)
- `parametros-fiscales` — **[ABIERTO]** (bases/tipos que declara cada negocio)

> Punto **SECO** en cuanto al prisma: lo que falta no es un sub-producto, es **dato del dueño**.
