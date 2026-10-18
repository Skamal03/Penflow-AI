import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import privacyText from '../content/legal/privacy.md?raw';
import termsText from '../content/legal/terms.md?raw';
import cookiesText from '../content/legal/cookies.md?raw';
import refundsText from '../content/legal/refunds.md?raw';
import acceptableUseText from '../content/legal/acceptable-use.md?raw';

const content: Record<string, { title: string; text: string }> = {
  privacy: { title: 'Privacy Policy', text: privacyText },
  terms: { title: 'Terms and Conditions', text: termsText },
  cookies: { title: 'Cookie Policy', text: cookiesText },
  refunds: { title: 'Refund and Cancellation Policy', text: refundsText },
  'acceptable-use': { title: 'Acceptable Use Policy', text: acceptableUseText },
};

function isPlaceholder(value: string): boolean {
  return (/[A-Z]/.test(value) && !/^[A-Z][a-z]+(?: [A-Z][a-z]+)*$/.test(value)) || /\d/.test(value);
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\])/g;
  return text.split(pattern).filter(Boolean).map((piece, index) => {
    const key = `${keyPrefix}-${index}`;
    const linkMatch = piece.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      return href.startsWith('/')
        ? <Link key={key} to={href}>{renderInline(label, key)}</Link>
        : <a key={key} href={href} rel="noreferrer">{renderInline(label, key)}</a>;
    }
    if (piece.startsWith('**') && piece.endsWith('**')) return <strong key={key}>{renderInline(piece.slice(2, -2), key)}</strong>;
    if (piece.startsWith('`') && piece.endsWith('`')) return <code key={key}>{piece.slice(1, -1)}</code>;
    if (piece.startsWith('[') && piece.endsWith(']') && isPlaceholder(piece.slice(1, -1))) {
      return <span className="placeholder-chip" key={key}>{piece}</span>;
    }
    return piece;
  });
}

function renderTable(lines: string[], key: string): ReactNode {
  const rows = lines.map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  const header = rows[0] ?? [];
  const body = rows.slice(1).filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)));
  return <div className="table-wrap" key={key}><table className="data-table"><thead><tr>{header.map((cell, index) => <th scope="col" key={`${key}-h-${index}`}>{renderInline(cell, `${key}-h-${index}`)}</th>)}</tr></thead><tbody>{body.map((row, rowIndex) => <tr key={`${key}-r-${rowIndex}`}>{row.map((cell, index) => <td data-label={header[index] ?? ''} key={`${key}-c-${rowIndex}-${index}`}>{renderInline(cell, `${key}-c-${rowIndex}-${index}`)}</td>)}</tr>)}</tbody></table></div>;
}

export function renderLegalMarkdown(source: string): ReactNode[] {
  const lines = source.split(/\r?\n/);
  const output: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line || line === '---') { index += 1; continue; }
    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) tableLines.push(lines[index++].trim());
      output.push(renderTable(tableLines, `table-${index}`));
      continue;
    }
    if (/^#{2,3} /.test(line)) {
      output.push(<h2 key={`heading-${index}`}>{renderInline(line.replace(/^#{2,3} /, ''), `heading-${index}`)}</h2>);
      index += 1;
      continue;
    }
    if (line.startsWith('> ')) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) quote.push(lines[index++].trim().replace(/^> ?/, ''));
      output.push(<blockquote key={`quote-${index}`}>{quote.map((part, quoteIndex) => <p key={quoteIndex}>{renderInline(part, `quote-${index}-${quoteIndex}`)}</p>)}</blockquote>);
      continue;
    }
    if (/^- /.test(line) || /^\d+\. /.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: string[] = [];
      const listPattern = ordered ? /^\d+\. / : /^- /;
      while (index < lines.length && listPattern.test(lines[index].trim())) items.push(lines[index++].trim().replace(listPattern, ''));
      const Tag = ordered ? 'ol' : 'ul';
      output.push(<Tag key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `list-${index}-${itemIndex}`)}</li>)}</Tag>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(#{2,3} |\||> |\- |\d+\. |---$)/.test(lines[index].trim())) paragraph.push(lines[index++].trim());
    if (paragraph.length) output.push(<p key={`paragraph-${index}`}>{renderInline(paragraph.join(' '), `paragraph-${index}`)}</p>);
  }
  return output;
}

export function LegalPage() {
  const { slug = '' } = useParams();
  const page = content[slug];
  if (!page) return <section className="page-wrap narrow"><h1>Policy not found.</h1><Link to="/">Return to PenflowAI</Link></section>;
  return <article className="page-wrap narrow"><div className="legal-banner">Draft — pending legal review. Not legal advice.</div><div className="page-intro" style={{ marginTop: 28 }}><span className="eyebrow">LEGAL · DRAFT</span><h1>{page.title}</h1><p className="lede">This page is a draft and must be checked against the deployed service and reviewed by a qualified lawyer before publication.</p></div><div className="legal-content section-block">{renderLegalMarkdown(page.text)}<p><Link to="/legal/privacy">Read the Privacy Policy</Link> · <Link to="/legal/terms">Terms and Conditions</Link> · <Link to="/legal/acceptable-use">Acceptable Use Policy</Link></p></div></article>;
}
