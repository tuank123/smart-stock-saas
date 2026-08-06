import { LegalDocument } from '@/components/shared/LegalDocument';
import { KVKK_CONTENT } from '@/content/legal/kvkk';

export default function KvkkPage() {
  return <LegalDocument title="KVKK Aydınlatma Metni" content={KVKK_CONTENT} />;
}
