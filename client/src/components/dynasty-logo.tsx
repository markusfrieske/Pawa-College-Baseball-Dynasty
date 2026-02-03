export function DynastyLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="20" cy="20" r="18" fill="#C4A35A" stroke="#8B7340" strokeWidth="2" />
      
      <circle cx="12" cy="20" r="3" fill="#1a2b1a" />
      <circle cx="20" cy="20" r="3" fill="#1a2b1a" />
      <circle cx="28" cy="20" r="3" fill="#1a2b1a" />
      
      <circle cx="4" cy="32" r="4" fill="#C4A35A" stroke="#8B7340" strokeWidth="1.5" />
      <circle cx="1" cy="37" r="2" fill="#C4A35A" stroke="#8B7340" strokeWidth="1" />
    </svg>
  );
}

export function DynastyLogoLarge({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 80"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="40" cy="36" r="32" fill="#C4A35A" stroke="#8B7340" strokeWidth="3" />
      
      <rect x="22" y="32" width="6" height="6" fill="#1a2b1a" />
      <rect x="37" y="32" width="6" height="6" fill="#1a2b1a" />
      <rect x="52" y="32" width="6" height="6" fill="#1a2b1a" />
      
      <circle cx="14" cy="62" r="7" fill="#C4A35A" stroke="#8B7340" strokeWidth="2" />
      <circle cx="4" cy="74" r="4" fill="#C4A35A" stroke="#8B7340" strokeWidth="1.5" />
    </svg>
  );
}
