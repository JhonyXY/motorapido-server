const router       = require('express').Router();
const authMiddleware = require('../middlewares/auth');
const pool         = require('../db/connection');
const { getIO, driverSockets, clientSockets } = require('../services/socketService');

// Timeouts de corridas sem aceite
const rideTimeouts = new Map();

// Distância em km entre dois pontos (Haversine)
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── POST /rides/request ───────────────────────────────────────────────────────
// Público (sem auth). Cria a corrida e notifica motoristas online.
router.post('/request', async (req, res) => {
  const { client_name, client_lat, client_lng } = req.body;

  if (!client_name || client_lat == null || client_lng == null) {
    return res.status(400).json({ error: 'client_name, client_lat e client_lng são obrigatórios' });
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO rides (client_name, client_lat, client_lng) VALUES ($1, $2, $3) RETURNING id',
      [client_name, client_lat, client_lng]
    );
    const ride_id = rows[0].id;

    // Motoristas online sem corrida ativa e suas posições
    const { rows: busy } = await pool.query(
      `SELECT driver_id FROM rides WHERE status = 'accepted'`
    );
    const busyIds = new Set(busy.map(r => r.driver_id));

    const { rows: driversPos } = await pool.query(
      `SELECT id, current_lat, current_lng FROM drivers WHERE online = true`
    );

    const RADIUS_KM = 5;
    const TIMEOUT_MS = 30000;

    // Filtra por raio e ordena por proximidade
    const nearby = driversPos
      .filter(d => !busyIds.has(d.id) && driverSockets.has(d.id) && d.current_lat && d.current_lng)
      .map(d => ({ ...d, dist: distanceKm(client_lat, client_lng, parseFloat(d.current_lat), parseFloat(d.current_lng)) }))
      .filter(d => d.dist <= RADIUS_KM)
      .sort((a, b) => a.dist - b.dist);

    // Fallback: envia para todos disponíveis se nenhum estiver no raio
    const targets = nearby.length > 0
      ? nearby
      : driversPos.filter(d => !busyIds.has(d.id) && driverSockets.has(d.id));

    for (const d of targets) {
      const sId = driverSockets.get(d.id);
      if (sId) getIO().to(sId).emit('new_ride', { ride_id, client_name, client_lat, client_lng });
    }

    // Timeout: cancela automaticamente se ninguém aceitar em 30s
    const timeout = setTimeout(async () => {
      try {
        const { rows } = await pool.query(
          `UPDATE rides SET status = 'cancelled' WHERE id = $1 AND status = 'searching' RETURNING id`,
          [ride_id]
        );
        if (rows[0]) {
          const clientSocketId = clientSockets.get(ride_id);
          if (clientSocketId) getIO().to(clientSocketId).emit('no_drivers', { ride_id });
          // Avisa motoristas para fechar o card
          for (const [, sId] of driverSockets.entries()) {
            getIO().to(sId).emit('ride_taken', { ride_id });
          }
        }
      } catch (e) { console.error('Timeout cancel error:', e); }
      rideTimeouts.delete(ride_id);
    }, TIMEOUT_MS);

    rideTimeouts.set(ride_id, timeout);

    res.status(201).json({ ride_id });
  } catch (err) {
    console.error('Erro ao criar corrida:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── POST /rides/:id/accept ────────────────────────────────────────────────────
// Motorista aceita a corrida. Requer JWT.
router.post('/:id/accept', authMiddleware, async (req, res) => {
  const ride_id   = parseInt(req.params.id);
  const driver_id = req.driver.id;

  // Cancela o timeout de busca
  const t = rideTimeouts.get(ride_id);
  if (t) { clearTimeout(t); rideTimeouts.delete(ride_id); }

  try {
    const { rows } = await pool.query(
      `UPDATE rides
          SET status = 'accepted', driver_id = $1, accepted_at = NOW(),
              driver_start_lat = (SELECT current_lat FROM drivers WHERE id = $1),
              driver_start_lng = (SELECT current_lng FROM drivers WHERE id = $1)
        WHERE id = $2 AND status = 'searching'
        RETURNING *`,
      [driver_id, ride_id]
    );

    if (!rows[0]) {
      return res.status(409).json({ error: 'Corrida não está disponível para aceite' });
    }

    // Avisa o cliente com os dados do motorista
    const clientSocketId = clientSockets.get(ride_id);
    if (clientSocketId) {
      const { rows: driverRows } = await pool.query(
        'SELECT id, name, vehicle_model, vehicle_plate, rating, current_lat, current_lng FROM drivers WHERE id = $1',
        [driver_id]
      );
      getIO().to(clientSocketId).emit('ride_accepted', {
        ...rows[0],
        name: driverRows[0]?.name,
        vehicle_model: driverRows[0]?.vehicle_model,
        vehicle_plate: driverRows[0]?.vehicle_plate,
        rating: driverRows[0]?.rating,
        current_lat: driverRows[0]?.current_lat,
        current_lng: driverRows[0]?.current_lng,
      });
    }

    // Notifica todos os outros motoristas para dispensar o card desta corrida
    for (const [dId, sId] of driverSockets.entries()) {
      if (dId !== driver_id) {
        getIO().to(sId).emit('ride_taken', { ride_id });
      }
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao aceitar corrida:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── POST /rides/:id/complete ──────────────────────────────────────────────────
// Motorista conclui a corrida. Requer JWT.
router.post('/:id/complete', authMiddleware, async (req, res) => {
  const ride_id   = parseInt(req.params.id);
  const driver_id = req.driver.id;

  try {
    const { rows } = await pool.query(
      `UPDATE rides
          SET status = 'completed', completed_at = NOW(),
              driver_end_lat = (SELECT current_lat FROM drivers WHERE id = $2),
              driver_end_lng = (SELECT current_lng FROM drivers WHERE id = $2)
        WHERE id = $1 AND driver_id = $2 AND status NOT IN ('completed', 'cancelled')
        RETURNING *`,
      [ride_id, driver_id]
    );

    if (!rows[0]) {
      return res.status(409).json({ error: 'Corrida não encontrada ou já finalizada' });
    }

    // Incrementa contador do motorista
    await pool.query(
      'UPDATE drivers SET rides_count = rides_count + 1 WHERE id = $1',
      [driver_id]
    );

    // Avisa o cliente
    const clientSocketId = clientSockets.get(ride_id);
    if (clientSocketId) {
      getIO().to(clientSocketId).emit('ride_completed', { ride_id });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao concluir corrida:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── POST /rides/:id/cancel ────────────────────────────────────────────────────
// Público. Cancela corrida e notifica ambos os lados.
router.post('/:id/cancel', async (req, res) => {
  const ride_id = parseInt(req.params.id);

  const t = rideTimeouts.get(ride_id);
  if (t) { clearTimeout(t); rideTimeouts.delete(ride_id); }

  try {
    const { rows } = await pool.query(
      `UPDATE rides
          SET status = 'cancelled'
        WHERE id = $1 AND status NOT IN ('completed', 'cancelled')
        RETURNING *`,
      [ride_id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Corrida não encontrada ou já finalizada' });
    }

    const io      = getIO();
    const payload = { ride_id };

    // Notifica cliente
    const clientSocketId = clientSockets.get(ride_id);
    if (clientSocketId) io.to(clientSocketId).emit('ride_cancelled', payload);

    // Notifica motorista atribuído (se já havia aceitado)
    const driver_id = rows[0].driver_id;
    if (driver_id) {
      const driverSocketId = driverSockets.get(driver_id);
      if (driverSocketId) io.to(driverSocketId).emit('ride_cancelled', payload);
    }

    // Notifica TODOS os motoristas online para fechar o bottomsheet desta corrida
    for (const [, sId] of driverSockets.entries()) {
      io.to(sId).emit('ride_taken', payload);
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao cancelar corrida:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── GET /rides/:id ────────────────────────────────────────────────────────────
// Polling de backup: retorna estado atual da corrida + dados do motorista.
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*,
              d.name AS driver_name, d.vehicle_model, d.vehicle_plate, d.rating,
              d.current_lat, d.current_lng
         FROM rides r
    LEFT JOIN drivers d ON d.id = r.driver_id
        WHERE r.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Corrida não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao buscar corrida:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── GET /rides/:id/messages ───────────────────────────────────────────────────
// Retorna o histórico de mensagens de uma corrida.
router.get('/:id/messages', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.id, m.sender, m.text, m.sent_at,
              r.client_name,
              d.name AS driver_name
         FROM messages m
         JOIN rides   r ON r.id = m.ride_id
    LEFT JOIN drivers d ON d.id = r.driver_id
        WHERE m.ride_id = $1
        ORDER BY m.sent_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Erro ao buscar mensagens:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── GET /drivers/:driverId/history ────────────────────────────────────────────
// Histórico de corridas do motorista com percurso e mensagens.
router.get('/driver/:driverId/history', authMiddleware, async (req, res) => {
  try {
    const { rows: rides } = await pool.query(
      `SELECT r.id, r.client_name, r.status,
              r.client_lat, r.client_lng,
              r.driver_start_lat, r.driver_start_lng,
              r.driver_end_lat,   r.driver_end_lng,
              r.requested_at, r.accepted_at, r.completed_at
         FROM rides r
        WHERE r.driver_id = $1 AND r.status = 'completed'
        ORDER BY r.completed_at DESC`,
      [req.params.driverId]
    );

    // Para cada corrida, busca as mensagens
    const history = await Promise.all(rides.map(async (ride) => {
      const { rows: msgs } = await pool.query(
        `SELECT sender, text, sent_at FROM messages WHERE ride_id = $1 ORDER BY sent_at ASC`,
        [ride.id]
      );
      return { ...ride, messages: msgs };
    }));

    res.json(history);
  } catch (err) {
    console.error('Erro ao buscar histórico:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
