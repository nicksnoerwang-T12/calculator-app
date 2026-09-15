from pathlib import Path
p = Path('werkbank-design-preview.html').read_text()
assert 'Ontwerp-preview · Workshop 02' in p
assert 'werkbank.design.v1.' in p
p = p.replace('werkbank.design.v1.', 'werkbank.v2.')
p = p.replace('Ontwerp-preview · Workshop 02', 'Werkbank · Workshop 02')
p = p.replace('<h2>Ontwerp-preview</h2><p>Deze versie heeft eigen opslag. Je gewone Werkbank-calculaties blijven ongewijzigd.</p><p>Je kunt een calculatie via Export JSON uit de gewone app overbrengen en hier via Import JSON openen.</p><a href="werkbank-v2.html">Open gewone Werkbank</a>', '<h2>Werkbank · Workshop 02</h2><p>Je calculaties en eigen prijzen worden op dit apparaat bewaard. Maak regelmatig een export als back-up.</p>')
assert 'werkbank.design.v1.' not in p
Path('werkbank-v2.html').write_text(p)
