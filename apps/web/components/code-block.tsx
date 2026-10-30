import { FC, useCallback, useState } from 'react'
import styles from 'styles/CodeBlock.module.css'

interface Props {
  code: string
  label: string
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
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be unavailable (insecure context, denied permission).
      // The text is still selectable, so there is nothing else to do.
    }
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
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
