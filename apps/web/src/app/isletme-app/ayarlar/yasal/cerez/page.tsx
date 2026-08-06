import { LegalDocument } from '@/components/shared/LegalDocument';
import { CEREZ_CONTENT } from '@/content/legal/cerez';

export default function CerezPage() {
  return <LegalDocument title="Çerez Politikası" content={CEREZ_CONTENT} />;
}
