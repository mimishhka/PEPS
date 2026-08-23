// craco.config.js
const path = require("path");
require("dotenv").config();

// Check if we're in development/preview mode (not production build)
// Craco sets NODE_ENV=development for start, NODE_ENV=production for build
const isDevServer = process.env.NODE_ENV !== "production";

// Environment variable overrides
const config = {
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
};

function makeDevServerV5Compatible(devServerConfig) {
  const {
    https,
    onAfterSetupMiddleware,
    onBeforeSetupMiddleware,
    onListening,
    setupMiddlewares,
    ...compatibleConfig
  } = devServerConfig;

  compatibleConfig.server =
    typeof https === "object"
      ? { type: "https", options: https }
      : https
        ? "https"
        : "http";
  compatibleConfig.headers = {
    ...compatibleConfig.headers,
    "Cross-Origin-Resource-Policy": "same-origin",
  };

  if (onBeforeSetupMiddleware || setupMiddlewares) {
    compatibleConfig.setupMiddlewares = (middlewares, devServer) => {
      if (onBeforeSetupMiddleware) {
        onBeforeSetupMiddleware(devServer);
      }

      return setupMiddlewares
        ? setupMiddlewares(middlewares, devServer)
        : middlewares;
    };
  }

  compatibleConfig.onListening = (devServer) => {
    devServer.close ??= (callback) => devServer.stopCallback(callback);

    if (onListening) {
      onListening(devServer);
    }
    if (onAfterSetupMiddleware) {
      onAfterSetupMiddleware(devServer);
    }
  };

  return compatibleConfig;
}

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

let webpackConfig = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],

      /* env plutot qu'une liste de globaux ecrite a la main.
       *
       * `browser` fournit Blob, CustomEvent, IntersectionObserver, Event et
       * tout le reste — ce sont precisement les 24 faux positifs du premier
       * passage de no-undef. `jest` couvre describe / it / expect dans les
       * fichiers de test.
       *
       * Une liste manuelle serait a completer indefiniment, et chaque oubli
       * casserait le build sur du code parfaitement valide. */
      env: { browser: true, es2021: true, node: true, jest: true },

      globals: {
        /* Trois globaux du navigateur REMIS EN ERREUR, deliberement.
         *
         * env.browser les declare, ce qui est correct en general — mais ce
         * projet a son propre dialogue, useConfirm. C'est en oubliant
         * `const confirm = useConfirm()` dans OrderDetail que trois actions
         * destructrices — mise a la corbeille, annulation d'etiquette — ont
         * fini par afficher « [object Object] » : le confirm natif recevait
         * un objet la ou il attend une chaine, sans qu'aucune erreur ne soit
         * levee.
         *
         * Les remettre a "off" fait echouer le build sur ce piege plutot que
         * de le laisser passer en silence. Meme politique que dans
         * eslint.config.js, qui sert aux passages manuels. */
        confirm: "off",
        alert: "off",
        prompt: "off",
      },

      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",

        /* Activee apres verification : `yarn lint` remonte 0 erreur. Elle
         * peut donc bloquer le build sans rien casser aujourd'hui.
         *
         * Ce qu'elle a trouve au premier passage, et qu'aucun controle de
         * syntaxe ne voyait : L appele dans AdminStaff alors qu'il n'etait
         * defini que dans un composant plus bas du meme fichier — quinze
         * appels qui plantaient au rendu. */
        "no-undef": "error",
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {

      // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
        ],
      };

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }
      return webpackConfig;
    },
  },
};

webpackConfig.devServer = (devServerConfig) => {
  // Add health check endpoints if enabled
  if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      // Call original setup if exists
      if (originalSetupMiddlewares) {
        middlewares = originalSetupMiddlewares(middlewares, devServer);
      }

      // Setup health endpoints
      setupHealthEndpoints(devServer, healthPluginInstance);

      return middlewares;
    };
  }

  return devServerConfig;
};

// Wrap with visual edits (automatically adds babel plugin, dev server, and overlay in dev mode)
if (isDevServer) {
  try {
    const { withVisualEdits } = require("@emergentbase/visual-edits/craco");
    webpackConfig = withVisualEdits(webpackConfig);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && err.message.includes('@emergentbase/visual-edits/craco')) {
      console.warn(
        "[visual-edits] @emergentbase/visual-edits not installed — visual editing disabled."
      );
    } else {
      throw err;
    }
  }
}

const configureDevServer = webpackConfig.devServer;
webpackConfig.devServer = (devServerConfig) => {
  const cfg = makeDevServerV5Compatible(configureDevServer(devServerConfig));
  // Proxy /api and /uploads to backend so CORS is never an issue in dev/preview
  // webpack-dev-server v5 exige un tableau, plus un objet.
  cfg.proxy = [
    { context: ["/api"], target: "http://localhost:8001", changeOrigin: false },
    { context: ["/uploads"], target: "http://localhost:8001", changeOrigin: false },
  ];
  return cfg;
};

module.exports = webpackConfig;
