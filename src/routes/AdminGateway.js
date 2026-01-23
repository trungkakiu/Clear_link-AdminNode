import express from "express";
import api_controller from "../controller/api_controller.js";

const router = express.Router();

const AdminGateway = (app, db) => {
  router.get("status", (req, res) => {
    res.json({ status: "Admin Gateway is running" });
  });
  router.get(
    "/node-base-infomation/get-info",
    api_controller.get_nodestatus(db)
  );

  router.post(
    "/node-base-infomation/delete-latest",
    api_controller.delete_latest(db)
  );

  router.post(
    "/node-base-infomation/new-forkblock",
    api_controller.new_fork_block(db)
  );
  return app.use("/admin/node/", router);
};

export default AdminGateway;
