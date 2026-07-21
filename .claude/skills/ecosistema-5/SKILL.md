---
name: ecosistema-5
description: "META-SKILL que orquesta las 5 skills del ecosistema — diseccionador, prisma-modelo-universal, agente-perspectiva-c, blueprint-agentico, propioceptor. Incluye el flujo completo (disenar -> construir -> validar -> observar), un validador GATE (validate-hibridos.js) que enforcea las leyes, y un manual de uso para el usuario. Una pieza para gobernarlas a todas."
when-to-use: "Siempre que arranques una tarea nueva . Cargala al inicio de una sesion de trabajo y tendras las 5 skills disponibles + el gate + el manual. NO para tareas ajenas al ecosistema (ahi carga skills individuales)."
---
# Ecosistema-5 — Meta-Skill

> Una pieza para gobernarlas a todas. Carga las 5 skills, el flujo completo,
> el validador GATE y el manual de uso.

```
╔══════════════════════════════════════════════════════════════╗
║                   ECOSISTEMA-5                              ║
║  Meta-skill que orquesta:                                   ║
║                                                              ║
║  1. DISECCIONADOR       -> para PARTIR la tarea amorfa       ║
║  2. PRISMA-UNIVERSAL     -> para MODELAR productos            ║
║  3. AGENTE-PERSPECTIVA-C -> para TRANSFORMAR (tools:[])      ║
║  4. BLUEPRINT-AGENTICO   -> para ORQUESTAR (con VALIDAR)     ║
║  5. PROPIOCEPTOR         -> para OBSERVARSE en produccion    ║
║                                                              ║
║  + GATE: scripts/validate-hibridos.js                        ║
║  + MANUAL: references/manual.md                              ║
╚══════════════════════════════════════════════════════════════╝
```

## Frente a una tarea nueva: el flujo

Cuando alguien trae una tarea amorfa ("gestionar X", "modelar Y", "llevar Z"),
este es el orden:

### Paso 0 — Cargar las 5

```bash
skill_view(name='diseccionador')
skill_view(name='prisma-modelo-universal')
skill_view(name='agente-perspectiva-c')
skill_view(name='blueprint-agentico')
skill_view(name='propioceptor')
```

### Paso 1 — DISECCIONAR

```
Tarea amorfa
  |
  v
diseccionador.partir(tarea) -> verbos atomicos (espinazo)
  |
  v
6 preguntas a cada paso -> cada paso tiene FORMA:
  - REFLEJO puro
  - MICRO-AGENTE fuzzy
  - CUSTODIO
  - CONVERSOR
  - PUENTE
```

**Entregable**: lista de piezas con su forma asignada.

### Paso 2 — PRISMA (si aplica dominio comercio)

```
Producto crudo (foto/texto/fila)
  |
  v
prisma-modelo-universal.descomponer() -> molde de 5 huecos
  IDENTIDAD | RESTRICCIONES | CONTRATO | NO-OBJETIVOS | PREGUNTAS_ABIERTAS
  |
  v
Clasificar arquetipo por FORMA (ejes + naturalezas), no por superficie
  |
  v
Flujo: adaptador -> producto-manager -> boss -> enforcement -> organos
```

**Entregable**: producto modelado + organos encendidos.

### Paso 3 — CONSTRUIR cada pieza fuzzy como PERSPECTIVA-C

```
Para cada pieza de tipo MICRO-AGENTE:

  agente-perspectiva-auditar(si existe)
  agente-perspectiva-convertir(o crear)
    -> reflejo HIDRATA antes
    -> agente TRANSFORMA (tools:[], funcion pura)
    -> reflejo PERSISTE despues
    -> reflejo EMITE evento
```

**Entregable**: agente que NO puede mentir porque no tiene herramientas.

### Paso 4 — ATAR la orquestacion con BLUEPRINT-AGENTICO

```
Para operaciones que orquestan varios pasos con I/O:

  blueprint-agentico.atar(operacion)
    -> espinazo de 6 fases
    -> loop VALIDAR (max 3 intentos, reprompt con error exacto)
    -> CONTRATO | LEER | PENSAR | VALIDAR | GUARDAR | EMITIR
```

**Entregable**: operacion que NO puede persistir basura (el freno la atrapa).

### Paso 5 — PASAR el GATE

```bash
node scripts/validate-hibridos.js
# -> PASS o lista de violaciones
```

### Paso 6 — OBSERVAR con PROPIOCEPTOR

```
PropiocepcionModule escucha el bus
  -> registra eventos por project_id
  -> Nervio inyecta en el siguiente turno
  -> "o el hecho esta en la propiocepcion, o el LLM no lo afirma"
```

**Entregable**: sistema que se observa a si mismo en produccion.

## El GATE — validate-hibridos.js

El gate vive en `scripts/validate-hibridos.js` (ver linked files).
Verifica automaticamente que toda pieza cumple las leyes del ecosistema:

### Leyes que enforcea

```
1. REPARTO
   - Todo modulo suscrito a <mod>.<op>.request tiene un handler on<Op>Request
   - Ningun modulo blueprint tiene tools que no sean bus.* o cajon.*

2. ANTI-COLISION
   - <mod>.<op>.request ∈ manifest.subscribes XOR ∈ blueprint.eventos_que_escucho
   - Un cajon que delega NO escucha el mismo evento que su reflejo

3. PERSISTENCIA DELEGADA
   - Ningun modulo con blueprint_driven=true escribe a fs directamente
   - Solo los CUSTODIOS (identificados por su forma) tienen fs.write

4. CONTRATO
   - Toda operacion con VALIDAR tiene un schema JSON real
   - Todo schema tiene description en cada campo (instruye al LLM)

5. AGENTE-PERSPECTIVA-C
   - Todo agente marcado como perspectiva-c tiene tools:[] en su meta
   - Todo agente perspectiva-c tiene un reflejo que hidrata y persiste

6. EMISION
   - Toda operacion que GUARDA tambien EMITE un evento de dominio
   - No hay persistencia silenciosa sin evento
```

### Como usarlo

```bash
# Verificar todo
node scripts/validate-hibridos.js

# Verificar un modulo concreto
node scripts/validate-hibridos.js --module prisma/compuestos

# Modo reparar (cuando algo se puede corregir automaticamente)
node scripts/validate-hibridos.js --fix

# Modo CI (exit code 1 si falla)
node scripts/validate-hibridos.js --ci
```

### Output esperado

```
PASS: ecosistema-5 — todas las leyes cumplidas

o

FAIL: 3 violaciones encontradas
  [ANTI-COLISION] prisma/compuestos: <op>.request en subscribes Y eventos_que_escucho
  [PERSISTENCIA]  agente-marketing: escribe a fs sin ser custodio
  [CONTRATO]      costear: schema sin description en campo 'margen'
```

## El manual del usuario

El manual completo de uso vive en `references/manual.md` (ver linked files).
Incluye:

- Visión general del ecosistema (que problema resuelve cada skill)
- Glosario de terminos (reflejo, blueprint, custodio, propiocepcion...)
- Tutorial rapido: "de una tarea amorfa a piezas con forma en 10 minutos"
- Caso testigo: prisma-compuestos paso a paso
- Checklist diario para el usuario
- Preguntas frecuentes
- Arbol de decisiones: "que skill uso ahora?"

## Referencia rapida

| Situacion | Que hacer |
|-----------|-----------|
| Llega tarea amorfa | Cargar ecosistema-5 -> Paso 1: DISECCIONAR |
| "Modelar producto de comercio" | Paso 2: PRISMA-UNIVERSAL |
| "El agente sale vacio/no aterriza" | Paso 3: PERSPECTIVA-C |
| "Orquestar 3 pasos con I/O" | Paso 4: BLUEPRINT-AGENTICO |
| "Como se que funciona en prod?" | Paso 5: PROPIOCEPTOR |
| "Antes de desplegar" | node scripts/validate-hibridos.js |
