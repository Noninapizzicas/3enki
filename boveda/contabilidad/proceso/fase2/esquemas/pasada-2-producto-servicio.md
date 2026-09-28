# PASADA 2 · PUNTO: `producto-servicio` (multi-tenant · licencias · onboarding · informes · avisos)

> La cara **vendible** del sujeto: "vendible sola o empaquetada", "información rica", "que
> avise", "simple y fácil". Aquí el requisito 4 del dueño (**que avise**) es **una capacidad en
> sí**, no un extra.

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD — ¿qué es el producto-servicio?
La capa que hace que la contabilidad sea **producto**: **multi-tenant** (cada negocio con su
parcela aislada), **licencias/activación** (la vertical se activa por config), **onboarding**
(enganchar un negocio nuevo: su plan, sus fuentes, sus parámetros), **informes al cliente** y el
**motor de avisos** (proactivo, información rica, simple y fácil).

### 2 · RESTRICCIONES — ¿qué le limita?
- **FRENO**: cada negocio nuevo llega con datos sin declarar (`parametros-fiscales`,
  `politica-cobro-pago`, `dimensiones-analiticas`…). **EMPUJÓN**: **onboarding-negocio**
  (recoge los datos declarables; lo no declarado queda **[ABIERTO]**, no se estima).
- **FRENO**: "que avise" no tiene catálogo declarado. **EMPUJÓN**: **motor-avisos** (capacidad de
  avisar, construible) + **catalogo-avisos** **[ABIERTO]** (qué/quién/canal).
- **FRENO**: el dueño exige "información rica", no un dato pelado → el número solo no basta.
  **EMPUJÓN**: **informe-rico** (contexto + profundidad alrededor del dato).
- **FRENO**: multi-tenant sin fuga entre negocios. **EMPUJÓN**: REF `aislamiento-negocio`.
- **FRENO**: el alcance es completo y grande → `frontera_primera_entrega` no declarada.
  **EMPUJÓN**: `entrega-por-ejes` **[ABIERTO]** (orden por decidir).

### 3 · CONTRATO — ¿qué intercambia?
- **Recibe:** config del negocio (plan, fuentes, parámetros) y las señales internas que merecen aviso.
- **Produce:** avisos proactivos, informes ricos y consulta → al **negocio** y al **asesor**.
- **A cambio el conjunto gana:** que la contabilidad sea **usable y vendible** de verdad.

### 4 · NO-OBJETIVOS — ¿qué NO hace?
- NO es una pantalla muda (contradice el requisito 4). NO es adorno ni comodidad vacía.
- NO decide los avisos por su cuenta: los declara el dueño.

### 5 · PREGUNTAS ABIERTAS (cero supuestos)
- `catalogo_avisos` — ¿qué avisos, a quién y por qué canal? NO declarado.
- `frontera_primera_entrega` — ¿qué entra primero? NO declarado.
- `momento_de_uso` — ¿con qué ritmo se usa (día/mes/cierre)? NO declarado.
- ¿Licencias: cómo se vende (sola / empaquetada) y cómo se activa? Forma NO declarada.
- `vista_agregada` — enlaza con `grupo`.

---

## FRENOS → EMPUJONES consolidados
1. **onboarding-negocio** — engancha un negocio nuevo (plan, fuentes, parámetros) sin inventar datos.
2. **motor-avisos** — la capacidad proactiva (requisito 4 del dueño) como pieza propia.
3. **informe-rico** — entrega contexto y profundidad, no un número pelado (requisito 3).
4. **activacion-vertical** — la vertical se activa por config (vendible sola o empaquetada).
5. **aislamiento-negocio** — REF (`grupo`): multi-tenant sin fuga.

## Lo que sale de ESTE punto
- `onboarding-negocio` — hoja atómica → disección
- `motor-avisos` — hoja atómica → disección
- `informe-rico` — hoja atómica → disección
- `activacion-vertical` — hoja atómica → disección
- `aislamiento-negocio` — **REF** (ya en `grupo`)
- `catalogo-avisos` — **[ABIERTO]** (pregunta de F0)
- `frontera-entrega` — **[ABIERTO]** (pregunta de F0)
- `modelo-licencia` — **[ABIERTO]**

> Punto **SECO**.
