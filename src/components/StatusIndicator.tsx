import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileWarning,
  Wrench,
  XCircle,
} from 'lucide-react';

export type SemanticTone = 'success' | 'warning' | 'danger' | 'neutral';

interface StatusIndicatorProps {
  label: string;
  tone: SemanticTone;
  size?: 'sm' | 'md';
}

const TONE_CLASSES: Record<SemanticTone, string> = {
  success: 'bg-[#E4EFE8] text-[#143627] border-[#C6DEC9]',
  warning: 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]',
  danger: 'bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]',
  neutral: 'bg-[var(--kl-soft)] text-[var(--kl-ink-sub)] border-[var(--kl-border)]',
};

function renderToneIcon(tone: SemanticTone, label: string) {
  const lower = label.toLowerCase();
  if (tone === 'success') return <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
  if (tone === 'danger') {
    if (lower.includes('rusak') || lower.includes('hilang')) {
      return <FileWarning className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
    }
    return <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
  }
  if (tone === 'warning') {
    if (lower.includes('ditindaklanjuti')) {
      return <Wrench className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
    }
    return <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
  }
  return <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  label,
  tone,
  size = 'sm',
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-medium whitespace-nowrap shrink-0 ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
      } ${TONE_CLASSES[tone]}`}
    >
      {renderToneIcon(tone, label)}
      <span>{label}</span>
    </span>
  );
};
