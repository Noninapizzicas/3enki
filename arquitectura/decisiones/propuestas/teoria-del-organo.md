# Teoría del Órgano — el patrón universal de cómo crece el cuerpo

> Nace destripando el subsistema `lentes-diseno` (2026-06-29). Lo que empezó como
> "dar a las páginas de diseño una capa de gusto" reveló un patrón que **no es de
> lentes**: es de cómo el sistema entero crece. Este documento plasma la teoría
> tal como la co-desarrollamos. Es PROPUESTA + marco conceptual; lo único ya
> implementado se marca como tal.

---

## Tesis

El sistema deja de tener **tipos distintos de cosa** (módulos, blueprints,
providers, lentes, skills, flows). Hay **un solo tipo —el ÓRGANO— con facultades
en reposo o despiertas.** La diferencia entre un provider, una lente y un módulo
no es de naturaleza: es **qué facultades tiene activas**. Y lo que convierte un
montón de órganos en un **cuerpo vivo** es el **EVENTO**.

```
módulo · dato · conocimiento · capacidad  =  la misma cosa: un ÓRGANO
el EVENTO  =  lo que los hace un CUERPO en vez de un montón de piezas
```

---

## 1. La anatomía del órgano

Todo órgano tiene la misma anatomía. Unos órganos tienen facultades **en reposo**;
ninguna facultad es una excepción — solo está dormida.

```
ÓRGANO = MEMORIA (.md / store)   ← lo que SABE        · en reposo: un libro en el estante
       + MOTOR  (hook / index.js) ← lo que HACE        · dormido hasta que un evento lo dispara
       + QUÍMICO (frecuencia)     ← su RITMO           · secreta EVENTOS a su cadencia (hormona)
       + EVENTO ───────────────── el IMPULSO que lo CONECTA al cuerpo y lo hace LATIR
```

**Reparto por hemisferios** (= el reparto reflejo/LLM que el sistema ya tiene):
```
MEMORIA (.md)  → HEMISFERIO DERECHO   el LLM de página (fuzzy) la INTERPRETA y compone
MOTOR (hook)   → HEMISFERIO IZQUIERDO el reflejo (determinista) la COMPUTA — fetch, cálculo
```
Un órgano de **solo memoria** usa el derecho. Un órgano **con motor** usa los dos.

**Frontera público/privado** — la clave de por qué esto escala:
```
MEMORIA · MOTOR · QUÍMICO  → viven DENTRO del órgano (anatomía privada)
EVENTO                     → lo único que CRUZA la frontera (la sinapsis, el lenguaje del cuerpo)
```
El `.md` no sale del órgano. El hook no sale. **El evento es la única forma que
tiene el órgano de hablar con el resto del cuerpo.** El bus es la médula; la
propiocepción es el cuerpo **sintiendo sus propios impulsos**.

---

## 2. El ADN del órgano (el manifest del pack)

Todo cabe en un genoma que el órgano declara al nacer. El cuenco lo lee al
descubrirlo:

```json
{
  "dominio": "negocio",
  "cuando_usar": "food-cost, márgenes, viabilidad",
  "memoria":  { "dir": "./", "rutas": { "coste": ["food-cost-lens"] } },
  "motor":    { "hook": "./motor.js", "ops": ["precio_mercado"] },
  "quimico":  { "cada": "7d" },
  "evento": {
    "emite":   ["lente.registrar", "negocio.precios.refrescados"],
    "escucha": ["lentes.obtener.request", "mercado.precio.actualizado"]
  }
}
```
`memoria`/`motor`/`quimico` son opcionales (reposo si ausentes). `evento` es lo
único público.

---

## 3. El ciclo de vida (el impulso — aquí LATE)

Cada flecha es un **evento**. Quítalos y es un cadáver; ponlos y respira.

```
NACE        sueltas packs/negocio/  (caes en el cuerpo)
ANUNCIA     emite EVENTO lente.registrar      ──►  el cuenco lo OYE   (auto-descubrimiento = impulso, no escaneo muerto)
EN SERVICIO el cuenco lo añade al catálogo unificado
CONSULTA    EVENTO lentes.obtener.request     ──►  sirve MEMORIA (.md) ──► el LLM (derecho) la interpreta
DISPARA     un EVENTO (turno/petición) flexiona el MOTOR (izquierdo) ──► fetch precio Mercadona
EMITE       el motor publica su resultado como EVENTO ──► el cuerpo se entera
SECRETA     ¿químico? cada 7d late solo: EVENTO negocio.precios.refrescados   (hormona, sin orden de arriba)
APRENDE     el destilador VE los eventos co-ocurrir ──► teje el enlace en el grafo  (el cuerpo se conoce)
```

---

## 4. Las tres cúpulas (cómo el cuerpo organiza sus órganos)

Tres capas distintas, cada una ya sembrada en Enki:

```
1. cúpula invertida   RECOGE     auto-descubre packs, una puerta          ← estructura (cómo llegan)
2. catálogo plano     RUTEA      tarea→lentes (tabla)                     ← selección simple (hoy)
3. cúpula Obsidian    RELACIONA  órganos = nodos; enlaces; huecos; aprende ← inteligencia (el norte, al escalar)
```

- **Cúpula invertida** = un cuenco que no DIRIGE (top-down) sino que RECOGE (bottom-up):
  los órganos se auto-descubren y se anuncian; el cuenco los junta y sirve una sola
  puerta. Ya implementada ×3: `ProviderLoader.discover()`, `prompt-builder._scanModules`,
  `interruptores` (self-announce → cuenco).
- **Catálogo plano** = `tarea→lentes` declarado a mano. Basta con pocos órganos.
- **Cúpula Obsidian** = el GRAFO: los órganos se relacionan, la selección navega por
  vecindad, los huecos afloran como `dangling` (mención-sin-enlazar), y el
  **destilador** teje los enlaces por co-uso. *"Obsidian es la versión disecada; aquí
  late"*: Obsidian tiene nodos y enlaces pero su grafo está QUIETO; Enki tiene la
  misma anatomía **+ el evento viajando** → late. Paga al escalar (50+ nodos); con
  pocos, sobra. Ya sembrado: `graph/` (autorretrato), eventos `dangling`, `destilador`.

**Regla de decisión — un módulo cuenco (A) vs un módulo por dominio (B):**
```
dominio = solo CONOCIMIENTO (md)  → A: UN cuenco, N packs auto-descubiertos  ← el caso dominante
dominio = COMPORTAMIENTO propio   → ese órgano despierta su MOTOR (hook), sigue siendo un pack
```
B (módulo por dominio) mete DATA en el molde de COMPORTAMIENTO → boilerplate +
colisión de puerta (dos módulos no pueden servir el mismo RPC). A pone UN
comportamiento (el cuenco) sobre N carpetas de conocimiento. **Veredicto: A.**

---

## 5. La unificación (qué COLAPSA) — y su frontera

La diferencia entre tipos de cosa es **qué facultades tienen despiertas**:
```
lente de diseño     = MEMORIA sola              (sabe, no se mueve)
provider            = MOTOR + EVENTO            (hace, no recuerda)
módulo pizzepos     = MOTOR + MEMORIA + EVENTO  (hace y recuerda)
discovery/heartbeat = QUÍMICO + EVENTO          (solo late a su ritmo)
```
Añadir cualquier capacidad = **soltar un órgano**. No es una feature: es una teoría
de cómo crece el cuerpo.

**Enki ya es esto a medias:** un `module.json` declara `publishes`/`subscribes`
(= `evento`), tiene `index.js` (= motor), a veces store (= memoria), a veces timer
(= químico). **El módulo ya es un órgano** — solo que sin nombrarlo ni purificar la
forma. El pack es **el módulo reducido a su esencia.**

**La frontera (para que la revolución no se desboque):** no todo es órgano.
```
órgano   = conocimiento + acción + ritmo, hablando por eventos   (la mayoría del cuerpo)
NO órgano = el TRANSPORTE (el bus/MQTT = la médula) y el RENDER (el HTML cliente = la piel)
```
Un cuerpo no es "todo músculo": es órganos + nervios + piel. El patrón es para los
órganos. La revolución es real **porque tiene frontera**.

---

## 6. El gobierno — el control inhibitorio del cuerpo

Si el **evento** es la EXCITACIÓN (lo que dispara), el **gobierno** es la
**INHIBICIÓN** (lo que silencia). Un cuerpo vivo no es solo activación: sin
inhibición todo dispara a la vez = convulsión. El gobierno es la **neurona
inhibitoria** del sistema. Ya implementado: el módulo `interruptores`.

```
EVENTO       excita   (un impulso DISPARA una facultad)
INTERRUPTOR  inhibe   (apaga una vía en caliente)
VIDA = equilibrio de los dos
```

**Granularidad — se gobierna por facultad, no solo por órgano.** El cuerpo puede
dormir un músculo y dejar la memoria despierta:
```
apaga el ÓRGANO entero  → silencio total (= no registrado)
apaga el MOTOR          → el órgano sigue RECORDANDO pero deja de ACTUAR  (sirve .md, no hace fetch)
apaga el QUÍMICO        → deja de SECRETAR  (no refresca precios; lo que sabe, lo sigue sirviendo)
```
Un interruptor puede colgar del órgano o de una de sus facultades.

**En caliente — el toggle es un EVENTO.** `interruptor.cambiado` viaja por el bus →
el dueño se reconfigura **sin reinicio**. Como la adrenalina re-prioriza qué
sistemas están activos AHORA, sin reconstruir el cuerpo.

**Nacer inhibido — prudencia anatómica.** Los órganos de riesgo nacen **OFF** y el
humano los despierta deliberadamente:
```
portal-mcp   OFF por defecto   (la puerta-dios al cuerpo entero)
conserje     OFF por defecto   (empujones)
destilador   ON                (el lazo de aprendizaje corre)
```
El cuerpo no despierta todas sus facultades de golpe: las de riesgo, una a una, con
testigo.

**La memoria del gobierno — lo tocado MANDA y SOBREVIVE.** Lo que el humano apaga
gana sobre el default y persiste (`data/interruptores.json`); al recargar, el
estado persistido se re-emite si difiere del default (sync-al-cargar, v1.1.0). El
cuerpo recuerda qué decidió tener dormido.

**El gobierno es, él mismo, un órgano** (recursivo y elegante): `interruptores`
tiene MEMORIA (`interruptores.json`), EVENTO (`interruptor.registrar`/`.cambiado`),
patrón anuncio/solicitud (`solicitar_registro` cura el orden de carga). El cuerpo
**se gobierna con un órgano más**.

---

## Estado actual (lo ya vivo en `main`)

```
✓ lentes-diseno (módulo)        PRIMER ÓRGANO entero: MEMORIA (8 .md) + EVENTO (lentes.listar/obtener)
                                · selección híbrida (reflejo rutea / LLM elige) · reflejo puro
✓ nervio de lentes (ai-gateway) la ENTREGA event-driven: un turno de diseño EMPUJA la lente
✓ acoples carta-design/carta-digital  consumen la lente (suelo por nervio + refinamiento por pull)
✓ interruptores                 el GOBIERNO (control inhibitorio) — ya existía
```

## Siguiente paso natural (cuando llegue el 2º dominio: copy)

Promover `lentes-diseno → lentes` (el cuenco): `_cargarCatalogo` escanea `packs/*/`
en vez de un dir. Soltar `packs/copy/` = nuevo órgano. El nervio NO cambia
(`lente_default` gana `{dominio}`). No se reescribe nada: se generaliza un loader.
