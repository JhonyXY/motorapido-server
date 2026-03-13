/**
 * test_api.js — Teste do fluxo completo da API MotoRapido
 *
 * Pré-requisito: servidor rodando em http://localhost:3000
 *                banco com seed.js já executado
 *
 * Uso: node test_api.js
 */

const BASE = 'http://localhost:3000';

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label, detail = '') {
  passed++;
  console.log(`  ✅  ${label}${detail ? `  →  ${detail}` : ''}`);
}

function fail(label, reason = '') {
  failed++;
  console.error(`  ❌  ${label}${reason ? `  →  ${reason}` : ''}`);
}

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Testes ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n🏍️  MotoRapido — Teste de API\n');
  console.log(`   Servidor: ${BASE}\n`);

  let token  = null;
  let rideId = null;

  // ── 1. Health check ─────────────────────────────────────────────────────────
  console.log('── 1. Health check');
  try {
    const { status, data } = await req('GET', '/health');
    status === 200 && data.status === 'ok'
      ? ok('GET /health', JSON.stringify(data))
      : fail('GET /health', `status ${status}`);
  } catch (e) {
    fail('GET /health', e.message);
    console.error('\n   ⚠️  Servidor não está respondendo. Rode "npm run dev" antes de testar.\n');
    process.exit(1);
  }

  // ── 2. Login do motorista ────────────────────────────────────────────────────
  console.log('\n── 2. Login do motorista');
  try {
    const { status, data } = await req('POST', '/auth/login', {
      username: 'joao',
      password: '123456',
    });

    if (status === 200 && data.token) {
      token = data.token;
      ok('POST /auth/login', `driver: ${data.driver?.name}`);
    } else {
      fail('POST /auth/login', data.error ?? `status ${status}`);
    }
  } catch (e) {
    fail('POST /auth/login', e.message);
  }

  if (!token) {
    console.error('\n   ⚠️  Sem token — execute "node seed.js" primeiro.\n');
    process.exit(1);
  }

  // ── 3. Login com credenciais erradas ─────────────────────────────────────────
  console.log('\n── 3. Rejeição de credenciais inválidas');
  try {
    const { status } = await req('POST', '/auth/login', {
      username: 'joao',
      password: 'senha_errada',
    });
    status === 401
      ? ok('POST /auth/login (senha errada) → 401')
      : fail('POST /auth/login (senha errada)', `esperado 401, recebeu ${status}`);
  } catch (e) {
    fail('Login inválido', e.message);
  }

  // ── 4. Cliente solicita corrida ──────────────────────────────────────────────
  console.log('\n── 4. Cliente solicita corrida');
  try {
    const { status, data } = await req('POST', '/rides/request', {
      client_name: 'Maria Teste',
      client_lat:  -23.5505,
      client_lng:  -46.6333,
    });

    if (status === 201 && data.ride_id) {
      rideId = data.ride_id;
      ok('POST /rides/request', `ride_id: ${rideId}`);
    } else {
      fail('POST /rides/request', data.error ?? `status ${status}`);
    }
  } catch (e) {
    fail('POST /rides/request', e.message);
  }

  // ── 5. Polling: corrida com status "searching" ───────────────────────────────
  console.log('\n── 5. Status inicial da corrida');
  if (rideId) {
    try {
      const { status, data } = await req('GET', `/rides/${rideId}`);
      status === 200 && data.status === 'searching'
        ? ok(`GET /rides/${rideId}`, `status: ${data.status}`)
        : fail(`GET /rides/${rideId}`, `esperado status=searching, recebeu "${data.status}"`);
    } catch (e) {
      fail(`GET /rides/${rideId}`, e.message);
    }
  }

  // ── 6. Motorista aceita a corrida ────────────────────────────────────────────
  console.log('\n── 6. Motorista aceita a corrida');
  if (rideId && token) {
    try {
      const { status, data } = await req('POST', `/rides/${rideId}/accept`, null, token);
      status === 200 && data.status === 'accepted'
        ? ok(`POST /rides/${rideId}/accept`, `status: ${data.status}`)
        : fail(`POST /rides/${rideId}/accept`, data.error ?? `status ${status}`);
    } catch (e) {
      fail(`POST /rides/${rideId}/accept`, e.message);
    }
  }

  // ── 7. Motorista atualiza localização 3 vezes ────────────────────────────────
  console.log('\n── 7. Motorista atualiza localização (3×)');
  const locations = [
    { lat: -23.5490, lng: -46.6340 },
    { lat: -23.5478, lng: -46.6350 },
    { lat: -23.5465, lng: -46.6360 },
  ];

  for (let i = 0; i < locations.length; i++) {
    const { lat, lng } = locations[i];
    try {
      const { status } = await req(
        'POST', '/drivers/location', { lat, lng }, token
      );
      status === 200
        ? ok(`POST /drivers/location [${i + 1}/3]`, `lat: ${lat}, lng: ${lng}`)
        : fail(`POST /drivers/location [${i + 1}/3]`, `status ${status}`);
    } catch (e) {
      fail(`POST /drivers/location [${i + 1}/3]`, e.message);
    }
    await sleep(200);
  }

  // ── 8. Duplo accept (deve falhar — corrida não está mais "searching") ─────────
  console.log('\n── 8. Duplo accept → deve falhar');
  if (rideId && token) {
    try {
      const { status } = await req('POST', `/rides/${rideId}/accept`, null, token);
      status === 409
        ? ok('POST /rides/:id/accept duplicado → 409')
        : fail('POST /rides/:id/accept duplicado', `esperado 409, recebeu ${status}`);
    } catch (e) {
      fail('Duplo accept', e.message);
    }
  }

  // ── 9. Motorista conclui a corrida ───────────────────────────────────────────
  console.log('\n── 9. Motorista conclui a corrida');
  if (rideId && token) {
    try {
      const { status, data } = await req('POST', `/rides/${rideId}/complete`, null, token);
      status === 200 && data.status === 'completed'
        ? ok(`POST /rides/${rideId}/complete`, `status: ${data.status}`)
        : fail(`POST /rides/${rideId}/complete`, data.error ?? `status ${status}`);
    } catch (e) {
      fail(`POST /rides/${rideId}/complete`, e.message);
    }
  }

  // ── 10. Status final: completed ──────────────────────────────────────────────
  console.log('\n── 10. Status final da corrida');
  if (rideId) {
    try {
      const { status, data } = await req('GET', `/rides/${rideId}`);
      status === 200 && data.status === 'completed'
        ? ok(`GET /rides/${rideId}`, `status: ${data.status}`)
        : fail(`GET /rides/${rideId}`, `esperado completed, recebeu "${data.status}"`);
    } catch (e) {
      fail(`GET /rides/${rideId}`, e.message);
    }
  }

  // ── 11. Cancelar corrida inexistente ─────────────────────────────────────────
  console.log('\n── 11. Cancelar corrida inexistente → 404');
  try {
    const { status } = await req('POST', '/rides/999999/cancel');
    status === 404
      ? ok('POST /rides/999999/cancel → 404')
      : fail('POST /rides/999999/cancel', `esperado 404, recebeu ${status}`);
  } catch (e) {
    fail('Cancelar inexistente', e.message);
  }

  // ── 12. Rota protegida sem token → 401 ──────────────────────────────────────
  console.log('\n── 12. Rota protegida sem token → 401');
  try {
    const { status } = await req('POST', '/rides/1/accept');
    status === 401
      ? ok('POST /rides/1/accept sem token → 401')
      : fail('POST /rides/1/accept sem token', `esperado 401, recebeu ${status}`);
  } catch (e) {
    fail('Sem token', e.message);
  }

  // ── Resultado final ──────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log('\n' + '─'.repeat(48));
  console.log(`  Resultado: ${passed}/${total} testes passaram`);
  if (failed === 0) {
    console.log('  🎉 Todos os testes passaram!\n');
  } else {
    console.log(`  ⚠️  ${failed} teste(s) falharam.\n`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('\n❌ Erro inesperado:', err.message);
  process.exit(1);
});
