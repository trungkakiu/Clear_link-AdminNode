import WebSocket from "ws";
import fs from "fs";
import path from "path";
import api_controller from "./src/controller/api_controller.js";
import nodeModeManager from "./src/controller/Node_mode_state.js";
import {
  Active_route_ws,
  Fork_route_ws,
  Maintenance_route_ws,
  Public_route_ws,
  sync_route_ws,
  wsGateway,
} from "./src/controller/ws_gateway.js";
import startModeLoop from "./src/controller/Node_mode_area.js";
import { time, timeStamp } from "console";

let wsInstance = null;

export let session_id = null;
export default async function connectToMetaGateway(nodeConfig, db) {
  const metaWsUrl = "ws://192.168.110.197:5099";
  const node_info_list = await db.Node_Info.findAll({});
  const node_info = node_info_list[0];
  const node_id = node_info.node_id;
  const node_status = node_info.status;

  let reconnectTimer = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_DELAY = 30_000;

  function scheduleReconnect(startFn) {
    if (reconnectTimer) return;

    const delay = Math.min(3000 * ++reconnectAttempts, MAX_RECONNECT_DELAY);

    console.log(`WS reconnect sau ${delay / 1000}s...`);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      startFn();
    }, delay);
  }

  const start = async () => {
    try {
      if (node_info.length === 0) {
        console.log("Node_Info rỗng → thử lại sau 3 giây...");
        return setTimeout(start, 3000);
      }
    } catch (err) {
      console.log("DB chưa sẵn sàng → thử lại sau 3 giây...");
      return setTimeout(start, 3000);
    }

    console.log("Kết nối MetaGateway WS:", metaWsUrl);
    const ws = new WebSocket(metaWsUrl, {
      perMessageDeflate: false,
    });
    wsInstance = ws;
    wsGateway.set(ws);

    ws.on("open", async () => {
      console.log("WS OPEN → gửi init...");
      reconnectAttempts = 0;
      const latestBlock = await api_controller.get_latest_block(db);
      const time_now = Date.now();
      const signature = await api_controller.signature_data(node_id, time_now);
      if (latestBlock) {
        ws.send(
          JSON.stringify({
            type: "init",
            nodeId: node_id,
            height: latestBlock.Height,
            hash: latestBlock.Hash,
            node_status: node_status,
            role: "admin_validator",
            node_type: "admin",
            signature: signature,
            timestamp: time_now,
          }),
        );
      } else {
        ws.send(
          JSON.stringify({
            type: "init",
            nodeId: node_id,
            height: 0,
            hash: "GENESIS",
            node_status: node_status,
            role: "admin_validator",
            node_type: "admin",
            signature: signature,
            os: Date.now(),
            timestamp: time_now,
          }),
        );
      }
    });

    ws.on("message", async (raw) => {
      try {
        const node_mode = nodeModeManager.getMode();
        const session_id = await nodeModeManager.getSessionId();
        const msg = JSON.parse(raw.toString());
        console.log("WS → AdminNode:", JSON.stringify(msg, null, 2));

        ws.send(
          JSON.stringify({
            type: "client_log",
            node_mode: node_mode,
            sessionId: msg.sessionId,
            command: `[ADMIN] - [${node_id}] RECEIVER`,
            nodeId: node_id,
            content: msg,
          }),
        );

        await Public_route_ws(msg, ws, db, node_info);
        switch (node_mode) {
          case "active": {
            await Active_route_ws(msg, ws, db, node_info);
            break;
          }

          case "fork": {
            await Fork_route_ws(msg, ws, db, node_info);
            break;
          }

          case "syncing": {
            await sync_route_ws(msg, ws, db, node_info);
            break;
          }

          case "maintenance": {
            await Maintenance_route_ws(msg, ws, db, node_info);
            break;
          }
        }
      } catch (err) {
        console.log("Message parse error:", err);
        return;
      }
    });

    ws.on("close", (code, reason) => {
      console.log("WS CLOSE", {
        code,
        reason: reason?.toString(),
      });

      wsInstance = null;
      wsGateway.set(null);
      nodeModeManager.setSessionId("");
      scheduleReconnect(start);
    });

    ws.on("error", (err) => {
      console.log("WS lỗi:", err.message);
    });
  };

  start();
}
