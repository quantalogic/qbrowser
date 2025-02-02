import path from 'path';
import { fileURLToPath } from 'url';
import CopyPlugin from 'copy-webpack-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  mode: 'production', // Changed to production
  entry: {
    background: './src/background/main.ts',
    content: './src/content/content.ts'
  },
  devtool: 'source-map', // Changed from inline-source-map
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  optimization: {
    minimize: true,
    moduleIds: 'deterministic'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: '.' }
      ]
    })
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  }
};