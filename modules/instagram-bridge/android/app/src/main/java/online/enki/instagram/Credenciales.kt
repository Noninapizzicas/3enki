// Credenciales.kt — la llave del bus, cifrada en el llavero del aparato (19e).
//
// Lo que hace: guarda la URL y la llave del bus para que el canal pueda volver
// solo despues de que Android mate el proceso. Sin esto, MIUI mataba el servicio
// al abrir Instagram y el dueno tenia que teclear la llave otra vez, a mano, cada
// vez que tocaba el movil.
//
// # Por que el Keystore directo y NO `androidx.security:security-crypto`
//
// El bloque pedia `EncryptedSharedPreferences` (security-crypto 1.1.0-alpha06) y
// dejaba la puerta abierta a usar el Keystore si esa caja no compilaba. Se usa el
// Keystore directo, y no por comodidad:
//
//   1. **Cero dependencias nuevas.** `security-crypto` arrastra Tink y su
//      proveedor, y este APK se compila en un servidor sin Android SDK: aqui no se
//      puede comprobar que resuelva, ni que su version alpha no rompa con
//      `compileSdk 35`. Un build rojo por una caja que solo envuelve lo que ya
//      trae el sistema es un mal cambio.
//   2. **Lo que hace falta son dos secretos, no un almacen.** AES-256-GCM con la
//      clave en `AndroidKeyStore` (que no sale del TEE/StrongBox y no se puede
//      exportar) es exactamente el mismo cifrado que usa por debajo
//      `EncryptedSharedPreferences`, con cincuenta lineas legibles en vez de una
//      caja que hay que auditar.
//   3. **Se puede leer entero y discutirlo.** Aqui no hay magia: clave del
//      Keystore, IV aleatorio por escritura, etiqueta GCM de 128 bits, texto
//      cifrado en Base64 dentro de `SharedPreferences` privadas.
//
// Lo que se guarda es UN blob (`version:iv:dato`) con la url y la llave juntas: dos
// entradas separadas se pueden quedar a medias (url de un bus y llave de otro), y
// un canal con la llave de ayer contra el bus de hoy es un 401 que nadie sabe
// explicar.
//
// # Lo que este fichero NO hace
//
//   - **NO escribe nada en claro.** Ni en `SharedPreferences`, ni en un fichero,
//     ni en el log, ni en la notificacion. Si el cifrado falla, `guardar()`
//     devuelve `false` con motivo y NO cae a un `putString` "provisional".
//   - **NO usa `EncryptedSharedPreferences`** (ver arriba).
//   - **NO pide autenticacion de usuario.** La clave se crea con
//     `setUserAuthenticationRequired(false)`: el servicio en primer plano tiene
//     que poder leerla con la pantalla apagada. Pedir huella seria pedirle al dueno
//     que desbloquee el movil para que el canal se levante solo, que es justo lo
//     contrario de este bloque.
//   - **NO cachea.** Cada `leer()` descifra: son microsegundos y una llave en un
//     `static` de Kotlin es una llave que sobrevive a lo que la borro.
//
// # El modo de fallo que importa
//
// Si la clave del Keystore se invalida (restauracion de una copia de seguridad,
// borrado del llavero por el sistema), el dato cifrado queda ilegible para
// siempre. `leer()` lo detecta, BORRA el blob y devuelve `null` con motivo: un
// dato que no se puede descifrar no es una credencial, es basura que hace creer
// que hay llave. La pantalla vuelve a pedir la llave, que es la verdad.

package online.enki.instagram

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * La llave del bus en el llavero del aparato.
 *
 * `guardar` y `olvidar` son las dos unicas escrituras; `leer` es la unica lectura.
 * Todo lo demas (que se hace con el par url+llave) es de `ServicioEnki` y
 * `MainActivity`.
 */
class Credenciales(contexto: Context) {

    /** Las dos cosas que hacen falta para abrir el canal. */
    data class Par(val url: String, val llave: String)

    companion object {
        /** El alias de la clave en `AndroidKeyStore`. Uno por instalacion. */
        const val ALIAS = "enki_instagram_credenciales"

        /** Donde queda el blob cifrado. `MODE_PRIVATE` y `allowBackup=false`. */
        private const val PREFERENCIAS = "puente_credenciales"
        private const val CLAVE_CIFRADA = "credenciales"

        /** El esquema: `AES/GCM/NoPadding` con IV de 96 bits y etiqueta de 128. */
        private const val TRANSFORMACION = "AES/GCM/NoPadding"
        private const val BITS_DE_ETIQUETA = 128
        private const val VERSION = 1

        /**
         * Los motivos que ESTE lado declara. Estables, sin tildes: viajan a la
         * pantalla y al `motivo` que se lee en la notificacion.
         */
        const val MOTIVO_SIN_DATOS = "faltan_url_o_llave"
        const val MOTIVO_LLAVERO_NO_DISPONIBLE = "llave_no_disponible"
        const val MOTIVO_NO_SE_PUDO_CIFRAR = "no_se_pudo_cifrar"
        const val MOTIVO_NO_SE_PUDO_ESCRIBIR = "no_se_pudo_escribir"
        const val MOTIVO_CREDENCIALES_ILEGIBLES = "credenciales_ilegibles"

        /** Una instancia con el contexto de la aplicacion (no de una Activity). */
        fun de(contexto: Context): Credenciales = Credenciales(contexto.applicationContext)
    }

    private val preferencias =
        contexto.applicationContext.getSharedPreferences(PREFERENCIAS, Context.MODE_PRIVATE)

    /** El ultimo motivo de fallo, o `null`. Para la pantalla. */
    @Volatile
    var ultimoMotivo: String? = null
        private set

    // ---- la API que pide el bloque -----------------------------------------

    /** ¿Hay algo guardado? (No dice si se puede descifrar: eso lo dice `leer`.) */
    fun hay(): Boolean = preferencias.contains(CLAVE_CIFRADA)

    /**
     * Guarda la url y la llave, cifradas.
     *
     * `false` = NO se guardo nada (y el motivo queda en [ultimoMotivo]). Nunca
     * escribe en claro como consuelo.
     */
    fun guardar(url: String, llave: String): Boolean {
        if (url.isBlank() || llave.isBlank()) {
            ultimoMotivo = MOTIVO_SIN_DATOS
            return false
        }

        val claro = try {
            JSONObject().put("url", url.trim()).put("llave", llave.trim()).toString()
        } catch (e: Exception) {
            ultimoMotivo = MOTIVO_NO_SE_PUDO_CIFRAR
            return false
        }

        val cifrado = try {
            cifrar(claro)
        } catch (e: Exception) {
            ultimoMotivo = MOTIVO_LLAVERO_NO_DISPONIBLE + ": " + (e.message ?: e.javaClass.simpleName)
            null
        }
        if (cifrado == null) {
            if (ultimoMotivo == null) ultimoMotivo = MOTIVO_NO_SE_PUDO_CIFRAR
            return false
        }

        // `commit` y no `apply`: el servicio se arranca a continuacion y tiene que
        // encontrar el dato YA escrito. Con `apply` la escritura es asincrona y el
        // canal podria arrancar sin llave en un arranque rapido.
        val escrito = try {
            preferencias.edit().putString(CLAVE_CIFRADA, cifrado).commit()
        } catch (e: Exception) {
            false
        }
        if (!escrito) {
            ultimoMotivo = MOTIVO_NO_SE_PUDO_ESCRIBIR
            return false
        }

        ultimoMotivo = null
        return true
    }

    /**
     * La url y la llave guardadas, o `null` si no hay (o no se pueden descifrar).
     *
     * Un `null` con `hay()` a `true` significa que habia algo y se tiro: se dice en
     * [ultimoMotivo] y se borra, para que la pantalla pida la llave en vez de
     * fingir que la tiene.
     */
    fun leer(): Par? {
        val guardado = try {
            preferencias.getString(CLAVE_CIFRADA, null)
        } catch (e: Exception) {
            null
        }
        if (guardado.isNullOrEmpty()) return null

        val par = try {
            descifrar(guardado)?.let { leerPar(it) }
        } catch (e: Exception) {
            null
        }

        if (par == null) {
            olvidar()
            ultimoMotivo = MOTIVO_CREDENCIALES_ILEGIBLES
        }
        return par
    }

    /**
     * Borra la credencial y la clave del llavero. Idempotente.
     *
     * `false` solo si el llavero no dejo borrar la clave; el blob cifrado se quita
     * igual (sin su clave es ruido, y es lo que se enseña en disco).
     */
    fun olvidar(): Boolean {
        val borrado = try {
            preferencias.edit().remove(CLAVE_CIFRADA).commit()
        } catch (e: Exception) {
            false
        }
        try {
            val llavero = llaveroDelSistema()
            if (llavero.containsAlias(ALIAS)) llavero.deleteEntry(ALIAS)
        } catch (e: Exception) {
            // Un llavero que no deja borrar no invalida el olvido: el dato cifrado
            // ya no esta, que es lo que se lee. Se deja dicho, no se relanza.
            ultimoMotivo = "olvidar_parcial: " + (e.message ?: e.javaClass.simpleName)
        }
        return borrado
    }

    // ---- el cifrado --------------------------------------------------------

    /** `version:iv:datos`, todo en Base64 sin saltos de linea. */
    private fun cifrar(claro: String): String {
        val secreta = clave() ?: throw IllegalStateException(MOTIVO_LLAVERO_NO_DISPONIBLE)
        val cifrador = Cipher.getInstance(TRANSFORMACION)
        // Sin IV explicito: GCM exige uno aleatorio por operacion y lo genera el
        // proveedor (`setRandomizedEncryptionRequired(true)` en la clave).
        cifrador.init(Cipher.ENCRYPT_MODE, secreta)
        val iv = cifrador.iv
        val datos = cifrador.doFinal(claro.toByteArray(Charsets.UTF_8))
        return listOf(
            VERSION.toString(),
            Base64.encodeToString(iv, Base64.NO_WRAP),
            Base64.encodeToString(datos, Base64.NO_WRAP)
        ).joinToString(":")
    }

    /** Lo contrario de [cifrar]. `null` si el blob no tiene la forma esperada. */
    private fun descifrar(guardado: String): String? {
        val partes = guardado.split(":")
        if (partes.size != 3) return null
        if (partes[0].toIntOrNull() != VERSION) return null

        val iv = Base64.decode(partes[1], Base64.NO_WRAP)
        val datos = Base64.decode(partes[2], Base64.NO_WRAP)
        val secreta = claveExistente() ?: return null

        val cifrador = Cipher.getInstance(TRANSFORMACION)
        cifrador.init(Cipher.DECRYPT_MODE, secreta, GCMParameterSpec(BITS_DE_ETIQUETA, iv))
        return String(cifrador.doFinal(datos), Charsets.UTF_8)
    }

    /** El JSON que se cifro, o `null` si le falta la url o la llave. */
    private fun leerPar(claro: String): Par? = try {
        val obj = JSONObject(claro)
        val url = obj.optString("url", "").trim()
        val llave = obj.optString("llave", "").trim()
        if (url.isEmpty() || llave.isEmpty()) null else Par(url, llave)
    } catch (e: Exception) {
        null
    }

    /**
     * La clave del llavero, creandola si es la primera vez.
     *
     * AES-256, GCM, sin relleno, sin autenticacion de usuario (ver la cabecera del
     * fichero). La clave **no sale del Keystore**: lo que devuelve este metodo es
     * un asa; el material criptografico lo usan el TEE o el StrongBox del aparato.
     */
    private fun clave(): SecretKey? {
        claveExistente()?.let { return it }

        val generador = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generador.init(
            KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .setUserAuthenticationRequired(false)
                .build()
        )
        return generador.generateKey()
    }

    /** La clave si ya existe, sin crearla. `null` si el llavero no la tiene. */
    private fun claveExistente(): SecretKey? = try {
        (llaveroDelSistema().getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey
    } catch (e: Exception) {
        null
    }

    /**
     * El llavero del sistema, abierto.
     *
     * `load(null, null)` y no `load(null)`: `KeyStore` no tiene un `load` de UN
     * argumento que acepte un `InputStream` — el de un argumento es el de
     * `LoadStoreParameter`, y pasarle un `InputStream` no compila (y pasarle
     * `null` a ese abre el llavero por otro camino, que no es el que queremos).
     * Aqui no hay fichero ni contrasena: los dos van a `null`.
     */
    private fun llaveroDelSistema(): KeyStore =
        KeyStore.getInstance("AndroidKeyStore").apply { load(null as java.io.InputStream?, null) }
}
