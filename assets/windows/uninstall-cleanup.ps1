Add-Type -AssemblyName PresentationFramework

$choice = [System.Windows.MessageBox]::Show(
  "Also delete Aero P2P Chat settings, contacts, chats, and downloaded app data for the current Windows user?`n`nThis cannot be undone.",
  "Uninstall Aero P2P Chat",
  [System.Windows.MessageBoxButton]::YesNo,
  [System.Windows.MessageBoxImage]::Question,
  [System.Windows.MessageBoxResult]::No
)

if ($choice -ne [System.Windows.MessageBoxResult]::Yes) {
  exit 0
}

$dataPaths = @(
  (Join-Path $env:APPDATA "zorblock\userData\Aero P2P Chat"),
  (Join-Path $env:APPDATA "Aero P2P Chat")
)

foreach ($dataPath in $dataPaths) {
  if (Test-Path -LiteralPath $dataPath) {
    Remove-Item -LiteralPath $dataPath -Recurse -Force
  }
}
