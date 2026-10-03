# ESP32 Ultron Device Protocol & Integration Guide

This document specifies the communication protocol, JSON payload schemas, security tokens, audio handling, and configuration options for connecting an ESP32 Ultron physical companion device to the Next.js Ultron server.

---

## 1. Overview & Architecture

The ESP32 Ultron firmware acts as a physical hardware extension for the Ultron AI assistant.
Communication with the Next.js server takes place over HTTPS using non-blocking requests.

### Core Endpoints

| Endpoint | Method | Description | Content-Type |
| :--- | :--- | :--- | :--- |
| `/api/esp/hello` | `POST` | Handshake & capabilities query | `application/json` |
| `/api/esp/chat` | `POST` | Streaming AI interaction & emotion/motion feedback | `text/event-stream` (SSE) |
| `/api/esp/tts` | `GET` | Streamed MP3 speech audio output for TTS | `audio/mpeg` |
| `/api/esp/telemetry` | `POST` | Background hardware telemetry (battery, RSSI, status) | `application/json` |
| `/api/esp/events` | `GET` | Real-time event sync/polling for Chrome web app chats | `application/json` or SSE |

---

## 2. Authentication & Security

All request headers or payloads must include the shared secret device token if configured on the server:

- **Environment Variable**: `ESP_DEVICE_TOKEN`
- **Header**: `x-device-token: <ESP_DEVICE_TOKEN>` or included in JSON body field `"token"` / query parameter `?token=`.
- Timing-safe comparison is performed on the server via `checkDeviceToken()`.

---

## 3. Endpoints Detail

### 3.1 Handshake: `POST /api/esp/hello`

#### Request Payload
```json
{
  "device_id": "ultron_01",
  "token": "ultron_secret_123",
  "fw": "1.0.0",
  "session_id": ""
}
```

#### Response (200 OK)
```json
{
  "ok": true,
  "protocol": 1,
  "session_id": "sess_abc123",
  "tts": {
    "voice": "jarvis",
    "format": "mp3",
    "sample_rate": 24000,
    "endpoint": "/api/esp/tts"
  },
  "motions": [
    "center", "nod", "nod_fast", "look_left", "look_right",
    "tilt_left", "tilt_right", "excited", "confused", "thinking", "sleep"
  ],
  "states": [
    "idle", "happy", "sad", "angry", "thinking", "speaking",
    "sleep", "confused", "excited", "surprised", "error", "disconnect", "user_custom"
  ]
}
```

---

### 3.2 Streaming Chat: `POST /api/esp/chat`

#### Request Payload
```json
{
  "device_id": "ultron_01",
  "token": "ultron_secret_123",
  "session_id": "sess_abc123",
  "text": "Hello Ultron, perform system check.",
  "history": []
}
```

#### Server-Sent Events Stream (`text/event-stream`)

Frames are delivered in standard SSE format: `data: {json}\n\n`.

##### 1. State Update Event
```json
{
  "type": "state",
  "state": "thinking"
}
```

##### 2. Incremental Text Delta Event
```json
{
  "type": "ai_delta",
  "text": "All systems operating at peak efficiency."
}
```

##### 3. Final AI Response Event
```json
{
  "type": "ai_response",
  "text": "All systems operating at peak efficiency.",
  "emotion": "happy",
  "motion": "nod",
  "tts": "/api/esp/tts?text=All+systems+operating+at+peak+efficiency.&voice=jarvis&token=ultron_secret_123",
  "tts_text": "All systems operating at peak efficiency.",
  "session_id": "sess_abc123"
}
```

##### 4. Done Event
```json
{
  "type": "done"
}
```

##### 5. Error Event
```json
{
  "type": "error",
  "error": "Timeout waiting for agent response."
}
```

---

### 3.3 Text-To-Speech Stream: `GET /api/esp/tts`

- **URL Query Parameters**: `?text=<encoded_text>&voice=jarvis&token=<token>`
- **Response Format**: `audio/mpeg` (Edge TTS, MP3 format, 24 kHz, 48 kbps, mono).
- **Important Note**: Microsoft Edge TTS does **NOT** support raw PCM/WAV output streams (`riff-*` and `raw-*` formats are commented out in `msedge-tts` distribution and fail with stream errors). Therefore, the ESP32 hardware **must decode MP3 audio** using `ESP32-audioI2S` or similar decoder libraries.

---

### 3.4 Telemetry: `POST /api/esp/telemetry`

#### Request Payload
```json
{
  "device_id": "ultron_01",
  "token": "ultron_secret_123",
  "battery_pct": 88,
  "rssi": -55,
  "state": "idle",
  "fw": "1.0.0"
}
```

#### Response (200 OK)
```json
{
  "ok": true
}
```

---

## 4. Whitelists & Validation

### Face States (Emotions)
- `idle`, `happy`, `sad`, `angry`, `thinking`, `speaking`, `sleep`, `confused`, `excited`, `surprised`, `error`, `disconnect`, `user_custom`

### Motion Animations
- `center`, `nod`, `nod_fast`, `look_left`, `look_right`, `tilt_left`, `tilt_right`, `excited`, `confused`, `thinking`, `sleep`

*Note: The ESP32 firmware ignores any motion name outside of this strict whitelist and strictly clamps servo angles within hard bounds `[10, 170]` degrees.*

---

## 5. Server Environment Variables

- `ESP_DEVICE_TOKEN`: Secret key for authenticating ESP32 hardware requests.
- `ESP_TTS_VOICE`: Voice identifier for TTS (default: `en-US-ChristopherNeural` or `jarvis`).
- `ESP_TELEMETRY_FILE`: Optional log file path for writing device telemetry entries.
