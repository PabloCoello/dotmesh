# Script para verificar la instalación de la configuración de VS Code
# Autor: Pablo Coello

$VsCodeConfigDir = "$env:APPDATA\Code\User"

Write-Host "==========================================" -ForegroundColor Blue
Write-Host "   Verificación de Configuración         " -ForegroundColor Blue
Write-Host "==========================================" -ForegroundColor Blue
Write-Host ""

# Verificar settings.json
Write-Host "Verificando archivos de configuración..." -ForegroundColor Yellow
if (Test-Path "$VsCodeConfigDir\settings.json") {
    Write-Host "✓ settings.json encontrado" -ForegroundColor Green
} else {
    Write-Host "✗ settings.json NO encontrado" -ForegroundColor Red
}

# Verificar keybindings.json
if (Test-Path "$VsCodeConfigDir\keybindings.json") {
    Write-Host "✓ keybindings.json encontrado" -ForegroundColor Green
} else {
    Write-Host "✗ keybindings.json NO encontrado" -ForegroundColor Red
}

# Verificar temas
Write-Host ""
Write-Host "Verificando temas instalados..." -ForegroundColor Yellow
$ThemeDir = "$env:USERPROFILE\.vscode\extensions\betheme-collection"
if (Test-Path $ThemeDir) {
    Write-Host "✓ Temas instalados en $ThemeDir" -ForegroundColor Green
    if (Test-Path "$ThemeDir\package.json") {
        Write-Host "✓ package.json del tema encontrado" -ForegroundColor Green
    }
    if (Test-Path "$ThemeDir\themes") {
        $themeCount = (Get-ChildItem "$ThemeDir\themes").Count
        Write-Host "✓ $themeCount archivos de tema encontrados" -ForegroundColor Green
    }
} else {
    Write-Host "✗ Directorio de temas NO encontrado" -ForegroundColor Red
}

# Verificar comando code
Write-Host ""
Write-Host "Verificando herramientas..." -ForegroundColor Yellow
try {
    $codeVersion = (& code --version 2>$null | Select-Object -First 1)
    Write-Host "✓ Comando 'code' disponible (VS Code $codeVersion)" -ForegroundColor Green
} catch {
    Write-Host "✗ Comando 'code' NO disponible" -ForegroundColor Red
    Write-Host "  Asegúrate de que VS Code esté en tu PATH" -ForegroundColor Yellow
}

# Contar extensiones instaladas
Write-Host ""
Write-Host "Verificando extensiones..." -ForegroundColor Yellow
try {
    $extCount = (& code --list-extensions 2>$null | Measure-Object).Count
    Write-Host "✓ $extCount extensiones instaladas" -ForegroundColor Green
    
    # Verificar extensiones del repo
    $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $RepoDir = Split-Path -Parent $ScriptDir
    $extensionsFile = "$RepoDir\extensions\extensions.json"
    
    if (Test-Path $extensionsFile) {
        Write-Host ""
        Write-Host "Extensiones recomendadas en el repositorio:" -ForegroundColor Blue
        $extensions = Get-Content $extensionsFile | ConvertFrom-Json
        $installedExts = & code --list-extensions 2>$null
        
        foreach ($ext in $extensions) {
            if ($installedExts -contains $ext) {
                Write-Host "  ✓ $ext" -ForegroundColor Green
            } else {
                Write-Host "  ✗ $ext (no instalada)" -ForegroundColor Red
            }
        }
    }
} catch {
    Write-Host "⚠ No se pueden verificar extensiones (comando 'code' no disponible)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Blue
Write-Host "   Verificación completada               " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Blue
Write-Host ""
