const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const players = {};
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

const rooms = new Map();

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('newPlayer', (nickname) => {
        players[socket.id] = nickname;
        io.emit('playerList', Object.values(players)); // Emitir lista de jugadores conectados
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerList', Object.values(players)); // Emitir lista de jugadores conectados
    });

    socket.on('createRoom', (roomName, playerName) => {
        console.log('Attempt to create room:', roomName, 'by player:', playerName);
        if (!rooms.has(roomName)) {
            rooms.set(roomName, {
                players: [{ id: socket.id, name: playerName }],
                spectators: [],
                game: createNewGame()
            });
            socket.join(roomName);
            io.to(roomName).emit('roomUpdate', getRoomData(roomName));
            io.emit('roomList', Array.from(rooms.keys()));

            // Emitir evento de confirmación de creación de sala
            socket.emit('roomCreated', roomName);

            console.log('Room created:', roomName);
        } else {
            socket.emit('error', 'Room already exists');
            console.log('Failed to create room:', roomName, '(already exists)');
        }
    });

    socket.on('joinRoom', (roomName, playerName) => {
        if (rooms.has(roomName)) {
            const room = rooms.get(roomName);

            // Verificar si el jugador ya está en la sala antes de agregarlo
            const playerExists = room.players.some(p => p.id === socket.id);
            const spectatorExists = room.spectators.some(s => s.id === socket.id);

            if (!playerExists && !spectatorExists) {
                if (room.players.length < 2) {
                    room.players.push({ id: socket.id, name: playerName });
                } else {
                    room.spectators.push({ id: socket.id, name: playerName });
                }
                socket.join(roomName);
            }
            io.to(roomName).emit('roomUpdate', getRoomData(roomName));
        } else {
            socket.emit('error', 'Room does not exist');
        }
    });

    socket.on('makeMove', (roomName, column) => {
        if (rooms.has(roomName)) {
            const room = rooms.get(roomName);
            const player = room.players.findIndex(p => p.id === socket.id);
            if (player !== -1 && player === room.game.currentPlayer) {
                const result = makeMove(room.game, column);
                if (result) {
                    io.to(roomName).emit('gameUpdate', room.game);
                    if (result === 'win') {
                        io.to(roomName).emit('gameOver', `${room.players[player].name} wins!`);
                    } else if (result === 'draw') {
                        io.to(roomName).emit('gameOver', 'It\'s a draw!');
                    }
                }
            }
        }
    });

    socket.on('leaveRoom', (roomName) => {
        if (rooms.has(roomName)) {
            const room = rooms.get(roomName);
            room.players = room.players.filter(p => p.id !== socket.id);
            room.spectators = room.spectators.filter(s => s.id !== socket.id);
            socket.leave(roomName);
            if (room.players.length === 0 && room.spectators.length === 0) {
                rooms.delete(roomName);
            } else {
                io.to(roomName).emit('roomUpdate', getRoomData(roomName));
            }
            io.emit('roomList', Array.from(rooms.keys()));
        }
    });

    socket.on('getRoomList', () => {
        socket.emit('roomList', Array.from(rooms.keys()));
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        rooms.forEach((room, roomName) => {
            if (room.players.some(p => p.id === socket.id) || room.spectators.some(s => s.id === socket.id)) {
                socket.to(roomName).emit('playerDisconnected', socket.id);
            }
        });
    });
});

function createNewGame() {
    return {
        board: Array(6).fill().map(() => Array(7).fill(null)),
        currentPlayer: 0
    };
}

function makeMove(game, column) {
    for (let row = 5; row >= 0; row--) {
        if (game.board[row][column] === null) {
            game.board[row][column] = game.currentPlayer;
            if (checkWin(game.board, row, column)) {
                return 'win';
            }
            if (checkDraw(game.board)) {
                return 'draw';
            }
            game.currentPlayer = 1 - game.currentPlayer;
            return true;
        }
    }
    return false;
}

function checkWin(board, row, col) {
    const directions = [
        [0, 1], [1, 0], [1, 1], [1, -1]
    ];
    const player = board[row][col];

    for (const [dx, dy] of directions) {
        let count = 1;
        for (let i = 1; i < 4; i++) {
            const newRow = row + i * dx;
            const newCol = col + i * dy;
            if (newRow < 0 || newRow >= 6 || newCol < 0 || newCol >= 7 || board[newRow][newCol] !== player) {
                break;
            }
            count++;
        }
        for (let i = 1; i < 4; i++) {
            const newRow = row - i * dx;
            const newCol = col - i * dy;
            if (newRow < 0 || newRow >= 6 || newCol < 0 || newCol >= 7 || board[newRow][newCol] !== player) {
                break;
            }
            count++;
        }
        if (count >= 4) {
            return true;
        }
    }
    return false;
}

function checkDraw(board) {
    return board.every(row => row.every(cell => cell !== null));
}

function getRoomData(roomName) {
    const room = rooms.get(roomName);
    return {
        players: room.players,
        spectators: room.spectators,
        game: room.game
    };
}

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));