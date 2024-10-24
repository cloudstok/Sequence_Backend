import Game from "../module/game.js";
import Player from "../module/player.js";
import { appConfig } from "../utilities/app-config.js";
import { deleteCache, getCache } from "../utilities/redis-connection.js";
import apiResponses from '../static_data/api_responses.json' assert { type: 'json' }

const rooms = {};
const games = {};
const activeLobbies = [];

export const getGameFromId = (gameId) => {
    const gameDetails = apiResponses["api/v1/game/getJoinTableDetails"].data.find(e => e.id === Number(gameId));
    return gameDetails;
}

export const getGameObj = (roomId) => {
    const game = games[roomId];
    const cleanGameObj = getGameData(game);
    return cleanGameObj;
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

export const emitLobbyDetails = (io) => {
    return io.emit('message', { eventName:"LOBBY_DETAILS", data: {
        status: true, lobbyData: activeLobbies
    }});
}

export const JoinRoomRequest = async (io, socket, data) => {
    try {
        console.log(data, "2>>>>>>>>>>>")
        data = typeof data === 'string' ? JSON.parse(data) : data;
        const { gameId, roomName } = data;

        const gameDetails = getGameFromId(gameId);
        if (!gameDetails) {
            console.log("Invalid Game ID passed");
            return socket.emit('message', {eventName: 'error', data: {message: 'Invalid Game ID passed'}});
        }

        const { entryAmount, maxPlayer } = gameDetails;
        let playerDetails = await getCache(`PL:${socket.id}`);

        if (!playerDetails) {
            console.log("Invalid Player Details");
            return socket.emit('message', {eventName: 'error', data: {message: 'Invalid Player Details'}});
        }

        playerDetails = typeof playerDetails === 'string' ? JSON.parse(playerDetails) : playerDetails;

        if (Number(playerDetails.balance) < entryAmount) {
            return socket.emit('message', { eventName: 'JOIN_ROOM_REQUEST', data: {message: "Insufficient Funds To Join Lobby.", status: false} });
        }


        let roomId = roomName || null;
        let game;
        
        if (!roomId) {
            roomId = `R${gameId}-${Date.now()}`;
            Object.assign(gameDetails, {roomId});
            game = new Game(gameDetails, roomId);
            games[roomId] = game;
            rooms[gameId] = [...(rooms[gameId] || []), roomId];
            activeLobbies.push(gameDetails);
            game.timer = setTimeout(() => {
                activeLobbies.filter(room=> room.roomId !== roomId);
                emitLobbyDetails(io);
                if (game.players.length >= Number(maxPlayer)) {
                    game.startGame(game.players, maxPlayer, io);
                } else {
                    const eventData = { MAX_TIME: 60, message: "You are long waiting, so please switch table or join new table", CURRENT_TIME: 0, roomName: roomId, status: true };
                    io.to(roomId).emit('message', { eventName: 'GAME_EXIT', data: eventData });
                    delete games[roomId];
                    rooms[gameId] = rooms[gameId].filter(r => r !== roomId);
                }
            }, 60 * 1000);
        }else{
            game = games[roomId];
        }

        emitLobbyDetails(io);

        const player = new Player(playerDetails, socket.id, entryAmount);
        game.addPlayer(player, maxPlayer);
        socket.join(roomId);

        const gameObj = getGameData(game);
        const eventData = { Game: {...gameDetails, ...gameObj}, message: "Join Successfully", roomName: roomId, status: true };
        io.to(roomId).emit('message', { eventName: 'JOIN_ROOM_REQUEST', data: eventData });
        console.log("JOIN_ROOM_REQUEST>>>>>>", player.id);
        // game.trackEvent('JOIN_ROOM_REQUEST', eventData);
        setTimeout(() => {
            const eventData = { maxTime: 60, maxDateTime: Date.now(), current_time: 60, message: "Please wait for other players to join game", roomName: roomId, status: true };
            io.to(roomId).emit('message', { eventName: 'PLAYER_WAITING_STATE', data: eventData });
            console.log("PLAYER_WAITING_STATE>>>>>>", player.id);
            // game.trackEvent('PLAYER_WAITING_STATE', eventData);
        }, 1000);


        if (game.players.length >= Number(maxPlayer)) {
            setTimeout(()=> {
                activeLobbies.filter(room=> room.roomId !== roomId);
                emitLobbyDetails(io);
                game.startGame(game.players, maxPlayer, io);
                if (game.timer) {
                    clearTimeout(game.timer);
                    game.timer = null;
                }
            }, 2000);
        }
        return;
    } catch (err) {
        console.error(err);
        return;
    }
};

export const removeGameFromList = (roomId, gameId) =>{
    rooms[gameId].filter(e=> e !== roomId);
    delete games[roomId];
}

export const UserActionRequest = async (io, socket, data) => {
    data = typeof data === 'string' ? JSON.parse(data) : data;
    console.log(data, "<<<<<<<<<<<<<<2");
    const { roomName, boardCardIndex, playerCardId } = data;
    const game = games[roomName];
    let playerDetails = await getCache(`PL:${socket.id}`);
    if (!playerDetails) {
        return socket.emit('message', {eventName: 'UserActionRequest', data: {message: 'Invalid Player Details'}});
    }
    playerDetails = JSON.parse(playerDetails);
    if (game && playerDetails) {
        game.placeCards(boardCardIndex, playerCardId, playerDetails.id, io);
    } else {
        return socket.emit('message', {eventName: 'UserActionRequest', data: {message: 'Game or Player not found'}});
    }
}

export const UpdateMeRequest = async(socket)=> {
    console.log("updateMeRequest>>>>>>>");
    let playerDetails = await getCache(`PL:${socket.id}`);
    if (!playerDetails) {
        return socket.emit('message', {eventName: 'error', data: {message: 'Invalid Player Details'}});
    };
    playerDetails = JSON.parse(playerDetails);
    let rooms = { roomId: []};
    for(let [key, value] of Object.entries(games)){
        value.players.forEach(player=> {
            if(player.id == playerDetails.id){
                console.log(player.id, "<<<<<<<<<<<<<<<2");
                rooms['playerId'] = player.id;
                rooms.roomId.push(key);
            } 
        })
    }
    if(rooms.roomId.length > 0){
        rooms.roomId.forEach(id=> {
            let game = games[id];
            game.updateMeRequest(rooms['playerId'], socket);
        })
    }
};

export const GameStatus = async(io, socket, data)=> {
    console.log("GetStatusRequest>>>>>>>>>>>>>>>");
    data = typeof data === 'string' ? JSON.parse(data) : data;
    const {roomName} = data;
    let playerDetails = await getCache(`PL:${socket.id}`);
    if (!playerDetails) {
        //return socket.emit('error', 'Invalid Player Details');
        return socket.emit('message', {eventName: 'error', data: {message: 'Invalid Player Details'}});
    }
    playerDetails = JSON.parse(playerDetails);
    const game = games[roomName];
    if (!game) {
        game.updateMeRequest(playerDetails.id, socket, "gameStatus")
   } else {
       //return socket.emit('error', 'Game or Player not found');
       return socket.emit('message', {eventName: 'error', data: {message: 'Game or Player not found'}});
   }
}

export const GameLeave = async(io, socket, data)=> {
    console.log("GameLeave>>>>>>>>>>>>>>>");
    data = typeof data === 'string' ? JSON.parse(data) : data;
    const {roomName} = data;
    let playerDetails = await getCache(`PL:${socket.id}`);
    if (!playerDetails) {
        //return socket.emit('error', 'Invalid Player Details');
        return socket.emit('message', {eventName: 'error', data: {message: 'Invalid Player Details'}});
    }
    playerDetails = JSON.parse(playerDetails);
    const game = games[roomName];
    if (game) {
        game.removePlayerFromGame(playerDetails.id, io, socket)
   } else {
       //return socket.emit('error', 'Game or Player not found');
       return socket.emit('message', {eventName: 'error', data: {message: 'Game or Player not found'}});
   }
}

export const DiscardCard = async(io, socket, data)=> {
    console.log("DiscardCard>>>>>>>>>>>>>>>");
    data = typeof data === 'string' ? JSON.parse(data) : data;
    const { roomName, cardId } = data;  
    const game = games[roomName];
    let playerDetails = await getCache(`PL:${socket.id}`);
    if (!playerDetails) {
        return socket.emit('message', {eventName: 'DiscardCard', data: {message: 'Invalid Player Details'}});
    }
    playerDetails = JSON.parse(playerDetails);
    if (game && playerDetails) {
        game.discardCard(playerDetails.id, cardId, io);
   } else {
       //return socket.emit('error', 'Game or Player not found');
       return socket.emit('message', {eventName: 'DiscardCard', data: {message: 'Game or Player not found'}});
   }
};


export const disconnect = async(io, socket) => {
    await deleteCache(`PL:${socket.id}`);
    console.log(`Socket disconnected: ${socket.id}`);
}
