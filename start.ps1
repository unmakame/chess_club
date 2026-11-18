$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path -LiteralPath '.env')) {
    $file = [IO.File]::Open((Join-Path $PWD '.env'), 'CreateNew')
    try {
        $content = "ADMIN_DB_PASSWORD=$([guid]::NewGuid())`nDB_PASSWORD=$([guid]::NewGuid())`n"
        $bytes = [Text.Encoding]::ASCII.GetBytes($content)
        $file.Write($bytes, 0, $bytes.Length)
    } finally { $file.Dispose() }
}
docker compose up -d --build web worker
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Write-Host 'Откройте http://localhost:8080'
