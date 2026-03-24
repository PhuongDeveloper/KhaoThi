import { useMemo } from 'react'
import katex from 'katex'

interface MathContentProps {
  content: string
  className?: string
}

/**
 * Component renders text that may contain LaTeX math formulas.
 * Supports:
 *   - Inline math: $...$ or \(...\)
 *   - Display math: $$...$$ or \[...\]
 * Normal text is preserved with whitespace-pre-wrap.
 */
export default function MathContent({ content, className = '' }: MathContentProps) {
  const rendered = useMemo(() => {
    if (!content) return ''

    try {
      // Pattern to match LaTeX delimiters:
      // $$...$$ (display), $...$ (inline), \[...\] (display), \(...\) (inline)
      const mathPattern = /(\$\$[\s\S]+?\$\$|\$[^\$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g

      const parts = content.split(mathPattern)

      return parts
        .map((part) => {
          // Display math: $$...$$ or \[...\]
          if (
            (part.startsWith('$$') && part.endsWith('$$')) ||
            (part.startsWith('\\[') && part.endsWith('\\]'))
          ) {
            const tex = part.startsWith('$$')
              ? part.slice(2, -2)
              : part.slice(2, -2)
            try {
              return katex.renderToString(tex, {
                displayMode: true,
                throwOnError: false,
                trust: true,
              })
            } catch {
              return `<span class="text-red-500">${part}</span>`
            }
          }

          // Inline math: $...$ or \(...\)
          if (
            (part.startsWith('$') && part.endsWith('$') && part.length > 2) ||
            (part.startsWith('\\(') && part.endsWith('\\)'))
          ) {
            const tex = part.startsWith('$')
              ? part.slice(1, -1)
              : part.slice(2, -2)
            try {
              return katex.renderToString(tex, {
                displayMode: false,
                throwOnError: false,
                trust: true,
              })
            } catch {
              return `<span class="text-red-500">${part}</span>`
            }
          }

          // Normal text — escape HTML
          return part
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br/>')
        })
        .join('')
    } catch {
      return content
    }
  }, [content])

  return (
    <span
      className={`math-content ${className}`}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  )
}
