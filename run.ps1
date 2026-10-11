# Starts the living town and the 3D viewer together, then opens the browser.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting the town. The first start takes a minute or two while it builds."
Start-Process powershell -WorkingDirectory $root -ArgumentList '-NoExit', '-Command', 'cargo run --release -p polis_cli -- serve 1 200 8787'
Start-Process powershell -WorkingDirectory "$root\viewer" -ArgumentList '-NoExit', '-Command', 'npm run dev'

function Wait-For($url, $name) {
  for ($i = 0; $i -lt 300; $i++) {
    try {
      Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2 | Out-Null
      Write-Host "$name is ready."
      return
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  Write-Host "$name did not start. Look at its window for the reason."
}

Wait-For "http://127.0.0.1:8787/api/town" "The town"
Wait-For "http://localhost:5173/world.html" "The viewer"
Start-Process "http://localhost:5173/world.html"
Write-Host "Close the two PowerShell windows to stop everything."
