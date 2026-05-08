# Archivado: calling-generator + plugins externos

**Fecha**: 2026-05-08
**Decisión**: archivar `calling-generator` y los 5 plugins externos (`weather`, `slack`,
`github`, `http-utils`, `ocr`) por estar fuera del horizontal canónico actual.

## Qué era

`calling-generator` era infraestructura para cargar plugins JSON externos
(`plugins/<name>/<name>.functions.json`) y exponerlos al LLM como tools
ejecutables. Soportaba HTTP wrappers (Bearer/API-Key/Basic Auth, path
params, query params, body) y funciones locales via eventos.

## Por qué se archiva

1. **Ningún módulo canónico lo usa en runtime**. De los 73 módulos del
   horizontal, ninguno publica `function.execute.request` ni consume
   `function.generated`/`function.executed`/`function.failed`.

2. **Duplica el patrón canónico de tools**. El sistema ya tiene 2
   mecanismos canónicos para el LLM:
   - `module.json.tools[]` con handler → `moduleLoader.toolsRegistry` →
     ai-gateway lo invoca directo (PATH 1).
   - `agent.execute.request` → ai-agent-framework con 30+ agentes
     especializados.

3. **ai-gateway lee `moduleLoader.toolsRegistry` directamente**, no
   necesita el indireccionamiento de calling-generator.

4. **Los plugins externos no se usan**: ninguno tenía consumers reales
   en el sistema. `weather`, `slack`, `github`, `http-utils` tenían
   definiciones pero nunca se invocaron desde flujos del repo.

## Qué se conserva

- Código completo del módulo (`calling-generator/`).
- Los 5 plugins (`plugins/`).
- Metadata de auditoría (renombrada con prefijo `.archived-` para que
  el validator de canon la ignore).

## Cómo recuperar (si en el futuro hay marketplace de plugins)

1. Mover `calling-generator/` de vuelta a `modules/`.
2. Mover `plugins/` de vuelta a la raíz del repo.
3. Restaurar `calling-generator` en `config.json.modules.enabled`.
4. Restaurar nombre original de los archivos de auditoría
   (`.archived-calling-generator.json` → `calling-generator.json`).
5. Migrar al canon POC2 (era 812 LOC, 40 drifts).

## Drifts cerrados

40 drifts de `calling-generator` + 1 de `plugins/` desaparecieron del
baseline al archivar.
