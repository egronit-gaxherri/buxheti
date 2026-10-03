// Gjeneron ikonat PNG të PWA-së pa varësi: sfond i errët + unazë donut (Shtëpi/Personal).
import { writeFileSync } from 'node:fs'
import { deflateSync, crc32 } from 'node:zlib'

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const BG1 = hex('#141a26'), BG2 = hex('#0b0f17'), SKY = hex('#38bdf8'), VIO = hex('#a78bfa'), TRACK = hex('#263044')

function shade(x, y, size, safe) {
  // koordinata në [-1, 1]; `safe` zvogëlon përmbajtjen për ikonat maskable
  const u = ((x / size) * 2 - 1) / safe, v = ((y / size) * 2 - 1) / safe
  const t = y / size
  let c = BG1.map((a, i) => a + (BG2[i] - a) * t)
  const r = Math.hypot(u, v)
  if (r > 0.42 && r < 0.66) {
    let ang = (Math.atan2(u, -v) * 180) / Math.PI // 0° lart, në drejtim të orës
    if (ang < 0) ang += 360
    if (ang < 205) c = SKY
    else if (ang > 212 && ang < 330) c = VIO
    else if (ang >= 337) c = TRACK
  }
  return c
}

function png(size, safe = 1) {
  const SS = 3 // supersampling për skaje të buta
  const raw = Buffer.alloc(size * (size * 3 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0]
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = shade(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size, safe)
          for (let i = 0; i < 3; i++) acc[i] += c[i]
        }
      const o = y * (size * 3 + 1) + 1 + x * 3
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(acc[i] / (SS * SS))
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2 // 8-bit RGB, pa transparencë (iOS e kërkon të plotë)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync('public/pwa-192.png', png(192))
writeFileSync('public/pwa-512.png', png(512))
writeFileSync('public/pwa-maskable-512.png', png(512, 0.8))
writeFileSync('public/apple-touch-icon.png', png(180))
writeFileSync('public/favicon.png', png(64))
console.log('ikonat u gjeneruan')
