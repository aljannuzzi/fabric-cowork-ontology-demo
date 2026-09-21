$ErrorActionPreference = "Stop"

$tid = "<TENANT_ID>"
$ws  = "<WORKSPACE_ID>"
$lh  = "<LAKEHOUSE_ID>"

$storageToken = az account get-access-token --tenant $tid --resource https://storage.azure.com --query accessToken -o tsv
$fabricToken  = az account get-access-token --tenant $tid --resource https://api.fabric.microsoft.com --query accessToken -o tsv

$sh = @{ Authorization = "Bearer $storageToken"; "x-ms-version" = "2021-10-04" }
$fh = @{ Authorization = "Bearer $fabricToken"; "Content-Type" = "application/json" }

$tables = @("customers", "products", "subscriptions", "usage_metrics", "support_tickets", "renewals")

foreach ($t in $tables) {
  $local = Join-Path $PSScriptRoot "data\$t.csv"
  $bytes = [IO.File]::ReadAllBytes($local)
  $url = "https://onelake.dfs.fabric.microsoft.com/$ws/$lh/Files/novatel/$t.csv"

  Invoke-WebRequest "$url`?resource=file" -Method Put -Headers $sh -TimeoutSec 120 | Out-Null
  Invoke-WebRequest "$url`?action=append&position=0" -Method Patch -Headers $sh -Body $bytes -ContentType "application/octet-stream" -TimeoutSec 180 | Out-Null
  Invoke-WebRequest "$url`?action=flush&position=$($bytes.Length)" -Method Patch -Headers $sh -TimeoutSec 120 | Out-Null

  Write-Host "upload OK: $t.csv ($($bytes.Length) bytes)"
}

Write-Host ""
Write-Host "Carregando como tabelas Delta..."

foreach ($t in $tables) {
  $body = @{
    relativePath = "Files/novatel/$t.csv"
    pathType     = "File"
    mode         = "Overwrite"
    formatOptions = @{ format = "Csv"; header = $true; delimiter = "," }
  } | ConvertTo-Json -Depth 5

  try {
    $r = Invoke-WebRequest "https://api.fabric.microsoft.com/v1/workspaces/$ws/lakehouses/$lh/tables/$t/load" `
      -Method Post -Headers $fh -Body $body -TimeoutSec 180
    Write-Host "load OK: $t (status $($r.StatusCode))"
  }
  catch {
    $m = $_.ErrorDetails.Message
    if (-not $m) { $m = $_.Exception.Message }
    Write-Host "load FALHA: $t -> $m"
  }
}
