import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [state, setState] = useState(null), [connected, setConnected] = useState(false), [error, setError] = useState('');
  const [target, setTarget] = useState(22), [mode, setMode] = useState('auto');
  const wsRef = useRef(null), revision = useRef(-1);
  useEffect(() => {
    let active = true, retry;
    const connect = () => {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`); wsRef.current = ws;
      ws.onopen = () => { if (active) setConnected(true); };
      ws.onmessage = event => {
        if (!active) return;
        const data = JSON.parse(event.data);
        if (data.type === 'error') { setError(data.message); return; }
        if (data.type !== 'state') return;
        setState(data);
        if (revision.current !== data.revision) { setTarget(data.target); setMode(data.mode); revision.current = data.revision; }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => { if (active) { setConnected(false); retry = setTimeout(connect, 1500); } };
    };
    connect();
    return () => { active = false; clearTimeout(retry); wsRef.current?.close(); };
  }, []);
  function apply(event) {
    event.preventDefault(); setError('');
    if (wsRef.current?.readyState !== WebSocket.OPEN) { setError('Reconnect before changing settings.'); return; }
    wsRef.current.send(JSON.stringify({ target: Number(target), mode, revision: state.revision }));
  }
  const history = state?.history || [];
  const points = history.filter(p => p.temperature !== null);
  const low = Math.min(18, ...points.map(p => p.temperature), state?.target || 22) - 1;
  const high = Math.max(27, ...points.map(p => p.temperature), state?.target || 22) + 1;
  const x = i => 36 + i / Math.max(1, history.length - 1) * 820;
  const y = t => 190 - (t - low) / (high - low) * 160;
  let line = '', gap = true;
  history.forEach((p, i) => { if (p.temperature === null) { gap = true; return; } line += `${gap ? 'M' : 'L'}${x(i)},${y(p.temperature)} `; gap = false; });
  return <><header><a className="brand" href="/">◉ <strong>climate<span>control</span></strong></a><span className={`connection ${connected ? 'online' : ''}`}>{connected ? '● Connected' : '○ Reconnecting'}</span></header>
    <main><div className="page-heading"><div><p className="eyebrow">HOME AUTOMATION LAB</p><h1>A little more comfortable.</h1><p>Monitor the room. Set your temperature. See the system respond.</p></div><span className="source">{state?.source === 'serial' ? 'ARDUINO · USB SERIAL' : 'SIMULATED ROOM'}</span></div>
    {!connected && <div className="notice" role="status">Connecting to the local controller. Displayed readings may be out of date.</div>}
    {state?.fault && <div className="notice" role="alert">{state.fault} — output is off.</div>}
    <div className="grid"><section className="room panel"><div className="card-title"><h2>Living room</h2><span>°C</span></div><div className={`temperature ${!connected ? 'dim' : ''}`}>{state?.temperature == null ? '—' : state.temperature.toFixed(1)}<sup>°</sup></div><p className="reading-label">{state?.source === 'serial' ? 'Sensor reading' : 'Simulated temperature'}</p><div className="output"><span className={`output-dot ${state?.output || 'off'}`}></span>{!connected ? 'Connection lost' : state?.fault ? 'Output off · sensor unavailable' : state?.output === 'cool' ? 'Cooling requested' : state?.output === 'heat' ? 'Heating requested' : 'Output idle'}</div><div className="room-footer"><span>Target <b>{state?.target?.toFixed(1) || '22.0'}°</b></span><span>Mode <b>{state?.mode || 'auto'}</b></span></div></section>
    <section className="panel settings"><p className="eyebrow">YOUR COMFORT</p><h2>Set the room temperature</h2><form onSubmit={apply}><label htmlFor="target">Target temperature</label><div className="target-control"><button type="button" disabled={!connected || target <= 16} aria-label="Decrease target" onClick={() => setTarget(Math.max(16, Number(target) - .5))}>−</button><output htmlFor="target">{Number(target).toFixed(1)}<small> °C</small></output><button type="button" disabled={!connected || target >= 30} aria-label="Increase target" onClick={() => setTarget(Math.min(30, Number(target) + .5))}>+</button></div><input id="target" aria-label="Target temperature" type="range" min="16" max="30" step="0.5" value={target} disabled={!connected} onChange={e => setTarget(Number(e.target.value))}/><div className="range-labels"><span>16 °C</span><span>30 °C</span></div><label htmlFor="mode">Control mode</label><select id="mode" value={mode} disabled={!connected} onChange={e => setMode(e.target.value)}><option value="auto">Automatic</option><option value="off">Off</option></select><button className="primary" disabled={!connected || !state}>Apply settings ↗</button><p className="error" role="alert">{error}</p></form><p className="hint">Automatic control uses a ±0.5 °C band to avoid rapid switching. Settings sync across open windows.</p></section></div>
    <section className="panel trend"><div className="card-title"><div><h2>Room temperature</h2><p>Latest {history.length} readings · one per second in the demo</p></div><div className="legend"><span>━ Measured</span><span>┄ Target</span></div></div>{history.length > 1 ? <svg viewBox="0 0 880 225" role="img" aria-label="Recent room temperatures; values are listed in the reading history below"><title>Room temperature trend</title>{[0,1,2,3,4].map(i => { const t = low+(high-low)*i/4; return <g key={i}><line x1="36" x2="856" y1={y(t)} y2={y(t)} className="gridline"/><text x="0" y={y(t)+4}>{t.toFixed(0)}°</text></g>; })}<path d={history.map((p,i)=>`${i ? 'L':'M'}${x(i)},${y(p.target)}`).join(' ')} className="target-line"/><path d={line} className="reading-line"/><text x="36" y="220">Earlier</text><text x="825" y="220">Now</text></svg> : <p className="empty">Waiting for readings…</p>}</section>
    <div className="bottom-grid"><section className="panel"><h2>System activity</h2><ul className="activity">{state?.events?.slice(0,7).map((e,i)=><li key={`${e.at}-${i}`}><time>{new Date(e.at).toLocaleTimeString()}</time><span>{e.message}</span></li>)}</ul></section><section className="panel"><h2>About this session</h2><dl><dt>Data source</dt><dd>{state?.source === 'serial' ? 'Arduino temperature sensor' : 'Deterministic room simulation'}</dd><dt>Connected windows</dt><dd>{state?.clients || 0}</dd><dt>History</dt><dd>Last 120 readings · in memory</dd><dt>Output</dt><dd>{state?.source === 'serial' ? 'Requests sent to Arduino indicator LEDs' : 'Software simulation only'}</dd></dl><p className="hint">This lab demonstrates control logic. Hardware output is not confirmed by feedback from the device.</p></section></div>
    <details className="panel"><summary>Reading history</summary><div className="table-scroll"><table><thead><tr><th>Time</th><th>Temperature</th><th>Target</th></tr></thead><tbody>{[...history].reverse().map((p,i)=><tr key={i}><td>{new Date(p.at).toLocaleTimeString()}</td><td>{p.temperature == null ? 'Unavailable' : p.temperature.toFixed(2)+' °C'}</td><td>{p.target.toFixed(1)} °C</td></tr>)}</tbody></table></div></details></main><footer><span>Climate Control · Dev Patel</span><span>Local hardware lab / React + Node.js + Arduino</span></footer></>;
}
createRoot(document.getElementById('root')).render(<App/>);
