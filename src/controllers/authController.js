const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

async function register(req, res) {
  const { name, phone, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, phone, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, phone, role',
      [name, phone, hash, role || 'client']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Telefone já cadastrado' });
    res.status(500).json({ error: 'Erro interno' });
  }
}

async function login(req, res) {
  const { phone, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Senha incorreta' });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
}

module.exports = { register, login };
