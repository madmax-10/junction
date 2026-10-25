type ImpactDiagramProps = {
  impact: 'rear' | 'front' | 'side'
}

const impactPoints = {
  rear: { cx: 5, cy: 14 },
  front: { cx: 35, cy: 14 },
  side: { cx: 20, cy: 4.5 },
} as const

export function ImpactDiagram({ impact }: ImpactDiagramProps) {
  const point = impactPoints[impact]

  return (
    <svg viewBox="0 0 40 28" width="30" height="21" fill="none" aria-hidden="true">
      <rect x="5" y="5" width="30" height="18" rx="6" fill="currentColor" opacity="0.18" />
      <rect x="5" y="5" width="30" height="18" rx="6" stroke="currentColor" strokeWidth="2" />
      <rect x="22" y="8.5" width="6" height="11" rx="2" fill="currentColor" />
      <circle cx={point.cx} cy={point.cy} r="4.5" className="fill-accent" />
    </svg>
  )
}
