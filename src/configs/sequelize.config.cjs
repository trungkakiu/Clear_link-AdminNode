const fs = require("fs");

if (!process.env.NODE_CONFIG) {
  throw new Error("NODE_CONFIG is not defined");
}

const raw = fs.readFileSync(process.env.NODE_CONFIG, "utf-8");
const cfg = JSON.parse(raw);

if (!cfg.db) {
  throw new Error("Config missing db section");
}

module.exports = {
  development: {
    username: cfg.db.user,
    password: cfg.db.pass,
    database: cfg.db.name,
    host: cfg.db.host,
    port: cfg.db.port,
    dialect: "mysql",
    logging: false,
  },
};
