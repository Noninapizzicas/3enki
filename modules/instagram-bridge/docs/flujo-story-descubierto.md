# Flujo real de Instagram (descubierto en el móvil del dueño)

**Fecha:** 2026-11-13
**Dispositivo:** móvil del dueño (MIUI, 1080×2408)
**Instagram:** `com.instagram.android`
**Método:** pilotado desde el bus con la acción `paso` (bloque 19d), un paso por orden,
verificando el árbol después de cada uno. **Nada de esto está supuesto: cada `view_id`
se leyó del árbol de accesibilidad real.**

---

## Publicar una historia (story) con foto de cámara

| # | Paso | Ancla (`view_id`) | Nombre visible | Verificado |
|---|---|---|---|---|
| 1 | Abrir el menú de creación | `action_bar_left_button` | "Crear" | ✅ |
| 2 | Elegir destino Historia | `cam_dest_story` | "HISTORIA" | ✅ |
| 3 | Hacer la foto | `camera_shutter_button` | "Obturador" | ✅ |
| 4 | (el editor abre solo) | — | — | ✅ |
| 5 | Enfocar la descripción | `add_caption_textview` | "Añade una descripción..." | ✅ |
| 6 | Escribir el texto | `story_comment_text` (pasa a tener foco) | — | ✅ |
| 7 | **Publicar** | `your_story_share_shortcut_button` | "Tus historias" | ⬜ no probado |

### Variantes del paso 7

```
your_story_share_shortcut_button          "Tus historias"      (público)
close_friends_story_share_shortcut_button "Mejores amigos"
story_share_recipient_picker_button       "Compartir con"
```

---

## Descartar una historia sin publicar

```
1 · cancel_button                        "Cancelar"   (cierra el teclado la 1ª vez)
2 · cancel_button                        "Cancelar"   (abre el diálogo)
3 · igds_alert_dialog_primary_button     "Descartar"
```

Diálogo que aparece (tres botones):

```
igds_alert_dialog_primary_button    "Descartar"
igds_alert_dialog_secondary_button  "Guardar borrador"
igds_alert_dialog_cancel_button     "Seguir editando"
```

---

## Trampas encontradas (todas reales, ninguna teórica)

### 1. La galería rompe la accesibilidad

```
tocar "Galería" (gallery_preview_button)
  → Instagram abre el SELECTOR DE FOTOS DEL SISTEMA
  → MIUI lo trata como salto de app y DESACTIVA el servicio de accesibilidad
```

**Consecuencia:** `servicio_no_activo` en todas las órdenes siguientes hasta que el
dueño lo reactive a mano. Android **no permite** reactivar un servicio de accesibilidad
desde la app (es una protección deliberada).

**Regla:** para historias, usar **el obturador** (`camera_shutter_button`), que vive
dentro de Instagram. La galería solo si se acepta el coste de perder la mano.

### 2. Los diálogos del sistema no dan ventana

Mientras hay un diálogo de permisos (cámara, micro) o una transición, `rootInActiveWindow`
devuelve `null` → el volcado sale con `sin_ventana`. **No es un fallo del puente.**

### 3. `observar_despues` puede fallar aunque el gesto SÍ entró

Al tocar un botón que abre una pantalla nueva, la mirada inmediata puede no ver ventana
todavía. El `ok:false` **no significa que no se tocó**: el campo `gestos` conserva que el
aparato ya se movió. Reintentar la **mirada**, no el toque. Repetir el toque es lo que
duplicaría una publicación.

### 4. Instagram no marca el destino seleccionado

Tras tocar `cam_dest_story`, ningún `cam_dest_*` queda con `seleccionado=true`
(antes, `cam_dest_feed` sí lo estaba). **No sirve como confirmación** de que se eligió
Historia; hay que confirmar por la pantalla siguiente (la cámara).

### 5. La descripción pierde el texto al primer "Cancelar"

Al tocar `cancel_button` por primera vez, el texto del campo se borra (el campo vuelve
a mostrar el placeholder "Añade una descripción..."). **El descarte es destructivo:**
el texto hay que reescribirlo si se vuelve atrás.

### 6. Las coordenadas cambian entre pantallas

`cam_dest_story` estaba en (817,2195) con 5 destinos y en (539,2195) con 3.
**Nunca cachear coordenadas**: siempre resolver el ancla en el volcado del momento.

---

## Números de la sesión

```
nodos del feed        123
nodos del menú        169 → 240 (con la galería cargada)
nodos de la cámara    243
nodos del editor      271 → 288 (con texto escrito)
nodos del diálogo      12
pantalla              1080 × 2408
```

---

## Lo que falta por descubrir

- **Paso 7 de verdad**: compartir y verificar que la historia salió (requiere el testigo
  O1/O2: mirar el perfil y ver la historia publicada).
- Publicación en el feed (`cam_dest_feed`): mismo esbozo, sin probar.
- Reels (`cam_dest_clips`) e INSTANTS (`cam_dest_quick_snap`).
- Story desde la galería (bloqueado por la trampa 1 hasta resolver la accesibilidad).
