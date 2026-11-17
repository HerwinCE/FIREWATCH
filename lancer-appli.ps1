# Lance FireWatch Africa : base de données (5433), backend FastAPI (8010), frontend Vite (5180).
# Usage : clic droit > "Exécuter avec PowerShell", ou :  powershell -ExecutionPolicy Bypass -File lancer-appli.ps1
$racine = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Base PostgreSQL perso
& powershell -ExecutionPolicy Bypass -File (Join-Path $racine 'demarrer-base.ps1')

# 2. Backend (nouvelle fenêtre)
$backend = Join-Path $racine 'backend'
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8010"

# 3. Frontend (nouvelle fenêtre)
$front = Join-Path $racine 'firewatch-africa'
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$front'; npm run dev -- --port 5180"

Start-Sleep -Seconds 6
Start-Process 'http://localhost:5180'
