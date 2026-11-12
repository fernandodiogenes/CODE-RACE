const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const APP_SCHEME = 'neoncity';
const smokeTest = process.argv.includes('--smoke-test');
const smokeDifficulty = process.env.NEON_CITY_SMOKE_DIFFICULTY === 'easy' ? 'easy' : 'normal';
const smokeUserDataPath = path.join(os.tmpdir(), 'code-race-neon-city-smoke-test');
if (smokeTest) {
  app.setPath('userData', smokeUserDataPath);
}
let protocolRegistered = false;
let smokeTestStarted = false;
const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.glb', 'model/gltf-binary'],
  ['.html', 'text/html; charset=utf-8'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mp4', 'video/mp4'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp']
]);

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

function respond(status, body, contentType = 'text/plain; charset=utf-8') {
  return new Response(body, {
    status,
    headers: { 'Content-Type': contentType }
  });
}

async function serveAppFile(request, appRoot) {
  const url = new URL(request.url);
  if (url.hostname !== 'app') return respond(404, 'Not found');

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return respond(400, 'Invalid path');
  }

  const addonPrefix = '/node_modules/three/examples/jsm/';
  const isPackagedAddon = pathname.startsWith(addonPrefix) &&
    (app.isPackaged || appRoot.endsWith('.asar'));
  const resourceRoot = isPackagedAddon
    ? path.resolve(path.dirname(appRoot), 'three-addons')
    : path.resolve(appRoot);
  const relativePath = isPackagedAddon ? pathname.slice(addonPrefix.length) : `.${pathname}`;
  const filePath = path.resolve(resourceRoot, relativePath);
  const rootPrefix = `${resourceRoot}${path.sep}`;
  if (filePath !== resourceRoot && !filePath.startsWith(rootPrefix)) {
    return respond(403, 'Forbidden');
  }

  try {
    const contents = await fs.readFile(filePath);
    const contentType = MIME_TYPES.get(path.extname(filePath).toLowerCase()) ??
      'application/octet-stream';
    return respond(200, contents, contentType);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return respond(404, 'Not found');
    }
    console.error(`[neon-city] Failed to serve ${pathname}`, error);
    return respond(500, 'Unable to load application resource');
  }
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: '#0b1930',
    title: 'CODE RACE — NEON CITY',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      devTools: !app.isPackaged
    }
  });

  window.once('ready-to-show', () => {
    window.maximize();
    window.show();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, destination) => {
    if (!destination.startsWith(`${APP_SCHEME}://app/`)) event.preventDefault();
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('[neon-city] Renderer process exited', details);
  });
  window.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    console.error('[neon-city] Page load failed', { code, description, validatedURL });
  });
  if (smokeTest && !smokeTestStarted) {
    smokeTestStarted = true;
    window.webContents.on('did-finish-load', () => runSmokeTest(window));
  }

  const appRoot = app.getAppPath();
  if (!protocolRegistered) {
    protocol.handle(APP_SCHEME, request => serveAppFile(request, appRoot));
    protocolRegistered = true;
  }
  window.loadURL(`${APP_SCHEME}://app/prototype/neon-city/index.html`).catch(error => {
    console.error('[neon-city] Failed to navigate to app entry', error);
  });

  if (!app.isPackaged && process.env.NEON_CITY_DEVTOOLS === '1') {
    window.webContents.openDevTools();
  }
  return window;
}

async function waitForRenderer(window, expression, description, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (window.isDestroyed()) throw new Error(`Window closed while waiting for ${description}`);
    if (await window.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function runSmokeTest(window) {
  const failures = [];
  console.log('[smoke] renderer loaded; starting desktop checks');
  window.webContents.on('console-message', details => {
    if (details.level >= 2) {
      failures.push(details.message);
      console.error(`[smoke] renderer console error: ${details.message}`);
    }
  });
  try {
    await waitForRenderer(window, "document.readyState === 'complete'", 'HTML entry page');
    await window.webContents.executeJavaScript(
      "localStorage.removeItem('code-race-neon-city-game')"
    );
    const entry = await window.webContents.executeJavaScript(`({
      title: document.title,
      nodeApiExposed: typeof require !== 'undefined'
    })`);
    if (!entry.title.includes('NEON CITY')) throw new Error('Unexpected page title');
    if (entry.nodeApiExposed) throw new Error('Node.js API is exposed in the game renderer');
    console.log('[smoke] entry page loaded');

    await waitForRenderer(
      window,
      "document.querySelectorAll('#intro-scene canvas').length > 0",
      'intro 3D renderer initialization',
      30000
    );
    const localThreeModuleAvailable = await window.webContents.executeJavaScript(
      "fetch(new URL('../../node_modules/three/build/three.module.js', location.href)).then(response => response.ok)"
    );
    if (!localThreeModuleAvailable) {
      throw new Error('Three.js was not loaded from the packaged local application files');
    }
    const localGameResources = await window.webContents.executeJavaScript(`Promise.all([
      ['./assets/characters/3d/Robot.glb', 'model'],
      ['./src/gameplay/question-banks/normal/question-bank.json', 'questions']
    ].map(async ([path, type]) => {
      const response = await fetch(new URL(path, location.href));
      const body = type === 'questions' ? await response.json() : await response.arrayBuffer();
      return { type, ok: response.ok, entries: Array.isArray(body) ? body.length : body.byteLength };
    }))`);
    if (localGameResources.some(resource => !resource.ok || !resource.entries)) {
      throw new Error(`Packaged game resources were unavailable: ${JSON.stringify(localGameResources)}`);
    }
    console.log(`[smoke] local model and question bank loaded: ${JSON.stringify(localGameResources)}`);
    await window.webContents.executeJavaScript("document.querySelector('#unlock-computer').click()");
    await waitForRenderer(
      window,
      "!document.querySelector('#desktop-state').hidden && document.querySelector('#intro-screen-ui').dataset.state === 'DESKTOP' && !document.querySelector('#gang-registration').disabled",
      'intro desktop ready',
      30000
    );
    await window.webContents.executeJavaScript("document.querySelector('#gang-registration').click()");
    await waitForRenderer(
      window,
      "!document.querySelector('#gang-registration-app').hidden && document.querySelector('#intro-screen-ui').dataset.state === 'GANG_REGISTRATION'",
      'gang registration ready',
      30000
    );
    await waitForRenderer(
      window,
      "document.querySelector('#preview-status').textContent === '' || document.querySelector('#preview-status').textContent.includes('FALHA')",
      '3D character preview',
      30000
    );
    const preview = await window.webContents.executeJavaScript(`({
      status: document.querySelector('#preview-status').textContent,
      error: document.querySelector('#gang-error').textContent,
      canvas: document.querySelectorAll('#intro-scene canvas').length
    })`);
    if (preview.status || !preview.canvas) {
      throw new Error(`3D intro/preview did not load: ${JSON.stringify(preview)}`);
    }
    console.log('[smoke] intro, registration, and 3D preview loaded');

    for (const [name, members] of [['ALPHA', 'A1, A2'], ['BETA', 'B1, B2']]) {
      await window.webContents.executeJavaScript(`(() => {
        document.querySelector('#gang-name').value = ${JSON.stringify(name)};
        document.querySelector('#gang-members').value = ${JSON.stringify(members)};
        document.querySelector('#gang-editor').dispatchEvent(new Event('submit', {
          bubbles: true,
          cancelable: true
        }));
      })()`);
    }
    await waitForRenderer(
      window,
      "document.querySelectorAll('#gang-roster-list li').length === 2",
      'two registered teams'
    );
    await window.webContents.executeJavaScript("document.querySelector('#start-neon-city').click()");
    await waitForRenderer(
      window,
      "!document.querySelector('#difficulty-modal').hidden",
      'difficulty selection modal before loading'
    );
    const difficultyModal = await window.webContents.executeJavaScript(`({
      visible: !document.querySelector('#difficulty-modal').hidden,
      loadingVisible: !document.querySelector('#journey-loading').hidden,
      easySelected: document.querySelector('#difficulty-modal [data-question-difficulty="easy"]').getAttribute('aria-pressed'),
      normalSelected: document.querySelector('#difficulty-modal [data-question-difficulty="normal"]').getAttribute('aria-pressed'),
      confirmDisabled: document.querySelector('#confirm-question-difficulty').disabled
    })`);
    if (!difficultyModal.visible || difficultyModal.loadingVisible ||
        difficultyModal.easySelected !== 'false' || difficultyModal.normalSelected !== 'false' ||
        !difficultyModal.confirmDisabled) {
      throw new Error(`Difficulty modal/loading order invalid: ${JSON.stringify(difficultyModal)}`);
    }
    await window.webContents.executeJavaScript(
      "document.querySelector('#difficulty-modal').dispatchEvent(new MouseEvent('click', { bubbles: true }))"
    );
    const outsideClickState = await window.webContents.executeJavaScript(`({
      modalHidden: document.querySelector('#difficulty-modal').hidden,
      loadingVisible: !document.querySelector('#journey-loading').hidden
    })`);
    if (outsideClickState.modalHidden || outsideClickState.loadingVisible) {
      throw new Error(`Outside click changed difficulty flow: ${JSON.stringify(outsideClickState)}`);
    }
    await window.webContents.executeJavaScript(
      `document.querySelector('#difficulty-modal [data-question-difficulty="${smokeDifficulty}"]').click()`
    );
    await new Promise(resolve => setTimeout(resolve, 250));
    const afterDifficulty = await window.webContents.executeJavaScript(`({
      modalHidden: document.querySelector('#difficulty-modal').hidden,
      loadingVisible: !document.querySelector('#journey-loading').hidden,
      introState: document.querySelector('#intro-screen-ui').dataset.state,
      startDisabled: document.querySelector('#start-neon-city').disabled,
      selected: document.querySelector('#difficulty-modal [data-question-difficulty="${smokeDifficulty}"]').getAttribute('aria-pressed'),
      otherSelected: document.querySelector('#difficulty-modal [data-question-difficulty="${smokeDifficulty === 'easy' ? 'normal' : 'easy'}"]').getAttribute('aria-pressed'),
      confirmDisabled: document.querySelector('#confirm-question-difficulty').disabled
    })`);
    console.log(`[smoke] difficulty selected: ${JSON.stringify(afterDifficulty)}`);
    if (afterDifficulty.modalHidden || afterDifficulty.loadingVisible ||
        afterDifficulty.selected !== 'true' || afterDifficulty.otherSelected !== 'false' ||
        afterDifficulty.confirmDisabled) {
      throw new Error(`Difficulty selection state invalid: ${JSON.stringify(afterDifficulty)}`);
    }
    await window.webContents.executeJavaScript("document.querySelector('#confirm-question-difficulty').click()");
    await waitForRenderer(
      window,
      "document.querySelector('#turn-team-name').textContent === 'ALPHA' && document.querySelector('#scene canvas')",
      '3D gameplay scene',
      30000
    );
    console.log('[smoke] match started and 3D gameplay canvas loaded');

    await window.webContents.executeJavaScript(`(() => {
      const key = 'code-race-neon-city-game';
      window.confirm = () => true;
      localStorage.setItem('neon-city-desktop-smoke', 'persisted');
      document.querySelector('#open-professor-center').click();
      document.querySelector('#correction-position').value = '5';
      document.querySelector('#position-correction').dispatchEvent(new Event('submit', {
        bubbles: true,
        cancelable: true
      }));
      document.querySelector('#save-game').click();
      return Boolean(localStorage.getItem(key));
    })()`);
    await waitForRenderer(
      window,
      "localStorage.getItem('code-race-neon-city-game') !== null",
      'saved game in localStorage'
    );
    await waitForRenderer(
      window,
      "document.querySelector('#turn-position').textContent.includes('CASA 05')",
      'deterministic Casa 5 setup'
    );
    const savedDifficulty = await window.webContents.executeJavaScript(`JSON.parse(
      localStorage.getItem('code-race-neon-city-game')
    ).questionDifficulty`);
    if (savedDifficulty !== smokeDifficulty) {
      throw new Error(`Unexpected saved question difficulty: ${savedDifficulty}`);
    }
    console.log(`[smoke] question difficulty persisted: ${savedDifficulty}`);
    await window.webContents.executeJavaScript("localStorage.removeItem('neon-city-desktop-smoke')");
    console.log('[smoke] localStorage and Save Game work');

    await window.webContents.executeJavaScript(
      "document.querySelector('#close-professor-center').click()"
    );
    console.log('[smoke] starting deterministic Casa 6 roll');
    await waitForRenderer(
      window,
      "!document.querySelector('#roll-dice').disabled",
      'ready first turn'
    );
    console.log('[smoke] rolling deterministic 5');
    await window.webContents.executeJavaScript(`(() => {
      window.__smokeOriginalRandom = Math.random;
      Math.random = () => 0;
      document.querySelector('#roll-dice').click();
    })()`);
    await waitForRenderer(
      window,
      "document.querySelector('#turn-position').textContent.includes('CASA 06')",
      'deterministic movement to Casa 6',
      30000
    );
    await window.webContents.executeJavaScript(
      "Math.random = window.__smokeOriginalRandom; delete window.__smokeOriginalRandom"
    );
    await waitForRenderer(
      window,
      "!document.querySelector('#action-popup').hidden && document.querySelector('#action-title').textContent.includes('DADO DUPLO')",
      'Casa 6 first modal',
      30000
    );
    const house6Intro = await window.webContents.executeJavaScript(`({
      title: document.querySelector('#action-title').textContent,
      prompt: document.querySelector('#action-prompt').textContent,
      continueLabel: document.querySelector('#close-action').textContent,
      optionCount: document.querySelectorAll('#action-options button').length
    })`);
    if (!house6Intro.title.includes('DADO DUPLO') ||
        !house6Intro.prompt.includes('Jogue o dado novamente') ||
        house6Intro.prompt.includes('ACELERAR') ||
        !house6Intro.continueLabel.includes('PROSSEGUIR') ||
        house6Intro.optionCount !== 0) {
      throw new Error(`Casa 6 first modal invalid: ${JSON.stringify(house6Intro)}`);
    }
    await window.webContents.executeJavaScript("document.querySelector('#close-action').click()");
    await waitForRenderer(
      window,
      "document.querySelectorAll('#action-options button[data-choice]').length === 2",
      'Casa 6 choice modal'
    );
    const house6Choice = await window.webContents.executeJavaScript(`({
      prompt: document.querySelector('#action-prompt').textContent,
      options: [...document.querySelectorAll('#action-options button[data-choice]')].map(button => button.textContent),
      visibleText: document.querySelector('#action-popup').textContent,
      modalCount: document.querySelectorAll('#action-popup:not([hidden])').length
    })`);
    if (house6Choice.prompt ||
        house6Choice.visibleText.includes('Jogue o dado novamente') ||
        house6Choice.visibleText.includes('ACELERAR') ||
        !house6Choice.options.some(text => text.includes('SAFE MODE') || text.includes('SEGURO')) ||
        !house6Choice.options.some(text => text.includes('ARRISCAR')) ||
        !house6Choice.options.some(text => text.includes('1–2') && text.includes('-2') && text.includes('3–4') && text.includes('0') && text.includes('5–6') && text.includes('+3')) ||
        house6Choice.modalCount !== 1) {
      throw new Error(`Casa 6 choice modal invalid: ${JSON.stringify(house6Choice)}`);
    }
    await window.webContents.executeJavaScript(
      "document.querySelector('#action-options button[data-choice=\"1\"]').click()"
    );
    await waitForRenderer(
      window,
      "document.querySelector('#action-options button').textContent.includes('ROLAR SEGUNDO DADO')",
      'Casa 6 second dice modal'
    );
    await window.webContents.executeJavaScript(`(() => {
      window.__smokeOriginalRandom = Math.random;
      Math.random = () => 0;
      document.querySelector('#action-options button').click();
    })()`);
    await waitForRenderer(
      window,
      "document.querySelector('#action-options button').textContent.includes('DADO EM MOVIMENTO')",
      'Casa 6 ARRISCAR roll'
    );
    await window.webContents.executeJavaScript(
      "Math.random = window.__smokeOriginalRandom; delete window.__smokeOriginalRandom"
    );
    await waitForRenderer(
      window,
      "document.querySelector('#close-action').textContent.includes('APLICAR RESULTADO')",
      'Casa 6 ARRISCAR result'
    );
    const arriscarResult = await window.webContents.executeJavaScript(`({
      prompt: document.querySelector('#action-prompt').textContent,
      continueLabel: document.querySelector('#close-action').textContent
    })`);
    if (!arriscarResult.prompt.includes('SEGUNDO DADO: 1') ||
        !arriscarResult.prompt.includes('-2 CASAS') ||
        !arriscarResult.continueLabel.includes('APLICAR RESULTADO')) {
      throw new Error(`Casa 6 ARRISCAR result invalid: ${JSON.stringify(arriscarResult)}`);
    }
    console.log(`[smoke] Casa 6 deterministic flow: ${JSON.stringify({ house6Intro, house6Choice, arriscarResult })}`);
    await window.webContents.executeJavaScript("document.querySelector('#close-action').click()");
    await waitForRenderer(
      window,
      "!document.querySelector('#action-popup').hidden && document.querySelector('#action-title').textContent.includes('MOVIMENTO CONCLUÍDO') && document.querySelector('#close-action').textContent.includes('FINALIZAR TURNO')",
      'Casa 6 movement result modal'
    );
    const movementResult = await window.webContents.executeJavaScript(`({
      title: document.querySelector('#action-title').textContent,
      prompt: document.querySelector('#action-prompt').textContent,
      continueLabel: document.querySelector('#close-action').textContent,
      position: document.querySelector('#turn-position').textContent
    })`);
    if (!movementResult.title.includes('CASA 04') ||
        !movementResult.prompt.includes('SEGUNDO DADO: 1') ||
        !movementResult.continueLabel.includes('FINALIZAR TURNO') ||
        !movementResult.position.includes('CASA 04')) {
      throw new Error(`Casa 6 movement result invalid: ${JSON.stringify(movementResult)}`);
    }
    await window.webContents.executeJavaScript("document.querySelector('#close-action').click()");
    await waitForRenderer(
      window,
      "document.querySelector('#action-popup').hidden && !document.querySelector('#roll-dice').disabled",
      'Casa 6 flow continuation'
    );
    const afterHouse6 = await window.webContents.executeJavaScript(`({
      popupHidden: document.querySelector('#action-popup').hidden,
      rollEnabled: !document.querySelector('#roll-dice').disabled,
      position: document.querySelector('#turn-position').textContent
    })`);
    if (!afterHouse6.popupHidden || !afterHouse6.rollEnabled) {
      throw new Error(`Casa 6 did not continue normally: ${JSON.stringify(afterHouse6)}`);
    }
    console.log(`[smoke] Casa 6 flow continued normally: ${JSON.stringify(afterHouse6)}`);

    await window.webContents.executeJavaScript(
      "document.querySelector('#open-professor-center').click()"
    );
    await window.webContents.executeJavaScript(
      "document.querySelector('#admin-event-list [data-event=\"BLACKOUT\"]').click()"
    );
    await waitForRenderer(
      window,
      "!document.querySelector('#global-event-indicator').hidden && document.querySelector('#global-event-name').textContent.includes('APAGÃO')",
      'Blackout explanation'
    );
    await window.webContents.executeJavaScript(
      "document.querySelector('#global-event-proceed').click()"
    );
    const eventDismissal = await window.webContents.executeJavaScript(`({
      indicatorHidden: document.querySelector('#global-event-indicator').hidden,
      eventStillActive: document.querySelector('#event-state').textContent.includes('APAGÃO')
    })`);
    if (!eventDismissal.indicatorHidden || !eventDismissal.eventStillActive) {
      throw new Error(`Global event dismissal changed event behavior: ${JSON.stringify(eventDismissal)}`);
    }
    console.log('[smoke] Blackout explanation dismissed; global event remains active');
    await window.webContents.executeJavaScript(
      "document.querySelector('#close-professor-center').click()"
    );

    window.close();
    await new Promise(resolve => setTimeout(resolve, 500));
    const reopenedWindow = createMainWindow();
    await waitForRenderer(
      reopenedWindow,
      "document.readyState === 'complete'",
      'application re-open'
    );
    await waitForRenderer(
      reopenedWindow,
      "localStorage.getItem('code-race-neon-city-game') !== null",
      'saved game persistence after re-open'
    );
    console.log('[smoke] application re-opened and saved game persisted');

    const media = await reopenedWindow.webContents.executeJavaScript(`({
      videoSource: document.querySelector('#lore-video')?.getAttribute('data-source') ?? null,
      videoPlaceholder: Boolean(document.querySelector('.lore-video-placeholder'))
    })`);
    console.log(`[smoke] lore video reference: ${JSON.stringify(media)}`);
    if (failures.length) throw new Error(`${failures.length} renderer console error(s)`);
    console.log('[smoke] PASS');
    app.quit();
  } catch (error) {
    console.error('[smoke] FAIL', error);
    app.exit(1);
  }
}

app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}).catch(error => {
  console.error('[neon-city] Failed to start desktop application', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
