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
curl -fsSL https://zorblock.de/sh/aero | sh
```

If the short URL is unavailable:

```sh
curl -fsSL https://raw.githubusercontent.com/Zorblock/AeroP2Pchat/main/install.sh | sh
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

- [Website](https://zorblock.de/app/aero/)
- [Releases](https://github.com/Zorblock/AeroP2Pchat/releases/latest)
- [Issues](https://github.com/Zorblock/AeroP2Pchat/issues)
- [MIT License](./LICENSE)

[badge-windows]: https://img.shields.io/badge/Windows-Download_Setup-0078D4?style=for-the-badge&logo=windows11&logoColor=white
[badge-store]: https://img.shields.io/badge/Microsoft_Store-Get_the_app-5E5E5E?style=for-the-badge&logo=microsoft&logoColor=white
[badge-appimage]: https://img.shields.io/badge/Linux-AppImage-F9C440?style=for-the-badge&logo=linux&logoColor=black
[badge-rpm]: https://img.shields.io/badge/Fedora%20%2F%20Nobara-RPM-51A2DA?style=for-the-badge&logo=fedora&logoColor=white
[badge-deb]: https://img.shields.io/badge/Debian%20%2F%20Ubuntu-DEB-A81D33?style=for-the-badge&logo=debian&logoColor=white
[download-windows]: https://github.com/Zorblock/AeroP2Pchat/releases/latest/download/Aero-P2P-Chat-Windows-x64-Setup.exe
[download-store]: https://apps.microsoft.com/detail/9MTXC0M7P403
[download-appimage]: https://github.com/Zorblock/AeroP2Pchat/releases/latest/download/Aero-P2P-Chat-Linux-x64.AppImage
[download-rpm]: https://github.com/Zorblock/AeroP2Pchat/releases/latest/download/Aero-P2P-Chat-Linux-x64.rpm
[download-deb]: https://github.com/Zorblock/AeroP2Pchat/releases/latest/download/Aero-P2P-Chat-Linux-x64.deb
