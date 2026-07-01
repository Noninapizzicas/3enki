# Prisma — el modelo universal de producto (la vertical inteligente)

> Nace co-desarrollado con el humano el 2026-07-01. Objetivo declarado por él:
> *"un sistema BOSS con tal abstracción que valga para todo tipo de comercio, y que
> con la IA y la tecnología que tenemos sea capaz de trabajar con todo tipo de
> productos adaptándose de forma inteligente a cada uno."*
>
> El método no fue teorizar: fue **trabajar ejemplos** hasta que el modelo emergió.
> Cita del humano que gobierna este doc: *"tenemos que trabajar con ejemplos, yo
> tengo la idea, no la verdad."* Lo de abajo es la verdad que salió de seis casos,
> no una taxonomía inventada. Es PROPUESTA; nada está implementado aún.
>
> Semilla externa: el skill `product-capability` (affaan-m/ECC) — su principio
> *"do not invent product truth; mark unresolved questions explicitly"* es el
> corazón del molde, y encaja con la FIDELIDAD que el sistema ya vive.

---

## Tesis

Un producto no se modela enumerando sus atributos concretos (eso ata el sistema a
*pizza* o a *bombilla*). Se modela con **un molde universal de cinco huecos fijos**
que valen para cualquier producto, más **unos ejes que se encienden según el
producto**. Lo objetivo del producto lo **descompone la IA**; lo privado del
comerciante (coste, stock, tarifa, agenda) **no se inventa — se marca ABIERTO**, y
esos huecos abiertos *son* el onboarding del comerciante.

```
PRODUCTO UNIVERSAL  =  5 huecos fijos (siempre)
                    +  ejes con sub-formas (se encienden por producto)
                    +  lo objetivo lo rellena la IA · lo privado se marca ABIERTO
```

El nombre **Prisma**: entra luz blanca (un producto crudo, indistinto) y sale su
**espectro** (sus facetas descompuestas). El mismo prisma vale para cualquier luz —
no cambias de aparato según el producto, cambias lo que entra. Ahí está la vertical
inteligente que se adapta a todo comercio.

---

## 1. El molde — cinco huecos fijos

Salidos del skill `product-capability`, traducidos de "capability de software" a
"producto de comercio". **Nunca fallaron** en los seis casos.

```
1 · IDENTIDAD          qué es · qué trabajo del cliente resuelve
2 · RESTRICCIONES      reglas duras: si se rompen, el producto está MAL (no solo con fricción)
3 · CONTRATO           atributos (de saber) + opciones (de tocar) + estados (ciclo de vida)
4 · NO-OBJETIVOS       qué NO es este producto (evita prometer lo que no da)
5 · PREGUNTAS ABIERTAS lo privado/no-computable → el comerciante lo cierra
                       + veredicto de madurez (listo | necesita aclaración | necesita revisión)
```

### Las OPCIONES tienen cuatro sub-formas

Trabajando la pizza creímos que "opción" era una sola cosa (poner/quitar). La TV y
la tarta la partieron en cuatro:

```
variante             elegir entre modelos fijos          (TV: 55" vs 65"; ropa: talla)
modificación         tocar el producto                    (pizza: añadir bacon, quitar cebolla)
añadido              servicios/accesorios que lo RODEAN   (TV: instalación, garantía; alquiler: seguro, operador)
personalización_libre entrada libre del cliente            (tarta: mensaje "Feliz cumple María")
```

**Qué sub-forma domina es una huella del arquetipo.** La pizza se apoya en
*modificaciones*; la TV en *variantes + añadidos*; la tarta añade
*personalización libre*.

### Los EJES que se encienden (no siempre están)

```
TIEMPO               ninguno · instante_de_entrega (tarta) · cita (peluquería) · intervalo_que_cobra (alquiler)
ESTADO_DE_PARTIDA    no · sí — el producto parte de TI (peluquería: color sobre tu pelo previo)
CICLO                de_ida (se consume/vende) · con_retorno (alquiler: fianza, daños, la unidad vuelve)
```

### Las NATURALEZAS que varían (se rellenan según el producto)

```
STOCK    ingredientes (pizza) · unidades (TV) · capacidad_temporal (peluquería) · activo_reutilizable (alquiler)
PRECIO   por_unidad · por_peso (pan) · por_tiempo (alquiler) · rango_valoracion (color: no se sabe hasta verte)
VERDAD_OBLIGATORIA   alérgenos · etiqueta energética · seguridad/seguro   (casi siempre presente — 4/5 casos)
```

> Hallazgo transversal: **la "verdad obligatoria" es universal.** Alérgenos (comida),
> etiqueta energética y garantía (electrónica), prueba de alergia al tinte (servicio):
> misma clase de dato —verdad legal no negociable— en productos que no comparten nada.
> No se alinea ni se optimiza: se dice fiel, y punto. Es una clase aparte de las opciones.

---

## 2. El contrato (schema)

```json
{
  "esquema": "producto-universal-v1 · Prisma",
  "principio": "lo objetivo lo descompone la IA; lo privado se marca ABIERTO (no se inventa)",

  "identidad":     { "que_es": "...", "trabajo_que_resuelve": "..." },

  "restricciones": [{ "tipo": "compatibilidad|factibilidad|verdad_obligatoria|periodo|retorno",
                      "regla": "...", "no_negociable": true }],

  "contrato": {
    "atributos_saber": [{ "nombre": "...", "valor|derivado": "...", "eje?": "precio|alergenos" }],
    "opciones": [{ "id": "...", "etiqueta": "...",
                   "sub_forma": "variante | modificacion | añadido | personalizacion_libre",
                   "modo": "ELEGIR_UNO | ELEGIR_VARIOS | QUITAR | LIBRE",
                   "valores": [{ "id": "...", "etiqueta": "...", "delta_precio": 0, "disponible": true }] }],
    "estados": ["ciclo de vida del producto"]
  },

  "ejes_encendidos": {
    "tiempo":                    "ninguno | instante | cita | intervalo_que_cobra",
    "estado_de_partida_cliente": "false | descripcion (el producto parte de ti)",
    "ciclo":                     "de_ida | con_retorno"
  },

  "naturalezas": {
    "stock":  "ingredientes | unidades | capacidad_temporal | activo_reutilizable",
    "precio": "por_unidad | por_peso | por_tiempo | rango_valoracion"
  },

  "no_objetivos":       ["qué NO es este producto"],
  "preguntas_abiertas": [{ "campo": "coste|stock|tarifa|agenda", "para": "comerciante", "porque": "privado|no_computable" }],
  "madurez":            "listo | necesita_aclaracion_comerciante | necesita_revision"
}
```

El `contrato.opciones` es compatible con el motor de opciones ya existente
(`modules/_shared/motor-opciones.js` + Avanzadilla "Opciones" en CLAUDE.md):
`modo` ∈ {ELEGIR_UNO, ELEGIR_VARIOS, QUITAR} ya está; Prisma añade `LIBRE`
(personalización) y la etiqueta `sub_forma`. El `disponible` por valor sigue siendo
la poda del comerciante sobre el espacio de elección del cliente.

---

## 3. Cómo lo rellena la IA — la pasada Prisma

Función PURA, patrón `agente-perspectiva-c` (tools:[]): el reflejo hidrata y
persiste; el agente solo transforma. No toca fs. No inventa.

```
PrismaAdaptador(crudo)  →  ProductoUniversal
  ENTRADA: crudo (foto | texto | fila de catálogo | lo que el comerciante YA tiene)

  1. IDENTIDAD     → qué es, qué trabajo resuelve
  2. CLASIFICA     → arquetipo por la FORMA (ejes + naturalezas), NO por la superficie
                     · encaja en arquetipo conocido → lo usa
                     · no encaja                     → PROPONE arquetipo nuevo (aprobación humana, una vez)
  3. DESCOMPONE    → restricciones + atributos + opciones (con su sub-forma) + no-objetivos
  4. MARCA ABIERTO → lo privado/no-computable (coste, stock, tarifa, agenda) → preguntas al comerciante
  5. VEREDICTO     → madurez

  SALIDA: ProductoUniversal (huecos rellenos + abiertos marcados)
```

> **Clave del clasificador (paso 2):** el arquetipo se decide por la FORMA de la
> descomposición, no por la superficie del producto. Un corte de pelo y un masaje
> caen en el mismo arquetipo *servicio* porque sus ejes coinciden (tiempo=cita,
> estado_de_partida=sí, stock=capacidad_temporal), no porque "se parezcan". Eso hace
> el clasificador robusto y de verdad universal.

---

## 4. Dónde encaja (nada nuevo que el sistema no tenga)

- **Es un `blueprint-agentico`.** Contrato + freno (VALIDAR contra
  `producto-universal.schema`) + FIDELIDAD "no inventar" ya es su espina de 6 fases.
  El "marca abierto" es el mandato de siempre; las preguntas abiertas son el freno
  honesto cuando la IA no puede saber.
- **Arquetipo = un pack del cuenco de lentes** (Teoría del Órgano). Abierto,
  auto-descubierto. Proponer arquetipo nuevo = cosechar un pack; aprobarlo = el
  anti-wipe del destilador. La regla que manda (rumbo-plataforma): un arquetipo solo
  entra cuando hay una PÁGINA que lo beba.
- **Preguntas abiertas = onboarding del comerciante.** El reflejo
  (escandallo/Mercadona/tarifas) resuelve el coste; el comerciante confirma stock,
  tarifa y agenda. Ahí se cierra el pilar comerciante, sin fricción de método.
- **carta-manager custodia** el ProductoUniversal, como hoy custodia la carta.
- **El BOSS orquesta.** Un comercio *es* el conjunto de arquetipos de sus productos
  (la panadería lo demostró: pan + bollería + tarta por encargo = tres formas
  conviviendo). El Boss enciende los órganos —packs, páginas, blueprints— de esos
  arquetipos. Es el `vertical 2` de rumbo-plataforma hecho config, no reescritura.

---

## 5. La evidencia — los seis casos y qué probó cada uno

| Caso | Clase | Qué aportó al modelo |
|---|---|---|
| **Pizza** | comestible, made-to-order | atributos de *saber* vs *tocar*; encadenamiento (tocar recalcula precio y alérgenos); alérgenos = verdad obligatoria; "quitar" = fricción casi-cero |
| **Bombilla LED (ojo de buey)** | pieza/objeto técnico | preguntas ordenadas por poder discriminante (filtro duro → preferencia); compatibilidad (casquillo) como restricción dura |
| **Televisor** | bien manufacturado | partió "opciones" en sub-formas (variante · modificación · añadido); "quitar" casi no existe; etiqueta energética confirma verdad obligatoria fuera de comida |
| **Panadería** | comercio multi-producto | un comercio = conjunto de arquetipos; venta por peso (nueva forma de precio) |
| **Tarta por encargo** | comestible + agenda | eje TIEMPO (instante de entrega); personalización libre (4ª sub-forma de opción) |
| **Peluquería** | servicio puro | eje TIEMPO=cita; stock=capacidad temporal; ESTADO DE PARTIDA del cliente; precio como rango-valoración |
| **Alquiler de maquinaria** | uso temporal | eje TIEMPO=intervalo-que-cobra; CICLO con_retorno (fianza, daños, unidad reutilizable) |

**Saldo:** los 5 huecos nunca fallaron; lo que varía son los ejes, sus sub-formas y
las naturalezas, que se encienden por producto. El molde es sólido; la riqueza está
en los ejes.

---

## 6. Vía descartada (registro honesto)

Antes de Prisma probamos **"dos pilares en fricción"**: descomponer el producto
enfrentando lo que el cliente *busca y obtiene* con lo que el comerciante *ofrece*,
y medir la alineación (menos fricción = mejor producto). Buena intuición —de hecho
sobrevive dentro de Prisma: la fricción tipo *disponibilidad* es el `disponible` por
valor, y la tensión cliente↔comerciante es el par (opciones que pide el cliente ↔
preguntas abiertas que cierra el comerciante). Pero como **método de arranque**
ensuciaba, porque lo privado (coste, stock) no tenía dónde vivir y empujaba a la IA a
inventar. El molde de cinco huecos lo resolvió dándole a lo desconocido un hueco
explícito (Preguntas Abiertas). Se conserva la idea, se descarta como método de
entrada.

---

## 7. Preguntas abiertas de esta propuesta (marca lo no resuelto)

Aplicando el propio principio de Prisma al doc:

- **Semilla de arquetipos.** ¿Arrancamos con 3-4 arquetipos escritos a mano
  (comestible · pieza/objeto · servicio · uso-temporal) o dejamos que la IA los
  proponga desde cero contra una cesta revuelta? (Recomendación de arranque: semilla
  a mano + IA que ajusta, es lo más aterrizable y encaja con los packs.)
- **Ingesta.** ¿Primera entrada del comerciante = foto/Instagram/Excel (reusar el
  pipeline OCR+IA de `facturas`) o formulario guiado?
- **Aprobación de arquetipo nuevo.** Mecánica exacta del anti-wipe (¿quién aprueba,
  dónde se persiste el arquetipo, cómo se versiona).
- **Precio rango-valoración.** Cómo modela el sistema un precio que no es un número
  hasta la valoración presencial (servicios). ¿Estado "pendiente_valoracion"?
- **Primer vertical.** ¿Sobre qué comercio real se estrena Prisma sin tocar el POS
  vivo (pizzepos está cerrado por gate)?

## 8. Estado de implementación (v0.1 — 2026-07-01)

Construida entera la columna determinista en `modules/prisma/` (copiar+generalizar de
pizzepos, cero pizzepos tocado), **85/85 tests**:

- **producto-manager** (custodio del ProductoUniversal + freno) · **proyector** (vista interna) ·
  **escaparate** (vista pública, poda lo no ofrecido) · **opciones** (precia la selección) ·
  **coste** (coste→margen→pvp) · **arquetipos** (registro abierto + anti-wipe) ·
  **adaptador** (híbrido: reflejo determinista + blueprint LLM) · **boss** (orquestador comercio→órganos) ·
  **enforcement** (efector: consume `boss.plan.actualizado` → `interruptor.set` enciende los órganos;
  additivo-seguro, no apaga solo).
- **POS universal** (de pizzepos, sin cocina): **carrito → cuenta → cobro → ticket → cierre** (céntimos),
  con **persistencia por proyecto** (snapshot fs `/prisma/pos/*.json`, restaura en `project.activated`).
- `_shared/arquetipos-semilla` (clasificador por la forma) · `_shared/motor-opciones` (banco, envuelto) ·
  `_shared/organos-recetario` (órgano→interruptor + diff puro del plan) ·
  `_shared/pos-persistencia` (snapshot/hidratar por proyecto, debounced; composición sobre herencia).
- project-type `blueprints/project-types/prisma.json` → un comercio universal es **instanciable**.

El lazo CEREBRO→acción queda cerrado: BOSS calcula qué órganos necesita el comercio (por sus
productos), enforcement los enciende por el panel central de interruptores. La voluntad de APAGAR se
deja al humano (los sobrantes reciben testigo, no apagado — como la apoptosis de la homeostasis).

Preguntas del §7, resueltas: semilla = 4 a mano (comestible·pieza·servicio·uso_temporal) + IA propone;
aprobación de arquetipo = anti-wipe en `prisma/arquetipos` (proponer→aprobar, semilla intocable); primer
vertical = project-type `prisma` (no toca pizzepos). Siguen abiertas: ingesta (foto/Excel) y precio
rango-valoración (hoy → `consultar` en escaparate + pregunta_abierta `tarifa`).

Falta (todo requiere el Enki vivo o wiring de bus): verificar en vivo el blueprint del adaptador y el
bundle HTML/PWA del escaparate; cablear el reflejo del adaptador a los arquetipos custom por RPC;
persistir el pvp de coste en el producto (cerrar la pregunta_abierta de coste); dar DUEÑO a los órganos
previstos (agenda/retorno/fianza/stock = módulos follow-up que reaccionen a su `interruptor.cambiado`).

## Veredicto de madurez

**Columna determinista + POS + enforcement COMPLETOS y probados (85/85). El lazo CEREBRO→acción cierra
(BOSS→enforcement→interruptores). Lista para verificación en vivo + wiring de integración. El vertical es
instanciable (project-type `prisma`).**
