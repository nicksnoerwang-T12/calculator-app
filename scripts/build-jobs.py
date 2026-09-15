from pathlib import Path
p=Path('werkbank-v2.html').read_text()
assert 'Werkbank · Workshop 02' in p
p=p.replace('werkbank.v2.','werkbank.jobs.v1.').replace('Werkbank · Workshop 02','Werkbank · Klussenpreview 01')
p=p.replace('</style>',Path('jobs/jobs.css').read_text()+'\n</style>',1)
p=p.replace('</script>',Path('jobs/jobs.js').read_text()+'\n</script>',1)
Path('werkbank-klussen-preview.html').write_text(p)
