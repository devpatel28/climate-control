import test from 'node:test';
import assert from 'node:assert/strict';
import { Controller, parseReading } from './controller.mjs';

test('heating uses hysteresis and stops at target', () => {
  const c = new Controller();
  assert.equal(c.ingest(21.5).output, 'heat');
  assert.equal(c.ingest(21.8).output, 'heat');
  assert.equal(c.ingest(22).output, 'off');
  assert.equal(c.ingest(21.8).output, 'off');
});
test('cooling uses hysteresis and stops at target', () => {
  const c = new Controller();
  assert.equal(c.ingest(22.5).output, 'cool');
  assert.equal(c.ingest(22.1).output, 'cool');
  assert.equal(c.ingest(22).output, 'off');
});
test('stale and invalid sensor readings force off', () => {
  let now = 100;
  const c = new Controller({ clock: () => now });
  c.ingest(25); now += 5001;
  assert.equal(c.tick().output, 'off');
  assert.equal(c.tick().fault, 'Sensor reading is stale');
  for (const bad of [NaN, Infinity, -127, null, '22', 85]) {
    c.ingest(25);
    assert.equal(c.ingest(bad).output, 'off');
    assert.equal(c.snapshot().temperature, null);
  }
  assert.equal(c.ingest(25).fault, null);
});
test('off overrides automatic output', () => {
  const c = new Controller(); c.ingest(18);
  assert.equal(c.configure({ revision: 0, target: 22, mode: 'off' }).output, 'off');
  assert.equal(c.ingest(18).output, 'off');
});
test('configuration validates atomically and rejects stale edits', () => {
  const c = new Controller();
  assert.throws(() => c.configure({ revision: 0, target: 40, mode: 'off' }));
  assert.equal(c.mode, 'auto'); assert.equal(c.revision, 0);
  c.configure({ revision: 0, target: 23, mode: 'auto' });
  assert.throws(() => c.configure({ revision: 0, target: 24, mode: 'auto' }), /another window/);
  assert.equal(c.target, 23);
  assert.throws(() => c.configure({ revision: 1, target: 23, mode: 'heat' }));
});
test('serial parser accepts protocol and rejects malformed records', () => {
  assert.equal(parseReading('{"type":"reading","temperature":23.5}'), 23.5);
  assert.throws(() => parseReading('bad'));
  assert.throws(() => parseReading('{"type":"command"}'));
});
