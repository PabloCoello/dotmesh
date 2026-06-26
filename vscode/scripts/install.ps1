# Script de instalación de configuración de VS Code para Windows
# Autor: Pablo Coello
# Uso: .\install.ps1 [-Backup]

param(
    [switch]$Backup
)

$ErrorActionPreference = "Stop"

# Directorios
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir = Split-Path -Parent $ScriptDir
$RepoConfigDir = Join-Path $RepoDir "Library\Application Support\Code\User"
$VsCodeDir = "$env:USERPROFILE\.vscode"
$VsCodeConfigDir = "$env:APPDATA\Code\User"
$KeybindingsSrc = "keybindings.linux.json"  # Windows usa ctrl+ (igual que Linux)

Write-Host "==========================================" -ForegroundColor Blue
Write-Host "   Instalador de Configuración VS Code   " -ForegroundColor Blue
Write-Host "==========================================" -ForegroundColor Blue
Write-Host ""

# Función para hacer backup
function Backup-CurrentConfig {
    Write-Host "Creando backup de la configuración actual..." -ForegroundColor Yellow
    
    $BackupDir = "$env:USERPROFILE\vscode-config-backup-$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    
    if (Test-Path "$VsCodeConfigDir\settings.json") {
        Copy-Item "$VsCodeConfigDir\settings.json" "$BackupDir\" -Force
        Write-Host "✓ settings.json guardado" -ForegroundColor Green
    }
    
    if (Test-Path "$VsCodeConfigDir\keybindings.json") {
        Copy-Item "$VsCodeConfigDir\keybindings.json" "$BackupDir\" -Force
        Write-Host "✓ keybindings.json guardado" -ForegroundColor Green
    }
    
    Write-Host "Backup creado en: $BackupDir" -ForegroundColor Green
    Write-Host ""
}

# Hacer backup si se solicita
if ($Backup) {
    Backup-CurrentConfig
}

# Crear directorios si no existen
Write-Host "Verificando directorios..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $VsCodeConfigDir -Force | Out-Null
New-Item -ItemType Directory -Path "$VsCodeDir\extensions" -Force | Out-Null

# Instalar configuraciones
Write-Host "Instalando configuraciones..." -ForegroundColor Yellow

if (Test-Path "$RepoConfigDir\settings.json") {
    Copy-Item "$RepoConfigDir\settings.json" "$VsCodeConfigDir\" -Force
    Write-Host "✓ settings.json instalado" -ForegroundColor Green
} else {
    Write-Host "✗ settings.json no encontrado" -ForegroundColor Red
}

if (Test-Path "$RepoConfigDir\$KeybindingsSrc") {
    Copy-Item "$RepoConfigDir\$KeybindingsSrc" "$VsCodeConfigDir\keybindings.json" -Force
    Write-Host "✓ keybindings.json instalado (desde $KeybindingsSrc)" -ForegroundColor Green
} else {
    Write-Host "✗ $KeybindingsSrc no encontrado" -ForegroundColor Red
}

# Instalar temas
Write-Host "Instalando temas..." -ForegroundColor Yellow

$ThemeDest = "$VsCodeDir\extensions\betheme-collection"
New-Item -ItemType Directory -Path $ThemeDest -Force | Out-Null

Copy-Item "$RepoDir\package.json" "$ThemeDest\" -Force
Copy-Item "$RepoDir\themes" "$ThemeDest\" -Recurse -Force

Write-Host "✓ Temas instalados" -ForegroundColor Green

# Instalar extensiones
Write-Host ""
Write-Host "Instalando extensiones..." -ForegroundColor Yellow

if (Test-Path "$RepoDir\extensions\extensions.json") {
    # Verificar si code está disponible
    try {
        $null = Get-Command code -ErrorAction Stop
        
        # Leer el archivo JSON y extraer los IDs de extensiones
        $extensionsContent = Get-Content "$RepoDir\extensions\extensions.json" -Raw | ConvertFrom-Json
        
        foreach ($ext in $extensionsContent) {
            if ($ext) {
                Write-Host "Instalando $ext..." -ForegroundColor Blue
                & code --install-extension $ext --force
            }
        }
        
        Write-Host "✓ Extensiones instaladas" -ForegroundColor Green
    }
    catch {
        Write-Host "✗ El comando 'code' no está disponible." -ForegroundColor Red
        Write-Host "Por favor, asegúrate de que VS Code esté en tu PATH." -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠ No se encontró extensions.json" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "     ¡Instalación completada! 🎉        " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Nota: Reinicia VS Code para aplicar todos los cambios." -ForegroundColor Yellow
Write-Host ""
