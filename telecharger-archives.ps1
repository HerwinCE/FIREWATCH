# Télécharge les archives annuelles NASA FIRMS du Gabon (qualité scientifique, ~22 Mo au total)
# dans data\raw\firms\archives\. Source officielle : https://firms.modaps.eosdis.nasa.gov/country/
# Usage : clic droit > « Exécuter avec PowerShell », ou : powershell -ExecutionPolicy Bypass -File telecharger-archives.ps1
$ErrorActionPreference = 'Stop'
$racine = Split-Path -Parent $MyInvocation.MyCommand.Path
$cible = Join-Path $racine 'data\raw\firms\archives'
New-Item -ItemType Directory -Force $cible | Out-Null
$base = 'https://firms.modaps.eosdis.nasa.gov/data/country'
$produits = @(
    @{ dossier = 'modis';       debut = 2000; fin = 2025 },   # MODIS Terra + Aqua
    @{ dossier = 'viirs-snpp';  debut = 2012; fin = 2025 },   # VIIRS Suomi-NPP
    @{ dossier = 'viirs-jpss1'; debut = 2018; fin = 2025 }    # VIIRS NOAA-20
)
$ok = 0; $erreurs = 0
foreach ($p in $produits) {
    foreach ($annee in $p.debut..$p.fin) {
        $nom = "$($p.dossier)_${annee}_Gabon.csv"
        $fichier = Join-Path $cible $nom
        if (Test-Path $fichier) { Write-Host "déjà présent : $nom"; $ok++; continue }
        try {
            Invoke-WebRequest -UseBasicParsing -Uri "$base/$($p.dossier)/$annee/$nom" -OutFile $fichier -TimeoutSec 120
            Write-Host "téléchargé : $nom"; $ok++
        } catch {
            Write-Warning "échec : $nom ($($_.Exception.Message))"; $erreurs++
            if (Test-Path $fichier) { Remove-Item $fichier }
        }
    }
}
Write-Host "`n$ok fichiers prêts, $erreurs échec(s), dans $cible"
