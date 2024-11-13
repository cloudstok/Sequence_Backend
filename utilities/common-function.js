import crypto from 'crypto';

export function generateUUIDv7() {
    const timestamp = Date.now();
    const timeHex = timestamp.toString(16).padStart(12, '0');
    const randomBits = crypto.randomBytes(8).toString('hex').slice(2);
    const uuid = [
        timeHex.slice(0, 8),  
        timeHex.slice(8) + randomBits.slice(0, 4),  
        '7' + randomBits.slice(4, 7),  
        (parseInt(randomBits.slice(7, 8), 16) & 0x3f | 0x80).toString(16) + randomBits.slice(8, 12),  
        randomBits.slice(12)
    ];

    return uuid.join('-');
}

export const prepareDataForWebhook = async(betObj, key, socket) => {
    try {
        let {id, bet_amount, winning_amount, game_id, socket_id, user_id, txn_id, bet_id} = betObj;
        let userIP;
        if (socket?.handshake?.headers?.['x-forwarded-for']) {
            userIP = socket.handshake.headers['x-forwarded-for'].split(',')[0].trim();
        }
        let obj = {
            amount: Number(bet_amount).toFixed(2),
            txn_id: generateUUIDv7(),
            ip : userIP,
            game_id,
            user_id: decodeURIComponent(user_id)
        };
        switch (key) {
            case "DEBIT":
                obj.description = `${bet_amount} debited for Sequence game for Round ${id}`;
                obj.socket_id = socket_id;
                obj.txn_type = 0;
                break;
            case "CREDIT":
                obj.amount = winning_amount;
                obj.txn_ref_id = txn_id;
                obj.description = `${winning_amount} credited for Sequence game for Round ${id}`;
                obj.txn_type = 1;
                break;
            case 'ROLLBACK':
                obj.txn_ref_id = txn_id;
                obj.description = `${bet_amount} Rollbacked for Sequence game for Round ${id}`;
                obj.txn_type = 2;
            default:
                obj;
        }
        return obj;
    } catch (err) {
        console.error(`[ERR] while trying to prepare data for webhook is::`, err);
        return false;
    }
};

