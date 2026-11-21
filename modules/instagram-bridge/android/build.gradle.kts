// Raiz del build: solo declara los plugins que usan los subproyectos, con
// `apply false`. La version de cada plugin se decide AQUI y en un solo sitio.
//
// AGP 8.7.3, no 8.5.x, por el requisito de 16 KiB: a partir de 8.5.1 las
// herramientas de empaquetado comprueban la alineacion de los segmentos LOAD de
// las librerias nativas. Con una AGP anterior, un .so alineado a 4 KiB entra sin
// aviso y el sintoma aparece en el movil (la app no abre), no en el build.
//
// Kotlin 2.0.21: la version que AGP 8.7.x soporta. Se sube en pareja con AGP; una
// Kotlin mas nueva que la AGP deja de compilar la capa Java sin decir por que.
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
