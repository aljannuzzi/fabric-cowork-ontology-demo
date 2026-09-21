param(
  [string]$ResourceGroup = "rg-fabric-cowork-ontology-demo",
  [string]$Location = "brazilsouth",
  [string]$AppName = "fabric-ontology-agent",
  [string]$SqlDatabase = "novatel-ontology"
)

$ErrorActionPreference = "Stop"
$env:PYTHONIOENCODING = "utf-8"

$subscriptionId = az account show --query id -o tsv
$suffix = $subscriptionId.Substring(0, 8).ToLower()
$signedInUser = az ad signed-in-user show | ConvertFrom-Json

$SqlServerName = "sql-fabric-cowork-$suffix-br"
$VnetName = "vnet-fabric-cowork-$suffix"
$AcaSubnet = "snet-containerapps"
$PeSubnet = "snet-private-endpoints"
$EnvName = "fabric-cowork-ontology-$suffix-vnet-env"
$AcrName = "acr<ACR_PREFIX>$suffix"
$SqlZone = "privatelink.database.windows.net"

Write-Host "Registering resource providers..."
foreach ($ns in @("Microsoft.Sql", "Microsoft.App", "Microsoft.OperationalInsights", "Microsoft.Network", "Microsoft.ContainerRegistry")) {
  az provider register --namespace $ns --wait | Out-Null
}
az feature register --namespace Microsoft.Network --name AllowBringYourOwnPublicIpAddress | Out-Null
az provider register -n Microsoft.Network --wait | Out-Null

Write-Host "Creating resource group..."
az group create --name $ResourceGroup --location $Location | Out-Null

Write-Host "Creating virtual network..."
if (-not (az network vnet show -g $ResourceGroup -n $VnetName 2>$null)) {
  az network vnet create -g $ResourceGroup -n $VnetName -l $Location `
    --address-prefixes 10.42.0.0/16 `
    --subnet-name $AcaSubnet --subnet-prefixes 10.42.0.0/23 | Out-Null
}

az network vnet subnet update -g $ResourceGroup --vnet-name $VnetName -n $AcaSubnet `
  --delegations Microsoft.App/environments | Out-Null

if (-not (az network vnet subnet show -g $ResourceGroup --vnet-name $VnetName -n $PeSubnet 2>$null)) {
  az network vnet subnet create -g $ResourceGroup --vnet-name $VnetName -n $PeSubnet `
    --address-prefixes 10.42.2.0/27 --disable-private-endpoint-network-policies true | Out-Null
}

Write-Host "Creating Entra-only Azure SQL without public network access..."
if (-not (az sql server show -g $ResourceGroup -n $SqlServerName 2>$null)) {
  az sql server create -g $ResourceGroup -n $SqlServerName -l $Location `
    --enable-ad-only-auth `
    --external-admin-name $signedInUser.userPrincipalName `
    --external-admin-sid $signedInUser.id `
    --external-admin-principal-type User | Out-Null
}

if (-not (az sql db show -g $ResourceGroup --server $SqlServerName -n $SqlDatabase 2>$null)) {
  az sql db create -g $ResourceGroup --server $SqlServerName -n $SqlDatabase `
    --service-objective Basic --backup-storage-redundancy Local | Out-Null
}

Write-Host "Creating private endpoint and private DNS for SQL..."
if (-not (az network private-dns zone show -g $ResourceGroup -n $SqlZone 2>$null)) {
  az network private-dns zone create -g $ResourceGroup -n $SqlZone | Out-Null
}

if (-not (az network private-dns link vnet show -g $ResourceGroup -z $SqlZone -n "$VnetName-link" 2>$null)) {
  az network private-dns link vnet create -g $ResourceGroup -z $SqlZone -n "$VnetName-link" -v $VnetName -e false | Out-Null
}

$sqlId = az sql server show -g $ResourceGroup -n $SqlServerName --query id -o tsv
$peName = "pe-$SqlServerName"
if (-not (az network private-endpoint show -g $ResourceGroup -n $peName 2>$null)) {
  az network private-endpoint create -g $ResourceGroup -n $peName -l $Location `
    --vnet-name $VnetName --subnet $PeSubnet `
    --private-connection-resource-id $sqlId --group-id sqlServer `
    --connection-name "peconn-$SqlServerName" | Out-Null
}

$peIp = az network private-endpoint show -g $ResourceGroup -n $peName --query "customDnsConfigs[0].ipAddresses[0]" -o tsv
if (-not (az network private-dns record-set a show -g $ResourceGroup -z $SqlZone -n $SqlServerName 2>$null)) {
  az network private-dns record-set a create -g $ResourceGroup -z $SqlZone -n $SqlServerName | Out-Null
  az network private-dns record-set a add-record -g $ResourceGroup -z $SqlZone -n $SqlServerName -a $peIp | Out-Null
}

Write-Host "Building container image in ACR..."
if (-not (az acr show -n $AcrName -g $ResourceGroup 2>$null)) {
  az acr create -g $ResourceGroup -n $AcrName -l $Location --sku Basic --admin-enabled false | Out-Null
}
az acr build --registry $AcrName --image "${AppName}:v1" --file Dockerfile . | Out-Null

Write-Host "Creating VNet-injected Container Apps environment..."
$acaSubnetId = az network vnet subnet show -g $ResourceGroup --vnet-name $VnetName -n $AcaSubnet --query id -o tsv
if (-not (az containerapp env show -g $ResourceGroup -n $EnvName 2>$null)) {
  az containerapp env create -g $ResourceGroup -n $EnvName -l $Location `
    --infrastructure-subnet-resource-id $acaSubnetId --logs-destination none | Out-Null
}

Write-Host "Deploying the Data Agent container app..."
if (-not (az containerapp show -g $ResourceGroup -n $AppName 2>$null)) {
  az containerapp create -g $ResourceGroup -n $AppName --environment $EnvName `
    --image mcr.microsoft.com/k8se/quickstart:latest `
    --ingress external --target-port 3000 --system-assigned | Out-Null
}

$principalId = az containerapp show -g $ResourceGroup -n $AppName --query identity.principalId -o tsv
$acrId = az acr show -n $AcrName -g $ResourceGroup --query id -o tsv
az role assignment create --assignee-object-id $principalId --assignee-principal-type ServicePrincipal `
  --role AcrPull --scope $acrId 2>$null | Out-Null

az containerapp registry set -g $ResourceGroup -n $AppName --server "$AcrName.azurecr.io" --identity system | Out-Null

Write-Host "Granting the app managed identity Entra admin on SQL..."
az sql server ad-admin create -g $ResourceGroup -s $SqlServerName --display-name $AppName --object-id $principalId | Out-Null

az containerapp update -g $ResourceGroup -n $AppName `
  --image "$AcrName.azurecr.io/${AppName}:v1" `
  --set-env-vars NODE_ENV=production SQL_SERVER="$SqlServerName.database.windows.net" SQL_DATABASE="$SqlDatabase" SQL_AUTH=entra | Out-Null

$fqdn = az containerapp show -g $ResourceGroup -n $AppName --query properties.configuration.ingress.fqdn -o tsv
Write-Host ""
Write-Host "Deployment complete: https://$fqdn"
Write-Host "MCP endpoint:        https://$fqdn/mcp"
