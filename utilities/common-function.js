import axios from 'axios';
import crypto from 'crypto';
import {createLogger} from '../utilities/logger.js';

const failedLogger = createLogger('FailedThirdPartyAPICalls', 'jsonl');

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

export const generateDeck = (decks)=> {
    const cards = [];
    const suits = ['H', 'D', 'C', 'S'];
    const ranks = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'];
    let id = 0;
    for (let i = 0; i < Number(decks); i++) {
        for (let suit of suits) {
            for (let rank of ranks) {
                    let card = {
                        id,
                        rVal : suit + rank,
                    }
                    cards.push(card);                     
                    id++;
            }
        }
    }
    cards.sort(() => Math.random() - 0.5);
    return cards;
}

export const postDataToSourceForBet = async (data) => {
    try {
        return new Promise((resolve, reject) => {
            let { webhookData, token, socket_id, bet_id } = data;
            const url = process.env.service_base_url;
            let clientServerOptions = {
                method: 'POST',
                url: `${url}/service/operator/user/balance`,
                headers: {
                    token
                },
                data: webhookData,
                timeout: 1000 * 2
            };
            axios(clientServerOptions).then((result) => {
                resolve({ status: result.status, ...data });
            }).catch((err) => {
                console.log(`[ERR] received from upstream server`, err);
                let response = err.response ? err.response?.message : null;
                failedLogger.error(JSON.stringify({ req: { webhookData, token, socket_id, bet_id }, res: response }));
                reject({
                    response, token, socket_id, bet_id
                });
            });
        });
    } catch (err) {
        console.error(`[ERR] while posting data to source is:::`, err);
        failedLogger.error(JSON.stringify({ req: data, res: `Something went wrong` }));
        return false;
    }
};

export const prepareDataForWebhook = async(betObj, key, socket) => {
    try {
        let {id, bet_amount, winning_amount, game_id, socket_id, user_id, txn_id} = betObj;
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
                obj.description = `${bet_amount} debited for Rummy game for Round ${id}`;
                obj.bet_id = id;
                obj.socket_id = socket_id;
                obj.txn_type = 0;
                break;
            case "CREDIT":
                obj.amount = winning_amount;
                obj.txn_ref_id = txn_id;
                obj.description = `${winning_amount} credited for Rummy game for Round ${id}`;
                obj.txn_type = 1;
                break;
            default:
                obj;
        }
        return obj;
    } catch (err) {
        console.error(`[ERR] while trying to prepare data for webhook is::`, err);
        return false;
    }
};

export const aviatorData = [
    {
        "id": 1,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529975728_av-48.png"
    },
    {
        "id": 2,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529976128_av-49.png"
    },
    {
        "id": 3,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529976371_av-60.png"
    },
    {
        "id": 4,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529976556_av-61.png"
    },
    {
        "id": 5,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529976748_av-62.png"
    },
    {
        "id": 6,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529977005_av-63.png"
    },
    {
        "id": 7,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529977218_av-9.png"
    },
    {
        "id": 8,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529977463_av-10.png"
    },
    {
        "id": 9,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529977657_av-12.png"
    },
    {
        "id": 10,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529977843_av-13.png"
    },
    {
        "id": 11,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529978029_av-14.png"
    },
    {
        "id": 12,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529978236_av-15.png"
    },
    {
        "id": 13,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529978413_av-16.png"
    },
    {
        "id": 14,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529978670_av-17.png"
    },
    {
        "id": 15,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529978895_av-28.png"
    },
    {
        "id": 16,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529979111_av-29.png"
    },
    {
        "id": 17,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529979291_av-38.png"
    },
    {
        "id": 18,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529979460_av-39.png"
    },
    {
        "id": 19,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529979700_av-58.png"
    },
    {
        "id": 20,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529979887_av-59.png"
    },
    {
        "id": 21,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529980057_av-64.png"
    },
    {
        "id": 22,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529980274_av-65.png"
    },
    {
        "id": 23,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529980483_av-66.png"
    },
    {
        "id": 24,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529980739_av-67.png"
    },
    {
        "id": 25,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529980923_av-70.png"
    },
    {
        "id": 26,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529981135_av-71.png"
    },
    {
        "id": 27,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529981355_av-72.png"
    },
    {
        "id": 28,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529981569_av-1.png"
    },
    {
        "id": 29,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529981854_av-2.png"
    },
    {
        "id": 30,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529982090_av-3.png"
    },
    {
        "id": 31,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529982293_av-4.png"
    },
    {
        "id": 32,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529982540_av-5.png"
    },
    {
        "id": 33,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529982757_av-6.png"
    },
    {
        "id": 34,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529982957_av-7.png"
    },
    {
        "id": 35,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529983169_av-8.png"
    },
    {
        "id": 36,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529983356_av-11.png"
    },
    {
        "id": 37,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529983630_av-18.png"
    },
    {
        "id": 38,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529983920_av-19.png"
    },
    {
        "id": 39,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529984118_av-20.png"
    },
    {
        "id": 40,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529984318_av-21.png"
    },
    {
        "id": 41,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529984505_av-22.png"
    },
    {
        "id": 42,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529984702_av-23.png"
    },
    {
        "id": 43,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529984914_av-24.png"
    },
    {
        "id": 44,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529985146_av-25.png"
    },
    {
        "id": 45,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529985380_av-26.png"
    },
    {
        "id": 46,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529985658_av-27.png"
    },
    {
        "id": 47,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529985859_av-30.png"
    },
    {
        "id": 48,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529986051_av-31.png"
    },
    {
        "id": 49,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529986233_av-32.png"
    },
    {
        "id": 50,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529986409_av-33.png"
    },
    {
        "id": 51,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529986639_av-34.png"
    },
    {
        "id": 52,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529986839_av-35.png"
    },
    {
        "id": 53,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529987091_av-36.png"
    },
    {
        "id": 54,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529987352_av-37.png"
    },
    {
        "id": 55,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529987572_av-40.png"
    },
    {
        "id": 56,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529987790_av-41.png"
    },
    {
        "id": 57,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529988062_av-42.png"
    },
    {
        "id": 58,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529988275_av-43.png"
    },
    {
        "id": 59,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529988456_av-44.png"
    },
    {
        "id": 60,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529988709_av-45.png"
    },
    {
        "id": 61,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529988890_av-46.png"
    },
    {
        "id": 62,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529989119_av-47.png"
    },
    {
        "id": 63,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529989347_av-50.png"
    },
    {
        "id": 64,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529989570_av-51.png"
    },
    {
        "id": 65,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529989739_av-52.png"
    },
    {
        "id": 66,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529990002_av-53.png"
    },
    {
        "id": 67,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529990225_av-54.png"
    },
    {
        "id": 68,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529990448_av-55.png"
    },
    {
        "id": 69,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529990640_av-56.png"
    },
    {
        "id": 70,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529990822_av-57.png"
    },
    {
        "id": 71,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529990992_av-68.png"
    },
    {
        "id": 72,
        "url": "https://jaunpur123.s3.ap-south-1.amazonaws.com/1716529991191_av-69.png"
    }
];

export const getRandomAvator = () => {
    let randomAvatar = aviatorData[Math.floor(Math.random() * (72 - 1 + 1)) + 1];
    return randomAvatar?.url;
}

