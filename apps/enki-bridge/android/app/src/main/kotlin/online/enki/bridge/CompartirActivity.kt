package online.enki.bridge

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * F2: recibe una imagen o video compartido desde Instagram, Galeria, etc.
 *
 * Por ahora solo ensena lo recibido; en la fase siguiente lo envia al canal y
 * abre el selector para publicarlo en la red elegida.
 */
class CompartirActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val uri: Uri? = if (intent?.action == Intent.ACTION_SEND) {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(Intent.EXTRA_STREAM)
        } else null
        val texto = intent?.getStringExtra(Intent.EXTRA_TEXT) ?: ""

        val vista = TextView(this).apply {
            setPadding(48, 96, 48, 48)
            text = buildString {
                append("Pieza recibida\n\n")
                append("Archivo: ").append(uri?.toString() ?: "(ninguno)").append("\n\n")
                append("Texto: ").append(texto.ifEmpty { "(vacio)" })
            }
        }
        setContentView(vista)
    }
}
