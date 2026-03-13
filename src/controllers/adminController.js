const pool = require('../db');
const jwt = require('jsonwebtoken');

async function adminLogin(req, res) {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Senha incorreta' });
  }
  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ token });
}

async function getStats(req, res) {
  try {
    const [users, drivers, rides] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users WHERE role = $1', ['client']),
      pool.query('SELECT COUNT(*) FROM drivers'),
      pool.query('SELECT COUNT(*) FROM rides'),
    ]);
    res.json({
      total_clients: users.rows[0].count,
      total_drivers: drivers.rows[0].count,
      total_rides: rides.rows[0].count,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
}

module.exports = { adminLogin, getStats };
