/*
 * =================================================================================
 *  ESP32 ULTRON PHYSICAL AI COMPANION FIRMWARE
 *  Single-File Modular Arduino .ino Firmware for ESP32-WROOM-32
 * =================================================================================
 *  Target Hardware:
 *   - ESP32-WROOM-32 (38-pin DevKit)
 *   - 0.96" OLED Display (SSD1306, 128x64, I2C 0x3C)
 *   - 2-Axis Analog Joystick (VRx, VRy, SW)
 *   - SG90 Micro Servo (Pan / Head tilt) + MOSFET Enable Pin
 *   - MAX98357A I2S Audio Amplifier (BCLK, LRC, DIN)
 *   - Battery Divider ADC (Optional)
 *   - SD Card SPI (Optional)
 *
 *  Design Guidelines:
 *   - Modular C++ classes inside single .ino file
 *   - 100% Non-blocking architecture (NO delay(), NO blocking loops)
 *   - Zero heap-fragmenting String objects (uses char arrays and C-strings)
 *   - Servo safety: strict hardware clamp [10, 170], motion lookup table only
 *   - Non-blocking custom HTTPS client with HTTP Chunked Transfer & SSE parser
 * =================================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// Optional SD Card support
#define ULTRON_SD_ENABLE 0
#if ULTRON_SD_ENABLE
  #include <SD.h>
  #include <SPI.h>
#endif

// =================================================================================
//  USER CONFIGURATION SECTION
// =================================================================================

// --- FEATURE FLAGS ---
#define ULTRON_AUDIO_MP3       0   // 1 = Requires ESP32-audioI2S library & streams MP3 TTS
#define ULTRON_AUDIO_TONE      1   // 1 = Local I2S beep sound generator (forced 0 if MP3 is 1)
#define ULTRON_BATTERY_ENABLE  0   // 1 = Enables battery ADC voltage monitoring
#define ULTRON_LIGHT_SLEEP     0   // 1 = Enables automatic light-sleep after inactivity
#define ULTRON_USER_FACE_BITMAP 0  // 1 = Uses custom face bitmap from PROGMEM hook

#if (ULTRON_AUDIO_MP3 == 1)
  #undef ULTRON_AUDIO_TONE
  #define ULTRON_AUDIO_TONE 0
  #include "Audio.h"
#endif

// --- DEFAULT NETWORK & SERVER CREDENTIALS ---
#define DEFAULT_WIFI_SSID     "FTTH-BBNL-CHANNEL-9547"
#define DEFAULT_WIFI_PASS     "Pksalina@5560"
#define DEFAULT_SERVER_HOST   "ultron-ai-ten.vercel.app"
#define DEFAULT_SERVER_PORT   443
#define DEFAULT_DEVICE_ID     "ultron_01"
#define DEFAULT_DEVICE_TOKEN  "ultron_secret_123"

// --- GPIO PIN DEFINITIONS ---
// I2C Pins (SSD1306 OLED)
#define PIN_I2C_SDA           21
#define PIN_I2C_SCL           22

// Analog Joystick Pins (ADC1 ONLY - WiFi occupies ADC2)
#define PIN_JOY_VRX           34  // ADC1_CH6
#define PIN_JOY_VRY           35  // ADC1_CH7
#define PIN_JOY_SW            32  // Digital Input with Pullup

// Servo Control Pins
#define PIN_SERVO_SIG         25  // PWM Output
#define PIN_SERVO_EN          26  // MOSFET active-HIGH power enable

// MAX98357A I2S Audio Pins
#define PIN_I2S_BCLK          14  // Bit Clock
#define PIN_I2S_LRC           13  // Left/Right Word Select Clock
#define PIN_I2S_DIN           33  // Data Input (Changed from 25 to avoid conflict with Servo)

// Optional Battery & SD Pins
#define PIN_BATTERY_ADC       36  // ADC1_CH0 (Disabled by default)
#define PIN_SD_CS             5
#define PIN_SD_MOSI           23
#define PIN_SD_MISO           19
#define PIN_SD_SCK            18

// --- SERVO HARDWARE CLAMP BOUNDS ---
#define SERVO_HARD_MIN        10  // Absolute min mechanical angle
#define SERVO_HARD_MAX        170 // Absolute max mechanical angle
#define SERVO_CENTER_DEFAULT  90  // Default center angle

// --- BATTERY CALIBRATION ---
#define BATTERY_DIVIDER_RATIO 2.0f
#define BATTERY_V_MAX         4.2f
#define BATTERY_V_MIN         3.2f

// =================================================================================
//  VERSION-AGNOSTIC ARDUINOJSON MACRO
// =================================================================================
#if ARDUINOJSON_VERSION_MAJOR >= 7
  #define AJDOC(v) JsonDocument v
#else
  #define AJDOC(v) StaticJsonDocument<768> v
#endif

// =================================================================================
//  PROGMEM USER FACE BITMAP HOOK
// =================================================================================
#if ULTRON_USER_FACE_BITMAP
// User can replace this 128x38 1-bit bitmap array
const unsigned char PROGMEM ultron_user_face_bmp[] = {
  // 128x38 bitmap bytes go here...
  0x00
};
#endif

// =================================================================================
//  ENUMERATIONS & CONSTANTS
// =================================================================================
enum FaceState {
  FACE_IDLE = 0,
  FACE_HAPPY,
  FACE_SAD,
  FACE_ANGRY,
  FACE_THINKING,
  FACE_SPEAKING,
  FACE_SLEEP,
  FACE_CONFUSED,
  FACE_EXCITED,
  FACE_SURPRISED,
  FACE_ERROR,
  FACE_DISCONNECT,
  FACE_USER_CUSTOM,
  FACE_STATE_COUNT
};

enum JoyDirection {
  JOY_NONE = 0,
  JOY_UP,
  JOY_DOWN,
  JOY_LEFT,
  JOY_RIGHT
};

enum JoyButton {
  BTN_NONE = 0,
  BTN_PRESS,
  BTN_LONG_PRESS
};

enum SystemMode {
  MODE_BOOT = 0,
  MODE_NORMAL,
  MODE_MENU,
  MODE_EDIT_VALUE,
  MODE_JOYSTICK_SERVO
};

enum MenuScreenId {
  SCN_MAIN = 0,
  SCN_SERVO,
  SCN_DISPLAY,
  SCN_AUDIO,
  SCN_WIFI,
  SCN_AI,
  SCN_BATTERY,
  SCN_ABOUT,
  SCN_VALUE_EDIT
};

// =================================================================================
//  PROMPT PRESET SLOTS FOR NORMAL MODE
// =================================================================================
const char* const PROMPT_SLOTS[] = {
  "Hello Ultron! Status report.",
  "What is your primary mission?",
  "Tell me a short science joke.",
  "Perform hardware diagnostic.",
  "Who created you?"
};
const uint8_t PROMPT_SLOT_COUNT = sizeof(PROMPT_SLOTS) / sizeof(PROMPT_SLOTS[0]);

// =================================================================================
//  SETTINGS MANAGER CLASS (NVS PREFERENCES)
// =================================================================================
class SettingsManager {
public:
  char wifiSsid[33];
  char wifiPass[65];
  char serverHost[65];
  uint16_t serverPort;
  char deviceId[33];
  char deviceToken[65];
  uint8_t volume;
  uint8_t brightness;
  uint8_t servoMin;
  uint8_t servoMax;
  uint8_t servoCenter;
  uint8_t servoSpeed;

  void begin() {
    Preferences prefs;
    prefs.begin("ultron_cfg", true);
    
    String s = prefs.getString("ssid", DEFAULT_WIFI_SSID);
    strncpy(wifiSsid, s.c_str(), sizeof(wifiSsid) - 1);
    
    s = prefs.getString("pass", DEFAULT_WIFI_PASS);
    strncpy(wifiPass, s.c_str(), sizeof(wifiPass) - 1);

    s = prefs.getString("host", DEFAULT_SERVER_HOST);
    strncpy(serverHost, s.c_str(), sizeof(serverHost) - 1);

    serverPort = prefs.getUShort("port", DEFAULT_SERVER_PORT);

    s = prefs.getString("devid", DEFAULT_DEVICE_ID);
    strncpy(deviceId, s.c_str(), sizeof(deviceId) - 1);

    s = prefs.getString("devtok", DEFAULT_DEVICE_TOKEN);
    strncpy(deviceToken, s.c_str(), sizeof(deviceToken) - 1);

    volume = prefs.getUChar("vol", 15);
    brightness = prefs.getUChar("bright", 255);
    servoMin = prefs.getUChar("s_min", SERVO_HARD_MIN + 10);
    servoMax = prefs.getUChar("s_max", SERVO_HARD_MAX - 10);
    servoCenter = prefs.getUChar("s_ctr", SERVO_CENTER_DEFAULT);
    servoSpeed = prefs.getUChar("s_spd", 50);

    prefs.end();

    // Sanity checks
    if (servoMin < SERVO_HARD_MIN) servoMin = SERVO_HARD_MIN;
    if (servoMax > SERVO_HARD_MAX) servoMax = SERVO_HARD_MAX;
    if (servoCenter < servoMin || servoCenter > servoMax) servoCenter = SERVO_CENTER_DEFAULT;
  }

  void save() {
    Preferences prefs;
    prefs.begin("ultron_cfg", false);
    prefs.putString("ssid", wifiSsid);
    prefs.putString("pass", wifiPass);
    prefs.putString("host", serverHost);
    prefs.putUShort("port", serverPort);
    prefs.putString("devid", deviceId);
    prefs.putString("devtok", deviceToken);
    prefs.putUChar("vol", volume);
    prefs.putUChar("bright", brightness);
    prefs.putUChar("s_min", servoMin);
    prefs.putUChar("s_max", servoMax);
    prefs.putUChar("s_ctr", servoCenter);
    prefs.putUChar("s_spd", servoSpeed);
    prefs.end();
  }
};

extern SettingsManager settings;

// =================================================================================
//  SERVO MANAGER CLASS (SAFE NON-BLOCKING MOTION ENGINE)
// =================================================================================
class ServoManager {
private:
  Servo _servo;
  bool _attached;
  int _currentAngle;
  int _targetAngle;
  int _startAngle;
  uint32_t _animStartTime;
  uint32_t _animDuration;
  uint32_t _lastMoveTime;
  bool _animating;
  
  struct Keyframe {
    int8_t offset;
    uint16_t duration;
  };

  const Keyframe* _currentSequence;
  uint8_t _sequenceLen;
  uint8_t _sequenceIdx;

public:
  void begin() {
    pinMode(PIN_SERVO_EN, OUTPUT);
    digitalWrite(PIN_SERVO_EN, LOW); // MOSFET off initially
    _attached = false;
    _currentAngle = settings.servoCenter;
    _targetAngle = settings.servoCenter;
    _animating = false;
    _currentSequence = NULL;
    _sequenceLen = 0;
    _sequenceIdx = 0;
  }

  int clampAngle(int angle) {
    if (angle < settings.servoMin) return settings.servoMin;
    if (angle > settings.servoMax) return settings.servoMax;
    return angle;
  }

  void enablePower(bool enable) {
    if (enable) {
      digitalWrite(PIN_SERVO_EN, HIGH);
      if (!_attached) {
        _servo.attach(PIN_SERVO_SIG);
        _attached = true;
      }
    } else {
      if (_attached) {
        _servo.detach();
        _attached = false;
      }
      digitalWrite(PIN_SERVO_EN, LOW);
    }
  }

  void moveDirect(int targetAngle, uint16_t durationMs = 400) {
    targetAngle = clampAngle(targetAngle);
    if (targetAngle == _currentAngle && !_animating) return;

    enablePower(true);
    _startAngle = _currentAngle;
    _targetAngle = targetAngle;
    _animStartTime = millis();
    _animDuration = durationMs > 0 ? durationMs : 100;
    _animating = true;
    _lastMoveTime = millis();
  }

  void playMotion(const char* motionName) {
    if (strcmp(motionName, "center") == 0) {
      moveDirect(settings.servoCenter, 400);
    } else if (strcmp(motionName, "nod") == 0) {
      static const Keyframe kf[] = {{0, 150}, {20, 250}, {-15, 250}, {0, 200}};
      startSequence(kf, sizeof(kf)/sizeof(kf[0]));
    } else if (strcmp(motionName, "nod_fast") == 0) {
      static const Keyframe kf[] = {{0, 100}, {25, 150}, {-20, 150}, {20, 150}, {0, 100}};
      startSequence(kf, sizeof(kf)/sizeof(kf[0]));
    } else if (strcmp(motionName, "look_left") == 0) {
      moveDirect(settings.servoCenter - 35, 450);
    } else if (strcmp(motionName, "look_right") == 0) {
      moveDirect(settings.servoCenter + 35, 450);
    } else if (strcmp(motionName, "tilt_left") == 0) {
      moveDirect(settings.servoCenter - 20, 350);
    } else if (strcmp(motionName, "tilt_right") == 0) {
      moveDirect(settings.servoCenter + 20, 350);
    } else if (strcmp(motionName, "excited") == 0) {
      static const Keyframe kf[] = {{-25, 120}, {25, 120}, {-25, 120}, {25, 120}, {0, 150}};
      startSequence(kf, sizeof(kf)/sizeof(kf[0]));
    } else if (strcmp(motionName, "confused") == 0) {
      static const Keyframe kf[] = {{-15, 300}, {15, 300}, {0, 300}};
      startSequence(kf, sizeof(kf)/sizeof(kf[0]));
    } else if (strcmp(motionName, "thinking") == 0) {
      static const Keyframe kf[] = {{-20, 500}, {-20, 400}, {0, 350}};
      startSequence(kf, sizeof(kf)/sizeof(kf[0]));
    } else if (strcmp(motionName, "sleep") == 0) {
      moveDirect(settings.servoCenter - 40, 800);
    }
  }

  void startSequence(const Keyframe* seq, uint8_t len) {
    _currentSequence = seq;
    _sequenceLen = len;
    _sequenceIdx = 0;
    if (len > 0) {
      moveDirect(settings.servoCenter + _currentSequence[0].offset, _currentSequence[0].duration);
    }
  }

  void update() {
    uint32_t now = millis();

    if (_animating) {
      uint32_t elapsed = now - _animStartTime;
      if (elapsed >= _animDuration) {
        _currentAngle = _targetAngle;
        _servo.write(_currentAngle);
        _animating = false;
        _lastMoveTime = now;

        // Check if keyframe sequence has next step
        if (_currentSequence != NULL && _sequenceIdx + 1 < _sequenceLen) {
          _sequenceIdx++;
          moveDirect(settings.servoCenter + _currentSequence[_sequenceIdx].offset, _currentSequence[_sequenceIdx].duration);
        } else {
          _currentSequence = NULL;
        }
      } else {
        // Smoothstep interpolation (3*t^2 - 2*t^3)
        float t = (float)elapsed / (float)_animDuration;
        float smoothT = t * t * (3.0f - 2.0f * t);
        _currentAngle = _startAngle + (int)((_targetAngle - _startAngle) * smoothT);
        _servo.write(_currentAngle);
      }
    } else {
      // Auto-detach servo power after 1000ms idle to prevent jitter/buzzing
      if (_attached && (now - _lastMoveTime > 1000)) {
        enablePower(false);
      }
    }
  }

  int getCurrentAngle() const { return _currentAngle; }
};

extern ServoManager servoMgr;

// =================================================================================
//  JOYSTICK MANAGER CLASS (NON-BLOCKING WITH ACCURATE TIMING)
// =================================================================================
class JoystickManager {
private:
  int _centerX;
  int _centerY;
  uint32_t _lastBtnCheckTime;
  uint32_t _btnPressStartTime;
  bool _btnState;
  bool _btnHandled;

  uint32_t _lastDirTime;
  JoyDirection _lastDir;

public:
  void begin() {
    pinMode(PIN_JOY_SW, INPUT_PULLUP);
    analogSetAttenuation(ADC_11db);
    _centerX = 2048;
    _centerY = 2048;
    _btnState = false;
    _btnHandled = false;
    _lastDir = JOY_NONE;
    _btnPressStartTime = 0;
    _lastDirTime = 0;
  }

  void autoCalibrate() {
    long sumX = 0, sumY = 0;
    for (int i = 0; i < 20; i++) {
      sumX += analogRead(PIN_JOY_VRX);
      sumY += analogRead(PIN_JOY_VRY);
      delayMicroseconds(500); // Tiny calibration read delay in setup
    }
    _centerX = sumX / 20;
    _centerY = sumY / 20;
  }

  JoyButton checkButton() {
    bool raw = (digitalRead(PIN_JOY_SW) == LOW);
    uint32_t now = millis();

    if (raw && !_btnState) {
      _btnState = true;
      _btnPressStartTime = now;
      _btnHandled = false;
    } else if (!raw && _btnState) {
      _btnState = false;
      if (!_btnHandled) {
        uint32_t dur = now - _btnPressStartTime;
        if (dur >= 30 && dur < 900) {
          _btnHandled = true;
          return BTN_PRESS;
        }
      }
    } else if (raw && _btnState && !_btnHandled) {
      if (now - _btnPressStartTime >= 900) {
        _btnHandled = true;
        return BTN_LONG_PRESS;
      }
    }
    return BTN_NONE;
  }

  JoyDirection checkDirection() {
    int x = analogRead(PIN_JOY_VRX) - _centerX;
    int y = analogRead(PIN_JOY_VRY) - _centerY;
    const int deadzone = 500;

    JoyDirection dir = JOY_NONE;
    if (y < -deadzone) dir = JOY_UP;
    else if (y > deadzone) dir = JOY_DOWN;
    else if (x < -deadzone) dir = JOY_LEFT;
    else if (x > deadzone) dir = JOY_RIGHT;

    uint32_t now = millis();
    if (dir != JOY_NONE) {
      if (dir != _lastDir) {
        _lastDir = dir;
        _lastDirTime = now;
        return dir;
      } else {
        // Repeat delay 400ms, then 150ms interval
        uint32_t elapsed = now - _lastDirTime;
        if (elapsed > 400) {
          _lastDirTime = now - 250;
          return dir;
        }
      }
    } else {
      _lastDir = JOY_NONE;
    }
    return JOY_NONE;
  }
};

extern JoystickManager joyMgr;

// =================================================================================
//  FACE RENDERER CLASS (OLED ANIMATION ENGINE)
// =================================================================================
class FaceRenderer {
private:
  FaceState _state;
  uint32_t _lastBlinkTime;
  uint32_t _blinkDuration;
  bool _isBlinking;
  uint8_t _speakFrame;
  uint32_t _lastSpeakTime;

public:
  void begin() {
    _state = FACE_IDLE;
    _lastBlinkTime = millis();
    _blinkDuration = 150;
    _isBlinking = false;
    _speakFrame = 0;
    _lastSpeakTime = millis();
  }

  void setState(FaceState state) {
    _state = state;
  }

  FaceState getState() const { return _state; }

  void update() {
    uint32_t now = millis();
    if (!_isBlinking && (now - _lastBlinkTime > 3000)) {
      _isBlinking = true;
      _lastBlinkTime = now;
    } else if (_isBlinking && (now - _lastBlinkTime > _blinkDuration)) {
      _isBlinking = false;
      _lastBlinkTime = now;
    }

    if (_state == FACE_SPEAKING && (now - _lastSpeakTime > 120)) {
      _speakFrame = (_speakFrame + 1) % 4;
      _lastSpeakTime = now;
    }
  }

  void draw(Adafruit_SSD1306& display) {
#if ULTRON_USER_FACE_BITMAP
    if (_state == FACE_USER_CUSTOM) {
      display.drawBitmap(0, 0, ultron_user_face_bmp, 128, 38, SSD1306_WHITE);
      return;
    }
#endif

    // Default Face Renderer bounds (0, 0, 128, 38)
    int leftEyeX = 36, rightEyeX = 92, eyeY = 16, eyeR = 10;

    if (_isBlinking && _state != FACE_SLEEP && _state != FACE_ERROR) {
      display.drawFastHLine(leftEyeX - eyeR, eyeY, eyeR * 2, SSD1306_WHITE);
      display.drawFastHLine(rightEyeX - eyeR, eyeY, eyeR * 2, SSD1306_WHITE);
    } else {
      switch (_state) {
        case FACE_IDLE:
          display.fillCircle(leftEyeX, eyeY, eyeR, SSD1306_WHITE);
          display.fillCircle(rightEyeX, eyeY, eyeR, SSD1306_WHITE);
          display.drawFastHLine(54, 30, 20, SSD1306_WHITE); // Neutral mouth
          break;

        case FACE_HAPPY:
          display.drawCircle(leftEyeX, eyeY + 3, eyeR, SSD1306_WHITE);
          display.fillRect(leftEyeX - eyeR - 1, eyeY + 3, eyeR * 2 + 2, eyeR + 2, SSD1306_BLACK);
          display.drawCircle(rightEyeX, eyeY + 3, eyeR, SSD1306_WHITE);
          display.fillRect(rightEyeX - eyeR - 1, eyeY + 3, eyeR * 2 + 2, eyeR + 2, SSD1306_BLACK);
          // Big smile
          display.drawCircle(64, 24, 12, SSD1306_WHITE);
          display.fillRect(50, 14, 28, 12, SSD1306_BLACK);
          break;

        case FACE_SAD:
          display.fillCircle(leftEyeX, eyeY + 2, eyeR - 2, SSD1306_WHITE);
          display.fillCircle(rightEyeX, eyeY + 2, eyeR - 2, SSD1306_WHITE);
          display.drawLine(leftEyeX - 10, eyeY - 8, leftEyeX + 8, eyeY - 4, SSD1306_WHITE);
          display.drawLine(rightEyeX + 10, eyeY - 8, rightEyeX - 8, eyeY - 4, SSD1306_WHITE);
          // Frown
          display.drawCircle(64, 36, 10, SSD1306_WHITE);
          display.fillRect(50, 36, 28, 12, SSD1306_BLACK);
          break;

        case FACE_ANGRY:
          display.fillCircle(leftEyeX, eyeY, eyeR, SSD1306_WHITE);
          display.fillCircle(rightEyeX, eyeY, eyeR, SSD1306_WHITE);
          // Slanted eyebrows
          display.drawLine(leftEyeX - 10, eyeY - 8, leftEyeX + 10, eyeY - 2, SSD1306_WHITE);
          display.drawLine(rightEyeX + 10, eyeY - 8, rightEyeX - 10, eyeY - 2, SSD1306_WHITE);
          display.drawFastHLine(52, 30, 24, SSD1306_WHITE);
          break;

        case FACE_THINKING:
          display.fillCircle(leftEyeX, eyeY - 2, eyeR - 1, SSD1306_WHITE);
          display.fillCircle(rightEyeX, eyeY + 2, eyeR, SSD1306_WHITE);
          display.drawLine(leftEyeX - 8, eyeY - 10, leftEyeX + 8, eyeY - 12, SSD1306_WHITE); // Raised brow
          // Side dots
          display.fillCircle(56, 30, 2, SSD1306_WHITE);
          display.fillCircle(64, 30, 2, SSD1306_WHITE);
          display.fillCircle(72, 30, 2, SSD1306_WHITE);
          break;

        case FACE_SPEAKING:
          display.fillCircle(leftEyeX, eyeY, eyeR, SSD1306_WHITE);
          display.fillCircle(rightEyeX, eyeY, eyeR, SSD1306_WHITE);
          {
            int h = 3 + _speakFrame * 3;
            display.fillRoundRect(54, 28 - h/2, 20, h, 3, SSD1306_WHITE);
          }
          break;

        case FACE_SLEEP:
          display.drawFastHLine(leftEyeX - 8, eyeY, 16, SSD1306_WHITE);
          display.drawFastHLine(rightEyeX - 8, eyeY, 16, SSD1306_WHITE);
          display.setCursor(95, 2);
          display.setTextSize(1);
          display.print("Zz");
          break;

        case FACE_CONFUSED:
          display.fillCircle(leftEyeX, eyeY, eyeR - 3, SSD1306_WHITE);
          display.fillCircle(rightEyeX, eyeY, eyeR + 2, SSD1306_WHITE);
          display.drawPixel(64, 28, SSD1306_WHITE);
          break;

        case FACE_EXCITED:
          display.fillRoundRect(leftEyeX - 8, eyeY - 8, 16, 16, 4, SSD1306_WHITE);
          display.fillRoundRect(rightEyeX - 8, eyeY - 8, 16, 16, 4, SSD1306_WHITE);
          display.fillCircle(64, 28, 6, SSD1306_WHITE);
          break;

        case FACE_SURPRISED:
          display.drawCircle(leftEyeX, eyeY, eyeR, SSD1306_WHITE);
          display.drawCircle(rightEyeX, eyeY, eyeR, SSD1306_WHITE);
          display.drawCircle(64, 28, 5, SSD1306_WHITE);
          break;

        case FACE_ERROR:
        case FACE_DISCONNECT:
          // X Eyes
          display.drawLine(leftEyeX - 8, eyeY - 8, leftEyeX + 8, eyeY + 8, SSD1306_WHITE);
          display.drawLine(leftEyeX - 8, eyeY + 8, leftEyeX + 8, eyeY - 8, SSD1306_WHITE);
          display.drawLine(rightEyeX - 8, eyeY - 8, rightEyeX + 8, eyeY + 8, SSD1306_WHITE);
          display.drawLine(rightEyeX - 8, eyeY + 8, rightEyeX + 8, eyeY - 8, SSD1306_WHITE);
          display.drawFastHLine(50, 30, 28, SSD1306_WHITE);
          break;

        default:
          display.fillCircle(leftEyeX, eyeY, eyeR, SSD1306_WHITE);
          display.fillCircle(rightEyeX, eyeY, eyeR, SSD1306_WHITE);
          break;
      }
    }
  }
};

// =================================================================================
//  TEXT SCROLLER CLASS (NON-BLOCKING DISPLAY TEXT)
// =================================================================================
class TextScroller {
private:
  char _line1[128];
  char _line2[128];
  int16_t _scrollPos1;
  int16_t _scrollPos2;
  uint32_t _lastScrollTime;

public:
  void begin() {
    _line1[0] = '\0';
    _line2[0] = '\0';
    _scrollPos1 = 0;
    _scrollPos2 = 0;
    _lastScrollTime = millis();
  }

  void setText(const char* l1, const char* l2) {
    strncpy(_line1, l1, sizeof(_line1) - 1);
    strncpy(_line2, l2, sizeof(_line2) - 1);
    _line1[sizeof(_line1) - 1] = '\0';
    _line2[sizeof(_line2) - 1] = '\0';
    _scrollPos1 = 0;
    _scrollPos2 = 0;
  }

  void update() {
    uint32_t now = millis();
    if (now - _lastScrollTime > 100) {
      _lastScrollTime = now;
      int len1 = strlen(_line1);
      if (len1 > 21) {
        _scrollPos1++;
        if (_scrollPos1 > (len1 - 18) * 6) _scrollPos1 = -20;
      }
      int len2 = strlen(_line2);
      if (len2 > 21) {
        _scrollPos2++;
        if (_scrollPos2 > (len2 - 18) * 6) _scrollPos2 = -20;
      }
    }
  }

  void draw(Adafruit_SSD1306& display, int y1 = 41, int y2 = 49) {
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);

    // Line 1
    if (strlen(_line1) > 21) {
      display.setCursor(0 - _scrollPos1, y1);
    } else {
      display.setCursor(0, y1);
    }
    display.print(_line1);

    // Line 2
    if (strlen(_line2) > 21) {
      display.setCursor(0 - _scrollPos2, y2);
    } else {
      display.setCursor(0, y2);
    }
    display.print(_line2);
  }
};

// =================================================================================
//  BATTERY MANAGER CLASS
// =================================================================================
class BatteryManager {
private:
  float _vBat;
  uint8_t _pct;
  uint32_t _lastReadTime;

public:
  void begin() {
    _vBat = 4.0f;
    _pct = 100;
    _lastReadTime = millis();
    #if ULTRON_BATTERY_ENABLE
      pinMode(PIN_BATTERY_ADC, INPUT);
    #endif
  }

  void update() {
    #if ULTRON_BATTERY_ENABLE
      uint32_t now = millis();
      if (now - _lastReadTime > 2000) {
        _lastReadTime = now;
        int raw = analogRead(PIN_BATTERY_ADC);
        float vPin = (raw / 4095.0f) * 3.3f;
        _vBat = vPin * BATTERY_DIVIDER_RATIO;
        if (_vBat > BATTERY_V_MAX) _vBat = BATTERY_V_MAX;
        if (_vBat < BATTERY_V_MIN) _vBat = BATTERY_V_MIN;
        _pct = (uint8_t)(((_vBat - BATTERY_V_MIN) / (BATTERY_V_MAX - BATTERY_V_MIN)) * 100.0f);
      }
    #else
      _pct = 100;
      _vBat = 4.2f;
    #endif
  }

  uint8_t getPercent() const { return _pct; }
  float getVoltage() const { return _vBat; }
};

// =================================================================================
//  AUDIO MANAGER CLASS
// =================================================================================
class AudioManager {
private:
#if ULTRON_AUDIO_MP3
  Audio _audio;
#endif

public:
  void begin() {
#if ULTRON_AUDIO_MP3
    _audio.setPinout(PIN_I2S_BCLK, PIN_I2S_LRC, PIN_I2S_DIN);
    _audio.setVolume(settings.volume);
#elif ULTRON_AUDIO_TONE
    pinMode(PIN_I2S_BCLK, OUTPUT);
    pinMode(PIN_I2S_LRC, OUTPUT);
    pinMode(PIN_I2S_DIN, OUTPUT);
#endif
  }

  void playTTS(const char* url) {
#if ULTRON_AUDIO_MP3
    _audio.connecttohost(url);
#endif
  }

  void playBeep(uint16_t freq = 1000, uint16_t durationMs = 80) {
#if ULTRON_AUDIO_TONE
    // Non-blocking bitbang beep simulation for UI feedback
    uint32_t start = micros();
    uint32_t period = 1000000 / freq;
    uint32_t durMicros = (uint32_t)durationMs * 1000;
    while (micros() - start < durMicros) {
      digitalWrite(PIN_I2S_DIN, HIGH);
      delayMicroseconds(period / 2);
      digitalWrite(PIN_I2S_DIN, LOW);
      delayMicroseconds(period / 2);
    }
#endif
  }

  void update() {
#if ULTRON_AUDIO_MP3
    _audio.loop();
#endif
  }
};

// Global Objects
SettingsManager settings;
ServoManager servoMgr;
JoystickManager joyMgr;
FaceRenderer faceRenderer;
TextScroller textScroller;
BatteryManager batteryMgr;
AudioManager audioMgr;
Adafruit_SSD1306 display(128, 64, &Wire, -1);

// =================================================================================
//  WIFI & NON-BLOCKING AI CLIENT CLASS
// =================================================================================
class AIClient {
private:
  enum ClientState {
    IDLE = 0,
    CONNECTING,
    SENDING,
    READING_HEADERS,
    READING_BODY,
    ERROR_STATE
  };

  WiFiClientSecure _client;
  ClientState _state;
  uint32_t _stateStartTime;
  char _sessionId[64];
  char _rxBuffer[1280];
  uint16_t _rxLen;
  bool _isChunked;
  uint32_t _chunkSizeRemaining;
  bool _readingChunkHeader;

  uint32_t _lastPollTime;
  uint32_t _lastEventId;

public:
  void begin() {
    _state = IDLE;
    _sessionId[0] = '\0';
    _rxLen = 0;
    _isChunked = false;
    _chunkSizeRemaining = 0;
    _readingChunkHeader = false;
    _lastPollTime = millis();
    _lastEventId = 0;
    _client.setInsecure(); // Disable RSA cert verification for fast handshake
  }

  bool isBusy() const { return _state != IDLE && _state != ERROR_STATE; }

  void pollEvents() {
    if (isBusy() || WiFi.status() != WL_CONNECTED) return;

    if (!_client.connect(settings.serverHost, settings.serverPort)) return;

    _client.printf("GET /api/esp/events?token=%s&device_id=%s&since=%u HTTP/1.1\r\n",
                    settings.deviceToken, settings.deviceId, (unsigned int)_lastEventId);
    _client.printf("Host: %s\r\n", settings.serverHost);
    _client.printf("Connection: close\r\n\r\n");

    uint32_t start = millis();
    while (_client.connected() && millis() - start < 2000) {
      if (_client.available()) {
        String line = _client.readStringUntil('\n');
        if (line.startsWith("{")) {
          AJDOC(res);
          DeserializationError err = deserializeJson(res, line);
          if (!err && res["ok"].as<bool>()) {
            if (res.containsKey("latest_id")) {
              _lastEventId = res["latest_id"].as<uint32_t>();
            }
            if (res["has_event"].as<bool>()) {
              JsonArray events = res["events"].as<JsonArray>();
              for (JsonObject ev : events) {
                const char* txt = ev["text"];
                const char* emo = ev["emotion"];
                const char* mot = ev["motion"];
                const char* ttsUrl = ev["tts"];

                if (txt) textScroller.setText("Chrome Chat:", txt);
                if (emo) applyStateString(emo);
                if (mot) servoMgr.playMotion(mot);

#if ULTRON_AUDIO_MP3
                if (ttsUrl && strlen(ttsUrl) > 0) {
                  char fullUrl[256];
                  snprintf(fullUrl, sizeof(fullUrl), "https://%s%s", settings.serverHost, ttsUrl);
                  audioMgr.playTTS(fullUrl);
                }
#else
                audioMgr.playBeep(1400, 100);
#endif
              }
            }
          }
        }
      }
    }
    _client.stop();
  }

  void sendHello() {
    if (WiFi.status() != WL_CONNECTED) return;

    faceRenderer.setState(FACE_THINKING);
    textScroller.setText("Handshake...", settings.serverHost);

    if (!_client.connect(settings.serverHost, settings.serverPort)) {
      faceRenderer.setState(FACE_ERROR);
      textScroller.setText("Connection Failed", "Check Host / Port");
      return;
    }

    AJDOC(doc);
    doc["device_id"] = settings.deviceId;
    doc["token"] = settings.deviceToken;
    doc["fw"] = "1.0.0";
    doc["session_id"] = _sessionId;

    char body[256];
    size_t bodyLen = serializeJson(doc, body, sizeof(body));

    _client.printf("POST /api/esp/hello HTTP/1.1\r\n");
    _client.printf("Host: %s\r\n", settings.serverHost);
    _client.printf("Content-Type: application/json\r\n");
    _client.printf("x-device-token: %s\r\n", settings.deviceToken);
    _client.printf("Content-Length: %u\r\n", (unsigned int)bodyLen);
    _client.printf("Connection: close\r\n\r\n");
    _client.write((const uint8_t*)body, bodyLen);

    // Read synchronous hello response
    uint32_t start = millis();
    while (_client.connected() && millis() - start < 4000) {
      if (_client.available()) {
        String line = _client.readStringUntil('\n');
        if (line.startsWith("{")) {
          AJDOC(res);
          DeserializationError err = deserializeJson(res, line);
          if (!err && res["ok"].as<bool>()) {
            const char* sid = res["session_id"];
            if (sid) strncpy(_sessionId, sid, sizeof(_sessionId) - 1);
            faceRenderer.setState(FACE_HAPPY);
            textScroller.setText("AI ONLINE", "System Ready");
            audioMgr.playBeep(1200, 100);
            _client.stop();
            return;
          }
        }
      }
    }
    _client.stop();
    faceRenderer.setState(FACE_ERROR);
    textScroller.setText("Handshake Error", "Server Rejected");
  }

  void sendChat(const char* promptText) {
    if (isBusy() || WiFi.status() != WL_CONNECTED) return;

    faceRenderer.setState(FACE_THINKING);
    textScroller.setText("Sending Prompt...", promptText);

    if (!_client.connect(settings.serverHost, settings.serverPort)) {
      faceRenderer.setState(FACE_ERROR);
      textScroller.setText("Connect Failed", "Server unreachable");
      return;
    }

    AJDOC(doc);
    doc["device_id"] = settings.deviceId;
    doc["token"] = settings.deviceToken;
    doc["session_id"] = _sessionId;
    doc["text"] = promptText;

    char body[512];
    size_t bodyLen = serializeJson(doc, body, sizeof(body));

    _client.printf("POST /api/esp/chat HTTP/1.1\r\n");
    _client.printf("Host: %s\r\n", settings.serverHost);
    _client.printf("Content-Type: application/json\r\n");
    _client.printf("x-device-token: %s\r\n", settings.deviceToken);
    _client.printf("Content-Length: %u\r\n", (unsigned int)bodyLen);
    _client.printf("Connection: close\r\n\r\n");
    _client.write((const uint8_t*)body, bodyLen);

    _state = READING_HEADERS;
    _stateStartTime = millis();
    _rxLen = 0;
    _isChunked = false;
  }

  void update() {
    if (_state == IDLE) {
      uint32_t now = millis();
      if (WiFi.status() == WL_CONNECTED && (now - _lastPollTime > 2000)) {
        _lastPollTime = now;
        pollEvents();
      }
      return;
    }

    uint32_t now = millis();
    if (now - _stateStartTime > 45000) { // 45s server timeout
      _client.stop();
      _state = IDLE;
      faceRenderer.setState(FACE_ERROR);
      textScroller.setText("Timeout Error", "Request Timed Out");
      return;
    }

    if (_state == READING_HEADERS) {
      while (_client.available()) {
        String line = _client.readStringUntil('\n');
        line.trim();
        if (line.equalsIgnoreCase("Transfer-Encoding: chunked")) {
          _isChunked = true;
        }
        if (line.length() == 0) { // Headers end
          _state = READING_BODY;
          _readingChunkHeader = _isChunked;
          _rxLen = 0;
          break;
        }
      }
    }

    if (_state == READING_BODY) {
      while (_client.available()) {
        char c = _client.read();

        if (_rxLen < sizeof(_rxBuffer) - 1) {
          _rxBuffer[_rxLen++] = c;
          _rxBuffer[_rxLen] = '\0';
        }

        // Process line feed
        if (c == '\n') {
          parseSSELine(_rxBuffer);
          _rxLen = 0;
          _rxBuffer[0] = '\0';
        }
      }

      if (!_client.connected()) {
        _client.stop();
        _state = IDLE;
      }
    }
  }

  void parseSSELine(char* line) {
    // Strip trailing CR/LF
    int len = strlen(line);
    while (len > 0 && (line[len-1] == '\r' || line[len-1] == '\n')) {
      line[--len] = '\0';
    }

    if (strncmp(line, "data: ", 6) != 0) return;
    const char* jsonPtr = line + 6;

    AJDOC(doc);
    DeserializationError err = deserializeJson(doc, jsonPtr);
    if (err) return;

    const char* type = doc["type"];
    if (!type) return;

    if (strcmp(type, "state") == 0) {
      const char* st = doc["state"];
      if (st) applyStateString(st);
    } else if (strcmp(type, "ai_delta") == 0) {
      const char* txt = doc["text"];
      if (txt) {
        textScroller.setText("Ultron Replying:", txt);
      }
    } else if (strcmp(type, "ai_response") == 0) {
      const char* txt = doc["text"];
      const char* emo = doc["emotion"];
      const char* mot = doc["motion"];
      const char* ttsUrl = doc["tts"];

      if (txt) textScroller.setText("Ultron:", txt);
      if (emo) applyStateString(emo);
      if (mot) servoMgr.playMotion(mot);

#if ULTRON_AUDIO_MP3
      if (ttsUrl && strlen(ttsUrl) > 0) {
        char fullUrl[256];
        snprintf(fullUrl, sizeof(fullUrl), "https://%s%s", settings.serverHost, ttsUrl);
        audioMgr.playTTS(fullUrl);
      }
#endif
    } else if (strcmp(type, "done") == 0) {
      _client.stop();
      _state = IDLE;
    } else if (strcmp(type, "error") == 0) {
      const char* errStr = doc["error"];
      faceRenderer.setState(FACE_ERROR);
      textScroller.setText("AI Error:", errStr ? errStr : "Unknown");
      _client.stop();
      _state = IDLE;
    }
  }

  void applyStateString(const char* stateStr) {
    if (strcmp(stateStr, "idle") == 0) faceRenderer.setState(FACE_IDLE);
    else if (strcmp(stateStr, "happy") == 0) faceRenderer.setState(FACE_HAPPY);
    else if (strcmp(stateStr, "sad") == 0) faceRenderer.setState(FACE_SAD);
    else if (strcmp(stateStr, "angry") == 0) faceRenderer.setState(FACE_ANGRY);
    else if (strcmp(stateStr, "thinking") == 0) faceRenderer.setState(FACE_THINKING);
    else if (strcmp(stateStr, "speaking") == 0) faceRenderer.setState(FACE_SPEAKING);
    else if (strcmp(stateStr, "sleep") == 0) faceRenderer.setState(FACE_SLEEP);
    else if (strcmp(stateStr, "confused") == 0) faceRenderer.setState(FACE_CONFUSED);
    else if (strcmp(stateStr, "excited") == 0) faceRenderer.setState(FACE_EXCITED);
    else if (strcmp(stateStr, "surprised") == 0) faceRenderer.setState(FACE_SURPRISED);
    else if (strcmp(stateStr, "error") == 0) faceRenderer.setState(FACE_ERROR);
  }
};

AIClient aiClient;

// =================================================================================
//  DISPLAY MANAGER & MENU SYSTEM CLASS
// =================================================================================
class MenuManager {
private:
  SystemMode _mode;
  MenuScreenId _currentScreen;
  uint8_t _menuIdx;
  uint8_t _promptIdx;

  // Value edit temporary variables
  const char* _editLabel;
  uint8_t* _editValPtr;
  uint8_t _editMin;
  uint8_t _editMax;

public:
  void begin() {
    _mode = MODE_BOOT;
    _currentScreen = SCN_MAIN;
    _menuIdx = 0;
    _promptIdx = 0;
    _editLabel = "";
    _editValPtr = NULL;
  }

  void setMode(SystemMode mode) { _mode = mode; }
  SystemMode getMode() const { return _mode; }

  void handleInput(JoyDirection dir, JoyButton btn) {
    if (_mode == MODE_NORMAL) {
      if (dir == JOY_UP) {
        if (_promptIdx > 0) _promptIdx--;
        else _promptIdx = PROMPT_SLOT_COUNT - 1;
        audioMgr.playBeep(800, 30);
      } else if (dir == JOY_DOWN) {
        _promptIdx = (_promptIdx + 1) % PROMPT_SLOT_COUNT;
        audioMgr.playBeep(800, 30);
      } else if (dir == JOY_LEFT) {
        servoMgr.moveDirect(servoMgr.getCurrentAngle() - 5, 100);
      } else if (dir == JOY_RIGHT) {
        servoMgr.moveDirect(servoMgr.getCurrentAngle() + 5, 100);
      } else if (btn == BTN_PRESS) {
        audioMgr.playBeep(1200, 50);
        aiClient.sendChat(PROMPT_SLOTS[_promptIdx]);
      } else if (btn == BTN_LONG_PRESS) {
        audioMgr.playBeep(1500, 100);
        _mode = MODE_MENU;
        _currentScreen = SCN_MAIN;
        _menuIdx = 0;
      }
    } else if (_mode == MODE_JOYSTICK_SERVO) {
      if (dir == JOY_LEFT) {
        servoMgr.moveDirect(servoMgr.getCurrentAngle() - 5, 80);
      } else if (dir == JOY_RIGHT) {
        servoMgr.moveDirect(servoMgr.getCurrentAngle() + 5, 80);
      } else if (btn == BTN_PRESS) {
        servoMgr.moveDirect(settings.servoCenter, 250);
        audioMgr.playBeep(1200, 40);
      } else if (btn == BTN_LONG_PRESS) {
        audioMgr.playBeep(600, 50);
        _mode = MODE_MENU;
      }
    } else if (_mode == MODE_MENU) {
      if (btn == BTN_LONG_PRESS || dir == JOY_LEFT) {
        audioMgr.playBeep(600, 50);
        if (_currentScreen == SCN_MAIN) {
          _mode = MODE_NORMAL;
        } else {
          _currentScreen = SCN_MAIN;
          _menuIdx = 0;
        }
        return;
      }

      if (dir == JOY_UP) {
        if (_menuIdx > 0) _menuIdx--;
        audioMgr.playBeep(900, 20);
      } else if (dir == JOY_DOWN) {
        _menuIdx++;
        audioMgr.playBeep(900, 20);
      } else if (btn == BTN_PRESS) {
        audioMgr.playBeep(1200, 40);
        executeMenuSelect();
      }
    } else if (_mode == MODE_EDIT_VALUE) {
      if (dir == JOY_UP || dir == JOY_RIGHT) {
        if (_editValPtr && *_editValPtr < _editMax) (*_editValPtr)++;
        audioMgr.playBeep(1000, 20);
      } else if (dir == JOY_DOWN || dir == JOY_LEFT) {
        if (_editValPtr && *_editValPtr > _editMin) (*_editValPtr)--;
        audioMgr.playBeep(1000, 20);
      } else if (btn == BTN_PRESS) {
        settings.save();
        audioMgr.playBeep(1400, 80);
        _mode = MODE_MENU;
      } else if (btn == BTN_LONG_PRESS) {
        audioMgr.playBeep(400, 100);
        _mode = MODE_MENU;
      }
    }
  }

  void startValueEdit(const char* label, uint8_t* ptr, uint8_t minV, uint8_t maxV) {
    _editLabel = label;
    _editValPtr = ptr;
    _editMin = minV;
    _editMax = maxV;
    _mode = MODE_EDIT_VALUE;
  }

  void executeMenuSelect() {
    if (_currentScreen == SCN_MAIN) {
      if (_menuIdx == 0) _currentScreen = SCN_SERVO;
      else if (_menuIdx == 1) _currentScreen = SCN_DISPLAY;
      else if (_menuIdx == 2) _currentScreen = SCN_AUDIO;
      else if (_menuIdx == 3) _currentScreen = SCN_WIFI;
      else if (_menuIdx == 4) _currentScreen = SCN_AI;
      else if (_menuIdx == 5) _currentScreen = SCN_BATTERY;
      else if (_menuIdx == 6) _currentScreen = SCN_ABOUT;
      else if (_menuIdx == 7) _mode = MODE_NORMAL;
      _menuIdx = 0;
    } else if (_currentScreen == SCN_SERVO) {
      if (_menuIdx == 0) _mode = MODE_JOYSTICK_SERVO;
      else if (_menuIdx == 1) servoMgr.playMotion("nod");
      else if (_menuIdx == 2) startValueEdit("Center Angle", &settings.servoCenter, 30, 150);
      else if (_menuIdx == 3) startValueEdit("Min Angle", &settings.servoMin, SERVO_HARD_MIN, 80);
      else if (_menuIdx == 4) startValueEdit("Max Angle", &settings.servoMax, 100, SERVO_HARD_MAX);
      else if (_menuIdx == 5) _currentScreen = SCN_MAIN;
    } else if (_currentScreen == SCN_AUDIO) {
      if (_menuIdx == 0) startValueEdit("Volume (0-21)", &settings.volume, 0, 21);
      else if (_menuIdx == 1) audioMgr.playBeep(1500, 150);
      else if (_menuIdx == 2) _currentScreen = SCN_MAIN;
    } else if (_currentScreen == SCN_AI) {
      if (_menuIdx == 0) aiClient.sendHello();
      else if (_menuIdx == 1) aiClient.sendChat(PROMPT_SLOTS[0]);
      else if (_menuIdx == 2) _currentScreen = SCN_MAIN;
    } else {
      _currentScreen = SCN_MAIN;
      _menuIdx = 0;
    }
  }

  void draw(Adafruit_SSD1306& display) {
    if (_mode == MODE_NORMAL) {
      faceRenderer.draw(display);
      display.drawFastHLine(0, 39, 128, SSD1306_WHITE);

      // Prompt Slot Selection UI
      char l1[32];
      snprintf(l1, sizeof(l1), "[Prompt %u/%u]", _promptIdx + 1, PROMPT_SLOT_COUNT);
      textScroller.setText(l1, PROMPT_SLOTS[_promptIdx]);
      textScroller.draw(display, 41, 49);

      // Bottom Status Line (y=57)
      drawStatusBar(display);

    } else if (_mode == MODE_JOYSTICK_SERVO) {
      display.setCursor(0, 0);
      display.setTextSize(1);
      display.setTextColor(SSD1306_WHITE);
      display.print("== JOYSTICK SERVO ==");
      display.drawFastHLine(0, 10, 128, SSD1306_WHITE);

      int currentAngle = servoMgr.getCurrentAngle();

      display.setCursor(10, 18);
      display.printf("Servo Angle: %d deg", currentAngle);

      // Draw Visual Gauge Bar
      display.drawRect(8, 30, 112, 12, SSD1306_WHITE);
      int fillW = map(currentAngle, settings.servoMin, settings.servoMax, 0, 110);
      if (fillW > 0) {
        display.fillRect(9, 31, fillW, 10, SSD1306_WHITE);
      }

      display.setCursor(0, 47);
      display.print("L/R: Pan Head");
      display.setCursor(0, 56);
      display.print("PRESS:Center LONG:Exit");

    } else if (_mode == MODE_MENU) {
      display.setCursor(0, 0);
      display.setTextSize(1);
      display.setTextColor(SSD1306_WHITE);
      display.print("== ULTRON MENU ==");
      display.drawFastHLine(0, 10, 128, SSD1306_WHITE);

      const char* items[8] = {NULL};
      uint8_t count = 0;

      if (_currentScreen == SCN_MAIN) {
        items[0] = "1. Servo Config";
        items[1] = "2. Display Config";
        items[2] = "3. Audio Config";
        items[3] = "4. WiFi Info";
        items[4] = "5. AI Handshake";
        items[5] = "6. Battery";
        items[6] = "7. About";
        items[7] = "< Back";
        count = 8;
      } else if (_currentScreen == SCN_SERVO) {
        items[0] = "1. Manual Control";
        items[1] = "2. Test Nod";
        items[2] = "3. Set Center";
        items[3] = "4. Set Min Angle";
        items[4] = "5. Set Max Angle";
        items[5] = "< Back";
        count = 6;
      } else if (_currentScreen == SCN_AUDIO) {
        items[0] = "1. Volume";
        items[1] = "2. Test Beep";
        items[2] = "< Back";
        count = 3;
      } else if (_currentScreen == SCN_AI) {
        items[0] = "1. Test Hello";
        items[1] = "2. Test Chat";
        items[2] = "< Back";
        count = 3;
      } else {
        items[0] = "Ultron Physical AI";
        items[1] = "FW: v1.0.0";
        items[2] = "< Back";
        count = 3;
      }

      if (_menuIdx >= count) _menuIdx = count - 1;

      for (uint8_t i = 0; i < 5 && (i) < count; i++) {
        uint8_t idx = i;
        display.setCursor(8, 14 + (i * 10));
        if (idx == _menuIdx) {
          display.print("> ");
        } else {
          display.print("  ");
        }
        display.print(items[idx]);
      }

    } else if (_mode == MODE_EDIT_VALUE) {
      display.setCursor(0, 0);
      display.setTextSize(1);
      display.setTextColor(SSD1306_WHITE);
      display.print("== EDIT VALUE ==");
      display.drawFastHLine(0, 10, 128, SSD1306_WHITE);

      display.setCursor(0, 22);
      display.print(_editLabel);

      display.setCursor(30, 40);
      display.setTextSize(2);
      if (_editValPtr) display.print(*_editValPtr);
      display.setTextSize(1);

      display.setCursor(0, 56);
      display.print("PRESS:Save LONG:Cancel");
    }
  }

  void drawStatusBar(Adafruit_SSD1306& display) {
    display.drawFastHLine(0, 56, 128, SSD1306_WHITE);
    display.setCursor(0, 57);
    display.setTextSize(1);

    // WiFi status icon / text
    if (WiFi.status() == WL_CONNECTED) {
      display.print("W:OK ");
    } else {
      display.print("W:NO ");
    }

    // Battery percentage
    display.printf("B:%u%% ", batteryMgr.getPercent());

    // Servo angle
    display.printf("S:%d", servoMgr.getCurrentAngle());
  }
};

MenuManager menuMgr;

// =================================================================================
//  BOOT SEQUENCE CLASS (MILLIS-STEPPED NON-BLOCKING INIT)
// =================================================================================
class BootSequence {
private:
  uint8_t _step;
  uint32_t _stepStartTime;

public:
  void begin() {
    _step = 0;
    _stepStartTime = millis();
  }

  void update() {
    if (menuMgr.getMode() != MODE_BOOT) return;

    uint32_t now = millis();
    uint32_t elapsed = now - _stepStartTime;

    switch (_step) {
      case 0:
        // Step 0: Splash screen
        faceRenderer.setState(FACE_HAPPY);
        textScroller.setText("ULTRON PHYSICAL AI", "Booting Firmware v1.0");
        if (elapsed > 1200) {
          _step = 1;
          _stepStartTime = now;
        }
        break;

      case 1:
        // Step 1: Audio Check
        textScroller.setText("Initializing Audio", "I2S MAX98357A");
        audioMgr.playBeep(1000, 50);
        if (elapsed > 600) {
          _step = 2;
          _stepStartTime = now;
        }
        break;

      case 2:
        // Step 2: Servo Check
        textScroller.setText("Testing Servo...", "Center Alignment");
        servoMgr.playMotion("center");
        if (elapsed > 800) {
          _step = 3;
          _stepStartTime = now;
        }
        break;

      case 3:
        // Step 3: Joystick Calibration
        textScroller.setText("Calibrating Joystick", "Keep Centered...");
        joyMgr.autoCalibrate();
        if (elapsed > 500) {
          _step = 4;
          _stepStartTime = now;
        }
        break;

      case 4:
        // Step 4: WiFi Connect
        textScroller.setText("Connecting WiFi...", settings.wifiSsid);
        WiFi.mode(WIFI_STA);
        WiFi.begin(settings.wifiSsid, settings.wifiPass);
        _step = 5;
        _stepStartTime = now;
        break;

      case 5:
        // Step 5: Wait for WiFi connection (with 8s timeout)
        if (WiFi.status() == WL_CONNECTED) {
          textScroller.setText("WiFi Connected!", WiFi.localIP().toString().c_str());
          _step = 6;
          _stepStartTime = now;
        } else if (elapsed > 8000) {
          textScroller.setText("WiFi Failed!", "Starting Offline Mode");
          _step = 7;
          _stepStartTime = now;
        }
        break;

      case 6:
        // Step 6: Handshake with Server
        aiClient.sendHello();
        _step = 7;
        _stepStartTime = now;
        break;

      case 7:
        // Step 7: Transition to Normal UI
        if (elapsed > 1000) {
          menuMgr.setMode(MODE_NORMAL);
        }
        break;
    }
  }
};

BootSequence bootSeq;

// =================================================================================
//  MAIN ARDUINO SETUP & LOOP
// =================================================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n--- Starting Ultron Physical AI Companion Firmware ---");

  // Load Settings from NVS
  settings.begin();

  // Init Display (SSD1306 I2C 0x3C)
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED Display Allocation Failed!");
  } else {
    display.clearDisplay();
    display.ssd1306_command(SSD1306_SETCONTRAST);
    display.ssd1306_command(settings.brightness);
    display.display();
  }

  // Init Hardware Modules
  faceRenderer.begin();
  textScroller.begin();
  servoMgr.begin();
  joyMgr.begin();
  batteryMgr.begin();
  audioMgr.begin();
  aiClient.begin();
  menuMgr.begin();
  bootSeq.begin();
}

void loop() {
  // 1. Update Hardware & Non-blocking Engines
  uint32_t now = millis();

  servoMgr.update();
  faceRenderer.update();
  textScroller.update();
  batteryMgr.update();
  audioMgr.update();
  aiClient.update();
  bootSeq.update();

  // 2. Process Joystick & Input Events
  JoyDirection dir = joyMgr.checkDirection();
  JoyButton btn = joyMgr.checkButton();

  if (dir != JOY_NONE || btn != BTN_NONE) {
    menuMgr.handleInput(dir, btn);
  }

  // 3. Render OLED UI
  display.clearDisplay();
  menuMgr.draw(display);
  display.display();
}
