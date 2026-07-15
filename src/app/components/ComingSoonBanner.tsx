import { Construction } from 'lucide-react';

export default function ComingSoonBanner({ label = 'Em breve' }: { label?: string }) {
  return (
    <div className="mx-6 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
      <Construction className="w-5 h-5 text-amber-600 flex-shrink-0" />
      <p className="text-sm text-amber-800">
        <span className="font-semibold">{label}</span> — esta funcionalidade ainda está em desenvolvimento.
      </p>
    </div>
  );
}
