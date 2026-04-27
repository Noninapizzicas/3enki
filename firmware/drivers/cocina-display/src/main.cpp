// main.cpp — Enki Cocina Display v2.0
#include "enki_base.h"
#include "app.h"

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n=== Enki Cocina Display v2.0 ===\n");
    baseConfigLoad();
    app_init();
    Serial.println("[READY]\n");
}

void loop() {
    app_loop();
}
