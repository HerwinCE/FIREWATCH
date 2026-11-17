# Démarre la base FireWatch Africa (PostgreSQL perso, port 5433)
$pgctl = "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe"
& $pgctl -D "C:\Users\n.herwin\firewatch-pg\data" status *> $null
if ($LASTEXITCODE -ne 0) { & $pgctl -D "C:\Users\n.herwin\firewatch-pg\data" -l "C:\Users\n.herwin\firewatch-pg\postgres.log" -w start } else { "Base deja demarree" }
