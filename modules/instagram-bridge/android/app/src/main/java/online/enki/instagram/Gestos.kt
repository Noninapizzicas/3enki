// PENDIENTE DE COMPILAR EN EL PORTATIL (no hay Android SDK en el servidor)
//
// Gestos.kt — el puerto `Superficie` de A3 (`crate/src/mano/ejecutor.rs`) en
// Android. A3 decide QUE se toca y comprueba que la foto no se repite; este
// fichero solo ENTREGA el gesto y dice si pudo.
//
// Lo que hace: convierte las cuatro acciones del catalogo cerrado en llamadas
// reales del aparato.
//
//   tocar      -> ACTION_CLICK sobre el nodo (si se encuentra por su id) o
//                 `dispatchGesture` con un toque en el centro de su caja.
//   escribir   -> ACTION_FOCUS + ACTION_SET_TEXT sobre el nodo. NUNCA un
//                 "toco aqui y escribo lo que sea": si el nodo no se encuentra,
//                 se falla; escribir a ciegas es escribir en el campo que tenga
//                 el foco.
//   desplazar  -> `dispatchGesture` con un trazo desde el centro de la pantalla
//                 en la direccion pedida.
//   esperar    -> `Thread.sleep` en el hilo que llama (el del bucle de
//                 `publicar`), que es lo que significa esperar de verdad.
//
// Lo que NO hace, a proposito:
//   - NO decide si el gesto se puede hacer. Eso es A3: si el ancla no esta, si
//     la accion no esta en el catalogo o si la foto es la vieja, A3 ni siquiera
//     llega aqui.
//   - NO reintenta. Un toque que falla se declara `Fallo` y sube; quien decide
//     es A5, y su regla sagrada es que lo que pudo cambiar el mundo no se
//     repite. Un reintento escondido en este fichero seria justo el duplicado
//     que la escalera existe para evitar.
//   - NO confirma nada. Que el gesto se entregue no significa que la pantalla
//     cambiara: eso lo dice la mirada siguiente (A1), no este fichero.
//   - NO adivina coordenadas. El punto lo trae A3 desde la caja que se vio.
//
// Sobre los dos caminos del toque: primero se busca el nodo por su id en el
// arbol VIVO y se usa `ACTION_CLICK` (que es el gesto que la app entiende,
// respeta estados y no depende de pixeles); si el nodo ya no esta (la lista se
// reciclo, el dialogo cambio), se usa el punto que se vio. Los dos caminos van
// al MISMO objetivo; lo que no se hace nunca es tocar otro nodo "parecido".
//
// API de Android usada (ni una inventada):
//   AccessibilityService.dispatchGesture, performGlobalAction,
//   GLOBAL_ACTION_BACK, rootInActiveWindow, getChild, childCount,
//   viewIdResourceName, getBoundsInScreen, isVisibleToUser, isEnabled,
//   isEditable, performAction, ACTION_CLICK, ACTION_FOCUS, ACTION_SET_TEXT,
//   ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, recycle,
//   GestureDescription.Builder, GestureDescription.StrokeDescription, Path,
//   Bundle, Handler, Looper, CountDownLatch, TimeUnit, Resources.
//
// Para que esto funcione hace falta que `Accesibilidad` siga declarado como
// servicio de accesibilidad en el manifiesto (ver la cabecera de
// `Accesibilidad.kt`) y que el sistema tenga el servicio ACTIVO: sin servicio no
// hay `dispatchGesture` ni arbol, y todo devuelve `Fallo("servicio_no_activo")`.

package online.enki.instagram

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityNodeInfo
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Lo que devuelve un gesto: entregado o el motivo por el que no.
 *
 * `Fallo` NO dice "no paso nada en el mundo": dice que el gesto no se pudo
 * entregar. Quien llama (A3) lo convierte en `EfectoEnElMundo.Indeterminado`, y
 * A5 no lo reintenta, porque en el borde nunca se sabe si el toque llego a
 * entrar antes de que el sistema lo cancelara.
 */
sealed class Entrega {
    /** El gesto se entrego al aparato. */
    data class Entregado(val via: String) : Entrega()

    /** No se pudo entregar. `motivo` viaja tal cual hasta el informe. */
    data class Fallo(val motivo: String) : Entrega()
}

/**
 * A3 · la mano, lado Android. Sin estado propio: cada llamada mira el arbol
 * vivo, actua una vez y contesta.
 *
 * Se usa como objeto porque no guarda nada entre gestos; el estado del bucle
 * (que paso toca, que foto es la ultima) vive en el crate.
 */
object Gestos {

    // ---- vocabulario compartido con el crate ------------------------------

    /** Distancia por defecto de un desplazar sin distancia: espejo del crate. */
    const val DISTANCIA_POR_DEFECTO = 600

    /** Cuanto se espera a que el sistema confirme un gesto, como maximo. */
    const val ESPERA_DE_GESTO_MS = 1_500L

    /** Duracion del toque. Un toque instantaneo (0 ms) no siempre lo registra la app. */
    const val DURACION_DE_TOQUE_MS = 60L

    /**
     * Duracion del trazo por cada 1000 px de recorrido. Un desplazamiento
     * demasiado rapido lo lee la app como un "fling" (y salta media lista); uno
     * demasiado lento, como un arrastre manual (y mueve un pixel). 250 ms por
     * 1000 px es un deslizamiento de dedo normal.
     */
    const val DURACION_DE_DESPLAZAMIENTO_POR_1000PX_MS = 250L

    /** Motivos que este lado puede declarar. Nombres estables, sin tildes. */
    const val MOTIVO_SIN_SERVICIO = "servicio_no_activo"
    const val MOTIVO_GESTO_CANCELADO = "gesto_cancelado"
    const val MOTIVO_GESTO_SIN_RESPUESTA = "gesto_sin_respuesta"
    const val MOTIVO_NODO_NO_LOCALIZADO = "nodo_no_localizado"
    const val MOTIVO_NODO_NO_EDITABLE = "nodo_no_editable"
    const val MOTIVO_TEXTO_VACIO = "texto_vacio"
    const val MOTIVO_DIRECCION_DESCONOCIDA = "direccion_desconocida"
    const val MOTIVO_DISTANCIA_INVALIDA = "distancia_invalida"
    const val MOTIVO_SIN_COMPONENTE = "sin_componente"
    /** El nodo esta, pero el aparato no lo da por tocable (bloque 19d). */
    const val MOTIVO_NO_TOCABLE = "no_tocable"
    /** No hay ningun campo con el foco de entrada: no se escribe a ciegas. */
    const val MOTIVO_CAMPO_NO_ENFOCADO = "campo_no_enfocado"
    /** Un toque por coordenadas sin punto valido: (-1,-1) es tocar el borde. */
    const val MOTIVO_PUNTO_INVALIDO = "punto_invalido"

    /** El servicio vivo, o null. Lo publica `Accesibilidad` al conectarse. */
    private fun servicio(): AccessibilityService? = Accesibilidad.instancia()

    // ---- el catalogo cerrado ---------------------------------------------

    /**
     * TOCAR. Primer camino: `ACTION_CLICK` sobre el nodo con ese id (el gesto
     * que la app entiende). Segundo: un toque en el punto que se vio.
     */
    fun tocar(id: String, punto: Pair<Int, Int>): Entrega {
        val servicio = servicio() ?: return Entrega.Fallo(MOTIVO_SIN_SERVICIO)

        // El punto se recalcula sobre el nodo VIVO: la caja que se vio puede haberse
        // movido (un aviso, la barra de estado) y el gesto de coordenadas tiene que
        // caer DENTRO del boton que se quiere, no donde estaba hace un segundo. El
        // centro, igual que en el crate: `Caja.centro()`.
        var centro = punto

        val nodo = buscarNodo(servicio, id)
        if (nodo != null) {
            try {
                // Un nodo que no es clickable NO se toca: ni el, ni su padre "que
                // seguro que recibe el toque". El padre de un boton de Instagram
                // suele ser la barra entera, y ahi se toca lo que no era.
                if (!nodo.isClickable) return Entrega.Fallo(MOTIVO_NO_TOCABLE)

                val caja = Rect()
                nodo.getBoundsInScreen(caja)
                if (caja.width() > 0 && caja.height() > 0) {
                    centro = Pair(caja.centerX(), caja.centerY())
                }

                if (nodo.isEnabled && nodo.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                    return Entrega.Entregado("nodo")
                }
            } finally {
                reciclar(nodo)
            }
        }

        // Un toque por coordenadas sin punto es tocar (0,0), que es la esquina de la
        // pantalla. Se nombra en vez de hacerlo.
        if (centro.first < 0 || centro.second < 0) return Entrega.Fallo(MOTIVO_PUNTO_INVALIDO)
        return gestoDeToque(servicio, centro.first, centro.second)
    }

    /**
     * ESCRIBIR. Rellena el nodo por su id (o, si el id ya no esta, por la caja
     * que se vio). Sin nodo no se escribe: un texto tecleado a ciegas cae en el
     * campo que tenga el foco, que puede ser el de la bio de la cuenta.
     */
    fun escribir(id: String, punto: Pair<Int, Int>, texto: String): Entrega {
        val servicio = servicio() ?: return Entrega.Fallo(MOTIVO_SIN_SERVICIO)
        if (texto.isEmpty()) return Entrega.Fallo(MOTIVO_TEXTO_VACIO)

        val nodo = buscarNodo(servicio, id) ?: buscarNodoPorPunto(servicio, punto)
        ?: return Entrega.Fallo(MOTIVO_NODO_NO_LOCALIZADO)

        try {
            if (!nodo.isEditable) return Entrega.Fallo(MOTIVO_NODO_NO_EDITABLE)

            // El foco primero: `ACTION_SET_TEXT` funciona igual sin el, pero
            // varias apps solo refrescan el contador de caracteres al tenerlo.
            nodo.performAction(AccessibilityNodeInfo.ACTION_FOCUS)

            val args = Bundle()
            args.putCharSequence(
                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                texto
            )
            val ok = nodo.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            return if (ok) Entrega.Entregado("set_text") else Entrega.Fallo(MOTIVO_NODO_NO_EDITABLE)
        } finally {
            reciclar(nodo)
        }
    }

    /**
     * ESCRIBIR EN EL CAMPO ENFOCADO (bloque 19d).
     *
     * El paso `escribir` del bus NO trae id ni punto: trae el texto y nada mas. Quien
     * sabe que campo tiene el foco es el aparato (`findFocus(FOCUS_INPUT)`), y si no
     * hay ninguno se contesta `campo_no_enfocado` y **no se escribe nada**: teclear
     * en el campo que resulte tener el foco es como se escribe en la bio de la
     * cuenta o en el buscador.
     *
     * Es un camino aparte de `escribir(id, punto, texto)` a proposito: aquel rellena
     * UN nodo que se vio, este rellena el que el usuario (o el paso anterior) enfoco.
     */
    fun escribirEnFoco(texto: String): Entrega {
        val servicio = servicio() ?: return Entrega.Fallo(MOTIVO_SIN_SERVICIO)
        if (texto.isEmpty()) return Entrega.Fallo(MOTIVO_TEXTO_VACIO)

        val nodo = servicio.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            ?: return Entrega.Fallo(MOTIVO_CAMPO_NO_ENFOCADO)

        try {
            // Un campo que no es editable con el foco de entrada no es un campo de
            // texto: se dice, no se fuerza.
            if (!nodo.isEditable) return Entrega.Fallo(MOTIVO_CAMPO_NO_ENFOCADO)

            nodo.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
            val args = Bundle()
            args.putCharSequence(
                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                texto
            )
            val ok = nodo.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            return if (ok) Entrega.Entregado("set_text_foco") else Entrega.Fallo(MOTIVO_CAMPO_NO_ENFOCADO)
        } finally {
            reciclar(nodo)
        }
    }

    /**
     * DESPLAZAR. Un trazo desde el centro de la pantalla en la direccion pedida.
     *
     * La distancia la manda la receta (o el defecto del crate); aqui solo se
     * comprueba que quepa en pantalla, porque un trazo que se sale del borde se
     * cancela y el gesto no ocurre.
     */
    fun desplazar(direccion: String, distancia: Int): Entrega {
        val servicio = servicio() ?: return Entrega.Fallo(MOTIVO_SIN_SERVICIO)
        if (distancia <= 0) return Entrega.Fallo(MOTIVO_DISTANCIA_INVALIDA)

        val metricas = servicio.resources.displayMetrics
        val cx = metricas.widthPixels / 2
        val cy = metricas.heightPixels / 2

        // Se recorta a un tercio de la pantalla por eje: mas alla, el trazo se
        // sale y el sistema lo cancela (que seria un fallo sin motivo claro).
        val mitad = when (direccion.trim().lowercase()) {
            "arriba", "abajo" -> minOf(distancia / 2, metricas.heightPixels / 6)
            "izquierda", "derecha" -> minOf(distancia / 2, metricas.widthPixels / 6)
            else -> return Entrega.Fallo(MOTIVO_DIRECCION_DESCONOCIDA)
        }
        if (mitad <= 0) return Entrega.Fallo(MOTIVO_DISTANCIA_INVALIDA)

        val path = Path()
        val (dx, dy) = when (direccion.trim().lowercase()) {
            // El dedo va al contrario de lo que se quiere ver: para ver lo de
            // abajo se desliza hacia arriba. La direccion de la receta es la
            // del CONTENIDO, que es como la piensa una persona.
            "arriba" -> Pair(0, mitad)
            "abajo" -> Pair(0, -mitad)
            "izquierda" -> Pair(mitad, 0)
            else -> Pair(-mitad, 0)
        }
        path.moveTo((cx - dx).toFloat(), (cy - dy).toFloat())
        path.lineTo((cx + dx).toFloat(), (cy + dy).toFloat())

        val duracion = maxOf(
            DURACION_DE_TOQUE_MS,
            (2L * mitad / 1000L) * DURACION_DE_DESPLAZAMIENTO_POR_1000PX_MS
        )
        return lanzarTrazo(servicio, path, duracion, "trazo")
    }

    /**
     * ESPERAR. Duerme el hilo que llama.
     *
     * Es bloqueante a proposito: el bucle de `publicar` es secuencial, y un
     * `esperar` asincrono permitiria que el paso siguiente empezara antes de
     * que la pantalla se asentara — justo lo que el `esperar` de la receta
     * existe para impedir. Quien llama NO es el hilo de UI.
     */
    fun esperar(ms: Long): Entrega {
        if (ms <= 0) return Entrega.Fallo(MOTIVO_DISTANCIA_INVALIDA)
        return try {
            Thread.sleep(ms)
            Entrega.Entregado("espera")
        } catch (interrumpido: InterruptedException) {
            Thread.currentThread().interrupt()
            Entrega.Fallo(MOTIVO_GESTO_CANCELADO)
        }
    }

    /**
     * ATRAS. El mecanismo de la decision `volver` de A5.
     *
     * A5 decide que hay que retroceder; esto solo pulsa el boton del sistema.
     * Va aparte del catalogo de acciones a proposito: `volver` no es una accion
     * de la receta (la receta no puede pedir "deshaz"), es una salida de la
     * escalera.
     */
    fun atras(): Entrega {
        val servicio = servicio() ?: return Entrega.Fallo(MOTIVO_SIN_SERVICIO)
        val ok = servicio.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
        return if (ok) Entrega.Entregado("atras") else Entrega.Fallo(MOTIVO_GESTO_CANCELADO)
    }

    // ---- el gesto de verdad ----------------------------------------------

    private fun gestoDeToque(servicio: AccessibilityService, x: Int, y: Int): Entrega {
        val path = Path()
        path.moveTo(x.toFloat(), y.toFloat())
        return lanzarTrazo(servicio, path, DURACION_DE_TOQUE_MS, "coordenada")
    }

    /**
     * Lanza un trazo y ESPERA su desenlace.
     *
     * Se espera porque el crate necesita saber si el gesto ocurrio para decidir
     * el `EfectoEnElMundo`: si volviera "quizas", A3 tendria que mentir en una
     * direccion o en la otra. `onCancelled` es el caso indeterminado de verdad.
     */
    private fun lanzarTrazo(
        servicio: AccessibilityService,
        path: Path,
        duracionMs: Long,
        via: String
    ): Entrega {
        val gesto = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0L, duracionMs))
            .build()

        val cerrojo = CountDownLatch(1)
        // `true` = completado, `false` = cancelado. Se escribe desde el hilo
        // principal y se lee tras el cerrojo: el `CountDownLatch` ya publica la
        // escritura, por eso no hace falta nada mas.
        val completado = booleanArrayOf(false)

        val callback = object : AccessibilityService.GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                completado[0] = true
                cerrojo.countDown()
            }

            override fun onCancelled(gestureDescription: GestureDescription?) {
                completado[0] = false
                cerrojo.countDown()
            }
        }

        val despachado = servicio.dispatchGesture(gesto, callback, Handler(Looper.getMainLooper()))
        if (!despachado) return Entrega.Fallo(MOTIVO_GESTO_CANCELADO)

        val llego = try {
            cerrojo.await(duracionMs + ESPERA_DE_GESTO_MS, TimeUnit.MILLISECONDS)
        } catch (interrumpido: InterruptedException) {
            Thread.currentThread().interrupt()
            return Entrega.Fallo(MOTIVO_GESTO_CANCELADO)
        }

        // Ni completado ni cancelado: el sistema no contesto. No se puede saber
        // si el gesto llego a ocurrir, y el motivo lo dice con esas palabras.
        if (!llego) return Entrega.Fallo(MOTIVO_GESTO_SIN_RESPUESTA)
        return if (completado[0]) Entrega.Entregado(via) else Entrega.Fallo(MOTIVO_GESTO_CANCELADO)
    }

    // ---- localizar el nodo en el arbol VIVO ------------------------------

    /**
     * Busca un nodo por su id (`viewIdResourceName` completo, o la parte final
     * si el id es corto). Compara, no adivina: no hay parecidos ni prefijos
     * sueltos.
     */
    private fun buscarNodo(servicio: AccessibilityService, id: String): AccessibilityNodeInfo? {
        if (id.isEmpty()) return null
        val raiz = servicio.rootInActiveWindow ?: return null
        return try {
            buscarEnArbol(raiz, id)
        } finally {
            reciclar(raiz)
        }
    }

    @Suppress("DEPRECATION")
    private fun buscarEnArbol(nodo: AccessibilityNodeInfo, id: String): AccessibilityNodeInfo? {
        if (!nodo.isVisibleToUser) return null

        val propio = nodo.viewIdResourceName
        if (propio != null && (propio == id || propio.endsWith(":id/$id"))) {
            // `obtain()` porque el llamante va a reciclar lo que recibe y este
            // nodo lo devuelve el arbol (que tambien se recicla arriba).
            return AccessibilityNodeInfo.obtain(nodo)
        }

        for (i in 0 until nodo.childCount) {
            val hijo = nodo.getChild(i) ?: continue
            try {
                val hallado = buscarEnArbol(hijo, id)
                if (hallado != null) return hallado
            } finally {
                reciclar(hijo)
            }
        }
        return null
    }

    /**
     * Busca el nodo cuya caja CONTIENE el punto que se vio, y solo si es
     * editable. Es el camino de `escribir` cuando el id ya no esta: la misma
     * caja, no una parecida.
     */
    private fun buscarNodoPorPunto(
        servicio: AccessibilityService,
        punto: Pair<Int, Int>
    ): AccessibilityNodeInfo? {
        val raiz = servicio.rootInActiveWindow ?: return null
        return try {
            buscarEditableEn(raiz, punto.first, punto.second)
        } finally {
            reciclar(raiz)
        }
    }

    @Suppress("DEPRECATION")
    private fun buscarEditableEn(
        nodo: AccessibilityNodeInfo,
        x: Int,
        y: Int
    ): AccessibilityNodeInfo? {
        if (!nodo.isVisibleToUser) return null

        val caja = Rect()
        nodo.getBoundsInScreen(caja)
        val dentro = x >= caja.left && x <= caja.right && y >= caja.top && y <= caja.bottom
        if (dentro && nodo.isEditable) return AccessibilityNodeInfo.obtain(nodo)

        for (i in 0 until nodo.childCount) {
            val hijo = nodo.getChild(i) ?: continue
            try {
                val hallado = buscarEditableEn(hijo, x, y)
                if (hallado != null) return hallado
            } finally {
                reciclar(hijo)
            }
        }
        return null
    }

    /**
     * `recycle()` esta deprecado desde API 33 y sigue haciendo falta antes. La
     * misma regla que en `Accesibilidad.kt`, para no reciclar dos veces.
     */
    @Suppress("DEPRECATION")
    private fun reciclar(nodo: AccessibilityNodeInfo) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) nodo.recycle()
    }
}
