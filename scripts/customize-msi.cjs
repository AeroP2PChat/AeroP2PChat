const fs = require("node:fs");

function customizeMsiProject(source) {
  const anchor = "  </Product>";
  if (!source.includes(anchor)) {
    throw new Error("Could not find the MSI Product closing tag.");
  }

  const customization = `
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
