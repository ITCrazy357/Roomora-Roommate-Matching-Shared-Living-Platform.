// Run before the body renders so a saved dark preference does not flash light.
export const themeScript = `try { document.documentElement.dataset.theme = localStorage.getItem('roomora-theme') === 'dark' ? 'dark' : 'light'; } catch { document.documentElement.dataset.theme = 'light'; }`;
