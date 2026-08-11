const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const exifr = require('exifr');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.tif', '.tiff', '.webp']);
const DATE_FIELDS = [
  'DateTimeOriginal',
  'CreateDate',
  'ModifyDate',
  'DateCreated',
  'CreationDate',
  'MediaCreateDate',
  'TrackCreateDate'
];
const PLACE_FIELDS = [
  'City',
  'Sub-location',
  'SubLocation',
  'Province-State',
  'State',
  'Country',
  'Location',
  'LocationShownCity',
  'LocationCreatedCity',
  'LocationShownProvinceState',
  'LocationCreatedProvinceState',
  'LocationShownCountryName',
  'LocationCreatedCountryName'
];
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_USER_AGENT = 'Photopanic-Photo-Organizer/0.1 contact:buymeacoffee.com/matte_1101';
const geocodeCache = new Map();
let lastGeocodeAt = 0;

let mainWindow;
let pendingJob = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1160,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    title: 'Photopanic - Photo organizer',
    backgroundColor: '#f7f2ea',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-source-folders', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'multiSelections'] });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('open-coffee', async () => {
  await shell.openExternal('https://buymeacoffee.com/matte_1101');
  return true;
});

ipcMain.handle('scan-sample', async (_event, sourcePaths) => {
  const files = await collectImagesFromRoots(asArray(sourcePaths));
  if (!files.length) return { total: 0, location: locationSummary([]) };
  const sampleFiles = pickSamples(files, 30);
  const sampleRecords = [];

  for (const file of sampleFiles) {
    const metadata = await readMetadata(file);
    sampleRecords.push(await toPhotoRecord(file, metadata));
  }

  const withNamedPlace = sampleRecords.filter(record => record.placeSource === 'metadata-name').length;
  const withGps = sampleRecords.filter(record => record.placeSource === 'gps').length;
  const firstWithPlace = sampleRecords.find(record => record.placeFolder) || sampleRecords[0];

  return {
    total: files.length,
    sample: firstWithPlace,
    location: locationSummary(sampleRecords, withNamedPlace, withGps)
  };
});

ipcMain.handle('start-organize', async (event, options) => {
  pendingJob = { cancelled: false };
  const files = await collectImagesFromRoots(asArray(options.sourcePaths));
  const index = [];
  const previewPool = files.slice().sort(() => Math.random() - 0.5).slice(0, 18);
  const previewUrls = previewPool.map(file => `file://${file.replace(/\\/g, '/')}`);

  event.sender.send('organize-progress', { phase: 'start', total: files.length, done: 0, previewUrls });

  let organizeByPlace = Boolean(options.organizeByPlace);
  if (organizeByPlace) {
    const online = await isReverseGeocodingAvailable();
    if (!online) {
      organizeByPlace = false;
      event.sender.send('organize-progress', {
        phase: 'geo-offline',
        total: files.length,
        done: 0,
        message: 'Connessione assente o servizio luoghi non raggiungibile: salto la conversione GPS e organizzo solo per anno e mese.'
      });
    }
  }

  for (let i = 0; i < files.length; i++) {
    if (pendingJob?.cancelled) break;
      const file = files[i];
      try {
        const metadata = await readMetadata(file);
      const record = await toPhotoRecord(file, metadata, { reverseGeocode: organizeByPlace });
      const targetDir = buildTargetDir(options.destinationPath, record, organizeByPlace);
      await fs.mkdir(targetDir, { recursive: true });
      const targetPath = await uniqueDestination(path.join(targetDir, path.basename(file)));
      if (options.mode === 'move') await fs.rename(file, targetPath).catch(async () => { await fs.copyFile(file, targetPath); await fs.unlink(file); });
      else await fs.copyFile(file, targetPath);
      index.push({ ...record, sourcePath: file, path: targetPath, organizedByPlace: Boolean(organizeByPlace && record.placeFolder) });
      event.sender.send('organize-progress', { phase: 'copy', total: files.length, done: i + 1, current: path.basename(file), preview: previewUrls[i % Math.max(previewUrls.length, 1)] });
    } catch (error) {
      index.push({ path: file, error: error.message });
      event.sender.send('organize-progress', { phase: 'error', total: files.length, done: i + 1, current: path.basename(file), error: error.message });
    }
  }

  await saveIndex(options.destinationPath, index);
  const organized = index.filter(item => !item.error).length;
  const errors = index.filter(item => item.error).length;
  event.sender.send('organize-progress', { phase: pendingJob?.cancelled ? 'cancelled' : 'done', total: files.length, done: organized });
  pendingJob = null;
  return { total: files.length, organized, errors };
});

ipcMain.handle('cancel-organize', async () => {
  if (pendingJob) pendingJob.cancelled = true;
  return true;
});

ipcMain.handle('search-index', async (_event, { destinationPath, query }) => {
  const indexPath = path.join(destinationPath, '.photopanic-index.json');
  const raw = await fs.readFile(indexPath, 'utf8').catch(() => '[]');
  const items = JSON.parse(raw);
  const normalized = (value) => String(value || '').toLowerCase();
  const place = normalized(query.place);
  const date = normalized(query.date);
  const term = normalized(query.term);
  return items.filter(item => !item.error)
    .filter(item => !place || normalized(item.place).includes(place) || normalized(item.gpsLabel).includes(place) || normalized(item.placeFolder).includes(place))
    .filter(item => !date || normalized(item.dateKey).startsWith(date))
    .filter(item => !term || normalized(item.fileName).includes(term))
    .slice(0, 500);
});

async function collectImagesFromRoots(roots) {
  const uniqueFiles = new Set();
  for (const root of roots.filter(Boolean)) {
    for (const file of await collectImages(root)) uniqueFiles.add(file);
  }
  return [...uniqueFiles];
}

async function collectImages(root) {
  const results = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) results.push(full);
    }
  }
  await walk(root);
  return results;
}

async function readMetadata(file) {
  try {
    return await exifr.parse(file, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, mergeOutput: true }) || {};
  } catch {
    return {};
  }
}

async function toPhotoRecord(file, metadata, options = {}) {
  const stats = await fs.stat(file);
  const dateInfo = extractDate(metadata) || { value: stats.mtime, field: 'File modified date' };
  const date = new Date(dateInfo.value);
  const placeInfo = await extractPlaceInfo(metadata, options);
  return {
    fileName: path.basename(file),
    date: date.toLocaleDateString('it-IT'),
    dateKey: date.toISOString().slice(0, 10),
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    place: placeInfo.label,
    placeFolder: placeInfo.folder,
    placeSource: placeInfo.source,
    gpsLabel: placeInfo.gpsLabel,
    dateField: dateInfo.field,
    metadataFields: Object.keys(metadata).sort()
  };
}

function extractDate(metadata) {
  for (const field of DATE_FIELDS) {
    const value = parseMetadataDate(metadata[field]);
    if (value) return { value, field };
  }
  return null;
}

function parseMetadataDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const normalized = String(value).trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function extractPlaceInfo(metadata, options = {}) {
  const namedParts = [];
  for (const field of PLACE_FIELDS) {
    const value = metadata[field];
    if (value && !Array.isArray(value)) namedParts.push(String(value));
  }
  const uniqueNamedParts = [...new Set(namedParts.map(part => part.trim()).filter(Boolean))];
  if (uniqueNamedParts.length) {
    const label = uniqueNamedParts.slice(0, 3).join(', ');
    return { label, folder: sanitizeSegment(uniqueNamedParts[0]), source: 'metadata-name', gpsLabel: gpsLabel(metadata) };
  }

  const gps = gpsLabel(metadata);
  if (gps) {
    if (options.reverseGeocode) {
      const resolved = await reverseGeocode(gps);
      if (resolved) {
        return {
          label: resolved.label,
          folder: sanitizeSegment(resolved.folder),
          source: 'reverse-geocoded',
          gpsLabel: gps
        };
      }
      return { label: '', folder: '', source: 'gps-unresolved', gpsLabel: gps };
    }
    return { label: `Coordinate GPS ${gps}`, folder: sanitizeSegment(`GPS ${gps}`), source: 'gps', gpsLabel: gps };
  }

  return { label: '', folder: '', source: 'none', gpsLabel: '' };
}

function gpsLabel(metadata) {
  const latitude = Number(metadata.latitude ?? metadata.GPSLatitude);
  const longitude = Number(metadata.longitude ?? metadata.GPSLongitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

async function isReverseGeocodingAvailable() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('https://nominatim.openstreetmap.org/status.php?format=json', {
      signal: controller.signal,
      headers: { 'User-Agent': NOMINATIM_USER_AGENT }
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

async function reverseGeocode(gps) {
  if (geocodeCache.has(gps)) return geocodeCache.get(gps);
  const [latitude, longitude] = gps.split(',').map(part => part.trim());
  await throttleGeocoding();

  try {
    const url = new URL(NOMINATIM_REVERSE_URL);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', latitude);
    url.searchParams.set('lon', longitude);
    url.searchParams.set('zoom', '10');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'it,en');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': NOMINATIM_USER_AGENT }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      geocodeCache.set(gps, null);
      return null;
    }

    const data = await response.json();
    const address = data.address || {};
    const locality = address.city || address.town || address.village || address.municipality || address.county || address.state;
    const country = address.country;
    const folder = locality || data.name || data.display_name?.split(',')[0];
    const label = [locality, country].filter(Boolean).join(', ') || data.display_name || '';
    const resolved = folder ? { folder, label: label || folder } : null;
    geocodeCache.set(gps, resolved);
    return resolved;
  } catch {
    geocodeCache.set(gps, null);
    return null;
  }
}

async function throttleGeocoding() {
  const elapsed = Date.now() - lastGeocodeAt;
  if (elapsed < 1100) await new Promise(resolve => setTimeout(resolve, 1100 - elapsed));
  lastGeocodeAt = Date.now();
}

function locationSummary(records, named = 0, gps = 0) {
  const checked = records.length;
  return {
    checked,
    named,
    gps,
    available: named + gps > 0,
    message: named + gps > 0
      ? `Disponibile: ${named} con nome luogo, ${gps} con coordinate GPS nel campione.`
      : checked ? 'Non disponibile: nel campione non ho trovato metadati luogo o GPS.' : 'Non disponibile.'
  };
}

function pickSamples(files, limit) {
  if (files.length <= limit) return files;
  const step = Math.max(1, Math.floor(files.length / limit));
  return files.filter((_file, index) => index % step === 0).slice(0, limit);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function sanitizeSegment(value) {
  return String(value).trim().replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, ' ').slice(0, 80);
}

function buildTargetDir(destinationPath, record, organizeByPlace) {
  const parts = [destinationPath, record.year, record.month];
  if (organizeByPlace && record.placeFolder) parts.push(record.placeFolder);
  return path.join(...parts);
}

async function uniqueDestination(targetPath) {
  const parsed = path.parse(targetPath);
  let candidate = targetPath;
  let counter = 1;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(parsed.dir, `${parsed.name}-${counter}${parsed.ext}`);
      counter++;
    } catch {
      return candidate;
    }
  }
}

async function saveIndex(destinationPath, nextItems) {
  const indexPath = path.join(destinationPath, '.photopanic-index.json');
  const existing = JSON.parse(await fs.readFile(indexPath, 'utf8').catch(() => '[]'));
  const merged = [...existing, ...nextItems].map(item => ({ id: crypto.randomUUID(), ...item }));
  await fs.writeFile(indexPath, JSON.stringify(merged, null, 2), 'utf8');
}
