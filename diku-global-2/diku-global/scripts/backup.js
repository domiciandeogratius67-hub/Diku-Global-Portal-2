// Usage: npm run backup   -> data/backups/diku-YYYY-MM-DD.db (also copy uploads/ folder)
require('dotenv').config();
const path = require('path'), fs = require('fs');
const store = require('../db');
const dir = path.join(store.DATA_DIR, 'backups'); fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `diku-${new Date().toISOString().slice(0, 10)}.db`);
fs.rmSync(file, { force: true }); store.backupTo(file); console.log('Backup written:', file);
