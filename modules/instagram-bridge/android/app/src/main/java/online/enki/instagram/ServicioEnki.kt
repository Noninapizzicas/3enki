// PENDIENTE DE COMPILAR EN EL PORTATIL (no hay Android SDK en el servidor)
//
// ServicioEnki.kt — el servicio en primer plano que mantiene vivo el canal.
//
// Lo que hace: recibe la URL y la llave del bus, abre el canal por JNI y se queda
// delante con una notificacion que dice el estado. Cuando la pantalla se apaga y
// el movil duerme, Android mata cualquier cosa que no sea un servicio en primer
// plano: sin esto el canal dura lo que dura la pantalla encendida.
//
// Ademas enciende y apaga la MANO (`BucleDeMano`, bloque 19a) junto con el canal:
// el crate deja peticiones en una cola y el sondeo las ejecuta. Van juntos porque
// una mano sin canal no tiene a quien contestar y un canal sin mano contesta
// `sin_receta` a todo.
//
// # Lo que NO hace, a proposito
//
//   - NO guarda la llave EN CLARO, y desde el bloque 19e SI la lee de donde esta
//     guardada CIFRADA (`Credenciales.kt`: AES-256-GCM con la clave en
//     `AndroidKeyStore`). Si el `Intent` trae url y llave, se usan; si no (un
//     reinicio del sistema, un `PendingIntent` sin extras), se leen del llavero.
//     Es lo que hace que el canal se levante solo despues de que MIUI mate el
//     proceso.
//   - NO reconecta por su cuenta. La reconexion es del hilo del crate
//     (`canal/reconexion.rs` + el bucle de `jni`): dos bucles de reconexion con la
//     misma llave son dos canales y dos suscripciones, y el broker acaba cerrando
//     el primero. Aqui solo se ENSEÑA el estado que el crate cuenta
//     (`reconectando`, con su intento y sus segundos).
//   - NO arranca tras un reinicio del aparato. `RECEIVE_BOOT_COMPLETED` esta
//     declarado y el llavero ya tiene la llave, pero no hay receptor: Android 12+
//     restringe el arranque de servicios en primer plano desde BOOT_COMPLETED y un
//     arranque que el sistema bloquea a medias es peor que uno que el dueno pide.
//     Volver de una muerte del proceso SI (`START_STICKY`), que es el caso que
//     duele: MIUI matandolo al abrir Instagram.
//   - NO decide si se puede operar. El estado que enseña es el del crate, tal cual.
//
// # Por que `LifecycleService` y no `Service`
//
// El ciclo de vida del canal (arranca, se lee, se para) se puede observar como
// cualquier otro ciclo de Android, y `androidx.lifecycle:lifecycle-service` es la
// dependencia que el bloque pide. Un `Service` pelado obligaria a inventar un
// registro de callbacks propio para lo mismo.
//
// # Hilos
//
// `iniciar()` del crate HACE RED (handshake TLS + CONNECT + SUBACK) y puede tardar
// segundos: se llama en un hilo aparte, nunca en el hilo principal. El vigilante
// que lee el estado corre en el hilo principal cada 3 s y solo toca la
// notificacion, que es una llamada barata.

package online.enki.instagram

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

class ServicioEnki : LifecycleService() {

    companion object {
        /** Abrir el canal. Lleva `EXTRA_URL` y `EXTRA_LLAVE`. */
        const val ACCION_INICIAR = "online.enki.instagram.accion.INICIAR"

        /** Parar el canal y bajar el servicio. */
        const val ACCION_PARAR = "online.enki.instagram.accion.PARAR"

        const val EXTRA_URL = "url"
        const val EXTRA_LLAVE = "llave"

        /** El canal de notificaciones. Uno solo: el estado del puente. */
        const val CANAL_DE_NOTIFICACIONES = "canal_puente"

        /** Id de la notificacion persistente. */
        const val ID_DE_NOTIFICACION = 17

        /** Cada cuanto se relee el estado del crate para la notificacion. */
        private const val CADENCIA_MS = 3_000L

        /**
         * El valor de `canal` con el que el crate dice que esta volviendo
         * (`canal::reconexion::TEXTO_RECONECTANDO`). Se compara por igualdad: si el
         * crate lo renombra, esto deja de casar y la notificacion enseña el valor
         * crudo, que sigue siendo la verdad.
         */
        private const val ESTADO_RECONECTANDO = "reconectando"

        @Volatile
        private var enMarcha: Boolean = false

        @Volatile
        private var estadoDelCanal: String = "detenido"

        @Volatile
        private var motivoDelCanal: String? = null

        /** El reintento en curso y lo que falta, cuando `canal` es `reconectando`. */
        @Volatile
        private var intentoDelCanal: Int = 0

        @Volatile
        private var proximoEnS: Int = 0

        /** ¿Hay un canal abierto (o arrancandose) en este proceso? */
        fun estaEnMarcha(): Boolean = enMarcha

        /** El ultimo estado del canal, tal como lo cuenta el crate. */
        fun estado(): String = estadoDelCanal

        /** El motivo del ultimo fallo, o `null`. */
        fun motivo(): String? = motivoDelCanal

        /** El reintento en curso (0 si no se esta reconectando). */
        fun intento(): Int = intentoDelCanal

        /** Los segundos que faltan para el siguiente intento (0 si no aplica). */
        fun proximoEnS(): Int = proximoEnS
    }

    private val refresco = Handler(Looper.getMainLooper())

    /** Un solo arranque: dos `iniciar` seguidos abririan dos canales. */
    private val arrancando = AtomicBoolean(false)

    /** Lee el estado del crate y refresca la notificacion. Se reprograma solo. */
    private val vigilante = object : Runnable {
        override fun run() {
            leerEstado()
            refresco.postDelayed(this, CADENCIA_MS)
        }
    }

    // ---- ciclo de vida ----------------------------------------------------

    override fun onCreate() {
        super.onCreate()
        crearCanalDeNotificaciones()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)

        // Parar: se cierra el canal y se baja el servicio. `stopSelf` despues de
        // `stopForeground` para no dejar la notificacion huerfana.
        if (intent?.action == ACCION_PARAR) {
            pararCanal()
            return START_NOT_STICKY
        }

        // A partir de aqui el servicio tiene que estar en primer plano: si vino por
        // `startForegroundService`, el sistema da 5 s y despues mata la app.
        subirPrimerPlano()

        val urlDelIntent = intent?.getStringExtra(EXTRA_URL)
        val llaveDelIntent = intent?.getStringExtra(EXTRA_LLAVE)

        // 19e · si el `Intent` no trae credenciales (el sistema rearranca el
        // servicio con `intent == null`, o el `PendingIntent` de la notificacion no
        // lleva extras), se leen del llavero. Es el camino que hace que el canal se
        // levante solo despues de que Android mate el proceso.
        val guardadas = if (urlDelIntent.isNullOrBlank() || llaveDelIntent.isNullOrBlank()) {
            Credenciales.de(this).leer()
        } else {
            null
        }

        val url = if (!urlDelIntent.isNullOrBlank()) urlDelIntent else guardadas?.url
        val llave = if (!llaveDelIntent.isNullOrBlank()) llaveDelIntent else guardadas?.llave

        if (url.isNullOrBlank() || llave.isNullOrBlank()) {
            // Sin url ni llave no hay canal: se dice, se baja la notificacion y se
            // para. Un servicio en primer plano sin nada que hacer es bateria
            // gastada y una notificacion que miente.
            estadoDelCanal = "sin_credenciales"
            motivoDelCanal = "faltan la url o la llave del bus y no hay ninguna guardada: " +
                "el servicio no abre canal sin ellas"
            actualizarNotificacion()
            pararCanal()
            return START_NOT_STICKY
        }

        arrancarCanal(url, llave)

        // `START_STICKY` desde el bloque 19e: si el sistema mata el servicio, el
        // reintento llega con `intent == null` — y ahora eso no es el final, porque
        // las credenciales estan en el llavero (arriba). Antes se devolvia
        // `START_NOT_STICKY` justo porque volver sin llave solo levantaba una
        // notificacion vacia. El canal que se cae se reintenta dentro del crate; lo
        // que esto arregla es la MUERTE DEL PROCESO, que es otra cosa.
        return START_STICKY
    }

    override fun onDestroy() {
        pararCanal()
        super.onDestroy()
    }

    // ---- el canal ---------------------------------------------------------

    /**
     * Abre el canal en un hilo aparte. `iniciar()` hace red: en el hilo principal
     * seria un ANR de manual.
     */
    private fun arrancarCanal(url: String, llave: String) {
        if (!arrancando.compareAndSet(false, true)) return

        // Si ya habia un canal, se cierra ANTES de abrir el siguiente. Dos canales
        // con la misma llave y el mismo client id hacen que el broker cierre el
        // primero, y el sintoma que se ve es "conecta y se cae" sin motivo. El
        // cierre va DENTRO del hilo: `detener()` tambien puede tocar la red.
        val habiaCanal = enMarcha

        enMarcha = true
        estadoDelCanal = "arrancando"
        motivoDelCanal = null
        actualizarNotificacion()

        // La mano se enciende CON el canal, y antes de abrirlo: el crate puede
        // pedir una mirada en cuanto el bus le mande una orden, y una peticion
        // sin sondeo es un plazo agotado esperando a nadie. Si el borde nativo
        // no esta, `arrancar()` devuelve `false` y no pasa nada: el canal
        // funciona igual y la mano contesta `sin_mano`/`sin_receta`.
        BucleDeMano.arrancar()

        Thread({
            if (habiaCanal) {
                PuenteNativo.detenerSeguro()
            }
            val abierto = PuenteNativo.iniciarSeguro(url, llave)
            // `iniciarSeguro` devuelve `true` cuando el hilo del crate arranco, NO
            // cuando el CONNACK llego (el borde no espera al broker: bloquearia el
            // hilo). `conectando` es lo unico que se puede afirmar aqui; el vigilante
            // lee el estado de verdad 3 s despues.
            estadoDelCanal = if (abierto) "conectando" else "sin_canal"
            motivoDelCanal = if (abierto) null else PuenteNativo.ultimoMotivo()
            intentoDelCanal = 0
            proximoEnS = 0

            // La notificacion se toca en el hilo principal, siempre.
            refresco.post {
                arrancando.set(false)
                actualizarNotificacion()
                refresco.removeCallbacks(vigilante)
                refresco.post(vigilante)
            }
        }, "enki-canal").start()
    }

    /** Cierra el canal y baja el servicio. Idempotente. */
    private fun pararCanal() {
        refresco.removeCallbacks(vigilante)
        // La mano se apaga ANTES del canal: si el sondeo esta a mitad de un
        // gesto, que termine (cortarlo dejaria el aparato a medias); y una vez
        // parado, ninguna peticion nueva se queda sin quien la conteste.
        BucleDeMano.parar()
        if (enMarcha) {
            PuenteNativo.detenerSeguro()
        }
        arrancando.set(false)
        enMarcha = false
        estadoDelCanal = "detenido"
        motivoDelCanal = null

        // minSdk 26: `STOP_FOREGROUND_REMOVE` existe desde API 24, no hace falta rama.
        stopForeground(Service.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /**
     * Relee el estado del crate. Lo que diga el crate es lo que se enseña.
     *
     * `intento` y `proximo_en_s` (19e) solo vienen cuando el crate esta
     * reconectando; en cualquier otro estado se ponen a 0 para no enseñar un
     * "intento 3" de una reconexion que ya termino.
     */
    private fun leerEstado() {
        if (!enMarcha) return
        val bruto = PuenteNativo.estadoSeguro()
        estadoDelCanal = leerCampo(bruto, "canal") ?: bruto
        motivoDelCanal = leerCampo(bruto, "motivo")
        intentoDelCanal = leerNumero(bruto, "intento")
        proximoEnS = leerNumero(bruto, "proximo_en_s")
        actualizarNotificacion()
    }

    /** Un campo numerico del estado, o 0 si no esta o el JSON no se puede leer. */
    private fun leerNumero(bruto: String, campo: String): Int = try {
        JSONObject(bruto).optInt(campo, 0)
    } catch (e: Exception) {
        0
    }

    /** Un campo de texto del estado, o `null` si no esta o el JSON no se puede leer. */
    private fun leerCampo(bruto: String, campo: String): String? = try {
        val obj = JSONObject(bruto)
        if (obj.isNull(campo)) null else obj.optString(campo).ifBlank { null }
    } catch (e: Exception) {
        null
    }

    // ---- la notificacion --------------------------------------------------

    /**
     * Sube el servicio a primer plano. El tipo `specialUse` es obligatorio desde
     * API 34 y tiene que casar con el `foregroundServiceType` del manifiesto: si no
     * casa, el sistema lanza `SecurityException` al arrancar.
     */
    private fun subirPrimerPlano() {
        val notificacion = construirNotificacion()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                ID_DE_NOTIFICACION,
                notificacion,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // En 29..33 el tipo se toma del manifiesto.
            startForeground(
                ID_DE_NOTIFICACION,
                notificacion,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MANIFEST
            )
        } else {
            startForeground(ID_DE_NOTIFICACION, notificacion)
        }
    }

    private fun crearCanalDeNotificaciones() {
        val gestor = getSystemService(NotificationManager::class.java) ?: return
        val canal = NotificationChannel(
            CANAL_DE_NOTIFICACIONES,
            getString(R.string.notificacion_canal_nombre),
            // IMPORTANCE_LOW: el estado se ve en la barra, pero no suena. Un canal
            // que pita cada reconexion es un canal que el dueño silencia, y
            // entonces la notificacion deja de servir para lo unico que sirve:
            // decir que el puente esta vivo.
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.notificacion_canal_descripcion)
            setShowBadge(false)
        }
        gestor.createNotificationChannel(canal)
    }

    private fun construirNotificacion(): Notification {
        val abrir = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val parar = PendingIntent.getService(
            this,
            1,
            Intent(this, ServicioEnki::class.java).apply { action = ACCION_PARAR },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        // La notificacion cuenta lo que pasa: cuando el crate esta volviendo, dice
        // por que intento va y cuanto falta. "reconectando" a secas se lee como un
        // canal caido que no vuelve, y es lo contrario.
        val cuerpo = if (estadoDelCanal == ESTADO_RECONECTANDO && intentoDelCanal > 0) {
            getString(R.string.notificacion_reconectando, intentoDelCanal, proximoEnS)
        } else {
            getString(R.string.notificacion_texto, estadoDelCanal)
        }
        val completo = motivoDelCanal?.let { "$cuerpo · $it" } ?: cuerpo

        return NotificationCompat.Builder(this, CANAL_DE_NOTIFICACIONES)
            .setSmallIcon(R.drawable.ic_notificacion)
            .setContentTitle(getString(R.string.notificacion_titulo))
            .setContentText(cuerpo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(completo))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(abrir)
            .addAction(R.drawable.ic_notificacion, getString(R.string.accion_parar), parar)
            .build()
    }

    private fun actualizarNotificacion() {
        val gestor = getSystemService(NotificationManager::class.java) ?: return
        gestor.notify(ID_DE_NOTIFICACION, construirNotificacion())
    }
}
