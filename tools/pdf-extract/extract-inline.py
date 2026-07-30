#!/usr/bin/env python3
"""
Extracts *inline* images (BI/ID/EI) from a PDF at their native pixel size.

Why this exists alongside extract-xobject.py: `page.get_images()` reports only
the page's /Resources /XObject entries, and it misses inline images entirely. In
the Mac OS 8 HIG that is not an edge case — the figures that carry the values no
prose states are inline:

  page  40  Figure 2-26  A horizontal scroll bar      140x19
  page 103  Figure 5-5   Tool palette                  55x109
  page 105  Figure 5-7   Full zoom box                 90x45

Those pages report zero images to the XObject path, which is exactly why the
scroll bar width and the zoom box geometry looked unavailable from the document.

Two further reasons this path is better than the XObject one for this document:

  * The data is raw, uncompressed 8- or 4-bit index bytes. No JPEG, no Flate, no
    lossy step anywhere — so a colour read out of one of these figures is Apple's
    exact byte, not a value recovered from a compressed approximation.
  * The colourspace is /Indexed /DeviceRGB with a 16-entry palette, so the era's
    actual palette comes out of the file as a list rather than being inferred
    from pixels.

Modes:

  catalogue <pdf>
      Every inline image, with page, native size, bit depth, colourspace, the
      resolved palette, and the placement box in points. Placement is reported
      only to show where on the page it sits; it is never used as a scale.

  extract <pdf> <page> <index> <out.png>
      One inline image at native size, palette applied, no resampling.
      <page> is 1-based; <index> is 0-based within that page.

  palette <pdf> <page> <index>
      Just the palette, as hex.

Requires: pip install pymupdf pillow
"""

import base64
import re
import sys
import zlib

import fitz
from PIL import Image

# Inline-image abbreviations, per PDF 32000-1 Table 93.
KEY_ALIASES = {
    "W": "Width", "H": "Height", "BPC": "BitsPerComponent",
    "CS": "ColorSpace", "F": "Filter", "D": "Decode",
    "DP": "DecodeParms", "IM": "ImageMask", "I": "Interpolate",
}
CS_ALIASES = {"G": "DeviceGray", "RGB": "DeviceRGB", "CMYK": "DeviceCMYK", "I": "Indexed"}
FILTER_ALIASES = {
    "AHx": "ASCIIHexDecode", "A85": "ASCII85Decode", "LZW": "LZWDecode",
    "Fl": "FlateDecode", "RL": "RunLengthDecode", "CCF": "CCITTFaxDecode",
    "DCT": "DCTDecode",
}
COMPONENTS = {"DeviceGray": 1, "DeviceRGB": 3, "DeviceCMYK": 4, "Indexed": 1}


def tokenise(blob):
    """Split an inline-image parameter dictionary into PDF tokens.

    Bracket-aware rather than regex-based, because two of this document's
    colourspaces are *nested* inline arrays —
    `/CS [ /Indexed [ /CalRGB << /Gamma [...] >> ] 15 571 0 R ]` — and a
    non-recursive `\\[[^\\]]*\\]` stops at the first inner `]`, truncating the
    palette reference and losing the image.
    """
    toks, i, n = [], 0, len(blob)
    while i < n:
        c = blob[i : i + 1]
        if c.isspace():
            i += 1
        elif c == b"/":
            j = i + 1
            while j < n and not blob[j : j + 1].isspace() and blob[j : j + 1] not in b"/[]<>()":
                j += 1
            toks.append(blob[i:j])
            i = j
        elif c in (b"[", b"<"):
            # `<<` opens a dictionary, a lone `<` a hex string; both close on a
            # matching depth-0 delimiter.
            open_tok = b"<<" if blob[i : i + 2] == b"<<" else c
            close_tok = b">>" if open_tok == b"<<" else (b"]" if c == b"[" else b">")
            depth, j = 0, i
            while j < n:
                if blob[j : j + len(open_tok)] == open_tok:
                    depth += 1
                    j += len(open_tok)
                elif blob[j : j + len(close_tok)] == close_tok:
                    depth -= 1
                    j += len(close_tok)
                    if depth == 0:
                        break
                else:
                    j += 1
            toks.append(blob[i:j])
            i = j
        else:
            j = i
            while j < n and not blob[j : j + 1].isspace() and blob[j : j + 1] not in b"/[]<>":
                j += 1
            toks.append(blob[i:j] if j > i else c)
            i = max(j, i + 1)
    return toks


def parse_dict(blob):
    """Parse the key/value text between BI and ID into a plain dict.

    Tokenised rather than regexed key-by-key, because a name *value* starts with
    a slash too: `/CS /CS24` read as key-then-rest yields an empty colourspace
    and a phantom `CS24` key.
    """
    toks = tokenise(blob)
    out = {}
    i = 0
    while i + 1 < len(toks):
        key = toks[i].decode("latin-1")
        if not key.startswith("/"):
            i += 1
            continue
        out[KEY_ALIASES.get(key[1:], key[1:])] = toks[i + 1].decode("latin-1")
        i += 2
    return out


def inline_placements(page):
    """Width/height in points of every inline image, in content-stream order.

    An inline image is painted into the unit square, so the CTM in force at the
    BI carries its placed size. Tracked here rather than taken from
    get_image_info(), whose ordering is not guaranteed to match. Reported for
    orientation only — placement scale says nothing about the bitmap's own
    scale, which is the whole point of extracting rather than rendering.
    """
    raw = page.read_contents()
    ctm = fitz.Matrix(1, 0, 0, 1, 0, 0)
    stack, out = [], []
    for m in re.finditer(rb"(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+"
                         rb"(-?[\d.]+)\s+(-?[\d.]+)\s+cm|\bq\b|\bQ\b|\bBI\b", raw):
        tok = m.group(0)
        if tok == b"q":
            stack.append(fitz.Matrix(ctm))
        elif tok == b"Q":
            if stack:
                ctm = stack.pop()
        elif tok == b"BI":
            out.append((round(abs(ctm.a), 1), round(abs(ctm.d), 1)))
        else:
            vals = [float(m.group(i)) for i in range(1, 7)]
            ctm = fitz.Matrix(*vals) * ctm
    return out


INDEXED_RE = re.compile(r"/Indexed\s+(.*?)\s+(\d+)\s+(\d+)\s+0\s+R\s*\]?\s*$", re.S)


def read_palette(doc, obj_text):
    """Pull (kind, palette) out of an /Indexed colourspace's textual form.

    Handles both the named form (`5 0 R` → `[ /Indexed /DeviceRGB 15 6 0 R ]`)
    and the inline-array form with a CalRGB base, which is what the radio-button
    and bevel-button figures use.
    """
    m = INDEXED_RE.search(obj_text.strip().rstrip("]").strip() + "]")
    if not m:
        return None, None
    base_txt, hival, pal_xref = m.group(1), int(m.group(2)), int(m.group(3))
    base = "CalRGB" if "/CalRGB" in base_txt else base_txt.strip().lstrip("/").split()[0]
    ncomp = 1 if base == "CalGray" else (4 if base == "DeviceCMYK" else 3)
    raw = doc.xref_stream(pal_xref)
    if raw is None:
        return None, None
    palette = [tuple(raw[i * ncomp : i * ncomp + ncomp]) for i in range(hival + 1)]
    return f"Indexed/{base}", palette


def resolve_colorspace(doc, page, spec):
    """Resolve an inline image's /CS to (kind, components, palette-or-None)."""
    spec = spec.strip()
    if spec.startswith("["):
        kind, palette = read_palette(doc, spec)
        if palette is not None:
            return kind, 1, palette
        return spec, 1, None

    name = spec.lstrip("/")
    if name in CS_ALIASES:
        kind = CS_ALIASES[name]
        return kind, COMPONENTS[kind], None
    if name in COMPONENTS:
        return name, COMPONENTS[name], None

    # A named colourspace lives in the page's resource dictionary. Indexed
    # spaces carry the palette in a separate stream object.
    kind_txt = doc.xref_get_key(page.xref, f"Resources/ColorSpace/{name}")
    if kind_txt[0] != "xref":
        return name, 1, None
    obj = doc.xref_object(int(kind_txt[1].split()[0]))
    kind, palette = read_palette(doc, obj)
    if palette is None:
        return obj, 1, None
    return kind, 1, palette


def decode_data(data, filters):
    for f in filters:
        f = FILTER_ALIASES.get(f, f)
        if f == "FlateDecode":
            data = zlib.decompress(data)
        elif f == "ASCII85Decode":
            data = base64.a85decode(data, adobe=True)
        elif f == "ASCIIHexDecode":
            hexs = re.sub(rb"[^0-9A-Fa-f]", b"", data.split(b">")[0])
            data = bytes.fromhex(hexs.decode("ascii"))
        elif f == "RunLengthDecode":
            out, i = bytearray(), 0
            while i < len(data):
                n = data[i]
                if n == 128:
                    break
                if n < 128:
                    out += data[i + 1 : i + 2 + n]
                    i += 2 + n
                else:
                    out += data[i + 1 : i + 2] * (257 - n)
                    i += 2
            data = bytes(out)
        else:
            raise ValueError(f"inline filter {f} not handled")
    return data


def find_inline(doc, page):
    """Yield every inline image on the page as a descriptor dict."""
    raw = page.read_contents()
    out = []
    pos = 0
    while True:
        bi = raw.find(b"BI", pos)
        if bi < 0:
            break
        # Guard against 'BI' inside a token; it must be delimited.
        if bi > 0 and raw[bi - 1 : bi].isalnum():
            pos = bi + 2
            continue
        idp = raw.find(b"ID", bi)
        if idp < 0:
            break
        params = parse_dict(raw[bi + 2 : idp])
        w = int(params.get("Width", 0))
        h = int(params.get("Height", 0))
        bpc = int(params.get("BitsPerComponent", 8))
        filters = [x.strip() for x in re.findall(r"/(\w+)", params.get("Filter", "")) if x]
        kind, ncomp, palette = resolve_colorspace(doc, page, params.get("ColorSpace", "G"))

        start = idp + 3  # one whitespace byte separates ID from the data
        if filters:
            # Filtered data has no computable length; scan for the EI delimiter.
            ei = raw.find(b"EI", start)
            data = raw[start:ei]
        else:
            row = (w * ncomp * bpc + 7) // 8
            data = raw[start : start + row * h]
            ei = start + row * h
        out.append(
            {
                "params": params, "w": w, "h": h, "bpc": bpc, "ncomp": ncomp,
                "cs": kind, "palette": palette, "filters": filters, "data": data,
            }
        )
        pos = ei + 2
    return out


def to_image(desc):
    w, h, bpc = desc["w"], desc["h"], desc["bpc"]
    data = decode_data(desc["data"], desc["filters"])
    row = (w * desc["ncomp"] * bpc + 7) // 8

    # Unpack sub-byte samples. 4bpc indexed is two pixels per byte, high nibble
    # first, and every row starts on a byte boundary.
    if bpc == 8:
        idx = [list(data[y * row : y * row + w * desc["ncomp"]]) for y in range(h)]
    elif bpc in (1, 2, 4):
        per = 8 // bpc
        mask = (1 << bpc) - 1
        idx = []
        for y in range(h):
            line = data[y * row : (y + 1) * row]
            vals = []
            for byte in line:
                for k in range(per):
                    vals.append((byte >> (8 - bpc * (k + 1))) & mask)
            idx.append(vals[: w * desc["ncomp"]])
    else:
        raise ValueError(f"bpc {bpc} not handled")

    img = Image.new("RGB", (w, h))
    px = img.load()
    pal = desc["palette"]
    for y in range(h):
        line = idx[y]
        for x in range(w):
            if pal is not None:
                c = pal[line[x]] if line[x] < len(pal) else (0, 0, 0)
                px[x, y] = tuple(c[:3]) if len(c) >= 3 else (c[0], c[0], c[0])
            elif desc["ncomp"] == 1:
                v = line[x] if bpc == 8 else round(line[x] * 255 / ((1 << bpc) - 1))
                px[x, y] = (v, v, v)
            else:
                o = x * desc["ncomp"]
                px[x, y] = (line[o], line[o + 1], line[o + 2])
    return img


def hexpal(palette, limit=None):
    if not palette:
        return "-"
    hexes = ["#%02X%02X%02X" % tuple(c[:3]) if len(c) >= 3 else "#%02X%02X%02X" % (c[0],) * 3
             for c in palette]
    if limit and len(hexes) > limit:
        # A 256-entry grey ramp says nothing a 16-entry era palette does; print
        # the head so the catalogue stays readable and note what was dropped.
        return " ".join(hexes[:limit]) + f" … (+{len(hexes) - limit} more)"
    return " ".join(hexes)


def catalogue(path):
    doc = fitz.open(path)
    print(f"{path}: {doc.page_count} pages")
    for pno in range(doc.page_count):
        page = doc.load_page(pno)
        found = find_inline(doc, page)
        if not found:
            continue
        placed = inline_placements(page)
        figs = re.findall(r"Figure\s+[\dA-Z]+-\d+", page.get_text())
        print(f"\n--- page {pno + 1} figures={figs or '-'}")
        for i, d in enumerate(found):
            box = placed[i] if i < len(placed) else None
            ppp = round(d["w"] / box[0], 3) if box and box[0] else None
            print(
                f"    inline #{i} {d['w']}x{d['h']}px bpc={d['bpc']} cs={d['cs']} "
                f"filters={d['filters'] or '-'} placed={box}pt px/pt={ppp}"
            )
            if d["palette"]:
                print(f"      palette: {hexpal(d['palette'], 20)}")
    return 0


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    mode, path = sys.argv[1], sys.argv[2]
    if mode == "catalogue":
        return catalogue(path)
    doc = fitz.open(path)
    page = doc.load_page(int(sys.argv[3]) - 1)
    found = find_inline(doc, page)
    d = found[int(sys.argv[4])]
    if mode == "palette":
        print(hexpal(d["palette"]))
        return 0
    if mode == "extract":
        img = to_image(d)
        img.save(sys.argv[5])
        print(f"page {sys.argv[3]} inline #{sys.argv[4]}: {img.width}x{img.height}px "
              f"bpc={d['bpc']} cs={d['cs']} -> {sys.argv[5]}")
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main())
