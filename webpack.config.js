//@ts-checks
'use strict';

const path = require(`path`);
const webpack = require(`webpack`);

/** @typedef {import('webpack').Configuration} WebpackConfig **/

/**@type WebpackConfig*/
module.exports = {
  mode: `none`, // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
  target: `node`, // extensions run in a node context
  node: {
    __dirname: false // leave the __dirname-behaviour intact
  },
  context: path.join(__dirname),
  resolve: {
    // Add `.ts` as a resolvable extension.
    extensions: [".ts", ".js"],
    // Add support for TypeScripts fully qualified ESM imports.
    extensionAlias: {
      ".js": [".js", ".ts"],
      ".cjs": [".cjs", ".cts"],
      ".mjs": [".mjs", ".mts"]
    }
  },
  module: {
    rules: [
      {
        test: /\.([cm]?ts|tsx)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: `esbuild-loader`
          }
        ]
      }
    ]
  },
  entry: {
    extension: `./index.ts`,
  },
  output: {
    filename: path.join(`index.js`),
    path: path.join(__dirname, `dist`),
    library: {
      "type": "commonjs"
    }
  },
  // yes, really source maps
  devtool: `source-map`,
  plugins: [
    new webpack.IgnorePlugin({ resourceRegExp: /(bufferutil|utf-8-validate)/u })
  ]
}; 