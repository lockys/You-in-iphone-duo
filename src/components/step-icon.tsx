export default function StepIcon({ number }: { number: 1 | 2 | 3 }) {
  return (
    <svg className="step-icon" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="12" stroke="currentColor" />
      <text
        x="14"
        y="19"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize="14"
        fontWeight="700"
      >
        {number}
      </text>
    </svg>
  );
}
