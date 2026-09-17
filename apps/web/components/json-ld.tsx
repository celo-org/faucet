import { FC } from 'react'

interface Props {
  data: Record<string, unknown>
}

/**
 * Structured data for retrieval systems.
 *
 * Rendered in the body rather than inside next/head: Head serialises its
 * children and mangles a script tag, and application/ld+json is valid anywhere
 * in the document.
 */
export const JsonLd: FC<Props> = ({ data }) => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
  />
)
