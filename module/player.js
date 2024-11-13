import axios from "axios";
import { prepareDataForWebhook } from "../utilities/common-function.js";
import { getCache, setCache } from "../utilities/redis-connection.js";
import { sendToQueue } from "../utilities/amqp.js";
import { variableConfig } from "../utilities/load-config.js";

export const createPlayerData = (playerDetails, socketId, maxAmount, roomId) => {
    const { id, name, token, image, operatorId, userId } = playerDetails;
    const playerData = {
        id: id,
        bet_id: `BT:${roomId}:${operatorId}:${userId}:${maxAmount}`,
        socketId: socketId,
        name: name,
        token: token,
        winAmount: 0,
        depositAmount: maxAmount,
        avatar: image,
        status: "ACTIVE",
        wollenAmount: 1146,
        hand: [],
        pos: 0,
        chipColor: '',
        sequenceCount: 0,
        skipCount: 3,
        missedTurns: 0,
        isTurn: false,
        isEliminated: false,
        isWinner: false,
    }
    return playerData;
}

export const sendCreditRequest = async(data, io, playerData)=> {
    try{
        const socketId = data.socket_id;
        let playerDetails = await getCache(`PL:${socketId}`);
        if (!playerDetails) return false;
        playerDetails = JSON.parse(playerDetails);
        const socket = io.sockets.sockets.get(socketId);
        const webhookData = await prepareDataForWebhook({ ...data, game_id: playerDetails.game_id }, "CREDIT", socket);
        await sendToQueue('', 'games_cashout', JSON.stringify({ ...webhookData, operatorId: playerDetails.operatorId, token: playerData.token}));
        playerDetails.balance = (Number(playerDetails.balance) + Number(data.winning_amount)).toFixed(2);
        await setCache(`PL:${socketId}`, JSON.stringify(playerDetails));
        io.to(socketId).emit('message', {
            eventName: 'info', data: {
                uid: playerDetails.id,
                referral_link: "", 
                referral_code: "", 
                balance: Number(playerDetails.balance).toFixed(2), 
                userName: playerDetails.name, 
                avatar: playerDetails.image
            }
        })
        return true;
    }catch(err){
        console.log(err);
        return false;
    }
}

export const updateBalanceFromAccount = async (data, key, io, playerData) => {
    try {
        const socketId = data.socket_id;
        let playerDetails = await getCache(`PL:${socketId}`);
        if (!playerDetails) return false;
        playerDetails = JSON.parse(playerDetails);
        const socket = io.sockets.sockets.get(socketId);
        const webhookData = await prepareDataForWebhook({ ...data, game_id: playerDetails.game_id, bet_id: playerData.bet_id }, key, socket);
        if (key === 'DEBIT') playerData.txn_id = webhookData.txn_id;
        const sendRequest = await sendRequestToAccounts(webhookData, playerData.token);
        if (!sendRequest) return false;
        if (key === 'DEBIT') playerDetails.balance -= playerData.depositAmount;
        else playerDetails.balance = (Number(playerDetails.balance) + data.bet_amount).toFixed(2);
        io.to(socketId).emit('message', {
            eventName: 'info', data: {
                uid: playerDetails.id,
                referral_link: "", 
                referral_code: "", 
                balance: Number(playerDetails.balance).toFixed(2), 
                userName: playerDetails.name, 
                avatar: playerDetails.image
            }
        })
        await setCache(`PL:${socketId}`, JSON.stringify(playerDetails));
        return playerData;
    } catch (err) {
        console.error(`Err while updating Player's balance is`, err);
        return false;
    }
}

export const sendRequestToAccounts = async (webhookData, token) => {
    try {
        const url = process.env.service_base_url;
        let clientServerOptions = {
            method: 'POST',
            url: `${url}/service/operator/user/balance/v2`,
            headers: {
                token
            },
            data: webhookData,
            timeout: 1000 * 5
        };
        const data = (await axios(clientServerOptions))?.data;
        if (!data.status) return false;
        return true;
    } catch (err) {
        console.error(`Err while sending request to accounts is:::`, err?.message);
        return false;
    }
}

export const getTableDetails = async(req, res)=> {
    try{
        return res.status(200).send({ status: true, msg:"Table Details", data: {tableList: variableConfig.games_templates}});
    }catch(err){
        console.log(err);
        return res.status(500).send({ status: false, msg: "Internal Server Error"});
    }
}