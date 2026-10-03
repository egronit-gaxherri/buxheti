/**
 * Gjenerues minimal PDF (pa varësi): tekst me fontet standarde Helvetica/Courier
 * dhe kodim WinAnsi, që mbulon ë, ç dhe €. Mjafton për raportin mujor.
 */

export type FontId = 'R' | 'B' | 'M' // Helvetica, Helvetica-Bold, Courier
export interface TextOp {
  x: number
  y: number
  text: string
  font?: FontId
  size?: number
  gray?: number // 0 = e zezë, 1 = e bardhë
}

const WINANSI: Record<string, number> = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
}

/** Kthen tekstin në bajte WinAnsi (si string me karaktere < 256) dhe i shmang ( ) \ */
export function encodeWinAnsi(s: string): string {
  let out = ''
  for (const ch of s.replace(/−/g, '-').replace(/→/g, '->')) {
    const c = ch.codePointAt(0)!
    const code = WINANSI[ch] ?? (c < 0x80 || (c >= 0xa0 && c <= 0xff) ? c : 0x3f)
    const b = String.fromCharCode(code)
    out += b === '(' || b === ')' || b === '\\' ? '\\' + b : b
  }
  return out
}

export const A4 = { w: 595, h: 842 }

export function buildPdf(pages: TextOp[][]): Uint8Array<ArrayBuffer> {
  const objs: string[] = []
  const add = (body: string) => objs.push(body) // numri i objektit = indeksi + 1
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('') // Pages, plotësohet më poshtë
  const font = (name: string) => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`
  add(font('Helvetica'))
  add(font('Helvetica-Bold'))
  add(font('Courier'))
  const fontRef: Record<FontId, string> = { R: 'F1', B: 'F2', M: 'F3' }

  const kids: number[] = []
  for (const ops of pages.length ? pages : [[]]) {
    const content = ops
      .map((o) => `BT ${(o.gray ?? 0).toFixed(2)} g /${fontRef[o.font ?? 'R']} ${o.size ?? 10} Tf ${o.x.toFixed(1)} ${o.y.toFixed(1)} Td (${encodeWinAnsi(o.text)}) Tj ET`)
      .join('\n')
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    const contentRef = objs.length
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentRef} 0 R >>`)
    kids.push(objs.length)
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`

  // Çdo karakter është një bajt, ndaj gjatësia e stringut = offset-i në bajte
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
  const offsets: number[] = []
  objs.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const bytes = new Uint8Array(out.length)
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i)
  return bytes
}

/** Ndihmës për faqosje: shkruan rreshta nga lart poshtë dhe hap faqe të re kur mbaron vendi. */
export class PdfWriter {
  pages: TextOp[][] = [[]]
  y = A4.h - 50
  readonly margin = 40
  private get page() {
    return this.pages[this.pages.length - 1]
  }
  ensure(space: number) {
    if (this.y - space < 45) {
      this.pages.push([])
      this.y = A4.h - 50
    }
  }
  line(text: string, opts: Omit<TextOp, 'x' | 'y' | 'text'> & { x?: number; gap?: number } = {}) {
    const size = opts.size ?? 10
    this.ensure(size + 4)
    this.page.push({ x: opts.x ?? this.margin, y: this.y, text, font: opts.font, size, gray: opts.gray })
    this.y -= opts.gap ?? size + 4
  }
  /** Rresht me kolona në Courier (gjerësi fikse: 0.6 × madhësia për karakter). */
  cols(cells: { text: string; width: number; right?: boolean }[], opts: { size?: number; gray?: number; font?: FontId } = {}) {
    const size = opts.size ?? 9
    const fit = (t: string, w: number, right?: boolean) => {
      const s = t.length > w ? t.slice(0, w - 1) + '…' : t
      return right ? s.padStart(w) : s.padEnd(w)
    }
    this.line(cells.map((c) => fit(c.text, c.width, c.right)).join(' '), { font: opts.font ?? 'M', size, gray: opts.gray })
  }
  space(h: number) {
    this.y -= h
  }
  build() {
    return buildPdf(this.pages)
  }
}
