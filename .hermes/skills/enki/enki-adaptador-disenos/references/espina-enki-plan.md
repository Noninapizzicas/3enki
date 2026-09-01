# Espina `enki-plan` — esquema y ejemplo verificado

> Bloque JSON embebido en `plan-construccion.md` que consume la fase 4
> `construir-modulos`. Ejemplo real del proyecto Radar de Nichos (2026-08-12),
> validado con `JSON.parse` tras extraer el bloque.

## Ubicación en el .md

```
## 13. ESPINA enki-plan (JSON embebido — la consume construir-modulos)

```json enki-plan
{ ... }
```
```

Extracción (node): `md.match(/```json enki-plan\n([\s\S]*?)\n```/)`.

## Campos raíz

| Campo | Descripción |
|---|---|
| `proyecto` | slug del proyecto |
| `proyecto_id` | id real del proyecto |
| `origen` | fuentes (diseno-oop.md FASE 3 + esquema.md FASE 2) |
| `inventario` | nota del inventario consultado (nº módulos reales) |
| `regla` | la decisión de traducción central (event-driven, sin require cruzado) |
| `orden` | array de slugs: TODAS las hojas, dependencias primero (REUTILIZAR antes que sus consumidores; orquestador al final) |
| `hojas` | array de hojas tipadas (abajo) |

## Campos de cada hoja (8 obligatorios)

```json
{
  "slug": "reloj",
  "forma": "micro-agente",          // reflejo | custodio | conversor | puente | micro-agente
  "accion": "CONSTRUIR",            // CONSTRUIR | ADAPTAR | REUTILIZAR
  "reutiliza": ["scheduler", "_shared/modulo-hibrido-reflejo"],
  "depende_de": ["banco", "evaluador", "sonda", "redactor", "cartero"],
  "subscribes": ["reloj.ciclo.iniciar.request"],
  "publishes": ["reloj.ciclo_iniciado", "reloj.ciclo_completado", "reloj.ciclo_semana_vacia", "reloj.ciclo_abortado"],
  "proyecciones_internas": [
    { "nombre": "_priorizar", "descripcion": "M4: más criterios fuertes; desempate disposición a pagar" }
  ]
}
```

- Hoja REUTILIZAR: `accion: "REUTILIZAR"`, `reutiliza: ["<slug real>"]`, `depende_de: []`,
  subscribes/publishes = su contrato REAL (del module.json), `proyecciones_internas: []`,
  opcional `nota` con el rol que juega.
- En híbridos: la op fuzzy (responde el blueprint) NO va en `module.json.subscribes`
  (gate anti-colisión `validate-hibridos`); el cajón se declara como
  `{ "nombre": "cajon_<op>", ... }` en `proyecciones_internas`.

## Validación rápida (node)

```js
const m = md.match(/```json enki-plan\n([\s\S]*?)\n```/);
const espina = JSON.parse(m[1]);
const required = ['slug','forma','accion','reutiliza','depende_de','subscribes','publishes','proyecciones_internas'];
espina.hojas.every(h => required.every(f => f in h));
espina.hojas.every(h => ['reflejo','custodio','conversor','puente','micro-agente'].includes(h.forma));
espina.hojas.every(h => ['CONSTRUIR','ADAPTAR','REUTILIZAR'].includes(h.accion));
espina.orden.every(s => espina.hojas.some(h => h.slug === s));
```

## Ejemplo real (Radar de Nichos — conteo)

- 11 hojas: 7 CONSTRUIR (`banco`, `evaluador`, `sonda`, `redactor`, `cartero`,
  `interfaz`, `reloj`) · 0 ADAPTAR · 4 REUTILIZAR (`crawl4rs`, `interruptores`,
  `scheduler`, `hermes-relay`).
- Eventos del dominio en ASCII: `banco.candidato_anadido`, `sonda.senales_cosechadas`,
  `cartero.envio_resultado`, `interfaz.veredicto_confirmado`, `reloj.ciclo_semana_vacia`.
- Los 8 `subscribes` del banco incluyen eventos de dominio ajenos que mueven su estado
  (`evaluador.veredicto_emitido`, `interfaz.veredicto_confirmado`) — el custodio es el
  único escritor y reacciona a las palabras de los demás.
