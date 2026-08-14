export const THEME_STORAGE_KEY = 'bachkhoa_theme';

export function getInitialTheme() {
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;

  const activeTheme = document.documentElement.getAttribute('data-theme');
  return activeTheme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', nextTheme);
  window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
}
