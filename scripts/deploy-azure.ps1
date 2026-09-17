param(
  [string]$ResourceGroup = "rg-fabric-cowork-ontology-demo",
  [string]$Location = "brazilsouth",
  [string]$AppName = "",
  [string]$SqlServerName = "",
  [string]$SqlDatabase = "novatel-ontology",
  [string]$SqlAdmin = ""
)

$ErrorActionPreference = "Stop"

$suffix = (az account show --query id -o tsv).Substring(0, 8).ToLower()
$signedInUser = az ad signed-in-user show | ConvertFrom-Json
$sqlAdminName = if ($SqlAdmin) { $SqlAdmin } else { $signedInUser.userPrincipalName }

if (-not $AppName) {
  $AppName = "fabric-cowork-ontology-$suffix"
}

if (-not $SqlServerName) {
  $regionSuffix = if ($Location -eq "brazilsouth") { "br" } else { $Location.Replace(" ", "").ToLower().Substring(0, [Math]::Min(3, $Location.Length)) }
  $SqlServerName = "sql-fabric-cowork-$suffix-$regionSuffix"
}

az group create --name $ResourceGroup --location $Location | Out-Null
az provider register --namespace Microsoft.Sql --wait | Out-Null
az provider register --namespace Microsoft.App --wait | Out-Null
az provider register --namespace Microsoft.OperationalInsights --wait | Out-Null

$existingServer = az sql server show --name $SqlServerName --resource-group $ResourceGroup 2>$null
if (-not $existingServer) {
  az sql server create --name $SqlServerName --resource-group $ResourceGroup --location $Location --enable-ad-only-auth --external-admin-name $sqlAdminName --external-admin-sid $signedInUser.id --external-admin-principal-type User | Out-Null
}

$existingDatabase = az sql db show --resource-group $ResourceGroup --server $SqlServerName --name $SqlDatabase 2>$null
if (-not $existingDatabase) {
  az sql db create --resource-group $ResourceGroup --server $SqlServerName --name $SqlDatabase --service-objective Basic --backup-storage-redundancy Local | Out-Null
}

npm install
az containerapp up --name $AppName --resource-group $ResourceGroup --location $Location --source . --ingress external --target-port 3000 --system-assigned --env-vars NODE_ENV=production | Out-Null

$env:SQL_SERVER = "$SqlServerName.database.windows.net"
$env:SQL_DATABASE = $SqlDatabase
$env:SQL_APP_PRINCIPAL = $AppName
node .\scripts\grant-sql-access.js

az containerapp update --name $AppName --resource-group $ResourceGroup --set-env-vars `
  SQL_SERVER="$SqlServerName.database.windows.net" `
  SQL_DATABASE="$SqlDatabase" `
  SQL_AUTH=entra | Out-Null

az containerapp show --resource-group $ResourceGroup --name $AppName --query properties.configuration.ingress.fqdn -o tsv
