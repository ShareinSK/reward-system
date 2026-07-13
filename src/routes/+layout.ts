// Static SPA mode for GitHub Pages: client-side routing only, with 404.html as the fallback shell.
// trailingSlash 'always' matches GitHub Pages directory URLs (/repo/, /login/, …).
export const ssr = false;
export const prerender = true;
export const trailingSlash = 'always';
