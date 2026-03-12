'use client';

interface Props {
  onStart: () => void;
}

/**
 * Premium CTA button — animation handled externally by IntroSlide wrapper.
 */
export function IntroCTA({ onStart }: Props) {
  return (
    <button
      onClick={onStart}
      className="
        group relative overflow-hidden cursor-pointer
        rounded-[14px] bg-[#FE5C2B] px-14 py-4
        text-white font-heading font-semibold text-lg
        shadow-[0_0_40px_rgba(254,92,43,0.25),0_8px_28px_rgba(254,92,43,0.3)]
        hover:shadow-[0_0_55px_rgba(254,92,43,0.35),0_14px_36px_rgba(254,92,43,0.4)]
        hover:-translate-y-1 active:translate-y-0
        transition-all duration-300 ease-out
      "
    >
      <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <span className="relative z-10">Iniciar simulação</span>
    </button>
  );
}
