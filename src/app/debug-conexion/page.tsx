'use client';

import { useEffect, useState, useRef } from 'react';

interface MemorySample { ts: number; heap_mb: number; rss_mb: number; }
interface ServerInfo {
  NODE_ENV: string | null;
  NODE_OPTIONS: string | null;
  max_old_space_mb: number | null;
  node_version: string;
  uptime_seconds: number;
  heap_mb: number;
  rss_mb: number;
  heap_pct: number | null;
  growth_mb: number;
  elapsed_min: number;
  samples: MemorySample[];
}

interface CheckResult {
  label: string;
  status: 'ok' | 'error' | 'warn' | 'running';
  detail: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '(no definida)';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '(no definida)';
const NODE_ENV = process.env.NODE_ENV ?? '(no definido)';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()!.split(';').shift() ?? null;
  return null;
}

export default function DebugConexion() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchMemory() {
    try {
      const res = await fetch('/api/server-info');
      const data: ServerInfo = await res.json();
      setServerInfo(data);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchMemory();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchMemory, 10000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh]);

  function addCheck(c: CheckResult) {
    setChecks(prev => [...prev.filter(p => p.label !== c.label), c]);
  }

  async function runChecks() {
    setChecks([]);
    setRunning(true);

    // 0 — Variables del servidor (NODE_OPTIONS, NODE_ENV real, memoria)
    addCheck({ label: 'Servidor: NODE_OPTIONS', status: 'running', detail: 'Consultando...' });
    try {
      const res = await fetch('/api/server-info');
      const data = await res.json();

      addCheck({
        label: 'Servidor: NODE_OPTIONS',
        status: data.NODE_OPTIONS ? 'ok' : 'error',
        detail: data.NODE_OPTIONS
          ? data.NODE_OPTIONS
          : 'No definida — el límite de memoria NO está activo. Agrega NODE_OPTIONS=--max-old-space-size=512 en el panel de hosting',
      });

      addCheck({
        label: 'Servidor: límite de memoria heap',
        status: data.max_old_space_mb ? 'ok' : 'error',
        detail: data.max_old_space_mb
          ? `${data.max_old_space_mb} MB — límite activo`
          : 'Sin límite — Node.js puede consumir toda la RAM del servidor',
      });

      addCheck({
        label: 'Servidor: NODE_ENV',
        status: data.NODE_ENV === 'production' ? 'ok' : 'warn',
        detail: data.NODE_ENV
          ? `${data.NODE_ENV}${data.NODE_ENV !== 'production' ? ' — cambia Application mode a Production en cPanel' : ''}`
          : '(no definido)',
      });

      addCheck({
        label: 'Servidor: uso actual de memoria heap',
        status: data.max_old_space_mb && data.memory_usage_mb > data.max_old_space_mb * 0.85 ? 'warn' : 'ok',
        detail: `${data.memory_usage_mb} MB usados — Node.js ${data.node_version} · uptime ${Math.floor(data.uptime_seconds / 60)} min`,
      });

    } catch {
      addCheck({ label: 'Servidor: NODE_OPTIONS', status: 'error', detail: 'No se pudo consultar /api/server-info' });
    }

    // 1 — Variables de entorno baked en el build
    const apiDefinida = !!process.env.NEXT_PUBLIC_API_URL;
    const backDefinida = !!process.env.NEXT_PUBLIC_BACKEND_URL;
    const apiEsProduccion = apiDefinida && !API_URL.includes('localhost');
    const backEsProduccion = backDefinida && !BACKEND_URL.includes('localhost');

    // NODE_ENV
    addCheck({
      label: 'NODE_ENV',
      status: NODE_ENV === 'production' ? 'ok' : 'warn',
      detail: NODE_ENV === 'production'
        ? 'production — correcto, Node.js está en modo producción'
        : `${NODE_ENV} — debería ser "production". Cambia Application mode en el panel de hosting`,
    });

    // NEXT_PUBLIC_API_URL — ¿definida?
    addCheck({
      label: 'NEXT_PUBLIC_API_URL definida',
      status: apiDefinida ? 'ok' : 'error',
      detail: apiDefinida
        ? API_URL
        : 'undefined — la variable no existía cuando se hizo el build. Agrega la variable en el panel y reconstruye',
    });

    // NEXT_PUBLIC_API_URL — ¿apunta a producción?
    addCheck({
      label: 'NEXT_PUBLIC_API_URL apunta a producción',
      status: apiEsProduccion ? 'ok' : 'warn',
      detail: apiEsProduccion
        ? API_URL
        : `${API_URL} — contiene "localhost". El frontend llamará al backend en tu máquina local, no al servidor`,
    });

    // NEXT_PUBLIC_BACKEND_URL — ¿definida?
    addCheck({
      label: 'NEXT_PUBLIC_BACKEND_URL definida',
      status: backDefinida ? 'ok' : 'error',
      detail: backDefinida
        ? BACKEND_URL
        : 'undefined — la variable no existía cuando se hizo el build',
    });

    // NEXT_PUBLIC_BACKEND_URL — ¿apunta a producción?
    addCheck({
      label: 'NEXT_PUBLIC_BACKEND_URL apunta a producción',
      status: backEsProduccion ? 'ok' : 'warn',
      detail: backEsProduccion
        ? BACKEND_URL
        : `${BACKEND_URL} — contiene "localhost"`,
    });

    if (!apiDefinida) {
      addCheck({
        label: 'Resto de checks cancelados',
        status: 'warn',
        detail: 'Sin NEXT_PUBLIC_API_URL los checks de red no tienen sentido. Define la variable y reconstruye el proyecto.',
      });
      setRunning(false);
      return;
    }

    // 2 — Alcanzabilidad del backend (OPTIONS preflight manual)
    addCheck({ label: 'Conectividad al backend', status: 'running', detail: 'Probando...' });
    try {
      const baseUrl = API_URL.replace(/\/api\/?$/, '');
      const res = await fetch(`${API_URL}/auth/csrf/`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      const corsOrigin = res.headers.get('access-control-allow-origin');
      const corsCredentials = res.headers.get('access-control-allow-credentials');

      addCheck({
        label: 'Conectividad al backend',
        status: res.ok ? 'ok' : 'error',
        detail: `HTTP ${res.status} ${res.statusText} — ${baseUrl}`,
      });

      // 3 — CORS headers
      addCheck({
        label: 'CORS: Access-Control-Allow-Origin',
        status: corsOrigin ? 'ok' : 'error',
        detail: corsOrigin
          ? corsOrigin
          : 'Header ausente — Django no tiene el origen del frontend en CORS_ALLOWED_ORIGINS',
      });

      addCheck({
        label: 'CORS: Access-Control-Allow-Credentials',
        status: corsCredentials === 'true' ? 'ok' : 'warn',
        detail: corsCredentials ?? 'ausente — necesario para que las cookies de sesión funcionen',
      });

      // 4 — Cookie CSRF
      const cookie = getCookie('csrftoken');
      addCheck({
        label: 'Cookie csrftoken recibida',
        status: cookie ? 'ok' : 'error',
        detail: cookie
          ? `csrftoken = ${cookie.substring(0, 12)}...`
          : 'No se recibió — el endpoint /api/auth/csrf/ no está configurando la cookie. Revisa CSRF_COOKIE_SAMESITE y CSRF_COOKIE_SECURE en settings.py',
      });

      // 5 — Content-Type de la respuesta
      const ct = res.headers.get('content-type') ?? '';
      let body = '';
      try { body = await res.text(); } catch { /* ignore */ }
      addCheck({
        label: 'Respuesta de /api/auth/csrf/',
        status: ct.includes('json') ? 'ok' : 'warn',
        detail: `Content-Type: ${ct || 'ninguno'} | Body: ${body.substring(0, 120)}`,
      });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isNetErr = msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network');

      addCheck({
        label: 'Conectividad al backend',
        status: 'error',
        detail: msg,
      });

      addCheck({
        label: 'CORS: Access-Control-Allow-Origin',
        status: 'error',
        detail: isNetErr
          ? 'No se pudo conectar — posible error de CORS bloqueado por el browser, o el backend no está corriendo'
          : 'Error desconocido',
      });
    }

    // 6 — Intento de login con credenciales inválidas (solo para verificar que el endpoint responde)
    addCheck({ label: 'Endpoint /api/auth/login/ responde', status: 'running', detail: 'Probando...' });
    try {
      const csrf = getCookie('csrftoken') ?? '';
      const res = await fetch(`${API_URL}/auth/login/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrf,
        },
        body: JSON.stringify({ username: '__debug_probe__', password: '__debug_probe__' }),
      });

      // 400 o 401 = el endpoint existe y respondió (solo que las creds son malas, que es lo esperado)
      const loginOk = res.status === 400 || res.status === 401 || res.status === 200;
      addCheck({
        label: 'Endpoint /api/auth/login/ responde',
        status: loginOk ? 'ok' : 'error',
        detail: `HTTP ${res.status} — ${loginOk ? 'endpoint alcanzable (credenciales de prueba inválidas, es correcto)' : 'respuesta inesperada'}`,
      });
    } catch (err: unknown) {
      addCheck({
        label: 'Endpoint /api/auth/login/ responde',
        status: 'error',
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    setRunning(false);
  }

  useEffect(() => { runChecks(); }, []);

  const statusColor: Record<CheckResult['status'], string> = {
    ok: '#10b981',
    error: '#ef4444',
    warn: '#a68942',
    running: '#6b7280',
  };

  const statusLabel: Record<CheckResult['status'], string> = {
    ok: 'OK',
    error: 'ERROR',
    warn: 'AVISO',
    running: '...',
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#f9fafb', minHeight: '100vh', padding: '2rem' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        <div style={{ background: '#003366', color: '#fff', borderRadius: 10, padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
          <strong style={{ fontSize: '1rem' }}>ISAP — Diagnóstico de conexión Frontend ↔ Backend</strong>
          <p style={{ fontSize: '0.8125rem', opacity: 0.75, marginTop: 4 }}>
            Ejecuta checks desde el browser. Lo que ves aquí es lo que ve el usuario real.
          </p>
        </div>

        <div style={{ background: '#fff', border: '1px solid #CCD0D8', borderRadius: 10, padding: '1.25rem 1.5rem', marginBottom: '1.25rem', fontSize: '0.8125rem' }}>
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: '#6b7280' }}>NODE_ENV  </span>
            <code style={{
              fontWeight: 700,
              color: NODE_ENV === 'production' ? '#10b981' : '#d97706',
            }}>{NODE_ENV}</code>
          </div>
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: '#6b7280' }}>NEXT_PUBLIC_API_URL  </span>
            <code style={{ color: API_URL === '(no definida)' ? '#ef4444' : '#003366', fontWeight: 600 }}>{API_URL}</code>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>NEXT_PUBLIC_BACKEND_URL  </span>
            <code style={{ color: BACKEND_URL === '(no definida)' ? '#ef4444' : '#003366', fontWeight: 600 }}>{BACKEND_URL}</code>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #CCD0D8', borderRadius: 10, overflow: 'hidden', marginBottom: '1.25rem' }}>
          {checks.map((c, i) => (
            <div
              key={c.label}
              style={{
                display: 'flex', gap: '1rem', alignItems: 'flex-start',
                padding: '0.85rem 1.25rem',
                borderBottom: i < checks.length - 1 ? '1px solid #f0f0f0' : 'none',
              }}
            >
              <span style={{
                background: statusColor[c.status] + '18',
                color: statusColor[c.status],
                fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.05em',
                padding: '2px 8px', borderRadius: 4, flexShrink: 0, marginTop: 2,
                minWidth: 52, textAlign: 'center',
              }}>
                {statusLabel[c.status]}
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1f2937' }}>{c.label}</div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2, wordBreak: 'break-all' }}>{c.detail}</div>
              </div>
            </div>
          ))}
          {checks.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Iniciando checks...</div>
          )}
        </div>

        <div style={{ textAlign: 'center' }}>
          <button
            onClick={runChecks}
            disabled={running}
            style={{
              background: running ? '#CCD0D8' : '#003366', color: '#fff',
              border: 'none', borderRadius: 8, padding: '0.625rem 1.5rem',
              fontSize: '0.875rem', fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer',
            }}
          >
            {running ? 'Ejecutando...' : 'Volver a ejecutar'}
          </button>
        </div>

        {/* ── Monitor de memoria en vivo ── */}
        <div style={{ background: '#fff', border: '1px solid #CCD0D8', borderRadius: 10, padding: '1.25rem 1.5rem', marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <strong style={{ fontSize: '0.875rem', color: '#1f2937' }}>Monitor de memoria — proceso Node.js</strong>
            <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={e => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh cada 10 s
            </label>
          </div>

          {serverInfo && (() => {
            const limit = serverInfo.max_old_space_mb ?? 512;
            const pct = Math.round((serverInfo.heap_mb / limit) * 100);
            const barColor = pct > 85 ? '#ef4444' : pct > 60 ? '#d97706' : '#10b981';
            const samples = serverInfo.samples;
            const maxHeap = Math.max(...samples.map(s => s.heap_mb), limit);

            return (
              <>
                {/* Barra de uso actual */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#6b7280', marginBottom: 4 }}>
                    <span>Heap usado: <strong style={{ color: barColor }}>{serverInfo.heap_mb} MB</strong></span>
                    <span>Límite: {limit} MB ({pct}%)</span>
                  </div>
                  <div style={{ background: '#f0f0f0', borderRadius: 4, height: 10, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(pct, 100)}%`, background: barColor, height: '100%', transition: 'width 0.3s' }} />
                  </div>
                </div>

                {/* Métricas secundarias */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: '1rem' }}>
                  {[
                    { label: 'RSS total', value: `${serverInfo.rss_mb} MB` },
                    { label: 'Crecimiento', value: `+${serverInfo.growth_mb} MB`, alert: serverInfo.growth_mb > 50 },
                    { label: 'En ${serverInfo.elapsed_min} min', value: serverInfo.elapsed_min > 0 ? `${serverInfo.elapsed_min} min` : '< 1 min' },
                    { label: 'Uptime', value: `${Math.floor(serverInfo.uptime_seconds / 60)} min` },
                  ].map(m => (
                    <div key={m.label} style={{ background: '#f9fafb', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginBottom: 2 }}>{m.label}</div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: m.alert ? '#ef4444' : '#1f2937' }}>{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* Gráfica de muestras */}
                {samples.length > 1 && (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: 4 }}>
                      Historial heap ({samples.length} muestras)
                    </div>
                    <svg viewBox={`0 0 ${samples.length * 8} 60`} style={{ width: '100%', height: 60, display: 'block' }}>
                      {/* Línea de límite */}
                      <line
                        x1={0} y1={60 - (limit / maxHeap) * 60}
                        x2={samples.length * 8} y2={60 - (limit / maxHeap) * 60}
                        stroke="#ef4444" strokeWidth={0.5} strokeDasharray="2,2"
                      />
                      {/* Área */}
                      <polyline
                        points={samples.map((s, i) => `${i * 8 + 4},${60 - (s.heap_mb / maxHeap) * 58}`).join(' ')}
                        fill="none" stroke="#003366" strokeWidth={1.5}
                      />
                      {samples.map((s, i) => (
                        <circle key={i} cx={i * 8 + 4} cy={60 - (s.heap_mb / maxHeap) * 58} r={2} fill="#003366" />
                      ))}
                    </svg>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#9ca3af' }}>
                      <span>{new Date(samples[0].ts).toLocaleTimeString()}</span>
                      <span style={{ color: '#ef4444' }}>— límite {limit} MB</span>
                      <span>{new Date(samples[samples.length - 1].ts).toLocaleTimeString()}</span>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {!serverInfo && <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Cargando...</p>}

          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <button onClick={fetchMemory} style={{ fontSize: '0.75rem', color: '#003366', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Actualizar ahora
            </button>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#6b7280', marginTop: '1.5rem' }}>
          Elimina esta página antes de dejar el sistema en producción permanente —{' '}
          <code>src/app/debug-conexion/page.tsx</code>
        </p>
      </div>
    </div>
  );
}
