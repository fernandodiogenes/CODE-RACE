const intro = document.createElement('section');
intro.className = 'intro-shell';
intro.setAttribute('aria-label', 'Abertura de Neon City');
intro.innerHTML = `
  <div class="intro-scene" id="intro-scene" aria-label="Monitor CRT sobre uma mesa em uma sala escura"></div>
  <div class="intro-screen-ui" id="intro-screen-ui" aria-label="Tela do computador">
    <section class="lock-screen" id="lock-screen" aria-label="Tela bloqueada">
      <button class="lock-trigger" id="unlock-computer" type="button" aria-label="Desbloquear computador">
        <svg class="lock-icon" viewBox="0 0 64 76" aria-hidden="true">
          <path class="lock-shackle" d="M17 31V21a15 15 0 0 1 30 0v10" />
          <rect class="lock-body" x="10" y="29" width="44" height="37" rx="5" />
          <circle class="lock-keyhole" cx="32" cy="43" r="3.5" />
          <path class="lock-keyhole" d="M32 46v8" />
        </svg>
        <span class="lock-instruction">CLIQUE PARA DESBLOQUEAR</span>
      </button>
      <p class="lock-screen-foot">SISTEMA LOCAL · CONEXÃO SEGURA</p>
      <p class="intro-error" id="intro-error" role="alert" hidden></p>
    </section>
    <section class="boot-screen" id="boot-screen" aria-label="Inicialização do computador" hidden>
      <div class="boot-panel">
        <p class="boot-heading">NEXUS SYSTEM</p>
        <p class="boot-message" id="boot-message">INICIANDO SISTEMA</p>
        <div class="boot-progress" id="boot-progress" role="progressbar" aria-label="Inicialização" aria-valuemin="0" aria-valuemax="20" aria-valuenow="0"></div>
        <p class="boot-detail">AGUARDE...</p>
      </div>
    </section>
    <section class="intro-desktop-state" id="desktop-state" aria-label="Área de trabalho Neon City" hidden>
      <div class="desktop-shortcuts" aria-label="Ícones da área de trabalho">
        <button class="desktop-icon desktop-icon-folder" id="gang-registration" type="button" aria-label="Cadastro de gangues">
          <svg viewBox="0 0 48 40" aria-hidden="true"><path d="M3 9a3 3 0 0 1 3-3h13l4 4h19a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/><path class="folder-front" d="M3 15h42l-4 17a3 3 0 0 1-3 2H7a3 3 0 0 1-3-3z"/></svg>
          <span>CADASTRO DE<br>GANGUES</span>
        </button>
        <button class="desktop-icon desktop-icon-lore" id="lore-file" type="button" aria-label="MENSAGEM_NEXUS">
          <svg viewBox="0 0 40 44" aria-hidden="true"><path d="M7 2h17l10 10v28H7z"/><path class="document-fold" d="M24 2v11h10"/><path class="document-line" d="M12 22h16M12 28h16M12 34h10"/></svg>
          <span>MENSAGEM_<br>NEXUS</span>
        </button>
        <div class="desktop-icon desktop-icon-document" aria-label="Documentos">
          <svg viewBox="0 0 40 44" aria-hidden="true"><path d="M7 2h17l10 10v28H7z"/><path class="document-fold" d="M24 2v11h10"/><path class="document-line" d="M12 22h16M12 28h16M12 34h12"/></svg>
          <span>DOCUMENTOS</span>
        </div>
        <div class="desktop-icon desktop-icon-bin" aria-label="Lixeira">
          <svg viewBox="0 0 40 44" aria-hidden="true"><path d="M10 12h20l-2 27H12zM8 8h24M15 5h10M16 16v17M24 16v17"/></svg>
          <span>LIXEIRA</span>
        </div>
      </div>
      <div class="desktop-status" id="desktop-status" aria-live="polite">SISTEMA PRONTO</div>
      <div class="desktop-taskbar">
        <button class="desktop-start" type="button" aria-label="Menu Start">
          <span class="start-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span>Start</span>
        </button>
        <div class="taskbar-separator" aria-hidden="true"></div>
        <div class="taskbar-running" aria-label="Aplicativo ativo">NEON CITY // DESKTOP</div>
        <time class="taskbar-clock" id="desktop-clock"></time>
      </div>
    </section>
    <section class="gang-registration" id="gang-registration-app" aria-label="Cadastro de gangues" hidden>
      <header class="gang-titlebar">
        <span>PROGRAMA DE CADASTRO // NEON CITY</span>
        <button class="legacy-window-close" id="close-gang-registration" type="button" aria-label="Fechar cadastro">×</button>
      </header>
      <div class="gang-content">
        <div class="gang-left-column">
          <form class="gang-editor" id="gang-editor" novalidate>
            <div class="gang-section-heading"><span id="gang-step">NOVA GANGUE</span><span id="gang-count">0 / 8</span></div>
            <label class="gang-field">NOME DA GANGUE<input id="gang-name" name="name" maxlength="28" autocomplete="off"></label>
            <fieldset class="gang-members">
              <legend>INTEGRANTES</legend>
              <input id="gang-members" name="members" autocomplete="off" aria-label="Integrantes, separados por vírgula" placeholder="Nome 1, Nome 2, Nome 3">
            </fieldset>
            <fieldset class="gang-colors">
              <legend>COR DO PEÃO</legend>
              <div id="gang-color-options" class="gang-color-options" role="group" aria-label="Cores disponíveis"></div>
            </fieldset>
            <div class="gang-character-picker">
              <span>PERSONAGEM / PEÃO</span>
              <div><button id="character-previous" type="button" aria-label="Personagem anterior">‹</button><strong id="character-name">BUBBLE GUY</strong><button id="character-next" type="button" aria-label="Próximo personagem">›</button></div>
            </div>
            <p id="gang-error" class="gang-error" role="alert" hidden></p>
            <div class="gang-editor-actions">
              <button id="confirm-gang" type="submit">SALVAR GANGUE</button>
              <button id="new-gang" type="button">NOVA / LIMPAR</button>
            </div>
          </form>
          <section class="gang-roster" aria-label="Gangues registradas">
            <div class="gang-section-heading"><span>GANGUES REGISTRADAS</span><span id="roster-count">0</span></div>
            <ol id="gang-roster-list"></ol>
          </section>
        </div>
        <aside class="gang-preview-panel" aria-label="Vitrine de preview tridimensional">
          <span class="preview-heading">VITRINE 3D</span>
          <div class="gang-preview-aperture" id="gang-preview-aperture" aria-hidden="true"></div>
          <p id="preview-status" class="preview-status" aria-live="polite">CARREGANDO PERSONAGEM...</p>
          <div class="preview-character-controls"><button id="preview-previous" type="button" aria-label="Personagem anterior">‹</button><strong id="preview-character-name">BUBBLE GUY</strong><button id="preview-next" type="button" aria-label="Próximo personagem">›</button></div>
        </aside>
      </div>
      <footer class="gang-footer">
        <span id="gang-footer-status">CADASTRE DE 2 A 8 GANGUES</span>
        <button id="start-neon-city" type="button" disabled>INICIAR PARTIDA</button>
        <button id="return-to-desktop" type="button">VOLTAR AO DESKTOP</button>
      </footer>
    </section>
    <section class="difficulty-modal" id="difficulty-modal" role="dialog" aria-modal="true" aria-labelledby="difficulty-modal-title" hidden>
      <div class="difficulty-modal-panel">
        <header class="legacy-window-title"><span id="difficulty-modal-title">CONFIGURAÇÃO DA PARTIDA</span></header>
        <div class="difficulty-modal-body">
          <strong>QUAL NÍVEL DE DIFICULDADE?</strong>
          <p>ESCOLHA O BANCO DE QUESTÕES DESTA PARTIDA.</p>
          <div class="difficulty-modal-options">
            <button type="button" data-question-difficulty="easy">FÁCIL</button>
            <button type="button" data-question-difficulty="normal">NORMAL</button>
          </div>
          <button type="button" class="difficulty-modal-confirm" id="confirm-question-difficulty" disabled>CONFIRMAR</button>
        </div>
      </div>
    </section>
    <section class="journey-loading" id="journey-loading" aria-label="Preparando a jornada" hidden>
      <div class="journey-loading-panel">
        <span class="journey-loading-heading">NEXUS // PORTAL DE ACESSO</span>
        <p class="journey-loading-message">A JORNADA COMEÇA...</p>
        <div class="journey-loading-progress" id="journey-loading-progress" role="progressbar" aria-label="Preparando Neon City" aria-valuemin="0" aria-valuemax="16" aria-valuenow="0"></div>
        <span class="journey-loading-detail">CONECTANDO À NEON CITY</span>
      </div>
    </section>
    <section class="desktop-alert" id="desktop-alert" role="dialog" aria-labelledby="alert-title" aria-describedby="alert-copy" hidden>
      <header class="legacy-window-title"><span id="alert-title">AVISO DO SISTEMA</span><button class="legacy-window-close" id="dismiss-alert-x" type="button" aria-label="Fechar aviso">×</button></header>
      <div class="alert-body">
        <span class="alert-symbol" aria-hidden="true">!</span>
        <div><strong>ARQUIVO ESTRANHO DETECTADO</strong><p id="alert-copy">Deseja examiná-lo agora?</p></div>
      </div>
      <footer class="alert-actions"><button id="examine-lore" type="button">EXAMINAR</button><button id="dismiss-alert" type="button">FECHAR</button></footer>
    </section>
    <section class="lore-player" id="lore-player" aria-label="Player da mensagem Nexus" hidden>
      <header class="legacy-window-title"><span>MENSAGEM_NEXUS — PLAYER</span><button class="legacy-window-close" id="close-lore-player" type="button" aria-label="Voltar ao Desktop">×</button></header>
      <div class="lore-player-screen">
        <video id="lore-video" data-source="assets/intro/video/neon-city-lore.mp4" playsinline aria-label="Área reservada para o vídeo de lore"></video>
        <div class="lore-video-placeholder"><span class="player-mark" aria-hidden="true">▶</span><p>VÍDEO AGUARDANDO CONEXÃO</p><small>ARQUIVO DE MÍDIA NÃO DISPONÍVEL</small></div>
      </div>
      <footer class="lore-player-footer"><span>PLAYER NEXUS // SINAL OFFLINE</span><button id="return-desktop" type="button">VOLTAR AO DESKTOP</button></footer>
    </section>
  </div>
`;

document.querySelector('.city-shell').appendChild(intro);

const gameplayElements = document.querySelectorAll(
  '#scene, .atmosphere, .system-ui, .status-line, .turn-hud, #professor-overlay, #action-popup, .history-panel, .corner-tag'
);
gameplayElements.forEach(element => { element.inert = true; });

const screenUi = intro.querySelector('#intro-screen-ui');
const lockScreen = intro.querySelector('#lock-screen');
const bootScreen = intro.querySelector('#boot-screen');
const desktopState = intro.querySelector('#desktop-state');
const desktopAlert = intro.querySelector('#desktop-alert');
const lorePlayer = intro.querySelector('#lore-player');
const loreFile = intro.querySelector('#lore-file');
const gangRegistration = intro.querySelector('#gang-registration-app');
const journeyLoading = intro.querySelector('#journey-loading');
const difficultyModal = intro.querySelector('#difficulty-modal');
const gangEditor = intro.querySelector('#gang-editor');
const gangNameInput = intro.querySelector('#gang-name');
const gangMembersInput = intro.querySelector('#gang-members');
const gangError = intro.querySelector('#gang-error');
const gangRosterList = intro.querySelector('#gang-roster-list');
const startGameButton = intro.querySelector('#start-neon-city');
const previewStatus = intro.querySelector('#preview-status');
const characterOptions = [
  { id: 'bubbleguy', name: 'Dust' },
  { id: 'littlegirl', name: 'Lumi' },
  { id: 'cauboi', name: 'Zic' },
  { id: 'mulherpunk', name: 'Vexa' },
  { id: 'robot', name: 'Robot' },
  { id: 'billy', name: 'Billy' },
  { id: 'cage', name: 'Cage' },
  { id: 'jaden', name: 'Jaden' },
  { id: 'spencer', name: 'Spencer' }
];
const gangColors = [
  { name: 'VERMELHO', value: 0xff4f73 },
  { name: 'CIANO', value: 0x4ee6e4 },
  { name: 'ÂMBAR', value: 0xe6a85e },
  { name: 'VIOLETA', value: 0x9b76e8 },
  { name: 'VERDE', value: 0x78ce8c },
  { name: 'BRANCO', value: 0xe3edf0 }
];
let registeredGangDrafts = [];
let editingDraftIndex = null;
let selectedCharacterIndex = 0;
let selectedGangColor = gangColors[0].value;
let selectedQuestionDifficulty = 'normal';
let pendingQuestionDifficulty = null;
let gameStartInProgress = false;
let introScene = null;

try {
  const { createIntroScene } = await import('./intro-scene.js');
  introScene = createIntroScene(intro.querySelector('#intro-scene'), screenUi);
} catch (sceneError) {
  const error = intro.querySelector('#intro-error');
  error.textContent = sceneError instanceof Error ? sceneError.message : String(sceneError);
  error.hidden = false;
  console.error('[neon-city] Falha ao criar a cena 3D de abertura', sceneError);
}

let introState = 'LOCK_SCREEN';
let unlockTimer;
let alertTimer;
screenUi.dataset.state = introState;
buildGangColorOptions();
setupQuestionDifficultyModal();

function showDesktop() {
  if (introState !== 'LOADING') return;
  bootScreen.hidden = true;
  introState = 'DESKTOP';
  desktopState.hidden = false;
  desktopState.classList.add('is-entering');
  screenUi.dataset.state = introState;
  updateDesktopClock();
  alertTimer = window.setTimeout(showFileAlert, 320);
}

const progressSegments = Array.from({ length: 20 }, () => {
  const segment = document.createElement('span');
  segment.className = 'boot-progress-segment';
  return segment;
});
const bootProgress = intro.querySelector('#boot-progress');
bootProgress.append(...progressSegments);

const journeyProgressSegments = Array.from({ length: 16 }, () => {
  const segment = document.createElement('span');
  segment.className = 'journey-loading-segment';
  return segment;
});
const journeyProgress = intro.querySelector('#journey-loading-progress');
journeyProgress.append(...journeyProgressSegments);

async function playJourneyLoading() {
  const steps = [
    { value: 2, delay: 240 },
    { value: 5, delay: 300 },
    { value: 6, delay: 180 },
    { value: 10, delay: 350 },
    { value: 12, delay: 220 },
    { value: 16, delay: 350 }
  ];
  journeyProgressSegments.forEach(segment => segment.classList.remove('is-lit'));
  journeyProgress.setAttribute('aria-valuenow', '0');
  journeyLoading.hidden = false;
  for (const step of steps) {
    await new Promise(resolve => window.setTimeout(resolve, step.delay));
    journeyProgressSegments.forEach((segment, index) => {
      segment.classList.toggle('is-lit', index < step.value);
    });
    journeyProgress.setAttribute('aria-valuenow', String(step.value));
  }
}

function updateBootProgress(value, message) {
  progressSegments.forEach((segment, index) => segment.classList.toggle('is-lit', index < value));
  bootProgress.setAttribute('aria-valuenow', String(value));
  intro.querySelector('#boot-message').textContent = message;
}

function beginBoot() {
  if (introState !== 'UNLOCKING') return;
  window.clearTimeout(unlockTimer);
  lockScreen.hidden = true;
  bootScreen.hidden = false;
  introState = 'LOADING';
  screenUi.dataset.state = introState;

  const steps = [
    { value: 4, message: 'VERIFICANDO MEMÓRIA', delay: 160 },
    { value: 8, message: 'CARREGANDO MÓDULOS', delay: 230 },
    { value: 13, message: 'INICIALIZANDO NEXUS', delay: 190 },
    { value: 17, message: 'VALIDANDO ARQUIVOS', delay: 290 },
    { value: 20, message: 'SISTEMA PRONTO', delay: 230 }
  ];
  let elapsed = 0;
  steps.forEach(({ value, message, delay }) => {
    elapsed += delay;
    window.setTimeout(() => {
      if (introState === 'LOADING') updateBootProgress(value, message);
    }, elapsed);
  });
  window.setTimeout(showDesktop, elapsed + 120);
}

intro.querySelector('#unlock-computer').addEventListener('click', event => {
  if (introState !== 'LOCK_SCREEN') return;
  introState = 'UNLOCKING';
  screenUi.dataset.state = introState;
  event.currentTarget.disabled = true;
  lockScreen.classList.add('is-unlocking');
  lockScreen.addEventListener('animationend', beginBoot, { once: true });
  unlockTimer = window.setTimeout(beginBoot, 420);
});

intro.querySelector('#gang-registration').addEventListener('click', event => {
  if (introState !== 'DESKTOP') return;
  event.currentTarget.classList.add('is-selected');
  void openGangRegistration();
});
intro.querySelector('#close-gang-registration').addEventListener('click', closeGangRegistration);
intro.querySelector('#return-to-desktop').addEventListener('click', closeGangRegistration);
gangEditor.addEventListener('submit', confirmGang);
intro.querySelector('#new-gang').addEventListener('click', resetGangEditor);
intro.querySelector('#character-previous').addEventListener('click', () => {
  selectedCharacterIndex = (selectedCharacterIndex - 1 + characterOptions.length) % characterOptions.length;
  setGangError();
  updateGangPreview();
});
intro.querySelector('#character-next').addEventListener('click', () => {
  selectedCharacterIndex = (selectedCharacterIndex + 1) % characterOptions.length;
  setGangError();
  updateGangPreview();
});
intro.querySelector('#preview-previous').addEventListener('click', () => {
  selectedCharacterIndex = (selectedCharacterIndex - 1 + characterOptions.length) % characterOptions.length;
  setGangError();
  updateGangPreview();
});
intro.querySelector('#preview-next').addEventListener('click', () => {
  selectedCharacterIndex = (selectedCharacterIndex + 1) % characterOptions.length;
  setGangError();
  updateGangPreview();
});
startGameButton.addEventListener('click', () => startNeonCity());
intro.addEventListener('keydown', event => {
  if (event.key === 'Escape' && introState === 'GANG_REGISTRATION') closeGangRegistration();
});

function updateDesktopClock() {
  const clock = intro.querySelector('#desktop-clock');
  const now = new Date();
  clock.dateTime = now.toISOString();
  clock.textContent = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(now);
}

function selectedCharacter() {
  return characterOptions[selectedCharacterIndex];
}

function setGangError(message = '') {
  gangError.textContent = message;
  gangError.hidden = !message;
}

function updateGangPreview() {
  const character = selectedCharacter();
  intro.querySelector('#character-name').textContent = character.name;
  intro.querySelector('#preview-character-name').textContent = character.name;
  previewStatus.textContent = 'CARREGANDO PERSONAGEM...';
  if (!introScene) {
    previewStatus.textContent = 'PREVIEW 3D INDISPONÍVEL';
    return;
  }
  introScene.showPawnPreview({
    character: character.id,
    color: selectedGangColor,
    viewport: intro.querySelector('#gang-preview-aperture')
  }).then(() => {
    previewStatus.textContent = '';
  }).catch(error => {
    previewStatus.textContent = 'FALHA AO CARREGAR PERSONAGEM';
    setGangError(error instanceof Error ? error.message : String(error));
    console.error('[neon-city] Falha ao carregar personagem do preview', error);
  });
}

function updateSelectedGangColor() {
  intro.querySelectorAll('[data-gang-color]').forEach(button => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.gangColor) === selectedGangColor));
  });
  introScene?.updatePawnPreviewColor(selectedGangColor);
}

function renderMemberDraft() {
  return gangMembersInput.value
    .split(',')
    .map(member => member.trim())
    .filter(Boolean);
}

function updateGangRoster() {
  gangRosterList.replaceChildren(...registeredGangDrafts.map((gang, index) => {
    const item = document.createElement('li');
    item.className = 'gang-roster-entry';
    const summary = document.createElement('span');
    const character = characterOptions.find(option => option.id === gang.character);
    summary.textContent = `${String(index + 1).padStart(2, '0')} ${gang.name} · ${gang.members.length} integrante(s) · ${character?.name ?? gang.character.toUpperCase()}`;
    const color = document.createElement('span');
    color.className = 'gang-roster-color';
    color.style.setProperty('--gang-color', `#${gang.color.toString(16).padStart(6, '0')}`);
    color.setAttribute('aria-label', `Cor #${gang.color.toString(16).padStart(6, '0')}`);
    const actions = document.createElement('span');
    actions.className = 'gang-roster-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'EDITAR';
    edit.addEventListener('click', () => editGangDraft(index));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'REMOVER';
    remove.addEventListener('click', () => removeGangDraft(index));
    actions.append(edit, remove);
    item.append(summary, color, actions);
    return item;
  }));
  const count = registeredGangDrafts.length;
  intro.querySelector('#gang-count').textContent = `${count} / 8`;
  intro.querySelector('#roster-count').textContent = String(count);
  startGameButton.disabled = gameStartInProgress || count < 2 || count > 8;
  intro.querySelector('#gang-footer-status').textContent =
    count < 2 ? 'CADASTRE AO MENOS 2 GANGUES' : `GANGUE ${String(count).padStart(2, '0')} REGISTRADA(S)`;
}

function resetGangEditor() {
  gangEditor.reset();
  gangNameInput.value = '';
  gangMembersInput.value = '';
  editingDraftIndex = null;
  selectedCharacterIndex = 0;
  selectedGangColor = gangColors[0].value;
  intro.querySelector('#gang-step').textContent = 'NOVA GANGUE';
  intro.querySelector('#confirm-gang').textContent = 'SALVAR GANGUE';
  setGangError();
  updateSelectedGangColor();
  updateGangPreview();
}

function editGangDraft(index) {
  const gang = registeredGangDrafts[index];
  if (!gang) return;
  editingDraftIndex = index;
  gangNameInput.value = gang.name;
  gangMembersInput.value = gang.members.join(', ');
  selectedGangColor = gang.color;
  selectedCharacterIndex = characterOptions.findIndex(option => option.id === gang.character);
  if (selectedCharacterIndex < 0) selectedCharacterIndex = 0;
  intro.querySelector('#gang-step').textContent = `EDITANDO GANGUE ${String(index + 1).padStart(2, '0')}`;
  intro.querySelector('#confirm-gang').textContent = 'SALVAR ALTERAÇÕES';
  setGangError();
  updateSelectedGangColor();
  updateGangPreview();
  gangNameInput.focus();
}

function removeGangDraft(index) {
  const gang = registeredGangDrafts[index];
  if (!gang || !window.confirm(`Remover a gangue ${gang.name} do cadastro?`)) return;
  registeredGangDrafts.splice(index, 1);
  if (editingDraftIndex === index) resetGangEditor();
  else if (editingDraftIndex !== null && editingDraftIndex > index) editingDraftIndex -= 1;
  updateGangRoster();
}

function confirmGang(event) {
  event.preventDefault();
  const name = gangNameInput.value.trim();
  const members = renderMemberDraft();
  const character = selectedCharacter();
  const duplicate = registeredGangDrafts.some((gang, index) =>
    index !== editingDraftIndex && gang.name.toLocaleLowerCase() === name.toLocaleLowerCase()
  );
  if (!name) return setGangError('INFORME O NOME DA GANGUE.');
  if (!members.length) return setGangError('INFORME AO MENOS UM INTEGRANTE.');
  if (duplicate) return setGangError('JÁ EXISTE UMA GANGUE COM ESSE NOME.');
  if (!characterOptions.some(option => option.id === character.id)) return setGangError('SELECIONE UM PERSONAGEM VÁLIDO.');
  if (!Number.isInteger(selectedGangColor) || selectedGangColor < 0 || selectedGangColor > 0xffffff) {
    return setGangError('SELECIONE UMA COR VÁLIDA.');
  }
  if (editingDraftIndex === null && registeredGangDrafts.length >= 8) {
    return setGangError('LIMITE DE 8 GANGUES ATINGIDO.');
  }
  const values = {
    name,
    members,
    color: selectedGangColor,
    character: character.id
  };
  if (editingDraftIndex === null) {
    const id = globalThis.crypto?.randomUUID?.() ?? `gang-${Date.now()}-${registeredGangDrafts.length}`;
    registeredGangDrafts.push({ id, ...values, houseId: 1, hacks: 0 });
  } else {
    Object.assign(registeredGangDrafts[editingDraftIndex], values);
  }
  const savedIndex = editingDraftIndex === null ? registeredGangDrafts.length - 1 : editingDraftIndex;
  updateGangRoster();
  resetGangEditor();
  intro.querySelector('#gang-step').textContent = `GANGUE ${String(savedIndex + 1).padStart(2, '0')} REGISTRADA`;
  intro.querySelector('#gang-footer-status').textContent = `GANGUE ${String(savedIndex + 1).padStart(2, '0')} REGISTRADA`;
}

async function openGangRegistration() {
  if (introState !== 'DESKTOP') return;
  introState = 'GANG_ZOOM_IN';
  intro.dataset.cameraTransition = 'true';
  gangRegistration.inert = true;
  intro.querySelector('#gang-registration').disabled = true;
  try {
    if (!introScene) throw new Error('A cena 3D da introdução não está disponível.');
    const appScale = await introScene.zoomToScreen();
    if (introState !== 'GANG_ZOOM_IN') return;
    const appSize = `${97 / appScale}%`;
    gangRegistration.style.left = '50%';
    gangRegistration.style.top = '50%';
    gangRegistration.style.width = appSize;
    gangRegistration.style.height = appSize;
    gangRegistration.style.transform = `translate(-50%, -50%) scale(${appScale})`;
    desktopState.hidden = true;
    gangRegistration.hidden = false;
    gangRegistration.inert = false;
    introState = 'GANG_REGISTRATION';
    screenUi.dataset.state = introState;
    delete intro.dataset.cameraTransition;
    updateGangRoster();
    resetGangEditor();
    gangNameInput.focus();
  } catch (error) {
    introState = 'DESKTOP';
    gangRegistration.inert = false;
    intro.querySelector('#gang-registration').disabled = false;
    delete intro.dataset.cameraTransition;
    setGangError(error instanceof Error ? error.message : String(error));
    console.error('[neon-city] Falha ao aproximar a câmera do cadastro', error);
  }
}

async function closeGangRegistration() {
  if (introState !== 'GANG_REGISTRATION' || gameStartInProgress) return;
  introState = 'GANG_ZOOM_OUT';
  intro.dataset.cameraTransition = 'true';
  gangRegistration.inert = true;
  introScene?.disposePawnPreview();
  try {
    await introScene?.returnFromScreenZoom();
    gangRegistration.hidden = true;
    gangRegistration.inert = false;
    gangRegistration.removeAttribute('style');
    desktopState.hidden = false;
    introState = 'DESKTOP';
    screenUi.dataset.state = introState;
    intro.querySelector('#gang-registration').disabled = false;
    delete intro.dataset.cameraTransition;
  } catch (error) {
    introState = 'GANG_REGISTRATION';
    screenUi.dataset.state = introState;
    gangRegistration.inert = false;
    delete intro.dataset.cameraTransition;
    setGangError(error instanceof Error ? error.message : String(error));
    console.error('[neon-city] Falha ao restaurar a câmera da introdução', error);
  }
}

async function startNeonCity(difficultyConfirmed = false) {
  if (introState !== 'GANG_REGISTRATION' || startGameButton.disabled) return;
  if (registeredGangDrafts.length < 2 || registeredGangDrafts.length > 8) {
    setGangError('A PARTIDA PRECISA DE 2 A 8 GANGUES.');
    return;
  }
  if (registeredGangDrafts.some(gang =>
    !gang.name.trim() || !gang.members.length || !characterOptions.some(option => option.id === gang.character) ||
    !Number.isInteger(gang.color) || gang.color < 0 || gang.color > 0xffffff
  )) {
    setGangError('REVISE OS DADOS DAS GANGUES ANTES DE INICIAR.');
    return;
  }
  const names = registeredGangDrafts.map(gang => gang.name.trim().toLocaleLowerCase());
  if (new Set(names).size !== names.length) {
    setGangError('OS NOMES DAS GANGUES DEVEM SER ÚNICOS.');
    return;
  }
  if (!introScene) {
    setGangError('A CENA DE INTRODUÇÃO NÃO ESTÁ DISPONÍVEL.');
    return;
  }
  if (!difficultyConfirmed) {
    pendingQuestionDifficulty = null;
    difficultyModal.querySelectorAll('[data-question-difficulty]').forEach(button => {
      button.setAttribute('aria-pressed', 'false');
    });
    difficultyModal.querySelector('#confirm-question-difficulty').disabled = true;
    difficultyModal.hidden = false;
    difficultyModal.querySelector('button[data-question-difficulty="normal"]').focus();
    return;
  }
  gameStartInProgress = true;
  introState = 'GAME_LOADING';
  screenUi.dataset.state = introState;
  intro.dataset.cameraTransition = 'true';
  gangRegistration.inert = true;
  gangRegistration.hidden = true;
  startGameButton.disabled = true;
  startGameButton.textContent = 'INICIANDO...';
  intro.querySelector('#gang-footer-status').textContent = 'PREPARANDO A CIDADE...';
  globalThis.CODE_RACE_BOOTSTRAP = {
    questionDifficulty: selectedQuestionDifficulty,
    initialTeams: registeredGangDrafts.map(({ id, name, members, color, character, houseId, hacks }) => ({
      id,
      name,
      members: [...members],
      color,
      character,
      houseId,
      hacks
    }))
  };
  const gameplayLoad = import('../../neon-city.js').then(
    () => ({ error: null }),
    error => ({ error })
  );
  let cameraSequenceStarted = false;
  try {
    await playJourneyLoading();
    const { error: gameplayError } = await gameplayLoad;
    if (gameplayError) throw gameplayError;
    journeyLoading.hidden = true;
    introState = 'GAME_POWERING_OFF';
    screenUi.dataset.state = introState;
    await new Promise(resolve => window.setTimeout(resolve, 320));
    cameraSequenceStarted = true;
    await introScene.returnFromScreenZoom();
    gangRegistration.hidden = true;
    desktopState.hidden = true;
    screenUi.dataset.state = 'GAME_POWERING_OFF';
    intro.dataset.screenDeparture = 'true';
    intro.querySelector('#gang-footer-status').textContent = 'SAINDO DO TERMINAL...';
    await introScene.exitThroughWindow();
    await fadeIntroForGameplay();
    gameplayElements.forEach(element => { element.inert = false; });
    introScene?.dispose();
    intro.remove();
  } catch (error) {
    delete globalThis.CODE_RACE_BOOTSTRAP;
    delete intro.dataset.exitFade;
    delete intro.dataset.screenDeparture;
    journeyLoading.hidden = true;
    if (cameraSequenceStarted) {
      try {
        await introScene.returnToIntroView();
      } catch (restoreError) {
        console.error('[neon-city] Falha ao restaurar a câmera após erro na transição', restoreError);
      }
    }
    gangRegistration.hidden = false;
    gangRegistration.inert = false;
    desktopState.hidden = true;
    introState = 'GANG_REGISTRATION';
    screenUi.dataset.state = introState;
    delete intro.dataset.cameraTransition;
    gameStartInProgress = false;
    startGameButton.disabled = false;
    startGameButton.textContent = 'INICIAR PARTIDA';
    intro.querySelector('#gang-footer-status').textContent = 'NÃO FOI POSSÍVEL INICIAR';
    setGangError(error instanceof Error ? error.message : String(error));
    console.error('[neon-city] Falha ao iniciar a partida com as gangues cadastradas', error);
  }
}

function fadeIntroForGameplay() {
  return new Promise(resolve => {
    const finish = () => {
      window.clearTimeout(fallback);
      intro.removeEventListener('animationend', onAnimationEnd);
      resolve();
    };
    const onAnimationEnd = event => {
      if (event.target === intro) finish();
    };
    intro.addEventListener('animationend', onAnimationEnd);
    intro.dataset.exitFade = 'true';
    const fallback = window.setTimeout(finish, 850);
  });
}

function buildGangColorOptions() {
  const options = intro.querySelector('#gang-color-options');
  options.replaceChildren(...gangColors.map(color => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gang-color-option';
    button.dataset.gangColor = String(color.value);
    button.style.setProperty('--gang-color', `#${color.value.toString(16).padStart(6, '0')}`);
    button.setAttribute('aria-label', color.name);
    button.title = color.name;
    button.addEventListener('click', () => {
      selectedGangColor = color.value;
      setGangError();
      updateSelectedGangColor();
    });
    return button;
  }));
  updateSelectedGangColor();
}

function setupQuestionDifficultyModal() {
  const options = difficultyModal.querySelector('.difficulty-modal-options');
  const confirmButton = difficultyModal.querySelector('#confirm-question-difficulty');
  options.querySelectorAll('[data-question-difficulty]').forEach(button => {
    button.className = 'difficulty-modal-option';
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      pendingQuestionDifficulty = button.dataset.questionDifficulty === 'easy' ? 'easy' : 'normal';
      options.querySelectorAll('[data-question-difficulty]').forEach(item => {
        item.setAttribute('aria-pressed', String(item.dataset.questionDifficulty === pendingQuestionDifficulty));
      });
      confirmButton.disabled = false;
    });
  });
  confirmButton.addEventListener('click', () => {
    if (!pendingQuestionDifficulty) return;
    selectedQuestionDifficulty = pendingQuestionDifficulty;
    difficultyModal.hidden = true;
    startNeonCity(true);
  });
}

function showFileAlert() {
  if (introState !== 'DESKTOP') return;
  introState = 'ALERT';
  screenUi.dataset.state = introState;
  loreFile.classList.add('is-detected');
  desktopAlert.hidden = false;
}

function dismissFileAlert() {
  if (introState !== 'ALERT') return;
  desktopAlert.hidden = true;
  loreFile.classList.remove('is-detected');
  introState = 'DESKTOP';
  screenUi.dataset.state = introState;
}

async function openLorePlayer() {
  if (introState !== 'DESKTOP' && introState !== 'ALERT') return;
  const previousState = introState;
  window.clearTimeout(alertTimer);
  introState = 'LORE_ZOOM_IN';
  screenUi.dataset.state = introState;
  intro.dataset.cameraTransition = 'true';
  lorePlayer.inert = true;
  desktopAlert.hidden = true;
  loreFile.classList.remove('is-detected');
  try {
    if (!introScene) throw new Error('A cena 3D da introdução não está disponível.');
    await introScene.zoomToScreen();
    if (introState !== 'LORE_ZOOM_IN') return;
    desktopState.hidden = true;
    lorePlayer.hidden = false;
    lorePlayer.inert = false;
    introState = 'LORE_PLAYER';
    screenUi.dataset.state = introState;
    delete intro.dataset.cameraTransition;
  } catch (error) {
    introState = 'DESKTOP';
    screenUi.dataset.state = introState;
    lorePlayer.inert = false;
    delete intro.dataset.cameraTransition;
    console.error(`[neon-city] Falha ao aproximar a câmera do player (${previousState})`, error);
  }
}

async function closeLorePlayer() {
  if (introState !== 'LORE_PLAYER') return;
  introState = 'LORE_ZOOM_OUT';
  screenUi.dataset.state = introState;
  intro.dataset.cameraTransition = 'true';
  lorePlayer.inert = true;
  try {
    await introScene?.returnFromScreenZoom();
    lorePlayer.hidden = true;
    lorePlayer.inert = false;
    desktopState.hidden = false;
    introState = 'DESKTOP';
    screenUi.dataset.state = introState;
    delete intro.dataset.cameraTransition;
  } catch (error) {
    introState = 'LORE_PLAYER';
    screenUi.dataset.state = introState;
    lorePlayer.inert = false;
    delete intro.dataset.cameraTransition;
    console.error('[neon-city] Falha ao restaurar a câmera do player', error);
  }
}

intro.querySelector('#examine-lore').addEventListener('click', openLorePlayer);
intro.querySelector('#dismiss-alert').addEventListener('click', dismissFileAlert);
intro.querySelector('#dismiss-alert-x').addEventListener('click', dismissFileAlert);
loreFile.addEventListener('click', openLorePlayer);
intro.querySelector('#close-lore-player').addEventListener('click', closeLorePlayer);
intro.querySelector('#return-desktop').addEventListener('click', closeLorePlayer);
