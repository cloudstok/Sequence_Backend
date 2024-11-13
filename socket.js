import { registerEvents } from './router/event.js';
import { setCache } from './utilities/redis-connection.js';
import { getUserDataFromSource } from './services/playerEvents.js';
import { UpdateMeRequest } from './services/gameEvents.js';
export const initSocket = (io) => {
    const onConnection = async (socket) => {
        console.log("socket connected");
        const token = socket.handshake.query.token;
        const game_id = socket.handshake.query.game_id;
        if (!token) {
            socket.disconnect(true);
            return console.log("No Token Provided", token);
        }
        const userData = await getUserDataFromSource(token, game_id);
        if (!userData) {
            socket.disconnect(true);
            return console.log("Invalid token", token);
        }
        await setCache(`PL:${socket.id}`, JSON.stringify({ ...userData, game_id, socketId: socket.id }), 3600);
        socket.emit('message', {
            eventName: 'info', data: {
                uid: userData.id,
                 referral_link: "", 
                 referral_code: "",
                  balance: Number(userData.balance).toFixed(2), 
                  userName: userData.name, 
                  avatar: userData.image
            }
        });
        registerEvents(io, socket);
        UpdateMeRequest(socket);
        socket.on('error', (error) => {
            console.error(`Socket error: ${socket.id}. Error: ${error.message}`);
        });
    }
    io.on('connection', onConnection);
};
