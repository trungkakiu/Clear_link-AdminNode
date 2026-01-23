import { exec } from "child_process";

function run_server() {
  for (let i = 1; i <= 6; i++) {
    exec(
      `start powershell -NoExit -Command "title ADMIN_NODE_${i}; $env:NODE_CONFIG='src/configs/validator_admin_${i}.json'; npm start"`
    );
  }
}

run_server();
