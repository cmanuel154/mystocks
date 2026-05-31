import Link from 'next/link';

export const dynamic = 'force-static';
export const metadata = { title: 'Terms of Service — MyStocks' };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <Link href="/" className="text-sm text-indigo-600 hover:underline">← Back</Link>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: May 2026</p>
        <div className="prose prose-sm text-gray-700 space-y-6">
          <section><h2 className="text-lg font-semibold text-gray-900 mb-2">1. Acceptance of Terms</h2><p>By accessing or using the Marketplace Dashboard service, you agree to be bound by these Terms of Service. If you do not agree, do not use the service.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900 mb-2">2. Description of Service</h2><p>Marketplace Dashboard is a tool that allows sellers to manage and synchronize inventory, orders, and products across TikTok Shop and Shopee from a single interface. We are an independent tool and are not affiliated with TikTok or Shopee.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900 mb-2">3. Use of Third-Party Platforms</h2><p>To use this service, you must connect your TikTok Shop and/or Shopee seller accounts via their official OAuth authorization flows. By doing so, you grant us permission to access your account data as described in your authorization. You remain responsible for compliance with TikTok Shop's and Shopee's own terms of service.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900 mb-2">4. Data and Privacy</h2><p>We only access the data you explicitly authorize. We do not sell your data to third parties. Please review our <Link href="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</Link> for full details.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900 mb-2">5. Prohibited Uses</h2><p>You may not use this service to engage in fraudulent activity, violate any applicable law, or interfere with the integrity of any marketplace platform.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900 mb-2">6. Limitation of Liability</h2><p>This service is provided "as is." We are not liable for any losses resulting from inventory sync failures, API outages on third-party platforms, or actions taken based on data shown in the dashboard.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900 mb-2">7. Changes to Terms</h2><p>We may update these terms at any time. Continued use of the service after changes constitutes acceptance.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900 mb-2">8. Contact</h2><p>For questions about these terms, contact us at the email address provided in your app registration.</p></section>
        </div>
      </div>
    </div>
  );
}
