param(
  [string]$ResourceGroup = "rg-fabric-cowork-ontology-demo",
  [string]$Location = "eastus",
  [string]$AppName = "fabric-cowork-ontology-demo",
  [string]$SqlServerName = "sql-fabric-cowork-ontology-demo",
  [string]$SqlDatabase = "novatel-ontology",
  [string]$SqlAdmin = "sqladminuser"
)

$ErrorActionPreference = "Stop"

$bytes = New-Object byte[] 18
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$password = ([Convert]::ToBase64String($bytes) -replace '[+/=]', '9') + "aA1!"

az group create --name $ResourceGroup --location $Location | Out-Null
az sql server create --name $SqlServerName --resource-group $ResourceGroup --location $Location --admin-user $SqlAdmin --admin-password $password | Out-Null
az sql server firewall-rule create --resource-group $ResourceGroup --server $SqlServerName --name AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 | Out-Null
az sql db create --resource-group $ResourceGroup --server $SqlServerName --name $SqlDatabase --service-objective Basic --backup-storage-redundancy Local | Out-Null

az appservice plan create --resource-group $ResourceGroup --name "$AppName-plan" --is-linux --sku B1 | Out-Null
az webapp create --resource-group $ResourceGroup --plan "$AppName-plan" --name $AppName --runtime "NODE:20-lts" | Out-Null
az webapp config appsettings set --resource-group $ResourceGroup --name $AppName --settings `
  SQL_SERVER="$SqlServerName.database.windows.net" `
  SQL_DATABASE="$SqlDatabase" `
  SQL_USER="$SqlAdmin" `
  SQL_PASSWORD="$password" `
  SCM_DO_BUILD_DURING_DEPLOYMENT=true | Out-Null

npm install
Compress-Archive -Path .\* -DestinationPath .\deploy.zip -Force
az webapp deploy --resource-group $ResourceGroup --name $AppName --src-path .\deploy.zip --type zip | Out-Null
Remove-Item .\deploy.zip -Force

az webapp show --resource-group $ResourceGroup --name $AppName --query defaultHostName -o tsv
