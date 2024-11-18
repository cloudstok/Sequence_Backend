import fs from 'fs';
import path from 'path';
import pino from 'pino';

// Define colors for pretty-printing
const colors = {
  trace: '\x1b[37m',
  debug: '\x1b[36m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  fatal: '\x1b[35m',
  reset: '\x1b[0m'
};

function prettyPrint(log) {
  const timestamp = new Date(log.time).toISOString();
  const level = log.level;
  const color = colors[level] || colors.info;
  return `${timestamp} ${color}[${log.name}] ${level}: ${log.msg}${colors.reset}`;
}

const prettyStream = {
  write: (chunk) => {
    const log = JSON.parse(chunk);
    console.log(prettyPrint(log));
  }
};

const jsonlStream = (filePath) => fs.createWriteStream(filePath, { flags: 'a' });

export const createLogger = (moduleName, format = 'plain') => {
  const logDir = 'logs';
  const jsonlFilePath = path.join(logDir, `${moduleName}.jsonl`);
  const logFilePath = path.join(logDir, `${moduleName}.log`);

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  let logFileStream;
  if (format === 'jsonl') {
    logFileStream = jsonlStream(jsonlFilePath);
  } else {
    logFileStream = fs.createWriteStream(logFilePath, { flags: 'a' });
  }

  return pino({
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    base: { name: moduleName },
  }, pino.multistream([
    { stream: prettyStream }, 
    { stream: logFileStream } 
  ]));
}

// const deleteOldLogs = (logDir) => {
//   const expirationTime = 48 * 60 * 60 * 1000; 
//   const now = Date.now();

//   fs.readdir(logDir, (err, files) => {
//     if (err) {
//       console.error(`Error reading log directory: ${err.message}`);
//       return;
//     }

//     files.forEach((file) => {
//       const filePath = path.join(logDir, file);
//       fs.stat(filePath, (err, stats) => {
//         if (err) {
//           console.error(`Error accessing file ${file}: ${err.message}`);
//           return;
//         }

//         if (now - stats.mtimeMs > expirationTime) {
//           fs.unlink(filePath, (err) => {
//             if (err) {
//               console.error(`Error deleting file ${file}: ${err.message}`);
//             } else {
//               console.log(`Deleted old log file: ${file}`);
//             }
//           });
//         }
//       });
//     });
//   });
// };

// const logCleanupInterval = 60 * 60 * 1000;
// setInterval(() => {
//   const logDir = 'logs';
//   deleteOldLogs(logDir);
// }, logCleanupInterval);