const fs=require('fs'),{execFileSync}=require('child_process');
for(const name of ['design-material-calculator.test.js','design-material-wizard.test.js']){
 const code=fs.readFileSync('tests/'+name,'utf8').replaceAll('werkbank-design-preview.html','werkbank-klussen-preview.html').replaceAll('werkbank.design.v1.','werkbank.jobs.v1.');
 execFileSync(process.execPath,['-e',code],{stdio:'inherit'});
}
