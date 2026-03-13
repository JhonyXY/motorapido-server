require('dotenv').config();
const express = require('express');
const http    = require('http');
const cors    = require('cors');
const path    = require('path');
const { Server } = require('socket.io');

const runMigrations = require('./db/migrations');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*' },
});

app.use(cors());
app.use(express.json());

// Arquivos estáticos (public/)
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Painel admin — deve vir ANTES do app.use('/admin', router)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Rotas da API
app.use('/auth',    require('./routes/auth'));
app.use('/rides',   require('./routes/rides'));
app.use('/drivers', require('./routes/drivers'));
app.use('/admin',   require('./routes/admin'));

// Socket.IO — inicializado antes das rotas usarem getIO()
require('./services/socketService').init(io);

const PORT = process.env.PORT || 3000;

runMigrations()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Falha ao executar migrations:', err);
    process.exit(1);
  });
