import { LegalDocument } from '@/components/shared/LegalDocument';
import { GIZLILIK_CONTENT } from '@/content/legal/gizlilik';

export default function GizlilikPage() {
  return <LegalDocument title="Gizlilik Politikası" content={GIZLILIK_CONTENT} />;
}
