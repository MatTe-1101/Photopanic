# Photopanic - Photo Organizer

Windows desktop app for organizing phone photos into folders based on metadata.

## Features

* Selection of one or more source folders and a destination folder.
* Step-by-step guided interface: paths, metadata, organization.
* Search area separate from the guided workflow.
* EXIF/XMP/IPTC metadata reading, prioritizing `DateTimeOriginal`, followed by alternative date fields.
* Initial check on a sample of photos before proceeding.
* Clearer location detection: location names when available in metadata, or online conversion of GPS coordinates.
* “Also split by location” option enabled only when location/GPS metadata is available.
* If there is no internet connection or the location service does not respond, Photopanic warns the user and organizes photos by year/month only.
* Automatic creation of `year/month/location` folder structure, for example `2026/03/Milan/photo.jpeg`.
* Fallback to the month folder only if the location is unavailable or the location option is disabled.
* File copying or moving.
* Progress bar with random photo previews.
* `.photopanic-index.json` index in the destination folder, with search by location, GPS coordinates, date, or filename.
* “Buy me a coffee” button.

## Getting Started

```powershell
npm install
npm start
```

## Windows Build

```powershell
npm run package:win
```

## Linux Build

```powershell
npm run package:linux
```

## macOS Build

```powershell
npm run package:mac
```

## Cross-Platform Build

```powershell
npm run package:all
```

Note: the macOS build generated from Windows can be useful for preliminary testing, but signing, notarization, and final distribution normally require macOS.

## Location Notes

Many phones store only GPS coordinates, not the city name. Photopanic converts those coordinates into a city/area using OpenStreetMap's Nominatim service, with an internal cache and a limit of one request per second. If the conversion is unavailable, it does not create raw GPS folders: the photos are placed directly in the month folder.

Nominatim requires light usage, an identifiable `User-Agent`, and attribution to OpenStreetMap. For very large collections or commercial use, it is recommended to configure a dedicated provider or your own instance.

## Supported File Types

`.jpg`, `.jpeg`, `.png`, `.heic`, `.heif`, `.tif`, `.tiff`, `.webp`

##Support Photopanic

If you find Photopanic useful, consider supporting the project: [Buy Me a Coffee](https://buymeacoffee.com/matte_1101)
