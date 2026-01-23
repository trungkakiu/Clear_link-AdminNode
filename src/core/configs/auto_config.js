import fs from "fs";
import os from "os";
import axios from "axios";
import crypto from "crypto";

const autoSetupConfig = async (config, configPath) => {
  let changed = false;

  if (!config.node_id || config.node_id.trim() === "") {
    config.node_id =
      "ADMIN_NODE_" + Math.floor(100000 + Math.random() * 900000);
    changed = true;
  }

  if (!config.network) config.network = {};

  if (!config.network.local_ip) {
    config.network.local_ip = getLocalIP();
    changed = true;
  }

  if (!config.network.public_ip) {
    try {
      const res = await axios.get("https://api.ipify.org?format=json");
      config.network.public_ip = res.data.ip;
    } catch {
      config.network.public_ip = "UNKNOWN";
    }
    changed = true;
  }

  if (!config.security) config.security = {};
  if (!config.security.public_key || !config.security.private_key) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });

    config.security.public_key = publicKey.export({
      type: "spki",
      format: "pem",
    });

    config.security.private_key = privateKey.export({
      type: "pkcs8",
      format: "pem",
    });

    changed = true;
  }

  if (config.first_run !== false) {
    config.first_run = false;
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("Config đã được tự động cập nhật.");
  }

  return config;
};

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}

export default autoSetupConfig;
