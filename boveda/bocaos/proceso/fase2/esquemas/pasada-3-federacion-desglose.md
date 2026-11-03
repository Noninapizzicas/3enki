# PASADA 3 · PUNTO `federacion` — desglose (19 → 25)

> Segundo paso del prisma sobre el mismo punto, ahora pieza a pieza. Seis de las diecinueve
> **se parten**: una pieza que hacía dos trabajos con un solo dueño es una corrupción esperando
> turno, aunque los dos trabajos sean "de registro".

## Las diecinueve, una a una

### Registro y censo

**`registro-de-plazas` — no se parte.** Es el padrón: id, localidad, estado, versión, fecha de
alta. Un solo escritor (`alta-de-plaza`, `estado-de-plaza`, `plaza.viva`). Lo que **sí** hay que
decidir es qué es una plaza "borrada": si una plaza se cierra, ¿desaparece del padrón o queda
con estado `cerrada` para siempre? El esquema pide lo segundo — un padrón que olvida no sirve
para liquidar el pasado (Q47).

**`alta-de-plaza` — no se parte.** Abrir una plaza es un acto con fecha, responsable y versión
inicial. Lo que no está declarado es **quién** puede hacerlo (Q50) ni qué se firma al hacerlo
(`acta-de-federacion`).

**`estado-de-plaza` — SE PARTE en dos.**
El estado es una máquina (`naciendo · operando · en pausa · cerrada`) y el **vigilante del
silencio** es otra cosa: cuánto puede callar una plaza antes de que el registro la declare
caída. Una es un custodio del estado; la otra es un reflejo con un umbral.
→ `estado-de-plaza` (CUSTODIO) + **`silencio-de-plaza`** (REFLEJO, nuevo).

**`censo-de-tiendas` — no se parte.** Es la proyección de las altas que cada plaza publica. Dos
reglas duras: (a) el nacional guarda **nombre, id, estado y plaza** — no su carta, no su
dirección fiscal, no su carta de precios; (b) se alimenta por evento, **nunca** consultando la
plaza. Si una tienda se da de baja, el censo la marca; no la borra (Q54).

### Software y despliegue

**`version-de-plaza` — no se parte.** Qué versión corre cada plaza, declarada por la plaza al
publicar `plaza.viva`. Es lo que permite que la federación sea "el mismo código, N despliegues"
sin convertirse en "una actualización, N rehenes".

**`despliegue-de-plaza` — SE PARTE en dos.**
Desplegar es un acto (`PUENTE`); **verificar que el despliegue funcionó** es otra cosa y tiene
dueño distinto: la plaza tiene que responder `plaza.viva` con la versión nueva y con sus tiendas
vivas. Sin esa verificación, "abrir plaza es desplegar" se convierte en "abrir plaza es rezar".
→ `despliegue-de-plaza` (PUENTE) + **`verificacion-de-despliegue`** (REFLEJO, nuevo).

**`compatibilidad-de-version` — no se parte, pero es más de lo que parece.** No es "¿funciona?",
es **"¿qué puede hacer una plaza atrasada y qué no?"**. La respuesta tiene que ser una tabla
cerrada, porque una plaza atrasada que sigue operando es exactamente el estado deseado (no
depender del nacional para operar). Lo que la plaza atrasada **no** puede es recibir hechos
nuevos del registro (`version.nueva` con campos que no conoce): se los salta y lo declara.

### Buscador y enrutado

**`buscador-nacional` — SE PARTE en dos.**
El **índice** es una proyección del padrón (qué plazas y qué tiendas existen, por localidad) y
la **búsqueda** es una función sobre ese índice. Dueños distintos: el índice se reescribe cuando
llega un censo; la búsqueda no escribe nada nunca.
→ **`indice-nacional`** (REFLEJO, nuevo) + `buscador-nacional` (REFLEJO).

**`resultado-con-su-plaza` — no se parte.** Es la invariante hecha dato: **no existe un resultado
huérfano**. Todo resultado lleva el id de su plaza, porque sin él no hay a dónde enrutar y el
nacional tendría que servir la página (y entonces sería el escaparate).

**`enrutado-a-plaza` — no se parte.** El clic sale del nacional y entra en la plaza. El nacional
**no sirve la página**: redirige. Es la diferencia entre un directorio y un marketplace, y está
en una línea de código.

### Marca

**`marca-nacional` — SE PARTE en dos.**
La marca como activo (quién la posee, qué se publica con ella) y la **licencia**: qué puede
hacer una plaza con la marca — su rótulo, su dominio, su papelería, su nombre comercial
("Bocaos Málaga" — Q49). Lo primero es un custodio del activo; lo segundo es un contrato.
→ `marca-nacional` (CUSTODIO) + **`licencia-de-marca`** (CUSTODIO, nuevo).

### Soporte y acceso

**`soporte-nacional` — no se parte, y es la pieza más incómoda del grupo.** El nacional comparte
soporte y no tiene pedidos: solo puede dar **soporte de software y de método**. Todo lo que sea
"mira este pedido" pasa por `acceso-delegado-a-plaza`. Si el dueño quiere que el nacional atienda
la operación de una plaza, entonces el nacional **sí** ve pedidos y la regla 5 de la §7 cambia de
naturaleza — no de grado (Q46).

**`acceso-delegado-a-plaza` — SE PARTE en tres (dos piezas y un plazo).**
Conceder el permiso y auditar lo visto son dos actos con dueños distintos, y el plazo es un
atributo del permiso, no una pieza.
→ **`permiso-de-plaza`** (CUSTODIO, nuevo: la plaza concede, con alcance y plazo) +
**`traza-de-acceso`** (CUSTODIO, nuevo: append-only, qué se vio, cuándo, quién) +
`acceso-delegado-a-plaza` (PUENTE? no: queda como **CUSTODIO** del permiso vivo — ver nota).

> *Corrección de forma al desglosar*: `acceso-delegado-a-plaza` nace en la pasada 2 como
> CUSTODIO. Al partirse, la pieza que queda es el **acto de conceder** (CUSTODIO) y el puente es
> el canal por el que el nacional entra (que ya es `soporte-nacional`). No se inventa una cuarta.

### Dinero y cuadro

**`consolidacion-nacional` — no se parte.** Suma devengos cerrados por plaza y periodo. **No
toca un euro**: es una suma de números que ya existen en otra parte. Su valor es que es la única
cifra que el nacional puede dar sin pedir permiso (Q53).

**`cuadro-de-la-federacion` — no se parte.** Plazas vivas, versiones, aceptación por plaza,
devengo consolidado. Todo agregado de plaza, **nada de pedido**. Es el cuadro del jefe del
nacional, y su tentación es pedir "un poquito más de detalle" — que es exactamente la puerta por
la que se entra al §7 al revés.

**`acta-de-federacion` — no se parte.** El documento que dice qué aceptó cada plaza al federarse:
las cinco cosas compartidas, la versión de las reglas comunes, la fecha. Es la lista cerrada que
hace verificable la regla 5.

### Guardas

**`guarda-sin-catalogo-nacional`**, **`guarda-no-recauda`**, **`guarda-frontera-de-plaza` — no
se parten.** Son tres invariantes con test, y las tres se pueden escribir como una consulta al
esquema de datos del nacional: *¿existe alguna tabla con `pedido`, `precio`, `carta`, `carrito` o
`importe`?* Si existe, el test está rojo. Ese es el tipo de renuncia que se puede **auditar**, y
por eso vale la pena escribirla como pieza.

## Recuento del desglose

```
pasada 2   19 piezas
pasada 3   +6  (silencio-de-plaza · verificacion-de-despliegue · indice-nacional ·
                licencia-de-marca · permiso-de-plaza · traza-de-acceso)
           = 25 piezas en el grupo R (NACIONAL)
```

| Pieza nueva del desglose | Forma | Por qué se separó |
|---|---|---|
| `silencio-de-plaza` | REFLEJO | el umbral de silencio no es la máquina de estados: uno mide, la otra escribe |
| `verificacion-de-despliegue` | REFLEJO | desplegar y comprobar son dos actos; el segundo tiene test |
| `indice-nacional` | REFLEJO | lo que se busca (proyección) ≠ buscar (función) |
| `licencia-de-marca` | CUSTODIO | el activo y el permiso de uso tienen dueños distintos |
| `permiso-de-plaza` | CUSTODIO | conceder el acceso es de la plaza, no del nacional |
| `traza-de-acceso` | CUSTODIO | lo que se vio se escribe aparte, y no se puede reescribir |

## Lo que este desglose deja abierto (va al guion)

- ¿Qué pasa con las tiendas de una plaza **caída**? ¿Siguen en el buscador nacional? (Si sí, el
  nacional está prometiendo un reparto que no existe; si no, el cliente de esa localidad pierde
  el escaparate por un fallo ajeno.) → Q47, y es una decisión de producto, no técnica.
- ¿La `traza-de-acceso` la puede leer la plaza? (Debería: es su dato. Entonces la traza se
  escribe en la plaza, no en el nacional, y el nacional la publica hacia abajo.)
- ¿El `indice-nacional` incluye tiendas o solo plazas? Si incluye tiendas, el nacional se parece
  mucho a un directorio de restaurantes — y eso ya es otra cosa que un registro de plazas.
