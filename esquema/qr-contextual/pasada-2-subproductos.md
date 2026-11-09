# Pasada 2 — prisma sobre cada sub-producto

Se pasa el prisma a los 11 sub-productos de la pasada 1. Se para al tocar
{atómico, abierto, repetido}.

---

## A · El soporte emitido

| Hueco | Contenido |
|---|---|
| IDENTIDAD | Una marca física única que representa un punto de consulta (mesa, cartel, ticket, vitrina) |
| RESTRICCIONES | Único e irrepetible; legible por cualquier lector; no cambia nunca |
| CONTRATO | Sabe: identificador, negocio, zona. Toca: estado (activo/pausado/retirado) |
| NO-OBJETIVOS | No sabe qué se sirve; no guarda la respuesta |

**Hojas:** `A1 identificador único` ATÓMICO · `A2 estado del soporte` ATÓMICO ·
`A3 zona asociada` ATÓMICO · `A4 imagen imprimible` ATÓMICO (genera el artefacto
físico) · `A5 catálogo de soportes por negocio` → **REPETIDO con J/I** (es la misma
colección que ve el dueño).

---

## B · El catálogo de lo servible

| Hueco | Contenido |
|---|---|
| IDENTIDAD | Conjunto de respuestas posibles que un soporte puede dar |
| RESTRICCIONES | Todo destino declarado debe ser alcanzable; un destino retirado no se sirve |
| CONTRATO | Sabe: nombre, tipo de destino, referencia, vigencia. Toca: alta/baja |
| NO-OBJETIVOS | No genera el contenido; no lo edita |

**Hojas:** `B1 destino declarado` ATÓMICO · `B2 resolución del destino` [PUERTO:
`resolver(referencia) → respuesta`] ATÓMICO · `B3 vigencia` ATÓMICO.

> Nota de agnosticismo: el destino puede ser interno o externo; el sujeto solo pide
> «resuélveme esta referencia». El adaptador concreto lo pone el sitio.

---

## C · El lenguaje de decisión

| Hueco | Contenido |
|---|---|
| IDENTIDAD | La forma en que el dueño declara «cuándo → entonces» sin programar |
| RESTRICCIONES | Debe ser validable (una regla mal declarada no puede romper el servicio); debe ser versionable |
| CONTRATO | Sabe: condición, resultado, prioridad, activa. Toca: alta, edición, pausa |
| NO-OBJETIVOS | No ejecuta; no conoce el contexto real |

**Hojas:** `C1 gramática de condición` ATÓMICO · `C2 gramática de resultado` ATÓMICO ·
`C3 prioridad y desempate` ATÓMICO · `C4 validación de regla` ATÓMICO ·
`C5 versionado y activación` ATÓMICO · `C6 colección de reglas por soporte` ATÓMICO.

---

## D · La lectura del contexto

| Hueco | Contenido |
|---|---|
| IDENTIDAD | Lo que se puede saber en el instante de la consulta |
| RESTRICCIONES | Solo se lee lo necesario; nada que identifique a una persona |
| CONTRATO | Devuelve un contexto: instante, zona, idioma, recurrencia, azar |
| NO-OBJETIVOS | No decide; no guarda |

**Hojas:** `D1 instante (hora y día)` ATÓMICO · `D2 zona` [PUERTO: `ubicar() → zona`]
ATÓMICO · `D3 idioma` ATÓMICO · `D4 recurrencia` → depende de G ·
`D5 azar con semilla` ATÓMICO · `D6 ensamblado del contexto` ATÓMICO.

---

## E · La recompensa

| Hueco | Contenido |
|---|---|
| IDENTIDAD | Un bien que el negocio entrega a cambio de nada, con coste acotado |
| RESTRICCIONES | No excede el coste autorizado; no se entrega dos veces el mismo derecho; caduca |
| CONTRATO | Sabe: premio, valor, probabilidad, tope diario, emitidos. Toca: catálogo y límites |
| NO-OBJETIVOS | No cobra; no identifica al premiado |

**Hojas:** `E1 catálogo de premios` ATÓMICO · `E2 probabilidad` ATÓMICO ·
`E3 tope y coste acumulado` ATÓMICO (**custodio**: es dinero) · `E4 derecho emitido`
ATÓMICO · `E5 consumo del derecho` ATÓMICO · `E6 caducidad` ATÓMICO.

---

## F · El registro de lo ocurrido

| Hueco | Contenido |
|---|---|
| IDENTIDAD | La memoria de cada consulta: qué se preguntó, qué se decidió, qué se sirvió |
| RESTRICCIONES | Solo se añade; nunca se reescribe; suficiente para explicar una decisión |
| CONTRATO | Sabe: soporte, contexto, regla ganadora, resultado, canje |
| NO-OBJETIVOS | No interpreta; no corrige el pasado |

**Hojas:** `F1 asiento de consulta` ATÓMICO · `F2 decisión ganadora` ATÓMICO ·
`F3 resultado servido` ATÓMICO · `F4 asiento de canje` ATÓMICO.

---

## G · La identidad anónima de la visita

| Hueco | Contenido |
|---|---|
| IDENTIDAD | Un seudónimo estable el tiempo suficiente para recordar una visita, sin decir quién es |
| RESTRICCIONES | No reversible a persona; caduca; no se comparte entre negocios |
| CONTRATO | Devuelve una huella; dice cuántas visitas lleva en la ventana |
| NO-OBJETIVOS | No autentica; no autoriza; no perfila gustos |

**Hojas:** `G1 huella` [PUERTO: `senal_dispositivo()`] ATÓMICO · `G2 ventana temporal`
ATÓMICO · `G3 contador de visitas` ATÓMICO · `G4 límite por huella` ATÓMICO.

---

## H · La lectura del negocio

| Hueco | Contenido |
|---|---|
| IDENTIDAD | La traducción de los asientos en respuestas útiles para el dueño |
| RESTRICCIONES | Solo agrega; nunca muestra a una persona; debe comparar periodos |
| CONTRATO | Devuelve: consultas, por franja, por zona, por regla, premios, canjes |
| NO-OBJETIVOS | No decide; no avisa (eso es J) |

**Hojas:** `H1 agregado por franja` ATÓMICO · `H2 agregado por zona` ATÓMICO ·
`H3 agregado por regla` ATÓMICO · `H4 embudo consulta→canje` ATÓMICO ·
`H5 comparación de periodos` ATÓMICO.

---

## I · El control del dueño

| Hueco | Contenido |
|---|---|
| IDENTIDAD | El lugar donde el dueño cambia lo que se sirve y ve lo que pasa |
| RESTRICCIONES | Un cambio no puede dejar el servicio sin respuesta válida; debe verse el efecto |
| CONTRATO | Expone: soportes, reglas, destinos, premios, métricas |
| NO-OBJETIVOS | No es el registro; no decide por sí mismo |

**Hojas:** `I1 superficie de cambio` [PUERTO: `presentar(vista)`] ATÓMICO ·
`I2 vista de estado` ATÓMICO · `I3 permiso de cambio` [ABIERTO: quién puede] ·
`I4 confirmación de efecto` ATÓMICO.

---

## J · El aviso

| Hueco | Contenido |
|---|---|
| IDENTIDAD | Lo que el dueño debe saber sin estar mirando |
| RESTRICCIONES | No puede convertirse en ruido; debe ser accionable |
| CONTRATO | Sabe: umbral, destinatario, motivo. Toca: activar/desactivar |
| NO-OBJETIVOS | No informa de todo; no sustituye al panel |

**Hojas:** `J1 umbral declarado` ATÓMICO · `J2 canal` [PUERTO: `entregar(mensaje)`]
ATÓMICO · `J3 plantilla de aviso` ATÓMICO · `J4 silencio y agrupación` ATÓMICO.

---

## K · La degradación

**ATÓMICO (ya lo era).** Regla dura, no órgano: si la decisión no puede completarse, se
sirve el destino base y se registra el fallo. No tiene 5 huecos porque no es un producto:
es una condición del contrato.

---

## L · El cobro

| Hueco | Contenido |
|---|---|
| IDENTIDAD | El derecho del negocio a usar el sujeto, renovado periódicamente |
| RESTRICCIONES | Un negocio impagado no puede seguir sirviendo con normalidad; el corte no puede romper los soportes ya impresos |
| CONTRATO | Sabe: plan, estado, periodo. Toca: alta, cambio, baja |
| NO-OBJETIVOS | No factura por uso; no mide personas |

**Hojas:** `L1 plan` [ABIERTO: precios] · `L2 alta del negocio` ATÓMICO ·
`L3 estado de pago` ATÓMICO · `L4 corte y aviso por impago` ATÓMICO.

---

## Recuento de la pasada 2

| Estado | Cuenta |
|---|---|
| ATÓMICO | 38 |
| ABIERTO | 2 (`I3`, `L1`) |
| REPETIDO | 1 (`A5`) |
| SPAWN restante | 0 |

**El prisma ha tocado suelo**: ninguna hoja nueva pare productos.
