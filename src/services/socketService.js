const jwt  = require('jsonwebtoken');
const pool = require('../db/connection');

// Maps em memória: persistem enquanto o servidor estiver rodando
const driverSockets = new Map(); // driver_id (int) → socket.id
const clientSockets = new Map(); // ride_id   (int) → socket.id

let _io = null;

function getIO() {
  return _io;
}

function init(io) {
  _io = io;

  io.on('connection', (socket) => {

    // ── MOTORISTA ──────────────────────────────────────────────────────────

    // Autenticação e registro do socket do motorista
    socket.on('driver_connect', async ({ driver_id, token }) => {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.id !== driver_id) return;

        // Desconecta sessão anterior do mesmo motorista (previne dupla sessão)
        const existingSocketId = driverSockets.get(driver_id);
        if (existingSocketId && existingSocketId !== socket.id) {
          const existingSocket = io.sockets.sockets.get(existingSocketId);
          if (existingSocket) {
            existingSocket.emit('session_replaced', {});
            existingSocket.disconnect(true);
          }
        }

        driverSockets.set(driver_id, socket.id);
        await pool.query('UPDATE drivers SET online = true WHERE id = $1', [driver_id]);
        console.log(`Motorista ${driver_id} online (socket: ${socket.id})`);

        // Cancela corridas 'accepted' onde o cliente já desconectou (corridas travadas)
        const { rows: stuck } = await pool.query(
          `SELECT id FROM rides WHERE driver_id = $1 AND status = 'accepted'`,
          [driver_id]
        );
        for (const ride of stuck) {
          if (!clientSockets.has(ride.id)) {
            await pool.query(
              `UPDATE rides SET status = 'cancelled' WHERE id = $1`, [ride.id]
            );
            console.log(`Corrida ${ride.id} liberada (cliente desconectou)`);
            socket.emit('ride_cancelled', { ride_id: ride.id });
          }
        }

        // Envia apenas a corrida mais recente em espera (se houver)
        const { rows: pending } = await pool.query(
          `SELECT id, client_name, client_lat, client_lng FROM rides
            WHERE status = 'searching'
            ORDER BY requested_at DESC LIMIT 1`
        );
        if (pending[0]) {
          socket.emit('new_ride', {
            ride_id: pending[0].id,
            client_name: pending[0].client_name,
            client_lat: parseFloat(pending[0].client_lat),
            client_lng: parseFloat(pending[0].client_lng),
          });
        }
      } catch {
        // token inválido: ignora silenciosamente
      }
    });

    // Motorista envia localização durante uma corrida
    socket.on('driver_location', async ({ ride_id, lat, lng }) => {
      // Descobre qual driver está neste socket
      const entry = [...driverSockets.entries()].find(([, sid]) => sid === socket.id);
      if (!entry) return;
      const [driver_id] = entry;

      // Persiste no banco
      await pool.query(
        'UPDATE drivers SET current_lat = $1, current_lng = $2 WHERE id = $3',
        [lat, lng, driver_id]
      );

      // Encaminha para o cliente que está acompanhando esta corrida
      const clientSocketId = clientSockets.get(parseInt(ride_id));
      if (clientSocketId) {
        io.to(clientSocketId).emit('driver_moved', { ride_id, lat, lng });
      }
    });

    // Desconexão do motorista
    socket.on('disconnect', async () => {
      const entry = [...driverSockets.entries()].find(([, sid]) => sid === socket.id);
      if (entry) {
        const [driver_id] = entry;
        driverSockets.delete(driver_id);
        try {
          await pool.query('UPDATE drivers SET online = false WHERE id = $1', [driver_id]);
        } catch { /* não bloqueia o disconnect */ }
        console.log(`Motorista ${driver_id} offline`);
      }

      // Limpa eventuais watches de cliente deste socket
      for (const [ride_id, sid] of clientSockets.entries()) {
        if (sid === socket.id) clientSockets.delete(ride_id);
      }
    });

    // ── CLIENTE ────────────────────────────────────────────────────────────

    // Cliente começa a acompanhar uma corrida
    socket.on('client_watch', ({ ride_id }) => {
      clientSockets.set(parseInt(ride_id), socket.id);
      console.log(`Cliente assistindo corrida ${ride_id} (socket: ${socket.id})`);
    });

    // ── CLIENTE envia localização ─────────────────────────────────────────

    socket.on('client_location', async ({ ride_id, lat, lng }) => {
      // Descobre o motorista da corrida e encaminha a posição
      const { rows } = await pool.query(
        'SELECT driver_id FROM rides WHERE id = $1 AND status = $2',
        [ride_id, 'accepted']
      );
      const driver_id = rows[0]?.driver_id;
      if (driver_id) {
        const driverSocketId = driverSockets.get(driver_id);
        if (driverSocketId) {
          io.to(driverSocketId).emit('client_moved', { ride_id, lat, lng });
        }
      }
    });

    // ── CHAT ───────────────────────────────────────────────────────────────

    socket.on('send_message', async ({ ride_id, sender, text }) => {
      try {
        // Persiste mensagem
        await pool.query(
          'INSERT INTO messages (ride_id, sender, text) VALUES ($1, $2, $3)',
          [ride_id, sender, text]
        );

        const payload = { ride_id, sender, text, sent_at: new Date() };

        if (sender === 'client') {
          // Envia para o motorista da corrida
          const { rows } = await pool.query(
            'SELECT driver_id FROM rides WHERE id = $1', [ride_id]
          );
          const driver_id = rows[0]?.driver_id;
          if (driver_id) {
            const driverSocketId = driverSockets.get(driver_id);
            if (driverSocketId) io.to(driverSocketId).emit('new_message', payload);
          }
        } else {
          // Envia para o cliente que acompanha a corrida
          const clientSocketId = clientSockets.get(parseInt(ride_id));
          if (clientSocketId) io.to(clientSocketId).emit('new_message', payload);
        }
      } catch (err) {
        console.error('Erro ao salvar mensagem:', err);
      }
    });
  });
}

module.exports = { init, getIO, driverSockets, clientSockets };
