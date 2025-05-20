const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8080 });

const rooms = new Map();

console.log('WebSocket server started on port 8080');

server.on('connection', (ws) => {
    console.log('New client connected');
    let roomId = '';

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received:', data.type, 'for room:', data.roomId);
            
            switch(data.type) {
                case 'join':
                    roomId = data.roomId;
                    if (!rooms.has(roomId)) {
                        rooms.set(roomId, {
                            clients: new Set(),
                            offer: null,
                            sender: null
                        });
                        console.log(`Created new room: ${roomId}`);
                    }
                    
                    const room = rooms.get(roomId);
                    room.clients.add(ws);
                    
                    if (data.isCreator) {
                        room.sender = ws;
                        console.log(`Sender joined room ${roomId}`);
                    } else if (room.offer) {
                        // Send stored offer to new receiver immediately
                        ws.send(JSON.stringify({
                            type: 'offer',
                            offer: room.offer,
                            roomId: roomId
                        }));
                        console.log(`Sent stored offer to receiver in room ${roomId}`);
                    }
                    
                    ws.send(JSON.stringify({
                        type: 'joined',
                        roomId: roomId,
                        isCreator: data.isCreator || false
                    }));
                    
                    console.log(`Client ${data.isCreator ? 'created' : 'joined'} room ${roomId}. Total clients: ${room.clients.size}`);
                    break;
                    
                case 'offer':
                    if (rooms.has(roomId)) {
                        const room = rooms.get(roomId);
                        room.offer = data.offer;  // Store the offer
                        
                        // Broadcast to receivers only
                        room.clients.forEach(client => {
                            if (client !== room.sender && client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({
                                    type: 'offer',
                                    offer: data.offer,
                                    roomId: roomId
                                }));
                            }
                        });
                        console.log(`Broadcasted offer in room ${roomId}`);
                    }
                    break;
                    
                case 'answer':
                    if (rooms.has(roomId)) {
                        const room = rooms.get(roomId);
                        // Send answer only to sender
                        if (room.sender && room.sender.readyState === WebSocket.OPEN) {
                            room.sender.send(JSON.stringify({
                                type: 'answer',
                                answer: data.answer,
                                roomId: roomId
                            }));
                            console.log(`Sent answer to sender in room ${roomId}`);
                        }
                    }
                    break;
                    
                case 'ice-candidate':
                    if (rooms.has(roomId)) {
                        const room = rooms.get(roomId);
                        // Broadcast ICE candidates to appropriate peer
                        room.clients.forEach(client => {
                            if (client !== ws && client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({
                                    type: 'ice-candidate',
                                    candidate: data.candidate,
                                    roomId: roomId
                                }));
                            }
                        });
                    }
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
        
        // Log current room status
        console.log('Current rooms:', Array.from(rooms.keys()));
        rooms.forEach((clients, room) => {
            console.log(`Room ${room}: ${clients.size} clients`);
        });
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            room.clients.delete(ws);
            if (ws === room.sender) {
                room.sender = null;
                room.offer = null;
            }
            console.log(`Client left room ${roomId}. Remaining clients: ${room.clients.size}`);
            if (room.clients.size === 0) {
                rooms.delete(roomId);
                console.log(`Room ${roomId} deleted (empty)`);
            }
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Handle server errors
server.on('error', (error) => {
    console.error('Server error:', error);
});

// Log shutdown
process.on('SIGINT', () => {
    console.log('Shutting down WebSocket server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
