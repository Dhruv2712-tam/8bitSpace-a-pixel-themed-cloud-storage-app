import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
export function containsSecret(text) {
  if (/sb_secret_[A-Za-z0-9_-]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}/.test(text)) return true
  for (const token of text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []) {
    try { if (JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).role === 'service_role') return true } catch { /* Not a JWT. */ }
  }
  return false
}
if (process.argv[1]?.endsWith('scan-secrets.js')) {
  const files = execFileSync('git', ['ls-files','-z','--cached','--others','--exclude-standard'], {encoding:'utf8'}).split('\0').filter(Boolean)
  const bad = files.filter(file => /(^|\/)\.env(\.|$)/.test(file) && !file.endsWith('.env.example'))
  for (const file of files) {
    if (fs.existsSync(file) && fs.statSync(file).size < 2_000_000 && containsSecret(fs.readFileSync(file,'utf8'))) bad.push(file)
  }
  const history = execFileSync('git', ['log','--all','-p','--format='], {encoding:'utf8',maxBuffer:64*1024*1024})
  if (containsSecret(history)) bad.push('Git history: review and rotate any exposed credentials')
  if (bad.length) { console.error('Potential secrets in files (values redacted):', [...new Set(bad)].join(', ')); process.exitCode=1 }
  else console.log('No known secret patterns or tracked environment files found.')
}
