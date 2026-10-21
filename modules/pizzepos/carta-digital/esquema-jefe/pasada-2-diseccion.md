# PASADA 2 — recursión JEFE: formas UI de cada hoja + señales pareadas

> Bajada hasta hoja DIBUJABLE. Umbral de atómico-UI: el agente de UI puede
> trazarse sin preguntar nada más. FORMAS de esta variante: ref-select,
> inline-gesture, editor-bloque, confirmador-nombrado, cinta-estado,
> señal-refresh — más la FORMA PROPIA de este módulo: el PREVIEW como
> dictamen visual (clase aparte). Fuente de shapes: index.js (L1-589)
> leído entero (handleGetConfig L564, handleUpdateConfig L568,
> handleGetDiseno L292, handlePreview L497, handlePublicar L472,
> handleGetCartaPublica L489).

## Recursión: la declaración se abre en sus palancas reales

`update_config { campos }` (campos = objeto parcial; el handler hace MERGE
profundo de opciones_visualizacion, L574-576 — solo lo presente cambia) se
descompone en las hojas que el CONTRATO soporta:

### Hoja J1 · editor-bloque OPCIONES DE PEDIDO — `update_config { opciones_visualizacion }`

- Campos del shape real (lo que index.js L356-364 / L511-514 LEYEN del config
  y static-template.js consume de verdad):
  - `whatsapp_telefono` — string; normalizado por normalizarTelefono() al
    proyectar (el jefe lo escribe crudo, el módulo lo lava). Vacío = checkout
    WhatsApp OFF en la PWA.
  - `moneda` — string corto (símbolo display, default '€').
  - `mensaje_pedido` — string; cabecera del mensaje WhatsApp ('¡Hola! Quiero
    pedir:' por defecto).
  - (los demás valores de opciones_visualizacion — pago_online,
    pedido_endpoint, ai_endpoint… se PRESERVAN por el merge: no se tocan,
    no se inventan en el editor).
- Señal pareada: **`cartadigital.config.actualizada`** (1×, L579).

### Hoja J2 · editor-bloque DOMINIO PÚBLICO — `update_config { dominio_publico }`

- Campo del shape real: `dominio_publico` — string | null (la URL pública del
  canal si el proyecto tiene dominio propio; null = sin dominio, la URL es
  la alojada del bundle). El handler lo asigna SIEMPRE que viene (L573),
  incluso null — es rever al estado "sin dominio".
- Señal pareada: **`cartadigital.config.actualizada`** (1×).

### Hoja T1 · TRANSICIÓN (jefe, gruesa) · PUBLICAR — `publicar {}`

- Sin args de negocio (el slug es opcional del sistema). NO es editor: es
  TRANSICIÓN de publicación → confirmador-nombrado ("publica AHORA — el
  público entero ve esta versión").
- El módulo FRENULA solo: guard de proyecto activo (412), freno de render
  (422 si roto / overflow_movil), auto-feature www. Es el dictamen de los
  frenos, no de la UI.
- DICTAMEN en la respuesta: { alojada_url, bundle_dir, productos,
  imagenes_copiadas, extras_sin_precio, aviso_extras?, feature_www, aviso }.
  El aviso es TEXTO del reflejo: se muestra tal cual (dice "es estático, no
  al vuelo — cada cambio requiere volver a publicar").
- Señal pareada: **`cartadigital.publicado`** (1×, L437) + (efecto) las
  subidas posteriores de fuentes no re-hornean solas: es estático — la
  señal solo refresca la vista del panel.

### Hoja N1 (neutro, alimenta el panel) · CONFIG VIGENTE — `get_config {}`

- → { _version, dominio_publico, opciones_visualizacion } SIEMPRE (default
  nombrado si no hay fichero — INV2). Informa el editor y el estado del canal.
- No hay señal propia: es lectura.

### Hoja N2 (neutro) · DISEÑO del proyecto — `get_diseno {}`

- → { card_template, tema_css, detalle_template?, layout?, generado_at } — el
  look que compuso Enki (freno de slots: {{id}} {{nombre}} {{precio}}
  {{alergenos}} {{add_label}} + data-accion). Informativo: el jefe MIRA qué
  diseño se aplicará al publicar. Null = sin diseño Enki (la semilla sirve).
- No hay señal propia: es lectura (re-lectura si llega
  cartadigital.diseno.actualizada — la emite guardar_diseno L237).

### Hoja N3 · PREVIEW como DICTAMEN VISUAL (clase aparte) — `preview {}`

- → { html, productos, extras_sin_precio, aviso_extras? }: el generateStatic
  HTML REAL (variante suelta, checkout WhatsApp) con imágenes inline. NO
  escribe nada. La vista lo mete en un iframe srcdoc → el jefe VE la PWA
  como la verá el cliente, ANTES de publicar.
- Es la forma `PREVIEW-dictamen`: no es editor (no captura), no es informe
  (no es tabla): es RENDER del artefacto público. Pareada con la señal de
  re-proyección: `cartadigital.carta_publica.actualizada` (cualquier fuente
  cambiada → re-render del preview si el jefe lo pide).
- `extras_sin_precio` (INV8): si > 0, aviso_en_preview — "N ingredientes
  extra sin precio NO se ofrecen en la carta pública" (honestidad del
  reflejo; el jefe los pone precio en ingredientes).

## Formas de las hojas de UTILIZACIÓN (veredicto: fuera del panel-jefe)

- Hoja U1 `get_carta_publica { project_id }` → la proyección completa
  (branding, categorias, productos con precio/alérgenos, dominio, opciones):
  la cara del CLIENTE (la PWA/cf-worker la consume; es la op de utilización
  del módulo). En el panel-jefe NO abre captura: es el ALIMENTO del preview
  y de la zona "lo que ve el cliente" (solo lectura del JSON proyectado).
- Hoja U2 (futuro) consumo directo del cf-worker/estático: infra, fuera.

## Reglas que gobiernan la composición

- **R1 jefe primero**: preview + publicar encabezan el flujo (la TRANSICIÓN
  es la decisión del canal); el editor de opciones le sigue; el informe
  cierra. La frecuencia real: mirar preview (muchas), editar whatsapp/
  mensaje (a veces), publicar (al cerrar cambios).
- **R2 sin estado asumido**: toda mutación por RPC; el preview SIEMPRE se
  pide (la proyección es al vuelo — jamás se cachea como "lo que habrá").
- **R3 la señal manda**: tras declarar, la vista re-lee get_config cuando
  llega `cartadigital.config.actualizada` (debounce). El DICTAMEN inmediato
  lo da la propia respuesta de update_config (200 config completo).
- **R4 el informe distingue origen**: config default («sin configurar —
  la PWA usa los defaults») vs persistida (con _updated_at). El preview
  vacío (sin carta) se NOMBRA: «asigna una carta al canal digital en
  tarifas» (404 de get_carta_publica es estado nombrado, no fallo).
- **R5 público = transición nombrada**: publicar pide confirmador-nombrado
  y muestra el dictamen del reflejo (alojada_url + aviso) SIN parafrasear.

## Dictamen del árbitro (lente de roles, previo al blueprint)

```
¿DECLARA config del canal o EJECUTA la transición pública? → JEFE
¿LO CONSUME el cliente final en el canal'?                 → UTILIZACION
¿SOLO LEE estado o compone lectura?                        → NEUTRO
```

| Op | Llamada RPC | Veredicto | Por qué |
|---|---|---|---|
| update_config | cartadigital.update_config | **JEFE** | LA DECLARACIÓN del canal (dominio + opciones PWA) — único escritor del config |
| publicar | cartadigital.publicar.request | **JEFE** | LA TRANSICIÓN: hornea y despliega el bundle público (evento cartadigital.publicado) |
| preview | cartadigital.preview.request | **NEUTRO** | compone el HTML real y lo devuelve — no persiste ni transiciona; alimenta la REVISA del jefe (dictamen visual) |
| get_config | cartadigital.get_config.request | **NEUTRO** | informe del canal: alimenta el editor y la vista |
| get_diseno | cartadigital.get_diseno.request | **NEUTRO** | informe del diseño que se aplicará al publicar |
| get_carta_publica | cartadigital.get_carta_publica.request | **UTILIZACIÓN** | la cara del CLIENTE (la PWA/cf-worker consume esta proyección); en el panel-jefe solo alimenta el preview como dictamen visual — anotada, no capturada |

6/6 juzgadas. Composición del panel-jefe: J1+J2 (declarar) + T1 (transición)
+ N1/N2/N3 (informarse; N3 = dictamen visual). Utilización (get_carta_
publica) separada — existe, es la PWA misma; anotada en el blueprint.
RPC de bus correlado: cartadigital.<op>.request → cartadigital.<op>.response.
6/6 juzgadas.