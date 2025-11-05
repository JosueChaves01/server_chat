require('dotenv').config();

const WebSocket = require('ws');
const { createHttpServer } = require('./httpServer');
const { setupSignaling } = require('./signaling');

// Environment variables
const PORT = process.env.PORT || 8000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// 1. Crear el servidor WebSocket
const wss = new WebSocket.Server({ noServer: true });

// 2. Crear el servidor HTTP y pasarle la instancia de WSS para el endpoint de estado
const server = createHttpServer(wss);

// 3. Conectar el servidor HTTP con el servidor WebSocket
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// 4. Configurar toda la lógica de señalización en la instancia de WSS
setupSignaling(wss);

// 5. Iniciar el servidor
server.listen(PORT, () => {
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Server running on port ${PORT}`);
});
