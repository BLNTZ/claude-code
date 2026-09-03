/**
 * Types for Jupyter notebook (`.ipynb`) files, following the nbformat v4
 * schema (https://nbformat.readthedocs.io/en/latest/format_description.html),
 * plus the simplified per-cell representation that Claude Code hands to the
 * model (see `src/utils/notebook.ts`).
 */

export type NotebookCellType = 'code' | 'markdown' | 'raw'

/**
 * nbformat "multiline string": either a single string or an array of lines
 * (each usually newline-terminated) that are concatenated on read.
 */
export type NotebookMultilineString = string | string[]

/**
 * MIME bundle carried by `execute_result` / `display_data` outputs. Text-like
 * MIME types hold multiline strings; other types (e.g. `application/json`) may
 * hold arbitrary JSON.
 */
export type NotebookMimeBundle = {
  'text/plain'?: NotebookMultilineString
  /** Base64-encoded PNG, possibly wrapped across lines. */
  'image/png'?: string
  /** Base64-encoded JPEG, possibly wrapped across lines. */
  'image/jpeg'?: string
  [mimeType: string]: unknown
}

export type NotebookStreamOutput = {
  output_type: 'stream'
  /** `stdout` or `stderr` */
  name: string
  text: NotebookMultilineString
}

export type NotebookDisplayOutput = {
  output_type: 'execute_result' | 'display_data'
  data?: NotebookMimeBundle
  metadata?: Record<string, unknown>
  /** Present on `execute_result` outputs only. */
  execution_count?: number | null
}

export type NotebookErrorOutput = {
  output_type: 'error'
  ename: string
  evalue: string
  traceback: string[]
}

export type NotebookCellOutput =
  | NotebookStreamOutput
  | NotebookDisplayOutput
  | NotebookErrorOutput

type NotebookCellBase = {
  /** Present in nbformat >= 4.5; older notebooks have no cell IDs. */
  id?: string
  source: NotebookMultilineString
  metadata: Record<string, unknown>
}

export type NotebookCodeCell = NotebookCellBase & {
  cell_type: 'code'
  // nbformat requires both fields on code cells, but notebooks written by
  // other tools sometimes omit them, so readers must tolerate their absence.
  execution_count?: number | null
  outputs?: NotebookCellOutput[]
}

export type NotebookMarkdownCell = NotebookCellBase & {
  cell_type: 'markdown'
}

export type NotebookRawCell = NotebookCellBase & {
  cell_type: 'raw'
}

export type NotebookCell =
  | NotebookCodeCell
  | NotebookMarkdownCell
  | NotebookRawCell

export type NotebookContent = {
  cells: NotebookCell[]
  metadata: {
    kernelspec?: {
      name: string
      display_name?: string
      language?: string
    }
    language_info?: {
      name: string
      version?: string
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  nbformat: number
  nbformat_minor: number
}

// ---------------------------------------------------------------------------
// Simplified representation passed to the model
// ---------------------------------------------------------------------------

export type NotebookOutputImage = {
  /** Base64-encoded image data with all whitespace stripped. */
  image_data: string
  media_type: 'image/png' | 'image/jpeg'
}

/** One cell output, flattened to text and/or a single image. */
export type NotebookCellSourceOutput = {
  output_type: NotebookCellOutput['output_type']
  text?: string
  image?: NotebookOutputImage
}

/** One cell, with its source joined and outputs flattened. */
export type NotebookCellSource = {
  /** The cell's own ID, or `cell-<index>` for notebooks without cell IDs. */
  cell_id: string
  cellType: NotebookCellType
  source: string
  /** Kernel language; set for code cells only. */
  language?: string
  execution_count?: number
  outputs?: NotebookCellSourceOutput[]
}
