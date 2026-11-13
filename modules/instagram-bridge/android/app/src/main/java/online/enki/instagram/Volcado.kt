// PENDIENTE DE COMPILAR EN EL PORTATIL (no hay Android SDK en el servidor)
//
// Volcado.kt — la FOTO CRUDA de la pantalla, para poder escribir una receta.
//
// Lo que hace: recorre el arbol de accesibilidad del servicio
// (`Accesibilidad.instancia()`) en preorden y lo serializa a JSON PLANO con los
// campos que hacen falta para escribir una receta de `publicar`: `view_id`,
// `texto`, `desc`, `hint`, las cuatro coordenadas de la caja, y las banderas
// (`tocable`, `editable`, `visible`, `habilitado`, `seleccionado`, `marcado`).
//
// # Por que no reutiliza `Accesibilidad.mirar()`
//
// Porque `mirar()` es la vista de A1 y filtra: salta lo invisible, traduce la
// clase a un `tipo` del crate, se queda con la caja como `{x,y,ancho,alto}` y
// compone un ancla. Todo eso esta bien para DECIDIR y es ciego para ESCRIBIR una
// receta: quien escribe necesita el arbol como el aparato lo declara — incluidos
// los nodos invisibles (que existen y explican por que algo no se puede tocar),
// el `className` de verdad, el `hint`, `isChecked` y `isSelected`.
//
// # Lo que este fichero NO hace
//
//   - NO interpreta: no dice "esto es el boton de publicar". Dice "este nodo
//     tiene este id, este texto y esta caja". La interpretacion es de quien lee
//     el volcado, que es una persona o el cerebro, no el aparato.
//   - NO inventa la actividad: si el sistema no la ha anunciado, va `null` en
//     vez de un nombre plausible. Un volcado con datos inventados es peor que
//     uno con un hueco, porque el hueco se ve.
//   - NO publica: eso es `PuenteNativo.publicarObservacionSeguro(json)` y lo
//     llama `MainActivity`. Aqui solo se mira y se serializa.
//
// # Topes
//
// `LIMITE_DE_NODOS` (4000) y `LIMITE_DE_PROFUNDIDAD` (64) son los mismos topes
// que el crate reconstruye (`mano::arbol_json`). Si el volcado se trunca, se
// marca `"truncado": true` en la cabecera: un volcado recortado que no lo dice
// se leeria como "la pantalla no tenia mas".
//
// API de Android usada (ni una inventada): AccessibilityService.instancia(),
// rootInActiveWindow, AccessibilityNodeInfo.getChild/childCount/className/
// viewIdResourceName/text/contentDescription/hintText/isClickable/isEditable/
// isVisibleToUser/isEnabled/isSelected/isChecked/getBoundsInScreen/recycle,
// Rect, System.currentTimeMillis y org.json (JSONObject/JSONArray), que ya usa
// el resto del modulo y no es una dependencia nueva.

package online.enki.instagram

import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject

object Volcado {

    /** Tope de nodos del volcado: espejo de `LIMITE_DE_NODOS` del crate. */
    const val LIMITE_DE_NODOS = 4000

    /** Tope de profundidad: espejo de `mano::arbol_json::LIMITE_DE_PROFUNDIDAD`. */
    const val LIMITE_DE_PROFUNDIDAD = 64

    /** Cuantos caracteres de `text`/`desc` se conservan. */
    const val TOPE_DE_TEXTO = 120

    /** Motivos estables (sin tildes) que ESTE lado puede declarar. */
    const val MOTIVO_SIN_SERVICIO = "servicio_no_activo"
    const val MOTIVO_SIN_VENTANA = "sin_ventana"

    /** El resultado de un volcado: o hay JSON, o hay motivo. Nunca las dos cosas. */
    sealed class Resultado {
        /**
         * El volcado. `nodos` es lo que de verdad se serializo (no lo que habia)
         * y `truncado` dice si se corto por tope.
         */
        data class Hecho(val json: String, val nodos: Int, val truncado: Boolean) : Resultado()

        /** No se pudo ni mirar: `motivo` es uno de los de arriba. */
        data class Imposible(val motivo: String) : Resultado()
    }

    /**
     * Mira la pantalla AHORA y devuelve el volcado, o el motivo por el que no hay.
     *
     * Cada llamada recorre el arbol entero: no se cachea ni se reutiliza el
     * anterior. Se puede llamar desde un hilo de trabajo (la actividad lo hace
     * asi porque 4000 nodos a JSON no son trabajo para el hilo de la UI).
     */
    fun leer(): Resultado {
        val servicio = Accesibilidad.instancia()
            ?: return Resultado.Imposible(MOTIVO_SIN_SERVICIO)
        val ventana = servicio.rootInActiveWindow
            ?: return Resultado.Imposible(MOTIVO_SIN_VENTANA)

        try {
            val nodos = JSONArray()
            val recorrido = Recorrido()

            // Los hijos de la ventana son el nivel 1 (la ventana no es un nodo
            // del arbol de la app: es su contenedor). `padre` a null porque no
            // hay nodo padre que citar; el crate hace lo mismo con la raiz.
            for (i in 0 until ventana.childCount) {
                val hijo = ventana.getChild(i)
                if (hijo == null) {
                    // Un hijo que no se puede leer: el arbol no esta entero. Se
                    // dice, no se finge que no habia hijo.
                    recorrido.truncado = true
                    continue
                }
                try {
                    recorrer(hijo, null, 1, recorrido, nodos)
                } finally {
                    Accesibilidad.reciclarNodo(hijo)
                }
            }

            val raiz = JSONObject()
            poner(raiz, "paquete", texto(ventana.packageName))
            // La actividad la anuncia el sistema en TYPE_WINDOW_STATE_CHANGED;
            // si nunca la anuncio, null (no se adivina por el className).
            poner(raiz, "actividad", texto(servicio.actividadVisible()))
            raiz.put("momento", System.currentTimeMillis())
            raiz.put("truncado", recorrido.truncado)
            raiz.put("nodos", nodos)

            return Resultado.Hecho(raiz.toString(), recorrido.emitidos, recorrido.truncado)
        } finally {
            Accesibilidad.reciclarNodo(ventana)
        }
    }

    // ---- el recorrido -----------------------------------------------------

    /** Lo que se cuenta mientras se recorre: nodos emitidos y si se corto algo. */
    private class Recorrido {
        var emitidos: Int = 0
        var truncado: Boolean = false
    }

    /**
     * Un nodo y su subarbol, en preorden.
     *
     * El `id` de cada nodo es su indice en la lista (0, 1, 2...) y `padre` es el
     * indice del padre: es lo que permite reconstruir el arbol sin repetir ids
     * de `view_id` (que se repiten: hay diez `image_button` iguales).
     *
     * NO se salta lo invisible: un nodo invisible ocupa sitio en el arbol y a
     * veces es la explicacion de por que el boton de al lado no responde. Va con
     * `visible: false` y quien lee decide.
     */
    private fun recorrer(
        nodo: AccessibilityNodeInfo,
        padre: Int?,
        profundidad: Int,
        recorrido: Recorrido,
        salida: JSONArray
    ) {
        if (recorrido.emitidos >= LIMITE_DE_NODOS) {
            recorrido.truncado = true
            return
        }
        if (profundidad > LIMITE_DE_PROFUNDIDAD) {
            // Mas hondo que el tope del crate: se corta y se marca.
            recorrido.truncado = true
            return
        }

        val indice = recorrido.emitidos
        recorrido.emitidos += 1

        val caja = Rect()
        nodo.getBoundsInScreen(caja)

        val obj = JSONObject()
        obj.put("id", indice)
        if (padre == null) obj.put("padre", JSONObject.NULL) else obj.put("padre", padre)
        obj.put("profundidad", profundidad)
        poner(obj, "clase", claseCorta(nodo))
        poner(obj, "view_id", texto(nodo.viewIdResourceName))
        poner(obj, "texto", recortado(nodo.text))
        poner(obj, "desc", recortado(nodo.contentDescription))
        poner(obj, "hint", texto(nodo.hintText))
        obj.put("tocable", nodo.isClickable)
        obj.put("editable", nodo.isEditable)
        obj.put("visible", nodo.isVisibleToUser)
        obj.put("habilitado", nodo.isEnabled)
        obj.put("x1", caja.left)
        obj.put("y1", caja.top)
        obj.put("x2", caja.right)
        obj.put("y2", caja.bottom)
        obj.put("seleccionado", nodo.isSelected)
        obj.put("marcado", nodo.isChecked)
        salida.put(obj)

        for (i in 0 until nodo.childCount) {
            if (recorrido.emitidos >= LIMITE_DE_NODOS) {
                recorrido.truncado = true
                break
            }
            val hijo = nodo.getChild(i)
            if (hijo == null) {
                recorrido.truncado = true
                continue
            }
            try {
                recorrer(hijo, indice, profundidad + 1, recorrido, salida)
            } finally {
                Accesibilidad.reciclarNodo(hijo)
            }
        }
    }

    // ---- textos y cajas ---------------------------------------------------

    /** La clase sin el paquete (`android.widget.Button` -> `Button`), o null. */
    private fun claseCorta(nodo: AccessibilityNodeInfo): String? =
        texto(nodo.className)?.substringAfterLast('.')

    /** Un texto util: recortado, y null si queda vacio (en blanco no es un dato). */
    private fun texto(v: CharSequence?): String? {
        val s = v?.toString()?.trim() ?: return null
        return s.ifEmpty { null }
    }

    /**
     * Un texto recortado a `TOPE_DE_TEXTO` caracteres.
     *
     * Si el corte cae entre los dos mitades de un par suplente, se quita la
     * mitad suelta: un texto partido a la mitad no es UTF-16 valido y ensuciaria
     * el JSON que se pega en Telegram.
     */
    private fun recortado(v: CharSequence?): String? {
        val s = texto(v) ?: return null
        if (s.length <= TOPE_DE_TEXTO) return s
        var corte = s.substring(0, TOPE_DE_TEXTO)
        if (corte.isNotEmpty() && corte.last().isHighSurrogate()) {
            corte = corte.dropLast(1)
        }
        return corte
    }

    /** Pone un texto o `null` de verdad (`JSONObject.NULL`), no la cadena "null". */
    private fun poner(obj: JSONObject, clave: String, valor: String?) {
        if (valor == null) obj.put(clave, JSONObject.NULL) else obj.put(clave, valor)
    }
}
