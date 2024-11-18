import axios from 'axios';
import { setCache, getCache } from '../utilities/redis-connection.js';
import { createLogger } from '../utilities/logger.js';
const logger = createLogger('players', 'jsonl');

export const handleUser = async (req, res) => {
    try {
        const { token, game_id } = req.headers;
        const logReqObj = { token };

        if (!token || !game_id) {
            return res.status(400).send({ status: true, msg: "token or game id missing in headers" });
        }

        const userData = await getUserDataFromSource(token, game_id);
        if (!userData) {
            return res.status(400).send({ status: true, msg: "Failed to fetch user details from the operator" });
        }
        logger.info(JSON.stringify({ req: logReqObj, res: userData }));
        const { id, name, image, balance } = userData;
        return res.status(200).send({
            status: true, data: {
                uid: id, referral_link: "", referral_code: "", balance: Number(balance).toFixed(2), userName: name, avatar: image, game_setting: {
                    sound: true,
                    music: true,
                    notifications: false
                }
            }
        });
    } catch (err) {
        console.log(err);
        return res.status(500).send({ status: false, msg: "Something went wrong, while getting user data from operator" });
    }
};

function getImageValue(id) {
    let sum = 0;
    for (let char of id) {
        sum += (char.charCodeAt(0));
    }
    return sum % 10;
};

export const getUserDataFromSource = async (token, game_id) => {
    try {
        const data = await axios.get(`${process.env.service_base_url}/service/user/detail`, {
            headers: {
                'token': token
            }
        })
        const userData = data?.data?.user;
        if (userData) {
            const userId = encodeURIComponent(userData.user_id);
            const { operatorId } = userData;
            const id = `${operatorId}:${userId}`;
            const image = getImageValue(id);
            const finalData = { ...userData, userId, id, game_id, token, image };
            await setCache(`PL:${token}`, JSON.stringify(finalData), 3600);
            return finalData;
        }
        return;
    } catch (err) {
        console.log(err);
        logger.error(JSON.stringify({ data: token, err: err }));
        return false;
    }
};


export const getUserData = async (key) => {
    let userData = await getCache(key);
    if (userData) {
        try {
            userData = JSON.parse(userData);
        } catch (err) {
            console.error(`[ERR] while updating avatar is::`, err);
            return false;
        }
        return userData;
    }
    return false;
};

export default { handleUser, getUserData, getUserDataFromSource };
