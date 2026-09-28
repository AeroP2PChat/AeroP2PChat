# Aero P2P Chat

Aero P2P Chat is a fast desktop chat app for Windows and Linux. Messages,
images, files, calls, and screen sharing connect directly between peers instead
of passing through a central chat server.

<p align="center">
  <a href="https://github.com/Zorblock/AeroP2Pchat/releases/latest/download/Aero-P2P-Chat-Windows-x64-Setup.exe"><img alt="Download for Windows" src="https://img.shields.io/badge/Windows-Download_Setup-0078D4?style=for-the-badge&logo=windows11&logoColor=white"></a>
  <a href="https://apps.microsoft.com/detail/9MTXC0M7P403"><img alt="Get it from Microsoft Store" src="https://img.shields.io/badge/Microsoft_Store-Get_the_app-5E5E5E?style=for-the-badge&logo=microsoft&logoColor=white"></a>
</p>

<p align="center">
  <a href="https://github.com/Zorblock/AeroP2Pchat/releases/latest/download/Aero-P2P-Chat-Linux-x64.AppImage"><img alt="Download Linux AppImage" src="https://img.shields.io/badge/Linux-AppImage-F9C440?style=for-the-badge&logo=linux&logoColor=black"></a>
  <a href="https://github.com/Zorblock/AeroP2Pchat/releases/latest/download/Aero-P2P-Chat-Linux-x64.rpm"><img alt="Download Linux RPM" src="https://img.shields.io/badge/Fedora%20%2F%20Nobara-RPM-51A2DA?style=for-the-badge&logo=fedora&logoColor=white"></a>
  <a href="https://github.com/Zorblock/AeroP2Pchat/releases/latest/download/Aero-P2P-Chat-Linux-x64.deb"><img alt="Download Linux DEB" src="https://img.shields.io/badge/Debian%20%2F%20Ubuntu-DEB-A81D33?style=for-the-badge&logo=debian&logoColor=white"></a>
</p>

All downloads above always point to the latest stable release. The desktop
packages currently support 64-bit Intel/AMD systems (`x86_64`).

## Installation

### Windows

Choose one of these versions:

- **Windows setup:** [Download the latest `.exe`](https://github.com/Zorblock/AeroP2Pchat/releases/latest/download/Aero-P2P-Chat-Windows-x64-Setup.exe), open it, and follow the installation steps.
- **Microsoft Store:** [Open Aero P2P Chat in Microsoft Store](https://apps.microsoft.com/detail/9MTXC0M7P403). Installation and updates are handled by the Store.

Windows may show a security confirmation for apps downloaded from the web.
Check that the publisher and file source are correct before continuing.

### Linux

The automatic installer is the easiest option. It detects your distribution,
downloads the matching package, verifies its checksum and file size, installs
the required dependencies, and configures the application menu, icons, and the
`aerop2p` command:

```sh
curl -fsSL https://raw.githubusercontent.com/Zorblock/AeroP2Pchat/main/install.sh | sh -s -- install
```

It selects:

- RPM with `dnf` on Nobara, Fedora, RHEL, Rocky Linux, and AlmaLinux;
- DEB with `apt-get` on Ubuntu, Debian, Linux Mint, and Pop!_OS;
- AppImage on other distributions or when root/`sudo` is unavailable.

Native RPM and DEB installations ask for `sudo` because the system package
manager installs Aero and its dependencies. The AppImage remains entirely in
your user account and does not need `sudo`.

Manage an installation created by the script with:

```sh
aerop2p update
aerop2p status
aerop2p repair
aerop2p uninstall
```

To force a specific format, append `--rpm`, `--deb`, or `--appimage` to the
installer command. For example:

```sh
curl -fsSL https://raw.githubusercontent.com/Zorblock/AeroP2Pchat/main/install.sh | sh -s -- install --appimage
```

For a manual installation, choose the package matching your system:

| System | Package | Installation |
| --- | --- | --- |
| Nobara, Fedora, RHEL | [Download RPM](https://github.com/Zorblock/AeroP2Pchat/releases/latest/download/Aero-P2P-Chat-Linux-x64.rpm) | `sudo dnf install ./Aero-P2P-Chat-Linux-x64.rpm` |
| Ubuntu, Debian, Linux Mint | [Download DEB](https://github.com/Zorblock/AeroP2Pchat/releases/latest/download/Aero-P2P-Chat-Linux-x64.deb) | `sudo apt install ./Aero-P2P-Chat-Linux-x64.deb` |
| Other Linux distributions | [Download AppImage](https://github.com/Zorblock/AeroP2Pchat/releases/latest/download/Aero-P2P-Chat-Linux-x64.AppImage) | See the commands below |

Run the AppImage manually:

```sh
chmod +x Aero-P2P-Chat-Linux-x64.AppImage
./Aero-P2P-Chat-Linux-x64.AppImage
```

## Start a chat

1. Open Aero P2P Chat.
2. Copy your Peer ID and send it to the person you want to chat with.
3. Paste their Peer ID into the **Remote Peer ID** field.
4. Select **Connect** and start chatting.

## Features

- Direct peer-to-peer messaging
- Images and large files streamed directly to the chosen destination
- Transfer consent, integrity checks, and file-type validation
- Voice and video calls
- Screen sharing
- Native Windows and Linux packages
- Built-in update checks

## More information

- [Latest release and release notes](https://github.com/Zorblock/AeroP2Pchat/releases/latest)
- [Official website](https://zorblock.de/app/aero/)
- [Help, bug reports, and suggestions](https://github.com/Zorblock/AeroP2Pchat/issues)

## License

Aero P2P Chat is licensed under the [MIT License](./LICENSE).
