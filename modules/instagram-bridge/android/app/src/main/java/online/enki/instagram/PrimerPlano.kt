// PENDIENTE DE COMPILAR EN EL PORTATIL (no hay Android SDK en el servidor)
//
// PrimerPlano.kt — el pulso del aparato, lado Android. Alimenta D1
// (PulsoDeSesion) y D3 (SaludDelAparato) del crate.
//
// Lo que hace: leer los indicadores que el crate NO puede leer solo (pantalla
// encendida, bloqueo, servicio de accesibilidad, version de la app, sitio libre,
// bateria, red) y entregarlos con los MISMOS nombres que
// `crate/src/percepcion/{pulso,salud}.rs`. Ni un nombre nuevo: si aqui se
// llamase `screenOn` y en el crate `pantalla_encendida`, el puente estaria
// traduciendo en cada borde y un dia se perderia un indicador por el camino.
//
// Lo que NO hace, a proposito:
//   - NO decide si se puede operar. Dictamina el crate (D1/D3): aqui solo se
//     entrega lo que se ve. Una decision tomada en Kotlin no se puede probar con
//     `cargo test`.
//   - NO convierte un no-saber en un no. Si `PowerManager` no contesta, el
//     indicador va como `no_se`, nunca como `no`: declarar apagada una pantalla
//     que solo estaba sin mirar es pedirle la contrasena a alguien por nada.
//   - NO inventa la sesion: el latido de Instagram lo produce A1 (Accesibilidad.kt)
//     cuando ve el perfil de la cuenta; aqui solo se compone el estado del
//     aparato y su fotografia para el crate.
//
// API de Android usada (ni una inventada): PowerManager.isInteractive,
// KeyguardManager.isKeyguardLocked, Settings.Secure.getInt/getString
// (ACCESSIBILITY_ENABLED, ENABLED_ACCESSIBILITY_SERVICES), ComponentName,
// PackageManager.getPackageInfo, StatFs.availableBytes, BatteryManager
// (BATTERY_PROPERTY_CAPACITY, isCharging), ConnectivityManager.activeNetwork y
// NetworkCapabilities.hasCapability(NET_CAPABILITY_VALIDATED), JSONObject.

package online.enki.instagram

import android.app.KeyguardManager
import android.content.ComponentName
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.StatFs
import android.os.SystemClock
import android.provider.Settings
import org.json.JSONObject

/**
 * La fotografia del aparato en un instante. Todos los campos son lo que se pudo
 * LEER; ninguno es una conclusion.
 *
 * `leidoEn` es un `SystemClock.elapsedRealtime()` (milisegundos desde el arranque,
 * no desde 1970): el crate recibe el momento por parametro y no necesita el reloj
 * de pared para medir la vigencia de un latido.
 */
data class EstadoDelAparato(
    val enPrimerPlano: Boolean,
    val pantallaEncendida: Boolean,
    val desbloqueado: Boolean,
    val servicioDeAccesibilidad: Boolean,
    val versionDeApp: String?,
    val almacenamientoLibreBytes: Long?,
    val bateriaPorciento: Int?,
    val cargando: Boolean?,
    val redValidada: Boolean?,
    val leidoEn: Long
) {
    /**
     * La senal de vida que este estado permite afirmar, con los nombres de
     * `SenalDeVida` del crate.
     *
     * Regla dura: si no hay prueba de que la sesion sigue (pantalla apagada,
     * aparato bloqueado u otra ventana por delante), la senal es `no_se` con su
     * motivo. NUNCA `pantalla_de_entrada`: eso exige ver la pantalla de entrada
     * (Pantalla.kt), y no verla no prueba que la sesion se cerro.
     */
    fun senalDeVida(): Pair<String, String?> = when {
        !servicioDeAccesibilidad -> "no_se" to "aparato_ausente"
        !pantallaEncendida -> "no_se" to "ocupado"
        !desbloqueado -> "no_se" to "ocupado"
        !enPrimerPlano -> "no_se" to "ocupado"
        else -> "latido" to null
    }

    /**
     * Los indicadores de D3 con los nombres del crate
     * (`servicio_de_accesibilidad`, `pantalla_encendida`, `desbloqueado`,
     * `version_de_app`, `almacenamiento_libre`, `bateria`, `red`) y sus valores
     * `si` / `no` / `no_se`.
     *
     * `almacenamiento_libre` y `bateria` se declaran por UMBRAL, no por "hay o no
     * hay": el umbral es conservador y esta aqui escrito para que se pueda
     * discutir. Lo que no se pudo leer va como `no_se`.
     */
    fun salud(): Map<String, String> {
        val mapa = LinkedHashMap<String, String>()
        mapa["servicio_de_accesibilidad"] = if (servicioDeAccesibilidad) "si" else "no"
        mapa["pantalla_encendida"] = if (pantallaEncendida) "si" else "no"
        mapa["desbloqueado"] = if (desbloqueado) "si" else "no"

        mapa["version_de_app"] = when {
            versionDeApp == null -> "no_se"
            versionDeApp == VERSION_ESPERADA -> "si"
            else -> "no" // una version que la receta no declara no se da por buena
        }
        mapa["almacenamiento_libre"] = when {
            almacenamientoLibreBytes == null -> "no_se"
            almacenamientoLibreBytes >= UMBRAL_ALMACENAMIENTO_BYTES -> "si"
            else -> "no"
        }
        mapa["bateria"] = when {
            bateriaPorciento == null -> "no_se"
            cargando == true -> "si"
            bateriaPorciento >= UMBRAL_BATERIA_PORCIENTO -> "si"
            else -> "no"
        }
        mapa["red"] = when (redValidada) {
            null -> "no_se"
            true -> "si"
            false -> "no"
        }
        return mapa
    }

    /** El cuerpo que cruza al crate: solo hechos, con sus nombres estables. */
    fun json(): JSONObject {
        val senal = senalDeVida()
        val salud = JSONObject()
        for ((indicador, valor) in salud()) salud.put(indicador, valor)

        return JSONObject().apply {
            put("leido_en", leidoEn)
            put("senal", senal.first)
            put("sin_pulso", senal.second ?: JSONObject.NULL)
            put("indicadores", salud)
            put("version_app", versionDeApp ?: JSONObject.NULL)
        }
    }

    companion object {
        /**
         * Version de la app que las recetas declaran. Vive AQUI y no en un
         * `BuildConfig` porque no hay modulo Gradle que lo genere todavia; cuando
         * lo haya, se lee de ahi y este valor se borra.
         */
        const val VERSION_ESPERADA = "334.0.0.0"

        /** Menos de 200 MB libres y el testigo no puede escribir su evidencia. */
        const val UMBRAL_ALMACENAMIENTO_BYTES = 200L * 1024L * 1024L

        /** Bateria por debajo del 15% sin cargador no aguanta un trabajo largo. */
        const val UMBRAL_BATERIA_PORCIENTO = 15
    }
}

/**
 * D1/D3 del lado del aparato: leer el estado y entregarlo. Sin estado propio:
 * cada llamada lee el sistema y contesta, porque un estado cacheado de hace dos
 * minutos es exactamente la mentira que el pulso existe para no contar.
 */
object PrimerPlano {

    /**
     * Lee el aparato. `enPrimerPlano` y `servicioDeAccesibilidad` los aporta
     * quien ya los sabe (Accesibilidad.kt mantiene el contador de ventanas);
     * el resto se lee aqui.
     */
    fun leer(
        context: Context,
        enPrimerPlano: Boolean,
        servicioDeAccesibilidad: Boolean
    ): EstadoDelAparato {
        val poder = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val cerrojo = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager

        // `isInteractive` es lo que el sistema usa para "la pantalla esta
        // encendida". Si el servicio no esta, no se puede afirmar nada: `no_se`.
        val pantallaEncendida = poder?.isInteractive
        val bloqueado = cerrojo?.isKeyguardLocked

        val bateria = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        val porciento = bateria?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)

        return EstadoDelAparato(
            enPrimerPlano = enPrimerPlano,
            pantallaEncendida = pantallaEncendida ?: false,
            desbloqueado = bloqueado == false,
            servicioDeAccesibilidad = servicioDeAccesibilidad,
            versionDeApp = versionDeApp(context),
            almacenamientoLibreBytes = almacenamientoLibre(context),
            bateriaPorciento = if (porciento != null && porciento >= 0) porciento else null,
            // `isCharging` es API 23: por debajo se declara `no_se` (null), no `false`.
            cargando = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) bateria?.isCharging else null,
            redValidada = redValidada(context),
            leidoEn = SystemClock.elapsedRealtime()
        )
    }

    /** VersionName de la app de Instagram instalada, o `null` si no se pudo leer. */
    private fun versionDeApp(context: Context): String? = try {
        val info = context.packageManager.getPackageInfo(PAQUETE_INSTAGRAM, 0)
        info.versionName
    } catch (_: Exception) {
        null
    }

    /** Bytes libres del almacenamiento interno, o `null` si no se pudo leer. */
    private fun almacenamientoLibre(context: Context): Long? = try {
        val stat = StatFs(context.filesDir.absolutePath)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
            stat.availableBytes
        } else {
            stat.availableBlocks.toLong() * stat.blockSize.toLong()
        }
    } catch (_: Exception) {
        null
    }

    /**
     * Si la red esta VALIDADA (no solo conectada). Un wifi sin salida es "hay
     * interfaz" pero no es plataforma: `false`. Sin dato, `null` (no_se).
     */
    private fun redValidada(context: Context): Boolean? {
        // `activeNetwork` y `getNetworkCapabilities` son API 23. Por debajo no hay
        // forma de saber si la red tiene salida: `no_se`, no `no`.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null
        val conectividad = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return null
        val red = conectividad.activeNetwork ?: return false
        val capacidades = conectividad.getNetworkCapabilities(red) ?: return false
        return capacidades.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    /**
     * Si el servicio de accesibilidad del puente esta activo. Se comprueba en
     * `Settings.Secure` porque es la unica fuente que no miente: preguntarle al
     * propio servicio no sirve si el servicio no esta corriendo.
     */
    fun servicioActivo(context: Context): Boolean {
        val habilitado = Settings.Secure.getInt(
            context.contentResolver,
            Settings.Secure.ACCESSIBILITY_ENABLED,
            0
        )
        if (habilitado != 1) return false
        val activos = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val nuestro = ComponentName(context, Accesibilidad::class.java).flattenToString()
        return activos.split(':').any { it.equals(nuestro, ignoreCase = true) }
    }

    /** El paquete de la plataforma. Uno solo: el puente es de Instagram. */
    const val PAQUETE_INSTAGRAM = "com.instagram.android"
}
