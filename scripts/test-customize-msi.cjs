const assert = require("node:assert/strict");
const { customizeMsiProject } = require("./customize-msi.cjs");

const result = customizeMsiProject(
  "<Wix>\n  <Product>\n  </Product>\n</Wix>\n",
);
assert.match(
  result,
  /\[SystemFolder\]taskkill\.exe&quot; \/IM &quot;Aero P2P Chat\.exe&quot; \/T \/F/,
);
assert.match(result, /REMOVE=&quot;ALL&quot; AND NOT UPGRADINGPRODUCTCODE/);
assert.match(result, /uninstall-cleanup\.ps1/);
assert.match(result, /UILevel &gt;= 3/);
assert.match(result, /StopAeroProcesses" Before="PromptDeleteAeroUserData/);

console.log("MSI customization tests passed.");
