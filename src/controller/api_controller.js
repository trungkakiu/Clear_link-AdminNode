import WebSocket from "ws";
import path from "path";
import os, { type } from "os";
import ping from "ping";
import crypto from "crypto";
import checkDiskSpace from "check-disk-space";
import KeyStore from "../core/security/KeyStore.js";
import { fileURLToPath } from "url";
import fs from "fs";
import nodeModeManager from "./Node_mode_state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const validator_admin_config_path = path.resolve(
  __dirname,
  "../configs/validator_admin_config.json",
);

const signature_data = async (nodeId, time_now) => {
  const data = `${nodeId}|${time_now}`;
  if (typeof data !== "string") {
    throw new Error("signature_data expects string input");
  }
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(data, "utf8");
  signer.end();

  return signer.sign(KeyStore.getPrivateKey(), "base64");
};

const validator_admin_config = JSON.parse(
  fs.readFileSync(validator_admin_config_path, "utf-8"),
);
async function getCpuUsage() {
  const start = os.cpus();

  await new Promise((r) => setTimeout(r, 300));

  const end = os.cpus();

  let idle = 0;
  let total = 0;

  for (let i = 0; i < start.length; i++) {
    const s = start[i].times;
    const e = end[i].times;

    idle += e.idle - s.idle;
    total +=
      e.user -
      s.user +
      e.nice -
      s.nice +
      e.sys -
      s.sys +
      e.irq -
      s.irq +
      (e.idle - s.idle);
  }

  return Math.round((1 - idle / total) * 100);
}
function getRamUsage() {
  const totalRamBytes = os.totalmem();
  const freeRamBytes = os.freemem();
  const usedRamBytes = totalRamBytes - freeRamBytes;

  const toGB = (bytes) => +(bytes / 1024 / 1024 / 1024).toFixed(2);

  return {
    usedRam: toGB(usedRamBytes),
    totalRam: toGB(totalRamBytes),
  };
}
export async function getDiskUsage() {
  console.log("checkDiskSpace:", checkDiskSpace);
  let rootPath = path.parse(process.cwd()).root;

  if (os.platform() === "win32") {
    if (!rootPath || !/^[A-Z]:\\$/i.test(rootPath)) {
      rootPath = "C:\\";
    }
  }
  console.log("cwd:", process.cwd());
  console.log("root:", path.parse(process.cwd()).root);
  return await checkDiskSpace(rootPath);
}

async function checkDBHealth(db) {
  let db_alive = false;
  let db_canRead = false;
  let db_canWrite = false;
  let db_FileSizeMB = 0;
  let db_Message = "";

  try {
    await db.sequelize.authenticate();
    db_alive = true;

    await db.Node_Info.findOne();
    db_canRead = true;

    await db.Node_Info.create(
      {
        node_id: "TEMP_CHECK",
        role: "observer",
        address: "0",
        public_key: "0",
      },
      { ignoreDuplicates: true },
    );
    db_canWrite = true;

    const [rows] = await db.sequelize.query(`
      SELECT SUM(data_length + index_length) AS size
      FROM information_schema.tables 
      WHERE table_schema = DATABASE();
    `);

    console.log(rows);
    const size = rows?.[0]?.size ?? 0;

    const rawSize = Number(rows?.[0]?.size ?? 0);

    db_FileSizeMB = Number((rawSize / (1024 * 1024)).toFixed(2));
  } catch (err) {
    db_Message = err.message;
  }

  return {
    db_alive,
    db_canRead,
    db_canWrite,
    db_FileSizeMB,
    db_Message,
  };
}
function normalizeHost(input) {
  try {
    const u = new URL(input);
    return u.hostname;
  } catch {
    return input.split(":")[0];
  }
}

async function getPing(host) {
  try {
    const target = normalizeHost(host);
    const res = await ping.promise.probe(target, { timeout: 2 });
    return typeof res.time === "number" ? res.time : -1;
  } catch {
    return -1;
  }
}

const get_nodestatus = (db) => async (req, res) => {
  try {
    const cpuUsage = await getCpuUsage();
    const { usedRam, totalRam } = getRamUsage();
    const { free: freeDisk, size: totalDisk } = await getDiskUsage();
    const latest_block = await get_latest_block(db);
    const { db_alive, db_canRead, db_canWrite, db_FileSizeMB, db_Message } =
      await checkDBHealth(db);

    const ping = await getPing(validator_admin_config.meta_gateway.http_url);

    return res.status(200).json({
      RM: "lấy thông tin node thành công",
      RC: 200,
      RD: {
        status: {
          height: latest_block.Height,
          running: true,
          cpu: cpuUsage,
          ram_used: usedRam,
          ram_total: totalRam,
          disk_free: +(freeDisk / 1024 / 1024 / 1024).toFixed(2),
          disk_total: +(totalDisk / 1024 / 1024 / 1024).toFixed(2),
          db_alive,
          db_canRead,
          db_canWrite,
          db_FileSizeMB,
          db_Message,
          ping: ping,
        },
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RM: "lỗi server nội bộ",
      RC: 500,
    });
  }
};

const get_block_by_height = (height) => {
  return db.Block.findOne({
    where: {
      Height: height,
    },
  });
};

const get_block_currentid_status_type = (current_id, status, type, limit) => {
  return db.Block.findAll({
    where: {
      current_id,
      status,
      type,
    },
    limit,
    order: [["Height", "ASC"]],
  });
};

const get_block_status_currentid = (current_id, status, limit) => {
  return db.Block.findAll({
    where: {
      current_id,
      status,
    },
    limit,
    order: [["Height", "ASC"]],
  });
};

const get_latest_block = async (db) => {
  const latest = await db.Block.max("Height");
  return db.Block.findOne({ where: { Height: latest } });
};

const vetify_signature = (public_key, signature, client_hash) => {
  if (!public_key || !signature || !client_hash) {
    return {
      RC: 203,
      RM: "Missing parameter",
    };
  }

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(client_hash);
  verifier.end();

  const isValid = verifier.verify(public_key, Buffer.from(signature, "base64"));

  if (!isValid) {
    return false;
  } else {
    return true;
  }
};

const get_node_new_vote = (db, public_key, signature, client_hash) => {
  try {
    const signature_valid = vetify_signature(
      public_key,
      signature,
      client_hash,
    );

    if (!signature_valid) {
      return {
        RC: 401,
        RM: "invalid signature",
        RD: {
          ok: false,
          payload: "",
          signature: "",
          error: "invalid signature",
        },
      };
    }

    const nodeSignature = crypto.sign(
      "RSA-SHA256",
      Buffer.from(client_hash, "utf8"),
      {
        key: KeyStore.getPrivateKey(),
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
    );

    return {
      RC: 200,
      RM: "Vote accepted",
      RD: {
        ok: true,
        payload: client_hash,
        signature: nodeSignature.toString("base64"),
        error: "",
      },
    };
  } catch (error) {
    console.error("[get_node_new_vote ERROR]", error);
    return {
      RC: 500,
      RM: "Internal server error",
    };
  }
};

const get_vote = async (db, payload) => {
  try {
    const { public_key, signature, client_hash, current_id, type, status } =
      payload;
    const signature_valid = vetify_signature(
      public_key,
      signature,
      client_hash,
    );

    if (!signature_valid) {
      return {
        RM: "invalid signature",
        RC: 401,
        RD: {
          ok: false,
          signature: "",
          payload: "",
          error: "invalid signature",
        },
      };
    }

    const prev_block = await get_block_currentid_status_type(
      current_id,
      status,
      type,
    );

    if (!prev_block) {
      return {
        RM: "not found!",
        RC: 203,
        RD: {
          ok: false,
          signature: "",
          payload: client_hash,
          error: "Block not found",
        },
      };
    }

    if (prev_block.Hash != client_hash) {
      return {
        RM: "Block hash mismatch!",
        RC: 403,
        RD: {
          ok: false,
          signature: "",
          payload: client_hash,
          error: "Block hash mismatch",
        },
      };
    }

    const voteHash = crypto
      .createHash("sha256")
      .update(client_hash)
      .digest("hex");

    const signer = crypto.createSign("RSA-SHA256");
    signer.update(voteHash);
    signer.end();

    const nodeSignature = signer.sign(KeyStore.getPrivateKey, "base64");

    return {
      RC: 200,
      RM: "Vote accepted",
      RD: {
        ok: true,
        payload: client_hash,
        signature: nodeSignature,
        error: "",
      },
    };
  } catch (error) {
    console.error(error);
    return {
      RM: "internal server error!",
      RC: 500,
    };
  }
};

function recomputeBlockHash(block) {
  const raw = [
    String(block.Height),
    block.PreviousHash ?? "GENESIS",
    block.current_id,
    block.Owner_id ?? "",
    block.Version ?? "",
    block.type ?? "",
    block.MerkleRoot ?? "",
  ].join("|");

  return crypto.createHash("sha256").update(raw).digest("hex");
}

const create_new_block = async (db, payload, node_info, timestamp) => {
  try {
    console.log("payload: ", payload);
    const {
      original_value,
      version,
      Owner_id,
      current_id,
      type,
      status,
      hash,
    } = payload;
    const latestBlock = await get_latest_block(db);

    const height = latestBlock ? latestBlock.Height + 1 : 1;
    const MerkleRoot = hash ? hash : "";
    const previousHash = latestBlock ? latestBlock.Hash : "GENESIS";
    const raw = [
      height,
      previousHash,
      current_id,
      Owner_id,
      version,
      type,
      MerkleRoot,
    ].join("|");

    const product_hash = recomputeBlockHash({
      Height: height,
      PreviousHash: previousHash,
      current_id: current_id,
      Owner_id: Owner_id,
      MerkleRoot: MerkleRoot,
      Creator: node_info.node_id,
      Version: version,
    });

    const newBlock = {
      Height: height,
      PreviousHash: previousHash,
      Hash: product_hash,
      type: type,
      current_id: current_id,
      Owner_id: Owner_id,
      status: status,
      Timestamp: timestamp,
      MerkleRoot: MerkleRoot ? MerkleRoot : "",
      Creator: node_info.node_id,
      Version: version,
      original_value: original_value,
    };

    await db.Block.create(newBlock);
    return {
      ok: true,
      block_hash: product_hash,
      height: height,
      previous: previousHash,
      type: "admin",
      validator: node_info.node_id,
    };
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      block_hash: "",
      height: "",
      previous: "",
      validator: "",
      type: "admin",
    };
  }
};

const create_new_user = async (db, payload, node_info, timestamp) => {
  try {
    const { id, hash, type, version } = payload;
    const latestBlock = await get_latest_block(db);

    const height = latestBlock ? latestBlock.Height + 1 : 1;
    const previousHash = latestBlock ? latestBlock.Hash : "GENESIS";
    const raw = [height, previousHash, id, "", version, type, hash].join("|");

    const user_hash = crypto.createHash("sha256").update(raw).digest("hex");

    const newBlock = {
      Height: height,
      PreviousHash: previousHash,
      Hash: user_hash,
      type: type,
      current_id: id,
      Owner_id: "",
      status: "active",
      Timestamp: timestamp,
      MerkleRoot: hash,
      Creator: node_info.node_id,
      Version: version,
      original_value: "",
    };

    await db.Block.create(newBlock);
    return {
      ok: true,
      type: "admin",
      block_hash: user_hash,
      height: height,
      previous: previousHash,
      validator: node_info.node_id,
    };
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      type: "admin",
      block_hash: "",
      height: "",
      previous: "",
      validator: "",
    };
  }
};

const get_global_node = async (db, timestamp, node_info) => {
  try {
    const latestBlock = await get_latest_block(db);
    if (latestBlock) {
      return {
        ok: true,
        block: {
          type: "admin",
          ok: true,
          height: latestBlock.Height,
          block_hash: latestBlock.Hash,
          previous: latestBlock.PreviousHash,
          validator: node_info.node_id,
        },
      };
    } else {
      return {
        ok: false,
        block: "",
      };
    }
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      block: "",
    };
  }
};

const getBlocksRequest = async (db, from, limit) => {
  try {
    if (!Number.isInteger(from) || from < 0) {
      return {
        message: "from height not valid",
        ok: false,
        blocks: [],
      };
    }

    if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
      return {
        message: "limit not valid",
        ok: false,
        blocks: [],
      };
    }

    const startHeight = from;
    const endHeight = from + limit;

    const blocks = await db.Block.findAll({
      where: {
        height: {
          [db.Sequelize.Op.gte]: startHeight,
          [db.Sequelize.Op.lte]: endHeight,
        },
      },
      order: [["height", "ASC"]],
    });

    if (!blocks || blocks.length === 0) {
      return {
        message: "no block in range",
        ok: true,
        blocks: [],
      };
    }

    return {
      message: "get block complete",
      ok: true,
      blocks,
    };
  } catch (error) {
    console.error("[getBlocksRequest ERROR]", error);
    return {
      message: "internal server error",
      ok: false,
      blocks: [],
    };
  }
};

const delete_latest_block = async (db) => {
  try {
    const latest_block = await get_latest_block(db);
    if (!latest_block) {
      return {
        ok: false,
        message: "chain empty!",
      };
    }

    const count = await db.Block.count();

    if (count != latest_block.Height) {
      await nodeModeManager.setMode("fork", db);

      return {
        ok: false,
        height: latest_block.Height,
        count: count,
        message: "fork",
      };
    }

    await latest_block.destroy({ force: true });

    return {
      ok: true,
      deletedHeight: latest_block.Height,
    };
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      message: error,
    };
  }
};

const getAnchorBlock = async (db, limit) => {
  try {
    if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) {
      return {
        ok: false,
        message: "invalid limit",
      };
    }

    const anchorBlock = await db.Block.findAll({
      attributes: ["Hash", "Height"],
      order: [["Height", "DESC"]],
      limit: limit,
    });

    if (anchorBlock) {
      return {
        ok: true,
        message: "anchor block list!",
        anchor: anchorBlock,
      };
    } else {
      return {
        ok: false,
        message: "block null",
        anchor: anchorBlock,
      };
    }
  } catch (error) {
    console.log(error);
    return {
      ok: false,
      message: error,
    };
  }
};

const delete_latest = (db) => async (req, res) => {
  try {
    const latest_block = await get_latest_block(db);

    if (!latest_block) {
      return res.status(404).json({
        RM: "no block to delete",
        RC: 404,
      });
    }

    await latest_block.destroy();

    return res.status(200).json({
      RM: "xoa thanh cong",
      RC: 200,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RM: "cant delete latest block",
      RC: 500,
    });
  }
};

const new_fork_block = (db) => async (req, res) => {
  try {
    const node_info = await db.Node_Info.findOne({
      where: { id: 1 },
    });
    const time = Date.now();
    const {
      original_value,
      hash,
      version,
      Owner_id,
      current_id,
      type,
      status,
    } = req.body;

    const payload = {
      original_value,
      version,
      Owner_id,
      current_id,
      type,
      status,
      hash,
    };

    const re = await create_new_block(db, payload, node_info, time);
    return res.status(200).json({
      RM: "return",
      RC: 200,
      RD: re,
    });
  } catch (error) {
    return res.status(500).json({
      RM: "cant new latest block",
      RC: 500,
    });
  }
};

export default {
  recomputeBlockHash,
  getAnchorBlock,
  delete_latest,
  get_nodestatus,
  get_global_node,
  get_node_new_vote,
  delete_latest_block,
  getBlocksRequest,
  vetify_signature,
  get_vote,
  get_block_status_currentid,
  get_block_by_height,
  create_new_block,
  create_new_user,
  get_latest_block,
  new_fork_block,
  signature_data,
};
