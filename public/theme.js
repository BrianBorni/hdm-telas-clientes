(() => {
  let theme = 'light';
  try {
    const saved = localStorage.getItem('hdm-client-theme');
    if (saved === 'dark' || saved === 'light') theme = saved;
  } catch { /* El modo claro sigue disponible sin almacenamiento. */ }
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#131415' : '#ffffff';
})();
