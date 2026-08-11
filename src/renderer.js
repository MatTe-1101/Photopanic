const panels = [...document.querySelectorAll('[data-panel]')];
const stepButtons = [...document.querySelectorAll('[data-step-button]')];
const sourceList = document.querySelector('#sourceList');
const sourceCount = document.querySelector('#sourceCount');
const destinationLabel = document.querySelector('#destinationLabel');
const sampleBox = document.querySelector('#sampleBox');
const photoTotal = document.querySelector('#photoTotal');
const placeStatus = document.querySelector('#placeStatus');
const dateField = document.querySelector('#dateField');
const organizeByPlace = document.querySelector('#organizeByPlace');
const placeToggleWrap = document.querySelector('#placeToggleWrap');
const placeToggleText = document.querySelector('#placeToggleText');
const progressFill = document.querySelector('#progressFill');
const progressText = document.querySelector('#progressText');
const progressTitle = document.querySelector('#progressTitle');
const progressPercent = document.querySelector('#progressPercent');
const previewStrip = document.querySelector('#previewStrip');
const results = document.querySelector('#results');
const cancelButton = document.querySelector('#cancel');
const toOrganizeButton = document.querySelector('#toOrganize');

const state = { sourcePaths: [], destinationPath: '', scanned: false, locationAvailable: false };

function goTo(step) {
  panels.forEach((panel, index) => panel.classList.toggle('active', index === step));
  stepButtons.forEach((button, index) => button.classList.toggle('active', index === step));
}

document.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', () => goTo(Math.max(0, panels.findIndex(panel => panel.classList.contains('active')) - 1))));

document.querySelector('#pickSources').addEventListener('click', async () => {
  const folders = await window.photopanic.selectSourceFolders();
  state.sourcePaths = [...new Set([...state.sourcePaths, ...folders])];
  state.scanned = false;
  renderSources();
});

document.querySelector('#pickDestination').addEventListener('click', async () => {
  const folder = await window.photopanic.selectFolder();
  if (folder) {
    state.destinationPath = folder;
    destinationLabel.textContent = folder;
  }
});

document.querySelector('#toMetadata').addEventListener('click', () => {
  if (!state.sourcePaths.length) return notify('Aggiungi almeno una cartella origine.');
  if (!state.destinationPath) return notify('Scegli una cartella destinazione.');
  goTo(1);
});

document.querySelector('#scan').addEventListener('click', async () => {
  if (!state.sourcePaths.length) return notify('Aggiungi almeno una cartella origine.');
  const scan = await window.photopanic.scanSample(state.sourcePaths);
  if (!scan.total) return notify('Non ho trovato immagini supportate nelle origini selezionate.');
  state.scanned = true;
  state.locationAvailable = scan.location.available;
  photoTotal.textContent = scan.total;
  placeStatus.textContent = scan.location.available ? 'Disponibili' : 'Non disponibili';
  dateField.textContent = scan.sample.dateField;
  const where = scan.sample.place || scan.sample.gpsLabel || 'luogo non disponibile';
  sampleBox.classList.remove('muted');
  sampleBox.innerHTML = `<strong>${scan.sample.fileName}</strong><span>Scattata il ${scan.sample.date} · ${where}</span><small>${scan.location.message}</small>`;
  organizeByPlace.disabled = !scan.location.available;
  organizeByPlace.checked = scan.location.available;
  placeToggleWrap.classList.toggle('disabled', !scan.location.available);
  placeToggleText.textContent = scan.location.available
    ? 'Attivo: userò nomi luogo quando presenti; se ci sono solo coordinate le convertirò online in città/area.'
    : 'Non disponibile: organizzerò solo per anno e mese.';
  toOrganizeButton.disabled = false;
});

toOrganizeButton.addEventListener('click', () => goTo(2));

document.querySelector('#start').addEventListener('click', async () => {
  if (!state.scanned) return notify('Analizza prima i metadati nello step 2.');
  cancelButton.disabled = false;
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const result = await window.photopanic.startOrganize({
    sourcePaths: state.sourcePaths,
    destinationPath: state.destinationPath,
    mode,
    organizeByPlace: organizeByPlace.checked && state.locationAvailable
  });
  cancelButton.disabled = true;
  notify(`Fatto: ${result.organized}/${result.total} foto organizzate, errori: ${result.errors}.`);
});

cancelButton.addEventListener('click', () => window.photopanic.cancelOrganize());
document.querySelector('#coffee').addEventListener('click', () => window.photopanic.openCoffee());

window.photopanic.onProgress((payload) => {
  if (payload.previewUrls) renderPreview(payload.previewUrls);
  const percent = payload.total ? Math.round((payload.done / payload.total) * 100) : 0;
  progressFill.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
  const labels = { start: 'Preparazione', 'geo-offline': 'Conversione luoghi saltata', copy: 'Organizzazione in corso', error: 'Errore durante la gestione di un file', done: 'Completato', cancelled: 'Annullato' };
  progressTitle.textContent = labels[payload.phase] || 'Lavoro in corso';
  progressText.textContent = payload.message || `${payload.done}/${payload.total}${payload.current ? ` · ${payload.current}` : ''}${payload.error ? ` · ${payload.error}` : ''}`;
});

document.querySelector('#search').addEventListener('click', async () => {
  if (!state.destinationPath) return notify('Scegli prima la destinazione nello step 1.');
  const found = await window.photopanic.searchIndex({
    destinationPath: state.destinationPath,
    query: {
      place: document.querySelector('#searchPlace').value,
      date: document.querySelector('#searchDate').value,
      term: document.querySelector('#searchTerm').value
    }
  });
  results.innerHTML = found.length ? found.map(item => `<article><strong>${item.fileName}</strong><span>${item.dateKey} · ${item.place || 'luogo non disponibile'}</span><code>${item.path}</code></article>`).join('') : '<p class="muted">Nessun risultato trovato.</p>';
});

function renderSources() {
  sourceCount.textContent = state.sourcePaths.length ? `${state.sourcePaths.length} cartell${state.sourcePaths.length === 1 ? 'a' : 'e'} selezionat${state.sourcePaths.length === 1 ? 'a' : 'e'}.` : 'Nessuna cartella selezionata.';
  sourceList.innerHTML = state.sourcePaths.map((folder, index) => `<div><span>${folder}</span><button data-remove="${index}">Rimuovi</button></div>`).join('');
  sourceList.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
    state.sourcePaths.splice(Number(button.dataset.remove), 1);
    state.scanned = false;
    renderSources();
  }));
}

function renderPreview(urls) {
  previewStrip.innerHTML = urls.map((url, index) => `<img src="${url}" style="animation-delay:${index * -1.35}s" alt="Anteprima foto" />`).join('');
}

function notify(message) {
  progressTitle.textContent = 'Nota';
  progressText.textContent = message;
}
