import startModeLoop from "./Node_mode_area.js";

class NodeModeManager {
  constructor() {
    this.mode = "active";
    this.session_id = null;
    this.requestId = null;
  }

  async setMode(newMode, db) {
    try {
      console.log(`[MODE] ${this.mode} -> ${newMode}`);

      const node = await db.Node_Info.findOne();
      if (node) {
        await node.update({ status: newMode });
      }
      console.log(`[MODE START] ${this.mode} -> ${newMode}`);
      this.mode = newMode;
      startModeLoop(db);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
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
