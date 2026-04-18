import { useNavigate } from 'react-router-dom';
import eloFixLogoDark from '@/assets/elofix-logo-dark.png';
import eloFixLogoLight from '@/assets/elofix-logo-light.png';

interface EloFixLogoProps {
  variant?: 'light' | 'dark';
  className?: string;
  clickable?: boolean;
}

export function EloFixLogo({ variant = 'dark', className = '', clickable = true }: EloFixLogoProps) {
  const navigate = useNavigate();

  const logoSrc = variant === 'light' ? eloFixLogoLight : eloFixLogoDark;

  const img = (
    <img
      src={logoSrc}
      alt="EloFix"
      className={`h-10 w-auto object-contain ${className}`}
    />
  );

  if (!clickable) return img;

  return (
    <button onClick={() => navigate('/')} className="flex items-center" type="button" aria-label="Go to home">
      {img}
    </button>
  );
}
