// PENDIENTE DE COMPILAR EN EL PORTATIL (no hay Android SDK en el servidor)
//
// Accesibilidad.kt — el puente ANDROID de A1 (ObservadorDeEstado).
//
// Lo que hace: leer el arbol de accesibilidad de Instagram y entregarlo con la
// MISMA forma que el `Arbol` del crate (`crate/src/percepcion/simulador.rs`), para
// que A1 (observador.rs) lo proyecte a `HechoVisible` sin saber si viene de un
// movil o del simulador. El simulador y este fichero son intercambiables por
// diseno: uno es el arbol falso de los tests, el otro el arbol de verdad.
//
// Lo que NO hace, a proposito:
//   - NO toca la pantalla. Este fichero solo mira; tocar es A3 (Gestos.kt).
//   - NO interpreta. No dice "esto es el boton de publicar": dice "hay un nodo
//     con este texto, en esta caja, y se puede tocar". Si no se puede afirmar
//     algo, se declara la mirada PARCIAL con su motivo, no se adivina.
//   - NO rellena con la lectura anterior: cada `mirar()` construye una instantanea
//     nueva y, si no hay ventana, devuelve `NoSePudo`. El "no rellenes con lo de
//     antes" es la regla dura de A1 y se respeta tambien aqui.
//   - NO inventa la pantalla: `pantalla` sale de lo que el cerebro declare
//     (`declararPantalla`), o es "desconocida". Adivinar la pantalla por los
//     textos seria exactamente la interpretacion que A1 no hace.
//
// Ademas del arbol de A1, este fichero presta al VOLCADO (bloque 19b) lo que solo
// el servicio puede saber: la instancia viva (`instancia()`), la clase de la
// actividad que el sistema anuncio (`actividadVisible()`) y la regla de
// `recycle()` de la version del aparato (`reciclarNodo()`). Nada de eso decide:
// mirar sigue siendo `mirar()`.
//
// API de Android usada (ni una inventada): AccessibilityService,
// AccessibilityNodeInfo, getBoundsInScreen, isClickable, isEnabled, isEditable,
// isVisibleToUser, getText, getContentDescription, getViewIdResourceName,
// getChild, childCount, rootInActiveWindow, recycle.
//
// Para que el servicio arranque hace falta ademas (fuera de este fichero):
//   - `AndroidManifest.xml` con
//       <service android:name=".Accesibilidad"
//                android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
//                android:exported="true">
//         <intent-filter>
//           <action android:name="android.accessibilityservice.AccessibilityService"/>
//         </intent-filter>
//         <meta-data android:name="android.accessibilityservice"
//                    android:resource="@xml/accesibilidad"/>
//       </service>
//   - `res/xml/accesibilidad.xml` con
//       android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged"
//       android:accessibilityFeedbackType="feedbackGeneric"
//       android:canRetrieveWindowContent="true"
//       android:packageNames="com.instagram.android"
//
// El paso a Rust: `json()` devuelve la instantanea como JSON con la forma del
// crate; el borde JNI (bloque 5b) lo entrega a `percepcion` y el observador hace
// el resto. Ese borde NO esta escrito todavia: aqui se entrega el dato, no se
// simula que ya cruza.

package online.enki.instagram

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.graphics.Rect
import android.os.Build
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * A1 · ObservadorDeEstado, lado Android.
 *
 * El servicio vive mientras el sistema lo tenga enganchado; `mirar()` se puede
 * llamar desde el hilo del puente en cualquier momento.
 */
class Accesibilidad : AccessibilityService() {

    // ---- vocabulario compartido con el crate ------------------------------

    companion object {
        /** El unico paquete que este puente mira. */
        const val PAQUETE_INSTAGRAM = "com.instagram.android"

        /** Tope del recorrido: espejo de `LIMITE_DE_NODOS` en el crate. */
        const val LIMITE_DE_NODOS = 4000

        /** Id del nodo raiz sintetico, igual que en el simulador. */
        const val ID_RAIZ = "raiz"

        // Motivos de no-mirada que ESTE lado puede declarar. Son los de
        // `SinMirada` en `percepcion/mod.rs` que se pueden deducir del arbol.
        // Falta `sin_sesion` a proposito: una sesion cerrada sigue teniendo
        // arbol (la pantalla de login), asi que no se puede inferir aqui; quien
        // lo sabe es el cerebro, que conoce la sesion.
        const val MOTIVO_SIN_VENTANA = "aparato_ausente"
        const val MOTIVO_OCUPADO = "ocupado"
        const val MOTIVO_ARBOL_VACIO = "arbol_vacio"

        /** Motivo de una mirada parcial: el arbol no se pudo leer entero. */
        const val MOTIVO_PARCIAL_TRUNCADO = "arbol_truncado"

        @Volatile
        private var viva: Accesibilidad? = null

        /** La instancia enganchada, o null si el servicio no esta vivo. */
        fun instancia(): Accesibilidad? = viva

        /**
         * `recycle()` condicionado a la version del aparato.
         *
         * Obligatorio antes de API 33 y deprecado (el sistema recicla solo)
         * desde 33. Vive aqui, en el companion, porque el volcado (19b) recorre
         * el MISMO arbol y no puede llevar su propia copia de la regla de
         * version: dos copias son dos oportunidades de reciclar dos veces.
         */
        @Suppress("DEPRECATION")
        fun reciclarNodo(nodo: AccessibilityNodeInfo) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) nodo.recycle()
        }
    }

    // ---- formas de dato (espejo de `percepcion`) -------------------------

    /** La caja del nodo en coordenadas de pantalla. Espejo de `Caja` en Rust. */
    data class Caja(val x: Int, val y: Int, val ancho: Int, val alto: Int) {
        fun estaVacia(): Boolean = ancho <= 0 || alto <= 0
        fun centro(): Pair<Int, Int> = Pair(x + ancho / 2, y + alto / 2)
    }

    /** Un nodo visible, aplanado. Espejo de `NodoVisible` en Rust. */
    data class NodoVisible(
        val id: String,
        val padre: String?,
        val profundidad: Int,
        val texto: String?,
        val descripcion: String?,
        val tipo: String,
        val caja: Caja,
        val tocable: Boolean
    ) {
        /** El nombre visible efectivo: el texto y, si no hay, la descripcion. */
        fun ancla(): String? = texto ?: descripcion
    }

    /** La foto entera de una mirada. Espejo de `Arbol` en Rust. */
    data class Instantanea(
        val pantalla: String,
        val plataforma: String,
        val cuentaVisible: String?,
        val mirada: String,
        val motivoSinMirada: String?,
        val momentoMs: Long,
        val nodos: List<NodoVisible>
    )

    /** El resultado de mirar: o hay foto, o hay motivo. Nunca las dos cosas. */
    sealed class Lectura {
        data class Observada(val instantanea: Instantanea) : Lectura()
        data class NoSePudo(val motivo: String) : Lectura()
    }

    // ---- estado declarado por el cerebro ---------------------------------

    /**
     * Que pantalla se esperaba. Lo declara quien pide la mirada (el cerebro sabe
     * en que paso va); si nadie lo declara, es `desconocida`. El puente no la
     * adivina mirando textos: eso seria interpretar.
     */
    @Volatile
    var pantallaDeclarada: String = "desconocida"

    /**
     * Que cuenta se espera ver. Se usa solo para comparar con lo leido; no
     * rellena la lectura si no hay cuenta visible (seria mentir a U1).
     */
    @Volatile
    var cuentaEsperada: String? = null

    /** La ultima instantanea, solo para diagnostico. NO se usa para mirar. */
    @Volatile
    private var ultimaInstantanea: Instantanea? = null

    /**
     * La clase de la ACTIVIDAD que el sistema anuncio por ultimo en un
     * `TYPE_WINDOW_STATE_CHANGED` de Instagram, o null si nunca lo hizo.
     *
     * Se guarda porque es el UNICO sitio del modulo donde ese dato existe: el
     * arbol de accesibilidad no lleva el nombre de la actividad, y el volcado
     * (19b) tiene que poder decir en que pantalla estaba cuando lo tomo. Puede
     * ser la ultima anunciada y no exactamente la de ahora; por eso el volcado
     * lleva tambien `momento` y por eso esto no se usa para decidir nada.
     */
    @Volatile
    private var ultimaActividad: String? = null

    /** La actividad anunciada por el sistema, o null (no se adivina). */
    fun actividadVisible(): String? = ultimaActividad

    /**
     * La ultima foto tomada, para el informe o el log. Se llama `ultima` y no
     * `estado` por el mismo motivo que en el crate: es lo de antes, no lo de
     * ahora. Quien quiera lo de ahora llama a `mirar()`.
     */
    fun ultimaParaDiagnostico(): Instantanea? = ultimaInstantanea

    // ---- ciclo de vida del servicio --------------------------------------

    override fun onServiceConnected() {
        super.onServiceConnected()
        viva = this
    }

    override fun onUnbind(intent: Intent?): Boolean {
        viva = null
        return super.onUnbind(intent)
    }

    override fun onInterrupt() {
        // El sistema retira el servicio: no hay nada que interrumpir aqui, la
        // siguiente llamada a `mirar()` devolvera `NoSePudo(sin_ventana)`.
        viva = null
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Solo se refresca la foto de diagnostico cuando la ventana activa es
        // la de Instagram. No se actua sobre eventos: mirar es a peticion.
        val paquete = event?.packageName?.toString() ?: return
        if (paquete != PAQUETE_INSTAGRAM) return

        // El nombre de la actividad solo lo anuncia el sistema, y solo en este
        // tipo de evento: se apunta para el volcado (19b).
        if (event?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            val clase = event?.className?.toString()?.trim()
            ultimaActividad = if (clase.isNullOrEmpty()) null else clase
        }

        val lectura = mirar()
        if (lectura is Lectura.Observada) ultimaInstantanea = lectura.instantanea
    }

    // ---- MIRAR: el unico metodo que importa ------------------------------

    /**
     * Lee la pantalla AHORA y devuelve la foto, o el motivo por el que no hay.
     *
     * Cada llamada es una foto nueva: no se cachea ni se reutiliza la anterior.
     * Una foto vieja se reconoce por `momentoMs`, no se hace pasar por actual.
     */
    fun mirar(): Lectura {
        val ventana = rootInActiveWindow ?: return Lectura.NoSePudo(MOTIVO_SIN_VENTANA)

        try {
            val paquete = ventana.packageName?.toString()
            if (paquete != PAQUETE_INSTAGRAM) {
                // Hay otra app por delante: no es que no se vea Instagram, es que
                // no esta. Se nombra y no se lee nada de la ventana ajena.
                return Lectura.NoSePudo(MOTIVO_OCUPADO)
            }

            val nodos = ArrayList<NodoVisible>(64)
            val restantes = intArrayOf(LIMITE_DE_NODOS)
            val parcial = booleanArrayOf(false)

            var indice = 0
            for (i in 0 until ventana.childCount) {
                val hijo = ventana.getChild(i)
                if (hijo == null) {
                    // Un hijo que no se puede leer: la mirada es parcial, no
                    // "no habia hijo".
                    parcial[0] = true
                    continue
                }
                try {
                    recorrer(
                        nodo = hijo,
                        padre = ID_RAIZ,
                        profundidad = 1,
                        indice = indice,
                        salida = nodos,
                        restantes = restantes,
                        parcial = parcial
                    )
                } finally {
                    reciclar(hijo)
                }
                indice += 1
            }

            if (nodos.isEmpty()) return Lectura.NoSePudo(MOTIVO_ARBOL_VACIO)

            val motivoParcial: String? = if (parcial[0]) MOTIVO_PARCIAL_TRUNCADO else null

            val instantanea = Instantanea(
                pantalla = pantallaDeclarada,
                plataforma = "instagram",
                cuentaVisible = cuentaVisible(ventana),
                mirada = if (motivoParcial == null) "completa" else "parcial",
                motivoSinMirada = motivoParcial,
                // El reloj vive en el borde: el crate recibe el instante, no lo lee.
                momentoMs = System.currentTimeMillis(),
                nodos = nodos
            )
            ultimaInstantanea = instantanea
            return Lectura.Observada(instantanea)
        } finally {
            reciclar(ventana)
        }
    }

    /**
     * Recorre un nodo y su subarbol en preorden, saltando lo invisible.
     *
     * `restantes` es el presupuesto de nodos y `parcial` la bandera que dice si
     * el arbol se leyo entero. Un `getChild` que devuelve null (nodo reciclado
     * por la app entre dos llamadas) tambien marca la mirada como parcial: no se
     * finge que no habia hijo.
     */
    private fun recorrer(
        nodo: AccessibilityNodeInfo,
        padre: String?,
        profundidad: Int,
        indice: Int,
        salida: MutableList<NodoVisible>,
        restantes: IntArray,
        parcial: BooleanArray
    ) {
        if (restantes[0] <= 0) {
            parcial[0] = true
            return
        }
        // Lo que no se ve no es un hecho, y sus hijos tampoco.
        if (!nodo.isVisibleToUser) return

        restantes[0] -= 1

        val id = nodo.viewIdResourceName ?: "nodo:$padre:$indice:$profundidad"
        val texto = limpio(nodo.text)
        val descripcion = limpio(nodo.contentDescription)

        salida.add(
            NodoVisible(
                id = id,
                padre = padre,
                profundidad = profundidad,
                texto = texto,
                descripcion = descripcion,
                tipo = tipoDe(nodo),
                caja = cajaDe(nodo),
                // `isClickable` no basta: un boton deshabilitado no se puede tocar.
                tocable = nodo.isClickable && nodo.isEnabled
            )
        )

        for (i in 0 until nodo.childCount) {
            if (restantes[0] <= 0) {
                parcial[0] = true
                break
            }
            val hijo = nodo.getChild(i)
            if (hijo == null) {
                parcial[0] = true
                continue
            }
            try {
                recorrer(
                    nodo = hijo,
                    padre = id,
                    profundidad = profundidad + 1,
                    indice = i,
                    salida = salida,
                    restantes = restantes,
                    parcial = parcial
                )
            } finally {
                reciclar(hijo)
            }
        }
    }

    /**
     * De que tipo es el nodo. Solo se mira lo que el aparato declara
     * (`isEditable`, `isClickable`, `className`); no se adivina por el texto.
     */
    private fun tipoDe(nodo: AccessibilityNodeInfo): String {
        val clase = nodo.className?.toString() ?: ""
        return when {
            nodo.isEditable -> "campo"
            clase.contains("EditText") -> "campo"
            nodo.isClickable -> "boton"
            clase.contains("Button") -> "boton"
            clase.contains("TextView") -> "texto"
            clase.contains("ImageView") || clase.contains("ImageButton") -> "imagen"
            else -> "desconocido"
        }
    }

    private fun cajaDe(nodo: AccessibilityNodeInfo): Caja {
        val rect = Rect()
        nodo.getBoundsInScreen(rect)
        // Se guarda tal cual: una caja de tamano cero conserva su posicion y
        // `estaVacia()` la reconoce. No se rellena con valores plausibles.
        return Caja(rect.left, rect.top, rect.width(), rect.height())
    }

    /**
     * La cuenta que se ve, si se ve.
     *
     * Heuristico y declarado como tal: Instagram publica el handle en nodos cuyo
     * `view-id` contiene "username" o en el titulo de la barra. Si no se
     * encuentra, se devuelve null — y null significa "no se vio", que U1 trata
     * como `Indeterminado` y por tanto como parada. Nunca se devuelve
     * `cuentaEsperada` para "completar".
     */
    private fun cuentaVisible(ventana: AccessibilityNodeInfo): String? {
        val pista = buscarPorId(ventana, "username")
            ?: buscarPorId(ventana, "action_bar_title")
            ?: buscarPorId(ventana, "profile_header")
        return pista
    }

    /** Busca el primer nodo cuyo `view-id` contenga la pista y tenga texto. */
    private fun buscarPorId(nodo: AccessibilityNodeInfo, pista: String, saltos: Int = 0): String? {
        if (saltos > LIMITE_DE_NODOS) return null
        // Lo que no se ve no es un hecho: tampoco sirve para leer la cuenta.
        if (!nodo.isVisibleToUser) return null
        val id = nodo.viewIdResourceName
        if (id != null && id.contains(pista, ignoreCase = true)) {
            val texto = limpio(nodo.text) ?: limpio(nodo.contentDescription)
            if (texto != null) return normalizarHandle(texto)
        }
        for (i in 0 until nodo.childCount) {
            val hijo = nodo.getChild(i) ?: continue
            try {
                val hallado = buscarPorId(hijo, pista, saltos + 1)
                if (hallado != null) return hallado
            } finally {
                reciclar(hijo)
            }
        }
        return null
    }

    /** El handle sin `@` y sin espacios: cosmetico, no comparativo. */
    private fun normalizarHandle(v: String): String =
        v.trim().removePrefix("@").trim()

    /** Texto util: recortado y null si queda vacio (un texto en blanco no es un ancla). */
    private fun limpio(v: CharSequence?): String? {
        val s = v?.toString()?.trim() ?: return null
        return if (s.isEmpty()) null else s
    }

    /**
     * `recycle()` esta deprecado desde API 33 (el sistema recicla solo) pero sigue
     * siendo obligatorio en versiones anteriores. Se llama condicionado a la
     * version: ni fuga en Android viejo ni doble reciclado en Android nuevo.
     */
    private fun reciclar(nodo: AccessibilityNodeInfo) = reciclarNodo(nodo)

    // ---- entrega al crate (JSON con la forma de `percepcion`) ------------

    /**
     * La instantanea como JSON. Las claves son EXACTAMENTE las del crate
     * (`pantalla`, `plataforma`, `cuenta_visible`, `mirada`, `motivo_sin_mirada`,
     * `momento`, `nodos[{id,padre,profundidad,ancla,texto,tipo,caja,tocable}]`),
     * para que el borde JNI no tenga que traducir nombres.
     */
    fun json(instantanea: Instantanea): String {
        val sb = StringBuilder(512)
        sb.append('{')
        sb.append("\"lectura\":\"observada\",")
        sb.append("\"pantalla\":").append(escapar(instantanea.pantalla)).append(',')
        sb.append("\"plataforma\":").append(escapar(instantanea.plataforma)).append(',')
        sb.append("\"cuenta_visible\":").append(escapar(instantanea.cuentaVisible)).append(',')
        sb.append("\"mirada\":").append(escapar(instantanea.mirada)).append(',')
        sb.append("\"motivo_sin_mirada\":").append(escapar(instantanea.motivoSinMirada)).append(',')
        sb.append("\"momento\":").append(instantanea.momentoMs).append(',')
        sb.append("\"nodos\":[")
        instantanea.nodos.forEachIndexed { i, nodo ->
            if (i > 0) sb.append(',')
            sb.append('{')
            sb.append("\"id\":").append(escapar(nodo.id)).append(',')
            sb.append("\"padre\":").append(escapar(nodo.padre)).append(',')
            sb.append("\"profundidad\":").append(nodo.profundidad).append(',')
            sb.append("\"ancla\":").append(escapar(nodo.ancla())).append(',')
            sb.append("\"texto\":").append(escapar(nodo.texto)).append(',')
            sb.append("\"tipo\":").append(escapar(nodo.tipo)).append(',')
            sb.append("\"caja\":{")
            sb.append("\"x\":").append(nodo.caja.x).append(',')
            sb.append("\"y\":").append(nodo.caja.y).append(',')
            sb.append("\"ancho\":").append(nodo.caja.ancho).append(',')
            sb.append("\"alto\":").append(nodo.caja.alto)
            sb.append("},")
            sb.append("\"tocable\":").append(nodo.tocable)
            sb.append('}')
        }
        sb.append("]}")
        return sb.toString()
    }

    /**
     * La no-mirada como JSON. No hay nodos: si no se pudo mirar, no se entrega
     * una foto vacia que alguien pueda leer como "pantalla en blanco".
     */
    fun json(lectura: Lectura.NoSePudo): String =
        "{\"lectura\":\"desconocida\",\"motivo\":" + escapar(lectura.motivo) + "}"

    private fun escapar(v: String?): String {
        if (v == null) return "null"
        val sb = StringBuilder(v.length + 2)
        sb.append('"')
        for (c in v) {
            when (c) {
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                else -> if (c.code < 0x20) {
                    sb.append("\\u").append(c.code.toString(16).padStart(4, '0'))
                } else {
                    sb.append(c)
                }
            }
        }
        sb.append('"')
        return sb.toString()
    }
}
