import { useNavigate } from 'react-router-dom';
import eloFixLogoDark from '@/assets/elofix-logo-dark.webp';
import eloFixLogoLight from '@/assets/elofix-logo-light.webp';

interface EloFixLogoProps {
  variant?: 'light' | 'dark';
  className?: string;
  clickable?: boolean;
}

export function EloFixLogo({ variant = 'dark', className = '', clickable = true }: EloFixLogoProps) {
  const logoSrc = variant === 'light' ? eloFixLogoLight : eloFixLogoDark;

  const img = (
    <img
      src={logoSrc}
      alt="EloFix"
      width={variant === 'light' ? 1284 : 1425}
      height={variant === 'light' ? 402 : 492}
      decoding="async"
      className={`h-10 w-auto object-contain ${className}`}
    />
  );

  if (!clickable) return img;

  return <ClickableLogo>{img}</ClickableLogo>;
}

function ClickableLogo({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  return (
    <button onClick={() => navigate('/')} className="flex items-center" type="button" aria-label="Go to home">
      {children}
    </button>
  );
}
