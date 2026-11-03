# PLAN DE CONSTRUCCIÓN — Vertical **BOCAOS** (Fase 3b · ADAPTADOR)

> **Proyecto:** `bocaos` · **Fase:** 3b · ADAPTADOR (traducir el diseño OOP a módulos-isla event-driven de Enki)
> **Worktree:** `/home/admin/3enki-bocaos` (rama `vertical/bocaos`) · **Contenedor:** `modules/bocaos/<slug>/`
>
> **Fuentes (leídas, no de memoria):**
> - `proceso/fase3/esquemas/diseno-oop.md` — FASE 3 · PLASMA: **115 clases** (34 A · 6 B · 7 C · 7 D · 7 E · 7 F · 6 G · 6 H · 8 I · 5 J · 2 K · 4 L · 5 M · 2 N · 4 O · 4 P · 1 Q), cada una con su FORMA innegociable.
> - `proceso/fase2/esquemas/esquema.md` — FASE 2: árbol de 115 piezas, las 12 invariantes, los 11 puertos, vertical vs proyecto.
> - `proceso/fase3/Q23…Q43.md` — las respuestas ya cerradas (no se reabren; cada una aterriza en una hoja concreta, §7).
> - `F0-idea-global.md` + `F0-identidad-bocaos.json` — el marco y las tres renuncias.
> - **Inventario REAL de Enki:** 138 `module.json` inventariados en `/home/admin/3enki/modules` (maxdepth 2, incluye `pizzepos/`, `prisma/` y `nichos/`); **40 candidatos leídos a fondo** —`name`/`subscribes`/`publishes` reales—, porque un módulo se juzga por su manifest y no por su nombre.

> **Resultado:** 115 clases → **44 hojas** (40 CONSTRUIR · 3 ADAPTAR · 1 REUTILIZAR). Ninguna clase sin hoja; ninguna hoja sin clase (salvo la primitiva `scheduler`).

---

## 0 · El hallazgo de esta fase (leer antes que nada)

El diseño de la F3 tiene 115 clases, y **61 de ellas sólo calculan**. La tentación —y es el error que hizo el plan de contabilidad— es hacer **un módulo por clase**: 115 módulos, 61 de ellos reflejos sin estado que sólo se diferencian por el nombre del fichero. Eso no es una espina: es la clase escrita dos veces, una como `Clase` y otra como `module.json`.

Aquí se aplican las dos reglas de la skill —y la excepción que se declara justo debajo—, que son las que producen el plano:

```
REGLA 1 · una clase que sólo calcula es una PROYECCIÓN INTERNA de la hoja que la usa
          (jamás un helper en _shared/: la lógica de dominio vive dentro de la isla)
REGLA 2 · un objeto tiene UN solo escritor
          si dos clases del diseño escriben el MISMO objeto, son UNA hoja
```

Y una excepción explícita a la regla 1, que es la que explica por qué hay 7 hojas `REFLEJO` y no cero:

```
REGLA 1b · una clase que sólo calcula SUBE a hoja propia únicamente si
           (a) el MISMO número lo necesitan varias hojas y no se pueden permitir dos cifras
               (L01: «la misma información que ve el rider, misma fuente, mismo número»), o
           (b) la pureza de la decisión exige separar la composición del mundo de la decisión
               (A03: «dentro de F nadie lee el mundo»).
           En cualquier otro caso es PROYECCIÓN INTERNA.

Lo que NO se hace nunca: poner una de esas proyecciones en _shared/. Dos islas pueden repetir
cinco líneas; lo que no pueden es compartir la lógica de dominio sin dueño.
```

La regla 2 es la que ordena el cuello del negocio. El diseño escribe `PropuestaEmitida` (A13), `VentanaDePropuesta` (A15), `BloqueoDePropuesta` (A14) y `AceptaciónLibre` (A19) como cuatro custodios. Los cuatro escriben **la misma propuesta**: emitirla, abrir su reloj, cerrarla y aceptarla. Cuatro custodios = cuatro escritores = exactamente la carrera que A14 existe para impedir. En este plano son **un** custodio, `propuesta`, y con eso A33 (una propuesta viva por pedido) y A19 (un solo sí, atómico) se cumplen **por construcción**, no por cuidado.

Lo mismo, y por la misma razón, en:

| Objeto que se escribe | Clases del diseño | Hoja |
|---|---|---|
| la propuesta y su desenlace | A13 · A14 · A15 · A19 (+ A27/A29/A33/M05 como proyecciones) | `propuesta` |
| el hecho de «listo» | A01 · C04 | `hora-listo` |
| la política del proyecto | J01 · J02 · J03 (+ J04/J05) y G01 (las tres N) | `config-mercado` |
| el trayecto vivo del rider | B01 · B03 · B05 (+ B02/B04/B06) | `ruta-viva` |
| los hechos del reparto y su prueba | F01 · F02 (+ F03) | `hechos-reparto` |
| el dinero de la coordinación | H01 · H02 · H05 (+ E04/E05 y las guardas A32/H06) | `liquidacion` |
| la cuenta de una parte | Q01 · M01 | `cuenta-parte` |
| la única cola de lo atascado | P01 · O03 (+ P02) | `cola-sala` |
| el censo y lo declarado por la parte | I01 · I02 · M02 · M03 (+ P04) | `censo-parte` |
| el estado vivo de la parte | I03 · I04 | `estado-parte` |
| el precio del reparto de un pedido | E01 · E02 · E03 · E07 | `tarifa-pedido` |
| la carta pública | D02 | `carta-publica` |

Y al revés: lo que el diseño separa **se queda separado** cuando son objetos distintos con escritores distintos — `pedido` no se funde con `hora-listo` (el pedido avanza estados; el hecho de listo es inmutable y se desmiente), y `cargo-fallo` no se funde con `liquidacion` (una deuda entre partes no es un devengo de Bocaos).

---

## 1 · Reglas de traducción aplicadas

| Clase OOP (FORMA del diseño) | Traducción Enki | En este plano |
|---|---|---|
| CUSTODIO (38) — escribe y es dueño | módulo **CUSTODIO** (single-writer + `_shared/pos-persistencia`) | 21 hojas: las 38 clases se funden porque varias escriben el MISMO objeto (§0) |
| REFLEJO (61) — sólo calcula | **PROYECCIÓN INTERNA** de la hoja que la usa; sube a hoja propia sólo si el número lo necesitan VARIAS hojas o si la decisión debe ser pura (§0, regla 1b) | 7 hojas reflejo + 143 proyecciones internas |
| PUENTE (10) — cruza al exterior | módulo **PUENTE** | 9 hojas |
| CONVERSOR (3) — cambia de forma | módulo **CONVERSOR** | 2 hojas |
| MICRO-AGENTE (3) + el cuello | módulo **MICRO-AGENTE** (híbrido con blueprint) | 4 hojas (+ `scheduler`, primitiva REUTILIZAR que se declara micro-agente porque dispara) |
| Dependencia entre clases | **EVENTO request/response**, nunca `require` | 0 imports cruzados |

Formas válidas de hoja: `reflejo | custodio | conversor | puente | micro-agente`. Acciones: `CONSTRUIR | ADAPTAR | REUTILIZAR`.
Tópicos del bus en **ASCII** (`bocaos.pedido_listo`, `bocaos.propuesta_caducada_sin_acuse`, `bocaos.hueco_nombrado`).
**Todo flujo cierra su círculo**: cada RPC tiene su `.failed`, cada hecho su par de fallo (`bocaos.aviso_*_fallido`, `bocaos.cobro_fallido`, `bocaos.escalada_agotada`, `bocaos.acta_incompleta`, `bocaos.censo_incompleto`, `bocaos.aviso_sala_vencido`).

### 1.1 · El habla del diseño → eventos

| El diseño dice | Enki |
|---|---|
| una clase ESCRIBE un hecho | `<slug>.<op>.request` → `.response`, y el hecho de dominio `bocaos.<hecho>` fire-and-forget |
| una clase MIDE u ORDENA algo de otra | `<otra>.<op>.request` por el bus (nunca import) |
| una clase ESCUCHA un hecho | el `bocaos.<hecho>` en `subscribes` |
| una guarda (`guarda-*`) o test | op `PREGUNTA` de la hoja que vigila (nunca un módulo `guardas` aparte: una guarda separada del vigilado se apaga sin que nadie lo note) |

**Recuento de RPC:** 114 operaciones — **61 ORDEN** (superficie: declarar, aceptar, emitir, anotar, cerrar, subir, dictaminar…) y **53 PREGUNTA** (van por el bus y NO se convierten en panel en la F6: medir, ver, componer, simular, reproducir, guardas).

---

## 2 · La ley de la unidad: las 115 clases, una por una

> Cada clase del diseño y la hoja que la materializa. **115 / 115.** K03 (`TransparenciaDelEnlace`) queda **reservada y sin clase** por decisión del propio diseño: no se sabe si existe, y asignarle forma ahora sería inventar la respuesta (Q15/Q20).

| Grupo | Clases | Hojas que las contienen |
|---|---|---|
| A · propuesta-enlace (34) | A01 · A02 · A03 · A04 · A05 · A06 · A07 · A08 · A09 · A10 · A11 · A12 · A13 · A14 · A15 · A16 · A17 · A18 · A19 · A20 · A21 · A22 · A23 · A24 · A25 · A26 · A27 · A28 · A29 · A30 · A31 · A32 · A33 · A34 | `contrato-puntual` · `enlace` · `escalada-enlace` · `foto-mercado` · `hora-listo` · `liquidacion` · `propuesta` · `redaccion-propuesta` |
| B · ruta-viva (6) | B01 · B02 · B03 · B04 · B05 · B06 | `ruta-viva` |
| C · pedido (7) | C01 · C02 · C03 · C04 · C05 · C06 · C07 | `aviso-cliente` · `aviso-tienda` · `hora-listo` · `pedido` |
| D · plaza-tienda (7) | D01 · D02 · D03 · D04 · D05 · D06 · D07 | `carrito-tienda` · `carta-publica` · `escaparate` · `marca-tienda` · `registro-cliente` |
| E · tarifa-tres-bandas (7) | E01 · E02 · E03 · E04 · E05 · E06 · E07 | `contrato-tramos` · `liquidacion` · `tarifa-pedido` |
| F · reparto-medido (7) | F01 · F02 · F03 · F04 · F05 · F06 · F07 | `chat-enmascarado` · `hechos-reparto` · `incidencia-reparto` · `lectura-incidencia` · `registro-cliente` |
| G · adjudicación-fallos (6) | G01 · G02 · G03 · G04 · G05 · G06 | `cargo-fallo` · `config-mercado` · `disputa-fallo` · `regla-fallo` |
| H · liquidación (6) | H01 · H02 · H03 · H04 · H05 · H06 | `cobro-gestion` · `factura-gestion` · `liquidacion` |
| I · sala-mercado (8) | I01 · I02 · I03 · I04 · I05 · I06 · I07 · I08 | `aviso-sala` · `censo-parte` · `estado-parte` · `salud-mercado` · `terminos-parte` |
| J · config-proyecto (5) | J01 · J02 · J03 · J04 · J05 | `config-mercado` |
| K · cliente final (2 + 1 reservada) | K01 · K02 | `aviso-cliente` |
| L · restaurante (4) | L01 · L02 · L03 · L04 | `panel-tienda` · `puntualidad-tienda` · `registro-cliente` · `resumen-tienda` |
| M · repartidor (5) | M01 · M02 · M03 · M04 · M05 | `canal-rider` · `censo-parte` · `cuenta-parte` · `propuesta` |
| N · Bocaos (2) | N01 · N02 | `contrato-tramos` · `salud-mercado` |
| O · rol jefe (4) | O01 · O02 · O03 · O04 | `acta-decisiones` · `cola-sala` · `dictamen-revision` · `salud-mercado` |
| P · rol trabajador (4) | P01 · P02 · P03 · P04 | `accion-sancion` · `censo-parte` · `cola-sala` |
| Q · rol cliente (1) | Q01 | `cuenta-parte` |
| **total** | **115** | **43 hojas** |

### 2.1 · Qué se agrupa y qué no (con el motivo)

- **A05–A12 (las siete medidas + la regla de enlace) no son módulos.** Son las proyecciones `_desvio`, `_espera`, `_retraso`, `_cobra`, `_pasa` de `enlace`. Si fueran siete módulos, cada propuesta haría siete saltos de bus en una ventana de 10 s y la foto podría cambiar entre salto y salto — que es justo lo que A03 prohíbe (una decisión, una foto).
- **A16/A17 tampoco**: `_razones` y `_frase` viven en `enlace` porque tienen que seguir funcionando cuando el agente A18 se cae. El agente es el adorno; la frase derivada es el mínimo legal.
- **Las nueve guardas de A (A22, A27, A28, A30, A31, A33) y las de K02/L02/M03/D07/H06/A32** son proyecciones u ops `PREGUNTA` de la hoja que vigilan: `enlace`, `propuesta`, `aviso-cliente`, `registro-cliente`, `censo-parte`, `escaparate`, `liquidacion`. Se ejecutan desde la suite de verificación por RPC.
- **G01 (las tres N) se va con la política** (`config-mercado`) y no con la medición (`regla-fallo`): si viviera junto a la tabla, se podría cobrar con una N que nadie declaró en la misma versión de la política. Es una regla **con vigencia**, y todas las que tienen vigencia viven en el mismo documento.
- **N01 (densidad) se va con `salud-mercado`** y no con `cola-sala`: es una medida que se le muestra al dueño; la decisión de abrir o cerrar zona es una `SolicitudDecision` y queda en acta.
- **I06 (los 8 pares) se va con `salud-mercado`**: mide los mismos hechos que I05 y O01; tres módulos distintos darían tres cifras del mismo mercado.

---

## 3 · Inventario real: REUTILIZAR · ADAPTAR · CONSTRUIR

> 44 hojas: **40 CONSTRUIR · 3 ADAPTAR · 1 REUTILIZAR**. Cada decisión se tomó contra el `module.json` real.

### 3.1 · REUTILIZAR (1)

| hoja | módulo real | por qué encaja su contrato |
|---|---|---|
| `scheduler` | `modules/scheduler` v1.0.0 | Publica `scheduler.job.triggered` / `.completed` / `.failed` y acepta cron/interval/datetime/evento. `liquidacion` necesita exactamente eso para el ciclo semanal: le crea el job `bocaos.ciclo_semanal` en `project.activated` y filtra el disparo. |

### 3.2 · ADAPTAR (3)

| hoja | módulo real | qué se adapta |
|---|---|---|
| `aviso-cliente` (C06/K01/K02) | `whatsapp-bot` v1.5.0 | Ya tiene webhook por proyecto, plantilla `pedido_listo` y credenciales por proyecto; publica `whatsapp.mensaje.enviado` / `whatsapp.envio.fallido` (el par honesto del envío). Se le añade **credencial y plantilla por tienda** y el **validador K02** en la salida (ninguna comunicación al cliente final puede llevar la marca de Bocaos). |
| `canal-rider` (M04/A15) | `telegram-bridge` v1.0.3 | Ya entrega por proyecto y devuelve `telegram.callback.received`, que es el acuse / el sí / el no. Se le añade el contrato de M04: **acuse obligatorio**, ventana de validez y retirada a los 5 s (Q42). El transporte queda intercambiable; la pieza crítica es el contrato, no el canal. |
| `cobro-gestion` (H04) | `pago-gateway` v3.1.0 | Ya cobra por proyecto con credencial, conciliación y `pago.iniciar` / `pago.reembolsar` / `pago.confirmado`. Se le añade **`revertir`** (`transfer_reversal` sobre la cuenta conectada, Q29) y el canal **por parte**. NO se reutiliza su libro de cobros como libro de Bocaos: la cuota tiene su propio cierre inmutable. |

### 3.3 · CONSTRUIR (40) y los «se acerca pero…» que se descartaron

| Candidato real | Por qué NO se reutiliza / adapta |
|---|---|
| `pizzepos/carta-digital` v2.25.1 (proyector del canal digital) | Proyecta **la carta activa DEL PROYECTO**: una tienda por proyecto. Un mercado Bocaos tiene **N tiendas dentro de un proyecto** (`censo-parte` las da de alta). Se construye `carta-publica` (CONVERSOR) con el puerto Catálogo por tienda. |
| `pizzepos/productos` v5.3.2 (proyector POS sin estado) | Igual limitación: una carta por proyecto y formato POS. `carta-publica` poda y publica para el cliente, no para el POS. |
| `pizzepos/pedidos` v3.6.0 (`pedido.creado`, tipo `tienda`) | Es el pedido **de la tienda** (su cocina, su TPV). El pedido del mercado necesita tres cosas que no tiene: precio de reparto **congelado** al nacer, la **aceptación de la tienda** (Q27) como transición con hecho, y el **estado podado** para el cliente (C05). Se construye `pedido`; el id del pedido de la tienda es la clave de unión. |
| `estados` v0.4.0 (custodio de listas ordenadas, freno entre pasos) | Es una lista genérica con orden libre/estricto. `EstadoPedido` (C02) es una **tabla cerrada** donde ninguna transición existe sin un hecho con hora y un estado no se corrige: se avanza. Se toma el patrón (single-writer, JSON por proyecto) y se construye. |
| `cola` v0.1.0 (cola de impresión 3D, FIFO + urgencia) | Mismo patrón que `cola-sala`, **otro dominio**, y hardcodeada a impresiones (`cola.imprimiendo`, GCODE). No se adapta: rompería su proyecto. |
| `historial` v0.1.0 (append-only de impresiones) | Mismo patrón que `hechos-reparto`, otra clave y otro dominio. Se toma el patrón y se construye. |
| `interfaz` v0.1.0 (superficie del radar de nichos) | Superficie de otro vertical (`interfaz.veredicto_confirmado`). `cola-sala` y `panel-tienda` son otra cosa. |
| `prisma/carrito` | Buffer de venta **del proyecto** (un comercio). `D04` necesita un carrito por **(cliente, tienda)** dentro de un mercado multi-tienda. |
| `metricas` | Instrumentación pasiva genérica. `salud-mercado` mide el negocio (propuestas por aceptación, huecos, devengado). `metricas` entra como **base de infraestructura**, no como hoja. |
| `chat-p2p` v1.0.0 (chat entre chats de proyecto) | Es agente↔agente sobre el circuito de conversación. `chat-enmascarado` es rider↔cliente con enmascarado de números y **cero** agregados sobre conversaciones (art. 15 de la Directiva). No encaja. |
| `project-profile`, `calendario`, `lotes`, `inventario`, `catalogo` | Otros dominios (perfil de proyecto, calendario fiscal, lotes de producción, stock, biblioteca 3D). Ninguno tiene el eje de Bocaos. |

### 3.4 · Infraestructura declarada (no son hojas)

`_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`, `credential-manager`, `metricas`. Se declaran en el `reutiliza` de cada hoja: no tienen eje ni clase en el diseño, así que no pueden ser hoja.

---

## 4 · Vertical vs proyecto (la frontera, otra vez)

**La vertical fija la forma.** El proyecto declara los valores. Todo lo local vive en `config-mercado` y la vertical no cambia una línea.

| La VERTICAL fija (código) | El PROYECTO declara (config) | Respuesta |
|---|---|---|
| hay cuatro umbrales, en m · min · min · c€, y la comparación es AND | 800 m · 4 min · 6 min · > 0 (Q1) | S1 |
| `cobra` es NETO | coste 0,140 €/km y 0,257 €/min (Q41) | Q41 |
| la ventana es finita y declarada | validez 20 s · decisión 10 s · sin acuse 5 s (Q42) | Q42 |
| el orden de candidatos es determinista | «el que mejor puntúa, con la fórmula publicada» (Q7) y tope 2 (Q6) | S7 |
| hay zonas | barrios y radio (Q3) | abierto (Q3) |
| la espera se mide y se cobra | N1 8 min · N2 5 min · N3 10 min (Q28) | Q28 |
| hay tramo fijo y tramo por pedido | 39/79/149 € · 10 c€ rider · 20 c€ tienda (Q14) | S14 |
| la escalada tiene tres peldaños y tope del cliente | 30 s peldaño 2 · escalones hasta el tope autorizado · 5 min de cancelación (Q43) | Q43 |
| hay revisión humana desde el día uno | quién firma (el dueño) y plazo 48 h (Q25/Q26) | Q25/Q26 |
| la traza de posición se conserva un tiempo declarado | 90 días (Q38) | Q38 |
| no hay exclusividad ni antigüedad | 0 (Q34/Q35) | Q34/Q35 |

**Cero IA en la decisión.** Las cuatro comparaciones son una tabla (`_pasa`) y el orden es una fórmula publicada. La única pieza fuzzy del enlace es `redaccion-propuesta` (A18), validador puro contra A16, y si se cae el mercado sigue con la frase derivada A17.

---

## 5 · Contrato de eventos (quién lo anuncia · quién lo escucha)

### 5.1 · Los hechos de dominio de Bocaos (fire-and-forget)

| Hecho | Lo anuncia | Lo escuchan |
|---|---|---|
| `bocaos.acta_asentada` | `acta-decisiones` | `salud-mercado` |
| `bocaos.acta_incompleta` | `hechos-reparto` | `regla-fallo` · `cargo-fallo` |
| `bocaos.acuse_recibido` | `canal-rider` | `propuesta` |
| `bocaos.aviso_cliente_entregado` | `aviso-cliente` | — (observabilidad: nadie lo consume a proposito) |
| `bocaos.aviso_cliente_fallido` | `aviso-cliente` | `cola-sala` |
| `bocaos.aviso_sala_entregado` | `aviso-sala` | — (observabilidad: nadie lo consume a proposito) |
| `bocaos.aviso_sala_vencido` | `aviso-sala` | `cola-sala` |
| `bocaos.aviso_tienda_entregado` | `aviso-tienda` | — (observabilidad: nadie lo consume a proposito) |
| `bocaos.aviso_tienda_fallido` | `aviso-tienda` | `cola-sala` |
| `bocaos.cargo_anotado` | `cargo-fallo` | `disputa-fallo` · `liquidacion` · `cobro-gestion` · `cuenta-parte` |
| `bocaos.cargo_sin_evidencia` | `cargo-fallo` | `cola-sala` |
| `bocaos.carrito_cerrado` | `carrito-tienda` | `pedido` |
| `bocaos.caso_cerrado` | `cola-sala` | `accion-sancion` |
| `bocaos.caso_encolado` | `cola-sala` | `aviso-sala` |
| `bocaos.censo_actualizado` | `censo-parte` | `escaparate` |
| `bocaos.censo_incompleto` | `censo-parte` | `cola-sala` |
| `bocaos.ciclo_abierto` | `liquidacion` | — (observabilidad: nadie lo consume a proposito) |
| `bocaos.cierre_semanal` | `liquidacion` | `factura-gestion` · `cobro-gestion` · `salud-mercado` · `cuenta-parte` |
| `bocaos.cliente_registrado` | `registro-cliente` | `pedido` |
| `bocaos.cobro_fallido` | `cobro-gestion` | `liquidacion` |
| `bocaos.cobro_realizado` | `cobro-gestion` | `cuenta-parte` |
| `bocaos.contrato_cerrado` | `contrato-puntual` | `estado-parte` · `ruta-viva` · `cuenta-parte` |
| `bocaos.contrato_creado` | `contrato-puntual` | `estado-parte` · `registro-cliente` · `aviso-cliente` · `ruta-viva` · `hechos-reparto` · `chat-enmascarado` |
| `bocaos.devengo_calculado` | `liquidacion` | `cuenta-parte` |
| `bocaos.dictamen_firmado` | `dictamen-revision` | `acta-decisiones` · `config-mercado` |
| `bocaos.disputa_abierta` | `disputa-fallo` | `cola-sala` |
| `bocaos.enlace_agotado` | `enlace` | `escalada-enlace` · `salud-mercado` · `cola-sala` |
| `bocaos.enlace_completado` | `enlace` | `salud-mercado` |
| `bocaos.escalada_agotada` | `escalada-enlace` | `pedido` · `cola-sala` |
| `bocaos.escalada_peldano` | `escalada-enlace` | `salud-mercado` |
| `bocaos.escalada_reintentar` | `escalada-enlace` | `enlace` |
| `bocaos.estado_parte_declarado` | `estado-parte` | `escaparate` · `foto-mercado` |
| `bocaos.factura_emitida` | `factura-gestion` | `cobro-gestion` |
| `bocaos.fallo_adjudicado` | `regla-fallo` | `cargo-fallo` |
| `bocaos.fallo_medido` | `regla-fallo` | `salud-mercado` |
| `bocaos.hecho_desmentido` | `hora-listo` | `enlace` · `regla-fallo` |
| `bocaos.hecho_reparto_anotado` | `hechos-reparto` | `registro-cliente` · `contrato-puntual` · `ruta-viva` · `regla-fallo` · `puntualidad-tienda` |
| `bocaos.hueco_nombrado` | `enlace` | `salud-mercado` |
| `bocaos.incentivo_subido` | `tarifa-pedido` | `enlace` |
| `bocaos.incidencia_abierta` | `incidencia-reparto` | `lectura-incidencia` · `cola-sala` |
| `bocaos.incidencia_clasificada` | `lectura-incidencia` | `cola-sala` |
| `bocaos.marca_declarada` | `marca-tienda` | `carta-publica` |
| `bocaos.medidas_calculadas` | `enlace` | `salud-mercado` |
| `bocaos.mensaje_entregado` | `chat-enmascarado` | — (observabilidad: nadie lo consume a proposito) |
| `bocaos.oferta_estipulada` | `tarifa-pedido` | `pedido` |
| `bocaos.oferta_subida` | `tarifa-pedido` | `enlace` · `escalada-enlace` |
| `bocaos.parte_sancionada` | `accion-sancion` | `estado-parte` |
| `bocaos.pedido_aceptado` | `pedido` | `hora-listo` · `aviso-tienda` · `aviso-cliente` |
| `bocaos.pedido_cancelado` | `pedido` | `aviso-tienda` · `aviso-cliente` |
| `bocaos.pedido_listo` | `hora-listo` | `aviso-cliente` · `enlace` · `puntualidad-tienda` |
| `bocaos.pedido_rechazado` | `pedido` | `aviso-tienda` · `cola-sala` |
| `bocaos.pedido_recibido` | `pedido` | `aviso-tienda` |
| `bocaos.politica_declarada` | `config-mercado` | `enlace` |
| `bocaos.posicion_anotada` | `ruta-viva` | `foto-mercado` |
| `bocaos.precio_cerrado` | `carrito-tienda` | `pedido` |
| `bocaos.promesa_guardada` | `ruta-viva` | `enlace` · `regla-fallo` |
| `bocaos.propuesta_aceptada` | `propuesta` | `contrato-puntual` · `enlace` |
| `bocaos.propuesta_acusada` | `propuesta` | `enlace` |
| `bocaos.propuesta_caducada_sin_acuse` | `propuesta` | `enlace` |
| `bocaos.propuesta_caducada_sin_respuesta` | `propuesta` | `enlace` · `escalada-enlace` |
| `bocaos.propuesta_emitida` | `propuesta` | `tarifa-pedido` · `canal-rider` · `panel-tienda` · `salud-mercado` |
| `bocaos.propuesta_entregada` | `canal-rider` | `propuesta` |
| `bocaos.propuesta_no_entregada` | `canal-rider` | `salud-mercado` |
| `bocaos.propuesta_rechazada` | `propuesta` | `enlace` · `escalada-enlace` |
| `bocaos.propuesta_redactada` | `redaccion-propuesta` | `propuesta` |
| `bocaos.prueba_anotada` | `hechos-reparto` | `cuenta-parte` |
| `bocaos.puntualidad_publicada` | `puntualidad-tienda` | `panel-tienda` |
| `bocaos.revision_solicitada` | `cola-sala` | `aviso-sala` · `dictamen-revision` |
| `bocaos.terminos_aceptados` | `terminos-parte` | `censo-parte` |
| `bocaos.tramos_declarados` | `contrato-tramos` | `liquidacion` |
| `bocaos.trayecto_cerrado` | `ruta-viva` | — (observabilidad: nadie lo consume a proposito) |

### 5.2 · Los pares request/response del cuello (los que importan)

| Quién pide | Qué pide | Quién responde |
|---|---|---|
| `hora-listo` (al declarar) | `bocaos.pedido_listo` | `enlace` arranca F |
| `enlace` | `foto-mercado.componer` / `.elegibles` | `foto-mercado` |
| `enlace` | `ruta-viva.paradas` / `puntualidad-tienda.medir` | `ruta-viva` / `puntualidad-tienda` |
| `enlace` | `propuesta.emitir` | `propuesta` (una viva por pedido) |
| `enlace` | `redaccion-propuesta.adornar` | `redaccion-propuesta` (o cae y usa A17) |
| `enlace` | `canal-rider.entregar` | `canal-rider` (acuse o retirada a 5 s) |
| `enlace` (al agotar) | `escalada-enlace.escalar` | `escalada-enlace` (3 peldaños) |
| `escalada-enlace` | `tarifa-pedido.subir` | `tarifa-pedido` (tope del cliente, autor humano) |
| `propuesta` (aceptada) | `contrato-puntual.crear` | `contrato-puntual` |
| `hechos-reparto` | `contrato-puntual.de` | `contrato-puntual` |
| `regla-fallo` | `hechos-reparto.acta` | `hechos-reparto` (completa o INCOMPLETA) |
| `cargo-fallo` | `cobro-gestion.revertir` | `cobro-gestion` (sólo si hay saldo) |
| `dictamen-revision` | `config-mercado.declarar` + `acta-decisiones.asentar` | `config-mercado` / `acta-decisiones` |

**Regla común:** si un aviso no llega, **el hecho ya está escrito**. El aviso es transporte; la verdad es el hecho. Un aviso perdido no puede hacer desaparecer un pedido, ni crear un contrato, ni cobrar nada.

---

## 6 · Máquina de estados (con dueño y con estado ilegal imposible)

### 6.1 · El pedido — dueño `pedido`

```
RECIBIDO ──(la tienda acepta, Q27)──► ACEPTADO ──(la tienda declara listo, C04)──► LISTO
   │                                     │                                        │
   │(rechaza, Q36)                       │(rechaza aun pagado)                    │(contrato creado)
   ▼                                     ▼                                        ▼
RECHAZADO (los gastos los paga quien provoco)                             EN_REPARTO ──(entrega + prueba)──► ENTREGADO
   └────────── cancelado (C07: quien y hasta cuando) ──────────────────────────┘
```
- **Estado ilegal imposible:** no hay `LISTO` sin `bocaos.pedido_aceptado` previo **y** un hecho con hora en `hora-listo`; no hay `EN_REPARTO` sin `bocaos.contrato_creado`; no hay `ENTREGADO` sin `bocaos.prueba_anotada` o su falta **declarada** (F02).
- **Un estado no se corrige: se avanza.** Si la tienda se equivocó de hora, se anota un hecho nuevo que desmiente el anterior y el pedido **se vuelve a medir**.

### 6.2 · La propuesta — dueño `propuesta` (dos relojes, cinco desenlaces)

```
EMITIDA (validez 20 s) ──acuse (≤5 s)──► ACUSADA (decision 10 s) ──si──► ACEPTADA ──► contrato puntual
   │                                        │──── rechazo ────► RECHAZADA      (sin coste, A21)
   │──── sin acuse en 5 s ─────────────────► CADUCADA_SIN_ACUSE   (el canal fallo, no el rider)
   └──── validez vencida ──────────────────► CADUCADA_SIN_RESPUESTA (el rider no contesto)
```
- **Un solo desenlace.** El segundo que llega recibe `YA_NO_ESTA` y **no paga nada**. Es el mismo «sin coste» de A21, no una pieza nueva.
- **Las dos caducidades no son la misma cosa** (Q42): una es un fallo de transporte, la otra es un no. La métrica `aceptadas/emitidas` se mide sobre EMITIDAS; la calidad del canal, sobre ACUSADAS.

### 6.3 · El contrato puntual — dueño `contrato-puntual`

```
VIVO (parada pendiente en B02) ──hecho de entrega──► CERRADO (la parada desaparece y deja de proyectarse)
```
Sin turno, sin jornada, sin compromiso con el siguiente pedido: si tuviera duración, el negocio sería otro.

### 6.4 · El cargo por fallo — dueño `cargo-fallo`

```
MEDIDO (G02, hechos con hora) ──tabla (G03)──► ADJUDICADO (quien, no cuanto) ──evidencia (G06)──► DEUDA
   │                                                                                          │
   └── acta incompleta (Q30) ──► NO HAY CARGO (se retira)                                     ├─ paga ──► COBRADA (transfer_reversal, Q29)
                                                                                              └─ disputa ──► caso en cola ──► dictamen firmado
```
Una deuda **nunca** se convierte en un descuento: Bocaos no retiene, así que no puede descontar de un dinero que no tiene.

### 6.5 · El ciclo semanal — dueño `liquidacion`

```
ABIERTO ──cerrar──► CERRADO (inmutable) ──► factura (H03) ──► cobro (H04) ──fallido──► mora (H05: recordatorio → recargo → suspension)
```
Un periodo cerrado no se reabre; una corrección posterior es una nota en el periodo siguiente. La suspensión corta la **entrada** de pedidos nuevos, nunca los pedidos en vuelo.

### 6.6 · El caso de la cola — dueño `cola-sala`

```
ENCOLADO ──atender──► (dictamen | cargo | alta completada = el hecho que lo cierra) ──► CERRADO
    └── vence el plazo (O03) ──► sube de prioridad y SIGUE VIVO
```
Un caso no se cierra porque alguien lo borre, y una solicitud vencida no se resuelve sola: sería un automatismo con reloj.

---

## 7 · Las respuestas cerradas, una por una, y dónde aterrizan

| Q | Respuesta del dueño | Hoja donde vive |
|---|---|---|
| Q23 | sólo de la coordinación | `terminos-parte` (los términos lo dicen), `hechos-reparto` (se puede probar), `regla-fallo` (se adjudica con regla escrita) |
| Q24 | la prueba es el acta · 48 h · se disputa la regla | `hechos-reparto._acta` · `disputa-fallo` · `dictamen-revision` |
| Q25 | revisión humana desde el día uno | `cola-sala.revisar` (O03) + `dictamen-revision` |
| Q26 | firma el dueño · cambia la regla, no el caso | `dictamen-revision._prohibido` (rehacer la propuesta = 409) + `acta-decisiones` + `config-mercado` |
| Q27 | la tienda acepta el pedido | `pedido.aceptar` |
| Q28 | 8 / 5 / 10 min | `config-mercado._tres_esperas` (G01) → `regla-fallo._aplicar` |
| Q29 | `transfer_reversal` por Stripe · el cobro semanal da colchón | `cobro-gestion._revertir` · `cargo-fallo._efectivo` · `liquidacion` (semanal, no por comodidad) |
| Q30 | los eventos son la prueba; si falta, acta incompleta y se retira el cargo | `hechos-reparto._completa` → `regla-fallo` no mide → no hay cargo |
| Q31 | sí se enlazan pedidos de tiendas distintas | `ruta-viva._ordenar` (entre paradas, nunca entre rutas) · `puntualidad-tienda._por_tienda` (el histórico es de cada una) |
| Q32 | ninguna consecuencia por cocina lenta | `hora-listo`: si no hay `bocaos.pedido_listo`, no hay oferta. No existe módulo sancionador de cocina |
| Q33 | mínimo de volumen, tiempo y distancia | `ruta-viva._capacidad` |
| Q34 | Stripe KYC · documentos · antigüedad 0 | `censo-parte._alta` (documentos) + `_elegibles_declarados` (sin antigüedad) |
| Q35 | sin exclusividad | `censo-parte._sin_exclusividad` (M03) |
| Q36 | puede rechazar pagado · los gastos los paga quien falla | `pedido.rechazar` + `_puede_cancelar` |
| Q37 | cerca = TIEMPO + distancia por consumo | `enlace._desvio` (minutos) + `_cobra` (€ de consumo con 0,140 €/km) |
| Q38 | traza 90 días | `hechos-reparto` (retención declarada) · `ruta-viva._posicion` (un punto, no traza) |
| Q39 | el pedido nace en WhatsApp; la carta digital ya lo manda | `pedido` suscribe `whatsapp.pedido.detectado` (evento real de `whatsapp-bot`) y `tienda.pedido.recibido`; el desglose va en el mismo mensaje |
| Q40 | agentes, no sala humana | `aviso-sala._plazo` (destinatario por defecto: agente) + `escalada-enlace` (peldaño 2 sin persona) |
| Q41 | 0,140 €/km · 0,257 €/min · umbral = margen > 0 | `config-mercado._coste_rider` → `enlace._cobra` |
| Q42 | dos relojes: 20 s validez · 10 s decisión · 5 s acuse | `propuesta._abrir` / `._vencer` + `canal-rider._acuse` |
| Q43 | escalada 3 peldaños, tope del cliente | `escalada-enlace._peldano` + `tarifa-pedido._subir` (tope autorizado al pedir) |

---

## 8 · Los 11 flujos del diseño, en hojas

1. **El enlace por pedido (el producto, 8 pasos)** — `hora-listo` (①) → `enlace`: foto ② + filtro ③ + medidas ④ + comparación ⑤ → `propuesta.emitir` (⑥) → `canal-rider` → tres desenlaces ⑦ → `escalada-enlace` (⑧).
2. **El pedido, de la carta a «listo»** — `carta-publica` → `carrito-tienda` → `pedido.alta` (+ oferta E01) → `aviso-tienda` → `pedido.transitar` → `aviso-cliente` → `hora-listo.declarar`.
3. **El reparto medido** — `contrato-puntual.crear` → `ruta-viva.promesa` → `hechos-reparto.anotar` (recogida, llegada, entrega) + `chat-enmascarado` + `registro-cliente.mostrar` → `hechos-reparto.prueba` → `ruta-viva.cerrar`. Si algo falla: `incidencia-reparto` → `lectura-incidencia` → `cola-sala`.
4. **El fallo: medir, no juzgar** — `config-mercado` (las N) → `regla-fallo.medir` → `.aplicar` → `.trazar` → `cargo-fallo.anotar` → (paga con `cobro-gestion.revertir` | disputa con `disputa-fallo` → `cola-sala` → `dictamen-revision`).
5. **La liquidación semanal (el único dinero)** — `scheduler` → `liquidacion.abrir` → `devengo` → `cerrar` → `factura-gestion.emitir` → `cobro-gestion.cobrar` → si falla, `liquidacion.mora`.
6. **El alta de una parte** — `censo-parte.alta` → `checklist` → `terminos-parte.aceptar` (sin esto no hay propuesta ni devengo). Rider: Stripe KYC + documentos (Q34). Tienda: sin exclusividad (Q35).
7. **El cambio de criterio** — `config-mercado.simular` → `SolicitudDecision` (D5) → `acta-decisiones.asentar` **junto con** `config-mercado.declarar` → `_politica_vigente` cita la versión.
8. **La revisión humana** — `cola-sala.revisar` → `propuesta.reproducir` + `enlace.reproducir` (el humano ve lo mismo que vio el sistema) → `dictamen-revision.dictaminar` → efecto permitido (compensar · corregir histórico · cambiar la regla **hacia adelante**).
9. **El bucle del rider** — enlaza → su promesa se cumple o se rompe (`ruta-viva._promesa` / `hechos-reparto`) → si se rompe, el umbral de retraso no le deja enlazar igual → rechaza libremente (`enlace._rechazo`), declara pausa (`estado-parte`), declara zona (`censo-parte.zona`), y ve por qué le llegó (`propuesta.vista`).
10. **La escalada sin sala (Q43)** — `enlace` agota el tope → `escalada-enlace`: peldaño 1 (2 candidatos, 10 s c/u) → peldaño 2 (**todos** los activos del barrio, 30 s) → peldaño 3 (subir por escalones hasta el tope del cliente) → 5 min sin coger: `pedido.cancelar` **avisado antes de pedir**.
11. **Los dos relojes (Q42)** — `propuesta.emitir` (validez 20 s) → `canal-rider.entregar` → acuse → `propuesta.acusar` (decisión 10 s) → sí/no → `_cerrar`; sin acuse en 5 s: `_vencer` → `caduca_sin_acuse`.

---

## 9 · Los 11 puertos del diseño y quién los cumple

Ninguno de los 11 nombra un producto, un proveedor ni una técnica. La vertical **pide**; si el sitio no lo cumple, se cambia la pieza de fuera, no la clase.

| Puerto | Exige | Quién lo cumple |
|---|---|---|
| Reloj | una sola hora para todo el mercado | el bus (ISO en cada evento) + `_shared`; ninguna hoja usa reloj propio |
| Tienda | entregar el pedido · recibir «listo» con hora · publicar catálogo y estado | `aviso-tienda` (C03) · `hora-listo.declarar` · `carta-publica` + `estado-parte` |
| Cliente | avisos SIN marca de Bocaos | `aviso-cliente` (K02 en la salida) |
| Rider | entregar en menos de la ventana y devolver sí/no/silencio con hora | `canal-rider` (M04 + acuse Q42) |
| Posición | un punto con hora y frescura consultable | `ruta-viva.posicion` (B01) |
| Ruta | metros/minutos y la inserción de una parada en una ruta | proveedor declarado por el proyecto, invocado por `enlace` (Q37: tiempo principal) |
| Cobro | cobrar a una parte, por su canal, el importe de SU documento | `cobro-gestion` (H04 sobre `pago-gateway`) |
| Prueba | guardar una prueba con hora, y decir si no la hay | `hechos-reparto.prueba` (F02) |
| Sala | entregar un caso con su traza y admitir un plazo | `aviso-sala` (I07, agente por defecto) |
| Catálogo | una única fuente por tienda, consultable | `carta-publica` (proyecta, no guarda) |
| Documento | emitir un documento con importes, periodo y parte | `factura-gestion` (H03) |

> **El puerto Ruta es el único sin hoja propia** y es deliberado: en el diseño no hay clase para él (§5 lo declara puerto, no pieza). La vertical invoca `ruta.calcular.request` / `ruta.insertar.request` contra el proveedor que el proyecto declare; si no contesta, `A05`/`A06` devuelven `NO_CONSTA`, el candidato va a `A34` y el mercado **no propone** en vez de proponer con metros inventados.

---

## 10 · Las 12 invariantes → la hoja que las sostiene

| # | Renuncia | Guarda (clase) | Hoja |
|---|---|---|---|
| 1 | No asigna | A27 | `propuesta.revisar` |
| 2 | No decide en bloque | A28 | `enlace.guardas` |
| 3 | La decisión es reproducible | A29 | `propuesta.reproducir` + `enlace.reproducir` |
| 4 | No agrupa clientes | A30 | `enlace.guardas` |
| 5 | El enlace no rompe la promesa | A31 | `enlace.guardas` + `ruta-viva._promesa` |
| 6 | El ahorro no es de Bocaos | A32 | `liquidacion._no_captura_ahorro` |
| 7 | Una propuesta, un pedido | A33 | `propuesta._emitir` (por construcción) |
| 8 | El rechazo no cuesta | A22 | `enlace.guardas` |
| 9 | No ordena el mercado | D07 | `escaparate.neutralidad` |
| 10 | No cobra el ticket ni retiene | H06 | `liquidacion._no_retencion` |
| 11 | El cliente es de la tienda | L02 + K02 | `registro-cliente._cruza` + `aviso-cliente._sin_marca` |
| 12 | El rider es autónomo | M03 | `censo-parte._sin_exclusividad` |

**Lo que este plano prohíbe construir** (y la guarda que lo detecta): un planificador (A28), un scorer que filtre (A22/A28), una predicción de cocina (C04: sólo se declara), un agente que adjudique (G03 es tabla), un contador de rechazos en la elegibilidad (A22), una nota al rider (A22), una app de cliente (K02), un carrito o registro compartido entre tiendas (L02), un ranking o posición comprada (D07), un cobro en nombre de otro (H06), una asignación «suave» (A27), una estimación de lo que falta (A34).

---

## 11 · Las hojas (plantilla de 7 etapas)

Cada bloque lleva: clases que materializa · propósito · dependencias · **A** dependencias · **B** `module.json` · **C** `index.js` · **D** proyecciones internas · **E** handlers RPC con su CLASE (ORDEN = superficie, PREGUNTA = bus) · **F** eventos · VERIFICACIÓN · y por qué no reutiliza.

### ▸ EJE `politica` — lo que declara el proyecto (3)

#### `scheduler` · `MICRO-AGENTE` · acción **REUTILIZAR**

- **Clases:** — (primitiva de Enki, sin clase del diseño)
- **Propósito:** Primitiva real de Enki: dispara el cierre semanal del ciclo de coordinacion. No se construye ni se toca.
- **Depende de:** — (raíz)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `scheduler`
- **B · module.json:** `name: "scheduler"` · `subscribes:` [] · `publishes:` []
- **C · index.js:** — (no se construye: se usa el módulo real tal cual)
- **D · proyecciones internas:** —
- **F · hechos que publica:** — (ninguno: sólo calcula)
- **Escucha (dominio):** —
- **VERIFICACIÓN:** module.json real intacto; job `bocaos.ciclo_semanal` creado por liquidacion en project.activated y disparando `scheduler.job.triggered`.
- **NO REUTILIZA / DECISIÓN:** REUTILIZAR el module.json real de `scheduler` (v1.0.0): publica `scheduler.job.triggered` con el nombre del job en el payload; `liquidacion` filtra `bocaos.ciclo_semanal`. Su config declara timezone Europe/Madrid y jobs en disco. No se le pone ningun valor de negocio dentro.

#### `acta-decisiones` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** O02
- **Propósito:** Custodio del acta: ningun cambio de regla se escribe sin acta; el acta no se corrige, se superpone.
- **Depende de:** — (raíz)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "acta-decisiones"` · `subscribes:` ["acta-decisiones.asentar.request", "acta-decisiones.listar.request", "bocaos.dictamen_firmado", "project.activated"] · `publishes:` ["acta-decisiones.asentar.response", "acta-decisiones.asentar.failed", "acta-decisiones.listar.response", "acta-decisiones.listar.failed", "bocaos.acta_asentada"]
- **C · index.js:** `class ActaDecisiones extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/acta-decisiones.json` por proyecto.
- **D · proyecciones internas:** `_asentar` (O02: append-only; si el motivo era falso se asienta otra acta que lo dice) · `_de_instante` (O02: que estaba vigente entonces, para explicar una decision vieja)
- **E · handler:** `onAsentarRequest(e) → this._atender(e,'asentar','acta-decisiones.asentar.response', d=>this._asentar(d))` · **CLASE: ORDEN** — O02: asienta cambio+motivo+autor+vigencia; el cambio y el acta se escriben juntos o no hay cambio
- **E · handler:** `onListarRequest(e) → this._atender(e,'listar','acta-decisiones.listar.response', d=>this._listar(d))` · **CLASE: PREGUNTA** — O02: lee el acta de un periodo (la lee el cuadro del mercado)
- **F · hechos que publica:** `bocaos.acta_asentada`
- **Escucha (dominio):** `bocaos.dictamen_firmado`
- **VERIFICACIÓN:** dos actas consecutivas sobre el mismo asunto; la primera no cambia; `bocaos.acta_asentada` con autor y desde.

#### `config-mercado` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** J01 · J02 · J03 · J04 · J05 · G01
- **Propósito:** La POLITICA del proyecto: cuatro umbrales, ventana, zonas, las tres N de la espera, orden de candidatos y coste del rider. Toda version con vigencia y autor; ninguna sin acta.
- **Depende de:** `acta-decisiones`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "config-mercado"` · `subscribes:` ["config-mercado.declarar.request", "config-mercado.politica.request", "config-mercado.simular.request", "bocaos.dictamen_firmado", "project.activated"] · `publishes:` ["config-mercado.declarar.response", "config-mercado.declarar.failed", "config-mercado.politica.response", "config-mercado.politica.failed", "config-mercado.simular.response", "config-mercado.simular.failed", "bocaos.politica_declarada"]
- **C · index.js:** `class ConfigMercado extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/config-mercado.json` por proyecto.
- **D · proyecciones internas:** `_politica_vigente` (J04: busca por (zona, instante) entre versiones; sin version -> NO_CONSTA) · `_forma` (J01: la vertical fija CUATRO umbrales, esas unidades y AND; aqui solo viven los valores) · `_tres_esperas` (G01: N1 tienda 8 min, N2 portal 5 min, N3 entrega 10 min (Q28), provisionales) · `_coste_rider` (Q41: 0,140 EUR/km por vehiculo declarado y EUR/min DERIVADO del reparto medio de la zona) · `_simular` (J05: re-ejecuta la comparacion sobre hechos historicos; declara sus propios limites)
- **E · handler:** `onDeclararRequest(e) → this._atender(e,'declarar','config-mercado.declarar.response', d=>this._declarar(d))` · **CLASE: ORDEN** — J01/J02/J03/G01: nueva version de la politica con autor, vigencia y acta
- **E · handler:** `onPoliticaRequest(e) → this._atender(e,'politica','config-mercado.politica.response', d=>this._politica(d))` · **CLASE: PREGUNTA** — J04: la politica que estaba VIVA en ese instante y esa zona, no la de hoy
- **E · handler:** `onSimularRequest(e) → this._atender(e,'simular','config-mercado.simular.response', d=>this._simular(d))` · **CLASE: PREGUNTA** — J05: recalcula con los numeros del proyecto sobre hechos ya escritos; no aplica
- **Sube (pide a otras hojas):** `acta-decisiones.asentar.request`
- **F · hechos que publica:** `bocaos.politica_declarada`
- **Escucha (dominio):** `bocaos.dictamen_firmado`
- **VERIFICACIÓN:** declarar v1 -> cambiar un umbral -> declarar v2; `politica(instante_de_v1)` devuelve v1. Sin acta, declarar devuelve 409 y no escribe.

### ▸ EJE `partes` — censo, escaparate, pedido y canales (12)

#### `censo-parte` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** I01 · I02 · M02 · M03 · P04
- **Propósito:** Censo del mercado: que tienda y que rider existen para el mercado, con lo que acreditan y la zona que declaran. Un rider a medias NO entra.
- **Depende de:** `config-mercado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`, `credential-manager`
- **B · module.json:** `name: "censo-parte"` · `subscribes:` ["censo-parte.alta.request", "censo-parte.checklist.request", "censo-parte.de.request", "censo-parte.zona.request", "bocaos.terminos_aceptados", "project.activated"] · `publishes:` ["censo-parte.alta.response", "censo-parte.alta.failed", "censo-parte.checklist.response", "censo-parte.checklist.failed", "censo-parte.de.response", "censo-parte.de.failed", "censo-parte.zona.response", "censo-parte.zona.failed", "bocaos.censo_actualizado", "bocaos.censo_incompleto"]
- **C · index.js:** `class CensoParte extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/censo-parte.json` por proyecto.
- **D · proyecciones internas:** `_alta` (I01/I02: identidad fiscal, marca, catalogo (tienda) / identidad Stripe KYC, autonomo, seguro, vehiculo (rider) Q34) · `_checklist` (P04: lista derivada del alta y de lo que el proyecto exige; sin criterios ocultos) · `_sin_exclusividad` (M03: falla si aparece exclusividad, permanencia, turno, cuota minima o antiguedad) · `_elegibles_declarados` (A04: estado, zona y capacidad. Ni un cuarto dato. Sin antiguedad (Q34: 0))
- **E · handler:** `onAltaRequest(e) → this._atender(e,'alta','censo-parte.alta.response', d=>this._alta(d))` · **CLASE: ORDEN** — I01/I02: alta de tienda o rider -> Censo | INCOMPLETA(checklist)
- **E · handler:** `onChecklistRequest(e) → this._atender(e,'checklist','censo-parte.checklist.response', d=>this._checklist(d))` · **CLASE: PREGUNTA** — P04: que falta para el alta, derivado, sin memoria
- **E · handler:** `onDeRequest(e) → this._atender(e,'de','censo-parte.de.response', d=>this._de(d))` · **CLASE: PREGUNTA** — I01/I02: ficha declarada de una parte
- **E · handler:** `onZonaRequest(e) → this._atender(e,'zona','censo-parte.zona.response', d=>this._zona(d))` · **CLASE: ORDEN** — M02: el rider declara sus zonas y las cambia cuando quiere
- **Sube (pide a otras hojas):** `credential-manager.* (KYC Stripe, alta de la cuenta conectada)`
- **F · hechos que publica:** `bocaos.censo_actualizado`, `bocaos.censo_incompleto`
- **Escucha (dominio):** `bocaos.terminos_aceptados`
- **VERIFICACIÓN:** alta de rider sin seguro -> INCOMPLETA con checklist; el rider no aparece en A04; guarda M03 en verde con un alta normal.

#### `estado-parte` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** I03 · I04
- **Propósito:** Estado vivo de cada parte: abierta/cerrada/saturada y disponible/ocupado/en pausa. La pausa la declara EL, siempre.
- **Depende de:** `censo-parte`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "estado-parte"` · `subscribes:` ["estado-parte.declarar.request", "estado-parte.de.request", "estado-parte.vigentes.request", "bocaos.contrato_creado", "bocaos.contrato_cerrado", "bocaos.parte_sancionada", "project.activated"] · `publishes:` ["estado-parte.declarar.response", "estado-parte.declarar.failed", "estado-parte.de.response", "estado-parte.de.failed", "estado-parte.vigentes.response", "estado-parte.vigentes.failed", "bocaos.estado_parte_declarado"]
- **C · index.js:** `class EstadoParte extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/estado-parte.json` por proyecto.
- **D · proyecciones internas:** `_transitar` (I04: 'ocupado' no lo pone la sala, lo pone el contrato vivo; la pausa solo la declara el rider) · `_vigentes` (I03/I04: disponibles por zona; el que esta en pausa no aparece y nadie puede levantarla)
- **E · handler:** `onDeclararRequest(e) → this._atender(e,'declarar','estado-parte.declarar.response', d=>this._declarar(d))` · **CLASE: ORDEN** — I03/I04: la parte declara su estado, con hora
- **E · handler:** `onDeRequest(e) → this._atender(e,'de','estado-parte.de.response', d=>this._de(d))` · **CLASE: PREGUNTA** — I03/I04: estado vigente de una parte
- **E · handler:** `onVigentesRequest(e) → this._atender(e,'vigentes','estado-parte.vigentes.response', d=>this._vigentes(d))` · **CLASE: PREGUNTA** — A02: riders disponibles ahora (la foto del instante)
- **F · hechos que publica:** `bocaos.estado_parte_declarado`
- **Escucha (dominio):** `bocaos.contrato_creado`, `bocaos.contrato_cerrado`, `bocaos.parte_sancionada`
- **VERIFICACIÓN:** la sala intenta declarar pausa a un rider -> 403; contrato creado -> ocupado; contrato cerrado -> disponible.

#### `terminos-parte` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** I08
- **Propósito:** Lo que cada parte acepto, con version y hora. Sin terminos vigentes no hay propuesta ni devengo para esa parte.
- **Depende de:** `censo-parte`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "terminos-parte"` · `subscribes:` ["terminos-parte.aceptar.request", "terminos-parte.vigentes.request", "project.activated"] · `publishes:` ["terminos-parte.aceptar.response", "terminos-parte.aceptar.failed", "terminos-parte.vigentes.response", "terminos-parte.vigentes.failed", "bocaos.terminos_aceptados"]
- **C · index.js:** `class TerminosParte extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/terminos-parte.json` por proyecto.
- **D · proyecciones internas:** `_aceptar` (I08: cambio de terminos NO retroactivo; quien no acepta la nueva sigue con la vieja) · `_vigentes` (I08: puerta dura: sin terminos, propuesta y devengo devuelven NO_CONSTA)
- **E · handler:** `onAceptarRequest(e) → this._atender(e,'aceptar','terminos-parte.aceptar.response', d=>this._aceptar(d))` · **CLASE: ORDEN** — I08: la parte acepta una version, con hora
- **E · handler:** `onVigentesRequest(e) → this._atender(e,'vigentes','terminos-parte.vigentes.response', d=>this._vigentes(d))` · **CLASE: PREGUNTA** — I08: version vigente para la parte en un instante
- **F · hechos que publica:** `bocaos.terminos_aceptados`
- **Escucha (dominio):** —
- **VERIFICACIÓN:** parte sin terminos -> `enlace` no la propone y `liquidacion` no le devenga; aceptar v2 no reescribe v1.

#### `marca-tienda` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** D01
- **Propósito:** Quien firma el escaparate: la tienda. No existe campo donde poner la marca de Bocaos.
- **Depende de:** `censo-parte`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "marca-tienda"` · `subscribes:` ["marca-tienda.declarar.request", "marca-tienda.de.request", "project.activated"] · `publishes:` ["marca-tienda.declarar.response", "marca-tienda.declarar.failed", "marca-tienda.de.response", "marca-tienda.de.failed", "bocaos.marca_declarada"]
- **C · index.js:** `class MarcaTienda extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/marca-tienda.json` por proyecto.
- **D · proyecciones internas:** `_declarar` (D01: el titular es la tienda; una tienda no puede firmar con la marca de otra) · `_de` (D01: devuelve NO_CONSTA si no ha declarado; no se rellena con una marca por defecto)
- **E · handler:** `onDeclararRequest(e) → this._atender(e,'declarar','marca-tienda.declarar.response', d=>this._declarar(d))` · **CLASE: ORDEN** — D01: la tienda declara nombre, signos, tono y titular
- **E · handler:** `onDeRequest(e) → this._atender(e,'de','marca-tienda.de.response', d=>this._de(d))` · **CLASE: PREGUNTA** — D01: la marca de una tienda | NO_CONSTA
- **F · hechos que publica:** `bocaos.marca_declarada`
- **Escucha (dominio):** —
- **VERIFICACIÓN:** marca de la tienda A no aparece en el escaparate de la B; sin declarar -> NO_CONSTA.

#### `escaparate` · `REFLEJO` · acción **CONSTRUIR**

- **Clases:** D06 · D07
- **Propósito:** La plaza: indice de escaparates derivado del censo, sin orden de preferencia. Guarda de neutralidad.
- **Depende de:** `censo-parte`, `estado-parte`, `carta-publica`, `marca-tienda`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`
- **B · module.json:** `name: "escaparate"` · `subscribes:` ["escaparate.plaza.request", "escaparate.neutralidad.request", "bocaos.censo_actualizado", "bocaos.estado_parte_declarado", "project.activated"] · `publishes:` ["escaparate.plaza.response", "escaparate.plaza.failed", "escaparate.neutralidad.response", "escaparate.neutralidad.failed"]
- **C · index.js:** `class Escaparate extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_plaza` (D06: proyeccion del censo; no se escribe, no guarda posiciones) · `_ordena` (D07: sin ranking, sin destacados, sin prioridad comprada; ningun campo permite pagar por posicion)
- **E · handler:** `onPlazaRequest(e) → this._atender(e,'plaza','escaparate.plaza.response', d=>this._plaza(d))` · **CLASE: PREGUNTA** — D06: censo de tiendas abiertas -> lista de escaparates
- **E · handler:** `onNeutralidadRequest(e) → this._atender(e,'neutralidad','escaparate.neutralidad.response', d=>this._neutralidad(d))` · **CLASE: PREGUNTA** — D07: revisa el orden mostrado; falla si hay ranking o posicion comprada
- **Sube (pide a otras hojas):** `censo-parte.de.request`, `estado-parte.de.request`, `marca-tienda.de.request`
- **F · hechos que publica:** — (ninguno: sólo calcula)
- **Escucha (dominio):** `bocaos.censo_actualizado`, `bocaos.estado_parte_declarado`
- **VERIFICACIÓN:** la plaza devuelve N tiendas en orden declarado y neutro; guarda D07 en verde con un campo `orden: destacado` inyectado (debe fallar).

#### `carta-publica` · `CONVERSOR` · acción **CONSTRUIR**

- **Clases:** D02
- **Propósito:** Una sola fuente: proyecta el catalogo de la tienda a carta publica podada. NO guarda una segunda carta.
- **Depende de:** `censo-parte`, `marca-tienda`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`
- **B · module.json:** `name: "carta-publica"` · `subscribes:` ["carta-publica.proyectar.request", "bocaos.marca_declarada", "project.activated"] · `publishes:` ["carta-publica.proyectar.response", "carta-publica.proyectar.failed"]
- **C · index.js:** `class CartaPublica extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_proyectar` (D02: el orden de la carta es el de la tienda, no el de Bocaos) · `_podar` (D02: podar = publicar/quitar disponibilidad; nunca 'destacar')
- **E · handler:** `onProyectarRequest(e) → this._atender(e,'proyectar','carta-publica.proyectar.response', d=>this._proyectar(d))` · **CLASE: PREGUNTA** — D02: catalogo interno de la tienda -> carta publica podada (que se publica, en que orden, con que disponibilidad)
- **Sube (pide a otras hojas):** `censo-parte.de.request`, `marca-tienda.de.request`
- **F · hechos que publica:** — (ninguno: sólo calcula)
- **Escucha (dominio):** `bocaos.marca_declarada`
- **VERIFICACIÓN:** dos tiendas en el mismo proyecto devuelven dos cartas distintas sin copia persistida (ningun fichero de carta en el modulo).
- **NO REUTILIZA / DECISIÓN:** Se evaluo REUTILIZAR `pizzepos/carta-digital` y NO encaja: proyecta LA carta activa DEL PROYECTO (una tienda por proyecto), y un mercado Bocaos tiene N tiendas en un proyecto. Tampoco `pizzepos/productos` (proyector POS de una carta unica). Se construye el conversor con el puerto Catalogo por tienda.

#### `carrito-tienda` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** D04 · D03
- **Propósito:** Buffer de compra por cliente y tienda. Al cerrar se convierte en pedido con el precio cerrado y desaparece.
- **Depende de:** `carta-publica`, `tarifa-pedido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "carrito-tienda"` · `subscribes:` ["carrito-tienda.anadir.request", "carrito-tienda.quitar.request", "carrito-tienda.ver.request", "carrito-tienda.cerrar.request", "project.activated"] · `publishes:` ["carrito-tienda.anadir.response", "carrito-tienda.anadir.failed", "carrito-tienda.quitar.response", "carrito-tienda.quitar.failed", "carrito-tienda.ver.response", "carrito-tienda.ver.failed", "carrito-tienda.cerrar.response", "carrito-tienda.cerrar.failed", "bocaos.precio_cerrado", "bocaos.carrito_cerrado"]
- **C · index.js:** `class CarritoTienda extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/carrito-tienda.json` por proyecto.
- **D · proyecciones internas:** `_anadir` (D04: un carrito por (cliente, tienda); no existe 'carrito del mercado') · `_precio_cerrado` (D03: todo en centimos y cerrado ANTES de pagar, con desglose interno siempre) · `_cerrar` (D04: un carrito cerrado que sigue vivo es un pedido que se puede cobrar dos veces; se destruye)
- **E · handler:** `onAnadirRequest(e) → this._atender(e,'anadir','carrito-tienda.anadir.response', d=>this._anadir(d))` · **CLASE: ORDEN** — D04: anade linea al carrito de ESE cliente en ESA tienda
- **E · handler:** `onQuitarRequest(e) → this._atender(e,'quitar','carrito-tienda.quitar.response', d=>this._quitar(d))` · **CLASE: ORDEN** — D04: quita linea
- **E · handler:** `onVerRequest(e) → this._atender(e,'ver','carrito-tienda.ver.response', d=>this._ver(d))` · **CLASE: PREGUNTA** — D04: el carrito vivo con su desglose
- **E · handler:** `onCerrarRequest(e) → this._atender(e,'cerrar','carrito-tienda.cerrar.response', d=>this._cerrar(d))` · **CLASE: ORDEN** — D03/D04: cierra el precio (comida+reparto+incentivo) y convierte en pedido
- **Sube (pide a otras hojas):** `tarifa-pedido.precio.request`, `carta-publica.proyectar.request`, `registro-cliente.de.request`
- **F · hechos que publica:** `bocaos.precio_cerrado`, `bocaos.carrito_cerrado`
- **Escucha (dominio):** —
- **VERIFICACIÓN:** dos clientes con carrito en dos tiendas no se mezclan; cerrar deja precio con desglose y el carrito desaparece.
- **NO REUTILIZA / DECISIÓN:** Se evaluo `prisma/carrito` (buffer universal del POS): es el buffer del proyecto (un comercio), no por (cliente, tienda) dentro de un mercado multi-tienda. Se construye.

#### `registro-cliente` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** D05 · F05 · L02
- **Propósito:** El cliente es DE LA TIENDA, aislado por tienda. Aqui viven tambien sus instrucciones de acceso.
- **Depende de:** `censo-parte`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "registro-cliente"` · `subscribes:` ["registro-cliente.alta.request", "registro-cliente.de.request", "registro-cliente.instrucciones.request", "registro-cliente.mostrar.request", "bocaos.contrato_creado", "bocaos.hecho_reparto_anotado", "project.activated"] · `publishes:` ["registro-cliente.alta.response", "registro-cliente.alta.failed", "registro-cliente.de.response", "registro-cliente.de.failed", "registro-cliente.instrucciones.response", "registro-cliente.instrucciones.failed", "registro-cliente.mostrar.response", "registro-cliente.mostrar.failed", "bocaos.cliente_registrado"]
- **C · index.js:** `class RegistroCliente extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/registro-cliente.json` por proyecto.
- **D · proyecciones internas:** `_alta` (D05: aislamiento por tienda; sin identidad unica entre tiendas ni 'cliente del mercado') · `_cruza` (L02: falla si un cliente de una tienda aparece en otra, ni por identidad ni en un agregado) · `_mostrar` (F05: el dato sigue escrito; lo que se apaga es la visibilidad al cerrar el contrato) · `_instrucciones` (F05: dato personal del cliente del cliente; no entra en ningun historico de tienda)
- **E · handler:** `onAltaRequest(e) → this._atender(e,'alta','registro-cliente.alta.response', d=>this._alta(d))` · **CLASE: ORDEN** — D05: alta de cliente en una tienda (el invitado tambien es de una tienda)
- **E · handler:** `onDeRequest(e) → this._atender(e,'de','registro-cliente.de.response', d=>this._de(d))` · **CLASE: PREGUNTA** — D05: ficha del cliente en esa tienda | NO_CONSTA
- **E · handler:** `onInstruccionesRequest(e) → this._atender(e,'instrucciones','registro-cliente.instrucciones.response', d=>this._instrucciones(d))` · **CLASE: ORDEN** — F05: el cliente escribe portal, piso e indicaciones
- **E · handler:** `onMostrarRequest(e) → this._atender(e,'mostrar','registro-cliente.mostrar.response', d=>this._mostrar(d))` · **CLASE: PREGUNTA** — F05: instrucciones al rider del contrato VIVO; al entregar dejan de mostrarse
- **Sube (pide a otras hojas):** `contrato-puntual.de.request`, `hechos-reparto.acta.request`
- **F · hechos que publica:** `bocaos.cliente_registrado`
- **Escucha (dominio):** `bocaos.contrato_creado`, `bocaos.hecho_reparto_anotado`
- **VERIFICACIÓN:** cliente de la tienda A no resuelve en la B (404, no vacio); instrucciones desaparecen al anotar la entrega.

#### `pedido` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** C01 · C02 · C07 · C05
- **Propósito:** El pedido del mercado: nace con precio cerrado y oferta congelada, avanza solo con hechos con hora y la tienda lo acepta.
- **Depende de:** `carrito-tienda`, `registro-cliente`, `tarifa-pedido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "pedido"` · `subscribes:` ["pedido.alta.request", "pedido.aceptar.request", "pedido.rechazar.request", "pedido.transitar.request", "pedido.cancelar.request", "pedido.ver.request", "pedido.estado_visible.request", "whatsapp.pedido.detectado", "tienda.pedido.recibido", "bocaos.precio_cerrado", "bocaos.carrito_cerrado", "bocaos.cliente_registrado", "bocaos.oferta_estipulada", "bocaos.escalada_agotada", "project.activated"] · `publishes:` ["pedido.alta.response", "pedido.alta.failed", "pedido.aceptar.response", "pedido.aceptar.failed", "pedido.rechazar.response", "pedido.rechazar.failed", "pedido.transitar.response", "pedido.transitar.failed", "pedido.cancelar.response", "pedido.cancelar.failed", "pedido.ver.response", "pedido.ver.failed", "pedido.estado_visible.response", "pedido.estado_visible.failed", "bocaos.pedido_recibido", "bocaos.pedido_aceptado", "bocaos.pedido_rechazado", "bocaos.pedido_cancelado"]
- **C · index.js:** `class Pedido extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/pedido.json` por proyecto.
- **D · proyecciones internas:** `_alta` (C01: alta de a uno; sin alta en bloque ni pedido programado (Q39: el pedido nace del canal de la tienda)) · `_transitar` (C02: estado sin hecho es una opinion; el estado no se corrige, se avanza) · `_puede_cancelar` (C07: quien y hasta cuando; mientras no haya respuesta se anota y NO se cobra a nadie) · `_estado_visible` (C05: no ve 'en cola' ni 'sin rider'; no ve otros pedidos ni otras tiendas)
- **E · handler:** `onAltaRequest(e) → this._atender(e,'alta','pedido.alta.response', d=>this._alta(d))` · **CLASE: ORDEN** — C01: de a uno; nace con precio cerrado (D03) y oferta de reparto congelada (E01)
- **E · handler:** `onAceptarRequest(e) → this._atender(e,'aceptar','pedido.aceptar.response', d=>this._aceptar(d))` · **CLASE: ORDEN** — C02 + Q27: la TIENDA acepta el pedido; sin aceptacion no hay pedido
- **E · handler:** `onRechazarRequest(e) → this._atender(e,'rechazar','pedido.rechazar.response', d=>this._rechazar(d))` · **CLASE: ORDEN** — C07 + Q36: puede rechazar aun pagado; quien provoco el rechazo paga los gastos
- **E · handler:** `onTransitarRequest(e) → this._atender(e,'transitar','pedido.transitar.response', d=>this._transitar(d))` · **CLASE: ORDEN** — C02: tabla cerrada; ninguna transicion sin hecho con hora
- **E · handler:** `onCancelarRequest(e) → this._atender(e,'cancelar','pedido.cancelar.response', d=>this._cancelar(d))` · **CLASE: ORDEN** — C07: tabla de quien puede cancelar y hasta cuando
- **E · handler:** `onVerRequest(e) → this._atender(e,'ver','pedido.ver.response', d=>this._ver(d))` · **CLASE: PREGUNTA** — C02: estado interno completo con sus hechos
- **E · handler:** `onEstadoVisibleRequest(e) → this._atender(e,'estado_visible','pedido.estado_visible.response', d=>this._estado_visible(d))` · **CLASE: PREGUNTA** — C05: estado podado (4) para el cliente de la tienda
- **Sube (pide a otras hojas):** `carrito-tienda.ver.request`, `tarifa-pedido.precio.request`, `registro-cliente.de.request`
- **F · hechos que publica:** `bocaos.pedido_recibido`, `bocaos.pedido_aceptado`, `bocaos.pedido_rechazado`, `bocaos.pedido_cancelado`
- **Escucha (dominio):** `whatsapp.pedido.detectado`, `tienda.pedido.recibido`, `bocaos.precio_cerrado`, `bocaos.carrito_cerrado`, `bocaos.cliente_registrado`, `bocaos.oferta_estipulada`, `bocaos.escalada_agotada`
- **VERIFICACIÓN:** pedido sin precio cerrado no nace; transitar a LISTO sin hecho -> TRANSICION_NO_PERMITIDA; rechazo tras pago deja el gasto con dueno.
- **NO REUTILIZA / DECISIÓN:** Se evaluo `pizzepos/pedidos` (v3.6.0, pedido.creado, tipo 'tienda') y `estados` (custodio de listas ordenadas): ninguno es el pedido DEL MERCADO (precio cerrado + oferta de reparto congelada + aceptacion de tienda Q27 + estado podado C05). Se toma su patron y se construye; el id del pedido de la tienda es la clave de union.

#### `hora-listo` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** C04 · A01
- **Propósito:** El disparador de todo el mercado: la tienda declara LISTO y el hecho viaja con su dato. Append-only, se desmiente, no se corrige.
- **Depende de:** `pedido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "hora-listo"` · `subscribes:` ["hora-listo.declarar.request", "hora-listo.hecho.request", "bocaos.pedido_aceptado", "project.activated"] · `publishes:` ["hora-listo.declarar.response", "hora-listo.declarar.failed", "hora-listo.hecho.response", "hora-listo.hecho.failed", "bocaos.pedido_listo", "bocaos.hecho_desmentido"]
- **C · index.js:** `class HoraListo extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/hora-listo.json` por proyecto.
- **D · proyecciones internas:** `_declarar` (A01: sin precio_congelado no hay hecho y sin hecho no hay cadena; el pedido espera y se nombra (A34)) · `_desmentir` (A01: si la tienda se equivoco se anota un hecho nuevo; las dos horas quedan y las dos se ven) · `_hecho` (A01: el dato viaja CON el hecho; nadie va a buscarlo despues (la foto se tomaria en otro instante))
- **E · handler:** `onDeclararRequest(e) → this._atender(e,'declarar','hora-listo.declarar.response', d=>this._declarar(d))` · **CLASE: ORDEN** — C04+A01: LA TIENDA declara la hora; el hecho se escribe una vez, con destino, precio y punto dentro
- **E · handler:** `onHechoRequest(e) → this._atender(e,'hecho','hora-listo.hecho.response', d=>this._hecho(d))` · **CLASE: PREGUNTA** — A01: de(pedido) -> hecho | NO_CONSTA
- **Sube (pide a otras hojas):** `pedido.ver.request`, `tarifa-pedido.precio.request`
- **F · hechos que publica:** `bocaos.pedido_listo`, `bocaos.hecho_desmentido`
- **Escucha (dominio):** `bocaos.pedido_aceptado`
- **VERIFICACIÓN:** declarar dos veces -> segundo hecho desmiente al primero y ambos se leen; sin precio -> 409 y no hay `bocaos.pedido_listo`.
- **NO REUTILIZA / DECISIÓN:** Se funden C04 y A01 a proposito: son el mismo write. Dos custodios del mismo hecho darian dos escritores, que es exactamente lo que C02/A01 prohiben. Q32 vive aqui: si la cocina no termina, no hay `bocaos.pedido_listo` y no se oferta nada.

#### `aviso-tienda` · `PUENTE` · acción **CONSTRUIR**

- **Clases:** C03
- **Propósito:** El pedido llega a la tienda por su canal. Avisa, no decide: no acepta por ella ni compromete una hora.
- **Depende de:** `pedido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`
- **B · module.json:** `name: "aviso-tienda"` · `subscribes:` ["aviso-tienda.avisar.request", "bocaos.pedido_recibido", "bocaos.pedido_aceptado", "bocaos.pedido_cancelado", "bocaos.pedido_rechazado", "project.activated"] · `publishes:` ["aviso-tienda.avisar.response", "aviso-tienda.avisar.failed", "bocaos.aviso_tienda_entregado", "bocaos.aviso_tienda_fallido"]
- **C · index.js:** `class AvisoTienda extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_avisar` (C03: si el aviso no llega, el pedido existe igual; el aviso es transporte, no verdad)
- **E · handler:** `onAvisarRequest(e) → this._atender(e,'avisar','aviso-tienda.avisar.response', d=>this._avisar(d))` · **CLASE: ORDEN** — C03: avisa a la tienda por su canal declarado
- **Sube (pide a otras hojas):** `pedido.ver.request`
- **F · hechos que publica:** `bocaos.aviso_tienda_entregado`, `bocaos.aviso_tienda_fallido`
- **Escucha (dominio):** `bocaos.pedido_recibido`, `bocaos.pedido_aceptado`, `bocaos.pedido_cancelado`, `bocaos.pedido_rechazado`
- **VERIFICACIÓN:** canal caido -> `bocaos.aviso_tienda_fallido` y el pedido sigue vivo; ningun estado del pedido cambio por el aviso.

#### `aviso-cliente` · `PUENTE` · acción **ADAPTAR**

- **Clases:** C06 · K01 · K02
- **Propósito:** El canal DE LA TIENDA hacia su cliente: avisos sin marca de Bocaos y la unica via de queja, que vuelve a la tienda.
- **Depende de:** `pedido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`, `whatsapp-bot`
- **B · module.json:** `name: "aviso-cliente"` · `subscribes:` ["aviso-cliente.avisar.request", "aviso-cliente.reclamacion.request", "bocaos.pedido_aceptado", "bocaos.pedido_listo", "bocaos.pedido_cancelado", "bocaos.contrato_creado", "project.activated"] · `publishes:` ["aviso-cliente.avisar.response", "aviso-cliente.avisar.failed", "aviso-cliente.reclamacion.response", "aviso-cliente.reclamacion.failed", "bocaos.aviso_cliente_entregado", "bocaos.aviso_cliente_fallido"]
- **C · index.js:** `class AvisoCliente extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_avisar` (C06: la plantilla es de la tienda; Bocaos no firma nada que el cliente final vea) · `_sin_marca` (K02: falla si aparece el nombre de Bocaos, un enlace, un remitente reconocible o 'powered by') · `_encauzar` (K01: si una reclamacion llega a Bocaos se devuelve a la tienda; no se atiende ni se guarda como relacion)
- **E · handler:** `onAvisarRequest(e) → this._atender(e,'avisar','aviso-cliente.avisar.response', d=>this._avisar(d))` · **CLASE: ORDEN** — C06: avisa al cliente por el canal de la tienda, con la marca de la tienda
- **E · handler:** `onReclamacionRequest(e) → this._atender(e,'reclamacion','aviso-cliente.reclamacion.response', d=>this._reclamacion(d))` · **CLASE: ORDEN** — K01: encauza la reclamacion del cliente final a la tienda, con su hora
- **Sube (pide a otras hojas):** `pedido.estado_visible.request`
- **F · hechos que publica:** `bocaos.aviso_cliente_entregado`, `bocaos.aviso_cliente_fallido`
- **Escucha (dominio):** `bocaos.pedido_aceptado`, `bocaos.pedido_listo`, `bocaos.pedido_cancelado`, `bocaos.contrato_creado`
- **VERIFICACIÓN:** aviso que contenga la cadena 'Bocaos' se rechaza (K02); reclamacion devuelta a la tienda con hora y no persistida en Bocaos.
- **NO REUTILIZA / DECISIÓN:** ADAPTAR `whatsapp-bot` (v1.5.0): ya tiene webhook por proyecto, plantilla `pedido_listo` y credenciales por proyecto; se le anade (a) credencial/plantilla POR TIENDA y (b) el validador K02 en la salida. Sus eventos `whatsapp.mensaje.enviado` / `whatsapp.envio.fallido` son el par honesto del envio.

### ▸ EJE `precio` — el precio del reparto y la ruta viva (4)

#### `tarifa-pedido` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** E01 · E02 · E03 · E07
- **Propósito:** El precio del reparto de UN pedido: oferta del cliente congelada, incentivo de la tienda y subidas con autor humano y tope.
- **Depende de:** — (raíz)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "tarifa-pedido"` · `subscribes:` ["tarifa-pedido.estipular.request", "tarifa-pedido.incentivar.request", "tarifa-pedido.subir.request", "tarifa-pedido.precio.request", "bocaos.propuesta_emitida", "project.activated"] · `publishes:` ["tarifa-pedido.estipular.response", "tarifa-pedido.estipular.failed", "tarifa-pedido.incentivar.response", "tarifa-pedido.incentivar.failed", "tarifa-pedido.subir.response", "tarifa-pedido.subir.failed", "tarifa-pedido.precio.response", "tarifa-pedido.precio.failed", "bocaos.oferta_estipulada", "bocaos.incentivo_subido", "bocaos.oferta_subida"]
- **C · index.js:** `class TarifaPedido extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/tarifa-pedido.json` por proyecto.
- **D · proyecciones internas:** `_estipular` (E01: no la toca nadie mas (ni la tienda, ni la sala, ni Bocaos); el rider ve un numero que no cambia) · `_incentivar` (E02: no puede bajar por debajo de lo ya ofrecido a un rider con propuesta viva) · `_precio` (E03: solo SUMA; no forma, no estima, no subasta, no redondea a favor de nadie) · `_subir` (E07: tope = el que el CLIENTE autorizo al pedir (Q43); sin autor -> SIN_AUTOR y la deuda queda visible)
- **E · handler:** `onEstipularRequest(e) → this._atender(e,'estipular','tarifa-pedido.estipular.response', d=>this._estipular(d))` · **CLASE: ORDEN** — E01: el CLIENTE estipula los centimos del reparto; se congela con el pedido
- **E · handler:** `onIncentivarRequest(e) → this._atender(e,'incentivar','tarifa-pedido.incentivar.response', d=>this._incentivar(d))` · **CLASE: ORDEN** — E02: la tienda sube su incentivo, con autor y hora
- **E · handler:** `onSubirRequest(e) → this._atender(e,'subir','tarifa-pedido.subir.response', d=>this._subir(d))` · **CLASE: ORDEN** — E07: sube la oferta (peldano 3 de Q43) con autor HUMANO; el sistema no puede ser autor
- **E · handler:** `onPrecioRequest(e) → this._atender(e,'precio','tarifa-pedido.precio.response', d=>this._precio(d))` · **CLASE: PREGUNTA** — E03: oferta + incentivo, en centimos. Solo suma
- **F · hechos que publica:** `bocaos.oferta_estipulada`, `bocaos.incentivo_subido`, `bocaos.oferta_subida`
- **Escucha (dominio):** `bocaos.propuesta_emitida`
- **VERIFICACIÓN:** subir sin autor -> SIN_AUTOR; incentivo a la baja con propuesta viva -> 409; precio = oferta+incentivo exacto en centimos.

#### `contrato-tramos` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** E06 · N02
- **Propósito:** El contrato economico por parte, con vigencia y autor. Cambiar la tabla no toca el calculo.
- **Depende de:** `config-mercado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "contrato-tramos"` · `subscribes:` ["contrato-tramos.declarar.request", "contrato-tramos.vigente.request", "contrato-tramos.simular.request", "project.activated"] · `publishes:` ["contrato-tramos.declarar.response", "contrato-tramos.declarar.failed", "contrato-tramos.vigente.response", "contrato-tramos.vigente.failed", "contrato-tramos.simular.response", "contrato-tramos.simular.failed", "bocaos.tramos_declarados"]
- **C · index.js:** `class ContratoTramos extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/contrato-tramos.json` por proyecto.
- **D · proyecciones internas:** `_declarar` (E06: S14 provisional 39/79/149 EUR + 10 c pedido rider + 20 c pedido tienda; cambio no retroactivo) · `_vigente` (E06: se calcula sobre el contrato vigente en la hora del hecho, no sobre el de hoy) · `_simular` (N02: recalcula con los pedidos, aceptaciones y cargos DE ESA tienda; no con una media del mercado)
- **E · handler:** `onDeclararRequest(e) → this._atender(e,'declarar','contrato-tramos.declarar.response', d=>this._declarar(d))` · **CLASE: ORDEN** — E06: tramo, fijo mensual, centimos por pedido, a quien, vigencia, autor
- **E · handler:** `onVigenteRequest(e) → this._atender(e,'vigente','contrato-tramos.vigente.response', d=>this._vigente(d))` · **CLASE: PREGUNTA** — E06: contrato vigente para la parte en ese instante | NO_CONSTA
- **E · handler:** `onSimularRequest(e) → this._atender(e,'simular','contrato-tramos.simular.response', d=>this._simular(d))` · **CLASE: PREGUNTA** — N02: con los hechos de ESA tienda, cuanto pagaria con otro tramo
- **Sube (pide a otras hojas):** `liquidacion.devengo.request`
- **F · hechos que publica:** `bocaos.tramos_declarados`
- **Escucha (dominio):** —
- **VERIFICACIÓN:** cambio de tramo con vigencia no reescribe lo devengado antes; simular no escribe nada.

#### `contrato-puntual` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** A24
- **Propósito:** Lo que la aceptacion crea y NADA MAS: un pedido, un rider, un precio, una hora prometida. La unidad de negocio.
- **Depende de:** `pedido`, `tarifa-pedido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "contrato-puntual"` · `subscribes:` ["contrato-puntual.crear.request", "contrato-puntual.de.request", "contrato-puntual.vivos.request", "contrato-puntual.cerrar.request", "bocaos.propuesta_aceptada", "bocaos.hecho_reparto_anotado", "project.activated"] · `publishes:` ["contrato-puntual.crear.response", "contrato-puntual.crear.failed", "contrato-puntual.de.response", "contrato-puntual.de.failed", "contrato-puntual.vivos.response", "contrato-puntual.vivos.failed", "contrato-puntual.cerrar.response", "contrato-puntual.cerrar.failed", "bocaos.contrato_creado", "bocaos.contrato_cerrado"]
- **C · index.js:** `class ContratoPuntual extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/contrato-puntual.json` por proyecto.
- **D · proyecciones internas:** `_crear` (A24: ni turno, ni jornada, ni disponibilidad futura, ni compromiso con el siguiente pedido) · `_vivos` (B02: no se guarda una lista de paradas; se DERIVA de los contratos vivos) · `_cerrar` (A24: un contrato con duracion seria otro negocio; aqui es puntual y se cierra con el hecho)
- **E · handler:** `onCrearRequest(e) → this._atender(e,'crear','contrato-puntual.crear.response', d=>this._crear(d))` · **CLASE: ORDEN** — A24: crea el contrato puntual desde la aceptacion
- **E · handler:** `onDeRequest(e) → this._atender(e,'de','contrato-puntual.de.response', d=>this._de(d))` · **CLASE: PREGUNTA** — A24: contrato vivo de un pedido | NO_CONSTA
- **E · handler:** `onVivosRequest(e) → this._atender(e,'vivos','contrato-puntual.vivos.response', d=>this._vivos(d))` · **CLASE: PREGUNTA** — B02: contratos vivos de un rider (la ruta se deriva de aqui)
- **E · handler:** `onCerrarRequest(e) → this._atender(e,'cerrar','contrato-puntual.cerrar.response', d=>this._cerrar(d))` · **CLASE: ORDEN** — A24/B06: cierra al anotar la entrega
- **Sube (pide a otras hojas):** `pedido.ver.request`, `tarifa-pedido.precio.request`
- **F · hechos que publica:** `bocaos.contrato_creado`, `bocaos.contrato_cerrado`
- **Escucha (dominio):** `bocaos.propuesta_aceptada`, `bocaos.hecho_reparto_anotado`
- **VERIFICACIÓN:** el segundo 'si' sobre la misma propuesta no crea segundo contrato; cerrar el contrato hace desaparecer la parada de B02.

#### `ruta-viva` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** B01 · B02 · B03 · B04 · B05 · B06
- **Propósito:** El trayecto que el rider ya lleva encima: ultimo punto con frescura, promesa por parada, capacidad declarada y el orden de UNA ruta.
- **Depende de:** — (raíz)
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "ruta-viva"` · `subscribes:` ["ruta-viva.posicion.request", "ruta-viva.promesa.request", "ruta-viva.capacidad.request", "ruta-viva.paradas.request", "ruta-viva.ruta.request", "ruta-viva.cerrar.request", "bocaos.contrato_creado", "bocaos.contrato_cerrado", "bocaos.hecho_reparto_anotado", "project.activated"] · `publishes:` ["ruta-viva.posicion.response", "ruta-viva.posicion.failed", "ruta-viva.promesa.response", "ruta-viva.promesa.failed", "ruta-viva.capacidad.response", "ruta-viva.capacidad.failed", "ruta-viva.paradas.response", "ruta-viva.paradas.failed", "ruta-viva.ruta.response", "ruta-viva.ruta.failed", "ruta-viva.cerrar.response", "ruta-viva.cerrar.failed", "bocaos.posicion_anotada", "bocaos.promesa_guardada", "bocaos.trayecto_cerrado"]
- **C · index.js:** `class RutaViva extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/ruta-viva.json` por proyecto.
- **D · proyecciones internas:** `_posicion` (B01: frescura declarada y consultable; si esta vieja, A05 devuelve NO_CONSTA) · `_capacidad` (B05: declarada, no estimada; Q33 capacidad = min(volumen fisico, tiempo de ventana, distancia)) · `_paradas` (B02: si un contrato se cierra, su parada desaparece sola (una lista guardada miente)) · `_ordenar` (B04: nunca entre rutas, nunca entre riders, nunca entre pedidos de tiendas distintas (Q31: si entre paradas)) · `_promesa` (B03: solo se puede MEJORAR; empeorarla exige pasar el umbral de retraso (A31)) · `_cerrar` (B06: cerrar no puntua a nadie; solo deja de contar para la ruta viva)
- **E · handler:** `onPosicionRequest(e) → this._atender(e,'posicion','ruta-viva.posicion.response', d=>this._posicion(d))` · **CLASE: ORDEN** — B01: anota el ULTIMO punto con su hora (un hecho, no un chorro)
- **E · handler:** `onPromesaRequest(e) → this._atender(e,'promesa','ruta-viva.promesa.response', d=>this._promesa(d))` · **CLASE: ORDEN** — B03: guarda la hora prometida a cada pedido a bordo
- **E · handler:** `onCapacidadRequest(e) → this._atender(e,'capacidad','ruta-viva.capacidad.response', d=>this._capacidad(d))` · **CLASE: ORDEN** — B05: el rider declara cuanto cabe (Q33: volumen del vehiculo)
- **E · handler:** `onParadasRequest(e) → this._atender(e,'paradas','ruta-viva.paradas.response', d=>this._paradas(d))` · **CLASE: PREGUNTA** — B02: paradas pendientes derivadas de los contratos vivos, en su orden
- **E · handler:** `onRutaRequest(e) → this._atender(e,'ruta','ruta-viva.ruta.response', d=>this._ruta(d))` · **CLASE: PREGUNTA** — B04: reordena UNA ruta y solo dentro de ella; desempate declarado
- **E · handler:** `onCerrarRequest(e) → this._atender(e,'cerrar','ruta-viva.cerrar.response', d=>this._cerrar(d))` · **CLASE: ORDEN** — B06: cierra el trayecto cuando la ultima parada tiene hecho
- **Sube (pide a otras hojas):** `contrato-puntual.vivos.request`
- **F · hechos que publica:** `bocaos.posicion_anotada`, `bocaos.promesa_guardada`, `bocaos.trayecto_cerrado`
- **Escucha (dominio):** `bocaos.contrato_creado`, `bocaos.contrato_cerrado`, `bocaos.hecho_reparto_anotado`
- **VERIFICACIÓN:** sin posicion fresca A05 da NO_CONSTA; promesa empeorada por encima del umbral -> 409; dos rutas no se mezclan.

### ▸ EJE `enlace` — EL CUELLO (6)

#### `foto-mercado` · `REFLEJO` · acción **CONSTRUIR**

- **Clases:** A02 · A03 · A04
- **Propósito:** Toma LA foto del instante y filtra quien puede recibir propuesta AHORA. Todo lo que F sabe esta en la foto.
- **Depende de:** `ruta-viva`, `estado-parte`, `censo-parte`, `config-mercado`, `puntualidad-tienda`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`
- **B · module.json:** `name: "foto-mercado"` · `subscribes:` ["foto-mercado.componer.request", "foto-mercado.elegibles.request", "foto-mercado.fresca.request", "bocaos.estado_parte_declarado", "bocaos.posicion_anotada", "project.activated"] · `publishes:` ["foto-mercado.componer.response", "foto-mercado.componer.failed", "foto-mercado.elegibles.response", "foto-mercado.elegibles.failed", "foto-mercado.fresca.response", "foto-mercado.fresca.failed"]
- **C · index.js:** `class FotoMercado extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_componer` (A02: no escribe nada; si se guardara habria dos verdades y una seria vieja) · `_congelar` (A03: vista + hora + huella del contenido; la foto viaja dentro de la propuesta y se cita) · `_fresca` (A03: la frescura exigible es un numero del proyecto; no se estima una posicion nueva) · `_elegibles` (A04: ni historico, ni antiguedad, ni cercania previa, ni tasa de aceptacion. El que tiene un dato ausente ENTRA con su lista de faltantes)
- **E · handler:** `onComponerRequest(e) → this._atender(e,'componer','foto-mercado.componer.response', d=>this._componer(d))` · **CLASE: PREGUNTA** — A02: riders vigentes + posicion + paradas + promesas + capacidad + puntualidad del local + politica
- **E · handler:** `onElegiblesRequest(e) → this._atender(e,'elegibles','foto-mercado.elegibles.response', d=>this._elegibles(d))` · **CLASE: PREGUNTA** — A04: quienes pueden recibir propuesta ahora: estado, zona y capacidad DECLARADOS
- **E · handler:** `onFrescaRequest(e) → this._atender(e,'fresca','foto-mercado.fresca.response', d=>this._fresca(d))` · **CLASE: PREGUNTA** — A03: esta fresca la foto para este instante? si no, el candidato va a A34
- **Sube (pide a otras hojas):** `estado-parte.vigentes.request`, `ruta-viva.posicion.request`, `ruta-viva.paradas.request`, `ruta-viva.capacidad.request`, `puntualidad-tienda.medir.request`, `config-mercado.politica.request`
- **F · hechos que publica:** — (ninguno: sólo calcula)
- **Escucha (dominio):** `bocaos.estado_parte_declarado`, `bocaos.posicion_anotada`
- **VERIFICACIÓN:** la foto no cambia si se recomputa con el mismo instante; un rider en pausa no aparece; un rider sin capacidad entra con faltante.

#### `propuesta` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** A13 · A14 · A15 · A19 · A27 · A29 · A33 · M05
- **Propósito:** El objeto mas delicado del sistema: la propuesta con sus cuatro numeros, sus DOS relojes, un solo desenlace y un solo 'si'.
- **Depende de:** `pedido`, `config-mercado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "propuesta"` · `subscribes:` ["propuesta.emitir.request", "propuesta.acusar.request", "propuesta.aceptar.request", "propuesta.rechazar.request", "propuesta.vencer.request", "propuesta.vista.request", "propuesta.reproducir.request", "propuesta.revisar.request", "bocaos.propuesta_redactada", "bocaos.propuesta_entregada", "bocaos.acuse_recibido", "project.activated"] · `publishes:` ["propuesta.emitir.response", "propuesta.emitir.failed", "propuesta.acusar.response", "propuesta.acusar.failed", "propuesta.aceptar.response", "propuesta.aceptar.failed", "propuesta.rechazar.response", "propuesta.rechazar.failed", "propuesta.vencer.response", "propuesta.vencer.failed", "propuesta.vista.response", "propuesta.vista.failed", "propuesta.reproducir.response", "propuesta.reproducir.failed", "propuesta.revisar.response", "propuesta.revisar.failed", "bocaos.propuesta_emitida", "bocaos.propuesta_acusada", "bocaos.propuesta_aceptada", "bocaos.propuesta_rechazada", "bocaos.propuesta_caducada_sin_acuse", "bocaos.propuesta_caducada_sin_respuesta"]
- **C · index.js:** `class Propuesta extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/propuesta.json` por proyecto.
- **D · proyecciones internas:** `_emitir` (A13: se escribe una vez y NO se edita; es la prueba de que se ofrecio, a quien y con que numeros) · `_abrir` (A15+Q42: validez 20 s desde la emision, decision 10 s desde el acuse, retirada a los 5 s sin acuse) · `_aceptar` (A19: inexistente la aceptacion por silencio, por cercania o automatica a los 20 s) · `_cerrar` (A14: un desenlace; el segundo que llega no paga nada (es el mismo 'sin coste' de A21)) · `_vencer` (A15: sin acuse -> caduca_sin_acuse; con acuse -> caduca_sin_respuesta. No son lo mismo ni para el rider ni para la metrica) · `_vista` (M05: los cuatro van SIEMPRE, incluido el que pasa por un centimo; no hay vista resumida) · `_reproducir` (A29: el replay es lo que convierte 'explicable' en comprobable) · `_sin_asignacion` (A27: falla tambien con 'la sala lo empuja por telefono a un rider concreto')
- **E · handler:** `onEmitirRequest(e) → this._atender(e,'emitir','propuesta.emitir.response', d=>this._emitir(d))` · **CLASE: ORDEN** — A13: escribe la propuesta UNA vez, con huella de foto y version de politica; una viva por pedido (A33)
- **E · handler:** `onAcusarRequest(e) → this._atender(e,'acusar','propuesta.acusar.response', d=>this._acusar(d))` · **CLASE: ORDEN** — Q42: el acuse es el dato; abre el reloj de decision de 10 s
- **E · handler:** `onAceptarRequest(e) → this._atender(e,'aceptar','propuesta.aceptar.response', d=>this._aceptar(d))` · **CLASE: ORDEN** — A19: el 'si' solo lo escribe el rider; atomico; el segundo recibe YA_NO_ESTA y no paga nada
- **E · handler:** `onRechazarRequest(e) → this._atender(e,'rechazar','propuesta.rechazar.response', d=>this._rechazar(d))` · **CLASE: ORDEN** — A14+A21: un desenlace por propuesta; el no no cuesta
- **E · handler:** `onVencerRequest(e) → this._atender(e,'vencer','propuesta.vencer.response', d=>this._vencer(d))` · **CLASE: ORDEN** — A15+Q42: dos caducidades distintas (sin acuse / sin respuesta)
- **E · handler:** `onVistaRequest(e) → this._atender(e,'vista','propuesta.vista.response', d=>this._vista(d))` · **CLASE: PREGUNTA** — M05: desvio - espera - retraso - cobra, SIEMPRE en ese orden, + la frase
- **E · handler:** `onReproducirRequest(e) → this._atender(e,'reproducir','propuesta.reproducir.response', d=>this._reproducir(d))` · **CLASE: PREGUNTA** — A29: re-ejecuta F con hecho, foto y politica guardados; si difiere, NOMBRA la discrepancia
- **E · handler:** `onRevisarRequest(e) → this._atender(e,'revisar','propuesta.revisar.response', d=>this._revisar(d))` · **CLASE: PREGUNTA** — A27/A33: guardas sin asignacion y propuesta unica sobre todos los caminos
- **Sube (pide a otras hojas):** `pedido.ver.request`, `config-mercado.politica.request`, `contrato-puntual.crear.request`
- **F · hechos que publica:** `bocaos.propuesta_emitida`, `bocaos.propuesta_acusada`, `bocaos.propuesta_aceptada`, `bocaos.propuesta_rechazada`, `bocaos.propuesta_caducada_sin_acuse`, `bocaos.propuesta_caducada_sin_respuesta`
- **Escucha (dominio):** `bocaos.propuesta_redactada`, `bocaos.propuesta_entregada`, `bocaos.acuse_recibido`
- **VERIFICACIÓN:** dos 'si' simultaneos -> uno solo crea contrato; sin acuse a los 5 s -> caduca_sin_acuse; replay identico devuelve la misma propuesta.
- **NO REUTILIZA / DECISIÓN:** Se funden A13+A14+A15+A19 en UN custodio: los cuatro escriben el mismo objeto (la propuesta y su desenlace). Separarlos daria cuatro escritores y la carrera que A14 existe para impedir. A33 y A19 se cumplen entonces POR CONSTRUCCION.

#### `redaccion-propuesta` · `MICRO-AGENTE` · acción **CONSTRUIR**

- **Clases:** A18
- **Propósito:** El agente del borde: elige las palabras de la frase ya calculada. Validador puro contra el conjunto cerrado de razones.
- **Depende de:** `propuesta`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`
- **B · module.json:** `name: "redaccion-propuesta"` · `subscribes:` ["redaccion-propuesta.adornar.request", "project.activated"] · `publishes:` ["redaccion-propuesta.adornar.response", "redaccion-propuesta.adornar.failed", "bocaos.propuesta_redactada"]
- **C · index.js:** `class RedaccionPropuesta extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_validar` (A18: toda clausula se apoya en una razon de A16; el agente no puede anadir un motivo, ni cambiar un numero) · `cajon_adornar` (mitad fuzzy (blueprint): solo las palabras. Su evento NO va en module.json (gate validate-hibridos))
- **E · handler:** `onAdornarRequest(e) → this._atender(e,'adornar','redaccion-propuesta.adornar.response', d=>this._adornar(d))` · **CLASE: ORDEN** — A18: frase + razones -> frase'; si aparece un motivo que no esta, se descarta y se usa A17
- **F · hechos que publica:** `bocaos.propuesta_redactada`
- **Escucha (dominio):** —
- **VERIFICACIÓN:** blueprint ausente -> la propuesta sale con la frase derivada A17 y el mercado funciona igual; una clausula con motivo inventado se descarta.

#### `enlace` · `MICRO-AGENTE` · acción **CONSTRUIR**

- **Clases:** A05 · A06 · A07 · A08 · A09 · A10 · A11 · A12 · A16 · A17 · A20 · A21 · A22 · A23 · A25 · A28 · A30 · A31 · A34
- **Propósito:** EL CUELLO: F(hecho, foto, politica) -> Propuesta | Hueco | NINGUNA. Cuatro medidas, cuatro tests en AND, un candidato, una frase. Cero IA en la decision.
- **Depende de:** `foto-mercado`, `propuesta`, `canal-rider`, `redaccion-propuesta`, `escalada-enlace`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`
- **B · module.json:** `name: "enlace"` · `subscribes:` ["enlace.reintentar.request", "enlace.reproducir.request", "enlace.guardas.request", "bocaos.pedido_listo", "bocaos.propuesta_aceptada", "bocaos.propuesta_rechazada", "bocaos.propuesta_caducada_sin_acuse", "bocaos.propuesta_caducada_sin_respuesta", "bocaos.escalada_reintentar", "bocaos.politica_declarada", "bocaos.hecho_desmentido", "bocaos.incentivo_subido", "bocaos.oferta_subida", "bocaos.promesa_guardada", "bocaos.propuesta_acusada", "project.activated"] · `publishes:` ["enlace.reintentar.response", "enlace.reintentar.failed", "enlace.reproducir.response", "enlace.reproducir.failed", "enlace.guardas.response", "enlace.guardas.failed", "bocaos.medidas_calculadas", "bocaos.hueco_nombrado", "bocaos.enlace_agotado", "bocaos.enlace_completado"]
- **C · index.js:** `class Enlace extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_desvio` (A07 = A06 - A05: metros de mas; si una ruta no consta -> NO_CONSTA; insertar una parada NUNCA acorta la base) · `_espera` (A08: minutos que esperaria si llega antes de listo; contra L03, no contra una cocina adivinada) · `_retraso` (A09+A10: por parada contra SU promesa guardada; el agregado es el PEOR, no la suma ni la media) · `_cobra` (A11: NETO = precio - desvio*0,140 - espera*0,257 (Q41); sin coste declarado -> NO_CONSTA, sin valor por defecto) · `_pasa` (A12: cuatro comparaciones en AND contra la politica; devuelve EL TEST QUE FALLO, no un numero) · `_razones` (A16: conjunto cerrado (desvio, espera, retraso, cobra, umbrales, version)) · `_frase` (A17: plantilla fija sobre los numeros ya calculados; misma entrada, misma frase) · `_hueco` (A34: si falta un dato no se estima; se nombra y el candidato se salta) · `_siguiente` (A25: avanza por el ORDEN declarado en la politica; al agotar el tope devuelve NINGUNO) · `_hora_aceptacion` (A20: el hecho con hora que arranca los relojes del reparto) · `_rechazo` (A21: el no se anota; NUNCA entra en la elegibilidad ni en el orden (no hay camino a A04 ni a A25)) · `_caducidad` (A23: el silencio es un no con hora; no se estima la intencion) · `_sin_puntuacion` (A22: falla si aparece cualquier tasa de rechazo, fiabilidad, antiguedad o prioridad comprada) · `_sin_optimizador` (A28: la entrada es UN hecho, UNA foto, UNA politica; una lista de pedidos o un barrido -> falla) · `_por_trayecto` (A30: la unidad enlazada es la RUTA; 'pedidos del mismo cliente' o 'misma direccion' -> falla) · `_no_rompe_promesa` (A31: ningun retraso agregado supera el umbral de la politica aplicada; protege la version con la que se prometio)
- **E · handler:** `onReintentarRequest(e) → this._atender(e,'reintentar','enlace.reintentar.response', d=>this._reintentar(d))` · **CLASE: ORDEN** — reabre F para un pedido vivo (peldano 2 de Q43 o tras un desenlace)
- **E · handler:** `onReproducirRequest(e) → this._atender(e,'reproducir','enlace.reproducir.response', d=>this._reproducir(d))` · **CLASE: PREGUNTA** — A29: re-ejecuta F con la foto y la politica guardadas (lo llama `propuesta`)
- **E · handler:** `onGuardasRequest(e) → this._atender(e,'guardas','enlace.guardas.response', d=>this._guardas(d))` · **CLASE: PREGUNTA** — A22/A28/A30/A31: las cuatro guardas del cuello, ejecutables como test
- **Sube (pide a otras hojas):** `foto-mercado.componer.request`, `foto-mercado.elegibles.request`, `propuesta.emitir.request`, `canal-rider.entregar.request`, `redaccion-propuesta.adornar.request`, `escalada-enlace.escalar.request`, `ruta-viva.paradas.request`, `puntualidad-tienda.medir.request`
- **F · hechos que publica:** `bocaos.medidas_calculadas`, `bocaos.hueco_nombrado`, `bocaos.enlace_agotado`, `bocaos.enlace_completado`
- **Escucha (dominio):** `bocaos.pedido_listo`, `bocaos.propuesta_aceptada`, `bocaos.propuesta_rechazada`, `bocaos.propuesta_caducada_sin_acuse`, `bocaos.propuesta_caducada_sin_respuesta`, `bocaos.escalada_reintentar`, `bocaos.politica_declarada`, `bocaos.hecho_desmentido`, `bocaos.incentivo_subido`, `bocaos.oferta_subida`, `bocaos.promesa_guardada`, `bocaos.propuesta_acusada`
- **VERIFICACIÓN:** T-desvio con desvio = umbral exacto -> NO pasa; T-cobra con cobra = 0 -> NO pasa; dos pedidos en la entrada -> A28 FALLA.
- **NO REUTILIZA / DECISIÓN:** Este es el modulo que NO puede tener IA. Los cuatro umbrales son una tabla y una comparacion AND; la unica pieza fuzzy del enlace es `redaccion-propuesta` (A18) y si cae, A17 sigue explicando.

#### `escalada-enlace` · `PUENTE` · acción **CONSTRUIR**

- **Clases:** A26
- **Propósito:** Nadie acepto: elige CUAL de las tres salidas pide, en tres peldanos, sin sala humana y con el tope del cliente.
- **Depende de:** `tarifa-pedido`, `config-mercado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`
- **B · module.json:** `name: "escalada-enlace"` · `subscribes:` ["escalada-enlace.escalar.request", "bocaos.enlace_agotado", "bocaos.propuesta_rechazada", "bocaos.propuesta_caducada_sin_respuesta", "bocaos.oferta_subida", "project.activated"] · `publishes:` ["escalada-enlace.escalar.response", "escalada-enlace.escalar.failed", "bocaos.escalada_peldano", "bocaos.escalada_reintentar", "bocaos.escalada_agotada"]
- **C · index.js:** `class EscaladaEnlace extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_peldano` (Q43: 1) los 2 candidatos; 2) TODOS los activos del barrio 30 s; 3) subir oferta por escalones hasta el tope del cliente; 5 min sin coger -> cancela y el cliente lo sabe) · `_pide` (A26: elige cual de las tres salidas pide; no ejecuta ninguna, porque ninguna es suya) · `_agotada` (A26: el pedido no se cierra por silencio del sistema; queda vivo y visible en la cola)
- **E · handler:** `onEscalarRequest(e) → this._atender(e,'escalar','escalada-enlace.escalar.response', d=>this._escalar(d))` · **CLASE: ORDEN** — A26: escalar(pedido, intentos) -> pide subir oferta | pide abrir a todos | pide sala | cancela
- **Sube (pide a otras hojas):** `tarifa-pedido.subir.request`, `aviso-sala.avisar.request`, `cola-sala.encolar.request`, `pedido.cancelar.request`
- **F · hechos que publica:** `bocaos.escalada_peldano`, `bocaos.escalada_reintentar`, `bocaos.escalada_agotada`
- **Escucha (dominio):** `bocaos.enlace_agotado`, `bocaos.propuesta_rechazada`, `bocaos.propuesta_caducada_sin_respuesta`, `bocaos.oferta_subida`
- **VERIFICACIÓN:** 2 rechazos -> peldano 2 publicado; agotado el tope del cliente -> `bocaos.escalada_agotada` y pedido cancelado con aviso previo al cliente.
- **NO REUTILIZA / DECISIÓN:** Q43 sustituye el 'y si no, la sala': peldaño 2 (todos los riders del barrio) es lo que haria una sala, y no hace falta que haya alguien. Q40 (agentes, no sala humana) deja la sala como excepcion, no como peldano obligatorio.

#### `canal-rider` · `PUENTE` · acción **ADAPTAR**

- **Clases:** M04
- **Propósito:** El puerto por el que le llega la propuesta y vuelve el acuse. Latencia critica: una ventana de 10 s que llega 8 s tarde es de 2 s.
- **Depende de:** `propuesta`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`, `telegram-bridge`
- **B · module.json:** `name: "canal-rider"` · `subscribes:` ["canal-rider.entregar.request", "canal-rider.acuse.request", "bocaos.propuesta_emitida", "project.activated"] · `publishes:` ["canal-rider.entregar.response", "canal-rider.entregar.failed", "canal-rider.acuse.response", "canal-rider.acuse.failed", "bocaos.propuesta_entregada", "bocaos.propuesta_no_entregada", "bocaos.acuse_recibido"]
- **C · index.js:** `class CanalRider extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_entregar` (M04: puerto intercambiable; si el canal no puede entregar dentro de la ventana, el candidato no debe proponerse) · `_acuse` (Q42: el acuse es el dato; un rider sin cobertura no bloquea el mercado)
- **E · handler:** `onEntregarRequest(e) → this._atender(e,'entregar','canal-rider.entregar.response', d=>this._entregar(d))` · **CLASE: ORDEN** — M04: entrega la propuesta (cuatro numeros + frase) al rider
- **E · handler:** `onAcuseRequest(e) → this._atender(e,'acuse','canal-rider.acuse.response', d=>this._acuse(d))` · **CLASE: ORDEN** — Q42: el acuse abre la ventana de decision; sin acuse en 5 s la propuesta se retira
- **Sube (pide a otras hojas):** `propuesta.vista.request`
- **F · hechos que publica:** `bocaos.propuesta_entregada`, `bocaos.propuesta_no_entregada`, `bocaos.acuse_recibido`
- **Escucha (dominio):** `bocaos.propuesta_emitida`
- **VERIFICACIÓN:** sin acuse en 5 s -> `bocaos.propuesta_no_entregada`; acuse -> `bocaos.acuse_recibido` con hora de acuse.
- **NO REUTILIZA / DECISIÓN:** ADAPTAR `telegram-bridge` (v1.0.3) como transporte por defecto: ya entrega por proyecto y devuelve `telegram.callback.received`, que es el acuse/el si/el no. Se construye el contrato de M04 (acuse, ventana, retirada) porque es la pieza critica del producto; el transporte queda intercambiable.

### ▸ EJE `reparto` — la ejecución convertida en prueba (4)

#### `hechos-reparto` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** F01 · F02 · F03
- **Propósito:** La ejecucion convertida en prueba: relojes, posicion y prueba, append-only. Aqui se produce EL ACTA que zanja las disputas.
- **Depende de:** `contrato-puntual`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "hechos-reparto"` · `subscribes:` ["hechos-reparto.anotar.request", "hechos-reparto.prueba.request", "hechos-reparto.acta.request", "hechos-reparto.seguimiento.request", "bocaos.contrato_creado", "project.activated"] · `publishes:` ["hechos-reparto.anotar.response", "hechos-reparto.anotar.failed", "hechos-reparto.prueba.response", "hechos-reparto.prueba.failed", "hechos-reparto.acta.response", "hechos-reparto.acta.failed", "hechos-reparto.seguimiento.response", "hechos-reparto.seguimiento.failed", "bocaos.hecho_reparto_anotado", "bocaos.prueba_anotada", "bocaos.acta_incompleta"]
- **C · index.js:** `class HechosReparto extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/hechos-reparto.json` por proyecto.
- **D · proyecciones internas:** `_anotar` (F01: append-only; un hecho corregido es un hecho NUEVO que desmiente al anterior) · `_prueba` (F02: sin prueba no se presume nada; la falta es un hecho propio, no un hueco a rellenar) · `_acta` (Q24: hora de aceptacion, llegada, salida, portal, entrega, foto, posicion y acuse; la prueba es el acta) · `_completa` (Q30: si falta un evento el acta esta incompleta y el cargo se retira (lo consulta `regla-fallo`)) · `_seguimiento` (F03: la posicion que ve el cliente es la del rider de SU contrato, no la de nadie mas)
- **E · handler:** `onAnotarRequest(e) → this._atender(e,'anotar','hechos-reparto.anotar.response', d=>this._anotar(d))` · **CLASE: ORDEN** — F01: recogida / llegada / entrega, cada uno con hora. Sin hora no es un hecho
- **E · handler:** `onPruebaRequest(e) → this._atender(e,'prueba','hechos-reparto.prueba.response', d=>this._prueba(d))` · **CLASE: ORDEN** — F02: foto (o su falta), hora y confirmacion del cliente (o su falta)
- **E · handler:** `onActaRequest(e) → this._atender(e,'acta','hechos-reparto.acta.response', d=>this._acta(d))` · **CLASE: PREGUNTA** — Q24/Q30: el acta del reparto; si falta un evento, se declara INCOMPLETA
- **E · handler:** `onSeguimientoRequest(e) → this._atender(e,'seguimiento','hechos-reparto.seguimiento.response', d=>this._seguimiento(d))` · **CLASE: PREGUNTA** — F03: posicion y estado podados, solo mientras el contrato esta vivo
- **Sube (pide a otras hojas):** `contrato-puntual.de.request`, `ruta-viva.posicion.request`, `pedido.ver.request`
- **F · hechos que publica:** `bocaos.hecho_reparto_anotado`, `bocaos.prueba_anotada`, `bocaos.acta_incompleta`
- **Escucha (dominio):** `bocaos.contrato_creado`
- **VERIFICACIÓN:** anotar dos entregas -> la segunda desmiente y ambas quedan; acta sin foto -> INCOMPLETA; seguimiento cerrado tras entrega.
- **NO REUTILIZA / DECISIÓN:** Se evaluo `historial` (append-only por proyecto, registro de impresiones): mismo patron, otro dominio y otra clave. Se toma el patron y se construye. La traza de posicion se conserva 90 dias (Q38) y no se recoge fuera del horario de trabajo.

#### `chat-enmascarado` · `PUENTE` · acción **CONSTRUIR**

- **Clases:** F04
- **Propósito:** Rider y cliente hablan sin numeros de telefono. El mensaje cruza; el numero no.
- **Depende de:** `contrato-puntual`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`, `telegram-bridge`
- **B · module.json:** `name: "chat-enmascarado"` · `subscribes:` ["chat-enmascarado.entregar.request", "bocaos.contrato_creado", "project.activated"] · `publishes:` ["chat-enmascarado.entregar.response", "chat-enmascarado.entregar.failed", "bocaos.mensaje_entregado"]
- **C · index.js:** `class ChatEnmascarado extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_enmascarar` (F04: ni el rider ve el numero del cliente ni al reves) · `_sin_agregado` (F04: no se lee el contenido para ningun calculo ni se construye ningun agregado sobre conversaciones)
- **E · handler:** `onEntregarRequest(e) → this._atender(e,'entregar','chat-enmascarado.entregar.response', d=>this._entregar(d))` · **CLASE: ORDEN** — F04: entrega el mensaje enmascarado a la otra parte
- **Sube (pide a otras hojas):** `contrato-puntual.de.request`
- **F · hechos que publica:** `bocaos.mensaje_entregado`
- **Escucha (dominio):** `bocaos.contrato_creado`
- **VERIFICACIÓN:** un mensaje con un telefono en el cuerpo sale sin el; ningun fichero del modulo contiene texto de conversacion.

#### `incidencia-reparto` · `PUENTE` · acción **CONSTRUIR**

- **Clases:** F06
- **Propósito:** De la calle a la cola: abre el caso con autor y hora. No decide, no adjudica, no puntua.
- **Depende de:** `contrato-puntual`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`
- **B · module.json:** `name: "incidencia-reparto"` · `subscribes:` ["incidencia-reparto.abrir.request", "project.activated"] · `publishes:` ["incidencia-reparto.abrir.response", "incidencia-reparto.abrir.failed", "bocaos.incidencia_abierta"]
- **C · index.js:** `class IncidenciaReparto extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_abrir` (F06: cualquiera de las dos partes puede abrirla; ninguna puede cerrarla sin dictamen)
- **E · handler:** `onAbrirRequest(e) → this._atender(e,'abrir','incidencia-reparto.abrir.response', d=>this._abrir(d))` · **CLASE: ORDEN** — F06: abre el caso con pedido, relato, autor y hora
- **Sube (pide a otras hojas):** `cola-sala.encolar.request`
- **F · hechos que publica:** `bocaos.incidencia_abierta`
- **Escucha (dominio):** —
- **VERIFICACIÓN:** incidencia abierta -> `bocaos.incidencia_abierta` y caso en la cola; ningun estado de cargo o contrato cambiado.

#### `lectura-incidencia` · `MICRO-AGENTE` · acción **CONSTRUIR**

- **Clases:** F07
- **Propósito:** El agente que clasifica un relato libre en campos CERRADOS que la cola ya tiene. Si cae, el caso entra sin clasificar.
- **Depende de:** `incidencia-reparto`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`
- **B · module.json:** `name: "lectura-incidencia"` · `subscribes:` ["lectura-incidencia.clasificar.request", "bocaos.incidencia_abierta", "project.activated"] · `publishes:` ["lectura-incidencia.clasificar.response", "lectura-incidencia.clasificar.failed", "bocaos.incidencia_clasificada"]
- **C · index.js:** `class LecturaIncidencia extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_validar` (F07: un campo nuevo se RECHAZA, no se inventa; no puntua, no adjudica, no decide a quien culpar) · `cajon_clasificar` (mitad fuzzy (blueprint): solo el campo, nunca la culpa)
- **E · handler:** `onClasificarRequest(e) → this._atender(e,'clasificar','lectura-incidencia.clasificar.response', d=>this._clasificar(d))` · **CLASE: ORDEN** — F07: relato libre -> campo cerrado ya existente (no encontraba el portal, el cliente no bajaba, el local no estaba listo, direccion incorrecta, otro)
- **F · hechos que publica:** `bocaos.incidencia_clasificada`
- **Escucha (dominio):** `bocaos.incidencia_abierta`
- **VERIFICACIÓN:** relato que no encaja en ningun campo -> devuelve 'otro', no un campo nuevo; sin blueprint la incidencia sigue su curso.

### ▸ EJE `fallo` — medir, no juzgar (3)

#### `regla-fallo` · `REFLEJO` · acción **CONSTRUIR**

- **Clases:** G02 · G03 · G06
- **Propósito:** No juzga, mide: cruza hechos con la ventana declarada, aplica la tabla de quien paga y exige trazabilidad.
- **Depende de:** `config-mercado`, `hechos-reparto`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`
- **B · module.json:** `name: "regla-fallo"` · `subscribes:` ["regla-fallo.medir.request", "regla-fallo.aplicar.request", "regla-fallo.trazar.request", "bocaos.hecho_reparto_anotado", "bocaos.acta_incompleta", "bocaos.hecho_desmentido", "bocaos.promesa_guardada", "project.activated"] · `publishes:` ["regla-fallo.medir.response", "regla-fallo.medir.failed", "regla-fallo.aplicar.response", "regla-fallo.aplicar.failed", "regla-fallo.trazar.response", "regla-fallo.trazar.failed", "bocaos.fallo_medido", "bocaos.fallo_adjudicado"]
- **C · index.js:** `class ReglaFallo extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_medir` (G02: solo hechos CON HORA; si falta uno es NO_CONSTA, nunca 'seguramente se paso') · `_aplicar` (G03: es una TABLA con una prueba por fila, no un agente que opina sobre la culpa. N1/N2/N3 de Q28 (8/5/10 min)) · `_importe` (G03: mientras los importes no existan, devuelve 'quien' pero no 'cuanto': cargo sin importe, no numero inventado) · `_trazar` (G06: si el hecho es posterior al cargo o fue desmentido, falla. Es la diferencia entre un cargo y un abuso)
- **E · handler:** `onMedirRequest(e) → this._atender(e,'medir','regla-fallo.medir.response', d=>this._medir(d))` · **CLASE: PREGUNTA** — G02: hechos + ventana -> excedido si/no + minutos | NO_CONSTA
- **E · handler:** `onAplicarRequest(e) → this._atender(e,'aplicar','regla-fallo.aplicar.response', d=>this._aplicar(d))` · **CLASE: PREGUNTA** — G03: exceso + parte -> fila de la tabla: quien paga cuanto a quien
- **E · handler:** `onTrazarRequest(e) → this._atender(e,'trazar','regla-fallo.trazar.response', d=>this._trazar(d))` · **CLASE: PREGUNTA** — G06: revisa el cargo; sin hecho anterior y no desmentido, FALLA
- **Sube (pide a otras hojas):** `config-mercado.politica.request`, `hechos-reparto.acta.request`
- **F · hechos que publica:** `bocaos.fallo_medido`, `bocaos.fallo_adjudicado`
- **Escucha (dominio):** `bocaos.hecho_reparto_anotado`, `bocaos.acta_incompleta`, `bocaos.hecho_desmentido`, `bocaos.promesa_guardada`
- **VERIFICACIÓN:** cargo sin evidencia -> FALLA; exceso de 0 min -> no hay fallo; acta incompleta -> no se mide, se retira el cargo (Q30).

#### `cargo-fallo` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** G04
- **Propósito:** La deuda entre dos partes, con evidencia. Sin evidencia no hay cargo; nace como deuda, no como descuento.
- **Depende de:** `regla-fallo`, `cobro-gestion`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "cargo-fallo"` · `subscribes:` ["cargo-fallo.anotar.request", "cargo-fallo.ver.request", "cargo-fallo.efectivo.request", "bocaos.fallo_adjudicado", "bocaos.acta_incompleta", "project.activated"] · `publishes:` ["cargo-fallo.anotar.response", "cargo-fallo.anotar.failed", "cargo-fallo.ver.response", "cargo-fallo.ver.failed", "cargo-fallo.efectivo.response", "cargo-fallo.efectivo.failed", "bocaos.cargo_anotado", "bocaos.cargo_sin_evidencia"]
- **C · index.js:** `class CargoFallo extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/cargo-fallo.json` por proyecto.
- **D · proyecciones internas:** `_anotar` (G04: sin evidencia -> SIN_EVIDENCIA y no hay cargo. Deuda, no descuento: Bocaos no retiene) · `_efectivo` (Q29: revertir exige SALDO; por eso el cobro es semanal (colchon) y la deuda no puede superar lo que va a cobrar) · `_tope` (Q29: si el rider no tiene saldo, la deuda queda visible en su cuenta, no se inventa un cobro)
- **E · handler:** `onAnotarRequest(e) → this._atender(e,'anotar','cargo-fallo.anotar.response', d=>this._anotar(d))` · **CLASE: ORDEN** — G04: anota la deuda con su evidencia y su hora
- **E · handler:** `onVerRequest(e) → this._atender(e,'ver','cargo-fallo.ver.response', d=>this._ver(d))` · **CLASE: PREGUNTA** — G04: deudas de una parte
- **E · handler:** `onEfectivoRequest(e) → this._atender(e,'efectivo','cargo-fallo.efectivo.response', d=>this._efectivo(d))` · **CLASE: ORDEN** — Q29: hace efectivo el cargo con un transfer_reversal, con la traza como justificante
- **Sube (pide a otras hojas):** `regla-fallo.aplicar.request`, `regla-fallo.trazar.request`, `cobro-gestion.revertir.request`
- **F · hechos que publica:** `bocaos.cargo_anotado`, `bocaos.cargo_sin_evidencia`
- **Escucha (dominio):** `bocaos.fallo_adjudicado`, `bocaos.acta_incompleta`
- **VERIFICACIÓN:** cargo sin evidencia -> 409; cargo de 30 EUR con saldo de 10 -> revertir 10 y dejar 20 como deuda visible.

#### `disputa-fallo` · `PUENTE` · acción **CONSTRUIR**

- **Clases:** G05
- **Propósito:** Pone la deuda delante de alguien. No re-juzga, no reabre un caso cerrado sin hecho nuevo, no cambia la tabla.
- **Depende de:** `cargo-fallo`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`
- **B · module.json:** `name: "disputa-fallo"` · `subscribes:` ["disputa-fallo.llevar.request", "bocaos.cargo_anotado", "project.activated"] · `publishes:` ["disputa-fallo.llevar.response", "disputa-fallo.llevar.failed", "bocaos.disputa_abierta"]
- **C · index.js:** `class DisputaFallo extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_llevar` (G05: quien disputa discute la REGLA, no el hecho: si discute el hecho, el acta zanja) · `_sin_rejuzgar` (G05: no reabre un caso cerrado sin un hecho nuevo)
- **E · handler:** `onLlevarRequest(e) → this._atender(e,'llevar','disputa-fallo.llevar.response', d=>this._llevar(d))` · **CLASE: ORDEN** — G05: lleva la deuda a la cola con autor y motivo; plazo 48 h (Q24)
- **Sube (pide a otras hojas):** `cargo-fallo.ver.request`, `cola-sala.encolar.request`
- **F · hechos que publica:** `bocaos.disputa_abierta`
- **Escucha (dominio):** `bocaos.cargo_anotado`
- **VERIFICACIÓN:** disputa abierta -> caso en cola con la traza; la tabla no cambia.

### ▸ EJE `dinero` — el único dinero de Bocaos (3)

#### `liquidacion` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** H01 · H02 · H05 · E04 · E05 · A32 · H06
- **Propósito:** El UNICO dinero de Bocaos: devengo por pedido aceptado, ciclo semanal inmutable y mora. Nunca el ticket, nunca el reparto.
- **Depende de:** `scheduler`, `contrato-tramos`, `cargo-fallo`, `tarifa-pedido`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`, `scheduler`
- **B · module.json:** `name: "liquidacion"` · `subscribes:` ["liquidacion.abrir.request", "liquidacion.devengo.request", "liquidacion.cerrar.request", "liquidacion.mora.request", "scheduler.job.triggered", "bocaos.cargo_anotado", "bocaos.tramos_declarados", "bocaos.cobro_fallido", "project.activated"] · `publishes:` ["liquidacion.abrir.response", "liquidacion.abrir.failed", "liquidacion.devengo.response", "liquidacion.devengo.failed", "liquidacion.cerrar.response", "liquidacion.cerrar.failed", "liquidacion.mora.response", "liquidacion.mora.failed", "bocaos.ciclo_abierto", "bocaos.cierre_semanal", "bocaos.devengo_calculado"]
- **C · index.js:** `class Liquidacion extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/liquidacion.json` por proyecto.
- **D · proyecciones internas:** `_devengo` (H01: pedidos ACEPTADOS x tarifa del contrato vigente + la parte del fijo; jamas km, viajes ni % del ticket) · `_dos_cifras` (H01: lo que se devenga sin discusion y lo que depende de una pregunta abierta. NO elige: elegir es del dueno y queda en acta) · `_cerrar` (H02: un periodo cerrado no se reabre; una correccion es una nota en el periodo siguiente) · `_mora` (H05: la suspension corta la ENTRADA de pedidos nuevos, nunca los pedidos en vuelo ni las propuestas vivas) · `_no_retencion` (H06: falla si un cobro de Bocaos se calcula como % del ticket o si un pago al rider pasa por una cuenta de Bocaos) · `_no_captura_ahorro` (A32: la cuota es por pedido aceptado; km ahorrados o pedidos enlazados -> FALLA)
- **E · handler:** `onAbrirRequest(e) → this._atender(e,'abrir','liquidacion.abrir.response', d=>this._abrir(d))` · **CLASE: ORDEN** — H02: abre el periodo
- **E · handler:** `onDevengoRequest(e) → this._atender(e,'devengo','liquidacion.devengo.response', d=>this._devengo(d))` · **CLASE: PREGUNTA** — H01: acumula por parte y periodo -> {seguro, en duda, detalle}
- **E · handler:** `onCerrarRequest(e) → this._atender(e,'cerrar','liquidacion.cerrar.response', d=>this._cerrar(d))` · **CLASE: ORDEN** — H02: cierra el periodo -> Cierre INMUTABLE
- **E · handler:** `onMoraRequest(e) → this._atender(e,'mora','liquidacion.mora.response', d=>this._mora(d))` · **CLASE: PREGUNTA** — H05: deuda + dias -> recordatorio | recargo | suspension
- **Sube (pide a otras hojas):** `contrato-tramos.vigente.request`, `cargo-fallo.ver.request`, `tarifa-pedido.precio.request`
- **F · hechos que publica:** `bocaos.ciclo_abierto`, `bocaos.cierre_semanal`, `bocaos.devengo_calculado`
- **Escucha (dominio):** `scheduler.job.triggered`, `bocaos.cargo_anotado`, `bocaos.tramos_declarados`, `bocaos.cobro_fallido`
- **VERIFICACIÓN:** pedido sin aceptacion -> no devenga; cerrar y volver a cerrar -> 409; guarda H06 en rojo si se inyecta un % del ticket.
- **NO REUTILIZA / DECISIÓN:** Q29 explica por que el cobro es SEMANAL y no inmediato: el colchon de dias es lo que hace posible revertir un fallo. La liquidacion no es comodidad administrativa, es la condicion del cargo.

#### `factura-gestion` · `CONVERSOR` · acción **CONSTRUIR**

- **Clases:** H03
- **Propósito:** Devengo -> documento de cobro de LA CUOTA. Ni una linea mas, ni un concepto nuevo.
- **Depende de:** `liquidacion`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`
- **B · module.json:** `name: "factura-gestion"` · `subscribes:` ["factura-gestion.emitir.request", "bocaos.cierre_semanal", "project.activated"] · `publishes:` ["factura-gestion.emitir.response", "factura-gestion.emitir.failed", "bocaos.factura_emitida"]
- **C · index.js:** `class FacturaGestion extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_emitir` (H03: solo lo devengado en ese cierre; con IVA y forma juridica marcados como pendientes, no inventados)
- **E · handler:** `onEmitirRequest(e) → this._atender(e,'emitir','factura-gestion.emitir.response', d=>this._emitir(d))` · **CLASE: ORDEN** — H03: emite el documento de una parte para un cierre
- **Sube (pide a otras hojas):** `liquidacion.devengo.request`
- **F · hechos que publica:** `bocaos.factura_emitida`
- **Escucha (dominio):** `bocaos.cierre_semanal`
- **VERIFICACIÓN:** el documento no contiene ningun importe de comida ni de reparto; con IVA por declarar, los campos salen vacios y marcados.

#### `cobro-gestion` · `PUENTE` · acción **ADAPTAR**

- **Clases:** H04
- **Propósito:** Cobra LO SUYO y solo lo suyo, por el canal que cada parte declare. Y revierte un fallo con su traza.
- **Depende de:** `contrato-tramos`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`, `pago-gateway`, `credential-manager`
- **B · module.json:** `name: "cobro-gestion"` · `subscribes:` ["cobro-gestion.cobrar.request", "cobro-gestion.revertir.request", "bocaos.cargo_anotado", "bocaos.cierre_semanal", "bocaos.factura_emitida", "project.activated"] · `publishes:` ["cobro-gestion.cobrar.response", "cobro-gestion.cobrar.failed", "cobro-gestion.revertir.response", "cobro-gestion.revertir.failed", "bocaos.cobro_realizado", "bocaos.cobro_fallido"]
- **C · index.js:** `class CobroGestion extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_cobrar` (H04: nunca del importe de comida ni del de reparto (H06); un cobro fallido no cambia lo devengado, cambia la deuda) · `_revertir` (Q29: requiere saldo en la cuenta conectada; si no hay, no se inventa) · `_canal` (H04: la cuenta conectada (Stripe) es de la parte, no de Bocaos)
- **E · handler:** `onCobrarRequest(e) → this._atender(e,'cobrar','cobro-gestion.cobrar.response', d=>this._cobrar(d))` · **CLASE: ORDEN** — H04: cobra el documento de una parte por su canal
- **E · handler:** `onRevertirRequest(e) → this._atender(e,'revertir','cobro-gestion.revertir.response', d=>this._revertir(d))` · **CLASE: ORDEN** — Q29: transfer_reversal con la traza del fallo como justificante
- **Sube (pide a otras hojas):** `pago-gateway.pago.iniciar.request`, `pago-gateway.pago.reembolsar.request`
- **F · hechos que publica:** `bocaos.cobro_realizado`, `bocaos.cobro_fallido`
- **Escucha (dominio):** `bocaos.cargo_anotado`, `bocaos.cierre_semanal`, `bocaos.factura_emitida`
- **VERIFICACIÓN:** cobro fallido -> `bocaos.cobro_fallido` y la deuda sube pero el devengo no cambia; revertir sin saldo -> deuda visible, no cobro.
- **NO REUTILIZA / DECISIÓN:** ADAPTAR `pago-gateway` (v3.1.0): ya cobra por proyecto con credencial y conciliacion (pago.iniciar / pago.reembolsar / pago.confirmado). Se le anade `revertir` (transfer_reversal sobre la cuenta conectada, Q29) y el canal por parte. NO se reutiliza su libro de cobros como libro de Bocaos: la cuota tiene su propio cierre inmutable.

### ▸ EJE `medida` — la lectura del mercado (5)

#### `puntualidad-tienda` · `REFLEJO` · acción **CONSTRUIR**

- **Clases:** L03
- **Propósito:** La cocina, publicada como DISTRIBUCION y no como nota. Es el bucle que corrige el mercado sin que nadie sancione.
- **Depende de:** `hora-listo`, `hechos-reparto`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`
- **B · module.json:** `name: "puntualidad-tienda"` · `subscribes:` ["puntualidad-tienda.medir.request", "bocaos.pedido_listo", "bocaos.hecho_reparto_anotado", "project.activated"] · `publishes:` ["puntualidad-tienda.medir.response", "puntualidad-tienda.medir.failed", "bocaos.puntualidad_publicada"]
- **C · index.js:** `class PuntualidadTienda extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_medir` (L03: publica distribucion, no un 3 sobre 5. Sin datos suficientes -> NO_CONSTA y el rider ve 'sin historico') · `_por_tienda` (Q31: el historico es de CADA tienda por separado; una tienda lenta no contamina a la de al lado)
- **E · handler:** `onMedirRequest(e) → this._atender(e,'medir','puntualidad-tienda.medir.response', d=>this._medir(d))` · **CLASE: PREGUNTA** — L03: tienda + franja -> distribucion de hora-de-listo frente a lo prometido, con n
- **Sube (pide a otras hojas):** `hora-listo.hecho.request`, `hechos-reparto.acta.request`
- **F · hechos que publica:** `bocaos.puntualidad_publicada`
- **Escucha (dominio):** `bocaos.pedido_listo`, `bocaos.hecho_reparto_anotado`
- **VERIFICACIÓN:** mercado nuevo -> NO_CONSTA (no 0, no media del mercado); 20 pedidos -> distribucion con n=20.

#### `panel-tienda` · `REFLEJO` · acción **CONSTRUIR**

- **Clases:** L01
- **Propósito:** Lo que ve la tienda es EXACTAMENTE lo que ve el rider antes de aceptar: misma fuente, mismo numero, sin version amable.
- **Depende de:** `puntualidad-tienda`, `propuesta`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`
- **B · module.json:** `name: "panel-tienda"` · `subscribes:` ["panel-tienda.ver.request", "bocaos.propuesta_emitida", "bocaos.puntualidad_publicada", "project.activated"] · `publishes:` ["panel-tienda.ver.response", "panel-tienda.ver.failed"]
- **C · index.js:** `class PanelTienda extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_ver` (L01: misma fuente que `enlace` y que `propuesta.vista`; sin version amable) · `_sin_competencia` (L01/P02: la vista de una tienda no muestra a sus competidoras)
- **E · handler:** `onVerRequest(e) → this._atender(e,'ver','panel-tienda.ver.response', d=>this._ver(d))` · **CLASE: PREGUNTA** — L01: espera medida, puntualidad, propuestas recibidas y pedidos sin rider
- **Sube (pide a otras hojas):** `puntualidad-tienda.medir.request`, `propuesta.vista.request`
- **F · hechos que publica:** — (ninguno: sólo calcula)
- **Escucha (dominio):** `bocaos.propuesta_emitida`, `bocaos.puntualidad_publicada`
- **VERIFICACIÓN:** la espera del panel == la espera de la propuesta == la de la salud del mercado (mismo numero, tres lecturas).

#### `resumen-tienda` · `MICRO-AGENTE` · acción **CONSTRUIR**

- **Clases:** L04
- **Propósito:** El agente que cuenta en palabras lo que ya esta medido. Todo numero citado tiene que existir en los hechos.
- **Depende de:** `panel-tienda`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`
- **B · module.json:** `name: "resumen-tienda"` · `subscribes:` ["resumen-tienda.redactar.request", "project.activated"] · `publishes:` ["resumen-tienda.redactar.response", "resumen-tienda.redactar.failed"]
- **C · index.js:** `class ResumenTienda extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_validar` (L04: el agente no descubre nada; no aconseja, no compara con otras tiendas, no opina sobre la cocina) · `cajon_redactar` (mitad fuzzy (blueprint): el parrafo)
- **E · handler:** `onRedactarRequest(e) → this._atender(e,'redactar','resumen-tienda.redactar.response', d=>this._redactar(d))` · **CLASE: ORDEN** — L04: hechos medidos + periodo -> parrafo
- **Sube (pide a otras hojas):** `panel-tienda.ver.request`
- **F · hechos que publica:** — (ninguno: sólo calcula)
- **Escucha (dominio):** —
- **VERIFICACIÓN:** un numero que no esta en los hechos hace fallar el validador; sin blueprint el panel L01 sigue estando.

#### `salud-mercado` · `REFLEJO` · acción **CONSTRUIR**

- **Clases:** I05 · I06 · O01 · N01
- **Propósito:** La medida maestra del negocio y los 8 pares de la F0: propuestas aceptadas por emitida, huecos y pedidos sin propuesta. NO_CONSTA no es cero.
- **Depende de:** `propuesta`, `enlace`, `pedido`, `liquidacion`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`, `metricas`
- **B · module.json:** `name: "salud-mercado"` · `subscribes:` ["salud-mercado.ver.request", "salud-mercado.fricciones.request", "salud-mercado.cuadro.request", "salud-mercado.densidad.request", "bocaos.propuesta_emitida", "bocaos.hueco_nombrado", "bocaos.cierre_semanal", "bocaos.enlace_agotado", "bocaos.acta_asentada", "bocaos.medidas_calculadas", "bocaos.enlace_completado", "bocaos.escalada_peldano", "bocaos.fallo_medido", "bocaos.propuesta_no_entregada", "project.activated"] · `publishes:` ["salud-mercado.ver.response", "salud-mercado.ver.failed", "salud-mercado.fricciones.response", "salud-mercado.fricciones.failed", "salud-mercado.cuadro.response", "salud-mercado.cuadro.failed", "salud-mercado.densidad.response", "salud-mercado.densidad.failed"]
- **C · index.js:** `class SaludMercado extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_salud` (I05: lo que no consta aparece como NO_CONSTA, nunca como cero: un cero en 'pedidos sin propuesta' hace parecer sano un mercado sin datos) · `_fricciones` (I06: cada par con su numero y su hueco; el tablero no rellena) · `_cuadro` (O01: muestra tendencia, no solo valor; 'pedidos que nunca tuvieron propuesta' sale de A34) · `_densidad` (N01: nombra el problema, no lo resuelve; la decision de abrir o cerrar va al acta (O02))
- **E · handler:** `onVerRequest(e) → this._atender(e,'ver','salud-mercado.ver.response', d=>this._ver(d))` · **CLASE: PREGUNTA** — I05: aceptadas/emitidas, propuestas por aceptacion, riders activos, esperas, devengado, pedidos sin propuesta
- **E · handler:** `onFriccionesRequest(e) → this._atender(e,'fricciones','salud-mercado.fricciones.response', d=>this._fricciones(d))` · **CLASE: PREGUNTA** — I06: los 8 pares de interlocutores, medidos, con su hueco
- **E · handler:** `onCuadroRequest(e) → this._atender(e,'cuadro','salud-mercado.cuadro.response', d=>this._cuadro(d))` · **CLASE: PREGUNTA** — O01: el cuadro del jefe, con tendencia
- **E · handler:** `onDensidadRequest(e) → this._atender(e,'densidad','salud-mercado.densidad.response', d=>this._densidad(d))` · **CLASE: PREGUNTA** — N01: riders activos por pedido en una zona; dice cuando NO abrir, no la cierra
- **Sube (pide a otras hojas):** `propuesta.revisar.request`, `enlace.guardas.request`, `liquidacion.devengo.request`, `pedido.ver.request`, `censo-parte.checklist.request`
- **F · hechos que publica:** — (ninguno: sólo calcula)
- **Escucha (dominio):** `bocaos.propuesta_emitida`, `bocaos.hueco_nombrado`, `bocaos.cierre_semanal`, `bocaos.enlace_agotado`, `bocaos.acta_asentada`, `bocaos.medidas_calculadas`, `bocaos.enlace_completado`, `bocaos.escalada_peldano`, `bocaos.fallo_medido`, `bocaos.propuesta_no_entregada`
- **VERIFICACIÓN:** mercado sin datos -> todos los campos NO_CONSTA (ningun 0); tras 10 propuestas, aceptadas/emitidas coincide con `propuesta.revisar`.

#### `cuenta-parte` · `REFLEJO` · acción **CONSTRUIR**

- **Clases:** Q01 · M01
- **Propósito:** La cuenta de cada parte, con evidencia: lo que debe a Bocaos y lo que Bocaos le debe. Un centimo, una vista.
- **Depende de:** `liquidacion`, `cargo-fallo`, `contrato-puntual`, `hechos-reparto`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`
- **B · module.json:** `name: "cuenta-parte"` · `subscribes:` ["cuenta-parte.ver.request", "cuenta-parte.cartera.request", "bocaos.cargo_anotado", "bocaos.cierre_semanal", "bocaos.contrato_cerrado", "bocaos.prueba_anotada", "bocaos.devengo_calculado", "bocaos.cobro_realizado", "project.activated"] · `publishes:` ["cuenta-parte.ver.response", "cuenta-parte.ver.failed", "cuenta-parte.cartera.response", "cuenta-parte.cartera.failed"]
- **C · index.js:** `class CuentaParte extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_ver` (Q01: lo que no consta se muestra como 'sin evidencia', no como cero; el cliente final NO tiene cuenta) · `_cartera` (M01: cada centimo apunta a un contrato; distingue GANADO (con prueba) de RECLAMADO (entregado sin prueba, Q30) y de PENDIENTE) · `_una_cifra` (Q01/M01: un solo calculo para las dos caras; dos modulos darian dos saldos)
- **E · handler:** `onVerRequest(e) → this._atender(e,'ver','cuenta-parte.ver.response', d=>this._ver(d))` · **CLASE: PREGUNTA** — Q01: devengado, facturado, cobrado, pendiente, cargos y saldo, cada importe con su hecho
- **E · handler:** `onCarteraRequest(e) → this._atender(e,'cartera','cuenta-parte.cartera.response', d=>this._cartera(d))` · **CLASE: PREGUNTA** — M01: ganado, reclamado, pendiente de cobro, deudas y neto del rider
- **Sube (pide a otras hojas):** `liquidacion.devengo.request`, `cargo-fallo.ver.request`, `contrato-puntual.vivos.request`, `hechos-reparto.acta.request`
- **F · hechos que publica:** — (ninguno: sólo calcula)
- **Escucha (dominio):** `bocaos.cargo_anotado`, `bocaos.cierre_semanal`, `bocaos.contrato_cerrado`, `bocaos.prueba_anotada`, `bocaos.devengo_calculado`, `bocaos.cobro_realizado`
- **VERIFICACIÓN:** saldo del rider == devengo - cargos - cobrado; sin factura el campo es 'sin evidencia'.

### ▸ EJE `operacion` — la operación mínima y la revisión humana (4)

#### `cola-sala` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** P01 · P02 · O03
- **Propósito:** UNA sola cola de lo atascado (incidencia, disputa, alta incompleta, pedido sin rider) y la revision humana desde el dia uno.
- **Depende de:** `censo-parte`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "cola-sala"` · `subscribes:` ["cola-sala.encolar.request", "cola-sala.siguiente.request", "cola-sala.cerrar.request", "cola-sala.ver.request", "cola-sala.revisar.request", "bocaos.enlace_agotado", "bocaos.incidencia_abierta", "bocaos.disputa_abierta", "bocaos.cargo_sin_evidencia", "bocaos.censo_incompleto", "bocaos.pedido_rechazado", "bocaos.aviso_tienda_fallido", "bocaos.aviso_cliente_fallido", "bocaos.incidencia_clasificada", "bocaos.escalada_agotada", "bocaos.aviso_sala_vencido", "project.activated"] · `publishes:` ["cola-sala.encolar.response", "cola-sala.encolar.failed", "cola-sala.siguiente.response", "cola-sala.siguiente.failed", "cola-sala.cerrar.response", "cola-sala.cerrar.failed", "cola-sala.ver.response", "cola-sala.ver.failed", "cola-sala.revisar.response", "cola-sala.revisar.failed", "bocaos.caso_encolado", "bocaos.caso_cerrado", "bocaos.revision_solicitada"]
- **C · index.js:** `class ColaSala extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/cola-sala.json` por proyecto.
- **D · proyecciones internas:** `_encolar` (P01: una sola cola, no tres bandejas. Prioridad por hechos, no por quien llama mas) · `_vencer` (O03: si vence, sube de prioridad y SIGUE VIVA; no se cierra sola ni se resuelve por defecto) · `_vista_parte` (P02: incluye las propuestas que no llegaron a nada CON SU TRAZA (A16+A34); eso no es excusa, es diagnostico) · `_cierre` (P01: sale con dictamen, cargo o alta completada)
- **E · handler:** `onEncolarRequest(e) → this._atender(e,'encolar','cola-sala.encolar.response', d=>this._encolar(d))` · **CLASE: ORDEN** — P01: encola el caso con tipo, hora, pedidos afectados y traza
- **E · handler:** `onSiguienteRequest(e) → this._atender(e,'siguiente','cola-sala.siguiente.response', d=>this._siguiente(d))` · **CLASE: PREGUNTA** — P01: siguiente caso por prioridad de HECHOS (tiempo esperando, pedidos afectados)
- **E · handler:** `onCerrarRequest(e) → this._atender(e,'cerrar','cola-sala.cerrar.response', d=>this._cerrar(d))` · **CLASE: ORDEN** — P01: un caso sale con un hecho que lo cierra, no porque alguien lo borre
- **E · handler:** `onVerRequest(e) → this._atender(e,'ver','cola-sala.ver.response', d=>this._ver(d))` · **CLASE: PREGUNTA** — P02: todo lo de una parte en una pantalla, con la traza de lo que no llego a nada
- **E · handler:** `onRevisarRequest(e) → this._atender(e,'revisar','cola-sala.revisar.response', d=>this._revisar(d))` · **CLASE: ORDEN** — O03: cualquier parte pide revisar una decision automatica que le afecto; con dueno y plazo (Q25)
- **Sube (pide a otras hojas):** `censo-parte.de.request`, `propuesta.revisar.request`
- **F · hechos que publica:** `bocaos.caso_encolado`, `bocaos.caso_cerrado`, `bocaos.revision_solicitada`
- **Escucha (dominio):** `bocaos.enlace_agotado`, `bocaos.incidencia_abierta`, `bocaos.disputa_abierta`, `bocaos.cargo_sin_evidencia`, `bocaos.censo_incompleto`, `bocaos.pedido_rechazado`, `bocaos.aviso_tienda_fallido`, `bocaos.aviso_cliente_fallido`, `bocaos.incidencia_clasificada`, `bocaos.escalada_agotada`, `bocaos.aviso_sala_vencido`
- **VERIFICACIÓN:** una incidencia y una disputa caen en la MISMA cola; un caso sin hecho no se puede cerrar; vencido sube prioridad y no desaparece.
- **NO REUTILIZA / DECISIÓN:** Se funden P01 y O03: P01 dice literalmente 'UNA sola cola, no tres bandejas'. Dos custodios de cola serian dos colas. Y se evaluo `cola` (cola de impresion 3D, FIFO+urgencia): mismo patron, otro dominio, hardcodeada a impresiones -> se toma el patron y se construye.

#### `aviso-sala` · `PUENTE` · acción **CONSTRUIR**

- **Clases:** I07
- **Propósito:** Avisa CON LA TRAZA y con plazo. Si vence, el caso sube de prioridad y sigue vivo. Destinatario por defecto: agentes (Q40).
- **Depende de:** `cola-sala`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `filesystem`, `project-manager`, `telegram-bridge`
- **B · module.json:** `name: "aviso-sala"` · `subscribes:` ["aviso-sala.avisar.request", "bocaos.caso_encolado", "bocaos.revision_solicitada", "project.activated"] · `publishes:` ["aviso-sala.avisar.response", "aviso-sala.avisar.failed", "bocaos.aviso_sala_entregado", "bocaos.aviso_sala_vencido"]
- **C · index.js:** `class AvisoSala extends ModuloHibridoReflejo` (sin store propio)
- **D · proyecciones internas:** `_avisar` (I07: sin traza la sala solo puede improvisar) · `_plazo` (I07/Q40: si vence sin respuesta, sube prioridad y sigue vivo; el destinatario por defecto es un agente, no una persona despierta a las 22:00)
- **E · handler:** `onAvisarRequest(e) → this._atender(e,'avisar','aviso-sala.avisar.response', d=>this._avisar(d))` · **CLASE: ORDEN** — I07: caso + traza + plazo -> aviso al canal declarado
- **Sube (pide a otras hojas):** `cola-sala.ver.request`
- **F · hechos que publica:** `bocaos.aviso_sala_entregado`, `bocaos.aviso_sala_vencido`
- **Escucha (dominio):** `bocaos.caso_encolado`, `bocaos.revision_solicitada`
- **VERIFICACIÓN:** aviso sin destinatario humano -> entregado a agente; vencido -> `bocaos.aviso_sala_vencido` y el caso sigue en cola.

#### `accion-sancion` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** P03
- **Propósito:** Suspender exige motivo, plazo y acta. No toca pedidos en vuelo y no puede ser 'por tasa de rechazo'.
- **Depende de:** `acta-decisiones`, `cola-sala`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "accion-sancion"` · `subscribes:` ["accion-sancion.suspender.request", "accion-sancion.ver.request", "bocaos.caso_cerrado", "project.activated"] · `publishes:` ["accion-sancion.suspender.response", "accion-sancion.suspender.failed", "accion-sancion.ver.response", "accion-sancion.ver.failed", "bocaos.parte_sancionada"]
- **C · index.js:** `class AccionSancion extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/accion-sancion.json` por proyecto.
- **D · proyecciones internas:** `_suspender` (P03: sin acta -> 409. No corta pedidos en vuelo ni propuestas vivas) · `_no_por_rechazo` (P03: 'por tasa de rechazo' -> 409; rechazar es un derecho (A21))
- **E · handler:** `onSuspenderRequest(e) → this._atender(e,'suspender','accion-sancion.suspender.response', d=>this._suspender(d))` · **CLASE: ORDEN** — P03: suspende a una parte con motivo, plazo y acta
- **E · handler:** `onVerRequest(e) → this._atender(e,'ver','accion-sancion.ver.response', d=>this._ver(d))` · **CLASE: PREGUNTA** — P03: sanciones vigentes de una parte
- **Sube (pide a otras hojas):** `acta-decisiones.asentar.request`, `cola-sala.ver.request`
- **F · hechos que publica:** `bocaos.parte_sancionada`
- **Escucha (dominio):** `bocaos.caso_cerrado`
- **VERIFICACIÓN:** suspender sin acta -> 409; suspender por tasa de rechazo -> 409; el pedido en vuelo de la parte sigue vivo.

#### `dictamen-revision` · `CUSTODIO` · acción **CONSTRUIR**

- **Clases:** O04
- **Propósito:** El hecho firmado que cierra una revision. Firma el dueno y cambia LA REGLA, no el caso (Q26).
- **Depende de:** `acta-decisiones`, `cola-sala`, `config-mercado`
- **A · dependencias:** deps por EVENTO (`request`/`response`), nunca `require`. Bases: `_shared/modulo-hibrido-reflejo`, `_shared/pos-persistencia`, `filesystem`, `project-manager`
- **B · module.json:** `name: "dictamen-revision"` · `subscribes:` ["dictamen-revision.dictaminar.request", "dictamen-revision.de.request", "bocaos.revision_solicitada", "project.activated"] · `publishes:` ["dictamen-revision.dictaminar.response", "dictamen-revision.dictaminar.failed", "dictamen-revision.de.response", "dictamen-revision.de.failed", "bocaos.dictamen_firmado"]
- **C · index.js:** `class DictamenRevision extends ModuloHibridoReflejo` + `PosPersistencia` (`project.activated` / `onUnload` flush). Store en `/bocaos/dictamen-revision.json` por proyecto.
- **D · proyecciones internas:** `_dictaminar` (O04/Q26: efectos permitidos = compensar, corregir un historico mal medido, cambiar la regla HACIA ADELANTE) · `_prohibido` (O04: rehacer la propuesta ya emitida esta PROHIBIDO; si pudiera, el humano seria un planificador (A28)) · `_no_reabre` (Q26: los casos anteriores no se reabren; la regla nueva rige desde su publicacion)
- **E · handler:** `onDictaminarRequest(e) → this._atender(e,'dictaminar','dictamen-revision.dictaminar.response', d=>this._dictaminar(d))` · **CLASE: ORDEN** — O04: caso + firmante + efecto -> hecho firmado
- **E · handler:** `onDeRequest(e) → this._atender(e,'de','dictamen-revision.de.response', d=>this._de(d))` · **CLASE: PREGUNTA** — O04: dictamen de un caso
- **Sube (pide a otras hojas):** `acta-decisiones.asentar.request`, `config-mercado.declarar.request`, `cola-sala.cerrar.request`
- **F · hechos que publica:** `bocaos.dictamen_firmado`
- **Escucha (dominio):** `bocaos.revision_solicitada`
- **VERIFICACIÓN:** dictamen que intenta rehacer una propuesta -> 409; dictamen de regla -> acta + nueva version de politica y casos viejos intactos.

---

## 12 · Orden de construcción

El diseño no se puede construir empezando por el corazón: `enlace` depende de datos que escribe medio negocio. El orden de abajo es **topológicamente válido** (cada hoja va después de sus `depende_de`; lo comprueba la espina) y además sigue los 10 peldaños del §12 de la F3: política → censo → ruta viva → pedido y precio → prueba y fallo → corazón → borde del reparto → dinero → operación → borde amable.

```
 1. scheduler                  micro-agente REUTILIZAR primitiva
 2. acta-decisiones            custodio     CONSTRUIR  O02
 3. config-mercado             custodio     CONSTRUIR  J01, J02, J03, J04, J05, G01
 4. censo-parte                custodio     CONSTRUIR  I01, I02, M02, M03, P04
 5. estado-parte               custodio     CONSTRUIR  I03, I04
 6. terminos-parte             custodio     CONSTRUIR  I08
 7. ruta-viva                  custodio     CONSTRUIR  B01, B02, B03, B04, B05, B06
 8. marca-tienda               custodio     CONSTRUIR  D01
 9. carta-publica              conversor    CONSTRUIR  D02
10. escaparate                 reflejo      CONSTRUIR  D06, D07
11. tarifa-pedido              custodio     CONSTRUIR  E01, E02, E03, E07
12. contrato-tramos            custodio     CONSTRUIR  E06, N02
13. carrito-tienda             custodio     CONSTRUIR  D04, D03
14. registro-cliente           custodio     CONSTRUIR  D05, F05, L02
15. pedido                     custodio     CONSTRUIR  C01, C02, C07, C05
16. hora-listo                 custodio     CONSTRUIR  C04, A01
17. aviso-tienda               puente       CONSTRUIR  C03
18. contrato-puntual           custodio     CONSTRUIR  A24
19. hechos-reparto             custodio     CONSTRUIR  F01, F02, F03
20. puntualidad-tienda         reflejo      CONSTRUIR  L03
21. regla-fallo                reflejo      CONSTRUIR  G02, G03, G06
22. cobro-gestion              puente       ADAPTAR    H04
23. cargo-fallo                custodio     CONSTRUIR  G04
24. disputa-fallo              puente       CONSTRUIR  G05
25. foto-mercado               reflejo      CONSTRUIR  A02, A03, A04
26. propuesta                  custodio     CONSTRUIR  A13, A14, A15, A19, A27, A29, A33, M05
27. redaccion-propuesta        micro-agente CONSTRUIR  A18
28. canal-rider                puente       ADAPTAR    M04
29. escalada-enlace            puente       CONSTRUIR  A26
30. enlace                     micro-agente CONSTRUIR  A05, A06, A07, A08, A09, A10, A11, A12, A16, A17, A20, A21, A22, A23, A25, A28, A30, A31, A34
31. chat-enmascarado           puente       CONSTRUIR  F04
32. incidencia-reparto         puente       CONSTRUIR  F06
33. lectura-incidencia         micro-agente CONSTRUIR  F07
34. liquidacion                custodio     CONSTRUIR  H01, H02, H05, E04, E05, A32, H06
35. factura-gestion            conversor    CONSTRUIR  H03
36. cola-sala                  custodio     CONSTRUIR  P01, P02, O03
37. aviso-sala                 puente       CONSTRUIR  I07
38. accion-sancion             custodio     CONSTRUIR  P03
39. dictamen-revision          custodio     CONSTRUIR  O04
40. aviso-cliente              puente       ADAPTAR    C06, K01, K02
41. panel-tienda               reflejo      CONSTRUIR  L01
42. resumen-tienda             micro-agente CONSTRUIR  L04
43. salud-mercado              reflejo      CONSTRUIR  I05, I06, O01, N01
44. cuenta-parte               reflejo      CONSTRUIR  Q01, M01
```

**La regla del orden:** cada peldaño se puede probar solo. Un mercado con la política, el censo, la ruta viva y el pedido pero sin `enlace` es un mercado que **no propone nada y lo dice** (huecos nombrados). Un mercado con `enlace` y sin lo demás propondría con números inventados — es decir, el negocio contrario a este.

---

## 13 · ESPINA `enki-plan` (JSON embebido — la consume `construir-modulos`)

```json enki-plan
{
 "proyecto": "bocaos",
 "proyecto_id": "bocaos",
 "origen": "boveda/bocaos/proceso/fase3/diseno-oop.md (FASE 3, 115 clases) + fase2/esquemas/esquema.md (FASE 2, 115 piezas) + fase3/Q*.md (Q23-Q43 cerradas)",
 "inventario": "138 module.json inventariados en /home/admin/3enki/modules (maxdepth 2, incluye sub-verticales pizzepos/ prisma/ nichos/); 40 candidatos leidos a fondo por name/subscribes/publishes reales, nunca por el nombre",
 "regla": "clases -> hojas-isla event-driven: CUSTODIO si escribe (uno solo por objeto), PROYECCION INTERNA si solo calcula (jamas helper en _shared/), MICRO-AGENTE si orquesta, PUENTE si cruza al exterior; toda dependencia es evento request/response, nunca require",
 "orden": [
  "scheduler",
  "acta-decisiones",
  "config-mercado",
  "censo-parte",
  "estado-parte",
  "terminos-parte",
  "ruta-viva",
  "marca-tienda",
  "carta-publica",
  "escaparate",
  "tarifa-pedido",
  "contrato-tramos",
  "carrito-tienda",
  "registro-cliente",
  "pedido",
  "hora-listo",
  "aviso-tienda",
  "contrato-puntual",
  "hechos-reparto",
  "puntualidad-tienda",
  "regla-fallo",
  "cobro-gestion",
  "cargo-fallo",
  "disputa-fallo",
  "foto-mercado",
  "propuesta",
  "redaccion-propuesta",
  "canal-rider",
  "escalada-enlace",
  "enlace",
  "chat-enmascarado",
  "incidencia-reparto",
  "lectura-incidencia",
  "liquidacion",
  "factura-gestion",
  "cola-sala",
  "aviso-sala",
  "accion-sancion",
  "dictamen-revision",
  "aviso-cliente",
  "panel-tienda",
  "resumen-tienda",
  "salud-mercado",
  "cuenta-parte"
 ],
 "hojas": [
  {
   "slug": "scheduler",
   "forma": "micro-agente",
   "accion": "REUTILIZAR",
   "reutiliza": [
    "scheduler"
   ],
   "depende_de": [],
   "subscribes": [],
   "publishes": [],
   "proyecciones_internas": [],
   "clases_oop": [],
   "eje": "politica"
  },
  {
   "slug": "acta-decisiones",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
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
     "descripcion": "O02: append-only; si el motivo era falso se asienta otra acta que lo dice"
    },
    {
     "nombre": "_de_instante",
     "descripcion": "O02: que estaba vigente entonces, para explicar una decision vieja"
    }
   ],
   "clases_oop": [
    "O02"
   ],
   "eje": "politica"
  },
  {
   "slug": "config-mercado",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
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
     "nombre": "_politica_vigente",
     "descripcion": "J04: busca por (zona, instante) entre versiones; sin version -> NO_CONSTA"
    },
    {
     "nombre": "_forma",
     "descripcion": "J01: la vertical fija CUATRO umbrales, esas unidades y AND; aqui solo viven los valores"
    },
    {
     "nombre": "_tres_esperas",
     "descripcion": "G01: N1 tienda 8 min, N2 portal 5 min, N3 entrega 10 min (Q28), provisionales"
    },
    {
     "nombre": "_coste_rider",
     "descripcion": "Q41: 0,140 EUR/km por vehiculo declarado y EUR/min DERIVADO del reparto medio de la zona"
    },
    {
     "nombre": "_simular",
     "descripcion": "J05: re-ejecuta la comparacion sobre hechos historicos; declara sus propios limites"
    }
   ],
   "clases_oop": [
    "J01",
    "J02",
    "J03",
    "J04",
    "J05",
    "G01"
   ],
   "eje": "politica"
  },
  {
   "slug": "censo-parte",
   "forma": "custodio",
   "accion": "CONSTRUIR",
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
     "nombre": "_alta",
     "descripcion": "I01/I02: identidad fiscal, marca, catalogo (tienda) / identidad Stripe KYC, autonomo, seguro, vehiculo (rider) Q34"
    },
    {
     "nombre": "_checklist",
     "descripcion": "P04: lista derivada del alta y de lo que el proyecto exige; sin criterios ocultos"
    },
    {
     "nombre": "_sin_exclusividad",
     "descripcion": "M03: falla si aparece exclusividad, permanencia, turno, cuota minima o antiguedad"
    },
    {
     "nombre": "_elegibles_declarados",
     "descripcion": "A04: estado, zona y capacidad. Ni un cuarto dato. Sin antiguedad (Q34: 0)"
    }
   ],
   "clases_oop": [
    "I01",
    "I02",
    "M02",
    "M03",
    "P04"
   ],
   "eje": "partes"
  },
  {
   "slug": "estado-parte",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
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
     "descripcion": "I04: 'ocupado' no lo pone la sala, lo pone el contrato vivo; la pausa solo la declara el rider"
    },
    {
     "nombre": "_vigentes",
     "descripcion": "I03/I04: disponibles por zona; el que esta en pausa no aparece y nadie puede levantarla"
    }
   ],
   "clases_oop": [
    "I03",
    "I04"
   ],
   "eje": "partes"
  },
  {
   "slug": "terminos-parte",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
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
     "descripcion": "I08: cambio de terminos NO retroactivo; quien no acepta la nueva sigue con la vieja"
    },
    {
     "nombre": "_vigentes",
     "descripcion": "I08: puerta dura: sin terminos, propuesta y devengo devuelven NO_CONSTA"
    }
   ],
   "clases_oop": [
    "I08"
   ],
   "eje": "partes"
  },
  {
   "slug": "marca-tienda",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "censo-parte"
   ],
   "subscribes": [
    "marca-tienda.declarar.request",
    "marca-tienda.de.request",
    "project.activated"
   ],
   "publishes": [
    "marca-tienda.declarar.response",
    "marca-tienda.declarar.failed",
    "marca-tienda.de.response",
    "marca-tienda.de.failed",
    "bocaos.marca_declarada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_declarar",
     "descripcion": "D01: el titular es la tienda; una tienda no puede firmar con la marca de otra"
    },
    {
     "nombre": "_de",
     "descripcion": "D01: devuelve NO_CONSTA si no ha declarado; no se rellena con una marca por defecto"
    }
   ],
   "clases_oop": [
    "D01"
   ],
   "eje": "partes"
  },
  {
   "slug": "escaparate",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "censo-parte",
    "estado-parte",
    "carta-publica",
    "marca-tienda"
   ],
   "subscribes": [
    "escaparate.plaza.request",
    "escaparate.neutralidad.request",
    "bocaos.censo_actualizado",
    "bocaos.estado_parte_declarado",
    "project.activated"
   ],
   "publishes": [
    "escaparate.plaza.response",
    "escaparate.plaza.failed",
    "escaparate.neutralidad.response",
    "escaparate.neutralidad.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_plaza",
     "descripcion": "D06: proyeccion del censo; no se escribe, no guarda posiciones"
    },
    {
     "nombre": "_ordena",
     "descripcion": "D07: sin ranking, sin destacados, sin prioridad comprada; ningun campo permite pagar por posicion"
    }
   ],
   "clases_oop": [
    "D06",
    "D07"
   ],
   "eje": "partes"
  },
  {
   "slug": "carta-publica",
   "forma": "conversor",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "censo-parte",
    "marca-tienda"
   ],
   "subscribes": [
    "carta-publica.proyectar.request",
    "bocaos.marca_declarada",
    "project.activated"
   ],
   "publishes": [
    "carta-publica.proyectar.response",
    "carta-publica.proyectar.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_proyectar",
     "descripcion": "D02: el orden de la carta es el de la tienda, no el de Bocaos"
    },
    {
     "nombre": "_podar",
     "descripcion": "D02: podar = publicar/quitar disponibilidad; nunca 'destacar'"
    }
   ],
   "clases_oop": [
    "D02"
   ],
   "eje": "partes"
  },
  {
   "slug": "carrito-tienda",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "carta-publica",
    "tarifa-pedido"
   ],
   "subscribes": [
    "carrito-tienda.anadir.request",
    "carrito-tienda.quitar.request",
    "carrito-tienda.ver.request",
    "carrito-tienda.cerrar.request",
    "project.activated"
   ],
   "publishes": [
    "carrito-tienda.anadir.response",
    "carrito-tienda.anadir.failed",
    "carrito-tienda.quitar.response",
    "carrito-tienda.quitar.failed",
    "carrito-tienda.ver.response",
    "carrito-tienda.ver.failed",
    "carrito-tienda.cerrar.response",
    "carrito-tienda.cerrar.failed",
    "bocaos.precio_cerrado",
    "bocaos.carrito_cerrado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_anadir",
     "descripcion": "D04: un carrito por (cliente, tienda); no existe 'carrito del mercado'"
    },
    {
     "nombre": "_precio_cerrado",
     "descripcion": "D03: todo en centimos y cerrado ANTES de pagar, con desglose interno siempre"
    },
    {
     "nombre": "_cerrar",
     "descripcion": "D04: un carrito cerrado que sigue vivo es un pedido que se puede cobrar dos veces; se destruye"
    }
   ],
   "clases_oop": [
    "D04",
    "D03"
   ],
   "eje": "partes"
  },
  {
   "slug": "registro-cliente",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "censo-parte"
   ],
   "subscribes": [
    "registro-cliente.alta.request",
    "registro-cliente.de.request",
    "registro-cliente.instrucciones.request",
    "registro-cliente.mostrar.request",
    "bocaos.contrato_creado",
    "bocaos.hecho_reparto_anotado",
    "project.activated"
   ],
   "publishes": [
    "registro-cliente.alta.response",
    "registro-cliente.alta.failed",
    "registro-cliente.de.response",
    "registro-cliente.de.failed",
    "registro-cliente.instrucciones.response",
    "registro-cliente.instrucciones.failed",
    "registro-cliente.mostrar.response",
    "registro-cliente.mostrar.failed",
    "bocaos.cliente_registrado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_alta",
     "descripcion": "D05: aislamiento por tienda; sin identidad unica entre tiendas ni 'cliente del mercado'"
    },
    {
     "nombre": "_cruza",
     "descripcion": "L02: falla si un cliente de una tienda aparece en otra, ni por identidad ni en un agregado"
    },
    {
     "nombre": "_mostrar",
     "descripcion": "F05: el dato sigue escrito; lo que se apaga es la visibilidad al cerrar el contrato"
    },
    {
     "nombre": "_instrucciones",
     "descripcion": "F05: dato personal del cliente del cliente; no entra en ningun historico de tienda"
    }
   ],
   "clases_oop": [
    "D05",
    "F05",
    "L02"
   ],
   "eje": "partes"
  },
  {
   "slug": "pedido",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "carrito-tienda",
    "registro-cliente",
    "tarifa-pedido"
   ],
   "subscribes": [
    "pedido.alta.request",
    "pedido.aceptar.request",
    "pedido.rechazar.request",
    "pedido.transitar.request",
    "pedido.cancelar.request",
    "pedido.ver.request",
    "pedido.estado_visible.request",
    "whatsapp.pedido.detectado",
    "tienda.pedido.recibido",
    "bocaos.precio_cerrado",
    "bocaos.carrito_cerrado",
    "bocaos.cliente_registrado",
    "bocaos.oferta_estipulada",
    "bocaos.escalada_agotada",
    "project.activated"
   ],
   "publishes": [
    "pedido.alta.response",
    "pedido.alta.failed",
    "pedido.aceptar.response",
    "pedido.aceptar.failed",
    "pedido.rechazar.response",
    "pedido.rechazar.failed",
    "pedido.transitar.response",
    "pedido.transitar.failed",
    "pedido.cancelar.response",
    "pedido.cancelar.failed",
    "pedido.ver.response",
    "pedido.ver.failed",
    "pedido.estado_visible.response",
    "pedido.estado_visible.failed",
    "bocaos.pedido_recibido",
    "bocaos.pedido_aceptado",
    "bocaos.pedido_rechazado",
    "bocaos.pedido_cancelado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_alta",
     "descripcion": "C01: alta de a uno; sin alta en bloque ni pedido programado (Q39: el pedido nace del canal de la tienda)"
    },
    {
     "nombre": "_transitar",
     "descripcion": "C02: estado sin hecho es una opinion; el estado no se corrige, se avanza"
    },
    {
     "nombre": "_puede_cancelar",
     "descripcion": "C07: quien y hasta cuando; mientras no haya respuesta se anota y NO se cobra a nadie"
    },
    {
     "nombre": "_estado_visible",
     "descripcion": "C05: no ve 'en cola' ni 'sin rider'; no ve otros pedidos ni otras tiendas"
    }
   ],
   "clases_oop": [
    "C01",
    "C02",
    "C07",
    "C05"
   ],
   "eje": "partes"
  },
  {
   "slug": "hora-listo",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "pedido"
   ],
   "subscribes": [
    "hora-listo.declarar.request",
    "hora-listo.hecho.request",
    "bocaos.pedido_aceptado",
    "project.activated"
   ],
   "publishes": [
    "hora-listo.declarar.response",
    "hora-listo.declarar.failed",
    "hora-listo.hecho.response",
    "hora-listo.hecho.failed",
    "bocaos.pedido_listo",
    "bocaos.hecho_desmentido"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_declarar",
     "descripcion": "A01: sin precio_congelado no hay hecho y sin hecho no hay cadena; el pedido espera y se nombra (A34)"
    },
    {
     "nombre": "_desmentir",
     "descripcion": "A01: si la tienda se equivoco se anota un hecho nuevo; las dos horas quedan y las dos se ven"
    },
    {
     "nombre": "_hecho",
     "descripcion": "A01: el dato viaja CON el hecho; nadie va a buscarlo despues (la foto se tomaria en otro instante)"
    }
   ],
   "clases_oop": [
    "C04",
    "A01"
   ],
   "eje": "partes"
  },
  {
   "slug": "aviso-tienda",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "pedido"
   ],
   "subscribes": [
    "aviso-tienda.avisar.request",
    "bocaos.pedido_recibido",
    "bocaos.pedido_aceptado",
    "bocaos.pedido_cancelado",
    "bocaos.pedido_rechazado",
    "project.activated"
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
     "descripcion": "C03: si el aviso no llega, el pedido existe igual; el aviso es transporte, no verdad"
    }
   ],
   "clases_oop": [
    "C03"
   ],
   "eje": "partes"
  },
  {
   "slug": "aviso-cliente",
   "forma": "puente",
   "accion": "ADAPTAR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager",
    "whatsapp-bot"
   ],
   "depende_de": [
    "pedido"
   ],
   "subscribes": [
    "aviso-cliente.avisar.request",
    "aviso-cliente.reclamacion.request",
    "bocaos.pedido_aceptado",
    "bocaos.pedido_listo",
    "bocaos.pedido_cancelado",
    "bocaos.contrato_creado",
    "project.activated"
   ],
   "publishes": [
    "aviso-cliente.avisar.response",
    "aviso-cliente.avisar.failed",
    "aviso-cliente.reclamacion.response",
    "aviso-cliente.reclamacion.failed",
    "bocaos.aviso_cliente_entregado",
    "bocaos.aviso_cliente_fallido"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_avisar",
     "descripcion": "C06: la plantilla es de la tienda; Bocaos no firma nada que el cliente final vea"
    },
    {
     "nombre": "_sin_marca",
     "descripcion": "K02: falla si aparece el nombre de Bocaos, un enlace, un remitente reconocible o 'powered by'"
    },
    {
     "nombre": "_encauzar",
     "descripcion": "K01: si una reclamacion llega a Bocaos se devuelve a la tienda; no se atiende ni se guarda como relacion"
    }
   ],
   "clases_oop": [
    "C06",
    "K01",
    "K02"
   ],
   "eje": "partes"
  },
  {
   "slug": "tarifa-pedido",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [],
   "subscribes": [
    "tarifa-pedido.estipular.request",
    "tarifa-pedido.incentivar.request",
    "tarifa-pedido.subir.request",
    "tarifa-pedido.precio.request",
    "bocaos.propuesta_emitida",
    "project.activated"
   ],
   "publishes": [
    "tarifa-pedido.estipular.response",
    "tarifa-pedido.estipular.failed",
    "tarifa-pedido.incentivar.response",
    "tarifa-pedido.incentivar.failed",
    "tarifa-pedido.subir.response",
    "tarifa-pedido.subir.failed",
    "tarifa-pedido.precio.response",
    "tarifa-pedido.precio.failed",
    "bocaos.oferta_estipulada",
    "bocaos.incentivo_subido",
    "bocaos.oferta_subida"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_estipular",
     "descripcion": "E01: no la toca nadie mas (ni la tienda, ni la sala, ni Bocaos); el rider ve un numero que no cambia"
    },
    {
     "nombre": "_incentivar",
     "descripcion": "E02: no puede bajar por debajo de lo ya ofrecido a un rider con propuesta viva"
    },
    {
     "nombre": "_precio",
     "descripcion": "E03: solo SUMA; no forma, no estima, no subasta, no redondea a favor de nadie"
    },
    {
     "nombre": "_subir",
     "descripcion": "E07: tope = el que el CLIENTE autorizo al pedir (Q43); sin autor -> SIN_AUTOR y la deuda queda visible"
    }
   ],
   "clases_oop": [
    "E01",
    "E02",
    "E03",
    "E07"
   ],
   "eje": "precio"
  },
  {
   "slug": "contrato-tramos",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "config-mercado"
   ],
   "subscribes": [
    "contrato-tramos.declarar.request",
    "contrato-tramos.vigente.request",
    "contrato-tramos.simular.request",
    "project.activated"
   ],
   "publishes": [
    "contrato-tramos.declarar.response",
    "contrato-tramos.declarar.failed",
    "contrato-tramos.vigente.response",
    "contrato-tramos.vigente.failed",
    "contrato-tramos.simular.response",
    "contrato-tramos.simular.failed",
    "bocaos.tramos_declarados"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_declarar",
     "descripcion": "E06: S14 provisional 39/79/149 EUR + 10 c pedido rider + 20 c pedido tienda; cambio no retroactivo"
    },
    {
     "nombre": "_vigente",
     "descripcion": "E06: se calcula sobre el contrato vigente en la hora del hecho, no sobre el de hoy"
    },
    {
     "nombre": "_simular",
     "descripcion": "N02: recalcula con los pedidos, aceptaciones y cargos DE ESA tienda; no con una media del mercado"
    }
   ],
   "clases_oop": [
    "E06",
    "N02"
   ],
   "eje": "precio"
  },
  {
   "slug": "contrato-puntual",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "pedido",
    "tarifa-pedido"
   ],
   "subscribes": [
    "contrato-puntual.crear.request",
    "contrato-puntual.de.request",
    "contrato-puntual.vivos.request",
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
    "contrato-puntual.vivos.response",
    "contrato-puntual.vivos.failed",
    "contrato-puntual.cerrar.response",
    "contrato-puntual.cerrar.failed",
    "bocaos.contrato_creado",
    "bocaos.contrato_cerrado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_crear",
     "descripcion": "A24: ni turno, ni jornada, ni disponibilidad futura, ni compromiso con el siguiente pedido"
    },
    {
     "nombre": "_vivos",
     "descripcion": "B02: no se guarda una lista de paradas; se DERIVA de los contratos vivos"
    },
    {
     "nombre": "_cerrar",
     "descripcion": "A24: un contrato con duracion seria otro negocio; aqui es puntual y se cierra con el hecho"
    }
   ],
   "clases_oop": [
    "A24"
   ],
   "eje": "precio"
  },
  {
   "slug": "ruta-viva",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [],
   "subscribes": [
    "ruta-viva.posicion.request",
    "ruta-viva.promesa.request",
    "ruta-viva.capacidad.request",
    "ruta-viva.paradas.request",
    "ruta-viva.ruta.request",
    "ruta-viva.cerrar.request",
    "bocaos.contrato_creado",
    "bocaos.contrato_cerrado",
    "bocaos.hecho_reparto_anotado",
    "project.activated"
   ],
   "publishes": [
    "ruta-viva.posicion.response",
    "ruta-viva.posicion.failed",
    "ruta-viva.promesa.response",
    "ruta-viva.promesa.failed",
    "ruta-viva.capacidad.response",
    "ruta-viva.capacidad.failed",
    "ruta-viva.paradas.response",
    "ruta-viva.paradas.failed",
    "ruta-viva.ruta.response",
    "ruta-viva.ruta.failed",
    "ruta-viva.cerrar.response",
    "ruta-viva.cerrar.failed",
    "bocaos.posicion_anotada",
    "bocaos.promesa_guardada",
    "bocaos.trayecto_cerrado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_posicion",
     "descripcion": "B01: frescura declarada y consultable; si esta vieja, A05 devuelve NO_CONSTA"
    },
    {
     "nombre": "_capacidad",
     "descripcion": "B05: declarada, no estimada; Q33 capacidad = min(volumen fisico, tiempo de ventana, distancia)"
    },
    {
     "nombre": "_paradas",
     "descripcion": "B02: si un contrato se cierra, su parada desaparece sola (una lista guardada miente)"
    },
    {
     "nombre": "_ordenar",
     "descripcion": "B04: nunca entre rutas, nunca entre riders, nunca entre pedidos de tiendas distintas (Q31: si entre paradas)"
    },
    {
     "nombre": "_promesa",
     "descripcion": "B03: solo se puede MEJORAR; empeorarla exige pasar el umbral de retraso (A31)"
    },
    {
     "nombre": "_cerrar",
     "descripcion": "B06: cerrar no puntua a nadie; solo deja de contar para la ruta viva"
    }
   ],
   "clases_oop": [
    "B01",
    "B02",
    "B03",
    "B04",
    "B05",
    "B06"
   ],
   "eje": "precio"
  },
  {
   "slug": "foto-mercado",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "ruta-viva",
    "estado-parte",
    "censo-parte",
    "config-mercado",
    "puntualidad-tienda"
   ],
   "subscribes": [
    "foto-mercado.componer.request",
    "foto-mercado.elegibles.request",
    "foto-mercado.fresca.request",
    "bocaos.estado_parte_declarado",
    "bocaos.posicion_anotada",
    "project.activated"
   ],
   "publishes": [
    "foto-mercado.componer.response",
    "foto-mercado.componer.failed",
    "foto-mercado.elegibles.response",
    "foto-mercado.elegibles.failed",
    "foto-mercado.fresca.response",
    "foto-mercado.fresca.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_componer",
     "descripcion": "A02: no escribe nada; si se guardara habria dos verdades y una seria vieja"
    },
    {
     "nombre": "_congelar",
     "descripcion": "A03: vista + hora + huella del contenido; la foto viaja dentro de la propuesta y se cita"
    },
    {
     "nombre": "_fresca",
     "descripcion": "A03: la frescura exigible es un numero del proyecto; no se estima una posicion nueva"
    },
    {
     "nombre": "_elegibles",
     "descripcion": "A04: ni historico, ni antiguedad, ni cercania previa, ni tasa de aceptacion. El que tiene un dato ausente ENTRA con su lista de faltantes"
    }
   ],
   "clases_oop": [
    "A02",
    "A03",
    "A04"
   ],
   "eje": "enlace"
  },
  {
   "slug": "propuesta",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "pedido",
    "config-mercado"
   ],
   "subscribes": [
    "propuesta.emitir.request",
    "propuesta.acusar.request",
    "propuesta.aceptar.request",
    "propuesta.rechazar.request",
    "propuesta.vencer.request",
    "propuesta.vista.request",
    "propuesta.reproducir.request",
    "propuesta.revisar.request",
    "bocaos.propuesta_redactada",
    "bocaos.propuesta_entregada",
    "bocaos.acuse_recibido",
    "project.activated"
   ],
   "publishes": [
    "propuesta.emitir.response",
    "propuesta.emitir.failed",
    "propuesta.acusar.response",
    "propuesta.acusar.failed",
    "propuesta.aceptar.response",
    "propuesta.aceptar.failed",
    "propuesta.rechazar.response",
    "propuesta.rechazar.failed",
    "propuesta.vencer.response",
    "propuesta.vencer.failed",
    "propuesta.vista.response",
    "propuesta.vista.failed",
    "propuesta.reproducir.response",
    "propuesta.reproducir.failed",
    "propuesta.revisar.response",
    "propuesta.revisar.failed",
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
     "descripcion": "A13: se escribe una vez y NO se edita; es la prueba de que se ofrecio, a quien y con que numeros"
    },
    {
     "nombre": "_abrir",
     "descripcion": "A15+Q42: validez 20 s desde la emision, decision 10 s desde el acuse, retirada a los 5 s sin acuse"
    },
    {
     "nombre": "_aceptar",
     "descripcion": "A19: inexistente la aceptacion por silencio, por cercania o automatica a los 20 s"
    },
    {
     "nombre": "_cerrar",
     "descripcion": "A14: un desenlace; el segundo que llega no paga nada (es el mismo 'sin coste' de A21)"
    },
    {
     "nombre": "_vencer",
     "descripcion": "A15: sin acuse -> caduca_sin_acuse; con acuse -> caduca_sin_respuesta. No son lo mismo ni para el rider ni para la metrica"
    },
    {
     "nombre": "_vista",
     "descripcion": "M05: los cuatro van SIEMPRE, incluido el que pasa por un centimo; no hay vista resumida"
    },
    {
     "nombre": "_reproducir",
     "descripcion": "A29: el replay es lo que convierte 'explicable' en comprobable"
    },
    {
     "nombre": "_sin_asignacion",
     "descripcion": "A27: falla tambien con 'la sala lo empuja por telefono a un rider concreto'"
    }
   ],
   "clases_oop": [
    "A13",
    "A14",
    "A15",
    "A19",
    "A27",
    "A29",
    "A33",
    "M05"
   ],
   "eje": "enlace"
  },
  {
   "slug": "redaccion-propuesta",
   "forma": "micro-agente",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "propuesta"
   ],
   "subscribes": [
    "redaccion-propuesta.adornar.request",
    "project.activated"
   ],
   "publishes": [
    "redaccion-propuesta.adornar.response",
    "redaccion-propuesta.adornar.failed",
    "bocaos.propuesta_redactada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_validar",
     "descripcion": "A18: toda clausula se apoya en una razon de A16; el agente no puede anadir un motivo, ni cambiar un numero"
    },
    {
     "nombre": "cajon_adornar",
     "descripcion": "mitad fuzzy (blueprint): solo las palabras. Su evento NO va en module.json (gate validate-hibridos)"
    }
   ],
   "clases_oop": [
    "A18"
   ],
   "eje": "enlace"
  },
  {
   "slug": "enlace",
   "forma": "micro-agente",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "foto-mercado",
    "propuesta",
    "canal-rider",
    "redaccion-propuesta",
    "escalada-enlace"
   ],
   "subscribes": [
    "enlace.reintentar.request",
    "enlace.reproducir.request",
    "enlace.guardas.request",
    "bocaos.pedido_listo",
    "bocaos.propuesta_aceptada",
    "bocaos.propuesta_rechazada",
    "bocaos.propuesta_caducada_sin_acuse",
    "bocaos.propuesta_caducada_sin_respuesta",
    "bocaos.escalada_reintentar",
    "bocaos.politica_declarada",
    "bocaos.hecho_desmentido",
    "bocaos.incentivo_subido",
    "bocaos.oferta_subida",
    "bocaos.promesa_guardada",
    "bocaos.propuesta_acusada",
    "project.activated"
   ],
   "publishes": [
    "enlace.reintentar.response",
    "enlace.reintentar.failed",
    "enlace.reproducir.response",
    "enlace.reproducir.failed",
    "enlace.guardas.response",
    "enlace.guardas.failed",
    "bocaos.medidas_calculadas",
    "bocaos.hueco_nombrado",
    "bocaos.enlace_agotado",
    "bocaos.enlace_completado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_desvio",
     "descripcion": "A07 = A06 - A05: metros de mas; si una ruta no consta -> NO_CONSTA; insertar una parada NUNCA acorta la base"
    },
    {
     "nombre": "_espera",
     "descripcion": "A08: minutos que esperaria si llega antes de listo; contra L03, no contra una cocina adivinada"
    },
    {
     "nombre": "_retraso",
     "descripcion": "A09+A10: por parada contra SU promesa guardada; el agregado es el PEOR, no la suma ni la media"
    },
    {
     "nombre": "_cobra",
     "descripcion": "A11: NETO = precio - desvio*0,140 - espera*0,257 (Q41); sin coste declarado -> NO_CONSTA, sin valor por defecto"
    },
    {
     "nombre": "_pasa",
     "descripcion": "A12: cuatro comparaciones en AND contra la politica; devuelve EL TEST QUE FALLO, no un numero"
    },
    {
     "nombre": "_razones",
     "descripcion": "A16: conjunto cerrado (desvio, espera, retraso, cobra, umbrales, version)"
    },
    {
     "nombre": "_frase",
     "descripcion": "A17: plantilla fija sobre los numeros ya calculados; misma entrada, misma frase"
    },
    {
     "nombre": "_hueco",
     "descripcion": "A34: si falta un dato no se estima; se nombra y el candidato se salta"
    },
    {
     "nombre": "_siguiente",
     "descripcion": "A25: avanza por el ORDEN declarado en la politica; al agotar el tope devuelve NINGUNO"
    },
    {
     "nombre": "_hora_aceptacion",
     "descripcion": "A20: el hecho con hora que arranca los relojes del reparto"
    },
    {
     "nombre": "_rechazo",
     "descripcion": "A21: el no se anota; NUNCA entra en la elegibilidad ni en el orden (no hay camino a A04 ni a A25)"
    },
    {
     "nombre": "_caducidad",
     "descripcion": "A23: el silencio es un no con hora; no se estima la intencion"
    },
    {
     "nombre": "_sin_puntuacion",
     "descripcion": "A22: falla si aparece cualquier tasa de rechazo, fiabilidad, antiguedad o prioridad comprada"
    },
    {
     "nombre": "_sin_optimizador",
     "descripcion": "A28: la entrada es UN hecho, UNA foto, UNA politica; una lista de pedidos o un barrido -> falla"
    },
    {
     "nombre": "_por_trayecto",
     "descripcion": "A30: la unidad enlazada es la RUTA; 'pedidos del mismo cliente' o 'misma direccion' -> falla"
    },
    {
     "nombre": "_no_rompe_promesa",
     "descripcion": "A31: ningun retraso agregado supera el umbral de la politica aplicada; protege la version con la que se prometio"
    }
   ],
   "clases_oop": [
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
    "A34"
   ],
   "eje": "enlace"
  },
  {
   "slug": "escalada-enlace",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "tarifa-pedido",
    "config-mercado"
   ],
   "subscribes": [
    "escalada-enlace.escalar.request",
    "bocaos.enlace_agotado",
    "bocaos.propuesta_rechazada",
    "bocaos.propuesta_caducada_sin_respuesta",
    "bocaos.oferta_subida",
    "project.activated"
   ],
   "publishes": [
    "escalada-enlace.escalar.response",
    "escalada-enlace.escalar.failed",
    "bocaos.escalada_peldano",
    "bocaos.escalada_reintentar",
    "bocaos.escalada_agotada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_peldano",
     "descripcion": "Q43: 1) los 2 candidatos; 2) TODOS los activos del barrio 30 s; 3) subir oferta por escalones hasta el tope del cliente; 5 min sin coger -> cancela y el cliente lo sabe"
    },
    {
     "nombre": "_pide",
     "descripcion": "A26: elige cual de las tres salidas pide; no ejecuta ninguna, porque ninguna es suya"
    },
    {
     "nombre": "_agotada",
     "descripcion": "A26: el pedido no se cierra por silencio del sistema; queda vivo y visible en la cola"
    }
   ],
   "clases_oop": [
    "A26"
   ],
   "eje": "enlace"
  },
  {
   "slug": "canal-rider",
   "forma": "puente",
   "accion": "ADAPTAR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager",
    "telegram-bridge"
   ],
   "depende_de": [
    "propuesta"
   ],
   "subscribes": [
    "canal-rider.entregar.request",
    "canal-rider.acuse.request",
    "bocaos.propuesta_emitida",
    "project.activated"
   ],
   "publishes": [
    "canal-rider.entregar.response",
    "canal-rider.entregar.failed",
    "canal-rider.acuse.response",
    "canal-rider.acuse.failed",
    "bocaos.propuesta_entregada",
    "bocaos.propuesta_no_entregada",
    "bocaos.acuse_recibido"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_entregar",
     "descripcion": "M04: puerto intercambiable; si el canal no puede entregar dentro de la ventana, el candidato no debe proponerse"
    },
    {
     "nombre": "_acuse",
     "descripcion": "Q42: el acuse es el dato; un rider sin cobertura no bloquea el mercado"
    }
   ],
   "clases_oop": [
    "M04"
   ],
   "eje": "enlace"
  },
  {
   "slug": "hechos-reparto",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "contrato-puntual"
   ],
   "subscribes": [
    "hechos-reparto.anotar.request",
    "hechos-reparto.prueba.request",
    "hechos-reparto.acta.request",
    "hechos-reparto.seguimiento.request",
    "bocaos.contrato_creado",
    "project.activated"
   ],
   "publishes": [
    "hechos-reparto.anotar.response",
    "hechos-reparto.anotar.failed",
    "hechos-reparto.prueba.response",
    "hechos-reparto.prueba.failed",
    "hechos-reparto.acta.response",
    "hechos-reparto.acta.failed",
    "hechos-reparto.seguimiento.response",
    "hechos-reparto.seguimiento.failed",
    "bocaos.hecho_reparto_anotado",
    "bocaos.prueba_anotada",
    "bocaos.acta_incompleta"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_anotar",
     "descripcion": "F01: append-only; un hecho corregido es un hecho NUEVO que desmiente al anterior"
    },
    {
     "nombre": "_prueba",
     "descripcion": "F02: sin prueba no se presume nada; la falta es un hecho propio, no un hueco a rellenar"
    },
    {
     "nombre": "_acta",
     "descripcion": "Q24: hora de aceptacion, llegada, salida, portal, entrega, foto, posicion y acuse; la prueba es el acta"
    },
    {
     "nombre": "_completa",
     "descripcion": "Q30: si falta un evento el acta esta incompleta y el cargo se retira (lo consulta `regla-fallo`)"
    },
    {
     "nombre": "_seguimiento",
     "descripcion": "F03: la posicion que ve el cliente es la del rider de SU contrato, no la de nadie mas"
    }
   ],
   "clases_oop": [
    "F01",
    "F02",
    "F03"
   ],
   "eje": "reparto"
  },
  {
   "slug": "chat-enmascarado",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager",
    "telegram-bridge"
   ],
   "depende_de": [
    "contrato-puntual"
   ],
   "subscribes": [
    "chat-enmascarado.entregar.request",
    "bocaos.contrato_creado",
    "project.activated"
   ],
   "publishes": [
    "chat-enmascarado.entregar.response",
    "chat-enmascarado.entregar.failed",
    "bocaos.mensaje_entregado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_enmascarar",
     "descripcion": "F04: ni el rider ve el numero del cliente ni al reves"
    },
    {
     "nombre": "_sin_agregado",
     "descripcion": "F04: no se lee el contenido para ningun calculo ni se construye ningun agregado sobre conversaciones"
    }
   ],
   "clases_oop": [
    "F04"
   ],
   "eje": "reparto"
  },
  {
   "slug": "incidencia-reparto",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "contrato-puntual"
   ],
   "subscribes": [
    "incidencia-reparto.abrir.request",
    "project.activated"
   ],
   "publishes": [
    "incidencia-reparto.abrir.response",
    "incidencia-reparto.abrir.failed",
    "bocaos.incidencia_abierta"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_abrir",
     "descripcion": "F06: cualquiera de las dos partes puede abrirla; ninguna puede cerrarla sin dictamen"
    }
   ],
   "clases_oop": [
    "F06"
   ],
   "eje": "reparto"
  },
  {
   "slug": "lectura-incidencia",
   "forma": "micro-agente",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "incidencia-reparto"
   ],
   "subscribes": [
    "lectura-incidencia.clasificar.request",
    "bocaos.incidencia_abierta",
    "project.activated"
   ],
   "publishes": [
    "lectura-incidencia.clasificar.response",
    "lectura-incidencia.clasificar.failed",
    "bocaos.incidencia_clasificada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_validar",
     "descripcion": "F07: un campo nuevo se RECHAZA, no se inventa; no puntua, no adjudica, no decide a quien culpar"
    },
    {
     "nombre": "cajon_clasificar",
     "descripcion": "mitad fuzzy (blueprint): solo el campo, nunca la culpa"
    }
   ],
   "clases_oop": [
    "F07"
   ],
   "eje": "reparto"
  },
  {
   "slug": "regla-fallo",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "config-mercado",
    "hechos-reparto"
   ],
   "subscribes": [
    "regla-fallo.medir.request",
    "regla-fallo.aplicar.request",
    "regla-fallo.trazar.request",
    "bocaos.hecho_reparto_anotado",
    "bocaos.acta_incompleta",
    "bocaos.hecho_desmentido",
    "bocaos.promesa_guardada",
    "project.activated"
   ],
   "publishes": [
    "regla-fallo.medir.response",
    "regla-fallo.medir.failed",
    "regla-fallo.aplicar.response",
    "regla-fallo.aplicar.failed",
    "regla-fallo.trazar.response",
    "regla-fallo.trazar.failed",
    "bocaos.fallo_medido",
    "bocaos.fallo_adjudicado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_medir",
     "descripcion": "G02: solo hechos CON HORA; si falta uno es NO_CONSTA, nunca 'seguramente se paso'"
    },
    {
     "nombre": "_aplicar",
     "descripcion": "G03: es una TABLA con una prueba por fila, no un agente que opina sobre la culpa. N1/N2/N3 de Q28 (8/5/10 min)"
    },
    {
     "nombre": "_importe",
     "descripcion": "G03: mientras los importes no existan, devuelve 'quien' pero no 'cuanto': cargo sin importe, no numero inventado"
    },
    {
     "nombre": "_trazar",
     "descripcion": "G06: si el hecho es posterior al cargo o fue desmentido, falla. Es la diferencia entre un cargo y un abuso"
    }
   ],
   "clases_oop": [
    "G02",
    "G03",
    "G06"
   ],
   "eje": "fallo"
  },
  {
   "slug": "cargo-fallo",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "regla-fallo",
    "cobro-gestion"
   ],
   "subscribes": [
    "cargo-fallo.anotar.request",
    "cargo-fallo.ver.request",
    "cargo-fallo.efectivo.request",
    "bocaos.fallo_adjudicado",
    "bocaos.acta_incompleta",
    "project.activated"
   ],
   "publishes": [
    "cargo-fallo.anotar.response",
    "cargo-fallo.anotar.failed",
    "cargo-fallo.ver.response",
    "cargo-fallo.ver.failed",
    "cargo-fallo.efectivo.response",
    "cargo-fallo.efectivo.failed",
    "bocaos.cargo_anotado",
    "bocaos.cargo_sin_evidencia"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_anotar",
     "descripcion": "G04: sin evidencia -> SIN_EVIDENCIA y no hay cargo. Deuda, no descuento: Bocaos no retiene"
    },
    {
     "nombre": "_efectivo",
     "descripcion": "Q29: revertir exige SALDO; por eso el cobro es semanal (colchon) y la deuda no puede superar lo que va a cobrar"
    },
    {
     "nombre": "_tope",
     "descripcion": "Q29: si el rider no tiene saldo, la deuda queda visible en su cuenta, no se inventa un cobro"
    }
   ],
   "clases_oop": [
    "G04"
   ],
   "eje": "fallo"
  },
  {
   "slug": "disputa-fallo",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "cargo-fallo"
   ],
   "subscribes": [
    "disputa-fallo.llevar.request",
    "bocaos.cargo_anotado",
    "project.activated"
   ],
   "publishes": [
    "disputa-fallo.llevar.response",
    "disputa-fallo.llevar.failed",
    "bocaos.disputa_abierta"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_llevar",
     "descripcion": "G05: quien disputa discute la REGLA, no el hecho: si discute el hecho, el acta zanja"
    },
    {
     "nombre": "_sin_rejuzgar",
     "descripcion": "G05: no reabre un caso cerrado sin un hecho nuevo"
    }
   ],
   "clases_oop": [
    "G05"
   ],
   "eje": "fallo"
  },
  {
   "slug": "liquidacion",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager",
    "scheduler"
   ],
   "depende_de": [
    "scheduler",
    "contrato-tramos",
    "cargo-fallo",
    "tarifa-pedido"
   ],
   "subscribes": [
    "liquidacion.abrir.request",
    "liquidacion.devengo.request",
    "liquidacion.cerrar.request",
    "liquidacion.mora.request",
    "scheduler.job.triggered",
    "bocaos.cargo_anotado",
    "bocaos.tramos_declarados",
    "bocaos.cobro_fallido",
    "project.activated"
   ],
   "publishes": [
    "liquidacion.abrir.response",
    "liquidacion.abrir.failed",
    "liquidacion.devengo.response",
    "liquidacion.devengo.failed",
    "liquidacion.cerrar.response",
    "liquidacion.cerrar.failed",
    "liquidacion.mora.response",
    "liquidacion.mora.failed",
    "bocaos.ciclo_abierto",
    "bocaos.cierre_semanal",
    "bocaos.devengo_calculado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_devengo",
     "descripcion": "H01: pedidos ACEPTADOS x tarifa del contrato vigente + la parte del fijo; jamas km, viajes ni % del ticket"
    },
    {
     "nombre": "_dos_cifras",
     "descripcion": "H01: lo que se devenga sin discusion y lo que depende de una pregunta abierta. NO elige: elegir es del dueno y queda en acta"
    },
    {
     "nombre": "_cerrar",
     "descripcion": "H02: un periodo cerrado no se reabre; una correccion es una nota en el periodo siguiente"
    },
    {
     "nombre": "_mora",
     "descripcion": "H05: la suspension corta la ENTRADA de pedidos nuevos, nunca los pedidos en vuelo ni las propuestas vivas"
    },
    {
     "nombre": "_no_retencion",
     "descripcion": "H06: falla si un cobro de Bocaos se calcula como % del ticket o si un pago al rider pasa por una cuenta de Bocaos"
    },
    {
     "nombre": "_no_captura_ahorro",
     "descripcion": "A32: la cuota es por pedido aceptado; km ahorrados o pedidos enlazados -> FALLA"
    }
   ],
   "clases_oop": [
    "H01",
    "H02",
    "H05",
    "E04",
    "E05",
    "A32",
    "H06"
   ],
   "eje": "dinero"
  },
  {
   "slug": "factura-gestion",
   "forma": "conversor",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "liquidacion"
   ],
   "subscribes": [
    "factura-gestion.emitir.request",
    "bocaos.cierre_semanal",
    "project.activated"
   ],
   "publishes": [
    "factura-gestion.emitir.response",
    "factura-gestion.emitir.failed",
    "bocaos.factura_emitida"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_emitir",
     "descripcion": "H03: solo lo devengado en ese cierre; con IVA y forma juridica marcados como pendientes, no inventados"
    }
   ],
   "clases_oop": [
    "H03"
   ],
   "eje": "dinero"
  },
  {
   "slug": "cobro-gestion",
   "forma": "puente",
   "accion": "ADAPTAR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager",
    "pago-gateway",
    "credential-manager"
   ],
   "depende_de": [
    "contrato-tramos"
   ],
   "subscribes": [
    "cobro-gestion.cobrar.request",
    "cobro-gestion.revertir.request",
    "bocaos.cargo_anotado",
    "bocaos.cierre_semanal",
    "bocaos.factura_emitida",
    "project.activated"
   ],
   "publishes": [
    "cobro-gestion.cobrar.response",
    "cobro-gestion.cobrar.failed",
    "cobro-gestion.revertir.response",
    "cobro-gestion.revertir.failed",
    "bocaos.cobro_realizado",
    "bocaos.cobro_fallido"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_cobrar",
     "descripcion": "H04: nunca del importe de comida ni del de reparto (H06); un cobro fallido no cambia lo devengado, cambia la deuda"
    },
    {
     "nombre": "_revertir",
     "descripcion": "Q29: requiere saldo en la cuenta conectada; si no hay, no se inventa"
    },
    {
     "nombre": "_canal",
     "descripcion": "H04: la cuenta conectada (Stripe) es de la parte, no de Bocaos"
    }
   ],
   "clases_oop": [
    "H04"
   ],
   "eje": "dinero"
  },
  {
   "slug": "puntualidad-tienda",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "hora-listo",
    "hechos-reparto"
   ],
   "subscribes": [
    "puntualidad-tienda.medir.request",
    "bocaos.pedido_listo",
    "bocaos.hecho_reparto_anotado",
    "project.activated"
   ],
   "publishes": [
    "puntualidad-tienda.medir.response",
    "puntualidad-tienda.medir.failed",
    "bocaos.puntualidad_publicada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_medir",
     "descripcion": "L03: publica distribucion, no un 3 sobre 5. Sin datos suficientes -> NO_CONSTA y el rider ve 'sin historico'"
    },
    {
     "nombre": "_por_tienda",
     "descripcion": "Q31: el historico es de CADA tienda por separado; una tienda lenta no contamina a la de al lado"
    }
   ],
   "clases_oop": [
    "L03"
   ],
   "eje": "medida"
  },
  {
   "slug": "panel-tienda",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "puntualidad-tienda",
    "propuesta"
   ],
   "subscribes": [
    "panel-tienda.ver.request",
    "bocaos.propuesta_emitida",
    "bocaos.puntualidad_publicada",
    "project.activated"
   ],
   "publishes": [
    "panel-tienda.ver.response",
    "panel-tienda.ver.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_ver",
     "descripcion": "L01: misma fuente que `enlace` y que `propuesta.vista`; sin version amable"
    },
    {
     "nombre": "_sin_competencia",
     "descripcion": "L01/P02: la vista de una tienda no muestra a sus competidoras"
    }
   ],
   "clases_oop": [
    "L01"
   ],
   "eje": "medida"
  },
  {
   "slug": "resumen-tienda",
   "forma": "micro-agente",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "panel-tienda"
   ],
   "subscribes": [
    "resumen-tienda.redactar.request",
    "project.activated"
   ],
   "publishes": [
    "resumen-tienda.redactar.response",
    "resumen-tienda.redactar.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_validar",
     "descripcion": "L04: el agente no descubre nada; no aconseja, no compara con otras tiendas, no opina sobre la cocina"
    },
    {
     "nombre": "cajon_redactar",
     "descripcion": "mitad fuzzy (blueprint): el parrafo"
    }
   ],
   "clases_oop": [
    "L04"
   ],
   "eje": "medida"
  },
  {
   "slug": "salud-mercado",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager",
    "metricas"
   ],
   "depende_de": [
    "propuesta",
    "enlace",
    "pedido",
    "liquidacion"
   ],
   "subscribes": [
    "salud-mercado.ver.request",
    "salud-mercado.fricciones.request",
    "salud-mercado.cuadro.request",
    "salud-mercado.densidad.request",
    "bocaos.propuesta_emitida",
    "bocaos.hueco_nombrado",
    "bocaos.cierre_semanal",
    "bocaos.enlace_agotado",
    "bocaos.acta_asentada",
    "bocaos.medidas_calculadas",
    "bocaos.enlace_completado",
    "bocaos.escalada_peldano",
    "bocaos.fallo_medido",
    "bocaos.propuesta_no_entregada",
    "project.activated"
   ],
   "publishes": [
    "salud-mercado.ver.response",
    "salud-mercado.ver.failed",
    "salud-mercado.fricciones.response",
    "salud-mercado.fricciones.failed",
    "salud-mercado.cuadro.response",
    "salud-mercado.cuadro.failed",
    "salud-mercado.densidad.response",
    "salud-mercado.densidad.failed"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_salud",
     "descripcion": "I05: lo que no consta aparece como NO_CONSTA, nunca como cero: un cero en 'pedidos sin propuesta' hace parecer sano un mercado sin datos"
    },
    {
     "nombre": "_fricciones",
     "descripcion": "I06: cada par con su numero y su hueco; el tablero no rellena"
    },
    {
     "nombre": "_cuadro",
     "descripcion": "O01: muestra tendencia, no solo valor; 'pedidos que nunca tuvieron propuesta' sale de A34"
    },
    {
     "nombre": "_densidad",
     "descripcion": "N01: nombra el problema, no lo resuelve; la decision de abrir o cerrar va al acta (O02)"
    }
   ],
   "clases_oop": [
    "I05",
    "I06",
    "O01",
    "N01"
   ],
   "eje": "medida"
  },
  {
   "slug": "cuenta-parte",
   "forma": "reflejo",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "liquidacion",
    "cargo-fallo",
    "contrato-puntual",
    "hechos-reparto"
   ],
   "subscribes": [
    "cuenta-parte.ver.request",
    "cuenta-parte.cartera.request",
    "bocaos.cargo_anotado",
    "bocaos.cierre_semanal",
    "bocaos.contrato_cerrado",
    "bocaos.prueba_anotada",
    "bocaos.devengo_calculado",
    "bocaos.cobro_realizado",
    "project.activated"
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
     "descripcion": "Q01: lo que no consta se muestra como 'sin evidencia', no como cero; el cliente final NO tiene cuenta"
    },
    {
     "nombre": "_cartera",
     "descripcion": "M01: cada centimo apunta a un contrato; distingue GANADO (con prueba) de RECLAMADO (entregado sin prueba, Q30) y de PENDIENTE"
    },
    {
     "nombre": "_una_cifra",
     "descripcion": "Q01/M01: un solo calculo para las dos caras; dos modulos darian dos saldos"
    }
   ],
   "clases_oop": [
    "Q01",
    "M01"
   ],
   "eje": "medida"
  },
  {
   "slug": "cola-sala",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "censo-parte"
   ],
   "subscribes": [
    "cola-sala.encolar.request",
    "cola-sala.siguiente.request",
    "cola-sala.cerrar.request",
    "cola-sala.ver.request",
    "cola-sala.revisar.request",
    "bocaos.enlace_agotado",
    "bocaos.incidencia_abierta",
    "bocaos.disputa_abierta",
    "bocaos.cargo_sin_evidencia",
    "bocaos.censo_incompleto",
    "bocaos.pedido_rechazado",
    "bocaos.aviso_tienda_fallido",
    "bocaos.aviso_cliente_fallido",
    "bocaos.incidencia_clasificada",
    "bocaos.escalada_agotada",
    "bocaos.aviso_sala_vencido",
    "project.activated"
   ],
   "publishes": [
    "cola-sala.encolar.response",
    "cola-sala.encolar.failed",
    "cola-sala.siguiente.response",
    "cola-sala.siguiente.failed",
    "cola-sala.cerrar.response",
    "cola-sala.cerrar.failed",
    "cola-sala.ver.response",
    "cola-sala.ver.failed",
    "cola-sala.revisar.response",
    "cola-sala.revisar.failed",
    "bocaos.caso_encolado",
    "bocaos.caso_cerrado",
    "bocaos.revision_solicitada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_encolar",
     "descripcion": "P01: una sola cola, no tres bandejas. Prioridad por hechos, no por quien llama mas"
    },
    {
     "nombre": "_vencer",
     "descripcion": "O03: si vence, sube de prioridad y SIGUE VIVA; no se cierra sola ni se resuelve por defecto"
    },
    {
     "nombre": "_vista_parte",
     "descripcion": "P02: incluye las propuestas que no llegaron a nada CON SU TRAZA (A16+A34); eso no es excusa, es diagnostico"
    },
    {
     "nombre": "_cierre",
     "descripcion": "P01: sale con dictamen, cargo o alta completada"
    }
   ],
   "clases_oop": [
    "P01",
    "P02",
    "O03"
   ],
   "eje": "operacion"
  },
  {
   "slug": "aviso-sala",
   "forma": "puente",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "filesystem",
    "project-manager",
    "telegram-bridge"
   ],
   "depende_de": [
    "cola-sala"
   ],
   "subscribes": [
    "aviso-sala.avisar.request",
    "bocaos.caso_encolado",
    "bocaos.revision_solicitada",
    "project.activated"
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
     "descripcion": "I07: sin traza la sala solo puede improvisar"
    },
    {
     "nombre": "_plazo",
     "descripcion": "I07/Q40: si vence sin respuesta, sube prioridad y sigue vivo; el destinatario por defecto es un agente, no una persona despierta a las 22:00"
    }
   ],
   "clases_oop": [
    "I07"
   ],
   "eje": "operacion"
  },
  {
   "slug": "accion-sancion",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "acta-decisiones",
    "cola-sala"
   ],
   "subscribes": [
    "accion-sancion.suspender.request",
    "accion-sancion.ver.request",
    "bocaos.caso_cerrado",
    "project.activated"
   ],
   "publishes": [
    "accion-sancion.suspender.response",
    "accion-sancion.suspender.failed",
    "accion-sancion.ver.response",
    "accion-sancion.ver.failed",
    "bocaos.parte_sancionada"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_suspender",
     "descripcion": "P03: sin acta -> 409. No corta pedidos en vuelo ni propuestas vivas"
    },
    {
     "nombre": "_no_por_rechazo",
     "descripcion": "P03: 'por tasa de rechazo' -> 409; rechazar es un derecho (A21)"
    }
   ],
   "clases_oop": [
    "P03"
   ],
   "eje": "operacion"
  },
  {
   "slug": "dictamen-revision",
   "forma": "custodio",
   "accion": "CONSTRUIR",
   "reutiliza": [
    "_shared/modulo-hibrido-reflejo",
    "_shared/pos-persistencia",
    "filesystem",
    "project-manager"
   ],
   "depende_de": [
    "acta-decisiones",
    "cola-sala",
    "config-mercado"
   ],
   "subscribes": [
    "dictamen-revision.dictaminar.request",
    "dictamen-revision.de.request",
    "bocaos.revision_solicitada",
    "project.activated"
   ],
   "publishes": [
    "dictamen-revision.dictaminar.response",
    "dictamen-revision.dictaminar.failed",
    "dictamen-revision.de.response",
    "dictamen-revision.de.failed",
    "bocaos.dictamen_firmado"
   ],
   "proyecciones_internas": [
    {
     "nombre": "_dictaminar",
     "descripcion": "O04/Q26: efectos permitidos = compensar, corregir un historico mal medido, cambiar la regla HACIA ADELANTE"
    },
    {
     "nombre": "_prohibido",
     "descripcion": "O04: rehacer la propuesta ya emitida esta PROHIBIDO; si pudiera, el humano seria un planificador (A28)"
    },
    {
     "nombre": "_no_reabre",
     "descripcion": "Q26: los casos anteriores no se reabren; la regla nueva rige desde su publicacion"
    }
   ],
   "clases_oop": [
    "O04"
   ],
   "eje": "operacion"
  }
 ],
 "counts": {
  "hojas": 44,
  "clases_cubiertas": 115,
  "por_eje": {
   "politica": 3,
   "partes": 12,
   "precio": 4,
   "enlace": 6,
   "reparto": 4,
   "fallo": 3,
   "dinero": 3,
   "medida": 5,
   "operacion": 4
  },
  "por_forma": {
   "micro-agente": 5,
   "custodio": 21,
   "reflejo": 7,
   "conversor": 2,
   "puente": 9
  },
  "por_accion": {
   "REUTILIZAR": 1,
   "CONSTRUIR": 40,
   "ADAPTAR": 3
  },
  "rpc_total": 114,
  "rpc_orden": 61,
  "rpc_pregunta": 53,
  "proyecciones_internas": 143,
  "hechos_de_dominio": 71
 },
 "reutiliza_infra": [
  "filesystem",
  "project-manager",
  "credential-manager",
  "metricas",
  "_shared/modulo-hibrido-reflejo",
  "_shared/pos-persistencia"
 ],
 "nota": "115 clases = 43 hojas de negocio + 1 primitiva reutilizada (scheduler); 0 huerfanas (K03 reservada, sin clase por decision del diseno). Las 61 clases que solo calculan NO son modulos: son proyecciones internas de la hoja que las usa. Los custodios que escribian el MISMO objeto se funden en uno (propuesta, config-mercado, ruta-viva, hechos-reparto, liquidacion, cuenta-parte, cola-sala, censo-parte/registro-cliente/hora-listo) para no tener dos escritores. `scheduler` entra como hoja REUTILIZAR (primitiva real)."
}
```

---

## 14 · Lo que este plano NO resuelve (deuda declarada, no hueco tapado)

1. **Multi-tienda dentro de un proyecto: es una decisión de arquitectura que la F3 no tomó.** Todo el diseño asume que un mercado tiene **N tiendas dentro de un proyecto** (`censo-parte` las da de alta, `registro-cliente` aísla clientes por tienda, `escaparate` indexa escaparates). Pero los módulos reales del ecosistema son **una tienda por proyecto** (`pizzepos/carta-digital`, `whatsapp-bot` con una credencial por proyecto). Este plano asume multi-tienda-en-un-proyecto porque es lo que el diseño describe. **La alternativa** (cada tienda = su propio proyecto Enki y Bocaos coordinando entre proyectos) obligaría a leer datos de otros `project_id`, cosa que `PosPersistencia` no hace hoy. Sin respuesta: `carta-publica` necesita el puerto Catálogo **por tienda** y `aviso-cliente` necesita credencial de WhatsApp **por tienda**; ambas cosas son configuración del proyecto, y hoy no existe ese eje.
2. **El puerto Ruta no tiene proveedor declarado.** `_desvio` mide minutos y metros, y el mercado no puede proponer sin ellos (`NO_CONSTA`). Nadie ha decidido si es un cálculo local, un proveedor de rutas o una estimación por línea recta. Q37 fija el criterio (tiempo principal + distancia por consumo) pero no el proveedor.
3. **Q3 (¿un juego de umbrales por zona?)** sigue abierta: `config-mercado` **admite las dos** (la política se busca por `(zona, instante)`), pero no se ha decidido si el primer mercado declara uno o varios juegos.
4. **Q4 (vigencia sobre pedidos en vuelo)** sigue abierta. La hoja protege lo que se puede proteger (`propuesta` guarda la versión de la política; `ruta-viva._promesa` sólo se puede mejorar), pero un cambio de umbral a mitad de un pedido no tiene respuesta del dueño.
5. **Q17 (quién sube la oferta, con qué tope, quién paga)** está medio cerrada por Q43: el **tope lo autoriza el cliente al pedir**. Sigue abierto **quién paga** el escalón y qué pasa si el cliente no autorizó tope. Mientras no se sepa, `tarifa-pedido._subir` registra el acto y deja la deuda **visible**, no cobrada.
6. **Q18 (¿devenga un pedido cancelado tras aceptar?)** — `liquidacion._dos_cifras` lo deja en «en duda», sin elegir. Elegir es del dueño y queda en acta.
7. **Q20/Q15 — `K03` (`TransparenciaDelEnlace`) sigue reservada y sin clase.** El cliente puede estar pagando lo mismo y esperando hasta el umbral de retraso por un enlace que no pidió, y nadie se lo dice. Es la deuda 1 del diseño y este plano **no la tapa**: no hay hoja para ella.
8. **Los importes de la tabla de fallo (G03) siguen sin número.** `regla-fallo._importe` devuelve «quién» pero no «cuánto»: el cargo nace sin importe en vez de con un número inventado.
9. **`pago-gateway` no expone hoy `transfer_reversal`.** La adaptación de `cobro-gestion` (Q29) exige tocar ese módulo o envolverlo; este plano declara el contrato (`cobro-gestion.revertir`) pero **no** implementa el movimiento. Es trabajo de la F4 sobre un módulo vivo de otro proyecto: hay que decidir si se adapta `pago-gateway` (afecta a todos sus proyectos) o se construye un `pago-connect` nuevo.
10. **Q40 y la sala: «agentes, no sala humana»** deja a `aviso-sala` con un destinatario por defecto que es un agente. Si el agente no existe o está caído, el caso **sigue vivo en la cola** (no se pierde), pero nadie lo atiende. Vivo y visible no es atendido: es la tensión T3 del diseño, y este plano la deja escrita.

---

## 15 · Verificación de este entregable

```
✓ 115 clases -> 43 hojas (40 CONSTRUIR · 3 ADAPTAR) + 1 primitiva REUTILIZAR. Cada clase aparece en UNA hoja (comprobado por script, no a ojo).
✓ K03 reservada y sin clase; ninguna pieza del diseño sin hoja.
✓ 114 RPC clasificados en ORDEN (61) / PREGUNTA (53); 143 proyecciones internas declaradas.
✓ Espina enki-plan: JSON parseable, 8 campos por hoja, formas/acciones válidas, `orden` cubre las 44 hojas y respeta `depende_de` (validado con scripts/validate-espina.js de la skill).
✓ Tópicos del bus en ASCII; toda operación con su `.failed`; todo flujo con su par de fallo.
✓ Cero IA en la decisión de reparto: `_pasa` es una tabla AND y la única pieza fuzzy del cuello es el adorno (A18).
✓ Cero the-pirate dentro: `entrega` y `agenda-operacion` (the-pirate) NO se tocan. De `pizzepos/*` no entra ninguna hoja: solo se consumen dos eventos de canal ya vivos (`whatsapp.pedido.detectado`, `tienda.pedido.recibido`, Q39) como puerta del pedido. `prisma/*` se evaluo y se descarto. Todo lo local es config de `config-mercado`.
```
