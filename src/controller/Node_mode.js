import { Op } from "sequelize";
import { runtimeState } from "../../validator_admin_server.mjs";
import { runtimeStateFork } from "../../validator_admin_server.mjs";

import api_controller from "./api_controller.js";
import nodeModeManager from "./Node_mode_state.js";
import { wsGateway } from "./ws_gateway.js";

const syncBlocks = async (db) => {
  try {
    const now = Date.now();
    const node_info = await db.Node_Info.findOne();
    if (runtimeState._coolDownUntil && now < runtimeState._coolDownUntil) {
      return wsGateway.send({
        type: "client_log",
        nodeId: node_info.node_id,
        message: "cooldown active",
      });
    }
    if (now - runtimeState._lastSyncAttemptAt < 10000) {
      return wsGateway.send({
        type: "client_log",
        nodeId: node_info.node_id,
        message: "sync too frequent",
      });
    }

    if (runtimeState._isSendSyncRequest) {
      return wsGateway.send({
        type: "client_log",
        nodeId: node_info.node_id,
        message: "sync already in flight",
      });
    }

    if (runtimeState._syncRetryCount >= 20) {
      runtimeState._coolDownUntil = now + 20_000;
      runtimeState._syncRetryCount = 0;
      return { RC: 400, RM: "retry limit reached" };
    }

    runtimeState._isSendSyncRequest = true;
    runtimeState._lastSyncAttemptAt = now;

    const latest_block = await api_controller.get_latest_block(db);

    const fromHeight = latest_block ? latest_block.Height : 0;

    wsGateway.send({
      type: "sync_request",
      status: "maintenance_syncing",
      nodeId: node_info.node_id,
      from_height: fromHeight,
      limit: 20,
    });
  } catch (error) {
    console.error(error);
    wsGateway.send({
      type: "client_log",
      pos: "syncBlocks",
      message: error,
    });
  }
};

const ActiveMode = async (db) => {
  try {
    const node_info = await db.Node_Info.findOne({ where: { id: 1 } });
    const latest_block = await api_controller.get_latest_block(db);

    const session_id = nodeModeManager.getSessionId();

    if (!session_id) {
      console.warn("[ActiveMode] sessionId not ready, skip heartbeat");
      return;
    }

    wsGateway.send({
      type: "heartbeat",
      sessionId: session_id,
      nodeId: node_info.node_id,
      status: node_info.status,
      height: latest_block?.Height ?? 0,
      hash: latest_block?.Hash ?? "GENESIS",
      time: Date.now(),
    });
  } catch (error) {
    console.error("[ActiveMode]", error);
  }
};

const Forkmode = async (db) => {
  try {
    const now = Date.now();
    const node_info = await db.Node_Info.findOne();
    if (
      runtimeStateFork._coolDownUntil &&
      now < runtimeStateFork._coolDownUntil
    ) {
      return wsGateway.send({
        type: "client_log",
        nodeId: node_info.node_id,
        message: "cooldown active",
      });
    }

    if (now - runtimeStateFork._lastSyncAttemptAt < 10_000) {
      return wsGateway.send({
        type: "client_log",
        nodeId: node_info.node_id,
        message: "fork too frequent",
      });
    }

    if (runtimeStateFork._isSendSyncRequest) {
      return wsGateway.send({
        type: "client_log",
        nodeId: node_info.node_id,
        message: "fork already in flight",
      });
    }

    if (runtimeStateFork._syncRetryCount >= 20) {
      runtimeStateFork._coolDownUntil = now + 20_000;
      runtimeStateFork._syncRetryCount = 0;
      return wsGateway.send({
        type: "client_log",
        nodeId: node_info.node_id,
        message: "retry limit reached",
      });
    }

    runtimeStateFork._isSendSyncRequest = true;
    runtimeStateFork._lastSyncAttemptAt = now;
    const archor_block = await api_controller.getAnchorBlock(db, 50);
    if (!archor_block.ok) {
      return wsGateway.send({
        type: "client_log",
        nodeId: node_info.node_id,
        message: archor_block.message,
      });
    }

    const latest_block = await api_controller.get_latest_block(db);
    if (!latest_block) {
      return wsGateway.send({
        type: "client_log",
        nodeId: node_info.node_id,
        message: "latest_block not found",
      });
    }

    return wsGateway.send({
      type: "archor_block_fork",
      nodeId: node_info.node_id,
      archor_block: archor_block.anchor,
      height: latest_block.Height,
      status: "fork",
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error(error);
    wsGateway.send({
      type: "client_log",
      pos: "Forkmode",
      error: error,
    });
  }
};

const ForkMaintenance = async (db, forkpoint) => {
  try {
    console.log("START FORK MAINTENANCE");
    if (forkpoint === undefined || forkpoint === null) {
      console.log("FORK MAINTENANCE MISSING FORKPOINT");
      return false;
    }

    while (true) {
      const latest = await api_controller.get_latest_block(db);
      if (!latest) break;

      if (latest.Height <= forkpoint) break;

      const del = await api_controller.delete_latest_block(db);
      if (!del?.ok) {
        throw new Error(`Rollback failed at height ${latest.Height}`);
      }
    }
    console.log("FORK MAINTENANCE MISION COMPALTE");
    await nodeModeManager.setMode("syncing", db);

    return true;
  } catch (error) {
    console.error(error);
    wsGateway.send({
      type: "client_log",
      pos: "Forkmode",
      error: error,
    });
    return false;
  }
};
const MaintenancMode = async (db) => {
  const requestId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const tag = `[MAINT:${requestId}]`;

  const log = (...args) => console.log(tag, ...args);
  const warn = (...args) => console.warn(tag, ...args);
  const errLog = (...args) => console.error(tag, ...args);

  try {
    log("START");

    if (!nodeModeManager.is("maintenance")) {
      warn("Mode check failed. Expected 'maintenance'.");
      wsGateway.send({
        type: "fork_maintenance_response",
        ok: false,
        status: "ENDED",
        pos: "ForkMaintenance",
        message: "Node are trying ForkMaintenance",
        requestId,
      });
      return false;
    }

    wsGateway.send({
      type: "Maintenance_responese",
      ok: true,
      status: "STARTED",
      sessionId: nodeModeManager.getSessionId(),
      message: "Maintenance started",
      requestId,
    });

    const BATCH = 1000;
    let expectedHeight = 1;
    let previousHash = "GENESIS";
    let forkTriggered = false;

    while (true) {
      const from = expectedHeight;
      const to = expectedHeight + BATCH - 1;

      const t0 = Date.now();
      const blocks = await db.Block.findAll({
        where: {
          Height: {
            [Op.between]: [from, to],
          },
        },
        order: [["Height", "ASC"]],
      });

      if (blocks.length === 0) {
        log("No more blocks. Exit loop.");
        break;
      }

      const first = blocks[0];
      const last = blocks[blocks.length - 1];

      for (const b of blocks) {
        let expectedHash;
        try {
          expectedHash = api_controller.recomputeBlockHash(b);
        } catch (e) {
          errLog("recomputeBlockHash failed at height", b.Height, e);
          wsGateway.send({
            type: "fork_maintenance_response",
            ok: false,
            message: `Maintenance error: recompute failed at ${b.Height}`,
            requestId,
          });
          return;
        }

        if (b.Height !== expectedHeight) {
          if (!forkTriggered) {
            forkTriggered = true;

            const t1 = Date.now();
            const maintenance_state = await ForkMaintenance(
              db,
              expectedHeight - 1,
            );

            wsGateway.send({
              type: "fork_maintenance_response",
              ok: !!maintenance_state,
              message: maintenance_state
                ? "Maintenance down complete"
                : "Maintenance down not complete",
              requestId,
              status: "ENDED",
              reason: "HEIGHT_GAP",
              atHeight: expectedHeight,
              gotHeight: b.Height,
            });
            return;
          }

          throw new Error(`HEIGHT_GAP at ${expectedHeight} (got ${b.Height})`);
        }

        if (b.PreviousHash !== previousHash) {
          if (!forkTriggered) {
            forkTriggered = true;

            const t1 = Date.now();
            const maintenance_state = await ForkMaintenance(db, b.Height - 1);

            wsGateway.send({
              type: "fork_maintenance_response",
              ok: !!maintenance_state,
              message: maintenance_state
                ? "Maintenance down complete"
                : "Maintenance down not complete",
              requestId,
              status: "ENDED",
              reason: "PREV_HASH_MISMATCH",
              atHeight: b.Height,
            });
            return;
          }

          throw new Error(`PREV_HASH_MISMATCH at ${b.Height}`);
        }

        if (b.Hash !== expectedHash) {
          if (!forkTriggered) {
            forkTriggered = true;

            const t1 = Date.now();
            const maintenance_state = await ForkMaintenance(db, b.Height - 1);

            wsGateway.send({
              type: "fork_maintenance_response",
              ok: !!maintenance_state,
              message: maintenance_state
                ? "Maintenance down complete"
                : "Maintenance down not complete",
              requestId,
              status: "ENDED",
              reason: "HASH_MISMATCH",
              atHeight: b.Height,
            });
            return;
          }

          throw new Error(`HASH_MISMATCH at ${b.Height}`);
        }

        previousHash = b.Hash;
        expectedHeight++;
      }
    }

    const t2 = Date.now();
    setTimeout(async () => {
      await nodeModeManager.setMode("active", db);
    }, 15000);

    wsGateway.send({
      type: "fork_maintenance_response",
      ok: true,
      status: "ENDED",
      sessionId: nodeModeManager.getSessionId(),
      message: "Maintenance complete with no fork",
      requestId,
    });
  } catch (error) {
    errLog("ERROR:", error?.message ?? error);
    wsGateway.send({
      type: "fork_maintenance_response",
      status: "ENDED",
      sessionId: nodeModeManager.getSessionId(),
      ok: false,
      message: `Maintenance error: ${error?.message ?? "unknown"}`,
      requestId,
    });
  }
};

export default {
  syncBlocks,
  ActiveMode,
  MaintenancMode,
  Forkmode,
};
