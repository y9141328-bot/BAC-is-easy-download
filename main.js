const { app, BrowserWindow, Menu, Tray, nativeImage, session, shell } = require('electron');
const path = require('path');
app.setAppUserModelId('dz.bac.companion');

if (!app.requestSingleInstanceLock()) app.quit();

let win, tray, quitting = false;

function isHttpUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:'; }
  catch { return false; }
}

function showWindow() {
  if (!win) return createWindow(false);
  win.show(); win.focus();
}

function createWindow(hidden) {
  win = new BrowserWindow({
    width: 1100, height: 760, title: 'BAC is easy', autoHideMenuBar: true,
    minWidth: 760, minHeight: 600,
    show: !hidden,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      backgroundThrottling: false,
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type === 'keyDown' && (i.key === 'F5' || (i.control && i.key.toLowerCase() === 'r'))) {
      win.webContents.reloadIgnoringCache(); e.preventDefault();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // The local application only needs microphone access for recording and notifications.
  // Deny every other permission by default instead of approving all permission requests.
  const localSession = win.webContents.session;
  localSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const fromApp = wc.getURL().startsWith('file://');
    const allowed = fromApp && ['media', 'notifications'].includes(permission);
    callback(Boolean(allowed));
  });

  // Closing the window keeps the reminder service running in the tray, as before.
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
}

app.on('second-instance', showWindow);

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  // Persistent session used by the embedded AI websites.
  const ps = session.fromPartition('persist:ai');
  ps.setUserAgent(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`);
  const trustedAiHosts = new Set(['chatgpt.com', 'www.chatgpt.com', 'gemini.google.com', 'claude.ai', 'www.claude.ai']);
  const trustedRequest = (details) => {
    try { return trustedAiHosts.has(new URL(details.requestingUrl).hostname); }
    catch { return false; }
  };
  ps.setPermissionRequestHandler((wc, permission, callback, details) => {
    const allowedPermissions = ['media', 'clipboard-read', 'clipboard-sanitized-write'];
    callback(Boolean(trustedRequest(details) && allowedPermissions.includes(permission)));
  });
  ps.setPermissionCheckHandler((wc, permission, requestingOrigin) => {
    try {
      const host = new URL(requestingOrigin).hostname;
      return trustedAiHosts.has(host) && ['media', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission);
    } catch { return false; }
  });

  app.setLoginItemSettings({ openAtLogin: true });
  const startedHidden = app.getLoginItemSettings().wasOpenedAtLogin;
  createWindow(startedHidden);

  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 20, height: 20 }));
  tray.setToolTip('BAC - التذكيرات تعمل في الخلفية');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'فتح التطبيق', click: showWindow },
    { label: 'تحديث الواجهة', click: () => win && win.webContents.reloadIgnoringCache() },
    { label: 'إنهاء (إيقاف الإشعارات)', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', showWindow);
});

app.on('window-all-closed', () => {}); // Keep running in the background for reminders.
