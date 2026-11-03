# PASADA · ROL: `jefe` (el dueño del mercado — decide, no opera)

> El ROL es la función interna que el sistema debe servir. Aquí el jefe es el dueño de
> Bocaos: no reparte, no atiende, no cocina. **Declara las reglas y decide lo que no se
> mide.** Se esquematiza aparte del trabajador aunque al principio sea el mismo humano.

## Prisma de los 5 huecos DESDE LA SILLA DEL JEFE

### 1 · IDENTIDAD — ¿qué es el negocio para el jefe?
**Un mercado que él gobierna por reglas, no por intervención.** Su trabajo es fijar los
umbrales (las N, el tope de enlace, la zona, los tramos), decidir a quién se admite y a
quién se saca, y ver si el mercado se corrige solo. Si tiene que decidir cien cosas al día,
el mercado está mal diseñado.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: no puede mirar 40 tiendas y 60 riders uno a uno. → **EMPUJÓN**: `salud-mercado`
  (pedidos, aceptaciones, riders activos, tiendas activas, devengado) y `tablero-fricciones`
  (los 8 pares, medidos).
- **FRENO**: sus decisiones cambian el comportamiento de todos y no puede probarlas en
  caliente a ciegas. → **EMPUJÓN**: `simulador-tramos` + `umbral-mercado` (mover una N y ver
  el efecto en la semana siguiente, sin tocar nada más).
- **FRENO**: decidir sin rastro convierte el mercado en arbitrario. → **EMPUJÓN**:
  `acta-decisiones` append-only.
- **FRENO**: si decide cada excepción, la sala no escala. → **EMPUJÓN**: `cola-decisiones-sala`
  con paquete cerrado (caso + hechos + consecuencia propuesta).

### 3 · CONTRATO — qué espera VER y ACTUAR (cara de interfaz) y qué LÓGICA exige
- **VER**: cuadro del mercado (pedidos/día, % de aceptación a la primera, riders activos por
  zona, espera media por tienda, fricción por par, devengado y cobrado).
- **ACTUAR**: declarar N_t/N_c/N_a, tope de enlace, radio de zona, tramos; admitir o expulsar
  tienda/rider; abrir o cerrar una zona; resolver una disputa en segunda instancia.
- **LÓGICA que exige construir**: `cola-decisiones-sala` (una sola cola), `umbral-mercado`
  (el store de las reglas que todos leen), `acta-decisiones` (la memoria de por qué), y la
  agregación de `salud-mercado` sobre todos los hechos.

### 4 · NO-OBJETIVOS del rol jefe
- NO opera la sala (eso es el trabajador) ni atiende reclamaciones una a una.
- NO cocina, NO reparte, NO fija el precio de la comida.
- NO decide el resultado de un fallo que ya tiene hecho medido: eso lo aplica el sistema.
- NO usa el escaparate como palanca comercial: no hay destacados que vender.

### 5 · PREGUNTAS ABIERTAS
- ¿Qué decide solo y qué exige consenso con la sala?
- ¿Con qué cadencia quiere el cuadro (diario, semanal, por evento)?
- ¿Puede bajar una N después de haberla publicado? ¿con qué aviso?
- ¿Quién es el jefe de la sala cuando haya más de una persona?

## PIEZAS QUE SOLO EMERGEN DESDE EL ROL JEFE (al árbol)
- **`cola-decisiones-sala`** — CUSTODIO. Una sola cola de decisiones con consecuencia sobre
  personas (admitir, expulsar, sancionar, abrir zona, resolver disputa).
- **`umbral-mercado`** — CUSTODIO. El store de las N, el tope de enlace, el radio y los
  tramos: **un solo escritor** (el jefe) y todos los demás leen. Es la palanca de gobierno.
- **`acta-decisiones`** — CUSTODIO. Append-only: qué se decidió, con qué hechos y por qué.
  Sin acta, el mercado no es explicable y la confianza se cae.
