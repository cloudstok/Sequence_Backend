import 'dotenv/config';

const { 
    DB_HOST, 
    DB_USER, 
    DB_PASSWORD, 
    DB_NAME, 
    DB_PORT, 
    DB_MAX_RETRIES, 
    DB_RETRY_INTERVAL, 
    REDIS_HOST, 
    REDIS_PORT, 
    REDIS_RETRY, 
    REDIS_RETRY_INTERVAL ,
    LOBBY_TIMER
} = process.env;

export const appConfig = {
    dbConfig: {
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
        port: DB_PORT,
        retries: DB_MAX_RETRIES,
        interval: DB_RETRY_INTERVAL
    },
    redis: {
        host: REDIS_HOST,
        port: +REDIS_PORT,
        retry: +REDIS_RETRY,
        interval: +REDIS_RETRY_INTERVAL
    },
    timer: +LOBBY_TIMER
};
