// Merges Spanish translations + locales-sc bundles into apps/web/locales/{es,en}.json.
// Usage: node apply.cjs [--dry]
const fs = require('fs')
const path = require('path')

const WEB = 'C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web'
const LOC = path.join(WEB, 'locales')
const SC = path.join(WEB, 'locales-sc')
const HERE = __dirname
const dry = process.argv.includes('--dry')
// --out=<dir>: write the results there instead of into locales/ (for diffing).
const outArg = process.argv.find((a) => a.startsWith('--out='))
const OUT = outArg ? outArg.slice(6) : LOC

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

const en = readJson(path.join(LOC, 'en.json'))
const es = readJson(path.join(LOC, 'es.json'))

const missing = {}
for (const f of fs.readdirSync(HERE).filter((f) => /^tr-missing-\d+\.json$/.test(f)).sort()) {
  Object.assign(missing, readJson(path.join(HERE, f)))
}
const fixes = readJson(path.join(HERE, 'tr-fix.json'))

const errors = []
const used = new Set()

// Rebuild `esNode` with en's key set: keep es order, drop extras, insert missing
// keys right after their preceding en sibling.
function build(enNode, esNode, prefix) {
  const keys = Object.keys(esNode || {}).filter((k) => k in enNode)
  let last = -1
  for (const k of Object.keys(enNode)) {
    const idx = keys.indexOf(k)
    if (idx >= 0) {
      last = idx
      continue
    }
    keys.splice(last + 1, 0, k)
    last += 1
  }
  const out = {}
  for (const k of keys) {
    const full = prefix ? `${prefix}.${k}` : k
    const ev = enNode[k]
    const sv = esNode ? esNode[k] : undefined
    if (isObj(ev)) {
      out[k] = build(ev, isObj(sv) ? sv : undefined, full)
    } else if (full in missing) {
      // tr-missing-*.json is the source of truth for these keys (idempotent re-runs).
      out[k] = missing[full]
      used.add(full)
    } else if (typeof sv === 'string') {
      out[k] = sv
    } else {
      errors.push(`no translation for ${full}`)
      out[k] = ev
    }
  }
  return out
}

function setFlat(obj, key, value) {
  const parts = key.split('.')
  let node = obj
  for (const p of parts.slice(0, -1)) {
    if (!isObj(node[p])) return false
    node = node[p]
  }
  const last = parts[parts.length - 1]
  if (typeof node[last] !== 'string') return false
  node[last] = value
  return true
}

// Sanar y Criar bundles: [top-level key, file stem]. Each one is read from
// locales-sc/<stem>.<lng>.json when present, else from ./sources.
const SC_BUNDLES = [
  ['sc_commerce', 'commerce'],
  ['sc_learning', 'learning'],
  ['sc_fixes', 'fixes'],
  ['sc_errors', 'errors'],
  ['sc_brand', 'brand'],
  ['sc_ui', 'ui'],
  ['sc_newsletter', 'newsletter'],
  ['sc_blog', 'blog'],
]
const scKeys = SC_BUNDLES.map(([key]) => key)
const enCore = { ...en }
for (const k of scKeys) delete enCore[k]

let esOut = build(enCore, es, '')
for (const k of Object.keys(missing)) if (!used.has(k)) errors.push(`unused translation ${k}`)
for (const [k, v] of Object.entries(fixes)) if (!setFlat(esOut, k, v)) errors.push(`fix target missing ${k}`)

// Gender-neutral confirmations ("¿Estás seguro…?" assumes a man; most of our
// learners are mothers): "¿Seguro que quieres…?".
function neutralize(node) {
  for (const [k, v] of Object.entries(node)) {
    if (isObj(v)) neutralize(v)
    else if (typeof v === 'string') {
      node[k] = v.replace(/¿Estás seguro de que (quieres|deseas) /g, '¿Seguro que quieres ')
    }
  }
}
neutralize(esOut)

// Sanar y Criar bundles (merged as top-level keys, at the end).
const enOut = { ...enCore }
for (const [key, file] of SC_BUNDLES) {
  // locales-sc copy when present, else the saved copy in ./sources.
  const dir = fs.existsSync(path.join(SC, `${file}.es.json`)) ? SC : path.join(HERE, 'sources')
  const scEs = path.join(dir, `${file}.es.json`)
  const scEn = path.join(dir, `${file}.en.json`)
  if (fs.existsSync(scEs) && fs.existsSync(scEn)) {
    esOut[key] = readJson(scEs)[key]
    enOut[key] = readJson(scEn)[key]
  } else {
    // Already merged earlier: keep whatever the locale files hold.
    if (!es[key] || !en[key]) errors.push(`missing source for ${key}`)
    esOut[key] = es[key]
    enOut[key] = en[key]
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

// tests/rtl-guard.test.mjs requires ar.json to cover every en.json key, so the
// Sanar y Criar namespaces go there too (English copy, untranslated).
const ar = readJson(path.join(LOC, 'ar.json'))
for (const key of scKeys) ar[key] = enOut[key]

const dump = (o) => JSON.stringify(o, null, 2).replace(/\n/g, '\r\n') + '\r\n'
if (dry) {
  console.log('dry run ok')
} else {
  fs.writeFileSync(path.join(OUT, 'es.json'), dump(esOut))
  fs.writeFileSync(path.join(OUT, 'en.json'), dump(enOut))
  fs.writeFileSync(path.join(OUT, 'ar.json'), dump(ar))
  console.log('written')
}
