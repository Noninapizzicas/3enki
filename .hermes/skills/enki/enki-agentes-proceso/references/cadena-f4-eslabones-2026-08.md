# La cadena de bugs de la F4 en vivo (proyecto "b", 2026-08-10/11)

6 fallos encadenados de `construir-modulos` en un solo proyecto. Cada intento avanzaba un
eslabón. La lección de fondo: **cuando un pipeline "falla" en vivo, casi nunca es el LLM —
es un eslabón determinista del sistema (slug · validador · reflejo · JEFE · timeout). La
bitácora dice la verdad; el chat reporta síntomas.**

## Los 6 eslabones (en orden de aparición)

| # | Síntoma (bitácora/chat) | Causa raíz | Fix |
|---|---|---|---|
| 1 | Módulo escrito en `modules/plan-construccion/` (era config) | `_resolverSlug` elegía el token más largo de la task (`plan-construccion` 16 chars > `config` 6) | #165: paréntesis de la hoja gana |
| 2 | Commit falla "Author identity unknown" | www-data sin user.name/email (config local solo tenía safe.directory) | #165: `-c user.name="Enki Motor"` en el commit |
| 3 | `en_repo: ok:true` con el commit fallido | `git ls-files` ve el STAGING (git add sin identidad funcionaba) | #165: `git log --oneline -1 -- <path>` |
| 4 | Chat dice "no escribió nada" | fs del chat scopeado al storage; `modules/` del sistema invisible | #165: tools `fs.list_modules` + `fs.read_module` SOLO-lectura |
| 5 | `tamaño 3 < mínimo 200` con 4.964 tokens generados | validador `tamano_min` medía `Object.keys` (3 claves) en objetos multi-archivo | commit directo: suma de valores string |
| 6 | Chat corta al agente a los 150s (adaptador tardó 181s) | timeout FIJO de invoke_agent | #171: derivado del presupuesto del pipeline |
| 7 | "index.js como JSON contenedor", module.json nunca escrito | reflejo multi-archivo solo entendía `{archivos:{}}`, el F4 devuelve objeto directo | #173: aceptar ambos formatos + basename lookup |
| 8 | `modules/name/` en vez de `banco-ideas` | regex de comillas no aceptaba la barra de `"newsletter/banco-ideas"` | #175: basename + señal `Slug:` |
| 9 | `api_real` falla en module.json ("usa _shared: false") | regla de código aplicada al manifiesto JSON | #176: api_real solo `.js` |
| 10 | Plano declaraba `_shared/prioridad.js` (lógica de negocio en infraestructura) | el adaptador traducía con ADN estándar (helpers compartidos + require), no event-driven | #177: instrucción con traducción event-driven explicada |

## Patrones de diagnóstico que funcionaron

1. **La bitácora es la verdad, el chat reporta síntomas.** Tres veces el chat dijo "no
   escribió nada / timeout / mintió" con la bitácora `verificada` y el archivo en disco.
   Antes de creer al chat: `ls -t <proyecto>/storage/agentes/bitacoras/*.json | head -1` y
   leer pasos + veredicto.
2. **El deploy no reinicia el proceso.** Los archivos llegan a `/opt/enki/` (16:14) pero el
   proceso corre el código viejo hasta el `systemctl restart` (19:40). Verificar:
   `stat -c %y <archivo>` vs `ps -o lstart= -p <pid>`. El enum de invoke_agent se genera al
   arrancar.
3. **El `in 124` de los reintentos NO es contexto perdido** — es cache del provider (prompt
   idéntico → `cache_read_input_tokens`). El motor reenvía `taskEfectiva` completa en cada
   intento (línea del bucle `for intento`).
4. **El LLM responde bien; el sistema mide mal.** Cada intento de la F4 generó 19-32K tokens
   de código VÁLIDO. Los fallos eran del validador (contaba claves), del reflejo (formato),
   del JEFE (regla mal aplicada), del slug (señal débil).
5. **Limpieza de basura de www-data**: `git rm --cached` (quitar del índice sin tocar disco)
   + deploy con `rsync --delete` la elimina de prod; el borrado físico requiere sudo del
   usuario (los archivos son www-data, admin no puede).

## El commit del motor deja basura "verificado"

El motor commitea con identidad propia (`-c user.name="Enki Motor"`). Cuando el JEFE
verificaba por error un path con nombre mal (p.ej. `modules/name/`), la basura quedaba
commiteada con mensaje "motor: <slug> generado por pipeline construir-modulos (verificado)".
Limpieza: `git rm --cached -r <dir>` + commit + PR → el deploy borra en prod.

## La traducción event-driven del adaptador (PR #177)

La lección de fondo de Paco: **"el sistema no es event-driven" → no, el sistema SÍ lo es;
lo que no lo era era la TRADUCCIÓN**. El LLM traduce con su ADN estándar (helpers
compartidos en `_shared/`, require directo entre módulos). La instrucción del adaptador
ahora explica (5 secciones): qué es un módulo Enki (islas que se hablan por eventos),
cómo traducir cada pieza OOP (estado→custodio · calcula→proyección interna/conversor ·
orquesta→orquestador · externo→puente · dependencia→request/response), ejemplos MAL→BIEN,
y la regla: sin lógica de negocio en `_shared/` (solo infraestructura: base-module,
pos-persistencia, motor), comunicación SIEMPRE por eventos, slugs sin prefijo de vertical.

Los módulos reales solo requieren infraestructura de `_shared/` (verificado: estados
requiere modulo-hibrido-reflejo + pos-persistencia + prisma-del-caso — método, no negocio).
