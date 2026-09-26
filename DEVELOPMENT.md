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
- Microsoft Store installations continue to use Store-managed updates.

## Releases

The local Linux machine builds AppImage, RPM, and DEB. GitHub Actions builds
only the Windows NSIS setup and Microsoft Store APPX on `windows-2022`.

Before releasing, commit all work. Then use one of:

```sh
npm run patch
npm run release
npm run patch:important
```

The release command:

1. tests the project;
2. bumps the version;
3. builds and verifies native Linux packages;
4. pushes the release commit and tag;
5. creates a draft GitHub release and uploads the Linux files;
6. dispatches the Windows workflow;
7. lets the Windows workflow add the setup and update manifest, retain the
   APPX as a private workflow artifact, and publish the release.

The legacy `Aero-P2P-Chat-Online-Installer.exe` release asset is temporarily an
identical copy of the normal NSIS setup. It contains no Rust downloader and is
not advertised. Its only purpose is to move already released Windows clients
from the old updater contract to the direct-setup updater.
