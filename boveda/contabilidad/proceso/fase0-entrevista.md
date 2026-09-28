# F0 · Entrevista de identidad — CONTABILIDAD

> La F0 es una CONVERSACIÓN con el dueño, una pregunta por vez, esperando respuesta.
> Las 10 preguntas salen de la skill `identidad-negocio` §2 (camino de descubrimiento).
> Este fichero es el registro de la entrevista EN CURSO. No es el entregable.

**Entrevistador:** Tot (la mente) · **Entrevistado:** Paco (dueño)
**Fecha:** 2026-09-28

---

## ⚠️ CORRECCIÓN DEL DUEÑO (2026-09-28) — el alcance NO es mínimo

> "No, no es eso lo que te digo. Yo te doy con la intención y tú me has resumido, me has
> dejado más pequeña de lo que yo la quiero. **Yo quiero una vertical de contabilidad real
> y pura, que nos dé todo lo que nos pueda dar una app de contabilidad — como si fuésemos
> a venderla, o la podríamos vender junto con proyectos concretos.**"

**Corrige una decisión que se había dado por cerrada a la baja:**
- ❌ lo que yo había fijado: "gestión interna primero, con miras a capa fiscal" (leído como MÍNIMO)
- ✅ lo que declara el dueño: **contabilidad real, pura y COMPLETA** — el alcance de una app
  de contabilidad profesional, y **vendible** (sola o empaquetada con proyectos concretos)

La frontera NO la pone "lo que haga falta para uso interno". La pone **lo que da una app
de contabilidad de verdad**. El "interna primero" era orden de uso, no recorte de alcance.

---

## Camino de descubrimiento (10 preguntas, en orden)

### 1 · ¿Qué estás construyendo? — ✅ declarado
La vertical de contabilidad: **lo que le falta a otras verticales para llevar la contabilidad de cada cual.**
Capacidad transversal **observadora**: escucha los eventos que cada negocio ya emite y **reconstruye** su contabilidad.

### 2 · ¿Qué vendes o elaboras? — ✅ declarado (CORREGIDO)
**Una vertical de contabilidad real y pura** — con todo lo que da una app de contabilidad.
**Vendible**: sola, o **vendida junto con proyectos concretos**.
El "no es un negocio por sí misma" queda MATIZADO: como capacidad interna es observadora,
pero **como producto es completa y comercializable**.

### 3 · ¿Cómo funciona? (¿lo elaboras o lo compras hecho?) — ✅ declarado
**No elabora un hecho nuevo: observa y reconstruye.**
Toma los **eventos del día** que las verticales ya publican + el **cierre**, y de ahí deriva la contabilidad.
Diferencia con lo convencional: "antes una persona metía los datos al ordenador; el nuevo paradigma automatiza todo el sistema **pero sin colapsar ni entrar en bucle**."

### 4 · ¿Qué quieres conseguir con esto? (PROPÓSITO) — ✅ declarado
> "Tenemos proyectos, muchos de ellos económicos [...] es interesante **enlazar todos los proyectos económicos con una muy buena contabilidad**; y una vez hecho esto, esta vertical es **mucho más sencillo llevarlo a cabo**."

- **Norte:** una **capa contable común, completa y vendible** para **todos los proyectos económicos**.
- **Efecto de segundo orden:** se construye **UNA vez** y cada proyecto se engancha solo.
- **Pendiente:** **cuáles** son "los proyectos económicos" (¿lista? ¿criterio?).

### 5 · ¿Quién lo va a usar y en qué momento? — ✅ declarado
> "Lo usarán **todos los negocios que quieran saber sobre sus cuentas**."

- **Usuario = el NEGOCIO**, no el dueño de Enki. Cualquier negocio que quiera saber de sus cuentas.
- Esto confirma el encuadre de **producto multi-tenant** (no herramienta interna de un solo dueño).
- ⏳ Queda por precisar (no declarado): **en qué momento/ritmo** lo usa (¿al día, al mes, al cierre?).

### 6 · ¿Quiénes tocan tu negocio? (interlocutores) — ✅ declarado (lista cerrada)
> "**Asesor se mantiene.**"
> Es decir: la herramienta NO sustituye al asesor — **automatiza el trabajo y el asesor revisa/firma**
> (patrón de las apps contables reales). El asesor es un actor de primera clase, no un extra.

Actores que tocan el negocio (lista CERRADA — la F2 la consume sin descubrir actores nuevos):

| # | Actor | Rol / relación |
|---|---|---|
| 1 | **Dueño del negocio** | consulta sus cuentas, decide |
| 2 | **Asesor / contable** | revisa · corrige · **presenta impuestos** · firma |
| 3 | **Administración** | Hacienda (IVA/IS/IRPF) · Seguridad Social |
| 4 | **Clientes** | facturación de venta · cobros |
| 5 | **Proveedores** | facturación de compra · pagos |
| 6 | **Bancos** | extractos · conciliación · cobros/pagos |
| 7 | **Empleados** | nóminas |
| 8 | **Las otras verticales del sistema** | **fuente de datos**: emiten los hechos que contabilidad observa |

**Consecuencia técnica derivada (a respetar en las fases siguientes):**
- **Salida legible/revisable para el asesor** — cuadres y datos que él pueda validar (no caja negra).
- **Exportación / diálogo** con el programa del asesor (formatos contables estándar).
- El asesor **corrige**: debe existir el camino de "asiento de ajuste" sin romper la trazabilidad.

### 7 · ¿Qué tiene que pasar para decir "esto funciona"? — ✅ declarado
> "**Que lo acepte y pueda presentarlo**" (el asesor).

El criterio de éxito es exigente y **medible**: no basta con que las cifras cuadren —
la contabilidad tiene que llegar al punto en que **el asesor la acepta y puede presentarla**
(ante Hacienda, ante el cliente). Es la prueba de realidad de una app contable completa.

Combinado con lo ya declarado: **cuadra sin una persona digitando** y **sin colapsar ni entrar en bucle**.
Consecuencia: hace falta el **cierre formal** (ejercicio/periodo), los **estados presentables**
y el **camino de ajuste** del asesor — no solo métricas internas.

### 8 · ¿Cómo lo imaginas en un día normal? — ✅ declarado
> "El ideal sería **ventas por el camino que hablamos** [los eventos], **digitalizar facturas o
> recibirlas digitales, procesarlas, actualizar stock** — o sea **automatizar todo el proceso**."

El día normal **no tiene operador**: los hechos entran solos y la contabilidad se escribe sola.

| Entrada | Cómo llega | Qué dispara |
|---|---|---|
| **Ventas** | eventos de la operación (el camino ya construido) | ingreso · caja · consumo |
| **Facturas de compra** | **digitalizadas** (OCR del intake ya existente: `facturas`) **o recibidas digitales** | gasto/compra · entrada de stock · IVA soportado |
| **Stock** | derivado del consumo + las compras | se actualiza solo |

**Objetivo declarado, en una frase: AUTOMATIZAR TODO EL PROCESO.**

**Hallazgo que abre esta respuesta:** "recibirlas digitales" apunta a **factura electrónica / recepción
digital de facturas (Facturae, Verifactu)** — y hoy en Enki eso es **CERO** (verificado).
Ya existe el intake por OCR (`facturas`), pero NO la recepción digital ni el formato fiscal.
→ Se nombra como pieza a construir; no se inventa aquí.

⏳ Queda por precisar (no declarado): qué pasa cuando la automatización **no** puede resolver sola
(documento ilegible, dato que no cuadra) — ¿avisa al asesor? ¿queda en cola de revisión?

### 9 · ¿Qué NO quieres que sea? — ✅ declarado
> "Quiero que sea una herramienta que **ofrezca soluciones reales al usuario** — ya no por la
> comodidad en sí, sino porque **haga cosas simples y fáciles**, o **rica información que te avise**."

**NO quiere que sea:**
- una herramienta **de adorno** — que exista y se vea bien pero no resuelva nada
- algo justificado **por la comodidad en sí** (comodidad decorativa, no utilidad)
- una versión **mínima / descafeinada** (ya dicho antes)

**SÍ exige (requisitos positivos que salen de aquí):**
1. **SOLUCIONES REALES al usuario** — que resuelva problemas de verdad, no que los muestre.
2. **Simplicidad y facilidad** — que las cosas difíciles se hagan simples y fáciles.
3. **INFORMACIÓN RICA** — no un dato pelado: contexto, detalle, profundidad.
4. **QUE TE AVISE** — proactiva: alertas/avisos, no una pantalla muda que hay que ir a mirar.

→ El punto 4 es una capacidad en sí: **avisos** (¿a quién, de qué, por dónde?).
   Con el asesor dentro, un aviso natural es "esto no cuadra / esto necesita revisión".
   ⏳ Queda por precisar: catálogo de avisos y su canal.

### 10 · ¿Por qué esto y no otra cosa ya hecha? — ✅ declarado
> "Porque apuesto por el **event-driven** como camino para tener un **sistema vivo,
> actualizado, dinámico y funcional**."

**La motivación raíz es arquitectónica, no de features.** No es "una app contable mejor":
es que el sustrato event-driven **cambia la naturaleza del sistema contable**:

| Lo convencional (app de contabilidad) | Lo declarado (event-driven) |
|---|---|
| se alimenta de **digitación o importación** | se alimenta de **hechos que ya ocurrieron** |
| es una **foto** que hay que actualizar | es un **sistema vivo** |
| queda **desfasada** hasta que alguien la pone al día | **actualizado** por construcción |
| rígida: cada cambio es trabajo manual | **dinámico** y **funcional** |

**El filo declarado:** el event-driven es lo que permite que un sistema contable esté
**vivo** en vez de ser un registro que se rellena a posteriori.

---

## ✅ LAS 10 PREGUNTAS DEL CAMINO — COMPLETAS

| # | Pregunta | Respuesta del dueño |
|---|---|---|
| 1 | ¿Qué estás construyendo? | La vertical que le falta a las demás para llevar su contabilidad |
| 2 | ¿Qué vendes/elaboras? | **Contabilidad real y pura** — completa, **vendible** (sola o con proyectos) |
| 3 | ¿Cómo funciona? | Observa los eventos + el cierre y **reconstruye** (sin colapsar ni entrar en bucle) |
| 4 | ¿Qué quieres conseguir? (propósito) | **Enlazar todos los proyectos económicos** con una muy buena contabilidad |
| 5 | ¿Quién lo usa? | **Todos los negocios que quieran saber sobre sus cuentas** |
| 6 | ¿Quiénes tocan el negocio? | **Asesor se mantiene** + 8 actores (lista cerrada) |
| 7 | ¿Qué es "que funcione"? | **Que el asesor lo acepte y pueda presentarlo** |
| 8 | ¿Un día normal? | **Automatizar todo**: ventas por eventos · facturas digitales/OCR · stock |
| 9 | ¿Qué NO quieres? | **NO adorno**: soluciones reales · simple y fácil · info rica · **que avise** |
| 10 | ¿Por qué esto y no otra cosa? | **El event-driven** → sistema **vivo, actualizado, dinámico, funcional** |

**Los 3 campos del mínimo vital** quedan reforzados y con alcance COMPLETO (no mínimo).

---

## Campos del mínimo vital

| Campo | Estado |
|---|---|
| `que_es` | ✅ |
| `que_vende` | ✅ (completa y vendible) |
| `como_lo_elabora` | ✅ |
| `proposito` (hermano) | ✅ |
| `interlocutores[]` | ✅ **8 actores, lista cerrada** |
| `tipo_derivado` | ⏳ derivar al cerrar (emergente, no de lista) |
| `preguntas_abiertas[]` | 7 nombradas + las nuevas que abrió la entrevista |

---

## Alcance (a fijar con el dueño) — espectro de una app contable REAL

Dimensiones que dan la medida de "todo lo que da una app de contabilidad":
partida doble (diario/mayor) · plan contable · balance de situación · cuenta de resultados ·
cierre de ejercicio y ajustes · **IVA/impuestos** (303, 390, IRPF/IS, retenciones) ·
**facturación** (emisión, factura electrónica, Verifactu) · **tesorería y conciliación bancaria** ·
**inmovilizado y amortizaciones** · **nóminas** · **inventario valorado** · multi-sociedad/grupo
y consolidación · analítica (costes, márgenes, centros de coste, presupuestos) ·
**producto** (multi-tenant, licencias, onboarding, informes para el cliente).

⏳ Pendiente: dónde pone el dueño la frontera — y en qué orden se aborda.

---

## Campos del mínimo vital

| Campo | Estado |
|---|---|
| `que_es` | ✅ |
| `que_vende` | ✅ (corregido: completa y vendible) |
| `como_lo_elabora` | ✅ |
| `proposito` (hermano) | ✅ |
| `interlocutores[]` | ⏳ pendiente (pregunta 6) |
| `tipo_derivado` | ⏳ derivar al cerrar (emergente, no de lista) |
| `preguntas_abiertas[]` | 7 ya nombradas + las que salgan |
