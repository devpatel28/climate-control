// Arduino Uno + DS18B20. Outputs drive indicator LEDs only.
#include <OneWire.h>
#include <DallasTemperature.h>

const byte SENSOR_PIN = 2;
const byte HEAT_LED = 8;
const byte COOL_LED = 9;
const unsigned long WATCHDOG_MS = 3000;
OneWire oneWire(SENSOR_PIN);
DallasTemperature sensors(&oneWire);
unsigned long lastCommand = 0, conversionStarted = 0;
bool sensorValid = false;
char command[12];
byte commandLength = 0;
bool overflow = false;

void outputsOff() {
  digitalWrite(HEAT_LED, LOW);
  digitalWrite(COOL_LED, LOW);
}

void applyCommand() {
  command[commandLength] = '\0';
  if (overflow) { outputsOff(); return; }
  if (!strcmp(command, "OFF")) { outputsOff(); lastCommand = millis(); }
  else if (!strcmp(command, "HEAT") && sensorValid) {
    digitalWrite(COOL_LED, LOW); digitalWrite(HEAT_LED, HIGH); lastCommand = millis();
  } else if (!strcmp(command, "COOL") && sensorValid) {
    digitalWrite(HEAT_LED, LOW); digitalWrite(COOL_LED, HIGH); lastCommand = millis();
  } else outputsOff();
}

void setup() {
  pinMode(HEAT_LED, OUTPUT); pinMode(COOL_LED, OUTPUT); outputsOff();
  Serial.begin(9600);
  sensors.begin();
  sensors.setResolution(12);
  sensors.setWaitForConversion(false);
  sensors.requestTemperatures(); conversionStarted = millis();
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') { applyCommand(); commandLength = 0; overflow = false; }
    else if (c != '\r') {
      if (commandLength < sizeof(command) - 1) command[commandLength++] = c;
      else overflow = true;
    }
  }
  if (millis() - lastCommand > WATCHDOG_MS || !sensorValid) outputsOff();
  if (millis() - conversionStarted >= 1000) {
    float temperature = sensors.getTempCByIndex(0);
    sensorValid = temperature != DEVICE_DISCONNECTED_C && temperature >= -20 && temperature <= 60;
    Serial.print("{\"type\":\"reading\",\"temperature\":");
    if (sensorValid) Serial.print(temperature, 2);
    else { Serial.print("null"); outputsOff(); }
    Serial.println("}");
    sensors.requestTemperatures(); conversionStarted = millis();
  }
}
