import React, { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';

interface SaccoLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export const SaccoLogo: React.FC<SaccoLogoProps> = ({
  className = '',
  size = 'md',
  showText = false,
}) => {
  const [imgError, setImgError] = useState(false);
  const [customLogo, setCustomLogo] = useState<string | null>(() => {
    try {
      return localStorage.getItem('nyamuyanja_sacco_logo');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const stored = localStorage.getItem('nyamuyanja_sacco_logo');
        setCustomLogo(stored);
        setImgError(false);
      } catch {
        // Ignore storage access errors
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('sacco-logo-updated', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('sacco-logo-updated', handleStorageChange);
    };
  }, []);

  const dimensionClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  }[size];

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-9 h-9',
    xl: 'w-14 h-14',
  }[size];

  const activeLogoSource = customLogo || '/sacco-logo.png';

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <div
        className={`${dimensionClasses} rounded-xl bg-blue-700 text-white flex items-center justify-center shadow-xs border border-blue-200 overflow-hidden shrink-0 bg-white`}
      >
        {!imgError ? (
          <img
            src={activeLogoSource}
            alt="Nyamuyanja SACCO Ltd Logo"
            onError={() => setImgError(true)}
            className="w-full h-full object-contain p-1"
          />
        ) : (
          <div className="w-full h-full bg-blue-700 flex items-center justify-center text-white">
            <Shield className={`${iconSizes} text-white`} />
          </div>
        )}
      </div>

      {showText && (
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-slate-900 uppercase">
              Nyamuyanja SACCO Ltd
            </span>
            <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
              Turihamwe
            </span>
          </div>
          <p className="text-xs text-slate-500 hidden sm:block">
            Uganda • Official Institutional Management Platform
          </p>
        </div>
      )}
    </div>
  );
};
