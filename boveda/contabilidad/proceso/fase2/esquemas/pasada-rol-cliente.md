# PASADA · ROL: `cliente` (función interna: RECIBE · el negocio que usa la vertical)

> El ROL es la **función INTERNA** que el sistema debe servir. Aquí el ROL cliente es **el
> negocio que RECIBE la contabilidad** — el destinatario de los informes, estados y avisos.
> Doble filo declarado en F0: (a) el que **usa** la vertical para saber sus cuentas, y (b) si
> es vendible, **el que la compra** (producto multi-tenant: *"el NEGOCIO, no un dueño concreto"*).
> **Agnosticismo:** cero tecnologías. **Cero supuestos:** lo no declarado va `[ABIERTO]`.
>
> **Referencias cruzadas:** el árbol vive en `esquema.md` (grupo **K · PRODUCTO-SERVICIO**); no se
> duplica aquí.

---

## Prisma de los 5 huecos DESDE la silla del ROL cliente + LÓGICA que exige

### 1 · IDENTIDAD — ¿qué es la contabilidad para el ROL cliente?
**Lo que RECIBE y por lo que paga.** Para el cliente la contabilidad no es un proceso (trabajador)
ni un conjunto para decidir (jefe): es **un producto que le llega** — saberse sus cuentas sin
llevarlas, y recibir avisos cuando algo pasa. En su forma declarable de F0 (§5 requisitos del
dueño) el cliente exige **dos cosas que le llegan**:
- **`informacion_rica`** — *"contexto y profundidad, no un dato pelado"* → lo que recibe es un
  **informe rico**, no un número suelto.
- **`que_avise`** — *"proactiva: avisos, no una pantalla muda"* → lo que recibe es **aviso**, no
  pantalla que hay que ir a mirar.
Es decir: para el cliente la contabilidad es **un servicio que se sirve solo y avisa**, no una
app que hay que abrir a consultar. (Y en su forma vendible: un **producto** que se enciende por
config sobre cualquier negocio — F0: *"1 proyecto = N verticales; contabilidad = 1 vertical
activable por config"*.)

### 2 · RESTRICCIONES — ¿qué le limita al ROL cliente?
- **FRENO**: cada negocio es distinto (planes, impuestos, dimensiones) y el producto no puede
  nacer cableado a uno. → **EMPUJÓN**: **`alta-negocio`** / REF `onboarding-negocio` (K1) +
  REF `aislamiento-negocio` (I4) — multi-tenant sin fuga; lo particular se **declara**, no se
  programa.
- **FRENO**: la vertical existe pero no está encendida en el negocio. → **EMPUJÓN**: REF
  `activacion-vertical` (K4) — encender por config, sin obra.
- **FRENO**: si el aviso no llega, el cliente vuelve a la pantalla muda (falla el requisito 4).
  → **EMPUJÓN**: **`aviso-al-negocio`** (el aviso **entregado al negocio**, no sólo generado:
  el esquema tiene `motor-avisos` K2 que **produce**; falta la cara de **entrega/confirmación al
  cliente**) + REF `catalogo-avisos` (K6, `[ABIERTO]`).
- **FRENO**: *"no quiere que sea una herramienta de adorno"* (F0 §no_quiere) — el adorno es lo que
  se mira sin actuar. → **EMPUJÓN**: **`informe-accionable`** (todo informe que recibe el cliente
  lleva **qué hacer** con él; refuerza REF `informe-rico` K3 y lo hace accionable).
- **FRENO**: el cliente no lee un balance; necesita que se lo **cuenten**. → **EMPUJÓN**:
  **`narrador-estados`** (traduce balance/resultado a lenguaje de negocio comprensible para el
  cliente — REF `informe-rico` K3 bajo lente cliente; es la pieza que convierte "estado contable"
  en "esto es lo que te ha pasado y lo que viene").
- **FRENO**: el cliente debe **entregar/recibir el paquete** (qué sale del sistema hacia él y con
  qué frontera). → **EMPUJÓN**: REF `frontera-entrega` (K7, `[ABIERTO]`) — canal y forma de la
  entrega NO declarados.
- **FRENO**: si se vende, hay que saber **qué licencia tiene y qué puede hacer**. → **EMPUJÓN**:
  REF `modelo-licencia` (K8, `[ABIERTO]`) — NO declarado cómo se vende/limita.
- **FRENO**: `solape_marketing_budget` (H6) `[ABIERTO]` — el cliente puede estar recibiendo ya
  custodia contable de otra pieza; duplicar sería un producto que se contradice. → **EMPUJÓN**:
  resolver REF `solape-custodia-contable` (H6) antes de entregar. **PREGUNTA ABIERTA.**

### 3 · CONTRATO — qué espera VER y ACTUAR el ROL cliente
**CARA DE INTERFAZ (lo que alimenta las fases de interfaz):**
- **VER**: sus **estados explicados en su idioma** (resultado, caja, lo que debe y le deben);
  **informes ricos** con contexto (no un número pelado); **avisos proactivos** (no pantalla muda)
  con lo que exige su atención (vencimiento fiscal, cuadre que no cuadra, caja que aprieta);
  su **paquete de entrega** (qué informes/estados le corresponden).
- **ACTUAR**: **encender/activar** la vertical en su negocio; **declarar lo suyo** (identidad
  fiscal, plan, periodo — lo que el onboarding recoge); **confirmar/consumir** la entrega;
  **pedir/parametrizar** qué avisos quiere y por dónde (si es que quiere elegir — `[ABIERTO]`).
- **Recibe**: el producto funcionando **sobre sus hechos ya emitidos** (no tiene que meter nada a
  mano — promesa *"sin una persona digitando"*).
- **NO recibe**: el diario crudo ni la balanza técnica (eso es el asesor); el cuadro de decisión
  agregado (eso es el jefe, aunque puedan ser el mismo humano).

**LÓGICA DE DOMINIO que el rol cliente exige construir (lo que el interlocutor NO exige):**
el interlocutor externo `clientes` de F0 es **quien es facturado** (canal *facturación*). El ROL
cliente es distinto: es **el negocio que RECIBE el producto de contabilidad**. Su aporte es un
**plano de entrega** que no existe hoy: dar de alta al negocio, encender la vertical, y **servirle
informe + aviso de forma accionable y en su idioma**. Eso emerge como módulo/capacidad nueva.

### 4 · NO-OBJETIVOS del ROL cliente
- NO decide el futuro del negocio ni declara criterios → eso es el **jefe**.
- NO opera el pipeline ni desatasca la cola → eso es el **trabajador**.
- NO presenta impuestos ni firma → eso es el **asesor** (interlocutor + revisión).
- NO es el **interlocutor `clientes`** de F0 (el que es facturado por las ventas): el ROL cliente
  aquí es **el negocio que consume la contabilidad**, no la contraparte de una factura de venta.
- NO es el motor: **recibe**, no calcula.

### 5 · PREGUNTAS ABIERTAS del ROL cliente (cero supuestos)
1. **¿Qué informes/estados recibe exactamente y con qué forma?** `frontera-entrega` (K7) `[ABIERTO]`
   — NO declarado el canal ni la forma de la entrega al cliente.
2. **¿Qué avisos, a quién, por qué canal?** `catalogo_avisos` (K6) `[ABIERTO]` — el dueño exige
   *"que te avise"* pero **no declaró qué avisos, a quién ni por dónde**.
3. **¿El cliente es también el dueño del negocio, o un tercero (p.ej. el asesor que lo lleva)?**
   F0 dice *"el NEGOCIO, no un dueño concreto"* → ¿quién "es" el cliente en la práctica? NO
   declarado: decide si la cara del cliente y la del jefe se sirven a la misma silla o a dos.
4. **¿Cómo se vende? ¿Licencia por negocio, por uso, empaquetada con proyectos?** `modelo-licencia`
   (K8) `[ABIERTO]` — el carácter *VENDIBLE* está declarado, el **cómo** no.
5. **¿El cliente elige sus avisos o los recibe fijos?** NO declarado: decide si hay cara de
   parametrización de avisos por cliente.
6. **¿Se solapa con lo que ya custodia `marketing-budget`?** `solape_marketing_budget` (H6)
   `[ABIERTO]` — si hay solape, el cliente recibiría dos versiones de lo mismo.
7. **¿El cliente tiene voz post-entrega (confirma/valora) o sólo recibe?** NO declarado en F0
   (F0 no menciona feedback del negocio; el requisito es *"resuelve problemas de verdad"*, no
   *"recoge satisfacción"*). → **si no se declara, no se inventa**.

### FRENOS → EMPUJONES (consolidado del ROL cliente)
| Freno | Empujón |
|---|---|
| Cada negocio es distinto | REF `onboarding-negocio` (K1) + `aislamiento-negocio` (I4) |
| La vertical no está encendida | REF `activacion-vertical` (K4) |
| Aviso no entregado = pantalla muda | **`aviso-al-negocio`** (entrega/confirmación al cliente) — NUEVA |
| "Herramienta de adorno" | **`informe-accionable`** (todo informe trae qué hacer) — NUEVA |
| El cliente no lee un balance | **`narrador-estados`** (estados → lenguaje de negocio) — NUEVA |
| Frontera de entrega sin definir | REF `frontera-entrega` (K7) → **ABIERTO** |
| Cómo se vende, sin declarar | REF `modelo-licencia` (K8) → **ABIERTO** |
| Posible solape de custodia | REF `solape-custodia-contable` (H6) → **ABIERTO** |

## PIEZAS que emergen SOLO desde el ROL cliente → al árbol
- **`aviso-al-negocio`** — ATÓMICO (el aviso **entregado y confirmado** al negocio cliente; cara de
  **entrega** del aviso, complementa `motor-avisos` K2 que sólo **produce**). LÓGICA NUEVA.
- **`informe-accionable`** — ATÓMICO (el informe que recibe el cliente **lleva qué hacer**; refuerza
  `informe-rico` K3 y le quita el carácter de adorno). LÓGICA NUEVA.
- **`narrador-estados`** — ATÓMICO (traduce balance/resultado al **lenguaje del negocio cliente** —
  la pieza que hace rico y comprensible el informe para el cliente). LÓGICA NUEVA.
- **REF** (no se duplican): `onboarding-negocio` (K1) · `activacion-vertical` (K4) ·
  `informe-rico` (K3) · `motor-avisos` (K2) · `catalogo-avisos` (K6) · `frontera-entrega` (K7) ·
  `modelo-licencia` (K8) · `aislamiento-negocio` (I4) · `solape-custodia-contable` (H6).

> Punto **SECO** en la cara de interfaz. La **lógica de entrega** queda señalada como el hueco
> real del grupo K (dar de alta → encender → **servir informe + aviso accionable**), hoy cubierto
> sólo a medias: existe el motor de avisos y el informe rico, pero **no la cara de cliente** que
> los entrega confirmados y en su idioma.
