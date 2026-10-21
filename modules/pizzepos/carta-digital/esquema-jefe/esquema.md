# ESQUEMA — cara del JEFE del módulo `carta-digital` (pizzepos v2.24.0, PROYECTOR)

> Árbol maestro consolidado (pasadas 1-2 + anatomía). Alimenta al agente de UI
> que escribe el panel. Ley de agnosticismo: cero tecnología de sistema ambiente.
> El análisis es de la CARA DEL JEFE — la utilización (PWA/cf-worker/cliente)
> quedó fuera, anotada.
> Fuente: modules/pizzepos/carta-digital/index.js (589 líneas) + module.json
> + proyeccion.js + static-template.js + module.json (6 ui_handlers).

## 1. Quién es el jefe y qué decide

Dueño del ESCAPARATE público: la PWA que ve el cliente final. carta-digital es
el PROYECTOR (no custodio del catálogo): bebe carta (carta-manager), marca
(carta-marketing), contenido y tarifas — lo ÚNICO que posee es el CONFIG del
canal (/pizzepos/carta-digital/config.json: dominio_publico +
opciones_visualizacion). Decide:

- **D1 — config del canal** (D2+D3, 1 llamada update_config): dominio_publico
  (URL propia o null = URL alojada) + opciones_visualizacion (whatsapp_telefono
  del checkout, moneda display, mensaje_pedido). Merge profundo: solo lo
  enviado cambia.
- **D2 — CUÁNDO ve el público la carta** (publicar): la TRANSICIÓN de
  publicación. Hornea proyección+diseño en el bundle estático y lo despliega
  (cartadigital.publicado). Con revísalo-antes: el PREVIEW es parte de la
  decisión (dictamen visual antes de la transición).

Lo que NO decide: qué hay en la carta (carta-manager), la marca (marketing),
qué carta toca al canal (tarifas), ni sirve la carta al cliente (la PWA misma
consume get_carta_publica — utilización).

## 2. Invariantes (restricciones honestas, verificadas en código)

- INV1 — **proyector, no custodio del contenido**: bebe 4 fuentes y posee SOLO
  el config del canal. update_config aplica SOLO dominio_publico +
  opciones_visualizacion (L572-576, merge por bloques; el resto de opciones se
  PRESERVA). Nada de precios/platos/branding aquí.
- INV2 — **sin 404 de lectura de config**: get_config SIEMPRE responde (si no
  hay fichero válido → default { _version:'1.0', opciones_visualizacion:{} }).
  «Sin configurar» es estado NOMBRADO, no error.
- INV3 — **preview fiel, no maqueta**: preview genera el MISMO generateStatic
  HTML que el cliente (variante suelta con checkout WhatsApp), inlinea las
  imágenes y NO escribe nada (L494-538). El dictamen visual es FIEL:
  iframe srcdoc.
- INV4 — **publicar es TRANSICIÓN con frenos propios**: guard de proyecto
  activo (412 PRECONDITION_FAILED si el objetivo no es el último activado),
  freno de render (422 si el verificador mira y el render sale roto o con
  overflow móvil — es una PWA de móvil), auto-activa feature `www`
  (best-effort). Estático: CADA cambio exige volver a publicar; el aviso del
  reflejo lo dice y se muestra tal cual.
- INV4b — **404 de proyección = estado nombrado**: sin carta asignada al canal
  el preview/publicar responden 404 «asigna una carta al canal digital en
  tarifas» — estado inicial legítimo que la vista nombra.
- INV5 — **respuesta = dictamen**: update_config responde 200 config COMPLETO;
  publicar responde { alojada_url, bundle_dir, productos, imagenes_copiadas,
  extras_sin_precio, aviso_extras?, feature_www, aviso }. La señal re-lee la
  vista (debounce). Nunca recarga, nunca estado optimista.
- INV6 — **moneda/símbolo**: op.moneda es el símbolo que pinta la PWA ('€'
  default): display, no cifra. La UI lo edita como texto corto, sin censtmos
  ni formatos.
- INV7 — **multi-tenant**: todo RPC lleva project_id (lo inyecta el caller);
  el guard de publicar compara contra el ÚLTIMO proyecto activado (falla CLARO,
  412, nunca escribe en otro).

## 3. Señales pareadas (verificadas en index.js)

| Declaración | Señal de confirmación | Payload |
|---|---|---|
| update_config (campos) | `cartadigital.config.actualizada` | { project_id, timestamp } (L579) |
| publicar | `cartadigital.publicado` | { project_id, slug, productos, imagenes } (L437) |
| (fuentes externas: carta.editada, contenido.actualizado, marketing.perfil.actualizado, tarifas.config.actualizada, …) | `cartadigital.carta_publica.actualizada` (re-emisión, L161-166) | { project_id, timestamp } |
| guardar_diseno (Enki, por bus) | `cartadigital.diseno.actualizada` (L237) | re-lee get_diseno |

La señal gruesa `cartadigital.carta_publica.actualizada` es la señal INDIRECTA
del custodio: la UI se SUSCRIBE con debounce (re-proyecta carta + preview);
tras cada mutación del panel hay refetch por dictamen de la respuesta (la
señal convive, no sustituye: misma doble confirmación que entrega/masa).
Publicar NO regenera al vuelo: tras publicar, la URL pública queda horneada
hasta la próxima publicación (se dice en el aviso).

## 4. Veredicto del árbitro (6/6) y composición de la vista

```
¿DECLARA config del canal? ¿EJECUTA la transición pública? → JEFE
¿La consume el CLIENTE en el canal (lo que la PWA bebe)?   → UTILIZACION
¿SOLO LEE / compone lectura sin persistir ni transicionar? → NEUTRO
```

- **jefe (2)**: `update_config` (LA DECLARACIÓN del canal — editor-bloque),
  `publicar` (LA TRANSICIÓN — confirmador-nombrado + dictamen del reflejo).
- **neutro (3)**: `get_config` (informe del canal), `get_diseno` (el look que
  se aplicará), `preview` (compone el HTML real y lo devuelve SIN escribir —
  forma aparte: `PREVIEW-dictamen visual`, el jefe REVISA antes de publicar).
- **utilizacion (1)**: `get_carta_publica` — lo que consume el CLIENTE final
  (mapping canal→carta, precios, alérgenos). FUERA de la captura del panel:
  en el blueprint se anota con su veredicto; en el panel solo existe como
  alimento del preview.

Composición 3 capas del panel del jefe:

```
1. SELECCIONAR   — (sin ref: 1 PWA por proyecto; el contexto es el proyecto
                   activo) — informarse directamente
2. INFORMARSE    config vigente (get_config, estado nombrado «sin configurar»)
                 + diseño aplicable (get_diseno) + CINTA de la proyección
                 (get_carta_publica como dato de fondo: nº productos, marca)
                 + PREVIEW como DICTAMEN VISUAL (iframe del HTML real)
3. DECLARAR      editor-bloque OPCIONES (whatsapp/moneda/mensaje + dominio),
                 cada uno 1 llamada update_config { soloSuCampo }
4. TRANSICIÓN    PUBLICAR con confirmador-nombrado («publica AHORA — el
                 público entero ve esta versión») → dictamen de la respuesta
                 (alojada_url + aviso tal cual) + señal cartadigital.publicado
```

(R1 jefe-primero + frecuencia: preview primero, publicar al cerrar. R2 sin
estado asumido. R3 la señal manda + dictamen RPC. R4 transparencia de origen.
R5 transición nombrada.)

## 4b. Señales indirectas del custodio (suscripción con debounce)

La PWA se alimenta de 8 fuentes (tarifas, carta, marca, contenido, proyecto).
El proyector RE-EMITE todas como `cartadigital.carta_publica.actualizada`
(L161-166, _reemitir). El panel-jefe SUSCRIBE esa señal (señal indirecta del
custodio) con debounce 60ms y re-proyecta: cinta, preview (si abierto) y
estado. Además:
- `cartadigital.config.actualizada` → re-lee get_config (dictamen por
  respuesta + señal re-leyendo, doble confirmación).
- `cartadigital.publicado` → actualiza cinta de publicación (última URL).
- `cartadigital.diseno.actualizada` → re-lee get_diseno.
Sin ninguna de ellas, tras cada acción propia el dictamen de la respuesta
basta (refetch directo).

## 5. Formas UI asignadas

| Hoja | Forma | RPC | Señal |
|---|---|---|---|
| Cinta del canal | cinta-estado: dominio/config + nº productos + extras sin precio | get_config + get_carta_publica | cartadigital.carta_publica.actualizada (debounce) |
| Dominio público | editor-bloque (1 campo) | update_config { dominio_publico } | cartadigital.config.actualizada |
| Opciones de pedido | editor-bloque (whatsapp, moneda, mensaje) | update_config { opciones_visualizacion } | cartadigital.config.actualizada |
| DISEÑO aplicable | informe-corto (card_template/tema_css resumidos, no editables aquí) | get_diseno | cartadigital.diseno.actualizada |
| PREVIEW | PREVIEW-dictamen visual: botón «Ver como el cliente» → iframe srcdoc con el HTML de preview | preview {} | re-render a demanda del jefe |
| PUBLICAR | confirmador-nombrado (modal que NOMBRA qué y a quién afecta) | publicar { } → { alojada_url, aviso, … } | cartadigital.publicado |

Hojas de utilización (excluidas del panel-jefe): get_carta_publica (la PWA del
cliente) — anotada en el blueprint con su veredicto y su papel de alimento.

## 6. Huecos [ABIERTO] — decisiones del dueño, se NOMBRAN (pasada-1 §5)

1. paga online (pago_online + pedido_endpoint) — soportado por config y
   template, sin pantalla hoy; requiere backend detrás (tienda-api).
2. programación de publicación (carta-scheduler vive aparte).
3. multi-idioma/variantes por zona — no abre el config v1.0.
4. chat IA de la PWA (cf-worker, escenario SUELTO) — decisión de negocio.

Huecos de CONTRATO (faltan campos en config.json v1.0), no de CAPTURA: la UI
no pide nada que el módulo no soporte.