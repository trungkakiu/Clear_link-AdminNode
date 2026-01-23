// validator_admin_server.js
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fs from "fs";
import minimist from "minimist";
import path from "path";
import AdminGateway from "./src/routes/AdminGateway.js";
import autoConfig from "./src/core/configs/auto_config.js";
import loadValidatorDB from "./src/models/loadValidatorDB.js";
import connectToMetaGateway from "./ws_client.js";
import startModeLoop from "./src/controller/Node_mode_area.js";
dotenv.config();

const validatorAdminConfigPath =
  process.env.VALIDATOR_ADMIN_CONFIG ||
  path.resolve("src/configs/validator_admin_config.json");

if (!fs.existsSync(validatorAdminConfigPath)) {
  console.error(
    `Không tìm thấy file cấu hình ADMIN: ${validatorAdminConfigPath}`
  );
  process.exit(1);
}

const validator_admin_config = JSON.parse(
  fs.readFileSync(validatorAdminConfigPath, "utf-8")
);

const args = minimist(process.argv.slice(2));
const configPath =
  process.env.NODE_CONFIG ||
  path.resolve("src/configs/validator_admin_config.json");

if (!fs.existsSync(configPath)) {
  console.error(`Không tìm thấy file cấu hình: ${configPath}`);
  process.exit(1);
}

let nodeConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
(async () => {
  nodeConfig = await autoConfig(nodeConfig, configPath);
})();

const app = express();
const PORT = nodeConfig.port || 6000;

export const runtimeState = {
  _isSendSyncRequest: false,
  _coolDownUntil: null,
  _lastSyncAttemptAt: 0,
  _syncRetryCount: 0,
};

export const runtimeStateFork = {
  _isSendSyncRequest: false,
  _coolDownUntil: null,
  _lastSyncAttemptAt: 0,
  _syncRetryCount: 0,
};

const allowedOrigins = nodeConfig.allowedOrigins || [
  "http://localhost:3012",
  "http://localhost:5173",
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

(async () => {
  try {
    console.log(`Node Admin ID: ${nodeConfig.node_id}`);

    const valid_db = await loadValidatorDB(configPath);
    await valid_db.sequelize.authenticate();
    console.log(`Kết nối DB Validator Admin thành công.`);

    await valid_db.sequelize.sync();

    const [node, created] = await valid_db.Node_Info.findOrCreate({
      where: { node_id: nodeConfig.node_id },
      defaults: {
        node_id: nodeConfig.node_id,
        role: "admin_validator",
        node_type: "admin",
        address: `http://${nodeConfig.network.public_ip}:${PORT}`,
        public_key: nodeConfig.security.public_key,
        private_key: nodeConfig.security.private_key,
        stake: 999999,
        last_active: Math.floor(Date.now() / 1000),
      },
    });

    if (created) {
      console.log(`Đã tạo Node_info ADMIN: ${nodeConfig.node_id}`);
    } else {
      console.log(`Node_info đã tồn tại.`);
    }

    if (validator_admin_config.meta_gateway.ws_url) {
      connectToMetaGateway(nodeConfig, valid_db);
    } else {
      console.log("Không có URL MetaGateway WS, bỏ qua kết nối WS.");
    }
    startModeLoop(valid_db);
    AdminGateway(app, valid_db);

    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`ADMIN Validator Node chạy tại http://0.0.0.0:${PORT}\n`);
    });
  } catch (error) {
    console.error("Lỗi khởi động ADMIN NODE:", error);
    process.exit(1);
  }
})();
