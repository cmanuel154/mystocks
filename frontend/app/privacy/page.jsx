import Link from 'next/link';

export const dynamic = 'force-static';
export const metadata = { title: 'Privacy Policy — MyStocks' };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <Link href="/" className="text-sm text-indigo-600 hover:underline">← Back</Link>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: May 2026</p>
        <div className="prose prose-sm text-gray-700 space-y-6">
          <section><h2 className="text-lg font-semibold text-gray-900 mb-2">1. Information We Collect</h2><p>When you connect your marketplace accounts, we access the following data via official OAuth APIs:</p><ul className="list-disc pl-5 mt-2 space-y-1"><li>Shop name, shop ID, and account region</li><li>Product listings, names, SKUs, prices, and stock levels</li><li>Order information including order status, items, and totals</li><li>Inventory quantities</li></ul><p className="mt-2">We do not collect or store payment information, buyer personal data beyond what the marketplace API returns, or passwords.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900 mb-2">2. How We Use Your Information</h2><p>Data collected is used solely to display your unified inventory and order dashboard, push stock updates on your behalf, and maintain your session.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900 mb-2">3. Data Storage</h2><p>OAuth access tokens and refresh tokens are stored in server-side sessions via Firebase Firestore. They are not stored in plaintext.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900 mb-2">4. Data Sharing</h2><p>We do not sell, trade, or transfer your data to third parties. API calls are made directly to TikTok and Shopee on your behalf.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900 mb-2">5. Data Retention</h2><p>Session data is retained for 7 days or until you disconnect your account. You can revoke access at any time by clicking "Disconnect" in the dashboard.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900 mb-2">6. Third-Party Services</h2><p>This application integrates with <strong>TikTok Shop Open Platform</strong> and <strong>Shopee Open Platform</strong> — each subject to their own privacy policies.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900 mb-2">7. Your Rights</h2><p>You may request deletion of stored session data by logging out or contacting us. You may also revoke OAuth access directly from TikTok or Shopee settings.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900 mb-2">8. Contact</h2><p>For privacy concerns, contact us at the email address listed in your TikTok or Shopee app registration.</p></section>
        </div>
      </div>
    </div>
  );
}
