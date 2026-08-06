'use client';

import ReactMarkdown from 'react-markdown';
import { StationPageHeader } from '@/components/layout/StationPageHeader';

// Tailwind typography (prose) eklentisi olmadan da okunabilir olması için
// markdown öğeleri elle stillendirilir.
const markdownComponents = {
  h1: (props: React.ComponentProps<'h1'>) => (
    <h1 className="mb-3 mt-6 text-xl font-bold first:mt-0" {...props} />
  ),
  h2: (props: React.ComponentProps<'h2'>) => (
    <h2 className="mb-2 mt-5 text-base font-semibold" {...props} />
  ),
  h3: (props: React.ComponentProps<'h3'>) => (
    <h3 className="mb-1.5 mt-4 text-sm font-semibold" {...props} />
  ),
  p: (props: React.ComponentProps<'p'>) => (
    <p className="mb-3 text-sm leading-relaxed text-muted-foreground" {...props} />
  ),
  ul: (props: React.ComponentProps<'ul'>) => (
    <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-muted-foreground" {...props} />
  ),
  ol: (props: React.ComponentProps<'ol'>) => (
    <ol className="mb-3 ml-5 list-decimal space-y-1 text-sm text-muted-foreground" {...props} />
  ),
  li: (props: React.ComponentProps<'li'>) => <li className="leading-relaxed" {...props} />,
  strong: (props: React.ComponentProps<'strong'>) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  em: (props: React.ComponentProps<'em'>) => <em className="italic" {...props} />,
  blockquote: (props: React.ComponentProps<'blockquote'>) => (
    <blockquote
      className="mb-3 border-l-2 border-border pl-3 text-sm italic text-muted-foreground"
      {...props}
    />
  ),
  hr: (props: React.ComponentProps<'hr'>) => <hr className="my-5 border-border" {...props} />,
  a: (props: React.ComponentProps<'a'>) => (
    <a className="text-primary underline underline-offset-2" {...props} />
  ),
};

// Yalnız stillendirilmiş markdown gövdesi (header yok) — dialog vb. yerlerde kullanılır.
export function LegalMarkdown({ content }: { content: string }) {
  return <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>;
}

export function LegalDocument({ title, content }: { title: string; content: string }) {
  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title={title} />
      <div className="pb-8">
        <LegalMarkdown content={content} />
      </div>
    </div>
  );
}
