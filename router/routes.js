import express from 'express';
import apiResponses from '../static_data/api_responses.json' assert { type: 'json' }
import { handleUser } from '../services/playerEvents.js';

export const router = express.Router();


Object.keys(apiResponses).forEach(apiPath => {
    router.get(`/${apiPath}`,(req,res)=>{
        res.json(apiResponses[apiPath]);
    })
});

router.get('/', (req, res) => {
    res.status(200).send({ status: true, message: "Sequence Testing Successfully 👍" });
});

router.get('/api/v1/getUserDetails', handleUser);
// router.get('/api/v1/user/wallet', handleUserBalance);