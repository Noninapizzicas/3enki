# PASADA 2 · PUNTO: `personal` (nóminas · seguros sociales · retenciones de nómina)

> Bloque hoy inexistente. Entra por dos lados: el **hecho de nómina** (que puede llegar de otro
> sistema de personal) y el **documento** (recibo de nómina / boletín de cotización).

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD — ¿qué es el personal?
La parte de la contabilidad que trata **el trabajo como coste y como obligación**: la **nómina**
(sueldo bruto, retención IRPF, cotización del trabajador, neto a pagar), la **aportación de la
empresa** a la Seguridad Social, y las **retenciones** que la empresa ingresa por cuenta del
trabajador. Es contabilidad porque produce asientos: gasto de personal, obligación con la
Seguridad Social, obligación con Hacienda, pago de nómina.

### 2 · RESTRICCIONES — ¿qué le limita?
- **FRENO**: el sistema **no calcula nóminas** (no es una app de personal) → ¿las recibe hechas o
  las calcula? NO declarado. **EMPUJÓN**: **recibo-nomina** (admite el hecho hecho) +
  `calculo-nomina` **[ABIERTO]** (si el producto debe calcularlas — decisión del dueño).
- **FRENO**: la nómina llega como documento (recibo) o como hecho externo. **EMPUJÓN**:
  REF `conversion-documento-a-dato` aplicado a nómina.
- **FRENO**: la obligación con Seguridad Social y Hacienda tiene **plazo** mensual.
  **EMPUJÓN**: **obligacion-seguridad-social** + `calendario-fiscal` (REF) para avisar.
- **FRENO**: retenciones de nómina alimentan el modelo fiscal (111). **EMPUJÓN**: REF `retenciones`.

### 3 · CONTRATO — ¿qué intercambia?
- **Recibe:** hecho/recibo de nómina (puerto de origen: sistema de personal o documento).
- **Produce:** gasto de personal, obligaciones con Seguridad Social y Hacienda, pago de nómina →
  asiento (núcleo); retenciones → `capa-fiscal`.
- **A cambio el conjunto gana:** el **coste de personal completo** imputado.

### 4 · NO-OBJETIVOS — ¿qué NO hace?
- NO gestiona contratos, altas/bajas de trabajadores ni turnos (eso es gestión de personal, no
  contabilidad). NO calcula nóminas **salvo** que el dueño lo declare (`calculo-nomina` ABIERTO).

### 5 · PREGUNTAS ABIERTAS (cero supuestos)
- ¿El producto **calcula** las nóminas o sólo **recibe el hecho** de otro sistema? NO declarado.
- ¿De dónde vienen los datos de nómina (puerto concreto)? NO declarado.
- ¿Qué **convenio / tipos** de cotización aplican? NO declarado → no se estima.

---

## FRENOS → EMPUJONES consolidados
1. **recibo-nomina** — admite el hecho de nómina (hecho hecho o documento) → asiento.
2. **obligacion-seguridad-social** — gasto de empresa + obligación con la TGSS.
3. **asiento-personal** — gasto de personal, retención y pago (asiento equilibrado).
4. **puerto-nomina** — origen declarable del dato de nómina (si no existe, se crea).
5. **calculo-nomina** — **[ABIERTO]** (sólo si el dueño declara que el producto calcula nóminas).

## Lo que sale de ESTE punto
- `recibo-nomina` — hoja atómica → disección
- `obligacion-seguridad-social` — hoja atómica → disección
- `asiento-personal` — hoja atómica → disección
- `puerto-nomina` — hoja atómica → disección
- `calculo-nomina` — **[ABIERTO]** (¿calcula o sólo recibe?)

> Punto **SECO**.
