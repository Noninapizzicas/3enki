# PASADA · ROL: `trabajador` (la sala — opera el día)

> La función interna que opera HOY: altas, pedidos sin rider, incidencias, disputas,
> suspensiones. Es el rol que más rápido crece si el mercado no se mide bien — y por eso
> su contrato incluye **no crecer**.

## Prisma de los 5 huecos DESDE LA SILLA DEL TRABAJADOR

### 1 · IDENTIDAD — ¿qué es el negocio para el trabajador?
**Una cola de excepciones.** Lo normal (pedido → oferta → aceptación → entrega) no le
llega: le llega lo que se rompe. Su día se mide en casos cerrados, no en horas.

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: los casos llegan por sitios distintos (un pedido sin rider, una tienda que
  llama, un rider que no encuentra el portal, una disputa). → **EMPUJÓN**: `cola-sala`
  única, con prioridad por consecuencia (un pedido vivo primero; un alta después).
- **FRENO**: para decidir necesita ver todo lo de una tienda o un rider, y eso está en
  cinco sitios. → **EMPUJÓN**: `vista-parte` (una pantalla por parte: altas, estados,
  pedidos, esperas, cargos, deudas).
- **FRENO**: suspender a alguien sin motivo escrito es arbitrario y peligroso (legal). →
  **EMPUJÓN**: `accion-sancion` con motivo, plazo y acta.
- **FRENO**: dar de alta una tienda o un rider mal deja el mercado roto desde el día uno.
  → **EMPUJÓN**: `checklist-alta` (qué falta y quién lo aporta), no memoria.

### 3 · CONTRATO — qué espera VER y ACTUAR + LÓGICA que exige
- **VER**: la cola del día; el estado de cada pedido vivo; la salud de cada zona; las
  disputas con su evidencia delante.
- **ACTUAR**: admitir con checklist; suspender con motivo y plazo; reemitir una oferta;
  abrir o cerrar una disputa; avisar a una tienda de que su espera se está cobrando.
- **LÓGICA**: `cola-sala` (store único de la cola), `vista-parte` (proyección cruzada por
  parte), `accion-sancion` (store de sanciones con motivo y caducidad), `checklist-alta`
  (regla de completitud del alta).

### 4 · NO-OBJETIVOS del rol trabajador
- NO fija precios, tramos ni umbrales (eso es del jefe).
- NO juzga un fallo con hecho medido: lo aplica; si hay duda, abre disputa.
- NO decide sobre la tesis del negocio (a quién se parece Bocaos).
- NO atiende al cliente final: le remite a su tienda.

### 5 · PREGUNTAS ABIERTAS
- ¿Cuántas personas hay en la sala al arrancar y en qué horario?
- ¿El trabajador puede mover una N en una urgencia, o es siempre el jefe?
- ¿Puede readjudicar un fallo ya asentado, o solo abrir disputa?
- ¿Qué se hace con una tienda que acumula tres disputas en un mes? (no declarado)

## PIEZAS QUE SOLO EMERGEN DESDE EL ROL TRABAJADOR (al árbol)
- **`cola-sala`** — CUSTODIO. La cola única de excepciones vivas.
- **`vista-parte`** — REFLEJO. Proyección de todo lo de una tienda o un rider en una vista.
- **`accion-sancion`** — CUSTODIO. Suspensión/expulsión con motivo, plazo y acta.
- **`checklist-alta`** — REFLEJO. Regla de completitud de un alta (tienda y rider).

## VALIDACIÓN CRUZADA
- `disputa-fallo`, `oferta-sin-rider`, `incidencia-reparto`, `aviso-sala` se refuerzan aquí:
  todas caen en esta silla.
- **Conflicto detectado**: el jefe quiere `umbral-mercado` (cambiar reglas rápido) y el
  trabajador necesita estabilidad (que la regla no cambie a mitad de un caso). Se resuelve
  con vigencia por fecha en `umbral-mercado`: la regla cambia, pero cada caso se juzga con
  la que estaba vigente cuando ocurrió.
