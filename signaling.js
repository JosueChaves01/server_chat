const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

const clients = new Map(); // Mapa para almacenar clientes: userId -> { ws, username }

/**
 * Configura toda la lógica de señalización en una instancia del servidor WebSocket.
 * @param {WebSocket.Server} wss - La instancia del servidor WebSocket.
 */
function setupSignaling(wss) {
    wss.on('connection', ws => {
        const userId = uuidv4();
        const username = `user-${userId.substring(0, 4)}`; // Nombre de usuario por defecto
        clients.set(userId, { ws, username });
        console.log(`Nuevo cliente conectado: ${userId} como ${username}`);

        // Lógica de Heartbeat (Latido) para detectar conexiones inactivas
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        // Asignar el ID y el username inicial al cliente recién conectado
        ws.send(JSON.stringify({ type: 'assign-id', userId: userId, username: username }));

        // Notificar a todos los demás clientes que un nuevo usuario se ha unido
        clients.forEach((clientData, id) => {
            if (id !== userId && clientData.ws.readyState === WebSocket.OPEN) {
                clientData.ws.send(JSON.stringify({ type: 'user-joined', userId, username }));
            }
        });

        // Enviar la lista de usuarios existentes al nuevo cliente
        const existingUsers = Array.from(clients.entries())
            .filter(([id]) => id !== userId)
            .map(([id, data]) => ({ userId: id, username: data.username }));

        if (existingUsers.length > 0) {
            ws.send(JSON.stringify({ type: 'existing-users', users: existingUsers }));
        }

        ws.on('message', message => {
            try {
                const parsedMessage = JSON.parse(message);

                const senderData = clients.get(userId);

                switch (parsedMessage.type) {
                    case 'chat-message':
                        // Difundir mensaje de chat a todos
                        clients.forEach((clientData, id) => {
                            if (id !== userId && clientData.ws.readyState === WebSocket.OPEN) {
                                const messageToSend = {
                                    type: 'chat-message',
                                    content: parsedMessage.content,
                                    fromUserId: userId,
                                    fromUsername: senderData.username
                                };
                                clientData.ws.send(JSON.stringify(messageToSend));
                            }
                        });
                        break;

                    case 'set-username':
                        // Actualizar username y notificar a todos
                        const newUsername = parsedMessage.username;
                        senderData.username = newUsername;
                        console.log(`Usuario ${userId} actualizó su nombre a: ${newUsername}`);
                        clients.forEach((clientData, id) => {
                            if (clientData.ws.readyState === WebSocket.OPEN) {
                                clientData.ws.send(JSON.stringify({ type: 'user-updated', userId, username: newUsername }));
                            }
                        });
                        break;

                    default:
                        // Lógica de señalización WebRTC (a un solo destinatario)
                        const targetClient = clients.get(parsedMessage.userId);
                        if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
                            const messageToSend = { ...parsedMessage, fromUserId: userId };
                            targetClient.ws.send(JSON.stringify(messageToSend));
                        }
                        break;
                }
            } catch (error) {
                console.error(`Fallo al parsear mensaje o formato inválido de ${userId}:`, message.toString(), error);
            }
        });

        ws.on('close', () => {
            clients.delete(userId);
            console.log(`Cliente desconectado: ${userId}`);
            // Notificar a todos los demás clientes que un usuario se ha ido
            clients.forEach(clientData => {
                if (clientData.ws.readyState === WebSocket.OPEN) {
                    clientData.ws.send(JSON.stringify({ type: 'user-left', userId }));
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