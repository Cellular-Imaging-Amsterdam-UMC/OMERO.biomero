const path = require("path");
const { WebpackManifestPlugin } = require("webpack-manifest-plugin");

module.exports = (env, argv) => {
  const outputPath = path.resolve(
    __dirname,
    "../omero_biomero/static/omero_biomero/assets/"
  );
  const plugins = [
    new WebpackManifestPlugin({
      fileName: path.resolve(
        __dirname,
        "../omero_biomero/static/omero_biomero/assets/asset-manifest.json"
      ),
      publicPath: "/omero_biomero/assets/",
    }),
  ];

  return {
    devtool: "source-map",
    entry: "./src/index.js",
    output: {
      path: outputPath,
      filename: "main.js",
      chunkFilename: "[name].js",
      publicPath: "auto",
    },
    mode: (argv && argv.mode) || "development",
    plugins,
    devServer: {
      host: "0.0.0.0",
      port: 8081,
      allowedHosts: "all",
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      hot: false,
      liveReload: true,
      devMiddleware: {
        writeToDisk: false,
      },
      static: {
        directory: outputPath,
        publicPath: "/",
        watch: false,
      },
      client: {
        overlay: true,
      },
    },
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
};
