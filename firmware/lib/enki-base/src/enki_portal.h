#ifndef ENKI_PORTAL_H
#define ENKI_PORTAL_H

/**
 * Enki Portal — Web server endpoints (config, status, WiFi scan, reset)
 *              + Captive portal detection (Android, iOS, Windows).
 *
 * Endpoints BASE: /, /api/config, /api/status, /api/wifi-scan, /api/reset
 * Endpoints LÓGICA: se registran en logic_setup() via webServer global
 */

#include <Arduino.h>
#include <WebServer.h>

extern WebServer webServer;

/**
 * Registrar endpoints HTTP base + captive portal detection.
 * Los endpoints del driver se registran en logic_setup().
 */
void portalSetup();

#endif // ENKI_PORTAL_H
