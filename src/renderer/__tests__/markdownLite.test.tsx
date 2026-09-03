import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { renderMarkdownLite } from '../utils/markdownLite';

describe('renderMarkdownLite', () => {
  it('renders a heading', () => {
    const { container } = render(<>{renderMarkdownLite('### Fixed')}</>);
    expect(container.querySelector('h4')).toHaveTextContent('Fixed');
  });

  it('groups consecutive bullets into one list', () => {
    const { container } = render(<>{renderMarkdownLite('- one\n- two')}</>);
    const lists = container.querySelectorAll('ul');
    expect(lists).toHaveLength(1);
    expect(lists[0].querySelectorAll('li')).toHaveLength(2);
  });

  it('starts a new list after a heading breaks the run of bullets', () => {
    const { container } = render(<>{renderMarkdownLite('### Added\n- one\n### Fixed\n- two')}</>);
    expect(container.querySelectorAll('h4')).toHaveLength(2);
    expect(container.querySelectorAll('ul')).toHaveLength(2);
  });

  it('renders inline bold and code spans', () => {
    const { container } = render(<>{renderMarkdownLite('- **bold** and `code`')}</>);
    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelector('code')).toHaveTextContent('code');
  });

  it('falls back to a paragraph for plain text lines', () => {
    const { container } = render(<>{renderMarkdownLite('just some text')}</>);
    expect(container.querySelector('p')).toHaveTextContent('just some text');
  });

  it('renders nothing for an empty body', () => {
    const { container } = render(<>{renderMarkdownLite('')}</>);
    expect(container.textContent).toBe('');
  });
});
