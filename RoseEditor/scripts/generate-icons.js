const { Resvg } = require('@resvg/resvg-js')
const toIco = require('to-ico')
const fs = require('fs')
const path = require('path')

// Rose SVG — herbarium (light) theme palette, warm cream background
const SVG = `<svg viewBox="0 0 64 64" width="64" height="64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- background -->
  <rect width="64" height="64" rx="14" fill="#eff1e7"/>

  <!-- stem -->
  <path d="M32 36 C 32 42, 33 48, 34 56" stroke="#5a6a30" stroke-width="1.3" stroke-linecap="round"/>
  <!-- left leaf -->
  <path d="M32 46 C 26 44, 22 46, 20 50 C 24 52, 30 50, 32 48" fill="#5a6a30" opacity="0.85"/>
  <path d="M24 48 L 30 48" stroke="#4a5a26" stroke-width="0.6" opacity="0.5"/>
  <!-- right leaf -->
  <path d="M33 50 C 38 49, 42 51, 43 55 C 39 56, 34 54, 33 52" fill="#5a6a30" opacity="0.7"/>
  <path d="M37 52 L 42 54" stroke="#4a5a26" stroke-width="0.6" opacity="0.5"/>

  <!-- outer petals -->
  <path d="M32 8 C 40 10, 44 18, 42 26 C 38 22, 34 18, 32 12 Z" fill="#7a2a20"/>
  <path d="M50 18 C 52 26, 48 34, 40 36 C 40 30, 42 24, 46 20 Z" fill="#7a2a20"/>
  <path d="M46 36 C 42 42, 34 42, 30 38 C 34 34, 40 32, 44 34 Z" fill="#7a2a20" opacity="0.92"/>
  <path d="M18 36 C 14 32, 14 24, 20 20 C 22 26, 22 32, 20 36 Z" fill="#7a2a20" opacity="0.92"/>
  <path d="M22 10 C 28 8, 34 10, 34 16 C 30 16, 24 16, 22 14 Z" fill="#7a2a20" opacity="0.9"/>

  <!-- inner petals -->
  <path d="M32 14 C 38 16, 40 22, 38 28 C 34 26, 30 22, 30 16 Z" fill="#5a1a14" opacity="0.85"/>
  <path d="M26 18 C 22 22, 22 28, 26 32 C 30 28, 30 22, 28 18 Z" fill="#5a1a14" opacity="0.75"/>
  <path d="M38 30 C 36 34, 30 34, 28 30 C 32 28, 36 28, 38 30 Z" fill="#5a1a14" opacity="0.9"/>

  <!-- bloom center -->
  <circle cx="32" cy="25" r="2.4" fill="#5a1a14"/>
  <circle cx="32" cy="25" r="0.9" fill="#c4956a"/>
</svg>`

async function main() {
  const buildDir = path.join(__dirname, '../build')
  fs.mkdirSync(buildDir, { recursive: true })

  const sizes = [16, 32, 48, 64, 128, 256, 512, 1024]

  const pngBuffers = sizes.map(size => {
    const resvg = new Resvg(SVG, {
      fitTo: { mode: 'width', value: size }
    })
    return resvg.render().asPng()
  })

  // 1024x1024 PNG for Linux / general use
  fs.writeFileSync(path.join(buildDir, 'icon.png'), pngBuffers[pngBuffers.length - 1])
  console.log('✓ build/icon.png (1024x1024)')

  // ICO for Windows — include all sizes up to 256 (ICO max)
  const icoSizes = [16, 32, 48, 64, 128, 256]
  const icoPngs = icoSizes.map(size => {
    const resvg = new Resvg(SVG, { fitTo: { mode: 'width', value: size } })
    return resvg.render().asPng()
  })
  const icoBuffer = await toIco(icoPngs)
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer)
  console.log('✓ build/icon.ico (16–256px)')

  console.log('\nDone. Icons are in RoseEditor/build/')
}

main().catch(err => { console.error(err); process.exit(1) })
