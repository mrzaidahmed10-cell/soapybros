// Sends visitors of the old soapybros.pages.dev address to soapybrosic.com with a permanent (301) redirect,
// keeping the page and query string. Every other hostname (including soapybrosic.com itself) is served normally.
//
// Safety check: the redirect only happens while soapybrosic.com answers with 200. If the custom domain is ever
// disconnected or broken, the old address keeps serving the site instead of sending people to a dead page.
const OLD_HOST = 'soapybros.pages.dev';
const NEW_ORIGIN = 'https://soapybrosic.com';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname !== OLD_HOST) return context.next();

  try {
    const probe = await fetch(NEW_ORIGIN + '/', {
      method: 'HEAD',
      redirect: 'manual',
      cf: { cacheEverything: true, cacheTtl: 300 },
    });
    if (probe.status === 200) {
      return Response.redirect(NEW_ORIGIN + url.pathname + url.search, 301);
    }
  } catch (err) {
    // fall through and serve the site from this address
  }
  return context.next();
}
