#include <SPI.h>
#include <MFRC522.h>
#include <Keypad.h>
#include <Arduino.h>
#include <math.h>

namespace AlarmSystem {

  // ------------------------
  // Pin configuration (using constexpr)
  // ------------------------
  constexpr uint8_t RST_PIN    = 9;
  constexpr uint8_t SS_PIN     = 10;
  constexpr uint8_t TRIG_PIN   = 6;
  constexpr uint8_t ECHO_PIN   = 7;
  constexpr uint8_t BUZZER_PIN = 8;
  constexpr uint8_t LED_PIN    = 5;
  
  // Thermistor pin (A5 is reserved for the thermistor)
  constexpr uint8_t THERMISTOR_PIN = A5;
  
  // Valid RFID UID
  constexpr byte validUID[] = { 0xB6, 0xB9, 0x34, 0x02 };

  MFRC522 mfrc522(SS_PIN, RST_PIN);
  
  // Ultrasonic sensor – helper constants
  constexpr float DISTANCE_THRESHOLD = 50.0f;  // in cm
  
  // Temperature threshold (°C)
  constexpr float TEMP_THRESHOLD = 40.0f;
  
  // ------------------------
  // Keypad configuration for a 4x4 keypad
  // ------------------------
  const byte KEYPAD_ROWS = 4;
  const byte KEYPAD_COLS = 4;
  char keys[KEYPAD_ROWS][KEYPAD_COLS] = {
    {'1','2','3','A'},
    {'4','5','6','B'},
    {'7','8','9','C'},
    {'*','0','#','D'}
  };
  byte rowPins[KEYPAD_ROWS] = {A0, A1, A2, A3};
  byte colPins[KEYPAD_COLS] = {A4, 2, 3, 4};
  
  Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, KEYPAD_ROWS, KEYPAD_COLS);
  
  // ------------------------
  // System configuration
  // ------------------------
  const String NEW_PASSCODE = "1234";
  
  // ------------------------
  // State variables
  // ------------------------
  bool alarmActive   = false;
  bool alarmSilenced = false;
  bool alarmArmed    = true;
  unsigned long lastMotionTime = 0;
  unsigned long lastRFIDTime   = 0;
  String inputPasscode = "";
  
  // Allow only one keypad attempt per trial.
  bool keypadAttemptMade = false;
  
  // When RFID silences the alarm, it does so for 5000ms.
  unsigned long alarmSilenceUntil = 0;
  
  // ------------------------
  // Buzzer control using non-blocking beep sequences:
  // ------------------------
  enum BeepSequenceType {
    NO_BEEP,
    BEEP_ARM,
    BEEP_DISARM,
    BEEP_SUCCESS,
    BEEP_WARN
  };
  BeepSequenceType currentBeepSequence = NO_BEEP;
  unsigned long beepSequenceStart = 0;
  int beepSequenceStep = 0; // Tracks progress in the beep sequence
  
  // ------------------------
  // Function declarations
  // ------------------------
  void processKeypad();
  void processMotion();
  void processRFID();
  void updateBuzzer();
  long readUltrasonicDistance();
  bool checkRFIDCard();
  void scheduleBeep(BeepSequenceType type);
  void updateBeepSequence();
  float readTemperature();
  void processThermistor();
  
  // ------------------------
  // Setup function
  // ------------------------
  void setup() {
    Serial.begin(115200);
    while (!Serial);
    Serial.println(F("Initializing system..."));
    
    SPI.begin();
    mfrc522.PCD_Init();
    Serial.println(F("RFID Module Initialized."));
    
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);
  }
  
  // ------------------------
  // Main loop
  // ------------------------
  void loop() {
    processKeypad();
    processMotion();
    processRFID();
    updateBuzzer();
    
    // Process thermistor reading every 1 second
    static unsigned long lastTempTime = 0;
    unsigned long currentMillis = millis();
    if (currentMillis - lastTempTime >= 1000) {
      lastTempTime = currentMillis;
      processThermistor();
    }
    
    delay(20);
  }
  
  // ------------------------
  // Read ultrasonic sensor distance in cm
  // ------------------------
  long readUltrasonicDistance() {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    
    long duration = pulseIn(ECHO_PIN, HIGH, 30000);
    long distance = static_cast<long>((duration * 0.034) / 2);
    return distance;
  }
  
  // ------------------------
  // Check RFID card and validate UID
  // ------------------------
  bool checkRFIDCard() {
    if (!mfrc522.PICC_IsNewCardPresent() || !mfrc522.PICC_ReadCardSerial())
      return false;
    
    Serial.print(F("Card UID:"));
    const size_t validUIDLength = sizeof(validUID) / sizeof(validUID[0]);
    bool valid = (mfrc522.uid.size == validUIDLength);
    for (byte i = 0; i < mfrc522.uid.size; i++) {
      Serial.print(F(" "));
      if (mfrc522.uid.uidByte[i] < 0x10)
        Serial.print(F("0"));
      Serial.print(mfrc522.uid.uidByte[i], HEX);
      if (valid && (i < validUIDLength) && (mfrc522.uid.uidByte[i] != validUID[i]))
        valid = false;
    }
    Serial.println();
    
    mfrc522.PICC_HaltA();
    mfrc522.PCD_StopCrypto1();
    
    if (valid) {
      Serial.println(F("Valid card detected."));
      keypadAttemptMade = false; // Reset keypad attempts on valid RFID scan
      // Disable alarm for 5 seconds.
      alarmSilenced = true;
      alarmSilenceUntil = millis() + 5000;
      alarmActive = false; // Turn off any active alarm.
      digitalWrite(LED_PIN, LOW);
      scheduleBeep(BEEP_SUCCESS);
      return true;
    } else {
      Serial.println(F("Invalid card detected."));
      return false;
    }
  }
  
  // ------------------------
  // Process keypad input
  // ------------------------
  void processKeypad() {
    char key = keypad.getKey();
    if (key != NO_KEY) {
      Serial.print(F("Key pressed: "));
      Serial.println(key);
      
      if (key >= '0' && key <= '9') {
        if (!keypadAttemptMade)
          inputPasscode += key;
      } else if (key == '#') {
        if (!keypadAttemptMade) {
          Serial.println(F("Enter pressed"));
          if (inputPasscode == NEW_PASSCODE) {
            alarmArmed = !alarmArmed; // Toggle armed state
            if (alarmArmed) {
              Serial.println(F("Alarm armed."));
              scheduleBeep(BEEP_ARM);
            } else {
              Serial.println(F("Alarm disarmed."));
              alarmActive = false;
              alarmSilenced = false;
              digitalWrite(LED_PIN, LOW);
              scheduleBeep(BEEP_SUCCESS);
              scheduleBeep(BEEP_DISARM);
            }
          } else {
            Serial.println(F("Invalid passcode."));
            keypadAttemptMade = true;
            alarmActive = true; // Activate continuous siren tone
          }
          inputPasscode = "";
        } else {
          Serial.println(F("No more attempts allowed."));
          alarmActive = true;
        }
      } else if (key == '*') {
        inputPasscode = "";
        keypadAttemptMade = false;
        Serial.println(F("Passcode cleared."));
      }
    }
  }
  
  // ------------------------
  // Process motion detection using the ultrasonic sensor
  // ------------------------
  void processMotion() {
    if (!alarmArmed)
      return;
    
    // Clear RFID silence if time expired.
    if (alarmSilenced && millis() >= alarmSilenceUntil) {
      alarmSilenced = false;
    }
    
    long distance = readUltrasonicDistance();
    if (distance > 0 && distance < DISTANCE_THRESHOLD) {
      Serial.println(F("Motion detected."));
      // Only activate alarm if not silenced.
      if (!alarmSilenced) {
        alarmActive = true;
        digitalWrite(LED_PIN, HIGH);
      }
      lastMotionTime = millis();
    }
  
  }
  
  // ------------------------
  // Process RFID input to silence alarm if active
  // ------------------------
  void processRFID() {
    if (alarmActive && (millis() - lastRFIDTime > 1000)) {
      if (checkRFIDCard()) {
        // The checkRFIDCard() function already sets alarmSilenced for 5 seconds.
        lastRFIDTime = millis();
      }
    }
  }
  
  // ------------------------
  // Update buzzer state with continuous siren tone if alarm is active
  // ------------------------
  void updateBuzzer() {
    if (currentBeepSequence != NO_BEEP) {
      updateBeepSequence();
      return;
    }
    if (alarmActive) {
      unsigned long t = millis() % 2000;
      int frequency = map(t, 0, 2000, 600, 1200);
      tone(BUZZER_PIN, frequency);
    } else {
      noTone(BUZZER_PIN);
    }
  }
  
  // ------------------------
  // Schedule a beep sequence (non-blocking)
  // ------------------------
  void scheduleBeep(BeepSequenceType type) {
    currentBeepSequence = type;
    beepSequenceStart = millis();
    beepSequenceStep = 0;
  }
  
  // ------------------------
  // Update beep sequence using state machine
  // ------------------------
  void updateBeepSequence() {
    unsigned long now = millis();
    switch (currentBeepSequence) {
      case BEEP_ARM:
        if (beepSequenceStep == 0) {
          tone(BUZZER_PIN, 600);
          if (now - beepSequenceStart >= 100) {
            noTone(BUZZER_PIN);
            beepSequenceStep = 1;
            beepSequenceStart = now;
          }
        } else if (beepSequenceStep == 1) {
          if (now - beepSequenceStart >= 100) {
            beepSequenceStep = 2;
            beepSequenceStart = now;
          }
        } else if (beepSequenceStep == 2) {
          tone(BUZZER_PIN, 800);
          if (now - beepSequenceStart >= 100) {
            noTone(BUZZER_PIN);
            beepSequenceStep = 3;
            beepSequenceStart = now;
          }
        } else if (beepSequenceStep == 3) {
          if (now - beepSequenceStart >= 100) {
            beepSequenceStep = 4;
            beepSequenceStart = now;
          }
        } else if (beepSequenceStep == 4) {
          tone(BUZZER_PIN, 1000);
          if (now - beepSequenceStart >= 100) {
            noTone(BUZZER_PIN);
            currentBeepSequence = NO_BEEP;
          }
        }
        break;
        
      case BEEP_DISARM:
        if (beepSequenceStep == 0) {
          tone(BUZZER_PIN, 1000);
          if (now - beepSequenceStart >= 100) {
            noTone(BUZZER_PIN);
            beepSequenceStep = 1;
            beepSequenceStart = now;
          }
        } else if (beepSequenceStep == 1) {
          if (now - beepSequenceStart >= 100) {
            beepSequenceStep = 2;
            beepSequenceStart = now;
          }
        } else if (beepSequenceStep == 2) {
          tone(BUZZER_PIN, 800);
          if (now - beepSequenceStart >= 100) {
            noTone(BUZZER_PIN);
            beepSequenceStep = 3;
            beepSequenceStart = now;
          }
        } else if (beepSequenceStep == 3) {
          if (now - beepSequenceStart >= 100) {
            beepSequenceStep = 4;
            beepSequenceStart = now;
          }
        } else if (beepSequenceStep == 4) {
          tone(BUZZER_PIN, 600);
          if (now - beepSequenceStart >= 100) {
            noTone(BUZZER_PIN);
            currentBeepSequence = NO_BEEP;
          }
        }
        break;
        
      case BEEP_SUCCESS:
        if (beepSequenceStep == 0) {
          tone(BUZZER_PIN, 1200);
          if (now - beepSequenceStart >= 150) {
            noTone(BUZZER_PIN);
            currentBeepSequence = NO_BEEP;
          }
        }
        break;
        
      case BEEP_WARN:
        if (beepSequenceStep == 0) {
          tone(BUZZER_PIN, 400);
          if (now - beepSequenceStart >= 300) {
            noTone(BUZZER_PIN);
            beepSequenceStep = 1;
            beepSequenceStart = now;
          }
        } else if (beepSequenceStep == 1) {
          if (now - beepSequenceStart >= 100) {
            beepSequenceStep = 2;
            beepSequenceStart = now;
          }
        } else if (beepSequenceStep == 2) {
          tone(BUZZER_PIN, 400);
          if (now - beepSequenceStart >= 300) {
            noTone(BUZZER_PIN);
            currentBeepSequence = NO_BEEP;
          }
        }
        break;
        
      default:
        break;
    }
  }
  
  // ------------------------
  // Read temperature from NTC thermistor (in °C)
  // ------------------------
  float readTemperature() {
    int sensorValue = analogRead(THERMISTOR_PIN);
    const float V_in = 5.0;
    const float R_FIXED = 10000.0; // 10k resistor
    float Vout = sensorValue * (V_in / 1023.0);
    if (Vout <= 0.0) {
      return -273.15; // Error indicator
    }
    float R_thermistor = R_FIXED * ((V_in / Vout) - 1.0);
    
    const float T0 = 298.15;  // 25°C in Kelvin
    const float R0 = 10000.0; // Resistance at 25°C
    const float B = 3950.0;   // Beta coefficient
    float temperatureK = 1.0 / ((1.0 / T0) + (1.0 / B) * log(R_thermistor / R0));
    float temperatureC = temperatureK - 273.15;
    return temperatureC;
  }
  
  // ------------------------
  // Process thermistor reading and act if threshold exceeded
  // ------------------------
  void processThermistor() {
    float temperature = readTemperature();
    Serial.print(F("Temperature: "));
    Serial.print(temperature);
    Serial.println(F(" °C"));
    
    if (temperature > TEMP_THRESHOLD) {
      Serial.println(F("Temperature threshold exceeded!"));
      alarmActive = true;
      digitalWrite(LED_PIN, HIGH);
      scheduleBeep(BEEP_WARN);
    }
  }
  
} // end namespace AlarmSystem

// Arduino entry points call our namespace functions
void setup() {
  AlarmSystem::setup();
}

void loop() {
  AlarmSystem::loop();
  static unsigned long lastTempTime = 0;
  if (millis() - lastTempTime > 1000) {
    lastTempTime = millis();
    AlarmSystem::processThermistor();
  }
}
