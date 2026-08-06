import { LegalDocument } from '@/components/shared/LegalDocument';
import { KULLANIM_KOSULLARI_CONTENT } from '@/content/legal/kullanim-kosullari';

export default function KullanimKosullariPage() {
  return (
    <LegalDocument title="Kullanım Koşulları" content={KULLANIM_KOSULLARI_CONTENT} />
  );
}
