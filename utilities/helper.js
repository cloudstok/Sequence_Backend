import { read } from "./db-connection.js";

export const variableConfig = {
    dbVariables: []
}
export const loadConfig = async()=> {
    const data = await read(`SELECT data from game_templates WHERE is_active = 1`);
    let templateData = data.map(e=> e.data);
    variableConfig.dbVariables = templateData   
}

