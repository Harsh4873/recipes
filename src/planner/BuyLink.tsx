import { ExternalLink } from 'lucide-react';

export function BuyLink({ href }: { readonly href?: string }) {
  if (!href) return null;
  return (
    <a className="heb-button planner-buy-link" href={href} target="_blank" rel="noreferrer">
      Buy <ExternalLink aria-hidden="true" />
    </a>
  );
}
