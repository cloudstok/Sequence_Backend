import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import http from 'http';
import { initSocket } from './socket.js';
import dotenv from 'dotenv';
import { checkDatabaseConnection } from './utilities/db-connection.js';
import { initializeRedis } from './utilities/redis-connection.js';
import { loadConfig } from './utilities/helper.js';
import {router} from './router/routes.js';

dotenv.config();

const port = process.env.PORT || 4600;

const startServer = async () => {
    try{
        await checkDatabaseConnection();
        await initializeRedis();
        const app = express();
        const server = http.createServer(app);
        const io = new SocketIOServer(server,{transports:["websocket"]});
    
        app.use(cors());
        app.use(express.json());
        await loadConfig();
        initSocket(io);
        app.use(router)
        app.use((req, res, next) => {
            req.io = io;
            next();
        });
    
        server.listen(port, () => {
            console.info(`Server listening at PORT ${port}`);
        });
    }catch(err){
        console.log(err, "okk")
        throw new Error(err)
    }
};

startServer();

