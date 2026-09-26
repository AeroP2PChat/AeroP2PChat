# Aero P2P Chat

Aero P2P Chat is a fast, direct chat app for Windows and Linux.
Connect directly with other people without routing messages through a central
chat server.

## Download

Download the latest version from the
[SourceForge download page](https://sourceforge.net/projects/aerop2pchat/files/).

You can also find the app and more information on the
[official website](https://popipo.de/app/aero).

## Installation

### Windows

Download and open the setup file (`.exe`), then follow the installer steps.

### Linux

For a normal desktop installation (application-menu entry, icon, update
command, and AppImage dependencies), run:

```sh
curl -fsSL https://raw.githubusercontent.com/Zorblock/AeroP2Pchat/main/install.sh | sh -s -- install
```

The installer places the app in your user account, so no application files are
written into the system installation directory. To update later, run
`aerop2p update`.

## Start a chat

1. Open Aero P2P Chat.
2. Copy your displayed Peer ID and send it to the person you want to chat with.
3. Paste their Peer ID into the Remote Peer ID field.
4. Select Connect and start chatting.

## Features

- Direct peer-to-peer messaging
- Consent-based, disk-streamed P2P image and file transfers with integrity and file-type checks
- Screen sharing
- Fast, direct connections
- Native packages for Windows and Linux

## Development on Nobara/Fedora

Install the local build tools once:

```sh
sudo dnf install nodejs dpkg rpm-build fakeroot
npm ci
```

Start the app with `npm run dev`. Build all native Linux packages with
`npm run build:linux`, or use `npm run build:linux:appimage`,
`npm run build:linux:rpm`, and `npm run build:linux:deb` for one format.
Artifacts are written below `dist/build/linux/`.

Windows setup and Microsoft Store APPX packages are built by the
`Windows Release` GitHub Actions workflow on a native Windows runner.
See [DEVELOPMENT.md](./DEVELOPMENT.md) for the complete setup, build, update,
and release workflow.

## Help and feedback

Send questions, bug reports, and suggestions through
[GitHub Issues](https://github.com/Zorblock/AeroP2Pchat/issues).

## Source code and license

The source code is available on [GitHub](https://github.com/Zorblock/AeroP2Pchat).
Aero P2P Chat is licensed under the [MIT License](./LICENSE).
