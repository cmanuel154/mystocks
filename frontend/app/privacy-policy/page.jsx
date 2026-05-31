import Link from 'next/link';

export const dynamic = 'force-static';
export const metadata = {
  title: 'Kebijakan Privasi — MyStocks',
  description: 'Kebijakan Privasi platform manajemen toko MyStocks untuk internal Gem Beauty.',
};

const SECTIONS = [
  { id: 'pendahuluan',     label: '1. Pendahuluan' },
  { id: 'ruang-lingkup',  label: '2. Ruang Lingkup Penggunaan' },
  { id: 'data-dikumpulkan', label: '3. Data yang Kami Kumpulkan' },
  { id: 'penggunaan-data', label: '4. Bagaimana Kami Menggunakan Data' },
  { id: 'integrasi',       label: '5. Integrasi Platform Pihak Ketiga' },
  { id: 'penyimpanan',     label: '6. Penyimpanan & Keamanan Data' },
  { id: 'hak-pengguna',    label: '7. Hak Pengguna' },
  { id: 'kontak',          label: '8. Kontak' },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">

      {/* Top bar */}
      <div className="border-b border-gray-100 bg-white sticky top-0 z-10 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
            <img src="/MyStocks.png" alt="MyStocks" className="h-8 w-8 object-contain" />
            <span className="text-base font-bold text-gray-900 tracking-tight">MyStocks</span>
          </Link>
          <span className="ml-auto text-xs text-gray-400 hidden sm:block">Internal Tool · Gem Beauty</span>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10 lg:py-14">
        <div className="lg:flex lg:gap-12">

          {/* Sidebar TOC — desktop */}
          <aside className="hidden lg:block w-56 shrink-0">
            <div className="sticky top-20">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">Daftar Isi</p>
              <nav className="space-y-1">
                {SECTIONS.map(s => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="block rounded-lg px-2.5 py-1.5 text-sm text-gray-500 transition hover:bg-gray-50 hover:text-[#0026CC]"
                  >
                    {s.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">

            {/* Page header */}
            <div className="mb-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#0026CC]/20 bg-[#0026CC]/5 px-3 py-1 text-xs font-medium text-[#0026CC] mb-4">
                Dokumen Resmi · Internal
              </div>
              <h1 className="text-3xl font-extrabold text-gray-900 leading-tight">
                Kebijakan Privasi
              </h1>
              <p className="mt-1 text-lg text-gray-400 font-light">Privacy Policy</p>
              <p className="mt-3 text-sm text-gray-400">Terakhir diperbarui: <strong className="text-gray-600">20 Mei 2026</strong></p>
            </div>

            {/* Mobile TOC */}
            <div className="lg:hidden mb-8 rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">Daftar Isi</p>
              <nav className="space-y-1">
                {SECTIONS.map(s => (
                  <a key={s.id} href={`#${s.id}`} className="block text-sm text-[#0026CC] hover:underline py-0.5">
                    {s.label}
                  </a>
                ))}
              </nav>
            </div>

            {/* Sections */}
            <div className="space-y-10 text-gray-700">

              <section id="pendahuluan">
                <SectionHeading number="1" title="Pendahuluan" />
                <ul className="mt-3 space-y-2 text-sm leading-relaxed">
                  <li className="flex gap-2"><Bullet /><span>MyStocks adalah platform manajemen toko marketplace yang dikembangkan khusus untuk kebutuhan internal <strong>Gem Beauty</strong>.</span></li>
                  <li className="flex gap-2"><Bullet /><span>Platform ini membantu tim Gem Beauty mengelola stok produk dan manajemen pesanan dari <strong>Shopee</strong> dan <strong>TikTok Shop</strong>.</span></li>
                  <li className="flex gap-2"><Bullet /><span>Penggunaan platform bersifat internal dan terbatas untuk anggota tim Gem Beauty yang berwenang.</span></li>
                  <li className="flex gap-2"><Bullet /><span>Kami berkomitmen melindungi privasi dan keamanan data yang dikelola melalui platform ini.</span></li>
                </ul>
              </section>

              <Divider />

              <section id="ruang-lingkup">
                <SectionHeading number="2" title="Ruang Lingkup Penggunaan" />
                <ul className="mt-3 space-y-2 text-sm leading-relaxed">
                  <li className="flex gap-2"><Bullet /><span>MyStocks dikembangkan dan digunakan secara eksklusif untuk operasional internal Gem Beauty.</span></li>
                  <li className="flex gap-2"><Bullet /><span>Platform ini <strong>tidak tersedia untuk publik umum</strong> atau pihak ketiga di luar tim Gem Beauty.</span></li>
                  <li className="flex gap-2"><Bullet /><span>Akses hanya diberikan kepada anggota tim Gem Beauty yang telah mendapat otorisasi dari manajemen.</span></li>
                </ul>
              </section>

              <Divider />

              <section id="data-dikumpulkan">
                <SectionHeading number="3" title="Data yang Kami Kumpulkan" />
                <p className="mt-3 text-sm text-gray-500">Melalui integrasi OAuth resmi dengan Shopee dan TikTok Shop, platform mengakses data berikut:</p>
                <div className="mt-4 rounded-2xl border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-700 text-xs">Kategori Data</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-700 text-xs">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      <DataRow category="Informasi Akun Toko" detail="Nama toko, Shop ID dari Shopee & TikTok" />
                      <DataRow category="Data Pesanan" detail="Order ID, status, jumlah, produk yang dipesan" />
                      <DataRow category="Data Produk" detail="Nama produk, SKU, harga, jumlah stok" />
                      <DataRow category="Data Keuangan" detail="Revenue summary, transaction summary" />
                      <DataRow category="Token Autentikasi" detail="Access token & refresh token OAuth — disimpan terenkripsi" />
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-gray-400">Kami <strong>tidak</strong> mengumpulkan data personal pembeli atau informasi pembayaran di luar yang disediakan API marketplace.</p>
              </section>

              <Divider />

              <section id="penggunaan-data">
                <SectionHeading number="4" title="Bagaimana Kami Menggunakan Data" />
                <ul className="mt-3 space-y-2 text-sm leading-relaxed">
                  <li className="flex gap-2"><Bullet /><span>Membantu tim Gem Beauty <strong>memantau dan mengelola stok produk</strong> secara real-time.</span></li>
                  <li className="flex gap-2"><Bullet /><span>Membantu tim Gem Beauty <strong>mengelola dan memproses pesanan</strong> dari Shopee dan TikTok Shop dalam satu dashboard.</span></li>
                  <li className="flex gap-2"><Bullet /><span>Sinkronisasi data stok antara Google Sheets dan Shopee secara otomatis.</span></li>
                  <li className="flex gap-2"><Bullet className="text-red-400" /><span>Data <strong>tidak dijual</strong> atau dibagikan ke pihak ketiga mana pun.</span></li>
                  <li className="flex gap-2"><Bullet className="text-red-400" /><span>Data <strong>tidak digunakan</strong> untuk keperluan iklan atau pemasaran.</span></li>
                </ul>
              </section>

              <Divider />

              <section id="integrasi">
                <SectionHeading number="5" title="Integrasi Platform Pihak Ketiga" />
                <p className="mt-3 text-sm text-gray-500">MyStocks terhubung dengan layanan berikut. Data hanya diakses atas izin eksplisit melalui OAuth.</p>
                <div className="mt-4 space-y-3">
                  <IntegrationCard
                    name="Shopee Open Platform API"
                    desc="Untuk mengakses dan mengelola data toko Gem Beauty di Shopee, termasuk pesanan, produk, dan stok."
                    badge="OAuth 2.0"
                    badgeColor="bg-[#ee4d2d]/10 text-[#ee4d2d]"
                  />
                  <IntegrationCard
                    name="TikTok Shop Open Platform API"
                    desc="Untuk mengakses data toko Gem Beauty di TikTok Shop, termasuk inventaris dan status pesanan."
                    badge="OAuth 2.0"
                    badgeColor="bg-gray-100 text-gray-600"
                  />
                  <IntegrationCard
                    name="Google Sheets API"
                    desc="Untuk sinkronisasi data stok internal dari spreadsheet operasional Gem Beauty."
                    badge="CSV Export"
                    badgeColor="bg-green-50 text-green-700"
                  />
                  <IntegrationCard
                    name="Firebase / Firestore"
                    desc="Untuk penyimpanan data terenkripsi — token OAuth, sesi pengguna, dan data sinkronisasi."
                    badge="Google Cloud"
                    badgeColor="bg-[#0026CC]/8 text-[#0026CC]"
                  />
                </div>
              </section>

              <Divider />

              <section id="penyimpanan">
                <SectionHeading number="6" title="Penyimpanan & Keamanan Data" />
                <ul className="mt-3 space-y-2 text-sm leading-relaxed">
                  <li className="flex gap-2"><Bullet /><span>Data disimpan di <strong>Google Cloud</strong> menggunakan Firebase Firestore, region <code className="text-xs bg-gray-100 rounded px-1 py-0.5">asia-southeast2</code> (Singapura).</span></li>
                  <li className="flex gap-2"><Bullet /><span>Token OAuth disimpan secara aman di server — <strong>tidak pernah disimpan di browser atau dibagikan</strong>.</span></li>
                  <li className="flex gap-2"><Bullet /><span>Akses ke data dibatasi hanya untuk anggota tim Gem Beauty yang berwenang.</span></li>
                  <li className="flex gap-2"><Bullet /><span>Koneksi ke semua layanan menggunakan <strong>HTTPS terenkripsi</strong>.</span></li>
                </ul>
              </section>

              <Divider />

              <section id="hak-pengguna">
                <SectionHeading number="7" title="Hak Pengguna" />
                <ul className="mt-3 space-y-2 text-sm leading-relaxed">
                  <li className="flex gap-2"><Bullet /><span>Akses OAuth dapat <strong>dicabut kapan saja</strong> melalui pengaturan akun Shopee atau TikTok Shop.</span></li>
                  <li className="flex gap-2"><Bullet /><span>Dapat meminta <strong>penghapusan data</strong> dengan menghubungi tim pengembang melalui email di bawah.</span></li>
                  <li className="flex gap-2"><Bullet /><span>Tim Gem Beauty memiliki <strong>kontrol penuh</strong> atas data toko mereka dan dapat meminta laporan penggunaan data kapan saja.</span></li>
                </ul>
              </section>

              <Divider />

              <section id="kontak">
                <SectionHeading number="8" title="Kontak" />
                <p className="mt-3 text-sm text-gray-500">Untuk pertanyaan terkait kebijakan privasi ini atau permintaan penghapusan data, hubungi kami:</p>
                <div className="mt-4 rounded-2xl border border-[#0026CC]/15 bg-[#0026CC]/3 p-5 space-y-3">
                  <ContactRow icon="✉" label="Email" value="cmanuel154@gmail.com" href="mailto:cmanuel154@gmail.com" />
                  <ContactRow icon="🌐" label="Website" value="mystocks-dashboard.vercel.app" href="https://mystocks-dashboard.vercel.app" />
                </div>
              </section>

            </div>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-gray-50 mt-10">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-1 px-4 py-6 text-center sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <img src="/MyStocks.png" alt="MyStocks" className="h-5 w-5 object-contain opacity-70" />
            <span className="text-sm text-gray-500">© 2026 MyStocks</span>
          </div>
          <span className="text-sm text-gray-400">Internal Tool for <strong className="text-gray-500">Gem Beauty</strong></span>
        </div>
      </footer>

    </div>
  );
}

function SectionHeading({ number, title }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0026CC] text-xs font-bold text-white">
        {number}
      </span>
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
    </div>
  );
}

function Bullet({ className = 'text-[#0026CC]' }) {
  return (
    <span className={`mt-1.5 flex h-3 w-3 shrink-0 items-center justify-center ${className}`}>
      <svg viewBox="0 0 6 6" fill="currentColor" className="h-1.5 w-1.5">
        <circle cx="3" cy="3" r="3" />
      </svg>
    </span>
  );
}

function Divider() {
  return <hr className="border-gray-100" />;
}

function DataRow({ category, detail }) {
  return (
    <tr>
      <td className="px-4 py-2.5 text-sm font-medium text-gray-800 align-top whitespace-nowrap">{category}</td>
      <td className="px-4 py-2.5 text-sm text-gray-500">{detail}</td>
    </tr>
  );
}

function IntegrationCard({ name, desc, badge, badgeColor }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold text-gray-800">{name}</p>
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeColor}`}>{badge}</span>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function ContactRow({ icon, label, value, href }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-base">{icon}</span>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-14">{label}</span>
        <a href={href} className="text-sm text-[#0026CC] hover:underline font-medium">{value}</a>
      </div>
    </div>
  );
}
