const path = require("path");
const { WebpackManifestPlugin } = require("webpack-manifest-plugin");
const WebpackShellPluginNext = require("webpack-shell-plugin-next");

module.exports = {
  devtool: "source-map",
  entry: "./src/index.js",
  output: {
    path: path.resolve(__dirname, "../omero_boost/static/omero_boost/assets/"),
    filename: "main.[contenthash].js",
  },
  mode: "development", // Switch to 'production' for optimized builds
  plugins: [
    new WebpackManifestPlugin({
      fileName: path.resolve(
        __dirname,
        "../omero_boost/static/omero_boost/assets/asset-manifest.json"
      ),
      publicPath: "/omero_boost/assets/",
    }),
    new WebpackShellPluginNext({
      onAfterDone: {
        scripts: ["bash ../omero-update.sh"], // Run on every rebuild during watch
        blocking: false,
        parallel: false,
      },
      onBeforeCompile: {
        scripts: [
          "rm -rf ../omero_boost/static/omero_boost/assets/*",
          "echo 'Cleaning up'",
        ],
      },
    }),
  ],
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/, // Match both .js and .jsx files
        exclude: /node_modules/, // Exclude node_modules directory
        use: {
          loader: "babel-loader", // Use Babel to transpile JavaScript
        },
      },
      {
        test: /\.css$/,
        use: [
          "style-loader", // Injects styles into DOM
          "css-loader", // Resolves @import and url()
          {
            loader: "postcss-loader", // Processes Tailwind CSS
            options: {
              postcssOptions: {
                plugins: [require("tailwindcss"), require("autoprefixer")],
              },
            },
          },
        ],
      },
      {
        test: /\.svg$/,
        use: ["file-loader"], // Handle .svg as static files
      },
    ],
  },
  resolve: {
    extensions: [".js", ".jsx"], // Automatically resolve these extensions
  },
};
