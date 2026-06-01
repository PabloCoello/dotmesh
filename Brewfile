# Brewfile — dependencias instalables vía Homebrew.
# Aplicar con:  brew bundle   (o  make fonts  para solo las fuentes)
#
# Las herramientas que dotmesh espera (ver `make health`):
brew "stow"
brew "git-delta"
brew "starship"

# Apps GUI.
cask "visual-studio-code"
cask "warp"
# Terax no está en Homebrew: se instala a mano desde https://terax.app
# (terminal en evaluación como alternativa a Warp).

# Fuentes Nerd Font (necesarias para que los glyphs de Starship se rendericen).
# JetBrainsMono es la que usa la config de Terax (terax-settings.json) y la
# primera candidata de su autodetección; sin ella vuelven los cuadraditos.
cask "font-jetbrains-mono-nerd-font"
cask "font-fira-code-nerd-font"
cask "font-meslo-lg-nerd-font"
