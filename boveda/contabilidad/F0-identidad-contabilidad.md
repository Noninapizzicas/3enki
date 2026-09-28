# FASE 0 — Documento de Identidad

**Sujeto:** Contabilidad (vertical de Enki)
**Estado:** con_identidad
**Declarada:** 2026-09-28
**Tipo derivado:** `capacidad_transversal_observadora_vendible` (emergente — no de catálogo)
**Método:** entrevista al dueño (10 preguntas de la skill `identidad-negocio` §2), una por una

---

## 1. Qué es

> "La vertical de contabilidad sería lo que le falta a otras verticales para llevar la
> contabilidad de cada cual."

Una **capacidad transversal observadora**: la pieza que **mira lo que ya pasó** y lo
convierte en contabilidad. **No produce hechos de negocio** — escucha los eventos que cada
negocio ya emite y, junto con el cierre, **reconstruye**: flujo de caja, ventas, consumo,
stock, compras.

## 2. El filo (por qué esto y no una app ya hecha)

> "Porque apuesto por el **event-driven** como camino para tener un **sistema vivo,
> actualizado, dinámico y funcional**."

Ésta es la motivación raíz, y es **arquitectónica, no de features**:

| App de contabilidad convencional | Contabilidad event-driven |
|---|---|
| se alimenta de **digitación o importación** | se alimenta de **hechos que ya ocurrieron** |
| es una **foto** que hay que ir actualizando | es un **sistema vivo** |
| queda **desfasada** hasta que alguien la pone al día | **actualizada** por construcción |
| rígida: cada cambio es trabajo manual | **dinámica** y **funcional** |

Y la diferencia con lo convencional, en palabras del dueño:

> "Sistemas donde era una persona la que metía los datos al ordenador en una db de
> ventas/compras. El nuevo paradigma puede automatizar todo el sistema, pero de tal modo
> que sea **realista y no llegue a colapsar o entrar en bucle**."

## 3. Qué ofrece y quién lo usa

> "No es eso... yo quiero una vertical de contabilidad **real y pura**, que nos dé **todo lo
> que nos pueda dar una app de contabilidad** — como si fuésemos a venderla, o la podríamos
> **vender junto con proyectos concretos**."
>
> "Lo usarán **todos los negocios que quieran saber sobre sus cuentas**."

- **Usuario:** el **negocio** — cualquiera que quiera saber de sus cuentas. Producto, no herramienta interna.
- **Alcance:** **completo**, el de una app de contabilidad profesional. **No** una versión mínima.
- **Comercialización:** vendible **sola** o **empaquetada con proyectos concretos**.

> **Corrección registrada:** una decisión anterior había fijado "gestión interna primero" y se
> leyó como *alcance mínimo*. El dueño lo corrigió: es **real, pura y completa**; "interna
> primero" era **orden de uso**, no recorte de alcance.

## 4. El propósito

> "Tenemos proyectos, muchos de ellos económicos [...] es interesante **enlazar todos los
> proyectos económicos con una muy buena contabilidad**; y una vez hecho esto, esta vertical
> es **mucho más sencillo llevarlo a cabo**."

- **Norte:** una **capa contable común** para **todos los proyectos económicos**.
- **Efecto de segundo orden:** se construye **UNA vez** y cada proyecto se engancha solo.
- **Pizzepos es el 1º.** No hace falta listar "los económicos": los enlaza quien quiere saber sus cuentas.

## 5. Un día normal

> "El ideal sería **ventas por el camino que hablamos** [los eventos], **digitalizar facturas
> o recibirlas digitales, procesarlas, actualizar stock** — o sea, **automatizar todo el proceso**."

El día normal **no tiene operador**: los hechos entran solos y la contabilidad se escribe sola.

| Entrada | Cómo llega | Qué dispara |
|---|---|---|
| **Ventas** | eventos de la operación (camino ya construido) | ingreso · caja · consumo |
| **Facturas de compra** | **digitalizadas** (OCR: `facturas`) **o recibidas digitales** | compra/gasto · entrada de stock · IVA soportado |
| **Stock** | derivado del consumo + las compras | se actualiza solo |

**Objetivo en una frase: AUTOMATIZAR TODO EL PROCESO.**

## 6. Cómo funciona (el motor)

**Enki** (event-driven, Node + MQTT). Contabilidad se activa como **1 vertical del proyecto**,
igual que `nonina` activa `pizzepos+prisma+tienda+www`.

### Los 3 cerrojos anti-bucle

> "...de tal modo que sea **realista y no llegue a colapsar o entrar en bucle**."

1. **Planos separados** — contabilidad emite **CÁLCULOS** (`contabilidad.*`), **nunca** hechos de negocio. No puede disparar la operación → no la realimenta.
2. **Un solo escritor por parcela** — patrón custodio.
3. **Idempotencia por clave natural** — **"un cierre = un asiento"**. Reprocesar no duplica.

### Aislamiento

Carpeta por proyecto: `data/projects/<slug>/contabilidad/...` (molde `inventario` + `PosPersistencia`).

### Las partidas

> "Dividirla en varias partidas sería aumentar su fuerza: ventas, compras, cuentas de gastos, escandallos."

Las partidas son **MÓDULOS dentro de la vertical** (no verticales separadas).
**Decisión del dueño** (2026-09-28): *"en una o varias verticales, todos los módulos son del
sistema y se comunican entre sí dentro y fuera de la vertical"* → la vertical **no es frontera
de comunicación**: es unidad de **organización y activación**.

**Decisión técnica (delegada por el dueño):** contabilidad se construye como **UNA sola
vertical** `contabilidad` con sus partidas dentro. Motivo: 1 vertical = 1 proceso F0→F7
(una rama, un plan, un `estado.json`); 8 verticales serían 8 procesos completos. Precedente:
nichos = 44 módulos en una vertical. **Salvaguarda:** si el plan de F3b desborda una vertical
(>70 hojas), se parte por **ejes de capacidad** (`nucleo` / `fiscal` / `analitica`).

## 7. Quiénes tocan el negocio (interlocutores — LISTA CERRADA)

> "**Asesor se mantiene.**" → la herramienta **NO sustituye al asesor**: automatiza el trabajo y
> el asesor revisa y firma.

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

**Consecuencias arquitectónicas del asesor (a respetar en fases siguientes):**
- **Salida legible y revisable** — el asesor puede validar (no caja negra).
- **Exportación / diálogo** con el programa del asesor (formatos contables estándar).
- El asesor **corrige** → camino de **asiento de ajuste** sin romper la trazabilidad.

## 8. La medida del éxito

> "Que **lo acepte y pueda presentarlo**." (el asesor)

No basta con que las cifras cuadren: contabilidad llega a funcionar cuando **el asesor la
acepta y puede presentarla**. Prueba de realidad de una app contable completa.

Combinado con lo ya declarado: **cuadra sin una persona digitando** y **sin colapsar ni entrar
en bucle**. → exige **cierre formal** (periodo/ejercicio), **estados presentables** y **camino
de ajuste**.

## 9. Los requisitos que exigió el dueño (de "qué NO quieres que sea")

> "Quiero que sea una herramienta que **ofrezca soluciones reales al usuario** — ya no por la
> comodidad en sí, sino porque **haga cosas simples y fáciles**, o **rica información que te avise**."

**NO quiere que sea:** herramienta **de adorno** · justificada por la **comodidad en sí** · una
versión **mínima/descafeinada**.

**SÍ exige — 4 requisitos de primera clase:**

| # | Requisito | Implica |
|---|---|---|
| 1 | **Soluciones reales al usuario** | resuelve problemas de verdad, no los muestra |
| 2 | **Simple y fácil** | lo difícil se hace simple |
| 3 | **Información rica** | contexto y profundidad, no un dato pelado |
| 4 | **Que te avise** | **proactiva**: avisos, no una pantalla muda |

> El requisito **4 (avisos)** es una **capacidad en sí** — con el asesor dentro, un aviso
> natural es *"esto no cuadra / esto necesita revisión"*.

## 10. Invariante de la casa

> "Donde hay un freno, hay una oportunidad. Buscamos alternativa; si no existe, se crea."

Se aterriza como: si una vertical **no** declara el dato que la reconstrucción necesita
(p. ej. el coste del consumo), **no se inventa** — se marca **pregunta abierta** y se crea la pieza que falte.

---

## Alcance declarado — el de una app contable REAL

> "Que nos dé **todo lo que nos pueda dar una app de contabilidad**."

| Bloque | Contenido |
|---|---|
| **Núcleo** | Partida doble · diario · mayor · plan contable |
| **Estados** | Balance de situación · cuenta de resultados |
| **Cierre** | Cierre de ejercicio · ajustes · periodificación |
| **Impuestos** | IVA (303/390) · IRPF/IS · retenciones · modelos |
| **Facturación** | Emisión · factura electrónica · **Verifactu** |
| **Tesorería** | Bancos · **conciliación bancaria** · previsión de caja |
| **Inmovilizado** | Altas · **amortizaciones** · bajas |
| **Personal** | **Nóminas** · seguros sociales |
| **Existencias** | **Inventario valorado** |
| **Grupo** | **Multi-sociedad · consolidación** |
| **Analítica** | Centros de coste · márgenes · presupuestos · desviaciones |
| **Producto** | Multi-tenant · licencias · onboarding · informes al cliente |
| **Servicio** | **Avisos** · información rica · simple y fácil |

⏳ **Frontera fina pendiente** — qué entra en la 1ª entrega y qué en siguientes.

---

## Reutiliza sin duplicar

- **`inventario`** → stock (ya es multi-proyecto)
- **`facturas`** → intake de compras por OCR
- **`escandallo`** → coste (**se pone por encima, no se toca**)

## Hallazgos verificados (contra el sistema real)

- **Fiscal en Enki = CERO** (IVA, Verifactu, factura electrónica, nóminas, inmovilizado, conciliación). `facturas` es solo OCR de intake.
- **`escandallo`** (pizzepos, 372 líneas, receta→coste) es **mono-negocio**: no basta tal cual para gran empresa/grupo (falta coste indirecto, multi-sociedad, periodos).
- **Dos lógicas de coste** coexisten: `pizzepos/escandallo` (receta) y `prisma/costeador` (compuestos).
- **`marketing-budget`** ya declara *"custodia contable"* → solape a decidir.
- **`marketing-*`** (12 reflejos puros) construido pero **no habilitado** en `config.json`.

---

## Preguntas abiertas (NO cerradas, NO inventadas)

| Campo | Para | Por qué sigue abierta |
|---|---|---|
| `cuando_reconstruye` | motor de reconstrucción (tiempo real / cierre / ambos) | el dueño no lo declaró |
| `unidad_de_cierre` | clave natural del asiento y periodo | "un cierre = un asiento" no define **qué es un cierre** |
| `fuente_coste_consumo` | coste del consumo → stock | ¿escandallo/recetas, o cada vertical declara ficha? |
| `alcance_fiscal` | dimensionar la capa fiscal | hoy CERO en Enki; es un mundo, no un módulo |
| `recepcion_digital_facturas` | facturas "recibidas digitales" | Facturae/Verifactu no existen hoy |
| `cola_revision` | qué pasa cuando la automatización no puede sola | ¿avisa al asesor? ¿cola de revisión? |
| `catalogo_avisos` | la capacidad de avisar | qué avisos · a quién · por qué canal |
| `vista_agregada` | ver todos los negocios juntos | consolidador lectura vs proyecto-oficina |
| `granularidad_de_grupo` | grupos / multi-sociedad | el dueño preguntó por grupo; escandallo no basta |
| `solape_marketing_budget` | ¿absorbe o lee? | `marketing-budget` ya declara custodia contable |
| `momento_de_uso` | ritmo de uso (día/mes/cierre) | el dueño no lo declaró |
| `frontera_primera_entrega` | qué entra en la 1ª entrega | alcance completo declarado; orden por decidir |
