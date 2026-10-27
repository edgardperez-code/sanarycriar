// Verifies apps/web/locales/es.json against en.json and the code that reads
// sc_commerce / sc_learning keys. Exit code 1 on any error.
const fs = require('fs')
const path = require('path')

const WEB = 'C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web'
const LOC = path.join(WEB, 'locales')
const errors = []
const warnings = []

function load(name) {
  const raw = fs.readFileSync(path.join(LOC, name), 'utf8')
  try {
    return JSON.parse(raw)
  } catch (e) {
    errors.push(`${name}: invalid JSON (${e.message})`)
    return {}
  }
}
function flat(o, p = '', r = {}) {
  for (const [k, v] of Object.entries(o)) {
    const kk = p ? `${p}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, kk, r)
    else r[kk] = v
  }
  return r
}

const en = flat(load('en.json'))
const es = flat(load('es.json'))

// 1. Same key set.
const missing = Object.keys(en).filter((k) => !(k in es))
const extra = Object.keys(es).filter((k) => !(k in en))
if (missing.length) errors.push(`missing in es (${missing.length}): ${missing.slice(0, 20).join(', ')}`)
if (extra.length) errors.push(`extra in es (${extra.length}): ${extra.slice(0, 20).join(', ')}`)

// 2. Values: strings, non-empty, same tokens.
const tokenSets = {
  placeholders: (s) => (s.match(/\{\{[^}]+\}\}/g) || []).map((t) => t.replace(/\s+/g, '')).sort(),
  nesting: (s) => (s.match(/\$t\([^)]*\)/g) || []).sort(),
  tags: (s) => (s.match(/<\/?[a-zA-Z][^>]*>/g) || []).map((t) => t.replace(/\s.*?>$/, '>')).sort(),
  bold: (s) => [String((s.match(/\*\*/g) || []).length)],
  escapedNewlines: (s) => [String((s.match(/\\n/g) || []).length)],
  realNewlines: (s) => [String((s.match(/\n/g) || []).length)],
  mdLinks: (s) => [String((s.match(/\]\(/g) || []).length)],
}
for (const [lng, dict] of [['en', en], ['es', es]]) {
  for (const [k, v] of Object.entries(dict)) {
    if (typeof v !== 'string') errors.push(`${lng}:${k} is not a string`)
    else if (!v.trim()) errors.push(`${lng}:${k} is empty`)
  }
}
for (const k of Object.keys(en)) {
  if (typeof es[k] !== 'string' || typeof en[k] !== 'string') continue
  for (const [name, fn] of Object.entries(tokenSets)) {
    const a = JSON.stringify(fn(en[k]))
    const b = JSON.stringify(fn(es[k]))
    if (a !== b) errors.push(`${k}: ${name} differ (en ${a} vs es ${b})`)
  }
}

// 3. Plural families: a key with a `_one` form must also resolve for other
// counts (via `_other` or the bare key), in both languages.
for (const [lng, dict] of [['en', en], ['es', es]]) {
  for (const k of Object.keys(dict)) {
    const m = k.match(/^(.*)_one$/)
    if (!m || !/\{\{count\}\}/.test(dict[k])) continue
    if (!(`${m[1]}_other` in dict) && !(m[1] in dict)) errors.push(`${lng}:${k} has no other-count form`)
  }
}

// 4. "LearnHouse" left in Spanish only where it names the software.
const LH_ALLOWED = new Set([
  'common.help_menu.website',
  'common.help_menu.feedback_description',
  'common.copyright',
  'courses.import.learnhouse_courses',
  'courses.import.learnhouse_description',
  'courses.import.learnhouse_format',
  'courses.import.learnhouse_info',
  'dashboard.home.learnhouse_university',
  'dashboard.courses.import_learnhouse',
  'dashboard.courses.import_learnhouse_description',
  'dashboard.organization.settings.watermark_desc',
  'dashboard.organization.settings.watermark_label',
  'dashboard.organization.branding.previews.thumbnail_desc',
  'dashboard.organization.security.session_sharing_label',
  'dashboard.organization.security.session_sharing_hint',
  'embed.powered_by',
  'analytics.not_configured.description',
  'onboarding.steps.teach_the_world.description',
  'onboarding.steps.teach_the_world.university',
  'hub_new.createOrg.testHint.suffix',
  // AGPL-3.0 notice: names the upstream software on purpose.
  'sc_brand.powered_by',
])
for (const [k, v] of Object.entries(es)) {
  if (/learnhouse/i.test(v) && !LH_ALLOWED.has(k)) errors.push(`es:${k} still says LearnHouse: ${v}`)
}

// 5. Untranslated leftovers (identical to English) — informational.
const identical = Object.keys(en).filter((k) => es[k] === en[k] && /[a-z]{4,}/.test(en[k]))
// 6. Typical English words in es values.
const ENGLISH = /\b(the|your|you|with|this|Failed|Could not|Please|Click|Upload|Delete|Create|Settings|Library|Store)\b/
for (const [k, v] of Object.entries(es)) {
  if (v !== en[k] && ENGLISH.test(v) && !/learnhouse|youtube|google/i.test(v)) warnings.push(`es:${k} looks English: ${v}`)
}

// 7. Keys used by code exist (sc_commerce via useScT `sc('…')`, sc_learning and sc_commerce via t('…')).
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', 'locales', 'locales-sc', 'public', 'tests'].includes(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p)
  }
  return out
}
const files = walk(WEB)
let checked = 0
const dynamic = []
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const usesSc = /useScT|ScTranslate/.test(src)
  for (const m of src.matchAll(/\bt\(\s*['"`]((sc_commerce|sc_learning|sc_fixes|sc_errors|sc_brand|sc_ui|sc_newsletter|sc_blog)\.[^'"`]+)['"`]/g)) {
    checked++
    if (m[1].includes('${')) dynamic.push(`${path.relative(WEB, f)}: ${m[1]}`)
    else if (!(m[1] in es) && !(`${m[1]}_other` in es)) errors.push(`${path.relative(WEB, f)} uses missing ${m[1]}`)
  }
  // sc_fixes via useFixesT `fx('…')`.
  if (/useFixesT|FixesTranslate/.test(src)) {
    for (const m of src.matchAll(/\bfx\(\s*(['"`])([^'"`]+)\1/g)) {
      checked++
      const key = `sc_fixes.${m[2]}`
      if (m[2].includes('${')) dynamic.push(`${path.relative(WEB, f)}: fx(${m[2]})`)
      else if (!(key in es) && !(`${key}_other` in es)) errors.push(`${path.relative(WEB, f)} uses missing ${key}`)
    }
  }
  // sc_newsletter via useNewsletterT `nl('…')`.
  if (/useNewsletterT|NewsletterTranslate/.test(src)) {
    for (const m of src.matchAll(/\bnl\(\s*(['"`])([^'"`]+)\1/g)) {
      checked++
      const key = `sc_newsletter.${m[2]}`
      if (m[2].includes('${')) dynamic.push(`${path.relative(WEB, f)}: nl(${m[2]})`)
      else if (!(key in es) && !(`${key}_other` in es)) errors.push(`${path.relative(WEB, f)} uses missing ${key}`)
    }
  }
  // sc_blog via useBlogT `bt('…')`.
  if (/useBlogT|BlogTranslate/.test(src)) {
    for (const m of src.matchAll(/\bbt\(\s*(['"`])([^'"`]+)\1/g)) {
      checked++
      const key = `sc_blog.${m[2]}`
      if (m[2].includes('${')) dynamic.push(`${path.relative(WEB, f)}: bt(${m[2]})`)
      else if (!(key in es) && !(`${key}_other` in es)) errors.push(`${path.relative(WEB, f)} uses missing ${key}`)
    }
  }
  if (!usesSc) continue
  for (const m of src.matchAll(/\bsc\(\s*(['"`])([^'"`]+)\1/g)) {
    checked++
    const key = `sc_commerce.${m[2]}`
    if (m[2].includes('${')) dynamic.push(`${path.relative(WEB, f)}: sc(${m[2]})`)
    else if (!(key in es) && !(`${key}_other` in es)) errors.push(`${path.relative(WEB, f)} uses missing ${key}`)
  }
  // Key-like string literals in commerce files (KNOWN_CODES, labelKey maps, …).
  for (const m of src.matchAll(/(?<!fx\()['"]([a-z_]+(?:\.[a-z0-9_]+)+)['"]/g)) {
    const lit = m[1]
    if (/^(sc_commerce|sc_learning)\./.test(lit)) continue
    const key = `sc_commerce.${lit}`
    const root = lit.split('.')[0]
    if (es.hasOwnProperty(key) || Object.keys(es).some((k) => k.startsWith(`sc_commerce.${root}.`))) {
      if (!(key in es) && !(`${key}_other` in es)) warnings.push(`${path.relative(WEB, f)}: literal '${lit}' not under sc_commerce`)
    }
  }
}
// Dynamic `status.${x}` lookups: every status the API can return must exist.
for (const s of ['created', 'approved', 'pending', 'paid', 'accredited', 'failed', 'expired', 'cancelled', 'refunded', 'active', 'completed']) {
  if (!(`sc_commerce.status.${s}` in es)) warnings.push(`sc_commerce.status.${s} missing (dynamic status label)`)
}

// 8. ar.json must cover every en.json key (tests/rtl-guard.test.mjs).
{
  const ar = flat(load('ar.json'))
  const arMissing = Object.keys(en).filter((k) => !(k in ar))
  if (arMissing.length) errors.push(`missing in ar (${arMissing.length}): ${arMissing.slice(0, 20).join(', ')}`)
}

// 9. locales-sc bundles that code imports directly must match the merged copy.
for (const [key, stem] of [['sc_commerce', 'commerce'], ['sc_fixes', 'fixes'], ['sc_errors', 'errors'], ['sc_newsletter', 'newsletter'], ['sc_blog', 'blog']]) {
  for (const [lng, dict] of [['es', es], ['en', en]]) {
    const p = path.join(WEB, 'locales-sc', `${stem}.${lng}.json`)
    if (!fs.existsSync(p)) continue
    const src = flat(JSON.parse(fs.readFileSync(p, 'utf8'))[key] || {}, key)
    for (const [k, v] of Object.entries(src)) {
      if (dict[k] !== v) errors.push(`${stem}.${lng}.json ${k} differs from locales/${lng}.json (re-run apply.cjs)`)
    }
    for (const k of Object.keys(dict)) {
      if (k.startsWith(`${key}.`) && !(k in src)) errors.push(`locales/${lng}.json ${k} is not in ${stem}.${lng}.json`)
    }
  }
}

console.log(`en keys: ${Object.keys(en).length}, es keys: ${Object.keys(es).length}`)
console.log(`code key references checked: ${checked}; dynamic: ${dynamic.length}`)
dynamic.forEach((d) => console.log('  dynamic ' + d))
console.log(`identical to English (informational): ${identical.length}`)
if (process.argv.includes('--identical')) identical.forEach((k) => console.log(`  = ${k}: ${en[k]}`))
warnings.forEach((w) => console.log('WARN ' + w))
if (errors.length) {
  errors.forEach((e) => console.log('ERROR ' + e))
  process.exit(1)
}
console.log('OK')
