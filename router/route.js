import express from 'express';
import { getTableDetails } from '../module/player.js';
export const router = express.Router();


router.get('/', (req, res)=> {
    return res.status(200).send({ status: true, msg: "Sequence server is up and running"});
});
router.get('/api/v1/game/getJoinTableDetails', getTableDetails);