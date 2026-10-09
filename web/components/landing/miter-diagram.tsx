// The miter: target and spec read the same inputs; a comparison box outputs one bit,
// 1 exactly when they disagree. Inline SVG drawn with token colours only.
export function MiterDiagram() {
  const wire = 'var(--color-border-strong)';
  const pulse = 'var(--color-moss)';
  const paths = ['M 60 70 H 150 V 60 H 250', 'M 60 70 H 150 V 180 H 250', 'M 410 60 H 470 V 120 H 520', 'M 410 180 H 470 V 120 H 520', 'M 680 120 H 760'];
  return (
    <svg viewBox="0 0 860 240" role="img" aria-label="Miter: target and spec feed one comparison box with a single output bit" className="h-auto w-full max-w-[860px]">
      <g fill="none" strokeWidth={2}>
        {paths.map((d) => (
          <path key={d} d={d} stroke={wire} />
        ))}
        {paths.map((d, i) => (
          <path key={`p${d}`} d={d} stroke={pulse} strokeWidth={3} strokeLinecap="round" className="miter-wire-pulse" style={{ animationDelay: `${i < 2 ? 0 : i < 4 ? 1 : 2}s` }} />
        ))}
      </g>
      <g fontFamily="var(--font-sans)" fontSize={13} fill="var(--color-text-secondary)">
        <circle cx={60} cy={70} r={6} fill={pulse} />
        <text x={20} y={100}>input x</text>
        <rect x={250} y={30} width={160} height={60} rx={12} fill="var(--color-bg-surface)" stroke="var(--color-border-default)" />
        <text x={330} y={58} textAnchor="middle" fill="var(--color-text-primary)" fontWeight={600}>
          Target
        </text>
        <text x={330} y={76} textAnchor="middle">
          the claimed circuit
        </text>
        <rect x={250} y={150} width={160} height={60} rx={12} fill="var(--color-bg-surface)" stroke="var(--color-border-default)" />
        <text x={330} y={178} textAnchor="middle" fill="var(--color-text-primary)" fontWeight={600}>
          Spec
        </text>
        <text x={330} y={196} textAnchor="middle">
          intended behaviour
        </text>
        <rect x={520} y={85} width={160} height={70} rx={12} fill="var(--color-olive-bg)" stroke="var(--color-accent-border)" />
        <text x={600} y={115} textAnchor="middle" fill="var(--color-text-primary)" fontWeight={600}>
          Compare
        </text>
        <text x={600} y={134} textAnchor="middle">
          XOR every pin, OR them
        </text>
        <circle cx={760} cy={120} r={14} fill="var(--color-moss)" />
        <text x={760} y={125} textAnchor="middle" fill="var(--color-bg-surface)" fontWeight={700}>
          1?
        </text>
        <text x={760} y={160} textAnchor="middle">
          1 = they disagree
        </text>
      </g>
    </svg>
  );
}
