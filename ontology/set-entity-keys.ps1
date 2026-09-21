$ErrorActionPreference = "Stop"

$tid = "<TENANT_ID>"
$ws  = "<WORKSPACE_ID>"
$ont = "<ONTOLOGY_ID_V1>"

$keys = @{
  "Customer"     = "customer_id"
  "Product"      = "product_id"
  "Subscription" = "subscription_id"
  "Usage"        = "usage_id"
  "Experience"   = "ticket_id"
  "RenewalRisk"  = "renewal_id"
}

$token = az account get-access-token --tenant $tid --resource https://api.fabric.microsoft.com --query accessToken -o tsv
$h = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

$current = Invoke-RestMethod "https://api.fabric.microsoft.com/v1/workspaces/$ws/ontologies/$ont/getDefinition" `
  -Method Post -Headers $h -TimeoutSec 180

$parts = @{}
foreach ($p in $current.definition.parts) {
  $parts[$p.path] = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p.payload))
}

foreach ($entity in $keys.Keys) {
  $path = "tables/$entity.tmdl"
  if (-not $parts.ContainsKey($path)) { Write-Host "sem $path"; continue }

  $keyCol = $keys[$entity]
  $text = $parts[$path]

  if ($text -match "(?m)^\t\tisKey: true\r?$") {
    Write-Host "$entity ja tem isKey"
    continue
  }

  # insere isKey logo apos a linha 'column <keyCol>'
  $pattern = "(?m)^(\tcolumn $([regex]::Escape($keyCol))\r?\n)"
  if ($text -notmatch $pattern) {
    Write-Host "$entity -> coluna $keyCol nao encontrada"
    continue
  }

  $parts[$path] = [regex]::Replace($text, $pattern, "`$1`t`tisKey: true`r`n", 1)
  Write-Host "$entity -> isKey em $keyCol"
}

$payloadParts = @()
foreach ($path in $parts.Keys) {
  $payloadParts += @{
    path        = $path
    payload     = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($parts[$path]))
    payloadType = "InlineBase64"
  }
}

$body = @{ definition = @{ parts = $payloadParts } } | ConvertTo-Json -Depth 8

try {
  $r = Invoke-WebRequest "https://api.fabric.microsoft.com/v1/workspaces/$ws/ontologies/$ont/updateDefinition?updateMetadata=true" `
    -Method Post -Headers $h -Body $body -TimeoutSec 300
  Write-Host "SUCESSO status=$($r.StatusCode)" -ForegroundColor Green
}
catch {
  $m = $_.ErrorDetails.Message
  if (-not $m) { $m = $_.Exception.Message }
  Write-Host "FALHA:" -ForegroundColor Yellow
  Write-Host $m
}
