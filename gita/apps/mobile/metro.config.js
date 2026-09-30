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

// The workspace packages use ESM-style specifiers (`./theme.js` for `theme.ts`), which tsc and
// Node accept but Metro resolves literally. Resolve as written first (so node_modules is
// unaffected); only if that fails, retry a relative `.js` import without its extension so Metro
// finds the `.ts` source.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (err) {
    if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
      return context.resolveRequest(context, moduleName.slice(0, -3), platform);
    }
    throw err;
  }
};

module.exports = config;
