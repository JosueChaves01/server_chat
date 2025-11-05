const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

const clients = new Map(); // Mapa para almacenar clientes conectados con sus IDs

/**
 * Configura toda la lógica de señalización en una instancia del servidor WebSocket.
 * @param {WebSocket.Server} wss - La instancia del servidor WebSocket.
 */
function setupSignaling(wss) {
    wss.on('connection', ws => {
        const userId = uuidv4();
        clients.set(userId, ws);
        console.log(`Nuevo cliente conectado: ${userId}`);

        // Lógica de Heartbeat (Latido) para detectar conexiones inactivas
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        // Asignar el ID al cliente recién conectado
        ws.send(JSON.stringify({ type: 'assign-id', userId: userId }));

        // Notificar a todos los demás clientes que un nuevo usuario se ha unido
        clients.forEach((client, id) => {
            if (id !== userId && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'user-joined', userId }));
            }
        });

        // Enviar la lista de usuarios existentes al nuevo cliente
        const otherUserIds = Array.from(clients.keys()).filter(id => id !== userId);
        if (otherUserIds.length > 0) {
            ws.send(JSON.stringify({ type: 'existing-users', userIds: otherUserIds }));
        }

        ws.on('message', message => {
            try {
                const parsedMessage = JSON.parse(message);
                const targetClient = clients.get(parsedMessage.userId);

                if (targetClient && targetClient.readyState === WebSocket.OPEN) {
                    // Añadir el ID del remitente al mensaje antes de reenviarlo
                    const messageToSend = { ...parsedMessage, fromUserId: userId };
                    targetClient.send(JSON.stringify(messageToSend));
                }
            } catch (error) {
                console.error(`Fallo al parsear mensaje o formato inválido de ${userId}:`, message.toString(), error);
            }
        });

        ws.on('close', () => {
            clients.delete(userId);
            console.log(`Cliente desconectado: ${userId}`);
            // Notificar a todos los demás clientes que un usuario se ha ido
            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'user-left', userId }));
                }
            });
        });
    });

    // Intervalo para el Heartbeat que limpia conexiones inactivas
    const interval = setInterval(() => {
        wss.clients.forEach(ws => {
            if (ws.isAlive === false) {
                return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000); // Se ejecuta cada 30 segundos

    wss.on('close', () => {
        clearInterval(interval);
    });
}

module.exports = { setupSignaling };