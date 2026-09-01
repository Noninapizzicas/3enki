---
name: enki-adaptador-disenos
description: >-
  Adaptar un diseño externo al sistema Enki (fase 3b): traducir el diseño OOP a
  módulos-isla event-driven, mapear cada entidad contra el inventario real de
  módulos (REUTILIZAR/ADAPTAR/CONSTRUIR), y escribir plan-construccion.md con la
  espina enki-plan embebida. Dispara cuando exista storage/esquemas/diseno-oop.md
  y haya que producir storage/esquemas/plan-construccion.md (o traer cualquier
  idea externa al sistema).
fuente: hermes
dominio: sistema/enki
tags: [enki, adaptador, fase-3b, plan-construccion, enki-plan, modulos-isla, event-driven]
---

# enki · adaptador de diseños (fase 3b → plan-construccion.md)

> **Qué es.** El puente que trae un diseño externo (OOP/agnóstico, típicamente el
> `diseno-oop.md` de la FASE 3) al sistema Enki real: traduce CLASES a módulos-isla
> event-driven, mapea contra el inventario vivo de `modules/` y escribe el plano de
> acoplamiento `storage/esquemas/plan-construccion.md` con una espina `enki-plan`
> (JSON embebido) que consume la fase 4 `construir-modulos`. No es una skill de
> Prisma: el adaptador de producto (prisma/adaptador) es otro dominio.

## Entradas (leer SIEMPRE, nunca de memoria)

1. `storage/esquemas/diseno-oop.md` — FASE 3: invariantes/mandatos, entidades y value
   objects, clases de negocio con su composición, contratos JSON de eventos,
   máquina de estados, flujos, edge cases.
2. `storage/esquemas/esquema.md` — FASE 2: identidad, piezas **con su forma**
   (sonda micro-agente · banco custodio · evaluador reflejo · redactor conversor ·
   cartero puente · reloj micro-agente · interfaz puente), puertos (p1…p6).
3. Patrones vivos: `arquitectura/cabecera/patron/modulo-real.md` y
   `arquitectura/cabecera/patron/modulo-hibrido.md` (reflejo + blueprint, gate
   anti-colisión `scripts/validate-hibridos.js`).
4. Inventario REAL de módulos (nunca de memoria):
   `find /opt/enki/modules -maxdepth 3 -name module.json` y extraer
   `name/description/subscribes/publishes` con jq. Un módulo candidato se juzga por
   su `module.json` real, no por su nombre.

## Reglas de traducción (innegociables)

| Clase del diseño OOP | Traducción Enki |
|---|---|
| CLASE con estado | módulo **CUSTODIO** (single-writer de su store) |
| CLASE que solo calcula | **PROYECCIÓN INTERNA** dentro del módulo que la usa (jamás helper en `_shared/`) |
| CLASE que orquesta | módulo **MICRO-AGENTE / ORQUESTADOR** |
| CLASE que habla con el exterior | módulo **PUENTE** |
| Dependencia entre clases | **EVENTO request/response**, nunca import |
| Lógica de negocio | DENTRO del módulo como proyección `_op` del reflejo; `_shared/` SOLO infraestructura |

- Formas válidas de hoja: `reflejo | custodio | conversor | puente | micro-agente`.
- Acciones de hoja: `CONSTRUIR | ADAPTAR | REUTILIZAR`. Cada CONSTRUIR justifica por
  qué no reutiliza lo existente; cada "se acerca pero…" evaluado y descartado se
  documenta con motivo.
- La forma de cada pieza viene del esquema (FASE 2) y NO se negocia en el plano.
- Tópicos del bus en **ASCII** (transliterar tildes/ñ: añadir→anadir, señales→senales).
- Todo flujo cierra su círculo: par de resultado canónico (`*.failed` /
  `envio_resultado ok:false` / `ciclo_abortado` / `ciclo_semana_vacia`). Nadie da por
  hecho un envío sin `ok:true` explícito del proveedor (honestidad M11).
- Máquina de estados con DUEÑO (el custodio aplica transiciones al consumir eventos
  de dominio) y estado ilegal imposible (ej. PUBLICADO sin SELECCIONADO).

## Pasos del proceso

1. **Leer inputs** (arriba). Anotar las 7 piezas + sus mandatos (M1…M11) + puertos.
2. **Inventario**: listar manifests, volcar subscribes/publishes de los candidatos.
3. **Traducir** entidad → módulo con la tabla de arriba; respetar la forma del esquema.
4. **Evaluar** cada hoja: REUTILIZAR solo si el contrato real encaja (revisar si el
   módulo persiste por proyecto con PosPersistencia o es global/hardcodeado).
5. **Contrato de eventos**: tabla de pares request/response (quién pide / quién
   responde) + fire-and-forget con par de fallo.
6. **Máquina de estados + flujos principales** (semana típica, semana vacía, falta
   de evidencia, tope del banco, canal caído).
7. **Hojas CONSTRUIR** con 7 etapas (ver plantilla abajo).
8. **Espina `enki-plan`** embebida (ver references/espina-enki-plan.md) y VALIDADA:
   JSON parseable, todas las hojas con los 8 campos tipados, formas/acciones válidas,
   `orden` cubre todas las hojas y respeta `depende_de`.
9. **Escribir** en `storage/esquemas/plan-construccion.md` (vía bus MQTT si el shell
   no tiene permiso — ver skill `enki-filesystem-tools`) y **verificar**: hash del
   response vs `sha256sum`, `find` de la ruta final, re-leer cabecera.

## Plantilla de hoja CONSTRUIR (7 etapas)

```
A. DEPENDENCIAS        — bases _shared y eventos que escucha. Sin require cruzado.
B. MODULE.JSON         — manifest real (name SIN prefijo de vertical, subscribes, publishes, _doc).
C. INDEX.JS            — clase reflejo extends ModuloHibridoReflejo; onUnload flush;
                         project.activated + PosPersistencia SOLO si persiste estado.
D. PROYECCIONES        — métodos puros _op(input) → {status, data}. LA LÓGICA DE DOMINIO VIVE AQUÍ.
E. HANDLERS RPC        — on<Op>Request(e) { return this._atender(e, '<op>', '<mod>.<op>.response', d => this._<op>(d)); }
F. EVENTOS DE DOMINIO  — publicar fire-and-forget del contrato + par de fallo.
VERIFICACIÓN           — ficheros en disco + smoke de eventos + gate validate-hibridos (híbridos).
```

## Pitfalls

- **No inventar módulos**: el inventario está delante; si un módulo existe con el
  mismo patrón pero otro dominio (ej. `radar-fuente` música-hardcodeado, store global
  sin PosPersistencia), NO se ADAPTA (rompería su proyecto): se toma prestado su
  patrón y se justifica el CONSTRUIR en el plano.
- **Revisar el module.json real del candidato**: la descripción puede prometer más
  que el contrato (subscribes/publishes reales). Un store global (const del módulo,
  sin PosPersistencia) no sirve per-proyecto.
- **El plan existente puede ser de una iteración anterior**: los backups
  (`plan-construccion.pre-*.md`) lo atestiguan — regenerar contra el FASE 3 ACTUAL,
  no heredar el viejo.
- **`orden` de la espina**: las hojas REUTILIZAR preceden a sus consumidores; el
  orquestador/micro-agente (reloj) se construye al final con contrato tolerante
  (RPC falla → ciclo fallido, no basura).
- **El éxito 200 de fs.write no prueba la ruta** (lección filesystem): verificar
  siempre con find/hash.
- **Priorizador y funciones puras**: si el diagrama de composición del diseño dice
  "el orquestador compone la clase X", esa clase es proyección interna del
  orquestador (duplicación local de 5 líneas entre islas es aceptada; cero lógica en
  `_shared/`).

## Verificación del entregable

- `plan-construccion.md` existe, ≥1200 chars, cabecera con proyecto + fuentes.
- Espina: `node -e` parsea el bloque ` ```json enki-plan `; conteo de hojas por
  acción coincide con el reportado; `orden` ⊇ slugs.
- Hash del fichero en disco == hash del response del fs.write.
