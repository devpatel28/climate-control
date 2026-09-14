import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Controller, parseReading } from './controller.mjs';

export async function createApp({ mode = 'simulate', serialPath, host = '127.0.0.1', port = 8100, intervalMs = 1000, controller = new Controller() } = {}) {
  if (!['simulate', 'serial'].includes(mode)) throw new Error('MODE must be simulate or serial');
  if (mode === 'serial' && !serialPath) throw new Error('SERIAL_PATH is required in serial mode');
  const history = [], events = [];
  let serial = null, serialError = null, simulatedTemp = 25, lastOutput = null, closing = false;
  const record = message => { events.unshift({ at: Date.now(), message }); events.splice(30); };
  record(mode === 'simulate' ? 'Simulation started — no hardware connected' : 'Waiting for Arduino');
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    if (pathname === '/health') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ status: 'ok', mode, sensor: controller.snapshot().fault ? 'unavailable' : 'ready' })); return; }
    const paths = { '/': ['index.html', 'text/html'], '/app.js': ['dist/app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
    if (!paths[pathname]) { res.writeHead(404); res.end('Not found'); return; }
    try { const [file, mime] = paths[pathname]; const body = await readFile(new URL(file, import.meta.url)); res.setHeader('Content-Type', mime + '; charset=utf-8'); res.end(body); }
    catch { res.writeHead(503); res.end('Build the frontend first: npm run build'); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  const snapshot = () => ({ type: 'state', ...controller.snapshot(), source: mode, history, events, clients: wss.clients.size });
  const broadcast = () => { const data = JSON.stringify(snapshot()); for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) { if (client.bufferedAmount > 1_000_000) client.terminate(); else client.send(data); } };
  const applyOutput = () => {
    const state = controller.tick();
    if (state.output !== lastOutput) { record(`Output: ${state.output}${state.fault ? ' — ' + state.fault : ''}`); lastOutput = state.output; }
    // A 1 Hz heartbeat keeps the firmware watchdog alive. Only one output can be on.
    if (serial?.isOpen && !serialError) serial.write(state.output.toUpperCase() + '\n', error => { if (error) { serialError = error; controller.disconnect('Serial write failed'); } });
  };
  server.on('upgrade', (req, socket, head) => {
    const assignedPort = server.address()?.port;
    const origins = [`http://localhost:${assignedPort}`, `http://127.0.0.1:${assignedPort}`];
    if (req.url !== '/ws' || !origins.includes(req.headers.origin) || ![`localhost:${assignedPort}`, `127.0.0.1:${assignedPort}`].includes(req.headers.host)) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  wss.on('connection', ws => {
    let windowStart = Date.now(), count = 0;
    ws.on('error', () => {});
    ws.on('message', raw => {
      if (Date.now() - windowStart > 1000) { windowStart = Date.now(); count = 0; }
      if (++count > 10) { ws.close(1008, 'Too many commands'); return; }
      try {
        const data = JSON.parse(raw.toString());
        controller.configure(data);
        record(`Settings: ${controller.target.toFixed(1)} °C · ${controller.mode}`);
        applyOutput(); broadcast();
      } catch (error) { ws.send(JSON.stringify({ type: 'error', message: error.message })); }
    });
    ws.on('close', () => { if (!closing) broadcast(); });
    broadcast();
  });
  if (mode === 'serial') {
    const { SerialPort } = await import('serialport');
    serial = new SerialPort({ path: serialPath, baudRate: 9600, autoOpen: false });
    let buffer = '';
    serial.on('data', chunk => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 4096) { buffer = ''; controller.disconnect('Serial message too long'); return; }
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
        if (!line) continue;
        try { controller.ingest(parseReading(line)); } catch { controller.disconnect('Invalid serial message'); }
      }
    });
    serial.on('error', error => { serialError = error; controller.disconnect('Serial connection error'); record('Serial connection error; restart after reconnecting the device'); });
    serial.on('close', () => controller.disconnect());
    serial.open(error => { if (error) { serialError = error; controller.disconnect('Cannot open serial port'); } else record('Arduino serial port opened'); });
  }
  const timer = setInterval(() => {
    if (mode === 'simulate') {
      const output = controller.output;
      simulatedTemp += (24 - simulatedTemp) * 0.015 + (output === 'heat' ? 0.10 : output === 'cool' ? -0.12 : 0);
      controller.ingest(Math.round(simulatedTemp * 100) / 100);
    }
    applyOutput();
    const state = controller.snapshot();
    history.push({ at: Date.now(), temperature: state.fault ? null : state.temperature, target: state.target });
    history.splice(0, Math.max(0, history.length - 120));
    broadcast();
  }, intervalMs);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return {
    port: server.address().port,
    close: async () => {
      closing = true; clearInterval(timer);
      for (const client of wss.clients) client.terminate();
      wss.close();
      if (serial?.isOpen) await new Promise(resolve => serial.write('OFF\n', () => serial.drain(() => serial.close(resolve))));
      await new Promise(resolve => server.close(resolve));
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await createApp({ mode: process.env.MODE || 'simulate', serialPath: process.env.SERIAL_PATH, host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 8100) });
  console.log(`Climate Control: http://127.0.0.1:${app.port} (${process.env.MODE || 'simulate'})`);
  let stopping = false;
  const shutdown = async () => { if (stopping) return; stopping = true; await app.close(); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
