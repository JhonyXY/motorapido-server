const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const pool    = require('../db/connection');

// ── Middleware de autenticação admin ──────────────────────────────────────────
function adminAuth(req, res, next) {
  if (req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Senha admin inválida' });
  }
  next();
}

// ── GET /admin/drivers ────────────────────────────────────────────────────────
router.get('/drivers', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, username, vehicle_model, vehicle_plate,
              online, rating, rides_count
         FROM drivers
        ORDER BY id`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── POST /admin/drivers ───────────────────────────────────────────────────────
router.post('/drivers', adminAuth, async (req, res) => {
  const { name, username, password, vehicle_model, vehicle_plate } = req.body;

  if (!name || !username || !password) {
    return res.status(400).json({ error: 'name, username e password são obrigatórios' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO drivers (name, username, password_hash, vehicle_model, vehicle_plate)
            VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, username, vehicle_model, vehicle_plate, online, rating, rides_count`,
      [name, username, hash, vehicle_model, vehicle_plate]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username já existe' });
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── PUT /admin/drivers/:id ────────────────────────────────────────────────────
router.put('/drivers/:id', adminAuth, async (req, res) => {
  const { name, vehicle_model, vehicle_plate, password } = req.body;
  const { id } = req.params;

  try {
    let query, params;

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      query  = `UPDATE drivers
                   SET name = $1, vehicle_model = $2, vehicle_plate = $3, password_hash = $4
                 WHERE id = $5
             RETURNING id, name, username, vehicle_model, vehicle_plate, online, rating, rides_count`;
      params = [name, vehicle_model, vehicle_plate, hash, id];
    } else {
      query  = `UPDATE drivers
                   SET name = $1, vehicle_model = $2, vehicle_plate = $3
                 WHERE id = $4
             RETURNING id, name, username, vehicle_model, vehicle_plate, online, rating, rides_count`;
      params = [name, vehicle_model, vehicle_plate, id];
    }

    const { rows } = await pool.query(query, params);
    if (!rows[0]) return res.status(404).json({ error: 'Motorista não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── DELETE /admin/drivers/:id ─────────────────────────────────────────────────
router.delete('/drivers/:id', adminAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM drivers WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Motorista não encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── GET /admin/rides ──────────────────────────────────────────────────────────
router.get('/rides', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.client_name, r.status,
              r.requested_at, r.accepted_at, r.completed_at,
              d.name AS driver_name
         FROM rides r
         LEFT JOIN drivers d ON d.id = r.driver_id
        ORDER BY r.requested_at DESC
        LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
