# planificador — el planificador goal-driven de proyecto

> Declaras un proyecto ("quiero construir una tienda con reservas y pago") y el
> planificador lo DESCOMPONE en capacidades, encuentra la skill de cada una en la
> cantera (cosecha), y te propone (o ensambla) el SET — con un freno de completitud
> que garantiza COBERTURA (no skills sueltas) y nombra los huecos honestamente.
> Módulo: `modules/planificador/` (reflejo + blueprint). Nace 2026-07-01.

## Tesis y gemelo

El conserje-cantera ofrece **1 skill por lo que TOCASTE** (reactivo). planificador
ensambla **el SET por lo que QUIERES** (proactivo). Misma familia — cruzar
*deseo × catálogo* — otro disparador. Cierra el hueco del conserje reactivo: arrancar
"un proyecto nuevo desde cero".

Cero infra nueva: reutiliza `cosecha.buscar` (catálogo), `cosecha.listar` (nombres
válidos) y `cosecha.promover` (activar). El único músculo nuevo es el **crítico de
completitud**.

## Espinazo (blueprint-agentico, 6 fases)

```
CONTRATO  proyecto: String (guard: no vacío) · modo: proponer|ensamblar
PENSAR·1  descomponer(proyecto) → capacidades           (LLM: deseo informe → oficios nombrables)
LEER      por capacidad: cosecha.buscar(cap) → candidatos (REFLEJO, catálogo barato)
PENSAR·2  elegir(cap, candidatos) → skill | HUECO         (LLM: la mejor por fit, o null)
PENSAR·3  criticar(proyecto, plan) → capacidades que faltan  (LLM: ¿qué NECESARIO no nombré?)
          loop-until-dry (máx 2 rondas)
VALIDAR   planificador.validar → freno computable          (REFLEJO)
GUARDAR   modo ensamblar: planificador.ensamblar → promover ×N (REFLEJO) · proponer: nada
EMITIR    planificador.plan.listo { proyecto, cobertura, huecos, promovidas }
```

## El corazón — freno HÍBRIDO de completitud

"Cubrir un proyecto" es mitad computable, mitad irreducible. Cada mitad, su guardián:

```
REFLEJO (planificador.validar) — la LEY computable:
  no_silent_drops : cada capacidad tiene entrada (skill o hueco); ninguna se cae callada
  no_alucinadas   : cada skill elegida EXISTE en el catálogo (contra cosecha.listar)
  cobertura       : |capacidades con skill válido| / |capacidades|
  → mata "dije que lo cubría y el nombre no existe"

LLM (criticar, en el PENSAR) — lo IRREDUCIBLE:
  "dado el PROYECTO y este plan, ¿qué capacidad NECESARIA no está nombrada?"
  → mata "encontré skills para lo que nombré, pero olvidé nombrar algo"
```

El reflejo NO puede juzgar si la descomposición fue completa (fuzzy); el LLM NO es de
fiar para "esta skill existe" (determinista). **Invariante P0**: el plan nace FÉRTIL —
nombra los huecos, no los esconde. Un hueco es el siguiente paso (qué cosechar), jamás
una mentira de cobertura.

## Reparto

```
LLM (blueprint)   descomponer · elegir · criticar
REFLEJO (index)   _validar (freno computable) · _ensamblar (promover el set)
delega a cosecha  buscar (LEER) · listar (validar) · promover (ensamblar)
```

## Decisiones cerradas

- **Gradualidad:** `proponer` por defecto (muestra el set + huecos, el humano confirma) →
  `ensamblar` (promueve) cuando se confíe. Como el Portal read→write.
- **Escala:** con ~4 skills hoy es un juguete; el mecanismo se construye ahora y paga a
  medida que la cantera crece (destilador + imports). Infra anticipada.
- **Los huecos son demanda:** cada capacidad sin skill = señal de qué cosechar después.
  planificador no solo consume el catálogo — lo hace crecer con propósito, cerrando el
  lazo con el destilador/import.
- **Semántica:** la descomposición LLM tapa el "cero embeddings" del catálogo; el upgrade
  HNSW queda para cuando el catálogo lo pida, no bloquea el arranque.

## Topics / eventos

```
planificador.planificar (cajón del blueprint, page=planificador)
cosecha.buscar.request → .response          (LEER)
planificador.validar.request → .response     (FRENO computable — reflejo)
planificador.ensamblar.request → .response   (GUARDAR — promover ×N — reflejo)
planificador.plan.listo                      (EMITIR — huecos = demanda para cosechar)
```

## Estado

```
✓ reflejo (index.js 0.1.0): _validar + _ensamblar · test planificador__index 8/8
✓ blueprint (planificador.blueprint.json 0.1.0): op planificar (descomponer/elegir/criticar)
✓ manifest híbrido (blueprint_driven + index.js) · gate híbridos OK (sin colisión)
◑ EN VIVO: el PENSAR fuzzy (descomponer/elegir/criticar) se verifica corriendo el Enki
[ ] modo ensamblar auto · página/UI de invocación · consumir huecos → señal al destilador
```
