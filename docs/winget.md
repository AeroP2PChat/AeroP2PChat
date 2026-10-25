# WinGet publishing

Aero P2P Chat uses the package identifier `Tenkayro.AeroP2PChat`. The first
version must be submitted interactively and accepted into Microsoft's community
repository. Later published releases submit their version update automatically
from the local release script. No GitHub Actions secret is required.

## 1. Submit the first version

1. Make sure the GitHub release is public and contains
   `Aero-P2P-Chat-Windows-x64-Setup.msi`.
2. Install Microsoft's manifest creator on Windows:

   ```powershell
   winget install --id Microsoft.WingetCreate --exact
   ```

3. Run the project helper:

   ```powershell
   npm run winget:setup
   ```

   This starts WingetCreate's local GitHub OAuth login and then opens its
   interactive `new` flow using the current release MSI URL. The equivalent
   direct command for version 26.70.0 is:

   ```powershell
   wingetcreate new "https://github.com/AeroP2PChat/AeroP2PChat/releases/download/v26.70.0/Aero-P2P-Chat-Windows-x64-Setup.msi"
   ```

4. Review the values detected from the MSI and use these package values:

   - Package identifier: `Tenkayro.AeroP2PChat`
   - Package version: the release version without the leading `v`
   - Publisher: `Tenkayro`
   - Package name: `Aero P2P Chat`
   - License: `MIT`
   - Installer scope: `machine`
   - Architecture: `x64`
   - Project URL: `https://github.com/AeroP2PChat/AeroP2PChat`

5. Let WingetCreate submit the pull request. Sign in to GitHub when its OAuth
   flow opens.
6. Complete the Microsoft Contributor License Agreement if the PR bot requests
   it, then wait for the validation and review to finish.
7. After the package reaches the public catalog, verify it:

   ```powershell
   winget source update
   winget show --id Tenkayro.AeroP2PChat --exact
   winget install --id Tenkayro.AeroP2PChat --exact
   ```

## 2. Verify the local setup

After Microsoft has merged the first package pull request and the package has
reached the public catalog, run:

```powershell
npm run winget:check
```

The release preflight performs the same check before it changes the version or
builds installers. WingetCreate keeps the OAuth authorization in the local user
profile. No token is passed as a command argument, committed to Git, or stored
as a repository secret.

## 3. Automated release behavior

`npm run release` creates the Windows packages and draft release, then dispatches
`.github/workflows/linux-release.yml`. For a published release, the complete
flow is:

1. builds and uploads AppImage, RPM, and DEB packages;
2. publishes the completed GitHub release;
3. the local release script confirms that the GitHub workflow succeeded;
4. it runs `wingetcreate update Tenkayro.AeroP2PChat` with the released MSI URL;
5. WingetCreate submits the new version as a pull request to
   `microsoft/winget-pkgs` using the locally cached OAuth authorization.

Draft releases never submit a WinGet update. If an automatic submission needs
to be repeated, use the current package version or pass a version explicitly:

```powershell
npm run winget:update
node scripts/winget.cjs update 26.71.0
```
