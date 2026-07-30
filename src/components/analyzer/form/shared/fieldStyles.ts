export function inputCls(hasError: boolean): string {
  return `field-underline${hasError ? ' field-error' : ''}`;
}

export function selectCls(hasError: boolean): string {
  return `field-underline select-underline-caret${hasError ? ' field-error' : ''}`;
}

export const textareaCls =
  'w-full bg-white/70 border border-[#e2e8f0] rounded-2xl px-4 py-3 text-[15px] text-[#143225] placeholder-[#94a3b8] resize-none focus:outline-none focus:border-[#143225] focus:shadow-[0_0_0_4px_rgba(82,194,117,0.18)] transition-all';
