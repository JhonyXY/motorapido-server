require('dotenv').config();
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const username = 'joao';
  const password = '123456';

  const hash = await bcrypt.hash(password, 10);

  // Garante que a tabela exista antes de inserir
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drivers (
      id            SERIAL PRIMARY KEY,
      name          VARCHAR(100)  NOT NULL,
      username      VARCHAR(50)   UNIQUE NOT NULL,
      password_hash VARCHAR(255)  NOT NULL,
      vehicle_model VARCHAR(100),
      vehicle_plate VARCHAR(20),
      online        BOOLEAN       DEFAULT false,
      current_lat   DECIMAL(10,8),
      current_lng   DECIMAL(11,8),
      rating        DECIMAL(3,2)  DEFAULT 5.0,
      rides_count   INTEGER       DEFAULT 0,
      created_at    TIMESTAMP     DEFAULT NOW()
    );
  `);

  // Upsert: recria se já existir (útil para rodar seed mais de uma vez)
  await pool.query(
    `INSERT INTO drivers (name, username, password_hash, vehicle_model, vehicle_plate)
          VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (username) DO UPDATE
           SET password_hash  = EXCLUDED.password_hash,
               name           = EXCLUDED.name,
               vehicle_model  = EXCLUDED.vehicle_model,
               vehicle_plate  = EXCLUDED.vehicle_plate`,
    ['João Silva', username, hash, 'Honda CG 160', 'ABC-1234']
  );

  console.log('\n✅ Motorista criado com sucesso!');
  console.log('   Usuário:', username);
  console.log('   Senha:  ', password);
  console.log('   Use esses dados para testar o login no app.\n');

  await pool.end();
}

seed().catch((err) => {
  console.error('❌ Erro ao rodar seed:', err.message);
  process.exit(1);
});
