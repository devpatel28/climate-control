import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createApp } from './server.mjs';

function nextState(ws, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', handler); reject(new Error('Timed out waiting for state')); }, 3000);
    function handler(raw) { const state = JSON.parse(raw); if (predicate(state)) { clearTimeout(timer); ws.off('message', handler); resolve(state); } }
    ws.on('message', handler);
  });
}
test('HTTP routes and two clients synchronize settings', async () => {
  const app = await createApp({ port: 0, intervalMs: 30 });
  const origin = `http://127.0.0.1:${app.port}`;
  let a, b;
  try {
    assert.equal((await fetch(origin + '/health')).status, 200);
    assert.equal((await fetch(origin + '/missing')).status, 404);
    assert.equal((await fetch(origin + '/health', { method: 'POST' })).status, 405);
    a = new WebSocket(`ws://127.0.0.1:${app.port}/ws`, { origin }); await once(a, 'open');
    b = new WebSocket(`ws://127.0.0.1:${app.port}/ws`, { origin }); await once(b, 'open');
    const first = nextState(a, s => s.type === 'state' && s.revision === 1);
    const second = nextState(b, s => s.type === 'state' && s.revision === 1);
    a.send(JSON.stringify({ revision: 0, target: 24, mode: 'auto' }));
    assert.equal((await first).target, 24); assert.equal((await second).target, 24);
    const rejected = nextState(b, s => s.type === 'error');
    b.send(JSON.stringify({ revision: 0, target: 20, mode: 'auto' }));
    assert.match((await rejected).message, /another window/);
    const malformed = nextState(a, s => s.type === 'error'); a.send('{');
    assert.equal((await malformed).type, 'error');
  } finally { a?.terminate(); b?.terminate(); await app.close(); }
});
test('untrusted website origins cannot control the local device', async () => {
  const app = await createApp({ port: 0 });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`, { origin: 'https://untrusted.example' });
    const error = await once(ws, 'error');
    assert.match(error[0].message, /403/);
  } finally { await app.close(); }
});
test('serial mode requires a device path', async () => {
  await assert.rejects(createApp({ mode: 'serial' }), /SERIAL_PATH/);
});
