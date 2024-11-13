import { addPlayer, discardCard, generateGameData, placeCards, removePlayerFromGame, startGame, updateMeRequest } from "../module/game.js";
import { createPlayerData } from "../module/player.js";
import { deleteCache, getCache, setCache } from "../utilities/redis-connection.js";
import { variableConfig } from "../utilities/load-config.js";
import { insertGameData } from "../module/db-data/game-data-db.js";

export const getGameFromId = (gameId) => {
    const gameDetails = variableConfig.games_templates.find(e => e.id === Number(gameId));
    return gameDetails;
}

export const getGameObj = async(roomId) => {
    const gameData = await getCache(`game:${roomId}`);
    const game = gameData ? JSON.parse(gameData) : null;
    if(game){
        const cleanGameObj = getGameData(game);
        return cleanGameObj;
    }
}

export const getGameData = (gameObj) => {
    let cleanObj = {
        status: 'WAITING',
        currentPlayerTurnPos: gameObj['currentPlayerTurnPos'],
        players: gameObj['players'],
        turn: gameObj['turn'],
        playerTurnTime: gameObj['playerTurnTime'],
        sequenceData: gameObj['sequenceData'],
        resultData: gameObj['resultData']
    };
    return cleanObj;
}


export const JoinRoomRequest = async (io, socket, data) => {
    try {
        data = typeof data === 'string' ? JSON.parse(data) : data;
        const { gameId } = data;

        const gameDetails = getGameFromId(gameId);
        if (!gameDetails) {
            return socket.emit('message', { eventName: 'error', data: { message: 'Invalid Game ID passed' } });
        }

        const { entryAmount, maxPlayer } = gameDetails;
        let playerDetails = await getCache(`PL:${socket.id}`);
        if (!playerDetails) {
            return socket.emit('message', { eventName: 'error', data: { message: 'Invalid Player Details' } });
        }

        playerDetails = typeof playerDetails === 'string' ? JSON.parse(playerDetails) : playerDetails;

        if (Number(playerDetails.balance) < entryAmount) {
            return socket.emit('message', { eventName: 'JOIN_ROOM_REQUEST', data: { message: "Insufficient Funds To Join Lobby.", status: false } });
        }

        let roomId;
        let game;

        // Retrieve existing room IDs for the game
        let existingRoomIds = await getCache(`rooms:${gameId}`);
        existingRoomIds = existingRoomIds ? JSON.parse(existingRoomIds) : [];
        
        for (const id of existingRoomIds) {
            const gameData = await getCache(`game:${id}`);
            game = gameData ? JSON.parse(gameData) : null;
            if (game && !game.isStarted && game.players.length < Number(maxPlayer)) {
                roomId = id;
                break;
            }
        }

        if (!roomId) {
            roomId = `SQ${gameId}-${Date.now()}`;
            game = generateGameData(gameDetails, roomId);

            // Save initial game data to Redis, excluding the timer
            await setCache(`game:${roomId}`, JSON.stringify(game));
            existingRoomIds.push(roomId);
            await setCache(`rooms:${gameId}`, JSON.stringify(existingRoomIds));

            // Set a timer in memory, not in the game object, and handle timeout logic
            const timeoutCallback = async () => {
                const gameData = await getCache(`game:${roomId}`);
                game = gameData ? JSON.parse(gameData) : null;
                if (game && game.players.length >= Number(maxPlayer)) {
                    await startGame(game, io);
                } else {
                    const eventData = { MAX_TIME: 60, message: "You are long waiting, so please switch table or join new table", CURRENT_TIME: 0, roomName: roomId, status: true };
                    io.to(roomId).emit('message', { eventName: 'GAME_EXIT', data: eventData });
                    await deleteCache(`game:${roomId}`);
                    existingRoomIds = existingRoomIds.filter(r => r !== roomId);
                    await setCache(`rooms:${gameId}`, JSON.stringify(existingRoomIds));
                }
            };
            const gameTimeout = setTimeout(timeoutCallback, 60 * 1000);
            globalThis[`timer_${roomId}`] = gameTimeout; // Save the timer in a global variable
        }

        let isPlayerExist = game.players.find(e => e.id === playerDetails.id);
        if (isPlayerExist) {
            return socket.emit('message', { eventName: 'JoinRoomRequest', data: { message: "Player already exists in lobby", status: false } });
        }

        const player = createPlayerData(playerDetails, socket.id, entryAmount, roomId);
        await setCache(`PG:${playerDetails.id}`, roomId);
        game = addPlayer(player, maxPlayer, game);
        socket.join(roomId);

        const eventData = { message: "Join Successfully", roomName: roomId, status: true, playersCount: game.players.length };
        io.to(roomId).emit('message', { eventName: 'JOIN_ROOM_REQUEST', data: eventData });

        // Update game in Redis
        await setCache(`game:${roomId}`, JSON.stringify(game));
        setTimeout(() => {
            const eventData = { maxTime: 60, maxDateTime: Date.now(), current_time: 60 - ((Date.now() - game.gameStartTime) / 1000), message: "Please wait for other players to join game", roomName: roomId, status: true };
            io.to(roomId).emit('message', { eventName: 'PLAYER_WAITING_STATE', data: eventData });
        }, 1000);

        if (game.players.length >= Number(maxPlayer)) {
            setTimeout(async () => {
                console.log("Game Started>>>>>>>");
                await startGame(game, io);
                const timerKey = `timer_${roomId}`;
                if (globalThis[timerKey]) {
                    clearTimeout(globalThis[timerKey]);
                    delete globalThis[timerKey];
                }
                // await setCache(`game:${roomId}`, JSON.stringify(game));
            }, 2000);
        }
        return;
    } catch (err) {
        console.error(err);
        return;
    }
};


export const removeGameFromList = async (game, io) => {
    await insertGameData(game);
    io.socketsLeave(game.id);
    const socketsInRoom = await io.in(game.id).fetchSockets();
    socketsInRoom.forEach((socket) => {
        socket.removeAllListeners();
    });
    await Promise.all(game.players.map(async player=> await deleteCache(`PG:${player.id}`)));
    await deleteCache(`game:${game.id}`); // Delete the game room
    let existingRoomIds = await getCache(`rooms:${game.gameId}`);
    existingRoomIds = existingRoomIds ? JSON.parse(existingRoomIds) : [];
    existingRoomIds = existingRoomIds.filter(r => r !== game.id);
    await setCache(`rooms:${game.gameId}`, JSON.stringify(existingRoomIds));
    console.log("Game deleted");
}

export const UserActionRequest = async (io, socket, data) => {
    data = typeof data === 'string' ? JSON.parse(data) : data;
    const { roomName, boardCardIndex, playerCardId } = data;
    const gameData = await getCache(`game:${roomName}`);
    let game = gameData ? JSON.parse(gameData) : null;
    let playerDetails = await getCache(`PL:${socket.id}`);
    if (!playerDetails) {
        return socket.emit('message', { eventName: 'UserActionRequest', data: { message: 'Invalid Player Details' } });
    }
    playerDetails = JSON.parse(playerDetails);
    if (game) {
        await placeCards(game, boardCardIndex, playerCardId, playerDetails.id, io);
    } else {
        return socket.emit('message', { eventName: 'UserActionRequest', data: { message: 'Game details not found' } });
    }
}

export const UpdateMeRequest = async (socket) => {
    console.log("updateMeRequest>>>>>>>");
    let playerDetails = await getCache(`PL:${socket.id}`);
    if (!playerDetails) {
        return socket.emit('message', { eventName: 'error', data: { message: 'Invalid Player Details' } });
    };
    playerDetails = JSON.parse(playerDetails);
    const existingPlayerRoom = await getCache(`PG:${playerDetails.id}`);
    console.log(existingPlayerRoom, "<<<<<<1");
    if(existingPlayerRoom){
        const gameData = await getCache(`game:${existingPlayerRoom}`);
        if(gameData){
            const game = JSON.parse(gameData);
            return updateMeRequest(game, playerDetails.id, socket);
        }
    }
};

export const GameStatus = async (io, socket, data) => {
    console.log("GetStatusRequest>>>>>>>>>>>>>>>");
    data = typeof data === 'string' ? JSON.parse(data) : data;
    const { roomName } = data;
    let playerDetails = await getCache(`PL:${socket.id}`);
    if (!playerDetails) {
        return socket.emit('message', { eventName: 'error', data: { message: 'Invalid Player Details' } });
    }
    playerDetails = JSON.parse(playerDetails);
    const gameData = await getCache(`game:${roomName}`);
    let game = gameData ? JSON.parse(gameData) : null;
    if (!game) {
        updateMeRequest(game, playerDetails.id, socket, "gameStatus")
    } else {
        return socket.emit('message', { eventName: 'error', data: { message: 'Game or Player not found' } });
    }
}

export const GameLeave = async (io, socket, data) => {
    data = typeof data === 'string' ? JSON.parse(data) : data;
    const { roomName } = data;
    let playerDetails = await getCache(`PL:${socket.id}`);
    if (!playerDetails) {
        return socket.emit('message', { eventName: 'error', data: { message: 'Invalid Player Details' } });
    }
    playerDetails = JSON.parse(playerDetails);
    const gameData = await getCache(`game:${roomName}`);
    let game = gameData ? JSON.parse(gameData) : null;
    if (game) {
        await removePlayerFromGame(game, playerDetails.id, io, socket)
    } else {
        return socket.emit('message', { eventName: 'error', data: { message: 'Game or Player not found' } });
    }
}

export const DiscardCard = async (io, socket, data) => {
    data = typeof data === 'string' ? JSON.parse(data) : data;
    const { roomName, cardId } = data;
    const gameData = await getCache(`game:${roomName}`);
    let game = gameData ? JSON.parse(gameData) : null;
    let playerDetails = await getCache(`PL:${socket.id}`);
    if (!playerDetails) {
        return socket.emit('message', { eventName: 'DiscardCard', data: { message: 'Invalid Player Details', status: false } });
    }
    playerDetails = JSON.parse(playerDetails);
    if (game && playerDetails) {
        await discardCard(game, playerDetails.id, cardId, io);
    } else {
        return socket.emit('message', { eventName: 'DiscardCard', data: { message: 'Game or Player not found' } });
    }
};


export const disconnect = async (io, socket) => {
    await deleteCache(`PL:${socket.id}`);
    console.log(`Socket disconnected: ${socket.id}`);
}
