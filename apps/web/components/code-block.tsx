import { FC, useCallback, useEffect, useRef, useState } from 'react'
import styles from 'styles/CodeBlock.module.css'

interface Props {
  code: string
  label: string
}

type CopyState = 'idle' | 'copied' | 'failed'

const BUTTON_TEXT: Record<CopyState, string> = {
  idle: 'Copy',
  copied: 'Copied',
  failed: 'Copy failed',
}

// Announced through the live region: aria-label overrides the button text,
// so a screen reader would otherwise never hear the state change.
const ANNOUNCEMENT: Record<CopyState, string> = {
  idle: '',
  copied: 'Copied to clipboard',
  failed: "Couldn't copy. Select the text instead.",
}

/**
 * A copyable snippet. The examples on /keys exist to be pasted into a shell or
 * an agent's tool call, and they rendered as unstyled monospace with no
 * boundary, so it was not obvious where a snippet started or ended.
 *
 * Long lines scroll inside the block instead of wrapping: a wrapped curl line
 * or a status URL broken mid-token reads as two commands.
 */
export const CodeBlock: FC<Props> = ({ code, label }) => {
  const [state, setState] = useState<CopyState>('idle')
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(resetTimer.current), [])

  const copy = useCallback(async () => {
    let next: CopyState
    try {
      await navigator.clipboard.writeText(code)
      next = 'copied'
    } catch {
      // Clipboard can be unavailable (insecure context, denied permission).
      // The text is still selectable, so say so rather than fail silently.
      next = 'failed'
    }
    // A second click restarts the timer instead of being cut short by the
    // first click's reset.
    clearTimeout(resetTimer.current)
    setState(next)
    resetTimer.current = setTimeout(() => setState('idle'), 1500)
  }, [code])

  return (
    <div className={styles.block}>
      <pre className={styles.pre}>
        <code>{code}</code>
      </pre>
      <button
        type="button"
        className={styles.copy}
        onClick={copy}
        aria-label={`Copy ${label}`}
      >
        {BUTTON_TEXT[state]}
      </button>
      <span className="sr-only" aria-live="polite">
        {ANNOUNCEMENT[state]}
      </span>
    </div>
  )
}
