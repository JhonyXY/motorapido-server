// Serviço de notificações (extensível para push notifications, SMS, etc.)

function notifyDriver(io, driverId, event, payload) {
  io.emit(`driver:${driverId}:${event}`, payload);
}

function notifyClient(io, clientId, event, payload) {
  io.emit(`client:${clientId}:${event}`, payload);
}

module.exports = { notifyDriver, notifyClient };
