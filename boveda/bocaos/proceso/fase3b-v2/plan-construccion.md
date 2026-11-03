# PLAN DE CONSTRUCCIÓN — Vertical **BOCAOS** · segunda versión, tres unidades

> **Proyecto:** `bocaos` · **Fase:** 3b · ADAPTADOR (traducir el diseño OOP a módulos-isla event-driven de Enki)
> **Worktree:** `/home/admin/3enki-bocaos` (rama `vertical/bocaos`) · **Contenedor:** `modules/bocaos/<slug>/`
>
> **Fuentes leídas (no de memoria):**
> - `proceso/fase3/esquemas/diseno-oop.md` — FASE 3 v2: **144 clases + R26 condicionada**, repartidas **N 25 · P 103 · T 16**, cada una con su forma y su unidad pegada a la pieza.
> - `proceso/fase2/esquemas/esquema.md` + 28 pasadas — FASE 2: 144 hojas, 18 renuncias, 14 puertos.
> - `F0-idea-global.md` §6, §7 y decisión C — la forma del despliegue: **una plaza = un despliegue; dentro, N proyectos**.
> - `proceso/fase3b-v1/plan-construccion.md` — la v1 (44 hojas). Se relee para no perder lo que estaba bien; se separa de ella donde la unidad obliga.
> - **Inventario REAL:** 376 `module.json` en `/home/admin/3enki/modules` (el repositorio ha crecido desde los 138 que contó la v1); **41 candidatos leídos a fondo** —`subscribes`/`publishes` reales y, en cuatro casos, el `index.js`—. Un módulo se juzga por su manifest, no por su nombre.
>
> **Resultado:** 145 bloques de clase → **68 hojas**: **64 CONSTRUIR · 3 ADAPTAR · 1 REUTILIZAR**.
> **Reparto por unidad:** **14 hojas en el nacional · 39 en la plaza · 15 en el proyecto de cada tienda**.
> **Formas:** 32 custodio · 15 puente · 14 reflejo · 5 micro-agente · 2 conversor.

---

## 0 · El hallazgo de esta fase (leer antes que nada)

El corte en tres unidades **no es una capa de organización: mueve clases**. En la v1 había un dueño
implícito —el mercado— y todo cabía en 44 hojas. Con el corte, **tres de aquellas fusiones dejan de ser
posibles**, no porque el negocio haya cambiado, sino porque la misma clase ya no vive en el mismo sitio:

| La v1 tenía | La v2 tiene | Por qué ya no se puede fundir |
|---|---|---|
| `hora-listo` = **C04 + A01** | `tienda-hora-listo` (C04, T) + `hecho-listo` (A01, P) | C04 lo escribe **la tienda en su proyecto**; A01 lo anota **la plaza** con su sello. Dos escritores, dos almacenes, dos unidades. |
| `aviso-cliente` = **C06 + K01 + K02** | `tienda-aviso-cliente` (C06) + `tienda-reclamacion` (K01) + `escaparate` (K02) | K02 es **P** en el diseño: la marca que hay que ocultar es la de la plaza y la del nacional, y **la tienda no puede vigilar una marca que no conoce**. |
| `tarifa-pedido` = **E01+E02+E03+E07** | `tarifa-pedido` (E01,E03,E07) + `tienda-incentivo` (E02) | El incentivo es **de la tienda** (su única palanca económica, E02). La plaza lo **suma**, no lo pone. |
| `escaparate` = **D06 + D07** | `tienda-radio` (D06) + `escaparate` (D07,D08,K02) + `frontera-plaza` (S01,S02) | La radio la declara **la tienda**; la cobertura, **la plaza**; el índice es la **intersección**. Tres objetos, tres dueños. |
| 8 hojas de tienda dentro del bloque de la plaza | **15 hojas `tienda-*`** en el proyecto de cada tienda | Las 16 clases **T** del diseño son objetos **por tienda**. En la v1 eran «del mercado» porque el mercado era uno. |
| 0 hojas de nacional | **14 hojas `fed-*`**, y **0 desplegadas con una sola plaza** | El nacional no existía en la v1. Son **26 clases nuevas** (R01…R26). |

Y **tres piezas que no son clases y ahora son hojas**, porque son las flechas de §1.3 del diseño, y una
flecha que no se materializa no se puede auditar:

```text
publicacion     (P→N)  la puerta de la plaza hacia arriba: publica los CUATRO hechos que cruzan
fed-buzon       (N)    la puerta del nacional: acepta cuatro formas y RECHAZA la quinta
fed-aviso       (N→P)  la única flecha que baja: dos avisos, los dos ignorables
```

**El recuento, y por qué no es inflación.** 44 → 68 hojas (+24). De esas 24: **14 son el nacional**,
**7 son tienda** que en la v1 estaban fundidas con la plaza, y **3 son flechas**. Ninguna es una clase
partida en dos. La prueba: hay **145 bloques de clase y 68 hojas → 2,1 clases por hoja**; la v1 tenía 2,6.
El corte no multiplica módulos por gusto: **reparte los que ya había entre tres sitios y añade las puertas
que antes no hacían falta porque sólo había una casa**.

**Y el hallazgo que ahorra medio plan:** el corte de la F0 §7 —una plaza = un despliegue, N proyectos
dentro— es exactamente lo que los módulos de `pizzepos/*` ya saben hacer («una tienda por proyecto»).
Lo que en la v1 era una objeción («Bocaos necesita N tiendas en un proyecto y esos módulos no lo hacen»)
**desaparece**: ahora cada tienda **es** un proyecto. Eso cierra la deuda 1 de la v1 (§1.2) y cambia por
completo la evaluación de reutilización (§3).

---

## 1 · Las tres unidades como tres despliegues

| | **NACIONAL** | **PLAZA** | **TIENDA** |
|---|---|---|---|
| despliegues | 0 ó 1 en todo Bocaos | **1 por plaza** | **0**: no es un despliegue |
| `project_id` | `bocaos-nacional` | `plaza-<slug>` | `tienda-<id>` — **N proyectos dentro del despliegue de la plaza** |
| módulos | **14** (`fed-*`) | **39** (38 propias + `scheduler`, que es de Enki) | **15** (`tienda-*`), los mismos para todas las tiendas |
| almacén | `/bocaos/fed-*.json` en su proyecto | `/bocaos/*.json` en el proyecto de la plaza | `/bocaos/tienda-*.json` en el proyecto de la tienda |
| se enciende | **con la 2ª plaza operando** | al abrir la plaza | al dar de alta la tienda (I01 **crea el proyecto**) |
| verbo propio | **registrar** | **decidir, medir, cobrar** | **actuar y firmar** |
| puede | anotar, buscar, sumar, avisar, licenciar | proponer, aceptar, medir, adjudicar, devengar, cobrar | publicar, pedir, declarar listo, subir incentivo, reclamar |
| no puede | ver un pedido · cobrar salvo el canon · sancionar · ordenar · entender (0 conversores, 0 agentes) | tener marca de cliente · tener carta · hablar con otra plaza | ver a otra tienda · ver al nacional · tener riders · fijar la ventana |

**La proporción, en clases y en módulos** (no es la misma, y conviene saber por qué):

```text
por CLASES   N 25 (17 %)  ·  P 103 (72 %)  ·  T 16 (11 %)     ← el argumento del diseño
por MÓDULOS  N 14 (21 %)  ·  P 39 (57 %)  ·  T 15 (22 %)      ← este plano
```

La tienda sube en módulos porque sus 16 clases son 16 objetos que el dueño ve y toca, uno por uno: no hay
dónde fundirlos sin que un dueño acabe escribiendo en el almacén de otro. La plaza baja en módulos porque
es donde de verdad se puede fundir: 20 clases del cuello son **una** hoja (§2, regla 1).

### 1.1 · El nacional no existe con una sola plaza — y por eso se construye y no se despliega

```text
CON UNA PLAZA     se construyen las 14 hojas `fed-*` y NO se enciende ninguna.
                  `fed-padron.abrir`   → SIN_SUJETO (no se abre un padrón de una fila)
                  `fed-canon.documento`→ NO_HAY (no hay sujeto pasivo: decisión C)
                  la primera plaza escribe su ACTA DE CONSTITUCIÓN y se busca en su propio
                  índice (`escaparate`), no en `fed-buscador`

CON DOS PLAZAS    el nacional NACE POR ARITMÉTICA: la segunda plaza pasa a `operando`,
                  se abre el padrón y adopta la primera. Nadie «lanza el nacional».
```

Esto tiene una consecuencia de obra que el diseño dice y este plano obedece: **el nacional va el último**
(peldaños 55–68 del §8). No porque sea difícil, sino porque **construirlo antes es construir el sitio donde
luego se mete lo que no debe**. Un módulo `fed-*` encendido con una plaza es un módulo sin sujeto y con
tentaciones.

### 1.2 · «N proyectos dentro de un despliegue»: la prueba técnica (verificada en el código, no supuesta)

La v1 dejó esto como **deuda 1**: «multi-tienda dentro de un proyecto es una decisión de arquitectura que la
F3 no tomó». La F0 §7 la tomó —**una plaza = un despliegue, dentro N proyectos**— y aquí se comprueba que
Enki lo soporta **hoy**, leyendo el código:

```text
1 · modules/_shared/pos-persistencia.js
    flush()      → fs.write.request { project_id, path, atomic:true }   ← el snapshot va POR PROYECTO
    restaurar(p) → _leerJson(project_id, path)                          ← se hidrata POR PROYECTO
    «snapshot por proyecto del estado vivo de un reflejo»: una instancia de módulo mantiene el
    estado de N proyectos y lo aísla por project_id. Es exactamente lo que la tienda necesita.

2 · modules/filesystem/index.js (línea 97, comentario del propio módulo)
    «Multi-tenant REAL: el project_id de CADA petición manda sobre el proyecto activo global.»
    _selfHealProject(): si el id no está en el índice pero `projects/<id>/` EXISTE en disco, lo
    indexa y lo usa → una tienda dada de alta DESPUÉS del arranque resuelve en su primer write.

3 · modules/project-manager (v4.2.0)
    es la fuente de verdad del mapa (`project.list.response`) e hidrata a `filesystem` al arrancar.
    Dar de alta una tienda = crear un proyecto. No hay un segundo registro de tiendas.

4 · core/modules/loader.js
    lee `modules/<x>/module.json` y, si no hay manifest, UN nivel más (`modules/pizzepos/<x>`).
    DOS niveles, no tres → la unidad NO cabe en la ruta (`modules/bocaos/plaza/x` no se cargaría).
```

**Consecuencia de nombrado, y no es cosmética.** Como el loader no deja poner la unidad en el path, la
unidad vive en **cuatro** sitios, y los cuatro son comprobables:

```text
1 · el PREFIJO del nombre     fed-*  (nacional)  ·  tienda-*  (tienda)  ·  sin prefijo (plaza)
2 · el campo del manifest     "unidad": "nacional" | "plaza" | "tienda"
3 · la lista de habilitados   del despliegue: un nacional no enciende `enlace`; una plaza no enciende `fed-*`
4 · el SELLO de cada fila     plaza_id / tienda_id escritos por el módulo (§1.3)
```

Los cuatro se auditan con un `grep` y un `jq`. Ninguno depende de que alguien se acuerde.

### 1.3 · La frontera DENTRO de un despliegue: la flecha que no es una red

De las cuatro flechas de §1.3 del diseño, **tres son redes y una es código**:

```text
P ↔ P′   RED      dos despliegues distintos. No hay bus entre ellos: la frontera es física.
P ↔ N    RED      dos despliegues (o dos brokers). El puente es un puerto, no un puntero.
N → P    RED      `plaza.suspendida` y `version.nueva` cruzan por el puerto Publicación.
T → P    CÓDIGO   15 módulos de tienda y 39 de plaza comparten UN bus, UN despliegue y UN proceso
                  de carga. La flecha NO la impone la red: la impone el código que escribe.
```

**Aquí es donde puede fallar la auditoría 3**, y por eso se escribe ahora y no en la F4:

> **La ley del sello.** Ningún módulo copia el `plaza_id` ni el `tienda_id` del payload. El `plaza_id` se
> toma de la configuración del despliegue; el `tienda_id` se **resuelve del almacén del dueño** (el pedido,
> el alta, el contrato). Un módulo de tienda que mande el id de otra tienda obtiene **su propia fila**,
> porque el id no viene de quien llama. Sin esta ley, la flecha T→P es una convención, y una convención se
> rompe el día que alguien reutiliza un handler.

Esto también acota la lectura plaza→tienda, que el diseño ya usa en A02 (la vista compone con
`PuntualidadDeclarada.de(tienda)`): **la plaza puede leer lo que la tienda PUBLICA** —radio (D06),
puntualidad (L03), incentivo (E02), hecho de listo (C04)— y **nunca** su marca interna, su catálogo, su
carrito ni sus clientes. La lista es corta y cerrada; si crece, el mercado está leyendo el negocio de
alguien.

---

## 2 · Las reglas de traducción, con la ley que añade el corte

Se aplican las dos reglas de la v1 —y la excepción que las hace útiles— **más una tercera**, que es la de
esta versión:

```text
REGLA 1   una clase que sólo calcula es una PROYECCIÓN INTERNA de la hoja que la usa
          (jamás un helper en _shared/: la lógica de dominio vive dentro de la isla)

REGLA 1b  una clase que sólo calcula SUBE a hoja propia únicamente si
          (a) el MISMO número lo necesitan varias hojas y no se pueden permitir dos cifras
              (L01: «la misma información que ve el rider, misma fuente, mismo número»), o
          (b) la pureza de la decisión exige separar la composición del mundo de la decisión
              (A03: «dentro de F nadie lee el mundo»).
          En cualquier otro caso es PROYECCIÓN INTERNA.

REGLA 2   un objeto tiene UN solo escritor.
          Si dos clases del diseño escriben el MISMO objeto, son UNA hoja.

REGLA 3   una hoja corre en UNA unidad.
          Si dos unidades necesitan el mismo objeto, el objeto tiene UN dueño y la otra unidad
          lo pide por EVENTO. Una hoja que «sirve a las dos» es una hoja que escribe en dos
          almacenes y ninguna de las dos sabe cuál manda.
```

La regla 3 es la que produce el plano nuevo: no cambia la forma de ninguna clase, **cambia de sitio a siete
hojas** y **parte tres fusiones** (§0). Y la regla 2 sigue mandando donde más duele: el cuello.

**Las 145 clases del diseño, por forma, y dónde aterrizan:**

| Forma del diseño | Clases | Aterrizan en | Hojas resultantes |
|---|---|---|---|
| CUSTODIO | 50 | módulo CUSTODIO (single-writer + `_shared/pos-persistencia`) | **32** hojas (varias escriben el mismo objeto → se funden, regla 2) |
| REFLEJO | 75 | proyección interna de la hoja que lo usa; sube a hoja si (a) el número lo necesitan varias hojas o (b) la decisión debe ser pura | **14** hojas reflejo + **212** proyecciones internas |
| PUENTE | 13 | módulo PUENTE | **15** hojas (dos son flechas sin clase: `publicacion` y `fed-aviso`) |
| CONVERSOR | 3 | módulo CONVERSOR | **2** hojas |
| AGENTE (FUZZY) | 3 | módulo MICRO-AGENTE (híbrido con blueprint) | **3** hojas + 2 orquestadores (`enlace`, `scheduler`) |

**Las tres fusiones que la regla 2 impone, y que el corte respeta:**

| Objeto que se escribe | Clases del diseño | Hoja | Unidad |
|---|---|---|---|
| la propuesta y su desenlace | A13 · A14 · A15 · A19 (+ A27/A29/A33/M05 como proyecciones) | `propuesta` | plaza |
| el padrón y el estado de una plaza | R01 · R02 · R03 (+ R04) | `fed-padron` | nacional |
| el permiso, su traza y su caducidad | R19 · R20 · R21 | `fed-acceso` | nacional |
| el censo y lo declarado por la parte | I01 · I02 · M02 · M03 (+ P04) | `censo-parte` | plaza |
| el trayecto vivo del rider | B01 · B03 · B05 (+ B02/B04/B06) | `ruta-viva` | plaza |
| los hechos del reparto y su prueba | F01 · F02 (+ F03) | `hechos-reparto` | plaza |
| el dinero de la coordinación | H01 · H02 · H05 (+ E04/E05 y las guardas A32/H06) | `liquidacion` | plaza |
| la cuenta de una parte | Q01 · M01 | `cuenta-parte` | plaza |
| la única cola de lo atascado | P01 · P02 (+ O03) | `cola-sala` | plaza |
| el precio del reparto de un pedido | E01 · E03 · E07 | `tarifa-pedido` | plaza |
| la marca del nacional y su licencia | R16 · R17 | `fed-marca` | nacional |
| **el hecho de «listo»** | **A01 y C04 — y aquí NO se funden** | `hecho-listo` (A01) + `tienda-hora-listo` (C04) | **plaza + tienda** |

La última fila es la que explica toda la fase: la regla 2 dice «un objeto, un escritor», pero **el objeto
«listo» tiene dos**: la declaración (C04, de la tienda, con su autor) y el hecho anotado (A01, de la plaza,
con su sello). En la v1 se fundían porque no había dos sitios donde escribirse. Ahora hay dos, y fundirlas
obligaría a que el sello de la plaza lo pusiera un módulo que corre en el proyecto de la tienda — es decir,
a que la tienda se sellara a sí misma.

**Tópicos del bus en ASCII** (`bocaos.propuesta_caducada_sin_acuse`, `bocaos.hueco_nombrado`,
`bocaos.federacion_tienda_censada`). **Todo flujo cierra su círculo**: cada RPC tiene su `.failed`, cada
hecho su par de fallo (`bocaos.aviso_cliente_fallido`, `bocaos.cobro_fallido`, `bocaos.escalada_agotada`,
`bocaos.acta_incompleta`, `bocaos.censo_incompleto`, `bocaos.aviso_sala_vencido`,
`bocaos.federacion_hecho_rechazado`, `bocaos.redaccion_rechazada`, `bocaos.resumen_rechazado`). La única
excepción está declarada y razonada en `publicacion` (§9): **un emisor que anuncia entrega miente**.

---

## 3 · Inventario real: REUTILIZAR · ADAPTAR · CONSTRUIR

> 68 hojas: **64 CONSTRUIR · 3 ADAPTAR · 1 REUTILIZAR**. Cada decisión se tomó contra el `module.json` real,
> y las tres ADAPTAR se comprobaron también en su `index.js` cuando el manifest prometía más que el contrato.

### 3.1 · REUTILIZAR (1 hoja) y la infraestructura que no es hoja

| hoja | módulo real | por qué encaja su contrato |
|---|---|---|
| `scheduler` | `modules/scheduler` v1.0.0 | Publica `scheduler.job.triggered` / `.completed` / `.failed` y acepta cron/interval/datetime/evento. `liquidacion` necesita exactamente eso para el ciclo semanal, y `publicacion` para el latido de `plaza.viva`. Se le crean dos jobs en `project.activated` y cada consumidor filtra por nombre. |

Infraestructura declarada (no son hojas, no tienen clase en el diseño): `_shared/modulo-hibrido-reflejo`,
`_shared/pos-persistencia`, `filesystem`, `project-manager`, `credential-manager`, `metricas`. Van en el
`reutiliza` de cada hoja que las usa.

### 3.2 · ADAPTAR (3 hojas, las tres en unidades distintas)

| hoja | unidad | módulo real | qué se adapta |
|---|---|---|---|
| `tienda-aviso-cliente` (C06) | tienda | `whatsapp-bot` v1.5.0 | Ya tiene webhook y credencial **por proyecto** —y ahora una tienda **es** un proyecto—, plantillas aprobadas y el par honesto `whatsapp.mensaje.enviado` / `whatsapp.envio.fallido`. Se le añade **plantilla por tienda** y el **validador K02** en la salida (ninguna comunicación al cliente final lleva la marca de Bocaos, de la plaza ni del nacional). |
| `canal-rider` (M04) | plaza | `telegram-bridge` v1.0.3 | Ya entrega por proyecto y devuelve `telegram.callback.received`, que es el acuse / el sí / el no. Se le añade el contrato de M04: **acuse obligatorio**, ventana de validez y retirada a los 5 s (Q42). El transporte queda intercambiable (`whatsapp-bot` con botones sirve el mismo contrato); la pieza crítica es el contrato, no el canal. |
| `cobro-gestion` (H04) | plaza | `pago-gateway` v3.1.0 | Ya cobra por proyecto con credencial y conciliación: `pago.iniciar`, `pago.cobrar_guardada`, `pago.reader.*` (datáfono), `pago.confirmado`, `pago.reembolsado`, `pago.importe_discrepante`. Se le añade **`revertir`** (`transfer_reversal` sobre la cuenta conectada, Q29) y el canal **por parte**. NO se reutiliza su libro de cobros como libro de Bocaos: la cuota tiene su propio cierre inmutable. |

### 3.3 · CONSTRUIR (64) y los «se acerca pero…» que se descartaron

| Candidato real | Por qué NO se reutiliza / adapta |
|---|---|
| `pizzepos/carta-digital` v2.25.1 | Proyecta la carta de **otro vertical** (tarifas + carta-manager + contenido) y la sirve por su cf-worker. La carta de una tienda Bocaos sale de **su** catálogo por el puerto Catálogo. Se toma el patrón (proyectar al vuelo, no guardar copia). **Corrección importante:** con una tienda = un proyecto, su limitación de la v1 («una carta por proyecto») **ya no aplica**; lo que sigue sin encajar es el *sujeto* (pizzepos) y las cuatro dependencias que arrastra. |
| `pizzepos/productos` v5.3.2 | Proyector sin estado de la carta **en formato POS**, una por proyecto. Es el proveedor natural del puerto Catálogo de una tienda que corra pizzepos; no es la hoja `tienda-carta`, que poda para el cliente final. |
| `pizzepos/pedidos` v3.6.0 (`tipo='tienda'`) | Es el pedido **de la tienda** (su cuenta, su cocina, su TPV). El pedido del mercado necesita tres cosas que no tiene: precio de reparto **congelado** al nacer, la **aceptación de la tienda** (Q27) como transición con hecho, y el **estado podado** para el cliente (C05). El id del pedido de la tienda es la clave de unión. |
| `pizzepos/notificador-pedidos` | Orquesta avisos al staff por canal. Es un **proveedor del puerto** de `aviso-tienda` (C03), no la hoja: no sabe de mercados ni de propuestas. |
| `prisma/carrito` v0.2.0 | **Corrección a la v1**: su objeción («un carrito por proyecto, y esto es multi-tienda») ya no vale, porque cada tienda es un proyecto. La que vale es otra: es un **buffer en memoria** con clave `cuenta_id`; D04 es un **custodio** con clave `(cliente, tienda)` que sobrevive al reinicio. Se construye. |
| `estados` v0.4.0 | Lista genérica con orden libre/estricto. `C02` es una **tabla cerrada** donde ninguna transición existe sin un hecho con hora y un estado no se corrige: se avanza. Se toma el patrón (single-writer, JSON por proyecto). |
| `cola` v0.1.0 | Cola de impresión 3D (FIFO + urgencia, hardcodeada a GCODE). Mismo patrón que `cola-sala`, **otro dominio**. No se adapta: rompería su proyecto. |
| `historial` v0.1.0 | Append-only de impresiones del taller. Mismo patrón que `hechos-reparto`, otra clave y otro dominio. |
| `interfaz` v0.1.0 | Superficie del radar de nichos (`interfaz.veredicto_confirmado`). `cola-sala`, `panel-tienda` y `salud-mercado` son otra cosa. |
| `metricas` v2.0.0 | Instrumentación pasiva del bus (counters, gauges, timings de `*.creado`). `salud-mercado` mide el **negocio**. `metricas` entra como base de observabilidad, no como hoja. |
| `chat-p2p` v1.0.0 | Chat agentes↔agentes sobre el circuito de conversación. `chat-enmascarado` es rider↔cliente con alias por contrato y **cero** agregados sobre conversaciones (art. 15). |
| `apis-publicas`, `cantera-semantica` | Índices que **rankean por relevancia**: exactamente lo que R11 prohíbe en el buscador nacional. Se toma el patrón de índice barato, no el módulo. |
| `entrega`, `agenda-operacion` (the-pirate) | **No se tocan.** Otro vertical. `entrega` estima tiempos y guarda un radio de reparto propio; aquí no hay rider, ni contrato vivo, ni promesa. |
| `project-profile`, `calendario`, `lotes`, `inventario`, `catalogo` | Otros dominios (perfil de proyecto, calendario fiscal, lotes, stock, biblioteca 3D). Ninguno tiene el eje de Bocaos. |
| `contabilidad-fiscal/factura-electronica`, `facturacion/*` | Series y formatos españoles con sujeto «proyecto contable». Se usan como **proveedor del puerto Documento** de `factura-gestion`, no como hoja. |

---

## 4 · La ley de la unidad: las 145 clases, una por una

> **145 / 145.** Cada clase del diseño aparece en **una** hoja, y en la unidad que el diseño le puso.
> `K03` (`TransparenciaDelEnlace`) y `M06` siguen **sin clase** por decisión del propio diseño (no se sabe si
> existen; Q15/Q20). `R26` (`CanonDePlaza`) es la única condicionada: existe como hoja y **no se despliega**
> hasta la segunda plaza. Los tres contenedores (`Nacional`, `Plaza`, `ProyectoDeTienda`) no son clases.

### Grupo R · federacion (26) — NACIONAL 26

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `R01` | RegistroDePlazas | CUSTODIO · N | `fed-padron` |
| `R02` | AltaDePlaza | CUSTODIO · N | `fed-padron` |
| `R03` | EstadoDePlaza | CUSTODIO · N | `fed-padron` |
| `R04` | SilencioDePlaza | REFLEJO · N | `fed-padron` |
| `R05` | CensoDeTiendas | CUSTODIO · N | `fed-censo` |
| `R06` | VersionDePlaza | CUSTODIO · N | `fed-versiones` |
| `R07` | PuestaEnMarchaDePlaza | PUENTE · N | `fed-puesta-en-marcha` |
| `R08` | VerificaciónDePuestaEnMarcha | REFLEJO · N | `fed-puesta-en-marcha` |
| `R09` | CompatibilidadDeVersión | REFLEJO · N | `fed-versiones` |
| `R10` | ÍndiceNacional | REFLEJO · N | `fed-buscador` |
| `R11` | BuscadorNacional | REFLEJO · N | `fed-buscador` |
| `R12` | ResultadoConSuPlaza | REFLEJO · N | `fed-buscador` |
| `R13` | EnrutadoAPlaza | PUENTE · N | `fed-enrutado` |
| `R14` | ConsolidaciónNacional | REFLEJO · N | `fed-consolidacion` |
| `R15` | CuadroDeLaFederación | REFLEJO · N | `fed-consolidacion` |
| `R16` | MarcaNacional | CUSTODIO · N | `fed-marca` |
| `R17` | LicenciaDeMarca | CUSTODIO · N | `fed-marca` |
| `R18` | SoporteNacional | PUENTE · N | `fed-soporte` |
| `R19` | PermisoDePlaza | CUSTODIO · N | `fed-acceso` |
| `R20` | TrazaDeAcceso | CUSTODIO · N | `fed-acceso` |
| `R21` | AccesoDelegadoAPlaza | CUSTODIO · N | `fed-acceso` |
| `R22` | ActaDeFederación | CUSTODIO · N | `fed-acta` |
| `R23` | GuardaSinCatálogoNacional | REFLEJO · N | `fed-buzon` |
| `R24` | GuardaNoRecauda | REFLEJO · N | `fed-canon` |
| `R25` | GuardaFronteraDePlaza | REFLEJO · N | `fed-buzon` |
| `R26` | CanonDePlaza | REFLEJO · N | `fed-canon` |

### Grupo A · propuesta-enlace (35) — PLAZA 35

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `A01` | HechoPedidoListo | CUSTODIO · P | `hecho-listo` |
| `A02` | ComposiciónDeLaVista | REFLEJO · P | `foto-mercado` |
| `A03` | CongelaciónDeLaFoto | REFLEJO · P | `foto-mercado` |
| `A04` | CandidatosElegibles | REFLEJO · P | `foto-mercado` |
| `A05` | RutaBase | REFLEJO · P | `enlace` |
| `A06` | RutaConParada | REFLEJO · P | `enlace` |
| `A07` | MedidaDesvío | REFLEJO · P | `enlace` |
| `A08` | MedidaEspera | REFLEJO · P | `enlace` |
| `A09` | RetrasoPorParada | REFLEJO · P | `enlace` |
| `A10` | AgregadoDelRetraso | REFLEJO · P | `enlace` |
| `A11` | MedidaCobra | REFLEJO · P | `enlace` |
| `A12` | ReglaDeEnlace | REFLEJO · P | `enlace` |
| `A13` | PropuestaEmitida | CUSTODIO · P | `propuesta` |
| `A14` | BloqueoDePropuesta | CUSTODIO · P | `propuesta` |
| `A15` | VentanaDePropuesta | CUSTODIO · P | `propuesta` |
| `A16` | RazonesDeLaDecisión | REFLEJO · P | `enlace` |
| `A17` | FraseDerivada | REFLEJO · P | `enlace` |
| `A18` | RedacciónDeLaPropuesta | AGENTE · P | `redaccion-propuesta` |
| `A19` | AceptaciónLibre | CUSTODIO · P | `propuesta` |
| `A20` | HoraDeAceptación | REFLEJO · P | `enlace` |
| `A21` | RechazoSinCoste | REFLEJO · P | `enlace` |
| `A22` | GuardaSinPuntuación | REFLEJO · P | `enlace` |
| `A23` | CaducidadSinRespuesta | REFLEJO · P | `enlace` |
| `A24` | ContratoPuntual | CUSTODIO · P | `contrato-puntual` |
| `A25` | SiguienteCandidato | REFLEJO · P | `enlace` |
| `A26` | EscaladaDeEnlace | PUENTE · P | `escalada-enlace` |
| `A27` | GuardaSinAsignación | REFLEJO · P | `propuesta` |
| `A28` | GuardaSinOptimizador | REFLEJO · P | `enlace` |
| `A29` | ReproducciónDeLaDecisión | REFLEJO · P | `propuesta` |
| `A30` | GuardaEnlacePorTrayecto | REFLEJO · P | `enlace` |
| `A31` | GuardaEnlaceNoRompePromesa | REFLEJO · P | `enlace` |
| `A32` | GuardaNoCapturaDelAhorro | REFLEJO · P | `liquidacion` |
| `A33` | GuardaPropuestaÚnica | REFLEJO · P | `propuesta` |
| `A34` | HuecoDeMedida | REFLEJO · P | `enlace` |
| `A35` | GuardaEnlaceIntraPlaza | REFLEJO · P | `enlace` |

### Grupo B · ruta-viva (6) — PLAZA 6

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `B01` | PosiciónRider | CUSTODIO · P | `ruta-viva` |
| `B02` | ParadasPendientes | REFLEJO · P | `ruta-viva` |
| `B03` | PromesaPorParada | CUSTODIO · P | `ruta-viva` |
| `B04` | OrdenDeParadas | REFLEJO · P | `ruta-viva` |
| `B05` | CapacidadDeclarada | CUSTODIO · P | `ruta-viva` |
| `B06` | FinDeTrayecto | REFLEJO · P | `ruta-viva` |

### Grupo C · pedido (7) — TIENDA 4 · PLAZA 3

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `C01` | CapturaPedido | REFLEJO · T | `tienda-captura` |
| `C02` | EstadoPedido | CUSTODIO · P | `pedido` |
| `C03` | AvisoTienda | PUENTE · P | `aviso-tienda` |
| `C04` | HoraDeListo | CUSTODIO · T | `tienda-hora-listo` |
| `C05` | EstadoCocinaVisible | REFLEJO · T | `tienda-cocina-visible` |
| `C06` | AvisoCliente | PUENTE · T | `tienda-aviso-cliente` |
| `C07` | Cancelación | REFLEJO · P | `pedido` |

### Grupo D · plaza-tienda (8) — TIENDA 6 · PLAZA 2

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `D01` | MarcaTienda | CUSTODIO · T | `tienda-marca` |
| `D02` | CartaPública | CONVERSOR · T | `tienda-carta` |
| `D03` | PrecioCerrado | REFLEJO · T | `tienda-precio` |
| `D04` | CarritoTienda | CUSTODIO · T | `tienda-carrito` |
| `D05` | RegistroClienteTienda | CUSTODIO · T | `tienda-cliente` |
| `D06` | RadioDeTienda | CUSTODIO · T | `tienda-radio` |
| `D07` | PlazaPública | REFLEJO · P | `escaparate` |
| `D08` | NeutralidadOrden | REFLEJO · P | `escaparate` |

### Grupo E · tarifa-tres-bandas (7) — PLAZA 6 · TIENDA 1

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `E01` | OfertaCliente | CUSTODIO · P | `tarifa-pedido` |
| `E02` | IncentivoTienda | CUSTODIO · T | `tienda-incentivo` |
| `E03` | PrecioReparto | REFLEJO · P | `tarifa-pedido` |
| `E04` | ComisiónDeCoordinación | REFLEJO · P | `liquidacion` |
| `E05` | RepartoDelPago | CONVERSOR · P | `liquidacion` |
| `E06` | ContratoTramos | CUSTODIO · P | `contrato-tramos` |
| `E07` | SubidaDeOferta | CUSTODIO · P | `tarifa-pedido` |

### Grupo F · reparto-medido (7) — PLAZA 7

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `F01` | HechosDelReparto | CUSTODIO · P | `hechos-reparto` |
| `F02` | PruebaEntrega | CUSTODIO · P | `hechos-reparto` |
| `F03` | SeguimientoVivo | REFLEJO · P | `hechos-reparto` |
| `F04` | ChatEnmascarado | PUENTE · P | `chat-enmascarado` |
| `F05` | InstruccionesAcceso | CUSTODIO · P | `instrucciones-acceso` |
| `F06` | IncidenciaReparto | PUENTE · P | `incidencia-reparto` |
| `F07` | LecturaDeIncidencia | AGENTE · P | `lectura-incidencia` |

### Grupo G · adjudicacion-fallos (6) — PLAZA 6

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `G01` | VentanaEspera | CUSTODIO · P | `config-mercado` |
| `G02` | HechoVerificado | REFLEJO · P | `regla-fallo` |
| `G03` | ReglaPagoFallo | REFLEJO · P | `regla-fallo` |
| `G04` | CargoFallo | CUSTODIO · P | `cargo-fallo` |
| `G05` | DisputaFallo | PUENTE · P | `disputa-fallo` |
| `G06` | TrazabilidadFallo | REFLEJO · P | `regla-fallo` |

### Grupo H · liquidacion (6) — PLAZA 6

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `H01` | Devengo | REFLEJO · P | `liquidacion` |
| `H02` | CicloSemanal | CUSTODIO · P | `liquidacion` |
| `H03` | FacturaGestión | CONVERSOR · P | `factura-gestion` |
| `H04` | CobroGestión | PUENTE · P | `cobro-gestion` |
| `H05` | ImpagoGestión | REFLEJO · P | `liquidacion` |
| `H06` | GuardaNoRetención | REFLEJO · P | `liquidacion` |

### Grupo I · sala-mercado (8) — PLAZA 8

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `I01` | AltaTienda | CUSTODIO · P | `censo-parte` |
| `I02` | AltaRider | CUSTODIO · P | `censo-parte` |
| `I03` | EstadoTienda | CUSTODIO · P | `estado-parte` |
| `I04` | EstadoRider | CUSTODIO · P | `estado-parte` |
| `I05` | SaludMercado | REFLEJO · P | `salud-mercado` |
| `I06` | TableroFricciones | REFLEJO · P | `salud-mercado` |
| `I07` | AvisoSala | PUENTE · P | `aviso-sala` |
| `I08` | TérminosParte | CUSTODIO · P | `terminos-parte` |

### Grupo J · config (5) — PLAZA 5

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `J01` | ConfigUmbrales | CUSTODIO · P | `config-mercado` |
| `J02` | ConfigVentana | CUSTODIO · P | `config-mercado` |
| `J03` | ConfigZona | CUSTODIO · P | `config-mercado` |
| `J04` | VersiónEfectiva | REFLEJO · P | `config-mercado` |
| `J05` | SimuladorDeUmbrales | REFLEJO · P | `config-mercado` |

### Grupo K · cliente-final (2) — TIENDA 1 · PLAZA 1

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `K01` | ReclamaciónPorLaTienda | PUENTE · T | `tienda-reclamacion` |
| `K02` | GuardaMarcaAjena | REFLEJO · P | `escaparate` |

### Grupo L · restaurante (4) — TIENDA 4

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `L01` | PanelTienda | REFLEJO · T | `tienda-panel` |
| `L02` | GuardaPropiedadCliente | REFLEJO · T | `tienda-cliente` |
| `L03` | PuntualidadDeclarada | REFLEJO · T | `tienda-puntualidad` |
| `L04` | ResumenParaLaTienda | AGENTE · T | `tienda-resumen` |

### Grupo M · repartidor (5) — PLAZA 5

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `M01` | CarteraRider | REFLEJO · P | `cuenta-parte` |
| `M02` | ZonaRider | CUSTODIO · P | `censo-parte` |
| `M03` | GuardaSinExclusividad | REFLEJO · P | `censo-parte` |
| `M04` | CanalRider | PUENTE · P | `canal-rider` |
| `M05` | VistaDePropuesta | REFLEJO · P | `propuesta` |

### Grupo N · el-suelo (2) — PLAZA 2

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `N01` | PolíticaDensidad | REFLEJO · P | `salud-mercado` |
| `N02` | SimuladorTramos | REFLEJO · P | `contrato-tramos` |

### Grupo O · rol-jefe (4) — PLAZA 4

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `O01` | CuadroDelMercado | REFLEJO · P | `salud-mercado` |
| `O02` | ActaDeDecisiones | CUSTODIO · P | `acta-decisiones` |
| `O03` | ColaRevisiónHumana | CUSTODIO · P | `cola-sala` |
| `O04` | DictamenRevisión | CUSTODIO · P | `dictamen-revision` |

### Grupo P · rol-trabajador (4) — PLAZA 4

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `P01` | ColaSala | CUSTODIO · P | `cola-sala` |
| `P02` | VistaParte | REFLEJO · P | `cola-sala` |
| `P03` | AcciónSanción | CUSTODIO · P | `accion-sancion` |
| `P04` | ChecklistAlta | REFLEJO · P | `censo-parte` |

### Grupo Q · rol-cliente (1) — PLAZA 1

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `Q01` | EstadoCuentaParte | REFLEJO · P | `cuenta-parte` |

### Grupo S · frontera (2) — PLAZA 2

| clase | nombre | forma · unidad | hoja |
|---|---|---|---|
| `S01` | FronteraDePlaza | REFLEJO · P | `frontera-plaza` |
| `S02` | FiltroPorCobertura | REFLEJO · P | `frontera-plaza` |

**Cómo se lee esta tabla, en tres líneas:** el grupo **A** (35 clases) cae en **7 hojas** porque 20 de
ellas son las medidas de una sola decisión (A05–A12, A16–A17, A20–A35) y tienen que decidir sobre UNA
foto; el grupo **C** se parte entre plaza (C02, C03, C07) y tienda (C01, C04, C05, C06) porque el pedido
vive en la plaza y su declaración en la tienda; y el grupo **R** (26 clases) cae en 13 hojas y **una
flecha** (`fed-aviso`), que no tiene clase porque es la flecha N→P de §1.3.

---

## 5 · Contrato de eventos

### 5.1 · Los seis hechos que cruzan (y los demás, no)

La federación habla **por hechos declarados, no por consultas**. Cuatro suben y dos bajan; los seis tienen
nombre exacto en el diseño y **no llevan prefijo `bocaos.`**, para que un `grep` sobre el código diga en un
segundo cuántos sitios los tocan:

```text
SUBEN (plaza → nacional)            los publica `publicacion` · los recibe SÓLO `fed-buzon`
  plaza.viva            { plaza_id, versión, estado, tiendas: N }      periódico y barato
  tienda.dada-de-alta   { plaza_id, tienda_id, nombre, estado }        cuando pasa
  plaza.devengo-cerrado { plaza_id, periodo, total, partes: N }        al cerrar la semana
  plaza.acceso-visto    { plaza_id, quién, alcance, desde, hasta }     al conceder o usar un acceso

BAJAN (nacional → plaza)            los publica SÓLO `fed-aviso`
  version.nueva         { versión }                   un aviso, no una orden: saltárselo es correcto
  plaza.suspendida      { plaza_id, motivo }          la única orden, y es de registro: la saca del mapa,
                                                      NO la apaga
```

**Lo que no está en esa lista, no cruza**: ni un pedido, ni una posición, ni un precio, ni una carta, ni un
rider, ni un cliente, ni un agregado por debajo de la plaza. `plaza.devengo-cerrado` lleva `partes: N` y **no
los nombres**: el nacional sabe cuántas partes pagaron, no quiénes.

**Y una propiedad que este plano añade, comprobable con un `grep`:** en la plaza **no hay una sola
suscripción a un tópico del nacional**. Ni `version.nueva` ni `plaza.suspendida` tienen consumidor dentro de
una plaza. No es disciplina: es que **no hay dónde**. Si un día alguien necesita reaccionar a
`version.nueva`, tendrá que abrir una suscripción y la auditoría 4 se pondrá roja en el acto.

### 5.2 · Los pares request/response del cuello (los que importan)

| Quién pide | Qué pide | Quién responde | Cruza |
|---|---|---|---|
| `tienda-captura` | `pedido.crear` | `pedido` | **T→P** |
| `tienda-precio` | `tarifa-pedido.precio` | `tarifa-pedido` | **T→P** |
| `tienda-hora-listo` (al declarar) | `hecho-listo.anotar` | `hecho-listo` | **T→P** |
| `tienda-panel` | `config-mercado.politica` | `config-mercado` | **T→P** |
| `tienda-aviso-cliente` | `escaparate.marca_ajena` | `escaparate` | **T→P** |
| `enlace` | `foto-mercado.componer` / `.elegibles` | `foto-mercado` | P |
| `enlace` | `puntualidad-tienda.medir` | `puntualidad-tienda` | **P→T** (número publicado) |
| `enlace` | `propuesta.emitir` | `propuesta` (una viva por pedido) | P |
| `enlace` | `redaccion-propuesta.adornar` | `redaccion-propuesta` (o cae y usa A17) | P |
| `enlace` | `canal-rider.entregar` | `canal-rider` (acuse o retirada a 5 s) | P |
| `enlace` (al agotar) | `escalada-enlace.escalar` | `escalada-enlace` (3 peldaños) | P |
| `escalada-enlace` | `tarifa-pedido.subir` | `tarifa-pedido` (tope del cliente, autor humano) | P |
| `propuesta` (aceptada) | `contrato-puntual.crear` | `contrato-puntual` | P |
| `hechos-reparto` | `contrato-puntual.de` | `contrato-puntual` | P |
| `regla-fallo` | `hechos-reparto.acta` | `hechos-reparto` (completa o INCOMPLETA) | P |
| `cargo-fallo` | `cobro-gestion.revertir` | `cobro-gestion` (sólo si hay saldo) | P |
| `dictamen-revision` | `config-mercado.declarar` + `acta-decisiones.asentar` | `config-mercado` / `acta-decisiones` | P |
| `liquidacion` → `factura-gestion` → `cobro-gestion` | emitir → cobrar | los dos | P |
| `fed-soporte` | `fed-acceso.usar` | `fed-acceso` (escribe traza ANTES de devolver) | N |
| `fed-canon` | `fed-consolidacion.consolidar` | `fed-consolidacion` | N |
| `fed-aviso` | `fed-versiones.compatible` | `fed-versiones` | N |

**Lo que NO hay, y es el punto:**

```text
· ninguna hoja de la plaza pide nada al nacional            → auditoría 4
· ninguna hoja del nacional pide nada a una plaza            → auditorías 1 y 3
  (la única excepción es `fed-puesta-en-marcha`, que pide ARRANCAR, no datos)
· ninguna hoja de una tienda pide nada a otra tienda         → L02
· ninguna plaza pide nada a otra plaza                       → no hay bus entre ellas
```

**Regla común:** si un aviso no llega, **el hecho ya está escrito**. El aviso es transporte; la verdad es el
hecho. Un aviso perdido no puede hacer desaparecer un pedido, ni crear un contrato, ni cobrar nada.

### 5.3 · Los hechos de dominio, con quién los escucha

Sólo los que tienen consumidor. Los demás (`bocaos.escaparate_compuesto`, `bocaos.pedido_compuesto`,
`bocaos.federacion_*` de acta y marca) existen para el acta y la observabilidad, y se declaran como tales.

| hecho | lo publica | unidad | lo escuchan |
|---|---|---|---|
| `bocaos.politica_declarada` | `config-mercado` | P | `frontera-plaza` |
| `bocaos.censo_actualizado` | `censo-parte` | P | `escaparate` · `publicacion` |
| `bocaos.censo_incompleto` | `censo-parte` | P | `cola-sala` |
| `bocaos.terminos_aceptados` | `terminos-parte` | P | `censo-parte` |
| `bocaos.marca_tienda_declarada` | `tienda-marca` | T | `tienda-carta` |
| `bocaos.radio_declarada` | `tienda-radio` | T | `frontera-plaza` · `escaparate` |
| `bocaos.incentivo_subido` | `tienda-incentivo` | T | `tarifa-pedido` |
| `bocaos.precio_cerrado` | `tienda-precio` | T | `pedido` |
| `bocaos.pedido_creado` | `pedido` | P | `aviso-tienda` · `tienda-cocina-visible` |
| `bocaos.pedido_aceptado` | `pedido` | P | `tienda-hora-listo` |
| `bocaos.pedido_cancelado` | `pedido` | P | `aviso-tienda` · `tienda-aviso-cliente` |
| `bocaos.pedido_listo` | `hecho-listo` | P | `hechos-reparto` · `enlace` · `tienda-cocina-visible` · `tienda-aviso-cliente` |
| `bocaos.hecho_desmentido` | `hecho-listo` | P | `enlace` |
| `bocaos.listo_declarado` | `tienda-hora-listo` | T | `pedido` · `hecho-listo` · `tienda-puntualidad` |
| `bocaos.aviso_tienda_fallido` | `aviso-tienda` | P | `cola-sala` |
| `bocaos.aviso_cliente_fallido` | `tienda-aviso-cliente` | T | `cola-sala` |
| `bocaos.puntualidad_publicada` | `tienda-puntualidad` | T | `tienda-panel` |
| `bocaos.contrato_creado` | `contrato-puntual` | P | `estado-parte` · `ruta-viva` · `pedido` · `instrucciones-acceso` · `hechos-reparto` · `chat-enmascarado` · `tienda-cocina-visible` · `tienda-aviso-cliente` |
| `bocaos.contrato_cerrado` | `contrato-puntual` | P | `estado-parte` · `ruta-viva` · `instrucciones-acceso` · `chat-enmascarado` |
| `bocaos.propuesta_emitida` | `propuesta` | P | `canal-rider` · `salud-mercado` · `tienda-panel` |
| `bocaos.propuesta_aceptada` | `propuesta` | P | `contrato-puntual` · `salud-mercado` |
| `bocaos.propuesta_rechazada` | `propuesta` | P | `escalada-enlace` · `enlace` |
| `bocaos.propuesta_caducada_sin_respuesta` | `propuesta` | P | `escalada-enlace` · `enlace` |
| `bocaos.propuesta_entregada` | `canal-rider` | P | `propuesta` |
| `bocaos.propuesta_no_entregada` | `canal-rider` | P | `propuesta` |
| `bocaos.escalada_reintentar` | `escalada-enlace` | P | `enlace` |
| `bocaos.enlace_agotado` | `enlace` | P | `escalada-enlace` · `cola-sala` |
| `bocaos.hecho_reparto_anotado` | `hechos-reparto` | P | `ruta-viva` · `contrato-puntual` · `incidencia-reparto` · `liquidacion` · `tienda-panel` · `tienda-puntualidad` |
| `bocaos.prueba_anotada` | `hechos-reparto` | P | `pedido` · `tienda-cocina-visible` |
| `bocaos.acta_incompleta` | `hechos-reparto` | P | `regla-fallo` · `cargo-fallo` |
| `bocaos.incidencia_abierta` | `incidencia-reparto` | P | `lectura-incidencia` · `cola-sala` |
| `bocaos.fallo_adjudicado` | `regla-fallo` | P | `cargo-fallo` |
| `bocaos.cargo_anotado` | `cargo-fallo` | P | `disputa-fallo` · `liquidacion` · `cuenta-parte` |
| `bocaos.cargo_sin_evidencia` | `cargo-fallo` | P | `cola-sala` |
| `bocaos.disputa_abierta` | `disputa-fallo` | P | `cola-sala` |
| `bocaos.cierre_semanal` | `liquidacion` | P | `factura-gestion` · `salud-mercado` · `cuenta-parte` · `publicacion` |
| `bocaos.cobro_realizado` | `cobro-gestion` | P | `cuenta-parte` |
| `bocaos.cobro_fallido` | `cobro-gestion` | P | `liquidacion` |
| `bocaos.caso_encolado` | `cola-sala` | P | `aviso-sala` |
| `bocaos.caso_cerrado` | `cola-sala` | P | `accion-sancion` |
| `bocaos.revision_solicitada` | `cola-sala` | P | `dictamen-revision` |
| `bocaos.parte_sancionada` | `accion-sancion` | P | `estado-parte` |
| `bocaos.dictamen_firmado` | `dictamen-revision` | P | `acta-decisiones` · `config-mercado` |
| `plaza.viva` | `publicacion` | P | `fed-buzon` |
| `tienda.dada-de-alta` | `publicacion` | P | `fed-buzon` |
| `plaza.devengo-cerrado` | `publicacion` | P | `fed-buzon` |
| `plaza.acceso-visto` | `publicacion` | P | `fed-buzon` |
| `bocaos.federacion_plaza_viva` | `fed-buzon` | N | `fed-versiones` · `fed-puesta-en-marcha` |
| `bocaos.federacion_tienda_publicada` | `fed-buzon` | N | `fed-censo` |
| `bocaos.federacion_devengo_cerrado` | `fed-buzon` | N | `fed-consolidacion` |
| `bocaos.federacion_acceso_visto` | `fed-buzon` | N | `fed-acceso` |
| `bocaos.federacion_plaza_estado` | `fed-padron` | N | `fed-aviso` |
| `bocaos.federacion_version_declarada` | `fed-versiones` | N | `fed-aviso` |
| `bocaos.federacion_verificacion_ok` | `fed-puesta-en-marcha` | N | `fed-padron` |
| `bocaos.federacion_verificacion_difiere` | `fed-puesta-en-marcha` | N | `fed-padron` |

> 55 hechos con consumidor. El resto (78) van al acta o a la observabilidad y **no cierran ningún flujo**: si desaparecen, el negocio sigue igual. Esa es la prueba de que el bus no es un bus de negocio por accidente: los que importan tienen lector, y se ve en la tabla.

## 6 · Máquina de estados (con dueño, con unidad y con estado ilegal imposible)

### 6.1 · El pedido — dueño `pedido` (P), en el registro de SU plaza

```text
RECIBIDO ──(la tienda acepta, Q27)──► ACEPTADO ──(C04 declarado + A01 anotado)──► LISTO
   │                                     │                                          │
   │(rechaza, Q36)                       │(rechaza aun pagado)                      │(contrato creado)
   ▼                                     ▼                                          ▼
RECHAZADO (los gastos los paga quien provocó)                                EN_REPARTO ──(prueba o falta declarada)──► ENTREGADO
   └──────── cancelado (C07: quién y hasta cuándo) ────────────────────────────────────┘
```

- **Estado ilegal imposible:** no hay `LISTO` sin `bocaos.pedido_aceptado` **y** un hecho con hora en
  `hecho-listo`; no hay `EN_REPARTO` sin `bocaos.contrato_creado`; no hay `ENTREGADO` sin
  `bocaos.prueba_anotada` o su falta **declarada** (F02).
- **Un estado no se corrige: se avanza.** Si la tienda se equivocó de hora, `hecho-listo.desmentir` anota un
  hecho nuevo, las dos horas quedan y el pedido **se vuelve a medir**.
- **El estado vive en la plaza y la declaración en la tienda.** El pedido no puede nacer en el nacional ni
  en otra plaza: no existe la fila.

### 6.2 · La propuesta — dueño `propuesta` (P), dos relojes y cinco desenlaces

```text
EMITIDA (validez 20 s) ──acuse (≤5 s)──► ACUSADA (decisión 10 s) ──sí──► ACEPTADA ──► contrato puntual
   │                                        │──── rechazo ────► RECHAZADA      (sin coste, A21)
   │──── sin acuse en 5 s ─────────────────► CADUCADA_SIN_ACUSE   (el canal falló, no el rider)
   └──── validez vencida ──────────────────► CADUCADA_SIN_RESPUESTA (el rider no contestó)
```

- **Un solo desenlace.** El segundo que llega recibe `YA_NO_ESTA` y **no paga nada**. Es el mismo «sin
  coste» de A21, no una pieza nueva.
- **Las dos caducidades no son la misma cosa** (Q42): una es un fallo de transporte, la otra es un no. La
  métrica `aceptadas/emitidas` se mide sobre EMITIDAS; la calidad del canal, sobre ACUSADAS.
- **Una viva por pedido** (A33) y **un solo sí atómico** (A19) se cumplen **por construcción**: hay una hoja
  y un bloqueo, no cuatro custodios compitiendo.

### 6.3 · El contrato puntual — dueño `contrato-puntual` (P)

```text
VIVO (parada pendiente en B02) ──hecho de entrega──► CERRADO (la parada desaparece y deja de proyectarse)
```

Sin turno, sin jornada, sin compromiso con el siguiente pedido. Si tuviera duración, el negocio sería otro.

### 6.4 · El cargo por fallo — dueño `cargo-fallo` (P)

```text
MEDIDO (G02, hechos con hora) ──tabla (G03)──► ADJUDICADO (quién, no cuánto) ──evidencia (G06)──► DEUDA
   │                                                                                          │
   └── acta incompleta (Q30) ──► NO HAY CARGO (se retira)                                     ├─ paga ──► COBRADA (transfer_reversal, Q29)
                                                                                              └─ disputa ──► caso en cola ──► dictamen firmado
```

Una deuda **nunca** se convierte en un descuento: Bocaos no retiene, así que no puede descontar de un dinero
que no tiene.

### 6.5 · El ciclo semanal — dueño `liquidacion` (P)

```text
ABIERTO ──cerrar──► CERRADO (inmutable) ──► factura (H03) ──► cobro (H04) ──fallido──► mora (H05:
                                                            recordatorio → recargo → suspensión)
```

- La suspensión **no corta** pedidos en vuelo ni propuestas vivas.
- El cierre dispara `plaza.devengo-cerrado` **hacia arriba** (lo publica `publicacion`), y el nacional
  consolida lo cerrado. **El nacional no entra en el ciclo**: si entrara, la plaza necesitaría al nacional
  para cerrar su semana y se caería la auditoría 4 por un céntimo.

### 6.6 · El caso de la cola — dueño `cola-sala` (P)

```text
ABIERTO (con plazo) ──vence──► ABIERTO Y MÁS ARRIBA (no se cierra solo)
                    ──dictamen firmado──► CERRADO
                    ──hecho que lo resuelve──► CERRADO
```

Un plazo que resuelve solo es un automatismo con reloj. Vencer **sube la prioridad**; no decide.

### 6.7 · La plaza en el registro — dueño `fed-padron` (N)

```text
naciendo ──(verificación en verde)──► operando ──(pausa)──► en pausa ──► operando
   │                                      │
   └──────────────────────────────────────┴──► cerrada (no vuelve; no se borra: se liquida)
```

- **Ningún estado sin hecho con hora.**
- **Declarar caída una plaza NO la apaga**: la plaza sigue repartiendo aunque el registro la crea caída. El
  estado es lo que el registro **cree**, no lo que la plaza **hace** — y esa diferencia es la que salva la
  auditoría 4.

### 6.8 · El canon — dueño `fed-canon` (N), condicionado por aritmética

```text
con 1 plaza      → NO_HAY        (no hay sujeto pasivo; no se emite documento)
con 2 plazas     → NO_CONSTA     (sin coeficiente declarado: el cuadro dice «canon sin declarar»)
                 → EMITIDO       (documento A UNA PLAZA sobre su devengo CERRADO)
                 → PAGADO        (la plaza lo paga por SU canal; el nacional no lo descuenta ni lo retiene)
```

### 6.9 · El buzón — dueño `fed-buzon` (N): cuatro formas y la quinta se rechaza

```text
plaza.viva · tienda.dada-de-alta · plaza.devengo-cerrado · plaza.acceso-visto  → Registrado (y re-emitido tipado)
cualquier otra (pedido.creado, posición, precio, carta, cliente…)             → RECHAZADO(forma desconocida)
```

Es la raíz `Nacional.anotar(hecho) → Registrado | RECHAZADO` materializada. Y es lo que hace que la
auditoría 1 no sea una promesa: hay **una** puerta y una lista de cuatro formas.

---

## 7 · Las cuatro auditorías del corte: cómo las cumple este plano y dónde puede fallar

### 7.1 · El nacional no tiene pedidos

```text
CÓMO   `fed-buzon` acepta cuatro formas y rechaza la quinta. Los otros 13 módulos del nacional no
       escuchan el bus de una plaza: sólo escuchan `bocaos.federacion_*` (lo que el buzón re-emite).
TEST   `fed-buzon.guarda_catalogo` (R23) enumera el almacén del nacional: si aparece `pedido`, `linea`,
       `importe`, `direccion` o `posicion`, FALLA con la ruta exacta. Y un `grep` de los `subscribes` de
       los 14 módulos contra `plaza.` y `tienda.` da exactamente cuatro líneas, todas en `fed-buzon`.
FALLA  En un sitio: `fed-acceso` (R20), si `_traza` guarda el PAYLOAD de lo visto en vez del NOMBRE de la
       cosa. «Pedido 4471» es un nombre; los datos del pedido 4471 son un pedido. Test adicional: el campo
       `que` de cada fila de traza pertenece a una lista cerrada.
```

### 7.2 · El nacional no recauda (salvo el canon, y el canon no existe con una plaza)

```text
CÓMO   Un solo camino de dinero sale del nacional: `fed-canon`, y es un documento A UNA PLAZA sobre lo que
       la plaza YA publicó. No cobra a tiendas, ni a riders, ni al cliente; no retiene, no adelanta, no
       compensa entre plazas. Y no viaja por el bus: sale por el canal administrativo, así que no es una
       tercera flecha N→P.
TEST   `fed-canon.guarda_recauda` (R24) devuelve la lista enumerable de caminos de dinero. Con una plaza
       está vacía y el canon devuelve NO_HAY: la auditoría pasa **porque no hay canon**, y eso se declara.
FALLA  En tres sitios, y los tres son de implementación, no de diseño: (a) meter el canon dentro del
       `Devengo` de la plaza —rompe también la 4—; (b) un «anticipo» de `fed-soporte` a una plaza con
       problemas de caja; (c) que `fed-canon` acabe llamando a `cobro-gestion`, que es una hoja de la PLAZA.
       El test tiene que enumerar MÓDULOS, no sólo tópicos: ningún `fed-*` puede publicar ni suscribir un
       `pago.*`.
```

### 7.3 · Ninguna fila cruza de plaza — **la que puede fallar**

```text
CÓMO   El `plaza_id` lo sella el escritor. `fed-buzon._sello` (R25) compara el plaza_id de cada fila con la
       plaza del que la escribió; en el nacional sólo tres clases escriben con plaza_id ajeno (R05 censo,
       R06 versión, R20 traza) y las tres escriben SOBRE una plaza, no DESDE otra.
TEST   `fed-buzon.guarda_frontera` → conforme | FALLA(fila, plaza_declarada, plaza_escritora).
FALLA  15 módulos de tienda y 39 de plaza comparten UN bus dentro de UN despliegue (§1.3). La flecha T→P
       no la impone la red. Si el `tienda_id` se copia del payload, un handler reutilizado puede escribir
       una fila de la tienda de al lado y ningún test de red lo verá. Por eso la ley del sello (§1.3) es
       una regla de construcción y no un consejo: **el id se resuelve del almacén del dueño**.
```

Esta es la que puede fallar, y es la única de las cuatro que **mejora** al separar despliegues: con una
plaza por despliegue, P↔P′ es física; lo que queda frágil es T→P dentro de casa.

### 7.4 · Apagar el nacional y las plazas siguen repartiendo

```text
CÓMO   No hay una sola flecha de una plaza hacia arriba que espere respuesta. `publicacion` publica y no
       pide nada; ninguna hoja de la plaza se suscribe a un tópico del nacional; el cierre semanal no
       contiene el canon; la versión de la plaza la declara ELLA y vive en su config, no se le pregunta al
       registro.
TEST   §7.10 del diseño como guion: arrancar una plaza con el nacional apagado y recorrer proponer →
       aceptar → entregar → devengar → cerrar → cobrar. Se pierden cuatro cosas y sólo cuatro: buscar una
       tienda por localidad, abrir una plaza nueva, saber si una plaza lleva tres días callada y emitir el
       canon.
FALLA  En una sola pieza: `publicacion`, si alguien le pone un `request`/`response`, un reintento con
       bloqueo o un `bocaos.publicacion_fallida` que alguien consuma con espera. Ahí el nacional apagado se
       convierte en una cola que crece. Test: apagar el nacional y comprobar que `publicacion` no retiene
       estado ni crece en memoria; y que su latido sigue al mismo ritmo.
```

**Veredicto honesto, que es lo que se pidió:** las auditorías **1, 2 y 4 pasan sobre el papel por estructura**
(una puerta de cuatro formas; un solo camino de dinero; ausencia de flecha hacia arriba). La **3 pasa sobre el
papel y puede fallar en la obra**, porque dentro de un despliegue la frontera T→P es código. Lo que este plano
hace para que no falle no es una promesa: es una ley de sellado, cuatro sitios donde vive la unidad y un test
que compara cada fila con quien la escribió.

---

## 8 · Orden de construcción

El diseño no se puede construir empezando por el corazón: `enlace` depende de datos que escribe medio
negocio. El orden de abajo es **topológicamente válido** (cada hoja va después de sus `depende_de`; lo
comprueba la espina) y sigue los **11 peldaños del §14 de la F3**, con una diferencia que el corte impone:
**el nacional va el último y no hace falta para nada de lo anterior**.

```text
REGLA DEL ORDEN · cada peldaño se puede probar solo.
  una plaza con 0–9 y sin 10 es una federación de una, funcionando.
  una plaza con 5 y sin 1–4 propone con números inventados — el negocio contrario a este.
```

| # | hoja | forma | acción | unidad | clases | peldaño |
|---|---|---|---|---|---|---|
| 1 | `scheduler` | micro-agente | REUTILIZAR | PLAZA | — | 0 · la plaza sola |
| 2 | `acta-decisiones` | custodio | CONSTRUIR | PLAZA | O02 | 1 · lo que declara la plaza |
| 3 | `config-mercado` | custodio | CONSTRUIR | PLAZA | J01, J02, J03, J04, J05, G01 | 1 · lo que declara la plaza |
| 4 | `censo-parte` | custodio | CONSTRUIR | PLAZA | I01, I02, M02, M03, P04 | 2 · el censo y el estado |
| 5 | `estado-parte` | custodio | CONSTRUIR | PLAZA | I03, I04 | 2 · el censo y el estado |
| 6 | `terminos-parte` | custodio | CONSTRUIR | PLAZA | I08 | 2 · el censo y el estado |
| 7 | `ruta-viva` | custodio | CONSTRUIR | PLAZA | B01, B02, B03, B04, B05, B06 | 3 · la ruta viva |
| 8 | `contrato-tramos` | custodio | CONSTRUIR | PLAZA | E06, N02 | 4 · el pedido y su precio * |
| 9 | `frontera-plaza` | reflejo | CONSTRUIR | PLAZA | S01, S02 | 4 · el pedido y su precio * |
| 10 | `escaparate` | reflejo | CONSTRUIR | PLAZA | D07, D08, K02 | 4 · el pedido y su precio * |
| 11 | `tienda-marca` | custodio | CONSTRUIR | TIENDA | D01 | 4 · el pedido y su precio |
| 12 | `tienda-carta` | conversor | CONSTRUIR | TIENDA | D02 | 4 · el pedido y su precio |
| 13 | `tienda-cliente` | custodio | CONSTRUIR | TIENDA | D05, L02 | 4 · el pedido y su precio |
| 14 | `tienda-radio` | custodio | CONSTRUIR | TIENDA | D06 | 4 · el pedido y su precio |
| 15 | `tienda-carrito` | custodio | CONSTRUIR | TIENDA | D04 | 4 · el pedido y su precio |
| 16 | `tienda-incentivo` | custodio | CONSTRUIR | TIENDA | E02 | 4 · el pedido y su precio |
| 17 | `tarifa-pedido` | custodio | CONSTRUIR | PLAZA | E01, E03, E07 | 4 · el pedido y su precio |
| 18 | `tienda-precio` | reflejo | CONSTRUIR | TIENDA | D03 | 4 · el pedido y su precio |
| 19 | `tienda-captura` | reflejo | CONSTRUIR | TIENDA | C01 | 4 · el pedido y su precio |
| 20 | `pedido` | custodio | CONSTRUIR | PLAZA | C02, C07 | 4 · el pedido y su precio |
| 21 | `hecho-listo` | custodio | CONSTRUIR | PLAZA | A01 | 4 · el pedido y su precio |
| 22 | `tienda-hora-listo` | custodio | CONSTRUIR | TIENDA | C04 | 4 · el pedido y su precio |
| 23 | `tienda-cocina-visible` | reflejo | CONSTRUIR | TIENDA | C05 | 4 · el pedido y su precio |
| 24 | `aviso-tienda` | puente | CONSTRUIR | PLAZA | C03 | 4 · el pedido y su precio |
| 25 | `instrucciones-acceso` | custodio | CONSTRUIR | PLAZA | F05 | 4 · el pedido y su precio |
| 26 | `tienda-aviso-cliente` | puente | ADAPTAR | TIENDA | C06 | 4 · el pedido y su precio |
| 27 | `tienda-puntualidad` | reflejo | CONSTRUIR | TIENDA | L03 | 5 · el histórico del local |
| 28 | `tienda-panel` | reflejo | CONSTRUIR | TIENDA | L01 | 5 · el histórico del local |
| 29 | `contrato-puntual` | custodio | CONSTRUIR | PLAZA | A24 | 6 · el corazón |
| 30 | `foto-mercado` | reflejo | CONSTRUIR | PLAZA | A02, A03, A04 | 6 · el corazón |
| 31 | `propuesta` | custodio | CONSTRUIR | PLAZA | A13, A14, A15, A19, A27, A29, A33, M05 | 6 · el corazón |
| 32 | `redaccion-propuesta` | micro-agente | CONSTRUIR | PLAZA | A18 | 6 · el corazón |
| 33 | `canal-rider` | puente | ADAPTAR | PLAZA | M04 | 6 · el corazón |
| 34 | `escalada-enlace` | puente | CONSTRUIR | PLAZA | A26 | 6 · el corazón |
| 35 | `enlace` | micro-agente | CONSTRUIR | PLAZA | A05, A06, A07, A08, A09, A10, A11, A12, A16, A17, A20, A21, A22, A23, A25, A28, A30, A31, A34, A35 | 6 · el corazón |
| 36 | `hechos-reparto` | custodio | CONSTRUIR | PLAZA | F01, F02, F03 | 7 · el reparto y la prueba |
| 37 | `chat-enmascarado` | puente | CONSTRUIR | PLAZA | F04 | 7 · el reparto y la prueba |
| 38 | `incidencia-reparto` | puente | CONSTRUIR | PLAZA | F06 | 7 · el reparto y la prueba |
| 39 | `lectura-incidencia` | micro-agente | CONSTRUIR | PLAZA | F07 | 7 · el reparto y la prueba |
| 40 | `regla-fallo` | reflejo | CONSTRUIR | PLAZA | G02, G03, G06 | 8 · el dinero de la plaza |
| 41 | `cargo-fallo` | custodio | CONSTRUIR | PLAZA | G04 | 8 · el dinero de la plaza |
| 42 | `disputa-fallo` | puente | CONSTRUIR | PLAZA | G05 | 8 · el dinero de la plaza |
| 43 | `liquidacion` | custodio | CONSTRUIR | PLAZA | H01, H02, H05, E04, E05, A32, H06 | 8 · el dinero de la plaza |
| 44 | `factura-gestion` | conversor | CONSTRUIR | PLAZA | H03 | 8 · el dinero de la plaza |
| 45 | `cobro-gestion` | puente | ADAPTAR | PLAZA | H04 | 8 · el dinero de la plaza |
| 46 | `cuenta-parte` | reflejo | CONSTRUIR | PLAZA | Q01, M01 | 8 · el dinero de la plaza |
| 47 | `cola-sala` | custodio | CONSTRUIR | PLAZA | P01, P02, O03 | 9 · la operación humana |
| 48 | `aviso-sala` | puente | CONSTRUIR | PLAZA | I07 | 9 · la operación humana |
| 49 | `accion-sancion` | custodio | CONSTRUIR | PLAZA | P03 | 9 · la operación humana |
| 50 | `dictamen-revision` | custodio | CONSTRUIR | PLAZA | O04 | 9 · la operación humana |
| 51 | `salud-mercado` | reflejo | CONSTRUIR | PLAZA | I05, I06, O01, N01 | 9 · la operación humana |
| 52 | `tienda-reclamacion` | puente | CONSTRUIR | TIENDA | K01 | 10 · el borde amable |
| 53 | `tienda-resumen` | micro-agente | CONSTRUIR | TIENDA | L04 | 10 · el borde amable |
| 54 | `publicacion` | puente | CONSTRUIR | PLAZA | (raíz Plaza: publicar) | 10 · el borde amable |
| 55 | `fed-buzon` | custodio | CONSTRUIR | NACIONAL | (raíz Nacional: anotar), R23, R25 | 11 · el nacional |
| 56 | `fed-padron` | custodio | CONSTRUIR | NACIONAL | R01, R02, R03, R04 | 11 · el nacional |
| 57 | `fed-censo` | custodio | CONSTRUIR | NACIONAL | R05 | 11 · el nacional |
| 58 | `fed-versiones` | custodio | CONSTRUIR | NACIONAL | R06, R09 | 11 · el nacional |
| 59 | `fed-puesta-en-marcha` | puente | CONSTRUIR | NACIONAL | R07, R08 | 11 · el nacional |
| 60 | `fed-buscador` | reflejo | CONSTRUIR | NACIONAL | R10, R11, R12 | 11 · el nacional |
| 61 | `fed-enrutado` | puente | CONSTRUIR | NACIONAL | R13 | 11 · el nacional |
| 62 | `fed-consolidacion` | reflejo | CONSTRUIR | NACIONAL | R14, R15 | 11 · el nacional |
| 63 | `fed-marca` | custodio | CONSTRUIR | NACIONAL | R16, R17 | 11 · el nacional |
| 64 | `fed-acceso` | custodio | CONSTRUIR | NACIONAL | R19, R20, R21 | 11 · el nacional |
| 65 | `fed-soporte` | puente | CONSTRUIR | NACIONAL | R18 | 11 · el nacional |
| 66 | `fed-acta` | custodio | CONSTRUIR | NACIONAL | R22 | 11 · el nacional |
| 67 | `fed-canon` | reflejo | CONSTRUIR | NACIONAL | R26, R24 | 11 · el nacional |
| 68 | `fed-aviso` | puente | CONSTRUIR | NACIONAL | (flecha N→P: §1.3 flecha 4) | 11 · el nacional |

**Los asteriscos del peldaño.** `contrato-tramos`, `frontera-plaza` y `escaparate` van adelantados al peldaño 4
porque el primero compone el precio (E03) y los otros dos son la puerta del pedido: sin cobertura no hay a quién
pedir, y sin índice no hay dónde pedir. En el §14 de la F3 iban al 10; aquí se adelantan **en la obra**, no en el
diseño.

**Las tres cosas que el orden dice y que no son obvias:**

1. **`contrato-tramos` (8) va antes que `tarifa-pedido` (17)**, al revés que en la v1. E03 compone el
   precio con los tramos: si los tramos se declaran después, la primera semana se compone con tramos
   que no existen. Es un error de orden de la v1 que se corrige aquí.
2. **`propuesta` (31) va antes que `enlace` (35)**, aunque parezca al revés: el enlace *pide* propuestas;
   la propuesta no sabe que existe el enlace. Y `contrato-puntual` (29) va antes que `propuesta` porque
   la aceptación crea el contrato.
3. **`publicacion` (54) se enciende en la plaza el penúltimo día del bloque de la plaza, y `fed-buzon`
   (55) es lo primero del nacional.** Son la misma frontera vista desde los dos lados: si se enciende
   una sin la otra, se pierden hechos sin que nadie lo note — y por eso la plaza puede encenderse sola.

---

## 9 · Las hojas (plantilla de 7 etapas)

Cada bloque lleva: clases que materializa · propósito · **A** dependencias · **B** `module.json` · **C** `index.js` ·
**D** proyecciones internas · **E** handlers RPC con su CLASE (ORDEN = superficie, PREGUNTA = bus) · **F** eventos ·
VERIFICACIÓN · y por qué no reutiliza. Van **agrupadas por unidad** y, dentro de cada unidad, **en el orden de
construcción** (el número del §8).

### ▸ UNIDAD `nacional` — el registro (0 ó 1 despliegue)

#### `fed-buzon` · `CUSTODIO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** (raíz Nacional: anotar) · R23 · R25
- **Propósito:** LA PUERTA DEL NACIONAL. Es el único módulo del nacional que escucha el bus de una plaza: acepta exactamente cuatro formas de hecho, rechaza la quinta y las re-emite tipadas. Aquí viven la guarda del catálogo (R23) y la guarda de la frontera (R25).
- **Depende de:** — (raíz)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem` · `metricas`
- **B · module.json:** `name: "fed-buzon"` · `unidad: "nacional"` · `subscribes:` ["plaza.viva", "tienda.dada-de-alta", "plaza.devengo-cerrado", "plaza.acceso-visto", "fed-buzon.guarda_catalogo.request", "fed-buzon.guarda_frontera.request", "fed-buzon.recibidos.request", "project.activated"] · `publishes:` ["fed-buzon.guarda_catalogo.response", "fed-buzon.guarda_catalogo.failed", "fed-buzon.guarda_frontera.response", "fed-buzon.guarda_frontera.failed", "fed-buzon.recibidos.response", "fed-buzon.recibidos.failed", "bocaos.federacion_plaza_viva", "bocaos.federacion_tienda_publicada", "bocaos.federacion_devengo_cerrado", "bocaos.federacion_acceso_visto", "bocaos.federacion_hecho_rechazado", "bocaos.federacion_fila_sin_plaza", "bocaos.federacion_almacen_con_catalogo"]
- **C · index.js:** `class FedBuzon extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/fed-buzon.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_forma` (La raíz `Nacional.anotar`: cuatro formas cerradas (plaza.viva · tienda.dada-de-alta · devengo-cerrado · acceso-visto). La quinta se rechaza con nombre, no se ignora.) · `_sello` (R25: compara el `plaza_id` de cada fila con la plaza del que la escribió. Sólo tres clases escriben con plaza_id ajeno (R05, R06, R20) y las tres escriben SOBRE una plaza, no DESDE otra.) · `_sin_catalogo` (R23: enumera el almacén del nacional. Si aparece `pedido`, `linea`, `importe`, `direccion` o `posicion`, FALLA con la ruta exacta.) · `_recibidos` (Cuenta y forma de lo recibido por plaza y periodo — el cuadro del buzón, sin nombres de partes.)
- **E · handler:** `onGuardaCatalogoRequest(e)` → `_atender(e, 'guarda_catalogo', 'fed-buzon.guarda_catalogo.response', d => this._guarda_catalogo(d))` · **CLASE: PREGUNTA** — R23: enumeración del almacén nacional → conforme | FALLA(ruta)
- **E · handler:** `onGuardaFronteraRequest(e)` → `_atender(e, 'guarda_frontera', 'fed-buzon.guarda_frontera.response', d => this._guarda_frontera(d))` · **CLASE: PREGUNTA** — R25: cada fila con su plaza → conforme | FALLA(fila, plaza_declarada, plaza_escritora)
- **E · handler:** `onRecibidosRequest(e)` → `_atender(e, 'recibidos', 'fed-buzon.recibidos.response', d => this._recibidos(d))` · **CLASE: PREGUNTA** — Qué ha entrado, por plaza y forma (auditoría 1, sin datos de partes)
- **F · hechos que publica:** `bocaos.federacion_plaza_viva`, `bocaos.federacion_tienda_publicada`, `bocaos.federacion_devengo_cerrado`, `bocaos.federacion_acceso_visto`, `bocaos.federacion_hecho_rechazado`, `bocaos.federacion_fila_sin_plaza`, `bocaos.federacion_almacen_con_catalogo`
- **VERIFICACIÓN:** Publicar una quinta forma (`pedido.creado`) → `bocaos.federacion_hecho_rechazado` y nada escrito. `guarda_catalogo` en verde con el almacén vacío y en rojo en cuanto se crea una tabla con `direccion`.
- **NO REUTILIZA / DECISIÓN:** No se construye un 'validador genérico' en `_shared/`: la forma la fija el negocio y vive en la puerta. Un `schema-validation` compartido dejaría pasar la quinta forma el día que alguien lo afloje.

#### `fed-padron` · `CUSTODIO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R01 · R02 · R03 · R04
- **Propósito:** El padrón: qué plazas existen, en qué estado y desde cuándo. Siete campos por plaza, cuatro estados y una tabla cerrada de transiciones. Con una sola plaza NO se abre.
- **Depende de:** — (raíz)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem` · `project-manager` · `scheduler`
- **B · module.json:** `name: "fed-padron"` · `unidad: "nacional"` · `subscribes:` ["fed-padron.abrir.request", "fed-padron.anotar.request", "fed-padron.de.request", "fed-padron.vivas.request", "bocaos.federacion_verificacion_ok", "bocaos.federacion_verificacion_difiere", "scheduler.job.triggered", "project.activated"] · `publishes:` ["fed-padron.abrir.response", "fed-padron.abrir.failed", "fed-padron.anotar.response", "fed-padron.anotar.failed", "fed-padron.de.response", "fed-padron.de.failed", "fed-padron.vivas.response", "fed-padron.vivas.failed", "bocaos.federacion_plaza_anotada", "bocaos.federacion_plaza_estado", "bocaos.federacion_plaza_silenciosa"]
- **C · index.js:** `class FedPadron extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/fed-padron.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_abrir` (R02: abrir es un ACTO con responsable y fecha; la primera plaza escribe su acta de constitución y NO crea padrón. Sin responsable → SIN_RESPONSABLE.) · `_transitar` (R03: naciendo → operando sólo con verificación en verde; cerrada no vuelve; ningún estado sin hecho con hora.) · `_silencio` (R04: minutos desde el último plaza.viva contra el umbral DEL REGISTRO; alimenta a _transitar, no la sustituye.) · `_siete_campos` (R01: id · localidad · estado · versión · alta · responsable · plaza_id. Ni carta, ni precios, ni número de tiendas.)
- **E · handler:** `onAbrirRequest(e)` → `_atender(e, 'abrir', 'fed-padron.abrir.response', d => this._abrir(d))` · **CLASE: ORDEN** — R02: alta de plaza con responsable y versión inicial → Acta | SIN_RESPONSABLE
- **E · handler:** `onAnotarRequest(e)` → `_atender(e, 'anotar', 'fed-padron.anotar.response', d => this._anotar(d))` · **CLASE: ORDEN** — R01: adopta una plaza ya viva (la primera, el día que nace el registro)
- **E · handler:** `onDeRequest(e)` → `_atender(e, 'de', 'fed-padron.de.response', d => this._de(d))` · **CLASE: PREGUNTA** — R01: ficha de una plaza | NO_HAY
- **E · handler:** `onVivasRequest(e)` → `_atender(e, 'vivas', 'fed-padron.vivas.response', d => this._vivas(d))` · **CLASE: PREGUNTA** — R01: plazas en operando — la lista que hace existir o no al nacional
- **F · hechos que publica:** `bocaos.federacion_plaza_anotada`, `bocaos.federacion_plaza_estado`, `bocaos.federacion_plaza_silenciosa`
- **VERIFICACIÓN:** Primera plaza: acta de constitución y CERO padrón. Segunda plaza: padrón con dos filas y `bocaos.federacion_plaza_anotada` x2. `cerrada` no vuelve; transición sin hecho → 409.
- **NO REUTILIZA / DECISIÓN:** No se reutiliza `project-manager`: gestiona proyectos DENTRO de un despliegue, no despliegues. Un registro de plazas es lo que no existe en Enki — y por eso el nacional es una pieza nueva, no una carpeta.

#### `fed-censo` · `CUSTODIO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R05
- **Propósito:** La copia del censo de tiendas: cuatro campos por tienda, alimentada SÓLO por lo que la plaza publica. Es una copia, no una consulta — si preguntara, tendría la puerta de atrás a su mercado.
- **Depende de:** `fed-buzon`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem` · `project-manager`
- **B · module.json:** `name: "fed-censo"` · `unidad: "nacional"` · `subscribes:` ["fed-censo.de.request", "fed-censo.baja.request", "bocaos.federacion_tienda_publicada", "project.activated"] · `publishes:` ["fed-censo.de.response", "fed-censo.de.failed", "fed-censo.baja.response", "fed-censo.baja.failed", "bocaos.federacion_tienda_censada", "bocaos.federacion_tienda_baja"]
- **C · index.js:** `class FedCenso extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/fed-censo.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_anotar` (R05: id · nombre · estado · plaza_id. La quinta columna que alguien pida (carta, precios, volumen) no tiene dónde ponerse.) · `_baja` (R05: una tienda de baja se marca, no se borra: su nombre en el índice del mes pasado tiene que seguir teniendo explicación.)
- **E · handler:** `onDeRequest(e)` → `_atender(e, 'de', 'fed-censo.de.response', d => this._de(d))` · **CLASE: PREGUNTA** — R05: tiendas de una plaza (para el índice y el cuadro)
- **E · handler:** `onBajaRequest(e)` → `_atender(e, 'baja', 'fed-censo.baja.response', d => this._baja(d))` · **CLASE: ORDEN** — R05: marca de baja publicada por la plaza
- **F · hechos que publica:** `bocaos.federacion_tienda_censada`, `bocaos.federacion_tienda_baja`
- **VERIFICACIÓN:** Alta de tienda en la plaza → una fila aquí, sin haber preguntado a la plaza. `fed-censo` no emite ningún `*.request` hacia una plaza.
- **NO REUTILIZA / DECISIÓN:** `project-manager` conoce los proyectos de UN despliegue; el censo nacional conoce tiendas de N plazas ajenas. Otro dominio, otro dueño.

#### `fed-versiones` · `CUSTODIO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R06 · R09
- **Propósito:** Qué versión dice tener cada plaza y qué puede recibir una plaza atrasada. La versión la declara la plaza; el nacional la guarda y NO la impone.
- **Depende de:** `fed-buzon`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem` · `project-manager`
- **B · module.json:** `name: "fed-versiones"` · `unidad: "nacional"` · `subscribes:` ["bocaos.federacion_plaza_viva", "fed-versiones.de.request", "fed-versiones.compatible.request", "project.activated"] · `publishes:` ["fed-versiones.de.response", "fed-versiones.de.failed", "fed-versiones.compatible.response", "fed-versiones.compatible.failed", "bocaos.federacion_version_declarada", "bocaos.federacion_incompatible"]
- **C · index.js:** `class FedVersiones extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/fed-versiones.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_anotar` (R06: plaza_id · versión · hora en que la declaró. Se anota lo que llega; nunca se escribe la versión de una plaza desde aquí.) · `_compatible` (R09: tabla cerrada [versión → qué puede]. Una plaza atrasada sigue operando: se salta lo que no entiende y lo declara.)
- **E · handler:** `onDeRequest(e)` → `_atender(e, 'de', 'fed-versiones.de.response', d => this._de(d))` · **CLASE: PREGUNTA** — R06: versión declarada por una plaza | NO_CONSTA
- **E · handler:** `onCompatibleRequest(e)` → `_atender(e, 'compatible', 'fed-versiones.compatible.response', d => this._compatible(d))` · **CLASE: PREGUNTA** — R09: ¿puede esta plaza recibir esta forma? sí | no + motivo
- **F · hechos que publica:** `bocaos.federacion_version_declarada`, `bocaos.federacion_incompatible`
- **VERIFICACIÓN:** Una plaza que no publica versión → NO_CONSTA y el cuadro muestra HUECO, no '0'. `compatible(plaza_vieja, hecho_nuevo)` → no + motivo, y el emisor se lo salta.
- **NO REUTILIZA / DECISIÓN:** No hay módulo de versiones de despliegue en Enki (`certificate-authority` firma artefactos, no versiones vivas por instalación). Se construye.

#### `fed-puesta-en-marcha` · `PUENTE` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R07 · R08
- **Propósito:** La única operación del nacional que entra en una plaza: pedirle que arranque. Entra por el arranque, nunca por los datos. La verificación compara lo declarado con lo que la plaza responde.
- **Depende de:** `fed-padron`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `filesystem` · `project-manager`
- **B · module.json:** `name: "fed-puesta-en-marcha"` · `unidad: "nacional"` · `subscribes:` ["fed-puesta-en-marcha.poner.request", "fed-puesta-en-marcha.comprobar.request", "bocaos.federacion_plaza_viva", "project.activated"] · `publishes:` ["fed-puesta-en-marcha.poner.response", "fed-puesta-en-marcha.poner.failed", "fed-puesta-en-marcha.comprobar.response", "fed-puesta-en-marcha.comprobar.failed", "bocaos.federacion_verificacion_ok", "bocaos.federacion_verificacion_difiere"]
- **C · index.js:** `class FedPuestaEnMarcha extends ModuloHibridoReflejo` + cliente del puerto (canal / pago / ruta / publicación). Sin reglas de negocio: traduce y devuelve el resultado del proveedor.
- **D · proyecciones internas:** `_comprobar` (R08: versión declarada vs versión objetivo, estado y tiendas vivas. Si difiere, lo dice y avisa; NO mira dentro para averiguar por qué.) · `_intento` (R07: el intento con plaza, versión objetivo, responsable y hora. Pide arrancar; no configura, no siembra, no toca el mercado.)
- **E · handler:** `onPonerRequest(e)` → `_atender(e, 'poner', 'fed-puesta-en-marcha.poner.response', d => this._poner(d))` · **CLASE: ORDEN** — R07: poner en marcha una plaza con una versión objetivo → Intento | NO_HAY_PLAZA
- **E · handler:** `onComprobarRequest(e)` → `_atender(e, 'comprobar', 'fed-puesta-en-marcha.comprobar.response', d => this._comprobar(d))` · **CLASE: PREGUNTA** — R08: correcta | DIFIERE(qué) | NO_CONSTA
- **F · hechos que publica:** `bocaos.federacion_verificacion_ok`, `bocaos.federacion_verificacion_difiere`
- **VERIFICACIÓN:** Poner en marcha una plaza que no existe → NO_HAY_PLAZA. Plaza que arranca con otra versión → DIFIERE(version) y `naciendo` no pasa a `operando`.
- **NO REUTILIZA / DECISIÓN:** `gateway-manager` arranca gateways de protocolo, no instalaciones de un vertical. Otro dominio.

#### `fed-buscador` · `REFLEJO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R10 · R11 · R12
- **Propósito:** Buscar una tienda por localidad y nombre, y devolver su plaza. Sin puntuar, sin recomendar, sin sugerir. El índice se reescribe del padrón y del censo: no tiene vida propia.
- **Depende de:** `fed-padron`, `fed-censo`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "fed-buscador"` · `unidad: "nacional"` · `subscribes:` ["fed-buscador.buscar.request", "fed-buscador.indice.request"] · `publishes:` ["fed-buscador.buscar.response", "fed-buscador.buscar.failed", "fed-buscador.indice.response", "fed-buscador.indice.failed"]
- **C · index.js:** `class FedBuscador extends ModuloHibridoReflejo`. Sin estado, sin `PosPersistencia`: si guardara una copia, habría dos verdades y una sería vieja.
- **D · proyecciones internas:** `_indice` (R10: se reescribe de padrón+censo en cada consulta. Cuatro campos por fila: plaza, localidad, tienda, estado.) · `_buscar` (R11: por localidad y nombre de tienda, y por nada más (Q48). Orden declarado con desempate escrito. Si no encuentra, NO SUGIERE.) · `_resultado` (R12: la fila con su plaza dentro. No hay constructor de resultado sin plaza; sin plaza no hay a dónde enrutar.)
- **E · handler:** `onBuscarRequest(e)` → `_atender(e, 'buscar', 'fed-buscador.buscar.response', d => this._buscar(d))` · **CLASE: PREGUNTA** — R11: → [ResultadoConSuPlaza] · lista vacía
- **E · handler:** `onIndiceRequest(e)` → `_atender(e, 'indice', 'fed-buscador.indice.response', d => this._indice(d))` · **CLASE: PREGUNTA** — R10: el índice entero de una localidad (lo usa el buscador y nada más)
- **F · hechos que publica:** — (ninguno: sólo calcula)
- **VERIFICACIÓN:** Buscar 'pizza' (un producto) → vacío, no 'quizá te interese'. Buscar una localidad sin tiendas → lista vacía. Ningún resultado sin `plaza_id`.
- **NO REUTILIZA / DECISIÓN:** `apis-publicas` y `cantera-semantica` son índices de OTRA cosa (servicios y skills) y rankean por relevancia: exactamente lo que R11 prohíbe. Se toma el patrón de índice barato, no el módulo.

#### `fed-enrutado` · `PUENTE` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R13
- **Propósito:** El clic sale del nacional y entra en la plaza. El nacional NO sirve la página: redirige, sin añadir marca, parámetro ni 'vienes de Bocaos'. Y no deja rastro: un clic contado es demanda medida.
- **Depende de:** `fed-buscador`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "fed-enrutado"` · `unidad: "nacional"` · `subscribes:` ["fed-enrutado.enrutar.request"] · `publishes:` ["fed-enrutado.enrutar.response", "fed-enrutado.enrutar.failed"]
- **C · index.js:** `class FedEnrutado extends ModuloHibridoReflejo` + cliente del puerto (canal / pago / ruta / publicación). Sin reglas de negocio: traduce y devuelve el resultado del proveedor.
- **D · proyecciones internas:** `_salida` (R13: de un ResultadoConSuPlaza a la URL de SU plaza. Nada más viaja: ni marca, ni parámetro de seguimiento.) · `_sin_rastro` (R13: no se escribe ni se publica nada por un clic. Un contador de clics sería el primer dato de demanda del nacional.)
- **E · handler:** `onEnrutarRequest(e)` → `_atender(e, 'enrutar', 'fed-enrutado.enrutar.response', d => this._enrutar(d))` · **CLASE: ORDEN** — R13: → salida hacia la plaza del resultado (302 con la URL firmada por la plaza, no por el nacional)
- **F · hechos que publica:** — (ninguno: sólo calcula)
- **VERIFICACIÓN:** Enrutar devuelve una URL que apunta a la plaza; el payload no contiene marca ni tracking. `fed-enrutado` no publica ningún hecho.
- **NO REUTILIZA / DECISIÓN:** Un `redirect` de tres líneas se podría haber puesto dentro de `fed-buscador`. No: es la frontera que separa un directorio de un marketplace, y una frontera dentro de otro módulo no se puede auditar.

#### `fed-consolidacion` · `REFLEJO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R14 · R15
- **Propósito:** Sumar devengos YA CERRADOS por las plazas, con la definición con la que se calcularon, y dar el cuadro de la federación con agregados de plaza — nunca de pedido.
- **Depende de:** `fed-buzon`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "fed-consolidacion"` · `unidad: "nacional"` · `subscribes:` ["bocaos.federacion_devengo_cerrado", "fed-consolidacion.consolidar.request", "fed-consolidacion.cuadro.request", "project.activated"] · `publishes:` ["fed-consolidacion.consolidar.response", "fed-consolidacion.consolidar.failed", "fed-consolidacion.cuadro.response", "fed-consolidacion.cuadro.failed", "bocaos.federacion_consolidado"]
- **C · index.js:** `class FedConsolidacion extends ModuloHibridoReflejo`. Sin estado, sin `PosPersistencia`: si guardara una copia, habría dos verdades y una sería vieja.
- **D · proyecciones internas:** `_consolidar` (R14: suma por plaza y periodo. No convierte moneda, no compensa, no prorratea, no cobra. Sin netting entre plazas.) · `_con_definicion` (R14: cada cifra lleva dentro la definición con la que se calculó (Q53/Q56). Sin eso, el cuadro compara peras con manzanas.) · `_cuadro` (R15: plazas vivas · versiones · aceptación por plaza · devengo · canon emitido vs pagado. Lo que no consta es HUECO, no cero.)
- **E · handler:** `onConsolidarRequest(e)` → `_atender(e, 'consolidar', 'fed-consolidacion.consolidar.response', d => this._consolidar(d))` · **CLASE: PREGUNTA** — R14: { por_plaza[], total, definicion_usada }
- **E · handler:** `onCuadroRequest(e)` → `_atender(e, 'cuadro', 'fed-consolidacion.cuadro.response', d => this._cuadro(d))` · **CLASE: PREGUNTA** — R15: el cuadro del periodo, con huecos declarados
- **F · hechos que publica:** `bocaos.federacion_consolidado`
- **VERIFICACIÓN:** Dos plazas con definiciones distintas → el cuadro muestra dos definiciones y NO un total comparable. Plaza sin devengo cerrado → HUECO.
- **NO REUTILIZA / DECISIÓN:** `contabilidad-libro/cuenta-resultados` suma la contabilidad de UN proyecto con su plan contable. Aquí se suman cierres ajenos con definiciones distintas y sin plan común: otro dominio.

#### `fed-marca` · `CUSTODIO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R16 · R17
- **Propósito:** La marca del nacional: B2B, nunca vista por el cliente final. Y el permiso de uso por plaza, con alcance, plazo y causa de retirada. El activo y el permiso son dos cosas con dos dueños.
- **Depende de:** — (raíz)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "fed-marca"` · `unidad: "nacional"` · `subscribes:` ["fed-marca.declarar.request", "fed-marca.de.request", "fed-marca.licenciar.request", "fed-marca.licencia.request", "fed-marca.retirar.request", "project.activated"] · `publishes:` ["fed-marca.declarar.response", "fed-marca.declarar.failed", "fed-marca.de.response", "fed-marca.de.failed", "fed-marca.licenciar.response", "fed-marca.licenciar.failed", "fed-marca.licencia.response", "fed-marca.licencia.failed", "fed-marca.retirar.response", "fed-marca.retirar.failed", "bocaos.federacion_marca_declarada", "bocaos.federacion_licencia_concedida", "bocaos.federacion_licencia_retirada"]
- **C · index.js:** `class FedMarca extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/fed-marca.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_declarar` (R16: nombre · signos · ámbito (B2B) · titular. Ámbito cerrado: las cinco cosas del acta y ni una más.) · `_licencia` (R17: qué puede hacer la plaza con la marca (rótulo, dominio, papelería, nombre comercial), desde/hasta y causa. Sin licencia no se puede poner en ningún sitio.) · `_retirar` (R17: retirar es el único castigo real del registro, y llega tarde (fricción 9). Se anota con causa y hora.)
- **E · handler:** `onDeclararRequest(e)` → `_atender(e, 'declarar', 'fed-marca.declarar.response', d => this._declarar(d))` · **CLASE: ORDEN** — R16: la marca del nacional con su ámbito
- **E · handler:** `onLicenciarRequest(e)` → `_atender(e, 'licenciar', 'fed-marca.licenciar.response', d => this._licenciar(d))` · **CLASE: ORDEN** — R17: concesión a una plaza con alcance, desde y hasta
- **E · handler:** `onRetirarRequest(e)` → `_atender(e, 'retirar', 'fed-marca.retirar.response', d => this._retirar(d))` · **CLASE: ORDEN** — R17: retirada con causa y hora
- **E · handler:** `onLicenciaRequest(e)` → `_atender(e, 'licencia', 'fed-marca.licencia.response', d => this._licencia(d))` · **CLASE: PREGUNTA** — R17: licencia vigente de una plaza | NO_CONSTA
- **F · hechos que publica:** `bocaos.federacion_marca_declarada`, `bocaos.federacion_licencia_concedida`, `bocaos.federacion_licencia_retirada`
- **VERIFICACIÓN:** Licencia vencida → `licencia()` NO_CONSTA y la plaza no puede usar la marca. La marca del nacional no aparece en ningún tópico que baje a una plaza.
- **NO REUTILIZA / DECISIÓN:** `pizzepos/carta-marketing` guarda la marca DE UN PROYECTO y la sirve al canal digital. Aquí la marca es un activo licenciable con plazo y retirada: otro objeto.

#### `fed-acceso` · `CUSTODIO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R19 · R20 · R21
- **Propósito:** El permiso, su traza y el acceso delegado: tres cosas que caducan solas. La plaza concede; el nacional sólo anota lo que llegó publicado. Todo uso escribe la traza antes de devolver nada.
- **Depende de:** `fed-buzon`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "fed-acceso"` · `unidad: "nacional"` · `subscribes:` ["bocaos.federacion_acceso_visto", "fed-acceso.abrir.request", "fed-acceso.usar.request", "fed-acceso.vencer.request", "fed-acceso.traza.request", "project.activated"] · `publishes:` ["fed-acceso.abrir.response", "fed-acceso.abrir.failed", "fed-acceso.usar.response", "fed-acceso.usar.failed", "fed-acceso.vencer.response", "fed-acceso.vencer.failed", "fed-acceso.traza.response", "fed-acceso.traza.failed", "bocaos.federacion_acceso_anotado", "bocaos.federacion_acceso_vencido", "bocaos.federacion_acceso_denegado"]
- **C · index.js:** `class FedAcceso extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/fed-acceso.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_anotar` (R19: sólo anota una concesión que LLEGÓ PUBLICADA. No hay método para crearla desde dentro: si lo hubiera, el soporte se daría permiso solo.) · `_traza` (R20: append-only. plaza · quién · cuándo · con qué permiso · QUÉ se consultó (por nombre de cosa). Una corrección es otra línea que desmiente.) · `_usar` (R21: si la traza no se puede escribir, NO se consulta. El registro no puede mirar sin dejar rastro.) · `_vencer` (R21: el permiso caduca solo; un acceso sin vencimiento es un rol permanente con otro nombre.)
- **E · handler:** `onAbrirRequest(e)` → `_atender(e, 'abrir', 'fed-acceso.abrir.response', d => this._abrir(d))` · **CLASE: ORDEN** — R21: abre acceso desde un permiso vivo → Acceso | VENCIDO
- **E · handler:** `onUsarRequest(e)` → `_atender(e, 'usar', 'fed-acceso.usar.response', d => this._usar(d))` · **CLASE: ORDEN** — R21: usa el acceso para UNA consulta; escribe traza; devuelve nada si no pudo escribirla
- **E · handler:** `onVencerRequest(e)` → `_atender(e, 'vencer', 'fed-acceso.vencer.response', d => this._vencer(d))` · **CLASE: ORDEN** — R21: cierra lo vencido (reloj del registro)
- **E · handler:** `onTrazaRequest(e)` → `_atender(e, 'traza', 'fed-acceso.traza.response', d => this._traza(d))` · **CLASE: PREGUNTA** — R20: la traza de una plaza y periodo — la plaza puede leer LA SUYA
- **F · hechos que publica:** `bocaos.federacion_acceso_anotado`, `bocaos.federacion_acceso_vencido`, `bocaos.federacion_acceso_denegado`
- **VERIFICACIÓN:** `abrir` sin concesión publicada → SIN_CONCESIÓN. `usar` con el fs caído → 500 y NINGÚN dato devuelto. Traza de una plaza no se puede leer pidiendo otra.
- **NO REUTILIZA / DECISIÓN:** Aquí puede fallar la auditoría 1: si `_traza` guarda el payload de lo visto en vez del NOMBRE de la cosa, el nacional tiene pedidos. Test: `que` ∈ lista cerrada.

#### `fed-soporte` · `PUENTE` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R18
- **Propósito:** Soporte de nivel 2: software y método. No opera pedidos. Todo lo que sea 'mira este pedido' pasa por un permiso de la plaza, con plazo y traza.
- **Depende de:** `fed-acceso`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `filesystem` · `credential-manager`
- **B · module.json:** `name: "fed-soporte"` · `unidad: "nacional"` · `subscribes:` ["fed-soporte.abrir.request", "fed-soporte.responder.request", "fed-soporte.escalar.request", "project.activated"] · `publishes:` ["fed-soporte.abrir.response", "fed-soporte.abrir.failed", "fed-soporte.responder.response", "fed-soporte.responder.failed", "fed-soporte.escalar.response", "fed-soporte.escalar.failed", "bocaos.federacion_caso_abierto", "bocaos.federacion_caso_escalado", "bocaos.federacion_soporte_sin_permiso"]
- **C · index.js:** `class FedSoporte extends ModuloHibridoReflejo` + cliente del puerto (canal / pago / ruta / publicación). Sin reglas de negocio: traduce y devuelve el resultado del proveedor.
- **D · proyecciones internas:** `_abrir` (R18: caso con plaza, tipo (software|método), hora y plazo. Sin permiso vivo de la plaza no hay caso de datos.) · `_escalar` (R18: si la plaza está caída no puede conceder permiso; sin permiso de emergencia declarado (Q46) el soporte hace lo que puede desde fuera y LO DICE.)
- **E · handler:** `onAbrirRequest(e)` → `_atender(e, 'abrir', 'fed-soporte.abrir.response', d => this._abrir(d))` · **CLASE: ORDEN** — R18: abre caso de nivel 2
- **E · handler:** `onResponderRequest(e)` → `_atender(e, 'responder', 'fed-soporte.responder.response', d => this._responder(d))` · **CLASE: ORDEN** — R18: respuesta con quién y cuándo
- **E · handler:** `onEscalarRequest(e)` → `_atender(e, 'escalar', 'fed-soporte.escalar.response', d => this._escalar(d))` · **CLASE: ORDEN** — R18: pasa a la plaza (o falla declarando que no hay permiso)
- **F · hechos que publica:** `bocaos.federacion_caso_abierto`, `bocaos.federacion_caso_escalado`, `bocaos.federacion_soporte_sin_permiso`
- **VERIFICACIÓN:** Caso que pide 'los pedidos de Málaga' → `bocaos.federacion_soporte_sin_permiso` y ningún dato. Con permiso vivo → lee, y la traza se escribe ANTES de devolver.
- **NO REUTILIZA / DECISIÓN:** El soporte NO escribe la traza de lo que mira: se la pide a `fed-acceso`. El que mira no firma su propia coartada.

#### `fed-acta` · `CUSTODIO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R22
- **Propósito:** El acta de la federación: las cinco cosas que se comparten (marca, software, soporte, registro, consolidación) y nada más. Cualquier sexta es un cambio de naturaleza, no una función nueva.
- **Depende de:** `fed-padron`, `fed-marca`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "fed-acta"` · `unidad: "nacional"` · `subscribes:` ["fed-acta.asentar.request", "fed-acta.de.request", "project.activated"] · `publishes:` ["fed-acta.asentar.response", "fed-acta.asentar.failed", "fed-acta.de.response", "fed-acta.de.failed", "bocaos.federacion_acta_asentada"]
- **C · index.js:** `class FedActa extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/fed-acta.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_asentar` (R22: lista CERRADA de cinco cosas, versión de las reglas comunes, fecha y firma. La sexta no se escribe: exige otra acta.) · `_corresponsabilidad` (R22: con datos personales de por medio, el acta dice quién responde de qué (Q53). No es un anexo: es la mitad del acta.)
- **E · handler:** `onAsentarRequest(e)` → `_atender(e, 'asentar', 'fed-acta.asentar.response', d => this._asentar(d))` · **CLASE: ORDEN** — R22: aceptación de una plaza con las cinco cosas, versión y firma
- **E · handler:** `onDeRequest(e)` → `_atender(e, 'de', 'fed-acta.de.response', d => this._de(d))` · **CLASE: PREGUNTA** — R22: el acta de una plaza | NO_CONSTA (y entonces no hay federación, hay un manual)
- **F · hechos que publica:** `bocaos.federacion_acta_asentada`
- **VERIFICACIÓN:** Acta con una sexta cosa → 422 con el nombre de la cosa. Plaza sin acta → no cuenta en el cuadro como federada (aparece como plaza suelta).
- **NO REUTILIZA / DECISIÓN:** `project-profile` describe un proyecto; el acta es un acuerdo entre instalaciones con corresponsabilidad RGPD. Otro dominio, otra firma.

#### `fed-canon` · `REFLEJO` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** R26 · R24
- **Propósito:** El ÚNICO camino de dinero que sale del nacional: un documento A UNA PLAZA, sobre el fee que la plaza ya devengó. Existe sólo desde la segunda plaza. Con una, no hay canon.
- **Depende de:** `fed-consolidacion`, `fed-padron`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "fed-canon"` · `unidad: "nacional"` · `subscribes:` ["fed-canon.calcular.request", "fed-canon.documento.request", "fed-canon.guarda_recauda.request", "project.activated"] · `publishes:` ["fed-canon.calcular.response", "fed-canon.calcular.failed", "fed-canon.documento.response", "fed-canon.documento.failed", "fed-canon.guarda_recauda.response", "fed-canon.guarda_recauda.failed", "bocaos.federacion_canon_emitido", "bocaos.federacion_canon_sin_coeficiente"]
- **C · index.js:** `class FedCanon extends ModuloHibridoReflejo`. Sin estado, sin `PosPersistencia`: si guardara una copia, habría dos verdades y una sería vieja.
- **D · proyecciones internas:** `_calcular` (R26: coeficiente × devengo CERRADO publicado. Sin coeficiente → NO_CONSTA y no se emite documento (un canon inventado es una cuota que nadie aceptó).) · `_documento` (R26: documento a UNA plaza y un periodo. La plaza lo paga por su canal; el nacional no entra en su ciclo, no descuenta, no retiene, no compensa.) · `_guarda_no_recauda` (R24: recorre los caminos de dinero que SALEN del nacional. Único permitido: este. Todo lo demás falla con el camino exacto.) · `_sujeto_pasivo` (Decisión C: con menos de dos plazas `documento()` → NO_HAY. No hay a quién cobrarle ni con qué justificarlo.)
- **E · handler:** `onCalcularRequest(e)` → `_atender(e, 'calcular', 'fed-canon.calcular.response', d => this._calcular(d))` · **CLASE: PREGUNTA** — R26: céntimos | NO_CONSTA (sin coeficiente)
- **E · handler:** `onDocumentoRequest(e)` → `_atender(e, 'documento', 'fed-canon.documento.response', d => this._documento(d))` · **CLASE: ORDEN** — R26: emite el documento de una plaza y un periodo → Documento | NO_HAY (una sola plaza)
- **E · handler:** `onGuardaRecaudaRequest(e)` → `_atender(e, 'guarda_recauda', 'fed-canon.guarda_recauda.response', d => this._guarda_recauda(d))` · **CLASE: PREGUNTA** — R24: lista enumerable de caminos de dinero → conforme | FALLA(camino)
- **F · hechos que publica:** `bocaos.federacion_canon_emitido`, `bocaos.federacion_canon_sin_coeficiente`
- **VERIFICACIÓN:** Con una plaza: `documento()` → NO_HAY y `guarda_recauda` en verde por lista vacía (asterisco declarado). Con dos y sin coeficiente: NO_CONSTA, cuadro dice 'canon sin declarar'.
- **NO REUTILIZA / DECISIÓN:** El documento NO viaja por el bus a la plaza: sale por el canal administrativo. Si viajara, sería una tercera flecha N→P y rompería la lista cerrada.

#### `fed-aviso` · `PUENTE` · acción **CONSTRUIR** · unidad **NACIONAL**

- **Clases:** (flecha N→P: §1.3 flecha 4)
- **Propósito:** La única flecha del nacional hacia una plaza materializada como módulo: dos avisos, los dos ignorables. `version.nueva` (aviso) y `plaza.suspendida` (orden de registro). Nada más baja.
- **Depende de:** `fed-versiones`, `fed-padron`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "fed-aviso"` · `unidad: "nacional"` · `subscribes:` ["fed-aviso.emitir.request", "bocaos.federacion_plaza_estado", "bocaos.federacion_version_declarada"] · `publishes:` ["version.nueva", "plaza.suspendida", "bocaos.federacion_aviso_no_enviado"]
- **C · index.js:** `class FedAviso extends ModuloHibridoReflejo` + cliente del puerto Publicación, en su dirección de bajada. Sin store: un aviso emitido no se guarda (guardarlo sería llevar la cuenta de lo que el otro no contestó).
- **D · proyecciones internas:** `_compatible` (Pregunta a `fed-versiones.compatible` antes de emitir: lo que la plaza no entiende no se le manda, y se declara el salto.) · `_sin_respuesta` (No hay `.response`: el aviso no espera acuse. Esperar acuse convertiría un aviso en una dependencia de arranque.)
- **E · handler:** `onEmitirRequest(e)` → `_atender(e, 'emitir', 'fed-aviso.emitir.response', d => this._emitir(d))` · **CLASE: ORDEN** — Emite `version.nueva` a las plazas vivas, o `plaza.suspendida` a una (sale del mapa, no se apaga)
- **F · hechos que publica:** `version.nueva`, `plaza.suspendida`, `bocaos.federacion_aviso_no_enviado`
- **VERIFICACIÓN:** Parar el nacional: las plazas siguen. Emitir a una plaza atrasada → `aviso_no_enviado` con motivo y la plaza no se enteró.
- **NO REUTILIZA / DECISIÓN:** Un módulo de una sola dirección y sin respuesta parece poco. Es la flecha que la auditoría 4 vigila: si esta pieza pidiera acuse, apagar el nacional tumbaría medio negocio.

### ▸ UNIDAD `plaza` — el mercado (1 despliegue por plaza)

#### `scheduler` · `MICRO-AGENTE` · acción **REUTILIZAR** · unidad **PLAZA**

- **Clases:** — (puerta/flecha del contenedor, sin clase en el diseño)
- **Propósito:** Primitiva real de Enki: dispara el ciclo semanal y el latido de `plaza.viva`. No se construye ni se toca.
- **Depende de:** — (raíz)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `scheduler`
- **B · module.json:** `name: "scheduler"` · `unidad: "plaza"` · `subscribes:` [[]] · `publishes:` [[]]
- **C · index.js:** — (no se construye: el módulo real `modules/scheduler` se usa tal cual; no se le añade una línea)
- **D · proyecciones internas:** — (no calcula nada propio)
- **E · handlers:** — (módulo real de Enki: no se toca)
- **F · hechos que publica:** — (ninguno: sólo calcula)
- **VERIFICACIÓN:** module.json real intacto (v1.0.0); jobs `bocaos.ciclo_semanal` y `bocaos.plaza.viva` creados en project.activated y disparando `scheduler.job.triggered` con el nombre.
- **NO REUTILIZA / DECISIÓN:** REUTILIZAR tal cual: publica `scheduler.job.triggered/.completed/.failed` y acepta cron/interval/datetime/evento. No se le pone ningún valor de negocio dentro.

#### `acta-decisiones` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** O02
- **Propósito:** El acta de la plaza: ningún cambio de regla se escribe sin acta; el acta no se corrige, se superpone. Y con tres unidades, la firma dice el ÁMBITO: una solicitud de tienda la responde el dueño de esa tienda.
- **Depende de:** — (raíz)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "acta-decisiones"` · `unidad: "plaza"` · `subscribes:` ["acta-decisiones.asentar.request", "acta-decisiones.listar.request", "bocaos.dictamen_firmado", "project.activated"] · `publishes:` ["acta-decisiones.asentar.response", "acta-decisiones.asentar.failed", "acta-decisiones.listar.response", "acta-decisiones.listar.failed", "bocaos.acta_asentada"]
- **C · index.js:** `class ActaDecisiones extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/acta-decisiones.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_asentar` (O02: cambio + motivo + autor + ámbito + vigencia, o no hay cambio.) · `_de_instante` (O02: qué estaba vigente entonces, para explicar una decisión vieja.) · `_ambito` (§8: la firma lleva ámbito (tienda | plaza) y no se cruza. El dueño de la plaza no puede firmar una solicitud de una tienda.)
- **E · handler:** `onAsentarRequest(e)` → `_atender(e, 'asentar', 'acta-decisiones.asentar.response', d => this._asentar(d))` · **CLASE: ORDEN** — O02: asienta el cambio con su ámbito y vigencia
- **E · handler:** `onListarRequest(e)` → `_atender(e, 'listar', 'acta-decisiones.listar.response', d => this._listar(d))` · **CLASE: PREGUNTA** — O02: el acta de un periodo
- **F · hechos que publica:** `bocaos.acta_asentada`
- **VERIFICACIÓN:** Dos actas sobre el mismo asunto: la primera no cambia. Cambio sin acta → 409 y no se escribe la política.
- **NO REUTILIZA / DECISIÓN:** `estados` y `contabilidad-*/historial-proceso-contable` son append-only de OTRO dominio. Se toma el patrón, no el módulo.

#### `config-mercado` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** J01 · J02 · J03 · J04 · J05 · G01
- **Propósito:** La política de la plaza: cuatro umbrales, ventana, zonas, el orden de candidatos y las tres N de la espera. DOS CAPAS: la de la plaza (default) y la que declara cada tienda, con precedencia escrita. Ninguna versión sin autor, vigencia y acta.
- **Depende de:** `acta-decisiones`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "config-mercado"` · `unidad: "plaza"` · `subscribes:` ["config-mercado.declarar.request", "config-mercado.politica.request", "config-mercado.simular.request", "bocaos.dictamen_firmado", "project.activated"] · `publishes:` ["config-mercado.declarar.response", "config-mercado.declarar.failed", "config-mercado.politica.response", "config-mercado.politica.failed", "config-mercado.simular.response", "config-mercado.simular.failed", "bocaos.politica_declarada"]
- **C · index.js:** `class ConfigMercado extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/config-mercado.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_declarar` (J01: ámbito (plaza|tienda) · cuatro números · autor · desde. Una tienda sólo puede fijar SUS cuatro números; no hay dónde poner un quinto criterio.) · `_politica_vigente` (J04: la de la TIENDA si existe y está vigente; si no, la de la PLAZA. La precedencia es una tabla, no una negociación.) · `_forma` (J01: cuatro umbrales, en m · min · min · c€, en AND. La vertical fija la forma; aquí sólo viven los valores.) · `_tres_esperas` (G01: N1 tienda 8 min · N2 portal 5 min · N3 entrega 10 min (Q28).) · `_zona` (J03: cobertura de la plaza por zona. Es la mitad de la intersección con D06.) · `_simular` (J05: re-ejecuta la comparación sobre hechos históricos y declara sus límites. No aplica.)
- **E · handler:** `onDeclararRequest(e)` → `_atender(e, 'declarar', 'config-mercado.declarar.response', d => this._declarar(d))` · **CLASE: ORDEN** — J01/J02/J03/G01: nueva versión con autor, desde, ámbito y acta
- **E · handler:** `onPoliticaRequest(e)` → `_atender(e, 'politica', 'config-mercado.politica.response', d => this._politica(d))` · **CLASE: PREGUNTA** — J04: la política viva en (instante, tienda) con su CAPA y su autor | NO_CONSTA
- **E · handler:** `onSimularRequest(e)` → `_atender(e, 'simular', 'config-mercado.simular.response', d => this._simular(d))` · **CLASE: PREGUNTA** — J05: qué habría pasado con estos números, sobre hechos ya escritos
- **F · hechos que publica:** `bocaos.politica_declarada`
- **VERIFICACIÓN:** Declarar el default de la plaza y los de una tienda → `politica(t, tienda)` da la de la tienda y dice la capa. Cambiar el default NO cambia la de la tienda que declaró.
- **NO REUTILIZA / DECISIÓN:** Esta hoja absorbe la segunda capa que la v1 no tenía. Es la única hoja que cambia de FORMA sin cambiar de sitio: sigue en la plaza porque es la plaza quien la aplica al proponer (y la tienda no puede legislar sobre el rider).

#### `censo-parte` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** I01 · I02 · M02 · M03 · P04
- **Propósito:** El censo del mercado: qué tiendas y qué riders existen para ESTA plaza, con lo que acreditan y la zona que declaran. Un rider a medias NO entra. Sin exclusividad (M03).
- **Depende de:** `config-mercado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem` · `project-manager` · `credential-manager`
- **B · module.json:** `name: "censo-parte"` · `unidad: "plaza"` · `subscribes:` ["censo-parte.alta.request", "censo-parte.checklist.request", "censo-parte.de.request", "censo-parte.zona.request", "bocaos.terminos_aceptados", "project.activated"] · `publishes:` ["censo-parte.alta.response", "censo-parte.alta.failed", "censo-parte.checklist.response", "censo-parte.checklist.failed", "censo-parte.de.response", "censo-parte.de.failed", "censo-parte.zona.response", "censo-parte.zona.failed", "bocaos.censo_actualizado", "bocaos.censo_incompleto"]
- **C · index.js:** `class CensoParte extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/censo-parte.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_alta_tienda` (I01: da de alta la tienda Y crea su proyecto en el despliegue (`project-manager`). Una tienda sin proyecto no tiene carta, ni carrito, ni clientes.) · `_alta_rider` (I02: identidad fiscal, KYC, autónomo, seguro, vehículo (Q34). Incompleta → no entra en A04.) · `_checklist` (P04: lo que falta, derivado del alta. Sin criterios ocultos.) · `_sin_exclusividad` (M03: falla si aparece exclusividad, permanencia, turno, cuota mínima o antigüedad (Q35: 0).) · `_zona_rider` (M02: las zonas que el rider declara y cambia cuando quiere.) · `_elegibles` (A04: estado, zona y capacidad. Ni un cuarto dato. Sin antigüedad.)
- **E · handler:** `onAltaRequest(e)` → `_atender(e, 'alta', 'censo-parte.alta.response', d => this._alta(d))` · **CLASE: ORDEN** — I01/I02: alta de tienda o rider → Censo | INCOMPLETA(checklist)
- **E · handler:** `onChecklistRequest(e)` → `_atender(e, 'checklist', 'censo-parte.checklist.response', d => this._checklist(d))` · **CLASE: PREGUNTA** — P04: qué falta para el alta
- **E · handler:** `onDeRequest(e)` → `_atender(e, 'de', 'censo-parte.de.response', d => this._de(d))` · **CLASE: PREGUNTA** — I01/I02: ficha declarada de una parte
- **E · handler:** `onZonaRequest(e)` → `_atender(e, 'zona', 'censo-parte.zona.response', d => this._zona(d))` · **CLASE: ORDEN** — M02: el rider declara sus zonas
- **F · hechos que publica:** `bocaos.censo_actualizado`, `bocaos.censo_incompleto`
- **VERIFICACIÓN:** Alta de rider sin seguro → INCOMPLETA y no aparece en la foto. Alta de tienda → proyecto creado + `tienda.dada-de-alta` publicado por `publicacion`.
- **NO REUTILIZA / DECISIÓN:** Aquí está la única escritura de `project-manager` en toda la vertical: dar de alta una tienda ES crear un proyecto. Es la bisagra que hace verdad el corte de la F0.

#### `estado-parte` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** I03 · I04
- **Propósito:** Estado vivo de cada parte: tienda abierta/cerrada/saturada, rider disponible/ocupado/en pausa. La pausa la declara ÉL, siempre.
- **Depende de:** `censo-parte`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "estado-parte"` · `unidad: "plaza"` · `subscribes:` ["estado-parte.declarar.request", "estado-parte.de.request", "estado-parte.vigentes.request", "bocaos.contrato_creado", "bocaos.contrato_cerrado", "bocaos.parte_sancionada", "project.activated"] · `publishes:` ["estado-parte.declarar.response", "estado-parte.declarar.failed", "estado-parte.de.response", "estado-parte.de.failed", "estado-parte.vigentes.response", "estado-parte.vigentes.failed", "bocaos.estado_parte_declarado"]
- **C · index.js:** `class EstadoParte extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/estado-parte.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_transitar` (I04: 'ocupado' no lo pone la sala, lo pone el contrato vivo. La pausa sólo la declara el rider.) · `_vigentes` (I03/I04: disponibles por zona; el que está en pausa no aparece y nadie puede levantarla.)
- **E · handler:** `onDeclararRequest(e)` → `_atender(e, 'declarar', 'estado-parte.declarar.response', d => this._declarar(d))` · **CLASE: ORDEN** — I03/I04: la parte declara su estado, con hora
- **E · handler:** `onDeRequest(e)` → `_atender(e, 'de', 'estado-parte.de.response', d => this._de(d))` · **CLASE: PREGUNTA** — I03/I04: estado vigente de una parte
- **E · handler:** `onVigentesRequest(e)` → `_atender(e, 'vigentes', 'estado-parte.vigentes.response', d => this._vigentes(d))` · **CLASE: PREGUNTA** — A02: riders disponibles de esta plaza AHORA
- **F · hechos que publica:** `bocaos.estado_parte_declarado`
- **VERIFICACIÓN:** La sala intenta poner en pausa a un rider → 403. Contrato creado → ocupado; cerrado → disponible.
- **NO REUTILIZA / DECISIÓN:** Sin cambios de unidad respecto a la v1: el estado es del mercado, no de la tienda. La tienda tiene su radio y su marca, no su disponibilidad en el censo.

#### `terminos-parte` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** I08
- **Propósito:** Lo que cada parte aceptó, con versión y hora. Sin términos vigentes no hay propuesta ni devengo para esa parte.
- **Depende de:** `censo-parte`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "terminos-parte"` · `unidad: "plaza"` · `subscribes:` ["terminos-parte.aceptar.request", "terminos-parte.vigentes.request", "project.activated"] · `publishes:` ["terminos-parte.aceptar.response", "terminos-parte.aceptar.failed", "terminos-parte.vigentes.response", "terminos-parte.vigentes.failed", "bocaos.terminos_aceptados"]
- **C · index.js:** `class TerminosParte extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/terminos-parte.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_aceptar` (I08: cambio de términos NO retroactivo; quien no acepta la nueva sigue con la vieja.) · `_vigentes` (I08: puerta dura — sin términos, `enlace` no propone y `liquidacion` no devenga.)
- **E · handler:** `onAceptarRequest(e)` → `_atender(e, 'aceptar', 'terminos-parte.aceptar.response', d => this._aceptar(d))` · **CLASE: ORDEN** — I08: aceptación de una versión, con hora
- **E · handler:** `onVigentesRequest(e)` → `_atender(e, 'vigentes', 'terminos-parte.vigentes.response', d => this._vigentes(d))` · **CLASE: PREGUNTA** — I08: versión vigente para una parte en un instante
- **F · hechos que publica:** `bocaos.terminos_aceptados`
- **VERIFICACIÓN:** Parte sin términos → no se le propone ni se le devenga. Aceptar v2 no reescribe v1.
- **NO REUTILIZA / DECISIÓN:** Sin cambios.

#### `ruta-viva` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** B01 · B02 · B03 · B04 · B05 · B06
- **Propósito:** El trayecto que el rider ya lleva encima: última posición, paradas derivadas de los contratos vivos, promesa por parada, capacidad declarada. Por plaza: un rider en dos plazas tiene dos trayectorias y una sola espalda.
- **Depende de:** `censo-parte`, `estado-parte`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "ruta-viva"` · `unidad: "plaza"` · `subscribes:` ["ruta-viva.posicion.request", "ruta-viva.paradas.request", "ruta-viva.promesa.request", "ruta-viva.capacidad.request", "bocaos.contrato_creado", "bocaos.contrato_cerrado", "bocaos.hecho_reparto_anotado", "project.activated"] · `publishes:` ["ruta-viva.posicion.response", "ruta-viva.posicion.failed", "ruta-viva.paradas.response", "ruta-viva.paradas.failed", "ruta-viva.promesa.response", "ruta-viva.promesa.failed", "ruta-viva.capacidad.response", "ruta-viva.capacidad.failed", "bocaos.posicion_anotada", "bocaos.promesa_guardada", "bocaos.capacidad_declarada", "bocaos.trayecto_cerrado"]
- **C · index.js:** `class RutaViva extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/ruta-viva.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_promesa` (B03: sólo se puede MEJORAR (bajar la hora). Empeorarla exige pasar el umbral de retraso (A31).) · `_paradas` (B02: se DERIVA de los contratos vivos; si un contrato se cierra, su parada desaparece sola.) · `_ordenar` (B04: optimiza UNA ruta y sólo dentro de ella, con desempate declarado. La misma ruta da el mismo orden siempre.) · `_capacidad` (B05: se declara, no se estima. Es POR PLAZA, y ése es el agujero de §7.9 (Q44/Q45).) · `_fin` (B06: cierra el trayecto cuando no queda parada viva.)
- **E · handler:** `onPosicionRequest(e)` → `_atender(e, 'posicion', 'ruta-viva.posicion.response', d => this._posicion(d))` · **CLASE: ORDEN** — B01: anota el último punto con su hora (un hecho, no un chorro)
- **E · handler:** `onParadasRequest(e)` → `_atender(e, 'paradas', 'ruta-viva.paradas.response', d => this._paradas(d))` · **CLASE: PREGUNTA** — B02: paradas pendientes del rider, en su orden
- **E · handler:** `onPromesaRequest(e)` → `_atender(e, 'promesa', 'ruta-viva.promesa.response', d => this._promesa(d))` · **CLASE: ORDEN** — B03: promete una hora para una parada
- **E · handler:** `onCapacidadRequest(e)` → `_atender(e, 'capacidad', 'ruta-viva.capacidad.response', d => this._capacidad(d))` · **CLASE: ORDEN** — B05: el rider declara cuánto cabe
- **F · hechos que publica:** `bocaos.posicion_anotada`, `bocaos.promesa_guardada`, `bocaos.capacidad_declarada`, `bocaos.trayecto_cerrado`
- **VERIFICACIÓN:** Contrato cerrado → su parada desaparece sin escribir nada. Promesa empeorada por debajo del umbral → 409 (A31).
- **NO REUTILIZA / DECISIÓN:** `entrega` (the-pirate) estima tiempos y guarda reglas de reparto propio: no hay rider, ni contrato vivo, ni promesa. No se toca.

#### `contrato-tramos` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** E06 · N02
- **Propósito:** Los tramos de la cuota de la plaza: fijo por parte y tramo por pedido aceptado. Con vigencia y autor. Y el simulador que dice qué habría pasado con otros tramos.
- **Depende de:** — (raíz)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "contrato-tramos"` · `unidad: "plaza"` · `subscribes:` ["contrato-tramos.declarar.request", "contrato-tramos.vigentes.request", "contrato-tramos.simular.request", "project.activated"] · `publishes:` ["contrato-tramos.declarar.response", "contrato-tramos.declarar.failed", "contrato-tramos.vigentes.response", "contrato-tramos.vigentes.failed", "contrato-tramos.simular.response", "contrato-tramos.simular.failed", "bocaos.tramos_declarados"]
- **C · index.js:** `class ContratoTramos extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/contrato-tramos.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_declarar` (E06: tramo fijo + tramo por pedido, por parte. Sin antigüedad, sin exclusividad, sin cuota mínima (Q34/Q35).) · `_vigentes` (E06: los tramos que estaban vivos cuando ocurrió el hecho, no los de hoy (R5 del determinismo).) · `_simular` (N02: qué habría pasado con otros tramos sobre hechos cerrados.)
- **E · handler:** `onDeclararRequest(e)` → `_atender(e, 'declarar', 'contrato-tramos.declarar.response', d => this._declarar(d))` · **CLASE: ORDEN** — E06: nuevos tramos con autor, desde y acta
- **E · handler:** `onVigentesRequest(e)` → `_atender(e, 'vigentes', 'contrato-tramos.vigentes.response', d => this._vigentes(d))` · **CLASE: PREGUNTA** — E06: tramos vigentes en un instante para una parte
- **E · handler:** `onSimularRequest(e)` → `_atender(e, 'simular', 'contrato-tramos.simular.response', d => this._simular(d))` · **CLASE: PREGUNTA** — N02: el pasado con otros números
- **F · hechos que publica:** `bocaos.tramos_declarados`
- **VERIFICACIÓN:** Cambiar tramos no reescribe un cierre ya emitido. `liquidacion` pide los tramos DEL PERIODO, no los de hoy.
- **NO REUTILIZA / DECISIÓN:** En la v1, `tarifa-pedido` (E01,E02,E03,E07) y `contrato-tramos` (E06,N02) eran dos hojas con la segunda DESPUÉS de la primera, aunque E03 compone con los tramos. Aquí se corrige el orden: los tramos primero.

#### `frontera-plaza` · `REFLEJO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** S01 · S02
- **Propósito:** La frontera de cobertura: de qué plaza es una dirección y qué tiendas llegan a ella. Quitar por cobertura es un hecho comprobable; no poner a las que pagan es otra cosa (D08).
- **Depende de:** `config-mercado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "frontera-plaza"` · `unidad: "plaza"` · `subscribes:` ["frontera-plaza.de.request", "frontera-plaza.filtrar.request", "bocaos.radio_declarada", "bocaos.politica_declarada"] · `publishes:` ["frontera-plaza.de.response", "frontera-plaza.de.failed", "frontera-plaza.filtrar.response", "frontera-plaza.filtrar.failed", "bocaos.frontera_ambigua", "bocaos.direccion_sin_plaza"]
- **C · index.js:** `class FronteraPlaza extends ModuloHibridoReflejo`. Sin estado, sin `PosPersistencia`: si guardara una copia, habría dos verdades y una sería vieja.
- **D · proyecciones internas:** `_de` (S01: dirección → plaza_id | NO_CONSTA | AMBIGUA(plazas). Si dos coberturas se solapan y no hay desempate declarado, NO HAY PEDIDO (Q52).) · `_filtrar` (S02: intersección de la cobertura de la plaza (J03) y lo que cada tienda declara que reparte (D06).) · `_a_la_inversa` (S02: qué tiendas llegan aquí, para el escaparate.)
- **E · handler:** `onDeRequest(e)` → `_atender(e, 'de', 'frontera-plaza.de.response', d => this._de(d))` · **CLASE: PREGUNTA** — S01: ¿de qué plaza es esta dirección? — se pregunta ANTES de crear un pedido
- **E · handler:** `onFiltrarRequest(e)` → `_atender(e, 'filtrar', 'frontera-plaza.filtrar.response', d => this._filtrar(d))` · **CLASE: PREGUNTA** — S02: índice filtrado por cobertura
- **F · hechos que publica:** `bocaos.frontera_ambigua`, `bocaos.direccion_sin_plaza`
- **VERIFICACIÓN:** Dirección fuera de cobertura → `direccion_sin_plaza` y no hay pedido. Dos radios de plaza solapados sin desempate → AMBIGUA.
- **NO REUTILIZA / DECISIÓN:** S01/S02 son nuevas en la v2 (la v1 tenía un escaparate sin geografía). Se construyen aquí y no dentro de `escaparate` porque la respuesta 'no hay pedido' tiene que ser alcanzable ANTES de que exista pedido, y un escaparate no puede negar un pedido.

#### `escaparate` · `REFLEJO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** D07 · D08 · K02
- **Propósito:** Lo que el cliente ve en la plaza y lo que no puede aparecer en ello: el índice de tiendas que LLEGAN (ya filtrado), sin orden de preferencia, y la guarda de que ninguna comunicación lleva la marca de Bocaos, ni la de la plaza, ni la del nacional.
- **Depende de:** `censo-parte`, `frontera-plaza`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "escaparate"` · `unidad: "plaza"` · `subscribes:` ["escaparate.indice.request", "escaparate.marca_ajena.request", "bocaos.censo_actualizado", "bocaos.radio_declarada"] · `publishes:` ["escaparate.indice.response", "escaparate.indice.failed", "escaparate.marca_ajena.response", "escaparate.marca_ajena.failed", "bocaos.escaparate_compuesto", "bocaos.marca_ajena_detectada"]
- **C · index.js:** `class Escaparate extends ModuloHibridoReflejo`. Sin estado, sin `PosPersistencia`: si guardara una copia, habría dos verdades y una sería vieja.
- **D · proyecciones internas:** `_indice` (D07: proyección del censo, ya filtrada por cobertura. No se escribe, no guarda posiciones.) · `_neutro` (D08: orden declarado y neutro. Sin ranking, sin destacados, sin prioridad comprada. Filtrar no es ordenar: la guarda cubre las dos.) · `_marca_ajena` (K02: ninguna comunicación al cliente final lleva la marca de Bocaos ni la de la plaza. Se consulta en el camino caliente de `tienda-aviso-cliente`.)
- **E · handler:** `onIndiceRequest(e)` → `_atender(e, 'indice', 'escaparate.indice.response', d => this._indice(d))` · **CLASE: PREGUNTA** — D07: escaparate de la plaza para una dirección
- **E · handler:** `onMarcaAjenaRequest(e)` → `_atender(e, 'marca_ajena', 'escaparate.marca_ajena.response', d => this._marca_ajena(d))` · **CLASE: PREGUNTA** — K02: revisa una comunicación saliente → conforme | FALLA
- **F · hechos que publica:** `bocaos.escaparate_compuesto`, `bocaos.marca_ajena_detectada`
- **VERIFICACIÓN:** Pagar por posición → no hay campo donde ponerlo. Aviso con 'powered by Bocaos' → `marca_ajena_detectada` y el aviso no sale.
- **NO REUTILIZA / DECISIÓN:** K02 vive aquí y no en la tienda porque su forma es P en el diseño, y porque la marca que hay que ocultar es de la PLAZA y del NACIONAL: la tienda no puede vigilar una marca que no conoce. La tienda la invoca.

#### `tarifa-pedido` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** E01 · E03 · E07
- **Propósito:** El precio del reparto de un pedido: la oferta del cliente congelada, el precio compuesto (oferta + incentivo de la tienda + tramos) y la subida de oferta con tope autorizado. El incentivo lo pone la tienda; aquí sólo se suma.
- **Depende de:** `contrato-tramos`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "tarifa-pedido"` · `unidad: "plaza"` · `subscribes:` ["tarifa-pedido.estipular.request", "tarifa-pedido.precio.request", "tarifa-pedido.subir.request", "bocaos.incentivo_subido", "project.activated"] · `publishes:` ["tarifa-pedido.estipular.response", "tarifa-pedido.estipular.failed", "tarifa-pedido.precio.response", "tarifa-pedido.precio.failed", "tarifa-pedido.subir.response", "tarifa-pedido.subir.failed", "bocaos.oferta_estipulada", "bocaos.precio_compuesto", "bocaos.oferta_subida"]
- **C · index.js:** `class TarifaPedido extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/tarifa-pedido.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_estipular` (E01: lo que el cliente pone por el reparto, congelado con el pedido. Ni la tienda ni la sala ni Bocaos lo tocan.) · `_componer` (E03: oferta + incentivo (E02, de la tienda) + tramos vigentes → céntimos y desglose. Lo lee A11 ya compuesto; no se recalcula dentro del enlace.) · `_subir` (E07: subida con tope autorizado por el cliente (Q43). Quién paga el escalón es Q17: se anota el acto y la deuda queda visible, no cobrada.) · `_no_baja` (E07: nunca por debajo de lo ya ofrecido a un rider con propuesta viva.)
- **E · handler:** `onEstipularRequest(e)` → `_atender(e, 'estipular', 'tarifa-pedido.estipular.response', d => this._estipular(d))` · **CLASE: ORDEN** — E01: el cliente estipula la oferta de reparto
- **E · handler:** `onPrecioRequest(e)` → `_atender(e, 'precio', 'tarifa-pedido.precio.response', d => this._precio(d))` · **CLASE: PREGUNTA** — E03: precio compuesto y desglose de un pedido
- **E · handler:** `onSubirRequest(e)` → `_atender(e, 'subir', 'tarifa-pedido.subir.response', d => this._subir(d))` · **CLASE: ORDEN** — E07: sube la oferta hasta el tope autorizado, con autor y acta
- **F · hechos que publica:** `bocaos.oferta_estipulada`, `bocaos.precio_compuesto`, `bocaos.oferta_subida`
- **VERIFICACIÓN:** Pedido sin oferta → sin precio y sin propuesta (hueco nombrado). Subida por encima del tope → 409. Subida sin autor humano → 403.
- **NO REUTILIZA / DECISIÓN:** CAMBIÓ RESPECTO A LA v1: E02 ya no está aquí (es de la tienda). La hoja pierde una clase y gana un `subscribes` al hecho del incentivo. Ese es el precio de que el incentivo sea de quien lo paga.

#### `pedido` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** C02 · C07
- **Propósito:** El pedido del mercado: estado con tabla cerrada y ninguna transición sin hecho con hora; y la tabla de quién puede cancelar y hasta cuándo. Vive en el registro de SU plaza: no hay estado del pedido en el nacional.
- **Depende de:** `censo-parte`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "pedido"` · `unidad: "plaza"` · `subscribes:` ["pedido.crear.request", "pedido.aceptar.request", "pedido.rechazar.request", "pedido.cancelar.request", "pedido.de.request", "bocaos.precio_cerrado", "bocaos.listo_declarado", "bocaos.contrato_creado", "bocaos.prueba_anotada", "project.activated"] · `publishes:` ["pedido.crear.response", "pedido.crear.failed", "pedido.aceptar.response", "pedido.aceptar.failed", "pedido.rechazar.response", "pedido.rechazar.failed", "pedido.cancelar.response", "pedido.cancelar.failed", "pedido.de.response", "pedido.de.failed", "bocaos.pedido_creado", "bocaos.pedido_aceptado", "bocaos.pedido_rechazado", "bocaos.pedido_cancelado"]
- **C · index.js:** `class Pedido extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/pedido.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_crear` (C02: el pedido nace con precio congelado y plaza_id; sin precio no nace.) · `_transitar` (C02: RECIBIDO → ACEPTADO (la tienda acepta, Q27) → LISTO (C04) → EN_REPARTO (contrato) → ENTREGADO (prueba o su falta declarada).) · `_cancelacion` (C07: tabla de quién y hasta cuándo. Quién paga el rechazo es Q36: mientras no haya respuesta se anota y NO SE COBRA a nadie.)
- **E · handler:** `onCrearRequest(e)` → `_atender(e, 'crear', 'pedido.crear.response', d => this._crear(d))` · **CLASE: ORDEN** — C02: crea el pedido (lo pide `tienda-captura`)
- **E · handler:** `onAceptarRequest(e)` → `_atender(e, 'aceptar', 'pedido.aceptar.response', d => this._aceptar(d))` · **CLASE: ORDEN** — C02: la tienda acepta (Q27) — transición con hecho
- **E · handler:** `onRechazarRequest(e)` → `_atender(e, 'rechazar', 'pedido.rechazar.response', d => this._rechazar(d))` · **CLASE: ORDEN** — C02: la tienda rechaza (Q36: gastos al que falló, sin cobro automático)
- **E · handler:** `onCancelarRequest(e)` → `_atender(e, 'cancelar', 'pedido.cancelar.response', d => this._cancelar(d))` · **CLASE: ORDEN** — C07: cancelación con quién y cuándo
- **E · handler:** `onDeRequest(e)` → `_atender(e, 'de', 'pedido.de.response', d => this._de(d))` · **CLASE: PREGUNTA** — C02: estado del pedido con sus hechos
- **F · hechos que publica:** `bocaos.pedido_creado`, `bocaos.pedido_aceptado`, `bocaos.pedido_rechazado`, `bocaos.pedido_cancelado`
- **VERIFICACIÓN:** LISTO sin `pedido_aceptado` → TRANSICIÓN_NO_PERMITIDA. ENTREGADO sin prueba ni falta declarada → imposible. Nacional intenta leerlo → no hay ruta.
- **NO REUTILIZA / DECISIÓN:** `pizzepos/pedidos` es el pedido del POS (cuenta, items en pasos, cocina). Este necesita tres cosas que no tiene: precio congelado al nacer, aceptación de la tienda y estado podado. Se construye; el id del pedido de la tienda es la clave de unión.

#### `hecho-listo` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** A01
- **Propósito:** El hecho de «listo» tal como lo anota la plaza: una sola vez, con el dato viajando CON el hecho (local, destino, hora, precio, punto). Es lo que dispara la cadena. Si la tienda se equivocó, se desmiente: no se corrige.
- **Depende de:** `pedido`, `tarifa-pedido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "hecho-listo"` · `unidad: "plaza"` · `subscribes:` ["hecho-listo.anotar.request", "hecho-listo.desmentir.request", "hecho-listo.de.request", "bocaos.listo_declarado", "project.activated"] · `publishes:` ["hecho-listo.anotar.response", "hecho-listo.anotar.failed", "hecho-listo.desmentir.response", "hecho-listo.desmentir.failed", "hecho-listo.de.response", "hecho-listo.de.failed", "bocaos.pedido_listo", "bocaos.hecho_desmentido"]
- **C · index.js:** `class HechoListo extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/hecho-listo.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_anotar` (A01: exige precio_congelado; sin él no hay hecho y el pedido espera nombrando el hueco (A34).) · `_sello` (A01: el plaza_id lo pone la plaza al anotar. La tienda no puede declarar un pedido de otra plaza.) · `_desmentir` (A01: hecho nuevo que desmiente al anterior; las dos horas quedan y el pedido se vuelve a medir.)
- **E · handler:** `onAnotarRequest(e)` → `_atender(e, 'anotar', 'hecho-listo.anotar.response', d => this._anotar(d))` · **CLASE: ORDEN** — A01: anota el hecho con todo el dato dentro (nadie lo busca después)
- **E · handler:** `onDesmentirRequest(e)` → `_atender(e, 'desmentir', 'hecho-listo.desmentir.response', d => this._desmentir(d))` · **CLASE: ORDEN** — A01: segunda hora que desmiente la primera; las dos quedan
- **E · handler:** `onDeRequest(e)` → `_atender(e, 'de', 'hecho-listo.de.response', d => this._de(d))` · **CLASE: PREGUNTA** — A01: el hecho vigente de un pedido | NO_CONSTA
- **F · hechos que publica:** `bocaos.pedido_listo`, `bocaos.hecho_desmentido`
- **VERIFICACIÓN:** Declaración sin precio → no hay hecho, hay hueco nombrado. Desmentir deja dos horas y el pedido se remide; no se borra ninguna.
- **NO REUTILIZA / DECISIÓN:** SE PARTIÓ DE `hora-listo` (v1). C04 es de la tienda y A01 de la plaza: en la v1 eran una hoja porque el mercado era uno y la tienda no tenía despliegue propio. Ahora son dos escritores y dos sitios.

#### `aviso-tienda` · `PUENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** C03
- **Propósito:** Avisar a la tienda de que hay un pedido, por el puerto de la tienda (§6). Avisa, no decide: no acepta por ella, no arranca la cocina, no la compromete a una hora.
- **Depende de:** `pedido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `pizzepos/notificador-pedidos`
- **B · module.json:** `name: "aviso-tienda"` · `unidad: "plaza"` · `subscribes:` ["aviso-tienda.avisar.request", "bocaos.pedido_creado", "bocaos.pedido_cancelado"] · `publishes:` ["aviso-tienda.avisar.response", "aviso-tienda.avisar.failed", "bocaos.aviso_tienda_entregado", "bocaos.aviso_tienda_fallido"]
- **C · index.js:** `class AvisoTienda extends ModuloHibridoReflejo` + cliente del puerto (canal / pago / ruta / publicación). Sin reglas de negocio: traduce y devuelve el resultado del proveedor.
- **D · proyecciones internas:** `_avisar` (C03: al canal de la tienda (su POS, su impresora, su pantalla). Si el aviso no llega, el pedido existe igual.) · `_sin_orden` (C03: no acepta, no arranca la cocina, no compromete hora. Si pudiera, la plaza estaría operando el restaurante.)
- **E · handler:** `onAvisarRequest(e)` → `_atender(e, 'avisar', 'aviso-tienda.avisar.response', d => this._avisar(d))` · **CLASE: ORDEN** — C03: aviso de pedido a la tienda → entregado | fallido
- **F · hechos que publica:** `bocaos.aviso_tienda_entregado`, `bocaos.aviso_tienda_fallido`
- **VERIFICACIÓN:** Canal caído → `aviso_tienda_fallido` y el pedido sigue en RECIBIDO. La tienda acepta por su canal, no por este módulo.
- **NO REUTILIZA / DECISIÓN:** El puerto de la tienda ya existe en el ecosistema (`pizzepos/notificador-pedidos` orquesta avisos al staff por canal). Se toma como PROVEEDOR del puerto, no como hoja: no entiende de mercados ni de propuestas.

#### `instrucciones-acceso` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** F05
- **Propósito:** Portal, piso, indicaciones: las escribe el cliente y se muestran SÓLO al rider del contrato vivo. Al entregar dejan de mostrarse aunque el dato siga escrito.
- **Depende de:** `pedido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "instrucciones-acceso"` · `unidad: "plaza"` · `subscribes:` ["instrucciones-acceso.escribir.request", "instrucciones-acceso.mostrar.request", "bocaos.contrato_creado", "bocaos.contrato_cerrado", "project.activated"] · `publishes:` ["instrucciones-acceso.escribir.response", "instrucciones-acceso.escribir.failed", "instrucciones-acceso.mostrar.response", "instrucciones-acceso.mostrar.failed", "bocaos.acceso_escrito"]
- **C · index.js:** `class InstruccionesAcceso extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/instrucciones-acceso.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_escribir` (F05: texto del cliente para un pedido. Dato personal del cliente DEL cliente: no entra en ningún agregado.) · `_mostrar` (F05: sólo al rider del contrato vivo, sólo mientras el contrato está vivo. Sin contrato → NO_HAY.)
- **E · handler:** `onEscribirRequest(e)` → `_atender(e, 'escribir', 'instrucciones-acceso.escribir.response', d => this._escribir(d))` · **CLASE: ORDEN** — F05: el cliente escribe sus instrucciones
- **E · handler:** `onMostrarRequest(e)` → `_atender(e, 'mostrar', 'instrucciones-acceso.mostrar.response', d => this._mostrar(d))` · **CLASE: PREGUNTA** — F05: instrucciones al rider del contrato vivo | NO_HAY
- **F · hechos que publica:** `bocaos.acceso_escrito`
- **VERIFICACIÓN:** Contrato cerrado → `mostrar` devuelve NO_HAY. Rider distinto del contrato → 403.
- **NO REUTILIZA / DECISIÓN:** El dato es del cliente pero lo custodia la plaza porque quien lo necesita es el rider del contrato, y el contrato es de la plaza. En la tienda no puede estar: la tienda no sabe quién reparte.

#### `contrato-puntual` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** A24
- **Propósito:** El contrato de un pedido con un rider: puntual, sin turno, sin jornada, sin compromiso con el siguiente. Nace de una aceptación libre, no de una asignación.
- **Depende de:** `pedido`, `ruta-viva`, `estado-parte`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "contrato-puntual"` · `unidad: "plaza"` · `subscribes:` ["contrato-puntual.crear.request", "contrato-puntual.de.request", "contrato-puntual.cerrar.request", "bocaos.propuesta_aceptada", "bocaos.hecho_reparto_anotado", "project.activated"] · `publishes:` ["contrato-puntual.crear.response", "contrato-puntual.crear.failed", "contrato-puntual.de.response", "contrato-puntual.de.failed", "contrato-puntual.cerrar.response", "contrato-puntual.cerrar.failed", "bocaos.contrato_creado", "bocaos.contrato_cerrado"]
- **C · index.js:** `class ContratoPuntual extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/contrato-puntual.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_crear` (A24: sólo desde una aceptación con acuse. Sin aceptación no hay constructor: la asignación no existe.) · `_cerrar` (A24: con el hecho de entrega. La parada desaparece de B02 y deja de proyectarse.) · `_sin_duracion` (A24: no tiene turno ni jornada. Si tuviera duración, el negocio sería otro (inspección de trabajo).)
- **E · handler:** `onCrearRequest(e)` → `_atender(e, 'crear', 'contrato-puntual.crear.response', d => this._crear(d))` · **CLASE: ORDEN** — A24: pedido + rider + precio + hora prometida → Contrato
- **E · handler:** `onDeRequest(e)` → `_atender(e, 'de', 'contrato-puntual.de.response', d => this._de(d))` · **CLASE: PREGUNTA** — A24: el contrato de un pedido o de una parada
- **E · handler:** `onCerrarRequest(e)` → `_atender(e, 'cerrar', 'contrato-puntual.cerrar.response', d => this._cerrar(d))` · **CLASE: ORDEN** — A24: cierra con el hecho de entrega
- **F · hechos que publica:** `bocaos.contrato_creado`, `bocaos.contrato_cerrado`
- **VERIFICACIÓN:** Crear contrato sin aceptación → 409 (no hay camino de pedido a rider sin aceptación libre). Contrato con `turno` → 422.
- **NO REUTILIZA / DECISIÓN:** Sin cambios de unidad. Se adelanta en el orden respecto a `propuesta` porque la propuesta lo invoca al aceptar y la ruta viva lo lee para derivar paradas.

#### `foto-mercado` · `REFLEJO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** A02 · A03 · A04
- **Propósito:** La foto del instante: riders de ESTA plaza con su posición, paradas, promesas, capacidad, la puntualidad del local y la política que rige. Se congela con su huella y no vuelve a leer el mundo.
- **Depende de:** `estado-parte`, `ruta-viva`, `config-mercado`, `tienda-puntualidad`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "foto-mercado"` · `unidad: "plaza"` · `subscribes:` ["foto-mercado.componer.request", "foto-mercado.elegibles.request", "foto-mercado.reproducir.request"] · `publishes:` ["foto-mercado.componer.response", "foto-mercado.componer.failed", "foto-mercado.elegibles.response", "foto-mercado.elegibles.failed", "bocaos.foto_congelada"]
- **C · index.js:** `class FotoMercado extends ModuloHibridoReflejo`. Sin estado, sin `PosPersistencia`: si guardara una copia, habría dos verdades y una sería vieja.
- **D · proyecciones internas:** `_componer` (A02: riders ← I04 · posición ← B01 · paradas ← B02 · promesas ← B03 · capacidad ← B05 · local ← L03 · política ← J04 (DOS CAPAS).) · `_congelar` (A03: la foto se congela con huella. Dentro de F nadie lee el mundo: si leyera, la explicación dejaría de ser cierta.) · `_elegibles` (A04: estado, zona y capacidad. El que tiene un dato ausente ENTRA con su lista de faltantes: descartar es decidir.)
- **E · handler:** `onComponerRequest(e)` → `_atender(e, 'componer', 'foto-mercado.componer.response', d => this._componer(d))` · **CLASE: PREGUNTA** — A02: la vista del instante para un hecho
- **E · handler:** `onElegiblesRequest(e)` → `_atender(e, 'elegibles', 'foto-mercado.elegibles.response', d => this._elegibles(d))` · **CLASE: PREGUNTA** — A04: candidatos que pasan el censo (no la política)
- **E · handler:** `onReproducirRequest(e)` → `_atender(e, 'reproducir', 'foto-mercado.reproducir.response', d => this._reproducir(d))` · **CLASE: PREGUNTA** — A03: la foto con su huella, para A29
- **F · hechos que publica:** `bocaos.foto_congelada`
- **VERIFICACIÓN:** Dos composiciones en el mismo instante dan la misma huella. Rider de otra plaza → no aparece. Rider sin puntualidad → entra con hueco nombrado.
- **NO REUTILIZA / DECISIÓN:** `metricas` mide el bus; esto compone un mundo. `interfaz` es la superficie del radar de nichos. Ninguno sirve.

#### `propuesta` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** A13 · A14 · A15 · A19 · A27 · A29 · A33 · M05
- **Propósito:** La propuesta y su desenlace: emitida, bloqueada, con ventana, aceptada o caducada. UN solo custodio, porque cuatro clases del diseño escriben la MISMA propuesta y cuatro escritores son exactamente la carrera que A14 existe para impedir.
- **Depende de:** `foto-mercado`, `tarifa-pedido`, `contrato-puntual`, `config-mercado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "propuesta"` · `unidad: "plaza"` · `subscribes:` ["propuesta.emitir.request", "propuesta.acuse.request", "propuesta.aceptar.request", "propuesta.rechazar.request", "propuesta.cerrar.request", "propuesta.de.request", "bocaos.propuesta_entregada", "bocaos.propuesta_no_entregada", "project.activated"] · `publishes:` ["propuesta.emitir.response", "propuesta.emitir.failed", "propuesta.acuse.response", "propuesta.acuse.failed", "propuesta.aceptar.response", "propuesta.aceptar.failed", "propuesta.rechazar.response", "propuesta.rechazar.failed", "propuesta.cerrar.response", "propuesta.cerrar.failed", "propuesta.de.response", "propuesta.de.failed", "bocaos.propuesta_emitida", "bocaos.propuesta_acusada", "bocaos.propuesta_aceptada", "bocaos.propuesta_rechazada", "bocaos.propuesta_caducada_sin_acuse", "bocaos.propuesta_caducada_sin_respuesta"]
- **C · index.js:** `class Propuesta extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/propuesta.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_emitir` (A13: una viva por pedido (A33). Lleva dentro la foto con su huella, la política con su CAPA y su autor, y los cuatro números.) · `_bloqueo` (A14: el bloqueo por pedido es lo que hace que gane el primero, no el preferido. Un desenlace por propuesta; el segundo recibe YA_NO_ESTA y no paga nada.) · `_ventana` (A15: validez 20 s · acuse ≤5 s · decisión 10 s (Q42). Dos relojes, dos caducidades distintas.) · `_aceptar` (A19: un solo sí, atómico, con hora. Nunca una asignación: la aceptación la produce el rider.) · `_vista` (M05: los cuatro números SIEMPRE en el mismo orden + la frase + de qué plaza + qué umbrales (capa y autor) le juzgaron.) · `_reproducir` (A29: misma foto + misma política → misma propuesta. Devuelve el mismo resultado o falla.) · `_sin_asignacion` (A27: no hay camino de pedido a rider sin aceptación libre. Falla si alguien lo abre.)
- **E · handler:** `onEmitirRequest(e)` → `_atender(e, 'emitir', 'propuesta.emitir.response', d => this._emitir(d))` · **CLASE: ORDEN** — A13/A14/A33: emite la propuesta de un candidato (una viva por pedido)
- **E · handler:** `onAcuseRequest(e)` → `_atender(e, 'acuse', 'propuesta.acuse.response', d => this._acuse(d))` · **CLASE: ORDEN** — A15: el canal acusó recibo; arranca el reloj de decisión
- **E · handler:** `onAceptarRequest(e)` → `_atender(e, 'aceptar', 'propuesta.aceptar.response', d => this._aceptar(d))` · **CLASE: ORDEN** — A19: el sí del rider → contrato (A24)
- **E · handler:** `onRechazarRequest(e)` → `_atender(e, 'rechazar', 'propuesta.rechazar.response', d => this._rechazar(d))` · **CLASE: ORDEN** — A19: el no, sin coste (A21)
- **E · handler:** `onCerrarRequest(e)` → `_atender(e, 'cerrar', 'propuesta.cerrar.response', d => this._cerrar(d))` · **CLASE: ORDEN** — A15: cierra por caducidad (dos clases distintas de caducidad)
- **E · handler:** `onDeRequest(e)` → `_atender(e, 'de', 'propuesta.de.response', d => this._de(d))` · **CLASE: PREGUNTA** — A13: la propuesta viva de un pedido | NO_HAY
- **F · hechos que publica:** `bocaos.propuesta_emitida`, `bocaos.propuesta_acusada`, `bocaos.propuesta_aceptada`, `bocaos.propuesta_rechazada`, `bocaos.propuesta_caducada_sin_acuse`, `bocaos.propuesta_caducada_sin_respuesta`
- **VERIFICACIÓN:** Dos propuestas vivas del mismo pedido → imposible (A33). Dos síes → el segundo YA_NO_ESTA sin coste. Reproducir una propuesta vieja da el mismo número.
- **NO REUTILIZA / DECISIÓN:** CUATRO CLASES DEL DISEÑO, UN CUSTODIO. A13/A14/A15/A19 escriben la misma propuesta: emitirla, abrir su reloj, cerrarla y aceptarla. Cuatro hojas serían cuatro escritores y la carrera que A14 impide.

#### `redaccion-propuesta` · `MICRO-AGENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** A18
- **Propósito:** Adorna la propuesta: convierte los cuatro números y la frase derivada en una frase que se lee en un móvil. No elige, no puntúa, no escribe estado. Si se cae, el mercado sigue con A17.
- **Depende de:** `propuesta`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `ai-gateway`
- **B · module.json:** `name: "redaccion-propuesta"` · `unidad: "plaza"` · `subscribes:` ["redaccion-propuesta.adornar.request"] · `publishes:` ["redaccion-propuesta.adornar.response", "redaccion-propuesta.adornar.failed", "bocaos.propuesta_redactada", "bocaos.redaccion_rechazada"]
- **C · index.js:** `class RedaccionPropuesta extends ModuloHibridoReflejo` híbrido: cajones de blueprint para el lenguaje + proyección `_validador` pura. La op fuzzy NO va en `subscribes` (gate `validate-hibridos`).
- **D · proyecciones internas:** `cajon_adornar` (A18: el cajón del blueprint (lenguaje). El reflejo sólo valida y publica.) · `_validador` (A18: todo número que aparezca tiene que estar en la entrada; toda razón tiene que estar en A16. Lo que no está, rechaza.) · `_adorno` (A18: sin él, `enlace` usa la frase derivada (A17) y nadie nota la diferencia en el negocio.)
- **E · handler:** `onAdornarRequest(e)` → `_atender(e, 'adornar', 'redaccion-propuesta.adornar.response', d => this._adornar(d))` · **CLASE: ORDEN** — A18: números + razones → frase | RECHAZADO(razón inventada)
- **F · hechos que publica:** `bocaos.propuesta_redactada`, `bocaos.redaccion_rechazada`
- **VERIFICACIÓN:** Frase que cita un motivo que no está en A16 → `redaccion_rechazada` y se usa A17. Sin LLM → el enlace no espera más de 300 ms.
- **NO REUTILIZA / DECISIÓN:** Híbrido: la op no va en `subscribes` (gate `validate-hibridos`), el cajón se declara en proyecciones. Cero IA en la decisión: este agente sólo pone palabras.

#### `canal-rider` · `PUENTE` · acción **ADAPTAR** · unidad **PLAZA**

- **Clases:** M04
- **Propósito:** Entregar la propuesta al rider por SU canal, con acuse obligatorio, ventana de validez y retirada a los 5 s. El transporte es intercambiable; el contrato no.
- **Depende de:** `propuesta`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `telegram-bridge` · `credential-manager`
- **B · module.json:** `name: "canal-rider"` · `unidad: "plaza"` · `subscribes:` ["canal-rider.entregar.request", "telegram.callback.received", "bocaos.propuesta_emitida", "bocaos.propuesta_cerrada"] · `publishes:` ["canal-rider.entregar.response", "canal-rider.entregar.failed", "bocaos.propuesta_entregada", "bocaos.propuesta_no_entregada", "bocaos.acuse_recibido"]
- **C · index.js:** `class CanalRider extends ModuloHibridoReflejo` + cliente del puerto (canal / pago / ruta / publicación). Sin reglas de negocio: traduce y devuelve el resultado del proveedor.
- **D · proyecciones internas:** `_entregar` (M04: mensaje con los cuatro números, la frase, de qué plaza y qué umbrales. Retirada a los 5 s si no hay acuse.) · `_acuse` (M04: el callback es el acuse, el sí o el no. Sin acuse, CADUCADA_SIN_ACUSE: el canal falló, no el rider.) · `_sin_asignar` (M04: entrega una propuesta a UN rider. Nunca dos a la vez por el mismo pedido.)
- **E · handler:** `onEntregarRequest(e)` → `_atender(e, 'entregar', 'canal-rider.entregar.response', d => this._entregar(d))` · **CLASE: ORDEN** — M04: entrega al rider → entregada | no entregada
- **F · hechos que publica:** `bocaos.propuesta_entregada`, `bocaos.propuesta_no_entregada`, `bocaos.acuse_recibido`
- **VERIFICACIÓN:** Sin acuse en 5 s → retirada y `propuesta_caducada_sin_acuse`. El mismo pedido no se entrega a dos riders a la vez.
- **NO REUTILIZA / DECISIÓN:** ADAPTAR `telegram-bridge` v1.0.3: entrega POR PROYECTO y devuelve `telegram.callback.received`, que es el acuse/el sí/el no. Se le añade el contrato de M04 (acuse obligatorio, ventana, retirada). Alternativa declarada: `whatsapp-bot` (botones) con el mismo contrato.

#### `escalada-enlace` · `PUENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** A26
- **Propósito:** Cuando no hay nadie: tres peldaños con tope autorizado por el cliente y, al final, la sala. Escalar no es asignar: es pedir más dinero o más tiempo, con autor.
- **Depende de:** `tarifa-pedido`, `canal-rider`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "escalada-enlace"` · `unidad: "plaza"` · `subscribes:` ["escalada-enlace.escalar.request", "bocaos.propuesta_rechazada", "bocaos.propuesta_caducada_sin_respuesta", "bocaos.enlace_agotado"] · `publishes:` ["escalada-enlace.escalar.response", "escalada-enlace.escalar.failed", "bocaos.escalada_peldano", "bocaos.escalada_agotada", "bocaos.escalada_reintentar"]
- **C · index.js:** `class EscaladaEnlace extends ModuloHibridoReflejo` + cliente del puerto (canal / pago / ruta / publicación). Sin reglas de negocio: traduce y devuelve el resultado del proveedor.
- **D · proyecciones internas:** `_peldano` (A26/Q43: peldaño 2 a los 30 s; hasta el tope autorizado; 5 min de cancelación.) · `_tope` (A26: el tope lo autorizó el cliente al pedir. Sin tope → no se sube, se agota.) · `_agotar` (A26: agotada la escalada, el caso va a la sala. El pedido no muere: queda con nombre.)
- **E · handler:** `onEscalarRequest(e)` → `_atender(e, 'escalar', 'escalada-enlace.escalar.response', d => this._escalar(d))` · **CLASE: ORDEN** — A26: sube un peldaño o agota → sala
- **F · hechos que publica:** `bocaos.escalada_peldano`, `bocaos.escalada_agotada`, `bocaos.escalada_reintentar`
- **VERIFICACIÓN:** Sin tope autorizado → no hay subida y `escalada_agotada`. Tres peldaños y para: el cuarto no existe.
- **NO REUTILIZA / DECISIÓN:** Un puente porque cruza al cliente (autorización) y al rider (nueva oferta). No se fusiona con `enlace`: la escalada sobrevive a que el enlace cambie.

#### `enlace` · `MICRO-AGENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** A05 · A06 · A07 · A08 · A09 · A10 · A11 · A12 · A16 · A17 · A20 · A21 · A22 · A23 · A25 · A28 · A30 · A31 · A34 · A35
- **Propósito:** EL CUELLO. Un hecho de «listo» entra; sale una propuesta a un rider o un hueco con nombre. Cuatro comparaciones en AND sobre una foto congelada y una política con dos capas. Cero IA en esta decisión.
- **Depende de:** `foto-mercado`, `propuesta`, `redaccion-propuesta`, `canal-rider`, `escalada-enlace`, `hecho-listo`, `ruta-viva`, `config-mercado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "enlace"` · `unidad: "plaza"` · `subscribes:` ["enlace.ejecutar.request", "bocaos.pedido_listo", "bocaos.hecho_desmentido", "bocaos.propuesta_rechazada", "bocaos.propuesta_caducada_sin_respuesta", "bocaos.escalada_reintentar"] · `publishes:` ["enlace.ejecutar.response", "enlace.ejecutar.failed", "bocaos.enlace_completado", "bocaos.enlace_agotado", "bocaos.hueco_nombrado", "bocaos.medidas_calculadas"]
- **C · index.js:** `class Enlace extends ModuloHibridoReflejo`. ORQUESTADOR, no agente de lenguaje: no tiene cajones ni LLM. Sólo proyecta (D) y llama por RPC en el orden del cuello; si una medida falta, nombra el hueco y sigue. Sin estado propio: la propuesta la guarda `propuesta`.
- **D · proyecciones internas:** `_ruta_base` (A05: ruta del rider a la tienda, con el puerto Ruta.) · `_con_parada` (A06: inserta una parada de OTRA tienda si y sólo si plaza_id(parada)==plaza_id(pedido)==plaza_id(rider) → A35.) · `_desvio` (A07: metros de más por pasar por el local.) · `_espera` (A08: minutos que esperaría si llega antes de que esté listo; si llega después, 0 y la espera es un hecho del reparto.) · `_retraso` (A09: minutos que añade a las paradas que ya lleva. _agregado (A10): suma por parada, con tope.) · `_cobra` (A11: lee el precio YA compuesto (E03) y el coste declarado del rider. Sin coste → neto NO_CONSTA y el candidato va a A34.) · `_pasa` (A12: desvío < umbral ∧ espera < umbral ∧ retraso < umbral ∧ cobra > 0. Una tabla AND sobre la política de la tienda o de la plaza.) · `_razones` (A16: conjunto CERRADO de razones, con la capa y el autor del umbral que juzgó.) · `_frase` (A17: la frase derivada del conjunto cerrado. Funciona cuando el agente (A18) se cae: el adorno no es el mínimo legal.) · `_hora_aceptacion` (A20: la hora del sí, con su hueco entre emisión y decisión.) · `_rechazo` (A21: rechazar no cuesta nada — ni ahora ni en la siguiente propuesta. _sin_puntuacion (A22) falla si aparece una nota.) · `_caducidad` (A23: sin respuesta en la ventana: el candidato se salta y se sigue.) · `_siguiente` (A25: avanza al siguiente candidato en el orden declarado (no por conveniencia).) · `_sin_optimizador` (A28: la entrada es un hecho y una foto, no una lista de pedidos. Falla si alguien mete un barrido.) · `_sin_captura` (A32: la cuota no depende de km ahorrados ni de pedidos enlazados. _por_trayecto (A30): se enlazan rutas, no clientes. _no_rompe_promesa (A31): ninguna promesa ya dada empeora más allá del umbral.) · `_hueco` (A34: si falta un dato, se NOMBRA («sin posición fresca», «sin precio compuesto», «sin histórico del local», «sin coste del rider») y el candidato se salta.) · `_intra_plaza` (A35: plaza_id(pedido)==plaza_id(rider)==plaza_id(propuesta) en toda propuesta emitida y toda parada insertada.)
- **E · handler:** `onEjecutarRequest(e)` → `_atender(e, 'ejecutar', 'enlace.ejecutar.response', d => this._ejecutar(d))` · **CLASE: ORDEN** — A01→A34: ejecuta F para un pedido listo → propuesta emitida | hueco | agotado
- **F · hechos que publica:** `bocaos.enlace_completado`, `bocaos.enlace_agotado`, `bocaos.hueco_nombrado`, `bocaos.medidas_calculadas`
- **VERIFICACIÓN:** Mismo hecho + misma foto + misma política → misma propuesta (A29). Rider de otra plaza como parada → A35 rojo. Sin coste del rider → hueco, no un umbral con 0.
- **NO REUTILIZA / DECISIÓN:** 20 CLASES, UNA HOJA, y no por comodidad: son siete medidas y una regla que tienen que decidir sobre UNA foto. Como módulos, cada propuesta haría siete saltos de bus en una ventana de 10 s y la foto cambiaría entre salto y salto — justo lo que A03 prohíbe.

#### `hechos-reparto` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** F01 · F02 · F03
- **Propósito:** Los hechos del reparto con hora y su prueba: recogida, entrega, espera real, y la prueba (foto, firma, código, o su falta DECLARADA). Append-only: es la materia prima de todo lo que se mide después.
- **Depende de:** `contrato-puntual`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "hechos-reparto"` · `unidad: "plaza"` · `subscribes:` ["hechos-reparto.anotar.request", "hechos-reparto.prueba.request", "hechos-reparto.acta.request", "bocaos.contrato_creado", "bocaos.pedido_listo", "project.activated"] · `publishes:` ["hechos-reparto.anotar.response", "hechos-reparto.anotar.failed", "hechos-reparto.prueba.response", "hechos-reparto.prueba.failed", "hechos-reparto.acta.response", "hechos-reparto.acta.failed", "bocaos.hecho_reparto_anotado", "bocaos.prueba_anotada", "bocaos.acta_incompleta"]
- **C · index.js:** `class HechosReparto extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/hechos-reparto.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_anotar` (F01: hecho con hora y autor. Sin hora no es un hecho, es una impresión.) · `_prueba` (F02: foto, firma o código; si no hay prueba, se anota la FALTA — que es un hecho distinto de no tener nada.) · `_acta` (F01: compone el acta de un reparto; si falta un hecho, devuelve INCOMPLETA con el nombre del que falta (Q30: la prueba es el evento).)
- **E · handler:** `onAnotarRequest(e)` → `_atender(e, 'anotar', 'hechos-reparto.anotar.response', d => this._anotar(d))` · **CLASE: ORDEN** — F01: anota un hecho del reparto
- **E · handler:** `onPruebaRequest(e)` → `_atender(e, 'prueba', 'hechos-reparto.prueba.response', d => this._prueba(d))` · **CLASE: ORDEN** — F02: anota prueba o su falta declarada
- **E · handler:** `onActaRequest(e)` → `_atender(e, 'acta', 'hechos-reparto.acta.response', d => this._acta(d))` · **CLASE: PREGUNTA** — F01: acta completa | INCOMPLETA(falta)
- **F · hechos que publica:** `bocaos.hecho_reparto_anotado`, `bocaos.prueba_anotada`, `bocaos.acta_incompleta`
- **VERIFICACIÓN:** Reparto sin prueba → acta INCOMPLETA y `regla-fallo` no puede adjudicar. Un hecho no se edita: se añade otro que lo desmiente.
- **NO REUTILIZA / DECISIÓN:** `historial` (taller 3D) es append-only de impresiones, con otra clave y otro dominio. Se toma el patrón.

#### `chat-enmascarado` · `PUENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** F04
- **Propósito:** Rider y cliente hablando sin que ninguno vea el número del otro, y sin agregados sobre conversaciones. Sólo existe mientras el contrato está vivo.
- **Depende de:** `contrato-puntual`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "chat-enmascarado"` · `unidad: "plaza"` · `subscribes:` ["chat-enmascarado.enviar.request", "bocaos.contrato_creado", "bocaos.contrato_cerrado"] · `publishes:` ["chat-enmascarado.enviar.response", "chat-enmascarado.enviar.failed", "bocaos.mensaje_entregado", "bocaos.mensaje_fallido"]
- **C · index.js:** `class ChatEnmascarado extends ModuloHibridoReflejo` + cliente del puerto (canal / pago / ruta / publicación). Sin reglas de negocio: traduce y devuelve el resultado del proveedor.
- **D · proyecciones internas:** `_enmascarar` (F04: alias por contrato, no por persona. Al cerrar el contrato, el alias muere.) · `_sin_agregados` (F04: cero metadatos sobre la conversación (art. 15 de la Directiva). No hay histórico legible por nadie.)
- **E · handler:** `onEnviarRequest(e)` → `_atender(e, 'enviar', 'chat-enmascarado.enviar.response', d => this._enviar(d))` · **CLASE: ORDEN** — F04: mensaje rider↔cliente por el alias del contrato
- **F · hechos que publica:** `bocaos.mensaje_entregado`, `bocaos.mensaje_fallido`
- **VERIFICACIÓN:** Contrato cerrado → el alias no resuelve. El mensaje no deja copia en ningún otro módulo.
- **NO REUTILIZA / DECISIÓN:** `chat-p2p` es chat entre proyectos sobre el circuito de conversación, con allowlist. Aquí es rider↔cliente con enmascarado y cero agregados: no encaja.

#### `incidencia-reparto` · `PUENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** F06
- **Propósito:** El relato de lo que pasó, tal como lo cuenta quien lo vivió: rider, cliente o tienda. No clasifica ni juzga: escribe el relato con autor y hora.
- **Depende de:** `contrato-puntual`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "incidencia-reparto"` · `unidad: "plaza"` · `subscribes:` ["incidencia-reparto.abrir.request", "bocaos.hecho_reparto_anotado"] · `publishes:` ["incidencia-reparto.abrir.response", "incidencia-reparto.abrir.failed", "bocaos.incidencia_abierta"]
- **C · index.js:** `class IncidenciaReparto extends ModuloHibridoReflejo` + cliente del puerto (canal / pago / ruta / publicación). Sin reglas de negocio: traduce y devuelve el resultado del proveedor.
- **D · proyecciones internas:** `_abrir` (F06: relato libre + autor + hora + pedido. Sin campos obligatorios que fuercen una versión de los hechos.) · `_sin_clasificar` (F06: no decide si es grave. Clasificar es leer (F07).)
- **E · handler:** `onAbrirRequest(e)` → `_atender(e, 'abrir', 'incidencia-reparto.abrir.response', d => this._abrir(d))` · **CLASE: ORDEN** — F06: abre incidencia con el relato
- **F · hechos que publica:** `bocaos.incidencia_abierta`
- **VERIFICACIÓN:** Relato sin autor → 400. La incidencia no crea deuda: la crea G04 con evidencia.
- **NO REUTILIZA / DECISIÓN:** Sin cambios.

#### `lectura-incidencia` · `MICRO-AGENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** F07
- **Propósito:** Lee el relato y lo clasifica en una lista cerrada para que la sala lo pueda ordenar. No decide nada, no crea deuda, no sanciona.
- **Depende de:** `incidencia-reparto`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `ai-gateway`
- **B · module.json:** `name: "lectura-incidencia"` · `unidad: "plaza"` · `subscribes:` ["lectura-incidencia.clasificar.request", "bocaos.incidencia_abierta"] · `publishes:` ["lectura-incidencia.clasificar.response", "lectura-incidencia.clasificar.failed", "bocaos.incidencia_clasificada", "bocaos.lectura_ambigua"]
- **C · index.js:** `class LecturaIncidencia extends ModuloHibridoReflejo` híbrido: cajones de blueprint para el lenguaje + proyección `_validador` pura. La op fuzzy NO va en `subscribes` (gate `validate-hibridos`).
- **D · proyecciones internas:** `cajon_clasificar` (F07: el cajón del blueprint. Devuelve una etiqueta de la lista cerrada.) · `_validador` (F07: sólo etiquetas de la lista; cualquier otra cosa → `lectura_ambigua` y la incidencia va a la cola sin etiqueta.) · `_no_es_juez` (F07: no dice si el fallo existió (eso es G02).)
- **E · handler:** `onClasificarRequest(e)` → `_atender(e, 'clasificar', 'lectura-incidencia.clasificar.response', d => this._clasificar(d))` · **CLASE: ORDEN** — F07: relato → etiqueta | AMBIGUA
- **F · hechos que publica:** `bocaos.incidencia_clasificada`, `bocaos.lectura_ambigua`
- **VERIFICACIÓN:** Etiqueta fuera de la lista → `lectura_ambigua` y el caso sigue en la cola. El dictamen no cita a F07 como prueba.
- **NO REUTILIZA / DECISIÓN:** Híbrido. `cantera-semantica` indexa skills; no clasifica relatos de reparto.

#### `regla-fallo` · `REFLEJO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** G02 · G03 · G06
- **Propósito:** Medir un fallo, no juzgarlo: qué hechos lo verifican, a quién se le adjudica según una tabla cerrada, y la trazabilidad de la prueba. El importe no se inventa.
- **Depende de:** `hechos-reparto`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "regla-fallo"` · `unidad: "plaza"` · `subscribes:` ["regla-fallo.medir.request", "regla-fallo.adjudicar.request", "bocaos.acta_incompleta", "bocaos.acta_completa", "project.activated"] · `publishes:` ["regla-fallo.medir.response", "regla-fallo.medir.failed", "regla-fallo.adjudicar.response", "regla-fallo.adjudicar.failed", "bocaos.fallo_medido", "bocaos.fallo_adjudicado"]
- **C · index.js:** `class ReglaFallo extends ModuloHibridoReflejo`. Sin estado, sin `PosPersistencia`: si guardara una copia, habría dos verdades y una sería vieja.
- **D · proyecciones internas:** `_medir` (G02: un fallo existe si y sólo si los hechos con hora lo verifican. Sin acta completa no hay fallo.) · `_adjudicar` (G03: tabla cerrada de quién responde. Devuelve QUIÉN, no CUÁNTO: los importes siguen sin número y se declaran.) · `_traza` (G06: la evidencia que sostiene la adjudicación, enumerable.)
- **E · handler:** `onMedirRequest(e)` → `_atender(e, 'medir', 'regla-fallo.medir.response', d => this._medir(d))` · **CLASE: PREGUNTA** — G02: ¿hubo fallo? con los hechos que lo verifican
- **E · handler:** `onAdjudicarRequest(e)` → `_atender(e, 'adjudicar', 'regla-fallo.adjudicar.response', d => this._adjudicar(d))` · **CLASE: PREGUNTA** — G03: a quién, con la tabla y sin importe
- **F · hechos que publica:** `bocaos.fallo_medido`, `bocaos.fallo_adjudicado`
- **VERIFICACIÓN:** Acta incompleta → no hay fallo y `cargo-fallo` no puede nacer. Adjudicación devuelve quién; el importe sale NO_CONSTA, no 0.
- **NO REUTILIZA / DECISIÓN:** Sin cambios. La tabla de importes sigue sin número (deuda 8 de la v1, que sigue viva).

#### `cargo-fallo` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** G04
- **Propósito:** La deuda entre partes: nace de una adjudicación con evidencia y nunca se convierte en descuento. Bocaos no retiene, así que no puede descontar de un dinero que no tiene.
- **Depende de:** `regla-fallo`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "cargo-fallo"` · `unidad: "plaza"` · `subscribes:` ["cargo-fallo.anotar.request", "cargo-fallo.de.request", "bocaos.fallo_adjudicado", "bocaos.acta_incompleta", "project.activated"] · `publishes:` ["cargo-fallo.anotar.response", "cargo-fallo.anotar.failed", "cargo-fallo.de.response", "cargo-fallo.de.failed", "bocaos.cargo_anotado", "bocaos.cargo_sin_evidencia"]
- **C · index.js:** `class CargoFallo extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/cargo-fallo.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_anotar` (G04: deuda con partes, evidencia y plaza. Sin evidencia NO nace (y se publica el intento).) · `_no_descuento` (G04: una deuda no se compensa con un devengo. La plaza no retiene (H06).)
- **E · handler:** `onAnotarRequest(e)` → `_atender(e, 'anotar', 'cargo-fallo.anotar.response', d => this._anotar(d))` · **CLASE: ORDEN** — G04: deuda entre partes con su evidencia
- **E · handler:** `onDeRequest(e)` → `_atender(e, 'de', 'cargo-fallo.de.response', d => this._de(d))` · **CLASE: PREGUNTA** — G04: deudas de una parte en un periodo
- **F · hechos que publica:** `bocaos.cargo_anotado`, `bocaos.cargo_sin_evidencia`
- **VERIFICACIÓN:** Adjudicación sin evidencia → `cargo_sin_evidencia` y ninguna deuda. La deuda NO aparece descontada en el cierre.
- **NO REUTILIZA / DECISIÓN:** Sin cambios. `grocy`/`prisma/cuenta` son otra cosa (stock, ticket de venta).

#### `disputa-fallo` · `PUENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** G05
- **Propósito:** Cuando una parte disputa un cargo: se abre caso, se lleva a la cola con su traza y se espera dictamen. La disputa no borra la deuda: la deja en el aire con nombre.
- **Depende de:** `cargo-fallo`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "disputa-fallo"` · `unidad: "plaza"` · `subscribes:` ["disputa-fallo.abrir.request", "bocaos.cargo_anotado", "project.activated"] · `publishes:` ["disputa-fallo.abrir.response", "disputa-fallo.abrir.failed", "bocaos.disputa_abierta"]
- **C · index.js:** `class DisputaFallo extends ModuloHibridoReflejo` + cliente del puerto (canal / pago / ruta / publicación). Sin reglas de negocio: traduce y devuelve el resultado del proveedor.
- **D · proyecciones internas:** `_abrir` (G05: cargo + parte + motivo + hechos citados. No decide: encola (D3).) · `_no_borra` (G05: la deuda sigue; lo que cambia es que no se cobra hasta el dictamen.)
- **E · handler:** `onAbrirRequest(e)` → `_atender(e, 'abrir', 'disputa-fallo.abrir.response', d => this._abrir(d))` · **CLASE: ORDEN** — G05: abre disputa de un cargo → caso en cola
- **F · hechos que publica:** `bocaos.disputa_abierta`
- **VERIFICACIÓN:** Disputa abierta → el cargo no entra en el cierre como cobrable. Dictamen firmado → se aplica el efecto permitido, no se rehace la propuesta.
- **NO REUTILIZA / DECISIÓN:** Sin cambios.

#### `liquidacion` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** H01 · H02 · H05 · E04 · E05 · A32 · H06
- **Propósito:** El único dinero de Bocaos: devengo por parte, cierre semanal inmutable, mora. Sin retención, sin netting, sin % del ticket. La plaza cobra lo suyo y nada más.
- **Depende de:** `hechos-reparto`, `cargo-fallo`, `contrato-tramos`, `contrato-puntual`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem` · `scheduler`
- **B · module.json:** `name: "liquidacion"` · `unidad: "plaza"` · `subscribes:` ["liquidacion.abrir.request", "liquidacion.cerrar.request", "liquidacion.devengar.request", "liquidacion.mora.request", "scheduler.job.triggered", "bocaos.hecho_reparto_anotado", "bocaos.cargo_anotado", "bocaos.cobro_fallido", "project.activated"] · `publishes:` ["liquidacion.abrir.response", "liquidacion.abrir.failed", "liquidacion.cerrar.response", "liquidacion.cerrar.failed", "liquidacion.devengar.response", "liquidacion.devengar.failed", "liquidacion.mora.response", "liquidacion.mora.failed", "bocaos.ciclo_abierto", "bocaos.cierre_semanal", "bocaos.devengo_calculado", "bocaos.mora_aplicada"]
- **C · index.js:** `class Liquidacion extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/liquidacion.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_devengar` (H01: por contrato cerrado del periodo. Tienda: fijo del tramo + 20 c/pedido. Rider: 10 c/pedido. NUNCA por km ahorrado, NUNCA por % del ticket.) · `_dos_cifras` (H01/E04: seguro + en duda. Un pedido cancelado tras aceptar queda 'en duda' (Q18), no se elige.) · `_cerrar` (H02: cierre INMUTABLE del periodo. Se crea el job `bocaos.ciclo_semanal` en project.activated y se filtra el disparo del scheduler.) · `_mora` (H05: recordatorio → recargo → suspensión. La suspensión NO corta pedidos en vuelo ni propuestas vivas.) · `_comision` (E04: la comisión de coordinación, derivada del tramo vigente CUANDO OCURRIÓ el hecho.) · `_reparto` (E05: reparto del pago por parte. Conversor puro: no guarda, compone desde el cierre.) · `_no_retencion` (H06/A32: la plaza no retiene. Falla si un cierre descuenta una deuda o un km ahorrado.)
- **E · handler:** `onAbrirRequest(e)` → `_atender(e, 'abrir', 'liquidacion.abrir.response', d => this._abrir(d))` · **CLASE: ORDEN** — H02: abre el periodo
- **E · handler:** `onDevengarRequest(e)` → `_atender(e, 'devengar', 'liquidacion.devengar.response', d => this._devengar(d))` · **CLASE: PREGUNTA** — H01: devengo de una parte en el periodo (seguro + en duda)
- **E · handler:** `onCerrarRequest(e)` → `_atender(e, 'cerrar', 'liquidacion.cerrar.response', d => this._cerrar(d))` · **CLASE: ORDEN** — H02: cierra el periodo → Cierre inmutable + `plaza.devengo-cerrado`
- **E · handler:** `onMoraRequest(e)` → `_atender(e, 'mora', 'liquidacion.mora.response', d => this._mora(d))` · **CLASE: ORDEN** — H05: aplica mora según días
- **F · hechos que publica:** `bocaos.ciclo_abierto`, `bocaos.cierre_semanal`, `bocaos.devengo_calculado`, `bocaos.mora_aplicada`
- **VERIFICACIÓN:** Cerrar dos veces el mismo periodo → el segundo no cambia el cierre. Deuda descontada de un devengo → H06 rojo. Ciclo sin nacional → sigue cerrando.
- **NO REUTILIZA / DECISIÓN:** `prisma/cuenta` y `pizzepos/cuentas` cobran tickets de venta. Esto devenga una cuota entre empresas: otro objeto y otro cierre.

#### `factura-gestion` · `CONVERSOR` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** H03
- **Propósito:** Del cierre inmutable al documento de cobro de una parte, con su IVA y su serie. No guarda un segundo libro: convierte.
- **Depende de:** `liquidacion`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `contabilidad-fiscal/factura-electronica`
- **B · module.json:** `name: "factura-gestion"` · `unidad: "plaza"` · `subscribes:` ["factura-gestion.emitir.request", "bocaos.cierre_semanal"] · `publishes:` ["factura-gestion.emitir.response", "factura-gestion.emitir.failed", "bocaos.factura_emitida"]
- **C · index.js:** `class FacturaGestion extends ModuloHibridoReflejo`. Convierte al vuelo y NO guarda el resultado: una segunda copia es una segunda verdad.
- **D · proyecciones internas:** `_emitir` (H03: cierre + parte → documento de cobro. Una factura por cierre y parte; la segunda es rectificativa.) · `_iva` (H03: el IVA es Q4 (abierto): el campo existe, el tipo no se inventa.)
- **E · handler:** `onEmitirRequest(e)` → `_atender(e, 'emitir', 'factura-gestion.emitir.response', d => this._emitir(d))` · **CLASE: ORDEN** — H03: cierre → documento de cobro
- **F · hechos que publica:** `bocaos.factura_emitida`
- **VERIFICACIÓN:** Dos facturas del mismo cierre y parte → la segunda exige rectificativa. Sin tipo de IVA declarado → documento con IVA NO_CONSTA, no 0.
- **NO REUTILIZA / DECISIÓN:** El ecosistema tiene `contabilidad-fiscal/factura-electronica` y `facturacion/*` con series y formatos españoles: se usarán como PROVEEDOR del puerto Documento, no como hoja (su sujeto es un proyecto contable, no una plaza).

#### `cobro-gestion` · `PUENTE` · acción **ADAPTAR** · unidad **PLAZA**

- **Clases:** H04
- **Propósito:** Cobrar la cuota de la plaza por el canal de la parte: enlace, tarjeta guardada o datáfono. Y revertir un cargo cuando hay que devolverlo (Q29).
- **Depende de:** — (raíz)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `pago-gateway` · `credential-manager`
- **B · module.json:** `name: "cobro-gestion"` · `unidad: "plaza"` · `subscribes:` ["cobro-gestion.cobrar.request", "cobro-gestion.revertir.request", "cobro-gestion.estado.request", "pago.confirmado", "pago.rechazado", "project.activated"] · `publishes:` ["cobro-gestion.cobrar.response", "cobro-gestion.cobrar.failed", "cobro-gestion.revertir.response", "cobro-gestion.revertir.failed", "cobro-gestion.estado.response", "cobro-gestion.estado.failed", "bocaos.cobro_realizado", "bocaos.cobro_fallido", "bocaos.reversion_realizada"]
- **C · index.js:** `class CobroGestion extends ModuloHibridoReflejo` + cliente del puerto (canal / pago / ruta / publicación). Sin reglas de negocio: traduce y devuelve el resultado del proveedor.
- **D · proyecciones internas:** `_cobrar` (H04: documento de `factura-gestion` → canal de la parte. La cuenta y la credencial son de la plaza.) · `_revertir` (H04 + Q29: `transfer_reversal` sobre la cuenta conectada. Requiere un movimiento que `pago-gateway` HOY NO EXPONE.) · `_no_libro` (H04: el libro de cobros de la plaza es su cierre inmutable, no el libro de `pago-gateway`.)
- **E · handler:** `onCobrarRequest(e)` → `_atender(e, 'cobrar', 'cobro-gestion.cobrar.response', d => this._cobrar(d))` · **CLASE: ORDEN** — H04: cobra un documento por el canal de la parte
- **E · handler:** `onRevertirRequest(e)` → `_atender(e, 'revertir', 'cobro-gestion.revertir.response', d => this._revertir(d))` · **CLASE: ORDEN** — H04: revierte un cargo (Q29) | NO_SOPORTADO si el proveedor no expone transfer_reversal
- **E · handler:** `onEstadoRequest(e)` → `_atender(e, 'estado', 'cobro-gestion.estado.response', d => this._estado(d))` · **CLASE: PREGUNTA** — H04: estado de un cobro
- **F · hechos que publica:** `bocaos.cobro_realizado`, `bocaos.cobro_fallido`, `bocaos.reversion_realizada`
- **VERIFICACIÓN:** Cobro confirmado por la pasarela → `bocaos.cobro_realizado`. Reversión sin soporte del proveedor → `reversion.failed` con motivo, nunca un éxito inventado.
- **NO REUTILIZA / DECISIÓN:** ADAPTAR `pago-gateway` v3.1.0: cobra por proyecto con credencial y conciliación (`pago.iniciar`, `pago.cobrar_guardada`, `pago.reader.*`, `pago.confirmado`). Se le añade `revertir` y el canal POR PARTE. Deuda declarada: `transfer_reversal` no existe hoy en el módulo (verificado: 0 ocurrencias).

#### `cuenta-parte` · `REFLEJO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** Q01 · M01
- **Propósito:** La cuenta de una parte en esta plaza: lo devengado, lo cobrado, lo que debe y lo que está en duda. Con dos plazas, dos cuentas: aquí no se ve la de al lado.
- **Depende de:** `liquidacion`, `contrato-puntual`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "cuenta-parte"` · `unidad: "plaza"` · `subscribes:` ["cuenta-parte.ver.request", "cuenta-parte.cartera.request", "bocaos.cierre_semanal", "bocaos.cobro_realizado", "bocaos.cargo_anotado"] · `publishes:` ["cuenta-parte.ver.response", "cuenta-parte.ver.failed", "cuenta-parte.cartera.response", "cuenta-parte.cartera.failed"]
- **C · index.js:** `class CuentaParte extends ModuloHibridoReflejo`. Sin estado, sin `PosPersistencia`: si guardara una copia, habría dos verdades y una sería vieja.
- **D · proyecciones internas:** `_ver` (Q01: devengado · cobrado · deuda · en duda, con la versión de tramos que estaba viva.) · `_cartera` (M01: la cartera del rider en ESTA plaza. Un rider en dos plazas tiene dos carteras y un solo cuerpo (§7.9).)
- **E · handler:** `onVerRequest(e)` → `_atender(e, 'ver', 'cuenta-parte.ver.response', d => this._ver(d))` · **CLASE: PREGUNTA** — Q01: la cuenta de una parte
- **E · handler:** `onCarteraRequest(e)` → `_atender(e, 'cartera', 'cuenta-parte.cartera.response', d => this._cartera(d))` · **CLASE: PREGUNTA** — M01: la cartera del rider en esta plaza
- **F · hechos que publica:** — (ninguno: sólo calcula)
- **VERIFICACIÓN:** La cuenta de una parte de la plaza A no se puede pedir desde la B. Un rider con dos altas ve dos carteras distintas.
- **NO REUTILIZA / DECISIÓN:** Es un reflejo y no guarda nada: si guardara, habría dos verdades del dinero.

#### `cola-sala` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** P01 · P02 · O03
- **Propósito:** La única cola de lo atascado: casos con plazo, vista de la parte y revisión humana. Ni un pedido se pierde porque nadie lo miró: se queda visible y sube de prioridad.
- **Depende de:** `enlace`, `regla-fallo`, `incidencia-reparto`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "cola-sala"` · `unidad: "plaza"` · `subscribes:` ["cola-sala.encolar.request", "cola-sala.ver.request", "cola-sala.cerrar.request", "cola-sala.vista_parte.request", "bocaos.enlace_agotado", "bocaos.incidencia_abierta", "bocaos.disputa_abierta", "bocaos.cargo_sin_evidencia", "bocaos.aviso_tienda_fallido", "bocaos.aviso_cliente_fallido", "bocaos.censo_incompleto", "project.activated"] · `publishes:` ["cola-sala.encolar.response", "cola-sala.encolar.failed", "cola-sala.ver.response", "cola-sala.ver.failed", "cola-sala.cerrar.response", "cola-sala.cerrar.failed", "cola-sala.vista_parte.response", "cola-sala.vista_parte.failed", "bocaos.caso_encolado", "bocaos.caso_cerrado", "bocaos.revision_solicitada"]
- **C · index.js:** `class ColaSala extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/cola-sala.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_encolar` (P01: caso con tipo, traza y plazo. Vencer NO resuelve: sube de prioridad y sigue vivo.) · `_vista` (P02: lo que la parte ve de su caso, sin datos de la otra parte.) · `_revision` (O03: la revisión humana es de la plaza donde se decidió; el nacional no puede dictaminar sobre una propuesta que no tiene.)
- **E · handler:** `onEncolarRequest(e)` → `_atender(e, 'encolar', 'cola-sala.encolar.response', d => this._encolar(d))` · **CLASE: ORDEN** — P01: encola un caso con plazo
- **E · handler:** `onVerRequest(e)` → `_atender(e, 'ver', 'cola-sala.ver.response', d => this._ver(d))` · **CLASE: PREGUNTA** — P01: la cola por plazo y tipo
- **E · handler:** `onVistaParteRequest(e)` → `_atender(e, 'vista_parte', 'cola-sala.vista_parte.response', d => this._vista_parte(d))` · **CLASE: PREGUNTA** — P02: el caso como lo ve la parte
- **E · handler:** `onCerrarRequest(e)` → `_atender(e, 'cerrar', 'cola-sala.cerrar.response', d => this._cerrar(d))` · **CLASE: ORDEN** — P01: cierra con dictamen o con hecho
- **F · hechos que publica:** `bocaos.caso_encolado`, `bocaos.caso_cerrado`, `bocaos.revision_solicitada`
- **VERIFICACIÓN:** Caso vencido → sigue vivo y con más prioridad (no se cierra solo). La cola no se vacía al reiniciar.
- **NO REUTILIZA / DECISIÓN:** `cola` es la cola de impresión 3D (FIFO + urgencia, hardcodeada a GCODE): mismo patrón, otro dominio, no se adapta. Se toma el patrón.

#### `aviso-sala` · `PUENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** I07
- **Propósito:** Avisar a quien atiende la sala (Q40: agentes, no sala humana). Si el aviso no llega, el caso sigue vivo en la cola: nadie lo atiende, pero nadie lo pierde.
- **Depende de:** `cola-sala`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `telegram-bridge`
- **B · module.json:** `name: "aviso-sala"` · `unidad: "plaza"` · `subscribes:` ["aviso-sala.avisar.request", "bocaos.caso_encolado"] · `publishes:` ["aviso-sala.avisar.response", "aviso-sala.avisar.failed", "bocaos.aviso_sala_entregado", "bocaos.aviso_sala_vencido"]
- **C · index.js:** `class AvisoSala extends ModuloHibridoReflejo` + cliente del puerto (canal / pago / ruta / publicación). Sin reglas de negocio: traduce y devuelve el resultado del proveedor.
- **D · proyecciones internas:** `_avisar` (I07: caso + traza + plazo al destinatario declarado (un agente, hoy).) · `_vencido` (I07: si el aviso caduca sin respuesta, se publica el vencimiento: el caso sigue en la cola.)
- **E · handler:** `onAvisarRequest(e)` → `_atender(e, 'avisar', 'aviso-sala.avisar.response', d => this._avisar(d))` · **CLASE: ORDEN** — I07: avisa del caso al destinatario de la sala
- **F · hechos que publica:** `bocaos.aviso_sala_entregado`, `bocaos.aviso_sala_vencido`
- **VERIFICACIÓN:** Agente caído → `aviso_sala_vencido` y el caso sigue en la cola. El aviso no cierra el caso.
- **NO REUTILIZA / DECISIÓN:** Q40 deja un destinatario que es un agente. Si el agente no existe, el caso sigue vivo: vivo y visible no es atendido (tensión T3).

#### `accion-sancion` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** P03
- **Propósito:** La sanción como ACTO firmado de la sala, con motivo y plazo, sobre una parte del censo. No hay sanciones automáticas: ni por rechazar, ni por caerse.
- **Depende de:** `cola-sala`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "accion-sancion"` · `unidad: "plaza"` · `subscribes:` ["accion-sancion.aplicar.request", "bocaos.caso_cerrado", "project.activated"] · `publishes:` ["accion-sancion.aplicar.response", "accion-sancion.aplicar.failed", "bocaos.parte_sancionada"]
- **C · index.js:** `class AccionSancion extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/accion-sancion.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_aplicar` (P03: parte + motivo + plazo + firmante. Sin firmante no hay sanción.) · `_limites` (P03: no corta pedidos en vuelo ni propuestas vivas; no toca el dinero.)
- **E · handler:** `onAplicarRequest(e)` → `_atender(e, 'aplicar', 'accion-sancion.aplicar.response', d => this._aplicar(d))` · **CLASE: ORDEN** — P03: aplica una sanción con motivo, plazo y firma
- **F · hechos que publica:** `bocaos.parte_sancionada`
- **VERIFICACIÓN:** Sanción sin firmante → 403. Sancionar por un rechazo → no hay camino: el rechazo no crea caso.
- **NO REUTILIZA / DECISIÓN:** Sin cambios.

#### `dictamen-revision` · `CUSTODIO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** O04
- **Propósito:** El dictamen firmado de una revisión humana: compensar, corregir el histórico o cambiar la regla HACIA ADELANTE. Nunca rehacer la propuesta emitida.
- **Depende de:** `cola-sala`, `config-mercado`, `acta-decisiones`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "dictamen-revision"` · `unidad: "plaza"` · `subscribes:` ["dictamen-revision.dictaminar.request", "bocaos.revision_solicitada", "project.activated"] · `publishes:` ["dictamen-revision.dictaminar.response", "dictamen-revision.dictaminar.failed", "bocaos.dictamen_firmado", "bocaos.dictamen_rechazado"]
- **C · index.js:** `class DictamenRevision extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/dictamen-revision.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_dictaminar` (O04: caso + firmante + efecto permitido + motivo. El efecto prohibido (rehacer la propuesta) no se puede escribir.) · `_efectos` (O04: compensar · corregir histórico · cambiar la regla hacia adelante. Tres, cerrados.) · `_firma` (O04: la firma dice el ámbito; una revisión de tienda no la firma el dueño de la plaza.)
- **E · handler:** `onDictaminarRequest(e)` → `_atender(e, 'dictaminar', 'dictamen-revision.dictaminar.response', d => this._dictaminar(d))` · **CLASE: ORDEN** — O04: dictamen firmado con efecto permitido | EFECTO_PROHIBIDO
- **F · hechos que publica:** `bocaos.dictamen_firmado`, `bocaos.dictamen_rechazado`
- **VERIFICACIÓN:** Dictamen que 'rehace' la propuesta → EFECTO_PROHIBIDO. Cambiar la regla no reescribe propuestas pasadas (A29 las reproduce igual).
- **NO REUTILIZA / DECISIÓN:** Sin cambios. `interfaz` (radar) confirma veredictos: otro vertical.

#### `salud-mercado` · `REFLEJO` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** I05 · I06 · O01 · N01
- **Propósito:** La medida maestra: aceptadas/emitidas, propuestas por aceptación, riders activos, esperas, devengado, pedidos sin propuesta, densidad y fricciones. Sólo hechos escritos; lo que no consta es HUECO, no cero.
- **Depende de:** `propuesta`, `hechos-reparto`, `liquidacion`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `metricas`
- **B · module.json:** `name: "salud-mercado"` · `unidad: "plaza"` · `subscribes:` ["salud-mercado.medir.request", "salud-mercado.cuadro.request", "salud-mercado.fricciones.request", "bocaos.propuesta_emitida", "bocaos.propuesta_aceptada", "bocaos.cierre_semanal"] · `publishes:` ["salud-mercado.medir.response", "salud-mercado.medir.failed", "salud-mercado.cuadro.response", "salud-mercado.cuadro.failed", "salud-mercado.fricciones.response", "salud-mercado.fricciones.failed", "bocaos.medida_publicada"]
- **C · index.js:** `class SaludMercado extends ModuloHibridoReflejo`. Sin estado, sin `PosPersistencia`: si guardara una copia, habría dos verdades y una sería vieja.
- **D · proyecciones internas:** `_medir` (I05: la medida maestra. Un mercado que necesita seis propuestas para mover un pedido está muerto aunque venda.) · `_fricciones` (I06: los 8 pares, medidos sobre los mismos hechos que I05 y O01. Tres módulos darían tres cifras del mismo mercado.) · `_cuadro` (O01: el cuadro del jefe de la plaza. Agregados de mercado, nunca de personas.) · `_densidad` (N01: densidad por zona — información para el dueño; abrir o cerrar zona es una SolicitudDecisión (D6).)
- **E · handler:** `onMedirRequest(e)` → `_atender(e, 'medir', 'salud-mercado.medir.response', d => this._medir(d))` · **CLASE: PREGUNTA** — I05: la medida del periodo, con huecos
- **E · handler:** `onCuadroRequest(e)` → `_atender(e, 'cuadro', 'salud-mercado.cuadro.response', d => this._cuadro(d))` · **CLASE: PREGUNTA** — O01: el cuadro del jefe
- **E · handler:** `onFriccionesRequest(e)` → `_atender(e, 'fricciones', 'salud-mercado.fricciones.response', d => this._fricciones(d))` · **CLASE: PREGUNTA** — I06: los 8 pares
- **F · hechos que publica:** `bocaos.medida_publicada`
- **VERIFICACIÓN:** Mercado sin propuestas → 'sin propuestas', no 0%. Nunca se calcula con el histórico de otra plaza.
- **NO REUTILIZA / DECISIÓN:** `metricas` es instrumentación pasiva del bus (counters, gauges). Esto mide el NEGOCIO y no se alimenta de logs. No se toca `metricas`: entra como base de observabilidad.

#### `publicacion` · `PUENTE` · acción **CONSTRUIR** · unidad **PLAZA**

- **Clases:** (raíz Plaza: publicar)
- **Propósito:** LA PUERTA DE LA PLAZA HACIA ARRIBA: publica los cuatro hechos que cruzan, con el plaza_id sellado por la plaza. No espera acuse y no pregunta nada al nacional. Aquí se concede el acceso delegado (el único acto que sube).
- **Depende de:** `config-mercado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `scheduler`
- **B · module.json:** `name: "publicacion"` · `unidad: "plaza"` · `subscribes:` ["publicacion.acceso_concedido.request", "bocaos.censo_actualizado", "bocaos.cierre_semanal", "scheduler.job.triggered", "project.activated"] · `publishes:` ["publicacion.acceso_concedido.response", "publicacion.acceso_concedido.failed", "plaza.viva", "tienda.dada-de-alta", "plaza.devengo-cerrado", "plaza.acceso-visto", "bocaos.publicacion_intentada"]
- **C · index.js:** `class Publicacion extends ModuloHibridoReflejo` + cliente del puerto Publicación. Sin store de negocio: guarda únicamente el último latido para no repetirlo.
- **D · proyecciones internas:** `_viva` (`plaza.viva` { plaza_id, versión, estado, tiendas:N } periódico y barato, por el job `bocaos.plaza.viva`.) · `_tienda` (`tienda.dada-de-alta` { plaza_id, tienda_id, nombre, estado } cuando pasa (lo dispara `bocaos.censo_actualizado`).) · `_devengo` (`plaza.devengo-cerrado` { plaza_id, periodo, total, partes:N } al cerrar la semana. Lleva CUÁNTAS partes, no cuáles.) · `_acceso` (`plaza.acceso-visto` al conceder o usar un acceso. Es el único acto de la plaza que sube con nombre propio.) · `_sello` (El plaza_id NO se copia del payload: se toma de la configuración del despliegue. El tienda_id se toma del pedido/alta del dueño, nunca del que llama.) · `_sin_acuse` (No hay `.response` ni reintento que bloquee: con el nacional caído, publicar es publicar al vacío y el negocio sigue.)
- **E · handler:** `onAccesoConcedidoRequest(e)` → `_atender(e, 'acceso_concedido', 'publicacion.acceso_concedido.response', d => this._acceso_concedido(d))` · **CLASE: ORDEN** — Concede un acceso delegado a una persona y plaza, con alcance y plazo (hoy: D14 del diseño dice ámbito nacional; ver fricción)
- **F · hechos que publica:** `plaza.viva`, `tienda.dada-de-alta`, `plaza.devengo-cerrado`, `plaza.acceso-visto`, `bocaos.publicacion_intentada`
- **VERIFICACIÓN:** Parar el nacional: `publicacion` sigue publicando y nada se bloquea. `plaza.devengo-cerrado` no lleva nombres de partes. Ninguna fila con plaza_id de otra plaza.
- **NO REUTILIZA / DECISIÓN:** No tiene `.failed` y es deliberado: un emisor que afirma entrega miente. El círculo se cierra en `fed-buzon` (`hecho_rechazado` / `fila_sin_plaza`). Es la única desviación del 'todo flujo con su par de fallo' y va escrita.

### ▸ UNIDAD `tienda` — el proyecto de cada tienda (N por plaza)

#### `tienda-marca` · `CUSTODIO` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** D01
- **Propósito:** Quién firma el escaparate: la tienda. Bocaos no firma nada que el cliente vea — y la plaza tampoco. No hay campo donde poner la marca de otro.
- **Depende de:** — (raíz)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "tienda-marca"` · `unidad: "tienda"` · `subscribes:` ["tienda-marca.declarar.request", "tienda-marca.de.request", "project.activated"] · `publishes:` ["tienda-marca.declarar.response", "tienda-marca.declarar.failed", "tienda-marca.de.response", "tienda-marca.de.failed", "bocaos.marca_tienda_declarada"]
- **C · index.js:** `class TiendaMarca extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/tienda-marca.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_declarar` (D01: nombre · signos · tono · titular. El titular es la tienda por construcción, no por contrato.) · `_de` (D01: NO_CONSTA si no ha declarado. No se rellena con una marca por defecto: una marca por defecto es la del mercado.)
- **E · handler:** `onDeclararRequest(e)` → `_atender(e, 'declarar', 'tienda-marca.declarar.response', d => this._declarar(d))` · **CLASE: ORDEN** — D01: la tienda declara su marca
- **E · handler:** `onDeRequest(e)` → `_atender(e, 'de', 'tienda-marca.de.response', d => this._de(d))` · **CLASE: PREGUNTA** — D01: la marca de esta tienda | NO_CONSTA
- **F · hechos que publica:** `bocaos.marca_tienda_declarada`
- **VERIFICACIÓN:** Tienda sin marca → su carta no se publica (no hay firma). La marca de la tienda A no aparece en la carta de la B.
- **NO REUTILIZA / DECISIÓN:** `pizzepos/carta-marketing` mezcla marca + copy de producto de un proyecto. Aquí la marca es del dueño y el copy no existe: la carta es del catálogo, no de un texto de marketing.

#### `tienda-carta` · `CONVERSOR` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** D02
- **Propósito:** Proyecta y poda la carta pública de la tienda desde SU catálogo. Una sola fuente; no se guarda una segunda carta. El orden es el de la tienda, nunca el de la plaza.
- **Depende de:** `tienda-marca`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "tienda-carta"` · `unidad: "tienda"` · `subscribes:` ["tienda-carta.publicar.request", "tienda-carta.ver.request", "bocaos.marca_tienda_declarada"] · `publishes:` ["tienda-carta.publicar.response", "tienda-carta.publicar.failed", "tienda-carta.ver.response", "tienda-carta.ver.failed", "bocaos.carta_publicada"]
- **C · index.js:** `class TiendaCarta extends ModuloHibridoReflejo`. Convierte al vuelo y NO guarda el resultado: una segunda copia es una segunda verdad.
- **D · proyecciones internas:** `_proyectar` (D02: catálogo interno (puerto Catálogo) → carta pública podada: qué se publica, en qué orden, con qué disponibilidad.) · `_podar_sin_destacar` (D02: podar no es destacar. Ningún campo de 'destacado' ni de posición comprada (D08 lo vigila).) · `_firma` (D02: la carta sale firmada por la marca de la tienda; sin marca declarada no se publica.)
- **E · handler:** `onPublicarRequest(e)` → `_atender(e, 'publicar', 'tienda-carta.publicar.response', d => this._publicar(d))` · **CLASE: ORDEN** — D02: proyecta y publica la carta de esta tienda
- **E · handler:** `onVerRequest(e)` → `_atender(e, 'ver', 'tienda-carta.ver.response', d => this._ver(d))` · **CLASE: PREGUNTA** — D02: la carta pública de esta tienda
- **F · hechos que publica:** `bocaos.carta_publicada`
- **VERIFICACIÓN:** Cambiar el catálogo → la carta cambia sin republicar a mano (una sola fuente). Carta sin marca → 409.
- **NO REUTILIZA / DECISIÓN:** SE ACERCA `pizzepos/carta-digital` v2.25.1 y se descarta: proyecta la carta de OTRO vertical (carta-manager + tarifas + contenido) y la sirve por su cf-worker. Aquí la fuente es el catálogo de la tienda por el puerto Catálogo, y el consumidor es el canal de la tienda. Se toma el patrón (proyectar al vuelo, no guardar copia).

#### `tienda-cliente` · `CUSTODIO` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** D05 · L02
- **Propósito:** El cliente es DE LA TIENDA, aislado por tienda. No hay registro global, ni identidad única, ni 'cliente del mercado'. Y L02 vigila que ninguna consulta cruce tiendas, tampoco dentro de la misma plaza.
- **Depende de:** `tienda-marca`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "tienda-cliente"` · `unidad: "tienda"` · `subscribes:` ["tienda-cliente.alta.request", "tienda-cliente.de.request", "tienda-cliente.guarda_propiedad.request", "project.activated"] · `publishes:` ["tienda-cliente.alta.response", "tienda-cliente.alta.failed", "tienda-cliente.de.response", "tienda-cliente.de.failed", "tienda-cliente.guarda_propiedad.response", "tienda-cliente.guarda_propiedad.failed", "bocaos.cliente_registrado", "bocaos.propiedad_cliente_violada"]
- **C · index.js:** `class TiendaCliente extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/tienda-cliente.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_alta` (D05: identidad · tienda · instrucciones de acceso. Índice por (tienda, cliente).) · `_de` (D05: NO_CONSTA si no es cliente de esta tienda. No hay búsqueda por identidad global.) · `_guarda_propiedad` (L02: falla si un cliente aparece en otra tienda — por identidad, por dirección, en un agregado o como 'quizá te interese'.)
- **E · handler:** `onAltaRequest(e)` → `_atender(e, 'alta', 'tienda-cliente.alta.response', d => this._alta(d))` · **CLASE: ORDEN** — D05: alta de cliente en esta tienda
- **E · handler:** `onDeRequest(e)` → `_atender(e, 'de', 'tienda-cliente.de.response', d => this._de(d))` · **CLASE: PREGUNTA** — D05: ficha (cliente, tienda) | NO_CONSTA
- **E · handler:** `onGuardaPropiedadRequest(e)` → `_atender(e, 'guarda_propiedad', 'tienda-cliente.guarda_propiedad.response', d => this._guarda_propiedad(d))` · **CLASE: PREGUNTA** — L02: cualquier consulta o sugerencia que cruce tiendas → conforme | FALLA
- **F · hechos que publica:** `bocaos.cliente_registrado`, `bocaos.propiedad_cliente_violada`
- **VERIFICACIÓN:** Dos tiendas de la misma plaza con el mismo señor → dos fichas que no se conocen. `guarda_propiedad` en rojo si aparece un cruce.
- **NO REUTILIZA / DECISIÓN:** `pizzepos/productos` es multi-tenant por proyecto; un registro de clientes por proyecto es exactamente lo que aquí NO puede existir entre tiendas... salvo que cada tienda ES un proyecto. Por eso el aislamiento se cumple por el `project_id` de la tienda y L02 lo vigila.

#### `tienda-radio` · `CUSTODIO` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** D06
- **Propósito:** Lo que esta tienda declara que reparte: zona, radio, códigos. Lo declara ella; la plaza no puede ampliarlo ni recortarlo.
- **Depende de:** — (raíz)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "tienda-radio"` · `unidad: "tienda"` · `subscribes:` ["tienda-radio.declarar.request", "tienda-radio.cubre.request", "project.activated"] · `publishes:` ["tienda-radio.declarar.response", "tienda-radio.declarar.failed", "tienda-radio.cubre.response", "tienda-radio.cubre.failed", "bocaos.radio_declarada"]
- **C · index.js:** `class TiendaRadio extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/tienda-radio.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_declarar` (D06: valor del dueño, con hora. Sin radio declarada no se publica carta: no se puede pedir a donde no llega.) · `_cubre` (D06: sí | no | NO_CONSTA. Es la mitad de la intersección que hace S01/S02 en la plaza.)
- **E · handler:** `onDeclararRequest(e)` → `_atender(e, 'declarar', 'tienda-radio.declarar.response', d => this._declarar(d))` · **CLASE: ORDEN** — D06: la tienda declara su zona de reparto
- **E · handler:** `onCubreRequest(e)` → `_atender(e, 'cubre', 'tienda-radio.cubre.response', d => this._cubre(d))` · **CLASE: PREGUNTA** — D06: ¿esta tienda llega a esta dirección?
- **F · hechos que publica:** `bocaos.radio_declarada`
- **VERIFICACIÓN:** Tienda sin radio → `cubre` NO_CONSTA y `frontera-plaza` no la ofrece. La plaza no puede escribir en este store.
- **NO REUTILIZA / DECISIÓN:** No existe en Enki un módulo de cobertura por tienda; `entrega` (the-pirate) guarda UN radio por proyecto de reparto propio. No se toca: es de otro vertical y de otro sujeto.

#### `tienda-carrito` · `CUSTODIO` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** D04
- **Propósito:** Un carrito por cliente y tienda. No existe 'carrito del mercado', ni de la plaza, ni de la federación: un carrito compartido es una cuenta, y una cuenta es una app.
- **Depende de:** `tienda-carta`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "tienda-carrito"` · `unidad: "tienda"` · `subscribes:` ["tienda-carrito.anadir.request", "tienda-carrito.quitar.request", "tienda-carrito.cerrar.request", "tienda-carrito.ver.request", "project.activated"] · `publishes:` ["tienda-carrito.anadir.response", "tienda-carrito.anadir.failed", "tienda-carrito.quitar.response", "tienda-carrito.quitar.failed", "tienda-carrito.cerrar.response", "tienda-carrito.cerrar.failed", "tienda-carrito.ver.response", "tienda-carrito.ver.failed", "bocaos.carrito_cerrado"]
- **C · index.js:** `class TiendaCarrito extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/tienda-carrito.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_anadir` (D04: clave (tienda, cliente). El índice no tiene operación que devuelva los de al lado.) · `_cerrar` (D04: al cerrar se convierte en pedido (C01) y desaparece. Un carrito cerrado que sigue vivo es un pedido que se puede cobrar dos veces.)
- **E · handler:** `onAnadirRequest(e)` → `_atender(e, 'anadir', 'tienda-carrito.anadir.response', d => this._anadir(d))` · **CLASE: ORDEN** — D04: añade línea al carrito del cliente
- **E · handler:** `onQuitarRequest(e)` → `_atender(e, 'quitar', 'tienda-carrito.quitar.response', d => this._quitar(d))` · **CLASE: ORDEN** — D04: quita línea
- **E · handler:** `onCerrarRequest(e)` → `_atender(e, 'cerrar', 'tienda-carrito.cerrar.response', d => this._cerrar(d))` · **CLASE: ORDEN** — D04: cierra → dispara `tienda-captura.alta`
- **E · handler:** `onVerRequest(e)` → `_atender(e, 'ver', 'tienda-carrito.ver.response', d => this._ver(d))` · **CLASE: PREGUNTA** — D04: el carrito de (cliente, tienda)
- **F · hechos que publica:** `bocaos.carrito_cerrado`
- **VERIFICACIÓN:** Carrito de la tienda A no se puede leer con la clave de la B. Cerrar dos veces → YA_CERRADO y un solo pedido.
- **NO REUTILIZA / DECISIÓN:** CORRECCIÓN A LA v1. La v1 decía 'prisma/carrito es de un proyecto y esto es multi-tienda'. Con el corte de la F0 (una tienda = un proyecto) esa razón ya no vale; la que vale es otra: `prisma/carrito` es un buffer EN MEMORIA con clave `cuenta_id`, y D04 es un custodio con clave (cliente, tienda) que sobrevive al reinicio. Se construye.

#### `tienda-incentivo` · `CUSTODIO` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** E02
- **Propósito:** La única palanca económica de la tienda: subir céntimos por un pedido para que un rider lo coja. Con autor y hora. No puede bajar por debajo de lo ya ofrecido a un rider con propuesta viva.
- **Depende de:** — (raíz)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "tienda-incentivo"` · `unidad: "tienda"` · `subscribes:` ["tienda-incentivo.subir.request", "tienda-incentivo.de.request", "project.activated"] · `publishes:` ["tienda-incentivo.subir.response", "tienda-incentivo.subir.failed", "tienda-incentivo.de.response", "tienda-incentivo.de.failed", "bocaos.incentivo_subido"]
- **C · index.js:** `class TiendaIncentivo extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/tienda-incentivo.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_subir` (E02: pedido · céntimos · autor · hora · tope. Puede comprar su propia impuntualidad: es lo que hace que el mercado corrija sin que nadie la sancione.) · `_no_baja` (E02: no baja por debajo de lo ya ofrecido a un rider con propuesta viva — eso lo verifica la plaza (tiene las propuestas) y la tienda obedece.) · `_solo_ella` (E02: si lo pagara la plaza o el nacional, estarían subvencionando demanda (Q17).)
- **E · handler:** `onSubirRequest(e)` → `_atender(e, 'subir', 'tienda-incentivo.subir.response', d => this._subir(d))` · **CLASE: ORDEN** — E02: sube el incentivo de un pedido con autor y hora
- **E · handler:** `onDeRequest(e)` → `_atender(e, 'de', 'tienda-incentivo.de.response', d => this._de(d))` · **CLASE: PREGUNTA** — E02: incentivo vigente de un pedido
- **F · hechos que publica:** `bocaos.incentivo_subido`
- **VERIFICACIÓN:** Subir el incentivo dos veces → suma, no reemplaza. La plaza intenta subirlo por ella → 403.
- **NO REUTILIZA / DECISIÓN:** E02 estaba en el `tarifa-pedido` de la v1 (plaza). El corte la manda a la tienda (es SU dinero) y obliga a partir la tarifa en dos escritores: la tienda pone el incentivo, la plaza compone el precio.

#### `tienda-precio` · `REFLEJO` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** D03
- **Propósito:** Cierra el precio ANTES de pagar: comida + reparto + incentivo, en céntimos, con desglose. El precio final no puede sorprender.
- **Depende de:** `tienda-carrito`, `tarifa-pedido`, `tienda-incentivo`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "tienda-precio"` · `unidad: "tienda"` · `subscribes:` ["tienda-precio.cerrar.request"] · `publishes:` ["tienda-precio.cerrar.response", "tienda-precio.cerrar.failed", "bocaos.precio_cerrado"]
- **C · index.js:** `class TiendaPrecio extends ModuloHibridoReflejo`. Sin estado, sin `PosPersistencia`: si guardara una copia, habría dos verdades y una sería vieja.
- **D · proyecciones internas:** `_cerrar` (D03: carrito + oferta del cliente (E01) + incentivo de la tienda (E02) → céntimos y desglose.) · `_desglose` (D03: el desglose existe siempre; si el cliente lo VE es Q19/Q39. El diseño lo deja calculado, no decidido.) · `_no_sorprende` (D03: si falta la oferta o el incentivo, NO_CONSTA y no hay precio: no se estima una parte del precio.)
- **E · handler:** `onCerrarRequest(e)` → `_atender(e, 'cerrar', 'tienda-precio.cerrar.response', d => this._cerrar(d))` · **CLASE: ORDEN** — D03: → { total, desglose } | NO_CONSTA(cuál)
- **F · hechos que publica:** `bocaos.precio_cerrado`
- **VERIFICACIÓN:** Carrito + oferta + incentivo → total exacto y desglose que suma. Sin oferta → NO_CONSTA y no hay pedido.
- **NO REUTILIZA / DECISIÓN:** `prisma/carrito` tasa ítems y da total del carrito, no un precio de venta cerrado con reparto e incentivo. La composición es de este negocio.

#### `tienda-captura` · `REFLEJO` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** C01
- **Propósito:** El alta de un pedido: de a uno, con el precio ya cerrado y la oferta de reparto congelada. Nace con el plaza_id de la plaza donde vive la tienda.
- **Depende de:** `tienda-carrito`, `tienda-precio`, `tienda-cliente`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "tienda-captura"` · `unidad: "tienda"` · `subscribes:` ["tienda-captura.alta.request"] · `publishes:` ["tienda-captura.alta.response", "tienda-captura.alta.failed", "bocaos.pedido_compuesto"]
- **C · index.js:** `class TiendaCaptura extends ModuloHibridoReflejo`. Sin estado, sin `PosPersistencia`: si guardara una copia, habría dos verdades y una sería vieja.
- **D · proyecciones internas:** `_alta` (C01: cliente de la tienda · líneas · oferta. Sin alta en bloque, sin pedido programado, sin plantilla recurrente.) · `_composicion` (C01: pide `tienda-precio.cerrar` y `pedido.crear`; si el precio no está cerrado, no hay pedido y se nombra el hueco.)
- **E · handler:** `onAltaRequest(e)` → `_atender(e, 'alta', 'tienda-captura.alta.response', d => this._alta(d))` · **CLASE: ORDEN** — C01: → Pedido (lo escribe la plaza) | PRECIO_SIN_CERRAR
- **F · hechos que publica:** `bocaos.pedido_compuesto`
- **VERIFICACIÓN:** Alta sin precio cerrado → PRECIO_SIN_CERRAR y ningún pedido. El pedido creado lleva el plaza_id de la plaza, no el que mande el payload.
- **NO REUTILIZA / DECISIÓN:** `pizzepos/pedidos` crea el pedido del POS con cuenta_id e items en pasos. Este nace con precio congelado y aceptación de la tienda: otro contrato.

#### `tienda-hora-listo` · `CUSTODIO` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** C04
- **Propósito:** La tienda declara la hora de listo. Es el disparador de todo el mercado y lo escribe ELLA: no la sala, no el sistema por estimación. No se adelanta ni se corrige.
- **Depende de:** `tienda-captura`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `_shared/pos-persistencia` · `filesystem`
- **B · module.json:** `name: "tienda-hora-listo"` · `unidad: "tienda"` · `subscribes:` ["tienda-hora-listo.declarar.request", "tienda-hora-listo.de.request", "bocaos.pedido_aceptado", "project.activated"] · `publishes:` ["tienda-hora-listo.declarar.response", "tienda-hora-listo.declarar.failed", "tienda-hora-listo.de.response", "tienda-hora-listo.de.failed", "bocaos.listo_declarado"]
- **C · index.js:** `class TiendaHoraListo extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store `/bocaos/tienda-hora-listo.json` por proyecto (`plaza-<slug>` o `tienda-<id>`).
- **D · proyecciones internas:** `_declarar` (C04: pedido · hora · autor. Una sola vez; si se equivocó, la plaza anota un hecho que desmiente (A01) — aquí no se reescribe.) · `_solo_la_tienda` (C04: el autor tiene que ser la tienda dueña del pedido; la sala y la plaza no pueden declarar por ella.)
- **E · handler:** `onDeclararRequest(e)` → `_atender(e, 'declarar', 'tienda-hora-listo.declarar.response', d => this._declarar(d))` · **CLASE: ORDEN** — C04: la tienda declara listo → hecho (lo anota la plaza en A01)
- **E · handler:** `onDeRequest(e)` → `_atender(e, 'de', 'tienda-hora-listo.de.response', d => this._de(d))` · **CLASE: PREGUNTA** — C04: la declaración vigente de un pedido | NO_CONSTA
- **F · hechos que publica:** `bocaos.listo_declarado`
- **VERIFICACIÓN:** La sala intenta declarar por la tienda → 403. Dos declaraciones del mismo pedido → la segunda exige `desmentir` en la plaza y deja las dos horas.
- **NO REUTILIZA / DECISIÓN:** LA FUSIÓN DE LA v1 YA NO SE PUEDE HACER. En la v1, `hora-listo` era C04+A01 en una hoja; ahora C04 es de la tienda y A01 de la plaza: dos escritores, dos unidades, dos módulos. Es el cambio que más se nota del corte.

#### `tienda-cocina-visible` · `REFLEJO` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** C05
- **Propósito:** Lo que el cliente ve de su pedido: cuatro estados podados. No ve 'en cola', ni 'sin rider', ni 'esperando propuesta' — ve lo que le sirve para decidir si baja.
- **Depende de:** `pedido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "tienda-cocina-visible"` · `unidad: "tienda"` · `subscribes:` ["tienda-cocina-visible.ver.request", "bocaos.pedido_creado", "bocaos.pedido_listo", "bocaos.contrato_creado", "bocaos.prueba_anotada"] · `publishes:` ["tienda-cocina-visible.ver.response", "tienda-cocina-visible.ver.failed"]
- **C · index.js:** `class TiendaCocinaVisible extends ModuloHibridoReflejo`. Sin estado, sin `PosPersistencia`: si guardara una copia, habría dos verdades y una sería vieja.
- **D · proyecciones internas:** `_podar` (C05: estado interno → 4 estados. La poda es una tabla, no un criterio.) · `_aislar` (C05: aunque dos pedidos viajen en el mismo trayecto, no se ve el nombre del otro local ni el otro pedido.)
- **E · handler:** `onVerRequest(e)` → `_atender(e, 'ver', 'tienda-cocina-visible.ver.response', d => this._ver(d))` · **CLASE: PREGUNTA** — C05: estado podado de un pedido del cliente de esta tienda
- **F · hechos que publica:** — (ninguno: sólo calcula)
- **VERIFICACIÓN:** Pedido sin rider → el cliente NO ve 'sin rider' (ve 'en preparación'). Pedido en trayecto compartido → no aparece la otra parada.
- **NO REUTILIZA / DECISIÓN:** `pizzepos/pedidos` expone estados internos de cocina (enviado_cocina, completado). Podar no es leer: aquí no se copia el estado, se traduce.

#### `tienda-aviso-cliente` · `PUENTE` · acción **ADAPTAR** · unidad **TIENDA**

- **Clases:** C06
- **Propósito:** El aviso al cliente final, por el canal DE LA TIENDA: sin marca de Bocaos, sin enlace, sin remitente reconocible. Si este aviso se rompe, la tienda pierde la cara de su cliente.
- **Depende de:** `tienda-cocina-visible`, `escaparate`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `whatsapp-bot` · `credential-manager`
- **B · module.json:** `name: "tienda-aviso-cliente"` · `unidad: "tienda"` · `subscribes:` ["tienda-aviso-cliente.avisar.request", "bocaos.pedido_listo", "bocaos.pedido_cancelado", "bocaos.contrato_creado"] · `publishes:` ["tienda-aviso-cliente.avisar.response", "tienda-aviso-cliente.avisar.failed", "bocaos.aviso_cliente_entregado", "bocaos.aviso_cliente_fallido", "bocaos.aviso_cliente_bloqueado"]
- **C · index.js:** `class TiendaAvisoCliente extends ModuloHibridoReflejo` + cliente del puerto (canal / pago / ruta / publicación). Sin reglas de negocio: traduce y devuelve el resultado del proveedor.
- **D · proyecciones internas:** `_plantilla` (C06: plantilla por tienda (no por plaza, no por nacional), con el nombre y el tono de la tienda.) · `_marca_ajena` (C06: pide `escaparate.marca_ajena` antes de enviar; si FALLA, no se envía y se publica `aviso_cliente_bloqueado`.) · `_canal` (C06: la credencial es de la tienda; el número de origen es el suyo. El transporte es intercambiable; el contrato no.)
- **E · handler:** `onAvisarRequest(e)` → `_atender(e, 'avisar', 'tienda-aviso-cliente.avisar.response', d => this._avisar(d))` · **CLASE: ORDEN** — C06: aviso al cliente por el canal de la tienda → entregado | fallido | bloqueado
- **F · hechos que publica:** `bocaos.aviso_cliente_entregado`, `bocaos.aviso_cliente_fallido`, `bocaos.aviso_cliente_bloqueado`
- **VERIFICACIÓN:** Plantilla con 'Bocaos' → `aviso_cliente_bloqueado` y nada enviado. Proveedor caído → `aviso_cliente_fallido` y el pedido sigue vivo.
- **NO REUTILIZA / DECISIÓN:** ADAPTAR `whatsapp-bot` v1.5.0: ya tiene webhook y credencial POR PROYECTO y publica el par honesto `whatsapp.mensaje.enviado` / `whatsapp.envio.fallido`. Se le añade plantilla por tienda y el validador K02 en la salida. Transporte alternativo declarado: telegram (mismo contrato).

#### `tienda-puntualidad` · `REFLEJO` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** L03
- **Propósito:** Publica una DISTRIBUCIÓN de puntualidad, no una nota: 'esta cocina se pasa 4 minutos la mitad de las veces'. Se publica antes de que el rider acepte y la usa A08 para medir su espera probable.
- **Depende de:** `tienda-hora-listo`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "tienda-puntualidad"` · `unidad: "tienda"` · `subscribes:` ["tienda-puntualidad.medir.request", "bocaos.hecho_reparto_anotado", "bocaos.listo_declarado"] · `publishes:` ["tienda-puntualidad.medir.response", "tienda-puntualidad.medir.failed", "bocaos.puntualidad_publicada"]
- **C · index.js:** `class TiendaPuntualidad extends ModuloHibridoReflejo`. Sin estado, sin `PosPersistencia`: si guardara una copia, habría dos verdades y una sería vieja.
- **D · proyecciones internas:** `_medir` (L03: distribución de hora-de-listo frente a lo prometido, por franja, con n. Sin datos suficientes → NO_CONSTA.) · `_no_nota` (L03: ni estrellas ni 3 sobre 5. Una nota es un juicio; una distribución es información.)
- **E · handler:** `onMedirRequest(e)` → `_atender(e, 'medir', 'tienda-puntualidad.medir.response', d => this._medir(d))` · **CLASE: PREGUNTA** — L03: { distribución, n } | NO_CONSTA — la llama `foto-mercado` (A02) para cada candidato
- **F · hechos que publica:** `bocaos.puntualidad_publicada`
- **VERIFICACIÓN:** Tienda nueva → NO_CONSTA y el rider ve 'sin histórico'. La plaza pide la distribución de otra tienda → 403.
- **NO REUTILIZA / DECISIÓN:** A02 (plaza) LE PIDE ESTE NÚMERO A LA TIENDA. Es la única lectura plaza→tienda que el diseño permite y está escrita en A02: la plaza lee lo que la tienda PUBLICA, nunca su carta, su carrito ni sus clientes.

#### `tienda-panel` · `REFLEJO` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** L01
- **Propósito:** El panel de la tienda: espera medida, puntualidad, propuestas recibidas, pedidos sin repartidor y QUÉ UMBRALES está aplicando ella. La misma información que ve el rider, misma fuente, mismo número.
- **Depende de:** `tienda-puntualidad`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "tienda-panel"` · `unidad: "tienda"` · `subscribes:` ["tienda-panel.ver.request", "bocaos.puntualidad_publicada", "bocaos.propuesta_emitida", "bocaos.hecho_reparto_anotado"] · `publishes:` ["tienda-panel.ver.response", "tienda-panel.ver.failed"]
- **C · index.js:** `class TiendaPanel extends ModuloHibridoReflejo`. Sin estado, sin `PosPersistencia`: si guardara una copia, habría dos verdades y una sería vieja.
- **D · proyecciones internas:** `_ver` (L01: lee de `puntualidad-tienda` (L03), de la plaza (propuestas, pedidos sin rider) y de `config-mercado` (qué capa de umbrales rige).) · `_sin_version_amable` (L01: un solo número. Si hubiera una versión para el que paga y otra para el que sufre, el mercado dejaría de corregir.)
- **E · handler:** `onVerRequest(e)` → `_atender(e, 'ver', 'tienda-panel.ver.response', d => this._ver(d))` · **CLASE: PREGUNTA** — L01: el panel de la tienda en un periodo, con huecos declarados
- **F · hechos que publica:** — (ninguno: sólo calcula)
- **VERIFICACIÓN:** El número de espera del panel == el que vio el rider (misma fuente). Tienda sin histórico → 'sin histórico', no 0.
- **NO REUTILIZA / DECISIÓN:** `dashboard` es observabilidad del bus (logs, métricas de cores). Este panel es del negocio: espera, puntualidad, propuestas. No se toca `dashboard`.

#### `tienda-reclamacion` · `PUENTE` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** K01
- **Propósito:** La única vía de queja del cliente final pasa por la tienda. Bocaos no atiende al cliente final: no tiene dónde poner su caso, y eso es el diseño.
- **Depende de:** `tienda-cliente`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`
- **B · module.json:** `name: "tienda-reclamacion"` · `unidad: "tienda"` · `subscribes:` ["tienda-reclamacion.encauzar.request", "bocaos.reclamacion_recibida"] · `publishes:` ["tienda-reclamacion.encauzar.response", "tienda-reclamacion.encauzar.failed", "bocaos.reclamacion_encauzada", "bocaos.reclamacion_devuelta"]
- **C · index.js:** `class TiendaReclamacion extends ModuloHibridoReflejo` + cliente del puerto (canal / pago / ruta / publicación). Sin reglas de negocio: traduce y devuelve el resultado del proveedor.
- **D · proyecciones internas:** `_encauzar` (K01: reclamación → caso EN LA TIENDA, con hora. Nada viaja a la plaza ni al nacional.) · `_devolver` (K01: si una reclamación llega a Bocaos por error, se devuelve a la tienda con su hora. No se atiende, no se responde, no se guarda como relación.)
- **E · handler:** `onEncauzarRequest(e)` → `_atender(e, 'encauzar', 'tienda-reclamacion.encauzar.response', d => this._encauzar(d))` · **CLASE: ORDEN** — K01: encauza la reclamación a la tienda → Caso
- **F · hechos que publica:** `bocaos.reclamacion_encauzada`, `bocaos.reclamacion_devuelta`
- **VERIFICACIÓN:** Reclamación dirigida a 'Bocaos' → `reclamacion_devuelta` con la tienda y la hora; no se abre caso en la plaza.
- **NO REUTILIZA / DECISIÓN:** No hay módulo de atención al cliente final en Enki (y no debe haberlo para este vertical): un buzón de quejas sería una relación con el cliente y rompería K02.

#### `tienda-resumen` · `MICRO-AGENTE` · acción **CONSTRUIR** · unidad **TIENDA**

- **Clases:** L04
- **Propósito:** Redacta el resumen del periodo para la tienda con lo que ya está medido. No descubre nada, no compara con otras tiendas, no aconseja. Si se cae, el panel sigue.
- **Depende de:** `tienda-panel`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo` · `ai-gateway`
- **B · module.json:** `name: "tienda-resumen"` · `unidad: "tienda"` · `subscribes:` ["tienda-resumen.redactar.request"] · `publishes:` ["tienda-resumen.redactar.response", "tienda-resumen.redactar.failed", "bocaos.resumen_redactado", "bocaos.resumen_rechazado"]
- **C · index.js:** `class TiendaResumen extends ModuloHibridoReflejo` híbrido: cajones de blueprint para el lenguaje + proyección `_validador` pura. La op fuzzy NO va en `subscribes` (gate `validate-hibridos`).
- **D · proyecciones internas:** `cajon_redactar` (L04: el cajón del blueprint (texto libre). El reflejo sólo valida y publica.) · `_validador` (L04: todo número citado tiene que existir en los hechos de entrada. Un número que no está en la entrada rechaza el párrafo entero.) · `_sin_contexto` (L04: no menciona a la plaza ni al nacional. La tienda no necesita saber cuántos niveles hay encima.)
- **E · handler:** `onRedactarRequest(e)` → `_atender(e, 'redactar', 'tienda-resumen.redactar.response', d => this._redactar(d))` · **CLASE: ORDEN** — L04: hechos medidos → párrafo | RECHAZADO(número inventado)
- **F · hechos que publica:** `bocaos.resumen_redactado`, `bocaos.resumen_rechazado`
- **VERIFICACIÓN:** Párrafo que cita una cifra que no está en los hechos → `resumen_rechazado` y el panel sigue sirviendo. Sin LLM configurado → 503 y el panel intacto.
- **NO REUTILIZA / DECISIÓN:** Módulo HÍBRIDO: la op `redactar` NO va en `subscribes` del manifest (gate `validate-hibridos`); el cajón se declara como `cajon_redactar` en proyecciones. Es uno de los tres únicos agentes y vive en el borde.

---

## 10 · ESPINA `enki-plan` (JSON embebido — la consume `construir-modulos`)

```json enki-plan
{
 "proyecto": "bocaos",
 "proyecto_id": "bocaos",
 "origen": {
  "diseno": "proceso/fase3/esquemas/diseno-oop.md (FASE 3 v2 · 144 clases + R26 · N 25 / P 103 / T 16)",
  "esquema": "proceso/fase2/esquemas/esquema.md + 28 pasadas (FASE 2 · 144 hojas)",
  "marco": "F0-idea-global.md §6 · §7 · decisión C (una plaza = un despliegue, N proyectos dentro)",
  "anterior": "proceso/fase3b-v1/plan-construccion.md (44 hojas, releída; sus fusiones de tienda ya no valen)"
 },
 "inventario": "376 module.json en /home/admin/3enki/modules (maxdepth 2-3); 41 candidatos leídos a fondo. 1 REUTILIZAR (scheduler), 3 ADAPTAR (whatsapp-bot, telegram-bridge, pago-gateway), 64 CONSTRUIR.",
 "regla": "Una clase que sólo calcula es proyección interna; un objeto tiene un solo escritor; UNA hoja corre en UNA unidad. Dependencias por EVENTO (request/response), nunca require cruzado. El plaza_id se toma de la configuración del despliegue y el tienda_id del almacén del dueño: nunca del payload.",
 "unidades": {
  "nacional": {
   "despliegues": "0 ó 1 en todo Bocaos",
   "project_id": "bocaos-nacional",
   "hojas": 14,
   "clases": 26,
   "nace": "cuando la segunda plaza pasa a operando (decisión C)",
   "prefijo": "fed-",
   "no_puede": [
    "ver un pedido",
    "cobrar salvo el canon",
    "sancionar",
    "ordenar",
    "tener conversores o agentes"
   ]
  },
  "plaza": {
   "despliegues": "1 por plaza",
   "project_id": "plaza-<slug>",
   "hojas": 39,
   "clases": 103,
   "prefijo": "(sin prefijo)",
   "no_puede": [
    "tener marca de cliente",
    "tener carta",
    "hablar con otra plaza"
   ]
  },
  "tienda": {
   "despliegues": "0 (N proyectos dentro del despliegue de la plaza)",
   "project_id": "tienda-<id>",
   "hojas": 15,
   "clases": 16,
   "prefijo": "tienda-",
   "no_puede": [
    "ver a otra tienda",
    "ver al nacional",
    "tener riders",
    "fijar la ventana"
   ]
  }
 },
 "auditorias": {
  "1_nacional_sin_pedidos": {
   "cumple": "fed-buzon acepta 4 formas y rechaza la quinta; los otros 13 no escuchan el bus de una plaza",
   "test": "fed-buzon.guarda_catalogo (R23) + grep de subscribes: exactamente 4 topics de plaza/tienda, todos en fed-buzon",
   "puede_fallar": "fed-acceso: si la traza guarda el payload de lo visto en vez del NOMBRE de la cosa"
  },
  "2_nacional_no_recauda": {
   "cumple": "un solo camino de dinero: fed-canon, documento a UNA plaza sobre devengo cerrado, fuera del bus",
   "test": "fed-canon.guarda_recauda (R24) enumera caminos y módulos; ningún fed-* publica ni suscribe pago.*",
   "puede_fallar": "canon dentro del devengo de la plaza; anticipo de fed-soporte; fed-canon llamando a cobro-gestion (que es de la plaza)"
  },
  "3_ninguna_fila_cruza": {
   "cumple": "sello del escritor (plaza_id de config, tienda_id del almacén del dueño) + fed-buzon._sello (R25)",
   "test": "fed-buzon.guarda_frontera → FALLA(fila, plaza_declarada, plaza_escritora)",
   "puede_fallar": "SI: dentro de un despliegue la flecha T→P es código, no red; si el id se copia del payload, una fila de otra tienda pasa"
  },
  "4_apagar_el_nacional": {
   "cumple": "no hay flecha de la plaza hacia arriba que espere respuesta; ninguna hoja de la plaza se suscribe a un topic del nacional; el ciclo no contiene el canon",
   "test": "arrancar una plaza sin nacional y recorrer proponer→aceptar→entregar→devengar→cerrar→cobrar (§7.10 del diseño)",
   "puede_fallar": "publicacion, si alguien le pone request/response, reintento con bloqueo o un .failed que alguien espere"
  }
 },
 "orden": [
  "scheduler",
  "acta-decisiones",
  "config-mercado",
  "censo-parte",
  "estado-parte",
  "terminos-parte",
  "ruta-viva",
  "contrato-tramos",
  "frontera-plaza",
  "escaparate",
  "tienda-marca",
  "tienda-carta",
  "tienda-cliente",
  "tienda-radio",
  "tienda-carrito",
  "tienda-incentivo",
  "tarifa-pedido",
  "tienda-precio",
  "tienda-captura",
  "pedido",
  "hecho-listo",
  "tienda-hora-listo",
  "tienda-cocina-visible",
  "aviso-tienda",
  "instrucciones-acceso",
  "tienda-aviso-cliente",
  "tienda-puntualidad",
  "tienda-panel",
  "contrato-puntual",
  "foto-mercado",
  "propuesta",
  "redaccion-propuesta",
  "canal-rider",
  "escalada-enlace",
  "enlace",
  "hechos-reparto",
  "chat-enmascarado",
  "incidencia-reparto",
  "lectura-incidencia",
  "regla-fallo",
  "cargo-fallo",
  "disputa-fallo",
  "liquidacion",
  "factura-gestion",
  "cobro-gestion",
  "cuenta-parte",
  "cola-sala",
  "aviso-sala",
  "accion-sancion",
  "dictamen-revision",
  "salud-mercado",
  "tienda-reclamacion",
  "tienda-resumen",
  "publicacion",
  "fed-buzon",
  "fed-padron",
  "fed-censo",
  "fed-versiones",
  "fed-puesta-en-marcha",
  "fed-buscador",
  "fed-enrutado",
  "fed-consolidacion",
  "fed-marca",
  "fed-acceso",
  "fed-soporte",
  "fed-acta",
  "fed-canon",
  "fed-aviso"
 ],
 "hojas": [
  {
   "slug": "scheduler",
   "forma": "micro-agente",
   "accion": "REUTILIZAR",
   "unidad": "plaza",
   "clases": [],
   "reutiliza": [
    "scheduler"
   ],
   "depende_de": [],
   "subscribes": [],
   "publishes": [
    "scheduler.job.created",
    "scheduler.job.updated",
    "scheduler.job.deleted",
    "scheduler.job.enabled",
    "scheduler.job.disabled",
    "scheduler.job.triggered",
    "scheduler.job.completed",
    "scheduler.job.failed"
   ],
   "proyecciones_internas": [],
   "handlers": [],
   "hechos": []
  },
  {
   "slug": "acta-decisiones",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "O02"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [],
   "subscribes": [
    "acta-decisiones.asentar.request",
    "acta-decisiones.listar.request",
    "bocaos.dictamen_firmado",
    "project.activated"
   ],
   "publishes": [
    "acta-decisiones.asentar.response",
    "acta-decisiones.asentar.failed",
    "acta-decisiones.listar.response",
    "acta-decisiones.listar.failed",
    "bocaos.acta_asentada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_asentar",
     "descripcion": "O02: cambio + motivo + autor + ámbito + vigencia, o no hay cambio."
    },
    {
     "nombre": "_de_instante",
     "descripcion": "O02: qué estaba vigente entonces, para explicar una decisión vieja."
    },
    {
     "nombre": "_ambito",
     "descripcion": "§8: la firma lleva ámbito (tienda | plaza) y no se cruza. El dueño de la plaza no puede firmar una solicitud de una tienda."
    }
   ],
   "handlers": [
    {
     "op": "asentar",
     "clase": "ORDEN"
    },
    {
     "op": "listar",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.acta_asentada"
   ]
  },
  {
   "slug": "config-mercado",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "J01",
    "J02",
    "J03",
    "J04",
    "J05",
    "G01"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "acta-decisiones"
   ],
   "subscribes": [
    "config-mercado.declarar.request",
    "config-mercado.politica.request",
    "config-mercado.simular.request",
    "bocaos.dictamen_firmado",
    "project.activated"
   ],
   "publishes": [
    "config-mercado.declarar.response",
    "config-mercado.declarar.failed",
    "config-mercado.politica.response",
    "config-mercado.politica.failed",
    "config-mercado.simular.response",
    "config-mercado.simular.failed",
    "bocaos.politica_declarada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_declarar",
     "descripcion": "J01: ámbito (plaza|tienda) · cuatro números · autor · desde. Una tienda sólo puede fijar SUS cuatro números; no hay dónde poner un quinto criterio."
    },
    {
     "nombre": "_politica_vigente",
     "descripcion": "J04: la de la TIENDA si existe y está vigente; si no, la de la PLAZA. La precedencia es una tabla, no una negociación."
    },
    {
     "nombre": "_forma",
     "descripcion": "J01: cuatro umbrales, en m · min · min · c€, en AND. La vertical fija la forma; aquí sólo viven los valores."
    },
    {
     "nombre": "_tres_esperas",
     "descripcion": "G01: N1 tienda 8 min · N2 portal 5 min · N3 entrega 10 min (Q28)."
    },
    {
     "nombre": "_zona",
     "descripcion": "J03: cobertura de la plaza por zona. Es la mitad de la intersección con D06."
    },
    {
     "nombre": "_simular",
     "descripcion": "J05: re-ejecuta la comparación sobre hechos históricos y declara sus límites. No aplica."
    }
   ],
   "handlers": [
    {
     "op": "declarar",
     "clase": "ORDEN"
    },
    {
     "op": "politica",
     "clase": "PREGUNTA"
    },
    {
     "op": "simular",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.politica_declarada"
   ]
  },
  {
   "slug": "censo-parte",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "I01",
    "I02",
    "M02",
    "M03",
    "P04"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager",
    "credential-manager"
   ],
   "depende_de": [
    "config-mercado"
   ],
   "subscribes": [
    "censo-parte.alta.request",
    "censo-parte.checklist.request",
    "censo-parte.de.request",
    "censo-parte.zona.request",
    "bocaos.terminos_aceptados",
    "project.activated"
   ],
   "publishes": [
    "censo-parte.alta.response",
    "censo-parte.alta.failed",
    "censo-parte.checklist.response",
    "censo-parte.checklist.failed",
    "censo-parte.de.response",
    "censo-parte.de.failed",
    "censo-parte.zona.response",
    "censo-parte.zona.failed",
    "bocaos.censo_actualizado",
    "bocaos.censo_incompleto"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_alta_tienda",
     "descripcion": "I01: da de alta la tienda Y crea su proyecto en el despliegue (`project-manager`). Una tienda sin proyecto no tiene carta, ni carrito, ni clientes."
    },
    {
     "nombre": "_alta_rider",
     "descripcion": "I02: identidad fiscal, KYC, autónomo, seguro, vehículo (Q34). Incompleta → no entra en A04."
    },
    {
     "nombre": "_checklist",
     "descripcion": "P04: lo que falta, derivado del alta. Sin criterios ocultos."
    },
    {
     "nombre": "_sin_exclusividad",
     "descripcion": "M03: falla si aparece exclusividad, permanencia, turno, cuota mínima o antigüedad (Q35: 0)."
    },
    {
     "nombre": "_zona_rider",
     "descripcion": "M02: las zonas que el rider declara y cambia cuando quiere."
    },
    {
     "nombre": "_elegibles",
     "descripcion": "A04: estado, zona y capacidad. Ni un cuarto dato. Sin antigüedad."
    }
   ],
   "handlers": [
    {
     "op": "alta",
     "clase": "ORDEN"
    },
    {
     "op": "checklist",
     "clase": "PREGUNTA"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    },
    {
     "op": "zona",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.censo_actualizado",
    "bocaos.censo_incompleto"
   ]
  },
  {
   "slug": "estado-parte",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "I03",
    "I04"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "censo-parte"
   ],
   "subscribes": [
    "estado-parte.declarar.request",
    "estado-parte.de.request",
    "estado-parte.vigentes.request",
    "bocaos.contrato_creado",
    "bocaos.contrato_cerrado",
    "bocaos.parte_sancionada",
    "project.activated"
   ],
   "publishes": [
    "estado-parte.declarar.response",
    "estado-parte.declarar.failed",
    "estado-parte.de.response",
    "estado-parte.de.failed",
    "estado-parte.vigentes.response",
    "estado-parte.vigentes.failed",
    "bocaos.estado_parte_declarado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_transitar",
     "descripcion": "I04: 'ocupado' no lo pone la sala, lo pone el contrato vivo. La pausa sólo la declara el rider."
    },
    {
     "nombre": "_vigentes",
     "descripcion": "I03/I04: disponibles por zona; el que está en pausa no aparece y nadie puede levantarla."
    }
   ],
   "handlers": [
    {
     "op": "declarar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    },
    {
     "op": "vigentes",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.estado_parte_declarado"
   ]
  },
  {
   "slug": "terminos-parte",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "I08"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "censo-parte"
   ],
   "subscribes": [
    "terminos-parte.aceptar.request",
    "terminos-parte.vigentes.request",
    "project.activated"
   ],
   "publishes": [
    "terminos-parte.aceptar.response",
    "terminos-parte.aceptar.failed",
    "terminos-parte.vigentes.response",
    "terminos-parte.vigentes.failed",
    "bocaos.terminos_aceptados"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_aceptar",
     "descripcion": "I08: cambio de términos NO retroactivo; quien no acepta la nueva sigue con la vieja."
    },
    {
     "nombre": "_vigentes",
     "descripcion": "I08: puerta dura — sin términos, `enlace` no propone y `liquidacion` no devenga."
    }
   ],
   "handlers": [
    {
     "op": "aceptar",
     "clase": "ORDEN"
    },
    {
     "op": "vigentes",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.terminos_aceptados"
   ]
  },
  {
   "slug": "ruta-viva",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "B01",
    "B02",
    "B03",
    "B04",
    "B05",
    "B06"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "censo-parte",
    "estado-parte"
   ],
   "subscribes": [
    "ruta-viva.posicion.request",
    "ruta-viva.paradas.request",
    "ruta-viva.promesa.request",
    "ruta-viva.capacidad.request",
    "bocaos.contrato_creado",
    "bocaos.contrato_cerrado",
    "bocaos.hecho_reparto_anotado",
    "project.activated"
   ],
   "publishes": [
    "ruta-viva.posicion.response",
    "ruta-viva.posicion.failed",
    "ruta-viva.paradas.response",
    "ruta-viva.paradas.failed",
    "ruta-viva.promesa.response",
    "ruta-viva.promesa.failed",
    "ruta-viva.capacidad.response",
    "ruta-viva.capacidad.failed",
    "bocaos.posicion_anotada",
    "bocaos.promesa_guardada",
    "bocaos.capacidad_declarada",
    "bocaos.trayecto_cerrado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_promesa",
     "descripcion": "B03: sólo se puede MEJORAR (bajar la hora). Empeorarla exige pasar el umbral de retraso (A31)."
    },
    {
     "nombre": "_paradas",
     "descripcion": "B02: se DERIVA de los contratos vivos; si un contrato se cierra, su parada desaparece sola."
    },
    {
     "nombre": "_ordenar",
     "descripcion": "B04: optimiza UNA ruta y sólo dentro de ella, con desempate declarado. La misma ruta da el mismo orden siempre."
    },
    {
     "nombre": "_capacidad",
     "descripcion": "B05: se declara, no se estima. Es POR PLAZA, y ése es el agujero de §7.9 (Q44/Q45)."
    },
    {
     "nombre": "_fin",
     "descripcion": "B06: cierra el trayecto cuando no queda parada viva."
    }
   ],
   "handlers": [
    {
     "op": "posicion",
     "clase": "ORDEN"
    },
    {
     "op": "paradas",
     "clase": "PREGUNTA"
    },
    {
     "op": "promesa",
     "clase": "ORDEN"
    },
    {
     "op": "capacidad",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.posicion_anotada",
    "bocaos.promesa_guardada",
    "bocaos.capacidad_declarada",
    "bocaos.trayecto_cerrado"
   ]
  },
  {
   "slug": "contrato-tramos",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "E06",
    "N02"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [],
   "subscribes": [
    "contrato-tramos.declarar.request",
    "contrato-tramos.vigentes.request",
    "contrato-tramos.simular.request",
    "project.activated"
   ],
   "publishes": [
    "contrato-tramos.declarar.response",
    "contrato-tramos.declarar.failed",
    "contrato-tramos.vigentes.response",
    "contrato-tramos.vigentes.failed",
    "contrato-tramos.simular.response",
    "contrato-tramos.simular.failed",
    "bocaos.tramos_declarados"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_declarar",
     "descripcion": "E06: tramo fijo + tramo por pedido, por parte. Sin antigüedad, sin exclusividad, sin cuota mínima (Q34/Q35)."
    },
    {
     "nombre": "_vigentes",
     "descripcion": "E06: los tramos que estaban vivos cuando ocurrió el hecho, no los de hoy (R5 del determinismo)."
    },
    {
     "nombre": "_simular",
     "descripcion": "N02: qué habría pasado con otros tramos sobre hechos cerrados."
    }
   ],
   "handlers": [
    {
     "op": "declarar",
     "clase": "ORDEN"
    },
    {
     "op": "vigentes",
     "clase": "PREGUNTA"
    },
    {
     "op": "simular",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.tramos_declarados"
   ]
  },
  {
   "slug": "frontera-plaza",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "S01",
    "S02"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "config-mercado"
   ],
   "subscribes": [
    "frontera-plaza.de.request",
    "frontera-plaza.filtrar.request",
    "bocaos.radio_declarada",
    "bocaos.politica_declarada"
   ],
   "publishes": [
    "frontera-plaza.de.response",
    "frontera-plaza.de.failed",
    "frontera-plaza.filtrar.response",
    "frontera-plaza.filtrar.failed",
    "bocaos.frontera_ambigua",
    "bocaos.direccion_sin_plaza"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_de",
     "descripcion": "S01: dirección → plaza_id | NO_CONSTA | AMBIGUA(plazas). Si dos coberturas se solapan y no hay desempate declarado, NO HAY PEDIDO (Q52)."
    },
    {
     "nombre": "_filtrar",
     "descripcion": "S02: intersección de la cobertura de la plaza (J03) y lo que cada tienda declara que reparte (D06)."
    },
    {
     "nombre": "_a_la_inversa",
     "descripcion": "S02: qué tiendas llegan aquí, para el escaparate."
    }
   ],
   "handlers": [
    {
     "op": "de",
     "clase": "PREGUNTA"
    },
    {
     "op": "filtrar",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.frontera_ambigua",
    "bocaos.direccion_sin_plaza"
   ]
  },
  {
   "slug": "escaparate",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "D07",
    "D08",
    "K02"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "censo-parte",
    "frontera-plaza"
   ],
   "subscribes": [
    "escaparate.indice.request",
    "escaparate.marca_ajena.request",
    "bocaos.censo_actualizado",
    "bocaos.radio_declarada"
   ],
   "publishes": [
    "escaparate.indice.response",
    "escaparate.indice.failed",
    "escaparate.marca_ajena.response",
    "escaparate.marca_ajena.failed",
    "bocaos.escaparate_compuesto",
    "bocaos.marca_ajena_detectada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_indice",
     "descripcion": "D07: proyección del censo, ya filtrada por cobertura. No se escribe, no guarda posiciones."
    },
    {
     "nombre": "_neutro",
     "descripcion": "D08: orden declarado y neutro. Sin ranking, sin destacados, sin prioridad comprada. Filtrar no es ordenar: la guarda cubre las dos."
    },
    {
     "nombre": "_marca_ajena",
     "descripcion": "K02: ninguna comunicación al cliente final lleva la marca de Bocaos ni la de la plaza. Se consulta en el camino caliente de `tienda-aviso-cliente`."
    }
   ],
   "handlers": [
    {
     "op": "indice",
     "clase": "PREGUNTA"
    },
    {
     "op": "marca_ajena",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.escaparate_compuesto",
    "bocaos.marca_ajena_detectada"
   ]
  },
  {
   "slug": "tienda-marca",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "D01"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [],
   "subscribes": [
    "tienda-marca.declarar.request",
    "tienda-marca.de.request",
    "project.activated"
   ],
   "publishes": [
    "tienda-marca.declarar.response",
    "tienda-marca.declarar.failed",
    "tienda-marca.de.response",
    "tienda-marca.de.failed",
    "bocaos.marca_tienda_declarada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_declarar",
     "descripcion": "D01: nombre · signos · tono · titular. El titular es la tienda por construcción, no por contrato."
    },
    {
     "nombre": "_de",
     "descripcion": "D01: NO_CONSTA si no ha declarado. No se rellena con una marca por defecto: una marca por defecto es la del mercado."
    }
   ],
   "handlers": [
    {
     "op": "declarar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.marca_tienda_declarada"
   ]
  },
  {
   "slug": "tienda-carta",
   "forma": "conversor",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "D02"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "tienda-marca"
   ],
   "subscribes": [
    "tienda-carta.publicar.request",
    "tienda-carta.ver.request",
    "bocaos.marca_tienda_declarada"
   ],
   "publishes": [
    "tienda-carta.publicar.response",
    "tienda-carta.publicar.failed",
    "tienda-carta.ver.response",
    "tienda-carta.ver.failed",
    "bocaos.carta_publicada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_proyectar",
     "descripcion": "D02: catálogo interno (puerto Catálogo) → carta pública podada: qué se publica, en qué orden, con qué disponibilidad."
    },
    {
     "nombre": "_podar_sin_destacar",
     "descripcion": "D02: podar no es destacar. Ningún campo de 'destacado' ni de posición comprada (D08 lo vigila)."
    },
    {
     "nombre": "_firma",
     "descripcion": "D02: la carta sale firmada por la marca de la tienda; sin marca declarada no se publica."
    }
   ],
   "handlers": [
    {
     "op": "publicar",
     "clase": "ORDEN"
    },
    {
     "op": "ver",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.carta_publicada"
   ]
  },
  {
   "slug": "tienda-cliente",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "D05",
    "L02"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "tienda-marca"
   ],
   "subscribes": [
    "tienda-cliente.alta.request",
    "tienda-cliente.de.request",
    "tienda-cliente.guarda_propiedad.request",
    "project.activated"
   ],
   "publishes": [
    "tienda-cliente.alta.response",
    "tienda-cliente.alta.failed",
    "tienda-cliente.de.response",
    "tienda-cliente.de.failed",
    "tienda-cliente.guarda_propiedad.response",
    "tienda-cliente.guarda_propiedad.failed",
    "bocaos.cliente_registrado",
    "bocaos.propiedad_cliente_violada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_alta",
     "descripcion": "D05: identidad · tienda · instrucciones de acceso. Índice por (tienda, cliente)."
    },
    {
     "nombre": "_de",
     "descripcion": "D05: NO_CONSTA si no es cliente de esta tienda. No hay búsqueda por identidad global."
    },
    {
     "nombre": "_guarda_propiedad",
     "descripcion": "L02: falla si un cliente aparece en otra tienda — por identidad, por dirección, en un agregado o como 'quizá te interese'."
    }
   ],
   "handlers": [
    {
     "op": "alta",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    },
    {
     "op": "guarda_propiedad",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.cliente_registrado",
    "bocaos.propiedad_cliente_violada"
   ]
  },
  {
   "slug": "tienda-radio",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "D06"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [],
   "subscribes": [
    "tienda-radio.declarar.request",
    "tienda-radio.cubre.request",
    "project.activated"
   ],
   "publishes": [
    "tienda-radio.declarar.response",
    "tienda-radio.declarar.failed",
    "tienda-radio.cubre.response",
    "tienda-radio.cubre.failed",
    "bocaos.radio_declarada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_declarar",
     "descripcion": "D06: valor del dueño, con hora. Sin radio declarada no se publica carta: no se puede pedir a donde no llega."
    },
    {
     "nombre": "_cubre",
     "descripcion": "D06: sí | no | NO_CONSTA. Es la mitad de la intersección que hace S01/S02 en la plaza."
    }
   ],
   "handlers": [
    {
     "op": "declarar",
     "clase": "ORDEN"
    },
    {
     "op": "cubre",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.radio_declarada"
   ]
  },
  {
   "slug": "tienda-carrito",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "D04"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "tienda-carta"
   ],
   "subscribes": [
    "tienda-carrito.anadir.request",
    "tienda-carrito.quitar.request",
    "tienda-carrito.cerrar.request",
    "tienda-carrito.ver.request",
    "project.activated"
   ],
   "publishes": [
    "tienda-carrito.anadir.response",
    "tienda-carrito.anadir.failed",
    "tienda-carrito.quitar.response",
    "tienda-carrito.quitar.failed",
    "tienda-carrito.cerrar.response",
    "tienda-carrito.cerrar.failed",
    "tienda-carrito.ver.response",
    "tienda-carrito.ver.failed",
    "bocaos.carrito_cerrado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_anadir",
     "descripcion": "D04: clave (tienda, cliente). El índice no tiene operación que devuelva los de al lado."
    },
    {
     "nombre": "_cerrar",
     "descripcion": "D04: al cerrar se convierte en pedido (C01) y desaparece. Un carrito cerrado que sigue vivo es un pedido que se puede cobrar dos veces."
    }
   ],
   "handlers": [
    {
     "op": "anadir",
     "clase": "ORDEN"
    },
    {
     "op": "quitar",
     "clase": "ORDEN"
    },
    {
     "op": "cerrar",
     "clase": "ORDEN"
    },
    {
     "op": "ver",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.carrito_cerrado"
   ]
  },
  {
   "slug": "tienda-incentivo",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "E02"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [],
   "subscribes": [
    "tienda-incentivo.subir.request",
    "tienda-incentivo.de.request",
    "project.activated"
   ],
   "publishes": [
    "tienda-incentivo.subir.response",
    "tienda-incentivo.subir.failed",
    "tienda-incentivo.de.response",
    "tienda-incentivo.de.failed",
    "bocaos.incentivo_subido"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_subir",
     "descripcion": "E02: pedido · céntimos · autor · hora · tope. Puede comprar su propia impuntualidad: es lo que hace que el mercado corrija sin que nadie la sancione."
    },
    {
     "nombre": "_no_baja",
     "descripcion": "E02: no baja por debajo de lo ya ofrecido a un rider con propuesta viva — eso lo verifica la plaza (tiene las propuestas) y la tienda obedece."
    },
    {
     "nombre": "_solo_ella",
     "descripcion": "E02: si lo pagara la plaza o el nacional, estarían subvencionando demanda (Q17)."
    }
   ],
   "handlers": [
    {
     "op": "subir",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.incentivo_subido"
   ]
  },
  {
   "slug": "tarifa-pedido",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "E01",
    "E03",
    "E07"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "contrato-tramos"
   ],
   "subscribes": [
    "tarifa-pedido.estipular.request",
    "tarifa-pedido.precio.request",
    "tarifa-pedido.subir.request",
    "bocaos.incentivo_subido",
    "project.activated"
   ],
   "publishes": [
    "tarifa-pedido.estipular.response",
    "tarifa-pedido.estipular.failed",
    "tarifa-pedido.precio.response",
    "tarifa-pedido.precio.failed",
    "tarifa-pedido.subir.response",
    "tarifa-pedido.subir.failed",
    "bocaos.oferta_estipulada",
    "bocaos.precio_compuesto",
    "bocaos.oferta_subida"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_estipular",
     "descripcion": "E01: lo que el cliente pone por el reparto, congelado con el pedido. Ni la tienda ni la sala ni Bocaos lo tocan."
    },
    {
     "nombre": "_componer",
     "descripcion": "E03: oferta + incentivo (E02, de la tienda) + tramos vigentes → céntimos y desglose. Lo lee A11 ya compuesto; no se recalcula dentro del enlace."
    },
    {
     "nombre": "_subir",
     "descripcion": "E07: subida con tope autorizado por el cliente (Q43). Quién paga el escalón es Q17: se anota el acto y la deuda queda visible, no cobrada."
    },
    {
     "nombre": "_no_baja",
     "descripcion": "E07: nunca por debajo de lo ya ofrecido a un rider con propuesta viva."
    }
   ],
   "handlers": [
    {
     "op": "estipular",
     "clase": "ORDEN"
    },
    {
     "op": "precio",
     "clase": "PREGUNTA"
    },
    {
     "op": "subir",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.oferta_estipulada",
    "bocaos.precio_compuesto",
    "bocaos.oferta_subida"
   ]
  },
  {
   "slug": "tienda-precio",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "D03"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "tienda-carrito",
    "tarifa-pedido",
    "tienda-incentivo"
   ],
   "subscribes": [
    "tienda-precio.cerrar.request"
   ],
   "publishes": [
    "tienda-precio.cerrar.response",
    "tienda-precio.cerrar.failed",
    "bocaos.precio_cerrado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_cerrar",
     "descripcion": "D03: carrito + oferta del cliente (E01) + incentivo de la tienda (E02) → céntimos y desglose."
    },
    {
     "nombre": "_desglose",
     "descripcion": "D03: el desglose existe siempre; si el cliente lo VE es Q19/Q39. El diseño lo deja calculado, no decidido."
    },
    {
     "nombre": "_no_sorprende",
     "descripcion": "D03: si falta la oferta o el incentivo, NO_CONSTA y no hay precio: no se estima una parte del precio."
    }
   ],
   "handlers": [
    {
     "op": "cerrar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.precio_cerrado"
   ]
  },
  {
   "slug": "tienda-captura",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "C01"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "tienda-carrito",
    "tienda-precio",
    "tienda-cliente"
   ],
   "subscribes": [
    "tienda-captura.alta.request"
   ],
   "publishes": [
    "tienda-captura.alta.response",
    "tienda-captura.alta.failed",
    "bocaos.pedido_compuesto"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_alta",
     "descripcion": "C01: cliente de la tienda · líneas · oferta. Sin alta en bloque, sin pedido programado, sin plantilla recurrente."
    },
    {
     "nombre": "_composicion",
     "descripcion": "C01: pide `tienda-precio.cerrar` y `pedido.crear`; si el precio no está cerrado, no hay pedido y se nombra el hueco."
    }
   ],
   "handlers": [
    {
     "op": "alta",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.pedido_compuesto"
   ]
  },
  {
   "slug": "pedido",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "C02",
    "C07"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "censo-parte"
   ],
   "subscribes": [
    "pedido.crear.request",
    "pedido.aceptar.request",
    "pedido.rechazar.request",
    "pedido.cancelar.request",
    "pedido.de.request",
    "bocaos.precio_cerrado",
    "bocaos.listo_declarado",
    "bocaos.contrato_creado",
    "bocaos.prueba_anotada",
    "project.activated"
   ],
   "publishes": [
    "pedido.crear.response",
    "pedido.crear.failed",
    "pedido.aceptar.response",
    "pedido.aceptar.failed",
    "pedido.rechazar.response",
    "pedido.rechazar.failed",
    "pedido.cancelar.response",
    "pedido.cancelar.failed",
    "pedido.de.response",
    "pedido.de.failed",
    "bocaos.pedido_creado",
    "bocaos.pedido_aceptado",
    "bocaos.pedido_rechazado",
    "bocaos.pedido_cancelado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_crear",
     "descripcion": "C02: el pedido nace con precio congelado y plaza_id; sin precio no nace."
    },
    {
     "nombre": "_transitar",
     "descripcion": "C02: RECIBIDO → ACEPTADO (la tienda acepta, Q27) → LISTO (C04) → EN_REPARTO (contrato) → ENTREGADO (prueba o su falta declarada)."
    },
    {
     "nombre": "_cancelacion",
     "descripcion": "C07: tabla de quién y hasta cuándo. Quién paga el rechazo es Q36: mientras no haya respuesta se anota y NO SE COBRA a nadie."
    }
   ],
   "handlers": [
    {
     "op": "crear",
     "clase": "ORDEN"
    },
    {
     "op": "aceptar",
     "clase": "ORDEN"
    },
    {
     "op": "rechazar",
     "clase": "ORDEN"
    },
    {
     "op": "cancelar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.pedido_creado",
    "bocaos.pedido_aceptado",
    "bocaos.pedido_rechazado",
    "bocaos.pedido_cancelado"
   ]
  },
  {
   "slug": "hecho-listo",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "A01"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "pedido",
    "tarifa-pedido"
   ],
   "subscribes": [
    "hecho-listo.anotar.request",
    "hecho-listo.desmentir.request",
    "hecho-listo.de.request",
    "bocaos.listo_declarado",
    "project.activated"
   ],
   "publishes": [
    "hecho-listo.anotar.response",
    "hecho-listo.anotar.failed",
    "hecho-listo.desmentir.response",
    "hecho-listo.desmentir.failed",
    "hecho-listo.de.response",
    "hecho-listo.de.failed",
    "bocaos.pedido_listo",
    "bocaos.hecho_desmentido"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_anotar",
     "descripcion": "A01: exige precio_congelado; sin él no hay hecho y el pedido espera nombrando el hueco (A34)."
    },
    {
     "nombre": "_sello",
     "descripcion": "A01: el plaza_id lo pone la plaza al anotar. La tienda no puede declarar un pedido de otra plaza."
    },
    {
     "nombre": "_desmentir",
     "descripcion": "A01: hecho nuevo que desmiente al anterior; las dos horas quedan y el pedido se vuelve a medir."
    }
   ],
   "handlers": [
    {
     "op": "anotar",
     "clase": "ORDEN"
    },
    {
     "op": "desmentir",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.pedido_listo",
    "bocaos.hecho_desmentido"
   ]
  },
  {
   "slug": "tienda-hora-listo",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "C04"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "tienda-captura"
   ],
   "subscribes": [
    "tienda-hora-listo.declarar.request",
    "tienda-hora-listo.de.request",
    "bocaos.pedido_aceptado",
    "project.activated"
   ],
   "publishes": [
    "tienda-hora-listo.declarar.response",
    "tienda-hora-listo.declarar.failed",
    "tienda-hora-listo.de.response",
    "tienda-hora-listo.de.failed",
    "bocaos.listo_declarado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_declarar",
     "descripcion": "C04: pedido · hora · autor. Una sola vez; si se equivocó, la plaza anota un hecho que desmiente (A01) — aquí no se reescribe."
    },
    {
     "nombre": "_solo_la_tienda",
     "descripcion": "C04: el autor tiene que ser la tienda dueña del pedido; la sala y la plaza no pueden declarar por ella."
    }
   ],
   "handlers": [
    {
     "op": "declarar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.listo_declarado"
   ]
  },
  {
   "slug": "tienda-cocina-visible",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "C05"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "pedido"
   ],
   "subscribes": [
    "tienda-cocina-visible.ver.request",
    "bocaos.pedido_creado",
    "bocaos.pedido_listo",
    "bocaos.contrato_creado",
    "bocaos.prueba_anotada"
   ],
   "publishes": [
    "tienda-cocina-visible.ver.response",
    "tienda-cocina-visible.ver.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_podar",
     "descripcion": "C05: estado interno → 4 estados. La poda es una tabla, no un criterio."
    },
    {
     "nombre": "_aislar",
     "descripcion": "C05: aunque dos pedidos viajen en el mismo trayecto, no se ve el nombre del otro local ni el otro pedido."
    }
   ],
   "handlers": [
    {
     "op": "ver",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": []
  },
  {
   "slug": "aviso-tienda",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "C03"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "pizzepos/notificador-pedidos"
   ],
   "depende_de": [
    "pedido"
   ],
   "subscribes": [
    "aviso-tienda.avisar.request",
    "bocaos.pedido_creado",
    "bocaos.pedido_cancelado"
   ],
   "publishes": [
    "aviso-tienda.avisar.response",
    "aviso-tienda.avisar.failed",
    "bocaos.aviso_tienda_entregado",
    "bocaos.aviso_tienda_fallido"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_avisar",
     "descripcion": "C03: al canal de la tienda (su POS, su impresora, su pantalla). Si el aviso no llega, el pedido existe igual."
    },
    {
     "nombre": "_sin_orden",
     "descripcion": "C03: no acepta, no arranca la cocina, no compromete hora. Si pudiera, la plaza estaría operando el restaurante."
    }
   ],
   "handlers": [
    {
     "op": "avisar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.aviso_tienda_entregado",
    "bocaos.aviso_tienda_fallido"
   ]
  },
  {
   "slug": "instrucciones-acceso",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "F05"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "pedido"
   ],
   "subscribes": [
    "instrucciones-acceso.escribir.request",
    "instrucciones-acceso.mostrar.request",
    "bocaos.contrato_creado",
    "bocaos.contrato_cerrado",
    "project.activated"
   ],
   "publishes": [
    "instrucciones-acceso.escribir.response",
    "instrucciones-acceso.escribir.failed",
    "instrucciones-acceso.mostrar.response",
    "instrucciones-acceso.mostrar.failed",
    "bocaos.acceso_escrito"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_escribir",
     "descripcion": "F05: texto del cliente para un pedido. Dato personal del cliente DEL cliente: no entra en ningún agregado."
    },
    {
     "nombre": "_mostrar",
     "descripcion": "F05: sólo al rider del contrato vivo, sólo mientras el contrato está vivo. Sin contrato → NO_HAY."
    }
   ],
   "handlers": [
    {
     "op": "escribir",
     "clase": "ORDEN"
    },
    {
     "op": "mostrar",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.acceso_escrito"
   ]
  },
  {
   "slug": "tienda-aviso-cliente",
   "forma": "puente",
   "accion": "ADAPTAR",
   "unidad": "tienda",
   "clases": [
    "C06"
   ],
   "reutiliza": [
    "whatsapp-bot",
    "credential-manager"
   ],
   "depende_de": [
    "tienda-cocina-visible",
    "escaparate"
   ],
   "subscribes": [
    "tienda-aviso-cliente.avisar.request",
    "bocaos.pedido_listo",
    "bocaos.pedido_cancelado",
    "bocaos.contrato_creado"
   ],
   "publishes": [
    "tienda-aviso-cliente.avisar.response",
    "tienda-aviso-cliente.avisar.failed",
    "bocaos.aviso_cliente_entregado",
    "bocaos.aviso_cliente_fallido",
    "bocaos.aviso_cliente_bloqueado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_plantilla",
     "descripcion": "C06: plantilla por tienda (no por plaza, no por nacional), con el nombre y el tono de la tienda."
    },
    {
     "nombre": "_marca_ajena",
     "descripcion": "C06: pide `escaparate.marca_ajena` antes de enviar; si FALLA, no se envía y se publica `aviso_cliente_bloqueado`."
    },
    {
     "nombre": "_canal",
     "descripcion": "C06: la credencial es de la tienda; el número de origen es el suyo. El transporte es intercambiable; el contrato no."
    }
   ],
   "handlers": [
    {
     "op": "avisar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.aviso_cliente_entregado",
    "bocaos.aviso_cliente_fallido",
    "bocaos.aviso_cliente_bloqueado"
   ]
  },
  {
   "slug": "tienda-puntualidad",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "L03"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "tienda-hora-listo"
   ],
   "subscribes": [
    "tienda-puntualidad.medir.request",
    "bocaos.hecho_reparto_anotado",
    "bocaos.listo_declarado"
   ],
   "publishes": [
    "tienda-puntualidad.medir.response",
    "tienda-puntualidad.medir.failed",
    "bocaos.puntualidad_publicada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_medir",
     "descripcion": "L03: distribución de hora-de-listo frente a lo prometido, por franja, con n. Sin datos suficientes → NO_CONSTA."
    },
    {
     "nombre": "_no_nota",
     "descripcion": "L03: ni estrellas ni 3 sobre 5. Una nota es un juicio; una distribución es información."
    }
   ],
   "handlers": [
    {
     "op": "medir",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.puntualidad_publicada"
   ]
  },
  {
   "slug": "tienda-panel",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "L01"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "tienda-puntualidad"
   ],
   "subscribes": [
    "tienda-panel.ver.request",
    "bocaos.puntualidad_publicada",
    "bocaos.propuesta_emitida",
    "bocaos.hecho_reparto_anotado"
   ],
   "publishes": [
    "tienda-panel.ver.response",
    "tienda-panel.ver.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_ver",
     "descripcion": "L01: lee de `puntualidad-tienda` (L03), de la plaza (propuestas, pedidos sin rider) y de `config-mercado` (qué capa de umbrales rige)."
    },
    {
     "nombre": "_sin_version_amable",
     "descripcion": "L01: un solo número. Si hubiera una versión para el que paga y otra para el que sufre, el mercado dejaría de corregir."
    }
   ],
   "handlers": [
    {
     "op": "ver",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": []
  },
  {
   "slug": "contrato-puntual",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "A24"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "pedido",
    "ruta-viva",
    "estado-parte"
   ],
   "subscribes": [
    "contrato-puntual.crear.request",
    "contrato-puntual.de.request",
    "contrato-puntual.cerrar.request",
    "bocaos.propuesta_aceptada",
    "bocaos.hecho_reparto_anotado",
    "project.activated"
   ],
   "publishes": [
    "contrato-puntual.crear.response",
    "contrato-puntual.crear.failed",
    "contrato-puntual.de.response",
    "contrato-puntual.de.failed",
    "contrato-puntual.cerrar.response",
    "contrato-puntual.cerrar.failed",
    "bocaos.contrato_creado",
    "bocaos.contrato_cerrado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_crear",
     "descripcion": "A24: sólo desde una aceptación con acuse. Sin aceptación no hay constructor: la asignación no existe."
    },
    {
     "nombre": "_cerrar",
     "descripcion": "A24: con el hecho de entrega. La parada desaparece de B02 y deja de proyectarse."
    },
    {
     "nombre": "_sin_duracion",
     "descripcion": "A24: no tiene turno ni jornada. Si tuviera duración, el negocio sería otro (inspección de trabajo)."
    }
   ],
   "handlers": [
    {
     "op": "crear",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    },
    {
     "op": "cerrar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.contrato_creado",
    "bocaos.contrato_cerrado"
   ]
  },
  {
   "slug": "foto-mercado",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "A02",
    "A03",
    "A04"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "estado-parte",
    "ruta-viva",
    "config-mercado",
    "tienda-puntualidad"
   ],
   "subscribes": [
    "foto-mercado.componer.request",
    "foto-mercado.elegibles.request",
    "foto-mercado.reproducir.request"
   ],
   "publishes": [
    "foto-mercado.componer.response",
    "foto-mercado.componer.failed",
    "foto-mercado.elegibles.response",
    "foto-mercado.elegibles.failed",
    "bocaos.foto_congelada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_componer",
     "descripcion": "A02: riders ← I04 · posición ← B01 · paradas ← B02 · promesas ← B03 · capacidad ← B05 · local ← L03 · política ← J04 (DOS CAPAS)."
    },
    {
     "nombre": "_congelar",
     "descripcion": "A03: la foto se congela con huella. Dentro de F nadie lee el mundo: si leyera, la explicación dejaría de ser cierta."
    },
    {
     "nombre": "_elegibles",
     "descripcion": "A04: estado, zona y capacidad. El que tiene un dato ausente ENTRA con su lista de faltantes: descartar es decidir."
    }
   ],
   "handlers": [
    {
     "op": "componer",
     "clase": "PREGUNTA"
    },
    {
     "op": "elegibles",
     "clase": "PREGUNTA"
    },
    {
     "op": "reproducir",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.foto_congelada"
   ]
  },
  {
   "slug": "propuesta",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "A13",
    "A14",
    "A15",
    "A19",
    "A27",
    "A29",
    "A33",
    "M05"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "foto-mercado",
    "tarifa-pedido",
    "contrato-puntual",
    "config-mercado"
   ],
   "subscribes": [
    "propuesta.emitir.request",
    "propuesta.acuse.request",
    "propuesta.aceptar.request",
    "propuesta.rechazar.request",
    "propuesta.cerrar.request",
    "propuesta.de.request",
    "bocaos.propuesta_entregada",
    "bocaos.propuesta_no_entregada",
    "project.activated"
   ],
   "publishes": [
    "propuesta.emitir.response",
    "propuesta.emitir.failed",
    "propuesta.acuse.response",
    "propuesta.acuse.failed",
    "propuesta.aceptar.response",
    "propuesta.aceptar.failed",
    "propuesta.rechazar.response",
    "propuesta.rechazar.failed",
    "propuesta.cerrar.response",
    "propuesta.cerrar.failed",
    "propuesta.de.response",
    "propuesta.de.failed",
    "bocaos.propuesta_emitida",
    "bocaos.propuesta_acusada",
    "bocaos.propuesta_aceptada",
    "bocaos.propuesta_rechazada",
    "bocaos.propuesta_caducada_sin_acuse",
    "bocaos.propuesta_caducada_sin_respuesta"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_emitir",
     "descripcion": "A13: una viva por pedido (A33). Lleva dentro la foto con su huella, la política con su CAPA y su autor, y los cuatro números."
    },
    {
     "nombre": "_bloqueo",
     "descripcion": "A14: el bloqueo por pedido es lo que hace que gane el primero, no el preferido. Un desenlace por propuesta; el segundo recibe YA_NO_ESTA y no paga nada."
    },
    {
     "nombre": "_ventana",
     "descripcion": "A15: validez 20 s · acuse ≤5 s · decisión 10 s (Q42). Dos relojes, dos caducidades distintas."
    },
    {
     "nombre": "_aceptar",
     "descripcion": "A19: un solo sí, atómico, con hora. Nunca una asignación: la aceptación la produce el rider."
    },
    {
     "nombre": "_vista",
     "descripcion": "M05: los cuatro números SIEMPRE en el mismo orden + la frase + de qué plaza + qué umbrales (capa y autor) le juzgaron."
    },
    {
     "nombre": "_reproducir",
     "descripcion": "A29: misma foto + misma política → misma propuesta. Devuelve el mismo resultado o falla."
    },
    {
     "nombre": "_sin_asignacion",
     "descripcion": "A27: no hay camino de pedido a rider sin aceptación libre. Falla si alguien lo abre."
    }
   ],
   "handlers": [
    {
     "op": "emitir",
     "clase": "ORDEN"
    },
    {
     "op": "acuse",
     "clase": "ORDEN"
    },
    {
     "op": "aceptar",
     "clase": "ORDEN"
    },
    {
     "op": "rechazar",
     "clase": "ORDEN"
    },
    {
     "op": "cerrar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.propuesta_emitida",
    "bocaos.propuesta_acusada",
    "bocaos.propuesta_aceptada",
    "bocaos.propuesta_rechazada",
    "bocaos.propuesta_caducada_sin_acuse",
    "bocaos.propuesta_caducada_sin_respuesta"
   ]
  },
  {
   "slug": "redaccion-propuesta",
   "forma": "micro-agente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "A18"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "ai-gateway"
   ],
   "depende_de": [
    "propuesta"
   ],
   "subscribes": [
    "redaccion-propuesta.adornar.request"
   ],
   "publishes": [
    "redaccion-propuesta.adornar.response",
    "redaccion-propuesta.adornar.failed",
    "bocaos.propuesta_redactada",
    "bocaos.redaccion_rechazada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "cajon_adornar",
     "descripcion": "A18: el cajón del blueprint (lenguaje). El reflejo sólo valida y publica."
    },
    {
     "nombre": "_validador",
     "descripcion": "A18: todo número que aparezca tiene que estar en la entrada; toda razón tiene que estar en A16. Lo que no está, rechaza."
    },
    {
     "nombre": "_adorno",
     "descripcion": "A18: sin él, `enlace` usa la frase derivada (A17) y nadie nota la diferencia en el negocio."
    }
   ],
   "handlers": [
    {
     "op": "adornar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.propuesta_redactada",
    "bocaos.redaccion_rechazada"
   ]
  },
  {
   "slug": "canal-rider",
   "forma": "puente",
   "accion": "ADAPTAR",
   "unidad": "plaza",
   "clases": [
    "M04"
   ],
   "reutiliza": [
    "telegram-bridge",
    "credential-manager"
   ],
   "depende_de": [
    "propuesta"
   ],
   "subscribes": [
    "canal-rider.entregar.request",
    "telegram.callback.received",
    "bocaos.propuesta_emitida",
    "bocaos.propuesta_cerrada"
   ],
   "publishes": [
    "canal-rider.entregar.response",
    "canal-rider.entregar.failed",
    "bocaos.propuesta_entregada",
    "bocaos.propuesta_no_entregada",
    "bocaos.acuse_recibido"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_entregar",
     "descripcion": "M04: mensaje con los cuatro números, la frase, de qué plaza y qué umbrales. Retirada a los 5 s si no hay acuse."
    },
    {
     "nombre": "_acuse",
     "descripcion": "M04: el callback es el acuse, el sí o el no. Sin acuse, CADUCADA_SIN_ACUSE: el canal falló, no el rider."
    },
    {
     "nombre": "_sin_asignar",
     "descripcion": "M04: entrega una propuesta a UN rider. Nunca dos a la vez por el mismo pedido."
    }
   ],
   "handlers": [
    {
     "op": "entregar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.propuesta_entregada",
    "bocaos.propuesta_no_entregada",
    "bocaos.acuse_recibido"
   ]
  },
  {
   "slug": "escalada-enlace",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "A26"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "tarifa-pedido",
    "canal-rider"
   ],
   "subscribes": [
    "escalada-enlace.escalar.request",
    "bocaos.propuesta_rechazada",
    "bocaos.propuesta_caducada_sin_respuesta",
    "bocaos.enlace_agotado"
   ],
   "publishes": [
    "escalada-enlace.escalar.response",
    "escalada-enlace.escalar.failed",
    "bocaos.escalada_peldano",
    "bocaos.escalada_agotada",
    "bocaos.escalada_reintentar"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_peldano",
     "descripcion": "A26/Q43: peldaño 2 a los 30 s; hasta el tope autorizado; 5 min de cancelación."
    },
    {
     "nombre": "_tope",
     "descripcion": "A26: el tope lo autorizó el cliente al pedir. Sin tope → no se sube, se agota."
    },
    {
     "nombre": "_agotar",
     "descripcion": "A26: agotada la escalada, el caso va a la sala. El pedido no muere: queda con nombre."
    }
   ],
   "handlers": [
    {
     "op": "escalar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.escalada_peldano",
    "bocaos.escalada_agotada",
    "bocaos.escalada_reintentar"
   ]
  },
  {
   "slug": "enlace",
   "forma": "micro-agente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "A05",
    "A06",
    "A07",
    "A08",
    "A09",
    "A10",
    "A11",
    "A12",
    "A16",
    "A17",
    "A20",
    "A21",
    "A22",
    "A23",
    "A25",
    "A28",
    "A30",
    "A31",
    "A34",
    "A35"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "foto-mercado",
    "propuesta",
    "redaccion-propuesta",
    "canal-rider",
    "escalada-enlace",
    "hecho-listo",
    "ruta-viva",
    "config-mercado"
   ],
   "subscribes": [
    "enlace.ejecutar.request",
    "bocaos.pedido_listo",
    "bocaos.hecho_desmentido",
    "bocaos.propuesta_rechazada",
    "bocaos.propuesta_caducada_sin_respuesta",
    "bocaos.escalada_reintentar"
   ],
   "publishes": [
    "enlace.ejecutar.response",
    "enlace.ejecutar.failed",
    "bocaos.enlace_completado",
    "bocaos.enlace_agotado",
    "bocaos.hueco_nombrado",
    "bocaos.medidas_calculadas"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_ruta_base",
     "descripcion": "A05: ruta del rider a la tienda, con el puerto Ruta."
    },
    {
     "nombre": "_con_parada",
     "descripcion": "A06: inserta una parada de OTRA tienda si y sólo si plaza_id(parada)==plaza_id(pedido)==plaza_id(rider) → A35."
    },
    {
     "nombre": "_desvio",
     "descripcion": "A07: metros de más por pasar por el local."
    },
    {
     "nombre": "_espera",
     "descripcion": "A08: minutos que esperaría si llega antes de que esté listo; si llega después, 0 y la espera es un hecho del reparto."
    },
    {
     "nombre": "_retraso",
     "descripcion": "A09: minutos que añade a las paradas que ya lleva. _agregado (A10): suma por parada, con tope."
    },
    {
     "nombre": "_cobra",
     "descripcion": "A11: lee el precio YA compuesto (E03) y el coste declarado del rider. Sin coste → neto NO_CONSTA y el candidato va a A34."
    },
    {
     "nombre": "_pasa",
     "descripcion": "A12: desvío < umbral ∧ espera < umbral ∧ retraso < umbral ∧ cobra > 0. Una tabla AND sobre la política de la tienda o de la plaza."
    },
    {
     "nombre": "_razones",
     "descripcion": "A16: conjunto CERRADO de razones, con la capa y el autor del umbral que juzgó."
    },
    {
     "nombre": "_frase",
     "descripcion": "A17: la frase derivada del conjunto cerrado. Funciona cuando el agente (A18) se cae: el adorno no es el mínimo legal."
    },
    {
     "nombre": "_hora_aceptacion",
     "descripcion": "A20: la hora del sí, con su hueco entre emisión y decisión."
    },
    {
     "nombre": "_rechazo",
     "descripcion": "A21: rechazar no cuesta nada — ni ahora ni en la siguiente propuesta. _sin_puntuacion (A22) falla si aparece una nota."
    },
    {
     "nombre": "_caducidad",
     "descripcion": "A23: sin respuesta en la ventana: el candidato se salta y se sigue."
    },
    {
     "nombre": "_siguiente",
     "descripcion": "A25: avanza al siguiente candidato en el orden declarado (no por conveniencia)."
    },
    {
     "nombre": "_sin_optimizador",
     "descripcion": "A28: la entrada es un hecho y una foto, no una lista de pedidos. Falla si alguien mete un barrido."
    },
    {
     "nombre": "_sin_captura",
     "descripcion": "A32: la cuota no depende de km ahorrados ni de pedidos enlazados. _por_trayecto (A30): se enlazan rutas, no clientes. _no_rompe_promesa (A31): ninguna promesa ya dada empeora más allá del umbral."
    },
    {
     "nombre": "_hueco",
     "descripcion": "A34: si falta un dato, se NOMBRA («sin posición fresca», «sin precio compuesto», «sin histórico del local», «sin coste del rider») y el candidato se salta."
    },
    {
     "nombre": "_intra_plaza",
     "descripcion": "A35: plaza_id(pedido)==plaza_id(rider)==plaza_id(propuesta) en toda propuesta emitida y toda parada insertada."
    }
   ],
   "handlers": [
    {
     "op": "ejecutar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.enlace_completado",
    "bocaos.enlace_agotado",
    "bocaos.hueco_nombrado",
    "bocaos.medidas_calculadas"
   ]
  },
  {
   "slug": "hechos-reparto",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "F01",
    "F02",
    "F03"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "contrato-puntual"
   ],
   "subscribes": [
    "hechos-reparto.anotar.request",
    "hechos-reparto.prueba.request",
    "hechos-reparto.acta.request",
    "bocaos.contrato_creado",
    "bocaos.pedido_listo",
    "project.activated"
   ],
   "publishes": [
    "hechos-reparto.anotar.response",
    "hechos-reparto.anotar.failed",
    "hechos-reparto.prueba.response",
    "hechos-reparto.prueba.failed",
    "hechos-reparto.acta.response",
    "hechos-reparto.acta.failed",
    "bocaos.hecho_reparto_anotado",
    "bocaos.prueba_anotada",
    "bocaos.acta_incompleta"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_anotar",
     "descripcion": "F01: hecho con hora y autor. Sin hora no es un hecho, es una impresión."
    },
    {
     "nombre": "_prueba",
     "descripcion": "F02: foto, firma o código; si no hay prueba, se anota la FALTA — que es un hecho distinto de no tener nada."
    },
    {
     "nombre": "_acta",
     "descripcion": "F01: compone el acta de un reparto; si falta un hecho, devuelve INCOMPLETA con el nombre del que falta (Q30: la prueba es el evento)."
    }
   ],
   "handlers": [
    {
     "op": "anotar",
     "clase": "ORDEN"
    },
    {
     "op": "prueba",
     "clase": "ORDEN"
    },
    {
     "op": "acta",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.hecho_reparto_anotado",
    "bocaos.prueba_anotada",
    "bocaos.acta_incompleta"
   ]
  },
  {
   "slug": "chat-enmascarado",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "F04"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "contrato-puntual"
   ],
   "subscribes": [
    "chat-enmascarado.enviar.request",
    "bocaos.contrato_creado",
    "bocaos.contrato_cerrado"
   ],
   "publishes": [
    "chat-enmascarado.enviar.response",
    "chat-enmascarado.enviar.failed",
    "bocaos.mensaje_entregado",
    "bocaos.mensaje_fallido"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_enmascarar",
     "descripcion": "F04: alias por contrato, no por persona. Al cerrar el contrato, el alias muere."
    },
    {
     "nombre": "_sin_agregados",
     "descripcion": "F04: cero metadatos sobre la conversación (art. 15 de la Directiva). No hay histórico legible por nadie."
    }
   ],
   "handlers": [
    {
     "op": "enviar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.mensaje_entregado",
    "bocaos.mensaje_fallido"
   ]
  },
  {
   "slug": "incidencia-reparto",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "F06"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "contrato-puntual"
   ],
   "subscribes": [
    "incidencia-reparto.abrir.request",
    "bocaos.hecho_reparto_anotado"
   ],
   "publishes": [
    "incidencia-reparto.abrir.response",
    "incidencia-reparto.abrir.failed",
    "bocaos.incidencia_abierta"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_abrir",
     "descripcion": "F06: relato libre + autor + hora + pedido. Sin campos obligatorios que fuercen una versión de los hechos."
    },
    {
     "nombre": "_sin_clasificar",
     "descripcion": "F06: no decide si es grave. Clasificar es leer (F07)."
    }
   ],
   "handlers": [
    {
     "op": "abrir",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.incidencia_abierta"
   ]
  },
  {
   "slug": "lectura-incidencia",
   "forma": "micro-agente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "F07"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "ai-gateway"
   ],
   "depende_de": [
    "incidencia-reparto"
   ],
   "subscribes": [
    "lectura-incidencia.clasificar.request",
    "bocaos.incidencia_abierta"
   ],
   "publishes": [
    "lectura-incidencia.clasificar.response",
    "lectura-incidencia.clasificar.failed",
    "bocaos.incidencia_clasificada",
    "bocaos.lectura_ambigua"
   ],
   "proyecciones_internas": [
    {
     "nombre": "cajon_clasificar",
     "descripcion": "F07: el cajón del blueprint. Devuelve una etiqueta de la lista cerrada."
    },
    {
     "nombre": "_validador",
     "descripcion": "F07: sólo etiquetas de la lista; cualquier otra cosa → `lectura_ambigua` y la incidencia va a la cola sin etiqueta."
    },
    {
     "nombre": "_no_es_juez",
     "descripcion": "F07: no dice si el fallo existió (eso es G02)."
    }
   ],
   "handlers": [
    {
     "op": "clasificar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.incidencia_clasificada",
    "bocaos.lectura_ambigua"
   ]
  },
  {
   "slug": "regla-fallo",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "G02",
    "G03",
    "G06"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "hechos-reparto"
   ],
   "subscribes": [
    "regla-fallo.medir.request",
    "regla-fallo.adjudicar.request",
    "bocaos.acta_incompleta",
    "bocaos.acta_completa",
    "project.activated"
   ],
   "publishes": [
    "regla-fallo.medir.response",
    "regla-fallo.medir.failed",
    "regla-fallo.adjudicar.response",
    "regla-fallo.adjudicar.failed",
    "bocaos.fallo_medido",
    "bocaos.fallo_adjudicado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_medir",
     "descripcion": "G02: un fallo existe si y sólo si los hechos con hora lo verifican. Sin acta completa no hay fallo."
    },
    {
     "nombre": "_adjudicar",
     "descripcion": "G03: tabla cerrada de quién responde. Devuelve QUIÉN, no CUÁNTO: los importes siguen sin número y se declaran."
    },
    {
     "nombre": "_traza",
     "descripcion": "G06: la evidencia que sostiene la adjudicación, enumerable."
    }
   ],
   "handlers": [
    {
     "op": "medir",
     "clase": "PREGUNTA"
    },
    {
     "op": "adjudicar",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.fallo_medido",
    "bocaos.fallo_adjudicado"
   ]
  },
  {
   "slug": "cargo-fallo",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "G04"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "regla-fallo"
   ],
   "subscribes": [
    "cargo-fallo.anotar.request",
    "cargo-fallo.de.request",
    "bocaos.fallo_adjudicado",
    "bocaos.acta_incompleta",
    "project.activated"
   ],
   "publishes": [
    "cargo-fallo.anotar.response",
    "cargo-fallo.anotar.failed",
    "cargo-fallo.de.response",
    "cargo-fallo.de.failed",
    "bocaos.cargo_anotado",
    "bocaos.cargo_sin_evidencia"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_anotar",
     "descripcion": "G04: deuda con partes, evidencia y plaza. Sin evidencia NO nace (y se publica el intento)."
    },
    {
     "nombre": "_no_descuento",
     "descripcion": "G04: una deuda no se compensa con un devengo. La plaza no retiene (H06)."
    }
   ],
   "handlers": [
    {
     "op": "anotar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.cargo_anotado",
    "bocaos.cargo_sin_evidencia"
   ]
  },
  {
   "slug": "disputa-fallo",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "G05"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "cargo-fallo"
   ],
   "subscribes": [
    "disputa-fallo.abrir.request",
    "bocaos.cargo_anotado",
    "project.activated"
   ],
   "publishes": [
    "disputa-fallo.abrir.response",
    "disputa-fallo.abrir.failed",
    "bocaos.disputa_abierta"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_abrir",
     "descripcion": "G05: cargo + parte + motivo + hechos citados. No decide: encola (D3)."
    },
    {
     "nombre": "_no_borra",
     "descripcion": "G05: la deuda sigue; lo que cambia es que no se cobra hasta el dictamen."
    }
   ],
   "handlers": [
    {
     "op": "abrir",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.disputa_abierta"
   ]
  },
  {
   "slug": "liquidacion",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "H01",
    "H02",
    "H05",
    "E04",
    "E05",
    "A32",
    "H06"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "scheduler"
   ],
   "depende_de": [
    "hechos-reparto",
    "cargo-fallo",
    "contrato-tramos",
    "contrato-puntual"
   ],
   "subscribes": [
    "liquidacion.abrir.request",
    "liquidacion.cerrar.request",
    "liquidacion.devengar.request",
    "liquidacion.mora.request",
    "scheduler.job.triggered",
    "bocaos.hecho_reparto_anotado",
    "bocaos.cargo_anotado",
    "bocaos.cobro_fallido",
    "project.activated"
   ],
   "publishes": [
    "liquidacion.abrir.response",
    "liquidacion.abrir.failed",
    "liquidacion.cerrar.response",
    "liquidacion.cerrar.failed",
    "liquidacion.devengar.response",
    "liquidacion.devengar.failed",
    "liquidacion.mora.response",
    "liquidacion.mora.failed",
    "bocaos.ciclo_abierto",
    "bocaos.cierre_semanal",
    "bocaos.devengo_calculado",
    "bocaos.mora_aplicada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_devengar",
     "descripcion": "H01: por contrato cerrado del periodo. Tienda: fijo del tramo + 20 c/pedido. Rider: 10 c/pedido. NUNCA por km ahorrado, NUNCA por % del ticket."
    },
    {
     "nombre": "_dos_cifras",
     "descripcion": "H01/E04: seguro + en duda. Un pedido cancelado tras aceptar queda 'en duda' (Q18), no se elige."
    },
    {
     "nombre": "_cerrar",
     "descripcion": "H02: cierre INMUTABLE del periodo. Se crea el job `bocaos.ciclo_semanal` en project.activated y se filtra el disparo del scheduler."
    },
    {
     "nombre": "_mora",
     "descripcion": "H05: recordatorio → recargo → suspensión. La suspensión NO corta pedidos en vuelo ni propuestas vivas."
    },
    {
     "nombre": "_comision",
     "descripcion": "E04: la comisión de coordinación, derivada del tramo vigente CUANDO OCURRIÓ el hecho."
    },
    {
     "nombre": "_reparto",
     "descripcion": "E05: reparto del pago por parte. Conversor puro: no guarda, compone desde el cierre."
    },
    {
     "nombre": "_no_retencion",
     "descripcion": "H06/A32: la plaza no retiene. Falla si un cierre descuenta una deuda o un km ahorrado."
    }
   ],
   "handlers": [
    {
     "op": "abrir",
     "clase": "ORDEN"
    },
    {
     "op": "devengar",
     "clase": "PREGUNTA"
    },
    {
     "op": "cerrar",
     "clase": "ORDEN"
    },
    {
     "op": "mora",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.ciclo_abierto",
    "bocaos.cierre_semanal",
    "bocaos.devengo_calculado",
    "bocaos.mora_aplicada"
   ]
  },
  {
   "slug": "factura-gestion",
   "forma": "conversor",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "H03"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "contabilidad-fiscal/factura-electronica"
   ],
   "depende_de": [
    "liquidacion"
   ],
   "subscribes": [
    "factura-gestion.emitir.request",
    "bocaos.cierre_semanal"
   ],
   "publishes": [
    "factura-gestion.emitir.response",
    "factura-gestion.emitir.failed",
    "bocaos.factura_emitida"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_emitir",
     "descripcion": "H03: cierre + parte → documento de cobro. Una factura por cierre y parte; la segunda es rectificativa."
    },
    {
     "nombre": "_iva",
     "descripcion": "H03: el IVA es Q4 (abierto): el campo existe, el tipo no se inventa."
    }
   ],
   "handlers": [
    {
     "op": "emitir",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.factura_emitida"
   ]
  },
  {
   "slug": "cobro-gestion",
   "forma": "puente",
   "accion": "ADAPTAR",
   "unidad": "plaza",
   "clases": [
    "H04"
   ],
   "reutiliza": [
    "pago-gateway",
    "credential-manager"
   ],
   "depende_de": [],
   "subscribes": [
    "cobro-gestion.cobrar.request",
    "cobro-gestion.revertir.request",
    "cobro-gestion.estado.request",
    "pago.confirmado",
    "pago.rechazado",
    "project.activated"
   ],
   "publishes": [
    "cobro-gestion.cobrar.response",
    "cobro-gestion.cobrar.failed",
    "cobro-gestion.revertir.response",
    "cobro-gestion.revertir.failed",
    "cobro-gestion.estado.response",
    "cobro-gestion.estado.failed",
    "bocaos.cobro_realizado",
    "bocaos.cobro_fallido",
    "bocaos.reversion_realizada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_cobrar",
     "descripcion": "H04: documento de `factura-gestion` → canal de la parte. La cuenta y la credencial son de la plaza."
    },
    {
     "nombre": "_revertir",
     "descripcion": "H04 + Q29: `transfer_reversal` sobre la cuenta conectada. Requiere un movimiento que `pago-gateway` HOY NO EXPONE."
    },
    {
     "nombre": "_no_libro",
     "descripcion": "H04: el libro de cobros de la plaza es su cierre inmutable, no el libro de `pago-gateway`."
    }
   ],
   "handlers": [
    {
     "op": "cobrar",
     "clase": "ORDEN"
    },
    {
     "op": "revertir",
     "clase": "ORDEN"
    },
    {
     "op": "estado",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.cobro_realizado",
    "bocaos.cobro_fallido",
    "bocaos.reversion_realizada"
   ]
  },
  {
   "slug": "cuenta-parte",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "Q01",
    "M01"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "liquidacion",
    "contrato-puntual"
   ],
   "subscribes": [
    "cuenta-parte.ver.request",
    "cuenta-parte.cartera.request",
    "bocaos.cierre_semanal",
    "bocaos.cobro_realizado",
    "bocaos.cargo_anotado"
   ],
   "publishes": [
    "cuenta-parte.ver.response",
    "cuenta-parte.ver.failed",
    "cuenta-parte.cartera.response",
    "cuenta-parte.cartera.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_ver",
     "descripcion": "Q01: devengado · cobrado · deuda · en duda, con la versión de tramos que estaba viva."
    },
    {
     "nombre": "_cartera",
     "descripcion": "M01: la cartera del rider en ESTA plaza. Un rider en dos plazas tiene dos carteras y un solo cuerpo (§7.9)."
    }
   ],
   "handlers": [
    {
     "op": "ver",
     "clase": "PREGUNTA"
    },
    {
     "op": "cartera",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": []
  },
  {
   "slug": "cola-sala",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "P01",
    "P02",
    "O03"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "enlace",
    "regla-fallo",
    "incidencia-reparto"
   ],
   "subscribes": [
    "cola-sala.encolar.request",
    "cola-sala.ver.request",
    "cola-sala.cerrar.request",
    "cola-sala.vista_parte.request",
    "bocaos.enlace_agotado",
    "bocaos.incidencia_abierta",
    "bocaos.disputa_abierta",
    "bocaos.cargo_sin_evidencia",
    "bocaos.aviso_tienda_fallido",
    "bocaos.aviso_cliente_fallido",
    "bocaos.censo_incompleto",
    "project.activated"
   ],
   "publishes": [
    "cola-sala.encolar.response",
    "cola-sala.encolar.failed",
    "cola-sala.ver.response",
    "cola-sala.ver.failed",
    "cola-sala.cerrar.response",
    "cola-sala.cerrar.failed",
    "cola-sala.vista_parte.response",
    "cola-sala.vista_parte.failed",
    "bocaos.caso_encolado",
    "bocaos.caso_cerrado",
    "bocaos.revision_solicitada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_encolar",
     "descripcion": "P01: caso con tipo, traza y plazo. Vencer NO resuelve: sube de prioridad y sigue vivo."
    },
    {
     "nombre": "_vista",
     "descripcion": "P02: lo que la parte ve de su caso, sin datos de la otra parte."
    },
    {
     "nombre": "_revision",
     "descripcion": "O03: la revisión humana es de la plaza donde se decidió; el nacional no puede dictaminar sobre una propuesta que no tiene."
    }
   ],
   "handlers": [
    {
     "op": "encolar",
     "clase": "ORDEN"
    },
    {
     "op": "ver",
     "clase": "PREGUNTA"
    },
    {
     "op": "vista_parte",
     "clase": "PREGUNTA"
    },
    {
     "op": "cerrar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.caso_encolado",
    "bocaos.caso_cerrado",
    "bocaos.revision_solicitada"
   ]
  },
  {
   "slug": "aviso-sala",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "I07"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "telegram-bridge"
   ],
   "depende_de": [
    "cola-sala"
   ],
   "subscribes": [
    "aviso-sala.avisar.request",
    "bocaos.caso_encolado"
   ],
   "publishes": [
    "aviso-sala.avisar.response",
    "aviso-sala.avisar.failed",
    "bocaos.aviso_sala_entregado",
    "bocaos.aviso_sala_vencido"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_avisar",
     "descripcion": "I07: caso + traza + plazo al destinatario declarado (un agente, hoy)."
    },
    {
     "nombre": "_vencido",
     "descripcion": "I07: si el aviso caduca sin respuesta, se publica el vencimiento: el caso sigue en la cola."
    }
   ],
   "handlers": [
    {
     "op": "avisar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.aviso_sala_entregado",
    "bocaos.aviso_sala_vencido"
   ]
  },
  {
   "slug": "accion-sancion",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "P03"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "cola-sala"
   ],
   "subscribes": [
    "accion-sancion.aplicar.request",
    "bocaos.caso_cerrado",
    "project.activated"
   ],
   "publishes": [
    "accion-sancion.aplicar.response",
    "accion-sancion.aplicar.failed",
    "bocaos.parte_sancionada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_aplicar",
     "descripcion": "P03: parte + motivo + plazo + firmante. Sin firmante no hay sanción."
    },
    {
     "nombre": "_limites",
     "descripcion": "P03: no corta pedidos en vuelo ni propuestas vivas; no toca el dinero."
    }
   ],
   "handlers": [
    {
     "op": "aplicar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.parte_sancionada"
   ]
  },
  {
   "slug": "dictamen-revision",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "O04"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "cola-sala",
    "config-mercado",
    "acta-decisiones"
   ],
   "subscribes": [
    "dictamen-revision.dictaminar.request",
    "bocaos.revision_solicitada",
    "project.activated"
   ],
   "publishes": [
    "dictamen-revision.dictaminar.response",
    "dictamen-revision.dictaminar.failed",
    "bocaos.dictamen_firmado",
    "bocaos.dictamen_rechazado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_dictaminar",
     "descripcion": "O04: caso + firmante + efecto permitido + motivo. El efecto prohibido (rehacer la propuesta) no se puede escribir."
    },
    {
     "nombre": "_efectos",
     "descripcion": "O04: compensar · corregir histórico · cambiar la regla hacia adelante. Tres, cerrados."
    },
    {
     "nombre": "_firma",
     "descripcion": "O04: la firma dice el ámbito; una revisión de tienda no la firma el dueño de la plaza."
    }
   ],
   "handlers": [
    {
     "op": "dictaminar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.dictamen_firmado",
    "bocaos.dictamen_rechazado"
   ]
  },
  {
   "slug": "salud-mercado",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "I05",
    "I06",
    "O01",
    "N01"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "metricas"
   ],
   "depende_de": [
    "propuesta",
    "hechos-reparto",
    "liquidacion"
   ],
   "subscribes": [
    "salud-mercado.medir.request",
    "salud-mercado.cuadro.request",
    "salud-mercado.fricciones.request",
    "bocaos.propuesta_emitida",
    "bocaos.propuesta_aceptada",
    "bocaos.cierre_semanal"
   ],
   "publishes": [
    "salud-mercado.medir.response",
    "salud-mercado.medir.failed",
    "salud-mercado.cuadro.response",
    "salud-mercado.cuadro.failed",
    "salud-mercado.fricciones.response",
    "salud-mercado.fricciones.failed",
    "bocaos.medida_publicada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_medir",
     "descripcion": "I05: la medida maestra. Un mercado que necesita seis propuestas para mover un pedido está muerto aunque venda."
    },
    {
     "nombre": "_fricciones",
     "descripcion": "I06: los 8 pares, medidos sobre los mismos hechos que I05 y O01. Tres módulos darían tres cifras del mismo mercado."
    },
    {
     "nombre": "_cuadro",
     "descripcion": "O01: el cuadro del jefe de la plaza. Agregados de mercado, nunca de personas."
    },
    {
     "nombre": "_densidad",
     "descripcion": "N01: densidad por zona — información para el dueño; abrir o cerrar zona es una SolicitudDecisión (D6)."
    }
   ],
   "handlers": [
    {
     "op": "medir",
     "clase": "PREGUNTA"
    },
    {
     "op": "cuadro",
     "clase": "PREGUNTA"
    },
    {
     "op": "fricciones",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.medida_publicada"
   ]
  },
  {
   "slug": "tienda-reclamacion",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "K01"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "tienda-cliente"
   ],
   "subscribes": [
    "tienda-reclamacion.encauzar.request",
    "bocaos.reclamacion_recibida"
   ],
   "publishes": [
    "tienda-reclamacion.encauzar.response",
    "tienda-reclamacion.encauzar.failed",
    "bocaos.reclamacion_encauzada",
    "bocaos.reclamacion_devuelta"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_encauzar",
     "descripcion": "K01: reclamación → caso EN LA TIENDA, con hora. Nada viaja a la plaza ni al nacional."
    },
    {
     "nombre": "_devolver",
     "descripcion": "K01: si una reclamación llega a Bocaos por error, se devuelve a la tienda con su hora. No se atiende, no se responde, no se guarda como relación."
    }
   ],
   "handlers": [
    {
     "op": "encauzar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.reclamacion_encauzada",
    "bocaos.reclamacion_devuelta"
   ]
  },
  {
   "slug": "tienda-resumen",
   "forma": "micro-agente",
   "accion": "CONSTRUIR",
   "unidad": "tienda",
   "clases": [
    "L04"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "ai-gateway"
   ],
   "depende_de": [
    "tienda-panel"
   ],
   "subscribes": [
    "tienda-resumen.redactar.request"
   ],
   "publishes": [
    "tienda-resumen.redactar.response",
    "tienda-resumen.redactar.failed",
    "bocaos.resumen_redactado",
    "bocaos.resumen_rechazado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "cajon_redactar",
     "descripcion": "L04: el cajón del blueprint (texto libre). El reflejo sólo valida y publica."
    },
    {
     "nombre": "_validador",
     "descripcion": "L04: todo número citado tiene que existir en los hechos de entrada. Un número que no está en la entrada rechaza el párrafo entero."
    },
    {
     "nombre": "_sin_contexto",
     "descripcion": "L04: no menciona a la plaza ni al nacional. La tienda no necesita saber cuántos niveles hay encima."
    }
   ],
   "handlers": [
    {
     "op": "redactar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.resumen_redactado",
    "bocaos.resumen_rechazado"
   ]
  },
  {
   "slug": "publicacion",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "plaza",
   "clases": [
    "(raíz Plaza: publicar)"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "scheduler"
   ],
   "depende_de": [
    "config-mercado"
   ],
   "subscribes": [
    "publicacion.acceso_concedido.request",
    "bocaos.censo_actualizado",
    "bocaos.cierre_semanal",
    "scheduler.job.triggered",
    "project.activated"
   ],
   "publishes": [
    "publicacion.acceso_concedido.response",
    "publicacion.acceso_concedido.failed",
    "plaza.viva",
    "tienda.dada-de-alta",
    "plaza.devengo-cerrado",
    "plaza.acceso-visto",
    "bocaos.publicacion_intentada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_viva",
     "descripcion": "`plaza.viva` { plaza_id, versión, estado, tiendas:N } periódico y barato, por el job `bocaos.plaza.viva`."
    },
    {
     "nombre": "_tienda",
     "descripcion": "`tienda.dada-de-alta` { plaza_id, tienda_id, nombre, estado } cuando pasa (lo dispara `bocaos.censo_actualizado`)."
    },
    {
     "nombre": "_devengo",
     "descripcion": "`plaza.devengo-cerrado` { plaza_id, periodo, total, partes:N } al cerrar la semana. Lleva CUÁNTAS partes, no cuáles."
    },
    {
     "nombre": "_acceso",
     "descripcion": "`plaza.acceso-visto` al conceder o usar un acceso. Es el único acto de la plaza que sube con nombre propio."
    },
    {
     "nombre": "_sello",
     "descripcion": "El plaza_id NO se copia del payload: se toma de la configuración del despliegue. El tienda_id se toma del pedido/alta del dueño, nunca del que llama."
    },
    {
     "nombre": "_sin_acuse",
     "descripcion": "No hay `.response` ni reintento que bloquee: con el nacional caído, publicar es publicar al vacío y el negocio sigue."
    }
   ],
   "handlers": [
    {
     "op": "acceso_concedido",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "plaza.viva",
    "tienda.dada-de-alta",
    "plaza.devengo-cerrado",
    "plaza.acceso-visto",
    "bocaos.publicacion_intentada"
   ]
  },
  {
   "slug": "fed-buzon",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "(raíz Nacional: anotar)",
    "R23",
    "R25"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "metricas"
   ],
   "depende_de": [],
   "subscribes": [
    "plaza.viva",
    "tienda.dada-de-alta",
    "plaza.devengo-cerrado",
    "plaza.acceso-visto",
    "fed-buzon.guarda_catalogo.request",
    "fed-buzon.guarda_frontera.request",
    "fed-buzon.recibidos.request",
    "project.activated"
   ],
   "publishes": [
    "fed-buzon.guarda_catalogo.response",
    "fed-buzon.guarda_catalogo.failed",
    "fed-buzon.guarda_frontera.response",
    "fed-buzon.guarda_frontera.failed",
    "fed-buzon.recibidos.response",
    "fed-buzon.recibidos.failed",
    "bocaos.federacion_plaza_viva",
    "bocaos.federacion_tienda_publicada",
    "bocaos.federacion_devengo_cerrado",
    "bocaos.federacion_acceso_visto",
    "bocaos.federacion_hecho_rechazado",
    "bocaos.federacion_fila_sin_plaza",
    "bocaos.federacion_almacen_con_catalogo"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_forma",
     "descripcion": "La raíz `Nacional.anotar`: cuatro formas cerradas (plaza.viva · tienda.dada-de-alta · devengo-cerrado · acceso-visto). La quinta se rechaza con nombre, no se ignora."
    },
    {
     "nombre": "_sello",
     "descripcion": "R25: compara el `plaza_id` de cada fila con la plaza del que la escribió. Sólo tres clases escriben con plaza_id ajeno (R05, R06, R20) y las tres escriben SOBRE una plaza, no DESDE otra."
    },
    {
     "nombre": "_sin_catalogo",
     "descripcion": "R23: enumera el almacén del nacional. Si aparece `pedido`, `linea`, `importe`, `direccion` o `posicion`, FALLA con la ruta exacta."
    },
    {
     "nombre": "_recibidos",
     "descripcion": "Cuenta y forma de lo recibido por plaza y periodo — el cuadro del buzón, sin nombres de partes."
    }
   ],
   "handlers": [
    {
     "op": "guarda_catalogo",
     "clase": "PREGUNTA"
    },
    {
     "op": "guarda_frontera",
     "clase": "PREGUNTA"
    },
    {
     "op": "recibidos",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_plaza_viva",
    "bocaos.federacion_tienda_publicada",
    "bocaos.federacion_devengo_cerrado",
    "bocaos.federacion_acceso_visto",
    "bocaos.federacion_hecho_rechazado",
    "bocaos.federacion_fila_sin_plaza",
    "bocaos.federacion_almacen_con_catalogo"
   ]
  },
  {
   "slug": "fed-padron",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R01",
    "R02",
    "R03",
    "R04"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager",
    "scheduler"
   ],
   "depende_de": [],
   "subscribes": [
    "fed-padron.abrir.request",
    "fed-padron.anotar.request",
    "fed-padron.de.request",
    "fed-padron.vivas.request",
    "bocaos.federacion_verificacion_ok",
    "bocaos.federacion_verificacion_difiere",
    "scheduler.job.triggered",
    "project.activated"
   ],
   "publishes": [
    "fed-padron.abrir.response",
    "fed-padron.abrir.failed",
    "fed-padron.anotar.response",
    "fed-padron.anotar.failed",
    "fed-padron.de.response",
    "fed-padron.de.failed",
    "fed-padron.vivas.response",
    "fed-padron.vivas.failed",
    "bocaos.federacion_plaza_anotada",
    "bocaos.federacion_plaza_estado",
    "bocaos.federacion_plaza_silenciosa"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_abrir",
     "descripcion": "R02: abrir es un ACTO con responsable y fecha; la primera plaza escribe su acta de constitución y NO crea padrón. Sin responsable → SIN_RESPONSABLE."
    },
    {
     "nombre": "_transitar",
     "descripcion": "R03: naciendo → operando sólo con verificación en verde; cerrada no vuelve; ningún estado sin hecho con hora."
    },
    {
     "nombre": "_silencio",
     "descripcion": "R04: minutos desde el último plaza.viva contra el umbral DEL REGISTRO; alimenta a _transitar, no la sustituye."
    },
    {
     "nombre": "_siete_campos",
     "descripcion": "R01: id · localidad · estado · versión · alta · responsable · plaza_id. Ni carta, ni precios, ni número de tiendas."
    }
   ],
   "handlers": [
    {
     "op": "abrir",
     "clase": "ORDEN"
    },
    {
     "op": "anotar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    },
    {
     "op": "vivas",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_plaza_anotada",
    "bocaos.federacion_plaza_estado",
    "bocaos.federacion_plaza_silenciosa"
   ]
  },
  {
   "slug": "fed-censo",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R05"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "fed-buzon"
   ],
   "subscribes": [
    "fed-censo.de.request",
    "fed-censo.baja.request",
    "bocaos.federacion_tienda_publicada",
    "project.activated"
   ],
   "publishes": [
    "fed-censo.de.response",
    "fed-censo.de.failed",
    "fed-censo.baja.response",
    "fed-censo.baja.failed",
    "bocaos.federacion_tienda_censada",
    "bocaos.federacion_tienda_baja"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_anotar",
     "descripcion": "R05: id · nombre · estado · plaza_id. La quinta columna que alguien pida (carta, precios, volumen) no tiene dónde ponerse."
    },
    {
     "nombre": "_baja",
     "descripcion": "R05: una tienda de baja se marca, no se borra: su nombre en el índice del mes pasado tiene que seguir teniendo explicación."
    }
   ],
   "handlers": [
    {
     "op": "de",
     "clase": "PREGUNTA"
    },
    {
     "op": "baja",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.federacion_tienda_censada",
    "bocaos.federacion_tienda_baja"
   ]
  },
  {
   "slug": "fed-versiones",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R06",
    "R09"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "fed-buzon"
   ],
   "subscribes": [
    "bocaos.federacion_plaza_viva",
    "fed-versiones.de.request",
    "fed-versiones.compatible.request",
    "project.activated"
   ],
   "publishes": [
    "fed-versiones.de.response",
    "fed-versiones.de.failed",
    "fed-versiones.compatible.response",
    "fed-versiones.compatible.failed",
    "bocaos.federacion_version_declarada",
    "bocaos.federacion_incompatible"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_anotar",
     "descripcion": "R06: plaza_id · versión · hora en que la declaró. Se anota lo que llega; nunca se escribe la versión de una plaza desde aquí."
    },
    {
     "nombre": "_compatible",
     "descripcion": "R09: tabla cerrada [versión → qué puede]. Una plaza atrasada sigue operando: se salta lo que no entiende y lo declara."
    }
   ],
   "handlers": [
    {
     "op": "de",
     "clase": "PREGUNTA"
    },
    {
     "op": "compatible",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_version_declarada",
    "bocaos.federacion_incompatible"
   ]
  },
  {
   "slug": "fed-puesta-en-marcha",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R07",
    "R08"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "fed-padron"
   ],
   "subscribes": [
    "fed-puesta-en-marcha.poner.request",
    "fed-puesta-en-marcha.comprobar.request",
    "bocaos.federacion_plaza_viva",
    "project.activated"
   ],
   "publishes": [
    "fed-puesta-en-marcha.poner.response",
    "fed-puesta-en-marcha.poner.failed",
    "fed-puesta-en-marcha.comprobar.response",
    "fed-puesta-en-marcha.comprobar.failed",
    "bocaos.federacion_verificacion_ok",
    "bocaos.federacion_verificacion_difiere"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_comprobar",
     "descripcion": "R08: versión declarada vs versión objetivo, estado y tiendas vivas. Si difiere, lo dice y avisa; NO mira dentro para averiguar por qué."
    },
    {
     "nombre": "_intento",
     "descripcion": "R07: el intento con plaza, versión objetivo, responsable y hora. Pide arrancar; no configura, no siembra, no toca el mercado."
    }
   ],
   "handlers": [
    {
     "op": "poner",
     "clase": "ORDEN"
    },
    {
     "op": "comprobar",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_verificacion_ok",
    "bocaos.federacion_verificacion_difiere"
   ]
  },
  {
   "slug": "fed-buscador",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R10",
    "R11",
    "R12"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "fed-padron",
    "fed-censo"
   ],
   "subscribes": [
    "fed-buscador.buscar.request",
    "fed-buscador.indice.request"
   ],
   "publishes": [
    "fed-buscador.buscar.response",
    "fed-buscador.buscar.failed",
    "fed-buscador.indice.response",
    "fed-buscador.indice.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_indice",
     "descripcion": "R10: se reescribe de padrón+censo en cada consulta. Cuatro campos por fila: plaza, localidad, tienda, estado."
    },
    {
     "nombre": "_buscar",
     "descripcion": "R11: por localidad y nombre de tienda, y por nada más (Q48). Orden declarado con desempate escrito. Si no encuentra, NO SUGIERE."
    },
    {
     "nombre": "_resultado",
     "descripcion": "R12: la fila con su plaza dentro. No hay constructor de resultado sin plaza; sin plaza no hay a dónde enrutar."
    }
   ],
   "handlers": [
    {
     "op": "buscar",
     "clase": "PREGUNTA"
    },
    {
     "op": "indice",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": []
  },
  {
   "slug": "fed-enrutado",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R13"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "fed-buscador"
   ],
   "subscribes": [
    "fed-enrutado.enrutar.request"
   ],
   "publishes": [
    "fed-enrutado.enrutar.response",
    "fed-enrutado.enrutar.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_salida",
     "descripcion": "R13: de un ResultadoConSuPlaza a la URL de SU plaza. Nada más viaja: ni marca, ni parámetro de seguimiento."
    },
    {
     "nombre": "_sin_rastro",
     "descripcion": "R13: no se escribe ni se publica nada por un clic. Un contador de clics sería el primer dato de demanda del nacional."
    }
   ],
   "handlers": [
    {
     "op": "enrutar",
     "clase": "ORDEN"
    }
   ],
   "hechos": []
  },
  {
   "slug": "fed-consolidacion",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R14",
    "R15"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "fed-buzon"
   ],
   "subscribes": [
    "bocaos.federacion_devengo_cerrado",
    "fed-consolidacion.consolidar.request",
    "fed-consolidacion.cuadro.request",
    "project.activated"
   ],
   "publishes": [
    "fed-consolidacion.consolidar.response",
    "fed-consolidacion.consolidar.failed",
    "fed-consolidacion.cuadro.response",
    "fed-consolidacion.cuadro.failed",
    "bocaos.federacion_consolidado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_consolidar",
     "descripcion": "R14: suma por plaza y periodo. No convierte moneda, no compensa, no prorratea, no cobra. Sin netting entre plazas."
    },
    {
     "nombre": "_con_definicion",
     "descripcion": "R14: cada cifra lleva dentro la definición con la que se calculó (Q53/Q56). Sin eso, el cuadro compara peras con manzanas."
    },
    {
     "nombre": "_cuadro",
     "descripcion": "R15: plazas vivas · versiones · aceptación por plaza · devengo · canon emitido vs pagado. Lo que no consta es HUECO, no cero."
    }
   ],
   "handlers": [
    {
     "op": "consolidar",
     "clase": "PREGUNTA"
    },
    {
     "op": "cuadro",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_consolidado"
   ]
  },
  {
   "slug": "fed-marca",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R16",
    "R17"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [],
   "subscribes": [
    "fed-marca.declarar.request",
    "fed-marca.de.request",
    "fed-marca.licenciar.request",
    "fed-marca.licencia.request",
    "fed-marca.retirar.request",
    "project.activated"
   ],
   "publishes": [
    "fed-marca.declarar.response",
    "fed-marca.declarar.failed",
    "fed-marca.de.response",
    "fed-marca.de.failed",
    "fed-marca.licenciar.response",
    "fed-marca.licenciar.failed",
    "fed-marca.licencia.response",
    "fed-marca.licencia.failed",
    "fed-marca.retirar.response",
    "fed-marca.retirar.failed",
    "bocaos.federacion_marca_declarada",
    "bocaos.federacion_licencia_concedida",
    "bocaos.federacion_licencia_retirada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_declarar",
     "descripcion": "R16: nombre · signos · ámbito (B2B) · titular. Ámbito cerrado: las cinco cosas del acta y ni una más."
    },
    {
     "nombre": "_licencia",
     "descripcion": "R17: qué puede hacer la plaza con la marca (rótulo, dominio, papelería, nombre comercial), desde/hasta y causa. Sin licencia no se puede poner en ningún sitio."
    },
    {
     "nombre": "_retirar",
     "descripcion": "R17: retirar es el único castigo real del registro, y llega tarde (fricción 9). Se anota con causa y hora."
    }
   ],
   "handlers": [
    {
     "op": "declarar",
     "clase": "ORDEN"
    },
    {
     "op": "licenciar",
     "clase": "ORDEN"
    },
    {
     "op": "retirar",
     "clase": "ORDEN"
    },
    {
     "op": "licencia",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_marca_declarada",
    "bocaos.federacion_licencia_concedida",
    "bocaos.federacion_licencia_retirada"
   ]
  },
  {
   "slug": "fed-acceso",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R19",
    "R20",
    "R21"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "fed-buzon"
   ],
   "subscribes": [
    "bocaos.federacion_acceso_visto",
    "fed-acceso.abrir.request",
    "fed-acceso.usar.request",
    "fed-acceso.vencer.request",
    "fed-acceso.traza.request",
    "project.activated"
   ],
   "publishes": [
    "fed-acceso.abrir.response",
    "fed-acceso.abrir.failed",
    "fed-acceso.usar.response",
    "fed-acceso.usar.failed",
    "fed-acceso.vencer.response",
    "fed-acceso.vencer.failed",
    "fed-acceso.traza.response",
    "fed-acceso.traza.failed",
    "bocaos.federacion_acceso_anotado",
    "bocaos.federacion_acceso_vencido",
    "bocaos.federacion_acceso_denegado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_anotar",
     "descripcion": "R19: sólo anota una concesión que LLEGÓ PUBLICADA. No hay método para crearla desde dentro: si lo hubiera, el soporte se daría permiso solo."
    },
    {
     "nombre": "_traza",
     "descripcion": "R20: append-only. plaza · quién · cuándo · con qué permiso · QUÉ se consultó (por nombre de cosa). Una corrección es otra línea que desmiente."
    },
    {
     "nombre": "_usar",
     "descripcion": "R21: si la traza no se puede escribir, NO se consulta. El registro no puede mirar sin dejar rastro."
    },
    {
     "nombre": "_vencer",
     "descripcion": "R21: el permiso caduca solo; un acceso sin vencimiento es un rol permanente con otro nombre."
    }
   ],
   "handlers": [
    {
     "op": "abrir",
     "clase": "ORDEN"
    },
    {
     "op": "usar",
     "clase": "ORDEN"
    },
    {
     "op": "vencer",
     "clase": "ORDEN"
    },
    {
     "op": "traza",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_acceso_anotado",
    "bocaos.federacion_acceso_vencido",
    "bocaos.federacion_acceso_denegado"
   ]
  },
  {
   "slug": "fed-soporte",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R18"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "credential-manager"
   ],
   "depende_de": [
    "fed-acceso"
   ],
   "subscribes": [
    "fed-soporte.abrir.request",
    "fed-soporte.responder.request",
    "fed-soporte.escalar.request",
    "project.activated"
   ],
   "publishes": [
    "fed-soporte.abrir.response",
    "fed-soporte.abrir.failed",
    "fed-soporte.responder.response",
    "fed-soporte.responder.failed",
    "fed-soporte.escalar.response",
    "fed-soporte.escalar.failed",
    "bocaos.federacion_caso_abierto",
    "bocaos.federacion_caso_escalado",
    "bocaos.federacion_soporte_sin_permiso"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_abrir",
     "descripcion": "R18: caso con plaza, tipo (software|método), hora y plazo. Sin permiso vivo de la plaza no hay caso de datos."
    },
    {
     "nombre": "_escalar",
     "descripcion": "R18: si la plaza está caída no puede conceder permiso; sin permiso de emergencia declarado (Q46) el soporte hace lo que puede desde fuera y LO DICE."
    }
   ],
   "handlers": [
    {
     "op": "abrir",
     "clase": "ORDEN"
    },
    {
     "op": "responder",
     "clase": "ORDEN"
    },
    {
     "op": "escalar",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "bocaos.federacion_caso_abierto",
    "bocaos.federacion_caso_escalado",
    "bocaos.federacion_soporte_sin_permiso"
   ]
  },
  {
   "slug": "fed-acta",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R22"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem"
   ],
   "depende_de": [
    "fed-padron",
    "fed-marca"
   ],
   "subscribes": [
    "fed-acta.asentar.request",
    "fed-acta.de.request",
    "project.activated"
   ],
   "publishes": [
    "fed-acta.asentar.response",
    "fed-acta.asentar.failed",
    "fed-acta.de.response",
    "fed-acta.de.failed",
    "bocaos.federacion_acta_asentada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_asentar",
     "descripcion": "R22: lista CERRADA de cinco cosas, versión de las reglas comunes, fecha y firma. La sexta no se escribe: exige otra acta."
    },
    {
     "nombre": "_corresponsabilidad",
     "descripcion": "R22: con datos personales de por medio, el acta dice quién responde de qué (Q53). No es un anexo: es la mitad del acta."
    }
   ],
   "handlers": [
    {
     "op": "asentar",
     "clase": "ORDEN"
    },
    {
     "op": "de",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_acta_asentada"
   ]
  },
  {
   "slug": "fed-canon",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "R26",
    "R24"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "fed-consolidacion",
    "fed-padron"
   ],
   "subscribes": [
    "fed-canon.calcular.request",
    "fed-canon.documento.request",
    "fed-canon.guarda_recauda.request",
    "project.activated"
   ],
   "publishes": [
    "fed-canon.calcular.response",
    "fed-canon.calcular.failed",
    "fed-canon.documento.response",
    "fed-canon.documento.failed",
    "fed-canon.guarda_recauda.response",
    "fed-canon.guarda_recauda.failed",
    "bocaos.federacion_canon_emitido",
    "bocaos.federacion_canon_sin_coeficiente"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_calcular",
     "descripcion": "R26: coeficiente × devengo CERRADO publicado. Sin coeficiente → NO_CONSTA y no se emite documento (un canon inventado es una cuota que nadie aceptó)."
    },
    {
     "nombre": "_documento",
     "descripcion": "R26: documento a UNA plaza y un periodo. La plaza lo paga por su canal; el nacional no entra en su ciclo, no descuenta, no retiene, no compensa."
    },
    {
     "nombre": "_guarda_no_recauda",
     "descripcion": "R24: recorre los caminos de dinero que SALEN del nacional. Único permitido: este. Todo lo demás falla con el camino exacto."
    },
    {
     "nombre": "_sujeto_pasivo",
     "descripcion": "Decisión C: con menos de dos plazas `documento()` → NO_HAY. No hay a quién cobrarle ni con qué justificarlo."
    }
   ],
   "handlers": [
    {
     "op": "calcular",
     "clase": "PREGUNTA"
    },
    {
     "op": "documento",
     "clase": "ORDEN"
    },
    {
     "op": "guarda_recauda",
     "clase": "PREGUNTA"
    }
   ],
   "hechos": [
    "bocaos.federacion_canon_emitido",
    "bocaos.federacion_canon_sin_coeficiente"
   ]
  },
  {
   "slug": "fed-aviso",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "unidad": "nacional",
   "clases": [
    "(flecha N→P: §1.3 flecha 4)"
   ],
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo"
   ],
   "depende_de": [
    "fed-versiones",
    "fed-padron"
   ],
   "subscribes": [
    "fed-aviso.emitir.request",
    "bocaos.federacion_plaza_estado",
    "bocaos.federacion_version_declarada"
   ],
   "publishes": [
    "version.nueva",
    "plaza.suspendida",
    "bocaos.federacion_aviso_no_enviado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_compatible",
     "descripcion": "Pregunta a `fed-versiones.compatible` antes de emitir: lo que la plaza no entiende no se le manda, y se declara el salto."
    },
    {
     "nombre": "_sin_respuesta",
     "descripcion": "No hay `.response`: el aviso no espera acuse. Esperar acuse convertiría un aviso en una dependencia de arranque."
    }
   ],
   "handlers": [
    {
     "op": "emitir",
     "clase": "ORDEN"
    }
   ],
   "hechos": [
    "version.nueva",
    "plaza.suspendida",
    "bocaos.federacion_aviso_no_enviado"
   ]
  }
 ]
}
```

---

## 11 · Lo que este plano NO resuelve (deuda declarada, no hueco tapado)

1. **El acto de conceder un acceso delegado tiene dos dueños en el diseño.** `R19` dice «**la plaza concede**; el
   nacional no se lo da a sí mismo»; `D14` (§8.1) pone «retirar la marca o **conceder un acceso delegado**» en
   **ámbito nacional**, firmado por el dueño de la federación. Las dos frases no caben a la vez. Este plano
   implementa la de R19 (la plaza publica `plaza.acceso-visto` y el nacional sólo lo anota, con la op
   `publicacion.acceso_concedido`) porque es la que sostiene la auditoría 3; la de D14 queda como contradicción
   a resolver por el dueño. **Si gana D14, hay una flecha N→P más y hay que volver a pasar la auditoría 4.**
2. **`S01 FronteraDePlaza` no se puede ejercitar dentro de un despliegue.** Con una plaza por despliegue, su
   respuesta interesante (`AMBIGUA(plazas)`) sólo aparece cuando **dos despliegues** tienen coberturas que se
   solapan, y eso no ocurre en un solo bus. El plano la construye en la plaza (donde vive `J03`) y declara que
   su caso de dos plazas se prueba en el puerto de entrada, no aquí. Q52 sigue abierta: sin regla de desempate
   **no hay pedido**, y eso es todo lo que se puede garantizar.
3. **El coeficiente del canon (Q41) no existe.** Mientras no exista, `fed-canon` devuelve `NO_CONSTA` y la
   auditoría 2 pasa **por vacío**. El día que exista hay que volver a pasarla, y el documento tendrá que salir
   por un canal administrativo que este plano no elige.
4. **El puerto Publicación no tiene proveedor.** Los seis hechos que cruzan necesitan un transporte entre el
   despliegue de la plaza y el del nacional (broker compartido, puente, o el `hermes-relay` de la casa). El
   diseño lo deja como puerto abierto y este plano **no elige**: elige sólo el contrato (cuatro formas arriba,
   dos abajo, ninguna con acuse).
5. **`pago-gateway` no expone `transfer_reversal`** (verificado: 0 ocurrencias en todo `modules/`). La
   adaptación de `cobro-gestion` (Q29) exige tocar ese módulo vivo —y afecta a todos sus proyectos— o construir
   un `pago-connect`. El plano declara el contrato (`cobro-gestion.revertir`) y **no** implementa el movimiento.
6. **La capacidad del rider en dos plazas sigue siendo un agujero** (§7.9 del diseño, Q44/Q45): `B05` es por
   plaza y el rider tiene un cuerpo. Este plano lo deja escrito en `ruta-viva._capacidad` y no lo tapa: la única
   protección es que él declare la pausa donde no está.
7. **Q3 (un juego de umbrales por zona) y Q4 (vigencia sobre pedidos en vuelo) siguen abiertas.**
   `config-mercado` **admite las dos** (la política se busca por `(zona, instante)` y la propuesta guarda su
   versión), pero el primer mercado tiene que declarar si juega con uno o varios juegos.
8. **Q17 (quién paga la subida de oferta) está medio cerrado por Q43**: el tope lo autoriza el cliente al pedir.
   Sigue abierto **quién paga** el escalón. `tarifa-pedido._subir` registra el acto y deja la deuda visible, no
   cobrada.
9. **Q18 (¿devenga un pedido cancelado tras aceptar?)** — `liquidacion._dos_cifras` lo deja «en duda», sin elegir.
   Elegir es del dueño y queda en acta.
10. **Los importes de la tabla de fallo (G03) siguen sin número** — `regla-fallo._adjudicar` devuelve «quién» y no
    «cuánto»: el cargo nace sin importe en vez de con un número inventado.
11. **Q51 — el arranque de una plaza nueva.** Sin histórico no hay `PuntualidadDeclarada`, no hay espera medida,
    `HuecoDeMedida` manda y **no hay propuestas**. Las tres salidas (umbrales laxos de arranque, periodo de
    observación, heredar histórico) son decisiones del dueño y ninguna está declarada. El plano construye el
    hueco nombrado, no la salida.
12. **El nacional de 25 objetos necesita un operador, y el plano no dice quién.** `fed-soporte`, `fed-puesta-en-marcha`
    y `fed-aviso` son actos humanos sobre instalaciones ajenas. Con dos plazas eso es una persona; con veinte, una
    empresa. Q50 (quién puede abrir una plaza) decide si esto es una empresa con instalaciones, una franquicia o
    una cooperativa — y no está decidido.
13. **`K03` (`TransparenciaDelEnlace`) sigue sin clase.** El cliente puede estar pagando lo mismo y esperando hasta
    el umbral de retraso por un enlace que no pidió, y nadie se lo dice. Es la deuda 1 del diseño y este plano **no
    la tapa**: no hay hoja para ella.
14. **La traza de acceso (R20) y el RGPD.** Si el nacional consolida datos que identifican a una tienda o a un rider,
    deja de ser encargado y pasa a corresponsable (art. 26). La auditoría 2 dice «no recauda», no dice «no es
    responsable». Eso lo resuelve `fed-acta` o no lo resuelve nadie (Q53).

---

## 12 · Verificación de este entregable

```text
✓ 145 bloques de clase (144 + R26 condicionada) → 68 hojas. NINGUNA clase sin hoja y ninguna hoja sin clase
  (salvo las tres flechas: `publicacion`, `fed-aviso` y la primitiva `scheduler`). Comprobado por script, no a ojo.
✓ Reparto por unidad: NACIONAL 14 hojas (26 clases) · PLAZA 39 hojas (103 clases) · TIENDA 15 hojas (16 clases).
  La unidad de cada hoja coincide con la unidad que el diseño le puso a cada clase: 0 discrepancias.
✓ Ninguna hoja de plaza o de tienda depende de una hoja del nacional (0 `depende_de` con prefijo `fed-`).
✓ En la plaza no hay una sola suscripción a un tópico del nacional; en el nacional, la única suscripción al bus
  de una plaza está en `fed-buzon` y son exactamente los CUATRO hechos que cruzan.
✓ Formas: 32 custodio · 15 puente · 14 reflejo · 5 micro-agente · 2 conversor. Acciones: 64 CONSTRUIR · 3 ADAPTAR
  · 1 REUTILIZAR. Cada CONSTRUIR justifica por qué no reutiliza; cada «se acerca» está evaluado con su motivo.
✓ Tópicos en ASCII; toda operación con su `.failed`; todo flujo con su par de fallo (la única excepción —
  `publicacion`— está declarada y razonada).
✓ Cero IA en la decisión de reparto: `_pasa` es una tabla AND de cuatro umbrales y la única pieza fuzzy del cuello
  (A18) es adorno, con validador puro y caída a A17.
✓ Cero the-pirate dentro: `entrega` y `agenda-operacion` NO se tocan. De `pizzepos/*` no entra ninguna hoja: se
  consumen como proveedores de puerto (catálogo, avisos, pedido de la tienda).
✓ Las cuatro auditorías están escritas como tests, y se dice cuál puede fallar y por qué (§7).
✓ Espina `enki-plan` embebida: JSON parseable, 8 campos por hoja, `orden` cubre las 68 hojas y respeta `depende_de`.
  **147 handlers RPC** declarados con su clase (ORDEN/PREGUNTA) y **212 proyecciones internas** repartidas en las 68 hojas.
```

