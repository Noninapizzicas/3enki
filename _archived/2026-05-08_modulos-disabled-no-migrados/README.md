# Archivado: notas + scratch-designer + ui-designer

**Fecha**: 2026-05-08
**Decisión**: archivar los 3 módulos `disabled` que nunca se migraron al canon POC2,
cerrando el horizontal del repo.

## Qué eran

- **`notas`** (485 LOC, 59 drifts): CRUD de notas con pin/toggle. Reemplazado en
  la práctica por `text-editor` y por las herramientas de memoria del subsistema
  chat (`memory-conversation-summary`, `memory-rag`). Nunca se cableó al UI
  canónico ni a ningún flujo de dominio.
- **`scratch-designer`** (413 LOC, 31 drifts): editor visual estilo Scratch para
  generar configs JSON de módulos. Tooling exploratorio que no llegó a integrarse
  con `_template/` ni con el flow de `scaffold-rewrite.js`.
- **`ui-designer`** (1281 LOC, 120 drifts): editor de plantillas UI con export a
  Svelte/YAML/JSON. Tooling exploratorio sustituido en la práctica por edición
  directa de los componentes de `composition-manager` + `_template`.

## Por qué se archivan

1. **Estaban en `config.json.modules.disabled`** desde hace meses. No se cargan
   en runtime, no se invocan desde ningún flujo, ningún módulo del horizontal
   los `require`.
2. **Cero dependencias runtime**: ningún `module.json` los lista en `requires`,
   ningún `index.js` hace `require('../notas')` ni similar.
3. **Eran los 3 únicos módulos sin canon POC2** (sin `_classifyHandlerError` /
   `_handleHandlerError` en su `index.js`). Migrarlos requeriría ~210 drifts de
   trabajo para código que nadie usa.
4. **Drift count combinado: 210** — eliminarlos del baseline limpia el horizontal
   sin perder funcionalidad real.

## Qué se conserva

- Código completo de los 3 módulos (`modules/`).
- Auditorías renombradas con prefijo `.archived-` para que el validator de canon
  las ignore (en `arquitectura/auditoria/_outputs/modulo-completo/`).

## Cómo recuperar

Si se quisiera resucitar uno (poco probable):

1. Mover el módulo de vuelta a `modules/`.
2. Restaurar nombre original del JSON de auditoría
   (`.archived-<modulo>.json` → `<modulo>.json`).
3. Quitarlo de `config.json.modules.disabled`.
4. Migrar al canon POC2 con `scaffold-rewrite.js <slug>`.

## Drifts cerrados

- `notas`: 59
- `scratch-designer`: 31
- `ui-designer`: 120
- **Total: 210 drifts** desaparecen del baseline al archivar.

## Estado del horizontal tras el archivado

Con esto, **el horizontal del repo queda al 100%**: los 70 módulos vivos
restantes (excluyendo `_template` y los 3 POCs exploratorios `*-poc`) están
todos al canon POC2.
