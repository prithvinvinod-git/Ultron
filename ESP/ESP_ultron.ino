/*
 * =================================================================================
 *  ESP32 ULTRON PHYSICAL AI COMPANION FIRMWARE
 *  Single-File Modular Arduino .ino Firmware for ESP32-WROOM-32
 * =================================================================================
 *  Target Hardware:
 *   - ESP32-WROOM-32 (38-pin DevKit)
 *   - 0.96" OLED Display (SSD1306, 128x64, I2C 0x3C)
 *   - 2-Axis Analog Joystick (VRx, VRy, SW)
 *   - SG90 Micro Servo (3-wire: signal / +5 V / GND), optional MOSFET enable
 *   - MAX98357A I2S Amp (7-pin VIN-only module: BCLK, LRC, DIN, SD, GAIN, GND, VIN)
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

// =================================================================================
//  BUILD SETUP
// =================================================================================
//  Board ........ ESP32 Dev Module            (Arduino IDE: Tools > Board)
//  Core ......... Arduino ESP32 Boards by Espressif Systems, v2.0.17+
//  Flash size ... 4 MB, partition scheme "Default 4MB with spiffs (1.2MB APP)"
//  Upload speed . 921600
//  PSRAM ........ not required
//
//  Libraries (all via Library Manager):
//    Adafruit SSD1306            +  Adafruit GFX Library
//    ESP32Servo                  (Murchaser's fork, provides <ESP32Servo.h>)
//    ESP32-audioI2S              (schreibfaul1, provides "Audio.h" - TTS playback)
//    ArduinoJson                 (v6.4+ or v7; AJDOC picks the right document type)
//
//  Note: "Audio.h" resolves to ESP32-audioI2S. If the IDE reports
//  'Multiple libraries were found for "Audio.h"', point it at the
//  ESP32-audioI2S folder - the Arduino IDE will then use that copy.
// =================================================================================
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
#define ULTRON_AUDIO_MP3       1   // 1 = Requires ESP32-audioI2S library & streams MP3 TTS
#define ULTRON_AUDIO_TONE      0   // 1 = Local I2S beep sound generator (forced 0 if MP3 is 1)
#define ULTRON_BATTERY_ENABLE  0   // 1 = Enables battery ADC voltage monitoring
#define ULTRON_LIGHT_SLEEP     0   // 1 = Enables automatic light-sleep after inactivity
#define ULTRON_USER_FACE_BITMAP 0  // 1 = Uses custom face bitmap from PROGMEM hook
#define ULTRON_BITMAP_FACES    1   // 1 = Uses lopaka-generated bitmap faces for emotions


#if (ULTRON_AUDIO_MP3 == 1)
  #undef ULTRON_AUDIO_TONE
  #define ULTRON_AUDIO_TONE 0
  #include "Audio.h"
#endif

// =================================================================================
//  CONNECTION DETAILS
// =================================================================================
//  These are only the NVS fallbacks. Every value is overridable at runtime from
//  the on-device menu (long-press the joystick -> Servo/Display/WiFi screens)
//  and is then persisted to the "ultron_cfg" NVS namespace, so editing these
//  defines below only matters on a factory-fresh board.
//
//    Device ....... ESP32-WROOM-32 DevKit (38-pin), Arduino core for ESP32
//    Role ......... WiFi STATION client of the Ultron AI server
//    WiFi ......... 2.4 GHz only, WPA2 personal
//    Server ....... HTTPS on 443; the TTS mp3 comes back on the same host
//    Identity ..... deviceId + deviceToken are sent in the handshake header
//
//  -----------------------------------------------------------------------
//  | WiFi SSID ........ FTTH-BBNL-CHANNEL-9547
//  | WiFi Password .... Pksalina@5560
//  | Server host ...... ultron-ai-ten.vercel.app
//  | Server port ...... 443 (HTTPS)
//  | Device ID ........ ultron_01
//  | Device token ..... ultron_secret_123
//  -----------------------------------------------------------------------
//
//  WiFi credentials:
#define DEFAULT_WIFI_SSID     "FTTH-BBNL-CHANNEL-9547"
#define DEFAULT_WIFI_PASS     "Pksalina@5560"
// AI server:
#define DEFAULT_SERVER_HOST   "ultron-ai-ten.vercel.app"
#define DEFAULT_SERVER_PORT   443
// Device identity presented during the handshake:
#define DEFAULT_DEVICE_ID     "ultron_01"
#define DEFAULT_DEVICE_TOKEN  "ultron_secret_123"

// =================================================================================
//  HARDWARE WIRING / PINOUT
// =================================================================================
//  Board: ESP32-WROOM-32 DevKit, 38-pin. Every peripheral is 3.3 V logic.
//
//  --------------------------- Power topology ----------------------------
//  One external 5 V adapter does all the current-hungry work; the ESP32's own
//  3.3 V regulator feeds only the two low-current parts.
//
//       5 V adapter (>= 5 V / 2 A, 3 A preferred)
//            |
//            +--> ESP32 VIN          (onboard LDO/AMS1117 makes 3.3 V)
//            |         |
//            |         +--> 3.3 V pin --> OLED VCC
//            |         +--> 3.3 V pin --> Joystick VCC
//            |
//            +--> SG90 red wire      (servo, 4.8-6 V)
//            +--> MAX98357A VIN      (2.5-5.5 V)
//            +--> common GND to all of the above
//
//  | Load                    | Rail      | Typical / stall current |
//  |-------------------------|-----------|-------------------------|
//  | ESP32 (via VIN)         | 5 V       | 80-250 mA               |
//  | OLED SSD1306            | 3.3 V     | 10-20 mA                |
//  | Joystick                | 3.3 V     | ~5 mA (pot + pull-up)   |
//  | SG90 servo (moving)     | 5 V       | 100-250 mA              |
//  | SG90 servo (stalling)   | 5 V       | ~700 mA - 1 A           |
//  | MAX98357A + speaker     | 5 V       | 2.4 mA idle, ~1 A peak  |
//  Peak on the 5 V rail is roughly 2.25 A (servo stall + amp peak + ESP32),
//  so use at least 5 V / 2 A. Keeping the servo and amp off the USB rail means
//  brownout resets and I2S crackle are no longer a concern.
//
//  Program over USB with the 5 V adapter DISCONNECTED, or confirm the board
//  has an input-protection diode between VIN and the USB 5 V pin. On boards
//  without one, feeding VIN while USB is plugged in back-feeds the host port.
//
//  The ESP32's GPIO levels are always 3.3 V regardless of the 5 V supply, so
//  the servo signal, BCLK/LRC/DIN and I2C lines are all 3.3 V - no level
//  shifting needed anywhere.
//  --------------------------- OLED 0.96" SSD1306 (I2C, addr 0x3C) -------
//  | ESP32 | OLED | Notes                                  |
//  |-------|------|----------------------------------------|
//  |  GPIO21| SDA  | I2C data                                |
//  |  GPIO22| SCL  | I2C clock                               |
//  |   3.3V | VCC  | from ESP32 3.3 V pin                      |
//  |   GND  | GND  |                                         |
//  (no reset pin wired; the -1 in the constructor means "no RESET")
//
//  ---------------------------- SG90 servo (3-pin) ----------------------
//  | ESP32        | SG90    | Wire colour (typical) | Notes            |
//  |--------------|---------|----------------------|------------------|
//  |  GPIO25      | signal  | orange / white      | PWM position     |
//  |  VIN / 5 V   | +5 V    | red                 | from 5 V adapter  |
//  |  GND         | GND     | brown / black       | common ground     |
//
//  Power note: an SG90 stalls at roughly 700 mA-1 A. The red wire goes to the
//  same 5 V adapter as the ESP32 VIN pin, and the brown/black wire to GND.
//  Do not power the servo from a GPIO pin or from the 3.3 V rail.
//
//  Optional MOSFET (only if SERVO_USE_MOSFET is set to 1): gate an N-channel
//  MOSFET between the supply and the servo red wire, with the gate on GPIO26,
//  so the firmware can cut servo power after 1 s of no motion. Leave GPIO26
//  unconnected otherwise - it is harmless.
//
//  --------------------- MAX98357A I2S amplifier (7-pin module) ---------
//  This is the common breakout that exposes: LRC, DIN, SD, BCLK, GAIN, GND,
//  VIN. There is NO VCC pin - VIN is the only supply input (2.5 V to 5.5 V).
//
//  | ESP32 | Module | Notes                                    |
//  |-------|--------|------------------------------------------|
//  |  GPIO14| BCLK   | bit clock                                |
//  |  GPIO13| LRC    | left/right word select                   |
//  |  GPIO33| DIN    | data in (was 25; 25 is the servo pin)    |
//  |  VIN   | VIN    | 5 V supply. NEVER 3.3 V-only logic here. |
//  |  GND   | GND    | must be joined to the ESP32 ground       |
//  |   ---  | SD     | leave OPEN - see below                   |
//  |   ---  | GAIN   | leave OPEN - see below                   |
//  Speaker goes to B+ / B- on the module's speaker terminal.
//
//  SD and GAIN must be left open on this board. Do NOT wire either one:
//
//    SD open  = amplifier ENABLED. SD is pulled low to enter shutdown, so
//               tying SD to GND gives you a completely dead amp (no sound
//               at all). Floating SD enables the part and plays the
//               (Left + Right) / 2 mono mix - correct for the duplicated
//               mono stream ESP32-audioI2S sends.
//    GAIN open = 9 dB, the factory default and the right choice here.
//               Note the table is not intuitive (datasheet Table 8):
//                 GAIN to VIN direct = 6 dB
//                 GAIN to VIN + 100k = 3 dB
//                 GAIN floating    = 9 dB  <-- leave it alone
//                 GAIN to GND direct = 12 dB (louder, more clipping)
//                 GAIN to GND + 100k = 15 dB (max, distorts easily)
//
//  3.3 V logic is fine even with VIN at 5 V. The datasheet specifies the
//  digital audio inputs at VIH = 1.3 V max / VIL = 0.6 V max (characterised at
//  VDD = 5 V), so the ESP32's 3.3 V pins clear the threshold by ~2 V and no
//  level shifter is needed. VIN at 5 V also gives the most output power
//  (3.2 W into 4 ohm at 10% THD, versus ~1 W at 3.3 V).
//
//  The module already carries its own 0.1 uF + 10 uF decoupling. If you ever
//  hear clicks on playback start, add 470 uF across VIN and GND.
//
//  ---------------------------- 2-axis analog joystick -----------------
//  | ESP32 | Joystick | Notes                                   |
//  |-------|----------|-----------------------------------------|
//  |  GPIO34| VRx      | ADC1_CH6, input only, no pulldown       |
//  |  GPIO35| VRy      | ADC1_CH7, input only                   |
//  |  GPIO32| SW       | push button, INPUT_PULLUP (active LOW) |
//  |   3.3V | VCC      | from ESP32 3.3 V pin                    |
//  |   GND  | GND      |                                         |
//  ADC1 only - ADC2 is unusable while the WiFi radio is on.
//
//  ---------------------------- Battery divider (optional) -------------
//  | ESP32 | Divider | Notes                                    |
//  |-------|---------|------------------------------------------|
//  |  GPIO36| ADC out | ADC1_CH0, input only; ratio 2.0        |
//  VBAT --[ R1 ]--+--[ R2 ]-- GND, with the junction into GPIO36.
//  Enable with ULTRON_BATTERY_ENABLE 1.
//
//  ---------------------------- microSD (optional, disabled) ----------
//  | ESP32 | SD   |      | ESP32 | SD   |
//  |-------|------|------|-------|------|
//  |  GPIO5 | CS   |      | GPIO23 | MOSI |
//  | GPIO19 | MISO |      | GPIO18 | SCK  |
//  Enable with ULTRON_SD_ENABLE 1.
//
//  ---------------------------- power budget ---------------------------
//  ESP32 devkit: USB or VIN 5 V, ~500 mA peak.
//  Servo + amplifier: their own 5-6 V supply, several hundred mA while moving.
//  Join the grounds of the ESP32, servo and amplifier at one common point.
// =================================================================================

// --- GPIO PIN DEFINITIONS ---
// I2C Pins (SSD1306 OLED)
#define PIN_I2C_SDA           21
#define PIN_I2C_SCL           22

// Analog Joystick Pins (ADC1 ONLY - WiFi occupies ADC2)
#define PIN_JOY_VRX           34  // ADC1_CH6
#define PIN_JOY_VRY           35  // ADC1_CH7
#define PIN_JOY_SW            32  // Digital Input with Pullup

// Servo Control Pins
// A plain 3-wire SG90 only needs the signal line; its +5 V and GND go straight
// to the power header. PIN_SERVO_EN is only used if you add a MOSFET to switch
// the servo's supply (see SERVO_USE_MOSFET below).
#define PIN_SERVO_SIG         25  // PWM Output (orange/white wire)
#define PIN_SERVO_EN          26  // MOSFET gate - only used when SERVO_USE_MOSFET = 1

// Set to 1 only if a MOSFET is actually wired to PIN_SERVO_EN. With a bare
// 3-pin SG90 leave this at 0 so the firmware keeps the servo attached and it
// holds its angle instead of going limp.
//   0 = bare SG90 on VIN/5V: servo stays attached, power is never gated
//   1 = MOSFET switched supply: power is cut ~1 s after the last move so the
//       SG90 stops buzzing and running hot
#define SERVO_USE_MOSFET      0

// MAX98357A I2S Audio Pins (VIN-only 7-pin module - SD and GAIN stay open)
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
// 128x38 is 608 bytes. Without this, flipping the flag on without pasting real
// artwork compiles fine and then drawBitmap() walks 607 bytes past the end of
// the array, which shows as garbage on the panel rather than an obvious fault.
_Static_assert(sizeof(ultron_user_face_bmp) >= 608,
               "ultron_user_face_bmp needs >= 608 bytes for 128x38; paste the artwork first");
#endif

// =================================================================================
//  PROGMEM BITMAP ART LIBRARY
// =================================================================================
//  Exported from https://lopaka.org using its "Adafruit GFX / 1-bit C array" export.
//  Arrays are 1-bit packed MSB-first, row major, each row padded to a whole byte -
//  exactly what Adafruit_GFX::drawBitmap() expects.  The byte length of an array
//  therefore MUST equal ((width + 7) / 8) * height, which the static_asserts at the
//  bottom of this section enforce at compile time.
//
//  NOTE: ESP32 has no separate program address space (PROGMEM expands to nothing),
//  so a plain 'const unsigned char*' can safely reference these arrays.
#if ULTRON_BITMAP_FACES

// --- Composite face descriptor -------------------------------------------------
// Lopaka exports each face as separate layers. The descriptor keeps the layer
// geometry (x, y, w, h) beside the pixel data so the renderer never has to guess.
struct LopakaFace {
  const unsigned char* eyeL;   int16_t eyeLX;   int16_t eyeLY;   int16_t eyeLW;   int16_t eyeLH;
  const unsigned char* eyeR;   int16_t eyeRX;   int16_t eyeRY;   int16_t eyeRW;   int16_t eyeRH;
  const unsigned char* mouth;  int16_t mouthX;  int16_t mouthY;  int16_t mouthW;  int16_t mouthH;
  const unsigned char* extra;  int16_t extraX;  int16_t extraY;  int16_t extraW;  int16_t extraH;
  bool blinkable; // false when the art already depicts closed eyes
};

// --- Face art: NORMAL (two round eyes + smile) --------------------------------
static const unsigned char PROGMEM ultron_bmp_normal_mouth[] = {0xc0,0x03,0xe0,0x07,0xf8,0x1f,0x7f,0xfe,0x3f,0xfc,0x0f,0xf0};
static const unsigned char PROGMEM ultron_bmp_normal_eye_l[] = {
0x3f,0xff,0xf8,0x00,0x7f,0xff,0xfe,0x00,0xff,0xff,0xff,0x00,0xff,0xff,0xff,0x80,0xff,0xff,0xff,0x80,0xff,0xff,0xff,0x80,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0x80,0xff,0xff,0xff,0x80,0xff,0xff,0xff,0x80,0xff,0xff,0xff,0x80,0xff,0xff,0xff,0x00,0x7f,0xff,0xff,0x00,0x7f,0xff,0xff,0x00,0x7f,0xff,0xfe,0x00,0x7f,0xff,0xfe,0x00,0x3f,0xff,0xfc,0x00,0x1f,0xff,0xf8,0x00,0x0f,0xff,0xe0,0x00,0x07,0xff,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00
};
static const unsigned char PROGMEM ultron_bmp_normal_eye_r[] = {
0x07,0xff,0xff,0x00,0x1f,0xff,0xff,0x80,0x3f,0xff,0xff,0xc0,0x7f,0xff,0xff,0xc0,0x7f,0xff,0xff,0xc0,0x7f,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0x7f,0xff,0xff,0xc0,0x7f,0xff,0xff,0xc0,0x7f,0xff,0xff,0xc0,0x7f,0xff,0xff,0xc0,0x3f,0xff,0xff,0xc0,0x3f,0xff,0xff,0x80,0x3f,0xff,0xff,0x80,0x1f,0xff,0xff,0x80,0x1f,0xff,0xff,0x80,0x0f,0xff,0xff,0x00,0x07,0xff,0xfe,0x00,0x01,0xff,0xfc,0x00,0x00,0x3f,0xf8,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00
};

// --- Face art: QUESTION (eyes + floating question mark) -----------------------
static const unsigned char PROGMEM ultron_bmp_question_mark[] = {0x70,0x88,0x04,0x04,0x04,0x08,0x30,0x20,0x00,0x20};
static const unsigned char PROGMEM ultron_bmp_question_eye_r[] = {
0x0f,0xff,0xc0,0x00,0x7f,0xff,0xf8,0x00,0xff,0xff,0xfe,0x00,0xc0,0x00,0x0f,0x00,0x80,0x00,0x03,0x80,0x00,0x00,0x01,0x80,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0f,0xff,0xc0,0x00,0x3f,0xff,0xf0,0x00,0x7f,0xff,0xfc,0x00,0x7f,0xff,0xfe,0x00,0xff,0xff,0xff,0x00,0xff,0xff,0xff,0x00,0xff,0xff,0xff,0x80,0xff,0xff,0xff,0x80,0xff,0xff,0xff,0x80,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0x80,0xff,0xff,0xff,0x80,0xff,0xff,0xff,0x80,0xff,0xff,0xff,0x80,0xff,0xff,0xff,0x00,0x7f,0xff,0xff,0x00,0x7f,0xff,0xff,0x00,0x7f,0xff,0xfe,0x00,0x7f,0xff,0xfe,0x00,0x3f,0xff,0xfc,0x00,0x1f,0xff,0xf8,0x00,0x0f,0xff,0xe0,0x00,0x07,0xff,0x00,0x00,0x00,0x00,0x00,0x00,0x00
};
static const unsigned char PROGMEM ultron_bmp_question_eye_l[] = {
0x00,0xff,0xfc,0x00,0x07,0xff,0xff,0x80,0x1f,0xff,0xff,0xc0,0x3c,0x00,0x00,0xc0,0x70,0x00,0x00,0x40,0x60,0xff,0xfc,0x00,0x03,0xff,0xff,0x00,0x0f,0xff,0xff,0x80,0x1f,0xff,0xff,0x80,0x3f,0xff,0xff,0xc0,0x3f,0xff,0xff,0xc0,0x7f,0xff,0xff,0xc0,0x7f,0xff,0xff,0xc0,0x7f,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0x7f,0xff,0xff,0xc0,0x7f,0xff,0xff,0xc0,0x7f,0xff,0xff,0xc0,0x7f,0xff,0xff,0xc0,0x3f,0xff,0xff,0xc0,0x3f,0xff,0xff,0x80,0x3f,0xff,0xff,0x80,0x1f,0xff,0xff,0x80,0x1f,0xff,0xff,0x80,0x0f,0xff,0xff,0x00,0x07,0xff,0xfe,0x00,0x01,0xff,0xfc,0x00,0x00,0x3f,0xf8,0x00,0x00,0x00,0x00,0x00
};

// --- Face art: SLEEPY (closed eyes + "Zzz") -----------------------------------
static const unsigned char PROGMEM ultron_bmp_sleep_eye[] = {0x1f,0xff,0xfe,0x00,0x7f,0xff,0xff,0x80,0x7f,0xff,0xff,0x80,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0xff,0xff,0xff,0xc0,0x7f,0xff,0xff,0x80,0x7f,0xff,0xff,0x80,0x1f,0xff,0xfe,0x00};
static const unsigned char PROGMEM ultron_bmp_sleep_mouth[] = {0xc0,0x03,0xf0,0x0f,0x7f,0xfe,0x3f,0xfc,0x0f,0xf0};
static const unsigned char PROGMEM ultron_bmp_sleep_zzz[] = {0x03,0xc0,0x00,0x80,0x01,0x00,0x03,0xc0,0x00,0x00,0x1e,0x00,0x04,0x00,0x08,0x00,0x1e,0x00,0x00,0x00,0xf0,0x00,0x20,0x00,0x40,0x00,0xf0,0x00};

// --- Full-screen splash art ---------------------------------------------------
static const unsigned char PROGMEM ultron_bmp_splash_getit[] = {
0xfd,0x44,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x10,0x01,0x40,0x00,0x00,0xfa,0xaa,0xa2,0x20,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x21,0xf8,0xa0,0x00,0x00,0xf7,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x4e,0x04,0x20,0x00,0x00,0xfa,0xaa,0xa8,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x70,0x03,0x10,0x00,0x00,0xfd,0x44,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x80,0x00,0x90,0x00,0x00,0xfa,0xaa,0xa2,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x06,0x0f,0xf8,0x70,0x00,0x00,0xf7,0x51,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0x80,0x08,0x70,0x07,0x18,0x00,0x00,0xfa,0xab,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x80,0x11,0x80,0x00,0xc4,0x00,0x00,0xfd,0x43,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x80,0x26,0x00,0x00,0x32,0x00,0x00,0xfa,0xa3,0x07,0xcc,0xcc,0xc0,0x00,0x00,0x00,0x80,0x58,0x00,0x00,0x0a,0x00,0x00,0xf7,0x53,0x07,0xcc,0xdd,0xc0,0x00,0x00,0x00,0x80,0xa0,0x00,0x00,0x05,0x00,0x00,0xfa,0xa3,0x0d,0x9f,0x99,0x80,0x00,0x00,0x00,0x81,0x40,0x00,0x00,0x04,0x80,0x00,0xfd,0x43,0x0d,0x9f,0x80,0x00,0x00,0x00,0x00,0x82,0x80,0x00,0x00,0x02,0x80,0x00,0xfa,0xa3,0x1f,0x33,0x33,0x00,0x00,0x00,0x00,0x83,0x00,0x00,0x00,0x01,0x40,0x00,0xf7,0x53,0x1f,0x33,0x33,0x00,0x00,0x00,0x00,0x82,0x00,0x00,0x00,0x00,0xc0,0x00,0xfa,0xa3,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x84,0x00,0x00,0x08,0x00,0x20,0x00,0xfd,0x43,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x84,0x00,0x00,0x04,0x00,0x20,0x00,0xfa,0xa3,0x07,0x92,0x79,0x21,0x07,0x0e,0xf8,0x88,0x00,0x40,0x00,0x00,0x10,0x00,0xf7,0x53,0x04,0x94,0x4a,0x41,0x08,0x90,0x20,0x88,0x00,0x40,0x02,0x00,0x10,0x00,0xfa,0xa3,0x08,0xb8,0x8a,0x42,0x10,0x38,0x40,0x90,0x00,0xc0,0x02,0x04,0x90,0x00,0xfd,0x43,0x09,0x24,0xf1,0x82,0x13,0x20,0x40,0x90,0x00,0xc0,0x00,0x02,0x48,0x00,0xfa,0xa3,0x11,0x49,0x11,0x04,0x22,0x40,0x80,0xa4,0x00,0xc8,0x01,0x02,0x08,0x00,0xf7,0x53,0x0e,0x49,0x26,0x04,0x1e,0x78,0x80,0xa1,0x01,0xc8,0x04,0x82,0x48,0x00,0xfa,0xa3,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xc8,0x41,0xcc,0x10,0xf2,0x48,0x00,0xfd,0x43,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xcb,0x03,0xcc,0x06,0x42,0x48,0x00,0xfa,0xa3,0x05,0xf0,0xf1,0xe2,0x21,0x00,0x00,0x90,0x63,0xcc,0x30,0x41,0x10,0x00,0xf7,0x53,0x04,0x40,0x89,0x22,0x13,0x00,0x00,0xb0,0x03,0xcc,0x08,0x01,0x50,0x00,0xfa,0xa3,0x08,0x81,0x12,0x24,0x13,0x00,0x00,0xd0,0x00,0x4e,0x08,0x41,0x60,0x00,0xfd,0x43,0x08,0x81,0x12,0x44,0x92,0x00,0x00,0x90,0x07,0x8e,0x00,0x41,0x70,0x00,0xfa,0xa3,0x11,0x02,0x24,0x49,0x20,0x00,0x00,0x90,0x07,0xfe,0x04,0x40,0x70,0x00,0xf7,0x53,0x11,0x02,0x23,0x8e,0xc4,0x00,0x00,0x90,0x07,0xfe,0x04,0x40,0x70,0x00,0xfa,0xa3,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x90,0x0f,0xfe,0x00,0x40,0x70,0xc0,0xfd,0x43,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x90,0x00,0xff,0x01,0xc0,0x70,0x20,0xfa,0xa3,0xff,0xff,0xff,0xff,0xff,0xe0,0xff,0x90,0x8f,0xff,0xfe,0x10,0x60,0x90,0xf7,0x53,0xff,0xff,0xff,0xff,0xff,0xf0,0x7f,0x08,0x00,0x7f,0xc0,0x31,0x60,0x60,0xfa,0xa0,0x00,0x00,0x00,0x00,0x00,0x38,0x30,0x08,0x80,0xfa,0xe0,0x70,0x60,0x00,0xfd,0x40,0x00,0x00,0x00,0x00,0x00,0x1c,0x18,0x08,0x8f,0xf5,0xff,0xf1,0x40,0x00,0xfa,0xaa,0xa2,0x00,0x00,0x00,0x00,0x0e,0x0c,0x08,0xff,0xff,0xff,0xb0,0x40,0x00,0xf7,0x50,0x00,0x00,0x00,0x00,0x00,0x07,0x06,0x07,0xf7,0xf7,0xff,0x70,0x40,0x00,0xfa,0xaa,0xa8,0x00,0x00,0x00,0x00,0x03,0x83,0x01,0x6f,0xef,0xff,0xf0,0x60,0x20,0xfd,0x44,0x00,0x00,0x00,0x00,0x00,0x01,0xc1,0x81,0x7f,0xd7,0xff,0xf0,0x60,0x10,0xfa,0xaa,0xa2,0x20,0x00,0x00,0x00,0x00,0xe0,0xc0,0xff,0xc7,0xff,0xf0,0x60,0x48,0xf7,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x7f,0xe0,0x7f,0xe3,0xff,0xf0,0x60,0x28,0xfa,0xaa,0xa8,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xbf,0xff,0xff,0xf0,0x50,0x10,0xfd,0x44,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xbf,0xff,0xef,0xf0,0x50,0x00,0xfa,0xaa,0xa2,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xbf,0xe0,0x0f,0xf0,0x58,0x00,0xf7,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x9f,0x9f,0xcf,0xe8,0x48,0x00,0xfa,0xaa,0xa8,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x9f,0xcf,0x9f,0xe8,0x64,0x00,0xfd,0x44,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x8f,0xc0,0x1f,0xc8,0x9a,0x00,0xfa,0xaa,0xa2,0x20,0x00,0x00,0x00,0x00,0x00,0x00,0x87,0xe0,0x3f,0xc8,0x87,0x80,0xf7,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x8b,0xf0,0x7f,0xc8,0x80,0x00,0xfa,0xaa,0xa8,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x89,0xf8,0xff,0x48,0x80,0x00,0xfd,0x44,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x20,0x88,0xff,0xfe,0x48,0x80,0x00,0xfa,0xaa,0xa2,0x00,0x00,0x00,0x00,0x00,0x00,0x30,0x88,0xff,0xff,0x48,0x80,0x00,0xf7,0x50,0x00,0x00,0x3f,0xff,0xff,0xe0,0x00,0x38,0x48,0xbf,0xf8,0x48,0x80,0x00,0xfa,0xaa,0xa8,0x00,0x26,0x22,0x22,0x20,0x00,0x2c,0x48,0x8f,0xc0,0x44,0x80,0x00,0xfd,0x44,0x00,0x00,0x2a,0xae,0xeb,0x7f,0xff,0xe6,0x48,0x80,0x00,0x44,0x80,0x00,0xfa,0xaa,0xa2,0x20,0x2a,0xa2,0x2b,0x60,0x00,0x03,0x48,0xc0,0x01,0x44,0x80,0x00,0xf7,0x50,0x00,0x00,0x2a,0xaf,0xab,0x7f,0xff,0xe6,0x48,0xe0,0x03,0xc4,0x83,0xf0,0xfa,0xaa,0xa8,0x00,0x26,0x22,0x2b,0x60,0x00,0x2c,0x4b,0xf0,0x07,0xe4,0x9d,0xfe,0xfd,0x44,0x00,0x00,0x3f,0xff,0xff,0xe0,0x00,0x38,0x4d,0xf8,0x1f,0xfc,0xe1,0xff,0xfa,0xaa,0xa2,0x00,0x00,0x00,0x00,0x00,0x00,0x30,0x49,0xff,0xff,0xec,0x81,0xff,0xf7,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x20,0xc9,0xff,0xff,0x1c,0x83,0xff,0xfa,0xaa,0xa8,0x00,0x00,0x00,0x00,0x00,0x00,0x03,0xa8,0xff,0xf8,0xfc,0x83,0xff,0x00,0x00
};

static const unsigned char PROGMEM ultron_bmp_splash_success[] = {
0x00,0x00,0x03,0xff,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x1d,0x00,0xf0,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x60,0x00,0x0c,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0xd0,0x00,0x03,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x06,0x80,0x00,0x00,0xc0,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0d,0x40,0x00,0x00,0x20,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x1a,0x00,0x00,0x00,0x10,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x35,0x00,0x00,0x00,0x08,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x68,0x00,0x00,0x00,0x04,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xd4,0x00,0x00,0x00,0x04,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xa0,0x00,0x00,0x00,0x02,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x54,0x00,0x00,0x00,0x02,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0xa0,0x00,0x7c,0x00,0x02,0x00,0x00,0x00,0x00,0x00,0x00,0x03,0x50,0x01,0x83,0x00,0x01,0x00,0x00,0x00,0x22,0x20,0x00,0x02,0x80,0x02,0x3e,0x80,0x01,0x00,0x00,0x00,0x22,0x20,0x00,0x03,0x50,0x04,0x79,0xc0,0x01,0x00,0x00,0x02,0x12,0x42,0x00,0x06,0x80,0x04,0xf0,0xc0,0x00,0x80,0x00,0x01,0x12,0x44,0x00,0x05,0x50,0x08,0xf0,0xe0,0x00,0x80,0x00,0x00,0x80,0x08,0x00,0x06,0x80,0x09,0xf9,0xe0,0x00,0x80,0x00,0x00,0x00,0x00,0x00,0x05,0x50,0x09,0xff,0x20,0x00,0x8f,0xc0,0x00,0x3d,0xc0,0x60,0x0a,0x00,0x09,0xfd,0x60,0x00,0xf0,0x30,0x18,0x40,0x21,0x80,0x0d,0x50,0x09,0xff,0xe0,0x03,0x80,0x08,0x06,0x41,0x90,0x00,0x0a,0x00,0x04,0xfe,0xc0,0x1c,0x00,0x04,0x00,0x40,0x48,0x00,0x0d,0x50,0x04,0xff,0xc0,0xe0,0x00,0x04,0x00,0x41,0xa8,0x00,0x0a,0x00,0x02,0xc0,0xc0,0x00,0x00,0x04,0x1e,0x41,0xa9,0xe0,0x0d,0x50,0x01,0x80,0x20,0x00,0x00,0xfc,0x00,0x40,0x00,0x00,0x0a,0x00,0x01,0x00,0x00,0x00,0x07,0x04,0x00,0x40,0x08,0x00,0x0d,0x50,0x01,0x00,0x00,0x00,0x18,0x04,0x00,0x40,0x08,0x00,0x0a,0x00,0x00,0x00,0x00,0x00,0x60,0x04,0x06,0x40,0x09,0x80,0x0d,0x50,0x00,0x00,0x00,0x01,0x80,0x04,0x18,0x40,0x08,0x60,0x1a,0x00,0x00,0x04,0x00,0x06,0x00,0x08,0x00,0x3f,0xf0,0x00,0x15,0x50,0x00,0x04,0x00,0x18,0x00,0x10,0x00,0x00,0x02,0x00,0x1a,0x00,0x00,0x02,0x00,0x60,0x00,0x20,0x01,0x00,0x01,0x00,0x15,0x50,0x00,0x01,0x83,0x80,0x00,0xc0,0x02,0x22,0x20,0x80,0x1a,0x00,0x00,0x00,0x7c,0x00,0x01,0x00,0x00,0x22,0x20,0x00,0x15,0x50,0x00,0x00,0x00,0x00,0x06,0x00,0x00,0x42,0x10,0x00,0x3a,0x00,0x00,0x00,0x00,0x00,0x08,0x00,0x00,0x42,0x10,0x00,0x35,0x54,0x00,0x00,0x00,0x00,0x30,0x00,0x00,0x00,0x00,0x00,0x7a,0x80,0x00,0x00,0x00,0x00,0x40,0x00,0x3c,0x00,0x00,0x00,0x75,0x54,0x00,0x00,0x00,0x03,0xc0,0x00,0x42,0x03,0x80,0x00,0xfa,0xa0,0x00,0x00,0x00,0x1f,0xc0,0x00,0x81,0x0c,0x40,0x00,0xf5,0x55,0x00,0x00,0x00,0xff,0x40,0x01,0x01,0x10,0x20,0x00,0xfa,0xa0,0x00,0x00,0x03,0xff,0x40,0x06,0x01,0x20,0x20,0x00,0xf5,0x55,0x40,0x00,0x00,0xfc,0x40,0x08,0x01,0x40,0x20,0x00,0xfa,0xa0,0x00,0x20,0x00,0x00,0x60,0x10,0x01,0x80,0x20,0x00,0xf5,0x55,0x00,0x18,0x00,0x00,0x70,0x60,0x01,0x00,0x40,0x00,0xea,0x80,0x00,0x06,0x00,0x00,0x7f,0x80,0x02,0x00,0x40,0x00,0xf5,0x54,0x00,0x01,0x80,0x00,0x7e,0x00,0x02,0x00,0x40,0x00,0xea,0x00,0x00,0x00,0x70,0x00,0xf0,0x00,0x04,0x00,0x80,0x00,0xf5,0x54,0x00,0x00,0x0f,0xff,0x00,0x00,0x04,0x00,0x80,0x00,0xea,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x08,0x01,0x00,0x00,0xf5,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x08,0x02,0x00,0x00,0xe8,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x14,0x02,0x00,0x00,0xd5,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x2a,0x04,0x00,0x00,0xe8,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x55,0x48,0x00
};

// --- Pre-assembled face descriptors -------------------------------------------
static const LopakaFace LOPAKA_NORMAL = {
  ultron_bmp_normal_eye_l,   28, 13, 26, 37,
  ultron_bmp_normal_eye_r,   76, 13, 26, 37,
  ultron_bmp_normal_mouth,   57, 48, 16,  6,
  NULL,                       0,  0,  0,  0,
  true
};

static const LopakaFace LOPAKA_QUESTION = {
  ultron_bmp_question_eye_l,  28, 18, 26, 32,
  ultron_bmp_question_eye_r,  76, 11, 26, 39,
  ultron_bmp_normal_mouth,    57, 48, 16,  6,
  ultron_bmp_question_mark,  106,  2,  6, 10,
  true
};

static const LopakaFace LOPAKA_SLEEP = {
  ultron_bmp_sleep_eye,       28, 41, 26,  9,
  ultron_bmp_sleep_eye,       76, 41, 26,  9,
  ultron_bmp_sleep_mouth,     57, 49, 16,  5,
  ultron_bmp_sleep_zzz,      105, 14, 10, 14,
  false
};

// --- Compile-time geometry guards ---------------------------------------------
#define ULTRON_BMP_ASSERT(name, w, h) \
  static_assert(sizeof(name) == (size_t)(((w) + 7) / 8) * (h), \
                #name " length does not match its " #w "x" #h " draw geometry");
ULTRON_BMP_ASSERT(ultron_bmp_normal_mouth,     16,  6)
ULTRON_BMP_ASSERT(ultron_bmp_normal_eye_l,     26, 37)
ULTRON_BMP_ASSERT(ultron_bmp_normal_eye_r,     26, 37)
ULTRON_BMP_ASSERT(ultron_bmp_question_mark,     6, 10)
ULTRON_BMP_ASSERT(ultron_bmp_question_eye_r,   26, 39)
ULTRON_BMP_ASSERT(ultron_bmp_question_eye_l,   26, 32)
ULTRON_BMP_ASSERT(ultron_bmp_sleep_eye,        26,  9)
ULTRON_BMP_ASSERT(ultron_bmp_sleep_mouth,      16,  5)
ULTRON_BMP_ASSERT(ultron_bmp_sleep_zzz,        10, 14)
ULTRON_BMP_ASSERT(ultron_bmp_splash_getit,    128, 64)
ULTRON_BMP_ASSERT(ultron_bmp_splash_success,   91, 55)

#endif // ULTRON_BITMAP_FACES

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

  // --- Auto / manual ownership ---------------------------------------------
  // AUTO   : the emotion engine drives the servo from the AI reply, plus a
  //          slow idle drift so the head never looks frozen.
  // MANUAL : the joystick owns the servo and the engine stays out of the way.
  bool _autoMode;
  uint8_t _idleStep;
  uint32_t _nextIdleMove;

  // Joystick offsets, kept separately from the absolute servo angle so emotion
  // motions play relative to wherever the stick left the head.
  int _panOffset;
  int _tiltOffset;

  // AUTO self-test: chains the real emotion motions on a timer so the AUTO path
  // can be proven without waiting for a chat reply. It borrows AUTO even when
  // the stick is in MANUAL, then hands ownership back exactly as it found it.
  bool _selfTest;
  bool _selfTestPrevAuto;
  uint32_t _selfTestNext;
  uint8_t _selfTestStep;

  static const char* selfTestMotion(uint8_t i) {
    static const char* names[] = {
      "nod", "excited", "look_left", "look_right", "thinking", "center"
    };
    return names[i % 6];
  }

static const int PAN_RANGE  = 40;
static const int TILT_RANGE = 30;

  // How far the head actually swings. One servo with a ±70 deg budget (centre 90,
  // effective travel 20-160) but the keyframe tables below were written at ±8-25
  // degrees, so the robot barely moved and read as faulty. MOTION_GAIN scales
  // every table offset in one place instead of rewriting a dozen tables, and
  // SERVO_MAX_SWING caps a single swing so a joystick-panned base angle still has
  // room to travel before clampAngle() flattens it against a limit.
#if defined(__cplusplus) && __cplusplus >= 201103L
  static constexpr float MOTION_GAIN = 2.0f;
  static constexpr int SERVO_MAX_SWING = 55;
#else
  #define MOTION_GAIN 2.0f
  #define SERVO_MAX_SWING 55
#endif

  static int scaledOffset(int offset) {
    long v = (long)((float)offset * 2.0f);
    if (v >  55) v =  55;
    if (v < -55) v = -55;
    return (int)v;
  }

public:
  void begin() {
    pinMode(PIN_SERVO_SIG, OUTPUT);
#if SERVO_USE_MOSFET
    pinMode(PIN_SERVO_EN, OUTPUT);
    digitalWrite(PIN_SERVO_EN, LOW); // MOSFET off initially
#endif
    _attached = false;
    _currentAngle = settings.servoCenter;
    _targetAngle = settings.servoCenter;
    _animating = false;
    _currentSequence = NULL;
    _sequenceLen = 0;
    _sequenceIdx = 0;
    _autoMode = true;
    _idleStep = 0;
    _nextIdleMove = millis() + 6000;
    _panOffset = 0;
    _tiltOffset = 0;
    _selfTest = false;
    _selfTestPrevAuto = true;
    _selfTestNext = 0;
    _selfTestStep = 0;
#if !SERVO_USE_MOSFET
    // The supply is always live, so attach and centre straight away. Otherwise
    // the horn would sit at the SG90's mechanical rest position until the first
    // emotion move arrived, then jump.
    _servo.attach(PIN_SERVO_SIG);
    _servo.write(settings.servoCenter);
    _attached = true;
#endif
  }

  bool isAutoMode() const { return _autoMode; }

  void toggleAutoMode() {
    _autoMode = !_autoMode;
    // Drop any queued emotion sequence so the new owner starts clean.
    _currentSequence = NULL;
    _sequenceLen = 0;
    _sequenceIdx = 0;
    _animating = false;
    _nextIdleMove = millis() + 6000;
  }

  void setAutoMode(bool on) {
    if (_autoMode != on) toggleAutoMode();
  }

  void runAutoSelfTest() {
    _selfTestPrevAuto = _autoMode;
    _selfTest = true;
    _selfTestStep = 0;
    _selfTestNext = millis();
    // Borrow AUTO so playMotion()'s ownership check does not swallow every
    // motion; ownership is restored when the run finishes.
    if (!_autoMode) setAutoMode(true);
    Serial.println("[SERVO] AUTO self-test: start");
  }

  int clampAngle(int angle) const {
    if (angle < settings.servoMin) return settings.servoMin;
    if (angle > settings.servoMax) return settings.servoMax;
    return angle;
  }

  // Angle the head returns to between motions: centre plus whatever the stick
  // has dialled in.
  int baseAngle() const {
    return clampAngle(settings.servoCenter + _panOffset + _tiltOffset);
  }

  // --- Joystick steering -------------------------------------------------------
  // Horizontal stick pans, vertical stick tilts. Both only move the offsets, so
  // switching back to auto mode continues from this pose instead of snapping.
  void nudge(int delta, uint16_t durationMs = 100) {
    _panOffset = constrain(_panOffset + delta, -PAN_RANGE, PAN_RANGE);
    moveDirect(baseAngle(), durationMs);
  }

  void tilt(int delta, uint16_t durationMs = 100) {
    _tiltOffset = constrain(_tiltOffset + delta, -TILT_RANGE, TILT_RANGE);
    moveDirect(baseAngle(), durationMs);
  }

  void recenter() {
    _panOffset = 0;
    _tiltOffset = 0;
    moveDirect(baseAngle(), 400);
  }

  void enablePower(bool enable) {
    // With a bare 3-pin SG90 there is no switchable supply, so the servo must
    // stay attached at all times or it will simply drop to its rest position.
    if (enable) {
#if SERVO_USE_MOSFET
      digitalWrite(PIN_SERVO_EN, HIGH);
#endif
      if (!_attached) {
        _servo.attach(PIN_SERVO_SIG);
        _attached = true;
      }
    } else {
#if SERVO_USE_MOSFET
      if (_attached) {
        _servo.detach();
        _attached = false;
      }
      digitalWrite(PIN_SERVO_EN, LOW);
#endif
    }
  }

  void moveDirect(int targetAngle, uint16_t durationMs = 400) {
    targetAngle = clampAngle(targetAngle);
    if (targetAngle == _currentAngle && !_animating) return;

    // Throttled trace. Without this there is no way to tell "the firmware never
    // asked for a move" apart from "it asked and the servo ignored it", which
    // is the whole question when the head is not moving.
    {
      static uint32_t lastTrace = 0;
      uint32_t t = millis();
      if (t - lastTrace > 400) {
        lastTrace = t;
        Serial.print("[SERVO] ");
        Serial.print(_currentAngle);
        Serial.print(" -> ");
        Serial.print(targetAngle);
        Serial.print(" in ");
        Serial.print(durationMs);
        Serial.print("ms  auto=");
        Serial.println(_autoMode ? 1 : 0);
      }
    }

    enablePower(true);
    _startAngle = _currentAngle;
    _targetAngle = targetAngle;
    _animStartTime = millis();
    _animDuration = durationMs > 0 ? durationMs : 100;
    _animating = true;
    _lastMoveTime = millis();
  }

  // Maps an emotion to the motion that sells it. Called whenever the AI reports
  // a new emotion, so the head reacts even if the reply carries no motion hint.
  void playEmotionMotion(const char* emotion) {
    if (!_autoMode) return;
    if (emotion == NULL) return;
    playMotion(emotion);
  }

  void playMotion(const char* motionName) {
    if (!_autoMode) return;
    playMotionAny(motionName);
  }

  // Explicit user command (menu "Test Servo"): runs even in MANUAL, because the
  // person asked for it. playMotion() above is for autonomous reactions, which
  // must respect the joystick's ownership of the head.
  void playMotionForced(const char* motionName) {
    playMotionAny(motionName);
  }

  void playMotionAny(const char* motionName) {
    if (motionName == NULL) return;
    if (strcmp(motionName, "center") == 0) {
      recenter();
    } else if (strcmp(motionName, "nod") == 0) {
      static const Keyframe kf[] = {{0, 150}, {20, 250}, {-15, 250}, {0, 200}};
      startSequence(kf, sizeof(kf)/sizeof(kf[0]));
    } else if (strcmp(motionName, "nod_fast") == 0) {
      static const Keyframe kf[] = {{0, 100}, {25, 150}, {-20, 150}, {20, 150}, {0, 100}};
      startSequence(kf, sizeof(kf)/sizeof(kf[0]));
    } else if (strcmp(motionName, "look_left") == 0) {
      _panOffset = -PAN_RANGE;
      moveDirect(baseAngle(), 450);
    } else if (strcmp(motionName, "look_right") == 0) {
      _panOffset = PAN_RANGE;
      moveDirect(baseAngle(), 450);
    } else if (strcmp(motionName, "tilt_left") == 0) {
      _tiltOffset = -TILT_RANGE;
      moveDirect(baseAngle(), 350);
    } else if (strcmp(motionName, "tilt_right") == 0) {
      _tiltOffset = TILT_RANGE;
      moveDirect(baseAngle(), 350);
    } else if (strcmp(motionName, "excited") == 0 || strcmp(motionName, "surprised") == 0) {
      static const Keyframe kf[] = {{-25, 120}, {25, 120}, {-25, 120}, {25, 120}, {0, 150}};
      startSequence(kf, sizeof(kf)/sizeof(kf[0]));
    } else if (strcmp(motionName, "confused") == 0) {
      static const Keyframe kf[] = {{-15, 300}, {15, 300}, {0, 300}};
      startSequence(kf, sizeof(kf)/sizeof(kf[0]));
    } else if (strcmp(motionName, "thinking") == 0) {
      static const Keyframe kf[] = {{-20, 500}, {-20, 400}, {0, 350}};
      startSequence(kf, sizeof(kf)/sizeof(kf[0]));
    } else if (strcmp(motionName, "sleep") == 0) {
      _tiltOffset = -TILT_RANGE;
      _panOffset = -PAN_RANGE;
      moveDirect(baseAngle(), 800);

    // --- Emotion aliases -------------------------------------------------------
    // The AI reports an emotion ("happy", "sad", ...) and optionally a separate
    // motion. Feeding the emotion string straight in means the head still reacts
    // when the reply has no motion field of its own.
    } else if (strcmp(motionName, "happy") == 0 || strcmp(motionName, "listening") == 0) {
      static const Keyframe kf[] = {{0, 120}, {14, 180}, {0, 140}};
      startSequence(kf, sizeof(kf)/sizeof(kf[0]));
    } else if (strcmp(motionName, "speaking") == 0) {
      // Small bobs, repeated while a reply is being spoken.
      static const Keyframe kf[] = {{0, 180}, {8, 140}, {-8, 140}, {0, 140}};
      startSequence(kf, sizeof(kf)/sizeof(kf[0]));
    } else if (strcmp(motionName, "sad") == 0) {
      static const Keyframe kf[] = {{0, 200}, {-10, 700}, {-10, 600}, {0, 300}};
      startSequence(kf, sizeof(kf)/sizeof(kf[0]));
    } else if (strcmp(motionName, "angry") == 0) {
      static const Keyframe kf[] = {{-12, 120}, {12, 120}, {-12, 120}, {0, 120}};
      startSequence(kf, sizeof(kf)/sizeof(kf[0]));
    } else if (strcmp(motionName, "sleeping") == 0) {
      _tiltOffset = -TILT_RANGE;
      _panOffset = -PAN_RANGE;
      moveDirect(baseAngle(), 800);
    } else if (strcmp(motionName, "offline") == 0 || strcmp(motionName, "error") == 0) {
      static const Keyframe kf[] = {{-8, 250}, {8, 250}, {0, 250}};
      startSequence(kf, sizeof(kf)/sizeof(kf[0]));
    } else if (strcmp(motionName, "idle") == 0) {
      // Handled by the idle drift in update(); nothing to queue.
    }
  }

  void startSequence(const Keyframe* seq, uint8_t len) {
    _currentSequence = seq;
    _sequenceLen = len;
    _sequenceIdx = 0;
    if (len > 0) {
      moveDirect(baseAngle() + scaledOffset(_currentSequence[0].offset),
                 _currentSequence[0].duration);
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
          moveDirect(baseAngle() + scaledOffset(_currentSequence[_sequenceIdx].offset),
                     _currentSequence[_sequenceIdx].duration);
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
      // Auto-detach servo power after 1000ms idle to prevent jitter/buzzing.
      // Only possible when the supply is switched by a MOSFET; on a bare
      // 3-pin SG90 the servo keeps holding its last angle.
#if SERVO_USE_MOSFET
      if (_attached && (now - _lastMoveTime > 1000)) {
        enablePower(false);
      }
#endif

      // AUTO self-test runs first so the idle drift cannot interleave with it.
      if (_selfTest && (int32_t)(now - _selfTestNext) >= 0) {
        if (_selfTestStep >= 6) {
          _selfTest = false;
          _autoMode = _selfTestPrevAuto;
          _nextIdleMove = now + 6000;
          Serial.print("[SERVO] AUTO self-test: done, mode=");
          Serial.println(_autoMode ? "AUTO" : "MANUAL");
        } else {
          Serial.print("[SERVO] self-test motion: ");
          Serial.println(selfTestMotion(_selfTestStep));
          playMotionAny(selfTestMotion(_selfTestStep));
          _selfTestStep++;
          _selfTestNext = now + 2300;
        }
      }

      // Idle drift: in AUTO mode a long silence would leave the head frozen,
      // which reads as broken hardware.
      //
      // The old list was {-9, 0, +10, +4, -6, 0}. Two of those six entries are
      // zero, and moveDirect() returns early when the target already matches, so
      // one drift step in three did nothing at all. What was left was a set of
      // 4-10 degree hops with a flat hold between each one, which reads as a
      // twitch every 7-11s rather than a robot that is quietly alive.
      //
      // Now it wanders further, never asks for a zero-length step, and varies
      // how long it lingers at each stop.
      if (_autoMode && !_selfTest && _currentSequence == NULL &&
          (int32_t)(now - _nextIdleMove) >= 0) {
        static const int8_t drift[] = {-16, -7, 5, 15, 9, -3, -13, 4};
        static const uint16_t dwell[] = {1200, 850, 950, 1150, 800, 1100, 900, 1000};
        const uint8_t n = (uint8_t)(sizeof(drift) / sizeof(drift[0]));
        const uint8_t i = (uint8_t)(_idleStep % n);
        moveDirect(baseAngle() + drift[i], dwell[i]);
        _idleStep++;
        // Pause longer between drifts so the head reads as thinking rather than
        // scanning back and forth.
        _nextIdleMove = now + (uint32_t)dwell[i] + 6000 +
                        ((uint32_t)(_idleStep * 271) % 3500);
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
        // 15ms rather than 30: a light click on the KY-023 switch can easily be
        // under 30ms, and a dropped press here is indistinguishable from a
        // broken button.
        if (dur >= 15 && dur < 900) {
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
//  SPLASH SCREEN MANAGER (NON-BLOCKING FULL-PANEL OVERLAY)
// =================================================================================
//  Lopaka also exported two full-screen artworks. They are shown as transient
//  overlays on top of whatever else is on the panel, driven purely by millis()
//  so the non-blocking guarantee is preserved.
enum SplashId {
  SPLASH_NONE = 0,
  SPLASH_BOOT_LOGO,   // "getit"          - 128x64
  SPLASH_AI_SUCCESS   // "DolphinSuccess" - 91x55
};

class SplashManager {
private:
  uint8_t _id;
  uint32_t _untilMs;

public:
  void begin() {
    _id = SPLASH_NONE;
    _untilMs = 0;
  }

  bool isActive() const {
    return _id != SPLASH_NONE && (int32_t)(millis() - _untilMs) < 0;
  }

  void show(uint8_t id, uint16_t durationMs) {
    _id = id;
    _untilMs = millis() + durationMs;
  }

  void update() {
    if (_id != SPLASH_NONE && (int32_t)(millis() - _untilMs) >= 0) {
      _id = SPLASH_NONE;
    }
  }

  void draw(Adafruit_SSD1306& d) {
    if (!isActive()) return;
#if ULTRON_BITMAP_FACES
    if (_id == SPLASH_BOOT_LOGO) {
      d.drawBitmap(0, 0, ultron_bmp_splash_getit, 128, 64, SSD1306_WHITE);
    } else if (_id == SPLASH_AI_SUCCESS) {
      d.drawBitmap(18, 4, ultron_bmp_splash_success, 91, 55, SSD1306_WHITE);
    }
#else
    (void)d;
#endif
  }
};

extern SplashManager splashMgr;

// =================================================================================
//  FACE RENDERER CLASS (OLED ANIMATION ENGINE)
// =================================================================================
//  Two interchangeable back ends, selected at compile time:
//    ULTRON_BITMAP_FACES == 1  -> lopaka PROGMEM artwork (see LopakaFace above)
//    ULTRON_BITMAP_FACES == 0  -> the original vector/primitive renderer
class FaceRenderer {
private:
  FaceState _state;
  uint32_t _lastBlinkTime;
  uint32_t _blinkDuration;
  bool _isBlinking;
  uint8_t _speakFrame;
  uint32_t _lastSpeakTime;

#if ULTRON_BITMAP_FACES
  // --- Bitmap back end ---------------------------------------------------------
  static const LopakaFace* designFor(FaceState state) {
    switch (state) {
      case FACE_THINKING:
      case FACE_CONFUSED:
        return &LOPAKA_QUESTION;
      case FACE_SLEEP:
        return &LOPAKA_SLEEP;
      default:
        // idle / happy / sad / angry / speaking / excited / surprised / error
        return &LOPAKA_NORMAL;
    }
  }

  // A blink is produced by punching the eye layer out to black and drawing a
  // closed-lid line across the middle of the original eye rectangle.
  static void drawClosedEye(Adafruit_SSD1306& d, int16_t x, int16_t y, int16_t w, int16_t h) {
    d.fillRect(x, y, w, h, SSD1306_BLACK);
    d.drawFastHLine(x + 3, y + (h / 2), w - 6, SSD1306_WHITE);
  }

  void drawBitmapFace(Adafruit_SSD1306& display) {
    const LopakaFace* f = designFor(_state);
    if (f == NULL) return;

    if (f->eyeL)  display.drawBitmap(f->eyeLX,  f->eyeLY,  f->eyeL,  f->eyeLW,  f->eyeLH,  SSD1306_WHITE);
    if (f->eyeR)  display.drawBitmap(f->eyeRX,  f->eyeRY,  f->eyeR,  f->eyeRW,  f->eyeRH,  SSD1306_WHITE);
    if (f->mouth) display.drawBitmap(f->mouthX, f->mouthY, f->mouth, f->mouthW, f->mouthH, SSD1306_WHITE);
    if (f->extra) display.drawBitmap(f->extraX, f->extraY, f->extra, f->extraW, f->extraH, SSD1306_WHITE);

    if (_isBlinking && f->blinkable) {
      drawClosedEye(display, f->eyeLX, f->eyeLY, f->eyeLW, f->eyeLH);
      drawClosedEye(display, f->eyeRX, f->eyeRY, f->eyeRW, f->eyeRH);
    }
  }
#endif

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

#if ULTRON_BITMAP_FACES
    // Lopaka artwork back end: a handful of pre-rendered layers, no primitives.
    // The art already reaches down to roughly y=54, so the caller must reserve
    // the rows below the face for the status bar (see MenuManager).
    drawBitmapFace(display);
    return;
#else
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
#endif // ULTRON_BITMAP_FACES
  }
};

// =================================================================================
//  CHAT LOG (SERIAL MIRROR ONLY - THE OLED IS PURE BITMAP UI)
// =================================================================================
//  Design note: the SSD1306 shows lopaka artwork and nothing else. Replies are
//  spoken through the MAX98357A I2S amplifier, so keeping chat text on a 128x64
//  panel only adds clutter. Text is still mirrored to the serial console for
//  debugging, which is what this helper replaced the on-screen TextScroller with.
void logMessage(const char* l1, const char* l2 = NULL) {
  Serial.print("[ultron] ");
  Serial.println(l1 ? l1 : "");
  if (l2 != NULL && l2[0] != '\0') {
    Serial.print("         ");
    Serial.println(l2);
  }
}

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
// Sound effects are synthesised server-side and streamed through the same
// I2S path as TTS. See /api/esp/tone for the list of names.
#define ULTRON_STARTUP_DRONE   1   // 1 = rotor-style spin-up sound after boot
#define ULTRON_IDLE_SOUNDS     1   // 1 = occasional idle chirp matching the face
#define ULTRON_IDLE_SOUND_MIN_MS 9000  // earliest gap between idle chirps

// Sound effect identifiers -> /api/esp/tone?name=...
enum SoundId {
  SND_OK,
  SND_ERROR,
  SND_TOGGLE_ON,
  SND_TOGGLE_OFF,
  SND_IDLE_NORMAL,
  SND_IDLE_HAPPY,
  SND_IDLE_QUESTION,
  SND_IDLE_SLEEP,
  SND_STARTUP
};

class AudioManager {
private:
#if ULTRON_AUDIO_MP3
  Audio _audio;
#endif
  uint32_t _nextIdleSound;
  uint32_t _soundGuardUntil;
  bool _busy;

  static const char* soundName(SoundId id) {
    switch (id) {
      case SND_OK: return "ok";
      case SND_ERROR: return "error";
      case SND_TOGGLE_ON: return "toggle_on";
      case SND_TOGGLE_OFF: return "toggle_off";
      case SND_IDLE_NORMAL: return "idle_normal";
      case SND_IDLE_HAPPY: return "idle_happy";
      case SND_IDLE_QUESTION: return "idle_question";
      case SND_IDLE_SLEEP: return "idle_sleep";
      case SND_STARTUP: return "startup";
      default: return "ok";
    }
  }

  SoundId idleSoundFor(FaceState face) {
    switch (face) {
      case FACE_HAPPY:
      case FACE_EXCITED:
      case FACE_SURPRISED:
        return SND_IDLE_HAPPY;
      case FACE_THINKING:
      case FACE_CONFUSED:
      case FACE_ERROR:
        return SND_IDLE_QUESTION;
      case FACE_SLEEP:
        return SND_IDLE_SLEEP;
      default:
        return SND_IDLE_NORMAL;
    }
  }

public:
  void begin() {
#if ULTRON_AUDIO_MP3
    _audio.setPinout(PIN_I2S_BCLK, PIN_I2S_LRC, PIN_I2S_DIN);
    _audio.setVolume(settings.volume);
#endif
    _nextIdleSound = millis() + 12000;
    _soundGuardUntil = 0;
    _busy = false;
  }

  void speak(const char* url) {
#if ULTRON_AUDIO_MP3
    if (_audio.connecttohost(url)) {
      _busy = true;
      // Never let a chirp land on top of a spoken reply.
      _soundGuardUntil = millis() + 6000;
      _nextIdleSound = millis() + ULTRON_IDLE_SOUND_MIN_MS;
    }
#else
    (void)url;
#endif
  }

  // Fire-and-forget effect. Silently skipped while audio is already playing,
  // so effects never cut into speech and never queue up behind it.
  void playSound(SoundId id) {
    if (millis() < _soundGuardUntil) return;
    if (_busy) return;
#if ULTRON_AUDIO_MP3
    char url[128];
    snprintf(url, sizeof(url), "https://%s/api/esp/tone?name=%s&token=%s",
             settings.serverHost, soundName(id), settings.deviceToken);
    if (_audio.connecttohost(url)) {
      _busy = true;
      _soundGuardUntil = millis() + 2500;
      _nextIdleSound = millis() + ULTRON_IDLE_SOUND_MIN_MS;
    }
#else
    (void)id;
#endif
  }

  // Occasional chirp that matches whichever face is on screen.
  void updateIdleSounds(FaceState face) {
#if ULTRON_IDLE_SOUNDS
    uint32_t now = millis();
    if (now < _soundGuardUntil || _busy) return;
    if ((int32_t)(now - _nextIdleSound) < 0) return;
    _nextIdleSound = now + ULTRON_IDLE_SOUND_MIN_MS +
                     ((uint32_t)(now % 7000));
    playSound(idleSoundFor(face));
#endif
  }

  void update() {
#if ULTRON_AUDIO_MP3
    _audio.loop();
    if (_busy && !_audio.isRunning()) {
      _busy = false;
    }
#endif
  }
};

// Global Objects
SettingsManager settings;
ServoManager servoMgr;
JoystickManager joyMgr;
SplashManager splashMgr;
FaceRenderer faceRenderer;
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

  // Non-blocking event-poll state.
  // Phase 1 swallows the status line and headers; phase 2 accumulates the body.
  // Both are needed: the body alone is not enough to know when it ends, and the
  // previous version tried to infer "the body starts at {" while throwing every
  // header into the same buffer, so deserializeJson was always handed
  // "HTTP/1.1 200 OKContent-Type: ...{" and always failed.
  bool _polling;
  uint8_t _pollPhase;             // 0 = idle, 1 = headers, 2 = body
  bool _pollDone;
  uint32_t _pollStarted;
  uint32_t _pollContentLength;
  bool _pollChunked;
  uint32_t _pollChunkRemaining;
  char _pollLine[128];
  uint8_t _pollLineLen;
  // Big enough for a 480-char reply plus its percent-encoded tts query, which is
  // roughly 2 KB on its own.
  char _pollBody[4096];
  uint16_t _pollBodyLen;

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
    _polling = false;
    _pollPhase = 0;
    _pollDone = false;
    _pollStarted = 0;
    _pollContentLength = 0;
    _pollChunked = false;
    _pollChunkRemaining = 0;
    _pollLineLen = 0;
    _pollBodyLen = 0;
    _client.setInsecure(); // Disable RSA cert verification for fast handshake
  }

  bool isBusy() const { return _state != IDLE && _state != ERROR_STATE; }

  // Case-insensitive prefix test. Avoids strncasecmp/strcasestr, which are
  // POSIX-only and would not survive a host syntax check.
  static bool startsWithCI(const char* s, const char* prefix) {
    while (*prefix) {
      char a = *s++;
      char b = *prefix++;
      if (a >= 'a' && a <= 'z') a = (char)(a - 32);
      if (b >= 'a' && b <= 'z') b = (char)(b - 32);
      if (a != b) return false;
    }
    return true;
  }

  static bool containsCI(const char* hay, const char* needle) {
    if (!*needle) return true;
    for (const char* p = hay; *p; p++) {
      const char* a = p;
      const char* b = needle;
      while (*a && *b) {
        char x = *a++;
        char y = *b++;
        if (x >= 'a' && x <= 'z') x = (char)(x - 32);
        if (y >= 'a' && y <= 'z') y = (char)(y - 32);
        if (x != y) break;
      }
      if (*b == '\0') return true;
    }
    return false;
  }

  // --- Non-blocking event poll -------------------------------------------------
  // The poll used to block the whole main loop for up to 2 s (plus an unbounded
  // readStringUntil) every 2 s. At best that halved the loop rate, and a short
  // joystick tap that started and ended inside that window was lost outright,
  // because checkButton() only ever samples the pin's current level. Polling is
  // now a state machine: each update() does a bounded slice of work.
  void pollStart() {
    if (_polling || isBusy()) return;
    if (WiFi.status() != WL_CONNECTED) return;
    if (!_client.connect(settings.serverHost, settings.serverPort)) return;
    _client.printf("GET /api/esp/events?token=%s&device_id=%s&since=%u HTTP/1.1\r\n",
                   settings.deviceToken, settings.deviceId, (unsigned int)_lastEventId);
    _client.printf("Host: %s\r\n", settings.serverHost);
    _client.printf("Connection: close\r\n\r\n");
    _pollPhase = 1;
    _pollDone = false;
    _pollContentLength = 0;
    _pollChunked = false;
    _pollChunkRemaining = 0;
    _pollLineLen = 0;
    _pollBodyLen = 0;
    _pollStarted = millis();
    _polling = true;
  }

  // Returns true once a complete JSON body has been handled.
  bool pollTick() {
    if (!_polling) return false;

    // Guard against a half-open connection wedging the poll forever.
    if (millis() - _pollStarted > 8000) {
      _client.stop();
      _polling = false;
      _pollPhase = 0;
      _pollBodyLen = 0;
      return false;
    }

    while (_client.available() > 0) {
      int raw = _client.read();
      if (raw < 0) break;
      char c = (char)raw;

      if (_pollPhase == 1) {
        // Header lines, CRLF terminated; a blank line marks the body.
        if (c == '\n') {
          _pollLine[_pollLineLen] = '\0';
          if (_pollLineLen == 0) {
            _pollPhase = 2;
          } else if (startsWithCI(_pollLine, "Content-Length:")) {
            _pollContentLength = (uint32_t)strtoul(_pollLine + 15, NULL, 10);
          } else if (startsWithCI(_pollLine, "Transfer-Encoding:")) {
            if (containsCI(_pollLine, "chunked")) _pollChunked = true;
          }
          _pollLineLen = 0;
        } else if (c != '\r') {
          if (_pollLineLen < sizeof(_pollLine) - 1) _pollLine[_pollLineLen++] = c;
        }
        continue;
      }

      // --- phase 2: body ---
      if (_pollChunked) {
        if (_pollChunkRemaining == 0) {
          if (c == '\n') {
            _pollLine[_pollLineLen] = '\0';
            _pollLineLen = 0;
            // "0" is the terminating chunk: the message is complete.
            _pollChunkRemaining = (_pollLine[0] == '0') ? 0
                                  : (uint32_t)strtoul(_pollLine, NULL, 16);
            if (_pollChunkRemaining == 0) _pollDone = true;
          } else if (c != '\r') {
            if (_pollLineLen < sizeof(_pollLine) - 1) _pollLine[_pollLineLen++] = c;
          }
          continue;
        }
        // Strip the CRLF that trails each chunk.
        if (c == '\n') { _pollChunkRemaining--; continue; }
        if (c == '\r') continue;
      }

      if (_pollBodyLen < sizeof(_pollBody) - 1) {
        _pollBody[_pollBodyLen++] = c;
      } else {
        _pollDone = true;   // overflow: bail rather than parse a truncated body
      }

      if (!_pollChunked && _pollContentLength > 0 &&
          _pollBodyLen >= _pollContentLength) {
        _pollDone = true;
      }
    }

    // "Connection: close" also terminates the body when no length was given.
    bool haveBody = (_pollPhase == 2 && _pollBodyLen > 0);
    bool closed = !_client.connected();

    if (_pollDone || (closed && haveBody)) {
      _pollBody[_pollBodyLen] = '\0';
      _client.stop();
      _polling = false;
      _pollPhase = 0;
      _pollBodyLen = 0;
      if (haveBody) {
        handleEventsJson(_pollBody);
        return true;
      }
      return false;
    }
    return false;
  }

  void handleEventsJson(const char* json) {
    AJDOC(res);
    DeserializationError err = deserializeJson(res, json);
    if (err) {
      // The previous parser fed headers plus a stray "{" to this function, so
      // this is where every silently-dropped web reply used to land.
      Serial.print("[EVENTS] parse failed: ");
      Serial.println(err.c_str());
      return;
    }
    if (!res["ok"].as<bool>()) {
      Serial.println("[EVENTS] server reported not-ok");
      return;
    }

    if (res.containsKey("latest_id")) {
      _lastEventId = res["latest_id"].as<uint32_t>();
    }
    if (!res["has_event"].as<bool>()) return;

    JsonArray events = res["events"].as<JsonArray>();
    for (JsonObject ev : events) {
      const char* txt = ev["text"];
      const char* emo = ev["emotion"];
      const char* mot = ev["motion"];
      const char* ttsUrl = ev["tts"];

      Serial.print("[EVENTS] id=");
      Serial.print((unsigned long)res["latest_id"].as<uint32_t>());
      Serial.print(" emotion=");
      Serial.print(emo ? emo : "-");
      Serial.print(" motion=");
      Serial.print(mot && strlen(mot) > 0 ? mot : "-");
      Serial.println(servoMgr.isAutoMode() ? "  [auto]" : "  [MANUAL - motion suppressed]");

      if (txt) logMessage("Chrome Chat:", txt);
      if (emo) applyStateString(emo);
      if (mot && strlen(mot) > 0) servoMgr.playMotion(mot);
      else if (emo) servoMgr.playEmotionMotion(emo);

#if ULTRON_AUDIO_MP3
      if (ttsUrl && strlen(ttsUrl) > 0) {
        char fullUrl[2048];
        snprintf(fullUrl, sizeof(fullUrl), "https://%s%s", settings.serverHost, ttsUrl);
        audioMgr.speak(fullUrl);
      }
#else
      audioMgr.playSound(SND_OK);
#endif
    }
  }

  void sendHello() {
    if (WiFi.status() != WL_CONNECTED) return;
    // The event poll and the handshake share one TLS client.
    if (_polling) { _client.stop(); _polling = false; }

    faceRenderer.setState(FACE_THINKING);
    logMessage("Handshake...", settings.serverHost);

    if (!_client.connect(settings.serverHost, settings.serverPort)) {
      faceRenderer.setState(FACE_ERROR);
      logMessage("Connection Failed", "Check Host / Port");
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
            logMessage("AI ONLINE", "System Ready");
            splashMgr.show(SPLASH_AI_SUCCESS, 2000);
            audioMgr.playSound(SND_OK);
            _client.stop();
            return;
          }
        }
      }
    }
    _client.stop();
    faceRenderer.setState(FACE_ERROR);
    logMessage("Handshake Error", "Server Rejected");
  }

  void sendChat(const char* promptText) {
    if (isBusy() || WiFi.status() != WL_CONNECTED) return;

    faceRenderer.setState(FACE_THINKING);
    logMessage("Sending Prompt...", promptText);

    if (!_client.connect(settings.serverHost, settings.serverPort)) {
      faceRenderer.setState(FACE_ERROR);
      logMessage("Connect Failed", "Server unreachable");
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
      if (WiFi.status() != WL_CONNECTED) return;
      if (_polling) {
        pollTick();
      } else if (now - _lastPollTime > 2000) {
        _lastPollTime = now;
        pollStart();
      }
      return;
    }

    uint32_t now = millis();
    // A new outbound request must not collide with an in-flight event poll.
    if ((_state == READING_HEADERS || _state == READING_BODY) && _polling) {
      _client.stop();
      _polling = false;
    }
    if (now - _stateStartTime > 45000) { // 45s server timeout
      _client.stop();
      _state = IDLE;
      faceRenderer.setState(FACE_ERROR);
      logMessage("Timeout Error", "Request Timed Out");
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
        logMessage("Ultron Replying:", txt);
      }
    } else if (strcmp(type, "ai_response") == 0) {
      const char* txt = doc["text"];
      const char* emo = doc["emotion"];
      const char* mot = doc["motion"];
      const char* ttsUrl = doc["tts"];

      if (txt) logMessage("Ultron:", txt);
      if (emo) applyStateString(emo);
      if (mot && strlen(mot) > 0) servoMgr.playMotion(mot);
      else if (emo) servoMgr.playEmotionMotion(emo);

#if ULTRON_AUDIO_MP3
      if (ttsUrl && strlen(ttsUrl) > 0) {
        // 256 was far too small: the query carries the percent-encoded reply
        // text, so a normal sentence already overflowed it and the mp3 fetch
        // silently failed. 480 chars of text URL-encodes to roughly 1.4 KB.
        char fullUrl[2048];
        snprintf(fullUrl, sizeof(fullUrl), "https://%s%s", settings.serverHost, ttsUrl);
        audioMgr.speak(fullUrl);
      }
#endif
    } else if (strcmp(type, "done") == 0) {
      _client.stop();
      _state = IDLE;
    } else if (strcmp(type, "error") == 0) {
      const char* errStr = doc["error"];
      faceRenderer.setState(FACE_ERROR);
      logMessage("AI Error:", errStr ? errStr : "Unknown");
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
    else if (strcmp(stateStr, "listening") == 0) faceRenderer.setState(FACE_HAPPY);
    else if (strcmp(stateStr, "sleep") == 0) faceRenderer.setState(FACE_SLEEP);
    else if (strcmp(stateStr, "sleeping") == 0) faceRenderer.setState(FACE_SLEEP);
    else if (strcmp(stateStr, "confused") == 0) faceRenderer.setState(FACE_CONFUSED);
    else if (strcmp(stateStr, "excited") == 0) faceRenderer.setState(FACE_EXCITED);
    else if (strcmp(stateStr, "surprised") == 0) faceRenderer.setState(FACE_SURPRISED);
    else if (strcmp(stateStr, "offline") == 0) faceRenderer.setState(FACE_DISCONNECT);
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

  // Value edit temporary variables
  const char* _editLabel;
  uint8_t* _editValPtr;
  uint8_t _editMin;
  uint8_t _editMax;

  // Transient on-screen notice. Toggling AUTO/MANUAL has to be provable to the
  // person holding the stick, and the confirming beep comes from the server, so
  // it cannot be the only signal: if WiFi is down the old build looked totally
  // inert. This banner is drawn locally and always works.
  const char* _toastText;
  uint32_t _toastUntil;

public:
  void showToast(const char* text, uint16_t ms) {
    _toastText = text;
    _toastUntil = millis() + ms;
  }

  void begin() {
    _mode = MODE_BOOT;
    _currentScreen = SCN_MAIN;
    _menuIdx = 0;
    _editLabel = "";
    _editValPtr = NULL;
    _toastText = "";
    _toastUntil = 0;
  }

  void setMode(SystemMode mode) { _mode = mode; }
  SystemMode getMode() const { return _mode; }

  void handleInput(JoyDirection dir, JoyButton btn) {
    if (_mode == MODE_NORMAL) {
      if (dir == JOY_NONE && btn == BTN_NONE) {
        // Nothing to do.
      } else if (btn == BTN_LONG_PRESS) {
        audioMgr.playSound(SND_OK);
        _mode = MODE_MENU;
        _currentScreen = SCN_MAIN;
        _menuIdx = 0;
      } else if (btn == BTN_PRESS) {
        // Short press hands the servo between the emotion engine and the
        // joystick. In manual the stick below steers the head directly; in auto
        // the stick nudges it and the engine resumes drifting afterwards.
        servoMgr.toggleAutoMode();
        bool nowAuto = servoMgr.isAutoMode();
        // Three independent confirmations: the banner (always visible), the
        // serial log (for debugging) and the tone (needs the server, so it is
        // only ever a bonus).
        showToast(nowAuto ? "AUTO" : "MANUAL", 1500);
        Serial.print("[MODE] servo control -> ");
        Serial.println(nowAuto ? "AUTO (emotion engine)" : "MANUAL (joystick)");
        audioMgr.playSound(nowAuto ? SND_TOGGLE_ON : SND_TOGGLE_OFF);
      } else if (dir == JOY_LEFT) {
        servoMgr.nudge(-5, 100);
      } else if (dir == JOY_RIGHT) {
        servoMgr.nudge(+5, 100);
      } else if (dir == JOY_UP) {
        servoMgr.tilt(+4, 100);
      } else if (dir == JOY_DOWN) {
        servoMgr.tilt(-4, 100);
      }
    } else if (_mode == MODE_JOYSTICK_SERVO) {
      if (dir == JOY_LEFT) {
        servoMgr.moveDirect(servoMgr.getCurrentAngle() - 5, 80);
      } else if (dir == JOY_RIGHT) {
        servoMgr.moveDirect(servoMgr.getCurrentAngle() + 5, 80);
      } else if (btn == BTN_PRESS) {
        servoMgr.moveDirect(settings.servoCenter, 250);
        audioMgr.playSound(SND_OK);
      } else if (btn == BTN_LONG_PRESS) {
        audioMgr.playSound(SND_ERROR);
        _mode = MODE_MENU;
      }
    } else if (_mode == MODE_MENU) {
      if (btn == BTN_LONG_PRESS || dir == JOY_LEFT) {
        audioMgr.playSound(SND_ERROR);
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
        audioMgr.playSound(SND_OK);
      } else if (dir == JOY_DOWN) {
        _menuIdx++;
        audioMgr.playSound(SND_OK);
      } else if (btn == BTN_PRESS) {
        audioMgr.playSound(SND_OK);
        executeMenuSelect();
      }
    } else if (_mode == MODE_EDIT_VALUE) {
      if (dir == JOY_UP || dir == JOY_RIGHT) {
        if (_editValPtr && *_editValPtr < _editMax) (*_editValPtr)++;
        audioMgr.playSound(SND_OK);
      } else if (dir == JOY_DOWN || dir == JOY_LEFT) {
        if (_editValPtr && *_editValPtr > _editMin) (*_editValPtr)--;
        audioMgr.playSound(SND_OK);
      } else if (btn == BTN_PRESS) {
        settings.save();
        audioMgr.playSound(SND_OK);
        _mode = MODE_MENU;
      } else if (btn == BTN_LONG_PRESS) {
        audioMgr.playSound(SND_ERROR);
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
      else if (_menuIdx == 1) servoMgr.playMotionForced("nod");
      else if (_menuIdx == 2) servoMgr.runAutoSelfTest();
      else if (_menuIdx == 3) startValueEdit("Center Angle", &settings.servoCenter, 30, 150);
      else if (_menuIdx == 4) startValueEdit("Min Angle", &settings.servoMin, SERVO_HARD_MIN, 80);
      else if (_menuIdx == 5) startValueEdit("Max Angle", &settings.servoMax, 100, SERVO_HARD_MAX);
      else if (_menuIdx == 6) _currentScreen = SCN_MAIN;
    } else if (_currentScreen == SCN_AUDIO) {
      if (_menuIdx == 0) startValueEdit("Volume (0-21)", &settings.volume, 0, 21);
      else if (_menuIdx == 1) audioMgr.playSound(SND_OK);
      else if (_menuIdx == 2) _currentScreen = SCN_MAIN;
    } else if (_currentScreen == SCN_AI) {
      if (_menuIdx == 0) aiClient.sendHello();
      else if (_menuIdx == 1) _currentScreen = SCN_MAIN;
    } else if (_currentScreen == SCN_DISPLAY) {
      if (_menuIdx == 0) startValueEdit("Brightness", &settings.brightness, 16, 255);
      else if (_menuIdx == 1) _currentScreen = SCN_MAIN;
    } else if (_currentScreen == SCN_WIFI) {
      if (_menuIdx == 0) {
        WiFi.disconnect();
        WiFi.mode(WIFI_STA);
        WiFi.begin(settings.wifiSsid, settings.wifiPass);
        logMessage("WiFi reconnecting...");
      } else if (_menuIdx == 1) _currentScreen = SCN_MAIN;
    } else if (_currentScreen == SCN_BATTERY) {
      _currentScreen = SCN_MAIN;
    } else if (_currentScreen == SCN_ABOUT) {
      _currentScreen = SCN_MAIN;
    } else {
      _currentScreen = SCN_MAIN;
      _menuIdx = 0;
    }
  }

  void draw(Adafruit_SSD1306& display) {
    if (_mode == MODE_NORMAL) {
      drawFaceScreen(display);

    } else if (_mode == MODE_BOOT) {
      // BootSequence drives the face state; the panel still only shows artwork.
      drawFaceScreen(display);

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
      display.print(servoMgr.isAutoMode() ? "L/R+Tilt: Steer" : "L/R: Pan  U/D: Tilt");
      display.setCursor(0, 56);
      display.print("PRESS:Center LONG:Exit");
      drawServoModeBadge(display);

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
        items[2] = "3. Test Auto Motion";
        items[3] = "4. Set Center";
        items[4] = "5. Set Min Angle";
        items[5] = "6. Set Max Angle";
        items[6] = "< Back";
        count = 7;
      } else if (_currentScreen == SCN_AUDIO) {
        items[0] = "1. Volume";
        items[1] = "2. Test Beep";
        items[2] = "< Back";
        count = 3;
} else if (_currentScreen == SCN_AI) {
        items[0] = "1. Test Handshake";
        items[1] = "< Back";
        count = 2;
      } else if (_currentScreen == SCN_DISPLAY) {
        items[0] = "1. Brightness";
        items[1] = "< Back";
        count = 2;
      } else if (_currentScreen == SCN_WIFI) {
        items[0] = "1. Reconnect";
        items[1] = "< Back";
        count = 2;
      } else if (_currentScreen == SCN_BATTERY) {
        items[0] = "< Back";
        count = 1;
      } else {
        items[0] = "Ultron Physical AI";
        items[1] = "FW: v1.0.0";
        items[2] = "< Back";
        count = 3;
      }

      if (_menuIdx >= count) _menuIdx = count - 1;

      // The info screens carry their details in the band above the list, so the
      // list has to start lower or the two sets of text land on top of each
      // other (list rows are 10px apart starting at 14; the panel wrote at 14).
      bool infoScreen = (_currentScreen == SCN_DISPLAY ||
                         _currentScreen == SCN_WIFI ||
                         _currentScreen == SCN_BATTERY);
      uint8_t listTop = infoScreen ? 34 : 14;

      for (uint8_t i = 0; i < 5 && (i) < count; i++) {
        uint8_t idx = i;
        display.setCursor(8, listTop + (i * 10));
        if (idx == _menuIdx) {
          display.print("> ");
        } else {
          display.print("  ");
        }
        display.print(items[idx]);
      }

      // The face screen is artwork-only, so every text screen carries the
      // status row instead.
      drawStatusBar(display);

      // Info screens overlay their details in the free space above the list.
      drawInfoPanel(display);

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

    // Full-panel artwork splash wins over every screen while it is showing.
    splashMgr.draw(display);
  }

  // Read-only detail block for the info screens (Display / WiFi / Battery).
  // These used to be spread across the face screen's status bar, which no
  // longer exists now that the panel is pure artwork.
  void drawInfoPanel(Adafruit_SSD1306& display) {
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);

    // Two rows, not three: the menu list underneath starts at y=34 and the
    // status bar sits at y=56, so 14..31 is all the room there is.
    if (_currentScreen == SCN_WIFI) {
      display.setCursor(0, 14);
      display.printf("SSID: %.20s", settings.wifiSsid);
      display.setCursor(0, 23);
      display.printf("Host: %.14s :%u", settings.serverHost,
                     (unsigned)settings.serverPort);

    } else if (_currentScreen == SCN_BATTERY) {
      display.setCursor(0, 14);
      display.printf("Battery: %.2f V  %u%%", batteryMgr.getVoltage(),
                     batteryMgr.getPercent());
      display.setCursor(0, 23);
      display.print(ULTRON_BATTERY_ENABLE ? "Monitor: ON" : "Monitor: OFF");

    } else if (_currentScreen == SCN_DISPLAY) {
      display.setCursor(0, 14);
#if ULTRON_BITMAP_FACES
      display.print("Faces: Bitmap (lopaka)");
#else
      display.print("Faces: Vector");
#endif
      display.setCursor(0, 23);
      display.printf("Bright: %u / 128x64", (unsigned)settings.brightness);
    }
  }

  // The live face screen: lopaka artwork and nothing else. No chat text, no
  // status bar - the panel is a face, the replies go out through the speaker
  // and the status lives in the menu screens.
  void drawFaceScreen(Adafruit_SSD1306& display) {
    faceRenderer.draw(display);
    drawServoModeBadge(display);
    drawToast(display);
  }

  // Big centred banner, drawn over the face. Deliberately large so it cannot be
  // mistaken for part of the artwork.
  void drawToast(Adafruit_SSD1306& display) {
    if (_toastText == NULL || _toastText[0] == '\0') return;
    if ((int32_t)(millis() - _toastUntil) > 0) { _toastText = ""; return; }

    const int16_t top = 40, height = 20;
    display.fillRect(0, top, 128, height, SSD1306_BLACK);
    display.drawRect(0, top, 128, height, SSD1306_WHITE);

    display.setTextSize(2);
    display.setTextColor(SSD1306_WHITE);
    int16_t w = 12 * strlen(_toastText);
    display.setCursor((128 - w) / 2, top + 4);
    display.print(_toastText);
    display.setTextSize(1);
  }

  // Tiny "AUTO"/"MANUAL" pill so it is obvious whether the joystick owns the
  // servo or the emotion engine does.
  void drawServoModeBadge(Adafruit_SSD1306& display) {
    const char* tag = servoMgr.isAutoMode() ? "AUTO" : "MANUAL";
    int16_t w = 6 * strlen(tag) + 4;
    int16_t x = 128 - w - 1;
    display.fillRect(x, 0, w, 9, SSD1306_BLACK);
    display.drawRect(x, 0, w, 9, SSD1306_WHITE);
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(x + 2, 2);
    display.print(tag);
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
  bool _dronePlayed;

public:
  void begin() {
    _step = 0;
    _stepStartTime = millis();
    _dronePlayed = false;
    splashMgr.show(SPLASH_BOOT_LOGO, 1200);
  }

  void update() {
    if (menuMgr.getMode() != MODE_BOOT) return;

    uint32_t now = millis();
    uint32_t elapsed = now - _stepStartTime;

    switch (_step) {
      case 0:
        // Step 0: Splash screen
        faceRenderer.setState(FACE_HAPPY);
        logMessage("ULTRON PHYSICAL AI", "Booting Firmware v1.0");
        if (elapsed > 1200) {
          _step = 1;
          _stepStartTime = now;
        }
        break;

      case 1:
        // Step 1: Audio Check
        logMessage("Initializing Audio", "I2S MAX98357A");
        audioMgr.playSound(SND_OK);
        if (elapsed > 600) {
          _step = 2;
          _stepStartTime = now;
        }
        break;

      case 2:
        // Step 2: Servo Check
        logMessage("Testing Servo...", "Center Alignment");
        servoMgr.playMotionForced("center");
        if (elapsed > 800) {
          _step = 3;
          _stepStartTime = now;
        }
        break;

      case 3:
        // Step 3: Joystick Calibration
        logMessage("Calibrating Joystick", "Keep Centered...");
        joyMgr.autoCalibrate();
        if (elapsed > 500) {
          _step = 4;
          _stepStartTime = now;
        }
        break;

      case 4:
        // Step 4: WiFi Connect
        logMessage("Connecting WiFi...", settings.wifiSsid);
        WiFi.mode(WIFI_STA);
        WiFi.begin(settings.wifiSsid, settings.wifiPass);
        _step = 5;
        _stepStartTime = now;
        break;

      case 5:
        // Step 5: Wait for WiFi connection (with 8s timeout)
        if (WiFi.status() == WL_CONNECTED) {
          logMessage("WiFi Connected!", WiFi.localIP().toString().c_str());
          _step = 6;
          _stepStartTime = now;
        } else if (elapsed > 8000) {
          logMessage("WiFi Failed!", "Starting Offline Mode");
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
        // Step 7: Drone spin-up, then hand over to the normal UI. This is the
        // "power on" moment, so it gets the full rotor sweep rather than a beep.
        if (elapsed == 0 || _dronePlayed == false) {
#if ULTRON_STARTUP_DRONE
          audioMgr.playSound(SND_STARTUP);
#endif
          _dronePlayed = true;
        }
        // Wait for the drone to finish before revealing the face.
        if (elapsed > 3000) {
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
  servoMgr.begin();
  joyMgr.begin();
  batteryMgr.begin();
  audioMgr.begin();
  aiClient.begin();
  menuMgr.begin();
  bootSeq.begin();
}

// Keeps the radio alive. Previously WiFi.begin() was only ever called from the
// boot sequence and the WiFi menu, so a single dropped AP or a router reboot
// left the device permanently deaf: it would still draw its face, but nothing
// from the server could ever reach it again until a manual reboot.
static uint32_t _lastWifiAttempt = 0;
static bool _hadConnection = false;

static void maintainWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    _hadConnection = true;
    return;
  }

  uint32_t now = millis();
  if (now - _lastWifiAttempt < 5000) return;   // don't hammer the AP
  _lastWifiAttempt = now;

  if (_hadConnection) {
    // Only report the drop once per outage.
    _hadConnection = false;
    logMessage("WiFi Lost", "Reconnecting...");
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(settings.wifiSsid, settings.wifiPass);
}

void loop() {
  // 0. Keep the radio connected
  maintainWifi();

  // 1. Update Hardware & Non-blocking Engines
  servoMgr.update();
  faceRenderer.update();
  splashMgr.update();
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

  // 3. Occasional idle chirp that matches the face on screen. Skipped while the
  //    menu is open so it never fights with button feedback.
  if (menuMgr.getMode() == MODE_NORMAL) {
    audioMgr.updateIdleSounds(faceRenderer.getState());
  }

  // 3. Render OLED UI
  display.clearDisplay();
  menuMgr.draw(display);
  display.display();
}
