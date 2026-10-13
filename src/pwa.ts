export function registerRecipesServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?v=3`, {
      scope: import.meta.env.BASE_URL,
      updateViaCache: 'none',
    }).catch(() => undefined);
  }, { once: true });
}
