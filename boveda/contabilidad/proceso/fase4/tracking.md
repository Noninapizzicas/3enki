# F4 · Tracking de construcción — 116 módulos

> **Fase 4** (construir-modulos). Orden tomado de la espina `enki-plan` de F3b — **topológico** (118 slugs; toda dependencia va antes).
> **Regla de la unidad:** 118 clases F3 → **118 hojas** (116 CONSTRUIR + 2 REUTILIZAR). **1:1, sin agrupar.**

## ⚠️ Decisión de arquitectura: dónde viven (aplicada por el padre al no responder el dueño)

**La partición en 4 verticales se aplica EN DISCO** (no como etiqueta del plan). El loader soporta exactamente dos niveles (`modules/<slug>/` o `modules/<vertical>/<slug>/`) — verificado en `core/modules/loader.js` L125.

```
modules/contabilidad-entrada/     32 módulos
modules/contabilidad-libro/       32 módulos
modules/contabilidad-fiscal/      22 módulos
modules/contabilidad-analitica/   32 módulos
```

**Por qué:** la vez anterior los 116 se pusieron todos juntos en `modules/contabilidad/` y la partición quedó **solo declarada** — el dueño lo rechazó explícitamente ("no he hecho ningún deploy" + borrado). La carpeta **no es frontera de comunicación** (los módulos se hablan por eventos, dentro y fuera); es **unidad de organización y activación**, que es como el dueño la definió en F0.

**Revisable:** si el dueño prefiere una sola carpeta, es moverlos; ningún contrato de eventos cambia.

## Los 2 REUTILIZAR (no se construyen)

| Clase | Módulo existente |
|---|---|
| `puerto-documento-digital` (A5) | `facturacion/fuentes` |
| `extraccion-dato` (A4.1) | `facturas` |

## Progreso

| Grupo | Contenido | Estado |
|---|---|---|
| 1 | puerto-documento · captura-documento · puerto-evento-vertical · normalizador-hecho · control-cuadre-documento · puerto-plan-contable · catalogo-cuentas · padron-terceros | 🚀 en curso |
| 2-15 | (los siguientes 8 del orden) | pendiente |

**Total: 116 módulos** = 32 entrada + 32 libro + 22 fiscal + 32 analítica (menos los ejes de los 2 reutilizados).
