const fs = require('fs');
const path = require('path');

const entries = [
  'index.html',
  'certs.html',
  'troubleshooting.html',
  'ewaste-quickstart.html',
  'old-tech-linux.html',
  'arch-linux-vm.html',
  'financial-services-operations.html',
  'style.css',
  'extras.css',
  'projects.css',
  'role.css',
  'mobile.css',
  'operations.css',
  'resume.css',
  'lab.css',
  'guide.css',
  'vm-lab.css',
  'script.js',
  'lab.js',
  'Headshot.jpg',
  'og.png',
  'Marcielo_Pestcoe_IT_Resume.pdf',
  'projects',
  'server'
];

const out = path.join(__dirname, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const entry of entries) {
  const source = path.join(__dirname, entry);
  const destination = path.join(out, entry);

  if (!fs.existsSync(source)) {
    throw new Error(`Missing build entry: ${entry}`);
  }

  fs.cpSync(source, destination, { recursive: true });
}

console.log(`Built ${entries.length} site entries in dist/.`);
