# PASADA 2 · PUNTO: `pedido-listo`

> Sale del hueco CONTRATO de la pasada 1. Con el matiz de la F0 §6 este punto **cambia de
> naturaleza**: deja de ser "el pedido que viaja" y pasa a ser **el disparador**. El pedido
> no existe para Bocaos hasta que la tienda dice que está listo, y esa frase es el evento que
> arranca toda la cadena.

## Prisma de los 5 huecos

### 1 · IDENTIDAD
El paso de *pedido* a *pedido listo*, con hora. Es el único evento que dispara una decisión de
enlace, y lo emite **la tienda** — no el sistema. Eso tiene una consecuencia que el esquema
subraya: **la puntualidad de la tienda es la fuente de la verdad del mercado**. Si marca
listo cuando no lo está, el rider espera; y esa espera ya no es una opinión, es un número que
vuelve a aparecer en la siguiente propuesta a ese local.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: la tienda puede marcar listo antes de tiempo para "liberar" el pedido.
  → **EMPUJÓN**: `hora-de-listo` es un hecho inmutable y alimenta `puntualidad-declarada`
  (L03). El mercado la corrige: una cocina que marca pronto y entrega tarde recibe riders
  peores o más caros, sin que nadie la sancione.
- **FRENO**: el pedido puede cancelarse antes de estar listo.
  → **EMPUJÓN**: `cancelacion` con tabla de transiciones; el disparador solo existe si el
  pedido sigue vivo. Quién paga el rechazo, **Q36**.
- **FRENO**: si la tienda nunca marca listo, el pedido no existe para el mercado.
  → **EMPUJÓN**: `aviso-sala` a partir de un tiempo declarado (**Q28**). No se inventa un
  plazo.

### 3 · CONTRATO
La tienda da: un hecho con hora y la verdad sobre su cocina. Recibe: que su pedido se proponga
en el segundo en que está listo, no cuando un planificador se acuerde.

### 4 · NO-OBJETIVOS
No es una estimación de tiempo de cocina (no hay modelo que prediga cuándo estará): es un
hecho declarado por quien cocina. Bocaos no adivina la cocina.

### 5 · PREGUNTAS ABIERTAS
Q28 (las tres N) · Q36 (rechazo de la tienda) · ¿la tienda acepta el pedido o entra directo?
¿puede marcar listo desde el TPV y desde el escaparate a la vez?

## Hojas
`captura-pedido` (REFLEJO) · `estado-pedido` (CUSTODIO) · `aviso-tienda` (PUENTE) ·
`hora-de-listo` (CUSTODIO) · `estado-cocina-visible` (REFLEJO) · `aviso-cliente` (PUENTE) ·
`cancelacion` (REFLEJO)

Siete. `hora-de-listo` es la que **dispara A01**, y por eso está aquí y no en el grupo A: la
escribe la tienda.
