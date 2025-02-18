#include <SPI.h>
#include <MFRC522.h>
#include <Keypad.h>
#include <Arduino.h>
#include <math.h>
#include <ArduinoJson.h>

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
  
  // Thermistor pin
  constexpr uint8_t THERMISTOR_PIN = A5;
  
  // Valid RFID UID
  constexpr byte validUID[] = { 0xB6, 0xB9, 0x34, 0x02 };

  MFRC522 mfrc522(SS_PIN, RST_PIN);
  
  // Ultrasonic sensor – helper constant
  constexpr float DISTANCE_THRESHOLD = 50.0f;  // in cm
  
  // Temperature threshold (°C)
  constexpr float TEMP_THRESHOLD = 30.0f;
  
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
  const String NEW_PASSCODE = "1234"; // Passcode for keypad activation
  
  // ------------------------
  // State variables
  // ------------------------
  bool alarmActive   = false;
  bool alarmSilenced = false;
  bool alarmArmed    = true;
  unsigned long lastMotionTime = 0;
  unsigned long lastRFIDTime   = 0;
  String inputPasscode = "";  // Holds keypad-entered passcode
  bool keypadAttemptMade = false; // Only one keypad attempt per trial.
  unsigned long alarmSilenceUntil = 0;  // RFID silences alarm for 5000ms
  
  // Cached temperature reading updated every second.
  float currentTemperature = 0.0f;
  
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

  // Structure to hold each beep step
  struct BeepStep {
    int frequency;           // 0 indicates silence (noTone)
    unsigned long duration;  // Duration in milliseconds
  };

  // Define beep sequences
  const BeepStep beepArmSteps[] = {
    {600,  100},
    {0,    100},
    {800,  100},
    {0,    100},
    {1000, 100}
  };
  const int beepArmCount = sizeof(beepArmSteps) / sizeof(BeepStep);

  const BeepStep beepDisarmSteps[] = {
    {1000, 100},
    {0,    100},
    {800,  100},
    {0,    100},
    {600,  100}
  };
  const int beepDisarmCount = sizeof(beepDisarmSteps) / sizeof(BeepStep);

  const BeepStep beepSuccessSteps[] = {
    {1200, 150}
  };
  const int beepSuccessCount = sizeof(beepSuccessSteps) / sizeof(BeepStep);

  const BeepStep beepWarnSteps[] = {
    {400, 300},
    {0,   100},
    {400, 300}
  };
  const int beepWarnCount = sizeof(beepWarnSteps) / sizeof(BeepStep);

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
  void sendStatus();
  void processSerialCommands();

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
    
    // Update thermistor reading every 1 second
    static unsigned long lastTempTime = 0;
    unsigned long currentMillis = millis();
    if (currentMillis - lastTempTime >= 1000) {
      lastTempTime = currentMillis;
      processThermistor();
    }
    
    // Process incoming serial commands from Node.js
    processSerialCommands();
    
    // Send status over Serial as JSON
    sendStatus();
    
    delay(20);
  }
  
  // ------------------------
  // Send status over Serial as JSON
  // ------------------------
  void sendStatus() {
    DynamicJsonDocument doc(128);
    doc["armed"] = alarmArmed;
    doc["active"] = alarmActive;
    doc["temp"] = currentTemperature;  // Use cached temperature
    serializeJson(doc, Serial);
    Serial.println();
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
      keypadAttemptMade = false;
      alarmSilenced = true;
      alarmSilenceUntil = millis() + 5000;
      alarmActive = false;
      alarmArmed = false;
      digitalWrite(LED_PIN, LOW);
      scheduleBeep(BEEP_SUCCESS);
      return true;
    }
    return false;
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
            alarmArmed = !alarmArmed;
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
            alarmActive = true;
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
    
    if (alarmSilenced && millis() >= alarmSilenceUntil) {
      alarmSilenced = false;
    }
    
    long distance = readUltrasonicDistance();
    if (distance > 0 && distance < DISTANCE_THRESHOLD) {
      Serial.println(F("Motion detected."));
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
    if (alarmArmed && (millis() - lastRFIDTime > 1000)) {
      if (checkRFIDCard()) {
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
  // Process serial commands received from Node.js
  // ------------------------
  void processSerialCommands() {
    if (Serial.available() > 0) {
      String cmd = Serial.readStringUntil('\n');
      cmd.trim();
      if (cmd == "T") {
        alarmArmed = !alarmArmed;
        Serial.print("Toggled alarm. Now armed: ");
        Serial.println(alarmArmed ? "true" : "false");
      } else if (cmd == "A") {
        alarmArmed = true;
        Serial.println("Alarm armed via command.");
      } else if (cmd == "D") {
        alarmArmed = false;
        Serial.println("Alarm disarmed via command.");
      } else {
        Serial.print("Unknown command: ");
        Serial.println(cmd);
      }
    }
  }
  
  // ------------------------
  // Schedule a beep sequence (non-blocking)
  // ------------------------
  void scheduleBeep(BeepSequenceType type) {
    currentBeepSequence = type;
    beepSequenceStep = 0;
    beepSequenceStart = millis();
    
    // Immediately start the first tone for the sequence.
    switch (type) {
      case BEEP_ARM:
        tone(BUZZER_PIN, beepArmSteps[0].frequency);
        break;
      case BEEP_DISARM:
        tone(BUZZER_PIN, beepDisarmSteps[0].frequency);
        break;
      case BEEP_SUCCESS:
        tone(BUZZER_PIN, beepSuccessSteps[0].frequency);
        break;
      case BEEP_WARN:
        tone(BUZZER_PIN, beepWarnSteps[0].frequency);
        break;
      default:
        break;
    }
  }
  
  // ------------------------
  // Update beep sequence using a generic state machine
  // ------------------------
  void updateBeepSequence() {
    unsigned long now = millis();
    const BeepStep* steps = nullptr;
    int stepCount = 0;
    
    switch (currentBeepSequence) {
      case BEEP_ARM:
        steps = beepArmSteps;
        stepCount = beepArmCount;
        break;
      case BEEP_DISARM:
        steps = beepDisarmSteps;
        stepCount = beepDisarmCount;
        break;
      case BEEP_SUCCESS:
        steps = beepSuccessSteps;
        stepCount = beepSuccessCount;
        break;
      case BEEP_WARN:
        steps = beepWarnSteps;
        stepCount = beepWarnCount;
        break;
      default:
        return;
    }
    
    // Proceed to next step if the current step's duration has elapsed.
    if (now - beepSequenceStart >= steps[beepSequenceStep].duration) {
      beepSequenceStep++;
      beepSequenceStart = now;
      if (beepSequenceStep < stepCount) {
        // If frequency is zero, remain silent.
        if (steps[beepSequenceStep].frequency == 0) {
          noTone(BUZZER_PIN);
        } else {
          tone(BUZZER_PIN, steps[beepSequenceStep].frequency);
        }
      } else {
        noTone(BUZZER_PIN);
        currentBeepSequence = NO_BEEP;
      }
    }
  }
  
  // ------------------------
  // Read temperature from NTC thermistor (in °C)
  // ------------------------
  float readTemperature() {
    // Precompute the voltage per ADC count.
    constexpr float voltagePerCount = 5.0f / 1023.0f;
    int sensorValue = analogRead(THERMISTOR_PIN);
    float Vout = sensorValue * voltagePerCount;
    if (Vout <= 0.0f) {
      return -273.15f; // Error indicator
    }
    const float R_FIXED = 10000.0f; // 10k resistor
    float R_thermistor = R_FIXED * ((5.0f / Vout) - 1.0f);
    
    const float T0 = 298.15f;  // 25°C in Kelvin
    const float R0 = 10000.0f; // Resistance at 25°C
    const float B = 3950.0f;   // Beta coefficient
    float temperatureK = 1.0f / ((1.0f / T0) + (1.0f / B) * log(R_thermistor / R0));
    float temperatureC = temperatureK - 273.15f;
    return temperatureC;
  }
  
  // ------------------------
  // Process thermistor reading and act if threshold exceeded
  // ------------------------
  void processThermistor() {
    currentTemperature = readTemperature();
    if (currentTemperature > TEMP_THRESHOLD) {
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
}