const assert = require("node:assert/strict");
const { customizeMsiProject } = require("./customize-msi.cjs");

const result = customizeMsiProject("<Wix>\n  <Product>\n  </Product>\n</Wix>\n");
assert.match(result, /\[SystemFolder\]taskkill\.exe&quot; \/IM &quot;Aero P2P Chat\.exe&quot; \/T \/F/);
assert.match(result, /REMOVE=&quot;ALL&quot; AND NOT UPGRADINGPRODUCTCODE/);
assert.match(result, /uninstall-cleanup\.ps1/);
assert.match(result, /UILevel &gt;= 3/);
assert.match(result, /StopAeroProcesses" Before="PromptDeleteAeroUserData/);
assert.match(
  result,
  /<Property Id="ARPCOMMENTS" Value="A clean peer-to-peer chat client for Windows and Linux\." \/>/,
);
assert.match(
  result,
  /<Property Id="ARPCONTACT" Value="92232204\+Tenkayro@users\.noreply\.github\.com" \/>/,
);
assert.match(
  result,
  /<CustomAction Id="SetArpInstallLocation"[\s\S]*Property="ARPINSTALLLOCATION"[\s\S]*Value="\[APPLICATIONFOLDER\]"/,
);
assert.match(
  result,
  /<Custom Action="SetArpInstallLocation" After="CostFinalize">NOT Installed<\/Custom>/,
);
assert.match(
  result,
  /<Property Id="ARPHELPLINK" Value="https:\/\/github\.com\/AeroP2PChat\/AeroP2PChat\/issues" \/>/,
);
assert.match(
  result,
  /<Property Id="ARPREADME" Value="https:\/\/github\.com\/AeroP2PChat\/AeroP2PChat#readme" \/>/,
);
assert.match(
  result,
  /<Property Id="ARPURLINFOABOUT" Value="https:\/\/github\.com\/AeroP2PChat\/AeroP2PChat" \/>/,
);
assert.match(
  result,
  /<Property Id="ARPURLUPDATEINFO" Value="https:\/\/github\.com\/AeroP2PChat\/AeroP2PChat\/releases" \/>/,
);

console.log("MSI customization tests passed.");
