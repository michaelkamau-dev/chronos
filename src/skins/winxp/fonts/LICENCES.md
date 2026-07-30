# Fonts bundled with the Windows XP skin

None of the four faces Microsoft specifies is redistributable, so each is a
permissively-licensed substitute. See `docs/fonts/README.md` for how each was
chosen and what it costs in fidelity.

| File | Face | Stands in for | Licence |
|---|---|---|---|
| `tahoma-sub.woff2` | Source Sans 3, instanced at wght 400 | Tahoma 8/9/11pt | SIL OFL 1.1 |
| `caption-sub.woff2` | Cabin, instanced at wght 700 / wdth 100 | Trebuchet MS Bold 10pt | SIL OFL 1.1 |
| `palette-defer.woff2` | DejaVu Sans Bold | Verdana Bold 8pt | Bitstream Vera licence |
| `header-defer.woff2` | Libre Franklin, instanced at wght 500 | Franklin Gothic Medium 14pt+ | SIL OFL 1.1 |

`-defer` marks a face that is declared but not on the critical path: floating
palette captions and 14pt+ headers do not exist on first paint, and a browser only
fetches an `@font-face` when rendered text actually uses it.

## Licence notices are retained inside the files

Subsetting drops name records by default, including nameID 0 (copyright) and 13
(licence). Both the OFL and the Bitstream Vera licence require the notice to travel
with the font, so `--name-IDs='0,1,2,3,4,5,6,7,13,14'` is passed explicitly. Verify
with:

```
python3 -c "from fontTools.ttLib import TTFont; import sys; \
  t=TTFont(sys.argv[1]); print([(r.nameID, str(r)[:60]) for r in t['name'].names if r.nameID in (0,13,14)])" \
  src/skins/winxp/fonts/tahoma-sub.woff2
```

## Reproducing

Instanced with `fontTools.varLib.instancer` pinning every axis — a partially
instanced variable font keeps its `gvar`/`HVAR` machinery and is roughly twice the
size — then subset with `pyftsubset` to Latin-1 plus the punctuation XP chrome uses.
Build-time only; `fontTools` is not a runtime dependency.
