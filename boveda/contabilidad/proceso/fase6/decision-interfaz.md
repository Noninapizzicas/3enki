# F6 · Decisión de interfaz — vertical CONTABILIDAD

> **Fase 6** (decidir-interfaz). Decidir QUÉ superficie necesita cada módulo y de QUÉ tipo.
> **Lista cerrada de 4 tipos:** `workspace_module` · `system_panel` · `chat_tool` · `inline_render`.

## ⚠️ Hallazgo: el script canónico no sirve para esta vertical

`modules/cosecha/cantera/enki/decidir-interfaz/scripts/decidir-interfaz.js` decide por **`tools`**:

```js
const esPuente = subs.length > 0 && toolNames.length === 0 && uis.length === 0;
→ rol = 'puente-interno' → necesita = false
```

**Los 72 módulos de contabilidad tienen CERO `tools`.** Su contrato es **por eventos** (RPCs `*.request`). Resultado del script: *"sin interfaz"* para los 72 — **falso**.

**Es el 4º bug de la familia "asumir que un módulo tiene tools"**. La convención de esta vertical (y de nichos) es **RPC por eventos**, no tools.

**Criterio adaptado (usado aquí):** la superficie humana de un módulo son sus **RPCs** (`*.request` que no son `project.activated`), no sus tools.

## El reparto real (por RPC)

| Grupo | N | Qué es |
|---|---|---|
| **acciones (opera)** | 35 | tiene RPCs de escritura → el humano **opera** |
| **consulta (mira)** | 18 | solo RPCs de lectura → el humano **consulta** |
| **sin superficie** | 4 | `aviso-cuadre` · `aviso-revision` · `declaracion-fuente-faltante` · `ratificacion-regla-aprendida` — su cara es el bus |
| por afinar | 15 | necesita lectura del código para clasificar |

## La decisión de tipo (4 opciones)

La interfaz de un módulo es **la superficie que el humano necesita para operar lo que el módulo ofrece**. Se decide por **ROL**, no por tamaño. Los cortes candidatos:

### Opción A · Cuatro zonas por rol (mi recomendación)

| Tipo | Zone | Qué módulos | Por qué |
|---|---|---|---|
| **`workspace_module`** | `barra_modulos` | el **libro y el fiscal** (diario, catálogo, cierre, IVA, modelos, inmovilizado, terceros, bancos, facturas…) | **es donde el humano TRABAJA a diario** (contable/asesor); el contable vive dentro |
| **`system_panel`** | `lateral_derecha` | **entrada y control** (cola-revisión, contrato, anclaje, cobertura, panel-proceso, reglas, configuración, perfil administrativo, onboarding) | **se consulta/configura cuando algo falla o al montar** |
| **`chat_tool`** | `barra_chat_inferior` | **operación puntual desde el chat** (consulta del dueño, generar modelo, emitir factura, exportar al asesor, importar plan) | **se dispara como acción concreta** |
| **`inline_render`** | `area_chat` | **lo que aparece en la conversación** (informe rico, cuadro de mando, aviso al negocio, vista revisable, respuesta al dueño) | **se ve aparecer, no se navega** |
| **sin interfaz** | — | los 4 sin RPC + los que solo alimentan el bus | su cara **es el bus** |

### Opción B · Tres zonas (más simple)
Fusionar `system_panel` dentro de `workspace_module` (todo lo de administración como pantallas del mismo espacio) y quedarse con **workspace · chat_tool · inline_render**.
**Coste:** el dueño/asesor pierde la separación entre "mi trabajo" y "la configuración del sistema".

### Opción C · Cara única (un solo panel maestro)
**Un único `workspace_module`** llamado `contabilidad` que agrupa las 4 verticales con pestañas internas (entrada / libro / fiscal / analítica), más `inline_render` para los informes.
**Ventaja:** una sola puerta, coherente con "una app de contabilidad".
**Coste:** un panel grande; pierde la modularidad que ya tenemos en los módulos.

## La duda que hay que resolver contigo

**¿Dónde TRABAJA el humano en tu contabilidad?** Eso decide si el libro va a `workspace_module` (una superficie de trabajo) o todo se ve por chat/informes.

- Si el que opera es **el asesor/contable** → necesita `workspace_module` de verdad (su mesa de trabajo).
- Si quieres que **tú** lo veas todo por el **chat** (preguntar y que te contesten) → casi todo sería `chat_tool` + `inline_render`, y el panel queda para configuración.

## Pendiente de esta fase

- Confirmar la opción de reparto (A/B/C).
- Afinar los 15 "por clasificar" leyendo su código.
- Escribir `ui_handlers` con `type` + `zone` en cada `module.json` (F7).
