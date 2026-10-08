# UXP plugin management for Photoshop
#   enable   - Enable UXP developer mode (allows loading the plugin from UXP Developer Tool)
#   package  - Build dist/<id>.ccx, installable by double-clicking with the Creative Cloud app
#   deploy   - Install the plugin without the Creative Cloud app (copy + register in PS.json)
#   undeploy - Remove the plugin installed by deploy
# enable, deploy and undeploy write to Program Files and require an elevated shell

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("enable", "package", "deploy", "undeploy")]
    [string]$Action,

    # Shared UXP directory, where developer mode is set and plugins are installed
    [string]$UxpDir = (Join-Path $env:CommonProgramFiles "Adobe\UXP")
)

$ErrorActionPreference = "Stop"

$PluginDir = $PSScriptRoot
$Manifest = Get-Content (Join-Path $PluginDir "manifest.json") -Raw | ConvertFrom-Json
$PluginFolderName = "$($Manifest.id)_$($Manifest.version)"

$ExternalPluginsDir = Join-Path $UxpDir "Plugins\External"
$PluginsInfoFile = Join-Path $env:APPDATA "Adobe\UXP\PluginsInfo\v1\PS.json"

# Development files that are not a part of the plugin
$Excluded = @("dist", "README.md", "uxp.ps1")

function Write-Utf8File($Path, $Content) {
    New-Item -ItemType Directory -Force (Split-Path $Path) | Out-Null
    [IO.File]::WriteAllText($Path, $Content)
}

function Get-PluginFiles {
    Get-ChildItem $PluginDir | Where-Object { $Excluded -notcontains $_.Name }
}

function Read-PluginsInfo {
    if (Test-Path $PluginsInfoFile) {
        $info = Get-Content $PluginsInfoFile -Raw | ConvertFrom-Json
        return @($info.plugins | Where-Object { $_.pluginId -ne $Manifest.id })
    }
    return @()
}

function Write-PluginsInfo($Plugins) {
    Write-Utf8File $PluginsInfoFile (ConvertTo-Json @{ plugins = @($Plugins) } -Depth 5)
}

function Remove-InstalledPlugin {
    Get-ChildItem $ExternalPluginsDir -Directory -Filter "$($Manifest.id)_*" -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force
    Write-PluginsInfo (Read-PluginsInfo)
}

switch ($Action) {
    "enable" {
        Write-Utf8File (Join-Path $UxpDir "Developer\settings.json") '{"developer": true}'
        Write-Host "UXP developer mode enabled. Please restart Photoshop."
    }

    "package" {
        $distDir = Join-Path $PluginDir "dist"
        $zip = Join-Path $distDir "$($Manifest.id).zip"
        $ccx = [IO.Path]::ChangeExtension($zip, ".ccx")

        New-Item -ItemType Directory -Force $distDir | Out-Null
        Remove-Item $zip, $ccx -ErrorAction SilentlyContinue
        Compress-Archive -Path (Get-PluginFiles).FullName -DestinationPath $zip
        Move-Item $zip $ccx
        Write-Host "Packaged: $ccx"
    }

    "deploy" {
        Remove-InstalledPlugin

        $target = Join-Path $ExternalPluginsDir $PluginFolderName
        New-Item -ItemType Directory -Force $target | Out-Null
        Copy-Item (Get-PluginFiles).FullName $target -Recurse -Force

        $plugins = @(Read-PluginsInfo) + [ordered]@{
            hostMinVersion = $Manifest.host.minVersion
            name = $Manifest.name
            path = "`$localPlugins\External\$PluginFolderName"
            pluginId = $Manifest.id
            status = "enabled"
            type = "uxp"
            versionString = $Manifest.version
        }
        Write-PluginsInfo $plugins

        Write-Host "Deployed to $target. Please restart Photoshop."
    }

    "undeploy" {
        Remove-InstalledPlugin
        Write-Host "Plugin removed. Please restart Photoshop."
    }
}
