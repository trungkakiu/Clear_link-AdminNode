import fs from "fs";
import path from "path";
import { Sequelize, DataTypes } from "sequelize";
import { fileURLToPath, pathToFileURL } from "url";
import KeyStore from "../core/security/KeyStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function loadValidatorDB(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Không tìm thấy file config: ${configPath}`);
  }

  const nodeConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  KeyStore.initKeyStore(nodeConfig);

  const sequelize = new Sequelize(
    nodeConfig.db.name,
    nodeConfig.db.user,
    nodeConfig.db.pass,
    {
      host: nodeConfig.db.host,
      port: nodeConfig.db.port,
      dialect: "mysql",
      logging: false,
    },
  );

  const db = {};
  const modelDir = __dirname;
  const files = fs
    .readdirSync(modelDir)
    .filter(
      (file) =>
        file.endsWith(".js") &&
        file !== path.basename(__filename) &&
        !file.endsWith(".test.js"),
    );

  for (const file of files) {
    const modelPath = path.join(modelDir, file);
    const moduleUrl = pathToFileURL(modelPath).href;
    const modelModule = await import(moduleUrl);
    const model = modelModule.default(sequelize, DataTypes);
    db[model.name] = model;
  }

  Object.keys(db).forEach((modelName) => {
    if (db[modelName].associate) db[modelName].associate(db);
  });

  try {
    await sequelize.sync({ alter: true });
    console.log("[Database] Validator DB & Indexes synced successfully.");
  } catch (error) {
    console.error("[Database] Sync Error:", error);
  }

  db.sequelize = sequelize;
  db.Sequelize = Sequelize;

  return db;
}
