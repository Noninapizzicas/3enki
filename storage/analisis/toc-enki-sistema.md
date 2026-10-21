# Diagnostico TOC del Sistema Enki

> Analisis de restricciones (Teoria de las Restricciones, Goldratt) aplicado al sistema
> Enki como plataforma distribuida event-driven. Fecha: 2026-09-13.
> Fuentes: CLAUDE.md, 7 rebanadas de cabecera, exploracion del arbol de modulos.

---

## FASE A — PRISMA DE 5 HUECOS

### 1. IDENTIDAD

**Que es Enki.** Una plataforma modular event-driven (MQTT + EventBus) que opera como
cerebro digital de negocios comerciales. Nacio para pizzerias (POS vivo en produccion)
y aspira a servir cualquier vertical de comercio via el prisma universal.

**Objetivo del sistema.** Entregar valor funcional autonomo al comerciante: que el
sistema opere, aprenda, ofrezca y construya capacidad sin requerir la presencia
constante del desarrollador.

**Throughput.** Operaciones funcionales completadas por el usuario por unidad de tiempo:
transacciones POS, costeos, generacion de cartas, gestion de recetas, flujos de cocina,
y — en el horizonte — cualquier flujo comercial que el prisma universal modele.

**Escala medida (2026-09-13):**

| Dimension | Cantidad |
|---|---|
| Modulos backend (module.json) | 198 |
| Habilitados en config | 117 |
| Blueprint-driven (LLM por op) | 28 |
| Modulos frontend (manifest.json) | 51 |
| Paginas SvelteKit | 39 |
| Skills en cantera | 418 |
| Agentes definidos (flota) | 455 |
| Agentes activos en runtime | ~0 (todos aparcados) |
| Tests | 252 archivos |
| Grupos de modulos | conversacion(8), pizzepos(31), prisma(25), otros(134) |

### 2. RESTRICCIONES (borrador)

Candidatos iniciales al cuello de botella:

1. **LLM como medio de ejecucion.** 28 modulos blueprint-driven consumen un turno LLM
   por operacion. Cada turno es lento (~segundos), caro (tokens), y fragil (puede alucinar).
   El patron hibrido (reflejo JS + blueprint LLM) redujo escandallo de 300K a 42K tokens
   (85%), pero solo se aplico a 2 modulos de 28.

2. **Modulos construidos vs accesibles.** 198 modulos backend contra 39 paginas frontend
   (ratio 5:1). Muchas capacidades existen en el bus pero el usuario no las alcanza
   directamente por UI.

3. **Flota de agentes dormida.** 455 definiciones de agentes, casi todas aparcadas
   (enabled:false). El mecanismo de buscar/activar funciona (verificado en vivo), pero
   la flota no entrega valor hasta que alguien la enciende.

4. **Busqueda semantica apagada.** cantera-semantica (Turso, busqueda por significado)
   esta cableada y testeada pero OFF por defecto (interruptor, grupo sistema). Sin
   proveedor de embeddings operativo, la fusion RRF cae a solo palabras.

5. **El prisma universal a v0.1.** 25 modulos prisma/ en estado de bancos puros. El
   producto universal de 5 huecos esta disenado pero no operativo fuera de pizzeria.

### 3. CONTRATO (senales de que funciona)

| Senal | Metrica | Estado |
|---|---|---|
| POS operativo | Transacciones/dia en produccion | VIVO (pizzerias reales) |
| Costeo de recetas | Latencia de turno de escandallo | OPTIMIZADO (42K tokens, hibrido) |
| Cantera buscable | Skills encontradas / query | 418 skills, keyword funciona, semantica OFF |
| Agentes activables | Ciclo buscar-activar-invocar-desactivar | VERIFICADO en vivo, pero 0 activos |
| Aprendizaje automatico | Skills destiladas del bus | Destilador ON, sella patterns reales |
| Conserje proactivo | Empujones ofrecidos | OFF por defecto (3 interruptores) |
| Frontend reactivo | Paginas con datos MQTT en vivo | 39 paginas, MQTT singleton funcional |
| Hibrido reflejo+LLM | Modulos con lectura determinista | 2 de 28 migrados (recetas, escandallo) |

### 4. NO-OBJETIVOS

- Enki NO es un CRM de clientes finales (el cliente del comerciante no interactua
  directamente con Enki salvo via WhatsApp bot y carta digital).
- Enki NO compite con ERPs tradicionales por cobertura funcional inmediata — prioriza
  la arquitectura que permite crecer.
- La flota de 455 agentes NO necesita estar toda encendida — el modelo es biblioteca
  (busca y activa bajo demanda, no big-bang).
- La cantera-semantica OFF no es un fallo — es una decision de riesgo consciente
  (Turso BETA, proveedor de embeddings pendiente).

### 5. PREGUNTAS ABIERTAS

- [ABIERTO] Cuantas operaciones blueprint-driven realiza un comerciante tipico por dia?
  (Sin este dato, la magnitud del cuello de botella LLM es estimada, no medida.)
- [ABIERTO] Cual es el coste mensual en tokens LLM de un proyecto activo? (La presion
  economica del turno LLM vs reflejo es intuitiva pero no cuantificada aqui.)
- [ABIERTO] Cuantos modulos de los 198 tienen USAGE real (bus con eventos fluyendo)?
  (Hay modulos que existen en codigo pero pueden no estar enchufados al runtime.)
- [ABIERTO] El prisma universal v0.1 — hay un vertical concreto (taller, cafeteria)
  esperando para probarlo, o es exploracion abierta?

---

## FASE B — TOC SOBRE RESTRICCIONES (Goldratt)

### B1. ARBOL DE REALIDAD ACTUAL (cadena causa-efecto)

```
CAUSA RAIZ 1: EL DESARROLLO AVANZA EN ANCHURA
  El sistema crece en modulos nuevos (198, 25 prisma, 12 marketing)
  mas rapido de lo que las capacidades existentes se consolidan para el usuario.
    |
    v
EFECTO 1: INVENTARIO DE CAPACIDAD NO SURFACEADA
  198 modulos backend, 39 paginas. Ratio 5:1.
  455 agentes definidos, ~0 activos. Ratio infinito.
  418 skills en cantera, busqueda semantica OFF.
  28 blueprint modules, solo 2 optimizados con hibrido.
    |
    v
EFECTO 2: EL USUARIO NO ALCANZA LO QUE EXISTE
  El comerciante tiene acceso al POS (comandero, cocina, cobros),
  al chat, y a un subconjunto de paginas. Las capacidades que estan
  en el bus pero sin pagina o sin tool accesible NO generan throughput.
    |
    v
EFECTO 3: EL CHAT SE CONVIERTE EN CUELLO DE BOTELLA COMPENSATORIO
  Como muchas capacidades SOLO se alcanzan via chat (tools del LLM),
  el canal conversacional absorbe demanda que una UI directa serviria
  mas rapido. Cada operacion por chat = 1 turno LLM (serial, lento, caro).
    |
    v
EFECTO 4: EL THROUGHPUT DEL USUARIO SE LIMITA AL CHAT
  El usuario espera turnos de LLM para operaciones que podrian ser
  clicks en una UI. Las operaciones deterministas (listar, consultar,
  calcular) pasan por el LLM innecesariamente en los 26 modules
  blueprint-driven no migrados al hibrido.
    |
    v
CONSECUENCIA: EL SISTEMA ENTREGA MENOS VALOR DEL QUE PODRIA
  La capacidad instalada (198 modulos) excede la capacidad accesible
  (~39 paginas + tools de chat). El delta es throughput perdido.
```

```
CAUSA RAIZ 2: CADA BLUEPRINT OP = 1 TURNO LLM (politica)
  28 modulos blueprint-driven: toda operacion (leer, listar, costear,
  generar) pasa por el LLM.
    |
    v
EFECTO: OPERACIONES DETERMINISTAS QUEMAN TURNO LLM
  Leer recetas, listar ingredientes, calcular costes — operaciones
  cuyo resultado es COMPUTABLE se delegan al LLM (tokens, latencia,
  riesgo de alucinacion).
    |
    v
EVIDENCIA DEL PROBLEMA Y SU CURA
  Escandallo: 300K tokens/turno → 42K con hibrido (85% reduccion).
  Recetas: lecturas+persist servidas por reflejo JS, mismo contrato de bus.
  NOTA EXPLICITA en la rebanada: "siguiente: mismo patron a
  productos/categorias/ingredientes/tarifas".
    |
    v
EFECTO: SOLO 2 DE 28 MIGRADOS
  La cura existe y esta probada, pero el inventario de modulos por
  migrar (26) es trabajo pendiente que no se ha despachado.
```

```
CAUSA RAIZ 3: CONSERJE Y PLANIFICADOR OFF/TEMPRANOS
  El conserje (3 facultades: brecha, rutas, cantera) nace OFF.
  El planificador esta en fase "juguete" (opera sobre ~4 skills).
    |
    v
EFECTO: DESCUBRIMIENTO PASIVO
  El comerciante no sabe lo que el sistema puede hacer salvo que
  ya lo conozca o pregunte. El ofrecer proactivo (conserje) esta
  apagado. El ensamblar por objetivo (planificador) no escala aun.
    |
    v
CONSECUENCIA: LA CANTERA ES MUNICION SIN DISPARAR
  418 skills almacenadas. El feeder trae del ecosistema publico.
  Pero sin conserje ON ni semantica ON, la skill queda dormida
  hasta que el usuario la busque por nombre o el LLM la encuentre
  por keyword.
```

### B2. IDENTIFICAR LA RESTRICCION

**LA restriccion (septiembre 2026):**

> **El pipeline de CONVERSION de modulo construido a capacidad accesible, fiable
> y ofrecida al usuario.**

**Tipo: POLITICA (con componente fisico de bandwidth humano).**

Explicacion: El sistema construye capacidad mas rapido de lo que la convierte en
valor para el usuario. Hay un inventario masivo de capacidad no-realizada:

| Recurso | Construido | Accesible al usuario | Ratio |
|---|---|---|---|
| Modulos backend | 198 | ~39 paginas + tools chat | ~5:1 |
| Agentes | 455 | ~0 activos | infinito |
| Skills cantera | 418 | keyword-only (semantica OFF) | parcial |
| Blueprints | 28 | 2 optimizados (hibrido) | 7% |
| Conserje | 3 facultades | OFF por defecto | 0% |

La restriccion NO es la capacidad de construir (el sistema construye a ritmo alto
con ayuda de Claude). La restriccion ES la capacidad de SURFACEAR, OPTIMIZAR y
ACTIVAR lo construido para que el usuario lo toque.

La politica que gobierna esta restriccion: **construir primero, surfacear despues.**
Es una politica razonable en fase de diseno (hay que tener la pieza antes de
mostrarla), pero en la fase actual (con 198 modulos, POS vivo, y un prisma que
aspira a universalizar) la politica ha invertido su utilidad: lo que mas throughput
generaria es CONSOLIDAR, no seguir expandiendo.

### B3. LOS 5 PASOS DE FOCALIZACION

#### Paso 1 — IDENTIFICAR

La restriccion: el pipeline de conversion modulo→valor-usuario. Es el eslabón que
determina cuanto throughput genera el sistema ENTERO, porque un modulo sin via de
acceso al usuario tiene throughput = 0 sin importar lo bueno que sea su codigo.

#### Paso 2 — EXPLOTAR (exprimir SIN invertir)

Explotar = sacar el maximo de la restriccion con lo que ya existe:

1. **Propagar el patron hibrido a los 6 modulos nombrados.** La rebanada de
   conversacion dice explicitamente: "siguiente: mismo patron a productos/categorias/
   ingredientes/tarifas." Esto NO es inversion nueva — el patron ya esta probado y
   documentado en recetas+escandallo. Es aplicarlo 4-6 veces mas. Cada migracion
   reduce tokens 85%, mejora latencia, y elimina alucinaciones en lecturas.

2. **Encender el conserje (interruptores ON).** El codigo esta escrito y testeado.
   Cambiar un interruptor de OFF a ON es una operacion de 0 tokens de inversion.
   El conserje activo ofrece skills pertinentes sin que el usuario las busque.

3. **Activar 5-10 agentes del catalogo.** El ciclo buscar-activar-invocar esta
   verificado en vivo. Elegir los 5 agentes mas utiles para el dominio pizzepos
   (ej: escandallo-analyzer, marketing-strategist, recipe-chef-advisor) y
   activarlos es un cambio de configuracion, no de codigo.

4. **Encender cantera-semantica.** Si hay un proveedor de embeddings disponible
   (gemini/openai, el cableado ya existe), encender el interruptor da busqueda
   por significado sobre 418 skills. Sin proveedor, este paso espera.

#### Paso 3 — SUBORDINAR (el resto sirve a la restriccion)

El resto del sistema debe subordinarse al pipeline de conversion:

- **Pausar la creacion de modulos nuevos** hasta que los 26 blueprint-driven
  pendientes tengan su lectura por reflejo. Cada modulo nuevo sin UI aumenta
  el inventario de WIP sin aumentar el throughput.

- **Priorizar paginas frontend para los modulos mas usados** que aun no
  tienen pantalla propia. El chat compensa, pero una pagina dedicada es
  throughput directo (click > turno LLM).

- **Los agentes de pipeline (generar-skill, generar-blueprint, f6-f7-completo)**
  deben servir a la conversion, no a la expansion: ejecutar generar-skill
  sobre los modulos existentes que carecen de skill, para llenar la cantera
  de capacidades descubribles.

- **El destilador (ON, minando el bus)** debe seguir sellando patterns reales.
  Cada skill destilada es una pieza mas que el conserje puede ofrecer y el
  planificador puede ensamblar.

#### Paso 4 — ELEVAR (invertir para ampliar capacidad)

Si la explotacion y subordinacion no bastan, invertir en:

1. **Un agente de propagacion del patron hibrido.** Un pipeline que tome un
   modulo blueprint-driven, identifique sus operaciones deterministas (leer,
   listar, calcular), y genere el reflejo JS automaticamente. Este agente
   (extension de generar-skill o crear-blueprint-full) convertiria la migracion
   de semanas en horas. Coste: 1 agente + 1 pipeline. Beneficio: 26 modulos
   liberados.

2. **Un generador de paginas frontend desde el blueprint.** El pipeline
   f6-f7-completo ya genera trio manifest+index+Panel. Si se automatiza
   para los ~50 modulos con ui_handlers pero sin pagina, el ratio 5:1
   se reduce drasticamente. Los agentes esquematizador-* estan listos
   pero con 0 ejecuciones — ejecutarlos es la elevacion.

3. **Embedding provider operativo.** Conectar un proveedor de embeddings
   (gemini o openai, el cableado existe en cantera-semantica) desbloquea
   la busqueda por significado y mejora la capacidad del conserje y
   planificador para encontrar la skill correcta.

#### Paso 5 — REPETIR (donde migra la restriccion)

Al elevar la restriccion actual (surfacear lo construido), la restriccion
MIGRARA a:

- **Demanda del mercado.** Con el prisma universal operativo y las capacidades
  surfaceadas, la restriccion dejara de ser interna (lo que podemos entregar)
  y pasara a ser externa (cuantos comerciantes usan el sistema). En TOC,
  esto es la restriccion de MERCADO — la mas sana, porque significa que la
  capacidad interna excede la demanda.

- **Calidad y fiabilidad.** Con mas modulos accesibles y mas agentes activos,
  la superficie de fallo crece. La restriccion migrara hacia testing,
  observabilidad y resiliencia (areas que hoy son tempranas: el ejecutor
  nace OFF, el bus-guard nace OFF, security-p2p esta disabled).

### B4. NUBE DE EVAPORACION (el conflicto)

Hay un conflicto implicito en la politica de desarrollo:

```
OBJETIVO COMUN: Entregar valor funcional maximo al comerciante.

NECESIDAD A: Construir nuevas capacidades (modulos, prisma, agentes)
  → ACCION A: Seguir expandiendo en anchura (mas modulos, mas verticales)

NECESIDAD B: Que el comerciante use lo que existe
  → ACCION B: Consolidar lo construido (UI, hibridos, activar agentes, conserje ON)

CONFLICTO: A y B compiten por el mismo recurso (tiempo del desarrollador + turnos LLM).
           Hacer A reduce B y viceversa.
```

**Supuestos detras de la flecha A→Accion A:**
- S1: "Si no construyo el prisma ahora, perdera impulso de diseno."
- S2: "Los modulos nuevos necesitan existir ANTES de poder surfacearlos."
- S3: "El LLM como acelerador permite construir rapido, asi que hay que aprovecharlo."

**Supuestos detras de la flecha B→Accion B:**
- S4: "Un modulo sin UI no genera throughput."
- S5: "El comerciante solo usa lo que puede tocar."
- S6: "La cantera sin conserje es municion sin disparar."

**Supuesto que se puede ROMPER:** S2 — "los modulos necesitan existir ANTES de
surfacearlos." En realidad, el sistema ya tiene 198 modulos. El supuesto era valido
cuando habia 20, pero con 198 es obsoleto. La prioridad ya no es construir mas, sino
hacer que los 198 existentes entreguen valor.

**INYECCION (disuelve el conflicto):**

> **Redirigir el 70% del esfuerzo de desarrollo hacia la consolidacion de lo existente
> durante un sprint de 4-6 semanas.** El 30% restante sigue avanzando el prisma y las
> piezas criticas. Esta inyeccion no detiene el crecimiento — lo SUBORDINA a la
> conversion.

Concretamente:
1. Semanas 1-2: Propagar hibrido a productos/categorias/ingredientes/tarifas (4 migraciones).
2. Semanas 2-3: Encender conserje + cantera-semantica + activar 5 agentes.
3. Semanas 3-4: Ejecutar f6-f7-completo sobre 10 modulos prioritarios (generar paginas).
4. Semanas 4-6: Medir throughput (operaciones/dia del comerciante), ajustar, repetir.

### B5. EFECTOS DE SEGUNDO ORDEN

Al mover la restriccion (consolidar lo existente):

**Positivos:**
- El conserje ON genera un efecto de DESCUBRIMIENTO: el comerciante empieza a tocar
  capacidades que no sabia que tenia. Esto genera datos nuevos en el bus, que el
  destilador mina, que sella skills nuevas, que el conserje ofrece. Es un CICLO
  VIRTUOSO de aprendizaje.

- Los agentes activos ejecutan tareas que hoy requieren turno humano+LLM. Cada
  agente activo es un multiplicador de throughput.

- La reduccion de tokens por hibrido libera PRESUPUESTO economico para mas turnos
  LLM en operaciones realmente fuzzy (generacion creativa, analisis profundo).

- Las paginas frontend nuevas reducen la carga del chat como canal compensatorio,
  liberando el chat para lo que realmente necesita LLM (conversacion, decision,
  creacion) en vez de CRUD.

**Negativos (a vigilar):**
- Mas capacidades activas = mas superficie de fallo. Sin el ejecutor con guard ON
  y sin bus-guard ON, la apertura del sistema es un riesgo. PALANCA: encender
  los guards gradualmente (escalera off→observe→enforce).

- El conserje ON puede saturar al usuario si la prioridad/cooldown no esta bien
  calibrada. PALANCA: el diseno ya contempla cooldown, prioridad (brecha>rutas>cantera),
  y consume-on-read. Validar en vivo.

- Propagar el hibrido a 26 modulos tiene riesgo de regresion si los tests no cubren
  el comportamiento pre-migracion. PALANCA: los 252 archivos de test existentes y
  la politica de gates hibridos (11/0 en cosecha).

**Variables dormidas que se activan:**
- El **planificador** pasa de "juguete sobre ~4 skills" a herramienta util si la
  cantera crece con skills de los modulos consolidados. El lazo
  destilador→cantera→planificador se vuelve productivo.

- La **busqueda universal** (5 cupulas en paralelo, fusion RRF) empieza a dar
  resultados relevantes cuando hay mas contenido indexado y la semantica esta ON.

- El **prisma universal** recibe validacion indirecta: al consolidar pizzepos, los
  patrones que funcionan se destilan y alimentan los bancos del prisma. Consolidar
  no frena el prisma — lo FERTILIZA.

---

## RESUMEN EJECUTIVO

**LA restriccion del sistema Enki (septiembre 2026) es el pipeline de conversion
de modulo construido a capacidad accesible al usuario.**

El sistema tiene 198 modulos, 418 skills, 455 agentes y un core event-driven maduro.
Pero el comerciante accede a ~39 paginas, 0 agentes estan activos, el conserje esta
apagado, y 26 de 28 modulos blueprint-driven queman turnos LLM para operaciones
deterministas.

**La restriccion es de POLITICA** (construir en anchura antes de surfacear en
profundidad), con un componente FISICO (bandwidth del desarrollador). No es de
mercado (hay un comerciante real usando el POS) ni de capacidad tecnica (el core
es robusto).

**Palanca de mayor rendimiento:** Propagar el patron hibrido (reflejo JS para
lecturas) a los 4-6 modulos nombrados en la rebanada de conversacion. Cada
migracion reduce ~85% de tokens, mejora latencia, y elimina alucinaciones. El
patron esta probado. Solo falta aplicarlo.

**Segunda palanca:** Encender los interruptores del conserje (brecha, rutas,
cantera). El codigo esta escrito y testeado. El coste es cero. El beneficio es
descubrimiento proactivo de capacidades.

**Tercera palanca:** Ejecutar los agentes de pipeline existentes (generar-skill,
f6-f7-completo) sobre los modulos que carecen de skill o de UI. Estos agentes
tienen 0 ejecuciones — ejecutarlos una vez llena la cantera y genera paginas.

**El sistema NO necesita mas modulos.** Necesita que los 198 existentes entreguen
su valor al comerciante.
