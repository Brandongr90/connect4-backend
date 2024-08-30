const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const players = {};// Crea una lista de jugadores
const server = http.createServer(app);
const io = new Server(server, {//Crea el servidor
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

const rooms = new Map();// Crea una nueva lista de salas

io.on('connection', (socket) => {//Escucha la conección
    console.log('New client connected:', socket.id);// Imprime el cliente conectado

    socket.on('newPlayer', (nickname) => {//Escuha el evento newPlayer y le envia el nickname
        players[socket.id] = nickname;//
        io.emit('playerList', Object.values(players));//Emitir lista de jugadores conectados
    });

    socket.on('disconnect', () => {//Escucha el evento disconnect y lo elimina
        delete players[socket.id];// Elimina el jugador de la lista
        io.emit('playerList', Object.values(players)); // Emitir lista de jugadores conectados
    });

    socket.on('createRoom', (roomName, playerName) => {//Escucha el evento createRoom
        console.log('Attempt to create room:', roomName, 'by player:', playerName);// Imprime la creación de la sala
        if (!rooms.has(roomName)) {// Verifica si la sala ya existe
            rooms.set(roomName, {// Crea una nueva sala
                players: [{ id: socket.id, name: playerName }],// Agrega el jugador a la sala
                spectators: [],// Agrega los espectadores a la sala
                game: createNewGame()// Crea el juego
            });
            socket.join(roomName);// Agrega el cliente a la sala
            io.to(roomName).emit('roomUpdate', getRoomData(roomName));// Emitir actualización de la sala
            io.emit('roomList', Array.from(rooms.keys()));// Emitir lista de salas

            socket.emit('roomCreated', roomName);// Imprime la creación de la sala

            console.log('Room created:', roomName);
        } else {
            socket.emit('error', 'Room already exists');
            console.log('Failed to create room:', roomName, '(already exists)');
        }
    });

    socket.on('joinRoom', (roomName, playerName) => {//Escucha el evento joinRoom
        if (rooms.has(roomName)) {// Verifica si la sala existe
            const room = rooms.get(roomName);// Obtiene la sala

            const playerExists = room.players.some(p => p.id === socket.id);// Verifica si el jugador ya está en la sala
            const spectatorExists = room.spectators.some(s => s.id === socket.id);// Verifica si el espectador ya está en la sala

            if (!playerExists && !spectatorExists) {// Verifica si el jugador y el espectador no están en la sala
                if (room.players.length < 2) {// Verifica si la sala tiene 2 jugadores
                    room.players.push({ id: socket.id, name: playerName });// Agrega el jugador a la sala
                } else {
                    room.spectators.push({ id: socket.id, name: playerName });// Agrega el espectador a la sala
                }
                socket.join(roomName);// Agrega el cliente a la sala
            }
            io.to(roomName).emit('roomUpdate', getRoomData(roomName));// Emitir actualización de la sala
        } else {
            socket.emit('error', 'Room does not exist');
        }
    });

    socket.on('makeMove', (roomName, column) => {//Escucha el evento makeMove
        if (rooms.has(roomName)) {// Verifica si la sala existe
            const room = rooms.get(roomName);// Obtiene la sala
            const player = room.players.findIndex(p => p.id === socket.id);// Verifica si el jugador ya está en la sala
            if (player !== -1 && player === room.game.currentPlayer) {
                const result = makeMove(room.game, column);// Crea el juego
                if (result) {
                    io.to(roomName).emit('gameUpdate', room.game);// Emitir actualización del juego
                    if (result === 'win') {
                        io.to(roomName).emit('gameOver', `${room.players[player].name} wins!`);// Imprime el ganador
                    } else if (result === 'draw') {
                        io.to(roomName).emit('gameOver', 'It\'s a draw!');// Imprime un empate
                    }
                }
            }
        }
    });

    socket.on('leaveRoom', (roomName) => {//Escucha el evento leaveRoom
        if (rooms.has(roomName)) {
            const room = rooms.get(roomName);// Obtiene la sala
            room.players = room.players.filter(p => p.id !== socket.id);// Elimina el jugador de la sala
            room.spectators = room.spectators.filter(s => s.id !== socket.id);// Elimina el espectador de la sala
            socket.leave(roomName);// Quita el cliente de la sala
            if (room.players.length === 0 && room.spectators.length === 0) {// Verifica si la sala tiene 0 jugadores y 0 espectadores
                rooms.delete(roomName);// Elimina la sala
            } else {
                io.to(roomName).emit('roomUpdate', getRoomData(roomName));// Emitir actualización de la sala
            }
            io.emit('roomList', Array.from(rooms.keys()));// Emitir lista de salas
        }
    });

    socket.on('getRoomList', () => {//Escucha el evento getRoomList
        socket.emit('roomList', Array.from(rooms.keys()));// Emitir lista de salas
    });

    socket.on('disconnect', () => {//Escucha el evento disconnect
        console.log('Client disconnected:', socket.id);
        rooms.forEach((room, roomName) => {// Recorre todas las salas
            if (room.players.some(p => p.id === socket.id) || room.spectators.some(s => s.id === socket.id)) {// Verifica si el jugador o el espectador está en la sala
                socket.to(roomName).emit('playerDisconnected', socket.id);// Emitir jugador desconectado
            }
        });
    });
});

function createNewGame() {
    return {
        board: Array(6).fill().map(() => Array(7).fill(null)),// Crea el tablero vacío
        currentPlayer: 0
    };
}

function makeMove(game, column) {// Crea el juego
    for (let row = 5; row >= 0; row--) {// Itera sobre las filas del tablero
        if (game.board[row][column] === null) {// Verifica si la celda ya tiene un valor
            game.board[row][column] = game.currentPlayer;// Asigna el valor del jugador actual
            if (checkWin(game.board, row, column)) {// Verifica si el jugador gano
                return 'win';
            }
            if (checkDraw(game.board)) {// Verifica si el juego terminó
                return 'draw';
            }
            game.currentPlayer = 1 - game.currentPlayer;// Cambia el turno
            return true;
        }
    }
    return false;
}

function checkWin(board, row, col) {// Verifica si el jugador gano
    const directions = [// Direcciones de las fichas
        [0, 1], [1, 0], [1, 1], [1, -1]
    ];
    const player = board[row][col];// Obtiene el valor del jugador

    for (const [dx, dy] of directions) {// Itera sobre las direcciones
        let count = 1;// Conteo de fichas
        for (let i = 1; i < 4; i++) {
            const newRow = row + i * dx;
            const newCol = col + i * dy;// Obtiene las coordenadas de la nueva ficha
            if (newRow < 0 || newRow >= 6 || newCol < 0 || newCol >= 7 || board[newRow][newCol] !== player) {// Verifica si la nueva ficha se sale del tablero
                break;
            }
            count++;// Incrementa el conteo de fichas
        }
        for (let i = 1; i < 4; i++) {// Itera sobre las direcciones
            const newRow = row - i * dx;// Obtiene las coordenadas de la nueva ficha
            const newCol = col - i * dy;
            if (newRow < 0 || newRow >= 6 || newCol < 0 || newCol >= 7 || board[newRow][newCol] !== player) {// Verifica si la nueva ficha se sale del tablero
                break;
            }
            count++;
        }
        if (count >= 4) {// Verifica si el conteo de fichas es mayor o igual a 4
            return true;
        }
    }
    return false;
}

function checkDraw(board) {// Verifica si el juego terminó
    return board.every(row => row.every(cell => cell !== null));// Verifica si todas las celdas del tablero tienen un valor
}

function getRoomData(roomName) {// Obtiene la información de la sala
    const room = rooms.get(roomName);// Obtiene la sala
    return {// Retorna la información de la sala
        players: room.players,
        spectators: room.spectators,
        game: room.game
    };
}

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));