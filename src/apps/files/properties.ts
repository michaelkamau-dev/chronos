/**
 * The Properties dialog.
 *
 * §5 asks for "era-correct metadata (type/creator codes on Mac, extensions on
 * Windows)" and the app is the one layer that may not know which of those it is
 * looking at. The resolution is that neither is an era conditional in the first
 * place:
 *
 * - **The extension is the codec's business.** `codec.displayName` already decides
 *   whether `Letter.txt` shows its extension, coerces it to 8.3, or hides it, so
 *   the Name row asks the codec and gets the era's answer without knowing what the
 *   answer means.
 * - **Type and creator codes are data, not styling.** They are optional fields on
 *   `FsFile` — a classic Mac four-character `OSType`. The dialog shows the rows
 *   when the node carries them and omits them when it does not, which produces
 *   exactly the era-correct result on both platforms for a reason that has nothing
 *   to do with eras: a file created under Windows has no creator code to show.
 *
 * So this file contains no era knowledge and needs none, which is the test the
 * invariant scan applies to it mechanically.
 */

import type { FsNode, PathCodec } from '../../core/fs/types.js'
import { isDir, isFile } from '../../core/fs/types.js'
import type { UiKit } from '../../core/ui/kit.js'
import type { DialogSpec } from '../../core/ui/dialogs.js'
import { formatDate, formatKind, formatSize } from './format.js'

export interface PropertiesInput {
  node: FsNode
  /** Root-first chain ending at the node, for the Where row. */
  chain: readonly FsNode[]
  codec: PathCodec
}

/**
 * Builds the dialog spec. The caller opens it, so this module never touches the
 * window manager and stays a pure description of what to show.
 */
export function propertiesDialog(input: PropertiesInput): DialogSpec {
  const { node, chain, codec } = input
  return {
    title: `${codec.displayName(node)} Properties`,
    size: { w: 320, h: 250 },
    buttons: [{ label: 'OK', isDefault: true, isCancel: true }],
    build: (body, ui) => {
      const rows: Array<readonly [string, string]> = []
      rows.push(['Name', codec.displayName(node)])
      rows.push(['Kind', formatKind(node)])
      // The enclosing folder, not the node itself: `chain` ends at the node, so the
      // location is everything before it.
      rows.push(['Where', codec.format(chain.slice(0, -1))])

      if (isDir(node)) {
        const count = node.childIds.length
        rows.push(['Contains', `${count} item${count === 1 ? '' : 's'}`])
      } else if (isFile(node)) {
        rows.push(['Size', formatSize(node.size)])
        rows.push(['Format', node.mime])
        if (node.typeCode !== undefined) rows.push(['Type', node.typeCode])
        if (node.creatorCode !== undefined) rows.push(['Creator', node.creatorCode])
      }

      rows.push(['Created', formatDate(node.created)])
      rows.push(['Modified', formatDate(node.modified)])
      if (node.trashedAt !== undefined) rows.push(['Trashed', formatDate(node.trashedAt)])

      const grid = body.ownerDocument.createElement('div')
      grid.dataset['uiRole'] = 'properties'
      for (const [caption, value] of rows) {
        appendRow(grid, ui, caption, value)
      }
      body.appendChild(grid)

      // Locked is the one genuinely interactive row, and it is read-only here: the
      // filesystem protects well-known folders structurally, so offering a control
      // that cannot take effect would be a lie about what the system permits.
      const locked = ui.checkbox({
        label: 'Locked',
        checked: node.locked || node.wellKnown !== undefined,
        enabled: false,
        onChange: () => undefined,
      })
      body.appendChild(locked.el)
    },
  }
}

function appendRow(grid: HTMLElement, ui: UiKit, caption: string, value: string): void {
  const captionEl = ui.label({ text: caption })
  captionEl.el.dataset['uiRole'] = 'property-name'
  const valueEl = ui.label({ text: value })
  valueEl.el.dataset['uiRole'] = 'property-value'
  grid.append(captionEl.el, valueEl.el)
}
