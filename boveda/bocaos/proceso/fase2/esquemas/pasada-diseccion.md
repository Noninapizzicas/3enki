# PASADA · DISECCIÓN — la FORMA de cada hoja atómica (tercera pasada)

> **144 hojas atómicas, todas con forma.** Más 3 marcadas **[ABIERTA]** (existen solo si el dueño
> dice que sí). El detalle del razonamiento de las 115 heredadas está en la disección de la v2;
> aquí va el inventario completo y, con su razonamiento, **las 29 nuevas**.
>
> **La afirmación que esta pasada puede hacer y la anterior no:** la F0 §7 **no cambió ni una sola
> forma.** Añadió 29 hojas y movió 6 de sitio, pero ninguna pieza pasó de reflejo a agente, ni de
> custodio a puente. Una arquitectura que cambia el dueño de las cosas sin cambiar su naturaleza es
> una arquitectura que estaba bien pensada; si el §7 hubiera obligado a rehacer formas, habría que
> sospechar de la v2.
>
> El corte maestro sigue siendo el mismo: **¿pensar o calcular?** → casi todo calcula. Tres agentes,
> los tres en el borde, ninguno en la cadena de decisión. Y ahora, además: **ninguno en el nacional.**

## Recuento

| Forma | Nº | Qué significa aquí |
|---|---|---|
| **REFLEJO puro** | 75 | cuatro medidas, relojes, céntimos, filtros, invariantes |
| **CUSTODIO** | 50 | un solo dueño por store: el evento, la propuesta, el contrato, el registro, los hechos |
| **PUENTE** | 13 | avisos, escalada, despliegue, enrutado, soporte, disputa |
| **CONVERSOR** | 3 | carta→escaparate · un precio→dos cobros · devengo→factura |
| **MICRO-AGENTE fuzzy** | 3 | el borde: redactar, leer una incidencia, resumir |
| **total** | **144** | + 3 **[ABIERTA]** |

```
por nivel     NACIONAL 25 · PLAZA 103 · TIENDA 16
por nivel y forma    el nacional es 25: 11 CUSTODIO (registro), 11 REFLEJO (proyección y guardas),
                     3 PUENTE (desplegar, enrutar, sostener). CERO conversores, CERO agentes.
                     → el nacional no transforma nada. Guarda y suma.
```

---

## Inventario completo, grupo a grupo

### A · PROPUESTA-ENLACE — el eslabón limitante · PLAZA  (35)

- `hecho-pedido-listo` — **CUSTODIO**
- `composicion-de-la-vista` — **REFLEJO**
- `congelacion-de-la-foto` — **REFLEJO**
- `candidatos-elegibles` — **REFLEJO**
- `ruta-base` — **REFLEJO**
- `ruta-con-parada` — **REFLEJO**
- `medida-desvio` — **REFLEJO**
- `medida-espera` — **REFLEJO**
- `retraso-por-parada` — **REFLEJO**
- `agregado-del-retraso` — **REFLEJO**
- `medida-cobra` — **REFLEJO**
- `regla-de-enlace` — **REFLEJO**
- `propuesta-emitida` — **CUSTODIO**
- `bloqueo-de-propuesta` — **CUSTODIO**
- `ventana-de-propuesta` — **CUSTODIO**
- `razones-de-la-decision` — **REFLEJO**
- `frase-derivada` — **REFLEJO**
- `redaccion-de-la-propuesta` — **FUZZY**
- `aceptacion-libre` — **CUSTODIO**
- `hora-de-aceptacion` — **REFLEJO**
- `rechazo-sin-coste` — **REFLEJO**
- `guarda-sin-puntuacion` — **REFLEJO**
- `caducidad-sin-respuesta` — **REFLEJO**
- `contrato-puntual` — **CUSTODIO**
- `siguiente-candidato` — **REFLEJO**
- `escalada-de-enlace` — **PUENTE**
- `guarda-sin-asignacion` — **REFLEJO**
- `guarda-sin-optimizador` — **REFLEJO**
- `reproduccion-de-la-decision` — **REFLEJO**
- `guarda-enlace-por-trayecto` — **REFLEJO**
- `guarda-enlace-no-rompe-promesa` — **REFLEJO**
- `guarda-no-captura-del-ahorro` — **REFLEJO**
- `guarda-propuesta-unica` — **REFLEJO**
- `hueco-de-medida` — **REFLEJO**
- `guarda-enlace-intra-plaza` — **REFLEJO**

### B · RUTA-VIVA · PLAZA  (6)

- `posicion-rider` — **CUSTODIO**
- `paradas-pendientes` — **REFLEJO**
- `promesa-por-parada` — **CUSTODIO**
- `orden-de-paradas` — **REFLEJO**
- `capacidad-declarada` — **CUSTODIO**
- `fin-de-trayecto` — **REFLEJO**

### C · PEDIDO · acto T / registro P  (7)

- `captura-pedido` — **REFLEJO**
- `estado-pedido` — **CUSTODIO**
- `aviso-tienda` — **PUENTE**
- `hora-de-listo` — **CUSTODIO**
- `estado-cocina-visible` — **REFLEJO**
- `aviso-cliente` — **PUENTE**
- `cancelacion` — **REFLEJO**

### D · PLAZA-TIENDA · T + P  (8)

- `marca-tienda` — **CUSTODIO**
- `carta-publica` — **CONVERSOR**
- `precio-cerrado` — **REFLEJO**
- `carrito-tienda` — **CUSTODIO**
- `registro-cliente-tienda` — **CUSTODIO**
- `plaza-publica` — **REFLEJO**
- `neutralidad-orden` — **REFLEJO**
- `radio-de-tienda` — **CUSTODIO**

### E · TARIFA-TRES-BANDAS · P  (7)

- `oferta-cliente` — **CUSTODIO**
- `incentivo-tienda` — **CUSTODIO**
- `precio-reparto` — **REFLEJO**
- `comision-coordinacion` — **REFLEJO**
- `reparto-del-pago` — **CONVERSOR**
- `contrato-tramos` — **CUSTODIO**
- `subida-de-oferta` — **CUSTODIO**

### F · REPARTO-MEDIDO · P  (7)

- `hechos-del-reparto` — **CUSTODIO**
- `prueba-entrega` — **CUSTODIO**
- `seguimiento-vivo` — **REFLEJO**
- `chat-enmascarado` — **PUENTE**
- `instrucciones-acceso` — **CUSTODIO**
- `incidencia-reparto` — **PUENTE**
- `lectura-de-incidencia` — **FUZZY**

### G · ADJUDICACIÓN DE FALLOS · P  (6)

- `ventana-espera` — **CUSTODIO**
- `hecho-verificado` — **REFLEJO**
- `regla-pago-fallo` — **REFLEJO**
- `cargo-fallo` — **CUSTODIO**
- `disputa-fallo` — **PUENTE**
- `trazabilidad-fallo` — **REFLEJO**

### H · LIQUIDACIÓN · P  (6)

- `devengo` — **REFLEJO**
- `ciclo-semanal` — **CUSTODIO**
- `factura-gestion` — **CONVERSOR**
- `cobro-gestion` — **PUENTE**
- `impago-gestion` — **REFLEJO**
- `guarda-no-retencion` — **REFLEJO**

### I · SALA-MERCADO · P  (8)

- `alta-tienda` — **CUSTODIO**
- `alta-rider` — **CUSTODIO**
- `estado-tienda` — **CUSTODIO**
- `estado-rider` — **CUSTODIO**
- `salud-mercado` — **REFLEJO**
- `tablero-fricciones` — **REFLEJO**
- `aviso-sala` — **PUENTE**
- `terminos-parte` — **CUSTODIO**

### J · CONFIG · P  (5)

- `config-umbrales` — **CUSTODIO**
- `config-ventana` — **CUSTODIO**
- `config-zona` — **CUSTODIO**
- `version-efectiva` — **REFLEJO**
- `simulador-de-umbrales` — **REFLEJO**

### K · CLIENTE FINAL · P+T  (2)

- `reclamacion-por-la-tienda` — **PUENTE**
- `guarda-marca-ajena` — **REFLEJO**

### L · RESTAURANTE · T  (4)

- `panel-tienda` — **REFLEJO**
- `guarda-propiedad-cliente` — **REFLEJO**
- `puntualidad-declarada` — **REFLEJO**
- `resumen-para-la-tienda` — **FUZZY**

### M · REPARTIDOR · P  (5)

- `cartera-rider` — **REFLEJO**
- `zona-rider` — **CUSTODIO**
- `guarda-sin-exclusividad` — **REFLEJO**
- `canal-rider` — **PUENTE**
- `vista-de-propuesta` — **REFLEJO**

### N · BOCAOS (el suelo) · P  (2)

- `politica-densidad` — **REFLEJO**
- `simulador-tramos` — **REFLEJO**

### O · ROL JEFE · P  (4)

- `cuadro-del-mercado` — **REFLEJO**
- `acta-decisiones` — **CUSTODIO**
- `cola-revision-humana` — **CUSTODIO**
- `dictamen-revision` — **CUSTODIO**

### P · ROL TRABAJADOR · P  (4)

- `cola-sala` — **CUSTODIO**
- `vista-parte` — **REFLEJO**
- `accion-sancion` — **CUSTODIO**
- `checklist-alta` — **REFLEJO**

### Q · ROL CLIENTE · P  (1)

- `estado-cuenta-parte` — **REFLEJO**

### S · FRONTERA · P  (2)

- `frontera-de-plaza` — **REFLEJO**
- `filtro-por-cobertura` — **REFLEJO**

### R · FEDERACIÓN · N  (25)

- `registro-de-plazas` — **CUSTODIO**
- `alta-de-plaza` — **CUSTODIO**
- `estado-de-plaza` — **CUSTODIO**
- `silencio-de-plaza` — **REFLEJO**
- `censo-de-tiendas` — **CUSTODIO**
- `version-de-plaza` — **CUSTODIO**
- `despliegue-de-plaza` — **PUENTE**
- `verificacion-de-despliegue` — **REFLEJO**
- `compatibilidad-de-version` — **REFLEJO**
- `indice-nacional` — **REFLEJO**
- `buscador-nacional` — **REFLEJO**
- `resultado-con-su-plaza` — **REFLEJO**
- `enrutado-a-plaza` — **PUENTE**
- `consolidacion-nacional` — **REFLEJO**
- `cuadro-de-la-federacion` — **REFLEJO**
- `marca-nacional` — **CUSTODIO**
- `licencia-de-marca` — **CUSTODIO**
- `soporte-nacional` — **PUENTE**
- `permiso-de-plaza` — **CUSTODIO**
- `traza-de-acceso` — **CUSTODIO**
- `acceso-delegado-a-plaza` — **CUSTODIO**
- `acta-de-federacion` — **CUSTODIO**
- `guarda-sin-catalogo-nacional` — **REFLEJO**
- `guarda-no-recauda` — **REFLEJO**
- `guarda-frontera-de-plaza` — **REFLEJO**

---

## Los 29 cortes nuevos — el razonamiento, pieza a pieza

### R · el registro (25)

| pieza | forma | la pregunta que lo decidió |
|---|---|---|
| `registro-de-plazas` | **CUSTODIO** | ¿quién escribe el padrón? Un solo dueño; las plazas se añaden por acto, no por descubrimiento. |
| `alta-de-plaza` | **CUSTODIO** | ¿abrir una plaza es un formulario o un acontecimiento? Un acto con fecha y responsable: se escribe una vez y no se reescribe. |
| `estado-de-plaza` | **CUSTODIO** | ¿cuatro estados y sus transiciones? Un dueño y una máquina; la quinta transición sería un estado nuevo, no un `if`. |
| `silencio-de-plaza` | **REFLEJO** | ¿cuánto puede callar una plaza? Un umbral y un reloj. No es la máquina de estados: la alimenta. |
| `censo-de-tiendas` | **CUSTODIO** | ¿copia o consulta? Copia: guarda nombre, id, estado y plaza, y **nunca** pregunta a la plaza. Un escritor, por evento. |
| `version-de-plaza` | **CUSTODIO** | ¿quién declara la versión? La plaza, en cada `plaza.viva`. El nacional la guarda, no la impone. |
| `despliegue-de-plaza` | **PUENTE** | ¿qué es desplegar? Un acto que cruza hacia otro sitio y **no decide** por él. |
| `verificacion-de-despliegue` | **REFLEJO** | ¿cómo se sabe que el despliegue salió bien? Comparando lo declarado con lo esperado. Sin esto, desplegar es rezar. |
| `compatibilidad-de-version` | **REFLEJO** | ¿tabla o negociación? Tabla cerrada: qué puede una plaza atrasada y qué no. Un test por fila. |
| `indice-nacional` | **REFLEJO** | ¿lo que se busca se guarda? No: se proyecta del padrón. Se reescribe cuando llega un censo. |
| `buscador-nacional` | **REFLEJO** | ¿busca o recomienda? Busca: una consulta sobre el índice. No escribe, no puntúa, no ordena por conveniencia. |
| `resultado-con-su-plaza` | **REFLEJO** | ¿puede haber un resultado huérfano? No: la forma del resultado incluye su plaza. Es una invariante de estructura. |
| `enrutado-a-plaza` | **PUENTE** | ¿sirve la página el nacional? No: redirige. Es la diferencia entre un directorio y un marketplace, en una línea. |
| `consolidacion-nacional` | **REFLEJO** | ¿suma? Suma devengos ya cerrados. No convierte moneda, no compensa, no cobra. |
| `cuadro-de-la-federacion` | **REFLEJO** | ¿qué ve el jefe del nacional? Agregados de plaza **con sus definiciones versionadas dentro**. Sin ellas compararía peras con manzanas. |
| `marca-nacional` | **CUSTODIO** | ¿quién posee la marca? Un dueño del activo, y su ámbito declarado (B2B). |
| `licencia-de-marca` | **CUSTODIO** | ¿qué puede hacer una plaza con la marca? Un contrato con alcance, condiciones y retirada. |
| `soporte-nacional` | **PUENTE** | ¿opera el nacional? No: sostiene el instrumento. Puente hacia la plaza, nunca dentro de su mercado. |
| `permiso-de-plaza` | **CUSTODIO** | ¿quién concede el acceso? La plaza. El nacional no se lo da a sí mismo, y por eso no es un `if` en el soporte. |
| `traza-de-acceso` | **CUSTODIO** | ¿dónde queda lo que se vio? Append-only, con quién y cuándo. Si se puede editar, no es una traza. |
| `acceso-delegado-a-plaza` | **CUSTODIO** | ¿el permiso caduca solo? Sí: es un permiso vivo con plazo, no un rol permanente. |
| `acta-de-federacion` | **CUSTODIO** | ¿qué aceptó cada plaza? Un documento con versión y firma; es la lista cerrada de lo compartido. |
| `guarda-sin-catalogo-nacional` | **REFLEJO** | ¿se puede testear? Sí: una consulta al esquema de datos del nacional. Si existe una tabla con carta, precio o carrito, el test está rojo. |
| `guarda-no-recauda` | **REFLEJO** | ¿se puede testear? Sí: ningún flujo del nacional mueve dinero de una parte, salvo el canon que le pague una plaza. |
| `guarda-frontera-de-plaza` | **REFLEJO** | ¿se puede testear? Sí: toda fila de pedido, propuesta o cargo lleva `plaza_id` y coincide con el despliegue que la escribió. |

### S · la frontera (2)

| pieza | forma | la pregunta que lo decidió |
|---|---|---|
| `frontera-de-plaza` | **REFLEJO** | ¿de qué plaza es una dirección? Una función sobre la cobertura declarada. **Necesita regla de desempate si dos coberturas se solapan (Q52).** |
| `filtro-por-cobertura` | **REFLEJO** | ¿filtra u ordena? Filtra: quita lo que no llega, no pone lo que paga. Dos tests distintos, y el segundo es `neutralidad-orden`. |

### D y A · las dos sueltas

| pieza | forma | la pregunta que lo decidió |
|---|---|---|
| `radio-de-tienda` | **CUSTODIO** | ¿quién declara hasta dónde reparte una tienda? Ella. Un valor del dueño, no una estimación del sistema. |
| `guarda-enlace-intra-plaza` | **REFLEJO** | ¿puede un pedido enlazarse con un rider de otra plaza? No: la ruta viva vive en un despliegue. Test: `plaza_id(propuesta) == plaza_id(pedido) == plaza_id(rider)`. |

---

## Las 6 que cambiaron de sitio sin cambiar de forma

```
config-umbrales · config-ventana · config-zona          CUSTODIO → sigue CUSTODIO, ahora de la PLAZA
devengo · ciclo-semanal · cobro-gestion · impago-gestion REFLEJO/CUSTODIO/PUENTE → sin cambio, de la PLAZA
contrato-tramos                                          CUSTODIO, contratante = la PLAZA
alta-tienda · alta-rider · estado-tienda · estado-rider   CUSTODIO, censos de la PLAZA
salud-mercado · tablero-fricciones                        REFLEJO, miden pedidos de la PLAZA
cuadro-del-mercado                                        REFLEJO, y nace su hermano del NACIONAL
```

**Ninguna cambia de forma.** Y eso tiene una lectura: la forma depende de **qué hace** la pieza
(calcular, custodiar, cruzar, convertir, juzgar), no de **quién es su dueño**. Si el §7 hubiera
cambiado formas, querría decir que el dueño cambiaba lo que la pieza hace — y entonces el corte
estaría mal hecho.

## Las 4 que se amplían (y siguen siendo cuatro)

`vista-de-propuesta` (+ la plaza) · `canal-rider` (una instancia por plaza) · `guarda-marca-ajena`
(+ la marca del nacional) · `neutralidad-orden` (+ "filtrar no es ordenar").

---

## Lo que la disección prohíbe construir

Las cinco de la v2 siguen en pie (planificador · scorer · predicción de cocina · agente que
adjudica · contador de rechazos). Y la §7 añade cuatro, todas del mismo tipo: **cosas que harían
del nacional una sede.**

1. **Un catálogo nacional.** Carta y precios de todas las tiendas: es el marketplace, y con él la
   captura de la demanda.
2. **Un índice con pedidos.** "Solo para métricas" es como empieza; con él, el nacional puede
   ordenar el mercado sin querer.
3. **Una sala nacional de operación.** El soporte que empieza mirando un pedido acaba asignando
   riders.
4. **Una puntuación federal de riders.** El histórico no viaja (regla 2); una nota federal es el
   histórico viajando por la puerta de atrás, y además es control (Directiva 2024/2831, art. 3–5).

Y una quinta, más sutil y más probable que las cuatro:

5. **Un cuadro de mando con demasiado detalle.** No es una pieza, es una tentación: si el jefe del
   nacional puede bajar hasta el pedido, tiene poder sin responsabilidad — la peor combinación. La
   frontera no la pone el código: la pone la pregunta Q56.

---

## Las tres [ABIERTA]

| pieza | existe si… | qué forma tendría |
|---|---|---|
| `transparencia-del-enlace` | el cliente sabe que su pedido comparte viaje (Q20) | PUENTE (avisa) o REFLEJO (solo cambia el precio mostrado) |
| `canon-de-plaza` | el nacional tiene ingreso (Q41) | CUSTODIO si es canon fijo; un coeficiente en `devengo` si es porcentaje |
| `pasaporte-de-rider` | la credencial viaja entre plazas (Q44) | PUENTE hacia el padrón de cada plaza |

Asignarles forma ahora sería inventar la respuesta. **Tres huecos en 144 hojas es un esquema sano:
la v2 tenía uno en 115, y era el mismo tipo de hueco (una decisión del dueño disfrazada de pieza).**
