from pathlib import Path
p=Path('werkbank-v2.html').read_text()
assert '<section id="home" class="page">' in p, 'Productie-layout gewijzigd: controleer builder'
assert 'werkbank.v2.' in p, 'Productieopslag ontbreekt'
p=p.replace('werkbank.v2.','werkbank.design.v1.').replace('Werkbank — leverancierscatalogus 1','Ontwerp-preview · Workshop 02')
p=p.replace('const storageAdapter = createStorageAdapter(localStorage);', "const storageAdapter = createStorageAdapter((()=>{try{return window.localStorage;}catch(_){return {getItem(){throw Error('Opslag niet beschikbaar');},setItem(){throw Error('Opslag niet beschikbaar');}};}})());")
p=p.replace('</style>',Path('design/workshop.css').read_text()+'\n</style>',1)
p=p.replace('<section id="home" class="page">','''<section id="home"><div id="design-dashboard"><h1 class="dashboard-title">Calculaties</h1><button class="act home-primary" id="design-new">＋ Nieuwe calculatie</button><div class="section-heading"><h2>Recent</h2><a href="#projecten">Opgeslagen projecten ›</a></div><div id="recent-design"></div><div class="home-tools"><div class="section-heading"><h2>Gereedschap</h2><a href="#tools">Alle tools ›</a></div><div class="quick-grid" id="quick-design"></div></div></div><div id="tool-directory">''')
p=p.replace('<section id="tool" hidden>','<section id="tool" hidden>',1)
p=p.replace('<p class="noresult" id="noresult" hidden>Niets gevonden. Probeer een ander woord.</p>','<p class="noresult" id="noresult" hidden>Niets gevonden. Probeer een ander woord.</p></div>')
p=p.replace('<nav class="bottom-nav', '''<section id="design-settings" hidden><h1>Instellingen</h1><div class="card"><h2>Weergave</h2><div class="actions"><button class="ghost" data-design-theme="dark">Donker</button><button class="ghost" data-design-theme="light">Licht</button><button class="ghost" data-design-theme="auto">Automatisch</button></div></div><div class="card"><h2>Ontwerp-preview</h2><p>Deze versie heeft eigen opslag. Je gewone Werkbank-calculaties blijven ongewijzigd.</p><p>Je kunt een calculatie via Export JSON uit de gewone app overbrengen en hier via Import JSON openen.</p><a href="werkbank-v2.html">Open gewone Werkbank</a></div></section><nav class="bottom-nav''')
p=p.replace('data-route="kostprijs" aria-label="Kostprijs"','data-route="instellingen" aria-label="Instellingen"')
p=p.replace('</script>',Path('design/workshop.js').read_text()+'\n'+Path('design/polish.js').read_text()+'\n</script>',1)
p=p.replace('<section id="design-settings"', '<section id="design-projects" hidden><div class="page-head"><h1>Opgeslagen projecten</h1></div><button class="act" id="library-new">Nieuwe calculatie</button><div id="all-projects"></div></section><section id="design-settings"')
p=p.replace('Native radiokeuze met technisch profielicoon.','Kies het profiel dat je wilt toevoegen.')
Path('werkbank-design-preview.html').write_text(p)
