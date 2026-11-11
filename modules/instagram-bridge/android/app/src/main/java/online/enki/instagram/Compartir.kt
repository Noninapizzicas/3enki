// PENDIENTE DE COMPILAR EN EL PORTATIL (no hay Android SDK en el servidor)
//
// Compartir.kt — la puerta del share sheet: publicar pasandole el contenido a la
// app de Instagram con un `Intent.ACTION_SEND`.
//
// Para que sirve: hay caminos de publicacion en los que la mano por
// accesibilidad es fragil (el editor de reels cambia de sitio en cada version) y
// el camino bueno es el que usa una persona: compartir desde la galeria y elegir
// Instagram. Este fichero abre esa puerta.
//
// # Lo que este fichero NO puede decir
//
// ```text
// "compartido" NO es "publicado".
// ```
//
// Un `ACTION_SEND` que sale bien solo significa que el share sheet se abrio con
// el contenido dentro. A partir de ahi la pantalla es del editor de Instagram:
// puede quedarse en el paso de elegir filtro, puede fallar al subir, puede
// pedir un pie de foto. **Nadie puede confirmar desde aqui**. La confirmacion es
// una mirada nueva (A1) a la postcondicion de la receta —que el post aparezca en
// el perfil—, y por eso la operacion `publicar` no da `publicado` sin
// postcondicion vista (`crate/src/mano/publicar.rs`).
//
// Por eso este fichero devuelve `Intento` y nunca `Hecho`: el nombre importa,
// porque el que lea el informe tiene que entender que se abrio una puerta y no
// que se cruzo.
//
// # Lo que NO hace
//
//   - NO rellena el pie de foto por su cuenta: el texto viaja como
//     `EXTRA_TEXT` y es Instagram quien decide donde ponerlo (en el editor, no
//     en el post). Prometer lo contrario seria mentir en el informe.
//   - NO comprueba si la cuenta es la esperada: eso es U1, y ocurre ANTES
//     (`crate/src/mano/exclusividad.rs`). Este fichero no la sustituye.
//   - NO toca la pantalla: si hace falta tocar, es A3 con `Gestos.kt`.
//   - NO reintenta. Si el share sheet no se abre, se declara el motivo y sube:
//     abrir dos veces el editor de Instagram es la forma mas tonta de duplicar
//     un post.
//
// API de Android usada (ni una inventada):
//   Intent.ACTION_SEND, Intent.EXTRA_STREAM, Intent.EXTRA_TEXT,
//   Intent.EXTRA_TITLE, Intent.createChooser, Intent.setPackage,
//   Intent.setType, Intent.setClipData, ClipData.newUri,
//   Intent.FLAG_GRANT_READ_URI_PERMISSION, Intent.FLAG_ACTIVITY_NEW_TASK,
//   Context.startActivity, Context.packageManager, PackageManager.resolveActivity,
//   FileProvider.getUriForFile, Uri, File, MimeTypeMap.
//
// Para que esto funcione hace falta ademas, en el manifiesto (fuera de este
// fichero):
//
//   <provider android:name="androidx.core.content.FileProvider"
//             android:authorities="online.enki.instagram.ficheros"
//             android:exported="false"
//             android:grantUriPermissions="true">
//     <meta-data android:name="android.support.FILE_PROVIDER_PATHS"
//                android:resource="@xml/rutas_ficheros"/>
//   </provider>
//
//   <queries>
//     <package android:name="com.instagram.android"/>
//   </queries>
//
// y `res/xml/rutas_ficheros.xml` con la carpeta que se comparte (por ejemplo
// `<cache-path name="compartir" path="compartir/"/>`). El `<queries>` no es
// opcional desde API 30: sin el, `resolveActivity` no ve Instagram aunque este
// instalado.

package online.enki.instagram

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import java.io.File

/**
 * Lo que devuelve un intento de compartir.
 *
 * Se llama `Intento` y no `Resultado` a proposito: un intento de compartir no
 * es un resultado de publicacion. Para el resultado hay que mirar (A1).
 */
sealed class Intento {
    /** El share sheet (o Instagram) se abrio con el contenido. Nada mas. */
    data class Abierto(val paquete: String?) : Intento()

    /** No se pudo abrir. El motivo viaja tal cual al informe. */
    data class Fallo(val motivo: String) : Intento()
}

/**
 * La puerta del share sheet. Se usa como objeto: no guarda nada entre envios.
 *
 * `contexto` tiene que ser el `AccessibilityService` (o cualquier `Context` de
 * la app); el `Intent` necesita `FLAG_ACTIVITY_NEW_TASK` porque un servicio no
 * tiene tarea propia.
 */
object Compartir {

    // ---- vocabulario ------------------------------------------------------

    /** El paquete al que se dirige el envio directo. */
    const val PAQUETE_INSTAGRAM = "com.instagram.android"

    /** La autoridad del `FileProvider` declarada en el manifiesto. */
    const val AUTORIDAD_FICHEROS = "online.enki.instagram.ficheros"

    /** Carpeta del cache donde se dejan los ficheros que se comparten. */
    const val CARPETA_COMPARTIR = "compartir"

    /** Motivos que este lado puede declarar. Estables y sin tildes. */
    const val MOTIVO_APP_NO_INSTALADA = "app_no_instalada"
    const val MOTIVO_SIN_NADA_QUE_COMPARTIR = "sin_nada_que_compartir"
    const val MOTIVO_FICHERO_INEXISTENTE = "fichero_inexistente"
    const val MOTIVO_SIN_ACTIVIDAD = "sin_actividad_para_compartir"
    const val MOTIVO_CONTEXTO_NULO = "contexto_nulo"

    // ---- las tres formas de compartir -------------------------------------

    /**
     * Compartir SOLO TEXTO. Instagram lo pone en el pie de foto del editor.
     *
     * Se usa cuando la receta es "publicar una nota" y no hay fichero. Si hay
     * imagen, `imagenConTexto` es el camino: un texto sin imagen en Instagram
     * abre otra pantalla distinta.
     */
    fun texto(contexto: Context?, texto: String, titulo: String = "Compartir"): Intento {
        if (contexto == null) return Intento.Fallo(MOTIVO_CONTEXTO_NULO)
        if (texto.isBlank()) return Intento.Fallo(MOTIVO_SIN_NADA_QUE_COMPARTIR)

        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, texto)
            putExtra(Intent.EXTRA_TITLE, titulo)
        }
        return abrirDirecto(contexto, intent)
    }

    /**
     * Compartir UNA IMAGEN. El fichero se convierte a `content://` con el
     * `FileProvider`: un `file://` lanzaria `FileUriExposedException` desde
     * API 24, y un `content://` sin permiso de lectura deja a Instagram sin
     * poder abrirlo (el sheet se abre y la imagen no carga: peor que no abrir).
     */
    fun imagen(contexto: Context?, fichero: File): Intento =
        imagenConTexto(contexto, fichero, null)

    /**
     * Compartir UNA IMAGEN con texto. Es el camino de "publicar foto" de la
     * receta: imagen en `EXTRA_STREAM`, pie en `EXTRA_TEXT`.
     */
    fun imagenConTexto(contexto: Context?, fichero: File, texto: String?): Intento {
        if (contexto == null) return Intento.Fallo(MOTIVO_CONTEXTO_NULO)
        if (!fichero.exists() || !fichero.isFile) return Intento.Fallo(MOTIVO_FICHERO_INEXISTENTE)

        val uri = try {
            FileProvider.getUriForFile(contexto, AUTORIDAD_FICHEROS, fichero)
        } catch (fueraDeRutas: IllegalArgumentException) {
            // El fichero esta fuera de las rutas declaradas en
            // `rutas_ficheros.xml` (`fueraDeRutas` lo dice): el FileProvider se
            // niega, y eso no es un fallo del aparato, es una carpeta mal puesta.
            return Intento.Fallo(MOTIVO_FICHERO_INEXISTENTE)
        }

        val intent = Intent(Intent.ACTION_SEND).apply {
            type = tipoMime(fichero)
            putExtra(Intent.EXTRA_STREAM, uri)
            if (!texto.isNullOrBlank()) putExtra(Intent.EXTRA_TEXT, texto)
            // El permiso de lectura va en el propio Intent: sin el, Instagram
            // recibe un `content://` que no puede abrir.
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            // `setClipData` hace que el permiso viaje tambien en el recorte de
            // la lista de recientes (API 16+); sin el, algunos gestores de
            // archivos lo pierden al intermediar.
            clipData = ClipData.newUri(contexto.contentResolver, "imagen", uri)
        }
        return abrirDirecto(contexto, intent)
    }

    /**
     * Compartir CON LA HOJA DEL SISTEMA en vez de ir directo a Instagram.
     *
     * Es la salida cuando se quiere que una persona elija (o cuando se publica
     * en varias plataformas). El coste es que no se puede fijar el paquete: la
     * hoja decide, y por eso el `Intento` que vuelve no dice a donde fue.
     */
    fun conHoja(contexto: Context?, intent: Intent, titulo: String = "Compartir"): Intento {
        if (contexto == null) return Intento.Fallo(MOTIVO_CONTEXTO_NULO)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val hoja = Intent.createChooser(intent, titulo).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            contexto.startActivity(hoja)
            Intento.Abierto(null)
        } catch (e: Exception) {
            // `ActivityNotFoundException` y compania: no hay con que abrir la
            // hoja en este aparato.
            Intento.Fallo(MOTIVO_SIN_ACTIVIDAD)
        }
    }

    // ---- el lanzamiento directo ------------------------------------------

    /**
     * Abre Instagram con el contenido dentro.
     *
     * Antes de lanzar se comprueba que Instagram este instalado y que haya una
     * actividad que recoja un `ACTION_SEND` de ese tipo. Sin esa comprobacion,
     * `startActivity` lanza `ActivityNotFoundException` y el informe diria
     * "fallo al compartir" en vez de "Instagram no esta en este aparato", que
     * son dos cosas distintas y se arreglan de forma distinta.
     */
    private fun abrirDirecto(contexto: Context, intent: Intent): Intento {
        intent.setPackage(PAQUETE_INSTAGRAM)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        @Suppress("DEPRECATION")
        val resolucion = contexto.packageManager.resolveActivity(intent, 0)
        if (resolucion == null) {
            // Sin `<queries>` en el manifiesto esta comprobacion tambien
            // devuelve null aunque Instagram este: el motivo lo dice tal cual y
            // el informe no se inventa una causa.
            return Intento.Fallo(MOTIVO_APP_NO_INSTALADA)
        }

        return try {
            contexto.startActivity(intent)
            Intento.Abierto(PAQUETE_INSTAGRAM)
        } catch (e: Exception) {
            Intento.Fallo(MOTIVO_SIN_ACTIVIDAD)
        }
    }

    // ---- utilidades -------------------------------------------------------

    /**
     * Tipo MIME por extension.
     *
     * `MimeTypeMap` es lo primero que se consulta; si no lo conoce, la tabla de
     * abajo (que es la misma que probaria un test de escritorio). Y si tampoco,
     * `application/octet-stream`: un tipo inventado hace que Instagram rechace
     * el fichero sin decir por que.
     */
    fun tipoMime(fichero: File): String {
        val extension = fichero.extension.lowercase()
        // Primero lo que sabe el sistema; despues la tabla propia (que sirve en
        // el portatil, donde `MimeTypeMap` no existe). Nunca un tipo inventado.
        val delSistema = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension)
        return delSistema ?: MimeTypeMapFactory.desde(extension) ?: "application/octet-stream"
    }

    /**
     * Sacado a un objeto aparte para poder probarlo en el portatil sin Android
     * (el `MimeTypeMap` del sistema no existe fuera del aparato). La tabla es
     * lo unico de este fichero que no necesita SDK.
     */
    object MimeTypeMapFactory {
        private val TABLA = mapOf(
            "jpg" to "image/jpeg",
            "jpeg" to "image/jpeg",
            "png" to "image/png",
            "webp" to "image/webp",
            "heic" to "image/heic",
            "mp4" to "video/mp4",
            "mov" to "video/quicktime",
            "txt" to "text/plain"
        )

        fun desde(extension: String): String? = TABLA[extension.lowercase()]
    }

    /**
     * La carpeta donde el puente deja lo que va a compartir.
     *
     * Es `cache` y no `files` a proposito: lo compartido es temporal, y el
     * sistema puede limpiarlo cuando falte sitio. Ademas tiene que coincidir con
     * `rutas_ficheros.xml`, o el `FileProvider` se negara a servirla.
     */
    fun carpetaDeCompartir(contexto: Context): File {
        val carpeta = File(contexto.cacheDir, CARPETA_COMPARTIR)
        if (!carpeta.exists()) carpeta.mkdirs()
        return carpeta
    }

    /** El `Uri` de un fichero de la carpeta de compartir, ya autorizado. */
    fun uriDeCompartir(contexto: Context, fichero: File): Uri? = try {
        FileProvider.getUriForFile(contexto, AUTORIDAD_FICHEROS, fichero)
    } catch (noAutorizado: IllegalArgumentException) {
        null
    }
}
