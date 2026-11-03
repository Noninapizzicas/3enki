# GUION DE PREGUNTAS ABIERTAS — Bocaos (30)

> Estas preguntas **no son dudas del analista**: son los huecos que impiden que una pieza
> pase de "diseñada" a "construida". Cada una dice **qué pieza desbloquea**. Se preguntan una
> a una, esperando respuesta. **Ninguna se estima.**
>
> Con las respuestas se rehace el planteamiento y se vuelve a pasar el prisma (pasada 2 del
> ciclo) sobre las cinco piezas abiertas: `ventana-espera`, `cargo-fallo`, `contrato-tramos`,
> `tope-enlace`, `zona-servida`.

---

## Bloque 1 · DINERO Y LEGAL (lo que decide si el negocio es viable)

**Q1 [F0] · Precio de la coordinación.**
¿Cuánto el **tramo 1** (fijo mensual por tienda)? ¿Cuántos **céntimos** el **tramo 3**, al rider
y a la tienda, por pedido?
→ desbloquea `contrato-tramos`, `devengo`, `comision-coordinacion`, `simulador-tramos`.
→ sin esto, el simulador no puede enseñar nada y el mercado no sabe cuánto cuesta entrar.

**Q2 [F0] · Mecanismo de adjudicación.**
El principio está decidido ("mide, no juzga"). **Cómo se prueba y quién decide** cuando alguien
discute, no. ¿Vale el acta (relojes + foto) como prueba única? ¿Quién resuelve la disputa: la
sala, el dueño, una segunda instancia?
→ desbloquea `disputa-fallo`, `regla-pago-fallo`, `trazabilidad-fallo`.

**Q3 [F0] · Responsabilidad legal.**
¿De qué responde Bocaos en un reparto hecho por un autónomo? Y antes: **¿con quién contrata el
rider** — con Bocaos, con el restaurante o con el cliente final? (La F0 dice que "se oferta a
los restaurantes" y que "el cliente le paga el reparto": las dos cosas a la vez no pueden ser
la misma relación contractual.)
→ desbloquea `terminos-parte`, `alta-rider`, `reparto-del-pago`.
→ investigación ya hecha (esquema §9): en España la Inspección de Trabajo ha calificado de
falso autónomo el modelo cuando la plataforma **organiza y manda** con protocolos. La relación
contractual decide si eso te alcanza.

**Q4 [NUEVA] · Impuestos y facturación.**
¿Se factura con impuestos? ¿Quién factura a quién (Bocaos a la tienda, Bocaos al rider)? ¿Alta
de actividad y epígrafe?
→ desbloquea `factura-gestion` (la frontera de formato) y `terminos-parte`.

**Q5 [NUEVA] · Fianza, prepago o permanencia.**
El corte es semanal: hay 7 días de exposición con cada parte. ¿Se pide fianza o prepago? ¿Hay
permanencia? ¿Y si una tienda no paga: se le suspende la plaza o se le corta también el reparto?
→ desbloquea `impago-gestion` y `cobro-gestion`.

**Q6 [NUEVA] · Comisión en pedido fallido.**
¿Se devenga la comisión de Bocaos si el pedido acaba en fallo o cancelación? ¿Quién la paga?
→ desbloquea `devengo` (caso borde) y `cargo-fallo`.

---

## Bloque 2 · LOS RELOJES Y LA EFECTIVIDAD DEL FALLO (el corazón del negocio)

**Q7 [NUEVA] · Las tres N.**
¿Cuántos minutos son N_t (espera en tienda), N_c (espera en el portal) y N_a (para llegar tras
aceptar)? El principio está escrito; **el número no existe** y sin él no hay regla.
→ desbloquea `ventana-espera` (las tres ventanas) y, con ellas, toda la adjudicación.

**Q8 [NUEVA] · Cómo se cobra un cargo.**
Bocaos no toca el dinero. Entonces, el cargo por fallo: ¿**pago directo** entre las partes,
**compensación** contra la cuota semanal, o **fianza** retenida?
→ desbloquea `cargo-fallo` (efectividad). **Es el hueco más caro del esquema**: sin esto, las
tres reglas del fallo son decorativas y el rider vuelve a pagar la espera — que es exactamente
lo que le hace irse.

**Q9 [NUEVA] · Cuando falta la prueba.**
Sin foto, sin posición o sin hora de bajada: ¿a favor de quién se presume? (rider, tienda o
cliente).
→ desbloquea `hecho-verificado` (caso `fallo-sin-prueba`).

**Q10 [F0] · "Pierde el pedido".**
Si el rider acepta y no llega, ¿qué pierde exactamente: la tarifa, la prioridad, el pedido, o
se le anota? Ojo: si hay castigo, deja de ser autónomo de verdad (Q3).
→ desbloquea `liberacion-por-abandono` y `guarda-sin-exclusividad`.

**Q11 [NUEVA] · Cuando el fallo es de Bocaos.**
Si la plaza se cae o la oferta no se emite: ¿quién paga la espera? Hoy el esquema no tiene
respuesta y es la que más caro sale si se ignora.
→ desbloquea un caso nuevo en `regla-pago-fallo` y `cargo-fallo`.

---

## Bloque 3 · LA OFERTA Y EL ENLAZADO (el producto)

**Q12 [F0] · Quién decide el enlazado.**
¿El rider, el sistema o los dos? (La F0 lo dejó preguntado.)
→ desbloquea `enlazado-viaje` (quién dispara) y `tope-enlace`.

**Q13 [NUEVA] · Subir la oferta.**
Si nadie acepta, ¿puede el cliente subir lo que paga por el reparto? ¿Puede la tienda añadir
incentivo después de emitida la oferta?
→ desbloquea `oferta-sin-rider` y `precio-reparto`. Es el mecanismo natural de un mercado: si
no existe, el pedido simplemente muere.

**Q14 [NUEVA] · Tope y alcance del enlace.**
¿2 o 3 pedidos? ¿Y pueden ser de **tiendas distintas** en el mismo viaje? (La F0 dice "2–3
pedidos del mismo viaje" sin decirlo.)
→ desbloquea `enlazado-viaje` y `paradas-del-viaje`.

**Q15 [NUEVA] · Qué es "cerca".**
¿Radio en metros, barrio, tiempo de llegada? ¿Se mide desde el rider o desde la tienda?
→ desbloquea `elegibilidad-rider` y `zona-rider`. Sin valor, "cercano" es una puntuación opaca
— justo lo que la F0 prohíbe.

---

## Bloque 4 · EL PEDIDO Y LA ZONA

**Q16 [NUEVA] · Las zonas.**
¿Qué zonas cubre el mercado? ¿Se define por barrio, por radio o por tienda? Sin zona no se
puede saber si un pedido es servible antes de aceptarlo.
→ desbloquea `zona-servida` y `politica-densidad`.

**Q17 [NUEVA] · Aceptación de la tienda.**
¿La tienda acepta explícitamente el pedido o entra directo a cocina? ¿Hay tiempo máximo para
aceptar antes de que se caiga?
→ desbloquea `estado-pedido` (transición 2) y `rechazo-cancelacion`.

**Q18 [NUEVA] · Rechazo.**
¿Puede la tienda rechazar un pedido? ¿Quién paga ese rechazo (el cliente espera, el rider ya
se había movido)?
→ desbloquea `rechazo-cancelacion` + `regla-pago-fallo`.

**Q19 [NUEVA] · Mover la hora.**
¿Puede la tienda cambiar la hora comprometida después de aceptar? (Se mediría igual, pero hay
que declararlo: quien mueve la hora, mueve la espera.)
→ desbloquea `compromiso-recogida` (caso `cambio-de-hora`).

**Q20 [NUEVA] · Recogida en tienda.**
¿La plaza admite que el cliente recoja? No está declarado. Si sí: es un **desacople del eslabón
limitante** (el pedido deja de depender de un rider) y cambia el orden de construcción.
→ desbloquea una rama entera de A/B; decisión del dueño, no del analista.

---

## Bloque 5 · EL MERCADO Y LAS PARTES

**Q21 [NUEVA] · Mercado mínimo.**
¿Se abre **una zona o varias**? ¿Cuántas tiendas y cuántos riders hacen falta en una zona para
que un pedido encuentre rider? (Sin este número no hay plan de arranque, solo una esperanza.)
→ desbloquea `politica-densidad` y `salud-mercado` (umbrales de alarma).

**Q22 [NUEVA] · Consecuencia de la cocina lenta.**
Si una tienda va lenta dos semanas seguidas: ¿se le avisa, se le saca del mercado, se le obliga
a subir el incentivo, nada? **Es la pieza que hace que el mercado corrija** — hoy no existe la
consecuencia, solo la medida.
→ desbloquea `historico-restaurante` (uso) y `accion-sancion`.

**Q23 [NUEVA] · Exclusividad y alta.**
¿La tienda puede estar a la vez en otro agregador? ¿Hay alta de admisión? ¿Permanencia mínima?
→ desbloquea `alta-tienda` y `terminos-parte`.

**Q24 [NUEVA] · Acreditación del rider.**
¿Se le exige alta de autónomo y seguro? ¿Quién lo verifica: Bocaos al admitirlo, o se declara
bajo su responsabilidad?
→ desbloquea `alta-rider` y `checklist-alta`. Enlaza con Q3.

**Q25 [NUEVA] · La sala.**
¿Quién la atiende al principio (el dueño solo)? ¿En qué horario? ¿Cuántas manos cuando crezca?
→ desbloquea `cola-sala`, `aviso-sala`, `cola-decisiones-sala`.

**Q26 [NUEVA] · El corte semanal.**
¿Qué día y hora? ¿Semana natural o rodante? ¿Cómo se cobra a cada parte y qué pasa si el cobro
falla?
→ desbloquea `ciclo-semanal` y `cobro-gestion`.

**Q27 [NUEVA] · El cliente final.**
¿Compra como invitado o con cuenta de la tienda? ¿Ve el desglose (comida / reparto / incentivo)?
→ desbloquea `registro-cliente-tienda`, `precio-cerrado` (presentación) y `carrito-tienda`.

**Q28 [NUEVA] · Transparencia entre partes.**
¿El restaurante ve el importe que ofertó el cliente por el reparto? ¿El rider ve cuánto paga la
tienda de incentivo?
→ desbloquea `panel-tienda` y `cartera-rider` (qué se muestra y a quién).

**Q29 [NUEVA] · Datos de posición.**
¿Cuánto tiempo se guarda la traza? ¿El cliente ve la posición en todo momento o solo desde la
recogida? ¿Quién puede verla después?
→ desbloquea `hechos-del-reparto` y `seguimiento-vivo`.

**Q30 [NUEVA] · Rechazos del rider.**
¿Rechazar tiene alguna consecuencia? Si la tiene, hay que vigilar el equilibrio con Q3: un
rider castigado por rechazar deja de ser autónomo.
→ desbloquea `elegibilidad-rider` y `guarda-sin-exclusividad`.

---

## CÓMO SE CIERRA ESTE GUION

```
las respuestas llegan
   ↓
se escriben en el hueco correspondiente (nunca como estimación: como valor declarado)
   ↓
pasada 2 del ciclo sobre las cinco piezas abiertas:
  ventana-espera · cargo-fallo · contrato-tramos · tope-enlace · zona-servida
   ↓
esquema.md se rehace con los huecos cerrados
   ↓
proceso-negocio.completar_fase { fase: 'esquematizado' }  →  FASE 3 · PLASMA
```

**Prioridad si solo hay tiempo para tres:** Q7 (las N), Q8 (cómo se cobra el fallo) y Q1
(el precio). Las tres juntas deciden si el rider se queda — que es la única pregunta de la que
depende que exista mercado.
