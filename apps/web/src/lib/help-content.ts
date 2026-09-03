import {
  LayoutDashboard,
  Store,
  Wallet,
  Camera,
  ShoppingCart,
  MessageSquare,
  BarChart3,
  Search,
  Settings,
  type LucideIcon,
} from 'lucide-react';

/**
 * isletme-app/* (tek şubeli PATRON) için "Kullanım Asistanı" içeriği.
 *
 * Statik veri — ayrı dosyada tutuluyor ki ileride kolayca genişletilebilsin/
 * çevrilebilsin, bileşenlerin (OnboardingTour, HelpCenter) kendisi HİÇ
 * değişmeden içerik güncellenebilsin.
 *
 * Faz 1 kapsamı: yalnızca isletme-app/* (bkz. görev). mudur/gorevli/depo ve
 * web tarafı ayrı fazlarda ele alınacak.
 */

// ── Onboarding turu ──────────────────────────────────────────────────────────

export interface OnboardingStep {
  icon: LucideIcon;
  title: string;
  description: string;
}

// isletme-app/dashboard/page.tsx'teki 8 menü kutusuyla birebir aynı sırada +
// başta bir "Hoş Geldin" adımı — toplam 9 adım (dashboard/page.tsx'teki
// `actions` dizisiyle senkron tutulmalı, biri değişirse diğeri de güncellenmeli).
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    icon: LayoutDashboard,
    title: 'StokPilot\'a Hoş Geldiniz',
    description:
      'Ana ekranınız burası — işletmenizin günlük işlerini buradaki kutucuklardan tek dokunuşla yönetirsiniz. Kısaca neler yapabileceğinizi gösterelim.',
  },
  {
    icon: Store,
    title: 'Geçici Kasa',
    description:
      'Şifrenizle kilidi açıp barkod okutarak veya ürün arayarak hızlıca satış yapın. İşlem tamamlanınca müşteriye SMS ile fiş gönderebilirsiniz.',
  },
  {
    icon: Wallet,
    title: 'Alacak Verecek Listeleri',
    description:
      'Tedarikçilere olan borçlarınızı ve tedarikçilerden alacaklarınızı tek yerden takip edin; ödeme veya ürün teslimi kaydedin.',
  },
  {
    icon: Camera,
    title: 'Fatura Tarama',
    description:
      'Gelen faturanın fotoğrafını çekin ya da PDF yükleyin — sistem ürünleri, miktarları ve tutarı otomatik okur, siz onaylarsınız.',
  },
  {
    icon: ShoppingCart,
    title: 'Sipariş Önerileri',
    description:
      'Stoğu azalan ürünler için sistem otomatik taslak sipariş oluşturur. Önerileri inceleyip onaylayın, düzenleyin ya da iptal edin.',
  },
  {
    icon: MessageSquare,
    title: 'WhatsApp Fiyat Güncelleme',
    description:
      'Tedarikçilerinizin WhatsApp üzerinden gönderdiği güncel fiyat listelerini burada onaylayarak ürün fiyatlarınıza otomatik yansıtın.',
  },
  {
    icon: BarChart3,
    title: 'Günlük Rapor',
    description:
      'Geçici Kasa\'dan yapılan satışların günlük özetini — hangi üründen kaç adet satıldığını ve toplam ciroyu — burada görürsünüz.',
  },
  {
    icon: Search,
    title: 'Stok Sorgulama',
    description:
      'Bir ürünün adını yazmaya başlayın, güncel stok miktarını anında görün — sayım yapmadan hızlı kontrol için idealdir.',
  },
  {
    icon: Settings,
    title: 'Ayarlar',
    description:
      'İşletme ve şube bilgileriniz, hesabınız, bildirim tercihleriniz ve geri bildirim gönderme burada. Sağ alttaki "?" butonundan da her zaman yardım alabilirsiniz.',
  },
];

// ── Sık Sorulan Sorular ───────────────────────────────────────────────────────

export interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  // Geçici Kasa
  {
    id: 'kasa-satis',
    category: 'Geçici Kasa',
    question: 'Geçici Kasa\'dan nasıl satış yaparım?',
    answer:
      'Geçici Kasa\'ya girip şifrenizle kilidi açın. Barkod okutarak ya da ürün arayarak sepete ekleyin, ödeme yöntemini (Nakit/Kart) seçip satışı tamamlayın.',
  },
  {
    id: 'kasa-sifre',
    category: 'Geçici Kasa',
    question: 'Geçici Kasa\'yı açmak için neden şifre isteniyor?',
    answer:
      'Kasa oturumu güvenlik için şifreyle korunur. Oturum yalnızca "Geri" ile ana menüye çıktığınızda kapanır — İşlem Geçmişi\'ne gidip gelmek oturumu kapatmaz.',
  },
  {
    id: 'kasa-sms',
    category: 'Geçici Kasa',
    question: 'Müşteriye fiş nasıl gönderilir?',
    answer:
      'Satış sırasında müşteri telefon numarasını girerseniz, işlem tamamlandığında fiş otomatik olarak SMS ile gönderilir.',
  },
  {
    id: 'kasa-gecmis',
    category: 'Geçici Kasa',
    question: 'Geçmiş kasa oturumlarımı nerede görürüm?',
    answer:
      'Geçici Kasa ekranındaki "İşlem Geçmişi" bağlantısından önceki tüm kasa oturumlarını ve toplam tutarlarını görebilirsiniz.',
  },
  // Alacak Verecek
  {
    id: 'borc-odeme',
    category: 'Alacak Verecek',
    question: 'Borç ödemesi nasıl kaydedilir?',
    answer:
      'Alacak Verecek listesinden ilgili kaydı açın. Nakit borçlarda "Ödeme Kaydet", ürün borçlarında "Teslim Alındı" butonuyla kısmi ya da tam kapamayı işleyin.',
  },
  {
    id: 'borc-yeni',
    category: 'Alacak Verecek',
    question: 'Yeni bir borç/alacak kaydı nasıl oluşturulur?',
    answer:
      'Alacak Verecek ekranında sağ üstteki "Yeni Kayıt"a dokunun; yönünü (işletme mi borçlu, tedarikçi mi) ve türünü (nakit tutar veya ürün) seçip kaydedin.',
  },
  {
    id: 'borc-yon',
    category: 'Alacak Verecek',
    question: '"İşletme Tedarikçiye Borçlu" ile "Tedarikçi İşletmeye Borçlu" farkı nedir?',
    answer:
      'İlki tedarikçiye ödemeniz gereken borcu, ikincisi tedarikçinin size (örn. iade veya fazla ödeme sonucu) borçlu olduğu alacağı gösterir.',
  },
  // Fatura Tarama
  {
    id: 'fatura-tarama',
    category: 'Fatura Tarama',
    question: 'Bir faturayı nasıl tararım?',
    answer:
      'Fatura Tarama ekranından fotoğraf çekin veya PDF yükleyin. Sistem OCR ile ürünleri, miktarları ve tutarı otomatik okur; onaylamadan önce düzenleyebilirsiniz.',
  },
  {
    id: 'fatura-ocr-hata',
    category: 'Fatura Tarama',
    question: 'OCR faturayı yanlış okursa ne yapmalıyım?',
    answer:
      'Onaylamadan önce çıkarılan ürün, miktar ve tutar bilgilerini elle düzeltebilirsiniz. Onayladıktan sonra stok ve borç kayıtları buna göre güncellenir.',
  },
  // Sipariş Önerileri
  {
    id: 'siparis-nereden',
    category: 'Sipariş Önerileri',
    question: 'Sipariş önerileri nereden geliyor?',
    answer:
      'Stok seviyesi belirlenen eşiğin altına düşen ürünler için sistem otomatik taslak sipariş oluşturur. "Eşik Kontrolü Yap" ile bunu istediğiniz zaman manuel de tetikleyebilirsiniz.',
  },
  {
    id: 'siparis-onay',
    category: 'Sipariş Önerileri',
    question: 'Taslak bir siparişi nasıl onaylarım?',
    answer:
      'İlgili kartta "Onayla" ile siparişi kesinleştirebilir, "Düzenle" ile miktarları değiştirebilir ya da "İptal" ile taslağı silebilirsiniz.',
  },
  // WhatsApp Fiyat Güncelleme
  {
    id: 'whatsapp-nereden',
    category: 'WhatsApp Fiyat Güncelleme',
    question: 'Tedarikçiden gelen fiyat listesi nereye düşer?',
    answer:
      'Tedarikçiniz WhatsApp portalı üzerinden fiyat listesi gönderdiğinde, WhatsApp Fiyat Güncelleme ekranında onay bekleyen bir kayıt olarak görünür.',
  },
  {
    id: 'whatsapp-onay',
    category: 'WhatsApp Fiyat Güncelleme',
    question: 'Fiyat güncellemesini nasıl onaylarım veya reddederim?',
    answer:
      'Kartın üzerindeki "Onayla" ya da "Reddet" butonlarını kullanın. Onaylanan fiyatlar ilgili ürün kartlarına otomatik olarak işlenir.',
  },
  // Günlük Rapor
  {
    id: 'rapor-ne-gosterir',
    category: 'Günlük Rapor',
    question: 'Günlük Rapor neyi gösterir?',
    answer:
      'Geçici Kasa\'dan yapılan satışların o güne (ve geçmiş günlere) ait ürün bazlı satış adedi ve ciro özetini gösterir.',
  },
  {
    id: 'rapor-kapanis-saati',
    category: 'Günlük Rapor',
    question: 'Günün başlangıç/bitiş saati nasıl değişir?',
    answer:
      'Ayarlar > Rapor Ayarları\'ndaki "Kapanış Saati" alanından iş gününüzün hangi saatte bittiğini belirleyebilirsiniz.',
  },
  // Stok Sorgulama
  {
    id: 'stok-sorgu',
    category: 'Stok Sorgulama',
    question: 'Bir ürünün stok miktarını nasıl öğrenirim?',
    answer:
      'Stok Sorgulama ekranına ürün adının en az 2 harfini yazın. Eşleşen ürünler listelenir, birine dokununca güncel stok miktarını görürsünüz.',
  },
  // Ayarlar / Genel
  {
    id: 'ayarlar-sifre',
    category: 'Ayarlar',
    question: 'Şifremi nasıl değiştiririm?',
    answer: 'Ayarlar > Hesap Bilgileri\'nden mevcut şifrenizi girip yeni şifrenizi belirleyebilirsiniz.',
  },
  {
    id: 'ayarlar-bildirim',
    category: 'Ayarlar',
    question: 'Alacak Verecek hatırlatmalarını nasıl kapatırım?',
    answer:
      'Ayarlar > Bildirim Tercihleri\'nden "Alacak Verecek Hatırlatmaları" anahtarını kapatabilirsiniz.',
  },
  {
    id: 'ayarlar-geri-bildirim',
    category: 'Ayarlar',
    question: 'Bir öneri ya da şikayetimi nasıl iletirim?',
    answer: 'Ayarlar > Geri Bildirim ekranından konu ve mesajınızı yazıp doğrudan bize gönderebilirsiniz.',
  },
];
