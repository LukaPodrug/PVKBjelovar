// Monorepo-aware Metro config. The repo root hoists a different react-native/react than this app
// pins (Expo SDK 54), so we resolve this project's node_modules FIRST and disable the default
// upward hierarchical lookup — otherwise Metro bundles the wrong react-native copy and codegen fails.
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
config.resolver.disableHierarchicalLookup = true;

// Hard-pin the frameworks to THIS app's copies so a transitive require can never pull the
// mismatched react-native/react hoisted at the repo root.
const forcedModules = {
  "react-native": require.resolve(path.join(projectRoot, "node_modules/react-native")),
  react: require.resolve(path.join(projectRoot, "node_modules/react")),
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (forcedModules[moduleName]) {
    return { type: "sourceFile", filePath: forcedModules[moduleName] };
  }

  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
