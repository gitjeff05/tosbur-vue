module.exports = {
  pluginOptions: {
    electronBuilder: {
      preload: 'src/preload.js',
      nodeIntegration: false,
      contextIsolation: true
    }
  }
};
