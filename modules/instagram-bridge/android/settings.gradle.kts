// El proyecto Gradle del envoltorio Android del puente (bloque 17).
//
// Lo que hay aqui, y por que:
//
//   - pluginManagement: donde Gradle busca el plugin de Android (google) y el de
//     Kotlin (mavenCentral / gradlePluginPortal). Sin `google()` el
//     `com.android.application` no se resuelve, y el error que sale habla de
//     "plugin not found", no de repositorios.
//   - dependencyResolutionManagement: donde se buscan las dependencias.
//     `FAIL_ON_PROJECT_REPOS` prohibe que un subproyecto declare repositorios
//     propios: dos repositorios por modulo es como un build acaba usando dos
//     versiones de androidx a la vez sin que nadie lo note.
//   - rootProject.name: lo que Android Studio muestra en la barra de titulo.
//   - include(":app"): un solo modulo. El crate NO es un subproyecto Gradle: lo
//     compila una tarea `Exec` con cargo-ndk (ver app/build.gradle.kts), porque
//     Cargo ya sabe construir sus propias dependencias y envolverlo en Gradle
//     solo añadiria una capa que nadie depura.

pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "instagram-bridge"
include(":app")
