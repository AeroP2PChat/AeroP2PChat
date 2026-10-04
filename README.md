# Aero P2P Chat

A private peer-to-peer chat for Windows and Linux. No account, no central chat
server.

## Download

### Windows

[![Download for Windows][badge-windows]][download-windows]
[![Get it from Microsoft Store][badge-store]][download-store]

### Linux

Open the interactive installer and choose what you want to do:

```sh
curl -fsSL https://tenkayro.de/sh/aero | sh
```

If the short URL is unavailable:

```sh
curl -fsSL https://raw.githubusercontent.com/AeroP2PChat/AeroP2PChat/main/install.sh | sh
```

Manual downloads:

[![Download Linux AppImage][badge-appimage]][download-appimage]
[![Download Linux RPM][badge-rpm]][download-rpm]
[![Download Linux DEB][badge-deb]][download-deb]

| Package | Systems | Install |
| --- | --- | --- |
| RPM | Nobara, Fedora, RHEL | `sudo dnf install ./Aero-P2P-Chat-Linux-x64.rpm` |
| DEB | Ubuntu, Debian, Mint | `sudo apt install ./Aero-P2P-Chat-Linux-x64.deb` |
| AppImage | Other x64 distributions | `chmod +x Aero-P2P-Chat-Linux-x64.AppImage && ./Aero-P2P-Chat-Linux-x64.AppImage` |

Manage an installation created by the script:

```sh
aerop2p update
aerop2p status
aerop2p repair
aerop2p uninstall
```

## Development and releases

Local development and release preparation use Windows with Node.js 22, Git,
GitHub CLI and npm. Check the workstation with `npm run doctor`.

- `npm run dev` starts the Electron development build.
- `npm run build` or `npm run build:windows` builds the Windows NSIS setup and
  Microsoft Store APPX locally.
- `npm run build:store` builds only the Microsoft Store APPX.
- `npm run release` builds and uploads the Windows setup locally, keeps the APPX
  for Partner Center, and starts the Linux GitHub Actions workflow.
- `.github/workflows/linux-release.yml` builds AppImage, RPM and DEB natively on
  Ubuntu, completes `latest.yml`, and optionally publishes the draft release.

The Linux-only `build:linux:*` commands remain available for CI and native Linux
diagnostics; they intentionally fail on Windows instead of cross-compiling.

## Start chatting

1. Share your Peer ID.
2. Enter the other person's Peer ID.
3. Connect.

## Features

- Direct peer-to-peer messaging
- Secure image and file transfers
- Voice and video calls
- Screen sharing
- Update checks for Windows and Linux

## Links

- [Website](https://tenkayro.de/app/aero/)
- [Releases](https://github.com/AeroP2PChat/AeroP2PChat/releases/latest)
- [Issues](https://github.com/AeroP2PChat/AeroP2PChat/issues)
- [MIT License](./LICENSE)

[badge-windows]: https://img.shields.io/badge/Windows-Download_Setup-0078D4?style=for-the-badge&logo=windows11&logoColor=white
[badge-store]: https://img.shields.io/badge/Microsoft_Store-Get_the_app-5E5E5E?style=for-the-badge&logo=microsoft&logoColor=white
[badge-appimage]: https://img.shields.io/badge/Linux-AppImage-F9C440?style=for-the-badge&logo=linux&logoColor=black
[badge-rpm]: https://img.shields.io/badge/Fedora%20%2F%20Nobara-RPM-51A2DA?style=for-the-badge&logo=fedora&logoColor=white
[badge-deb]: https://img.shields.io/badge/Debian%20%2F%20Ubuntu-DEB-A81D33?style=for-the-badge&logo=debian&logoColor=white
[download-windows]: https://github.com/AeroP2PChat/AeroP2PChat/releases/latest/download/Aero-P2P-Chat-Windows-x64-Setup.exe
[download-store]: https://apps.microsoft.com/detail/9MTXC0M7P403
[download-appimage]: https://github.com/AeroP2PChat/AeroP2PChat/releases/latest/download/Aero-P2P-Chat-Linux-x64.AppImage
[download-rpm]: https://github.com/AeroP2PChat/AeroP2PChat/releases/latest/download/Aero-P2P-Chat-Linux-x64.rpm
[download-deb]: https://github.com/AeroP2PChat/AeroP2PChat/releases/latest/download/Aero-P2P-Chat-Linux-x64.deb
