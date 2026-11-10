plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "online.enki.bridge"
    compileSdk = 35

    defaultConfig {
        applicationId = "online.enki.bridge"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
    }

    // Los .so los deja `cargo ndk` en src/main/jniLibs/<abi>/ ANTES de compilar.
    sourceSets["main"].jniLibs.srcDirs("src/main/jniLibs")

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    packaging {
        jniLibs {
            // false = las .so van sin comprimir y alineadas a 16 KiB por AGP 8.5+
            useLegacyPackaging = false
            keepDebugSymbols += "**/*.so"
        }
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.13.1")
}
