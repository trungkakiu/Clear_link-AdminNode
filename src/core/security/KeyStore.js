let PRIVATE_KEY = null;
let PUBLIC_KEY = null;
let NODE_ID = null;

function initKeyStore(configs) {
  if (PRIVATE_KEY) {
    throw new Error("KeyStore already initialized");
  }

  if (!configs?.security?.private_key) {
    throw new Error("Missing private_key in config");
  }

  PRIVATE_KEY = configs.security.private_key;
  PUBLIC_KEY = configs.security.public_key || null;
  NODE_ID = configs.node_id || null;
}

function getPrivateKey() {
  if (!PRIVATE_KEY) {
    throw new Error("Private key not initialized");
  }
  return PRIVATE_KEY;
}

function getPublicKey() {
  return PUBLIC_KEY;
}

function getNodeId() {
  return NODE_ID;
}

export default {
  initKeyStore,
  getPrivateKey,
  getPublicKey,
  getNodeId,
};
