import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import http from 'http';
import { initSocket } from './socket.js';
import dotenv from 'dotenv';
import { checkDatabaseConnection } from './utilities/db-connection.js';
import { flushDatabase, initializeRedis } from './utilities/redis-connection.js';
import { initQueue } from './utilities/amqp.js';
import { router } from './router/route.js';
import { loadConfig } from './utilities/load-config.js';

dotenv.config();

const port = process.env.PORT || 4600;

const startServer = async () => {
    try{
        await Promise.all([checkDatabaseConnection(), initQueue(), initializeRedis()]);
        await loadConfig();
        // await flushDatabase();
        const app = express();
        const server = http.createServer(app);
        const io = new SocketIOServer(server,{transports:["websocket"]});
    
        app.use(cors());
        app.use(express.json());
        initSocket(io);
        app.use(router);
        server.listen(port, () => {
            console.info(`Server listening at PORT ${port}`);
        });
    }catch(err){
        throw new Error(err)
    }
};

startServer();

