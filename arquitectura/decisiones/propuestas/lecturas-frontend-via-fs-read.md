# Lecturas frontend via fs.read directo

> **Patrón canónico** para que el frontend lea (y a veces escriba) el storage
> de módulos blueprint-driven sin código backend dedicado. Apareció
> orgánicamente al resolver el caso recetas en la rama
> `claude/review-tools-architecture-Xm3bZ` (mayo 2026). **Supersede el
> enfoque "plugin/bridge layer"** que se proponía en
> `capa-unica-tools-via-plugins.md`.

Fecha: 2026-05-20.

---

## 1 · El patrón en una frase

> **El frontend invoca `mqttRequest('fs', 'read', { path: '/<dominio>.json' })`
> directamente. La transformación (filtrar, ordenar, derivar) vive en el
> store TypeScript del frontend. Cero módulos backend dedicados al dominio.**

---

## 2 · Por qué existe

Cuando un módulo se migra a blueprint-driven (LLM como runtime), el JS
legacy desaparece. Con él desaparecen los handlers que servían al frontend
via `mqttRequest('<dominio>', '<accion>')` — la página se rompe porque
ningún handler responde a esos topics.

Hubo dos caminos posibles para arreglarlo:

- **Path A — bridge sibling** (descartado): crear un módulo `<dominio>-api`
  con `tools[]` JS que leen el archivo y devuelven slices ordenados. Resulta
  en dos directorios por dominio y duplica la lógica de transformación (una
  vez en el bridge, otra en el frontend store que la consume y la re-shapea
  para la UI).
- **Path B — fs.read directo** (este patrón): el frontend usa la primitiva
  `fs.read` que ya expone el módulo `filesystem` como tool canónico. El
  loader (`core/modules/loader.js`, tras `tools.contract` v1.2) auto-registra
  esa tool en el `uiHandler`, así que el frontend la invoca sin más
  ceremonia. La transformación vive donde se consume (frontend).

---

## 3 · Mecanismo (cómo funciona técnicamente)

```
Frontend (store TS)
  await mqttRequest('fs', 'read', { path: '/recetas.json' })
       │
       ▼  MQTT publish: ui/request/fs/read
  UIRequestHandler (core/ui/UIRequestHandler.js)
       │  busca handler 'fs.read' en su Map
       ▼  ← registrado automáticamente por core/modules/loader.js::
            registerToolsForAI desde modules/filesystem/module.json.tools[]
            con domain='fs', action='read' (tools.contract v1.2)
  filesystem.handleRead({ path: '/recetas.json' })
       │  resuelve path contra activeProjectPath del proyecto activo
       ▼
  fs.readFileSync(...) → { status:200, data:{ content: "<json>" } }
       │
       ▼  MQTT publish: ui/response/<request_id>
  Frontend recibe, parsea, transforma localmente
```

El componente del Panel (`RecetasPanel.svelte`) ni se entera: el store
le pasa la misma forma de objetos que antes — solo cambió la implementación.

---

## 4 · Cuándo aplica

Tres condiciones que deben cumplirse:

1. **El dato vive en un archivo JSON del storage del proyecto.** Si la
   información se calcula on-demand y no se persiste (caso escandallo en
   su estado actual), este patrón no aplica — primero hay que decidir
   persistir el cálculo en el storage.
2. **Las transformaciones son simples**: filter, sort, slice, derivar
   contadores triviales, agregaciones lineales. Si la lógica requiere
   reglas de dominio complejas, mejor que viva en un módulo backend o
   en el blueprint del LLM.
3. **No hay autorización adicional sobre el proyecto.** `filesystem`
   ya scopea por `activeProjectPath` — si un dominio requiriese
   permisos más finos (ej. "solo lectores X pueden ver recetas archivadas"),
   esa lógica necesita un handler dedicado.

---

## 5 · Anti-patrones (lo que NO se hace)

- ❌ Crear un módulo `<dominio>-api` con `tools[]` que duplica
  read+filter+sort cuando esa lógica solo la consume el frontend.
- ❌ Escribir desde el frontend a archivos cuando el blueprint del dominio
  tiene **listeners reales** del evento canónico de mutación
  (`<dominio>.<accion>.actualizado`). En ese caso la escritura debe
  pasar por el blueprint o por un handler dedicado que emita el evento.
  Para detectar: `grep -rn "<dominio>.<evento>" modules/` — si solo el
  propio blueprint declara publicar el evento y nadie lo escucha, escribir
  directo es seguro (ver §5b).
- ❌ Duplicar la lógica de transformación en bridge + store. La
  transformación vive UNA vez, en el consumer.
- ❌ Confiar en el payload de los eventos `<dominio>.creada/actualizada/
  eliminada` para mantener el estado UI. **El archivo es la fuente de
  verdad** — los eventos solo disparan un `loadX()` que relee del archivo.

### 5b · Cuándo SÍ se puede escribir directo (extensión del patrón)

Algunos dominios tienen operaciones de mutación triviales con shape de
"merge superficial sobre object plano" (ej. `carta-marketing.update_perfil`).
El blueprint hace:

```
read /storage/config/marca.json (fallback a default)
merge input.campos sobre el object
write atomic
publish marketing.perfil.actualizado
```

Las primeras 3 operaciones las puede hacer el frontend trivialmente con
`fs.read` + `fs.write`. La cuarta (publish) tiene valor SOLO si alguien
escucha. Si nadie escucha, escribir directo es funcionalmente equivalente.

**Condiciones acumulativas para escritura directa:**

1. La operación es **merge trivial** (un nivel de profundidad, sin
   validaciones cruzadas, sin invariantes computados, sin side effects
   en otros archivos).
2. El evento canónico (`<dominio>.<x>.actualizado`) **no tiene listeners
   activos** en el repo (verificable con grep cross-modulo).
3. La operación **no dispara workflows downstream** (ej: si tras
   `update_perfil` un scheduler reanaliza la marca, escribir directo
   salta ese workflow — NO aplica).

**Si las 3 se cumplen**, el frontend escribe con
`mqttRequest('fs','write',{path,content})` y actualiza su estado local.
**Si alguna falla**, la escritura va por el blueprint via chat (ej.
"actualiza el tono de la marca a familiar") o se mantiene un handler
backend dedicado.

**Re-evaluación obligatoria** cuando se añade un listener al evento
canónico: hay que migrar la escritura del frontend a invocación
backend (o aceptar la limitación documentándola).

---

## 6 · Estructura canónica del store del frontend

```ts
// 1. Tipos que reflejan el shape del archivo (no inventes campos)
interface RecetasStore {
  _version?: string;
  recetas?: Receta[];
  ingredientes_catalogo?: CatalogoIngrediente[];
}

// 2. Primitiva privada: lee y parsea
async function readRecetasStore(): Promise<RecetasStore | null> {
  try {
    const res = await mqttRequest('fs', 'read', { path: '/recetas.json' });
    return JSON.parse(res.data.content);
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') return null;
    throw err;
  }
}

// 3. Acciones públicas: transforman para la UI
export async function loadRecetas(estado?: EstadoOperativo) {
  const store = await readRecetasStore();
  const items = (store?.recetas || [])
    .filter(r => !estado || r.estado_operativo === estado)
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
    .map(r => ({ ...summarize(r), ingredientes_count: r.ingredientes?.length || 0 }));
  // ... update store
}

// 4. Suscripciones real-time: releen del archivo tras eventos
mqttSubscribe('receta.creada', () => loadRecetas());
mqttSubscribe('receta.actualizada', () => loadRecetas());
mqttSubscribe('receta.eliminada', () => loadRecetas());
```

---

## 7 · Aplicabilidad a los 8 dominios rotos (auditoría operativa)

| Dominio | Storage | Aplica patrón | Notas |
|---|---|---|---|
| recetas | `/recetas.json` (blueprint) | ✅ | **Hecho** en este branch (commit 72019d2) |
| carta-marketing | `/storage/config/marca.json` | ✅ | **Hecho** — incluye escritura directa (update_perfil cumple condiciones §5b). Sin listeners de `marketing.perfil.actualizado` hoy. |
| escandallo | — (stateless on-demand) | ❌ | Necesita decidir persistencia primero. Si escandallo se vuelve stateful y escribe `coste_*` en `/recetas.json`, el patrón aplica con el mismo archivo de recetas. |
| viabilidad | `/viabilidad.json` (TBD) | ⚠️ | Revisar blueprint para confirmar archivo |
| carta-digital | `/carta-digital.json` | ✅ | **Hecho** — store + 3 paneles (config, preview, stats). Stats convertido a placeholder hasta analytics persistido. Forzar composición eliminado (pídeselo al chat). |
| carta-impresion | depende — puede ser stateless | ⚠️ | Revisar blueprint |
| carta-design | `/carta-design/profiles/*.json` (per-profile) | ⚠️ | Probablemente sí, pero con multiple files |
| pdf-viewer | — (consume servicios `local.pdfjs/sharp/google-vision`) | ❌ | No es lectura de storage; necesita handlers dedicados o resolver vía servicios canonicos del repo |

---

## 8 · Dependencias del patrón

- **tools.contract v1.2** — "una declaración, tres destinos". Sin el
  auto-wire al uiHandler que añade el commit `7e82d12` al loader, el
  frontend no podría invocar `fs.read` por `mqttRequest`.
- **filesystem module.json.tools[]** — declara `fs.read`, `fs.write`,
  `fs.list`, `fs.delete`, `fs.mkdir`. Existe desde antes.
- **filesystem internal project scoping** — `activeProjectPath` se
  cachea al recibir `project.activated`. Sin esto, los paths relativos
  no resolverían.

Si alguno de estos cambia, el patrón hay que revisarlo.

---

## 9 · Trade-offs honestos

- **A favor**: menos código, menos módulos, menos directorios. Una sola
  fuente de verdad por dominio (el archivo). Trivialmente extensible.
- **En contra**: el frontend gana la capacidad de leer cualquier archivo
  del proyecto activo. La autorización efectiva la hace `filesystem`
  via `activeProjectPath`. Para dominios con permisos más finos, este
  patrón no basta.
- **Latencia**: la misma que tendría un bridge — un round-trip MQTT al
  backend, un read de disco, vuelta. ~ms.
- **Evolución del shape**: si el blueprint cambia el shape del archivo,
  el frontend rompe silenciosamente. Mitigación: tipos TS estrictos en
  el store + tests de smoke (pendiente formalizar).

---

## 10 · Estado y propuestas de evolución

- **Hoy**: probado en recetas (`72019d2`). Pendiente probar en navegador
  con un proyecto real.
- **Próximo**: aplicar a viabilidad y carta-* tras verificar que cada
  uno tiene archivo de storage. Escandallo y pdf-viewer requieren
  decisión arquitectónica adicional (no son trivialmente migrables).
- **Si el patrón se confirma** tras los 8 dominios: subir la regla a
  `frontend.contract.json` como principio canónico con su cross-check
  en el validator (ej: "página con `mqttRequest('<dominio>', ...)` sin
  tool registrada en el repo → drift; reemplazar por `fs.read` directo
  o crear handler dedicado intencional").
