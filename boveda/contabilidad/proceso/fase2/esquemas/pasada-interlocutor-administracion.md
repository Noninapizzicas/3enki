# PASADA · INTERLOCUTOR: `administracion`

> Actor externo-relacional del mapa **cerrado en F0** (`resumen.interlocutores[2]`).
> `rol`: **administracion** · `canal`: **presentación** · `relación`: **Hacienda (IVA/IS/IRPF) y
> Seguridad Social**.
> Es un actor **impersonal y normativo**: no negocia, no se da de alta, no se puede "puentear". Su
> relación con la contabilidad es de **obligación**: recibe la declaración en su formulario y su plazo,
> devuelve el justificante y puede exigir rectificación. Las piezas ya existentes se citan como **REF**.
> **Agnosticismo:** cero tecnologías. **Cero supuestos:** lo no declarado va `[ABIERTO]` (F0 ya marcó
> `alcance_fiscal` como **un mundo, no un módulo**).

---

## Prisma de los 5 huecos DESDE la silla de la administración

### 1 · IDENTIDAD — ¿qué es la contabilidad PARA la administración?
La **base declarable**: el origen del que salen IVA, IS/IRPF, retenciones y las obligaciones con la
Seguridad Social. A la administración no le interesa el resultado de gestión ni el margen: le interesa
el **devengo** (lo que se devenga, no lo que se cobra) y **lo que hay que ingresar, en qué formulario y
en qué plazo**. Para ella la contabilidad no es un espejo ni un borrador a firmar: es **la obligación y
su calendario**.

### 2 · RESTRICCIONES — ¿qué le limita a LA ADMINISTRACIÓN en esta relación?
- **FRENO**: la administración **no negocia** — sólo acepta por **su formulario, su formato y su plazo**.
  → **EMPUJÓN**: REF `generador-modelo` (D7) + REF `calendario-fiscal` (D6).
- **FRENO**: exige **registro no alterable y encadenado** (el registro de facturación no se borra; se
  encadena). → **EMPUJÓN**: REF `registro-verifactu` (D8); la inmutabilidad de la traza
  (REF `traza-asiento` B4) sostiene la exigencia.
- **FRENO**: un plazo perdido es sanción; los plazos **son inamovibles**. → **EMPUJÓN**:
  REF `calendario-fiscal` (D6, aviso proactivo) + **`estado-presentacion-fiscal`** (ciclo de vida de
  cada obligación: pendiente → generada → presentada → justificada → atrasada; sin este estado el
  calendario avisa pero nadie sabe **en qué punto** está cada modelo).
- **FRENO**: la declaración **vuelve**: la administración devuelve el **justificante** y, a veces,
  carta de pago → no basta emitir el modelo. → **EMPUJÓN**: **`acuse-presentacion`** (recoge y liga el
  justificante/acuse de vuelta a su modelo y a su asiento; cierra el bucle hacia fuera).
- **FRENO**: lo mal declarado **no se borra: se rectifica** (complementaria/sustitutiva); un asiento de
  ajuste interno **NO** es una rectificación fiscal. → **EMPUJÓN**: **`rectificacion-declaracion`**
  (camino de corrección POSTERIOR a la presentación, distinto del ajuste interno REF B5).
- **FRENO**: **no hay una sola administración** — estatal, foral, autonómica, Seguridad Social; una
  misma obligación cambia según territorio. → **EMPUJÓN**: **`perfil-administrativo`** (qué
  administraciones y qué obligaciones aplican a este negocio; contenido `[ABIERTO]` con D10/D11).
- **FRENO**: el IVA va por **devengo**, pero el hecho observado es el cobro/pago (caja). → **EMPUJÓN**:
  REF `liquidacion-iva` (D1) + REF `periodificacion` (C3) — el sistema debe poder separar devengo de
  caja para la administración.
- **FRENO**: retenciones (IRPF) y cotizaciones (SS) tienen **sujeto y plazo propios**, distintos de la
  venta. → **EMPUJÓN**: REF `retenciones` (D4) + REF `obligacion-seguridad-social` (G2).

### 3 · CONTRATO — qué intercambia (asimétrico: relación de obligación, no de beneficio)
- **DA** (la administración): el **marco** — formularios, plazos, tipos, régimen — y el **acuse** de lo
  presentado; ante error, la **exigencia de rectificación**.
- **RECIBE**: la **declaración** en su formato y en su plazo, con su base devengada y su registro íntegro.
- **Lo que el sistema gana**: **cero sorpresas fiscales** — nada se presenta tarde ni mal por falta de
  base; todo queda justificado y rectificable.

### 4 · NO-OBJETIVOS — qué NO quiere la administración
- NO quiere el **resultado de gestión** ni el margen: sólo la base y la obligación.
- NO acepta **formatos improvisados** ni declaraciones a medias (rechaza el dato incompleto).
- NO acepta **extemporaneidad sin recargo** ni corrige por sustitución silenciosa.
- NO es un destinatario al que se le presente "lo mejor posible": es un **validador** que devuelve
  **acuse o requerimiento**.

### 5 · PREGUNTAS ABIERTAS (cero supuestos — no se estima)
1. **`alcance_fiscal`** (D10) — ¿hasta dónde llega la capa fiscal (qué modelos)? Es un mundo, NO declarado.
2. **`recepcion_digital_facturas`** (A5/D9) — ¿por qué canal/formato llega o se emite la factura? NO declarado.
3. **Territorio** — ¿administración estatal, foral o autonómica? `[ABIERTO]` (nuevo `perfil-administrativo`).
4. **Régimen** — ¿IVA general, simplificado, recargo de equivalencia? NO declarado.
5. **Sujeto** — ¿IS (jurídica) o IRPF (física), o ambos? F0 nombra ambos; ¿cuál aplica a cada negocio? NO declarado.
6. **`parametros-fiscales`** (D11) — bases y tipos de cada negocio. NO declarado.
7. **Forma del acuse** — ¿qué justificante devuelve la administración y cómo se liga? NO declarado.
8. **Grado de automatización de la presentación** — ¿el sistema presenta, o sólo prepara para que
   presente el asesor? `[ABIERTO]` (frontera con el asesor — REF `flujo-firma` L3).

---

## FRENOS → EMPUJONES (consolidado de la administración)
| Freno | Empujón |
|---|---|
| No negocia: su formulario, su formato, su plazo | REF `generador-modelo` D7 + `calendario-fiscal` D6 |
| Exige registro no alterable y encadenado | REF `registro-verifactu` D8 (+ `traza-asiento` B4) |
| Plazos inamovibles | `estado-presentacion-fiscal` (REF `calendario-fiscal` D6) |
| La declaración vuelve con justificante | `acuse-presentacion` |
| Lo mal declarado se rectifica, no se borra | `rectificacion-declaracion` (≠ REF `asiento-ajuste` B5) |
| No hay una sola administración (territorio) | `perfil-administrativo` (contenido `[ABIERTO]`) |
| IVA por devengo ≠ caja | REF `liquidacion-iva` D1 + `periodificacion` C3 |
| Retenciones y cotizaciones con sujeto/plazo propios | REF `retenciones` D4 + `obligacion-seguridad-social` G2 |

## PIEZAS que emergen SOLO desde la administración → al árbol
- **`estado-presentacion-fiscal`** — ATÓMICO (ciclo de vida de cada obligación: pendiente / generada / presentada / justificada / atrasada). **LÓGICA NUEVA** (invisible desde la vista global, que sólo tiene el generador hacia fuera).
- **`acuse-presentacion`** — ATÓMICO (justificante/acuse de vuelta ligado a su modelo y a su asiento). **LÓGICA NUEVA** (el árbol emite modelos, pero nada recoge su retorno).
- **`rectificacion-declaracion`** — ATÓMICO (corrección posterior a la presentación: complementaria/sustitutiva). **LÓGICA NUEVA** (≠ ajuste interno B5).
- **`perfil-administrativo`** — ATÓMICO (qué administraciones y obligaciones aplican al negocio; territorio/régimen). **LÓGICA NUEVA** (≠ `parametros-fiscales` D11, que son tipos y bases).
- **REF** (no se duplican): `generador-modelo` D7 · `calendario-fiscal` D6 · `registro-verifactu` D8 · `liquidacion-iva` D1 · `modelo-303` D2 · `modelo-390` D3 · `retenciones` D4 · `estimacion-is-irpf` D5 · `factura-electronica` D9 · `periodificacion` C3 · `traza-asiento` B4 · `obligacion-seguridad-social` G2 · `flujo-firma` L3 · `alcance-fiscal` D10 · `parametros-fiscales` D11.

> Punto **SECO** salvo los `[ABIERTO]` (territorio/régimen/alcance: un mundo, se cierra con el dueño).
