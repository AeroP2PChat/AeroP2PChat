# Development on Nobara Linux

## System setup

Aero uses Node.js 22. On Nobara/Fedora, install the required native package
tools with:

```sh
sudo dnf install nodejs dpkg rpm-build fakeroot
```

Then install the locked JavaScript dependencies:

```sh
npm ci
npm run doctor
```

No Java SDK, Android SDK, Rust toolchain, Wine, Docker, or Inno Setup is
required. Project configuration and test data remain inside the repository;
packaged user data remains in Electron's `userData` directory.

## Development and tests

```sh
npm run dev
npm run test
node scripts/run-electron-vite.cjs build
```

Development instances use `.dev-data/`, so they cannot overwrite packaged
application settings.

## Native Linux packages

Build every Linux format:

```sh
npm run build:linux
```

Build a single format:

```sh
npm run build:linux:appimage
npm run build:linux:rpm
npm run build:linux:deb
```

Outputs are placed in `dist/build/linux/`. Release candidates and their
checksums are placed in `dist/build/artifacts/` by:

```sh
node scripts/ci-build-release.cjs --platform=linux
```

## Updates

- AppImage installations can download, verify, atomically replace, and restart
  the AppImage from inside Aero. The `aerop2p update` command remains available
  for installations made through `install.sh`.
- RPM and DEB installations check for new releases, then open the release page.
  System packages are never replaced without the user's package-manager
  confirmation.
- Windows desktop installations download the normal NSIS setup, verify both
  SHA-256 and SHA-512, and start it silently after closing Aero.
- Releases never generate or upload a legacy online-installer asset.
- Microsoft Store installations continue to use Store-managed updates.

## Releases

The local Linux machine builds AppImage, RPM, and DEB. GitHub Actions builds
only the Windows NSIS setup and Microsoft Store APPX on `windows-2022`.

Before releasing, commit all work. Then start the interactive release UI:

```sh
npm run release
```

The Clack interface selects the next patch/minor/major/custom version, update
importance and minimum-version policy, Chrome extension handling, optional
release highlights, and whether GitHub should publish automatically or keep a
draft for review. Nothing is changed until the final confirmation.

The release command:

1. tests the project;
2. bumps the version;
3. builds and verifies native Linux packages;
4. optionally builds and publishes the Chrome extension;
5. pushes the release commit and tag;
6. creates a draft GitHub release and uploads the selected local files;
7. dispatches the Windows workflow;
8. lets the Windows workflow add the setup and update manifest, retain the
   APPX as a private workflow artifact, and either publish or retain the draft.
