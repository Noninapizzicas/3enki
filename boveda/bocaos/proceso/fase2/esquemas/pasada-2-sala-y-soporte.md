# PASADA 2 · PUNTO: `sala-y-soporte` — la operación humana, partida en dos (I, partido)

> Sale del hueco CONTRATO de la r1, y es la **contradicción nº 3** de la pasada 1: el nacional
> comparte soporte (r.5) y no tiene los pedidos (§7). Este punto resuelve esa contradicción en dos
> piezas distintas que la v2 tenía fundidas.

## Prisma de los 5 huecos

### 1 · IDENTIDAD — dos cosas que se llamaban igual

```
LA SALA (de la plaza)     opera el día: excepciones vivas, disputas, altas, bajas, sanciones
                          ve pedidos, riders, tiendas, importes. Necesita el mercado entero.
EL SOPORTE (del nacional) sostiene el software: una versión rota, un despliegue, una duda de uso,
                          una plaza que no arranca. NO ve pedidos. No debe verlos.
```

La F0 dice "agentes, no sala humana", y hay que leerlo con precisión: **no hay un equipo humano de
operación por defecto**; hay agentes y una escalada. La escalada es de la plaza (es la que tiene el
caso). El soporte del nacional es de otra naturaleza: no es operación, es mantenimiento del
instrumento.

**La regla de oro de este punto:**

> El soporte del nacional puede tocar el software de una plaza. **No puede tocar su mercado.**
> Y si alguna vez necesita mirar un pedido para reproducir un fallo, lo hace con permiso de la
> plaza, con plazo, y queda escrito.

### 2 · RESTRICCIONES (freno → empujón)

- **FRENO: el nacional no ve pedidos.** Protege la §7 entera. Deja al soporte ciego ante los
  fallos que solo se ven con datos.
  → **EMPUJÓN**: `permiso-de-plaza` (la plaza concede, con alcance y plazo) + `traza-de-acceso`
  (append-only) + `acceso-delegado-a-plaza` (el permiso vivo, que caduca solo).
- **FRENO: a las 22:00 de un sábado no hay nadie.** Protege el coste (no hay sala 24/7).
  → **EMPUJÓN**: `cola-sala` con **orden de escalada declarado** y `aviso-sala` por el canal que
  el dueño elija. Lo que no puede pasar es que un pedido muera en silencio: si nadie responde,
  `escalada-de-enlace` ya dejó el caso en la cola con su hora.
- **FRENO: la revisión humana es un derecho, no una atención al cliente** (Directiva UE 2024/2831,
  art. 7–8 y art. 10: también para quien no tiene contrato de trabajo).
  → **EMPUJÓN**: `cola-revision-humana` + `dictamen-revision`, **en la plaza** (es quien decidió).
  Un dictamen del nacional sobre una propuesta de la plaza sería exactamente el planificador
  humano que la §6 prohíbe.
- **FRENO: una plaza caída necesita ayuda del nacional, y el nacional no puede entrar.**
  Protege la frontera. Bloquea la recuperación.
  → **EMPUJÓN**: el soporte entra **por el despliegue, no por los datos**: logs, versión,
  configuración de arranque. Si hace falta más, `permiso-de-plaza` — y si la plaza está caída, no
  puede conceder permiso, luego **el permiso tiene que estar pre-concedido para incidentes**
  (un permiso de emergencia, con alcance mínimo y traza). Eso es una decisión, y no está tomada.

### 3 · CONTRATO

```
la plaza    da: el caso, el contexto, y el permiso cuando lo concede
            recibe: software que funciona, y un dictamen humano cuando alguien lo pide
el nacional da: soporte de software y de método, y una versión compatible
            recibe: `plaza.viva`, versiones, y acceso **solo** con permiso
el rider    puede pedir revisión humana de una decisión que le afectó  → cola de SU plaza
la tienda   puede pedir revisión de un cargo                     → cola de SU plaza
```

### 4 · NO-OBJETIVOS

La sala no re-juzga un fallo (aplica la tabla, `regla-pago-fallo`) · no rehace una propuesta
(sería un planificador humano) · no sanciona sin acta · el soporte no opera pedidos · el soporte
no sanciona · el soporte no cambia umbrales (eso es la plaza y su acta) · **el nacional no tiene
una sala propia: tiene un mostrador de software.**

### 5 · PREGUNTAS ABIERTAS

**Q46** (¿el soporte puede ver pedidos? ¿con qué permiso, plazo y traza?) ⚠ · Q25 (¿la revisión
humana se construye desde el día uno?) · Q26 (¿quién firma el dictamen?) · Q40 (quién atiende la
sala y en qué horario) · Q47 (qué pasa cuando la plaza cae).

## Hojas

**PLAZA (heredadas de la v2, sin cambio de forma):**
`alta-tienda` · `alta-rider` · `estado-tienda` · `estado-rider` · `salud-mercado` ·
`tablero-fricciones` · `aviso-sala` · `terminos-parte` · `cola-sala` · `vista-parte` ·
`accion-sancion` · `checklist-alta` · `cola-revision-humana` · `dictamen-revision` · `acta-decisiones`

**NACIONAL (nuevas):**
`soporte-nacional` (PUENTE) · `permiso-de-plaza` (CUSTODIO) · `traza-de-acceso` (CUSTODIO) ·
`acceso-delegado-a-plaza` (CUSTODIO)

## El caso que hay que decidir sí o sí

```
23:40 · sábado · plaza de una sola ciudad · un pedido lleva 18 minutos sin rider
   → `escalada-de-enlace` lo pone en la cola
   → no hay nadie en la sala (no hay sala: hay agentes)
   → ¿quién lo mira?

1 · nadie: el pedido caduca y el cliente se queda sin cena. El mercado lo absorbe y el rider
    no pierde nada. Es la opción coherente con "agentes, no sala humana".
2 · el dueño de la plaza, avisado: es una persona con un móvil, no una sala. Funciona hasta que
    hay tres plazas.
3 · el soporte del nacional: contradice la §7 en la primera semana de operación.
```

La F0 ya eligió "agentes, no sala humana", así que la opción 1 es la que el esquema debe hacer
**decente** en vez de silenciosa: el pedido caduca **con aviso al cliente** por el canal de la
tienda y con el hecho escrito. Eso es una pieza de comportamiento, no de personal: el cliente debe
saber que su pedido no va a llegar **antes** de que se enfríe. Y eso no está declarado en ninguna
parte (Q40).
