import startModeLoop from "./Node_mode_area.js";

class NodeModeManager {
  constructor() {
    this.mode = "active";
    this.session_id = null;
    this.requestId = null;
    this.modeChangeQueue = Promise.resolve();
    this.blockCreationQueue = Promise.resolve();
  }

  async setMode(newMode, db) {
    this.modeChangeQueue = this.modeChangeQueue.then(async () => {
      try {
        if (this.mode === newMode) {
          return true;
        }

        console.log(`[QUEUE] Processing change: ${this.mode} -> ${newMode}`);

        const node = await db.Node_Info.findOne();
        if (node) {
          await node.update({ status: newMode });
        }

        console.log(`[MODE START] Switched to: ${newMode}`);
        this.mode = newMode;

        startModeLoop(db);

        return true;
      } catch (error) {
        console.error("[MODE QUEUE ERROR]", error);
        return false;
      }
    });

    return this.modeChangeQueue;
  }

  async setSessionId(session_id) {
    this.session_id = session_id;
  }

  async setrequestId(requestId) {
    this.requestId = requestId;
  }

  async getrequestId() {
    return this.requestId;
  }
  async getSessionId() {
    return this.session_id;
  }

  getMode() {
    return this.mode;
  }

  is(mode) {
    return this.mode === mode;
  }
}

const nodeModeManager = new NodeModeManager();
export default nodeModeManager;
