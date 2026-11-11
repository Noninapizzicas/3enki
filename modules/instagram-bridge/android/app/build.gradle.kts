// El modulo de la app. Tres cosas que no son obvias y estan aqui escritas:
//
//   1. EL CRATE NO ES UN SUBPROYECTO GRADLE. Se compila con `cargo ndk` desde una
//      tarea `Exec` que deja los .so en `src/main/jniLibs/<abi>/`. Cargo sabe
//      construir sus dependencias; envolverlo en un plugin de Gradle solo añade
//      una capa que despues nadie sabe depurar.
//   2. UNA TAREA POR ABI, CON SU PROPIO CARGO_TARGET_DIR. Compartir el target de
//      escritorio (`crate/target/`) con el de Android mezcla artefactos de dos
//      tripletas y deja el `cargo test` de escritorio mirando ficheros del NDK.
//   3. RUSTFLAGS Y CARGO_ENCODED_RUSTFLAGS SE BORRAN DEL ENTORNO. Si el portatil
//      los tiene exportados (pasa con toolchains de terceros), SUSTITUYEN a las
//      tablas de `crate/.cargo/config.toml` en vez de sumarse: el build-id y la
//      alineacion de 16 KiB desaparecen sin un solo aviso, y el fallo se ve en el
//      movil.

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// ---------------------------------------------------------------------------
// Donde esta el crate y donde acaban sus .so
// ---------------------------------------------------------------------------
//
// Este fichero vive en `modules/instagram-bridge/android/app/`; el crate en
// `modules/instagram-bridge/crate/`. La ruta relativa correcta desde `app/` es
// `../../crate`, y es la misma que `rootProject.projectDir.parentFile.resolve("crate")`:
// se escribe una sola vez para que no haya dos verdades.
val crateDir: File = rootProject.projectDir.parentFile.resolve("crate").canonicalFile
val jniLibsDir: File = projectDir.resolve("src/main/jniLibs")

// Las dos ABI que se empaquetan. arm64-v8a es el movil de verdad; x86_64 es el
// emulador de Android Studio. Sin la segunda no se puede probar nada si no hay
// un telefono enchufado.
val abis = listOf("arm64-v8a", "x86_64")

/**
 * Comprueba que cargo-ndk esta instalado ANTES de lanzar el build.
 *
 * Sin esta comprobacion el error que sale es `error: no such command: ndk`, que
 * parece un problema del crate y no una herramienta que falta en el portatil.
 */
fun exigirCargoNdk() {
    val instalado = try {
        val proceso = ProcessBuilder("cargo", "ndk", "--version")
            .redirectErrorStream(true)
            .start()
        proceso.waitFor() == 0
    } catch (e: Exception) {
        false
    }
    if (!instalado) {
        throw GradleException(
            "cargo-ndk no esta instalado (o no esta en el PATH).\n" +
                "  Instalalo con:  cargo install cargo-ndk --locked\n" +
                "  Y comprueba:    cargo ndk --version\n" +
                "Sin cargo-ndk no se puede compilar el crate para Android y el APK " +
                "saldria sin ninguna libreria nativa."
        )
    }
    if (System.getenv("ANDROID_NDK_HOME") == null && System.getenv("ANDROID_NDK_ROOT") == null) {
        logger.lifecycle(
            "aviso: ni ANDROID_NDK_HOME ni ANDROID_NDK_ROOT estan definidos. " +
                "cargo-ndk intentara encontrar el NDK por su cuenta; si falla, " +
                "exporta ANDROID_NDK_HOME a la carpeta del NDK r30."
        )
    }
}

android {
    namespace = "online.enki.instagram"
    compileSdk = 35

    defaultConfig {
        applicationId = "online.enki.instagram"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        // Solo se empaquetan las ABI que la tarea compila. Un APK con una ABI
        // vacia arranca y falla al cargar la lib, que es peor que no tenerla.
        ndk {
            abiFilters += abis
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Firmado con la llave de debug para que el APK se pueda INSTALAR en
            // el movil del dueño. Para publicar de verdad hace falta un keystore
            // propio y su contrasena fuera del repo.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        // Los .so viajan comprimidos y se extraen al instalar: es lo que espera
        // el loader del sistema desde API 23.
        jniLibs {
            useLegacyPackaging = false
        }
    }

    sourceSets {
        getByName("main") {
            jniLibs.srcDirs("src/main/jniLibs")
        }
    }

    // `lintVitalRelease` corre dentro de `assembleRelease` y puede tumbar el APK
    // por un aviso de estilo. El puente se revisa a mano; aqui no se bloquea.
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-service:2.8.7")
}

// ---------------------------------------------------------------------------
// La compilacion del crate
// ---------------------------------------------------------------------------

/**
 * Una tarea por ABI. `cargo ndk -o` coloca el .so ya en
 * `src/main/jniLibs/<abi>/`, asi que no hay ningun `copy` que se pueda olvidar.
 */
val tareasRust = abis.map { abi ->
    val sufijo = abi.split("-").joinToString("") { trozo ->
        trozo.replaceFirstChar { letra -> letra.uppercase() }
    }
    tasks.register<Exec>("compilarRust$sufijo") {
        group = "rust"
        description = "Compila el crate del aparato para $abi y deja su .so en jniLibs."

        workingDir = crateDir

        // Un target dir por ABI: separado del de escritorio y del de la otra ABI.
        environment("CARGO_TARGET_DIR", File(crateDir, "target/android-$abi").absolutePath)

        // Borrar los flags heredados: sustituyen a `.cargo/config.toml` en
        // silencio (ver la cabecera de este fichero).
        environment.remove("RUSTFLAGS")
        environment.remove("CARGO_ENCODED_RUSTFLAGS")

        doFirst {
            if (!crateDir.isDirectory) {
                throw GradleException(
                    "no existe el crate en $crateDir.\n" +
                        "  Este proyecto espera la ruta modules/instagram-bridge/crate; " +
                        "si moviste el modulo, corrige crateDir en app/build.gradle.kts."
                )
            }
            exigirCargoNdk()
            jniLibsDir.mkdirs()
            logger.lifecycle("cargo ndk · $abi · $crateDir")
        }

        commandLine(
            "cargo", "ndk",
            "-t", abi,
            "-o", jniLibsDir.absolutePath,
            "build", "--release"
        )
    }
}

val compilarCrate = tasks.register("compilarCrate") {
    group = "rust"
    description = "Compila el crate del aparato para las dos ABI (arm64-v8a y x86_64)."
    dependsOn(tareasRust)
}

// Se engancha a `preBuild`, que es lo primero que corre cualquier variante
// (debug o release). Con `-Penki.sin-rust=true` se salta, para poder abrir el
// proyecto en un portatil sin Rust y revisar la capa Kotlin.
val saltarRust = (findProperty("enki.sin-rust") as String?)?.toBoolean() ?: false
if (saltarRust) {
    logger.lifecycle("enki.sin-rust=true: no se compila el crate (el APK saldra sin .so).")
} else {
    tasks.matching { it.name == "preBuild" }.configureEach {
        dependsOn(compilarCrate)
    }
}
