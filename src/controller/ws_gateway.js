import {
  runtimeState,
  runtimeStateFork,
} from "../../validator_admin_server.mjs";
import { session_id } from "../../ws_client.js";

import api_controller from "./api_controller.js";
import nodeModeManager from "./Node_mode_state.js";

let wsInstance = null;
let handshakeDone = false;
export const wsGateway = {
  set(ws) {
    wsInstance = ws;
  },

  get() {
    return wsInstance;
  },

  isReady() {
    return wsInstance && wsInstance.readyState === 1;
  },

  send(payload) {
    if (!wsInstance || wsInstance.readyState !== 1) {
      console.warn("[WS] not ready, drop message:", payload.type);
      return false;
    }

    wsInstance.send(JSON.stringify(payload));
    return true;
  },
};

export const Maintenance_route_ws = async (msg, ws, db, node_info) => {
  try {
  } catch (error) {
    console.error(error);
    ws.send(
      JSON.stringify({
        type: "client_log",
        sessionId: nodeModeManager.getSessionId(),
        command: `[ERROR] - [${node_info.node_id}]`,
        error: error,
      }),
    );
  }
};

export const Public_route_ws = async (msg, ws, db, node_info) => {
  try {
    if (msg.type === "connected") {
      const status = msg.status;
      const sessionId = msg.sessionId;
      if (!sessionId) {
        console.error("sessionId not found");
        return;
      }
      if (handshakeDone) {
        return;
      }
      handshakeDone = true;

      if (!status) {
        ws.send(
          JSON.stringify({
            type: "client_log",
            sessionId: sessionId,
            command: `[ERROR] - [${node_info.node_id}]: status not found`,
            nodeId: node_info.node_id,
            content: msg,
          }),
        );
        return;
      }

      const MODE_MAP = {
        fork: "fork",
        active: "active",
        syncing: "syncing",
        down: "down",
      };

      const normalizedStatus = String(status || "")
        .toLowerCase()
        .trim();

      const nextMode = MODE_MAP[normalizedStatus];
      if (!nextMode) {
        ws.send(
          JSON.stringify({
            type: "client_log",
            sessionId: sessionId,
            command: `[ERROR] - [${node_info.node_id}]: status not found`,
            nodeId: node_info.node_id,
            content: msg,
          }),
        );
        return;
      }
      console.log("sessionId: ", sessionId);
      await nodeModeManager.setSessionId(sessionId);
      await nodeModeManager.setMode(nextMode, db);
      return;
    }
  } catch (error) {
    console.error(error);
    ws.send(
      JSON.stringify({
        type: "client_log",
        sessionId: nodeModeManager.getSessionId(),
        command: `[ERROR] - [${node_info.node_id}]`,
        error: error,
      }),
    );
  }
};

export const Active_route_ws = async (msg, ws, db, node_info) => {
  try {
    const session_id_current = msg.sessionId;
    console.log("session_id_current: ", session_id_current);
    if (msg.type === "Maintenance") {
      console.log("call maintenance");
      await nodeModeManager.setrequestId(msg.requestId);
      if (nodeModeManager.is("active")) {
        try {
          const modestate = await nodeModeManager.setMode("maintenance", db);
          if (!modestate) {
            return await ws.send(
              JSON.stringify({
                sessionId: session_id_current,
                type: "Maintenance_responese",
                requestId: msg.requestId,
                ok: false,
                nodeId: node_info.node_id,
              }),
            );
          }

          return await ws.send(
            JSON.stringify({
              sessionId: session_id_current,
              type: "Maintenance_responese",
              requestId: msg.requestId,
              ok: true,
              nodeId: node_info.node_id,
            }),
          );
        } catch {
          return await ws.send(
            JSON.stringify({
              sessionId: session_id_current,
              type: "Maintenance_responese",
              ok: false,
              requestId: msg.requestId,
              nodeId: node_info.node_id,
            }),
          );
        }
      }
    }

    if (msg.type === "error") {
      console.error("MetaGateway báo lỗi:", msg.message);
      await ws.close();
    }

    if (msg.type === "command") {
      if (!nodeModeManager.is("active")) {
        await ws.send(
          JSON.stringify({
            sessionId: session_id_current,
            type: "client_log",
            command: `[ERROR] - [${node_info.status}] - [${node_info.node_id}]: Node is not active `,
            nodeId: node_info.node_id,
            content: msg,
          }),
        );
        return;
      }

      if (msg.command == "drop_product") {
        const product_list = msg.payload.approvedIds;
        let drop_map = [];
        for (const p of product_list) {
          const res = await api_controller.drop_block_by_id_type_status(db)(
            p,
            "product_create",
            "active",
          );
          console.log(res);
          drop_map.push({
            block_id: p,
            state: res,
          });
        }

        return await ws.send(
          JSON.stringify({
            type: "drop_response",
            voteRoundId: msg.voteRoundId,
            sessionId: msg.sessionId,
            nodeId: node_info.node_id,
            dropstate: {
              drop_map,
            },
            serverTime: Date.now(),
          }),
        );
      }

      if (msg.command == "drop_precheck_vote") {
        const product_list = msg.payload.products;
        const res = await api_controller.drop_vote(db)(product_list);
        const canonicalVotes = [...res.RD]
          .sort((a, b) => a.product_id.localeCompare(b.product_id))
          .map((v) => ({
            product_id: v.product_id,
            approve: v.approve,
            reason: v.reason,
          }));

        const signature =
          await api_controller.signature_rawdata(canonicalVotes);
        return await ws.send(
          JSON.stringify({
            type: "drop_precheck_vote_ack",
            voteRoundId: msg.voteRoundId,
            sessionId: msg.sessionId,
            nodeId: node_info.node_id,
            votePayload: {
              votes: res.RD,
            },
            signature: signature,
            serverTime: Date.now(),
          }),
        );
      }

      if (msg.command == "get_vote") {
        let res = null;
        const requestId = msg.requestId;
        let payload = msg.payload;
        if (payload.command_type === "new") {
          res = api_controller.get_node_new_vote(
            db,
            payload.Public_key,
            payload.Signature,
            payload.client_hash,
          );
        } else {
          res = api_controller.get_vote(db, payload);
        }

        await ws.send(
          JSON.stringify({
            sessionId: msg.sessionId,
            type: "vote_response",
            command: "vote_result",
            requestId: requestId,
            voteRoundId: msg.voteRoundId,
            nodeId: node_info.node_id,
            payload: res.RD.payload,
            signature: res.RD.signature,
            node_type: "admin",
            ok: res.RD.ok,
            error: res.RD.error,
            time: Date.now(),
          }),
        );
      }

      if (msg.command === "get_block_sync") {
        const fromHeight = msg.from;
        const limit = msg.limit;

        console.log("Yêu cầu đồng bộ khối từ MetaGateway:", fromHeight, limit);

        const blocks = await api_controller.getBlocksRequest(
          db,
          fromHeight,
          limit,
        );

        return await ws.send(
          JSON.stringify({
            type: "get_block_response",
            nodeId: node_info.node_id,
            requestId: msg.requestId,
            sessionId: msg.sessionId,
            ok: blocks.ok,
            node_type: "admin",
            blocks: blocks.blocks,
            time: Date.now(),
          }),
        );
      }

      if (msg.command === "pair_product") {
        const payload = msg.payload.payload;
        if (!payload) {
          return await ws.send(
            JSON.stringify({
              type: "pair_product_response",
              nodeId: node_info.node_id,
              sessionId: msg.sessionId,
              requestId: msg.requestId,
              ok: false,
              message: "payload missing",
              block: "",
              time: Date.now(),
            }),
          );
        }

        const timestamp = msg.payload.timestamp;
        const res = await api_controller.create_new_block(
          db,
          payload,
          node_info,
          timestamp,
        );
        if (res) {
          await ws.send(
            JSON.stringify({
              type: "pair_product_response",
              nodeId: node_info.node_id,
              requestId: msg.requestId,
              sessionId: msg.sessionId,
              ok: res.ok,
              block: res,
              time: Date.now(),
            }),
          );
        } else {
          await ws.send(
            JSON.stringify({
              type: "pair_product_response",
              sessionId: session_id_current,
              requestId: msg.requestId,
              nodeId: node_info.node_id,
              ok: false,
              block: "",
              time: Date.now(),
            }),
          );
        }
      }

      if (msg.command === "pair_user") {
        const payload = msg.payload.user;
        const timestamp = msg.payload.timestamp;

        const res = await api_controller.create_new_user(
          db,
          payload,
          node_info,
          timestamp,
        );

        if (res) {
          await ws.send(
            JSON.stringify({
              type: "pair_user_response",
              sessionId: session_id_current,
              nodeId: node_info.node_id,
              requestId: msg.requestId,
              ok: res.ok,
              block: res,
              time: Date.now(),
            }),
          );
        } else {
          await ws.send(
            JSON.stringify({
              type: "pair_product_response",
              sessionId: session_id_current,
              nodeId: node_info.node_id,
              requestId: msg.requestId,
              ok: false,
              block: "",
              time: Date.now(),
            }),
          );
        }
      }

      if (msg.command === "get_global_node") {
        const timestamp = msg.serverTime;
        const res = await api_controller.get_global_node(
          db,
          timestamp,
          node_info,
        );
        if (res) {
          await ws.send(
            JSON.stringify({
              type: "server_global_node",
              nodeId: node_info.node_id,
              sessionId: msg.sessionId,
              requestId: msg.requestId,
              ok: res.ok,
              block: res.block,
              time: Date.now(),
            }),
          );
        }
      }
    }
  } catch (error) {
    console.error(error);
    await ws.send(
      JSON.stringify({
        type: "client_log",
        command: `[ERROR] - [ADMIN] - [${node_info.node_id}]`,
        nodeId: node_info.node_id,
        message: error,
      }),
    );
  }
};

export const Fork_route_ws = async (msg, ws, db, node_info) => {
  try {
    if (msg.type === "fork_response") {
      const sessionId = msg.sessionId;
      const ok = msg.ok;
      const status = nodeModeManager.getMode();
      if (!ok) {
        runtimeStateFork._syncRetryCount++;
        runtimeStateFork._isSendSyncRequest = false;

        return await ws.send(
          JSON.stringify({
            type: "client_log",
            sessionId: sessionId,
            nodeId: node_info.node_id,
            error: "fork response not ok!",
          }),
        );
      }

      if (status != "fork") {
        runtimeStateFork._syncRetryCount++;
        runtimeStateFork._isSendSyncRequest = false;
        return await ws.send(
          JSON.stringify({
            type: "client_log",
            sessionId: sessionId,
            nodeId: node_info.node_id,
            error: "node status not fork!",
          }),
        );
      }

      const fork_point = msg.fork_point;
      const truth_point = msg.truth_point;
      const active = msg.active;
      if (fork_point != -1 && fork_point > 0) {
        const latest_block = await api_controller.get_latest_block(db);
        if (latest_block == null) {
          runtimeStateFork._syncRetryCount++;
          runtimeStateFork._isSendSyncRequest = false;
          return;
        }
        if (fork_point >= latest_block.Height) {
          runtimeStateFork._syncRetryCount++;
          runtimeStateFork._isSendSyncRequest = false;
          return;
        }
        while (true) {
          const latest = await api_controller.get_latest_block(db);
          if (!latest || latest.Height <= fork_point) break;

          const del = await api_controller.delete_latest_block(db);
          if (!del.ok) {
            throw new Error("rollback failed");
          }
        }

        if (truth_point) {
          if (active) {
            await nodeModeManager.setMode("active", db);
          } else {
            await nodeModeManager.setMode("syncing", db);
          }
        } else {
          await nodeModeManager.setMode("fork", db);
        }

        runtimeStateFork._isSendSyncRequest = false;
        runtimeStateFork._syncRetryCount = 0;

        return await ws.send(
          JSON.stringify({
            type: "client_log",
            sessionId: sessionId,
            nodeId: node_info.node_id,
            success: "one step fork complate",
          }),
        );
      } else {
        runtimeStateFork._syncRetryCount++;
        runtimeStateFork._isSendSyncRequest = false;
        return await ws.send(
          JSON.stringify({
            type: "client_log",
            sessionId: sessionId,
            nodeId: node_info.node_id,
            error: "invalid fork point",
          }),
        );
      }
    }
  } catch (error) {
    console.error(error);
    ws.send(
      JSON.stringify({
        sessionId: nodeModeManager.getSessionId(),
        type: "client_log",
        command: `[ERROR] - [${node_info.node_id}]`,
        error: error,
      }),
    );
  }
};

export const sync_route_ws = async (msg, ws, db, node_info) => {
  try {
    if (msg.type === "sync_response") {
      const status = msg.status;
      const syncStatus = msg.sync_status;
      if (!msg.ok) {
        ws.send(
          JSON.stringify({
            type: "client_log",
            sessionId: nodeModeManager.getSessionId(),
            command: `[ERROR] - [${node_info.node_id}] sync_response not ok`,
          }),
        );

        if (syncStatus != "node_outlaw") {
          runtimeState._syncRetryCount++;
          runtimeState._isSendSyncRequest = true;
        }

        return;
      }

      if (status === "fork") {
        await ws.send(
          JSON.stringify({
            type: "client_log",
            sessionId: nodeModeManager.getSessionId(),
            nodeId: node_info.node_id,
            pos: "sync_route_ws",
            message: "node fork!",
          }),
        );

        nodeModeManager.setMode("fork", db);
        return;
      }

      const blocks = msg.blocks;
      if (!Array.isArray(blocks) || blocks.length === 0) {
        await ws.send(
          JSON.stringify({
            type: "client_log",
            sessionId: nodeModeManager.getSessionId(),
            nodeId: node_info.node_id,
            pos: "sync_route_ws",
            message: "no blocks received",
          }),
        );

        runtimeState._syncRetryCount++;
        return;
      }

      blocks.sort((a, b) => a.Height - b.Height);
      const latest_block = await api_controller.get_latest_block(db);
      let expectedHeight = (latest_block?.Height ?? 0) + 1;
      let expectedPrevHash = latest_block?.Hash ?? "GENESIS";

      for (const b of blocks) {
        console.log("b.Height: ", b.Height);
        console.log("expectedHeight: ", expectedHeight);
        if (b.Height != expectedHeight || b.PreviousHash != expectedPrevHash) {
          await ws.send(
            JSON.stringify({
              type: "client_log",
              sessionId: nodeModeManager.getSessionId(),
              nodeId: node_info.node_id,
              pos: "sync_route_ws",
              message: "block validation failed",
            }),
          );
          nodeModeManager.setMode("fork", db);
          return;
        }

        const new_block = await api_controller.create_new_block(
          db,
          b,
          node_info,
          b.Timestamp,
        );
        console.log("new_block: ", new_block);
        if (!new_block.ok) {
          await ws.send(
            JSON.stringify({
              type: "client_log",
              nodeId: node_info.node_id,
              sessionId: nodeModeManager.getSessionId(),
              pos: "sync_route_ws",
              message: `save block ${b.Height} failed`,
            }),
          );
          return;
        }
        ((expectedHeight = b.Height + 1), (expectedPrevHash = b.Hash));
      }
      const valid_status = syncStatus === "complate" ? "active" : "syncing";
      nodeModeManager.setMode(valid_status, db);
      runtimeState._isSendSyncRequest = false;
      await ws.send(
        JSON.stringify({
          type: "client_log",
          nodeId: node_info.node_id,
          sessionId: nodeModeManager.getSessionId(),
          level: "INFO",
          message: "sync_response handled successfully",
          final_height: expectedHeight - 1,
        }),
      );
    }
  } catch (error) {
    console.error(error);
    await ws.send(
      JSON.stringify({
        type: "client_log",
        sessionId: nodeModeManager.getSessionId(),
        command: `[ERROR] - [${node_info.node_id}]`,
        error: error,
      }),
    );
  }
};
