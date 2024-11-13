import { write } from "../../utilities/db-connection.js";


export const insertSettlement = async(data)=> {
    try{
        const { bet_id, winAmount, status, name} = data;
        const [initial, roomId, operatorId, userId, betAmount] = bet_id.split(':');
        const decodeUserId = decodeURIComponent(userId);
        await write(`INSERT INTO settlement (bet_id, lobby_id, user_id, operator_id, name, bet_amount, win_amount, status) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, [bet_id, roomId, decodeUserId, operatorId, name, Number(betAmount), winAmount, status]);
        console.log(`Settlement data inserted successfully`);
    }catch(err){
        console.error(`Err while inserting data in table is:::`, err);
    }
}