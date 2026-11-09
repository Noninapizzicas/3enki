# Pasada 1 — prisma sobre el sujeto crudo

**Sujeto:** «un soporte impreso que, al ser consultado, no devuelve una respuesta fija
sino una decisión».

**Ley aplicada:** agnosticismo. Ningún transporte, almacén, protocolo ni marco. Todo lo
que depende del entorno se nombra como PUERTO.

---

## 1 · IDENTIDAD — qué es y qué trabajo resuelve

**Qué es.** Un identificador **físico y estable** que, al ser consultado, pasa por una
**decisión** antes de responder. El soporte no contiene la respuesta: contiene una
pregunta. La respuesta la elige un tercero cada vez.

**Qué trabajo resuelve.** Dos trabajos distintos, y conviene no confundirlos:

- **Trabajo del que imprime** (caducidad): un soporte impreso deja de ser válido en cuanto
  cambia lo que hay detrás. El sujeto desacopla el soporte de la respuesta: lo impreso
  dura, lo servido cambia.
- **Trabajo del que decide** (intención): el dueño quiere que lo servido dependa del
  momento, del lugar, de quién vuelve y del azar; y quiere saber qué pasó.

**La tensión que define al sujeto:** *estabilidad física* (no puedo reimprimir) contra
*variabilidad de la respuesta* (quiero cambiarla siempre). Todo el diseño nace de ahí.

---

## 2 · RESTRICCIONES — reglas duras (si se rompen, el sujeto está MAL)

1. **El soporte no cambia.** Una vez emitido, su contenido físico es inmutable. Cualquier
   diseño que obligue a reimprimir para cambiar algo está muerto.
2. **Toda decisión es reproducible y explicable.** Dado el mismo contexto y el mismo
   estado, la misma respuesta. Y siempre se puede decir **qué regla** decidió.
3. **Una recompensa no puede exceder el coste autorizado.** El sistema no puede gastar
   más de lo que el dueño permitió, ni por azar ni por volumen.
4. **Un derecho de canje se consume una sola vez.** No hay doble uso.
5. **No se identifica a personas.** Se observa la visita, no al visitante.
6. **Degradación obligatoria.** Si una pieza no responde, el sujeto sigue sirviendo una
   respuesta válida (la base). Nunca un error delante del cliente final.
7. **El azar no puede ser explotable.** La misma visita no puede repetir el sorteo hasta
   ganar.

---

## 3 · CONTRATO — qué sabe, qué se toca, qué estados tiene

**Atributos de saber (no se tocan, se consultan):**
identificador · destino base · conjunto de reglas · contexto disponible en el momento ·
historial de esa visita · coste acumulado del día.

**Opciones (lo que el dueño SÍ toca):**
- **Qué se sirve** — el destino (una carta, una ficha, un mensaje)
- **Cuándo** — franjas horarias, días
- **Dónde** — zonas (mesa, terraza, barra, calle)
- **A quién** — primera visita, visita repetida
- **Cuánto se premia** — probabilidad y tope
- **Cómo se ve** — mensaje o formato servido

**Sub-formas de las opciones** (huella del sujeto): `variante` (destinos alternativos),
`modificacion` (ajustar una regla existente), `añadido` (un premio sobre la carta),
`personalizacion_libre` (mensaje del dueño).

**Estados del identificador:** `borrador → activo → pausado → retirado`.

**Estados de la decisión:** `base` (ninguna regla casó) · `por_regla` · `por_azar` ·
`limitada` (tope alcanzado: se sirve base).

---

## 4 · NO-OBJETIVOS — qué NO es

- **No es un acortador.** Un acortador cambia un destino a mano; aquí el destino lo elige
  una regla en cada consulta.
- **No es una aplicación.** No se instala nada en el cliente final.
- **No es analítica de personas.** No hay perfil, ni historial nominal, ni seguimiento
  entre negocios.
- **No es un motor probabilístico.** La decisión es determinista y auditable; la IA no
  decide a quién se premia.
- **No es un gestor de contenidos.** No edita el destino; solo elige cuál de los
  declarados se sirve.
- **No es un sistema de fidelización con cuentas.** No hay registro del cliente final.

---

## 5 · PREGUNTAS ABIERTAS — lo privado (no se inventa; es el onboarding)

| # | Pregunta | Por qué es del dueño |
|---|---|---|
| 1 | ¿Qué significa «estar en el local»? (radio, red, zona declarada) | Solo él conoce su geometría |
| 2 | ¿Cuánto vale cada premio? | Es su coste |
| 3 | ¿Cuántos premios al día como máximo? | Es su riesgo |
| 4 | ¿Qué franjas horarias tiene el negocio? | Es su operación |
| 5 | ¿Qué idiomas atiende? | Es su clientela |
| 6 | ¿Qué cuenta como «la misma persona»? | Es su tolerancia al abuso |
| 7 | ¿Quién puede pausar un identificador? | Es su organigrama |
| 8 | ¿Qué pasa si dos reglas empatan? | Es su criterio |
| 9 | ¿Qué se considera «éxito» de una regla? | Es su métrica |

**Madurez del sujeto:** `necesita_aclaracion_dueno` en 1-9; el resto está resuelto por
forma.

---

## Sub-productos que pare el prisma (SPAWN)

| id | Sub-producto | Naturaleza |
|---|---|---|
| A | **El soporte emitido** — el identificador físico y su unicidad | SPAWN |
| B | **El catálogo de lo servible** — los destinos declarados | SPAWN |
| C | **El lenguaje de decisión** — cómo se declara «cuándo → entonces» | SPAWN |
| D | **La lectura del contexto** — qué se sabe al consultar | SPAWN |
| E | **La recompensa** — premio, derecho, tope, consumo | SPAWN |
| F | **El registro de lo ocurrido** — qué pasó y qué regla ganó | SPAWN |
| G | **La identidad anónima de la visita** — recurrencia sin nombre | SPAWN |
| H | **La lectura del negocio** — métricas y comparación | SPAWN |
| I | **El control del dueño** — dónde y cómo cambia las cosas | SPAWN |
| J | **El aviso** — lo que el dueño debe saber sin mirar | SPAWN |
| K | **La degradación** — qué se sirve cuando algo falla | ATÓMICO (regla, no órgano) |
| L | **El cobro** — la suscripción del negocio | SPAWN |

**Reparto:** 11 SPAWN · 1 ATÓMICO.
