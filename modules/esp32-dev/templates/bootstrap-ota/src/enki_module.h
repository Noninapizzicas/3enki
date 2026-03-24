#ifndef ENKI_MODULE_H
#define ENKI_MODULE_H

/**
 * Enki Module Protocol — C++ implementation for ESP32
 *
 * Replica exacta del protocolo de modulos de Enki:
 *   - UI Request/Response: ui/request/{domain}/{action} → ui/response/{request_id}
 *   - Event Bus: core/*/events/{domain}/{action}
 *
 * Uso:
 *   EnkiModule mod(mqtt, "node", "enki-abc123");
 *   mod.handle("status", handleStatus);
 *   mod.handle("config", handleConfig);
 *   mod.onEvent("firmware.ota_requested", handleOta);
 *   mod.begin();   // suscribe topics
 *   mod.loop();    // procesa mensajes
 */

#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "config.h"

// Max handlers and event listeners
#define MAX_HANDLERS    16
#define MAX_LISTENERS   16

// Handler signature: receives request data, writes response into doc
// Return status code (200, 400, 500, etc.)
typedef int (*UIHandler)(JsonDocument& requestData, JsonDocument& responseDoc);

// Event listener: receives event data
typedef void (*EventListener)(JsonDocument& eventData);

struct HandlerEntry {
  const char* action;
  UIHandler   handler;
};

struct ListenerEntry {
  const char* eventType;     // e.g. "firmware.ota_requested"
  EventListener listener;
};

class EnkiModule {
public:
  EnkiModule(PubSubClient& mqtt, const char* domain, const char* coreId)
    : _mqtt(mqtt), _domain(domain), _coreId(coreId),
      _handlerCount(0), _listenerCount(0) {}

  // --- Register a UI handler: domain/action → handler function ---
  void handle(const char* action, UIHandler handler) {
    if (_handlerCount >= MAX_HANDLERS) return;
    _handlers[_handlerCount++] = { action, handler };
  }

  // --- Register an event listener ---
  void onEvent(const char* eventType, EventListener listener) {
    if (_listenerCount >= MAX_LISTENERS) return;
    _listeners[_listenerCount++] = { eventType, listener };
  }

  // --- Subscribe to MQTT topics (call after mqtt.connect) ---
  void begin() {
    // Subscribe to UI requests for our domain: ui/request/{domain}/+
    char topicReq[64];
    snprintf(topicReq, sizeof(topicReq), "ui/request/%s/+", _domain);
    _mqtt.subscribe(topicReq);
    Serial.printf("[enki] Suscrito a: %s\n", topicReq);

    // Subscribe to broadcast events: core/*/events/+/+
    _mqtt.subscribe("core/*/events/+/+");
    Serial.println("[enki] Suscrito a: core/*/events/+/+");

    // Subscribe to unicast events for this core: core/{coreId}/events/+/+
    char topicUni[64];
    snprintf(topicUni, sizeof(topicUni), "core/%s/events/+/+", _coreId);
    _mqtt.subscribe(topicUni);
    Serial.printf("[enki] Suscrito a: %s\n", topicUni);
  }

  // --- Process incoming MQTT message (call from mqtt callback) ---
  void onMessage(const char* topic, byte* payload, unsigned int length) {
    // Parse JSON
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, payload, length);
    if (err) {
      Serial.printf("[enki] JSON error: %s\n", err.c_str());
      return;
    }

    // UI Request: ui/request/{domain}/{action}
    if (strncmp(topic, "ui/request/", 11) == 0) {
      _handleUIRequest(topic + 11, doc);
      return;
    }

    // Event: core/{...}/events/{domain}/{action}
    const char* eventsPos = strstr(topic, "/events/");
    if (eventsPos) {
      _handleEvent(eventsPos + 8, doc);
      return;
    }
  }

  // --- Emit an event to the bus ---
  void emit(const char* eventType, JsonDocument& data) {
    // Build topic: core/{coreId}/events/{eventType with . replaced by /}
    char topic[96];
    char eventPath[64];
    _dotToSlash(eventType, eventPath, sizeof(eventPath));
    snprintf(topic, sizeof(topic), "core/%s/events/%s", _coreId, eventPath);

    // Build envelope
    JsonDocument envelope;
    envelope["event_id"] = _generateId();
    envelope["event_type"] = eventType;
    envelope["timestamp"] = _timestamp();
    envelope["source"]["core_id"] = _coreId;
    envelope["source"]["module_id"] = _domain;
    envelope["data"] = data;

    char buf[MQTT_BUFFER_SIZE];
    size_t len = serializeJson(envelope, buf, sizeof(buf));
    _mqtt.publish(topic, buf);

    Serial.printf("[enki] Event emitido: %s\n", eventType);
  }

  // --- Convenience: emit with inline data building ---
  void emitSimple(const char* eventType, const char* key, const char* value) {
    JsonDocument data;
    data[key] = value;
    emit(eventType, data);
  }

  const char* domain() const { return _domain; }
  const char* coreId() const { return _coreId; }

private:
  PubSubClient& _mqtt;
  const char* _domain;
  const char* _coreId;

  HandlerEntry  _handlers[MAX_HANDLERS];
  int           _handlerCount;
  ListenerEntry _listeners[MAX_LISTENERS];
  int           _listenerCount;

  // --- Handle UI request ---
  void _handleUIRequest(const char* domainAction, JsonDocument& request) {
    // domainAction = "{domain}/{action}"
    // Extract domain and action
    char domBuf[32], actBuf[32];
    const char* slash = strchr(domainAction, '/');
    if (!slash) return;

    size_t domLen = slash - domainAction;
    if (domLen >= sizeof(domBuf)) return;
    strncpy(domBuf, domainAction, domLen);
    domBuf[domLen] = '\0';
    strlcpy(actBuf, slash + 1, sizeof(actBuf));

    // Check domain matches ours
    if (strcmp(domBuf, _domain) != 0) return;

    const char* requestId = request["request_id"];
    if (!requestId) {
      Serial.printf("[enki] Request sin request_id en %s/%s\n", domBuf, actBuf);
      return;
    }

    Serial.printf("[enki] Request: %s/%s (id=%s)\n", domBuf, actBuf, requestId);

    // Find handler
    UIHandler handler = nullptr;
    for (int i = 0; i < _handlerCount; i++) {
      if (strcmp(_handlers[i].action, actBuf) == 0) {
        handler = _handlers[i].handler;
        break;
      }
    }

    if (!handler) {
      _sendResponse(requestId, 404, nullptr, "Handler not found");
      return;
    }

    // Execute handler
    JsonDocument responseData;
    JsonDocument requestData;

    // Copy request.data into requestData (if exists)
    if (request["data"].is<JsonObject>()) {
      requestData.set(request["data"]);
    }

    int status = handler(requestData, responseData);

    // Send response
    if (status >= 200 && status < 400) {
      _sendResponse(requestId, status, &responseData, nullptr);
    } else {
      const char* errMsg = responseData["error"] | "Error";
      _sendResponse(requestId, status, nullptr, errMsg);
    }
  }

  // --- Send UI response ---
  void _sendResponse(const char* requestId, int status, JsonDocument* data, const char* error) {
    char topic[80];
    snprintf(topic, sizeof(topic), "ui/response/%s", requestId);

    JsonDocument response;
    response["request_id"] = requestId;
    response["status"] = status;
    response["success"] = (status >= 200 && status < 400);
    response["timestamp"] = _timestamp();

    if (data && status >= 200 && status < 400) {
      response["data"] = *data;
    }
    if (error) {
      response["error"]["code"] = (status == 404) ? "NOT_FOUND" : "ERROR";
      response["error"]["message"] = error;
    }

    char buf[MQTT_BUFFER_SIZE];
    serializeJson(response, buf, sizeof(buf));
    _mqtt.publish(topic, buf);

    Serial.printf("[enki] Response: %s status=%d\n", requestId, status);
  }

  // --- Handle event ---
  void _handleEvent(const char* domainAction, JsonDocument& envelope) {
    // domainAction = "{domain}/{action}" from topic
    // Reconstruct event type with dots: "domain.action"
    char eventType[64];
    _slashToDot(domainAction, eventType, sizeof(eventType));

    // Extract data from envelope
    JsonDocument eventData;
    if (envelope["data"].is<JsonObject>()) {
      eventData.set(envelope["data"]);
    } else {
      eventData.set(envelope);
    }

    // Find and call matching listeners
    for (int i = 0; i < _listenerCount; i++) {
      if (strcmp(_listeners[i].eventType, eventType) == 0) {
        Serial.printf("[enki] Event recibido: %s\n", eventType);
        _listeners[i].listener(eventData);
      }
    }
  }

  // --- Utilities ---
  void _dotToSlash(const char* src, char* dst, size_t maxLen) {
    size_t i = 0;
    for (; src[i] && i < maxLen - 1; i++) {
      dst[i] = (src[i] == '.') ? '/' : src[i];
    }
    dst[i] = '\0';
  }

  void _slashToDot(const char* src, char* dst, size_t maxLen) {
    size_t i = 0;
    for (; src[i] && i < maxLen - 1; i++) {
      dst[i] = (src[i] == '/') ? '.' : src[i];
    }
    dst[i] = '\0';
  }

  const char* _generateId() {
    static char id[24];
    snprintf(id, sizeof(id), "esp_%lu_%lu", millis(), (unsigned long)esp_random());
    return id;
  }

  const char* _timestamp() {
    static char ts[32];
    unsigned long sec = millis() / 1000;
    snprintf(ts, sizeof(ts), "2026-01-01T%02lu:%02lu:%02luZ",
      (sec / 3600) % 24, (sec / 60) % 60, sec % 60);
    return ts;
  }
};

#endif // ENKI_MODULE_H
