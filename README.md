# Climate Control

A temperature-controlled home automation lab by Dev Patel. React displays the room state; a Node.js WebSocket server synchronizes settings across browser windows and runs a hysteresis controller. An Arduino adapter reads a DS18B20 sensor over USB serial and sends mutually exclusive heating/cooling requests to **indicator LEDs**.

This is a new portfolio recreation of the resume project. It includes a working software simulator. Real heating/cooling equipment is not controlled, and physical hardware has not been verified in this build.

## Run the simulator

Install Node.js 22.14+ and pnpm 11.19, then:

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm start
```

Open http://127.0.0.1:8100. The simulated room starts at 25 °C and evolves once per second. Choose a target from 16–30 °C, select Automatic or Off, then click Apply settings. Open the page in a second window to see synchronized settings. The model accelerates room dynamics to demonstrate the controller; it is not calibrated to a real room.

```sh
pnpm test
docker compose up --build
```

Docker runs the simulator only. It publishes to loopback port 8100. Settings and the latest 120 readings are kept in memory and reset on server restart. No account or remote-access feature is included. The interface reconnects after a dropped connection; stale edits from another window are rejected using a revision number.

## Architecture

```text
React windows <-- WebSocket state --> Node.js controller <-- USB serial --> Arduino
                                           |
                              deterministic simulator (default)
```

- The server is authoritative: every accepted setting change is broadcast to every client.
- Below target −0.5 °C, request heating until the target is reached.
- Above target +0.5 °C, request cooling until the target is reached.
- The deadband avoids rapid switching near the target. Heating and cooling cannot be requested together.
- Missing, invalid or stale readings force output off. The Node stale timeout is 5 seconds.
- Arduino requires a valid command every 3 seconds; its watchdog turns both LEDs off if the host disappears.
- WebSockets validate Origin and Host against localhost/127.0.0.1 and restrict message size and rate. This is a local development app, not an authenticated internet service. Do not expose it directly to a network.

The dashboard displays **requested** output. There is no actuator feedback or acknowledgement protocol. Serial reconnection is manual: reconnect the board and restart the server. Firmware handles loss of commands independently.

## Hardware demo

Parts: Arduino Uno, DS18B20 temperature sensor, 4.7 kΩ pull-up resistor, two LEDs, two 330 Ω series resistors, breadboard and USB cable. Connect with power disconnected and verify the pinout of your exact sensor package.

| Component | Uno connection |
|---|---|
| DS18B20 VDD | 5 V |
| DS18B20 GND | GND |
| DS18B20 DQ | D2, with 4.7 kΩ pull-up to 5 V |
| Heating indicator | D8 → 330 Ω resistor → LED anode; cathode to GND |
| Cooling indicator | D9 → 330 Ω resistor → LED anode; cathode to GND |

These outputs are for low-current indicator LEDs only. Do not connect mains voltage, motors, heaters or HVAC equipment to Arduino pins.

In Arduino IDE, install **OneWire** and **DallasTemperature** through Library Manager. Open `firmware/firmware.ino`, choose Arduino Uno and the correct USB port, then upload. Close Serial Monitor before starting Node.js.

PowerShell:

```powershell
$env:MODE = 'serial'
$env:SERIAL_PATH = 'COM3' # Replace with your board's port
pnpm start
```

macOS/Linux:

```sh
MODE=serial SERIAL_PATH=/dev/ttyACM0 pnpm start
```

The serial protocol uses 9600 baud and newline-delimited messages:

```text
Arduino → host: {"type":"reading","temperature":23.50}
Host → Arduino: HEAT\n or COOL\n or OFF\n
```

Disconnected or implausible sensor values produce `temperature:null`. The firmware considers −20 to 60 °C valid for this room demonstration. This deliberately rejects DS18B20 disconnected and 85 °C startup values.

## Tests and project files

- `controller.mjs`: pure control logic; tests cover hysteresis, off mode, invalid/stale readings and conflicting settings.
- `server.mjs`: HTTP, simulator, WebSocket synchronization and serial bridge.
- `server.test.mjs`: integration tests for two clients, malformed input, HTTP routes and rejected origins.
- `app.jsx`, `style.css`: responsive React dashboard with temperature history and activity log.
- `firmware/firmware.ino`: asynchronous temperature conversion, command parser and output watchdog.
- GitHub Actions runs the Node tests, builds the frontend and compiles the Arduino Uno firmware.

Hardware operation and serial disconnection behaviour still require a bench test on your own board. Automated compilation is not proof of electrical or physical operation. The original resume's hardware claims should be supported by your own prior work or a new bench test.

References: [Node SerialPort](https://serialport.io/docs/guide-usage/), [ws](https://github.com/websockets/ws), [DallasTemperature](https://github.com/milesburton/Arduino-Temperature-Control-Library).
