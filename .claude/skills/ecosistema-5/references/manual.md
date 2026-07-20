# Manual de uso — Ecosistema-5

> De una tarea amorfa a un sistema que se observa a sí mismo.
> Las 5 skills + el GATE para construir agentes de fiar.

---

## Índice

1. [Visión general](#visión-general)
2. [Glosario](#glosario)
3. [Tutorial rápido](#tutorial-rápido)
4. [Caso testigo: prisma-compuestos](#caso-testigo-prisma-compuestos)
5. [Checklist diario](#checklist-diario)
6. [Árbol de decisiones](#árbol-de-decisiones)
7. [FAQ](#faq)

---

## Visión general

El ecosistema-5 resuelve un problema concreto: **los LLM mienten**. No por malicia — porque no tienen por qué no hacerlo. Las 5 skills ponen barreras en cada capa para que la mentira sea imposible o detectable.

| Skill | Problema que resuelve | Lo que garantiza |
|-------|----------------------|------------------|
| **Diseccionador** | "No sé por dónde empezar" | Cada pieza sabe qué es y qué hacer |
| **Prisma-universal** | "Cada comercio necesita su modelo" | 5 huecos fijos para cualquier producto |
| **Perspectiva-c** | "El agente tiene tools y las usa mal" | tools:[], el reflejo hidrata y persiste |
| **Blueprint-agentico** | "El agente dice que guardó pero no guardó" | VALIDAR atrapa la basura antes de persistir |
| **Propioceptor** | "No sé si lo que dice es verdad" | El bus registra; si el evento no está, el LLM no lo afirma |

### Cómo usarlo en el día a día

1. **Carga el meta-skill**: skill_view(name='ecosistema-5')
2. **Sigue los pasos 1->5** en orden
3. **Pasa el GATE** antes de desplegar
4. **Observa en producción** vía propiocepción

---

## Glosario

### Términos del ecosistema

| Término | Qué significa |
|---------|---------------|
| **Reflejo** | Código JS determinista. Una respuesta correcta computable. Nunca usa LLM. |
| **Blueprint** | Pseudocódigo de 5 o 6 fases que el LLM ejecuta como programa. |
| **LLM de página** | El LLM que ejecuta el blueprint. No es un "agente" suelto — está enmarcado por el harness. |
| **Micro-agente** | Pieza fuzzy que solo TRANSFORMA (tools:[]). La forma más fiable de usar un LLM. |
| **Custodio** | El único módulo que escribe un store. Create-only + snapshot. Un solo dueño por dato. |
| **Conversor** | Frontera única de unidades/dimensiones. Cero estado, cero red. |
| **Puente** | Solo escucha eventos y delega. Sin store propio. No pisa decisiones humanas. |
| **Validar (freno)** | Bucle de hasta 3 intentos donde el reflejo valida la obra del LLM contra el contrato JSON Schema. |
| **Contrato** | JSON Schema que instruye al LLM (vía description) y ata al validador (vía type/enum/required/if-then). |
| **Propiocepción** | El sistema se observa a sí mismo. Eventos registrados -> inyectados en el siguiente turno. |
| **Onboarding** | Las preguntas_abiertas que el comerciante debe responder. ES el onboarding, no un formulario aparte. |
| **Arquetipo** | Clasificación de producto por su FORMA (ejes+naturalezas), no por su superficie. |
| **Órgano** | Módulo que se enciende según los arquetipos presentes (agenda, cocina, stock...). |
| **Copia eferente** | Los eventos de dominio quedan registrados por proyecto (escritura). |
| **Nervio** | La rebanada nueva se inyecta en el contexto del turno (lectura). |

### Términos de 2enki (contexto)

| Término | Qué significa |
|---------|---------------|
| **ai-gateway** | Runtime que da MARCO + TOOLS + LOOP gratis. El harness del agente. |
| **bus** | Sistema de eventos (MQTT en 2enki). publish / publishAndWait. |
| **cajón** | Operación que el LLM puede invocar. Cada cajón es un paso del blueprint. |
| **validate-hibridos.js** | Gate que verifica las leyes del ecosistema. |
| **eventos_que_escucho** | Eventos que el blueprint escucha (vs subscribes del manifiesto). |
| **P0: Expresión en Positivo** | Declarar el estado deseado (mandatos), no lo que falta (prohibiciones). |

---

## Tutorial rápido

### De "gestionar compuestos" a piezas con forma en 10 minutos

**Situación**: "Necesito gestionar compuestos (materias primas que se mezclan para hacer productos)."

#### Paso 1: Diseccionar

Identifica los verbos atómicos del flujo:

```
LEER insumos -> RECONCILIAR (match con existentes)
-> MODELAR nuevo compuesto -> GUARDAR en catálogo
-> COSTEAR -> AVISAR al comerciante
```

Aplica las 6 preguntas a cada paso:

| Paso | P1: Pensar o Calcular? | P2: Quién escribe? | P3: 1 o bloque? | P4: Falta? | P5: Conversión? | P6: Conexión? | FORMA |
|------|------------------------|--------------------|-----------------|-------------|----------------|---------------|-------|
| LEER | Calcular | — | 1 | default | — | — | REFLEJO |
| RECONCILIAR | Pensar | — | 1 | sinónimos -> abierto | — | — | MICRO-AGENTE |
| MODELAR | Pensar | — | 1 | preguntas_abiertas | — | — | MICRO-AGENTE |
| GUARDAR | Calcular | CUSTODIO | 1 | — | — | — | CUSTODIO |
| COSTEAR | Calcular | — | 1 | coste -> abierto | UNA frontera unidades | — | REFLEJO |
| AVISAR | Calcular | — | — | — | — | EVENTO | PUENTE |

#### Paso 2: Prisma (si aplica)

Cada compuesto es un producto. Aplica el molde de 5 huecos:

```
IDENTIDAD: "Masa madre: base para pizzas"
RESTRICCIONES: "Vegano: sí" "Alérgenos: gluten"
CONTRATO: "Proporciones: {harina,agua,sal,levadura}"
NO-OBJETIVOS: "No es masa sin gluten"
PREGUNTAS_ABIERTAS: "Coste harina: ???" "Stock masa: ???"
```

#### Paso 3: Construir micro-agentes como perspectiva-c

Para RECONCILIAR y MODELAR, aplica el patrón:

```
Reflejo.hidratar()   -> carga insumos existentes + perfil
Agente.transform()   -> tools:[], produce JSON
Reflejo.persistir()  -> escribe en store + emite evento
```

#### Paso 4: Atar la orquestación

La operación "modelar lote" sigue el espinazo de 6 fases:

```
CONTRATO -> LEER -> PENSAR -> VALIDAR -> GUARDAR -> EMITIR
```

#### Paso 5: Pasar el GATE

```bash
node scripts/validate-hibridos.js
```

#### Paso 6: Observar

```
Propiocepción captura eventos:
  insumo.leido, compuesto.reconciliado,
  compuesto.modelado, coste.calculado

Siguiente turno del LLM -> ve todo lo que pasó
```

---

## Checklist diario

### Antes de codificar

- [ ] ¿La tarea está diseccionada en verbos atómicos? (diseccionador)
- [ ] ¿Cada paso tiene una FORMA asignada?
- [ ] Si es dominio comercio: ¿usé el molde de 5 huecos? (prisma)
- [ ] ¿Los datos privados están marcados como abiertos? (no se inventan)

### Durante la construcción

- [ ] ¿Las piezas fuzzy son perspectiva-c (tools:[], reflejo hidrata/persiste)?
- [ ] ¿Las piezas de orquestación tienen el freno VALIDAR?
- [ ] ¿Cada custodio es el único que escribe su store?
- [ ] ¿Cada conversión pasa por UNA frontera?
- [ ] ¿Cada puente se conecta por EVENTO, no por import directo?

### Antes de desplegar

- [ ] `node scripts/validate-hibridos.js` -> PASS
- [ ] ¿Cada publishAndWait tiene un reflejo que responde?
- [ ] ¿No hay colisión de eventos (subscribes XOR eventos_que_escucho)?
- [ ] ¿Los tests unitarios pasan?
- [ ] ¿La suite entera pasa antes del push?

### En producción

- [ ] ¿La propiocepción está capturando eventos del módulo?
- [ ] ¿El nervio inyecta en los turnos reales?
- [ ] ¿Los turnos sintéticos NO tienen propiocepción?
- [ ] ¿Hay alertas si un evento de persistencia no aparece?

---

## Árbol de decisiones

```
¿Te llega una tarea nueva?
  |
  +- Sí -> DISECCIONADOR (partir en verbos, 6 preguntas -> forma)
  |
  +- ¿Es dominio comercio?
  |    +- Sí -> PRISMA-UNIVERSAL (5 huecos, arquetipo, órganos)
  |    +- No -> saltar (el molde no aplica)
  |
  +- ¿Tiene piezas fuzzy?
  |    +- ¿Solo transformar? -> PERSPECTIVA-C (tools:[], función pura)
  |    +- ¿Orquestar + I/O?  -> BLUEPRINT-AGENTICO (6 fases con VALIDAR)
  |
  +- ¿Vas a desplegar?
  |    +-> GATE (validate-hibridos.js -> PASS)
  |
  +- ¿Ya está en producción?
       +-> PROPIOCEPTOR (se observa a sí mismo)
```

### Ante síntomas concretos

| Síntoma | Diagnóstico | Remedio |
|---------|-------------|---------|
| "El agente sale vacío" | No aterriza la salida | PERSPECTIVA-C: reflejo hidrata + persiste |
| "El agente dice que guardó pero no" | Miente por diseño | BLUEPRINT: añadir VALIDAR + propiocepción |
| "No sé por dónde empezar" | Tarea amorfa sin forma | DISECCIONADOR: partir en verbos |
| "Cada comercio necesita su modelo" | Overflow de modelos | PRISMA: 5 huecos fijos bastan |
| "No sé si lo que pasó en prod es verdad" | Ceguera en runtime | PROPIOCEPTOR: el bus registra |
| "El catálogo se duplica" | Sin reconciliar antes de crear | DISECCIONADOR P2: reconciliar ANTES |
| "El costeo falla por unidades" | Conversiones dispersas | DISECCIONADOR P5: UNA frontera |

---

## FAQ

### ¿Esto funciona fuera de 2enki?

Sí. El patrón es agnóstico al stack. Necesitas un bus de eventos, un runtime de turnos LLM, y persistencia. Adapta validate-hibridos.js a tu stack.

### ¿Y si mi tarea no es comercio?

Usas las otras 4 skills. prisma-modelo-universal es específica de comercio. Las demás son genéricas.

### ¿Blueprint-coherente vs blueprint-agentico?

coherente: 5 fases sin VALIDAR, riesgo bajo, ops simples. agentico: 6 fases con VALIDAR, riesgo mayor, ops que orquestan I/O.

### ¿Puedo saltarme pasos?

Sí, con conocimiento de causa. Nunca te saltes el GATE antes de desplegar.

### ¿Qué pasa si el GATE falla?

Lista las violaciones. Corrige una a una hasta PASS.

### ¿Propiocepción vs logs?

Logs son para humanos. Propiocepción es para el LLM. Usa ambos.

### ¿Esto evita que el LLM invente?

Pone 4 barreras: perspectiva-c (sin tools), blueprint (VALIDAR), propiocepción (eventos), GATE (pre-deploy). Ninguna es infalible. Las 4 juntas, sí.
