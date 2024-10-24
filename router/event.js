import { disconnect, UserActionRequest, JoinRoomRequest, GameLeave, DiscardCard, GameStatus, UpdateMeRequest } from "../services/gameEvents.js";

export const registerEvents = (io, socket) => {
    const events = {
        JoinRoomRequest,
        UserActionRequest,
        GameLeave,
        DiscardCard,
        GameStatus,
        UpdateMeRequest,
        disconnect
    };
    for (const [event, handler] of Object.entries(events)) {
        console.log("Registering Event",event);
        socket.on(event, (data) => handler(io, socket, data));
    }
};
