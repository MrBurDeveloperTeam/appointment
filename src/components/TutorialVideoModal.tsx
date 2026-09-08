import React, { useEffect } from 'react';
import { X, PlayCircle } from 'lucide-react';

interface TutorialVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TutorialVideoModal: React.FC<TutorialVideoModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="appointment-tutorial-title"
    >
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 id="appointment-tutorial-title" className="font-bold text-lg text-slate-800 flex items-center gap-2">
          <PlayCircle style={{ color: 'var(--primary)' }} size={20} />
            Snabbb Appointment Tutorial
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close appointment tutorial"
            className="p-2 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="bg-black">
          <video
            className="w-full aspect-video"
            src="https://opdotszsldcgwjqtvgul.supabase.co/storage/v1/object/public/video/appointment-tutorial/Appointment%20tutorial%20.mp4"
            controls
            autoPlay
            playsInline
          >
            Sorry, your browser doesn't support embedded videos.
          </video>
        </div>

        <div className="p-4 flex justify-end bg-slate-50/50 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary"
          >
            Got it, let's go
          </button>
        </div>
      </div>
    </div>
  );
};

export default TutorialVideoModal;
