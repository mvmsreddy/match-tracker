import { createContext, useContext, useEffect, useState } from 'react';

const THEMES = [
  { id: 'dark',     label: 'Dark',     swatch: '#14293D' },
  { id: 'midnight', label: 'Midnight', swatch: '#1A1040' },
  { id: 'navy',     label: 'Navy',     swatch: '#0B1620' },
];

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem('tt-theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tt-theme', theme);
  }, [theme]);

  // Apply theme immediately on first render too
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState, THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
