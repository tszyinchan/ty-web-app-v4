export async function copyTextToClipboard(text: string): Promise<void> {
  const clipboard = navigator.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    await clipboard.writeText(text);
    return;
  }
  copyWithExecCommand(text);
}

function copyWithExecCommand(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.setAttribute(
    'style',
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0',
  );
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  const ok = document.execCommand('copy');
  textarea.remove();
  if (!ok) {
    throw new Error('Copy is not supported in this browser');
  }
}
