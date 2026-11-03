# PASADA 2 · PUNTO: `federacion` — el nacional

> Sale del hueco IDENTIDAD de la r1: con la §7 hay un negocio dentro del negocio que no es un
> nivel del mercado, sino **otro negocio**: el registro. Este punto no existía en la v2.

## Prisma de los 5 huecos

### 1 · IDENTIDAD — ¿qué es la federación?

Es un **registro con marca y con software**. Tres funciones, ninguna de las cuales toca el
pedido:

```
saber      qué plazas existen, en qué estado, con qué versión, y qué tiendas hay en cada una
firmar     la marca bajo la que las plazas y las tiendas se presentan (B2B; nunca al cliente)
sostener   el software (una línea, N despliegues), el soporte y la liquidación consolidada
```

Lo que **no** es, y conviene decirlo con el mismo énfasis: no es la sede. No hay un centro que
reciba los pedidos, los reparta, los mire o los cuente. **El nacional no tiene el mercado: tiene
el mapa del mercado.**

La consecuencia más útil para el esquema: la federación **no puede** tener las piezas que
deciden. Todo lo que decide (a quién se propone, cuánto se cobra, quién paga el fallo) necesita
el evento y la foto del instante, y esas dos cosas viven en la plaza. La renuncia de la §6
("no hay cerebro central") deja de ser una decisión de producto y pasa a ser una imposibilidad
topológica. **Eso es lo que hace sólida la federación: no es que el nacional no quiera mandar,
es que no tiene con qué.**

### 2 · RESTRICCIONES (freno → empujón)

- **FRENO: el nacional no tiene los pedidos.** Protege que no pueda ordenar el mercado; limita
  su utilidad (no puede dar soporte operativo, no puede medir el mercado en tiempo real).
  → **EMPUJÓN**: `cuadro-de-la-federacion` (agregados de plaza, no de pedido) +
  `acceso-delegado-a-plaza` (cuando de verdad haga falta mirar, con permiso y traza).
- **FRENO: el nacional no recauda.** Protege la renuncia a ser banco (F0 §1).
  → **EMPUJÓN**: `consolidacion-nacional` + `acta-de-federacion` (el documento que dice de quién
  es cada euro cuando alguien pregunte).
- **FRENO: cada plaza tiene su versión del software y puede ir atrasada.** Protege que abrir una
  plaza no obligue a actualizar las demás (F0 §7: abrir es desplegar, no migrar).
  → **EMPUJÓN**: `version-de-plaza` + `compatibilidad-de-version` (un contrato de interfaz entre
  plaza y registro, no un despliegue sincronizado).
- **FRENO: el cliente no puede ver la marca del nacional.** Protege que el cliente sea de la
  tienda (F0 §6).
  → **EMPUJÓN**: `marca-nacional` con su ámbito declarado (B2B) + `guarda-marca-ajena` ampliada.
- **FRENO: cuanto más comparte el nacional, menos federación es** (F0 §7, la regla que hay que
  vigilar). Protege la naturaleza del negocio.
  → **EMPUJÓN**: el registro de lo compartido como **lista cerrada** — `acta-de-federacion`
  enumera las cinco cosas y cualquier sexta es un cambio de naturaleza, no una feature.

### 3 · CONTRATO

```
la plaza    da: su mercado, su operación, su liquidación, su censo
            recibe: marca, software, soporte, registro, y una consolidación que no le cobra
el nacional da: las cinco cosas
            recibe: [NADA DECLARADO — Q41]
la tienda   ni negocia con el nacional. Su contrato es con la plaza (Q42).
el rider    ni existe para el nacional. Su alta es por plaza (Q44).
```

### 4 · NO-OBJETIVOS

No tiene pedidos · no tiene catálogo ni precios · no tiene carrito · no recauda · no tiene
riders · no decide propuestas · no ordena tiendas en el buscador por conveniencia · no sanciona
tiendas ni riders · no opera la sala de una plaza · no es la parte contratante de la tienda
(salvo que Q42 diga lo contrario, y entonces hay que reescribir media federación).

### 5 · PREGUNTAS ABIERTAS

Q41 (con qué se paga) · Q42 (quién factura) · Q47 (puede salir una plaza, y con qué) ·
Q48 (qué busca el buscador) · Q49 (marca de plaza) · Q50 (quién abre una plaza) ·
Q53 (para qué consolida) · Q54 (qué datos mínimos de tienda viajan) · Q55 (la forma del
despliegue).

## Hojas

`registro-de-plazas` (CUSTODIO) · `alta-de-plaza` (CUSTODIO) · `estado-de-plaza` (CUSTODIO) ·
`censo-de-tiendas` (CUSTODIO) · `version-de-plaza` (CUSTODIO) · `despliegue-de-plaza` (PUENTE) ·
`compatibilidad-de-version` (REFLEJO) · `buscador-nacional` (REFLEJO) ·
`resultado-con-su-plaza` (REFLEJO) · `enrutado-a-plaza` (PUENTE) · `consolidacion-nacional`
(REFLEJO) · `marca-nacional` (CUSTODIO) · `soporte-nacional` (PUENTE) ·
`acceso-delegado-a-plaza` (CUSTODIO) · `acta-de-federacion` (CUSTODIO) ·
`cuadro-de-la-federacion` (REFLEJO) · `guarda-sin-catalogo-nacional` (REFLEJO) ·
`guarda-no-recauda` (REFLEJO) · `guarda-frontera-de-plaza` (REFLEJO).

**19 hojas.** Todas nuevas: la v2 no tenía nacional.

## La regla que ordena todas estas hojas

> **La federación habla por evento, no por consulta.**

El nacional no consulta la BD de una plaza; recibe sus hechos declarados. Si consultara, tendría
acceso a los pedidos por la puerta de atrás y todo el §7 se caería. Los tres únicos hechos que
una plaza publica hacia arriba:

```
plaza.viva          { plaza_id, version, estado, tiendas: N }        — periódico y barato
tienda.dada-de-alta { plaza_id, tienda_id, nombre, estado }          — cuando pasa
plaza.devengo-cerrado { plaza_id, periodo, total, partes: N }        — al cerrar la semana
```

Y los dos que el nacional publica hacia abajo:

```
version.nueva   { version }         — un aviso, no una orden: la plaza actualiza cuando puede
plaza.suspendida{ plaza_id, motivo }— la única orden que el nacional puede dar, y es de registro
```

**Lo que no está en esa lista, no cruza.** Ni un pedido, ni una posición, ni un precio, ni una
carta, ni un rider.

## Abierto que este punto deja

Si el nacional no consulta, ¿cómo sabe que una plaza está viva? Con `plaza.viva`. Y si una plaza
deja de publicarlo, ¿cuánto tarda el registro en darla por caída, y qué pasa con sus tiendas
mientras? Eso es `estado-de-plaza`, y su umbral de silencio es **configuración del nacional** —
una de las pocas que el nacional tiene derecho a tener.
