// src/core/runtime/modeLoop.js
import Node_mode from "./Node_mode.js";
import nodeModeManager from "./Node_mode_state.js";

class ModeRunner {
  constructor() {
    this.interval = null;
  }

  start(fn, delay) {
    this.stop();
    this.interval = setInterval(fn, delay);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

const modeRunner = new ModeRunner();

export default function startModeLoop(db) {
  try {
    modeRunner.stop();
    switch (nodeModeManager.getMode()) {
      case "active":
        modeRunner.start(() => {
          Node_mode.ActiveMode(db);
        }, 30000);
        break;

      case "syncing":
        modeRunner.start(() => {
          Node_mode.syncBlocks(db);
        }, 5000);

        break;

      case "fork":
        modeRunner.start(() => {
          Node_mode.Forkmode(db);
        }, 5000);

      case "maintenance":
        Node_mode.MaintenancMode(db);
        break;
    }
  } catch (error) {
    console.error(error);
  }
}
