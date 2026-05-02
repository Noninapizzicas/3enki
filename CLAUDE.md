# Paradigma del sistema — Event-Core

## La regla que no se rompe

**Emite evento. Quien sabe, hace. Tú no sabes cómo.**

Cada módulo conoce exactamente una cosa: su dominio. Nada más.

### Un módulo NO:
- Llama directamente a otro módulo
- Instancia servicios de persistencia propios
- Espera respuesta de lo que emitió
- Mezcla dominio con infraestructura (SQLite, HTTP, filesystem)
- Controla el flujo después de emitir

### Un módulo SÍ:
- Emite eventos con datos de dominio
- Escucha eventos que le corresponden
- Actúa dentro de su responsabilidad
- Devuelve resultados a quien le llamó

El emisor sabe **qué**. El receptor sabe **cómo**.

## Granularidad

**Un módulo = una responsabilidad acotada. El nombre del directorio describe exactamente qué hace.**

- `carta-design` diseña la apariencia visual
- `carta-impresion` genera la carta para imprimir
- `carta-scheduler` decide qué carta está activa por franja
- `device-registry` / `device-shadow` / `device-health` son 3 responsabilidades, no un mega `device-manager`

No fusionar en mega-módulos "manager". La claridad inmediata del nombre vale más que el ahorro de archivos. Si dos módulos comparten 80% de su lógica, se valora fusionar como excepción razonada, no como regla.

---

# Cómo trabajo en este repo

Este `CLAUDE.md` es un **índice**. La información estructurada vive en JSONs validados contra schemas. Antes de cualquier tarea, leo los archivos que apliquen.

## Convenciones (cómo se nombra y se estructura todo)

- **`arquitectura/convenciones/_outputs/naming.json`**
  Convención de naming: idioma por módulo (`module.json.language` ∈ {es, en}), forma de los eventos (`<module-prefix>.<entity>.<verb>`), verbos canónicos por idioma, restricciones léxicas (ASCII puro, kebab-case, sin tildes ni ñ).

- **`arquitectura/convenciones/_outputs/glossary.json`**
  Glosario cross-módulo: una sola forma canónica por concepto por idioma. Sinónimos prohibidos. Si un concepto aparece aquí, su nombre canónico es el único permitido. Solo entran términos que cruzan dos o más módulos.

- **`arquitectura/convenciones/_contratos/{naming,glossary}.contract.json`**
  El "por qué": principios, scope, criterios de inclusión, validaciones cruzadas. Lectura recomendada cuando hay dudas sobre la regla.

## Auditoría del sistema (estado real de cada módulo)

- **`arquitectura/auditoria/_outputs/manifest-completo/<modulo>.json`**
  Lo declarado por el módulo (extraído de su `module.json`).

- **`arquitectura/auditoria/_outputs/modulo-completo/<modulo>.json`**
  Lo real (extraído del código + cruzado con el manifest). Incluye eventos publicados con archivo:línea, subscribes, tools, ui_handlers, apis_http, estado, lifecycle, dependencias, modos de fallo, observabilidad, outliers y quirks. **Es el documento autoritativo del módulo: si tienes que reescribirlo, lees ESTO antes que el código viejo.**

- **`arquitectura/auditoria/_contratos/modulo-completo.contract.json`**
  Define qué campos tiene cada auditoría y por qué.

## Validators

Todos los outputs (convenciones y auditorías) son validables mecánicamente. Antes de proponer cambios estructurales:

```bash
node arquitectura/convenciones/_validators/naming.validate.js
node arquitectura/convenciones/_validators/naming.validate.js --check-system
node arquitectura/convenciones/_validators/glossary.validate.js
node arquitectura/convenciones/_validators/glossary.validate.js --check-system
node arquitectura/auditoria/_validators/modulo-completo.validate.js <slug>
```

---

# Protocolo de trabajo

1. **Antes de tocar un módulo:** leo su auditoría completa (`_outputs/modulo-completo/<modulo>.json`). Si tengo que escribir código nuevo, leo también `naming.json` y `glossary.json`.

2. **Antes de añadir/renombrar un evento:** consulto `naming.json` (forma + verbo canónico del idioma del módulo) y `glossary.json` (si la entidad está, uso la forma canónica del idioma).

3. **Si una decisión rompe la convención:** paro y pido confirmación antes de proceder. Las convenciones son la regla, el legacy es drift que se migra.

4. **Antes de escribir código, me pregunto:**
   - ¿Este módulo está haciendo algo que no es su dominio?
   - ¿Podría resolver esto emitiendo un evento en lugar de llamar directamente?
   - ¿Quién debería escuchar esto? ¿Ese módulo ya existe?
   - ¿Estoy mezclando dominio con infraestructura?

   Si la respuesta a la 1 o la 4 es sí, paro. Refactorizo el diseño antes de escribir.

5. **Mapa de eventos antes del código.** Para cualquier módulo nuevo o a reescribir, primero respondo:
   - ¿Qué eventos emite?
   - ¿Qué eventos escucha?
   - ¿A qué reacciona cada subscribe?

   El mapa va en la auditoría del módulo. Sin mapa, no se toca el módulo.
