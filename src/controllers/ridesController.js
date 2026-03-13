const pool = require('../db');

async function requestRide(req, res) {
  const { origin_lat, origin_lng, dest_lat, dest_lng, origin_address, dest_address } = req.body;
  const client_id = req.user.id;
  try {
    const result = await pool.query(
      `INSERT INTO rides (client_id, origin_lat, origin_lng, dest_lat, dest_lng, origin_address, dest_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [client_id, origin_lat, origin_lng, dest_lat, dest_lng, origin_address, dest_address]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao solicitar corrida' });
  }
}

async function getRides(req, res) {
  try {
    const result = await pool.query('SELECT * FROM rides ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar corridas' });
  }
}

async function updateRideStatus(req, res) {
  const { id } = req.params;
  const { status, driver_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE rides SET status=$1, driver_id=$2, finished_at=CASE WHEN $1='finished' THEN NOW() ELSE NULL END WHERE id=$3 RETURNING *`,
      [status, driver_id, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar corrida' });
  }
}

module.exports = { requestRide, getRides, updateRideStatus };
