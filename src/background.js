'use strict'

const path = require('path');
import url from 'url';
import { access } from 'fs';
import { app, protocol, BrowserWindow, BrowserView, ipcMain } from 'electron'
import installExtension, { VUEJS3_DEVTOOLS } from 'electron-devtools-installer'
import { hasUncaughtExceptionCaptureCallback } from 'process';
const assert = require('assert').strict;
const isDevelopment = process.env.NODE_ENV !== 'production'

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
])

const webPreferences = {

  // Use pluginOptions.nodeIntegration, leave this alone
  // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
  nodeIntegration: process.env.ELECTRON_NODE_INTEGRATION,
  contextIsolation: !process.env.ELECTRON_NODE_INTEGRATION,
  preload: path.join(__dirname, 'preload.js')
}

// Make sure to disable the nodeIntegration and enable contextIsolation.
// https://github.com/electron/electron/blob/265474882c839c8fdeed1917cf3b6671221aa468/docs/tutorial/security.md#isolation-for-untrusted-content
assert(webPreferences.contextIsolation, 'Expect that contextIsolation is set to true');
assert(!webPreferences.nodeIntegration, 'Expect that nodeIntegration is disabled');

const showDevTools = false

let win;

async function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    titleBarStyle: 'hiddenInset',
    webPreferences
  })

  // Load the url of the dev server if in development mode
  // Otherwise load from dist
  if (process.env.WEBPACK_DEV_SERVER_URL) {
    await win.loadURL("http://localhost:3000")
    if (!process.env.IS_TEST && showDevTools) win.webContents.openDevTools()
  } else {
    const uri = url.pathToFileURL('./static/dist/index.html')
    access(uri, (err) => {
      console.log(`${uri} ${err ? 'does not exist' : 'exists'}`);
    });
    win.loadURL(uri.href)
  }

  win.maximize();

  let view = new BrowserView();

  ipcMain.on('destroy-embedded-view', async (event, arg) => {
    // TODO: will completely destroy the embedded view
    view.webContents.destroy();
  })

  function showEmbeddedView() {
    let [width, height] = win.getSize();
    height = showDevTools ? Math.floor(height / 2) : height;
    view.setBounds({ x: 36, y: 64, width: width - 36, height: height });
  }

  ipcMain.on('hide-embedded-view', async (event, arg) => {
    // https://github.com/electron/electron/issues/5110
    // The suggestion in this issue is to hide, set webview CSS to { width: 0px; height: 0px; flex: 0 1; }
    // view.setBounds seems to work just as well
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
  });

  ipcMain.on('show-embedded-view', async () => {
    showEmbeddedView()
  })

  ipcMain.on('open-jupyter', (event, arg) => {
    console.log(`open-jupyter event received in main process ${arg}`);
    win.setBrowserView(view);
    showEmbeddedView()
    let args;
    try {
      args = JSON.parse(arg);
    } catch (e) {
      console.error(e)
      throw e
    }
    console.log(`Loading ${args.ip}`);
    view.webContents.loadURL(args.ip);
  });
}

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    try {
      await installExtension(VUEJS3_DEVTOOLS)
    } catch (e) {
      console.error('Vue Devtools failed to install:', e.toString())
    }
  }
  createWindow()
})

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit()
      }
    })
  } else {
    process.on('SIGTERM', () => {
      app.quit()
    })
  }
}
