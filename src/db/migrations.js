const pool = require('./connection');

async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drivers (
      id              SERIAL PRIMARY KEY,
      name            VARCHAR(100)  NOT NULL,
      username        VARCHAR(50)   UNIQUE NOT NULL,
      password_hash   VARCHAR(255)  NOT NULL,
      vehicle_model   VARCHAR(100),
      vehicle_plate   VARCHAR(20),
      online          BOOLEAN       DEFAULT false,
      current_lat     DECIMAL(10,8),
      current_lng     DECIMAL(11,8),
      rating          DECIMAL(3,2)  DEFAULT 5.0,
      rides_count     INTEGER       DEFAULT 0,
      created_at      TIMESTAMP     DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rides (
      id            SERIAL PRIMARY KEY,
      client_name   VARCHAR(100)  NOT NULL,
      client_lat    DECIMAL(10,8) NOT NULL,
      client_lng    DECIMAL(11,8) NOT NULL,
      driver_id     INTEGER       REFERENCES drivers(id),
      status        VARCHAR(20)   DEFAULT 'searching',
      requested_at  TIMESTAMP     DEFAULT NOW(),
      accepted_at   TIMESTAMP,
      completed_at  TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id       SERIAL PRIMARY KEY,
      ride_id  INTEGER    REFERENCES rides(id),
      sender   VARCHAR(10) NOT NULL,
      text     TEXT        NOT NULL,
      sent_at  TIMESTAMP   DEFAULT NOW()
    );
  `);

  // Colunas adicionadas posteriormente (idempotente)
  await pool.query(`
    ALTER TABLE rides
      ADD COLUMN IF NOT EXISTS driver_start_lat  DECIMAL(10,8),
      ADD COLUMN IF NOT EXISTS driver_start_lng  DECIMAL(11,8),
      ADD COLUMN IF NOT EXISTS driver_end_lat    DECIMAL(10,8),
      ADD COLUMN IF NOT EXISTS driver_end_lng    DECIMAL(11,8);
  `);

  console.log('✔ Migrations executadas com sucesso.');
}

module.exports = runMigrations;
