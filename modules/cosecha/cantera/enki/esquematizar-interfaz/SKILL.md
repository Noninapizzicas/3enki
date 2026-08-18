---
name: esquematizar-interfaz
description: "FASE 6½ del proceso de proyecto (entre decidir-interfaz y construir-interfaz): declara la interfaz de un módulo en su BLUEPRINT con la sección ui.* (operaciones a exponer, datos a mostrar) — el generador schema→UI (BlueprintForm, 4 zonas) renderiza el panel desde ahí. Si el blueprint ya es derivable con los defaults del generador (args simples + eventos), la fase se salta/automatiza. La spec .md aparte queda solo para casos raros no derivables (zona 5 custom)."
when-to-use: "Entra encadenada por proceso-negocio tras negocio.interfaz (FASE 6½) o a mano: dado un módulo con su tipo de interfaz decidido (F6), dejar su interfaz DECLARADA en el blueprint (ui.*) para que F7 la materialice con el generador. NUNCA construir el panel a mano (F7) sin pasar por aquí: sin ui.* declarada, el generador deriva con defaults o el caso raro queda sin especificar."
fuente: enki
dominio: ui
lente_dominio: prisma
lente_tarea: esquematizar-interfaz
tags: [fase65, interfaz, esquema, blueprint, ui, generador, blueprintform, spec, workspace_module, system_panel, chat_tool, inline_render, agnosticismo]
---

# Esquematizar la Interfaz — FASE 6½ del proceso de proyecto

> El eslabón entre DECIDIR (F6) y CONSTRUIR (F7), ahora con el generador schema→UI.
> Antes: el esquematizador escribía una SPEC .md aparte y F7 construía el panel a
> mano. Ahora: el entregable es la sección `ui.*` EN el blueprint del módulo — el
> generador (BlueprintForm, 4 zonas) renderiza desde ahí. Lo que el blueprint ya
> deriva solo, no se declara: se deja en defaults.
>
> Código: fase 6½ de proceso · habilita `negocio.interfaz_esquematizada`.

---

## 1 · El problema que resuelve

La FASE 6 decide el TIPO de superficie de un módulo (`workspace_module` ·
`chat_tool` · `inline_render` · `system_panel` · ninguna). La FASE 7 materializa el
trío frontend. El generador schema→UI (BlueprintForm — 4 zonas:
formulario/acciones/estados vivos/datos, build verde, PR #266) renderiza
CUALQUIER módulo desde su blueprint — pero necesita saber QUÉ exponer: qué
operaciones son formulario (Z1), cuáles botones directos (Z2), qué eventos se
muestran como estados vivos (Z3), qué datos del storage se listan en tablas (Z4).

Eso se DECLARA en el blueprint (`ui.*`). La fase 6½ decide si el blueprint ya es
derivable con defaults (→ se salta) o necesita `ui.*` escrita (→ la escribe EN el
blueprint, no en un .md aparte).

## 2 · El sujeto — el blueprint del módulo (no se pregunta)

```
sujeto = la interfaz del módulo <slug>, de tipo <tipo> (de la FASE 6)
entrada = <slug>.blueprint.json del módulo
          (contrato · operaciones · eventos_que_escucho · transporte.rpc · transporte.salida)
```

**REGLA DIRECTIVA**: el sujeto se LEE, no se pregunta. El tipo ya lo decidió la
FASE 6; las operaciones y eventos ya existen en el blueprint. NO ofrezcas caminos
A/B/C: declara.

## 3 · EL MANDATO

1. **Lee** el blueprint del módulo: `transporte.rpc` (operaciones RPC),
   `operaciones` (contrato), `eventos_que_escucho`, `transporte.salida`, y `ui.*`
   si ya existe.
2. **Prueba el default del generador**: ¿las operaciones tienen args simples
   (string→input, int→number, enum→select, bool→checkbox, json→textarea,
   kv→clave/valor)? ¿los eventos escuchados se muestran como listas/estados
   vivos? ¿las salidas (`transporte.salida`) son datos tabulables?
   - **SÍ → la fase se salta/automatiza**: el generador con defaults cubre. NO se
     escribe spec. Se cierra la fase con `modo: "default_generador"`.
   - **NO → escribe la sección `ui.*` EN el blueprint** (no en un .md aparte):
     - `ui.ops`: operaciones a exponer con ajustes (omitir, etiqueta, zona
       formulario/acciones).
     - `ui.datos`: lecturas del storage a mostrar en tablas (Z4), con `refresh_on`
       (eventos que refrescan).
     - opcional `ui.etiquetas` / `ui.zonas` si el default no basta.
3. **Caso raro** (operaciones con args no derivables, lógica de panel que el
   generador no cubre): aplica el prisma de 5 huecos + disección SOLO sobre esa
   parte y deja el resultado como anexo breve para la **zona 5 (custom slot)** de
   F7. El resto sigue siendo `ui.*` en el blueprint.
4. Cierra la fase: `proceso-negocio.completar_fase { fase: 'interfaz_esquematizada',
   resumen: { modulo: "<slug>", modo: "default_generador" | "ui_declarada", ui: {...} } }`.

**Dónde se persiste**: en el propio blueprint del módulo
(`<modulo>/<slug>.blueprint.json`) — el generador lo importa directamente. Nada
de directorios `esquemas/interfaz-<slug>.md` salvo el anexo del caso raro (zona 5).

## 4 · Qué deriva el generador SOLO (no lo declares — sobra)

| Zona del generador | Derivación automática desde | Ejemplo (interfaz) |
|---|---|---|
| Z1 FORMULARIO | operaciones con args → campos (string→input, int→number, enum→select, bool→checkbox, json→textarea, kv→clave/valor) | ver (candidatoId), confirmar_veredicto (candidatoId + select PASA/NO_PASA) |
| Z2 ACCIONES | operaciones sin args (o con defaults) → botones directos | listar |
| Z3 ESTADOS VIVOS | eventos_que_escucho → contador + último payload + timestamp | interfaz.intencion.request, veredicto_confirmado |
| Z4 DATOS | transporte.salida / ui.datos → tablas con refresh_on | candidatos (titulo/estado/fuente/sector) |

`ui.*` solo AFINA: qué operaciones se exponen, qué salidas son tablas, etiquetas.
Si el default ya dice lo correcto, no se escribe nada.

## 5 · El contrato `ui.*` (lo que F7 consume)

```json
{
  "ui": {
    "ops": { "<op>": { "omitir": false, "etiqueta": "...", "zona": "formulario|acciones" } },
    "datos": [ { "rpc": "<modulo>.<lectura>", "columnas": ["id", "estado"], "refresh_on": ["<evento>"] } ]
  }
}
```

Con eso, construir-interfaz (F7) materializa el trío con el generador: envoltorio
mínimo que entrega `<BlueprintForm blueprint moduleId />`. Sin spec de panel a
mano.

**La cadena completa (F6 → F6½ → F7 con el generador schema→UI)**:
`modules/cosecha/cantera/enki/fases-interfaz-f6-f7.md` — el mapa de entregables
y el patrón de referencia (dogfood interfaz-dinamico).

## 6 · Verificación

- El blueprint del módulo tiene `ui.*` (modo `ui_declarada`) O el generador con
  defaults cubre (modo `default_generador`).
- BlueprintForm renderiza las zonas que aplican (prueba local o build verde).
- CERO spec .md aparte salvo el anexo del caso raro (zona 5).
- Señal enviada: `proceso-negocio.completar_fase { fase: 'interfaz_esquematizada' }` → 200.

## 7 · Errores a evitar

- **Escribir la spec .md aparte cuando el blueprint basta** — el entregable es
  `ui.*` en el blueprint; el .md solo para el caso raro (zona 5).
- **Diseñar el panel a mano (vistas, layout, CSS)** — eso es artesanal; el
  generador lo hace. F6½ declara QUÉ, no CÓMO se ve.
- **Saltar de F6 a F7 sin pasar por aquí** — sin ui.* declarada (o default
  verificado), F7 no sabe qué exponer.
- **Obligar a migrar módulos con panel manual ya construido** — los que YA tienen
  trío artesanal quedan como están; el generador es el camino para los NUEVOS (o
  para replantear una interfaz mala).
- **Declarar lo que el generador deriva solo** — si el default ya cubre (args
  simples, eventos visibles), no escribas ui.*; fase en modo salto.
- **Preguntar el sujeto** — el tipo lo decidió F6, las operaciones están en el
  blueprint; se LEE.
- **Ofrecer opciones A/B/C al entrar encadenada** — el proceso ya decidió: EJECUTA.
- **Olvidar la señal de fase** — sin completar_fase, el proceso se detiene.
