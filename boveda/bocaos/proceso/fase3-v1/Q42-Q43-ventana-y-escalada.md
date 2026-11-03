# Q42 · La ventana de los 10 segundos — resuelto
# Q43 · La escalada sin sala — resuelto

> Las dos bloqueaban el diseño. Las dos son de diseño, no de software:
> si se dejan abiertas, se arrastran hasta el código.

---

## Q42 · ¿10 s desde la emisión o desde la llegada?

**El problema.** Si el reloj empieza cuando la propuesta **sale**, y el móvil del
rider tarda 4 segundos en recibirla, el rider tiene **6 segundos reales**. Rechaza
sin haberla leído — y no porque no le interese, sino porque no le dio tiempo.

**Si el reloj empieza cuando el rider la recibe**, un canal roto deja la ventana
abierta para siempre y el pedido se queda esperando a alguien que ya no está mirando.

### La solución: dos relojes, no uno

```
VALIDEZ     20 s desde la EMISIÓN        el pedido no puede esperar más
DECISIÓN    10 s desde el ACUSE          el rider tiene 10 s reales
ACUSE       si no llega en 5 s → se retira y va al siguiente candidato
```

**Por qué dos.** El de validez protege al pedido (y al cliente, que está
esperando). El de decisión protege al rider (que no debe perder una propuesta
por culpa de la red).

**Y el acuse no es una cortesía: es el dato.** Sin acuse no hay propuesta —
solo un mensaje enviado al vacío. Si el canal no confirma, el sistema **no
espera**: pasa al siguiente. Un rider sin cobertura no bloquea el mercado.

```
consecuencia para la F3
  · PropuestaEmitida necesita DOS marcas de tiempo: emitida_en, acusada_en
  · el desenlace "caduca" se parte en dos: caduca_sin_acuse · caduca_sin_respuesta
  · la métrica "propuestas aceptadas / emitidas" se mide sobre EMITIDAS,
    pero la de calidad del canal se mide sobre ACUSADAS
```

---

## Q43 · La escalada cuando no hay sala (las 22:00)

**El problema.** Dos candidatos, los dos dicen que no. Son las 22:00 y no hay
nadie en la sala. El pedido se queda colgado y el cliente no sabe nada.

### La solución: escalada en tres peldaños, sin humano

```
PELDAÑO 1    los 2 candidatos         10 s cada uno      (~20 s)
PELDAÑO 2    TODOS los riders activos 30 s               (~50 s)
             del barrio, no solo 2
PELDAÑO 3    subir la oferta          escalones que el CLIENTE autorizó
                                      al hacer el pedido
             si en 5 min nadie coge → el pedido se cancela
                                      y el cliente lo sabe ANTES de pedir
```

**El peldaño 2 es el que faltaba.** El diseño de la F3 abría la propuesta a
**dos** candidatos, y si los dos decían no, no había plan. Pero el mercado no
son dos riders: son todos los activos del barrio. **Abrirlo a todos es lo que
haría cualquier sala** — y no hace falta que haya alguien para hacerlo.

**El peldaño 3 es dinero, y por eso lo autoriza el cliente.** Al pedir, el
cliente puede decir: *«pago hasta 5 € por el reparto»*. Si nadie lo coge a 3,50,
el sistema sube a 4,00, luego a 4,50, y para en 5,00. **El cliente nunca paga
más de lo que autorizó, y el rider nunca acepta menos de lo que le compensa.**
Las dos cosas a la vez.

**Y la cancelación es explícita.** Si en cinco minutos nadie lo coge, el pedido
se cancela y el cliente lo sabe — **antes de pedir**, porque el sistema le dice
cuánto puede tardar en encontrar rider en ese barrio a esa hora. Cancelar sin
avisar es lo que hace Glovo.

---

## Lo que esto añade al diseño

```
· la propuesta tiene DOS relojes, no uno (validez y decisión)
· el desenlace "caduca" se parte en dos (sin acuse / sin respuesta)
· la escalada es un flujo de 3 peldaños, no un "y si no, la sala"
· el tope de la subida lo pone el CLIENTE al pedir, no el sistema a posteriori
· la sala pasa de "imprescindible" a "excepciones": el mercado funciona sin ella
```

**La última línea es la que importa.** Si el mercado necesita una persona
despierta a las 22:00 para funcionar, no es un mercado: es una tienda con
empleados. Y eso es exactamente lo que Bocaos dice que no quiere ser.

---

## Lo que queda abierto

```
1 · ¿cuánto tarda el peldaño 2? ¿30 s o 60 s? (depende de cuántos riders haya)
2 · ¿el cliente ve cuánto se está subiendo la oferta, o solo el resultado?
3 · ¿el rider del peldaño 2 ve que es "segunda ronda"? (sí debería: cambia su
    percepción de urgencia y de precio)
4 · ¿qué pasa con el pedido cocinado si se cancela? (el restaurante ha gastado)
```
