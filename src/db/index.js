const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no cliente do banco de dados', err);
  process.exit(-1);
});

module.exports = pool;
