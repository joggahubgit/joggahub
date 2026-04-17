interface LogoProps {
  size?: number;
  color?: string;
  className?: string;
}

export default function JoggaHubLogo({ size = 48, color = 'currentColor', className = '' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Central ball/globe */}
      <circle cx="50" cy="54" r="22" />

      {/* Court lines on ball — horizontal stripes cut out */}
      <rect x="28" y="48" width="44" height="5" fill="white" />
      <rect x="34" y="58" width="14" height="7" rx="1" fill="white" />

      {/* Top center person */}
      <circle cx="50" cy="10" r="7" />
      <rect x="43" y="18" width="14" height="5" rx="2" />

      {/* Left person */}
      <circle cx="14" cy="34" r="7" />
      <rect x="7" y="42" width="14" height="5" rx="2" />

      {/* Right person */}
      <circle cx="86" cy="34" r="7" />
      <rect x="79" y="42" width="14" height="5" rx="2" />

      {/* Left arm connecting to ball */}
      <path d="M21 47 Q28 44 32 50" strokeWidth="8" stroke={color} fill="none" strokeLinecap="round" />

      {/* Right arm connecting to ball */}
      <path d="M79 47 Q72 44 68 50" strokeWidth="8" stroke={color} fill="none" strokeLinecap="round" />

      {/* Top arm connecting to ball */}
      <path d="M50 23 Q50 34 50 38" strokeWidth="8" stroke={color} fill="none" strokeLinecap="round" />

      {/* Left body/cape */}
      <path d="M7 52 Q4 70 16 78 Q26 72 32 62" fill={color} />

      {/* Right body/cape */}
      <path d="M93 52 Q96 70 84 78 Q74 72 68 62" fill={color} />
    </svg>
  );
}
