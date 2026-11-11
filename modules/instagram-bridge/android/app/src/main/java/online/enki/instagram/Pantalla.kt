// PENDIENTE DE COMPILAR EN EL PORTATIL (no hay Android SDK en el servidor)
//
// Pantalla.kt — que hay delante de la camara, sin interpretar los textos.
//
// Lo que hace: decir si la ventana activa es la de Instagram, si es la pantalla
// de ENTRADA (la que prueba que no hay sesion) y con que calidad se pudo mirar.
// Alimenta D1 (PulsoDeSesion) con la unica evidencia de muerte que el aparato
// puede dar por si mismo: `pantalla_de_entrada`.
//
// Lo que NO hace, a proposito:
//   - NO adivina la pantalla mirando textos ("si hay un corazon, es el feed"). La
//     pantalla la DECLARA el cerebro (`pantallaDeclarada`) y esta pieza solo
//     comprueba que la ventana es de la app. Adivinar por textos es como se
//     publica en la pantalla equivocada.
//   - NO convierte "no veo nada" en "pantalla desconocida y ya esta": si no se
//     pudo mirar, la mirada es `parcial` y el motivo se nombra (`arbol_vacio`,
//     `ocupado`, `sin_sesion`). Un motivo ausente es una laguna disfrazada.
//   - NO confunde "no veo la pantalla de entrada" con "hay sesion": la ausencia
//     de una prueba no es la prueba contraria. Si no se pudo mirar, esto devuelve
//     `pantallaDeEntrada = false` con `mirada = parcial`, y el crate lo trata como
//     `no_se`, no como vida.
//
// La deteccion de entrada es una TABLA CERRADA de prefijos de view-id de la app.
// Si Instagram cambia los ids, el puente deja de reconocer la entrada: se vera
// como una pantalla desconocida y D1 dira `no_se` (mirar otra vez), que es el
// lado seguro. Lo que nunca hara es "parecerse" a la pantalla de entrada.
//
// API de Android usada (ni una inventada): AccessibilityNodeInfo.getPackageName,
// getViewIdResourceName, getChild, childCount, recycle, JSONObject.

package online.enki.instagram

import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject

/**
 * Las pantallas que el contrato conoce, espejo de `PANTALLAS` de `core/formas.js`.
 * `DESCONOCIDA` no es un cajon: es la respuesta honesta a "no se declaro cual es".
 */
object Pantallas {
    const val PERFIL = "perfil"
    const val INICIO = "inicio"
    const val CREAR = "crear"
    const val DM = "dm"
    const val COMENTARIOS = "comentarios"
    const val DESCONOCIDA = "desconocida"

    val TODAS = listOf(PERFIL, INICIO, CREAR, DM, COMENTARIOS, DESCONOCIDA)

    /** Una pantalla declarada que no esta en la lista no se acepta: se degrada. */
    fun canonica(declarada: String?): String =
        if (declarada != null && TODAS.contains(declarada)) declarada else DESCONOCIDA
}

/**
 * Lo que se pudo afirmar de la pantalla.
 *
 * `mirada` es `completa` o `parcial` (espejo de `Mirada` del crate). `motivo` solo
 * viaja cuando la mirada es parcial.
 */
data class LecturaDePantalla(
    val pantalla: String,
    val mirada: String,
    val motivo: String?,
    val pantallaDeEntrada: Boolean,
    val ventanaDeLaApp: Boolean
) {
    fun json(): JSONObject = JSONObject().apply {
        put("pantalla", pantalla)
        put("mirada", mirada)
        put("motivo", motivo ?: JSONObject.NULL)
        put("pantalla_de_entrada", pantallaDeEntrada)
        put("ventana_de_la_app", ventanaDeLaApp)
    }
}

/**
 * La lectura de pantalla. Sin estado: cada llamada mira el arbol que le dan y
 * contesta; el arbol vivo lo tiene el servicio de accesibilidad.
 */
object Pantalla {

    /**
     * Prefijos de view-id que la app usa en su pantalla de entrada. Lista CERRADA
     * y comparada por PREFIJO EXACTO sobre el id completo
     * (`com.instagram.android:id/login_...`).
     *
     * Anadir uno es una decision: cada prefijo de mas puede declarar "sin sesion"
     * una pantalla que si la tenia, y eso manda a una persona a teclear la
     * contrasena sin motivo.
     */
    private val PREFIJOS_DE_ENTRADA = listOf(
        "com.instagram.android:id/login_",
        "com.instagram.android:id/ig_login_",
        "com.instagram.android:id/checkpoint_",
        "com.instagram.android:id/two_factor_",
        "com.instagram.android:id/landing_"
    )

    /** Motivos de mirada parcial, espejo de `SinMirada` del crate. */
    const val MOTIVO_ARBOL_VACIO = "arbol_vacio"
    const val MOTIVO_OCUPADO = "ocupado"
    const val MOTIVO_SIN_SESION = "sin_sesion"

    /**
     * ¿La ventana activa es la de Instagram? Sin `root` no hay ventana: `false`.
     */
    fun hayVentanaDeLaApp(root: AccessibilityNodeInfo?): Boolean =
        root?.packageName?.toString() == PrimerPlano.PAQUETE_INSTAGRAM

    /**
     * ¿Se ve la pantalla de entrada? Recorre el arbol buscando un view-id que
     * empiece por uno de los prefijos cerrados.
     *
     * Devuelve `false` tanto si la pantalla no es de entrada como si no se pudo
     * leer: quien decide si eso es duda o vida es D1, con la `mirada` delante.
     */
    fun esPantallaDeEntrada(root: AccessibilityNodeInfo?): Boolean {
        if (root == null) return false
        val pendientes = ArrayDeque<AccessibilityNodeInfo>()
        pendientes.addLast(root)
        var visitados = 0
        while (pendientes.isNotEmpty() && visitados < LIMITE_DE_NODOS) {
            val nodo = pendientes.removeFirst()
            visitados += 1
            val id = nodo.viewIdResourceName
            if (id != null && PREFIJOS_DE_ENTRADA.any { id.startsWith(it) }) return true
            for (i in 0 until nodo.childCount) {
                val hijo = nodo.getChild(i) ?: continue
                pendientes.addLast(hijo)
            }
        }
        return false
    }

    /**
     * La lectura completa.
     *
     * @param root arbol vivo (o `null` si no se pudo leer)
     * @param pantallaDeclarada la que el cerebro declaro para esta operacion
     */
    fun leer(root: AccessibilityNodeInfo?, pantallaDeclarada: String?): LecturaDePantalla {
        val ventana = hayVentanaDeLaApp(root)

        if (root == null) {
            // Sin arbol no se sabe nada: ni pantalla, ni entrada, ni sesion.
            return LecturaDePantalla(
                pantalla = Pantallas.DESCONOCIDA,
                mirada = "parcial",
                motivo = MOTIVO_ARBOL_VACIO,
                pantallaDeEntrada = false,
                ventanaDeLaApp = false
            )
        }

        if (!ventana) {
            return LecturaDePantalla(
                pantalla = Pantallas.DESCONOCIDA,
                mirada = "parcial",
                motivo = MOTIVO_OCUPADO,
                pantallaDeEntrada = false,
                ventanaDeLaApp = false
            )
        }

        val entrada = esPantallaDeEntrada(root)
        if (entrada) {
            // La pantalla de entrada es EVIDENCIA de que no hay sesion; la
            // pantalla en si no es ninguna de las declaradas.
            return LecturaDePantalla(
                pantalla = Pantallas.DESCONOCIDA,
                mirada = "completa",
                motivo = MOTIVO_SIN_SESION,
                pantallaDeEntrada = true,
                ventanaDeLaApp = true
            )
        }

        return LecturaDePantalla(
            pantalla = Pantallas.canonica(pantallaDeclarada),
            mirada = if (pantallaDeclarada != null && Pantallas.TODAS.contains(pantallaDeclarada)) {
                "completa"
            } else {
                // Ventana de la app pero sin pantalla declarada: se mira, pero no
                // se afirma cual es.
                "parcial"
            },
            motivo = null,
            pantallaDeEntrada = false,
            ventanaDeLaApp = true
        )
    }

    /** Tope de nodos recorridos: un arbol gigante no puede colgar el servicio. */
    const val LIMITE_DE_NODOS = 400
}
