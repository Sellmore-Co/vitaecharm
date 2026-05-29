/**
 * VitaeCharm campaign worker.
 *
 * Serves the built static campaign (_site/) via the ASSETS binding.
 * The bare root path (/) has no page, so redirect it to the main store
 * instead of showing the 404 page. Everything else falls through to the
 * static assets (e.g. /vitaecharm/presell/).
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.redirect("https://vitaecharm.com/", 302);
    }

    return env.ASSETS.fetch(request);
  },
};
