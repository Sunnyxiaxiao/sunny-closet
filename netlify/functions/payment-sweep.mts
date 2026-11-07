// Netlify scheduled function: every hour (each run uses hosting credits), asks the site to settle orders stuck waiting on Stripe and to
// alert the owner about overdue pieces running into upcoming orders, and to retry order emails that failed (src/app/api/cron/payments/route.ts). Scheduled functions only run on the published production deploy.
// URL is set by Netlify (the site's main address); CRON_SECRET must be set in the site's environment variables.
export default async function paymentSweep() {
  const response = await fetch(`${process.env.URL}/api/cron/payments`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  console.log("[payment-sweep]", response.status, await response.text());
}

export const config = { schedule: "0 * * * *" };
