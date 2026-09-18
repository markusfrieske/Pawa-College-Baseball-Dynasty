export function DynastyLogo({ className = '' }: { className?: string }) {
  return <svg viewBox="0 0 64 64" role="img" aria-label="PAWA College Baseball Dynasty" className={className}>
    <path d="M8 5h48v37L32 59 8 42Z" fill="#17392f" stroke="#c5ab71" strokeWidth="3"/>
    <path d="M23 18h13q12 0 12 11T36 40h-5v10h-8Zm8 7v8h5q5 0 5-4t-5-4Z" fill="#efe6d1"/>
    <path d="M14 14h5M45 48l5-4" stroke="#c5ab71" strokeWidth="2"/>
  </svg>;
}
export const DynastyLogoLarge = DynastyLogo;
