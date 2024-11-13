import { write } from "../../utilities/db-connection.js";


export const insertGameData = async (game) => {
    try {
        await write(`INSERT INTO game_results (game_id, room_id, game_data, player_data, bet_amount, win_amount) VALUES(?,?,?,?,?,?)`, [Number(game.gameId), game.id, JSON.stringify(game), JSON.stringify(game.resultData), game.betAmount, game.winAmount]);
        console.log(`Game Result data inserted successfully`);
    } catch (err) {
        console.error(`Err while inserting data in table is:::`, err);
    }
}