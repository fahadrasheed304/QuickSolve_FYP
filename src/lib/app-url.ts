export function getAppUrl(request: Request) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL
  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const requestOrigin = new URL(request.url).origin
  const vercelUrl = process.env.VERCEL_URL

  const baseUrl =
    configuredUrl ||
    (vercelProductionUrl ? `https://${vercelProductionUrl}` : '') ||
    requestOrigin ||
    (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000')

  return baseUrl.replace(/\/$/, '')
}
