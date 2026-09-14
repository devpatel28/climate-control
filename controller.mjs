/** Pure controller: hysteresis avoids output chatter around the setpoint. */
export class Controller {
  constructor({ target = 22, band = 0.5, staleMs = 5000, clock = Date.now } = {}) {
    this.clock = clock;
    this.target = target;
    this.band = band;
    this.staleMs = staleMs;
    this.mode = 'auto';
    this.temperature = null;
    this.lastReading = null;
    this.output = 'off';
    this.fault = 'Waiting for sensor';
    this.revision = 0;
  }
  configure(command) {
    if (!command || Array.isArray(command) || typeof command !== 'object') throw new Error('Invalid command');
    if (!Number.isInteger(command.revision) || command.revision !== this.revision) throw new Error('Settings changed in another window. Please try again.');
    if (Object.keys(command).some(k => !['revision', 'target', 'mode'].includes(k))) throw new Error('Unknown setting');
    if (typeof command.target !== 'number' || !Number.isFinite(command.target) || command.target < 16 || command.target > 30) throw new Error('Target must be 16–30 °C');
    if (!['auto', 'off'].includes(command.mode)) throw new Error('Mode must be auto or off');
    this.target = Math.round(command.target * 10) / 10;
    this.mode = command.mode;
    this.revision++;
    return this.tick();
  }
  ingest(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < -20 || value > 60) {
      this.temperature = null;
      this.lastReading = null;
      this.fault = 'Invalid sensor reading';
      this.output = 'off';
      return this.snapshot();
    }
    this.temperature = value;
    this.lastReading = this.clock();
    this.fault = null;
    return this.tick();
  }
  disconnect(reason = 'Sensor disconnected') {
    this.temperature = null;
    this.lastReading = null;
    this.fault = reason;
    this.output = 'off';
    return this.snapshot();
  }
  tick() {
    if (this.lastReading === null || this.clock() - this.lastReading > this.staleMs) {
      this.fault = this.lastReading === null ? this.fault : 'Sensor reading is stale';
      this.output = 'off';
    } else if (this.mode === 'off') {
      this.output = 'off';
    } else {
      const t = this.temperature;
      if (t <= this.target - this.band) this.output = 'heat';
      else if (t >= this.target + this.band) this.output = 'cool';
      else if (this.output === 'heat' && t >= this.target || this.output === 'cool' && t <= this.target) this.output = 'off';
    }
    return this.snapshot();
  }
  snapshot() {
    return { target: this.target, band: this.band, mode: this.mode, temperature: this.temperature, output: this.output, fault: this.fault, lastReading: this.lastReading, revision: this.revision };
  }
}

export function parseReading(line) {
  const data = JSON.parse(line);
  if (!data || typeof data !== 'object' || data.type !== 'reading') throw new Error('Invalid serial message');
  return data.temperature;
}
