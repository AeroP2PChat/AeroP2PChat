const fs = require("node:fs");
const packageMetadata = require("../package.json");
const projectConfig = require("../config.json");

function escapeXmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function createArpProperties() {
  const repositoryUrl = `https://github.com/${projectConfig.repo}`;
  const properties = {
    ARPCOMMENTS: packageMetadata.description,
    ARPCONTACT: packageMetadata.author.email,
    ARPHELPLINK: `${repositoryUrl}/issues`,
    ARPREADME: `${repositoryUrl}#readme`,
    ARPURLINFOABOUT: packageMetadata.author.url,
    ARPURLUPDATEINFO: `${repositoryUrl}/releases`,
  };

  return Object.entries(properties)
    .map(
      ([id, value]) =>
        `    <Property Id="${id}" Value="${escapeXmlAttribute(value)}" />`,
    )
    .join("\n");
}

function customizeMsiProject(source) {
  const anchor = "  </Product>";
  if (!source.includes(anchor)) {
    throw new Error("Could not find the MSI Product closing tag.");
  }

  const customization = `
    <!-- Metadata shown by Windows and uninstall-management applications. -->
${createArpProperties()}

    <!-- Directory properties must be copied after Windows Installer resolves them. -->
    <CustomAction Id="SetArpInstallLocation"
                  Property="ARPINSTALLLOCATION"
                  Value="[APPLICATIONFOLDER]"
                  Execute="immediate" />

    <!-- Stop tray/background processes before files are replaced or removed. -->
    <CustomAction Id="StopAeroProcesses"
                  Directory="APPLICATIONFOLDER"
                  ExeCommand='&quot;[SystemFolder]taskkill.exe&quot; /IM &quot;Aero P2P Chat.exe&quot; /T /F'
                  Execute="deferred"
                  Impersonate="no"
                  Return="ignore"/>

    <!-- Ask before deleting per-user data. This never runs during an upgrade. -->
    <CustomAction Id="PromptDeleteAeroUserData"
                  Directory="APPLICATIONFOLDER"
                  ExeCommand='&quot;[SystemFolder]WindowsPowerShell\\v1.0\\powershell.exe&quot; -NoProfile -NonInteractive -ExecutionPolicy Bypass -File &quot;[APPLICATIONFOLDER]resources\\uninstall-cleanup.ps1&quot;'
                  Execute="deferred"
                  Impersonate="yes"
                  Return="check"/>

    <InstallExecuteSequence>
      <Custom Action="SetArpInstallLocation" After="CostFinalize">NOT Installed</Custom>
      <Custom Action="StopAeroProcesses" Before="PromptDeleteAeroUserData">Installed OR WIX_UPGRADE_DETECTED</Custom>
      <Custom Action="PromptDeleteAeroUserData" Before="RemoveFiles">REMOVE=&quot;ALL&quot; AND NOT UPGRADINGPRODUCTCODE AND UILevel &gt;= 3</Custom>
    </InstallExecuteSequence>
`;

  return source.replace(anchor, `${customization}${anchor}`);
}

async function customizeMsi(projectPath) {
  const source = fs.readFileSync(projectPath, "utf8");
  fs.writeFileSync(projectPath, customizeMsiProject(source), "utf8");
}

module.exports = customizeMsi;
module.exports.customizeMsiProject = customizeMsiProject;
