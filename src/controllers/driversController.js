const pool = require('../db/connection');

async function getActiveDrivers(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, name, username, vehicle_model, vehicle_plate,
              online, current_lat, current_lng, rating, rides_count
         FROM drivers
        WHERE online = true`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar motoristas' });
  }
}

async function updateLocation(req, res) {
  const { lat, lng } = req.body;
  const driver_id = req.driver.id;
  try {
    await pool.query(
      'UPDATE drivers SET current_lat=$1, current_lng=$2 WHERE id=$3',
      [lat, lng, driver_id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar localização' });
  }
}

async function toggleAvailability(req, res) {
  const { online } = req.body;
  const driver_id = req.driver.id;
  try {
    await pool.query('UPDATE drivers SET online=$1 WHERE id=$2', [online, driver_id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alterar disponibilidade' });
  }
}

module.exports = { getActiveDrivers, updateLocation, toggleAvailability };
