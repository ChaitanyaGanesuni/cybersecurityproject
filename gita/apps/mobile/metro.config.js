// Monorepo-aware Metro config: watch the workspace root and resolve hoisted deps.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// The workspace packages ship TypeScript source; let Metro transpile it.
config.resolver.sourceExts = [...config.resolver.sourceExts, "ts", "tsx"];
module.exports = config;
