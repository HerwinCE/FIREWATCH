"""Assemble la maquette autonome mockup/index.html à partir de design-tokens/ et mockup/src/."""
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
src = R / 'mockup' / 'src'
css = (R / 'design-tokens' / 'tokens.css').read_text() + '\n' + (src / 'styles.css').read_text()
js = '\n'.join((src / f).read_text() for f in ['geo.js', 'data.js', 'ui.js', 'screens.js', 'app.js'])
html = f'''<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FireWatch Africa — maquette navigable</title>
<meta name="description" content="FireWatch Africa — maquette interactive : détections thermiques satellitaires NASA FIRMS (MODIS / VIIRS), focus Afrique et Gabon. Données de démonstration.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
{css}
</style>
</head>
<body>
<noscript>Cette maquette nécessite JavaScript.</noscript>
<script>
{js}
</script>
</body>
</html>
'''
(R / 'mockup' / 'index.html').write_text(html)
print('index.html', len(html) // 1024, 'Ko')
