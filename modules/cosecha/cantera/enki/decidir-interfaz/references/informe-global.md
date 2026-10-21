# Informe global — patrón de interfaz aplicado (145 módulos)

> Generado con `scripts/decidir-interfaz.js --all` · rama hermes/decidir-interfaz
> · fecha: 2026-08-07. Los números son la foto del repo en ese momento; el
> script es la fuente viva, este archivo es el ancla.

## Resumen

| Métrica | Valor |
|---|---|
| Módulos totales | 145 |
| Necesitan interfaz | 40 |
| No necesitan (puente/reflejo/observador) | 105 |
| Drift detectado (necesitan pero SIN_TIPO o tipo discordante) | 29 |

## Distribución de tipos sugeridos (de los 40 que necesitan)

- `system_panel`: 28
- `workspace_module`: 11
- `chat_tool`: 1
- `inline_render`: 0 (ningún módulo lo usa hoy; el contrato lo define)

## Corte 1 · workspace_module (caso testigo: pedidos + productos)

Área de trabajo del negocio, operación diaria del humano, `zone=barra_modulos`.
Ver `caso-pedidos-productos.md` — prisma completo de los dos.

Módulos del corte (11): pedidos, productos, cocina, cobros, cuentas, facturas,
ingredientes, categorias, variaciones, tarifas, pase-cocina.

## Corte 2 · system_panel (caso testigo: filesystem + device-health)

Gestión/sistema bajo demanda, `zone=lateral_derecha`. El humano lo consulta
cuando lo necesita (operar o diagnosticar), no trabaja en él a diario.

Módulos del corte (28): filesystem, device-health, device-registry,
device-shadow, firmware-manager, firmware-builder, esp32-flasher, esp32-dev,
prompt-manager, credential-manager, plugin-manager, admin-panel, cupulas,
channel-manager, gateway-manager, certificate-authority, security-p2p,
security-core, perifericos, interruptores, homeostasis, conserje,
project-profile, proyecto-negocio (proceso-negocio), estados, inventario,
scheduler, crawl4rs, ocr4rs, code-executor, mercadona-api, telegram-service,
mise-en-place, whatsapp-bot, verificador-visual, pdf-viewer, destilador,
propiocepcion, portal, text-editor.

## Corte 3 · chat_tool (caso testigo: pendiente)

Operación puntual disparada desde el chat, `zone=barra_chat_inferior`.
Hoy solo 1 módulo cae aquí (media-generator o motor-trazo según señales).
Es el tipo menos usado — la FASE 6 lo visibiliza.

## Corte 4 · inline_render

Contenido que aparece DENTRO del flujo del chat. 0 módulos lo usan hoy.
Candidatos naturales (no declarados): previews de carta-digital, html-preview,
resultados de agentes.

## Corte 0 · sin interfaz (105)

Puentes internos, reflejos pasivos, observadores de bus. No se les fuerza
superficie: su cara es el bus. Lista completa en la salida de
`decidir-interfaz.js --all`.

## Drift pendiente de corregir (29 módulos)

Los 29 con `drift=true` necesitan que su `ui_handlers` reciba `type` canónico +
`zone`. La corrección es mecánica (el script la sugiere; un pase posterior la
aplica a los module.json).
