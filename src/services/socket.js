module.exports = function initSocket(io) {
  io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    // Motorista envia localização em tempo real
    socket.on('driver:location', (data) => {
      io.emit('driver:location:update', data);
    });

    // Cliente solicita corrida
    socket.on('ride:request', (data) => {
      io.emit('ride:new', data);
    });

    // Motorista aceita corrida
    socket.on('ride:accept', (data) => {
      io.to(data.clientSocketId).emit('ride:accepted', data);
    });

    // Atualização de status da corrida
    socket.on('ride:status', (data) => {
      io.emit('ride:status:update', data);
    });

    socket.on('disconnect', () => {
      console.log('Cliente desconectado:', socket.id);
    });
  });
};
