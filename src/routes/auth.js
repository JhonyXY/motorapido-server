const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/connection');

// POST /auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username e password são obrigatórios' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM drivers WHERE username = $1',
      [username]
    );

    const driver = result.rows[0];
    if (!driver) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const passwordMatch = await bcrypt.compare(password, driver.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { id: driver.id, name: driver.name, username: driver.username },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      driver: {
        id:            driver.id,
        name:          driver.name,
        username:      driver.username,
        vehicle_model: driver.vehicle_model,
        vehicle_plate: driver.vehicle_plate,
        rating:        driver.rating,
        rides_count:   driver.rides_count,
      },
    });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
