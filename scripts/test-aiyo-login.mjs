#!/usr/bin/env node
/**
 * 验证 aiyo-login 接口调用的诊断脚本
 *
 * 测试 3 层：
 *   1. xspace identity API 直连 (127.0.0.1:8000)
 *   2. sidecar 代理 (127.0.0.1:3456)
 *   3. 对比两端响应
 */

const XSPACE_HOST = '127.0.0.1';
const XSPACE_PORT = 8000;
const SIDECAR_URL = 'http://127.0.0.1:3456';
const API_KEY = 'xspace_ak_49d66ddc70ae9f7a962d4e3079de59e4';

// ── Helpers ──────────────────────────────────────────────

function indent(text, spaces = 2) {
  const prefix = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((l) => prefix + l)
    .join('\n');
}

function formatDuration(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

async function httpRequest({ hostname, port, path, method, headers, body }) {
  const { request } = await import('http');
  return new Promise((resolve, reject) => {
    const opts = { hostname, port, path, method, headers, timeout: 10_000 };

    const req = request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve({ status: res.statusCode, headers: res.headers, raw });
      });
    });

    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });

    if (body) req.write(body);
    req.end();
  });
}

async function fetchJson(url, opts = {}) {
  const { method = 'GET', headers = {}, body } = opts;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    return { status: res.status, raw: text };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Step 1: 直连 xspace identity API ─────────────────────

async function testXspaceDirect() {
  console.log('━━━ Step 1: 直连 xspace identity API ━━━');
  console.log(`   POST http://${XSPACE_HOST}:${XSPACE_PORT}/api/identity/resolve`);

  const started = Date.now();
  try {
    const body = JSON.stringify({});
    const res = await httpRequest({
      hostname: XSPACE_HOST,
      port: XSPACE_PORT,
      path: '/api/identity/resolve',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Api-Key': API_KEY,
      },
      body,
    });
    const elapsed = Date.now() - started;

    console.log(`   ✓ 状态码: ${res.status} (${formatDuration(elapsed)})`);
    console.log(`   ✓ 响应头: ${JSON.stringify(res.headers)}`);

    let parsed;
    try { parsed = JSON.parse(res.raw); } catch { parsed = res.raw; }
    console.log(`   ✓ 响应体:\n${indent(JSON.stringify(parsed, null, 2), 6)}`);

    return { ok: res.status === 200, parsed, raw: res.raw };
  } catch (err) {
    const elapsed = Date.now() - started;
    console.log(`   ✗ 失败 (${formatDuration(elapsed)}): ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// ── Step 2: 通过 sidecar 代理 ────────────────────────────

async function testSidecarProxy() {
  console.log('\n━━━ Step 2: 通过 sidecar 代理调用 ━━━');
  console.log(`   POST ${SIDECAR_URL}/api/aiyo-login/verify`);

  const started = Date.now();
  try {
    const res = await fetchJson(`${SIDECAR_URL}/api/aiyo-login/verify`, {
      method: 'POST',
      body: {},
    });
    const elapsed = Date.now() - started;

    console.log(`   ✓ 状态码: ${res.status} (${formatDuration(elapsed)})`);

    let parsed;
    try { parsed = JSON.parse(res.raw); } catch { parsed = res.raw; }
    console.log(`   ✓ 响应体:\n${indent(JSON.stringify(parsed, null, 2), 6)}`);

    return { ok: res.status === 200, parsed, raw: res.raw };
  } catch (err) {
    const elapsed = Date.now() - started;
    console.log(`   ✗ 失败 (${formatDuration(elapsed)}): ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// ── Step 3: 查 sidecar 缓存状态 ─────────────────────────

async function testSidecarStatus() {
  console.log('\n━━━ Step 3: 查 sidecar 缓存状态 ━━━');
  console.log(`   GET ${SIDECAR_URL}/api/aiyo-login`);

  try {
    const res = await fetchJson(`${SIDECAR_URL}/api/aiyo-login`);
    console.log(`   ✓ 状态码: ${res.status}`);
    let parsed;
    try { parsed = JSON.parse(res.raw); } catch { parsed = res.raw; }
    console.log(`   ✓ 响应体:\n${indent(JSON.stringify(parsed, null, 2), 6)}`);
    return { ok: res.status === 200, parsed, raw: res.raw };
  } catch (err) {
    console.log(`   ✗ 失败: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// ── Step 4: TCP 端口连通性 ───────────────────────────────

async function checkPort(host, port, label) {
  const net = await import('net');
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(3000);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => { sock.destroy(); resolve(false); });
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  }).then((open) => {
    console.log(`   ${open ? '✓' : '✗'} ${label} (${host}:${port}) — ${open ? '可达' : '不可达'}`);
    return open;
  });
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   aiyo-login 接口诊断脚本               ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`   时间: ${new Date().toISOString()}`);
  console.log(`   xspace: http://${XSPACE_HOST}:${XSPACE_PORT}/api/identity/resolve`);
  console.log(`   sidecar: ${SIDECAR_URL}/api/aiyo-login`);
  console.log(`   API Key: ${API_KEY.slice(0, 12)}...\n`);

  // 先检查端口
  console.log('━━━ 端口连通性检查 ━━━');
  const [xspaceUp, sidecarUp] = await Promise.all([
    checkPort(XSPACE_HOST, XSPACE_PORT, 'xspace'),
    checkPort('127.0.0.1', 3456, 'sidecar'),
  ]);
  console.log('');

  if (!xspaceUp) {
    console.log('⚠️  xspace 服务 (127.0.0.1:8000) 不可达！');
    console.log('   请确认 xspace 服务是否已启动。\n');
  }

  if (!sidecarUp) {
    console.log('⚠️  sidecar 服务 (127.0.0.1:3456) 不可达！');
    console.log('   请确认 sidecar/桌面应用是否已启动。\n');
  }

  // Step 1: 直连
  const directResult = await testXspaceDirect();

  // Step 2: 通过 sidecar
  const proxyResult = await testSidecarProxy();

  // Step 3: 缓存状态
  const statusResult = await testSidecarStatus();

  // ── 汇总 ────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   诊断汇总                               ║');
  console.log('╚══════════════════════════════════════════╝');

  const checks = [
    { label: 'xspace 端口可达', pass: xspaceUp },
    { label: 'sidecar 端口可达', pass: sidecarUp },
    { label: 'xspace 直连 (200)', pass: directResult.ok },
    { label: 'sidecar 代理 (200)', pass: proxyResult.ok },
  ];

  for (const c of checks) {
    console.log(`   ${c.pass ? '✅' : '❌'} ${c.label}`);
  }

  // 分析
  if (!directResult.ok && proxyResult.ok) {
    console.log('\n   ⚠️  sidecar 返回成功但直连失败 — 可能是缓存命中');
  }

  if (directResult.ok && !proxyResult.ok) {
    console.log('\n   ⚠️  xspace 返回值正常，但 sidecar 代理失败');
    console.log('   问题在 sidecar 层的路由/handler 中');
  }

  if (!directResult.ok && !proxyResult.ok) {
    console.log('\n   ⚠️  xspace 和 sidecar 都失败');
    if (!xspaceUp) {
      console.log('   根因: xspace 服务未启动');
    } else {
      console.log('   根因: xspace 可达但 API 返回非 200');
      console.log(`   xspace 响应: ${directResult.raw || directResult.error}`);
    }
  }

  console.log('');
}

main().catch((err) => {
  console.error('脚本执行异常:', err);
  process.exit(1);
});
